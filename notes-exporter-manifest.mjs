const FORMAT = "notes-exporter.manifest";
const VERSION = 1;
const MAX_FOLDER_NAME_BYTES = 255;
const MAX_FOLDER_NAME_CODE_UNITS = 120;
// CloudKit rejects records over 1 MiB (assets excluded). Leave room for the
// note's title, timestamps, IDs, and other fields; this adapter cannot write
// Markdown as a CKAsset, so it must skip rather than truncate larger bodies.
export const MAX_WEB_MARKDOWN_BYTES = 900 * 1024;

function safeRelativePath(value) {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return false;
  const parts = value.split("/");
  return parts.every(part => part && part !== "." && part !== "..");
}

function validTimestamp(value) {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(Z|([+-])(\d\d):(\d\d))$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] ||
      hour > 23 || minute > 59 || second > 59 ||
      (match[8] !== "Z" && (Number(match[10]) > 23 || Number(match[11]) > 59))) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const MANIFEST_FILTERS = [
  ["accounts", "Accounts"],
  ["folders", "Folders"],
  ["exclude_folders", "Excluded folders"],
  ["modified_after", "Modified after"]
];

function previewFilterValue(value) {
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  const characters = Array.from(clean);
  return characters.length > 240 ? characters.slice(0, 237).join("") + "…" : clean;
}

function manifestFilterDisclosure(filters) {
  if (filters == null) return { filters: [], filtersUnrecognized: false };
  if (typeof filters !== "object" || Array.isArray(filters)) return { filters: [], filtersUnrecognized: true };
  const recognized = new Set(MANIFEST_FILTERS.map(([key]) => key));
  let filtersUnrecognized = Object.entries(filters).some(([key, value]) => {
    if (!recognized.has(key)) return value != null && value !== "" && value !== false;
    return value != null && value !== "" && typeof value !== "string";
  });
  const summary = MANIFEST_FILTERS.flatMap(([key, label]) => {
    const value = filters[key];
    if (typeof value !== "string" || !value.trim()) return [];
    const safeValue = previewFilterValue(value);
    if (!safeValue) {
      filtersUnrecognized = true;
      return [];
    }
    return [{ label, value: safeValue }];
  });
  return { filters: summary, filtersUnrecognized };
}

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function truncatePathComponent(value, maxBytes, maxCodeUnits) {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const character of value) {
    bytes += encoder.encode(character).length;
    if (bytes > maxBytes || result.length + character.length > maxCodeUnits) break;
    result += character;
  }
  return result;
}

/** Add a stable suffix without truncating it away; fail closed after bounded collisions. */
export function uniqueSafeFolderComponent(baseName, identity, candidateIsTaken, maxAttempts = 64) {
  if (typeof candidateIsTaken !== "function") throw new TypeError("A folder-name collision check is required.");
  const attempts = Number.isSafeInteger(maxAttempts) && maxAttempts > 0 ? Math.min(maxAttempts, 64) : 64;
  const identitySuffix = String(identity || "").replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase() || "IMPORT";
  const base = String(baseName || "").trimEnd() || "Imported";
  const encoder = new TextEncoder();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const retrySuffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const suffix = ` (${identitySuffix}${retrySuffix})`;
    const stem = truncatePathComponent(base, MAX_FOLDER_NAME_BYTES - encoder.encode(suffix).length,
      MAX_FOLDER_NAME_CODE_UNITS - suffix.length).trimEnd();
    const candidate = stem + suffix;
    if (!candidateIsTaken(candidate)) return candidate;
  }
  throw new Error(`Could not reserve a unique folder name after ${attempts} safe attempts.`);
}

async function sha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

function unsupportedMetadata(note) {
  const items = [];
  if (Array.isArray(note.tags) && note.tags.length) items.push("tags");
  if (note.pinned === true) items.push("pinned status");
  if (note.shared === true) items.push("shared status");
  if (note.locked === true) items.push("locked status");
  if (note.checklist === true) items.push("checklist status");
  if (Array.isArray(note.attachments) && note.attachments.length) items.push("attachments");
  return items;
}

