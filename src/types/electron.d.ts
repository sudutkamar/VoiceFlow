interface ElectronAPI {
  // Dictation
  startRecording: () => Promise<{ success: boolean; error?: string }>;
  stopRecording: () => Promise<{ success: boolean; error?: string }>;
  getTranscript: () => Promise<{ success: boolean; text?: string; error?: string }>;
  toggleDictation: () => Promise<void>;
  sendAudioData: (data: { buffer: ArrayBuffer | Uint8Array | number[]; mimeType: string; duration: number }) => void;
  cancelTranscription: () => Promise<{ success: boolean }>;

  // Clipboard
  copyText: (text: string) => Promise<{ success: boolean; error?: string }>;
  pasteText: (text: string) => Promise<{ success: boolean; error?: string }>;
  getClipboardText: () => Promise<string>;

  // Mini Window
  showMiniWindow: () => Promise<void>;
  hideMiniWindow: () => Promise<void>;
  resizeMiniWindow: (height: number, width?: number) => Promise<void>;
  setMiniWindowFocusable: (focusable: boolean) => Promise<void>;
  miniWindowReady: () => void;

  // Settings
  getSettings: () => Promise<Record<string, string>>;
  updateSetting: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
  getHistory: (limit?: number) => Promise<any[]>;
  clearHistory: () => Promise<{ success: boolean; error?: string }>;
  deleteHistoryItem: (id: string) => Promise<{ success: boolean; error?: string }>;
  searchHistory: (query: string) => Promise<any[]>;
  exportHistory: () => Promise<{ success: boolean; path?: string; error?: string }>;

  // Dictionary
  getDictionary: () => Promise<any[]>;
  addDictionaryEntry: (phrase: string, replacement: string) => Promise<{ success: boolean; error?: string }>;
  deleteDictionaryEntry: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateDictionaryEntry: (id: string, phrase: string, replacement: string) => Promise<{ success: boolean; error?: string }>;

  // Snippets
  getSnippets: () => Promise<any[]>;
  addSnippet: (trigger: string, output: string) => Promise<{ success: boolean; error?: string }>;
  deleteSnippet: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateSnippet: (id: string, trigger: string, output: string) => Promise<{ success: boolean; error?: string }>;

  // Hotkey
  updateHotkey: (newHotkey: string) => Promise<{ success: boolean; error?: string }>;

  // Models
  getModelsPath: () => Promise<string>;
  getModelsBaseDir: () => Promise<string>;
  getCustomModelsPath: () => Promise<string | null>;
  chooseModelsFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;
  resetModelsPath: () => Promise<{ success: boolean; path?: string }>;
  getAvailableModels: () => Promise<any[]>;
  scanModelsFolder: () => Promise<any[]>;
  downloadModel: (model: string) => Promise<{ success: boolean; error?: string }>;
  forceDownloadModel: (model: string) => Promise<{ success: boolean; error?: string }>;
  pauseDownload: () => Promise<{ success: boolean; error?: string }>;
  resumeDownload: () => Promise<{ success: boolean; error?: string }>;
  cancelDownload: () => Promise<void>;
  getDownloadProgress: () => Promise<{ progress: number; state: string; modelName?: string | null; downloadedBytes?: number; totalBytes?: number }>;
  isModelDownloaded: (model: string) => Promise<boolean>;
  hasInterruptedDownload: () => Promise<boolean>;
  getInterruptedDownloadInfo: () => Promise<{ modelName: string; progress: number } | null>;
  deleteModel: (model: string) => Promise<boolean>;
  hasAnyModel: () => Promise<boolean>;
  setSpeedLimit: (bytesPerSecond: number) => Promise<{ success: boolean }>;
  getSpeedLimit: () => Promise<{ bytesPerSecond: number }>;

  // Adaptive Learning
  learnCorrection: (original: string, corrected: string) => Promise<{ success: boolean; error?: string }>;
  getLearnedCorrections: () => Promise<any[]>;
  deleteLearnedCorrection: (id: string) => Promise<{ success: boolean }>;
  clearLearnedCorrections: () => Promise<{ success: boolean }>;
  getAdaptiveStats: () => Promise<{ total: number; totalFrequency: number; avgConfidence: number }>;

  // Dictionary (export/import)
  exportDictionary: () => Promise<{ success: boolean; data?: string; error?: string }>;
  importDictionary: (csvContent: string) => Promise<{ success: boolean; imported?: number; skipped?: number; errors?: string[]; error?: string }>;

  // Hotkey
  updateHotkey: (newHotkey: string) => Promise<{ success: boolean; error?: string }>;
  setLogLevel: (level: string) => Promise<{ success: boolean; error?: string }>;

  // App
  checkForUpdates: () => Promise<void>;
  onUpdateDownloadProgress: (callback: (data: { percent: number; transferred: number; total: number }) => void) => () => void;

  // LLM Post-Processing
  llmCheckAvailability: () => Promise<{ success: boolean; available: boolean; hasCli: boolean; binaryDownloaded: boolean; models: Array<{ name: string; sizeBytes: number }>; error?: string }>;
  llmGetModels: () => Promise<{ success: boolean; models: Array<{ name: string; sizeBytes: number }>; error?: string }>;
  llmDownloadModel: (modelName: string) => Promise<{ success: boolean; error?: string }>;
  llmDeleteModel: (modelName: string) => Promise<{ success: boolean; error?: string }>;
  llmPauseDownload: () => Promise<{ success: boolean }>;
  llmResumeDownload: () => Promise<{ success: boolean }>;
  llmCancelDownload: () => Promise<{ success: boolean }>;
  llmGetDownloadState: () => Promise<{ state: string; modelName: string; progress: number; downloadedBytes: number; totalBytes: number }>;
  llmTestProcess: (text: string, modelName?: string) => Promise<{ success: boolean; text?: string; processingMs?: number; model?: string; error?: string }>;
  llmGetModelsPath: () => Promise<string>;
  llmChooseModelsFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;
  llmScanModelsFolder: () => Promise<{ success: boolean; models?: Array<{ name: string; sizeBytes: number }>; error?: string }>;
  llmDownloadBinary: () => Promise<{ success: boolean; error?: string }>;
  llmCancelBinaryDownload: () => Promise<{ success: boolean }>;
  llmGetBinaryDownloadState: () => Promise<{ state: string; progress: number; downloadedBytes: number; totalBytes: number }>;
  llmCheckBinary: () => Promise<{ downloaded: boolean }>;
  openExternal: (url: string) => Promise<void>;

  // GPU / CUDA
  getGpuStatus: () => Promise<{ hasGpu: boolean; mode: string; whisperDir: string; cpuDir: string; gpuDir: string; cudaDllsPresent?: boolean; needsDownload?: boolean; downloadUrl?: string }>;
  getGpuPath: () => Promise<string>;
  chooseGpuFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;
  scanGpuFolder: () => Promise<{ present: string[]; missing: string[]; total: number }>;
  resetGpuPath: () => Promise<{ success: boolean; path?: string }>;
  downloadCuda: () => Promise<{ success: boolean; error?: string }>;
  pauseCudaDownload: () => Promise<void>;
  resumeCudaDownload: () => Promise<void>;
  cancelCudaDownload: () => Promise<void>;
  getCudaDownloadProgress: () => Promise<{ state: string; progress: number; downloadedBytes: number; totalBytes: number }>;
  deleteWhisperEngine: (type: 'cpu' | 'gpu') => Promise<{ success: boolean; deletedFiles?: number; error?: string }>;

  // App
  getAppState: () => Promise<string>;
  getTargetApp: () => Promise<string>;
  getVersion: () => Promise<string>;
  isAutoStart: () => Promise<boolean>;
  setAutoStart: (enable: boolean) => Promise<{ success: boolean }>;
  quitApp: () => Promise<void>;
  minimizeToTray: () => Promise<void>;
  showMain: (page?: string) => Promise<void>;
  minimizeToBar: () => Promise<void>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  clearCache: () => Promise<{ success: boolean; filesCleared?: number; error?: string }>;

  // Learning (legacy aliases — kept for backward compat)
  // see adaptive learning above

  // Benchmark
  runBenchmark: (audioBuffer: number[], models: string[]) => Promise<{ success: boolean; error?: string }>;

  // Events
  onStateChange: (callback: (state: string) => void) => () => void;
  onTranscriptReady: (callback: (data: any) => void) => () => void;
  onError: (callback: (error: string) => void) => () => void;
  onRecordingTime: (callback: (time: number) => void) => () => void;
  onStartRecording: (callback: () => void) => () => void;
  onStopRecording: (callback: (duration: number) => void) => () => void;
  onCancelRecording: (callback: () => void) => () => void;
  onNavigate: (callback: (page: string) => void) => () => void;
  onPartialTranscript: (callback: (text: string) => void) => () => void;
  onDownloadProgress: (callback: (data: { progress: number; state: string; downloadedBytes: number; totalBytes: number; modelName?: string | null }) => void) => () => void;
  onCudaDownloadProgress: (callback: (data: { state: string; progress: number; downloadedBytes: number; totalBytes: number }) => void) => () => void;
  onMiniWindowUpdate: (callback: (data: any) => void) => () => void;
  onWpmUpdate: (callback: (wpm: number) => void) => () => void;
  onHotkeyRegistered: (callback: (hotkey: string) => void) => () => void;
  onTargetAppChanged: (callback: (appName: string) => void) => () => void;
  onBenchmarkProgress: (callback: (data: { model: string; status: string; text?: string; elapsedMs?: number; error?: string }) => void) => () => void;
  onThemeChange: (callback: (theme: string) => void) => () => void;
  onReloadSettings: (callback: () => void) => () => void;
  onLlmBinaryDownloadProgress: (callback: (data: { progress: number; state: string; downloadedBytes: number; totalBytes: number }) => void) => () => void;
  onLlmDownloadProgress: (callback: (data: { progress: number; state: string; modelName: string; downloadedBytes: number; totalBytes: number }) => void) => () => void;
  onMiniWindowResize: (callback: (data: { width: number; height: number }) => void) => () => void;
}

interface Window {
  electronAPI: ElectronAPI;
  voiceflowSoundEnabled?: boolean;
}
