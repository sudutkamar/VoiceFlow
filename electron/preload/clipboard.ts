/**
 * Clipboard-related preload API.
 */
import { ipcRenderer } from 'electron';
import type { ElectronAPISection } from './types';

export function createClipboardAPI(): ElectronAPISection {
  return {
    copyText: (text) => ipcRenderer.invoke('copy-text', text),
    pasteText: (text) => ipcRenderer.invoke('paste-text', text),
    getClipboardText: () => ipcRenderer.invoke('get-clipboard-text'),
  };
}
