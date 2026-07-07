import { state } from './state.js';
import { getSelectedCard, toast } from './dom.js';
import { renderAll, renderQueue, renderSummary, countQueueStatuses } from './render.js';
import { syncSettingsFromUi, flushPersistedSave } from './settings.js';
import { callLlm, parseJsonResponse } from './llm.js';
import { collectStringArray, persistCard } from './cards.js';
import { safeString, sanitizeObjectValues, normalizeConfidence, hashString } from './format.js';

export async function analyzeSelectedCard() {
  syncSettingsFromUi();
  const card = getSelectedCard();
  if (!card) {
    return;
  }
  await analyzeCard(card);
  renderAll();
}

export async function analyzeFolderCards() {
  await analyzeAllCards({ folderOnly: true });
}

export async function extractWorldInfoForSelected() {
  syncSettingsFromUi();
  const card = getSelectedCard();
  if (!card) {
    return;
  }
  await extractWorldInfo(card);
  renderAll();
}

export async function analyzeAllCards(options = {}) {
  if (!state.cards.length) {
    return;
  }
  const mode = options.folderOnly ? "folder" : "all";
  const isFolderDataset = state.folderMode === "handle" || state.folderMode === "upload";
  if (mode === "folder" && !isFolderDataset) {
    toast("Analyze Folder is only available after loading a folder.", true);
    return;
  }
  syncSettingsFromUi();
  state.queue = buildAnalysisQueue(mode);
  state.queueActive = true;
  state.stopRequested = false;
  renderAll();

  const workers = Math.max(1, Math.min(8, Number(state.settings.llmParallelWorkers) || 1));

  async function processQueueItem(item) {
    if (state.stopRequested) {
      if (item.status === "queued") {
        item.status = "stopped";
        item.reason = item.reason || "Queue stopped before processing.";
      }
      return;
    }
    if (item.status === "skipped") {
      return;
    }
    const card = state.cards.find((candidate) => candidate.id === item.cardId);
    if (!card) {
      item.status = "error";
      item.reason = "Card was no longer available.";
      return;
    }
    while (item.attempts < item.maxAttempts) {
      item.attempts += 1;
      item.status = item.attempts > 1 ? "retrying" : "running";
      item.reason = item.attempts > 1 ? `Retrying after previous failure.` : "";
      renderQueue();
      try {
        await analyzeCard(card);
        item.status = "done";
        item.reason = "";
        break;
      } catch (error) {
        if (item.attempts < item.maxAttempts) {
          item.status = "retrying";
          item.reason = `Attempt ${item.attempts} failed: ${error.message}`;
          renderQueue();
          continue;
        }
        item.status = "error";
        item.reason = error.message;
      }
    }
    renderQueue();
    renderSummary();
  }

  let nextIndex = 0;
  async function worker() {
    while (true) {
      if (state.stopRequested) return;
      const myIndex = nextIndex;
      nextIndex += 1;
      if (myIndex >= state.queue.length) return;
      const item = state.queue[myIndex];
      await processQueueItem(item);
    }
  }

  const workerPromises = [];
  for (let i = 0; i < workers; i += 1) {
    workerPromises.push(worker());
  }
  await Promise.all(workerPromises);

  if (state.stopRequested) {
    for (const item of state.queue) {
      if (item.status === "queued") {
        item.status = "stopped";
        item.reason = item.reason || "Queue stopped before processing.";
      }
    }
  }

  state.queueActive = false;
  const stopped = state.stopRequested;
  state.stopRequested = false;
  flushPersistedSave();
  renderAll();
  const counts = countQueueStatuses(state.queue);
  const summary = `done ${counts.done}, skipped ${counts.skipped}, failed ${counts.error}${stopped ? `, stopped ${counts.stopped}` : ""}`;
  toast(stopped ? `Analysis queue stopped: ${summary}.` : `Analysis queue finished: ${summary}.`);
}

export function buildAnalysisQueue(mode) {
  return state.cards.map((card) => {
    const eligible = card.analysis.status !== "done";
    return {
      cardId: card.id,
      label: card.displayName,
      type: mode === "folder" ? "folder-analyze" : "analyze",
      status: eligible ? "queued" : "skipped",
      attempts: 0,
      maxAttempts: eligible ? 2 : 0,
      reason: eligible ? "" : "Skipped because organizer analysis already exists."
    };
  });
}

