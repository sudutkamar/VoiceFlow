import { exec, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
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
    this.logGpuStatus();
  }

  /**
   * Check if CUDA/GPU support is available
   */
  private logGpuStatus(): void {
    try {
      const whisperDir = path.dirname(this.whisperPath);
      const cudaDllPath = path.join(whisperDir, 'ggml-cuda.dll');
      const hasGpu = fs.existsSync(cudaDllPath);
      this.logger.info(`Whisper engine: ${hasGpu ? 'GPU (CUDA)' : 'CPU only'}`, {
        whisperPath: this.whisperPath,
        hasCudaDll: hasGpu,
      });
    } catch {
      this.logger.info('Whisper engine: CPU only (detection failed)');
    }
  }

  /**
   * Check if GPU (CUDA) is available for transcription
   */
  isGpuAvailable(): boolean {
    try {
      const whisperDir = path.dirname(this.whisperPath);
      return fs.existsSync(path.join(whisperDir, 'ggml-cuda.dll'));
    } catch {
      return false;
    }
  }

  private getWhisperPath(): string {
    // Always use resources-whisper-clean (same binary for dev & production)
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'whisper', 'whisper-cli.exe');
    }
    return path.join(__dirname, '..', '..', 'resources-whisper-clean', 'whisper-cli.exe');
  }

  private getModelsPath(): string {
    // Always use resources-whisper-clean/models (same models for dev & production)
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'whisper', 'models');
    }
    return path.join(__dirname, '..', '..', 'resources-whisper-clean', 'models');
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
      initialPrompt?: string;
    } = {}
  ): Promise<TranscribeResult> {
    const {
      preprocess = true,
      fuzzyMatch = true,
      confidenceScore = true,
      audioDurationMs,
      initialPrompt,
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
        '--no-prints',
        '-t', '4',
      ];

      args.push('-l', language && language !== 'auto' ? language : 'auto');

      if (initialPrompt) {
        args.push('--prompt', initialPrompt);
      }

      this.logger.info('Starting transcription...', { model, language, preprocess, fuzzyMatch, args: args.filter(a => a !== modelPath && a !== processedAudioPath) });

      const whisper = spawn(this.whisperPath, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.currentProcess = whisper;

      let settled = false;
      const timeoutMs = Math.max(15000, Math.min(45000, (audioDurationMs || 0) * 4 + 10000));
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { whisper.kill(); } catch {}
        this.currentProcess = null;
        this.logger.error('Whisper timed out', { timeoutMs, audioDurationMs });
        resolve({ success: false, error: 'Transcription timeout. Coba rekam lebih pendek atau gunakan model yang lebih kecil.' });
      }, timeoutMs);

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

  /**
   * Fast transcription with speed-optimized arguments.
   * Uses greedy decoding (beam-size 1, best-of 1) for maximum speed.
   * Result quality is slightly lower but arrives much faster.
   */
  async transcribeFast(
    audioPath: string,
    language: string = 'auto',
    initialPrompt?: string
  ): Promise<{ success: boolean; text?: string }> {
    const modelPriority = ['ggml-base.bin', 'ggml-tiny.bin', 'ggml-small.bin'];
    let modelPath = '';
    for (const m of modelPriority) {
      const p = path.join(this.modelsPath, m);
      if (fs.existsSync(p)) { modelPath = p; break; }
    }
    if (!modelPath) return { success: false };

    return new Promise((resolve) => {
      const args = [
        '-m', modelPath,
        '-f', audioPath,
        '-otxt',
        '--no-prints',
        '--beam-size', '1',
        '--best-of', '1',
        '-t', '4',
      ];
      args.push('-l', language && language !== 'auto' ? language : 'auto');
      if (initialPrompt) args.push('--prompt', initialPrompt);

      let settled = false;
      const proc = spawn(this.whisperPath, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { proc.kill(); } catch {}
        resolve({ success: false });
      }, 8000);

      let stdout = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', () => {});

      proc.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const txtPath = audioPath + '.txt';
        let text = '';
        if (fs.existsSync(txtPath)) {
          text = fs.readFileSync(txtPath, 'utf-8').trim();
          try { fs.unlinkSync(txtPath); } catch {}
        }
        if (!text && stdout) {
          text = stdout.split('\n').map(l => l.trim()).filter(l => l && l.length > 1 && !l.startsWith('[') && !l.startsWith('whisper') && !l.includes('ggml')).join(' ').trim();
        }
        resolve({ success: !!text, text: text || undefined });
      });
      proc.on('error', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve({ success: false }); } });
    });
  }

  /**
   * Run transcription benchmark on an audio file with a specific model.
   * Returns transcription result + elapsed time.
   */
  async benchmarkModel(
    audioPath: string,
    model: string,
    language: string = 'auto',
    initialPrompt?: string
  ): Promise<{ success: boolean; text?: string; elapsedMs?: number; error?: string }> {
    const modelPath = path.join(this.modelsPath, model);
    if (!fs.existsSync(modelPath)) return { success: false, error: 'Model not found' };

    const start = Date.now();
    try {
      const result = await this.transcribe(audioPath, model, language, {
        preprocess: false,
        fuzzyMatch: false,
        confidenceScore: false,
        initialPrompt,
      });
      return { success: result.success, text: result.text, elapsedMs: Date.now() - start, error: result.error };
    } catch (err: any) {
      return { success: false, elapsedMs: Date.now() - start, error: err.message };
    }
  }
}
