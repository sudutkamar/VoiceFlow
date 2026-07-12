import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRecorder } from '../hooks/useRecorder';
import { playSound } from '../utils/audio';

const LANGUAGES = [
  { c: 'auto', s: '🌐', l: 'Auto Detect' },
  { c: 'id', s: 'ID', l: 'Indonesia' },
  { c: 'en', s: 'EN', l: 'English' },
  { c: 'ja', s: 'JA', l: '日本語' },
  { c: 'ko', s: 'KO', l: '한국어' },
  { c: 'zh', s: 'ZH', l: '中文' },
];

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

  const langs = LANGUAGES;
  const currentLang = langs.find((l) => l.c === localLang) || langs[0];

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
      ctx.beginPath(); ctx.moveTo(0, mid - (src[0] / 100) * (mid - 2));
      for (let i = 1; i < N; i++) {
        const x0 = (i - 1) * step, x1 = i * step;
        ctx.bezierCurveTo((x0 + x1) / 2, mid - (src[i - 1] / 100) * (mid - 2), (x0 + x1) / 2, mid - (src[i] / 100) * (mid - 2), x1, mid - (src[i] / 100) * (mid - 2));
      }
      ctx.strokeStyle = `rgba(99,182,255,${0.85 + glow * 0.15})`; ctx.lineWidth = 2;
      ctx.shadowColor = `rgba(99,182,255,${0.5 + glow * 0.5})`; ctx.shadowBlur = 6 + glow * 8; ctx.stroke(); ctx.shadowBlur = 0;
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
    const idx = Math.max(0, langs.findIndex(l => l.c === currentLang.c));
    const next = langs[(idx + 1) % langs.length];
    setLocalLang(next.c);
    try {
      const result = await window.electronAPI.updateSetting('language', next.c);
      if (result?.success === false) setLocalLang(currentLang.c);
    } catch { setLocalLang(currentLang.c); }
  }, [currentLang.c]);

  useEffect(() => {
    if (state === 'done' && text) { const t = setTimeout(() => setText(''), 5000); return () => clearTimeout(t); }
  }, [state, text]);

  const isRec = state === 'recording';
  const isDone = state === 'done';
  const isProc = state === 'processing';
  const isHov = state === 'hover';
  const isIdle = state === 'idle';

  // ─── Color theme ───
  const accent = isLight ? '#3b82f6' : '#4a9eff';
  const accentGlow = isLight ? 'rgba(59,130,246,0.3)' : 'rgba(74,158,255,0.35)';
  const purpleAccent = '#7c5cff';
  const cardBg = isLight ? 'rgba(255,255,255,0.92)' : 'rgba(18,20,34,0.94)';
  const borderColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)';
  const textColor = isLight ? '#1e293b' : 'rgba(255,255,255,0.85)';
  const mutedColor = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)';
  const tooltipBg = isLight ? 'rgba(255,255,255,0.98)' : 'rgba(11,12,20,0.98)';
  const tooltipShadow = isLight ? '0 8px 24px rgba(0,0,0,0.1)' : '0 8px 32px rgba(0,0,0,0.5)';

  // ─── Bar inline style ───
  const isActiveState = isRec || isProc || isDone;

  // ─── JSX ───
  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <style>{`
        @keyframes vmbFadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes vmbSpin { to { transform:rotate(360deg); } }
        @keyframes vmbPulse { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.85)} }
        @keyframes vmbPopIn { from { transform:scale(0.5); opacity:0; } to { transform:scale(1); opacity:1; } }
        @keyframes vmbSlideDown { from { opacity:0; transform:translateY(-4px) scaleY(0.9); } to { opacity:1; transform:translateY(0) scaleY(1); } }
        @keyframes vmbBreathe {
          0%,100% { box-shadow: 0 0 12px ${accentGlow}, 0 0 0 0 rgba(124,92,255,0.15); }
          50% { box-shadow: 0 0 22px ${accentGlow}, 0 0 8px 2px rgba(124,92,255,0.15); }
        }
        @keyframes vmbGpuPulse { 0%,100%{opacity:0.4}50%{opacity:1} }
        @keyframes vmbSlideIn { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:translateX(0); } }
      `}</style>

      {/* Main vertical bar */}
      <div
        style={{
          zoom,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          width: 52, height: 'calc(100% - 12px)',
          padding: '10px 6px',
          gap: 4,
          borderRadius: 22,
          boxSizing: 'border-box',
          background: isActiveState
            ? (isRec
                ? `linear-gradient(180deg, ${cardBg}, ${cardBg})`
                : isDone
                  ? `linear-gradient(180deg, ${cardBg}, ${cardBg})`
                  : cardBg)
            : cardBg,
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          border: isRec
            ? `1px solid ${accent}44`
            : isDone
              ? `1px solid rgba(74,222,128,0.25)`
              : borderColor,
          boxShadow: isRec
            ? `0 4px 20px ${accentGlow}, 0 0 0 1px ${accent}11, ${isLight ? '0 1px 0 rgba(255,255,255,0.6) inset' : '0 1px 0 rgba(255,255,255,0.06) inset'}`
            : isDone
              ? `0 4px 16px rgba(74,222,128,0.15), 0 0 0 1px rgba(74,222,128,0.08), ${isLight ? '0 1px 0 rgba(255,255,255,0.6) inset' : '0 1px 0 rgba(255,255,255,0.06) inset'}`
              : isHov
                ? `0 8px 28px rgba(0,0,0,0.12), ${isLight ? '0 1px 0 rgba(255,255,255,0.7) inset' : '0 1px 0 rgba(255,255,255,0.08) inset'}`
                : `0 4px 16px rgba(0,0,0,0.06), ${isLight ? '0 1px 0 rgba(255,255,255,0.5) inset' : '0 1px 0 rgba(255,255,255,0.04) inset'}`,
          animation: isRec ? 'vmbBreathe 2s ease-in-out infinite' : 'none',
          userSelect: 'none',
          WebkitAppRegion: 'drag' as unknown as string,
          position: 'relative',
          transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'visible',
          cursor: 'default',
          zIndex: 10001,
        }}
        onMouseEnter={() => { if (isIdle) setState('hover'); }}
        onMouseLeave={() => { if (stateRef.current === 'hover') setState('idle'); }}
      >
        {/* ── TOP SECTION: Language + Indicators ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 2, width: '100%',
        }}>
          {/* Language selector */}
          <button
            style={{
              width: 32, height: 32, minWidth: 32, minHeight: 32,
              borderRadius: 12, padding: 0,
              background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
              border: 'none',
              color: textColor,
              cursor: 'pointer', outline: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitAppRegion: 'no-drag' as unknown as string,
              fontSize: 12, fontWeight: 700, lineHeight: 1,
              transition: 'all 0.2s ease',
            }}
            onPointerDown={(e) => { e.stopPropagation(); cycleLanguage(); }}
            title={currentLang.l}
          >
            {currentLang.s}
          </button>

          {/* Canvas visualization bar (visible only during recording) */}
          {isRec && (
            <canvas
              ref={canvasRef}
              style={{
                width: '100%', height: 32,
                borderRadius: 8,
                opacity: 0.85,
                animation: 'vmbFadeIn 0.3s ease',
              }}
            />
          )}

          {/* GPU indicator */}
          {gpuStatus && !isRec && (
            <div style={{
              width: 32, height: 32,
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 600,
              color: accent,
              background: isLight ? 'rgba(59,130,246,0.06)' : 'rgba(74,158,255,0.08)',
              border: `1px solid ${accent}22`,
              animation: 'vmbGpuPulse 3s ease-in-out infinite',
              fontFamily: 'monospace',
            }} title="GPU acceleration available">⚡</div>
          )}
        </div>

        {/* ── MIC BUTTON (centerpiece) ── */}
        <button
          style={{
            width: 46, height: 46, minWidth: 46, minHeight: 46,
            borderRadius: 99, padding: 0,
            border: 'none',
            cursor: isProc ? 'default' : 'pointer',
            outline: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitAppRegion: 'no-drag' as unknown as string,
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
            flexShrink: 0,
            background: isRec
              ? `linear-gradient(135deg, ${accent}, ${purpleAccent})`
              : isDone
                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                : isProc
                  ? (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)')
                  : `linear-gradient(135deg, ${accent}, ${purpleAccent})`,
            boxShadow: isRec
              ? `0 0 24px ${accentGlow}, 0 2px 8px rgba(0,0,0,0.2)`
              : isDone
                ? '0 0 18px rgba(74,222,128,0.25), 0 2px 8px rgba(0,0,0,0.15)'
                : isProc
                  ? 'none'
                  : `0 0 14px ${accentGlow}, 0 2px 6px rgba(0,0,0,0.15)`,
            color: isProc ? (isLight ? '#94a3b8' : 'rgba(255,255,255,0.4)') : '#fff',
            transform: isRec ? 'scale(1.05)' : 'scale(1)',
          }}
          onClick={toggle}
          disabled={isProc}
        >
          {/* Idle / hover — mic icon */}
          {(isIdle || isHov) && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, position: 'relative', zIndex: 2 }}>
              <path d="M12 2a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0v-6A3.5 3.5 0 0 0 12 2Z"/>
              <path d="M19 10.5v1a7 7 0 0 1-14 0v-1"/>
              <path d="M12 18.5V22"/>
            </svg>
          )}

          {/* Recording — timer + dot */}
          {isRec && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 1, position: 'relative', zIndex: 2,
            }}>
              <div style={{
                width: 5, height: 5,
                borderRadius: '50%',
                background: '#f87171',
                boxShadow: '0 0 8px rgba(248,113,113,0.7)',
                animation: 'vmbPulse 1s ease-in-out infinite',
              }} />
              <span style={{
                fontSize: 8, lineHeight: 1, letterSpacing: '0.3px',
                fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
                color: 'rgba(255,255,255,0.85)',
              }}>{fmt(time)}</span>
            </div>
          )}

          {/* Processing — spinner */}
          {isProc && (
            <div style={{
              width: 20, height: 20,
              border: `2px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}`,
              borderTopColor: accent,
              borderRadius: '50%',
              animation: 'vmbSpin 0.7s linear infinite',
              position: 'relative', zIndex: 2,
            }} />
          )}

          {/* Done — checkmark */}
          {isDone && (
            <div style={{
              width: 20, height: 20,
              background: 'rgba(255,255,255,0.2)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
              color: '#fff',
              position: 'relative', zIndex: 2,
              animation: 'vmbPopIn 0.2s ease',
            }}>✓</div>
          )}
        </button>

        {/* ── BOTTOM SECTION: Actions ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 4, width: '100%',
        }}>
          {/* Cancel (visible during recording) */}
          {isRec && (
            <button
              style={{
                width: 34, height: 34, minWidth: 34, minHeight: 34,
                borderRadius: 12, padding: 0,
                border: 'none',
                cursor: 'pointer', outline: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitAppRegion: 'no-drag' as unknown as string,
                background: isLight ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.12)',
                color: '#ef4444',
                transition: 'all 0.2s ease',
                animation: 'vmbFadeIn 0.2s ease',
              }}
              onClick={(e) => { e.stopPropagation(); cancelRec(); }}
              title="Cancel (Esc)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 14, height: 14 }}>
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}

          {/* Copy / Settings */}
          <button
            style={{
              width: 34, height: 34, minWidth: 34, minHeight: 34,
              borderRadius: 12, padding: 0,
              border: 'none',
              cursor: 'pointer', outline: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitAppRegion: 'no-drag' as unknown as string,
              background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
              color: textColor,
              transition: 'all 0.2s ease',
              opacity: isProc ? 0.4 : 1,
            }}
            onClick={async (e) => {
              e.stopPropagation();
              if (text) { const r = await window.electronAPI?.copyText(text); if (r?.success) { playSound('done'); setState('done'); setTimeout(() => setState('idle'), 900); } }
              else window.electronAPI?.showMain?.('settings');
            }}
            title={text ? 'Copy text' : 'Settings'}
          >
            {text ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <path d="M15 4V2"/><path d="M15 10v-2"/><path d="M12 7h6"/>
                <path d="m5 19 9.2-9.2a1.9 1.9 0 0 1 2.7 2.7L7.7 21.7a1.9 1.9 0 0 1-2.7-2.7Z"/><path d="m12.5 11.5 2 2"/>
              </svg>
            )}
          </button>

          {/* Paste / History */}
          <button
            style={{
              width: 34, height: 34, minWidth: 34, minHeight: 34,
              borderRadius: 12, padding: 0,
              border: 'none',
              cursor: 'pointer', outline: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitAppRegion: 'no-drag' as unknown as string,
              background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
              color: textColor,
              transition: 'all 0.2s ease',
              opacity: isProc ? 0.4 : 1,
            }}
            onClick={async (e) => {
              e.stopPropagation();
              if (text) { const r = await window.electronAPI?.pasteText(text); if (r?.success) setText(''); }
              else window.electronAPI?.showMain?.('history');
            }}
            title={text ? 'Paste text' : 'History'}
          >
            {text ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <path d="M16 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="5" rx="1.5"/><path d="M8 12h8"/><path d="M8 16h5"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v10A2.5 2.5 0 0 1 16.5 18H10l-4.4 3.2A.4.4 0 0 1 5 20.9Z"/>
                <path d="M9 8h6"/><path d="M9 12h4"/>
              </svg>
            )}
          </button>
        </div>

        {/* ── RIGHT-SIDE TOOLTIPS ── */}
        {/* Result tooltip */}
        {text && isDone && (
          <div
            style={{
              position: 'absolute', left: 'calc(100% + 8px)', top: '50%',
              transform: 'translateY(-50%)',
              maxWidth: 220, zIndex: 10000,
              background: tooltipBg, border: borderColor,
              borderRadius: 14, padding: '10px 14px',
              color: textColor,
              cursor: 'pointer',
              boxShadow: tooltipShadow,
              backdropFilter: 'blur(40px) saturate(150%)',
              WebkitBackdropFilter: 'blur(40px) saturate(150%)',
              animation: 'vmbSlideIn 0.25s ease',
              fontSize: 12, lineHeight: 1.4,
            }}
            onClick={async () => { const r = await window.electronAPI?.copyText(text); if (r?.success) playSound('done'); }}
          >
            <div style={{ color: mutedColor, fontSize: 8, marginBottom: 4, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              RESULT
            </div>
            <div style={{ color: textColor, wordBreak: 'break-word', fontSize: 11 }}>
              {text.length > 80 ? text.substring(0, 80) + '...' : text}
            </div>
          </div>
        )}

        {/* Partial transcript */}
        {partial && isRec && (
          <div
            style={{
              position: 'absolute', left: 'calc(100% + 8px)', top: '50%',
              transform: 'translateY(-50%)',
              maxWidth: 220, zIndex: 10000,
              background: tooltipBg,
              border: `1px solid ${accent}22`,
              borderRadius: 14, padding: '10px 14px',
              color: textColor,
              boxShadow: tooltipShadow,
              backdropFilter: 'blur(40px) saturate(150%)',
              WebkitBackdropFilter: 'blur(40px) saturate(150%)',
              animation: 'vmbSlideIn 0.25s ease',
              fontSize: 11, lineHeight: 1.4, fontStyle: 'italic',
            }}
          >
            <div style={{
              color: accent, fontSize: 8, marginBottom: 4,
              fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>
              LISTENING
            </div>
            <div style={{ color: mutedColor }}>
              {partial.length > 60 ? partial.substring(0, 60) + '...' : partial}
            </div>
          </div>
        )}

        {/* Error tooltip */}
        {error && (
          <div
            style={{
              position: 'absolute', left: 'calc(100% + 8px)', top: '50%',
              transform: 'translateY(-50%)',
              whiteSpace: 'nowrap', zIndex: 10000,
              background: 'rgba(239,68,68,0.9)',
              color: '#fff', padding: '8px 14px',
              borderRadius: 10, fontSize: 11, fontWeight: 500,
              boxShadow: '0 4px 16px rgba(239,68,68,0.3)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              animation: 'vmbFadeIn 0.2s ease',
            }}
          >{error}</div>
        )}

        {/* No model warning */}
        {hasModel === false && !isRec && (
          <div
            style={{
              position: 'absolute', left: 'calc(100% + 8px)', top: '50%',
              transform: 'translateY(-50%)',
              whiteSpace: 'nowrap', zIndex: 10000,
              background: isLight ? 'rgba(234,179,8,0.9)' : 'rgba(234,179,8,0.85)',
              color: isLight ? '#000' : '#000',
              padding: '8px 14px',
              borderRadius: 10, fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              animation: 'vmbFadeIn 0.2s ease',
            }}
            onClick={() => window.electronAPI?.showMain?.('models')}
          >
            ↓ Download model
          </div>
        )}

        {/* GPU CTA */}
        {gpuStatus && hasModel !== false && !isRec && !isDone && (
          <div
            style={{
              position: 'absolute', left: 'calc(100% + 8px)', top: 'calc(50% + 28px)',
              whiteSpace: 'nowrap', zIndex: 10000,
              background: tooltipBg, border: `1px solid ${accent}22`,
              borderRadius: 10, padding: '6px 12px',
              color: accent, fontSize: 9, fontWeight: 500,
              cursor: 'pointer',
              boxShadow: tooltipShadow,
              backdropFilter: 'blur(40px) saturate(150%)',
              WebkitBackdropFilter: 'blur(40px) saturate(150%)',
              animation: 'vmbSlideDown 0.3s ease',
              letterSpacing: '0.2px',
            }}
            onClick={() => window.electronAPI?.showMain?.('settings')}
          >
            GPU — install CUDA
          </div>
        )}
      </div>
    </div>
  );
}
