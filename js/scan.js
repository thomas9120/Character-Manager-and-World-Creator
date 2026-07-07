import { state, els } from './state.js';
import { getRuntimeSupport, toast, setBusy } from './dom.js';
import { savePersistedState } from './settings.js';
import { applyFilters, renderAll } from './render.js';
import { getFileExtension } from './format.js';
import { parseCardFile, hydrateCardFromCache, createErrorCard } from './cards.js';
import { WALK_MAX_DEPTH } from './constants.js';

export async function pickCardFolder() {
  const support = getRuntimeSupport();
  if (support.canUseFolderApi) {
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      state.handles.cardFolder = handle;
      state.importedFiles = [];
      state.folderMode = "handle";
      state.settings.lastFolderName = handle.name;
      savePersistedState();
      els.folderName.textContent = handle.name;
      els.rescanBtn.disabled = false;
      await scanFolder(false);
    } catch (error) {
      if (error?.name !== "AbortError") {
        toast(`Unable to open folder: ${error.message}`, true);
      }
    }
    return;
  }
  if (support.canUseDirectoryUpload) {
    els.folderInput.value = "";
    els.folderInput.click();
    return;
  }
  toast("This browser cannot import folders for character scanning.", true);
}

export async function importFolderFromInput(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }
  state.handles.cardFolder = null;
  state.importedFiles = files;
  state.folderMode = "upload";
  const root = inferRootFolderName(files);
  state.settings.lastFolderName = root;
  savePersistedState();
  els.folderName.textContent = `${root} (imported)`;
  els.rescanBtn.disabled = false;
  try {
    await scanFolder(false);
  } finally {
    event.target.value = "";
  }
}

export function pickSingleCard() {
  els.singleCardInput.value = "";
  els.singleCardInput.click();
}

export async function importSingleCardFromInput(event) {
  const [file] = Array.from(event.target.files || []);
  if (!file) {
    return;
  }
  const ext = getFileExtension(file.name);
  if (!["json", "png"].includes(ext)) {
    toast("Please choose a .json or .png character card.", true);
    event.target.value = "";
    return;
  }
  state.handles.cardFolder = null;
  state.importedFiles = [file];
  state.folderMode = "single";
  state.settings.lastFolderName = file.name;
  savePersistedState();
  els.folderName.textContent = `${file.name} (single card)`;
  els.rescanBtn.disabled = false;
  try {
    await scanFolder(false);
  } finally {
    event.target.value = "";
  }
}

export function inferRootFolderName(files) {
  const first = files[0];
  const relative = String(first.webkitRelativePath || "");
  if (!relative) {
    return "Imported folder";
  }
  return relative.split("/")[0] || "Imported folder";
}

export async function pickWorldFolder() {
  const support = getRuntimeSupport();
  if (!support.canPickWorldFolder) {
    toast("Direct world folder access is not available in this browser. Exports will download files instead.", true);
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    state.handles.worldFolder = handle;
    state.settings.lastWorldFolderName = handle.name;
    savePersistedState();
    els.worldFolderName.textContent = handle.name;
    renderAll();
  } catch (error) {
    if (error?.name !== "AbortError") {
      toast(`Unable to choose world info folder: ${error.message}`, true);
    }
  }
}

export async function scanFolder(isRescan) {
  if (!state.handles.cardFolder && !state.importedFiles.length) {
    toast("Choose a character folder or single card first.", true);
    return;
  }
  try {
    const scanLabel = state.folderMode === "single"
      ? (isRescan ? "Reopening single card..." : "Opening single card...")
      : (isRescan ? "Rescanning folder..." : "Scanning folder...");
    setBusy(true, scanLabel);
    const scanned = [];
    if (state.handles.cardFolder) {
      for await (const entry of walkDirectory(state.handles.cardFolder)) {
        if (entry.kind !== "file") {
          continue;
        }
        const ext = getFileExtension(entry.path);
        if (!["json", "png"].includes(ext)) {
          continue;
        }
        try {
          const file = await entry.handle.getFile();
          const card = await parseCardFile(file, entry.path);
          if (card) {
            hydrateCardFromCache(card);
            scanned.push(card);
          }
        } catch (error) {
          scanned.push(createErrorCard(entry.path, ext, error));
        }
      }
    } else {
      for (const file of state.importedFiles) {
        const relativePath = file.webkitRelativePath || file.name;
        const ext = getFileExtension(relativePath);
        if (!["json", "png"].includes(ext)) {
          continue;
        }
        try {
          const card = await parseCardFile(file, relativePath);
          if (card) {
            hydrateCardFromCache(card);
            scanned.push(card);
          }
        } catch (error) {
          scanned.push(createErrorCard(relativePath, ext, error));
        }
      }
    }

    state.cards = scanned.sort((a, b) => a.displayName.localeCompare(b.displayName));
    state.selectedCardId = state.cards[0]?.id || null;
    applyFilters();
    savePersistedState();
    toast(`Scanned ${state.cards.length} card file${state.cards.length === 1 ? "" : "s"}.`);
  } catch (error) {
    toast(`Scan failed: ${error.message}`, true);
  } finally {
    setBusy(false);
    els.lastScanValue.textContent = new Date().toLocaleString();
  }
}

export async function* walkDirectory(rootHandle, prefix = "", depth = 0) {
  if (depth > WALK_MAX_DEPTH) {
    return;
  }
  for await (const [name, handle] of rootHandle.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      yield* walkDirectory(handle, path, depth + 1);
    } else {
      yield { path, handle, kind: "file" };
    }
  }
}
