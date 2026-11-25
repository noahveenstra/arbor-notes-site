// Span diff, confidence filter, protected-span guard, and cascade merge
// for always-on proofreading. Edits stay suggestions until the user accepts one.

const CONFIDENCE_THRESHOLD = 0.8;
const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const BOOKS = "Genesis|Gen|Exodus|Exod|Ex|Leviticus|Lev|Numbers|Num|Deuteronomy|Deut|Joshua|Josh|Judges|Judg|Ruth|Samuel|Sam|Kings|Kgs|Chronicles|Chron|Chr|Ezra|Nehemiah|Neh|Esther|Esth|Job|Psalms|Psalm|Ps|Proverbs|Prov|Ecclesiastes|Eccl|Song of Solomon|Song of Songs|Isaiah|Isa|Jeremiah|Jer|Lamentations|Lam|Ezekiel|Ezek|Daniel|Dan|Hosea|Hos|Joel|Amos|Obadiah|Obad|Jonah|Micah|Mic|Nahum|Nah|Habakkuk|Hab|Zephaniah|Zeph|Haggai|Hag|Zechariah|Zech|Malachi|Mal|Matthew|Matt|Mt|Mark|Mk|Luke|Lk|John|Jn|Acts|Romans|Rom|Corinthians|Cor|Galatians|Gal|Ephesians|Eph|Philippians|Phil|Colossians|Col|Thessalonians|Thess|Timothy|Tim|Titus|Tit|Philemon|Philem|Hebrews|Heb|James|Jas|Peter|Pet|Jude|Revelation|Rev";
const SCRIPTURE = new RegExp("(?:\\b[1-3]\\s+)?(?:(?:" + BOOKS + ")\\.)\\s*\\d{1,3}(?::\\d{1,3}(?:\\s*[\\u2013\\u2014-]\\s*\\d{1,3})?)?|(?:\\b[1-3]\\s+)?(?:(?:" + BOOKS + "))\\s+\\d{1,3}(?::\\d{1,3}(?:\\s*[\\u2013\\u2014-]\\s*\\d{1,3})?)?", "g");
const FUNCTION_WORDS = new Set("a an the to of in on for and or but is are was were be been being do does did have has had that this these those it its as at by with from if so than then too very can could will would should may might must".split(" "));
const NEGATION = new Map([
  ["no", "no"], ["not", "not"], ["never", "never"], ["neither", "neither"], ["nor", "nor"], ["without", "without"],
  ["cannot", "not"], ["can't", "not"], ["cant", "not"], ["don't", "not"], ["dont", "not"], ["doesn't", "not"], ["doesnt", "not"],
  ["didn't", "not"], ["didnt", "not"], ["isn't", "not"], ["isnt", "not"], ["aren't", "not"], ["arent", "not"],
  ["wasn't", "not"], ["wasnt", "not"], ["weren't", "not"], ["werent", "not"], ["won't", "not"], ["wont", "not"],
  ["wouldn't", "not"], ["wouldnt", "not"], ["couldn't", "not"], ["couldnt", "not"], ["shouldn't", "not"], ["shouldnt", "not"],
  ["hasn't", "not"], ["hasnt", "not"], ["haven't", "not"], ["havent", "not"], ["hadn't", "not"], ["hadnt", "not"],
  ["mustn't", "not"], ["mustnt", "not"], ["needn't", "not"], ["neednt", "not"], ["shan't", "not"], ["shant", "not"]
]);

function tokenSpans(text) {
  return Array.from(String(text || "").matchAll(TOKEN_PATTERN), function (match) {
    return { text: match[0], start: match.index, end: match.index + match[0].length };
  });
}

function wordTokens(text) {
  return Array.from(String(text || "").matchAll(WORD_PATTERN), function (match) { return match[0]; });
}

function needsSpace(left, right) {
  if (!left || !right) return false;
  if (/[([{“«]$/u.test(left)) return false;
  if (/^[)\]},.;:!?%»”’]/u.test(right)) return false;
  return true;
}

function joinTokens(tokens) {
  return tokens.reduce(function (text, token) {
    if (!text) return token;
    return text + (needsSpace(text, token) ? " " : "") + token;
  }, "");
}

