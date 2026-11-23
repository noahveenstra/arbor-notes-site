import { embedTexts } from "./semantic-search.js?v=arctic-semantic-7";

self.addEventListener("message", async function (event) {
  const request = event.data || {};
  try {
    const texts = Array.isArray(request.texts) ? request.texts : [];
    if (!texts.length) throw new Error("Semantic search worker received no text");
    const embedded = await embedTexts(texts, null);
    self.postMessage({ id: request.id, vectors: embedded.rows });
  } catch (error) {
    self.postMessage({ id: request.id, error: String(error && error.message || error) });
  }
});
