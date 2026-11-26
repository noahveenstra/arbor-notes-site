import { SEMANTIC_VECTOR_DATABASE } from "./account-cache.js?v=arb-190-instant-launch-20261125-a";
import { createPassageAnchor } from "./passage-anchor.js?v=arb-161-verify-1";

export const MODEL_ID = "Snowflake/snowflake-arctic-embed-s";
export const MODEL_REVISION = "e596f507467533e48a2e17c007f0e1dacc837b33";
export const LOCAL_MODEL_ID = "snowflake-arctic-embed-s@" + MODEL_REVISION;
export const CHUNKER_VERSION = "sentence-list-32w-stride26-max32-even-editor-body-v3";
export const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
export const EMBEDDING_DIMENSION = 384;
export const TOKENIZER_REVISION = MODEL_REVISION;
export const PREPROCESSING_VERSION = "arctic-passage-no-prefix-cls-l2-v1";
// Arctic Embed S truncates a sequence at 512 tokens, including [CLS] and [SEP].
export const WHOLE_NOTE_TOKEN_LIMIT = 512;
export const WHOLE_NOTE_CONTENT_TOKENS = WHOLE_NOTE_TOKEN_LIMIT - 2;
export const MODEL_CACHE_KEY = MODEL_ID + "@" + MODEL_REVISION + "#tokenizer-" + TOKENIZER_REVISION + "#" + CHUNKER_VERSION + "#" + PREPROCESSING_VERSION + "#dim" + EMBEDDING_DIMENSION + "#whole-note-" + WHOLE_NOTE_TOKEN_LIMIT + "#index-v3";
export const MAX_INDEX_BATCH_NOTES = 4;
export const MAX_INDEX_BATCH_PASSAGES = 64;
// Same name that account-cache.js deletes on sign-out and Apple ID change.
const DATABASE_NAME = SEMANTIC_VECTOR_DATABASE;
const STORE_NAME = "note-vectors";
const BODY_CHARACTER_LIMIT = 30000;
const memoryVectors = new Map();
let databasePromise;
let generation = 0;
let prunedCorpusSignature = "";
let lastCacheStats = { vector_cache_hits: 0, note_vectors_embedded: 0, vector_cache_writes: 0 };
const accountInvalidationChannel = typeof document !== "undefined" && typeof BroadcastChannel === "function"
  ? new BroadcastChannel("arbor-semantic-index-invalidation-v1")
  : null;
if (accountInvalidationChannel) accountInvalidationChannel.addEventListener("message", function (event) {
  if (!event.data || event.data.type !== "account-cache-reset") return;
  generation += 1;
  releaseSemanticMemory();
  globalThis.dispatchEvent(new Event("arbor:semantic-index-reset"));
});

// Called before the vector database is deleted (sign-out, Apple ID change).
// Drops in-memory vectors, closes the connection, and makes any search that
// was prepared earlier skip its cache write so it cannot recreate the data.
export async function resetSemanticIndex(options) {
  generation += 1;
  if (options && options.broadcast && accountInvalidationChannel) {
    accountInvalidationChannel.postMessage({ type: "account-cache-reset" });
  }
  await releaseSemanticMemory();
}

// Keep the IndexedDB vectors for warm future searches, but drop the in-memory
// copy and connection after the worker has been idle. This releases the
// per-note float arrays without requiring the user to download or re-embed.
export async function releaseSemanticMemory() {
  memoryVectors.clear();
  prunedCorpusSignature = "";
  lastCacheStats = { vector_cache_hits: 0, note_vectors_embedded: 0, vector_cache_writes: 0 };
  const opening = databasePromise;
  databasePromise = undefined;
  if (!opening) return;
  try {
    const database = await opening;
    if (database) database.close();
  } catch (_) {}
}

export function getCacheStats() {
  return Object.assign({}, lastCacheStats);
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise(function (resolve) {
    if (!globalThis.indexedDB) { resolve(null); return; }
    const request = globalThis.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = function () {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = function () {
      const database = request.result;
      database.onversionchange = function () { database.close(); };
      resolve(database);
    };
    request.onerror = function () { resolve(null); };
    request.onblocked = function () { resolve(null); };
  });
  return databasePromise;
}

function transactionResult(transaction) {
  return new Promise(function (resolve, reject) {
    transaction.oncomplete = function () { resolve(); };
    transaction.onerror = function () { reject(transaction.error || new Error("IndexedDB transaction failed")); };
    transaction.onabort = function () { reject(transaction.error || new Error("IndexedDB transaction was aborted")); };
  });
}

async function fingerprint(text) {
  const bytes = new TextEncoder().encode(text);
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(function (value) { return value.toString(16).padStart(2, "0"); }).join("");
  }
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return text.length + "-" + (hash >>> 0).toString(16);
}

