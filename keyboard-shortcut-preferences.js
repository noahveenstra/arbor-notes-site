(function attachArborKeyboardShortcutPreferences(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborKeyboardShortcutPreferences = api;
})(globalThis, function createArborKeyboardShortcutPreferences() {
  "use strict";

  const RECORD_TYPE = "ArborKeyboardShortcuts";
  const RECORD_NAME = "arbor-keyboard-shortcuts-v1";
  const FIELD_NAME = "shortcutsJSON";
  const SNAPSHOT_VERSION = 1;
  const STORAGE_KEY = "arbor.web.shortcut-preferences.v1";

  function normalizeOperation(value) {
    if (!value || typeof value.id !== "string" || !value.id.trim()) return null;
    const modifiedAt = Number(value.modifiedAt);
    const operation = {
      id: value.id.trim(),
      modifiedAt: Number.isFinite(modifiedAt) && modifiedAt > 0 ? modifiedAt : 0,
      operationId: String(value.operationId || "").slice(0, 80),
      reset: Boolean(value.reset)
    };
    if (!operation.reset) {
      if (typeof value.key !== "string" || !value.key || value.key.length > 32) return null;
      if (typeof value.code !== "string" || !value.code || value.code.length > 64) return null;
      operation.key = value.key;
      operation.code = value.code;
      operation.alt = Boolean(value.alt);
      operation.shift = Boolean(value.shift);
      operation.plain = Boolean(value.plain);
    }
    return operation;
  }

  function normalizeOperations(values) {
    const latest = new Map();
    (Array.isArray(values) ? values : []).forEach(function (value) {
      const operation = normalizeOperation(value);
      if (!operation) return;
      const current = latest.get(operation.id);
      if (!current || compareOperations(operation, current) > 0) latest.set(operation.id, operation);
    });
    return Array.from(latest.values()).sort(function (left, right) { return left.id.localeCompare(right.id); });
  }

  function compareOperations(left, right) {
    if (left.modifiedAt !== right.modifiedAt) return left.modifiedAt - right.modifiedAt;
    return String(left.operationId || "").localeCompare(String(right.operationId || ""));
  }

  function createOperation(id, binding, reset, modifiedAt) {
    const now = Math.max(Date.now(), Number(modifiedAt) || 0);
    const operationId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : now.toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    const operation = { id: String(id || ""), modifiedAt: now, operationId: operationId, reset: Boolean(reset) };
    if (!operation.reset && binding) {
      operation.key = String(binding.key || "");
      operation.code = String(binding.code || "");
      operation.alt = Boolean(binding.alt);
      operation.shift = Boolean(binding.shift);
      operation.plain = Boolean(binding.plain);
    }
    return normalizeOperation(operation);
  }

  function mergeOperations(remote, local) {
    const merged = new Map();
    normalizeOperations(remote).forEach(function (operation) { merged.set(operation.id, operation); });
    normalizeOperations(local).forEach(function (operation) {
      const current = merged.get(operation.id);
      if (!current || compareOperations(operation, current) > 0) merged.set(operation.id, operation);
    });
    return normalizeOperations(Array.from(merged.values()));
  }

  function encodeSnapshot(operations) {
    return JSON.stringify({ version: SNAPSHOT_VERSION, operations: normalizeOperations(operations) });
  }

  function decodeSnapshot(value) {
    if (typeof value !== "string" || !value.trim()) return [];
    try {
      const snapshot = JSON.parse(value);
      if (!snapshot || snapshot.version !== SNAPSHOT_VERSION) return [];
      return normalizeOperations(snapshot.operations);
    } catch (_) {
      return [];
    }
  }

  function sameSnapshot(left, right) {
    return encodeSnapshot(left) === encodeSnapshot(right);
  }

  return Object.freeze({
    normalizeOperations: normalizeOperations,
    createOperation: createOperation,
    mergeOperations: mergeOperations,
    encodeSnapshot: encodeSnapshot,
    decodeSnapshot: decodeSnapshot,
    sameSnapshot: sameSnapshot,
    contract: Object.freeze({ recordType: RECORD_TYPE, recordName: RECORD_NAME, fieldName: FIELD_NAME, storageKey: STORAGE_KEY, snapshotVersion: SNAPSHOT_VERSION })
  });
});
