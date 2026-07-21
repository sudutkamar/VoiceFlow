/**
 * Adaptive learning preload API — suggestions, corrections.
 */
import { ipcRenderer } from 'electron';
import type { ElectronAPISection } from './types';

export function createLearningAPI(): ElectronAPISection {
  return {
    getSuggestions: (text) => ipcRenderer.invoke('get-suggestions', text),
    playAudio: (historyId) => ipcRenderer.invoke('play-audio', historyId),
    learnCorrection: (original, corrected) => ipcRenderer.invoke('learn-correction', original, corrected),
    getLearnedCorrections: () => ipcRenderer.invoke('get-learned-corrections'),
    deleteLearnedCorrection: (id) => ipcRenderer.invoke('delete-learned-correction', id),
    clearLearnedCorrections: () => ipcRenderer.invoke('clear-learned-corrections'),
    getAdaptiveStats: () => ipcRenderer.invoke('get-adaptive-stats'),
  };
}
