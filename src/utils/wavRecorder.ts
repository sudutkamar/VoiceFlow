/**
 * WAV Recorder - Reliable implementation using ScriptProcessorNode
 * Records directly in 16kHz mono 16-bit PCM
 * Includes adaptive VAD (Voice Activity Detection) for auto-stop on silence.
 */

import { AdaptiveVAD, AdaptiveVADOptions } from './adaptiveVAD';

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
  private adaptiveVAD: AdaptiveVAD | null = null;

  // VAD state
  private vadOptions: VadOptions = { enabled: false, silenceThreshold: 0.01, silenceDurationMs: 3000 };
  private onSilenceCallback: (() => void) | null = null;

  constructor(options?: { sampleRate?: number; channels?: number }) {
    // Options are accepted for compatibility, sampleRate/channels are set in start()
  }

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

    // Initialize adaptive VAD
    this.adaptiveVAD = new AdaptiveVAD({
      initialThreshold: vadOptions?.silenceThreshold ?? 0.01,
      maxSilenceDurationMs: vadOptions?.silenceDurationMs ?? 3000,
      hangoverMs: 200,
      minSpeechDurationMs: 100,
      adaptiveThreshold: true,
    });

    // Save vadOptions (fix: parameter sebelumnya tidak pernah di-assign)
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

    // Note: onSilence callback is NOT bridged from AdaptiveVAD to avoid double-VAD conflicts.
    // Auto-stop is handled by the React-level useVad hook which has proper hasDetectedAudio guard.
    // AdaptiveVAD is used for speech detection only.

    // Use ScriptProcessorNode for reliable audio capture
    this.chunks = [];
    this.startTime = Date.now();
    this.recording = true;

    const scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
    scriptProcessor.onaudioprocess = (e) => {
      if (!this.recording) return;
      const channelData = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(channelData));

      // Process with adaptive VAD
      if (this.vadOptions.enabled && this.adaptiveVAD) {
        this.adaptiveVAD.process(channelData);
      }
    };

    this.source.connect(scriptProcessor);
    scriptProcessor.connect(this.audioContext.destination);
    this.processor = scriptProcessor;
  }

  onSilence(callback: () => void): void {
    this.onSilenceCallback = callback;
  }

  async stop(): Promise<{ buffer: ArrayBuffer; duration: number }> {
    this.recording = false;
    const duration = Date.now() - this.startTime;

    // Cleanup ScriptProcessor
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

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

    // Cleanup ScriptProcessor
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

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
  getAdaptiveVAD(): AdaptiveVAD | null { return this.adaptiveVAD; }
}
