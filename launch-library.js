// Instant launch cache and the short edit queue.
// Recently opened note text kept here is unencrypted in this browser.
// Signing out deletes it. iCloud notes are a separate copy.

(function attachArborLaunchLibrary(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborLaunchLibrary = api;
})(globalThis, function createArborLaunchLibrary() {
  const OPENED_BODY_LIMIT = 30;
  const EDIT_QUEUE_LIMIT = 8;
  const EDIT_QUEUE_KEY_PREFIX = "arbor.web.pending-edit.";

  function rememberOpenedBodies(entries, recordName, body, limit) {
    const cap = Number.isInteger(limit) && limit > 0 ? limit : OPENED_BODY_LIMIT;
    const name = String(recordName || "");
    const next = (Array.isArray(entries) ? entries : []).filter(function (entry) {
      return Array.isArray(entry) && entry[0] !== name;
    });
    if (name) next.push([name, typeof body === "string" ? body : String(body || "")]);
    while (next.length > cap) next.shift();
    return next;
  }

  function cachedLibraryIsPaintable(snapshot) {
    return Boolean(snapshot && Array.isArray(snapshot.records) && snapshot.records.length);
  }

  function editQueueKey(accountId) {
    return EDIT_QUEUE_KEY_PREFIX + encodeURIComponent(String(accountId || ""));
  }

  function normalizeEditQueue(value) {
    if (!Array.isArray(value)) return [];
    const byName = new Map();
    value.forEach(function (item) {
      if (!item || typeof item.recordName !== "string" || !item.recordName) return;
      const body = item.body;
      if (typeof body !== "string" && (!body || typeof body !== "object")) return;
      byName.set(item.recordName, {
        recordName: item.recordName,
        title: String(item.title || "Untitled"),
        body: typeof body === "string" ? body : { title: String(body.title || "Untitled"), body: String(body.body || "") },
        updatedAt: Number(item.updatedAt) || 0,
        base: normalizeEditBase(item.base)
      });
    });
    return Array.from(byName.values()).sort(function (left, right) {
      return left.updatedAt - right.updatedAt;
    }).slice(-EDIT_QUEUE_LIMIT);
  }

  function normalizeEditBase(base) {
    if (!base || typeof base !== "object") return null;
    return {
      recordChangeTag: String(base.recordChangeTag || ""),
      modifiedAt: base.modifiedAt == null ? "" : String(base.modifiedAt),
      contentFingerprint: String(base.contentFingerprint || ""),
      title: String(base.title || ""),
      body: typeof base.body === "string" ? base.body : ""
    };
  }

  function upsertPendingEdit(queue, edit, limit) {
    const cap = Number.isInteger(limit) && limit > 0 ? limit : EDIT_QUEUE_LIMIT;
    const name = edit && edit.recordName;
    if (!name) return normalizeEditQueue(queue);
    const prior = normalizeEditQueue(queue).find(function (item) { return item.recordName === name; });
    const next = normalizeEditQueue(queue).filter(function (item) { return item.recordName !== name; });
    next.push({
      recordName: name,
      title: String(edit.title || "Untitled"),
      body: edit.body,
      updatedAt: Number(edit.updatedAt) || Date.now(),
      base: prior && prior.base ? prior.base : normalizeEditBase(edit.base)
    });
    return normalizeEditQueue(next).slice(-cap);
  }

  function removePendingEdit(queue, recordName) {
    return normalizeEditQueue(queue).filter(function (item) { return item.recordName !== recordName; });
  }

  // Keep the unsent text, but point its base at the revision this device just
  // saved. The next save then sends that recordChangeTag instead of the one
  // the burst started from.
  function rebasePendingEdit(queue, recordName, base) {
    const normalized = normalizeEditBase(base);
    if (!recordName || !normalized || !normalized.recordChangeTag) return normalizeEditQueue(queue);
    let found = false;
    const next = normalizeEditQueue(queue).map(function (edit) {
      if (edit.recordName !== recordName) return edit;
      found = true;
      return Object.assign({}, edit, { base: normalized });
    });
    return found ? next : normalizeEditQueue(queue);
  }

  function isNetworkSaveFailure(error) {
    const values = [error && error.reason, error && error.message, error && error.description, error && error.code, error && error.serverErrorCode];
    const text = values.filter(Boolean).join(" ");
    return /NETWORK_ERROR|network error|failed to fetch|load failed|offline|the internet connection appears to be offline/i.test(text);
  }

  function cloudKitTitleQuery(nativeSchema, zoneID, text) {
    const query = String(text || "").trim();
    if (!query) return null;
    const fieldName = nativeSchema ? "CD_userTitle" : "relativePath";
    const recordType = nativeSchema ? "CD_CapturedNote" : "ArborNote";
    const zone = zoneID && zoneID.zoneName ? zoneID : (nativeSchema ? null : { zoneName: "ArborNotes" });
    return {
      recordType: recordType,
      filterBy: [{
        comparator: "CONTAINS_ALL_TOKENS",
        fieldName: fieldName,
        fieldValue: { value: query, type: "STRING" }
      }],
      resultsLimit: 50,
      zoneID: zone
    };
  }

  function searchBody(note, bodyLoaded) {
    if (!bodyLoaded || !note) return "";
    if (typeof note.editorBody === "string") return note.editorBody;
    return typeof note.body === "string" ? note.body : "";
  }

  return Object.freeze({
    OPENED_BODY_LIMIT: OPENED_BODY_LIMIT,
    EDIT_QUEUE_LIMIT: EDIT_QUEUE_LIMIT,
    EDIT_QUEUE_KEY_PREFIX: EDIT_QUEUE_KEY_PREFIX,
    rememberOpenedBodies: rememberOpenedBodies,
    cachedLibraryIsPaintable: cachedLibraryIsPaintable,
    editQueueKey: editQueueKey,
    normalizeEditQueue: normalizeEditQueue,
    normalizeEditBase: normalizeEditBase,
    upsertPendingEdit: upsertPendingEdit,
    removePendingEdit: removePendingEdit,
    rebasePendingEdit: rebasePendingEdit,
    isNetworkSaveFailure: isNetworkSaveFailure,
    cloudKitTitleQuery: cloudKitTitleQuery,
    searchBody: searchBody
  });
});
