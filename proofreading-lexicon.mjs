// Word classes for the agreement rules, read from the vendored Hunspell
// dictionary Arbor already ships for spelling. Harper's wasm build does not
// expose its curated dictionary or a part-of-speech tagger.

const NO_PLURAL = new Set(("sheep deer fish moose swine series species aircraft salmon trout offspring corps chassis means " +
  "headquarters bison elk cod tuna squid shrimp news mathematics physics politics economics ethics linguistics information " +
  "furniture advice luggage equipment money rice bread milk water air music homework research knowledge traffic weather work " +
  "people children men women mice geese teeth feet oxen data media criteria phenomena police cattle scissors pants trousers " +
  "clothes glasses thanks folk folks staff clergy offspring").split(/\s+/u));

function lexiconFromDic(text) {
  const pluralizable = new Set();
  const words = new Set();
  String(text || "").split(/\n/u).forEach(function (line, index) {
    if (index === 0 || !line) return;
    const slash = line.indexOf("/");
    const word = (slash < 0 ? line : line.slice(0, slash)).toLocaleLowerCase();
    const flags = slash < 0 ? "" : line.slice(slash + 1);
    if (!word || /[^a-z''-]/u.test(word)) return;
    words.add(word);
    if (flags.indexOf("S") >= 0) pluralizable.add(word);
  });
  return {
    has: function (word) { return words.has(String(word || "").toLocaleLowerCase()); },
    allowsPlural: function (word) {
      const lower = String(word || "").toLocaleLowerCase();
      if (!lower || NO_PLURAL.has(lower)) return false;
      return pluralizable.has(lower);
    }
  };
}

const builtinWords = "cat dog book problem apple house car day year week time friend child person man woman mouse goose tooth foot ox leaf life wife knife story city family job idea question reason fact point hand eye way part place case group number room area fact story church box bus class glass kiss bench branch match wish dish fox quiz baby city party story".split(/\s+/u);
const builtin = {
  has: function (word) { return builtinWords.indexOf(String(word || "").toLocaleLowerCase()) >= 0; },
  allowsPlural: function (word) {
    const lower = String(word || "").toLocaleLowerCase();
    return !NO_PLURAL.has(lower) && builtinWords.indexOf(lower) >= 0;
  }
};

export { NO_PLURAL, builtin as builtinLexicon, lexiconFromDic };
