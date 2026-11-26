import { LEARNING_DATABASE } from "./proofreading-learning.mjs";

// Browser copies of note metadata, note bodies, and semantic vectors.
// Sign-out and an Apple ID change delete these databases. There is no
// encrypted cache and no "remember this device" exception.
//
// Unsaved-edit drafts (`arbor.web.drafts.v1`, ARB-13) are wiped by the
// clearDrafts hook that app.js passes in as env.clearDrafts. Any localStorage,
// sessionStorage, or IndexedDB name with a draft/offline prefix below is also
// removed, so a draft store is cleared even if the hook fails.
//
// Cache Storage: every arbor-* cache is deleted except the app shell
// (arbor-shell-*) and the public runtime/model cache (arbor-runtime-*).
// Those two prefixes are also the cache names in sw.js. They must not be
// reused for note or CloudKit responses. Transformers.js opens
// "transformers-cache" for the same public model bytes; that name is not
// arbor-* and is left in place.

// Leftover keys from the removed Arbor knowledge-state sync. Sign-out still
// deletes them so an older visit cannot leave that plaintext behind.
const LEGACY_ARBOR_STATE_PREFIXES = [
  "arbor.web.arbor-state.v1.",
  "arbor.web.arbor-sync-pending.v1.",
  "arbor.web.arbor-sync-success.v1."
];

export const LIBRARY_CACHE_DATABASE = "arbor-web-library-cache";
export const SEMANTIC_VECTOR_DATABASE = "arbor-browser-semantic-index-arctic-e596f50-sentence-list-32w26-max32-even-v2";
export const UNDO_HISTORY_DATABASE = "arbor-web-undo-history";
export const ACCOUNT_RECORD_NAME_KEY = "arbor.web.account-id";
export const ACCOUNT_LOCAL_STORAGE_KEYS = ["arbor.web.open-tabs.v1", "arbor.web.account.v1"];
export const ACCOUNT_LOCAL_STORAGE_PREFIXES = ["arbor.web.note-history.v1::", "arbor.web.note-revisions.v1::", "arbor.web.shortcut-preferences.v1."];

export const DRAFT_NAME_PREFIXES = [
  "arbor.web.draft",
  "arbor.web.offline",
  "arbor.web.unsaved",
  "arbor.web.outbox",
  "arbor.web.pending-save",
  "arbor.web.pending-edit",
  "arbor-web-draft",
  "arbor-web-offline",
  "arbor-web-unsaved",
  "arbor-web-outbox"
];

const KNOWN_ACCOUNT_DATABASES = [LIBRARY_CACHE_DATABASE, SEMANTIC_VECTOR_DATABASE, UNDO_HISTORY_DATABASE, LEARNING_DATABASE];

// Keep these prefixes aligned with APP_SHELL_CACHE and RUNTIME_ASSET_CACHE in sw.js.
export const APP_SHELL_CACHE_PREFIX = "arbor-shell-";
export const RUNTIME_ASSET_CACHE_PREFIX = "arbor-runtime-";

export function cacheHoldsUserData(name) {
  const value = String(name || "");
  if (!value.startsWith("arbor-")) return false;
  if (value.startsWith(APP_SHELL_CACHE_PREFIX)) return false;
  if (value.startsWith(RUNTIME_ASSET_CACHE_PREFIX)) return false;
  return true;
}

export async function deleteUserDataCaches(cacheStorage) {
  if (!cacheStorage || typeof cacheStorage.keys !== "function" || typeof cacheStorage.delete !== "function") return [];
  const names = await cacheStorage.keys();
  const deleted = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (!cacheHoldsUserData(name)) continue;
    try {
      if (await cacheStorage.delete(name)) deleted.push(name);
    } catch (_) {}
  }
  return deleted;
}

export function isDraftOrOfflineName(name) {
  const value = String(name || "");
  return DRAFT_NAME_PREFIXES.some(function (prefix) { return value.startsWith(prefix); });
}

export function readStoredAccountRecordName(storage) {
  if (!storage) return "";
  try {
    return String(storage.getItem(ACCOUNT_RECORD_NAME_KEY) || "").trim();
  } catch (_) {
    return "";
  }
}

export function rememberAccountRecordName(storage, userRecordName) {
  if (!storage) return;
  const name = String(userRecordName || "").trim();
  try {
    if (name) storage.setItem(ACCOUNT_RECORD_NAME_KEY, name);
    else storage.removeItem(ACCOUNT_RECORD_NAME_KEY);
  } catch (_) {}
}

export function forgetAccountRecordName(storage) {
  rememberAccountRecordName(storage, "");
}

// A missing stored name cannot be tied to the signed-in Apple ID. Leftover
// plaintext from before this fix, from sign-out removing the marker, or from
// a delete that did not finish is cleared before any notes load. A matching
// name keeps the cache for that signed-in account.
export function accountNeedsClear(storedRecordName, signedInRecordName) {
  const signedIn = String(signedInRecordName || "").trim();
  if (!signedIn) return false;
  const stored = String(storedRecordName || "").trim();
  return !stored || stored !== signedIn;
}

function storageKeys(storage) {
  const keys = [];
  if (!storage) return keys;
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) keys.push(key);
    }
  } catch (_) {}
  return keys;
}

// Each open capture holds its own Web Lock until saved, discarded, or the
// document exits. A second tab can create a draft without editing the first.
function tryCaptureLock(locks, key) {
  return new Promise((resolve, reject) => {
    locks.request(key, { ifAvailable: true }, lock => {
      if (!lock) { resolve(null); return; }
      return new Promise(release => resolve(release));
    }).catch(reject);
  });
}

