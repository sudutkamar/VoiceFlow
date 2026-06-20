import { globalShortcut, BrowserWindow, clipboard } from 'electron';
import { execFileSync } from 'child_process';
import { Logger } from './logger';
import { VoiceFlowDatabase as Database } from './database';

// Valid key names for Electron accelerators
const VALID_KEYS = new Set([
  // Letters
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  // Numbers
  '0','1','2','3','4','5','6','7','8','9',
  // Function keys
  'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  'F13','F14','F15','F16','F17','F18','F19','F20','F21','F22','F23','F24',
  // Special keys
  'Space','Tab','Backspace','Delete','Insert','Enter','Return',
  'Up','Down','Left','Right','Home','End','PageUp','PageDown',
  'Escape','CapsLock','NumLock','ScrollLock',
  'Plus','-', '=', '[', ']', '\\', ';', '\'', ',', '.', '/', '`',
  // Numpad
  'num0','num1','num2','num3','num4','num5','num6','num7','num8','num9',
  'numadd','numsub','nummult','numdiv','numdec',
  // Media
  'MediaNextTrack','MediaPreviousTrack','MediaStop','MediaPlayPause',
  'VolumeUp','VolumeDown','VolumeMute',
]);

const VALID_MODIFIERS = new Set(['CommandOrControl', 'Ctrl', 'Alt', 'Shift', 'Super', 'Meta', 'Cmd']);

function isValidHotkey(hotkey: string): boolean {
  if (!hotkey) return false;
  const parts = hotkey.split('+');
  if (parts.length < 2) return false;
  
  // Last part must be a valid key (not just a modifier)
  const lastKey = parts[parts.length - 1].trim();
  if (VALID_MODIFIERS.has(lastKey)) return false;
  
  // All parts must be valid modifiers or the final key
  for (let i = 0; i < parts.length - 1; i++) {
    const mod = parts[i].trim();
    if (!VALID_MODIFIERS.has(mod)) return false;
  }
  
  return true;
}

export type AppState =
  | 'idle'
  | 'recording'
  | 'converting'
  | 'transcribing'
  | 'cleaning'
  | 'pasting'
  | 'done'
  | 'error';

export class HotkeyManager {
  private mainWindow: BrowserWindow;
  private miniWindow: BrowserWindow | null = null;
  private database: Database;
  private logger: Logger;
  private state: AppState = 'idle';
  private hotkey: string;
  private showMini: () => void;
  private hideMini: () => void;
  private recordingStartTime: number = 0;
  private wpmInterval: NodeJS.Timeout | null = null;
  private wordCount: number = 0;
  private targetWindowHandle: string | null = null;

  constructor(
    mainWindow: BrowserWindow,
    database: Database,
    logger: Logger,
    showMini: () => void,
    hideMini: () => void
  ) {
    this.mainWindow = mainWindow;
    this.database = database;
    this.logger = logger;
    this.showMini = showMini;
    this.hideMini = hideMini;
    this.hotkey = database.getSetting('hotkey') || 'CommandOrControl+Shift+F9';
  }

  setMiniWindow(miniWindow: BrowserWindow | null): void {
    this.miniWindow = miniWindow;
  }

  private sendToAll(channel: string, ...args: any[]): void {
    // Send to main window
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
    // Send to mini window
    if (this.miniWindow && !this.miniWindow.isDestroyed()) {
      this.miniWindow.webContents.send(channel, ...args);
    }
  }

  register(): boolean {
    // Validate the configured hotkey
    const defaultHotkey = 'CommandOrControl+Shift+F9';
    const configuredHotkey = isValidHotkey(this.hotkey) ? this.hotkey : defaultHotkey;
    
    // Try the configured hotkey first, then fallbacks
    const hotkeysToTry = [
      configuredHotkey,
      'CommandOrControl+Shift+F9',
      'CommandOrControl+Shift+F10',
      'CommandOrControl+Shift+F11',
      'CommandOrControl+Alt+Space',
    ];

    // Remove duplicates
    const uniqueHotkeys = [...new Set(hotkeysToTry)];

    for (const hotkey of uniqueHotkeys) {
      try {
        const success = globalShortcut.register(hotkey, () => {
          this.onHotkeyPressed();
        });

        if (success) {
          this.hotkey = hotkey;
          this.database.updateSetting('hotkey', hotkey);
          this.logger.info(`Hotkey registered: ${hotkey}`);
          this.sendToAll('hotkey-registered', hotkey);
          return true;
        }
      } catch (error) {
        this.logger.error(`Hotkey ${hotkey} registration error`, error);
      }
    }

    this.logger.warn('All hotkeys failed - use UI button to record');
    this.sendToAll('hotkey-error', {
      message: 'Tidak bisa mendaftarkan hotkey. Gunakan tombol mic di aplikasi.',
    });
    return false;
  }

