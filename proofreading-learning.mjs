// On-device memory of proofreading choices. One IndexedDB record on this
// browser. It is not a note, not the personal dictionary, and not synced.

export const LEARNING_DATABASE = "arbor-web-proofreading-learning";
export const MUTE_AFTER = 3;

const STORE = "preferences";
const RECORD_KEY = "learning";

const CLASS_LABELS = {
  fragment: "Fragment warnings",
  "agreement-plural": "Plural agreement",
  "agreement-verb": "Subject-verb agreement",
  contraction: "Apostrophes in contractions",
  "usage-its": "its / it's",
  "usage-youre": "your / you're",
  "usage-theyre": "their / there / they're",
  gector: "Other grammar-model edits",
  gec: "Writing-model edits",
  spelling: "Spelling suggestions",
  grammar: "Grammar suggestions",
  capitalization: "Capitalization suggestions"
};

function classLabel(transformClass) {
  const key = String(transformClass || "");
  if (CLASS_LABELS[key]) return CLASS_LABELS[key];
  if (key.indexOf("harper:") === 0) return "Harper: " + key.slice(7).replace(/[-_]/g, " ");
  return key ? key.replace(/[-_]/g, " ") : "Suggestion";
}

export function emptyLearning() {
  return { version: 1, patterns: [], words: [], dismissals: {}, muted: [], accepts: {} };
}

function patternKey(pattern) {
  if (pattern && typeof pattern === "object") return String(pattern.key || "");
  return String(pattern || "");
}

function patternLabel(pattern) {
  if (pattern && typeof pattern === "object") return String(pattern.label || pattern.key || "");
  return String(pattern || "");
}

function copy(state) {
  const source = state || emptyLearning();
  return {
    version: 1,
    patterns: Array.isArray(source.patterns) ? source.patterns.slice() : [],
    words: Array.isArray(source.words) ? source.words.slice() : [],
    dismissals: Object.assign({}, source.dismissals || {}),
    muted: Array.isArray(source.muted) ? source.muted.slice() : [],
    accepts: Object.assign({}, source.accepts || {})
  };
}

export function normalizeLearning(value) {
  const state = copy(value);
  const seenPatterns = new Set();
  state.patterns = state.patterns.map(function (item) {
    const key = patternKey(item);
    if (!key || seenPatterns.has(key)) return null;
    seenPatterns.add(key);
    return { key: key, label: patternLabel(item) || key };
  }).filter(Boolean);
  state.words = Array.from(new Set(state.words.map(function (item) { return String(item || "").toLocaleLowerCase(); }).filter(Boolean)));
  state.muted = Array.from(new Set(state.muted.map(function (item) { return String(item || ""); }).filter(Boolean)));
  return state;
}

function rememberMute(state, transformClass) {
  const key = String(transformClass || "");
  if (!key) return state;
  const count = Number(state.dismissals[key]) || 0;
  if (count >= MUTE_AFTER && state.muted.indexOf(key) < 0) state.muted.push(key);
  return state;
}

export function ignorePattern(state, pattern, transformClass, label) {
  const next = copy(state);
  const key = patternKey(pattern);
  const kind = String(transformClass || "");
  if (key && !next.patterns.some(function (item) { return patternKey(item) === key; })) {
    next.patterns.push({ key: key, label: String(label || patternLabel(pattern) || key) });
  }
  if (kind) next.dismissals[kind] = (Number(next.dismissals[kind]) || 0) + 1;
  return rememberMute(next, kind);
}

export function ignoreWord(state, word) {
  const next = copy(state);
  const key = String(word || "").toLocaleLowerCase();
  if (key && next.words.indexOf(key) < 0) next.words.push(key);
  return next;
}

export function acceptTransform(state, transformClass) {
  const next = copy(state);
  const key = String(transformClass || "");
  if (!key) return next;
  next.accepts[key] = (Number(next.accepts[key]) || 0) + 1;
  return next;
}

export function undoPattern(state, pattern) {
  const next = copy(state);
  const key = patternKey(pattern);
  next.patterns = next.patterns.filter(function (item) { return patternKey(item) !== key; });
  return next;
}

export function undoWord(state, word) {
  const next = copy(state);
  const key = String(word || "").toLocaleLowerCase();
  next.words = next.words.filter(function (item) { return item !== key; });
  return next;
}

