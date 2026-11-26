import { changeSetting, defaultSettings, effectiveRules, loadSettings, resetSetting, RULES } from "./trigger-settings.mjs";
import { ACTIVE_LIST_IDS, matchList } from "./markdown-typing-list.mjs";

const storageKey = "arbor.web.markdown-typing.v1";
const control = name => document.getElementById("markdown-typing-" + name);
const form = control("form"), rule = control("rule"), trigger = control("trigger"), enabled = control("enabled");
const status = control("status");

function readSettings(fallback) {
  try { return loadSettings(localStorage.getItem(storageKey)); }
  catch { return fallback; }
}

let profile = readSettings(defaultSettings());
let rules = effectiveRules(profile);
let sessionOnly = false;

function setProfile(next) {
  profile = next;
  rules = effectiveRules(profile);
  window.dispatchEvent(new Event("arbor-markdown-typing-changed"));
}

function showRule() {
  const selected = rules.find(item => item.id === rule.value);
  const active = ACTIVE_LIST_IDS.includes(selected.id);
  control("availability").textContent = active
    ? "Available on web. The trigger applies when you type it followed by a space at the start of a line."
    : "Planned for web. You can save a preference now for when this shortcut becomes available.";
  const hint = {
    number: "Use {n} for the list number.",
    line: "Enter the characters before the space.",
    pair: "Use the same trigger on both sides of the words.",
  };
  control("hint").textContent = hint[selected.form] + " Default: " + selected.defaultTrigger;
  trigger.value = selected.trigger;
  trigger.removeAttribute("aria-invalid");
  trigger.removeAttribute("aria-errormessage");
  enabled.checked = selected.enabled;
}

function update(action) {
  let next;
  try {
    // Use the latest stored overrides so an open tab preserves edits to other rules.
    const current = sessionOnly ? profile : readSettings(profile);
    next = action(current);
  } catch (error) {
    trigger.setAttribute("aria-invalid", "true");
    trigger.setAttribute("aria-errormessage", status.id);
    status.textContent = error.message;
    return;
  }
  setProfile(next);
  showRule();
  try {
    if (Object.keys(next.overrides).length) localStorage.setItem(storageKey, JSON.stringify(next));
    else localStorage.removeItem(storageKey);
    sessionOnly = false;
    status.textContent = "Typing shortcut settings saved in this browser.";
  } catch {
    sessionOnly = true;
    status.textContent = "Settings applied for this visit. Browser storage is unavailable.";
  }
}

for (const active of [true, false]) {
  const group = document.createElement("optgroup");
  group.label = active ? "Available on web" : "Planned for web";
  for (const item of RULES) {
    if (ACTIVE_LIST_IDS.includes(item.id) === active) group.append(new Option(item.label, item.id));
  }
  rule.append(group);
}
rule.addEventListener("change", () => { showRule(); status.textContent = ""; });
form.addEventListener("submit", event => {
  event.preventDefault();
  update(current => changeSetting(current, rule.value, { trigger: trigger.value, enabled: enabled.checked }));
});
control("reset").addEventListener("click", () => update(current => resetSetting(current, rule.value)));
control("reset-all").addEventListener("click", () => update(defaultSettings));
window.addEventListener("storage", event => {
  if (event.storageArea !== localStorage || (event.key !== storageKey && event.key !== null)) return;
  const previous = rules.find(item => item.id === rule.value);
  const hasDraft = trigger.value !== previous.trigger || enabled.checked !== previous.enabled;
  sessionOnly = false;
  setProfile(readSettings(defaultSettings()));
  if (!hasDraft) showRule();
  status.textContent = hasDraft
    ? "Settings changed in another tab. Apply to save your edits."
    : "Typing shortcut settings updated from another tab.";
});

showRule();
form.hidden = false;
status.textContent = "";
window.ArborMarkdownTyping = Object.freeze({ matchList: marker => matchList(marker, rules) });
