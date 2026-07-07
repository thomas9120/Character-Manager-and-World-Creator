import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCardRecord,
  extractWorldBookEntries,
  normalizeWorldBookEntry,
  buildKeywordBag,
  findLikelyCardPayload
} from "../js/cards.js";

describe("findLikelyCardPayload", () => {
  it("returns a spec-marked v2 card wrapper as-is", () => {
    const raw = { spec: "chara_card_v2", data: { name: "x" } };
    assert.equal(findLikelyCardPayload(raw), raw);
  });

  it("unwraps a { character: {...} } envelope", () => {
    const inner = { name: "x" };
    assert.equal(findLikelyCardPayload({ character: inner }), inner);
  });

  it("unwraps a { card: {...} } envelope", () => {
    const inner = { name: "x" };
    assert.equal(findLikelyCardPayload({ card: inner }), inner);
  });

  it("returns a plain object as-is", () => {
    const raw = { name: "x", description: "y" };
    assert.equal(findLikelyCardPayload(raw), raw);
  });

  it("returns null/non-object input unchanged", () => {
    assert.equal(findLikelyCardPayload(null), null);
    assert.equal(findLikelyCardPayload(undefined), undefined);
    assert.equal(findLikelyCardPayload("nope"), "nope");
  });
});

describe("normalizeWorldBookEntry", () => {
  it("returns empty defaults for null/non-object input", () => {
    assert.deepEqual(normalizeWorldBookEntry(null), { title: "", content: "", keywords: [] });
    assert.deepEqual(normalizeWorldBookEntry("nope"), { title: "", content: "", keywords: [] });
  });

  it("derives the title from comment, then name, then key", () => {
    assert.equal(normalizeWorldBookEntry({ comment: "C" }).title, "C");
    assert.equal(normalizeWorldBookEntry({ name: "N" }).title, "N");
    assert.equal(normalizeWorldBookEntry({ key: "K" }).title, "K");
    assert.equal(normalizeWorldBookEntry({ comment: "C", name: "N", key: "K" }).title, "C");
  });

  it("derives the content from content, then text, then entry", () => {
    assert.equal(normalizeWorldBookEntry({ content: "c1" }).content, "c1");
    assert.equal(normalizeWorldBookEntry({ text: "t1" }).content, "t1");
    assert.equal(normalizeWorldBookEntry({ entry: "e1" }).content, "e1");
  });

  it("collects keywords from keys (array), key (string), and tags", () => {
    assert.deepEqual(normalizeWorldBookEntry({ keys: ["a", "b"] }).keywords, ["a", "b"]);
    assert.deepEqual(normalizeWorldBookEntry({ key: "solo" }).keywords, ["solo"]);
    assert.deepEqual(normalizeWorldBookEntry({ tags: ["x", "y"] }).keywords, ["x", "y"]);
  });

  it("returns all-empty defaults for an empty object", () => {
    assert.deepEqual(normalizeWorldBookEntry({}), { title: "", content: "", keywords: [] });
  });
});

