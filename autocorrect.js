(function attachArborAutocorrect(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborAutocorrect = api;
})(globalThis, function createArborAutocorrect() {
  const SUBJECTS = /\b(?:i|you|we|they|he|she|it)\s+$/iu;
  const CONTRACTIONS = Object.freeze({
    im: "I'm",
    imm: "I'm",
    dont: "don't",
    doesnt: "doesn't",
    didnt: "didn't",
    isnt: "isn't",
    arent: "aren't",
    wasnt: "wasn't",
    werent: "weren't",
    couldnt: "couldn't",
    shouldnt: "shouldn't",
    wouldnt: "wouldn't",
    mustnt: "mustn't"
  });
  const CONTEXTUAL_CORRECTIONS = Object.freeze({
    cant: "can't",
    wont: "won't",
    maen: "mean"
  });
  const COMMON_TYPO_CORRECTIONS = Object.freeze({
    adn: "and",
    recieve: "receive",
    definately: "definitely",
    taht: "that",
    seperate: "separate",
    wierd: "weird",
    thier: "their",
    thsi: "this",
    waht: "what",
    adress: "address",
    teh: "the"
  });
  function normalized(value) {
    return String(value || "").normalize("NFC").toLocaleLowerCase();
  }

  function isAdjacentTransposition(leftValue, rightValue) {
    const left = Array.from(normalized(leftValue));
    const right = Array.from(normalized(rightValue));
    if (left.length !== right.length) return false;
    const changed = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) changed.push(index);
    }
    return changed.length === 2 && changed[1] === changed[0] + 1 &&
      left[changed[0]] === right[changed[1]] && left[changed[1]] === right[changed[0]];
  }

  function distanceAtMostOne(leftValue, rightValue) {
    const left = Array.from(normalized(leftValue));
    const right = Array.from(normalized(rightValue));
    if (left.length === right.length) {
      const changed = [];
      for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) changed.push(index);
      }
      if (changed.length <= 1) return true;
      return changed.length === 2 && changed[1] === changed[0] + 1 &&
        left[changed[0]] === right[changed[1]] && left[changed[1]] === right[changed[0]];
    }
    if (Math.abs(left.length - right.length) !== 1) return false;
    const shorter = left.length < right.length ? left : right;
    const longer = left.length < right.length ? right : left;
    let shortIndex = 0;
    let longIndex = 0;
    let skipped = false;
    while (shortIndex < shorter.length && longIndex < longer.length) {
      if (shorter[shortIndex] === longer[longIndex]) {
        shortIndex += 1;
        longIndex += 1;
      } else if (skipped) return false;
      else {
        skipped = true;
        longIndex += 1;
      }
    }
    return true;
  }

  function isPersonalWord(word, personalWords) {
    const target = normalized(word);
    return Array.isArray(personalWords) && personalWords.some(function (entry) {
      return normalized(typeof entry === "string" ? entry : entry && (entry.term || entry.word)) === target;
    });
  }

  function highConfidenceCorrection(wordValue, contextBefore, spell, personalWords) {
    const word = String(wordValue || "");
    const lower = normalized(word);
    const before = String(contextBefore || "");
    if (!spell || typeof spell.correct !== "function" || typeof spell.suggest !== "function") return null;
    if (!/^[\p{L}]+(?:['’][\p{L}]+)*$/u.test(word) || word.length < 2) return null;
    if (/\p{Lu}/u.test(word) || isPersonalWord(word, personalWords)) return null;

    let replacement = null;
    let rule = "";
    if (Object.prototype.hasOwnProperty.call(CONTRACTIONS, lower)) {
      replacement = CONTRACTIONS[lower];
      rule = "common-contraction";
    } else if (Object.prototype.hasOwnProperty.call(CONTEXTUAL_CORRECTIONS, lower) && SUBJECTS.test(before)) {
      replacement = CONTEXTUAL_CORRECTIONS[lower];
      rule = lower === "maen" ? "subject-context" : "contextual-contraction";
    } else if (Object.prototype.hasOwnProperty.call(COMMON_TYPO_CORRECTIONS, lower)) {
      replacement = COMMON_TYPO_CORRECTIONS[lower];
      rule = "common-typo";
    } else if (Array.from(lower).length >= 5 && !spell.correct(word) && !spell.correct(lower)) {
      const closeCandidates = spell.suggest(word).filter(function (candidate) {
        return candidate === candidate.toLocaleLowerCase() && spell.correct(candidate) && distanceAtMostOne(word, candidate);
      });
      const uniqueCandidates = Array.from(new Set(closeCandidates.map(normalized)));
      const transpositionCandidates = uniqueCandidates.filter(function (candidate) {
        return isAdjacentTransposition(word, candidate);
      });
      if (transpositionCandidates.length === 1) {
        replacement = transpositionCandidates[0];
        rule = "unique-transposition";
      } else if (transpositionCandidates.length === 0 && uniqueCandidates.length === 1) {
        replacement = uniqueCandidates[0];
        rule = "unique-single-edit";
      }
    }

    if (!replacement || normalized(replacement) === lower || !spell.correct(replacement)) return null;
    return { original: word, replacement: replacement, rule: rule };
  }

  return Object.freeze({ highConfidenceCorrection: highConfidenceCorrection });
});
