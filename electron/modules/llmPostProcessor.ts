import { Logger } from './logger';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { spawn, execSync } from 'child_process';

/**
 * LLM Post-Processor — standalone, no external dependencies.
 *
 * Uses a small GGUF model + llama-cli to clean up Whisper transcription.
 * Model + binary are downloaded from HuggingFace (just like Whisper models).
 *
 * Pipeline: spawn llama-cli → feed prompt → capture output
 *
 * Model: Qwen2.5-0.5B-Instruct-Q4_K_M (379MB) — tiny enough for CPU, good quality for cleanup.
 * Fallback: Qwen2.5-0.5B-Instruct-Q3_K_M (280MB) — even smaller.
 */

export interface LlmModelInfo {
  name: string;
  size: string;
  sizeBytes: number;
  url: string;
  description: string;
}

export const AVAILABLE_LLM_MODELS: LlmModelInfo[] = [
  {
    name: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    size: '379 MB',
    sizeBytes: 397808192,
    url: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf',
    description: '⭐ Rekomendasi: Qwen 0.5B Q4 — cepat + akurat untuk cleanup teks',
  },
  {
    name: 'qwen2.5-0.5b-instruct-q3_k_m.gguf',
    size: '280 MB',
    sizeBytes: 280000000,
    url: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q3_K_M.gguf',
    description: 'Qwen 0.5B Q3 — lebih kecil, hampir sama akurat',
  },
  {
    name: 'tinyllama-1.1b-chat-q4_k_m.gguf',
    size: '637 MB',
    sizeBytes: 637000000,
    url: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    description: 'TinyLlama 1.1B Q4 — akurasi lebih bagus, butuh ~1.5GB RAM',
  },
  {
    name: 'phi-2-q4_k_m.gguf',
    size: '622 MB',
    sizeBytes: 622000000,
    url: 'https://huggingface.co/TheBloke/phi-2-GGUF/resolve/main/phi-2.Q4_K_M.gguf',
    description: 'Phi-2 2.7B Q4 — akurasi tinggi, butuh ~2GB RAM (via TheBloke)',
  },
];

export interface LlmPostProcessResult {
  success: boolean;
  text: string;
  processingMs: number;
  model?: string;
  error?: string;
}

export class LlmPostProcessor {
  private logger: Logger;
  private llamaCliPath: string;
  private modelsPath: string;
  private timeoutMs: number;
  private defaultModel: string;

  // System prompt — strict, minimal, only cleanup
  private readonly SYSTEM_PROMPT = `<|system|>
You are a text cleaner for speech-to-text output.
Clean the user's speech into natural written text.

Rules:
- Remove filler words: um, uh, like, you know, basically, literally, sort of
- Remove stutters and false starts: "I I I want" → "I want"
- Fix grammar and punctuation naturally
- Add proper capitalization
- DO NOT change meaning, technical terms, names, or code
- DO NOT add information not in original
- Keep same language (Indonesian/English/etc)
- If text is already clean, return as-is
- Output ONLY the cleaned text. No explanations, no quotes.</|system|>

<|user|>
CLEAN THIS:`;

  private readonly SYSTEM_PROMPT_END = `</|user|>

<|assistant|>`;

  constructor(logger: Logger) {
    this.logger = logger;
    this.llamaCliPath = this.getLlamaCliPath();
    this.modelsPath = this.getModelsPath();
    this.timeoutMs = 30000;
    this.defaultModel = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';
  }

  // ═══════════════════════════════════════════════════════════
  //  Paths
  // ═══════════════════════════════════════════════════════════

