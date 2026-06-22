import { Logger } from './logger';

export interface CleanupOptions {
  removeFillers?: boolean;
  handlePunctuation?: boolean;
  handleVoiceCommands?: boolean;
  capitalizeFirst?: boolean;
  capitalizeAfterPeriod?: boolean;
  fixSpacing?: boolean;
  dictionary?: Record<string, string>;
  snippets?: Record<string, string>;
}

// ONLY true filler words - words with NO meaning
const FILLER_PATTERNS = [
  // Indonesian fillers (pure hesitation sounds)
  /\beh\b/gi, /\bemm\b/gi, /\beum\b/gi, /\banu\b/gi, /\bhmm\b/gi,
  /\bhm\b/gi, /\bah\b/gi, /\bahm\b/gi, /\beeh\b/gi,
  
  // English fillers (pure hesitation sounds)
  /\bum\b/gi, /\buh\b/gi, /\bumm\b/gi, /\buhh\b/gi,
  /\blike\b/gi, /\byou know\b/gi, /\bbasically\b/gi,
];

// Words that are NOT fillers (removed from old list):
// - "terus" = "then/continue" (meaningful)
// - "jadi" = "so/become" (meaningful)
// - "ya" = "yes" (meaningful)
// - "nah" = "well" (meaningful)
// - "oke/ok" = "okay" (meaningful)
// - "gitu" = "like that" (meaningful)
// - "sih" = emphasis particle (keep)
// - "deh" = emphasis particle (keep)
// - "dong" = emphasis particle (keep)
// - "kok" = surprise particle (keep)
// - "nih/tuh" = demonstrative (keep)

const PUNCTUATION_MAP: Record<string, string> = {
  'koma': ',', 'titik': '.', 'tanda tanya': '?', 'tanda seru': '!',
  'baris baru': '\n', 'paragraf baru': '\n\n', 'titik koma': ';',
  'titik dua': ':', 'tanda petik': '"', 'tanda petik buka': '"',
  'tanda petik tutup': '"', 'kurung buka': '(', 'kurung tutup': ')',
  'strip': '-', 'dash': '-', 'garis miring': '/', 'slash': '/',
  'ellipsis': '...', 'titik tiga': '...',
};

const VOICE_COMMANDS: Record<string, string> = {
  // English commands - punctuation (specific enough to not conflict)
  'new paragraph': '\n\n', 'new line': '\n', 'newline': '\n', 'enter': '\n',
  'tab': '\t', 'period': '.', 'comma': ',', 'question mark': '?',
  'exclamation mark': '!', 'exclamation point': '!', 'colon': ':',
  'semicolon': ';', 'hyphen': '-', 'dash': '-',
  'open parenthesis': '(', 'close parenthesis': ')',
  'open bracket': '[', 'close bracket': ']',
  'open quote': '"', 'close quote': '"', 'single quote': "'",
  'apostrophe': "'", 'ellipsis': '...', 'ampersand': '&',
  'at sign': '@', 'hash': '#', 'dollar sign': '$', 'percent': '%',
  'asterisk': '*', 'plus sign': '+', 'equals sign': '=', 'underscore': '_',
  'tilde': '~', 'backtick': '`', 'pipe symbol': '|', 'backslash': '\\',
  'less than': '<', 'greater than': '>', 'caret': '^',
  // Short English aliases (explicit, won't conflict with normal speech)
  'times symbol': '*', 'divide symbol': '/',
  'not equal': '!=',
  'open curly': '{', 'close curly': '}',
  'open square': '[', 'close square': ']',
  // Indonesian commands - punctuation (specific multi-word phrases)
  'koma': ',', 'titik': '.', 'tanda tanya': '?', 'tanda seru': '!',
  'titik koma': ';', 'titik dua': ':', 'petik dua': '"', 'petik satu': "'",
  'kurung buka': '(', 'kurung tutup': ')',
  'kurung siku buka': '[', 'kurung siku tutup': ']',
  'kurung kurawal buka': '{', 'kurung kurawal tutup': '}',
  // Indonesian commands - symbols (ONLY specific multi-word to avoid false matches)
  'simbol tambah': '+', 'simbol kurang': '-',
  'simbol kali': '*', 'simbol bagi': '/',
  'sama dengan': '=', 'tidak sama dengan': '!=',
  'lebih besar dari': '>', 'lebih kecil dari': '<',
  'lebih besar sama dengan': '>=', 'lebih kecil sama dengan': '<=',
  'simbol dan': '&&', 'simbol atau': '||',
  'tagar': '#',
  'et': '@',
  // Indonesian commands - actions
  'paragraf baru': '\n\n', 'baris baru': '\n',
};

