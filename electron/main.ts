import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, screen, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { VoiceFlowDatabase as Database } from './modules/database';
import { Logger } from './modules/logger';
import { HotkeyManager } from './modules/hotkeyManager';
import { CudaDownloader } from './modules/cudaDownloader';
import { setupDictationIPC, getTranscriberInstance } from './ipc/dictation.ipc';
import { setupSettingsIPC } from './ipc/settings.ipc';
import { setupModelIPC, setTranscriberForModelSync } from './ipc/model.ipc';
import { setupSnippetIPC } from './ipc/snippet.ipc';

// Fix GPU cache errors on Windows - set cache directory to app's own folder
const cacheDir = path.join(app.getPath('userData'), 'cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}
app.setPath('cache', cacheDir);
app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
app.commandLine.appendSwitch('gpu-cache-dir', path.join(cacheDir, 'gpu'));

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
let cudaDownloader: CudaDownloader;
let isQuitting = false;
let isPasting = false;
let miniWindowReady = false;
let deferredShowMiniWindow = false;

function isDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

function getPreloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

// ============ MAIN WINDOW (Full UI) ============
function createMainWindow(showInitially: boolean = true): void {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: sw,
    height: sh,
    minWidth: 400,
    minHeight: 500,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: 'VoiceFlow',
    icon: (() => {
      const iconPath = getAppIcon();
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

  mainWindow.on('ready-to-show', () => {
    if (showInitially) {
      mainWindow?.setBounds({ x: 0, y: 0, width: sw, height: sh });
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
  
  // Load saved size or use defaults
  const savedWidth = parseInt(database?.getSetting('mini_window_width') || '0', 10);
  const savedHeight = parseInt(database?.getSetting('mini_window_height') || '0', 10);
  
  const miniWidth = savedWidth > 0 ? Math.min(savedWidth, sw - 40) : Math.min(380, sw - 40);
  const miniHeight = savedHeight > 0 ? Math.max(28, Math.min(savedHeight, 200)) : 52;
  const taskbarHeight = sh; // workArea already excludes taskbar

  miniWindow = new BrowserWindow({
    width: miniWidth,
    height: miniHeight,
    x: Math.round((sw - miniWidth) / 2),
    y: taskbarHeight - miniHeight - 10,
    minWidth: 100,
    minHeight: 28,
    maxWidth: Math.min(800, sw - 40),
    maxHeight: 200,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: 'VoiceFlow Mini',
    icon: (() => {
      const iconPath = getAppIcon();
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

  // Set always on top with highest level to prevent other windows from covering it
  miniWindow.setAlwaysOnTop(true, 'screen-saver');

  miniWindow.on('blur', () => {
    // Notify renderer to close dropdown when clicking outside
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.webContents.send('mini-window-blur');
    }
  });

  // Save window size on resize
  miniWindow.on('resize', () => {
    if (miniWindow && !miniWindow.isDestroyed() && database) {
      const bounds = miniWindow.getBounds();
      database.updateSetting('mini_window_width', String(bounds.width));
      database.updateSetting('mini_window_height', String(Math.max(28, Math.min(200, bounds.height))));
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
    // Show if showMiniWindow was called while window was still loading
    if (deferredShowMiniWindow && miniWindow && !miniWindow.isDestroyed() && !miniWindow.isVisible()) {
      deferredShowMiniWindow = false;
      const floatingEnabled = database?.getSetting('show_mini_window') !== 'false';
      if (floatingEnabled) {
        miniWindow.showInactive();
        miniWindow.setAlwaysOnTop(true, 'screen-saver');
        logger?.info('Deferred mini window shown');
      }
    }
  });

  miniWindow.on('ready-to-show', () => {
    // Prevent flash — window stays hidden until showInactive() is called
    if (miniWindow && !miniWindow.isDestroyed()) {
      miniWindow.hide();
      miniWindowReady = true;
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
  if (!miniWindow || miniWindow.isDestroyed()) {
    miniWindow = null;
    miniWindowReady = false;
    createMiniWindow();
    logger?.info('Created new miniWindow');
  }
  // Update hotkeyManager with miniWindow reference
  if (hotkeyManager && miniWindow) {
    hotkeyManager.setMiniWindow(miniWindow);
  }
  // Only show after content is fully loaded to prevent flash
  if (!miniWindowReady) {
    deferredShowMiniWindow = true;
    logger?.info('Mini window not ready, deferring show');
    return;
  }
  // Show without stealing focus, so user's cursor stays in the target app.
  miniWindow?.showInactive();
  // Ensure always on top after showing
  miniWindow?.setAlwaysOnTop(true, 'screen-saver');
  logger?.info('Mini window shown inactive');
}

function hideMiniWindow(): void {
  deferredShowMiniWindow = false;
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
  // Try .ico first (best for Windows), then .png
  const iconNames = ['icon.ico', 'icon.png'];
  for (const iconName of iconNames) {
    const iconPath = isDev()
      ? path.join(__dirname, '..', 'resources', 'icons', iconName)
      : path.join(process.resourcesPath, 'icons', iconName);
    if (fs.existsSync(iconPath)) {
      console.log('[Icon] Found:', iconPath);
      return iconPath;
    }
  }
  console.warn('[Icon] No icon found!');
  return '';
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

  // Initialize CUDA downloader
  cudaDownloader = new CudaDownloader(logger);
  cudaDownloader.checkStatus().then(status => {
    logger.info('CUDA status', status);
    // If GPU exists but CUDA DLLs not in resources, try copy from bundled
    if (status.needsDownload) {
      const copied = cudaDownloader.copyFromResources();
      if (copied) {
        logger.info('CUDA DLLs copied from resources to user data');
      }
    }
  }).catch(err => logger.warn('CUDA check failed', err));

  setupDictationIPC(mainWindow, database, logger, hotkeyManager, hideAllForPaste, showAfterPaste);
  
  // Wire transcriber BEFORE model IPC so path sync works immediately
  const dicTranscriber = getTranscriberInstance();
  if (dicTranscriber) {
    setTranscriberForModelSync(dicTranscriber);
    logger.info('Transcriber synced with ModelDownloader');
  }
  
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
  ipcMain.handle('resize-mini-window', (_, height: number, width?: number) => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      // Resize upward/downward while preserving the user's dragged X position and bottom anchor.
      const bounds = miniWindow.getBounds();
      const nextHeight = Math.max(28, Math.round(height));
      const nextWidth = width ? Math.round(width) : bounds.width;
      miniWindow.setBounds({
        x: bounds.x,
        y: bounds.y + bounds.height - nextHeight,
        width: nextWidth,
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
  ipcMain.handle('get-gpu-status', async () => {
    try {
      const status = await cudaDownloader.checkStatus();
      const whisperDir = app.isPackaged
        ? path.join(process.resourcesPath, 'whisper')
        : path.join(__dirname, '..', 'resources', 'whisper');
      return {
        hasGpu: status.hasNvidiaGpu,
        cudaDllsPresent: status.cudaDllsPresent,
        mode: status.hasNvidiaGpu ? (status.cudaDllsPresent ? 'GPU (CUDA)' : 'GPU (needs download)') : 'CPU Only',
        whisperDir,
        cudaPath: status.cudaPath,
        needsDownload: status.needsDownload,
        downloadUrl: status.needsDownload ? cudaDownloader.getDownloadUrl() : null,
      };
    } catch {
      return { hasGpu: false, mode: 'CPU Only', whisperDir: '', cudaDllsPresent: false, needsDownload: false };
    }
  });
  
  ipcMain.handle('clear-cache', async () => {
    try {
      const cacheDir = path.join(app.getPath('userData'), 'cache');
      const tempDir = path.join(app.getPath('userData'), 'temp');
      let cleared = 0;
      
      // Clear GPU/cache directory
      if (fs.existsSync(cacheDir)) {
        const deleteDir = (dirPath: string) => {
          try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dirPath, entry.name);
              if (entry.isDirectory()) {
                deleteDir(fullPath);
                try { fs.rmdirSync(fullPath); } catch {}
              } else {
                try { fs.unlinkSync(fullPath); cleared++; } catch {}
              }
            }
          } catch {}
        };
        deleteDir(cacheDir);
      }
      
      // Clear temp directory
      if (fs.existsSync(tempDir)) {
        try {
          const entries = fs.readdirSync(tempDir);
          for (const entry of entries) {
            try {
              fs.unlinkSync(path.join(tempDir, entry));
              cleared++;
            } catch {}
          }
        } catch {}
      }
      
      // Recreate directories
      [cacheDir, path.join(cacheDir, 'gpu'), path.join(cacheDir, 'code-cache'), tempDir].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      });
      
      logger.info(`Cache cleared: ${cleared} files removed`);
      return { success: true, filesCleared: cleared };
    } catch (error: any) {
      logger.error('Failed to clear cache', error);
      return { success: false, error: error.message };
    }
  });
}

// ============ APP LIFECYCLE ============
// Ensure cache directories exist before app is ready
const ensureCacheDirs = () => {
  const dirs = [
    path.join(app.getPath('userData'), 'cache'),
    path.join(app.getPath('userData'), 'cache', 'gpu'),
    path.join(app.getPath('userData'), 'cache', 'code-cache'),
  ];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};
ensureCacheDirs();

app.whenReady().then(() => {
  // Auto-grant microphone & media permissions so the floating UI
  // can start recording without showing a blocking permission dialog.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

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

  // Warm up transcriber model for faster first transcription
  try {
    const dicTranscriber = getTranscriberInstance();
    if (dicTranscriber) {
      const savedModel = database.getSetting('model') || '';
      dicTranscriber.warmup(savedModel);
    }
  } catch {}

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
