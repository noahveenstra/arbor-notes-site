// Account-local Arbor definitions, explicit corrections, and historical
// overview references. Snapshots retain bounded exact evidence excerpts and
// optional versioned observations, but never complete note bodies. Deleted
// note excerpts and observations that cite them are redacted from history.

export const ARBOR_STATE_STORAGE_PREFIX = "arbor.web.arbor-state.v1.";
export const ARBOR_SYNC_PENDING_PREFIX = "arbor.web.arbor-sync-pending.v1.";
export const ARBOR_SYNC_SUCCESS_PREFIX = "arbor.web.arbor-sync-success.v1.";
export const ARBOR_STATE_VERSION = 2;
export const ARBOR_STATE_MAX_BYTES = 128 * 1024;
export const ARBOR_STATE_MAX_CITATION_EXCERPT_CHARS = 1200;
export const ARBOR_STATE_MAX_OBSERVATION_CHARS = 500;

const LIMITS = Object.freeze({
  arbors: 50,
  themes: 500,
  corrections: 1000,
  snapshots: 50,
  citationsPerSnapshot: 100,
  observationsPerSnapshot: 20,
  sourceRevisionsPerSnapshot: 200,
  definitionsPerCorrection: 20,
  redactedNoteIds: 10000
});

const CORRECTION_KINDS = new Set(["rename", "hide", "move", "merge", "split"]);
const SOURCE_TYPES = new Set(["writer", "attributed", "saved-source", "reference-only", "unknown"]);

function isObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, required, optional, path) {
  if (!isObject(value)) throw new TypeError(path + " must be an object");
  const allowed = new Set(required.concat(optional || []));
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw new TypeError(path + " is missing " + key);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(path + " contains unsupported field " + key);
  }
}

function stringValue(value, path, maxLength, options) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(path + " must be a non-empty string of at most " + maxLength + " characters");
  }
  if (!(options && options.allowWhitespace) && value.trim() !== value) throw new TypeError(path + " must not have leading or trailing whitespace");
  if (/[\u0000-\u001F\u007F]/.test(value)) throw new TypeError(path + " contains a control character");
  return value;
}

function excerptValue(value, path) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > ARBOR_STATE_MAX_CITATION_EXCERPT_CHARS) {
    throw new TypeError(path + " must be a non-empty exact excerpt of at most " + ARBOR_STATE_MAX_CITATION_EXCERPT_CHARS + " characters");
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) throw new TypeError(path + " contains a control character");
  return value;
}

function nullableId(value, path) {
  return value === null ? null : stringValue(value, path, 160);
}

function dateValue(value, path) {
  const date = stringValue(value, path, 40);
  const time = Date.parse(date);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== date) throw new TypeError(path + " must be a canonical ISO timestamp");
  return date;
}

function idList(value, path, maxLength) {
  if (!Array.isArray(value) || value.length > maxLength) throw new TypeError(path + " must be an array of at most " + maxLength + " IDs");
  const result = value.map((item, index) => stringValue(item, path + "[" + index + "]", 160));
  if (new Set(result).size !== result.length) throw new TypeError(path + " must contain unique IDs");
  return result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.keys(value).forEach(key => deepFreeze(value[key]));
  return Object.freeze(value);
}

function serializedBytes(value) {
  const text = JSON.stringify(value);
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  return text.length * 2;
}

function requireCount(value, limit, path) {
  if (!Array.isArray(value) || value.length > limit) throw new RangeError(path + " exceeds its item limit");
  return value;
}

function normalizeArbor(value, path) {
  exactKeys(value, ["id", "label", "createdAt", "updatedAt"], [], path);
  return {
    id: stringValue(value.id, path + ".id", 160),
    label: stringValue(value.label, path + ".label", 120, { allowWhitespace: true }),
    createdAt: dateValue(value.createdAt, path + ".createdAt"),
    updatedAt: dateValue(value.updatedAt, path + ".updatedAt")
  };
}

function normalizeTheme(value, path) {
  exactKeys(value, ["id", "arborId", "parentThemeId", "label", "createdAt", "updatedAt"], [], path);
  return {
    id: stringValue(value.id, path + ".id", 160),
    arborId: stringValue(value.arborId, path + ".arborId", 160),
    parentThemeId: nullableId(value.parentThemeId, path + ".parentThemeId"),
    label: stringValue(value.label, path + ".label", 120, { allowWhitespace: true }),
    createdAt: dateValue(value.createdAt, path + ".createdAt"),
    updatedAt: dateValue(value.updatedAt, path + ".updatedAt")
  };
}

