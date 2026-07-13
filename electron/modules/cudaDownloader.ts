import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import { app, BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import { Logger } from './logger';

const CUDA_DLLS = [
  'ggml-cuda.dll',
  'cublas64_12.dll',
  'cublasLt64_12.dll',
  'cudart64_12.dll',
];

const CUDA_DOWNLOAD_URL = 'https://github.com/sudutkamar/VoiceFlow/releases/download/v1.0.0/whisper-cuda.zip';

// SHA256 hash for the CUDA zip (compute once and fill in after verifying)
// To compute: certUtil -hashfile whisper-cuda.zip SHA256
const CUDA_ZIP_EXPECTED_SHA256: string | null = null; // TODO: fill after verifying release asset

export type CudaDownloadState = 'idle' | 'downloading' | 'paused' | 'extracting' | 'completed' | 'error';

export interface CudaStatus {
  hasNvidiaGpu: boolean;
  cudaDllsPresent: boolean;
  cudaPath: string;
  needsDownload: boolean;
}

export interface CudaDownloadProgress {
  state: CudaDownloadState;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}

export class CudaDownloader {
  private logger: Logger;
  private cudaPath: string;
  private mainWindow: BrowserWindow | null = null;

  private downloadState: CudaDownloadState = 'idle';
  private downloadedBytes = 0;
  private totalBytes = 0;
  private currentRequest: any = null;
  private currentStream: fs.WriteStream | null = null;
  private tempPath: string;
  private paused = false;
  private cancelled = false;
  private lastProgressUpdate = 0;

  // Retry config
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_BASE_DELAY_MS = 1000;

  // Speed limit (bytes per second, 0 = unlimited)
  private maxSpeedBytesPerSecond = 0;

  constructor(logger: Logger) {
    this.logger = logger;
    const whisperDir = app.isPackaged
      ? path.join(app.getPath('userData'), 'whisper')
      : path.join(__dirname, '..', '..', 'resources', 'whisper');
    this.cudaPath = path.join(whisperDir, 'gpu');
    this.tempPath = path.join(app.getPath('userData'), 'cuda-temp.zip');
  }

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  /**
   * Set download speed limit in bytes per second (0 = unlimited).
   */
  setSpeedLimit(bytesPerSecond: number): void {
    this.maxSpeedBytesPerSecond = Math.max(0, bytesPerSecond);
    this.logger.info(`CUDA download speed limit set to ${this.maxSpeedBytesPerSecond} B/s`);
  }

  /**
   * Check if there is enough disk space for the download.
   * Returns { enough: boolean, freeBytes: number }.
   */
  private async checkDiskSpace(requiredBytes: number): Promise<{ enough: boolean; freeBytes: number }> {
    try {
      // Get the drive root from the temp path
      const drivePath = path.parse(this.tempPath).root || 'C:\\';
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
      // If we can't check, assume it's OK (proceed with download)
      return { enough: true, freeBytes: Infinity };
    }
  }

  /**
   * Verify SHA256 hash of a file.
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
   * Handles transient network errors automatically.
   */
  private async downloadWithRetry(
    url: string,
    destPath: string,
    resumeOffset: number = 0,
    attempt: number = 1
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.downloadFile(url, destPath, resumeOffset);

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
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('cuda-download-progress', {
        ...this.getProgress(),
        state: 'downloading' as CudaDownloadState,
        retryInfo: `Retry ${attempt}/${this.MAX_RETRIES + 1} in ${Math.round(delay / 1000)}s`,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, delay));

    // On retry, check if temp file still exists for resume
    let newOffset = 0;
    if (fs.existsSync(destPath)) {
      try {
        newOffset = fs.statSync(destPath).size;
      } catch {}
    }

    return this.downloadWithRetry(url, destPath, newOffset, attempt + 1);
  }

  async checkStatus(): Promise<CudaStatus> {
    const hasGpu = await this.hasNvidiaGpu();
    const cudaDllsPresent = this.areCudaDllsPresent();
    return {
      hasNvidiaGpu: hasGpu,
      cudaDllsPresent,
      cudaPath: this.cudaPath,
      needsDownload: hasGpu && !cudaDllsPresent,
    };
  }

  async hasNvidiaGpu(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
        windowsHide: true,
        timeout: 5000,
      }, (error, stdout) => {
        if (error) { resolve(false); return; }
        const gpuName = (stdout || '').trim();
        resolve(gpuName.length > 0 && !gpuName.toLowerCase().includes('not found'));
      });
    });
  }

  areCudaDllsPresent(): boolean {
    try {
      for (const dll of CUDA_DLLS) {
        const dllPath = path.join(this.cudaPath, dll);
        if (!fs.existsSync(dllPath)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  copyFromResources(): boolean {
    return this.areCudaDllsPresent();
  }

  getCudaPath(): string | null {
    return this.areCudaDllsPresent() ? this.cudaPath : null;
  }

  getDownloadUrl(): string {
    return CUDA_DOWNLOAD_URL;
  }

  getRequiredDlls(): string[] {
    return [...CUDA_DLLS];
  }

  getProgress(): CudaDownloadProgress {
    const progress = this.totalBytes > 0 ? Math.round((this.downloadedBytes / this.totalBytes) * 100) : 0;
    return {
      state: this.downloadState,
      progress,
      downloadedBytes: this.downloadedBytes,
      totalBytes: this.totalBytes,
    };
  }

  private sendProgress() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    const progress = this.getProgress();
    this.mainWindow.webContents.send('cuda-download-progress', progress);
  }

  async download(): Promise<{ success: boolean; error?: string }> {
    if (this.downloadState === 'downloading') {
      return { success: false, error: 'Already downloading' };
    }

    const isResume = this.downloadState === 'paused';
    this.downloadState = 'downloading';
    this.paused = false;
    this.cancelled = false;

    // Only reset bytes if fresh download, not resume
    if (!isResume) {
      this.downloadedBytes = 0;
      this.totalBytes = 0;
    }
    this.sendProgress();

    // Check if resumable
    let resumeOffset = 0;
    if (fs.existsSync(this.tempPath)) {
      try {
        const stat = fs.statSync(this.tempPath);
        resumeOffset = stat.size;
        this.downloadedBytes = resumeOffset;
        this.logger.info(`Resuming CUDA download from ${resumeOffset} bytes`);
      } catch {}
    }

    // ── Disk space check ──
    // Estimate total size: if resuming, total is known; otherwise assume ~50MB for CUDA zip
    const estimatedSize = this.totalBytes > 0 ? this.totalBytes : 50 * 1024 * 1024;
    const requiredSpace = Math.max(estimatedSize, 50 * 1024 * 1024) * 1.1; // 10% buffer
    const diskCheck = await this.checkDiskSpace(requiredSpace);
    if (!diskCheck.enough) {
      this.downloadState = 'error';
      this.sendProgress();
      const errorMsg = `Disk space tidak cukup. Dibutuhkan ~${this.formatBytes(requiredSpace)}, tersedia ${this.formatBytes(diskCheck.freeBytes)}`;
      this.logger.error(errorMsg);
      return { success: false, error: errorMsg };
    }

    // ── Download with retry ──
    const result = await this.downloadWithRetry(CUDA_DOWNLOAD_URL, this.tempPath, resumeOffset);

    if (result.success) {
      // ── SHA256 verification (if hash is configured) ──
      if (CUDA_ZIP_EXPECTED_SHA256) {
        this.logger.info('Verifying CUDA zip SHA256...');
        this.sendProgress();
        const hashOk = await this.verifySha256(this.tempPath, CUDA_ZIP_EXPECTED_SHA256);
        if (!hashOk) {
          this.cleanupTemp();
          this.downloadState = 'error';
          this.sendProgress();
          return { success: false, error: 'SHA256 hash mismatch — file mungkin corrupt. Coba download ulang.' };
        }
      } else {
        this.logger.warn('SHA256 hash not configured, skipping verification');
      }

      this.downloadState = 'extracting';
      this.sendProgress();
      const extractResult = await this.extractZip();
      if (extractResult.success) {
        this.downloadState = 'completed';
        this.sendProgress();
        this.cleanupTemp();
        return { success: true };
      } else {
        this.downloadState = 'error';
        this.sendProgress();
        return { success: false, error: extractResult.error };
      }
    } else if (result.error === 'paused') {
      this.downloadState = 'paused';
      this.sendProgress();
      return { success: false, error: 'paused' };
    } else {
      this.downloadState = 'error';
      this.sendProgress();
      return { success: false, error: result.error };
    }
  }

  /**
   * Core download function - handles one HTTP request.
   * Supports resume via Range header, redirect following, and speed limiting.
   */
  private downloadFile(
    url: string,
    destPath: string,
    resumeOffset: number = 0
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      let file: fs.WriteStream;
      try {
        file = resumeOffset > 0
          ? fs.createWriteStream(destPath, { flags: 'a' })
          : fs.createWriteStream(destPath);
      } catch (err) {
        resolve({ success: false, error: `Failed to create temp file: ${err}` });
        return;
      }

      this.currentStream = file;
      const protocol = url.startsWith('https') ? https : http;
      const urlObj = new URL(url);

      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        port: urlObj.port,
        headers: {} as Record<string, string>,
      };

      if (resumeOffset > 0) {
        (options.headers as Record<string, string>)['Range'] = `bytes=${resumeOffset}-`;
      }

      const request = protocol.get(url, options, (response) => {
        if (this.cancelled) {
          file.close();
          this.cleanupTemp();
          resolve({ success: false, error: 'cancelled' });
          return;
        }

        // Handle redirects
        if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            this.downloadFile(redirectUrl, destPath, resumeOffset).then(resolve);
            return;
          }
        }

        if (response.statusCode === 206 && resumeOffset > 0) {
          // Resume OK
        } else if (response.statusCode !== 200) {
          file.close();
          this.cleanupTemp();
          resolve({ success: false, error: `HTTP ${response.statusCode}` });
          return;
        } else if (resumeOffset > 0 && response.statusCode === 200) {
          // Server doesn't support resume — restart from 0
          file.close();
          fs.unlinkSync(destPath);
          this.downloadedBytes = 0;
          // totalBytes will be recalculated when the new request gets content-length
          this.totalBytes = 0;
          this.downloadFile(url, destPath, 0).then(resolve);
          return;
        }

        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        this.totalBytes = resumeOffset > 0 ? resumeOffset + contentLength : contentLength;
        let downloadedSize = resumeOffset;

        response.on('data', (chunk) => {
          if (this.cancelled || this.paused) {
            response.destroy();
            file.close();
            if (this.cancelled) {
              this.cleanupTemp();
              resolve({ success: false, error: 'cancelled' });
            } else {
              this.downloadedBytes = downloadedSize;
              this.currentRequest = null;
              this.currentStream = null;
              resolve({ success: false, error: 'paused' });
            }
            return;
          }

          downloadedSize += chunk.length;
          this.downloadedBytes = downloadedSize;

          // Throttle UI updates to every 100ms
          const now = Date.now();
          if (now - this.lastProgressUpdate > 100) {
            this.lastProgressUpdate = now;
            this.sendProgress();
          }
        });

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
                // Need to slow down
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

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          this.currentRequest = null;
          this.currentStream = null;
          this.downloadedBytes = downloadedSize;
          this.sendProgress();
          resolve({ success: true });
        });

        file.on('error', (err) => {
          if (this.paused) {
            this.currentRequest = null;
            this.currentStream = null;
            resolve({ success: false, error: 'paused' });
          } else {
            this.cleanupTemp();
            this.currentRequest = null;
            this.currentStream = null;
            resolve({ success: false, error: String(err) });
          }
        });
      });

      this.currentRequest = request;

      request.on('error', (err) => {
        file.close();
        if (this.paused) {
          this.currentRequest = null;
          this.currentStream = null;
          resolve({ success: false, error: 'paused' });
        } else {
          this.cleanupTemp();
          this.currentRequest = null;
          this.currentStream = null;
          resolve({ success: false, error: String(err) });
        }
      });
    });
  }

  private async extractZip(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!fs.existsSync(this.tempPath)) {
        resolve({ success: false, error: 'Temp file not found' });
        return;
      }

      if (!fs.existsSync(this.cudaPath)) {
        fs.mkdirSync(this.cudaPath, { recursive: true });
      }

      const psCommand = `Expand-Archive -Path '${this.tempPath}' -DestinationPath '${this.cudaPath}' -Force`;

      execFile('powershell', ['-NoProfile', '-Command', psCommand], {
        windowsHide: true,
        timeout: 600000,
      }, (error) => {
        if (error) {
          this.logger.error('Failed to extract CUDA zip', error);
          resolve({ success: false, error: `Extract failed: ${error.message}` });
          return;
        }

        if (this.areCudaDllsPresent()) {
          this.logger.info('CUDA DLLs extracted successfully');
          resolve({ success: true });
        } else {
          try {
            const entries = fs.readdirSync(this.cudaPath);
            for (const entry of entries) {
              const entryPath = path.join(this.cudaPath, entry);
              if (fs.statSync(entryPath).isDirectory()) {
                for (const dll of CUDA_DLLS) {
                  const src = path.join(entryPath, dll);
                  const dst = path.join(this.cudaPath, dll);
                  if (fs.existsSync(src) && !fs.existsSync(dst)) {
                    fs.copyFileSync(src, dst);
                  }
                }
              }
            }
          } catch {}

          if (this.areCudaDllsPresent()) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: 'CUDA DLLs not found after extraction' });
          }
        }
      });
    });
  }

  pause(): void {
    if (this.downloadState !== 'downloading') return;
    this.paused = true;
    if (this.currentRequest) {
      this.currentRequest.destroy(new Error('paused'));
    }
    if (this.currentStream) {
      try { this.currentStream.close(); } catch {}
    }
    // Always set state and notify renderer immediately
    this.downloadState = 'paused';
    this.sendProgress();
  }

  resume(): void {
    if (this.downloadState !== 'paused') return;
    this.download().catch(() => {});
  }

  cancel(): void {
    this.cancelled = true;
    this.paused = false;
    if (this.currentRequest) {
      this.currentRequest.destroy();
    }
    this.cleanupTemp();
    this.downloadState = 'idle';
    this.downloadedBytes = 0;
    this.totalBytes = 0;
    this.sendProgress();
  }

  deleteEngineFiles(type: 'cpu' | 'gpu'): { success: boolean; deletedFiles?: number; error?: string } {
    const dir = type === 'cpu'
      ? path.join(path.dirname(this.cudaPath), 'cpu')
      : this.cudaPath;

    if (!fs.existsSync(dir)) {
      return { success: true, deletedFiles: 0 };
    }

    try {
      let count = 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        try {
          fs.rmSync(fullPath, { recursive: true });
          count++;
        } catch (err) {
          this.logger.warn(`Failed to delete ${fullPath}`, err);
        }
      }
      this.logger.info(`Deleted ${count} files from ${type} engine directory`);
      return { success: true, deletedFiles: count };
    } catch (err) {
      this.logger.error(`Failed to delete ${type} engine files`, err);
      return { success: false, error: String(err) };
    }
  }

  private cleanupTemp(): void {
    try {
      if (fs.existsSync(this.tempPath)) {
        fs.unlinkSync(this.tempPath);
      }
    } catch {}
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
