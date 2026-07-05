/**
 * WAV Recorder - Optimized for speed
 * Records directly in 16kHz mono 16-bit PCM
 * Includes mini VAD (Voice Activity Detection) for auto-stop on silence.
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
  private silenceStartTime: number = 0;
  private isSilent: boolean = false;

  async start(deviceId?: string, vadOptions?: Partial<VadOptions>): Promise<void> {
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

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 64;
    this.source.connect(this.analyser);

    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.startTime = Date.now();
    this.recording = true;

    // Reset VAD state
    this.silenceStartTime = 0;
    this.isSilent = false;
    if (vadOptions) {
      this.vadOptions = {
        enabled: vadOptions.enabled ?? false,
        silenceThreshold: vadOptions.silenceThreshold ?? 0.01,
        silenceDurationMs: vadOptions.silenceDurationMs ?? 3000,
      };
    }

    this.processor.onaudioprocess = (e) => {
      if (!this.recording) return;
      const channelData = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(channelData));

      // Mini VAD: check silence level
      if (this.vadOptions.enabled && this.onSilenceCallback) {
        this.detectSilence(channelData);
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  /**
   * Simple VAD: calculate RMS of current audio chunk and detect sustained silence.
   */
  private detectSilence(samples: Float32Array): void {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);
    const now = Date.now();

    if (rms < this.vadOptions.silenceThreshold) {
      // Audio is below threshold
      if (!this.isSilent) {
        // Just became silent — start tracking
        this.isSilent = true;
        this.silenceStartTime = now;
      } else if (now - this.silenceStartTime >= this.vadOptions.silenceDurationMs) {
        // Silence持续足够久 — trigger auto-stop
        this.isSilent = false;
        this.onSilenceCallback?.();
      }
    } else {
      // Audio is above threshold — reset silence tracking
      this.isSilent = false;
      this.silenceStartTime = 0;
    }
  }

  onSilence(callback: () => void): void {
    this.onSilenceCallback = callback;
  }

  async stop(): Promise<{ buffer: ArrayBuffer; duration: number }> {
    this.recording = false;
    const duration = Date.now() - this.startTime;

    if (this.processor) { this.processor.disconnect(); this.processor = null; }
    if (this.source) { this.source.disconnect(); this.source = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.audioContext) { await this.audioContext.close(); this.audioContext = null; }

    const wavBuffer = this.encodeWav(this.chunks, 16000);
    this.chunks = [];
    this.analyser = null;

    return { buffer: wavBuffer, duration };
  }

  /**
   * Cancel recording — stop mic and discard all audio without encoding.
   */
  async cancel(): Promise<void> {
    this.recording = false;

    if (this.processor) { this.processor.disconnect(); this.processor = null; }
    if (this.source) { this.source.disconnect(); this.source = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.audioContext) { await this.audioContext.close(); this.audioContext = null; }

    this.chunks = [];
    this.analyser = null;
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