function normalizeDefinitionSummary(value, path) {
  exactKeys(value, ["id", "arborId", "parentThemeId", "label"], [], path);
  return {
    id: stringValue(value.id, path + ".id", 160),
    arborId: stringValue(value.arborId, path + ".arborId", 160),
    parentThemeId: nullableId(value.parentThemeId, path + ".parentThemeId"),
    label: stringValue(value.label, path + ".label", 120, { allowWhitespace: true })
  };
}

function normalizeRenameOrHide(value, kind, path) {
  exactKeys(value.target, ["entityType", "id"], [], path + ".target");
  if (!["arbor", "theme"].includes(value.target.entityType)) throw new TypeError(path + ".target.entityType is invalid");
  const target = { entityType: value.target.entityType, id: stringValue(value.target.id, path + ".target.id", 160) };
  if (kind === "rename") {
    exactKeys(value.before, ["label"], [], path + ".before");
    exactKeys(value.after, ["label"], [], path + ".after");
    return {
      target,
      before: { label: stringValue(value.before.label, path + ".before.label", 120, { allowWhitespace: true }) },
      after: { label: stringValue(value.after.label, path + ".after.label", 120, { allowWhitespace: true }) }
    };
  }
  exactKeys(value.before, ["hidden"], [], path + ".before");
  exactKeys(value.after, ["hidden"], [], path + ".after");
  if (typeof value.before.hidden !== "boolean" || typeof value.after.hidden !== "boolean") throw new TypeError(path + " hidden values must be booleans");
  return { target, before: { hidden: value.before.hidden }, after: { hidden: value.after.hidden } };
}

function normalizeMove(value, path) {
  exactKeys(value.target, ["noteId", "passageId"], [], path + ".target");
  const normalizePlacement = (placement, side) => {
    exactKeys(placement, ["themeIds"], [], path + "." + side);
    return { themeIds: idList(placement.themeIds, path + "." + side + ".themeIds", 64) };
  };
  return {
    target: {
      noteId: stringValue(value.target.noteId, path + ".target.noteId", 160),
      passageId: stringValue(value.target.passageId, path + ".target.passageId", 160)
    },
    before: normalizePlacement(value.before, "before"),
    after: normalizePlacement(value.after, "after")
  };
}

function normalizeMergeOrSplit(value, kind, path) {
  exactKeys(value.target, ["arborId", "definitionIds"], [], path + ".target");
  const arborId = stringValue(value.target.arborId, path + ".target.arborId", 160);
  const definitionIds = idList(value.target.definitionIds, path + ".target.definitionIds", LIMITS.definitionsPerCorrection);
  const before = requireCount(value.before, LIMITS.definitionsPerCorrection, path + ".before")
    .map((item, index) => normalizeDefinitionSummary(item, path + ".before[" + index + "]"));
  const after = requireCount(value.after, LIMITS.definitionsPerCorrection, path + ".after")
    .map((item, index) => normalizeDefinitionSummary(item, path + ".after[" + index + "]"));
  if (new Set(before.map(item => item.id)).size !== before.length || new Set(after.map(item => item.id)).size !== after.length) throw new TypeError(path + " definition IDs must be unique");
  if (before.some(item => item.arborId !== arborId) || after.some(item => item.arborId !== arborId)) throw new TypeError(path + " definitions must belong to the target Arbor");
  if (kind === "merge" && (before.length < 2 || after.length !== 1)) throw new TypeError(path + " merge must combine multiple definitions into one");
  if (kind === "split" && (before.length !== 1 || after.length < 2)) throw new TypeError(path + " split must expand one definition into multiple definitions");
  if (after.some(item => before.some(previous => previous.id === item.id))) throw new TypeError(path + " merge or split must create new definition IDs");
  if (!before.every(item => definitionIds.includes(item.id)) || definitionIds.length !== before.length) throw new TypeError(path + " target IDs must match the prior definitions");
  return { target: { arborId, definitionIds }, before, after };
}

