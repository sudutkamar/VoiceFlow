import { Logger } from './logger';

export interface AudioPreprocessorOptions {
  sampleRate?: number;
  highPassFreq?: number;     // Hz - remove low frequency rumble
  lowPassFreq?: number;      // Hz - remove high frequency hiss
  noiseGateThreshold?: number; // 0-1 linear amplitude
  noiseReduction?: boolean;
  volumeNormalization?: boolean;
  silenceTrimming?: boolean;
  dynamicCompression?: boolean;
  targetRmsDb?: number;      // target RMS level in dB
  targetPeakDb?: number;     // target peak level in dB
}

/**
 * Professional-grade audio preprocessor for speech recognition.
 * 
 * Pipeline:
 * 1. High-pass filter (remove rumble below 80Hz)
 * 2. Low-pass filter (remove hiss above 7500Hz)
 * 3. Noise gate (suppress quiet noise)
 * 4. Adaptive noise reduction (spectral subtraction)
 * 5. Dynamic range compression (even out volume)
 * 6. Volume normalization (consistent loudness)
 * 7. Silence trimming (remove leading/trailing silence)
 */
export class AudioPreprocessor {
  private logger: Logger;
  private options: Required<AudioPreprocessorOptions>;

  constructor(logger: Logger, options: AudioPreprocessorOptions = {}) {
    this.logger = logger;
    this.options = {
      sampleRate: options.sampleRate || 16000,
      highPassFreq: options.highPassFreq || 40,       // Raised: whisper handles low freq well, 80Hz cuts male voice bass
      lowPassFreq: options.lowPassFreq || 8000,       // Raised: whisper mel spectrogram goes to 8kHz
      noiseGateThreshold: options.noiseGateThreshold || 0.005,
      noiseReduction: options.noiseReduction ?? false, // Disabled: whisper is robust to noise, spectral subtraction can remove speech harmonics
      volumeNormalization: options.volumeNormalization ?? true,
      silenceTrimming: options.silenceTrimming ?? true,
      dynamicCompression: options.dynamicCompression ?? false, // Disabled: alters voice characteristics, whisper handles volume variation
      targetRmsDb: options.targetRmsDb || -20,        // More conservative target
      targetPeakDb: options.targetPeakDb || -1,
    };
  }

  /**
   * Main processing pipeline
   */
  async process(audioBuffer: Buffer): Promise<Buffer> {
    try {
      const wavInfo = this.parseWavHeader(audioBuffer);
      if (!wavInfo) {
        this.logger.warn('Invalid WAV format, skipping preprocessing');
        return audioBuffer;
      }

      let samples = this.bytesToSamples(
        audioBuffer.subarray(wavInfo.dataOffset),
        wavInfo.bitsPerSample,
        wavInfo.channels
      );

      const originalSamples = new Float32Array(samples);

      // Step 1: High-pass filter (remove DC offset + low frequency rumble)
      samples = this.applyHighPassFilter(samples, this.options.highPassFreq, wavInfo.sampleRate);

      // Step 2: Low-pass filter (remove high frequency noise/hiss)
      samples = this.applyLowPassFilter(samples, this.options.lowPassFreq, wavInfo.sampleRate);

      // Step 3: Noise gate (suppress very quiet sections)
      samples = this.applyNoiseGate(samples, this.options.noiseGateThreshold);

      // Step 4: Adaptive noise reduction
      if (this.options.noiseReduction) {
        samples = this.adaptiveNoiseReduction(samples, wavInfo.sampleRate);
      }

      // Step 5: Dynamic range compression
      if (this.options.dynamicCompression) {
        samples = this.dynamicRangeCompression(samples);
      }

      // Step 6: Volume normalization
      if (this.options.volumeNormalization) {
        samples = this.normalizeVolumeHybrid(samples, this.options.targetRmsDb, this.options.targetPeakDb);
      }

      // Step 7: Silence trimming
      if (this.options.silenceTrimming) {
        samples = this.trimSilenceAdaptive(samples, wavInfo.sampleRate);
      }

      // Calculate improvement stats
      const origRms = this.calculateRms(originalSamples);
      const finalRms = this.calculateRms(samples);
      const origPeak = this.calculatePeak(originalSamples);
      const finalPeak = this.calculatePeak(samples);

      this.logger.info('Audio preprocessing complete', {
        inputSamples: originalSamples.length,
        outputSamples: samples.length,
        origRmsDb: this.linearToDb(origRms).toFixed(1),
        finalRmsDb: this.linearToDb(finalRms).toFixed(1),
        origPeakDb: this.linearToDb(origPeak).toFixed(1),
        finalPeakDb: this.linearToDb(finalPeak).toFixed(1),
      });

      const audioBytes = this.samplesToBytes(samples, wavInfo.bitsPerSample);
      return this.rebuildWav(wavInfo, audioBytes);
    } catch (error: any) {
      this.logger.error('Audio preprocessing failed, returning original', error);
      return audioBuffer;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  WAV Parser
  // ═══════════════════════════════════════════════════════════════

  private parseWavHeader(buffer: Buffer): {
    channels: number;
    sampleRate: number;
    bitsPerSample: number;
    dataOffset: number;
    dataSize: number;
  } | null {
    try {
      if (buffer.length < 44) return null;
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

          let dataOffset = offset + 8 + chunkSize;
          while (dataOffset < buffer.length - 8) {
            const dataChunkId = buffer.toString('ascii', dataOffset, dataOffset + 4);
            const dataChunkSize = buffer.readUInt32LE(dataOffset + 4);
            if (dataChunkId === 'data') {
              return { channels, sampleRate, bitsPerSample, dataOffset: dataOffset + 8, dataSize: dataChunkSize };
            }
            dataOffset += 8 + dataChunkSize;
          }
        }
        offset += 8 + chunkSize;
      }
      return null;
    } catch { return null; }
  }

