import { useState, useEffect, useCallback, useRef } from 'react';
import { WavRecorder } from '../utils/wavRecorder';

type State = 'idle' | 'hover' | 'recording' | 'processing' | 'done';

interface UseRecorderOptions {
  /** Called when transcript is ready. If not provided, sets text + state internally. */
  onTranscript?: (data: { raw: string; cleaned: string; confidence?: any; fuzzyChanges?: number; rawText?: string }) => void;
  /** Called on partial transcript. If not provided, sets partial state internally. */
  onPartial?: (text: string) => void;
  /** Called on error. If not provided, sets error state internally. */
  onError?: (error: string) => void;
  /** Minimum recording duration before VAD can auto-stop. Default 2000ms. */
  minRecordingMs?: number;
}

interface UseRecorderReturn {
  state: State;
  text: string;
  partial: string;
  error: string;
  time: number;
  micLevel: number;
  clipPeak: number;
  silenceDetected: boolean;

  /** Refs for external visualization (canvas, etc.) */
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  animRef: React.MutableRefObject<number>;

  /** Internal refs (exposed for canvas drawing loops) */
  wavRecorderRef: React.MutableRefObject<WavRecorder | null>;
  startRef: React.MutableRefObject<number>;
  stateRef: React.MutableRefObject<State>;
  timerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  processingTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;

  /** State setters (for component-specific overrides) */
  setState: React.Dispatch<React.SetStateAction<State>>;
  setText: React.Dispatch<React.SetStateAction<string>>;
  setPartial: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setMicLevel: React.Dispatch<React.SetStateAction<number>>;
  setClipPeak: React.Dispatch<React.SetStateAction<number>>;

  /** Actions */
  startRec: () => Promise<void>;
  stopRec: () => Promise<void>;
  cancelRec: () => Promise<void>;
  toggle: () => void;
}

