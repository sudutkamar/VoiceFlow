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
  }>;
}

export interface DictionaryEntry {
  phrase: string;
  replacement: string;
}

export class FuzzyMatcher {
  private logger: Logger;
  private dictionary: Map<string, string> = new Map();
  private commonErrors: Map<string, string> = new Map();
  private maxDistance: number;

  constructor(logger: Logger, maxDistance: number = 2) {
    this.logger = logger;
    this.maxDistance = maxDistance;
    this.initCommonErrors();
  }

  /**
   * Initialize common Indonesian transcription errors
   */
  private initCommonErrors(): void {
    const errors: [string, string][] = [
      // Common Whisper errors for Indonesian
      ['tesih', 'test'],
      ['tesis', 'test'],
      ['tesi', 'test'],
      ['adala', 'adalah'],
      ['adalh', 'adalah'],
      ['adlah', 'adalah'],
      ['engga', 'tidak'],
      ['enggak', 'tidak'],
      ['ngga', 'tidak'],
      ['nggak', 'tidak'],
      ['gak', 'tidak'],
      ['ga', 'tidak'],
      ['gk', 'tidak'],
      ['tdk', 'tidak'],
      ['tak', 'tidak'],
      ['aja', 'saja'],
      ['aj', 'saja'],
      ['sj', 'saja'],
      ['sm', 'sama'],
      ['smua', 'semua'],
      ['semu', 'semua'],
      ['dg', 'dengan'],
      ['dgn', 'dengan'],
      ['dng', 'dengan'],
      ['dngn', 'dengan'],
      ['utk', 'untuk'],
      ['unt', 'untuk'],
      ['utk', 'untuk'],
      ['dr', 'dari'],
      ['dri', 'dari'],
      ['km', 'kamu'],
      ['kmu', 'kamu'],
      ['sy', 'saya'],
      ['sy', 'saya'],
      ['gw', 'saya'],
      ['gue', 'saya'],
      ['aq', 'aku'],
      ['ak', 'aku'],
      ['aku', 'aku'],
      ['bgt', 'banget'],
      ['bngt', 'banget'],
      ['bnget', 'banget'],
      ['bener', 'benar'],
      ['bner', 'benar'],
      ['emg', 'memang'],
      ['emng', 'memang'],
      ['mgkn', 'mungkin'],
      ['mngkn', 'mungkin'],
      ['gmn', 'gimana'],
      ['gmna', 'gimana'],
      ['gimna', 'gimana'],
      ['bgmn', 'bagaimana'],
      ['bgmna', 'bagaimana'],
      ['trus', 'terus'],
      ['trs', 'terus'],
      ['truz', 'terus'],
      ['klo', 'kalau'],
      ['kalo', 'kalau'],
      ['kl', 'kalau'],
      ['klau', 'kalau'],
      ['klu', 'kalau'],
      ['blm', 'belum'],
      ['blum', 'belum'],
      ['blom', 'belum'],
      ['sdh', 'sudah'],
      ['sdah', 'sudah'],
      ['udh', 'sudah'],
      ['udah', 'sudah'],
      ['udh', 'sudah'],
      ['dah', 'sudah'],
      ['nya', 'nya'],
      ['ny', 'nya'],
      ['tp', 'tapi'],
      ['tpi', 'tapi'],
      ['tapi', 'tapi'],
      ['krn', 'karena'],
      ['krna', 'karena'],
      ['karna', 'karena'],
      ['kren', 'karena'],
      ['jd', 'jadi'],
      ['jdi', 'jadi'],
      ['jd', 'jadi'],
      ['org', 'orang'],
      ['org', 'orang'],
      ['prg', 'pergi'],
      ['pgi', 'pergi'],
      ['krm', 'kirim'],
      ['kirim', 'kirim'],
      ['dtg', 'datang'],
      ['dtng', 'datang'],
      ['datg', 'datang'],
      ['mkn', 'makan'],
      ['mkan', 'makan'],
      ['mkn', 'makan'],
      ['mnm', 'minum'],
      ['minm', 'minum'],
      ['tdr', 'tidur'],
      ['tidr', 'tidur'],
      ['bngn', 'bangun'],
      ['bangn', 'bangun'],
      ['pulg', 'pulang'],
      ['pulng', 'pulang'],
      ['plg', 'pulang'],
      ['plng', 'pulang'],
      ['krj', 'kerja'],
      ['kerj', 'kerja'],
      ['sklh', 'sekolah'],
      ['seklh', 'sekolah'],
      ['skla', 'sekolah'],
      ['ktr', 'kantor'],
      ['kant', 'kantor'],
      ['rmt', 'rumah'],
      ['rumh', 'rumah'],
      ['rmh', 'rumah'],
      ['mbl', 'mobil'],
      ['mobl', 'mobil'],
      ['mtr', 'motor'],
      ['motr', 'motor'],
      ['kcp', 'kacamata'],
      ['kcm', 'kacamata'],
      ['hsl', 'hasil'],
      ['hasl', 'hasil'],
      ['mslh', 'masalah'],
      ['maslh', 'masalah'],
      ['msl', 'masalah'],
      ['solus', 'solusi'],
      ['slsi', 'solusi'],
      ['jwb', 'jawab'],
      ['jawb', 'jawab'],
      ['jwbn', 'jawaban'],
      ['tmbh', 'tambah'],
      ['tmbh', 'tambah'],
      ['krg', 'kurang'],
      ['kurng', 'kurang'],
      ['lbh', 'lebih'],
      ['lebh', 'lebih'],
      ['cukp', 'cukup'],
      ['cukup', 'cukup'],
      ['sdkt', 'sedikit'],
      ['sedkt', 'sedikit'],
      ['byk', 'banyak'],
      ['bnyk', 'banyak'],
      ['bsr', 'besar'],
      ['besr', 'besar'],
      ['kcl', 'kecil'],
      ['kecl', 'kecil'],
      ['pngt', 'penting'],
      ['pentng', 'penting'],
      ['prlu', 'perlu'],
      ['perlu', 'perlu'],
      ['hrus', 'harus'],
      ['hrs', 'harus'],
      ['haru', 'harus'],
      ['bisa', 'bisa'],
      ['bs', 'bisa'],
      ['mau', 'mau'],
      ['mw', 'mau'],
      ['akan', 'akan'],
      ['akn', 'akan'],
      ['sudah', 'sudah'],
      ['belum', 'belum'],
      ['sedang', 'sedang'],
      ['sdg', 'sedang'],
      ['sedng', 'sedang'],
      ['lagi', 'lagi'],
      ['lgi', 'lagi'],
      ['saja', 'saja'],
      ['hanya', 'hanya'],
      ['hny', 'hanya'],
      ['sangat', 'sangat'],
      ['sngt', 'sangat'],
      ['sangt', 'sangat'],
      ['sekali', 'sekali'],
      ['skli', 'sekali'],
      ['paling', 'paling'],
      ['plng', 'paling'],
      ['paling', 'paling'],
      ['agak', 'agak'],
      ['agk', 'agak'],
      ['cukup', 'cukup'],
      ['ckp', 'cukup'],
      ['cukp', 'cukup'],
      ['lumayan', 'lumayan'],
      ['lmyan', 'lumayan'],
      ['lumyn', 'lumayan'],
    ];

    for (const [error, correction] of errors) {
      this.commonErrors.set(error.toLowerCase(), correction.toLowerCase());
    }

    this.logger.info('FuzzyMatcher initialized', { commonErrors: this.commonErrors.size });
  }