/** Validate a notes-exporter v1 manifest and only decode verified, explicitly referenced Markdown outputs. */
export async function prepareNotesExporterImport(manifest, fileEntries) {
  if (!manifest || manifest.format !== FORMAT || manifest.version !== VERSION) throw new Error("Choose a notes-exporter manifest v1 folder.");
  if (!manifest.run || !["ok", "partial"].includes(manifest.run.status)) throw new Error("This manifest is failed or has no completed export. Arbor did not import it.");
  if (!["incremental", "full", "sync-only"].includes(manifest.run.mode)) throw new Error("This manifest has an unsupported run mode.");
  if (manifest.run.mode === "sync-only") throw new Error("Sync-only manifests cannot be imported.");
  if (!Array.isArray(manifest.notes) || !Array.isArray(manifest.skipped) || !Array.isArray(manifest.deleted)) {
    throw new Error("The notes-exporter manifest is missing required v1 lists.");
  }

  const files = new Map();
  const duplicatePaths = new Set();
  for (const entry of fileEntries || []) {
    if (!entry || !safeRelativePath(entry.path)) continue;
    if (files.has(entry.path)) duplicatePaths.add(entry.path);
    else files.set(entry.path, bytesOf(entry.bytes));
  }

  const skippedByID = new Map();
  for (const item of manifest.skipped || []) {
    if (typeof item?.id === "string") skippedByID.set(item.id, String(item.reason || "exporter skipped this note"));
  }
  const deletedIdentities = new Set();
  const deletedIDsWithoutAccount = new Set();
  const deletedPaths = new Set();
  for (const item of manifest.deleted || []) {
    if (typeof item?.id === "string") {
      if (typeof item.account_id === "string" && item.account_id) deletedIdentities.add(`${item.account_id}\u0000${item.id}`);
      else deletedIDsWithoutAccount.add(item.id);
    }
    if (Array.isArray(item?.remaining_outputs)) {
      for (const path of item.remaining_outputs) if (safeRelativePath(path)) deletedPaths.add(path);
    }
    if (Array.isArray(item?.removed_outputs)) {
      for (const path of item.removed_outputs) if (safeRelativePath(path)) deletedPaths.add(path);
    }
  }
  const referencedOutputPaths = new Set((manifest.notes || [])
    .map(note => note?.outputs?.md?.path)
    .filter(safeRelativePath));
  for (const path of deletedPaths) referencedOutputPaths.add(path);

  const warnings = [];
  if (manifest.run.status === "partial") warnings.push("The exporter marked this snapshot partial. Only verified current entries will be offered.");
  const skipped = [];
  const notes = [];
  const seenSourceIDs = new Set();
  const seenOutputPaths = new Set();

  for (const note of manifest.notes) {
    const id = typeof note?.id === "string" ? note.id : "";
    if (!id || typeof note.account_id !== "string" || !note.account_id || typeof note.title !== "string" || !Array.isArray(note.folder_path)) {
      skipped.push({ id: id || "(unknown)", reason: "missing required note identity, account, title, or folder path" });
      continue;
    }
    if (seenSourceIDs.has(`${note.account_id}\u0000${id}`)) {
      skipped.push({ id, reason: "duplicate source note identity in manifest" });
      continue;
    }
    seenSourceIDs.add(`${note.account_id}\u0000${id}`);
    if (deletedIdentities.has(`${note.account_id}\u0000${id}`) || deletedIDsWithoutAccount.has(id)) {
      skipped.push({ id, reason: "tombstoned in manifest" });
      continue;
    }
    if (note.locked === true || skippedByID.has(id) && /locked/i.test(skippedByID.get(id))) {
      skipped.push({ id, reason: "locked source note retained from an earlier export" });
      continue;
    }
    if (skippedByID.has(id)) {
      skipped.push({ id, reason: `exporter skipped this note: ${skippedByID.get(id)}` });
      continue;
    }
    if (note.folder_path.some(part => typeof part !== "string" || !part.trim() || part === "." || part === ".." || /[\/\\\u0000-\u001f\u007f]/.test(part))) {
      skipped.push({ id, reason: "unsafe or empty folder path segment" });
      continue;
    }
    const output = note.outputs && note.outputs.md;
    if (!output || !safeRelativePath(output.path) || !/\.md$/i.test(output.path)) {
      skipped.push({ id, reason: "no safe Markdown output path in manifest" });
      continue;
    }
    if (deletedPaths.has(output.path)) {
      skipped.push({ id, reason: "Markdown output belongs to a tombstone" });
      continue;
    }
    if (seenOutputPaths.has(output.path)) {
      skipped.push({ id, reason: "output path is referenced by more than one note" });
      continue;
    }
    seenOutputPaths.add(output.path);
    if (duplicatePaths.has(output.path)) {
      skipped.push({ id, reason: "ambiguous duplicate file path in selected folder" });
      continue;
    }
    const bytes = files.get(output.path);
    if (!bytes) {
      skipped.push({ id, reason: `missing referenced Markdown file ${output.path}` });
      continue;
    }
    if (!Number.isSafeInteger(output.bytes) || output.bytes < 0 || bytes.byteLength !== output.bytes) {
      skipped.push({ id, reason: `byte count mismatch for ${output.path}` });
      continue;
    }
    if (bytes.byteLength > MAX_WEB_MARKDOWN_BYTES) {
      skipped.push({ id, reason: `Markdown body exceeds Arbor's 900 KiB web-import limit (${MAX_WEB_MARKDOWN_BYTES} bytes); it was left unchanged in the export` });
      continue;
    }
    if (typeof output.sha256 !== "string" || !/^[\da-f]{64}$/i.test(output.sha256) || await sha256(bytes) !== output.sha256.toLowerCase()) {
      skipped.push({ id, reason: `SHA-256 mismatch for ${output.path}` });
      continue;
    }
    let body;
    try { body = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { skipped.push({ id, reason: `invalid UTF-8 in ${output.path}` }); continue; }

    const createdAt = validTimestamp(note.created);
    const modifiedAt = validTimestamp(note.modified);
    const dateWarnings = [];
    if (createdAt === null) dateWarnings.push("creation date will use Arbor’s current-time fallback");
    if (modifiedAt === null) dateWarnings.push("last-edited date will use Arbor’s current-time fallback");
    const unsupported = unsupportedMetadata(note);
    notes.push({
      source: "notes-exporter.manifest/v1",
      sourceAccountID: note.account_id,
      sourceAccountName: typeof note.account === "string" ? note.account : "",
      sourceID: id,
      sourceFolderID: typeof note.folder_id === "string" ? note.folder_id : "",
      folderPath: [...note.folder_path],
      title: note.title.trim() || "Untitled",
      markdown: body,
      createdAt,
      modifiedAt,
      dateWarnings,
      unsupportedMetadata: unsupported,
      outputPath: output.path
    });
  }

  if (skipped.length) warnings.push(`${skipped.length} manifest entr${skipped.length === 1 ? "y was" : "ies were"} skipped after validation.`);
  const oversizedCount = skipped.filter(item => item.reason.startsWith("Markdown body exceeds Arbor's 900 KiB web-import limit")).length;
  if (oversizedCount) warnings.push(`${oversizedCount} note(s) exceed the 900 KiB web-import Markdown limit. They remain unchanged in the export and were skipped.`);
  const unsupportedCount = notes.filter(note => note.unsupportedMetadata.length).length;
  if (unsupportedCount) warnings.push(`${unsupportedCount} note(s) have tags, flags, or attachments that Arbor does not map.`);
  const dateFallbackCount = notes.filter(note => note.dateWarnings.length).length;
  if (dateFallbackCount) warnings.push(`${dateFallbackCount} note(s) have an unknown or invalid source date and will use Arbor’s current-time fallback for that field only.`);
  if (Array.isArray(manifest.folders) && manifest.folders.length) warnings.push("This manifest includes folder-only entries. Empty folders are not imported by this adapter yet.");

  return {
    format: FORMAT,
    version: VERSION,
    status: manifest.run.status,
    mode: manifest.run.mode,
    ...manifestFilterDisclosure(manifest.run.filters),
    notes,
    skipped,
    warnings,
    unrelatedFilesIgnored: Math.max(0, files.size - referencedOutputPaths.size)
  };
}

/** Deterministic IDs keep retries and repeated imports tied to a source identity without title matching. */
export async function stableImportUUID(scope, identity) {
  const bytes = new TextEncoder().encode(`${scope}\u0000${identity}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest, value => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
