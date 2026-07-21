/**
 * App-level preload API — window management, GPU, cache, version.
 */
import { ipcRenderer, shell } from 'electron';
import type { ElectronAPISection } from './types';

export function createAppAPI(): ElectronAPISection {
  return {
    getAppState: () => ipcRenderer.invoke('get-app-state'),
    getTargetApp: () => ipcRenderer.invoke('get-target-app'),
    getVersion: () => ipcRenderer.invoke('get-version'),
    isAutoStart: () => ipcRenderer.invoke('is-autostart'),
    setAutoStart: (enable) => ipcRenderer.invoke('set-autostart', enable),
    quitApp: () => ipcRenderer.invoke('quit-app'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    minimizeToTray: () => ipcRenderer.invoke('minimize-to-tray'),
    showMain: (page?: string) => ipcRenderer.invoke('show-main', page),
    minimizeToBar: () => ipcRenderer.invoke('minimize-to-bar'),
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
    openExternal: (url) => shell.openExternal(url),

    getGpuStatus: () => ipcRenderer.invoke('get-gpu-status'),
    getGpuPath: () => ipcRenderer.invoke('get-gpu-path'),
    chooseGpuFolder: () => ipcRenderer.invoke('choose-gpu-folder'),
    scanGpuFolder: () => ipcRenderer.invoke('scan-gpu-folder'),
    resetGpuPath: () => ipcRenderer.invoke('reset-gpu-path'),
    clearCache: () => ipcRenderer.invoke('clear-cache'),
    downloadCuda: () => ipcRenderer.invoke('download-cuda'),
    pauseCudaDownload: () => ipcRenderer.invoke('pause-cuda-download'),
    resumeCudaDownload: () => ipcRenderer.invoke('resume-cuda-download'),
    cancelCudaDownload: () => ipcRenderer.invoke('cancel-cuda-download'),
    getCudaDownloadProgress: () => ipcRenderer.invoke('get-cuda-download-progress'),
    deleteWhisperEngine: (type) => ipcRenderer.invoke('delete-whisper-engine', type),

    getWarmupStatus: () => ipcRenderer.invoke('get-warmup-status'),
    updateHotkey: (newHotkey) => ipcRenderer.invoke('update-hotkey', newHotkey),
    setLogLevel: (level) => ipcRenderer.invoke('set-log-level', level),

    onUpdateDownloadProgress: (callback) => {
      const handler = (_: any, data: { percent: number; transferred: number; total: number }) => callback(data);
      ipcRenderer.on('update-download-progress', handler);
      return () => ipcRenderer.removeListener('update-download-progress', handler);
    },
  };
}
