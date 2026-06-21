import { Logger } from './logger';

export interface AudioPreprocessorOptions {
  sampleRate?: number;
  noiseReduction?: boolean;
  volumeNormalization?: boolean;
  silenceTrimming?: boolean;
  targetdB?: number;
}

export class AudioPreprocessor {
  private logger: Logger;
  private options: Required<AudioPreprocessorOptions>;

  constructor(logger: Logger, options: AudioPreprocessorOptions = {}) {
    this.logger = logger;
    this.options = {
      sampleRate: options.sampleRate || 16000,
      noiseReduction: options.noiseReduction ?? true,
      volumeNormalization: options.volumeNormalization ?? true,
      silenceTrimming: options.silenceTrimming ?? true,
      targetdB: options.targetdB || -20,
    };
  }

  /**
   * Process audio buffer for better transcription
   */
  async process(audioBuffer: Buffer): Promise<Buffer> {
    try {
      this.logger.info('Audio preprocessing started', {
        inputSize: audioBuffer.length,
        options: this.options,
      });

      let processed = audioBuffer;

      // Step 1: Parse WAV header and get audio data
      const wavInfo = this.parseWavHeader(processed);
      if (!wavInfo) {
        this.logger.warn('Invalid WAV format, skipping preprocessing');
        return audioBuffer;
      }

      // Step 2: Convert to float samples for processing
      let samples = this.bytesToSamples(processed.subarray(wavInfo.dataOffset), wavInfo.bitsPerSample);

      // Step 3: Noise Reduction
      if (this.options.noiseReduction) {
        samples = this.reduceNoise(samples);
        this.logger.info('Noise reduction applied');
      }

      // Step 4: Volume Normalization
      if (this.options.volumeNormalization) {
        samples = this.normalizeVolume(samples);
        this.logger.info('Volume normalization applied');
      }

      // Step 5: Silence Trimming
      if (this.options.silenceTrimming) {
        samples = this.trimSilence(samples);
        this.logger.info('Silence trimming applied');
      }

      // Step 6: Convert back to bytes and rebuild WAV
      const audioBytes = this.samplesToBytes(samples, wavInfo.bitsPerSample);
      const result = this.rebuildWav(wavInfo, audioBytes);

      this.logger.info('Audio preprocessing complete', {
        outputSize: result.length,
        reduction: Math.round((1 - result.length / audioBuffer.length) * 100) + '%',
      });

      return result;
    } catch (error: any) {
      this.logger.error('Audio preprocessing failed', error);
      return audioBuffer; // Return original on error
    }
  }

