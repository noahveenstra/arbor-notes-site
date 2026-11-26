// Local display name helpers. The name itself stays in this browser.
// CloudKit preference records do not have a field for it without a schema
// change. Each word is still added to the personal dictionary, and that
// dictionary syncs. Auto-added words are tracked here so a later name change
// can remove them without deleting a word the person added themselves.
(function attachArborDisplayName(root, factory) {
  const dictionary = root.ArborPersonalProofreadingDictionary
    || (typeof require === "function" ? require("./personal-dictionary.js") : null);
  if (!dictionary) return;
  const api = factory(dictionary);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborDisplayName = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArborDisplayName(dictionary) {

  function greetingPhrase(hour) {
    const value = Number(hour);
    if (value >= 5 && value < 12) return "Good morning";
    if (value >= 12 && value < 17) return "Good afternoon";
    return "Good evening";
  }

  function greetingText(name, date) {
    const moment = date instanceof Date ? date : new Date();
    const phrase = greetingPhrase(moment.getHours());
    const trimmed = String(name || "").trim();
    return trimmed ? phrase + ", " + trimmed : phrase;
  }

  function nameWords(name) {
    const seen = new Set();
    const words = [];
    String(name || "").normalize("NFC").split(/[\s\-–—.]+/u).forEach(function (part) {
      const token = part.replace(/^[^\p{L}]+|[^\p{L}'’]+$/gu, "");
      const normalized = dictionary.normalizeDictionaryEntry(token);
      if (!normalized || seen.has(normalized.key)) return;
      seen.add(normalized.key);
      words.push(normalized.term);
    });
    return words;
  }

  function activeTerms(entries) {
    const active = new Map();
    (Array.isArray(entries) ? entries : []).forEach(function (entry) {
      if (!entry || entry.isDeleted) return;
      const key = String(entry.normalizedTerm || "").toLowerCase();
      if (!key || active.has(key)) return;
      active.set(key, String(entry.term || ""));
    });
    return active;
  }

  function cleanLedger(ledger) {
    const source = ledger && typeof ledger === "object" && !Array.isArray(ledger) ? ledger : {};
    const next = {};
    Object.keys(source).forEach(function (key) {
      const item = source[key];
      const normalized = dictionary.normalizeDictionaryEntry(key);
      if (!normalized || !item || typeof item !== "object") return;
      const term = dictionary.normalizeDictionaryEntry(item.term || normalized.term);
      next[normalized.key] = {
        term: term ? term.term : normalized.term,
        suppressed: Boolean(item.suppressed)
      };
    });
    return next;
  }

  // additions are words to insert. removals are auto-added words the new
  // name no longer uses. A suppressed word was removed by the person and is
  // not put back while this name still contains it. A word already in the
  // dictionary and absent from the ledger was added manually and is left alone.
  function planNameDictionary(entries, ledger, name) {
    const active = activeTerms(entries);
    const previous = cleanLedger(ledger);
    const desired = new Map();
    nameWords(name).forEach(function (word) {
      const normalized = dictionary.normalizeDictionaryEntry(word);
      if (!normalized || desired.has(normalized.key)) return;
      desired.set(normalized.key, normalized.term);
    });
    const next = {};
    const additions = [];
    const removals = [];

    desired.forEach(function (term, key) {
      const prior = previous[key];
      if (prior && prior.suppressed) {
        next[key] = { term: prior.term, suppressed: true };
        return;
      }
      if (active.has(key)) {
        if (prior) next[key] = { term: prior.term || active.get(key), suppressed: false };
        return;
      }
      additions.push(term);
      next[key] = { term: term, suppressed: false };
    });

    Object.keys(previous).forEach(function (key) {
      if (desired.has(key)) return;
      const prior = previous[key];
      if (!prior || prior.suppressed || !active.has(key)) return;
      removals.push(prior.term || active.get(key));
    });

    return { ledger: next, additions: additions, removals: removals };
  }

  return Object.freeze({
    greetingPhrase: greetingPhrase,
    greetingText: greetingText,
    nameWords: nameWords,
    planNameDictionary: planNameDictionary
  });
});
