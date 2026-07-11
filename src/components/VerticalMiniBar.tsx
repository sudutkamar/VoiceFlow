import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WavRecorder } from '../utils/wavRecorder';
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

// Sound feedback — imported from shared utils/audio.ts

function useVad(analyserRef: React.MutableRefObject<AnalyserNode | null>, active: boolean, timeoutMs: number) {
  const [silenceDetected, setSilence] = useState(false);
  const silenceStart = useRef(0);
  const animRef = useRef(0);
  const hasDetectedAudio = useRef(false);
  useEffect(() => {
    if (!active) { setSilence(false); hasDetectedAudio.current = false; silenceStart.current = 0; return; }
    const loop = () => {
      const a = analyserRef.current;
      if (!a) { animRef.current = requestAnimationFrame(loop); return; }
      const data = new Uint8Array(a.frequencyBinCount);
      a.getByteFrequencyData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      if (rms >= 6) hasDetectedAudio.current = true;
      if (rms < 6) {
        if (!hasDetectedAudio.current) return;
        if (!silenceStart.current) silenceStart.current = Date.now();
        else if (Date.now() - silenceStart.current > timeoutMs) setSilence(true);
      } else { silenceStart.current = 0; setSilence(false); }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); silenceStart.current = 0; hasDetectedAudio.current = false; setSilence(false); };
  }, [active, timeoutMs]);
  return silenceDetected;
}

interface Props { settings: Record<string, string>; }

