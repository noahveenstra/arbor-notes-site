(function attachArborCloudKitFields(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborCloudKitFields = api;
})(globalThis, function createArborCloudKitFields() {
  function field(value) {
    // CloudKit JS represents TIMESTAMP fields as epoch milliseconds.
    return { value: value instanceof Date ? value.getTime() : value };
  }

  return Object.freeze({ field: field });
});
