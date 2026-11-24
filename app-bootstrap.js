// Wait for a complete cached release before starting the editor. The first
// visit reloads once after installation so all later app requests are served
// by one active shell worker. Updates never take over an already open editor.

const FIRST_CONTROL_RELOAD_KEY = "arbor.web.shell.first-control-reload";
const APP_BASE_URL = new URL("./", document.currentScript && document.currentScript.src || window.location.href);
const SERVICE_WORKER_URL = new URL("sw.js", APP_BASE_URL).pathname;
const SERVICE_WORKER_SCOPE = APP_BASE_URL.pathname;
const WORKER_OPTIONS = { scope: SERVICE_WORKER_SCOPE, updateViaCache: "none" };
const WORKER_READY_TIMEOUT_MS = 12_000;
const PWA_CLIENT_URL = "./pwa-client.js?v=arb-94-update-action-20261119-a";
const UNDO_HISTORY_URL = "./undo-history.js?v=arb-100-global-undo-20261119-a";
const PASSAGE_ANCHOR_URL = "./passage-anchor.js?v=recall-anchor-1";
const RUST_SEARCH_URL = "./rust-search.js?v=arb-120-rust-lexical-20261121-a";
const NOTE_SORT_URL = "./note-sort.js?v=arb-138-note-sort-20261123-a";
const ARBOR_CLOUDKIT_SYNC_URL = "./arbor-cloudkit-sync.mjs?v=arb-sync-state-1-20261124-a";
const APP_SCRIPT_URL = "./app.js?v=arb-178-sync-20261124-5f720d7";
const ARBOR_VIEW_URL = "./arbor-view.js?v=arb-178-voice-default-20261124-a";

function showBootError(error) {
  const message = document.getElementById("shell-boot-error");
  if (message) message.hidden = false;
  if (error) console.error("Arbor could not start.", error);
}

function waitForServiceWorkerReady(registration) {
  if (registration.active && registration.active.state === "activated") return Promise.resolve(true);
  const installing = registration.installing;
  if (!installing) return Promise.resolve(null);
  return new Promise(function (resolve) {
    let finished = false;
    const finish = function (ready) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      installing.removeEventListener("statechange", onStateChange);
      resolve(ready);
    };
    const onStateChange = function () {
      if (installing.state === "activated") finish(true);
      else if (installing.state === "redundant") finish(false);
    };
    const timer = window.setTimeout(function () { finish(false); }, WORKER_READY_TIMEOUT_MS);
    installing.addEventListener("statechange", onStateChange);
    onStateChange();
  });
}

function appendClassicScript(source) {
  return new Promise(function (resolve, reject) {
    const script = document.createElement("script");
    script.src = source;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.body.appendChild(script);
  });
}

async function prepareShell() {
  const serviceWorkers = navigator.serviceWorker;
  if (!serviceWorkers || window.location.protocol === "file:") return true;

  try {
    const registration = await serviceWorkers.register(SERVICE_WORKER_URL, WORKER_OPTIONS);
    window.__arborShellRegistration = registration;
    const workerReady = await waitForServiceWorkerReady(registration);
    if (workerReady === false) {
      showBootError();
      return false;
    }
    if (workerReady === null) return true;

    if (!serviceWorkers.controller) {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = window.sessionStorage.getItem(FIRST_CONTROL_RELOAD_KEY) === "1";
      } catch (_) {}
      if (!alreadyReloaded) {
        try { window.sessionStorage.setItem(FIRST_CONTROL_RELOAD_KEY, "1"); } catch (_) {}
        window.location.replace(window.location.href);
        return false;
      }
    }

    try { window.sessionStorage.removeItem(FIRST_CONTROL_RELOAD_KEY); } catch (_) {}
    return true;
  } catch (error) {
    // Browsers that block service workers still get the ordinary online client.
    console.warn("Arbor could not prepare its offline app shell.", error);
    return true;
  }
}

async function startApp() {
  if (!(await prepareShell())) return;
  if (window.__arborFirstControlReloadStarted) return;
  window.__arborFirstControlReloadStarted = true;
  await import(PWA_CLIENT_URL);
  globalThis.ArborUndoHistory = await import(UNDO_HISTORY_URL);
  globalThis.ArborPassageAnchor = await import(PASSAGE_ANCHOR_URL);
  globalThis.ArborCloudKitSync = await import(ARBOR_CLOUDKIT_SYNC_URL);
  try {
    await appendClassicScript(RUST_SEARCH_URL);
  } catch (error) {
    console.warn("Arbor is starting with its browser lexical-search fallback.", error);
  }
  await appendClassicScript(NOTE_SORT_URL);
  await appendClassicScript(APP_SCRIPT_URL);
  globalThis.ArborView = await import(ARBOR_VIEW_URL);
  globalThis.ArborView.mountArborView({ api: window.arborWeb });
  document.documentElement.classList.remove("is-preparing-shell");
}

const retry = document.getElementById("shell-boot-retry");
if (retry) retry.addEventListener("click", function () { window.location.reload(); });

startApp().catch(showBootError);
