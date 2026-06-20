import { BrowserWindow } from 'electron';
import { Logger } from './logger';

export type RecorderState = 'idle' | 'recording';

export class Recorder {
  private state: RecorderState = 'idle';
  private mainWindow: BrowserWindow;
  private logger: Logger;
  private recordingStartTime: number = 0;
  private timerInterval: NodeJS.Timeout | null = null;

  constructor(mainWindow: BrowserWindow, logger: Logger) {
    this.mainWindow = mainWindow;
    this.logger = logger;
  }

  getState(): RecorderState {
    return this.state;
  }

  async startRecording(): Promise<{ success: boolean; error?: string }> {
    if (this.state === 'recording') {
      return { success: false, error: 'Already recording' };
    }

    try {
      this.logger.info('Starting recording...');
      this.state = 'recording';
      this.recordingStartTime = Date.now();
      this.notifyStateChange();

      this.mainWindow.webContents.send('start-recording-request');

      this.timerInterval = setInterval(() => {
        const elapsed = Date.now() - this.recordingStartTime;
        this.mainWindow.webContents.send('recording-time', elapsed);
      }, 100);

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to start recording', error);
      this.state = 'idle';
      this.notifyStateChange();
      return { success: false, error: String(error) };
    }
  }

  async stopRecording(): Promise<{ success: boolean; error?: string }> {
    if (this.state !== 'recording') {
      return { success: false, error: 'Not recording' };
    }

    try {
      this.logger.info('Stopping recording...');
      this.state = 'idle';
      this.notifyStateChange();

      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      const duration = Date.now() - this.recordingStartTime;
      this.mainWindow.webContents.send('stop-recording-request', duration);

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to stop recording', error);
      this.state = 'idle';
      this.notifyStateChange();
      return { success: false, error: String(error) };
    }
  }

  private notifyStateChange(): void {
    this.mainWindow.webContents.send('state-change', this.state);
  }

  getStateString(): string {
    return this.state;
  }
}
