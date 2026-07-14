import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { app, dialog } from 'electron';
import { Logger } from './logger';

/**
 * VoiceFlow Database — SQLite wrapper using better-sqlite3.
 * 
 * Manages all persistent data:
 * - Settings (key-value pairs)
 * - History (transcription results)
 * - Dictionary (user-defined word corrections)
 * - Snippets (text shortcuts)
 * - Learned corrections (adaptive learning)
 * 
 * @example
 * ```typescript
 * const db = new Database(logger);
 * db.initialize();
 * db.updateSetting('hotkey', 'Ctrl+Shift+Space');
 * const hotkey = db.getSetting('hotkey');
 * ```
 *
 * Schema versioning is handled via migrateSchema().
 * Current version: 2 (adds model_name, confidence, fuzzy_changes to history)
 */
export class VoiceFlowDatabase {
  private db: BetterSqlite3.Database | null = null;
  private logger: Logger;
  private dbPath: string;

  constructor(logger: Logger) {
    this.logger = logger;
    this.dbPath = this.getDbPath();
  }

  private getDbPath(): string {
    const userDataPath = app.getPath('userData');
    const dataDir = path.join(userDataPath, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'voiceflow.db');
  }

  private DB_VERSION = 2;

  initialize(): void {
    try {
      this.db = new BetterSqlite3(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.createTables();
      this.migrateSchema();
      this.insertDefaultSettings();
      this.fixInvalidHotkey();
      this.logger.info('Database initialized');
    } catch (error) {
      this.logger.error('Failed to initialize database', error);
      throw error;
    }
  }

  private migrateSchema(): void {
    if (!this.db) return;
    const versionRow = this.db.prepare("SELECT value FROM settings WHERE key = 'db_version'").get() as any;
    const currentVersion = parseInt(versionRow?.value || '1', 10);

    if (currentVersion < this.DB_VERSION) {
      this.logger.info(`Migrating database from v${currentVersion} to v${this.DB_VERSION}`);

      // v2: Add model_name, confidence, fuzzy_changes to dictation_history
      if (currentVersion < 2) {
        try {
          this.db.exec(`ALTER TABLE dictation_history ADD COLUMN model_name TEXT DEFAULT ''`);
        } catch {} // Column already exists
        try {
          this.db.exec(`ALTER TABLE dictation_history ADD COLUMN confidence REAL DEFAULT 0`);
        } catch {}
        try {
          this.db.exec(`ALTER TABLE dictation_history ADD COLUMN fuzzy_changes INTEGER DEFAULT 0`);
        } catch {}
      }

      // Update version
      this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('db_version', ?)").run(String(this.DB_VERSION));
      this.logger.info(`Database migrated to v${this.DB_VERSION}`);
    }
  }

  private fixInvalidHotkey(): void {
    if (!this.db) return;
    
    const hotkey = this.getSetting('hotkey');
    if (!hotkey) return;
    
    // Valid modifiers
    const validModifiers = ['CommandOrControl', 'Ctrl', 'Alt', 'Shift', 'Super', 'Meta', 'Cmd'];
    
    // Valid keys (single letters, numbers, function keys, special keys)
    const validKeys = new Set([
      // Letters
      'A','B','C','D','E','F','G','H','I','J','K','L','M',
      'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
      // Numbers
      '0','1','2','3','4','5','6','7','8','9',
      // Function keys
      'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
      'F13','F14','F15','F16','F17','F18','F19','F20','F21','F22','F23','F24',
      // Special keys
      'Space','Tab','Backspace','Delete','Insert','Enter','Return',
      'Up','Down','Left','Right','Home','End','PageUp','PageDown',
      'Escape','CapsLock','NumLock','ScrollLock',
      'Plus','-', '=', '[', ']', '\\', ';', "'", ',', '.', '/', '`',
      // Numpad
      'num0','num1','num2','num3','num4','num5','num6','num7','num8','num9',
      'numadd','numsub','nummult','numdiv','numdec',
      // Media
      'MediaNextTrack','MediaPreviousTrack','MediaStop','MediaPlayPause',
      'VolumeUp','VolumeDown','VolumeMute',
    ]);
    
    // Map modifier aliases to canonical form
    const modifierMap: Record<string, string> = {
      'Ctrl': 'CommandOrControl',
      'Cmd': 'CommandOrControl',
      'Command': 'CommandOrControl',
      'Control': 'CommandOrControl',
    };
    
    const parts = hotkey.split('+');
    if (parts.length < 2) {
      // Too short, reset to default
      this.updateSetting('hotkey', 'CommandOrControl+Shift+F9');
      this.logger.warn(`Invalid hotkey '${hotkey}' reset to default`);
      return;
    }
    
    const lastKey = parts[parts.length - 1].trim();
    if (validModifiers.includes(lastKey)) {
      // Last part is a modifier, not a valid key - reset to default
      this.updateSetting('hotkey', 'CommandOrControl+Shift+F9');
      this.logger.warn(`Invalid hotkey '${hotkey}' (missing key) reset to default`);
      return;
    }
    
    // Check if last key is a valid key
    if (!validKeys.has(lastKey)) {
      this.updateSetting('hotkey', 'CommandOrControl+Shift+F9');
      this.logger.warn(`Invalid hotkey '${hotkey}' (invalid key '${lastKey}') reset to default`);
      return;
    }
    
    // Normalize: fix modifier aliases + ensure key is uppercase
    const normalizedParts = parts.map((p, i) => {
      const trimmed = p.trim();
      if (i < parts.length - 1) {
        // Modifier - normalize alias
        return modifierMap[trimmed] || trimmed;
      }
      return trimmed; // Keep key as-is (Electron handles case)
    });
    const normalized = normalizedParts.join('+');
    if (normalized !== hotkey) {
      this.updateSetting('hotkey', normalized);
      this.logger.info(`Hotkey normalized: '${hotkey}' -> '${normalized}'`);
    }
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dictation_history (
        id TEXT PRIMARY KEY,
        raw_text TEXT NOT NULL,
        final_text TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        audio_duration_ms INTEGER DEFAULT 0,
        word_count INTEGER DEFAULT 0,
        char_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS personal_dictionary (
        id TEXT PRIMARY KEY,
        phrase TEXT NOT NULL UNIQUE,
        replacement TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS snippets (
        id TEXT PRIMARY KEY,
        trigger_phrase TEXT NOT NULL UNIQUE,
        output_text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learned_corrections (
        id TEXT PRIMARY KEY,
        original TEXT NOT NULL,
        corrected TEXT NOT NULL,
        frequency INTEGER DEFAULT 1,
        last_used INTEGER NOT NULL,
        confidence REAL DEFAULT 0.6
      );
    `);
  }

  private insertDefaultSettings(): void {
    if (!this.db) throw new Error('Database not initialized');

    const defaults: Record<string, string> = {
      hotkey: 'CommandOrControl+Shift+Space',
      language: 'auto',
      model: 'ggml-base-q5_1.bin', // default bundled model (~57 MB — always available)
      save_history: 'true',
      auto_paste: 'true',
      cleanup_enabled: 'false',
      capitalize_first: 'false',
      capitalize_sentences: 'false',
      remove_fillers: 'false',
      voice_commands: 'false',
      verbatim_mode: 'true',
      processing_mode: 'natural',
      initial_prompt: '',
      vad_enabled: 'true',
      vad_silence_ms: '3000',
      audio_preprocess: 'false',
      fuzzy_match: 'false',
      auto_start: 'false',
      minimize_to_tray: 'true',
      show_mini_window: 'true',
      sound_effects: 'true',
      selected_mic: '',
      push_to_talk: 'false',
      preview_before_paste: 'false',
      show_target_app: 'true',
      whisper_device: 'auto',
      mini_bar_scale: '1',
      mini_window_width: '460',
      mini_window_height: '64',
      mini_bar_orientation: 'horizontal',
      llm_postprocess: 'false',
      llm_model: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
      custom_models_path: '',
      log_level: 'info',
    };

    const stmt = this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(defaults)) {
      stmt.run(key, value);
    }
  }

  getSetting(key: string): string | null {
    if (!this.db) return null;
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return row?.value || null;
  }

  getAllSettings(): Record<string, string> {
    if (!this.db) return {};
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as any[];
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  updateSetting(key: string, value: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }

  addHistory(id: string, rawText: string, finalText: string, durationMs: number, audioDurationMs: number = 0, modelName: string = '', confidence: number = 0, fuzzyChanges: number = 0): void {
    if (!this.db) throw new Error('Database not initialized');
    const saveHistory = this.getSetting('save_history');
    if (saveHistory !== 'true') return;

    const wordCount = finalText.split(/\s+/).filter(w => w.length > 0).length;
    const charCount = finalText.length;

    this.db.prepare(
      'INSERT INTO dictation_history (id, raw_text, final_text, duration_ms, audio_duration_ms, word_count, char_count, model_name, confidence, fuzzy_changes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, rawText, finalText, durationMs, audioDurationMs, wordCount, charCount, modelName, confidence, fuzzyChanges, new Date().toISOString());
  }

  getHistory(limit: number = 50): any[] {
    if (!this.db) return [];
    return this.db.prepare(
      'SELECT * FROM dictation_history ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
  }

  searchHistory(query: string): any[] {
    if (!this.db) return [];
    return this.db.prepare(
      'SELECT * FROM dictation_history WHERE final_text LIKE ? OR raw_text LIKE ? ORDER BY created_at DESC'
    ).all(`%${query}%`, `%${query}%`);
  }

  deleteHistoryItem(id: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM dictation_history WHERE id = ?').run(id);
  }

  clearHistory(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM dictation_history').run();
  }

  exportHistory(): string | null {
    if (!this.db) return null;

    const history = this.getHistory(1000);
    if (history.length === 0) return null;

    const csv = [
      'ID,Text,Duration (ms),Audio Duration (ms),Words,Chars,Model,Confidence,Fuzzy Changes,Created At',
      ...history.map(item => 
        `"${item.id}","${item.final_text.replace(/"/g, '""')}","${item.duration_ms}","${item.audio_duration_ms || 0}","${item.word_count || 0}","${item.char_count || 0}","${item.model_name || ''}","${item.confidence || 0}","${item.fuzzy_changes || 0}","${item.created_at}"`
      )
    ].join('\n');

    return csv;
  }

