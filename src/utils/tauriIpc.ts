/**
 * Tauri IPC wrapper — replaces electronAPI
 * 
 * This file provides a type-safe interface for all Tauri commands
 * and event listeners. It mirrors the old electronAPI structure
 * but uses Tauri's invoke() and listen() instead.
 */
import { invoke, InvokeArgs } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

// ═══════════════════════════════════════════════════════════════
//  Type definitions
// ═══════════════════════════════════════════════════════════════

export interface TranscriptionResult {
  raw: string;
  cleaned: string;
  duration: number;
  wordCount?: number;
  charCount?: number;
  confidence?: any;
  fuzzyChanges?: number;
  rawText?: string;
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

export interface WarmupResult {
  ready: boolean;
  model: string;
  whisperAvailable: boolean;
  gpuAvailable: boolean;
  modelSize: number;
}

// ═══════════════════════════════════════════════════════════════
//  IPC wrapper functions
// ═══════════════════════════════════════════════════════════════

async function tauriInvoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  return invoke(cmd, args);
}

// ═══════════════════════════════════════════════════════════════
//  Settings
// ═══════════════════════════════════════════════════════════════

export async function getSettings(): Promise<Record<string, string>> {
  return tauriInvoke('get_settings');
}

export async function updateSetting(key: string, value: string): Promise<void> {
  return tauriInvoke('update_setting', { key, value });
}

// ═══════════════════════════════════════════════════════════════
//  Recording
// ═══════════════════════════════════════════════════════════════

export async function startRecording(): Promise<void> {
  return tauriInvoke('start_recording');
}

export async function stopRecording(): Promise<void> {
  return tauriInvoke('stop_recording');
}

export async function toggleDictation(): Promise<void> {
  return tauriInvoke('toggle_dictation');
}

export async function sendAudioData(data: { buffer: ArrayBuffer | Uint8Array; mimeType: string; duration: number }): Promise<void> {
  let bytes: number[];
  if (data.buffer instanceof Uint8Array) {
    bytes = Array.from(data.buffer);
  } else if (data.buffer instanceof ArrayBuffer) {
    bytes = Array.from(new Uint8Array(data.buffer));
  } else {
    bytes = Array.from(data.buffer as any);
  }
  return tauriInvoke('send_audio_data', { buffer: bytes, mimeType: data.mimeType, duration: data.duration });
}

export async function cancelTranscription(): Promise<void> {
  return tauriInvoke('cancel_transcription');
}

export async function getTranscript(): Promise<any> {
  return tauriInvoke('get_transcript');
}

// ═══════════════════════════════════════════════════════════════
//  Clipboard
// ═══════════════════════════════════════════════════════════════

export async function copyText(text: string): Promise<void> {
  return tauriInvoke('copy_text', { text });
}

export async function pasteText(text: string): Promise<void> {
  return tauriInvoke('paste_text', { text });
}

export async function getClipboardText(): Promise<string> {
  return tauriInvoke('get_clipboard_text');
}

// ═══════════════════════════════════════════════════════════════
//  History
// ═══════════════════════════════════════════════════════════════

export async function getHistory(limit?: number): Promise<HistoryEntry[]> {
  return tauriInvoke('get_history', { limit });
}

export async function searchHistory(query: string): Promise<HistoryEntry[]> {
  return tauriInvoke('search_history', { query });
}

export async function deleteHistoryItem(id: string): Promise<void> {
  return tauriInvoke('delete_history_item', { id });
}

export async function clearHistory(): Promise<void> {
  return tauriInvoke('clear_history');
}

export async function exportHistory(): Promise<string> {
  return tauriInvoke('export_history');
}

// ═══════════════════════════════════════════════════════════════
//  Dictionary
// ═══════════════════════════════════════════════════════════════

export async function getDictionary(): Promise<DictionaryEntry[]> {
  return tauriInvoke('get_dictionary');
}

export async function addDictionaryEntry(phrase: string, replacement: string): Promise<void> {
  return tauriInvoke('add_dictionary_entry', { phrase, replacement });
}

export async function deleteDictionaryEntry(id: string): Promise<void> {
  return tauriInvoke('delete_dictionary_entry', { id });
}

export async function updateDictionaryEntry(id: string, phrase: string, replacement: string): Promise<void> {
  return tauriInvoke('update_dictionary_entry', { id, phrase, replacement });
}

export async function exportDictionary(): Promise<string> {
  return tauriInvoke('export_dictionary');
}

export async function importDictionary(csvContent: string): Promise<any> {
  return tauriInvoke('import_dictionary', { csvContent });
}

// ═══════════════════════════════════════════════════════════════
//  Snippets
// ═══════════════════════════════════════════════════════════════

export async function getSnippets(): Promise<SnippetEntry[]> {
  return tauriInvoke('get_snippets');
}

export async function addSnippet(trigger: string, output: string): Promise<void> {
  return tauriInvoke('add_snippet', { trigger, output });
}

