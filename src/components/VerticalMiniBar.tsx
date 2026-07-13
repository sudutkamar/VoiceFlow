import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRecorder } from '../hooks/useRecorder';
import { playSound } from '../utils/soundEffects';
import { LANGUAGES, getLanguageByCode, getNextLanguage } from '../utils/languages';

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

interface Props { settings: Record<string, string>; }

export default function VerticalMiniBar({ settings }: Props) {
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  const [gpuStatus, setGpuStatus] = useState<string | null>(null);
  const [localLang, setLocalLang] = useState(settings.language || 'auto');
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [isLight, setIsLight] = useState(document.documentElement.classList.contains('light-theme'));
  const prevStateRef = useRef<string>('idle');

  const recorder = useRecorder(settings, {
    onTranscript: (d: any) => {
      setText(d.cleaned || d.raw);
      setState('done');
      playSound('done');
      setTimeout(() => { if (stateRef.current === 'done') setState('idle'); }, 4000);
    },
    onPartial: (p: string) => setPartial(p),
    onError: (e: string) => {
      if (e === '__NO_SPEECH__') { setState('idle'); return; }
      setError(e); setState('idle'); playSound('error'); setTimeout(() => setError(''), 3000);
    },
  });

  const {
    state, setState, text, setText, partial, setPartial, error, setError,
    time, micLevel, setMicLevel, clipPeak, setClipPeak,
    analyserRef, animRef, wavRecorderRef, stateRef, processingTimeoutRef,
    startRec, stopRec, cancelRec, toggle,
  } = recorder;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothLevels = useRef<number[]>(Array(16).fill(0));

  const currentLang = getLanguageByCode(localLang);

  // Sync language from settings
  useEffect(() => { if (settings.language && settings.language !== localLang) setLocalLang(settings.language); }, [settings.language]);

  // Sync light theme
  useEffect(() => {
    const check = () => setIsLight(document.documentElement.classList.contains('light-theme'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // Zoom — responsive to window height
  const zoom = Math.max(0.65, Math.min(1.4, windowSize.h / 300));

  // Track window resize for zoom
  useEffect(() => {
    const onResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    const unsub = window.electronAPI.onMiniWindowResize?.((data) => {
      setWindowSize({ w: data.width, h: data.height });
    });
    return () => {
      window.removeEventListener('resize', onResize);
      unsub?.();
    };
  }, []);

  // Sound effects for recording state transitions
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (state === 'recording' && prev !== 'recording') playSound('start');
    else if (state === 'processing' && prev === 'recording') playSound('stop');
  }, [state]);

  // Canvas visualization effect
  useEffect(() => {
    if (state !== 'recording') {
      smoothLevels.current = Array(16).fill(0);
      return;
    }
    const N = 16;
    const draw = () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const r = c.getBoundingClientRect();
      if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
        c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); ctx.scale(dpr, dpr);
      }
      const w = r.width, h = r.height;
      ctx.clearRect(0, 0, w, h);
      const src = smoothLevels.current;
      const mid = h / 2, step = w / (N - 1);
      const avg = src.reduce((a, b) => a + b, 0) / N;
      const glow = Math.min(1, avg / 40);
      // Main wave — bright blue
      ctx.beginPath(); ctx.moveTo(0, mid - (src[0] / 100) * (mid - 2));
      for (let i = 1; i < N; i++) {
        const x0 = (i - 1) * step, x1 = i * step;
        ctx.bezierCurveTo((x0 + x1) / 2, mid - (src[i - 1] / 100) * (mid - 2), (x0 + x1) / 2, mid - (src[i] / 100) * (mid - 2), x1, mid - (src[i] / 100) * (mid - 2));
      }
      ctx.strokeStyle = `rgba(99,182,255,${0.85 + glow * 0.15})`; ctx.lineWidth = 2;
      ctx.shadowColor = `rgba(99,182,255,${0.5 + glow * 0.5})`; ctx.shadowBlur = 6 + glow * 8; ctx.stroke(); ctx.shadowBlur = 0;
      // Mirror wave — soft purple
      ctx.beginPath(); ctx.moveTo(0, mid + (src[0] / 100) * (mid - 2));
      for (let i = 1; i < N; i++) {
        const x0 = (i - 1) * step, x1 = i * step;
        ctx.bezierCurveTo((x0 + x1) / 2, mid + (src[i - 1] / 100) * (mid - 2), (x0 + x1) / 2, mid + (src[i] / 100) * (mid - 2), x1, mid + (src[i] / 100) * (mid - 2));
      }
      ctx.strokeStyle = `rgba(168,130,255,${0.4 + glow * 0.4})`; ctx.lineWidth = 1.2;
      ctx.shadowColor = `rgba(168,130,255,${0.3 + glow * 0.3})`; ctx.shadowBlur = 4 + glow * 6; ctx.stroke(); ctx.shadowBlur = 0;
    };
    const viz = () => {
      if (!analyserRef.current || !wavRecorderRef.current?.isRecording()) return;
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      const wave = new Uint8Array(analyserRef.current.fftSize);
      analyserRef.current.getByteFrequencyData(data);
      analyserRef.current.getByteTimeDomainData(wave);
      const freq = Array.from(data).slice(2, Math.max(3, Math.floor(data.length * 0.85)));
      const amp = Array.from(wave).map(v => Math.abs(v - 128) * 4.8);
      const fb = Math.max(1, Math.floor(freq.length / N));
      const ab = Math.max(1, Math.floor(amp.length / N));
      const raw = Array.from({ length: N }, (_, i) => {
        const f = freq.slice(i * fb, (i + 1) * fb).reduce((m, v) => Math.max(m, v), 0) * 1.55;
        const a = amp.slice(i * ab, (i + 1) * ab).reduce((m, v) => Math.max(m, v), 0);
        return Math.min(100, Math.max(4, f, a));
      });
      for (let i = 0; i < N; i++) smoothLevels.current[i] += (raw[i] - smoothLevels.current[i]) * 0.2;
      draw();
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setMicLevel(Math.min(100, avg * 2));
      setClipPeak(prev => Math.max(prev, avg > 80 ? 2 : avg > 60 ? 1 : 0));
      animRef.current = requestAnimationFrame(viz);
    };
    viz();
    return () => { cancelAnimationFrame(animRef.current); };
  }, [state]);

  // Initialization
  const loadSettings = useCallback(async () => {
    try {
      const s = await window.electronAPI.getSettings();
      window.voiceflowSoundEnabled = s.sound_effects !== 'false';
      if (s.language) setLocalLang(s.language);
      if (s.theme === 'light') document.documentElement.classList.add('light-theme');
      else document.documentElement.classList.remove('light-theme');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        stream.getTracks().forEach(t => t.stop());
        if (!s.selected_mic) {
          const devs = await navigator.mediaDevices.enumerateDevices();
          const m = devs.filter(d => d.kind === 'audioinput');
          if (m.length > 0 && m[0].deviceId) await window.electronAPI.updateSetting('selected_mic', m[0].deviceId).catch(() => {});
        }
      } catch {}
    } catch {}
  }, []);

  useEffect(() => {
    loadSettings();
    window.electronAPI.miniWindowReady?.();
    window.electronAPI.hasAnyModel().then(setHasModel).catch(() => setHasModel(null));
    window.electronAPI.getGpuStatus?.().then((s) => {
      if (s.hasGpu && !s.cudaDllsPresent) setGpuStatus('GPU');
      else setGpuStatus(null);
    }).catch(() => {});
    const unsubs = [
      window.electronAPI.onHotkeyRegistered?.(() => {}),
      window.electronAPI.onThemeChange?.((t: string) => {
        if (t === 'light') document.documentElement.classList.add('light-theme');
        else document.documentElement.classList.remove('light-theme');
      }),
      window.electronAPI.onReloadSettings?.(() => { loadSettings(); }),
    ];
    return () => { unsubs.forEach((u) => u()); };
  }, []);

  // F2 hotkey (component-specific)
  useEffect(() => {
    const h = async (e: KeyboardEvent) => {
      if (e.key === (settings?.mini_transcription_hotkey || 'F2') && e.location === 0) { e.preventDefault(); await toggle(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [toggle, settings?.mini_transcription_hotkey]);

  // Escape key cancel
  useEffect(() => {
    if (state !== 'recording') return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); cancelRec(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [state, cancelRec]);

  const cycleLanguage = useCallback(async () => {
    const next = getNextLanguage(currentLang.code);
    setLocalLang(next.code);
    try {
      const result = await window.electronAPI.updateSetting('language', next.code);
      if (result?.success === false) setLocalLang(currentLang.code);
    } catch { setLocalLang(currentLang.code); }
  }, [currentLang.code]);

  useEffect(() => {
    if (state === 'done' && text) { const t = setTimeout(() => setText(''), 5000); return () => clearTimeout(t); }
  }, [state, text]);

  const isRec = state === 'recording';
  const isDone = state === 'done';
  const isProc = state === 'processing';
  const isHov = state === 'hover';
  const isIdle = state === 'idle';

  // Build bar class name
  const barClass = [
    'vmb-bar',
    isLight ? 'vmb-light' : '',
    isRec ? 'vmb-recording' : '',
    isDone ? 'vmb-done' : '',
    isProc ? 'vmb-processing' : '',
    isHov ? 'vmb-hover' : '',
  ].filter(Boolean).join(' ');

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div
        className={barClass}
        style={{ zoom }}
        onMouseEnter={() => { if (isIdle) setState('hover'); }}
        onMouseLeave={() => { if (stateRef.current === 'hover') setState('idle'); }}
      >
        {/* ── TOP: Language + Indicators ── */}
        <div className="vmb-top">
          <button
            className="vmb-lang"
            onPointerDown={(e) => { e.stopPropagation(); cycleLanguage(); }}
            title={currentLang.label}
          >
            {currentLang.short}
          </button>

          {/* Canvas visualization (recording only) */}
          {isRec && (
            <canvas ref={canvasRef} className="vmb-canvas" />
          )}

          {/* GPU indicator */}
          {gpuStatus && !isRec && (
            <div className="vmb-gpu" title="GPU acceleration available">⚡</div>
          )}
        </div>

        {/* ── MIC BUTTON ── */}
        <button
          className="vmb-mic"
          onClick={toggle}
          disabled={isProc}
        >
          {/* Idle / hover — mic icon */}
          {(isIdle || isHov) && (
            <svg className="vmb-mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0v-6A3.5 3.5 0 0 0 12 2Z"/>
              <path d="M19 10.5v1a7 7 0 0 1-14 0v-1"/>
              <path d="M12 18.5V22"/>
            </svg>
          )}

          {/* Recording — dot + timer inside button */}
          {isRec && (
            <div className="vmb-recording-core">
              <span className="vmb-live-dot" />
              <span className="vmb-time">{fmt(time)}</span>
            </div>
          )}

          {/* Processing — spinner */}
          {isProc && (
            <div className="vmb-spinner" />
          )}

          {/* Done — checkmark */}
          {isDone && (
            <div className="vmb-done-core">✓</div>
          )}
        </button>

        {/* ── BOTTOM: Actions ── */}
        <div className="vmb-bottom">
          {/* Cancel (recording only) */}
          {isRec && (
            <button
              className="vmb-action vmb-cancel"
              onClick={(e) => { e.stopPropagation(); cancelRec(); }}
              title="Cancel (Esc)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}

          {/* Copy / Settings */}
          <button
            className={`vmb-action${text ? ' vmb-ready' : ''}`}
            disabled={isProc}
            onClick={async (e) => {
              e.stopPropagation();
              if (text) { const r = await window.electronAPI?.copyText(text); if (r?.success) { playSound('done'); setState('done'); setTimeout(() => setState('idle'), 900); } }
              else window.electronAPI?.showMain?.('settings');
            }}
            title={text ? 'Copy text' : 'Settings'}
          >
            {text ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 4V2"/><path d="M15 10v-2"/><path d="M12 7h6"/>
                <path d="m5 19 9.2-9.2a1.9 1.9 0 0 1 2.7 2.7L7.7 21.7a1.9 1.9 0 0 1-2.7-2.7Z"/><path d="m12.5 11.5 2 2"/>
              </svg>
            )}
          </button>

          {/* Paste / History */}
          <button
            className={`vmb-action${text ? ' vmb-ready' : ''}`}
            disabled={isProc}
            onClick={async (e) => {
              e.stopPropagation();
              if (text) { const r = await window.electronAPI?.pasteText(text); if (r?.success) setText(''); }
              else window.electronAPI?.showMain?.('history');
            }}
            title={text ? 'Paste text' : 'History'}
          >
            {text ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="5" rx="1.5"/><path d="M8 12h8"/><path d="M8 16h5"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v10A2.5 2.5 0 0 1 16.5 18H10l-4.4 3.2A.4.4 0 0 1 5 20.9Z"/>
                <path d="M9 8h6"/><path d="M9 12h4"/>
              </svg>
            )}
          </button>
        </div>

        {/* ── TOOLTIPS (right side) ── */}

        {/* Result */}
        {text && isDone && (
          <div
            className="vmb-tooltip vmb-tooltip-result"
            onClick={async () => { const r = await window.electronAPI?.copyText(text); if (r?.success) playSound('done'); }}
          >
            <div className="vmb-tooltip-label" style={{ color: 'var(--vmb-muted)' }}>RESULT</div>
            <div className="vmb-tooltip-content">
              {text.length > 80 ? text.substring(0, 80) + '...' : text}
            </div>
          </div>
        )}

        {/* Partial transcript */}
        {partial && isRec && (
          <div className="vmb-tooltip vmb-tooltip-partial">
            <div className="vmb-tooltip-label" style={{ color: '#4a9eff' }}>LISTENING</div>
            <div className="vmb-tooltip-content" style={{ color: 'var(--vmb-muted)' }}>
              {partial.length > 60 ? partial.substring(0, 60) + '...' : partial}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="vmb-tooltip vmb-tooltip-error">{error}</div>
        )}

        {/* No model warning */}
        {hasModel === false && !isRec && (
          <div
            className="vmb-tooltip vmb-tooltip-warning"
            onClick={() => window.electronAPI?.showMain?.('models')}
          >
            ↓ Download model
          </div>
        )}

        {/* GPU CTA */}
        {gpuStatus && hasModel !== false && !isRec && !isDone && (
          <div
            className="vmb-tooltip vmb-tooltip-gpu"
            onClick={() => window.electronAPI?.showMain?.('settings')}
          >
            GPU — install CUDA
          </div>
        )}
      </div>
    </div>
  );
}
