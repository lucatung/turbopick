import * as assert from "assert";
import { fuzzyMatch } from "../algo";

suite("fuzzyMatch", () => {
  test("empty pattern returns score 0", () => {
    const result = fuzzyMatch("hello", "");
    assert.ok(result);
    assert.strictEqual(result.score, 0);
    assert.deepStrictEqual(result.positions, []);
  });

  test("exact match returns positive score with correct positions", () => {
    const result = fuzzyMatch("hello", "hello");
    assert.ok(result);
    assert.ok(result.score > 0);
    assert.deepStrictEqual(result.positions, [0, 1, 2, 3, 4]);
  });

  test("no match returns null", () => {
    assert.strictEqual(fuzzyMatch("hello", "xyz"), null);
  });

  test("pattern longer than text returns null", () => {
    assert.strictEqual(fuzzyMatch("hi", "hello"), null);
  });

  test("empty text returns null", () => {
    assert.strictEqual(fuzzyMatch("", "a"), null);
  });

  test("subsequence match returns positions in order", () => {
    const result = fuzzyMatch("abcdef", "ace");
    assert.ok(result);
    assert.ok(result.score > 0);
    assert.strictEqual(result.positions.length, 3);
    for (let i = 1; i < result.positions.length; i++) {
      assert.ok(result.positions[i] > result.positions[i - 1]);
    }
  });

  test("case insensitive matching", () => {
    const result = fuzzyMatch("HelloWorld", "hw");
    assert.ok(result);
    assert.ok(result.score > 0);
  });

  test("smart case: lowercase pattern is case-insensitive", () => {
    const result = fuzzyMatch("FooBar", "fb");
    assert.ok(result, "lowercase 'fb' should match 'FooBar'");
  });

  test("smart case: uppercase in pattern is case-sensitive", () => {
    const match = fuzzyMatch("FooBar", "FB");
    assert.ok(match, "'FB' should match 'FooBar'");

    const noMatch = fuzzyMatch("foobar", "FB");
    assert.strictEqual(noMatch, null, "'FB' should NOT match 'foobar'");
  });

  test("smart case: mixed case pattern is case-sensitive", () => {
    const match = fuzzyMatch("FooBar", "Fo");
    assert.ok(match, "'Fo' should match 'FooBar'");

    const noMatch = fuzzyMatch("foobar", "Fo");
    assert.strictEqual(noMatch, null, "'Fo' should NOT match 'foobar'");
  });

  test("smart case: real-world file paths", () => {
    // Lowercase pattern - should match regardless of case
    assert.ok(fuzzyMatch("SearchBar.tsx", "sb"), "lowercase 'sb' matches 'SearchBar.tsx'");
    assert.ok(fuzzyMatch("searchbar.tsx", "sb"), "lowercase 'sb' matches 'searchbar.tsx'");

    // Uppercase pattern - should only match exact case
    assert.ok(fuzzyMatch("SearchBar.tsx", "SB"), "'SB' matches 'SearchBar.tsx'");
    assert.strictEqual(fuzzyMatch("searchbar.tsx", "SB"), null, "'SB' should NOT match 'searchbar.tsx'");

    // Mixed case pattern
    assert.ok(fuzzyMatch("SearchBar.tsx", "Se"), "'Se' matches 'SearchBar.tsx'");
    assert.strictEqual(fuzzyMatch("searchbar.tsx", "Se"), null, "'Se' should NOT match 'searchbar.tsx'");
  });

  test("camelCase boundary scores higher than flat", () => {
    const camel = fuzzyMatch("fooBar", "fb");
    const flat = fuzzyMatch("foobar", "fb");
    assert.ok(camel);
    assert.ok(flat);
    assert.ok(camel.score > flat.score);
  });

  test("repeated calls return consistent results", () => {
    for (let i = 0; i < 100; i++) {
      const result = fuzzyMatch("src/components/SearchBar.tsx", "sb");
      assert.ok(result);
      assert.ok(result.score > 0);
      assert.strictEqual(result.positions.length, 2);
    }
  });

  test("single char pattern", () => {
    const result = fuzzyMatch("abc", "b");
    assert.ok(result);
    assert.deepStrictEqual(result.positions, [1]);
  });

  test("path-like strings with delimiters", () => {
    const result = fuzzyMatch("src/utils/helpers.ts", "suh");
    assert.ok(result);
    assert.strictEqual(result.positions.length, 3);
  });
});
