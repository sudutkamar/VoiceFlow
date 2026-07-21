/**
 * Models-related preload API.
 */
import { ipcRenderer } from 'electron';
import type { ElectronAPISection } from './types';

export function createModelsAPI(): ElectronAPISection {
  return {
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
    getModelsBaseDir: () => ipcRenderer.invoke('get-models-base-dir'),
    getCustomModelsPath: () => ipcRenderer.invoke('get-custom-models-path'),
    chooseModelsFolder: () => ipcRenderer.invoke('choose-models-folder'),
    resetModelsPath: () => ipcRenderer.invoke('reset-models-path'),
    hasAnyModel: () => ipcRenderer.invoke('has-any-model'),
    setSpeedLimit: (bytesPerSecond) => ipcRenderer.invoke('set-speed-limit', bytesPerSecond),
    getSpeedLimit: () => ipcRenderer.invoke('get-speed-limit'),
  };
}
