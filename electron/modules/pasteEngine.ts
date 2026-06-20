import { clipboard, BrowserWindow, app } from 'electron';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger';

export class PasteEngine {
  private logger: Logger;
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow, logger: Logger) {
    this.mainWindow = mainWindow;
    this.logger = logger;
  }

  async paste(text: string, targetWindowHandle?: string | null): Promise<{ success: boolean; error?: string }> {
    if (!text?.trim()) return { success: false, error: 'No text' };

    try {
      this.logger.info('Paste starting...', { textLength: text.length, targetWindowHandle });

      const savedClipboard = clipboard.readText();
      clipboard.writeText(text);
      await this.wait(50);

      // Hide only the main settings window. Keep floating UI visible.
      if (!this.mainWindow.isDestroyed() && this.mainWindow.isVisible()) {
        this.mainWindow.hide();
      }

      const ok = await this.sendPasteKeystroke(targetWindowHandle || null);

      setTimeout(() => {
        try { clipboard.writeText(savedClipboard || ''); } catch {}
      }, 1000);

      this.logger.info('Paste done', { success: ok });
      return { success: ok };
    } catch (err: any) {
      this.logger.error('Paste error', err);
      return { success: false, error: err.message };
    }
  }

  private async sendPasteKeystroke(targetWindowHandle: string | null): Promise<boolean> {
    const tempScript = path.join(app.getPath('temp'), `voiceflow-paste-${Date.now()}.ps1`);
    const hwndLiteral = targetWindowHandle && /^\d+$/.test(targetWindowHandle) ? targetWindowHandle : '0';

    const script = `
$hwnd = [IntPtr]${hwndLiteral}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeInput {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
if ($hwnd.ToInt64() -ne 0) {
  [NativeInput]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 180
}
[NativeInput]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 20
[NativeInput]::keybd_event(0x56, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 20
[NativeInput]::keybd_event(0x56, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 20
[NativeInput]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
`;

    fs.writeFileSync(tempScript, script, 'utf8');

    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tempScript], {
        timeout: 4000,
        windowsHide: true,
      }, (err) => {
        try { fs.unlinkSync(tempScript); } catch {}
        resolve(!err);
      });
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  async copy(text: string): Promise<{ success: boolean }> {
    clipboard.writeText(text);
    return { success: true };
  }
}
