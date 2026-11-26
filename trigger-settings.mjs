// Generated from Scripts/rich-markdown by website/scripts/generate-markdown-typing.mjs.
const registry = {
  "version": 1,
  "rules": [
    {
      "id": "heading1",
      "label": "Heading 1",
      "form": "line",
      "defaultTrigger": "#",
      "canonical": "#"
    },
    {
      "id": "heading2",
      "label": "Heading 2",
      "form": "line",
      "defaultTrigger": "##",
      "canonical": "##"
    },
    {
      "id": "heading3",
      "label": "Heading 3",
      "form": "line",
      "defaultTrigger": "###",
      "canonical": "###"
    },
    {
      "id": "quote",
      "label": "Block quote",
      "form": "line",
      "defaultTrigger": ">",
      "canonical": ">"
    },
    {
      "id": "bulletDash",
      "label": "Bullet list (dash)",
      "form": "line",
      "defaultTrigger": "-",
      "canonical": "-"
    },
    {
      "id": "bulletStar",
      "label": "Bullet list (asterisk)",
      "form": "line",
      "defaultTrigger": "*",
      "canonical": "*"
    },
    {
      "id": "bulletPlus",
      "label": "Bullet list (plus)",
      "form": "line",
      "defaultTrigger": "+",
      "canonical": "+"
    },
    {
      "id": "orderedDot",
      "label": "Numbered list (period)",
      "form": "number",
      "defaultTrigger": "{n}.",
      "canonical": "{n}."
    },
    {
      "id": "orderedParen",
      "label": "Numbered list (parenthesis)",
      "form": "number",
      "defaultTrigger": "{n})",
      "canonical": "{n})"
    },
    {
      "id": "checkOpen",
      "label": "Unchecked task",
      "form": "line",
      "defaultTrigger": "[ ]",
      "canonical": "- [ ]"
    },
    {
      "id": "checkDone",
      "label": "Checked task",
      "form": "line",
      "defaultTrigger": "[x]",
      "canonical": "- [x]"
    },
    {
      "id": "bold",
      "label": "Bold",
      "form": "pair",
      "defaultTrigger": "**",
      "canonical": "**"
    },
    {
      "id": "italic",
      "label": "Italic",
      "form": "pair",
      "defaultTrigger": "*",
      "canonical": "*"
    },
    {
      "id": "code",
      "label": "Inline code",
      "form": "pair",
      "defaultTrigger": "`",
      "canonical": "`"
    },
    {
      "id": "strike",
      "label": "Strikethrough",
      "form": "pair",
      "defaultTrigger": "~~",
      "canonical": "~~"
    },
    {
      "id": "underline",
      "label": "Underline",
      "form": "pair",
      "defaultTrigger": "++",
      "canonical": "<u>"
    },
    {
      "id": "highlight",
      "label": "Yellow highlight",
      "form": "pair",
      "defaultTrigger": "==",
      "canonical": "<mark data-arbor-color=\"yellow\">"
    }
  ]
};

export const RULES = Object.freeze(registry.rules.map(rule => Object.freeze({ ...rule })));
const byId = new Map(RULES.map(rule => [rule.id, rule]));
const encoder = new TextEncoder();

export function defaultSettings() {
  return { version: 1, overrides: {} };
}

