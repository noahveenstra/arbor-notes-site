(function (root) {
  "use strict";

  const DEFAULT_ORDER = "created-newest";
  const ORDERS = new Set(["created-newest", "created-oldest", "modified-newest", "modified-oldest", "title-ascending", "title-descending"]);

  function normalizeOrder(value) {
    return ORDERS.has(value) ? value : DEFAULT_ORDER;
  }

  function dateFieldFor(value) {
    const order = normalizeOrder(value);
    if (order === "created-newest" || order === "created-oldest") return "createdAt";
    if (order === "modified-newest" || order === "modified-oldest") return "modifiedAt";
    return null;
  }

  function displayDateFieldFor(value) {
    return dateFieldFor(value) || "modifiedAt";
  }

  function timestamp(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function stableRecordNameCompare(left, right) {
    return String(left.recordName || "").localeCompare(String(right.recordName || ""), undefined, { numeric: true, sensitivity: "base" });
  }

  function compareNotes(left, right, order) {
    const dateField = dateFieldFor(order);
    if (dateField) {
      const leftTime = timestamp(left[dateField]);
      const rightTime = timestamp(right[dateField]);
      if (leftTime == null && rightTime != null) return 1;
      if (leftTime != null && rightTime == null) return -1;
      if (leftTime != null && rightTime != null && leftTime !== rightTime) {
        const direction = order.endsWith("oldest") ? 1 : -1;
        return (leftTime - rightTime) * direction;
      }
      return stableRecordNameCompare(left, right);
    }

    const titleOrder = String(left.title || "").localeCompare(String(right.title || ""), undefined, { numeric: true, sensitivity: "base" });
    if (titleOrder !== 0) return order === "title-descending" ? -titleOrder : titleOrder;
    return stableRecordNameCompare(left, right);
  }

  function sortNotes(notes, value) {
    const order = normalizeOrder(value);
    return Array.from(notes || []).sort(function (left, right) { return compareNotes(left, right, order); });
  }

  root.ArborNoteSorting = Object.freeze({
    defaultOrder: DEFAULT_ORDER,
    isOrder: function (value) { return ORDERS.has(value); },
    normalizeOrder: normalizeOrder,
    dateFieldFor: dateFieldFor,
    displayDateFieldFor: displayDateFieldFor,
    sortNotes: sortNotes
  });
})(typeof window !== "undefined" ? window : globalThis);
