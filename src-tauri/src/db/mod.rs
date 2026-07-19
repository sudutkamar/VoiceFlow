pub mod settings;
pub mod history;
pub mod dictionary;
pub mod snippets;
pub mod learning;

use std::path::Path;
use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

/// VoiceFlow database — SQLite via rusqlite
pub struct Database {
    conn: Connection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub raw_text: String,
    pub cleaned_text: String,
    pub duration_ms: i64,
    pub audio_duration_ms: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryEntry {
    pub id: String,
    pub phrase: String,
    pub replacement: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnippetEntry {
    pub id: String,
    pub trigger: String,
    pub output: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LearnedCorrection {
    pub id: String,
    pub original: String,
    pub corrected: String,
    pub frequency: i64,
    pub confidence: f64,
    pub created_at: String,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        let db = Self { conn };
        db.initialize_tables()?;
        Ok(db)
    }

    fn initialize_tables(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS history (
                id TEXT PRIMARY KEY,
                raw_text TEXT NOT NULL,
                cleaned_text TEXT NOT NULL,
                duration_ms INTEGER NOT NULL,
                audio_duration_ms INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS dictionary (
                id TEXT PRIMARY KEY,
                phrase TEXT NOT NULL,
                replacement TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS snippets (
                id TEXT PRIMARY KEY,
                trigger TEXT NOT NULL,
                output TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS learned_corrections (
                id TEXT PRIMARY KEY,
                original TEXT NOT NULL,
                corrected TEXT NOT NULL,
                frequency INTEGER NOT NULL DEFAULT 1,
                confidence REAL NOT NULL DEFAULT 1.0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_dictionary_phrase ON dictionary(phrase);
            CREATE INDEX IF NOT EXISTS idx_snippets_trigger ON snippets(trigger);
            CREATE INDEX IF NOT EXISTS idx_learned_original ON learned_corrections(original);
            "
        )?;
        Ok(())
    }

    // ═══════════════════════════════════════════════════════════
    //  Settings
    // ═══════════════════════════════════════════════════════════

    pub fn get_setting(&self, key: &str) -> Option<String> {
        self.conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .ok()
    }

    pub fn get_all_settings(&self) -> std::collections::HashMap<String, String> {
        let mut map = std::collections::HashMap::new();
        if let Ok(mut stmt) = self.conn.prepare("SELECT key, value FROM settings") {
            if let Ok(rows) = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0).unwrap_or_default(),
                    row.get::<_, String>(1).unwrap_or_default(),
                ))
            }) {
                for row in rows.flatten() {
                    map.insert(row.0, row.1);
                }
            }
        }
        map
    }

    pub fn update_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    // ═══════════════════════════════════════════════════════════
    //  History
    // ═══════════════════════════════════════════════════════════

