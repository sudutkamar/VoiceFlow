import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { VoiceFlowDatabase as Database } from './modules/database';
import { Logger } from './modules/logger';
import { HotkeyManager } from './modules/hotkeyManager';
import { setupDictationIPC } from './ipc/dictation.ipc';
import { setupSettingsIPC } from './ipc/settings.ipc';
import { setupModelIPC } from './ipc/model.ipc';
import { setupSnippetIPC } from './ipc/snippet.ipc';

// Prevent EPIPE errors from crashing the app (broken pipe when stdout is unavailable)
process.on('uncaughtException', (err: any) => {
  if (err?.code === 'EPIPE') {
    // Silently ignore broken pipe errors
    return;
  }
  // Log other errors but don't crash
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason: any) => {
  if (reason?.code === 'EPIPE') {
    return;
  }
  console.error('Unhandled Rejection:', reason);
});

let mainWindow: BrowserWindow | null = null;
let miniWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let database: Database;
let logger: Logger;
let hotkeyManager: HotkeyManager;
let isQuitting = false;
let isPasting = false;

function isDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

function getPreloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

// ============ MAIN WINDOW (Full UI) ============
function createMainWindow(showInitially: boolean = true): void {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 600,
    minWidth: 400,
    minHeight: 500,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: 'VoiceFlow',
    icon: getAppIcon(),
    show: showInitially,
    backgroundColor: '#0a0a0f',
    frame: false,
    resizable: true,
    center: true,
  });

  mainWindow.on('ready-to-show', () => {
    if (showInitially) {
      mainWindow?.maximize();
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  // When minimized -> minimize to taskbar (stay in taskbar)
  // Don't hide window, just minimize normally

  // When closed -> show mini bar instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      if (database?.getSetting('show_mini_window') !== 'false') {
        showMiniWindow();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev()) {
    mainWindow.loadURL('http://localhost:5173#main');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'main' });
  }
}

// ============ MINI WINDOW (Floating Bar) ============
function createMiniWindow(): void {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const miniWidth = Math.min(460, sw - 40);
  const miniHeight = 64;
  const taskbarHeight = sh; // workArea already excludes taskbar

  miniWindow = new BrowserWindow({
    width: miniWidth,
    height: miniHeight,
    x: Math.round((sw - miniWidth) / 2),
    y: taskbarHeight - miniHeight - 10, // 10px above taskbar bottom
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: 'VoiceFlow Mini',
    icon: getAppIcon(),
    show: false,
    backgroundColor: '#00000000',
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
  });

  miniWindow.on('blur', () => {
    // Notify renderer to close dropdown when clicking outside
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send('mini-window-blur');
    }
  });

  // Prevent any attempt to hide the mini window (except during paste or quit)
  miniWindow.on('hide', () => {
    const floatingEnabled = database?.getSetting('show_mini_window') !== 'false';
    if (!isQuitting && !isPasting && floatingEnabled && miniWindow && !miniWindow.isDestroyed()) {
      setTimeout(() => miniWindow?.showInactive(), 50);
    }
  });

  miniWindow.webContents.on('did-finish-load', () => {
    logger?.info('Mini window loaded');
    // Set miniWindow reference in hotkeyManager after load
    if (hotkeyManager && miniWindow) {
      hotkeyManager.setMiniWindow(miniWindow);
    }
  });

  if (isDev()) {
    miniWindow.loadURL('http://localhost:5173#mini');
  } else {
    miniWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'mini' });
  }
}

function showMiniWindow(): void {
  logger?.info('showMiniWindow called, miniWindow exists: ' + !!miniWindow);
  if (!miniWindow) {
    createMiniWindow();
    logger?.info('Created new miniWindow');
  }
  // Update hotkeyManager with miniWindow reference
  if (hotkeyManager && miniWindow) {
    hotkeyManager.setMiniWindow(miniWindow);
  }
  // Show without stealing focus, so user's cursor stays in the target app.
  miniWindow?.showInactive();
  logger?.info('Mini window shown inactive');
}

function hideMiniWindow(): void {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.hide();
  }
}

function hideAllForPaste(): void {
  isPasting = true;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide();
  }
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.hide();
  }
}

function showAfterPaste(): void {
  isPasting = false;
  if (database?.getSetting('show_mini_window') === 'false') return;
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.showInactive();
  }
}

function showMainWindow(page?: string): void {
  if (!mainWindow) {
    createMainWindow();
  }
  const navigate = () => {
    if (page && mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('navigate', page);
        }
      }, 80);
    }
  };
  if (mainWindow?.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', navigate);
  } else {
    navigate();
  }
  mainWindow?.show();
  mainWindow?.focus();
  hideMiniWindow();
}

function getAppIcon(): string {
  const iconName = 'icon.png';
  const iconPath = isDev()
    ? path.join(__dirname, '..', 'resources', 'icons', iconName)
    : path.join(process.resourcesPath, 'icons', iconName);
  return fs.existsSync(iconPath) ? iconPath : '';
}

