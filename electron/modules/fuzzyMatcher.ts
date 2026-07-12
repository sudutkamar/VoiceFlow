import { Logger } from './logger';
import { levenshteinDistanceOptimized } from '../utils/levenshtein';

export interface FuzzyMatchResult {
  original: string;
  corrected: string;
  confidence: number;
  changes: Array<{
    position: number;
    from: string;
    to: string;
    confidence: number;
    reason: 'dictionary' | 'common_error' | 'fuzzy';
  }>;
}

export interface DictionaryEntry {
  phrase: string;
  replacement: string;
}

/**
 * Optimized fuzzy matcher for speech recognition output.
 *
 * Optimization strategy:
 * 1. Set-based O(1) exact lookups (dictionary + common errors)
 * 2. Optimized Levenshtein with early termination + single-array
 * 3. Length-bucketed candidates for faster fuzzy search
 * 4. Skip Levenshtein for very short words (≤2 chars)
 */
export class FuzzyMatcher {
  private logger: Logger;

  // ═══════════════════════════════════════════════════════════════
  //  O(1) Lookup Structures
  // ═══════════════════════════════════════════════════════════════
  private dictionarySet: Map<string, string> = new Map();        // phrase → replacement
  private errorSet: Map<string, string> = new Map();             // error → correction
  private informalSet: Map<string, string> = new Map();          // informal → formal

  // For fuzzy search: bucket candidates by length for faster filtering
  private dictionaryByLength: Map<number, string[]> = new Map(); // length → [phrases]
  private errorKeysByLength: Map<number, string[]> = new Map();  // length → [error keys]

  private maxDistance: number;
  private minConfidenceThreshold: number;
  private dictionaryLoaded: boolean = false;

  constructor(logger: Logger, maxDistance: number = 2, minConfidence: number = 0.7) {
    this.logger = logger;
    this.maxDistance = maxDistance;
    this.minConfidenceThreshold = minConfidence;

    // Pre-populate error sets (always available, no load needed)
    this.initErrorSets();

    this.logger.info('FuzzyMatcher initialized (optimized)', { maxDistance, minConfidence });
  }

  // ═══════════════════════════════════════════════════════════════
  //  Common Whisper Errors (Indonesian + English)
  // ═══════════════════════════════════════════════════════════════

  private readonly WHISPER_ERRORS: Record<string, string> = {
    'tesih': 'test', 'tesis': 'test', 'tesi': 'test',
    'adala': 'adalah', 'adalh': 'adalah', 'adlah': 'adalah',
    'smua': 'semua', 'semu': 'semua',
    'dg': 'dengan', 'dgn': 'dengan', 'dng': 'dengan', 'dngn': 'dengan',
    'utk': 'untuk', 'unt': 'untuk',
    'dr': 'dari', 'dri': 'dari',
    'bgt': 'banget', 'bngt': 'banget', 'bnget': 'banget',
    'bener': 'benar', 'bner': 'benar',
    'emg': 'memang', 'emng': 'memang',
    'mgkn': 'mungkin', 'mngkn': 'mungkin',
    'gmn': 'gimana', 'gmna': 'gimana', 'gimna': 'gimana',
    'bgmn': 'bagaimana', 'bgmna': 'bagaimana',
    'trs': 'terus', 'truz': 'terus',
    'blm': 'belum', 'blum': 'belum', 'blom': 'belum',
    'sdh': 'sudah', 'sdah': 'sudah',
    'tpi': 'tapi',
    'krn': 'karena', 'krna': 'karena', 'karna': 'karena', 'kren': 'karena',
    'jd': 'jadi', 'jdi': 'jadi',
    'prg': 'pergi', 'pgi': 'pergi',
    'krm': 'kirim',
    'dtg': 'datang', 'dtng': 'datang', 'datg': 'datang',
    'mkn': 'makan', 'mkan': 'makan',
    'mnm': 'minum', 'minm': 'minum',
    'tdr': 'tidur', 'tidr': 'tidur',
    'bngn': 'bangun', 'bangn': 'bangun',
    'plg': 'pulang', 'plng': 'pulang',
    'krj': 'kerja', 'kerj': 'kerja',
    'sklh': 'sekolah', 'seklh': 'sekolah',
    'ktr': 'kantor', 'kant': 'kantor',
    'rmh': 'rumah', 'rumh': 'rumah', 'rmt': 'rumah',
    'mbl': 'mobil', 'mobl': 'mobil',
    'mtr': 'motor', 'motr': 'motor',
    'hsl': 'hasil', 'hasl': 'hasil',
    'mslh': 'masalah', 'maslh': 'masalah', 'msl': 'masalah',
    'jwb': 'jawab', 'jawb': 'jawab', 'jwbn': 'jawaban',
    'tmbh': 'tambah',
    'krg': 'kurang', 'kurng': 'kurang',
    'lbh': 'lebih', 'lebh': 'lebih',
    'sdkt': 'sedikit', 'sedkt': 'sedikit',
    'byk': 'banyak', 'bnyk': 'banyak',
    'bsr': 'besar', 'besr': 'besar',
    'kcl': 'kecil', 'kecl': 'kecil',
    'pngt': 'penting', 'pentng': 'penting',
    'prlu': 'perlu',
    'hrs': 'harus', 'hrus': 'harus', 'haru': 'harus',
    'bs': 'bisa', 'akn': 'akan',
    'sdg': 'sedang', 'sedng': 'sedang',
    'lgi': 'lagi',
    'hny': 'hanya',
    'sngt': 'sangat', 'sangt': 'sangat',
    'skli': 'sekali',
    'agk': 'agak',
    'ckp': 'cukup', 'cukp': 'cukup',
    'lmyan': 'lumayan', 'lumyn': 'lumayan',
    'kcp': 'kacamata', 'kcm': 'kacamata',
    'solus': 'solusi', 'slsi': 'solusi',
    'sm': 'sama',
  };

