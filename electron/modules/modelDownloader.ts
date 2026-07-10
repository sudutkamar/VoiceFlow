import { BrowserWindow } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';
import { Logger } from './logger';
import { VoiceFlowDatabase } from './database';

export interface ModelInfo {
  name: string;
  size: string;
  sizeBytes: number;
  url: string;
  description: string;
  isKnown: boolean; // true if in AVAILABLE_MODELS, false if custom/discovered
  downloaded?: boolean;
  fileSize?: number;
  isValid?: boolean;
  sha256?: string; // optional SHA256 hash for verification
}

// NOTE: SHA256 hashes are left as null for now.
// To generate: certUtil -hashfile <model.bin> SHA256
// Fill in after verifying against HuggingFace published hashes.
export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    name: 'ggml-tiny.bin',
    size: '75 MB',
    sizeBytes: 75000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    description: 'Tercepat, akurasi rendah',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-base.bin',
    size: '142 MB',
    sizeBytes: 142000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    description: 'Seimbang untuk daily use',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-base-q5_1.bin',
    size: '57 MB',
    sizeBytes: 57000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
    description: 'Base yang lebih kecil & cepat (quantized)',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-large-v3-turbo-q5_0.bin',
    size: '548 MB',
    sizeBytes: 548000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
    description: 'Large v3 Turbo yang lebih kecil (quantized)',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-small.bin',
    size: '466 MB',
    sizeBytes: 466000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    description: 'Lebih akurat, cocok untuk bahasa campuran',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-medium.bin',
    size: '1.5 GB',
    sizeBytes: 1500000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    description: 'Sangat akurat untuk semua bahasa',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-large-v3-turbo.bin',
    size: '1.5 GB',
    sizeBytes: 1500000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
    description: '⭐ Akurasi tinggi + cepat (recommended)',
    isKnown: true,
    sha256: undefined,
  },
  {
    name: 'ggml-large-v3.bin',
    size: '3.1 GB',
    sizeBytes: 3100000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
    description: 'Akurasi tertinggi, butuh RAM besar',
    isKnown: true,
    sha256: undefined,
  },
];

const MIN_VALID_MODEL_SIZE = 10 * 1024 * 1024;

export type DownloadState = 'idle' | 'downloading' | 'paused' | 'completed' | 'error';

export class ModelDownloader {
  private logger: Logger;
  private modelsPath: string;
  private currentDownload: { request: http.ClientRequest; stream: fs.WriteStream } | null = null;
  private downloadProgress: number = 0;
  private mainWindow: BrowserWindow | null = null;
  private customModelsPath: string | null = null;
  private cancelled: boolean = false;
  private paused: boolean = false;
  private currentTempPath: string | null = null;
  private database: VoiceFlowDatabase | null = null;
  
  // Resume support
  private currentModelUrl: string | null = null;
  private currentModelName: string | null = null;
  private downloadedBytes: number = 0;
  private totalBytes: number = 0;
  private downloadState: DownloadState = 'idle';

  // Retry config
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_BASE_DELAY_MS = 1000;

  // Speed limit (bytes per second, 0 = unlimited)
  private maxSpeedBytesPerSecond = 0;

  constructor(logger: Logger, savedModelsPath?: string | null, database?: VoiceFlowDatabase) {
    this.logger = logger;
    this.database = database || null;
    if (savedModelsPath && fs.existsSync(savedModelsPath)) {
      this.customModelsPath = savedModelsPath;
      this.modelsPath = savedModelsPath;
    } else {
      this.modelsPath = this.getModelsPath();
    }

    // Ensure models directory exists
    try {
      if (!fs.existsSync(this.modelsPath)) {
        fs.mkdirSync(this.modelsPath, { recursive: true });
      }
    } catch (err) {
      this.logger.warn('Cannot create models directory', err);
    }

    // Migrate models from old resources path (production) to new userData path
    if (app.isPackaged) {
      this.migrateOldModels();
    }

    this.cleanupInvalidFiles();
    
    // Restore interrupted download state from database
    this.restoreDownloadState();
  }

  /**
   * Set download speed limit in bytes per second (0 = unlimited).
   */
  setSpeedLimit(bytesPerSecond: number): void {
    this.maxSpeedBytesPerSecond = Math.max(0, bytesPerSecond);
    this.logger.info(`Model download speed limit set to ${this.maxSpeedBytesPerSecond} B/s`);
  }