export function undoMute(state, transformClass) {
  const next = copy(state);
  const key = String(transformClass || "");
  next.muted = next.muted.filter(function (item) { return item !== key; });
  if (key) delete next.dismissals[key];
  return next;
}

export function undoAccept(state, transformClass) {
  const next = copy(state);
  const key = String(transformClass || "");
  if (key) delete next.accepts[key];
  return next;
}

export function suppression(state, input) {
  const learning = normalizeLearning(state);
  const item = input || {};
  const kind = String(item.transformClass || "");
  if (kind && learning.muted.indexOf(kind) >= 0) return "muted";
  const word = String(item.word || "").toLocaleLowerCase();
  if (word && learning.words.indexOf(word) >= 0) return "word";
  const pattern = patternKey(item.pattern);
  if (pattern && learning.patterns.some(function (entry) { return patternKey(entry) === pattern; })) return "pattern";
  return null;
}

export function boostFor(state, transformClass) {
  const count = Number((state && state.accepts && state.accepts[transformClass]) || 0);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(0.1, count * 0.02);
}

export function boostMap(state) {
  const accepts = (state && state.accepts) || {};
  const boosts = {};
  Object.keys(accepts).forEach(function (key) {
    const boost = boostFor(state, key);
    if (boost > 0) boosts[key] = boost;
  });
  return boosts;
}

export function describeLearning(state) {
  const learning = normalizeLearning(state);
  const rows = [];
  learning.patterns.forEach(function (pattern) {
    rows.push({
      id: "pattern:" + patternKey(pattern),
      kind: "pattern",
      pattern: patternKey(pattern),
      title: "Ignored suggestion",
      detail: patternLabel(pattern)
    });
  });
  learning.words.forEach(function (word) {
    rows.push({
      id: "word:" + word,
      kind: "word",
      word: word,
      title: "Ignored word",
      detail: word
    });
  });
  learning.muted.forEach(function (kind) {
    const count = Number(learning.dismissals[kind]) || MUTE_AFTER;
    rows.push({
      id: "muted:" + kind,
      kind: "muted",
      transformClass: kind,
      title: classLabel(kind) + " is paused",
      detail: "You ignored this " + count + " times, so Arbor stopped offering it."
    });
  });
  Object.keys(learning.accepts).forEach(function (kind) {
    const count = Number(learning.accepts[kind]) || 0;
    if (count <= 0) return;
    rows.push({
      id: "accept:" + kind,
      kind: "accept",
      transformClass: kind,
      title: classLabel(kind),
      detail: "Accepted " + count + " time" + (count === 1 ? "" : "s") + ". Similar suggestions are a little more likely to appear."
    });
  });
  return rows;
}

function requestToPromise(request) {
  return new Promise(function (resolve, reject) {
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error || new Error("IndexedDB request failed")); };
  });
}

function openDatabase(indexedDB) {
  return new Promise(function (resolve, reject) {
    if (!indexedDB || typeof indexedDB.open !== "function") {
      resolve(null);
      return;
    }
    let request;
    try { request = indexedDB.open(LEARNING_DATABASE, 1); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = function () {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error || new Error("Could not open proofreading learning")); };
  });
}

export function createLearningStore(indexedDB) {
  let databasePromise = null;
  function database() {
    if (!databasePromise) {
      databasePromise = openDatabase(indexedDB).catch(function (error) {
        databasePromise = null;
        throw error;
      });
    }
    return databasePromise;
  }
  return {
    load: async function () {
      const db = await database();
      if (!db) return emptyLearning();
      const transaction = db.transaction(STORE, "readonly");
      const result = await requestToPromise(transaction.objectStore(STORE).get(RECORD_KEY));
      return normalizeLearning(result);
    },
    save: async function (state) {
      const db = await database();
      if (!db) return normalizeLearning(state);
      const transaction = db.transaction(STORE, "readwrite");
      await requestToPromise(transaction.objectStore(STORE).put(normalizeLearning(state), RECORD_KEY));
      return normalizeLearning(state);
    },
    close: async function () {
      const db = await database().catch(function () { return null; });
      databasePromise = null;
      if (db && typeof db.close === "function") db.close();
    }
  };
}

export { classLabel };
