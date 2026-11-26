// Precise, local fixes for errors the models both miss and over-flag.
// A rule here has to be narrow enough that correct prose does not match it.

import { baseOfThird, thirdOfBase } from "./proofreading-agreement.mjs";
import { NO_PLURAL } from "./proofreading-lexicon.mjs";

const TYPOS = new Map([
  ["recieve", "receive"], ["recieved", "received"], ["recieving", "receiving"],
  ["seperate", "separate"], ["seperated", "separated"], ["seperately", "separately"],
  ["untill", "until"], ["tomorow", "tomorrow"], ["tommorow", "tomorrow"], ["tommorrow", "tomorrow"],
  ["accomodate", "accommodate"], ["accomodating", "accommodating"], ["accomodation", "accommodation"],
  ["wich", "which"], ["nite", "night"], ["definately", "definitely"],
  ["occured", "occurred"], ["occurence", "occurrence"], ["occuring", "occurring"],
  ["goverment", "government"], ["enviroment", "environment"], ["becuase", "because"],
  ["teh", "the"], ["adn", "and"], ["alot", "a lot"], ["begining", "beginning"],
  ["occassion", "occasion"], ["necesary", "necessary"], ["neccessary", "necessary"],
  ["independant", "independent"], ["existance", "existence"], ["comming", "coming"],
  ["thier", "their"], ["freind", "friend"], ["beleive", "believe"],
  ["acheive", "achieve"], ["acheived", "achieved"], ["mispell", "misspell"],
  ["adress", "address"], ["succesful", "successful"], ["publically", "publicly"]
]);

const VARIANT_OK = new Set(("cancelled cancelling travelled travelling labelled labelling modelled modelling " +
  "worshipped worshipping judgement judgements acknowledgement ageing colourful favourite honour colour favour " +
  "labour neighbour neighbourhood centre metre litre theatre fibre grey programme catalogue dialogue analogue " +
  "defence offence licence practise cheque tyre aluminium fulfil wilful towards maths storey kerb plough sceptic " +
  "flavour flavor flyer flier ok okay").split(/\s+/u));

const MASS = new Set("information furniture advice luggage equipment homework research knowledge traffic weather money rice bread milk water air music news mathematics physics politics economics ethics linguistics".split(" "));
const MASS_PLURAL = new Map([
  ["informations", "information"], ["furnitures", "furniture"], ["advices", "advice"], ["luggages", "luggage"],
  ["equipments", "equipment"], ["homeworks", "homework"], ["researches", "research"]
]);
const COLLECTIVE = new Set("team family committee staff group choir congregation class crew jury band audience crowd government company club public".split(" "));
const IRREGULAR_PLURAL = new Set("children people men women mice geese teeth feet oxen".split(" "));
const PREPOSITIONS = new Set("of in on for to with at from by about into over after before as through between under without within across around among against toward towards via per like than".split(" "));
const FUNCTION_WORDS = new Set("a an the to of in on for and or but is are was were be been being do does did have has had that this these those it its as at by with from if so than then too very can could will would should may might must".split(" "));
const FREQUENCY = new Set("always usually often never sometimes generally typically normally rarely seldom every each".split(" "));
const PAST_CUE = new Set("yesterday ago earlier last previously once".split(" "));
const MOTION = new Set("walked ran drove went moved strolled hurried rushed flew rode biked jogged marched traveled travelled came slipped crawled hiked".split(" "));
const PAST_TO_BASE = new Map([
  ["went", "go"], ["saw", "see"], ["came", "come"], ["gave", "give"], ["took", "take"], ["wrote", "write"],
  ["ate", "eat"], ["ran", "run"], ["bought", "buy"], ["thought", "think"], ["brought", "bring"], ["seen", "see"],
  ["done", "do"], ["gone", "go"], ["spoke", "speak"], ["drank", "drink"], ["drove", "drive"], ["fell", "fall"],
  ["felt", "feel"], ["found", "find"], ["got", "get"], ["knew", "know"], ["left", "leave"], ["made", "make"],
  ["said", "say"], ["told", "tell"], ["paid", "pay"], ["met", "meet"], ["sat", "sit"], ["stood", "stand"]
]);
const BASE_TO_PAST = new Map([["go", "went"], ["come", "came"], ["see", "saw"], ["buy", "bought"], ["eat", "ate"], ["take", "took"], ["give", "gave"]]);
const INVARIANT_THIRD = new Map([["read", "reads"], ["put", "puts"], ["set", "sets"], ["let", "lets"], ["cut", "cuts"], ["hit", "hits"], ["cost", "costs"], ["spread", "spreads"], ["shut", "shuts"], ["hurt", "hurts"], ["quit", "quits"]]);
const BE_PLURAL = new Map([["is", "are"], ["was", "were"], ["has", "have"], ["does", "do"]]);
const BE_SINGULAR = new Map([["are", "is"], ["have", "has"], ["do", "does"]]);
const DETERMINERS = new Set("the a an this that my your his her our their its".split(" "));
const PRONOUNS = new Set("i you he she it we they".split(" "));
const SKIP_AFTER_ITS = new Set("been got getting going time way life turn kind sort bit lot one fine good bad ok okay ready mine true right wrong late early done over clear possible enough better hard easy happy glad sure tired sorry gone updated finished complete closed fixed broken a an the not just also really very so too working trying going coming".split(" "));

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

