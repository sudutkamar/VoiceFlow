import { Logger } from './logger';
import { VoiceFlowDatabase as Database } from './database';

export interface LearnedCorrection {
  id: string;
  original: string;        // What whisper output
  corrected: string;       // What user changed it to
  frequency: number;       // How many times this correction was made
  lastUsed: number;        // Timestamp of last use
  confidence: number;      // 0-1, higher = more trusted
}

export interface CorrectionMatch {
  correction: LearnedCorrection;
  similarity: number;      // 0-1, how similar the input is
}

/**
 * Auto Adaptive Learning System
 * 
 * Automatically learns from user behavior:
 * 1. When user copies text different from transcription → learn the correction
 * 2. When user pastes edited text → learn the correction
 * 3. Based on frequency → auto-apply common corrections
 * 
 * NO manual editing required — system learns from usage patterns.
 */
export class AdaptiveLearning {
  private logger: Logger;
  private database: Database;
  private corrections: Map<string, LearnedCorrection> = new Map();
  private maxCorrections: number = 2000;
  private minConfidenceToApply: number = 0.6;
  private maxEditDistance: number = 3;
  
  // Track recent transcriptions for auto-learning
  private lastTranscription: { original: string; timestamp: number } | null = null;

  constructor(logger: Logger, database: Database) {
    this.logger = logger;
    this.database = database;
    this.loadCorrections();
  }

  // ═══════════════════════════════════════════════════════════════
  //  Load/Save from Database
  // ═══════════════════════════════════════════════════════════════