  private getLlmDir(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'llm');
    }
    return path.join(__dirname, '..', '..', 'resources', 'llm');
  }

  private getLlamaCliPath(): string {
    return path.join(this.getLlmDir(), 'llama-cli.exe');
  }

  private getModelsPath(): string {
    if (app.isPackaged) {
      return path.join(app.getPath('userData'), 'llm-models');
    }
    return path.join(this.getLlmDir(), 'models');
  }

  getModelsPathValue(): string {
    return this.modelsPath;
  }

  getModelPath(modelName: string): string {
    return path.join(this.modelsPath, modelName);
  }

  // ═══════════════════════════════════════════════════════════
  //  Status checks
  // ═══════════════════════════════════════════════════════════

  isLlmCliAvailable(): boolean {
    return fs.existsSync(this.llamaCliPath);
  }

  isModelAvailable(modelName?: string): boolean {
    const m = modelName || this.defaultModel;
    return fs.existsSync(this.getModelPath(m));
  }

  getAvailableModels(): string[] {
    try {
      if (!fs.existsSync(this.modelsPath)) return [];
      return fs.readdirSync(this.modelsPath)
        .filter(f => f.endsWith('.gguf'))
        .sort();
    } catch {
      return [];
    }
  }

  getDownloadedModelsInfo(): Array<{ name: string; sizeBytes: number }> {
    try {
      if (!fs.existsSync(this.modelsPath)) return [];
      return fs.readdirSync(this.modelsPath)
        .filter(f => f.endsWith('.gguf'))
        .map(f => {
          try {
            const stat = fs.statSync(path.join(this.modelsPath, f));
            return { name: f, sizeBytes: stat.size };
          } catch {
            return { name: f, sizeBytes: 0 };
          }
        });
    } catch {
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  Download model — uses Electron net.request for robust HTTP/HTTPS
  // ═══════════════════════════════════════════════════════════

  async downloadModel(
    modelName: string,
    onProgress?: (progress: number, state: string, downloadedBytes?: number, totalBytes?: number) => void
  ): Promise<boolean> {
    const modelInfo = AVAILABLE_LLM_MODELS.find(m => m.name === modelName);
    if (!modelInfo) {
      this.logger.error('Unknown LLM model', { model: modelName });
      onProgress?.(0, 'error', 0, 0);
      return false;
    }

    // Ensure models directory
    if (!fs.existsSync(this.modelsPath)) {
      fs.mkdirSync(this.modelsPath, { recursive: true });
    }

    const targetPath = this.getModelPath(modelName);

    // Skip if already downloaded and valid
    if (fs.existsSync(targetPath)) {
      try {
        const stat = fs.statSync(targetPath);
        if (stat.size >= 1024) {
          this.logger.info('Model already downloaded', { model: modelName, size: stat.size });
          onProgress?.(100, 'completed', stat.size, stat.size);
          return true;
        }
      } catch {}
    }

    // Clean up any leftover .download temp file
    const tempPath = targetPath + '.download';
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}

    this.logger.info('Starting LLM download', { model: modelName, expectedBytes: modelInfo.sizeBytes, targetPath });
    onProgress?.(0, 'downloading', 0, modelInfo.sizeBytes);

    return this.downloadWithRedirects(modelInfo.url, targetPath, modelName, modelInfo.sizeBytes, onProgress, 0);
  }

  private async downloadWithRedirects(
    url: string,
    destPath: string,
    modelName: string,
    expectedSize: number,
    onProgress?: (progress: number, state: string, downloadedBytes?: number, totalBytes?: number) => void,
    redirectCount: number = 0
  ): Promise<boolean> {
    const MAX_REDIRECTS = 5;
    if (redirectCount > MAX_REDIRECTS) {
      this.logger.error('Too many redirects', { model: modelName, url: url.substring(0, 100) });
      onProgress?.(0, 'error', 0, expectedSize);
      return false;
    }

    const self = this;
    const tempPath = destPath + '.download';

    try {
      self.logger.info('Download request', { model: modelName, url: url.substring(0, 120), redirectCount });

      // Use Node.js https module (proven to work with HuggingFace CDN)
      const https = require('https');
      const urlObj = new URL(url);

      const finalUrl = await new Promise<string>((resolveUrl, rejectUrl) => {
        const req = https.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VoiceFlow/1.0',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
          },
          timeout: 30000,
        }, (res: any) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let loc = res.headers.location;
            if (loc.startsWith('/')) loc = urlObj.origin + loc;
            self.logger.info('Got redirect to CDN', { url: loc.substring(0, 100) });
            res.destroy();
            resolveUrl(loc);
          } else if (res.statusCode === 200) {
            resolveUrl(url); // No redirect needed
          } else {
            rejectUrl(new Error(`HTTP ${res.statusCode}`));
          }
        });
        req.on('error', rejectUrl);
        req.on('timeout', () => { req.destroy(); rejectUrl(new Error('Timeout')); });
        req.end();
      });

      // If we got a redirect, follow it
      const actualUrl = finalUrl !== url ? finalUrl : url;

      self.logger.info('Starting download from', { url: actualUrl.substring(0, 120) });

      const result = await new Promise<boolean>((resolve) => {
        const urlObj2 = new URL(actualUrl);
        const isHttps = urlObj2.protocol === 'https:';
        const mod = isHttps ? require('https') : require('http');

        const req = mod.get(actualUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VoiceFlow/1.0',
            'Accept': '*/*',
          },
          timeout: 60000,
        }, (res: any) => {
          if (res.statusCode !== 200) {
            self.logger.error('Download failed', { status: res.statusCode, model: modelName });
            onProgress?.(0, 'error', 0, expectedSize);
            resolve(false);
            return;
          }

          // Content-Length from CDN response
          const contentLength = res.headers['content-length'];
          let totalSize = expectedSize;
          if (contentLength) {
            const parsed = parseInt(contentLength, 10);
            if (!isNaN(parsed) && parsed > 0) totalSize = parsed;
          }

          self.logger.info('Stream opened', {
            model: modelName,
            contentLength: totalSize,
          });

          let downloaded = 0;
          let lastProgress = -1;
          let lastLog = Date.now();

          const fileStream = fs.createWriteStream(tempPath);
          let streamError = false;

          fileStream.on('error', (err: any) => {
            streamError = true;
            self.logger.error('File write error', err);
            try { fs.unlinkSync(tempPath); } catch {}
            resolve(false);
          });

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length;
            const pct = totalSize > 0 ? Math.min(99, Math.round((downloaded / totalSize) * 100)) : 0;

            if (pct !== lastProgress) {
              lastProgress = pct;
              onProgress?.(pct, 'downloading', downloaded, totalSize);
            }

            const now = Date.now();
            if (now - lastLog > 10000) {
              lastLog = now;
              self.logger.info('Progress', {
                model: modelName,
                mb: (downloaded / 1024 / 1024).toFixed(1) + '/' + (totalSize / 1024 / 1024).toFixed(1),
                pct,
              });
            }

            const canWrite = fileStream.write(chunk);
            if (!canWrite) {
              res.pause();
              fileStream.once('drain', () => res.resume());
            }
          });

          res.on('end', () => {
            if (!streamError) fileStream.end();
          });

          res.on('error', (err: any) => {
            if (streamError) return;
            self.logger.error('Stream error', err);
            try { fs.unlinkSync(tempPath); } catch {}
            resolve(false);
          });

          fileStream.on('finish', () => {
            if (streamError) return;
            try {
              const stat = fs.statSync(tempPath);
              if (stat.size < 1024) {
                self.logger.error('File too small', { size: stat.size, expected: expectedSize });
                try { fs.unlinkSync(tempPath); } catch {}
                onProgress?.(0, 'error', 0, expectedSize);
                resolve(false);
                return;
              }
              if (fs.existsSync(destPath)) try { fs.unlinkSync(destPath); } catch {}
              fs.renameSync(tempPath, destPath);
              self.logger.info('Download complete', { model: modelName, size: stat.size });
              onProgress?.(100, 'completed', stat.size, stat.size);
              resolve(true);
            } catch (err: any) {
              self.logger.error('Finalize error', err);
              try { fs.unlinkSync(tempPath); } catch {}
              resolve(false);
            }
          });
        });

        req.on('error', (err: any) => {
          self.logger.error('Request error', err);
          onProgress?.(0, 'error', 0, expectedSize);
          resolve(false);
        });
        req.on('timeout', () => {
          req.destroy();
          self.logger.error('Request timeout');
          onProgress?.(0, 'error', 0, expectedSize);
          resolve(false);
        });
      });

      return result;
    } catch (err: any) {
      self.logger.error('Download failed', err);
      onProgress?.(0, 'error', 0, expectedSize);
      try { fs.unlinkSync(tempPath); } catch {}
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  Delete model
  // ═══════════════════════════════════════════════════════════

  deleteModel(modelName: string): boolean {
    const modelPath = this.getModelPath(modelName);
    try {
      if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath);
        this.logger.info('Model deleted', { model: modelName });
        return true;
      }
    } catch (err: any) {
      this.logger.error('Failed to delete model', err);
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════
  //  Post-Process Text — spawn llama-cli, feed prompt, capture output
  // ═══════════════════════════════════════════════════════════

  async process(
    text: string,
    modelName?: string
  ): Promise<LlmPostProcessResult> {
    const startTime = Date.now();
    const model = modelName || this.defaultModel;

    // Skip empty or very short text
    if (!text || text.trim().length < 10) {
      return { success: true, text, processingMs: 0, model };
    }

    // Check prerequisites
    if (!this.isLlmCliAvailable()) {
      return { success: true, text, processingMs: 0, model, error: 'llama-cli not found' };
    }

    const modelPath = this.getModelPath(model);
    if (!fs.existsSync(modelPath)) {
      return { success: true, text, processingMs: 0, model, error: 'Model not downloaded' };
    }

    try {
      const result = await this.runLlamaInference(text, model, modelPath);
      const processingMs = Date.now() - startTime;

      if (!result.success) {
        this.logger.warn('LLM post-processing failed, using original', { error: result.error, model });
        return { success: true, text, processingMs, model, error: result.error };
      }

      const cleaned = result.text?.trim() || text;
      if (!cleaned || cleaned.length < 2) {
        return { success: true, text, processingMs, model };
      }

      this.logger.info('LLM post-processing done', {
        model,
        originalLength: text.length,
        cleanedLength: cleaned.length,
        processingMs,
      });

      return { success: true, text: cleaned, processingMs, model };
    } catch (err: any) {
      this.logger.error('LLM post-processing error', err);
      return { success: true, text, processingMs: Date.now() - startTime, model, error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  llama-cli spawn
  // ═══════════════════════════════════════════════════════════

  private runLlamaInference(
    text: string,
    modelName: string,
    modelPath: string
  ): Promise<{ success: boolean; text?: string; error?: string }> {
    return new Promise((resolve) => {
      // Build prompt: system + user text + assistant prefix
      const userText = text.replace(/["""]/g, '"').replace(/[''']/g, "'");
      const prompt = `${this.SYSTEM_PROMPT}\n${userText}\n${this.SYSTEM_PROMPT_END}`;

      // Write prompt to temp file for llama-cli
      const tempDir = path.join(app.getPath('userData'), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const promptFile = path.join(tempDir, `llm_prompt_${Date.now()}.txt`);
      try {
        fs.writeFileSync(promptFile, prompt, 'utf-8');
      } catch (err: any) {
        resolve({ success: false, error: `Failed to write prompt file: ${err.message}` });
        return;
      }

      // Arguments for llama-cli
      const args = [
        '-m', modelPath,
        '-f', promptFile,
        '-n', '512',        // max tokens output
        '--temp', '0.1',    // low temperature
        '--top-p', '0.9',
        '--repeat-penalty', '1.1',
        '-t', '2',          // 2 threads — enough for tiny model
        '--no-display-prompt', // don't echo prompt
        '--single-turn',    // exit after generation (don't enter interactive mode)
      ];

      this.logger.info('[LLM] Starting inference', {
        model: modelName,
        textLength: text.length,
      });

      const proc = spawn(this.llamaCliPath, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { proc.kill('SIGKILL'); } catch {}
        try { fs.unlinkSync(promptFile); } catch {}
        this.logger.warn('LLM inference timeout');
        resolve({ success: false, error: 'Timeout' });
      }, this.timeoutMs);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        // Clean up prompt file
        try { fs.unlinkSync(promptFile); } catch {}

        if (code !== 0) {
          this.logger.error('LLM inference failed', { code, stderr: stderr.slice(0, 300) });
          resolve({ success: false, error: `llama-cli error (code ${code})` });
          return;
        }

        // Parse output — take the last meaningful lines (after prompt echo)
        const lines = stdout.split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('<|') && !l.startsWith('[') && l.length > 1);

        // The output is everything after the system prompt marker
        // Find assistant response
        const assistantIdx = stdout.lastIndexOf('<|assistant|>');
        let resultText = '';
        if (assistantIdx >= 0) {
          resultText = stdout.substring(assistantIdx + '<|assistant|>'.length).trim();
        } else {
          // Fallback: take last non-empty, non-metadata lines
          resultText = lines.filter(l => !l.startsWith('system_info') && !l.startsWith('main:') && !l.startsWith('sampling') && !l.startsWith('llama_model_loader')).join(' ');
        }

        // Clean up result
        resultText = resultText
          .replace(/<\|end\|>/g, '')
          .replace(/<\|im_end\|>/g, '')
          .replace(/<\|assistant\|>/g, '')
          .replace(/<\|user\|>/g, '')
          .replace(/<\|system\|>/g, '')
          .replace(/Exiting\.\.\./gi, '')
          .trim();

        if (!resultText || resultText.length < 2) {
          resolve({ success: false, error: 'Empty output' });
          return;
        }

        resolve({ success: true, text: resultText });
      });

      proc.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try { fs.unlinkSync(promptFile); } catch {}
        resolve({ success: false, error: err.message });
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  Utilities
  // ═══════════════════════════════════════════════════════════

  setDefaultModel(model: string): void {
    this.defaultModel = model;
  }

  setTimeout(ms: number): void {
    this.timeoutMs = ms;
  }
}
