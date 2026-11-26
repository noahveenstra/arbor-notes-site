// Deterministic usage fixes. Each pattern is a closed English rule with an
// explicit exception list. A miss is preferred to a line under ordinary prose.

import { baseOfThird, pastCueBefore, thirdOfBase } from "./proofreading-agreement.mjs";

const AN_SILENT = /^(?:hour|honest|heir|honor|honour|hourly)/u;
const A_CONSONANT = /^(?:one(?:[-\s]|$)|use|uni|eu|u\.s|user|usual|usually|unique|unicorn|union|unit|united|uniform|useful|universe|universal|utility|utensil)/u;
const VOWEL_LETTER = new Set("a e f h i l m n o r s x".split(" "));
const DEGREE = new Set("much many late early soon often fast hard long far little well".split(" "));
const PREDICATIVE = new Set("right sure correct wrong welcome going ready late early done able supposed meant obvious clear important apparent likely unlikely possible impossible certain essential necessary strange weird funny odd great fine good bad true time glad happy sorry tired".split(" "));
const SKIP_YOUR = new Set("coat keys car house hand side arm leg eye foot way turn name team job phone bag book door room".split(" "));
const COMPARATIVE = new Set("better worse later earlier bigger smaller older younger longer shorter higher lower faster slower harder easier larger nicer greater lesser more less rather other stronger weaker".split(" "));
const SUPERLATIVE = new Set("best worst latest earliest biggest smallest oldest youngest longest shortest highest lowest fastest slowest hardest easiest largest nicest greatest".split(" "));
const SIMPLE_PAST = new Map([
  ["went", "gone"], ["wrote", "written"], ["drank", "drunk"], ["ran", "run"], ["ate", "eaten"],
  ["saw", "seen"], ["did", "done"], ["began", "begun"], ["took", "taken"], ["gave", "given"],
  ["came", "come"], ["drove", "driven"], ["spoke", "spoken"], ["broke", "broken"], ["chose", "chosen"],
  ["fell", "fallen"], ["flew", "flown"], ["forgot", "forgotten"], ["hid", "hidden"], ["rode", "ridden"],
  ["rose", "risen"], ["sang", "sung"], ["sank", "sunk"], ["stole", "stolen"], ["threw", "thrown"],
  ["woke", "woken"], ["wore", "worn"], ["drew", "drawn"], ["grew", "grown"], ["knew", "known"],
  ["swam", "swum"], ["rang", "rung"], ["blew", "blown"], ["tore", "torn"], ["froze", "frozen"],
  ["bit", "bitten"], ["beat", "beaten"], ["showed", "shown"]
]);
const PAST_TO_BASE = new Map([
  ["went", "go"], ["saw", "see"], ["came", "come"], ["gave", "give"], ["took", "take"], ["wrote", "write"],
  ["ate", "eat"], ["ran", "run"], ["bought", "buy"], ["thought", "think"], ["brought", "bring"],
  ["spoke", "speak"], ["drank", "drink"], ["drove", "drive"], ["fell", "fall"], ["forgot", "forget"],
  ["knew", "know"], ["swam", "swim"], ["told", "tell"], ["began", "begin"], ["broke", "break"],
  ["chose", "choose"], ["hid", "hide"], ["rode", "ride"], ["sang", "sing"], ["stole", "steal"],
  ["threw", "throw"], ["woke", "wake"], ["wore", "wear"], ["drew", "draw"], ["grew", "grow"],
  ["flew", "fly"], ["caught", "catch"], ["taught", "teach"], ["built", "build"], ["spent", "spend"],
  ["sent", "send"], ["left", "leave"], ["felt", "feel"], ["kept", "keep"], ["meant", "mean"],
  ["heard", "hear"], ["held", "hold"], ["led", "lead"], ["met", "meet"], ["paid", "pay"],
  ["sold", "sell"], ["lost", "lose"], ["won", "win"], ["slept", "sleep"], ["found", "find"],
  ["made", "make"], ["got", "get"], ["said", "say"], ["stood", "stand"], ["sat", "sit"],
  ["rose", "rise"], ["shook", "shake"], ["became", "become"]
]);
const PRESENT_TO_PAST = new Map([
  ["go", "went"], ["goes", "went"], ["swim", "swam"], ["swims", "swam"], ["tell", "told"], ["tells", "told"],
  ["buy", "bought"], ["buys", "bought"], ["see", "saw"], ["sees", "saw"], ["come", "came"], ["comes", "came"],
  ["eat", "ate"], ["eats", "ate"], ["drink", "drank"], ["drinks", "drank"], ["run", "ran"], ["runs", "ran"],
  ["write", "wrote"], ["writes", "wrote"], ["give", "gave"], ["gives", "gave"], ["take", "took"], ["takes", "took"],
  ["do", "did"], ["does", "did"], ["have", "had"], ["has", "had"], ["get", "got"], ["gets", "got"],
  ["make", "made"], ["makes", "made"], ["know", "knew"], ["knows", "knew"], ["think", "thought"], ["thinks", "thought"],
  ["say", "said"], ["says", "said"], ["find", "found"], ["finds", "found"], ["leave", "left"], ["leaves", "left"],
  ["feel", "felt"], ["feels", "felt"], ["become", "became"], ["becomes", "became"], ["begin", "began"], ["begins", "began"],
  ["keep", "kept"], ["keeps", "kept"], ["bring", "brought"], ["brings", "brought"], ["stand", "stood"], ["stands", "stood"],
  ["sit", "sat"], ["sits", "sat"], ["meet", "met"], ["meets", "met"], ["pay", "paid"], ["pays", "paid"],
  ["hear", "heard"], ["hears", "heard"], ["hold", "held"], ["holds", "held"], ["lead", "led"], ["leads", "led"],
  ["speak", "spoke"], ["speaks", "spoke"], ["break", "broke"], ["breaks", "broke"], ["choose", "chose"], ["chooses", "chose"],
  ["drive", "drove"], ["drives", "drove"], ["fall", "fell"], ["falls", "fell"], ["fly", "flew"], ["flies", "flew"],
  ["forget", "forgot"], ["forgets", "forgot"], ["hide", "hid"], ["hides", "hid"], ["ride", "rode"], ["rides", "rode"],
  ["rise", "rose"], ["rises", "rose"], ["sing", "sang"], ["sings", "sang"], ["sleep", "slept"], ["sleeps", "slept"],
  ["steal", "stole"], ["steals", "stole"], ["throw", "threw"], ["throws", "threw"], ["wake", "woke"], ["wakes", "woke"],
  ["wear", "wore"], ["wears", "wore"], ["win", "won"], ["wins", "won"], ["lose", "lost"], ["loses", "lost"],
  ["sell", "sold"], ["sells", "sold"], ["send", "sent"], ["sends", "sent"], ["spend", "spent"], ["spends", "spent"],
  ["build", "built"], ["builds", "built"], ["catch", "caught"], ["catches", "caught"], ["teach", "taught"], ["teaches", "taught"],
  ["mean", "meant"], ["means", "meant"], ["grow", "grew"], ["grows", "grew"], ["draw", "drew"], ["draws", "drew"],
  ["is", "was"], ["am", "was"], ["are", "were"], ["understand", "understood"], ["understands", "understood"]
]);
const INVARIANT = new Set("read put set let cut hit cost spread shut hurt quit".split(" "));
const MODAL = new Set("can could will would shall should may might must".split(" "));
const HAVE = new Set("have has had having".split(" "));
const SINGULAR_HEAD = new Set("list box set pile stack quality price kind type collection pair bag cup bowl row line piece bit amount sense cost value level rate size length weight color colour taste".split(" "));
const PLURAL_HEAD = new Set("both several many few".split(" "));
const SINGULAR_PRONOUN = new Set("everyone everybody someone somebody anyone anybody nobody each every either neither one".split(" "));
const DAYS = new Set("monday tuesday wednesday thursday friday saturday sunday".split(" "));
const MONTHS = new Set("january february april june july august september october november december".split(" "));
const LANGUAGES = new Set("portuguese spanish french english german italian arabic hebrew japanese korean chinese russian hindi swahili greek latin dutch swedish norwegian danish finnish turkish vietnamese thai".split(" "));
const STATES = new Set("alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada ohio oklahoma oregon pennsylvania tennessee texas utah vermont virginia washington wisconsin wyoming".split(" "));
const STATE_PHRASES = new Map([
  ["new york", "New York"], ["new jersey", "New Jersey"], ["new mexico", "New Mexico"], ["new hampshire", "New Hampshire"],
  ["north carolina", "North Carolina"], ["south carolina", "South Carolina"], ["north dakota", "North Dakota"],
  ["south dakota", "South Dakota"], ["west virginia", "West Virginia"], ["rhode island", "Rhode Island"]
]);
const COUNTRIES = new Set("canada mexico brazil france germany italy spain portugal ireland scotland england britain australia japan korea india nigeria kenya egypt morocco sweden norway denmark finland greece poland ukraine russia israel lebanon vietnam thailand indonesia philippines argentina chile peru colombia ireland".split(" "));
const CITIES = new Set("tokyo london paris berlin rome madrid cairo lagos nairobi mumbai delhi beijing shanghai seoul sydney melbourne toronto chicago boston detroit dallas houston atlanta denver seattle miami dublin lisbon athens moscow vienna prague amsterdam brussels oslo stockholm helsinki bangkok singapore manila jakarta taipei montreal vancouver philadelphia phoenix austin portland baltimore minneapolis milwaukee sacramento orlando tampa honolulu anchorage".split(" "));
const NAMES = new Set("elena noah marcus priya soraya yuki ibrahim tomasz chidi nkechi rafaela astrid ximena padma kazuo siobhan fatima kwame aoife yael tariq mateo kofi ananya ngozi hannah nadia sofia lucia amira leila jonas felix ingrid soren bjorn mireille mei lin zainab joonho xavier diego carmen lucia amara kofi tunde omar hassan leila yara nina lila esme idris kofi".split(" "));
const AMBIGUOUS_NAME = new Set("may will bill mark jack rose china grace hope faith joy amber ivy summer pat art don bob joe ann max ray guy dean drew lance chase clay brook forest river sky rain sage lane".split(" "));

