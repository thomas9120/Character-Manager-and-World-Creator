import { firstText, hashString, getFileExtension, normalizeTagLikeValue } from './format.js';
import { assertLikelyPng, parsePngMetadata, extractCardJsonFromMetadata } from './png.js';
import { state } from './state.js';
import { schedulePersistedSave } from './settings.js';
import { STOP_WORDS, CACHE_MAX_ENTRIES } from './constants.js';

export async function parseCardFile(file, relativePath) {
  const sourceType = getFileExtension(file.name);
  if (sourceType === "json") {
    const text = await file.text();
    const raw = JSON.parse(text);
    return normalizeCardRecord({
      raw,
      sourceType,
      relativePath,
      fileName: file.name
    });
  }
  if (sourceType === "png") {
    const buffer = await file.arrayBuffer();
    assertLikelyPng(buffer);
    const pngMeta = await parsePngMetadata(buffer);
    const raw = extractCardJsonFromMetadata(pngMeta);
    return normalizeCardRecord({
      raw,
      sourceType,
      relativePath,
      fileName: file.name,
      pngMetadata: pngMeta
    });
  }
  return null;
}

export function createErrorCard(relativePath, sourceType, error) {
  return {
    id: `error-${hashString(relativePath)}`,
    displayName: relativePath.split("/").pop(),
    sourcePath: relativePath,
    sourceType,
    extracted: {
      name: relativePath.split("/").pop(),
      description: "",
      personality: "",
      scenario: "",
      firstMessage: "",
      examples: "",
      creatorNotes: "",
      systemPrompt: "",
      postHistoryInstructions: "",
      tags: [],
      worldBook: [],
      rawMeta: {}
    },
    manual: {
      tags: [],
      attributes: {},
      notes: ""
    },
    derived: {
      keywordBag: [],
      folder: relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : ".",
      stats: { contentLength: 0, worldBookCount: 0 },
      parserConfidence: "error",
      warnings: [String(error.message || error)]
    },
    analysis: emptyAnalysisState(),
    lastAnalyzedAt: "",
    lastUpdatedAt: new Date().toISOString(),
    raw: null
  };
}

export function normalizeCardRecord({ raw, sourceType, relativePath, fileName, pngMetadata = null }) {
  const base = findLikelyCardPayload(raw);
  const data = base.data && typeof base.data === "object" ? base.data : base;
  const name = firstText([
    data.name,
    base.name,
    data.character,
    fileName.replace(/\.[^.]+$/, "")
  ]) || "Untitled Card";

  const description = firstText([
    data.description,
    data.description_long,
    data.persona,
    data.char_persona,
    base.description
  ]);
  const personality = firstText([
    data.personality,
    data.char_personality,
    data.traits
  ]);
  const scenario = firstText([data.scenario, data.world_scenario, data.setting]);
  const firstMessage = firstText([data.first_mes, data.first_message, data.greeting]);
  const examples = firstText([data.mes_example, data.example_dialogue, data.example_messages]);
  const creatorNotes = firstText([data.creator_notes, data.creatorNotes, base.creator_notes]);
  const systemPrompt = firstText([data.system_prompt, data.systemPrompt]);
  const postHistoryInstructions = firstText([data.post_history_instructions, data.postHistoryInstructions]);
  const tags = collectStringArray([
    data.tags,
    data.character_tags,
    base.tags,
    extractTagsFromText(description),
    extractTagsFromText(personality)
  ]);
  const worldBook = extractWorldBookEntries(base, data);
  const keywordBag = buildKeywordBag({
    name,
    description,
    personality,
    scenario,
    firstMessage,
    examples,
    tags,
    worldBook
  });
  const warnings = [];
  if (!raw || typeof raw !== "object") {
    warnings.push("Card payload was not an object.");
  }
  if (!description && !personality && !scenario) {
    warnings.push("Card had very little descriptive text.");
  }
  if (sourceType === "png" && !pngMetadata?.rawTextKeys?.length) {
    warnings.push("PNG contained no readable text chunks.");
  }

  return {
    id: hashCardIdentity(relativePath, name, sourceType, description),
    displayName: name,
    sourcePath: relativePath,
    sourceType,
    extracted: {
      name,
      description,
      personality,
      scenario,
      firstMessage,
      examples,
      creatorNotes,
      systemPrompt,
      postHistoryInstructions,
      tags,
      worldBook,
      rawMeta: {
        spec: firstText([base.spec, data.spec, base.spec_version]),
        creator: firstText([data.creator, base.creator, data.creator_name]),
        characterVersion: firstText([data.character_version, data.version]),
        pngTextKeys: pngMetadata?.rawTextKeys || [],
        rawTopLevelKeys: Object.keys(base || {}),
        rawDataKeys: Object.keys(data || {})
      }
    },
    manual: {
      tags: [],
      attributes: {},
      notes: ""
    },
    derived: {
      keywordBag,
      folder: relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : ".",
      stats: {
        contentLength: [description, personality, scenario, firstMessage, examples].join(" ").length,
        worldBookCount: worldBook.length
      },
      parserConfidence: warnings.length ? "warning" : "good",
      warnings
    },
    analysis: emptyAnalysisState(),
    lastAnalyzedAt: "",
    lastUpdatedAt: new Date().toISOString(),
    raw
  };
}

