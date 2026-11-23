(function attachArborProofreading(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborProofreading = api;
})(globalThis, function createArborProofreading() {
  const WORD_RE = /[\p{L}]+(?:['’][\p{L}]+)*/gu;
  const VOWEL_SOUND_EXCEPTIONS = new Set(["hour", "honest", "honor", "heir", "honour"]);
  const CONSONANT_SOUND_EXCEPTIONS = new Set(["unicorn", "university", "universal", "unit", "union", "user", "usual", "useful", "european", "euro", "eulogy", "one", "once"]);

  function caseLike(source, value) {
    if (source === source.toUpperCase()) return value.toUpperCase();
    if (source[0] === source[0].toUpperCase()) return value[0].toUpperCase() + value.slice(1);
    return value;
  }

  function issue(start, end, kind, word, options, message) {
    const unique = [];
    (options || []).forEach(function (item) {
      const option = typeof item === "string" ? { label: item, replacement: item } : item;
      if (option && typeof option.label === "string" && option.label.trim() && !unique.some(function (existing) { return existing.label === option.label; })) unique.push(option);
    });
    if (!unique.length) return null;
    return { start: start, end: end, kind: kind, word: word, options: unique.slice(0, 4), message: message };
  }

  function expectedArticle(nextWord) {
    const word = String(nextWord || "").toLowerCase();
    if (!word) return "a";
    if (VOWEL_SOUND_EXCEPTIONS.has(word)) return "an";
    if (CONSONANT_SOUND_EXCEPTIONS.has(word)) return "a";
    return /^[aeiou]/.test(word) ? "an" : "a";
  }

  function grammarIssues(text, options) {
    const result = [];
    let match;
    if (!options || options.checkGrammarSuggestions !== false) {
      const repeated = /\b([\p{L}]+)\s+\1\b/giu;
      while ((match = repeated.exec(text))) {
        const secondStart = match.index + match[0].lastIndexOf(match[1]);
        result.push(issue(secondStart, secondStart + match[1].length, "grammar", match[1], [{ label: "Remove duplicate", action: "remove-duplicate" }], "Repeated word"));
      }

      const articles = /\b(a|an)\s+([\p{L}]+)\b/giu;
      while ((match = articles.exec(text))) {
        const expected = expectedArticle(match[2]);
        if (match[1].toLowerCase() !== expected) {
          result.push(issue(match.index, match.index + match[1].length, "grammar", match[1], [caseLike(match[1], expected)], "Article"));
        }
      }

      const agreement = [
        [/\b(I)\s+(is)\b/giu, "am"],
        [/\b(you|we|they)\s+(is|was)\b/giu, null],
        [/\b(he|she|it)\s+(are)\b/giu, "is"]
      ];
      agreement.forEach(function (entry) {
        const pattern = entry[0];
        while ((match = pattern.exec(text))) {
          const subject = match[1].toLowerCase();
          const verb = match[2].toLowerCase();
          let suggestion = entry[1];
          if (subject !== "i" && subject !== "he" && subject !== "she" && subject !== "it") {
            suggestion = verb === "is" ? "are" : "were";
          }
          const start = match.index + match[0].lastIndexOf(match[2]);
          result.push(issue(start, start + match[2].length, "grammar", match[2], [caseLike(match[2], suggestion)], "Subject–verb agreement"));
        }
      });
    }

    if (!options || options.checkSentenceCapitalization !== false) {
      const sentenceStart = /(^|[\r\n]|[.!?]\s+)\s*([\p{L}][\p{L}'’]*)/gu;
      while ((match = sentenceStart.exec(text))) {
        const word = match[2];
        if (word[0] !== word[0].toLowerCase() || word.toLowerCase() === "i") continue;
        const start = match.index + match[0].length - word.length;
        const suggestion = word[0].toUpperCase() + word.slice(1);
        result.push(issue(start, start + 1, "capitalization", word, [{
          label: "Click to capitalize",
          replacement: word[0].toUpperCase()
        }], "Capitalization suggestion"));
      }
    }

    if (!options || options.checkGrammarSuggestions !== false) {
      const firstPerson = /\bi\b/g;
      while ((match = firstPerson.exec(text))) {
        result.push(issue(match.index, match.index + 1, "grammar", match[0], ["I"], "Capitalize the pronoun I"));
      }
    }
    return result.filter(Boolean);
  }

  function spellingIssues(text, spell) {
    if (!spell || typeof spell.correct !== "function" || typeof spell.suggest !== "function") return [];
    const result = [];
    let match;
    WORD_RE.lastIndex = 0;
    while ((match = WORD_RE.exec(text))) {
      const word = match[0];
      if (word.length < 2 || /\p{Lu}/u.test(word.slice(1)) || word === word.toUpperCase()) continue;
      const missingContraction = word.toLocaleLowerCase() === "im";
      if (!missingContraction && (spell.correct(word) || spell.correct(word.toLowerCase()))) continue;
      const suggestions = missingContraction ? ["I'm"] : spell.suggest(word);
      const candidates = (suggestions.length ? suggestions : spell.suggest(word.toLowerCase())).slice(0, 4).map(function (candidate) {
        const value = caseLike(word, candidate);
        return { label: value, replacement: value };
      });
      const item = issue(match.index, match.index + word.length, "spelling", word, candidates, "Possible spelling mistake");
      if (item) result.push(item);
    }
    return result;
  }

  function normalizedSpellingWord(value) {
    if (typeof value !== "string") return null;
    const word = value.normalize("NFC").trim();
    if (!/^[\p{L}]+(?:['’][\p{L}]+)*$/u.test(word)) return null;
    return word.toLocaleLowerCase();
  }

  function promoteSpellingCandidate(options, originalWord, suggestedWord) {
    const candidates = Array.isArray(options) ? options.slice() : [];
    const original = normalizedSpellingWord(originalWord);
    const suggested = normalizedSpellingWord(suggestedWord);
    if (!original || !suggested || original === suggested) return candidates;
    const index = candidates.findIndex(function (option) {
      if (!option || typeof option !== "object" || option.action) return false;
      const candidate = normalizedSpellingWord(option.replacement || option.label);
      return candidate === suggested;
    });
    if (index <= 0) return candidates;
    return [candidates[index]].concat(candidates.slice(0, index), candidates.slice(index + 1));
  }

  function scan(text, spell, options) {
    const source = String(text || "");
    const grammar = grammarIssues(source, options || {});
    const grammarRanges = grammar.map(function (item) { return [item.start, item.end]; });
    const spelling = spellingIssues(source, spell).filter(function (item) {
      return !grammarRanges.some(function (range) { return item.start < range[1] && item.end > range[0]; });
    });
    const order = { capitalization: 0, grammar: 1, spelling: 2 };
    return grammar.concat(spelling).sort(function (left, right) {
      return left.start - right.start || (order[left.kind] || 0) - (order[right.kind] || 0);
    });
  }

  return Object.freeze({ scan: scan, promoteSpellingCandidate: promoteSpellingCandidate });
});
