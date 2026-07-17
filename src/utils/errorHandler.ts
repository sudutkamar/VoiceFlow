/**
 * Centralized error handling utilities for VoiceFlow.
 * Provides consistent error logging and user-facing error messages.
 */

/** Log error to console with context prefix */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}]`, message, error);
}

/** Log warning to console with context prefix */
export function logWarning(context: string, message: string, details?: unknown): void {
  console.warn(`[${context}]`, message, details);
}

/** Get user-friendly error message from error object */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Handle specific error types
    if (error.name === 'NotAllowedError') {
      return 'Microphone access denied. Please allow microphone access in your browser settings.';
    }
    if (error.name === 'NotReadableError') {
      return 'Microphone is in use by another application.';
    }
    if (error.name === 'NotFoundError') {
      return 'No microphone found. Please connect a microphone.';
    }
    if (error.name === 'OverconstrainedError') {
      return 'Microphone does not meet the required constraints.';
    }
    return error.message || 'An unexpected error occurred';
  }
  return String(error) || 'An unexpected error occurred';
}

/** Safe async wrapper that catches and logs errors */
export async function safeAsync<T>(
  context: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logError(context, error);
    return fallback;
  }
}

/** Safe sync wrapper that catches and logs errors */
export function safeSync<T>(
  context: string,
  fn: () => T,
  fallback: T
): T {
  try {
    return fn();
  } catch (error) {
    logError(context, error);
    return fallback;
  }
}