// ══════════════════════════════════════════════════════════════
//  useVad — Voice Activity Detection hook
// ══════════════════════════════════════════════════════════════
function useVad(
  analyserRef: React.MutableRefObject<AnalyserNode | null>,
  active: boolean,
  timeoutMs: number,
  threshold: number = 15
): boolean {
  const [silenceDetected, setSilence] = useState(false);
  const silenceStart = useRef(0);
  const animRef = useRef(0);
  const hasDetectedAudio = useRef(false);

  useEffect(() => {
    if (!active) {
      setSilence(false);
      hasDetectedAudio.current = false;
      silenceStart.current = 0;
      return;
    }
    const checkAndLoop = () => {
      const analyser = analyserRef.current;
      if (!analyser) { animRef.current = requestAnimationFrame(checkAndLoop); return; }
      const loop = () => {
        if (!analyserRef.current) { setSilence(false); return; }
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const rms = Math.sqrt(data.reduce((a, v) => a + v * v, 0) / data.length);

        if (rms >= threshold) hasDetectedAudio.current = true;

        if (rms < threshold) {
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
    return () => {
      cancelAnimationFrame(animRef.current);
      silenceStart.current = 0;
      hasDetectedAudio.current = false;
      setSilence(false);
    };
  }, [active, timeoutMs, threshold]);

  return silenceDetected;
}

// ══════════════════════════════════════════════════════════════
//  useRecorder — shared recording logic
// ══════════════════════════════════════════════════════════════
export function useRecorder(settings: Record<string, string>, options: UseRecorderOptions = {}): UseRecorderReturn {
  const { onTranscript, onPartial, onError, minRecordingMs = 2000 } = options;

  const [state, setState] = useState<State>('idle');
  const [text, setText] = useState('');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const [time, setTime] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [clipPeak, setClipPeak] = useState(0);

  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef(0);
  const stateRef = useRef<State>('idle');

  // Stable callback refs to avoid re-subscribing IPC
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onPartialRef = useRef(onPartial);
  onPartialRef.current = onPartial;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Sync stateRef
  useEffect(() => { stateRef.current = state; }, [state]);

  // VAD
  const vadEnabled = settings.vad_enabled !== 'false';
  const vadSilenceMs = parseInt(settings.vad_silence_ms || '3000', 10);
  const silenceDetected = useVad(analyserRef, state === 'recording' && vadEnabled, vadSilenceMs);

  // Auto-stop on silence
  useEffect(() => {
    if (silenceDetected && stateRef.current === 'recording' && (Date.now() - startRef.current) >= minRecordingMs) {
      stopRec();
    }
  }, [silenceDetected]);

  // IPC subscriptions (runs once, uses callback refs)
  useEffect(() => {
    const unsubs = [
      window.electronAPI.onStartRecording(() => {
        if (wavRecorderRef.current || stateRef.current === 'recording' || stateRef.current === 'processing') return;
        startRec();
      }),
      window.electronAPI.onStopRecording(() => {
        if (wavRecorderRef.current) stopRec();
      }),
      window.electronAPI.onTranscriptReady((d) => {
        if (processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
          processingTimeoutRef.current = null;
        }
        if (onTranscriptRef.current) {
          onTranscriptRef.current(d);
        } else {
          setText(d.cleaned || d.raw);
          setState('done');
        }
      }),
      window.electronAPI.onPartialTranscript((p) => {
        if (onPartialRef.current) {
          onPartialRef.current(p);
        } else {
          setPartial(p);
        }
      }),
      window.electronAPI.onError((e) => {
        if (processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
          processingTimeoutRef.current = null;
        }
        if (onErrorRef.current) {
          onErrorRef.current(e);
        } else if (e === '__NO_SPEECH__') {
          setState('idle');
        } else {
          setError(e);
          setState('idle');
          setTimeout(() => setError(''), 3000);
        }
      }),
    ];
    return () => {
      unsubs.forEach((u) => u());
      cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    };
  }, []);

  // Escape key to cancel recording
  useEffect(() => {
    if (state !== 'recording') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cancelRec(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state]);

  // Global cancel-recording from main process
  useEffect(() => {
    const unsub = window.electronAPI.onCancelRecording?.(() => {
      if (stateRef.current === 'recording') cancelRec();
    });
    return () => { unsub?.(); };
  }, []);

  // ══════════════════════════════════════════════════════════
  //  Actions
  // ══════════════════════════════════════════════════════════

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
        if (stateRef.current === 'recording') stopRec();
      });
      const analyser = recorder.getAnalyserNode();
      if (analyser) analyserRef.current = analyser;
      startRef.current = Date.now();
      setState('recording');
      setPartial('');
      setTime(0);
      setClipPeak(0);
      setMicLevel(0);
      timerRef.current = setInterval(() => setTime(Date.now() - startRef.current), 200);
    } catch (err: any) {
      let errorMsg = 'Mic error';
      if (err.name === 'NotAllowedError') errorMsg = 'Mic access denied';
      else if (err.name === 'NotReadableError') errorMsg = 'Mic in use by other app';
      else if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
        errorMsg = 'Mic not found, using default';
        window.electronAPI.updateSetting('selected_mic', '').catch(() => {});
      } else if (err.message) errorMsg = err.message.substring(0, 60);
      setError(errorMsg);
      setTimeout(() => setError(''), 5000);
    }
  }, [settings]);

  const stopRec = useCallback(async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cancelAnimationFrame(animRef.current);
    analyserRef.current = null;
    setMicLevel(0);
    setState('processing');
    if (wavRecorderRef.current) {
      try {
        const { buffer, duration } = await wavRecorderRef.current.stop();
        wavRecorderRef.current = null;
        window.electronAPI.sendAudioData({ buffer: new Uint8Array(buffer) as any, mimeType: 'audio/wav', duration });
        processingTimeoutRef.current = setTimeout(() => {
          if (stateRef.current === 'processing') {
            setError('Timeout');
            setState('idle');
            setTimeout(() => setError(''), 3000);
          }
        }, 25000);
      } catch { setState('idle'); }
    }
  }, []);

  const cancelRec = useCallback(async () => {
    if (stateRef.current !== 'recording') {
      if (stateRef.current === 'processing') {
        setState('idle');
        setPartial('');
        if (processingTimeoutRef.current) {
          clearTimeout(processingTimeoutRef.current);
          processingTimeoutRef.current = null;
        }
      }
      return;
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cancelAnimationFrame(animRef.current);
    analyserRef.current = null;
    setMicLevel(0);
    if (wavRecorderRef.current) {
      try { await wavRecorderRef.current.cancel(); } catch {}
      wavRecorderRef.current = null;
    }
    setState('idle');
    setPartial('');
  }, []);

  const toggle = useCallback(() => {
    if (state === 'recording') stopRec();
    else if (state === 'idle' || state === 'hover') startRec();
  }, [state]);

  return {
    state, setState,
    text, setText,
    partial, setPartial,
    error, setError,
    time,
    micLevel, setMicLevel,
    clipPeak, setClipPeak,
    silenceDetected,
    analyserRef,
    animRef,
    wavRecorderRef,
    startRef,
    stateRef,
    timerRef,
    processingTimeoutRef,
    startRec,
    stopRec,
    cancelRec,
    toggle,
  };
}