export default function VerticalMiniBar({ settings }: Props) {
  const [state, setState] = useState<string>('idle');
  const [text, setText] = useState('');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const [time, setTime] = useState(0);
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  const [localLang, setLocalLang] = useState(settings.language || 'auto');
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [isLight, setIsLight] = useState(document.documentElement.classList.contains('light-theme'));

  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothLevels = useRef<number[]>(Array(20).fill(0));
  const animRef = useRef<number>(0);
  const timerRef = useRef<any>(null);
  const processingTimeoutRef = useRef<any>(null);
  const startRef = useRef(0);
  const stateRef = useRef(state);

  const vadEnabled = settings.vad_enabled !== 'false';
  const vadSilenceMs = parseInt(settings.vad_silence_ms || '1500', 10);
  const silenceDetected = useVad(analyserRef, state === 'recording' && vadEnabled, vadSilenceMs);
  const langs = LANGUAGES;
  const currentLang = langs.find((l) => l.c === localLang) || langs[0];

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { if (silenceDetected && stateRef.current === 'recording') stopRec(); }, [silenceDetected]);
  useEffect(() => { if (settings.language && settings.language !== localLang) setLocalLang(settings.language); }, [settings.language]);

  // Sync light theme
  useEffect(() => {
    const check = () => setIsLight(document.documentElement.classList.contains('light-theme'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // Zoom — responsive to window resize
  const zoom = Math.max(0.6, Math.min(1.5, windowSize.h / 280));

  // Track window resize for zoom
  useEffect(() => {
    const onResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    // Also listen for Electron main process resize events
    const unsub = window.electronAPI.onMiniWindowResize?.((data) => {
      setWindowSize({ w: data.width, h: data.height });
    });
    return () => {
      window.removeEventListener('resize', onResize);
      unsub?.();
    };
  }, []);

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
    const unsubs = [
      window.electronAPI.onStartRecording(() => {
        if (wavRecorderRef.current || stateRef.current === 'recording' || stateRef.current === 'processing') return;
        startRec();
      }),
      window.electronAPI.onStopRecording(() => { if (wavRecorderRef.current) stopRec(); }),
      window.electronAPI.onTranscriptReady((d: any) => {
        if (processingTimeoutRef.current) { clearTimeout(processingTimeoutRef.current); processingTimeoutRef.current = null; }
        setText(d.cleaned || d.raw); setState('done'); playSound('done');
        setTimeout(() => { if (stateRef.current === 'done') setState('idle'); }, 4000);
      }),
      window.electronAPI.onPartialTranscript((p: string) => setPartial(p)),
      window.electronAPI.onError((e: string) => {
        if (processingTimeoutRef.current) { clearTimeout(processingTimeoutRef.current); processingTimeoutRef.current = null; }
        if (e === '__NO_SPEECH__') { setState('idle'); return; }
        setError(e); setState('idle'); playSound('error'); setTimeout(() => setError(''), 3000);
      }),
      window.electronAPI.onHotkeyRegistered?.(() => {}),
      window.electronAPI.onThemeChange?.((t: string) => {
        if (t === 'light') document.documentElement.classList.add('light-theme');
        else document.documentElement.classList.remove('light-theme');
      }),
      window.electronAPI.onReloadSettings?.(() => { loadSettings(); }),
    ];
    return () => {
      unsubs.forEach((u) => u());
      cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    };
  }, []);

  const startRec = useCallback(async () => {
    if (wavRecorderRef.current || stateRef.current === 'recording' || stateRef.current === 'processing') return;
    try {
      const rec = new WavRecorder();
      wavRecorderRef.current = rec;
      await rec.start(settings.selected_mic || undefined, { enabled: true, silenceThreshold: 0.01, silenceDurationMs: 3000 });
      rec.onSilence(() => { if (stateRef.current === 'recording') stopRec(); });
      const a = rec.getAnalyserNode();
      if (a) analyserRef.current = a;
      startRef.current = Date.now();
      setState('recording'); setPartial(''); setTime(0); playSound('start');
      timerRef.current = setInterval(() => setTime(Date.now() - startRef.current), 200);
      const N = 20;
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
        ctx.beginPath(); ctx.moveTo(0, mid - (src[0] / 100) * (mid - 1));
        for (let i = 1; i < N; i++) {
          const x0 = (i - 1) * step, x1 = i * step;
          ctx.bezierCurveTo((x0 + x1) / 2, mid - (src[i - 1] / 100) * (mid - 1), (x0 + x1) / 2, mid - (src[i] / 100) * (mid - 1), x1, mid - (src[i] / 100) * (mid - 1));
        }
        ctx.strokeStyle = `rgba(99,182,255,${0.9 + glow * 0.1})`; ctx.lineWidth = 1.5;
        ctx.shadowColor = `rgba(99,182,255,${0.5 + glow * 0.5})`; ctx.shadowBlur = 4 + glow * 6; ctx.stroke(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(0, mid + (src[0] / 100) * (mid - 1));
        for (let i = 1; i < N; i++) {
          const x0 = (i - 1) * step, x1 = i * step;
          ctx.bezierCurveTo((x0 + x1) / 2, mid + (src[i - 1] / 100) * (mid - 1), (x0 + x1) / 2, mid + (src[i] / 100) * (mid - 1), x1, mid + (src[i] / 100) * (mid - 1));
        }
        ctx.strokeStyle = `rgba(168,130,255,${0.4 + glow * 0.4})`; ctx.lineWidth = 1;
        ctx.shadowColor = `rgba(168,130,255,${0.3 + glow * 0.3})`; ctx.shadowBlur = 3 + glow * 5; ctx.stroke(); ctx.shadowBlur = 0;
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
          const f = freq.slice(i * fb, (i + 1) * fb).reduce((m, v) => Math.max(m, v), 0) * 1.5;
          const a = amp.slice(i * ab, (i + 1) * ab).reduce((m, v) => Math.max(m, v), 0);
          return Math.min(100, Math.max(3, f, a));
        });
        for (let i = 0; i < N; i++) smoothLevels.current[i] += (raw[i] - smoothLevels.current[i]) * 0.2;
        draw();
        animRef.current = requestAnimationFrame(viz);
      };
      viz();
    } catch (err: any) {
      let msg = 'Mic error';
      if (err.name === 'NotAllowedError') msg = 'Mic access denied';
      else if (err.name === 'NotReadableError') msg = 'Mic in use';
      else if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
        msg = 'Mic not found'; window.electronAPI.updateSetting('selected_mic', '').catch(() => {});
      } else if (err.message) msg = err.message.substring(0, 50);
      setError(msg); playSound('error'); setTimeout(() => setError(''), 4000);
    }
  }, [settings]);

  const stopRec = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animRef.current); analyserRef.current = null;
    setState('processing'); playSound('stop');
    if (wavRecorderRef.current) {
      try {
        const { buffer, duration } = await wavRecorderRef.current.stop();
        wavRecorderRef.current = null;
        window.electronAPI.sendAudioData({ buffer: new Uint8Array(buffer) as any, mimeType: 'audio/wav', duration });
        processingTimeoutRef.current = setTimeout(() => {
          if (stateRef.current === 'processing') { setError('Timeout'); setState('idle'); playSound('error'); setTimeout(() => setError(''), 3000); }
        }, 25000);
      } catch { setState('idle'); }
    }
  }, []);

  const cancelRec = useCallback(async () => {
    if (stateRef.current === 'processing') { setState('idle'); setPartial(''); if (processingTimeoutRef.current) { clearTimeout(processingTimeoutRef.current); processingTimeoutRef.current = null; } return; }
    if (stateRef.current !== 'recording') return;
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animRef.current); analyserRef.current = null;
    if (wavRecorderRef.current) { try { await wavRecorderRef.current.cancel(); } catch {} wavRecorderRef.current = null; }
    setState('idle'); setPartial('');
  }, []);

  const toggle = useCallback(() => {
    if (state === 'recording') stopRec();
    else if (state === 'idle' || state === 'hover') startRec();
  }, [state, startRec, stopRec]);

  useEffect(() => {
    const h = async (e: KeyboardEvent) => {
      if (e.key === (settings?.mini_transcription_hotkey || 'F2') && e.location === 0) { e.preventDefault(); await toggle(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [toggle, settings?.mini_transcription_hotkey]);

  useEffect(() => {
    if (state !== 'recording') return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); cancelRec(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [state, cancelRec]);

  useEffect(() => {
    const unsub = window.electronAPI.onCancelRecording?.(() => { if (stateRef.current === 'recording') cancelRec(); });
    return () => { unsub?.(); };
  }, [cancelRec]);

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

  // ---- THEME COLORS ----
  const t = isLight ? {
    barBg: 'linear-gradient(180deg, rgba(255,255,255,0.6), transparent 28%, transparent 72%, rgba(255,255,255,0.3)), radial-gradient(circle at 50% 18%, rgba(59,130,246,0.15), transparent 30px), linear-gradient(135deg, rgba(248,250,252,0.95), rgba(241,245,249,0.98))',
    barBorder: '1px solid rgba(0,0,0,0.04)',
    barShadow: '0 10px 30px rgba(0,0,0,0.08), 0 1px 0 rgba(255,255,255,0.8) inset',
    barHoverBorder: '1px solid rgba(0,0,0,0.06)',
    barHoverShadow: '0 14px 36px rgba(0,0,0,0.1), 0 1px 0 rgba(255,255,255,0.9) inset',
    btnBg: 'rgba(255,255,255,0.8)',
    btnBorder: '1px solid rgba(0,0,0,0.08)',
    btnColor: '#475569',
    btnHoverBg: 'rgba(255,255,255,0.95)',
    btnHoverBorder: '1px solid rgba(59,130,246,0.2)',
    btnHoverColor: '#2563eb',
    micBg: 'linear-gradient(135deg, #3b82f6, #7c5cff)',
    micColor: 'white',
    stopBg: '#ef4444',
    stopColor: 'white',
    glassInner: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, transparent 40%), linear-gradient(0deg, rgba(0,0,0,0.03) 0%, transparent 30%)',
    tooltipBg: 'rgba(255,255,255,0.98)',
    tooltipBorder: '1px solid rgba(0,0,0,0.1)',
    tooltipShadow: '0 12px 32px rgba(0,0,0,0.12)',
    tooltipColor: '#1e293b',
    tooltipMuted: 'rgba(0,0,0,0.4)',
    tooltipSub: 'rgba(0,0,0,0.55)',
    shine: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
  } : {
    barBg: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.04) 70%, rgba(255,255,255,0.08) 100%), radial-gradient(ellipse at 50% 20%, rgba(74,158,255,0.08), transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(167,139,250,0.05), transparent 50%), linear-gradient(135deg, rgba(12,14,24,0.97), rgba(20,22,38,0.99))',
    barBorder: '1px solid rgba(255,255,255,0.06)',
    barShadow: '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.18) inset, 0 -1px 0 rgba(0,0,0,0.3) inset',
    barHoverBorder: '1px solid rgba(255,255,255,0.1)',
    barHoverShadow: '0 12px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.18) inset, 0 -1px 0 rgba(0,0,0,0.3) inset',
    btnBg: 'rgba(255,255,255,0.055)',
    btnBorder: '1px solid rgba(255,255,255,0.08)',
    btnColor: 'rgba(255,255,255,0.4)',
    btnHoverBg: 'rgba(255,255,255,0.1)',
    btnHoverBorder: '1px solid rgba(255,255,255,0.15)',
    btnHoverColor: 'rgba(255,255,255,0.7)',
    micBg: 'linear-gradient(135deg, #4a9eff, #7c5cff)',
    micColor: 'white',
    stopBg: '#ef4444',
    stopColor: 'white',
    glassInner: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 40%), linear-gradient(0deg, rgba(0,0,0,0.1) 0%, transparent 30%)',
    tooltipBg: 'rgba(11,12,20,0.98)',
    tooltipBorder: '1px solid rgba(255,255,255,0.12)',
    tooltipShadow: '0 -10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset',
    tooltipColor: 'white',
    tooltipMuted: 'rgba(255,255,255,0.3)',
    tooltipSub: 'rgba(255,255,255,0.6)',
    shine: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
  };

  // State-dependent bar styles
  const barBgState = isRec
    ? (isLight
        ? 'linear-gradient(180deg, rgba(255,255,255,0.6), transparent 28%, transparent 72%, rgba(255,255,255,0.3)), radial-gradient(circle at 50% 50%, rgba(59,130,246,0.2), transparent 40px), linear-gradient(135deg, rgba(248,250,252,0.95), rgba(241,245,249,0.98))'
        : 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.04) 70%, rgba(255,255,255,0.08) 100%), radial-gradient(ellipse at 50% 20%, rgba(74,158,255,0.25), transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(167,139,250,0.15), transparent 50%), linear-gradient(135deg, rgba(12,14,24,0.97), rgba(20,22,38,0.99))')
    : isDone
      ? (isLight
          ? 'linear-gradient(180deg, rgba(255,255,255,0.6), transparent 28%, transparent 72%, rgba(255,255,255,0.3)), radial-gradient(circle at 50% 50%, rgba(34,197,94,0.15), transparent 40px), linear-gradient(135deg, rgba(248,250,252,0.95), rgba(241,245,249,0.98))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.04) 70%, rgba(255,255,255,0.08) 100%), radial-gradient(ellipse at 50% 50%, rgba(74,222,128,0.18), transparent 50%), linear-gradient(135deg, rgba(12,14,24,0.97), rgba(20,22,38,0.99))')
      : isProc
        ? (isLight
            ? 'linear-gradient(180deg, rgba(255,255,255,0.6), transparent 28%, transparent 72%, rgba(255,255,255,0.3)), radial-gradient(circle at 50% 50%, rgba(167,139,250,0.15), transparent 40px), linear-gradient(135deg, rgba(248,250,252,0.95), rgba(241,245,249,0.98))'
            : 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.04) 70%, rgba(255,255,255,0.08) 100%), radial-gradient(ellipse at 50% 50%, rgba(167,139,250,0.15), transparent 50%), linear-gradient(135deg, rgba(12,14,24,0.97), rgba(20,22,38,0.99))')
        : t.barBg;

  const barBorderState = isRec
    ? (isLight ? '1px solid rgba(59,130,246,0.25)' : '1px solid rgba(74,158,255,0.25)')
    : isDone
      ? (isLight ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(74,222,128,0.25)')
      : isProc
        ? (isLight ? '1px solid rgba(167,139,250,0.2)' : '1px solid rgba(167,139,250,0.2)')
        : t.barBorder;

  const barShadowState = isRec
    ? (isLight
        ? '0 10px 30px rgba(0,0,0,0.08), 0 0 0 1px rgba(59,130,246,0.12), 0 0 40px rgba(59,130,246,0.12), 0 1px 0 rgba(255,255,255,0.8) inset'
        : '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(74,158,255,0.12), 0 0 50px rgba(74,158,255,0.15), 0 0 100px rgba(74,158,255,0.06), 0 1px 0 rgba(255,255,255,0.12) inset, 0 -1px 0 rgba(0,0,0,0.3) inset')
    : isDone
      ? (isLight
          ? '0 10px 30px rgba(0,0,0,0.08), 0 0 0 1px rgba(34,197,94,0.1), 0 0 30px rgba(34,197,94,0.12), 0 1px 0 rgba(255,255,255,0.8) inset'
          : '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(74,222,128,0.1), 0 0 50px rgba(74,222,128,0.15), 0 1px 0 rgba(255,255,255,0.1) inset, 0 -1px 0 rgba(0,0,0,0.3) inset')
      : isProc
        ? (isLight
            ? '0 10px 30px rgba(0,0,0,0.08), 0 0 0 1px rgba(167,139,250,0.1), 0 0 30px rgba(167,139,250,0.1), 0 1px 0 rgba(255,255,255,0.8) inset'
            : '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(167,139,250,0.1), 0 0 40px rgba(167,139,250,0.12), 0 1px 0 rgba(255,255,255,0.12) inset, 0 -1px 0 rgba(0,0,0,0.3) inset')
        : t.barShadow;

  const btnCircle: React.CSSProperties = {
    width: 40, height: 40, minWidth: 40, minHeight: 40, maxWidth: 40, maxHeight: 40,
    borderRadius: 999, padding: 0,
    background: t.btnBg, border: t.btnBorder, color: t.btnColor,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    WebkitAppRegion: 'no-drag' as unknown as string, outline: 'none',
    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
    overflow: 'hidden', position: 'relative' as const,
  };

  const micBtn: React.CSSProperties = {
    ...btnCircle,
    width: 44, height: 44, minWidth: 44, minHeight: 44, maxWidth: 44, maxHeight: 44,
    background: t.micBg, border: 'none', color: t.micColor,
    boxShadow: isLight ? '0 0 18px rgba(59,130,246,0.2)' : '0 0 18px rgba(74,158,255,0.28)',
  };

  const stopBtn: React.CSSProperties = {
    ...btnCircle,
    background: t.stopBg, border: 'none', color: t.stopColor,
    animation: 'vmbPulseBtn 1.5s infinite',
  };

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <style>{`
        @keyframes vmbSettle { from { opacity:0; transform:translateY(12px) scale(0.92); filter:blur(4px); } to { opacity:1; transform:translateY(0) scale(1); filter:blur(0); } }
        @keyframes vmbSpin { to { transform:rotate(360deg); } }
        @keyframes vmbPulse { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)} }
        @keyframes vmbPulseBtn { 0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,0.25)}50%{box-shadow:0 0 0 4px rgba(248,113,113,0)} }
        @keyframes vmbRecPulse {
          0%,100%{box-shadow:0 8px 32px rgba(0,0,0,0.4),0 0 0 1px rgba(74,158,255,0.1),0 0 40px rgba(74,158,255,0.12),0 0 80px rgba(74,158,255,0.05),0 1px 0 rgba(255,255,255,0.1) inset}
          50%{box-shadow:0 8px 32px rgba(0,0,0,0.4),0 0 0 1px rgba(74,158,255,0.18),0 0 50px rgba(74,158,255,0.18),0 0 100px rgba(74,158,255,0.08),0 1px 0 rgba(255,255,255,0.1) inset}
        }
        @keyframes vmbDoneFlash {
          0%{box-shadow:0 8px 32px rgba(0,0,0,0.4),0 0 0 1px rgba(74,222,128,0.08),0 0 50px rgba(74,222,128,0.18),0 1px 0 rgba(255,255,255,0.1) inset}
          100%{box-shadow:0 8px 32px rgba(0,0,0,0.4),0 0 0 1px rgba(74,222,128,0.08),0 0 30px rgba(74,222,128,0.1),0 1px 0 rgba(255,255,255,0.1) inset}
        }
        .vmb-shine {
          position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
          background: ${t.shine};
          transition: left 0.4s ease;
        }
        .vmb-btn:hover .vmb-shine { left: 100%; }
      `}</style>

      {/* Bar */}
      <div
        style={{
          zoom,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          width: 48, height: '100%', padding: '8px 8px', gap: 2,
          borderRadius: 999, boxSizing: 'border-box',
          background: barBgState,
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          border: isHov ? t.barHoverBorder : barBorderState,
          boxShadow: isRec ? undefined : isDone ? undefined : isProc ? undefined : isHov ? t.barHoverShadow : barShadowState,
          ...(isRec ? { animation: 'vmbSettle 0.5s cubic-bezier(0.16,1,0.3,1), vmbRecPulse 2s ease-in-out infinite' } : {}),
          ...(isDone ? { animation: 'vmbDoneFlash 1.2s ease-out forwards' } : {}),
          userSelect: 'none',
          WebkitAppRegion: 'drag' as unknown as string,
          position: 'relative', zIndex: 10001,
          transition: 'border-color 0.4s, box-shadow 0.4s',
          overflow: 'visible',
        }}
        onMouseEnter={() => { if (isIdle) setState('hover'); }}
        onMouseLeave={() => { if (stateRef.current === 'hover') setState('idle'); }}
      >
        {/* Inner glass */}
        <div style={{
          position: 'absolute', inset: 1, borderRadius: 'inherit',
          background: t.glassInner, pointerEvents: 'none', zIndex: 1,
        }} />

        {/* Language */}
        <button className="vmb-btn" style={btnCircle}
          onPointerDown={(e) => { e.stopPropagation(); cycleLanguage(); }}
          title={currentLang.l}
        >
          <span className="vmb-shine" />
          <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1, position: 'relative', zIndex: 2, color: isLight ? '#1e293b' : 'white' }}>{currentLang.s}</span>
        </button>

        {/* Mic */}
        <button className="vmb-btn" style={micBtn} onClick={toggle} disabled={isProc}>
          <span className="vmb-shine" />
          {(isIdle || isHov) && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, position: 'relative', zIndex: 2 }}>
              <path d="M12 2a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0v-6A3.5 3.5 0 0 0 12 2Z"/>
              <path d="M19 10.5v1a7 7 0 0 1-14 0v-1"/><path d="M12 18.5V22"/>
            </svg>
          )}
          {isRec && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, position: 'relative', zIndex: 2 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: isLight ? '#ef4444' : '#3b82f6', boxShadow: isLight ? '0 0 8px rgba(239,68,68,0.6)' : '0 0 8px rgba(59,130,246,0.6)', animation: 'vmbPulse 1s ease-in-out infinite' }} />
              <span style={{ fontSize: 8, lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace', color: isLight ? '#475569' : 'rgba(255,255,255,0.5)', letterSpacing: '0.5px' }}>{fmt(time)}</span>
            </div>
          )}
          {isProc && (
            <div style={{ width: 18, height: 18, border: `2px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)'}`, borderTopColor: isLight ? '#3b82f6' : 'white', borderRadius: '50%', animation: 'vmbSpin .7s linear infinite', position: 'relative', zIndex: 2 }} />
          )}
          {isDone && (
            <div style={{ width: 18, height: 18, background: isLight ? 'rgba(34,197,94,0.15)' : 'rgba(74,222,128,0.15)', color: isLight ? '#16a34a' : '#4ade80', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, position: 'relative', zIndex: 2, animation: 'vmbPopIn 0.2s ease' }}>✓</div>
          )}
          <style>{`@keyframes vmbPopIn{from{transform:scale(0.6);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
        </button>

        {/* Cancel */}
        {isRec && (
          <button className="vmb-btn" style={stopBtn}
            onClick={(e) => { e.stopPropagation(); cancelRec(); }}>
            <span className="vmb-shine" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ width: 14, height: 14, position: 'relative', zIndex: 2 }}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}

        {/* Copy / Settings */}
        <button className="vmb-btn" style={btnCircle}
          onClick={async (e) => {
            e.stopPropagation();
            if (text) { const r = await window.electronAPI?.copyText(text); if (r?.success) { playSound('done'); setState('done'); setTimeout(() => setState('idle'), 900); } }
            else window.electronAPI?.showMain?.('settings');
          }}
          title={text ? 'Copy text' : 'Settings'}
        >
          <span className="vmb-shine" />
          {text ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, position: 'relative', zIndex: 2 }}>
              <rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, position: 'relative', zIndex: 2 }}>
              <path d="M15 4V2"/><path d="M15 10v-2"/><path d="M12 7h6"/>
              <path d="m5 19 9.2-9.2a1.9 1.9 0 0 1 2.7 2.7L7.7 21.7a1.9 1.9 0 0 1-2.7-2.7Z"/><path d="m12.5 11.5 2 2"/>
            </svg>
          )}
        </button>

        {/* Paste / History */}
        <button className="vmb-btn" style={btnCircle}
          onClick={async (e) => {
            e.stopPropagation();
            if (text) { const r = await window.electronAPI?.pasteText(text); if (r?.success) setText(''); }
            else window.electronAPI?.showMain?.('history');
          }}
          title={text ? 'Paste text' : 'History'}
        >
          <span className="vmb-shine" />
          {text ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, position: 'relative', zIndex: 2 }}>
              <path d="M16 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect x="8" y="2" width="8" height="5" rx="1.5"/><path d="M8 12h8"/><path d="M8 16h5"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, position: 'relative', zIndex: 2 }}>
              <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v10A2.5 2.5 0 0 1 16.5 18H10l-4.4 3.2A.4.4 0 0 1 5 20.9Z"/>
              <path d="M9 8h6"/><path d="M9 12h4"/>
            </svg>
          )}
        </button>

        {/* Tooltips */}
        {text && isDone && (
          <div style={{
            position: 'absolute', left: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)',
            maxWidth: 240, zIndex: 10000,
            background: t.tooltipBg, border: t.tooltipBorder, borderRadius: 16, padding: '10px 14px',
            color: t.tooltipColor, cursor: 'pointer', boxShadow: t.tooltipShadow,
            whiteSpace: 'nowrap', backdropFilter: 'blur(40px) saturate(150%)', WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          }} onClick={async () => { const r = await window.electronAPI?.copyText(text); if (r?.success) playSound('done'); }}>
            <div style={{ color: t.tooltipMuted, fontSize: 8, marginBottom: 3, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>RESULT</div>
            <div style={{ fontSize: 10, lineHeight: 1.4, wordBreak: 'break-word', color: isLight ? '#1e293b' : 'rgba(255,255,255,0.85)' }}>
              {text.length > 70 ? text.substring(0, 70) + '...' : text}
            </div>
          </div>
        )}

        {partial && isRec && (
          <div style={{
            position: 'absolute', left: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)',
            maxWidth: 240, zIndex: 10000,
            background: t.tooltipBg, border: isLight ? '1px solid rgba(59,130,246,0.2)' : '1px solid rgba(74,158,255,0.2)',
            borderRadius: 16, padding: '10px 14px',
            color: t.tooltipColor, boxShadow: t.tooltipShadow,
            whiteSpace: 'nowrap', backdropFilter: 'blur(40px) saturate(150%)', WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          }}>
            <div style={{ color: isLight ? '#3b82f6' : 'rgba(74,158,255,0.6)', fontSize: 8, marginBottom: 3, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>LISTENING</div>
            <div style={{ fontSize: 10, lineHeight: 1.4, color: t.tooltipSub, fontStyle: 'italic' }}>
              {partial.length > 50 ? partial.substring(0, 50) + '...' : partial}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute', left: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)',
            whiteSpace: 'nowrap', zIndex: 10000,
            background: 'rgba(239,68,68,0.9)', color: '#fff', padding: '6px 12px',
            borderRadius: 8, fontSize: 10, fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>{error}</div>
        )}

        {hasModel === false && !isRec && (
          <div style={{
            position: 'absolute', left: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)',
            whiteSpace: 'nowrap', zIndex: 10000,
            background: 'rgba(234,179,8,0.9)', color: '#000', padding: '6px 12px',
            borderRadius: 8, fontSize: 10, fontWeight: 500, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }} onClick={() => window.electronAPI?.showMain?.('models')}>
            No model — tap to download
          </div>
        )}
      </div>
    </div>
  );
}
