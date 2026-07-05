import { Logger } from './logger';

export interface CleanupOptions {
  removeFillers?: boolean;
  handlePunctuation?: boolean;
  handleVoiceCommands?: boolean;
  capitalizeFirst?: boolean;
  capitalizeAfterPeriod?: boolean;
  fixSpacing?: boolean;
  fixAbbreviations?: boolean;
  dictionary?: Record<string, string>;
  snippets?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════
//  Filler Words (hesitation sounds only — NOT meaningful words)
// ═══════════════════════════════════════════════════════════════

const FILLER_PATTERNS: RegExp[] = [
  // Indonesian fillers (pure hesitation sounds)
  /\b(eh|emm|eum|anu|hmm|hm|ah|ahm|eeh|umm|uhh)\b/gi,
  // English fillers (pure hesitation sounds)
  /\b(um|uh|umm|uhh)\b/gi,
  // Multi-word fillers (English)
  /\byou know\b/gi,
  /\bbasically\b/gi,
];

// ═══════════════════════════════════════════════════════════════
//  Voice Commands → Symbols
// ═══════════════════════════════════════════════════════════════

interface VoiceCommand {
  pattern: RegExp;
  replacement: string;
  /** true = always apply, false = only in voice command mode */
  alwaysApply?: boolean;
}

// Multi-word commands first (more specific), then single-word
const VOICE_COMMANDS: VoiceCommand[] = [
  // ── Indonesian: Multi-word punctuation (always apply) ──
  { pattern: /\bparagraf baru\b/gi, replacement: '\n\n', alwaysApply: true },
  { pattern: /\bbaris baru\b/gi, replacement: '\n', alwaysApply: true },
  { pattern: /\btanda tanya\b/gi, replacement: '?', alwaysApply: true },
  { pattern: /\btanda seru\b/gi, replacement: '!', alwaysApply: true },
  { pattern: /\btitik koma\b/gi, replacement: ';', alwaysApply: true },
  { pattern: /\btitik dua\b/gi, replacement: ':', alwaysApply: true },
  { pattern: /\bpetik dua\b/gi, replacement: '"', alwaysApply: true },
  { pattern: /\bpetik satu\b/gi, replacement: "'", alwaysApply: true },
  { pattern: /\bkurung buka\b/gi, replacement: '(', alwaysApply: true },
  { pattern: /\bkurung tutup\b/gi, replacement: ')', alwaysApply: true },
  { pattern: /\bkurung siku buka\b/gi, replacement: '[', alwaysApply: true },
  { pattern: /\bkurung siku tutup\b/gi, replacement: ']', alwaysApply: true },
  { pattern: /\bkurung kurawal buka\b/gi, replacement: '{', alwaysApply: true },
  { pattern: /\bkurung kurawal tutup\b/gi, replacement: '}', alwaysApply: true },

  // ── Indonesian: Multi-word symbol commands ──
  { pattern: /\bsimbol tambah\b/gi, replacement: '+', alwaysApply: true },
  { pattern: /\bsimbol kurang\b/gi, replacement: '-', alwaysApply: true },
  { pattern: /\bsimbol kali\b/gi, replacement: '*', alwaysApply: true },
  { pattern: /\bsimbol bagi\b/gi, replacement: '/', alwaysApply: true },
  { pattern: /\bsama dengan\b/gi, replacement: '=', alwaysApply: true },
  { pattern: /\btidak sama dengan\b/gi, replacement: '!=', alwaysApply: true },
  { pattern: /\blebih besar dari\b/gi, replacement: '>', alwaysApply: true },
  { pattern: /\blebih kecil dari\b/gi, replacement: '<', alwaysApply: true },
  { pattern: /\blebih besar sama dengan\b/gi, replacement: '>=', alwaysApply: true },
  { pattern: /\blebih kecil sama dengan\b/gi, replacement: '<=', alwaysApply: true },

  // ── Indonesian: Single-word punctuation ──
  { pattern: /\bkoma\b/gi, replacement: ',', alwaysApply: true },
  { pattern: /\btitik\b/gi, replacement: '.', alwaysApply: true },
  { pattern: /\btagar\b/gi, replacement: '#', alwaysApply: true },

  // ── English: Multi-word punctuation ──
  { pattern: /\bnew paragraph\b/gi, replacement: '\n\n', alwaysApply: true },
  { pattern: /\bnew line\b/gi, replacement: '\n', alwaysApply: true },
  { pattern: /\bnewline\b/gi, replacement: '\n', alwaysApply: true },
  { pattern: /\bquestion mark\b/gi, replacement: '?', alwaysApply: true },
  { pattern: /\bexclamation mark\b/gi, replacement: '!', alwaysApply: true },
  { pattern: /\bexclamation point\b/gi, replacement: '!', alwaysApply: true },
  { pattern: /\bopen parenthesis\b/gi, replacement: '(', alwaysApply: true },
  { pattern: /\bclose parenthesis\b/gi, replacement: ')', alwaysApply: true },
  { pattern: /\bopen bracket\b/gi, replacement: '[', alwaysApply: true },
  { pattern: /\bclose bracket\b/gi, replacement: ']', alwaysApply: true },
  { pattern: /\bopen curly\b/gi, replacement: '{', alwaysApply: true },
  { pattern: /\bclose curly\b/gi, replacement: '}', alwaysApply: true },
  { pattern: /\bopen square\b/gi, replacement: '[', alwaysApply: true },
  { pattern: /\bclose square\b/gi, replacement: ']', alwaysApply: true },
  { pattern: /\bopen quote\b/gi, replacement: '"', alwaysApply: true },
  { pattern: /\bclose quote\b/gi, replacement: '"', alwaysApply: true },
  { pattern: /\bsingle quote\b/gi, replacement: "'", alwaysApply: true },
  { pattern: /\bplus sign\b/gi, replacement: '+', alwaysApply: true },
  { pattern: /\bequals sign\b/gi, replacement: '=', alwaysApply: true },
  { pattern: /\btimes symbol\b/gi, replacement: '*', alwaysApply: true },
  { pattern: /\bdivide symbol\b/gi, replacement: '/', alwaysApply: true },
  { pattern: /\bnot equal\b/gi, replacement: '!=', alwaysApply: true },

  // ── English: Single-word commands ──
  { pattern: /\benter\b/gi, replacement: '\n', alwaysApply: true },
  { pattern: /\btab\b/gi, replacement: '\t', alwaysApply: true },
  { pattern: /\bperiod\b/gi, replacement: '.', alwaysApply: true },
  { pattern: /\bcomma\b/gi, replacement: ',', alwaysApply: true },
  { pattern: /\bcolon\b/gi, replacement: ':', alwaysApply: true },
  { pattern: /\bsemicolon\b/gi, replacement: ';', alwaysApply: true },
  { pattern: /\bhyphen\b/gi, replacement: '-', alwaysApply: true },
  { pattern: /\bdash\b/gi, replacement: '-', alwaysApply: true },
  { pattern: /\bapostrophe\b/gi, replacement: "'", alwaysApply: true },
  { pattern: /\bellipsis\b/gi, replacement: '...', alwaysApply: true },
  { pattern: /\bampersand\b/gi, replacement: '&', alwaysApply: true },
  { pattern: /\bat sign\b/gi, replacement: '@', alwaysApply: true },
  { pattern: /\bhash\b/gi, replacement: '#', alwaysApply: true },
  { pattern: /\bpercent\b/gi, replacement: '%', alwaysApply: true },
  { pattern: /\basterisk\b/gi, replacement: '*', alwaysApply: true },
  { pattern: /\bpound sign\b/gi, replacement: '£', alwaysApply: true },
  { pattern: /\bdollar sign\b/gi, replacement: '$', alwaysApply: true },
  { pattern: /\beuro sign\b/gi, replacement: '€', alwaysApply: true },
  { pattern: /\byen sign\b/gi, replacement: '¥', alwaysApply: true },
];

// ═══════════════════════════════════════════════════════════════
//  Formatting Commands (bold, italic, etc.)
// ═══════════════════════════════════════════════════════════════

interface FormattingCommand {
  pattern: RegExp;
  prefix: string;
  suffix: string;
}

const FORMATTING_COMMANDS: FormattingCommand[] = [
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?bold\b/gi, prefix: '**', suffix: '**' },
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?italic\b/gi, prefix: '*', suffix: '*' },
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?underline\b/gi, prefix: '__', suffix: '__' },
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?strikethrough\b/gi, prefix: '~~', suffix: '~~' },
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?code\b/gi, prefix: '`', suffix: '`' },
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?heading\b/gi, prefix: '# ', suffix: '' },
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?heading\s+1\b/gi, prefix: '# ', suffix: '' },
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?heading\s+2\b/gi, prefix: '## ', suffix: '' },
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?heading\s+3\b/gi, prefix: '### ', suffix: '' },
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?bullet\b/gi, prefix: '- ', suffix: '' },
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?numbered\s+list\b/gi, prefix: '1. ', suffix: '' },
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?quote\b/gi, prefix: '> ', suffix: '' },
  { pattern: /\b(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?blockquote\b/gi, prefix: '> ', suffix: '' },
];

