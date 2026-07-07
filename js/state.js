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
  activeAbortController: null,
  activeFilters: {
    search: "",
    sourceType: "",
    analysisStatus: "",
    manualTag: "",
    autoTag: "",
    folder: ""
  },
  uiMessage: ""
};
