// Builds a bounded, evidence-only packet from current note bodies, stable
// passage anchors, and explicit user-managed membership/voice metadata.
// Note bodies are read only to resolve anchors; they are never copied into the
// result. This module does not generate or persist observations.

import { PASSAGE_ANCHOR_VERSION, PASSAGE_OFFSET_UNIT, resolvePassageAnchor } from "./passage-anchor.js";

export const ARBOR_EVIDENCE_PACKET_VERSION = 1;

const DEFAULT_LIMITS = Object.freeze({
  items: 40,
  excerptCodeUnits: 1200,
  packetBytes: 96 * 1024
});

const HARD_LIMITS = Object.freeze({
  inputItems: 10000,
  packetItems: 100,
  excerptCodeUnits: 2400,
  packetBytes: 96 * 1024,
  membershipsPerPassage: 16,
  themeDepth: 12
});

const SOURCE_TYPES = new Set(["writer", "attributed", "saved-source", "reference-only", "unknown"]);

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value, path) {
  if (!isRecord(value)) throw new TypeError(path + " must be an object");
  return value;
}

function requireString(value, path, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength || value.trim() !== value) {
    throw new TypeError(path + " must be a non-empty string of at most " + maxLength + " characters");
  }
  if (/[\u0000-\u001F\u007F]/.test(value)) throw new TypeError(path + " contains a control character");
  return value;
}

function optionalString(value, path, maxLength) {
  return value == null ? null : requireString(value, path, maxLength);
}

function canonicalDate(value, path, optional) {
  if (value == null && optional) return null;
  const date = requireString(value, path, 40);
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== date) {
    throw new TypeError(path + " must be a canonical ISO timestamp");
  }
  return date;
}

function tupleKey(noteId, passageId) {
  return JSON.stringify([noteId, passageId]);
}

function normalizeLimits(options) {
  const requested = options.limits || {};
  requireRecord(requested, "limits");
  const read = (key, fallback, maximum) => {
    if (!Object.prototype.hasOwnProperty.call(requested, key)) return fallback;
    const value = requested[key];
    if (!Number.isInteger(value) || value < 1) throw new RangeError("limits." + key + " must be a positive integer");
    return Math.min(value, maximum);
  };
  return {
    items: read("items", DEFAULT_LIMITS.items, HARD_LIMITS.packetItems),
    excerptCodeUnits: read("excerptCodeUnits", DEFAULT_LIMITS.excerptCodeUnits, HARD_LIMITS.excerptCodeUnits),
    packetBytes: read("packetBytes", DEFAULT_LIMITS.packetBytes, HARD_LIMITS.packetBytes)
  };
}

function normalizeNote(value, index) {
  const path = "notes[" + index + "]";
  requireRecord(value, path);
  const noteId = requireString(value.noteId, path + ".noteId", 160);
  const exists = value.exists !== false && value.deleted !== true;
  if (exists && typeof value.body !== "string") throw new TypeError(path + ".body must be a string for a current note");
  if (value.archived != null && typeof value.archived !== "boolean") throw new TypeError(path + ".archived must be a boolean");
  return {
    noteId,
    body: exists ? value.body : "",
    exists,
    archived: value.archived === true,
    createdAt: canonicalDate(value.createdAt, path + ".createdAt", true),
    editedAt: canonicalDate(value.editedAt, path + ".editedAt", true)
  };
}

function normalizeMembership(value, index) {
  const path = "memberships[" + index + "]";
  requireRecord(value, path);
  const noteId = requireString(value.noteId, path + ".noteId", 160);
  const passageId = requireString(value.passageId, path + ".passageId", 160);
  if (value.managedBy !== "user") throw new TypeError(path + ".managedBy must be user");
  const themePath = requireRecord(value.themePath, path + ".themePath");
  if (!Array.isArray(themePath.themeIds) || !Array.isArray(themePath.labels) || !themePath.themeIds.length || themePath.themeIds.length !== themePath.labels.length) {
    throw new TypeError(path + ".themePath must have matching non-empty themeIds and labels");
  }
  if (themePath.themeIds.length > HARD_LIMITS.themeDepth) throw new RangeError(path + ".themePath exceeds its depth limit");
  const themeIds = themePath.themeIds.map((id, itemIndex) => requireString(id, path + ".themePath.themeIds[" + itemIndex + "]", 160));
  if (new Set(themeIds).size !== themeIds.length) throw new TypeError(path + ".themePath.themeIds must be unique");
  const labels = themePath.labels.map((label, itemIndex) => requireString(label, path + ".themePath.labels[" + itemIndex + "]", 120));
  return { noteId, passageId, managedBy: "user", themePath: { themeIds, labels } };
}