function opcodes(source, target) {
  const n = source.length;
  const m = target.length;
  const dp = Array.from({ length: n + 1 }, function () { return new Uint16Array(m + 1); });
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = source[i] === target[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const steps = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (source[i] === target[j]) {
      steps.push("equal");
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      steps.push("delete");
      i += 1;
    } else {
      steps.push("insert");
      j += 1;
    }
  }
  while (i < n) { steps.push("delete"); i += 1; }
  while (j < m) { steps.push("insert"); j += 1; }
  const ops = [];
  i = 0;
  j = 0;
  steps.forEach(function (step) {
    const type = step === "equal" ? "equal" : "replace";
    let current = ops[ops.length - 1];
    if (!current || current.type !== type) {
      current = { type: type, i1: i, i2: i, j1: j, j2: j };
      ops.push(current);
    }
    if (step === "delete" || step === "equal") i += 1;
    if (step === "insert" || step === "equal") j += 1;
    current.i2 = i;
    current.j2 = j;
  });
  return ops;
}

function diffWordSpans(source, replacement) {
  const original = String(source || "");
  const revised = String(replacement || "");
  const sourceTokens = tokenSpans(original);
  const targetTokens = tokenSpans(revised);
  const ops = opcodes(sourceTokens.map(function (token) { return token.text; }), targetTokens.map(function (token) { return token.text; }));
  const spans = [];
  ops.forEach(function (op) {
    if (op.type === "equal") return;
    const from = sourceTokens.slice(op.i1, op.i2);
    const to = targetTokens.slice(op.j1, op.j2);
    let start;
    let end;
    let text = joinTokens(to.map(function (token) { return token.text; }));
    if (!from.length) {
      if (op.i1 < sourceTokens.length) {
        const next = sourceTokens[op.i1];
        start = next.start;
        end = next.end;
        text = text + (needsSpace(text, next.text) ? " " : "") + next.text;
      } else if (sourceTokens.length) {
        const previous = sourceTokens[sourceTokens.length - 1];
        start = previous.start;
        end = previous.end;
        text = previous.text + (needsSpace(previous.text, text) ? " " : "") + text;
      } else {
        start = 0;
        end = 0;
      }
    } else {
      start = from[0].start;
      end = from[from.length - 1].end;
      if (!text) {
        if (end < original.length && original[end] === " ") end += 1;
        else if (start > 0 && original[start - 1] === " ") start -= 1;
      }
    }
    if (start == null || end < start || original.slice(start, end) === text) return;
    const generatedStart = to.length ? to[0].start : (op.j1 < targetTokens.length ? targetTokens[op.j1].start : revised.length);
    const generatedEnd = to.length ? to[to.length - 1].end : generatedStart;
    spans.push({
      start: start,
      end: end,
      replacement: text,
      kind: "grammar",
      message: "Grammar suggestion",
      generatedStart: generatedStart,
      generatedEnd: generatedEnd
    });
  });
  return spans;
}

function spanConfidence(ranges, start, end) {
  if (start === end) {
    let previous = null;
    let next = null;
    ranges.forEach(function (range) {
      if (range.end <= start) previous = range;
      if (!next && range.start >= end && range.end > range.start) next = range;
    });
    const neighbors = [previous, next].filter(Boolean);
    if (!neighbors.length) return 0;
    return Math.min.apply(null, neighbors.map(function (range) { return range.confidence; }));
  }
  const overlapping = ranges.filter(function (range) {
    return range.end > start && range.start < end && range.end > range.start;
  });
  if (!overlapping.length) return 0;
  return Math.min.apply(null, overlapping.map(function (range) { return range.confidence; }));
}

function confidentEdits(source, pieces, threshold) {
  const limit = Number.isFinite(threshold) ? threshold : CONFIDENCE_THRESHOLD;
  const parts = Array.isArray(pieces) ? pieces : [];
  const generated = parts.map(function (piece) { return piece && piece.text || ""; }).join("");
  const trimmedStart = generated.length - generated.trimStart().length;
  const trimmed = generated.trim();
  const ranges = [];
  let offset = 0;
  parts.forEach(function (piece) {
    const text = piece && piece.text || "";
    const confidence = Number(piece && piece.confidence);
    ranges.push({ start: offset, end: offset + text.length, confidence: Number.isFinite(confidence) ? confidence : 0 });
    offset += text.length;
  });
  return diffWordSpans(source, trimmed).filter(function (span) {
    const confidence = spanConfidence(ranges, trimmedStart + span.generatedStart, trimmedStart + span.generatedEnd);
    span.confidence = confidence;
    delete span.generatedStart;
    delete span.generatedEnd;
    return confidence >= limit;
  });
}