    pub fn add_history(
        &self,
        id: &str,
        raw_text: &str,
        cleaned_text: &str,
        duration_ms: i64,
        audio_duration_ms: i64,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT INTO history (id, raw_text, cleaned_text, duration_ms, audio_duration_ms) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, raw_text, cleaned_text, duration_ms, audio_duration_ms],
        )?;
        Ok(())
    }

    pub fn get_history(&self, limit: Option<i64>) -> Result<Vec<HistoryEntry>> {
        let limit = limit.unwrap_or(100);
        let mut stmt = self
            .conn
            .prepare("SELECT id, raw_text, cleaned_text, duration_ms, audio_duration_ms, created_at FROM history ORDER BY created_at DESC LIMIT ?1")?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                raw_text: row.get(1)?,
                cleaned_text: row.get(2)?,
                duration_ms: row.get(3)?,
                audio_duration_ms: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect::<Result<Vec<_>>>()
    }

    pub fn search_history(&self, query: &str) -> Result<Vec<HistoryEntry>> {
        let search = format!("%{}%", query);
        let mut stmt = self
            .conn
            .prepare("SELECT id, raw_text, cleaned_text, duration_ms, audio_duration_ms, created_at FROM history WHERE cleaned_text LIKE ?1 ORDER BY created_at DESC LIMIT 50")?;
        let rows = stmt.query_map(params![search], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                raw_text: row.get(1)?,
                cleaned_text: row.get(2)?,
                duration_ms: row.get(3)?,
                audio_duration_ms: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect::<Result<Vec<_>>>()
    }

    pub fn delete_history_item(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM history WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn clear_history(&self) -> Result<()> {
        self.conn.execute("DELETE FROM history", [])?;
        Ok(())
    }

    // ═══════════════════════════════════════════════════════════
    //  Dictionary
    // ═══════════════════════════════════════════════════════════

    pub fn get_dictionary(&self) -> Result<Vec<DictionaryEntry>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, phrase, replacement, created_at FROM dictionary ORDER BY phrase")?;
        let rows = stmt.query_map([], |row| {
            Ok(DictionaryEntry {
                id: row.get(0)?,
                phrase: row.get(1)?,
                replacement: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>>>()
    }

    pub fn get_dictionary_map(&self) -> std::collections::HashMap<String, String> {
        let entries = self.get_dictionary().unwrap_or_default();
        entries.into_iter().map(|e| (e.phrase, e.replacement)).collect()
    }

    pub fn add_dictionary_entry(&self, id: &str, phrase: &str, replacement: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO dictionary (id, phrase, replacement) VALUES (?1, ?2, ?3)",
            params![id, phrase, replacement],
        )?;
        Ok(())
    }

    pub fn delete_dictionary_entry(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM dictionary WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_dictionary_entry(&self, id: &str, phrase: &str, replacement: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE dictionary SET phrase = ?2, replacement = ?3 WHERE id = ?1",
            params![id, phrase, replacement],
        )?;
        Ok(())
    }

    // ═══════════════════════════════════════════════════════════
    //  Snippets
    // ═══════════════════════════════════════════════════════════

    pub fn get_snippets(&self) -> Result<Vec<SnippetEntry>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, trigger, output, created_at FROM snippets ORDER BY trigger")?;
        let rows = stmt.query_map([], |row| {
            Ok(SnippetEntry {
                id: row.get(0)?,
                trigger: row.get(1)?,
                output: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>>>()
    }

    pub fn get_snippets_map(&self) -> std::collections::HashMap<String, String> {
        let entries = self.get_snippets().unwrap_or_default();
        entries.into_iter().map(|e| (e.trigger, e.output)).collect()
    }

    pub fn add_snippet(&self, id: &str, trigger: &str, output: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO snippets (id, trigger, output) VALUES (?1, ?2, ?3)",
            params![id, trigger, output],
        )?;
        Ok(())
    }

    pub fn delete_snippet(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM snippets WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_snippet(&self, id: &str, trigger: &str, output: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE snippets SET trigger = ?2, output = ?3 WHERE id = ?1",
            params![id, trigger, output],
        )?;
        Ok(())
    }

    // ═══════════════════════════════════════════════════════════
    //  Adaptive Learning
    // ═══════════════════════════════════════════════════════════

    pub fn get_learned_corrections(&self) -> Result<Vec<LearnedCorrection>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, original, corrected, frequency, confidence, created_at FROM learned_corrections ORDER BY frequency DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(LearnedCorrection {
                id: row.get(0)?,
                original: row.get(1)?,
                corrected: row.get(2)?,
                frequency: row.get(3)?,
                confidence: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        rows.collect::<Result<Vec<_>>>()
    }

    pub fn add_learned_correction(&self, id: &str, original: &str, corrected: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO learned_corrections (id, original, corrected) VALUES (?1, ?2, ?3)",
            params![id, original, corrected],
        )?;
        Ok(())
    }

    pub fn increment_correction_frequency(&self, id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE learned_corrections SET frequency = frequency + 1, confidence = MIN(1.0, confidence + 0.1) WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn delete_learned_correction(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM learned_corrections WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn clear_learned_corrections(&self) -> Result<()> {
        self.conn.execute("DELETE FROM learned_corrections", [])?;
        Ok(())
    }

    pub fn find_correction(&self, original: &str) -> Option<String> {
        self.conn
            .query_row(
                "SELECT corrected FROM learned_corrections WHERE original = ?1 ORDER BY frequency DESC LIMIT 1",
                params![original],
                |row| row.get(0),
            )
            .ok()
    }

    // ═══════════════════════════════════════════════════════════
    //  Utility
    // ═══════════════════════════════════════════════════════════

    pub fn close(&self) {
        // Connection closes automatically on drop
    }
}
