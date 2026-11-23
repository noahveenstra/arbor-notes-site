import { SEMANTIC_VECTOR_DATABASE } from "./account-cache.js?v=arb-30-drafts-20261118-b";

export const MODEL_ID = "Snowflake/snowflake-arctic-embed-s";
export const MODEL_REVISION = "e596f507467533e48a2e17c007f0e1dacc837b33";
export const LOCAL_MODEL_ID = "snowflake-arctic-embed-s@" + MODEL_REVISION;
export const CHUNKER_VERSION = "sentence-list-32w-stride26-max32-even-v2";
export const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
export const EMBEDDING_DIMENSION = 384;
export const MODEL_CACHE_KEY = MODEL_ID + "@" + MODEL_REVISION + "#" + CHUNKER_VERSION;
// Same name that account-cache.js deletes on sign-out and Apple ID change.
const DATABASE_NAME = SEMANTIC_VECTOR_DATABASE;
const STORE_NAME = "note-vectors";
const BODY_CHARACTER_LIMIT = 30000;
const memoryVectors = new Map();
let databasePromise;
let generation = 0;
let prunedCorpusSignature = "";
let lastCacheStats = { vector_cache_hits: 0, note_vectors_embedded: 0, vector_cache_writes: 0 };

// Called before the vector database is deleted (sign-out, Apple ID change).
// Drops in-memory vectors, closes the connection, and makes any search that
// was prepared earlier skip its cache write so it cannot recreate the data.
export async function resetSemanticIndex() {
  generation += 1;
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

async function readVectors(documents, signatures, database) {
  const vectors = new Map();
  const missing = [];
  const unread = [];
  documents.forEach(function (document) {
    const note = document.note;
    const key = MODEL_CACHE_KEY + ":" + note.id;
    const signature = signatures.get(note.id);
    const memory = memoryVectors.get(key);
    if (memory && memory.signature === signature) vectors.set(note.id, memory.vectors);
    else unread.push({ note: note, chunks: document.chunks, key: key, signature: signature });
  });

  if (database && unread.length) {
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const completed = transactionResult(transaction);
      const store = transaction.objectStore(STORE_NAME);
      const reads = unread.map(function (entry) { return readRequest(store.get(entry.key)); });
      const records = await Promise.all(reads);
      await completed;
      unread.forEach(function (entry, index) {
        const cached = records[index];
        if (cached && cached.signature === entry.signature && Array.isArray(cached.vectors)) {
          memoryVectors.set(entry.key, cached);
          vectors.set(entry.note.id, cached.vectors);
        } else missing.push(entry);
      });
    } catch (_) {
      missing.push.apply(missing, unread);
    }
  } else missing.push.apply(missing, unread);

  return { vectors: vectors, missing: missing };
}

