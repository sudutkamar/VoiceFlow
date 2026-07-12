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
import { AdaptiveLearning } from '../modules/adaptiveLearning';
import { LlmPostProcessor, AVAILABLE_LLM_MODELS } from '../modules/llmPostProcessor';

let audioConverter: AudioConverter;
let transcriber: Transcriber;
let textCleaner: TextCleaner;
let pasteEngine: PasteEngine;
let adaptiveLearning: AdaptiveLearning;
let llmPostProcessor: LlmPostProcessor;
let isProcessing = false;
let processingQueue: Array<{ buffer: number[]; mimeType: string; duration: number }> = [];
let lastTranscript = '';
let lastCleanedText = '';

/**
 * Expose transcriber instance so model.ipc can sync path changes.
 */
export function getTranscriberInstance(): Transcriber | null {
  return transcriber || null;
}

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

  // Sync Transcriber path with any custom models path from database
  const savedModelsPath = database.getSetting('custom_models_path');
  if (savedModelsPath) {
    transcriber.updateModelsPath(savedModelsPath);
  }

  textCleaner = new TextCleaner(logger);
  pasteEngine = new PasteEngine(mainWindow, logger, hideAllForPaste, showAfterPaste);
  adaptiveLearning = new AdaptiveLearning(logger, database);
  llmPostProcessor = new LlmPostProcessor(logger);
  
  // Log LLM availability
  logger.info(`LLM post-processor: llama-cli=${llmPostProcessor.isLlmCliAvailable()}, models=${llmPostProcessor.getAvailableModels().length}`);

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

  function processNextAudio(): void {
    if (isProcessing || processingQueue.length === 0) return;
    const item = processingQueue.shift()!;
    processAudio(item);
  }

  ipcMain.on('audio-recorded', (event, audioData: { buffer: number[]; mimeType: string; duration: number }) => {
    processingQueue.push(audioData);
    if (!isProcessing) processNextAudio();
  });

  async function processAudio(audioData: { buffer: number[]; mimeType: string; duration: number }): Promise<void> {
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

      // Smart preprocessing: check if audio actually needs it
      let effectivePreprocess = preprocessAudio;
      if (preprocessAudio) {
        try {
          const needsProc = audioConverter.needsProcessing(buffer);
          if (!needsProc.needed) {
            effectivePreprocess = false;
            logger.info('Audio is clean, skipping preprocessing', { reason: needsProc.reason });
          } else {
            logger.info('Audio needs preprocessing', { reason: needsProc.reason });
          }
        } catch (err) {
          logger.warn('Audio analysis failed, using default preprocessing', err);
        }
      }

      // Single pass: transcription with selected model + GPU/CPU
      const formalMode = processingMode === 'clean';
      const transcribeResult = await transcriber.transcribe(wavPath, model, language, {
        preprocess: effectivePreprocess,
        fuzzyMatch,
        confidenceScore: true,
        audioDurationMs: audioData.duration,
        initialPrompt: initialPrompt || undefined,
        device: whisperDevice,
        formalMode,
      });

      // Cleanup temp file
      try { fs.unlinkSync(wavPath); } catch (err) { /* temp file may already be gone */ }

      if (!transcribeResult.success) {
        if (transcribeResult.error === '__NO_SPEECH__') {
          logger.info('No speech detected - empty or garbage audio');
          hotkeyManager?.setState('idle');
          const sendMsg = hotkeyManager
            ? (msg: string) => hotkeyManager.sendToAll('error', msg)
            : (msg: string) => mainWindow.webContents.send('error', msg);
          sendMsg('__NO_SPEECH__');
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
      const llmEnabled = database.getSetting('llm_postprocess') === 'true';
      const llmModel = database.getSetting('llm_model') || 'qwen2.5-0.5b-q4_k_m.gguf';

      let finalText = transcribeResult.text || '';
      if (finalText) {
        // Phase 1: TextCleaner (rule-based cleanup)
        finalText = textCleaner.cleanForMode(finalText, mode, { dictionary, snippets, voiceCommands });
        
        // Phase 2: Adaptive Learning (learned corrections)
        try {
          const learned = adaptiveLearning.apply(finalText);
          if (learned.changes > 0) {
            logger.info('Applied learned corrections', { changes: learned.changes });
            finalText = learned.text;
          }
        } catch (err) {
          logger.warn('Adaptive learning failed, using original', err);
        }

        // Phase 3: LLM Post-Processing (local llama inference)
        if (llmEnabled && !verbatimMode) {
          try {
            // Update state to show LLM processing
            hotkeyManager?.setState('cleaning');
            
            const llmResult = await llmPostProcessor.process(finalText, llmModel);
            
            if (llmResult.success && llmResult.text !== finalText) {
              logger.info('LLM post-processing applied', {
                model: llmResult.model,
                processingMs: llmResult.processingMs,
                before: finalText.length,
                after: llmResult.text.length,
              });
              finalText = llmResult.text;
            } else if (llmResult.error) {
              logger.warn('LLM post-processing skipped', { error: llmResult.error });
            }
          } catch (err) {
            logger.warn('LLM post-processing error, using cleaner result', err);
          }
        }
      }

      logger.info('Final text', { text: finalText, llmUsed: llmEnabled && !verbatimMode });
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

      // Record transcription for auto-learning
      adaptiveLearning.recordTranscription(transcribeResult.text || '');

      // Paste in background
      const autoPaste = database.getSetting('auto_paste') !== 'false';
      if (autoPaste && finalText) {
        hotkeyManager?.setState('pasting');
        pasteEngine.paste(finalText, hotkeyManager?.getTargetWindowHandle(), hotkeyManager?.getTargetWindowThread()).catch(() => {});
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
      // Process next queued item
      processNextAudio();
    }
  }

  ipcMain.handle('paste-text', async (event, text: string) => {
    // Auto-learn: if user pastes text different from last transcription, learn it
    adaptiveLearning.autoLearnFromPaste(lastTranscript, text);
    return await pasteEngine.paste(text, hotkeyManager?.getTargetWindowHandle(), hotkeyManager?.getTargetWindowThread());
  });

  ipcMain.handle('copy-text', async (event, text: string) => {
    // Auto-learn: if user copies text different from last transcription, learn it
    adaptiveLearning.autoLearnFromCopy(text);
    return await pasteEngine.copy(text);
  });

  ipcMain.handle('get-word-count', async (event, text: string) => {
    return textCleaner.getWordCount(text);
  });

  ipcMain.handle('get-clipboard-text', async () => {
    return pasteEngine.getClipboardText();
  });

  // ═══════════════════════════════════════════════════════════════
  //  Adaptive Learning IPC
  // ═══════════════════════════════════════════════════════════════

  // Learn from user correction (when user edits transcription)
  ipcMain.handle('learn-correction', async (_event, original: string, corrected: string) => {
    try {
      adaptiveLearning.learn(original, corrected);
      return { success: true };
    } catch (err: any) {
      logger.error('Learn correction failed', err);
      return { success: false, error: err.message };
    }
  });

  // Get all learned corrections
  ipcMain.handle('get-learned-corrections', async () => {
    return adaptiveLearning.getCorrections();
  });

  // Delete a learned correction
  ipcMain.handle('delete-learned-correction', async (_event, id: string) => {
    adaptiveLearning.deleteCorrection(id);
    return { success: true };
  });

  // Clear all learned corrections
  ipcMain.handle('clear-learned-corrections', async () => {
    adaptiveLearning.clearAll();
    return { success: true };
  });

  // Get adaptive learning stats
  ipcMain.handle('get-adaptive-stats', async () => {
    return adaptiveLearning.getStats();
  });

  // ═══════════════════════════════════════════════════════════════
  //  LLM Post-Processing IPC
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('llm-check-availability', async () => {
    try {
      const available = llmPostProcessor.isLlmCliAvailable() && llmPostProcessor.isModelAvailable();
      const models = llmPostProcessor.getDownloadedModelsInfo();
      return { success: true, available, hasCli: llmPostProcessor.isLlmCliAvailable(), models };
    } catch (err: any) {
      return { success: false, available: false, error: err.message };
    }
  });

  ipcMain.handle('llm-get-models', async () => {
    try {
      const models = llmPostProcessor.getDownloadedModelsInfo();
      return { success: true, models };
    } catch (err: any) {
      return { success: false, models: [], error: err.message };
    }
  });

  ipcMain.handle('llm-get-models-path', async () => {
    return llmPostProcessor.getModelsPathValue();
  });

  ipcMain.handle('llm-choose-models-folder', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih Folder LLM Models',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: llmPostProcessor.getModelsPathValue(),
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false };
    }
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('llm-scan-models-folder', async () => {
    try {
      const models = llmPostProcessor.getDownloadedModelsInfo();
      return { success: true, models };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Track active LLM download state for progress
  let activeLlmDownload = { modelName: '', downloadedBytes: 0, totalBytes: 0 };

  ipcMain.handle('llm-download-model', async (_event, modelName: string) => {
    try {
      const modelInfo = AVAILABLE_LLM_MODELS.find((m: any) => m.name === modelName);
      activeLlmDownload = { modelName, downloadedBytes: 0, totalBytes: modelInfo?.sizeBytes || 0 };

      const result = await llmPostProcessor.downloadModel(modelName, (progress, state, downloadedBytes, totalBytes) => {
        // Track bytes
        if (downloadedBytes !== undefined) activeLlmDownload.downloadedBytes = downloadedBytes;
        if (totalBytes !== undefined) activeLlmDownload.totalBytes = totalBytes;

        // Broadcast progress on dedicated channel for LLM
        const send = hotkeyManager
          ? (ch: string, data: any) => hotkeyManager.sendToAll(ch, data)
          : (ch: string, data: any) => mainWindow.webContents.send(ch, data);
        
        send('llm-download-progress', {
          progress,
          state,
          modelName,
          downloadedBytes: activeLlmDownload.downloadedBytes,
          totalBytes: activeLlmDownload.totalBytes,
        });

        // Also broadcast on general download-progress channel (for Models page compatibility)
        send('download-progress', {
          progress,
          state,
          modelName,
          downloadedBytes: activeLlmDownload.downloadedBytes,
          totalBytes: activeLlmDownload.totalBytes,
          type: 'llm',
        });
      });

      // Send final 100% completion
      const send = hotkeyManager
        ? (ch: string, data: any) => hotkeyManager.sendToAll(ch, data)
        : (ch: string, data: any) => mainWindow.webContents.send(ch, data);
      send('llm-download-progress', {
        progress: 100,
        state: result ? 'completed' : 'error',
        modelName,
        downloadedBytes: activeLlmDownload.totalBytes,
        totalBytes: activeLlmDownload.totalBytes,
      });

      activeLlmDownload = { modelName: '', downloadedBytes: 0, totalBytes: 0 };
      return { success: result };
    } catch (err: any) {
      activeLlmDownload = { modelName: '', downloadedBytes: 0, totalBytes: 0 };
      const send = hotkeyManager
        ? (ch: string, data: any) => hotkeyManager.sendToAll(ch, data)
        : (ch: string, data: any) => mainWindow.webContents.send(ch, data);
      send('llm-download-progress', {
        progress: 0,
        state: 'error',
        modelName,
        downloadedBytes: 0,
        totalBytes: 0,
      });
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('llm-delete-model', async (_event, modelName: string) => {
    try {
      const result = llmPostProcessor.deleteModel(modelName);
      return { success: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Test: run LLM post-processing on arbitrary text (for UI preview)
  ipcMain.handle('llm-test-process', async (_event, text: string, modelName?: string) => {
    try {
      const result = await llmPostProcessor.process(text, modelName);
      return { success: result.success, text: result.text, processingMs: result.processingMs, model: result.model, error: result.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
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
    // Use Transcriber's models path (which is synced with ModelDownloader)
    const modelsDir = transcriber.getModelsPathValue();

    // Check preferred model first, then fallback to known models
    const accuracyOrder = [
      preferredModel,
      'ggml-large-v3-q5_0.bin',
      'ggml-large-v3-turbo-q8_0.bin',
      'ggml-large-v3-turbo-q5_0.bin',
      'ggml-large-v3-turbo.bin',
      'ggml-large-v3.bin',
      'ggml-medium.bin',
      'ggml-small.bin',
      'ggml-base.bin',
      'ggml-base-q5_1.bin',
      'ggml-tiny.bin',
    ];
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
