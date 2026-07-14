/**
 * Engine IPC — GPU/CUDA folder management.
 *
 * Choose folder, scan, reset untuk GPU/CUDA engine path.
 */
import { ipcMain, dialog, BrowserWindow } from 'electron';
import type { Logger } from '../modules/logger';
import type { VoiceFlowDatabase } from '../modules/database';
import type { CudaDownloader } from '../modules/cudaDownloader';
import type { Transcriber } from '../modules/transcriber';

interface EngineIpcDeps {
  logger: Logger;
  database: VoiceFlowDatabase;
  cudaDownloader: CudaDownloader;
  transcriberRef: () => Transcriber | null;
  mainWindow: BrowserWindow | null;
}

export function registerEngineIpc(deps: EngineIpcDeps): void {
  const { logger, database, cudaDownloader, transcriberRef, mainWindow } = deps;

  // Get current GPU path
  ipcMain.handle('get-gpu-path', () => {
    return cudaDownloader.getCudaPathValue();
  });

  // Choose GPU folder — opens folder picker dialog
  ipcMain.handle('choose-gpu-folder', async () => {
    if (!mainWindow) return { success: false, error: 'Window not ready' };

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih Folder untuk CUDA / GPU Engine',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: cudaDownloader.getCudaPathValue(),
    });

    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: 'Dibatalkan' };
    }

    const selectedPath = result.filePaths[0];
    const setResult = cudaDownloader.setCudaPath(selectedPath);

    if (setResult.success) {
      database.updateSetting('custom_gpu_path', selectedPath);
      logger.info(`GPU path saved to settings: ${selectedPath}`);

      // Sync Transcriber GPU detection
      const transcriber = transcriberRef();
      if (transcriber) {
        transcriber.detectGpuExternal();
      }
    }

    return { success: setResult.success, path: selectedPath, error: setResult.error };
  });

  // Scan GPU folder — check which DLLs are present
  ipcMain.handle('scan-gpu-folder', () => {
    const result = cudaDownloader.scanCudaFolder();
    return result;
  });

  // Reset GPU path to default
  ipcMain.handle('reset-gpu-path', () => {
    const defaultPath = cudaDownloader.resetCudaPath();
    database.updateSetting('custom_gpu_path', '');

    // Sync Transcriber
    const transcriber = transcriberRef();
    if (transcriber) {
      transcriber.detectGpuExternal();
    }

    logger.info(`GPU path reset to default: ${defaultPath}`);
    return { success: true, path: defaultPath };
  });
}