function readRequest(request) {
  return new Promise(function (resolve) {
    request.onsuccess = function () { resolve(request.result || null); };
    request.onerror = function () { resolve(null); };
  });
}

function validVector(vector) {
  return Array.isArray(vector) && vector.length === EMBEDDING_DIMENSION;
}

function validVectorRecord(record, document) {
  if (!record || record.status !== "indexed" || record.modelCacheKey !== MODEL_CACHE_KEY || !Array.isArray(record.vectors) || !Array.isArray(record.passages)) return false;
  if (!validVector(record.wholeNoteVector)) return false;
  if (record.vectors.length !== record.passages.length || !record.vectors.length) return false;
  if (record.vectors.some(function (vector) { return !validVector(vector); })) return false;
  if (document.sourceRevision) return record.sourceRevision === document.sourceRevision;
  return Boolean(document.signature && record.signature === document.signature);
}

function validSkipRecord(record, document) {
  if (!record || record.status !== "skipped" || record.modelCacheKey !== MODEL_CACHE_KEY) return false;
  if (document.sourceRevision) return record.sourceRevision === document.sourceRevision;
  return Boolean(document.signature && record.signature === document.signature);
}

async function readVectors(documents, database, startedIn) {
  const vectors = new Map();
  const ranges = new Map();
  const wholeNoteVectors = new Map();
  const missing = [];
  const skipped = [];
  const result = { vectors, ranges, wholeNoteVectors, missing, skipped };
  const unread = [];
  documents.forEach(function (document) {
    const memory = memoryVectors.get(document.key);
    if (validVectorRecord(memory, document)) {
      vectors.set(document.note.id, memory.vectors);
      ranges.set(document.note.id, memory.passages);
      wholeNoteVectors.set(document.note.id, memory.wholeNoteVector);
    } else if (validSkipRecord(memory, document)) skipped.push(memory);
    else unread.push(document);
  });

  if (database && unread.length) {
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const completed = transactionResult(transaction);
      const store = transaction.objectStore(STORE_NAME);
      const reads = unread.map(function (entry) { return readRequest(store.get(entry.key)); });
      const records = await Promise.all(reads);
      await completed;
      // A completed read can outlive sign-out and the old database connection.
      if (startedIn !== generation) return result;
      unread.forEach(function (entry, index) {
        const cached = records[index];
        if (validVectorRecord(cached, entry)) {
          memoryVectors.set(entry.key, cached);
          vectors.set(entry.note.id, cached.vectors);
          ranges.set(entry.note.id, cached.passages);
          wholeNoteVectors.set(entry.note.id, cached.wholeNoteVector);
        } else if (validSkipRecord(cached, entry)) {
          memoryVectors.set(entry.key, cached);
          skipped.push(cached);
        } else missing.push(entry);
      });
    } catch (_) {
      missing.push.apply(missing, unread);
    }
  } else missing.push.apply(missing, unread);

  return result;
}

async function pruneVectors(database, liveKeys, accountPrefix) {
  for (const key of memoryVectors.keys()) {
    if (key.startsWith(accountPrefix) && !liveKeys.has(key)) memoryVectors.delete(key);
  }
  if (!database) return;
  const signature = accountPrefix + "\u0001" + Array.from(liveKeys).sort().join("\u0000");
  if (signature === prunedCorpusSignature) return;
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionResult(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();
    request.onsuccess = function () {
      request.result.forEach(function (key) {
        if (typeof key !== "string") return;
        const currentModelKey = key.startsWith(MODEL_CACHE_KEY + ":");
        const currentAccountKey = key.startsWith(accountPrefix);
        // The prior cache used an unscoped key. It is derived data, so safely
        // discard it and rebuild rather than carrying vectors across accounts.
        // A cache-key bump (whole-note vectors) drops older derived records too.
        const legacyPrefix = MODEL_ID + "@" + MODEL_REVISION + "#" + CHUNKER_VERSION + ":";
        const legacyKey = key.startsWith(legacyPrefix) && key.split(":").length === 2;
        if (!currentModelKey || (currentAccountKey && !liveKeys.has(key)) || legacyKey) store.delete(key);
      });
    };
    await completed;
    prunedCorpusSignature = signature;
  } catch (_) {}
}

