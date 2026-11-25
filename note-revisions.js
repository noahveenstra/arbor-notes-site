// Local revision log for a note. Each save stores the author's display name
// at that moment. Later renames do not rewrite older rows.
//
// Shared notes are not implemented in the web client. The record is ready for
// them: authorId identifies the person and authorName is the name they were
// using when they saved. When sharing exists, each collaborator's client can
// append revisions with their own id and name. The history UI prints
// authorName for every row, including the current user's, and never replaces
// it with "you".
(function attachArborNoteRevisions(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborNoteRevisions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArborNoteRevisions() {
  const STORAGE_PREFIX = "arbor.web.note-revisions.v1::";
  const MAX_PER_NOTE = 40;
  const MAX_TOTAL = 400;

  function storageKey(accountKey) {
    return STORAGE_PREFIX + encodeURIComponent(String(accountKey || ""));
  }

  function normalizeRevision(value) {
    if (!value || typeof value !== "object") return null;
    const id = String(value.id || "").trim();
    const noteId = String(value.noteId || "").trim();
    const savedAt = Number(value.savedAt);
    if (!id || id.length > 80 || !noteId || noteId.length > 256 || !Number.isFinite(savedAt)) return null;
    return {
      id: id,
      noteId: noteId,
      savedAt: savedAt,
      authorId: String(value.authorId || "").trim().slice(0, 256),
      authorName: String(value.authorName || "").trim().slice(0, 80)
    };
  }

  function normalizeList(value) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    const revisions = [];
    source.forEach(function (item) {
      const revision = normalizeRevision(item);
      if (!revision || seen.has(revision.id)) return;
      seen.add(revision.id);
      revisions.push(revision);
    });
    return revisions;
  }

  function trim(revisions) {
    const byNote = new Map();
    revisions.forEach(function (revision) {
      const list = byNote.get(revision.noteId) || [];
      list.push(revision);
      byNote.set(revision.noteId, list);
    });
    let kept = [];
    byNote.forEach(function (list) {
      list.sort(function (left, right) { return right.savedAt - left.savedAt || right.id.localeCompare(left.id); });
      kept = kept.concat(list.slice(0, MAX_PER_NOTE));
    });
    kept.sort(function (left, right) { return right.savedAt - left.savedAt || right.id.localeCompare(left.id); });
    return kept.slice(0, MAX_TOTAL);
  }

  function load(storage, accountKey) {
    try {
      const parsed = JSON.parse(storage.getItem(storageKey(accountKey)) || "null");
      return trim(normalizeList(parsed && parsed.revisions));
    } catch (_) {
      return [];
    }
  }

  function save(storage, accountKey, revisions) {
    const value = trim(normalizeList(revisions));
    try {
      if (!value.length) storage.removeItem(storageKey(accountKey));
      else storage.setItem(storageKey(accountKey), JSON.stringify({ revisions: value }));
    } catch (_) {}
    return value;
  }

  function append(revisions, input) {
    const revision = normalizeRevision(input);
    const current = normalizeList(revisions);
    if (!revision) return current;
    if (current.some(function (item) { return item.id === revision.id; })) return current;
    return trim(current.concat([revision]));
  }

  function forNote(revisions, noteId) {
    const name = String(noteId || "");
    return normalizeList(revisions).filter(function (revision) {
      return revision.noteId === name;
    }).sort(function (left, right) {
      return right.savedAt - left.savedAt || right.id.localeCompare(left.id);
    });
  }

  // The stored name is the label. The current user is not rewritten to "you".
  function revisionAuthorLabel(revision) {
    return normalizeRevision(revision) ? normalizeRevision(revision).authorName : "";
  }

  return Object.freeze({
    load: load,
    save: save,
    append: append,
    forNote: forNote,
    revisionAuthorLabel: revisionAuthorLabel,
    storageKey: storageKey,
    maxPerNote: MAX_PER_NOTE,
    maxTotal: MAX_TOTAL
  });
});