describe("extractWorldBookEntries", () => {
  it("extracts entries from data.character_book.entries (array)", () => {
    const data = { character_book: { entries: [{ comment: "T", content: "C" }] } };
    const result = extractWorldBookEntries({}, data);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], { title: "T", content: "C", keywords: [] });
  });

  it("extracts entries from base.character_book.entries when it is an object (keyed)", () => {
    const base = { character_book: { entries: { a: { comment: "T", content: "C" } } } };
    const result = extractWorldBookEntries(base, {});
    assert.equal(result.length, 1);
    assert.equal(result[0].title, "T");
  });

  it("checks data.worldbook.entries", () => {
    const data = { worldbook: { entries: [{ name: "W", text: "wc" }] } };
    const result = extractWorldBookEntries({}, data);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, "W");
  });

  it("checks data.lorebook.entries", () => {
    const data = { lorebook: { entries: [{ name: "L", text: "lc" }] } };
    const result = extractWorldBookEntries({}, data);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, "L");
  });

  it("checks base.worldbook.entries and base.lorebook.entries", () => {
    const base = { worldbook: { entries: [{ name: "BW", text: "x" }] } };
    assert.equal(extractWorldBookEntries(base, {}).length, 1);
    const base2 = { lorebook: { entries: [{ name: "BL", text: "x" }] } };
    assert.equal(extractWorldBookEntries(base2, {}).length, 1);
  });

  it("filters out entries that have neither title nor content", () => {
    const data = {
      character_book: {
        entries: [
          { comment: "keep", content: "yes" },
          { comment: "", content: "" },
          { comment: "   ", content: "   " }
        ]
      }
    };
    const result = extractWorldBookEntries({}, data);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, "keep");
  });

  it("returns an empty array when no candidate locations exist", () => {
    assert.deepEqual(extractWorldBookEntries({}, {}), []);
    assert.deepEqual(extractWorldBookEntries({}, null), []);
    assert.deepEqual(extractWorldBookEntries(null, {}), []);
  });
});

describe("buildKeywordBag", () => {
  it("includes the supplied tags (lowercased)", () => {
    const result = buildKeywordBag({
      name: "x",
      description: "",
      personality: "",
      scenario: "",
      firstMessage: "",
      examples: "",
      tags: ["Foo", "BAR"],
      worldBook: []
    });
    assert.ok(result.includes("foo"));
    assert.ok(result.includes("bar"));
  });

  it("extracts text tokens of 3+ characters", () => {
    const result = buildKeywordBag({
      name: "",
      description: "alpha beta gamma",
      personality: "",
      scenario: "",
      firstMessage: "",
      examples: "",
      tags: [],
      worldBook: []
    });
    assert.ok(result.includes("alpha"));
    assert.ok(result.includes("beta"));
    assert.ok(result.includes("gamma"));
  });

  it("excludes stop words", () => {
    const result = buildKeywordBag({
      name: "",
      description: "the cat and dog",
      personality: "",
      scenario: "",
      firstMessage: "",
      examples: "",
      tags: [],
      worldBook: []
    });
    assert.ok(result.includes("cat"));
    assert.ok(result.includes("dog"));
    assert.ok(!result.includes("the"));
    assert.ok(!result.includes("and"));
  });

  it("merges worldbook keywords (lowercased)", () => {
    const result = buildKeywordBag({
      name: "x",
      description: "",
      personality: "",
      scenario: "",
      firstMessage: "",
      examples: "",
      tags: [],
      worldBook: [{ keywords: ["Forest", "river"] }]
    });
    assert.ok(result.includes("forest"));
    assert.ok(result.includes("river"));
  });

  it("caps the result at 120 entries", () => {
    const tokens = [];
    for (let i = 0; i < 130; i += 1) {
      tokens.push(`w${String(i).padStart(3, "0")}`);
    }
    const result = buildKeywordBag({
      name: tokens.join(" "),
      description: "",
      personality: "",
      scenario: "",
      firstMessage: "",
      examples: "",
      tags: [],
      worldBook: []
    });
    assert.equal(result.length, 120);
  });
});