function span(start, end, replacement, ruleId, patternText, message) {
  return {
    start: start,
    end: end,
    replacement: replacement,
    kind: "grammar",
    ruleId: ruleId,
    transformClass: ruleId,
    patternText: patternText,
    message: message,
    trusted: true,
    priority: 60
  };
}

function skeleton(word) {
  return String(word || "").toLocaleLowerCase()
    .replace(/ph/g, "f")
    .replace(/gh/g, "")
    .replace(/kn/g, "n")
    .replace(/wr/g, "r")
    .replace(/wh/g, "w")
    .replace(/[aeiouy]/g, "");
}

function levenshtein(left, right) {
  const a = String(left);
  const b = String(right);
  if (a === b) return 0;
  const row = new Uint16Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) row[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = current;
    }
  }
  return row[b.length];
}

function numberOf(word, lexicon) {
  const lower = String(word || "").toLocaleLowerCase();
  if (!lower || !lexicon || !lexicon.has) return null;
  if (MASS.has(lower) || NO_PLURAL.has(lower) || COLLECTIVE.has(lower)) return "mass";
  if (IRREGULAR_PLURAL.has(lower)) return "plural";
  if (lower.endsWith("ies")) {
    const stem = lower.slice(0, -3) + "y";
    if (lexicon.has(stem) && lexicon.allowsPlural(stem)) return "plural";
  }
  if (/(?:s|x|z|ch|sh)es$/u.test(lower) || /[^aeiou]es$/u.test(lower)) {
    const stem = lower.endsWith("es") ? lower.slice(0, -2) : lower;
    if (lexicon.has(stem) && lexicon.allowsPlural(stem)) return "plural";
  }
  if (lower.endsWith("s") && !lower.endsWith("ss")) {
    const stem = lower.slice(0, -1);
    if (lexicon.has(stem) && lexicon.allowsPlural(stem)) return "plural";
  }
  if (lexicon.has(lower)) return "singular";
  return null;
}

function dictionaryWord(word, lexicon) {
  const lower = String(word || "").toLocaleLowerCase();
  if (!lower || !lexicon || !lexicon.has) return false;
  if (lexicon.has(lower)) return true;
  if (lower.endsWith("ies") && lexicon.has(lower.slice(0, -3) + "y")) return true;
  if (lower.endsWith("es") && lexicon.has(lower.slice(0, -2))) return true;
  if (lower.endsWith("s") && !lower.endsWith("ss") && lexicon.has(lower.slice(0, -1))) return true;
  return false;
}

function dropsDoubledConsonant(from, to) {
  const left = String(from || "").toLocaleLowerCase();
  const right = String(to || "").toLocaleLowerCase();
  if (right.length !== left.length - 1) return false;
  for (let index = 0; index < left.length - 1; index += 1) {
    if (left[index] !== left[index + 1] || !/[bcdfghjklmnpqrstvwxyz]/u.test(left[index])) continue;
    if (left.slice(0, index) + left.slice(index + 1) === right) return true;
  }
  return false;
}

