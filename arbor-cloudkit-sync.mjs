import {
  ARBOR_STATE_MAX_BYTES,
  ARBOR_SYNC_PENDING_PREFIX,
  ARBOR_SYNC_SUCCESS_PREFIX,
  ARBOR_STATE_STORAGE_PREFIX,
  ARBOR_STATE_VERSION,
  createArborStateStore,
  normalizeArborState
} from "./arbor-state.js";
import { CloudKitEncryptedWebServices, createCloudKitAuthTransport } from "./cloudkit-encrypted-web-services.mjs?v=arb-auth-cookie-20261124-b";

export const ARBOR_SYNC_ZONE = "ArborMetadataV1";
export const ARBOR_SYNC_RECORD_TYPE = "ArborMetadataState";
export const ARBOR_SYNC_RECORD_NAME = "state";
export const ARBOR_SYNC_FIELD = "payloadJSON";
export { ARBOR_SYNC_PENDING_PREFIX };
export const ARBOR_SYNC_ENVELOPE_FORMAT = "arbor-knowledge-state";
export const ARBOR_SYNC_ENVELOPE_VERSION = 1;
export const ARBOR_SYNC_MAX_ATTEMPTS = 4;

const encoder = new TextEncoder();
const stableJSON = value => JSON.stringify(value);

function accountValue(accountId) {
  const value = String(accountId == null ? "" : accountId).trim();
  if (!value || value.length > 256) throw new TypeError("A valid account ID is required for Arbor sync.");
  return value;
}

function pendingKey(accountId) {
  return ARBOR_SYNC_PENDING_PREFIX + encodeURIComponent(accountValue(accountId));
}

function successKey(accountId) {
  return ARBOR_SYNC_SUCCESS_PREFIX + encodeURIComponent(accountValue(accountId));
}

export function hasPendingArborSync(storage, accountId) {
  try { return Boolean(storage && storage.getItem(pendingKey(accountId))); }
  catch (_) { return false; }
}

