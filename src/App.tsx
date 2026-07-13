/**
 * App — Root component for VoiceFlow.
 * Routes between MiniBar (floating) and MainApp (full window).
 */
import React, { useState, useEffect, Suspense, lazy } from 'react';
import './styles/app.css';
import './i18n'; // Initialize i18n
import { NotificationProvider, useNotification } from './components/Notification';
import { Iconify, type IconName } from './utils/icons';
import appLogo from './assets/logo.png';

// Components
import MiniBar from './components/MiniBar/MiniBar';
import HomePage from './components/HomePage/HomePage';

// Lazy load page components for better performance
const Settings = lazy(() => import('./pages/Settings'));
const Models = lazy(() => import('./pages/Models'));
const History = lazy(() => import('./pages/History'));
const Benchmark = lazy(() => import('./pages/Benchmark'));
const LlmModels = lazy(() => import('./pages/LlmModels'));

declare global {
  interface Window {
    voiceflowSoundEnabled?: boolean;
  }
}

type Page = 'home' | 'settings' | 'models' | 'history' | 'benchmark' | 'llm-models';

// ═══════════════════════════════════════════════════════════════
//  Error Boundary — catches rendering errors
// ═══════════════════════════════════════════════════════════════
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[VoiceFlow] ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding: 40, background: '#0a0a12', color: '#f1f5f9', fontFamily: 'monospace', height: '100vh'}}>
          <h2 style={{color: '#ef4444'}}>❌ Error</h2>
          <pre style={{marginTop: 16, padding: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'auto'}}>
            {this.state.error.message}\n{this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════════════════
//  App — Root component
// ═══════════════════════════════════════════════════════════════
export default function App() {
  return (
    <ErrorBoundary>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </ErrorBoundary>
  );
}

// ═══════════════════════════════════════════════════════════════
//  AppContent — Routes between mini and main modes
// ═══════════════════════════════════════════════════════════════
function AppContent() {
  const isMini = window.location.hash === '#mini';
  
  useEffect(() => {
    if (isMini) {
      document.body.classList.add('mini-mode');
      document.documentElement.classList.add('mini-mode');
    } else {
      document.body.classList.remove('mini-mode');
      document.documentElement.classList.remove('mini-mode');
    }
  }, [isMini]);
  
  return isMini ? <MiniBar /> : <MainApp />;
}

// Log startup
console.log('[VoiceFlow] App initializing, hash:', window.location.hash);
console.log('[VoiceFlow] electronAPI available:', !!window.electronAPI);

// ═══════════════════════════════════════════════════════════════
//  MainApp — Full window with sidebar navigation
// ═══════════════════════════════════════════════════════════════
function MainApp() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const notif = useNotification();

  useEffect(() => { loadSettings(); }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const page = (e as CustomEvent).detail;
      if (page) setCurrentPage(page);
    };
    const unsubNavigate = window.electronAPI.onNavigate?.((page) => setCurrentPage(page as Page));
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
    } catch (err) { console.warn('[MainApp] Failed to load settings:', err); } 
  };

  const showSuccess = (msg: string) => {
    notif.success(msg);
  };

  const showError = (msg: string) => {
    notif.error(msg);
  };

  const navItems: { id: Page; icon: IconName; label: string }[] = [
    { id: 'home', icon: 'record', label: 'Record' },
    { id: 'models', icon: 'models', label: 'Models' },
    { id: 'llm-models', icon: 'spark', label: 'LLM' },
    { id: 'history', icon: 'history', label: 'History' },
    { id: 'benchmark', icon: 'benchmark', label: 'Benchmark' },
    { id: 'settings', icon: 'settings', label: 'Settings' },
  ];

  return (
    <div className="app-layout">
      {/* Title Bar */}
      <div className="title-bar">
        <div className="title-bar-drag">
          <div className="title-bar-logo">
            <img src={appLogo} alt="VoiceFlow" className="title-bar-logo-img" />
            <span>VoiceFlow</span>
          </div>
        </div>
        <div className="title-bar-controls">
          <button className="title-btn minimize" onClick={() => window.electronAPI.minimizeWindow()} title="Minimize">
            <Iconify icon="minimize" size={16} />
          </button>
          <button className="title-btn maximize" onClick={() => window.electronAPI.maximizeWindow()} title="Maximize">
            <Iconify icon="maximize" size={16} />
          </button>
          <button className="title-btn close" onClick={() => window.electronAPI.minimizeToBar()} title="Close">
            <Iconify icon="closeWindow" size={16} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="main-area">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                onClick={() => setCurrentPage(item.id)}
                title={item.label}
              >
                <span className="nav-icon"><Iconify icon={item.icon} size={20} /></span>
                {sidebarOpen && <span className="nav-label">{item.label}</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button className="nav-item" onClick={() => setSidebarOpen(!sidebarOpen)} title={sidebarOpen ? 'Collapse' : 'Expand'}>
              <span className="nav-icon">
                <Iconify icon={sidebarOpen ? 'chevronLeft' : 'chevronRight'} size={20} />
              </span>
              {sidebarOpen && <span className="nav-label">Collapse</span>}
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="content">
          <Suspense fallback={
            <div className="page-loading">
              <div className="spinner-lg"></div>
            </div>
          }>
            {currentPage === 'home' && <HomePage settings={settings} onSuccess={showSuccess} onError={showError} />}
            {currentPage === 'models' && <Models onSuccess={showSuccess} onError={showError} />}
            {currentPage === 'history' && <History onSuccess={showSuccess} />}
            {currentPage === 'benchmark' && <Benchmark />}
            {currentPage === 'llm-models' && <LlmModels onSuccess={showSuccess} onError={showError} />}
            {currentPage === 'settings' && <Settings onSuccess={showSuccess} onError={showError} />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
