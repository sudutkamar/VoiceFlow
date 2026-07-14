/**
 * Mic Detector — filter virtual devices, find working mic, test audio level.
 *
 * `enumerateDevices()` returns ALL audioinput devices including virtual ones
 * (CABLE, VoiceMeeter, Stereo Mix, NVIDIA Broadcast). Many don't capture
 * real microphone audio. This module filters them and tests which actually work.
 */

const VIRTUAL_KEYWORDS = [
  'cable', 'virtual', 'vb-', 'voicemeeter', 'stereo mix',
  'nvidia broadcast', 'rtx voice', 'wave', 'line in',
  'what u hear', 'loopback', 'auxiliary',
];

const INPUT_KEYWORDS = [
  'microphone', 'mic', 'headset', 'headphone', 'handsfree',
  'webcam', 'camera', 'array', 'realtek', 'audio device',
];

/**
 * Label yang berarti device ini cuma ALIAS/group, bukan device nyata.
 * "Default - ..." dan "Communications - ..." adalah Windows virtual entries
 * yang merujuk ke device yang sudah terdaftar dengan label tanpa prefix.
 */
const ALIAS_PREFIXES = ['default -', 'communications -'];

/**
 * Filter out virtual/non-physical mic devices.
 * Keeps devices that look like real microphones.
 */
export function filterRealMics(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  if (devices.length <= 1) return devices; // no choice, keep all

  const grouped = new Map<string, MediaDeviceInfo[]>();
  for (const d of devices) {
    const key = d.label.toLowerCase().trim();
    if (!key) continue; // skip unlabeled (privacy mode)
    const group = grouped.get(key) || [];
    group.push(d);
    grouped.set(key, group);
  }

  // STEP 1: Remove alias entries ("Default - X", "Communications - X")
  // These are Windows virtual entries pointing to the same hardware device
  // that already appears without prefix. Keeping them causes 3× duplication.
  const deduped = devices.filter(d => {
    const label = d.label.toLowerCase().trim();
    return !ALIAS_PREFIXES.some(p => label.startsWith(p));
  });

  // If removing aliases leaves nothing, use original
  const effective = deduped.length > 0 ? deduped : devices;

  const scored = effective.map(d => {
    const label = d.label.toLowerCase();
    let score = 0;
    // + for real mic keywords
    if (INPUT_KEYWORDS.some(k => label.includes(k))) score += 3;
    // - for virtual keywords
    if (VIRTUAL_KEYWORDS.some(k => label.includes(k))) score -= 5;
    return { device: d, score };
  });

  // Sort by score descending, keep only score >= 0
  const filtered = scored
    .sort((a, b) => b.score - a.score)
    .filter(x => x.score >= 0)
    .map(x => x.device);

  // If filtering removed everything, fallback to all non-alias devices
  return filtered.length > 0 ? filtered : effective;
}

/**
 * Quick test: record 1 second from a device, return average RMS.
 * Higher RMS = device is actually capturing audio.
 * Returns null if device fails.
 */
export async function testMicLevel(
  deviceId: string,
  testDurationMs = 1000
): Promise<number | null> {
  try {
    // Try exact deviceId first
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      // Fallback: tanpa exact constraint — biarkan system pilih default
      // Ini handle kasus deviceId adalah group ID ("Default - ...", "Communications - ...")
      // yang tidak valid untuk exact constraint
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Float32Array(analyser.fftSize);
    const samples: number[] = [];

    await new Promise<void>((resolve) => {
      const collect = () => {
        analyser.getFloatTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((a, v) => a + v * v, 0) / data.length);
        samples.push(rms);
        if (Date.now() - start > testDurationMs) {
          resolve();
        } else {
          requestAnimationFrame(collect);
        }
      };
      const start = Date.now();
      collect();
    });

    // Cleanup
    source.disconnect();
    analyser.disconnect();
    audioContext.close();
    stream.getTracks().forEach(t => t.stop());

    const avgRms = samples.reduce((a, b) => a + b, 0) / samples.length;
    return avgRms;
  } catch {
    return null; // device not accessible
  }
}

/**
 * Auto-select the best working mic.
 * Returns deviceId or empty string for system default.
 */
export async function findBestMic(
  currentDeviceId?: string
): Promise<{ deviceId: string; label: string }> {
  // If current device works, keep it
  if (currentDeviceId) {
    const level = await testMicLevel(currentDeviceId, 500);
    if (level !== null && level > 0.005) {
      return { deviceId: currentDeviceId, label: '' };
    }
  }

  // Enumerate and filter
  const allDevices = await navigator.mediaDevices.enumerateDevices();
  const mics = allDevices.filter(d => d.kind === 'audioinput');
  const realMics = filterRealMics(mics);

  // Test each real mic (max 3, quick 500ms each)
  for (const mic of realMics.slice(0, 5)) {
    if (!mic.deviceId) continue;
    const level = await testMicLevel(mic.deviceId, 500);
    if (level !== null && level > 0.008) {
      return { deviceId: mic.deviceId, label: mic.label };
    }
  }

  // Fallback: first available device that works (even virtual)
  for (const mic of mics) {
    if (!mic.deviceId || mic.deviceId === currentDeviceId) continue;
    const level = await testMicLevel(mic.deviceId, 300);
    if (level !== null) {
      return { deviceId: mic.deviceId, label: mic.label };
    }
  }

  // Last resort: system default
  return { deviceId: '', label: '' };
}

