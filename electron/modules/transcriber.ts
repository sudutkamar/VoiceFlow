import { exec, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app, BrowserWindow } from 'electron';
import { Logger } from './logger';
import { AudioPreprocessor } from './audioPreprocessor';
import { FuzzyMatcher, DictionaryEntry } from './fuzzyMatcher';
import { ConfidenceScorer, ConfidenceResult } from './confidenceScorer';

export interface TranscribeResult {
  success: boolean;
  text?: string;
  rawText?: string;
  confidence?: ConfidenceResult;
  fuzzyChanges?: number;
  error?: string;
}

export class Transcriber {
  private logger: Logger;
  private whisperPath: string;
  private modelsPath: string;
  private mainWindow: BrowserWindow | null = null;
  private sendToAllFn: ((channel: string, ...args: any[]) => void) | null = null;
  private currentProcess: any = null;
  private audioPreprocessor: AudioPreprocessor;
  private fuzzyMatcher: FuzzyMatcher;
  private confidenceScorer: ConfidenceScorer;

  constructor(logger: Logger) {
    this.logger = logger;
    this.whisperPath = this.getWhisperPath();
    this.modelsPath = this.getModelsPath();
    this.audioPreprocessor = new AudioPreprocessor(logger);
    this.fuzzyMatcher = new FuzzyMatcher(logger);
    this.confidenceScorer = new ConfidenceScorer(logger);
  }

