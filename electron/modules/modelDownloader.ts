import { BrowserWindow } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
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
  private tempDir: string;
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

  // ═══════════════════════════════════════════════════════════════
  //  Retry helpers for file operations (EPERM / EBUSY resilience)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Retry a synchronous file operation with busy-wait backoff.
   * Used when async is not available (e.g. inside event callbacks).
   */
  private retrySync<T>(fn: () => T, maxRetries: number = 5, baseDelayMs: number = 200): T {
    let lastError: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return fn();
      } catch (err: any) {
        lastError = err;
        if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') {
          if (attempt < maxRetries - 1) {
            const delay = baseDelayMs * Math.pow(2, attempt);
            const deadline = Date.now() + delay;
            while (Date.now() < deadline) { /* busy-wait */ }
            continue;
          }
        }
        throw err;
      }
    }
    throw lastError;
  }

  /**
   * Retry an async file operation with proper await+delay backoff.
   */
  private async retryAsync<T>(fn: () => Promise<T>, maxRetries: number = 5, baseDelayMs: number = 200): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') {
          if (attempt < maxRetries - 1) {
            const delay = baseDelayMs * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
        throw err;
      }
    }
    throw lastError;
  }

  constructor(logger: Logger, savedModelsPath?: string | null, database?: VoiceFlowDatabase) {
    this.logger = logger;
    this.database = database || null;
    if (savedModelsPath && fs.existsSync(savedModelsPath)) {
      this.customModelsPath = savedModelsPath;
      this.modelsPath = savedModelsPath;
    } else {
      this.modelsPath = this.getModelsPath();
    }

    // Use userData/temp-downloads instead of OS tmpdir to avoid Windows Defender / cleanup interference
    const userDataPath = app.getPath('userData');
    this.logger.info(`userData path: ${userDataPath}`);
    this.tempDir = path.join(userDataPath, 'temp-downloads');
    this.logger.info(`Temp download dir: ${this.tempDir}`);
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }
    } catch (err) {
      this.logger.warn('Cannot create temp download directory', err);
    }

    // Ensure models directory exists
    try {
      if (!fs.existsSync(this.modelsPath)) {
        fs.mkdirSync(this.modelsPath, { recursive: true });
      }
    } catch (err) {
      this.logger.warn('Cannot create models directory', err);
    }

    // Read pending temp path from DB BEFORE cleanup so we don't delete active paused downloads
    let pendingTempPath: string | null = null;
    if (this.database) {
      try {
        pendingTempPath = this.database.getSetting('download_temp_path') || null;
      } catch {}
    }

    this.cleanupInvalidFiles(pendingTempPath);

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

    // Don't retry on non-transient HTTP client errors (4xx except 408 timeout / 429 rate-limit)
    if (result.error && /^HTTP (4[0-4][0-9]|4[6-9][0-9])$/.test(result.error)) {
      const code = parseInt(result.error.replace('HTTP ', ''), 10);
      if (code !== 408 && code !== 429) {
        return result;
      }
    }
    // 5xx server errors ARE transient — always retry

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

    // Generate a FRESH temp path for each retry to avoid EPERM on createWriteStream
    // when the previous temp file is still locked by Windows Defender.
    // Best-effort cleanup of the old temp file — may fail if Defender is still scanning it.
    const newTempPath = this.generateTempPath(modelName);
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }

    return this.downloadWithRetry(url, newTempPath, modelName, 0, attempt + 1);
  }

  private getModelsPath(): string {
    if (app.isPackaged) {
      return path.join(app.getPath('userData'), 'models');
    }
    return path.join(__dirname, '..', '..', 'resources', 'whisper', 'models');
  }

  private cleanupInvalidFiles(skipTempPath?: string | null): void {
    // Clean OS temp download dir first
    this.cleanupDirectory(this.tempDir, skipTempPath);
    // Then clean models dir
    this.cleanupDirectory(this.modelsPath, skipTempPath);
  }

  private cleanupDirectory(dirPath: string, skipFilePath?: string | null): void {
    try {
      if (!fs.existsSync(dirPath)) return;

      const files = fs.readdirSync(dirPath);
      let cleanedCount = 0;
      const skipResolved = skipFilePath ? path.resolve(skipFilePath) : null;

      for (const file of files) {
        const filePath = path.join(dirPath, file);

        // NEVER delete a temp file belonging to an active paused download
        if (skipResolved && path.resolve(filePath) === skipResolved) {
          this.logger.info(`Skipping active paused download temp: ${file}`);
          continue;
        }

        try {
          const isTemp = file.includes('.tmp');
          const isBin = file.endsWith('.bin') && !file.endsWith('.tmp');

          if (isBin) {
            this.retrySync(() => {
              const stat = fs.statSync(filePath);
              if (stat.size < MIN_VALID_MODEL_SIZE) {
                try { fs.chmodSync(filePath, 0o666); } catch {}
                fs.unlinkSync(filePath);
                this.logger.info(`Removed invalid model: ${file} (${stat.size} bytes)`);
                cleanedCount++;
              }
            }, 3, 200);
          }

          if (isTemp) {
            this.retrySync(() => {
              if (!fs.existsSync(filePath)) return;
              try { fs.chmodSync(filePath, 0o666); } catch {}
              fs.unlinkSync(filePath);
              this.logger.info(`Removed orphaned temp: ${file}`);
              cleanedCount++;
            }, 3, 200);
          }
        } catch (err) {
          this.logger.warn(`Failed to process: ${file}`, err);
        }
      }

      if (cleanedCount > 0) {
        this.logger.info(`Cleaned up ${cleanedCount} files from ${dirPath}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to cleanup files in ${dirPath}`, err);
    }
  }

  /**
   * Save download state to database for persistence across app restarts
   */
  private saveDownloadState(): void {
    if (!this.database) return;
    
    try {
      if (this.downloadState === 'downloading' || this.downloadState === 'paused') {
        this.database.updateSetting('download_state', this.downloadState);
        this.database.updateSetting('download_model_name', this.currentModelName || '');
        this.database.updateSetting('download_model_url', this.currentModelUrl || '');
        this.database.updateSetting('download_progress', String(this.downloadProgress));
        this.database.updateSetting('downloaded_bytes', String(this.downloadedBytes));
        this.database.updateSetting('total_bytes', String(this.totalBytes));
        this.database.updateSetting('download_temp_path', this.currentTempPath || '');
        this.logger.info(`Saved download state: ${this.downloadState} for ${this.currentModelName}`);
      } else {
        this.database.updateSetting('download_state', 'idle');
        this.database.updateSetting('download_model_name', '');
        this.database.updateSetting('download_model_url', '');
        this.database.updateSetting('download_progress', '0');
        this.database.updateSetting('downloaded_bytes', '0');
        this.database.updateSetting('total_bytes', '0');
        this.database.updateSetting('download_temp_path', '');
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
      const savedTempPath = this.database.getSetting('download_temp_path');
      
      if (!state || state === 'idle' || !modelName || !modelUrl) return;

      // Determine the temp path: saved path, or fallback to model+.tmp
      let tempPath: string | null = savedTempPath || path.join(this.modelsPath, modelName + '.tmp');

      // Validate temp file is actually accessible (exists + stat succeeds)
      let tempOk = false;
      try {
        if (tempPath) fs.statSync(tempPath);
        tempOk = true;
      } catch {
        // If primary path fails, scan for any temp file matching this model
        tempPath = this.findTempFile(modelName);
        if (tempPath) {
          try {
            fs.statSync(tempPath);
            tempOk = true;
          } catch {
            tempOk = false;
          }
        }
      }

      if (tempOk && tempPath) {
        this.downloadState = 'paused';
        this.currentModelName = modelName;
        this.currentModelUrl = modelUrl;
        this.downloadProgress = parseInt(progress || '0', 10);
        this.downloadedBytes = parseInt(downloaded || '0', 10);
        this.totalBytes = parseInt(total || '0', 10);
        this.paused = true;
        this.currentTempPath = tempPath;

        this.logger.info(`Restored download: ${modelName} at ${this.downloadProgress}% (${this.downloadedBytes}/${this.totalBytes})`);

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          setTimeout(() => this.sendProgressToUI(this.downloadProgress, 'paused'), 500);
        }
      } else {
        this.logger.info('Temp file missing/inaccessible, clearing stale download state');
        this.saveDownloadState();
      }
    } catch (err) {
      this.logger.warn('Failed to restore download state', err);
    }
  }

  private findTempFile(modelName: string): string | null {
    for (const baseDir of [this.tempDir, this.modelsPath]) {
      try {
        if (!fs.existsSync(baseDir)) continue;
        const dir = fs.readdirSync(baseDir);
        const candidates = dir.filter(f => f.startsWith(modelName + '.tmp')).sort().reverse();
        for (const c of candidates) {
          const fp = path.join(baseDir, c);
          try {
            fs.statSync(fp);
            return fp;
          } catch {}
        }
      } catch {}
    }
    return null;
  }

  /**
   * Check if there's an interrupted download that can be resumed
   */
  hasInterruptedDownload(): boolean {
    if (!this.database) return false;
    
    const state = this.database.getSetting('download_state');
    const modelName = this.database.getSetting('download_model_name');
    
    if (state && state !== 'idle' && modelName) {
      const savedTempPath = this.database.getSetting('download_temp_path');
      if (savedTempPath) {
        try { fs.statSync(savedTempPath); return true; } catch {}
      }
      const tempPath = path.join(this.modelsPath, modelName + '.tmp');
      try { fs.statSync(tempPath); return true; } catch {}
      return !!this.findTempFile(modelName);
    }
    return false;
  }

  getInterruptedDownloadInfo(): { modelName: string; progress: number } | null {
    if (!this.database) return null;
    
    const state = this.database.getSetting('download_state');
    const modelName = this.database.getSetting('download_model_name');
    const progress = this.database.getSetting('download_progress');
    
    if (state && state !== 'idle' && modelName) {
      const savedTempPath = this.database.getSetting('download_temp_path');
      let tempPath = savedTempPath || path.join(this.modelsPath, modelName + '.tmp');
      try { fs.statSync(tempPath); } catch {
        tempPath = this.findTempFile(modelName) || '';
      }
      if (tempPath) {
        try {
          fs.statSync(tempPath);
          return { modelName, progress: parseInt(progress || '0', 10) };
        } catch {}
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
            description: 'Custom model — terdeteksi di folder',
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
      return this.retrySync(() => {
        if (!fs.existsSync(modelPath)) return false;
        const stat = fs.statSync(modelPath);
        return stat.size >= MIN_VALID_MODEL_SIZE;
      }, 3, 200);
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
      return this.retrySync(() => {
        if (!fs.existsSync(modelPath)) return 0;
        return fs.statSync(modelPath).size;
      }, 3, 200);
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

  private generateTempPath(modelName: string): string {
    const ts = Date.now();
    const rnd = crypto.randomBytes(4).toString('hex');
    const fname = `${modelName}.tmp.${ts}.${rnd}`;
    return path.join(this.tempDir, fname);
  }

  private cleanupTempFile(): void {
    if (!this.currentTempPath) return;
    const p = this.currentTempPath;
    this.currentTempPath = null;
    // Use retry helper: up to 5 attempts with backoff
    try {
      this.retrySync(() => {
        if (!fs.existsSync(p)) return;
        try { fs.chmodSync(p, 0o666); } catch {}
        fs.unlinkSync(p);
        this.logger.info(`Cleaned up temp file: ${p}`);
      }, 5, 200);
    } catch (err) {
      this.logger.warn(`Failed to clean temp file: ${p}`, err);
    }
  }

  removeTempFile(modelName: string): boolean {
    let removed = true;
    for (const baseDir of [this.tempDir, this.modelsPath]) {
      try {
        this.retrySync(() => {
          if (!fs.existsSync(baseDir)) return;
          const dir = fs.readdirSync(baseDir);
          for (const f of dir) {
            if (f.startsWith(modelName + '.tmp')) {
              const fp = path.join(baseDir, f);
              try {
                if (!fs.existsSync(fp)) break;
                try { fs.chmodSync(fp, 0o666); } catch {}
                fs.unlinkSync(fp);
                this.logger.info(`Removed temp file: ${f}`);
              } catch (err) {
                this.logger.warn(`Failed to remove ${f}`, err);
                removed = false;
              }
            }
          }
        }, 3, 200);
      } catch (err) {
        this.logger.warn(`Failed to list dir for temp cleanup: ${baseDir}`, err);
      }
    }
    return removed;
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
      // If EPERM on the primary path, fall back to a unique temp path
      let actualPath = tempPath;
      let file: fs.WriteStream;
      try {
        file = resumeOffset > 0 
          ? fs.createWriteStream(actualPath, { flags: 'a' })
          : fs.createWriteStream(actualPath);
      } catch (err: any) {
        if (err.code === 'EPERM' || err.code === 'EACCES') {
          actualPath = this.generateTempPath(modelName);
          this.logger.warn(`EPERM on primary temp path, falling back to: ${actualPath}`);
          try {
            file = resumeOffset > 0
              ? fs.createWriteStream(actualPath, { flags: 'a' })
              : fs.createWriteStream(actualPath);
          } catch (err2) {
            resolve({ success: false, error: `Failed to create temp file: ${err2}` });
            return;
          }
        } else {
          resolve({ success: false, error: `Failed to create temp file: ${err}` });
          return;
        }
      }

      // If we had to fall back, override tempPath so cleanup and completion use the right path
      if (actualPath !== tempPath) {
        tempPath = actualPath;
      }
      
      this.currentDownload = { request: null as any, stream: file };
      this.currentTempPath = tempPath;

      let fileErrored = false;
      file.on('error', (error: any) => {
        if (fileErrored) return;
        fileErrored = true;
        this.logger.error('File stream error', error);
        // Do NOT attempt EPERM recovery here — it's broken (response is piped to old stream, not the new one).
        // Let downloadWithRetry handle retries with a fresh temp path.
        try { file.destroy(); } catch {}
        this.currentDownload = null;
        this.sendProgressToUI(0, 'error');
        this.cleanupTempFile();
        resolve({ success: false, error: `File error: ${error.message}` });
      });

      const protocol = url.startsWith('https') ? https : http;
      
      // Build request options with Range header for resume
      const urlObj = new URL(url);
      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        port: urlObj.port,
        headers: {} as Record<string, string>,
      };

      // Add Range header for resume
      if (resumeOffset > 0) {
        (options.headers as Record<string, string>)['Range'] = `bytes=${resumeOffset}-`;
        this.logger.info(`Resuming download from byte ${resumeOffset}`);
      }

      let handled = false;
      const finish = (result: { success: boolean; error?: string }) => {
        if (handled) return;
        handled = true;
        resolve(result);
      };

      const request = protocol.get(url, options, (response) => {
        if (this.cancelled) {
          file.destroy();
          this.cleanupTempFile();
          finish({ success: false, error: 'Download cancelled' });
          return;
        }

        // Handle redirects
        if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.destroy();
            this.logger.info(`Following redirect to: ${redirectUrl}`);
            this.downloadFromUrl(redirectUrl, tempPath, modelName, resumeOffset).then(finish);
            return;
          }
        }

        // For resume, server should return 206 Partial Content
        // If it returns 200, server doesn't support resume - start from beginning
        if (response.statusCode === 206 && resumeOffset > 0) {
          this.logger.info('Resume successful, continuing download');
        } else if (response.statusCode !== 200) {
          file.destroy();
          this.cleanupTempFile();
          finish({ success: false, error: `Download failed: HTTP ${response.statusCode}` });
          return;
        } else if (resumeOffset > 0 && response.statusCode === 200) {
          // Server doesn't support resume, start fresh
          this.logger.warn('Server does not support resume, starting fresh');
          file.destroy();
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
          this.downloadedBytes = 0;
          this.totalBytes = 0;
          this.downloadFromUrl(url, tempPath, modelName, 0).then(finish);
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
                    if (!this.cancelled && !this.paused) response.resume();
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
            file.end();
            if (this.cancelled) {
              this.cleanupTempFile();
              finish({ success: false, error: 'Download cancelled' });
            } else {
              this.currentDownload = null;
              this.downloadedBytes = downloadedSize;
              finish({ success: false, error: 'paused' });
            }
            return;
          }
          
          downloadedSize += chunk.length;
          this.downloadedBytes = downloadedSize;
          
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
            finish({ success: false, error: 'Download cancelled' });
            return;
          }

          if (this.paused) {
            this.currentDownload = null;
            finish({ success: false, error: 'paused' });
            return;
          }

          // Verify size using tracked bytes instead of stat'ing the file.
          // fs.statSync on a just-downloaded file triggers antivirus scanning → EPERM.
          // this.downloadedBytes is tracked via data handler and is accurate.
          const minExpectedSize = this.totalBytes > 0
            ? this.totalBytes * 0.95
            : MIN_VALID_MODEL_SIZE;
          if (this.downloadedBytes < minExpectedSize) {
            this.cleanupTempFile();
            this.currentDownload = null;
            this.sendProgressToUI(0, 'error');
            finish({ success: false, error: 'Download incomplete - file too small' });
            return;
          }

          this.currentDownload = null;
          this.sendProgressToUI(100, 'finalizing');
          finish({ success: true });
        });
      });

      this.currentDownload.request = request;

      request.on('error', (error) => {
        if (handled) return;
        handled = true;
        file.destroy();
        this.currentDownload = null;
        this.sendProgressToUI(0, 'error');
        this.cleanupTempFile();
        resolve({ success: false, error: `Request failed: ${error.message}` });
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
    this.totalBytes = 0;

    if (this.isModelDownloaded(modelName)) {
      return { success: false, error: `Model ${modelName} sudah di-download` };
    }

    const requiredSpace = model.sizeBytes * 1.1;
    const diskCheck = await this.checkDiskSpace(requiredSpace);
    if (!diskCheck.enough) {
      const errorMsg = `Disk space tidak cukup untuk ${modelName}. Dibutuhkan ~${this.formatBytes(requiredSpace)}, tersedia ${this.formatBytes(diskCheck.freeBytes)}`;
      this.logger.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    this.removeTempFile(modelName);

    const modelPath = path.join(this.modelsPath, modelName);
    if (fs.existsSync(modelPath)) {
      try {
        this.retrySync(() => {
          const stat = fs.statSync(modelPath);
          if (stat.size < MIN_VALID_MODEL_SIZE) {
            try { fs.chmodSync(modelPath, 0o666); } catch {}
            fs.unlinkSync(modelPath);
          }
        }, 3, 200);
      } catch {}
    }

    if (!fs.existsSync(this.modelsPath)) {
      fs.mkdirSync(this.modelsPath, { recursive: true });
    }

    // Always use a unique temp name to avoid EPERM collisions with stuck old .tmp files
    const tempPath = this.generateTempPath(modelName);

    this.sendProgressToUI(0, 'downloading');

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
      this.saveDownloadState();
      return { success: false, error: 'Download di-pause' };
    }

    if (result.success) {
      try {
        // Use tracked downloadedBytes instead of statSync to avoid EPERM from antivirus.
        // fs.statSync on a just-downloaded file triggers Defender scan → file locked.
        if (this.downloadedBytes < MIN_VALID_MODEL_SIZE) {
          this.cleanupTempFile();
          this.sendProgressToUI(0, 'error');
          return { success: false, error: 'Downloaded file is too small or corrupt' };
        }

        // SHA256 verification uses fs.createReadStream which opens the file — may also trigger
        // antivirus, but only happens if sha256 is configured (currently all undefined).
        if (model.sha256) {
          this.logger.info(`Verifying SHA256 for ${modelName}...`);
          const hashOk = await this.verifySha256(tempPath, model.sha256);
          if (!hashOk) {
            this.cleanupTempFile();
            this.sendProgressToUI(0, 'error');
            return { success: false, error: `SHA256 hash mismatch — ${modelName} mungkin corrupt. Coba download ulang.` };
          }
        }

        // renameSync is atomic on same drive — does NOT trigger antivirus scanning.
        // It only changes directory metadata, not file content.
        try {
          fs.renameSync(tempPath, modelPath);
        } catch (renameErr: any) {
          if (renameErr.code === 'EXDEV') {
            // Cross-device: fall back to copy + unlink
            this.logger.warn('Cross-device rename, falling back to copy+unlink', renameErr);
            fs.copyFileSync(tempPath, modelPath);
            try { fs.unlinkSync(tempPath); } catch {}
          } else {
            throw renameErr;
          }
        }
        try { fs.chmodSync(modelPath, 0o666); } catch {}
        this.currentTempPath = null;
        this.currentModelUrl = null;
        this.sendProgressToUI(100, 'completed');
        this.currentModelName = null;
        this.saveDownloadState();
        this.logger.info(`Model downloaded successfully: ${modelName} (${this.downloadedBytes} bytes)`);
        return { success: true };
      } catch (error) {
        this.logger.error('Failed to save downloaded file', error);
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

    // Use saved temp path, or scan for existing temp file, or restart
    let tempPath = this.currentTempPath;
    if (!tempPath || !fs.existsSync(tempPath)) {
      tempPath = path.join(this.modelsPath, this.currentModelName + '.tmp');
    }
    if (!tempPath || !fs.existsSync(tempPath)) {
      const found = this.findTempFile(this.currentModelName);
      tempPath = found || '';
    }
    if (!tempPath || !fs.existsSync(tempPath)) {
      this.logger.warn('Temp file not found / inaccessible, restarting download');
      this.downloadedBytes = 0;
      this.totalBytes = 0;
      this.currentTempPath = null;
      return this.downloadModel(this.currentModelName);
    }

    // Verify we can actually access the temp file (stat succeeds)
    try {
      fs.statSync(tempPath);
    } catch {
      this.logger.warn('Temp file has EPERM / inaccessible, restarting download');
      this.downloadedBytes = 0;
      this.totalBytes = 0;
      this.currentTempPath = null;
      return this.downloadModel(this.currentModelName);
    }

    this.currentTempPath = tempPath;
    this.sendProgressToUI(this.downloadProgress, 'downloading');

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
        // Use tracked downloadedBytes instead of statSync to avoid EPERM from antivirus
        if (this.downloadedBytes < MIN_VALID_MODEL_SIZE) {
          this.cleanupTempFile();
          this.sendProgressToUI(0, 'error');
          this.saveDownloadState();
          return { success: false, error: 'Downloaded file is too small or corrupt' };
        }

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

        // renameSync is atomic on same drive — does NOT trigger antivirus scanning
        try {
          fs.renameSync(tempPath, modelPath);
        } catch (renameErr: any) {
          if (renameErr.code === 'EXDEV') {
            this.logger.warn('Cross-device rename, falling back to copy+unlink', renameErr);
            fs.copyFileSync(tempPath, modelPath);
            try { fs.unlinkSync(tempPath); } catch {}
          } else {
            throw renameErr;
          }
        }

        try { fs.chmodSync(modelPath, 0o666); } catch {}
        this.currentTempPath = null;
        this.currentModelUrl = null;
        this.sendProgressToUI(100, 'completed');
        this.logger.info(`Model downloaded successfully: ${this.currentModelName} (${this.downloadedBytes} bytes)`);
        this.currentModelName = null;
        this.saveDownloadState();
        return { success: true };
      } catch (error) {
        this.logger.error('Failed to save downloaded file', error);
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
        this.retrySync(() => {
          try { fs.chmodSync(modelPath, 0o666); } catch {}
          fs.unlinkSync(modelPath);
        }, 5, 200);
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
        this.retrySync(() => {
          try { fs.chmodSync(modelPath, 0o666); } catch {}
          fs.unlinkSync(modelPath);
        }, 5, 200);
        this.logger.info(`Deleted existing model for re-download: ${modelName}`);
      } catch (err) {
        this.logger.warn(`Failed to delete existing model: ${modelName}`, err);
      }
    }
    this.removeTempFile(modelName);
    return this.downloadModel(modelName);
  }
}
