// Detect-only underlines for subordinate clauses with no main clause.
// There is no replacement: the note stays as written until the user edits it.
//
// The vendored Harper build exposes linting, not a part-of-speech tagger, so
// this is a conservative clause heuristic: flag only a closed sentence whose
// opener is still missing a main-clause subject and finite verb. A missed
// fragment is preferred to a line under a sentence that already has one.

const STARTERS = ["because", "although", "though", "if", "which", "while", "when", "since", "unless", "until", "whereas", "whether", "whenever", "wherever", "once"];
const PHRASAL = new Set(["since", "until", "when", "once", "while", "before", "after"]);
const STARTER = new RegExp("^\\s*([" + "\"'“”‘’" + "]*)\\b(" + STARTERS.join("|") + ")\\b", "iu");
const CLOSED = /[.!]["'”’)\]]*\s*$/u;
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

const PRONOUNS = new Set("i you he she it we they this that these those there who whoever someone anyone everyone somebody anybody everybody one".split(" "));
const THIRD_PRONOUNS = new Set("he she it this that someone anyone everyone somebody anybody everybody one".split(" "));
const DETERMINERS = new Set("the a an my your his her its our their this that these those some any no every each both few another".split(" "));
const PLURAL_DETERMINERS = new Set("these those few both".split(" "));
const AUX = new Set("am is are was were be been being do does did have has had can could will would shall should may might must dont don't doesnt doesn't didnt didn't isnt isn't arent aren't wasnt wasn't werent weren't hasnt hasn't havent haven't hadnt hadn't wont won't cant can't cannot couldnt couldn't shouldnt shouldn't wouldnt wouldn't mustnt mustn't".split(" "));
const INVERSION = new Set("do does did am is are was were have has had can could will would shall should may might must".split(" "));
const COMPLEMENTIZERS = new Set("that why how whether what who whom whose which when where because if unless while although though since".split(" "));
const COORDINATORS = new Set("and or but nor yet".split(" "));
const PREPOSITIONS = new Set("of in on at to for with from by about into over after before during without within through across around under upon off out up down near like than as per via versus among between against toward towards except plus".split(" "));
const ADVERBS = new Set("not never always really just still already also even only ever soon later now then here there today yesterday tomorrow hard well too very so quite rather almost often again instead perhaps maybe actually suddenly quickly slowly carefully together away back home heavily aloud upstairs downstairs outside inside ahead apart early late soon else therefore however thus hence".split(" "));
const ADJECTIVES = new Set("tired ready possible necessary needed supposed used related concerned interested excited married closed open broken finished done gone given known left able glad happy sad sorry sure other same such more most good bad big small old new young long short high low next last first few many several little own same main real true false full free clear hard soft warm cold dark light quiet slow fast early late right wrong only".split(" "));

const IRREGULAR = {
  be: "am is are was were been",
  have: "has had",
  do: "does did done",
  go: "goes went gone",
  get: "gets got gotten",
  make: "makes made",
  take: "takes took taken",
  come: "comes came",
  see: "sees saw seen",
  know: "knows knew known",
  think: "thinks thought",
  say: "says said",
  tell: "tells told",
  give: "gives gave given",
  find: "finds found",
  leave: "leaves left",
  keep: "keeps kept",
  feel: "feels felt",
  become: "becomes became",
  begin: "begins began begun",
  run: "runs ran",
  sit: "sits sat",
  stand: "stands stood",
  grow: "grows grew grown",
  mean: "means meant",
  meet: "meets met",
  pay: "pays paid",
  hear: "hears heard",
  bring: "brings brought",
  buy: "buys bought",
  catch: "catches caught",
  teach: "teaches taught",
  seek: "seeks sought",
  fight: "fights fought",
  build: "builds built",
  send: "sends sent",
  spend: "spends spent",
  hold: "holds held",
  lead: "leads led",
  speak: "speaks spoke spoken",
  write: "writes wrote written",
  break: "breaks broke broken",
  choose: "chooses chose chosen",
  drive: "drives drove driven",
  eat: "eats ate eaten",
  fall: "falls fell fallen",
  fly: "flies flew flown",
  forget: "forgets forgot forgotten",
  hide: "hides hid hidden",
  ride: "rides rode ridden",
  rise: "rises rose risen",
  sing: "sings sang sung",
  sink: "sinks sank sunk",
  sleep: "sleeps slept",
  steal: "steals stole stolen",
  swim: "swims swam swum",
  throw: "throws threw thrown",
  wake: "wakes woke woken",
  wear: "wears wore worn",
  win: "wins won",
  understand: "understands understood",
  lose: "loses lost",
  sell: "sells sold",
  feed: "feeds fed",
  feel: "feels felt",
  draw: "draws drew drawn",
  show: "shows showed shown",
  read: "reads",
  cut: "cuts",
  put: "puts",
  let: "lets",
  set: "sets",
  hit: "hits",
  shut: "shuts",
  cost: "costs",
  hurt: "hurts",
  spread: "spreads",
  quit: "quits"
};

const REGULAR = "stay rain try call want lock look work live believe happen include continue change learn watch follow stop create remember love consider appear wait serve die expect pass decide pull carry open walk turn start help ask use move play talk answer pray preach study visit arrive return remain wonder hope wish notice realize suppose offer raise report suggest require reach save share care plan pick point rest finish add cover form fill act accept agree allow avoid claim clear climb compare complete contain count cross describe destroy discover discuss drop enjoy enter exist explain express face fail fear fix focus force gather guess handle hate identify imagine improve increase indicate join jump kick kiss knock land last laugh lift like link listen manage mark matter measure mention mind miss note occur own paint park perform place plant please practice prepare present press prevent produce promise protect prove provide publish push race receive recognize record reduce refer reflect refuse relate release rely remove repeat replace reply represent result reveal roll rule rush satisfy search seat secure seem separate settle share shoot shout sign slip smile sort sound stare step stick store study succeed suffer suit supply support surprise survive swear talk thank touch train travel treat trust vote warn wash waste weigh welcome wish worry yell answer belong care close end hope join miss pick plan rain seem sound start stay talk turn walk work write need like love want call keep leave feel grow mean meet hear bring buy catch teach build send spend hold lead speak write break choose drive eat fall forget hide ride rise sing sleep steal swim throw wake wear win lose sell show read sit stand run begin become find give tell say think know see come take make get go do have be";

const FINITE = new Set();
const BASE_VERBS = new Set();

function addFinite(word) {
  const value = String(word || "").toLocaleLowerCase();
  if (value) FINITE.add(value);
}

Object.keys(IRREGULAR).forEach(function (lemma) {
  addFinite(lemma);
  BASE_VERBS.add(lemma);
  IRREGULAR[lemma].split(" ").forEach(addFinite);
});
REGULAR.split(/\s+/u).forEach(function (lemma) {
  if (!lemma) return;
  addFinite(lemma);
  BASE_VERBS.add(lemma);
  addFinite(thirdPerson(lemma));
  addFinite(pastOf(lemma));
});
AUX.forEach(addFinite);

function thirdPerson(lemma) {
  if (lemma === "be") return "is";
  if (lemma === "have") return "has";
  if (lemma === "do") return "does";
  if (lemma === "go") return "goes";
  if (/(s|x|z|ch|sh)$/u.test(lemma)) return lemma + "es";
  if (/[^aeiou]y$/u.test(lemma)) return lemma.slice(0, -1) + "ies";
  return lemma + "s";
}

function pastOf(lemma) {
  if (/e$/u.test(lemma)) return lemma + "d";
  if (/[^aeiou]y$/u.test(lemma)) return lemma.slice(0, -1) + "ied";
  return lemma + "ed";
}

function wordCount(text) {
  return (String(text || "").match(WORD) || []).length;
}

function tokenize(text) {
  return Array.from(String(text || "").matchAll(WORD), function (match) {
    return { text: match[0], lower: match[0].toLocaleLowerCase(), start: match.index, end: match.index + match[0].length };
  });
}

function isAdverb(token) {
  if (!token) return false;
  if (ADVERBS.has(token.lower)) return true;
  return /ly$/u.test(token.lower) && !/^(friendly|early|likely|ugly|lonely|lovely|deadly|costly|daily|weekly|monthly|family|holy)$/u.test(token.lower);
}

function isAdjective(token) {
  if (!token) return false;
  if (ADJECTIVES.has(token.lower)) return true;
  return /(?:ful|ous|ive|less|able|ible|ish|ent|ant|ic|al|y)$/u.test(token.lower) && !PRONOUNS.has(token.lower) && !DETERMINERS.has(token.lower);
}

function isPreposition(token) {
  return Boolean(token) && PREPOSITIONS.has(token.lower);
}

function isFiniteVerb(token) {
  if (!token) return false;
  if (AUX.has(token.lower) || FINITE.has(token.lower)) return true;
  if (/(?:ed|ied)$/u.test(token.lower) && !ADJECTIVES.has(token.lower)) return true;
  return false;
}

function isInnerModifier(token) {
  return isAdverb(token) || isAdjective(token) || /(?:ed|ing)$/u.test(token.lower);
}

function readSubject(tokens, index) {
  const token = tokens[index];
  if (!token) return null;
  if (PRONOUNS.has(token.lower)) return { start: index, end: index + 1 };
  if (DETERMINERS.has(token.lower)) {
    let cursor = index + 1;
    while (cursor < tokens.length && isInnerModifier(tokens[cursor])) cursor += 1;
    if (cursor < tokens.length && !isPreposition(tokens[cursor]) && !DETERMINERS.has(tokens[cursor].lower) && !AUX.has(tokens[cursor].lower)) {
      return { start: index, end: cursor + 1 };
    }
    return null;
  }
  if (isAdjective(token) || isAdverb(token) || isPreposition(token) || COMPLEMENTIZERS.has(token.lower) || COORDINATORS.has(token.lower)) return null;
  if (index + 1 < tokens.length && isFiniteVerb(tokens[index + 1])) return { start: index, end: index + 1 };
  return null;
}

function clauseNuclei(tokens) {
  const found = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const subject = readSubject(tokens, index);
    if (!subject) continue;
    let verb = subject.end;
    while (verb < tokens.length && isAdverb(tokens[verb])) verb += 1;
    if (verb < tokens.length && isFiniteVerb(tokens[verb])) {
      found.push({ subjectStart: subject.start, verb: verb });
      index = verb;
    }
  }
  return found;
}

