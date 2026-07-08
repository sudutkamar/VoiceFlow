/**
 * Adaptive Voice Activity Detection (VAD)
 * 
 * Features:
 * - Adaptive threshold based on ambient noise profiling
 * - Energy-based detection with spectral analysis
 * - Hangover mechanism to prevent clipping speech
 * - Minimum speech duration filtering
 * - Noise floor estimation
 */

export interface AdaptiveVADOptions {
  /** Initial silence threshold (0-1, default 0.01) */
  initialThreshold: number;
  /** Hangover time in ms to prevent clipping (default 200ms) */
  hangoverMs: number;
  /** Minimum speech duration to trigger (default 100ms) */
  minSpeechDurationMs: number;
  /** Maximum silence duration before auto-stop (default 1500ms) */
  maxSilenceDurationMs: number;
  /** Noise profiling window in ms (default 500ms) */
  noiseProfileWindowMs: number;
  /** Number of noise profile samples (default 10) */
  noiseProfileSamples: number;
  /** Enable adaptive threshold (default true) */
  adaptiveThreshold: boolean;
}

export interface VADState {
  isSpeaking: boolean;
  speechDuration: number;
  silenceDuration: number;
  noiseFloor: number;
  currentThreshold: number;
  energyLevel: number;
}

export type VADCallback = (state: VADState) => void;

export class AdaptiveVAD {
  private options: AdaptiveVADOptions;
  private state: VADState;
  
  // Noise profiling
  private noiseSamples: number[] = [];
  private energyHistory: number[] = [];
  private energyHistorySize: number = 50; // Keep last 50 energy readings
  
  // Timing
  private lastSpeechTime: number = 0;
  private lastSilenceTime: number = 0;
  private speechStartTime: number = 0;
  private silenceStartTime: number = 0;
  
  // Callbacks
  private onSpeechStart: (() => void) | null = null;
  private onSpeechEnd: (() => void) | null = null;
  private onSilence: (() => void) | null = null;
  private onStateChange: VADCallback | null = null;

  constructor(options?: Partial<AdaptiveVADOptions>) {
    this.options = {
      initialThreshold: options?.initialThreshold ?? 0.01,
      hangoverMs: options?.hangoverMs ?? 200,
      minSpeechDurationMs: options?.minSpeechDurationMs ?? 100,
      maxSilenceDurationMs: options?.maxSilenceDurationMs ?? 1500,
      noiseProfileWindowMs: options?.noiseProfileWindowMs ?? 500,
      noiseProfileSamples: options?.noiseProfileSamples ?? 10,
      adaptiveThreshold: options?.adaptiveThreshold ?? true,
    };

    this.state = {
      isSpeaking: false,
      speechDuration: 0,
      silenceDuration: 0,
      noiseFloor: this.options.initialThreshold,
      currentThreshold: this.options.initialThreshold,
      energyLevel: 0,
    };
  }

  /**
   * Process audio samples and detect speech
   */
  process(samples: Float32Array): void {
    const energy = this.calculateEnergy(samples);
    const now = Date.now();
    
    // Update energy history for adaptive threshold
    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.energyHistorySize) {
      this.energyHistory.shift();
    }

    // Update noise floor estimation
    if (this.options.adaptiveThreshold) {
      this.updateNoiseFloor(energy, now);
      this.updateAdaptiveThreshold();
    }

    this.state.energyLevel = energy;

    // Speech detection
    if (energy > this.state.currentThreshold) {
      // Speech detected
      if (!this.state.isSpeaking) {
        // Check minimum speech duration
        const speechDuration = now - this.silenceStartTime;
        if (speechDuration >= this.options.minSpeechDurationMs) {
          this.state.isSpeaking = true;
          this.state.speechDuration = 0;
          this.speechStartTime = now;
          this.lastSpeechTime = now;
          this.state.silenceDuration = 0;
          this.onSpeechStart?.();
        }
      } else {
        // Update speech duration
        this.state.speechDuration = now - this.speechStartTime;
        this.lastSpeechTime = now;
        this.state.silenceDuration = 0;
      }
    } else {
      // Silence detected
      if (this.state.isSpeaking) {
        // Check hangover time
        const hangoverTime = now - this.lastSpeechTime;
        if (hangoverTime >= this.options.hangoverMs) {
          // Speech ended
          this.state.isSpeaking = false;
          this.state.silenceDuration = 0;
          this.silenceStartTime = now;
          this.onSpeechEnd?.();
        }
      } else {
        // Update silence duration
        this.state.silenceDuration = now - this.silenceStartTime;
        
        // Check if silence duration exceeds max
        if (this.state.silenceDuration >= this.options.maxSilenceDurationMs) {
          this.onSilence?.();
        }
      }
    }

    // Notify state change
    this.onStateChange?.(this.state);
  }

  /**
   * Calculate RMS energy from audio samples
   */
  private calculateEnergy(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  /**
   * Update noise floor estimation
   */
  private updateNoiseFloor(energy: number, now: number): void {
    // Add to noise samples during silence periods
    if (!this.state.isSpeaking) {
      this.noiseSamples.push(energy);
      
      // Keep only recent noise samples
      const maxSamples = Math.ceil(this.options.noiseProfileWindowMs / 32); // ~32ms per chunk
      if (this.noiseSamples.length > maxSamples) {
        this.noiseSamples.shift();
      }
    }
  }

  /**
   * Update adaptive threshold based on noise floor
   */
  private updateAdaptiveThreshold(): void {
    if (this.noiseSamples.length < 3) return;

    // Calculate noise floor as median of recent noise samples
    const sorted = [...this.noiseSamples].sort((a, b) => a - b);
    const medianIndex = Math.floor(sorted.length / 2);
    this.state.noiseFloor = sorted[medianIndex];

    // Set threshold as noise floor + margin
    // Use energy history to determine speech likelihood
    const energyVariance = this.calculateEnergyVariance();
    
    // Adaptive margin based on variance
    // High variance = more dynamic environment, need higher threshold
    const margin = 1.5 + (energyVariance * 2);
    
    this.state.currentThreshold = Math.max(
      this.options.initialThreshold,
      this.state.noiseFloor * margin
    );
  }

  /**
   * Calculate energy variance for adaptive margin
   */
  private calculateEnergyVariance(): number {
    if (this.energyHistory.length < 5) return 0;

    const mean = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    const squaredDiffs = this.energyHistory.map(x => Math.pow(x - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    
    // Normalize variance to 0-1 range
    return Math.min(1, variance * 100);
  }

  /**
   * Get current state
   */
  getState(): VADState {
    return { ...this.state };
  }

  /**
   * Set callbacks
   */
  setOnSpeechStart(callback: () => void): void {
    this.onSpeechStart = callback;
  }

  setOnSpeechEnd(callback: () => void): void {
    this.onSpeechEnd = callback;
  }

  setOnSilence(callback: () => void): void {
    this.onSilence = callback;
  }

  setOnStateChange(callback: VADCallback): void {
    this.onStateChange = callback;
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.state = {
      isSpeaking: false,
      speechDuration: 0,
      silenceDuration: 0,
      noiseFloor: this.options.initialThreshold,
      currentThreshold: this.options.initialThreshold,
      energyLevel: 0,
    };
    this.noiseSamples = [];
    this.energyHistory = [];
    this.lastSpeechTime = 0;
    this.lastSilenceTime = 0;
    this.speechStartTime = 0;
    this.silenceStartTime = Date.now();
  }

  /**
   * Update options
   */
  updateOptions(options: Partial<AdaptiveVADOptions>): void {
    this.options = { ...this.options, ...options };
  }
}
