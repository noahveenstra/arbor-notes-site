import { AutoTokenizer, env, onnxruntime as ort } from "./vendor/transformers/transformers.min.js";

export const MODEL_ID = "Unbabel/gec-t5_small";
export const MODEL_REVISION = "c958d53bfbce19c87342b69fc6bcaba7303d076f";
export const ONNX_EXPORT_ID = "JonaWhisper/jonawhisper-gec-t5-small-onnx";
export const ONNX_EXPORT_REVISION = "240e0e34d7638690212367d9ecfcd501c9327cc9";
export const LOCAL_MODEL_ID = "gec-t5-small@" + ONNX_EXPORT_REVISION;
export const MAX_INPUT_TOKENS = 128;
export const MAX_OUTPUT_TOKENS = 128;
export const FIRST_USE_MODEL_BYTES = 96414833;

const MODEL_ROOT = new URL("./models/" + LOCAL_MODEL_ID + "/", import.meta.url);
const FILE_HASHES = Object.freeze({
  "config.json": "1a759ab83fa77f0e59a81380883bfc895c646191e16c745c904fa91000f5a4d0",
  "tokenizer.json": "5a1e6d0393c72d2c17483eddef327a7090c9a51989f8f2ebc52d5322dcbcacac",
  "tokenizer_config.json": "ca2f975f9be9ebaee8a4952487f34c91e824ccf67b24eb2cc45f656e3ba7804c",
  "special_tokens_map.json": "7a1985a994c41886db38c719d2a3d2f40606663cc19d7c5d6a85d349320e06d2",
  "encoder_model_int8.onnx": "9f3b2457334d0a2a90132ec786924abe1a3082f00164246be8c4578871d5433c",
  "decoder_model_int8.onnx": "7c5823a6c3a05c88fb350f6133d6101ca664bcfec8642b07a29a9a3dd4bb5450"
});
const TOKENIZER_FILES = new Set(["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"]);

let tokenizerPromise;
let sessionsPromise;
const verifiedFiles = new Set();
const verifiedAssetBytes = new Map();
const inFlightAssets = new Map();

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "./models/";
env.useBrowserCache = false;

const wasmRoot = new URL("./vendor/ort/", import.meta.url);
const wasmPaths = {
  mjs: new URL("ort-wasm-simd-threaded.mjs", wasmRoot).href,
  wasm: new URL("ort-wasm-simd-threaded.wasm", wasmRoot).href
};
env.backends.onnx.wasm.wasmPaths = wasmPaths;
ort.env.wasm.wasmPaths = wasmPaths;
ort.env.wasm.numThreads = 1;

function bytesToHex(bytes) {
  return Array.from(bytes, function (value) { return value.toString(16).padStart(2, "0"); }).join("");
}

async function sha256(bytes) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error("integrity-verification-unavailable");
  return bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)));
}

async function readResponse(response, onProgress, file) {
  const total = Number(response.headers.get("content-length")) || 0;
  const encoding = response.headers.get("content-encoding");
  const canAllocate = total > 0 && !encoding;
  const buffer = canAllocate ? new Uint8Array(total) : null;
  const chunks = [];
  let loaded = 0;
  const reader = response.body && response.body.getReader ? response.body.getReader() : null;
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (onProgress) onProgress({ phase: "download", file: file, loaded: bytes.length, total: bytes.length });
    return bytes;
  }
  for (;;) {
    const item = await reader.read();
    if (item.done) break;
    const part = item.value;
    if (buffer) {
      const bufferBytes = Math.min(Math.max(0, buffer.length - loaded), part.length);
      if (bufferBytes) buffer.set(part.subarray(0, bufferBytes), loaded);
      if (bufferBytes < part.length) chunks.push(part.subarray(bufferBytes));
    } else {
      chunks.push(part);
    }
    loaded += part.length;
    if (onProgress) onProgress({ phase: "download", file: file, loaded: loaded, total: total || 0 });
  }
  if (buffer && chunks.length === 0 && loaded === buffer.length) return buffer;
  const result = new Uint8Array(loaded);
  let offset = 0;
  if (buffer) {
    const bufferBytes = Math.min(buffer.length, loaded);
    result.set(buffer.subarray(0, bufferBytes), offset);
    offset += bufferBytes;
  }
  for (const part of chunks) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function fetchVerifiedAsset(file, onProgress) {
  if (inFlightAssets.has(file)) return inFlightAssets.get(file);
  const operation = (async function () {
    const expected = FILE_HASHES[file];
    if (!expected) throw new Error("unrecognized-model-asset");
    const url = new URL(file, MODEL_ROOT);
    if (url.origin !== globalThis.location.origin) throw new Error("model-asset-origin-mismatch");
    const response = await fetch(url, { method: "GET", credentials: "same-origin", redirect: "error" });
    if (!response.ok || response.status !== 200) throw new Error("model-asset-unavailable");
    const bytes = await readResponse(response, onProgress, file);
    const digest = await sha256(bytes);
    if (digest !== expected) throw new Error("model-integrity-mismatch");
    verifiedFiles.add(file);
    if (TOKENIZER_FILES.has(file)) verifiedAssetBytes.set(file, bytes);
    return bytes;
  })();
  inFlightAssets.set(file, operation);
  operation.finally(function () { inFlightAssets.delete(file); }).catch(function () {});
  return operation;
}

