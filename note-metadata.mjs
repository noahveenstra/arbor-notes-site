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

const TEMPORARY_METADATA_ERRORS = new Set([
  "NETWORK_ERROR", "INVALID_RESPONSE", "REQUEST_RATE_LIMITED", "SERVICE_UNAVAILABLE",
  "TRY_AGAIN_LATER", "THROTTLED", "ZONE_BUSY", "INTERNAL_ERROR", "UNKNOWN_OUTCOME"
]);
const UNCERTAIN_METADATA_ERRORS = new Set(["NETWORK_ERROR", "INVALID_RESPONSE", "UNKNOWN_OUTCOME"]);

function metadataResultError(value) {
  if (value instanceof Error) return value;
  const error = new Error(value ? "iCloud could not update this note." : "iCloud did not confirm this note’s update.");
  error.code = value?.serverErrorCode || "UNKNOWN_OUTCOME";
  error.retryAfter = value?.retryAfter;
  return error;
}

async function metadataAcknowledgements(records, send) {
  try {
    return new Map(((await send(records)).records || []).map(record => [record.recordName, record]));
  } catch (error) {
    return new Map(records.map(operation => [operation.record.recordName, error]));
  }
}

export async function writeNoteMetadataBatch(operations, { write, lookup, isCurrent, wait }) {
  const results = new Map();
  const uncertain = new Map();
  let pending = operations;
  const delays = [250, 750];
  for (let attempt = 0; pending.length && isCurrent(); attempt++) {
    const replies = await metadataAcknowledgements(pending, write);
    const retry = [];
    let delay = delays[attempt];
    for (const operation of pending) {
      const name = operation.record.recordName;
      const reply = replies.get(name);
      if (reply && !(reply instanceof Error) && !reply.serverErrorCode) {
        results.set(name, { record: reply });
        uncertain.delete(name);
        continue;
      }
      const error = metadataResultError(reply);
      results.set(name, { error });
      if (UNCERTAIN_METADATA_ERRORS.has(error.code) || error.httpStatus >= 500) {
        uncertain.set(name, operation);
      }
      const temporary = TEMPORARY_METADATA_ERRORS.has(error.code) || error.httpStatus === 429 || error.httpStatus >= 500;
      // Leave requests with a longer server cooldown available for a later retry.
      const retryAfter = (Number(error.retryAfter) || 0) * 1000;
      if (temporary && attempt < delays.length && retryAfter <= 5000) {
        retry.push(operation);
        delay = Math.max(delay, retryAfter);
      }
    }
    pending = retry;
    if (pending.length && isCurrent()) await wait(delay);
  }

  // A lost response can hide an accepted write. Check the requested fields
  // before reporting failure, without retrying a newer record revision.
  if (uncertain.size && isCurrent()) {
    try {
      const names = Array.from(uncertain.keys());
      const fields = Array.from(new Set(Array.from(uncertain.values()).flatMap(operation => Object.keys(operation.record.fields))));
      const response = await lookup(names, fields);
      for (const record of response.records || []) {
        const operation = uncertain.get(record.recordName);
        if (operation && !record.serverErrorCode && Object.entries(operation.record.fields).every(([name, field]) =>
          record.fields?.[name]?.value === field.value)) {
          results.set(record.recordName, { record, recovered: true });
        }
      }
    } catch (_) {
      // Keep the last failure so the note stays available for a manual retry.
    }
  }
  return results;
}