  /**
   * Check if there is enough disk space for the download.
   */
  private async checkDiskSpace(requiredBytes: number): Promise<{ enough: boolean; freeBytes: number }> {
    try {
      const drivePath = path.parse(this.modelsPath).root || 'C:\\';
      const info = await fs.promises.statfs(drivePath);
      const freeBytes = info.bfree * info.bsize;
      const enough = freeBytes >= requiredBytes;

      if (!enough) {
        this.logger.warn(
          `Disk space check failed: need ${requiredBytes} bytes, only ${freeBytes} free on ${drivePath}`
        );
      } else {
        this.logger.info(
          `Disk space OK: ${freeBytes} bytes free, need ${requiredBytes} bytes`
        );
      }
      return { enough, freeBytes };
    } catch (err) {
      this.logger.warn('Failed to check disk space, proceeding anyway', err);
      return { enough: true, freeBytes: Infinity };
    }
  }

  /**
   * Verify SHA256 hash of a downloaded file.
   */
  private async verifySha256(filePath: string, expectedHash: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => {
          const actual = hash.digest('hex');
          const match = actual === expectedHash;
          if (!match) {
            this.logger.error(
              `SHA256 mismatch for ${path.basename(filePath)}: expected ${expectedHash}, got ${actual}`
            );
          } else {
            this.logger.info(`SHA256 verified for ${path.basename(filePath)}`);
          }
          resolve(match);
        });
        stream.on('error', (err) => {
          this.logger.error('SHA256 verification stream error', err);
          resolve(false);
        });
      } catch (err) {
        this.logger.error('SHA256 verification failed', err);
        resolve(false);
      }
    });
  }

  /**
   * Download with retry logic (exponential backoff).
   * Retries on transient network errors only.
   */
  private async downloadWithRetry(
    url: string,
    tempPath: string,
    modelName: string,
    resumeOffset: number = 0,
    attempt: number = 1
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.downloadFromUrl(url, tempPath, modelName, resumeOffset);

    // If successful or user-initiated pause/cancel, return immediately
    if (result.success) return result;
    if (result.error === 'paused' || result.error === 'cancelled') return result;

    // Don't retry on certain non-transient HTTP errors
    if (result.error && /^HTTP (4[0-4][0-9]|4[6-9][0-9]|5[0-1][0-9])$/.test(result.error)) {
      const code = parseInt(result.error.replace('HTTP ', ''), 10);
      if (code !== 408 && code !== 429 && code < 520) {
        return result;
      }
    }

    if (attempt > this.MAX_RETRIES) {
      this.logger.error(`Download failed after ${this.MAX_RETRIES} retries: ${result.error}`);
      return { success: false, error: `Download failed after ${this.MAX_RETRIES + 1} attempts: ${result.error}` };
    }

    const delay = this.RETRY_BASE_DELAY_MS * Math.pow(3, attempt - 1);
    this.logger.warn(
      `Download attempt ${attempt} failed (${result.error}), retrying in ${delay}ms... (attempt ${attempt}/${this.MAX_RETRIES + 1})`
    );

    // Update UI to show retry status
    this.sendProgressToUI(this.downloadProgress, 'downloading');

    await new Promise((resolve) => setTimeout(resolve, delay));

    // On retry, check if temp file still exists for resume
    let newOffset = 0;
    if (fs.existsSync(tempPath)) {
      try {
        newOffset = fs.statSync(tempPath).size;
      } catch {}
    }

    return this.downloadWithRetry(url, tempPath, modelName, newOffset, attempt + 1);
  }

  private migrateOldModels(): void {
    // Bundled and download paths are the same — no migration needed
  }

  private getModelsPath(): string {
    const whisperDir = app.isPackaged
      ? path.join(process.resourcesPath, 'whisper')
      : path.join(__dirname, '..', '..', 'resources', 'whisper');
    return path.join(whisperDir, 'models');
  }

  private cleanupInvalidFiles(): void {
    try {
      if (!fs.existsSync(this.modelsPath)) return;

      const files = fs.readdirSync(this.modelsPath);
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.modelsPath, file);
        try {
          const stat = fs.statSync(filePath);
          // Don't remove .tmp files - they're needed for resume after app restart
          // Only remove invalid .bin files (too small to be valid models)
          if (file.endsWith('.bin') && stat.size < MIN_VALID_MODEL_SIZE) {
            fs.unlinkSync(filePath);
            this.logger.info(`Removed invalid model: ${file} (${stat.size} bytes)`);
            cleanedCount++;
          }
        } catch (err) {
          this.logger.warn(`Failed to check file: ${file}`, err);
        }
      }

      if (cleanedCount > 0) {
        this.logger.info(`Cleaned up ${cleanedCount} invalid files`);
      }
    } catch (err) {
      this.logger.warn('Failed to cleanup invalid files', err);
    }
  }

  /**
   * Save download state to database for persistence across app restarts
   */
  private saveDownloadState(): void {
    if (!this.database) return;
    
    try {
      if (this.downloadState === 'downloading' || this.downloadState === 'paused') {
        // Save active download state
        this.database.updateSetting('download_state', this.downloadState);
        this.database.updateSetting('download_model_name', this.currentModelName || '');
        this.database.updateSetting('download_model_url', this.currentModelUrl || '');
        this.database.updateSetting('download_progress', String(this.downloadProgress));
        this.database.updateSetting('downloaded_bytes', String(this.downloadedBytes));
        this.database.updateSetting('total_bytes', String(this.totalBytes));
        this.logger.info(`Saved download state: ${this.downloadState} for ${this.currentModelName}`);
      } else {
        // Clear download state when idle/completed/error
        this.database.updateSetting('download_state', 'idle');
        this.database.updateSetting('download_model_name', '');
        this.database.updateSetting('download_model_url', '');
        this.database.updateSetting('download_progress', '0');
        this.database.updateSetting('downloaded_bytes', '0');
        this.database.updateSetting('total_bytes', '0');
      }
    } catch (err) {
      this.logger.warn('Failed to save download state', err);
    }
  }

  /**
   * Restore download state from database on app startup
   */
  private restoreDownloadState(): void {
    if (!this.database) return;
    
    try {
      const state = this.database.getSetting('download_state');
      const modelName = this.database.getSetting('download_model_name');
      const modelUrl = this.database.getSetting('download_model_url');
      const progress = this.database.getSetting('download_progress');
      const downloaded = this.database.getSetting('downloaded_bytes');
      const total = this.database.getSetting('total_bytes');
      
      if (state && state !== 'idle' && modelName && modelUrl) {
        // Check if temp file still exists
        const tempPath = path.join(this.modelsPath, modelName + '.tmp');
        if (fs.existsSync(tempPath)) {
          // Restore state - will show as paused so user can resume
          this.downloadState = 'paused';
          this.currentModelName = modelName;
          this.currentModelUrl = modelUrl;
          this.downloadProgress = parseInt(progress || '0', 10);
          this.downloadedBytes = parseInt(downloaded || '0', 10);
          this.totalBytes = parseInt(total || '0', 10);
          this.paused = true;
          
          this.logger.info(`Restored download state: ${modelName} at ${this.downloadProgress}% (${this.downloadedBytes}/${this.totalBytes} bytes)`);
          
          // Send progress to UI if window is ready
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            setTimeout(() => {
              this.sendProgressToUI(this.downloadProgress, 'paused');
            }, 500);
          }
        } else {
          // Temp file missing, clear stale state
          this.logger.info('Temp file missing, clearing stale download state');
          this.saveDownloadState();
        }
      }
    } catch (err) {
      this.logger.warn('Failed to restore download state', err);
    }
  }

  /**
   * Check if there's an interrupted download that can be resumed
   */
  hasInterruptedDownload(): boolean {
    if (!this.database) return false;
    
    const state = this.database.getSetting('download_state');
    const modelName = this.database.getSetting('download_model_name');
    
    if (state && state !== 'idle' && modelName) {
      const tempPath = path.join(this.modelsPath, modelName + '.tmp');
      return fs.existsSync(tempPath);
    }
    return false;
  }

  /**
   * Get info about interrupted download for UI display
   */
  getInterruptedDownloadInfo(): { modelName: string; progress: number } | null {
    if (!this.database) return null;
    
    const state = this.database.getSetting('download_state');
    const modelName = this.database.getSetting('download_model_name');
    const progress = this.database.getSetting('download_progress');
    
    if (state && state !== 'idle' && modelName) {
      const tempPath = path.join(this.modelsPath, modelName + '.tmp');
      if (fs.existsSync(tempPath)) {
        return {
          modelName,
          progress: parseInt(progress || '0', 10),
        };
      }
    }
    return null;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  getModelsPathValue(): string {
    return this.modelsPath;
  }

  getCustomModelsPath(): string | null {
    return this.customModelsPath;
  }

  setCustomModelsPath(newPath: string): { success: boolean; error?: string } {
    try {
      if (newPath && !fs.existsSync(newPath)) {
        fs.mkdirSync(newPath, { recursive: true });
      }
      this.customModelsPath = newPath || null;
      this.modelsPath = newPath || this.getModelsPath();
      this.logger.info(`Models path changed to: ${this.modelsPath}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error('Failed to set custom models path', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Scan the models folder for any .bin files, including ones not in AVAILABLE_MODELS.
   * Returns all .bin files found as custom ModelInfo entries.
   */
  scanModelsFolder(): ModelInfo[] {
    try {
      this.logger.info(`Scanning models folder: ${this.modelsPath}`);
      if (!fs.existsSync(this.modelsPath)) {
        this.logger.warn(`Models folder does not exist: ${this.modelsPath}`);
        return [];
      }
      const allFiles = fs.readdirSync(this.modelsPath);
      this.logger.info(`Files in models folder: ${JSON.stringify(allFiles)}`);
      const files = allFiles
        .filter(f => f.endsWith('.bin') && !f.endsWith('.tmp'))
        .filter(f => this.isValidModelFile(f));

      this.logger.info(`Valid model files found: ${files.length} (${JSON.stringify(files)})`);

      const knownNames = new Set(AVAILABLE_MODELS.map(m => m.name));
      const customModels: ModelInfo[] = [];

      for (const file of files) {
        if (!knownNames.has(file)) {
          const filePath = path.join(this.modelsPath, file);
          let sizeBytes = 0;
          try { sizeBytes = fs.statSync(filePath).size; } catch {}
          customModels.push({
            name: file,
            size: this.formatBytes(sizeBytes),
            sizeBytes,
            url: '',
            description: '📁 Custom model — terdeteksi di folder',
            isKnown: false,
          });
        }
      }

      return customModels;
    } catch (err) {
      this.logger.error('Failed to scan models folder', err);
      return [];
    }
  }

  /**
   * Get all available models (predefined + custom discovered from folder).
   */
  getAvailableModels(): ModelInfo[] {
    const known = AVAILABLE_MODELS.map(m => ({ ...m }));
    const custom = this.scanModelsFolder();
    
    // Merge: known models take precedence, add custom ones not in known list
    const knownNames = new Set(known.map(m => m.name));
    for (const c of custom) {
      if (!knownNames.has(c.name)) {
        known.push(c);
      }
    }

    // For each model, set downloaded/isValid based on actual filesystem check
    return known.map(model => ({
      ...model,
      downloaded: this.isModelDownloaded(model.name),
      fileSize: this.getModelFileSize(model.name),
      isValid: this.isValidModelFile(model.name),
    }));
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getDownloadedModels(): string[] {
    try {
      if (!fs.existsSync(this.modelsPath)) {
        fs.mkdirSync(this.modelsPath, { recursive: true });
        return [];
      }
      return fs.readdirSync(this.modelsPath)
        .filter(f => f.endsWith('.bin') && !f.endsWith('.tmp'))
        .filter(f => this.isValidModelFile(f))
        .sort();
    } catch {
      return [];
    }
  }

  private isValidModelFile(modelName: string): boolean {
    try {
      const modelPath = path.join(this.modelsPath, modelName);
      if (!fs.existsSync(modelPath)) return false;
      const stat = fs.statSync(modelPath);
      return stat.size >= MIN_VALID_MODEL_SIZE;
    } catch {
      return false;
    }
  }

  isModelDownloaded(modelName: string): boolean {
    return this.isValidModelFile(modelName);
  }

  getModelFileSize(modelName: string): number {
    try {
      const modelPath = path.join(this.modelsPath, modelName);
      if (!fs.existsSync(modelPath)) return 0;
      return fs.statSync(modelPath).size;
    } catch {
      return 0;
    }
  }

  isDownloading(): boolean {
    return this.downloadState === 'downloading';
  }

  isPaused(): boolean {
    return this.downloadState === 'paused';
  }

  getDownloadProgress(): number {
    return this.downloadProgress;
  }

  getDownloadState(): DownloadState {
    return this.downloadState;
  }

  getCurrentModelName(): string | null {
    return this.currentModelName;
  }

  getDownloadedBytes(): number {
    return this.downloadedBytes;
  }

  getTotalBytes(): number {
    return this.totalBytes;
  }

  private updateTaskbarProgress(progress: number, mode: 'normal' | 'paused' | 'error' | 'none' = 'normal'): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    
    try {
      if (mode === 'none' || progress >= 1) {
        // Reset taskbar progress
        this.mainWindow.setProgressBar(-1);
      } else if (mode === 'paused') {
        // Show paused state (yellow/indeterminate on Windows)
        // Try with mode option first, fall back to simple progress if it fails
        try {
          this.mainWindow.setProgressBar(progress, { mode: 'paused' });
        } catch {
          // Fallback for older Windows versions that don't support mode option
          this.mainWindow.setProgressBar(progress);
        }
      } else if (mode === 'error') {
        // Show error state (red on Windows)
        try {
          this.mainWindow.setProgressBar(progress, { mode: 'error' });
        } catch {
          this.mainWindow.setProgressBar(progress);
        }
      } else {
        // Normal progress
        this.mainWindow.setProgressBar(progress, { mode: 'normal' });
      }
    } catch (err) {
      this.logger.warn('Failed to update taskbar progress', err);
    }
  }

  private sendProgressToUI(progress: number, state: DownloadState | 'finalizing'): void {
    this.downloadProgress = progress;
    this.downloadState = state === 'finalizing' ? 'downloading' : state;
    
    // Send to renderer
    this.mainWindow?.webContents.send('download-progress', {
      progress,
      state,
      downloadedBytes: this.downloadedBytes,
      totalBytes: this.totalBytes,
      modelName: this.currentModelName,
    });
    
    // Update taskbar
    if (state === 'downloading' || state === 'finalizing') {
      this.updateTaskbarProgress(progress / 100, 'normal');
    } else if (state === 'paused') {
      this.updateTaskbarProgress(progress / 100, 'paused');
    } else if (state === 'completed') {
      this.updateTaskbarProgress(1, 'none');
    } else if (state === 'error' || state === 'idle') {
      this.updateTaskbarProgress(0, 'none');
    }
  }

  private cleanupTempFile(): void {
    if (this.currentTempPath) {
      try {
        if (fs.existsSync(this.currentTempPath)) {
          fs.unlinkSync(this.currentTempPath);
          this.logger.info(`Cleaned up temp file: ${this.currentTempPath}`);
        }
      } catch (err) {
        this.logger.warn(`Failed to clean temp file: ${this.currentTempPath}`, err);
      }
      this.currentTempPath = null;
    }
  }

  removeTempFile(modelName: string): void {
    const tempPath = path.join(this.modelsPath, modelName + '.tmp');
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
        this.logger.info(`Removed temp file for: ${modelName}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to remove temp file for: ${modelName}`, err);
    }
  }

  /**
   * Core download function - handles one HTTP request.
   * Supports resume via Range header, redirect following, and speed limiting.
   */
  private downloadFromUrl(
    url: string, 
    tempPath: string, 
    modelName: string, 
    resumeOffset: number = 0
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (this.cancelled) {
        resolve({ success: false, error: 'Download cancelled' });
        return;
      }

      // Open file in append mode if resuming, otherwise create new
      let file: fs.WriteStream;
      try {
        file = resumeOffset > 0 
          ? fs.createWriteStream(tempPath, { flags: 'a' })
          : fs.createWriteStream(tempPath);
      } catch (err) {
        resolve({ success: false, error: `Failed to create temp file: ${err}` });
        return;
      }
      
      this.currentDownload = { request: null as any, stream: file };
      this.currentTempPath = tempPath;

      const protocol = url.startsWith('https') ? https : http;
      
      // Build request options with Range header for resume
      const urlObj = new URL(url);
      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        port: urlObj.port,
        headers: {} as Record<string, string>,
        timeout: 120000,
      };

      // Add Range header for resume
      if (resumeOffset > 0) {
        (options.headers as Record<string, string>)['Range'] = `bytes=${resumeOffset}-`;
        this.logger.info(`Resuming download from byte ${resumeOffset}`);
      }

      const request = protocol.get(url, options, (response) => {
        if (this.cancelled) {
          file.close();
          this.cleanupTempFile();
          resolve({ success: false, error: 'Download cancelled' });
          return;
        }

        // Handle redirects
        if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            this.logger.info(`Following redirect to: ${redirectUrl}`);
            this.downloadFromUrl(redirectUrl, tempPath, modelName, resumeOffset).then(resolve);
            return;
          }
        }

        // For resume, server should return 206 Partial Content
        // If it returns 200, server doesn't support resume - start from beginning
        if (response.statusCode === 206 && resumeOffset > 0) {
          this.logger.info('Resume successful, continuing download');
        } else if (response.statusCode !== 200) {
          file.close();
          this.cleanupTempFile();
          resolve({ success: false, error: `Download failed: HTTP ${response.statusCode}` });
          return;
        } else if (resumeOffset > 0 && response.statusCode === 200) {
          // Server doesn't support resume, start fresh
          this.logger.warn('Server does not support resume, starting fresh');
          file.close();
          fs.unlinkSync(tempPath);
          this.downloadedBytes = 0;
          this.totalBytes = 0; // Reset totalBytes for the fresh download
          this.downloadFromUrl(url, tempPath, modelName, 0).then(resolve);
          return;
        }

        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        this.totalBytes = resumeOffset > 0 ? resumeOffset + contentLength : contentLength;
        
        let downloadedSize = resumeOffset;
        let lastProgressUpdate = Date.now();

        // Apply speed limit by pausing/resuming the response stream
        if (this.maxSpeedBytesPerSecond > 0) {
          const speedLimitBytesPerMs = this.maxSpeedBytesPerSecond / 1000;
          let lastChunkTime = Date.now();
          let bytesSinceLastChunk = 0;

          response.on('data', (chunk: Buffer) => {
            const now = Date.now();
            bytesSinceLastChunk += chunk.length;
            const elapsed = now - lastChunkTime;

            if (elapsed > 0) {
              const currentSpeed = bytesSinceLastChunk / elapsed;
              if (currentSpeed > speedLimitBytesPerMs) {
                const targetTime = bytesSinceLastChunk / speedLimitBytesPerMs;
                const delay = Math.max(0, targetTime - elapsed);
                if (delay > 5 && !this.cancelled && !this.paused) {
                  response.pause();
                  setTimeout(() => {
                    if (!this.cancelled && !this.paused) {
                      response.resume();
                    }
                  }, Math.min(delay, 500));
                }
              }
            }
          });

          response.on('resume', () => {
            lastChunkTime = Date.now();
            bytesSinceLastChunk = 0;
          });
        }

        response.on('data', (chunk) => {
          if (this.cancelled || this.paused) {
            response.destroy();
            file.close();
            
            if (this.cancelled) {
              this.cleanupTempFile();
              resolve({ success: false, error: 'Download cancelled' });
            } else {
              // Paused - keep temp file for resume
              this.currentDownload = null;
              this.downloadedBytes = downloadedSize;
              resolve({ success: false, error: 'paused' });
            }
            return;
          }
          
          downloadedSize += chunk.length;
          this.downloadedBytes = downloadedSize;
          
          // Throttle UI updates to every 100ms
          const now = Date.now();
          if (now - lastProgressUpdate > 100) {
            if (this.totalBytes > 0) {
              const progress = Math.round((downloadedSize / this.totalBytes) * 100);
              this.sendProgressToUI(progress, 'downloading');
            }
            lastProgressUpdate = now;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          
          if (this.cancelled) {
            this.cleanupTempFile();
            this.currentDownload = null;
            this.sendProgressToUI(0, 'idle');
            resolve({ success: false, error: 'Download cancelled' });
            return;
          }

          if (this.paused) {
            this.currentDownload = null;
            resolve({ success: false, error: 'paused' });
            return;
          }

          // Verify file size
          try {
            const stat = fs.statSync(tempPath);
            if (this.totalBytes > 0 && stat.size < this.totalBytes * 0.95) {
              this.cleanupTempFile();
              this.currentDownload = null;
              this.sendProgressToUI(0, 'error');
              resolve({ success: false, error: 'Download incomplete - file too small' });
              return;
            }
          } catch (err) {
            this.logger.warn('Failed to verify file size', err);
          }

          this.currentDownload = null;
          // Send 'finalizing' instead of 'completed' - let downloadModel handle 'completed'
          this.sendProgressToUI(100, 'finalizing');
          resolve({ success: true });
        });

        file.on('error', (error) => {
          file.close();
          this.currentDownload = null;
          this.sendProgressToUI(0, 'error');
          this.cleanupTempFile();
          this.logger.error('Download error', error);
          resolve({ success: false, error: `Download failed: ${error.message}` });
        });
      });

      this.currentDownload.request = request;
      let handled = false;

      request.on('timeout', () => {
        if (handled) return;
        handled = true;
        request.destroy();
        file.close();
        this.currentDownload = null;
        this.sendProgressToUI(0, 'error');
        this.cleanupTempFile();
        resolve({ success: false, error: 'Request timeout' });
      });

      request.on('error', (error) => {
        if (handled) return;
        handled = true;
        file.close();
        this.currentDownload = null;
        this.sendProgressToUI(0, 'error');
        this.cleanupTempFile();
        this.logger.error('Request error', error);
        resolve({ success: false, error: `Download failed: ${error.message}` });
      });
    });
  }

  async downloadModel(modelName: string): Promise<{ success: boolean; error?: string }> {
    const model = AVAILABLE_MODELS.find(m => m.name === modelName);
    if (!model) {
      return { success: false, error: `Model ${modelName} not found` };
    }

    if (this.currentDownload && !this.paused) {
      return { success: false, error: 'Sedang ada download yang berjalan' };
    }

    this.cancelled = false;
    this.paused = false;
    this.currentModelUrl = model.url;
    this.currentModelName = modelName;
    this.downloadedBytes = 0;

    if (this.isModelDownloaded(modelName)) {
      return { success: false, error: `Model ${modelName} sudah di-download` };
    }

    // ── Disk space check ──
    const requiredSpace = model.sizeBytes * 1.1; // 10% buffer
    const diskCheck = await this.checkDiskSpace(requiredSpace);
    if (!diskCheck.enough) {
      const errorMsg = `Disk space tidak cukup untuk ${modelName}. Dibutuhkan ~${this.formatBytes(requiredSpace)}, tersedia ${this.formatBytes(diskCheck.freeBytes)}`;
      this.logger.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    // Clean up existing temp file
    this.removeTempFile(modelName);

    // Clean up invalid model file
    const modelPath = path.join(this.modelsPath, modelName);
    if (fs.existsSync(modelPath)) {
      try {
        const stat = fs.statSync(modelPath);
        if (stat.size < MIN_VALID_MODEL_SIZE) {
          fs.unlinkSync(modelPath);
        }
      } catch {}
    }

    if (!fs.existsSync(this.modelsPath)) {
      fs.mkdirSync(this.modelsPath, { recursive: true });
    }

    const tempPath = modelPath + '.tmp';
    
    this.sendProgressToUI(0, 'downloading');

    // ── Download with retry ──
    const result = await this.downloadWithRetry(model.url, tempPath, modelName, 0);
    
    if (this.cancelled) {
      this.cleanupTempFile();
      this.cancelled = false;
      this.currentModelUrl = null;
      this.currentModelName = null;
      this.saveDownloadState();
      return { success: false, error: 'Download dibatalkan' };
    }

    if (result.error === 'paused') {
      // Download was paused, keep state
      this.saveDownloadState();
      return { success: false, error: 'Download di-pause' };
    }

    if (result.success) {
      try {
        const stat = fs.statSync(tempPath);
        if (stat.size < MIN_VALID_MODEL_SIZE) {
          this.cleanupTempFile();
          this.sendProgressToUI(0, 'error');
          return { success: false, error: 'Downloaded file is too small or corrupt' };
        }

        // ── SHA256 verification (if hash is configured for this model) ──
        if (model.sha256) {
          this.logger.info(`Verifying SHA256 for ${modelName}...`);
          const hashOk = await this.verifySha256(tempPath, model.sha256);
          if (!hashOk) {
            this.cleanupTempFile();
            this.sendProgressToUI(0, 'error');
            return { success: false, error: `SHA256 hash mismatch — ${modelName} mungkin corrupt. Coba download ulang.` };
          }
        } else {
          this.logger.warn(`SHA256 not configured for ${modelName}, skipping hash verification`);
        }

        fs.renameSync(tempPath, modelPath);
        this.currentTempPath = null;
        this.currentModelUrl = null;
        this.sendProgressToUI(100, 'completed');
        this.currentModelName = null;
        this.saveDownloadState();
        this.logger.info(`Model downloaded successfully: ${modelName} (${stat.size} bytes)`);
        return { success: true };
      } catch (error) {
        this.logger.error('Failed to rename downloaded file', error);
        this.cleanupTempFile();
        this.sendProgressToUI(0, 'error');
        return { success: false, error: 'Gagal menyimpan file model' };
      }
    }
    
    return result;
  }

  pauseDownload(): { success: boolean; error?: string } {
    if (this.downloadState !== 'downloading') {
      return { success: false, error: 'Tidak ada download yang berjalan' };
    }

    this.logger.info('Pausing download...');
    this.paused = true;

    if (this.currentDownload) {
      if (this.currentDownload.request) {
        this.currentDownload.request.destroy();
      }
      if (this.currentDownload.stream) {
        this.currentDownload.stream.close();
      }
      this.currentDownload = null;
    }

    this.sendProgressToUI(this.downloadProgress, 'paused');
    this.logger.info(`Download paused at ${this.downloadProgress}% (${this.downloadedBytes} bytes)`);
    this.saveDownloadState();
    
    return { success: true };
  }

  async resumeDownload(): Promise<{ success: boolean; error?: string }> {
    if (this.downloadState !== 'paused') {
      return { success: false, error: 'Download tidak dalam keadaan pause' };
    }

    if (!this.currentModelName || !this.currentModelUrl) {
      return { success: false, error: 'Tidak ada download untuk di-resume' };
    }

    this.logger.info(`Resuming download from ${this.downloadedBytes} bytes...`);
    this.paused = false;

    const modelPath = path.join(this.modelsPath, this.currentModelName);
    const tempPath = modelPath + '.tmp';

    // Check if temp file still exists
    if (!fs.existsSync(tempPath)) {
      this.logger.warn('Temp file not found, restarting download');
      this.downloadedBytes = 0;
      this.totalBytes = 0;
      return this.downloadModel(this.currentModelName);
    }

    this.sendProgressToUI(this.downloadProgress, 'downloading');

    // Use retry for resume as well
    const result = await this.downloadWithRetry(this.currentModelUrl, tempPath, this.currentModelName, this.downloadedBytes);
    
    if (this.cancelled) {
      this.cleanupTempFile();
      this.cancelled = false;
      this.currentModelUrl = null;
      this.currentModelName = null;
      this.saveDownloadState();
      return { success: false, error: 'Download dibatalkan' };
    }

    if (result.error === 'paused') {
      this.saveDownloadState();
      return { success: false, error: 'Download di-pause' };
    }

    if (result.success) {
      try {
        const stat = fs.statSync(tempPath);
        if (stat.size < MIN_VALID_MODEL_SIZE) {
          this.cleanupTempFile();
          this.sendProgressToUI(0, 'error');
          this.saveDownloadState();
          return { success: false, error: 'Downloaded file is too small or corrupt' };
        }

        // SHA256 verification
        const model = AVAILABLE_MODELS.find(m => m.name === this.currentModelName);
        if (model?.sha256) {
          this.logger.info(`Verifying SHA256 for ${this.currentModelName}...`);
          const hashOk = await this.verifySha256(tempPath, model.sha256);
          if (!hashOk) {
            this.cleanupTempFile();
            this.sendProgressToUI(0, 'error');
            this.saveDownloadState();
            return { success: false, error: `SHA256 hash mismatch — ${this.currentModelName} mungkin corrupt. Coba download ulang.` };
          }
        }

        fs.renameSync(tempPath, modelPath);
        this.currentTempPath = null;
        this.currentModelUrl = null;
        this.sendProgressToUI(100, 'completed');
        this.logger.info(`Model downloaded successfully: ${this.currentModelName} (${stat.size} bytes)`);
        this.currentModelName = null;
        this.saveDownloadState();
        return { success: true };
      } catch (error) {
        this.logger.error('Failed to rename downloaded file', error);
        this.cleanupTempFile();
        this.sendProgressToUI(0, 'error');
        return { success: false, error: 'Gagal menyimpan file model' };
      }
    }
    
    return result;
  }

  cancelDownload(): void {
    this.logger.info('Cancelling download...');
    this.cancelled = true;
    this.paused = false;

    if (this.currentDownload) {
      if (this.currentDownload.request) {
        this.currentDownload.request.destroy();
      }
      if (this.currentDownload.stream) {
        this.currentDownload.stream.close();
      }
      this.currentDownload = null;
    }

    this.cleanupTempFile();
    this.currentModelUrl = null;
    this.currentModelName = null;
    this.downloadedBytes = 0;
    this.totalBytes = 0;
    this.sendProgressToUI(0, 'idle');
    this.saveDownloadState();
    this.logger.info('Download cancelled and cleaned up');
  }

  deleteModel(modelName: string): boolean {
    try {
      const modelPath = path.join(this.modelsPath, modelName);
      if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath);
        this.logger.info(`Model deleted: ${modelName}`);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Failed to delete model', error);
      return false;
    }
  }

  async forceDownloadModel(modelName: string): Promise<{ success: boolean; error?: string }> {
    const modelPath = path.join(this.modelsPath, modelName);
    if (fs.existsSync(modelPath)) {
      try {
        fs.unlinkSync(modelPath);
        this.logger.info(`Deleted existing model for re-download: ${modelName}`);
      } catch (err) {
        this.logger.warn(`Failed to delete existing model: ${modelName}`, err);
      }
    }
    this.removeTempFile(modelName);
    return this.downloadModel(modelName);
  }
}
