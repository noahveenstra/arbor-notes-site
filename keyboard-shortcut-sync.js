(function attachArborKeyboardShortcutSync(root, factory) {
  const preferences = root.ArborKeyboardShortcutPreferences
    || (typeof require === "function" ? require("./keyboard-shortcut-preferences.js") : null);
  const api = factory(preferences);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborKeyboardShortcutSync = api;
})(globalThis, function createArborKeyboardShortcutSync(preferences) {
  "use strict";

  if (!preferences) throw new Error("The keyboard shortcut preference contract is unavailable.");
  const contract = preferences.contract;

  function fieldValue(record) {
    const field = record && record.fields && record.fields[contract.fieldName];
    return field && Object.prototype.hasOwnProperty.call(field, "value") ? field.value : field;
  }

  function errorText(error) {
    return [error && error.reason, error && error.message, error && error.description, error && error.serverErrorCode, error && error.errorCode].filter(Boolean).join(" ");
  }

  function assertResponse(response) {
    if (!response) throw new Error("CloudKit returned no response for shortcut settings.");
    if (response.hasErrors || response.isError) {
      const errors = Array.isArray(response.errors) ? response.errors.map(errorText).filter(Boolean) : [];
      throw new Error(errors.join("; ") || "CloudKit could not save shortcut settings.");
    }
    return response;
  }

  function isMissingRecord(response) {
    const errors = Array.isArray(response && response.errors) ? response.errors.map(errorText) : [];
    return errors.length > 0 && errors.every(function (message) {
      return /UNKNOWN_ITEM|unknown item|record[^.]*not found|could not find[^.]*record/i.test(message);
    });
  }

  function isRecordConflict(error) {
    return /SERVER_RECORD_CHANGED|serverRecordChanged|record.*changed/i.test(errorText(error));
  }

  async function fetchRecord(database) {
    const response = await database.fetchRecords([contract.recordName]);
    if (response && (response.hasErrors || response.isError)) {
      if (isMissingRecord(response)) return null;
      assertResponse(response);
    }
    return (response.records || []).find(function (record) { return record.recordName === contract.recordName; }) || null;
  }

  function makeRecord(operations, existingRecord) {
    const record = existingRecord || { recordName: contract.recordName, recordType: contract.recordType, fields: {} };
    record.fields = Object.assign({}, record.fields || {}, {
      [contract.fieldName]: { value: preferences.encodeSnapshot(operations) }
    });
    return record;
  }

  function decodeRecord(record) {
    return preferences.decodeSnapshot(fieldValue(record));
  }

  async function synchronize(database, localOperations) {
    if (!database || typeof database.fetchRecords !== "function" || typeof database.saveRecords !== "function") {
      throw new Error("CloudKit shortcut sync is unavailable.");
    }
    const local = preferences.normalizeOperations(localOperations);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await fetchRecord(database);
      const remote = decodeRecord(existing);
      const merged = preferences.mergeOperations(remote, local);
      if (preferences.sameSnapshot(remote, merged)) return { operations: merged, saved: false };
      try {
        const response = assertResponse(await database.saveRecords([makeRecord(merged, existing)]));
        const saved = (response.records || []).find(function (record) { return record.recordName === contract.recordName; });
        return { operations: saved ? decodeRecord(saved) : merged, saved: true };
      } catch (error) {
        if (!isRecordConflict(error) || attempt === 4) throw error;
        // Re-fetch and merge per-command updates after an optimistic-lock conflict.
      }
    }
    throw new Error("CloudKit shortcut sync exceeded its conflict retry limit.");
  }

  return Object.freeze({ contract: contract, fetchRecord: fetchRecord, makeRecord: makeRecord, decodeRecord: decodeRecord, synchronize: synchronize });
});
