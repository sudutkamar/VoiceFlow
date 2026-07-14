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

export class WavRecorder {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private chunks: Float32Array[] = [];
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private startTime: number = 0;
  private recording: boolean = false;
  private analyser: AnalyserNode | null = null;

  constructor(options?: { sampleRate?: number; channels?: number }) {
    // Options are accepted for compatibility, sampleRate/channels are set in start()
  }

  async start(deviceId?: string): Promise<void> {
    // CRITICAL FIX: Proper error handling with resource cleanup
    try {
      console.log('[WavRecorder] Requesting mic:', deviceId || 'default');
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
      console.log('[WavRecorder] Mic obtained, tracks:', this.stream.getAudioTracks().length);
      console.log('[WavRecorder] Track settings:', JSON.stringify(this.stream.getAudioTracks()[0]?.getSettings()));
    } catch (err: any) {
      console.error('[WavRecorder] getUserMedia failed:', err.name, err.message);
      // Don't leak resources if getUserMedia fails
      this.cleanupResources();
      throw err;
    }

    try {
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      console.log('[WavRecorder] AudioContext created, state:', this.audioContext.state);
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      console.log('[WavRecorder] MediaStreamSource created');
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;

      // ── Audio Graph ──────────────────────────────────────────
      //  SINGLE SIGNAL PATH:
      //  source → analyser → scriptProcessor → destination
      //
      //  AnalyserNode ada di dalam signal path sehingga Chromium
      //  tetap memprosesnya (tidak di-optimize-away). VAD hook di
      //  React membaca data dari AnalyserNode via getFloatTimeDomainData.
      //
      //  CRITICAL: Hanya SATU path. Dua path (source → scriptProcessor
      //  DAN source → analyser → scriptProcessor) akan menyebabkan
      //  amplitude DOUBLING karena sinyal audio di-mix dua kali.
      // ─────────────────────────────────────────────────────────

      // Resume AudioContext if suspended (e.g., triggered via hotkey without user gesture)
      // Retry up to 3 times because Chromium sometimes fails silently
      if ((this.audioContext as AudioContext).state === 'suspended') {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await (this.audioContext as AudioContext).resume();
            if ((this.audioContext as AudioContext).state === 'running') break;
          } catch (e) {
            console.warn('[WavRecorder] AudioContext resume attempt', attempt + 1, 'failed:', e);
          }
          await new Promise(r => setTimeout(r, 100));
        }
        console.log('[WavRecorder] AudioContext state after resume:', this.audioContext.state);
      }

      // Start recording with ScriptProcessorNode
      this.chunks = [];
      this.startTime = Date.now();
      this.recording = true;

      let chunkCount = 0;
      const scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      scriptProcessor.onaudioprocess = (e) => {
        if (!this.recording) return;
        const channelData = e.inputBuffer.getChannelData(0);
        this.chunks.push(new Float32Array(channelData));
        
        // DIAGNOSTIC: log audio level setiap 5 chunk
        chunkCount++;
        if (chunkCount % 5 === 0) {
          let sum = 0;
          for (let i = 0; i < channelData.length; i++) {
            sum += Math.abs(channelData[i]);
          }
          const avg = sum / channelData.length;
          if (avg > 0.001) {
            console.log('[WavRecorder] Audio level:', (avg * 1000).toFixed(1), 'chunks:', chunkCount);
          }
        }
      };

      // ── Single signal path ──
      //  source → analyser → scriptProcessor → destination
      //  Analyser ada di path utama sehingga Chromium tetap memprosesnya.
      //  VAD hook membaca data dari AnalyserNode via getFloatTimeDomainData.
      this.source.connect(this.analyser);
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
