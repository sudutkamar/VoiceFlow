import { globalShortcut, BrowserWindow, clipboard } from 'electron';
import { execFileSync, execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { Logger } from './logger';
import { VoiceFlowDatabase as Database } from './database';

// uiohook-napi for push-to-talk (global key down/up detection)
let uIOhook: any = null;
try {
  const uiohookModule = require('uiohook-napi');
  uIOhook = uiohookModule.uIOhook;
} catch (err) {
  // Will fallback to toggle mode if uiohook not available
}

// Valid key names for Electron accelerators
const VALID_KEYS = new Set([
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  '0','1','2','3','4','5','6','7','8','9',
  'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  'F13','F14','F15','F16','F17','F18','F19','F20','F21','F22','F23','F24',
  'Space','Tab','Backspace','Delete','Insert','Enter','Return',
  'Up','Down','Left','Right','Home','End','PageUp','PageDown',
  'Escape','CapsLock','NumLock','ScrollLock',
  'Plus','-', '=', '[', ']', '\\', ';', '\'', ',', '.', '/', '`',
  'num0','num1','num2','num3','num4','num5','num6','num7','num8','num9',
  'numadd','numsub','nummult','numdiv','numdec',
  'MediaNextTrack','MediaPreviousTrack','MediaStop','MediaPlayPause',
  'VolumeUp','VolumeDown','VolumeMute',
]);

const VALID_MODIFIERS = new Set(['CommandOrControl', 'Ctrl', 'Alt', 'Shift', 'Super', 'Meta', 'Cmd']);

// Map Electron accelerator key names to uiohook keycodes
const KEY_TO_UIOHOOK: Record<string, number> = {
  'A': 0x1E, 'B': 0x30, 'C': 0x2E, 'D': 0x20, 'E': 0x12, 'F': 0x21,
  'G': 0x22, 'H': 0x23, 'I': 0x17, 'J': 0x24, 'K': 0x25, 'L': 0x26,
  'M': 0x32, 'N': 0x31, 'O': 0x18, 'P': 0x19, 'Q': 0x10, 'R': 0x13,
  'S': 0x1F, 'T': 0x14, 'U': 0x16, 'V': 0x2F, 'W': 0x11, 'X': 0x2D,
  'Y': 0x15, 'Z': 0x2C,
  '0': 0x0B, '1': 0x02, '2': 0x03, '3': 0x04, '4': 0x05, '5': 0x06,
  '6': 0x07, '7': 0x08, '8': 0x09, '9': 0x0A,
  'F1': 0x3B, 'F2': 0x3C, 'F3': 0x3D, 'F4': 0x3E, 'F5': 0x3F, 'F6': 0x40,
  'F7': 0x41, 'F8': 0x42, 'F9': 0x43, 'F10': 0x44, 'F11': 0x57, 'F12': 0x58,
  'Space': 0x39, 'Tab': 0x0F, 'Backspace': 0x0E, 'Delete': 0x53,
  'Enter': 0x1C, 'Return': 0x1C,
  'Escape': 0x01,
  'Up': 0x48, 'Down': 0x50, 'Left': 0x4B, 'Right': 0x4D,
  'Home': 0x47, 'End': 0x4F, 'PageUp': 0x49, 'PageDown': 0x51,
  'Insert': 0x52,
  'Plus': 0x0D, '-': 0x0C, '=': 0x0D, '[': 0x1A, ']': 0x1B,
  '\\': 0x2B, ';': 0x27, '\'': 0x28, ',': 0x33, '.': 0x34, '/': 0x35, '`': 0x29,
};

// Modifier keycodes for uiohook — includes BOTH left and right variants
const MODIFIER_UIOHOOK: Record<string, number[]> = {
  'Shift': [0x2A, 0x36],       // Left Shift, Right Shift
  'Ctrl': [0x1D, 0xE0],        // Left Ctrl, Right Ctrl
  'Alt': [0x38, 0xE1],         // Left Alt, Right Alt
};

function formatHotkeyForDisplay(hotkey: string): string {
  return hotkey.replace('CommandOrControl', 'Ctrl').split('+').map(k => k.trim()).join('+');
}

function isValidHotkey(hotkey: string): boolean {
  if (!hotkey) return false;
  const parts = hotkey.split('+');
  if (parts.length < 2) return false;
  const lastKey = parts[parts.length - 1].trim();
  if (VALID_MODIFIERS.has(lastKey)) return false;
  for (let i = 0; i < parts.length - 1; i++) {
    const mod = parts[i].trim();
    if (!VALID_MODIFIERS.has(mod)) return false;
  }
  return true;
}

function parseHotkey(hotkey: string): { modifiers: string[]; key: string } {
  const parts = hotkey.split('+').map(p => p.trim());
  const modifiers: string[] = [];
  let key = '';
  for (const part of parts) {
    if (VALID_MODIFIERS.has(part)) {
      if (part === 'CommandOrControl' || part === 'Cmd' || part === 'Super' || part === 'Meta') {
        modifiers.push('Ctrl');
      } else {
        modifiers.push(part);
      }
    } else {
      key = part;
    }
  }
  return { modifiers, key };
}

/**
 * Get uiohook keycodes needed for a hotkey combination.
 * Returns all possible keycodes for modifiers (left + right variants).
 */
function getHotkeyKeycodes(hotkey: string): { modifiers: number[]; keyCode: number } | null {
  const { modifiers, key } = parseHotkey(hotkey);
  const keyCode = KEY_TO_UIOHOOK[key];
  if (keyCode === undefined) return null;

  // Collect ALL modifier keycodes (left + right variants)
  const modifierCodes: number[] = [];
  for (const mod of modifiers) {
    const codes = MODIFIER_UIOHOOK[mod];
    if (!codes) return null;
    modifierCodes.push(...codes);
  }

  return { modifiers: modifierCodes, keyCode };
}

/**
 * Hotkey Manager — Global keyboard shortcut handling.
 * 
 * Supports two modes:
 * - Toggle mode: Press hotkey to start, press again to stop
 * - Push-to-talk: Hold hotkey to record, release to stop
 * 
 * Uses uiohook-napi for global key detection (push-to-talk)
 * and Electron's globalShortcut for toggle mode.
 * 
 * @example
 * ```typescript
 * const manager = new HotkeyManager(mainWindow, database, logger, showMini, hideMini);
 * manager.register();
 * // ... later
 * manager.unregister();
 * ```
 */
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
  private targetWindowThread: number = 0;
  private targetAppName: string = '';
  private pushToTalk: boolean = false;

  // Escape cancel state
  private escapeRegistered: boolean = false;
  private escapeHandler: ((event: any) => void) | null = null;

  // Push-to-talk state tracking
  private pttActive: boolean = false;
  private pttKeyDown: Set<number> = new Set();
  private pttMainKeyHeld: boolean = false;
  private pttKeyDownHandler: ((event: any) => void) | null = null;
  private pttKeyUpHandler: ((event: any) => void) | null = null;

  // Shared uIOhook lifecycle
  private uiohookStarted: boolean = false;
  private uiohookListenerCount: number = 0; // Track active listener pairs

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
    this.pushToTalk = database.getSetting('push_to_talk') === 'true';
  }

  setMiniWindow(miniWindow: BrowserWindow | null): void {
    this.miniWindow = miniWindow;
  }

  sendToAll(channel: string, ...args: any[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
    if (this.miniWindow && !this.miniWindow.isDestroyed()) {
      this.miniWindow.webContents.send(channel, ...args);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  //  Shared uIOhook lifecycle — start once, stop when no listeners left
  // ──────────────────────────────────────────────────────────────────

  private ensureUiohookStarted(): boolean {
    if (!uIOhook) return false;
    if (!this.uiohookStarted) {
      try {
        uIOhook.start();
        this.uiohookStarted = true;
        this.logger.info('uIOhook started');
      } catch (err: any) {
        // If already running (e.g. from a previous session), just mark as started
        if (err?.message?.includes('already') || err?.code === 'ERR_SOCKET_DGRAM_SOCKET_ALREADYBOUND') {
          this.uiohookStarted = true;
          this.logger.info('uIOhook already running');
        } else {
          this.logger.error('Failed to start uIOhook', err);
          return false;
        }
      }
    }
    this.uiohookListenerCount++;
    return true;
  }

  private maybeStopUiohook(): void {
    this.uiohookListenerCount = Math.max(0, this.uiohookListenerCount - 1);
    // Only stop when no listeners remain AND not needed for PTT
    if (this.uiohookListenerCount <= 0 && !this.pushToTalk && uIOhook && this.uiohookStarted) {
      try {
        uIOhook.stop();
        this.uiohookStarted = false;
        this.uiohookListenerCount = 0;
        this.logger.info('uIOhook stopped (no listeners)');
      } catch (err) {
        this.logger.warn('Error stopping uIOhook', err);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  //  Registration (toggle mode vs push-to-talk)
  // ──────────────────────────────────────────────────────────────────

  register(): boolean {
    const defaultHotkey = 'CommandOrControl+Shift+F9';
    const configuredHotkey = isValidHotkey(this.hotkey) ? this.hotkey : defaultHotkey;

    // Push-to-talk mode: use uiohook for key detection
    if (this.pushToTalk) {
      this.registerPushToTalk(configuredHotkey);
      this.hotkey = configuredHotkey;
      if (this.database.getSetting('hotkey') !== configuredHotkey) {
        this.database.updateSetting('hotkey', configuredHotkey);
      }
      this.sendToAll('hotkey-registered', configuredHotkey);
      return true;
    }

    // Toggle mode: use globalShortcut
    try {
      const success = globalShortcut.register(configuredHotkey, () => this.onHotkeyPressed());
      if (success) {
        this.hotkey = configuredHotkey;
        if (this.database.getSetting('hotkey') !== configuredHotkey) {
          this.database.updateSetting('hotkey', configuredHotkey);
        }
        this.logger.info(`Hotkey registered: ${configuredHotkey}`);
        this.sendToAll('hotkey-registered', configuredHotkey);
        return true;
      }
    } catch (error) {
      this.logger.error(`Hotkey ${configuredHotkey} registration error`, error);
    }

    // Fallbacks
    const fallbacks = ['CommandOrControl+Shift+F9', 'CommandOrControl+Shift+F10', 'CommandOrControl+Shift+F11', 'CommandOrControl+Alt+Space'];
    for (const hotkey of fallbacks) {
      if (hotkey === configuredHotkey) continue;
      try {
        if (globalShortcut.register(hotkey, () => this.onHotkeyPressed())) {
          this.hotkey = hotkey;
          this.logger.info(`Fallback hotkey registered: ${hotkey}`);
          this.sendToAll('hotkey-registered', hotkey);
          return true;
        }
      } catch {}
    }

    this.logger.warn('All hotkeys failed - use UI button to record');
    this.sendToAll('hotkey-error', { message: 'Tidak bisa mendaftarkan hotkey. Gunakan tombol mic di aplikasi.' });
    return false;
  }

  unregister(): void {
    this.unregisterPushToTalk();
    try { globalShortcut.unregister(this.hotkey); } catch {}
    this.logger.info('Hotkey unregistered');
  }

  // ──────────────────────────────────────────────────────────────────
  //  Push-to-talk via uIOhook
  // ──────────────────────────────────────────────────────────────────

  private registerPushToTalk(hotkey: string): void {
    if (!uIOhook) {
      this.logger.warn('uiohook-napi not available — falling back to toggle mode');
      return;
    }

    const keycodes = getHotkeyKeycodes(hotkey);
    if (!keycodes) {
      this.logger.warn(`Cannot parse hotkey for push-to-talk: ${hotkey}`);
      return;
    }

    // CRITICAL: Remove old handlers first to prevent listener accumulation
    // This fixes the memory leak when hotkey is updated multiple times
    if (this.pttKeyDownHandler) {
      try { uIOhook.removeListener('keydown', this.pttKeyDownHandler); } catch {}
      this.pttKeyDownHandler = null;
    }
    if (this.pttKeyUpHandler) {
      try { uIOhook.removeListener('keyup', this.pttKeyUpHandler); } catch {}
      this.pttKeyUpHandler = null;
    }

    // Required modifier set: unique logical modifiers (deduplicated from left+right pairs)
    const { modifiers: logicalMods } = parseHotkey(hotkey);
    const requiredModifierCodes = new Set<number>();
    for (const mod of logicalMods) {
      const codes = MODIFIER_UIOHOOK[mod];
      if (codes) codes.forEach(c => requiredModifierCodes.add(c));
    }

    this.logger.info(`Push-to-talk registered for: ${formatHotkeyForDisplay(hotkey)}`, {
      allModifierKeycodes: [...requiredModifierCodes],
      mainKeyCode: keycodes.keyCode,
    });

    this.pttKeyDown.clear();
    this.pttMainKeyHeld = false;

    // Create handlers (stored so we can remove them later)
    this.pttKeyDownHandler = (event: any) => {
      const code = event.keycode || event.keyCode;
      if (code === undefined) return;

      if (code === keycodes.keyCode) this.pttMainKeyHeld = true;
      if (requiredModifierCodes.has(code)) this.pttKeyDown.add(code);

      // Check if ANY left/right variant of each logical modifier is held
      const anyModifierHeld = this.isAnyModifierHeld(logicalMods);

      if (anyModifierHeld && this.pttMainKeyHeld && !this.pttActive) {
        this.pttActive = true;
        this.logger.info('Push-to-talk: key down → start recording');
        this.startRecordingFlow();
      }
    };

    this.pttKeyUpHandler = (event: any) => {
      const code = event.keycode || event.keyCode;
      if (code === undefined) return;

      if (requiredModifierCodes.has(code)) this.pttKeyDown.delete(code);
      if (code === keycodes.keyCode) this.pttMainKeyHeld = false;

      if (this.pttActive) {
        const anyModifierHeld = this.isAnyModifierHeld(logicalMods);
        if (!anyModifierHeld || !this.pttMainKeyHeld) {
          this.pttActive = false;
          this.logger.info('Push-to-talk: key up → stop recording');
          this.stopRecordingFlow();
        }
      }
    };

    uIOhook.on('keydown', this.pttKeyDownHandler);
    uIOhook.on('keyup', this.pttKeyUpHandler);
    this.ensureUiohookStarted();
  }

  /**
   * Check if at least one variant (left or right) of each logical modifier is held.
   */
  private isAnyModifierHeld(logicalMods: string[]): boolean {
    for (const mod of logicalMods) {
      const codes = MODIFIER_UIOHOOK[mod];
      if (!codes) return false;
      const held = codes.some(c => this.pttKeyDown.has(c));
      if (!held) return false;
    }
    return true;
  }

  private unregisterPushToTalk(): void {
    if (uIOhook) {
      if (this.pttKeyDownHandler) {
        try { uIOhook.removeListener('keydown', this.pttKeyDownHandler); } catch {}
        this.pttKeyDownHandler = null;
      }
      if (this.pttKeyUpHandler) {
        try { uIOhook.removeListener('keyup', this.pttKeyUpHandler); } catch {}
        this.pttKeyUpHandler = null;
      }
    }
    this.pttKeyDown.clear();
    this.pttMainKeyHeld = false;
    this.pttActive = false;
    this.maybeStopUiohook();
  }

  // ──────────────────────────────────────────────────────────────────
  //  Escape cancel via uIOhook (non-blocking — does NOT consume key)
  // ──────────────────────────────────────────────────────────────────

  private registerEscapeGlobal(): void {
    if (this.escapeRegistered) return;
    if (!uIOhook) {
      this.logger.warn('uIOhook not available — Escape cancel disabled');
      return;
    }

    this.escapeHandler = (event: any) => {
      const code = event.keycode || event.keyCode;
      if (code === 0x01) { // Escape keycode
        this.logger.info('Escape pressed (uIOhook) — canceling recording');
        this.sendToAll('cancel-recording');
      }
    };

    uIOhook.on('keydown', this.escapeHandler);
    this.ensureUiohookStarted();
    this.escapeRegistered = true;
    this.logger.info('Escape cancel registered (non-blocking)');
  }

  private unregisterEscapeGlobal(): void {
    if (!this.escapeRegistered) return;
    if (uIOhook && this.escapeHandler) {
      try { uIOhook.removeListener('keydown', this.escapeHandler); } catch {}
      this.escapeHandler = null;
    }
    this.escapeRegistered = false;
    this.maybeStopUiohook();
    this.logger.info('Escape cancel unregistered');
  }

  // ──────────────────────────────────────────────────────────────────
  //  Hotkey update
  // ──────────────────────────────────────────────────────────────────

  updateHotkey(newHotkey: string): { success: boolean; error?: string } {
    if (!isValidHotkey(newHotkey)) {
      return { success: false, error: `Format hotkey tidak valid: ${newHotkey}` };
    }

    this.unregister();
    const oldHotkey = this.hotkey;
    this.hotkey = newHotkey;

    try {
      if (this.pushToTalk) {
        this.registerPushToTalk(newHotkey);
        this.database.updateSetting('hotkey', newHotkey);
        this.sendToAll('hotkey-registered', newHotkey);
        return { success: true };
      }

      const success = globalShortcut.register(newHotkey, () => this.onHotkeyPressed());
      if (success) {
        this.database.updateSetting('hotkey', newHotkey);
        this.logger.info(`Hotkey updated: ${newHotkey}`);
        this.sendToAll('hotkey-registered', newHotkey);
        return { success: true };
      }

      this.hotkey = oldHotkey;
      this.register();
      return { success: false, error: `Gagal mendaftarkan ${formatHotkeyForDisplay(newHotkey)}. Mungkin sudah dipakai aplikasi lain.` };
    } catch (error) {
      this.logger.error(`Hotkey registration error: ${newHotkey}`, error);
      this.hotkey = oldHotkey;
      this.register();
      return { success: false, error: `Error mendaftarkan hotkey: ${String(error)}` };
    }
  }

  // ──────────────────────────────────────────────────────────────────
  //  State management
  // ──────────────────────────────────────────────────────────────────

  getState(): AppState { return this.state; }

  setState(state: AppState): void {
    this.state = state;
    this.sendToAll('state-change', state);

    if (state === 'recording') {
      this.recordingStartTime = Date.now();
      this.wordCount = 0;
      this.startWpmTracking();
      this.registerEscapeGlobal();
    } else if (state === 'idle' || state === 'error') {
      this.stopWpmTracking();
      this.unregisterEscapeGlobal();
    } else if (state === 'converting' || state === 'transcribing' || state === 'cleaning' || state === 'pasting') {
      this.unregisterEscapeGlobal();
    }
  }

  private startWpmTracking(): void {
    this.wpmInterval = setInterval(() => {
      const elapsedMinutes = (Date.now() - this.recordingStartTime) / 60000;
      if (elapsedMinutes > 0) {
        this.sendToAll('wpm-update', Math.round(this.wordCount / elapsedMinutes));
      }
    }, 1000);
  }

  private stopWpmTracking(): void {
    if (this.wpmInterval) { clearInterval(this.wpmInterval); this.wpmInterval = null; }
  }

  updateWordCount(text: string): void {
    this.wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  }

  getTargetWindowHandle(): string | null { return this.targetWindowHandle; }
  getTargetWindowThread(): number { return this.targetWindowThread; }
  getTargetAppName(): string { return this.targetAppName; }
  isPushToTalk(): boolean { return this.pushToTalk; }

  updatePushToTalk(enabled: boolean): void {
    const wasEnabled = this.pushToTalk;
    this.pushToTalk = enabled;
    this.logger.info('Push-to-talk mode', { enabled });
    if (wasEnabled !== enabled) {
      // CRITICAL: Fully unregister before re-registering to prevent listener accumulation
      // This ensures old handlers are removed before new ones are added
      this.unregister();
      this.register();
    }
  }

  private captureTargetWindowHandle(): Promise<void> {
    return new Promise((resolve) => {
      const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeWin {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$hwnd = [NativeWin]::GetForegroundWindow()
$len = [NativeWin]::GetWindowTextLength($hwnd)
$sb = New-Object System.Text.StringBuilder($len + 1)
[NativeWin]::GetWindowText($hwnd, $sb, $sb.Capacity) | Out-Null
[uint32]$targetPid = 0
$tid = [NativeWin]::GetWindowThreadProcessId($hwnd, [ref]$targetPid)
$procName = ''
try { $procName = (Get-Process -Id $targetPid).ProcessName } catch {}
Write-Output "$($hwnd.ToInt64())|$($tid)|$($sb.ToString())|$procName"
`;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8', windowsHide: true, timeout: 800,
      }, (error, stdout) => {
        try {
          if (error) { this.targetWindowHandle = null; this.targetWindowThread = 0; this.targetAppName = ''; resolve(); return; }
          const out = (stdout || '').trim();
          const parts = out.split('|');
          const hwnd = parts[0] || '';
          const tid = parseInt(parts[1] || '0', 10) || 0;
          this.targetWindowHandle = /^\d+$/.test(hwnd) && hwnd !== '0' ? hwnd : null;
          this.targetWindowThread = tid;
          this.targetAppName = ((parts[2] || '') || (parts[3] || '')).trim();
          this.sendToAll('target-app-changed', this.targetAppName);
        } catch {}
        resolve();
      });
    });
  }

  simulateHotkey(): void { this.onHotkeyPressed(); }

  // ──────────────────────────────────────────────────────────────────
  //  Recording flow (shared by toggle and push-to-talk)
  // ──────────────────────────────────────────────────────────────────

  private async startRecordingFlow(): Promise<void> {
    if (this.state !== 'idle') {
      this.logger.info('Ignoring start — not idle', { state: this.state });
      return;
    }
    this.logger.info('Starting recording flow...');
    await this.captureTargetWindowHandle();
    const showMini = this.database.getSetting('show_mini_window') !== 'false';
    if (showMini) this.showMini();
    this.setState('recording');

    const send = () => {
      if (showMini && this.miniWindow && !this.miniWindow.isDestroyed()) {
        this.miniWindow.webContents.send('start-recording-request');
      } else if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('start-recording-request');
      }
    };
    setTimeout(send, showMini && this.miniWindow?.webContents.isLoading() ? 500 : 150);
  }

  private stopRecordingFlow(): void {
    if (this.state !== 'recording') {
      this.logger.info('Ignoring stop — not recording', { state: this.state });
      return;
    }
    this.logger.info('Stopping recording flow...');
    const showMini = this.database.getSetting('show_mini_window') !== 'false';
    const elapsed = Date.now() - this.recordingStartTime;
    if (showMini && this.miniWindow && !this.miniWindow.isDestroyed()) {
      this.miniWindow.webContents.send('stop-recording-request', elapsed);
    } else if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('stop-recording-request', elapsed);
    }
    this.setState('converting');
  }

  private onHotkeyPressed(): void {
    this.logger.info(`Hotkey pressed, state: ${this.state}`);
    if (this.state === 'transcribing' || this.state === 'converting' ||
        this.state === 'cleaning' || this.state === 'pasting') return;

    if (this.state === 'idle') this.startRecordingFlow();
    else if (this.state === 'recording') this.stopRecordingFlow();
  }

  isRegistered(): boolean { return globalShortcut.isRegistered(this.hotkey); }
  getHotkey(): string { return this.hotkey; }
}
