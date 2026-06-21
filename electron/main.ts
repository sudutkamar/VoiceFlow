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
function createMainWindow(): void {
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
    show: true,
    backgroundColor: '#0a0a0f',
    frame: false,
    resizable: true,
    center: true,
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // When minimized -> show mini bar
  mainWindow.on('minimize', () => {
    mainWindow?.hide();
    showMiniWindow();
  });

  // When closed -> show mini bar instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      showMiniWindow();
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
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize;

  miniWindow = new BrowserWindow({
    width: Math.min(420, sw - 40),
    height: 56,
    x: Math.round((sw - Math.min(420, sw - 40)) / 2),
    y: 20,
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
    focusable: false,
  });

  miniWindow.on('blur', () => {
    // Don't hide on blur - keep it visible always
  });

  // Prevent any attempt to hide the mini window (except during paste or quit)
  miniWindow.on('hide', () => {
    if (!isQuitting && !isPasting && miniWindow && !miniWindow.isDestroyed()) {
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
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.showInactive();
  }
}

function showMainWindow(): void {
  if (!mainWindow) {
    createMainWindow();
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
  ipcMain.handle('show-main', () => showMainWindow());
  ipcMain.handle('minimize-to-bar', () => { mainWindow?.hide(); showMiniWindow(); });
  ipcMain.handle('show-mini-window', () => showMiniWindow());
  ipcMain.handle('hide-mini-window', () => hideMiniWindow());
  
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

  createMainWindow();
  createTray();

  if (mainWindow) {
    hotkeyManager = new HotkeyManager(mainWindow, database, logger, showMiniWindow, hideMiniWindow);
    hotkeyManager.register();
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
