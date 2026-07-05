import { exec, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { app, BrowserWindow } from 'electron';

const CPU_THREADS = Math.max(1, os.cpus().length - 1);
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
  usedModel?: string;
  processingMs?: number;
}

/**
 * Whisper profiles — prioritizing ACCURACY over speed.
 * 
 * Key insight: For voice-to-text, accuracy is everything.
 * Users prefer waiting 1-2 extra seconds for correct text
 * over getting wrong text faster.
 */
interface WhisperProfile {
  name: string;
  beamSize: number;
  bestOf: number;
  entropyThold: number;
  logprobThold: number;
  noSpeechThold: number;
  threads: number;
}

/**
 * ACCURACY-OPTIMIZED PROFILES
 * 
 * beam-size: Higher = better accuracy (explores more possibilities)
 * best-of:  Higher = better accuracy (picks best from N candidates)
 * 
 * Accuracy ranking: accurate > balanced > fast
 */
const PROFILES: Record<string, WhisperProfile> = {
  // 🎯 ACCURATE: Maximum accuracy. Best for important transcription.
  accurate: {
    name: 'accurate',
    beamSize: 5,
    bestOf: 5,
    entropyThold: 2.4,
    logprobThold: -1.0,
    noSpeechThold: 0.4,
    threads: CPU_THREADS,
  },

  // ⚖️ BALANCED: Great accuracy with reasonable speed. DEFAULT.
  balanced: {
    name: 'balanced',
    beamSize: 3,
    bestOf: 3,
    entropyThold: 2.4,
    logprobThold: -1.0,
    noSpeechThold: 0.5,
    threads: CPU_THREADS,
  },

  // ⚡ FAST: Decent accuracy, faster. Only for short voice commands.
  fast: {
    name: 'fast',
    beamSize: 2,
    bestOf: 2,
    entropyThold: 2.4,
    logprobThold: -1.0,
    noSpeechThold: 0.5,
    threads: Math.min(CPU_THREADS, 6),
  },
};

/**
 * Language-specific initial prompts for better accuracy.
 * These help whisper understand the context and produce better transcription.
 */
