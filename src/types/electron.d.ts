interface ElectronAPI {
  // Dictation
  startRecording: () => Promise<{ success: boolean; error?: string }>;
  stopRecording: () => Promise<{ success: boolean; error?: string }>;
  getTranscript: () => Promise<{ success: boolean; text?: string; error?: string }>;
  toggleDictation: () => Promise<void>;
  sendAudioData: (data: { buffer: number[]; mimeType: string; duration: number }) => void;

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

  // Dictionary & Snippets
  getDictionary: () => Promise<any[]>;
  addDictionaryEntry: (phrase: string, replacement: string) => Promise<{ success: boolean }>;
  deleteDictionaryEntry: (id: string) => Promise<{ success: boolean }>;
  getSnippets: () => Promise<any[]>;
  addSnippet: (trigger: string, output: string) => Promise<{ success: boolean }>;
  deleteSnippet: (id: string) => Promise<{ success: boolean }>;

  // Hotkey
  updateHotkey: (hotkey: string) => Promise<{ success: boolean; error?: string }>;

  // Models
  getModelsPath: () => Promise<string>;
  setModelsPath: (p: string) => Promise<{ success: boolean }>;
  chooseModelsFolder: () => Promise<{ success: boolean; path?: string }>;
  resetModelsPath: () => Promise<{ success: boolean }>;
  getAvailableModels: () => Promise<any[]>;
  scanModelsFolder: () => Promise<any[]>;
  downloadModel: (model: string) => Promise<{ success: boolean; error?: string }>;
  forceDownloadModel: (model: string) => Promise<{ success: boolean; error?: string }>;
  pauseDownload: () => Promise<{ success: boolean }>;
  resumeDownload: () => Promise<{ success: boolean }>;
  cancelDownload: () => Promise<{ success: boolean }>;
  getDownloadProgress: () => Promise<{ progress: number; state: string; modelName?: string | null; downloadedBytes: number; totalBytes: number }>;
  isModelDownloaded: (model: string) => Promise<boolean>;
  hasInterruptedDownload: () => Promise<boolean>;
  getInterruptedDownloadInfo: () => Promise<{ modelName: string; progress: number } | null>;
  deleteModel: (model: string) => Promise<{ success: boolean }>;
  hasAnyModel: () => Promise<boolean>;

  // GPU / CUDA
  getGpuStatus: () => Promise<{ hasGpu: boolean; mode: string; whisperDir: string; cpuDir: string; gpuDir: string; cudaDllsPresent?: boolean; needsDownload?: boolean; downloadUrl?: string }>;
  downloadCuda: () => Promise<{ success: boolean; error?: string }>;
  pauseCudaDownload: () => Promise<void>;
  resumeCudaDownload: () => Promise<void>;
  cancelCudaDownload: () => Promise<void>;
  getCudaDownloadProgress: () => Promise<{ state: string; progress: number; downloadedBytes: number; totalBytes: number }>;
  deleteWhisperEngine: (type: 'cpu' | 'gpu') => Promise<{ success: boolean; deletedFiles?: number; error?: string }>;

  // App
  getVersion: () => Promise<string>;
  getAutoStart: () => Promise<boolean>;
  setAutoStart: (enable: boolean) => Promise<void>;
  quitApp: () => Promise<void>;
  minimizeToTray: () => Promise<void>;
  showMain: (page?: string) => Promise<void>;
  minimizeToBar: () => Promise<void>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  clearCache: () => Promise<{ success: boolean; filesCleared?: number; error?: string }>;
  getTargetApp: () => Promise<string>;

  // Learning
  getLearnedCorrections: () => Promise<any[]>;
  getAdaptiveStats: () => Promise<any>;
  deleteLearnedCorrection: (id: string) => Promise<{ success: boolean }>;
  clearLearnedCorrections: () => Promise<{ success: boolean }>;

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
}

interface Window {
  electronAPI: ElectronAPI;
  voiceflowSoundEnabled?: boolean;
}
