/**
 * App — Root component for VoiceFlow.
 * Wraps everything with ErrorBoundary and NotificationProvider.
 */
import React from 'react';
import './styles/app.css';
import './i18n';
import { SettingsProvider } from './hooks/SettingsContext';
import { NotificationProvider } from './components/Notification';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppContent } from './components/AppContent';

declare global {
  interface Window {
    voiceflowSoundEnabled?: boolean;
  }
}

// Log startup
// console.log('[VoiceFlow] App initializing, hash:', window.location.hash);
// console.log('[VoiceFlow] electronAPI available:', !!window.electronAPI);

export default function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
