import { contractionSpans } from "./proofreading-contractions.mjs";
import { fragmentSpan } from "./proofreading-fragments.mjs";
import { CONFIDENCE_THRESHOLD, confidentEdits, guardSpans, mergeCascade, protectedRanges } from "./proofreading-spans.mjs";

const latest = new Map();
let ruleChain = Promise.resolve();
let modelChain = Promise.resolve();
let skipModels = false;
let harperPromise;
let gecPromise;
let gectorPromise;

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
      spans.push({
        start: start,
        end: end,
        replacement: suggestions.length ? replacement : null,
        detectOnly: suggestions.length === 0,
        kind: "grammar",
        message: lint.message() || "Grammar suggestion"
      });
    }
    suggestions.forEach(function (suggestion) { if (suggestion.free) suggestion.free(); });
    if (span.free) span.free();
    if (lint.free) lint.free();
  });
  return spans;
}

function ruleSpans(text, options, ranges) {
  const contractions = contractionSpans(text, ranges);
  const fragment = fragmentSpan(text);
  const fragments = fragment ? guardSpans(text, [fragment], options) : [];
  return { contractions: contractions, fragments: fragments };
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

async function gectorSpans(text, onProgress) {
  if (!gectorPromise) {
    gectorPromise = import("./gector-model.js").then(function (model) {
      return model.loadGector({ onProgress: onProgress });
    });
  }
  const loaded = await gectorPromise;
  return loaded.correct(text);
}

function progress(phase, detail) {
  post(Object.assign({ type: "cascade-progress", phase: phase }, detail || {}));
}

async function runModels(message, options, rules) {
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
      skipModels ? Promise.resolve([]) : gectorSpans(message.text, onProgress).catch(function () { return []; }),
      harperSpans(message.text).catch(function () { return []; })
    ]);
    gec = guardSpans(message.text, results[0], options);
    gector = guardSpans(message.text, results[1], options);
    harper = guardSpans(message.text, results[2], options);
  } catch (_) {
    gec = [];
    gector = [];
  }
  if (!isLatest(message)) return;
  post({
    type: "cascade-final",
    requestId: message.requestId,
    key: message.key,
    text: message.text,
    spans: mergeCascade([gec, harper, gector, rules.contractions, rules.fragments])
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

async function finishSentence(message, options, rules) {
  let harper = [];
  try { harper = guardSpans(message.text, await harperSpans(message.text), options); }
  catch (_) { harper = []; }
  if (!isLatest(message)) return;
  postPartial(message, message.text, mergeCascade([harper, rules.contractions, rules.fragments]));
  modelChain = modelChain.then(function () { return runModels(message, options, rules); }).catch(function () {});
}

self.onmessage = function (event) {
  const message = event.data || {};
  if (message.skipModels === true) skipModels = true;
  if (message.type === "warm") {
    loadHarper().catch(function () {});
    return;
  }
  if (message.type !== "check-sentence" || !Number.isInteger(message.requestId) || typeof message.key !== "string") return;
  latest.set(message.key, message.requestId);
  const text = String(message.text || "");
  const options = {
    protectedTerms: Array.isArray(message.protectedTerms) ? message.protectedTerms : [],
    displayName: String(message.displayName || "")
  };
  const rules = ruleSpans(text, options, protectedRanges(text, options));
  postPartial(message, text, mergeCascade([rules.contractions, rules.fragments]));
  ruleChain = ruleChain.then(function () { return finishSentence(message, options, rules); }).catch(function (error) {
    if (!isLatest(message)) return;
    post({
      type: "cascade-final",
      requestId: message.requestId,
      key: message.key,
      text: text,
      spans: mergeCascade([rules.contractions, rules.fragments]),
      error: String(error && error.message || error)
    });
  });
};