async function saveVectors(database, entries) {
  if (!database || !entries.length) return;
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const completed = transactionResult(transaction);
  const store = transaction.objectStore(STORE_NAME);
  entries.forEach(function (entry) { store.put(entry); });
  await completed;
}

export function contentFor(note) {
  return passagesFor(note).map(function (passage) { return passage.text; });
}

let wordPieceVocabPromise;

function loadWordPieceVocab() {
  if (wordPieceVocabPromise) return wordPieceVocabPromise;
  const url = new URL("./models/" + LOCAL_MODEL_ID + "/tokenizer.json", import.meta.url);
  wordPieceVocabPromise = readTokenizerText(url).then(function (text) {
    return new Set(Object.keys(JSON.parse(text).model.vocab));
  }).catch(function (error) {
    wordPieceVocabPromise = undefined;
    throw error;
  });
  return wordPieceVocabPromise;
}

async function readTokenizerText(url) {
  if (url.protocol === "file:") {
    const fs = await import("node:fs/promises");
    return fs.readFile(url, "utf8");
  }
  const response = await fetch(url.href);
  if (!response.ok) throw new Error("The on-device tokenizer could not be read from Arbor");
  return response.text();
}

function isBertControl(code) {
  if (code === 0x09 || code === 0x0a || code === 0x0d) return false;
  return /\p{C}/u.test(String.fromCodePoint(code));
}

function isBertWhitespace(code) {
  if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) return true;
  return /\p{Zs}/u.test(String.fromCodePoint(code));
}

function isBertPunctuation(char) {
  const code = char.codePointAt(0);
  if ((code >= 33 && code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123 && code <= 126)) return true;
  return /\p{P}/u.test(char);
}

function isChineseChar(code) {
  return (code >= 0x4E00 && code <= 0x9FFF)
    || (code >= 0x3400 && code <= 0x4DBF)
    || (code >= 0x20000 && code <= 0x2A6DF)
    || (code >= 0x2A700 && code <= 0x2B73F)
    || (code >= 0x2B740 && code <= 0x2B81F)
    || (code >= 0x2B820 && code <= 0x2CEAF)
    || (code >= 0xF900 && code <= 0xFAFF)
    || (code >= 0x2F800 && code <= 0x2FA1F);
}

function normalizeBertText(text) {
  let cleaned = "";
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === 0 || code === 0xFFFD || isBertControl(code)) continue;
    if (isBertWhitespace(code)) { cleaned += " "; continue; }
    if (isChineseChar(code)) { cleaned += " " + char + " "; continue; }
    cleaned += char;
  }
  return cleaned.toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "");
}

function basicBertTokens(text) {
  const words = normalizeBertText(text).split(/\s+/).filter(Boolean);
  const tokens = [];
  words.forEach(function (word) {
    let current = "";
    for (const char of word) {
      if (isBertPunctuation(char)) {
        if (current) tokens.push(current);
        tokens.push(char);
        current = "";
      } else current += char;
    }
    if (current) tokens.push(current);
  });
  return tokens;
}

function wordPieceTokens(word, vocab) {
  if ([...word].length > 100) return ["[UNK]"];
  const chars = [...word];
  const pieces = [];
  let start = 0;
  while (start < chars.length) {
    let end = chars.length;
    let found = "";
    while (start < end) {
      const piece = (start === 0 ? "" : "##") + chars.slice(start, end).join("");
      if (vocab.has(piece)) { found = piece; break; }
      end -= 1;
    }
    if (!found) return ["[UNK]"];
    pieces.push(found);
    start = end;
  }
  return pieces;
}

function countWordPieces(text, vocab) {
  return basicBertTokens(text).reduce(function (count, word) {
    return count + wordPieceTokens(word, vocab).length;
  }, 0);
}

export function wholeNoteSource(note) {
  const title = String(note && note.title || "").trim();
  const sourceBody = String(note && (note.indexedBody == null ? note.body || "" : note.indexedBody) || "").slice(0, BODY_CHARACTER_LIMIT);
  const body = sourceBody.trim();
  if (title && body) return title + "\n" + body;
  return title || body || "Untitled note";
}

