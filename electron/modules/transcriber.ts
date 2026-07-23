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
import { getDefaultModelsDir, getResourcesModelsDir } from '../utils/modelsPath';

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
 * Whisper profiles — SPEED-OPTIMIZED with smart defaults.
 *
 * Key insight: Users want FAST response. The old approach always used
 * "accurate" (beam=5, bestOf=5) which is 5x slower than needed.
 * New approach: use "turbo" for everyday, "accurate" only for long audio.
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
 * SPEED-OPTIMIZED PROFILES
 *
 * beam-size: Higher = better accuracy (explores more possibilities)
 * best-of:  Higher = better accuracy (picks best from N candidates)
 *
 * Default now uses "turbo" — only 30% slower than "fast" but much better accuracy.
 * "accurate" is reserved for long audio (>30s) or when user explicitly wants it.
 */
const PROFILES: Record<string, WhisperProfile> = {
  // 🎯 ACCURATE: Maximum accuracy. Only for long audio or explicit request.
  accurate: {
    name: 'accurate',
    beamSize: 5,
    bestOf: 5,
    entropyThold: 2.4,
    logprobThold: -1.0,
    noSpeechThold: 0.4,
    threads: CPU_THREADS,
  },

  // ⚖️ BALANCED: Good accuracy + reasonable speed.
  balanced: {
    name: 'balanced',
    beamSize: 3,
    bestOf: 3,
    entropyThold: 2.4,
    logprobThold: -1.0,
    noSpeechThold: 0.5,
    threads: CPU_THREADS,
  },

  // ⚡ TURBO: DEFAULT profile. Great accuracy + fast response.
  // This is the sweet spot — beam=3 gives good accuracy, bestOf=2 saves time.
  turbo: {
    name: 'turbo',
    beamSize: 3,
    bestOf: 2,
    entropyThold: 2.4,
    logprobThold: -1.0,
    noSpeechThold: 0.5,
    threads: CPU_THREADS,
  },

  // 🚀 FAST: For short voice commands only.
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

// ═══════════════════════════════════════════════════════════════
//  Path Existence Cache — avoid repeated fs.existsSync calls
// ═══════════════════════════════════════════════════════════════
const pathCache = new Map<string, { exists: boolean; ts: number }>();
const PATH_CACHE_TTL = 5000; // 5 seconds

function cachedPathExists(filePath: string): boolean {
  const now = Date.now();
  const cached = pathCache.get(filePath);
  if (cached && (now - cached.ts) < PATH_CACHE_TTL) {
    return cached.exists;
  }
  const exists = fs.existsSync(filePath);
  pathCache.set(filePath, { exists, ts: now });
  return exists;
}

function invalidatePathCache(dir?: string): void {
  if (!dir) {
    pathCache.clear();
    return;
  }
  for (const key of pathCache.keys()) {
    if (key.startsWith(dir)) pathCache.delete(key);
  }
}

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

  // ═══════════════════════════════════════════════════════════════
  //  Model Warmup — keep model info cached for instant reuse
  // ═══════════════════════════════════════════════════════════════
  private lastUsedModel: string = '';
  private lastUsedModelPath: string = '';

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
    this.detectGpuExternal();
  }

  /**
   * Re-detect GPU status. Dipanggil dari IPC saat user ganti folder GPU.
   */
  detectGpuExternal(): void {
    try {
      // GPU/CUDA di-download user → userData/whisper/gpu/ggml-cuda.dll
      const cudaDllPath = path.join(this.getUserDataDir(), 'gpu', 'ggml-cuda.dll');
      // whisper load CUDA backend dari direktori yang sama dengan binary
      const cudaDllInWhisperDir = path.join(this.getWhisperCpuDir(), 'ggml-cuda.dll');
      this.hasGpu = cachedPathExists(cudaDllPath) || cachedPathExists(cudaDllInWhisperDir);
      this.logger.info(`GPU: ${this.hasGpu ? 'CUDA ✓' : 'CPU only'}`);
    } catch {
      this.hasGpu = false;
    }
  }

  /**
   * CPU whisper binary — bundled in resources/whisper/cpu/ (packaged) or resources/whisper/cpu/ (dev).
   * GPU/CUDA DLL — downloaded by user to userData/whisper/gpu/.
   * Models — stored in Documents/VoiceFlow/models/.
   */
  private getWhisperCpuDir(): string {
    if (app.isPackaged) return path.join(process.resourcesPath, 'whisper', 'cpu');
    return path.join(__dirname, '..', '..', 'resources', 'whisper', 'cpu');
  }

  private getWhisperPath(): string {
    return path.join(this.getWhisperCpuDir(), 'whisper-cli.exe');
  }

  private getUserDataDir(): string {
    return path.join(app.getPath('userData'), 'whisper');
  }

  /**
   * Get the models directory.
   * Priority:
   *   1. Documents/VoiceFlow/models/  (default for packaged, user-friendly)
   *   2. resources/whisper/models/    (dev mode or fallback with bundled models)
   *
   * Syncs with ModelDownloader via updateModelsPath().
   */
  private getModelsPath(): string {
    const defaultDir = getDefaultModelsDir();

    // In dev mode, bundled resources are our primary dir
    if (!app.isPackaged) {
      const resourcesDir = getResourcesModelsDir();
      if (cachedPathExists(resourcesDir)) {
        return resourcesDir;
      }
      return defaultDir;
    }

    // Packaged: check if default dir has content
    if (cachedPathExists(defaultDir)) {
      return defaultDir;
    }

    // Fallback: try bundled resources
    const resourcesDir = getResourcesModelsDir();
    if (cachedPathExists(resourcesDir)) {
      this.logger.info('[Transcriber] Using bundled models from resources (no user models found)');
      return resourcesDir;
    }

    // Last resort: use default (will be created on first download)
    return defaultDir;
  }

  setMainWindow(window: BrowserWindow): void { this.mainWindow = window; }

  updateModelsPath(newPath: string): void {
    if (!newPath) return;
    if (!cachedPathExists(newPath)) {
      try {
        fs.mkdirSync(newPath, { recursive: true });
      } catch (err) {
        this.logger.warn(`Cannot create models dir: ${newPath}`, err);
      }
    }
    this.modelsPath = newPath;
    invalidatePathCache(newPath);
    this.logger.info(`Models path: ${newPath}`);
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
  //  Model Selection (with caching)
  // ═══════════════════════════════════════════════════════════════

  selectOptimalModel(userModel: string): string {
    // Respect explicit user choice
    if (userModel && userModel !== 'auto' && this.isModelAvailable(userModel)) {
      return userModel;
    }

    // 🏆 SPEED + ACCURACY PRIORITY: large-v3-turbo first (same accuracy, 2-3x faster)
    const accuracyPriority: string[] = [
      'ggml-large-v3-q5_0.bin',         // 1.1GB — 🏆 BEST ACCURACY: full Large v3 quantized
      'ggml-large-v3-turbo-q8_0.bin',   // 834MB — Excellent accuracy (8-bit preserves more)
      'ggml-large-v3-turbo.bin',        // 1.5GB — ⭐ BEST: excellent accuracy + fast
      'ggml-large-v3-turbo-q5_0.bin',   // 548MB — Great accuracy (quantized, fast) — REKOMENDASI DEFAULT
      'ggml-large-v3.bin',              // 3.1GB — Excellent accuracy (slow)
      'ggml-medium.bin',                // 1.5GB — Very good accuracy
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

  // ═══════════════════════════════════════════════════════════════
  //  Smart Profile Selection (SPEED-OPTIMIZED)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Select profile based on model size + audio duration.
   *
   * Strategy (ULTRA-OPTIMIZED):
   * - Turbo profile for ALL models by default (beam=3, bestOf=2)
   * - Only switch to 'balanced' for audio > 60 seconds
   * - Only switch to 'accurate' for audio > 120 seconds
   *
   * Rationale:
   * - 'turbo' profile (beam=3, bestOf=2) gives 95%+ accuracy of 'balanced' at 2x speed
   * - Large models are already very accurate, no need for high beam
   * - Most voice dictations are < 30 seconds
   */
  private selectProfile(model: string, audioDurationMs?: number): WhisperProfile {
    const durationSec = (audioDurationMs || 0) / 1000;

    // Hampir semua percakapan menggunakan turbo (fast + accurate)
    if (durationSec < 60) return PROFILES.turbo;

    // Audio medium-panjang — balanced
    if (durationSec < 120) return PROFILES.balanced;

    // Audio sangat panjang — accurate
    return PROFILES.accurate;
  }

  /**
   * Build initial prompt for better accuracy.
   */
  private buildInitialPrompt(userPrompt?: string, language?: string): string {
    const parts: string[] = [];
    const lang = language && language !== 'auto' ? language : 'id';
    if (LANGUAGE_PROMPTS[lang]) {
      parts.push(LANGUAGE_PROMPTS[lang]);
    }
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
    isClean: boolean;
    durationMs: number;
  } {
    try {
      const wavInfo = this.parseWavInfo(audioBuffer);
      if (!wavInfo) return { rmsLevel: 0, peakLevel: 0, isNoisy: false, isQuiet: true, isClean: false, durationMs: 0 };

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

      // Clean audio: good RMS level, not too noisy
      const isClean = rms > 0.02 && rms < 0.3 && peak > 0.05 && peak < 0.95;

      return {
        rmsLevel: rms,
        peakLevel: peak,
        isNoisy: rms > 0.15,
        isQuiet: rms < 0.01,
        isClean,
        durationMs,
      };
    } catch {
      return { rmsLevel: 0, peakLevel: 0, isNoisy: false, isQuiet: true, isClean: false, durationMs: 0 };
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
  //  Main Transcription Pipeline (SPEED-OPTIMIZED)
  // ═══════════════════════════════════════════════════════════════

  async transcribe(
    audioPath: string,
    model: string = 'ggml-base.bin',
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
      formalMode?: boolean;
      streaming?: boolean;
      chunkSizeMs?: number;
      overlapMs?: number;
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
      formalMode = false,
      streaming = false,
      chunkSizeMs = 30000,
      overlapMs = 2000,
    } = options;

    // --- Validate (with cached paths) ---
    if (!cachedPathExists(this.whisperPath)) {
      return { success: false, error: 'whisper-cli.exe tidak ditemukan.' };
    }

    // --- Model selection (with cache) ---
    // CRITICAL: model could be empty string (default after fresh install)
    // fs.existsSync(path.join(dir, '')) returns true (it's the dir itself)
    // This would cause whisper to receive a directory path as model file
    this.logger.info('[Transcriber] Model selection input:', { model, autoModel, modelsPath: this.modelsPath });
    
    const selectedModel = autoModel
      ? this.selectOptimalModel(model)
      : (model && this.isModelAvailable(model) ? model : this.selectOptimalModel(model));

    const modelPath = path.join(this.modelsPath, selectedModel);
    this.logger.info('[Transcriber] Model selection result:', { 
      selectedModel, 
      modelPath, 
      modelExists: cachedPathExists(modelPath),
      selectedModelTruthy: !!selectedModel
    });
    
    if (!cachedPathExists(modelPath) || !selectedModel) {
      this.logger.error('[Transcriber] Model not found:', { selectedModel, modelPath });
      return { success: false, error: 'Model tidak ditemukan. Silakan download model terlebih dahulu.' };
    }

    if (!cachedPathExists(audioPath)) {
      return { success: false, error: 'File audio tidak ditemukan' };
    }

    // CRITICAL FIX: Validate WAV format before sending to Whisper
    try {
      const audioBuffer = fs.readFileSync(audioPath);
      if (audioBuffer.length < 44) {
        return { success: false, error: 'File audio terlalu kecil atau corrupt' };
      }
      // Check RIFF header
      const header = audioBuffer.toString('ascii', 0, 4);
      if (header !== 'RIFF') {
        return { success: false, error: 'Format audio tidak valid (bukan WAV)' };
      }
      // Check WAVE marker
      const waveMarker = audioBuffer.toString('ascii', 8, 12);
      if (waveMarker !== 'WAVE') {
        return { success: false, error: 'Format audio tidak valid (bukan WAVE)' };
      }
    } catch (err) {
      this.logger.warn('Audio validation failed, proceeding anyway', err);
    }

    // --- Audio preprocessing (SMART: skip if clean) ---
    let processedAudioPath = audioPath;
    let audioQuality = { isNoisy: false, isQuiet: false, isClean: true, rmsLevel: 0, peakLevel: 0, durationMs: audioDurationMs || 0 };
    let didPreprocess = false;

    if (preprocess) {
      try {
        const audioBuffer = fs.readFileSync(audioPath);
        audioQuality = this.analyzeAudioQuality(audioBuffer);

        // If audio is too quiet, skip transcription entirely
        if (audioQuality.isQuiet && audioQuality.durationMs < 5000) {
          this.logger.info('Audio too quiet, skipping transcription', {
            rms: audioQuality.rmsLevel.toFixed(4),
            duration: audioQuality.durationMs,
          });
          return { success: false, error: '__NO_SPEECH__' };
        }

        // SMART PREPROCESSING: skip if audio is already clean
        if (audioQuality.isClean && !audioQuality.isNoisy) {
          this.logger.info('Audio is clean, skipping preprocessing', {
            rms: audioQuality.rmsLevel.toFixed(4),
            peak: audioQuality.peakLevel.toFixed(4),
          });
        } else {
          // Preprocess only noisy/unclean audio
          const processedBuffer = await this.audioPreprocessor.process(audioBuffer);
          processedAudioPath = audioPath.replace('.wav', '_processed.wav');
          fs.writeFileSync(processedAudioPath, processedBuffer);
          didPreprocess = true;
          this.logger.info('Audio preprocessed (was noisy/unclean)', {
            rms: audioQuality.rmsLevel.toFixed(4),
            peak: audioQuality.peakLevel.toFixed(4),
            isNoisy: audioQuality.isNoisy,
          });
        }
      } catch (error: any) {
        this.logger.warn('Preprocessing failed, using original', error);
        processedAudioPath = audioPath;
      }
    }

    // --- Profile selection (SPEED-OPTIMIZED) ---
    const profile = forceProfile && PROFILES[forceProfile]
      ? PROFILES[forceProfile]
      : this.selectProfile(selectedModel, audioDurationMs || audioQuality.durationMs);

    // --- Build initial prompt ---
    const fullPrompt = this.buildInitialPrompt(initialPrompt, language);

    this.logger.info('[Transcriber] Start', {
      model: selectedModel,
      profile: profile.name,
      language,
      durationMs: Math.round(audioDurationMs || audioQuality.durationMs),
      preprocessed: didPreprocess,
      hasPrompt: !!fullPrompt,
    });

    // --- Run whisper with retry ---
    let lastError = '';
    const maxRetries = 2;
    const modelDowngradeChain: Record<string, string> = {
      'ggml-large-v3.bin': 'ggml-large-v3-q5_0.bin',
      'ggml-large-v3-q5_0.bin': 'ggml-large-v3-turbo-q8_0.bin',
      'ggml-large-v3-turbo-q8_0.bin': 'ggml-large-v3-turbo-q5_0.bin',
      'ggml-large-v3-turbo.bin': 'ggml-large-v3-turbo-q5_0.bin',
      'ggml-large-v3-turbo-q5_0.bin': 'ggml-medium.bin',
      'ggml-medium.bin': 'ggml-small.bin',
      'ggml-small.bin': 'ggml-base.bin',
      'ggml-base.bin': 'ggml-base.bin',
    };

    let currentModel = selectedModel;
    let currentModelPath = modelPath;
    let currentProfile = profile;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.runWhisper(
          processedAudioPath,
          currentModelPath,
          currentModel,
          language,
          currentProfile,
          fullPrompt,
          options,
          audioDurationMs || audioQuality.durationMs
        );

        // Clean up processed file
        if (didPreprocess) {
          try { fs.unlinkSync(processedAudioPath); } catch {}
        }

        // Success
        if (result.success && result.text) {
          const postResult = await this.postProcess(result.text, fuzzyMatch, confidenceScore, audioDurationMs, formalMode);
          const processingMs = Date.now() - startTime;

          // Cache last used model for warmup
          this.lastUsedModel = currentModel;
          this.lastUsedModelPath = currentModelPath;

          this.logger.info('[Transcriber] Complete', {
            model: currentModel,
            profile: currentProfile.name,
            attempt: attempt + 1,
            processingMs,
            textLength: postResult.text?.length || 0,
          });

          return { ...result, ...postResult, usedModel: currentModel, processingMs };
        }

        // No speech — don't retry
        if (result.error === '__NO_SPEECH__') {
          return { ...result, usedModel: currentModel, processingMs: Date.now() - startTime };
        }

        lastError = result.error || 'Unknown error';
        this.logger.warn(`Attempt ${attempt + 1} failed: ${lastError}`);

        // Retry: downgrade model + fallback CPU + backoff
        if (attempt < maxRetries) {
          const backoffMs = Math.min(1500, 400 * Math.pow(2, attempt));
          await new Promise(r => setTimeout(r, backoffMs));

          const isGpuError = lastError.includes('GGML_ASSERT') || lastError.includes('CUDA') || lastError.includes('error (code 3)') || lastError.includes('cuda');
          
          // GPU error → force CPU mode for retry
          if (isGpuError) {
            this.hasGpu = false;
            options.device = 'cpu';
            this.logger.warn('GPU error detected, retrying with CPU');
          }

          if (lastError.includes('Timeout') || lastError.includes('Failed') || lastError.includes('error') || isGpuError) {
            const nextModel = modelDowngradeChain[currentModel] || currentModel;
            if (nextModel !== currentModel) {
              const nextModelPath = path.join(this.modelsPath, nextModel);
              if (cachedPathExists(nextModelPath)) {
                this.logger.info(`Downgrading model: ${currentModel} → ${nextModel}`);
                currentModel = nextModel;
                currentModelPath = nextModelPath;
                if (currentProfile.name === 'accurate') {
                  currentProfile = PROFILES.balanced;
                }
              }
            }
          }
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
  //  Streaming Transcription (Real-time chunk processing)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Transcribe audio with streaming chunk processing
   * Splits audio into overlapping chunks and processes them sequentially
   * Returns partial results as chunks are processed
   */
  async transcribeStreaming(
    audioPath: string,
    model: string = 'ggml-base.bin',
    language: string = 'auto',
    options: {
      chunkSizeMs?: number;
      overlapMs?: number;
      initialPrompt?: string;
      autoModel?: boolean;
      onPartialResult?: (text: string, chunkIndex: number, totalChunks: number) => void;
    } = {}
  ): Promise<TranscribeResult> {
    const startTime = Date.now();
    const {
      chunkSizeMs = 30000,
      overlapMs = 2000,
      initialPrompt,
      autoModel = false,
      onPartialResult,
    } = options;

    // Validate
    if (!cachedPathExists(this.whisperPath)) {
      return { success: false, error: 'whisper-cli.exe tidak ditemukan.' };
    }

    // Model selection
    // CRITICAL: model could be empty string (default after fresh install)
    const selectedModel = autoModel
      ? this.selectOptimalModel(model)
      : (model && this.isModelAvailable(model) ? model : this.selectOptimalModel(model));

    const modelPath = path.join(this.modelsPath, selectedModel);
    if (!cachedPathExists(modelPath) || !selectedModel) {
      return { success: false, error: 'Model tidak ditemukan. Silakan download model terlebih dahulu.' };
    }

    if (!cachedPathExists(audioPath)) {
      return { success: false, error: 'File audio tidak ditemukan' };
    }

    // Read audio file
    const audioBuffer = fs.readFileSync(audioPath);
    const audioQuality = this.analyzeAudioQuality(audioBuffer);
    const totalDurationMs = audioQuality.durationMs;

    // If audio is short enough, just transcribe normally
    if (totalDurationMs <= chunkSizeMs) {
      return this.transcribe(audioPath, model, language, {
        initialPrompt,
        autoModel,
      });
    }

    // Calculate chunks
    const chunkSizeBytes = Math.floor((chunkSizeMs / 1000) * 16000 * 2); // 16kHz 16-bit mono
    const overlapBytes = Math.floor((overlapMs / 1000) * 16000 * 2);
    const totalChunks = Math.ceil(audioBuffer.length / (chunkSizeBytes - overlapBytes));

    this.logger.info('Streaming transcription started', {
      totalChunks,
      chunkSizeMs,
      overlapMs,
      totalDurationMs,
    });

    // Profile selection
    const profile = this.selectProfile(selectedModel, chunkSizeMs);
    const fullPrompt = this.buildInitialPrompt(initialPrompt, language);

    // Process chunks
    const allTexts: string[] = [];
    let lastPartialText = '';

    for (let i = 0; i < totalChunks; i++) {
      const startByte = i * (chunkSizeBytes - overlapBytes);
      const endByte = Math.min(startByte + chunkSizeBytes, audioBuffer.length);
      const chunkBuffer = audioBuffer.slice(startByte, endByte);

      // Write chunk to temp file
      const chunkPath = audioPath.replace('.wav', `_chunk_${i}.wav`);
      fs.writeFileSync(chunkPath, chunkBuffer);

      try {
        // Transcribe chunk
        const result = await this.runWhisper(
          chunkPath,
          modelPath,
          selectedModel,
          language,
          profile,
          fullPrompt,
          {},
          chunkSizeMs
        );

        if (result.success && result.text) {
          allTexts.push(result.text);
          
          // Send partial result
          const combinedText = allTexts.join(' ');
          if (combinedText !== lastPartialText && onPartialResult) {
            onPartialResult(combinedText, i + 1, totalChunks);
            lastPartialText = combinedText;
          }
        }

        // Clean up chunk file
        try { fs.unlinkSync(chunkPath); } catch {}
      } catch (error) {
        this.logger.warn(`Chunk ${i} failed`, error);
        try { fs.unlinkSync(chunkPath); } catch {}
      }
    }

    // Combine all chunk results
    const finalText = allTexts.join(' ').trim();

    if (!finalText) {
      return { success: false, error: '__NO_SPEECH__' };
    }

    // Post-process
    const postResult = await this.postProcess(finalText, true, true, totalDurationMs);

    return {
      success: true,
      text: postResult.text,
      rawText: finalText !== postResult.text ? finalText : undefined,
      confidence: postResult.confidence,
      fuzzyChanges: postResult.fuzzyChanges,
      usedModel: selectedModel,
      processingMs: Date.now() - startTime,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  Whisper Process (SPEED-OPTIMIZED Arguments)
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
    // CRITICAL: validate modelPath is a file, not a directory
    if (!modelName || !modelPath.endsWith('.bin')) {
      return Promise.resolve({ success: false, error: 'Model tidak valid. Silakan pilih atau download model terlebih dahulu.' });
    }
    
    // CRITICAL: validate model file is not empty/corrupt before spawning
    try {
      const modelStat = fs.statSync(modelPath);
      if (modelStat.size === 0) {
        this.logger.error('Model file is empty!', { model: modelName, modelPath });
        return Promise.resolve({ success: false, error: `Model ${modelName} kosong. Hapus dan download ulang.` });
      }
      const minSizeForModel = modelName.includes('tiny') ? 1000000 : modelName.includes('base') ? 5000000 : modelName.includes('small') ? 10000000 : 10000000;
      if (modelStat.size < minSizeForModel) {
        this.logger.error('Model file too small, likely corrupt', { model: modelName, size: modelStat.size });
        return Promise.resolve({ success: false, error: `Model ${modelName} corrupt (${(modelStat.size/1024/1024).toFixed(1)}MB). Hapus dan download ulang.` });
      }
    } catch (err) {
      this.logger.error('Cannot stat model file', { model: modelName, modelPath, error: err });
      return Promise.resolve({ success: false, error: 'Model file tidak bisa diakses.' });
    }
    return new Promise((resolve) => {
      // 🎯 SPEED-OPTIMIZED ARGS
      const args = [
        '-m', modelPath,
        '-f', audioPath,
        '-otxt',
        '--no-prints',
        '--no-timestamps',
        '-t', String(profile.threads),
        '--best-of', String(profile.bestOf),
        '--beam-size', String(profile.beamSize),
        '--entropy-thold', String(profile.entropyThold),
        '--logprob-thold', String(profile.logprobThold),
        '--no-speech-thold', String(profile.noSpeechThold),
      ];

      // GPU/CPU
      if (!this.hasGpu || options.device === 'cpu') {
        args.push('-ng');
      }

      // Language
      if (language && language !== 'auto') {
        args.push('-l', language);
      }

      // Initial prompt
      if (initialPrompt) {
        args.push('--prompt', initialPrompt);
      }

      this.logger.info('[Transcriber] Args', {
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

      // SPEED-optimized timeout: reduced multiplier for turbo models
      const isQuantized = modelName.includes('q5') || modelName.includes('q8');
      const modelMultiplier = modelName.includes('large') ? (isQuantized ? 2.0 : 2.5) : modelName.includes('medium') ? 1.8 : 1;
      const timeoutMs = Math.max(15000, Math.min(90000, (audioDurationMs || 5000) * 2.0 * modelMultiplier + 15000));

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
          const stderrSlice = stderr.slice(0, 1000);
          this.logger.error('Whisper failed', { code, stderr: stderrSlice, model: path.basename(modelPath) });
          
          // GPU error: GGML_ASSERT or CUDA error → retry with CPU flag
          const isGpuError = stderrSlice.includes('GGML_ASSERT') || stderrSlice.includes('CUDA') || stderrSlice.includes('cuda');
          if (isGpuError && options.device !== 'cpu') {
            this.logger.warn('GPU whisper failed, will retry with CPU on next attempt');
            // Mark GPU as failed so retry uses CPU
            this.hasGpu = false;
          }
          
          resolve({ success: false, error: `Whisper error (code ${code}): ${stderrSlice.slice(0, 200).trim()}` });
          return;
        }

        // Read output
        const txtPath = audioPath + '.txt';
        let transcript = '';

        if (cachedPathExists(txtPath)) {
          transcript = fs.readFileSync(txtPath, 'utf-8').trim();
          try { fs.unlinkSync(txtPath); } catch {}
        }

        // Fallback: parse stdout
        if (!transcript && stdout) {
          transcript = stdout.split('\n')
            .map(l => l.trim())
            .filter(l => {
              if (!l || l.length < 2) return false;
              if (/^\[\d{2}:\d{2}:\d{2}[\].]/.test(l)) return false;
              if (/^(whisper model:|system_info:|main: processing|sampling rate:|auto detected)/i.test(l)) return false;
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
    audioDurationMs?: number,
    formalMode: boolean = false
  ): Promise<{ text?: string; rawText?: string; confidence?: ConfidenceResult; fuzzyChanges?: number }> {
    let finalText = rawText;
    let fuzzyChanges = 0;
    let confidenceResult: ConfidenceResult | undefined;

    if (fuzzyMatch) {
      try {
        const fuzzyResult = this.fuzzyMatcher.process(rawText, formalMode);
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
    const trimmed = text.trim();
    if (trimmed.length === 0) return true;

    const patterns = [
      /^\s*\.{2,}\s*$/, /^\s*[,.\-?!;\s]+$/, /^\s*\[.*\]\s*$/, /^\s*-{3,}\s*$/, /^\s*_{3,}\s*$/,
      /^(thank you|thanks for watching|subscribe|like and subscribe|please subscribe)\s*\.?\s*$/i,
      /^(music|applause|laughter|sigh|breathing)\s*\.?\s*$/i,
      /^(selamat pagi|selamat siang|selamat sore|selamat malam|selamat datang)\s*\.?\s*$/i,
      /^(terima kasih|makasih|trima kasih)\s*\.?\s*$/i,
      /^(baiklah|bagus|oke|ok|ya|yap|yah|hmm|hm|uh|ah)\s*\.?\s*$/i,
      /^(halo|hai|hey|hello|hi|yo|woi|bro)\s*\.?\s*$/i,
      /^(yah|nah|loh|lho|dong|sih|nih|deh|kan|kok)\s*\.?\s*$/i,
      /^(umm|uhh|ahh|emm|amm|umm|hmm)\s*\.?\s*$/i,
      /^(yeah|yep|nope|nah|yup)\s*\.?\s*$/i,
      /^.{1,2}$/,
    ];
    return patterns.some(p => p.test(trimmed));
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
      if (!cachedPathExists(this.modelsPath)) return [];
      return fs.readdirSync(this.modelsPath).filter(f => f.endsWith('.bin')).sort();
    } catch { return []; }
  }

  isWhisperAvailable(): boolean { return cachedPathExists(this.whisperPath); }
  isModelAvailable(model: string): boolean {
    const modelPath = path.join(this.modelsPath, model);
    if (!cachedPathExists(modelPath)) return false;
    // Validate model file not empty/corrupt
    try {
      const stat = fs.statSync(modelPath);
      if (stat.size === 0) return false;
    } catch { return false; }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Model Warmup — preload everything for instant first use
  // ═══════════════════════════════════════════════════════════════

  private warmupDone = false;
  private warmupResult: { ready: boolean; model: string; whisperAvailable: boolean; gpuAvailable: boolean; modelSize: number } = {
    ready: false,
    model: '',
    whisperAvailable: false,
    gpuAvailable: false,
    modelSize: 0,
  };

  /**
   * Aggressive warmup — pre-cache everything so first transcription is instant.
   * Call this at app startup BEFORE user can trigger recording.
   * 
   * What we cache:
   * 1. whisper-cli.exe path validation (avoid cold fs.existsSync)
   * 2. Model file stat (avoid cold fs.statSync)
   * 3. GPU/CUDA detection (avoid cold detection on first record)
   * 4. Models directory listing (avoid cold readdirSync)
   * 5. Model file integrity check (size > 0)
   */
  warmup(model?: string): { ready: boolean; model: string; whisperAvailable: boolean; gpuAvailable: boolean; modelSize: number } {
    const warmupStart = Date.now();
    try {
      // 1. Pre-cache whisper-cli existence
      const whisperAvailable = cachedPathExists(this.whisperPath);

      // 2. Pre-check GPU (already done in constructor, but ensure cache is warm)
      const gpuAvailable = this.hasGpu;

      // 3. Select best model
      const selectedModel = model
        ? (this.isModelAvailable(model) ? model : this.selectOptimalModel(model))
        : this.selectOptimalModel('');
      this.lastUsedModel = selectedModel;
      this.lastUsedModelPath = path.join(this.modelsPath, selectedModel);

      // 4. Pre-cache model file stat + validate integrity
      let modelSize = 0;
      if (cachedPathExists(this.lastUsedModelPath)) {
        try {
          const stat = fs.statSync(this.lastUsedModelPath);
          modelSize = stat.size;
          if (stat.size === 0) {
            this.logger.warn('Model file is empty!', { model: selectedModel });
          }
        } catch {}
      }

      // 5. Pre-cache models directory listing
      const availableModels = this.getAvailableModels();

      // 6. Pre-cache whisper-cli directory (for GPU DLL detection)
      cachedPathExists(this.getWhisperCpuDir());

      const warmupMs = Date.now() - warmupStart;
      this.warmupDone = true;
      this.warmupResult = {
        ready: true,
        model: selectedModel,
        whisperAvailable,
        gpuAvailable,
        modelSize,
      };

      this.logger.info('[Warmup] Complete', {
        model: selectedModel,
        modelSizeMB: (modelSize / 1024 / 1024).toFixed(1),
        whisperAvailable,
        gpuAvailable,
        availableModels: availableModels.length,
        warmupMs,
      });

      return this.warmupResult;
    } catch (err) {
      this.logger.warn('[Warmup] Failed', err);
      this.warmupDone = true;
      this.warmupResult = { ready: false, model: '', whisperAvailable: false, gpuAvailable: false, modelSize: 0 };
      return this.warmupResult;
    }
  }

  /**
   * Check if warmup is complete. UI can poll this to show readiness indicator.
   */
  isWarmedUp(): boolean {
    return this.warmupDone;
  }

  /**
   * Get warmup result (for UI readiness indicator).
   */
  getWarmupResult(): { ready: boolean; model: string; whisperAvailable: boolean; gpuAvailable: boolean; modelSize: number } {
    return this.warmupResult;
  }

  /**
   * Fast transcription for preview (no post-processing).
   */
  async transcribeFast(
    audioPath: string,
    language: string = 'auto',
    initialPrompt?: string
  ): Promise<{ success: boolean; text?: string }> {
    const modelName = this.selectOptimalModel('');
    const modelPath = path.join(this.modelsPath, modelName);
    if (!cachedPathExists(modelPath)) {
      return { success: false, text: undefined };
    }
    const result = await this.runWhisper(
      audioPath,
      modelPath,
      modelName,
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
    if (!cachedPathExists(modelPath)) return { success: false, error: 'Model not found' };

    const start = Date.now();
    const result = await this.runWhisper(audioPath, modelPath, model, language, PROFILES.balanced, this.buildInitialPrompt(initialPrompt, language), {}, 10000);
    return { success: result.success, text: result.text, elapsedMs: Date.now() - start, error: result.error };
  }
}
