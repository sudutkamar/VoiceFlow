/**
 * Tauri Compatibility Shim
 * 
 * Maps window.electronAPI to Tauri invoke() calls.
 * This allows existing code to work without modification
 * during the migration period.
 * 
 * Usage: Import this file BEFORE any component that uses window.electronAPI
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// ═══════════════════════════════════════════════════════════════
//  Helper to create type-safe invoke wrapper
// ═══════════════════════════════════════════════════════════════

function cmd<T = any>(name: string, args?: Record<string, any>): Promise<T> {
  return invoke(name, args || {});
}

// ═══════════════════════════════════════════════════════════════
//  Event listener helper
// ═══════════════════════════════════════════════════════════════

function onEvent<T = any>(event: string, callback: (data: T) => void): () => void {
  let unlistenFn: (() => void) | null = null;
  listen<T>(event, (e) => callback(e.payload)).then((fn) => {
    unlistenFn = fn;
  });
  return () => unlistenFn?.();
}

// ═══════════════════════════════════════════════════════════════
//  window.electronAPI shim
// ═══════════════════════════════════════════════════════════════

const electronAPI = {
  // ── Settings ──
  getSettings: () => cmd('get_settings'),
  updateSetting: (key: string, value: string) => cmd('update_setting', { key, value }),

  // ── Recording ──
  startRecording: () => cmd('start_recording'),
  stopRecording: () => cmd('stop_recording'),
  toggleDictation: () => cmd('toggle_dictation'),
  getTranscript: () => cmd('get_transcript'),
  cancelTranscription: () => cmd('cancel_transcription'),
  sendAudioData: (data: { buffer: ArrayBuffer | Uint8Array; mimeType: string; duration: number }) => {
    let bytes: number[];
    if (data.buffer instanceof Uint8Array) {
      bytes = Array.from(data.buffer);
    } else if (data.buffer instanceof ArrayBuffer) {
      bytes = Array.from(new Uint8Array(data.buffer));
    } else {
      bytes = Array.from(data.buffer as any);
    }
    return cmd('send_audio_data', { buffer: bytes, mimeType: data.mimeType, duration: data.duration });
  },

  // ── Clipboard ──
  copyText: (text: string) => cmd('copy_text', { text }),
  pasteText: (text: string) => cmd('paste_text', { text }),
  getClipboardText: () => cmd('get_clipboard_text'),

  // ── Mini Window ──
  showMiniWindow: () => cmd('show_mini_window'),
  hideMiniWindow: () => cmd('hide_mini_window'),
  resizeMiniWindow: (height: number, width?: number) => cmd('resize_mini_window', { height, width }),
  setMiniWindowFocusable: (focusable: boolean) => cmd('set_mini_window_focusable', { focusable }),
  miniWindowReady: () => cmd('mini_window_ready'),

  // ── History ──
  getHistory: (limit?: number) => cmd('get_history', { limit }),
  clearHistory: () => cmd('clear_history'),
  deleteHistoryItem: (id: string) => cmd('delete_history_item', { id }),
  searchHistory: (query: string) => cmd('search_history', { query }),
  exportHistory: () => cmd('export_history'),

  // ── Dictionary ──
  getDictionary: () => cmd('get_dictionary'),
  addDictionaryEntry: (phrase: string, replacement: string) => cmd('add_dictionary_entry', { phrase, replacement }),
  deleteDictionaryEntry: (id: string) => cmd('delete_dictionary_entry', { id }),
  updateDictionaryEntry: (id: string, phrase: string, replacement: string) => cmd('update_dictionary_entry', { id, phrase, replacement }),
  exportDictionary: () => cmd('export_dictionary'),
  importDictionary: (csvContent: string) => cmd('import_dictionary', { csvContent }),

  // ── Snippets ──
  getSnippets: () => cmd('get_snippets'),
  addSnippet: (trigger: string, output: string) => cmd('add_snippet', { trigger, output }),
  deleteSnippet: (id: string) => cmd('delete_snippet', { id }),
  updateSnippet: (id: string, trigger: string, output: string) => cmd('update_snippet', { id, trigger, output }),

  // ── Models ──
  getAvailableModels: () => cmd('get_available_models'),
  scanModelsFolder: () => cmd('scan_models_folder'),
  downloadModel: (model: string) => cmd('download_model', { model }),
  forceDownloadModel: (model: string) => cmd('download_model', { model }),
  pauseDownload: () => Promise.resolve(),
  resumeDownload: () => Promise.resolve(),
  cancelDownload: () => Promise.resolve(),
  deleteModel: (model: string) => cmd('delete_model', { model }),
  getDownloadProgress: () => Promise.resolve({ progress: 0, state: 'idle' }),
  hasInterruptedDownload: () => Promise.resolve(false),
  getInterruptedDownloadInfo: () => Promise.resolve(null),
  isModelDownloaded: (model: string) => cmd('is_model_downloaded', { model }),
  getModelsPath: () => cmd('get_models_path'),
  getModelsBaseDir: () => cmd('get_models_base_dir'),
  getCustomModelsPath: () => Promise.resolve(null),
  chooseModelsFolder: () => cmd('choose_models_folder'),
  resetModelsPath: () => cmd('reset_models_path'),
  hasAnyModel: () => cmd('has_any_model'),
  setSpeedLimit: () => Promise.resolve({ success: true }),
  getSpeedLimit: () => Promise.resolve({ bytesPerSecond: 0 }),
  runBenchmark: () => Promise.resolve({ success: false, error: 'Not implemented' }),

  // ── GPU ──
  getGpuStatus: () => cmd('get_gpu_status'),
  getGpuPath: () => Promise.resolve(''),
  chooseGpuFolder: () => Promise.resolve({ success: false }),
  scanGpuFolder: () => Promise.resolve({ present: [], missing: [], total: 0 }),
  resetGpuPath: () => Promise.resolve({ success: false }),
  downloadCuda: () => cmd('download_cuda'),
  pauseCudaDownload: () => Promise.resolve(),
  resumeCudaDownload: () => Promise.resolve(),
  cancelCudaDownload: () => Promise.resolve(),
  getCudaDownloadProgress: () => Promise.resolve({ state: 'idle', progress: 0, downloadedBytes: 0, totalBytes: 0 }),
  deleteWhisperEngine: (type: 'cpu' | 'gpu') => cmd('delete_whisper_engine', { engineType: type }),

  // ── Adaptive Learning ──
  learnCorrection: (original: string, corrected: string) => cmd('learn_correction', { original, corrected }),
  getLearnedCorrections: () => cmd('get_learned_corrections'),
  deleteLearnedCorrection: (id: string) => cmd('delete_learned_correction', { id }),
  clearLearnedCorrections: () => cmd('clear_learned_corrections'),
  getAdaptiveStats: () => cmd('get_adaptive_stats'),

  // ── LLM ──
  llmCheckAvailability: () => cmd('llm_check_availability'),
  llmGetModels: () => cmd('llm_get_models'),
  llmDownloadModel: (modelName: string) => cmd('llm_download_model', { modelName }),
  llmDeleteModel: (modelName: string) => cmd('llm_delete_model', { modelName }),
  llmPauseDownload: () => Promise.resolve({ success: true }),
  llmResumeDownload: () => Promise.resolve({ success: true }),
  llmCancelDownload: () => Promise.resolve({ success: true }),
  llmGetDownloadState: () => Promise.resolve({ state: 'idle', modelName: '', progress: 0, downloadedBytes: 0, totalBytes: 0 }),
  llmTestProcess: (text: string, modelName?: string) => cmd('llm_test_process', { text, modelName }),
  llmGetModelsPath: () => cmd('llm_get_models_path'),
  llmChooseModelsFolder: () => Promise.resolve({ success: false }),
  llmScanModelsFolder: () => Promise.resolve({ success: false, models: [] }),
  llmDownloadBinary: () => Promise.resolve({ success: false }),
  llmCancelBinaryDownload: () => Promise.resolve({ success: false }),
  llmGetBinaryDownloadState: () => Promise.resolve({ state: 'idle', progress: 0, downloadedBytes: 0, totalBytes: 0 }),
  llmCheckBinary: () => Promise.resolve({ downloaded: false }),

  // ── App ──
  getAppState: () => cmd('get_app_state'),
  getTargetApp: () => cmd('get_target_app'),
  getVersion: () => cmd('get_version'),
  isAutoStart: () => cmd('is_autostart'),
  setAutoStart: (enable: boolean) => cmd('set_autostart', { enable }),
  quitApp: () => cmd('quit_app'),
  checkForUpdates: () => Promise.resolve(),
  minimizeToTray: () => Promise.resolve(),
  showMain: (page?: string) => cmd('show_main', { page }),
  minimizeToBar: () => cmd('minimize_to_bar'),
  minimizeWindow: () => Promise.resolve(),
  maximizeWindow: () => Promise.resolve(),
  clearCache: () => cmd('clear_cache'),

  // ── Hotkey ──
  updateHotkey: (newHotkey: string) => Promise.resolve({ success: true }),
  setLogLevel: (level: string) => cmd('set_log_level', { level }),

  // ── Warmup ──
  getWarmupStatus: () => cmd('get_warmup_status'),
  onWarmupComplete: (callback: (data: any) => void) => onEvent('warmup-complete', callback),

  // ── External ──
  openExternal: (url: string) => {
    // Use Tauri shell plugin
    return invoke('plugin:shell|open', { url });
  },

  // ── Update ──
  onUpdateDownloadProgress: (callback: (data: any) => void) => onEvent('update-download-progress', callback),

  // ═══════════════════════════════════════════════════════════════
  //  Event Listeners (on* pattern)
  // ═══════════════════════════════════════════════════════════════

  onStateChange: (callback: (state: string) => void) => onEvent('state-change', callback),
  onTranscriptReady: (callback: (data: any) => void) => onEvent('transcript-ready', callback),
  onError: (callback: (error: string) => void) => onEvent('error', callback),
  onRecordingTime: (callback: (time: number) => void) => onEvent('recording-time', callback),
  onStartRecording: (callback: () => void) => onEvent('start-recording-request', callback),
  onStopRecording: (callback: (duration: number) => void) => onEvent('stop-recording-request', callback),
  onCancelRecording: (callback: () => void) => onEvent('cancel-recording', callback),
  onNavigate: (callback: (page: string) => void) => onEvent('navigate', callback),
  onPartialTranscript: (callback: (text: string) => void) => onEvent('partial-transcript', callback),
  onDownloadProgress: (callback: (data: any) => void) => onEvent('download-progress', callback),
  onCudaDownloadProgress: (callback: (data: any) => void) => onEvent('cuda-download-progress', callback),
  onMiniWindowUpdate: (callback: (data: any) => void) => onEvent('mini-window-update', callback),
  onWpmUpdate: (callback: (wpm: number) => void) => onEvent('wpm-update', callback),
  onHotkeyRegistered: (callback: (hotkey: string) => void) => onEvent('hotkey-registered', callback),
  onTargetAppChanged: (callback: (appName: string) => void) => onEvent('target-app-changed', callback),
  onBenchmarkProgress: (callback: (data: any) => void) => onEvent('benchmark-progress', callback),
  onThemeChange: (callback: (theme: string) => void) => onEvent('theme-changed', callback),
  onReloadSettings: (callback: () => void) => onEvent('reload-settings', callback),
  onLlmBinaryDownloadProgress: (callback: (data: any) => void) => onEvent('llm-binary-download-progress', callback),
  onLlmDownloadProgress: (callback: (data: any) => void) => onEvent('llm-download-progress', callback),
  onMiniWindowResize: (callback: (data: { width: number; height: number }) => void) => onEvent('mini-window-resize', callback),
};

// ═══════════════════════════════════════════════════════════════
//  Expose to window
// ═══════════════════════════════════════════════════════════════

(window as any).electronAPI = electronAPI;

console.log('[VoiceFlow] Tauri shim initialized — window.electronAPI mapped to Tauri invoke()');
