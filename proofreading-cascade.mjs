// Pure always-on cascade assembly. Model spans are supplied by the caller so
// tests can run the same merge without the ONNX models.

import { agreementSpans } from "./proofreading-agreement.mjs";
import { contractionSpans } from "./proofreading-contractions.mjs";
import { fragmentSpan } from "./proofreading-fragments.mjs";
import { refineHarperSpans } from "./proofreading-harper.mjs";
import { isReliableSpelling, keepModelSpan, precisionSpans } from "./proofreading-precision.mjs";
import { guardSpans, protectedRanges } from "./proofreading-spans.mjs";

function tagSpan(span, ruleId) {
  if (!span) return span;
  const kind = span.transformClass || span.ruleId || ruleId;
  return Object.assign({}, span, {
    ruleId: span.ruleId || ruleId,
    transformClass: kind,
    patternText: span.patternText || (span.detectOnly ? "" : String(span.replacement || ""))
  });
}

function tagLayer(spans, ruleId) {
  return (Array.isArray(spans) ? spans : []).map(function (span) { return tagSpan(span, ruleId); });
}

function classifyGector(text, span) {
  const source = String(text || "");
  const original = source.slice(span.start, span.end);
  const before = source.slice(0, span.start).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*$/u);
  const cue = before ? before[0].toLocaleLowerCase() : "";
  const next = String(span.replacement || "").toLocaleLowerCase();
  const from = original.toLocaleLowerCase();
  const quantifier = /^(?:two|three|four|five|six|seven|eight|nine|ten|many|several|both|these|those|few|\d+)$/u.test(cue);
  const third = /^(?:he|she|it)$/u.test(cue);
  const pluralSubject = /^(?:i|you|we|they)$/u.test(cue);
  if (quantifier && next.startsWith(from) && next.length > from.length) return "agreement-plural";
  if ((third || pluralSubject) && next !== from) return "agreement-verb";
  return "gector";
}

function annotateGector(text, spans) {
  return (Array.isArray(spans) ? spans : []).map(function (span) {
    const transformClass = span && (span.transformClass || classifyGector(text, span));
    return tagSpan(Object.assign({}, span, { transformClass: transformClass, ruleId: span.ruleId || "gector" }), "gector");
  });
}

function ruleLayers(text, ranges, lexicon) {
  const fragment = fragmentSpan(text);
  return {
    contractions: tagLayer(contractionSpans(text, ranges), "contraction"),
    agreement: agreementSpans(text, ranges, lexicon),
    fragments: fragment ? [fragment] : []
  };
}

function rangesOverlap(start, end, otherStart, otherEnd) {
  if (start === end) return start > otherStart && start < otherEnd;
  if (otherStart === otherEnd) return otherStart > start && otherStart < end;
  return start < otherEnd && otherStart < end;
}

function settleSpans(spans) {
  const edits = [];
  const notes = [];
  (Array.isArray(spans) ? spans : []).forEach(function (span) {
    if (!span) return;
    if (span.detectOnly || span.replacement == null) notes.push(span);
    else edits.push(span);
  });
  const sorted = edits.slice().sort(function (left, right) {
    return (right.priority || 0) - (left.priority || 0) || left.start - right.start;
  });
  const kept = [];
  sorted.forEach(function (span) {
    if (kept.some(function (existing) { return rangesOverlap(existing.start, existing.end, span.start, span.end); })) return;
    kept.push(span);
  });
  notes.forEach(function (span) {
    if (kept.some(function (existing) { return rangesOverlap(existing.start, existing.end, span.start, span.end); })) return;
    kept.push(span);
  });
  return kept.sort(function (left, right) { return left.start - right.start || left.end - right.end; });
}

function assembleCascade(text, options) {
  const config = options || {};
  const source = String(text || "");
  const ranges = protectedRanges(source, config);
  const lexicon = config.lexicon;
  const rules = ruleLayers(source, ranges, lexicon);
  const contractions = tagLayer(rules.contractions, "contraction").map(function (span) {
    return Object.assign({}, span, { trusted: true, priority: 30 });
  });
  const agreement = (rules.agreement || []).map(function (span) {
    return Object.assign({}, span, { trusted: true, priority: span.priority || 50 });
  });
  const precise = precisionSpans(source, ranges, lexicon);
  const guardedRules = guardSpans(source, contractions.concat(agreement, precise), config);
  const gec = tagLayer(guardSpans(source, config.gec || [], config), "gec");
  const harper = tagLayer(guardSpans(source, refineHarperSpans(source, config.harper || [], config), config), "harper");
  const gector = guardSpans(source, annotateGector(source, config.gector || []), config);
  const layers = [gec, harper, gector];
  const models = [];
  layers.forEach(function (layer, index) {
    const others = guardedRules.concat(layers.filter(function (_, other) { return other !== index; }).flat());
    layer.forEach(function (span) {
      if (!keepModelSpan(source, span, lexicon, others, config)) return;
      const original = source.slice(span.start, span.end);
      const spelling = isReliableSpelling(original, span.replacement, lexicon);
      models.push(Object.assign({}, span, { priority: spelling ? 20 : 15 }));
    });
  });
  const fragments = guardSpans(source, rules.fragments, config).map(function (span) {
    return Object.assign({}, span, { priority: 10 });
  });
  return settleSpans(guardedRules.concat(models, fragments));
}

export { annotateGector, assembleCascade, ruleLayers, settleSpans };
