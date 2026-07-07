export function assertLikelyPng(buffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 12));
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff === "RIFF" && webp === "WEBP") {
      throw new Error("This file is actually a WEBP image renamed as .png.");
    }
  }
}

export async function parsePngMetadata(buffer) {
  const view = new DataView(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let index = 0; index < signature.length; index += 1) {
    if (view.getUint8(index) !== signature[index]) {
      throw new Error("Not a valid PNG file or PNG metadata was stripped.");
    }
  }

  const decoder = new TextDecoder();
  const rawTextKeys = [];
  const texts = [];
  let offset = 8;
  while (offset < view.byteLength) {
    if (offset + 8 > view.byteLength) {
      throw new Error("Truncated PNG: chunk header runs past end of file.");
    }
    const length = view.getUint32(offset);
    const type = decoder.decode(new Uint8Array(buffer, offset + 4, 4));
    const dataOffset = offset + 8;
    if (dataOffset + length > view.byteLength) {
      throw new Error(`Corrupt PNG: "${type}" chunk length (${length}) exceeds file bounds.`);
    }
    if (type === "tEXt") {
      const bytes = new Uint8Array(buffer, dataOffset, length);
      const nul = bytes.indexOf(0);
      const key = decoder.decode(bytes.slice(0, nul >= 0 ? nul : 0));
      const text = decoder.decode(bytes.slice(nul + 1));
      rawTextKeys.push(key);
      texts.push({ key, text, chunkType: type, compressed: false });
    } else if (type === "zTXt") {
      const bytes = new Uint8Array(buffer, dataOffset, length);
      const nul = bytes.indexOf(0);
      const key = decoder.decode(bytes.slice(0, nul >= 0 ? nul : 0));
      const compressionMethod = bytes[nul + 1];
      if (compressionMethod !== 0) {
        throw new Error(`Unsupported zTXt compression method for "${key}".`);
      }
      const compressedBytes = bytes.slice(nul + 2);
      const text = await inflatePngText(compressedBytes);
      rawTextKeys.push(key);
      texts.push({ key, text, chunkType: type, compressed: true });
    } else if (type === "iTXt") {
      const bytes = new Uint8Array(buffer, dataOffset, length);
      let cursor = 0;
      while (cursor < bytes.length && bytes[cursor] !== 0) cursor += 1;
      const key = decoder.decode(bytes.slice(0, cursor));
      cursor += 1;
      const compressionFlag = bytes[cursor];
      cursor += 1;
      const compressionMethod = bytes[cursor];
      cursor += 1;
      while (cursor < bytes.length && bytes[cursor] !== 0) cursor += 1;
      cursor += 1;
      while (cursor < bytes.length && bytes[cursor] !== 0) cursor += 1;
      cursor += 1;
      const textBytes = bytes.slice(cursor);
      let text = "";
      if (compressionFlag === 1) {
        if (compressionMethod !== 0) {
          throw new Error(`Unsupported iTXt compression method for "${key}".`);
        }
        text = await inflatePngText(textBytes);
      } else {
        text = decoder.decode(textBytes);
      }
      rawTextKeys.push(key);
      texts.push({ key, text, chunkType: type, compressionMethod, compressed: compressionFlag === 1 });
    }
    offset += 12 + length;
    if (type === "IEND") {
      break;
    }
  }

  return {
    rawTextKeys,
    texts
  };
}

export async function inflatePngText(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("Browser does not support compressed PNG text chunks (needs DecompressionStream).");
  }
  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream("deflate"));
  const inflated = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(inflated);
}

export function extractCardJsonFromMetadata(metadata) {
  if (!metadata?.texts?.length) {
    throw new Error("PNG contained no text metadata. It may be a plain image, stripped card, or unsupported export.");
  }
  const priorityTexts = [...metadata.texts].sort((left, right) => {
    return scoreMetadataKey(right.key) - scoreMetadataKey(left.key);
  });
  const candidates = [];
  for (const entry of priorityTexts) {
    const text = entry.text?.trim();
    if (!text) {
      continue;
    }
    const normalizedKey = String(entry.key || "").toLowerCase();
    if (normalizedKey === "ccv3" || normalizedKey === "chara") {
      const decoded = tryDecodeBase64Utf8(text);
      if (decoded) {
        candidates.push(decoded);
      }
      continue;
    }
    candidates.push(text);
    const decoded = tryDecodeBase64Utf8(text);
    if (decoded) {
      candidates.push(decoded);
    }
  }

  for (const candidate of candidates) {
    const parsed = tryParseEmbeddedJson(candidate);
    if (parsed) {
      return parsed;
    }
  }
  const availableKeys = metadata.texts.map((entry) => entry.key).filter(Boolean).join(", ");
  throw new Error(
    availableKeys
      ? `No character card JSON found in PNG metadata. Found keys: ${availableKeys}.`
      : "No character card JSON found in PNG metadata."
  );
}

export function scoreMetadataKey(key) {
  const normalized = String(key || "").toLowerCase();
  if (normalized === "ccv3") return 60;
  if (normalized === "chara") return 50;
  if (normalized.includes("character")) return 40;
  if (normalized.includes("ccv3")) return 35;
  if (normalized.includes("card")) return 25;
  if (normalized.includes("json")) return 20;
  return 0;
}

export function tryDecodeBase64Utf8(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || !/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
    return null;
  }
  const compact = trimmed.replace(/\s+/g, "");
  if (compact.length % 4 !== 0) {
    return null;
  }
  try {
    const binary = atob(compact);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

export function tryParseEmbeddedJson(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const attempts = [trimmed];
  const openBrace = trimmed.indexOf("{");
  if (openBrace > 0) {
    attempts.push(trimmed.slice(openBrace));
  }
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
    }
  }
  return null;
}
