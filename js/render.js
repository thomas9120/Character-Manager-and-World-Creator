import { state, els } from './state.js';
import { toast, getSelectedCard } from './dom.js';
import { escapeHtml, escapeAttribute, truncate } from './format.js';
import { collectStringArray, persistCard } from './cards.js';
import { parseAttributesText } from './format.js';

export function applyFilters() {
  const search = state.activeFilters.search;
  state.filteredCards = state.cards.filter((card) => {
    if (state.activeFilters.sourceType && card.sourceType !== state.activeFilters.sourceType) {
      return false;
    }
    if (state.activeFilters.analysisStatus) {
      if (state.activeFilters.analysisStatus === "analyzed" && card.analysis.status !== "done") {
        return false;
      }
      if (state.activeFilters.analysisStatus === "pending" && card.analysis.status === "done") {
        return false;
      }
      if (state.activeFilters.analysisStatus === "warning" && card.derived.parserConfidence !== "warning" && card.derived.parserConfidence !== "error") {
        return false;
      }
    }
    if (state.activeFilters.manualTag && !card.manual.tags.includes(state.activeFilters.manualTag)) {
      return false;
    }
    if (state.activeFilters.autoTag && !card.analysis.suggestedTags.includes(state.activeFilters.autoTag)) {
      return false;
    }
    if (state.activeFilters.folder && card.derived.folder !== state.activeFilters.folder) {
      return false;
    }
    if (search) {
      const haystack = [
        card.displayName,
        card.sourcePath,
        card.extracted.description,
        card.extracted.personality,
        card.extracted.scenario,
        card.extracted.firstMessage,
        card.extracted.examples,
        card.manual.notes,
        ...card.manual.tags,
        ...card.extracted.tags,
        ...card.analysis.suggestedTags,
        ...card.analysis.entities,
        ...Object.entries(card.manual.attributes).flatMap(([key, value]) => [key, String(value)])
      ].join(" ").toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  });
  if (!state.filteredCards.some((card) => card.id === state.selectedCardId)) {
    state.selectedCardId = state.filteredCards[0]?.id || state.cards[0]?.id || null;
  }
  renderAll();
}

export function renderAll() {
  renderUiChrome();
  renderSummary();
  renderFacets();
  renderCardList();
  renderCardDetail();
  renderQueue();
  updateAnalyzeFolderButton();
}

export function renderUiChrome() {
  for (const tab of els.controlTabs || []) {
    const isActive = tab.dataset.controlTab === state.activeControlPanel;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }
  for (const panel of els.controlPanels || []) {
    panel.classList.toggle("active", panel.dataset.controlPanel === state.activeControlPanel);
  }
  for (const tab of els.detailTabs || []) {
    const isActive = tab.dataset.detailTab === state.activeDetailTab;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }
}

export function renderSummary() {
  const analyzedCount = state.cards.filter((card) => card.analysis.status === "done").length;
  const worldCount = state.cards.reduce((count, card) => count + card.analysis.worldEntries.filter((entry) => entry.status !== "ignored").length, 0);
  els.cardCount.textContent = String(state.cards.length);
  els.analysisCount.textContent = String(analyzedCount);
  els.worldCount.textContent = String(worldCount);
  els.queueCount.textContent = String(state.queue.length);
  els.visibleCount.textContent = `${state.filteredCards.length} visible`;
  els.analyzeAllBtn.disabled = state.cards.length === 0 || state.queueActive;
  els.stopQueueBtn.disabled = !state.queueActive;
}

export function updateAnalyzeFolderButton() {
  if (!els.analyzeFolderBtn) {
    return;
  }
  const isFolderDataset = state.folderMode === "handle" || state.folderMode === "upload";
  const queueBlocked = state.queueActive;
  els.analyzeFolderBtn.disabled = !isFolderDataset || !state.cards.length || queueBlocked;
  els.analyzeFolderBtn.textContent = isFolderDataset ? "Analyze Folder" : "Analyze Folder (folder only)";
}

export function renderFacets() {
  renderFacetList(els.manualFacetList, buildFacetCounts(state.cards, (card) => card.manual.tags), state.activeFilters.manualTag, (value) => {
    state.activeFilters.manualTag = state.activeFilters.manualTag === value ? "" : value;
    applyFilters();
  });
  renderFacetList(els.autoFacetList, buildFacetCounts(state.cards, (card) => card.analysis.suggestedTags), state.activeFilters.autoTag, (value) => {
    state.activeFilters.autoTag = state.activeFilters.autoTag === value ? "" : value;
    applyFilters();
  });
  renderFacetList(els.folderFacetList, buildFacetCounts(state.cards, (card) => [card.derived.folder]), state.activeFilters.folder, (value) => {
    state.activeFilters.folder = state.activeFilters.folder === value ? "" : value;
    applyFilters();
  });
}

export function renderFacetList(container, counts, activeValue, onToggle) {
  container.innerHTML = "";
  if (!counts.length) {
    container.innerHTML = '<div class="muted tiny">No facets yet.</div>';
    return;
  }
  for (const [value, count] of counts) {
    const button = document.createElement("button");
    button.className = `facet ${value === activeValue ? "active" : ""}`;
    button.innerHTML = `<span>${escapeHtml(value)}</span><span class="facet-count">${count}</span>`;
    button.addEventListener("click", () => onToggle(value));
    container.appendChild(button);
  }
}

export function buildFacetCounts(cards, mapper) {
  const counts = new Map();
  for (const card of cards) {
    for (const value of mapper(card) || []) {
      if (!value) {
        continue;
      }
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);
}

export function renderCardList() {
  els.cardList.innerHTML = "";
  if (!state.filteredCards.length) {
    els.cardList.innerHTML = '<div class="empty">No cards match the current filters.</div>';
    return;
  }
  for (const card of state.filteredCards) {
    const item = document.createElement("article");
    item.className = `card-item ${card.id === state.selectedCardId ? "active" : ""}`;
    const summary = card.analysis.summary || card.extracted.description || card.extracted.personality || "No summary available.";
    item.innerHTML = `
      <h3>${escapeHtml(card.displayName)}</h3>
      <p>${escapeHtml(truncate(summary, 170))}</p>
      <div class="card-meta">
        ${renderInlineBadge(card.sourceType.toUpperCase())}
        ${renderInlineBadge(card.analysis.status === "done" ? "Analyzed" : "Pending")}
        ${renderInlineBadge(card.derived.folder)}
        ${card.derived.warnings.length ? renderInlineBadge("Warning") : ""}
      </div>
    `;
    item.addEventListener("click", () => {
      state.selectedCardId = card.id;
      renderCardList();
      renderCardDetail();
    });
    els.cardList.appendChild(item);
  }
}

export function renderCardDetail() {
  const card = getSelectedCard();
  els.cardDetail.innerHTML = "";
  els.analyzeSelectedBtn.disabled = !card;
  els.extractWorldBtn.disabled = !card;
  els.exportAcceptedBtn.disabled = !card || !card.analysis.worldEntries.some((entry) => entry.status === "accepted");
  renderUiChrome();
  if (!card) {
    els.cardDetail.innerHTML = '<div class="empty">No card selected.</div>';
    return;
  }

  if (state.activeDetailTab === "manual") {
    els.cardDetail.appendChild(renderManualSection(card));
    return;
  }
  if (state.activeDetailTab === "analysis") {
    els.cardDetail.appendChild(renderAnalysisSection(card));
    return;
  }
  if (state.activeDetailTab === "world") {
    els.cardDetail.appendChild(renderWorldSection(card));
    return;
  }
  if (state.activeDetailTab === "raw") {
    els.cardDetail.appendChild(renderPayloadSection(card));
    return;
  }

  els.cardDetail.appendChild(renderOverviewSection(card));
  els.cardDetail.appendChild(renderRawSection(card));
}

export function renderOverviewSection(card) {
  const section = document.createElement("section");
  section.className = "section section-prominent";
  section.innerHTML = `
    <h3>${escapeHtml(card.displayName)}</h3>
    <div class="pill-row">
      ${renderPills([...card.extracted.tags], "tag")}
      ${renderPills(card.manual.tags, "manual")}
      ${renderPills(card.analysis.suggestedTags, "auto")}
    </div>
    <div class="divider"></div>
    <div class="kv-grid">
      ${renderKv("Path", card.sourcePath)}
      ${renderKv("Source", card.sourceType.toUpperCase())}
      ${renderKv("Parser", card.derived.parserConfidence)}
      ${renderKv("Analyzed", card.lastAnalyzedAt ? new Date(card.lastAnalyzedAt).toLocaleString() : "Not yet")}
    </div>
  `;
  return section;
}

export function renderRawSection(card) {
  const section = document.createElement("section");
  section.className = "section";
  section.innerHTML = `
    <h3>Extracted Fields</h3>
    <div class="kv-grid">
      ${renderKv("Description", card.extracted.description || "None")}
      ${renderKv("Personality", card.extracted.personality || "None")}
      ${renderKv("Scenario", card.extracted.scenario || "None")}
      ${renderKv("First Message", card.extracted.firstMessage || "None")}
      ${renderKv("Examples", card.extracted.examples || "None")}
      ${renderKv("Creator Notes", card.extracted.creatorNotes || "None")}
    </div>
    <div class="divider"></div>
    <div class="stack tiny">
      <div><strong>Warnings</strong></div>
      <div class="muted">${card.derived.warnings.length ? escapeHtml(card.derived.warnings.join(" | ")) : "No parser warnings."}</div>
    </div>
  `;
  return section;
}

export function renderManualSection(card) {
  const section = document.createElement("section");
  section.className = "section";
  const attributePairs = Object.entries(card.manual.attributes);
  section.innerHTML = `
    <h3>Manual Metadata</h3>
    <div class="field">
      <label for="manualTagsInput">Manual Tags (comma separated)</label>
      <input id="manualTagsInput" type="text" value="${escapeAttribute(card.manual.tags.join(", "))}">
    </div>
    <div class="field">
      <label for="manualNotesInput">Notes</label>
      <textarea id="manualNotesInput">${escapeHtml(card.manual.notes || "")}</textarea>
    </div>
    <div class="field">
      <label for="manualAttributesInput">Custom Attributes (one per line as key: value)</label>
      <textarea id="manualAttributesInput">${escapeHtml(attributePairs.map(([key, value]) => `${key}: ${value}`).join("\n"))}</textarea>
    </div>
    <div class="toolbar">
      <button id="saveManualBtn" class="btn-secondary">Save Manual Metadata</button>
    </div>
  `;
  section.querySelector("#saveManualBtn").addEventListener("click", () => {
    card.manual.tags = collectStringArray([section.querySelector("#manualTagsInput").value]);
    card.manual.notes = section.querySelector("#manualNotesInput").value.trim();
    card.manual.attributes = parseAttributesText(section.querySelector("#manualAttributesInput").value);
    persistCard(card);
    applyFilters();
    toast(`Saved manual metadata for ${card.displayName}.`);
  });
  return section;
}

export function renderAnalysisSection(card) {
  const section = document.createElement("section");
  section.className = "section";
  const statusClass = card.analysis.lastError ? "status-bad" : card.analysis.status === "done" ? "status-ok" : "status-warn";
  section.innerHTML = `
    <div class="inline">
      <h3>LLM Analysis</h3>
      <span class="status-badge ${statusClass}">${escapeHtml(card.analysis.status)}</span>
    </div>
    <div class="stack">
      <div>${escapeHtml(card.analysis.summary || "No summary yet.")}</div>
      <div><strong>Suggested Tags</strong></div>
      <div class="tag-cloud">${renderPills(card.analysis.suggestedTags, "auto")}</div>
      <div><strong>Categories</strong></div>
      <div class="tag-cloud">${renderPills(card.analysis.categories, "category")}</div>
      <div><strong>Entities</strong></div>
      <div class="tag-cloud">${renderPills(card.analysis.entities, "entity")}</div>
      <div><strong>Inferred Attributes</strong></div>
      <div class="kv-grid">
        ${Object.keys(card.analysis.inferredAttributes).length
          ? Object.entries(card.analysis.inferredAttributes).map(([key, value]) => renderKv(key, String(value))).join("")
          : renderKv("Status", "None")}
      </div>
      <div><strong>Notes</strong></div>
      <div class="muted">${escapeHtml(card.analysis.extractionNotes.join(" | ") || card.analysis.lastError || "No notes yet.")}</div>
      <div class="toolbar">
        <button id="acceptTagsBtn" class="btn-secondary">Add Suggested Tags To Manual</button>
      </div>
    </div>
  `;
  section.querySelector("#acceptTagsBtn").addEventListener("click", () => {
    const merged = new Set([...card.manual.tags, ...card.analysis.suggestedTags]);
    card.manual.tags = [...merged].sort();
    persistCard(card);
    applyFilters();
    toast(`Merged suggested tags into manual tags for ${card.displayName}.`);
  });
  return section;
}

export function renderWorldSection(card) {
  const section = document.createElement("section");
  section.className = "section";
  section.innerHTML = `<h3>World Info Candidates</h3>`;
  const container = document.createElement("div");
  container.className = "stack";
  if (!card.analysis.worldEntries.length) {
    container.innerHTML = '<div class="empty">No world info candidates yet. Run extraction to populate this area.</div>';
  } else {
    for (const [index, entry] of card.analysis.worldEntries.entries()) {
      const item = document.createElement("article");
      item.className = `entry-card ${entry.status}`;
      item.innerHTML = `
        <div class="inline">
          <h4>${escapeHtml(entry.title || `Entry ${index + 1}`)}</h4>
          <span class="status-badge">${escapeHtml(entry.status)}</span>
          <span class="status-badge">${Math.round((entry.confidence || 0) * 100)}%</span>
        </div>
        <div>${escapeHtml(entry.content || "")}</div>
        <div class="tag-cloud">${renderPills(entry.keywords || [], "keyword")}</div>
        <div class="muted tiny">${escapeHtml(entry.rationale || "")}</div>
        <div class="toolbar">
          <button data-action="accept" data-index="${index}" class="btn-secondary">Accept</button>
          <button data-action="ignore" data-index="${index}" class="btn-ghost">Ignore</button>
          <button data-action="reset" data-index="${index}" class="btn-ghost">Reset</button>
        </div>
      `;
      item.querySelectorAll("button[data-index]").forEach((button) => {
        button.addEventListener("click", (event) => {
          const action = event.currentTarget.dataset.action;
          const target = card.analysis.worldEntries[Number(event.currentTarget.dataset.index)];
          if (!target) {
            return;
          }
          if (action === "accept") {
            target.status = "accepted";
          } else if (action === "ignore") {
            target.status = "ignored";
          } else {
            target.status = "suggested";
          }
          persistCard(card);
          renderCardDetail();
          renderSummary();
        });
      });
      container.appendChild(item);
    }
  }
  section.appendChild(container);
  return section;
}

export function renderPayloadSection(card) {
  const section = document.createElement("section");
  section.className = "section";
  section.innerHTML = `
    <h3>Raw Payload Snapshot</h3>
    <pre>${escapeHtml(JSON.stringify({
      meta: card.extracted.rawMeta,
      sample: card.raw
    }, null, 2))}</pre>
  `;
  return section;
}

export function renderQueue() {
  els.queueList.innerHTML = "";
  els.queueSummary.textContent = describeQueue();
  if (!state.queue.length) {
    els.queueList.innerHTML = '<div class="muted tiny">Queue is empty.</div>';
    return;
  }
  for (const item of state.queue) {
    const row = document.createElement("div");
    row.className = "queue-item";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <div class="tiny muted">${escapeHtml(item.reason || item.cardId || "")}</div>
      </div>
      <span class="status-badge ${queueStatusClass(item.status)}">${escapeHtml(formatQueueStatus(item))}</span>
    `;
    els.queueList.appendChild(row);
  }
}

export function queueStatusClass(status) {
  if (status === "done") return "status-ok";
  if (status === "skipped") return "status-warn";
  if (status === "error" || status === "stopped") return "status-bad";
  return "status-warn";
}

export function formatQueueStatus(item) {
  if (item.status === "retrying") {
    return `retry ${item.attempts}/${item.maxAttempts}`;
  }
  if (item.status === "running") {
    return `running ${item.attempts}/${item.maxAttempts}`;
  }
  return item.status;
}

export function describeQueue() {
  if (!state.queue.length) {
    return "No queued analysis yet.";
  }
  const counts = countQueueStatuses(state.queue);
  return [
    `Queued ${counts.queued}`,
    `Running ${counts.running}`,
    `Retrying ${counts.retrying}`,
    `Done ${counts.done}`,
    `Skipped ${counts.skipped}`,
    `Failed ${counts.error}`,
    `Stopped ${counts.stopped}`
  ].join(" | ");
}

export function countQueueStatuses(items) {
  const counts = {
    queued: 0,
    running: 0,
    retrying: 0,
    done: 0,
    skipped: 0,
    error: 0,
    stopped: 0
  };
  for (const item of items) {
    if (Object.hasOwn(counts, item.status)) {
      counts[item.status] += 1;
    }
  }
  return counts;
}

export function renderKv(label, value) {
  return `<div class="kv"><strong>${escapeHtml(label)}</strong><div>${escapeHtml(truncate(String(value), 1000))}</div></div>`;
}

export function renderPills(values, label) {
  if (!values?.length) {
    return '<span class="muted tiny">None</span>';
  }
  return values.map((value) => `<span class="pill">${escapeHtml(value)} <span class="facet-count">${escapeHtml(label)}</span></span>`).join("");
}

export function renderInlineBadge(text) {
  return `<span class="status-badge">${escapeHtml(text)}</span>`;
}
