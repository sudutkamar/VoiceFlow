/**
 * VoiceFlow — Entry Point
 * 
 * IMPORTANT: Import tauriShim FIRST to set up window.electronAPI
 * before any component tries to use it.
 */
import './utils/tauriShim'; // ← Maps window.electronAPI → Tauri invoke()
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Log Tauri status
console.log('[VoiceFlow] Tauri shim loaded, window.electronAPI available:', !!(window as any).electronAPI);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
