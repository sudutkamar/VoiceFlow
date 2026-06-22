import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { execFile } from 'child_process';
import { Logger } from './logger';

/**
 * CUDA Downloader — auto-downloads CUDA DLLs when NVIDIA GPU is detected.
 * 
 * Flow:
 * 1. Check if NVIDIA GPU exists (via nvidia-smi)
 * 2. Check if CUDA DLLs already downloaded
 * 3. If not, download from GitHub Releases
 * 4. Save to %APPDATA%/VoiceFlow/cuda/
 */

const CUDA_DLLS = [
  'ggml-cuda.dll',
  'cublas64_12.dll',
  'cublasLt64_12.dll',
  'cudart64_12.dll',
];

// GitHub release URL for CUDA addon
const CUDA_DOWNLOAD_URL = 'https://github.com/sudutkamar/VoiceFlow/releases/download/cuda-addon-v2.0.0/VoiceFlow-CUDA-v2.0.0.7z';

export interface CudaStatus {
  hasNvidiaGpu: boolean;
  cudaDllsPresent: boolean;
  cudaPath: string;
  needsDownload: boolean;
}

export class CudaDownloader {
  private logger: Logger;
  private cudaPath: string;

  constructor(logger: Logger) {
    this.logger = logger;
    this.cudaPath = path.join(app.getPath('userData'), 'cuda');
  }

  /**
   * Check CUDA status — does GPU exist, are DLLs present?
   */
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

  /**
   * Check if NVIDIA GPU is present via nvidia-smi
   */
  async hasNvidiaGpu(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
        windowsHide: true,
        timeout: 5000,
      }, (error, stdout) => {
        if (error) {
          resolve(false);
          return;
        }
        const gpuName = (stdout || '').trim();
        resolve(gpuName.length > 0 && !gpuName.toLowerCase().includes('not found'));
      });
    });
  }

  /**
   * Check if CUDA DLLs are already downloaded
   */
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

  /**
   * Copy CUDA DLLs from resources to user data folder.
   * Used when DLLs are bundled with the app.
   */
  copyFromResources(): boolean {
    try {
      const whisperDir = this.getResourcesWhisperDir();
      if (!whisperDir) return false;

      // Ensure cuda directory exists
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

  /**
   * Get the resources whisper directory
   */
  private getResourcesWhisperDir(): string | null {
    try {
      const whisperDir = app.isPackaged
        ? path.join(process.resourcesPath, 'whisper')
        : path.join(__dirname, '..', '..', 'resources-whisper-clean');
      
      if (fs.existsSync(whisperDir)) return whisperDir;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get CUDA DLLs path — returns cuda folder if DLLs exist, null otherwise
   */
  getCudaPath(): string | null {
    if (this.areCudaDllsPresent()) {
      return this.cudaPath;
    }
    return null;
  }

  /**
   * Get the download URL for CUDA DLLs
   */
  getDownloadUrl(): string {
    return CUDA_DOWNLOAD_URL;
  }

  /**
   * Get required CUDA DLL filenames
   */
  getRequiredDlls(): string[] {
    return [...CUDA_DLLS];
  }
}
