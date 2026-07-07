import { state } from './state.js';
import { normalizeEndpoint, safeJsonParse } from './format.js';
import { syncSettingsFromUi } from './settings.js';
import { setBusy, toast } from './dom.js';

export async function callLlm(messages) {
  const controller = new AbortController();
  state.activeAbortControllers.add(controller);
  const timeout = window.setTimeout(() => controller.abort(), state.settings.llmTimeout);
  const endpoint = `${state.settings.llmBaseUrl}${normalizeEndpoint(state.settings.llmEndpoint)}`;
  try {
    const requestBody = {
      messages,
      temperature: state.settings.llmTemperature,
      top_p: state.settings.llmTopP,
      max_tokens: state.settings.llmMaxTokens
    };
    if (state.settings.llmJsonMode !== false) {
      requestBody.response_format = { type: "json_object" };
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 260)}`);
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Server returned no message content.");
    }
    return content;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(state.stopRequested ? "Analysis stopped by user." : "Request timed out.");
    }
    if (error instanceof TypeError) {
      throw new Error(`Could not reach the LLM server at ${endpoint}. Check that it is running and allows CORS from this page, then try again.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    state.activeAbortControllers.delete(controller);
  }
}

export async function testLlmConnection() {
  syncSettingsFromUi();
  setBusy(true, "Testing llama.cpp connection...");
  try {
    const response = await callLlm([
      {
        role: "system",
        content: "Reply with valid JSON only: {\"status\":\"ok\",\"message\":\"short confirmation\"}"
      },
      {
        role: "user",
        content: "Confirm the server is reachable."
      }
    ]);
    const parsed = parseJsonResponse(response);
    toast(`LLM test succeeded: ${parsed.message || "Server responded."}`);
  } catch (error) {
    toast(`LLM test failed: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

export function parseJsonResponse(text) {
  const parsed = safeJsonParse(text);
  if (!parsed) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      const nested = safeJsonParse(fenced[1]);
      if (nested) {
        return nested;
      }
    }
    throw new Error("LLM response was not valid JSON.");
  }
  return parsed;
}
