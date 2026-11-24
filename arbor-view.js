import { createArborStateStore } from "./arbor-state.js";
import { buildArborEvidencePacket } from "./arbor-evidence.js";
import { createPassageAnchor, PASSAGE_OFFSET_UNIT } from "./passage-anchor.js";

const ROUTE_STATE_KEY = "arborView";
const MAX_PACKET_ITEMS = 40;
const ACTIVE_VOICE_TYPES = new Set(["writer", "attributed", "saved-source", "reference-only", "unknown"]);
const ephemeralStores = new Map();

function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function tupleKey(noteId, passageId) {
  return JSON.stringify([noteId, passageId]);
}

function newId(prefix) {
  const random = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  return prefix + "-" + random;
}

function isoNow() {
  return new Date().toISOString();
}

function sha256(text) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) return Promise.reject(new Error("This browser cannot create a local evidence fingerprint."));
  return globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text))).then(bytes =>
    Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("")
  );
}

function storageForContext(context) {
  if (!context.demo) return globalThis.localStorage;
  if (!ephemeralStores.has(context.accountId)) {
    const values = new Map();
    ephemeralStores.set(context.accountId, {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    });
  }
  return ephemeralStores.get(context.accountId);
}

function activeThemeOverrides(corrections) {
  const labels = new Map();
  const hidden = new Set();
  (corrections || []).forEach(correction => {
    if (correction.undo.status !== "available" || !correction.target) return;
    if (correction.kind === "rename") labels.set(correction.target.id, correction.after.label);
    if (correction.kind === "hide" && correction.target.entityType === "theme") {
      if (correction.after.hidden) hidden.add(correction.target.id);
      else hidden.delete(correction.target.id);
    }
  });
  return { labels, hidden };
}

export function buildThemeTree(themes, corrections) {
  const overrides = activeThemeOverrides(corrections);
  const byId = new Map((themes || []).map(theme => [theme.id, {
    ...theme,
    visibleLabel: overrides.labels.get(theme.id) || theme.label,
    hidden: overrides.hidden.has(theme.id),
    children: []
  }]));
  const roots = [];
  byId.forEach(theme => {
    const parent = theme.parentThemeId && byId.get(theme.parentThemeId);
    if (parent && parent.id !== theme.id) parent.children.push(theme);
    else roots.push(theme);
  });
  const sort = list => list.sort((left, right) => left.visibleLabel.localeCompare(right.visibleLabel, undefined, { sensitivity: "base" })).forEach(theme => sort(theme.children));
  sort(roots);
  return roots;
}

function themePath(themeId, themes, corrections) {
  const overrides = activeThemeOverrides(corrections);
  const byId = new Map((themes || []).map(theme => [theme.id, theme]));
  const path = [];
  const seen = new Set();
  let current = byId.get(themeId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift({ id: current.id, label: overrides.labels.get(current.id) || current.label });
    current = current.parentThemeId ? byId.get(current.parentThemeId) : null;
  }
  if (!path.length || path[path.length - 1].id !== themeId) return null;
  return { themeIds: path.map(item => item.id), labels: path.map(item => item.label) };
}

