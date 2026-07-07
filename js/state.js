export const els = {};

export const state = {
  cards: [],
  filteredCards: [],
  selectedCardId: null,
  handles: {
    cardFolder: null,
    worldFolder: null
  },
  importedFiles: [],
  folderMode: "none",
  settings: null,
  queue: [],
  queueActive: false,
  stopRequested: false,
  activeAbortControllers: new Set(),
  activeFilters: {
    search: "",
    sourceType: "",
    analysisStatus: "",
    manualTag: "",
    autoTag: "",
    folder: ""
  },
  activeControlPanel: "browse",
  activeDetailTab: "overview",
  uiMessage: ""
};
