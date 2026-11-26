// Harper lint cleanup. The wasm build has no confidence score, so a suggestion
// is kept only when it is a close or same-sounding spelling. Noisy lint
// classes are dropped before they can underline clean prose.

import { VARIANT_OK, chooseSpelling } from "./proofreading-precision.mjs";

function harperKind(span) {
  const value = String(span && (span.transformClass || span.ruleId) || "");
  const split = value.indexOf(":");
  return split >= 0 ? value.slice(split + 1) : value;
}

function matchCase(source, target) {
  if (!target || target === "a lot") return target;
  if (source === source.toLocaleUpperCase() && source !== source.toLocaleLowerCase()) return target.toLocaleUpperCase();
  if (source[0] && source[0] === source[0].toLocaleUpperCase() && source[0] !== source[0].toLocaleLowerCase()) {
    return target[0].toLocaleUpperCase() + target.slice(1);
  }
  return target;
}

function refineHarperSpans(text, spans, options) {
  const source = String(text || "");
  const allowCapitalization = Boolean(options && options.allowCapitalization);
  const lexicon = options && options.lexicon;
  return (Array.isArray(spans) ? spans : []).map(function (span) {
    if (!span) return null;
    const kind = harperKind(span);
    const original = source.slice(span.start, span.end);
    const suggestions = [];
    if (span.replacement != null && String(span.replacement)) suggestions.push(String(span.replacement));
    if (Array.isArray(span.suggestions)) span.suggestions.forEach(function (item) { if (item) suggestions.push(String(item)); });
    if (kind === "Miscellaneous" || kind === "Formatting") return null;
    if (kind === "Capitalization" && !allowCapitalization) return null;
    if (kind === "Punctuation") {
      const replacement = suggestions[0] || "";
      if (!original || replacement === "," || replacement === "." || replacement === ";" || replacement === ":") return null;
      if (/^\W+$/u.test(replacement)) return null;
    }
    if (kind === "WordChoice") {
      const replacement = suggestions[0] || "";
      if (/^\s/.test(replacement) || replacement === "of" || replacement === "to") return null;
    }
    if (kind === "Spelling" || kind === "WordChoice") {
      const word = original.trim();
      if (!word || VARIANT_OK.has(word.toLocaleLowerCase())) return null;
      if (word.toLocaleLowerCase() === word && suggestions.every(function (item) { return item.toLocaleLowerCase() === word.toLocaleLowerCase(); })) {
        return allowCapitalization ? span : null;
      }
      const chosen = chooseSpelling(word, suggestions, lexicon);
      if (!chosen) return null;
      const shown = chosen === "a lot" ? "a lot" : matchCase(word, chosen);
      if (shown === word) return null;
      return Object.assign({}, span, { replacement: shown, detectOnly: false });
    }
    return span;
  }).filter(Boolean);
}

export { refineHarperSpans };
