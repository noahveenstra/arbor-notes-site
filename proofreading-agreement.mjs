// Number and subject-verb agreement. These are suggestions, not automatic edits.
// A quantifier or a pronoun has to be present, and the word has to be a real
// dictionary entry (Hunspell flag S for regular plurals). The global model
// threshold is not involved.

import { builtinLexicon } from "./proofreading-lexicon.mjs";

const QUANTIFIERS = new Set("two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million dozen several many few various numerous multiple both these those".split(" "));
const MODIFIERS = new Set("big small old new young long short high low good bad great little large early late next other own same such real only very more most quite rather almost really just red blue green black white brown gray grey hot cold hard soft full free clear quiet slow fast happy sad nice kind poor rich open whole entire single local simple different important possible public private major minor main spare extra final broken updated printed".split(" "));
const SAFE_FOLLOWERS = new Set("of in on at to for with from by about into over after before during without within through across around under upon off out up down near like than as per via among between against toward towards except and or but nor yet so behind beside inside outside along despite above below onto past until till since while because if when where that who whom which am is are was were be been being do does did have has had can could will would shall should may might must i you he she it we they this that these those there not never always really just still already also even only today yesterday tomorrow now then here again away back home too very lives live plays play needs need walks walk likes like wants want seems seem goes go".split(" "));
const ADVERBS = new Set("really always never often just still also usually sometimes already even only ever soon later now then here there today yesterday tomorrow not simply actually probably".split(" "));
const PREVIOUS_BLOCK = new Set("do does did be am is are was were been being have has had can could will would shall should may might must to that which who whom dont don't doesnt doesn't didnt didn't isnt isn't arent aren't wasnt wasn't werent weren't hasnt hasn't havent haven't hadnt hadn't wont won't cant can't cannot couldnt couldn't shouldnt shouldn't wouldnt wouldn't".split(" "));
const THIRD = new Set("he she it".split(" "));
const BASE_SUBJECTS = new Set("i you we they".split(" "));
const BOOKS = new Set("genesis exodus leviticus numbers deuteronomy joshua judges ruth samuel kings chronicles ezra nehemiah esther job psalms psalm proverbs ecclesiastes isaiah jeremiah lamentations ezekiel daniel hosea joel amos obadiah jonah micah nahum habakkuk zephaniah haggai zechariah malachi matthew mark luke john acts romans corinthians galatians ephesians philippians colossians thessalonians timothy titus philemon hebrews james peter jude revelation".split(" "));

// Vendored Hunspell marks these count nouns with a possessive flag only, so
// flag S never attaches. A quantifier is still required before a plural is offered.
const COUNT_WITHOUT_FLAG = new Set("pass speaker".split(" "));

const IRREGULAR_PLURAL = {
  child: "children", person: "people", man: "men", woman: "women", mouse: "mice", goose: "geese",
  tooth: "teeth", foot: "feet", ox: "oxen", leaf: "leaves", life: "lives", wife: "wives", knife: "knives",
  half: "halves", calf: "calves", wolf: "wolves", loaf: "loaves", self: "selves", elf: "elves",
  shelf: "shelves", thief: "thieves", criterion: "criteria", phenomenon: "phenomena", analysis: "analyses",
  thesis: "theses", crisis: "crises", diagnosis: "diagnoses", oasis: "oases", hypothesis: "hypotheses",
  parenthesis: "parentheses", cactus: "cacti", fungus: "fungi", nucleus: "nuclei", stimulus: "stimuli",
  alumnus: "alumni", syllabus: "syllabi", focus: "foci", radius: "radii", index: "indexes", medium: "media",
  datum: "data", bacterium: "bacteria", curriculum: "curricula"
};