function isEmbedded(tokens, nuclei, index) {
  if (index <= 0) return false;
  const previous = nuclei[index - 1];
  const current = nuclei[index];
  for (let cursor = previous.verb + 1; cursor < current.subjectStart; cursor += 1) {
    if (COMPLEMENTIZERS.has(tokens[cursor].lower)) return true;
  }
  return false;
}

function clauseIntro(tokens, nucleus) {
  for (let index = 0; index < nucleus.subjectStart; index += 1) {
    if (!isAdverb(tokens[index])) return false;
  }
  return true;
}

function hasImperative(tokens, from) {
  let index = from;
  let skipped = 0;
  while (index < tokens.length && skipped < 6) {
    const token = tokens[index];
    if (isAdverb(token) || isAdjective(token)) {
      index += 1;
      skipped += 1;
      continue;
    }
    if (PRONOUNS.has(token.lower) || DETERMINERS.has(token.lower)) {
      const subject = readSubject(tokens, index);
      index = subject ? subject.end : index + 1;
      skipped += 1;
      continue;
    }
    if (isPreposition(token)) {
      index += 1;
      skipped += 1;
      if (index < tokens.length && (DETERMINERS.has(tokens[index].lower) || isAdjective(tokens[index]))) {
        const subject = readSubject(tokens, index);
        index = subject ? subject.end : index + 1;
      } else if (index < tokens.length) index += 1;
      continue;
    }
    if (COORDINATORS.has(token.lower) || COMPLEMENTIZERS.has(token.lower)) return false;
    if (BASE_VERBS.has(token.lower) && !isFiniteVerb(tokens[index - 1])) return true;
    return false;
  }
  return false;
}

