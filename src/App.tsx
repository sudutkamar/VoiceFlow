import React, { useState, useEffect, useCallback, useRef } from 'react';
import './styles/app.css';
import { WavRecorder } from './utils/wavRecorder';
import Settings from './pages/Settings';
import Models from './pages/Models';
import History from './pages/History';
import Benchmark from './pages/Benchmark';
import { NotificationProvider, useNotification } from './components/Notification';
import appLogo from './assets/logo.png';

declare global {
  interface Window {
    voiceflowSoundEnabled?: boolean;
    electronAPI: {
      runBenchmark: (audioBuffer: number[], models: string[]) => Promise<{ success: boolean; error?: string }>;
      onBenchmarkProgress: (callback: (data: { model: string; status: string; text?: string; elapsedMs?: number; error?: string }) => void) => () => void;
      startRecording: () => Promise<{ success: boolean; error?: string }>;
      stopRecording: () => Promise<{ success: boolean; error?: string }>;
      sendAudioData: (data: { buffer: number[]; mimeType: string; duration: number }) => void;
      getSettings: () => Promise<Record<string, string>>;
      updateSetting: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
      updateHotkey: (newHotkey: string) => Promise<{ success: boolean; error?: string }>;
      quitApp: () => Promise<void>;
      showMain: (page?: Page) => Promise<void>;
      minimizeToBar: () => Promise<void>;
      showMiniWindow: () => Promise<void>;
      hideMiniWindow: () => Promise<void>;
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      miniWindowReady: () => void;
      resizeMiniWindow: (height: number) => Promise<void>;
      setMiniWindowFocusable: (focusable: boolean) => Promise<void>;
      getTargetApp: () => Promise<string>;
      onStateChange: (callback: (state: string) => void) => () => void;
      onTranscriptReady: (callback: (data: any) => void) => () => void;
      onError: (callback: (error: string) => void) => () => void;
      onStartRecording: (callback: () => void) => () => void;
      onStopRecording: (callback: (duration: number) => void) => () => void;
      onCancelRecording: (callback: () => void) => () => void;
      onPartialTranscript: (callback: (text: string) => void) => () => void;
      onTargetAppChanged: (callback: (appName: string) => void) => () => void;
      onHotkeyRegistered: (callback: (hotkey: string) => void) => () => void;
      onNavigate: (callback: (page: string) => void) => () => void;
      copyText: (text: string) => Promise<{ success: boolean; error?: string }>; 
      pasteText: (text: string) => Promise<{ success: boolean; error?: string }>;
      getAvailableModels: () => Promise<any[]>;
      scanModelsFolder: () => Promise<any[]>;
      downloadModel: (modelName: string) => Promise<{ success: boolean; error?: string }>;
      forceDownloadModel: (modelName: string) => Promise<{ success: boolean; error?: string }>;
      pauseDownload: () => Promise<{ success: boolean; error?: string }>;
      resumeDownload: () => Promise<{ success: boolean; error?: string }>;
      cancelDownload: () => Promise<void>;
      deleteModel: (modelName: string) => Promise<boolean>;
      getDownloadProgress: () => Promise<{ progress: number; state: string; modelName?: string | null; downloadedBytes?: number; totalBytes?: number }>;
      hasInterruptedDownload: () => Promise<boolean>;
      getInterruptedDownloadInfo: () => Promise<{ modelName: string; progress: number } | null>;
      getModelsPath: () => Promise<string>;
      getCustomModelsPath: () => Promise<string | null>;
      chooseModelsFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;
      resetModelsPath: () => Promise<{ success: boolean; path?: string }>;
      hasAnyModel: () => Promise<boolean>;
      getDictionary: () => Promise<any[]>;
      addDictionaryEntry: (phrase: string, replacement: string) => Promise<{ success: boolean }>;
      deleteDictionaryEntry: (id: string) => Promise<void>;
      getSnippets: () => Promise<any[]>;
      addSnippet: (trigger: string, output: string) => Promise<{ success: boolean }>;
      deleteSnippet: (id: string) => Promise<void>;
      setAutoStart: (enable: boolean) => Promise<void>;
      getHistory: (limit?: number) => Promise<any[]>;
      deleteHistoryItem: (id: string) => Promise<void>;
      clearHistory: () => Promise<void>;
      exportHistory: () => Promise<{ success: boolean; path?: string; error?: string }>;
      searchHistory: (query: string) => Promise<any[]>;
      clearCache: () => Promise<{ success: boolean; filesCleared?: number; error?: string }>;
      getGpuStatus: () => Promise<{ hasGpu: boolean; mode: string; whisperDir: string; cudaDllsPresent?: boolean; needsDownload?: boolean; downloadUrl?: string }>;
      isAutoStart: () => Promise<boolean>;
      getVersion: () => Promise<string>;
      onDownloadProgress: (callback: (data: { progress: number; state: string; downloadedBytes: number; totalBytes: number; modelName?: string | null }) => void) => () => void;
      onMiniWindowUpdate: (callback: (data: any) => void) => () => void;
      onWpmUpdate: (callback: (wpm: number) => void) => () => void;
      getDownloadedModels: () => Promise<string[]>;
      isModelDownloaded: (model: string) => Promise<boolean>;
    };
  }
}