const VERBS = [
  ["like", "likes"], ["go", "goes"], ["have", "has"], ["do", "does"], ["try", "tries"], ["watch", "watches"],
  ["study", "studies"], ["want", "wants"], ["need", "needs"], ["know", "knows"], ["think", "thinks"],
  ["see", "sees"], ["come", "comes"], ["look", "looks"], ["get", "gets"], ["make", "makes"], ["take", "takes"],
  ["say", "says"], ["work", "works"], ["call", "calls"], ["ask", "asks"], ["feel", "feels"], ["seem", "seems"],
  ["help", "helps"], ["show", "shows"], ["hear", "hears"], ["play", "plays"], ["run", "runs"], ["move", "moves"],
  ["live", "lives"], ["believe", "believes"], ["leave", "leaves"], ["keep", "keeps"], ["begin", "begins"],
  ["write", "writes"], ["sit", "sits"], ["stand", "stands"], ["lose", "loses"], ["pay", "pays"], ["meet", "meets"],
  ["learn", "learns"], ["change", "changes"], ["lead", "leads"], ["understand", "understands"], ["follow", "follows"],
  ["stop", "stops"], ["create", "creates"], ["speak", "speaks"], ["read", "reads"], ["spend", "spends"],
  ["grow", "grows"], ["open", "opens"], ["walk", "walks"], ["win", "wins"], ["teach", "teaches"], ["offer", "offers"],
  ["remember", "remembers"], ["love", "loves"], ["consider", "considers"], ["appear", "appears"], ["buy", "buys"],
  ["wait", "waits"], ["serve", "serves"], ["send", "sends"], ["expect", "expects"], ["stay", "stays"],
  ["fall", "falls"], ["reach", "reaches"], ["remain", "remains"], ["suggest", "suggests"], ["pass", "passes"],
  ["sell", "sells"], ["decide", "decides"], ["pull", "pulls"], ["carry", "carries"], ["hope", "hopes"],
  ["wish", "wishes"], ["rain", "rains"], ["notice", "notices"], ["pray", "prays"], ["preach", "preaches"], ["answer", "answers"],
  ["talk", "talks"], ["turn", "turns"], ["start", "starts"], ["use", "uses"], ["plan", "plans"], ["miss", "misses"],
  ["enjoy", "enjoys"], ["include", "includes"], ["continue", "continues"], ["happen", "happens"], ["mean", "means"],
  ["become", "becomes"], ["bring", "brings"], ["give", "gives"], ["find", "finds"], ["tell", "tells"],
  ["let", "lets"], ["put", "puts"], ["set", "sets"], ["hold", "holds"], ["bring", "brings"], ["build", "builds"],
  ["eat", "eats"], ["drink", "drinks"], ["sleep", "sleeps"], ["wake", "wakes"], ["drive", "drives"],
  ["sing", "sings"], ["draw", "draws"], ["fly", "flies"], ["worry", "worries"], ["hurry", "hurries"],
  ["apply", "applies"], ["cry", "cries"], ["finish", "finishes"], ["fix", "fixes"], ["push", "pushes"],
  ["wash", "washes"], ["catch", "catches"], ["teach", "teaches"], ["touch", "touches"], ["match", "matches"],
  ["agree", "agrees"], ["belong", "belongs"], ["care", "cares"], ["sound", "sounds"], ["matter", "matters"],
  ["forget", "forgets"], ["remember", "remembers"], ["bring", "brings"], ["announce", "announces"],
  ["reply", "replies"], ["arrive", "arrives"], ["rest", "rests"], ["ship", "ships"], ["use", "uses"]
];

const BASE_OF = new Map();
const THIRD_OF = new Map();
VERBS.forEach(function (pair) {
  BASE_OF.set(pair[0], pair[0]);
  THIRD_OF.set(pair[1], pair[0]);
  BASE_OF.set(pair[1], pair[0]);
});

const INVARIANT_VERBS = new Set("read put set let cut hit cost spread shut hurt quit".split(" "));
const BE_BASE = new Map([["is", "are"], ["am", "are"], ["was", "were"]]);
const BE_I = new Map([["is", "am"], ["are", "am"]]);