// ═══════════════════════════════════════════════════════════════
//  Number Words → Digits
// ═══════════════════════════════════════════════════════════════

const NUMBER_WORDS: Record<string, string> = {
  // Indonesian
  'nol': '0', 'kosong': '0',
  'satu': '1', 'se': '1',
  'dua': '2', 'tiga': '3', 'empat': '4', 'lima': '5',
  'enam': '6', 'tujuh': '7', 'delapan': '8', 'sembilan': '9',
  'sepuluh': '10', 'sebelas': '11',
  // English
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'ten': '10', 'eleven': '11', 'twelve': '12',
  'thirteen': '13', 'fourteen': '14', 'fifteen': '15',
  'sixteen': '16', 'seventeen': '17', 'eighteen': '18', 'nineteen': '19',
  'twenty': '20', 'thirty': '30', 'forty': '40', 'fifty': '50',
  'sixty': '60', 'seventy': '70', 'eighty': '80', 'ninety': '90',
  'hundred': '100', 'thousand': '1000', 'million': '1000000',
};

// ═══════════════════════════════════════════════════════════════
//  Abbreviation Handling
// ═══════════════════════════════════════════════════════════════

// Abbreviations that should NOT be followed by capitalization
const ABBREVIATIONS = new Set([
  'dr', 'prof', 'ir', 'st', 'jr', 'sr', 'mr', 'mrs', 'ms',
  'vs', 'etc', 'eg', 'ie', 'nb', 'ps', 'cf', 'al',
  'org', 'gov', 'edu', 'com', 'net', 'id',
  'jakarta', 'jabar', 'jatim', 'jateng', 'sumut', 'sulsel',
  'us', 'uk', 'eu', 'un', 'who', 'fbi', 'cia', 'nasa',
]);

