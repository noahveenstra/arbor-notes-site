(function attachArborRustSearch(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborRustSearchCore = api;
})(globalThis, function createArborRustSearch(root) {
  const WIRE_VERSION = 1;
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  function encodeParts(parts, suffixBytes) {
    const encoded = parts.map(function (part) { return textEncoder.encode(String(part)); });
    let total = 4 + (suffixBytes || 0);
    encoded.forEach(function (field) { total += 4 + field.byteLength; });
    const buffer = new ArrayBuffer(total);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;
    view.setUint32(offset, WIRE_VERSION, true);
    offset += 4;
    encoded.forEach(function (field) {
      view.setUint32(offset, field.byteLength, true);
      offset += 4;
      bytes.set(field, offset);
      offset += field.byteLength;
    });
    return { bytes: bytes, view: view, offset: offset };
  }

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

  function encodeUpsert(note) {
    const packet = encodeParts([
      String(note.id || ""),
      String(note.title || ""),
      String(note.body || ""),
      String(note.folder || "")
    ], 8);
    const timestamp = Number(note.updatedAt);
    packet.view.setBigInt64(packet.offset, BigInt(Number.isFinite(timestamp) ? Math.trunc(timestamp) : 0), true);
    return packet.bytes;
  }

  function encodeRemove(id) {
    return encodeParts([String(id || "")], 0).bytes;
  }

  function encodeQuery(query) {
    return encodeParts([String(query || "")], 0).bytes;
  }

  function createSearchCore(exports) {
    const memory = exports && exports.memory;
    const allocate = exports && exports.arbor_search_alloc_bytes;
    const freeBytes = exports && exports.arbor_search_free_bytes;
    const rankWire = exports && exports.arbor_search_rank_wire;
    const freeResults = exports && exports.arbor_search_free_results;
    const indexReset = exports && exports.arbor_search_index_reset;
    const indexUpsert = exports && exports.arbor_search_index_upsert;
    const indexRemove = exports && exports.arbor_search_index_remove;
    const indexRank = exports && exports.arbor_search_index_rank;
    if (!(memory instanceof WebAssembly.Memory) || !allocate || !freeBytes || !rankWire || !freeResults || !indexReset || !indexUpsert || !indexRemove || !indexRank) {
      throw new TypeError("The Rust lexical search module has an incompatible interface.");
    }

    function withRequest(bytes, callback) {
      const inputPointer = allocate(bytes.byteLength) >>> 0;
      new Uint8Array(memory.buffer, inputPointer, bytes.byteLength).set(bytes);
      try {
        return callback(inputPointer, bytes.byteLength);
      } finally {
        freeBytes(inputPointer, bytes.byteLength);
      }
    }

    function decodeIds(pointer) {
      const view = new DataView(memory.buffer);
      const payloadLength = view.getUint32(pointer, true);
      const start = pointer + 4;
      const count = view.getUint32(start, true);
      let offset = start + 4;
      const bytes = new Uint8Array(memory.buffer);
      const ids = [];
      for (let index = 0; index < count; index += 1) {
        const length = view.getUint32(offset, true);
        offset += 4;
        ids.push(textDecoder.decode(bytes.subarray(offset, offset + length)));
        offset += length;
      }
      freeBytes(pointer, payloadLength + 4);
      return ids;
    }

    return Object.freeze({
      rank: function (query, notes) {
        const request = encodeRequest(query, notes);
        const resultPointer = withRequest(request, function (inputPointer, length) {
          return rankWire(inputPointer, length) >>> 0;
        });
        if (!resultPointer) throw new Error("The Rust lexical search module rejected its input.");

        const count = new Uint32Array(memory.buffer, resultPointer, 1)[0];
        try {
          return Array.from(new Uint32Array(memory.buffer, resultPointer + 4, count));
        } finally {
          freeResults(resultPointer, count + 1);
        }
      },
      reset: function () { indexReset(); },
      upsert: function (note) {
        const request = encodeUpsert(note);
        return withRequest(request, function (inputPointer, length) {
          return indexUpsert(inputPointer, length) === 1;
        });
      },
      remove: function (id) {
        const request = encodeRemove(id);
        return withRequest(request, function (inputPointer, length) {
          return indexRemove(inputPointer, length) === 1;
        });
      },
      rankIndexed: function (query) {
        const request = encodeQuery(query);
        const pointer = withRequest(request, function (inputPointer, length) {
          return indexRank(inputPointer, length) >>> 0;
        });
        if (!pointer) throw new Error("The Rust lexical search module rejected its query.");
        return decodeIds(pointer);
      }
    });
  }

  let searchCore = null;
  let rankingReady = false;
  let settled = false;
  let failed = false;
  let ready = Promise.resolve(false);
  const wasmVersion = "arb-125-rust-index-20261125-a";
  if (root.document && typeof root.fetch === "function" && root.WebAssembly) {
    const script = root.document.currentScript;
    const scriptURL = script && script.src ? script.src : root.location.href;
    const wasmURL = new URL("./lexical-search.wasm?v=arb-125-rust-index-20261125-a", scriptURL);
    ready = root.fetch(wasmURL, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("Rust lexical search could not be loaded.");
        return response.arrayBuffer();
      })
      .then(function (bytes) { return root.WebAssembly.instantiate(bytes, {}); })
      .then(function (result) {
        searchCore = createSearchCore(result.instance.exports);
        rankingReady = true;
        settled = true;
        return true;
      })
      .catch(function (error) {
        failed = true;
        settled = true;
        console.warn("Arbor lexical search is using the browser ranker because the Rust WebAssembly module did not load. Tokenization and scoring match the Rust lexical core.", error);
        return false;
      });
  } else {
    settled = true;
    failed = true;
  }

  return Object.freeze({
    createSearchCore: createSearchCore,
    encodeRequest: encodeRequest,
    wasmVersion: wasmVersion,
    get ready() { return ready; },
    isRankingReady: function () { return rankingReady; },
    hasSettled: function () { return settled; },
    hasFailed: function () { return failed; },
    rank: function (query, notes) { return searchCore ? searchCore.rank(query, notes) : null; },
    reset: function () { if (searchCore) searchCore.reset(); },
    upsert: function (note) { return searchCore ? searchCore.upsert(note) : false; },
    remove: function (id) { return searchCore ? searchCore.remove(id) : false; },
    rankIndexed: function (query) { return searchCore ? searchCore.rankIndexed(query) : null; }
  });
});
