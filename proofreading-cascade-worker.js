import { assembleCascade } from "./proofreading-cascade.mjs";
import { CONFIDENCE_THRESHOLD, confidentEdits } from "./proofreading-spans.mjs";
import { builtinLexicon, lexiconFromDic } from "./proofreading-lexicon.mjs";

const latest = new Map();
let ruleChain = Promise.resolve();
let modelChain = Promise.resolve();
let skipModels = false;
let harperPromise;
let gecPromise;
let gectorPromise;
let lexiconPromise;

function loadLexicon() {
  if (!lexiconPromise) {
    lexiconPromise = fetch(new URL("./vendor/spellcheck/en.dic", import.meta.url)).then(function (response) {
      if (!response.ok) throw new Error("dictionary-unavailable");
      return response.text();
    }).then(lexiconFromDic).catch(function () {
      return builtinLexicon;
    });
  }
  return lexiconPromise;
}

function post(message) {
  self.postMessage(message);
}

function isLatest(message) {
  return latest.get(message.key) === message.requestId;
}

function loadHarper() {
  if (!harperPromise) {
    harperPromise = (async function () {
      const imported = await Promise.all([
        import("./vendor/harper/index.js"),
        import("./vendor/harper/binary.js")
      ]);
      const linter = new imported[0].LocalLinter({
        binary: imported[1].binary,
        dialect: imported[0].Dialect.American
      });
      await linter.setup();
      return linter;
    })().catch(function (error) {
      harperPromise = undefined;
      throw error;
    });
  }
  return harperPromise;
}

async function harperSpans(text) {
  const linter = await loadHarper();
  const lints = await linter.lint(text, { language: "markdown" });
  const spans = [];
  (lints || []).forEach(function (lint) {
    const span = lint.span();
    const suggestions = lint.suggestions() || [];
    const replacement = suggestions.length ? suggestions[0].get_replacement_text() : null;
    const start = Number(span.start);
    const end = Number(span.end);
    if (Number.isInteger(start) && Number.isInteger(end) && end > start) {
      let lintKind = "";
      try {
        if (typeof lint.lint_kind === "function") lintKind = String(lint.lint_kind() || "");
      } catch (_) { lintKind = ""; }
      const transformClass = lintKind ? "harper:" + lintKind : "harper";
      spans.push({
        start: start,
        end: end,
        replacement: suggestions.length ? replacement : null,
        detectOnly: suggestions.length === 0,
        kind: "grammar",
        ruleId: transformClass,
        transformClass: transformClass,
        patternText: text.slice(start, end),
        message: lint.message() || "Grammar suggestion"
      });
    }
    suggestions.forEach(function (suggestion) { if (suggestion.free) suggestion.free(); });
    if (span.free) span.free();
    if (lint.free) lint.free();
  });
  return spans;
}

async function gecSpans(text, onProgress) {
  if (!gecPromise) {
    gecPromise = import("./paragraph-proofreading-model.js").then(function (model) {
      return {
        maxTokens: model.MAX_INPUT_TOKENS,
        runner: model.createLocalProofreadingRunner({ onProgress: onProgress })
      };
    });
  }
  const loaded = await gecPromise;
  const count = await loaded.runner.countTokens({ paragraph: text });
  if (!Number.isSafeInteger(count) || count > loaded.maxTokens) return [];
  const generated = await loaded.runner.generate({ paragraph: text, withConfidence: true, inputTokens: count });
  return confidentEdits(text, generated && generated.pieces, CONFIDENCE_THRESHOLD);
}

async function gectorSpans(text, onProgress, options) {
  if (!gectorPromise) {
    gectorPromise = import("./gector-model.js").then(function (model) {
      return model.loadGector({ onProgress: onProgress });
    });
  }
  const loaded = await gectorPromise;
  return loaded.correct(text, { acceptBoosts: options && options.acceptBoosts || {} });
}

function progress(phase, detail) {
  post(Object.assign({ type: "cascade-progress", phase: phase }, detail || {}));
}

async function runModels(message, options) {
  if (!isLatest(message)) return;
  const onProgress = function (update) {
    if (!isLatest(message)) return;
    progress(update && update.phase || "model", update || {});
  };
  let gec = [];
  let gector = [];
  let harper = [];
  try {
    // Automated browsers ask the page to skip the large ONNX downloads.
    // Rules and Harper still run, which is what the browser checks cover.
    const results = await Promise.all([
      skipModels ? Promise.resolve([]) : gecSpans(message.text, onProgress).catch(function () { return []; }),
      skipModels ? Promise.resolve([]) : gectorSpans(message.text, onProgress, options).catch(function () { return []; }),
      harperSpans(message.text).catch(function () { return []; })
    ]);
    gec = results[0];
    gector = results[1];
    harper = results[2];
  } catch (_) {
    gec = [];
    gector = [];
    harper = [];
  }
  if (!isLatest(message)) return;
  post({
    type: "cascade-final",
    requestId: message.requestId,
    key: message.key,
    text: message.text,
    spans: assembleCascade(message.text, Object.assign({}, options, { gec: gec, harper: harper, gector: gector }))
  });
}

function postPartial(message, text, spans) {
  post({
    type: "cascade-partial",
    requestId: message.requestId,
    key: message.key,
    text: text,
    spans: spans
  });
}

async function finishSentence(message, options) {
  let harper = [];
  try { harper = await harperSpans(message.text); }
  catch (_) { harper = []; }
  if (!isLatest(message)) return;
  postPartial(message, message.text, assembleCascade(message.text, Object.assign({}, options, { harper: harper })));
  modelChain = modelChain.then(function () { return runModels(message, options); }).catch(function () {});
}

self.onmessage = function (event) {
  const message = event.data || {};
  if (message.skipModels === true) skipModels = true;
  if (message.type === "warm") {
    loadHarper().catch(function () {});
    loadLexicon().catch(function () {});
    return;
  }
  if (message.type !== "check-sentence" || !Number.isInteger(message.requestId) || typeof message.key !== "string") return;
  latest.set(message.key, message.requestId);
  const text = String(message.text || "");
  const options = {
    protectedTerms: Array.isArray(message.protectedTerms) ? message.protectedTerms : [],
    displayName: String(message.displayName || ""),
    allowCapitalization: message.allowCapitalization === true
  };
  const boosts = message.acceptBoosts && typeof message.acceptBoosts === "object" ? message.acceptBoosts : {};
  options.acceptBoosts = boosts;
  ruleChain = ruleChain.then(async function () {
    options.lexicon = await loadLexicon();
    if (!isLatest(message)) return;
    postPartial(message, text, assembleCascade(text, options));
    return finishSentence(message, options);
  }).catch(function (error) {
    if (!isLatest(message)) return;
    post({
      type: "cascade-final",
      requestId: message.requestId,
      key: message.key,
      text: text,
      spans: assembleCascade(text, Object.assign({}, options, { lexicon: builtinLexicon })),
      error: String(error && error.message || error)
    });
  });
};
