import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampNumber,
  hashString,
  safeJsonParse,
  normalizeEndpoint,
  firstText,
  getFileExtension,
  normalizeTagLikeValue,
  parseAttributesText,
  normalizeConfidence,
  sanitizeFileName,
  escapeHtml
} from "../js/format.js";

describe("clampNumber", () => {
  it("returns the number when in range", () => {
    assert.equal(clampNumber(5, 0, 10, 99), 5);
  });

  it("clamps to min", () => {
    assert.equal(clampNumber(-1, 0, 10, 99), 0);
  });

  it("clamps to max", () => {
    assert.equal(clampNumber(99, 0, 10, 99), 10);
  });

  it("returns fallback for a non-numeric string", () => {
    assert.equal(clampNumber("abc", 0, 10, 7), 7);
  });

  it("returns fallback for undefined", () => {
    assert.equal(clampNumber(undefined, 0, 10, 7), 7);
  });

  it("returns fallback for NaN", () => {
    assert.equal(clampNumber(NaN, 0, 10, 7), 7);
  });

  it("coerces numeric strings", () => {
    assert.equal(clampNumber("5", 0, 10, 99), 5);
  });

  it("handles the boundaries exactly", () => {
    assert.equal(clampNumber(0, 0, 10, 99), 0);
    assert.equal(clampNumber(10, 0, 10, 99), 10);
  });
});

describe("hashString", () => {
  it("is deterministic for the same input", () => {
    assert.equal(hashString("foo"), hashString("foo"));
  });

  it("produces different hashes for different inputs", () => {
    assert.notEqual(hashString("foo"), hashString("bar"));
  });

  it("returns a lowercase hex string", () => {
    assert.match(hashString("anything"), /^[0-9a-f]+$/);
  });

  // FNV-1a 32-bit offset basis is 2166136261, which is 0x811c9dc5.
  // (The plan suggested "80818205" but that value is incorrect; this is the
  // actual unsigned offset basis, locked here as a regression test.)
  it("locks the known hash of the empty string", () => {
    assert.equal(hashString(""), "811c9dc5");
  });

  it("locks the known hash of 'foo' as a regression value", () => {
    assert.equal(hashString("foo"), "a9f37ed7");
  });

  it("handles non-ASCII input without throwing and yields hex", () => {
    const result = hashString("café");
    assert.match(result, /^[0-9a-f]+$/);
    assert.equal(result, hashString("café"));
  });
});

describe("safeJsonParse", () => {
  it("parses a valid JSON object", () => {
    assert.deepEqual(safeJsonParse('{"a":1}'), { a: 1 });
  });

  it("parses a valid JSON array", () => {
    assert.deepEqual(safeJsonParse("[1,2,3]"), [1, 2, 3]);
  });

  it("returns the fallback for malformed input", () => {
    assert.equal(safeJsonParse("not json", "fb"), "fb");
  });

  it("returns null (default fallback) for malformed input", () => {
    assert.equal(safeJsonParse("{"), null);
  });

  it("returns the fallback when the input is undefined", () => {
    // JSON.parse coerces undefined -> "undefined" which is not valid JSON.
    assert.equal(safeJsonParse(undefined, "x"), "x");
  });
});

describe("normalizeEndpoint", () => {
  it("returns the default for an empty string", () => {
    assert.equal(normalizeEndpoint(""), "/v1/chat/completions");
  });

  it("returns the default for undefined", () => {
    assert.equal(normalizeEndpoint(undefined), "/v1/chat/completions");
  });

  it("prepends a leading slash when missing", () => {
    assert.equal(normalizeEndpoint("foo"), "/foo");
  });

  it("leaves a value unchanged when it already starts with a slash", () => {
    assert.equal(normalizeEndpoint("/foo"), "/foo");
  });
});

describe("firstText", () => {
  it("returns the first non-empty value", () => {
    assert.equal(firstText(["", "  ", "hello", "world"]), "hello");
  });

  it("treats whitespace-only values as empty", () => {
    assert.equal(firstText(["   "]), "");
  });

  it("trims the winning value", () => {
    assert.equal(firstText(["  x  "]), "x");
  });

  it("returns empty string when every value is empty", () => {
    assert.equal(firstText(["", "", ""]), "");
  });

  it("returns empty string for an empty array", () => {
    assert.equal(firstText([]), "");
  });

  it("skips non-string values", () => {
    assert.equal(firstText([null, 42, "x"]), "x");
  });
});

