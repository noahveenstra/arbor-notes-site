import { embedTexts } from "./semantic-search.js?v=arb-related-margin-20261125-a";

self.addEventListener("message", async function (event) {
  const request = event.data || {};
  try {
    const texts = Array.isArray(request.texts) ? request.texts : [];
    if (!texts.length) throw new Error("Semantic search worker received no text");
    const embedded = await embedTexts(texts, null);
    const queryVector = Array.isArray(request.queryVector) ? request.queryVector : embedded.rows[0];
    const passageVectors = Array.isArray(request.queryVector) ? embedded.rows : embedded.rows.slice(1);
    self.postMessage({ id: request.id, vectors: [queryVector].concat(passageVectors) });
  } catch (error) {
    self.postMessage({ id: request.id, error: String(error && error.message || error) });
  }
});
