import { SEARCH_DEBOUNCE_MS } from './constants.js';
import { state, els } from './state.js';
import { debounce } from './format.js';
import { bindElements, updateBrowserSupport } from './dom.js';
import { applyFilters, renderAll, renderQueue } from './render.js';
import { loadInitialSettings, loadSettingsIntoUi, saveSettingsFromUi, resetPromptDefaults } from './settings.js';
import { pickCardFolder, pickSingleCard, importFolderFromInput, importSingleCardFromInput, pickWorldFolder, scanFolder } from './scan.js';
import { analyzeAllCards, analyzeSelectedCard, analyzeFolderCards, extractWorldInfoForSelected } from './analysis.js';
import { exportAcceptedWorldEntries, exportLibrary, importLibraryFromInput } from './export.js';
import { testLlmConnection } from './llm.js';

const debounceApplyFilters = debounce(() => applyFilters(), SEARCH_DEBOUNCE_MS);

function bindEvents() {
  els.pickFolderBtn.addEventListener("click", pickCardFolder);
  els.pickSingleCardBtn.addEventListener("click", pickSingleCard);
  els.analyzeFolderBtn.addEventListener("click", analyzeFolderCards);
  els.rescanBtn.addEventListener("click", () => scanFolder(true));
  els.pickWorldBtn.addEventListener("click", pickWorldFolder);
  els.testLlmBtn.addEventListener("click", testLlmConnection);
  els.saveSettingsBtn.addEventListener("click", saveSettingsFromUi);
  els.resetPromptsBtn.addEventListener("click", resetPromptDefaults);
  els.searchInput.addEventListener("input", (event) => {
    state.activeFilters.search = event.target.value.trim().toLowerCase();
    debounceApplyFilters();
  });
  els.sourceFilter.addEventListener("change", (event) => {
    state.activeFilters.sourceType = event.target.value;
    applyFilters();
  });
  els.analysisFilter.addEventListener("change", (event) => {
    state.activeFilters.analysisStatus = event.target.value;
    applyFilters();
  });
  els.analyzeAllBtn.addEventListener("click", analyzeAllCards);
  els.stopQueueBtn.addEventListener("click", () => {
    state.stopRequested = true;
    if (state.activeAbortController) {
      state.activeAbortController.abort();
    }
    renderQueue();
  });
  els.analyzeSelectedBtn.addEventListener("click", analyzeSelectedCard);
  els.extractWorldBtn.addEventListener("click", extractWorldInfoForSelected);
  els.exportAcceptedBtn.addEventListener("click", exportAcceptedWorldEntries);
  els.folderInput.addEventListener("change", importFolderFromInput);
  els.singleCardInput.addEventListener("change", importSingleCardFromInput);
  els.exportLibraryBtn.addEventListener("click", exportLibrary);
  els.importLibraryBtn.addEventListener("click", () => {
    els.libraryInput.value = "";
    els.libraryInput.click();
  });
  els.libraryInput.addEventListener("change", importLibraryFromInput);
}

function init() {
  state.settings = loadInitialSettings();
  bindElements();
  loadSettingsIntoUi();
  updateBrowserSupport();
  bindEvents();
  applyFilters();
  renderAll();
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});
