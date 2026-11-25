// Which sentences are ready to check, and which word is still being typed.

const ABBREVIATIONS = new Set([
  "dr", "mr", "mrs", "ms", "prof", "rev", "fr", "st", "sgt", "gen", "rep", "sen", "gov", "lt", "col", "capt", "maj", "jr", "sr",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "gen", "ex", "lev", "num", "deut", "josh", "judg", "ps", "pss", "prov", "eccl", "isa", "jer", "lam", "ezek", "dan", "hos", "obad", "jonah", "mic", "nah", "hab", "zeph", "hag", "zech", "mal",
  "matt", "mt", "mk", "lk", "jn", "rom", "cor", "gal", "eph", "phil", "col", "thess", "tim", "tit", "philem", "heb", "jas", "pet", "rev"
]);

function sentenceRanges(text) {
  const source = String(text || "");
  if (!source) return [];
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const raw = Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(source));
    const merged = [];
    raw.forEach(function (item) {
      const previous = merged[merged.length - 1];
      const previousText = previous && previous.segment;
      const abbreviation = previousText && /(?:^|\s)([A-Z][A-Za-z]{0,7})\.$/u.exec(previousText.trimEnd());
      const nextStartsNumber = /^\s*\d/u.test(item.segment);
      if (previous && abbreviation && (ABBREVIATIONS.has(abbreviation[1].toLocaleLowerCase()) || nextStartsNumber)) previous.segment += item.segment;
      else merged.push({ index: item.index, segment: item.segment });
    });
    return merged.map(function (item) {
      return trimRange(source, item.index, item.index + item.segment.length);
    }).filter(Boolean);
  }
  const ranges = [];
  const pattern = /[.!?]+(?:["'’”)]*)?(?:\s+|$)/gu;
  let start = 0;
  let match;
  while ((match = pattern.exec(source))) {
    const before = source.slice(start, match.index + match[0].trimEnd().length);
    const abbreviation = /(?:^|\s)([A-Z][A-Za-z]{0,7})\.$/u.exec(before.trimEnd());
    if (abbreviation && (ABBREVIATIONS.has(abbreviation[1].toLocaleLowerCase()) || /^\s*\d/u.test(source.slice(pattern.lastIndex)))) continue;
    const range = trimRange(source, start, pattern.lastIndex);
    if (range) ranges.push(range);
    start = pattern.lastIndex;
  }
  const tail = trimRange(source, start, source.length);
  if (tail) ranges.push(tail);
  return ranges.length ? ranges : [trimRange(source, 0, source.length)].filter(Boolean);
}

function trimRange(text, start, end) {
  let from = start;
  let to = end;
  while (from < to && /\s/u.test(text[from])) from += 1;
  while (to > from && /\s/u.test(text[to - 1])) to -= 1;
  if (to <= from) return null;
  return { start: from, end: to, text: text.slice(from, to) };
}

function typingWordRange(text, caret) {
  const source = String(text || "");
  if (!Number.isInteger(caret) || caret <= 0 || caret > source.length) return null;
  if (!/[\p{L}\p{N}'’]/u.test(source[caret - 1])) return null;
  let start = caret - 1;
  while (start > 0 && /[\p{L}\p{N}'’]/u.test(source[start - 1])) start -= 1;
  let end = caret;
  while (end < source.length && /[\p{L}\p{N}'’]/u.test(source[end])) end += 1;
  return { start: start, end: end };
}

function sentenceEnded(sentence) {
  return /[.!?]["'’”)\]]*$/u.test(sentence.text);
}

function dueSentences(text, caret, mode) {
  const sentences = sentenceRanges(text);
  if (mode === "idle" || caret == null) return sentences;
  return sentences.filter(function (sentence) {
    const caretInside = caret >= sentence.start && caret <= sentence.end;
    if (sentenceEnded(sentence)) return true;
    return mode === "boundary" && !caretInside;
  });
}

function filterActiveWord(spans, active) {
  if (!active) return spans || [];
  return (spans || []).filter(function (span) {
    return span.end <= active.start || span.start >= active.end;
  });
}

export { dueSentences, filterActiveWord, sentenceRanges, typingWordRange };
