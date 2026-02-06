import * as assert from "assert";
import { fuzzyMatch } from "../algo";

suite("Algorithm Test Suite", () => {
  test("Exact match", () => {
    const result = fuzzyMatch("hello", "hello");
    assert.ok(result);
    assert.strictEqual(result!.positions.length, 5);
  });

  test("Partial match", () => {
    const result = fuzzyMatch("hello world", "helo");
    assert.ok(result);
    // h, e, l, o
    assert.deepStrictEqual(
      result!.positions.map((p) => "hello world"[p]).join(""),
      "helo",
    );
  });

  test("No match due to missing char", () => {
    const result = fuzzyMatch("hello", "hx");
    assert.strictEqual(result, null);
  });

  test("Case insensitive", () => {
    const result = fuzzyMatch("Hello", "he");
    assert.ok(result);
  });

  test("Ranking: Boundary bonus", () => {
    const res1 = fuzzyMatch("foo bar", "b");
    const res2 = fuzzyMatch("bar foo", "b");
    // 'b' in 'foo bar' is at index 4 (boundary)
    // 'b' in 'bar foo' is at index 0 (start) - also boundary/first char

    assert.ok(res1);
    assert.ok(res2);
  });

  test("Ranking: Consecutive vs Scattered", () => {
    const resConsecutive = fuzzyMatch("file_name.ts", "file");
    const resScattered = fuzzyMatch("fzizlze", "file");

    assert.ok(resConsecutive);
    assert.ok(resScattered);
    assert.ok(
      resConsecutive!.score > resScattered!.score,
      "Consecutive match should score higher",
    );
  });

  test("Ranking: CamelCase bonus", () => {
    const resCamel = fuzzyMatch("fooBar", "fb");
    const resNormal = fuzzyMatch("foobar", "fb");

    assert.ok(resCamel);
    assert.ok(resNormal);
    // 'B' in fooBar is camel case boundary, should score higher than 'b' in foobar
    assert.ok(
      resCamel!.score > resNormal!.score,
      "CamelCase match should score higher",
    );
  });

  test("Ranking: Path matching", () => {
    // user types "mod"
    // candidate 1: "src/model.ts" (starts with mod)
    // candidate 2: "src/modules/utils.ts" (starts with mod)
    // candidate 3: "src/component/modal.ts" (start with mod)
    // candidate 4: "src/commond.ts" (contains mod)

    const pattern = "mod";
    const c1 = "src/model.ts";
    const c4 = "src/commond.ts";

    const r1 = fuzzyMatch(c1, pattern);
    const r4 = fuzzyMatch(c4, pattern);

    // r1 matches "mod" at a word boundary (after /)
    // r4 matches "mod" in the middle of word

    assert.ok(
      r1!.score > r4!.score,
      "Boundary match should score higher than middle match",
    );
  });

  test("Full coverage check", () => {
    assert.strictEqual(fuzzyMatch("", "abc"), null);
    const res = fuzzyMatch("abc", "");
    assert.ok(res);
    assert.strictEqual(res!.score, 0);
  });
});
