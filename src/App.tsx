import React, { useState, useEffect, useCallback, useRef } from 'react';
import './styles/app.css';
import { WavRecorder } from './utils/wavRecorder';
import Settings from './pages/Settings';
import Models from './pages/Models';
import History from './pages/History';

declare global {
  interface Window {
    electronAPI: {
      startRecording: () => Promise<{ success: boolean; error?: string }>;
      stopRecording: () => Promise<{ success: boolean; error?: string }>;
      sendAudioData: (data: { buffer: number[]; mimeType: string; duration: number }) => void;
      getSettings: () => Promise<Record<string, string>>;
      updateSetting: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
      updateHotkey: (newHotkey: string) => Promise<{ success: boolean; error?: string }>;
      quitApp: () => Promise<void>;
      showMain: () => Promise<void>;
      minimizeToBar: () => Promise<void>;
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      miniWindowReady: () => void;
      getTargetApp: () => Promise<string>;
      onStateChange: (callback: (state: string) => void) => () => void;
      onTranscriptReady: (callback: (data: any) => void) => () => void;
      onError: (callback: (error: string) => void) => () => void;
      onStartRecording: (callback: () => void) => () => void;
      onStopRecording: (callback: (duration: number) => void) => () => void;
      onPartialTranscript: (callback: (text: string) => void) => () => void;
      onTargetAppChanged: (callback: (appName: string) => void) => () => void;
      copyText: (text: string) => Promise<{ success: boolean; error?: string }>;
      pasteText: (text: string) => Promise<{ success: boolean; error?: string }>;
      getAvailableModels: () => Promise<any[]>;
      getDownloadedModels: () => Promise<string[]>;
      downloadModel: (modelName: string) => Promise<{ success: boolean; error?: string }>;
      cancelDownload: () => Promise<void>;
      getDownloadProgress: () => Promise<number>;
      getModelsPath: () => Promise<string>;
      getDictionary: () => Promise<any[]>;
      addDictionaryEntry: (phrase: string, replacement: string) => Promise<{ success: boolean }>;
      deleteDictionaryEntry: (id: string) => Promise<void>;
      getSnippets: () => Promise<any[]>;
      addSnippet: (trigger: string, output: string) => Promise<{ success: boolean }>;
      deleteSnippet: (id: string) => Promise<void>;
      setAutoStart: (enable: boolean) => Promise<void>;
      getHistory: () => Promise<any[]>;
      deleteHistory: (id: string) => Promise<void>;
      clearHistory: () => Promise<void>;
      exportHistory: () => Promise<{ success: boolean; path?: string; error?: string }>;
      searchHistory: (query: string) => Promise<any[]>;
    };
  }
}

type State = 'idle' | 'hover' | 'recording' | 'processing' | 'done';
type Page = 'home' | 'settings' | 'models' | 'history';

// Helper functions
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return '#4ade80';
  if (confidence >= 0.75) return '#4a9eff';
  if (confidence >= 0.6) return '#fbbf24';
  return '#f87171';
}

// Sound feedback
function playSound(type: 'start' | 'stop' | 'done' | 'error') {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.15;
    switch (type) {
      case 'start':
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
        break;
      case 'stop':
        osc.frequency.value = 400;
        osc.type = 'sine';
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
        break;
      case 'done':
        osc.frequency.value = 600;
        osc.type = 'sine';
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
        setTimeout(() => {
          const ctx2 = new AudioContext();
          const osc2 = ctx2.createOscillator();
          const gain2 = ctx2.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx2.destination);
          gain2.gain.value = 0.15;
          osc2.frequency.value = 900;
          osc2.type = 'sine';
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 0.15);
          osc2.start(ctx2.currentTime);
          osc2.stop(ctx2.currentTime + 0.15);
        }, 100);
        break;
      case 'error':
        osc.frequency.value = 200;
        osc.type = 'sawtooth';
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        break;
    }
  } catch {}
}