function matchCase(source, target) {
  if (source === source.toLocaleUpperCase() && source !== source.toLocaleLowerCase()) return target.toLocaleUpperCase();
  if (source[0] && source[0] === source[0].toLocaleUpperCase() && source[0] !== source[0].toLocaleLowerCase()) {
    return target[0].toLocaleUpperCase() + target.slice(1);
  }
  return target;
}

function tokenize(text) {
  return Array.from(String(text || "").matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[.!?]/gu), function (match) {
    return { text: match[0], lower: match[0].toLocaleLowerCase(), start: match.index, end: match.index + match[0].length };
  });
}

function overlaps(start, end, ranges) {
  return (ranges || []).some(function (range) { return start < range.end && range.start < end; });
}

function isModifier(token) {
  if (!token) return false;
  if (MODIFIERS.has(token.lower) || ADVERBS.has(token.lower)) return true;
  return /(?:ful|ous|ive|less|able|ible|ish|ent|ant|ly)$/u.test(token.lower);
}

function joinedToNumber(source, token) {
  if (!source || !token) return false;
  const prev = token.start > 0 ? source[token.start - 1] : "";
  const next = source[token.end] || "";
  if (prev === ":" || prev === "." || prev === "-" || prev === "/" || prev === "–" || prev === "—") return true;
  if (next === ":" || next === "." || next === "-" || next === "/" || next === "–" || next === "—") return true;
  return /^(?:am|pm)\b/iu.test(source.slice(token.end));
}

function isQuantifier(token, source) {
  if (!token) return false;
  if (QUANTIFIERS.has(token.lower)) return true;
  if (!/^\d+$/u.test(token.lower) || Number(token.lower) < 2 || Number(token.lower) >= 10000) return false;
  if (joinedToNumber(source, token)) return false;
  return true;
}

function capitalized(token) {
  return token.text[0] !== token.text[0].toLocaleLowerCase() && token.text[0] === token.text[0].toLocaleUpperCase();
}

function regularPlural(word) {
  if (/[^aeiou]y$/u.test(word)) return word.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/u.test(word)) return word + "es";
  return word + "s";
}

function pluralOf(word, lexicon) {
  const lower = word.toLocaleLowerCase();
  if (!lower || lower.indexOf("'") >= 0 || lower.indexOf("’") >= 0) return null;
  if (BOOKS.has(lower)) return null;
  if (IRREGULAR_PLURAL[lower]) return IRREGULAR_PLURAL[lower];
  const dict = lexicon || builtinLexicon;
  const knownCount = Boolean(dict.has && dict.has(lower) && COUNT_WITHOUT_FLAG.has(lower));
  if (!dict.allowsPlural(lower) && !knownCount) return null;
  return regularPlural(lower);
}

function safeFollower(token) {
  if (!token) return true;
  if (/^[.!?]$/u.test(token.text)) return true;
  return SAFE_FOLLOWERS.has(token.lower);
}

function agreementSpan(start, end, replacement, ruleId, patternText, message) {
  return {
    start: start,
    end: end,
    replacement: replacement,
    kind: "grammar",
    ruleId: ruleId,
    transformClass: ruleId,
    patternText: patternText,
    message: message
  };
}

function pluralSpans(tokens, ranges, lexicon, source) {
  const spans = [];
  tokens.forEach(function (token, index) {
    if (!isQuantifier(token, source)) return;
    let cursor = index + 1;
    let modifiers = 0;
    while (cursor < tokens.length && modifiers < 3 && isModifier(tokens[cursor]) && !isQuantifier(tokens[cursor])) {
      const next = tokens[cursor + 1];
      if (!next || /^[.!?]$/u.test(next.text) || (safeFollower(next) && !isModifier(next))) break;
      cursor += 1;
      modifiers += 1;
    }
    const head = tokens[cursor];
    if (!head || /^[.!?]$/u.test(head.text)) return;
    if (!safeFollower(tokens[cursor + 1])) return;
    if (head.text.indexOf("'") >= 0 || head.text.indexOf("’") >= 0) return;
    if (capitalized(head)) return;
    if (overlaps(head.start, head.end, ranges)) return;
    const plural = pluralOf(head.text, lexicon);
    if (!plural || plural === head.lower) return;
    const replacement = matchCase(head.text, plural);
    if (replacement === head.text) return;
    spans.push(agreementSpan(head.start, head.end, replacement, "agreement-plural", token.lower + " " + head.lower, "Plural agreement"));
  });
  return spans;
}

