export function createNoteSelection() {
  let active = false;
  let scopeKey = "";
  let scopeIds = [];
  let selected = new Set();
  let manuallySelected = new Set();
  let rangeSelected = new Set();
  let anchor = "";

  function idsInOrder(ids) {
    return Array.from(new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean)));
  }

  function snapshot() {
    return {
      active: active,
      scopeKey: scopeKey,
      scopeIds: scopeIds.slice(),
      selectedIds: scopeIds.filter(function (id) { return selected.has(id); }),
      anchor: anchor
    };
  }

  function enter(scope) {
    active = true;
    scopeKey = String(scope && scope.key || "");
    scopeIds = idsInOrder(scope && scope.ids);
    selected.clear();
    manuallySelected.clear();
    rangeSelected.clear();
    anchor = "";
    return snapshot();
  }

  function exit() {
    active = false;
    scopeKey = "";
    scopeIds = [];
    selected.clear();
    manuallySelected.clear();
    rangeSelected.clear();
    anchor = "";
    return snapshot();
  }

  function reconcile(scope) {
    if (!active) return false;
    const nextKey = String(scope && scope.key || "");
    if (nextKey !== scopeKey) {
      exit();
      return true;
    }
    scopeIds = idsInOrder(scope && scope.ids);
    const inScope = new Set(scopeIds);
    selected = new Set(Array.from(selected).filter(function (id) { return inScope.has(id); }));
    manuallySelected = new Set(Array.from(manuallySelected).filter(function (id) { return inScope.has(id); }));
    rangeSelected = new Set(Array.from(rangeSelected).filter(function (id) { return inScope.has(id); }));
    if (!inScope.has(anchor)) anchor = "";
    return false;
  }

  function clear() {
    selected.clear();
    manuallySelected.clear();
    rangeSelected.clear();
    anchor = "";
    return snapshot();
  }

  function selectAll() {
    selected = new Set(scopeIds);
    manuallySelected = new Set(scopeIds);
    rangeSelected.clear();
    anchor = scopeIds[0] || "";
    return snapshot();
  }

  function extendTo(id) {
    const target = String(id || "");
    const anchorIndex = scopeIds.indexOf(anchor);
    const targetIndex = scopeIds.indexOf(target);
    if (targetIndex < 0) return snapshot();
    if (anchorIndex < 0) {
      anchor = target;
      selected.add(target);
      manuallySelected.add(target);
      return snapshot();
    }

    rangeSelected.forEach(function (item) {
      if (!manuallySelected.has(item)) selected.delete(item);
    });
    rangeSelected.clear();
    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    for (let index = start; index <= end; index += 1) {
      const item = scopeIds[index];
      rangeSelected.add(item);
      selected.add(item);
    }
    return snapshot();
  }

  function toggle(id, extendRange) {
    const target = String(id || "");
    if (!active || !scopeIds.includes(target)) return snapshot();
    if (extendRange && anchor) return extendTo(target);
    if (selected.has(target)) {
      selected.delete(target);
      manuallySelected.delete(target);
      rangeSelected.delete(target);
    } else {
      selected.add(target);
      manuallySelected.add(target);
      rangeSelected.delete(target);
    }
    anchor = target;
    return snapshot();
  }

  function replace(ids) {
    const next = new Set(idsInOrder(ids).filter(function (id) { return scopeIds.includes(id); }));
    selected = next;
    manuallySelected = new Set(next);
    rangeSelected.clear();
    anchor = "";
    return snapshot();
  }

  return Object.freeze({
    snapshot: snapshot,
    enter: enter,
    exit: exit,
    reconcile: reconcile,
    clear: clear,
    selectAll: selectAll,
    toggle: toggle,
    extendTo: extendTo,
    replace: replace
  });
}

export function captureNoteSelectionBatch(selection, services) {
  const source = selection || {};
  const serviceSnapshot = services || {};
  const frozenSelection = Object.freeze({
    active: Boolean(source.active),
    scopeKey: String(source.scopeKey || ""),
    scopeIds: Object.freeze(idsInBatchOrder(source.scopeIds)),
    selectedIds: Object.freeze(idsInBatchOrder(source.selectedIds)),
    anchor: String(source.anchor || "")
  });
  return Object.freeze({
    selection: frozenSelection,
    scopeKey: frozenSelection.scopeKey,
    session: serviceSnapshot.session,
    database: serviceSnapshot.database,
    available: Boolean(serviceSnapshot.available),
    nativeSchema: Boolean(serviceSnapshot.nativeSchema),
    nativeZoneID: serviceSnapshot.nativeZoneID || null,
    metadataTransport: serviceSnapshot.metadataTransport || null
  });
}

export function noteSelectionBatchIsCurrent(batch, current) {
  return Boolean(batch && batch.selection && batch.selection.active && batch.database && batch.available && current && current.available
    && current.selectionActive
    && batch.scopeKey === current.scopeKey
    && batch.session === current.session
    && batch.database === current.database
    && batch.nativeSchema === Boolean(current.nativeSchema)
    && batch.nativeZoneID === (current.nativeZoneID || null)
    && batch.metadataTransport === (current.metadataTransport || null));
}

export async function runSnapshotBatch(recordNames, operation, isCurrent) {
  const results = [];
  const snapshot = idsInBatchOrder(recordNames);
  for (let index = 0; index < snapshot.length; index += 1) {
    const recordName = snapshot[index];
    if (typeof isCurrent === "function" && !isCurrent()) {
      snapshot.slice(index).forEach(function (unattempted) {
        results.push({ recordName: unattempted, status: "not-attempted" });
      });
      break;
    }
    try {
      const result = await operation(recordName);
      if (result && result.ok && result.skipped) results.push({ recordName: recordName, status: "unchanged" });
      else if (result && result.ok) results.push({ recordName: recordName, status: "succeeded" });
      else results.push({ recordName: recordName, status: "failed", error: String(result && result.error || "The action did not complete.") });
    } catch (error) {
      results.push({ recordName: recordName, status: "failed", error: String(error && error.message || error) });
    }
  }
  return results;
}

function idsInBatchOrder(ids) {
  return Array.from(new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean)));
}
