(function attachArborSearchLogic(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborSearchLogic = api;
})(globalThis, function createArborSearchLogic(root) {
  const SEMANTIC_SUGGESTION_SCORE_FLOOR = 0.65;

  function lexicalSearchNotes(notes, query) {
    const normalized = String(query || "").trim().toLocaleLowerCase();
    if (!normalized) return [];
    const candidates = Array.isArray(notes) ? notes : [];
    const rustSearch = root.ArborRustSearchCore;
    if (rustSearch && typeof rustSearch.rank === "function") {
      try {
        const rankedIndices = rustSearch.rank(normalized, candidates);
        if (Array.isArray(rankedIndices)) return rankedIndices.map(function (index) { return candidates[index]; }).filter(Boolean);
      } catch (error) {
        console.warn("Rust lexical search failed; using the browser fallback.", error);
      }
    }
    return candidates.filter(function (note) {
      const haystack = (note.title + " " + note.body + " " + (note.folder || "Unfiled")).toLocaleLowerCase();
      return normalized.split(/\s+/).every(function (term) { return haystack.includes(term); });
    }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
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
    semanticOnlySuggestions: semanticOnlySuggestions,
    SEMANTIC_SUGGESTION_SCORE_FLOOR: SEMANTIC_SUGGESTION_SCORE_FLOOR
  });
});
