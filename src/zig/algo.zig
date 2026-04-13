const std = @import("std");
const builtin = @import("builtin");

const S = struct {
    const match: i32 = 16;
    const gap_start: i32 = -3;
    const gap_extension: i32 = -1;

    const bonus_boundary: i32 = match / 2;
    const bonus_boundary_white: i32 = bonus_boundary + 2;
    const bonus_boundary_delimiter: i32 = bonus_boundary + 1;
    const bonus_camel_123: i32 = bonus_boundary + gap_extension;
    const bonus_consecutive: i32 = -(gap_start + gap_extension);
    const bonus_first_char_multiplier: i32 = 2;

    const neg_inf: i32 = -999_999;
    const no_match: i32 = std.math.minInt(i32);
    const error_code: i32 = std.math.minInt(i32) + 1;
};

const CharClass = enum {
    lower,
    upper,
    digit,
    white,
    punctuation,
    other,
};

fn getAllocator() std.mem.Allocator {
    if (builtin.target.cpu.arch.isWasm()) {
        return std.heap.wasm_allocator;
    }
    return std.heap.page_allocator;
}

fn getCharClass(c: u8) CharClass {
    if (std.ascii.isLower(c)) return .lower;
    if (std.ascii.isUpper(c)) return .upper;
    if (std.ascii.isDigit(c)) return .digit;
    if (std.ascii.isWhitespace(c)) return .white;
    if (c == '_' or c == ',' or c == '.' or c == '-' or c == '/' or c == '\\') return .punctuation;
    return .other;
}

fn getBonus(prev_class: CharClass, curr_class: CharClass) i32 {
    if (prev_class == .white and curr_class != .white) return S.bonus_boundary_white;
    if (prev_class == .punctuation and curr_class != .punctuation) return S.bonus_boundary_delimiter;
    if (prev_class == .lower and curr_class == .upper) return S.bonus_camel_123;
    if (prev_class != .digit and curr_class == .digit) return S.bonus_camel_123;
    if (prev_class == .digit and curr_class != .digit) return S.bonus_boundary;
    return 0;
}

fn hasUpper(s: []const u8) bool {
    for (s) |c| {
        if (std.ascii.isUpper(c)) return true;
    }
    return false;
}

fn isSubsequence(text: []const u8, pattern: []const u8) bool {
    const case_sensitive = hasUpper(pattern);
    var p: usize = 0;
    for (text) |c| {
        if (p < pattern.len) {
            const matches = if (case_sensitive)
                c == pattern[p]
            else
                std.ascii.toLower(c) == pattern[p];
            if (matches) p += 1;
        }
    }
    return p == pattern.len;
}

