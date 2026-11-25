(function attachArborSearchLogic(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborSearchLogic = api;
})(globalThis, function createArborSearchLogic(root) {
  const SEMANTIC_SUGGESTION_SCORE_FLOOR = 0.65;
  let loggedFallback = false;

  function splitWhitespace(value) {
    return String(value || "").split(/[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/).filter(function (term) { return term.length > 0; });
  }

  function normalizeQuery(query) {
    return splitWhitespace(query).join(" ").toLowerCase();
  }

  function fieldText(value, emptyFolder) {
    const text = String(value || "");
    if (emptyFolder && !text.trim()) return "unfiled";
    return text.toLowerCase();
  }

  function rankLexical(query, notes) {
    const normalized = normalizeQuery(query);
    if (!normalized) return [];
    const terms = normalized.split(" ");
    const candidates = Array.isArray(notes) ? notes : [];
    const matches = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const note = candidates[index];
      if (!note) continue;
      const title = fieldText(note.title, false);
      const body = fieldText(note.body, false);
      const folder = fieldText(note.folder, true);
      const fields = [title, body, folder];
      if (terms.some(function (term) { return !fields.some(function (field) { return field.includes(term); }); })) continue;
      const titleTerms = terms.filter(function (term) { return title.includes(term); }).length;
      const bodyTerms = terms.filter(function (term) { return body.includes(term); }).length;
      const folderTerms = terms.filter(function (term) { return folder.includes(term); }).length;
      let phraseTier = 0;
      if (title.includes(normalized)) phraseTier = 3;
      else if (body.includes(normalized)) phraseTier = 2;
      else if (folder.includes(normalized)) phraseTier = 1;
      const updatedAt = Number(note.updatedAt);
      matches.push({
        note: note,
        phraseTier: phraseTier,
        titleTerms: titleTerms,
        bodyTerms: bodyTerms,
        folderTerms: folderTerms,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
        index: index
      });
    }
    matches.sort(function (left, right) {
      return right.phraseTier - left.phraseTier
        || right.titleTerms - left.titleTerms
        || right.bodyTerms - left.bodyTerms
        || right.folderTerms - left.folderTerms
        || (right.updatedAt > left.updatedAt ? 1 : right.updatedAt < left.updatedAt ? -1 : 0)
        || (left.index - right.index);
    });
    return matches.map(function (match) { return match.note; });
  }

  function rustCore() {
    return root.ArborRustSearchCore;
  }

  function rustIsReady(rust) {
    if (!rust || typeof rust.rank !== "function") return false;
    if (typeof rust.isRankingReady === "function") return rust.isRankingReady();
    return true;
  }

  function wasmIndexReady(rust) {
    if (!rust || typeof rust.upsert !== "function" || typeof rust.rankIndexed !== "function") return false;
    if (typeof rust.isRankingReady === "function") return rust.isRankingReady();
    return true;
  }

  function rustIsPending(rust) {
    if (!rust || typeof rust.isRankingReady !== "function" || rust.isRankingReady()) return false;
    if (typeof rust.hasSettled === "function" && rust.hasSettled()) return false;
    return Boolean(rust.ready && typeof rust.ready.then === "function");
  }

  function logFallback(reason) {
    if (loggedFallback || !root.document) return;
    loggedFallback = true;
    console.warn("Arbor lexical search is using the browser ranker because " + reason + ". Tokenization and scoring match the Rust lexical core.");
  }

  function lexicalSearchNotes(notes, query) {
    if (!String(query || "").trim()) return [];
    const candidates = Array.isArray(notes) ? notes : [];
    const rust = rustCore();
    if (rustIsReady(rust)) {
      try {
        const rankedIndices = rust.rank(query, candidates);
        if (Array.isArray(rankedIndices)) return rankedIndices.map(function (index) { return candidates[index]; }).filter(Boolean);
      } catch (error) {
        console.warn("Rust lexical search failed; using the matching browser ranker.", error);
      }
    } else if (rust && typeof rust.hasFailed === "function" && rust.hasFailed()) {
      logFallback("the Rust WebAssembly module did not load");
    }
    return rankLexical(query, candidates);
  }

  function fingerprint(note) {
    return [note.id, note.title, note.body, note.folder, note.updatedAt, note.sourceRevision || ""].join("\u0001");
  }

  function normalizeNote(note) {
    if (!note || note.id == null || note.id === "") return null;
    const updatedAt = Number(note.updatedAt);
    return {
      id: String(note.id),
      title: String(note.title || ""),
      body: String(note.body || ""),
      folder: String(note.folder || ""),
      updatedAt: Number.isFinite(updatedAt) ? Math.trunc(updatedAt) : 0,
      createdAt: note.createdAt,
      sourceRevision: note.sourceRevision == null ? "" : String(note.sourceRevision)
    };
  }

  function createLexicalIndex() {
    let documents = [];
    const positions = new Map();
    const fingerprints = new Map();
    const wasmFingerprints = new Map();
    let pendingQuery = null;
    let pendingResolve = null;
    let pendingPromise = null;
    let watchedRust = null;

    function currentDocuments() {
      return documents.slice();
    }

    function remember(doc) {
      const fp = fingerprint(doc);
      const existing = positions.get(doc.id);
      if (existing == null) {
        positions.set(doc.id, documents.length);
        documents.push(doc);
        fingerprints.set(doc.id, fp);
        return true;
      }
      if (fingerprints.get(doc.id) === fp) return false;
      documents[existing] = doc;
      fingerprints.set(doc.id, fp);
      return true;
    }

    function forget(id) {
      const index = positions.get(id);
      if (index == null) return false;
      documents.splice(index, 1);
      positions.delete(id);
      fingerprints.delete(id);
      for (let cursor = index; cursor < documents.length; cursor += 1) positions.set(documents[cursor].id, cursor);
      return true;
    }

    function flushToWasm() {
      const rust = rustCore();
      if (!wasmIndexReady(rust)) return;
      documents.forEach(function (note) {
        const fp = fingerprints.get(note.id);
        if (wasmFingerprints.get(note.id) === fp) return;
        rust.upsert(note);
        wasmFingerprints.set(note.id, fp);
      });
      Array.from(wasmFingerprints.keys()).forEach(function (id) {
        if (fingerprints.has(id)) return;
        rust.remove(id);
        wasmFingerprints.delete(id);
      });
    }

    function rankNow(query) {
      flushToWasm();
      const rust = rustCore();
      if (wasmIndexReady(rust)) {
        try {
          const ids = rust.rankIndexed(query);
          if (Array.isArray(ids)) return ids.map(function (id) { return documents[positions.get(id)]; }).filter(Boolean);
        } catch (error) {
          console.warn("Rust lexical search failed; using the matching browser ranker.", error);
        }
      } else if (rust && typeof rust.hasFailed === "function" && rust.hasFailed()) {
        logFallback("the Rust WebAssembly module did not load");
      } else if (!rust && root.document) {
        logFallback("the Rust WebAssembly module is not loaded");
      }
      return rankLexical(query, documents);
    }

    function settlePending() {
      if (!pendingResolve) return;
      const query = pendingQuery;
      const resolve = pendingResolve;
      pendingQuery = null;
      pendingResolve = null;
      pendingPromise = null;
      resolve(rankNow(query));
    }

    function watch(rust) {
      if (!rust || watchedRust === rust || !rust.ready || typeof rust.ready.then !== "function") return;
      watchedRust = rust;
      rust.ready.then(function () {
        if (rustCore() !== rust) return;
        flushToWasm();
        settlePending();
      });
    }

    function sync(notes) {
      watch(rustCore());
      const list = Array.isArray(notes) ? notes : [];
      if (!list.length) {
        documents = [];
        positions.clear();
        fingerprints.clear();
        flushToWasm();
        return;
      }
      const seen = new Set();
      list.forEach(function (note) {
        const doc = normalizeNote(note);
        if (!doc) return;
        seen.add(doc.id);
        remember(doc);
      });
      const stale = [];
      positions.forEach(function (index, id) {
        if (!seen.has(id)) stale.push({ id: id, index: index });
      });
      stale.sort(function (left, right) { return right.index - left.index; });
      stale.forEach(function (entry) { forget(entry.id); });
      flushToWasm();
    }

    function upsert(note) {
      watch(rustCore());
      const doc = normalizeNote(note);
      if (!doc) return;
      if (!remember(doc)) return;
      flushToWasm();
    }

    function remove(id) {
      watch(rustCore());
      if (!forget(String(id || ""))) return;
      flushToWasm();
    }

    function reset() {
      documents = [];
      positions.clear();
      fingerprints.clear();
      wasmFingerprints.clear();
      const rust = rustCore();
      if (rust && typeof rust.reset === "function" && wasmIndexReady(rust)) rust.reset();
    }

    function search(query) {
      watch(rustCore());
      if (!String(query || "").trim()) return { pending: false, results: [], promise: Promise.resolve([]) };
      const rust = rustCore();
      if (rustIsPending(rust)) {
        const queryText = String(query || "");
        if (pendingPromise && pendingQuery === queryText) {
          return { pending: true, results: [], promise: pendingPromise };
        }
        const superseded = pendingResolve;
        pendingQuery = queryText;
        pendingPromise = new Promise(function (resolve) { pendingResolve = resolve; });
        if (superseded) superseded([]);
        return { pending: true, results: [], promise: pendingPromise };
      }
      const results = rankNow(query);
      return { pending: false, results: results, promise: Promise.resolve(results) };
    }

    watch(rustCore());

    return Object.freeze({
      sync: sync,
      upsert: upsert,
      remove: remove,
      reset: reset,
      search: search,
      documents: currentDocuments,
      isQueryPending: function () { return pendingQuery !== null; }
    });
  }

  function semanticOnlySuggestions(notes, scores, lexicalNotes) {
    const exactIDs = new Set((Array.isArray(lexicalNotes) ? lexicalNotes : []).map(function (note) { return note.id; }));
    const scoreFor = scores && typeof scores.get === "function" ? function (id) { return scores.get(id); } : function () { return undefined; };
    return (Array.isArray(notes) ? notes : []).map(function (note) {
      return { note: note, score: scoreFor(note.id) };
    }).filter(function (entry) {
      return Number.isFinite(entry.score) && entry.score >= SEMANTIC_SUGGESTION_SCORE_FLOOR && !exactIDs.has(entry.note.id);
    }).sort(function (a, b) {
      return b.score - a.score || b.note.updatedAt - a.note.updatedAt;
    }).slice(0, 3).map(function (entry) { return entry.note; });
  }

  return Object.freeze({
    lexicalSearchNotes: lexicalSearchNotes,
    rankLexical: rankLexical,
    createLexicalIndex: createLexicalIndex,
    semanticOnlySuggestions: semanticOnlySuggestions,
    SEMANTIC_SUGGESTION_SCORE_FLOOR: SEMANTIC_SUGGESTION_SCORE_FLOOR
  });
});
