/**
 * Event listener preload API — all ipcRenderer.on subscriptions.
 * Each returns an unsubscribe function.
 */
import { ipcRenderer } from 'electron';
import type { ElectronAPISection } from './types';

export function createEventsAPI(): ElectronAPISection {
  return {
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
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('download-progress', handler);
      return () => ipcRenderer.removeListener('download-progress', handler);
    },
    onCudaDownloadProgress: (callback) => {
      const handler = (_: any, data: any) => callback(data);
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
    onReloadSettings: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('reload-settings', handler);
      return () => ipcRenderer.removeListener('reload-settings', handler);
    },
    onLlmBinaryDownloadProgress: (callback) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('llm-binary-download-progress', handler);
      return () => ipcRenderer.removeListener('llm-binary-download-progress', handler);
    },
    onLlmDownloadProgress: (callback) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('llm-download-progress', handler);
      return () => ipcRenderer.removeListener('llm-download-progress', handler);
    },
    onMiniWindowResize: (callback) => {
      const handler = (_: any, data: { width: number; height: number }) => callback(data);
      ipcRenderer.on('mini-window-resize', handler);
      return () => ipcRenderer.removeListener('mini-window-resize', handler);
    },
    onModelChanged: (callback) => {
      const handler = (_: any, modelName: string) => callback(modelName);
      ipcRenderer.on('model-changed', handler);
      return () => ipcRenderer.removeListener('model-changed', handler);
    },
    onWarmupComplete: (callback) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('warmup-complete', handler);
      return () => ipcRenderer.removeListener('warmup-complete', handler);
    },
    onMiniWindowBlur: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('mini-window-blur', handler);
      return () => ipcRenderer.removeListener('mini-window-blur', handler);
    },
  };
}