fn fuzzyMatchInternal(text: []const u8, pattern: []const u8, out_positions: []i32) !?i32 {
    if (pattern.len == 0) return 0;
    if (text.len == 0 or pattern.len > text.len) return null;
    if (out_positions.len < pattern.len) return error.OutputTooSmall;
    if (!isSubsequence(text, pattern)) return null;

    const m = pattern.len;
    const n = text.len;
    const total_cells = try std.math.mul(usize, m, n);

    const alloc_impl = getAllocator();

    const i32_buf = try alloc_impl.alloc(i32, total_cells * 2 + n);
    defer alloc_impl.free(i32_buf);

    const h = i32_buf[0..total_cells];
    const p_mat = i32_buf[total_cells .. total_cells * 2];
    const bonuses = i32_buf[total_cells * 2 ..][0..n];

    const u8_buf = try alloc_impl.alloc(u8, n + m);
    defer alloc_impl.free(u8_buf);

    const case_sensitive = hasUpper(pattern);

    const norm_text = u8_buf[0..n];
    const norm_pattern = u8_buf[n..][0..m];

    if (case_sensitive) {
        @memcpy(norm_text, text);
        @memcpy(norm_pattern, pattern);
    } else {
        for (norm_text, text) |*dst, src| dst.* = std.ascii.toLower(src);
        for (norm_pattern, pattern) |*dst, src| dst.* = std.ascii.toLower(src);
    }

    @memset(h, S.neg_inf);

    for (bonuses, text, 0..) |*b, c, idx| {
        const prev_class: CharClass = if (idx == 0) .white else getCharClass(text[idx - 1]);
        b.* = getBonus(prev_class, getCharClass(c));
    }

    for (norm_text, 0..) |c, j| {
        if (c == norm_pattern[0]) {
            h[j] = S.match + bonuses[j] * S.bonus_first_char_multiplier;
            p_mat[j] = -1;
        }
    }

    var row: usize = 1;
    while (row < m) : (row += 1) {
        const pat_char = norm_pattern[row];
        const prev_row = (row - 1) * n;
        const curr_row = row * n;
        var best_gap_score: i32 = S.neg_inf;
        var best_gap_index: i32 = -1;

        var j: usize = row;
        while (j < n) : (j += 1) {
            const diag = h[prev_row + (j - 1)];

            if (diag > S.neg_inf) {
                const gap_score = diag + S.gap_start;
                if (gap_score > best_gap_score) {
                    best_gap_score = gap_score;
                    best_gap_index = @intCast(j - 1);
                }
            }

            if (best_gap_score > S.neg_inf) {
                best_gap_score += S.gap_extension;
            }

            if (norm_text[j] == pat_char) {
                const match_score = S.match + bonuses[j];

                var score_consecutive: i32 = S.neg_inf;
                if (diag > S.neg_inf) {
                    score_consecutive = diag + match_score + S.bonus_consecutive;
                }

                var score_gap: i32 = S.neg_inf;
                if (best_gap_score > S.neg_inf) {
                    score_gap = best_gap_score + match_score;
                }

                if (score_consecutive >= score_gap and score_consecutive > S.neg_inf) {
                    h[curr_row + j] = score_consecutive;
                    p_mat[curr_row + j] = @intCast(j - 1);
                } else if (score_gap > S.neg_inf) {
                    h[curr_row + j] = score_gap;
                    p_mat[curr_row + j] = best_gap_index;
                }
            }
        }
    }

    var max_score: i32 = S.neg_inf;
    var max_j: i32 = -1;
    const last_row = (m - 1) * n;

    var j: usize = m - 1;
    while (j < n) : (j += 1) {
        if (h[last_row + j] > max_score) {
            max_score = h[last_row + j];
            max_j = @intCast(j);
        }
    }

    if (max_score == S.neg_inf or max_j < 0) return null;

    var pos: usize = @intCast(max_j);
    var k: usize = m;
    while (k > 0) {
        k -= 1;
        out_positions[k] = @intCast(pos);
        if (k == 0) break;
        const parent = p_mat[k * n + pos];
        if (parent < 0) return error.InvalidBacktrack;
        pos = @intCast(parent);
    }

    return max_score;
}

pub export fn alloc(len: usize) usize {
    if (len == 0) return 0;
    const buf = getAllocator().alloc(u8, len) catch return 0;
    return @intFromPtr(buf.ptr);
}

pub export fn dealloc(ptr: usize, len: usize) void {
    if (ptr == 0 or len == 0) return;
    getAllocator().free(@as([*]u8, @ptrFromInt(ptr))[0..len]);
}

pub export fn fuzzy_match(
    text_ptr: usize,
    text_len: usize,
    pattern_ptr: usize,
    pattern_len: usize,
    out_positions_ptr: usize,
    out_positions_len: usize,
) i32 {
    if ((text_len > 0 and text_ptr == 0) or (pattern_len > 0 and pattern_ptr == 0))
        return S.error_code;
    if (pattern_len > out_positions_len)
        return S.error_code;

    const text = @as([*]const u8, @ptrFromInt(text_ptr))[0..text_len];
    const pattern = @as([*]const u8, @ptrFromInt(pattern_ptr))[0..pattern_len];
    const out_positions = @as([*]i32, @ptrFromInt(out_positions_ptr))[0..out_positions_len];

    const result = fuzzyMatchInternal(text, pattern, out_positions) catch return S.error_code;
    if (result) |score| return score;
    return S.no_match;
}

test "exact match" {
    var positions: [5]i32 = undefined;
    const score = (try fuzzyMatchInternal("hello", "hello", positions[0..])) orelse return error.TestUnexpectedResult;

    try std.testing.expect(score > 0);
    try std.testing.expectEqual(@as(i32, 0), positions[0]);
    try std.testing.expectEqual(@as(i32, 4), positions[4]);
}

test "no match" {
    var positions: [2]i32 = undefined;
    const score = try fuzzyMatchInternal("hello", "hx", positions[0..]);
    try std.testing.expect(score == null);
}

test "camel case scores higher" {
    var out_camel: [2]i32 = undefined;
    var out_normal: [2]i32 = undefined;

    const camel = (try fuzzyMatchInternal("fooBar", "fb", out_camel[0..])) orelse return error.TestUnexpectedResult;
    const normal = (try fuzzyMatchInternal("foobar", "fb", out_normal[0..])) orelse return error.TestUnexpectedResult;

    try std.testing.expect(camel > normal);
}
