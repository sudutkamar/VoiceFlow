/**
 * Shared Levenshtein distance implementations.
 * Single source of truth — used by fuzzyMatcher, adaptiveLearning, etc.
 */

/**
 * Standard Levenshtein distance (full matrix, no early termination).
 * Use when you need exact distance, not just threshold check.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Single array iteration for space efficiency
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Optimized Levenshtein with early termination.
 * Returns early if distance exceeds threshold.
 * Use for fuzzy matching where you only care if distance ≤ threshold.
 */
export function levenshteinDistanceOptimized(a: string, b: string, threshold: number): number {
  const m = a.length;
  const n = b.length;
  // Quick reject: length difference exceeds threshold
  if (Math.abs(m - n) > threshold) return threshold + 1;
  if (m === 0) return n;
  if (n === 0) return m;
  if (m === 1 && n === 1) return a[0] === b[0] ? 0 : 1;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    // Early termination: entire row exceeds threshold
    if (rowMin > threshold) return threshold + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
