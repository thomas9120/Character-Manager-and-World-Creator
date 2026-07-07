export const STORAGE_KEY = "character-card-manager-v1";
export const CACHE_MAX_ENTRIES = 250;
export const SEARCH_DEBOUNCE_MS = 150;
export const WALK_MAX_DEPTH = 32;
export const STOP_WORDS = new Set([
  "the", "and", "that", "with", "have", "this", "from", "your", "they", "their", "about", "would", "there",
  "which", "when", "them", "then", "into", "while", "where", "what", "will", "were", "been", "being", "also",
  "only", "more", "some", "such", "than", "very", "just", "like", "into", "onto", "upon", "over", "under",
  "each", "hers", "his", "her", "she", "him", "you", "our", "ours", "for", "are", "not", "can", "its", "who",
  "how", "why", "out", "all", "any", "may", "because", "through", "across", "between", "after", "before"
]);

export const DEFAULT_ANALYSIS_PROMPT = `You are organizing a roleplay character card library.
Return valid JSON only with this shape:
{
  "summary": "short summary",
  "suggestedTags": ["tag"],
  "categories": ["category"],
  "inferredAttributes": {
    "tone": "string",
    "genre": "string"
  },
  "entities": ["entity"],
  "extractionNotes": ["note"]
}

Rules:
- Use short lowercase tags where possible.
- Do not invent unsupported lore.
- If something is unknown, use empty arrays or omit optional fields.
- Base your answer only on the supplied card content.`;

export const DEFAULT_WORLD_PROMPT = `You are extracting reusable world information from a roleplay character card.
Return valid JSON only with this shape:
{
  "entries": [
    {
      "title": "entry title",
      "content": "concise world info entry",
      "keywords": ["keyword"],
      "confidence": 0.0,
      "rationale": "short reason tied to card content"
    }
  ]
}

Rules:
- Only create entries that could help another card or scenario.
- Prefer places, factions, customs, powers, timelines, organizations, species, or notable lore.
- Skip purely personal trivia unless it matters to the wider setting.
- Confidence must be between 0 and 1.`;