export default function App() {
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

// ============ MINI BAR ============
function MiniBar() {
  const [state, setState] = useState<State>('idle');
  const [text, setText] = useState('');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const [levels, setLevels] = useState<number[]>(Array(20).fill(0));
  const [time, setTime] = useState(0);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [targetApp, setTargetApp] = useState('');
  const [micLevel, setMicLevel] = useState(0);

  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number>(0);
  const timerRef = useRef<any>(null);
  const processingTimeoutRef = useRef<any>(null);
  const startRef = useRef(0);
  const stateRef = useRef<State>(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    loadSettings();
    window.electronAPI.miniWindowReady?.();
    const unsubs = [
      window.electronAPI.onStartRecording(() => {
        if (wavRecorderRef.current || stateRef.current === 'recording' || stateRef.current === 'processing') return;
        startRec();
      }),
      window.electronAPI.onStopRecording(() => { if (wavRecorderRef.current) stopRec(); }),
      window.electronAPI.onTranscriptReady((d) => {
        if (processingTimeoutRef.current) { clearTimeout(processingTimeoutRef.current); processingTimeoutRef.current = null; }
        setText(d.cleaned || d.raw);
        setState('done');
        playSound('done');
        setTimeout(() => setState('idle'), 2500);
      }),
      window.electronAPI.onPartialTranscript((p) => setPartial(p)),
      window.electronAPI.onError((e) => { 
        if (processingTimeoutRef.current) { clearTimeout(processingTimeoutRef.current); processingTimeoutRef.current = null; }
        setError(e); setState('idle'); playSound('error'); setTimeout(() => setError(''), 3000); 
      }),
      window.electronAPI.onTargetAppChanged((appName) => setTargetApp(appName)),
    ];
    window.electronAPI.getTargetApp().then(setTargetApp).catch(() => {});
    return () => { unsubs.forEach((u) => u()); cancelAnimationFrame(animRef.current); if (timerRef.current) clearInterval(timerRef.current); if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current); };
  }, []);

  const loadSettings = async () => { try { setSettings(await window.electronAPI.getSettings()); } catch {} };

  const startRec = useCallback(async () => {
    if (wavRecorderRef.current || stateRef.current === 'recording' || stateRef.current === 'processing') return;
    try {
      const recorder = new WavRecorder({ sampleRate: 16000, channels: 1 });
      wavRecorderRef.current = recorder;
      await recorder.start(settings.selected_mic || undefined);
      const analyser = recorder.getAnalyserNode();
      if (analyser) analyserRef.current = analyser;
      startRef.current = Date.now();
      setState('recording');
      setPartial(''); setText(''); setTime(0);
      playSound('start');
      timerRef.current = setInterval(() => setTime(Date.now() - startRef.current), 200);
      const viz = () => {
        if (!analyserRef.current || !wavRecorderRef.current?.isRecording()) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        setLevels(Array.from(data).slice(0, 20).map((v) => Math.min(100, v * 1.5)));
        setMicLevel(Math.min(100, data.reduce((a, b) => a + b, 0) / data.length * 2));
        animRef.current = requestAnimationFrame(viz);
      };
      viz();
    } catch (err: any) {
      setError(err.name === 'NotAllowedError' ? 'Mic denied' : 'Mic not found');
      playSound('error'); setTimeout(() => setError(''), 3000);
    }
  }, [settings]);

  const stopRec = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animRef.current);
    analyserRef.current = null;
    setMicLevel(0);
    setState('processing');
    playSound('stop');
    if (wavRecorderRef.current) {
      try {
        const { buffer, duration } = await wavRecorderRef.current.stop();
        wavRecorderRef.current = null;
        window.electronAPI.sendAudioData({ buffer: Array.from(new Uint8Array(buffer)), mimeType: 'audio/wav', duration });
        processingTimeoutRef.current = setTimeout(() => { if (stateRef.current === 'processing') { setError('Timeout'); setState('idle'); playSound('error'); setTimeout(() => setError(''), 3000); } }, 25000);
      } catch { setState('idle'); }
    }
  }, []);

  const toggle = useCallback(() => { state === 'recording' ? stopRec() : (state === 'idle' || state === 'done') && startRec(); }, [state, startRec, stopRec]);
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };
  const langs = [{ c: 'auto', f: '🌐' }, { c: 'id', f: '🇮🇩' }, { c: 'en', f: '🇺🇸' }, { c: 'ja', f: '🇯🇵' }, { c: 'ko', f: '🇰🇷' }, { c: 'zh', f: '🇨🇳' }];

  return (
    <div className="mini-app">
      <div className={`mini-bar ${state}`} onMouseEnter={() => state === 'idle' && setState('hover')} onMouseLeave={() => state === 'hover' && setState('idle')}>
        <button className="m-close" onClick={() => window.electronAPI.quitApp()} title="Quit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <button className="m-expand" onClick={() => window.electronAPI.showMain()} title="Open">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </button>
        {state === 'idle' && (
          <div className="m-idle">
            {text ? (
              <>
                <button className="m-act" onClick={async () => { const r = await window.electronAPI.copyText(text); if (r.success) setText(''); }} title="Copy">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button className="m-act accent" onClick={async () => { const r = await window.electronAPI.pasteText(text); if (r.success) setText(''); }} title="Paste">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
                </button>
              </>
            ) : (
              <input className="m-inp" placeholder="Type or speak..." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={async (e) => { if (e.key === 'Enter' && text) { const r = await window.electronAPI.pasteText(text); if (r.success) setText(''); } }} />
            )}
            <button className="m-mic" onClick={toggle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            </button>
          </div>
        )}
        {state === 'hover' && (
          <div className="m-hover">
            <button className="m-tbtn" onClick={async () => { const langOrder = ['auto', 'id', 'en', 'ja', 'ko', 'zh']; const current = settings.language || 'id'; const next = langOrder[(langOrder.indexOf(current) + 1) % langOrder.length]; await window.electronAPI.updateSetting('language', next); setSettings(prev => ({ ...prev, language: next })); }}>
              <span>{langs.find((l) => l.c === (settings.language || 'id'))?.f}</span>
            </button>
            <button className="m-tbtn primary" onClick={toggle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
            </button>
            {text && (
              <button className="m-tbtn" onClick={async () => { const r = await window.electronAPI.copyText(text); if (r.success) setText(''); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            )}
          </div>
        )}
        {state === 'recording' && (
          <div className="m-rec">
            <button className="m-stop" onClick={toggle}><div className="m-sq" /></button>
            <div className="m-viz">{levels.map((l, i) => <div key={i} className="m-vb" style={{ height: `${Math.max(4, l)}%` }} />)}</div>
            <div className="m-info"><div className="m-dot" /><span className="m-time">{fmt(time)}</span><div className="m-mic-level"><div className="m-mic-bar" style={{ width: `${micLevel}%` }} /></div></div>
          </div>
        )}
        {state === 'processing' && (<div className="m-proc"><div className="m-spin" /><span>Processing...</span></div>)}
        {state === 'done' && (<div className="m-done"><span className="m-chk">✓</span><span>Pasted!</span></div>)}
      </div>
      {partial && state === 'recording' && <div className="m-partial">{partial}</div>}
      {error && <div className="m-err">{error}</div>}
      {state === 'recording' && targetApp && <div className="m-target">→ {targetApp.length > 20 ? targetApp.substring(0, 20) + '...' : targetApp}</div>}
    </div>
  );
}

// ============ MAIN APP ============
function MainApp() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => { try { setSettings(await window.electronAPI.getSettings()); } catch {} };

  const showSuccess = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const navItems: { id: Page; icon: React.ReactNode; label: string }[] = [
    { id: 'home', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>, label: 'Record' },
    { id: 'models', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>, label: 'Models' },
    { id: 'history', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label: 'History' },
    { id: 'settings', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, label: 'Settings' },
  ];

  return (
    <div className="app-layout">
      {/* Title Bar */}
      <div className="title-bar">
        <div className="title-bar-drag">
          <div className="title-bar-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
            <span>VoiceFlow</span>
          </div>
        </div>
        <div className="title-bar-controls">
          <button className="title-btn minimize" onClick={() => window.electronAPI.minimizeWindow()} title="Minimize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button className="title-btn maximize" onClick={() => window.electronAPI.maximizeWindow()} title="Maximize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="5" width="14" height="14" rx="1"/></svg>
          </button>
          <button className="title-btn close" onClick={() => window.electronAPI.quitApp()} title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
                <span className="nav-icon">{item.icon}</span>
                {sidebarOpen && <span className="nav-label">{item.label}</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button className="nav-item" onClick={() => setSidebarOpen(!sidebarOpen)} title={sidebarOpen ? 'Collapse' : 'Expand'}>
              <span className="nav-icon">
                {sidebarOpen ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="11 17 6 12 11 7"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                )}
              </span>
              {sidebarOpen && <span className="nav-label">Collapse</span>}
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="content">
          {currentPage === 'home' && <HomePage settings={settings} onSuccess={showSuccess} />}
          {currentPage === 'models' && <Models onSuccess={showSuccess} />}
          {currentPage === 'history' && <History onSuccess={showSuccess} />}
          {currentPage === 'settings' && <Settings onSuccess={showSuccess} />}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div className="toast">
          <span className="toast-icon">✓</span>
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

// ============ HOME PAGE ============
function HomePage({ settings, onSuccess }: { settings: Record<string, string>; onSuccess: (msg: string) => void }) {
  const [state, setState] = useState<State>('idle');
  const [text, setText] = useState('');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const [levels, setLevels] = useState<number[]>(Array(30).fill(0));
  const [time, setTime] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<any>(null);
  const [fuzzyChanges, setFuzzyChanges] = useState<number>(0);
  const [rawText, setRawText] = useState<string>('');

  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number>(0);
  const timerRef = useRef<any>(null);
  const processingTimeoutRef = useRef<any>(null);
  const startRef = useRef(0);
  const stateRef = useRef<State>(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const unsubs = [
      window.electronAPI.onTranscriptReady((d) => {
        if (processingTimeoutRef.current) { clearTimeout(processingTimeoutRef.current); processingTimeoutRef.current = null; }
        const result = d.cleaned || d.raw;
        setText(result);
        setConfidence(d.confidence || null);
        setFuzzyChanges(d.fuzzyChanges || 0);
        setRawText(d.rawText || '');
        setHistory(prev => [result, ...prev].slice(0, 10));
        setState('done');
        playSound('done');
        setTimeout(() => setState('idle'), 2000);
      }),
      window.electronAPI.onPartialTranscript((p) => setPartial(p)),
      window.electronAPI.onError((e) => { 
        if (processingTimeoutRef.current) { clearTimeout(processingTimeoutRef.current); processingTimeoutRef.current = null; }
        setError(e); setState('idle'); playSound('error'); setTimeout(() => setError(''), 3000); 
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const startRec = useCallback(async () => {
    if (wavRecorderRef.current || stateRef.current === 'recording' || stateRef.current === 'processing') return;
    try {
      const recorder = new WavRecorder({ sampleRate: 16000, channels: 1 });
      wavRecorderRef.current = recorder;
      await recorder.start(settings.selected_mic || undefined);
      const analyser = recorder.getAnalyserNode();
      if (analyser) analyserRef.current = analyser;
      startRef.current = Date.now();
      setState('recording');
      setPartial(''); setTime(0);
      playSound('start');
      timerRef.current = setInterval(() => setTime(Date.now() - startRef.current), 100);
      const viz = () => {
        if (!analyserRef.current || !wavRecorderRef.current?.isRecording()) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        setLevels(Array.from(data).slice(0, 30).map((v) => Math.min(100, v * 1.8)));
        animRef.current = requestAnimationFrame(viz);
      };
      viz();
    } catch (err: any) {
      setError(err.name === 'NotAllowedError' ? 'Microphone access denied' : 'Microphone not found');
      playSound('error'); setTimeout(() => setError(''), 3000);
    }
  }, [settings]);

  const stopRec = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animRef.current);
    analyserRef.current = null;
    setState('processing');
    playSound('stop');
    if (wavRecorderRef.current) {
      try {
        const { buffer, duration } = await wavRecorderRef.current.stop();
        wavRecorderRef.current = null;
        window.electronAPI.sendAudioData({ buffer: Array.from(new Uint8Array(buffer)), mimeType: 'audio/wav', duration });
        processingTimeoutRef.current = setTimeout(() => { if (stateRef.current === 'processing') { setError('Processing timeout'); setState('idle'); playSound('error'); setTimeout(() => setError(''), 3000); } }, 30000);
      } catch { setState('idle'); }
    }
  }, []);

  const toggle = useCallback(() => { state === 'recording' ? stopRec() : (state === 'idle' || state === 'done') && startRec(); }, [state, startRec, stopRec]);
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };

  return (
    <div className="page home-page">
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
            {state === 'processing' && <span className="processing-text">Processing audio...</span>}
            {state === 'done' && <span className="done-text">✓ Complete</span>}
          </div>
        </div>

        {/* Visualizer */}
        {state === 'recording' && (
          <div className="visualizer">
            {levels.map((l, i) => <div key={i} className="viz-bar" style={{ height: `${Math.max(4, l)}%` }} />)}
          </div>
        )}

        {/* Partial */}
        {partial && state === 'recording' && (
          <div className="partial-box">
            <div className="partial-label">Listening...</div>
            <p>{partial}</p>
          </div>
        )}

        {/* Result */}
        {text && state !== 'recording' && (
          <div className="result-box">
            <p>{text}</p>
            
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
                    <span>✨ {fuzzyChanges} words auto-corrected</span>
                  </div>
                )}
                {confidence.suggestions && confidence.suggestions.length > 0 && (
                  <div className="suggestions">
                    {confidence.suggestions.slice(0, 2).map((s: string, i: number) => (
                      <div key={i} className="suggestion-item">💡 {s}</div>
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
        {error && <div className="error-box">⚠️ {error}</div>}

        {/* Recent */}
        {history.length > 0 && (
          <div className="recent-section">
            <h3>Recent</h3>
            {history.slice(0, 3).map((item, i) => (
              <div key={i} className="recent-item" onClick={() => setText(item)}>
                {item.length > 50 ? item.substring(0, 50) + '...' : item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
