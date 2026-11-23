(function attachArborNoteHistory(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborNoteHistory = api;
})(globalThis, function createArborNoteHistory() {
  const STORAGE_PREFIX = "arbor.web.note-history.v1::";
  const MAX_ENTRIES = 100;

  function storageKey(accountKey) {
    return STORAGE_PREFIX + encodeURIComponent(String(accountKey || ""));
  }

  function normalize(value) {
    if (!value || !Array.isArray(value.recordNames)) return { recordNames: [], index: -1 };
    const recordNames = value.recordNames.filter(function (name) {
      return typeof name === "string" && name.length > 0 && name.length <= 256;
    }).slice(-MAX_ENTRIES);
    const offset = value.recordNames.length - recordNames.length;
    const index = Number.isInteger(value.index) ? value.index - offset : recordNames.length - 1;
    return {
      recordNames: recordNames,
      index: recordNames.length ? Math.max(0, Math.min(recordNames.length - 1, index)) : -1
    };
  }

  function load(storage, accountKey) {
    try {
      return normalize(JSON.parse(storage.getItem(storageKey(accountKey)) || "null"));
    } catch (_) {
      return { recordNames: [], index: -1 };
    }
  }

  function save(storage, accountKey, history) {
    const value = normalize(history);
    try {
      if (!value.recordNames.length) storage.removeItem(storageKey(accountKey));
      else storage.setItem(storageKey(accountKey), JSON.stringify(value));
    } catch (_) {}
    return value;
  }

  function visit(history, recordName) {
    const current = normalize(history);
    const name = String(recordName || "");
    if (!name || current.index >= 0 && current.recordNames[current.index] === name) return current;
    const recordNames = current.recordNames.slice(0, current.index + 1);
    recordNames.push(name);
    const trimmed = recordNames.slice(-MAX_ENTRIES);
    return { recordNames: trimmed, index: trimmed.length - 1 };
  }

  function shouldSuppressRestoredSelection(notes, preferredName, previouslyHiddenName) {
    const byName = new Map((Array.isArray(notes) ? notes : []).map(function (note) {
      return [note.recordName, note];
    }));
    function unavailable(name) {
      if (!name) return false;
      const note = byName.get(name);
      return !note || Boolean(note.archived);
    }
    return unavailable(preferredName) || unavailable(previouslyHiddenName);
  }

  return Object.freeze({
    load: load,
    save: save,
    storageKey: storageKey,
    visit: visit,
    shouldSuppressRestoredSelection: shouldSuppressRestoredSelection,
    maxEntries: MAX_ENTRIES
  });
});
