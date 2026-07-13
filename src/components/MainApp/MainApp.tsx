/**
 * MainApp — Full window with sidebar navigation and content area.
 */
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useNotification } from '../Notification';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';

// Lazy load page components for better performance
const Settings = lazy(() => import('../../pages/Settings'));
const Models = lazy(() => import('../../pages/Models'));
const History = lazy(() => import('../../pages/History'));
const Benchmark = lazy(() => import('../../pages/Benchmark'));
const LlmModels = lazy(() => import('../../pages/LlmModels'));
const HomePage = lazy(() => import('../HomePage/HomePage'));

type Page = 'home' | 'settings' | 'models' | 'history' | 'benchmark' | 'llm-models';

export function MainApp() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const notif = useNotification();

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const page = (e as CustomEvent).detail;
      if (page) setCurrentPage(page);
    };
    const unsubNavigate = window.electronAPI.onNavigate?.((page) =>
      setCurrentPage(page as Page)
    );
    window.addEventListener('navigate-page', handler);
    return () => {
      window.removeEventListener('navigate-page', handler);
      unsubNavigate?.();
    };
  }, []);

  const loadSettings = async () => {
    try {
      const s = await window.electronAPI.getSettings();
      setSettings(s);
      window.voiceflowSoundEnabled = s.sound_effects !== 'false';
      // Apply saved theme
      if (s.theme === 'light') {
        document.documentElement.classList.add('light-theme');
      } else {
        document.documentElement.classList.remove('light-theme');
      }
    } catch (err) {
      console.warn('[MainApp] Failed to load settings:', err);
    }
  };

  const showSuccess = (msg: string) => {
    notif.success(msg);
  };

  const showError = (msg: string) => {
    notif.error(msg);
  };

  return (
    <div className="app-layout">
      <TitleBar />

      <div className="main-area">
        <Sidebar
          currentPage={currentPage}
          isOpen={sidebarOpen}
          onPageChange={setCurrentPage}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="content">
          <Suspense
            fallback={
              <div className="page-loading">
                <div className="spinner-lg"></div>
              </div>
            }
          >
            {currentPage === 'home' && (
              <HomePage settings={settings} onSuccess={showSuccess} onError={showError} />
            )}
            {currentPage === 'models' && (
              <Models onSuccess={showSuccess} onError={showError} />
            )}
            {currentPage === 'history' && <History onSuccess={showSuccess} />}
            {currentPage === 'benchmark' && <Benchmark />}
            {currentPage === 'llm-models' && (
              <LlmModels onSuccess={showSuccess} onError={showError} />
            )}
            {currentPage === 'settings' && (
              <Settings onSuccess={showSuccess} onError={showError} />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