describe("getFileExtension", () => {
  it("returns the extension for a simple filename", () => {
    assert.equal(getFileExtension("card.json"), "json");
  });

  it("lowercases the extension", () => {
    assert.equal(getFileExtension("card.PNG"), "png");
  });

  it("returns empty string when there is no dot", () => {
    assert.equal(getFileExtension("README"), "");
  });

  it("returns empty string for a trailing dot", () => {
    assert.equal(getFileExtension("README."), "");
  });

  it("returns the last extension for multi-dotted names", () => {
    assert.equal(getFileExtension("a.b.json"), "json");
  });
});

describe("normalizeTagLikeValue", () => {
  it("strips a single leading #", () => {
    assert.equal(normalizeTagLikeValue("#Tag"), "tag");
  });

  it("strips multiple leading # characters", () => {
    assert.equal(normalizeTagLikeValue("##Tag"), "tag");
  });

  it("lowercases the value", () => {
    assert.equal(normalizeTagLikeValue("TAG"), "tag");
  });

  it("trims surrounding whitespace", () => {
    assert.equal(normalizeTagLikeValue("  tag  "), "tag");
  });

  it("returns empty string for null/undefined", () => {
    assert.equal(normalizeTagLikeValue(null), "");
    assert.equal(normalizeTagLikeValue(undefined), "");
  });
});

describe("parseAttributesText", () => {
  it("parses a single key: value line", () => {
    assert.deepEqual(parseAttributesText("key: value"), { key: "value" });
  });

  it("parses multiple lines into multiple keys", () => {
    assert.deepEqual(parseAttributesText("a: 1\nb: 2"), { a: "1", b: "2" });
  });

  it("defaults a separator-less line to 'true'", () => {
    assert.deepEqual(parseAttributesText("flag"), { flag: "true" });
  });

  it("skips blank lines", () => {
    assert.deepEqual(parseAttributesText("\n  \nkey: value"), { key: "value" });
  });

  it("trims whitespace around keys and values", () => {
    assert.deepEqual(parseAttributesText("  key  :  value  "), { key: "value" });
  });

  it("yields an empty string for an explicit empty value", () => {
    assert.deepEqual(parseAttributesText("key:"), { key: "" });
  });
});

describe("normalizeConfidence", () => {
  it("returns the value when in range", () => {
    assert.equal(normalizeConfidence(0.7), 0.7);
  });

  it("clamps values below 0 to 0", () => {
    assert.equal(normalizeConfidence(-0.5), 0);
  });

  it("clamps values above 1 to 1", () => {
    assert.equal(normalizeConfidence(1.5), 1);
  });

  it("returns 0.5 for a non-numeric value", () => {
    assert.equal(normalizeConfidence("foo"), 0.5);
  });

  it("returns 0.5 for undefined", () => {
    assert.equal(normalizeConfidence(undefined), 0.5);
  });
});

describe("sanitizeFileName", () => {
  it("replaces every dangerous character with a dash", () => {
    const result = sanitizeFileName('a<b>c:"d/e\\e|f?g*h');
    // None of < > : " / \ | ? * may survive.
    assert.match(result, /^[^<>:"/\\|?*]*$/);
    assert.equal(result, "a-b-c--d-e-e-f-g-h");
  });

  it("collapses runs of whitespace to a single dash", () => {
    assert.equal(sanitizeFileName("foo bar baz"), "foo-bar-baz");
  });

  it("truncates to at most 80 characters", () => {
    const long = "x".repeat(100);
    const result = sanitizeFileName(long);
    assert.equal(result.length, 80);
    assert.equal(result, "x".repeat(80));
  });

  it("falls back to 'world-entry' for empty/whitespace-only input", () => {
    assert.equal(sanitizeFileName(""), "world-entry");
    assert.equal(sanitizeFileName("   "), "world-entry");
  });
});

describe("escapeHtml", () => {
  it("escapes & < > \" and '", () => {
    assert.equal(escapeHtml('<a href="x">'), "&lt;a href=&quot;x&quot;&gt;");
    assert.equal(escapeHtml("&"), "&amp;");
    assert.equal(escapeHtml("'"), "&#39;");
  });

  // Note: the production escapeHtml does NOT escape ':' — only & < > " '.
  it("does not escape colons", () => {
    assert.equal(escapeHtml("a:b"), "a:b");
  });

  it("coerces non-string input to a string", () => {
    assert.equal(escapeHtml(42), "42");
  });
});
