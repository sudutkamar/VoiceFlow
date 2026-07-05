import { clipboard, BrowserWindow, app } from 'electron';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger';

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
  }

  async paste(text: string, targetWindowHandle?: string | null, targetWindowThread?: number): Promise<{ success: boolean; error?: string }> {
    if (!text?.trim()) return { success: false, error: 'No text' };

    try {
      // 1. Save current clipboard
      const savedClipboard = clipboard.readText();

      // 2. Write text to clipboard
      clipboard.writeText(text);
      this.logger.info('Clipboard set', { length: text.length });

      // 3. Hide ALL windows (main + mini) so paste goes to target app
      if (this.hideAllForPaste) {
        this.hideAllForPaste();
      } else {
        // Fallback: hide main window only
        if (!this.mainWindow.isDestroyed() && this.mainWindow.isVisible()) {
          this.mainWindow.hide();
        }
      }

      // 4. Delay to let windows hide and target app gain focus
      await this.sleep(200);

      // 5. Send Ctrl+V to target window
      const ok = await this.sendPasteKeystroke(targetWindowHandle || null, targetWindowThread || 0);

      // 6. Re-show mini window after paste
      if (this.showAfterPaste) {
        setTimeout(() => this.showAfterPaste!(), 150);
      }

      // 7. Restore original clipboard after a delay
      setTimeout(() => {
        try { clipboard.writeText(savedClipboard || ''); } catch {}
      }, 500);

      if (ok) {
        this.logger.info('Paste successful');
      } else {
        this.logger.warn('Paste keystroke may have failed');
      }

      return { success: ok };
    } catch (err: any) {
      this.logger.error('Paste error', err);
      // Re-show mini window on error
      if (this.showAfterPaste) {
        this.showAfterPaste();
      }
      return { success: false, error: err.message };
    }
  }

  private async sendPasteKeystroke(targetWindowHandle: string | null, targetWindowThread: number): Promise<boolean> {
    const hwndLiteral = targetWindowHandle && /^\d+$/.test(targetWindowHandle) ? targetWindowHandle : '0';
    const tid = targetWindowThread || 0;

    const script = `
$hwnd=[IntPtr]${hwndLiteral}
$targetTid=${tid}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NI {
  [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h, int nCmdShow);
  [DllImport("user32.dll")]public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")]public static extern void keybd_event(byte b,byte s,uint f,UIntPtr e);
  [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")]public static extern bool AttachThreadInput(uint a, uint b, bool c);
  [DllImport("user32.dll")]public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")]public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")]public static extern bool FlashWindow(IntPtr h, bool invert);
}
"@
if($hwnd.ToInt64()-ne 0 -and [NI]::IsWindow($hwnd)){
  # Restore if minimized
  [NI]::ShowWindow($hwnd, 9)|Out-Null
  Start-Sleep -m 30

  # Get current foreground and our thread
  $fg = [NI]::GetForegroundWindow()
  $ourTid = [NI]::GetCurrentThreadId()

  # Get target window's thread
  if($targetTid -eq 0){
    [uint32]$dummy=0
    $targetTid = [NI]::GetWindowThreadProcessId($hwnd, [ref]$dummy)
  }

  # Attach to target thread if different
  $attached = $false
  if($targetTid -ne $ourTid -and $targetTid -ne 0){
    $attached = [NI]::AttachThreadInput($ourTid, $targetTid, $true)
    Start-Sleep -m 20
  }

  # Force foreground
  [NI]::BringWindowToTop($hwnd)|Out-Null
  [NI]::SetForegroundWindow($hwnd)|Out-Null
  Start-Sleep -m 50

  # Verify and retry
  $fg = [NI]::GetForegroundWindow()
  if($fg -ne $hwnd){
    [NI]::SetForegroundWindow($hwnd)|Out-Null
    Start-Sleep -m 50
  }

  # Detach
  if($attached){
    [NI]::AttachThreadInput($ourTid, $targetTid, $false)|Out-Null
  }
  Start-Sleep -m 30
}

# Send Ctrl+V
[NI]::keybd_event(0x11,0,0,[UIntPtr]::Zero)
Start-Sleep -m 10
[NI]::keybd_event(0x56,0,0,[UIntPtr]::Zero)
Start-Sleep -m 10
[NI]::keybd_event(0x56,0,2,[UIntPtr]::Zero)
Start-Sleep -m 10
[NI]::keybd_event(0x11,0,2,[UIntPtr]::Zero)
`;

    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
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
    try {
      return clipboard.readText();
    } catch {
      return '';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