function matchCase(source, target) {
  if (!source || !target) return target;
  if (source === source.toLocaleUpperCase() && source !== source.toLocaleLowerCase()) return target.toLocaleUpperCase();
  if (source[0] === source[0].toLocaleUpperCase() && source[0] !== source[0].toLocaleLowerCase()) {
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

function span(start, end, replacement, ruleId, patternText, message, extra) {
  return Object.assign({
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
  }, extra || {});
}

function articleFor(word) {
  const raw = String(word || "");
  const lower = raw.toLocaleLowerCase();
  if (!lower) return null;
  if (AN_SILENT.test(lower)) return "an";
  if (A_CONSONANT.test(lower)) return "a";
  if (/^[A-Z]{2,}$/u.test(raw) || /^[A-Z](?:\.[A-Z])+\.?$/u.test(raw)) {
    return VOWEL_LETTER.has(raw[0].toLocaleLowerCase()) ? "an" : "a";
  }
  if (/^[aeiou]/iu.test(lower)) return "an";
  return "a";
}

function articleSpans(text, ranges) {
  const source = String(text || "");
  const spans = [];
  const pattern = /\b(a|an)\s+([\p{L}\p{N}]+(?:[.'’-][\p{L}\p{N}]+)*)/giu;
  let match;
  while ((match = pattern.exec(source))) {
    const wanted = articleFor(match[2]);
    if (!wanted || wanted === match[1].toLocaleLowerCase()) continue;
    if (overlaps(match.index, match.index + match[1].length, ranges)) continue;
    spans.push(span(match.index, match.index + match[1].length, matchCase(match[1], wanted), "usage-article", match[1].toLocaleLowerCase() + " " + match[2].toLocaleLowerCase(), "Article"));
  }
  return spans;
}

function modalOfSpans(text, ranges) {
  const source = String(text || "");
  const spans = [];
  const pattern = /\b(could|would|should|might|must)\s+(of)\s+([\p{L}]+)/giu;
  let match;
  while ((match = pattern.exec(source))) {
    const verb = match[3].toLocaleLowerCase();
    const verbal = /(?:ed|ing)$/u.test(verb) || SIMPLE_PAST.has(verb) || PAST_TO_BASE.has(verb) || PRESENT_TO_PAST.has(verb) || INVARIANT.has(verb) || thirdOfBase(verb) || baseOfThird(verb);
    if (!verbal || /^(?:course|them|him|her|us|me|it|the|a|an|my|your|his|our|their)$/u.test(verb)) continue;
    const start = match.index + match[1].length + 1;
    if (overlaps(start, start + match[2].length, ranges)) continue;
    spans.push(span(start, start + match[2].length, matchCase(match[2], "have"), "usage-have", match[1].toLocaleLowerCase() + " of", "Verb form"));
  }
  return spans;
}

function doubleNegativeSpans(text, ranges) {
  const source = String(text || "");
  const spans = [];
  const pair = /\b(didn't|didnt|don't|dont|doesn't|doesnt|can't|cant|won't|wont|isn't|isnt|aren't|arent|wasn't|wasnt|weren't|werent|haven't|havent|hasn't|hasnt|hadn't|hadnt|wouldn't|wouldnt|couldn't|couldnt|shouldn't|shouldnt|not|never)\b(?:\s+[\p{L}]+(?:['’][\p{L}]+)?){0,3}\s+(nobody|nothing|nowhere|no)\b/giu;
  const map = { nobody: "anybody", nothing: "anything", nowhere: "anywhere", no: "any" };
  let match;
  while ((match = pair.exec(source))) {
    const replacement = map[match[2].toLocaleLowerCase()];
    const start = match.index + match[0].length - match[2].length;
    if (!replacement || overlaps(start, start + match[2].length, ranges)) continue;
    if (match[2].toLocaleLowerCase() === "no" && !/\s+[\p{L}]/u.test(source.slice(start + match[2].length))) continue;
    spans.push(span(start, start + match[2].length, matchCase(match[2], replacement), "usage-double-negative", match[1].toLocaleLowerCase() + " " + match[2].toLocaleLowerCase(), "Double negative", { suggestOnly: true }));
  }
  const hardly = /\b(can't|cant|couldn't|couldnt)\s+hardly\b/giu;
  while ((match = hardly.exec(source))) {
    if (overlaps(match.index, match.index + match[1].length, ranges)) continue;
    const replacement = /^could/iu.test(match[1]) ? "could" : "can";
    spans.push(span(match.index, match.index + match[1].length, matchCase(match[1], replacement), "usage-double-negative", match[1].toLocaleLowerCase() + " hardly", "Double negative", { suggestOnly: true }));
  }
  return spans;
}

function comparativeSpans(text, ranges) {
  const source = String(text || "");
  const tokens = tokenize(source);
  const spans = [];
  tokens.forEach(function (token, index) {
    const next = tokens[index + 1];
    if (!next) return;
    const dropMore = token.lower === "more" && (COMPARATIVE.has(next.lower) || (/er$/u.test(next.lower) && COMPARATIVE.has(next.lower)));
    const dropMost = token.lower === "most" && (SUPERLATIVE.has(next.lower) || (/est$/u.test(next.lower) && next.lower !== "est"));
    if (!dropMore && !dropMost) return;
    if (overlaps(token.start, next.end, ranges)) return;
    spans.push(span(token.start, next.end, matchCase(next.text, next.lower), "usage-comparative", token.lower + " " + next.lower, "Comparison"));
  });
  return spans;
}

function regularPast(base) {
  if (/e$/u.test(base)) return base + "d";
  if (/[^aeiou]y$/u.test(base)) return base.slice(0, -1) + "ied";
  return base + "ed";
}

function pastForm(verb, subject) {
  const lower = verb.toLocaleLowerCase();
  const person = String(subject || "").toLocaleLowerCase();
  if (INVARIANT.has(lower)) return null;
  if ((person === "we" || person === "they" || person === "you") && (lower === "is" || lower === "are" || lower === "am")) return "were";
  if (PRESENT_TO_PAST.has(lower)) {
    const past = PRESENT_TO_PAST.get(lower);
    if ((person === "we" || person === "they" || person === "you") && past === "was") return "were";
    return past;
  }
  if (/(?:ed|ied)$/u.test(lower)) return null;
  const base = baseOfThird(lower) || lower;
  if (thirdOfBase(base) || INVARIANT.has(base)) {
    if (INVARIANT.has(base)) return null;
    return regularPast(base);
  }
  return null;
}

function tenseSpans(text, ranges) {
  const tokens = tokenize(text);
  const spans = [];
  function push(token, replacement, patternText, message) {
    if (!token || !replacement || overlaps(token.start, token.end, ranges)) return;
    const shown = matchCase(token.text, replacement);
    if (!shown || shown.toLocaleLowerCase() === token.lower) return;
    spans.push(span(token.start, token.end, shown, "agreement-verb", patternText, message));
  }
  tokens.forEach(function (token, index) {
    const next = tokens[index + 1];
    const third = tokens[index + 2];
    if (HAVE.has(token.lower) && next && SIMPLE_PAST.has(next.lower) && !MODAL.has((tokens[index - 1] || {}).lower)) {
      push(next, SIMPLE_PAST.get(next.lower), token.lower + " " + next.lower, "Verb tense");
    }
    if ((token.lower === "did" || token.lower === "didn't" || token.lower === "didnt" || token.lower === "does" || token.lower === "do") && next && third) {
      const base = PAST_TO_BASE.get(third.lower) || baseOfThird(third.lower);
      if (base && /^(?:i|you|he|she|it|we|they)$/u.test(next.lower)) push(third, base, token.lower + " " + third.lower, "Verb form");
    }
    if (/^(?:i|we|they|you)$/u.test(token.lower) && next && next.lower === "seen" && !HAVE.has((tokens[index - 1] || {}).lower)) {
      push(next, "saw", token.lower + " seen", "Verb tense");
    }
    if (!pastCueBefore(tokens, index) || /^[.!?]$/u.test(token.text)) return;
    let subject = tokens[index - 1];
    if (subject && /^(?:always|usually|often|never|sometimes|just|still|already|really)$/u.test(subject.lower)) subject = tokens[index - 2];
    if (!subject || HAVE.has((tokens[index - 1] || {}).lower) || MODAL.has((tokens[index - 1] || {}).lower)) return;
    if ((tokens[index - 1] || {}).lower === "to" || (tokens[index - 1] || {}).lower === "that") return;
    const person = /^(?:i|you|he|she|it|we|they)$/u.test(subject.lower) ? subject.lower : subject.text[0] && subject.text[0] === subject.text[0].toLocaleUpperCase() ? "he" : "";
    if (!person) return;
    const past = pastForm(token.text, person);
    if (past) push(token, past, "past " + token.lower, "Verb tense");
  });
  return spans;
}

function ofPhraseSpans(text, ranges, lexicon) {
  const tokens = tokenize(text);
  const spans = [];
  function push(token, replacement, patternText) {
    if (!token || overlaps(token.start, token.end, ranges)) return;
    const shown = matchCase(token.text, replacement);
    if (!shown || shown === token.text) return;
    spans.push(span(token.start, token.end, shown, "agreement-verb", patternText, "Subject-verb agreement"));
  }
  tokens.forEach(function (token, index) {
    const of = tokens[index + 1];
    if (!of || of.lower !== "of") return;
    let cursor = index + 2;
    let guard = 0;
    while (cursor < tokens.length && guard < 6 && tokens[cursor] && !/^(?:is|are|was|were|has|have|do|does)$/u.test(tokens[cursor].lower) && !thirdOfBase(tokens[cursor].lower) && !baseOfThird(tokens[cursor].lower) && !/^[.!?]$/u.test(tokens[cursor].text)) {
      cursor += 1;
      guard += 1;
    }
    const verb = tokens[cursor];
    if (!verb) return;
    if (SINGULAR_HEAD.has(token.lower) && !token.lower.endsWith("s")) {
      const map = { are: "is", were: "was", have: "has", do: "does" };
      if (map[verb.lower]) push(verb, map[verb.lower], token.lower + " of " + verb.lower);
    }
    if (/^(?:each|every|neither|either|one)$/u.test(token.lower)) {
      const map = { are: "is", were: "was", have: "has", do: "does" };
      if (map[verb.lower]) push(verb, map[verb.lower], token.lower + " of " + verb.lower);
      else if (thirdOfBase(verb.lower) && !baseOfThird(verb.lower)) push(verb, thirdOfBase(verb.lower), token.lower + " of " + verb.lower);
      else {
        const base = verb.lower;
        const third = thirdOfBase(base);
        if (third && base !== "be") push(verb, third, token.lower + " of " + verb.lower);
      }
    }
    if (PLURAL_HEAD.has(token.lower)) {
      const map = { is: "are", was: "were", has: "have", does: "do" };
      if (map[verb.lower]) push(verb, map[verb.lower], token.lower + " of " + verb.lower);
    }
    if (lexicon && token.lower === "one" && verb.lower === "is") return;
  });
  return spans;
}

function pronounAgreementSpans(text, ranges) {
  const tokens = tokenize(text);
  const spans = [];
  tokens.forEach(function (token, index) {
    const two = token.lower === "no" && tokens[index + 1] && tokens[index + 1].lower === "one";
    const subject = two ? "no one" : token.lower;
    if (!SINGULAR_PRONOUN.has(subject) && !two) return;
    let cursor = two ? index + 2 : index + 1;
    if (tokens[cursor] && tokens[cursor].lower === "of") return;
    if (tokens[cursor] && /^(?:always|usually|often|never|sometimes|really|just|still)$/u.test(tokens[cursor].lower)) cursor += 1;
    const beforeSubject = tokens[(two ? index : index) - 1];
    if (beforeSubject && /^(?:let|make|see|hear|watch|help|bid|made|saw|heard|watched|helped)$/u.test(beforeSubject.lower)) return;
    if (tokens.slice(0, index).some(function (item) { return /(?:ed|ied)$/u.test(item.lower) || /^(?:sang|went|came|saw|said|told|was|were|had|did|drove|gave|took|found|left|made|got|ran|bought|wrote|spoke|began)$/u.test(item.lower); })) return;
    const verb = tokens[cursor];
    if (!verb || /^[.!?]$/u.test(verb.text) || overlaps(verb.start, verb.end, ranges)) return;
    if (pastCueBefore(tokens, cursor)) return;
    let replacement = null;
    if (verb.lower === "are") replacement = "is";
    else if (verb.lower === "have") replacement = "has";
    else if (verb.lower === "do") replacement = "does";
    else if (thirdOfBase(verb.lower)) replacement = thirdOfBase(verb.lower);
    if (!replacement) return;
    const shown = matchCase(verb.text, replacement);
    if (shown === verb.text) return;
    spans.push(span(verb.start, verb.end, shown, "agreement-verb", subject + " " + verb.lower, "Subject-verb agreement"));
  });
  return spans;
}

function eitherOrSpans(text, ranges) {
  const source = String(text || "");
  const spans = [];
  const pattern = /\b(either|neither)\s+([\p{L}]+)\s+(or|nor)\s+([\p{L}]+)\s+(are|were|have)\b/giu;
  let match;
  while ((match = pattern.exec(source))) {
    const left = match[2];
    const right = match[4];
    const plural = (word) => /s$/u.test(word) && !/ss$/u.test(word) && !/^(?:is|was|has|his|this)$/iu.test(word);
    if (plural(left) || plural(right) || /^(?:they|we|you)$/iu.test(left) || /^(?:they|we|you)$/iu.test(right)) continue;
    const start = match.index + match[0].length - match[5].length;
    if (overlaps(start, start + match[5].length, ranges)) continue;
    const map = { are: "is", were: "was", have: "has" };
    spans.push(span(start, start + match[5].length, matchCase(match[5], map[match[5].toLocaleLowerCase()]), "agreement-verb", "either or " + match[5].toLocaleLowerCase(), "Subject-verb agreement"));
  }
  return spans;
}

function pluralVerbSpans(text, ranges, lexicon) {
  const tokens = tokenize(text);
  const spans = [];
  tokens.forEach(function (token, index) {
    if (!/^(?:the|these|those|my|your|our|their)$/u.test(token.lower)) return;
    const noun = tokens[index + 1];
    const verb = tokens[index + 2];
    if (!noun || !verb) return;
    const lower = noun.lower;
    if (!lower.endsWith("s") || lower.endsWith("ss") || /^(?:bus|gas|plus|lens|this|his|as|is|was|has)$/u.test(lower)) return;
    const stem = lower.endsWith("ies") ? lower.slice(0, -3) + "y" : lower.endsWith("es") ? lower.slice(0, -2) : lower.slice(0, -1);
    if (!(lexicon && lexicon.has && lexicon.has(stem))) return;
    const base = baseOfThird(verb.lower);
    if (!base || overlaps(verb.start, verb.end, ranges)) return;
    const shown = matchCase(verb.text, base);
    if (shown === verb.text) return;
    spans.push(span(verb.start, verb.end, shown, "agreement-verb", noun.lower + " " + verb.lower, "Subject-verb agreement"));
  });
  return spans;
}

function homophoneMore(text, ranges, lexicon) {
  const source = String(text || "");
  const tokens = tokenize(source);
  const spans = [];
  function add(token, replacement, ruleId, patternText) {
    if (!token || overlaps(token.start, token.end, ranges)) return;
    const shown = replacement === "a lot" ? "a lot" : matchCase(token.text, replacement);
    if (shown === token.text) return;
    spans.push(span(token.start, token.end, shown, ruleId, patternText, "Word choice"));
  }
  tokens.forEach(function (token, index) {
    const prev = tokens[index - 1];
    const next = tokens[index + 1];
    const after = tokens[index + 2];
    if ((token.lower === "to" || token.lower === "two") && next && DEGREE.has(next.lower)) add(token, "too", "usage-too", token.lower + " " + next.lower);
    if (token.lower === "two" && next && /^(?:cold|hot|hard|soft|fast|slow|long|short|high|low|big|small|old|young|good|bad|tired|sick|warm|cool|bright|dark|loud|quiet|late|early)$/u.test(next.lower) && (!after || /^(?:for|to|of|and|[.!?])$/u.test(after.lower))) {
      add(token, "too", "usage-too", "two " + next.lower);
    }
    if (token.lower === "then" && next && !/^[.!?]$/u.test(next.text)) {
      const window = tokens.slice(Math.max(0, index - 5), index);
      const linked = prev && /^(?:and|but|so)$/u.test(prev.lower);
      const comparative = window.some(function (item) { return COMPARATIVE.has(item.lower) || item.lower === "rather" || item.lower === "more" || item.lower === "less"; });
      if (!linked && comparative) add(token, "than", "usage-than", "then");
    }
    if (token.lower === "effect" && prev && MODAL.has(prev.lower)) {
      const kept = /^(?:change|reform|policy|transformation|cure|rescue|escape|settlement)$/u.test((next || {}).lower || "");
      if (!kept) add(token, "affect", "usage-affect", prev.lower + " effect");
    }
    if (token.lower === "affect" && prev && /^(?:a|an|the|positive|negative|no|little|some|any|this|that|significant|direct)$/u.test(prev.lower)) add(token, "effect", "usage-effect", prev.lower + " affect");
    if (token.lower === "its" && next && /^(?:obvious|clear|important|apparent|likely|unlikely|possible|impossible|certain|essential|necessary|strange|weird|funny|odd)$/u.test(next.lower)) {
      const before = source.slice(0, token.start);
      if (!before.trim() || /[.!?]\s*$/u.test(before)) add(token, "it's", "usage-its", "its " + next.lower);
    }
    if (token.lower === "your" && next && after && /^(?:right|sure|correct|wrong|welcome|going|ready|late|early|done|able|glad|happy|sorry)$/u.test(next.lower) && /^(?:about|that|to)$/u.test(after.lower) && !(next.lower === "right" && after.lower === "to")) {
      add(token, "you're", "usage-youre", "your " + next.lower);
    }
    if (/^(?:you're|youre)$/u.test(token.lower) && next && lexicon && lexicon.has && lexicon.has(next.lower)) {
      const kind = next.lower;
      const closed = /^(?:not|just|so|too|very|here|there|now|then|today|tomorrow|home|away|back|out|up|down|in|on|off|over|going|welcome|right|sure|ready|late|early|able|meant|supposed|correct|wrong|the|a|an|my|to|do|be|have|get|go|see|know|also|still|already|always|never|really)$/u.test(kind);
      if (!closed && !/(?:ing|ly)$/u.test(kind) && !thirdOfBase(kind) && !baseOfThird(kind) && !SKIP_YOUR.has(kind)) {
        add(token, "your", "usage-your", token.lower + " " + kind);
      }
    }
    if (token.lower === "whose" && next && (/ing$/u.test(next.lower) || /^(?:going|coming|bringing)$/u.test(next.lower))) add(token, "who's", "usage-whose", "whose " + next.lower);
    if (/^(?:who's|who’s)$/u.test(token.lower) && next && lexicon && lexicon.has && lexicon.has(next.lower) && !/ing$/u.test(next.lower) && !PREDICATIVE.has(next.lower)) add(token, "whose", "usage-whose", "who's " + next.lower);
    if (token.lower === "their" && next && /^(?:is|are|was|were)$/u.test(next.lower)) add(token, "there", "usage-there", "their " + next.lower);
    if (prev && prev.lower === "to" && token.lower === "breath") add(token, "breathe", "usage-breathe", "to breath");
    if (token.lower === "bias" && prev && (/^(?:is|are|was|were|seems|seemed|feels|felt|looks|looked|sounds|sounded|appears|appeared|became|be|been|clearly|really|very|obviously|quite)$/u.test(prev.lower))) add(token, "biased", "usage-biased", prev.lower + " bias");
    if (token.lower === "loose" && next && /^(?:your|my|his|her|their|our|the|a)$/u.test(next.lower)) add(token, "lose", "usage-lose", "loose " + next.lower);
    if (token.lower === "accept" && prev && /^(?:everything|nothing|anything|everyone|everybody|someone|all|none)$/u.test(prev.lower)) add(token, "except", "usage-except", prev.lower + " accept");
    if (token.lower === "i" && next && /^(?:doesnt|doesn't)$/u.test(next.lower)) {
      if (!overlaps(token.start, next.end, ranges)) {
        spans.push(span(token.start, next.end, "It doesn't", "usage-contraction", "i doesnt", "Contraction"));
      }
    }
  });
  return spans;
}

function properNounSpans(text, ranges, lexicon) {
  const source = String(text || "");
  const tokens = tokenize(source);
  const spans = [];
  function add(start, end, original, replacement, patternText) {
    if (!replacement || replacement === original || overlaps(start, end, ranges)) return;
    spans.push(span(start, end, replacement, "usage-proper", patternText, "Capitalization"));
  }
  tokens.forEach(function (token, index) {
    if (token.text === token.text.toLocaleUpperCase() && token.text !== token.lower) return;
    if (token.text[0] === token.text[0].toLocaleUpperCase() && token.text[0] !== token.text[0].toLocaleLowerCase()) return;
    const lower = token.lower;
    if (AMBIGUOUS_NAME.has(lower)) return;
    const prev = tokens[index - 1];
    const next = tokens[index + 1];
    if (lower === "march") {
      const monthish = prev && /^(?:in|on|during|this|next|last|by|until|before|after|mid|since)$/u.test(prev.lower);
      const dated = next && /^\d+$/u.test(next.lower);
      if (monthish || dated) add(token.start, token.end, token.text, "March", "march");
      return;
    }
    let replacement = null;
    const titled = lower[0].toLocaleUpperCase() + lower.slice(1);
    if (DAYS.has(lower) || MONTHS.has(lower)) replacement = titled;
    else if (LANGUAGES.has(lower) || STATES.has(lower) || CITIES.has(lower) || COUNTRIES.has(lower)) replacement = titled;
    else if (NAMES.has(lower) && !(lexicon && lexicon.has && lexicon.has(lower) && lower.length < 4)) replacement = titled;
    if (replacement) add(token.start, token.end, token.text, replacement, lower);
    if (next) {
      const phrase = lower + " " + next.lower;
      if (STATE_PHRASES.has(phrase)) add(token.start, next.end, token.text + " " + next.text, STATE_PHRASES.get(phrase), phrase);
    }
  });
  const bare = source.trim();
  if (bare && !/[.!?]\s*$/u.test(bare)) {
    const question = /^(?:who|what|when|where|why|how|which|did|does|do|is|are|was|were|can|could|will|would|should|have|has)\b/iu.test(bare);
    const inverted = /\b(?:you|he|she|we|they|i|anyone|someone)\b/iu.test(bare);
    if (question && inverted) {
      const end = source.length;
      spans.push(span(end, end, "?", "usage-question", "question", "Punctuation"));
    }
  }
  return spans;
}

function usageFixSpans(text, ranges, lexicon) {
  return articleSpans(text, ranges)
    .concat(modalOfSpans(text, ranges))
    .concat(doubleNegativeSpans(text, ranges))
    .concat(comparativeSpans(text, ranges))
    .concat(tenseSpans(text, ranges))
    .concat(ofPhraseSpans(text, ranges, lexicon))
    .concat(pronounAgreementSpans(text, ranges))
    .concat(eitherOrSpans(text, ranges))
    .concat(pluralVerbSpans(text, ranges, lexicon))
    .concat(homophoneMore(text, ranges, lexicon))
    .concat(properNounSpans(text, ranges, lexicon));
}

export { usageFixSpans };