function rangesOverlap(start, end, otherStart, otherEnd) {
  if (start === end) return start > otherStart && start < otherEnd;
  if (otherStart === otherEnd) return otherStart > start && otherStart < end;
  return start < otherEnd && otherStart < end;
}

function pushMatches(text, pattern, kind, ranges) {
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (!match[0]) { pattern.lastIndex += 1; continue; }
    ranges.push({ start: match.index, end: match.index + match[0].length, kind: kind });
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSentenceStart(text, index) {
  const before = text.slice(0, index);
  return /^[\s]*$/u.test(before) || /[.!?]["'’”)\]]*\s+$/u.test(before) || /[\r\n]\s*$/u.test(before);
}

function protectedRanges(text, options) {
  const source = String(text || "");
  const config = options || {};
  const ranges = [];
  pushMatches(source, SCRIPTURE, "scripture", ranges);
  pushMatches(source, /```[\s\S]*?```/g, "markdown", ranges);
  pushMatches(source, /^#{1,6}[ \t]+\S.*$/gm, "markdown", ranges);
  pushMatches(source, /`[^`\r\n]+`/g, "code", ranges);
  pushMatches(source, /!?\[[^\]\r\n]*\]\([^)\r\n]+\)/g, "markdown", ranges);
  pushMatches(source, /(\*\*|__|~~)(?:(?!\1).)+\1/g, "markdown", ranges);
  pushMatches(source, /(^|[\s(])(\*|_)(?=\S)(?:(?!\2).)+\2/g, "markdown", ranges);
  pushMatches(source, /\bhttps?:\/\/[^\s<>)]+/giu, "url", ranges);
  pushMatches(source, /\bwww\.[^\s<>)]+/giu, "url", ranges);
  pushMatches(source, /\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}\b/gu, "email", ranges);
  pushMatches(source, /<\/?[A-Za-z][^>\r\n]*>/g, "tag", ranges);
  pushMatches(source, /(^|\s)#[\p{L}\p{N}_-]+/gu, "tag", ranges);
  pushMatches(source, /\b[\p{L}\p{N}_-]*\d[\p{L}\p{N}_-]*\b/gu, "digit", ranges);
  const terms = [];
  String(config.displayName || "").split(/[\s-]+/u).forEach(function (part) { if (part) terms.push(part); });
  (Array.isArray(config.protectedTerms) ? config.protectedTerms : []).forEach(function (term) { if (term) terms.push(String(term)); });
  terms.forEach(function (term) {
    const pattern = new RegExp("(?<![\\p{L}\\p{N}])" + escapeRegExp(term) + "(?![\\p{L}\\p{N}])", "giu");
    pushMatches(source, pattern, "name", ranges);
  });
  const capital = /\b\p{Lu}[\p{L}'’]*\b/gu;
  let match;
  while ((match = capital.exec(source))) {
    if (match[0] === "I" || isSentenceStart(source, match.index)) continue;
    ranges.push({ start: match.index, end: match.index + match[0].length, kind: "name" });
  }
  pushMatches(source, /\b[A-Z]{2,}[A-Z0-9]*\b/g, "name", ranges);
  return ranges;
}

function touchesProtected(span, ranges) {
  return ranges.some(function (range) { return rangesOverlap(span.start, span.end, range.start, range.end); });
}

function levenshtein(left, right) {
  const a = String(left);
  const b = String(right);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Uint16Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) row[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = current;
    }
  }
  return row[b.length];
}

function relatedWords(left, right) {
  const a = String(left || "").toLocaleLowerCase();
  const b = String(right || "").toLocaleLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (NEGATION.get(a) && NEGATION.get(a) === NEGATION.get(b)) return true;
  if (levenshtein(a, b) <= 2) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 2 && longer.startsWith(shorter) && longer.length - shorter.length <= 3) return true;
  if (FUNCTION_WORDS.has(a) && FUNCTION_WORDS.has(b)) return true;
  return false;
}

function negationKey(text) {
  return wordTokens(text).map(function (word) { return NEGATION.get(word.toLocaleLowerCase()) || ""; }).filter(Boolean).sort().join("|");
}

function numberKey(text) {
  return (String(text || "").match(/\d+(?:[.,]\d+)*/g) || []).join("|");
}

function swapsTheA(source, replacement) {
  const from = wordTokens(source).map(function (word) { return word.toLocaleLowerCase(); });
  const to = wordTokens(replacement).map(function (word) { return word.toLocaleLowerCase(); });
  const ops = opcodes(from, to);
  return ops.some(function (op) {
    if (op.type === "equal") return false;
    const left = from.slice(op.i1, op.i2);
    const right = to.slice(op.j1, op.j2);
    const count = Math.max(left.length, right.length);
    for (let index = 0; index < count; index += 1) {
      const before = left[index] || "";
      const after = right[index] || "";
      if ((before === "the" && after === "a") || (before === "a" && after === "the")) return true;
    }
    return false;
  });
}

function unrelatedSwap(source, replacement) {
  const from = wordTokens(source);
  const to = wordTokens(replacement);
  if (!from.length || !to.length) return false;
  const ops = opcodes(from, to);
  return ops.some(function (op) {
    if (op.type === "equal") return false;
    const left = from.slice(op.i1, op.i2);
    const right = to.slice(op.j1, op.j2);
    if (!right.length) return false;
    return right.some(function (word) {
      return !left.some(function (original) { return relatedWords(original, word); });
    });
  });
}

function capitalizesOrdinaryMidSentence(text, span, options) {
  const source = String(text || "");
  const original = source.slice(span.start, span.end);
  const replacement = String(span.replacement || "");
  const from = tokenSpans(original).filter(function (token) { return /^[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*$/u.test(token.text); });
  const to = wordTokens(replacement);
  const limit = Math.max(from.length, to.length);
  const protectedNames = new Set();
  String((options || {}).displayName || "").split(/[\s-]+/u).forEach(function (part) {
    if (part) protectedNames.add(part.toLocaleLowerCase());
  });
  ((options || {}).protectedTerms || []).forEach(function (term) {
    if (term) protectedNames.add(String(term).toLocaleLowerCase());
  });
  for (let index = 0; index < limit; index += 1) {
    const before = from[index];
    const after = to[index];
    if (!before || !after) continue;
    if (before.text[0] === before.text[0].toLocaleLowerCase() && after[0] !== after[0].toLocaleLowerCase() && after[0] === after[0].toLocaleUpperCase()) {
      if (before.text.toLocaleLowerCase() === "i") continue;
      if (protectedNames.has(before.text.toLocaleLowerCase()) || protectedNames.has(after.toLocaleLowerCase())) continue;
      if (isSentenceStart(source, span.start + before.start)) continue;
      return true;
    }
  }
  return false;
}

function guardSpans(text, spans, options) {
  const source = String(text || "");
  const ranges = protectedRanges(source, options);
  return (Array.isArray(spans) ? spans : []).filter(function (span) {
    if (!span || !Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end < span.start || span.end > source.length) return false;
    if (touchesProtected(span, ranges)) return false;
    if (span.detectOnly || span.replacement == null) return true;
    const original = source.slice(span.start, span.end);
    const replacement = String(span.replacement);
    if (original === replacement) return false;
    if (negationKey(original) !== negationKey(replacement)) return false;
    if (numberKey(original) !== numberKey(replacement)) return false;
    const fromCount = wordTokens(original).length;
    const toCount = wordTokens(replacement).length;
    if (fromCount > 3 || toCount > 3) return false;
    if (unrelatedSwap(original, replacement)) return false;
    if (swapsTheA(original, replacement)) return false;
    if (capitalizesOrdinaryMidSentence(source, span, options)) return false;
    return true;
  });
}

function mergeCascade(layers) {
  let current = [];
  (Array.isArray(layers) ? layers : []).forEach(function (layer) {
    (Array.isArray(layer) ? layer : []).forEach(function (span) {
      if (!span) return;
      if (span.detectOnly || span.replacement == null) {
        const covered = current.some(function (existing) {
          return !existing.detectOnly && existing.replacement != null && rangesOverlap(existing.start, existing.end, span.start, span.end);
        });
        if (!covered) current.push(span);
        return;
      }
      current = current.filter(function (existing) {
        return existing.detectOnly || existing.replacement == null || !rangesOverlap(existing.start, existing.end, span.start, span.end);
      });
      current.push(span);
    });
  });
  return current.sort(function (left, right) { return left.start - right.start || left.end - right.end; });
}

export {
  CONFIDENCE_THRESHOLD,
  capitalizesOrdinaryMidSentence,
  confidentEdits,
  diffWordSpans,
  guardSpans,
  mergeCascade,
  protectedRanges,
  relatedWords
};
