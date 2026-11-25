// GECToR decode ported from Proofbird quickstart.py (Apache-2.0).
// The model tags each word; this applies those tags and returns character spans.
// It does not fetch anything. The caller supplies vocab, labels, and logits.

const WORD = /[\p{L}\p{N}_]+(?:['’'][\p{L}\p{N}_]+)?|[^\p{L}\p{N}_\s]/gu;
const OPENING = "([{“«";
const CLOSING = ".,;:!?)]}%»”";

function softmaxRow(data, offset, length) {
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < length; index += 1) max = Math.max(max, data[offset + index]);
  const probs = new Float64Array(length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    const value = Math.exp(data[offset + index] - max);
    probs[index] = value;
    sum += value;
  }
  if (!sum) return probs;
  for (let index = 0; index < length; index += 1) probs[index] /= sum;
  return probs;
}

function wordpiece(word, vocab) {
  if (vocab.has(word)) return [vocab.get(word)];
  const ids = [];
  let start = 0;
  while (start < word.length) {
    let end = word.length;
    let id = null;
    while (start < end) {
      const piece = (start === 0 ? "" : "##") + word.slice(start, end);
      if (vocab.has(piece)) {
        id = vocab.get(piece);
        break;
      }
      end -= 1;
    }
    if (id == null) return [vocab.get("[UNK]")];
    ids.push(id);
    start = end;
  }
  return ids;
}

function encodeWords(words, vocab) {
  const cls = vocab.get("[CLS]");
  const sep = vocab.get("[SEP]");
  const unk = vocab.get("[UNK]");
  if (cls == null || sep == null || unk == null) throw new Error("gector-vocab-incomplete");
  const ids = [cls];
  const wordIds = [null];
  words.forEach(function (word, index) {
    wordpiece(word, vocab).forEach(function (id) {
      ids.push(id);
      wordIds.push(index);
    });
  });
  ids.push(sep);
  wordIds.push(null);
  return { ids: ids, wordIds: wordIds };
}

function chooseLabels(logitsLabels, logitsD, tokenCount, labelCount, wordIds, model) {
  const chosen = [];
  const seen = new Set();
  let maxWrong = 0;
  for (let token = 0; token < tokenCount; token += 1) {
    const wordId = wordIds[token];
    const word = token === 0 ? 0 : (wordId == null ? null : wordId + 1);
    if (word == null || seen.has(word)) continue;
    seen.add(word);
    const probs = softmaxRow(logitsLabels, token * labelCount, labelCount);
    probs[model.keepIndex] += model.keepConfidence;
    let best = 0;
    for (let index = 1; index < probs.length; index += 1) if (probs[index] > probs[best]) best = index;
    const detectCount = model.detectCount || 2;
    const wrong = softmaxRow(logitsD, token * detectCount, detectCount)[model.incorrectIndex];
    if (wrong > maxWrong) maxWrong = wrong;
    chosen.push({
      label: probs[best] >= model.minErrorProb ? model.labels[best] : "$KEEP",
      probability: probs[best],
      wrong: wrong
    });
  }
  if (maxWrong < model.minErrorProb) return chosen.map(function (item) { return { label: "$KEEP", probability: item.probability, wrong: item.wrong }; });
  return chosen;
}

function editWord(word, label, verbs) {
  if (label.startsWith("$APPEND_")) return word + " " + label.slice(8);
  if (word === "$START" || label === "$KEEP") return word;
  if (label.startsWith("$REPLACE_")) return label.slice(9);
  if (label === "$DELETE") return "";
  if (label.startsWith("$TRANSFORM_SUF_")) {
    const parts = label.slice(15).split("_");
    const oldEnding = parts[0];
    const newEnding = parts.slice(1).join("_");
    if (!word.endsWith(oldEnding)) return word;
    return word.slice(0, word.length - oldEnding.length) + newEnding;
  }
  if (label.startsWith("$TRANSFORM_VERB_")) {
    const table = verbs || {};
    const key = word + "_" + label.slice(16);
    if (table instanceof Map) return table.get(key) || word;
    return table[key] || word;
  }
  if (label === "$TRANSFORM_CASE_CAPITAL") return word.slice(0, 1).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase();
  if (label === "$TRANSFORM_CASE_LOWER") return word.toLocaleLowerCase();
  if (label === "$TRANSFORM_CASE_UPPER") return word.toLocaleUpperCase();
  if (label === "$TRANSFORM_AGREEMENT_PLURAL") return word + "s";
  if (label === "$TRANSFORM_AGREEMENT_SINGULAR") return word.slice(0, -1);
  if (label === "$TRANSFORM_SPLIT_HYPHEN") return word.replace(/-/g, " ");
  if (label.startsWith("$MERGE_")) return word + " " + label;
  return word;
}

function surfaceSpans(text, glued) {
  const articles = glued || new Set();
  const out = [];
  for (const match of String(text || "").matchAll(WORD)) {
    const token = match[0];
    const splitAt = token.indexOf("'") >= 0 ? token.indexOf("'") : token.indexOf("’");
    if (splitAt > 0) {
      const article = token.slice(0, splitAt);
      const rest = token.slice(splitAt + 1);
      if (rest && articles.has(article.toLocaleLowerCase())) {
        const first = article + "'";
        out.push([first, match.index, match.index + first.length]);
        out.push([rest, match.index + token.length - rest.length, match.index + token.length]);
        continue;
      }
    }
    out.push([token, match.index, match.index + token.length]);
  }
  return out;
}

function rejoin(tokens) {
  const out = [];
  tokens.forEach(function (token) {
    if (out.length && out[out.length - 1].length > 1 && out[out.length - 1].endsWith("'") && /^[\p{L}\p{N}]/u.test(token)) out[out.length - 1] += token;
    else out.push(token);
  });
  return out;
}

