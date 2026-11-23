(function attachArborRustSearch(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborRustSearchCore = api;
})(globalThis, function createArborRustSearch(root) {
  const WIRE_VERSION = 1;
  const textEncoder = new TextEncoder();

  function encodeRequest(query, notes) {
    const fields = [String(query || "")];
    for (const note of notes) {
      fields.push(String(note.title || ""), String(note.body || ""), String(note.folder || "Unfiled"));
    }
    const encoded = fields.map(function (field) { return textEncoder.encode(field); });
    const totalLength = 8 + encoded.reduce(function (total, field) { return total + 4 + field.byteLength; }, 0) + notes.length * 8;
    const buffer = new ArrayBuffer(totalLength);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    view.setUint32(offset, WIRE_VERSION, true);
    offset += 4;
    function writeString(value) {
      const field = encoded[value];
      view.setUint32(offset, field.byteLength, true);
      offset += 4;
      bytes.set(field, offset);
      offset += field.byteLength;
    }

    writeString(0);
    view.setUint32(offset, notes.length, true);
    offset += 4;
    for (let index = 0; index < notes.length; index += 1) {
      writeString(index * 3 + 1);
      writeString(index * 3 + 2);
      writeString(index * 3 + 3);
      const timestamp = Number(notes[index].updatedAt);
      view.setBigInt64(offset, BigInt(Number.isFinite(timestamp) ? Math.trunc(timestamp) : 0), true);
      offset += 8;
    }
    return bytes;
  }

  function createSearchCore(exports) {
    const memory = exports && exports.memory;
    const allocate = exports && exports.arbor_search_alloc_bytes;
    const freeBytes = exports && exports.arbor_search_free_bytes;
    const rankWire = exports && exports.arbor_search_rank_wire;
    const freeResults = exports && exports.arbor_search_free_results;
    if (!(memory instanceof WebAssembly.Memory) || !allocate || !freeBytes || !rankWire || !freeResults) {
      throw new TypeError("The Rust lexical search module has an incompatible interface.");
    }

    return Object.freeze({
      rank: function (query, notes) {
        const request = encodeRequest(query, notes);
        const inputPointer = allocate(request.byteLength) >>> 0;
        new Uint8Array(memory.buffer, inputPointer, request.byteLength).set(request);
        let resultPointer = 0;
        try {
          resultPointer = rankWire(inputPointer, request.byteLength) >>> 0;
        } finally {
          freeBytes(inputPointer, request.byteLength);
        }
        if (!resultPointer) throw new Error("The Rust lexical search module rejected its input.");

        const count = new Uint32Array(memory.buffer, resultPointer, 1)[0];
        try {
          return Array.from(new Uint32Array(memory.buffer, resultPointer + 4, count));
        } finally {
          freeResults(resultPointer, count + 1);
        }
      }
    });
  }

  let searchCore = null;
  let ready = Promise.resolve(false);
  if (root.document && typeof root.fetch === "function" && root.WebAssembly) {
    const script = root.document.currentScript;
    const scriptURL = script && script.src ? script.src : root.location.href;
    const wasmURL = new URL("./lexical-search.wasm?v=arb-120-rust-lexical-20261121-a", scriptURL);
    ready = root.fetch(wasmURL, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("Rust lexical search could not be loaded.");
        return response.arrayBuffer();
      })
      .then(function (bytes) { return root.WebAssembly.instantiate(bytes, {}); })
      .then(function (result) {
        searchCore = createSearchCore(result.instance.exports);
        return true;
      })
      .catch(function (error) {
        console.warn("Rust lexical search is unavailable; using the browser fallback.", error);
        return false;
      });
  }

  return Object.freeze({
    createSearchCore: createSearchCore,
    encodeRequest: encodeRequest,
    get ready() { return ready; },
    rank: function (query, notes) { return searchCore ? searchCore.rank(query, notes) : null; }
  });
});