function chooseSpelling(source, candidates, lexicon) {
  const from = String(source || "").toLocaleLowerCase();
  if (!from) return null;
  if (VARIANT_OK.has(from)) return null;
  if (TYPOS.has(from)) return TYPOS.get(from);
  if ((Array.isArray(candidates) ? candidates : []).some(function (word) { return String(word || "").toLocaleLowerCase() === from; })) return null;
  if (dictionaryWord(from, lexicon)) return null;
  const ranked = (Array.isArray(candidates) ? candidates : []).map(function (word) {
    const lower = String(word || "").toLocaleLowerCase();
    return {
      word: word,
      lower: lower,
      distance: levenshtein(from, lower),
      sameSound: skeleton(from).length > 0 && skeleton(from) === skeleton(lower)
    };
  }).filter(function (item) {
    return item.lower && item.lower !== from && !dropsDoubledConsonant(from, item.lower);
  });
  ranked.sort(function (left, right) {
    if (left.sameSound !== right.sameSound) return left.sameSound ? -1 : 1;
    return left.distance - right.distance;
  });
  const best = ranked[0];
  if (!best) return null;
  if (lexicon && lexicon.has && lexicon.has(from)) return null;
  if (best.distance > 2 && !best.sameSound) return null;
  if (best.distance > 3) return null;
  return best.lower;
}