export function hydrateCardFromCache(card) {
  const cached = state.settings.cache[card.id];
  if (!cached) {
    return;
  }
  card.manual = {
    tags: Array.isArray(cached.manual?.tags) ? [...cached.manual.tags] : [],
    attributes: { ...(cached.manual?.attributes || {}) },
    notes: cached.manual?.notes || ""
  };
  card.analysis = {
    ...emptyAnalysisState(),
    ...(cached.analysis || {})
  };
  card.lastAnalyzedAt = cached.lastAnalyzedAt || "";
  card.lastUpdatedAt = cached.lastUpdatedAt || card.lastUpdatedAt;
}

export function persistCard(card) {
  state.settings.cache[card.id] = {
    manual: structuredClone(card.manual),
    analysis: structuredClone(card.analysis),
    lastAnalyzedAt: card.lastAnalyzedAt,
    lastUpdatedAt: new Date().toISOString()
  };
  pruneCacheIfNeeded();
  schedulePersistedSave();
}

export function pruneCacheIfNeeded() {
  const cache = state.settings.cache;
  const keys = Object.keys(cache);
  const overflow = keys.length - CACHE_MAX_ENTRIES;
  if (overflow <= 0) {
    return;
  }
  const sortedByDate = keys
    .map((key) => ({ key, lastUpdatedAt: cache[key]?.lastUpdatedAt || "" }))
    .sort((a, b) => (a.lastUpdatedAt < b.lastUpdatedAt ? -1 : 1));
  for (let index = 0; index < overflow; index += 1) {
    delete cache[sortedByDate[index].key];
  }
}

export function emptyAnalysisState() {
  return {
    status: "idle",
    summary: "",
    suggestedTags: [],
    categories: [],
    inferredAttributes: {},
    entities: [],
    extractionNotes: [],
    worldEntries: [],
    lastError: ""
  };
}

export function findLikelyCardPayload(raw) {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  if (raw.spec && raw.data) {
    return raw;
  }
  if (raw.character && typeof raw.character === "object") {
    return raw.character;
  }
  if (raw.card && typeof raw.card === "object") {
    return raw.card;
  }
  return raw;
}

export function extractWorldBookEntries(base, data) {
  const candidates = [
    data.character_book?.entries,
    base.character_book?.entries,
    data.worldbook?.entries,
    data.lorebook?.entries,
    base.worldbook?.entries,
    base.lorebook?.entries
  ];
  const entries = [];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        entries.push(normalizeWorldBookEntry(entry));
      }
    } else if (typeof candidate === "object") {
      for (const entry of Object.values(candidate)) {
        entries.push(normalizeWorldBookEntry(entry));
      }
    }
  }
  return entries.filter((entry) => entry.title || entry.content);
}

export function normalizeWorldBookEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return { title: "", content: "", keywords: [] };
  }
  return {
    title: firstText([entry.comment, entry.name, entry.key]) || "",
    content: firstText([entry.content, entry.text, entry.entry]) || "",
    keywords: collectStringArray([entry.keys, entry.key, entry.tags])
  };
}

export function buildKeywordBag({ name, description, personality, scenario, firstMessage, examples, tags, worldBook }) {
  const text = [name, description, personality, scenario, firstMessage, examples]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const terms = new Set(tags.map((tag) => tag.toLowerCase()));
  for (const token of text.match(/[a-z0-9_'-]{3,}/g) || []) {
    if (!STOP_WORDS.has(token)) {
      terms.add(token);
    }
  }
  for (const entry of worldBook) {
    for (const keyword of entry.keywords || []) {
      if (keyword) {
        terms.add(String(keyword).toLowerCase());
      }
    }
  }
  return [...terms].slice(0, 120);
}

export function extractTagsFromText(text) {
  if (!text) {
    return [];
  }
  const directTags = text.match(/#[a-z0-9_-]+/gi) || [];
  return directTags.map((tag) => tag.replace(/^#/, "").toLowerCase());
}

export function collectStringArray(values) {
  const set = new Set();
  for (const value of values) {
    if (!value) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = normalizeTagLikeValue(item);
        if (normalized) {
          set.add(normalized);
        }
      }
    } else if (typeof value === "string") {
      for (const bit of value.split(/[,\n;|]/)) {
        const normalized = normalizeTagLikeValue(bit);
        if (normalized) {
          set.add(normalized);
        }
      }
    }
  }
  return [...set];
}

export function hashCardIdentity(path, name, sourceType, description) {
  return `card-${hashString([path, name, sourceType, description.slice(0, 180)].join("|"))}`;
}
