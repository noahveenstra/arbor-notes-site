import "./paragraph-proofreader.js?v=arb-115-selection-review-20261120-b";
import { MAX_INPUT_TOKENS, createLocalProofreadingRunner } from "./paragraph-proofreading-model.js";

const proofreader = globalThis.ArborParagraphProofreader.createParagraphProofreader({
  localRunner: createLocalProofreadingRunner({
    onProgress: function (progress) {
      if (currentRequestId === null) return;
      const type = currentRequestType === "spelling-context-rank" ? "spelling-context-rank-progress"
        : currentRequestType === "capitalization-scan" ? "capitalization-scan-progress"
          : "suggestion-review-progress";
      self.postMessage({ type: type, requestId: currentRequestId, progress: progress });
    }
  }),
  maxInputTokens: MAX_INPUT_TOKENS
});

let currentRequestId = null;
let currentRequestType = null;
let requestQueue = Promise.resolve();

async function handleRequest(message) {
  if (!message || !Number.isSafeInteger(message.requestId)) return;
  const isSpellingRank = message.type === "spelling-context-rank";
  const isCapitalizationScan = message.type === "capitalization-scan";
  if (!isSpellingRank && !isCapitalizationScan && message.type !== "suggestion-review") return;
  const method = isSpellingRank ? "suggestSelection" : isCapitalizationScan ? "suggestSentences" : message.method;
  if (!isSpellingRank && !isCapitalizationScan && method !== "suggestSelection" && method !== "suggestSentences") {
    self.postMessage({
      type: "suggestion-review-result",
      requestId: message.requestId,
      result: { status: "unavailable", reason: "unsupported-method" }
    });
    return;
  }
  currentRequestId = message.requestId;
  currentRequestType = message.type;
  try {
    const result = await proofreader[method](message.payload);
    self.postMessage({
      type: isSpellingRank ? "spelling-context-rank-result"
        : isCapitalizationScan ? "capitalization-scan-result" : "suggestion-review-result",
      requestId: message.requestId,
      result: result
    });
  } catch (_) {
    self.postMessage({
      type: isSpellingRank ? "spelling-context-rank-result"
        : isCapitalizationScan ? "capitalization-scan-result" : "suggestion-review-result",
      requestId: message.requestId,
      result: { status: "unavailable", reason: "local-model-unavailable" }
    });
  } finally {
    currentRequestId = null;
    currentRequestType = null;
  }
}

self.addEventListener("message", function (event) {
  const message = event.data;
  requestQueue = requestQueue.then(function () { return handleRequest(message); }).catch(function () {});
});