  private readonly INFORMAL_TO_FORMAL: Record<string, string> = {
    'engga': 'tidak', 'enggak': 'tidak', 'ngga': 'tidak', 'nggak': 'tidak',
    'gak': 'tidak', 'ga': 'tidak', 'gk': 'tidak', 'tdk': 'tidak',
    'aja': 'saja', 'aj': 'saja', 'sj': 'saja',
    'km': 'kamu', 'kmu': 'kamu',
    'sy': 'saya', 'gw': 'saya', 'gue': 'saya',
    'aq': 'aku', 'ak': 'aku',
    'trus': 'terus',
    'klo': 'kalau', 'kalo': 'kalau', 'kl': 'kalau', 'klau': 'kalau', 'klu': 'kalau',
    'udh': 'sudah', 'udah': 'sudah', 'dah': 'sudah',
    'tp': 'tapi',
    'org': 'orang',
    'mw': 'mau',
  };

  // ═══════════════════════════════════════════════════════════════
  //  Initialize O(1) Sets
  // ═══════════════════════════════════════════════════════════════

  private initErrorSets(): void {
    // Load whisper errors into O(1) Map
    for (const [key, value] of Object.entries(this.WHISPER_ERRORS)) {
      this.errorSet.set(key, value);
      // Bucket by length for fuzzy search
      const len = key.length;
      if (!this.errorKeysByLength.has(len)) this.errorKeysByLength.set(len, []);
      this.errorKeysByLength.get(len)!.push(key);
    }

    // Load informal-to-formal into O(1) Map
    for (const [key, value] of Object.entries(this.INFORMAL_TO_FORMAL)) {
      this.informalSet.set(key, value);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Dictionary Management (with length bucketing)
  // ═══════════════════════════════════════════════════════════════

  loadDictionary(entries: DictionaryEntry[]): void {
    this.dictionarySet.clear();
    this.dictionaryByLength.clear();

    for (const entry of entries) {
      const key = entry.phrase.toLowerCase();
      this.dictionarySet.set(key, entry.replacement);

      // Bucket by length for faster fuzzy search
      const len = key.length;
      if (!this.dictionaryByLength.has(len)) this.dictionaryByLength.set(len, []);
      this.dictionaryByLength.get(len)!.push(key);
    }

    this.dictionaryLoaded = true;
    this.logger.info('Dictionary loaded (optimized)', { entries: this.dictionarySet.size });
  }

  // ═══════════════════════════════════════════════════════════════
  //  Main Processing Pipeline (OPTIMIZED)
  // ═══════════════════════════════════════════════════════════════

  process(text: string, formalMode: boolean = false): FuzzyMatchResult {
    if (!text?.trim()) {
      return { original: text, corrected: text, confidence: 1, changes: [] };
    }

    const words = text.split(/(\s+)/);
    const changes: FuzzyMatchResult['changes'] = [];
    const correctedWords: string[] = [];

    // Build active error map for this run
    const activeErrors = formalMode
      ? new Map([...this.errorSet, ...this.informalSet])
      : this.errorSet;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Skip whitespace tokens
      if (/^\s+$/.test(word)) {
        correctedWords.push(word);
        continue;
      }

      const cleanWord = this.stripPunctuation(word);
      const lowerClean = cleanWord.toLowerCase();

      // Skip very short words (single chars, numbers, etc.)
      if (cleanWord.length <= 1) {
        correctedWords.push(word);
        continue;
      }

      let replacement: string | null = null;
      let confidence = 0;
      let reason: 'dictionary' | 'common_error' | 'fuzzy' = 'dictionary';

      // ── Priority 1: O(1) Exact dictionary match ──
      if (this.dictionarySet.has(lowerClean)) {
        replacement = this.dictionarySet.get(lowerClean)!;
        confidence = 1.0;
        reason = 'dictionary';
      }

      // ── Priority 2: O(1) Exact common error match ──
      if (!replacement && activeErrors.has(lowerClean)) {
        replacement = activeErrors.get(lowerClean)!;
        confidence = 0.95;
        reason = 'common_error';
      }

      // ── Priority 3: Fuzzy dictionary match (only if dictionary loaded) ──
      if (!replacement && this.dictionaryLoaded) {
        const dictMatch = this.findBestMatchFast(lowerClean, this.dictionaryByLength);
        if (dictMatch && dictMatch.distance <= this.maxDistance) {
          const similarity = 1 - (dictMatch.distance / Math.max(cleanWord.length, dictMatch.word.length));
          if (similarity >= this.minConfidenceThreshold) {
            replacement = this.dictionarySet.get(dictMatch.word)!;
            confidence = similarity;
            reason = 'fuzzy';
          }
        }
      }

      // ── Priority 4: Fuzzy common error match ──
      if (!replacement) {
        const errorMatch = this.findBestMatchFast(lowerClean, this.errorKeysByLength);
        if (errorMatch && errorMatch.distance <= this.maxDistance) {
          const similarity = 1 - (errorMatch.distance / Math.max(cleanWord.length, errorMatch.word.length));
          if (similarity >= this.minConfidenceThreshold) {
            replacement = activeErrors.get(errorMatch.word) || null;
            confidence = similarity * 0.9;
            reason = 'fuzzy';
          }
        }
      }

      // ── Apply or keep original ──
      if (replacement && replacement.toLowerCase() !== lowerClean) {
        const finalReplacement = this.preserveCase(word, replacement);
        correctedWords.push(finalReplacement);
        changes.push({
          position: i,
          from: word,
          to: finalReplacement,
          confidence: Math.round(confidence * 100) / 100,
          reason,
        });
      } else {
        correctedWords.push(word);
      }
    }

    const corrected = correctedWords.join('');
    const overallConfidence = changes.length > 0
      ? changes.reduce((sum, c) => sum + c.confidence, 0) / changes.length
      : 1.0;

    this.logger.info('Fuzzy matching complete (optimized)', {
      original: text.length,
      corrected: corrected.length,
      changes: changes.length,
      overallConfidence: overallConfidence.toFixed(2),
    });

    return {
      original: text,
      corrected,
      confidence: Math.round(overallConfidence * 100) / 100,
      changes,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  Optimized Levenshtein with Early Termination
  // ═══════════════════════════════════════════════════════════════

  /**
   * Fast best-match finder using length-bucketed candidates.
   * Only checks candidates within ±maxDistance length.
   * Uses early termination in Levenshtein when distance exceeds threshold.
   */
  private findBestMatchFast(
    word: string,
    bucketMap: Map<number, string[]>
  ): { word: string; distance: number } | null {
    let bestMatch: { word: string; distance: number } | null = null;
    let bestDistance = Infinity;

    const wordLen = word.length;
    const minLen = Math.max(1, wordLen - this.maxDistance);
    const maxLen = wordLen + this.maxDistance;

    // Only iterate over relevant length buckets
    for (let len = minLen; len <= maxLen; len++) {
      const candidates = bucketMap.get(len);
      if (!candidates) continue;

      for (const candidate of candidates) {
        const distance = levenshteinDistanceOptimized(word, candidate, bestDistance);

        if (distance < bestDistance && distance <= this.maxDistance) {
          bestDistance = distance;
          bestMatch = { word: candidate, distance };
        }
      }
    }

    return bestMatch;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Utility Functions
  // ═══════════════════════════════════════════════════════════════

  private stripPunctuation(word: string): string {
    return word.replace(/^[.,!?;:'"()\[\]{}]+|[.,!?;:'"()\[\]{}]+$/g, '');
  }

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

  // ═══════════════════════════════════════════════════════════════
  //  Public API
  // ═══════════════════════════════════════════════════════════════

  getStats(): { dictionarySize: number; commonErrorsSize: number } {
    return {
      dictionarySize: this.dictionarySet.size,
      commonErrorsSize: this.errorSet.size + this.informalSet.size,
    };
  }
}
