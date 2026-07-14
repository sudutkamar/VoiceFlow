/**
 * WAV Recorder — ScriptProcessorNode implementation.
 * 
 * Records audio directly in 16kHz mono 16-bit PCM format.
 * Used by useRecorder hook for the main recording pipeline.
 * 
 * @example
 * ```typescript
 * const recorder = new WavRecorder({ sampleRate: 16000, channels: 1 });
 * await recorder.start(micId, { enabled: true, silenceThreshold: 0.01 });
 * const { buffer, duration } = await recorder.stop();
 * ```
 *
 * NOTE: ScriptProcessorNode is deprecated in web standards but fully supported
 * in Electron (Chromium). Migration to AudioWorkletNode deferred to v1.1.
 *
 * CRITICAL: Do NOT modify this file without reading AGENTS.md Rule #1.
 * This file is part of the critical recording pipeline.
 */

export interface VadOptions {
  enabled: boolean;
  silenceThreshold: number;  // RMS level below this = silence (0-1, default 0.01)
  silenceDurationMs: number; // How long silence must last before auto-stop (default 3000ms)
}

export class WavRecorder {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private chunks: Float32Array[] = [];
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private startTime: number = 0;
  private recording: boolean = false;
  private analyser: AnalyserNode | null = null;

  // VAD state
  private vadOptions: VadOptions = { enabled: false, silenceThreshold: 0.01, silenceDurationMs: 3000 };
  private onSilenceCallback: (() => void) | null = null;

  constructor(options?: { sampleRate?: number; channels?: number }) {
    // Options are accepted for compatibility, sampleRate/channels are set in start()
  }

  async start(deviceId?: string, vadOptions?: Partial<VadOptions>): Promise<void> {
    // CRITICAL FIX: Proper error handling with resource cleanup
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 16000 },
          channelCount: { ideal: 1 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
    } catch (err: any) {
      // Don't leak resources if getUserMedia fails
      this.cleanupResources();
      throw err;
    }

    try {
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256; // 128 frequency bins — better resolution for waveform visualization
      // CRITICAL: analyser MUST be in the signal path, not a dead-end.
      // Dead-end AnalyserNodes may not process data in some Chromium versions.
      // Signal: source → analyser → scriptProcessor → destination
      this.source.connect(this.analyser);

      // Save vadOptions
      if (vadOptions) {
        this.vadOptions = {
          enabled: vadOptions.enabled ?? this.vadOptions.enabled,
          silenceThreshold: vadOptions.silenceThreshold ?? this.vadOptions.silenceThreshold,
          silenceDurationMs: vadOptions.silenceDurationMs ?? this.vadOptions.silenceDurationMs,
        };
      }

      // Resume AudioContext if suspended (e.g., triggered via hotkey without user gesture)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Start recording with ScriptProcessorNode
      this.chunks = [];
      this.startTime = Date.now();
      this.recording = true;

      const scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      scriptProcessor.onaudioprocess = (e) => {
        if (!this.recording) return;
        const channelData = e.inputBuffer.getChannelData(0);
        this.chunks.push(new Float32Array(channelData));
      };

      // Route analyser output through scriptProcessor to destination
      // This keeps analyser in the signal path so it receives audio data
      this.analyser.connect(scriptProcessor);
      scriptProcessor.connect(this.audioContext.destination);
      this.processor = scriptProcessor;

    } catch (err: any) {
      // CRITICAL: Cleanup all resources if setup fails
      this.cleanupResources();
      throw err;
    }
  }

  async stop(): Promise<{ buffer: ArrayBuffer; duration: number }> {
    const duration = Date.now() - this.startTime;
    this.recording = false;

    // Disconnect audio graph
    this.disconnectAudioGraph();

    const wavBuffer = this.encodeWav(this.chunks, 16000);
    this.cleanupResources();

    return { buffer: wavBuffer, duration };
  }

  /**
   * Cancel recording — stop mic and discard all audio without encoding.
   */
  async cancel(): Promise<void> {
    this.recording = false;
    this.disconnectAudioGraph();
    this.cleanupResources();
  }

  /**
   * Disconnect all audio graph nodes safely.
   */
  private disconnectAudioGraph(): void {
    try { this.processor?.disconnect(); } catch {}
    try { this.source?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    this.processor = null;
    this.source = null;
    this.analyser = null;
  }

  /**
   * CRITICAL: Cleanup ALL resources to prevent memory leaks.
   * This MUST be called on stop, cancel, or error.
   */
  private cleanupResources(): void {
    // Stop all stream tracks (microphone)
    if (this.stream) {
      this.stream.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      this.stream = null;
    }

    // Close AudioContext (check state first to avoid double-close)
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;

    this.chunks = [];
  }

  private encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
    let totalLength = 0;
    for (const chunk of channels) totalLength += chunk.length;

    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of channels) { merged.set(chunk, offset); offset += chunk.length; }

    const numSamples = merged.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeStr = (off: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    let pos = 44;
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, merged[i]));
      view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      pos += 2;
    }

    return buffer;
  }

  isRecording(): boolean { return this.recording; }
  getAnalyserNode(): AnalyserNode | null { return this.analyser; }
}