export async function deleteSnippet(id: string): Promise<void> {
  return tauriInvoke('delete_snippet', { id });
}

export async function updateSnippet(id: string, trigger: string, output: string): Promise<void> {
  return tauriInvoke('update_snippet', { id, trigger, output });
}

// ═══════════════════════════════════════════════════════════════
//  Models
// ═══════════════════════════════════════════════════════════════

export async function getAvailableModels(): Promise<string[]> {
  return tauriInvoke('get_available_models');
}

export async function scanModelsFolder(): Promise<string[]> {
  return tauriInvoke('scan_models_folder');
}

export async function downloadModel(model: string): Promise<void> {
  return tauriInvoke('download_model', { model });
}

export async function deleteModel(model: string): Promise<boolean> {
  return tauriInvoke('delete_model', { model });
}

export async function isModelDownloaded(model: string): Promise<boolean> {
  return tauriInvoke('is_model_downloaded', { model });
}

export async function getModelsPath(): Promise<string> {
  return tauriInvoke('get_models_path');
}

export async function getModelsBaseDir(): Promise<string> {
  return tauriInvoke('get_models_base_dir');
}

export async function chooseModelsFolder(): Promise<string> {
  return tauriInvoke('choose_models_folder');
}

export async function resetModelsPath(): Promise<string> {
  return tauriInvoke('reset_models_path');
}

export async function hasAnyModel(): Promise<boolean> {
  return tauriInvoke('has_any_model');
}

// ═══════════════════════════════════════════════════════════════
//  GPU
// ═══════════════════════════════════════════════════════════════

export async function getGpuStatus(): Promise<any> {
  return tauriInvoke('get_gpu_status');
}

export async function downloadCuda(): Promise<any> {
  return tauriInvoke('download_cuda');
}

export async function deleteWhisperEngine(type: 'cpu' | 'gpu'): Promise<any> {
  return tauriInvoke('delete_whisper_engine', { engineType: type });
}

// ═══════════════════════════════════════════════════════════════
//  Adaptive Learning
// ═══════════════════════════════════════════════════════════════

export async function learnCorrection(original: string, corrected: string): Promise<void> {
  return tauriInvoke('learn_correction', { original, corrected });
}

export async function getLearnedCorrections(): Promise<any[]> {
  return tauriInvoke('get_learned_corrections');
}

export async function deleteLearnedCorrection(id: string): Promise<void> {
  return tauriInvoke('delete_learned_correction', { id });
}

export async function clearLearnedCorrections(): Promise<void> {
  return tauriInvoke('clear_learned_corrections');
}

export async function getAdaptiveStats(): Promise<any> {
  return tauriInvoke('get_adaptive_stats');
}

// ═══════════════════════════════════════════════════════════════
//  LLM
// ═══════════════════════════════════════════════════════════════

export async function llmCheckAvailability(): Promise<any> {
  return tauriInvoke('llm_check_availability');
}

export async function llmGetModels(): Promise<any> {
  return tauriInvoke('llm_get_models');
}

export async function llmDownloadModel(modelName: string): Promise<any> {
  return tauriInvoke('llm_download_model', { modelName });
}

export async function llmDeleteModel(modelName: string): Promise<any> {
  return tauriInvoke('llm_delete_model', { modelName });
}

export async function llmTestProcess(text: string, modelName?: string): Promise<any> {
  return tauriInvoke('llm_test_process', { text, modelName });
}

export async function llmGetModelsPath(): Promise<string> {
  return tauriInvoke('llm_get_models_path');
}

// ═══════════════════════════════════════════════════════════════
//  App
// ═══════════════════════════════════════════════════════════════

export async function getAppState(): Promise<string> {
  return tauriInvoke('get_app_state');
}

export async function getTargetApp(): Promise<string> {
  return tauriInvoke('get_target_app');
}

export async function getVersion(): Promise<string> {
  return tauriInvoke('get_version');
}

export async function isAutostart(): Promise<boolean> {
  return tauriInvoke('is_autostart');
}

export async function setAutostart(enable: boolean): Promise<void> {
  return tauriInvoke('set_autostart', { enable });
}

export async function quitApp(): Promise<void> {
  return tauriInvoke('quit_app');
}

export async function showMain(page?: string): Promise<void> {
  return tauriInvoke('show_main', { page });
}

export async function minimizeToBar(): Promise<void> {
  return tauriInvoke('minimize_to_bar');
}

export async function showMiniWindow(): Promise<void> {
  return tauriInvoke('show_mini_window');
}

export async function hideMiniWindow(): Promise<void> {
  return tauriInvoke('hide_mini_window');
}

export async function resizeMiniWindow(height: number, width?: number): Promise<void> {
  return tauriInvoke('resize_mini_window', { height, width });
}

export async function setMiniWindowFocusable(focusable: boolean): Promise<void> {
  return tauriInvoke('set_mini_window_focusable', { focusable });
}

