import { useState, useEffect, useCallback, useRef } from 'react';
import { WavRecorder } from '../utils/wavRecorder';
import { MIN_RECORDING_MS, PROCESSING_TIMEOUT_MS, DEFAULT_VAD_SILENCE_MS, TIMER_INTERVAL_MS } from '../utils/constants';
import { findBestMic } from '../utils/micDetector';

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
/**
 * VAD hook — Voice Activity Detection using TIME-DOMAIN audio samples.
 *
 * Uses getFloatTimeDomainData() (actual audio samples, range -1..1)
 * for actual loudness measurement.
 *
 * Threshold 0.012: silence ~0.001-0.005, speech ~0.02-0.2
 */
function useVad(
  analyserRef: React.MutableRefObject<AnalyserNode | null>,
  active: boolean,
  timeoutMs: number,
  threshold: number = 0.002
): boolean {
  const [silenceDetected, setSilence] = useState(false);
  const silenceStart = useRef(0);
  const animRef = useRef(0);
  const hasDetectedAudio = useRef(false);
  const maxRecordingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      setSilence(false);
      hasDetectedAudio.current = false;
      silenceStart.current = 0;
      if (maxRecordingTimeout.current) {
        clearTimeout(maxRecordingTimeout.current);
        maxRecordingTimeout.current = null;
      }
      return;
    }

    // Emergency stop: setelah 30 detik, force silence untuk trigger stop
    // Meskipun tidak ada suara terdeteksi, recording harus berhenti.
    const emergencyTimerId = setTimeout(() => {
      console.log('[VAD] Emergency stop: 30s timeout reached');
      hasDetectedAudio.current = true;
      silenceStart.current = Date.now() - timeoutMs - 100;
    }, 30000);

    let debugCount = 0;
    const loop = () => {
      const analyser = analyserRef.current;
      if (!analyser) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      // RMS of time-domain samples (-1..1)
      const rms = Math.sqrt(data.reduce((a, v) => a + v * v, 0) / data.length);

      // Debug: log RMS setiap 100 frame
      debugCount++;
      if (debugCount % 100 === 0) {
        const maxVal = Math.max(...Array.from(data).map(Math.abs));
        console.log('[VAD] RMS:', rms.toFixed(6), 'threshold:', threshold, 'max:', maxVal.toFixed(6), 'detected:', hasDetectedAudio.current, 'silenceStart:', silenceStart.current ? (Date.now() - silenceStart.current) + 'ms' : 'none');
      }

      if (rms >= threshold) {
        if (!hasDetectedAudio.current) {
          console.log('[VAD] FIRST SPEECH DETECTED! RMS:', rms.toFixed(6));
        }
        hasDetectedAudio.current = true;
        silenceStart.current = 0;
      } else {
        if (!hasDetectedAudio.current) {
          // Belum pernah dengar suara — terus aja loop
          animRef.current = requestAnimationFrame(loop);
          return;
        }
        if (!silenceStart.current) silenceStart.current = Date.now();
        else if (Date.now() - silenceStart.current > timeoutMs) setSilence(true);
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      if (maxRecordingTimeout.current) {
        clearTimeout(maxRecordingTimeout.current);
        maxRecordingTimeout.current = null;
      }
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
/**
 * Custom React hook for managing the recording lifecycle.
 * 
 * Handles:
 * - Audio capture via WavRecorder
 * - VAD (Voice Activity Detection) for auto-stop
 * - IPC communication with main process
 * - Recording state management (idle → recording → processing → done)
 * 
 * @param settings - Application settings from database
 * @param options - Callback options for transcript, partial, and error handling
 * @returns Recording state, controls, and refs for visualization
 * 
 * @example
 * ```typescript
 * const { state, startRec, stopRec, toggle } = useRecorder(settings, {
 *   onTranscript: (data) => setText(data.cleaned),
 *   onError: (err) => setError(err),
 * });
 * ```
 *
 * CRITICAL: Do NOT modify this file without reading AGENTS.md Rule #1.
 * This hook is part of the critical recording pipeline.
 */
export function useRecorder(settings: Record<string, string>, options: UseRecorderOptions = {}): UseRecorderReturn {
  const { onTranscript, onPartial, onError, minRecordingMs = MIN_RECORDING_MS } = options;

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

  // VAD — always active when recording (VAD or timer-based)
  const vadEnabled = settings.vad_enabled !== 'false';
  const vadSilenceMs = parseInt(settings.vad_silence_ms || String(DEFAULT_VAD_SILENCE_MS), 10);
  const vadActive = state === 'recording';
  console.log('[useRecorder] VAD state:', { state, vadEnabled, vadActive, vadSilenceMs });
  // Gunakan DEFAULT_SILENCE_THRESHOLD (0.01) dari constants untuk threshold VAD
  // Threshold 0.002 terlalu rendah — noise floor PC bisa trigger false positive silence
  const vadThreshold = 0.012; // 0.012: silence ~0.001-0.005, speech ~0.02-0.2
  const silenceDetected = useVad(analyserRef, state === 'recording' && vadEnabled, vadSilenceMs, vadThreshold);

  // Auto-stop on silence
  useEffect(() => {
    if (silenceDetected && stateRef.current === 'recording' && (Date.now() - startRef.current) >= minRecordingMs) {
      stopRec();
    }
  }, [silenceDetected]);

  // IPC subscriptions (runs once, uses callback refs)
  useEffect(() => {
    console.log('[useRecorder] Setting up IPC subscriptions...');
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
      console.log('[useRecorder] startRec: creating WavRecorder...');
      const recorder = new WavRecorder({ sampleRate: 16000, channels: 1 });
      wavRecorderRef.current = recorder;
      console.log('[useRecorder] startRec: calling recorder.start()...');
      await recorder.start(settings.selected_mic || undefined);
      console.log('[useRecorder] startRec: recorder started OK');
      const analyser = recorder.getAnalyserNode();
      console.log('[useRecorder] startRec: analyser =', analyser ? 'AVAILABLE' : 'null');
      if (analyser) analyserRef.current = analyser;
      startRef.current = Date.now();
      setState('recording');
      setPartial('');
      setTime(0);
      setClipPeak(0);
      setMicLevel(0);
      timerRef.current = setInterval(() => setTime(Date.now() - startRef.current), TIMER_INTERVAL_MS);
      console.log('[useRecorder] startRec: state set to recording, timer started');
    } catch (err: any) {
      let errorMsg = 'Mic error';
      if (err.name === 'NotAllowedError') errorMsg = 'Mic access denied';
      else if (err.name === 'NotReadableError') errorMsg = 'Mic in use by other app';
      else if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
        // Auto-remedial: clear invalid device, try to find working mic
        errorMsg = 'Mic device not available. Trying to find working mic...';
        setError(errorMsg);
        window.electronAPI.updateSetting('selected_mic', '').catch(() => {});
        
        // Auto-detect best working mic
        try {
          const best = await findBestMic();
          if (best.deviceId) {
            await window.electronAPI.updateSetting('selected_mic', best.deviceId);
            console.log('[useRecorder] Auto-selected new mic:', best.deviceId, best.label);
            // Retry with new device
            const recorder2 = new WavRecorder({ sampleRate: 16000, channels: 1 });
            wavRecorderRef.current = recorder2;
            await recorder2.start(best.deviceId);
            const analyser2 = recorder2.getAnalyserNode();
            if (analyser2) analyserRef.current = analyser2;
            startRef.current = Date.now();
            setState('recording');
            setTime(0);
            setClipPeak(0);
            setMicLevel(0);
            timerRef.current = setInterval(() => setTime(Date.now() - startRef.current), TIMER_INTERVAL_MS);
            console.log('[useRecorder] startRec: retry with auto-detected mic OK');
            return; // skip setError
          }
        } catch (autoErr) {
          console.warn('[useRecorder] Auto-detect failed:', autoErr);
        }
        errorMsg = 'Mic not found. Using default. Check Settings > Recording.';
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
        const rec = wavRecorderRef.current;
        wavRecorderRef.current = null;
        const { buffer, duration } = await rec.stop();
        
        // Validate buffer before sending
        if (!buffer || buffer.byteLength === 0) {
          console.error('[useRecorder] Empty audio buffer received from recorder');
          setError('Recording failed: empty audio');
          setState('idle');
          setTimeout(() => setError(''), 3000);
          return;
        }
        
        // Kirim ArrayBuffer via IPC — preload.ts handle berbagai format buffer
        window.electronAPI.sendAudioData({ buffer: new Uint8Array(buffer), mimeType: 'audio/wav', duration });
        processingTimeoutRef.current = setTimeout(() => {
          if (stateRef.current === 'processing') {
            setError('Timeout');
            setState('idle');
            setTimeout(() => setError(''), PROCESSING_TIMEOUT_MS);
          }
        }, PROCESSING_TIMEOUT_MS);
      } catch (err: any) {
        console.error('[useRecorder] stopRec error:', err);
        setError(err?.message || 'Recording failed');
        setState('idle');
        setTimeout(() => setError(''), 3000);
      }
    }
  }, []);

  const cancelRec = useCallback(async () => {
    if (stateRef.current !== 'recording') {
      if (stateRef.current === 'processing') {
        // Cancel whisper process di main process agar tidak buang resource
        try { await window.electronAPI.cancelTranscription(); } catch {}
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
