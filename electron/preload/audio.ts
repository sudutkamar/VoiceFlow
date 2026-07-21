/**
 * Audio-related preload API — dictation, recording, transcription.
 */
import { ipcRenderer } from 'electron';
import type { ElectronAPISection } from './types';

export function createAudioAPI(): ElectronAPISection {
  return {
    startRecording: () => ipcRenderer.invoke('start-recording'),
    stopRecording: () => ipcRenderer.invoke('stop-recording'),
    getTranscript: () => ipcRenderer.invoke('get-transcript'),
    toggleDictation: () => ipcRenderer.invoke('toggle-dictation'),
    sendAudioData: (data: { buffer: ArrayBuffer | number[]; mimeType: string; duration: number }) => {
      let buf: ArrayBuffer;
      if (data.buffer instanceof ArrayBuffer) {
        buf = data.buffer;
      } else if (ArrayBuffer.isView(data.buffer)) {
        buf = (data.buffer as ArrayBufferView).buffer as ArrayBuffer;
      } else if (Array.isArray(data.buffer)) {
        buf = new Uint8Array(data.buffer as number[]).buffer;
      } else {
        try { buf = new Uint8Array(data.buffer as any).buffer; } catch { buf = new ArrayBuffer(0); }
      }
      ipcRenderer.send('audio-recorded', buf, data.mimeType, data.duration);
    },
    cancelTranscription: () => ipcRenderer.invoke('cancel-transcription'),
  };
}
