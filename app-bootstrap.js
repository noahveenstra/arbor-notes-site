// Wait for a complete cached release before starting the editor. The first
// visit reloads once after installation so all later app requests are served
// by one active shell worker. Updates never take over an already open editor.

const FIRST_CONTROL_RELOAD_KEY = "arbor.web.shell.first-control-reload";
const APP_BASE_URL = new URL("./", document.currentScript && document.currentScript.src || window.location.href);
const SERVICE_WORKER_URL = new URL("sw.js", APP_BASE_URL).pathname;
const SERVICE_WORKER_SCOPE = APP_BASE_URL.pathname;
const WORKER_OPTIONS = { scope: SERVICE_WORKER_SCOPE, updateViaCache: "none" };
const WORKER_READY_TIMEOUT_MS = 12_000;
const STARTUP_DEPENDENCY_TIMEOUT_MS = 15_000;
const STARTUP_SLOW_STATUS_MS = 10_000;
const CLOUDKIT_SCRIPT_URL = "https://cdn.apple-cloudkit.com/ck/2/cloudkit.js";
const PWA_CLIENT_URL = "./pwa-client.js?v=arb-94-update-action-20261119-a";
const UNDO_HISTORY_URL = "./undo-history.js?v=arb-216-list-undo-20261126-a";
const PASSAGE_ANCHOR_URL = "./passage-anchor.js?v=arb-161-verify-1";
const RUST_SEARCH_URL = "./rust-search.js?v=arb-125-integrity-20261126-a";
const NOTE_SORT_URL = "./note-sort.js?v=arb-138-note-sort-20261123-a";
const CLOUDKIT_WEB_ZONE_URL = "./cloudkit-web-zone.mjs?v=arb-17-native-field-contract-20261126-a";
const CLOUDKIT_WEB_SERVICES_URL = "./cloudkit-encrypted-web-services.mjs?v=arb-190-instant-launch-20261125-a";
const NOTE_SELECTION_URL = "./note-selection.mjs?v=arb-221-post370-20261127-a";
const NOTE_METADATA_URL = "./note-metadata.mjs?v=arb-221-post370-20261127-a";
const APP_SCRIPT_URL = "./app.js?v=arb-190-native-body-fallback-20261128";
const PROOFREADING_SCHEDULE_URL = "./proofreading-schedule.mjs?v=arb-always-on-proofreading-20261125-a";
let startupStatusTimer = null;

function clearStartupStatusTimer() {
  window.clearTimeout(startupStatusTimer);
  startupStatusTimer = null;
}

function setStartupStatus(message, slowMessage) {
  const status = document.getElementById("welcome-status");
  if (!status) return;
  clearStartupStatusTimer();
  status.hidden = false;
  status.classList.add("is-pending");
  status.textContent = message;
  if (slowMessage) {
    startupStatusTimer = window.setTimeout(function () {
      status.textContent = slowMessage;
    }, STARTUP_SLOW_STATUS_MS);
  }
}

function showBootError(error) {
  clearStartupStatusTimer();
  const message = document.getElementById("shell-boot-error");
  if (message) {
    message.hidden = false;
    const copy = message.querySelector("p");
    if (copy) {
      copy.textContent = error && /^APPLE_CLOUDKIT_/.test(String(error.code || ""))
        ? "Arbor couldn’t load Apple’s sign-in service. Check your connection, then reload."
        : "Arbor couldn’t finish starting. Reload to try again.";
    }
  }
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
    let finished = false;
    const finish = function (error) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    const onLoad = function () { finish(); };
    const onError = function () {
      const error = new Error("A required Arbor script could not be loaded.");
      if (source === CLOUDKIT_SCRIPT_URL) error.code = "APPLE_CLOUDKIT_LOAD_FAILED";
      finish(error);
    };
    const timer = window.setTimeout(function () {
      const error = new Error("A required Arbor script took too long to load.");
      if (source === CLOUDKIT_SCRIPT_URL) error.code = "APPLE_CLOUDKIT_LOAD_TIMEOUT";
      finish(error);
    }, STARTUP_DEPENDENCY_TIMEOUT_MS);
    script.src = source;
    script.async = true;
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    document.head.appendChild(script);
  });
}