export async function analyzeCard(card) {
  card.analysis.status = "running";
  card.analysis.lastError = "";
  persistCard(card);
  if (state.queueActive) {
    renderQueue();
    renderSummary();
  } else {
    renderAll();
  }
  try {
    const content = buildCardPromptPayload(card);
    const response = await callLlm([
      { role: "system", content: state.settings.analysisPrompt },
      { role: "user", content }
    ]);
    const parsed = parseJsonResponse(response);
    card.analysis.summary = safeString(parsed.summary);
    card.analysis.suggestedTags = collectStringArray([parsed.suggestedTags]);
    card.analysis.categories = collectStringArray([parsed.categories]);
    card.analysis.inferredAttributes = typeof parsed.inferredAttributes === "object" && parsed.inferredAttributes
      ? sanitizeObjectValues(parsed.inferredAttributes)
      : {};
    card.analysis.entities = collectStringArray([parsed.entities]);
    card.analysis.extractionNotes = Array.isArray(parsed.extractionNotes)
      ? parsed.extractionNotes.map((item) => safeString(item)).filter(Boolean)
      : [];
    card.analysis.status = "done";
    card.lastAnalyzedAt = new Date().toISOString();
    persistCard(card);
    toast(`Analyzed ${card.displayName}.`);
  } catch (error) {
    card.analysis.status = "error";
    card.analysis.lastError = error.message;
    persistCard(card);
    toast(`Analysis failed for ${card.displayName}: ${error.message}`, true);
    throw error;
  }
}

export async function extractWorldInfo(card) {
  syncSettingsFromUi();
  card.analysis.lastError = "";
  card.analysis.status = "running";
  persistCard(card);
  renderAll();
  try {
    const content = buildCardPromptPayload(card, true);
    const response = await callLlm([
      { role: "system", content: state.settings.worldPrompt },
      { role: "user", content }
    ]);
    const parsed = parseJsonResponse(response);
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    card.analysis.worldEntries = entries.map((entry, index) => ({
      id: `world-${card.id}-${index}-${hashString(JSON.stringify(entry))}`,
      title: safeString(entry.title) || `Entry ${index + 1}`,
      content: safeString(entry.content),
      keywords: collectStringArray([entry.keywords]),
      confidence: normalizeConfidence(entry.confidence),
      rationale: safeString(entry.rationale),
      sourceCardId: card.id,
      status: "suggested"
    })).filter((entry) => entry.content);
    card.analysis.status = "done";
    card.lastAnalyzedAt = new Date().toISOString();
    persistCard(card);
    toast(`Extracted ${card.analysis.worldEntries.length} world info entr${card.analysis.worldEntries.length === 1 ? "y" : "ies"} from ${card.displayName}.`);
  } catch (error) {
    card.analysis.status = "error";
    card.analysis.lastError = error.message;
    persistCard(card);
    toast(`World extraction failed for ${card.displayName}: ${error.message}`, true);
    throw error;
  }
}

export function buildCardPromptPayload(card, includeWorldBook = false) {
  return JSON.stringify({
    card: {
      name: card.displayName,
      sourcePath: card.sourcePath,
      sourceType: card.sourceType,
      description: card.extracted.description,
      personality: card.extracted.personality,
      scenario: card.extracted.scenario,
      firstMessage: card.extracted.firstMessage,
      examples: card.extracted.examples,
      creatorNotes: card.extracted.creatorNotes,
      systemPrompt: card.extracted.systemPrompt,
      postHistoryInstructions: card.extracted.postHistoryInstructions,
      extractedTags: card.extracted.tags,
      manualTags: card.manual.tags,
      manualAttributes: card.manual.attributes,
      manualNotes: card.manual.notes,
      worldBookEntries: includeWorldBook ? card.extracted.worldBook : card.extracted.worldBook.slice(0, 8),
      parserWarnings: card.derived.warnings
    }
  }, null, 2);
}