function hasTrailingMainVerb(tokens, nuclei) {
  const after = nuclei.length ? nuclei[nuclei.length - 1].verb + 1 : 0;
  for (let index = after; index < tokens.length; index += 1) {
    if (COMPLEMENTIZERS.has(tokens[index].lower)) return false;
    if (AUX.has(tokens[index].lower) && tokens[index].lower !== "be" && tokens[index].lower !== "been" && tokens[index].lower !== "being") return true;
  }
  return false;
}

function isWhichQuestion(tokens) {
  if (!tokens.length) return false;
  let index = 0;
  while (index < tokens.length && isAdjective(tokens[index])) index += 1;
  if (index >= tokens.length) return false;
  if (!INVERSION.has(tokens[index].lower)) index += 1;
  if (index >= tokens.length || !INVERSION.has(tokens[index].lower)) return false;
  const next = tokens[index + 1];
  if (!next || COMPLEMENTIZERS.has(next.lower)) return false;
  return PRONOUNS.has(next.lower) || DETERMINERS.has(next.lower);
}

function whichHasMain(tokens) {
  if (isWhichQuestion(tokens)) return true;
  if (tokens.length && isFiniteVerb(tokens[0])) {
    const rest = tokens.slice(1);
    const nuclei = clauseNuclei(rest);
    if (hasTrailingMainVerb(rest, nuclei)) return true;
    if (rest.length && COMPLEMENTIZERS.has(rest[0].lower)) return false;
    return nuclei.some(function (nucleus, index) { return !isEmbedded(rest, nuclei, index); });
  }
  const nuclei = clauseNuclei(tokens);
  return hasTrailingMainVerb(tokens, nuclei);
}