export async function countContentTokens(text) {
  const vocab = await loadWordPieceVocab();
  return countWordPieces(String(text || ""), vocab);
}

export async function wholeNoteTextFor(note) {
  const source = wholeNoteSource(note);
  if ([...source].length <= WHOLE_NOTE_CONTENT_TOKENS) return source;
  const vocab = await loadWordPieceVocab();
  if (countWordPieces(source, vocab) <= WHOLE_NOTE_CONTENT_TOKENS) return source;
  let low = 0;
  let high = [...source].length;
  const chars = [...source];
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (countWordPieces(chars.slice(0, mid).join(""), vocab) <= WHOLE_NOTE_CONTENT_TOKENS) low = mid;
    else high = mid - 1;
  }
  return chars.slice(0, low).join("");
}

function embedTextsFor(document) {
  return [document.wholeNoteText].concat(document.chunks);
}

async function fillDocument(document) {
  document.passages = passagesFor(document.note);
  document.chunks = document.passages.map(function (passage) { return passage.text; });
  document.wholeNoteText = await wholeNoteTextFor(document.note);
  const payload = { cacheKey: MODEL_CACHE_KEY, chunks: document.chunks, wholeNote: document.wholeNoteText };
  if (document.sourceRevision) payload.sourceRevision = document.sourceRevision;
  document.signature = await fingerprint(JSON.stringify(payload));
}

function vectorSimilarity(left, right) {
  let similarity = 0;
  const length = Math.min(left.length, right.length);
  for (let offset = 0; offset < length; offset += 1) similarity += left[offset] * right[offset];
  return similarity;
}

function bodySegments(body) {
  const segments = [];
  const delimiter = /(?:[.!?;,:])\s+|\n+/g;
  let start = 0;
  let match;
  while ((match = delimiter.exec(body))) {
    if (match.index > start) segments.push({ text: body.slice(start, match.index), start: start });
    start = match.index + match[0].length;
  }
  if (start < body.length) segments.push({ text: body.slice(start), start: start });
  return segments;
}

