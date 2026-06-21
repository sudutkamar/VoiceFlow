import { ipcMain, BrowserWindow, dialog } from 'electron';
import { VoiceFlowDatabase as Database } from '../modules/database';
import { Logger } from '../modules/logger';
import { ModelDownloader, AVAILABLE_MODELS } from '../modules/modelDownloader';

let modelDownloader: ModelDownloader;

export function setupModelIPC(mainWindow: BrowserWindow, database: Database, logger: Logger): void {
  const savedSettings = database.getAllSettings();
  const savedModelsPath = savedSettings.custom_models_path || null;
  
  modelDownloader = new ModelDownloader(logger, savedModelsPath);
  modelDownloader.setMainWindow(mainWindow);

  ipcMain.handle('get-available-models', async () => {
    return AVAILABLE_MODELS.map(model => {
      const downloaded = modelDownloader.isModelDownloaded(model.name);
      const fileSize = modelDownloader.getModelFileSize(model.name);
      return {
        ...model,
        downloaded,
        fileSize,
        isValid: downloaded,
      };
    });
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
    };
  });

  ipcMain.handle('is-model-downloaded', async (event, modelName: string) => {
    return modelDownloader.isModelDownloaded(modelName);
  });

  ipcMain.handle('get-models-path', async () => {
    return modelDownloader.getModelsPathValue();
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

  ipcMain.handle('reset-models-path', async () => {
    modelDownloader.setCustomModelsPath('');
    database.updateSetting('custom_models_path', '');
    return { success: true, path: modelDownloader.getModelsPathValue() };
  });
}