  unregister(): void {
    globalShortcut.unregister(this.hotkey);
    this.logger.info('Hotkey unregistered');
  }

  updateHotkey(newHotkey: string): boolean {
    // Validate the new hotkey
    if (!isValidHotkey(newHotkey)) {
      this.logger.warn(`Invalid hotkey format: ${newHotkey}`);
      return false;
    }
    
    // Unregister old hotkey
    this.unregister();
    
    // Save old hotkey for rollback
    const oldHotkey = this.hotkey;
    
    // Update the hotkey
    this.hotkey = newHotkey;
    
    // Try to register the new hotkey
    try {
      const success = globalShortcut.register(newHotkey, () => {
        this.onHotkeyPressed();
      });
      
      if (success) {
        this.database.updateSetting('hotkey', newHotkey);
        this.logger.info(`Hotkey updated and registered: ${newHotkey}`);
        this.sendToAll('hotkey-registered', newHotkey);
        return true;
      } else {
        this.logger.warn(`Failed to register hotkey: ${newHotkey}, rolling back to ${oldHotkey}`);
        this.hotkey = oldHotkey;
        this.register();
        return false;
      }
    } catch (error) {
      this.logger.error(`Hotkey registration error: ${newHotkey}`, error);
      this.hotkey = oldHotkey;
      this.register();
      return false;
    }
  }

  getState(): AppState {
    return this.state;
  }

  setState(state: AppState): void {
    this.state = state;
    this.sendToAll('state-change', state);
    
    if (state === 'recording') {
      this.recordingStartTime = Date.now();
      this.wordCount = 0;
      this.startWpmTracking();
    } else if (state === 'idle' || state === 'error') {
      this.stopWpmTracking();
      setTimeout(() => {
        this.hideMini();
      }, 2000);
    }
  }

  private startWpmTracking(): void {
    this.wpmInterval = setInterval(() => {
      const elapsedMinutes = (Date.now() - this.recordingStartTime) / 60000;
      if (elapsedMinutes > 0) {
        const wpm = Math.round(this.wordCount / elapsedMinutes);
        this.sendToAll('wpm-update', wpm);
      }
    }, 1000);
  }

  private stopWpmTracking(): void {
    if (this.wpmInterval) {
      clearInterval(this.wpmInterval);
      this.wpmInterval = null;
    }
  }

  updateWordCount(text: string): void {
    this.wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  }

  getTargetWindowHandle(): string | null {
    return this.targetWindowHandle;
  }

  private captureTargetWindowHandle(): void {
    try {
      const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeWin {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
}
"@
[NativeWin]::GetForegroundWindow().ToInt64()
`;
      const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 1000,
      }).trim();
      this.targetWindowHandle = /^\d+$/.test(out) && out !== '0' ? out : null;
      this.logger.info('Captured target window handle', { hwnd: this.targetWindowHandle });
    } catch (error) {
      this.targetWindowHandle = null;
      this.logger.warn('Failed to capture target window handle', error);
    }
  }

  simulateHotkey(): void {
    this.onHotkeyPressed();
  }

  private onHotkeyPressed(): void {
    this.logger.info(`Hotkey pressed, current state: ${this.state}`);

    if (this.state === 'transcribing' || this.state === 'converting' || 
        this.state === 'cleaning' || this.state === 'pasting') {
      this.logger.info('Ignoring hotkey - busy processing');
      return;
    }

    if (this.state === 'idle') {
      this.logger.info('Starting recording flow...');
      this.captureTargetWindowHandle();
      this.showMini();
      this.setState('recording');

      const sendStartRecording = () => {
        if (this.miniWindow && !this.miniWindow.isDestroyed()) {
          this.logger.info('Sending single start-recording-request to mini window');
          this.miniWindow.webContents.send('start-recording-request');
        } else {
          this.logger.warn('miniWindow not available for start-recording-request');
        }
      };

      // Send once after the mini window has had time to mount React listeners.
      setTimeout(sendStartRecording, this.miniWindow?.webContents.isLoading() ? 500 : 150);
    } else if (this.state === 'recording') {
      this.logger.info('Stopping recording flow...');
      if (this.miniWindow && !this.miniWindow.isDestroyed()) {
        this.miniWindow.webContents.send('stop-recording-request', Date.now() - this.recordingStartTime);
      }
      // Do not return to idle here. Backend will set idle after transcription/paste finishes.
      this.setState('converting');
    }
  }

  isRegistered(): boolean {
    return globalShortcut.isRegistered(this.hotkey);
  }

  getHotkey(): string {
    return this.hotkey;
  }
}
