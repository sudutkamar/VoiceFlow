import * as fs from 'fs';
import * as path from 'path';
import { app, crashReporter } from 'electron';
import { Logger } from './logger';

/**
 * Crash Reporter — Handles crash reporting and error logging.
 * 
 * Features:
 * - Log uncaught exceptions to file
 * - Log unhandled rejections to file
 * - Create crash dumps on app crash
 * - Store crash logs in user data directory
 * 
 * @example
 * ```typescript
 * const reporter = new CrashReporter(logger);
 * reporter.start();
 * ```
 */
export class CrashReporter {
  private logger: Logger;
  private logsDir: string;
  private crashLogPath: string;

  constructor(logger: Logger) {
    this.logger = logger;
    const userDataPath = app.getPath('userData');
    this.logsDir = path.join(userDataPath, 'logs');
    this.crashLogPath = path.join(this.logsDir, 'crash.log');
  }

  /**
   * Start crash reporting.
   */
  start(): void {
    // Ensure logs directory exists
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    // Configure Electron's crashReporter
    crashReporter.start({
      productName: 'VoiceFlow',
      submitURL: '', // No server — just save locally
      uploadToServer: false,
      compress: false,
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.logCrash('uncaughtException', error);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason: any) => {
      this.logCrash('unhandledRejection', reason);
    });

    // Handle warnings
    process.on('warning', (warning: Error) => {
      this.logger.warn(`Warning: ${warning.message}`, warning);
    });

    this.logger.info('Crash reporter started');
  }

  /**
   * Log a crash to file.
   */
  private logCrash(type: string, error: any): void {
    const timestamp = new Date().toISOString();
    const errorInfo = error instanceof Error ? error : { message: String(error), stack: '' };
    
    const logEntry = [
      `\n${'='.repeat(80)}`,
      `CRASH REPORT — ${timestamp}`,
      `Type: ${type}`,
      `Message: ${errorInfo.message}`,
      errorInfo.stack ? `Stack:\n${errorInfo.stack}` : '',
      `App Version: ${app.getVersion()}`,
      `Electron: ${process.versions.electron}`,
      `Node: ${process.versions.node}`,
      `Platform: ${process.platform} ${process.arch}`,
      `${'='.repeat(80)}\n`,
    ].filter(Boolean).join('\n');

    // Write to crash log file
    try {
      fs.appendFileSync(this.crashLogPath, logEntry, 'utf-8');
    } catch {
      // Can't write to file — nothing we can do
    }

    // Also log to our logger
    this.logger.error(`[${type}] ${errorInfo.message}`, errorInfo);
  }

  /**
   * Get crash log contents.
   */
  getCrashLog(): string | null {
    try {
      if (fs.existsSync(this.crashLogPath)) {
        return fs.readFileSync(this.crashLogPath, 'utf-8');
      }
    } catch {}
    return null;
  }

  /**
   * Clear crash log.
   */
  clearCrashLog(): void {
    try {
      if (fs.existsSync(this.crashLogPath)) {
        fs.writeFileSync(this.crashLogPath, '', 'utf-8');
      }
    } catch {}
  }
}
