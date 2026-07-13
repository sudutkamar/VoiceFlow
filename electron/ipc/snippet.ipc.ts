import { ipcMain, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { VoiceFlowDatabase as Database } from '../modules/database';
import { Logger } from '../modules/logger';

export function setupSnippetIPC(mainWindow: BrowserWindow, database: Database, logger: Logger): void {
  ipcMain.handle('get-snippets', async () => {
    try {
      return database.getSnippets();
    } catch (error) {
      logger.error('Failed to get snippets', error);
      return [];
    }
  });

  ipcMain.handle('add-snippet', async (event, trigger: string, output: string) => {
    try {
      const id = uuidv4();
      database.addSnippet(id, trigger, output);
      logger.info(`Snippet added: ${trigger}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to add snippet', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('update-snippet', async (event, id: string, trigger: string, output: string) => {
    try {
      database.updateSnippet(id, trigger, output);
      logger.info(`Snippet updated: ${id}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to update snippet', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('delete-snippet', async (event, id: string) => {
    try {
      database.deleteSnippet(id);
      logger.info(`Snippet deleted: ${id}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete snippet', error);
      return { success: false, error: String(error) };
    }
  });

  // Dictionary import/export
  ipcMain.handle('export-dictionary', async () => {
    try {
      const csv = database.exportDictionary();
      return { success: true, data: csv };
    } catch (error) {
      logger.error('Failed to export dictionary', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('import-dictionary', async (event, csvContent: string) => {
    try {
      const result = database.importDictionary(csvContent);
      logger.info(`Dictionary imported: ${result.imported} entries`);
      return { success: true, ...result };
    } catch (error) {
      logger.error('Failed to import dictionary', error);
      return { success: false, error: String(error) };
    }
  });
}
