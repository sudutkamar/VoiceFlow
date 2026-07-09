import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
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

  constructor(logger: Logger) {
    this.logger = logger;
    this.cudaPath = path.join(app.getPath('userData'), 'cuda');
    this.tempPath = path.join(app.getPath('userData'), 'cuda-temp.zip');
  }

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
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
        if (!fs.existsSync(dllPath)) {
          const whisperDir = this.getResourcesWhisperDir();
          if (!whisperDir) return false;
          const bundledPath = path.join(whisperDir, dll);
          if (!fs.existsSync(bundledPath)) return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  copyFromResources(): boolean {
    try {
      const whisperDir = this.getResourcesWhisperDir();
      if (!whisperDir) return false;
      if (!fs.existsSync(this.cudaPath)) {
        fs.mkdirSync(this.cudaPath, { recursive: true });
      }
      for (const dll of CUDA_DLLS) {
        const srcPath = path.join(whisperDir, dll);
        const dstPath = path.join(this.cudaPath, dll);
        if (fs.existsSync(srcPath) && !fs.existsSync(dstPath)) {
          fs.copyFileSync(srcPath, dstPath);
          this.logger.info(`Copied ${dll} to cuda folder`);
        }
      }
      return this.areCudaDllsPresent();
    } catch (err) {
      this.logger.error('Failed to copy CUDA DLLs from resources', err);
      return false;
    }
  }

  private getResourcesWhisperDir(): string | null {
    try {
      const whisperDir = app.isPackaged
        ? path.join(process.resourcesPath, 'whisper')
        : path.join(__dirname, '..', '..', 'resources', 'whisper');
      if (fs.existsSync(whisperDir)) return whisperDir;
      return null;
    } catch {
      return null;
    }
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

    const result = await this.downloadFile(CUDA_DOWNLOAD_URL, this.tempPath, resumeOffset);

    if (result.success) {
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

  private downloadFile(
    url: string,
    destPath: string,
    resumeOffset: number = 0
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const file = resumeOffset > 0
        ? fs.createWriteStream(destPath, { flags: 'a' })
        : fs.createWriteStream(destPath);

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

      const request = protocol.get(url, { headers: options.headers }, (response) => {
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
          // Server doesn't support resume
          file.close();
          fs.unlinkSync(destPath);
          this.downloadedBytes = 0;
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
          this.cleanupTemp();
          this.currentRequest = null;
          this.currentStream = null;
          resolve({ success: false, error: String(err) });
        });
      });

      request.on('error', (err) => {
        file.close();
        this.cleanupTemp();
        this.currentRequest = null;
        this.currentStream = null;
        resolve({ success: false, error: String(err) });
      });

      this.currentRequest = request;
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

      // Use PowerShell Expand-Archive to extract
      const psCommand = `Expand-Archive -Path '${this.tempPath}' -DestinationPath '${this.cudaPath}' -Force`;
      
      execFile('powershell', ['-NoProfile', '-Command', psCommand], {
        windowsHide: true,
        timeout: 120000,
      }, (error) => {
        if (error) {
          this.logger.error('Failed to extract CUDA zip', error);
          resolve({ success: false, error: `Extract failed: ${error.message}` });
          return;
        }

        // Verify DLLs exist after extraction
        if (this.areCudaDllsPresent()) {
          this.logger.info('CUDA DLLs extracted successfully');
          resolve({ success: true });
        } else {
          // Try copying from nested folder (zip might have a root folder)
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
      this.currentRequest.destroy();
    }
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

  private cleanupTemp(): void {
    try {
      if (fs.existsSync(this.tempPath)) {
        fs.unlinkSync(this.tempPath);
      }
    } catch {}
  }
}