function normalizeVoice(value, index) {
  const path = "voiceMetadata[" + index + "]";
  requireRecord(value, path);
  const noteId = requireString(value.noteId, path + ".noteId", 160);
  const passageId = requireString(value.passageId, path + ".passageId", 160);
  if (value.managedBy !== "user") throw new TypeError(path + ".managedBy must be user");
  const sourceType = requireString(value.sourceType, path + ".sourceType", 32);
  if (!SOURCE_TYPES.has(sourceType)) throw new TypeError(path + ".sourceType is unsupported");
  return {
    noteId,
    passageId,
    sourceType,
    managedBy: "user",
    attribution: optionalString(value.attribution, path + ".attribution", 120),
    attributionBasis: optionalString(value.attributionBasis, path + ".attributionBasis", 240),
    sourceLabel: optionalString(value.sourceLabel, path + ".sourceLabel", 120),
    reference: optionalString(value.reference, path + ".reference", 240),
    eventAt: canonicalDate(value.eventAt, path + ".eventAt", true)
  };
}

function voiceFor(metadata) {
  if (!metadata) return { sourceType: "unknown", voice: { kind: "unknown", label: "speaker unclear", attributionStatus: "uncertain" }, reference: null, describedEventAt: null };
  if (metadata.sourceType === "writer") {
    return { sourceType: "writer", voice: { kind: "writer", label: "writer", attributionStatus: "explicit-user-assignment" }, reference: null, describedEventAt: metadata.eventAt };
  }
  if (metadata.sourceType === "attributed") {
    if (metadata.attribution && metadata.attributionBasis) {
      return {
        sourceType: "attributed",
        voice: { kind: "speaker", label: metadata.attribution, attributionStatus: "explicit", attributionBasis: metadata.attributionBasis },
        reference: null,
        describedEventAt: metadata.eventAt
      };
    }
    return { sourceType: "attributed", voice: { kind: "unknown", label: "speaker unclear", attributionStatus: "uncertain" }, reference: null, describedEventAt: metadata.eventAt };
  }
  if (metadata.sourceType === "saved-source") {
    return { sourceType: "saved-source", voice: { kind: "source", label: metadata.sourceLabel || "saved source", attributionStatus: "explicit-user-assignment" }, reference: null, describedEventAt: metadata.eventAt };
  }
  if (metadata.sourceType === "reference-only") {
    return { sourceType: "reference-only", voice: { kind: "source", label: metadata.sourceLabel || "saved reference", attributionStatus: "explicit-user-assignment" }, reference: metadata.reference, describedEventAt: metadata.eventAt };
  }
  return { sourceType: "unknown", voice: { kind: "unknown", label: "speaker unclear", attributionStatus: "uncertain" }, reference: null, describedEventAt: metadata.eventAt };
}

