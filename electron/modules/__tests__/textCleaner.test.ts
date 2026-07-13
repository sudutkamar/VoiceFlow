import { describe, it, expect } from 'vitest';
import { TextCleaner } from '../textCleaner';

describe('TextCleaner', () => {
  const cleaner = new TextCleaner();

  describe('clean', () => {
    it('should remove filler words', () => {
      const result = cleaner.clean('saya eh mau koma ngomong sesuatu', {
        removeFillers: true,
        capitalizeFirst: false,
        capitalizeSentences: false,
      });
      expect(result).not.toContain('eh');
    });

    it('should capitalize first letter', () => {
      const result = cleaner.clean('hello world', {
        removeFillers: false,
        capitalizeFirst: true,
        capitalizeSentences: false,
      });
      expect(result).toMatch(/^H/);
    });

    it('should handle empty string', () => {
      const result = cleaner.clean('', {
        removeFillers: false,
        capitalizeFirst: false,
        capitalizeSentences: false,
      });
      expect(result).toBe('');
    });
  });

  describe('voiceCommands', () => {
    it('should process new paragraph command', () => {
      const result = cleaner.clean('paragraf baru ini adalah paragraf', {
        removeFillers: false,
        capitalizeFirst: false,
        capitalizeSentences: false,
        voiceCommands: true,
      });
      // The command 'paragraf baru' should be replaced with newlines
      expect(result).not.toBe('paragraf baru ini adalah paragraf');
    });

    it('should process punctuation commands', () => {
      const result = cleaner.clean('halo koma saya mau bicara titik', {
        removeFillers: false,
        capitalizeFirst: false,
        capitalizeSentences: false,
        voiceCommands: true,
      });
      expect(result).toContain(',');
      expect(result).toContain('.');
    });
  });
});