function joinWords(text) {
  const collapsed = String(text || "").split(/\s+/u).filter(Boolean).join(" ");
  const closed = collapsed.replace(new RegExp(" ([" + CLOSING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "])", "g"), "$1");
  const opening = OPENING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return closed.replace(new RegExp("([" + opening + "]) ", "g"), "$1");
}

function applyTags(words, tags, verbs) {
  const edited = ["$START"].concat(words).map(function (word, index) {
    const tag = tags[index] && tags[index].label ? tags[index].label : tags[index] || "$KEEP";
    return editWord(word, tag, verbs);
  });
  const joined = edited.filter(Boolean).join(" ").replace(/ \$MERGE_HYPHEN /g, "-").replace(/ \$MERGE_SPACE /g, "");
  const tokens = joined.split(/\s+/u).filter(function (token) { return token && token !== "$START"; });
  const next = [];
  rejoin(tokens).forEach(function (token) {
    surfaceSpans(token).forEach(function (span) { next.push(span[0]); });
  });
  return next;
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
    if (source[i] === target[j]) { steps.push("equal"); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { steps.push("delete"); i += 1; }
    else { steps.push("insert"); j += 1; }
  }
  while (i < n) { steps.push("delete"); i += 1; }
  while (j < m) { steps.push("insert"); j += 1; }
  const ops = [];
  i = 0;
  j = 0;
  steps.forEach(function (step) {
    const type = step === "equal" ? "equal" : "change";
    let current = ops[ops.length - 1];
    if (!current || current.type !== type) {
      current = { type: type, i1: i, i2: i, j1: j, j2: j };
      ops.push(current);
    }
    if (step !== "insert") i += 1;
    if (step !== "delete") j += 1;
    current.i2 = i;
    current.j2 = j;
  });
  return ops;
}

function suggestionsFor(original, correctedWords) {
  const spans = surfaceSpans(original);
  const source = spans.map(function (span) { return span[0]; });
  const out = [];
  opcodes(source, correctedWords).forEach(function (op) {
    if (op.type === "equal") return;
    let replacement = joinWords(correctedWords.slice(op.j1, op.j2).join(" "));
    let start;
    let end;
    if (op.i1 === op.i2) {
      if (op.i1 < source.length) {
        start = end = spans[op.i1][1];
        if (replacement && OPENING.includes(replacement.slice(-1))) {
          // An opening mark stays attached to the next word.
        } else if (op.i1 === 0 || /[\p{L}\p{N}]/u.test(source[op.i1][0])) replacement += " ";
        else replacement = " " + replacement;
      } else {
        start = end = spans.length ? spans[spans.length - 1][2] : 0;
        replacement = (/[\p{L}\p{N}]/u.test(replacement[0] || "") ? " " : "") + replacement;
      }
    } else {
      start = spans[op.i1][1];
      end = spans[op.i2 - 1][2];
      if (replacement && end < original.length && /[\p{L}\p{N}]/u.test(original[end]) && /[\p{L}\p{N}]/u.test(replacement.slice(-1))) replacement += " ";
      if (!replacement) {
        if (end < original.length && original[end] === " ") end += 1;
        else if (start > 0 && original[start - 1] === " ") start -= 1;
      }
    }
    out.push({
      start: start,
      end: end,
      replacement: replacement,
      kind: "grammar",
      message: "Grammar suggestion"
    });
  });
  return out;
}

function splitCore(text, strip) {
  const source = String(text || "");
  if (!strip) return { core: source, tail: "" };
  const trimmed = source.trimEnd();
  const last = trimmed.slice(-1);
  if (!last || !strip.includes(last)) return { core: source, tail: "" };
  return { core: trimmed.slice(0, -1), tail: source.slice(trimmed.length - 1) };
}

async function correctText(text, resources, runLogits) {
  const model = resources || {};
  const strip = model.stripTrailingTerminator === false ? "" : (model.stripTerminators || ".!?");
  const parts = splitCore(text, strip);
  const plain = parts.core.replace(/’/g, "'");
  let words = surfaceSpans(plain).map(function (span) { return span[0]; });
  const verbs = model.verbs || new Map();
  for (let pass = 0; pass < (model.maxPasses || 5); pass += 1) {
    const encoded = encodeWords(words, model.vocab);
    const output = await runLogits(encoded.ids);
    const tags = chooseLabels(
      output.logitsLabels,
      output.logitsD,
      encoded.ids.length,
      model.labels.length,
      encoded.wordIds,
      model
    );
    const next = applyTags(words, tags, verbs);
    if (next.length === words.length && next.every(function (word, index) { return word === words[index]; })) break;
    words = next;
  }
  return suggestionsFor(parts.core, words).map(function (span) {
    return Object.assign({}, span, { original: parts.core.slice(span.start, span.end) });
  });
}

function vocabFromLines(text) {
  const vocab = new Map();
  String(text || "").split(/\n/u).forEach(function (line, index) {
    if (line) vocab.set(line, index);
  });
  return vocab;
}

function verbsFromLines(text) {
  const verbs = new Map();
  String(text || "").split(/\n/u).forEach(function (line) {
    const split = line.indexOf(":");
    if (split < 0) return;
    const words = line.slice(0, split);
    const tags = line.slice(split + 1).trim();
    const underscore = words.indexOf("_");
    if (underscore < 0) return;
    verbs.set(words.slice(0, underscore) + "_" + tags, words.slice(underscore + 1));
  });
  return verbs;
}

export {
  applyTags,
  chooseLabels,
  correctText,
  editWord,
  encodeWords,
  suggestionsFor,
  verbsFromLines,
  vocabFromLines
};
