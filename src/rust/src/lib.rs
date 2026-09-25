use std::slice;

const MATCH: i32 = 16;
const GAP_START: i32 = -3;
const GAP_EXTENSION: i32 = -1;

const BONUS_BOUNDARY: i32 = MATCH / 2;
const BONUS_BOUNDARY_WHITE: i32 = BONUS_BOUNDARY + 2;
const BONUS_BOUNDARY_DELIMITER: i32 = BONUS_BOUNDARY + 1;
const BONUS_CAMEL_123: i32 = BONUS_BOUNDARY + GAP_EXTENSION;
const BONUS_CONSECUTIVE: i32 = -(GAP_START + GAP_EXTENSION);
const BONUS_FIRST_CHAR_MULTIPLIER: i32 = 2;

const NEG_INF: i32 = -999_999;
pub const NO_MATCH: i32 = i32::MIN;
pub const ERROR_CODE: i32 = i32::MIN + 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CharClass {
    Lower,
    Upper,
    Digit,
    White,
    Punctuation,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AlgoError {
    OutputTooSmall,
    Overflow,
    InvalidPointer,
    InvalidBacktrack,
}

fn char_class(c: u8) -> CharClass {
    if c.is_ascii_lowercase() {
        CharClass::Lower
    } else if c.is_ascii_uppercase() {
        CharClass::Upper
    } else if c.is_ascii_digit() {
        CharClass::Digit
    } else if c.is_ascii_whitespace() {
        CharClass::White
    } else if matches!(c, b'_' | b',' | b'.' | b'-' | b'/' | b'\\') {
        CharClass::Punctuation
    } else {
        CharClass::Other
    }
}

fn char_bonus(prev: CharClass, curr: CharClass) -> i32 {
    if prev == CharClass::White && curr != CharClass::White {
        return BONUS_BOUNDARY_WHITE;
    }
    if prev == CharClass::Punctuation && curr != CharClass::Punctuation {
        return BONUS_BOUNDARY_DELIMITER;
    }
    if prev == CharClass::Lower && curr == CharClass::Upper {
        return BONUS_CAMEL_123;
    }
    if prev != CharClass::Digit && curr == CharClass::Digit {
        return BONUS_CAMEL_123;
    }
    if prev == CharClass::Digit && curr != CharClass::Digit {
        return BONUS_BOUNDARY;
    }
    0
}

fn has_upper(s: &[u8]) -> bool {
    s.iter().any(|c| c.is_ascii_uppercase())
}

fn is_subsequence(text: &[u8], pattern: &[u8]) -> bool {
    let case_sensitive = has_upper(pattern);
    let mut p = 0;
    for &c in text {
        if p < pattern.len() {
            let matched = if case_sensitive {
                c == pattern[p]
            } else {
                c.to_ascii_lowercase() == pattern[p]
            };
            if matched {
                p += 1;
            }
        }
    }
    p == pattern.len()
}

fn fuzzy_match_internal(
    text: &[u8],
    pattern: &[u8],
    out_positions: &mut [i32],
) -> Result<Option<i32>, AlgoError> {
    if pattern.is_empty() {
        return Ok(Some(0));
    }
    if text.is_empty() || pattern.len() > text.len() {
        return Ok(None);
    }
    if out_positions.len() < pattern.len() {
        return Err(AlgoError::OutputTooSmall);
    }
    if !is_subsequence(text, pattern) {
        return Ok(None);
    }

    let m = pattern.len();
    let n = text.len();
    let total_cells = m.checked_mul(n).ok_or(AlgoError::Overflow)?;

    let mut h = vec![NEG_INF; total_cells];
    let mut p_mat = vec![-1i32; total_cells];
    let mut bonuses = vec![0i32; n];

    let case_sensitive = has_upper(pattern);

    let norm_text = if case_sensitive {
        text.to_vec()
    } else {
        text.to_ascii_lowercase()
    };
    let norm_pattern = if case_sensitive {
        pattern.to_vec()
    } else {
        pattern.to_ascii_lowercase()
    };

    for (idx, (&c, bonus)) in text.iter().zip(bonuses.iter_mut()).enumerate() {
        let prev_class = if idx == 0 {
            CharClass::White
        } else {
            char_class(text[idx - 1])
        };
        *bonus = char_bonus(prev_class, char_class(c));
    }

    for (j, (&c, &b)) in norm_text.iter().zip(bonuses.iter()).enumerate() {
        if c == norm_pattern[0] {
            h[j] = MATCH + b * BONUS_FIRST_CHAR_MULTIPLIER;
            p_mat[j] = -1;
        }
    }

    for row in 1..m {
        let pat_char = norm_pattern[row];
        let prev_row = (row - 1) * n;
        let curr_row = row * n;
        let mut best_gap_score: i32 = NEG_INF;
        let mut best_gap_index: i32 = -1;

        for j in row..n {
            let diag = h[prev_row + (j - 1)];

            if diag > NEG_INF {
                let gap_score = diag + GAP_START;
                if gap_score > best_gap_score {
                    best_gap_score = gap_score;
                    best_gap_index = (j - 1) as i32;
                }
            }

            if best_gap_score > NEG_INF {
                best_gap_score += GAP_EXTENSION;
            }

            if norm_text[j] == pat_char {
                let match_score = MATCH + bonuses[j];

                let mut score_consecutive = NEG_INF;
                if diag > NEG_INF {
                    score_consecutive = diag + match_score + BONUS_CONSECUTIVE;
                }

                let mut score_gap = NEG_INF;
                if best_gap_score > NEG_INF {
                    score_gap = best_gap_score + match_score;
                }

                if score_consecutive >= score_gap && score_consecutive > NEG_INF {
                    h[curr_row + j] = score_consecutive;
                    p_mat[curr_row + j] = (j - 1) as i32;
                } else if score_gap > NEG_INF {
                    h[curr_row + j] = score_gap;
                    p_mat[curr_row + j] = best_gap_index;
                }
            }
        }
    }

    let last_row = (m - 1) * n;
    let mut max_score: i32 = NEG_INF;
    let mut max_j: i32 = -1;

    for j in (m - 1)..n {
        if h[last_row + j] > max_score {
            max_score = h[last_row + j];
            max_j = j as i32;
        }
    }

    if max_score == NEG_INF || max_j < 0 {
        return Ok(None);
    }

    let mut pos = max_j as usize;
    let mut k = m;
    while k > 0 {
        k -= 1;
        out_positions[k] = pos as i32;
        if k == 0 {
            break;
        }
        let parent = p_mat[k * n + pos];
        if parent < 0 {
            return Err(AlgoError::InvalidBacktrack);
        }
        pos = parent as usize;
    }

    Ok(Some(max_score))
}

unsafe fn slice_from_raw<'a, T>(ptr: usize, len: usize) -> Result<&'a [T], AlgoError> {
    if len == 0 {
        return Ok(&[]);
    }
    if ptr == 0 {
        return Err(AlgoError::InvalidPointer);
    }
    Ok(unsafe { slice::from_raw_parts(ptr as *const T, len) })
}

unsafe fn slice_from_raw_mut<'a, T>(ptr: usize, len: usize) -> Result<&'a mut [T], AlgoError> {
    if len == 0 {
        return Ok(&mut []);
    }
    if ptr == 0 {
        return Err(AlgoError::InvalidPointer);
    }
    Ok(unsafe { slice::from_raw_parts_mut(ptr as *mut T, len) })
}

unsafe fn fuzzy_match_slices<'a>(
    text_ptr: usize,
    text_len: usize,
    pattern_ptr: usize,
    pattern_len: usize,
    out_positions_ptr: usize,
    out_positions_len: usize,
) -> Result<(&'a [u8], &'a [u8], &'a mut [i32]), AlgoError> {
    let text = unsafe { slice_from_raw(text_ptr, text_len)? };
    let pattern = unsafe { slice_from_raw(pattern_ptr, pattern_len)? };
    let out_positions = unsafe { slice_from_raw_mut(out_positions_ptr, out_positions_len)? };
    Ok((text, pattern, out_positions))
}