// ═══════════════════════════════════════════════════════════════════
//  Real-time Mic Monitor — level meter + playback test
// ═══════════════════════════════════════════════════════════════════

export interface MicMonitorCallbacks {
  /** Called every frame with current RMS level (0-1) and dB */
  onLevel: (rms: number, dB: number, peak: number) => void;
  /** Called when recording ends with the captured Float32Array */
  onCapture?: (audio: Float32Array) => void;
  /** Called on error */
  onError?: (err: string) => void;
}

export interface MicMonitorHandle {
  stop: () => void;
  getStream: () => MediaStream | null;
}

/**
 * Start monitoring a microphone with real-time level callbacks.
 * Call the returned `stop()` to cleanup.
 *
 * @example
 * ```ts
 * const monitor = startMicMonitor('default', {
 *   onLevel: (rms, dB, peak) => console.log(rms),
 *   onError: (err) => console.error(err),
 * });
 * // later:
 * monitor.stop();
 * ```
 */
export async function startMicMonitor(
  deviceId: string,
  callbacks: MicMonitorCallbacks
): Promise<MicMonitorHandle> {
  let stopped = false;
  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let rafId = 0;

  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      // Fallback tanpa exact constraint untuk handle alias/group IDs
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    }

    audioContext = new AudioContext({ sampleRate: 16000 });
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    const data = new Float32Array(analyser.fftSize);
    const timeData = new Float32Array(analyser.fftSize);

    let peak = 0;
    let peakDecay = 0;

    const loop = () => {
      if (stopped) return;

      analyser!.getFloatTimeDomainData(timeData);
      const rms = Math.sqrt(
        timeData.reduce((a, v) => a + v * v, 0) / timeData.length
      );

      // dB = 20 * log10(rms), clamp to -100 dB floor
      const dB = rms > 0.00001 ? 20 * Math.log10(rms) : -100;

      // Peak tracking with decay
      const maxAbs = Math.max(...Array.from(timeData).map(Math.abs));
      if (maxAbs > peak) peak = maxAbs;
      peakDecay = Math.max(0, peakDecay - 0.005);
      if (maxAbs >= peak) peakDecay = 1.0;
      const currentPeak = peak * peakDecay;

      callbacks.onLevel(rms, dB, currentPeak);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return {
      stop: () => {
        stopped = true;
        cancelAnimationFrame(rafId);
        if (source) source.disconnect();
        if (analyser) analyser.disconnect();
        if (audioContext) audioContext.close().catch(() => {});
        if (stream) stream.getTracks().forEach(t => t.stop());
        source = null;
        analyser = null;
        audioContext = null;
        stream = null;
      },
      getStream: () => stream,
    };
  } catch (err: any) {
    callbacks.onError?.(err.name === 'NotAllowedError' ? 'Mic access denied' : err.message || 'Mic error');
    return {
      stop: () => {},
      getStream: () => null,
    };
  }
}

/**
 * Record audio from a device for N ms, then play it back.
 * Returns actual recorded duration in ms.
 */
export async function recordAndPlayback(
  deviceId: string,
  recordDurationMs = 2000
): Promise<{
  success: boolean;
  recordedMs: number;
  avgRms: number;
  error?: string;
}> {
  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;

  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    }

    audioContext = new AudioContext({ sampleRate: 16000 });
    source = audioContext.createMediaStreamSource(stream);

    // Record chunks
    const chunks: Float32Array[] = [];
    const recorderNode = audioContext.createScriptProcessor(4096, 1, 1);
    source.connect(recorderNode);
    recorderNode.connect(audioContext.destination);

    const startTime = Date.now();

    await new Promise<void>((resolve) => {
      recorderNode.onaudioprocess = (e) => {
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        if (Date.now() - startTime >= recordDurationMs) {
          recorderNode.disconnect();
          resolve();
        }
      };
    });

    const actualDuration = Date.now() - startTime;

    // Merge chunks
    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }

    // Calculate avg RMS
    const rms = Math.sqrt(merged.reduce((a, v) => a + v * v, 0) / merged.length);

    // Play back the recorded audio
    const playbackCtx = new AudioContext();
    const buffer = playbackCtx.createBuffer(1, merged.length, 16000);
    buffer.getChannelData(0).set(merged);
    const playbackSource = playbackCtx.createBufferSource();
    playbackSource.buffer = buffer;
    playbackSource.connect(playbackCtx.destination);
    playbackSource.start();

    // Cleanup recording resources
    source.disconnect();
    recorderNode.disconnect();
    audioContext.close().catch(() => {});
    stream.getTracks().forEach(t => t.stop());

    return {
      success: true,
      recordedMs: actualDuration,
      avgRms: rms,
    };
  } catch (err: any) {
    if (source) source.disconnect();
    if (audioContext) audioContext.close().catch(() => {});
    if (stream) stream.getTracks().forEach(t => t.stop());

    return {
      success: false,
      recordedMs: 0,
      avgRms: 0,
      error: err.name === 'NotAllowedError' ? 'Mic access denied' : err.message || 'Mic error',
    };
  }
}
