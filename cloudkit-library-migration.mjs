const DEFAULT_ZONE_ID = Object.freeze({ zoneName: "_defaultZone" });
const DEFAULT_RECORDS = Object.freeze([
  Object.freeze({ recordType: "ArborProofreadingDictionary", recordName: "arbor-proofreading-dictionary-v1" })
]);
const OMIT_RECORD_TYPES = new Set([
  "ArborWorkerRegistry",
  "ArborUnderstandingWork",
  "ArborCollaborativePresence",
  "ARB132_EncryptionProbe"
]);
const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const PAGE_SIZE = 200;
const CREATE_BATCH_SIZE = 25;

export class CloudKitLibraryMigrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CloudKitLibraryMigrationError";
    this.code = code;
  }
}

function normalizedZoneID(value) {
  const zoneID = value && (value.zoneID || value);
  if (!zoneID || typeof zoneID.zoneName !== "string" || !zoneID.zoneName) return null;
  return {
    zoneName: zoneID.zoneName,
    ...(typeof zoneID.ownerRecordName === "string" ? { ownerRecordName: zoneID.ownerRecordName } : {})
  };
}

function zoneKey(zoneID) {
  return `${zoneID.ownerRecordName || "_currentUser"}\u0000${zoneID.zoneName}`;
}

function recordKey(zoneID, record) {
  return `${zoneKey(zoneID)}\u0000${record.recordName}`;
}

function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJSON(value[key])}`).join(",")}}`;
}

function isSkippedRecord(record) {
  return OMIT_RECORD_TYPES.has(record.recordType) || /^ARB132_EncryptionProbe_/i.test(record.recordName || "");
}

function assertRecord(record) {
  if (!record || typeof record.recordName !== "string" || !record.recordName ||
      typeof record.recordType !== "string" || !record.recordType ||
      !record.fields || typeof record.fields !== "object" || Array.isArray(record.fields)) {
    throw new CloudKitLibraryMigrationError("INVALID_RECORD", "A Development record could not be read safely.");
  }
  if (record.recordType === "cloudKit.share" || /share/i.test(record.recordType)) {
    throw new CloudKitLibraryMigrationError("SHARED_RECORDS_PRESENT", "Development contains shared records that need a separate, participant-safe migration.");
  }
}

function assetReference(field) {
  if (!field || typeof field !== "object") return null;
  const value = field.value;
  if (field.type === "ASSET_LIST" || field.type === "ASSETLIST" || field.type === "LIST_ASSET" ||
      Array.isArray(value) && value.some(item => item && typeof item === "object" && typeof item.downloadURL === "string")) {
    throw new CloudKitLibraryMigrationError("ASSET_LIST_UNSUPPORTED", "Development contains a file list shape that needs a dedicated asset-list migration.");
  }
  if (field.type === "ASSET" || value && typeof value === "object" && typeof value.downloadURL === "string") {
    if (!value || typeof value.downloadURL !== "string" || !value.downloadURL) {
      throw new CloudKitLibraryMigrationError("ASSET_UNAVAILABLE", "A CloudKit file reference could not be read safely.");
    }
    const size = Number(value.size);
    if (Number.isFinite(size) && size > MAX_ASSET_BYTES) {
      throw new CloudKitLibraryMigrationError("ASSET_TOO_LARGE", "A CloudKit file exceeds the supported CloudKit Web Services transfer limit.");
    }
    return value;
  }
  return null;
}

function listAssetReferences(records) {
  const assets = [];
  records.forEach(({ record }) => {
    Object.entries(record.fields || {}).forEach(([fieldName, field]) => {
      const asset = assetReference(field);
      if (asset) assets.push({ recordName: record.recordName, recordType: record.recordType, fieldName, asset });
    });
  });
  return assets;
}

function checkResponseRows(payload, key, step) {
  const rows = payload && payload[key];
  if (!Array.isArray(rows)) throw new CloudKitLibraryMigrationError("BAD_RESPONSE", `CloudKit returned an incomplete ${step} response.`);
  if (rows.some(row => row && row.serverErrorCode)) {
    const code = rows.find(row => row && row.serverErrorCode).serverErrorCode;
    throw new CloudKitLibraryMigrationError(String(code || "CLOUDKIT_ERROR"), `CloudKit could not complete ${step}.`);
  }
  return rows;
}