  /**
   * Load dictionary from database
   */
  loadDictionary(entries: DictionaryEntry[]): void {
    this.dictionary.clear();
    for (const entry of entries) {
      this.dictionary.set(entry.phrase.toLowerCase(), entry.replacement.toLowerCase());
    }
    this.logger.info('Dictionary loaded', { entries: this.dictionary.size });
  }

  /**
   * Process text with fuzzy matching
   */
  process(text: string): FuzzyMatchResult {
    const words = text.split(/\s+/);
    const changes: FuzzyMatchResult['changes'] = [];
    const correctedWords: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const lowerWord = word.toLowerCase();
      
      // 1. Check exact dictionary match
      if (this.dictionary.has(lowerWord)) {
        const replacement = this.dictionary.get(lowerWord)!;
        correctedWords.push(this.preserveCase(word, replacement));
        changes.push({
          position: i,
          from: word,
          to: replacement,
          confidence: 1.0,
        });
        continue;
      }

      // 2. Check common errors
      if (this.commonErrors.has(lowerWord)) {
        const correction = this.commonErrors.get(lowerWord)!;
        correctedWords.push(this.preserveCase(word, correction));
        changes.push({
          position: i,
          from: word,
          to: correction,
          confidence: 0.95,
        });
        continue;
      }

      // 3. Fuzzy match against dictionary
      const dictMatch = this.findBestMatch(lowerWord, Array.from(this.dictionary.keys()));
      if (dictMatch && dictMatch.distance <= this.maxDistance) {
        const replacement = this.dictionary.get(dictMatch.word)!;
        correctedWords.push(this.preserveCase(word, replacement));
        changes.push({
          position: i,
          from: word,
          to: replacement,
          confidence: 1 - (dictMatch.distance / Math.max(word.length, dictMatch.word.length)),
        });
        continue;
      }

      // 4. Fuzzy match against common errors
      const errorMatch = this.findBestMatch(lowerWord, Array.from(this.commonErrors.keys()));
      if (errorMatch && errorMatch.distance <= this.maxDistance) {
        const correction = this.commonErrors.get(errorMatch.word)!;
        correctedWords.push(this.preserveCase(word, correction));
        changes.push({
          position: i,
          from: word,
          to: correction,
          confidence: 1 - (errorMatch.distance / Math.max(word.length, errorMatch.word.length)),
        });
        continue;
      }

      // No match found, keep original
      correctedWords.push(word);
    }

