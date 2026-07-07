# Refactor Plan: Split `index.html` into CSS + ES module tree

Decisions confirmed with the maintainer:
- **Module strategy:** Native ES modules (no build step / no bundler).
- **Granularity:** ~14 small modules, one per functional cluster.
- **Execution:** Phased — extract CSS first (verify), then split JS (verify).

---

## Context

`index.html` is a single ~2,870-line file containing inline CSS (~574 lines), HTML markup (~200 lines), and an inline `<script>` (~2,080 lines, 97 functions). This blocks testability, makes navigation hard, and forces the CSP to allow `'unsafe-inline'` for scripts.

**Things in our favor (verified):**
- **Zero inline event handlers.** Every static element is bound via `addEventListener`; rendered buttons use `data-action` attributes + post-insertion binding (see lines 1902, 1940, 2030, 2071, 2109). Nothing depends on `onclick=`. This means we can drop `'unsafe-inline'` from `script-src` once the inline script is gone.
- **No external dependencies** — vanilla JS, no imports to reconcile.
- **`state` and `els` are mutable shared objects that are never reassigned.** `export const state = {...}` in a module works correctly: every importer receives the same object reference and mutations propagate. No special plumbing needed.
- **Already served over `http://localhost`** by `start.bat` (`python -m http.server 8000`), so native ES modules work. They would not work over `file://`, which `getRuntimeSupport()` already warns about.

---

## Phase 1 — Extract CSS (low-risk, mechanical)

1. Create `styles/app.css` with the verbatim contents of `<style>…</style>` (lines 8–582).
2. Replace the `<style>` block in `<head>` with `<link rel="stylesheet" href="./styles/app.css">`.
3. **Verify:** reload the page; confirm layout/styling is visually identical. No JS is touched in this phase.

---

## Phase 2 — Extract JS into ES modules

### Target file tree

```
index.html              markup + <link> + <script type="module" src="./js/app.js">
styles/app.css          (from Phase 1)
js/
  app.js        ENTRY: imports all modules; DOMContentLoaded → init; owns bindEvents
  constants.js  STORAGE_KEY, CACHE_MAX_ENTRIES, SEARCH_DEBOUNCE_MS, WALK_MAX_DEPTH,
                STOP_WORDS, DEFAULT_ANALYSIS_PROMPT, DEFAULT_WORLD_PROMPT
  state.js      exports `state` and `els` (const objects, mutated in place)
  format.js     escapeHtml, escapeAttribute, clampNumber, normalizeEndpoint,
                truncate, debounce, firstText, safeJsonParse, hashString,
                getFileExtension, normalizeTagLikeValue, parseAttributesText,
                safeString, normalizeConfidence, sanitizeObjectValues, sanitizeFileName
  png.js        assertLikelyPng, parsePngMetadata, inflatePngText,
                extractCardJsonFromMetadata, tryDecodeBase64Utf8,
                tryParseEmbeddedJson, scoreMetadataKey
  cards.js      parseCardFile, createErrorCard, normalizeCardRecord,
                hydrateCardFromCache, persistCard, pruneCacheIfNeeded,
                findLikelyCardPayload, extractWorldBookEntries,
                normalizeWorldBookEntry, buildKeywordBag, extractTagsFromText,
                collectStringArray, hashCardIdentity, emptyAnalysisState
  settings.js   loadInitialSettings, savePersistedState, loadSettingsIntoUi,
                syncSettingsFromUi, saveSettingsFromUi, resetPromptDefaults
  dom.js        bindElements, setBusy, toast, updateBrowserSupport, getRuntimeSupport,
                getSelectedCard
  render.js     applyFilters, renderAll, renderSummary, updateAnalyzeFolderButton,
                renderFacets, renderFacetList, buildFacetCounts, renderCardList,
                renderCardDetail, renderRawSection, renderManualSection,
                renderAnalysisSection, renderWorldSection, renderPayloadSection,
                renderQueue, queueStatusClass, formatQueueStatus, describeQueue,
                countQueueStatuses, renderKv, renderPills, renderInlineBadge
  llm.js        callLlm, testLlmConnection, parseJsonResponse
  scan.js       pickCardFolder, importFolderFromInput, pickSingleCard,
                importSingleCardFromInput, inferRootFolderName, pickWorldFolder,
                scanFolder, walkDirectory
  analysis.js   analyzeSelectedCard, analyzeFolderCards, analyzeAllCards,
                buildAnalysisQueue, analyzeCard, extractWorldInfo,
                extractWorldInfoForSelected, buildCardPromptPayload
  export.js     exportAcceptedWorldEntries, buildWorldEntryDocument, yamlScalar,
                downloadTextFile, exportLibrary, importLibraryFromInput,
                importLibraryFromFile
```

