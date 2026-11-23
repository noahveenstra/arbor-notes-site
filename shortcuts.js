// Keyboard shortcut matching for the Arbor web client.
// The Mac menu audit lives in README.md. This module only decides which
// action a key event names. It does not touch the DOM.

export const SHORTCUT_BINDINGS = [
  { id: "new-note", label: "New note", key: "p", code: "KeyP", alt: true, shift: false, appleShift: true, typing: "allow", repeat: false, help: "primary" },
  { id: "new-folder", label: "New folder", key: "g", code: "KeyG", alt: true, shift: false, appleShift: true, typing: "allow", repeat: false, help: "primary" },
  { id: "focus-search", label: "Search", key: "f", code: "KeyF", alt: true, shift: false, appleShift: true, typing: "allow", repeat: false, help: "primary" },
  { id: "settings", label: "Settings", key: ",", code: "Comma", alt: true, shift: false, typing: "allow", repeat: false, help: "primary" },
  { id: "archive-note", label: "Archive selected note", key: "x", code: "KeyX", alt: true, shift: false, appleShift: true, typing: "allow", repeat: false, help: "primary" },
  { id: "save", label: "Save", key: "s", code: "KeyS", alt: true, shift: false, appleShift: true, typing: "allow", repeat: false, help: "primary" },
  { id: "help", label: "Keyboard shortcuts", key: "/", code: "Slash", alt: true, shift: false, appleShift: true, typing: "allow", repeat: false, help: "primary" },
  { id: "undo", label: "Undo", key: "z", code: "KeyZ", alt: false, shift: false, typing: "allow", repeat: false, help: "primary" },
  { id: "redo", label: "Redo", key: "z", code: "KeyZ", alt: false, shift: true, typing: "allow", repeat: false, help: "primary" },
  { id: "list-previous", label: "Previous note", key: "ArrowUp", code: "ArrowUp", plain: true, typing: "block", repeat: true, help: "primary" },
  { id: "list-next", label: "Next note", key: "ArrowDown", code: "ArrowDown", plain: true, typing: "block", repeat: true, help: "primary" },
  { id: "open-note", label: "Open note", key: "Enter", code: "Enter", alsoCodes: ["NumpadEnter"], plain: true, typing: "block", repeat: false, help: "primary" },
  { id: "dismiss", label: "Close or cancel", key: "Escape", code: "Escape", plain: true, typing: "allow", repeat: false, help: "primary" }
];

export function usesCommandModifier(platform) {
  return /Mac|iPhone|iPad|iPod/i.test(String(platform || ""));
}

function keyMatches(event, binding) {
  const key = String(event.key || "");
  if (!key) return false;
  if (key.length === 1) return key.toLowerCase() === binding.key;
  return key === binding.key;
}

function codeMatches(event, binding) {
  const code = String(event.code || "");
  if (!code) return false;
  if (code === binding.code) return true;
  return Array.isArray(binding.alsoCodes) && binding.alsoCodes.indexOf(code) !== -1;
}

function primaryModifier(event, applePlatform) {
  if (applePlatform) return Boolean(event.metaKey) && !event.ctrlKey;
  return Boolean(event.ctrlKey) && !event.metaKey;
}

function bindingShift(binding, applePlatform) {
  return applePlatform && typeof binding.appleShift === "boolean" ? binding.appleShift : Boolean(binding.shift);
}

export function matchArborShortcut(event, context) {
  if (!event || event.isComposing) return null;
  if (typeof event.getModifierState === "function" && event.getModifierState("AltGraph")) return null;
  const ctx = context || {};
  const apple = Boolean(ctx.applePlatform);
  const primary = primaryModifier(event, apple);
  const alt = Boolean(event.altKey);
  const shift = Boolean(event.shiftKey);
  const hasCode = Boolean(event.code);

  for (let index = 0; index < SHORTCUT_BINDINGS.length; index += 1) {
    const binding = SHORTCUT_BINDINGS[index];
    if (binding.plain) {
      if (event.metaKey || event.ctrlKey || alt || shift) continue;
    } else if (!primary || alt !== Boolean(binding.alt) || shift !== bindingShift(binding, apple)) {
      continue;
    }
    const matched = hasCode ? codeMatches(event, binding) : keyMatches(event, binding);
    if (!matched) continue;
    if (event.repeat && !binding.repeat) return null;
    if (ctx.typing && binding.typing === "block") return null;
    if (binding.plain && binding.id !== "dismiss" && ctx.listNavigation === false) return null;
    return binding.id;
  }
  return null;
}

export function formatShortcut(binding, applePlatform) {
  if (binding.plain) {
    if (binding.key === "ArrowUp") return "↑";
    if (binding.key === "ArrowDown") return "↓";
    if (binding.key === "Enter") return "Return";
    if (binding.key === "Escape") return "Esc";
    return binding.key;
  }
  const keyLabel = binding.key.length === 1 ? (binding.key === "," || binding.key === "/" ? binding.key : binding.key.toUpperCase()) : binding.key;
  if (applePlatform) {
    const symbols = [];
    if (binding.alt) symbols.push("⌥");
    if (bindingShift(binding, true)) symbols.push("⇧");
    symbols.push("⌘");
    return symbols.join("") + keyLabel;
  }
  const parts = ["Ctrl"];
  if (binding.alt) parts.push("Alt");
  if (binding.shift) parts.push("Shift");
  return parts.join("+") + "+" + keyLabel;
}

export function shortcutHelpRows(applePlatform) {
  const apple = Boolean(applePlatform);
  const rows = [];
  const byId = new Map();
  SHORTCUT_BINDINGS.forEach(function (binding) {
    if (!binding.help) return;
    let row = byId.get(binding.id);
    if (!row) {
      row = { id: binding.id, label: binding.label, chords: [] };
      byId.set(binding.id, row);
      rows.push(row);
    }
    const chord = formatShortcut(binding, apple);
    if (row.chords.indexOf(chord) === -1) row.chords.push(chord);
  });
  return rows;
}

const arborShortcutApi = {
  SHORTCUT_BINDINGS: SHORTCUT_BINDINGS,
  matchArborShortcut: matchArborShortcut,
  shortcutHelpRows: shortcutHelpRows,
  formatShortcut: formatShortcut,
  usesCommandModifier: usesCommandModifier
};

if (typeof globalThis !== "undefined") globalThis.ArborShortcuts = arborShortcutApi;