function importModule(source) {
  return new Promise(function (resolve, reject) {
    let finished = false;
    const finish = function (error, value) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = window.setTimeout(function () {
      finish(new Error("An Arbor component took too long to load: " + source));
    }, STARTUP_DEPENDENCY_TIMEOUT_MS);
    import(source).then(function (value) {
      finish(null, value);
    }, function (error) {
      finish(error);
    });
  });
}

async function prepareShell() {
  setStartupStatus(
    "Preparing this browser…",
    "Arbor is still setting up this browser. Keep this page open; it will show a retry option if setup fails."
  );
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
  const rustSearchPromise = globalThis.ArborRustSearchCore
    ? Promise.resolve()
    : appendClassicScript(RUST_SEARCH_URL).catch(function (error) {
        console.warn("Arbor is starting with its browser lexical-search fallback.", error);
      });
  setStartupStatus(
    "Starting Arbor…",
    "Arbor is still starting. It is preparing the workspace and Apple sign-in connection."
  );
  if (!(await prepareShell())) return;
  for (const script of document.querySelectorAll("script[data-required-global]")) {
    if (!window[script.dataset.requiredGlobal]) throw new Error("A required Arbor component is unavailable: " + script.dataset.requiredGlobal);
  }
  if (window.__arborFirstControlReloadStarted) return;
  window.__arborFirstControlReloadStarted = true;
  setStartupStatus(
    "Loading Arbor’s workspace…",
    "Arbor is still loading its workspace. Keep this page open; it will show a retry option if a required component fails."
  );
  const preview = new URLSearchParams(window.location.search).get("preview");
  const isSamplePreview = preview === "sample" || preview === "large";
  let cloudKitLoaded = isSamplePreview;
  const cloudKitLoad = isSamplePreview
    ? Promise.resolve(null)
    : appendClassicScript(CLOUDKIT_SCRIPT_URL).then(function () {
      cloudKitLoaded = true;
      return null;
    }, function (error) {
      cloudKitLoaded = true;
      return error;
    });
  await importModule(PWA_CLIENT_URL);
  globalThis.ArborUndoHistory = await importModule(UNDO_HISTORY_URL);
  globalThis.ArborPassageAnchor = await importModule(PASSAGE_ANCHOR_URL);
  globalThis.ArborCloudKitWebZone = await importModule(CLOUDKIT_WEB_ZONE_URL);
  globalThis.ArborCloudKitWebServices = await importModule(CLOUDKIT_WEB_SERVICES_URL);
  globalThis.ArborNoteSelection = await importModule(NOTE_SELECTION_URL);
  globalThis.ArborNoteMetadata = await importModule(NOTE_METADATA_URL);
  try {
    globalThis.ArborProofreadingSchedule = await importModule(PROOFREADING_SCHEDULE_URL);
  } catch (error) {
    console.warn("Scheduled proofreading is unavailable.", error);
  }
  await rustSearchPromise;
  await appendClassicScript(NOTE_SORT_URL);
  if (!isSamplePreview && !cloudKitLoaded) {
    setStartupStatus(
      "Opening your notes…",
      "Arbor is opening notes saved in this browser. Apple sign-in continues in the background."
    );
  }
  window.__arborStartFromBootstrap = true;
  await appendClassicScript(APP_SCRIPT_URL);
  if (typeof window.arborWeb?.finishStartup !== "function") throw new Error("The Arbor editor could not start.");
  clearStartupStatusTimer();
  document.documentElement.classList.remove("is-preparing-shell");
  const cloudKitError = await cloudKitLoad;
  await window.arborWeb.finishStartup(cloudKitError);
}

const retry = document.getElementById("shell-boot-retry");
if (retry) retry.addEventListener("click", function () { window.location.reload(); });

startApp().catch(showBootError);