function normalizeCorrection(value, path) {
  exactKeys(value, ["id", "kind", "target", "before", "after", "createdAt", "undo"], [], path);
  const kind = stringValue(value.kind, path + ".kind", 20);
  if (!CORRECTION_KINDS.has(kind)) throw new TypeError(path + ".kind is unsupported");
  let parts;
  if (kind === "rename" || kind === "hide") parts = normalizeRenameOrHide(value, kind, path);
  else if (kind === "move") parts = normalizeMove(value, path);
  else parts = normalizeMergeOrSplit(value, kind, path);
  exactKeys(value.undo, ["status", "restore", "at"], [], path + ".undo");
  const status = stringValue(value.undo.status, path + ".undo.status", 20);
  if (!["available", "undone"].includes(status)) throw new TypeError(path + ".undo.status is invalid");
  const restore = kind === "rename" || kind === "hide"
    ? normalizeRenameOrHide({ target: parts.target, before: value.undo.restore, after: parts.after }, kind, path + ".undo.restore").before
    : kind === "move"
      ? normalizeMove({ target: parts.target, before: value.undo.restore, after: parts.after }, path + ".undo.restore").before
      : normalizeMergeOrSplit({ target: parts.target, before: value.undo.restore, after: parts.after }, kind, path + ".undo.restore").before;
  if (JSON.stringify(restore) !== JSON.stringify(parts.before)) throw new TypeError(path + ".undo.restore must match the prior value");
  const at = value.undo.at === null ? null : dateValue(value.undo.at, path + ".undo.at");
  if ((status === "available") !== (at === null)) throw new TypeError(path + ".undo status and timestamp disagree");
  return {
    id: stringValue(value.id, path + ".id", 160),
    kind,
    target: parts.target,
    before: parts.before,
    after: parts.after,
    createdAt: dateValue(value.createdAt, path + ".createdAt"),
    undo: { status, restore, at }
  };
}

function normalizeSourceRevision(value, path) {
  exactKeys(value, ["noteId", "revisionId"], [], path);
  return {
    noteId: stringValue(value.noteId, path + ".noteId", 160),
    revisionId: stringValue(value.revisionId, path + ".revisionId", 160)
  };
}

function normalizeThemePath(value, path) {
  exactKeys(value, ["themeIds", "labels"], [], path);
  const themeIds = idList(value.themeIds, path + ".themeIds", 64);
  if (!themeIds.length || !Array.isArray(value.labels) || value.labels.length !== themeIds.length) throw new TypeError(path + " must have matching theme IDs and labels");
  return {
    themeIds,
    labels: value.labels.map((label, index) => stringValue(label, path + ".labels[" + index + "]", 120, { allowWhitespace: true }))
  };
}

function normalizeCitation(value, path) {
  exactKeys(value, ["id", "noteId", "sourceRevisionId", "passageId", "themeIds", "sourceType"], ["excerpt", "attribution", "resolutionStatus"], path);
  const sourceType = stringValue(value.sourceType, path + ".sourceType", 32);
  if (!SOURCE_TYPES.has(sourceType)) throw new TypeError(path + ".sourceType is invalid");
  const resolutionStatus = value.resolutionStatus === undefined ? "resolved" : stringValue(value.resolutionStatus, path + ".resolutionStatus", 16);
  if (!["resolved", "stale", "ambiguous", "archived", "deleted"].includes(resolutionStatus)) throw new TypeError(path + ".resolutionStatus is invalid");
  const hasExcerpt = Object.prototype.hasOwnProperty.call(value, "excerpt");
  if (resolutionStatus === "deleted" && hasExcerpt) throw new TypeError(path + " must discard excerpts for deleted notes");
  if (resolutionStatus !== "deleted" && !hasExcerpt) throw new TypeError(path + ".excerpt is required unless the source is deleted");
  const citation = {
    id: stringValue(value.id, path + ".id", 160),
    noteId: stringValue(value.noteId, path + ".noteId", 160),
    sourceRevisionId: stringValue(value.sourceRevisionId, path + ".sourceRevisionId", 160),
    passageId: stringValue(value.passageId, path + ".passageId", 160),
    themeIds: idList(value.themeIds, path + ".themeIds", 64),
    sourceType
  };
  if (hasExcerpt) citation.excerpt = excerptValue(value.excerpt, path + ".excerpt");
  if (Object.prototype.hasOwnProperty.call(value, "attribution")) citation.attribution = stringValue(value.attribution, path + ".attribution", 120, { allowWhitespace: true });
  if (sourceType === "attributed" && !citation.attribution && resolutionStatus !== "deleted") throw new TypeError(path + ".attribution is required for attributed source voice");
  if (Object.prototype.hasOwnProperty.call(value, "resolutionStatus")) citation.resolutionStatus = resolutionStatus;
  return citation;
}