  private bytesToSamples(buffer: Buffer, bitsPerSample: number, channels: number): Float32Array {
    const bytesPerSample = bitsPerSample / 8;
    const totalSamples = Math.floor(buffer.length / bytesPerSample);
    const monoSamples = Math.floor(totalSamples / channels);
    const samples = new Float32Array(monoSamples);

    if (bitsPerSample === 16) {
      for (let i = 0; i < monoSamples; i++) {
        let sum = 0;
        for (let ch = 0; ch < channels; ch++) {
          const idx = (i * channels + ch) * 2;
          if (idx + 1 < buffer.length) {
            sum += buffer.readInt16LE(idx) / 32768.0;
          }
        }
        samples[i] = sum / channels;
      }
    } else if (bitsPerSample === 8) {
      for (let i = 0; i < monoSamples; i++) {
        let sum = 0;
        for (let ch = 0; ch < channels; ch++) {
          const idx = i * channels + ch;
          if (idx < buffer.length) {
            sum += (buffer[idx] - 128) / 128.0;
          }
        }
        samples[i] = sum / channels;
      }
    } else if (bitsPerSample === 32) {
      for (let i = 0; i < monoSamples; i++) {
        let sum = 0;
        for (let ch = 0; ch < channels; ch++) {
          const idx = (i * channels + ch) * 4;
          if (idx + 3 < buffer.length) {
            sum += buffer.readFloatLE(idx);
          }
        }
        samples[i] = sum / channels;
      }
    }

    return samples;
  }

  private samplesToBytes(samples: Float32Array, bitsPerSample: number): Buffer {
    const bytesPerSample = bitsPerSample / 8;
    const buffer = Buffer.alloc(samples.length * bytesPerSample);

    if (bitsPerSample === 16) {
      for (let i = 0; i < samples.length; i++) {
        const clamped = Math.max(-1, Math.min(1, samples[i]));
        buffer.writeInt16LE(Math.round(clamped * 32767), i * 2);
      }
    } else if (bitsPerSample === 8) {
      for (let i = 0; i < samples.length; i++) {
        const clamped = Math.max(-1, Math.min(1, samples[i]));
        buffer[i] = Math.round((clamped + 1) * 127.5);
      }
    }

    return buffer;
  }