function isClauseWord(token) {
  if (!token) return false;
  if (isPreposition(token) || isAdjective(token) || isAdverb(token)) return false;
  if (PRONOUNS.has(token.lower) || DETERMINERS.has(token.lower) || COORDINATORS.has(token.lower) || COMPLEMENTIZERS.has(token.lower)) return false;
  return true;
}

function hasUnrecognizedClause(tokens, from) {
  let index = from;
  while (index < tokens.length) {
    if (COMPLEMENTIZERS.has(tokens[index].lower)) {
      index += 1;
      const embedded = readSubject(tokens, index);
      if (embedded && embedded.start === index) {
        index = embedded.end;
        while (index < tokens.length && isAdverb(tokens[index])) index += 1;
        if (index < tokens.length) index += 1;
      }
      continue;
    }
    const subject = readSubject(tokens, index);
    if (subject && subject.start === index) {
      let verb = subject.end;
      while (verb < tokens.length && isAdverb(tokens[verb])) verb += 1;
      if (isClauseWord(tokens[verb])) return true;
    }
    index += 1;
  }
  return false;
}

function hasMainClause(text, starter) {
  const source = String(text || "").trim();
  if (/\?\s*$/u.test(source)) return true;
  const pieces = source.split(/[,;:]/u);
  if (pieces.length >= 2) {
    const tail = pieces.slice(1).join(" ").trim();
    if (wordCount(tail) >= 2 && !STARTER.test(tail)) return true;
  }
  const starterLower = String(starter || "").toLocaleLowerCase();
  const at = source.toLocaleLowerCase().indexOf(starterLower);
  const rest = at < 0 ? source : source.slice(at + starter.length);
  const tokens = tokenize(rest);
  if (starterLower === "which") return whichHasMain(tokens);
  const nuclei = clauseNuclei(tokens);
  if (!nuclei.length) return hasImperative(tokens, 0);
  if (!clauseIntro(tokens, nuclei[0])) return true;
  if (PHRASAL.has(starterLower) && nuclei[0].subjectStart > 0) {
    const prefix = tokens.slice(0, nuclei[0].subjectStart);
    if (prefix.every(function (token) { return isAdverb(token) || /^\d+$/u.test(token.lower); })) return true;
  }
  const matrix = nuclei.filter(function (nucleus, index) { return !isEmbedded(tokens, nuclei, index); });
  if (matrix.length >= 2) return true;
  const after = matrix.length ? matrix[0].verb + 1 : nuclei[0].verb + 1;
  if (hasUnrecognizedClause(tokens, after)) return true;
  return hasImperative(tokens, after);
}

function fragmentSpan(text) {
  const source = String(text || "");
  const match = STARTER.exec(source);
  if (!match) return null;
  if (!CLOSED.test(source.trim())) return null;
  const starter = match[2];
  if (hasMainClause(source, starter)) return null;
  const quoted = match.index + match[1].length;
  const start = quoted + source.slice(quoted).toLocaleLowerCase().indexOf(starter.toLocaleLowerCase());
  return {
    start: start,
    end: start + starter.length,
    replacement: null,
    detectOnly: true,
    kind: "fragment",
    ruleId: "fragment",
    transformClass: "fragment",
    patternText: source.trim().replace(/\s+/gu, " ").toLocaleLowerCase(),
    message: "This looks like a sentence fragment."
  };
}

export { BASE_VERBS, fragmentSpan, hasMainClause, thirdPerson };