function normalizeObservation(value, path, citationIds) {
  exactKeys(value, ["id", "text", "citationIds"], [], path);
  const ids = idList(value.citationIds, path + ".citationIds", LIMITS.citationsPerSnapshot);
  if (!ids.length || ids.some(id => !citationIds.has(id))) throw new TypeError(path + ".citationIds must reference citations in this snapshot");
  return {
    id: stringValue(value.id, path + ".id", 160),
    text: stringValue(value.text, path + ".text", ARBOR_STATE_MAX_OBSERVATION_CHARS, { allowWhitespace: true }),
    citationIds: ids
  };
}

function normalizeSnapshot(value, path) {
  exactKeys(value, ["id", "createdAt", "requestedAsOf", "sourceRevisionIds", "evidenceSetFingerprint", "themePaths", "citations", "rendering", "correctionIds"], ["derived", "parentSnapshotIds"], path);
  exactKeys(value.rendering, ["method", "version"], [], path + ".rendering");
  if (!Array.isArray(value.themePaths) || value.themePaths.length > 100) throw new RangeError(path + ".themePaths exceeds its item limit");
  if (!Array.isArray(value.citations) || value.citations.length > LIMITS.citationsPerSnapshot) throw new RangeError(path + ".citations exceeds its item limit");
  const sourceRevisionIds = requireCount(value.sourceRevisionIds, LIMITS.sourceRevisionsPerSnapshot, path + ".sourceRevisionIds")
    .map((item, index) => normalizeSourceRevision(item, path + ".sourceRevisionIds[" + index + "]"));
  const revisions = new Set(sourceRevisionIds.map(item => item.noteId + "\u0000" + item.revisionId));
  if (revisions.size !== sourceRevisionIds.length) throw new TypeError(path + ".sourceRevisionIds must be unique");
  const citations = value.citations.map((item, index) => normalizeCitation(item, path + ".citations[" + index + "]"));
  const citationIds = new Set(citations.map(item => item.id));
  if (citationIds.size !== citations.length) throw new TypeError(path + ".citations IDs must be unique");
  if (citations.some(item => !revisions.has(item.noteId + "\u0000" + item.sourceRevisionId))) throw new TypeError(path + ".citations must reference a listed source revision");
  const snapshot = {
    id: stringValue(value.id, path + ".id", 160),
    createdAt: dateValue(value.createdAt, path + ".createdAt"),
    requestedAsOf: dateValue(value.requestedAsOf, path + ".requestedAsOf"),
    sourceRevisionIds,
    evidenceSetFingerprint: stringValue(value.evidenceSetFingerprint, path + ".evidenceSetFingerprint", 128),
    themePaths: value.themePaths.map((item, index) => normalizeThemePath(item, path + ".themePaths[" + index + "]")),
    citations,
    rendering: {
      method: stringValue(value.rendering.method, path + ".rendering.method", 80),
      version: stringValue(value.rendering.version, path + ".rendering.version", 80)
    },
    correctionIds: idList(value.correctionIds, path + ".correctionIds", LIMITS.corrections),
    parentSnapshotIds: idList(value.parentSnapshotIds === undefined ? [] : value.parentSnapshotIds, path + ".parentSnapshotIds", LIMITS.snapshots)
  };
  if (Object.prototype.hasOwnProperty.call(value, "derived")) {
    exactKeys(value.derived, ["version", "observations"], [], path + ".derived");
    if (!Array.isArray(value.derived.observations) || value.derived.observations.length > LIMITS.observationsPerSnapshot) {
      throw new RangeError(path + ".derived.observations exceeds its item limit");
    }
    const observations = value.derived.observations.map((item, index) => normalizeObservation(item, path + ".derived.observations[" + index + "]", citationIds));
    if (new Set(observations.map(item => item.id)).size !== observations.length) throw new TypeError(path + ".derived observation IDs must be unique");
    snapshot.derived = {
      version: stringValue(value.derived.version, path + ".derived.version", 120),
      observations
    };
  }
  return snapshot;
}

