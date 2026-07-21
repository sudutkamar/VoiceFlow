/**
 * Window Manager — handles all window creation, lifecycle, and positioning.
 * Extracted from main.ts for maintainability.
 */
import { BrowserWindow, screen, nativeImage, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger';
import { VoiceFlowDatabase as Database } from './database';
import { HotkeyManager } from './hotkeyManager';

export class WindowManager {
  mainWindow: BrowserWindow | null = null;
  miniWindow: BrowserWindow | null = null;
  miniWindowReady = false;
  deferredShowMiniWindow = false;
  isPasting = false;

  private database: Database;
  private logger: Logger;
  private hotkeyManager?: HotkeyManager;

  constructor(database: Database, logger: Logger, hotkeyManager?: HotkeyManager) {
    this.database = database;
    this.logger = logger;
    this.hotkeyManager = hotkeyManager;
  }

  isDev(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  getPreloadPath(): string {
    return path.join(__dirname, '..', 'preload.js');
  }

  getAppIcon(): string {
    const iconNames = ['icon.ico', 'icon.png'];
    for (const iconName of iconNames) {
      const iconPath = this.isDev()
        ? path.join(__dirname, '..', '..', 'resources', 'icons', iconName)
        : path.join(process.resourcesPath, 'icons', iconName);
      if (fs.existsSync(iconPath)) {
        return iconPath;
      }
    }
    return '';
  }

  createMainWindow(showInitially: boolean = true): void {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

    this.mainWindow = new BrowserWindow({
      width: sw,
      height: sh,
      minWidth: 400,
      minHeight: 500,
      webPreferences: {
        preload: this.getPreloadPath(),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
      title: 'VoiceFlow',
      icon: (() => {
        const iconPath = this.getAppIcon();
        if (iconPath) {
          return nativeImage.createFromPath(iconPath);
        }
        return undefined;
      })(),
      show: false,
      backgroundColor: '#0a0a0f',
      frame: false,
      resizable: true,
      x: 0,
      y: 0,
    });

    this.mainWindow.on('ready-to-show', () => {
      if (showInitially) {
        this.mainWindow?.setBounds({ x: 0, y: 0, width: sw, height: sh });
        this.mainWindow?.show();
        this.mainWindow?.focus();
      }
    });

    this.logger.info('[MainWindow] created, loading URL...');

    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting()) {
        event.preventDefault();
        this.mainWindow?.hide();
        if (this.database?.getSetting('show_mini_window') !== 'false') {
          this.showMiniWindow();
        }
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    if (this.isDev()) {
      this.mainWindow.loadURL('http://localhost:5173#main').catch((err) => {
        this.mainWindow?.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'main' });
      });
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'main' });
    }
  }

  createMiniWindow(): void {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

    const savedWidth = parseInt(this.database?.getSetting('mini_window_width') || '0', 10);
    const savedHeight = parseInt(this.database?.getSetting('mini_window_height') || '0', 10);
    const orientation = this.database?.getSetting('mini_bar_orientation') || 'horizontal';

    let miniWidth: number, miniHeight: number;
    let minWidth: number, minHeight: number, maxWidth: number, maxHeight: number;

    if (orientation === 'vertical') {
      miniWidth = savedWidth > 0 ? Math.max(64, Math.min(savedWidth, 72)) : 64;
      miniHeight = savedHeight > 0 ? Math.max(190, Math.min(savedHeight, 300)) : 220;
      minWidth = 64;
      minHeight = 190;
      maxWidth = 72;
      maxHeight = 300;
    } else {
      miniWidth = savedWidth > 0 ? Math.min(savedWidth, sw - 40) : Math.min(380, sw - 40);
      miniHeight = savedHeight > 0 ? Math.max(28, Math.min(savedHeight, 100)) : 52;
      minWidth = 200;
      minHeight = 28;
      maxWidth = Math.min(800, sw - 40);
      maxHeight = 100;
    }

    const savedX = parseInt(this.database?.getSetting('mini_window_x') || '0', 10);
    const savedY = parseInt(this.database?.getSetting('mini_window_y') || '0', 10);
    const hasSavedPos = savedX > 0 && savedY > 0;

    this.miniWindow = new BrowserWindow({
      width: miniWidth,
      height: miniHeight,
      x: hasSavedPos ? savedX : Math.round((sw - miniWidth) / 2),
      y: hasSavedPos ? savedY : Math.max(0, sh - miniHeight - 10),
      minWidth,
      minHeight,
      maxWidth,
      maxHeight,
      webPreferences: {
        preload: this.getPreloadPath(),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
      title: 'VoiceFlow Mini',
      icon: (() => {
        const iconPath = this.getAppIcon();
        if (iconPath) {
          return nativeImage.createFromPath(iconPath);
        }
        return undefined;
      })(),
      show: false,
      backgroundColor: '#00000000',
      frame: false,
      transparent: true,
      resizable: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      focusable: true,
    });

    this.miniWindow.setAlwaysOnTop(true, 'screen-saver');

    this.miniWindow.on('blur', () => {
      if (this.miniWindow && !this.miniWindow.isDestroyed()) {
        this.miniWindow.webContents.send('mini-window-blur');
      }
    });

    this.miniWindow.on('resize', () => {
      if (this.miniWindow && !this.miniWindow.isDestroyed() && this.database) {
        const bounds = this.miniWindow.getBounds();
        this.database.updateSetting('mini_window_width', String(bounds.width));
        this.database.updateSetting('mini_window_height', String(Math.max(28, Math.min(350, bounds.height))));
        this.database.updateSetting('mini_window_x', String(bounds.x));
        this.database.updateSetting('mini_window_y', String(bounds.y));
        this.miniWindow.webContents.send('mini-window-resize', { width: bounds.width, height: bounds.height });
      }
    });

    this.miniWindow.on('move', () => {
      if (this.miniWindow && !this.miniWindow.isDestroyed() && this.database) {
        const bounds = this.miniWindow.getBounds();
        this.database.updateSetting('mini_window_x', String(bounds.x));
        this.database.updateSetting('mini_window_y', String(bounds.y));
      }
    });

    this.miniWindow.on('hide', () => {
      const floatingEnabled = this.database?.getSetting('show_mini_window') !== 'false';
      if (!this.isQuitting() && !this.isPasting && floatingEnabled && this.miniWindow && !this.miniWindow.isDestroyed()) {
        const mw = this.miniWindow;
        setTimeout(() => {
          if (mw && !mw.isDestroyed() && !mw.isVisible() && !this.isQuitting() && !this.isPasting) {
            mw.showInactive();
          }
        }, 100);
      }
    });

    this.miniWindow.webContents.on('did-finish-load', () => {
      this.logger?.info('Mini window loaded');
      if (this.hotkeyManager && this.miniWindow) {
        this.hotkeyManager.setMiniWindow(this.miniWindow);
      }
      if (this.deferredShowMiniWindow && this.miniWindow && !this.miniWindow.isDestroyed() && !this.miniWindow.isVisible()) {
        this.deferredShowMiniWindow = false;
        const floatingEnabled = this.database?.getSetting('show_mini_window') !== 'false';
        if (floatingEnabled) {
          this.miniWindow.showInactive();
          this.miniWindow.setAlwaysOnTop(true, 'screen-saver');
          this.miniWindow.webContents.send('reload-settings');
          this.logger?.info('Deferred mini window shown');
        }
      }
    });

    this.miniWindow.on('ready-to-show', () => {
      if (this.miniWindow && !this.miniWindow.isDestroyed()) {
        const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
        const bounds = this.miniWindow.getBounds();
        const savedXVal = parseInt(this.database?.getSetting('mini_window_x') || '0', 10);
        const savedYVal = parseInt(this.database?.getSetting('mini_window_y') || '0', 10);
        const hasPos = savedXVal > 0 && savedYVal > 0;
        const targetX = hasPos ? savedXVal : Math.round((sw - bounds.width) / 2);
        const targetY = hasPos ? savedYVal : Math.max(0, sh - bounds.height - 10);
        if (bounds.x !== targetX || bounds.y !== targetY) {
          this.miniWindow.setBounds({ x: targetX, y: targetY, width: bounds.width, height: bounds.height });
        }

        this.miniWindowReady = true;
        if (this.deferredShowMiniWindow) {
          this.deferredShowMiniWindow = false;
          this.miniWindow.showInactive();
          this.miniWindow.setAlwaysOnTop(true, 'screen-saver');
          this.miniWindow.webContents.send('reload-settings');
        }
      }
    });

    if (this.isDev()) {
      this.miniWindow.loadURL('http://localhost:5173#mini').catch(() => {
        this.miniWindow?.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'mini' });
      });
    } else {
      this.miniWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'mini' });
    }
  }

  showMiniWindow(): void {
    this.logger?.info('showMiniWindow called, miniWindow exists: ' + !!this.miniWindow);
    if (!this.miniWindow || this.miniWindow.isDestroyed()) {
      this.miniWindow = null;
      this.miniWindowReady = false;
      this.createMiniWindow();
      this.logger?.info('Created new miniWindow');
    }
    if (this.hotkeyManager && this.miniWindow) {
      this.hotkeyManager.setMiniWindow(this.miniWindow);
    }
    if (!this.miniWindowReady) {
      this.deferredShowMiniWindow = true;
      this.logger?.info('Mini window not ready, deferring show');
      return;
    }
    this.miniWindow?.showInactive();
    this.miniWindow?.setAlwaysOnTop(true, 'screen-saver');
    this.miniWindow?.webContents.send('reload-settings');
    this.logger?.info('Mini window shown inactive');
  }

  hideMiniWindow(): void {
    this.deferredShowMiniWindow = false;
    if (this.miniWindow && !this.miniWindow.isDestroyed()) {
      this.miniWindow.hide();
    }
  }

  hideAllForPaste(): void {
    this.isPasting = true;
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    }
    if (this.miniWindow && !this.miniWindow.isDestroyed()) {
      this.miniWindow.hide();
    }
  }

  showAfterPaste(): void {
    this.isPasting = false;
    if (this.database?.getSetting('show_mini_window') === 'false') return;
    if (this.miniWindow && !this.miniWindow.isDestroyed()) {
      this.miniWindow.showInactive();
    }
  }

  showMainWindow(page?: string): void {
    if (!this.mainWindow) {
      this.createMainWindow();
    }
    const navigate = () => {
      if (page && this.mainWindow && !this.mainWindow.isDestroyed()) {
        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('navigate', page);
          }
        }, 80);
      }
    };
    if (this.mainWindow?.webContents.isLoading()) {
      this.mainWindow.webContents.once('did-finish-load', navigate);
    } else {
      navigate();
    }
    this.mainWindow?.show();
    this.mainWindow?.focus();
    this.hideMiniWindow();
  }

  private _isQuitting = false;

  isQuitting(): boolean {
    return this._isQuitting;
  }

  setQuitting(val: boolean): void {
    this._isQuitting = val;
  }

  destroyWindows(): void {
    try {
      if (this.miniWindow && !this.miniWindow.isDestroyed()) {
        this.miniWindow.destroy();
        this.miniWindow = null;
      }
    } catch {}
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.destroy();
        this.mainWindow = null;
      }
    } catch {}
  }
}