function thirdForm(lemma) {
  const pair = VERBS.find(function (entry) { return entry[0] === lemma; });
  return pair ? pair[1] : null;
}

function verbReplacement(subject, verb) {
  const person = subject.toLocaleLowerCase();
  const lower = verb.toLocaleLowerCase();
  if (THIRD.has(person)) {
    if (lower === "are") return "is";
    if (lower === "dont" || lower === "don't") return "doesn't";
    if (lower === "wasnt" || lower === "wasn't") return "wasn't";
    if (INVARIANT_VERBS.has(lower)) return null;
    if (BASE_OF.get(lower) === lower && !THIRD_OF.has(lower)) return thirdForm(lower);
    return null;
  }
  if (person === "i" && (lower === "wasnt" || lower === "wasn't")) return null;
  if ((person === "we" || person === "you" || person === "they") && (lower === "wasnt" || lower === "wasn't")) return "weren't";
  if (BASE_SUBJECTS.has(person) && (lower === "isnt" || lower === "isn't")) return "aren't";
  if (BASE_SUBJECTS.has(person) && (lower === "doesnt" || lower === "doesn't")) return "don't";
  if (person === "i" && BE_I.has(lower)) return BE_I.get(lower);
  if (person !== "i" && BASE_SUBJECTS.has(person) && BE_BASE.has(lower)) return BE_BASE.get(lower);
  if (BASE_SUBJECTS.has(person) && THIRD_OF.has(lower)) return THIRD_OF.get(lower);
  return null;
}

function previousVerb(token) {
  if (!token) return false;
  if (PREVIOUS_BLOCK.has(token.lower) || BASE_OF.has(token.lower)) return true;
  if (/(?:ed|ied)$/u.test(token.lower)) return true;
  return /^(?:said|told|made|saw|heard|went|came|got|found|left|asked|watched|helped)$/u.test(token.lower);
}

function verbSpans(tokens, ranges) {
  const spans = [];
  tokens.forEach(function (token, index) {
    const person = token.lower;
    if (!THIRD.has(person) && !BASE_SUBJECTS.has(person)) return;
    const previous = index > 0 ? tokens[index - 1] : null;
    if (previousVerb(previous)) return;
    if (previous && (previous.lower === "that" || previous.lower === "lest")) return;
    let cursor = index + 1;
    if (cursor < tokens.length && ADVERBS.has(tokens[cursor].lower)) cursor += 1;
    const verb = tokens[cursor];
    if (!verb || /^[.!?]$/u.test(verb.text)) return;
    if (overlaps(verb.start, verb.end, ranges)) return;
    if (capitalized(verb) && person !== "i") return;
    const next = verbReplacement(person, verb.text);
    if (!next) return;
    const replacement = matchCase(verb.text, next);
    if (replacement === verb.text) return;
    spans.push(agreementSpan(verb.start, verb.end, replacement, "agreement-verb", person + " " + verb.lower, "Subject-verb agreement"));
  });
  return spans;
}

