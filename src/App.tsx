import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import './styles/app.css';
import { useRecorder } from './hooks/useRecorder';
import { NotificationProvider, useNotification } from './components/Notification';
import { Iconify, getModelIcon, getModelSizeColor, type IconName } from './utils/icons';
import { playSound } from './utils/audio';
import appLogo from './assets/logo.png';
import VerticalMiniBar from './components/VerticalMiniBar';

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

type State = 'idle' | 'hover' | 'recording' | 'processing' | 'done';
type Page = 'home' | 'settings' | 'models' | 'history' | 'benchmark' | 'llm-models';

// Helper functions
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return '#4ade80';
  if (confidence >= 0.75) return '#4a9eff';
  if (confidence >= 0.6) return '#fbbf24';
  return '#f87171';
}

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

export default function App() {
  return (
    <ErrorBoundary>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </ErrorBoundary>
  );
}

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

// Also add console.log at start
console.log('[VoiceFlow] App initializing, hash:', window.location.hash);
console.log('[VoiceFlow] electronAPI available:', !!window.electronAPI);

// ============ MINI BAR ============
function MiniBar() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [targetApp, setTargetApp] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const [barHover, setBarHover] = useState(false);
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  const [gpuStatus, setGpuStatus] = useState<string | null>(null);
  const [windowHeight, setWindowHeight] = useState(64);
  const [windowWidth, setWindowWidth] = useState(460);
  const langRef = useRef<HTMLDivElement>(null);

  const recorder = useRecorder(settings, {
    onTranscript: (d) => {
      setText(d.cleaned || d.raw);
      setState('done');
      setTimeout(() => { if (stateRef.current === 'done') setState('idle'); }, 4000);
    },
    onError: (e) => {
      if (e === '__NO_SPEECH__') { setState('idle'); return; }
      setError(e); setState('idle'); setTimeout(() => setError(''), 3000);
    },
  });

  const {
    state, setState, text, setText, partial, setPartial, error, setError,
    time, micLevel, setMicLevel, clipPeak, setClipPeak,
    analyserRef, animRef, wavRecorderRef, startRef, stateRef, timerRef, processingTimeoutRef,
    startRec, stopRec, cancelRec, toggle,
  } = recorder;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothLevels = useRef<number[]>(Array(24).fill(0));
  const prevStateRef = useRef<State>('idle');
  const resizeTimerRef = useRef<any>(null);
  const debounceRef = useRef<any>(null);
  const skipResizeRef = useRef(false);

  const MIN_HEIGHT = 28;
  const MAX_HEIGHT = 120;
  const BASE_HEIGHT = 52;

  // Calculate zoom based on window height (base bar height = 52px, width is auto)
  const miniZoom = windowHeight / BASE_HEIGHT;

  // Listen for window resize to update zoom scale
  useEffect(() => {
    const handleResize = () => {
      if (skipResizeRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (skipResizeRef.current) return;
        const h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, window.innerHeight));
        const w = window.innerWidth;
        setWindowHeight(h);
        setWindowWidth(w);
        // Skip horizontal resize logic if window is in vertical orientation
        if (window.innerHeight > window.innerWidth * 2) return;
        // Ensure window width fits the zoomed content
        // Bar natural width at base: ~244px (40+6+90+6+40+6+40+16 padding)
        const BAR_BASE_WIDTH = 244;
        const minW = Math.round(BAR_BASE_WIDTH * (h / BASE_HEIGHT));
        if (w < minW - 4) {
          skipResizeRef.current = true;
          window.electronAPI.resizeMiniWindow(h, minW).finally(() => {
            setTimeout(() => { skipResizeRef.current = false; }, 100);
          });
        }
      }, 16);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const vadEnabled = settings.vad_enabled !== 'false';

  // Sound effects for recording state transitions
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (state === 'recording' && prev !== 'recording') playSound('start');
    else if (state === 'processing' && prev === 'recording') playSound('stop');
  }, [state]);

  useEffect(() => {
    loadSettings();
    window.electronAPI.miniWindowReady?.();
    const unsubs = [
      window.electronAPI.onTargetAppChanged((appName) => setTargetApp(appName)),
      window.electronAPI.onHotkeyRegistered?.((hotkey) => setSettings(prev => ({ ...prev, hotkey }))),
      window.electronAPI.onThemeChange?.((theme) => {
        if (theme === 'light') document.documentElement.classList.add('light-theme');
        else document.documentElement.classList.remove('light-theme');
      }),
      window.electronAPI.onReloadSettings?.(() => { loadSettings(); }),
    ];
    window.electronAPI.getTargetApp().then(setTargetApp).catch(() => {});

    // Close lang dropdown on outside click
    const handleOutsideClick = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);

    // Close dropdown when window loses focus
    const handleBlur = () => setLangOpen(false);
    window.addEventListener('blur', handleBlur);

    // Check model availability
    window.electronAPI.hasAnyModel().then(setHasModel).catch(() => setHasModel(null));
    // Check GPU/CUDA status
    window.electronAPI.getGpuStatus().then((s) => {
      if (s.hasGpu && !s.cudaDllsPresent) setGpuStatus('GPU');
      else setGpuStatus(null);
    }).catch(() => {});

    return () => {
      unsubs.forEach((u) => u());
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const loadSettings = async () => { 
    try { 
      const s = await window.electronAPI.getSettings(); 
      setSettings(s); 
      window.voiceflowSoundEnabled = s.sound_effects !== 'false'; 
      // Apply theme to mini window
      if (s.theme === 'light') {
        document.documentElement.classList.add('light-theme');
      } else {
        document.documentElement.classList.remove('light-theme');
      }



      // After settings loaded: proactively request mic permission
      // so it's ready when user clicks record.
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        tempStream.getTracks().forEach(t => t.stop());

        // Auto-detect and save default mic if none selected
        if (!s.selected_mic) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const mics = devices.filter(d => d.kind === 'audioinput');
          if (mics.length > 0 && mics[0].deviceId) {
            await window.electronAPI.updateSetting('selected_mic', mics[0].deviceId).catch(() => {});
            setSettings(prev => ({ ...prev, selected_mic: mics[0].deviceId }));
          }
        }
      } catch (err) {
        console.warn('[MiniBar] Mic preflight failed:', err);
      }
    } catch {} 
  };

  // Save zoom to settings when it changes
  useEffect(() => {
    if (windowHeight !== 64) {
      window.electronAPI.updateSetting('mini_bar_scale', String(miniZoom)).catch(() => {});
    }
  }, [miniZoom]);

  // Canvas visualization effect
  useEffect(() => {
    if (state !== 'recording') {
      smoothLevels.current = Array(24).fill(0);
      return;
    }
    const POINTS = 24;
    const drawCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }
      const w = rect.width, h = rect.height;
      ctx.clearRect(0, 0, w, h);
      const src = smoothLevels.current;
      const mid = h / 2;
      const step = w / (POINTS - 1);
      const avg = src.reduce((a, b) => a + b, 0) / POINTS;
      const glow = Math.min(1, avg / 40);
      // Main wave — bright blue with strong glow
      ctx.beginPath();
      ctx.moveTo(0, mid - (src[0] / 100) * (mid - 2));
      for (let i = 1; i < POINTS; i++) {
        const x0 = (i - 1) * step, x1 = i * step;
        const y0 = mid - (src[i - 1] / 100) * (mid - 2);
        const y1 = mid - (src[i] / 100) * (mid - 2);
        ctx.bezierCurveTo((x0 + x1) / 2, y0, (x0 + x1) / 2, y1, x1, y1);
      }
      ctx.strokeStyle = `rgba(99, 182, 255, ${0.85 + glow * 0.15})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = `rgba(99, 182, 255, ${0.6 + glow * 0.4})`;
      ctx.shadowBlur = 8 + glow * 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Mirror wave — soft purple reflection
      ctx.beginPath();
      ctx.moveTo(0, mid + (src[0] / 100) * (mid - 2));
      for (let i = 1; i < POINTS; i++) {
        const x0 = (i - 1) * step, x1 = i * step;
        const y0 = mid + (src[i - 1] / 100) * (mid - 2);
        const y1 = mid + (src[i] / 100) * (mid - 2);
        ctx.bezierCurveTo((x0 + x1) / 2, y0, (x0 + x1) / 2, y1, x1, y1);
      }
      ctx.strokeStyle = `rgba(168, 130, 255, ${0.5 + glow * 0.4})`;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = `rgba(168, 130, 255, ${0.4 + glow * 0.3})`;
      ctx.shadowBlur = 6 + glow * 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Center line — subtle guide
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + glow * 0.1})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    };
    const viz = () => {
      if (!analyserRef.current || !wavRecorderRef.current?.isRecording()) return;
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      const wave = new Uint8Array(analyserRef.current.fftSize);
      analyserRef.current.getByteFrequencyData(data);
      analyserRef.current.getByteTimeDomainData(wave);
      const freq = Array.from(data).slice(2, Math.max(3, Math.floor(data.length * 0.85)));
      const amp = Array.from(wave).map((v) => Math.abs(v - 128) * 4.8);
      const freqBucket = Math.max(1, Math.floor(freq.length / POINTS));
      const ampBucket = Math.max(1, Math.floor(amp.length / POINTS));
      const raw = Array.from({ length: POINTS }, (_, i) => {
        const freqPeak = freq.slice(i * freqBucket, (i + 1) * freqBucket).reduce((m, v) => Math.max(m, v), 0) * 1.55;
        const ampPeak = amp.slice(i * ampBucket, (i + 1) * ampBucket).reduce((m, v) => Math.max(m, v), 0);
        return Math.min(100, Math.max(4, freqPeak, ampPeak));
      });
      const ease = 0.18;
      for (let i = 0; i < POINTS; i++) {
        smoothLevels.current[i] += (raw[i] - smoothLevels.current[i]) * ease;
      }
      drawCanvas();
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setMicLevel(Math.min(100, avg * 2));
      setClipPeak(prev => Math.max(prev, avg > 80 ? 2 : avg > 60 ? 1 : 0));
      animRef.current = requestAnimationFrame(viz);
    };
    viz();
    return () => { cancelAnimationFrame(animRef.current); };
  }, [state]);
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };
  const langs = [
    { c: 'auto', f: '🌐', l: 'Auto Detect', s: 'AUTO' },
    { c: 'id', f: 'ID', l: 'Indonesia', s: 'ID' },
    { c: 'en', f: 'EN', l: 'English', s: 'EN' },
    { c: 'ja', f: 'JA', l: '日本語', s: 'JA' },
    { c: 'ko', f: 'KO', l: '한국어', s: 'KO' },
    { c: 'zh', f: 'CN', l: '中文', s: 'ZH' },
  ];
  const currentLang = langs.find((l) => l.c === (settings.language || 'auto')) || langs[0];
  const formatHotkey = (hk: string) => hk.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl').replace(/\+/g, ' + ');
  const hotkeyLabel = formatHotkey(settings.hotkey || 'CommandOrControl+Shift+Space');
  const cycleLanguage = async () => {
    const idx = Math.max(0, langs.findIndex((l) => l.c === currentLang.c));
    const next = langs[(idx + 1) % langs.length];
    setSettings(prev => ({ ...prev, language: next.c }));
    try {
      const result = await window.electronAPI.updateSetting('language', next.c);
      if (result?.success === false) setSettings(prev => ({ ...prev, language: currentLang.c }));
    } catch {
      setSettings(prev => ({ ...prev, language: currentLang.c }));
    }
  };

  const isVertical = settings.mini_bar_orientation === 'vertical';

  // Manage mini-vertical body class for CSS rules
  useEffect(() => {
    if (isVertical) {
      document.body.classList.add('mini-vertical');
    } else {
      document.body.classList.remove('mini-vertical');
    }
    return () => { document.body.classList.remove('mini-vertical'); };
  }, [isVertical]);

  // If vertical mode, render the dedicated VerticalMiniBar component
  if (isVertical) {
    return <VerticalMiniBar settings={settings} />;
  }

  // Horizontal mode (original code - untouched)
  return (
    <div className="mini-app">
      <div
        className={`mini-bar ${state}`}
        style={{ zoom: miniZoom }}
        onMouseEnter={() => { setBarHover(true); if (state === 'idle') setState('hover'); }}
        onMouseLeave={() => { setBarHover(false); if (stateRef.current === 'hover') setState('idle'); }}
      >
        {/* Language selector */}
        <div className="m-lang-wrap" ref={langRef}>
          <button
            type="button"
            className="m-lang"
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); cycleLanguage(); }}
          >
            <span className="m-lang-current">{currentLang.s}</span>
          </button>
        </div>

        {/* Mic / Record */}
        <button
          className={`m-voice-btn ${state}`}
          onClick={toggle}
          disabled={state === 'processing'}
        >
          {(state === 'idle' || state === 'hover') && (
            <svg className="m-voice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0v-6A3.5 3.5 0 0 0 12 2Z"/>
              <path d="M19 10.5v1a7 7 0 0 1-14 0v-1"/>
              <path d="M12 18.5V22"/>
            </svg>
          )}
          {state === 'recording' && (
            <div className="m-recording-core">
              <span className="m-live-dot" />
              <canvas ref={canvasRef} className="m-canvas" />
              <span className="m-time">{fmt(time)}</span>
            </div>
          )}
          {state === 'processing' && (
            <div className="m-processing-core">
              <div className="m-spinner" />
            </div>
          )}
          {state === 'done' && (
            <div className="m-done-core">
              <span className="m-chk">✓</span>
              <span>OK</span>
            </div>
          )}
        </button>

        {/* Cancel (during recording) */}
        {state === 'recording' && (
          <button
            className="m-orb-btn m-cancel-btn"
            onClick={cancelRec}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}

        {/* Copy / Tools */}
        <button
          className={`m-orb-btn m-spark-btn ${text ? 'ready copy-mode' : ''}`}
          onClick={async () => {
            if (text) {
              const r = await window.electronAPI.copyText(text);
              if (r.success) {
                playSound('done');
                setState('done');
                setTimeout(() => setState('idle'), 900);
              }
            } else {
              window.electronAPI.showMain('settings');
            }
          }}
        >
          {text ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="11" height="11" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 4V2"/>
              <path d="M15 10v-2"/>
              <path d="M12 7h6"/>
              <path d="m5 19 9.2-9.2a1.9 1.9 0 0 1 2.7 2.7L7.7 21.7a1.9 1.9 0 0 1-2.7-2.7Z"/>
              <path d="m12.5 11.5 2 2"/>
            </svg>
          )}
        </button>

        {/* Paste / History */}
        <button
          className={`m-orb-btn m-note-btn ${text ? 'ready paste-mode' : ''}`}
          onClick={async () => {
            if (text) {
              const r = await window.electronAPI.pasteText(text);
              if (r.success) setText('');
            } else {
              window.electronAPI.showMain('history');
            }
          }}
        >
          {text ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect x="8" y="2" width="8" height="5" rx="1.5"/>
              <path d="M8 12h8"/>
              <path d="M8 16h5"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v10A2.5 2.5 0 0 1 16.5 18H10l-4.4 3.2A.4.4 0 0 1 5 20.9Z"/>
              <path d="M9 8h6"/>
              <path d="M9 12h4"/>
            </svg>
          )}
        </button>
      </div>

      {/* Text result */}
      {text && state === 'done' && (
        <div className="m-result-text" onClick={async () => {
          const r = await window.electronAPI.copyText(text);
          if (r.success) playSound('done');
        }}>
          <span className="m-result-label">Result:</span>
          <span className="m-result-content">{text.length > 80 ? text.substring(0, 80) + '...' : text}</span>
        </div>
      )}

      {/* Setup warnings */}
      {hasModel === false && state !== 'recording' && (
        <div className="m-tooltip warning" onClick={() => window.electronAPI.showMain('models')}>
          Belum ada model AI — klik untuk download
        </div>
      )}
      {gpuStatus && !hasModel === false && state !== 'recording' && (
        <div className="m-tooltip info" onClick={() => window.electronAPI.showMain('settings')}>
          GPU terdeteksi — klik untuk download CUDA
        </div>
      )}

      {/* Tooltips */}
      {partial && state === 'recording' && <div className="m-tooltip">{partial}</div>}
      {error && <div className="m-tooltip error">{error}</div>}
    </div>
  );
}

// ============ MAIN APP ============
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
    } catch {} 
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

// ============ HOME PAGE ============
function HomePage({ settings, onSuccess, onError }: { settings: Record<string, string>; onSuccess: (msg: string) => void; onError: (msg: string) => void }) {
  const [history, setHistory] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<any>(null);
  const [fuzzyChanges, setFuzzyChanges] = useState<number>(0);
  const [rawText, setRawText] = useState<string>('');
  const [levels, setLevels] = useState<number[]>(Array(30).fill(0));
  const prevState = useRef<State>('idle');

  const {
    state, setState,
    text, setText,
    partial, setPartial,
    error, setError,
    time, micLevel, setMicLevel, clipPeak, setClipPeak,
    analyserRef, animRef, wavRecorderRef, stateRef, processingTimeoutRef,
    cancelRec, toggle,
  } = useRecorder(settings, {
    onTranscript: (d) => {
      const result = d.cleaned || d.raw;
      setText(result);
      setConfidence(d.confidence || null);
      setFuzzyChanges(d.fuzzyChanges || 0);
      setRawText(d.rawText || '');
      setHistory(prev => [result, ...prev].slice(0, 10));
      setState('done');
      playSound('done');
      setTimeout(() => setState('idle'), 2000);
    },
    onPartial: (p) => setPartial(p),
    onError: (e) => {
      if (e === '__NO_SPEECH__') {
        setError('Tidak terdeteksi suara');
        setState('idle');
        setTimeout(() => setError(''), 2000);
        return;
      }
      setError(e);
      setState('idle');
      playSound('error');
      setTimeout(() => setError(''), 3000);
    },
    minRecordingMs: 2000,
  });

  const vadEnabled = settings.vad_enabled !== 'false';

  // Sound effects for recording state transitions
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = state;
    if (state === 'recording' && prev !== 'recording') playSound('start');
    else if (state === 'processing' && prev === 'recording') playSound('stop');
  }, [state]);

  // Visualization effect
  useEffect(() => {
    if (state !== 'recording') { setLevels(Array(30).fill(0)); return; }
    const viz = () => {
      if (!analyserRef.current || !wavRecorderRef.current?.isRecording()) return;
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(data);
      setLevels(Array.from(data).slice(0, 30).map((v) => Math.min(100, v * 1.8)));
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setMicLevel(Math.min(100, avg * 2));
      setClipPeak(prev => Math.max(prev, avg > 80 ? 2 : avg > 60 ? 1 : 0));
      animRef.current = requestAnimationFrame(viz);
    };
    viz();
    return () => { cancelAnimationFrame(animRef.current); };
  }, [state]);

  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };

  const [hasModel, setHasModel] = useState<boolean | null>(null);

  useEffect(() => {
    window.electronAPI.hasAnyModel().then(setHasModel).catch(() => setHasModel(true));
  }, []);

  // Determine active profile based on model and audio settings
  const getActiveProfile = () => {
    const model = settings.model || '';
    const modelName = model.replace('ggml-', '').replace('.bin', '');
    
    // Get model display name
    let displayName = 'No Model';
    if (model.includes('large-v3-q5_0')) displayName = 'Large v3 Q5';
    else if (model.includes('large-v3-turbo-q8_0')) displayName = 'Large v3 Turbo Q8';
    else if (model.includes('large-v3-turbo-q5_0')) displayName = 'Large v3 Turbo Q5';
    else if (model.includes('large-v3-turbo')) displayName = 'Large v3 Turbo';
    else if (model.includes('large-v3')) displayName = 'Large v3';
    else if (model.includes('large')) displayName = 'Large';
    else if (model.includes('medium')) displayName = 'Medium';
    else if (model.includes('small')) displayName = 'Small';
    else if (model.includes('base-q5_1')) displayName = 'Base Q5';
    else if (model.includes('base')) displayName = 'Base';
    else if (model.includes('tiny')) displayName = 'Tiny';
    else if (model) displayName = modelName;
    
    // Get speed hint
    let speed = '';
    if (model.includes('tiny')) speed = '~1s';
    else if (model.includes('base-q5_1')) speed = '~1-2s';
    else if (model.includes('base')) speed = '~2-3s';
    else if (model.includes('small')) speed = '~5-7s';
    else if (model.includes('medium')) speed = '~10-15s';
    else if (model.includes('large-v3-q5_0')) speed = '~6-10s';
    else if (model.includes('large-v3-turbo-q8_0')) speed = '~5-8s';
    else if (model.includes('large-v3-turbo-q5_0')) speed = '~4-7s';
    else if (model.includes('large-v3-turbo')) speed = '~8-12s';
    else if (model.includes('large-v3')) speed = '~15-25s';
    else if (model.includes('large')) speed = '~15-25s';
    
    return {
      name: displayName,
      icon: getModelIcon(model),
      color: getModelSizeColor(model),
      desc: speed ? `Est. ${speed}` : 'Select a model',
      model: model,
    };
  };
  const activeProfile = getActiveProfile();

  return (
    <div className="page home-page">
      {hasModel === false && (
        <div className="model-warning-banner">
          <span className="warning-icon">!</span>
          <div className="model-warning-text">
            <strong>Belum ada model AI!</strong>
            <p>Download model untuk mulai transcribe.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => window.electronAPI.showMain('models')}>
            Download Model
          </button>
        </div>
      )}
      
      {/* Profile Indicator */}
      <div className="profile-indicator">
        <div className="profile-badge" style={{ borderColor: activeProfile.color }}>
          <span className="profile-badge-icon" style={{ color: activeProfile.color }}>
            <Iconify icon={activeProfile.icon} size={20} />
          </span>
          <span className="profile-badge-text">
            <span className="profile-badge-name">{activeProfile.name}</span>
            <span className="profile-badge-speed">{activeProfile.desc}</span>
          </span>
        </div>
        <div className="profile-info">
          <span className="profile-name">Active Model</span>
          <span className="profile-desc">{activeProfile.model || 'Not selected'}</span>
        </div>
      </div>

      <div className="home-content">
        {/* Mic Button */}
        <div className={`mic-section ${state}`}>
          <button className={`mic-btn ${state}`} onClick={toggle} disabled={state === 'processing'}>
            {state === 'idle' || state === 'done' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            ) : state === 'recording' ? (
              <div className="stop-icon" />
            ) : (
              <div className="spinner" />
            )}
          </button>
          
          <div className="mic-status">
            {state === 'idle' && <span>Click to start recording</span>}
            {state === 'recording' && (
              <div className="rec-status">
                <div className="rec-dot" />
                <span>Recording</span>
                <span className="rec-time">{fmt(time)}</span>
              </div>
            )}
            {state === 'processing' && <span className="processing-text">{partial ? partial.substring(0, 50) + (partial.length > 50 ? '...' : '') : 'Processing audio...'}</span>}
            {state === 'done' && <span className="done-text">✓ Complete</span>}
          </div>
          
          {state === 'recording' && (
            <button className="cancel-btn" onClick={cancelRec} title="Cancel recording (Esc)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              <span>Cancel</span>
              <span className="cancel-key">Esc</span>
            </button>
          )}
        </div>

        {/* Professional Waveform Visualizer */}
        {state === 'recording' && (
          <>
            <div className="pro-viz">
              <div className="pro-viz-inner">
                {levels.map((l, i) => (
                  <div key={i} className="pro-viz-bar-wrap">
                    <div className="pro-viz-bar" style={{ height: `${Math.max(6, l * 0.95)}%` }} />
                    <div className="pro-viz-bar-mirror" style={{ height: `${Math.max(3, l * 0.4)}%` }} />
                  </div>
                ))}
              </div>
            </div>
            <div className={`mic-diag ${clipPeak >= 2 ? 'clip' : clipPeak >= 1 ? 'loud' : micLevel < 3 ? 'low' : 'ok'}`}>
              {clipPeak >= 2 ? 'Clipping - move mic away' : micLevel < 3 ? 'No input detected - check mic' : clipPeak >= 1 ? 'Loud - may distort' : 'Good level'}
              {vadEnabled && <span className="vad-badge">VAD</span>}
            </div>
          </>
        )}

        {/* Partial */}
        {partial && (state === 'recording' || state === 'processing') && (
          <div className="partial-box">
            <div className="partial-label">{state === 'processing' ? 'Transcribing...' : 'Listening...'}</div>
            <p>{partial}</p>
          </div>
        )}

        {/* Result */}
        {text && state !== 'recording' && (
          <div className="result-box">
            <p>{text}</p>
            
            {/* Diff View: raw vs final */}
            {rawText && rawText !== text && (
              <div className="diff-view">
                <div className="diff-header">Raw Whisper → Final</div>
                <div className="diff-pair">
                  <div className="diff-raw"><span className="diff-tag">RAW</span> {rawText}</div>
                  <div className="diff-final"><span className="diff-tag">FINAL</span> {text}</div>
                </div>
              </div>
            )}
            
            {/* Confidence Info */}
            {confidence && (
              <div className="confidence-info">
                <div className="confidence-header">
                  <span className="confidence-label">Confidence:</span>
                  <span className="confidence-value" style={{ color: getConfidenceColor(confidence.overall) }}>
                    {Math.round(confidence.overall * 100)}%
                  </span>
                  <span className={`confidence-badge ${confidence.quality}`}>
                    {confidence.quality}
                  </span>
                </div>
                {fuzzyChanges > 0 && (
                  <div className="fuzzy-info">
                    <span>{fuzzyChanges} words auto-corrected</span>
                  </div>
                )}
                {confidence.suggestions && confidence.suggestions.length > 0 && (
                  <div className="suggestions">
                    {confidence.suggestions.slice(0, 2).map((s: string, i: number) => (
                      <div key={i} className="suggestion-item">{s}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div className="result-actions">
              <button className="btn-action" onClick={async () => { await window.electronAPI.copyText(text); onSuccess('Copied!'); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy
              </button>
              <button className="btn-action primary" onClick={async () => { await window.electronAPI.pasteText(text); setText(''); onSuccess('Pasted!'); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
                Paste
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && <div className="error-box">{error}</div>}

        {/* History Link */}
        <div className="history-link-section">
          <button className="btn-action history-link-btn" onClick={() => {
            const event = new CustomEvent('navigate-page', { detail: 'history' });
            window.dispatchEvent(event);
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            View History
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14, marginLeft: 2 }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
