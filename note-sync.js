(function attachArborNoteSync(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborNoteSync = api;
})(typeof window !== "undefined" ? window : globalThis, function createArborNoteSync() {
  const MAX_DIFF_CELLS = 2_000_000;

  function diffHunks(base, changed) {
    const rows = base.length + 1;
    const columns = changed.length + 1;
    if (rows * columns > MAX_DIFF_CELLS) return null;
    const lcs = Array.from({ length: rows }, function () { return new Uint32Array(columns); });
    for (let left = base.length - 1; left >= 0; left -= 1) {
      for (let right = changed.length - 1; right >= 0; right -= 1) {
        lcs[left][right] = base[left] === changed[right]
          ? lcs[left + 1][right + 1] + 1
          : Math.max(lcs[left + 1][right], lcs[left][right + 1]);
      }
    }

    const hunks = [];
    let baseIndex = 0;
    let changedIndex = 0;
    while (baseIndex < base.length || changedIndex < changed.length) {
      if (baseIndex < base.length && changedIndex < changed.length && base[baseIndex] === changed[changedIndex]) {
        baseIndex += 1;
        changedIndex += 1;
        continue;
      }
      const start = baseIndex;
      const replacement = [];
      while (baseIndex < base.length || changedIndex < changed.length) {
        if (baseIndex < base.length && changedIndex < changed.length && base[baseIndex] === changed[changedIndex]) break;
        if (changedIndex < changed.length && (baseIndex === base.length || lcs[baseIndex][changedIndex + 1] >= lcs[baseIndex + 1][changedIndex])) {
          replacement.push(changed[changedIndex]);
          changedIndex += 1;
        } else if (baseIndex < base.length) {
          baseIndex += 1;
        }
      }
      hunks.push({ start: start, end: baseIndex, lines: replacement });
    }
    return hunks;
  }

  function sameHunk(left, right) {
    return left.start === right.start && left.end === right.end &&
      left.lines.length === right.lines.length && left.lines.every(function (line, index) { return line === right.lines[index]; });
  }

  function overlaps(left, right) {
    if (sameHunk(left, right)) return false;
    const leftInsertion = left.start === left.end;
    const rightInsertion = right.start === right.end;
    if (leftInsertion && rightInsertion) return false;
    if (leftInsertion) return left.start >= right.start && left.start < right.end;
    if (rightInsertion) return right.start >= left.start && right.start < left.end;
    return Math.max(left.start, right.start) < Math.min(left.end, right.end);
  }

  function mergeText(baseText, localText, remoteText) {
    const base = String(baseText || "");
    const local = String(localText || "");
    const remote = String(remoteText || "");
    if (local === remote) return { merged: local, conflict: false };
    if (local === base) return { merged: remote, conflict: false };
    if (remote === base) return { merged: local, conflict: false };

    const baseLines = base.split("\n");
    const localHunks = diffHunks(baseLines, local.split("\n"));
    const remoteHunks = diffHunks(baseLines, remote.split("\n"));
    if (!localHunks || !remoteHunks) return { merged: null, conflict: true, reason: "document-too-large" };
    for (const localHunk of localHunks) {
      for (const remoteHunk of remoteHunks) {
        if (overlaps(localHunk, remoteHunk)) return { merged: null, conflict: true, reason: "overlapping-edits" };
      }
    }

    const edits = localHunks.slice();
    remoteHunks.forEach(function (hunk) {
      if (edits.some(function (localHunk) { return sameHunk(localHunk, hunk); })) return;
      const sameInsertion = hunk.start === hunk.end && edits.find(function (localHunk) {
        return localHunk.start === localHunk.end && localHunk.start === hunk.start;
      });
      if (!sameInsertion) {
        edits.push(hunk);
        return;
      }
      const blocks = [sameInsertion.lines, hunk.lines].map(function (lines) { return lines.join("\n"); })
        .sort(function (left, right) { return left.localeCompare(right); });
      sameInsertion.lines = blocks.flatMap(function (block) { return block.split("\n"); });
    });
    edits.sort(function (left, right) { return right.start - left.start || right.end - left.end; });
    const merged = baseLines.slice();
    edits.forEach(function (hunk) { merged.splice(hunk.start, hunk.end - hunk.start, ...hunk.lines); });
    return { merged: merged.join("\n"), conflict: false };
  }

  function mergeDocument(base, local, remote) {
    const title = mergeText(base.title, local.title, remote.title);
    const body = mergeText(base.body, local.body, remote.body);
    if (title.conflict || body.conflict) {
      return { merged: null, conflict: true, reason: title.conflict ? title.reason : body.reason };
    }
    return { merged: { title: title.merged, body: body.merged }, conflict: false };
  }

  // True when every remote change is already present in local text. A later
  // keystroke on this device contains the copy just saved here; a deletion or
  // a different word on another device does not.
  function remoteTextContained(baseText, localText, remoteText) {
    const base = String(baseText || "");
    const local = String(localText || "");
    const remote = String(remoteText || "");
    if (remote === local || remote === base) return true;
    const baseLines = base.split("\n");
    const localLines = local.split("\n");
    const remoteLines = remote.split("\n");
    if (remoteLines.length > localLines.length) return false;
    for (let index = 0; index < remoteLines.length; index += 1) {
      const baseLine = index < baseLines.length ? baseLines[index] : "";
      const remoteLine = remoteLines[index];
      const localLine = localLines[index];
      if (remoteLine === localLine || remoteLine === baseLine) continue;
      if (remoteLine.length < baseLine.length && baseLine.startsWith(remoteLine) && localLine.startsWith(baseLine)) return false;
      if (!localLine.startsWith(remoteLine)) return false;
    }
    return true;
  }

  function remoteEditsContained(base, local, remote) {
    if (!base || !local || !remote) return false;
    return remoteTextContained(base.title, local.title, remote.title)
      && remoteTextContained(base.body, local.body, remote.body);
  }

  function isRecordConflict(error) {
    if (!error) return false;
    const values = [error.reason, error.message, error.description, error.serverErrorCode, error.code, error.errorCode];
    if (typeof error === "string") values.push(error);
    if (Array.isArray(error.errors)) values.push(error.errors.map(function (item) { return isRecordConflict(item) ? "CONFLICT" : ""; }).join(" "));
    return /OPLOCK|SERVER_RECORD_CHANGED|serverRecordChanged|RECORD_CHANGED|CONFLICT/i.test(values.filter(Boolean).join(" "));
  }

  return Object.freeze({
    mergeText: mergeText,
    mergeDocument: mergeDocument,
    remoteEditsContained: remoteEditsContained,
    isRecordConflict: isRecordConflict
  });
});