  /**
   * Parse WAV file header
   */
  private parseWavHeader(buffer: Buffer): {
    channels: number;
    sampleRate: number;
    bitsPerSample: number;
    dataOffset: number;
    dataSize: number;
  } | null {
    try {
      // Check RIFF header
      if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
      if (buffer.toString('ascii', 8, 12) !== 'WAVE') return null;

      let offset = 12;
      while (offset < buffer.length - 8) {
        const chunkId = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);

        if (chunkId === 'fmt ') {
          const audioFormat = buffer.readUInt16LE(offset + 8);
          if (audioFormat !== 1) return null; // Only PCM

          const channels = buffer.readUInt16LE(offset + 10);
          const sampleRate = buffer.readUInt32LE(offset + 12);
          const bitsPerSample = buffer.readUInt16LE(offset + 22);

          // Find data chunk
          let dataOffset = offset + 8 + chunkSize;
          while (dataOffset < buffer.length - 8) {
            const dataChunkId = buffer.toString('ascii', dataOffset, dataOffset + 4);
            const dataChunkSize = buffer.readUInt32LE(dataOffset + 4);

            if (dataChunkId === 'data') {
              return {
                channels,
                sampleRate,
                bitsPerSample,
                dataOffset: dataOffset + 8,
                dataSize: dataChunkSize,
              };
            }
            dataOffset += 8 + dataChunkSize;
          }
        }
        offset += 8 + chunkSize;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Convert byte array to float samples
   */
  private bytesToSamples(buffer: Buffer, bitsPerSample: number): Float32Array {
    const samples = new Float32Array(buffer.length / (bitsPerSample / 8));

    if (bitsPerSample === 16) {
      for (let i = 0; i < samples.length; i++) {
        const offset = i * 2;
        const sample = buffer.readInt16LE(offset);
        samples[i] = sample / 32768.0;
      }
    } else if (bitsPerSample === 8) {
      for (let i = 0; i < samples.length; i++) {
        samples[i] = (buffer[i] - 128) / 128.0;
      }
    }

    return samples;
  }

  /**
   * Convert float samples back to bytes
   */
  private samplesToBytes(samples: Float32Array, bitsPerSample: number): Buffer {
    const bytesPerSample = bitsPerSample / 8;
    const buffer = Buffer.alloc(samples.length * bytesPerSample);

    if (bitsPerSample === 16) {
      for (let i = 0; i < samples.length; i++) {
        const clamped = Math.max(-1, Math.min(1, samples[i]));
        const sample = Math.round(clamped * 32767);
        buffer.writeInt16LE(sample, i * 2);
      }
    } else if (bitsPerSample === 8) {
      for (let i = 0; i < samples.length; i++) {
        const clamped = Math.max(-1, Math.min(1, samples[i]));
        buffer[i] = Math.round((clamped + 1) * 127.5);
      }
    }

    return buffer;
  }

  /**
   * Simple noise reduction using spectral gating
   */
  private reduceNoise(samples: Float32Array): Float32Array {
    const result = new Float32Array(samples.length);
    const windowSize = 512;
    const hopSize = 128;
    const noiseFloor = 0.02; // Threshold for noise

    // Process in overlapping windows
    for (let i = 0; i < samples.length; i += hopSize) {
      const windowEnd = Math.min(i + windowSize, samples.length);
      
      // Calculate RMS of window
      let rms = 0;
      for (let j = i; j < windowEnd; j++) {
        rms += samples[j] * samples[j];
      }
      rms = Math.sqrt(rms / (windowEnd - i));

      // Apply soft gating
      const gain = rms < noiseFloor ? 0.1 : 1.0;
      
      for (let j = i; j < windowEnd; j++) {
        result[j] = samples[j] * gain;
      }
    }

    return result;
  }

  /**
   * Normalize volume to target level
   */
  private normalizeVolume(samples: Float32Array): Float32Array {
    // Find peak amplitude
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }

    if (peak === 0) return samples;

    // Calculate gain to reach target dB
    const targetLinear = Math.pow(10, this.options.targetdB / 20);
    const gain = targetLinear / peak;

    // Limit gain to prevent clipping
    const maxGain = 2.0;
    const limitedGain = Math.min(gain, maxGain);

    // Apply gain
    const result = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      result[i] = samples[i] * limitedGain;
    }

    return result;
  }

  /**
   * Trim silence from beginning and end
   */
  private trimSilence(samples: Float32Array): Float32Array {
    const threshold = 0.01;
    const minSilenceLength = 800; // samples

    // Find start of audio
    let start = 0;
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) > threshold) {
        start = Math.max(0, i - minSilenceLength);
        break;
      }
    }

    // Find end of audio
    let end = samples.length;
    for (let i = samples.length - 1; i >= 0; i--) {
      if (Math.abs(samples[i]) > threshold) {
        end = Math.min(samples.length, i + minSilenceLength);
        break;
      }
    }

    // Return trimmed samples
    return samples.slice(start, end);
  }

  /**
   * Rebuild WAV file with processed audio
   */
  private rebuildWav(wavInfo: any, audioData: Buffer): Buffer {
    const headerSize = 44;
    const buffer = Buffer.alloc(headerSize + audioData.length);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + audioData.length, 4);
    buffer.write('WAVE', 8);

    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // chunk size
    buffer.writeUInt16LE(1, 20); // PCM format
    buffer.writeUInt16LE(wavInfo.channels, 22);
    buffer.writeUInt32LE(wavInfo.sampleRate, 24);
    buffer.writeUInt32LE(wavInfo.sampleRate * wavInfo.channels * (wavInfo.bitsPerSample / 8), 28);
    buffer.writeUInt16LE(wavInfo.channels * (wavInfo.bitsPerSample / 8), 32);
    buffer.writeUInt16LE(wavInfo.bitsPerSample, 34);

    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(audioData.length, 40);
    audioData.copy(buffer, 44);

    return buffer;
  }
}