type State = 'idle' | 'hover' | 'recording' | 'processing' | 'done';
type Page = 'home' | 'settings' | 'models' | 'history' | 'benchmark';

// Helper functions
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return '#4ade80';
  if (confidence >= 0.75) return '#4a9eff';
  if (confidence >= 0.6) return '#fbbf24';
  return '#f87171';
}

// Sound feedback — singleton AudioContext to avoid memory leak
let _soundCtx: AudioContext | null = null;
function getSoundCtx(): AudioContext {
  if (!_soundCtx || _soundCtx.state === 'closed') {
    _soundCtx = new AudioContext();
  }
  if (_soundCtx.state === 'suspended') {
    _soundCtx.resume();
  }
  return _soundCtx;
}

function playSound(type: 'start' | 'stop' | 'done' | 'error') {
  if (window.voiceflowSoundEnabled === false) return;
  try {
    const ctx = getSoundCtx();
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
          try {
            const ctx2 = getSoundCtx();
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
          } catch {}
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

function useVad(analyserRef: React.MutableRefObject<AnalyserNode | null>, active: boolean, timeoutMs: number) {
  const [silenceDetected, setSilence] = useState(false);
  const silenceStart = useRef(0);
  const animRef = useRef(0);
  const hasDetectedAudio = useRef(false);

  useEffect(() => {
    if (!active) { setSilence(false); hasDetectedAudio.current = false; silenceStart.current = 0; return; }
    const checkAndLoop = () => {
      const analyser = analyserRef.current;
      if (!analyser) { animRef.current = requestAnimationFrame(checkAndLoop); return; }
      const loop = () => {
        if (!analyserRef.current) { setSilence(false); return; }
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const rms = Math.sqrt(data.reduce((a, v) => a + v * v, 0) / data.length);

        // Mark audio as detected when there's meaningful input
        if (rms >= 6) hasDetectedAudio.current = true;

        // Only trigger silence if audio was ever detected (avoids premature auto-stop
        // when no mic is connected or mic is not working)
        if (rms < 6) {
          if (!hasDetectedAudio.current) return;
          if (!silenceStart.current) silenceStart.current = Date.now();
          else if (Date.now() - silenceStart.current > timeoutMs) setSilence(true);
        } else {
          silenceStart.current = 0;
          setSilence(false);
        }
        animRef.current = requestAnimationFrame(loop);
      };
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(checkAndLoop);
    return () => { cancelAnimationFrame(animRef.current); silenceStart.current = 0; hasDetectedAudio.current = false; setSilence(false); };
  }, [active, timeoutMs]);

  return silenceDetected;
}

export default function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
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

// ============ MINI BAR ============
function MiniBar() {
  const [state, setState] = useState<State>('idle');
  const [text, setText] = useState('');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const [levels, setLevels] = useState<number[]>(Array(15).fill(0));
  const [time, setTime] = useState(0);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [targetApp, setTargetApp] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [langOpen, setLangOpen] = useState(false);
  const [clipPeak, setClipPeak] = useState(0);
  const [barHover, setBarHover] = useState(false);
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  const [gpuStatus, setGpuStatus] = useState<string | null>(null);
  const [windowHeight, setWindowHeight] = useState(64);
  const [windowWidth, setWindowWidth] = useState(460);
  const langRef = useRef<HTMLDivElement>(null);

  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothLevels = useRef<number[]>(Array(24).fill(0));
  const animRef = useRef<number>(0);
  const timerRef = useRef<any>(null);
  const processingTimeoutRef = useRef<any>(null);
  const resizeTimerRef = useRef<any>(null);
  const startRef = useRef(0);
  const stateRef = useRef<State>(state);

  // Calculate zoom based on window height (base bar height = 52px, width is auto)
  const miniZoom = windowHeight / 52;

  useEffect(() => { stateRef.current = state; }, [state]);

  // Listen for window resize to update scale
  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
      setWindowWidth(window.innerWidth);
    };
    handleResize(); // Set initial height
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const vadEnabled = settings.vad_enabled !== 'false';
  const vadSilenceMs = parseInt(settings.vad_silence_ms || '1500', 10);
  const silenceDetected = useVad(analyserRef, state === 'recording' && vadEnabled, vadSilenceMs);

  useEffect(() => {
    if (silenceDetected && stateRef.current === 'recording') stopRec();
  }, [silenceDetected]);

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
        setTimeout(() => { if (stateRef.current === 'done') setState('idle'); }, 4000);
      }),
      window.electronAPI.onPartialTranscript((p) => setPartial(p)),
      window.electronAPI.onError((e) => { 
        if (processingTimeoutRef.current) { clearTimeout(processingTimeoutRef.current); processingTimeoutRef.current = null; }
        // No-speech: silently return to idle, no message, no error, no sound
        if (e === '__NO_SPEECH__') {
          setState('idle');
          return;
        }
        // Other errors: show briefly then clear (no sound to avoid annoyance)
        setError(e); setState('idle'); setTimeout(() => setError(''), 3000); 
      }),
      window.electronAPI.onTargetAppChanged((appName) => setTargetApp(appName)),
      window.electronAPI.onHotkeyRegistered?.((hotkey) => setSettings(prev => ({ ...prev, hotkey }))),
      window.electronAPI.onThemeChange?.((theme) => {
        if (theme === 'light') {
          document.documentElement.classList.add('light-theme');
        } else {
          document.documentElement.classList.remove('light-theme');
        }
      }),
    ];
    window.electronAPI.getTargetApp().then(setTargetApp).catch(() => {});

    // Close lang dropdown on outside click
    const handleOutsideClick = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
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
      cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
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

  // No window resize on hover — CSS handles all visual transitions smoothly.
  // This prevents the glitch/flicker caused by Electron window bounds changing on hover.

  const startRec = useCallback(async () => {
    if (wavRecorderRef.current || stateRef.current === 'recording' || stateRef.current === 'processing') return;
    try {
      const recorder = new WavRecorder({ sampleRate: 16000, channels: 1 });
      wavRecorderRef.current = recorder;
      await recorder.start(settings.selected_mic || undefined, {
        enabled: true,
        silenceThreshold: 0.01,
        silenceDurationMs: 3000,
      });
      recorder.onSilence(() => {
        if (stateRef.current === 'recording') {
          stopRec();
        }
      });
      const analyser = recorder.getAnalyserNode();
      if (analyser) analyserRef.current = analyser;
      startRef.current = Date.now();
      setState('recording');
      setPartial(''); setTime(0); setClipPeak(0); setMicLevel(0);
      playSound('start');
      timerRef.current = setInterval(() => setTime(Date.now() - startRef.current), 200);
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
        // Main wave
        ctx.beginPath();
        ctx.moveTo(0, mid - (src[0] / 100) * (mid - 1));
        for (let i = 1; i < POINTS; i++) {
          const x0 = (i - 1) * step, x1 = i * step;
          const y0 = mid - (src[i - 1] / 100) * (mid - 1);
          const y1 = mid - (src[i] / 100) * (mid - 1);
          ctx.bezierCurveTo((x0 + x1) / 2, y0, (x0 + x1) / 2, y1, x1, y1);
        }
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
        // Smooth easing
        const ease = 0.18;
        for (let i = 0; i < POINTS; i++) {
          smoothLevels.current[i] += (raw[i] - smoothLevels.current[i]) * ease;
        }
        setLevels(raw);
        drawCanvas();
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, avg * 2));
        setClipPeak(prev => Math.max(prev, avg > 80 ? 2 : avg > 60 ? 1 : 0));
        animRef.current = requestAnimationFrame(viz);
      };
      viz();
    } catch (err: any) {
      console.error('[MiniBar] Recording error:', err);
      let errorMsg = 'Mic error';
      if (err.name === 'NotAllowedError') {
        errorMsg = 'Mic access denied';
      } else if (err.name === 'NotReadableError') {
        errorMsg = 'Mic in use by other app';
      } else if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
        // Saved mic device no longer available — fall back to default
        errorMsg = 'Mic tidak ditemukan, pakai default';
        setSettings(prev => ({ ...prev, selected_mic: '' }));
        window.electronAPI.updateSetting('selected_mic', '').catch(() => {});
      } else if (err.message) {
        errorMsg = err.message.substring(0, 60);
      }
      setError(errorMsg);
      playSound('error'); setTimeout(() => setError(''), 5000);
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

  const cancelRec = useCallback(async () => {
    // Guard: if already processing or idle, just reset state
    if (stateRef.current !== 'recording') {
      if (stateRef.current === 'processing') {
        // Audio already sent — can't cancel, just reset UI
        setState('idle');
        setPartial('');
        if (processingTimeoutRef.current) { clearTimeout(processingTimeoutRef.current); processingTimeoutRef.current = null; }
      }
      return;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animRef.current);
    analyserRef.current = null;
    setMicLevel(0);
    setLevels(Array(15).fill(0));
    if (wavRecorderRef.current) {
      try { await wavRecorderRef.current.cancel(); } catch {}
      wavRecorderRef.current = null;
    }
    setState('idle');
    setPartial('');
  }, []);

  // Escape key to cancel recording (local fallback for focused window)
  useEffect(() => {
    if (state !== 'recording') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelRec();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, cancelRec]);

  // Global cancel-recording from main process (works even when not focused)
  useEffect(() => {
    const unsub = window.electronAPI.onCancelRecording?.(() => {
      if (stateRef.current === 'recording') {
        cancelRec();
      }
    });
    return () => { unsub?.(); };
  }, [cancelRec]);

  const toggle = useCallback(() => { state === 'recording' ? stopRec() : (state === 'idle' || state === 'hover') && startRec(); }, [state, startRec, stopRec]);
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };
  const langs = [
    { c: 'auto', f: '🌐', l: 'Auto Detect', s: 'AUTO' },
    { c: 'id', f: '🇮🇩', l: 'Indonesia', s: 'ID' },
    { c: 'en', f: '🇺🇸', l: 'English', s: 'EN' },
    { c: 'ja', f: '🇯🇵', l: '日本語', s: 'JA' },
    { c: 'ko', f: '🇰🇷', l: '한국어', s: 'KO' },
    { c: 'zh', f: '🇨🇳', l: '中文', s: 'ZH' },
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
          ⚠️ Belum ada model AI — klik untuk download
        </div>
      )}
      {gpuStatus && !hasModel === false && state !== 'recording' && (
        <div className="m-tooltip info" onClick={() => window.electronAPI.showMain('settings')}>
          🖥️ GPU terdeteksi — klik untuk download CUDA
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

  const navItems: { id: Page; icon: React.ReactNode; label: string }[] = [
    { id: 'home', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>, label: 'Record' },
    { id: 'models', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>, label: 'Models' },
    { id: 'history', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label: 'History' },
    { id: 'benchmark', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, label: 'Benchmark' },
    { id: 'settings', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, label: 'Settings' },
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button className="title-btn maximize" onClick={() => window.electronAPI.maximizeWindow()} title="Maximize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="5" width="14" height="14" rx="1"/></svg>
          </button>
          <button className="title-btn close" onClick={() => window.electronAPI.minimizeToBar()} title="Close">
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
          {currentPage === 'home' && <HomePage settings={settings} onSuccess={showSuccess} onError={showError} />}
          {currentPage === 'models' && <Models onSuccess={showSuccess} onError={showError} />}
          {currentPage === 'history' && <History onSuccess={showSuccess} />}
          {currentPage === 'benchmark' && <Benchmark />}
          {currentPage === 'settings' && <Settings onSuccess={showSuccess} onError={showError} />}
        </main>
      </div>
    </div>
  );
}

// ============ HOME PAGE ============
function HomePage({ settings, onSuccess, onError }: { settings: Record<string, string>; onSuccess: (msg: string) => void; onError: (msg: string) => void }) {
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
  const [micLevel, setMicLevel] = useState(0);
  const [clipPeak, setClipPeak] = useState(0);

  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number>(0);
  const timerRef = useRef<any>(null);
  const processingTimeoutRef = useRef<any>(null);
  const startRef = useRef(0);
  const stateRef = useRef<State>(state);

  useEffect(() => { stateRef.current = state; }, [state]);

  const vadEnabled = settings.vad_enabled !== 'false';
  const vadSilenceMs = parseInt(settings.vad_silence_ms || '1500', 10);
  const silenceDetected = useVad(analyserRef, state === 'recording' && vadEnabled, vadSilenceMs);

  useEffect(() => {
    if (silenceDetected && stateRef.current === 'recording') stopRec();
  }, [silenceDetected]);

  useEffect(() => {
    const unsubs = [
      window.electronAPI.onStartRecording(() => {
        if (wavRecorderRef.current || stateRef.current === 'recording' || stateRef.current === 'processing') return;
        startRec();
      }),
      window.electronAPI.onStopRecording(() => { if (wavRecorderRef.current) stopRec(); }),
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
        // Handle no-speech: show message briefly then return to idle
        if (e === '__NO_SPEECH__') {
          setError('Tidak terdeteksi suara');
          setState('idle');
          setTimeout(() => setError(''), 2000);
          return;
        }
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
      await recorder.start(settings.selected_mic || undefined, {
        enabled: true,
        silenceThreshold: 0.01,
        silenceDurationMs: 3000,
      });
      recorder.onSilence(() => {
        if (stateRef.current === 'recording') {
          stopRec();
        }
      });
      const analyser = recorder.getAnalyserNode();
      if (analyser) analyserRef.current = analyser;
      startRef.current = Date.now();
      setState('recording');
      setPartial(''); setTime(0); setClipPeak(0); setMicLevel(0);
      playSound('start');
      timerRef.current = setInterval(() => setTime(Date.now() - startRef.current), 100);
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
    } catch (err: any) {
      console.error('[HomePage] Recording error:', err);
      let errorMsg = 'Microphone error';
      if (err.name === 'NotAllowedError') {
        errorMsg = 'Microphone access denied';
      } else if (err.name === 'NotReadableError') {
        errorMsg = 'Microphone in use by another app';
      } else if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
        errorMsg = 'Mic tidak ditemukan — cek koneksi mic';
        window.electronAPI.updateSetting('selected_mic', '').catch(() => {});
      } else if (err.message) {
        errorMsg = err.message.substring(0, 80);
      }
      setError(errorMsg);
      playSound('error'); setTimeout(() => setError(''), 5000);
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

  const cancelRec = useCallback(async () => {
    // Guard: if already processing or idle, just reset state
    if (stateRef.current !== 'recording') {
      if (stateRef.current === 'processing') {
        setState('idle');
        setPartial('');
        setError('');
        if (processingTimeoutRef.current) { clearTimeout(processingTimeoutRef.current); processingTimeoutRef.current = null; }
      }
      return;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animRef.current);
    analyserRef.current = null;
    setMicLevel(0);
    setLevels(Array(30).fill(0));
    if (wavRecorderRef.current) {
      try { await wavRecorderRef.current.cancel(); } catch {}
      wavRecorderRef.current = null;
    }
    setState('idle');
    setPartial('');
    setError('');
  }, []);

  // Escape key to cancel recording (local fallback for focused window)
  useEffect(() => {
    if (state !== 'recording') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelRec();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, cancelRec]);

  // Global cancel-recording from main process (works even when not focused)
  useEffect(() => {
    const unsub = window.electronAPI.onCancelRecording?.(() => {
      if (stateRef.current === 'recording') {
        cancelRec();
      }
    });
    return () => { unsub?.(); };
  }, [cancelRec]);

  const toggle = useCallback(() => { state === 'recording' ? stopRec() : (state === 'idle' || state === 'done') && startRec(); }, [state, startRec, stopRec]);
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };

  const [hasModel, setHasModel] = useState<boolean | null>(null);

  useEffect(() => {
    window.electronAPI.hasAnyModel().then(setHasModel).catch(() => setHasModel(true));
  }, []);

  // Determine active profile based on model and audio settings
  const getActiveProfile = () => {
    const model = settings.model || '';
    const isLargeModel = model.includes('large') || model.includes('medium');
    if (isLargeModel) return { name: 'Turbo', icon: '⚡', desc: 'Fast + Accurate (large model)' };
    return { name: 'Turbo', icon: '⚡', desc: 'Fast transcription' };
  };
  const activeProfile = getActiveProfile();

  return (
    <div className="page home-page">
      {hasModel === false && (
        <div className="model-warning-banner">
          <span>⚠️</span>
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
        <div className={`profile-badge ${activeProfile.name.toLowerCase()}`}>
          <span className="profile-badge-icon">{activeProfile.icon}</span>
          {activeProfile.name}
        </div>
        <div className="profile-info">
          <span className="profile-name">Transcription Profile</span>
          <span className="profile-desc">{activeProfile.desc}</span>
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
              {clipPeak >= 2 ? '⚠️ Clipping - move mic away' : micLevel < 3 ? '🔇 No input detected - check mic' : clipPeak >= 1 ? '🔊 Loud - may distort' : '🎙️ Good level'}
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