  getDictionary(): any[] {
    if (!this.db) return [];
    return this.db.prepare(
      'SELECT * FROM personal_dictionary ORDER BY phrase ASC'
    ).all();
  }

  getDictionaryMap(): Record<string, string> {
    if (!this.db) return {};
    const entries = this.db.prepare(
      'SELECT phrase, replacement FROM personal_dictionary'
    ).all() as any[];
    const map: Record<string, string> = {};
    for (const entry of entries) {
      map[entry.phrase.toLowerCase()] = entry.replacement;
    }
    return map;
  }

  addDictionaryEntry(id: string, phrase: string, replacement: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare(
      'INSERT INTO personal_dictionary (id, phrase, replacement, created_at) VALUES (?, ?, ?, ?)'
    ).run(id, phrase, replacement, new Date().toISOString());
  }

  updateDictionaryEntry(id: string, phrase: string, replacement: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare(
      'UPDATE personal_dictionary SET phrase = ?, replacement = ? WHERE id = ?'
    ).run(phrase, replacement, id);
  }

  deleteDictionaryEntry(id: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM personal_dictionary WHERE id = ?').run(id);
  }

  exportDictionary(): string | null {
    if (!this.db) return null;
    const entries = this.getDictionary();
    if (entries.length === 0) return null;

    const csv = [
      'Phrase,Replacement',
      ...entries.map(e => `"${e.phrase.replace(/"/g, '""')}","${e.replacement.replace(/"/g, '""')}"`)
    ].join('\n');
    return csv;
  }

