/**
 * Tauri IPC Type Definitions
 * 
 * Replaces electron.d.ts — provides type safety for all Tauri commands
 */

// ═══════════════════════════════════════════════════════════════
//  Command Result Types
// ═══════════════════════════════════════════════════════════════

export interface TranscriptionResult {
  raw: string;
  cleaned: string;
  duration: number;
  wordCount?: number;
  charCount?: number;
  confidence?: ConfidenceResult;
  fuzzyChanges?: number;
  rawText?: string;
}

export interface ConfidenceResult {
  overallConfidence: number;
  quality: string;
  words: any[];
  suggestions: string[];
}

export interface HistoryEntry {
  id: string;
  raw_text: string;
  cleaned_text: string;
  duration_ms: number;
  audio_duration_ms: number;
  created_at: string;
}

export interface DictionaryEntry {
  id: string;
  phrase: string;
  replacement: string;
  created_at: string;
}

export interface SnippetEntry {
  id: string;
  trigger: string;
  output: string;
  created_at: string;
}

export interface LearnedCorrection {
  id: string;
  original: string;
  corrected: string;
  frequency: number;
  confidence: number;
  created_at: string;
}

export interface WarmupResult {
  ready: boolean;
  model: string;
  whisperAvailable: boolean;
  gpuAvailable: boolean;
  modelSize: number;
}

export interface GpuStatus {
  hasGpu: boolean;
  mode: string;
  whisperDir: string;
  cpuDir: string;
  gpuDir: string;
  cudaDllsPresent: boolean;
  needsDownload: boolean;
  downloadUrl?: string;
}

export interface DownloadProgress {
  progress: number;
  state: string;
  downloadedBytes: number;
  totalBytes: number;
  modelName?: string;
}

export interface AdaptiveStats {
  total: number;
  totalFrequency: number;
  avgConfidence: number;
}

// ═══════════════════════════════════════════════════════════════
//  Window.electronAPI Type (backward compatibility)
// ═══════════════════════════════════════════════════════════════

