import { ipcMain, BrowserWindow, dialog } from 'electron';
import { VoiceFlowDatabase as Database } from '../modules/database';
import { Logger } from '../modules/logger';
import { ModelDownloader, AVAILABLE_MODELS } from '../modules/modelDownloader';
import { Transcriber } from '../modules/transcriber';

let modelDownloader: ModelDownloader;
let transcriberRef: Transcriber | null = null;

/**
 * Set transcriber reference so models path changes are synced.
 */
export function setTranscriberForModelSync(transcriber: Transcriber | null): void {
  transcriberRef = transcriber;
}

export function setupModelIPC(mainWindow: BrowserWindow, database: Database, logger: Logger): void {
  const savedSettings = database.getAllSettings();
  const savedModelsPath = savedSettings.custom_models_path || null;
  
  modelDownloader = new ModelDownloader(logger, savedModelsPath, database);
  modelDownloader.setMainWindow(mainWindow);

  // Sync Transcriber path with ModelDownloader's initial path
  if (transcriberRef) {
    transcriberRef.updateModelsPath(modelDownloader.getModelsPathValue());
  }

  ipcMain.handle('get-available-models', async () => {
    return modelDownloader.getAvailableModels();
  });

  ipcMain.handle('scan-models-folder', async () => {
    // Force re-scan by calling getAvailableModels which re-reads the folder
    return modelDownloader.getAvailableModels();
  });

  ipcMain.handle('get-downloaded-models', async () => {
    return modelDownloader.getDownloadedModels();
  });

  ipcMain.handle('download-model', async (event, modelName: string) => {
    return await modelDownloader.downloadModel(modelName);
  });

  ipcMain.handle('pause-download', async () => {
    return modelDownloader.pauseDownload();
  });

  ipcMain.handle('resume-download', async () => {
    return await modelDownloader.resumeDownload();
  });

  ipcMain.handle('cancel-download', async () => {
    modelDownloader.cancelDownload();
    return { success: true };
  });

  ipcMain.handle('get-download-progress', async () => {
    return {
      progress: modelDownloader.getDownloadProgress(),
      state: modelDownloader.getDownloadState(),
      modelName: modelDownloader.getCurrentModelName(),
      downloadedBytes: modelDownloader.getDownloadedBytes(),
      totalBytes: modelDownloader.getTotalBytes(),
    };
  });

  ipcMain.handle('is-model-downloaded', async (event, modelName: string) => {
    return modelDownloader.isModelDownloaded(modelName);
  });

  ipcMain.handle('get-models-path', async () => {
    return modelDownloader.getModelsPathValue();
  });

  ipcMain.handle('has-any-model', async () => {
    return modelDownloader.getDownloadedModels().length > 0;
  });

  ipcMain.handle('get-custom-models-path', async () => {
    return modelDownloader.getCustomModelsPath();
  });

  ipcMain.handle('choose-models-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih Folder untuk Menyimpan Models',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: modelDownloader.getModelsPathValue(),
    });

    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: 'Dibatalkan' };
    }

    const selectedPath = result.filePaths[0];
    const setResult = modelDownloader.setCustomModelsPath(selectedPath);
    
    if (setResult.success) {
      database.updateSetting('custom_models_path', selectedPath);
      logger.info(`Models path saved to settings: ${selectedPath}`);
      // Sync Transcriber path
      if (transcriberRef) {
        transcriberRef.updateModelsPath(selectedPath);
        transcriberRef.warmup(database.getSetting('model') || '');
        logger.info(`Transcriber path synced to: ${selectedPath}`);
      }
    }
    
    return { success: setResult.success, path: selectedPath, error: setResult.error };
  });

  ipcMain.handle('delete-model', async (event, modelName: string) => {
    const success = modelDownloader.deleteModel(modelName);
    return { success };
  });

  ipcMain.handle('force-download-model', async (event, modelName: string) => {
    return await modelDownloader.forceDownloadModel(modelName);
  });

  ipcMain.handle('has-interrupted-download', async () => {
    return modelDownloader.hasInterruptedDownload();
  });

  ipcMain.handle('get-interrupted-download-info', async () => {
    return modelDownloader.getInterruptedDownloadInfo();
  });

  ipcMain.handle('reset-models-path', async () => {
    modelDownloader.setCustomModelsPath('');
    database.updateSetting('custom_models_path', '');
    // Sync Transcriber path back to default
    if (transcriberRef) {
      transcriberRef.updateModelsPath(modelDownloader.getModelsPathValue());
      transcriberRef.warmup(database.getSetting('model') || '');
    }
    return { success: true, path: modelDownloader.getModelsPathValue() };
  });
}