export function effectiveRules(settings) {
  return RULES.map(rule => ({
    ...rule, trigger: rule.defaultTrigger, enabled: true, ...settings.overrides[rule.id]
  }));
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validTrigger(rule, trigger) {
  if (typeof trigger !== "string" || !trigger || trigger !== trigger.normalize("NFC") ||
      encoder.encode(trigger).length > 24 || /[\\\p{C}]/u.test(trigger) || trigger.trim() !== trigger) return false;
  const withoutSpaces = rule.form === "line" ? trigger.replaceAll(" ", "") : trigger;
  if (/\s/u.test(withoutSpaces)) return false;
  if (rule.form !== "number") return !trigger.includes("{n}");
  const suffix = trigger.slice(3);
  return trigger.startsWith("{n}") && suffix.length > 0 && !/^[0-9]/.test(suffix) && !suffix.includes("{n}");
}

function builtInPair(a, b, idA, idB) {
  return a.trigger === a.defaultTrigger && b.trigger === b.defaultTrigger &&
    ((a.id === idA && b.id === idB) || (a.id === idB && b.id === idA));
}

function numberedPrefix(trigger, template) {
  const suffix = template.slice(3);
  return trigger.endsWith(suffix) && /^[0-9]+$/.test(trigger.slice(0, -suffix.length));
}

function checklist(rule) {
  return rule.id === "checkOpen" || rule.id === "checkDone";
}

function variants(rule) {
  return checklist(rule) && rule.trigger === "[x]" ? ["[x]","[X]"] : [rule.trigger];
}

function acceptsLine(rule, marker) {
  if (rule.form === "number") return numberedPrefix(marker,rule.trigger);
  if (checklist(rule)) marker = marker.replace(/^[-*+] +/, "");
  return variants(rule).includes(marker);
}

function shadowsLine(earlier, later) {
  return variants(later).some(marker => {
    // Each space is a completion boundary, including inside a custom prefix.
    const words = marker.split(" ");
    return words.some((_, index) => acceptsLine(earlier,words.slice(0,index+1).join(" ")));
  });
}

function overlaps(a, b) {
  if (variants(a).some(t => variants(b).includes(t))) return !builtInPair(a,b,"bulletStar","italic");
  if (a.form === "pair" && b.form === "pair") {
    return !builtInPair(a,b,"italic","bold") &&
      (a.trigger.startsWith(b.trigger) || b.trigger.startsWith(a.trigger) ||
       a.trigger.endsWith(b.trigger) || b.trigger.endsWith(a.trigger));
  }
  if (a.form !== "pair" && b.form !== "pair") {
    return shadowsLine(a,b) || shadowsLine(b,a);
  }
  return false;
}

function validate(value) {
  if (!record(value) || value.version !== 1 || !record(value.overrides) ||
      Object.keys(value).some(k => !["version","overrides"].includes(k))) throw new Error("Unsupported Markdown settings.");
  const clean = defaultSettings();
  for (const [id, item] of Object.entries(value.overrides)) {
    const rule = byId.get(id);
    if (!rule || !record(item) || Object.keys(item).some(k => !["trigger","enabled"].includes(k)) ||
        typeof item.enabled !== "boolean" || !validTrigger(rule,item.trigger)) {
      throw new Error("Enter a valid trigger of up to 24 UTF-8 bytes. Numbered lists start with {n}.");
    }
    if (item.trigger !== rule.defaultTrigger || !item.enabled) {
      clean.overrides[id] = { trigger:item.trigger, enabled:item.enabled };
    }
  }
  const active = effectiveRules(clean).filter(rule => rule.enabled);
  for (const [index,a] of active.entries()) {
    for (const b of active.slice(index+1)) {
      if (overlaps(a,b)) throw new Error(a.label + " conflicts with " + b.label + ". Choose a different trigger.");
    }
  }
  return clean;
}

// Reading an absent, corrupt or newer local settings value never writes to storage.
export function loadSettings(serialized) {
  try { return validate(JSON.parse(serialized)); }
  catch { return defaultSettings(); }
}

export function changeSetting(settings, id, changes) {
  const rule = byId.get(id);
  if (!rule || !record(changes) || Object.keys(changes).some(key => !["trigger","enabled"].includes(key))) {
    throw new Error("Unknown Markdown setting.");
  }
  const item = { trigger:rule.defaultTrigger, enabled:true, ...settings.overrides[id], ...changes };
  return validate({version:1,overrides:{...settings.overrides,[id]:item}});
}

export function resetSetting(settings,id) {
  if (!byId.has(id)) throw new Error("Unknown Markdown setting.");
  const overrides = {...settings.overrides};
  delete overrides[id];
  return validate({version:1,overrides});
}