function sourceWords(segment) {
  let text = segment.text;
  let start = segment.start;
  const leadingPatterns = [/^#{1,6}\s*/, /^\s*[-*+]\s+/, /^\s*\d+[.)]\s+/];
  leadingPatterns.forEach(function (pattern) {
    const prefix = text.match(pattern);
    if (prefix) { start += prefix[0].length; text = text.slice(prefix[0].length); }
  });
  const words = [];
  const expression = /\S+/g;
  let match;
  while ((match = expression.exec(text))) {
    words.push({ text: match[0], start: start + match.index, end: start + match.index + match[0].length });
  }
  return words;
}

function passagesFor(note) {
  const title = String(note.title || "").trim();
  const sourceBody = String(note.indexedBody == null ? note.body || "" : note.indexedBody).slice(0, BODY_CHARACTER_LIMIT);
  const body = sourceBody.trim();
  const sourceOffset = body ? sourceBody.indexOf(body) : 0;
  const firstLine = body.split(/\r?\n/, 1)[0].trim().replace(/^#{1,6}\s*/, "");
  const titleChunk = title || firstLine.slice(0, 120) || "Untitled note";
  const segments = bodySegments(body).map(function (segment) { return sourceWords(segment); }).filter(function (words) { return words.length > 0; });
  const bodyChunks = [];
  let shortWindow = [];
  function flushShortWindow() {
    if (shortWindow.length) bodyChunks.push({
      text: shortWindow.map(function (word) { return word.text; }).join(" "),
      start: sourceOffset + shortWindow[0].start,
      end: sourceOffset + shortWindow[shortWindow.length - 1].end
    });
    shortWindow = [];
  }
  segments.forEach(function (segment) {
    const words = segment;
    if (words.length <= 32) {
      if (shortWindow.length && shortWindow.length + words.length > 32) flushShortWindow();
      shortWindow.push.apply(shortWindow, words);
      return;
    }
    flushShortWindow();
    for (let offset = 0; offset < words.length; offset += 26) {
      const window = words.slice(offset, offset + 32);
      bodyChunks.push({
        text: window.map(function (word) { return word.text; }).join(" "),
        start: sourceOffset + window[0].start,
        end: sourceOffset + window[window.length - 1].end
      });
    }
  });
  flushShortWindow();
  const seen = new Set([titleChunk.toLocaleLowerCase()]);
  const unique = bodyChunks.filter(function (chunk) {
    const normalized = chunk.text.toLocaleLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  const bodyLimit = 31;
  const selected = unique.length <= bodyLimit ? unique : Array.from({ length: bodyLimit }, function (_, index) {
    return unique[Math.round(index * (unique.length - 1) / (bodyLimit - 1))];
  });
  return [{ text: titleChunk, start: null, end: null }].concat(selected);
}

function verifyDimension(rows) {
  rows.forEach(function (row) {
    if (!Array.isArray(row) || row.length !== EMBEDDING_DIMENSION) throw new Error("Arctic Embed S returned an embedding dimension other than 384");
  });
  return rows;
}

function limitedNotes(notes) {
  return (Array.isArray(notes) ? notes : []).map(function (note) {
    const body = String(note.body || "");
    return {
      id: note.id,
      title: note.title,
      body: body,
      updatedAt: Number(note.updatedAt || 0),
      sourceRevision: String(note.sourceRevision || "")
    };
  });
}

export async function prepareSemanticQuery(query, notes) {
  const options = arguments.length > 2 && arguments[2] || {};
  const startedIn = generation;
  const documents = limitedNotes(notes).map(function (note) {
    return { note: note, sourceRevision: note.sourceRevision, passages: null, chunks: null, signature: "" };
  });
  const accountScope = String(options.accountScope || "local-preview");
  const accountDigest = await fingerprint(accountScope);
  const accountPrefix = MODEL_CACHE_KEY + ":" + accountDigest + ":";
  documents.forEach(function (document) { document.key = accountPrefix + String(document.note.id || ""); });

  // Older callers without a source revision still get content-keyed reuse.
  // The web app supplies modifiedAt plus its local edit generation so stable
  // notes can skip both chunking and hashing on warm searches.
  for (const document of documents) {
    if (document.sourceRevision) continue;
    await fillDocument(document);
  }
  const database = await openDatabase();
  if (startedIn !== generation) {
    // The account changed while this search was being prepared. Use nothing from it.
    if (database) { try { database.close(); } catch (_) {} }
    return { stale: true, generation: startedIn, queryText: "", documents: [], missing: [], vectors: new Map(), passages: [], indexedCount: 0, totalCount: 0, remainingCount: 0 };
  }
  const liveKeys = new Set(documents.map(function (document) { return document.key; }));
  await pruneVectors(database, liveKeys, accountPrefix);
  const cached = await readVectors(documents, database, startedIn);
  documents.forEach(function (document) {
    if (cached.vectors.has(document.note.id)) document.passages = cached.ranges.get(document.note.id);
  });
  const priorityIds = new Map((Array.isArray(options.priorityNoteIds) ? options.priorityNoteIds : []).map(function (id, index) { return [String(id), index]; }));
  const pending = cached.missing.slice().sort(function (left, right) {
    const leftPriority = priorityIds.has(String(left.note.id)) ? priorityIds.get(String(left.note.id)) : Infinity;
    const rightPriority = priorityIds.has(String(right.note.id)) ? priorityIds.get(String(right.note.id)) : Infinity;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    const leftUpdated = Number(left.note.updatedAt || 0);
    const rightUpdated = Number(right.note.updatedAt || 0);
    return rightUpdated - leftUpdated || String(left.note.id || "").localeCompare(String(right.note.id || ""));
  });
  const batch = [];
  const newSkipped = [];
  let passageCount = 0;
  const initialNoteLimit = Math.min(MAX_INDEX_BATCH_NOTES, Math.max(1, Number(options.batchNotes) || MAX_INDEX_BATCH_NOTES));
  const initialPassageLimit = Math.min(MAX_INDEX_BATCH_PASSAGES, Math.max(1, Number(options.batchPassages) || MAX_INDEX_BATCH_PASSAGES));
  const preferred = pending.filter(function (document) { return priorityIds.has(String(document.note.id)); });
  const background = pending.filter(function (document) { return !priorityIds.has(String(document.note.id)); });
  const preferredLimit = Math.min(preferred.length, Math.floor(initialNoteLimit / 2));
  const candidates = preferred.slice(0, preferredLimit);
  const spreadSlots = initialNoteLimit - candidates.length;
  for (let index = 0; index < Math.min(spreadSlots, background.length); index += 1) {
    const spreadIndex = spreadSlots <= 1 ? 0 : Math.round(index * (background.length - 1) / (spreadSlots - 1));
    const candidate = background[spreadIndex];
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  }
  for (const document of candidates) {
    if (batch.length >= initialNoteLimit) break;
    if (!document.passages) await fillDocument(document);
    const embedLength = embedTextsFor(document).length;
    if (embedLength > MAX_INDEX_BATCH_PASSAGES) {
      newSkipped.push({
        key: document.key,
        signature: document.signature,
        sourceRevision: document.sourceRevision,
        modelCacheKey: MODEL_CACHE_KEY,
        status: "skipped",
        passageCount: document.chunks.length
      });
      continue;
    }
    if (passageCount + embedLength > initialPassageLimit && batch.length) break;
    batch.push(document);
    passageCount += embedLength;
  }

  if (startedIn !== generation) return { stale: true, generation: startedIn, queryText: "", documents: [], missing: [], vectors: new Map(), passages: [], indexedCount: 0, totalCount: 0, remainingCount: 0, skippedCount: 0 };
  try {
    await saveVectors(database, newSkipped);
    if (startedIn !== generation) return { stale: true, generation: startedIn, queryText: "", documents: [], missing: [], vectors: new Map(), passages: [], indexedCount: 0, totalCount: 0, remainingCount: 0, skippedCount: 0 };
    newSkipped.forEach(function (entry) { memoryVectors.set(entry.key, entry); });
  } catch (error) { console.warn("Local semantic-index skip status could not be saved.", error); }

  const skippedCount = cached.skipped.length + newSkipped.length;
  lastCacheStats = {
    vector_cache_hits: documents.length - pending.length - cached.skipped.length,
    note_vectors_embedded: batch.length,
    vector_cache_writes: 0
  };
  return {
    generation: startedIn,
    queryText: QUERY_PREFIX + String(query || ""),
    documents: documents,
    missing: batch,
    vectors: cached.vectors,
    wholeNoteVectors: cached.wholeNoteVectors,
    passages: batch.flatMap(function (entry) { return embedTextsFor(entry); }),
    indexedCount: documents.length - pending.length - cached.skipped.length,
    totalCount: documents.length,
    remainingCount: Math.max(0, pending.length - batch.length - newSkipped.length),
    skippedCount: skippedCount
  };
}

export async function completeSemanticQuery(prepared, rows, { deferPassageAnchors = false } = {}) {
  if (!prepared) throw new Error("Missing semantic search preparation");
  if (prepared.stale || prepared.generation !== generation) return { stale: true, results: [], queryVector: null, coverage: { indexed: 0, total: 0, remaining: 0 } };
  const expected = 1 + prepared.passages.length;
  if (!Array.isArray(rows) || rows.length !== expected) throw new Error("Semantic embedding count did not match the chunks sent to the worker");
  verifyDimension(rows);
  const queryVector = rows[0];
  const writes = [];
  const writeEntries = [];
  let vectorOffset = 1;
  if (!prepared.wholeNoteVectors) prepared.wholeNoteVectors = new Map();
  prepared.missing.forEach(function (entry) {
    const embedCount = 1 + entry.chunks.length;
    const embedded = rows.slice(vectorOffset, vectorOffset + embedCount);
    vectorOffset += embedCount;
    const wholeNoteVector = embedded[0];
    const passageVectors = embedded.slice(1);
    const record = {
      key: entry.key,
      signature: entry.signature,
      sourceRevision: entry.sourceRevision,
      modelCacheKey: MODEL_CACHE_KEY,
      status: "indexed",
      vectors: passageVectors,
      wholeNoteVector: wholeNoteVector,
      passages: entry.passages.map(function (passage) { return { start: passage.start, end: passage.end }; })
    };
    writeEntries.push({ entry: entry, record: record, vectors: passageVectors, wholeNoteVector: wholeNoteVector });
    writes.push(record);
  });
  if (prepared.generation !== generation) return { stale: true, results: [], queryVector: null, coverage: { indexed: 0, total: 0, remaining: 0, skipped: 0 } };
  try {
    const database = await openDatabase();
    if (prepared.generation !== generation) return { stale: true, results: [], queryVector: null, coverage: { indexed: 0, total: 0, remaining: 0, skipped: 0 } };
    await saveVectors(database, writes);
    lastCacheStats.vector_cache_writes = writes.length;
  } catch (error) { console.warn("Local semantic-vector cache could not be saved.", error); }
  // A sign-out/account reset may happen while IndexedDB commits. Never restore
  // old-account vectors into memory or expose scores after that generation ends.
  if (prepared.generation !== generation) return { stale: true, results: [], queryVector: null, coverage: { indexed: 0, total: 0, remaining: 0, skipped: 0 } };
  writeEntries.forEach(function (written) {
    prepared.vectors.set(written.entry.note.id, written.vectors);
    prepared.wholeNoteVectors.set(written.entry.note.id, written.wholeNoteVector);
    memoryVectors.set(written.entry.key, written.record);
    written.entry.passages = written.record.passages;
  });

  const results = await Promise.all(prepared.documents.map(async function (document) {
    const noteVectors = prepared.vectors.get(document.note.id);
    const wholeNoteVector = prepared.wholeNoteVectors.get(document.note.id);
    if (!noteVectors || !noteVectors.length || !validVector(wholeNoteVector)) return null;
    let bestPassageScore = -Infinity;
    let bestPassageIndex = -1;
    noteVectors.forEach(function (vector, index) {
      const similarity = vectorSimilarity(queryVector, vector);
      if (similarity > bestPassageScore) { bestPassageScore = similarity; bestPassageIndex = index; }
    });
    const wholeScore = vectorSimilarity(queryVector, wholeNoteVector);
    const wholeNoteWon = wholeScore > bestPassageScore;
    const score = wholeNoteWon ? wholeScore : bestPassageScore;
    const passage = document.passages || document.note._semanticPassages;
    let bestIndex = bestPassageIndex;
    if (wholeNoteWon && passage) {
      let bestBodyScore = -Infinity;
      let bestBodyIndex = -1;
      noteVectors.forEach(function (vector, index) {
        const candidate = passage[index];
        if (!candidate || !Number.isInteger(candidate.start) || !Number.isInteger(candidate.end)) return;
        const similarity = vectorSimilarity(queryVector, vector);
        if (similarity > bestBodyScore) { bestBodyScore = similarity; bestBodyIndex = index; }
      });
      if (bestBodyIndex >= 0) bestIndex = bestBodyIndex;
    }
    const winningPassage = passage && passage[bestIndex];
    const winningChunkRange = winningPassage && Number.isInteger(winningPassage.start) && Number.isInteger(winningPassage.end)
      ? { start: winningPassage.start, end: winningPassage.end }
      : null;
    let source = null;
    if (winningChunkRange && !deferPassageAnchors) {
      try {
        source = await createPassageAnchor({
          noteId: document.note.id,
          body: document.note.body,
          start: winningChunkRange.start,
          end: winningChunkRange.end,
          chunkerVersion: CHUNKER_VERSION,
          matchProvenance: "semantic"
        });
      } catch (_) {}
    }
    if (prepared.generation !== generation) return null;
    return {
      id: document.note.id,
      score: score,
      wholeNoteWon: wholeNoteWon,
      sourceRevision: document.sourceRevision,
      passage: source,
      winningChunkKind: winningChunkRange ? "body" : "title",
      winningChunkRange: winningChunkRange,
      sourceAnchorResolved: Boolean(source)
    };
  }));
  if (prepared.generation !== generation) return { stale: true, results: [], queryVector: null, topNoteScore: null, sixthBestNoteScore: null, coverage: { indexed: 0, total: 0, remaining: 0, skipped: 0 } };
  const rankedScores = results.filter(Boolean).map(function (result) { return result.score; }).filter(Number.isFinite).sort(function (left, right) { return right - left; });
  return {
    results: results.filter(Boolean),
    queryVector: queryVector,
    topNoteScore: rankedScores.length ? rankedScores[0] : null,
    sixthBestNoteScore: rankedScores.length >= 6 ? rankedScores[5] : null,
    coverage: {
      indexed: Math.min(prepared.totalCount, prepared.indexedCount + prepared.missing.length),
      total: prepared.totalCount,
      remaining: prepared.remainingCount,
      skipped: prepared.skippedCount
    }
  };
}