export async function clearCache(): Promise<any> {
  return tauriInvoke('clear_cache');
}

// ═══════════════════════════════════════════════════════════════
//  Warmup
// ═══════════════════════════════════════════════════════════════

export async function getWarmupStatus(): Promise<WarmupResult> {
  return tauriInvoke('get_warmup_status');
}

// ═══════════════════════════════════════════════════════════════
//  Log
// ═══════════════════════════════════════════════════════════════

export async function setLogLevel(level: string): Promise<void> {
  return tauriInvoke('set_log_level', { level });
}

// ═══════════════════════════════════════════════════════════════
//  Event Listeners (Tauri events → React callbacks)
// ═══════════════════════════════════════════════════════════════

type EventCallback<T> = (data: T) => void;

function createEventListener<T>(event: string, callback: EventCallback<T>): () => void {
  let unlistenFn: UnlistenFn | null = null;

  listen<T>(event, (e) => {
    callback(e.payload);
  }).then((fn) => {
    unlistenFn = fn;
  });

  return () => {
    unlistenFn?.();
  };
}

// Event listeners — mirror old electronAPI.on* pattern
export const onStateChange = (callback: EventCallback<string>) =>
  createEventListener('state-change', callback);

export const onTranscriptReady = (callback: EventCallback<TranscriptionResult>) =>
  createEventListener('transcript-ready', callback);

export const onError = (callback: EventCallback<string>) =>
  createEventListener('error', callback);

export const onPartialTranscript = (callback: EventCallback<string>) =>
  createEventListener('partial-transcript', callback);

export const onStartRecording = (callback: EventCallback<void>) =>
  createEventListener('start-recording-request', callback);

export const onStopRecording = (callback: EventCallback<void>) =>
  createEventListener('stop-recording-request', callback);

export const onCancelRecording = (callback: EventCallback<void>) =>
  createEventListener('cancel-recording', callback);

export const onNavigate = (callback: EventCallback<string>) =>
  createEventListener('navigate', callback);

export const onToggleDictation = (callback: EventCallback<void>) =>
  createEventListener('toggle-dictation', callback);

export const onMiniWindowResize = (callback: EventCallback<{ width: number; height: number }>) =>
  createEventListener('mini-window-resize', callback);

export const onWarmupComplete = (callback: EventCallback<WarmupResult>) =>
  createEventListener('warmup-complete', callback);

export const onReloadSettings = (callback: EventCallback<void>) =>
  createEventListener('reload-settings', callback);

export const onMiniWindowBlur = (callback: EventCallback<void>) =>
  createEventListener('mini-window-blur', callback);

// ═══════════════════════════════════════════════════════════════
//  Backward-compatible electronAPI wrapper
//  (Gradual migration — old code can still use window.electronAPI)
// ═══════════════════════════════════════════════════════════════

export const tauriAPI = {
  // Settings
  getSettings,
  updateSetting,

  // Recording
  startRecording,
  stopRecording,
  toggleDictation,
  sendAudioData,
  cancelTranscription,
  getTranscript,

  // Clipboard
  copyText,
  pasteText,
  getClipboardText,

  // History
  getHistory,
  searchHistory,
  deleteHistoryItem,
  clearHistory,
  exportHistory,

  // Dictionary
  getDictionary,
  addDictionaryEntry,
  deleteDictionaryEntry,
  updateDictionaryEntry,
  exportDictionary,
  importDictionary,

  // Snippets
  getSnippets,
  addSnippet,
  deleteSnippet,
  updateSnippet,

  // Models
  getAvailableModels,
  scanModelsFolder,
  downloadModel,
  deleteModel,
  isModelDownloaded,
  getModelsPath,
  getModelsBaseDir,
  chooseModelsFolder,
  resetModelsPath,
  hasAnyModel,

  // GPU
  getGpuStatus,
  downloadCuda,
  deleteWhisperEngine,

  // Learning
  learnCorrection,
  getLearnedCorrections,
  deleteLearnedCorrection,
  clearLearnedCorrections,
  getAdaptiveStats,

  // LLM
  llmCheckAvailability,
  llmGetModels,
  llmDownloadModel,
  llmDeleteModel,
  llmTestProcess,
  llmGetModelsPath,

  // App
  getAppState,
  getTargetApp,
  getVersion,
  isAutostart,
  setAutostart,
  quitApp,
  showMain,
  minimizeToBar,
  showMiniWindow,
  hideMiniWindow,
  resizeMiniWindow,
  setMiniWindowFocusable,
  clearCache,

  // Warmup
  getWarmupStatus,

  // Log
  setLogLevel,

  // Events
  onStateChange,
  onTranscriptReady,
  onError,
  onPartialTranscript,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  onNavigate,
  onToggleDictation,
  onMiniWindowResize,
  onWarmupComplete,
  onReloadSettings,
  onMiniWindowBlur,
};

export default tauriAPI;
