/**
 * WAV Recorder - Records audio directly in WAV format
 * Optimized for voice recognition (16kHz, mono, 16-bit PCM)
 */

export interface WavRecorderOptions {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
}

export class WavRecorder {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private chunks: Float32Array[] = [];
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private startTime: number = 0;
  private recording: boolean = false;

  constructor(private options: WavRecorderOptions = {}) {
    this.options = {
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      ...options,
    };
  }

  async start(deviceId?: string): Promise<void> {
    // Request microphone access
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: { ideal: 16000 },
        channelCount: { ideal: 1 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);

    // Create audio context with target sample rate
    this.audioContext = new AudioContext({ sampleRate: this.options.sampleRate });
    
    // Create source from stream
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    
    // Create processor for raw PCM data
    const bufferSize = 4096;
    this.processor = this.audioContext.createScriptProcessor(
      bufferSize,
      1, // Input channels (mono)
      1  // Output channels (mono)
    );

    this.chunks = [];
    this.startTime = Date.now();
    this.recording = true;

    // Collect audio data
    this.processor.onaudioprocess = (event) => {
      if (!this.recording) return;
      
      const inputData = event.inputBuffer.getChannelData(0);
      // Copy data (browser reuses the buffer)
      this.chunks.push(new Float32Array(inputData));
    };

    // Connect nodes
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  async stop(): Promise<{ buffer: ArrayBuffer; duration: number }> {
    this.recording = false;
    const duration = Date.now() - this.startTime;

    // Disconnect audio nodes
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    // Stop microphone tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Close audio context
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    // Encode to WAV format
    const wavBuffer = this.encodeWav(this.chunks, this.options.sampleRate!);
    
    // Clear chunks
    this.chunks = [];

    return { buffer: wavBuffer, duration };
  }

  private encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
    // Merge all chunks into one buffer
    let totalLength = 0;
    for (const chunk of channels) {
      totalLength += chunk.length;
    }

    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of channels) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
    const numSamples = merged.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    // Helper to write string
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // WAV header
    writeString(0, 'RIFF');                      // ChunkID
    view.setUint32(4, 36 + numSamples * 2, true); // ChunkSize
    writeString(8, 'WAVE');                      // Format
    writeString(12, 'fmt ');                     // Subchunk1ID
    view.setUint32(16, 16, true);                // Subchunk1Size (PCM)
    view.setUint16(20, 1, true);                 // AudioFormat (PCM = 1)
    view.setUint16(22, 1, true);                 // NumChannels (mono)
    view.setUint32(24, sampleRate, true);         // SampleRate
    view.setUint32(28, sampleRate * 2, true);     // ByteRate
    view.setUint16(32, 2, true);                  // BlockAlign
    view.setUint16(34, 16, true);                 // BitsPerSample
    writeString(36, 'data');                      // Subchunk2ID
    view.setUint32(40, numSamples * 2, true);     // Subchunk2Size

    // Write PCM samples
    let pos = 44;
    for (let i = 0; i < numSamples; i++) {
      // Clamp to [-1, 1] and convert to Int16
      const sample = Math.max(-1, Math.min(1, merged[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, int16, true);
      pos += 2;
    }

    return buffer;
  }

  isRecording(): boolean {
    return this.recording;
  }

  getAnalyserNode(): AnalyserNode | null {
    if (!this.audioContext || !this.source) return null;
    
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 64;
    this.source.connect(analyser);
    return analyser;
  }
}
