// Detect-only underlines for subordinate clauses with no main clause.
// There is no replacement: the note stays as written until the user edits it.

const STARTERS = ["because", "although", "though", "if", "which", "while", "when", "since", "unless", "until", "whereas", "whether", "whenever", "wherever", "once"];
const STARTER = new RegExp("^\\s*([" + "\"'“”‘’" + "]*)\\b(" + STARTERS.join("|") + ")\\b", "iu");
const QUESTION_STARTERS = new Set(["which", "when", "where", "if"]);

function wordCount(text) {
  return (String(text || "").match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
}

function hasMainClause(text, starter) {
  const source = String(text || "").trim();
  const pieces = source.split(/[,;:]/u);
  if (pieces.length >= 2) {
    const tail = pieces.slice(1).join(" ").trim();
    if (wordCount(tail) >= 2 && !STARTER.test(tail)) return true;
  }
  if (/\?\s*$/u.test(source) && QUESTION_STARTERS.has(starter.toLocaleLowerCase()) && wordCount(source) >= 4) return true;
  const rest = source.slice(source.toLocaleLowerCase().indexOf(starter.toLocaleLowerCase()) + starter.length);
  if (/\b(?:and|but|so)\s+(?:i|he|she|we|they|you|it)\b/iu.test(rest)) return true;
  return false;
}

function fragmentSpan(text) {
  const source = String(text || "");
  const match = STARTER.exec(source);
  if (!match) return null;
  const starter = match[2];
  if (hasMainClause(source, starter)) return null;
  const start = match.index + match[1].length + source.slice(match.index + match[1].length).toLocaleLowerCase().indexOf(starter.toLocaleLowerCase());
  return {
    start: start,
    end: start + starter.length,
    replacement: null,
    detectOnly: true,
    kind: "fragment",
    message: "This looks like a sentence fragment."
  };
}

export { fragmentSpan, hasMainClause };
