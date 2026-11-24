export const ARBOR_WEB_ZONE_ID = Object.freeze({ zoneName: "ArborNotes" });

const NATIVE_RECORD_TYPES = Object.freeze(["CD_CapturedNote", "CD_NoteFolder"]);
const WEB_RECORD_TYPES = Object.freeze(["ArborNote", "ArborFolder"]);

const NATIVE_METADATA_KEYS = Object.freeze([
  "CD_entityName", "CD_id", "CD_noteUUID", "CD_userTitle", "CD_generatedTitle",
  "CD_modifiedAt", "CD_createdAt", "CD_archivedAt", "CD_folderID",
  "CD_name", "CD_parentID", "CD_isStarred", "CD_headerFontStyle", "CD_bodyFontStyle"
]);

const WEB_METADATA_KEYS = Object.freeze([
  "noteUUID", "relativePath", "bodyStorageRaw", "contentFingerprint",
  "previousContentFingerprint", "contentVersion", "previousContentVersion",
  "createdAt", "modifiedAt", "archivedAt", "isStarred", "lastModifiedDeviceID",
  "lastModifiedDeviceName", "schemaEpoch", "headerFontStyle", "bodyFontStyle",
  "folderUUID"
]);

export function metadataChangeOptions(nativeSchema, nativeZoneID) {
  return {
    zoneID: nativeSchema ? nativeZoneID : ARBOR_WEB_ZONE_ID,
    desiredRecordTypes: nativeSchema ? NATIVE_RECORD_TYPES.slice() : WEB_RECORD_TYPES.slice(),
    desiredKeys: nativeSchema ? NATIVE_METADATA_KEYS.slice() : WEB_METADATA_KEYS.slice()
  };
}

export function isLibraryRecord(record, nativeSchema) {
  if (!record || typeof record.recordType !== "string") return false;
  if (nativeSchema === true) return NATIVE_RECORD_TYPES.includes(record.recordType);
  if (nativeSchema === false) return WEB_RECORD_TYPES.includes(record.recordType);
  return NATIVE_RECORD_TYPES.includes(record.recordType) || WEB_RECORD_TYPES.includes(record.recordType);
}

export function isNoteOrFolderRecord(record) {
  return isLibraryRecord(record, null);
}
