export const PASSAGE_ANCHOR_VERSION = 1;
export const PASSAGE_OFFSET_UNIT = "utf16CodeUnit";
const CONTEXT_CODE_UNITS = 96;

async function sha256(text) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error("SHA-256 is unavailable in this browser context");
  }
  const bytes = new TextEncoder().encode(String(text));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), function (byte) {
    return byte.toString(16).padStart(2, "0");
  }).join("");
}

export async function createPassageAnchor(options) {
  const input = options || {};
  const body = String(input.body || "");
  const start = Number(input.start);
  const end = Number(input.end);
  if (!input.noteId) throw new Error("A passage anchor needs a note identity");
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > body.length) {
    throw new RangeError("Passage offsets must be a non-empty UTF-16 range inside the canonical body");
  }
  const sourceRevision = await sha256(body);
  return {
    noteId: String(input.noteId),
    sourceRevision: sourceRevision,
    passageId: sourceRevision.slice(0, 20) + ":" + start + ":" + end,
    offsetUnit: PASSAGE_OFFSET_UNIT,
    start: start,
    end: end,
    excerpt: body.slice(start, end),
    contextBefore: body.slice(Math.max(0, start - CONTEXT_CODE_UNITS), start),
    contextAfter: body.slice(end, Math.min(body.length, end + CONTEXT_CODE_UNITS)),
    anchorVersion: PASSAGE_ANCHOR_VERSION,
    chunkerVersion: input.chunkerVersion || null,
    matchProvenance: input.matchProvenance || "exactLexical",
    resolutionStatus: "resolved"
  };
}

function occurrencesOf(body, excerpt) {
  const positions = [];
  let from = 0;
  while (from <= body.length - excerpt.length) {
    const position = body.indexOf(excerpt, from);
    if (position < 0) break;
    positions.push(position);
    from = position + 1;
  }
  return positions;
}

function contextMatches(body, position, anchor) {
  const before = String(anchor.contextBefore || "");
  const after = String(anchor.contextAfter || "");
  return body.slice(Math.max(0, position - before.length), position) === before &&
    body.slice(position + anchor.excerpt.length, position + anchor.excerpt.length + after.length) === after;
}

export async function resolvePassageAnchor(anchor, current) {
  const original = anchor || {};
  const latest = current || {};
  if (!latest.exists || latest.accountChanged || latest.noteId !== original.noteId) {
    return { noteId: original.noteId, resolutionStatus: "deleted" };
  }
  if (latest.archived) return { noteId: original.noteId, resolutionStatus: "archived" };
  const body = String(latest.body || "");
  if (!original.excerpt || original.offsetUnit !== PASSAGE_OFFSET_UNIT) {
    return { noteId: original.noteId, resolutionStatus: "stale" };
  }
  const sourceRevision = await sha256(body);
  if (sourceRevision === original.sourceRevision &&
      Number.isInteger(original.start) && Number.isInteger(original.end) &&
      original.start >= 0 && original.end <= body.length &&
      body.slice(original.start, original.end) === original.excerpt) {
    return Object.assign({}, original, { resolutionStatus: "resolved" });
  }

  let matches = occurrencesOf(body, original.excerpt);
  if (matches.length > 1) matches = matches.filter(function (position) { return contextMatches(body, position, original); });
  if (matches.length !== 1) {
    return Object.assign({}, original, { resolutionStatus: matches.length ? "ambiguous" : "stale" });
  }
  return createPassageAnchor({
    noteId: original.noteId,
    body: body,
    start: matches[0],
    end: matches[0] + original.excerpt.length,
    chunkerVersion: original.chunkerVersion,
    matchProvenance: original.matchProvenance
  });
}

function escapedRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findOccurrences(body, term) {
  const found = [];
  let expression;
  try { expression = new RegExp(escapedRegExp(term), "giu"); }
  catch (_) { return found; }
  let match;
  while ((match = expression.exec(body))) {
    found.push({ start: match.index, end: match.index + match[0].length, term: term.toLocaleLowerCase() });
    if (!match[0]) expression.lastIndex += 1;
  }
  return found;
}

export function findLexicalPassageRange(bodyValue, queryValue) {
  const body = String(bodyValue || "");
  const query = String(queryValue || "").trim();
  if (!body || !query) return null;

  const phrase = new RegExp(query.split(/\s+/).map(escapedRegExp).join("\\s+"), "iu");
  const exact = phrase.exec(body);
  if (exact) return { start: exact.index, end: exact.index + exact[0].length, matchProvenance: "exactLexical" };

  const terms = Array.from(new Set(query.split(/\s+/).filter(Boolean).map(function (term) { return term.toLocaleLowerCase(); })).values());
  if (terms.length > 12) return null;
  if (!terms.length) return null;
  const matches = terms.flatMap(function (term) { return findOccurrences(body, term); }).sort(function (a, b) {
    return a.start - b.start || a.end - b.end;
  });
  if (!matches.length) return null;

  const required = new Set(terms);
  const counts = new Map();
  let left = 0;
  let covered = 0;
  let best = null;
  for (let right = 0; right < matches.length; right += 1) {
    const term = matches[right].term;
    const count = counts.get(term) || 0;
    counts.set(term, count + 1);
    if (count === 0 && required.has(term)) covered += 1;
    while (covered === required.size && left <= right) {
      const first = matches[left];
      const last = matches[right];
      if (!best || last.end - first.start < best.end - best.start) {
        best = { start: first.start, end: last.end, matchProvenance: "partialLexical" };
      }
      const leftTerm = first.term;
      const leftCount = counts.get(leftTerm) - 1;
      counts.set(leftTerm, leftCount);
      if (leftCount === 0 && required.has(leftTerm)) covered -= 1;
      left += 1;
    }
  }
  return best;
}