async function readCustomZoneRecords(client, zoneID, onProgress, side) {
  const records = [];
  let syncToken = null;
  let moreComing = true;
  let page = 0;
  while (moreComing) {
    if (page > 10000) throw new CloudKitLibraryMigrationError("PAGINATION_LIMIT", "CloudKit returned too many pages to complete safely.");
    const response = await client.fetchRecordZoneChanges(zoneID, syncToken, PAGE_SIZE);
    const zones = checkResponseRows(response, "zones", "zone read");
    const result = zones.find(entry => zoneKey(normalizedZoneID(entry)) === zoneKey(zoneID)) || zones[0];
    if (!result || !normalizedZoneID(result)) throw new CloudKitLibraryMigrationError("BAD_ZONE_RESPONSE", "CloudKit did not return the requested record zone.");
    (result.records || []).forEach(record => {
      if (record.deleted) return;
      assertRecord(record);
      if (!isSkippedRecord(record)) records.push({ zoneID, record });
    });
    syncToken = result.syncToken || syncToken;
    moreComing = Boolean(result.moreComing);
    if (moreComing && !syncToken) throw new CloudKitLibraryMigrationError("MISSING_SYNC_TOKEN", "CloudKit did not provide a continuation token.");
    page += 1;
    if (onProgress) onProgress({ phase: "inventory", side, zones: 0, records: records.length });
  }
  return records;
}

async function lookupDefaultRecord(client, definition) {
  const response = await client.lookupRecords([definition.recordName], DEFAULT_ZONE_ID);
  const records = response && response.records;
  if (!Array.isArray(records)) throw new CloudKitLibraryMigrationError("BAD_RESPONSE", "CloudKit returned an incomplete default-zone lookup response.");
  const record = records.find(row => row && row.recordName === definition.recordName);
  if (!record) return null;
  if (record.serverErrorCode === "UNKNOWN_ITEM" || record.serverErrorCode === "RECORD_NOT_FOUND") return null;
  if (record.serverErrorCode) throw new CloudKitLibraryMigrationError(String(record.serverErrorCode), "CloudKit could not complete the default-zone lookup.");
  assertRecord(record);
  return isSkippedRecord(record) ? null : { zoneID: DEFAULT_ZONE_ID, record };
}

async function readSnapshot(client, onProgress, side) {
  const zoneResponse = await client.listRecordZones();
  const zones = checkResponseRows(zoneResponse, "zones", "zone listing")
    .map(normalizedZoneID)
    .filter(zoneID => zoneID && zoneID.zoneName !== "_defaultZone");
  const records = [];
  let completedZones = 0;
  for (const zoneID of zones) {
    records.push(...await readCustomZoneRecords(client, zoneID, null, side));
    completedZones += 1;
    if (onProgress) onProgress({ phase: "inventory", side, zones: completedZones, totalZones: zones.length, records: records.length });
  }
  for (const definition of DEFAULT_RECORDS) {
    const record = await lookupDefaultRecord(client, definition);
    if (record) records.push(record);
  }
  const unique = new Map();
  records.forEach(entry => unique.set(recordKey(entry.zoneID, entry.record), entry));
  return { zones, records: Array.from(unique.values()) };
}

async function fetchAssetBytes(asset, fetchImpl) {
  let response;
  try { response = await fetchImpl(asset.downloadURL, { method: "GET", credentials: "omit", cache: "no-store" }); }
  catch { throw new CloudKitLibraryMigrationError("ASSET_DOWNLOAD_FAILED", "A CloudKit file could not be downloaded for migration."); }
  if (!response || !response.ok) throw new CloudKitLibraryMigrationError("ASSET_DOWNLOAD_FAILED", "A CloudKit file could not be downloaded for migration.");
  let bytes;
  try { bytes = new Uint8Array(await response.arrayBuffer()); }
  catch { throw new CloudKitLibraryMigrationError("ASSET_DOWNLOAD_FAILED", "A CloudKit file could not be downloaded for migration."); }
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    throw new CloudKitLibraryMigrationError("ASSET_SIZE_INVALID", "A CloudKit file has an unsupported size.");
  }
  return bytes;
}