function usageSpans(text, ranges) {
  const source = String(text || "");
  const spans = [];
  const its = /\b(its)\s+(a|an|the)\b/giu;
  let match;
  while ((match = its.exec(source))) {
    if (overlaps(match.index, match.index + match[1].length, ranges)) continue;
    const replacement = matchCase(match[1], "it's");
    spans.push(agreementSpan(match.index, match.index + match[1].length, replacement, "usage-its", match[1].toLocaleLowerCase() + " " + match[2].toLocaleLowerCase(), "Contraction"));
  }
  const predicative = "(?:fine|good|bad|ok|okay|ready|mine|true|right|wrong|late|early|done|over|clear|possible|enough|better|hard|easy|happy|glad|sure|tired|sorry|gone|updated|finished|complete|closed|fixed|broken)";
  const itsPredicative = new RegExp("\\b(its)\\s+(?:not\\s+)?" + predicative + "(?=\\s*[.!,]|$)", "giu");
  while ((match = itsPredicative.exec(source))) {
    if (overlaps(match.index, match.index + match[1].length, ranges)) continue;
    spans.push(agreementSpan(match.index, match.index + match[1].length, matchCase(match[1], "it's"), "usage-its", "its " + match[0].split(/\s+/u).pop().toLocaleLowerCase(), "Contraction"));
  }
  const welcome = /\b(your)\s+welcome(?=\s+to\b|\s*[.!,]|$)/giu;
  while ((match = welcome.exec(source))) {
    if (overlaps(match.index, match.index + match[1].length, ranges)) continue;
    spans.push(agreementSpan(match.index, match.index + match[1].length, matchCase(match[1], "you're"), "usage-youre", "your welcome", "Contraction"));
  }
  const been = /\b(its)\s+(been|got)\b/giu;
  while ((match = been.exec(source))) {
    if (overlaps(match.index, match.index + match[1].length, ranges)) continue;
    spans.push(agreementSpan(match.index, match.index + match[1].length, matchCase(match[1], "it's"), "usage-its", "its " + match[2].toLocaleLowerCase(), "Contraction"));
  }
  const going = /\b(their|there)\s+(?:going|planning|coming|bringing|making|trying|looking|working|getting|having|doing|leaving|taking|running|starting|waiting|hoping|asking)\b/giu;
  while ((match = going.exec(source))) {
    if (overlaps(match.index, match.index + match[1].length, ranges)) continue;
    const before = source.slice(0, match.index);
    if (before.trim() && !/[.!?]\s*$/u.test(before)) continue;
    const after = source.slice(match.index + match[0].length);
    const gerund = match[0].split(/\s+/u).pop().toLocaleLowerCase();
    if (gerund === "going" && !/^\s+to\b/iu.test(after)) continue;
    if (/\b(?:am|is|are|was|were|be|been|being|seem|seems|seemed|matter|matters|mattered|mean|means|meant|help|helps|helped|make|makes|made|take|takes|took|has|have|had|do|does|did)\b/iu.test(after)) continue;
    spans.push(agreementSpan(match.index, match.index + match[1].length, matchCase(match[1], "they're"), "usage-theyre", match[1].toLocaleLowerCase() + " " + gerund, "Contraction"));
  }
  const theyPredicative = new RegExp("\\b(their|there)\\s+" + predicative + "(?=\\s*[.!]|$)", "giu");
  while ((match = theyPredicative.exec(source))) {
    if (overlaps(match.index, match.index + match[1].length, ranges)) continue;
    const before = source.slice(0, match.index);
    if (before.trim() && !/[.!?]\s*$/u.test(before)) continue;
    spans.push(agreementSpan(match.index, match.index + match[1].length, matchCase(match[1], "they're"), "usage-theyre", match[1].toLocaleLowerCase() + " " + match[0].split(/\s+/u).pop().toLocaleLowerCase(), "Contraction"));
  }
  return spans;
}

function agreementSpans(text, ranges, lexicon) {
  const tokens = tokenize(text);
  return pluralSpans(tokens, ranges, lexicon, text).concat(verbSpans(tokens, ranges)).concat(usageSpans(text, ranges));
}

function baseOfThird(word) {
  return THIRD_OF.get(String(word || "").toLocaleLowerCase()) || null;
}

function thirdOfBase(word) {
  return thirdForm(String(word || "").toLocaleLowerCase());
}

export { agreementSpans, baseOfThird, pluralOf, thirdOfBase, usageSpans, verbReplacement };