// ============ TRAY ============
function createTrayIcon(): Electron.NativeImage {
  // Try to load from file first
  const iconPath = isDev()
    ? path.join(__dirname, '..', 'resources', 'icons', 'tray-icon.png')
    : path.join(process.resourcesPath, 'icons', 'tray-icon.png');

  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }

  // Fallback: Use the app icon if tray icon not found
  const appIconPath = getAppIcon();
  if (appIconPath && fs.existsSync(appIconPath)) {
    return nativeImage.createFromPath(appIconPath);
  }

  // Last resort: Create a simple colored square as tray icon
  // Using a 16x16 PNG data URL with a microphone shape
  const svgStr = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <rect width="16" height="16" fill="#1a1a2e" rx="2"/>
      <path d="M8 3a2 2 0 0 0-2 2v3a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2z" fill="#53c0f0"/>
      <path d="M11 6.5v1a3 3 0 0 1-6 0v-1" stroke="#53c0f0" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <line x1="8" y1="10" x2="8" y2="12" stroke="#53c0f0" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="6" y1="12" x2="10" y2="12" stroke="#53c0f0" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  `;
  const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svgStr).toString('base64');
  return nativeImage.createFromDataURL(dataUrl);
}

function createTray(): void {
  const trayIcon = createTrayIcon();
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    { label: '🎤 VoiceFlow', enabled: false },
    { type: 'separator' },
    {
      label: '📖 Open VoiceFlow',
      click: () => showMainWindow(),
    },
    {
      label: '🎙️ Record',
      click: () => hotkeyManager.simulateHotkey(),
    },
    { type: 'separator' },
    {
      label: '❌ Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('VoiceFlow');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => showMainWindow());
}

// ============ IPC ============
function setupIPC(): void {
  if (!mainWindow || !database || !logger) return;

  setupDictationIPC(mainWindow, database, logger, hotkeyManager, hideAllForPaste, showAfterPaste);
  setupSettingsIPC(mainWindow, database, logger, hotkeyManager);
  setupModelIPC(mainWindow, database, logger);
  setupSnippetIPC(mainWindow, database, logger);

  ipcMain.handle('get-app-state', () => hotkeyManager.getState());
  ipcMain.handle('get-target-app', () => hotkeyManager.getTargetAppName());
  ipcMain.handle('get-version', () => app.getVersion());
  ipcMain.handle('quit-app', () => { isQuitting = true; app.quit(); });
  ipcMain.handle('show-main', (_, page?: string) => showMainWindow(page));
  ipcMain.handle('minimize-to-bar', () => {
    mainWindow?.hide();
    if (database?.getSetting('show_mini_window') !== 'false') showMiniWindow();
  });
  ipcMain.handle('minimize-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });
  ipcMain.handle('maximize-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  ipcMain.handle('show-mini-window', () => showMiniWindow());
  ipcMain.handle('hide-mini-window', () => hideMiniWindow());
  ipcMain.handle('resize-mini-window', (_, height: number) => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      // Resize upward/downward while preserving the user's dragged X position and bottom anchor.
      const bounds = miniWindow.getBounds();
      const nextHeight = Math.max(64, Math.round(height));
      miniWindow.setBounds({
        x: bounds.x,
        y: bounds.y + bounds.height - nextHeight,
        width: bounds.width,
        height: nextHeight,
      }, false);
    }
  });
  ipcMain.handle('set-mini-window-focusable', (_, focusable: boolean) => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.setFocusable(focusable);
    }
  });
  
  ipcMain.on('mini-window-ready', () => {
    logger?.info('Mini window reported ready');
    if (hotkeyManager?.getState() === 'recording' && miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send('start-recording-request');
    }
    // Send current target app name
    if (miniWindow && !miniWindow.isDestroyed() && hotkeyManager) {
      miniWindow.webContents.send('target-app-changed', hotkeyManager.getTargetAppName());
    }
  });
  ipcMain.handle('is-autostart', () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle('set-autostart', (_, enable: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enable, path: app.getPath('exe') });
    return { success: true };
  });
}

// ============ APP LIFECYCLE ============
app.whenReady().then(() => {
  logger = new Logger();
  logger.info('VoiceFlow starting...');

  database = new Database(logger);
  database.initialize();

  // Check before creating the window, so first install can start directly in floating mode.
  // Use VOICEFLOW_FIRST_RUN=1 env var to simulate first run in development
  const forceFirstRun = process.env.VOICEFLOW_FIRST_RUN === '1';
  const isFirstRun = forceFirstRun || !database.getSetting('has_run_before');

  // Always create main window (shown by default)
  createMainWindow(true);
  createTray();

  if (mainWindow) {
    hotkeyManager = new HotkeyManager(mainWindow, database, logger, showMiniWindow, hideMiniWindow);
    hotkeyManager.register();
    
    if (isFirstRun) {
      database.updateSetting('has_run_before', 'true');
      // First install: also show floating UI after main window is ready
      mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
          showMiniWindow();
        }, 800);
      });
    }
  }

  setupIPC();
  logger.info('VoiceFlow ready');
});

app.on('window-all-closed', () => {
  if (!isQuitting) return;
  hotkeyManager?.unregister();
  database?.close();
  logger?.info('VoiceFlow closed');
  app.quit();
});

app.on('activate', () => showMainWindow());

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
});
