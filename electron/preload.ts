import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
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
  resizeMiniWindow: (height: number) => Promise<void>;
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
  
  // Models
  getAvailableModels: () => Promise<any[]>;
  scanModelsFolder: () => Promise<any[]>;
  downloadModel: (model: string) => Promise<{ success: boolean; error?: string }>;
  forceDownloadModel: (model: string) => Promise<{ success: boolean; error?: string }>;
  pauseDownload: () => Promise<{ success: boolean; error?: string }>;
  resumeDownload: () => Promise<{ success: boolean; error?: string }>;
  cancelDownload: () => Promise<void>;
  runBenchmark: (audioBuffer: number[], models: string[]) => Promise<{ success: boolean; error?: string }>;
  deleteModel: (model: string) => Promise<boolean>;
  getDownloadProgress: () => Promise<{ progress: number; state: string; modelName?: string | null; downloadedBytes?: number; totalBytes?: number }>;
  hasInterruptedDownload: () => Promise<boolean>;
  getInterruptedDownloadInfo: () => Promise<{ modelName: string; progress: number } | null>;
  isModelDownloaded: (model: string) => Promise<boolean>;
  getModelsPath: () => Promise<string>;
  getCustomModelsPath: () => Promise<string | null>;
  chooseModelsFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;
  resetModelsPath: () => Promise<{ success: boolean; path?: string }>;
  hasAnyModel: () => Promise<boolean>;
  
  // Adaptive Learning
  learnCorrection: (original: string, corrected: string) => Promise<{ success: boolean; error?: string }>;
  getLearnedCorrections: () => Promise<any[]>;
  deleteLearnedCorrection: (id: string) => Promise<{ success: boolean }>;
  clearLearnedCorrections: () => Promise<{ success: boolean }>;
  getAdaptiveStats: () => Promise<{ total: number; totalFrequency: number; avgConfidence: number }>;

  // Hotkey
  updateHotkey: (newHotkey: string) => Promise<{ success: boolean; error?: string }>;
  
  // App State
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
  getGpuStatus: () => Promise<{ hasGpu: boolean; mode: string; whisperDir: string; cpuDir: string; gpuDir: string; cudaDllsPresent?: boolean; needsDownload?: boolean; downloadUrl?: string }>;
  clearCache: () => Promise<{ success: boolean; filesCleared?: number; error?: string }>;
  downloadCuda: () => Promise<{ success: boolean; error?: string }>;
  pauseCudaDownload: () => Promise<void>;
  resumeCudaDownload: () => Promise<void>;
  cancelCudaDownload: () => Promise<void>;
  getCudaDownloadProgress: () => Promise<{ state: string; progress: number; downloadedBytes: number; totalBytes: number }>;
  
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

