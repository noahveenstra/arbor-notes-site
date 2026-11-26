import { weightFiles } from "./gector-weights.mjs";
import { onnxruntime as ort } from "./vendor/transformers/transformers.min.js";
import { correctText, verbsFromLines, vocabFromLines } from "./gector-decoder.mjs";

export const MODEL_ID = "proofbird/gector-bert-en";
export const MODEL_REVISION = "107219645ad50dc859a4b55d73bf9e0c7bb2773f";
export const LOCAL_MODEL_ID = "gector-bert-en@" + MODEL_REVISION;

// The published Proofbird file is FP32. This copy is per-channel INT8 for
// MatMul and Gemm, with per-channel INT8 word embeddings and a DequantizeLinear
// before Gather. Each external weight file is served in two integrity-checked parts.
// sha256 values are the bytes served from this origin. An empty hash fails closed.
export const FILE_HASHES = Object.freeze({
  "config.json": "4d9c202b274e63a583bdb0911f36e59efdbe3ac46ac3b6508eb174221f37b9e7",
  "gector-meta.json": "e8e1882ea6616f4badd3556c74c587894b4e18a3aceea8463ca2e3bddb8c852a",
  "language-rules.json": "11e0c0a7501db23e1a67193236cc377b57a883693fabe5e6d3fa85a996b95228",
  "vocab.txt": "eeaa9875b23b04b4c54ef759d03db9d1ba1554838f8fb26c5d96fa551df93d02",
  "verb-form-vocab.txt": "5906804ec8a1acd8cbfc2918522bf429ce5edded8bbc46ffc2be861d280d3abf",
  "model.onnx": "ee2ba6c47aadc30eac7d986d101fc204c887d8695dadd8b1331bdbdd86a7014a",
  "weights-0-part-0.bin": "50dff2587424103bdb3750ffe547e5ba314cea8f6800d44447a5275353ac9122",
  "weights-0-part-1.bin": "2c8b9d82c7e25d7c4ab9f85a2f9f191f75e05c4c57a9c1baca6a8939a40c140b",
  "weights-1-part-0.bin": "378788fa4380dab6fb266b5fa730a6ff42c37659d1dbe57043c0bb40b97214a5",
  "weights-1-part-1.bin": "c89e5bdac0d2dd803134cbeff473698fb6bfc820386e540d055cc7c4578b06c9"
});

const MODEL_ROOT = new URL("./models/" + LOCAL_MODEL_ID + "/", import.meta.url);
const wasmRoot = new URL("./vendor/ort/", import.meta.url);
const wasmPaths = {
  mjs: new URL("ort-wasm-simd-threaded.mjs", wasmRoot).href,
  wasm: new URL("ort-wasm-simd-threaded.wasm", wasmRoot).href
};
ort.env.wasm.wasmPaths = wasmPaths;
ort.env.wasm.numThreads = 1;

let sessionPromise;

function bytesToHex(bytes) {
  return Array.from(bytes, function (value) { return value.toString(16).padStart(2, "0"); }).join("");
}

async function sha256(bytes) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error("integrity-verification-unavailable");
  return bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)));
}

async function readResponse(response, onProgress, file) {
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body && response.body.getReader ? response.body.getReader() : null;
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (onProgress) onProgress({ phase: "download", file: file, loaded: bytes.length, total: bytes.length });
    return bytes;
  }
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const item = await reader.read();
    if (item.done) break;
    chunks.push(item.value);
    loaded += item.value.length;
    if (onProgress) onProgress({ phase: "download", file: file, loaded: loaded, total: total || 0 });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  chunks.forEach(function (chunk) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  return bytes;
}

async function fetchVerified(file, onProgress) {
  const expected = FILE_HASHES[file];
  if (!expected) throw new Error("unrecognized-model-asset");
  const url = new URL(file, MODEL_ROOT);
  if (url.origin !== globalThis.location.origin) throw new Error("model-asset-origin-mismatch");
  const response = await fetch(url, { method: "GET", credentials: "same-origin", redirect: "error" });
  if (!response.ok || response.status !== 200) throw new Error("model-asset-unavailable");
  const bytes = await readResponse(response, onProgress, file);
  const digest = await sha256(bytes);
  if (digest !== expected) throw new Error("model-integrity-mismatch");
  return bytes;
}

