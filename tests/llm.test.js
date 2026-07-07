import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJsonResponse } from "../js/llm.js";

describe("parseJsonResponse", () => {
  it("parses a raw JSON object", () => {
    assert.deepEqual(parseJsonResponse('{"a":1}'), { a: 1 });
  });

  it("parses raw JSON surrounded by whitespace and newlines", () => {
    assert.deepEqual(parseJsonResponse('\n  {"a":1}\n'), { a: 1 });
  });

  it("parses a ```json fenced block", () => {
    assert.deepEqual(parseJsonResponse('```json\n{"a":1}\n```'), { a: 1 });
  });

  it("parses a plain ``` fenced block", () => {
    assert.deepEqual(parseJsonResponse('```\n{"a":1}\n```'), { a: 1 });
  });

  it("throws when JSON is embedded mid-prose without a fence", () => {
    assert.throws(() => parseJsonResponse('Here is the answer: {"a":1}'), /not valid JSON/);
  });

  it("throws on garbage input", () => {
    assert.throws(() => parseJsonResponse("not json at all"), /not valid JSON/);
  });

  it("throws on an empty string", () => {
    assert.throws(() => parseJsonResponse(""), /not valid JSON/);
  });
});