async function assetFingerprint(asset, fetchImpl) {
  const bytes = await fetchAssetBytes(asset, fetchImpl);
  if (!globalThis.crypto || !globalThis.crypto.subtle) throw new CloudKitLibraryMigrationError("HASH_UNAVAILABLE", "This browser cannot verify CloudKit files safely.");
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  const hash = Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
  return `${bytes.byteLength}:${hash}`;
}

async function recordsMatch(left, right, fetchImpl) {
  if (!left || !right || left.record.recordType !== right.record.recordType) return false;
  const leftFields = left.record.fields || {};
  const rightFields = right.record.fields || {};
  const leftKeys = Object.keys(leftFields).sort();
  const rightKeys = Object.keys(rightFields).sort();
  if (stableJSON(leftKeys) !== stableJSON(rightKeys)) return false;
  for (const fieldName of leftKeys) {
    const leftField = leftFields[fieldName];
    const rightField = rightFields[fieldName];
    if (stableJSON({ type: leftField && leftField.type, isEncrypted: leftField && leftField.isEncrypted }) !==
        stableJSON({ type: rightField && rightField.type, isEncrypted: rightField && rightField.isEncrypted })) return false;
    const leftAsset = assetReference(leftField);
    const rightAsset = assetReference(rightField);
    if (Boolean(leftAsset) !== Boolean(rightAsset)) return false;
    if (leftAsset) {
      if (await assetFingerprint(leftAsset, fetchImpl) !== await assetFingerprint(rightAsset, fetchImpl)) return false;
    } else if (stableJSON(leftField && leftField.value) !== stableJSON(rightField && rightField.value)) return false;
  }
  return true;
}

function countByZone(records) {
  const counts = new Map();
  records.forEach(entry => {
    const key = zoneKey(entry.zoneID);
    if (!counts.has(key)) counts.set(key, { zoneID: entry.zoneID, records: [] });
    counts.get(key).records.push(entry);
  });
  return Array.from(counts.values());
}

export async function planPrivateLibraryMigration({ development, production, fetchImpl = globalThis.fetch, onProgress } = {}) {
  if (!development || !production || development === production) throw new TypeError("Development and Production CloudKit clients are required.");
  if (typeof fetchImpl !== "function") throw new TypeError("Fetch is unavailable.");
  if (onProgress) onProgress({ phase: "inventory", side: "Development", zones: 0, records: 0 });
  const source = await readSnapshot(development, onProgress, "Development");
  if (onProgress) onProgress({ phase: "inventory", side: "Production", zones: 0, records: 0 });
  const destination = await readSnapshot(production, onProgress, "Production");
  const sourceByKey = new Map(source.records.map(entry => [recordKey(entry.zoneID, entry.record), entry]));
  const destinationByKey = new Map(destination.records.map(entry => [recordKey(entry.zoneID, entry.record), entry]));
  const extraDestination = Array.from(destinationByKey.keys()).filter(key => !sourceByKey.has(key));
  if (extraDestination.length) {
    throw new CloudKitLibraryMigrationError("PRODUCTION_HAS_EXTRA_RECORDS", "Production already contains records outside the Development library. Nothing was copied.");
  }
  const alreadyCopied = [];
  for (const [key, destinationEntry] of destinationByKey) {
    const sourceEntry = sourceByKey.get(key);
    if (!await recordsMatch(sourceEntry, destinationEntry, fetchImpl)) {
      throw new CloudKitLibraryMigrationError("PRODUCTION_CONFLICT", "Production contains a different version of a Development record. Nothing was copied.");
    }
    alreadyCopied.push(key);
  }
  const alreadyCopiedSet = new Set(alreadyCopied);
  const copyRecords = source.records.filter(entry => !alreadyCopiedSet.has(recordKey(entry.zoneID, entry.record)));
  const assets = listAssetReferences(copyRecords);
  return {
    development,
    source,
    destination,
    copyRecords,
    counts: {
      zones: source.zones.length,
      records: source.records.length,
      assets: listAssetReferences(source.records).length,
      alreadyPresent: alreadyCopied.length
    }
  };
}