  private getWhisperPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'whisper', 'whisper-cli.exe');
    }
    return path.join(__dirname, '..', '..', 'resources', 'whisper', 'whisper-cli.exe');
  }

  private getModelsPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'whisper', 'models');
    }
    return path.join(__dirname, '..', '..', 'resources', 'whisper', 'models');
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  setSendToAll(fn: (channel: string, ...args: any[]) => void): void {
    this.sendToAllFn = fn;
  }

  private sendToRenderer(channel: string, ...args: any[]): void {
    if (this.sendToAllFn) {
      this.sendToAllFn(channel, ...args);
    } else {
      this.mainWindow?.webContents.send(channel, ...args);
    }
  }

  /**
   * Load dictionary for fuzzy matching
   */
  loadDictionary(entries: DictionaryEntry[]): void {
    this.fuzzyMatcher.loadDictionary(entries);
    this.logger.info('Dictionary loaded into transcriber', { count: entries.length });
  }

  async transcribe(
    audioPath: string,
    model: string = 'ggml-base.bin',
    language: string = 'auto',
    options: {
      preprocess?: boolean;
      fuzzyMatch?: boolean;
      confidenceScore?: boolean;
      audioDurationMs?: number;
    } = {}
  ): Promise<TranscribeResult> {
    const {
      preprocess = true,
      fuzzyMatch = true,
      confidenceScore = true,
      audioDurationMs,
    } = options;

    const modelPath = path.join(this.modelsPath, model);

    if (!fs.existsSync(this.whisperPath)) {
      this.logger.error('Whisper CLI not found', { path: this.whisperPath });
      return {
        success: false,
        error: 'whisper-cli.exe tidak ditemukan.\n\nSilakan download dari Settings > Models.',
      };
    }

    if (!fs.existsSync(modelPath)) {
      this.logger.error('Whisper model not found', { path: modelPath });
      return {
        success: false,
        error: `Model "${model}" belum diunduh.\n\nBuka Settings > Models untuk mengunduh model.`,
      };
    }

    if (!fs.existsSync(audioPath)) {
      this.logger.error('Audio file not found', { path: audioPath });
      return { success: false, error: 'File audio tidak ditemukan' };
    }

    // Step 1: Audio Preprocessing
    let processedAudioPath = audioPath;
    if (preprocess) {
      try {
        this.logger.info('Starting audio preprocessing...');
        const audioBuffer = fs.readFileSync(audioPath);
        const processedBuffer = await this.audioPreprocessor.process(audioBuffer);
        
        // Save processed audio to temp file
        processedAudioPath = audioPath.replace('.wav', '_processed.wav');
        fs.writeFileSync(processedAudioPath, processedBuffer);
        this.logger.info('Audio preprocessing complete', {
          original: audioBuffer.length,
          processed: processedBuffer.length,
        });
      } catch (error: any) {
        this.logger.warn('Audio preprocessing failed, using original', error);
        processedAudioPath = audioPath;
      }
    }

    const outputPath = processedAudioPath + '.txt';

    return new Promise((resolve) => {
      const args = [
        '-m', modelPath,
        '-f', processedAudioPath,
        '-otxt',
        '-pc',
        '--no-prints',
        '-t', '8',
      ];

      if (language !== 'auto') {
        args.push('-l', language);
      } else {
        args.push('-l', 'id');
      }

      this.logger.info('Starting transcription...', { model, language, preprocess, fuzzyMatch });

      const whisper = spawn(this.whisperPath, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.currentProcess = whisper;

      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { whisper.kill(); } catch {}
        this.currentProcess = null;
        this.logger.error('Whisper timed out');
        resolve({ success: false, error: 'Transcription timeout. Coba rekam lebih pendek atau gunakan model Tiny/Base.' });
      }, 30000);

      let stdout = '';
      let stderr = '';
      let partialText = '';

      whisper.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        const lines = chunk.split('\n');
        for (const line of lines) {
          const match = line.match(/\[.*?\]\s*(.*)/);
          if (match && match[1]) {
            const partial = match[1].trim();
            if (partial && partial !== partialText && partial.length > 2) {
              partialText = partial;
              this.sendToRenderer('partial-transcript', partial);
            }
          }
        }
      });

      whisper.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      whisper.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.currentProcess = null;

        // Clean up processed audio file
        if (preprocess && processedAudioPath !== audioPath) {
          try { fs.unlinkSync(processedAudioPath); } catch {}
        }

        if (code !== 0) {
          this.logger.error('Whisper exited with code', { code, stderr: stderr.slice(0, 500) });
          resolve({
            success: false,
            error: `Transcription failed (exit code ${code})`,
          });
          return;
        }

        let transcript = '';

        if (fs.existsSync(outputPath)) {
          transcript = fs.readFileSync(outputPath, 'utf-8').trim();
          try { fs.unlinkSync(outputPath); } catch {}
        }

        if (!transcript && stdout) {
          const lines = stdout.split('\n')
            .map(l => l.trim())
            .filter(l => {
              if (!l || l.length < 2) return false;
              if (l.startsWith('[') && l.includes(']') && l.match(/^\[\d{2}:\d{2}:\d{2}/)) return false;
              if (l.startsWith('whisper') || l.startsWith('main') || l.startsWith('system_info')) return false;
              if (l.startsWith('sampling') || l.startsWith('auto') || l.startsWith('detected')) return false;
              if (l.includes('ggml') || l.includes('model') || l.includes('thread')) return false;
              return true;
            });
          transcript = lines.join(' ').trim();
        }

        if (transcript) {
          transcript = transcript
            .replace(/\[BLANK_AUDIO\]/g, '')
            .replace(/\[MUSIC\]/g, '')
            .replace(/\[silence\]/g, '')
            .replace(/^\s*[\.\,]\s*/, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
        }

        if (!transcript || transcript.length < 2) {
          this.logger.warn('Empty transcription result');
          resolve({
            success: false,
            error: 'Transkripsi kosong. Coba bicara lebih jelas atau lebih lama.',
          });
          return;
        }

        const rawText = transcript;
        let finalText = transcript;
        let fuzzyChanges = 0;

        // Step 2: Fuzzy Matching
        if (fuzzyMatch) {
          try {
            const fuzzyResult = this.fuzzyMatcher.process(transcript);
            finalText = fuzzyResult.corrected;
            fuzzyChanges = fuzzyResult.changes.length;
            
            if (fuzzyChanges > 0) {
              this.logger.info('Fuzzy matching applied', {
                changes: fuzzyChanges,
                confidence: fuzzyResult.confidence,
              });
            }
          } catch (error: any) {
            this.logger.warn('Fuzzy matching failed', error);
          }
        }

        // Step 3: Confidence Scoring
        let confidenceResult: ConfidenceResult | undefined;
        if (confidenceScore) {
          try {
            confidenceResult = this.confidenceScorer.analyze(finalText, audioDurationMs);
            this.logger.info('Confidence analysis', {
              overall: confidenceResult.overallConfidence,
              quality: confidenceResult.quality,
            });
          } catch (error: any) {
            this.logger.warn('Confidence scoring failed', error);
          }
        }

        this.logger.info('Transcription complete', {
          length: finalText.length,
          rawLength: rawText.length,
          fuzzyChanges,
          confidence: confidenceResult?.overallConfidence,
        });

        resolve({
          success: true,
          text: finalText,
          rawText: rawText !== finalText ? rawText : undefined,
          confidence: confidenceResult,
          fuzzyChanges: fuzzyChanges > 0 ? fuzzyChanges : undefined,
        });
      });

      whisper.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.currentProcess = null;
        
        if (preprocess && processedAudioPath !== audioPath) {
          try { fs.unlinkSync(processedAudioPath); } catch {}
        }
        
        this.logger.error('Whisper process error', error);
        resolve({
          success: false,
          error: `Failed to start whisper: ${error.message}`,
        });
      });
    });
  }

  cancelTranscription(): void {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
  }

  getAvailableModels(): string[] {
    try {
      if (!fs.existsSync(this.modelsPath)) return [];
      return fs.readdirSync(this.modelsPath)
        .filter(f => f.endsWith('.bin'))
        .sort();
    } catch {
      return [];
    }
  }

  isWhisperAvailable(): boolean {
    return fs.existsSync(this.whisperPath);
  }

  isModelAvailable(model: string): boolean {
    return fs.existsSync(path.join(this.modelsPath, model));
  }
}
