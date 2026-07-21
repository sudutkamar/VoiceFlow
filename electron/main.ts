import { app, ipcMain, globalShortcut, Tray, Menu, nativeImage, screen, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { VoiceFlowDatabase as Database } from './modules/database';
import { Logger } from './modules/logger';
import { HotkeyManager } from './modules/hotkeyManager';
import { CudaDownloader } from './modules/cudaDownloader';
import { AutoUpdater } from './modules/autoUpdater';
import { CrashReporter } from './modules/crashReporter';
import { WindowManager } from './modules/windowManager';
import { setupDictationIPC, getTranscriberInstance } from './ipc/dictation.ipc';
import { setupSettingsIPC } from './ipc/settings.ipc';
import { setupModelIPC, setTranscriberForModelSync } from './ipc/model.ipc';
import { setupSnippetIPC } from './ipc/snippet.ipc';
import { registerEngineIpc } from './ipc/engine.ipc';
import { getDefaultModelsDir, getResourcesModelsDir, getOldModelsDirs, migrateModelsTo, modelsDirHasContent, ensureDir } from './utils/modelsPath';

// ═══════════════════════════════════════════════════════════════
//  CRITICAL FIX #1: Single-Instance Lock
//  Prevents multiple Electron instances running simultaneously.
//  Without this: database corruption, hotkey conflicts, memory leaks.
// ═══════════════════════════════════════════════════════════════
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (windowManager?.mainWindow) {
      if (windowManager.mainWindow.isMinimized()) windowManager.mainWindow.restore();
      windowManager.mainWindow.focus();
    }
    if (windowManager?.miniWindow && !windowManager.miniWindow.isDestroyed()) {
      windowManager.miniWindow.showInactive();
    }
  });

  // Fix GPU cache errors on Windows - set cache directory to app's own folder
  const cacheDir = path.join(app.getPath('userData'), 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  app.setPath('cache', cacheDir);
  app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
  app.commandLine.appendSwitch('gpu-cache-dir', path.join(cacheDir, 'gpu'));

let tray: Tray | null = null;
let database: Database;
let logger: Logger;
let hotkeyManager: HotkeyManager;
let windowManager: WindowManager;
let cudaDownloader: CudaDownloader;
let autoUpdater: AutoUpdater;
let crashReporter: CrashReporter;
let isQuitting = false;

function isDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

// ============ TRAY ============
function createTrayIcon(): Electron.NativeImage {
  const iconPngPath = isDev()
    ? path.join(__dirname, '..', 'resources', 'icons', 'icon.png')
    : path.join(process.resourcesPath, 'icons', 'icon.png');

  if (fs.existsSync(iconPngPath)) {
    return nativeImage.createFromPath(iconPngPath);
  }

  const trayIconPath = isDev()
    ? path.join(__dirname, '..', 'resources', 'icons', 'tray-icon.png')
    : path.join(process.resourcesPath, 'icons', 'tray-icon.png');

  if (fs.existsSync(trayIconPath)) {
    return nativeImage.createFromPath(trayIconPath);
  }

  const appIconPath = windowManager?.getAppIcon() || '';
  if (appIconPath && fs.existsSync(appIconPath)) {
    return nativeImage.createFromPath(appIconPath);
  }

  const svgStr = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" fill="#1a1a2e" rx="4"/>
      <path d="M16 6a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V10a4 4 0 0 0-4-4z" fill="#53c0f0"/>
      <path d="M22 13v2a6 6 0 0 1-12 0v-2" stroke="#53c0f0" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <line x1="16" y1="20" x2="16" y2="24" stroke="#53c0f0" stroke-width="2.4" stroke-linecap="round"/>
      <line x1="12" y1="24" x2="20" y2="24" stroke="#53c0f0" stroke-width="2.4" stroke-linecap="round"/>
    </svg>
  `;
  const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svgStr).toString('base64');
  return nativeImage.createFromDataURL(dataUrl);
}

function createTray(): void {
  const trayIcon = createTrayIcon();
  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'VoiceFlow', enabled: false },
    { type: 'separator' },
    {
      label: 'Open VoiceFlow',
      click: () => windowManager?.showMainWindow(),
    },
    {
      label: 'Record',
      click: () => hotkeyManager?.simulateHotkey(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('VoiceFlow');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => windowManager?.showMainWindow());
}

// ============ IPC ============
function setupIPC(): void {
  if (!windowManager?.mainWindow || !database || !logger) return;

  cudaDownloader = new CudaDownloader(logger);
  cudaDownloader.checkStatus().then(status => {
    logger.info('CUDA status', status);
    if (status.needsDownload) {
      const copied = cudaDownloader.copyFromResources();
      if (copied) {
        logger.info('CUDA DLLs verified in resources');
      }
    }
  }).catch(err => logger.warn('CUDA check failed', err));

  setupDictationIPC(
    windowManager.mainWindow,
    database,
    logger,
    hotkeyManager,
    () => windowManager?.hideAllForPaste(),
    () => windowManager?.showAfterPaste()
  );

  const dicTranscriber = getTranscriberInstance();
  if (dicTranscriber) {
    setTranscriberForModelSync(dicTranscriber);
    logger.info('Transcriber synced with ModelDownloader');
  }

  setupSettingsIPC(windowManager.mainWindow, database, logger, hotkeyManager);
  setupModelIPC(windowManager.mainWindow, database, logger);
  setupSnippetIPC(windowManager.mainWindow, database, logger);

  registerEngineIpc({
    logger,
    database,
    cudaDownloader,
    transcriberRef: getTranscriberInstance,
    mainWindow: windowManager.mainWindow,
  });

  const customGpuPath = database.getSetting('custom_gpu_path');
  if (customGpuPath) {
    cudaDownloader.setCudaPath(customGpuPath);
    logger.info(`Custom GPU path loaded: ${customGpuPath}`);
  }

  ipcMain.handle('get-app-state', () => hotkeyManager?.getState());
  ipcMain.handle('get-target-app', () => hotkeyManager?.getTargetAppName());
  ipcMain.handle('get-version', () => app.getVersion());
  ipcMain.handle('quit-app', () => { isQuitting = true; app.quit(); });
  ipcMain.handle('show-main', (_, page?: string) => windowManager?.showMainWindow(page));
  ipcMain.handle('minimize-to-bar', () => {
    windowManager?.mainWindow?.hide();
    if (database?.getSetting('show_mini_window') !== 'false') windowManager?.showMiniWindow();
  });
  ipcMain.handle('minimize-window', () => {
    if (windowManager?.mainWindow && !windowManager.mainWindow.isDestroyed()) {
      windowManager.mainWindow.minimize();
    }
  });
  ipcMain.handle('maximize-window', () => {
    if (windowManager?.mainWindow && !windowManager.mainWindow.isDestroyed()) {
      if (windowManager.mainWindow.isMaximized()) {
        windowManager.mainWindow.unmaximize();
      } else {
        windowManager.mainWindow.maximize();
      }
    }
  });
  ipcMain.handle('show-mini-window', () => windowManager?.showMiniWindow());
  ipcMain.handle('hide-mini-window', () => windowManager?.hideMiniWindow());
  ipcMain.handle('resize-mini-window', (_, height: number, width?: number) => {
    if (windowManager?.miniWindow && !windowManager.miniWindow.isDestroyed()) {
      const bounds = windowManager.miniWindow.getBounds();
      const nextHeight = Math.max(28, Math.round(height));
      const nextWidth = width ? Math.round(width) : bounds.width;
      windowManager.miniWindow.setBounds({
        x: bounds.x,
        y: bounds.y + bounds.height - nextHeight,
        width: nextWidth,
        height: nextHeight,
      }, false);
    }
  });
  ipcMain.handle('set-mini-window-focusable', (_, focusable: boolean) => {
    if (windowManager?.miniWindow && !windowManager.miniWindow.isDestroyed()) {
      windowManager.miniWindow.setFocusable(focusable);
    }
  });

  ipcMain.on('mini-window-ready', () => {
    logger?.info('Mini window reported ready');
    if (hotkeyManager?.getState() === 'recording' && windowManager?.miniWindow && !windowManager.miniWindow.isDestroyed()) {
      windowManager.miniWindow.webContents.send('start-recording-request');
    }
    if (windowManager?.miniWindow && !windowManager.miniWindow.isDestroyed() && hotkeyManager) {
      windowManager.miniWindow.webContents.send('target-app-changed', hotkeyManager.getTargetAppName());
    }
  });

  ipcMain.handle('get-warmup-status', () => {
    const dicTranscriber = getTranscriberInstance();
    if (dicTranscriber && dicTranscriber.isWarmedUp()) {
      return dicTranscriber.getWarmupResult();
    }
    return { ready: false, model: '', whisperAvailable: false, gpuAvailable: false, modelSize: 0 };
  });

  ipcMain.handle('is-autostart', () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle('set-autostart', (_, enable: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enable, path: app.getPath('exe') });
    return { success: true };
  });

  ipcMain.handle('get-startup-mode', () => {
    return database?.getSetting('startup_mode') || 'full';
  });

  ipcMain.handle('set-startup-mode', (_, mode: string) => {
    database?.updateSetting('startup_mode', mode);
    logger?.info(`Startup mode set to: ${mode}`);
    return { success: true };
  });

  ipcMain.handle('get-gpu-status', async () => {
    try {
      const status = await cudaDownloader.checkStatus();
      const cpuDir = app.isPackaged
        ? path.join(process.resourcesPath, 'whisper', 'cpu')
        : path.join(__dirname, '..', 'resources', 'whisper', 'cpu');
      const whisperDir = path.join(app.getPath('userData'), 'whisper');
      const gpuDir = path.join(whisperDir, 'gpu');
      return {
        hasGpu: status.hasNvidiaGpu,
        cudaDllsPresent: status.cudaDllsPresent,
        mode: status.hasNvidiaGpu ? (status.cudaDllsPresent ? 'GPU (CUDA)' : 'GPU (needs download)') : 'CPU Only',
        whisperDir,
        cpuDir,
        gpuDir,
        cudaPath: status.cudaPath,
        needsDownload: status.needsDownload,
        downloadUrl: status.needsDownload ? cudaDownloader.getDownloadUrl() : null,
      };
    } catch {
      return { hasGpu: false, mode: 'CPU Only', whisperDir: '', cpuDir: '', gpuDir: '', cudaDllsPresent: false, needsDownload: false };
    }
  });

  ipcMain.handle('download-cuda', async () => {
    try {
      if (windowManager?.mainWindow) cudaDownloader.setMainWindow(windowManager.mainWindow);
      return await cudaDownloader.download();
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('pause-cuda-download', async () => { cudaDownloader.pause(); });
  ipcMain.handle('resume-cuda-download', async () => { cudaDownloader.resume(); });
  ipcMain.handle('cancel-cuda-download', async () => { cudaDownloader.cancel(); });
  ipcMain.handle('get-cuda-download-progress', async () => cudaDownloader.getProgress());
  ipcMain.handle('delete-whisper-engine', async (event, type: 'cpu' | 'gpu') => cudaDownloader.deleteEngineFiles(type));

  ipcMain.handle('clear-cache', async () => {
    try {
      const cacheDir = path.join(app.getPath('userData'), 'cache');
      const tempDir = path.join(app.getPath('userData'), 'temp');
      let cleared = 0;
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
      if (fs.existsSync(tempDir)) {
        try {
          const entries = fs.readdirSync(tempDir);
          for (const entry of entries) {
            try { fs.unlinkSync(path.join(tempDir, entry)); cleared++; } catch {}
          }
        } catch {}
      }
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

function cleanupTempFiles(): void {
  try {
    const tempDirs = [
      path.join(app.getPath('userData'), 'temp'),
      path.join(app.getPath('userData'), 'temp-downloads'),
    ];
    for (const dir of tempDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.includes('.tmp') || file.includes('.download') || file.startsWith('recording_')) {
          try {
            const fp = path.join(dir, file);
            try { fs.chmodSync(fp, 0o666); } catch {}
            fs.unlinkSync(fp);
          } catch {}
        }
      }
    }
  } catch {}
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* https://api.iconify.design; img-src 'self' data: https://api.iconify.design; font-src 'self' data:;"
        ]
      }
    });
  });

  logger = new Logger();
  logger.info('VoiceFlow starting...');

  crashReporter = new CrashReporter(logger);
  crashReporter.start();

  database = new Database(logger);
  database.initialize();

  const savedLogLevel = database.getSetting('log_level') as any;
  if (savedLogLevel && ['debug', 'info', 'warn', 'error'].includes(savedLogLevel)) {
    logger.setLogLevel(savedLogLevel);
  }

  const forceFirstRun = process.env.VOICEFLOW_FIRST_RUN === '1';
  const isFirstRun = forceFirstRun || !database.getSetting('has_run_before');

  // Initialize WindowManager after database is ready
  windowManager = new WindowManager(database, logger);

  const startupMode = database.getSetting('startup_mode') || 'full';
  logger.info(`[Startup] Mode: ${startupMode}`);

  const showMainInitially = startupMode === 'full';
  windowManager.createMainWindow(showMainInitially);
  createTray();

  if (windowManager.mainWindow) {
    hotkeyManager = new HotkeyManager(
      windowManager.mainWindow,
      database,
      logger,
      () => windowManager?.showMiniWindow(),
      () => windowManager?.hideMiniWindow()
    );
    hotkeyManager.register();

    if (isFirstRun) {
      database.updateSetting('has_run_before', 'true');
      windowManager.mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
          windowManager?.showMiniWindow();
        }, 800);
      });
    } else if (startupMode === 'mini') {
      windowManager.mainWindow.once('ready-to-show', () => {
        windowManager?.mainWindow?.hide();
        setTimeout(() => {
          windowManager?.showMiniWindow();
        }, 600);
      });
    } else if (startupMode === 'tray') {
      windowManager.mainWindow.once('ready-to-show', () => {
        windowManager?.mainWindow?.hide();
      });
    }
  }

  setupIPC();

  if (windowManager.mainWindow) {
    autoUpdater = new AutoUpdater(windowManager.mainWindow, logger);
    setTimeout(() => {
      autoUpdater.checkOnStartup();
    }, 5000);
  }

  // First-run: Copy bundled models to user-visible folder
  try {
    const targetDir = getDefaultModelsDir();
    const resourcesDir = getResourcesModelsDir();
    const resourcesHasModels = fs.existsSync(resourcesDir) &&
      fs.readdirSync(resourcesDir).some(f => f.endsWith('.bin'));
    const targetHasModels = modelsDirHasContent(targetDir);

    if (!targetHasModels) {
      const oldPaths = getOldModelsDirs();
      const hasOldModels = oldPaths.some(p => modelsDirHasContent(p));
      if (hasOldModels) {
        logger.info('[FirstRun] Migrating models from old paths to new location...');
        const result = migrateModelsTo(targetDir);
        if (result.migrated > 0) {
          logger.info(`[FirstRun] Migrated ${result.migrated} model(s) from ${result.from.length} old path(s)`);
        }
      }

      if (resourcesHasModels && !modelsDirHasContent(targetDir)) {
        logger.info('[FirstRun] Copying bundled models to Documents/VoiceFlow/models/...');
        ensureDir(targetDir);
        const modelFiles = fs.readdirSync(resourcesDir).filter(f => f.endsWith('.bin'));
        for (const modelFile of modelFiles) {
          const src = path.join(resourcesDir, modelFile);
          const dest = path.join(targetDir, modelFile);
          if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
            logger.info(`[FirstRun]  Copied ${modelFile} (${(fs.statSync(src).size / 1024 / 1024).toFixed(1)} MB)`);
          }
        }
        logger.info('[FirstRun] Bundled models copied to Documents/VoiceFlow/models/');
      }
    } else {
      logger.info(`[FirstRun] Models already exist at ${targetDir}, skipping copy`);
    }
  } catch (err) {
    logger.warn('[FirstRun] Failed to copy bundled models', err);
  }

  // Aggressive warmup
  const warmupStart = Date.now();
  try {
    const dicTranscriber = getTranscriberInstance();
    if (dicTranscriber) {
      const savedModel = database.getSetting('model') || '';
      const warmupResult = dicTranscriber.warmup(savedModel);
      const warmupMs = Date.now() - warmupStart;
      logger.info(`[Warmup] Completed in ${warmupMs}ms`, warmupResult);

      if (windowManager?.mainWindow && !windowManager.mainWindow.isDestroyed()) {
        windowManager.mainWindow.webContents.send('warmup-complete', warmupResult);
      }
      if (windowManager?.miniWindow && !windowManager.miniWindow.isDestroyed()) {
        windowManager.miniWindow.webContents.send('warmup-complete', warmupResult);
      }
    }
  } catch (err) {
    logger.warn('[Warmup] Failed', err);
  }

  logger.info('VoiceFlow ready');
});

app.on('window-all-closed', () => {
  if (!isQuitting) return;
  hotkeyManager?.unregister();
  database?.close();
  logger?.info('VoiceFlow closed');
});

app.on('activate', () => windowManager?.showMainWindow());

app.on('before-quit', () => {
  if (isQuitting) return;
  isQuitting = true;
  globalShortcut.unregisterAll();

  try {
    if (tray) {
      tray.destroy();
      tray = null;
    }
  } catch {}

  windowManager?.destroyWindows();
  windowManager?.setQuitting(true);

  try {
    const transcriber = getTranscriberInstance();
    if (transcriber) {
      transcriber.cancelTranscription();
    }
  } catch {}

  try {
    hotkeyManager?.forceStopUiohook();
    hotkeyManager?.clearWindowReferences();
  } catch {}

  cleanupTempFiles();
  logger?.info('VoiceFlow shutting down — cleanup complete');
});

} // end of gotTheLock else block
