import { useState, useEffect, useCallback, useRef } from 'react';
import { WavRecorder } from '../utils/wavRecorder';
import { MIN_RECORDING_MS, PROCESSING_TIMEOUT_MS, DEFAULT_VAD_SILENCE_MS, TIMER_INTERVAL_MS, VAD_SPEECH_THRESHOLD, VAD_HANGOVER_MS, VAD_SMOOTHING_ALPHA } from '../utils/constants';
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
 * Features:
 * - EMA smoothing for stable RMS readings
 * - Hangover mechanism to prevent false stops during natural pauses
 * - Adaptive threshold based on noise floor
 */
function useVad(
  analyserRef: React.MutableRefObject<AnalyserNode | null>,
  active: boolean,
  timeoutMs: number,
  threshold: number = VAD_SPEECH_THRESHOLD,
  hangoverMs: number = VAD_HANGOVER_MS,
  smoothingAlpha: number = VAD_SMOOTHING_ALPHA
): boolean {
  const [silenceDetected, setSilence] = useState(false);
  const silenceStart = useRef(0);
  const animRef = useRef(0);
  const hasDetectedAudio = useRef(false);
  const lastSpeechTime = useRef(0);
  const smoothedRms = useRef(0);
  const maxRecordingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      setSilence(false);
      hasDetectedAudio.current = false;
      silenceStart.current = 0;
      lastSpeechTime.current = 0;
      smoothedRms.current = 0;
      if (maxRecordingTimeout.current) {
        clearTimeout(maxRecordingTimeout.current);
        maxRecordingTimeout.current = null;
      }
      return;
    }

    // Emergency stop: setelah 45 detik, force silence untuk trigger stop
    // Dinaikkan dari 30s ke 45s untuk accommodate long dictation
    const emergencyTimerId = setTimeout(() => {
      // console.log('[VAD] Emergency stop: 45s timeout reached');
      hasDetectedAudio.current = true;
      silenceStart.current = Date.now() - timeoutMs - 100;
    }, 45000);

    const loop = () => {
      const analyser = analyserRef.current;
      if (!analyser) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      
      // Calculate raw RMS
      const rawRms = Math.sqrt(data.reduce((a, v) => a + v * v, 0) / data.length);
      
      // Apply EMA smoothing for stable readings
      if (smoothedRms.current === 0) {
        smoothedRms.current = rawRms;
      } else {
        smoothedRms.current = smoothingAlpha * rawRms + (1 - smoothingAlpha) * smoothedRms.current;
      }
      const rms = smoothedRms.current;
      const now = Date.now();

      if (rms >= threshold) {
        // Speech detected
        hasDetectedAudio.current = true;
        lastSpeechTime.current = now;
        silenceStart.current = 0; // Reset silence timer on speech
      } else {
        // Silence detected
        if (!hasDetectedAudio.current) {
          // Belum pernah dengar suara — terus aja loop
          animRef.current = requestAnimationFrame(loop);
          return;
        }
        
        // HANGOVER: Only start silence timer after hangover period
        const timeSinceLastSpeech = now - lastSpeechTime.current;
        if (timeSinceLastSpeech < hangoverMs) {
          // Still in hangover period — don't start silence timer yet
          animRef.current = requestAnimationFrame(loop);
          return;
        }
        
        // Hangover passed — start/continue silence timer
        if (!silenceStart.current) {
          silenceStart.current = now;
        }
        
        // Check if silence duration exceeds timeout
        if (now - silenceStart.current > timeoutMs) {
          setSilence(true);
        }
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
      lastSpeechTime.current = 0;
      smoothedRms.current = 0;
      setSilence(false);
    };
  }, [active, timeoutMs, threshold, hangoverMs, smoothingAlpha]);

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
 * CRITICAL: Do NOT modify this file without reading .pi/AGENTS.md HARAM ZONE.
 * This hook is part of the critical recording pipeline (🔴 RECORDING).
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
  
  // VAD sensitivity profiles — user-selectable via Settings > Recording
  const vadSensitivity = settings.vad_sensitivity || 'medium';
  const vadProfiles: Record<string, { threshold: number; hangover: number; smoothing: number }> = {
    low:    { threshold: 0.035, hangover: 800, smoothing: 0.25 },  // Low sensitivity: higher threshold, longer hangover
    medium: { threshold: 0.020, hangover: 500, smoothing: 0.30 },  // Medium: balanced (default)
    high:   { threshold: 0.010, hangover: 300, smoothing: 0.40 },  // High: lower threshold, shorter hangover, more reactive
  };
  const vadProfile = vadProfiles[vadSensitivity] || vadProfiles.medium;
  const silenceDetected = useVad(analyserRef, state === 'recording' && vadEnabled, vadSilenceMs, vadProfile.threshold, vadProfile.hangover, vadProfile.smoothing);

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
      await recorder.start(settings.selected_mic || undefined);
      const analyser = recorder.getAnalyserNode();
      if (analyser) analyserRef.current = analyser;
      startRef.current = Date.now();
      setState('recording');
      setPartial('');
      setTime(0);
      setClipPeak(0);
      setMicLevel(0);
      timerRef.current = setInterval(() => setTime(Date.now() - startRef.current), TIMER_INTERVAL_MS);
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
            return; // skip setError
          }
        } catch (autoErr) {
          // Auto-detect failed, will show error below
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
          // console.error('[useRecorder] Empty audio buffer received from recorder');
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
        // console.error('[useRecorder] stopRec error:', err);
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
