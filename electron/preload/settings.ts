/**
 * Settings/data preload API — settings, history, dictionary, snippets.
 */
import { ipcRenderer } from 'electron';
import type { ElectronAPISection } from './types';

export function createSettingsAPI(): ElectronAPISection {
  return {
    getSettings: () => ipcRenderer.invoke('get-settings'),
    updateSetting: (key, value) => ipcRenderer.invoke('update-setting', key, value),
    getHistory: (limit) => ipcRenderer.invoke('get-history', limit),
    clearHistory: () => ipcRenderer.invoke('clear-history'),
    deleteHistoryItem: (id) => ipcRenderer.invoke('delete-history-item', id),
    searchHistory: (query) => ipcRenderer.invoke('search-history', query),
    exportHistory: () => ipcRenderer.invoke('export-history'),

    getDictionary: () => ipcRenderer.invoke('get-dictionary'),
    addDictionaryEntry: (phrase, replacement) => ipcRenderer.invoke('add-dictionary-entry', phrase, replacement),
    deleteDictionaryEntry: (id) => ipcRenderer.invoke('delete-dictionary-entry', id),
    updateDictionaryEntry: (id, phrase, replacement) => ipcRenderer.invoke('update-dictionary-entry', id, phrase, replacement),
    exportDictionary: () => ipcRenderer.invoke('export-dictionary'),
    importDictionary: (csvContent) => ipcRenderer.invoke('import-dictionary', csvContent),

    getSnippets: () => ipcRenderer.invoke('get-snippets'),
    addSnippet: (trigger, output) => ipcRenderer.invoke('add-snippet', trigger, output),
    deleteSnippet: (id) => ipcRenderer.invoke('delete-snippet', id),
    updateSnippet: (id, trigger, output) => ipcRenderer.invoke('update-snippet', id, trigger, output),

    getStartupMode: () => ipcRenderer.invoke('get-startup-mode'),
    setStartupMode: (mode) => ipcRenderer.invoke('set-startup-mode', mode),
  };
}
