/**
 * Dictation IPC Handlers
 * Handles recording, transcription, and text processing pipeline.
 * LLM handlers are in llm.ipc.ts
 */
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
import { LlmPostProcessor } from '../modules/llmPostProcessor';
import { setupLlmIPC } from './llm.ipc';

let audioConverter: AudioConverter;
let transcriber: Transcriber;
let textCleaner: TextCleaner;
let pasteEngine: PasteEngine;
let adaptiveLearning: AdaptiveLearning;
let isProcessing = false;
let processingQueue: Array<{ buffer: Buffer; mimeType: string; duration: number }> = [];
let lastTranscript = '';
let lastCleanedText = '';

// CRITICAL FIX: Max queue size to prevent memory overflow from rapid recording
const MAX_QUEUE_SIZE = 5;

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
    transcriber.setSendToAll((channel: string, ...args: any[]) => hotkeyManager.sendToAll(channel, args));
  }

  // Sync Transcriber path with any custom models path from database
  const savedModelsPath = database.getSetting('custom_models_path');
  if (savedModelsPath) {
    transcriber.updateModelsPath(savedModelsPath);
  }

  textCleaner = new TextCleaner(logger);
  pasteEngine = new PasteEngine(mainWindow, logger, hideAllForPaste, showAfterPaste);
  adaptiveLearning = new AdaptiveLearning(logger, database);
  
  // Set up LLM IPC handlers (separate module)
  const llmPostProcessor = new LlmPostProcessor(logger);
  setupLlmIPC(mainWindow, llmPostProcessor, logger, hotkeyManager);

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

  ipcMain.on('audio-recorded', (event, buffer: ArrayBuffer, mimeType: string, duration: number) => {
    logger.info('[audio-recorded] Received audio data', {
      bufferSize: buffer?.byteLength || 0,
      mimeType,
      duration,
    });
    
    const sendErr = hotkeyManager
      ? (msg: string) => hotkeyManager.sendToAll('error', msg)
      : (msg: string) => mainWindow.webContents.send('error', msg);
    
    // Validate audio data
    if (!buffer || buffer.byteLength === 0) {
      logger.error('[audio-recorded] Invalid or empty audio data received');
      sendErr('Recording failed: no audio data received');
      return;
    }
    
    // CRITICAL FIX: Reject if queue is full to prevent memory overflow
    if (processingQueue.length >= MAX_QUEUE_SIZE) {
      logger.warn('Processing queue full, dropping oldest item', { queueSize: processingQueue.length });
      processingQueue.shift(); // Drop oldest item
    }
    
    const nodeBuffer = Buffer.from(buffer);
    logger.info('[audio-recorded] Converted to Buffer', { nodeBufferLength: nodeBuffer.length });
    processingQueue.push({ buffer: nodeBuffer, mimeType, duration });
    if (!isProcessing) {
      logger.info('[audio-recorded] Queue not busy, starting processing...');
      processNextAudio();
    } else {
      logger.info('[audio-recorded] Queue busy, enqueued. Queue size:', processingQueue.length);
    }
  });

  async function processAudio(audioData: { buffer: Buffer; mimeType: string; duration: number }): Promise<void> {
    isProcessing = true;
    const startTime = Date.now();
    const timingLog: string[] = [];

    try {
      // 1. Save audio (already WAV from browser)
      hotkeyManager?.setState('converting');
      logger.info('[processAudio] Starting...', { 
        bufferSize: audioData.buffer.length, 
        duration: audioData.duration 
      });
      
      const tempDir = getTempDir();
      const wavPath = path.join(tempDir, `recording_${Date.now()}.wav`);
      fs.writeFileSync(wavPath, audioData.buffer);
      timingLog.push(`save:${Date.now() - startTime}ms`);
      logger.info('Audio saved', { path: wavPath });

      // 2. Transcribe
      const savedModel = database.getSetting('model');
      const model = getBestAvailableModel(savedModel || 'ggml-base.bin');
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
      logger.info('[processAudio] Starting whisper...', { 
        savedModel, 
        selectedModel: model, 
        modelsPath: transcriber.getModelsPathValue(),
        language, 
        verbatimMode, 
        processingMode 
      });

      // Smart preprocessing: check if audio actually needs it
      let effectivePreprocess = preprocessAudio;
      if (preprocessAudio) {
        try {
          const needsProc = audioConverter.needsProcessing(audioData.buffer);
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
      const transcribeStart = Date.now();
      const transcribeResult = await transcriber.transcribe(wavPath, model, language, {
        preprocess: effectivePreprocess,
        fuzzyMatch,
        confidenceScore: true,
        audioDurationMs: audioData.duration,
        initialPrompt: initialPrompt || undefined,
        device: whisperDevice,
        formalMode,
      });
      timingLog.push(`transcribe:${Date.now() - transcribeStart}ms`);

      // Cleanup temp file
      try { fs.unlinkSync(wavPath); } catch (err) { /* temp file may already be gone */ }

      logger.info('[processAudio] Transcription result:', {
        success: transcribeResult.success,
        textLength: transcribeResult.text?.length || 0,
        error: transcribeResult.error,
        usedModel: transcribeResult.usedModel,
        processingMs: transcribeResult.processingMs,
      });

      if (!transcribeResult.success) {
        if (transcribeResult.error === '__NO_SPEECH__') {
          logger.info('[processAudio] No speech detected - empty or garbage audio');
          hotkeyManager?.setState('idle');
          const sendMsg = hotkeyManager
            ? (msg: string) => hotkeyManager.sendToAll('error', msg)
            : (msg: string) => mainWindow.webContents.send('error', msg);
          sendMsg('__NO_SPEECH__');
          return;
        }
        throw new Error(transcribeResult.error || 'Transcription failed');
      }

      logger.info('[processAudio] Whisper result', { text: transcribeResult.text });

      // Clean text
      hotkeyManager?.setState('cleaning');
      const dictionary = database.getDictionaryMap();
      const snippets = database.getSnippetsMap();
      const voiceCommands = database.getSetting('voice_commands') !== 'false';
      const mode = verbatimMode ? 'raw' : processingMode;
      const llmEnabled = database.getSetting('llm_postprocess') === 'true';
      const llmModel = database.getSetting('llm_model') || 'qwen2.5-0.5b-q4_k_m.gguf';

      // ─────────────────────────────────────────────────────────────────
      //  Processing Pipeline
      //  ─────────────────────────────────────────────────────────────────
      //  Order matters:
      //  1. LLM      ← RAW Whisper (grammar + punctuation fix)
      //  2. TextCleaner    ← filler removal, voice commands, capitalization
      //  3. AdaptiveLearning     ← learned user corrections
      //  ─────────────────────────────────────────────────────────────────
      const rawWhisperText = transcribeResult.text || '';
      let finalText = rawWhisperText;

      if (finalText) {
        // ── Phase 1a: LLM on RAW Whisper text (grammar + punctuation only) ──
        // LLM receives RAW output, BEFORE TextCleaner strips filler words.
        // This way LLM focuses on grammar/structure, not cleanup.
        const shouldUseLLM = llmEnabled && !verbatimMode && finalText.length >= 30;
        if (shouldUseLLM) {
          try {
            hotkeyManager?.setState('cleaning');
            const llmResult = await llmPostProcessor.process(finalText, llmModel);

            if (llmResult.success && llmResult.text !== finalText) {
              logger.info('[LLM] Grammar fix applied', {
                model: llmResult.model,
                processingMs: llmResult.processingMs,
                beforeLength: finalText.length,
                afterLength: llmResult.text.length,
              });
              finalText = llmResult.text;
            } else if (llmResult.error) {
              logger.warn('[LLM] Skipped', { error: llmResult.error });
            }
          } catch (err) {
            logger.warn('[LLM] Error, using original', err);
          }
        } else if (llmEnabled && !verbatimMode) {
          logger.debug('[LLM] Skipped for short text', { length: finalText.length });
        }

        // ── Phase 1b: TextCleaner (rule-based cleanup) ──
        // Removes filler words, stutters, false starts.
        // Applies voice commands ("koma" → ",", "titik" → ".").
        // LLM has already fixed grammar, so TextCleaner can focus on cleanup.
        finalText = textCleaner.cleanForMode(finalText, mode, { dictionary, snippets, voiceCommands });

        // ── Phase 2: Adaptive Learning (learned corrections) ──
        try {
          const learned = adaptiveLearning.apply(finalText);
          if (learned.changes > 0) {
            logger.info('Applied learned corrections', { changes: learned.changes });
            finalText = learned.text;
          }
        } catch (err) {
          logger.warn('Adaptive learning failed, using original', err);
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

      // CRITICAL: UI SYNC — Paste happens BEFORE UI shows done
      // Floating UI loading = proses aktual (termasuk paste)
      const autoPaste = database.getSetting('auto_paste') !== 'false';
      let pasteResult: { success: boolean; ms: number } = { success: false, ms: 0 };
      
      if (autoPaste && finalText) {
        // Keep UI in 'pasting' state while paste happens
        hotkeyManager?.setState('pasting');
        try {
          const pasteRes = await pasteEngine.paste(
            finalText, 
            hotkeyManager?.getTargetWindowHandle(), 
            hotkeyManager?.getTargetWindowThread()
          );
          pasteResult = { success: pasteRes.success, ms: pasteRes.ms || 0 };
          logger.info('Paste completed', { success: pasteResult.success, ms: pasteResult.ms });
        } catch (err) {
          logger.warn('Paste failed', err);
        }
      }

      // NOW send transcript to UI — paste is already done
      // UI shows result IMMEDIATELY after paste
      send('transcript-ready', {
        raw: rawWhisperText,
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
        rawText: rawWhisperText,
      });

      // Record transcription for auto-learning
      adaptiveLearning.recordTranscription(transcribeResult.text || '');

      // Save to history
      const id = uuidv4();
      const durationMs = Date.now() - startTime;
      database.addHistory(id, transcribeResult.text || '', finalText, durationMs, audioData.duration);

      hotkeyManager?.setState('done');
      timingLog.push(`paste:${pasteResult.ms || 0}ms`);
      timingLog.push(`total:${Date.now() - startTime}ms`);
      logger.info('Dictation complete', { timing: timingLog.join(', '), text: finalText });
      setTimeout(() => hotkeyManager?.setState('idle'), 300);
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
  //  Cancel Transcription
  // ═══════════════════════════════════════════════════════════════

  ipcMain.handle('cancel-transcription', async () => {
    transcriber.cancelTranscription();
    return { success: true };
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
  //  Benchmark
  // ═══════════════════════════════════════════════════════════════

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
    // Delegate to Transcriber's single source of truth
    // selectOptimalModel() handles fallback priority with cached fs checks
    return transcriber.selectOptimalModel(preferredModel);
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
