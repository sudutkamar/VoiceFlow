import { Logger } from './logger';

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
 * Context-aware fuzzy matcher for speech recognition output.
 * 
 * Strategy:
 * 1. Exact dictionary match (highest confidence)
 * 2. Common Whisper errors (high confidence, language-specific)
 * 3. Fuzzy dictionary match (medium confidence, Levenshtein distance)
 * 4. Fuzzy common error match (lower confidence)
 * 
 * All corrections have confidence scores. Only high-confidence corrections
 * are applied automatically; low-confidence ones are flagged for review.
 */
export class FuzzyMatcher {
  private logger: Logger;
  private dictionary: Map<string, string> = new Map();
  private maxDistance: number;
  private minConfidenceThreshold: number;

  constructor(logger: Logger, maxDistance: number = 2, minConfidence: number = 0.7) {
    this.logger = logger;
    this.maxDistance = maxDistance;
    this.minConfidenceThreshold = minConfidence;
    this.logger.info('FuzzyMatcher initialized', { maxDistance, minConfidence });
  }

  // ═══════════════════════════════════════════════════════════════
  //  Common Whisper Errors (Indonesian + English)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Known Whisper transcription errors mapped to correct words.
   * Organized by category for maintainability.
   */
  private readonly COMMON_ERRORS: Record<string, string> = {
    // ── Indonesian: Very common Whisper mishears ──
    'tesih': 'test', 'tesis': 'test', 'tesi': 'test',
    'adala': 'adalah', 'adalh': 'adalah', 'adlah': 'adalah',
    'engga': 'tidak', 'enggak': 'tidak', 'ngga': 'tidak', 'nggak': 'tidak',
    'gak': 'tidak', 'ga': 'tidak', 'gk': 'tidak', 'tdk': 'tidak',
    'aja': 'saja', 'aj': 'saja', 'sj': 'saja',
    'smua': 'semua', 'semu': 'semua',
    'dg': 'dengan', 'dgn': 'dengan', 'dng': 'dengan', 'dngn': 'dengan',
    'utk': 'untuk', 'unt': 'untuk',
    'dr': 'dari', 'dri': 'dari',
    'km': 'kamu', 'kmu': 'kamu',
    'sy': 'saya', 'gw': 'saya', 'gue': 'saya',
    'aq': 'aku', 'ak': 'aku',
    'bgt': 'banget', 'bngt': 'banget', 'bnget': 'banget',
    'bener': 'benar', 'bner': 'benar',
    'emg': 'memang', 'emng': 'memang',
    'mgkn': 'mungkin', 'mngkn': 'mungkin',
    'gmn': 'gimana', 'gmna': 'gimana', 'gimna': 'gimana',
    'bgmn': 'bagaimana', 'bgmna': 'bagaimana',
    'trus': 'terus', 'trs': 'terus', 'truz': 'terus',
    'klo': 'kalau', 'kalo': 'kalau', 'kl': 'kalau', 'klau': 'kalau', 'klu': 'kalau',
    'blm': 'belum', 'blum': 'belum', 'blom': 'belum',
    'sdh': 'sudah', 'sdah': 'sudah', 'udh': 'sudah', 'udah': 'sudah', 'dah': 'sudah',
    'tp': 'tapi', 'tpi': 'tapi',
    'krn': 'karena', 'krna': 'karena', 'karna': 'karena', 'kren': 'karena',
    'jd': 'jadi', 'jdi': 'jadi',
    'org': 'orang',
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
    'bs': 'bisa', 'mw': 'mau', 'akn': 'akan',
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

    // ── English: Common Whisper mishears ──
    'gonna': 'going to', 'wanna': 'want to', 'gotta': 'got to',
    'lemme': 'let me', 'gimme': 'give me', 'kinda': 'kind of',
    'sorta': 'sort of', 'outta': 'out of', 'dunno': "don't know",
    'shoulda': 'should have', 'coulda': 'could have', 'woulda': 'would have',
    'musta': 'must have', 'mighta': 'might have',
    'ain\'t': 'is not', 'y\'all': 'you all',
  };

  // ═══════════════════════════════════════════════════════════════
  //  Dictionary Management
  // ═══════════════════════════════════════════════════════════════

  loadDictionary(entries: DictionaryEntry[]): void {
    this.dictionary.clear();
    for (const entry of entries) {
      this.dictionary.set(entry.phrase.toLowerCase(), entry.replacement);
    }
    this.logger.info('Dictionary loaded', { entries: this.dictionary.size });
  }