function typoSpans(text, ranges) {
  const spans = [];
  const pattern = /\b[\p{L}']+\b/gu;
  let match;
  while ((match = pattern.exec(String(text || "")))) {
    const lower = match[0].toLocaleLowerCase();
    const replacement = TYPOS.get(lower);
    if (!replacement || overlaps(match.index, match.index + match[0].length, ranges)) continue;
    const shown = replacement === "a lot" ? "a lot" : matchCase(match[0], replacement);
    if (shown === match[0]) continue;
    spans.push(span(match.index, match.index + match[0].length, shown, "spelling-typo", lower, "Spelling"));
  }
  return spans;
}

function massSpans(text, ranges) {
  const source = String(text || "");
  const tokens = tokenize(source);
  const spans = [];
  tokens.forEach(function (token, index) {
    const plural = MASS_PLURAL.get(token.lower);
    if (plural && index > 0 && /^(?:many|several|two|three|four|five|six|seven|eight|nine|ten|\d+)$/u.test(tokens[index - 1].lower)) {
      if (!overlaps(token.start, token.end, ranges)) {
        spans.push(span(token.start, token.end, matchCase(token.text, plural), "agreement-mass", tokens[index - 1].lower + " " + token.lower, "Mass noun"));
      }
    }
    if ((token.lower === "many" || token.lower === "several") && tokens[index + 1] && MASS.has(tokens[index + 1].lower) && tokens[index + 1].lower !== "a") {
      if (token.lower === "many" && !overlaps(token.start, token.end, ranges)) {
        spans.push(span(token.start, token.end, matchCase(token.text, "much"), "agreement-mass", "many " + tokens[index + 1].lower, "Mass noun"));
      }
    }
  });
  return spans;
}

function homophoneSpans(text, ranges, lexicon) {
  const source = String(text || "");
  const spans = [];
  function add(match, word, replacement, ruleId, patternText) {
    if (!match || overlaps(match.index, match.index + word.length, ranges)) return;
    const shown = matchCase(word, replacement);
    if (shown === word) return;
    spans.push(span(match.index, match.index + word.length, shown, ruleId, patternText, "Word choice"));
  }
  let match;
  const than = /\b(stronger|weaker|better|worse|older|younger|bigger|smaller|higher|lower|longer|shorter|faster|slower|harder|easier|more|less|rather|other)\s+(then)\b/giu;
  while ((match = than.exec(source))) add({ index: match.index + match[0].length - match[2].length }, match[2], "than", "usage-than", match[1].toLocaleLowerCase() + " then");
  const effect = /\b(?:will|would|can|could|may|might|to)\s+(effect)\s+(our|your|my|their|his|her|the|its)\s+(?!change\b|reform\b|policy\b|transformation\b)/giu;
  while ((match = effect.exec(source))) add({ index: match.index + match[0].indexOf(match[1]) }, match[1], "affect", "usage-affect", "effect " + match[2].toLocaleLowerCase());
  const loose = /\b(loose)\s+(your|my|his|her|their|our)\b/giu;
  while ((match = loose.exec(source))) add(match, match[1], "lose", "usage-lose", "loose " + match[2].toLocaleLowerCase());
  const too = /\b(too)\s+(the|a|an)\b/giu;
  while ((match = too.exec(source))) add(match, match[1], "to", "usage-to", "too " + match[2].toLocaleLowerCase());
  const passed = /\b(walked|ran|drove|went|moved|strolled|hurried|rushed|flew|rode|jogged|marched|traveled|travelled|hiked)\s+(passed)\s+(the|a|an|my|your|his|her|our|their)\b/giu;
  while ((match = passed.exec(source))) {
    if (!MOTION.has(match[1].toLocaleLowerCase())) continue;
    const start = match.index + match[0].lastIndexOf(match[2]);
    add({ index: start }, match[2], "past", "usage-past", match[1].toLocaleLowerCase() + " passed");
  }
  const ofHave = /\b(could|should|would|might|must)\s+(of)\s+(sworn|been|gone|done|had|known|seen|taken|come|gotten|said|thought|made|left|called|asked)\b/giu;
  while ((match = ofHave.exec(source))) {
    const start = match.index + match[1].length + 1;
    add({ index: start }, match[2], "have", "usage-have", match[1].toLocaleLowerCase() + " of");
  }
  const whose = /(^|[.!?]\s+)(whose)\s+(going|coming)\b/giu;
  while ((match = whose.exec(source))) {
    const start = match.index + match[1].length;
    add({ index: start }, match[2], "who's", "usage-whose", "whose " + match[3].toLocaleLowerCase());
  }
  const yourNoun = /\b(youre|you're|You’re)\s+([\p{L}]+)\s+(is|are|was|were)\b/giu;
  while ((match = yourNoun.exec(source))) {
    const noun = match[2].toLocaleLowerCase();
    if (noun === "welcome" || noun === "right" || noun === "going" || noun === "ready") continue;
    const kind = numberOf(noun, lexicon);
    if (kind !== "singular" && kind !== "plural") continue;
    add(match, match[1], "your", "usage-your", match[1].toLocaleLowerCase() + " " + noun);
  }
  const theyNoun = /\b(theyre|they're|They’re)\s+([\p{L}]+)(?=\s+([\p{L}]+|[.!?])|\s*$)/giu;
  while ((match = theyNoun.exec(source))) {
    const noun = match[2].toLocaleLowerCase();
    if (baseOfThird(noun) || thirdOfBase(noun) || /ing$/u.test(noun)) continue;
    if (numberOf(noun, lexicon) !== "singular") continue;
    const after = match[3] ? match[3].toLocaleLowerCase() : "";
    if (after && !/(?:ed|ied)$/u.test(after) && !/^(?:is|are|was|were|has|have|had|barks|barked|bark)$/u.test(after) && after !== ".") continue;
    add(match, match[1], "their", "usage-their", match[1].toLocaleLowerCase() + " " + noun);
  }
  const itsNoun = /(^|[\s])(it's|it’s)\s+([\p{L}]+)/giu;
  while ((match = itsNoun.exec(source))) {
    const start = match.index + match[1].length;
    if (start === 0 || /[.!?]\s*$/u.test(source.slice(0, start))) continue;
    const noun = match[3].toLocaleLowerCase();
    if (SKIP_AFTER_ITS.has(noun) || baseOfThird(noun) || thirdOfBase(noun) || /ing$/u.test(noun)) continue;
    if (numberOf(noun, lexicon) !== "singular" && numberOf(noun, lexicon) !== "plural") continue;
    add({ index: start }, match[2], "its", "usage-its-possessive", "it's " + noun);
  }
  return spans;
}

const NOT_A_NAME = new Set("the a an this that these those there here please thanks thank dear hi hey ok okay dont what why how when where who which we you they he she it i and or but if as to for of in on at by from with our my your their its his her ive im lets".split(" "));
const VERB_NEXT = new Set("a an the this that these those my your his her our their its one two three four five six seven eight nine ten to in on at for with from into through about of".split(" "));
const INVARIANT_BASE = new Set("read put set let cut hit cost spread shut hurt quit".split(" "));

function isCapital(token) {
  if (!token || /^[.!?]$/u.test(token.text)) return false;
  const first = token.text[0];
  return first === first.toLocaleUpperCase() && first !== first.toLocaleLowerCase();
}

function verbFollows(token) {
  if (!token || /^[.!?]$/u.test(token.text)) return false;
  if (/^\d+$/u.test(token.lower)) return true;
  return VERB_NEXT.has(token.lower);
}

function nounVerbSpans(tokens, ranges, lexicon) {
  const spans = [];
  function push(token, replacement, patternText) {
    if (!token || overlaps(token.start, token.end, ranges)) return;
    const shown = matchCase(token.text, replacement);
    if (!shown || shown === token.text) return;
    spans.push(span(token.start, token.end, shown, "agreement-verb", patternText, "Subject-verb agreement"));
  }
  tokens.forEach(function (token, index) {
    const next = tokens[index + 1];
    const third = tokens[index + 2];
    if (token.lower === "does" && next && third && /^(?:he|she|it)$/u.test(next.lower)) {
      const base = baseOfThird(third.lower);
      if (base) push(third, base, "does " + next.lower + " " + third.lower);
    }
    if ((token.lower === "did" || token.lower === "didn't" || token.lower === "didnt") && next && third && (PRONOUNS.has(next.lower) || isCapital(next))) {
      const base = PAST_TO_BASE.get(third.lower);
      if (base) push(third, base, token.lower + " " + next.lower + " " + third.lower);
    }
    if (token.lower === "and" && isCapital(tokens[index - 1]) && isCapital(next) && third && (third.lower === "is" || third.lower === "was")) {
      push(third, third.lower === "is" ? "are" : "were", next.lower + " " + third.lower);
    }
    if (isCapital(token) && !NOT_A_NAME.has(token.lower) && !token.lower.endsWith("s") && next) {
      if ((next.lower === "dont" || next.lower === "don't")) push(next, "doesn't", token.lower + " dont");
      else if (next.lower === "have" && verbFollows(third)) push(next, "has", token.lower + " have");
      else if (!INVARIANT_BASE.has(next.lower) && verbFollows(third)) {
        const form = thirdOfBase(next.lower);
        if (form && !baseOfThird(next.lower)) push(next, form, token.lower + " " + next.lower);
      }
    }
    const counted = /^(?:several|many|two|three|four|five|six|seven|eight|nine|ten)$/u.test(token.lower);
    if (counted && next && third && !MASS.has(next.lower)) {
      const count = numberOf(next.lower, lexicon);
      if (count === "singular" || COLLECTIVE.has(next.lower)) {
        const base = baseOfThird(third.lower);
        if (base) push(third, base, token.lower + " " + next.lower + " " + third.lower);
      }
    }
    if (!DETERMINERS.has(token.lower)) return;
    const adjective = new Set("main spare extra final broken big small old new young long short good bad great little large open whole other next red blue green black white".split(" "));
    let cursor = index + 1;
    let modifiers = 0;
    while (cursor < tokens.length && modifiers < 2 && adjective.has(tokens[cursor].lower)) {
      cursor += 1;
      modifiers += 1;
    }
    const noun = tokens[cursor];
    const verb = tokens[cursor + 1];
    if (!noun || !verb || /^[.!?]$/u.test(noun.text) || /^[.!?]$/u.test(verb.text)) return;
    if (PRONOUNS.has(noun.lower) || COLLECTIVE.has(noun.lower) || MASS.has(noun.lower)) return;
    const earlierCount = tokens.slice(0, index).some(function (item) {
      return /^(?:several|many|few|two|three|four|five|six|seven|eight|nine|ten)$/u.test(item.lower);
    });
    const count = numberOf(noun.lower, lexicon);
    if (count === "plural") {
      const pluralFix = BE_PLURAL.get(verb.lower) || baseOfThird(verb.lower);
      if (pluralFix && (BE_PLURAL.has(verb.lower) || baseOfThird(verb.lower))) push(verb, pluralFix, noun.lower + " " + verb.lower);
    } else if (count === "singular") {
      if (verb.lower === "dont" || verb.lower === "don't") push(verb, "doesn't", noun.lower + " dont");
      else if (verb.lower === "are" && earlierCount) return;
      else if (BE_SINGULAR.has(verb.lower) && verb.lower !== "have") push(verb, BE_SINGULAR.get(verb.lower), noun.lower + " " + verb.lower);
      else if (verb.lower === "have" && verbFollows(tokens[cursor + 2])) push(verb, "has", noun.lower + " have");
      else if (!INVARIANT_BASE.has(verb.lower) && verbFollows(tokens[cursor + 2])) {
        const form = thirdOfBase(verb.lower);
        if (form && !baseOfThird(verb.lower)) push(verb, form, noun.lower + " " + verb.lower);
      }
    }
  });
  return spans;
}

function frequencyInvariantSpans(tokens, ranges) {
  const spans = [];
  const past = tokens.some(function (token) { return PAST_CUE.has(token.lower); });
  tokens.forEach(function (token, index) {
    if (!/^(?:he|she|it)$/u.test(token.lower)) return;
    let cursor = index + 1;
    if (cursor < tokens.length && FREQUENCY.has(tokens[cursor].lower)) cursor += 1;
    const verb = tokens[cursor];
    if (!verb) return;
    const third = INVARIANT_THIRD.get(verb.lower);
    if (!third || overlaps(verb.start, verb.end, ranges)) return;
    const before = tokens.slice(0, cursor);
    const frequent = before.some(function (item) { return FREQUENCY.has(item.lower); });
    const pastBefore = before.some(function (item) { return PAST_CUE.has(item.lower); });
    if (!frequent || pastBefore || past) return;
    const shown = matchCase(verb.text, third);
    if (shown === verb.text) return;
    spans.push(span(verb.start, verb.end, shown, "agreement-verb", token.lower + " " + verb.lower, "Subject-verb agreement"));
  });
  return spans;
}

function pastBaseSpans(tokens, ranges) {
  const spans = [];
  tokens.forEach(function (token, index) {
    if (!PAST_CUE.has(token.lower)) return;
    const subject = tokens[index + 1];
    const verb = tokens[index + 2];
    if (!subject || !verb || !PRONOUNS.has(subject.lower)) return;
    const past = BASE_TO_PAST.get(verb.lower);
    if (!past || overlaps(verb.start, verb.end, ranges)) return;
    spans.push(span(verb.start, verb.end, matchCase(verb.text, past), "agreement-verb", token.lower + " " + subject.lower + " " + verb.lower, "Verb tense"));
  });
  return spans;
}

function fixedPhraseSpans(text, ranges) {
  const source = String(text || "");
  const spans = [];
  const suppose = /\b(am|is|are|was|were|be|been)\s+(suppose)\s+to\b/giu;
  const use = /\b(am|is|are|was|were|be|been|get|got|getting)\s+(use)\s+to\b/giu;
  const question = /\b(any)\s+(question)(?=\s*[.?]|$)/giu;
  let match;
  while ((match = suppose.exec(source))) {
    const start = match.index + match[0].lastIndexOf(match[2]);
    if (overlaps(start, start + match[2].length, ranges)) continue;
    spans.push(span(start, start + match[2].length, matchCase(match[2], "supposed"), "usage-supposed", "suppose to", "Verb form"));
  }
  while ((match = use.exec(source))) {
    const start = match.index + match[0].lastIndexOf(match[2]);
    if (overlaps(start, start + match[2].length, ranges)) continue;
    spans.push(span(start, start + match[2].length, matchCase(match[2], "used"), "usage-used", "use to", "Verb form"));
  }
  while ((match = question.exec(source))) {
    const start = match.index + match[0].lastIndexOf(match[2]);
    if (overlaps(start, start + match[2].length, ranges)) continue;
    spans.push(span(start, start + match[2].length, matchCase(match[2], "questions"), "agreement-plural", "any question", "Plural agreement"));
  }
  return spans;
}

function wordTokens(text) {
  return Array.from(String(text || "").matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu), function (match) { return match[0]; });
}

function caseOnly(original, replacement) {
  return String(original || "").toLocaleLowerCase() === String(replacement || "").toLocaleLowerCase() && original !== replacement;
}

function vetoModelSpan(text, spanItem, lexicon) {
  if (!spanItem || spanItem.replacement == null) return false;
  const source = String(text || "");
  const original = source.slice(spanItem.start, spanItem.end);
  const replacement = String(spanItem.replacement);
  const from = original.toLocaleLowerCase();
  const to = replacement.toLocaleLowerCase();
  const before = source.slice(0, spanItem.start);
  const after = source.slice(spanItem.end);
  if (COLLECTIVE.has((before.match(/([\p{L}]+)\s*$/u) || [])[1] || "".toLocaleLowerCase()) && /^(?:is|are|was|were|has|have)$/u.test(from) && /^(?:is|are|was|were|has|have)$/u.test(to)) return true;
  if (MASS.has(from) && to !== from && (to.startsWith(from) || MASS_PLURAL.has(to))) return true;
  if (/^\s+(?:long|tall|wide|high|deep|thick)\b/iu.test(after) && from !== to) return true;
  if (/\b(?:that|lest)\s+(?:he|she|it|i|you|we|they|[A-Z][\p{L}]*)\s+$/u.test(before) && to !== from) return true;
  if (/^(?:they'?re|their|there)\s+$/iu.test(before) && lexicon && numberOf(from, lexicon) === "singular" && numberOf(to, lexicon) === "plural") return true;
  if (/^(?:their|there)$/iu.test(from) && /^they'?re$/iu.test(to) && /^\s+(?:going|planning|coming|bringing|making|trying|looking|working|getting|having|doing)\b[\s\S]*\b(?:is|are|was|were|seems?|seemed|matters?|mattered|means?|meant|helps?|helped|makes?|made|takes?|took|has|have|had|does|did)\b/iu.test(after)) return true;
  return false;
}

function deletesFunctionWord(original, replacement) {
  const from = wordTokens(original).map(function (word) { return word.toLocaleLowerCase(); });
  const to = new Set(wordTokens(replacement).map(function (word) { return word.toLocaleLowerCase(); }));
  return from.some(function (word) {
    return (FUNCTION_WORDS.has(word) || PREPOSITIONS.has(word)) && !to.has(word);
  });
}

function swapsPreposition(original, replacement) {
  const from = wordTokens(original);
  const to = wordTokens(replacement);
  if (from.length !== 1 || to.length !== 1) return false;
  const left = from[0].toLocaleLowerCase();
  const right = to[0].toLocaleLowerCase();
  return left !== right && PREPOSITIONS.has(left) && PREPOSITIONS.has(right);
}

function isReliableSpelling(original, replacement, lexicon) {
  const from = wordTokens(original);
  const to = wordTokens(replacement);
  if (from.length !== 1 || to.length !== 1) return false;
  const left = from[0];
  const right = to[0];
  if (left.toLocaleLowerCase() === right.toLocaleLowerCase()) return false;
  if (VARIANT_OK.has(left.toLocaleLowerCase())) return false;
  if (lexicon && lexicon.has && lexicon.has(left) && !TYPOS.has(left.toLocaleLowerCase())) return false;
  const chosen = chooseSpelling(left, [right], lexicon);
  return Boolean(chosen && chosen.toLocaleLowerCase() === right.toLocaleLowerCase());
}

function hasAgreement(spanItem, others, rulesOnly) {
  const replacement = String(spanItem.replacement || "").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
  return (others || []).some(function (other) {
    if (!other || other === spanItem || other.detectOnly || other.replacement == null) return false;
    if (rulesOnly && !other.trusted) return false;
    if (spanItem.start >= other.end || other.start >= spanItem.end) return false;
    return String(other.replacement).replace(/\s+/gu, " ").trim().toLocaleLowerCase() === replacement;
  });
}

function keepModelSpan(text, spanItem, lexicon, others, options) {
  if (!spanItem || spanItem.detectOnly || spanItem.replacement == null) return false;
  if (vetoModelSpan(text, spanItem, lexicon)) return false;
  const original = String(text || "").slice(spanItem.start, spanItem.end);
  const replacement = String(spanItem.replacement);
  if (caseOnly(original, replacement)) return Boolean(options && options.allowCapitalization);
  if (wordTokens(original).some(function (word) { return dropsDoubledConsonant(word, replacement); }) && !TYPOS.has(original.toLocaleLowerCase())) return false;
  if (isReliableSpelling(original, replacement, lexicon)) return true;
  const known = wordTokens(original).length > 0 && wordTokens(original).every(function (word) { return dictionaryWord(word, lexicon); });
  if (known) return hasAgreement(spanItem, others, true);
  const agreed = hasAgreement(spanItem, others, false);
  if (deletesFunctionWord(original, replacement) && !agreed) return false;
  if (swapsPreposition(original, replacement) && !agreed) return false;
  return agreed;
}

function precisionSpans(text, ranges, lexicon) {
  const tokens = tokenize(text);
  return typoSpans(text, ranges)
    .concat(massSpans(text, ranges))
    .concat(homophoneSpans(text, ranges, lexicon))
    .concat(nounVerbSpans(tokens, ranges, lexicon))
    .concat(frequencyInvariantSpans(tokens, ranges))
    .concat(pastBaseSpans(tokens, ranges))
    .concat(fixedPhraseSpans(text, ranges));
}

export {
  VARIANT_OK,
  chooseSpelling,
  isReliableSpelling,
  keepModelSpan,
  precisionSpans,
  skeleton,
  vetoModelSpan
};
