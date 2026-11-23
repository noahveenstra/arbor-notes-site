(function attachArborPersonalProofreadingDictionary(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborPersonalProofreadingDictionary = api;
})(globalThis, function createArborPersonalProofreadingDictionary() {
  const RECORD_TYPE = "ArborProofreadingDictionary";
  const RECORD_NAME = "arbor-proofreading-dictionary-v1";
  const FIELD_NAME = "entriesJSON";
  const SNAPSHOT_VERSION = 1;

  function entry(value) {
    if (typeof value !== "string") return null;
    const term = value.normalize("NFC").trim();
    if (!term) return null;
    return { term: term, key: term.toLowerCase() };
  }

  function normalizeDictionaryEntry(value) {
    return entry(value);
  }

  function normalizeDictionaryEntries(values) {
    const seen = new Set();
    const result = [];
    (Array.isArray(values) ? values : []).forEach(function (value) {
      const normalized = entry(value);
      if (!normalized || seen.has(normalized.key)) return;
      seen.add(normalized.key);
      result.push(normalized.term);
    });
    return result;
  }

  function hasDictionaryEntry(values, value) {
    const target = entry(value);
    if (!target) return false;
    return normalizeDictionaryEntries(values).some(function (candidate) {
      return candidate.toLowerCase() === target.key;
    });
  }

  function addDictionaryEntry(values, value) {
    const result = normalizeDictionaryEntries(values);
    const candidate = entry(value);
    if (!candidate || hasDictionaryEntry(result, candidate.term)) return result;
    result.push(candidate.term);
    return result;
  }

  function removeDictionaryEntry(values, value) {
    const result = normalizeDictionaryEntries(values);
    const target = entry(value);
    if (!target) return result;
    return result.filter(function (candidate) {
      return candidate.toLowerCase() !== target.key;
    });
  }

  function isCased(character) {
    return character.toLowerCase() !== character.toUpperCase();
  }

  function preserveCandidateCasing(source, candidate) {
    if (typeof candidate !== "string" || typeof source !== "string" || !source) return candidate;
    const sourceCase = Array.from(source).filter(isCased).map(function (character) {
      return character === character.toUpperCase();
    });
    if (!sourceCase.length) return candidate;
    if (sourceCase.every(Boolean)) return candidate.toUpperCase();
    if (sourceCase.every(function (uppercase) { return !uppercase; })) return candidate.toLowerCase();

    let letterIndex = 0;
    return Array.from(candidate).map(function (character) {
      if (!isCased(character)) return character;
      const uppercase = sourceCase[letterIndex] === true;
      letterIndex += 1;
      return uppercase ? character.toUpperCase() : character.toLowerCase();
    }).join("");
  }

  function normalizeSnapshotEntries(values) {
    const byKey = new Map();
    (Array.isArray(values) ? values : []).forEach(function (value) {
      if (!value || typeof value !== "object") return;
      const normalized = entry(value.term);
      if (!normalized) return;
      const parsedDate = Number.isFinite(value.modifiedAt) ? value.modifiedAt : Date.parse(value.modifiedAt);
      const candidate = {
        term: normalized.term,
        normalizedTerm: normalized.key,
        isDeleted: Boolean(value.isDeleted),
        modifiedAt: Number.isFinite(parsedDate) ? parsedDate : 0
      };
      const previous = byKey.get(candidate.normalizedTerm);
      if (!previous || candidate.modifiedAt >= previous.modifiedAt) {
        if (previous) candidate.term = previous.term;
        byKey.set(candidate.normalizedTerm, candidate);
      }
    });
    return Array.from(byKey.values()).sort(function (left, right) {
      return left.normalizedTerm.localeCompare(right.normalizedTerm);
    });
  }

  function encodeSnapshot(values) {
    return JSON.stringify({
      version: SNAPSHOT_VERSION,
      entries: normalizeSnapshotEntries(values)
    });
  }

  function decodeSnapshot(value) {
    if (typeof value !== "string" || !value) return [];
    try {
      const parsed = JSON.parse(value);
      if (!parsed || parsed.version !== SNAPSHOT_VERSION || !Array.isArray(parsed.entries)) return [];
      return normalizeSnapshotEntries(parsed.entries);
    } catch (_) {
      return [];
    }
  }

  function mergeSnapshotEntries(remoteValues, pendingValues) {
    const merged = new Map(normalizeSnapshotEntries(remoteValues).map(function (item) {
      return [item.normalizedTerm, item];
    }));
    normalizeSnapshotEntries(pendingValues).forEach(function (item) {
      const current = merged.get(item.normalizedTerm);
      if (!current || item.modifiedAt >= current.modifiedAt) {
        merged.set(item.normalizedTerm, Object.assign({}, item, { term: current ? current.term : item.term }));
      }
    });
    return normalizeSnapshotEntries(Array.from(merged.values()));
  }

  return Object.freeze({
    normalizeDictionaryEntry: normalizeDictionaryEntry,
    normalizeDictionaryEntries: normalizeDictionaryEntries,
    hasDictionaryEntry: hasDictionaryEntry,
    addDictionaryEntry: addDictionaryEntry,
    removeDictionaryEntry: removeDictionaryEntry,
    preserveCandidateCasing: preserveCandidateCasing,
    normalizeSnapshotEntries: normalizeSnapshotEntries,
    encodeSnapshot: encodeSnapshot,
    decodeSnapshot: decodeSnapshot,
    mergeSnapshotEntries: mergeSnapshotEntries,
    contract: Object.freeze({
      recordType: RECORD_TYPE,
      recordName: RECORD_NAME,
      fieldName: FIELD_NAME,
      snapshotVersion: SNAPSHOT_VERSION
    })
  });
});