const LANGUAGE_PROMPTS: Record<string, string> = {
  id: 'Bahasa Indonesia yang benar. Gunakan tanda baca yang tepat.',
  en: 'English with proper punctuation and capitalization.',
  ja: '日本語で適切な句読点を使ってください。',
  ko: '한국어로 올바른 문장 부호를 사용합니다.',
  zh: '请使用正确的标点符号。',
};

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
  private hasGpu: boolean = false;

  constructor(logger: Logger) {
    this.logger = logger;
    this.whisperPath = this.getWhisperPath();
    this.modelsPath = this.getModelsPath();
    this.audioPreprocessor = new AudioPreprocessor(logger);
    this.fuzzyMatcher = new FuzzyMatcher(logger);
    this.confidenceScorer = new ConfidenceScorer(logger);
    this.detectGpu();
  }

  // ═══════════════════════════════════════════════════════════════
  //  Initialization
  // ═══════════════════════════════════════════════════════════════

  private detectGpu(): void {
    try {
      const whisperDir = path.dirname(this.whisperPath);
      const cudaDllPath = path.join(whisperDir, 'ggml-cuda.dll');
      const userCudaPath = path.join(app.getPath('userData'), 'cuda', 'ggml-cuda.dll');
      this.hasGpu = fs.existsSync(cudaDllPath) || fs.existsSync(userCudaPath);
      this.logger.info(`GPU: ${this.hasGpu ? 'CUDA ✓' : 'CPU only'}`);
    } catch {
      this.hasGpu = false;
    }
  }

  private getWhisperPath(): string {
    if (app.isPackaged) return path.join(process.resourcesPath, 'whisper', 'whisper-cli.exe');
    return path.join(__dirname, '..', '..', 'resources', 'whisper', 'whisper-cli.exe');
  }

  private getModelsPath(): string {
    if (app.isPackaged) return path.join(process.resourcesPath, 'whisper', 'models');
    return path.join(__dirname, '..', '..', 'resources', 'whisper', 'models');
  }

  setMainWindow(window: BrowserWindow): void { this.mainWindow = window; }

  updateModelsPath(newPath: string): void {
    if (newPath && fs.existsSync(newPath)) {
      this.modelsPath = newPath;
      this.logger.info(`Models path: ${newPath}`);
    }
  }

  getModelsPathValue(): string { return this.modelsPath; }

  setSendToAll(fn: (channel: string, ...args: any[]) => void): void { this.sendToAllFn = fn; }

  private sendToRenderer(channel: string, ...args: any[]): void {
    if (this.sendToAllFn) this.sendToAllFn(channel, ...args);
    else this.mainWindow?.webContents.send(channel, ...args);
  }

  loadDictionary(entries: DictionaryEntry[]): void { this.fuzzyMatcher.loadDictionary(entries); }
  isGpuAvailable(): boolean { return this.hasGpu; }

  // ═══════════════════════════════════════════════════════════════
  //  ACCURACY-OPTIMIZED: Model Selection
  // ═══════════════════════════════════════════════════════════════

  /**
   * Select model for MAXIMUM ACCURACY.
   * 
   * Strategy: Always use the largest available model.
   * Larger models = significantly better accuracy.
   * 
   * Accuracy ranking:
   *   ggml-large-v3.bin > ggml-large-v3-turbo.bin > ggml-medium.bin 
   *   > ggml-small.bin > ggml-base.bin > ggml-tiny.bin
   * 
   * Quantized models (q5_1, q5_0) are slightly less accurate
   * than their full-size counterparts.
   */
  private selectOptimalModel(userModel: string): string {
    // Respect explicit user choice
    if (userModel && userModel !== 'auto' && this.isModelAvailable(userModel)) {
      return userModel;
    }

    // 🏆 ACCURACY PRIORITY: Largest model first
    const accuracyPriority: string[] = [
      'ggml-large-v3.bin',              // 3.1GB — ⭐ BEST accuracy
      'ggml-large-v3-turbo.bin',        // 1.5GB — ⭐ Excellent accuracy + fast
      'ggml-medium.bin',                // 1.5GB — Very good accuracy
      'ggml-large-v3-turbo-q5_0.bin',   // 548MB — Good accuracy (quantized)
      'ggml-small.bin',                 // 466MB — Decent accuracy
      'ggml-base.bin',                  // 142MB — Basic accuracy
      'ggml-base-q5_1.bin',             // 57MB  — Lower accuracy (quantized)
      'ggml-tiny.bin',                  // 75MB  — Lowest accuracy
    ];

    for (const m of accuracyPriority) {
      if (this.isModelAvailable(m)) {
        this.logger.info(`Selected model: ${m} (accuracy priority)`);
        return m;
      }
    }

    const available = this.getAvailableModels();
    return available.length > 0 ? available[0] : 'ggml-base.bin';
  }

  /**
   * Select profile for MAXIMUM ACCURACY.
   * 
   * For voice-to-text, always use balanced or accurate.
   * Only use fast for very short audio (< 3 seconds).
   */
  private selectProfile(model: string, audioDurationMs?: number): WhisperProfile {
    const durationSec = (audioDurationMs || 0) / 1000;
    const isLargeModel = model.includes('large') || model.includes('medium');

    // Large models are already fast — always use accurate profile
    if (isLargeModel) return PROFILES.accurate;

    // Short audio — can afford more computation
    if (durationSec < 10) return PROFILES.accurate;

    // Default: balanced (good accuracy + reasonable speed)
    return PROFILES.balanced;
  }

  /**
   * Build initial prompt for better accuracy.
   * Language-specific prompts help whisper produce correct text.
   */
  private buildInitialPrompt(userPrompt?: string, language?: string): string {
    const parts: string[] = [];

    // Add language-specific prompt
    const lang = language && language !== 'auto' ? language : 'id';
    if (LANGUAGE_PROMPTS[lang]) {
      parts.push(LANGUAGE_PROMPTS[lang]);
    }

    // Add user's custom prompt
    if (userPrompt) {
      parts.push(userPrompt);
    }

    return parts.join(' ');
  }

  // ═══════════════════════════════════════════════════════════════
  //  Audio Quality Analysis
  // ═══════════════════════════════════════════════════════════════

  private analyzeAudioQuality(audioBuffer: Buffer): {
    rmsLevel: number;
    peakLevel: number;
    isNoisy: boolean;
    isQuiet: boolean;
    durationMs: number;
  } {
    try {
      const wavInfo = this.parseWavInfo(audioBuffer);
      if (!wavInfo) return { rmsLevel: 0, peakLevel: 0, isNoisy: false, isQuiet: true, durationMs: 0 };

      const samples = this.extractSamples(audioBuffer, wavInfo);
      const durationMs = (samples.length / wavInfo.sampleRate) * 1000;

      let sum = 0;
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i];
        const abs = Math.abs(samples[i]);
        if (abs > peak) peak = abs;
      }
      const rms = Math.sqrt(sum / samples.length);

      return {
        rmsLevel: rms,
        peakLevel: peak,
        isNoisy: rms > 0.15,
        isQuiet: rms < 0.01,
        durationMs,
      };
    } catch {
      return { rmsLevel: 0, peakLevel: 0, isNoisy: false, isQuiet: true, durationMs: 0 };
    }
  }

  private parseWavInfo(buffer: Buffer): { sampleRate: number; channels: number; bitsPerSample: number } | null {
    try {
      if (buffer.length < 44) return null;
      if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
      let offset = 12;
      while (offset < buffer.length - 8) {
        const chunkId = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        if (chunkId === 'fmt ') {
          return {
            sampleRate: buffer.readUInt32LE(offset + 12),
            channels: buffer.readUInt16LE(offset + 10),
            bitsPerSample: buffer.readUInt16LE(offset + 22),
          };
        }
        offset += 8 + chunkSize;
      }
      return null;
    } catch { return null; }
  }

  private extractSamples(buffer: Buffer, info: { sampleRate: number; channels: number; bitsPerSample: number }): Float32Array {
    let offset = 12;
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        const dataOffset = offset + 8;
        const bytesPerSample = info.bitsPerSample / 8;
        const totalSamples = Math.floor(chunkSize / bytesPerSample);
        const monoSamples = Math.floor(totalSamples / info.channels);
        const samples = new Float32Array(monoSamples);
        for (let i = 0; i < monoSamples; i++) {
          let sum = 0;
          for (let ch = 0; ch < info.channels; ch++) {
            const idx = (i * info.channels + ch) * bytesPerSample;
            if (info.bitsPerSample === 16) {
              sum += buffer.readInt16LE(dataOffset + idx) / 32768.0;
            }
          }
          samples[i] = sum / info.channels;
        }
        return samples;
      }
      offset += 8 + chunkSize;
    }
    return new Float32Array(0);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Main Transcription Pipeline (ACCURACY-OPTIMIZED)
  // ═══════════════════════════════════════════════════════════════

  async transcribe(
    audioPath: string,
    model: string = 'ggml-base.bin',  // Default to full model, not quantized
    language: string = 'auto',
    options: {
      preprocess?: boolean;
      fuzzyMatch?: boolean;
      confidenceScore?: boolean;
      audioDurationMs?: number;
      initialPrompt?: string;
      device?: string;
      profile?: string;
      autoModel?: boolean;
    } = {}
  ): Promise<TranscribeResult> {
    const startTime = Date.now();
    const {
      preprocess = true,
      fuzzyMatch = true,
      confidenceScore = true,
      audioDurationMs,
      initialPrompt,
      profile: forceProfile,
      autoModel = false,
    } = options;

    // --- Validate ---
    if (!fs.existsSync(this.whisperPath)) {
      return { success: false, error: 'whisper-cli.exe tidak ditemukan.' };
    }

    // --- Model selection (accuracy priority) ---
    const selectedModel = autoModel
      ? this.selectOptimalModel(model)
      : (this.isModelAvailable(model) ? model : this.selectOptimalModel(model));

    const modelPath = path.join(this.modelsPath, selectedModel);
    if (!fs.existsSync(modelPath)) {
      return { success: false, error: `Model "${selectedModel}" belum diunduh.` };
    }

    if (!fs.existsSync(audioPath)) {
      return { success: false, error: 'File audio tidak ditemukan' };
    }

    // --- Audio preprocessing (ALWAYS do for best quality) ---
    let processedAudioPath = audioPath;
    let audioQuality = { isNoisy: false, isQuiet: false, rmsLevel: 0, peakLevel: 0, durationMs: audioDurationMs || 0 };
    let didPreprocess = false;

    if (preprocess) {
      try {
        const audioBuffer = fs.readFileSync(audioPath);
        audioQuality = this.analyzeAudioQuality(audioBuffer);

        // ALWAYS preprocess for best accuracy
        const processedBuffer = await this.audioPreprocessor.process(audioBuffer);
        processedAudioPath = audioPath.replace('.wav', '_processed.wav');
        fs.writeFileSync(processedAudioPath, processedBuffer);
        didPreprocess = true;
        this.logger.info('Audio preprocessed', {
          rms: audioQuality.rmsLevel.toFixed(4),
          peak: audioQuality.peakLevel.toFixed(4),
          isNoisy: audioQuality.isNoisy,
        });
      } catch (error: any) {
        this.logger.warn('Preprocessing failed, using original', error);
        processedAudioPath = audioPath;
      }
    }

    // --- Profile selection (accuracy priority) ---
    const profile = forceProfile && PROFILES[forceProfile]
      ? PROFILES[forceProfile]
      : this.selectProfile(selectedModel, audioDurationMs || audioQuality.durationMs);

    // --- Build initial prompt for better accuracy ---
    const fullPrompt = this.buildInitialPrompt(initialPrompt, language);

    this.logger.info('🎯 Transcription start', {
      model: selectedModel,
      profile: profile.name,
      language,
      durationMs: Math.round(audioDurationMs || audioQuality.durationMs),
      preprocessed: didPreprocess,
      hasPrompt: !!fullPrompt,
    });

    // --- Run whisper with retry for accuracy ---
    let lastError = '';
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.runWhisper(
          processedAudioPath,
          modelPath,
          selectedModel,
          language,
          profile,
          fullPrompt,
          options,
          audioDurationMs || audioQuality.durationMs
        );

        // Clean up
        if (didPreprocess) {
          try { fs.unlinkSync(processedAudioPath); } catch {}
        }

        // Success
        if (result.success && result.text) {
          const postResult = await this.postProcess(result.text, fuzzyMatch, confidenceScore, audioDurationMs);
          const processingMs = Date.now() - startTime;

          this.logger.info('🎯 Transcription complete', {
            model: selectedModel,
            profile: profile.name,
            attempt: attempt + 1,
            processingMs,
            textLength: postResult.text?.length || 0,
          });

          return { ...result, ...postResult, usedModel: selectedModel, processingMs };
        }

        // No speech
        if (result.error === '__NO_SPEECH__') {
          return { ...result, usedModel: selectedModel, processingMs: Date.now() - startTime };
        }

        lastError = result.error || 'Unknown error';
        this.logger.warn(`Attempt ${attempt + 1} failed: ${lastError}`);

        // Retry with more accurate settings
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (error: any) {
        lastError = error.message;
        this.logger.error(`Attempt ${attempt + 1} exception`, error);
      }
    }

    // Cleanup on failure
    if (didPreprocess) try { fs.unlinkSync(processedAudioPath); } catch {}

    return {
      success: false,
      error: lastError || 'Transcription failed',
      usedModel: selectedModel,
      processingMs: Date.now() - startTime,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  Whisper Process (ACCURACY-OPTIMIZED Arguments)
  // ═══════════════════════════════════════════════════════════════

  private runWhisper(
    audioPath: string,
    modelPath: string,
    modelName: string,
    language: string,
    profile: WhisperProfile,
    initialPrompt: string,
    options: any,
    audioDurationMs: number
  ): Promise<TranscribeResult> {
    return new Promise((resolve) => {
      // 🎯 ACCURACY-OPTIMIZED ARGS
      const args = [
        '-m', modelPath,
        '-f', audioPath,
        '-otxt',                 // Output to text file
        '--no-prints',           // Suppress whisper logs
        '--no-timestamps',       // Skip timestamp generation
        '-t', String(profile.threads),
        '--best-of', String(profile.bestOf),       // Pick best from N candidates
        '--beam-size', String(profile.beamSize),   // Beam search width
        '--entropy-thold', String(profile.entropyThold),
        '--logprob-thold', String(profile.logprobThold),
        '--no-speech-thold', String(profile.noSpeechThold),
      ];

      // GPU/CPU
      if (!this.hasGpu || options.device === 'cpu') {
        args.push('-ng');
      }

      // Language
      args.push('-l', language && language !== 'auto' ? language : 'auto');

      // 🎯 INITIAL PROMPT for better accuracy
      if (initialPrompt) {
        args.push('--prompt', initialPrompt);
      }

      this.logger.info('🎯 Whisper args', {
        model: path.basename(modelPath),
        beam: profile.beamSize,
        bestOf: profile.bestOf,
        threads: profile.threads,
        gpu: this.hasGpu && options.device !== 'cpu',
        hasPrompt: !!initialPrompt,
      });

      const whisper = spawn(this.whisperPath, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.currentProcess = whisper;

      let settled = false;

      // Reasonable timeout based on model and audio length
      const modelMultiplier = modelName.includes('large') ? 3 : modelName.includes('medium') ? 2 : 1;
      const timeoutMs = Math.max(30000, Math.min(180000, (audioDurationMs || 5000) * 4 * modelMultiplier + 30000));

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { whisper.kill('SIGKILL'); } catch {}
        this.currentProcess = null;
        this.logger.error('Whisper timeout', { timeoutMs: Math.round(timeoutMs) });
        resolve({ success: false, error: 'Timeout — coba rekam lebih pendek atau gunakan model lebih kecil.' });
      }, timeoutMs);

      let stdout = '';
      let stderr = '';
      let partialText = '';

      whisper.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;

        // Extract partial transcripts
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

      whisper.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      whisper.on('close', (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.currentProcess = null;

        if (code !== 0) {
          this.logger.error('Whisper failed', { code, stderr: stderr.slice(0, 500) });
          resolve({ success: false, error: `Whisper error (code ${code})` });
          return;
        }

        // Read output
        const txtPath = audioPath + '.txt';
        let transcript = '';

        if (fs.existsSync(txtPath)) {
          transcript = fs.readFileSync(txtPath, 'utf-8').trim();
          try { fs.unlinkSync(txtPath); } catch {}
        }

        // Fallback: parse stdout
        if (!transcript && stdout) {
          transcript = stdout.split('\n')
            .map(l => l.trim())
            .filter(l => {
              if (!l || l.length < 2) return false;
              if (l.startsWith('[') && l.match(/^\[\d{2}:\d{2}:\d{2}/)) return false;
              if (/^(whisper|main|system_info|sampling|auto|detected)/.test(l)) return false;
              if (l.includes('ggml') || l.includes('model') || l.includes('thread')) return false;
              return true;
            })
            .join(' ')
            .trim();
        }

        // Clean
        if (transcript) {
          transcript = transcript
            .replace(/\[BLANK_AUDIO\]|\[MUSIC\]|\[silence\]|\[SOUND\]|\[NOISE\]|\[SPEECH_NOT_RECOGNIZED\]/g, '')
            .replace(/^\s*[.,]\s*/, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
        }

        if (!transcript || this.isGarbageText(transcript)) {
          resolve({ success: false, error: '__NO_SPEECH__' });
          return;
        }

        resolve({ success: true, text: transcript });
      });

      whisper.on('error', (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.currentProcess = null;
        resolve({ success: false, error: `Failed: ${error.message}` });
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  Post-Processing
  // ═══════════════════════════════════════════════════════════════

  private async postProcess(
    rawText: string,
    fuzzyMatch: boolean,
    confidenceScore: boolean,
    audioDurationMs?: number
  ): Promise<{ text?: string; rawText?: string; confidence?: ConfidenceResult; fuzzyChanges?: number }> {
    let finalText = rawText;
    let fuzzyChanges = 0;
    let confidenceResult: ConfidenceResult | undefined;

    if (fuzzyMatch) {
      try {
        const fuzzyResult = this.fuzzyMatcher.process(rawText);
        finalText = fuzzyResult.corrected;
        fuzzyChanges = fuzzyResult.changes.length;
      } catch {}
    }

    if (confidenceScore) {
      try {
        confidenceResult = this.confidenceScorer.analyze(finalText, audioDurationMs);
      } catch {}
    }

    return {
      text: finalText,
      rawText: rawText !== finalText ? rawText : undefined,
      confidence: confidenceResult,
      fuzzyChanges: fuzzyChanges > 0 ? fuzzyChanges : undefined,
    };
  }

  private isGarbageText(text: string): boolean {
    const patterns = [
      /^\s*\.{2,}\s*$/, /^\s*[,.\-?!;\s]+$/,
      /^(thank you|thanks for watching|subscribe)\s*\.?\s*$/i,
      /^(halo|hai|hey|hello|hi|yo)\s*\.?\s*$/i,
      /^(yeah|ya|yep|nope|ok|okay|hm|hmm|umm|uhh|ahh)\s*\.?\s*$/i,
      /^\s*\[.*\]\s*$/, /^\s*-{3,}\s*$/, /^\s*_{3,}\s*$/,
    ];
    return patterns.some(p => p.test(text));
  }

  // ═══════════════════════════════════════════════════════════════
  //  Control & Utility
  // ═══════════════════════════════════════════════════════════════

  cancelTranscription(): void {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGKILL');
      this.currentProcess = null;
    }
  }

  getAvailableModels(): string[] {
    try {
      if (!fs.existsSync(this.modelsPath)) return [];
      return fs.readdirSync(this.modelsPath).filter(f => f.endsWith('.bin')).sort();
    } catch { return []; }
  }

  isWhisperAvailable(): boolean { return fs.existsSync(this.whisperPath); }
  isModelAvailable(model: string): boolean { return fs.existsSync(path.join(this.modelsPath, model)); }

  /**
   * Fast transcription for preview (no post-processing).
   */
  async transcribeFast(
    audioPath: string,
    language: string = 'auto',
    initialPrompt?: string
  ): Promise<{ success: boolean; text?: string }> {
    const result = await this.runWhisper(
      audioPath,
      '', // Will be resolved
      this.selectOptimalModel(''),
      language,
      PROFILES.fast,
      this.buildInitialPrompt(initialPrompt, language),
      {},
      5000
    );
    return { success: result.success, text: result.text };
  }

  /**
   * Benchmark model.
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
    const result = await this.runWhisper(audioPath, modelPath, model, language, PROFILES.balanced, this.buildInitialPrompt(initialPrompt, language), {}, 10000);
    return { success: result.success, text: result.text, elapsedMs: Date.now() - start, error: result.error };
  }
}
