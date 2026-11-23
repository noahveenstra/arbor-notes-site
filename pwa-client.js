// Install affordance and explicit, user-initiated app-shell updates.

export const IOS_HINT_DISMISSED_KEY = "arbor.web.pwa-install-hint.dismissed";
export const INSTALL_PROMPT_DISMISSED_KEY = "arbor.web.pwa-install-prompt.dismissed";

const INSTALL_COPY = "Install Arbor on this device. This stores the app shell in this browser. It does not copy your notes.";
const IOS_HINT_COPY = "To install Arbor, tap Share, then Add to Home Screen.";
const UPDATE_COPY = "A new version of Arbor is ready.";

export function isStandaloneDisplay(matchMedia, navigatorLike) {
  try {
    if (matchMedia && matchMedia("(display-mode: standalone)").matches) return true;
  } catch (_) {}
  return Boolean(navigatorLike && navigatorLike.standalone === true);
}

export function isIosSafari(userAgent, platform, maxTouchPoints) {
  const ua = String(userAgent || "");
  const ipadOsDesktop = platform === "MacIntel" && Number(maxTouchPoints) > 1;
  const iosDevice = /iPad|iPhone|iPod/.test(ua) || ipadOsDesktop;
  if (!iosDevice) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\/|FBAN|FBAV/.test(ua)) return false;
  return /Safari/.test(ua);
}

export function installNoticeModel(input) {
  if (input.standalone) return { kind: "hidden", copy: "", actionLabel: "" };
  if (input.hasInstallPrompt && !input.promptDismissed) {
    return { kind: "prompt", copy: INSTALL_COPY, actionLabel: "Install Arbor" };
  }
  if (input.iosSafari && !input.hintDismissed) {
    return { kind: "ios-hint", copy: IOS_HINT_COPY, actionLabel: "" };
  }
  return { kind: "hidden", copy: "", actionLabel: "" };
}

export function shouldShowUpdateToast(hasController, workerState) {
  return Boolean(hasController) && workerState === "installed";
}

export function readDismissed(storage, key) {
  if (!storage) return false;
  try { return storage.getItem(key) === "1"; } catch (_) { return false; }
}

export function writeDismissed(storage, key) {
  if (!storage) return;
  try { storage.setItem(key, "1"); } catch (_) {}
}

function show(el, visible) {
  if (el) el.hidden = !visible;
}

export function applyInstallNotice(doc, model) {
  const notice = doc.getElementById("pwa-notice");
  const copy = doc.getElementById("pwa-notice-copy");
  const action = doc.getElementById("pwa-notice-action");
  const dismiss = doc.getElementById("pwa-notice-dismiss");
  const settings = doc.getElementById("pwa-settings-field");
  const settingsCopy = doc.getElementById("pwa-settings-copy");
  const settingsAction = doc.getElementById("pwa-settings-install");
  const visible = model.kind !== "hidden";
  if (copy) copy.textContent = model.copy;
  if (settingsCopy) settingsCopy.textContent = model.copy;
  show(notice, visible);
  show(settings, visible);
  show(action, Boolean(model.actionLabel));
  show(settingsAction, Boolean(model.actionLabel));
  if (action && model.actionLabel) action.textContent = model.actionLabel;
  if (settingsAction && model.actionLabel) settingsAction.textContent = model.actionLabel;
  show(dismiss, model.kind === "ios-hint" || model.kind === "prompt");
}

