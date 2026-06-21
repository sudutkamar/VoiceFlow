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

      // 2. Transcribe
      const model = getBestAvailableModel(database.getSetting('model') || 'ggml-base.bin');
      const language = database.getSetting('language') || 'auto';
      const verbatimMode = database.getSetting('verbatim_mode') !== 'false';
      const preprocessAudio = database.getSetting('audio_preprocess') === 'true';
      const fuzzyMatch = !verbatimMode && database.getSetting('fuzzy_match') === 'true';
      
      hotkeyManager?.setState('transcribing');
      logger.info('Starting whisper...', { model, language, verbatimMode, preprocessAudio, fuzzyMatch });
      const transcribeResult = await transcriber.transcribe(wavPath, model, language, {
        preprocess: preprocessAudio,
        fuzzyMatch,
        confidenceScore: true,
        audioDurationMs: audioData.duration,
      });
      
      // Cleanup temp file
      try { fs.unlinkSync(wavPath); } catch {}

      if (!transcribeResult.success) {
        throw new Error(transcribeResult.error || 'Transcription failed');
      }

      logger.info('Whisper result', { text: transcribeResult.text });

      // 3. Clean text
      hotkeyManager?.setState('cleaning');
      const dictionary = database.getDictionaryMap();
      const snippets = database.getSnippetsMap();
      const removeFillers = database.getSetting('remove_fillers') !== 'false';
      const cleanupEnabled = database.getSetting('cleanup_enabled') !== 'false';

      let finalText = transcribeResult.text || '';
      if (finalText) {
        if (verbatimMode) {
          // Dictation-first behavior: keep the user's words as close to Whisper output as possible.
          // Only normalize whitespace; no filler removal, no capitalization, no dictionary/fuzzy changes.
          finalText = textCleaner.clean(finalText, {
            removeFillers: false,
            handlePunctuation: false,
            handleVoiceCommands: false,
            capitalizeFirst: false,
            capitalizeAfterPeriod: false,
            fixSpacing: true,
            dictionary: {},
            snippets: {},
          });
        } else if (cleanupEnabled) {
          finalText = textCleaner.clean(finalText, {
            removeFillers,
            handlePunctuation: true,
            handleVoiceCommands: database.getSetting('voice_commands') !== 'false',
            capitalizeFirst: database.getSetting('capitalize_first') !== 'false',
            capitalizeAfterPeriod: database.getSetting('capitalize_sentences') !== 'false',
            dictionary,
            snippets,
          });
        }
      }

      logger.info('Final text', { text: finalText });
      lastTranscript = transcribeResult.text || '';
      lastCleanedText = finalText;

      // 4. Auto-paste
      const autoPaste = database.getSetting('auto_paste') !== 'false';
      if (autoPaste && finalText) {
        hotkeyManager?.setState('pasting');
        logger.info('Pasting...');
        await pasteEngine.paste(finalText, hotkeyManager?.getTargetWindowHandle());
        logger.info('Paste done');
      }

      // 5. Save to history
      const id = uuidv4();
      const durationMs = Date.now() - startTime;
      database.addHistory(id, transcribeResult.text || '', finalText, durationMs, audioData.duration);

      // 6. Send success to UI (ALL windows: main + mini)
      const send = hotkeyManager
        ? (ch: string, data: any) => hotkeyManager.sendToAll(ch, data)
        : (ch: string, data: any) => mainWindow.webContents.send(ch, data);

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

  function getBestAvailableModel(preferredModel: string): string {
    const modelsDir = app.isPackaged
      ? path.join(process.resourcesPath, 'whisper', 'models')
      : path.join(__dirname, '..', '..', 'resources', 'whisper', 'models');

    const accuracyOrder = [preferredModel, 'ggml-medium.bin', 'ggml-small.bin', 'ggml-base.bin', 'ggml-tiny.bin'];
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
