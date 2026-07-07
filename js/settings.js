import { STORAGE_KEY, DEFAULT_ANALYSIS_PROMPT, DEFAULT_WORLD_PROMPT } from './constants.js';
import { safeJsonParse, clampNumber, normalizeEndpoint } from './format.js';
import { state, els } from './state.js';
import { toast } from './dom.js';

export function loadInitialSettings() {
  const saved = safeJsonParse(localStorage.getItem(STORAGE_KEY), {}) || {};
  return {
    llmBaseUrl: saved.settings?.llmBaseUrl || "http://127.0.0.1:8080",
    llmModelLabel: saved.settings?.llmModelLabel || "Local llama.cpp server",
    llmTemperature: Number(saved.settings?.llmTemperature ?? 0.2),
    llmTopP: Number(saved.settings?.llmTopP ?? 0.9),
    llmTimeout: Number(saved.settings?.llmTimeout ?? 60000),
    llmEndpoint: saved.settings?.llmEndpoint || "/v1/chat/completions",
    llmJsonMode: saved.settings?.llmJsonMode !== false,
    analysisPrompt: saved.settings?.analysisPrompt || DEFAULT_ANALYSIS_PROMPT,
    worldPrompt: saved.settings?.worldPrompt || DEFAULT_WORLD_PROMPT,
    cache: saved.cache || {},
    lastFolderName: saved.lastFolderName || "",
    lastWorldFolderName: saved.lastWorldFolderName || ""
  };
}

export function savePersistedState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: {
        llmBaseUrl: state.settings.llmBaseUrl,
        llmModelLabel: state.settings.llmModelLabel,
        llmTemperature: state.settings.llmTemperature,
        llmTopP: state.settings.llmTopP,
        llmTimeout: state.settings.llmTimeout,
        llmEndpoint: state.settings.llmEndpoint,
        llmJsonMode: state.settings.llmJsonMode,
        worldPrompt: state.settings.worldPrompt
      },
      cache: state.settings.cache,
      lastFolderName: state.handles.cardFolder?.name || state.settings.lastFolderName || "",
      lastWorldFolderName: state.handles.worldFolder?.name || state.settings.lastWorldFolderName || ""
    }));
  } catch (error) {
    const name = error?.name || "";
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
      toast("Local storage is full. Recent changes are in-memory only. Consider clearing older cards or exporting your work.", true);
    } else {
      toast(`Could not save settings locally: ${error?.message || error}`, true);
    }
    console.error(error);
  }
}

export function loadSettingsIntoUi() {
  els.llmBaseUrl.value = state.settings.llmBaseUrl;
  els.llmModelLabel.value = state.settings.llmModelLabel;
  els.llmTemperature.value = String(state.settings.llmTemperature);
  els.llmTopP.value = String(state.settings.llmTopP);
  els.llmTimeout.value = String(state.settings.llmTimeout);
  els.llmEndpoint.value = state.settings.llmEndpoint;
  els.llmJsonMode.checked = state.settings.llmJsonMode !== false;
  els.analysisPrompt.value = state.settings.analysisPrompt;
  els.worldPrompt.value = state.settings.worldPrompt;
  els.folderName.textContent = state.settings.lastFolderName || "Not selected";
  els.worldFolderName.textContent = state.settings.lastWorldFolderName || "Not selected";
}

export function syncSettingsFromUi() {
  state.settings.llmBaseUrl = els.llmBaseUrl.value.trim().replace(/\/+$/, "");
  state.settings.llmModelLabel = els.llmModelLabel.value.trim() || "Local llama.cpp server";
  state.settings.llmTemperature = clampNumber(els.llmTemperature.value, 0, 2, 0.2);
  state.settings.llmTopP = clampNumber(els.llmTopP.value, 0, 1, 0.9);
  state.settings.llmTimeout = Math.max(1000, Number(els.llmTimeout.value) || 60000);
  state.settings.llmEndpoint = normalizeEndpoint(els.llmEndpoint.value);
  state.settings.llmJsonMode = els.llmJsonMode.checked;
  state.settings.analysisPrompt = els.analysisPrompt.value.trim() || DEFAULT_ANALYSIS_PROMPT;
  state.settings.worldPrompt = els.worldPrompt.value.trim() || DEFAULT_WORLD_PROMPT;
}

export function saveSettingsFromUi() {
  syncSettingsFromUi();
  savePersistedState();
  toast("Settings saved locally.");
}

export function resetPromptDefaults() {
  els.analysisPrompt.value = DEFAULT_ANALYSIS_PROMPT;
  els.worldPrompt.value = DEFAULT_WORLD_PROMPT;
  saveSettingsFromUi();
}
