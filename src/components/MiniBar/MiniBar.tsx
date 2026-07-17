/**
 * MiniBar — Horizontal floating bar for recording.
 * Renders when `#mini` hash is present and orientation is horizontal.
 * 
 * For vertical mode, see VerticalMiniBar.tsx
 */
import React, { useState, useEffect, useRef } from 'react';
import { useRecorder } from '../../hooks/useRecorder';
import { playSound } from '../../utils/soundEffects';
import { getLanguageByCode, getNextLanguage } from '../../utils/languages';
import { MINI_BAR_BASE_HEIGHT, MINI_BAR_BASE_WIDTH, MINI_BAR_MIN_HEIGHT, MINI_BAR_MAX_HEIGHT, WAVEFORM_POINTS } from '../../utils/constants';
import { findBestMic, filterRealMics } from '../../utils/micDetector';
import { logError, logWarning } from '../../utils/errorHandler';
import VerticalMiniBar from '../VerticalMiniBar';

type State = 'idle' | 'hover' | 'recording' | 'processing' | 'done';

interface MiniBarProps {
  /** Initial settings loaded from database */
  initialSettings?: Record<string, string>;
}

export default function MiniBar({ initialSettings = {} }: MiniBarProps) {
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings);
  const [targetApp, setTargetApp] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const [barHover, setBarHover] = useState(false);
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  const [gpuStatus, setGpuStatus] = useState<string | null>(null);
  const [windowHeight, setWindowHeight] = useState(64);
  const [windowWidth, setWindowWidth] = useState(460);
  const [warmupStatus, setWarmupStatus] = useState<{ ready: boolean; model: string; gpuAvailable: boolean }>({ ready: false, model: '', gpuAvailable: false });
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
  const smoothLevels = useRef<number[]>(Array(WAVEFORM_POINTS).fill(0));
  const prevStateRef = useRef<State>('idle');
  const resizeTimerRef = useRef<any>(null);
  const debounceRef = useRef<any>(null);
  const skipResizeRef = useRef(false);

  // Calculate zoom based on window height
  const miniZoom = windowHeight / MINI_BAR_BASE_HEIGHT;

  // Listen for window resize to update zoom scale
  useEffect(() => {
    const handleResize = () => {
      if (skipResizeRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (skipResizeRef.current) return;
        const h = Math.min(MINI_BAR_MAX_HEIGHT, Math.max(MINI_BAR_MIN_HEIGHT, window.innerHeight));
        const w = window.innerWidth;
        setWindowHeight(h);
        setWindowWidth(w);
        // Skip horizontal resize logic if window is in vertical orientation
        if (window.innerHeight > window.innerWidth * 2) return;
        // Ensure window width fits the zoomed content
        const minW = Math.round(MINI_BAR_BASE_WIDTH * (h / MINI_BAR_BASE_HEIGHT));
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
    window.electronAPI.getTargetApp().then(setTargetApp).catch((err) => logWarning('MiniBar', 'Failed to get target app', err));

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
    }).catch((err) => logWarning('MiniBar', 'Failed to get GPU status', err));
    
    // Check warmup status (query existing state)
    window.electronAPI.getWarmupStatus().then(setWarmupStatus).catch(() => {});
    // Subscribe to warmup-complete event (for real-time updates)
    const unsubWarmup = window.electronAPI.onWarmupComplete?.(setWarmupStatus);
    unsubs.push(unsubWarmup || (() => {}));

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

        // Auto-detect: find best working mic (filters virtual devices, tests audio level)
        if (s.selected_mic) {
          // Verify current selection still works
          findBestMic(s.selected_mic).then(best => {
            if (best.deviceId && best.deviceId !== s.selected_mic) {
              window.electronAPI.updateSetting('selected_mic', best.deviceId)
                .catch((err) => logWarning('MiniBar', 'Failed to save mic selection', err));
              setSettings(prev => ({ ...prev, selected_mic: best.deviceId }));
            }
          }).catch((err) => logWarning('MiniBar', 'Failed to verify mic', err));
        } else {
          // No mic selected — auto-detect best one
          findBestMic().then(best => {
            if (best.deviceId) {
              window.electronAPI.updateSetting('selected_mic', best.deviceId)
                .catch((err) => logWarning('MiniBar', 'Failed to save mic selection', err));
              setSettings(prev => ({ ...prev, selected_mic: best.deviceId }));
            }
          }).catch((err) => logWarning('MiniBar', 'Failed to auto-detect mic', err));
        }
      } catch (err) {
        console.warn('[MiniBar] Mic preflight failed:', err);
      }
    } catch (err) { console.warn('[MiniBar] Failed to load settings:', err); } 
  };

  // Save zoom to settings when it changes
  useEffect(() => {
    if (windowHeight !== 64) {
      window.electronAPI.updateSetting('mini_bar_scale', String(miniZoom))
        .catch((err) => logWarning('MiniBar', 'Failed to save zoom scale', err));
    }
  }, [miniZoom]);

  // Canvas visualization effect
  useEffect(() => {
    if (state !== 'recording') {
      smoothLevels.current = Array(WAVEFORM_POINTS).fill(0);
      return;
    }
    const POINTS = WAVEFORM_POINTS;
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
        const freqPeak = freq.slice(i * freqBucket, (i + 1) * freqBucket).reduce((m, v) => Math.max(m, v), 0) * 1.8;
        const ampPeak = amp.slice(i * ampBucket, (i + 1) * ampBucket).reduce((m, v) => Math.max(m, v), 0) * 2.0;
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
  const currentLang = getLanguageByCode(settings.language);
  const formatHotkey = (hk: string) => hk.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl').replace(/\+/g, ' + ');
  const hotkeyLabel = formatHotkey(settings.hotkey || 'CommandOrControl+Shift+Space');
  const cycleLanguage = async () => {
    const next = getNextLanguage(currentLang.code);
    setSettings(prev => ({ ...prev, language: next.code }));
    try {
      const result = await window.electronAPI.updateSetting('language', next.code);
      if (result?.success === false) setSettings(prev => ({ ...prev, language: currentLang.code }));
    } catch {
      setSettings(prev => ({ ...prev, language: currentLang.code }));
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
            <span className="m-lang-current">{currentLang.short}</span>
          </button>
        </div>

        {/* Warmup status indicator */}
        {warmupStatus.ready && (
          <div className="m-warmup-status" title={`Model: ${warmupStatus.model}${warmupStatus.gpuAvailable ? ' (GPU)' : ''}`}>
            <span className="m-warmup-dot ready" />
          </div>
        )}

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
      {gpuStatus && hasModel !== false && state !== 'recording' && (
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
