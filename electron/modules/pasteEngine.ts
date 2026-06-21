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

  async paste(text: string, targetWindowHandle?: string | null): Promise<{ success: boolean; error?: string }> {
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

      // 4. Small delay to let windows hide and target app gain focus
      await this.sleep(150);

      // 5. Send Ctrl+V to target window
      const ok = await this.sendPasteKeystroke(targetWindowHandle || null);

      // 6. Re-show mini window after paste
      if (this.showAfterPaste) {
        // Delay to ensure paste keystroke is processed first
        setTimeout(() => this.showAfterPaste!(), 300);
      }

      // 7. Restore original clipboard after a delay
      setTimeout(() => {
        try {
          clipboard.writeText(savedClipboard || '');
        } catch {}
      }, 800);

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

  private async sendPasteKeystroke(targetWindowHandle: string | null): Promise<boolean> {
    const hwndLiteral = targetWindowHandle && /^\d+$/.test(targetWindowHandle) ? targetWindowHandle : '0';

    const script = `
$hwnd=[IntPtr]${hwndLiteral}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NI {
  [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h, int nCmdShow);
  [DllImport("user32.dll")]public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")]public static extern void keybd_event(byte b,byte s,uint f,UIntPtr e);
}
"@
if($hwnd.ToInt64()-ne 0 -and [NI]::IsWindow($hwnd)){
  [NI]::ShowWindow($hwnd, 9)|Out-Null
  [NI]::SetForegroundWindow($hwnd)|Out-Null
  Start-Sleep -m 180
}
[NI]::keybd_event(0x11,0,0,[UIntPtr]::Zero)
Start-Sleep -m 20
[NI]::keybd_event(0x56,0,0,[UIntPtr]::Zero)
Start-Sleep -m 20
[NI]::keybd_event(0x56,0,2,[UIntPtr]::Zero)
Start-Sleep -m 20
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