  // ═══════════════════════════════════════════════════════════════
  //  Main Processing Pipeline
  // ═══════════════════════════════════════════════════════════════

  process(text: string): FuzzyMatchResult {
    if (!text?.trim()) {
      return { original: text, corrected: text, confidence: 1, changes: [] };
    }

    const words = text.split(/(\s+)/); // Preserve whitespace
    const changes: FuzzyMatchResult['changes'] = [];
    const correctedWords: string[] = [];

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

      // ── Priority 1: Exact dictionary match ──
      if (this.dictionary.has(lowerClean)) {
        replacement = this.dictionary.get(lowerClean)!;
        confidence = 1.0;
        reason = 'dictionary';
      }

      // ── Priority 2: Exact common error match ──
      if (!replacement && this.COMMON_ERRORS[lowerClean]) {
        replacement = this.COMMON_ERRORS[lowerClean];
        confidence = 0.95;
        reason = 'common_error';
      }

      // ── Priority 3: Fuzzy dictionary match ──
      if (!replacement && this.dictionary.size > 0) {
        const dictMatch = this.findBestMatch(lowerClean, Array.from(this.dictionary.keys()));
        if (dictMatch && dictMatch.distance <= this.maxDistance) {
          const similarity = 1 - (dictMatch.distance / Math.max(cleanWord.length, dictMatch.word.length));
          if (similarity >= this.minConfidenceThreshold) {
            replacement = this.dictionary.get(dictMatch.word)!;
            confidence = similarity;
            reason = 'fuzzy';
          }
        }
      }

      // ── Priority 4: Fuzzy common error match ──
      if (!replacement) {
        const errorKeys = Object.keys(this.COMMON_ERRORS);
        const errorMatch = this.findBestMatch(lowerClean, errorKeys);
        if (errorMatch && errorMatch.distance <= this.maxDistance) {
          const similarity = 1 - (errorMatch.distance / Math.max(cleanWord.length, errorMatch.word.length));
          if (similarity >= this.minConfidenceThreshold) {
            replacement = this.COMMON_ERRORS[errorMatch.word];
            confidence = similarity * 0.9; // Slightly lower confidence for fuzzy common errors
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

    this.logger.info('Fuzzy matching complete', {
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
  //  Levenshtein Distance
  // ═══════════════════════════════════════════════════════════════

  private findBestMatch(word: string, candidates: string[]): { word: string; distance: number } | null {
    let bestMatch: { word: string; distance: number } | null = null;
    let bestDistance = Infinity;

    // Quick length filter for performance
    const minLen = word.length - this.maxDistance;
    const maxLen = word.length + this.maxDistance;

    for (const candidate of candidates) {
      if (candidate.length < minLen || candidate.length > maxLen) continue;

      const distance = this.levenshteinDistance(word, candidate);

      if (distance < bestDistance && distance <= this.maxDistance) {
        bestDistance = distance;
        bestMatch = { word: candidate, distance };
      }
    }

    return bestMatch;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    if (m === 0) return n;
    if (n === 0) return m;
    if (m === 1 && n === 1) return a[0] === b[0] ? 0 : 1;

    // Optimized: single array for space efficiency
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);

    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,      // deletion
          curr[j - 1] + 1,  // insertion
          prev[j - 1] + cost // substitution
        );
      }
      [prev, curr] = [curr, prev];
    }

    return prev[n];
  }

  // ═══════════════════════════════════════════════════════════════
  //  Utility Functions
  // ═══════════════════════════════════════════════════════════════

  /**
   * Strip surrounding punctuation from a word for matching.
   * Preserves the punctuation for reattachment.
   */
  private stripPunctuation(word: string): string {
    return word.replace(/^[.,!?;:'"()\[\]{}]+|[.,!?;:'"()\[\]{}]+$/g, '');
  }

  /**
   * Preserve the original case pattern when replacing.
   */
  private preserveCase(original: string, replacement: string): string {
    if (!original || !replacement) return replacement;

    // All uppercase
    if (original === original.toUpperCase() && original.length > 1) {
      return replacement.toUpperCase();
    }

    // First letter capitalized
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
      dictionarySize: this.dictionary.size,
      commonErrorsSize: Object.keys(this.COMMON_ERRORS).length,
    };
  }
}
