import { BrowserWindow } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Logger } from './logger';

export interface ModelInfo {
  name: string;
  size: string;
  sizeBytes: number;
  url: string;
  description: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    name: 'ggml-tiny.bin',
    size: '75 MB',
    sizeBytes: 75000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    description: 'Tercepat, akurasi rendah',
  },
  {
    name: 'ggml-base.bin',
    size: '142 MB',
    sizeBytes: 142000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    description: 'Seimbang untuk daily use',
  },
  {
    name: 'ggml-small.bin',
    size: '466 MB',
    sizeBytes: 466000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    description: 'Lebih akurat, cocok untuk bahasa campuran',
  },
  {
    name: 'ggml-medium.bin',
    size: '1.5 GB',
    sizeBytes: 1500000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    description: 'Sangat akurat untuk semua bahasa',
  },
  {
    name: 'ggml-large-v3-turbo.bin',
    size: '1.5 GB',
    sizeBytes: 1500000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
    description: '⭐ Akurasi tinggi + cepat (recommended)',
  },
  {
    name: 'ggml-large-v3.bin',
    size: '3.1 GB',
    sizeBytes: 3100000000,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
    description: 'Akurasi tertinggi, butuh RAM besar',
  },
];

export class ModelDownloader {
  private logger: Logger;
  private modelsPath: string;
  private currentDownload: { request: http.ClientRequest; stream: fs.WriteStream } | null = null;
  private downloadProgress: number = 0;
  private mainWindow: BrowserWindow | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
    this.modelsPath = this.getModelsPath();
  }

  private getModelsPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'whisper', 'models');
    }
    // __dirname = dist-electron/modules, go up 2 levels to project root
    return path.join(__dirname, '..', '..', 'resources', 'whisper', 'models');
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  getModelsPathValue(): string {
    return this.modelsPath;
  }

  getAvailableModels(): ModelInfo[] {
    return AVAILABLE_MODELS;
  }

  getDownloadedModels(): string[] {
    try {
      if (!fs.existsSync(this.modelsPath)) {
        fs.mkdirSync(this.modelsPath, { recursive: true });
        return [];
      }
      return fs.readdirSync(this.modelsPath)
        .filter(f => f.endsWith('.bin'))
        .sort();
    } catch {
      return [];
    }
  }

  isModelDownloaded(modelName: string): boolean {
    const modelPath = path.join(this.modelsPath, modelName);
    return fs.existsSync(modelPath);
  }

  getDownloadProgress(): number {
    return this.downloadProgress;
  }

  async downloadModel(modelName: string): Promise<{ success: boolean; error?: string }> {
    const model = AVAILABLE_MODELS.find(m => m.name === modelName);
    if (!model) {
      return { success: false, error: `Model ${modelName} not found` };
    }

    if (this.isModelDownloaded(modelName)) {
      return { success: false, error: `Model ${modelName} already downloaded` };
    }

    if (!fs.existsSync(this.modelsPath)) {
      fs.mkdirSync(this.modelsPath, { recursive: true });
    }

    const outputPath = path.join(this.modelsPath, modelName);
    const tempPath = outputPath + '.tmp';

    return new Promise((resolve) => {
      this.downloadProgress = 0;

      const file = fs.createWriteStream(tempPath);
      this.currentDownload = { request: null as any, stream: file };

      const protocol = model.url.startsWith('https') ? https : http;

      const request = protocol.get(model.url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(tempPath);
            this.downloadModel(modelName).then(resolve);
            return;
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(tempPath);
          resolve({ success: false, error: `Download failed: HTTP ${response.statusCode}` });
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize > 0) {
            this.downloadProgress = Math.round((downloadedSize / totalSize) * 100);
            this.mainWindow?.webContents.send('download-progress', this.downloadProgress);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          this.currentDownload = null;
          this.downloadProgress = 100;

          try {
            fs.renameSync(tempPath, outputPath);
            this.logger.info(`Model downloaded: ${modelName}`);
            this.mainWindow?.webContents.send('download-progress', 100);
            resolve({ success: true });
          } catch (error) {
            this.logger.error('Failed to rename downloaded file', error);
            resolve({ success: false, error: 'Failed to save model file' });
          }
        });

        file.on('error', (error) => {
          file.close();
          this.currentDownload = null;
          this.downloadProgress = 0;
          
          try {
            fs.unlinkSync(tempPath);
          } catch {}

          this.logger.error('Download error', error);
          resolve({ success: false, error: `Download failed: ${error.message}` });
        });
      });

      this.currentDownload.request = request;

      request.on('error', (error) => {
        file.close();
        this.currentDownload = null;
        this.downloadProgress = 0;
        
        try {
          fs.unlinkSync(tempPath);
        } catch {}

        this.logger.error('Request error', error);
        resolve({ success: false, error: `Download failed: ${error.message}` });
      });
    });
  }

  cancelDownload(): void {
    if (this.currentDownload) {
      if (this.currentDownload.request) {
        this.currentDownload.request.destroy();
      }
      if (this.currentDownload.stream) {
        this.currentDownload.stream.close();
      }
      this.currentDownload = null;
      this.downloadProgress = 0;
      this.logger.info('Download cancelled');
    }
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
}