describe("normalizeCardRecord", () => {
  function ariaFixture() {
    return {
      raw: {
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: "Aria",
          description: "A quiet forest ranger.",
          personality: "Thoughtful and patient.",
          scenario: "Deep woods at dawn.",
          first_mes: "The mist clings to the pines.",
          mes_example: "Example dialogue here.",
          creator_notes: "Made for a friend.",
          system_prompt: "Be immersive.",
          tags: ["fantasy", "ranger"],
          character_book: {
            entries: [
              { comment: "Forest", content: "Ancient woodland.", keys: ["forest"] }
            ]
          }
        }
      },
      sourceType: "json",
      relativePath: "cards/aria.json",
      fileName: "aria.json"
    };
  }

  it("normalizes a full SillyTavern v2 card", () => {
    const fixture = ariaFixture();
    const card = normalizeCardRecord(fixture);
    assert.equal(card.displayName, "Aria");
    assert.equal(card.extracted.description, "A quiet forest ranger.");
    assert.equal(card.extracted.firstMessage, "The mist clings to the pines.");
    assert.equal(card.extracted.examples, "Example dialogue here.");
    assert.equal(card.extracted.creatorNotes, "Made for a friend.");
    assert.deepEqual(card.extracted.tags, ["fantasy", "ranger"]);
    assert.equal(card.extracted.worldBook.length, 1);
    assert.deepEqual(card.extracted.worldBook[0], {
      title: "Forest",
      content: "Ancient woodland.",
      keywords: ["forest"]
    });
    assert.equal(card.derived.folder, "cards");
    assert.equal(card.derived.stats.worldBookCount, 1);
    assert.ok(card.derived.stats.contentLength > 0);
    assert.equal(card.derived.parserConfidence, "good");
    assert.deepEqual(card.derived.warnings, []);
    assert.equal(card.analysis.status, "idle");
    assert.equal(card.lastAnalyzedAt, "");
    assert.equal(card.raw, fixture.raw);
  });

  it("produces a deterministic hex-shaped id", () => {
    const a = normalizeCardRecord(ariaFixture());
    const b = normalizeCardRecord(ariaFixture());
    assert.match(a.id, /^card-[0-9a-f]+$/);
    assert.equal(a.id, b.id);
  });

  it("prefers alternate field names when canonical ones are absent", () => {
    const card = normalizeCardRecord({
      raw: {
        data: {
          name: "Alt",
          description: "Has description so no sparsity warning.",
          first_message: "from first_message",
          example_dialogue: "from example_dialogue",
          creator_notes: "from snake",
          creatorNotes: "from camel"
        }
      },
      sourceType: "json",
      relativePath: "cards/alt.json",
      fileName: "alt.json"
    });
    assert.equal(card.extracted.firstMessage, "from first_message");
    assert.equal(card.extracted.examples, "from example_dialogue");
    // snake_case creator_notes is checked before camelCase creatorNotes.
    assert.equal(card.extracted.creatorNotes, "from snake");
  });

  it("flags a sparse card with a descriptive-text warning", () => {
    const card = normalizeCardRecord({
      raw: { data: { name: "Sparse" } },
      sourceType: "json",
      relativePath: "cards/sparse.json",
      fileName: "sparse.json"
    });
    assert.ok(card.derived.warnings.includes("Card had very little descriptive text."));
    assert.equal(card.derived.parserConfidence, "warning");
  });

  it("gracefully handles a null raw payload (e.g. malformed JSON null)", () => {
    const card = normalizeCardRecord({
      raw: null,
      sourceType: "json",
      relativePath: "cards/null.json",
      fileName: "null.json"
    });
    assert.ok(card.derived.warnings.includes("Card payload was not an object."));
    assert.equal(card.derived.parserConfidence, "warning");
    assert.equal(card.displayName, "null");
  });

  it("warns when a PNG source has no readable text chunks", () => {
    const card = normalizeCardRecord({
      raw: { data: { name: "Png", description: "Some description." } },
      sourceType: "png",
      relativePath: "cards/png.png",
      fileName: "png.png",
      pngMetadata: { rawTextKeys: [] }
    });
    assert.ok(card.derived.warnings.includes("PNG contained no readable text chunks."));
  });

  it("falls back to the filename stem when no name source is present", () => {
    const card = normalizeCardRecord({
      raw: { data: { name: "", description: "Keeps the sparsity warning away." } },
      sourceType: "json",
      relativePath: "cards/lonely.json",
      fileName: "lonely.json"
    });
    assert.equal(card.displayName, "lonely");
  });
});