async function loadTokenizer(onProgress) {
  if (!tokenizerPromise) {
    tokenizerPromise = (async function () {
      onProgress({ phase: "tokenizer", file: "tokenizer.json", loaded: 0, total: 0 });
      for (const file of ["config.json", "tokenizer_config.json", "special_tokens_map.json", "tokenizer.json"]) {
        const bytes = await fetchVerifiedAsset(file, onProgress);
        if (file === "config.json") {
          const config = JSON.parse(new TextDecoder().decode(bytes));
          if (config.model_type !== "t5" || config.vocab_size !== 32128 || config.decoder_start_token_id !== 0 || config.eos_token_id !== 1) {
            throw new Error("unexpected-model-config");
          }
        }
      }
      onProgress({ phase: "tokenizer", file: "tokenizer.json", loaded: 1, total: 1 });
      // Transformers.js fetches tokenizer files as it constructs the tokenizer.
      // Serve those requests from the exact bytes verified above, so the loader
      // cannot bypass the SHA-256 checks through Cache Storage or a second fetch.
      const originalFetch = globalThis.fetch;
      globalThis.fetch = function (input, init) {
        let url;
        try {
          url = new URL(input instanceof Request ? input.url : String(input), globalThis.location.href);
        } catch (_) {
          return originalFetch.call(globalThis, input, init);
        }
        const file = Object.keys(FILE_HASHES).find(function (name) {
          return TOKENIZER_FILES.has(name) && url.origin === MODEL_ROOT.origin && url.pathname === new URL(name, MODEL_ROOT).pathname;
        });
        if (!file) return originalFetch.call(globalThis, input, init);
        const bytes = verifiedAssetBytes.get(file);
        if (!bytes) return Promise.reject(new Error("unverified-tokenizer-asset"));
        return Promise.resolve(new Response(bytes.slice(), { status: 200, headers: { "content-type": "application/json" } }));
      };
      try {
        return await AutoTokenizer.from_pretrained(LOCAL_MODEL_ID, { revision: ONNX_EXPORT_REVISION });
      } finally {
        globalThis.fetch = originalFetch;
        verifiedAssetBytes.clear();
      }
    })().catch(function (error) {
      tokenizerPromise = undefined;
      throw error;
    });
  }
  return tokenizerPromise;
}

async function createSession(file, onProgress) {
  const bytes = await fetchVerifiedAsset(file, onProgress);
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
    executionMode: "sequential"
  });
  return session;
}

async function loadSessions(onProgress) {
  if (!sessionsPromise) {
    sessionsPromise = (async function () {
      onProgress({ phase: "model", file: "encoder_model_int8.onnx", loaded: 0, total: 1 });
      const encoder = await createSession("encoder_model_int8.onnx", onProgress);
      onProgress({ phase: "model", file: "decoder_model_int8.onnx", loaded: 0, total: 1 });
      const decoder = await createSession("decoder_model_int8.onnx", onProgress);
      onProgress({ phase: "model", file: "decoder_model_int8.onnx", loaded: 1, total: 1 });
      return { encoder: encoder, decoder: decoder };
    })().catch(function (error) {
      sessionsPromise = undefined;
      throw error;
    });
  }
  return sessionsPromise;
}