const FORMATTING_COMMANDS: Record<string, { prefix: string; suffix: string }> = {
  'bold': { prefix: '**', suffix: '**' },
  'italic': { prefix: '*', suffix: '*' },
  'underline': { prefix: '__', suffix: '__' },
  'strikethrough': { prefix: '~~', suffix: '~~' },
  'code': { prefix: '`', suffix: '`' },
  'heading': { prefix: '# ', suffix: '' },
  'heading 1': { prefix: '# ', suffix: '' },
  'heading 2': { prefix: '## ', suffix: '' },
  'heading 3': { prefix: '### ', suffix: '' },
  'bullet': { prefix: '- ', suffix: '' },
  'bullet point': { prefix: '- ', suffix: '' },
  'numbered list': { prefix: '1. ', suffix: '' },
  'quote': { prefix: '> ', suffix: '' },
  'blockquote': { prefix: '> ', suffix: '' },
  'link': { prefix: '[', suffix: '](url)' },
  'image': { prefix: '![', suffix: '](url)' },
  'horizontal rule': { prefix: '\n---\n', suffix: '' },
  'page break': { prefix: '\n\n---\n\n', suffix: '' },
};

const NUMBER_WORDS: Record<string, string> = {
  'nol': '0', 'kosong': '0', 'satu': '1', 'se': '1',
  'dua': '2', 'tiga': '3', 'empat': '4', 'lima': '5',
  'enam': '6', 'tujuh': '7', 'delapan': '8', 'sembilan': '9',
  'sepuluh': '10', 'sebelas': '11', 'dua belas': '12',
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'ten': '10', 'eleven': '11', 'twelve': '12',
};

// Pre-compile regex for punctuation and commands
const PUNCTUATION_REGEX = new Map<string, RegExp>();
for (const cmd of Object.keys(PUNCTUATION_MAP)) {
  const escaped = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  PUNCTUATION_REGEX.set(cmd, new RegExp(`\\b${escaped}\\b`, 'gi'));
}

const VOICE_COMMAND_REGEX = new Map<string, RegExp>();
for (const cmd of Object.keys(VOICE_COMMANDS)) {
  const escaped = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  VOICE_COMMAND_REGEX.set(cmd, new RegExp(`\\b${escaped}\\b`, 'gi'));
}

const NUMBER_REGEX = new Map<string, RegExp>();
for (const word of Object.keys(NUMBER_WORDS)) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  NUMBER_REGEX.set(word, new RegExp(`\\b${escaped}\\b`, 'gi'));
}

export class TextCleaner {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  clean(input: string, options: CleanupOptions = {}): string {
    if (!input || !input.trim()) return '';

    const {
      removeFillers = true,
      handlePunctuation = true,
      handleVoiceCommands = true,
      capitalizeFirst = true,
      capitalizeAfterPeriod = true,
      fixSpacing = true,
      dictionary = {},
      snippets = {},
    } = options;

    let text = input.trim();

    // Process in optimal order (least expensive first)
    if (handleVoiceCommands) {
      text = this.handleFormattingCommands(text);
      text = this.processVoiceCommands(text);
    }

    if (removeFillers) {
      text = this.removeFillerWords(text);
    }

    if (handlePunctuation) {
      text = this.processPunctuation(text);
      text = this.processNumberWords(text);
    }

