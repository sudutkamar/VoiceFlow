/**
 * Shared constants for VoiceFlow.
 * Centralizes magic numbers and configuration defaults.
 */

// ═══════════════════════════════════════════════════════════════
//  Recording
// ═══════════════════════════════════════════════════════════════

/** Minimum recording duration before VAD can auto-stop (ms) */
export const MIN_RECORDING_MS = 2000;

/** Processing timeout — show error if transcription takes too long (ms) */
export const PROCESSING_TIMEOUT_MS = 25000;

/** Timer update interval for recording duration display (ms) */
export const TIMER_INTERVAL_MS = 200;

// ═══════════════════════════════════════════════════════════════
//  VAD (Voice Activity Detection)
// ═══════════════════════════════════════════════════════════════

/** Default silence duration before auto-stop (ms) */
export const DEFAULT_VAD_SILENCE_MS = 3000;

/** Default RMS threshold for silence detection (0-1) */
export const DEFAULT_SILENCE_THRESHOLD = 0.01;

/** VAD: RMS threshold for speech detection (0-1). Above this = speech, below = silence. */
export const VAD_SPEECH_THRESHOLD = 0.020;

/** VAD: Hangover time after last speech before silence timer starts (ms). Prevents false stops during natural pauses. */
export const VAD_HANGOVER_MS = 500;

/** VAD: Exponential moving average alpha for RMS smoothing (0-1). Higher = less smoothing. */
export const VAD_SMOOTHING_ALPHA = 0.3;

// ═══════════════════════════════════════════════════════════════
//  UI — Mini Bar
// ═══════════════════════════════════════════════════════════════

/** Base height of mini bar before zoom (px) */
export const MINI_BAR_BASE_HEIGHT = 52;

/** Min height for mini bar (px) */
export const MINI_BAR_MIN_HEIGHT = 28;

/** Max height for mini bar (px) */
export const MINI_BAR_MAX_HEIGHT = 120;

/** Base width of mini bar before zoom (px) */
export const MINI_BAR_BASE_WIDTH = 244;

/** Delay before showing result tooltip (ms) */
export const RESULT_TOOLTIP_DELAY_MS = 4000;

/** Delay before hiding error tooltip (ms) */
export const ERROR_TOOLTIP_DELAY_MS = 3000;

// ═══════════════════════════════════════════════════════════════
//  UI — Waveform Visualization
// ═══════════════════════════════════════════════════════════════

/** Number of frequency bars in waveform */
export const WAVEFORM_POINTS = 24;

/** Smoothing factor for waveform animation (0-1) */
export const WAVEFORM_SMOOTHING = 0.18;

// ═══════════════════════════════════════════════════════════════
//  Paste Engine
// ═══════════════════════════════════════════════════════════════

/** Text length threshold for "short" text (uses faster paste) */
export const SHORT_TEXT_THRESHOLD = 100;

/** Text length threshold for "long" text (uses slower paste) */
export const LONG_TEXT_THRESHOLD = 500;

/** Max retries for paste operation */
export const PASTE_MAX_RETRIES = 1;

// ═══════════════════════════════════════════════════════════════
//  Processing Queue
// ═══════════════════════════════════════════════════════════════

/** Max items in processing queue before dropping oldest */
export const MAX_QUEUE_SIZE = 5;

// ═══════════════════════════════════════════════════════════════
//  Model Selection
// ═══════════════════════════════════════════════════════════════

/** Minimum text length for LLM post-processing */
export const LLM_MIN_TEXT_LENGTH = 30;