function tokenIds(tokenizer, text) {
  const encoded = tokenizer(text);
  const tensor = encoded && encoded.input_ids;
  if (!tensor || !tensor.data || !Number.isSafeInteger(tensor.data.length)) throw new Error("tokenization-failed");
  return Array.from(tensor.data, function (value) { return Number(value); });
}

function ortInt64(values) {
  return new ort.Tensor("int64", BigInt64Array.from(values, BigInt), [1, values.length]);
}

async function runGreedy(encoder, decoder, inputIds, tokenizer, onProgress) {
  const attentionValues = inputIds.map(function () { return 1; });
  const encoderInputs = {
    input_ids: ortInt64(inputIds),
    attention_mask: ortInt64(attentionValues)
  };
  let encoded;
  try {
    encoded = await encoder.run(encoderInputs);
  } finally {
    encoderInputs.input_ids.dispose();
    encoderInputs.attention_mask.dispose();
  }
  const hiddenStates = encoded.last_hidden_state;
  if (!hiddenStates || hiddenStates.dims.length !== 3) throw new Error("invalid-encoder-output");
  const decoderIds = [Number(tokenizer.pad_token_id)];
  const encoderMask = ortInt64(attentionValues);
  let finished = false;
  try {
    for (let index = 0; index < MAX_OUTPUT_TOKENS; index += 1) {
      const decoderInput = ortInt64(decoderIds);
      let output;
      try {
        output = await decoder.run({
          encoder_attention_mask: encoderMask,
          input_ids: decoderInput,
          encoder_hidden_states: hiddenStates
        });
      } finally {
        decoderInput.dispose();
      }
      const logits = output.logits;
      if (!logits || logits.dims.length !== 3 || logits.dims[2] !== 32128) {
        if (logits) logits.dispose();
        throw new Error("invalid-decoder-output");
      }
      const vocabSize = logits.dims[2];
      const offset = logits.data.length - vocabSize;
      let bestId = 0;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (let token = 0; token < vocabSize; token += 1) {
        const score = logits.data[offset + token];
        if (score > bestScore) { bestScore = score; bestId = token; }
      }
      logits.dispose();
      if (bestId === Number(tokenizer.eos_token_id)) {
        finished = true;
        break;
      }
      decoderIds.push(bestId);
      if (onProgress && (index + 1) % 16 === 0) onProgress({ phase: "inference", generatedTokens: index + 1, maximumTokens: MAX_OUTPUT_TOKENS });
    }
    const text = tokenizer.decode(decoderIds.slice(1), { skip_special_tokens: true }).trim();
    return { text: text, truncated: !finished, finishReason: finished ? "eos" : "length" };
  } finally {
    encoderMask.dispose();
    hiddenStates.dispose();
    for (const value of Object.values(encoded)) {
      if (value && value !== hiddenStates && typeof value.dispose === "function") value.dispose();
    }
  }
}

export function createLocalProofreadingRunner(options) {
  const config = options || {};
  const onProgress = typeof config.onProgress === "function" ? config.onProgress : function () {};
  return Object.freeze({
    countTokens: async function (payload) {
      const tokenizer = await loadTokenizer(onProgress);
      return tokenIds(tokenizer, "gec: " + payload.paragraph).length;
    },
    generate: async function (payload) {
      if (!verifiedFiles.has("encoder_model_int8.onnx") || !verifiedFiles.has("decoder_model_int8.onnx")) {
        onProgress({ phase: "download", file: "model-assets", loaded: 0, total: FIRST_USE_MODEL_BYTES });
      }
      const tokenizer = await loadTokenizer(onProgress);
      const prompt = "gec: " + payload.paragraph;
      const inputIds = tokenIds(tokenizer, prompt);
      if (inputIds.length > MAX_INPUT_TOKENS) throw new Error("input-too-long");
      const sessions = await loadSessions(onProgress);
      return runGreedy(sessions.encoder, sessions.decoder, inputIds, tokenizer, onProgress);
    }
  });
}

export function getVerifiedModelAssets() {
  return Array.from(verifiedFiles);
}
