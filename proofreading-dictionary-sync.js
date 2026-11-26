(function attachArborProofreadingDictionarySync(root, factory) {
  const contract = root.ArborPersonalProofreadingDictionary
    || (typeof require === "function" ? require("./personal-dictionary.js") : null);
  if (!contract) return;
  const api = factory(contract);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborProofreadingDictionarySync = api;
})(globalThis, function createArborProofreadingDictionarySync(dictionary) {
  "use strict";

  const contract = dictionary.contract;

  function fieldValue(record, key) {
    const field = record && record.fields && record.fields[key];
    return field && Object.prototype.hasOwnProperty.call(field, "value") ? field.value : field;
  }

  function responseErrors(response) {
    const errors = Array.isArray(response && response.errors) ? response.errors : [];
    return errors.map(function (error) {
      return [
        error && error.reason,
        error && error.message,
        error && error.description,
        error && error.serverErrorCode,
        error && error.errorCode
      ].filter(Boolean).join(" ");
    });
  }

  function assertResponse(response) {
    if (!response) throw new Error("CloudKit returned no response.");
    if (response.hasErrors || response.isError) {
      const descriptions = responseErrors(response);
      throw new Error(descriptions.join("; ") || "CloudKit could not save the proofreading dictionary.");
    }
    return response;
  }

  function isMissingRecord(response) {
    const errors = responseErrors(response);
    return errors.length > 0 && errors.every(function (message) {
      return /UNKNOWN_ITEM|unknown item|record[^.]*not found|could not find[^.]*record/i.test(message);
    });
  }

  function isRecordConflict(error) {
    return /SERVER_RECORD_CHANGED|serverRecordChanged|record.*changed/i.test(String(error && error.message || error));
  }

  async function fetchRecord(database) {
    const response = await database.fetchRecords([contract.recordName]);
    if (response && (response.hasErrors || response.isError)) {
      if (isMissingRecord(response)) return null;
      assertResponse(response);
    }
    return (response.records || []).find(function (record) {
      return record.recordName === contract.recordName;
    }) || null;
  }

  function makeRecord(entries, existingRecord) {
    const record = existingRecord || {
      recordName: contract.recordName,
      recordType: contract.recordType,
      fields: {}
    };
    record.fields = Object.assign({}, record.fields || {}, {
      [contract.fieldName]: { value: dictionary.encodeSnapshot(entries) }
    });
    return record;
  }

  function decodeRecord(record) {
    return dictionary.decodeSnapshot(fieldValue(record, contract.fieldName));
  }

  function sameOperation(left, right) {
    return left && right
      && left.normalizedTerm === right.normalizedTerm
      && left.modifiedAt === right.modifiedAt
      && left.isDeleted === right.isDeleted;
  }

  async function synchronize(database, pendingEntries) {
    if (!database || typeof database.fetchRecords !== "function" || typeof database.saveRecords !== "function") {
      throw new Error("CloudKit dictionary sync is unavailable.");
    }

    let pending = dictionary.normalizeSnapshotEntries(pendingEntries);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await fetchRecord(database);
      const remote = decodeRecord(existing);
      const remoteByKey = new Map(remote.map(function (entry) {
        return [entry.normalizedTerm, entry];
      }));
      const ready = [];
      const remaining = [];

      pending.forEach(function (operation) {
        const current = remoteByKey.get(operation.normalizedTerm);
        if (current && current.modifiedAt > operation.modifiedAt) {
          remaining.push(operation);
        } else {
          ready.push(operation);
        }
      });

      if (!ready.length) {
        return { entries: remote, settled: pending, saved: false };
      }
      const merged = dictionary.mergeSnapshotEntries(remote, ready);
      const record = makeRecord(merged, existing);
      try {
        const response = assertResponse(await database.saveRecords([record]));
        const saved = (response.records || []).find(function (item) {
          return item.recordName === contract.recordName;
        });
        return {
          entries: saved ? decodeRecord(saved) : merged,
          settled: ready,
          saved: true
        };
      } catch (error) {
        if (!isRecordConflict(error) || attempt === 4) throw error;
        // Re-fetch the latest snapshot, then merge the still-pending local operations.
      }
      pending = ready.concat(remaining);
    }
    throw new Error("CloudKit dictionary sync exceeded its conflict retry limit.");
  }

  return Object.freeze({
    contract: contract,
    fetchRecord: fetchRecord,
    makeRecord: makeRecord,
    decodeRecord: decodeRecord,
    synchronize: synchronize
  });
});