function bytesInJson(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function sortCandidates(left, right) {
  const leftCreated = left.note && left.note.createdAt || "9999-12-31T23:59:59.999Z";
  const rightCreated = right.note && right.note.createdAt || "9999-12-31T23:59:59.999Z";
  return leftCreated.localeCompare(rightCreated) || left.noteId.localeCompare(right.noteId) || left.passageId.localeCompare(right.passageId);
}

function addMembership(map, membership) {
  const key = tupleKey(membership.noteId, membership.passageId);
  const paths = map.get(key) || [];
  const pathKey = JSON.stringify(membership.themePath.themeIds);
  if (!paths.some(item => JSON.stringify(item.themePath.themeIds) === pathKey)) paths.push(membership);
  map.set(key, paths);
}

function normalizeAnchor(anchor, index) {
  const path = "anchors[" + index + "]";
  requireRecord(anchor, path);
  const noteId = requireString(anchor.noteId, path + ".noteId", 160);
  const passageId = requireString(anchor.passageId, path + ".passageId", 160);
  const sourceRevision = requireString(anchor.sourceRevision, path + ".sourceRevision", 160);
  if (!/^[a-f0-9]{64}$/.test(sourceRevision)) throw new TypeError(path + ".sourceRevision must be a SHA-256 hex digest");
  if (anchor.offsetUnit !== PASSAGE_OFFSET_UNIT) throw new TypeError(path + ".offsetUnit is unsupported");
  if (!Number.isInteger(anchor.start) || !Number.isInteger(anchor.end) || anchor.start < 0 || anchor.end <= anchor.start) throw new TypeError(path + " has an invalid range");
  if (typeof anchor.excerpt !== "string" || !anchor.excerpt.length) throw new TypeError(path + ".excerpt must be a non-empty exact string");
  if (anchor.end - anchor.start !== anchor.excerpt.length) throw new TypeError(path + " range does not match excerpt length");
  const expectedPassageId = sourceRevision.slice(0, 20) + ":" + anchor.start + ":" + anchor.end;
  if (passageId !== expectedPassageId) throw new TypeError(path + ".passageId must match its source revision and range");
  return {
    noteId,
    passageId,
    sourceRevision,
    offsetUnit: anchor.offsetUnit,
    start: anchor.start,
    end: anchor.end,
    excerpt: anchor.excerpt,
    contextBefore: typeof anchor.contextBefore === "string" ? anchor.contextBefore : "",
    contextAfter: typeof anchor.contextAfter === "string" ? anchor.contextAfter : "",
    anchorVersion: anchor.anchorVersion,
    chunkerVersion: typeof anchor.chunkerVersion === "string" ? anchor.chunkerVersion : null,
    matchProvenance: typeof anchor.matchProvenance === "string" ? anchor.matchProvenance : "unknown"
  };
}

function failureItem(anchor, note, meta, memberships, status, reason) {
  const voice = voiceFor(meta);
  return {
    noteId: anchor.noteId,
    sourceRevision: anchor.sourceRevision,
    passageId: anchor.passageId,
    anchor: {
      offsetUnit: anchor.offsetUnit,
      start: anchor.start,
      end: anchor.end,
      anchorVersion: anchor.anchorVersion,
      matchProvenance: anchor.matchProvenance
    },
    excerpt: null,
    sourceType: voice.sourceType,
    voice: voice.voice,
    noteCreatedAt: note ? note.createdAt : null,
    noteEditedAt: note ? note.editedAt : null,
    describedEventAt: voice.describedEventAt,
    memberships: memberships.map(item => ({ themePath: item.themePath, managedBy: "user", sourcePassageId: item.passageId })),
    status,
    statusReason: reason
  };
}

function asOfFailure(note, requestedAsOf) {
  if (note.createdAt == null) return "creation-time-unknown";
  if (Date.parse(note.createdAt) > Date.parse(requestedAsOf)) return "note-created-after-cutoff";
  if (note.editedAt == null) return "edit-time-unknown";
  if (Date.parse(note.editedAt) > Date.parse(requestedAsOf)) return "earlier-revision-unavailable";
  return null;
}

function sourceCopyKey(item) {
  if (item.status !== "resolved" || !item.excerpt || !["saved-source", "attributed"].includes(item.sourceType)) return null;
  const attribution = item.voice.kind === "speaker" ? item.voice.label : "";
  return JSON.stringify([item.sourceType, attribution, item.excerpt]);
}

/**
 * Resolve exact current passages and return a dated evidence inventory.
 *
 * Inputs are deliberately explicit and ephemeral:
 * - notes: {noteId, body, createdAt, editedAt, archived?, deleted?}
 * - anchors: stable passage anchors made by passage-anchor.js
 * - memberships: {noteId, passageId, managedBy:"user", themePath:{themeIds,labels}}
 * - voiceMetadata: {noteId, passageId, managedBy:"user", sourceType, attribution?, attributionBasis?,
 *   sourceLabel?, reference?, eventAt?}
 *
 * `createdAt` and `requestedAsOf` are required canonical timestamps. No clock,
 * storage, note-writing, network, or model API is consulted. Output contains
 * only exact, bounded excerpts; note bodies and anchor context are omitted.
 */
export async function buildArborEvidencePacket(options) {
  const input = requireRecord(options || {}, "options");
  const createdAt = canonicalDate(input.createdAt, "createdAt", false);
  const requestedAsOf = canonicalDate(input.requestedAsOf, "requestedAsOf", false);
  const limits = normalizeLimits(input);
  const membershipInput = input.memberships === undefined ? [] : input.memberships;
  const voiceInput = input.voiceMetadata === undefined ? [] : input.voiceMetadata;
  if (!Array.isArray(input.notes) || !Array.isArray(input.anchors) || !Array.isArray(membershipInput) || !Array.isArray(voiceInput)) {
    throw new TypeError("notes, anchors, memberships, and voiceMetadata must be arrays");
  }
  if (input.notes.length > HARD_LIMITS.inputItems || input.anchors.length > HARD_LIMITS.inputItems || membershipInput.length > HARD_LIMITS.inputItems || voiceInput.length > HARD_LIMITS.inputItems) {
    throw new RangeError("Evidence packet inputs exceed their item limit");
  }

  const notes = new Map();
  input.notes.forEach((raw, index) => {
    const note = normalizeNote(raw, index);
    if (notes.has(note.noteId)) throw new TypeError("Duplicate noteId " + note.noteId);
    notes.set(note.noteId, note);
  });

  const memberships = new Map();
  membershipInput.map(normalizeMembership).forEach(membership => addMembership(memberships, membership));
  for (const paths of memberships.values()) {
    if (paths.length > HARD_LIMITS.membershipsPerPassage) throw new RangeError("A passage exceeds its membership path limit");
  }

  const voices = new Map();
  voiceInput.forEach((raw, index) => {
    const metadata = normalizeVoice(raw, index);
    const key = tupleKey(metadata.noteId, metadata.passageId);
    if (voices.has(key)) throw new TypeError("Duplicate voice metadata for " + metadata.noteId + "/" + metadata.passageId);
    voices.set(key, metadata);
  });

  const anchorsByKey = new Map();
  input.anchors.forEach((raw, index) => {
    const anchor = normalizeAnchor(raw, index);
    const key = tupleKey(anchor.noteId, anchor.passageId);
    const previous = anchorsByKey.get(key);
    if (previous && (previous.sourceRevision !== anchor.sourceRevision || previous.start !== anchor.start || previous.end !== anchor.end || previous.excerpt !== anchor.excerpt)) {
      throw new TypeError("Conflicting anchors share passage identity " + anchor.noteId + "/" + anchor.passageId);
    }
    if (!previous) anchorsByKey.set(key, anchor);
  });

  const candidates = Array.from(anchorsByKey.values()).map(anchor => ({
    anchor,
    note: notes.get(anchor.noteId) || null,
    noteId: anchor.noteId,
    passageId: anchor.passageId,
    memberships: memberships.get(tupleKey(anchor.noteId, anchor.passageId)) || [],
    voice: voices.get(tupleKey(anchor.noteId, anchor.passageId)) || null
  })).sort(sortCandidates);

  const packetCandidates = [];
  for (const candidate of candidates) {
    const anchor = candidate.anchor;
    const note = candidate.note;
    const membershipsForItem = candidate.memberships;
    if (!note || !note.exists) {
      packetCandidates.push(failureItem(anchor, note, candidate.voice, membershipsForItem, "deleted", "note-unavailable"));
      continue;
    }
    if (note.archived) {
      packetCandidates.push(failureItem(anchor, note, candidate.voice, membershipsForItem, "archived", "note-archived"));
      continue;
    }
    const unavailableReason = asOfFailure(note, requestedAsOf);
    if (unavailableReason) {
      packetCandidates.push(failureItem(anchor, note, candidate.voice, membershipsForItem, "as-of-unavailable", unavailableReason));
      continue;
    }
    if (anchor.anchorVersion !== PASSAGE_ANCHOR_VERSION) {
      packetCandidates.push(failureItem(anchor, note, candidate.voice, membershipsForItem, "stale", "unsupported-anchor-version"));
      continue;
    }

    const resolved = await resolvePassageAnchor(anchor, { exists: true, noteId: note.noteId, body: note.body });
    if (resolved.resolutionStatus !== "resolved") {
      packetCandidates.push(failureItem(anchor, note, candidate.voice, membershipsForItem, resolved.resolutionStatus, "exact-source-resolution-failed"));
      continue;
    }

    const voice = voiceFor(candidate.voice);
    const referenceMatches = voice.sourceType !== "reference-only" || (voice.reference && resolved.excerpt === voice.reference);
    const excerptWithinLimit = resolved.excerpt.length <= limits.excerptCodeUnits;
    const status = !referenceMatches ? "reference-mismatch" : excerptWithinLimit ? "resolved" : "excerpt-limit";
    const canDisplay = status === "resolved";
    packetCandidates.push({
      noteId: anchor.noteId,
      sourceRevision: resolved.sourceRevision,
      passageId: resolved.passageId,
      anchor: {
        offsetUnit: resolved.offsetUnit,
        start: resolved.start,
        end: resolved.end,
        anchorVersion: resolved.anchorVersion,
        matchProvenance: resolved.matchProvenance
      },
      excerpt: canDisplay ? resolved.excerpt : null,
      sourceType: voice.sourceType,
      voice: voice.voice,
      reference: voice.sourceType === "reference-only" && referenceMatches ? voice.reference : null,
      noteCreatedAt: note.createdAt,
      noteEditedAt: note.editedAt,
      describedEventAt: voice.describedEventAt,
      memberships: membershipsForItem.map(item => ({ themePath: item.themePath, managedBy: "user", sourcePassageId: item.passageId })),
      status,
      statusReason: status === "reference-mismatch" ? "reference-does-not-match-exact-passage" : status === "excerpt-limit" ? "exact-passage-exceeds-excerpt-limit" : null,
      sourceRevisionStatus: resolved.sourceRevision === anchor.sourceRevision ? "unchanged" : "reanchored-exact-passage"
    });
  }

  const copyCounts = new Map();
  for (const item of packetCandidates) {
    const key = sourceCopyKey(item);
    if (key) copyCounts.set(key, (copyCounts.get(key) || 0) + 1);
  }
  for (const item of packetCandidates) {
    const key = sourceCopyKey(item);
    if (key && copyCounts.get(key) > 1) {
      item.supportCounting = { sourceOccurrences: 1, exactCopiedPassages: copyCounts.get(key) };
    }
  }

  let items = packetCandidates.slice(0, limits.items);
  let omittedItemCount = packetCandidates.length - items.length;
  const base = {
    version: ARBOR_EVIDENCE_PACKET_VERSION,
    createdAt,
    requestedAsOf,
    method: "deterministic-evidence-only",
    items,
    limits: {
      maxItems: limits.items,
      maxExcerptCodeUnits: limits.excerptCodeUnits,
      maxPacketBytes: limits.packetBytes,
      omittedItemCount,
      packetBytesExceeded: false
    }
  };

  while (bytesInJson(base) > limits.packetBytes && items.length) {
    items = items.slice(0, -1);
    omittedItemCount += 1;
    base.items = items;
    base.limits.omittedItemCount = omittedItemCount;
    base.limits.packetBytesExceeded = true;
  }
  if (bytesInJson(base) > limits.packetBytes) throw new RangeError("Packet metadata exceeds the configured byte limit");

  return base;
}
