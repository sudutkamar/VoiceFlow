import { clipboard, BrowserWindow, app } from 'electron';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger';

/**
 * PowerShell script for Ctrl+V keystroke. Cached to disk once so
 * PowerShell can compile + cache the C# Add-Type definition.
 */
const CACHED_SCRIPT_PATH = path.join(app.getPath('userData'), 'temp', 'paste-keystroke.ps1');
const FAST_SCRIPT_PATH = path.join(app.getPath('userData'), 'temp', 'paste-keystroke-fast.ps1');

/** Write the PowerShell scripts to disk once. */
function ensurePasteScript(): void {
  // Full script (for long text)
  if (!fs.existsSync(CACHED_SCRIPT_PATH)) {
    const dir = path.dirname(CACHED_SCRIPT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHED_SCRIPT_PATH, [
      'param([IntPtr]$hwnd, [uint32]$targetTid)',
      '',
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class NI {',
      '  [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);',
      '  [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h, int nCmdShow);',
      '  [DllImport("user32.dll")]public static extern bool IsWindow(IntPtr h);',
      '  [DllImport("user32.dll")]public static extern void keybd_event(byte b,byte s,uint f,UIntPtr e);',
      '  [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();',
      '  [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
      '  [DllImport("user32.dll")]public static extern bool AttachThreadInput(uint a, uint b, bool c);',
      '  [DllImport("user32.dll")]public static extern uint GetCurrentThreadId();',
      '  [DllImport("user32.dll")]public static extern bool BringWindowToTop(IntPtr h);',
      '  [DllImport("user32.dll")]public static extern bool FlashWindow(IntPtr h, bool invert);',
      '}',
      '"@',
      'if($hwnd.ToInt64()-ne 0 -and [NI]::IsWindow($hwnd)){',
      '  [NI]::ShowWindow($hwnd, 9)|Out-Null; Start-Sleep -m 30',
      '  $fg = [NI]::GetForegroundWindow(); $ourTid = [NI]::GetCurrentThreadId()',
      '  if($targetTid -eq 0){ [uint32]$dummy=0; $targetTid = [NI]::GetWindowThreadProcessId($hwnd, [ref]$dummy) }',
      '  $attached = $false',
      '  if($targetTid -ne $ourTid -and $targetTid -ne 0){ $attached = [NI]::AttachThreadInput($ourTid, $targetTid, $true); Start-Sleep -m 20 }',
      '  [NI]::BringWindowToTop($hwnd)|Out-Null; [NI]::SetForegroundWindow($hwnd)|Out-Null; Start-Sleep -m 50',
      '  $fg = [NI]::GetForegroundWindow()',
      '  if($fg -ne $hwnd){ [NI]::SetForegroundWindow($hwnd)|Out-Null; Start-Sleep -m 50 }',
      '  if($attached){ [NI]::AttachThreadInput($ourTid, $targetTid, $false)|Out-Null }',
      '  Start-Sleep -m 30',
      '}',
      '[NI]::keybd_event(0x11,0,0,[UIntPtr]::Zero); Start-Sleep -m 10',
      '[NI]::keybd_event(0x56,0,0,[UIntPtr]::Zero); Start-Sleep -m 10',
      '[NI]::keybd_event(0x56,0,2,[UIntPtr]::Zero); Start-Sleep -m 10',
      '[NI]::keybd_event(0x11,0,2,[UIntPtr]::Zero)',
    ].join('\n'), 'utf-8');
  }

  // Fast script (for short text — reduced delays)
  if (!fs.existsSync(FAST_SCRIPT_PATH)) {
    const dir = path.dirname(FAST_SCRIPT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FAST_SCRIPT_PATH, [
      'param([IntPtr]$hwnd, [uint32]$targetTid)',
      '',
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class NI2 {',
      '  [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);',
      '  [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h, int nCmdShow);',
      '  [DllImport("user32.dll")]public static extern bool IsWindow(IntPtr h);',
      '  [DllImport("user32.dll")]public static extern void keybd_event(byte b,byte s,uint f,UIntPtr e);',
      '  [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();',
      '  [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
      '  [DllImport("user32.dll")]public static extern bool AttachThreadInput(uint a, uint b, bool c);',
      '  [DllImport("user32.dll")]public static extern uint GetCurrentThreadId();',
      '  [DllImport("user32.dll")]public static extern bool BringWindowToTop(IntPtr h);',
      '}',
      '"@',
      'if($hwnd.ToInt64()-ne 0 -and [NI2]::IsWindow($hwnd)){',
      '  [NI2]::ShowWindow($hwnd, 9)|Out-Null; Start-Sleep -m 15',
      '  $ourTid = [NI2]::GetCurrentThreadId()',
      '  if($targetTid -eq 0){ [uint32]$dummy=0; $targetTid = [NI2]::GetWindowThreadProcessId($hwnd, [ref]$dummy) }',
      '  $attached = $false',
      '  if($targetTid -ne $ourTid -and $targetTid -ne 0){ $attached = [NI2]::AttachThreadInput($ourTid, $targetTid, $true); Start-Sleep -m 10 }',
      '  [NI2]::BringWindowToTop($hwnd)|Out-Null; [NI2]::SetForegroundWindow($hwnd)|Out-Null; Start-Sleep -m 25',
      '  if($attached){ [NI2]::AttachThreadInput($ourTid, $targetTid, $false)|Out-Null }',
      '  Start-Sleep -m 15',
      '}',
      '[NI2]::keybd_event(0x11,0,0,[UIntPtr]::Zero); Start-Sleep -m 5',
      '[NI2]::keybd_event(0x56,0,0,[UIntPtr]::Zero); Start-Sleep -m 5',
      '[NI2]::keybd_event(0x56,0,2,[UIntPtr]::Zero); Start-Sleep -m 5',
      '[NI2]::keybd_event(0x11,0,2,[UIntPtr]::Zero)',
    ].join('\n'), 'utf-8');
  }
}

export class PasteEngine {
  private logger: Logger;
  private mainWindow: BrowserWindow;
  private hideAllForPaste: (() => void) | null;
  private showAfterPaste: (() => void) | null;

  constructor(
    mainWindow: BrowserWindow,
    logger: Logger,
    hideAllForPaste?: () => void,
    showAfterPaste?: () => void
  ) {
    this.mainWindow = mainWindow;
    this.logger = logger;
    this.hideAllForPaste = hideAllForPaste || null;
    this.showAfterPaste = showAfterPaste || null;
    // Ensure cached script exists on startup
    ensurePasteScript();
  }

  /**
   * Adaptive paste engine — speed depends on text length.
   * 
   * Short text (<100 chars): ~300ms total
   * Medium text (100-500 chars): ~500ms total  
   * Long text (>500 chars): ~800ms total
   */
  async paste(text: string, targetWindowHandle?: string | null, targetWindowThread?: number): Promise<{ success: boolean; error?: string }> {
    if (!text?.trim()) return { success: false, error: 'No text' };

    const pasteStartTime = Date.now();
    const savedClipboard = clipboard.readText();
    let pasteCompleted = false;

    // Adaptive timing based on text length
    const textLen = text.length;
    const isShortText = textLen < 100;
    const isLongText = textLen > 500;
    
    // Short text: faster delays; Long text: slightly longer for reliability
    const windowHideDelay = isShortText ? 80 : isLongText ? 150 : 120;
    const maxRetries = isShortText ? 0 : 1; // No retries for short text (faster)

    try {
      // Set clipboard FIRST
      clipboard.writeText(text);
      this.logger.debug('Paste: clipboard set', { length: textLen, ms: Date.now() - pasteStartTime });

      // Hide windows to expose target app
      if (this.hideAllForPaste) {
        this.hideAllForPaste();
      } else {
        if (!this.mainWindow.isDestroyed() && this.mainWindow.isVisible()) {
          this.mainWindow.hide();
        }
      }

      // Wait for windows to hide + target app to gain focus
      await this.sleep(windowHideDelay);

      // Skip window validation for short text (faster)
      if (!isShortText && targetWindowHandle && targetWindowHandle !== '0') {
        this.validateWindowHandle(targetWindowHandle).catch(() => {});
      }

      // Attempt paste with retry logic
      let ok = false;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        ok = await this.sendPasteKeystroke(targetWindowHandle || null, targetWindowThread || 0, isShortText);
        if (ok) break;
        if (attempt < maxRetries) {
          await this.sleep(50);
        }
      }

      this.logger.info('Paste completed', { 
        success: ok, 
        textLength: textLen,
        category: isShortText ? 'short' : isLongText ? 'long' : 'medium',
        ms: Date.now() - pasteStartTime 
      });
      pasteCompleted = true;

      // Show VoiceFlow windows again
      if (this.showAfterPaste) {
        setTimeout(() => this.showAfterPaste!(), 50); // Faster show
      }

      return { success: ok };
    } catch (err: any) {
      this.logger.error('Paste error', err);
      if (this.showAfterPaste) { this.showAfterPaste(); }
      return { success: false, error: err.message };
    } finally {
      // Always restore clipboard
      if (pasteCompleted) {
        setTimeout(() => {
          try { clipboard.writeText(savedClipboard || ''); } catch {}
        }, 200);
      } else {
        try { clipboard.writeText(savedClipboard || ''); } catch {}
      }
    }
  }

  /**
   * Validate that a window handle is still valid (window still exists).
   * Uses PowerShell to check IsWindow().
   */
  private async validateWindowHandle(hwnd: string): Promise<boolean> {
    if (!hwnd || hwnd === '0') return false;
    
    return new Promise((resolve) => {
      const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCheck {
  [DllImport(\"user32.dll\")]public static extern bool IsWindow(IntPtr h);
}
"@
$hwnd = [IntPtr]::new(${hwnd})
Write-Output ([WinCheck]::IsWindow($hwnd))
`;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 1000,
      }, (err, stdout) => {
        if (err) { resolve(false); return; }
        const result = (stdout || '').trim().toLowerCase();
        resolve(result === 'true');
      });
    });
  }

  private async sendPasteKeystroke(targetWindowHandle: string | null, targetWindowThread: number, isShortText: boolean): Promise<boolean> {
    const hwndLiteral = targetWindowHandle && /^\d+$/.test(targetWindowHandle) ? targetWindowHandle : '0';
    const tid = targetWindowThread || 0;

    ensurePasteScript();

    // Use fast script for short text
    const scriptPath = isShortText ? FAST_SCRIPT_PATH : CACHED_SCRIPT_PATH;

    return new Promise((resolve) => {
      // Adaptive timeout: short text = faster timeout
      const timeout = isShortText ? 2500 : 5000;
      
      execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive',
        '-File', scriptPath,
        hwndLiteral, String(tid),
      ], {
        timeout,
        windowsHide: true,
      }, (err, stdout, stderr) => {
        if (err) {
          this.logger.error('Paste keystroke error', { error: err.message, stderr });
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  async copy(text: string): Promise<{ success: boolean; error?: string }> {
    if (!text?.trim()) return { success: false, error: 'No text' };
    try {
      clipboard.writeText(text);
      this.logger.info('Copied to clipboard', { length: text.length });
      return { success: true };
    } catch (err: any) {
      this.logger.error('Copy error', err);
      return { success: false, error: err.message };
    }
  }

  getClipboardText(): string {
    try { return clipboard.readText(); } catch { return ''; }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
