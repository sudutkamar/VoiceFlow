/**
 * LLM post-processing preload API.
 */
import { ipcRenderer } from 'electron';
import type { ElectronAPISection } from './types';

export function createLlmAPI(): ElectronAPISection {
  return {
    llmCheckAvailability: () => ipcRenderer.invoke('llm-check-availability'),
    llmGetModels: () => ipcRenderer.invoke('llm-get-models'),
    llmDownloadModel: (modelName) => ipcRenderer.invoke('llm-download-model', modelName),
    llmDeleteModel: (modelName) => ipcRenderer.invoke('llm-delete-model', modelName),
    llmPauseDownload: () => ipcRenderer.invoke('llm-pause-download'),
    llmResumeDownload: () => ipcRenderer.invoke('llm-resume-download'),
    llmCancelDownload: () => ipcRenderer.invoke('llm-cancel-download'),
    llmGetDownloadState: () => ipcRenderer.invoke('llm-get-download-state'),
    llmTestProcess: (text, modelName) => ipcRenderer.invoke('llm-test-process', text, modelName),
    llmGetModelsPath: () => ipcRenderer.invoke('llm-get-models-path'),
    llmChooseModelsFolder: () => ipcRenderer.invoke('llm-choose-models-folder'),
    llmScanModelsFolder: () => ipcRenderer.invoke('llm-scan-models-folder'),
    llmDownloadBinary: () => ipcRenderer.invoke('llm-download-binary'),
    llmCancelBinaryDownload: () => ipcRenderer.invoke('llm-cancel-binary-download'),
    llmGetBinaryDownloadState: () => ipcRenderer.invoke('llm-get-binary-download-state'),
    llmCheckBinary: () => ipcRenderer.invoke('llm-check-binary'),
  };
}
