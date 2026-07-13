import { autoUpdater, UpdateInfo } from 'electron-updater';
import { BrowserWindow, dialog, app } from 'electron';
import * as path from 'path';
import { Logger } from './logger';

/**
 * Auto Updater — Handles application updates via electron-updater.
 * 
 * Features:
 * - Check for updates on startup
 * - Download updates in background
 * - Notify user when update is ready
 * - Allow user to install update or skip
 * 
 * @example
 * ```typescript
 * const updater = new AutoUpdater(mainWindow, logger);
 * updater.checkForUpdates();
 * ```
 */
export class AutoUpdater {
  private mainWindow: BrowserWindow;
  private logger: Logger;
  private isChecking: boolean = false;
  private updateDownloaded: boolean = false;

  constructor(mainWindow: BrowserWindow, logger: Logger) {
    this.mainWindow = mainWindow;
    this.logger = logger;

    // Configure auto-updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = {
      info: (msg) => this.logger.info(`[updater] ${msg}`),
      warn: (msg) => this.logger.warn(`[updater] ${msg}`),
      error: (msg) => this.logger.error(`[updater] ${msg}`),
      debug: (msg) => this.logger.debug(`[updater] ${msg}`),
    };

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
      this.logger.info('Checking for updates...');
      this.isChecking = true;
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.logger.info(`Update available: v${info.version}`);
      this.isChecking = false;
      this.promptDownload(info);
    });

    autoUpdater.on('update-not-available', () => {
      this.logger.info('No updates available');
      this.isChecking = false;
    });

    autoUpdater.on('download-progress', (progress) => {
      this.logger.debug(`Download progress: ${progress.percent.toFixed(1)}%`);
      this.mainWindow.webContents.send('update-download-progress', {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.logger.info(`Update downloaded: v${info.version}`);
      this.updateDownloaded = true;
      this.promptInstall(info);
    });

    autoUpdater.on('error', (err) => {
      this.logger.error('Auto-updater error', err);
      this.isChecking = false;
    });
  }

  /**
   * Check for updates manually.
   */
  async checkForUpdates(): Promise<void> {
    if (this.isChecking) {
      this.logger.debug('Already checking for updates');
      return;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.logger.error('Failed to check for updates', err);
    }
  }

  /**
   * Check for updates on startup (silent — only notify if update found).
   */
  async checkOnStartup(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      // Silently fail on startup check
      this.logger.debug('Startup update check failed', err);
    }
  }

  /**
   * Prompt user to download update.
   */
  private promptDownload(info: UpdateInfo): void {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Tersedia',
      message: `VoiceFlow v${info.version} tersedia`,
      detail: 'Apakah kamu ingin download update sekarang?',
      buttons: ['Download', 'Nanti Saja'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  }

  /**
   * Prompt user to install downloaded update.
   */
  private promptInstall(info: UpdateInfo): void {
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Siap Diinstall',
      message: `VoiceFlow v${info.version} sudah didownload`,
      detail: 'Aplikasi akan restart untuk menginstall update. Simpan pekerjaanmu dulu.',
      buttons: ['Restart Sekarang', 'Nanti'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  }

  /**
   * Quit and install update (without prompt).
   */
  quitAndInstall(): void {
    autoUpdater.quitAndInstall();
  }

  /**
   * Check if update is downloaded and ready to install.
   */
  isUpdateReady(): boolean {
    return this.updateDownloaded;
  }
}
