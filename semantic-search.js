import { env, pipeline } from "./vendor/transformers/transformers.min.js";
import { CHUNKER_VERSION, EMBEDDING_DIMENSION, LOCAL_MODEL_ID, MODEL_ID, MODEL_REVISION, QUERY_PREFIX, getCacheStats } from "./semantic-search-index.js?v=arb-160-incremental-20261124";

const runtimeByDevice = new Map();
const fallbackByDevice = new Map();
const extractorPromises = new Map();
// Resolved from this module. A relative "./vendor/ort/" string is imported from inside
// vendor/transformers/transformers.min.js and would not find these files.
const wasmRoot = new URL("./vendor/ort/", import.meta.url);

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "./models/";
env.useBrowserCache = true;

const preset = env.backends && env.backends.onnx && env.backends.onnx.wasm && env.backends.onnx.wasm.wasmPaths;
const presetWasm = preset && typeof preset === "object" ? String(preset.wasm || "") : "";
const presetFile = presetWasm.slice(presetWasm.lastIndexOf("/") + 1);
if (presetFile === "ort-wasm-simd-threaded.wasm") {
  env.backends.onnx.wasm.wasmPaths = {
    mjs: new URL("ort-wasm-simd-threaded.mjs", wasmRoot).href,
    wasm: new URL("ort-wasm-simd-threaded.wasm", wasmRoot).href
  };
} else {
  env.backends.onnx.wasm.wasmPaths = wasmRoot.href;
}

function extractorKey(device) { return device || "automatic"; }

function loadExtractor(device, dtype, reason) {
  const key = extractorKey(device);
  if (reason) fallbackByDevice.set(key, String(reason && reason.message || reason));
  const options = { revision: MODEL_REVISION, dtype: dtype };
  if (device) options.device = device;
  const promise = pipeline("feature-extraction", LOCAL_MODEL_ID, options)
    .then(function (extractor) { return { extractor: extractor, dtype: dtype, device: key }; });
  extractorPromises.set(key, promise);
  return promise;
}

function getExtractor(device) {
  const key = extractorKey(device);
  if (!extractorPromises.has(key)) {
    const options = { revision: MODEL_REVISION, dtype: "q8" };
    if (device) options.device = device;
    const promise = pipeline("feature-extraction", LOCAL_MODEL_ID, options)
      .then(function (extractor) { return { extractor: extractor, dtype: "q8", device: key }; })
      .catch(function (error) { return loadExtractor(device, "fp32", error); });
    extractorPromises.set(key, promise);
  }
  return extractorPromises.get(key);
}

export function getModelRuntimeInfo(device) {
  const key = extractorKey(device);
  return {
    model_id: MODEL_ID,
    model_revision: MODEL_REVISION,
    local_model_id: LOCAL_MODEL_ID,
    chunker_version: CHUNKER_VERSION,
    package: "@huggingface/transformers 4.3.2 (vendored)",
    onnxruntime: "onnxruntime-web 1.31.0-dev.20260911-2a43ec07e (vendored)",
    requested_device: key,
    dtype: runtimeByDevice.get(key) || null,
    fallback_reason: fallbackByDevice.get(key) || null,
    embedding_dimension: EMBEDDING_DIMENSION,
    query_recipe: QUERY_PREFIX + "<text>",
    passage_recipe: "<chunk> (no prefix)",
    pooling: "cls",
    normalization: "L2",
    vector_cache: getCacheStats()
  };
}

function verifyDimension(rows) {
  rows.forEach(function (row) {
    if (!Array.isArray(row) || row.length !== EMBEDDING_DIMENSION) throw new Error("Arctic Embed S returned an embedding dimension other than 384");
  });
  return rows;
}

export async function embedTexts(texts, device) {
  let loaded = await getExtractor(device);
  const run = async function (model) {
    const rows = [];
    for (let offset = 0; offset < texts.length; offset += 24) {
      const output = await model(texts.slice(offset, offset + 24), { pooling: "cls", normalize: true });
      rows.push.apply(rows, output.tolist());
    }
    return verifyDimension(rows);
  };
  try {
    const rows = await run(loaded.extractor);
    runtimeByDevice.set(loaded.device, loaded.dtype);
    return { rows: rows, dtype: loaded.dtype };
  } catch (error) {
    if (loaded.dtype !== "q8") throw error;
    loaded = await loadExtractor(device, "fp32", error);
    const rows = await run(loaded.extractor);
    runtimeByDevice.set(loaded.device, loaded.dtype);
    return { rows: rows, dtype: loaded.dtype };
  }
}