// ═══════════════════════════════════════════════════════════════
//  Main TextCleaner Class
// ═══════════════════════════════════════════════════════════════

export class TextCleaner {
  private logger: Logger;

  // Pre-compiled regex caches
  private numberRegexCache: Map<string, RegExp> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
    this.buildRegexCaches();
  }

  private buildRegexCaches(): void {
    // Pre-compile number word regexes
    for (const word of Object.keys(NUMBER_WORDS)) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      this.numberRegexCache.set(word, new RegExp(`\\b${escaped}\\b`, 'gi'));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Main Clean Pipeline
  // ═══════════════════════════════════════════════════════════════

  clean(input: string, options: CleanupOptions = {}): string {
    if (!input || !input.trim()) return '';

    const {
      removeFillers = true,
      handlePunctuation = true,
      handleVoiceCommands = true,
      capitalizeFirst = true,
      capitalizeAfterPeriod = true,
      fixSpacing = true,
      fixAbbreviations = true,
      dictionary = {},
      snippets = {},
    } = options;

    let text = input.trim();

    // Process in optimal order (most specific first)

    // 1. Voice commands (multi-word first, then single-word)
    if (handleVoiceCommands) {
      text = this.processFormattingCommands(text);
      text = this.processVoiceCommands(text);
    }

    // 2. Number words → digits
    if (handlePunctuation) {
      text = this.processNumberWords(text);
    }

    // 3. Filler removal (conservative)
    if (removeFillers) {
      text = this.removeFillerWords(text);
    }

    // 4. Snippets (before dictionary, longer patterns first)
    if (Object.keys(snippets).length > 0) {
      text = this.applySnippets(text, snippets);
    }

    // 5. Personal dictionary
    if (Object.keys(dictionary).length > 0) {
      text = this.applyDictionary(text, dictionary);
    }

    // 6. Whitespace normalization
    if (fixSpacing) {
      text = this.normalizeWhitespace(text);
    }

    text = text.trim();

    // 7. Capitalization
    if (capitalizeFirst && text.length > 0) {
      text = this.smartCapitalize(text);
    }

    if (capitalizeAfterPeriod) {
      text = this.capitalizeAfterSentenceEnders(text, fixAbbreviations);
    }

    // Safety: don't return empty or just punctuation
    if (!text || /^[.,;:!?\s\n]+$/.test(text)) {
      return input.trim();
    }

    return text;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Filler Removal (conservative)
  // ═══════════════════════════════════════════════════════════════

  private removeFillerWords(text: string): string {
    let result = text;
    for (const regex of FILLER_PATTERNS) {
      result = result.replace(regex, '');
    }
    // Clean up double spaces left by removal
    return result.replace(/\s{2,}/g, ' ');
  }

  // ═══════════════════════════════════════════════════════════════
  //  Voice Commands
  // ═══════════════════════════════════════════════════════════════

  private processVoiceCommands(text: string): string {
    let result = text;
    for (const cmd of VOICE_COMMANDS) {
      result = result.replace(cmd.pattern, cmd.replacement);
    }
    return result;
  }

  private processFormattingCommands(text: string): string {
    let result = text;
    for (const cmd of FORMATTING_COMMANDS) {
      result = result.replace(cmd.pattern, `${cmd.prefix}SELECTION${cmd.suffix}`);
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Number Words
  // ═══════════════════════════════════════════════════════════════

  private processNumberWords(text: string): string {
    let result = text;
    for (const [word, digit] of this.numberRegexCache) {
      result = result.replace(this.numberRegexCache.get(word)!, NUMBER_WORDS[word]);
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Snippets & Dictionary
  // ═══════════════════════════════════════════════════════════════

  private applySnippets(text: string, snippets: Record<string, string>): string {
    let result = text;
    // Sort by length descending (longer triggers first to avoid partial matches)
    const sorted = Object.entries(snippets).sort((a, b) => b[0].length - a[0].length);
    for (const [trigger, replacement] of sorted) {
      const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), replacement);
    }
    return result;
  }

  private applyDictionary(text: string, dictionary: Record<string, string>): string {
    let result = text;
    const sorted = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length);
    for (const [phrase, replacement] of sorted) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), replacement);
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Whitespace Normalization
  // ═══════════════════════════════════════════════════════════════

  private normalizeWhitespace(text: string): string {
    return text
      // Collapse multiple spaces
      .replace(/[ \t]+/g, ' ')
      // Remove space before punctuation
      .replace(/\s+([,.?!;:])/g, '$1')
      // Fix repeated punctuation
      .replace(/\.{3,}/g, '...')
      .replace(/,{2,}/g, ',')
      .replace(/!{2,}/g, '!')
      .replace(/\?{2,}/g, '?')
      // Fix newlines
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ +\n/g, '\n')
      .replace(/\n +/g, '\n')
      // Capitalize after newline
      .replace(/\n([a-zа-я])/g, (m, p) => '\n' + p.toUpperCase());
  }

  // ═══════════════════════════════════════════════════════════════
  //  Smart Capitalization
  // ═══════════════════════════════════════════════════════════════

  private smartCapitalize(text: string): string {
    if (!text) return text;
    // Don't capitalize if it looks like code or a URL
    if (/^(https?:|www\.|\/\/)/i.test(text)) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Capitalize the first letter after sentence-ending punctuation.
   * Respects abbreviations (dr., mr., etc.) — doesn't capitalize after them.
   */
  private capitalizeAfterSentenceEnders(text: string, respectAbbreviations: boolean): string {
    if (respectAbbreviations) {
      // Handle abbreviations: don't capitalize after them
      const abbrPattern = new RegExp(
        `\\.\\s+([a-zа-я])`,
        'g'
      );

      return text.replace(/([.!?]\s+)([a-zа-я])/g, (match, punc, letter, offset) => {
        // Check if this period is part of an abbreviation
        const beforePeriod = text.substring(0, offset);
        const lastWord = beforePeriod.split(/\s+/).pop()?.toLowerCase() || '';
        if (ABBREVIATIONS.has(lastWord)) {
          return match; // Don't capitalize after abbreviation
        }
        return punc + letter.toUpperCase();
      });
    }

    return text.replace(/([.!?]\s+)([a-zа-я])/g, (m, p1, p2) => p1 + p2.toUpperCase());
  }

  // ═══════════════════════════════════════════════════════════════
  //  Public Utility Methods
  // ═══════════════════════════════════════════════════════════════

  cleanForDisplay(input: string): string {
    if (!input) return '';
    const text = input.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
    return text.length > 100 ? text.substring(0, 100) + '...' : text;
  }

  getWordCount(text: string): number {
    if (!text) return 0;
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

  getCharCount(text: string): number {
    return text ? text.length : 0;
  }

  getSentenceCount(text: string): number {
    if (!text) return 0;
    return text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  }

  /**
   * Apply processing mode to text.
   * - raw:    Only voice commands + whitespace
   * - natural: Light cleanup — spoken punctuation only
   * - clean:  Full pipeline
   */
  cleanForMode(
    input: string,
    mode: 'raw' | 'natural' | 'clean' = 'natural',
    opts: {
      dictionary?: Record<string, string>;
      snippets?: Record<string, string>;
      voiceCommands?: boolean;
    } = {}
  ): string {
    if (!input?.trim()) return input || '';

    const { dictionary = {}, snippets = {}, voiceCommands = false } = opts;

    switch (mode) {
      case 'raw':
        let rawResult = this.normalizeWhitespace(input.trim());
        rawResult = this.processVoiceCommands(rawResult);
        return rawResult;

      case 'natural':
        return this.clean(input.trim(), {
          removeFillers: false,
          handlePunctuation: true,
          handleVoiceCommands: voiceCommands,
          capitalizeFirst: false,
          capitalizeAfterPeriod: false,
          fixSpacing: true,
          dictionary: {},
          snippets: {},
        });

      case 'clean':
        return this.clean(input.trim(), {
          removeFillers: true,
          handlePunctuation: true,
          handleVoiceCommands: voiceCommands,
          capitalizeFirst: true,
          capitalizeAfterPeriod: true,
          fixSpacing: true,
          fixAbbreviations: true,
          dictionary,
          snippets,
        });

      default:
        return input.trim();
    }
  }
}
