const NOTE_METADATA_FIELDS = Object.freeze({
  CD_CapturedNote: new Set(["folderID", "archivedAt"]),
  ArborNote: new Set(["relativePath", "modifiedAt", "lastModifiedDeviceID", "lastModifiedDeviceName"])
});

function fieldKey(recordType, name) {
  return recordType === "CD_CapturedNote" ? "CD_" + name : name;
}

export function createNoteMetadataUpdate(record, changes) {
  if (!record || typeof record.recordName !== "string" || !record.recordName ||
      !Object.prototype.hasOwnProperty.call(NOTE_METADATA_FIELDS, record.recordType)) {
    throw new TypeError("A supported note record is required for a metadata update.");
  }
  if (typeof record.recordChangeTag !== "string" || !record.recordChangeTag) {
    throw new Error("The note has no current revision. Refresh it before moving or archiving.");
  }
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw new TypeError("Metadata changes are required.");
  }
  const allowed = NOTE_METADATA_FIELDS[record.recordType];
  const fields = {};
  for (const [name, value] of Object.entries(changes)) {
    if (!allowed.has(name)) throw new TypeError("The requested field is not note location metadata.");
    if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, "value")) {
      throw new TypeError("CloudKit metadata fields must use field dictionaries.");
    }
    fields[fieldKey(record.recordType, name)] = value;
  }
  if (!Object.keys(fields).length) throw new TypeError("At least one metadata field is required.");

  return {
    operationType: "update",
    record: {
      recordName: record.recordName,
      recordType: record.recordType,
      recordChangeTag: record.recordChangeTag,
      fields
    }
  };
}

export function mergeNoteMetadataAcknowledgement(original, operation, acknowledgement) {
  const requested = operation && operation.record;
  if (!original || !requested || operation.operationType !== "update" || !acknowledgement ||
      acknowledgement.serverErrorCode) {
    const code = acknowledgement && acknowledgement.serverErrorCode;
    const error = new Error(code ? "CloudKit rejected the metadata update (" + code + ")." : "CloudKit did not confirm the note metadata update.");
    if (code) error.code = code;
    throw error;
  }
  if (acknowledgement.recordName !== original.recordName || acknowledgement.recordType !== original.recordType ||
      typeof acknowledgement.recordChangeTag !== "string" || !acknowledgement.recordChangeTag) {
    throw new Error("CloudKit did not confirm the updated note revision.");
  }

  return Object.assign({}, original, acknowledgement, {
    recordName: original.recordName,
    recordType: original.recordType,
    recordChangeTag: acknowledgement.recordChangeTag,
    fields: Object.assign({}, original.fields || {}, requested.fields || {}, acknowledgement.fields || {})
  });
}
