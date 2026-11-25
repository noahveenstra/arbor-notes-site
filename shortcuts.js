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

export function resolveShortcutBindings(operations) {
  const byId = new Map();
  (Array.isArray(operations) ? operations : []).forEach(function (operation) {
    if (operation && typeof operation.id === "string") byId.set(operation.id, operation);
  });
  return SHORTCUT_BINDINGS.map(function (base) {
    const override = byId.get(base.id);
    if (!override || override.reset) return Object.assign({}, base);
    const binding = Object.assign({}, base, {
      key: override.key,
      code: override.code,
      alt: Boolean(override.alt),
      shift: Boolean(override.shift),
      plain: Boolean(override.plain)
    });
    delete binding.appleShift;
    return binding;
  });
}

export function captureShortcut(event, applePlatform) {
  if (!event || event.isComposing) return { error: "Finish text composition before recording a shortcut." };
  const key = String(event.key || "");
  if (!key || ["Alt", "AltGraph", "Control", "Meta", "Shift"].includes(key)) return { error: "Press a key combination to record it." };
  const primary = applePlatform ? Boolean(event.metaKey) : Boolean(event.ctrlKey);
  const wrongPrimary = applePlatform ? Boolean(event.ctrlKey) : Boolean(event.metaKey);
  if (wrongPrimary) return { error: applePlatform ? "Use Command as the main modifier." : "Use Control as the main modifier." };
  const plain = !primary && !event.altKey && !event.shiftKey;
  const normalizedKey = key === " " ? "Space" : key.length === 1 ? key.toLowerCase() : key;
  if (plain && !["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(normalizedKey)) {
    return { error: "Use Command or Control with Option/Alt or Shift. Plain typing keys cannot be shortcuts." };
  }
  if (!plain && !primary) return { error: "Use Command or Control with Option/Alt or Shift." };
  if (!event.code) return { error: "Arbor could not identify that key. Try another combination." };
  return {
    binding: {
      key: normalizedKey,
      code: String(event.code),
      alt: Boolean(event.altKey),
      shift: Boolean(event.shiftKey),
      plain: plain
    }
  };
}

export function validateShortcut(id, candidate, bindings, applePlatform) {
  if (!candidate || !candidate.key || !candidate.code) return "Choose a key combination first.";
  const base = SHORTCUT_BINDINGS.find(function (binding) { return binding.id === id; });
  if (!base) return "Arbor cannot change that command.";
  if (candidate.plain && !base.plain) return "This command needs a modifier so it does not interrupt typing.";
  const key = candidate.key.toLowerCase();
  const browserKeys = new Set(["a", "d", "e", "f", "g", "h", "j", "k", "l", "n", "o", "p", "r", "s", "t", "u", "w", "x", "y", ",", ".", "/"]);
  if (!candidate.plain && !candidate.alt && browserKeys.has(key) && !((id === "undo" && key === "z" && !candidate.shift) || (id === "redo" && key === "z" && candidate.shift))) {
    return "That combination is reserved by common browser or system commands. Add Option/Alt or choose another key.";
  }
  const collision = (Array.isArray(bindings) ? bindings : SHORTCUT_BINDINGS).find(function (binding) {
    return binding.id !== id
      && Boolean(binding.plain) === Boolean(candidate.plain)
      && String(binding.key).toLowerCase() === key
      && String(binding.code) === String(candidate.code)
      && Boolean(binding.alt) === Boolean(candidate.alt)
      && bindingShift(binding, applePlatform) === Boolean(candidate.shift);
  });
  return collision ? "That combination is already assigned to “" + collision.label + ".”" : "";
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

  const bindings = Array.isArray(ctx.bindings) ? ctx.bindings : SHORTCUT_BINDINGS;
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
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

export function shortcutHelpRows(applePlatform, bindings) {
  const apple = Boolean(applePlatform);
  const rows = [];
  const byId = new Map();
  (Array.isArray(bindings) ? bindings : SHORTCUT_BINDINGS).forEach(function (binding) {
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
  resolveShortcutBindings: resolveShortcutBindings,
  captureShortcut: captureShortcut,
  validateShortcut: validateShortcut,
  matchArborShortcut: matchArborShortcut,
  shortcutHelpRows: shortcutHelpRows,
  formatShortcut: formatShortcut,
  usesCommandModifier: usesCommandModifier
};

if (typeof globalThis !== "undefined") globalThis.ArborShortcuts = arborShortcutApi;