#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: usize) -> usize {
    if len == 0 {
        return 0;
    }
    let mut buf: Vec<u8> = Vec::with_capacity(len);
    let ptr = buf.as_mut_ptr() as usize;
    std::mem::forget(buf);
    ptr
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn dealloc(ptr: usize, len: usize) {
    if ptr == 0 || len == 0 {
        return;
    }
    unsafe {
        drop(Vec::from_raw_parts(ptr as *mut u8, 0, len));
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn fuzzy_match(
    text_ptr: usize,
    text_len: usize,
    pattern_ptr: usize,
    pattern_len: usize,
    out_positions_ptr: usize,
    out_positions_len: usize,
) -> i32 {
    if pattern_len > out_positions_len {
        return ERROR_CODE;
    }

    let Ok((text, pattern, out_positions)) = (unsafe {
        fuzzy_match_slices(
            text_ptr,
            text_len,
            pattern_ptr,
            pattern_len,
            out_positions_ptr,
            out_positions_len,
        )
    }) else {
        return ERROR_CODE;
    };

    match fuzzy_match_internal(text, pattern, out_positions) {
        Ok(Some(score)) => score,
        Ok(None) => NO_MATCH,
        Err(_) => ERROR_CODE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn match_positions(text: &str, pattern: &str) -> Option<(i32, Vec<i32>)> {
        let mut out = vec![0i32; pattern.len()];
        let result = fuzzy_match_internal(text.as_bytes(), pattern.as_bytes(), &mut out).unwrap();
        result.map(|score| (score, out))
    }

    #[test]
    fn empty_pattern_returns_zero() {
        let result = fuzzy_match_internal(b"hello", b"", &mut []).unwrap();
        assert_eq!(result, Some(0));
    }

    #[test]
    fn exact_match_returns_positive_score_with_positions() {
        let (score, positions) = match_positions("hello", "hello").unwrap();
        assert!(score > 0);
        assert_eq!(positions, vec![0, 1, 2, 3, 4]);
    }

    #[test]
    fn no_match_returns_none() {
        assert!(match_positions("hello", "hx").is_none());
        assert!(match_positions("hello", "xyz").is_none());
    }

    #[test]
    fn pattern_longer_than_text_returns_none() {
        assert!(match_positions("hi", "hello").is_none());
    }

    #[test]
    fn empty_text_returns_none() {
        assert!(match_positions("", "a").is_none());
    }

    #[test]
    fn subsequence_match_returns_positions_in_order() {
        let (score, positions) = match_positions("abcdef", "ace").unwrap();
        assert!(score > 0);
        assert_eq!(positions.len(), 3);
        for i in 1..positions.len() {
            assert!(positions[i] > positions[i - 1]);
        }
    }

    #[test]
    fn case_insensitive_matching() {
        let (score, _) = match_positions("HelloWorld", "hw").unwrap();
        assert!(score > 0);
    }

    #[test]
    fn smart_case_lowercase_pattern_is_case_insensitive() {
        assert!(match_positions("FooBar", "fb").is_some());
    }

    #[test]
    fn smart_case_uppercase_pattern_is_case_sensitive() {
        assert!(match_positions("FooBar", "FB").is_some());
        assert!(match_positions("foobar", "FB").is_none());
    }

    #[test]
    fn smart_case_mixed_pattern_is_case_sensitive() {
        assert!(match_positions("FooBar", "Fo").is_some());
        assert!(match_positions("foobar", "Fo").is_none());
    }

    #[test]
    fn smart_case_file_paths() {
        assert!(match_positions("SearchBar.tsx", "sb").is_some());
        assert!(match_positions("searchbar.tsx", "sb").is_some());
        assert!(match_positions("SearchBar.tsx", "SB").is_some());
        assert!(match_positions("searchbar.tsx", "SB").is_none());
    }

    #[test]
    fn camel_case_boundary_scores_higher_than_flat() {
        let camel = match_positions("fooBar", "fb").unwrap();
        let flat = match_positions("foobar", "fb").unwrap();
        assert!(camel.0 > flat.0);
    }

    #[test]
    fn repeated_calls_return_consistent_results() {
        for _ in 0..100 {
            let (score, positions) = match_positions("src/components/SearchBar.tsx", "sb").unwrap();
            assert!(score > 0);
            assert_eq!(positions.len(), 2);
        }
    }

    #[test]
    fn single_char_pattern() {
        let (_, positions) = match_positions("abc", "b").unwrap();
        assert_eq!(positions, vec![1]);
    }

    #[test]
    fn path_like_strings_with_delimiters() {
        let (_, positions) = match_positions("src/utils/helpers.ts", "suh").unwrap();
        assert_eq!(positions.len(), 3);
    }
}
