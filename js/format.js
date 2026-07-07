export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

export function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeEndpoint(endpoint) {
  const cleaned = safeString(endpoint || "/v1/chat/completions");
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

export function truncate(text, max) {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}\u2026`;
}

export function debounce(fn, wait) {
  let timer = null;
  return function (...args) {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, wait);
  };
}

export function firstText(values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function getFileExtension(name) {
  const text = String(name);
  const dot = text.lastIndexOf(".");
  if (dot < 0 || dot === text.length - 1) {
    return "";
  }
  return text.slice(dot + 1).toLowerCase();
}

export function normalizeTagLikeValue(value) {
  if (value == null) {
    return "";
  }
  const normalized = String(value).trim().replace(/^#+/, "").toLowerCase();
  return normalized || "";
}

export function parseAttributesText(text) {
  const attributes = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      attributes[trimmed] = "true";
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key) {
      attributes[key] = value;
    }
  }
  return attributes;
}

export function safeString(value) {
  return typeof value === "string" ? value.trim() : (value == null ? "" : String(value).trim());
}

export function normalizeConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, numeric));
}

export function sanitizeObjectValues(input) {
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    const safeKey = safeString(key);
    const safeValue = safeString(value);
    if (safeKey && safeValue) {
      output[safeKey] = safeValue;
    }
  }
  return output;
}

export function sanitizeFileName(name) {
  return safeString(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, "-").slice(0, 80) || "world-entry";
}
