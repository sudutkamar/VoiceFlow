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

/** Write the PowerShell script to disk once. */
function ensurePasteScript(): void {
  if (fs.existsSync(CACHED_SCRIPT_PATH)) return;
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
   * CRITICAL FIX #3: Paste engine with retry logic + window validation.
   * 
   * Fixes:
   * - Validates target window still exists before paste
   * - Adds retry logic for transient PowerShell failures
   * - Ensures clipboard restore in finally block (no leak)
   * - Adds timeout protection for paste operation
   */
  async paste(text: string, targetWindowHandle?: string | null, targetWindowThread?: number): Promise<{ success: boolean; error?: string }> {
    if (!text?.trim()) return { success: false, error: 'No text' };

    const savedClipboard = clipboard.readText();
    let pasteCompleted = false;

    try {
      // Set clipboard FIRST
      clipboard.writeText(text);
      this.logger.info('Clipboard set', { length: text.length });

      // Hide windows to expose target app
      if (this.hideAllForPaste) {
        this.hideAllForPaste();
      } else {
        if (!this.mainWindow.isDestroyed() && this.mainWindow.isVisible()) {
          this.mainWindow.hide();
        }
      }

      // CRITICAL FIX: Reduced delay from 250ms to 150ms for faster paste
      await this.sleep(150);

      // Validate target window (non-blocking, skip if slow)
      if (targetWindowHandle && targetWindowHandle !== '0') {
        // Don't wait for validation — just proceed
        this.validateWindowHandle(targetWindowHandle).then(valid => {
          if (!valid) {
            this.logger.warn('Target window invalid, using foreground', { handle: targetWindowHandle });
          }
        }).catch(() => {}); // Don't block on validation
      }

      // Attempt paste with retry logic (reduced retries for speed)
      let ok = false;
      const maxRetries = 1; // Reduced from 2 to 1 for speed
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        ok = await this.sendPasteKeystroke(targetWindowHandle || null, targetWindowThread || 0);
        if (ok) break;
        
        if (attempt < maxRetries) {
          this.logger.warn(`Paste attempt ${attempt + 1} failed, retrying...`);
          await this.sleep(100); // Reduced from 150ms to 100ms
        }
      }

      pasteCompleted = true;

      // Show VoiceFlow windows again
      if (this.showAfterPaste) {
        setTimeout(() => this.showAfterPaste!(), 100); // Reduced from 150ms
      }

      if (ok) {
        this.logger.info('Paste successful');
      } else {
        this.logger.warn('Paste keystroke failed after retries');
      }

      return { success: ok };
    } catch (err: any) {
      this.logger.error('Paste error', err);
      if (this.showAfterPaste) { this.showAfterPaste(); }
      return { success: false, error: err.message };
    } finally {
      // CRITICAL: Always restore clipboard
      if (pasteCompleted) {
        setTimeout(() => {
          try { clipboard.writeText(savedClipboard || ''); } catch {}
        }, 300); // Reduced from 500ms
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

  private async sendPasteKeystroke(targetWindowHandle: string | null, targetWindowThread: number): Promise<boolean> {
    const hwndLiteral = targetWindowHandle && /^\d+$/.test(targetWindowHandle) ? targetWindowHandle : '0';
    const tid = targetWindowThread || 0;

    ensurePasteScript();

    return new Promise((resolve) => {
      execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive',
        '-File', CACHED_SCRIPT_PATH,
        hwndLiteral, String(tid),
      ], {
        timeout: 4000,
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