    const corrected = correctedWords.join(' ');
    const overallConfidence = changes.length > 0
      ? changes.reduce((sum, c) => sum + c.confidence, 0) / changes.length
      : 1.0;

    return {
      original: text,
      corrected,
      confidence: overallConfidence,
      changes,
    };
  }

  /**
   * Find best match using Levenshtein distance
   */
  private findBestMatch(word: string, candidates: string[]): { word: string; distance: number } | null {
    let bestMatch: { word: string; distance: number } | null = null;
    let bestDistance = Infinity;

    // Quick length filter for performance
    const minLen = word.length - this.maxDistance;
    const maxLen = word.length + this.maxDistance;

    for (const candidate of candidates) {
      // Skip if length difference is too large
      if (candidate.length < minLen || candidate.length > maxLen) continue;

      const distance = this.levenshteinDistance(word, candidate);
      
      if (distance < bestDistance && distance <= this.maxDistance) {
        bestDistance = distance;
        bestMatch = { word: candidate, distance };
      }
    }

    return bestMatch;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    // Optimize for small strings
    if (m === 0) return n;
    if (n === 0) return m;
    if (m === 1 && n === 1) return a[0] === b[0] ? 0 : 1;

    // Use single array for space optimization
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

  /**
   * Preserve the original case pattern
   */
  private preserveCase(original: string, replacement: string): string {
    if (original === original.toUpperCase()) {
      return replacement.toUpperCase();
    }
    if (original[0] === original[0].toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  /**
   * Get statistics about corrections
   */
  getStats(): { dictionarySize: number; commonErrorsSize: number } {
    return {
      dictionarySize: this.dictionary.size,
      commonErrorsSize: this.commonErrors.size,
    };
  }
}
