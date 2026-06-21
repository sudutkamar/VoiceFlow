import { Logger } from './logger';

export interface WordConfidence {
  word: string;
  confidence: number;
  startMs?: number;
  endMs?: number;
}

export interface ConfidenceResult {
  text: string;
  overallConfidence: number;
  words: WordConfidence[];
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  suggestions: string[];
}

export class ConfidenceScorer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Analyze transcription confidence
   */
  analyze(text: string, audioDurationMs?: number): ConfidenceResult {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordConfidences = this.calculateWordConfidences(words, audioDurationMs);
    const overallConfidence = this.calculateOverallConfidence(wordConfidences);
    const quality = this.getQualityLabel(overallConfidence);
    const suggestions = this.generateSuggestions(words, overallConfidence, audioDurationMs);

    return {
      text,
      overallConfidence,
      words: wordConfidences,
      quality,
      suggestions,
    };
  }

  /**
   * Calculate confidence for each word
   */
  private calculateWordConfidences(words: string[], audioDurationMs?: number): WordConfidence[] {
    return words.map((word, index) => {
      let confidence = 0.85; // Base confidence

      // Factor 1: Word length (very short or very long words are less reliable)
      const lengthFactor = this.getLengthFactor(word);
      confidence *= lengthFactor;

      // Factor 2: Character patterns (repeated chars, unusual patterns)
      const patternFactor = this.getPatternFactor(word);
      confidence *= patternFactor;

      // Factor 3: Position in sentence (beginning and end are usually more reliable)
      const positionFactor = this.getPositionFactor(index, words.length);
      confidence *= positionFactor;

      // Factor 4: Audio duration per word (too fast = less reliable)
      if (audioDurationMs) {
        const msPerWord = audioDurationMs / words.length;
        const durationFactor = this.getDurationFactor(msPerWord);
        confidence *= durationFactor;
      }

      // Clamp to valid range
      confidence = Math.max(0, Math.min(1, confidence));

      return {
        word,
        confidence: Math.round(confidence * 100) / 100,
      };
    });
  }

  /**
   * Factor based on word length
   */
  private getLengthFactor(word: string): number {
    const len = word.length;
    if (len <= 1) return 0.6;  // Single chars are unreliable
    if (len === 2) return 0.8;
    if (len >= 15) return 0.9; // Very long words might be wrong
    if (len >= 20) return 0.8;
    return 1.0;
  }

  /**
   * Factor based on character patterns
   */
  private getPatternFactor(word: string): number {
    let factor = 1.0;

    // Check for repeated characters (e.g., "aaa", "bbb")
    if (/(.)\1{2,}/.test(word)) {
      factor *= 0.7;
    }

    // Check for unusual character combinations
    if (/[xz]{2,}/.test(word.toLowerCase())) {
      factor *= 0.9;
    }

    // Check for numbers mixed with letters
    if (/\d/.test(word) && /[a-zA-Z]/.test(word)) {
      factor *= 0.95;
    }

    // Check for all caps (might be acronym, but also might be wrong)
    if (word === word.toUpperCase() && word.length > 3) {
      factor *= 0.95;
    }

    return factor;
  }

  /**
   * Factor based on position in sentence
   */
  private getPositionFactor(index: number, totalWords: number): number {
    if (totalWords <= 1) return 1.0;

    // First and last words are usually more reliable
    if (index === 0 || index === totalWords - 1) {
      return 1.0;
    }

    // Middle words are slightly less reliable
    const middlePenalty = 0.02;
    const distanceFromMiddle = Math.abs(index - (totalWords - 1) / 2);
    const normalizedDistance = distanceFromMiddle / ((totalWords - 1) / 2);
    
    return 1.0 - middlePenalty * (1 - normalizedDistance);
  }

  /**
   * Factor based on audio duration per word
   */
  private getDurationFactor(msPerWord: number): number {
    // Ideal speaking rate: 200-400ms per word
    if (msPerWord < 100) return 0.7;  // Too fast
    if (msPerWord < 150) return 0.85;
    if (msPerWord > 1000) return 0.9; // Too slow (might be pause)
    return 1.0;
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(words: WordConfidence[]): number {
    if (words.length === 0) return 0;

    const sum = words.reduce((acc, w) => acc + w.confidence, 0);
    return Math.round((sum / words.length) * 100) / 100;
  }

  /**
   * Get quality label based on confidence
   */
  private getQualityLabel(confidence: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (confidence >= 0.9) return 'excellent';
    if (confidence >= 0.75) return 'good';
    if (confidence >= 0.6) return 'fair';
    return 'poor';
  }

  /**
   * Generate suggestions for improving transcription
   */
  private generateSuggestions(words: string[], confidence: number, audioDurationMs?: number): string[] {
    const suggestions: string[] = [];

    // Low confidence suggestions
    if (confidence < 0.7) {
      suggestions.push('Consider speaking more clearly');
      suggestions.push('Try reducing background noise');
    }

    if (confidence < 0.5) {
      suggestions.push('Audio quality is very low. Try a better microphone.');
    }

    // Duration-based suggestions
    if (audioDurationMs) {
      const msPerWord = audioDurationMs / words.length;
      
      if (msPerWord < 150) {
        suggestions.push('Speaking too fast. Try slowing down.');
      }
      
      if (msPerWord > 800) {
        suggestions.push('Long pauses detected. Try to speak more continuously.');
      }
    }

    // Word count suggestions
    if (words.length < 3) {
      suggestions.push('Very short transcription. Speak longer for better results.');
    }

    // Check for low-confidence words
    const lowConfidenceWords = words.filter((_, i) => {
      const wordConf = this.calculateWordConfidences(words, audioDurationMs)[i];
      return wordConf.confidence < 0.6;
    });

    if (lowConfidenceWords.length > words.length * 0.3) {
      suggestions.push('Many words have low confidence. Check for mispronunciations.');
    }

    return suggestions;
  }

  /**
   * Format confidence for display
   */
  formatConfidence(confidence: number): string {
    return `${Math.round(confidence * 100)}%`;
  }

  /**
   * Get confidence color for UI
   */
  getConfidenceColor(confidence: number): string {
    if (confidence >= 0.9) return '#4ade80'; // green
    if (confidence >= 0.75) return '#4a9eff'; // blue
    if (confidence >= 0.6) return '#fbbf24'; // yellow
    return '#f87171'; // red
  }
}