function migrateState(value) {
  if (!isObject(value)) throw new TypeError("state must be an object");
  if (value.version === 1) {
    exactKeys(value, ["version", "definitions", "corrections", "snapshots"], [], "state");
    let parentSnapshotId = null;
    const redactedNoteIds = new Set();
    const snapshots = value.snapshots.map(snapshot => {
      (snapshot.citations || []).forEach(citation => {
        if (citation && citation.resolutionStatus === "deleted" && typeof citation.noteId === "string") redactedNoteIds.add(citation.noteId);
      });
      const migrated = { ...snapshot, parentSnapshotIds: parentSnapshotId ? [parentSnapshotId] : [] };
      parentSnapshotId = snapshot.id;
      return migrated;
    });
    return { version: ARBOR_STATE_VERSION, definitions: value.definitions, corrections: value.corrections, snapshots, redactedNoteIds: Array.from(redactedNoteIds) };
  }
  if (value.version !== ARBOR_STATE_VERSION) throw new TypeError("Unsupported Arbor state version");
  return value;
}

function redactStateForTombstones(state) {
  const redacted = new Set(state.redactedNoteIds);
  state.snapshots.forEach(snapshot => {
    const redactedCitationIds = new Set();
    snapshot.citations.forEach(citation => {
      if (!redacted.has(citation.noteId)) return;
      redactedCitationIds.add(citation.id);
      delete citation.excerpt;
      delete citation.attribution;
      citation.resolutionStatus = "deleted";
    });
    if (redactedCitationIds.size && snapshot.derived) {
      snapshot.derived.observations = snapshot.derived.observations.filter(observation =>
        !observation.citationIds.some(id => redactedCitationIds.has(id))
      );
    }
  });
  return state;
}

export function normalizeArborState(input) {
  const value = migrateState(input);
  exactKeys(value, ["version", "definitions", "corrections", "snapshots", "redactedNoteIds"], [], "state");
  if (value.version !== ARBOR_STATE_VERSION) throw new TypeError("Unsupported Arbor state version");
  exactKeys(value.definitions, ["arbors", "themes"], [], "state.definitions");
  const arbors = requireCount(value.definitions.arbors, LIMITS.arbors, "state.definitions.arbors")
    .map((item, index) => normalizeArbor(item, "state.definitions.arbors[" + index + "]"));
  const themes = requireCount(value.definitions.themes, LIMITS.themes, "state.definitions.themes")
    .map((item, index) => normalizeTheme(item, "state.definitions.themes[" + index + "]"));
  if (new Set(arbors.map(item => item.id)).size !== arbors.length) throw new TypeError("Arbor IDs must be unique");
  if (new Set(themes.map(item => item.id)).size !== themes.length) throw new TypeError("Theme IDs must be unique");
  const arborIds = new Set(arbors.map(item => item.id));
  const themesById = new Map(themes.map(item => [item.id, item]));
  themes.forEach(theme => {
    if (!arborIds.has(theme.arborId)) throw new TypeError("Every theme must reference an existing Arbor");
    if (theme.parentThemeId !== null) {
      const parent = themesById.get(theme.parentThemeId);
      if (!parent || parent.arborId !== theme.arborId || parent.id === theme.id) throw new TypeError("Theme parent must be a different theme in the same Arbor");
    }
  });
  const corrections = requireCount(value.corrections, LIMITS.corrections, "state.corrections")
    .map((item, index) => normalizeCorrection(item, "state.corrections[" + index + "]"));
  const snapshots = requireCount(value.snapshots, LIMITS.snapshots, "state.snapshots")
    .map((item, index) => normalizeSnapshot(item, "state.snapshots[" + index + "]"));
  const redactedNoteIds = idList(value.redactedNoteIds, "state.redactedNoteIds", LIMITS.redactedNoteIds);
  if (new Set(corrections.map(item => item.id)).size !== corrections.length) throw new TypeError("Correction IDs must be unique");
  if (new Set(snapshots.map(item => item.id)).size !== snapshots.length) throw new TypeError("Snapshot IDs must be unique");
  const snapshotIds = new Set(snapshots.map(item => item.id));
  const snapshotsById = new Map(snapshots.map(item => [item.id, item]));
  snapshots.forEach(snapshot => {
    if (snapshot.parentSnapshotIds.some(id => !snapshotIds.has(id) || id === snapshot.id)) throw new TypeError("Snapshot parents must reference other saved snapshots");
  });
  const visiting = new Set();
  const visited = new Set();
  const visitSnapshot = id => {
    if (visiting.has(id)) throw new TypeError("Snapshot history cannot contain a cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    snapshotsById.get(id).parentSnapshotIds.forEach(visitSnapshot);
    visiting.delete(id);
    visited.add(id);
  };
  snapshots.forEach(snapshot => visitSnapshot(snapshot.id));
  const state = redactStateForTombstones({ version: ARBOR_STATE_VERSION, definitions: { arbors, themes }, corrections, snapshots, redactedNoteIds });
  if (serializedBytes(state) > ARBOR_STATE_MAX_BYTES) throw new RangeError("Arbor state exceeds the storage limit");
  return state;
}

function emptyState() {
  return { version: ARBOR_STATE_VERSION, definitions: { arbors: [], themes: [] }, corrections: [], snapshots: [], redactedNoteIds: [] };
}

function accountIdValue(accountId) {
  const value = String(accountId == null ? "" : accountId).trim();
  if (!value || value.length > 256) throw new TypeError("A valid account ID is required");
  return value;
}

export function arborStateStorageKey(accountId) {
  return ARBOR_STATE_STORAGE_PREFIX + encodeURIComponent(accountIdValue(accountId));
}

function loadStateAtKey(storage, key) {
  if (!storage || typeof storage.getItem !== "function") return emptyState();
  const serialized = storage.getItem(key);
  if (!serialized) return emptyState();
  if (serialized.length > ARBOR_STATE_MAX_BYTES) throw new RangeError("Saved Arbor state exceeds its recovery limit");
  let parsed;
  try { parsed = JSON.parse(serialized); }
  catch (_) { throw new TypeError("Saved Arbor state is corrupt and was preserved without overwriting it"); }
  try { return normalizeArborState(parsed); }
  catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      error.message = "Saved Arbor state could not be read and was preserved without overwriting it: " + error.message;
    }
    throw error;
  }
}