### Dependency graph (acyclic — verified)

```
constants  format  png        ← leaves (pure)
   ↑          ↑      ↑
 state      cards ←──┘
   ↑          ↑
  dom ← settings
   ↑
 render ← scan ← analysis ← export
   ↑
 app.js  (root: imports every feature module; owns bindEvents + init)
```

No module imports `app.js`, so there is no cycle. `bindEvents` lives in `app.js` precisely because it references handlers from every feature module — placing it at the root keeps all symbols in scope without forcing feature modules to import one another.

### Per-module conversion rules

- Add `export` to every function that is called from another module.
- Each module `import { … }` only the symbols it uses.
- `state` and `els` are `export const` objects — imported by reference and mutated in place. **Do not reassign them** (reassignment would break the shared-reference semantics).

### Two structural fixes to apply during the split

1. **Move the top-level side effect.** Currently `state.settings = loadInitialSettings()` runs at line 845 during module evaluation (it reads `localStorage`). Move it into `init()` in `app.js`:
   ```js
   state.settings = loadInitialSettings();
   bindElements();
   loadSettingsIntoUi();
   updateBrowserSupport();
   bindEvents();
   applyFilters();
   renderAll();
   ```
2. **Tighten the CSP.** Change `script-src 'self' 'unsafe-inline'` → `script-src 'self'`. This is safe because no inline handlers exist in either the static HTML or the rendered template strings. Keep `'unsafe-inline'` on `style-src` for now (rendered HTML does use inline styles).

### Verification checklist (run after Phase 2)

Reload the app and confirm each path still works:

- [ ] Page renders; styling intact; support badge shows correct status.
- [ ] Open Character Folder → cards scan and populate the list.
- [ ] Open Single Card (both JSON and PNG).
- [ ] Search/filter works; facet toggles work.
- [ ] Save Settings persists across reload (localStorage).
- [ ] Analyze Selected / Analyze All / Stop Queue.
- [ ] Extract World Info → Export Accepted Entries (file download).
- [ ] Export Library / Import Library (round-trip).
- [ ] `node --check` on each `js/*.js` file (catches syntax errors introduced by the conversion).

---

## Phase 3 — Polish (optional, quick)

- Add a short module-layout note to the README so contributors know where things live.
- Optionally add a minimal `package.json` with an ESLint flat config and an `npm run lint` script. This sets up the "no lint/format/type-check tooling" maintainability item and gives us `--check` on every file going forward.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Missed an `export` → `ReferenceError` at runtime | Run each feature path in the Phase 2 verification checklist; run `node --check` on every `js/*.js` file. |
| `file://` users break (ES modules require http(s)) | Already warned by `getRuntimeSupport()`; `start.bat` serves over `http://` so the supported launch path is unaffected. |
| Rendered HTML contained an inline handler that breaks under the tightened CSP | Verified beforehand: only `data-action` attributes + post-insertion `addEventListener` are used (lines 1902, 1940, 2030, 2071, 2109). CSP tightening is safe. |
| Subtle `this` / closure bug from moving functions | No `this`-based methods exist in the codebase (all functions are standalone). Closures over `state`/`els` are preserved because those objects are imported by reference. |
| HTTP/1.1 server + many module requests = slow first load | `python -m http.server` is HTTP/1.1, so ~14 small files means ~14 requests. On localhost each is sub-millisecond; negligible for a local tool. A concatenation build could be added later if it ever matters. |
| State-init ordering bug | Resolved by moving `loadInitialSettings()` out of module-eval time and into `init()` in `app.js` (see structural fix #1). |

---

## Rollback

Each phase produces a self-contained commit on the `fixes` branch. If a phase breaks something, revert that commit (`git revert <sha>`) and re-attempt — no partial state to untangle.