  private loadCorrections(): void {
    try {
      const entries = this.database.getLearnedCorrections();
      this.corrections.clear();
      for (const entry of entries) {
        this.corrections.set(entry.original.toLowerCase(), entry);
      }
      this.logger.info('Adaptive learning loaded', { count: this.corrections.size });
    } catch (error) {
      this.logger.warn('Failed to load adaptive corrections', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Auto-Learn from User Behavior
  // ═══════════════════════════════════════════════════════════════

  /**
   * Record the raw transcription (before any processing).
   * Used to detect when user modifies the text.
   */
  recordTranscription(original: string): void {
    if (!original || original.trim().length < 3) return;
    this.lastTranscription = {
      original: original.trim(),
      timestamp: Date.now(),
    };
  }

  /**
   * Auto-learn when user copies/pastes text.
   * If the text differs from the last transcription, it's a correction.
   */
  autoLearnFromCopy(text: string): void {
    if (!this.lastTranscription || !text) return;
    
    // Only learn if within 30 seconds of transcription
    const timeDiff = Date.now() - this.lastTranscription.timestamp;
    if (timeDiff > 30000) return;
    
    const original = this.lastTranscription.original;
    const cleaned = text.trim();
    
    // Skip if identical
    if (original.toLowerCase() === cleaned.toLowerCase()) return;
    
    // Skip if too short
    if (cleaned.length < 3 || original.length < 3) return;
    
    // Check if it's a meaningful correction (not just whitespace/case changes)
    if (this.isMinorChange(original, cleaned)) return;
    
    // Learn from the correction!
    this.learn(original, cleaned);
    this.logger.info('Auto-learned from copy', { original: original.substring(0, 50), cleaned: cleaned.substring(0, 50) });
  }

  /**
   * Auto-learn from paste operation.
   */
  autoLearnFromPaste(original: string, pasted: string): void {
    if (!original || !pasted) return;
    if (original.toLowerCase() === pasted.toLowerCase()) return;
    if (original.length < 3 || pasted.length < 3) return;
    if (this.isMinorChange(original, pasted)) return;
    
    this.learn(original, pasted);
    this.logger.info('Auto-learned from paste', { original: original.substring(0, 50), pasted: pasted.substring(0, 50) });
  }

  /**
   * Check if a change is minor (just whitespace, punctuation, case).
   */
  private isMinorChange(original: string, corrected: string): boolean {
    // Normalize for comparison
    const normalize = (s: string) => s.toLowerCase().replace(/[\s.,!?;:'"()]/g, '');
    return normalize(original) === normalize(corrected);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Learn from Correction (manual or auto)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Record a user correction.
   */
  learn(original: string, corrected: string): void {
    if (!original || !corrected || original === corrected) return;
    if (original.trim().length < 3 || corrected.trim().length < 3) return;

    const key = original.toLowerCase().trim();
    const existing = this.corrections.get(key);

    if (existing) {
      // Update existing correction
      existing.frequency++;
      existing.lastUsed = Date.now();
      existing.corrected = corrected.trim();
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      this.logger.info('Updated learned correction', { original: original.substring(0, 30), frequency: existing.frequency });
    } else {
      // New correction
      const newCorrection: LearnedCorrection = {
        id: `learned_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        original: original.trim(),
        corrected: corrected.trim(),
        frequency: 1,
        lastUsed: Date.now(),
        confidence: 0.5,
      };
      this.corrections.set(key, newCorrection);
      this.logger.info('New learned correction', { original: original.substring(0, 30) });
    }

    // Save to database
    const correction = this.corrections.get(key)!;
    this.saveCorrection(key, correction);

    // Trim if too many
    if (this.corrections.size > this.maxCorrections) {
      this.trimOldCorrections();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Apply Learned Corrections
  // ═══════════════════════════════════════════════════════════════

  /**
   * Apply learned corrections to transcription text.
   */
  apply(text: string): { text: string; changes: number } {
    if (!text || !text.trim()) return { text, changes: 0 };

    const words = text.split(/(\s+)/);
    const result: string[] = [];
    let changes = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Skip whitespace
      if (/^\s+$/.test(word)) {
        result.push(word);
        continue;
      }

      const lowerWord = word.toLowerCase().trim();
      
      // Try exact match first
      const exactMatch = this.corrections.get(lowerWord);
      if (exactMatch && exactMatch.confidence >= this.minConfidenceToApply) {
        const corrected = this.preserveCase(word, exactMatch.corrected);
        result.push(corrected);
        exactMatch.frequency++;
        exactMatch.lastUsed = Date.now();
        changes++;
        continue;
      }

      // Try fuzzy match
      const correction = this.findBestCorrection(lowerWord);
      if (correction && correction.similarity > 0.8 && correction.correction.confidence >= this.minConfidenceToApply) {
        const corrected = this.preserveCase(word, correction.correction.corrected);
        result.push(corrected);
        correction.correction.frequency++;
        correction.correction.lastUsed = Date.now();
        changes++;
        continue;
      }

      result.push(word);
    }

    // Apply phrase-level corrections
    const finalText = this.applyPhraseCorrections(result.join(''));

    return { text: finalText, changes };
  }

  /**
   * Apply phrase-level corrections.
   */
  private applyPhraseCorrections(text: string): string {
    let result = text;
    
    for (const [key, correction] of this.corrections) {
      if (correction.confidence < this.minConfidenceToApply) continue;
      if (key.length < 6) continue;
      
      if (key.includes(' ')) {
        const lowerText = result.toLowerCase();
        if (lowerText.includes(key)) {
          const regex = new RegExp(this.escapeRegex(key), 'gi');
          result = result.replace(regex, (match) => this.preserveCase(match, correction.corrected));
          correction.frequency++;
          correction.lastUsed = Date.now();
        }
      }
    }
    
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Fuzzy Matching
  // ═══════════════════════════════════════════════════════════════

  private findBestCorrection(word: string): CorrectionMatch | null {
    let bestMatch: CorrectionMatch | null = null;
    let bestSimilarity = 0;

    for (const [key, correction] of this.corrections) {
      const distance = this.levenshteinDistance(word, key);
      const maxLen = Math.max(word.length, key.length);
      const similarity = 1 - (distance / maxLen);

      if (similarity > bestSimilarity && distance <= this.maxEditDistance) {
        bestSimilarity = similarity;
        bestMatch = { correction, similarity };
      }
    }

    return bestMatch;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    if (m === 0) return n;
    if (n === 0) return m;

    let prev = new Array(n + 1);
    let curr = new Array(n + 1);

    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + cost
        );
      }
      [prev, curr] = [curr, prev];
    }

    return prev[n];
  }

  // ═══════════════════════════════════════════════════════════════
  //  Utility Functions
  // ═══════════════════════════════════════════════════════════════

  private preserveCase(original: string, replacement: string): string {
    if (!original || !replacement) return replacement;
    if (original === original.toUpperCase() && original.length > 1) {
      return replacement.toUpperCase();
    }
    if (original[0] === original[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private saveCorrection(key: string, correction: LearnedCorrection): void {
    try {
      this.database.saveLearnedCorrection(correction);
    } catch (error) {
      this.logger.warn('Failed to save correction', error);
    }
  }

  private trimOldCorrections(): void {
    const sorted = Array.from(this.corrections.entries())
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    
    const toRemove = Math.floor(sorted.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      const [key, correction] = sorted[i];
      this.corrections.delete(key);
      try {
        this.database.deleteLearnedCorrection(correction.id);
      } catch {}
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Public API
  // ═══════════════════════════════════════════════════════════════

  getCorrections(): LearnedCorrection[] {
    return Array.from(this.corrections.values())
      .sort((a, b) => b.frequency - a.frequency);
  }

  deleteCorrection(id: string): void {
    for (const [key, correction] of this.corrections) {
      if (correction.id === id) {
        this.corrections.delete(key);
        try {
          this.database.deleteLearnedCorrection(id);
        } catch {}
        break;
      }
    }
  }

  clearAll(): void {
    this.corrections.clear();
    try {
      this.database.clearLearnedCorrections();
    } catch {}
  }

  getStats(): { total: number; totalFrequency: number; avgConfidence: number } {
    const corrections = Array.from(this.corrections.values());
    return {
      total: corrections.length,
      totalFrequency: corrections.reduce((sum, c) => sum + c.frequency, 0),
      avgConfidence: corrections.length > 0
        ? corrections.reduce((sum, c) => sum + c.confidence, 0) / corrections.length
        : 0,
    };
  }
}