    if (Object.keys(snippets).length > 0) {
      text = this.applySnippets(text, snippets);
    }

    if (Object.keys(dictionary).length > 0) {
      text = this.applyDictionary(text, dictionary);
    }

    if (fixSpacing) {
      text = this.normalizeWhitespace(text);
    }

    text = text.trim();

    if (capitalizeFirst && text.length > 0) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }

    if (capitalizeAfterPeriod) {
      text = this.capitalizeAfterSentenceEnders(text);
    }

    // Don't return empty or just punctuation
    if (!text || /^[.,;:!?\s]+$/.test(text)) {
      return input.trim(); // Return original if cleanup removed everything
    }

    return text;
  }

  private removeFillerWords(text: string): string {
    let result = text;
    for (const regex of FILLER_PATTERNS) {
      result = result.replace(regex, '');
    }
    return result;
  }

  private processPunctuation(text: string): string {
    let result = text;
    for (const [cmd, regex] of PUNCTUATION_REGEX) {
      result = result.replace(regex, PUNCTUATION_MAP[cmd]);
    }
    return result;
  }

  private processVoiceCommands(text: string): string {
    let result = text;
    for (const [cmd, regex] of VOICE_COMMAND_REGEX) {
      result = result.replace(regex, VOICE_COMMANDS[cmd]);
    }
    return result;
  }

  private handleFormattingCommands(text: string): string {
    const commandPattern = /(?:make|set|turn)\s+(?:it\s+)?(?:to\s+)?(?:be\s+)?(?:a\s+)?(bold|italic|underline|strikethrough|code|heading|bullet|quote|link)/gi;
    
    return text.replace(commandPattern, (match, command) => {
      const format = FORMATTING_COMMANDS[command.toLowerCase()];
      return format ? `${format.prefix}SELECTION${format.suffix}` : match;
    });
  }

  private processNumberWords(text: string): string {
    let result = text;
    for (const [word, regex] of NUMBER_REGEX) {
      result = result.replace(regex, NUMBER_WORDS[word]);
    }
    return result;
  }

  private applySnippets(text: string, snippets: Record<string, string>): string {
    let result = text;
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

  private normalizeWhitespace(text: string): string {
    return text
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+([,.?!;:])/g, '$1')
      .replace(/\.{2,}/g, '.')
      .replace(/,{2,}/g, ',')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ +\n/g, '\n')
      .replace(/\n +/g, '\n')
      .replace(/\n([a-zа-я])/g, (m, p) => '\n' + p.toUpperCase());
  }

  private capitalizeAfterSentenceEnders(text: string): string {
    return text.replace(/([.!?]\s+)([a-zа-я])/g, (m, p1, p2) => p1 + p2.toUpperCase());
  }

  cleanForDisplay(input: string): string {
    if (!input) return '';
    let text = input.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
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
   * Modes:
   *  - raw:    Whisper output untouched except blank/audio tags removed
   *  - natural: light whitespace + spoken punctuation (koma→, titik→.) only
   *  - clean:  full cleanup – fillers, punctuation, capitalization, dictionary
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
        // In raw mode, still apply voice commands for symbols (always enabled)
        // This allows users to dictate symbols like "plus", "koma", etc.
        let rawResult = this.normalizeWhitespace(input.trim());
        // Always process voice commands in raw mode for symbol support
        rawResult = this.processVoiceCommands(rawResult);
        return rawResult;

      case 'natural':
        // Light cleanup: spoken punctuation + whitespace, nothing else
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
        // Full cleanup: fillers, punctuation, capitalization, dictionary, snippets
        return this.clean(input.trim(), {
          removeFillers: true,
          handlePunctuation: true,
          handleVoiceCommands: voiceCommands,
          capitalizeFirst: true,
          capitalizeAfterPeriod: true,
          fixSpacing: true,
          dictionary,
          snippets,
        });

      default:
        return input.trim();
    }
  }
}