const api: ElectronAPI = {
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  getTranscript: () => ipcRenderer.invoke('get-transcript'),
  toggleDictation: () => ipcRenderer.invoke('toggle-dictation'),
  sendAudioData: (data) => ipcRenderer.send('audio-recorded', data),
  
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  pasteText: (text) => ipcRenderer.invoke('paste-text', text),
  getClipboardText: () => ipcRenderer.invoke('get-clipboard-text'),
  
  showMiniWindow: () => ipcRenderer.invoke('show-mini-window'),
  hideMiniWindow: () => ipcRenderer.invoke('hide-mini-window'),
  resizeMiniWindow: (height: number, width?: number) => ipcRenderer.invoke('resize-mini-window', height, width),
  setMiniWindowFocusable: (focusable: boolean) => ipcRenderer.invoke('set-mini-window-focusable', focusable),
  miniWindowReady: () => ipcRenderer.send('mini-window-ready'),
  
  hasAnyModel: () => ipcRenderer.invoke('has-any-model'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSetting: (key, value) => ipcRenderer.invoke('update-setting', key, value),
  getHistory: (limit) => ipcRenderer.invoke('get-history', limit),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  deleteHistoryItem: (id) => ipcRenderer.invoke('delete-history-item', id),
  searchHistory: (query) => ipcRenderer.invoke('search-history', query),
  exportHistory: () => ipcRenderer.invoke('export-history'),
  
  getDictionary: () => ipcRenderer.invoke('get-dictionary'),
  addDictionaryEntry: (phrase, replacement) =>
    ipcRenderer.invoke('add-dictionary-entry', phrase, replacement),
  deleteDictionaryEntry: (id) => ipcRenderer.invoke('delete-dictionary-entry', id),
  updateDictionaryEntry: (id, phrase, replacement) =>
    ipcRenderer.invoke('update-dictionary-entry', id, phrase, replacement),
  
  getSnippets: () => ipcRenderer.invoke('get-snippets'),
  addSnippet: (trigger, output) => ipcRenderer.invoke('add-snippet', trigger, output),
  deleteSnippet: (id) => ipcRenderer.invoke('delete-snippet', id),
  updateSnippet: (id, trigger, output) => ipcRenderer.invoke('update-snippet', id, trigger, output),
  
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),
  scanModelsFolder: () => ipcRenderer.invoke('scan-models-folder'),
  downloadModel: (model) => ipcRenderer.invoke('download-model', model),
  forceDownloadModel: (model) => ipcRenderer.invoke('force-download-model', model),
  pauseDownload: () => ipcRenderer.invoke('pause-download'),
  resumeDownload: () => ipcRenderer.invoke('resume-download'),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  runBenchmark: (audioBuffer, models) => ipcRenderer.invoke('run-benchmark', audioBuffer, models),
  deleteModel: (model) => ipcRenderer.invoke('delete-model', model),
  getDownloadProgress: () => ipcRenderer.invoke('get-download-progress'),
  hasInterruptedDownload: () => ipcRenderer.invoke('has-interrupted-download'),
  getInterruptedDownloadInfo: () => ipcRenderer.invoke('get-interrupted-download-info'),
  isModelDownloaded: (model) => ipcRenderer.invoke('is-model-downloaded', model),
  getModelsPath: () => ipcRenderer.invoke('get-models-path'),
  getCustomModelsPath: () => ipcRenderer.invoke('get-custom-models-path'),
  chooseModelsFolder: () => ipcRenderer.invoke('choose-models-folder'),
  resetModelsPath: () => ipcRenderer.invoke('reset-models-path'),
  
  learnCorrection: (original, corrected) => ipcRenderer.invoke('learn-correction', original, corrected),
  getLearnedCorrections: () => ipcRenderer.invoke('get-learned-corrections'),
  deleteLearnedCorrection: (id) => ipcRenderer.invoke('delete-learned-correction', id),
  clearLearnedCorrections: () => ipcRenderer.invoke('clear-learned-corrections'),
  getAdaptiveStats: () => ipcRenderer.invoke('get-adaptive-stats'),

  updateHotkey: (newHotkey) => ipcRenderer.invoke('update-hotkey', newHotkey),
  
  getAppState: () => ipcRenderer.invoke('get-app-state'),
  getTargetApp: () => ipcRenderer.invoke('get-target-app'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  isAutoStart: () => ipcRenderer.invoke('is-autostart'),
  setAutoStart: (enable) => ipcRenderer.invoke('set-autostart', enable),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  minimizeToTray: () => ipcRenderer.invoke('minimize-to-tray'),
  showMain: (page?: string) => ipcRenderer.invoke('show-main', page),
  minimizeToBar: () => ipcRenderer.invoke('minimize-to-bar'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  getGpuStatus: () => ipcRenderer.invoke('get-gpu-status'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  downloadCuda: () => ipcRenderer.invoke('download-cuda'),
  pauseCudaDownload: () => ipcRenderer.invoke('pause-cuda-download'),
  resumeCudaDownload: () => ipcRenderer.invoke('resume-cuda-download'),
  cancelCudaDownload: () => ipcRenderer.invoke('cancel-cuda-download'),
  getCudaDownloadProgress: () => ipcRenderer.invoke('get-cuda-download-progress'),
  
  onStateChange: (callback) => {
    const handler = (_: any, state: string) => callback(state);
    ipcRenderer.on('state-change', handler);
    return () => ipcRenderer.removeListener('state-change', handler);
  },
  onTranscriptReady: (callback) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('transcript-ready', handler);
    return () => ipcRenderer.removeListener('transcript-ready', handler);
  },
  onError: (callback) => {
    const handler = (_: any, error: string) => callback(error);
    ipcRenderer.on('error', handler);
    return () => ipcRenderer.removeListener('error', handler);
  },
  onRecordingTime: (callback) => {
    const handler = (_: any, time: number) => callback(time);
    ipcRenderer.on('recording-time', handler);
    return () => ipcRenderer.removeListener('recording-time', handler);
  },
  onStartRecording: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('start-recording-request', handler);
    return () => ipcRenderer.removeListener('start-recording-request', handler);
  },
  onStopRecording: (callback) => {
    const handler = (_: any, duration: number) => callback(duration);
    ipcRenderer.on('stop-recording-request', handler);
    return () => ipcRenderer.removeListener('stop-recording-request', handler);
  },
  onCancelRecording: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('cancel-recording', handler);
    return () => ipcRenderer.removeListener('cancel-recording', handler);
  },
  onNavigate: (callback) => {
    const handler = (_: any, page: string) => callback(page);
    ipcRenderer.on('navigate', handler);
    return () => ipcRenderer.removeListener('navigate', handler);
  },
  onPartialTranscript: (callback) => {
    const handler = (_: any, text: string) => callback(text);
    ipcRenderer.on('partial-transcript', handler);
    return () => ipcRenderer.removeListener('partial-transcript', handler);
  },
  onDownloadProgress: (callback) => {
    const handler = (_: any, data: { progress: number; state: string; downloadedBytes: number; totalBytes: number }) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
  onCudaDownloadProgress: (callback) => {
    const handler = (_: any, data: { state: string; progress: number; downloadedBytes: number; totalBytes: number }) => callback(data);
    ipcRenderer.on('cuda-download-progress', handler);
    return () => ipcRenderer.removeListener('cuda-download-progress', handler);
  },
  onMiniWindowUpdate: (callback) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('mini-window-update', handler);
    return () => ipcRenderer.removeListener('mini-window-update', handler);
  },
  onWpmUpdate: (callback) => {
    const handler = (_: any, wpm: number) => callback(wpm);
    ipcRenderer.on('wpm-update', handler);
    return () => ipcRenderer.removeListener('wpm-update', handler);
  },
  onHotkeyRegistered: (callback) => {
    const handler = (_: any, hotkey: string) => callback(hotkey);
    ipcRenderer.on('hotkey-registered', handler);
    return () => ipcRenderer.removeListener('hotkey-registered', handler);
  },
  onTargetAppChanged: (callback) => {
    const handler = (_: any, appName: string) => callback(appName);
    ipcRenderer.on('target-app-changed', handler);
    return () => ipcRenderer.removeListener('target-app-changed', handler);
  },
  onBenchmarkProgress: (callback) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('benchmark-progress', handler);
    return () => ipcRenderer.removeListener('benchmark-progress', handler);
  },
  onThemeChange: (callback) => {
    const handler = (_: any, theme: string) => callback(theme);
    ipcRenderer.on('theme-changed', handler);
    return () => ipcRenderer.removeListener('theme-changed', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