function parsePassageIdentity(citation) {
  if (!/^[a-f0-9]{64}$/.test(citation.sourceRevisionId)) return null;
  const match = /^([a-f0-9]{20}):(\d+):(\d+)$/.exec(citation.passageId);
  if (!match || match[1] !== citation.sourceRevisionId.slice(0, 20)) return null;
  const start = Number(match[2]);
  const end = Number(match[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) return null;
  if (typeof citation.excerpt !== "string" || citation.excerpt.length !== end - start) return null;
  return { start, end };
}

function noteDate(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function contextNoteMap(context) {
  return new Map((context.notes || []).map(note => [note.noteId, note]));
}

function pathsForSnapshot(snapshot, themes, corrections) {
  const paths = new Map();
  (snapshot && snapshot.themePaths || []).forEach(path => paths.set(JSON.stringify(path.themeIds), path));
  (snapshot && snapshot.citations || []).forEach(citation => {
    const key = JSON.stringify(citation.themeIds);
    if (paths.has(key)) return;
    const lastId = citation.themeIds[citation.themeIds.length - 1];
    const current = themePath(lastId, themes, corrections);
    if (current && JSON.stringify(current.themeIds) === key) paths.set(key, current);
  });
  return paths;
}

function inputForCitation(citation, snapshot, themes, corrections, noteMap) {
  const identity = parsePassageIdentity(citation);
  if (!identity || !citation.excerpt || citation.resolutionStatus === "deleted") {
    return { citation, snapshot, status: citation.resolutionStatus || "unavailable", reason: "anchor-unavailable" };
  }
  const note = noteMap.get(citation.noteId);
  if (!note) return { citation, snapshot, status: "note-unavailable", reason: "source-note-not-in-library" };
  if (!note.bodyAvailable) return { citation, snapshot, note, status: "local-body-unavailable", reason: "source-text-not-cached" };
  const pathMap = pathsForSnapshot(snapshot, themes, corrections);
  const path = pathMap.get(JSON.stringify(citation.themeIds)) || null;
  const labels = path && path.labels.length === citation.themeIds.length
    ? path.labels
    : citation.themeIds.map((id, index) => {
      const definition = themes.find(item => item.id === id);
      return activeThemeOverrides(corrections).labels.get(id) || (definition && definition.label) || "Previously named theme " + (index + 1);
    });
  const metadata = {
    noteId: citation.noteId,
    passageId: citation.passageId,
    managedBy: "user",
    themePath: { themeIds: citation.themeIds, labels }
  };
  const voice = {
    noteId: citation.noteId,
    passageId: citation.passageId,
    managedBy: "user",
    sourceType: citation.sourceType
  };
  if (citation.sourceType === "attributed" && citation.attribution) voice.attribution = citation.attribution;
  if (citation.sourceType === "saved-source" && citation.attribution) voice.sourceLabel = citation.attribution;
  if (citation.sourceType === "reference-only") voice.reference = citation.excerpt;
  return {
    citation,
    snapshot,
    note,
    anchor: {
      noteId: citation.noteId,
      passageId: citation.passageId,
      sourceRevision: citation.sourceRevisionId,
      offsetUnit: PASSAGE_OFFSET_UNIT,
      start: identity.start,
      end: identity.end,
      excerpt: citation.excerpt,
      contextBefore: "",
      contextAfter: "",
      anchorVersion: 1,
      chunkerVersion: null,
      matchProvenance: "saved-user-evidence"
    },
    membership: metadata,
    voice
  };
}

export async function resolveSnapshotEvidence(snapshot, context, themes, corrections) {
  if (!snapshot) return [];
  const noteMap = contextNoteMap(context);
  const prepared = snapshot.citations.map(citation => inputForCitation(citation, snapshot, themes, corrections, noteMap));
  const voicesBySource = new Map();
  const conflictingVoiceKeys = new Set();
  prepared.forEach(item => {
    if (!item.anchor) return;
    const key = tupleKey(item.citation.noteId, item.citation.passageId);
    const voice = JSON.stringify(item.voice);
    if (voicesBySource.has(key) && voicesBySource.get(key) !== voice) conflictingVoiceKeys.add(key);
    else voicesBySource.set(key, voice);
  });
  const consistent = prepared.map(item => {
    const key = tupleKey(item.citation.noteId, item.citation.passageId);
    return conflictingVoiceKeys.has(key)
      ? { ...item, anchor: null, status: "voice-conflict", reason: "source-voice-conflict" }
      : item;
  });
  const resolvable = consistent.filter(item => item.anchor);
  let packetItems = [];
  if (resolvable.length) {
    const now = isoNow();
    const packet = await buildArborEvidencePacket({
      createdAt: now,
      requestedAsOf: now,
      notes: Array.from(new Map(resolvable.map(item => [item.note.noteId, item.note])).values()).map(note => ({
        noteId: note.noteId,
        body: note.body,
        createdAt: noteDate(note.createdAt),
        editedAt: noteDate(note.modifiedAt),
        archived: note.archived === true
      })),
      anchors: resolvable.map(item => item.anchor),
      memberships: resolvable.map(item => item.membership),
      voiceMetadata: Array.from(new Map(resolvable.map(item => [tupleKey(item.citation.noteId, item.citation.passageId), item.voice])).values()),
      limits: { items: MAX_PACKET_ITEMS, excerptCodeUnits: 1200, packetBytes: 96 * 1024 }
    });
    packetItems = packet.items;
  }
  const byKey = new Map(packetItems.map(item => [tupleKey(item.noteId, item.passageId), item]));
  const preparedByKey = new Map(resolvable.map(item => [tupleKey(item.citation.noteId, item.citation.passageId), item]));
  return Promise.all(consistent.map(async item => {
    if (item.reason) return {
      citation: item.citation, snapshot: item.snapshot, note: item.note || noteMap.get(item.citation.noteId) || null,
      status: item.status, reason: item.reason, excerpt: item.citation.excerpt || null,
      currentExcerpt: null, sourceRevisionStatus: null, anchor: null
    };
    const key = tupleKey(item.citation.noteId, item.citation.passageId);
    const resolved = byKey.get(key);
    const preparedItem = preparedByKey.get(key);
    if (!resolved) return {
      citation: item.citation, snapshot: item.snapshot, note: item.note || null,
      status: "omitted-from-evidence-limit", reason: "packet-item-limit", excerpt: item.citation.excerpt || null,
      currentExcerpt: null, sourceRevisionStatus: null, anchor: null
    };
    const resolvedAnchor = resolved.status === "resolved" && preparedItem
      ? await createPassageAnchor({
        noteId: item.citation.noteId,
        body: preparedItem.note.body,
        start: resolved.anchor.start,
        end: resolved.anchor.end,
        matchProvenance: resolved.anchor.matchProvenance
      })
      : null;
    return {
      citation: item.citation,
      snapshot: item.snapshot,
      note: preparedItem ? preparedItem.note : null,
      status: resolved.status,
      reason: resolved.statusReason,
      excerpt: item.citation.excerpt || null,
      currentExcerpt: resolved.excerpt,
      sourceRevisionStatus: resolved.sourceRevisionStatus,
      anchor: resolvedAnchor
    };
  }));
}

export function getSnapshotBranches(snapshots) {
  const values = snapshots || [];
  const parentIds = new Set(values.flatMap(snapshot => snapshot.parentSnapshotIds || []));
  return values.filter(snapshot => !parentIds.has(snapshot.id))
    .slice()
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

function chooseLatestSnapshot(snapshots, preferredId) {
  if (preferredId) {
    const preferred = getSnapshotBranches(snapshots).find(snapshot => snapshot.id === preferredId);
    if (preferred) return preferred;
  }
  return getSnapshotBranches(snapshots).at(-1) || null;
}

function statusLabel(item) {
  const labels = {
    resolved: item.sourceRevisionStatus === "reanchored-exact-passage" ? "Exact words found in the current note" : "Exact passage matches the saved source",
    stale: "The saved passage no longer appears in the current note",
    ambiguous: "The same words appear more than once; the passage is uncertain",
    archived: "The source note is archived",
    deleted: "The source note was deleted and this excerpt was removed",
    "note-unavailable": "The source note is not in this library",
    "local-body-unavailable": "The source text is not available in this browser right now",
    "anchor-unavailable": "The saved source passage cannot be rechecked",
    "omitted-from-evidence-limit": "This passage was not rechecked because the local evidence limit was reached",
    "as-of-unavailable": "An earlier source revision is not available on this device",
    "reference-mismatch": "The saved reference no longer matches the exact source passage",
    "voice-conflict": "Source voice labels conflict across theme placements",
    "excerpt-limit": "This source passage is longer than the evidence display limit"
  };
  return labels[item.status] || "Source status is uncertain";
}

function voiceLabel(citation) {
  if (citation.sourceType === "writer") return { label: "Your writing", className: "writer", note: "Written in this note" };
  if (citation.sourceType === "attributed") return {
    label: "Attributed words",
    className: "speaker",
    note: citation.attribution ? "User label: " + citation.attribution + ". Attribution support is not stored, so the speaker remains uncertain." : "Speaker unclear; attribution support is not stored."
  };
  if (citation.sourceType === "saved-source") return {
    label: "Saved source",
    className: "source",
    note: citation.attribution ? "User source label: " + citation.attribution : "Source label not provided."
  };
  if (citation.sourceType === "reference-only") return { label: "Reference only", className: "reference", note: "No source text is reproduced." };
  return { label: "Voice unclear", className: "unknown", note: "No source voice has been assigned." };
}

function formatDate(value, withTime) {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not recorded";
  return new Intl.DateTimeFormat(undefined, withTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "long", day: "numeric", year: "numeric" }).format(date);
}

function sourceDateLabel(note) {
  return note && note.createdAt ? "Note created " + formatDate(note.createdAt, false) : "Note date not available";
}

function sourceLabel(item) {
  return item.note ? item.note.title : "Source note unavailable";
}

function renderTreeNodes(arborId, nodes, depth, selectedId) {
  return nodes.filter(node => !node.hidden).map(node => `
    <div class="arbor-tree-node" style="--tree-depth:${depth}">
      <button type="button" class="arbor-tree-link${selectedId === node.id ? " is-selected" : ""}" data-action="theme" data-id="${escapeHTML(node.id)}" aria-current="${selectedId === node.id ? "page" : "false"}">
        <span class="arbor-tree-mark" aria-hidden="true"></span><span>${escapeHTML(node.visibleLabel)}</span>
      </button>
      ${node.children.length ? `<div class="arbor-tree-children">${renderTreeNodes(arborId, node.children, depth + 1, selectedId)}</div>` : ""}
    </div>`).join("");
}

function quoteCard(item, compact, historical, placementActions) {
  const voice = voiceLabel(item.citation);
  const displayedExcerpt = historical ? item.excerpt : item.currentExcerpt || item.excerpt;
  const reference = item.citation.sourceType === "reference-only";
  const unavailable = item.citation.resolutionStatus === "deleted" || !displayedExcerpt;
  const placementControls = placementActions && !historical ? `<div class="arbor-placement-controls">
    ${placementActions.targets.length ? `<form data-form="move-placement" data-citation="${escapeHTML(item.citation.id)}" data-theme="${escapeHTML(placementActions.themeId)}"><label for="arbor-move-${escapeHTML(item.citation.id)}">Move passage to</label><select id="arbor-move-${escapeHTML(item.citation.id)}" name="targetTheme" required><option value="">Choose a theme</option>${placementActions.targets.map(target => `<option value="${escapeHTML(target.id)}">${escapeHTML(target.labels.join(" / "))}</option>`).join("")}</select><button type="submit" class="arbor-text-link">Move passage</button></form>` : ""}
    <button type="button" class="arbor-text-link" data-action="remove-placement" data-citation="${escapeHTML(item.citation.id)}" data-theme="${escapeHTML(placementActions.themeId)}">Remove from this theme</button>
    <p>Only this latest placement changes. The source note and earlier snapshots stay intact.</p>
  </div>` : "";
  return `<article class="arbor-evidence-card voice-${voice.className}${compact ? " is-compact" : ""}">
    <div class="arbor-evidence-meta"><span class="arbor-voice-label">${escapeHTML(voice.label)}</span><span class="arbor-source-title">${escapeHTML(sourceLabel(item))}</span><span class="arbor-source-date">${escapeHTML(sourceDateLabel(item.note))}</span></div>
    ${unavailable ? `<p class="arbor-evidence-removed">${escapeHTML(statusLabel(item))}</p>` : `<blockquote>${escapeHTML(displayedExcerpt)}</blockquote>`}
    <div class="arbor-evidence-footer"><span>${escapeHTML(voice.note)}</span><span>${historical ? "Saved text at this snapshot · " : ""}${escapeHTML(statusLabel(item))}</span></div>
    ${item.citation.sourceType === "reference-only" ? `<span class="arbor-reference-only">Reference only</span>` : ""}
    <button type="button" class="arbor-text-link" data-action="source" data-citation="${escapeHTML(item.citation.id)}">${reference ? "Open saved reference" : "Open source passage"}</button>
    ${placementControls}
  </article>`;
}

function renderCompare(items, historical) {
  const current = items.filter(item => historical
    ? item.citation.resolutionStatus !== "deleted" && item.excerpt
    : item.status === "resolved" && item.currentExcerpt);
  if (current.length < 2) return `<section class="arbor-surface" aria-labelledby="arbor-surface-heading"><h2 id="arbor-surface-heading">Compare saved passages</h2><p>Two passages with a current exact source match are needed. Saved excerpts remain available in their source records.</p></section>`;
  return `<section class="arbor-surface" aria-labelledby="arbor-surface-heading">
    <h2 id="arbor-surface-heading">Compare saved passages</h2>
    <p>Each passage stays with its own note and voice. No shared meaning is inferred.</p>
    <div class="arbor-compare-grid">${current.slice(0, 6).map(item => {
      const voice = voiceLabel(item.citation);
      return `<article class="arbor-compare-item voice-${voice.className}"><span class="arbor-voice-label">${escapeHTML(voice.label)}</span><h3>${escapeHTML(sourceLabel(item))}</h3><span class="arbor-source-date">${escapeHTML(sourceDateLabel(item.note))}</span><blockquote>${escapeHTML(historical ? item.excerpt : item.currentExcerpt)}</blockquote><p>${escapeHTML(voice.note)}${historical ? " · Saved at this snapshot" : ""}</p><button type="button" class="arbor-text-link" data-action="source" data-citation="${escapeHTML(item.citation.id)}">Open source passage</button></article>`;
    }).join("")}</div>
  </section>`;
}

function renderHistory(snapshots, themeId, selectedSnapshotId, latestSnapshotId) {
  const matching = snapshots.filter(snapshot => (snapshot.themePaths || []).some(path => path.themeIds.includes(themeId)) || snapshot.citations.some(citation => citation.themeIds.includes(themeId)));
  if (!matching.length) return `<section class="arbor-surface"><h2>Overview history</h2><p>No saved overview includes this theme yet. This history records Arbor evidence snapshots, not note edits or writing revisions.</p></section>`;
  const selected = matching.find(snapshot => snapshot.id === selectedSnapshotId);
  const selectedParent = selected && (selected.parentSnapshotIds || []).map(id => snapshots.find(snapshot => snapshot.id === id)).find(Boolean);
  const comparison = selected ? compareSnapshotEvidence(selectedParent, selected, themeId) : null;
  const branches = getSnapshotBranches(snapshots);
  const branchControls = branches.length > 1
    ? `<aside class="arbor-history-branches"><h3>Separate history branches</h3><p>These saved overviews came from concurrent edits. Choose a branch to continue it; the branches have not been combined into one overview.</p><ul>${branches.map(snapshot => `<li><button type="button" class="arbor-history-entry" data-action="history-branch" data-snapshot="${escapeHTML(snapshot.id)}" aria-pressed="${snapshot.id === latestSnapshotId}"><span class="arbor-history-date">Branch saved ${escapeHTML(formatDate(snapshot.createdAt, true))}</span><span>${snapshot.citations.filter(citation => citation.themeIds.includes(themeId)).length} saved passages</span></button></li>`).join("")}</ul></aside>`
    : "";
  const comparisonView = !comparison ? ""
    : !comparison.hasPrevious
      ? `<div class="arbor-history-diff"><h3>First saved overview for this theme</h3><p>No earlier snapshot is available to compare.</p></div>`
      : `<div class="arbor-history-diff"><h3>Changes since the previous saved overview</h3><p>These counts describe saved evidence placements and source revisions. They do not say why your writing changed or what you believe.</p><dl><div><dt>Passage placements added</dt><dd>${comparison.addedPlacementCount}</dd></div><div><dt>Passage placements no longer included</dt><dd>${comparison.removedPlacementCount}</dd></div><div><dt>Notes with a different saved source revision</dt><dd>${comparison.changedSourceRevisionCount}</dd></div></dl></div>`;
  const restoreControl = selectedSnapshotId && selectedSnapshotId !== latestSnapshotId && selected
    ? `<div class="arbor-history-restore"><button type="button" class="arbor-secondary-button" data-action="restore-theme-placements" data-theme="${escapeHTML(themeId)}" data-snapshot="${escapeHTML(selectedSnapshotId)}">Restore this theme and its child themes to the latest overview</button><p>This creates a new snapshot. The source note and other theme branches stay unchanged.</p></div>`
    : "";
  return `<section class="arbor-surface" aria-labelledby="arbor-surface-heading"><h2 id="arbor-surface-heading">Overview history</h2><p>Choose a saved evidence snapshot to review the passages included at that point. This history does not record source-note edits or theme-label changes.</p>${branchControls}<ol class="arbor-history-list">${matching.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).reverse().map(snapshot => {
    const count = snapshot.citations.filter(citation => citation.themeIds.includes(themeId)).length;
    return `<li><button type="button" class="arbor-history-entry" data-action="history-snapshot" data-snapshot="${escapeHTML(snapshot.id)}" aria-pressed="${snapshot.id === selectedSnapshotId}"><span class="arbor-history-date">${escapeHTML(formatDate(snapshot.createdAt, true))}</span><span>${count} saved ${count === 1 ? "passage" : "passages"}</span><span class="arbor-history-asof">Sources requested as of ${escapeHTML(formatDate(snapshot.requestedAsOf, false))}</span></button></li>`;
  }).join("")}</ol>${comparisonView}${restoreControl}</section>`;
}

export function compareSnapshotEvidence(previous, current, themeId) {
  const currentCitations = current ? current.citations.filter(citation => citation.themeIds.includes(themeId)) : [];
  if (!previous) return {
    hasPrevious: false,
    addedPlacementCount: currentCitations.length,
    removedPlacementCount: 0,
    changedSourceRevisionCount: 0
  };
  const previousCitations = previous.citations.filter(citation => citation.themeIds.includes(themeId));
  const placementKey = citation => JSON.stringify([citation.noteId, citation.passageId, citation.themeIds]);
  const previousKeys = new Set(previousCitations.map(placementKey));
  const currentKeys = new Set(currentCitations.map(placementKey));
  const revisionSets = citations => {
    const byNote = new Map();
    (citations || []).forEach(item => {
      if (!byNote.has(item.noteId)) byNote.set(item.noteId, new Set());
      if (item.sourceRevisionId) byNote.get(item.noteId).add(item.sourceRevisionId);
    });
    return byNote;
  };
  const previousRevisions = revisionSets(previousCitations);
  const currentRevisions = revisionSets(currentCitations);
  const sharedNoteIds = new Set(previousCitations.map(item => item.noteId).filter(noteId => currentCitations.some(item => item.noteId === noteId)));
  let changedSourceRevisionCount = 0;
  sharedNoteIds.forEach(noteId => {
    const before = previousRevisions.get(noteId);
    const after = currentRevisions.get(noteId);
    if (before && after && JSON.stringify(Array.from(before).sort()) !== JSON.stringify(Array.from(after).sort())) changedSourceRevisionCount += 1;
  });
  return {
    hasPrevious: true,
    addedPlacementCount: currentCitations.filter(citation => !previousKeys.has(placementKey(citation))).length,
    removedPlacementCount: previousCitations.filter(citation => !currentKeys.has(placementKey(citation))).length,
    changedSourceRevisionCount
  };
}

function collectThemeItems(items, themeId) {
  return items.filter(item => item.citation.themeIds.includes(themeId));
}

function renderTheme(theme, themePathValue, items, route, snapshots, selectedSnapshot, latestSnapshot, state) {
  const belonging = collectThemeItems(items, theme.id);
  const branches = getSnapshotBranches(snapshots);
  const selectedSurface = route.surface || "";
  const viewingPast = selectedSnapshot && latestSnapshot && selectedSnapshot.id !== latestSnapshot.id;
  const isLatestSnapshot = Boolean(latestSnapshot && selectedSnapshot && selectedSnapshot.id === latestSnapshot.id);
  const themeDefinitions = state.definitions.themes.filter(candidate => candidate.arborId === theme.arborId);
  const visibleThemeIds = new Set(flattenVisibleTree(buildThemeTree(themeDefinitions, state.corrections)).map(candidate => candidate.id));
  const moveTargets = themeDefinitions
    .filter(candidate => visibleThemeIds.has(candidate.id))
    .map(candidate => themePath(candidate.id, state.definitions.themes, state.corrections))
    .filter(candidate => candidate && candidate.themeIds.length)
    .map(path => ({ id: path.themeIds.at(-1), themeIds: path.themeIds, labels: path.labels }));
  return `<div class="arbor-page-heading"><p class="arbor-kicker">${escapeHTML(themePathValue.labels.slice(0, -1).join(" / ") || "Arbor")}</p><h1>${escapeHTML(themePathValue.labels.at(-1) || theme.visibleLabel)}</h1><p>A user-defined theme. Saved passages stay linked to the note and source voice they came from.</p></div>
    ${branches.length > 1 ? `<aside class="arbor-history-branches" aria-label="Separate history branches"><p>Arbor has ${branches.length} separate history branches from concurrent edits. Review and choose one in History before continuing.</p><button type="button" class="arbor-secondary-button" data-action="surface" data-surface="history">Review branches</button></aside>` : ""}
    ${viewingPast ? `<aside class="arbor-history-banner" aria-label="Historical overview snapshot"><div><strong>Viewing saved overview from ${escapeHTML(formatDate(selectedSnapshot.createdAt, true))}</strong><p>This snapshot records the passages saved at that time. Source status is checked against notes available in this browser now.</p></div><button type="button" class="arbor-secondary-button" data-action="latest-snapshot">Return to latest overview</button></aside>` : ""}
    <div class="arbor-theme-actions"><button type="button" class="arbor-primary-button" data-action="add-source" data-theme="${escapeHTML(theme.id)}">Add a source passage</button><button type="button" class="arbor-secondary-button" data-action="add-child" data-theme="${escapeHTML(theme.id)}">Add child theme</button><button type="button" class="arbor-secondary-button" data-action="rename-theme" data-id="${escapeHTML(theme.id)}">Rename theme</button>${theme.hidden ? `<button type="button" class="arbor-secondary-button" data-action="unhide-theme" data-id="${escapeHTML(theme.id)}">Show theme</button>` : `<button type="button" class="arbor-secondary-button" data-action="hide-theme" data-id="${escapeHTML(theme.id)}">Hide theme</button>`}</div>
    ${renderUndoCorrection(state)}
    <div class="arbor-source-list" aria-label="Saved source passages">${belonging.length ? belonging.map(item => {
      const ownsPlacement = item.citation.themeIds.at(-1) === theme.id;
      const alreadyPlaced = new Set((latestSnapshot && latestSnapshot.citations || []).filter(citation => citation.noteId === item.citation.noteId && citation.passageId === item.citation.passageId).map(citation => JSON.stringify(citation.themeIds)));
      const targets = moveTargets.filter(target => JSON.stringify(target.themeIds) !== JSON.stringify(item.citation.themeIds) && !alreadyPlaced.has(JSON.stringify(target.themeIds)));
      const placementActions = !viewingPast && isLatestSnapshot && ownsPlacement ? { themeId: theme.id, targets } : null;
      return quoteCard(item, false, Boolean(viewingPast), placementActions);
    }).join("") : `<div class="arbor-empty-evidence"><h2>No saved passages in this snapshot</h2><p>This is what the saved evidence looked like at this point in the history.</p></div>`}</div>
    <div class="arbor-detail-tools" role="group" aria-label="Theme evidence views"><button type="button" class="arbor-view-tab" data-action="surface" data-surface="compare" aria-pressed="${selectedSurface === "compare"}">Compare</button><button type="button" class="arbor-view-tab" data-action="surface" data-surface="history" aria-pressed="${selectedSurface === "history"}">History</button></div>
    ${selectedSurface === "compare" ? renderCompare(belonging, Boolean(viewingPast)) : selectedSurface === "history" ? renderHistory(snapshots, theme.id, selectedSnapshot && selectedSnapshot.id, latestSnapshot && latestSnapshot.id) : ""}`;
}

function renderSource(item, snapshot, path, historical) {
  const voice = voiceLabel(item.citation);
  const excerpt = item.citation.resolutionStatus === "deleted" ? null : historical ? item.excerpt : item.currentExcerpt || item.excerpt;
  const reference = item.citation.sourceType === "reference-only";
  return `<div class="arbor-page-heading"><p class="arbor-kicker">${escapeHTML(path && path.labels.join(" / ") || "Arbor source")}</p><h1>${escapeHTML(sourceLabel(item))}</h1><p>Source passage · saved in an overview on ${escapeHTML(formatDate(snapshot.createdAt, false))}</p></div>
    ${historical ? `<aside class="arbor-history-banner"><div><strong>Text saved at this snapshot</strong><p>The source status below reflects a check against the note currently available in this browser.</p></div></aside>` : ""}
    <dl class="arbor-source-meta"><div><dt>Voice</dt><dd>${escapeHTML(voice.label)}</dd></div><div><dt>Note date</dt><dd>${escapeHTML(sourceDateLabel(item.note))}</dd></div><div><dt>Source status</dt><dd>${escapeHTML(statusLabel(item))}</dd></div><div><dt>Saved in</dt><dd>${escapeHTML(path && path.labels.join(" / ") || "Previous theme")}</dd></div><div><dt>Saved source revision</dt><dd><code class="arbor-source-revision" aria-label="Saved source SHA-256 revision">${escapeHTML(item.citation.sourceRevisionId)}</code></dd></div></dl>
    ${reference ? `<div class="arbor-reference-panel"><span class="arbor-reference-only">Reference only</span><p>${excerpt ? escapeHTML(excerpt) : "The saved reference text was removed because its source note was deleted."}</p><small>Arbor does not fetch or reproduce Scripture text.</small></div>` : `<article class="arbor-transcript voice-${voice.className}">${excerpt ? `<blockquote>${escapeHTML(excerpt)}</blockquote>` : `<p class="arbor-evidence-removed">The saved excerpt was removed because its source note was deleted.</p>`}<p>${escapeHTML(voice.note)}</p><span class="arbor-passage-status">${escapeHTML(statusLabel(item))}</span></article>`}
    <div class="arbor-source-actions">${item.note ? `<button type="button" class="arbor-secondary-button" data-action="open-note" data-note="${escapeHTML(item.note.noteId)}" data-citation="${escapeHTML(item.citation.id)}">Open source note</button>` : ""}<button type="button" class="arbor-secondary-button" data-action="back">Back to theme</button></div>`;
}

function renderAddArbor() {
  return `<div class="arbor-page-heading"><p class="arbor-kicker">A user-defined path</p><h1>Name an Arbor</h1><p>Create a place for themes you choose. Arbor will not group notes automatically.</p></div><form class="arbor-form" data-form="arbor"><label for="arbor-name">Arbor name</label><input id="arbor-name" name="name" maxlength="120" required autocomplete="off" placeholder="For example, Faith"><button type="submit" class="arbor-primary-button">Create Arbor</button></form>`;
}

function renderAddTheme(parentId, arborId) {
  return `<div class="arbor-page-heading"><p class="arbor-kicker">${parentId ? "Child theme" : "New theme"}</p><h1>Name this theme</h1><p>This label is a path you chose. It does not describe a generated conclusion.</p></div><form class="arbor-form" data-form="theme" data-parent="${escapeHTML(parentId || "")}" data-arbor="${escapeHTML(arborId)}"><label for="arbor-theme-name">Theme name</label><input id="arbor-theme-name" name="name" maxlength="120" required autocomplete="off" placeholder="For example, Wisdom"><button type="submit" class="arbor-primary-button">Create theme</button></form>`;
}

function renderRenameTheme(theme) {
  return `<div class="arbor-page-heading"><p class="arbor-kicker">${escapeHTML(theme.visibleLabel)}</p><h1>Rename this theme</h1><p>Renaming changes your Arbor label. It does not change the source notes or saved passages.</p></div><form class="arbor-form" data-form="rename-theme" data-theme="${escapeHTML(theme.id)}"><label for="arbor-rename-theme-name">Theme name</label><input id="arbor-rename-theme-name" name="name" maxlength="120" required autocomplete="off" value="${escapeHTML(theme.visibleLabel)}"><button type="submit" class="arbor-primary-button">Save theme name</button></form>`;
}

function renderRenameArbor(arbor) {
  return `<div class="arbor-page-heading"><p class="arbor-kicker">${escapeHTML(arbor.visibleLabel)}</p><h1>Rename this Arbor</h1><p>Renaming changes your Arbor label. It does not change its themes or source notes.</p></div><form class="arbor-form" data-form="rename-arbor" data-arbor="${escapeHTML(arbor.id)}"><label for="arbor-rename-name">Arbor name</label><input id="arbor-rename-name" name="name" maxlength="120" required autocomplete="off" value="${escapeHTML(arbor.visibleLabel)}"><button type="submit" class="arbor-primary-button">Save Arbor name</button></form>`;
}

function renderLibrary(state) {
  const arbors = state.definitions.arbors;
  if (!arbors.length) return `<div class="arbor-page-heading"><p class="arbor-kicker">Library</p><h1>What would you like to return to?</h1><p>Start with a path you name. Arbor keeps your source passages attached to the notes they came from.</p></div><div class="arbor-empty-start"><h2>No Arbors yet</h2><p>There are no user-defined paths in this account. Nothing has been grouped automatically.</p><button type="button" class="arbor-primary-button" data-action="add-arbor">Create an Arbor</button></div>`;
  const byArbor = new Map(arbors.map(arbor => [arbor.id, arbor]));
  const overrides = activeThemeOverrides(state.corrections);
  return `<div class="arbor-page-heading"><p class="arbor-kicker">Library</p><h1>Your Arbors</h1><p>Each path is named and managed by you. Evidence stays tied to its source passage.</p></div><div class="arbor-arbor-list">${arbors.map(arbor => {
    const name = overrides.labels.get(arbor.id) || arbor.label;
    const tree = buildThemeTree(state.definitions.themes.filter(theme => theme.arborId === arbor.id), state.corrections);
    const count = countTree(tree);
    return `<button type="button" class="arbor-path-row" data-action="arbor" data-id="${escapeHTML(arbor.id)}"><span><strong>${escapeHTML(name)}</strong><small>${count} ${count === 1 ? "theme" : "themes"}</small></span><span aria-hidden="true">›</span></button>`;
  }).join("")}<button type="button" class="arbor-add-row" data-action="add-arbor">+ Create an Arbor</button></div>`;
}

function countTree(nodes) {
  return nodes.reduce((sum, node) => sum + (node.hidden ? 0 : 1 + countTree(node.children)), 0);
}

function renderArbor(arbor, tree, selectedId, state) {
  const selected = tree.length ? tree : [];
  const visible = flattenVisibleTree(selected);
  const hidden = flattenHiddenBranches(selected);
  const arborLabel = activeThemeOverrides(state.corrections).labels.get(arbor.id) || arbor.label;
  return `<div class="arbor-page-heading"><p class="arbor-kicker">Library</p><h1>${escapeHTML(arborLabel)}</h1><p>Choose a theme or add one that reflects a path you want to keep.</p></div>
    ${renderUndoCorrection(state)}
    <div class="arbor-theme-actions"><button type="button" class="arbor-secondary-button" data-action="rename-arbor" data-id="${escapeHTML(arbor.id)}">Rename Arbor</button></div>
    ${visible.length ? `<div class="arbor-theme-grid">${visible.map(theme => `<button type="button" class="arbor-theme-tile" data-action="theme" data-id="${escapeHTML(theme.id)}"><span>${escapeHTML(theme.visibleLabel)}</span><small>${theme.children.filter(child => !child.hidden).length ? escapeHTML(theme.children.filter(child => !child.hidden).length + " child " + (theme.children.filter(child => !child.hidden).length === 1 ? "theme" : "themes")) : "Theme"}</small></button>`).join("")}</div>` : `<div class="arbor-empty-evidence"><h2>No visible themes yet</h2><p>Add a theme to create a named path, or restore one below. Themes do not file notes until you choose exact source passages.</p></div>`}
    ${hidden.length ? `<section class="arbor-hidden-themes" aria-labelledby="arbor-hidden-heading"><h2 id="arbor-hidden-heading">Hidden themes</h2><ul>${hidden.map(theme => `<li><span>${escapeHTML(theme.visibleLabel)}</span><button type="button" class="arbor-text-link" data-action="unhide-theme" data-id="${escapeHTML(theme.id)}">Show theme</button></li>`).join("")}</ul></section>` : ""}
    <button type="button" class="arbor-secondary-button" data-action="add-theme" data-arbor="${escapeHTML(arbor.id)}">Add theme</button>`;
}

function flattenVisibleTree(nodes) {
  return nodes.flatMap(node => node.hidden ? [] : [node, ...flattenVisibleTree(node.children)]);
}

function flattenHiddenBranches(nodes, hiddenAncestor = false) {
  return nodes.flatMap(node => {
    if (node.hidden) return hiddenAncestor ? [] : [node];
    return flattenHiddenBranches(node.children, false);
  });
}

function renderUndoCorrection(state) {
  const correction = state && state.corrections.slice().reverse().find(item => item.undo.status === "available");
  if (!correction) return "";
  const subject = correction.kind === "rename" ? `rename to “${correction.after.label}”` : correction.kind === "hide" ? (correction.after.hidden ? "hide theme" : "restore theme") : "theme change";
  return `<div class="arbor-correction-undo"><span>Last change: ${escapeHTML(subject)}</span><button type="button" class="arbor-text-link" data-action="undo-correction" data-correction="${escapeHTML(correction.id)}">Undo</button></div>`;
}

function renderAddSource(theme, notes) {
  const available = notes.filter(note => note.bodyAvailable && !note.archived);
  const first = available[0];
  return `<div class="arbor-page-heading"><p class="arbor-kicker">${escapeHTML(theme.visibleLabel)}</p><h1>Choose source words</h1><p>Select an exact passage in a note. Arbor saves the excerpt separately and leaves the note unchanged.</p></div>
    ${available.length ? `<form class="arbor-source-form" data-form="source" data-theme="${escapeHTML(theme.id)}">
      <label for="arbor-source-note">Source note</label><select id="arbor-source-note" name="noteId">${available.map(note => `<option value="${escapeHTML(note.noteId)}" ${note === first ? "selected" : ""}>${escapeHTML(note.title)}</option>`).join("")}</select>
      <div class="arbor-select-help">Select text from the note below. The selection must match its canonical Markdown exactly.</div>
      <div class="arbor-selectable-source"><pre tabindex="0" data-source-body="${escapeHTML(first.noteId)}">${escapeHTML(first.body)}</pre></div>
      <p class="arbor-selection-status" data-selection-status role="status" aria-live="polite">No passage selected.</p>
      <label for="arbor-source-type">Source voice</label><select id="arbor-source-type" name="sourceType"><option value="unknown" selected>Voice unclear</option><option value="writer">My writing</option><option value="attributed">Words attributed to another person</option><option value="saved-source">Saved source</option><option value="reference-only">Reference only</option></select>
      <div class="arbor-voice-fields" data-voice-fields="attributed" hidden><label for="arbor-attribution">User attribution label</label><input id="arbor-attribution" name="attribution" maxlength="120" autocomplete="off" placeholder="Name as written in your note"><p>This account format does not save the basis for an attribution, so Arbor will keep the speaker marked uncertain.</p></div>
      <div class="arbor-voice-fields" data-voice-fields="saved-source" hidden><label for="arbor-source-label">Source label</label><input id="arbor-source-label" name="sourceLabel" maxlength="120" autocomplete="off" placeholder="Sermon, article, or other source"></div>
      <div class="arbor-voice-fields" data-voice-fields="reference-only" hidden><label for="arbor-reference">Exact saved reference</label><input id="arbor-reference" name="reference" maxlength="240" autocomplete="off" placeholder="Select the reference text in the note"><p>Reference text must match the selected words exactly. Arbor will not fetch Scripture text.</p></div>
      <div class="arbor-source-form-actions"><button type="submit" class="arbor-primary-button">Save passage to ${escapeHTML(theme.visibleLabel)}</button><button type="button" class="arbor-secondary-button" data-action="back">Cancel</button></div>
    </form>` : `<div class="arbor-empty-evidence"><h2>No local note text is available</h2><p>Choose a note that is already open or cached in this browser. This view does not fetch note content in the background.</p></div>`}`;
}

function renderSourceNotes(pre, note) {
  if (!pre || !note) return;
  pre.textContent = note.body;
  pre.dataset.sourceBody = note.noteId;
}

function routeTitle(route, state) {
  if (route.type === "library") return "Arbors";
  if (route.type === "add-arbor") return "New Arbor";
  if (route.type === "add-theme") return "New theme";
  if (route.type === "add-source") return "Choose a source";
  if (route.type === "source") return "Source passage";
  if (route.type === "arbor") {
    const arbor = state.definitions.arbors.find(item => item.id === route.id);
    return (activeThemeOverrides(state.corrections).labels.get(route.id) || arbor?.label) || "Arbor";
  }
  if (route.type === "theme") {
    const theme = state.definitions.themes.find(item => item.id === route.id);
    return (activeThemeOverrides(state.corrections).labels.get(route.id) || theme?.label) || "Theme";
  }
  if (route.type === "rename-theme") return "Rename theme";
  if (route.type === "rename-arbor") return "Rename Arbor";
  return "Arbors";
}

function renderNavigation(state, route, context) {
  const arbors = state.definitions.arbors;
  const overrides = activeThemeOverrides(state.corrections);
  return `<div class="arbor-view-brand"><span class="arbor-brand-mark" aria-hidden="true">a</span><span><strong>Arbor</strong><small>Evidence paths</small></span></div>
    <button type="button" class="arbor-nav-library${route.type === "library" ? " is-selected" : ""}" data-action="library" aria-current="${route.type === "library" ? "page" : "false"}>Library</button>
    ${arbors.map(arbor => {
      const label = overrides.labels.get(arbor.id) || arbor.label;
      const themeTree = buildThemeTree(state.definitions.themes.filter(theme => theme.arborId === arbor.id), state.corrections);
      return `<div class="arbor-nav-section"><button type="button" class="arbor-nav-arbor${route.type === "arbor" && route.id === arbor.id ? " is-selected" : ""}" data-action="arbor" data-id="${escapeHTML(arbor.id)}">${escapeHTML(label)}</button><div class="arbor-nav-tree">${renderTreeNodes(arbor.id, themeTree, 0, route.type === "theme" ? route.id : "")}</div></div>`;
    }).join("")}
    ${arbors.length ? `<button type="button" class="arbor-nav-add" data-action="add-arbor">+ New Arbor</button>` : ""}
    <aside class="arbor-storage-note" aria-label="Arbor storage details">${context && context.demo
      ? "Sample preview only. Changes stay in memory and disappear when this page reloads."
      : "Saved in this browser’s local storage for this account. Arbor state syncs with private iCloud when available. This browser copy is plaintext. Signing out clears it."}</aside>`;
}

function renderRouteBody(route, context, state, items, tree, selectedSnapshotId, activeBranchSnapshotId) {
  if (route.type === "library") return renderLibrary(state);
  if (route.type === "add-arbor") return renderAddArbor();
  if (route.type === "add-theme") {
    const arborId = route.arborId || (route.parentId && state.definitions.themes.find(theme => theme.id === route.parentId)?.arborId) || "";
    return arborId ? renderAddTheme(route.parentId, arborId) : renderLibrary(state);
  }
  if (route.type === "add-source") {
    const theme = state.definitions.themes.find(item => item.id === route.themeId);
    return theme ? renderAddSource({ ...theme, visibleLabel: activeThemeOverrides(state.corrections).labels.get(theme.id) || theme.label }, context.notes) : renderLibrary(state);
  }
  if (route.type === "arbor") {
    const arbor = state.definitions.arbors.find(item => item.id === route.id);
    return arbor ? renderArbor(arbor, buildThemeTree(state.definitions.themes.filter(theme => theme.arborId === arbor.id), state.corrections), "", state) : renderLibrary(state);
  }
  if (route.type === "rename-arbor") {
    const arbor = state.definitions.arbors.find(item => item.id === route.id);
    const visibleLabel = arbor && (activeThemeOverrides(state.corrections).labels.get(arbor.id) || arbor.label);
    return arbor ? renderRenameArbor({ ...arbor, visibleLabel }) : renderLibrary(state);
  }
  if (route.type === "rename-theme") {
    const theme = state.definitions.themes.find(item => item.id === route.id);
    const label = theme && (activeThemeOverrides(state.corrections).labels.get(theme.id) || theme.label);
    return theme ? renderRenameTheme({ ...theme, visibleLabel: label }) : renderLibrary(state);
  }
  if (route.type === "theme") {
    const theme = state.definitions.themes.find(item => item.id === route.id);
    const path = theme && themePath(theme.id, state.definitions.themes, state.corrections);
    const arbor = theme && state.definitions.arbors.find(item => item.id === theme.arborId);
    if (!theme || !path || !arbor) return renderLibrary(state);
    const overrides = activeThemeOverrides(state.corrections);
    const visibleTheme = { ...theme, visibleLabel: overrides.labels.get(theme.id) || theme.label, hidden: overrides.hidden.has(theme.id) };
    const perTheme = collectThemeItems(items, theme.id);
    const latestSnapshot = getSnapshotBranches(state.snapshots).find(snapshot => snapshot.id === activeBranchSnapshotId) || chooseLatestSnapshot(state.snapshots);
    const selectedSnapshot = state.snapshots.find(snapshot => snapshot.id === selectedSnapshotId) || latestSnapshot;
    return renderTheme(visibleTheme, path, perTheme, route, state.snapshots, selectedSnapshot, latestSnapshot, state);
  }
  if (route.type === "source") {
    const item = items.find(entry => entry.citation.id === route.citationId);
    if (!item) return `<div class="arbor-page-heading"><p class="arbor-kicker">Source passage</p><h1>This passage is unavailable</h1><p>The source may have been removed or the account may have changed.</p><button type="button" class="arbor-secondary-button" data-action="back">Back</button></div>`;
    const path = pathForCitation(item.citation, item.snapshot, state.definitions.themes, state.corrections);
    const latestSnapshot = getSnapshotBranches(state.snapshots).find(snapshot => snapshot.id === activeBranchSnapshotId) || chooseLatestSnapshot(state.snapshots);
    return renderSource(item, item.snapshot, path, Boolean(latestSnapshot && item.snapshot && item.snapshot.id !== latestSnapshot.id));
  }
  return renderLibrary(state);
}

function pathForCitation(citation, snapshot, themes, corrections) {
  const exact = (snapshot.themePaths || []).find(path => JSON.stringify(path.themeIds) === JSON.stringify(citation.themeIds));
  if (exact) return exact;
  const current = themePath(citation.themeIds[citation.themeIds.length - 1], themes, corrections);
  return current && JSON.stringify(current.themeIds) === JSON.stringify(citation.themeIds) ? current : null;
}

export function makeSnapshotFromEvidence(previous, evidenceItem, path, activeCorrections, createdAt) {
  if (!evidenceItem || evidenceItem.status !== "resolved" || !evidenceItem.excerpt || !evidenceItem.sourceRevision) {
    throw new Error("Only an exact, resolved source passage can be saved.");
  }
  const time = createdAt || isoNow();
  const priorCitations = previous ? previous.citations.map(citation => ({ ...citation, themeIds: citation.themeIds.slice() })) : [];
  const duplicate = priorCitations.some(citation => citation.noteId === evidenceItem.noteId && citation.passageId === evidenceItem.passageId && JSON.stringify(citation.themeIds) === JSON.stringify(path.themeIds));
  if (duplicate) throw new Error("This exact passage is already saved on this theme.");
  if (priorCitations.length >= 100) throw new Error("This overview already contains the maximum of 100 saved passages.");
  const citation = {
    id: newId("citation"),
    noteId: evidenceItem.noteId,
    sourceRevisionId: evidenceItem.sourceRevision,
    passageId: evidenceItem.passageId,
    themeIds: path.themeIds.slice(),
    sourceType: evidenceItem.sourceType,
    excerpt: evidenceItem.excerpt
  };
  if (evidenceItem.attribution) citation.attribution = evidenceItem.attribution;
  if (evidenceItem.sourceLabel) citation.attribution = evidenceItem.sourceLabel;
  const citations = priorCitations.concat([citation]);
  const sourceRevisionIds = new Map();
  if (previous) previous.sourceRevisionIds.forEach(item => sourceRevisionIds.set(JSON.stringify([item.noteId, item.revisionId]), { ...item }));
  citations.forEach(item => sourceRevisionIds.set(JSON.stringify([item.noteId, item.sourceRevisionId]), { noteId: item.noteId, revisionId: item.sourceRevisionId }));
  const themePaths = new Map();
  if (previous) previous.themePaths.forEach(item => themePaths.set(JSON.stringify(item.themeIds), { themeIds: item.themeIds.slice(), labels: item.labels.slice() }));
  themePaths.set(JSON.stringify(path.themeIds), { themeIds: path.themeIds.slice(), labels: path.labels.slice() });
  return Promise.resolve().then(async () => {
    const fingerprint = await sha256(JSON.stringify(citations.map(item => [item.noteId, item.sourceRevisionId, item.passageId, item.themeIds, item.sourceType])));
    return {
      id: newId("overview"),
      createdAt: time,
      requestedAsOf: time,
      sourceRevisionIds: Array.from(sourceRevisionIds.values()),
      evidenceSetFingerprint: "sha256:" + fingerprint,
      themePaths: Array.from(themePaths.values()),
      citations,
      rendering: { method: "explicit-user-passage-selection", version: "1" },
    correctionIds: (activeCorrections || []).filter(item => item.undo.status === "available").map(item => item.id),
    parentSnapshotIds: previous ? [previous.id] : []
    };
  });
}

export function makeSnapshotFromCitations(previous, citations, activeCorrections, createdAt, addedPath) {
  if (!previous || !Array.isArray(citations)) throw new TypeError("A prior snapshot and citation list are required.");
  const time = createdAt || isoNow();
  const copiedCitations = citations.map(citation => ({ ...citation, themeIds: citation.themeIds.slice() }));
  const sourceRevisionIds = new Map();
  copiedCitations.forEach(citation => sourceRevisionIds.set(JSON.stringify([citation.noteId, citation.sourceRevisionId]), {
    noteId: citation.noteId,
    revisionId: citation.sourceRevisionId
  }));
  const themePaths = new Map((previous.themePaths || []).map(path => [JSON.stringify(path.themeIds), {
    themeIds: path.themeIds.slice(),
    labels: path.labels.slice()
  }]));
  if (addedPath) themePaths.set(JSON.stringify(addedPath.themeIds), {
    themeIds: addedPath.themeIds.slice(),
    labels: addedPath.labels.slice()
  });
  return Promise.resolve().then(async () => {
    const fingerprint = await sha256(JSON.stringify(copiedCitations.map(citation => [
      citation.noteId,
      citation.sourceRevisionId,
      citation.passageId,
      citation.themeIds,
      citation.sourceType
    ])));
    return {
      id: newId("overview"),
      createdAt: time,
      requestedAsOf: previous.requestedAsOf,
      sourceRevisionIds: Array.from(sourceRevisionIds.values()),
      evidenceSetFingerprint: "sha256:" + fingerprint,
      themePaths: Array.from(themePaths.values()),
      citations: copiedCitations,
      rendering: { method: "explicit-user-passage-selection", version: "1" },
      correctionIds: (activeCorrections || []).filter(item => item.undo.status === "available").map(item => item.id),
      parentSnapshotIds: [previous.id]
    };
  });
}

function memorySnapshotStore(context, api) {
  if (!context.demo && api && typeof api.getArborStateStore === "function") {
    const sharedStore = api.getArborStateStore(context);
    if (sharedStore) return sharedStore;
  }
  return createArborStateStore(storageForContext(context), context.accountId);
}

function localBodyContext(note) {
  return {
    noteId: note.recordName,
    title: note.title,
    body: note.body,
    bodyAvailable: note.bodyAvailable === true,
    createdAt: note.createdAt,
    modifiedAt: note.modifiedAt,
    archived: note.archived === true,
    path: note.path || ""
  };
}

function setPanelVisible(panel, visible) {
  panel.hidden = !visible;
  panel.setAttribute("aria-hidden", String(!visible));
  panel.inert = !visible;
}

export function mountArborView(options) {
  const settings = options || {};
  const panel = document.getElementById("arbor-view-panel");
  const trigger = document.getElementById("arbor-view-open");
  if (!panel || !trigger || !settings.api) return { open() {}, close() {} };
  const nav = panel.querySelector("[data-arbor-nav]");
  const content = panel.querySelector("[data-arbor-content]");
  const liveStatus = panel.querySelector("[data-arbor-status]");
  const closeButton = panel.querySelector("[data-action=close]");
  const moduleState = { open: false, route: { type: "library" }, accountId: "", context: null, store: null, tree: [], items: [], selectedSnapshotId: "", activeBranchSnapshotId: "", focusBeforeOpen: null, routeDepth: 0, renderToken: 0 };
  let inertSiblings = [];

  function setBackgroundInert(inert) {
    if (inert) {
      if (inertSiblings.length) return;
      inertSiblings = Array.from(panel.parentElement ? panel.parentElement.children : []).filter(element => element !== panel)
        .map(element => ({ element, wasInert: element.inert }));
      inertSiblings.forEach(({ element }) => { element.inert = true; });
      return;
    }
    inertSiblings.forEach(({ element, wasInert }) => { element.inert = wasInert; });
    inertSiblings = [];
  }

  function currentState() {
    if (!moduleState.context || !moduleState.store) return { version: 2, definitions: { arbors: [], themes: [] }, corrections: [], snapshots: [], redactedNoteIds: [] };
    return moduleState.store.getState();
  }

  function ensureStore(context) {
    if (moduleState.accountId !== context.accountId || !moduleState.store) {
      moduleState.accountId = context.accountId;
      moduleState.context = context;
      moduleState.store = memorySnapshotStore(context, settings.api);
    } else moduleState.context = context;
  }

  async function refreshData() {
    const context = await settings.api.getArborContext();
    if (!context || !context.accountId || !context.ready) {
      moduleState.context = context || null;
      moduleState.store = null;
      moduleState.accountId = "";
      moduleState.items = [];
      return;
    }
    ensureStore(context);
    const state = currentState();
    const branches = getSnapshotBranches(state.snapshots);
    let latest = branches.find(snapshot => snapshot.id === moduleState.activeBranchSnapshotId) || null;
    if (!latest) latest = chooseLatestSnapshot(state.snapshots);
    moduleState.activeBranchSnapshotId = latest ? latest.id : "";
    const selected = state.snapshots.find(snapshot => snapshot.id === moduleState.selectedSnapshotId) || latest;
    moduleState.selectedSnapshotId = selected ? selected.id : "";
    moduleState.items = selected ? await resolveSnapshotEvidence(selected, context, state.definitions.themes, state.corrections) : [];
    moduleState.items.forEach(item => { if (!item.snapshot) item.snapshot = selected; });
    moduleState.tree = buildThemeTree(state.definitions.themes, state.corrections);
  }

  function setRoute(route, push) {
    moduleState.route = route;
    if (push && moduleState.open) {
      const current = history.state && typeof history.state === "object" ? history.state : {};
      moduleState.routeDepth += 1;
      history.pushState({ ...current, [ROUTE_STATE_KEY]: { type: route.type, id: route.id || "", themeId: route.themeId || "", parentId: route.parentId || "", arborId: route.arborId || "", surface: route.surface || "", citationId: route.citationId || "", snapshotId: moduleState.selectedSnapshotId || "", depth: moduleState.routeDepth } }, "", location.href);
    }
    render();
  }

  function setStatus(message, isError) {
    liveStatus.textContent = message || "";
    liveStatus.classList.toggle("is-error", Boolean(isError));
  }

  async function render() {
    if (!moduleState.open) return false;
    const token = ++moduleState.renderToken;
    await refreshData();
    if (token !== moduleState.renderToken || !moduleState.open) return false;
    const state = currentState();
    nav.innerHTML = renderNavigation(state, moduleState.route, moduleState.context);
    content.innerHTML = renderRouteBody(moduleState.route, moduleState.context || { notes: [] }, state, moduleState.items, moduleState.tree, moduleState.selectedSnapshotId, moduleState.activeBranchSnapshotId);
    panel.querySelector("[data-arbor-title]").textContent = routeTitle(moduleState.route, state);
    const sourceSelect = content.querySelector("#arbor-source-note");
    if (sourceSelect) updateSelectedSource(sourceSelect.value);
    const firstControl = content.querySelector("h1, input, select, button");
    if (firstControl && moduleState.route.type !== "library") firstControl.setAttribute("tabindex", firstControl.matches("h1") ? "-1" : firstControl.getAttribute("tabindex") || "0");
    if (moduleState.route.type === "add-arbor") content.querySelector("#arbor-name")?.focus();
    else if (moduleState.route.type === "add-theme") content.querySelector("#arbor-theme-name")?.focus();
    else if (moduleState.route.type === "rename-arbor") content.querySelector("#arbor-rename-name")?.focus();
    else if (moduleState.route.type === "rename-theme") content.querySelector("#arbor-rename-theme-name")?.focus();
    return true;
  }

  function updateSelectedSource(noteId) {
    const note = (moduleState.context && moduleState.context.notes || []).find(item => item.noteId === noteId && item.bodyAvailable);
    const pre = content.querySelector("[data-source-body]");
    if (!pre || !note) return;
    renderSourceNotes(pre, localBodyContext(note));
    const status = content.querySelector("[data-selection-status]");
    if (status) status.textContent = "No passage selected.";
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
  }

  async function open() {
    if (moduleState.open) return;
    moduleState.focusBeforeOpen = document.activeElement;
    moduleState.open = true;
    moduleState.route = { type: "library" };
    moduleState.routeDepth = 0;
    moduleState.selectedSnapshotId = "";
    const context = await settings.api.getArborContext();
    if (!context || !context.ready || !context.accountId) {
      moduleState.open = false;
      settings.api.showArborStatus("Sign in to see the Arbors saved for this account.");
      return;
    }
    ensureStore(context);
    const current = history.state && typeof history.state === "object" ? history.state : {};
    history.pushState({ ...current, [ROUTE_STATE_KEY]: { type: "library", depth: 1 } }, "", location.href);
    moduleState.routeDepth = 1;
    const rendered = await render();
    if (!rendered || !moduleState.open) return;
    if (!moduleState.context || !moduleState.context.ready || moduleState.context.accountId !== context.accountId) {
      closeToUnderlying();
      settings.api.showArborStatus("The signed-in account changed. Reopen Arbors to continue.");
      return;
    }
    setBackgroundInert(true);
    setPanelVisible(panel, true);
    trigger.setAttribute("aria-expanded", "true");
    handleSyncStatus();
    closeButton.focus();
  }

  function close(restoreFocus) {
    if (!moduleState.open) return;
    moduleState.open = false;
    moduleState.renderToken += 1;
    setPanelVisible(panel, false);
    setBackgroundInert(false);
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus !== false && moduleState.focusBeforeOpen && moduleState.focusBeforeOpen.isConnected) moduleState.focusBeforeOpen.focus();
  }

  function closeToUnderlying() {
    if (!moduleState.open) return;
    const depth = moduleState.routeDepth;
    if (depth > 0) history.go(-depth);
    close(false);
  }

  function handlePopState(event) {
    if (!moduleState.open) return;
    const route = event.state && event.state[ROUTE_STATE_KEY];
    if (!route) {
      close(true);
      return;
    }
    const depth = Number(route.depth);
    moduleState.routeDepth = Number.isInteger(depth) && depth > 0 ? depth : Math.max(1, moduleState.routeDepth - 1);
    moduleState.route = { ...route };
    moduleState.selectedSnapshotId = route.snapshotId || "";
    render();
  }

  function handleKeydown(event) {
    if (!moduleState.open) return;
    if (event.key === "Escape" && !event.isComposing) {
      event.preventDefault();
      if (moduleState.routeDepth > 1) history.back();
      else history.back();
      return;
    }
    if (event.key === "Tab") {
      const focusable = Array.from(panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(element => !element.hidden && !element.closest("[hidden]") && !element.closest("[inert]") && element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        content.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  async function createArbor(form) {
    const name = String(new FormData(form).get("name") || "").trim();
    if (!name) return;
    const store = moduleState.store;
    const created = store.addArbor({ id: newId("arbor"), label: name });
    setStatus("Arbor created.");
    setRoute({ type: "arbor", id: created.definitions.arbors.at(-1).id }, true);
  }

  async function createTheme(form) {
    const name = String(new FormData(form).get("name") || "").trim();
    if (!name) return;
    const parentId = form.dataset.parent || null;
    const arborId = form.dataset.arbor;
    const store = moduleState.store;
    const created = store.addTheme({ id: newId("theme"), arborId, parentThemeId: parentId, label: name });
    const theme = created.definitions.themes.at(-1);
    setStatus("Theme created.");
    setRoute({ type: "theme", id: theme.id }, true);
  }

  function recordThemeRename(themeId, label) {
    const state = currentState();
    const theme = state.definitions.themes.find(item => item.id === themeId);
    if (!theme || !moduleState.store || !moduleState.context || !moduleState.context.ready) throw new Error("This theme is no longer available in the signed-in account.");
    const currentLabel = activeThemeOverrides(state.corrections).labels.get(themeId) || theme.label;
    const nextLabel = String(label || "").trim();
    if (!nextLabel) throw new Error("Enter a name for this theme.");
    if (nextLabel === currentLabel) {
      setStatus("The theme name is unchanged.");
      setRoute({ type: "theme", id: themeId }, true);
      return;
    }
    moduleState.store.recordCorrection({
      id: newId("correction"),
      kind: "rename",
      target: { entityType: "theme", id: themeId },
      before: { label: currentLabel },
      after: { label: nextLabel }
    });
    setStatus("Theme renamed. Its source notes were not changed.");
    setRoute({ type: "theme", id: themeId }, true);
  }

  async function renameTheme(form) {
    recordThemeRename(form.dataset.theme, new FormData(form).get("name"));
  }

  function recordArborRename(arborId, label) {
    const state = currentState();
    const arbor = state.definitions.arbors.find(item => item.id === arborId);
    if (!arbor || !moduleState.store || !moduleState.context || !moduleState.context.ready) throw new Error("This Arbor is no longer available in the signed-in account.");
    const currentLabel = activeThemeOverrides(state.corrections).labels.get(arborId) || arbor.label;
    const nextLabel = String(label || "").trim();
    if (!nextLabel) throw new Error("Enter a name for this Arbor.");
    if (nextLabel === currentLabel) {
      setStatus("The Arbor name is unchanged.");
      setRoute({ type: "arbor", id: arborId }, true);
      return;
    }
    moduleState.store.recordCorrection({
      id: newId("correction"),
      kind: "rename",
      target: { entityType: "arbor", id: arborId },
      before: { label: currentLabel },
      after: { label: nextLabel }
    });
    setStatus("Arbor renamed. Its themes and source notes were not changed.");
    setRoute({ type: "arbor", id: arborId }, true);
  }

  async function renameArbor(form) {
    recordArborRename(form.dataset.arbor, new FormData(form).get("name"));
  }

  function setThemeHidden(themeId, hidden) {
    const state = currentState();
    const theme = state.definitions.themes.find(item => item.id === themeId);
    if (!theme || !moduleState.store || !moduleState.context || !moduleState.context.ready) throw new Error("This theme is no longer available in the signed-in account.");
    const wasHidden = activeThemeOverrides(state.corrections).hidden.has(themeId);
    if (wasHidden === hidden) {
      setRoute({ type: "arbor", id: theme.arborId }, true);
      return;
    }
    moduleState.store.recordCorrection({
      id: newId("correction"),
      kind: "hide",
      target: { entityType: "theme", id: themeId },
      before: { hidden: wasHidden },
      after: { hidden }
    });
    setStatus(hidden ? "Theme hidden. Its saved passages are preserved." : "Theme shown again. Its saved passages are preserved.");
    setRoute({ type: "arbor", id: theme.arborId }, true);
  }

  function undoCorrection(correctionId) {
    if (!moduleState.store || !moduleState.context || !moduleState.context.ready) throw new Error("Reopen Arbors in the signed-in account before changing its themes.");
    moduleState.store.undoCorrection(correctionId);
    setStatus("The last Arbor change was undone. Its source notes were not changed.");
    setRoute({ ...moduleState.route }, true);
  }

  function selectionRange(pre, body) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!pre.contains(range.startContainer) || !pre.contains(range.endContainer)) return null;
    const textNode = pre.firstChild;
    if (!textNode || range.startContainer !== textNode || range.endContainer !== textNode) return null;
    const start = range.startOffset;
    const end = range.endOffset;
    if (body.slice(start, end) !== selection.toString()) return null;
    return { start, end };
  }

  async function addSource(form) {
    const values = new FormData(form);
    const themeId = form.dataset.theme;
    const context = await settings.api.getArborContext();
    if (!context || context.accountId !== moduleState.accountId || context.session !== moduleState.context.session || !context.ready) throw new Error("The signed-in account changed. Reopen Arbors to continue.");
    ensureStore(context);
    const state = currentState();
    const theme = state.definitions.themes.find(item => item.id === themeId);
    const path = theme && themePath(themeId, state.definitions.themes, state.corrections);
    if (!theme || !path) throw new Error("This theme is no longer available.");
    const noteId = String(values.get("noteId") || "");
    const note = context.notes.find(item => item.noteId === noteId && item.bodyAvailable);
    if (!note) throw new Error("The source note is no longer available in this browser.");
    const pre = content.querySelector("[data-source-body]");
    const range = pre && selectionRange(pre, note.body);
    if (!range) throw new Error("Select one exact passage from the note text first.");
    const excerpt = note.body.slice(range.start, range.end);
    if (!excerpt.trim()) throw new Error("Select a passage that contains text.");
    const sourceType = String(values.get("sourceType") || "writer");
    if (!ACTIVE_VOICE_TYPES.has(sourceType)) throw new Error("Choose a supported source type.");
    const attribution = String(values.get("attribution") || "").trim();
    const sourceLabel = String(values.get("sourceLabel") || "").trim();
    const reference = String(values.get("reference") || "");
    if (sourceType === "attributed" && !attribution) throw new Error("Add the attribution as written in your note.");
    if (sourceType === "reference-only" && reference !== excerpt) throw new Error("The reference must exactly match the selected passage.");
    const anchor = await createPassageAnchor({ noteId, body: note.body, start: range.start, end: range.end, matchProvenance: "userSelection" });
    const now = isoNow();
    const packet = await buildArborEvidencePacket({
      createdAt: now,
      requestedAsOf: now,
      notes: [{ noteId, body: note.body, createdAt: noteDate(note.createdAt), editedAt: noteDate(note.modifiedAt), archived: note.archived }],
      anchors: [anchor],
      memberships: [{ noteId, passageId: anchor.passageId, managedBy: "user", themePath: path }],
      voiceMetadata: [{ noteId, passageId: anchor.passageId, managedBy: "user", sourceType, attribution: attribution || null, sourceLabel: sourceLabel || null, reference: sourceType === "reference-only" ? reference : null }],
      limits: { items: 1, excerptCodeUnits: 1200, packetBytes: 8192 }
    });
    const evidenceItem = packet.items[0];
    if (!evidenceItem || evidenceItem.status !== "resolved") throw new Error(evidenceItem ? statusLabel(evidenceItem) : "Arbor could not verify the exact source passage.");
    evidenceItem.attribution = sourceType === "attributed" ? attribution : "";
    evidenceItem.sourceLabel = sourceType === "saved-source" ? sourceLabel : "";
    const latest = chooseLatestSnapshot(state.snapshots, moduleState.activeBranchSnapshotId);
    const existingPassage = latest && latest.citations.find(citation => citation.noteId === noteId && citation.passageId === anchor.passageId);
    if (existingPassage) {
      const requestedAttribution = sourceType === "attributed" ? attribution : sourceType === "saved-source" ? sourceLabel : "";
      const existingAttribution = existingPassage.attribution || "";
      const requestedReference = sourceType === "reference-only" ? reference : "";
      const existingReference = existingPassage.sourceType === "reference-only" ? existingPassage.excerpt : "";
      if (existingPassage.sourceType !== sourceType || existingAttribution !== requestedAttribution || existingReference !== requestedReference) {
        throw new Error("This exact passage already has a source voice. Keep the same voice and label across its themes.");
      }
    }
    const snapshot = await makeSnapshotFromEvidence(latest, evidenceItem, path, state.corrections, now);
    const sameAccount = await settings.api.getArborContext();
    if (!sameAccount || sameAccount.accountId !== context.accountId || sameAccount.session !== context.session || !sameAccount.ready) throw new Error("The signed-in account changed before this passage could be saved.");
    moduleState.store.appendSnapshot(snapshot);
    moduleState.activeBranchSnapshotId = snapshot.id;
    moduleState.selectedSnapshotId = snapshot.id;
    selectionClear();
    setStatus("Passage saved to " + path.labels.at(-1) + ". The note itself was not changed.");
    setRoute({ type: "theme", id: themeId }, true);
  }

  async function savePlacementChange(citationId, themeId, targetThemeId) {
    const originalContext = moduleState.context;
    const context = await settings.api.getArborContext();
    if (!originalContext || !context || context.accountId !== moduleState.accountId || context.session !== originalContext.session || !context.ready) {
      throw new Error("The signed-in account changed. Reopen Arbors to continue.");
    }
    const state = currentState();
    const previous = chooseLatestSnapshot(state.snapshots, moduleState.activeBranchSnapshotId);
    if (!previous) throw new Error("There is no saved overview to change.");
    const selected = state.snapshots.find(snapshot => snapshot.id === moduleState.selectedSnapshotId) || previous;
    if (selected.id !== previous.id) throw new Error("Return to the latest overview before changing passage placements.");
    const theme = state.definitions.themes.find(item => item.id === themeId);
    const citation = previous.citations.find(item => item.id === citationId);
    if (!theme || moduleState.route.type !== "theme" || moduleState.route.id !== themeId || !citation || citation.themeIds.at(-1) !== themeId) {
      throw new Error("This passage placement is no longer available in this theme.");
    }

    let citations;
    let destinationPath = null;
    if (targetThemeId) {
      const targetTheme = state.definitions.themes.find(item => item.id === targetThemeId);
      const themeDefinitions = state.definitions.themes.filter(item => item.arborId === theme.arborId);
      const visibleThemeIds = new Set(flattenVisibleTree(buildThemeTree(themeDefinitions, state.corrections)).map(item => item.id));
      destinationPath = targetTheme && targetTheme.arborId === theme.arborId && visibleThemeIds.has(targetTheme.id)
        ? themePath(targetTheme.id, state.definitions.themes, state.corrections)
        : null;
      if (!destinationPath) throw new Error("Choose a visible theme in this Arbor.");
      if (JSON.stringify(destinationPath.themeIds) === JSON.stringify(citation.themeIds)) throw new Error("This passage is already placed in that theme.");
      const duplicate = previous.citations.some(item => item.id !== citationId && item.noteId === citation.noteId && item.passageId === citation.passageId && JSON.stringify(item.themeIds) === JSON.stringify(destinationPath.themeIds));
      if (duplicate) throw new Error("This exact passage already has a placement in that theme.");
      citations = previous.citations.map(item => item.id === citationId
        ? { ...item, id: newId("citation"), themeIds: destinationPath.themeIds.slice() }
        : { ...item, themeIds: item.themeIds.slice() });
    } else {
      citations = previous.citations.filter(item => item.id !== citationId).map(item => ({ ...item, themeIds: item.themeIds.slice() }));
    }

    const snapshot = await makeSnapshotFromCitations(previous, citations, state.corrections, isoNow(), destinationPath);
    const confirmedContext = await settings.api.getArborContext();
    if (!confirmedContext || confirmedContext.accountId !== context.accountId || confirmedContext.session !== context.session || !confirmedContext.ready) {
      throw new Error("The signed-in account changed before this placement could be saved.");
    }
    const latestState = currentState();
    if (!getSnapshotBranches(latestState.snapshots).some(item => item.id === previous.id)) throw new Error("Another Arbor change was saved in a different tab. Reload this theme and try again.");
    moduleState.store.appendSnapshot(snapshot);
    moduleState.activeBranchSnapshotId = snapshot.id;
    moduleState.selectedSnapshotId = snapshot.id;
    if (destinationPath) {
      setStatus("Passage moved to " + destinationPath.labels.at(-1) + ". Earlier snapshots and the source note are unchanged.");
      setRoute({ type: "theme", id: targetThemeId }, true);
    } else {
      setStatus("Passage removed from " + (activeThemeOverrides(state.corrections).labels.get(themeId) || theme.label) + ". Earlier snapshots and the source note are unchanged.");
      setRoute({ type: "theme", id: themeId }, true);
    }
  }

  async function movePlacement(form) {
    const values = new FormData(form);
    const targetThemeId = String(values.get("targetTheme") || "");
    if (!targetThemeId) throw new Error("Choose a destination theme.");
    await savePlacementChange(form.dataset.citation, form.dataset.theme, targetThemeId);
  }

  async function restoreThemePlacements(themeId, snapshotId) {
    const originalContext = moduleState.context;
    const context = await settings.api.getArborContext();
    if (!originalContext || !context || context.accountId !== moduleState.accountId || context.session !== originalContext.session || !context.ready) {
      throw new Error("The signed-in account changed. Reopen Arbors to continue.");
    }
    const state = currentState();
    const previous = chooseLatestSnapshot(state.snapshots, moduleState.activeBranchSnapshotId);
    const selected = state.snapshots.find(snapshot => snapshot.id === snapshotId);
    const theme = state.definitions.themes.find(item => item.id === themeId);
    const selectedIncludesTheme = selected && ((selected.themePaths || []).some(path => path.themeIds.includes(themeId)) || selected.citations.some(citation => citation.themeIds.includes(themeId)));
    if (!previous || !selected || selected.id === previous.id || !selectedIncludesTheme || !theme || moduleState.route.type !== "theme" || moduleState.route.id !== themeId || moduleState.route.surface !== "history" || moduleState.selectedSnapshotId !== snapshotId) {
      throw new Error("This saved theme history is no longer available to restore.");
    }
    const currentThemePath = themePath(themeId, state.definitions.themes, state.corrections);
    if (!currentThemePath) throw new Error("This theme is no longer available.");
    const latestUnrelated = previous.citations.filter(citation => !citation.themeIds.includes(themeId));
    const restored = selected.citations.filter(citation => citation.themeIds.includes(themeId)).map(citation => {
      const leafThemeId = citation.themeIds.at(-1);
      const leafPath = themePath(leafThemeId, state.definitions.themes, state.corrections);
      const leafTheme = state.definitions.themes.find(item => item.id === leafThemeId);
      if (!leafTheme || leafTheme.arborId !== theme.arborId || !leafPath || !leafPath.themeIds.includes(themeId)) {
        throw new Error("A theme in this saved history has moved or is unavailable. Review its current history before restoring.");
      }
      return { ...citation, id: newId("citation"), themeIds: leafPath.themeIds.slice() };
    });
    const snapshot = await makeSnapshotFromCitations(previous, [...latestUnrelated, ...restored], state.corrections, isoNow(), currentThemePath);
    const confirmedContext = await settings.api.getArborContext();
    if (!confirmedContext || confirmedContext.accountId !== context.accountId || confirmedContext.session !== context.session || !confirmedContext.ready) {
      throw new Error("The signed-in account changed before this history could be restored.");
    }
    const latestState = currentState();
    if (!getSnapshotBranches(latestState.snapshots).some(item => item.id === previous.id)) throw new Error("Another Arbor change was saved in a different tab. Reload this theme and try again.");
    moduleState.store.appendSnapshot(snapshot);
    moduleState.activeBranchSnapshotId = snapshot.id;
    moduleState.selectedSnapshotId = snapshot.id;
    setStatus("This theme and its child themes were restored in a new snapshot. The source note and other branches are unchanged.");
    setRoute({ type: "theme", id: themeId, surface: "history" }, true);
  }

  function selectionClear() {
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
  }

  async function handleSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    setStatus("", false);
    try {
      if (form.dataset.form === "arbor") await createArbor(form);
      else if (form.dataset.form === "theme") await createTheme(form);
      else if (form.dataset.form === "rename-theme") await renameTheme(form);
      else if (form.dataset.form === "rename-arbor") await renameArbor(form);
      else if (form.dataset.form === "source") await addSource(form);
      else if (form.dataset.form === "move-placement") await movePlacement(form);
    } catch (error) {
      setStatus(error && error.message || "Arbor could not save this change.", true);
    }
  }

  async function handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button || !panel.contains(button)) return;
    const action = button.dataset.action;
    if (action === "close") { closeToUnderlying(); return; }
    if (action === "library") { setRoute({ type: "library" }, true); return; }
    if (action === "back") { if (moduleState.routeDepth > 1) history.back(); else setRoute({ type: "library" }, true); return; }
    if (action === "arbor") { setRoute({ type: "arbor", id: button.dataset.id }, true); return; }
    if (action === "theme") { setRoute({ type: "theme", id: button.dataset.id }, true); return; }
    if (action === "add-arbor") { setRoute({ type: "add-arbor" }, true); return; }
    if (action === "add-theme") { setRoute({ type: "add-theme", arborId: button.dataset.arbor }, true); return; }
    if (action === "add-child") { setRoute({ type: "add-theme", parentId: button.dataset.theme }, true); return; }
    if (action === "add-source") { setRoute({ type: "add-source", themeId: button.dataset.theme }, true); return; }
    if (action === "rename-theme") { setRoute({ type: "rename-theme", id: button.dataset.id }, true); return; }
    if (action === "rename-arbor") { setRoute({ type: "rename-arbor", id: button.dataset.id }, true); return; }
    if (action === "hide-theme") { setThemeHidden(button.dataset.id, true); return; }
    if (action === "unhide-theme") { setThemeHidden(button.dataset.id, false); return; }
    if (action === "remove-placement") {
      try { await savePlacementChange(button.dataset.citation, button.dataset.theme, ""); }
      catch (error) { setStatus(error && error.message || "The passage placement could not be removed.", true); }
      return;
    }
    if (action === "restore-theme-placements") {
      try { await restoreThemePlacements(button.dataset.theme, button.dataset.snapshot); }
      catch (error) { setStatus(error && error.message || "The saved theme placements could not be restored.", true); }
      return;
    }
    if (action === "undo-correction") {
      try { undoCorrection(button.dataset.correction); }
      catch (error) { setStatus(error && error.message || "The Arbor change could not be undone.", true); }
      return;
    }
    if (action === "surface") {
      const current = moduleState.route.surface === button.dataset.surface ? "" : button.dataset.surface;
      setRoute({ ...moduleState.route, surface: current }, true);
      return;
    }
    if (action === "history-snapshot") {
      const snapshot = currentState().snapshots.find(item => item.id === button.dataset.snapshot);
      if (!snapshot) return;
      moduleState.selectedSnapshotId = snapshot.id;
      setRoute({ ...moduleState.route, surface: "history" }, true);
      return;
    }
    if (action === "history-branch") {
      const snapshot = currentState().snapshots.find(item => item.id === button.dataset.snapshot);
      if (!snapshot || !getSnapshotBranches(currentState().snapshots).some(item => item.id === snapshot.id)) return;
      moduleState.activeBranchSnapshotId = snapshot.id;
      moduleState.selectedSnapshotId = snapshot.id;
      setRoute({ ...moduleState.route, surface: "history" }, true);
      return;
    }
    if (action === "latest-snapshot") {
      moduleState.selectedSnapshotId = "";
      setRoute({ ...moduleState.route }, true);
      return;
    }
    if (action === "source") {
      setRoute({ type: "source", citationId: button.dataset.citation }, true);
      return;
    }
    if (action === "open-note") {
      const noteId = button.dataset.note;
      const item = moduleState.items.find(entry => entry.citation.id === button.dataset.citation && entry.citation.noteId === noteId);
      closeToUnderlying();
      if (item && item.anchor && typeof settings.api.openPassage === "function") settings.api.openPassage(noteId, item.anchor);
      else settings.api.openNote(noteId);
    }
  }

  function handleChange(event) {
    if (event.target.id === "arbor-source-note") updateSelectedSource(event.target.value);
    if (event.target.id === "arbor-source-type") {
      content.querySelectorAll("[data-voice-fields]").forEach(field => { field.hidden = field.dataset.voiceFields !== event.target.value; });
    }
  }

  function handleSelectionChange() {
    const pre = content.querySelector("[data-source-body]");
    const noteId = pre && pre.dataset.sourceBody;
    const note = (moduleState.context && moduleState.context.notes || []).find(item => item.noteId === noteId);
    const status = content.querySelector("[data-selection-status]");
    if (!pre || !note || !status) return;
    const range = selectionRange(pre, note.body);
    status.textContent = range ? "Exact passage selected · " + (range.end - range.start) + " characters" : "No exact passage selected.";
  }

  function handleAccountChange() {
    if (moduleState.open) {
      if (moduleState.routeDepth > 0) history.go(-moduleState.routeDepth);
      close(false);
    }
    moduleState.context = null;
    moduleState.store = null;
    moduleState.accountId = "";
    moduleState.items = [];
    moduleState.selectedSnapshotId = "";
    nav.innerHTML = "";
    content.innerHTML = "";
    panel.querySelector("[data-arbor-title]").textContent = "Arbors";
    setStatus("");
    moduleState.focusBeforeOpen = null;
  }

  async function redactDeletedNote(noteId, expectedContext) {
    const context = await settings.api.getArborContext();
    if (!context || !context.ready || context.demo || !context.accountId) return { redactedCitationCount: 0, removedObservationCount: 0 };
    if (expectedContext && (context.accountId !== expectedContext.accountId || context.session !== expectedContext.session)) {
      return { redactedCitationCount: 0, removedObservationCount: 0 };
    }
    if (moduleState.accountId !== context.accountId || !moduleState.store) ensureStore(context);
    const result = moduleState.store.redactDeletedNote(noteId);
    if (moduleState.open) await render();
    return result;
  }

  function handleDeletedNote(event) {
    const detail = event && event.detail;
    const expectedContext = detail && detail.context;
    if (!detail || typeof detail.noteId !== "string" || !detail.noteId
        || !expectedContext || typeof expectedContext.accountId !== "string"
        || expectedContext.session == null) return;
    redactDeletedNote(detail.noteId, expectedContext).catch(error => {
      if (typeof settings.api.showArborStatus === "function") settings.api.showArborStatus(error && error.message || "A deleted source could not be redacted from Arbor history.");
    });
  }

  function handleSyncedState() {
    if (moduleState.open) render().catch(() => {});
  }

  function handleSyncStatus(event) {
    if (!moduleState.open) return;
    const status = event && event.detail || (typeof settings.api.getArborSyncStatus === "function" ? settings.api.getArborSyncStatus() : null);
    if (status && status.message) setStatus(status.message, status.status === "error");
  }

  trigger.addEventListener("click", open);
  closeButton.addEventListener("click", () => closeToUnderlying());
  panel.addEventListener("submit", handleSubmit);
  panel.addEventListener("click", handleClick);
  panel.addEventListener("change", handleChange);
  document.addEventListener("selectionchange", handleSelectionChange);
  document.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("arbor:account-change", handleAccountChange);
  document.addEventListener("arbor:note-deleted", handleDeletedNote);
  document.addEventListener("arbor:state-sync-updated", handleSyncedState);
  document.addEventListener("arbor:sync-status-changed", handleSyncStatus);
  window.addEventListener("popstate", handlePopState);

  if (typeof settings.api.getPendingDeletedNoteRedactions === "function") {
    settings.api.getPendingDeletedNoteRedactions().forEach(entry => {
      redactDeletedNote(entry.noteId, entry.context).catch(() => {});
    });
  }

  return { open, close, render, redactDeletedNote };
}
