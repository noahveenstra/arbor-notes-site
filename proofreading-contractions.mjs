// Missing-apostrophe contractions. These are suggestions only.

const FORMS = new Map([
  ["dont", "don't"],
  ["doesnt", "doesn't"],
  ["didnt", "didn't"],
  ["cant", "can't"],
  ["wont", "won't"],
  ["isnt", "isn't"],
  ["arent", "aren't"],
  ["wasnt", "wasn't"],
  ["werent", "weren't"],
  ["hasnt", "hasn't"],
  ["havent", "haven't"],
  ["hadnt", "hadn't"],
  ["couldnt", "couldn't"],
  ["shouldnt", "shouldn't"],
  ["wouldnt", "wouldn't"],
  ["mustnt", "mustn't"],
  ["neednt", "needn't"],
  ["whats", "what's"],
  ["thats", "that's"],
  ["theres", "there's"],
  ["heres", "here's"],
  ["wheres", "where's"],
  ["youre", "you're"],
  ["youve", "you've"],
  ["youll", "you'll"],
  ["youd", "you'd"],
  ["theyre", "they're"],
  ["theyve", "they've"],
  ["theyll", "they'll"],
  ["theyd", "they'd"],
  ["weve", "we've"],
  ["im", "I'm"],
  ["ive", "I've"],
  ["couldve", "could've"],
  ["shouldve", "should've"],
  ["wouldve", "would've"],
  ["mightve", "might've"],
  ["mustve", "must've"],
  ["whos", "who's"]
]);

const PATTERN = new RegExp("\\b(" + Array.from(FORMS.keys()).join("|") + ")\\b", "giu");

function matchCase(source, target) {
  if (source === source.toLocaleUpperCase()) return target.toLocaleUpperCase();
  if (source[0] === source[0].toLocaleUpperCase()) return target[0].toLocaleUpperCase() + target.slice(1);
  return target;
}

function overlaps(start, end, ranges) {
  return (ranges || []).some(function (range) { return start < range.end && range.start < end; });
}

function contractionSpans(text, protectedRanges) {
  const source = String(text || "");
  const spans = [];
  PATTERN.lastIndex = 0;
  let match;
  while ((match = PATTERN.exec(source))) {
    const start = match.index;
    const end = start + match[0].length;
    if (overlaps(start, end, protectedRanges)) continue;
    const replacement = matchCase(match[0], FORMS.get(match[0].toLocaleLowerCase()));
    if (!replacement || replacement === match[0]) continue;
    spans.push({
      start: start,
      end: end,
      replacement: replacement,
      kind: "grammar",
      message: "Missing apostrophe"
    });
  }
  return spans;
}

export { FORMS, contractionSpans };
