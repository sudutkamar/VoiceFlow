import React, { useState, useEffect, useCallback, useRef } from 'react';
import './styles/app.css';
import { WavRecorder } from './utils/wavRecorder';

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
      miniWindowReady: () => void;
      onStateChange: (callback: (state: string) => void) => () => void;
      onTranscriptReady: (callback: (data: any) => void) => () => void;
      onError: (callback: (error: string) => void) => () => void;
      onStartRecording: (callback: () => void) => () => void;
      onStopRecording: (callback: (duration: number) => void) => () => void;
      onPartialTranscript: (callback: (text: string) => void) => () => void;
    };
  }
}

type State = 'idle' | 'hover' | 'recording' | 'processing' | 'done';

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

// ============ MINI BAR (Floating) ============
function MiniBar() {
  const [state, setState] = useState<State>('idle');
  const [text, setText] = useState('');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const [levels, setLevels] = useState<number[]>(Array(20).fill(0));
  const [time, setTime] = useState(0);
  const [settings, setSettings] = useState<Record<string, string>>({});

  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number>(0);
  const timerRef = useRef<any>(null);
  const processingTimeoutRef = useRef<any>(null);
  const startRef = useRef(0);
  const stateRef = useRef<State>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    loadSettings();
    
    // Notify main process that mini window is ready
    window.electronAPI.miniWindowReady?.();
    
    const unsubs = [
      // Listen for hotkey-triggered recording
      window.electronAPI.onStartRecording(() => {
        if (stateRef.current !== 'recording' && stateRef.current !== 'processing') {
          startRec();
        }
      }),
      // Listen for hotkey-triggered stop. Stop if a recorder exists, even if React state is slightly behind.
      window.electronAPI.onStopRecording(() => {
        if (wavRecorderRef.current) {
          stopRec();
        }
      }),
      // Listen for transcription result
      window.electronAPI.onTranscriptReady((d) => {
        if (processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
          processingTimeoutRef.current = null;
        }
        setText(d.cleaned || d.raw);
        setState('done');
        setTimeout(() => setState('idle'), 2000);
      }),
      // Listen for partial transcripts
      window.electronAPI.onPartialTranscript((p) => {
        setPartial(p);
      }),
      // Listen for errors
      window.electronAPI.onError((e) => { 
        if (processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
          processingTimeoutRef.current = null;
        }
        setError(e); 
        setState('idle');
        setTimeout(() => setError(''), 3000); 
      }),
    ];
    
    return () => { 
      unsubs.forEach((u) => u()); 
      cancelAnimationFrame(animRef.current); 
      if (timerRef.current) clearInterval(timerRef.current);
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    };
  }, []);

  const loadSettings = async () => { 
    try { 
      setSettings(await window.electronAPI.getSettings()); 
    } catch {} 
  };

  const startRec = useCallback(async () => {
    if (wavRecorderRef.current || stateRef.current === 'recording' || stateRef.current === 'processing') return;
    try {
      const micId = settings.selected_mic || '';
      
      // Create WAV recorder
      const recorder = new WavRecorder({ sampleRate: 16000, channels: 1 });
      wavRecorderRef.current = recorder;
      
      // Start recording
      await recorder.start(micId || undefined);
      
      // Get analyser for visualization
      const analyser = recorder.getAnalyserNode();
      if (analyser) {
        analyserRef.current = analyser;
      }
      
      startRef.current = Date.now();
      setState('recording');
      setPartial('');
      setText('');
      setTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => setTime(Date.now() - startRef.current), 100);
      
      // Start visualization
      const viz = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        setLevels(Array.from(data).slice(0, 20).map((v) => Math.min(100, v * 1.5)));
        animRef.current = requestAnimationFrame(viz);
      };
      viz();
    } catch (err: any) {
      setError(err.name === 'NotAllowedError' ? 'Mic denied' : 'Mic not found');
      setTimeout(() => setError(''), 3000);
    }
  }, [settings]);

  const stopRec = useCallback(async () => {
    // Stop visualization
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animRef.current);
    analyserRef.current = null;
    
    setState('processing');
    
    // Get WAV data and send to main process
    if (wavRecorderRef.current) {
      try {
        const { buffer, duration } = await wavRecorderRef.current.stop();
        wavRecorderRef.current = null;
        
        // Send WAV data to main process for transcription
        window.electronAPI.sendAudioData({ 
          buffer: Array.from(new Uint8Array(buffer)), 
          mimeType: 'audio/wav', 
          duration 
        });

        processingTimeoutRef.current = setTimeout(() => {
          if (stateRef.current === 'processing') {
            setError('Processing timeout. Please try again.');
            setState('idle');
            setTimeout(() => setError(''), 3000);
          }
        }, 20000);
        
        // The state will be updated when we receive 'transcript-ready' or 'error' event
      } catch (err) {
        console.error('Error stopping recorder:', err);
        setState('idle');
      }
    }
  }, []);

  const toggle = useCallback(() => {
    if (state === 'recording') { 
      stopRec(); 
    } else if (state === 'idle' || state === 'done') { 
      startRec(); 
    }
  }, [state, startRec, stopRec]);

  const fmt = (ms: number) => { 
    const s = Math.floor(ms / 1000); 
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; 
  };

  const langs = [
    { c: 'auto', f: '🌐' }, { c: 'id', f: '🇮🇩' }, { c: 'en', f: '🇺🇸' },
    { c: 'ja', f: '🇯🇵' }, { c: 'ko', f: '🇰🇷' }, { c: 'zh', f: '🇨🇳' },
  ];

  return (
    <div className="mini-app">
      <div className={`mini-bar ${state}`} 
        onMouseEnter={() => state === 'idle' && setState('hover')} 
        onMouseLeave={() => state === 'hover' && setState('idle')}>
        
        {/* Close */}
        <button className="m-close" onClick={() => window.electronAPI.quitApp()} title="Quit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Expand */}
        <button className="m-expand" onClick={() => window.electronAPI.showMain()} title="Open">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
          </svg>
        </button>

        {/* IDLE */}
        {state === 'idle' && (
          <div className="m-idle">
            <input 
              className="m-inp" 
              placeholder="Type or speak..." 
              value={text} 
              onChange={(e) => setText(e.target.value)} 
              onKeyDown={async (e) => { 
                if (e.key === 'Enter' && text) { 
                  await navigator.clipboard.writeText(text); 
                  setText(''); 
                } 
              }} 
            />
            <button className="m-mic" onClick={toggle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
              </svg>
            </button>
          </div>
        )}

        {/* HOVER */}
        {state === 'hover' && (
          <div className="m-hover">
            <button className="m-tbtn" onClick={async () => {
              const langOrder = ['auto', 'id', 'en', 'ja', 'ko', 'zh'];
              const current = settings.language || 'id';
              const idx = langOrder.indexOf(current);
              const next = langOrder[(idx + 1) % langOrder.length];
              await window.electronAPI.updateSetting('language', next);
              setSettings(prev => ({ ...prev, language: next }));
            }}>
              <span>{langs.find((l) => l.c === (settings.language || 'id'))?.f}</span>
            </button>
            <button className="m-tbtn primary" onClick={toggle}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </button>
            <button className="m-tbtn" onClick={async () => {
              if (text) {
                await navigator.clipboard.writeText(text);
                setText('');
              }
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          </div>
        )}

        {/* RECORDING */}
        {state === 'recording' && (
          <div className="m-rec">
            <button className="m-stop" onClick={toggle}>
              <div className="m-sq" />
            </button>
            <div className="m-viz">
              {levels.map((l, i) => <div key={i} className="m-vb" style={{ height: `${Math.max(4, l)}%` }} />)}
            </div>
            <div className="m-info">
              <div className="m-dot" />
              <span className="m-time">{fmt(time)}</span>
            </div>
          </div>
        )}

        {/* PROCESSING */}
        {state === 'processing' && (
          <div className="m-proc">
            <div className="m-spin" />
            <span>Processing...</span>
          </div>
        )}

        {/* DONE */}
        {state === 'done' && (
          <div className="m-done">
            <span className="m-chk">✓</span>
            <span>Done!</span>
          </div>
        )}
      </div>

      {partial && state === 'recording' && <div className="m-partial">{partial}</div>}
      {error && <div className="m-err">{error}</div>}
    </div>
  );
}

// ============ MAIN APP (Full UI) ============
function MainApp() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [editingKey, setEditingKey] = useState(false);
  const [panel, setPanel] = useState<'main' | 'lang' | 'mic'>('main');

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => { 
    try { 
      setSettings(await window.electronAPI.getSettings()); 
    } catch {} 
  };
  
  const save = async (k: string, v: string) => { 
    await window.electronAPI.updateSetting(k, v); 
    setSettings((p) => ({ ...p, [k]: v })); 
  };
  
  const loadMics = async () => { 
    try { 
      await navigator.mediaDevices.getUserMedia({ audio: true }); 
      const d = await navigator.mediaDevices.enumerateDevices(); 
      setMics(d.filter((x) => x.kind === 'audioinput')); 
    } catch {} 
  };

  const fmtHotkey = (hk: string) => hk
    .replace('CommandOrControl', 'Ctrl')
    .replace('Control', 'Ctrl')
    .split('+')
    .map((k) => k.trim())
    .join('+');

  const handleKey = async (e: React.KeyboardEvent) => {
    e.preventDefault();
    const p: string[] = [];
    if (e.ctrlKey) p.push('Ctrl');
    if (e.altKey) p.push('Alt');
    if (e.shiftKey) p.push('Shift');
    if (e.metaKey) p.push('Super');
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      p.push(e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key);
    }
    if (p.length >= 2) { 
      const electronHotkey = p.join('+').replace('Ctrl', 'CommandOrControl');
      try {
        const result = await window.electronAPI.updateHotkey(electronHotkey);
        if (result.success) {
          setSettings((prev) => ({ ...prev, hotkey: electronHotkey }));
        } else {
          alert('Gagal mendaftarkan hotkey');
        }
      } catch (error) {
        console.error('Failed to update hotkey:', error);
      }
      setEditingKey(false); 
    }
  };

  const langs = [
    { c: 'auto', l: 'Auto Detect', f: '🌐' }, { c: 'id', l: 'Indonesia', f: '🇮🇩' }, { c: 'en', l: 'English', f: '🇺🇸' },
    { c: 'ja', l: '日本語', f: '🇯🇵' }, { c: 'ko', l: '한국어', f: '🇰🇷' }, { c: 'zh', l: '中文', f: '🇨🇳' },
  ];

  return (
    <div className="main-app">
      {/* Header */}
      <div className="header">
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
          </svg>
          <span>VoiceFlow</span>
        </div>
        <div className="header-btns">
          <button className="hdr-btn" onClick={() => window.electronAPI.minimizeToBar()} title="Minimize to bar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
            </svg>
          </button>
          <button className="hdr-btn close" onClick={() => window.electronAPI.quitApp()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="content">
        {panel === 'main' && (
          <div className="settings-list">
            {/* Mic */}
            <div className="card" onClick={() => { loadMics(); setPanel('mic'); }}>
              <div className="card-icon">🎤</div>
              <div className="card-info">
                <div className="card-title">Microphone</div>
                <div className="card-desc">
                  {mics.find((m) => m.deviceId === settings.selected_mic)?.label || 'Default Microphone'}
                </div>
              </div>
              <svg className="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>

            {/* Language */}
            <div className="card" onClick={() => setPanel('lang')}>
              <div className="card-icon">🌐</div>
              <div className="card-info">
                <div className="card-title">Language</div>
                <div className="card-desc">
                  {langs.find((l) => l.c === (settings.language || 'id'))?.l}
                </div>
              </div>
              <svg className="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>

            {/* Hotkey */}
            <div className="card">
              <div className="card-icon">⌨️</div>
              <div className="card-info">
                <div className="card-title">Hotkey</div>
                <div className="card-desc">
                  {editingKey ? (
                    <div className="hk-input" tabIndex={0} onKeyDown={handleKey} autoFocus>Press keys...</div>
                  ) : (
                    <span className="hk-display" onClick={() => setEditingKey(true)}>
                      {fmtHotkey(settings.hotkey || 'CommandOrControl+Shift+F9')}
                      <span className="hk-edit">Edit</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Toggles */}
            <div className="toggle-card">
              <span>Auto Paste</span>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={settings.auto_paste !== 'false'} 
                  onChange={(e) => save('auto_paste', String(e.target.checked))} 
                />
                <span className="slider" />
              </label>
            </div>
            <div className="toggle-card">
              <span>Text Cleanup</span>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={settings.cleanup_enabled !== 'false'} 
                  onChange={(e) => save('cleanup_enabled', String(e.target.checked))} 
                />
                <span className="slider" />
              </label>
            </div>
            <div className="toggle-card">
              <span>Remove Fillers</span>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={settings.remove_fillers !== 'false'} 
                  onChange={(e) => save('remove_fillers', String(e.target.checked))} 
                />
                <span className="slider" />
              </label>
            </div>
          </div>
        )}

        {panel === 'lang' && (
          <div className="select-list">
            {langs.map((l) => (
              <button 
                key={l.c} 
                className={`select-item ${(settings.language || 'id') === l.c ? 'active' : ''}`} 
                onClick={() => { save('language', l.c); setPanel('main'); }}
              >
                <span className="select-icon">{l.f}</span>
                <span>{l.l}</span>
                {(settings.language || 'id') === l.c && <span className="select-check">✓</span>}
              </button>
            ))}
          </div>
        )}

        {panel === 'mic' && (
          <div className="select-list">
            <button 
              className={`select-item ${!settings.selected_mic ? 'active' : ''}`} 
              onClick={() => { save('selected_mic', ''); setPanel('main'); }}
            >
              <span className="mic-indicator" />
              <span>Default Microphone</span>
            </button>
            {mics.map((m) => (
              <button 
                key={m.deviceId} 
                className={`select-item ${settings.selected_mic === m.deviceId ? 'active' : ''}`} 
                onClick={() => { save('selected_mic', m.deviceId); setPanel('main'); }}
              >
                <span className="mic-indicator" />
                <span>{m.label || `Mic ${m.deviceId.slice(0, 6)}`}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="footer">
        <span>VoiceFlow v0.1.0</span>
      </div>
    </div>
  );
}