  private rebuildWav(wavInfo: any, audioData: Buffer): Buffer {
    const buffer = Buffer.alloc(44 + audioData.length);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + audioData.length, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(wavInfo.channels, 22);
    buffer.writeUInt32LE(wavInfo.sampleRate, 24);
    buffer.writeUInt32LE(wavInfo.sampleRate * wavInfo.channels * (wavInfo.bitsPerSample / 8), 28);
    buffer.writeUInt16LE(wavInfo.channels * (wavInfo.bitsPerSample / 8), 32);
    buffer.writeUInt16LE(wavInfo.bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(audioData.length, 40);
    audioData.copy(buffer, 44);
    return buffer;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DSP: Filters (2nd-order Butterworth IIR)
  // ═══════════════════════════════════════════════════════════════

  /**
   * 2nd-order Butterworth high-pass filter.
   * Removes DC offset and low frequency rumble (engine noise, wind, handling).
   */
  private applyHighPassFilter(samples: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
    const result = new Float32Array(samples.length);
    const rc = 1.0 / (2 * Math.PI * cutoffHz);
    const dt = 1.0 / sampleRate;
    const alpha = rc / (rc + dt);

    // 2nd order: cascade two 1st-order sections for steeper rolloff (-40dB/decade)
    let prevIn1 = 0, prevOut1 = 0;
    let prevIn2 = 0, prevOut2 = 0;

    // Forward pass
    for (let i = 0; i < samples.length; i++) {
      // Stage 1
      const out1 = alpha * (prevOut1 + samples[i] - prevIn1);
      prevIn1 = samples[i];
      prevOut1 = out1;
      // Stage 2
      const out2 = alpha * (prevOut2 + out1 - prevIn2);
      prevIn2 = out1;
      prevOut2 = out2;

      result[i] = out2;
    }

    // Backward pass (zero-phase / forward-backward filtering — no phase distortion)
    prevIn1 = 0; prevOut1 = 0;
    prevIn2 = 0; prevOut2 = 0;
    const temp = new Float32Array(samples.length);

    for (let i = samples.length - 1; i >= 0; i--) {
      const out1 = alpha * (prevOut1 + result[i] - prevIn1);
      prevIn1 = result[i];
      prevOut1 = out1;
      const out2 = alpha * (prevOut2 + out1 - prevIn2);
      prevIn2 = out1;
      prevOut2 = out2;
      temp[i] = out2;
    }

    return temp;
  }

  /**
   * 2nd-order Butterworth low-pass filter.
   * Removes high frequency hiss and noise above speech range.
   */
  private applyLowPassFilter(samples: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
    const result = new Float32Array(samples.length);
    const rc = 1.0 / (2 * Math.PI * cutoffHz);
    const dt = 1.0 / sampleRate;
    const alpha = dt / (rc + dt);

    // 2nd order cascade
    let prevOut1 = 0;
    let prevOut2 = 0;

    // Forward pass
    for (let i = 0; i < samples.length; i++) {
      const out1 = prevOut1 + alpha * (samples[i] - prevOut1);
      prevOut1 = out1;
      const out2 = prevOut2 + alpha * (out1 - prevOut2);
      prevOut2 = out2;
      result[i] = out2;
    }

    // Backward pass (zero-phase)
    prevOut1 = 0;
    prevOut2 = 0;
    const temp = new Float32Array(samples.length);

    for (let i = samples.length - 1; i >= 0; i--) {
      const out1 = prevOut1 + alpha * (result[i] - prevOut1);
      prevOut1 = out1;
      const out2 = prevOut2 + alpha * (out1 - prevOut2);
      prevOut2 = out2;
      temp[i] = out2;
    }

    return temp;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DSP: Noise Gate
  // ═══════════════════════════════════════════════════════════════

  /**
   * Noise gate with attack/release envelope.
   * Suppresses audio below threshold to clean up background noise.
   */
  private applyNoiseGate(samples: Float32Array, threshold: number): Float32Array {
    const result = new Float32Array(samples.length);
    const sampleRate = this.options.sampleRate;
    const attackSamples = Math.floor(sampleRate * 0.005);  // 5ms attack
    const releaseSamples = Math.floor(sampleRate * 0.050); // 50ms release

    let gateOpen = false;
    let envelope = 0;

    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);

      if (abs > threshold) {
        // Open gate with fast attack
        envelope = Math.min(1, envelope + 1 / attackSamples);
        gateOpen = true;
      } else if (gateOpen) {
        // Close gate with slow release (smoother)
        envelope = Math.max(0, envelope - 1 / releaseSamples);
        if (envelope <= 0) gateOpen = false;
      } else {
        envelope = 0;
      }

      result[i] = samples[i] * envelope;
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DSP: Adaptive Noise Reduction (Spectral Subtraction)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Adaptive noise reduction using noise profile estimation.
   * Estimates noise from the quietest 10% of the audio and subtracts it.
   */
  private adaptiveNoiseReduction(samples: Float32Array, sampleRate: number): Float32Array {
    const fftSize = 1024;
    const hopSize = 256;
    const numFrames = Math.floor((samples.length - fftSize) / hopSize);

    if (numFrames < 4) return samples; // Too short for spectral processing

    // Step 1: Estimate noise profile from quietest frames
    const frameEnergies: number[] = [];
    for (let f = 0; f < numFrames; f++) {
      let energy = 0;
      const start = f * hopSize;
      for (let i = 0; i < fftSize; i++) {
        const s = samples[start + i] || 0;
        energy += s * s;
      }
      frameEnergies.push(Math.sqrt(energy / fftSize));
    }

    // Sort frames by energy, take bottom 10% as noise profile
    const sortedIndices = frameEnergies
      .map((e, i) => ({ e, i }))
      .sort((a, b) => a.e - b.e)
      .map(x => x.i);

    const noiseFrameCount = Math.max(2, Math.floor(numFrames * 0.1));
    const noiseFrames = new Set(sortedIndices.slice(0, noiseFrameCount));

    // Step 2: Estimate noise spectrum (average magnitude of noise frames)
    const halfFFT = fftSize / 2;
    const noiseSpectrum = new Float32Array(halfFFT);
    let noiseCount = 0;

    for (let f = 0; f < numFrames; f++) {
      if (!noiseFrames.has(f)) continue;
      const start = f * hopSize;
      for (let i = 0; i < halfFFT; i++) {
        // Simple magnitude estimate (real part approximation)
        let mag = 0;
        for (let j = 0; j < fftSize; j++) {
          const angle = (2 * Math.PI * i * j) / fftSize;
          mag += (samples[start + j] || 0) * Math.cos(angle);
        }
        noiseSpectrum[i] += Math.abs(mag) / fftSize;
      }
      noiseCount++;
    }

    if (noiseCount > 0) {
      for (let i = 0; i < halfFFT; i++) {
        noiseSpectrum[i] /= noiseCount;
      }
    }

    // Step 3: Apply spectral subtraction with oversubtraction factor
    const oversubtraction = 2.0; // How aggressively to remove noise
    const floor = 0.02;         // Spectral floor (don't subtract below this)
    const result = new Float32Array(samples.length);

    // Copy original samples first
    result.set(samples);

    for (let f = 0; f < numFrames; f++) {
      if (noiseFrames.has(f)) continue; // Don't process noise frames

      const start = f * hopSize;
      for (let i = 0; i < halfFFT; i++) {
        // Estimate magnitude at this frequency bin
        let mag = 0;
        for (let j = 0; j < fftSize; j++) {
          const angle = (2 * Math.PI * i * j) / fftSize;
          mag += (samples[start + j] || 0) * Math.cos(angle);
        }
        mag = Math.abs(mag) / fftSize;

        // Spectral subtraction
        const cleanMag = Math.max(floor * mag, mag - oversubtraction * noiseSpectrum[i]);
        const gain = cleanMag / Math.max(mag, 0.0001);

        // Apply gain to samples in this frame
        for (let j = 0; j < fftSize && (start + j) < samples.length; j++) {
          result[start + j] *= gain;
        }
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DSP: Dynamic Range Compression
  // ═══════════════════════════════════════════════════════════════

  /**
   * Soft-knee dynamic range compressor.
   * Evens out volume differences between quiet and loud speech.
   */
  private dynamicRangeCompression(samples: Float32Array): Float32Array {
    const result = new Float32Array(samples.length);
    const threshold = 0.3;   // Compress above this level
    const ratio = 3.0;       // Compression ratio
    const attack = 0.01;     // Attack time constant
    const release = 0.1;     // Release time constant

    let envelope = 0;

    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);

      // Envelope follower
      if (abs > envelope) {
        envelope = envelope + attack * (abs - envelope); // Attack
      } else {
        envelope = envelope + release * (abs - envelope); // Release
      }

      // Gain calculation with soft knee
      let gain = 1;
      if (envelope > threshold) {
        const over = envelope / threshold;
        const compressed = Math.pow(over, 1 / ratio);
        gain = (compressed * threshold) / envelope;
      }

      result[i] = samples[i] * gain;
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DSP: Volume Normalization
  // ═══════════════════════════════════════════════════════════════

  /**
   * Hybrid normalization using both peak and RMS levels.
   * Target: consistent loudness for optimal whisper accuracy.
   */
  private normalizeVolumeHybrid(samples: Float32Array, targetRmsDb: number, targetPeakDb: number): Float32Array {
    const currentRms = this.calculateRms(samples);
    const currentPeak = this.calculatePeak(samples);

    if (currentRms === 0 || currentPeak === 0) return samples;

    const currentRmsDb = this.linearToDb(currentRms);
    const currentPeakDb = this.linearToDb(currentPeak);

    // Calculate gains
    const rmsGain = Math.pow(10, (targetRmsDb - currentRmsDb) / 20);
    const peakGain = Math.pow(10, (targetPeakDb - currentPeakDb) / 20);

    // Use the more conservative gain (prefer RMS for speech)
    const gain = Math.min(rmsGain, peakGain);

    // Limit maximum gain to prevent amplifying noise too much
    const maxGain = 4.0;
    const limitedGain = Math.min(gain, maxGain);

    const result = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      result[i] = Math.max(-0.99, Math.min(0.99, samples[i] * limitedGain));
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DSP: Silence Trimming
  // ═══════════════════════════════════════════════════════════════

  /**
   * Adaptive silence trimming with voice activity detection.
   * Keeps small padding around speech for natural sound.
   */
  private trimSilenceAdaptive(samples: Float32Array, sampleRate: number): Float32Array {
    const frameSize = Math.floor(sampleRate * 0.02); // 20ms frames
    const hopSize = Math.floor(frameSize / 2);

    // Calculate RMS for each frame
    const frameRms: number[] = [];
    for (let i = 0; i < samples.length; i += hopSize) {
      const end = Math.min(i + frameSize, samples.length);
      let sum = 0;
      let count = 0;
      for (let j = i; j < end; j++) {
        sum += samples[j] * samples[j];
        count++;
      }
      frameRms.push(count > 0 ? Math.sqrt(sum / count) : 0);
    }

    if (frameRms.length === 0) return samples;

    // Adaptive threshold: based on the distribution of frame energies
    const sortedRms = [...frameRms].sort((a, b) => a - b);
    const p10 = sortedRms[Math.floor(sortedRms.length * 0.1)]; // 10th percentile (noise floor)
    const p90 = sortedRms[Math.floor(sortedRms.length * 0.9)]; // 90th percentile (speech level)
    const threshold = Math.max(p10 * 3, (p10 + p90) * 0.1);    // Dynamic threshold

    // Find first and last speech frames
    const paddingFrames = Math.floor(sampleRate * 0.05 / hopSize); // 50ms padding

    let startFrame = frameRms.findIndex(rms => rms > threshold);
    let endFrame = frameRms.length - 1;
    for (let i = frameRms.length - 1; i >= 0; i--) {
      if (frameRms[i] > threshold) {
        endFrame = i;
        break;
      }
    }

    // Add padding
    startFrame = Math.max(0, startFrame - paddingFrames);
    endFrame = Math.min(frameRms.length - 1, endFrame + paddingFrames);

    const startSample = startFrame * hopSize;
    const endSample = Math.min(samples.length, (endFrame + 1) * hopSize);

    if (endSample <= startSample) return samples; // Safety check

    return samples.slice(startSample, endSample);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Utility Functions
  // ═══════════════════════════════════════════════════════════════

  private calculateRms(samples: Float32Array): number {
    if (samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  private calculatePeak(samples: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }
    return peak;
  }

  private linearToDb(linear: number): number {
    if (linear <= 0) return -100;
    return 20 * Math.log10(linear);
  }
}
