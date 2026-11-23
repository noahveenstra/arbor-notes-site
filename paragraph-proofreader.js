(function attachArborParagraphProofreader(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborParagraphProofreader = api;
})(globalThis, function createArborParagraphProofreader() {
  const INSTRUCTION = "Proofread only the target text for grammar, spelling, punctuation, usage, and clear readability problems. Preserve its meaning, voice, names, references, and Markdown. Do not add facts or rewrite for style. Return the complete revised text only. If no useful correction is needed, return the text unchanged.";
  const MAX_CONTEXT_CHARACTERS = 500;
  const MAX_PROTECTED_TERMS = 100;
  const FORMAT_SPAN_PATTERNS = [
    /```[\s\S]*?```/g,
    /`[^`\r\n]+`/g,
    /!?\[[^\]\r\n]+\]\([^\r\n)]+\)/g,
    /\*\*[^*\r\n]+\*\*/g,
    /__[^_\r\n]+__/g,
    /~~[^~\r\n]+~~/g,
    /\*[^*\r\n]+\*/g,
    /_[^_\r\n]+_/g
  ];
  const BLOCK_MARKER_PATTERN = /^[ \t]*(?:#{1,6}[ \t]+|(?:[-+*]|\d+[.)])[ \t]+|>[ \t]*)/gm;
  const MARKDOWN_TOKEN_PATTERN = /```|`|\*\*|__|~~|\*|_|!?\[|\]\(/g;
  const SCRIPTURE_REFERENCE_PATTERN = /(?:\b\d+\s+)?[A-Z][A-Za-z]{1,8}\.\s*\d{1,3}(?::\d{1,3}(?:[–—-]\d{1,3})?)?/g;
  const CASE_SENSITIVE_WORD_PATTERN = /\b(?=[\p{L}\p{N}'’_-]*\p{Lu})(?=[\p{L}\p{N}'’_-]*\p{Ll})[\p{L}\p{N}'’_-]+\b/gu;
  const ACRONYM_PATTERN = /\b[A-Z]{2,}[A-Z0-9]*\b/g;
  const URL_PATTERN = /https?:\/\/[^\s)]+/giu;
  const NUMBER_PATTERN = /\b\d+(?:[.,:]\d+)*(?:%|\b)/g;
  const NEGATION_PATTERN = /\b(?:no|not|never|neither|nor|without|cannot|can't|couldn't|didn't|doesn't|don't|hadn't|hasn't|haven't|isn't|mustn't|needn't|shan't|shouldn't|wasn't|weren't|won't|wouldn't)\b/giu;
  const ABBREVIATIONS = new Set([
    "dr", "mr", "mrs", "ms", "prof", "rev", "fr", "st", "sgt", "gen", "rep", "sen", "gov", "lt", "col", "capt", "maj", "jr", "sr",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
    "gen", "ex", "lev", "num", "deut", "josh", "judg", "ps", "pss", "prov", "eccl", "isa", "jer", "lam", "ezek", "dan", "hos", "obad", "jonah", "mic", "nah", "hab", "zeph", "hag", "zech", "mal",
    "matt", "mt", "mk", "lk", "jn", "rom", "cor", "gal", "eph", "phil", "col", "thess", "tim", "tit", "philem", "heb", "jas", "pet", "rev"
  ]);

  function unavailable(reason, inputTokens) {
    const result = { status: "unavailable", reason: reason };
    if (Number.isInteger(inputTokens)) result.inputTokens = inputTokens;
    return result;
  }

  function noSuggestion(reason) {
    return { status: "no-suggestion", reason: reason || "unchanged" };
  }

  function collectMatches(source, pattern, target) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) {
      if (match[0]) target.add(match[0]);
    }
  }

  function protectedLiterals(source, suppliedTerms) {
    const terms = new Set(suppliedTerms || []);
    FORMAT_SPAN_PATTERNS.forEach(function (pattern) { collectMatches(source, pattern, terms); });
    collectMatches(source, SCRIPTURE_REFERENCE_PATTERN, terms);
    collectMatches(source, CASE_SENSITIVE_WORD_PATTERN, terms);
    collectMatches(source, ACRONYM_PATTERN, terms);
    collectMatches(source, URL_PATTERN, terms);
    collectMatches(source, NUMBER_PATTERN, terms);
    collectMatches(source, NEGATION_PATTERN, terms);
    collectMatches(source, /\bI\b/g, terms);
    return Array.from(terms).filter(Boolean);
  }

  function countLiteral(source, literal) {
    let count = 0;
    let offset = 0;
    while ((offset = source.indexOf(literal, offset)) !== -1) {
      count += 1;
      offset += literal.length;
    }
    return count;
  }

  function sameCounts(source, candidate, literals) {
    return literals.every(function (literal) {
      return countLiteral(candidate, literal) >= countLiteral(source, literal);
    });
  }

  function signature(source, pattern) {
    pattern.lastIndex = 0;
    return source.match(pattern) || [];
  }

  function preserveStructure(source, candidate, suppliedTerms) {
    if (!sameCounts(source, candidate, protectedLiterals(source, suppliedTerms))) return false;
    if (JSON.stringify(signature(source, BLOCK_MARKER_PATTERN)) !== JSON.stringify(signature(candidate, BLOCK_MARKER_PATTERN))) return false;
    if (JSON.stringify(signature(source, MARKDOWN_TOKEN_PATTERN)) !== JSON.stringify(signature(candidate, MARKDOWN_TOKEN_PATTERN))) return false;
    const sourceBreaks = source.match(/\r\n|\r|\n/g) || [];
    const candidateBreaks = candidate.match(/\r\n|\r|\n/g) || [];
    return JSON.stringify(sourceBreaks) === JSON.stringify(candidateBreaks);
  }

  function validText(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function validContext(value) {
    return value === undefined || (typeof value === "string" && value.length <= MAX_CONTEXT_CHARACTERS);
  }

  function sentenceSegments(paragraph) {
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      const raw = Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(paragraph));
      const merged = [];
      for (const item of raw) {
        const previous = merged[merged.length - 1];
        const previousText = previous && previous.segment;
        const shortAbbreviation = previousText && /(?:^|\s)([A-Z][A-Za-z]{0,7})\.$/u.exec(previousText.trimEnd());
        const nextStartsNumber = /^\s*\d/u.test(item.segment);
        if (previous && shortAbbreviation && (ABBREVIATIONS.has(shortAbbreviation[1].toLowerCase()) || nextStartsNumber)) {
          previous.segment += item.segment;
        } else {
          merged.push({ index: item.index, segment: item.segment });
        }
      }
      return merged.map(function (item) { return { start: item.index, text: item.segment }; });
    }

    const segments = [];
    const pattern = /[.!?]+(?:["'’”)]*)?(?:\s+|$)/gu;
    let start = 0;
    let match;
    while ((match = pattern.exec(paragraph))) {
      const before = paragraph.slice(start, match.index + match[0].trimEnd().length);
      const shortAbbreviation = /(?:^|\s)([A-Z][A-Za-z]{0,7})\.$/u.exec(before.trimEnd());
      if (shortAbbreviation && (ABBREVIATIONS.has(shortAbbreviation[1].toLowerCase()) || /^\s*\d/u.test(paragraph.slice(pattern.lastIndex)))) continue;
      const end = pattern.lastIndex;
      if (paragraph.slice(start, end).trim()) segments.push({ start: start, text: paragraph.slice(start, end) });
      start = end;
    }
    if (start < paragraph.length && paragraph.slice(start).trim()) segments.push({ start: start, text: paragraph.slice(start) });
    return segments.length ? segments : [{ start: 0, text: paragraph }];
  }

  function wordTokens(text) {
    const pattern = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
    const tokens = [];
    let match;
    while ((match = pattern.exec(text))) tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    return tokens;
  }

  function singleWordChanges(original, replacement, rangeStart) {
    const source = wordTokens(original);
    const candidate = wordTokens(replacement);
    if (!source.length || !candidate.length) return [];
    const rows = source.length + 1;
    const columns = candidate.length + 1;
    const lcs = Array.from({ length: rows }, function () { return new Uint16Array(columns); });
    for (let i = source.length - 1; i >= 0; i -= 1) {
      for (let j = candidate.length - 1; j >= 0; j -= 1) {
        lcs[i][j] = source[i].text === candidate[j].text ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    const changes = [];
    let i = 0;
    let j = 0;
    let sourceStart = -1;
    let candidateStart = -1;
    const flush = function () {
      if (sourceStart >= 0 && i - sourceStart === 1 && j - candidateStart === 1) {
        const before = source[sourceStart];
        const after = candidate[candidateStart];
        if (before.text !== after.text) changes.push({
          status: "suggestion",
          original: before.text,
          replacement: after.text,
          start: rangeStart + before.start,
          end: rangeStart + before.end
        });
      }
      sourceStart = -1;
      candidateStart = -1;
    };
    while (i < source.length || j < candidate.length) {
      if (i < source.length && j < candidate.length && source[i].text === candidate[j].text) {
        flush();
        i += 1;
        j += 1;
      } else {
        if (sourceStart < 0) {
          sourceStart = i;
          candidateStart = j;
        }
        if (i < source.length && (j >= candidate.length || lcs[i + 1][j] >= lcs[i][j + 1])) i += 1;
        else j += 1;
      }
    }
    flush();
    return changes;
  }

  function applyWordChangesToRange(original, rangeStart, changes) {
    let replacement = original;
    const ordered = changes.slice().sort(function (left, right) { return right.start - left.start; });
    for (const change of ordered) {
      const start = change.start - rangeStart;
      const end = change.end - rangeStart;
      if (start < 0 || end <= start || end > original.length || replacement.slice(start, end) !== change.original) return null;
      replacement = replacement.slice(0, start) + change.replacement + replacement.slice(end);
    }
    return replacement;
  }

  function createParagraphProofreader(options) {
    const config = options || {};
    const runner = config.localRunner;
    const maxInputTokens = config.maxInputTokens;

    if (!Number.isSafeInteger(maxInputTokens) || maxInputTokens < 1) {
      throw new TypeError("A positive model input-token limit is required");
    }

    async function suggest(request) {
      if (!request || !validText(request.paragraph) || !validContext(request.contextBefore) || !validContext(request.contextAfter)) {
        return unavailable("invalid-request");
      }
      const paragraph = request.paragraph;
      if (/(?:\r\n|[\r\n])[ \t]*(?:\r\n|[\r\n])/u.test(paragraph)) return unavailable("multiple-paragraphs");
      const suppliedTerms = request.protectedTerms === undefined ? [] : request.protectedTerms;
      if (!Array.isArray(suppliedTerms) || suppliedTerms.length > MAX_PROTECTED_TERMS || suppliedTerms.some(function (term) {
        return typeof term !== "string" || !term.length;
      })) return unavailable("invalid-protected-terms");

      if (!runner || typeof runner.countTokens !== "function" || typeof runner.generate !== "function") {
        return unavailable("model-unavailable");
      }

      const payload = Object.freeze({
        instruction: INSTRUCTION,
        paragraph: paragraph,
        contextBefore: request.contextBefore || "",
        contextAfter: request.contextAfter || "",
        protectedTerms: Object.freeze(suppliedTerms.slice())
      });

      let inputTokens;
      try {
        inputTokens = await runner.countTokens(payload);
      } catch (_) {
        return unavailable("tokenization-failed");
      }
      if (!Number.isSafeInteger(inputTokens) || inputTokens < 0) return unavailable("malformed-token-count");
      if (inputTokens > maxInputTokens) return unavailable("input-too-long", inputTokens);

      let generated;
      try {
        generated = await runner.generate(Object.freeze(Object.assign({}, payload, { inputTokens: inputTokens })));
      } catch (_) {
        return unavailable("inference-failed", inputTokens);
      }
      if (!generated || typeof generated.text !== "string" || generated.truncated !== false || generated.finishReason === "length") {
        return unavailable("malformed-or-truncated-output", inputTokens);
      }

      const leading = /^[\t ]*/u.exec(paragraph)[0];
      const trailing = /[\t ]*$/u.exec(paragraph)[0];
      const candidateCore = generated.text.replace(/^[\t ]+|[\t ]+$/gu, "");
      if (!validText(candidateCore)) return unavailable("malformed-output", inputTokens);
      const replacement = leading + candidateCore + trailing;
      const maximumCharacters = paragraph.length * 4 + 256;
      if (replacement.length > maximumCharacters) return unavailable("output-too-long", inputTokens);
      if (/^(?:here(?: is|'s) (?:the )?(?:corrected|revised) paragraph|corrected paragraph)\s*:/iu.test(candidateCore)) {
        return unavailable("malformed-output", inputTokens);
      }
      if (!preserveStructure(paragraph, replacement, suppliedTerms)) return unavailable("unsafe-structure-change", inputTokens);
      if (replacement === paragraph) return noSuggestion("unchanged");
      return { status: "suggestion", original: paragraph, replacement: replacement, inputTokens: inputTokens };
    }

    async function suggestSentences(request) {
      if (!request || !validText(request.paragraph)) return unavailable("invalid-request");
      const paragraph = request.paragraph;
      if (/(?:\r\n|[\r\n])[ \t]*(?:\r\n|[\r\n])/u.test(paragraph)) return unavailable("multiple-paragraphs");
      const paragraphStart = request.start === undefined ? 0 : request.start;
      if (!Number.isSafeInteger(paragraphStart) || paragraphStart < 0) return unavailable("invalid-range");
      const allSegments = sentenceSegments(paragraph);
      const results = [];
      let unavailableCount = 0;
      for (let index = 0; index < allSegments.length; index += 1) {
        const segment = allSegments[index];
        const leading = /^[\t ]*/u.exec(segment.text)[0].length;
        const sentence = segment.text.trim();
        if (!sentence) continue;
        const localStart = segment.start + leading;
        const localEnd = localStart + sentence.length;
        const before = (request.contextBefore || "") + paragraph.slice(Math.max(0, localStart - MAX_CONTEXT_CHARACTERS), localStart);
        const after = paragraph.slice(localEnd, localEnd + MAX_CONTEXT_CHARACTERS) + (request.contextAfter || "");
        const result = await suggest({
          paragraph: sentence,
          contextBefore: before.slice(-MAX_CONTEXT_CHARACTERS),
          contextAfter: after.slice(0, MAX_CONTEXT_CHARACTERS),
          protectedTerms: request.protectedTerms
        });
        if (result.status === "suggestion") {
          const sentenceStart = paragraphStart + localStart;
          const sentenceEnd = paragraphStart + localEnd;
          results.push({
            type: "sentence",
            status: "suggestion",
            original: result.original,
            replacement: result.replacement,
            start: sentenceStart,
            end: sentenceEnd,
            inputTokens: result.inputTokens,
            wordSuggestions: singleWordChanges(result.original, result.replacement, sentenceStart)
          });
        } else if (result.status === "unavailable") {
          unavailableCount += 1;
        }
      }

      if (!results.length) {
        return unavailableCount ? { status: "unavailable", reason: "sentences-unavailable", unavailableSentenceCount: unavailableCount } : {
          status: "no-suggestion", reason: "unchanged", suggestions: []
        };
      }

      let combined = paragraph;
      for (const result of results.slice().sort(function (a, b) { return b.start - a.start; })) {
        const start = result.start - paragraphStart;
        const end = result.end - paragraphStart;
        combined = combined.slice(0, start) + result.replacement + combined.slice(end);
      }
      return {
        status: "suggestions",
        suggestions: results,
        paragraphSuggestion: {
          status: "suggestion",
          original: paragraph,
          replacement: combined,
          start: paragraphStart,
          end: paragraphStart + paragraph.length
        },
        unavailableSentenceCount: unavailableCount
      };
    }

    async function suggestSelection(request) {
      if (!request) return unavailable("invalid-request");
      const paragraph = validText(request.paragraph) ? request.paragraph : request.sentence;
      if (!validText(paragraph)) return unavailable("invalid-request");
      const paragraphStart = request.start === undefined
        ? (request.sentenceStart === undefined ? 0 : request.sentenceStart)
        : request.start;
      if (!Number.isSafeInteger(paragraphStart) || paragraphStart < 0) return unavailable("invalid-range");
      const paragraphEnd = paragraphStart + paragraph.length;
      const selectionStart = request.selectionStart === undefined ? paragraphStart : request.selectionStart;
      const selectionEnd = request.selectionEnd === undefined ? paragraphEnd : request.selectionEnd;
      if (!Number.isSafeInteger(selectionStart) || !Number.isSafeInteger(selectionEnd) || selectionStart < paragraphStart || selectionEnd <= selectionStart || selectionEnd > paragraphEnd) {
        return unavailable("invalid-selection");
      }

      const localSelectionStart = selectionStart - paragraphStart;
      const localSelectionEnd = selectionEnd - paragraphStart;
      const selectionText = paragraph.slice(localSelectionStart, localSelectionEnd);
      if (!validText(selectionText)) return unavailable("invalid-selection");
      const segments = sentenceSegments(paragraph);
      const selectedSegments = segments.filter(function (segment) {
        return segment.start < localSelectionEnd && segment.start + segment.text.length > localSelectionStart;
      });

      // A multi-sentence selection gets the same sentence-by-sentence treatment
      // as a paragraph review, with every returned range anchored to the note.
      if (selectedSegments.length > 1) {
        const result = await suggestSentences({
          paragraph: selectionText,
          start: selectionStart,
          contextBefore: request.contextBefore,
          contextAfter: request.contextAfter,
          protectedTerms: request.protectedTerms
        });
        if (result.status === "suggestions") return Object.assign({ scope: "selection" }, result);
        return result;
      }

      if (selectedSegments.length !== 1) return unavailable("invalid-selection");
      const segment = selectedSegments[0];
      const leading = /^[\t ]*/u.exec(segment.text)[0].length;
      const sentence = segment.text.trim();
      const sentenceStart = paragraphStart + segment.start + leading;
      const sentenceEnd = sentenceStart + sentence.length;
      const isWholeSentence = selectionStart <= sentenceStart && selectionEnd >= sentenceEnd;
      const selectedWord = wordTokens(selectionText.trim());
      const selectionIsSingleWord = selectedWord.length === 1 && selectionText.trim() === selectedWord[0].text;
      const result = await suggest({
        paragraph: sentence,
        contextBefore: request.contextBefore,
        contextAfter: request.contextAfter,
        protectedTerms: request.protectedTerms
      });
      if (result.status !== "suggestion") return result.status === "no-suggestion" ? Object.assign({ scope: "selection" }, result) : result;
      const sentenceSuggestion = {
        status: "suggestion",
        original: sentence,
        replacement: result.replacement,
        start: sentenceStart,
        end: sentenceEnd
      };
      const wordSuggestions = singleWordChanges(sentence, result.replacement, sentenceStart);
      const selectedWordSuggestions = wordSuggestions.filter(function (change) {
        return change.start >= selectionStart && change.end <= selectionEnd;
      });
      if (selectedWordSuggestions.length) {
        if (isWholeSentence || selectionIsSingleWord) {
          return {
            status: "suggestions",
            scope: "selection",
            suggestions: selectedWordSuggestions,
            sentenceSuggestion: sentenceSuggestion
          };
        }
        const fragmentReplacement = applyWordChangesToRange(selectionText, selectionStart, selectedWordSuggestions);
        if (fragmentReplacement && fragmentReplacement !== selectionText) {
          return {
            status: "suggestions",
            scope: "selection",
            suggestions: selectedWordSuggestions,
            fragmentSuggestion: {
              status: "suggestion",
              original: selectionText,
              replacement: fragmentReplacement,
              start: selectionStart,
              end: selectionEnd
            },
            sentenceSuggestion: sentenceSuggestion
          };
        }
      }
      return result.replacement !== sentence
        ? { status: "suggestion", scope: "sentence", suggestion: sentenceSuggestion, wordSuggestions: wordSuggestions }
        : { status: "no-suggestion", reason: "unchanged", scope: "selection" };
    }

    return Object.freeze({ suggest: suggest, suggestSentences: suggestSentences, suggestSelection: suggestSelection });
  }

  function applyAcceptedTextSuggestion(noteText, range, suggestion) {
    if (typeof noteText !== "string" || !range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)) return null;
    if (range.start < 0 || range.end <= range.start || range.end > noteText.length) return null;
    if (!suggestion || suggestion.status !== "suggestion" || typeof suggestion.original !== "string" || typeof suggestion.replacement !== "string") return null;
    if (noteText.slice(range.start, range.end) !== suggestion.original) return null;
    return noteText.slice(0, range.start) + suggestion.replacement + noteText.slice(range.end);
  }

  const applyAcceptedParagraphSuggestion = applyAcceptedTextSuggestion;

  return Object.freeze({
    createParagraphProofreader: createParagraphProofreader,
    applyAcceptedTextSuggestion: applyAcceptedTextSuggestion,
    applyAcceptedParagraphSuggestion: applyAcceptedParagraphSuggestion,
    instruction: INSTRUCTION
  });
});
