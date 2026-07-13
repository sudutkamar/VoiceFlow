/**
 * Shared language definitions for VoiceFlow.
 * Used by MiniBar, VerticalMiniBar, and HomePage.
 */

export interface Language {
  /** Language code (ISO 639-1) */
  code: string;
  /** Display label */
  label: string;
  /** Short display (2-3 chars) */
  short: string;
  /** Flag/emoji or short code for button */
  flag: string;
}

export const LANGUAGES: Language[] = [
  { code: 'auto', label: 'Auto Detect', short: 'AUTO', flag: '🌐' },
  { code: 'id', label: 'Indonesia', short: 'ID', flag: 'ID' },
  { code: 'en', label: 'English', short: 'EN', flag: 'EN' },
  { code: 'ja', label: '日本語', short: 'JA', flag: 'JA' },
  { code: 'ko', label: '한국어', short: 'KO', flag: 'KO' },
  { code: 'zh', label: '中文', short: 'ZH', flag: 'CN' },
];

/**
 * Find language by code, returns first (auto) if not found.
 */
export function getLanguageByCode(code: string | undefined): Language {
  return LANGUAGES.find((l) => l.code === (code || 'auto')) || LANGUAGES[0];
}

/**
 * Get next language in cycle.
 */
export function getNextLanguage(currentCode: string): Language {
  const idx = Math.max(0, LANGUAGES.findIndex((l) => l.code === currentCode));
  return LANGUAGES[(idx + 1) % LANGUAGES.length];
}
