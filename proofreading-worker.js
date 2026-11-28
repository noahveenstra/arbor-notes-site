"use strict";

importScripts("./autocorrect.js?v=arb-109-context-autocorrect-20261123-a", "./proofreading.js?v=arb-219-capital-hint-20261128-a", "./vendor/spellcheck/nspell.js");

let dictionaryPromise = null;
let spellChecker = null;

async function loadDictionary() {
  if (!dictionaryPromise) {
    dictionaryPromise = Promise.all([
      fetch("./vendor/spellcheck/en.aff").then(function (response) {
        if (!response.ok) throw new Error("Could not load the local spelling rules.");
        return response.text();
      }),
      fetch("./vendor/spellcheck/en.dic").then(function (response) {
        if (!response.ok) throw new Error("Could not load the local English dictionary.");
        return response.text();
      })
    ]).then(function (files) {
      spellChecker = self.nspell(files[0], files[1]);
      return spellChecker;
    });
  }
  return dictionaryPromise;
}

self.onmessage = async function (event) {
  const request = event.data || {};
  if (request.type === "warm") {
    try { await loadDictionary(); }
    catch (error) { console.warn("Local spelling dictionary could not warm.", error); }
    return;
  }
  if (request.type !== "check" || !Number.isInteger(request.requestId) || !Array.isArray(request.blocks)) return;
  try {
    const checker = await loadDictionary();
    const results = request.blocks.map(function (block, index) {
      return self.ArborProofreading.scan(String(block || ""), checker, {
        checkGrammarSuggestions: request.checkGrammarSuggestions !== false,
        checkSentenceCapitalization: request.checkSentenceCapitalization === true,
        continuesSentence: Boolean(request.spellingContinuations && request.spellingContinuations[index])
      });
    });
    const autocorrection = request.autocorrect
      ? self.ArborAutocorrect.highConfidenceCorrection(request.autocorrect.word, request.autocorrect.before, checker, request.personalWords)
      : null;
    self.postMessage({ type: "result", requestId: request.requestId, recordName: request.recordName, results: results, autocorrection: autocorrection });
  } catch (error) {
    self.postMessage({ type: "error", requestId: request.requestId, recordName: request.recordName, message: String(error && error.message || error) });
  }
};