export function startPwaClient(doc, win) {
  const pagePath = win.location && win.location.pathname || "/";
  const lastSegment = pagePath.split("/").pop() || "";
  const appScope = pagePath.endsWith("/")
    ? pagePath
    : lastSegment.includes(".")
      ? pagePath.slice(0, pagePath.lastIndexOf("/") + 1) || "/"
      : `${pagePath}/`;
  const state = {
    standalone: false,
    hasInstallPrompt: false,
    promptDismissed: readDismissed(win.sessionStorage, INSTALL_PROMPT_DISMISSED_KEY),
    hintDismissed: readDismissed(win.localStorage, IOS_HINT_DISMISSED_KEY),
    iosSafari: isIosSafari(win.navigator.userAgent, win.navigator.platform, win.navigator.maxTouchPoints)
  };
  let deferredPrompt = null;

  function render() {
    state.standalone = isStandaloneDisplay(win.matchMedia ? win.matchMedia.bind(win) : null, win.navigator);
    doc.documentElement.classList.toggle("is-standalone", state.standalone);
    applyInstallNotice(doc, installNoticeModel(state));
  }

  function dismiss() {
    const model = installNoticeModel(state);
    if (model.kind === "ios-hint") {
      state.hintDismissed = true;
      writeDismissed(win.localStorage, IOS_HINT_DISMISSED_KEY);
    } else if (model.kind === "prompt") {
      state.promptDismissed = true;
      writeDismissed(win.sessionStorage, INSTALL_PROMPT_DISMISSED_KEY);
    }
    render();
  }

  function install() {
    const promptEvent = deferredPrompt;
    if (!promptEvent || typeof promptEvent.prompt !== "function") return;
    Promise.resolve(promptEvent.prompt()).then(function () {
      return promptEvent.userChoice;
    }).then(function () {
      deferredPrompt = null;
      state.hasInstallPrompt = false;
      render();
    }).catch(function () {
      deferredPrompt = null;
      state.hasInstallPrompt = false;
      render();
    });
  }

  const action = doc.getElementById("pwa-notice-action");
  const settingsAction = doc.getElementById("pwa-settings-install");
  const dismissButton = doc.getElementById("pwa-notice-dismiss");
  if (action) action.addEventListener("click", install);
  if (settingsAction) settingsAction.addEventListener("click", install);
  if (dismissButton) dismissButton.addEventListener("click", dismiss);

  win.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredPrompt = event;
    state.hasInstallPrompt = true;
    render();
  });
  win.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    state.hasInstallPrompt = false;
    render();
  });

  const update = doc.getElementById("pwa-update");
  const updateCopy = doc.getElementById("pwa-update-copy");
  const updateApply = doc.getElementById("pwa-update-apply");
  const updateDismiss = doc.getElementById("pwa-update-dismiss");
  if (updateCopy) updateCopy.textContent = UPDATE_COPY;
  let updateBusy = false;
  let updateRegistration = null;

  function setUpdateCopy(message) {
    if (updateCopy) updateCopy.textContent = message;
  }

  function setUpdateBusy(busy) {
    updateBusy = busy;
    if (updateApply) updateApply.disabled = busy;
    if (updateDismiss) updateDismiss.disabled = busy;
  }

  function cancelAppPreparation() {
    const app = win.arborWeb;
    if (app && typeof app.cancelShellUpdatePreparation === "function") app.cancelShellUpdatePreparation();
  }

  function sendApplyRequest(worker) {
    return new Promise(function (resolve) {
      const channel = new win.MessageChannel();
      let finished = false;
      const finish = function (result) {
        if (finished) return;
        finished = true;
        win.clearTimeout(timer);
        channel.port1.close();
        resolve(result);
      };
      const timer = win.setTimeout(function () { finish({ type: "ARBOR_UPDATE_TIMEOUT" }); }, 8000);
      channel.port1.onmessage = function (event) { finish(event.data || { type: "ARBOR_UPDATE_REJECTED" }); };
      try {
        worker.postMessage({ type: "ARBOR_APPLY_UPDATE" }, [channel.port2]);
      } catch (_) {
        channel.port2.close();
        finish({ type: "ARBOR_UPDATE_REJECTED" });
      }
    });
  }

  function waitForActivation(worker) {
    if (worker.state === "activated") return Promise.resolve(true);
    return new Promise(function (resolve) {
      let finished = false;
      const finish = function (activated) {
        if (finished) return;
        finished = true;
        win.clearTimeout(slowTimer);
        worker.removeEventListener("statechange", onStateChange);
        resolve(activated);
      };
      const onStateChange = function () {
        if (worker.state === "activated") finish(true);
        else if (worker.state === "redundant") finish(false);
      };
      const slowTimer = win.setTimeout(function () {
        setUpdateCopy("Still applying the update. Keep Arbor open…");
      }, 15_000);
      worker.addEventListener("statechange", onStateChange);
      onStateChange();
    });
  }

  async function applyUpdate() {
    if (updateBusy) return;
    setUpdateBusy(true);
    setUpdateCopy("Saving your note before updating…");
    let keepPreparationLocked = false;
    try {
      const app = win.arborWeb;
      if (!app || typeof app.prepareForShellUpdate !== "function") {
        setUpdateCopy("Arbor is still starting. Try again in a moment.");
        return;
      }
      const preparation = await app.prepareForShellUpdate();
      if (!preparation || !preparation.ok) {
        const messages = {
          capture: "Finish or submit quick capture before updating.",
          sample: "Sample preview edits reset on reload. Finish them before updating.",
          save: "Couldn't save this note. Resolve the save error, then retry."
        };
        setUpdateCopy(messages[preparation && preparation.reason] || "Arbor couldn't prepare safely. Try again in a moment.");
        return;
      }
      const serviceWorkers = win.navigator.serviceWorker;
      const registration = updateRegistration || win.__arborShellRegistration
        || (serviceWorkers && await serviceWorkers.getRegistration(appScope));
      const worker = registration && registration.waiting;
      if (!worker) {
        setUpdateCopy("The update is no longer waiting. Reopen Arbor to check again.");
        return;
      }

      const response = await sendApplyRequest(worker);
      if (response.type === "ARBOR_UPDATE_BLOCKED") {
        cancelAppPreparation();
        setUpdateCopy("Close other Arbor tabs, then try again.");
        return;
      }
      if (response.type !== "ARBOR_UPDATE_ACCEPTED") {
        setUpdateCopy("Arbor couldn't start the update. Keep this tab open and try again.");
        return;
      }

      setUpdateCopy("Applying update…");
      if (await waitForActivation(worker)) {
        keepPreparationLocked = true;
        win.location.reload();
        return;
      }
      setUpdateCopy("The update didn't finish activating. Keep this tab open and try again.");
    } catch (error) {
      console.warn("Arbor could not apply its app-shell update.", error);
      setUpdateCopy("Arbor couldn't apply the update. Keep this tab open and try again.");
    } finally {
      if (!keepPreparationLocked) {
        cancelAppPreparation();
        setUpdateBusy(false);
      }
    }
  }

  if (updateApply) updateApply.addEventListener("click", applyUpdate);
  if (updateDismiss && update) {
    updateDismiss.addEventListener("click", function () { if (!updateBusy) update.hidden = true; });
  }

  function showUpdate() {
    if (update) update.hidden = false;
  }

  if (win.navigator.serviceWorker && win.location && win.location.protocol !== "file:") {
    const registrationPromise = win.__arborShellRegistration
      ? Promise.resolve(win.__arborShellRegistration)
      : win.navigator.serviceWorker.register(new URL("sw.js", new URL(appScope, win.location.origin)).pathname, { scope: appScope, updateViaCache: "none" });
    registrationPromise.then(function (registration) {
      win.__arborShellRegistration = registration;
      updateRegistration = registration;
      function watch(worker) {
        if (!worker) return;
        worker.addEventListener("statechange", function () {
          if (shouldShowUpdateToast(win.navigator.serviceWorker.controller, worker.state)) {
            updateRegistration = registration;
            showUpdate();
          }
        });
      }
      if (registration.waiting && shouldShowUpdateToast(win.navigator.serviceWorker.controller, "installed")) {
        updateRegistration = registration;
        showUpdate();
      }
      watch(registration.installing);
      registration.addEventListener("updatefound", function () { watch(registration.installing); });
    }).catch(function (error) {
      console.warn("Arbor could not register the app shell.", error);
    });
  }

  try {
    const media = win.matchMedia("(display-mode: standalone)");
    if (media && typeof media.addEventListener === "function") media.addEventListener("change", render);
  } catch (_) {}
  render();
}

if (typeof document !== "undefined") startPwaClient(document, window);
