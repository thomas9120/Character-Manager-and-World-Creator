import { state, els } from './state.js';

export function bindElements() {
  const ids = [
    "pickFolderBtn", "pickSingleCardBtn", "analyzeFolderBtn", "rescanBtn", "pickWorldBtn", "testLlmBtn", "cardCount", "analysisCount", "worldCount",
    "queueCount", "browserSupportBadge", "searchInput", "sourceFilter", "analysisFilter", "folderName",
    "worldFolderName", "lastScanValue", "manualFacetList", "autoFacetList", "folderFacetList", "llmBaseUrl",
    "llmModelLabel", "llmTemperature", "llmTopP", "llmTimeout", "llmMaxTokens", "llmParallelWorkers",
    "llmEndpoint", "llmJsonMode", "saveSettingsBtn",
    "resetPromptsBtn", "analysisPrompt", "worldPrompt", "queueList", "queueSummary", "analyzeAllBtn", "stopQueueBtn",
    "visibleCount", "cardList", "analyzeSelectedBtn", "extractWorldBtn", "exportAcceptedBtn", "cardDetail",
    "folderInput", "singleCardInput", "exportLibraryBtn", "importLibraryBtn", "libraryInput",
    "toastRegion"
  ];
  for (const id of ids) {
    els[id] = document.getElementById(id);
  }
  els.controlTabs = [...document.querySelectorAll("[data-control-tab]")];
  els.controlPanels = [...document.querySelectorAll("[data-control-panel]")];
  els.detailTabs = [...document.querySelectorAll("[data-detail-tab]")];
}

export function setBusy(isBusy, label = "") {
  document.body.style.cursor = isBusy ? "progress" : "";
  const support = getRuntimeSupport();
  els.pickFolderBtn.disabled = isBusy || !support.canImportFolder;
  els.pickSingleCardBtn.disabled = isBusy;
  els.analyzeFolderBtn.disabled = isBusy || !(state.folderMode === "handle" || state.folderMode === "upload") || !state.cards.length || state.queueActive;
  els.pickWorldBtn.disabled = isBusy || !support.canPickWorldFolder;
  els.rescanBtn.disabled = isBusy || (!state.handles.cardFolder && !state.importedFiles.length);
  els.exportLibraryBtn.disabled = isBusy || !state.cards.length;
  els.analyzeAllBtn.disabled = isBusy || !state.cards.length || state.queueActive;
  els.analyzeSelectedBtn.disabled = isBusy || !getSelectedCard();
  els.extractWorldBtn.disabled = isBusy || !getSelectedCard();
  if (label) {
    toast(label);
  }
}

export function toast(message, isError = false) {
  state.uiMessage = message;
  console[isError ? "error" : "log"](message);
  els.toastRegion.textContent = message;
  els.toastRegion.classList.toggle("error", isError);
  els.toastRegion.classList.add("visible");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    els.toastRegion.classList.remove("visible");
  }, 4000);
}

export function updateBrowserSupport() {
  const support = getRuntimeSupport();
  els.browserSupportBadge.textContent = support.message;
  els.browserSupportBadge.className = `status-badge ${support.statusClass}`;
  els.pickFolderBtn.disabled = !support.canImportFolder;
  els.pickSingleCardBtn.disabled = false;
  els.pickWorldBtn.disabled = !support.canPickWorldFolder;
}

export function getRuntimeSupport() {
  const hasPicker = typeof window.showDirectoryPicker === "function";
  const fileInput = document.createElement("input");
  const hasDirectoryUpload = "webkitdirectory" in fileInput;
  const isFileProtocol = window.location.protocol === "file:";
  const secureEnough = window.isSecureContext || isFileProtocol;
  if (!hasPicker && !hasDirectoryUpload) {
    return {
      canImportFolder: false,
      canUseFolderApi: false,
      canUseDirectoryUpload: false,
      canPickWorldFolder: false,
      statusClass: "status-bad",
      message: "Folder import is unavailable in this browser"
    };
  }
  if (hasPicker && !secureEnough) {
    return {
      canImportFolder: hasDirectoryUpload,
      canUseFolderApi: false,
      canUseDirectoryUpload: hasDirectoryUpload,
      canPickWorldFolder: false,
      statusClass: "status-bad",
      message: hasDirectoryUpload
        ? "Use http://localhost for full folder access; fallback import is still available"
        : "Open this app from https:// or http://localhost"
    };
  }
  if (hasPicker && isFileProtocol) {
    return {
      canImportFolder: true,
      canUseFolderApi: true,
      canUseDirectoryUpload: hasDirectoryUpload,
      canPickWorldFolder: true,
      statusClass: "status-warn",
      message: "file:// mode may break folder access; localhost is recommended"
    };
  }
  if (hasPicker) {
    return {
      canImportFolder: true,
      canUseFolderApi: true,
      canUseDirectoryUpload: hasDirectoryUpload,
      canPickWorldFolder: true,
      statusClass: "status-ok",
      message: "Folder API ready"
    };
  }
  return {
    canImportFolder: true,
    canUseFolderApi: false,
    canUseDirectoryUpload: true,
    canPickWorldFolder: false,
    statusClass: "status-warn",
    message: "Read-only folder import ready; world exports will download files"
  };
}

export function getSelectedCard() {
  return state.cards.find((card) => card.id === state.selectedCardId) || null;
}
