import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Logger — Application logging with level control.
 * 
 * Writes to both console (stdout) and file (app.log).
 * Supports log levels: debug, info, warn, error.
 * 
 * @example
 * ```typescript
 * const logger = new Logger();
 * logger.setLogLevel('debug');
 * logger.info('App started');
 * logger.debug('Debug details', { key: 'value' });
 * ```
 */
export class Logger {
  private logPath: string;
  private logStream: fs.WriteStream | null = null;
  private stdoutAvailable: boolean = true;
  private logLevel: LogLevel = 'info'; // Default: info and above

  constructor() {
    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    this.logPath = path.join(logsDir, 'app.log');
    this.initStream();
    this.setupStdoutErrorHandling();
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.logLevel];
  }

  private setupStdoutErrorHandling(): void {
    // Handle broken pipe errors on stdout/stderr gracefully
    if (process.stdout) {
      process.stdout.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
          this.stdoutAvailable = false;
        }
      });
    }
    if (process.stderr) {
      process.stderr.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
          this.stdoutAvailable = false;
        }
      });
    }
  }

  private initStream(): void {
    try {
      this.logStream = fs.createWriteStream(this.logPath, { flags: 'a' });
    } catch (error) {
      console.error('Failed to create log stream:', error);
    }
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level}] ${message}`;
    if (data !== undefined) {
      if (data instanceof Error) {
        logLine += ` | ${data.message}`;
        if (data.stack) {
          logLine += `\n${data.stack}`;
        }
      } else if (typeof data === 'object') {
        try {
          logLine += ` | ${JSON.stringify(data)}`;
        } catch {
          logLine += ` | [Object]`;
        }
      } else {
        logLine += ` | ${data}`;
      }
    }
    return logLine;
  }

  private write(level: string, message: string, data?: any): void {
    const logLine = this.formatMessage(level, message, data);
    
    // Only write to console if stdout is available
    if (this.stdoutAvailable) {
      try {
        process.stdout.write(logLine + '\n');
      } catch (e: any) {
        // Mark stdout as unavailable on EPIPE errors
        if (e?.code === 'EPIPE') {
          this.stdoutAvailable = false;
        }
      }
    }
    
    // Always write to file
    if (this.logStream) {
      try {
        this.logStream.write(logLine + '\n');
      } catch {
        // Ignore stream write errors
      }
    }
  }

  info(message: string, data?: any): void {
    this.write('INFO', message, data);
  }

  warn(message: string, data?: any): void {
    this.write('WARN', message, data);
  }

  error(message: string, data?: any): void {
    this.write('ERROR', message, data);
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      this.write('DEBUG', message, data);
    }
  }

  close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}
