import { state, els } from './state.js';
import { getSelectedCard, getRuntimeSupport, toast, setBusy } from './dom.js';
import { sanitizeFileName, safeString } from './format.js';
import { persistCard, emptyAnalysisState, pruneCacheIfNeeded } from './cards.js';
import { renderAll, applyFilters } from './render.js';
import { savePersistedState } from './settings.js';

export async function exportAcceptedWorldEntries() {
  const card = getSelectedCard();
  if (!card) {
    return;
  }
  const accepted = card.analysis.worldEntries.filter((entry) => entry.status === "accepted");
  if (!accepted.length) {
    toast("No accepted entries to export.", true);
    return;
  }
  const support = getRuntimeSupport();
  setBusy(true, support.canPickWorldFolder ? "Exporting accepted world info..." : "Preparing downloads...");
  try {
    for (const entry of accepted) {
      const fileName = `${sanitizeFileName(entry.title || "world-entry")}.md`;
      const body = buildWorldEntryDocument(card, entry);
      if (support.canPickWorldFolder && state.handles.worldFolder) {
        const handle = await state.handles.worldFolder.getFileHandle(fileName, { create: true });
        const writable = await handle.createWritable();
        await writable.write(body);
        await writable.close();
      } else {
        downloadTextFile(fileName, body);
      }
      entry.status = "exported";
    }
    persistCard(card);
    renderAll();
    toast(
      support.canPickWorldFolder && state.handles.worldFolder
        ? `Exported ${accepted.length} world info file${accepted.length === 1 ? "" : "s"}.`
        : `Downloaded ${accepted.length} world info file${accepted.length === 1 ? "" : "s"}.`
    );
  } catch (error) {
    toast(`Export failed: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

export function yamlScalar(value) {
  const text = String(value ?? "");
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}

export function buildWorldEntryDocument(card, entry) {
  const header = [
    "---",
    `title: ${yamlScalar(entry.title)}`,
    `source_card: ${yamlScalar(card.displayName)}`,
    `source_path: ${yamlScalar(card.sourcePath)}`,
    `keywords: ${yamlScalar(entry.keywords.join(", "))}`,
    `confidence: ${entry.confidence}`,
    `exported_at: ${new Date().toISOString()}`,
    "---",
    ""
  ].join("\n");
  return `${header}${entry.content}\n`;
}

export function downloadTextFile(fileName, contents, type = "text/markdown;charset=utf-8") {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportLibrary() {
  if (!state.cards.length) {
    toast("No cards to export yet. Scan a folder or import a library first.", true);
    return;
  }
  const payload = {
    app: "character-card-manager",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      llmBaseUrl: state.settings.llmBaseUrl,
      llmModelLabel: state.settings.llmModelLabel,
      llmTemperature: state.settings.llmTemperature,
      llmTopP: state.settings.llmTopP,
      llmTimeout: state.settings.llmTimeout,
      llmMaxTokens: state.settings.llmMaxTokens,
      llmParallelWorkers: state.settings.llmParallelWorkers,
      llmEndpoint: state.settings.llmEndpoint,
      llmJsonMode: state.settings.llmJsonMode,
      analysisPrompt: state.settings.analysisPrompt,
      worldPrompt: state.settings.worldPrompt
    },
    cards: state.cards
  };
  const json = JSON.stringify(payload, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(`character-library-${stamp}.json`, json, "application/json;charset=utf-8");
  toast(`Exported ${state.cards.length} card${state.cards.length === 1 ? "" : "s"} to a JSON file.`);
}

export function importLibraryFromInput(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  importLibraryFromFile(file).catch((error) => {
    toast(`Could not import library: ${error?.message || error}`, true);
  });
}

export async function importLibraryFromFile(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch (error) {
    toast(`That file is not valid JSON: ${error.message}`, true);
    return;
  }
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.cards)) {
    toast("That file is not a valid character library export.", true);
    return;
  }
  setBusy(true, "Importing library...");
  try {
    const existingIds = new Set(state.cards.map((card) => card.id));
    let added = 0;
    let skipped = 0;
    for (const card of payload.cards) {
      if (!card || typeof card !== "object" || !card.id) {
        skipped++;
        continue;
      }
      if (existingIds.has(card.id)) {
        skipped++;
        continue;
      }
      state.cards.push(card);
      existingIds.add(card.id);
      state.settings.cache[card.id] = {
        manual: structuredClone(card.manual || { tags: [], attributes: {}, notes: "" }),
        analysis: structuredClone(card.analysis || emptyAnalysisState()),
        lastAnalyzedAt: card.lastAnalyzedAt || "",
        lastUpdatedAt: card.lastUpdatedAt || new Date().toISOString()
      };
      added++;
    }
    if (added > 0) {
      state.cards.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
      if (!state.selectedCardId && state.cards.length) {
        state.selectedCardId = state.cards[0].id;
      }
      state.folderMode = state.folderMode || "library";
      pruneCacheIfNeeded();
      applyFilters();
      savePersistedState();
    }
    const parts = [`Imported ${added} card${added === 1 ? "" : "s"}`];
    if (skipped) {
      parts.push(`skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}`);
    }
    toast(parts.join(", ") + ".");
  } finally {
    setBusy(false);
  }
}
