import { ipcMain, BrowserWindow, dialog } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { VoiceFlowDatabase as Database } from '../modules/database';
import { Logger } from '../modules/logger';
import { HotkeyManager } from '../modules/hotkeyManager';
import { getTranscriberInstance } from './dictation.ipc';

export function setupSettingsIPC(
  mainWindow: BrowserWindow,
  database: Database,
  logger: Logger,
  hotkeyManager?: HotkeyManager
): void {
  ipcMain.handle('get-settings', async () => {
    try {
      return database.getAllSettings();
    } catch (error) {
      logger.error('Failed to get settings', error);
      return {};
    }
  });

  ipcMain.handle('update-setting', async (event, key: string, value: string) => {
    try {
      database.updateSetting(key, value);
      logger.info(`Setting updated: ${key} = ${value}`);
      // Apply setting changes immediately
      if (key === 'push_to_talk' && hotkeyManager) {
        hotkeyManager.updatePushToTalk(value === 'true');
      }
      // Warm up transcriber when model changes
      if (key === 'model') {
        try {
          const transcriber = getTranscriberInstance();
          if (transcriber) transcriber.warmup(value);
        } catch (err) {
          logger.warn('Model warmup failed after setting change', err);
        }
      }
      // Broadcast theme change to all windows
      if (key === 'theme') {
        mainWindow.webContents.send('theme-changed', value);
        // Also send to mini window if it exists
        const { BrowserWindow } = require('electron');
        const allWindows = BrowserWindow.getAllWindows();
        for (const win of allWindows) {
          if (!win.isDestroyed()) {
            win.webContents.send('theme-changed', value);
          }
        }
      }
      return { success: true };
    } catch (error) {
      logger.error('Failed to update setting', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('get-history', async (event, limit?: number) => {
    try {
      return database.getHistory(limit || 100);
    } catch (error) {
      logger.error('Failed to get history', error);
      return [];
    }
  });

  ipcMain.handle('search-history', async (event, query: string) => {
    try {
      return database.searchHistory(query);
    } catch (error) {
      logger.error('Failed to search history', error);
      return [];
    }
  });

  ipcMain.handle('clear-history', async () => {
    try {
      database.clearHistory();
      logger.info('History cleared');
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear history', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('delete-history-item', async (event, id: string) => {
    try {
      database.deleteHistoryItem(id);
      logger.info(`History item deleted: ${id}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete history item', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('export-history', async () => {
    try {
      const csv = database.exportHistory();
      if (!csv) {
        return { success: false, error: 'No history to export' };
      }

      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export History',
        defaultPath: 'voiceflow-history.csv',
        filters: [
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export cancelled' };
      }

      fs.writeFileSync(result.filePath, csv, 'utf-8');
      logger.info(`History exported to: ${result.filePath}`);
      return { success: true, path: result.filePath };
    } catch (error) {
      logger.error('Failed to export history', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('get-dictionary', async () => {
    try {
      return database.getDictionary();
    } catch (error) {
      logger.error('Failed to get dictionary', error);
      return [];
    }
  });

  ipcMain.handle('add-dictionary-entry', async (event, phrase: string, replacement: string) => {
    try {
      const id = uuidv4();
      database.addDictionaryEntry(id, phrase, replacement);
      logger.info(`Dictionary entry added: ${phrase} -> ${replacement}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to add dictionary entry', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('update-dictionary-entry', async (event, id: string, phrase: string, replacement: string) => {
    try {
      database.updateDictionaryEntry(id, phrase, replacement);
      logger.info(`Dictionary entry updated: ${id}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to update dictionary entry', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('delete-dictionary-entry', async (event, id: string) => {
    try {
      database.deleteDictionaryEntry(id);
      logger.info(`Dictionary entry deleted: ${id}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete dictionary entry', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('update-hotkey', async (event, newHotkey: string) => {
    try {
      if (!hotkeyManager) {
        // Fallback: just update database if hotkeyManager not available
        database.updateSetting('hotkey', newHotkey);
        return { success: true };
      }
      return hotkeyManager.updateHotkey(newHotkey);
    } catch (error) {
      logger.error('Failed to update hotkey', error);
      return { success: false, error: String(error) };
    }
  });

  // Log level control
  ipcMain.handle('set-log-level', async (event, level: string) => {
    try {
      if (['debug', 'info', 'warn', 'error'].includes(level)) {
        logger.setLogLevel(level as any);
        database.updateSetting('log_level', level);
        logger.info(`Log level changed to: ${level}`);
        return { success: true };
      }
      return { success: false, error: 'Invalid log level' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Auto-update
  ipcMain.handle('check-for-updates', async () => {
    try {
      const { AutoUpdater } = require('../modules/autoUpdater');
      // AutoUpdater is already initialized in main, just trigger check
      mainWindow.webContents.send('check-for-updates-trigger');
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