export async function claimCapture(storage, locks, accountKey, newID) {
  if (!locks || !accountKey) return null;
  const prefix = "arbor.web.draft.capture.v1." + encodeURIComponent(accountKey) + ".";
  const candidates = storageKeys(storage).filter(key => key.startsWith(prefix));
  const freshKey = prefix + newID;
  for (const key of [...candidates, freshKey]) {
    const release = await tryCaptureLock(locks, key);
    if (!release) continue;
    if (key === freshKey) return { key, release, stored: null };
    try {
      const stored = JSON.parse(storage.getItem(key));
      if (stored && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(stored.id) &&
          key === prefix + stored.id && typeof stored.text === "string" &&
          stored.text.trim() && stored.text.length <= 2000 && typeof stored.folder === "string") {
        return { key, release, stored };
      }
    } catch (_) { /* Leave unreadable data in place. */ }
    release();
  }
  return null;
}

export function clearDraftAndOfflineKeys(storage) {
  const removed = [];
  storageKeys(storage).forEach(function (key) {
    if (!isDraftOrOfflineName(key)) return;
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch (_) {}
  });
  return removed;
}

export function clearAccountLocalState(storage) {
  const removed = [];
  if (!storage) return removed;
  const knownKeys = new Set(ACCOUNT_LOCAL_STORAGE_KEYS);
  storageKeys(storage).forEach(function (key) {
    const accountLocalKey = knownKeys.has(key) ||
      LEGACY_ARBOR_STATE_PREFIXES.some(function (prefix) { return key.startsWith(prefix); }) ||
      ACCOUNT_LOCAL_STORAGE_PREFIXES.some(function (prefix) { return key.startsWith(prefix); });
    if (!accountLocalKey) return;
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch (_) {}
  });
  return removed;
}

async function invokeClearDrafts(env) {
  const hooks = [];
  function add(fn) {
    if (typeof fn === "function" && hooks.indexOf(fn) < 0) hooks.push(fn);
  }
  if (env) add(env.clearDrafts);
  for (let index = 0; index < hooks.length; index += 1) {
    try { await hooks[index](); } catch (_) {}
  }
}

export async function clearDraftAndOfflineStorage(env) {
  env = env || {};
  await invokeClearDrafts(env);
  return {
    localStorage: clearDraftAndOfflineKeys(env.localStorage),
    sessionStorage: clearDraftAndOfflineKeys(env.sessionStorage)
  };
}

function listDatabaseNames(indexedDB) {
  if (!indexedDB || typeof indexedDB.databases !== "function") return Promise.resolve([]);
  return Promise.resolve()
    .then(function () { return indexedDB.databases(); })
    .then(function (entries) {
      return (entries || []).map(function (entry) { return entry && entry.name; }).filter(Boolean);
    })
    .catch(function () { return []; });
}

function databasesToDelete(existingNames) {
  const names = KNOWN_ACCOUNT_DATABASES.slice();
  (existingNames || []).forEach(function (name) {
    if (isDraftOrOfflineName(name) && names.indexOf(name) < 0) names.push(name);
  });
  return names;
}

export function deleteIndexedDatabase(indexedDB, name, options) {
  const timeoutMs = options && options.timeoutMs != null ? options.timeoutMs : 8000;
  return new Promise(function (resolve) {
    if (!indexedDB || typeof indexedDB.deleteDatabase !== "function" || !name) {
      resolve({ name: name || "", deleted: false, blocked: false, reason: "unavailable" });
      return;
    }
    let settled = false;
    let blocked = false;
    let request = null;
    const finish = function (result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(function () {
      finish({ name: name, deleted: false, blocked: true, reason: "timeout" });
    }, timeoutMs);
    try {
      request = indexedDB.deleteDatabase(name);
    } catch (_) {
      finish({ name: name, deleted: false, blocked: false, reason: "error" });
      return;
    }
    request.onblocked = function () {
      blocked = true;
      if (settled) return;
      if (options && typeof options.onBlocked === "function") {
        try { options.onBlocked(name); } catch (_) {}
      }
    };
    request.onsuccess = function () {
      finish({ name: name, deleted: true, blocked: blocked });
    };
    request.onerror = function () {
      finish({ name: name, deleted: false, blocked: blocked, reason: "error" });
    };
  });
}

export async function clearAccountCaches(env) {
  env = env || {};
  // Drop the stored Apple ID first. A reload before deleteDatabase finishes
  // still looks like an unclaimed cache and clears again before notes load.
  forgetAccountRecordName(env.localStorage);
  await clearDraftAndOfflineStorage(env);
  clearAccountLocalState(env.localStorage);
  const cacheStorage = Object.prototype.hasOwnProperty.call(env, "caches")
    ? env.caches
    : (typeof caches !== "undefined" ? caches : null);
  try { await deleteUserDataCaches(cacheStorage); } catch (_) {}
  const names = databasesToDelete(await listDatabaseNames(env.indexedDB));
  // Terminate the search worker and close our library connection immediately
  // before deleteDatabase. An open connection makes the delete fire onblocked.
  try {
    if (typeof env.prepareForDelete === "function") await env.prepareForDelete();
  } catch (_) {}
  const results = [];
  for (let index = 0; index < names.length; index += 1) {
    results.push(await deleteIndexedDatabase(env.indexedDB, names[index], env));
  }
  return results;
}