declare global {
  interface Window {
    electronAPI: {
      // Settings
      getSettings: () => Promise<Record<string, string>>;
      updateSetting: (key: string, value: string) => Promise<void>;

      // Recording
      startRecording: () => Promise<void>;
      stopRecording: () => Promise<void>;
      toggleDictation: () => Promise<void>;
      sendAudioData: (data: { buffer: ArrayBuffer | Uint8Array; mimeType: string; duration: number }) => Promise<void>;
      cancelTranscription: () => Promise<void>;
      getTranscript: () => Promise<any>;

      // Clipboard
      copyText: (text: string) => Promise<void>;
      pasteText: (text: string) => Promise<void>;
      getClipboardText: () => Promise<string>;

      // Mini Window
      showMiniWindow: () => Promise<void>;
      hideMiniWindow: () => Promise<void>;
      resizeMiniWindow: (height: number, width?: number) => Promise<void>;
      setMiniWindowFocusable: (focusable: boolean) => Promise<void>;
      miniWindowReady: () => void;

      // History
      getHistory: (limit?: number) => Promise<HistoryEntry[]>;
      clearHistory: () => Promise<void>;
      deleteHistoryItem: (id: string) => Promise<void>;
      searchHistory: (query: string) => Promise<HistoryEntry[]>;
      exportHistory: () => Promise<string>;

      // Dictionary
      getDictionary: () => Promise<DictionaryEntry[]>;
      addDictionaryEntry: (phrase: string, replacement: string) => Promise<void>;
      deleteDictionaryEntry: (id: string) => Promise<void>;
      updateDictionaryEntry: (id: string, phrase: string, replacement: string) => Promise<void>;
      exportDictionary: () => Promise<string>;
      importDictionary: (csvContent: string) => Promise<any>;

      // Snippets
      getSnippets: () => Promise<SnippetEntry[]>;
      addSnippet: (trigger: string, output: string) => Promise<void>;
      deleteSnippet: (id: string) => Promise<void>;
      updateSnippet: (id: string, trigger: string, output: string) => Promise<void>;

      // Models
      getAvailableModels: () => Promise<string[]>;
      scanModelsFolder: () => Promise<string[]>;
      downloadModel: (model: string) => Promise<void>;
      forceDownloadModel: (model: string) => Promise<void>;
      pauseDownload: () => Promise<void>;
      resumeDownload: () => Promise<void>;
      cancelDownload: () => Promise<void>;
      deleteModel: (model: string) => Promise<boolean>;
      getDownloadProgress: () => Promise<DownloadProgress>;
      hasInterruptedDownload: () => Promise<boolean>;
      getInterruptedDownloadInfo: () => Promise<{ modelName: string; progress: number } | null>;
      isModelDownloaded: (model: string) => Promise<boolean>;
      getModelsPath: () => Promise<string>;
      getModelsBaseDir: () => Promise<string>;
      getCustomModelsPath: () => Promise<string | null>;
      chooseModelsFolder: () => Promise<string>;
      resetModelsPath: () => Promise<string>;
      hasAnyModel: () => Promise<boolean>;
      setSpeedLimit: (bytesPerSecond: number) => Promise<void>;
      getSpeedLimit: () => Promise<{ bytesPerSecond: number }>;
      runBenchmark: (audioBuffer: number[], models: string[]) => Promise<any>;

      // GPU
      getGpuStatus: () => Promise<GpuStatus>;
      downloadCuda: () => Promise<any>;
      deleteWhisperEngine: (type: 'cpu' | 'gpu') => Promise<any>;

      // Adaptive Learning
      learnCorrection: (original: string, corrected: string) => Promise<void>;
      getLearnedCorrections: () => Promise<LearnedCorrection[]>;
      deleteLearnedCorrection: (id: string) => Promise<void>;
      clearLearnedCorrections: () => Promise<void>;
      getAdaptiveStats: () => Promise<AdaptiveStats>;

      // LLM
      llmCheckAvailability: () => Promise<any>;
      llmGetModels: () => Promise<any>;
      llmDownloadModel: (modelName: string) => Promise<any>;
      llmDeleteModel: (modelName: string) => Promise<any>;
      llmTestProcess: (text: string, modelName?: string) => Promise<any>;
      llmGetModelsPath: () => Promise<string>;

      // App
      getAppState: () => Promise<string>;
      getTargetApp: () => Promise<string>;
      getVersion: () => Promise<string>;
      isAutoStart: () => Promise<boolean>;
      setAutoStart: (enable: boolean) => Promise<void>;
      quitApp: () => Promise<void>;
      showMain: (page?: string) => Promise<void>;
      minimizeToBar: () => Promise<void>;
      clearCache: () => Promise<any>;

      // Warmup
      getWarmupStatus: () => Promise<WarmupResult>;
      onWarmupComplete: (callback: (data: WarmupResult) => void) => () => void;

      // Log
      setLogLevel: (level: string) => Promise<void>;

      // External
      openExternal: (url: string) => Promise<void>;

      // Update
      onUpdateDownloadProgress: (callback: (data: any) => void) => () => void;

      // ── Event Listeners ──
      onStateChange: (callback: (state: string) => void) => () => void;
      onTranscriptReady: (callback: (data: TranscriptionResult) => void) => () => void;
      onError: (callback: (error: string) => void) => () => void;
      onRecordingTime: (callback: (time: number) => void) => () => void;
      onStartRecording: (callback: () => void) => () => void;
      onStopRecording: (callback: (duration: number) => void) => () => void;
      onCancelRecording: (callback: () => void) => () => void;
      onNavigate: (callback: (page: string) => void) => () => void;
      onPartialTranscript: (callback: (text: string) => void) => () => void;
      onDownloadProgress: (callback: (data: DownloadProgress) => void) => () => void;
      onMiniWindowResize: (callback: (data: { width: number; height: number }) => void) => () => void;
      onThemeChange: (callback: (theme: string) => void) => () => void;
      onReloadSettings: (callback: () => void) => () => void;
      onHotkeyRegistered: (callback: (hotkey: string) => void) => () => void;
      onTargetAppChanged: (callback: (appName: string) => void) => () => void;
    };
  }
}

export {};