async function prepareFieldValue(field, record, fieldName, zoneID, production, fetchImpl) {
  const asset = assetReference(field);
  const copy = structuredClone(field);
  if (!asset) return copy;
  const bytes = await fetchAssetBytes(asset, fetchImpl);
  const uploadResponses = await production.requestAssetUploads([{
    recordName: record.recordName,
    recordType: record.recordType,
    fieldName
  }], zoneID.zoneName === "_defaultZone" ? undefined : zoneID);
  const uploadTokens = checkResponseRows(uploadResponses, "tokens", "asset upload preparation");
  const token = uploadTokens[0];
  if (!token || typeof token.url !== "string" || !token.url) throw new CloudKitLibraryMigrationError("ASSET_UPLOAD_URL_MISSING", "CloudKit did not provide a file upload destination.");
  copy.value = await production.uploadAssetData(token.url, bytes);
  return copy;
}

async function prepareRecord(entry, production, fetchImpl) {
  const fields = {};
  for (const [fieldName, field] of Object.entries(entry.record.fields || {})) {
    fields[fieldName] = await prepareFieldValue(field, entry.record, fieldName, entry.zoneID, production, fetchImpl);
  }
  return { recordType: entry.record.recordType, recordName: entry.record.recordName, fields };
}

function checkModifyResponse(response) {
  const records = checkResponseRows(response, "records", "record copy");
  return records.length;
}

export async function copyPrivateLibraryMigrationPlan(plan, { development, production, fetchImpl = globalThis.fetch, onProgress } = {}) {
  if (!plan || !Array.isArray(plan.copyRecords) || !development || !production) throw new TypeError("A verified migration plan and both CloudKit clients are required.");
  const existingZones = new Set(plan.destination.zones.map(zoneKey));
  const sourceZones = new Map(plan.source.zones.map(zoneID => [zoneKey(zoneID), zoneID]));
  for (const [key, zoneID] of sourceZones) {
    if (!existingZones.has(key)) await production.ensureRecordZone(zoneID);
  }
  let copiedRecords = 0;
  let copiedAssets = 0;
  const groups = countByZone(plan.copyRecords);
  for (const group of groups) {
    for (let start = 0; start < group.records.length; start += CREATE_BATCH_SIZE) {
      const batch = group.records.slice(start, start + CREATE_BATCH_SIZE);
      const prepared = [];
      for (const entry of batch) {
        let assetsInRecord = 0;
        for (const field of Object.values(entry.record.fields || {})) if (assetReference(field)) assetsInRecord += 1;
        prepared.push(await prepareRecord(entry, production, fetchImpl));
        copiedAssets += assetsInRecord;
        if (onProgress) onProgress({ phase: "copying", records: copiedRecords, totalRecords: plan.copyRecords.length, assets: copiedAssets, totalAssets: listAssetReferences(plan.copyRecords).length });
      }
      const zoneID = group.zoneID.zoneName === "_defaultZone" ? undefined : group.zoneID;
      const response = await production.modifyRecords(prepared.map(record => ({
        operationType: "create",
        record
      })), zoneID, true);
      copiedRecords += checkModifyResponse(response);
      if (onProgress) onProgress({ phase: "copying", records: copiedRecords, totalRecords: plan.copyRecords.length, assets: copiedAssets, totalAssets: listAssetReferences(plan.copyRecords).length });
    }
  }

  if (onProgress) onProgress({ phase: "verifying", records: copiedRecords, totalRecords: plan.copyRecords.length });
  const sourceAfter = await readSnapshot(development, null, "Development");
  const destinationAfter = await readSnapshot(production, null, "Production");
  const sourceByKey = new Map(sourceAfter.records.map(entry => [recordKey(entry.zoneID, entry.record), entry]));
  const destinationByKey = new Map(destinationAfter.records.map(entry => [recordKey(entry.zoneID, entry.record), entry]));
  if (sourceByKey.size !== destinationByKey.size) throw new CloudKitLibraryMigrationError("VERIFY_COUNT_MISMATCH", "Production did not receive the complete Development library.");
  for (const [key, sourceEntry] of sourceByKey) {
    const destinationEntry = destinationByKey.get(key);
    if (!destinationEntry || !await recordsMatch(sourceEntry, destinationEntry, fetchImpl)) {
      throw new CloudKitLibraryMigrationError("VERIFY_CONTENT_MISMATCH", "Production did not receive an exact copy of the Development library.");
    }
  }
  return {
    copiedRecords,
    copiedAssets,
    verifiedRecords: sourceByKey.size,
    verifiedZones: sourceAfter.zones.length
  };
}