function textOf(bytes) {
  return new TextDecoder().decode(bytes);
}

async function loadResources(onProgress) {
  const config = JSON.parse(textOf(await fetchVerified("config.json", onProgress)));
  const meta = JSON.parse(textOf(await fetchVerified("gector-meta.json", onProgress)));
  const rules = JSON.parse(textOf(await fetchVerified("language-rules.json", onProgress)));
  const labels = [];
  const count = Object.keys(config.id2label || {}).length;
  for (let index = 0; index < count; index += 1) labels.push(config.id2label[String(index)]);
  const incorrectLabel = config.incorrect_label || "$INCORRECT";
  const incorrectIndex = Number(Object.keys(config.d_id2label || {}).find(function (key) {
    return config.d_id2label[key] === incorrectLabel;
  }));
  const defaults = meta.defaults || config.defaults || {};
  return {
    labels: labels,
    keepIndex: labels.indexOf(config.keep_label || "$KEEP"),
    incorrectIndex: incorrectIndex,
    detectCount: 2,
    minErrorProb: Number(defaults.min_error_prob == null ? 0.7 : defaults.min_error_prob),
    keepConfidence: Number(defaults.keep_confidence || 0),
    stripTrailingTerminator: rules.stripTrailingTerminator !== false,
    stripTerminators: ".!?",
    maxPasses: Number(defaults.n_iteration || 5),
    vocab: vocabFromLines(textOf(await fetchVerified("vocab.txt", onProgress))),
    verbs: verbsFromLines(textOf(await fetchVerified("verb-form-vocab.txt", onProgress)))
  };
}

async function loadSession(onProgress) {
  const model = await fetchVerified("model.onnx", onProgress);
  const external = [];
  for (const weight of weightFiles) {
    const data = new Uint8Array(weight.size);
    let offset = 0;
    for (const part of weight.parts) {
      const bytes = await fetchVerified(part, onProgress);
      data.set(bytes, offset);
      offset += bytes.length;
    }
    if (offset !== data.length) throw new Error("invalid-model-weight-size");
    external.push({ path: weight.path, data });
  }
  onProgress({ phase: "model", file: "model.onnx", loaded: 1, total: 1 });
  return ort.InferenceSession.create(model, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
    executionMode: "sequential",
    externalData: external
  });
}

export function loadGector(options) {
  const onProgress = options && typeof options.onProgress === "function" ? options.onProgress : function () {};
  if (!sessionPromise) {
    sessionPromise = (async function () {
      const resources = await loadResources(onProgress);
      const session = await loadSession(onProgress);
      return {
        correct: function (text, runOptions) {
          const boosts = runOptions && runOptions.acceptBoosts;
          const model = boosts ? Object.assign({}, resources, { acceptBoosts: boosts }) : resources;
          return correctText(text, model, async function (ids) {
            const input = new ort.Tensor("int64", BigInt64Array.from(ids, function (value) { return BigInt(value); }), [1, ids.length]);
            const mask = new ort.Tensor("int64", BigInt64Array.from(ids, function () { return 1n; }), [1, ids.length]);
            let output;
            try {
              output = await session.run({ input_ids: input, attention_mask: mask });
            } finally {
              input.dispose();
              mask.dispose();
            }
            const labels = output.logits_labels;
            const detect = output.logits_d;
            if (!labels || !detect) throw new Error("invalid-gector-output");
            const logitsLabels = Float32Array.from(labels.data);
            const logitsD = Float32Array.from(detect.data);
            if (labels.dispose) labels.dispose();
            if (detect.dispose) detect.dispose();
            return { logitsLabels: logitsLabels, logitsD: logitsD };
          });
        }
      };
    })().catch(function (error) {
      sessionPromise = undefined;
      throw error;
    });
  }
  return sessionPromise;
}
