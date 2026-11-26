// Only the five list commands already available in the shipping web editor.
export const ACTIVE_LIST_IDS = Object.freeze(["bulletDash", "bulletStar", "bulletPlus", "orderedDot", "orderedParen"]);

export function matchList(line, rules) {
  if (typeof line !== "string" || /[\r\n]/.test(line)) return null;
  const indentation = /^[ \t]*/.exec(line)[0];
  const text = line.slice(indentation.length);
  for (const rule of rules) {
    if (!rule.enabled || !ACTIVE_LIST_IDS.includes(rule.id)) continue;
    if (rule.form === "number") {
      const suffix = rule.trigger.slice(3);
      if (!suffix || !text.endsWith(suffix)) continue;
      const digits = text.slice(0, -suffix.length);
      if (/^[0-9]+$/.test(digits)) return { id: rule.id, indentation, marker: rule.canonical.slice(3), digits };
    } else if (text === rule.trigger) {
      return { id: rule.id, indentation, marker: rule.canonical, digits: "" };
    }
  }
  return null;
}
