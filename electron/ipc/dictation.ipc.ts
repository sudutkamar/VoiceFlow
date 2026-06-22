import { ipcMain, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { VoiceFlowDatabase as Database } from '../modules/database';
import { Logger } from '../modules/logger';
import { AudioConverter } from '../modules/audioConverter';
import { Transcriber } from '../modules/transcriber';
import { TextCleaner } from '../modules/textCleaner';
import { PasteEngine } from '../modules/pasteEngine';
import { HotkeyManager } from '../modules/hotkeyManager';

let audioConverter: AudioConverter;
let transcriber: Transcriber;
let textCleaner: TextCleaner;
let pasteEngine: PasteEngine;
let isProcessing = false;
let lastTranscript = '';
let lastCleanedText = '';

export function setupDictationIPC(
  mainWindow: BrowserWindow,
  database: Database,
  logger: Logger,
  hotkeyManager?: HotkeyManager,
  hideAllForPaste?: () => void,
  showAfterPaste?: () => void
): void {
  audioConverter = new AudioConverter(logger);
  transcriber = new Transcriber(logger);
  transcriber.setMainWindow(mainWindow);
  if (hotkeyManager) {
    transcriber.setSendToAll((channel: string, ...args: any[]) => hotkeyManager.sendToAll(channel, ...args));
  }
  textCleaner = new TextCleaner(logger);
  pasteEngine = new PasteEngine(mainWindow, logger, hideAllForPaste, showAfterPaste);

  ipcMain.handle('start-recording', async () => {
    mainWindow.webContents.send('state-change', 'recording');
    return { success: true };
  });

  ipcMain.handle('stop-recording', async () => {
    mainWindow.webContents.send('state-change', 'idle');
    return { success: true };
  });

  ipcMain.handle('get-transcript', async () => {
    return { success: true, raw: lastTranscript, cleaned: lastCleanedText };
  });

  ipcMain.handle('toggle-dictation', async () => {
    mainWindow.webContents.send('toggle-dictation');
  });

  ipcMain.on('audio-recorded', async (event, audioData: { buffer: number[]; mimeType: string; duration: number }) => {
    if (isProcessing) {
      logger.warn('Already processing, ignoring');
      return;
    }

    isProcessing = true;
    const startTime = Date.now();

    try {
      // 1. Save audio (already WAV from browser)
      hotkeyManager?.setState('converting');
      logger.info('Processing audio...', { size: audioData.buffer.length, duration: audioData.duration });
      
      const tempDir = getTempDir();
      const wavPath = path.join(tempDir, `recording_${Date.now()}.wav`);
      const buffer = Buffer.from(audioData.buffer);
      fs.writeFileSync(wavPath, buffer);
      logger.info('Audio saved', { path: wavPath });

      // 2. Transcribe (two-pass: fast preview + accurate final)
      const model = getBestAvailableModel(database.getSetting('model') || 'ggml-base.bin');
      const language = database.getSetting('language') || 'auto';
      const verbatimMode = database.getSetting('verbatim_mode') !== 'false';
      const processingMode = (database.getSetting('processing_mode') || 'natural') as 'raw' | 'natural' | 'clean';
      const initialPrompt = database.getSetting('initial_prompt') || '';
      const preprocessAudio = database.getSetting('audio_preprocess') === 'true';
      const fuzzyMatch = !verbatimMode && database.getSetting('fuzzy_match') === 'true';
      const whisperDevice = database.getSetting('whisper_device') || 'auto';
      const send = hotkeyManager
        ? (ch: string, data: any) => hotkeyManager.sendToAll(ch, data)
        : (ch: string, data: any) => mainWindow.webContents.send(ch, data);

      hotkeyManager?.setState('transcribing');
      logger.info('Starting whisper...', { model, language, verbatimMode, processingMode });

      // Single pass: accurate transcription with selected model + GPU/CPU
      const transcribeResult = await transcriber.transcribe(wavPath, model, language, {
        preprocess: preprocessAudio,
        fuzzyMatch,
        confidenceScore: true,
        audioDurationMs: audioData.duration,
        initialPrompt: initialPrompt || undefined,
        device: whisperDevice,
      });

      // Cleanup temp file
      try { fs.unlinkSync(wavPath); } catch {}

      if (!transcribeResult.success) {
        // Handle no-speech case specially
        if (transcribeResult.error === '__NO_SPEECH__') {
          logger.info('No speech detected - empty or garbage audio');
          hotkeyManager?.setState('idle');
          const sendMsg = hotkeyManager
            ? (msg: string) => hotkeyManager.sendToAll('error', msg)
            : (msg: string) => mainWindow.webContents.send('error', msg);
          sendMsg('__NO_SPEECH__');  // Special code for UI to handle silently
          return;
        }
        throw new Error(transcribeResult.error || 'Transcription failed');
      }

      logger.info('Whisper result', { text: transcribeResult.text });

      // Clean text
      hotkeyManager?.setState('cleaning');
      const dictionary = database.getDictionaryMap();
      const snippets = database.getSnippetsMap();
      const voiceCommands = database.getSetting('voice_commands') !== 'false';
      const mode = verbatimMode ? 'raw' : processingMode;

      let finalText = transcribeResult.text || '';
      if (finalText) {
        finalText = textCleaner.cleanForMode(finalText, mode, { dictionary, snippets, voiceCommands });
      }

      logger.info('Final text', { text: finalText });
      lastTranscript = transcribeResult.text || '';
      lastCleanedText = finalText;

      if (!finalText || finalText.trim().length === 0) {
        logger.info('No speech detected');
        hotkeyManager?.setState('error');
        const sendErr = hotkeyManager
          ? (msg: string) => hotkeyManager.sendToAll('error', msg)
          : (msg: string) => mainWindow.webContents.send('error', msg);
        sendErr('No speech detected');
        setTimeout(() => hotkeyManager?.setState('idle'), 1000);
        return;
      }

      // Send to UI immediately
      send('transcript-ready', {
        raw: transcribeResult.rawText || transcribeResult.text,
        cleaned: finalText,
        duration: audioData.duration,
        wordCount: textCleaner.getWordCount(finalText),
        charCount: textCleaner.getCharCount(finalText),
        confidence: transcribeResult.confidence ? {
          overall: transcribeResult.confidence.overallConfidence,
          quality: transcribeResult.confidence.quality,
          words: transcribeResult.confidence.words,
          suggestions: transcribeResult.confidence.suggestions,
        } : undefined,
        fuzzyChanges: transcribeResult.fuzzyChanges,
        rawText: transcribeResult.rawText,
      });

      // Paste in background
      const autoPaste = database.getSetting('auto_paste') !== 'false';
      if (autoPaste && finalText) {
        hotkeyManager?.setState('pasting');
        pasteEngine.paste(finalText, hotkeyManager?.getTargetWindowHandle()).catch(() => {});
      }

      // Save to history
      const id = uuidv4();
      const durationMs = Date.now() - startTime;
      database.addHistory(id, transcribeResult.text || '', finalText, durationMs, audioData.duration);

      hotkeyManager?.setState('done');
      setTimeout(() => hotkeyManager?.setState('idle'), 500);
      logger.info('Dictation complete', { duration: durationMs, text: finalText });
    } catch (error: any) {
      logger.error('Dictation error', error);
      hotkeyManager?.setState('error');
      const sendErr = hotkeyManager
        ? (msg: string) => hotkeyManager.sendToAll('error', msg)
        : (msg: string) => mainWindow.webContents.send('error', msg);
      sendErr(error.message || 'Unknown error');
      setTimeout(() => hotkeyManager?.setState('idle'), 1000);
    } finally {
      isProcessing = false;
    }
  });

  ipcMain.handle('paste-text', async (event, text: string) => {
    return await pasteEngine.paste(text, hotkeyManager?.getTargetWindowHandle());
  });

  ipcMain.handle('copy-text', async (event, text: string) => {
    return await pasteEngine.copy(text);
  });

  ipcMain.handle('get-word-count', async (event, text: string) => {
    return textCleaner.getWordCount(text);
  });

  ipcMain.handle('get-clipboard-text', async () => {
    return pasteEngine.getClipboardText();
  });

  ipcMain.handle('run-benchmark', async (_event, audioBuffer: number[], models: string[]) => {
    const sendBench = hotkeyManager
      ? (ch: string, data: any) => hotkeyManager.sendToAll(ch, data)
      : (ch: string, data: any) => mainWindow.webContents.send(ch, data);
    try {
      const tempDir = getTempDir();
      const wavPath = path.join(tempDir, `benchmark_${Date.now()}.wav`);
      fs.writeFileSync(wavPath, Buffer.from(audioBuffer));
      const language = database.getSetting('language') || 'auto';
      const initialPrompt = database.getSetting('initial_prompt') || '';
      for (const model of models) {
        sendBench('benchmark-progress', { model, status: 'running' });
        const result = await transcriber.benchmarkModel(wavPath, model, language, initialPrompt || undefined);
        sendBench('benchmark-progress', { model, status: result.success ? 'done' : 'error', text: result.text, elapsedMs: result.elapsedMs, error: result.error });
      }
      try { fs.unlinkSync(wavPath); } catch {}
      return { success: true };
    } catch (err: any) {
      logger.error('Benchmark error', err);
      return { success: false, error: err.message };
    }
  });

  function getBestAvailableModel(preferredModel: string): string {
    // Use same path logic as Transcriber/ModelDownloader for consistency
    const modelsDir = app.isPackaged
      ? path.join(process.resourcesPath, 'whisper', 'models')
      : path.join(__dirname, '..', '..', 'resources-whisper-clean', 'models');

    const accuracyOrder = [preferredModel, 'ggml-large-v3-turbo-q5_0.bin', 'ggml-base-q5_1.bin', 'ggml-base.bin'];
    for (const model of [...new Set(accuracyOrder)]) {
      if (fs.existsSync(path.join(modelsDir, model))) return model;
    }
    return preferredModel;
  }

  function getTempDir(): string {
    const userDataPath = app.getPath('userData');
    const tempDir = path.join(userDataPath, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
  }
}