  importDictionary(csvContent: string): { imported: number; skipped: number; errors: string[] } {
    if (!this.db) throw new Error('Database not initialized');

    const result = { imported: 0, skipped: 0, errors: [] as string[] };
    const lines = csvContent.split('\n').filter(l => l.trim());

    // Skip header
    const dataLines = lines[0].includes('Phrase') ? lines.slice(1) : lines;

    for (const line of dataLines) {
      try {
        const match = line.match(/^"([^"]*)","([^"]*)"$/);
        if (!match) {
          result.errors.push(`Invalid line: ${line.substring(0, 50)}`);
          continue;
        }
        const [, phrase, replacement] = match;
        if (!phrase || !replacement) {
          result.skipped++;
          continue;
        }
        // Check if phrase already exists
        const existing = this.db.prepare('SELECT id FROM personal_dictionary WHERE phrase = ?').get(phrase);
        if (existing) {
          result.skipped++;
          continue;
        }
        const id = `dict_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this.addDictionaryEntry(id, phrase, replacement);
        result.imported++;
      } catch (err: any) {
        result.errors.push(err.message);
      }
    }
    return result;
  }

  getSnippets(): any[] {
    if (!this.db) return [];
    return this.db.prepare('SELECT * FROM snippets ORDER BY trigger_phrase ASC').all();
  }

  getSnippetsMap(): Record<string, string> {
    if (!this.db) return {};
    const entries = this.db.prepare(
      'SELECT trigger_phrase, output_text FROM snippets'
    ).all() as any[];
    const map: Record<string, string> = {};
    for (const entry of entries) {
      map[entry.trigger_phrase.toLowerCase()] = entry.output_text;
    }
    return map;
  }

  addSnippet(id: string, trigger: string, output: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare(
      'INSERT INTO snippets (id, trigger_phrase, output_text, created_at) VALUES (?, ?, ?, ?)'
    ).run(id, trigger, output, new Date().toISOString());
  }

  updateSnippet(id: string, trigger: string, output: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare(
      'UPDATE snippets SET trigger_phrase = ?, output_text = ? WHERE id = ?'
    ).run(trigger, output, id);
  }

  deleteSnippet(id: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM snippets WHERE id = ?').run(id);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Learned Corrections (Adaptive Learning)
  // ═══════════════════════════════════════════════════════════════

  getLearnedCorrections(): any[] {
    if (!this.db) return [];
    return this.db.prepare('SELECT * FROM learned_corrections ORDER BY frequency DESC').all();
  }

  saveLearnedCorrection(correction: any): void {
    if (!this.db) throw new Error('Database not initialized');
    const existing = this.db.prepare('SELECT id FROM learned_corrections WHERE original = ?').get(correction.original) as any;
    if (existing) {
      this.db.prepare(
        'UPDATE learned_corrections SET corrected = ?, frequency = ?, last_used = ?, confidence = ? WHERE original = ?'
      ).run(correction.corrected, correction.frequency, correction.lastUsed, correction.confidence, correction.original);
    } else {
      this.db.prepare(
        'INSERT INTO learned_corrections (id, original, corrected, frequency, last_used, confidence) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(correction.id, correction.original, correction.corrected, correction.frequency, correction.lastUsed, correction.confidence);
    }
  }

  deleteLearnedCorrection(id: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM learned_corrections WHERE id = ?').run(id);
  }

  clearLearnedCorrections(): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM learned_corrections').run();
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
