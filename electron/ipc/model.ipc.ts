import { ipcMain, BrowserWindow } from 'electron';
import { VoiceFlowDatabase as Database } from '../modules/database';
import { Logger } from '../modules/logger';
import { ModelDownloader, AVAILABLE_MODELS } from '../modules/modelDownloader';

let modelDownloader: ModelDownloader;

export function setupModelIPC(mainWindow: BrowserWindow, database: Database, logger: Logger): void {
  modelDownloader = new ModelDownloader(logger);
  modelDownloader.setMainWindow(mainWindow);

  ipcMain.handle('get-available-models', async () => {
    return AVAILABLE_MODELS.map(model => ({
      ...model,
      downloaded: modelDownloader.isModelDownloaded(model.name),
    }));
  });

  ipcMain.handle('get-downloaded-models', async () => {
    return modelDownloader.getDownloadedModels();
  });

  ipcMain.handle('download-model', async (event, modelName: string) => {
    return await modelDownloader.downloadModel(modelName);
  });

  ipcMain.handle('cancel-download', async () => {
    modelDownloader.cancelDownload();
    return { success: true };
  });

  ipcMain.handle('get-download-progress', async () => {
    return modelDownloader.getDownloadProgress();
  });

  ipcMain.handle('is-model-downloaded', async (event, modelName: string) => {
    return modelDownloader.isModelDownloaded(modelName);
  });

  ipcMain.handle('get-models-path', async () => {
    return modelDownloader.getModelsPathValue();
  });

  ipcMain.handle('delete-model', async (event, modelName: string) => {
    const success = modelDownloader.deleteModel(modelName);
    return { success };
  });
}