async function pruneVectors(database, liveKeys) {
  if (!database) return;
  const signature = Array.from(liveKeys).sort().join("\u0000");
  if (signature === prunedCorpusSignature) return;
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = transactionResult(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();
    request.onsuccess = function () {
      request.result.forEach(function (key) {
        if (typeof key === "string" && !liveKeys.has(key)) store.delete(key);
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
  const title = String(note.title || "").trim();
  const body = String(note.body || "").trim();
  const firstLine = body.split(/\r?\n/, 1)[0].trim().replace(/^#{1,6}\s*/, "");
  const titleChunk = title || firstLine.slice(0, 120) || "Untitled note";
  const segments = body.split(/(?:[.!?;,:])\s+|\n+/).map(function (part) {
    return part.replace(/^#{1,6}\s*/, "").replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+[.)]\s+/, "").replace(/\s+/g, " ").trim();
  }).filter(Boolean);
  const bodyChunks = [];
  let shortWindow = [];
  function flushShortWindow() {
    if (shortWindow.length) bodyChunks.push(shortWindow.join(" "));
    shortWindow = [];
  }
  segments.forEach(function (segment) {
    const words = segment.split(/\s+/).filter(Boolean);
    if (words.length <= 32) {
      if (shortWindow.length && shortWindow.length + words.length > 32) flushShortWindow();
      shortWindow.push.apply(shortWindow, words);
      return;
    }
    flushShortWindow();
    for (let offset = 0; offset < words.length; offset += 26) bodyChunks.push(words.slice(offset, offset + 32).join(" "));
  });
  flushShortWindow();
  const seen = new Set([titleChunk.toLocaleLowerCase()]);
  const unique = bodyChunks.filter(function (chunk) {
    const normalized = chunk.toLocaleLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  const bodyLimit = 31;
  const selected = unique.length <= bodyLimit ? unique : Array.from({ length: bodyLimit }, function (_, index) {
    return unique[Math.round(index * (unique.length - 1) / (bodyLimit - 1))];
  });
  return [titleChunk].concat(selected);
}

function verifyDimension(rows) {
  rows.forEach(function (row) {
    if (!Array.isArray(row) || row.length !== EMBEDDING_DIMENSION) throw new Error("Arctic Embed S returned an embedding dimension other than 384");
  });
  return rows;
}

function limitedNotes(notes) {
  return (Array.isArray(notes) ? notes : []).map(function (note) {
    return { id: note.id, title: note.title, body: String(note.body || "").slice(0, BODY_CHARACTER_LIMIT) };
  });
}

export async function prepareSemanticQuery(query, notes) {
  const startedIn = generation;
  const documents = limitedNotes(notes).map(function (note) { return { note: note, chunks: contentFor(note) }; });
  const signatures = new Map(await Promise.all(documents.map(async function (document) {
    return [document.note.id, await fingerprint(JSON.stringify(document.chunks))];
  })));
  const database = await openDatabase();
  if (startedIn !== generation) {
    // The account changed while this search was being prepared. Use nothing from it.
    if (database) { try { database.close(); } catch (_) {} }
    return { stale: true, generation: startedIn, queryText: "", documents: [], missing: [], vectors: new Map(), passages: [] };
  }
  const liveKeys = new Set(documents.map(function (document) { return MODEL_CACHE_KEY + ":" + document.note.id; }));
  await pruneVectors(database, liveKeys);
  const cached = await readVectors(documents, signatures, database);
  lastCacheStats = {
    vector_cache_hits: documents.length - cached.missing.length,
    note_vectors_embedded: cached.missing.length,
    vector_cache_writes: 0
  };
  return {
    generation: startedIn,
    queryText: QUERY_PREFIX + String(query || ""),
    documents: documents,
    missing: cached.missing,
    vectors: cached.vectors,
    passages: cached.missing.flatMap(function (entry) { return entry.chunks; })
  };
}

export async function completeSemanticQuery(prepared, rows) {
  if (!prepared) throw new Error("Missing semantic search preparation");
  if (prepared.stale || prepared.generation !== generation) return [];
  const expected = 1 + prepared.passages.length;
  if (!Array.isArray(rows) || rows.length !== expected) throw new Error("Semantic embedding count did not match the chunks sent to the worker");
  verifyDimension(rows);
  const queryVector = rows[0];
  const writes = [];
  let vectorOffset = 1;
  prepared.missing.forEach(function (entry) {
    const noteVectors = rows.slice(vectorOffset, vectorOffset + entry.chunks.length);
    vectorOffset += entry.chunks.length;
    const record = { key: entry.key, signature: entry.signature, vectors: noteVectors };
    prepared.vectors.set(entry.note.id, noteVectors);
    memoryVectors.set(entry.key, record);
    writes.push(record);
  });
  if (prepared.generation !== generation) return [];
  try {
    await saveVectors(await openDatabase(), writes);
    lastCacheStats.vector_cache_writes = writes.length;
  } catch (error) { console.warn("Local semantic-vector cache could not be saved.", error); }

  return prepared.documents.map(function (document) {
    const noteVectors = prepared.vectors.get(document.note.id);
    if (!noteVectors || !noteVectors.length) return null;
    let score = -1;
    noteVectors.forEach(function (vector) {
      let similarity = 0;
      for (let index = 0; index < Math.min(queryVector.length, vector.length); index += 1) similarity += queryVector[index] * vector[index];
      score = Math.max(score, similarity);
    });
    return { id: document.note.id, score: score };
  }).filter(Boolean);
}
