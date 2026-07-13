/**
 * LLM Post-Processing IPC Handlers
 * Handles all LLM-related IPC channels (model management, download, testing).
 */
import { ipcMain, BrowserWindow, dialog } from 'electron';
import { Logger } from '../modules/logger';
import { HotkeyManager } from '../modules/hotkeyManager';
import { LlmPostProcessor, AVAILABLE_LLM_MODELS } from '../modules/llmPostProcessor';

/** Helper to send to all windows (main + mini) */
function createSender(mainWindow: BrowserWindow, hotkeyManager?: HotkeyManager) {
  return (channel: string, data: any) => {
    if (hotkeyManager) {
      hotkeyManager.sendToAll(channel, data);
    } else {
      mainWindow.webContents.send(channel, data);
    }
  };
}

/**
 * Set up all LLM-related IPC handlers.
 */
export function setupLlmIPC(
  mainWindow: BrowserWindow,
  llmPostProcessor: LlmPostProcessor,
  logger: Logger,
  hotkeyManager?: HotkeyManager
): void {
  const send = createSender(mainWindow, hotkeyManager);

  // Track active LLM download state for progress
  let activeLlmDownload = { modelName: '', downloadedBytes: 0, totalBytes: 0 };

  // ═══════════════════════════════════════════════════════════════
  //  LLM Availability & Binary
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('llm-check-availability', async () => {
    try {
      const available = llmPostProcessor.isLlmCliAvailable() && llmPostProcessor.isModelAvailable();
      const models = llmPostProcessor.getDownloadedModelsInfo();
      return { success: true, available, hasCli: llmPostProcessor.isLlmCliAvailable(), binaryDownloaded: llmPostProcessor.isBinaryDownloaded(), models };
    } catch (err: any) {
      return { success: false, available: false, error: err.message };
    }
  });

  ipcMain.handle('llm-check-binary', async () => {
    return { downloaded: llmPostProcessor.isBinaryDownloaded() };
  });

  ipcMain.handle('llm-download-binary', async () => {
    try {
      const result = await llmPostProcessor.downloadLlamaBinary((progress, state, dlBytes, totalBytes) => {
        send('llm-binary-download-progress', {
          progress,
          state,
          downloadedBytes: dlBytes || 0,
          totalBytes: totalBytes || 0,
        });
      });

      send('llm-binary-download-progress', {
        progress: result ? 100 : 0,
        state: result ? 'completed' : 'error',
        downloadedBytes: 0,
        totalBytes: 0,
      });
      return { success: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('llm-cancel-binary-download', async () => {
    llmPostProcessor.cancelBinaryDownload();
    send('llm-binary-download-progress', {
      progress: 0,
      state: 'cancelled',
      downloadedBytes: 0,
      totalBytes: 0,
    });
    return { success: true };
  });

  ipcMain.handle('llm-get-binary-download-state', async () => {
    return llmPostProcessor.getBinaryDownloadState();
  });

  // ═══════════════════════════════════════════════════════════════
  //  LLM Model Management
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('llm-get-models', async () => {
    try {
      const models = llmPostProcessor.getDownloadedModelsInfo();
      return { success: true, models };
    } catch (err: any) {
      return { success: false, models: [], error: err.message };
    }
  });

  ipcMain.handle('llm-get-models-path', async () => {
    return llmPostProcessor.getModelsPathValue();
  });

  ipcMain.handle('llm-choose-models-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih Folder LLM Models',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: llmPostProcessor.getModelsPathValue(),
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false };
    }
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('llm-scan-models-folder', async () => {
    try {
      const models = llmPostProcessor.getDownloadedModelsInfo();
      return { success: true, models };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('llm-delete-model', async (_event, modelName: string) => {
    try {
      const result = llmPostProcessor.deleteModel(modelName);
      return { success: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  LLM Download (with progress)
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('llm-download-model', async (_event, modelName: string) => {
    try {
      const modelInfo = AVAILABLE_LLM_MODELS.find((m) => m.name === modelName);
      activeLlmDownload = { modelName, downloadedBytes: 0, totalBytes: modelInfo?.sizeBytes || 0 };

      const result = await llmPostProcessor.downloadModel(modelName, (progress, state, downloadedBytes, totalBytes) => {
        if (downloadedBytes !== undefined) activeLlmDownload.downloadedBytes = downloadedBytes;
        if (totalBytes !== undefined) activeLlmDownload.totalBytes = totalBytes;

        send('llm-download-progress', {
          progress,
          state,
          modelName,
          downloadedBytes: activeLlmDownload.downloadedBytes,
          totalBytes: activeLlmDownload.totalBytes,
        });

        send('download-progress', {
          progress,
          state,
          modelName,
          downloadedBytes: activeLlmDownload.downloadedBytes,
          totalBytes: activeLlmDownload.totalBytes,
          type: 'llm',
        });
      });

      send('llm-download-progress', {
        progress: 100,
        state: result ? 'completed' : 'error',
        modelName,
        downloadedBytes: activeLlmDownload.totalBytes,
        totalBytes: activeLlmDownload.totalBytes,
      });

      activeLlmDownload = { modelName: '', downloadedBytes: 0, totalBytes: 0 };
      return { success: result };
    } catch (err: any) {
      activeLlmDownload = { modelName: '', downloadedBytes: 0, totalBytes: 0 };
      send('llm-download-progress', {
        progress: 0,
        state: 'error',
        modelName,
        downloadedBytes: 0,
        totalBytes: 0,
      });
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('llm-pause-download', async () => {
    llmPostProcessor.pauseDownload();
    send('llm-download-progress', {
      progress: activeLlmDownload.totalBytes > 0
        ? Math.round((activeLlmDownload.downloadedBytes / activeLlmDownload.totalBytes) * 100)
        : 0,
      state: 'paused',
      modelName: activeLlmDownload.modelName,
      downloadedBytes: activeLlmDownload.downloadedBytes,
      totalBytes: activeLlmDownload.totalBytes,
    });
    return { success: true };
  });

  ipcMain.handle('llm-resume-download', async () => {
    llmPostProcessor.resumeDownload();
    return { success: true };
  });

  ipcMain.handle('llm-cancel-download', async () => {
    llmPostProcessor.cancelDownload();
    send('llm-download-progress', {
      progress: 0,
      state: 'cancelled',
      modelName: activeLlmDownload.modelName,
      downloadedBytes: 0,
      totalBytes: 0,
    });
    activeLlmDownload = { modelName: '', downloadedBytes: 0, totalBytes: 0 };
    return { success: true };
  });

  ipcMain.handle('llm-get-download-state', async () => {
    return llmPostProcessor.getDownloadState();
  });

  // ═══════════════════════════════════════════════════════════════
  //  LLM Testing
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('llm-test-process', async (_event, text: string, modelName?: string) => {
    try {
      const result = await llmPostProcessor.process(text, modelName);
      return { success: result.success, text: result.text, processingMs: result.processingMs, model: result.model, error: result.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  logger.info('LLM IPC handlers registered');
}
