import { exec, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { Logger } from './logger';
import { AudioPreprocessor } from './audioPreprocessor';

export class AudioConverter {
  private logger: Logger;
  private ffmpegPath: string;

  private audioPreprocessor: AudioPreprocessor;

  constructor(logger: Logger) {
    this.logger = logger;
    this.ffmpegPath = this.getFfmpegPath();
    this.audioPreprocessor = new AudioPreprocessor(logger);
  }

  /**
   * Quick analysis — determine if audio needs preprocessing.
   * Returns true if audio is clean enough to skip the full pipeline.
   */
  needsProcessing(audioBuffer: Buffer): { needed: boolean; reason: string } {
    return this.audioPreprocessor.needsProcessing(audioBuffer);
  }

  private getFfmpegPath(): string {
    try {
      const ffmpegStatic = require('ffmpeg-static');
      if (ffmpegStatic && typeof ffmpegStatic === 'string') {
        // In packaged ASAR, the path points inside asar which can't be spawned.
        // Electron's asarUnpack extracts to app.asar.unpacked/ — fix the path.
        const unpacked = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
        if (fs.existsSync(unpacked)) return unpacked;
        return ffmpegStatic;
      }
    } catch {}

    this.logger.warn('ffmpeg-static not found, trying system ffmpeg');
    return 'ffmpeg';
  }

  async convertToWav(inputPath: string): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    const outputPath = inputPath.replace(/\.[^.]+$/, '.wav');

    return new Promise((resolve) => {
      // Fastest ffmpeg args for webm to wav conversion
      const args = [
        '-i', inputPath,
        '-ar', '16000',
        '-ac', '1',
        '-sample_fmt', 's16',
        '-threads', '0',
        '-acodec', 'pcm_s16le', // Direct PCM encoding (faster)
        '-y',
        outputPath,
      ];

      this.logger.info('Converting audio...');

      const ffmpeg = spawn(this.ffmpegPath, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          this.logger.error('ffmpeg conversion failed', { code });
          resolve({ success: false, error: `Audio conversion failed (code ${code})` });
          return;
        }

        if (!fs.existsSync(outputPath)) {
          resolve({ success: false, error: 'Output audio file was not created' });
          return;
        }

        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
          try { fs.unlinkSync(outputPath); } catch {}
          resolve({ success: false, error: 'Converted audio file is empty' });
          return;
        }

        this.logger.info('Audio converted', { size: stats.size });
        resolve({ success: true, outputPath });
      });

      ffmpeg.on('error', (error) => {
        this.logger.error('ffmpeg process error', error);
        resolve({ success: false, error: `Audio conversion failed: ${error.message}` });
      });
    });
  }

  cleanup(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {}
  }

  cleanupMultiple(filePaths: string[]): void {
    for (const filePath of filePaths) {
      this.cleanup(filePath);
    }
  }
}