async function stateFingerprint(state) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error("This browser cannot verify the locally synced Arbor revision.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(stableJSON(state)));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

function noteIds(state) {
  return Array.from(new Set(state.redactedNoteIds || []));
}

function canonicalWithRedactions(state, redactedNoteIds) {
  return normalizeArborState({
    ...state,
    redactedNoteIds
  });
}

function mergeIdentified(left, right, label) {
  const merged = new Map(left.map(item => [item.id, item]));
  right.forEach(item => {
    const existing = merged.get(item.id);
    if (existing && stableJSON(existing) !== stableJSON(item)) {
      throw new Error(`Arbor sync found conflicting ${label} content for the same ID.`);
    }
    if (!existing) merged.set(item.id, item);
  });
  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function mergeCorrections(left, right) {
  const merged = new Map(left.map(item => [item.id, item]));
  right.forEach(item => {
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, item);
      return;
    }
    const existingBase = { ...existing };
    const incomingBase = { ...item };
    delete existingBase.undo;
    delete incomingBase.undo;
    if (stableJSON(existingBase) !== stableJSON(incomingBase)) {
      throw new Error("Arbor sync found conflicting correction content for the same ID.");
    }
    if (existing.undo.status === "undone" && item.undo.status === "undone" &&
        stableJSON(existing.undo.restore) !== stableJSON(item.undo.restore)) {
      throw new Error("Arbor sync found incompatible undo records for the same correction.");
    }
    if (existing.undo.status !== "undone" && item.undo.status === "undone") merged.set(item.id, item);
    else if (existing.undo.status === "undone" && item.undo.status === "undone" && item.undo.at < existing.undo.at) merged.set(item.id, item);
  });
  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/** Union stable user state while preserving conflicts instead of choosing a winner. */
export function mergeArborStates(leftInput, rightInput) {
  const left = normalizeArborState(leftInput);
  const right = normalizeArborState(rightInput);
  const redactedNoteIds = Array.from(new Set([...noteIds(left), ...noteIds(right)])).sort();
  const leftSafe = canonicalWithRedactions(left, redactedNoteIds);
  const rightSafe = canonicalWithRedactions(right, redactedNoteIds);
  const snapshots = mergeIdentified(leftSafe.snapshots, rightSafe.snapshots, "snapshot");
  return normalizeArborState({
    version: ARBOR_STATE_VERSION,
    definitions: {
      arbors: mergeIdentified(leftSafe.definitions.arbors, rightSafe.definitions.arbors, "Arbor definition"),
      themes: mergeIdentified(leftSafe.definitions.themes, rightSafe.definitions.themes, "theme definition")
    },
    corrections: mergeCorrections(leftSafe.corrections, rightSafe.corrections),
    snapshots,
    redactedNoteIds
  });
}

export function getSnapshotBranches(stateOrSnapshots) {
  const snapshots = Array.isArray(stateOrSnapshots) ? stateOrSnapshots : stateOrSnapshots && stateOrSnapshots.snapshots || [];
  const parentIds = new Set(snapshots.flatMap(snapshot => snapshot.parentSnapshotIds || []));
  return snapshots.filter(snapshot => !parentIds.has(snapshot.id))
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function encodeArborSyncPayload(stateInput, maxBytes = ARBOR_STATE_MAX_BYTES) {
  const state = normalizeArborState(stateInput);
  const serialized = stableJSON({ format: ARBOR_SYNC_ENVELOPE_FORMAT, version: ARBOR_SYNC_ENVELOPE_VERSION, state });
  if (encoder.encode(serialized).byteLength > maxBytes) throw new RangeError("The merged Arbor state is too large to sync. Keep the local copy and reduce its size before retrying.");
  return serialized;
}

export function decodeArborSyncPayload(serialized) {
  if (typeof serialized !== "string" || encoder.encode(serialized).byteLength > ARBOR_STATE_MAX_BYTES) {
    throw new TypeError("The CloudKit Arbor payload is missing or exceeds its recovery limit.");
  }
  let payload;
  try { payload = JSON.parse(serialized); }
  catch (_) { throw new TypeError("The CloudKit Arbor payload is corrupt; the local copy was preserved."); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).sort().join(",") !== "format,state,version" ||
      payload.format !== ARBOR_SYNC_ENVELOPE_FORMAT || payload.version !== ARBOR_SYNC_ENVELOPE_VERSION) {
    throw new TypeError("The CloudKit Arbor payload uses an unsupported format; the local copy was preserved.");
  }
  return normalizeArborState(payload.state);
}

export function createArborCloudKitTransport({ containerIdentifier, environment, apiToken, fetchImpl, initialToken } = {}) {
  const transport = createCloudKitAuthTransport({ containerIdentifier, fetchImpl });
  if (initialToken) transport.authTokenStore.putToken(containerIdentifier, initialToken);
  return Object.freeze({
    authTokenStore: transport.authTokenStore,
    fetch: transport.fetch,
    clearToken: transport.clearToken,
    hasToken: transport.hasToken,
    createClient() {
      return new CloudKitEncryptedWebServices({
        containerIdentifier,
        environment,
        apiToken,
        authTokenStore: transport.authTokenStore,
        fetchImpl: transport.fetch
      });
    }
  });
}

function stateHasContent(state) {
  return Boolean(state.definitions.arbors.length || state.definitions.themes.length || state.corrections.length || state.snapshots.length || state.redactedNoteIds.length);
}

function missingRecord(error) {
  return ["UNKNOWN_ITEM", "RECORD_NOT_FOUND", "NOT_FOUND"].includes(error && error.code);
}

function isChangeConflict(error) {
  return ["SERVER_RECORD_CHANGED", "RECORD_CHANGED", "CONFLICT", "EXISTS", "RECORD_ALREADY_EXISTS", "DUPLICATE_RECORD"].includes(error && error.code);
}

function lifecycleListen(target, eventName, handler, removers) {
  if (!target || typeof target.addEventListener !== "function") return;
  target.addEventListener(eventName, handler);
  removers.push(() => target.removeEventListener(eventName, handler));
}

/** Account-scoped local-first sync. Every write is conditional and retries merge conflicts. */
export function createArborStateSync(options) {
  const settings = options || {};
  const accountId = accountValue(settings.accountId);
  const storage = settings.storage || null;
  const client = settings.client;
  if (!client) throw new TypeError("A CloudKit client is required for Arbor sync.");
  const isCurrent = typeof settings.isCurrent === "function" ? settings.isCurrent : () => true;
  const online = typeof settings.isOnline === "function" ? settings.isOnline : () => !globalThis.navigator || globalThis.navigator.onLine !== false;
  const sleep = typeof settings.sleep === "function" ? settings.sleep : milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const maxAttempts = Number.isInteger(settings.maxAttempts) ? Math.max(1, Math.min(settings.maxAttempts, 8)) : ARBOR_SYNC_MAX_ATTEMPTS;
  const zoneID = { zoneName: ARBOR_SYNC_ZONE };
  let disposed = false;
  let started = false;
  let syncing = null;
  let localRevision = 0;
  let retryTimer = null;
  const removers = [];

  function current() { return !disposed && isCurrent(); }
  function pending() { return hasPendingArborSync(storage, accountId); }
  function setPending(value) {
    if (!storage) return;
    try {
      if (value) storage.setItem(pendingKey(accountId), new Date().toISOString());
      else storage.removeItem(pendingKey(accountId));
    } catch (_) {}
  }
  async function markSynced(state) {
    if (!storage) return;
    let fingerprint;
    try { fingerprint = await stateFingerprint(state); }
    catch (_) { return; }
    try { storage.setItem(successKey(accountId), fingerprint); }
    catch (_) { return; }
    setPending(false);
  }
  function report(status, message) {
    if (typeof settings.onStatus === "function") {
      try { settings.onStatus({ accountId, status, message, pending: pending() }); } catch (_) {}
    }
  }
  function announceState() {
    if (typeof settings.onState === "function") {
      try { settings.onState(store.getState()); } catch (_) {}
    }
  }
  function schedule(delay = 0) {
    if (disposed || !started) return;
    globalThis.clearTimeout(retryTimer);
    retryTimer = globalThis.setTimeout(() => { sync().catch(() => {}); }, delay);
  }
  function localChange(state) {
    localRevision += 1;
    if (stateHasContent(state)) setPending(true);
    schedule();
  }

  const store = createArborStateStore(storage, accountId, { onChange: localChange });

  async function fetchRemote() {
    try {
      const record = await client.lookupRecord(ARBOR_SYNC_RECORD_NAME, [ARBOR_SYNC_FIELD], zoneID);
      const field = record && record.fields && record.fields[ARBOR_SYNC_FIELD];
      if (!field || typeof field.value !== "string") throw new TypeError("The CloudKit Arbor record has no encrypted payload; the local copy was preserved.");
      if (!record.recordChangeTag) throw new TypeError("The CloudKit Arbor record has no change tag; the local copy was preserved.");
      return { record, state: decodeArborSyncPayload(field.value) };
    } catch (error) {
      if (missingRecord(error)) return null;
      throw error;
    }
  }

  async function sync() {
    if (!current()) return false;
    if (syncing) return syncing;
    syncing = (async () => {
      if (!online()) {
        if (pending()) report("pending", "Arbor changes are saved on this browser and will sync when it is online.");
        return false;
      }
      if (!client || typeof client.ensureRecordZone !== "function") {
        report("pending", "Arbor sync is unavailable. Your local changes are preserved.");
        return false;
      }
      try {
        await client.ensureRecordZone(ARBOR_SYNC_ZONE);
        for (let attempt = 0; attempt < maxAttempts && current(); attempt += 1) {
          const revision = localRevision;
          const localState = store.getState();
          const remote = await fetchRemote();
          if (!current()) return false;

          if (!remote) {
            if (!stateHasContent(localState)) {
              if (revision === localRevision) await markSynced(localState);
              if (revision !== localRevision) { setPending(true); continue; }
              report("synced", "No Arbor state to sync yet.");
              return true;
            }
            try {
              await client.createEncryptedStringRecord(
                ARBOR_SYNC_RECORD_TYPE,
                ARBOR_SYNC_RECORD_NAME,
                ARBOR_SYNC_FIELD,
                encodeArborSyncPayload(localState),
                zoneID
              );
              if (revision !== localRevision) continue;
              await markSynced(localState);
              if (revision !== localRevision) { setPending(true); continue; }
              report("synced", "Arbor state is synced with iCloud.");
              announceState();
              return true;
            } catch (error) {
              if (isChangeConflict(error)) {
                if (attempt + 1 < maxAttempts) await sleep(Math.min(250 * (2 ** attempt), 2000));
                continue;
              }
              throw error;
            }
          }

          const merged = mergeArborStates(remote.state, localState);
          const remoteAlreadyCurrent = stableJSON(merged) === stableJSON(remote.state);
          let saved = remote.record;
          if (!remoteAlreadyCurrent) {
            try {
              saved = await client.updateEncryptedStringRecord(
                ARBOR_SYNC_RECORD_TYPE,
                ARBOR_SYNC_RECORD_NAME,
                ARBOR_SYNC_FIELD,
                encodeArborSyncPayload(merged),
                remote.record.recordChangeTag,
                zoneID
              );
            } catch (error) {
              if (isChangeConflict(error)) {
                if (attempt + 1 < maxAttempts) await sleep(Math.min(250 * (2 ** attempt), 2000));
                continue;
              }
              throw error;
            }
          }
          if (!current()) return false;
          if (revision !== localRevision) continue;
          store.replaceFromSync(merged);
          await markSynced(merged);
          if (revision !== localRevision) { setPending(true); continue; }
          report("synced", "Arbor state is synced with iCloud.");
          announceState();
          return true;
        }
        if (!current()) return false;
        setPending(true);
        report("pending", "Another device is editing Arbor state. Your local changes are preserved; sync will retry.");
        schedule(1800);
        return false;
      } catch (error) {
        if (!current()) return false;
        if (stateHasContent(store.getState())) setPending(true);
        const message = error && error.message || "Arbor could not sync. Your local copy is preserved.";
        report(pending() ? "pending" : "error", message);
        return false;
      }
    })().finally(() => { syncing = null; });
    return syncing;
  }

  function start() {
    if (started) return store;
    started = true;
    const retry = () => schedule();
    lifecycleListen(settings.lifecycleTarget || globalThis.window, "online", retry, removers);
    lifecycleListen(settings.lifecycleTarget || globalThis.window, "focus", retry, removers);
    lifecycleListen(settings.lifecycleTarget || globalThis.document, "visibilitychange", () => {
      if (!globalThis.document || globalThis.document.visibilityState !== "hidden") retry();
    }, removers);
    lifecycleListen(settings.lifecycleTarget || globalThis.window, "storage", event => {
      if (event && (event.key === ARBOR_STATE_STORAGE_PREFIX + encodeURIComponent(accountId) || event.key === pendingKey(accountId))) retry();
    }, removers);
    const initialState = store.getState();
    let priorSuccess = null;
    try { priorSuccess = storage && storage.getItem(successKey(accountId)); } catch (_) {}
    if (pending() || (stateHasContent(initialState) && !priorSuccess)) setPending(true);
    else if (stateHasContent(initialState) && storage) {
      stateFingerprint(initialState).then(fingerprint => {
        let currentFingerprint = null;
        try { currentFingerprint = storage.getItem(successKey(accountId)); } catch (_) {}
        if (current() && currentFingerprint !== fingerprint) {
          setPending(true);
          schedule();
        }
      }).catch(() => {
        if (current()) {
          setPending(true);
          schedule();
        }
      });
    }
    schedule();
    return store;
  }

  function dispose() {
    disposed = true;
    globalThis.clearTimeout(retryTimer);
    removers.splice(0).forEach(remove => { try { remove(); } catch (_) {} });
  }

  return Object.freeze({
    accountId,
    store,
    start,
    sync,
    dispose,
    hasPending: pending,
    get status() { return pending() ? "pending" : "synced"; }
  });
}
