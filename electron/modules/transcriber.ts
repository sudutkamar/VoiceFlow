import { exec, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app, BrowserWindow } from 'electron';
import { Logger } from './logger';

export interface TranscribeResult {
  success: boolean;
  text?: string;
  error?: string;
}

export class Transcriber {
  private logger: Logger;
  private whisperPath: string;
  private modelsPath: string;
  private mainWindow: BrowserWindow | null = null;
  private currentProcess: any = null;

  constructor(logger: Logger) {
    this.logger = logger;
    this.whisperPath = this.getWhisperPath();
    this.modelsPath = this.getModelsPath();
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

  async transcribe(
    audioPath: string,
    model: string = 'ggml-base.bin',
    language: string = 'auto'
  ): Promise<TranscribeResult> {
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

    const outputPath = audioPath + '.txt';

    return new Promise((resolve) => {
      // Conservative whisper.cpp args: fast, compatible, no hanging on unsupported flags.
      const args = [
        '-m', modelPath,
        '-f', audioPath,
        '-otxt',
        '-pc',
        '--no-prints',
        '-t', '8',
      ];

      // Language handling
      if (language !== 'auto') {
        args.push('-l', language);
      } else {
        // Auto-detect with Indonesian bias
        args.push('-l', 'id');
      }

      this.logger.info('Starting transcription...', { model, language });

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
      }, 20000);

      let stdout = '';
      let stderr = '';
      let partialText = '';

      whisper.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // Extract partial transcript
        const lines = chunk.split('\n');
        for (const line of lines) {
          const match = line.match(/\[.*?\]\s*(.*)/);
          if (match && match[1]) {
            const partial = match[1].trim();
            if (partial && partial !== partialText && partial.length > 2) {
              partialText = partial;
              this.mainWindow?.webContents.send('partial-transcript', partial);
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

        if (code !== 0) {
          this.logger.error('Whisper exited with code', { code, stderr: stderr.slice(0, 500) });
          resolve({
            success: false,
            error: `Transcription failed (exit code ${code})`,
          });
          return;
        }

        let transcript = '';

        // Try output file first
        if (fs.existsSync(outputPath)) {
          transcript = fs.readFileSync(outputPath, 'utf-8').trim();
          try { fs.unlinkSync(outputPath); } catch {}
        }

        // Fallback to stdout parsing
        if (!transcript && stdout) {
          const lines = stdout.split('\n')
            .map(l => l.trim())
            .filter(l => {
              if (!l || l.length < 2) return false;
              // Filter out whisper metadata
              if (l.startsWith('[') && l.includes(']') && l.match(/^\[\d{2}:\d{2}:\d{2}/)) return false;
              if (l.startsWith('whisper') || l.startsWith('main') || l.startsWith('system_info')) return false;
              if (l.startsWith('sampling') || l.startsWith('auto') || l.startsWith('detected')) return false;
              if (l.includes('ggml') || l.includes('model') || l.includes('thread')) return false;
              return true;
            });
          transcript = lines.join(' ').trim();
        }

        // Clean up transcript
        if (transcript) {
          // Remove common artifacts
          transcript = transcript
            .replace(/\[BLANK_AUDIO\]/g, '')
            .replace(/\[MUSIC\]/g, '')
            .replace(/\[silence\]/g, '')
            .replace(/^\s*[\.\,]\s*/, '')  // Remove leading punctuation
            .replace(/\s{2,}/g, ' ')       // Normalize spaces
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

        this.logger.info('Transcription complete', { length: transcript.length, text: transcript.substring(0, 50) });
        resolve({ success: true, text: transcript });
      });

      whisper.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.currentProcess = null;
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
