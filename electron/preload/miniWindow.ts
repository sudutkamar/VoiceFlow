/**
 * Mini window preload API.
 */
import { ipcRenderer } from 'electron';
import type { ElectronAPISection } from './types';

export function createMiniWindowAPI(): ElectronAPISection {
  return {
    showMiniWindow: () => ipcRenderer.invoke('show-mini-window'),
    hideMiniWindow: () => ipcRenderer.invoke('hide-mini-window'),
    resizeMiniWindow: (height: number) => ipcRenderer.invoke('resize-mini-window', height),
    setMiniWindowFocusable: (focusable: boolean) => ipcRenderer.invoke('set-mini-window-focusable', focusable),
    miniWindowReady: () => ipcRenderer.send('mini-window-ready'),
  };
}