export function loadArborState(storage, accountId) {
  return loadStateAtKey(storage, arborStateStorageKey(accountId));
}

export class ArborStateStore {
  #storage;
  #key;
  #now;
  #state;
  #onChange;

  constructor(storage, accountId, options) {
    this.#storage = storage || null;
    this.#key = arborStateStorageKey(accountIdValue(accountId));
    this.#now = options && typeof options.now === "function" ? options.now : () => new Date().toISOString();
    this.#onChange = options && typeof options.onChange === "function" ? options.onChange : null;
    this.#state = loadArborState(this.#storage, accountId);
    if (this.#storage && typeof this.#storage.setItem === "function") {
      const stored = this.#storage.getItem(this.#key);
      if (stored && stored !== JSON.stringify(this.#state)) this.#storage.setItem(this.#key, JSON.stringify(this.#state));
    }
  }

  #refresh() {
    if (this.#storage && typeof this.#storage.getItem === "function") this.#state = loadStateAtKey(this.#storage, this.#key);
  }

  #change(mutator) {
    this.#refresh();
    const next = normalizeArborState(mutator(clone(this.#state)) || this.#state);
    if (this.#storage && typeof this.#storage.setItem === "function") {
      const serialized = JSON.stringify(next);
      if (serializedBytes(next) > ARBOR_STATE_MAX_BYTES) throw new RangeError("Arbor state exceeds the storage limit");
      this.#storage.setItem(this.#key, serialized);
    }
    this.#state = next;
    if (this.#onChange) {
      try { this.#onChange(deepFreeze(clone(next))); } catch (_) {}
    }
    return this.getState();
  }

  replaceFromSync(value) {
    const next = normalizeArborState(value);
    const serialized = JSON.stringify(next);
    if (serializedBytes(next) > ARBOR_STATE_MAX_BYTES) throw new RangeError("Arbor state exceeds the storage limit");
    if (this.#storage && typeof this.#storage.setItem === "function") this.#storage.setItem(this.#key, serialized);
    this.#state = next;
    return this.getState();
  }

  getState() {
    this.#refresh();
    return deepFreeze(clone(this.#state));
  }

  addArbor(definition) {
    exactKeys(definition, ["id", "label"], ["createdAt"], "Arbor definition");
    const createdAt = dateValue(definition.createdAt || this.#now(), "Arbor definition.createdAt");
    const arbor = { id: stringValue(definition.id, "Arbor definition.id", 160), label: stringValue(definition.label, "Arbor definition.label", 120, { allowWhitespace: true }), createdAt, updatedAt: createdAt };
    return this.#change(state => { state.definitions.arbors.push(arbor); return state; });
  }

  addTheme(definition) {
    exactKeys(definition, ["id", "arborId", "label"], ["parentThemeId", "createdAt"], "Theme definition");
    const createdAt = dateValue(definition.createdAt || this.#now(), "Theme definition.createdAt");
    const theme = {
      id: stringValue(definition.id, "Theme definition.id", 160),
      arborId: stringValue(definition.arborId, "Theme definition.arborId", 160),
      parentThemeId: definition.parentThemeId === undefined ? null : nullableId(definition.parentThemeId, "Theme definition.parentThemeId"),
      label: stringValue(definition.label, "Theme definition.label", 120, { allowWhitespace: true }),
      createdAt,
      updatedAt: createdAt
    };
    return this.#change(state => { state.definitions.themes.push(theme); return state; });
  }

  recordCorrection(correction) {
    exactKeys(correction, ["id", "kind", "target", "before", "after"], ["createdAt"], "Correction");
    const kind = stringValue(correction.kind, "Correction.kind", 20);
    if (!CORRECTION_KINDS.has(kind)) throw new TypeError("Correction.kind is unsupported");
    const createdAt = dateValue(correction.createdAt || this.#now(), "Correction.createdAt");
    const candidate = {
      ...correction,
      createdAt,
      undo: { status: "available", restore: correction.before, at: null }
    };
    const normalized = normalizeCorrection(candidate, "Correction");
    return this.#change(state => { state.corrections.push(normalized); return state; });
  }

  undoCorrection(correctionId) {
    const id = stringValue(correctionId, "Correction ID", 160);
    return this.#change(state => {
      const correction = state.corrections.find(item => item.id === id);
      if (!correction) throw new RangeError("Correction was not found");
      if (correction.undo.status !== "available") throw new RangeError("Correction has already been undone");
      correction.undo = { status: "undone", restore: clone(correction.before), at: dateValue(this.#now(), "Undo timestamp") };
      return state;
    });
  }

  appendSnapshot(snapshot) {
    const normalized = normalizeSnapshot(snapshot, "Snapshot");
    return this.#change(state => {
      if (state.snapshots.some(item => item.id === normalized.id)) throw new RangeError("Snapshot IDs are immutable and must be unique");
      state.snapshots.push(normalized);
      return state;
    });
  }

  readSnapshot(snapshotId) {
    this.#refresh();
    const snapshot = this.#state.snapshots.find(item => item.id === snapshotId);
    return snapshot ? deepFreeze(clone(snapshot)) : null;
  }

  listSnapshots() {
    this.#refresh();
    return deepFreeze(clone(this.#state.snapshots));
  }

  activeCorrections() {
    this.#refresh();
    return deepFreeze(clone(this.#state.corrections.filter(item => item.undo.status === "available")));
  }

  redactDeletedNote(noteId) {
    const deletedNoteId = stringValue(noteId, "Deleted note ID", 160);
    let redactedCitationCount = 0;
    let removedObservationCount = 0;
    this.#change(state => {
      if (!state.redactedNoteIds.includes(deletedNoteId)) state.redactedNoteIds.push(deletedNoteId);
      state.snapshots.forEach(snapshot => {
        const redactedIds = new Set();
        snapshot.citations.forEach(citation => {
          if (citation.noteId !== deletedNoteId) return;
          redactedIds.add(citation.id);
          if (citation.resolutionStatus !== "deleted"
              || Object.prototype.hasOwnProperty.call(citation, "excerpt")
              || Object.prototype.hasOwnProperty.call(citation, "attribution")) {
            delete citation.excerpt;
            delete citation.attribution;
            citation.resolutionStatus = "deleted";
            redactedCitationCount += 1;
          }
        });
        if (redactedIds.size && snapshot.derived) {
          const retained = snapshot.derived.observations.filter(observation => {
            const citesDeletedNote = observation.citationIds.some(id => redactedIds.has(id));
            if (citesDeletedNote) removedObservationCount += 1;
            return !citesDeletedNote;
          });
          snapshot.derived.observations = retained;
        }
      });
      return state;
    });
    return Object.freeze({ redactedCitationCount, removedObservationCount });
  }

  clear() {
    if (this.#storage && typeof this.#storage.removeItem === "function") this.#storage.removeItem(this.#key);
    this.#state = emptyState();
    return this.getState();
  }
}

export function createArborStateStore(storage, accountId, options) {
  return new ArborStateStore(storage, accountId, options);
}
