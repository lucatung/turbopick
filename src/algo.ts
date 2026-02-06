// Scoring constants
const SCORE_MATCH = 16;
const SCORE_GAP_START = -3;
const SCORE_GAP_EXTENSION = -1;

// Bonuses
const BONUS_BOUNDARY = SCORE_MATCH / 2;
const BONUS_BOUNDARY_WHITE = BONUS_BOUNDARY + 2;
const BONUS_BOUNDARY_DELIMITER = BONUS_BOUNDARY + 1;
const BONUS_CAMEL_123 = BONUS_BOUNDARY + SCORE_GAP_EXTENSION;
const BONUS_CONSECUTIVE = -(SCORE_GAP_START + SCORE_GAP_EXTENSION);
const BONUS_FIRST_CHAR_MULTIPLIER = 2;

export interface MatchResult {
  score: number;
  positions: number[]; // Indices in text that matched pattern
}

enum CharClass {
  LOWER,
  UPPER,
  DIGIT,
  WHITE,
  PUNCTUATION,
  OTHER,
}

function getCharClass(char: string): CharClass {
  if (/[a-z]/.test(char)) {
    return CharClass.LOWER;
  }
  if (/[A-Z]/.test(char)) {
    return CharClass.UPPER;
  }
  if (/[0-9]/.test(char)) {
    return CharClass.DIGIT;
  }
  if (/\s/.test(char)) {
    return CharClass.WHITE;
  }
  if (/[_,\.\-\/\\]/.test(char)) {
    return CharClass.PUNCTUATION;
  }
  return CharClass.OTHER;
}

function getBonus(prevChar: string, currChar: string): number {
  const prevClass = prevChar ? getCharClass(prevChar) : CharClass.WHITE;
  const currClass = getCharClass(currChar);

  // Start of word after whitespace
  if (prevClass === CharClass.WHITE && currClass !== CharClass.WHITE) {
    return BONUS_BOUNDARY_WHITE;
  }

  // Start of word after delimiter
  if (
    prevClass === CharClass.PUNCTUATION &&
    currClass !== CharClass.PUNCTUATION
  ) {
    return BONUS_BOUNDARY_DELIMITER;
  }

  // CamelCase: Lower -> Upper
  if (prevClass === CharClass.LOWER && currClass === CharClass.UPPER) {
    return BONUS_CAMEL_123;
  }

  // Transition to digit
  if (prevClass !== CharClass.DIGIT && currClass === CharClass.DIGIT) {
    return BONUS_CAMEL_123;
  }

  // Transition from digit
  if (prevClass === CharClass.DIGIT && currClass !== CharClass.DIGIT) {
    return BONUS_BOUNDARY;
  }

  return 0;
}

export function fuzzyMatch(text: string, pattern: string): MatchResult | null {
  if (!pattern) {
    return { score: 0, positions: [] };
  }
  if (!text) {
    return null;
  }

  const M = pattern.length;
  const N = text.length;

  if (M > N) {
    return null;
  }

  // Pre-check: All pattern chars must exist in text in order
  let pIdx = 0;
  for (let i = 0; i < N && pIdx < M; i++) {
    if (text[i].toLowerCase() === pattern[pIdx].toLowerCase()) {
      pIdx++;
    }
  }
  if (pIdx < M) {
    return null;
  }

  const H = new Int32Array(M * N); // Score matrix
  const P = new Int32Array(M * N); // Parent matrix

  // Initialize with -Infinity
  const NEG_INF = -999999;
  for (let k = 0; k < H.length; k++) {
    H[k] = NEG_INF;
  }

  // Precompute bonuses for the text
  const bonuses = new Int32Array(N);
  for (let j = 0; j < N; j++) {
    const prevChar = j > 0 ? text[j - 1] : "";
    bonuses[j] = getBonus(prevChar, text[j]);
  }

  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();

  // Scoring:
  //
  // When filling a cell `[i][j]`, the algorithm considers two main paths to get there and picks the winner:
  // 1. Consecutive Match (The "Good" Path):
  //    * You matched the previous pattern character at the immediate previous text position (`j-1`).
  //    * You get a `BONUS_CONSECUTIVE` reward.
  //    * This strongly encourages the algorithm to find compact matches.
  //    * e.g., matching "fuzz" in "fuzzy" is better than "f...u...z...z".
  // 2. Gap Match (The "Jump" Path):
  //    * You matched the previous pattern character somewhere earlier (`k`), but skipped some text characters to get to `j`.
  //    * You pay a `SCORE_GAP_START` penalty for opening the gap.
  //    * And a `SCORE_GAP_EXTENSION` penalty for every extra character you skipped.
  //
  // If pattern[i] equals text[j], the score for the current cell `[i][j]` is:
  // `Previous Score` + `SCORE_MATCH` + `Context Bonus` + `(Consecutive Bonus OR Gap Penalty)`

  // Match first char of pattern
  const patChar0 = patternLower[0];
  for (let j = 0; j < N; j++) {
    if (textLower[j] === patChar0) {
      let score = SCORE_MATCH + bonuses[j] * BONUS_FIRST_CHAR_MULTIPLIER;
      H[0 * N + j] = score;
      P[0 * N + j] = -1; // No parent
    }
  }

  // Iterate for remaining pattern chars
  for (let i = 1; i < M; i++) {
    const patChar = patternLower[i];
    let prevRowOffset = (i - 1) * N;
    let currRowOffset = i * N;
    let currentMaxScore = NEG_INF;
    let currentMaxIndex = -1;

    for (let j = i; j < N; j++) {
      const prevScoreAtJminus1 = H[prevRowOffset + (j - 1)];

      if (prevScoreAtJminus1 > NEG_INF) {
        const scoreStartingGap = prevScoreAtJminus1 + SCORE_GAP_START;

        if (scoreStartingGap > currentMaxScore) {
          currentMaxScore = scoreStartingGap;
          currentMaxIndex = j - 1;
        }
      }

      if (currentMaxScore > NEG_INF) {
        currentMaxScore += SCORE_GAP_EXTENSION;
      }

      if (textLower[j] === patChar) {
        let matchScore = SCORE_MATCH + bonuses[j];

        let scoreConsecutive = NEG_INF;
        if (H[prevRowOffset + (j - 1)] > NEG_INF) {
          scoreConsecutive =
            H[prevRowOffset + (j - 1)] + matchScore + BONUS_CONSECUTIVE;
        }

        let scoreGap = NEG_INF;
        if (currentMaxScore > NEG_INF) {
          scoreGap = currentMaxScore + matchScore;
        }

        if (scoreConsecutive >= scoreGap && scoreConsecutive > NEG_INF) {
          H[currRowOffset + j] = scoreConsecutive;
          P[currRowOffset + j] = j - 1;
        } else if (scoreGap > NEG_INF) {
          H[currRowOffset + j] = scoreGap;
          P[currRowOffset + j] = currentMaxIndex;
        }
      }
    }
  }

  // Find max score in the last row
  let maxScore = NEG_INF;
  let maxIndex = -1;
  const lastRowOffset = (M - 1) * N;

  for (let j = M - 1; j < N; j++) {
    if (H[lastRowOffset + j] > maxScore) {
      maxScore = H[lastRowOffset + j];
      maxIndex = j;
    }
  }

  if (maxScore === NEG_INF) {
    return null;
  }

  // Backtrack
  const positions = new Array(M);
  let currIdx = maxIndex;
  for (let i = M - 1; i >= 0; i--) {
    positions[i] = currIdx;
    currIdx = P[i * N + currIdx];
  }

  return {
    score: maxScore,
    positions,
  };
}
