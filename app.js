(function () {
  "use strict";

  const { parseMarkdownListItem, markdownHTML, serializeMarkdownList } = window.ArborMarkdown;
  const { field } = window.ArborCloudKitFields;
  const noteSorting = window.ArborNoteSorting;
  const noteSync = window.ArborNoteSync;
  const cloudKitWebZone = window.ArborCloudKitWebZone;
  const proofreadingDictionary = window.ArborPersonalProofreadingDictionary;
  const proofreadingDictionarySync = window.ArborProofreadingDictionarySync;
  const keyboardShortcutPreferences = window.ArborKeyboardShortcutPreferences;
  const keyboardShortcutSync = window.ArborKeyboardShortcutSync;
  const { lexicalSearchNotes: searchLexically, semanticOnlySuggestions } = window.ArborSearchLogic;
  const launchLibrary = window.ArborLaunchLibrary;
  const config = window.ARBOR_CLOUDKIT_CONFIG || { demoMode: false };
  const previewMode = new URLSearchParams(window.location.search).get("preview");
  const largeDemoMode = previewMode === "large";
  const demoMode = Boolean(config.demoMode) || previewMode === "sample" || largeDemoMode;
  const $ = function (id) { return document.getElementById(id); };
  const savedNoteTabs = loadPreference("arbor.web.open-tabs.v1", { recordNames: [], activeRecordName: "" });
  const frame = $("app-frame");
  const state = {
    container: null,
    arborCloudKitTransport: null,
    arborStateSync: null,
    arborSyncStatus: null,
    arborSignOutGuardInstalled: false,
    database: null,
    nativeZoneID: null,
    nativeZoneExists: false,
    nativeSchema: false,
    user: null,
    demo: false,
    largeDemo: false,
    loadingRecords: false,
    libraryLoadSlow: false,
    libraryLoadSlowMessage: "",
    loadRecordsErrorMessage: "",
    libraryLoadOperation: "",
    records: new Map(),
    notes: [],
    folders: [],
    pendingNewNoteRecords: new Set(),
    pendingNewNoteNavigation: new Map(),
    restoreHiddenNoteName: "",
    selectedFolder: "",
    showingArchive: false,
    actionMenuRecordName: null,
    actionMenuInvoker: null,
    listCursor: null,
    selectedRecordName: null,
    selectedRecord: null,
    openNoteTabs: Array.isArray(savedNoteTabs.recordNames) ? savedNoteTabs.recordNames.filter(function (name) { return typeof name === "string" && name.length <= 256; }).slice(0, 100) : [],
    activeNoteTabName: typeof savedNoteTabs.activeRecordName === "string" ? savedNoteTabs.activeRecordName : "",
    noteHistory: { recordNames: [], index: -1 },
    noteHistoryAccountKey: "",
    skipNextListTransition: false,
    editor: null,
    saveTimer: null,
    realtimeSyncTimer: null,
    realtimeSyncPromise: null,
    realtimeNotificationListenerAdded: false,
    savePromise: Promise.resolve(),
    noteStyleSavePromise: Promise.resolve(),
    saveFlightCount: 0,
    saveGeneration: 0,
    draftBaseline: null,
    connectionUserID: null,
    dirty: false,
    bodyDirty: false,
    undoHistory: null,
    undoHistoryAccountKey: "",
    undoHistoryClosePromise: null,
    historyCommandPromise: null,
    undoPersistenceWarned: false,
    replayingHistory: false,
    autoCorrectionApplying: false,
    autoCorrectionReturnBoundary: null,
    automaticSpellingRequests: new Map(),
    editorHistoryBaseline: null,
    query: "",
    toastTimer: null,
    deviceID: getDeviceID(),
    cacheKey: null,
    dictionaryEntries: [],
    dictionaryPending: [],
    dictionarySyncPromise: null,
    dictionarySyncStatus: "Sign in to sync your dictionary.",
    dictionarySyncError: null,
    shortcutOperations: [],
    shortcutStorageKey: "",
    shortcutBindings: [],
    shortcutSyncPromise: null,
    shortcutSyncTimer: 0,
    shortcutSyncStatus: "Sign in to sync shortcuts with your Apple Account.",
    shortcutSyncError: null,
    shortcutRecordingId: "",
    syncToken: null,
    syncBaselines: new Map(),
    pendingRemoteRecords: new Map(),
    cacheDBPromise: null,
    bodyCache: new Map(),
    previewCache: new Map(),
    previewLoadErrors: new Set(),
    previewObserver: null,
    previewQueue: [],
    previewQueuedNames: new Set(),
    previewActiveCount: 0,
    cacheWriteTimer: null,
    editQueue: [],
    titleQueryTimer: 0,
    titleQueryRequest: 0,
    paintedFromCache: false,
    paintPromise: null,
    startupFinished: false,
    accountSession: 0,
    accountCacheSuspended: false,
    layout: loadPreference("arbor.web.layout.v1", { sidebarWidth: 195, listWidth: 340, sidebarCollapsed: false }),
    appearance: loadPreference("arbor.web.appearance.v1", { bodyWidth: 70, bodySize: 18, theme: "system", font: "sans", headerFont: "sans", bodyFont: "sans", textSize: "small", margins: "compact" }),
    preferences: loadPreference("arbor.web.preferences.v1", { tabsEnabled: false, confirmFolderArchive: true, checkGrammarSuggestions: true, checkSentenceCapitalization: true, autoCorrectHighConfidence: true, noteSortOrder: "created-newest" }),
    accountSettings: loadPreference("arbor.web.account.v1", { name: "" }),
    searchItems: [],
    searchActiveIndex: -1,
    searchPage: false,
    searchQuery: "",
    semanticSearchQuery: "",
    semanticLoadingQuery: "",
    semanticErrorQuery: "",
    semanticProgress: null,
    semanticQueryVector: null,
    semanticScores: new Map(),
    semanticPassages: new Map(),
    semanticResultRevisions: new Map(),
    semanticPendingNoteIds: new Set(),
    semanticCurrentRequest: null,
    semanticWorker: null,
    semanticWorkerBusy: false,
    semanticWorkerRequestId: 0,
    semanticActiveRequest: null,
    semanticPrepared: null,
    semanticPendingRequest: null,
    semanticWorkerTimer: 0,
    semanticIndexTimer: 0,
    semanticLastActivity: 0,
    semanticRevisionSequence: Date.now(),
    semanticWorkerIdleTimer: 0,
    semanticWorkerIdleGeneration: 0,
    semanticWorkerUnavailable: false,
    proofreadingWorker: null,
    proofreadingRequestId: 0,
    proofreadingTimer: 0,
    proofreadingPending: null,
    capitalizationContextTimer: 0,
    capitalizationContextRequestId: 0,
    capitalizationContextPending: null,
    capitalizationContextRerun: false,
    capitalizationContextLastKey: "",
    capitalizationContextCache: new Map(),
    capitalizationContextTimeout: 0,
    selectionReviewWorker: null,
    selectionReviewRequestId: 0,
    selectionReviewPending: null,
    spellingContextRankRequestId: 0,
    spellingContextRankRequests: new Map(),
    selectionReviewContext: null,
    selectionReviewResult: null,
    selectionReviewPositionFrame: 0,
    selectionReviewApplying: false,
    proofreadingCorrections: new Map(),
    proofreadingIgnored: new Map(),
    proofreadingActive: null,
    proofreadingPopoverSessionId: 0,
    proofreadingKeyboardOpen: false,
    proofreadingCloseTimer: 0,
    proofreadingFocusSelection: null,
    proofreadingLastPointerType: "",
    semanticRequestId: 0,
    semanticRequestedQuery: "",
    semanticTimer: 0,
    searchPromptTimer: 0,
    searchPromptIndex: 0,
    searchPromptActive: false,
    showCreatedDate: false,
    aboutActiveTab: "information",
    aboutCloseTimer: 0
  };
  const FONT_OPTIONS = { sans: "var(--font-sans)", serif: "var(--font-serif)", mono: "var(--font-mono)", pixel: "var(--font-pixel)" };
  const FONT_LABELS = { sans: "Sans", serif: "Serif", mono: "Mono", pixel: "Pixel" };
  const SPELLING_CONTEXT_RANK_TIMEOUT_MS = 30_000;
  const AUTO_CORRECTION_CONTEXT_TIMEOUT_MS = 30_000;
  const SEMANTIC_WORKER_IDLE_UNLOAD_MS = 120_000;
  const SEMANTIC_WORKER_TIMEOUT_MS = 180_000;
  const SEMANTIC_INDEX_IDLE_GRACE_MS = 700;
  const SEMANTIC_FIRST_ANSWER_NOTES = 2;
  const SEMANTIC_FIRST_ANSWER_PASSAGES = 32;
  const SEMANTIC_BACKGROUND_BATCH_NOTES = 4;
  const SEMANTIC_BACKGROUND_BATCH_PASSAGES = 64;
  const MARGIN_OPTIONS = { condensed: 84, compact: 70, normal: 64, roomy: 58, spacious: 52 };
  const TEXT_SIZE_OPTIONS = { xsmall: 14, small: 18, medium: 20, large: 22, xlarge: 24 };
  const OPEN_NOTE_TABS_KEY = "arbor.web.open-tabs.v1";
  const SHORTCUT_PREFERENCE_PREFIX = (keyboardShortcutPreferences ? keyboardShortcutPreferences.contract.storageKey : "arbor.web.shortcut-preferences.v1") + ".";
  const SHORTCUT_SYNC_INTERVAL_MS = 30000;
  state.openNoteTabs = Array.from(new Set(state.openNoteTabs)).slice(-100);
  if (!state.openNoteTabs.includes(state.activeNoteTabName)) state.activeNoteTabName = state.openNoteTabs[state.openNoteTabs.length - 1] || "";
  normalizeSettingsPreferences();
  if (keyboardShortcutPreferences) state.shortcutOperations = keyboardShortcutPreferences.normalizeOperations(state.shortcutOperations);
  if (window.ArborShortcuts) state.shortcutBindings = window.ArborShortcuts.resolveShortcutBindings(state.shortcutOperations);
  let captureResizeAnimation = null;
  let layoutMotionReadyScheduled = false;
  let shortcutCloseTimer = 0;
  let themeTransitionGeneration = 0;
  let noteListTransitionGeneration = 0;
  let folderActionPath = "";
  let folderActionInvoker = null;
  let folderArchivePendingPath = "";
  const disclosureAnimations = new WeakMap();
  const textSwapAnimations = new WeakMap();
  let libraryWriteChain = Promise.resolve();
  let accountPersistenceChain = Promise.resolve();
  let accountCacheModulePromise = null;

  function setMotionVisibility(element, visible, afterHide) {
    if (!element) return;
    const active = disclosureAnimations.get(element);
    const isVisible = Boolean(visible);
    if (active && active.visible === isVisible) return;
    if (!active && element.hidden === !isVisible) return;

    const currentStyle = active ? getComputedStyle(element) : null;
    const currentOpacity = currentStyle ? currentStyle.opacity : null;
    const currentTransform = currentStyle ? currentStyle.transform : null;
    if (active) {
      active.animation.cancel();
      disclosureAnimations.delete(element);
    }

    element.inert = !isVisible;
    element.setAttribute("aria-hidden", String(!isVisible));
    if (isVisible) element.hidden = false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof element.animate !== "function") {
      element.hidden = !isVisible;
      element.inert = !isVisible;
      if (!isVisible && typeof afterHide === "function") afterHide();
      return;
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const rawDuration = rootStyle.getPropertyValue("--motion-fade-duration").trim();
    const numericDuration = Number.parseFloat(rawDuration);
    const duration = numericDuration ? numericDuration * (rawDuration.endsWith("ms") ? 1 : 1000) : 200;
    const rawEasing = rootStyle.getPropertyValue("--ease-standard").trim();
    const easing = rawEasing && window.CSS && CSS.supports("animation-timing-function", rawEasing) ? rawEasing : "ease-out";
    const baseTransform = getComputedStyle(element).transform;
    const fromOpacity = active ? currentOpacity : (isVisible ? "0" : "1");
    const fromTransform = active ? currentTransform : (isVisible ? "translateY(6px) scale(.985)" : baseTransform);
    const toOpacity = isVisible ? "1" : "0";
    const toTransform = isVisible ? baseTransform : "translateY(5px) scale(.99)";
    const animation = element.animate(
      [{ opacity: fromOpacity, transform: fromTransform }, { opacity: toOpacity, transform: toTransform }],
      { duration: duration, easing: easing, fill: isVisible ? "none" : "forwards" }
    );
    const entry = { animation: animation, visible: isVisible };
    disclosureAnimations.set(element, entry);
    animation.onfinish = function () {
      if (disclosureAnimations.get(element) !== entry) return;
      disclosureAnimations.delete(element);
      if (!isVisible) {
        element.hidden = true;
        element.inert = false;
        animation.cancel();
        if (typeof afterHide === "function") afterHide();
      }
    };
  }

  function enqueueAccountPersistence(task) {
    const run = accountPersistenceChain.then(task, task);
    accountPersistenceChain = run.then(function () {}, function () {});
    return run;
  }

  function loadAccountCache() {
    if (!accountCacheModulePromise) {
      const script = document.querySelector("script[src*='app.js']");
      const base = script && script.src ? script.src : window.location.href;
      accountCacheModulePromise = import(new URL("./account-cache.js?v=arb-190-instant-launch-20261125-a", base).href);
    }
    return accountCacheModulePromise;
  }

  function onAccountCacheBlocked(name) {
    console.warn("Arbor is waiting to delete cached notes (" + name + ") because another tab still has that database open.");
  }

  // account-cache.js calls this from clearAccountCaches. It is the ARB-13
  // clearDrafts (arbor.web.drafts.v1), safe to run more than once.
  function clearDraftsHook() {
    clearDrafts();
    clearOpenNoteTabs();
  }

  function loadPreference(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" ? Object.assign({}, fallback, value) : Object.assign({}, fallback);
    } catch (_) { return Object.assign({}, fallback); }
  }

  function loadShortcutOperations(key) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || "null");
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function normalizeSettingsPreferences() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem("arbor.web.appearance.v1") || "null"); } catch (_) {}
    const appearance = state.appearance;
    const has = function (key) { return Boolean(stored && Object.prototype.hasOwnProperty.call(stored, key)); };
    if (!has("margins") || !Object.prototype.hasOwnProperty.call(MARGIN_OPTIONS, appearance.margins)) {
      const previousWidth = Number(stored && stored.bodyWidth) || 70;
      appearance.margins = Object.keys(MARGIN_OPTIONS).reduce(function (best, key) {
        return Math.abs(MARGIN_OPTIONS[key] - previousWidth) < Math.abs(MARGIN_OPTIONS[best] - previousWidth) ? key : best;
      }, "compact");
    }
    if (!has("textSize") || !Object.prototype.hasOwnProperty.call(TEXT_SIZE_OPTIONS, appearance.textSize)) {
      const previousSize = Number(stored && stored.bodySize) || 18;
      appearance.textSize = Object.keys(TEXT_SIZE_OPTIONS).reduce(function (best, key) {
        return Math.abs(TEXT_SIZE_OPTIONS[key] - previousSize) < Math.abs(TEXT_SIZE_OPTIONS[best] - previousSize) ? key : best;
      }, "small");
    }
    if (!Object.prototype.hasOwnProperty.call(FONT_OPTIONS, appearance.font)) appearance.font = "sans";
    if (!has("headerFont") || !Object.prototype.hasOwnProperty.call(FONT_OPTIONS, appearance.headerFont)) appearance.headerFont = appearance.font;
    if (!has("bodyFont") || !Object.prototype.hasOwnProperty.call(FONT_OPTIONS, appearance.bodyFont)) appearance.bodyFont = appearance.font;
    appearance.font = appearance.bodyFont;
    if (!["system", "dark", "light"].includes(appearance.theme)) appearance.theme = "system";
    appearance.bodyWidth = MARGIN_OPTIONS[appearance.margins];
    appearance.bodySize = TEXT_SIZE_OPTIONS[appearance.textSize];
    state.preferences.tabsEnabled = Boolean(state.preferences.tabsEnabled);
    state.preferences.confirmFolderArchive = state.preferences.confirmFolderArchive !== false;
    state.preferences.checkGrammarSuggestions = state.preferences.checkGrammarSuggestions !== false;
    state.preferences.checkSentenceCapitalization = state.preferences.checkSentenceCapitalization !== false;
    state.preferences.autoCorrectHighConfidence = state.preferences.autoCorrectHighConfidence !== false;
    state.preferences.noteSortOrder = noteSorting.normalizeOrder(state.preferences.noteSortOrder);
    state.accountSettings.name = String(state.accountSettings.name || "").slice(0, 80);
  }

  function libraryCacheKey(userID) {
    return [config.containerIdentifier || "arbor", config.environment || "development", config.schemaMode || "auto", userID].join("::");
  }

  function shortcutPreferenceStorageKey(userID) {
    return SHORTCUT_PREFERENCE_PREFIX + encodeURIComponent(String(userID || ""));
  }

  function openLibraryCacheDB() {
    if (!window.indexedDB || state.accountCacheSuspended) return Promise.resolve(null);
    if (state.cacheDBPromise) return state.cacheDBPromise;
    const opening = loadAccountCache().then(function (cache) {
      if (!window.indexedDB || state.accountCacheSuspended) return null;
      return new Promise(function (resolve) {
        const request = indexedDB.open(cache.LIBRARY_CACHE_DATABASE, 1);
        request.onupgradeneeded = function () {
          const db = request.result;
          if (!db.objectStoreNames.contains("libraries")) db.createObjectStore("libraries", { keyPath: "key" });
        };
        request.onsuccess = function () {
          const db = request.result;
          db.onversionchange = function () { db.close(); };
          if (state.accountCacheSuspended) { db.close(); resolve(null); return; }
          resolve(db);
        };
        request.onerror = function () { resolve(null); };
        request.onblocked = function () { resolve(null); };
      });
    }).catch(function () { return null; });
    state.cacheDBPromise = opening;
    opening.then(function (db) {
      if (!db && state.cacheDBPromise === opening) state.cacheDBPromise = null;
    });
    return opening;
  }

  async function closeLibraryCacheDB() {
    const pending = state.cacheDBPromise;
    state.cacheDBPromise = null;
    if (!pending) return;
    try {
      const db = await pending;
      if (db && typeof db.close === "function") db.close();
    } catch (_) {}
  }

  function cancelSemanticWorkerIdleUnload() {
    state.semanticWorkerIdleGeneration += 1;
    window.clearTimeout(state.semanticWorkerIdleTimer);
    state.semanticWorkerIdleTimer = 0;
  }

  function stopSemanticWorker() {
    cancelSemanticWorkerIdleUnload();
    state.semanticPendingRequest = null;
    state.semanticActiveRequest = null;
    state.semanticWorkerBusy = false;
    state.semanticWorkerRequestId = 0;
    state.semanticPrepared = null;
    state.semanticRequestId += 1;
    window.clearTimeout(state.semanticWorkerTimer);
    window.clearTimeout(state.semanticTimer);
    window.clearTimeout(state.semanticIndexTimer);
    if (state.semanticWorker) {
      state.semanticWorker.terminate();
      state.semanticWorker = null;
    }
  }

  async function detachUndoHistory() {
    const history = state.undoHistory;
    state.undoHistory = null;
    state.undoHistoryAccountKey = "";
    updateUndoControls();
    if (!history) {
      if (state.undoHistoryClosePromise) await state.undoHistoryClosePromise;
      return;
    }
    let closing;
    closing = Promise.resolve().then(function () { return history.close(); }).catch(function () {}).finally(function () {
      if (state.undoHistoryClosePromise === closing) state.undoHistoryClosePromise = null;
    });
    state.undoHistoryClosePromise = closing;
    await closing;
  }

  async function releaseAccountCacheConnections() {
    await detachUndoHistory();
    stopSemanticWorker();
    // The vector cache is opened on the page itself, not only in the worker.
    // Close it and drop in-memory vectors before the database is deleted.
    try { await (await loadSemanticIndex()).resetSemanticIndex({ broadcast: true }); } catch (_) {}
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
    window.clearTimeout(state.cacheWriteTimer);
    state.cacheWriteTimer = null;
    window.clearTimeout(state.saveTimer);
    state.saveTimer = null;
    try { await libraryWriteChain; } catch (_) {}
    await closeLibraryCacheDB();
  }

  function discardInMemoryLibrary() {
    window.clearInterval(state.realtimeSyncTimer);
    state.realtimeSyncTimer = null;
    state.realtimeSyncPromise = null;
    window.clearTimeout(state.saveTimer);
    state.saveTimer = null;
    state.dirty = false;
    state.loadingRecords = false;
    state.libraryLoadSlow = false;
    state.libraryLoadSlowMessage = "";
    state.loadRecordsErrorMessage = "";
    state.records = new Map();
    state.pendingNewNoteRecords.clear();
    state.pendingNewNoteNavigation.clear();
    state.restoreHiddenNoteName = "";
    state.dictionaryEntries = [];
    state.dictionaryPending = [];
    state.dictionarySyncPromise = null;
    state.dictionarySyncStatus = "Sign in to sync your dictionary.";
    state.dictionarySyncError = null;
    state.bodyCache = new Map();
    resetPreviewHydration();
    state.previewCache = new Map();
    state.previewLoadErrors = new Set();
    state.notes = [];
    state.folders = [];
    state.syncToken = null;
    state.editQueue = [];
    state.syncBaselines.clear();
    state.pendingRemoteRecords.clear();
    state.nativeZoneID = null;
    state.nativeZoneExists = false;
    state.selectedFolder = "";
    state.showingArchive = false;
    state.actionMenuRecordName = null;
    state.actionMenuInvoker = null;
    state.query = "";
    state.searchQuery = "";
    state.searchPage = false;
    state.searchItems = [];
    state.searchActiveIndex = -1;
    state.semanticSearchQuery = "";
    state.semanticLoadingQuery = "";
    state.semanticErrorQuery = "";
    state.semanticRequestedQuery = "";
    state.semanticScores = new Map();
    state.semanticPassages = new Map();
    state.semanticResultRevisions = new Map();
    state.semanticPendingNoteIds = new Set();
    state.semanticCurrentRequest = null;
    state.semanticProgress = null;
    state.semanticQueryVector = null;
    state.showCreatedDate = false;
    stopSemanticWorker();
    const searchInput = $("global-search-input");
    if (searchInput) searchInput.value = "";
    const searchDialog = $("search-dialog");
    if (searchDialog && searchDialog.open) searchDialog.close();
    const title = $("note-title");
    if (title) title.value = "";
    if ($("note-workspace") && $("empty-state") && $("rich-editor")) selectNote(null);
  }

  function accountCacheEnvironment() {
    return {
      indexedDB: window.indexedDB,
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
      caches: window.caches,
      clearDrafts: clearDraftsHook,
      onBlocked: onAccountCacheBlocked,
      prepareForDelete: releaseAccountCacheConnections
    };
  }

  async function openUndoHistoryForAccount(accountKey, memoryOnly) {
    const key = String(accountKey || "");
    if (!key || !window.ArborUndoHistory || typeof window.ArborUndoHistory.openUndoHistory !== "function") return;
    if (state.undoHistory && state.undoHistoryAccountKey === key) return;
    await detachUndoHistory();
    state.undoHistory = await window.ArborUndoHistory.openUndoHistory({
      indexedDB: window.indexedDB,
      accountKey: key,
      memoryOnly: Boolean(memoryOnly),
      onChange: updateUndoControls
    });
    state.undoHistoryAccountKey = key;
    updateUndoControls();
  }

  function recordUndoAction(action) {
    if (!state.undoHistory || state.replayingHistory) return;
    state.undoHistory.record(action).then(function (saved) {
      if (saved === false && !state.demo && !state.undoPersistenceWarned) {
        state.undoPersistenceWarned = true;
        showToast("Undo is available in this tab, but could not be saved for your next visit.", true);
      }
    }).catch(function () {
      if (!state.demo && !state.undoPersistenceWarned) {
        state.undoPersistenceWarned = true;
        showToast("Undo is available in this tab, but could not be saved for your next visit.", true);
      }
    });
  }

  async function restoreLibraryCache() {
    if (!state.cacheKey || state.accountCacheSuspended) return false;
    const db = await openLibraryCacheDB();
    if (!db) return false;
    return await new Promise(function (resolve) {
      try {
        const request = db.transaction("libraries", "readonly").objectStore("libraries").get(state.cacheKey);
        request.onsuccess = function () {
          if (state.accountCacheSuspended || !state.cacheKey) { resolve(false); return; }
          const cached = request.result;
          if (!cached || !Array.isArray(cached.records)) { resolve(false); return; }
          state.records = new Map(cached.records.map(function (record) { return [record.recordName, record]; }));
          state.syncToken = cached.syncToken || null; state.nativeZoneID = cached.nativeZoneID || null;
          state.bodyCache = new Map(Array.isArray(cached.bodies) ? cached.bodies : []);
          state.dictionaryEntries = proofreadingDictionary.normalizeSnapshotEntries(cached.dictionaryEntries);
          state.dictionaryPending = proofreadingDictionary.normalizeSnapshotEntries(cached.dictionaryPending);
          state.dictionaryEntries = proofreadingDictionary.mergeSnapshotEntries(state.dictionaryEntries, state.dictionaryPending);
          state.nativeSchema = config.schemaMode === "web" ? false : cached.nativeSchema !== false;
          if (config.schemaMode === "web" && cached.nativeSchema !== false) {
            state.nativeZoneID = null;
            state.nativeZoneExists = false;
            state.syncToken = null;
          } else {
            state.nativeZoneExists = Boolean(state.nativeZoneID);
          }
          state.loadingRecords = true;
          renderPersonalDictionarySettings();
          resolve(state.records.size > 0 || state.bodyCache.size > 0 || state.dictionaryEntries.length > 0 || state.dictionaryPending.length > 0);
        };
        request.onerror = function () { resolve(false); };
      } catch (_) { resolve(false); }
    });
  }

  function cacheableRecord(record) {
    const copy = JSON.parse(JSON.stringify(record));
    if (copy.fields) {
      delete copy.fields.CD_text; delete copy.fields.text;
      delete copy.fields.CD_text_ckAsset; delete copy.fields.text_ckAsset;
      delete copy.fields.body; delete copy.fields.bodyAsset;
    }
    return copy;
  }

  async function writeLibraryCache() {
    if (state.accountCacheSuspended || !state.cacheKey || !state.database) return;
    const db = await openLibraryCacheDB();
    if (state.accountCacheSuspended || !state.cacheKey || !db) return;
    const records = Array.from(state.records.values())
      .filter(function (record) {
        return cloudKitWebZone.isNoteOrFolderRecord(record) && !state.pendingNewNoteRecords.has(record.recordName);
      })
      .map(cacheableRecord);
    const bodies = Array.from(state.bodyCache.entries());
    await new Promise(function (resolve) {
      try {
        const tx = db.transaction("libraries", "readwrite");
        tx.objectStore("libraries").put({
          key: state.cacheKey, nativeZoneID: state.nativeZoneID, nativeSchema: state.nativeSchema, syncToken: state.syncToken,
          records: records, bodies: bodies, dictionaryEntries: state.dictionaryEntries,
          dictionaryPending: state.dictionaryPending, updatedAt: Date.now()
        });
        tx.oncomplete = function () { resolve(); }; tx.onerror = function () { resolve(); }; tx.onabort = function () { resolve(); };
      } catch (_) { resolve(); }
    });
  }

  function scheduleLibraryCacheWrite() {
    if (state.accountCacheSuspended || !state.cacheKey) return;
    window.clearTimeout(state.cacheWriteTimer);
    state.cacheWriteTimer = window.setTimeout(function () {
      const write = libraryWriteChain.then(function () { return writeLibraryCache(); }, function () { return writeLibraryCache(); });
      libraryWriteChain = write.then(function () {}, function () {});
    }, 250);
  }

  function renderPersonalDictionarySettings() {
    const status = $("personal-dictionary-status");
    if (status) {
      status.textContent = state.dictionarySyncStatus;
      status.dataset.state = state.dictionarySyncError ? "error" : (state.dictionarySyncPromise ? "syncing" : "ready");
    }
    const list = $("personal-dictionary-entries");
    if (!list) return;
    list.replaceChildren();
    const entries = state.dictionaryEntries
      .filter(function (entry) { return !entry.isDeleted; })
      .sort(function (left, right) { return left.term.localeCompare(right.term, undefined, { sensitivity: "base" }); });
    if (!entries.length) {
      const empty = document.createElement("li");
      empty.className = "personal-dictionary-empty";
      empty.textContent = state.user ? "No words added yet." : "Sign in with Apple to manage synced words.";
      list.appendChild(empty);
      return;
    }
    entries.forEach(function (entry) {
      const row = document.createElement("li");
      row.className = "personal-dictionary-entry";
      const term = document.createElement("span");
      term.textContent = entry.term;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "personal-dictionary-remove";
      remove.dataset.dictionaryRemove = entry.term;
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove " + entry.term + " from dictionary");
      row.append(term, remove);
      list.appendChild(row);
    });
  }

  function dictionaryTerms() {
    return state.dictionaryEntries.filter(function (entry) { return !entry.isDeleted; }).map(function (entry) { return entry.term; });
  }

  function sameDictionaryOperation(left, right) {
    return left && right && left.normalizedTerm === right.normalizedTerm
      && left.modifiedAt === right.modifiedAt && left.isDeleted === right.isDeleted;
  }

  function updateDictionaryState(entries, pending) {
    state.dictionaryPending = proofreadingDictionary.normalizeSnapshotEntries(pending);
    state.dictionaryEntries = proofreadingDictionary.mergeSnapshotEntries(entries, state.dictionaryPending);
    renderPersonalDictionarySettings();
    scheduleLibraryCacheWrite();
    const body = $("note-body");
    if (body && state.selectedRecordName) scheduleProofreading(body, 0);
  }

  function queuePersonalDictionaryOperation(rawTerm, isDeleted) {
    const normalized = proofreadingDictionary.normalizeDictionaryEntry(rawTerm);
    if (!normalized) {
      state.dictionarySyncStatus = "Enter a word to add.";
      renderPersonalDictionarySettings();
      return Promise.resolve(false);
    }
    const existing = state.dictionaryEntries.find(function (item) { return item.normalizedTerm === normalized.key; });
    if (isDeleted && (!existing || existing.isDeleted)) return Promise.resolve(false);
    if (!isDeleted && existing && !existing.isDeleted) {
      showToast("“" + existing.term + "” is already in your dictionary.");
      return Promise.resolve(true);
    }
    const operation = {
      term: existing ? existing.term : normalized.term,
      normalizedTerm: normalized.key,
      isDeleted: Boolean(isDeleted),
      modifiedAt: new Date().toISOString()
    };
    const pending = state.dictionaryPending.filter(function (item) { return item.normalizedTerm !== operation.normalizedTerm; });
    pending.push(operation);
    updateDictionaryState(state.dictionaryEntries, pending);
    state.dictionarySyncError = null;
    state.dictionarySyncStatus = state.demo ? "Added for this preview." : "Saved on this browser. Syncing with iCloud…";
    renderPersonalDictionarySettings();
    if (state.demo) {
      state.dictionaryPending = [];
      state.dictionarySyncStatus = "Preview only; this word is not synced.";
      updateDictionaryState(state.dictionaryEntries, []);
      return Promise.resolve(true);
    }
    if (!state.database || state.accountCacheSuspended) {
      state.dictionarySyncStatus = "Saved on this browser. Sign in to sync it with iCloud.";
      renderPersonalDictionarySettings();
      return Promise.resolve(false);
    }
    return syncPersonalDictionary(state.accountSession).then(function (synced) {
      if (synced) showToast(isDeleted ? "Removed from your proofreading dictionary." : "Added to your proofreading dictionary.");
      else showToast("Saved on this browser. Waiting for iCloud to sync.", true);
      return synced;
    });
  }

  function syncPersonalDictionary(session) {
    if (state.demo) return Promise.resolve(true);
    if (!state.database || state.accountCacheSuspended || session !== state.accountSession) return Promise.resolve(false);
    if (state.dictionarySyncPromise) return state.dictionarySyncPromise;
    state.dictionarySyncError = null;
    state.dictionarySyncStatus = "Syncing proofreading dictionary…";
    renderPersonalDictionarySettings();
    const database = state.database;
    const run = (async function () {
      try {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          if (session !== state.accountSession || database !== state.database) return false;
          const pendingAtStart = state.dictionaryPending.slice();
          const result = await proofreadingDictionarySync.synchronize(database, pendingAtStart);
          if (session !== state.accountSession || database !== state.database) return false;
          const settled = result.settled || [];
          const remaining = state.dictionaryPending.filter(function (operation) {
            return !settled.some(function (saved) { return sameDictionaryOperation(operation, saved); });
          });
          updateDictionaryState(result.entries || [], remaining);
          if (!state.dictionaryPending.length) {
            state.dictionarySyncStatus = "Synced with your Apple Account.";
            state.dictionarySyncError = null;
            renderPersonalDictionarySettings();
            return true;
          }
        }
        state.dictionarySyncStatus = "Saved on this browser. More changes are waiting to sync.";
        state.dictionarySyncError = "CloudKit did not finish syncing all dictionary changes.";
        return false;
      } catch (error) {
        if (session !== state.accountSession || database !== state.database) return false;
        state.dictionarySyncStatus = "Saved on this browser. Waiting for iCloud.";
        state.dictionarySyncError = readableError(error);
        renderPersonalDictionarySettings();
        return false;
      }
    })();
    state.dictionarySyncPromise = run.finally(function () {
      state.dictionarySyncPromise = null;
      renderPersonalDictionarySettings();
    });
    return state.dictionarySyncPromise;
  }

  function accountSessionCurrent(session) {
    return session === state.accountSession && Boolean(state.database);
  }

  function rememberRecordBody(recordName, body, session) {
    if ((session != null && session !== state.accountSession) || state.accountCacheSuspended) return;
    state.bodyCache.delete(recordName); state.bodyCache.set(recordName, body);
    const bodyLimit = launchLibrary && launchLibrary.OPENED_BODY_LIMIT || 30;
    while (state.bodyCache.size > bodyLimit) state.bodyCache.delete(state.bodyCache.keys().next().value);
    const preview = previewText(body);
    const current = state.notes.find(function (note) { return note.recordName === recordName; });
    if (current && isNativeModelRecord(current.record, "CapturedNote")) {
      state.previewCache.set(recordName, preview);
      state.previewLoadErrors.delete(recordName);
      current.body = body; current.editorBody = body; current.preview = preview; current.previewUnavailable = false;
      if (!fieldValue(current.record, "userTitle") && !fieldValue(current.record, "generatedTitle") && (!current.title || current.title === "Untitled")) current.title = firstLineTitle(body);
    } else if (current && current.record.recordType === "ArborNote") {
      const parts = splitDocument(body);
      state.previewCache.set(recordName, previewText(parts.body));
      state.previewLoadErrors.delete(recordName);
      current.body = body; current.title = parts.title; current.editorBody = parts.body;
      current.preview = previewText(parts.body); current.previewUnavailable = false;
    }
    if (!state.cacheKey) return;
    scheduleLibraryCacheWrite();
  }

  function resetPreviewHydration() {
    if (state.previewObserver) state.previewObserver.disconnect();
    state.previewObserver = null;
    state.previewQueue = [];
    state.previewQueuedNames.clear();
    state.previewLoadErrors.clear();
  }

  function updatePreviewRow(recordName) {
    const rowID = "note-row-" + String(recordName).replace(/[^A-Za-z0-9_-]/g, "");
    const row = document.getElementById(rowID);
    if (!row) return;
    const note = state.notes.find(function (item) { return item.recordName === recordName; });
    if (!note) return;
    const title = row.querySelector(".note-row-title");
    if (title) title.textContent = note.title;
    const preview = row.querySelector(".note-row-excerpt");
    if (!preview) return;
    const text = note.preview || (note.previewUnavailable ? "Preview unavailable" : "");
    preview.textContent = text;
    preview.hidden = !text;
  }

  function drainPreviewQueue() {
    while (state.previewActiveCount < 2 && state.previewQueue.length) {
      const job = state.previewQueue.shift();
      state.previewQueuedNames.delete(job.recordName);
      if (!accountSessionCurrent(job.session)) continue;
      const note = state.notes.find(function (item) { return item.recordName === job.recordName; });
      if (!note || state.previewCache.has(job.recordName) || state.bodyCache.has(job.recordName)) continue;
      state.previewActiveCount += 1;
      (state.nativeSchema ? ensureNativeTextBody(note) : ensureWebTextBody(note)).then(function (body) {
        if (!accountSessionCurrent(job.session)) return;
        rememberRecordBody(job.recordName, body, job.session);
        updatePreviewRow(job.recordName);
      }).catch(function () {
        if (!accountSessionCurrent(job.session)) return;
        state.previewLoadErrors.add(job.recordName);
        const current = state.notes.find(function (item) { return item.recordName === job.recordName; });
        if (current) current.previewUnavailable = true;
        updatePreviewRow(job.recordName);
      }).finally(function () {
        state.previewActiveCount = Math.max(0, state.previewActiveCount - 1);
        drainPreviewQueue();
      });
    }
  }

  function queueNativePreview() {
    // Note text is fetched when the note is opened, not while the list is scrolling.
  }

  function observeNativePreview() {}

  function getDeviceID() {
    if (demoMode) return "demo-device";
    const key = "arbor.web.device-id";
    let value = "";
    try { value = localStorage.getItem(key) || ""; } catch (_) {}
    if (!value) {
      value = "web-" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
      try { localStorage.setItem(key, value); } catch (_) {}
    }
    return value;
  }

  function announceStatus(text) {
    const el = $("app-status");
    if (!el) return;
    const next = String(text || "");
    if (el.textContent === next) {
      el.textContent = "";
      window.requestAnimationFrame(function () { el.textContent = next; });
      return;
    }
    el.textContent = next;
  }

  function setConnection(text, connected) {
    const label = $("settings-connection-label");
    const line = $("settings-connection-line");
    if (label) label.textContent = text;
    if (line) line.classList.toggle("is-connected", Boolean(connected));
    announceStatus(text);
  }

  function fadeSwapText(element, text) {
    if (!element) return;
    const nextText = String(text);
    if (element.textContent === nextText) return;
    if (element.hidden || element.closest("[hidden]")) {
      element.textContent = nextText;
      return;
    }

    const active = textSwapAnimations.get(element);
    const currentOpacity = Number.parseFloat(getComputedStyle(element).opacity);
    if (active && active.animation) active.animation.cancel();
    if (typeof element.animate !== "function") {
      element.textContent = nextText;
      return;
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const rawDuration = rootStyle.getPropertyValue("--motion-fade-duration").trim();
    const numericDuration = Number.parseFloat(rawDuration);
    const duration = numericDuration ? numericDuration * (rawDuration.endsWith("ms") ? 1 : 1000) : 200;
    if (duration <= 0) {
      element.textContent = nextText;
      return;
    }

    const entry = { animation: null };
    textSwapAnimations.set(element, entry);
    const fadeOut = element.animate(
      [{ opacity: Number.isFinite(currentOpacity) ? currentOpacity : 1 }, { opacity: 0 }],
      { duration: duration / 2, easing: "ease", fill: "forwards" }
    );
    entry.animation = fadeOut;
    fadeOut.addEventListener("finish", function () {
      if (textSwapAnimations.get(element) !== entry) return;
      element.textContent = nextText;
      const fadeIn = element.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: duration / 2, easing: "ease", fill: "none" }
      );
      entry.animation = fadeIn;
      fadeIn.addEventListener("finish", function () {
        if (textSwapAnimations.get(element) === entry) textSwapAnimations.delete(element);
      }, { once: true });
    }, { once: true });
  }

  function setListMessage(text, visible, isError, canRetry, visuallyHidden) {
    const message = $("list-message");
    const label = $("list-message-text") || message;
    if (!message) return;
    message.classList.toggle("error", Boolean(isError));
    message.classList.toggle("is-visually-hidden", Boolean(visuallyHidden));
    const retry = $("list-message-retry");
    if (retry) retry.hidden = !visible || !canRetry;
    fadeSwapText(label, text);
    setMotionVisibility(message, visible);
  }

  function setSaveState(text, mode) {
    const el = $("save-state");
    const label = $("save-state-label");
    if (!el || !label) return;
    fadeSwapText(label, text);
    setMotionVisibility(el, Boolean(mode));
    el.classList.toggle("is-saving", mode === "saving");
    el.classList.toggle("is-saved", mode === "saved");
    el.classList.toggle("is-error", mode === "error");
    el.classList.toggle("is-dirty", mode === "dirty");
  }

  function hideSaveState() {
    const el = $("save-state");
    if (!el) return;
    setMotionVisibility(el, false);
    el.classList.remove("is-saving", "is-saved", "is-error", "is-dirty");
  }

  function showDraftBanner() {
    const banner = $("draft-banner");
    if (banner) banner.hidden = false;
  }

  function hideDraftBanner() {
    const banner = $("draft-banner");
    if (banner) banner.hidden = true;
  }

  function showToast(message, isError) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.toggle("is-error", Boolean(isError));
    toast.classList.add("is-visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () { toast.classList.remove("is-visible"); }, 2800);
  }

  function showSetup(message) {
    if (message) $("setup-copy").textContent = message;
    $("welcome-screen").hidden = true;
    $("setup-screen").hidden = false;
    frame.hidden = true;
  }

  function showApp() {
    $("welcome-screen").hidden = true;
    $("setup-screen").hidden = true;
    frame.hidden = false;
  }

  function setWelcomeStatus(text, pending) {
    const status = $("welcome-status");
    if (!status) return;
    status.hidden = false;
    status.textContent = text;
    status.classList.toggle("is-pending", Boolean(pending));
  }

  function showWelcomeStep(step) {
    const screen = $("welcome-screen");
    screen.hidden = false;
    screen.dataset.step = step;
    screen.dataset.state = step;
    screen.setAttribute("aria-labelledby", step === "intro" ? "welcome-title" : step === "auth" ? "welcome-auth-title" : "welcome-note-title");
    $("setup-screen").hidden = true;
    $("welcome-step-intro").hidden = step !== "intro";
    $("welcome-step-auth").hidden = step !== "auth";
    $("welcome-step-note").hidden = step !== "note";
    $("welcome-step-label").hidden = false;
    $("welcome-step-label").textContent = step === "intro" ? "Step 1 of 3 · Welcome" : step === "auth" ? "Step 2 of 3 · Sign in" : "Step 3 of 3 · First note";
    $("welcome-status").hidden = true;
    $("welcome-status").classList.remove("is-pending");
    $("welcome-retry").hidden = true;
    const connected = Boolean(state.database && state.connectionUserID);
    $("welcome-auth-title").textContent = connected ? "Your Apple Account is connected." : "Connect your Apple Account.";
    $("welcome-auth-description").textContent = connected
      ? "This browser is connected to your iCloud private database. Continue to make your first note."
      : "Sign in to let this browser read and write notes in your iCloud private database.";
    $("welcome-auth").hidden = connected;
    $("welcome-connected").hidden = !connected;
    $("welcome-auth-continue").hidden = !connected;
    frame.hidden = true;
    const headingId = step === "intro" ? "welcome-title" : step === "auth" ? "welcome-auth-title" : "welcome-note-title";
    $(headingId).focus({ preventScroll: true });
  }

  function continueWelcome() {
    showWelcomeStep("auth");
    if (state.database && state.connectionUserID) $("welcome-auth-continue").textContent = "Continue";
  }

  const FIRST_RUN_KEY_PREFIX = "arbor.web.first-run.v1.";
  function firstRunKey(accountId) { return FIRST_RUN_KEY_PREFIX + encodeURIComponent(String(accountId || "")); }
  function firstRunComplete(accountId) {
    try { return window.localStorage.getItem(firstRunKey(accountId)) === "1"; }
    catch (_) { return false; }
  }
  function markFirstRunComplete(accountId) {
    try { window.localStorage.setItem(firstRunKey(accountId), "1"); }
    catch (_) {}
  }

  async function finishWelcomeNote(event) {
    event.preventDefault();
    const button = $("welcome-note-finish");
    const title = String($("welcome-note-name").value || "").trim().slice(0, 180);
    const body = String($("welcome-note-body").value || "").trim();
    if (!title || !body) return;
    button.disabled = true;
    button.textContent = "Saving note…";
    const created = await createNote(body, true, title);
    button.disabled = false;
    button.textContent = "Finish and open note";
    if (!created) return;
    markFirstRunComplete(state.connectionUserID);
    showApp();
  }

  function showWelcomeChecking() {
    const screen = $("welcome-screen");
    screen.hidden = false;
    screen.dataset.state = "checking";
    screen.dataset.step = "checking";
    screen.setAttribute("aria-labelledby", "welcome-status");
    $("setup-screen").hidden = true;
    $("welcome-step-intro").hidden = true;
    $("welcome-step-auth").hidden = true;
    $("welcome-step-note").hidden = true;
    $("welcome-step-label").hidden = true;
    setWelcomeStatus("Checking your Apple Account session…", true);
    $("welcome-retry").hidden = true;
    frame.hidden = true;
  }

  function showWelcomeSignedOut() {
    state.database = null;
    state.connectionUserID = null;
    showWelcomeStep("intro");
  }

  function showWelcomeCheckError() {
    const screen = $("welcome-screen");
    screen.hidden = false;
    screen.dataset.state = "error";
    screen.dataset.step = "auth";
    screen.setAttribute("aria-labelledby", "welcome-auth-title");
    $("setup-screen").hidden = true;
    $("welcome-step-intro").hidden = true;
    $("welcome-step-auth").hidden = false;
    $("welcome-step-note").hidden = true;
    $("welcome-step-label").hidden = false;
    $("welcome-step-label").textContent = "Step 2 of 3 · Sign in";
    setWelcomeStatus("Arbor couldn’t restore its iCloud session. Your browser may still be signed in to Apple; reload Arbor to retry.", false);
    $("welcome-auth").hidden = true;
    $("welcome-connected").hidden = true;
    $("welcome-auth-continue").hidden = true;
    $("welcome-retry").hidden = false;
    frame.hidden = true;
  }

  function readableError(error) {
    if (!error) return "Something went wrong while connecting to CloudKit.";
    const code = [error.serverErrorCode, error.code, error.errorCode]
      .find(value => typeof value === "string" && /^[A-Z_]+$/.test(value)) || "";
    const text = [error.reason || error.message || error.description || String(error), code].filter(Boolean).join(" ");
    const operation = typeof error.operation === "string" && /^[a-z]+(?:\/[a-z-]+)+$/.test(error.operation) ? error.operation : "";
    const httpStatus = [error.httpStatus, error.status, error.statusCode].find(value => Number.isInteger(value) && value >= 100 && value <= 599);
    const status = httpStatus === undefined ? "" : `HTTP ${httpStatus}`;
    const diagnostic = [operation, status || (code === "NETWORK_ERROR" ? "no response" : ""), code]
      .filter(Boolean).join(" · ");
    const withDiagnostic = message => diagnostic ? `${message} (${diagnostic})` : message;
    if (/AUTHENTICATION_REQUIRED|NOT_AUTHENTICATED|AUTHENTICATION_FAILED|request needs authorization/i.test(text)) {
      return withDiagnostic("Apple sign-in completed, but CloudKit rejected Arbor’s saved session. Refresh the connection to continue.");
    }
    if (/NETWORK_ERROR|network error|did not return a usable response/i.test(text)) {
      return withDiagnostic("Arbor couldn’t reach iCloud. Your Arbor session is still saved; retry sync when your connection is back.");
    }
    if (/ZONE_NOT_FOUND|UNKNOWN_ITEM/i.test(text)) return withDiagnostic("The Arbor notes zone is not available in this CloudKit environment yet.");
    if (/OPLOCK|SERVER_RECORD_CHANGED|serverRecordChanged|RECORD_CHANGED/i.test(text)) return withDiagnostic("This note changed on another device. Arbor kept your local draft and is refreshing the newer iCloud version.");
    if (/SERVER_RECORD_CHANGED|CONFLICT/i.test(text)) return withDiagnostic("This note changed in another place. Reload the note before saving more changes.");
    return withDiagnostic(text);
  }

  function cloudKitErrorText(error) {
    if (!error) return "";
    const values = [error.reason, error.message, error.description, error.serverErrorCode, error.code, error.errorCode];
    if (Array.isArray(error.errors)) values.push(error.errors.map(cloudKitErrorText).join(" "));
    return values.filter(Boolean).join(" ");
  }

  function withCloudKitOperation(error, operation) {
    const source = error && typeof error === "object" ? error : {};
    const originalText = [source.reason, source.message, source.description, String(error || "")].filter(Boolean).join(" ");
    const existingCode = [source.serverErrorCode, source.code, source.errorCode]
      .find(value => typeof value === "string" && /^[A-Z_]+$/.test(value));
    const code = existingCode || (/AUTHENTICATION_REQUIRED|NOT_AUTHENTICATED|AUTHENTICATION_FAILED|request needs authorization/i.test(originalText)
      ? "AUTHENTICATION_REQUIRED"
      : /NETWORK_ERROR|network error|did not return a usable response|failed to fetch|load failed/i.test(originalText) ? "NETWORK_ERROR" : "");
    const wrapped = error instanceof Error ? error : new Error(source.reason || source.message || "CloudKit request failed.");
    const status = [source.httpStatus, source.status, source.statusCode].find(value => Number.isInteger(value) && value >= 100 && value <= 599);
    try {
      wrapped.operation = operation;
      if (code) wrapped.code = code;
      if (status !== undefined) wrapped.httpStatus = status;
    } catch {
      const fallback = new Error(code ? `CloudKit ${operation} failed (${code}).` : `CloudKit ${operation} failed.`);
      fallback.operation = operation;
      if (code) fallback.code = code;
      if (status !== undefined) fallback.httpStatus = status;
      return fallback;
    }
    return wrapped;
  }

  function isCloudKitRecordConflict(error) {
    return noteSync.isRecordConflict(error);
  }

  function assertResponse(response) {
    if (response && response.hasErrors && response.errors && response.errors.length) throw response.errors[0];
    return response;
  }

  function fieldValue(record, name) {
    const fields = record && record.fields;
    const field = fields && (fields[name] || fields["CD_" + name]);
    return field && Object.prototype.hasOwnProperty.call(field, "value") ? field.value : null;
  }

  function isNativeModelRecord(record, entityName) {
    return Boolean(record && record.recordType === "CD_" + entityName && fieldValue(record, "entityName") === entityName);
  }

  function dateValue(value) {
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") {
      const result = new Date(value);
      return Number.isNaN(result.getTime()) ? new Date() : result;
    }
    return new Date();
  }

  function firstLineTitle(source) {
    const stripped = String(source || "").replace(/^#+\s*/, "").trim();
    const plain = stripped
      .replace(/\x60([^\x60]+)\x60/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    return plain.trim() || "Untitled";
  }

  function splitDocument(body) {
    const parts = ArborMarkdown.splitMarkdownDocument(body);
    return { title: firstLineTitle(parts.title), body: parts.body };
  }

  function recordPath(record) { return String(fieldValue(record, "relativePath") || "Untitled.md"); }
  function noteUUID(record) { return String(fieldValue(record, record && record.recordType === "CD_CapturedNote" ? "id" : "noteUUID") || ""); }
  function isArchived(record) {
    return Boolean(fieldValue(record, "archivedAt")) || /^Archive\//i.test(recordPath(record));
  }

  function settingsAccountName() {
    if (state.accountSettings.name.trim()) return state.accountSettings.name.trim();
    const given = state.user && state.user.nameComponents && state.user.nameComponents.givenName;
    return given || "Noah";
  }

  function updateArborName() {
    const brand = $("sidebar-brand");
    if (brand) brand.setAttribute("aria-label", "Arbor");
    const accountName = $("settings-display-name");
    if (accountName && document.activeElement !== accountName) accountName.value = settingsAccountName();
  }

  function toNote(record) {
    if (isNativeModelRecord(record, "CapturedNote")) {
      const bodyValue = fieldValue(record, "text");
      const cachedBody = state.bodyCache.get(record.recordName);
      const body = typeof bodyValue === "string" ? bodyValue : (cachedBody || "");
      const userTitle = String(fieldValue(record, "userTitle") || "").trim();
      const generatedTitle = String(fieldValue(record, "generatedTitle") || "").trim();
      const title = userTitle || generatedTitle || (body ? firstLineTitle(body) : "Untitled");
      return {
        record: record, recordName: record.recordName, uuid: noteUUID(record), title: title,
        body: body, editorBody: body, preview: body ? previewText(body) : (state.previewCache.has(record.recordName) ? state.previewCache.get(record.recordName) : ""),
        previewUnavailable: state.previewLoadErrors.has(record.recordName),
        modifiedAt: dateValue(fieldValue(record, "modifiedAt") || fieldValue(record, "createdAt")),
        createdAt: dateValue(fieldValue(record, "createdAt")), archivedAt: fieldValue(record, "archivedAt"),
        starred: false, folderPath: "", path: ""
      };
    }
    const path = recordPath(record);
    const bodyValue = fieldValue(record, "body");
    const cachedBody = state.bodyCache.get(record.recordName);
    const body = typeof bodyValue === "string" ? bodyValue : (typeof cachedBody === "string" ? cachedBody : "");
    const parts = splitDocument(body);
    if (!body) parts.title = path.split("/").pop().replace(/\.md$/i, "") || "Untitled";
    return {
      record: record,
      recordName: record.recordName,
      uuid: noteUUID(record),
      title: parts.title,
      body: body,
      editorBody: parts.body,
      preview: previewText(parts.body),
      modifiedAt: dateValue(fieldValue(record, "modifiedAt")),
      createdAt: dateValue(fieldValue(record, "createdAt")),
      archivedAt: fieldValue(record, "archivedAt"),
      starred: Number(fieldValue(record, "isStarred") || 0) !== 0,
      folderPath: relativeFolder(path),
      path: path
    };
  }

  function parentPath(path) {
    const clean = String(path || "").replace(/^Archive\//i, "");
    const slash = clean.lastIndexOf("/");
    return slash < 0 ? "" : clean.slice(0, slash);
  }

  function previewText(text) {
    return String(text || "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/[\x60*_~]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
  }

  function relativeFolder(path) {
    const parts = String(path || "").split("/").filter(Boolean);
    if (!parts.length) return "";
    if (parts[0].toLowerCase() === "archive" || parts[0].toLowerCase() === "attachments") return "";
    parts.pop();
    return parts.join("/");
  }

  function folderPathFromRecord(record) {
    return String(fieldValue(record, "relativePath") || "").replace(/^\/+|\/+$/g, "");
  }

  function syncDerivedCollections() {
    if (state.nativeSchema) {
      const noteRecords = [];
      const folderRecords = [];
      for (const record of state.records.values()) {
        if (isNativeModelRecord(record, "CapturedNote")) noteRecords.push(record);
        if (isNativeModelRecord(record, "NoteFolder")) folderRecords.push(record);
      }
      const folderByID = new Map();
      folderRecords.forEach(function (record) {
        const id = String(fieldValue(record, "id") || "");
        if (id) folderByID.set(id, record);
      });
      const pathByID = new Map();
      function folderPath(id, visiting) {
        if (!id || !folderByID.has(id)) return "";
        if (pathByID.has(id)) return pathByID.get(id);
        const seen = visiting || new Set();
        if (seen.has(id)) return String(fieldValue(folderByID.get(id), "name") || "Folder");
        seen.add(id);
        const record = folderByID.get(id);
        const name = String(fieldValue(record, "name") || "Folder");
        const parent = String(fieldValue(record, "parentID") || "");
        const parentValue = folderPath(parent, seen);
        const path = parentValue ? parentValue + "/" + name : name;
        pathByID.set(id, path);
        return path;
      }
      state.folders = folderRecords.map(function (record) {
        const id = String(fieldValue(record, "id") || "");
        return { record: record, path: folderPath(id), uuid: id };
      }).filter(function (folder) { return Boolean(folder.path); })
        .sort(function (a, b) { return a.path.localeCompare(b.path, undefined, { sensitivity: "base" }); });
      state.notes = noteRecords.map(function (record) {
        const note = toNote(record);
        const folderID = String(fieldValue(record, "folderID") || "");
        note.folderPath = folderPath(folderID);
        note.path = (note.folderPath ? note.folderPath + "/" : "") + cleanFilenameStem(note.title) + ".md";
        return note;
      });
      return;
    }
    const noteRecords = [];
    const folderRecords = [];
    for (const record of state.records.values()) {
      if (record.recordType === "ArborNote") noteRecords.push(record);
      if (record.recordType === "ArborFolder") folderRecords.push(record);
    }
    state.notes = noteRecords.map(toNote);
    const byPath = new Map();
    folderRecords.forEach(function (record) {
      const path = folderPathFromRecord(record);
      if (path) byPath.set(path, { record: record, path: path, uuid: fieldValue(record, "folderUUID") || "" });
    });
    state.notes.forEach(function (note) {
      const directory = relativeFolder(note.path);
      if (!directory) return;
      const parts = directory.split("/");
      parts.forEach(function (_, index) {
        const path = parts.slice(0, index + 1).join("/");
        if (!byPath.has(path)) byPath.set(path, { record: null, path: path, uuid: "" });
      });
    });
    state.folders = Array.from(byPath.values()).sort(function (a, b) {
      return a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
    });
  }

  function formatDate(date) {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const days = Math.round((startToday.getTime() - startDate.getTime()) / 86400000);
    if (days === 0) return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date).replace(/\s/g, "");
    if (days > 0 && days < 7) return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
    return new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric", year: "2-digit" }).format(date);
  }

  function editorDate(date) {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date) + " at " +
      new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date).replace(/\s/g, "");
  }

  function renderNoteDate(note) {
    const element = $("modified-at");
    element.innerHTML = '<span class="editor-date-modified"></span><span class="editor-date-created"></span>';
    element.querySelector(".editor-date-modified").textContent = editorDate(note.modifiedAt);
    element.querySelector(".editor-date-created").textContent = "Created on: " + editorDate(note.createdAt);
    element.setAttribute("aria-label", "Modified " + editorDate(note.modifiedAt) + ". Created on " + editorDate(note.createdAt) + ". Hover or focus to show the creation date.");
  }

  function dateGroup(date) {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const days = Math.floor((startToday.getTime() - startDate.getTime()) / 86400000);
    if (days <= 0) return "Today";
    if (days < 7) return "Last Week";
    if (days < 30) return "Previous 30 Days";
    return "Earlier";
  }

  function folderIcon(filled) {
    const icon = document.createElement("img");
    icon.src = filled ? "./icons/folder-fill.svg" : "./icons/folder-stroke.svg";
    icon.alt = "";
    icon.className = "folder-glyph";
    return icon;
  }

  function renderFolderTree() {
    const nav = $("folder-tree");
    nav.replaceChildren();
    const selectedExists = state.selectedFolder === "" || state.folders.some(function (folder) { return folder.path === state.selectedFolder; });
    if (!selectedExists) state.selectedFolder = "";

    state.folders.forEach(function (folder) {
      const depth = folder.path.split("/").length - 1;
      const label = folder.path.split("/").pop();
      const row = document.createElement("button");
      row.type = "button";
      row.className = "folder-row" + (state.selectedFolder === folder.path ? " is-selected is-active" : "");
      row.style.paddingLeft = String(9 + depth * 15) + "px";
      row.dataset.folderPath = folder.path;
      row.setAttribute("aria-label", "Open folder " + folder.path);
      row.title = label;
      if (state.selectedFolder === folder.path) row.setAttribute("aria-current", "page");
      row.appendChild(folderIcon(true));
      const name = document.createElement("span");
      name.className = "folder-row-label";
      name.textContent = label;
      row.appendChild(name);

      const count = state.notes.filter(function (note) {
        return !isArchived(note.record) && (note.folderPath === folder.path || note.folderPath.indexOf(folder.path + "/") === 0);
      }).length;
      const countElement = document.createElement("span");
      countElement.className = "folder-row-count";
      countElement.textContent = count;
      row.appendChild(countElement);

      row.addEventListener("click", function () {
        flushSave().finally(function () {
          state.showingArchive = false;
          state.selectedFolder = folder.path;
          if (!state.preferences.tabsEnabled) {
            state.selectedRecordName = null;
            selectNote(null);
          }
          renderAll();
          closeMobileNavigation();
        });
      });
      row.addEventListener("contextmenu", function (event) {
        event.preventDefault();
        event.stopPropagation();
        openFolderContextMenu(folder.path, event.clientX, event.clientY, row);
      });
      row.addEventListener("dragover", function (event) {
        event.preventDefault();
        row.classList.add("is-drop-target");
      });
      row.addEventListener("dragleave", function () { row.classList.remove("is-drop-target"); });
      row.addEventListener("drop", function (event) {
        event.preventDefault();
        row.classList.remove("is-drop-target");
        const recordName = event.dataTransfer.getData("text/arbor-note");
        if (recordName) moveNote(recordName, folder.path);
      });
      nav.appendChild(row);
    });
  }

  function noteVisible(note) {
    if (state.pendingNewNoteRecords.has(note.recordName) && note.title === "Untitled" && !String(note.editorBody || "")) return false;
    if (state.showingArchive !== isArchived(note.record)) return false;
    if (state.showingArchive) return true;
    if (state.selectedFolder && !(note.folderPath === state.selectedFolder || note.folderPath.indexOf(state.selectedFolder + "/") === 0)) return false;
    return true;
  }

  function renderNoteCard(note) {
    const card = document.createElement("button");
    const cursor = note.recordName === state.listCursor;
    card.type = "button";
    card.id = "note-row-" + String(note.recordName).replace(/[^A-Za-z0-9_-]/g, "");
    card.className = "note-card note-row" + (note.recordName === state.selectedRecordName ? " is-selected" : "") + (cursor ? " is-cursor" : "");
    card.draggable = true;
    card.dataset.recordName = note.recordName;
    card.tabIndex = cursor ? 0 : -1;
    card.setAttribute("role", "option");
    card.setAttribute("aria-selected", cursor ? "true" : "false");
    card.setAttribute("aria-haspopup", "menu");
    card.setAttribute("aria-controls", "note-context-menu");
    card.addEventListener("dragstart", function (event) {
      card.classList.add("is-dragging");
      event.dataTransfer.setData("text/arbor-note", note.recordName);
      event.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", function () { card.classList.remove("is-dragging"); });
    card.addEventListener("click", function () { state.listCursor = note.recordName; openNote(note.recordName); });
    card.addEventListener("contextmenu", function (event) {
      event.preventDefault();
      state.listCursor = note.recordName;
      applyListCursor();
      openNoteContextMenu(note.recordName, event.clientX, event.clientY, card);
    });
    card.addEventListener("keydown", function (event) {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      openNoteContextMenu(note.recordName, rect.left + 16, rect.bottom - 8, card);
    });

    const title = document.createElement("span");
    title.className = "note-card-title note-row-title";
    title.textContent = note.title;
    card.appendChild(title);
    const detail = document.createElement("span");
    detail.className = "note-card-detail";
    const preview = document.createElement("span");
    preview.className = "note-card-preview note-row-excerpt";
    preview.textContent = note.preview || (note.previewUnavailable ? "Preview unavailable" : (state.nativeSchema ? "" : "No additional text"));
    preview.hidden = !preview.textContent;
    detail.appendChild(preview);
    card.appendChild(detail);

    const footer = document.createElement("span");
    footer.className = "note-row-footer" + (note.folderPath ? "" : " is-unfiled");

    if (note.folderPath) {
      const folder = document.createElement("span");
      folder.className = "note-card-folder note-row-folder";
      folder.appendChild(folderIcon(false));
      folder.appendChild(document.createTextNode(note.folderPath.split("/").pop()));
      footer.appendChild(folder);
    }
    const date = document.createElement("span");
    date.className = "note-card-date note-row-date";
    date.textContent = formatDate(note[noteSorting.displayDateFieldFor(state.preferences.noteSortOrder)]);
    footer.appendChild(date);
    card.appendChild(footer);
    if (note.starred) {
      const star = document.createElement("span");
      star.className = "card-star";
      star.textContent = "★";
      star.setAttribute("aria-label", "Starred");
      card.appendChild(star);
    }
    return card;
  }

  function orderedVisibleNotes() {
    return noteSorting.sortNotes(state.notes.filter(noteVisible), state.preferences.noteSortOrder);
  }

  function syncListCursor(visible) {
    const notes = visible || orderedVisibleNotes();
    const valid = notes.some(function (note) { return note.recordName === state.listCursor; });
    if (valid) return;
    const selected = notes.find(function (note) { return note.recordName === state.selectedRecordName; });
    state.listCursor = selected ? selected.recordName : (notes[0] ? notes[0].recordName : null);
  }

  function applyListCursor() {
    const list = $("note-list");
    if (!list) return;
    let active = null;
    list.querySelectorAll(".note-card").forEach(function (card) {
      const on = card.dataset.recordName === state.listCursor;
      card.tabIndex = on ? 0 : -1;
      card.classList.toggle("is-cursor", on);
      card.setAttribute("aria-selected", on ? "true" : "false");
      if (on) active = card;
    });
    if (active) list.setAttribute("aria-activedescendant", active.id);
    else list.removeAttribute("aria-activedescendant");
    return active;
  }

  function moveListCursor(delta) {
    const notes = orderedVisibleNotes();
    if (!notes.length) return;
    const hadCursor = notes.some(function (note) { return note.recordName === state.listCursor; });
    syncListCursor(notes);
    let index = notes.findIndex(function (note) { return note.recordName === state.listCursor; });
    if (index < 0) index = 0;
    else if (hadCursor) index = Math.max(0, Math.min(notes.length - 1, index + delta));
    state.listCursor = notes[index].recordName;
    const active = applyListCursor();
    if (!active) return;
    active.focus();
    active.scrollIntoView({ block: "nearest" });
  }

  function renderNotes() {
    renderOpenNoteTabs();
    const list = $("note-list");
    const visible = orderedVisibleNotes();
    const dateField = noteSorting.dateFieldFor(state.preferences.noteSortOrder);
    const signature = state.preferences.noteSortOrder + "|" + visible.map(function (note) {
      return (dateField ? dateGroup(note[dateField]) : "Titles") + ":" + note.recordName;
    }).join("\u001f");
    const previousSignature = list.dataset.motionSignature;
    const skipTransition = state.skipNextListTransition;
    state.skipNextListTransition = false;
    const render = function () { renderNoteList(list, visible, signature); };
    if (previousSignature === undefined || previousSignature === signature || skipTransition || typeof document.startViewTransition !== "function") {
      render();
      return;
    }

    const generation = ++noteListTransitionGeneration;
    const root = document.documentElement;
    root.classList.add("is-note-list-transitioning");
    let transition;
    try {
      transition = document.startViewTransition(render);
    } catch (_) {
      if (generation === noteListTransitionGeneration) root.classList.remove("is-note-list-transitioning");
      render();
      return;
    }
    const finish = function () {
      if (generation === noteListTransitionGeneration) root.classList.remove("is-note-list-transitioning");
    };
    transition.finished.then(finish, finish);
  }

  function renderNoteList(list, visible, signature) {
    if (state.previewObserver) {
      state.previewObserver.disconnect();
      state.previewObserver = null;
    }
    list.replaceChildren();
    list.dataset.motionSignature = signature;
    if (state.loadingRecords) list.setAttribute("aria-busy", "true");
    else list.removeAttribute("aria-busy");
    syncListCursor(visible);
    const count = $("note-count");
    if (state.loadingRecords && state.notes.length === 0) {
      count.textContent = "…";
      count.setAttribute("aria-label", "Loading notes");
    } else {
      count.textContent = String(visible.length);
      count.removeAttribute("aria-label");
    }
    $("list-heading").textContent = state.showingArchive ? "Archive" : (state.selectedFolder ? state.selectedFolder.split("/").pop() : "All Notes");
    if (!visible.length) {
      list.removeAttribute("aria-activedescendant");
      const dateField = noteSorting.dateFieldFor(state.preferences.noteSortOrder);
      if (state.loadingRecords && state.notes.length === 0) {
        renderNoteSkeleton(list, dateField);
        setListMessage(state.libraryLoadSlowMessage || "Loading notes…", true, false, false, !state.libraryLoadSlow);
        return;
      }
      if (state.loadingRecords && state.libraryLoadSlow) {
        setListMessage(state.libraryLoadSlowMessage || "Still checking iCloud for notes in this view. Arbor will update the list when they arrive.", true, false, false);
        return;
      }
      if (state.loadRecordsErrorMessage) {
        setListMessage(state.loadRecordsErrorMessage, true, true, true);
        return;
      }
      const message = state.showingArchive ? "Archive is empty." : (state.query ? "No notes match that search." : (state.selectedFolder ? "This folder is empty. Create a note or drag one here." : (state.nativeSchema ? (state.nativeZoneExists ? "This iCloud account has no notes in Arbor yet." : "No synced Arbor notes were found in this iCloud account yet. Open Arbor on an Apple device and allow its notes to finish syncing, then reload here.") : "No notes yet. Create a note to get started.")));
      setListMessage(message, true, false);
      return;
    }
    if (state.loadRecordsErrorMessage) setListMessage(state.loadRecordsErrorMessage, true, true, true);
    else if (state.loadingRecords && state.libraryLoadSlow) {
      setListMessage(state.libraryLoadSlowMessage || "Your loaded notes remain available while Arbor checks iCloud for updates.", true, false, false);
    } else setListMessage("", false, false);
    const dateField = noteSorting.dateFieldFor(state.preferences.noteSortOrder);
    if (!dateField) {
      visible.forEach(function (note) {
        const card = renderNoteCard(note);
        list.appendChild(card);
        observeNativePreview(card, note);
      });
      applyListCursor();
      return;
    }
    const groups = new Map();
    visible.forEach(function (note) {
      const label = dateGroup(note[dateField]);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(note);
    });
    groups.forEach(function (notes, label) {
      const section = document.createElement("section");
      section.className = "date-group";
      section.setAttribute("role", "group");
      const heading = document.createElement("h2");
      heading.className = "date-group-title note-group-title";
      heading.id = "note-group-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      heading.textContent = label;
      section.setAttribute("aria-labelledby", heading.id);
      section.appendChild(heading);
      const noteRows = notes.map(function (note) {
        const card = renderNoteCard(note);
        section.appendChild(card);
        return { note: note, card: card };
      });
      list.appendChild(section);
      noteRows.forEach(function (entry) { observeNativePreview(entry.card, entry.note); });
    });
    applyListCursor();
  }

  function renderNoteSkeleton(list, dateField) {
    const section = dateField ? document.createElement("section") : null;
    const target = section || list;
    if (section) {
      section.className = "date-group note-skeleton-group";
      section.setAttribute("role", "presentation");
      section.setAttribute("aria-hidden", "true");
      const heading = document.createElement("h2");
      heading.className = "date-group-title note-group-title note-skeleton-heading";
      const bar = document.createElement("span");
      bar.className = "note-skeleton-bar note-skeleton-heading-bar";
      heading.appendChild(bar);
      section.appendChild(heading);
    }

    function addBar(parent, className, width) {
      const bar = document.createElement("span");
      bar.className = "note-skeleton-bar " + className;
      bar.style.width = width;
      parent.appendChild(bar);
    }

    ["56%", "70%", "48%", "62%"].forEach(function (titleWidth, index) {
      const row = document.createElement("div");
      row.className = "note-card note-row note-skeleton-row";
      row.setAttribute("role", "presentation");
      row.setAttribute("aria-hidden", "true");
      const title = document.createElement("span");
      title.className = "note-card-title note-row-title note-skeleton-title";
      addBar(title, "note-skeleton-title-bar", titleWidth);
      row.appendChild(title);
      const detail = document.createElement("span");
      detail.className = "note-card-detail";
      const preview = document.createElement("span");
      preview.className = "note-card-preview note-row-excerpt note-skeleton-preview";
      addBar(preview, "note-skeleton-preview-bar", index % 2 ? "72%" : "88%");
      detail.appendChild(preview);
      row.appendChild(detail);
      const footer = document.createElement("span");
      footer.className = "note-row-footer is-unfiled";
      const date = document.createElement("span");
      date.className = "note-card-date note-row-date note-skeleton-date";
      addBar(date, "note-skeleton-date-bar", "48px");
      footer.appendChild(date);
      row.appendChild(footer);
      target.appendChild(row);
    });
    if (section) list.appendChild(section);
  }

  function renderOpenNoteTabs() {
    const strip = $("note-tab-strip");
    if (!strip) return;
    let historyControls = strip.querySelector(".note-history-controls");
    if (!historyControls) {
      historyControls = document.createElement("div");
      historyControls.className = "note-history-controls";
      historyControls.setAttribute("role", "group");
      historyControls.setAttribute("aria-label", "Note history");
      const back = document.createElement("button");
      back.type = "button";
      back.className = "note-history-button";
      back.id = "note-history-back";
      back.setAttribute("aria-label", "Back to previous note");
      back.title = "Back to previous note";
      back.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"></path></svg>';
      back.addEventListener("click", function () { navigateNoteHistory(-1); });
      const forward = document.createElement("button");
      forward.type = "button";
      forward.className = "note-history-button";
      forward.id = "note-history-forward";
      forward.setAttribute("aria-label", "Forward to next note");
      forward.title = "Forward to next note";
      forward.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5.5 5.5-5.5 5.5"></path></svg>';
      forward.addEventListener("click", function () { navigateNoteHistory(1); });
      historyControls.append(back, forward);
    }
    let track = strip.querySelector(".note-tab-track");
    if (!track) {
      track = document.createElement("div");
      track.className = "note-tab-track";
    }
    let tabList = track.querySelector(".note-tab-list");
    if (!tabList) {
      tabList = document.createElement("div");
      tabList.className = "note-tab-list";
      tabList.setAttribute("role", "tablist");
      tabList.setAttribute("aria-label", "Open notes");
    }
    let highlight = tabList.querySelector(".note-tab-highlight");
    if (!highlight) {
      highlight = document.createElement("span");
      highlight.className = "note-tab-highlight";
      highlight.setAttribute("aria-hidden", "true");
    }

    let newButton = track.querySelector(".note-tab-new");
    if (!newButton) {
      newButton = document.createElement("button");
      newButton.type = "button";
      newButton.className = "note-tab-new";
      newButton.id = "tab-new-note-button";
      newButton.setAttribute("aria-label", "New note");
      newButton.title = "New note";
      newButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M3 10h14"></path></svg>';
      newButton.addEventListener("click", createPendingBlankNote);
    }
    newButton.hidden = state.showingArchive || !state.preferences.tabsEnabled || state.searchPage;
    strip.replaceChildren(historyControls, track);
    track.replaceChildren(tabList, newButton);
    tabList.replaceChildren(highlight);
    historyControls.hidden = state.searchPage;
    $("note-history-back").disabled = state.noteHistory.index <= 0;
    $("note-history-forward").disabled = state.noteHistory.index < 0 || state.noteHistory.index >= state.noteHistory.recordNames.length - 1;
    track.hidden = !state.preferences.tabsEnabled || state.searchPage;
    strip.hidden = state.searchPage || (!state.selectedRecordName && !state.preferences.tabsEnabled);
    const listNewNoteButton = $("new-note-button");
    if (listNewNoteButton) listNewNoteButton.hidden = state.showingArchive || state.searchPage || state.preferences.tabsEnabled;

    if (!track.dataset.highlightEvents) {
      track.dataset.highlightEvents = "true";
      track.addEventListener("pointerover", function (event) {
        const group = event.target.closest(".note-tab-group");
        if (group && !group.contains(event.relatedTarget)) moveNoteTabHighlight(track, group);
      });
      track.addEventListener("pointerleave", function () {
        moveNoteTabHighlight(track, track.querySelector(".note-tab-group:focus-within") || track.querySelector(".note-tab-group.is-active"));
      });
      track.addEventListener("focusin", function (event) {
        const group = event.target.closest(".note-tab-group");
        if (group) moveNoteTabHighlight(track, group);
      });
      track.addEventListener("focusout", function () {
        window.requestAnimationFrame(function () {
          moveNoteTabHighlight(track, track.querySelector(".note-tab-group:focus-within") || track.querySelector(".note-tab-group:hover") || track.querySelector(".note-tab-group.is-active"));
        });
      });
    }

    const notesByName = new Map(state.notes.map(function (note) { return [note.recordName, note]; }));
    const openNotes = state.openNoteTabs.map(function (recordName) { return notesByName.get(recordName); }).filter(Boolean);
    const notePage = $("note-page");
    const notePane = $("note-pane");
    if (notePage) notePage.removeAttribute("aria-labelledby");
    if (!state.preferences.tabsEnabled || state.searchPage) {
      if (notePane) notePane.classList.remove("has-open-tabs");
      return;
    }
    if (notePane) notePane.classList.add("has-open-tabs");
    openNotes.forEach(function (note, index) {
      const group = document.createElement("div");
      group.className = "note-tab-group";
      group.setAttribute("role", "presentation");
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "note-tab";
      tab.id = "note-tab-" + index;
      tab.dataset.recordName = note.recordName;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "note-page");
      const active = note.recordName === state.selectedRecordName;
      group.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      const title = document.createElement("span");
      title.className = "note-tab-title";
      title.textContent = note.title || "Untitled";
      tab.appendChild(title);
      tab.addEventListener("click", function () { openNote(note.recordName, { tabIntent: "activate" }); });
      tab.addEventListener("auxclick", function (event) {
        if (event.button !== 1) return;
        event.preventDefault();
        closeNoteTab(note.recordName).then(function (nextName) {
          const focusName = nextName || state.selectedRecordName;
          const nextTab = Array.from(strip.querySelectorAll('[role="tab"]')).find(function (item) { return item.dataset.recordName === focusName; });
          if (nextTab) nextTab.focus();
        });
      });
      tab.addEventListener("keydown", function (event) {
        const tabs = Array.from(strip.querySelectorAll('[role="tab"]'));
        const currentIndex = tabs.indexOf(tab);
        let nextIndex = currentIndex;
        if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
        else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = tabs.length - 1;
        else return;
        event.preventDefault();
        const nextName = tabs[nextIndex].dataset.recordName;
        openNote(nextName, { tabIntent: "activate" }).then(function () {
          const nextTab = Array.from(strip.querySelectorAll('[role="tab"]')).find(function (item) { return item.dataset.recordName === nextName; });
          if (nextTab) nextTab.focus();
        });
      });
      const close = document.createElement("button");
      close.type = "button";
      close.className = "note-tab-close";
      close.dataset.recordName = note.recordName;
      close.setAttribute("aria-label", "Close note tab: " + (note.title || "Untitled"));
      close.title = "Close tab";
      close.textContent = "×";
      close.addEventListener("click", function () {
        closeNoteTab(note.recordName).then(function (nextName) {
          if (!nextName) return;
          const nextTab = Array.from(strip.querySelectorAll('[role="tab"]')).find(function (item) { return item.dataset.recordName === nextName; });
          if (nextTab) nextTab.focus();
        });
      });
      group.append(tab, close);
      tabList.appendChild(group);
      if (notePage && active) notePage.setAttribute("aria-labelledby", tab.id);
    });
    track.classList.toggle("is-overflowing", track.scrollWidth > track.clientWidth + 1);
    const emphasis = track.querySelector(".note-tab-group:focus-within") || track.querySelector(".note-tab-group:hover") || track.querySelector(".note-tab-group.is-active");
    moveNoteTabHighlight(track, emphasis);
  }

  function moveNoteTabHighlight(track, group) {
    const highlight = track && track.querySelector(".note-tab-highlight");
    if (!highlight || !group) return;
    highlight.style.width = group.offsetWidth + "px";
    highlight.style.setProperty("--note-tab-highlight-x", group.offsetLeft + "px");
  }

  function restoreOpenTabsForLoadedNotes() {
    const notesByName = new Map(state.notes.map(function (note) { return [note.recordName, note]; }));
    const historyName = state.noteHistory.recordNames[state.noteHistory.index] || "";
    const preferredName = state.preferences.tabsEnabled
      ? (state.activeNoteTabName || state.openNoteTabs[state.openNoteTabs.length - 1] || historyName)
      : historyName;
    const hiddenTarget = window.ArborNoteHistory.shouldSuppressRestoredSelection(
      state.notes.map(function (note) { return { recordName: note.recordName, archived: isArchived(note.record) }; }),
      preferredName,
      state.restoreHiddenNoteName
    );
    state.openNoteTabs = state.openNoteTabs.filter(function (recordName, index, list) {
      const note = notesByName.get(recordName);
      return note && !isArchived(note.record) && list.indexOf(recordName) === index;
    });
    if (!state.preferences.tabsEnabled) {
      state.openNoteTabs = [];
      state.activeNoteTabName = "";
      persistOpenNoteTabs();
      const historyNote = notesByName.get(historyName);
      if (historyNote && isArchived(historyNote.record)) state.restoreHiddenNoteName = historyName;
      return { note: null, hidden: hiddenTarget };
    }
    if (hiddenTarget) {
      state.restoreHiddenNoteName = preferredName || state.restoreHiddenNoteName;
      state.activeNoteTabName = "";
      persistOpenNoteTabs();
      renderOpenNoteTabs();
      return { note: null, hidden: true };
    }
    state.restoreHiddenNoteName = "";
    let note = notesByName.get(state.activeNoteTabName);
    if (note && isArchived(note.record)) note = null;
    if (!note) note = notesByName.get(state.openNoteTabs[state.openNoteTabs.length - 1]);
    if (note && isArchived(note.record)) note = null;
    if (!note) note = noteSorting.sortNotes(state.notes.filter(function (item) { return !isArchived(item.record); }), state.preferences.noteSortOrder)[0] || null;
    if (note && isArchived(note.record)) note = null;
    if (note) {
      if (!state.openNoteTabs.includes(note.recordName)) state.openNoteTabs.push(note.recordName);
      state.activeNoteTabName = note.recordName;
    } else state.activeNoteTabName = "";
    persistOpenNoteTabs();
    renderOpenNoteTabs();
    return { note: note, hidden: false };
  }

  function renderAll() {
    updateArborName();
    renderFolderTree();
    renderNotes();
    applyLayout();
    applyAppearance();
    const emptyStateCopy = $("empty-state-copy");
    if (emptyStateCopy) {
      if (state.loadingRecords && !state.selectedRecordName) {
        emptyStateCopy.textContent = state.libraryLoadSlow
          ? (state.libraryLoadSlowMessage || (state.notes.length ? "Still checking iCloud for updates…" : "Still loading your notes from iCloud…"))
          : (state.notes.length ? "Refreshing your notes…" : "Loading your notes…");
      } else emptyStateCopy.textContent = "Choose a note to read it.";
    }
    const showingAllNotes = !state.searchPage && !state.showingArchive && state.selectedFolder === "";
    $("all-notes-button").classList.toggle("is-selected", showingAllNotes);
    $("all-notes-button").classList.toggle("is-active", showingAllNotes);
    if (showingAllNotes) $("all-notes-button").setAttribute("aria-current", "page");
    else $("all-notes-button").removeAttribute("aria-current");
    $("search-nav-button").classList.toggle("is-selected", state.searchPage);
    if (state.searchPage) $("search-nav-button").setAttribute("aria-current", "page");
    else $("search-nav-button").removeAttribute("aria-current");
    $("archive-notes-button").classList.toggle("is-selected", state.showingArchive);
    $("archive-notes-button").classList.toggle("is-active", state.showingArchive);
    if (state.showingArchive) $("archive-notes-button").setAttribute("aria-current", "page");
    else $("archive-notes-button").removeAttribute("aria-current");
    $("new-note-button").hidden = state.showingArchive || state.searchPage || state.preferences.tabsEnabled;
    $("empty-new-note-button").hidden = state.showingArchive;
    $("note-actions-button").hidden = !state.selectedRecordName || state.searchPage;
    if (state.searchPage) {
      $("empty-state").hidden = true;
      $("note-workspace").hidden = false;
      setMotionVisibility($("search-page-view"), true);
      renderSearchPage();
    } else setMotionVisibility($("search-page-view"), false);
    if (!layoutMotionReadyScheduled) {
      layoutMotionReadyScheduled = true;
      window.requestAnimationFrame(function () { frame.classList.add("is-motion-ready"); });
    }
  }

  function persistLayout() {
    try { localStorage.setItem("arbor.web.layout.v1", JSON.stringify(state.layout)); } catch (_) {}
  }

  function applyLayout() {
    frame.style.setProperty("--sidebar-width", state.layout.sidebarWidth + "px");
    frame.style.setProperty("--list-width", state.layout.listWidth + "px");
    const collapsed = Boolean(state.layout.sidebarCollapsed);
    frame.classList.toggle("is-sidebar-collapsed", collapsed);
    const resizer = $("sidebar-resizer");
    if (resizer) resizer.inert = collapsed;
    const expanded = String(!collapsed);
    const toggle = $("collapse-sidebar-button");
    toggle.setAttribute("aria-expanded", expanded);
    toggle.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
    toggle.title = collapsed ? "Expand navigation" : "Collapse navigation";
  }

  function appearanceTheme() {
    return state.appearance.theme === "light" || state.appearance.theme === "dark" ? state.appearance.theme : "system";
  }

  function appearanceIsDark(theme) {
    if (theme === "dark") return true;
    if (theme === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function applyThemeColor(theme) {
    const lightMeta = document.getElementById("theme-color-light");
    const darkMeta = document.getElementById("theme-color-dark");
    if (!lightMeta || !darkMeta) return;
    if (theme === "system") {
      lightMeta.setAttribute("content", "#ececec");
      lightMeta.setAttribute("media", "(prefers-color-scheme: light)");
      darkMeta.setAttribute("content", "#141414");
      darkMeta.setAttribute("media", "(prefers-color-scheme: dark)");
      return;
    }
    const color = appearanceIsDark(theme) ? "#141414" : "#ececec";
    lightMeta.setAttribute("content", color);
    darkMeta.setAttribute("content", color);
    lightMeta.removeAttribute("media");
    darkMeta.removeAttribute("media");
  }

  function applyAppearance() {
    const theme = appearanceTheme();
    state.appearance.theme = theme;
    document.documentElement.style.setProperty("--note-body-width", state.appearance.bodyWidth + "%");
    document.documentElement.style.setProperty("--note-body-size", state.appearance.bodySize + "px");
    document.documentElement.style.setProperty("--note-header-font-default", FONT_OPTIONS[state.appearance.headerFont] || FONT_OPTIONS.sans);
    document.documentElement.style.setProperty("--note-body-font-default", FONT_OPTIONS[state.appearance.bodyFont] || FONT_OPTIONS.sans);
    document.documentElement.dataset.defaultNoteHeaderFont = state.appearance.headerFont;
    document.documentElement.dataset.defaultNoteBodyFont = state.appearance.bodyFont;
    document.documentElement.dataset.noteHeaderFont = state.appearance.headerFont;
    document.documentElement.dataset.noteBodyFont = state.appearance.bodyFont;
    applyNoteFontStyle();
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    applyThemeColor(theme);
    syncSettingsControls();
  }

  function noteFontValue(record, kind) {
    const fieldName = kind === "header" ? "headerFontStyle" : "bodyFontStyle";
    const saved = fieldValue(record, fieldName);
    if (Object.prototype.hasOwnProperty.call(FONT_OPTIONS, saved)) return saved;
    return state.appearance[kind + "Font"] || state.appearance.font || "sans";
  }

  function applyNoteFontStyle(note) {
    const selected = note || state.notes.find(function (item) { return item.recordName === state.selectedRecordName; });
    const headerFont = noteFontValue(selected && selected.record, "header");
    const bodyFont = noteFontValue(selected && selected.record, "body");
    const root = document.documentElement;
    root.style.setProperty("--note-header-font-current", FONT_OPTIONS[headerFont] || FONT_OPTIONS.sans);
    root.style.setProperty("--note-body-font-current", FONT_OPTIONS[bodyFont] || FONT_OPTIONS.sans);
    root.dataset.noteHeaderFont = headerFont;
    root.dataset.noteBodyFont = bodyFont;
    renderAboutPanel();
  }

  function aboutFontControls() {
    ["header", "body"].forEach(function (kind) {
      const host = $("about-" + kind + "-font");
      if (!host || host.childElementCount) return;
      Object.keys(FONT_OPTIONS).forEach(function (font) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.aboutFontKind = kind;
        button.dataset.font = font;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", "false");
        button.tabIndex = -1;
        button.textContent = FONT_LABELS[font];
        host.appendChild(button);
      });
    });
  }

  function noteBodyWordCount(note) {
    const body = $("note-body") && state.selectedRecordName === note.recordName
      ? currentMarkdown()
      : String(note.editorBody || "");
    if (typeof Intl.Segmenter === "function") {
      const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
      let count = 0;
      for (const part of segmenter.segment(body)) if (part.isWordLike) count += 1;
      return count;
    }
    return (body.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
  }

  function readTimeLabel(wordCount) {
    if (!wordCount) return "0 min";
    if (wordCount < 220) return "Less than a minute";
    return "About " + Math.ceil(wordCount / 220) + " min";
  }

  function attachmentMetadata(record) {
    const raw = fieldValue(record, "attachmentsData");
    if (Array.isArray(raw)) return raw.filter(function (item) { return item && typeof item.name === "string"; });
    if (typeof raw !== "string") return [];
    try {
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value.filter(function (item) { return item && typeof item.name === "string"; }) : [];
    } catch (_) { return []; }
  }

  function renderAboutAttachments(note) {
    const host = $("about-attachments");
    const attachments = attachmentMetadata(note.record);
    host.replaceChildren();
    if (!attachments.length) {
      const empty = document.createElement("div");
      empty.className = "about-note-empty";
      empty.textContent = "No attachment metadata is available in the web note record.";
      host.appendChild(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "about-note-attachment-list";
    attachments.forEach(function (attachment) {
      const card = document.createElement("div");
      card.className = "about-note-attachment";
      const preview = document.createElement("div");
      preview.className = "about-note-attachment-icon";
      preview.setAttribute("aria-hidden", "true");
      preview.textContent = String(attachment.name).toLowerCase().endsWith(".pdf") ? "PDF" : "FILE";
      const name = document.createElement("div");
      name.className = "about-note-attachment-name";
      name.title = attachment.name;
      name.textContent = attachment.name;
      card.append(preview, name);
      list.appendChild(card);
    });
    const previewNotice = document.createElement("div");
    previewNotice.className = "about-note-empty";
    previewNotice.textContent = "File previews aren’t available in the web client yet.";
    host.append(list, previewNotice);
  }

  function renderAboutPanel() {
    const panel = $("about-note-panel");
    if (!panel) return;
    const note = state.notes.find(function (item) { return item.recordName === state.selectedRecordName; });
    const toggle = $("note-actions-button");
    if (!note) {
      window.clearTimeout(state.aboutCloseTimer);
      panel.hidden = true;
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      frame.classList.remove("has-about-note");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      return;
    }
    $("about-created").textContent = editorDate(note.createdAt);
    $("about-modified").textContent = editorDate(note.modifiedAt);
    const count = noteBodyWordCount(note);
    $("about-word-count").textContent = count.toLocaleString() + (count === 1 ? " word" : " words");
    $("about-read-time").textContent = readTimeLabel(count);
    renderAboutAttachments(note);
    const location = fieldValue(note.record, "locationData") || fieldValue(note.record, "location");
    $("about-location").textContent = location
      ? "Location details are saved, but an interactive map isn’t available in the current web client."
      : "Location data isn’t available in the current web note record.";
    const header = noteFontValue(note.record, "header");
    const body = noteFontValue(note.record, "body");
    [["header", header], ["body", body]].forEach(function (values) {
      const kind = values[0];
      const value = values[1];
      const host = $("about-" + kind + "-font");
      if (!host) return;
      host.querySelectorAll("[data-about-font-kind]").forEach(function (button) {
        const selected = button.dataset.font === value;
        button.setAttribute("aria-checked", String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
    });
    const differsFromDefault = header !== state.appearance.headerFont || body !== state.appearance.bodyFont;
    $("about-style-actions").hidden = !differsFromDefault;
    $("about-make-default").hidden = !differsFromDefault;
    $("about-style-undo").hidden = !differsFromDefault;
  }

  function saveNoteFontValue(kind, value) {
    const note = state.notes.find(function (item) { return item.recordName === state.selectedRecordName; });
    if (!note) return Promise.resolve(false);
    const header = kind === "header" ? value : noteFontValue(note.record, "header");
    const body = kind === "body" ? value : noteFontValue(note.record, "body");
    return saveNoteFontOverrides(note, header, body);
  }

  function saveNoteFontOverrides(note, header, body) {
    const recordName = note && note.recordName;
    if (!recordName || !state.database) return Promise.resolve(false);
    const saveTask = state.noteStyleSavePromise.catch(function () {}).then(async function () {
      const session = state.accountSession;
      let before = null;
      try {
        await flushSave();
        if (!accountSessionCurrent(session)) return false;
        before = cloneRecord(state.records.get(recordName) || note.record);
        const updated = cloneRecord(before);
        const headerDefault = state.appearance.headerFont || state.appearance.font || "sans";
        const bodyDefault = state.appearance.bodyFont || state.appearance.font || "sans";
        if (header == null || header === headerDefault) setNullableField(updated, "headerFontStyle", null);
        else setField(updated, "headerFontStyle", header);
        if (body == null || body === bodyDefault) setNullableField(updated, "bodyFontStyle", null);
        else setField(updated, "bodyFontStyle", body);
        setField(updated, "modifiedAt", new Date());
        state.records.set(recordName, updated);
        note.record = updated;
        if (state.selectedRecordName === recordName) state.selectedRecord = updated;
        applyNoteFontStyle(note);
        renderAboutPanel();

        const response = assertResponse(await saveToDatabase(updated));
        if (!accountSessionCurrent(session)) return false;
        const saved = response.records && response.records[0] ? response.records[0] : updated;
        state.records.set(recordName, saved);
        note.record = saved;
        syncDerivedCollections();
        if (state.selectedRecordName === recordName) {
          state.selectedRecord = saved;
          applyNoteFontStyle(note);
          renderNoteDate(note);
          renderNotes();
        }
        renderAboutPanel();
        return true;
      } catch (error) {
        if (!accountSessionCurrent(session)) return false;
        const rollback = before || cloneRecord(note.record);
        state.records.set(recordName, rollback);
        note.record = rollback;
        if (state.selectedRecordName === recordName) {
          state.selectedRecord = rollback;
          applyNoteFontStyle(note);
        }
        renderAboutPanel();
        const details = readableError(error);
        if (/Field CD_(?:header|body)FontStyle not found in CD_CapturedNote/i.test(details)) {
          showToast("This iCloud schema is missing the note font fields. Update the native mirrored schema before per-note fonts can sync.", true);
        } else showToast("The note style could not be saved: " + details, true);
        return false;
      }
    });
    state.noteStyleSavePromise = saveTask.catch(function () {});
    return saveTask;
  }

  function setNoteFontDefaults(header, body) {
    const before = capturePreferences();
    state.appearance.headerFont = header;
    state.appearance.bodyFont = body;
    state.appearance.font = body;
    persistAppearance();
    applyAppearance();
    recordPreferenceChange(before, "Make note fonts default", "about-note-font-defaults");
    renderAboutPanel();
  }

  function setAboutTab(name, moveFocus) {
    const active = name === "style" ? "style" : "information";
    state.aboutActiveTab = active;
    [["information", "about-tab-information", "about-information"], ["style", "about-tab-style", "about-style"]].forEach(function (entry) {
      const selected = entry[0] === active;
      const tab = $(entry[1]);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $(entry[2]).hidden = !selected;
      if (selected && moveFocus) tab.focus();
    });
  }

  function toggleAboutPanel(forceOpen) {
    const panel = $("about-note-panel");
    if (!panel || !state.selectedRecordName) return;
    const open = typeof forceOpen === "boolean" ? forceOpen : !panel.classList.contains("is-open");
    window.clearTimeout(state.aboutCloseTimer);
    if (open) {
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      window.requestAnimationFrame(function () {
        if (!panel.hidden) panel.classList.add("is-open");
      });
    } else {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      state.aboutCloseTimer = window.setTimeout(function () {
        if (!panel.classList.contains("is-open")) panel.hidden = true;
      }, 200);
    }
    frame.classList.toggle("has-about-note", open);
    $("note-actions-button").setAttribute("aria-expanded", String(open));
    if (open) {
      setAboutTab("information", false);
      renderAboutPanel();
    }
  }

  function undoNoteFontOverrides() {
    const recordName = state.selectedRecordName;
    const note = state.notes.find(function (item) { return item.recordName === recordName; });
    if (!note) return;
    saveNoteFontOverrides(note, null, null);
  }

  function selectedSettingsValue(group) {
    if (group === "theme") return appearanceTheme();
    if (group === "headerFont") return state.appearance.headerFont;
    if (group === "bodyFont") return state.appearance.bodyFont;
    if (group === "textSize") return state.appearance.textSize;
    if (group === "margins") return state.appearance.margins;
    if (group === "tabs") return state.preferences.tabsEnabled ? "enabled" : "disabled";
    return "";
  }

  function syncSettingGroup(group) {
    const value = selectedSettingsValue(group);
    document.querySelectorAll('[data-setting-group="' + group + '"]').forEach(function (button) {
      const selected = button.dataset.settingValue === value;
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.classList.toggle("is-selected", selected);
    });
  }

  function syncSettingsControls() {
    ["theme", "headerFont", "bodyFont", "textSize", "margins", "tabs"].forEach(syncSettingGroup);
    const noteSortOrder = $("note-sort-order");
    if (noteSortOrder) noteSortOrder.value = state.preferences.noteSortOrder;
    const name = $("settings-display-name");
    if (name && document.activeElement !== name) name.value = settingsAccountName();
    const sentenceCapitalization = $("proofreading-sentence-capitalization");
    const grammarSuggestions = $("proofreading-grammar-suggestions");
    if (grammarSuggestions) grammarSuggestions.checked = state.preferences.checkGrammarSuggestions;
    if (sentenceCapitalization) sentenceCapitalization.checked = state.preferences.checkSentenceCapitalization;
    const autoCorrect = $("proofreading-autocorrect");
    if (autoCorrect) autoCorrect.checked = state.preferences.autoCorrectHighConfidence;
    renderPersonalDictionarySettings();
    document.querySelectorAll("[data-settings-section]").forEach(function (button) {
      button.setAttribute("aria-selected", String(button.classList.contains("is-selected")));
    });
  }

  function applyAppearanceWithMotion() {
    if (typeof document.startViewTransition !== "function") {
      applyAppearance();
      return;
    }
    const generation = ++themeTransitionGeneration;
    const root = document.documentElement;
    root.classList.add("is-theme-transitioning");
    let transition;
    try {
      transition = document.startViewTransition(function () { applyAppearance(); });
    } catch (_) {
      if (generation === themeTransitionGeneration) root.classList.remove("is-theme-transitioning");
      applyAppearance();
      return;
    }
    const finish = function () {
      if (generation === themeTransitionGeneration) root.classList.remove("is-theme-transitioning");
    };
    transition.finished.then(finish, finish);
  }

  function persistAppearance() {
    try { localStorage.setItem("arbor.web.appearance.v1", JSON.stringify(state.appearance)); } catch (_) {}
  }

  function persistSettingsPreferences() {
    try { localStorage.setItem("arbor.web.preferences.v1", JSON.stringify(state.preferences)); } catch (_) {}
  }

  function persistOpenNoteTabs() {
    try {
      if (!state.openNoteTabs.length && !state.activeNoteTabName) localStorage.removeItem(OPEN_NOTE_TABS_KEY);
      else localStorage.setItem(OPEN_NOTE_TABS_KEY, JSON.stringify({ recordNames: state.openNoteTabs, activeRecordName: state.activeNoteTabName }));
    } catch (_) {}
  }

  function loadNoteHistory(accountKey) {
    state.noteHistoryAccountKey = String(accountKey || "");
    state.noteHistory = window.ArborNoteHistory.load(localStorage, state.noteHistoryAccountKey);
    renderOpenNoteTabs();
  }

  function persistNoteHistory() {
    if (!state.noteHistoryAccountKey) return;
    state.noteHistory = window.ArborNoteHistory.save(localStorage, state.noteHistoryAccountKey, state.noteHistory);
  }

  function recordNoteHistory(recordName) {
    if (!state.noteHistoryAccountKey || !recordName) return;
    state.noteHistory = window.ArborNoteHistory.visit(state.noteHistory, recordName);
    persistNoteHistory();
  }

  function currentNoteFromHistory() {
    const recordName = state.noteHistory.recordNames[state.noteHistory.index];
    const note = state.notes.find(function (item) { return item.recordName === recordName; }) || null;
    return note && !isArchived(note.record) ? note : null;
  }

  async function navigateNoteHistory(offset) {
    let targetIndex = state.noteHistory.index + offset;
    while (targetIndex >= 0 && targetIndex < state.noteHistory.recordNames.length) {
      const recordName = state.noteHistory.recordNames[targetIndex];
      const note = state.notes.find(function (item) { return item.recordName === recordName; });
      if (!note) {
        state.noteHistory.recordNames.splice(targetIndex, 1);
        if (targetIndex < state.noteHistory.index) state.noteHistory.index -= 1;
        persistNoteHistory();
        targetIndex = state.noteHistory.index + offset;
        continue;
      }
      const opened = await openNote(recordName, { skipHistory: true });
      if (!opened) return false;
      state.noteHistory.index = targetIndex;
      persistNoteHistory();
      renderOpenNoteTabs();
      return true;
    }
    renderOpenNoteTabs();
    return false;
  }

  function clearOpenNoteTabs() {
    state.openNoteTabs = [];
    state.activeNoteTabName = "";
    try { localStorage.removeItem(OPEN_NOTE_TABS_KEY); } catch (_) {}
    renderOpenNoteTabs();
  }

  function prepareNoteTabOpen(recordName, intent) {
    if (!state.preferences.tabsEnabled || !recordName) return;
    const existingIndex = state.openNoteTabs.indexOf(recordName);
    if (existingIndex < 0) {
      if (intent === "new") {
        state.openNoteTabs.push(recordName);
      } else if (state.openNoteTabs.length) {
        let replaceIndex = state.openNoteTabs.indexOf(state.selectedRecordName || state.activeNoteTabName);
        if (replaceIndex < 0) replaceIndex = state.openNoteTabs.length - 1;
        state.openNoteTabs[replaceIndex] = recordName;
      } else {
        state.openNoteTabs.push(recordName);
      }
    }
    if (state.openNoteTabs.length > 100) state.openNoteTabs.shift();
    state.activeNoteTabName = recordName;
    persistOpenNoteTabs();
  }

  function registerOpenNote(note) {
    if (!note || !note.recordName) return;
    const recordName = note.recordName;
    if (state.preferences.tabsEnabled) {
      if (!state.openNoteTabs.includes(recordName)) state.openNoteTabs.push(recordName);
      if (state.openNoteTabs.length > 100) state.openNoteTabs.shift();
      state.activeNoteTabName = recordName;
      persistOpenNoteTabs();
      return;
    }
    state.openNoteTabs = [];
    state.activeNoteTabName = "";
    try { localStorage.removeItem(OPEN_NOTE_TABS_KEY); } catch (_) {}
  }

  function reconcileNoteTabPreference() {
    const current = state.notes.find(function (note) { return note.recordName === state.selectedRecordName; });
    if (state.preferences.tabsEnabled) {
      if (current) registerOpenNote(current);
      else if (state.activeNoteTabName && !state.openNoteTabs.includes(state.activeNoteTabName)) state.openNoteTabs.push(state.activeNoteTabName);
    } else {
      state.openNoteTabs = [];
      state.activeNoteTabName = "";
    }
    persistOpenNoteTabs();
    renderOpenNoteTabs();
  }

  function persistAccountSettings() {
    try { localStorage.setItem("arbor.web.account.v1", JSON.stringify(state.accountSettings)); } catch (_) {}
  }

  function resizePane(name, width, save) {
    const minimum = name === "sidebar" ? 150 : 240;
    const maximum = name === "sidebar" ? 360 : 620;
    const property = name === "sidebar" ? "sidebarWidth" : "listWidth";
    state.layout[property] = Math.max(minimum, Math.min(maximum, Math.round(width)));
    if (save !== false) persistLayout();
    applyLayout();
  }

  function beginPaneResize(event, name) {
    event.preventDefault();
    const before = capturePreferences();
    const startX = event.clientX;
    const initial = name === "sidebar" ? state.layout.sidebarWidth : state.layout.listWidth;
    const direction = name === "sidebar" ? 1 : 1;
    document.body.classList.add("is-resizing-pane");
    const move = function (moveEvent) { resizePane(name, initial + (moveEvent.clientX - startX) * direction, false); };
    const finish = function () {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      document.body.classList.remove("is-resizing-pane");
      persistLayout();
      recordPreferenceChange(before, "Resize panes");
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish, { once: true });
    document.addEventListener("pointercancel", finish, { once: true });
  }

  function setSidebarCollapsed(collapsed) {
    const next = Boolean(collapsed);
    if (next === Boolean(state.layout.sidebarCollapsed)) return;
    const before = capturePreferences();
    state.layout.sidebarCollapsed = next;
    persistLayout();
    applyLayout();
    window.requestAnimationFrame(function () {
      $("collapse-sidebar-button").focus({ preventScroll: true });
    });
    recordPreferenceChange(before, next ? "Collapse navigation rail" : "Expand navigation rail");
  }

  function escapeHTML(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function noteBodyLoaded(note) {
    if (!note) return false;
    if (state.bodyCache.has(note.recordName)) return true;
    if (state.nativeSchema && typeof fieldValue(note.record, "text") === "string") return true;
    return !state.nativeSchema && typeof fieldValue(note.record, "body") === "string";
  }

  function searchCorpus() {
    return state.notes.filter(function (note) { return !isArchived(note.record); }).map(function (note) {
      const modifiedAt = note.modifiedAt.getTime();
      const loaded = noteBodyLoaded(note);
      return {
        id: note.recordName,
        title: note.title,
        body: launchLibrary ? launchLibrary.searchBody(note, loaded) : (loaded ? (note.editorBody || note.body || "") : ""),
        folder: note.folderPath || "",
        createdAt: note.createdAt.getTime(),
        updatedAt: modifiedAt,
        sourceRevision: semanticSourceRevision(note)
      };
    });
  }

  function advanceSemanticRevision(note) {
    if (!note) return;
    state.semanticRevisionSequence = Math.max(Date.now(), state.semanticRevisionSequence + 1);
    note.semanticRevision = state.semanticRevisionSequence;
    const noteID = String(note.recordName || "");
    const previousRevision = state.semanticResultRevisions.get(noteID);
    if (!noteID || !state.semanticRequestedQuery || previousRevision == null || previousRevision === semanticSourceRevision(note)) return;
    state.semanticScores.delete(noteID);
    state.semanticPassages.delete(noteID);
    if (!state.semanticPendingNoteIds.has(noteID)) {
      state.semanticPendingNoteIds.add(noteID);
      if (state.semanticProgress) {
        state.semanticProgress = {
          indexed: Math.max(0, state.semanticProgress.indexed - 1),
          total: state.semanticProgress.total,
          remaining: state.semanticProgress.remaining + 1,
          skipped: state.semanticProgress.skipped
        };
      }
    }
    const request = state.semanticCurrentRequest;
    if (!request || !semanticSearchIsCurrent(request)) return;
    state.semanticLoadingQuery = request.normalized;
    if (state.searchPage) renderSearchPage();
    else if ($("search-dialog").open) renderSearchSuggestions($("global-search-input").value);
    if (state.semanticWorkerUnavailable || state.semanticErrorQuery === request.normalized) return;
    if (state.semanticWorkerBusy) {
      state.semanticPendingRequest = request;
      return;
    }
    if (!state.semanticProgress) {
      state.semanticProgress = { indexed: state.semanticScores.size, total: searchCorpus().length, remaining: 1, skipped: 0 };
    } else if (!state.semanticProgress.remaining) {
      state.semanticProgress.remaining = 1;
    }
    scheduleNextSemanticBatch(request);
  }

  function semanticSourceRevision(note) {
    if (!note) return "";
    const modifiedAt = note.modifiedAt instanceof Date ? note.modifiedAt.getTime() : Number(note.updatedAt || 0);
    const recordChangeTag = String(note.record && note.record.recordChangeTag || "");
    const contentFingerprint = String(fieldValue(note.record, "contentFingerprint") || "");
    return modifiedAt + ":" + recordChangeTag + ":" + contentFingerprint + ":" + String(note.semanticRevision || 0);
  }

  function meaningfulSearchTerms(query) {
    const stopWords = new Set(["the", "and", "for", "from", "with", "that", "this", "what", "when", "where", "who", "why", "how", "are", "was", "were", "a", "an", "to", "in", "on", "at", "or", "of", "by", "as"]);
    return String(query || "").trim().split(/\s+/).filter(function (term) {
      const lower = term.toLocaleLowerCase(); return lower.length >= 3 && !stopWords.has(lower);
    }).sort(function (a, b) { return b.length - a.length; });
  }

  function highlightMatch(text, query) {
    const value = String(text || "");
    const terms = meaningfulSearchTerms(query);
    if (!terms.length) return escapeHTML(value);
    const pattern = new RegExp("(" + terms.map(function (term) { return term.replace(/[.*+?^$\\{}()|[\]\/]/g, "\\$&"); }).join("|") + ")", "ig");
    return value.split(pattern).map(function (part) {
      return terms.some(function (term) { return part.toLocaleLowerCase() === term.toLocaleLowerCase(); }) ? "<mark>" + escapeHTML(part) + "</mark>" : escapeHTML(part);
    }).join("");
  }

  function searchExcerpt(note, query) {
    const text = String(note.body || "").replace(/^#{1,6}\s*/gm, "").replace(/^\s*[-*+]\s+/gm, "").replace(/^\s*\d+[.)]\s+/gm, "").replace(/\s+/g, " ").trim();
    if (!text) return "This note is ready for a few words.";
    const term = meaningfulSearchTerms(query).find(function (word) { return text.toLocaleLowerCase().includes(word.toLocaleLowerCase()); });
    if (!term) return text.slice(0, 150);
    const offset = Math.max(0, text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase()) - 55);
    return (offset ? "…" : "") + text.slice(offset, offset + 150) + (offset + 150 < text.length ? "…" : "");
  }

  function lexicalSearchNotes(query) {
    return searchLexically(searchCorpus(), query);
  }

  function searchNotes(query) {
    const normalized = String(query || "").trim().toLocaleLowerCase();
    if (!normalized) return [];
    const corpus = searchCorpus();
    const lexical = searchLexically(corpus, normalized).map(function (note) {
      const range = window.ArborPassageAnchor.findLexicalPassageRange(note.body, query);
      return Object.assign({}, note, { _passageCandidate: range ? { body: note.body, range: range } : null });
    });
    if (state.semanticSearchQuery !== normalized) return lexical;
    const eligibleCorpus = corpus.filter(function (note) { return state.semanticResultRevisions.get(String(note.id)) === note.sourceRevision; });
    const semantic = semanticOnlySuggestions(eligibleCorpus, state.semanticScores, lexical).map(function (note) {
      return Object.assign({}, note, { _passageCandidate: state.semanticPassages.get(note.id) || null });
    });
    return lexical.concat(semantic);
  }

  async function hydrateSearchBody(note) {
    if (!note || !state.database) return;
    if (state.nativeSchema) await ensureNativeTextBody(note);
    else await ensureWebTextBody(note);
  }

  async function hydrateSearchCorpus(request) {
    if (request.id !== state.semanticRequestId || request.normalized !== state.semanticRequestedQuery) return;
    renderNotes();
    if (state.semanticWorkerUnavailable) {
      state.semanticLoadingQuery = ""; state.semanticErrorQuery = request.normalized;
      if (state.searchPage) renderSearchPage(); else if ($("search-dialog").open) renderSearchSuggestions(request.query);
    } else sendSemanticSearch(request);
  }

  function scheduleCloudKitTitleSearch(query) {
    window.clearTimeout(state.titleQueryTimer);
    const text = String(query || "").trim();
    if (!text || state.demo || !state.database || typeof state.database.performQuery !== "function" || !launchLibrary) return;
    const requestId = ++state.titleQueryRequest;
    state.titleQueryTimer = window.setTimeout(function () {
      const built = launchLibrary.cloudKitTitleQuery(state.nativeSchema, state.nativeZoneID, text);
      if (!built) return;
      state.database.performQuery(built).then(function (response) {
        if (requestId !== state.titleQueryRequest || !accountSessionCurrent(state.accountSession)) return;
        const records = Array.isArray(response) ? response : (response && response.records) || [];
        let added = false;
        records.forEach(function (record) {
          if (!record || !record.recordName || state.records.has(record.recordName)) return;
          if (!cloudKitWebZone.isLibraryRecord(record, state.nativeSchema)) return;
          state.records.set(record.recordName, record);
          added = true;
        });
        if (!added) return;
        syncDerivedCollections();
        scheduleLibraryCacheWrite();
        if (state.searchPage) renderSearchPage();
        else if ($("search-dialog").open) renderSearchSuggestions(text);
      }).catch(function () {});
    }, 250);
  }

  function scheduleSemanticSearch(query) {
    const text = String(query || "").trim();
    const normalized = text.toLocaleLowerCase();
    if (normalized.length < 2) {
      if (state.semanticRequestedQuery) {
        state.semanticRequestedQuery = ""; state.semanticSearchQuery = ""; state.semanticLoadingQuery = ""; state.semanticErrorQuery = ""; state.semanticScores = new Map();
        state.semanticPassages = new Map();
        state.semanticProgress = null; state.semanticQueryVector = null;
        state.semanticResultRevisions = new Map(); state.semanticPendingNoteIds = new Set(); state.semanticCurrentRequest = null;
        state.semanticPendingRequest = null; state.semanticRequestId += 1; window.clearTimeout(state.semanticTimer); window.clearTimeout(state.semanticIndexTimer);
      }
      return;
    }
    if (normalized === state.semanticRequestedQuery) return;
    state.semanticRequestedQuery = normalized; state.semanticSearchQuery = ""; state.semanticErrorQuery = ""; state.semanticScores = new Map();
    state.semanticPassages = new Map();
    state.semanticProgress = null; state.semanticQueryVector = null;
    state.semanticResultRevisions = new Map(); state.semanticPendingNoteIds = new Set();
    state.semanticLoadingQuery = normalized;
    const request = {
      id: ++state.semanticRequestId,
      query: text,
      normalized: normalized,
      accountScope: state.connectionUserID || (state.demo ? "sample-preview" : "signed-out"),
      accountSession: state.accountSession,
      priorityNoteIds: lexicalSearchNotes(text).slice(0, 12).map(function (note) { return note.id; })
    };
    state.semanticCurrentRequest = request;
    window.clearTimeout(state.semanticTimer);
    window.clearTimeout(state.semanticIndexTimer);
    state.semanticTimer = window.setTimeout(function () { hydrateSearchCorpus(request); }, 180);
  }

  function semanticSearchIsCurrent(request) {
    const accountScope = state.connectionUserID || (state.demo ? "sample-preview" : "signed-out");
    return request && request.id === state.semanticRequestId && request.normalized === state.semanticRequestedQuery
      && request.accountSession === state.accountSession && request.accountScope === accountScope;
  }

  function semanticCorpusMatches(prepared) {
    if (!prepared || !Array.isArray(prepared.documents)) return false;
    const current = searchCorpus();
    if (current.length !== prepared.documents.length) return false;
    const revisions = new Map(current.map(function (note) { return [String(note.id), note.sourceRevision]; }));
    return prepared.documents.every(function (document) {
      return revisions.get(String(document.note.id)) === document.sourceRevision;
    });
  }

  function noteSemanticActivity() { state.semanticLastActivity = Date.now(); }

  function scheduleNextSemanticBatch(request) {
    window.clearTimeout(state.semanticIndexTimer);
    if (!semanticSearchIsCurrent(request) || document.visibilityState === "hidden" || !state.semanticProgress || !state.semanticProgress.remaining) return;
    const idleFor = Date.now() - state.semanticLastActivity;
    const wait = Math.max(150, SEMANTIC_INDEX_IDLE_GRACE_MS - idleFor);
    state.semanticIndexTimer = window.setTimeout(function () {
      state.semanticIndexTimer = 0;
      if (!semanticSearchIsCurrent(request) || document.visibilityState === "hidden") return;
      if (Date.now() - state.semanticLastActivity < SEMANTIC_INDEX_IDLE_GRACE_MS) {
        scheduleNextSemanticBatch(request);
        return;
      }
      sendSemanticSearch(request, true);
    }, wait);
  }

  function semanticProgressText(query) {
    const normalized = String(query || "").trim().toLocaleLowerCase();
    if (state.semanticRequestedQuery !== normalized) return "";
    if (state.semanticErrorQuery === normalized && !state.semanticProgress) return "Related-note search unavailable; exact word results are shown.";
    if (!state.semanticProgress) return "";
    const progress = state.semanticProgress;
    const skipped = progress.skipped ? " " + progress.skipped + " notes exceeded the passage limit." : "";
    if (progress.remaining > 0) return "Related results from " + progress.indexed + " of " + progress.total + " indexed notes; " + (state.semanticErrorQuery === state.semanticRequestedQuery ? "indexing paused." : "indexing continues.") + skipped;
    if (progress.skipped > 0) return "Related results from " + progress.indexed + " of " + progress.total + " indexed notes; " + progress.skipped + " notes exceeded the passage limit.";
    return "Related results checked across all " + progress.total + " notes.";
  }

  function renderSemanticSearchUpdate(request) {
    const selected = state.searchItems[state.searchActiveIndex] && state.searchItems[state.searchActiveIndex].id;
    state.searchItems = searchNotes(request.query).slice(0, state.searchPage ? 100 : 8);
    if (selected) {
      const index = state.searchItems.findIndex(function (note) { return note.id === selected; });
      state.searchActiveIndex = index >= 0 ? index : -1;
    }
    if (state.searchPage) renderSearchPage();
    else if ($("search-dialog").open) renderSearchSuggestions(request.query);
  }

  let semanticIndexPromise;
  function loadSemanticIndex() {
    if (!semanticIndexPromise) semanticIndexPromise = import("./semantic-search-index.js?v=arb-190-instant-launch-20261125-a");
    return semanticIndexPromise;
  }

  function releaseSemanticWorker() {
    state.semanticWorkerBusy = false; state.semanticWorkerRequestId = 0; state.semanticActiveRequest = null; state.semanticPrepared = null;
    scheduleSemanticWorkerIdleUnload();
  }

  function scheduleSemanticWorkerIdleUnload() {
    cancelSemanticWorkerIdleUnload();
    if (!state.semanticWorker) return;
    const generation = state.semanticWorkerIdleGeneration;
    state.semanticWorkerIdleTimer = window.setTimeout(async function () {
      state.semanticWorkerIdleTimer = 0;
      if (generation !== state.semanticWorkerIdleGeneration || state.semanticWorkerBusy || state.semanticPendingRequest || document.visibilityState === "hidden") return;
      const worker = state.semanticWorker;
      if (!worker) return;
      state.semanticWorker = null;
      worker.terminate();
      try {
        const index = await loadSemanticIndex();
        if (generation !== state.semanticWorkerIdleGeneration || state.semanticWorkerBusy || state.semanticPendingRequest || state.semanticWorker) return;
        await index.releaseSemanticMemory();
      } catch (_) {}
    }, SEMANTIC_WORKER_IDLE_UNLOAD_MS);
  }

  function pauseSemanticWorkerForHiddenTab() {
    window.clearTimeout(state.semanticIndexTimer);
    if (!state.semanticWorker && !state.semanticWorkerBusy && !state.semanticLoadingQuery && !(state.semanticProgress && state.semanticProgress.remaining)) return;
    state.semanticPendingRequest = null;
    stopSemanticWorker();
    state.semanticRequestedQuery = "";
    state.semanticSearchQuery = "";
    state.semanticLoadingQuery = "";
    state.semanticErrorQuery = "";
    state.semanticScores = new Map();
    state.semanticPassages = new Map();
    state.semanticProgress = null; state.semanticQueryVector = null;
    state.semanticResultRevisions = new Map(); state.semanticPendingNoteIds = new Set(); state.semanticCurrentRequest = null;
    const input = $(state.searchPage ? "expanded-search-input" : "global-search-input");
    const query = input && input.value || state.searchQuery || "";
    if (state.searchPage) renderSearchPage();
    else if ($("search-dialog").open) renderSearchSuggestions(query);
    loadSemanticIndex().then(function (index) { return index.resetSemanticIndex(); }).catch(function () {});
  }

  function disableSemanticSearch(error) {
    if (error) console.warn("On-device related-note search is unavailable; exact word search stays active.", error);
    state.semanticWorkerUnavailable = true; state.semanticPendingRequest = null;
    releaseSemanticWorker();
    window.clearTimeout(state.semanticWorkerTimer);
    window.clearTimeout(state.semanticIndexTimer);
    if (state.semanticWorker) { state.semanticWorker.terminate(); state.semanticWorker = null; }
    state.semanticLoadingQuery = ""; state.semanticErrorQuery = state.semanticRequestedQuery;
    if (state.searchPage) renderSearchPage(); else if ($("search-dialog").open) renderSearchSuggestions($("global-search-input").value);
  }

  function startSemanticWorker() {
    if (state.semanticWorker) return state.semanticWorker;
    try {
      const worker = new Worker("./semantic-search-worker.js?v=arb-190-instant-launch-20261125-a", { type: "module" });
      worker.addEventListener("message", function (event) {
        const message = event.data || {};
        if (!state.semanticWorkerBusy || message.id !== state.semanticWorkerRequestId) return;
        const request = state.semanticActiveRequest;
        const prepared = state.semanticPrepared;
        window.clearTimeout(state.semanticWorkerTimer);
        if (message.error) { disableSemanticSearch(new Error(message.error)); return; }
        finishSemanticResult(request, prepared, message.vectors);
      });
      worker.addEventListener("error", function (event) { event.preventDefault(); disableSemanticSearch(event.message || new Error("Search worker failed")); });
      state.semanticWorker = worker; return worker;
    } catch (error) { disableSemanticSearch(error); return null; }
  }

  async function finishSemanticResult(request, prepared, rows) {
    try {
      const index = await loadSemanticIndex();
      const completion = await index.completeSemanticQuery(prepared, rows);
      releaseSemanticWorker();
      if (semanticSearchIsCurrent(request) && !completion.stale && !semanticCorpusMatches(prepared)) {
        state.semanticQueryVector = null;
        state.semanticPendingRequest = request;
      } else if (semanticSearchIsCurrent(request) && !completion.stale) {
        const results = completion.results || [];
        state.semanticQueryVector = completion.queryVector;
        state.semanticScores = new Map(results.map(function (result) { return [result.id, result.score]; }));
        state.semanticPassages = new Map(results.filter(function (result) { return result.passage; }).map(function (result) { return [result.id, result.passage]; }));
        state.semanticResultRevisions = new Map(results.map(function (result) { return [String(result.id), result.sourceRevision]; }));
        results.forEach(function (result) {
          if (state.semanticPendingNoteIds.has(String(result.id))) state.semanticPendingNoteIds.delete(String(result.id));
        });
        state.semanticProgress = completion.coverage;
        state.semanticSearchQuery = request.normalized;
        state.semanticLoadingQuery = completion.coverage.remaining ? request.normalized : "";
        state.semanticErrorQuery = "";
        renderSemanticSearchUpdate(request);
        if (completion.coverage.remaining) scheduleNextSemanticBatch(request);
      }
      sendPendingSemanticSearch();
    } catch (error) { disableSemanticSearch(error); }
  }

  async function sendSemanticSearch(request, continuing) {
    if (!semanticSearchIsCurrent(request)) return;
    cancelSemanticWorkerIdleUnload();
    const worker = startSemanticWorker(); if (!worker) return;
    if (state.semanticWorkerBusy) { state.semanticPendingRequest = request; return; }
    state.semanticWorkerBusy = true; state.semanticWorkerRequestId = request.id; state.semanticActiveRequest = request;
    try {
      const notes = searchCorpus();
      if (!notes.length) {
        releaseSemanticWorker();
        if (semanticSearchIsCurrent(request)) {
          state.semanticScores = new Map();
          state.semanticPassages = new Map();
          state.semanticResultRevisions = new Map();
          state.semanticPendingNoteIds = new Set();
          state.semanticSearchQuery = request.normalized; state.semanticLoadingQuery = ""; state.semanticErrorQuery = "";
          renderSemanticSearchUpdate(request);
        }
        sendPendingSemanticSearch();
        return;
      }
      const index = await loadSemanticIndex();
      if (!semanticSearchIsCurrent(request)) { releaseSemanticWorker(); sendPendingSemanticSearch(); return; }
      const prepared = await index.prepareSemanticQuery(request.query, notes, {
        accountScope: request.accountScope,
        priorityNoteIds: request.priorityNoteIds,
        batchNotes: continuing ? SEMANTIC_BACKGROUND_BATCH_NOTES : SEMANTIC_FIRST_ANSWER_NOTES,
        batchPassages: continuing ? SEMANTIC_BACKGROUND_BATCH_PASSAGES : SEMANTIC_FIRST_ANSWER_PASSAGES
      });
      if (!semanticSearchIsCurrent(request)) { releaseSemanticWorker(); sendPendingSemanticSearch(); return; }
      state.semanticPrepared = prepared;
      const queryVector = state.semanticQueryVector;
      worker.postMessage({ id: request.id, queryVector: queryVector, texts: (queryVector ? [] : [prepared.queryText]).concat(prepared.passages) });
      state.semanticWorkerTimer = window.setTimeout(function () {
        if (state.semanticWorkerBusy && state.semanticWorkerRequestId === request.id) disableSemanticSearch(new Error("Search took too long"));
      }, SEMANTIC_WORKER_TIMEOUT_MS);
    } catch (error) { disableSemanticSearch(error); }
  }

  function sendPendingSemanticSearch() {
    const pending = state.semanticPendingRequest; state.semanticPendingRequest = null;
    if (pending) sendSemanticSearch(pending);
  }

  function renderSearchSuggestions(query) {
    const list = $("search-suggestions"); const input = $("global-search-input"); const text = String(query || "").trim();
    scheduleSemanticSearch(text); scheduleCloudKitTitleSearch(text); state.searchItems = text ? searchNotes(text).slice(0, 8) : [];
    if (!text) { state.searchActiveIndex = -1; input.removeAttribute("aria-activedescendant"); setMotionVisibility(list, false); list.innerHTML = ""; return; }
    if (state.searchActiveIndex >= state.searchItems.length) state.searchActiveIndex = -1;
    const progress = semanticProgressText(text);
    if (!state.searchItems.length) {
      const message = state.semanticLoadingQuery === text.toLocaleLowerCase() ? "Looking for related notes…" : state.semanticErrorQuery === text.toLocaleLowerCase() ? "Related-note search unavailable" : "No matching notes";
      list.innerHTML = '<div class="search-suggestions-empty" aria-live="polite">' + escapeHTML(progress || message) + "</div>";
    } else list.innerHTML = state.searchItems.map(function (note, index) {
      const folder = note.folder ? '<span class="search-suggestion-folder"><img src="./icons/folder-stroke.svg" alt="">' + escapeHTML(note.folder) + "</span>" : "";
      const excerpt = note._passageCandidate && note._passageCandidate.excerpt || searchExcerpt(note, text);
      return '<button id="search-suggestion-' + index + '" class="search-suggestion' + (index === state.searchActiveIndex ? " is-active" : "") + '" type="button" role="option" aria-selected="' + (index === state.searchActiveIndex) + '" data-search-note-id="' + escapeHTML(note.id) + '" data-search-index="' + index + '"><span class="search-suggestion-title">' + highlightMatch(note.title, text) + '</span><span class="search-suggestion-excerpt">' + highlightMatch(excerpt, text) + '</span><span class="search-suggestion-footer">' + folder + '<span class="search-suggestion-date">' + escapeHTML(formatDate(new Date(note.updatedAt))) + "</span></span></button>";
    }).join("");
    if (progress && state.searchItems.length) list.insertAdjacentHTML("beforeend", '<div class="search-suggestions-empty" aria-live="polite">' + escapeHTML(progress) + "</div>");
    setMotionVisibility(list, true);
    const active = list.querySelector(".is-active");
    if (active) input.setAttribute("aria-activedescendant", active.id); else input.removeAttribute("aria-activedescendant");
  }

  function moveSearchSelection(delta) {
    if (!state.searchItems.length) return;
    const count = state.searchItems.length;
    state.searchActiveIndex = state.searchActiveIndex < 0 ? (delta > 0 ? 0 : count - 1) : (state.searchActiveIndex + delta + count) % count;
    renderSearchSuggestions($("global-search-input").value);
    const active = $("search-suggestions").querySelector(".is-active"); if (active) active.scrollIntoView({ block: "nearest" });
  }

  function stopSearchPrompt() { window.clearTimeout(state.searchPromptTimer); state.searchPromptTimer = 0; }

  function startSearchPrompt() {
    stopSearchPrompt(); state.searchPromptIndex = 0; state.searchPromptActive = true;
    const prompts = ["Search for a word…", "Search for a thought…", "Search for a note…", "Search for a place…", "Search for an idea…"];
    const prompt = $("search-prompt"); const input = $("global-search-input");
    prompt.textContent = prompts[state.searchPromptIndex]; prompt.hidden = false; prompt.classList.remove("is-fading");
    const advance = function () {
      if (!state.searchPromptActive || !$("search-dialog").open || input.value) return;
      state.searchPromptTimer = window.setTimeout(function () {
        prompt.classList.add("is-fading");
        state.searchPromptTimer = window.setTimeout(function () {
          state.searchPromptIndex = (state.searchPromptIndex + 1) % prompts.length;
          prompt.textContent = prompts[state.searchPromptIndex]; prompt.classList.remove("is-fading"); advance();
        }, 420);
      }, 2200);
    };
    advance();
  }

  function renderSearchPage() {
    const input = $("expanded-search-input");
    if (document.activeElement !== input) input.value = state.searchQuery;
    const query = input.value.trim(); state.searchQuery = input.value; scheduleSemanticSearch(query); scheduleCloudKitTitleSearch(query);
    state.searchItems = searchNotes(query).slice(0, 100);
    if (!query) {
      $("expanded-search-count").textContent = "";
      $("expanded-search-results").innerHTML = '<div class="search-page-empty">Search your notes by a word or phrase.</div>';
      return;
    }
    const progress = semanticProgressText(query);
    $("expanded-search-count").textContent = state.searchItems.length + (state.searchItems.length === 1 ? " result" : " results") + " for “" + query + "”" + (progress ? " · " + progress : "");
    if (!state.searchItems.length) {
      const message = state.semanticLoadingQuery === query.toLocaleLowerCase() ? "Looking for related notes…" : state.semanticErrorQuery === query.toLocaleLowerCase() ? "Related-note search unavailable." : "No notes match this search.";
      $("expanded-search-results").innerHTML = '<div class="search-page-empty">' + message + "</div>"; return;
    }
    $("expanded-search-results").innerHTML = state.searchItems.map(function (note, index) {
      const folder = note.folder || "Unfiled";
      const excerpt = note._passageCandidate && note._passageCandidate.excerpt || searchExcerpt(note, query);
      return '<button class="search-page-row' + (index === state.searchActiveIndex ? " is-active" : "") + '" type="button" role="option" aria-selected="' + (index === state.searchActiveIndex) + '" data-search-note-id="' + escapeHTML(note.id) + '"><span class="search-page-row-title">' + highlightMatch(note.title, query) + '</span><span class="search-page-row-meta"><span class="search-page-row-date">' + escapeHTML(formatDate(new Date(note.updatedAt))) + '</span><span class="search-page-row-excerpt">' + highlightMatch(excerpt, query) + '</span></span><span class="search-page-row-folder"><img src="./icons/folder-stroke.svg" alt="">' + escapeHTML(folder) + "</span></button>";
    }).join("");
  }

  function openCapture() {
    if (state.showingArchive) {
      state.showingArchive = false;
      state.selectedFolder = "";
      renderAll();
    }
    $("capture-input").value = ""; resizeCaptureInput();
    if (!$("capture-dialog").open) $("capture-dialog").showModal();
    window.requestAnimationFrame(function () { $("capture-input").focus(); });
  }

  function resizeCaptureInput() {
    const dialog = $("capture-dialog");
    const previousHeight = dialog.open ? dialog.offsetHeight : 0;
    if (captureResizeAnimation) {
      captureResizeAnimation.cancel();
      captureResizeAnimation = null;
    }
    const input = $("capture-input"); input.style.height = "auto";
    const height = Math.min(input.scrollHeight, parseFloat(getComputedStyle(input).maxHeight) || input.scrollHeight);
    input.style.height = height + "px";
    const bar = dialog.querySelector(".quick-dialog-bar");
    const nextHeight = Math.max(parseFloat(getComputedStyle(bar).minHeight) || 0, height + 30);
    bar.style.height = nextHeight + "px";
    if (!dialog.open || previousHeight <= 0 || Math.abs(nextHeight - previousHeight) < 1 ||
        typeof dialog.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rootStyle = getComputedStyle(document.documentElement);
    const rawDuration = rootStyle.getPropertyValue("--motion-duration-short").trim();
    const numericDuration = Number.parseFloat(rawDuration);
    const duration = numericDuration ? numericDuration * (rawDuration.endsWith("ms") ? 1 : 1000) : 350;
    const easing = rootStyle.getPropertyValue("--ease-standard").trim() || "ease-out";
    const animation = dialog.animate(
      [{ height: previousHeight + "px" }, { height: nextHeight + "px" }],
      { duration: duration, easing: window.CSS && CSS.supports("animation-timing-function", easing) ? easing : "ease-out" }
    );
    captureResizeAnimation = animation;
    animation.onfinish = function () { if (captureResizeAnimation === animation) captureResizeAnimation = null; };
  }

  function commitCapture() {
    const text = $("capture-input").value;
    if (!text.trim()) return;
    $("capture-dialog").close();
    createNote(text, true);
  }

  function openSearch() {
    $("global-search-input").value = ""; state.searchActiveIndex = -1; state.searchItems = [];
    renderSearchSuggestions("");
    if (!$("search-dialog").open) $("search-dialog").showModal();
    startSearchPrompt(); window.requestAnimationFrame(function () { $("global-search-input").focus(); });
  }

  function openExpandedSearch(query) {
    const text = String(query || "").trim();
    state.showingArchive = false;
    state.selectedFolder = "";
    state.searchPage = true; state.searchQuery = text; state.searchActiveIndex = text ? 0 : -1; state.searchItems = [];
    if ($("search-dialog").open) $("search-dialog").close();
    frame.classList.add("is-search-expanded"); renderAll();
    closeMobileNavigation();
    window.requestAnimationFrame(function () { const input = $("expanded-search-input"); input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
  }

  function closeExpandedSearch() {
    state.searchPage = false; frame.classList.remove("is-search-expanded"); renderAll();
    window.requestAnimationFrame(function () { $("search-nav-button").focus({ preventScroll: true }); });
  }

  function openSearchResult(recordName) {
    const result = state.searchItems.find(function (item) { return item.id === recordName; });
    const candidate = result && result._passageCandidate;
    const session = state.accountSession;
    if ($("search-dialog").open) $("search-dialog").close();
    if (state.searchPage) { state.searchPage = false; frame.classList.remove("is-search-expanded"); }
    state.showingArchive = false;
    state.selectedFolder = "";
    openNote(recordName).then(async function (opened) {
      if (!opened || !candidate || !accountSessionCurrent(session)) { renderAll(); return; }
      const note = state.notes.find(function (item) { return item.recordName === recordName; });
      if (!note || !accountSessionCurrent(session)) { renderAll(); return; }
      const index = window.ArborPassageAnchor;
      let anchor = candidate.anchor || null;
      if (!anchor && candidate.range && typeof candidate.body === "string") {
        try {
          anchor = await index.createPassageAnchor({
            noteId: recordName,
            body: candidate.body,
            start: candidate.range.start,
            end: candidate.range.end,
            matchProvenance: candidate.range.matchProvenance
          });
        } catch (_) { anchor = null; }
      }
      if (!anchor || !accountSessionCurrent(session)) { renderAll(); return; }
      const resolved = await index.resolvePassageAnchor(anchor, {
        exists: true,
        noteId: recordName,
        archived: isArchived(note.record),
        body: currentEditorBodyMarkdown()
      });
      if (!accountSessionCurrent(session)) return;
      if (resolved.resolutionStatus === "resolved") {
        if (!selectSearchPassage(resolved)) showToast("The note opened, but its current Markdown could not place this passage exactly.", true);
      } else if (resolved.resolutionStatus !== "archived") {
        showToast(resolved.resolutionStatus === "ambiguous"
          ? "This passage now appears in more than one place. The note is open without a highlight."
          : "This passage changed since search. The note is open without an approximate highlight.", true);
      }
      renderAll();
    });
  }

  function textWithLineBreaks(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR") return "\n";
    return Array.from(node.childNodes || []).map(textWithLineBreaks).join("");
  }

  function inlineMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.tagName === "BR") return "\n";
    const value = Array.from(node.childNodes).map(inlineMarkdown).join("");
    if (!value.replace(/[\s\u00a0]/g, "")) return value;
    if (node.tagName === "STRONG" || node.tagName === "B") return "**" + value + "**";
    if (node.tagName === "EM" || node.tagName === "I") return "*" + value + "*";
    if (node.tagName === "CODE") return "`" + value + "`";
    if (["S", "DEL", "STRIKE"].includes(node.tagName)) return "~~" + value + "~~";
    return value;
  }

  function markdownForEditorBlock(block) {
    if (block.nodeType === Node.TEXT_NODE) return (block.nodeValue || "").replace(/\u00a0/g, " ").trim();
    if (block.nodeType !== Node.ELEMENT_NODE) return "";
    if (block.tagName === "UL" || block.tagName === "OL") {
      const items = Array.from(block.children).filter(function (item) { return item.tagName === "LI"; }).map(function (item) {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const content = Array.from(item.childNodes).filter(function (child) { return child !== checkbox; }).map(inlineMarkdown).join("").replace(/\n/g, " ").trim();
        return {
          checkbox: Boolean(checkbox),
          checked: Boolean(checkbox && checkbox.checked),
          content: content,
          indentation: item.dataset.indent,
          number: item.dataset.number
        };
      });
      return serializeMarkdownList({
        tagName: block.tagName,
        marker: block.dataset.marker,
        delimiter: block.dataset.delimiter,
        indentation: block.dataset.indent,
        start: block.getAttribute("start"),
        items: items
      });
    }
    const value = inlineMarkdown(block).replace(/\u00a0/g, " ").trim();
    if (/^H[1-3]$/.test(block.tagName)) return "#".repeat(Number(block.tagName[1])) + " " + value;
    if (block.tagName === "BLOCKQUOTE") return value.split("\n").map(function (line) { return "> " + line; }).join("\n");
    return value;
  }

  function bodyMarkdownParts(body) {
    const blockTags = new Set(["BLOCKQUOTE", "DIV", "H1", "H2", "H3", "OL", "P", "UL"]);
    const blocks = [];
    let inlineNodes = [];
    function flushInlineRun() {
      if (!inlineNodes.length) return;
      const markdown = inlineNodes.map(inlineMarkdown).join("").replace(/\u00a0/g, " ").trim();
      if (markdown) blocks.push({ node: null, markdown: markdown });
      inlineNodes = [];
    }
    Array.from(body.childNodes).forEach(function (node) {
      if (node.nodeType === Node.ELEMENT_NODE && blockTags.has(node.tagName)) {
        flushInlineRun();
        blocks.push({ node: node, markdown: markdownForEditorBlock(node) });
      } else inlineNodes.push(node);
    });
    flushInlineRun();
    const serializedBlocks = blocks;
    const noteText = serializedBlocks.map(function (block) { return block.markdown; }).join("\n\n");
    const parts = [];
    let offset = 0;
    serializedBlocks.forEach(function (block, index) {
      if (index) offset += 2;
      const start = offset;
      if (block.node && block.markdown) parts.push({ node: block.node, markdown: block.markdown, start: start, end: start + block.markdown.length });
      offset += block.markdown.length;
    });
    return { noteText: noteText, parts: parts };
  }

  function bodyMarkdown(body) {
    return bodyMarkdownParts(body).noteText;
  }

  function inlineMarkdownWithOffsets(root, prefix) {
    const offsets = new WeakMap();
    let markdown = prefix || "";
    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = (node.nodeValue || "").replace(/\u00a0/g, " ");
        const positions = [];
        for (let index = 0; index <= value.length; index += 1) positions.push(markdown.length + index);
        offsets.set(node, positions);
        markdown += value;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === "BR") {
        offsets.set(node, [markdown.length, markdown.length + 1]);
        markdown += "\n";
        return;
      }
      const marker = node.tagName === "STRONG" || node.tagName === "B" ? ["**", "**"]
        : node.tagName === "EM" || node.tagName === "I" ? ["*", "*"]
          : node.tagName === "CODE" ? ["`", "`"]
            : ["S", "DEL", "STRIKE"].includes(node.tagName) ? ["~~", "~~"]
            : ["", ""];
      const positions = [markdown.length + marker[0].length];
      markdown += marker[0];
      Array.from(node.childNodes).forEach(function (child) {
        visit(child);
        positions.push(markdown.length);
      });
      markdown += marker[1];
      if (positions.length > 1) positions[positions.length - 1] = markdown.length;
      offsets.set(node, positions);
    }
    const rootPositions = [markdown.length];
    Array.from(root.childNodes).forEach(function (child) {
      visit(child);
      rootPositions.push(markdown.length);
    });
    offsets.set(root, rootPositions);
    return { markdown: markdown, offsets: offsets };
  }

  function normalizedInlineReviewBlock(block) {
    const headingPrefix = /^H[1-3]$/.test(block.tagName) ? "#".repeat(Number(block.tagName[1])) + " " : "";
    const serialized = inlineMarkdownWithOffsets(block, headingPrefix);
    const innerStart = headingPrefix.length;
    const inner = serialized.markdown.slice(innerStart);
    const leading = inner.length - inner.trimStart().length;
    const normalized = inner.trim();
    const markdown = headingPrefix + normalized;
    function toOffset(node, requestedOffset) {
      const positions = serialized.offsets.get(node);
      if (!positions) return null;
      const index = Math.max(0, Math.min(positions.length - 1, Number(requestedOffset) || 0));
      const raw = positions[index];
      return Math.max(0, Math.min(markdown.length, raw < innerStart ? raw : innerStart + Math.max(0, Math.min(normalized.length, raw - innerStart - leading))));
    }
    return { markdown: markdown, toOffset: toOffset };
  }

  function listItemReviewBlock(body, item) {
    const list = item && item.parentElement;
    if (!list || !["UL", "OL"].includes(list.tagName)) return null;
    const parts = bodyMarkdownParts(body);
    const part = parts.parts.find(function (candidate) { return candidate.node === list; });
    if (!part) return null;
    const rows = Array.from(list.children).filter(function (child) { return child.tagName === "LI"; });
    const index = rows.indexOf(item);
    if (index < 0) return null;
    const serialized = inlineMarkdownWithOffsets(item, "");
    const leading = serialized.markdown.length - serialized.markdown.trimStart().length;
    const content = serialized.markdown.replace(/\n/g, " ").trim();
    if (!content) return null;
    const lines = part.markdown.split("\n");
    const line = lines[index];
    if (line == null) return null;
    const contentStart = line.indexOf(content);
    if (contentStart < 0) return null;
    const lineStart = lines.slice(0, index).reduce(function (sum, value) { return sum + value.length + 1; }, 0);
    return {
      markdown: content,
      start: part.start + lineStart + contentStart,
      toOffset: function (node, requestedOffset) {
        const positions = serialized.offsets.get(node);
        if (!positions) return null;
        const offset = Math.max(0, Math.min(positions.length - 1, Number(requestedOffset) || 0));
        const local = Math.max(0, Math.min(content.length, positions[offset] - leading));
        return part.start + lineStart + contentStart + local;
      }
    };
  }

  function searchMarkdownPoint(root, requestedOffset) {
    const requested = Number(requestedOffset);
    if (!root || !Number.isInteger(requested) || requested < 0) return null;
    const source = currentEditorBodyMarkdown();
    let normalizedSource = "";
    const normalizedToSource = [0];
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === "\r") {
        if (source[index + 1] === "\n") { normalizedSource += "\n"; index += 1; }
        if (source[index] === "\n") normalizedToSource.push(index + 1);
        else normalizedToSource[normalizedToSource.length - 1] = index + 1;
        continue;
      }
      normalizedSource += source[index];
      normalizedToSource.push(index + 1);
    }
    let normalizedOffset = -1;
    for (let index = 0; index < normalizedToSource.length; index += 1) {
      if (normalizedToSource[index] === requested) { normalizedOffset = index; break; }
    }
    if (normalizedOffset < 0) return null;
    const parts = bodyMarkdownParts(root).parts;
    let sourceCursor = 0;
    for (const part of parts) {
      if (!part.markdown) continue;
      const sourceStart = normalizedSource.indexOf(part.markdown, sourceCursor);
      if (sourceStart < 0) continue;
      sourceCursor = sourceStart + part.markdown.length;
      const sourceLocal = normalizedOffset - sourceStart;
      if (sourceLocal < 0 || sourceLocal > part.markdown.length) continue;
      if (part.node.tagName === "UL" || part.node.tagName === "OL") {
        for (const item of Array.from(part.node.children).filter(function (child) { return child.tagName === "LI"; })) {
          const mapping = listItemReviewBlock(root, item);
          if (!mapping || sourceLocal < mapping.start - part.start || sourceLocal > mapping.start - part.start + mapping.markdown.length) continue;
          const serialized = inlineMarkdownWithOffsets(item, "");
          const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const positions = serialized.offsets.get(node) || [];
            for (let offset = 0; offset < positions.length; offset += 1) {
              if (mapping.toOffset(node, offset) - part.start === sourceLocal) return { node: node, offset: offset };
            }
          }
        }
        continue;
      }

      const prefix = /^H[1-3]$/.test(part.node.tagName) ? "#".repeat(Number(part.node.tagName[1])) + " " : "";
      const serialized = inlineMarkdownWithOffsets(part.node, prefix);
      const inner = serialized.markdown.slice(prefix.length);
      const leading = inner.length - inner.trimStart().length;
      const quote = part.node.tagName === "BLOCKQUOTE";
      const walker = document.createTreeWalker(part.node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const positions = serialized.offsets.get(node) || [];
        for (let offset = 0; offset < positions.length; offset += 1) {
          let local;
          if (quote) {
            const content = inner.slice(leading).trimEnd();
            const plainOffset = Math.max(0, positions[offset] - leading);
            const lineCount = (content.slice(0, plainOffset).match(/\n/g) || []).length;
            local = 2 + plainOffset + lineCount * 2;
          } else if (prefix) {
            local = prefix.length + Math.max(0, positions[offset] - prefix.length - leading);
          } else local = Math.max(0, positions[offset] - leading);
          if (local === sourceLocal) return { node: node, offset: offset };
        }
      }
    }
    return null;
  }

  function selectSearchPassage(anchor) {
    const root = $("note-body");
    const start = searchMarkdownPoint(root, anchor.start);
    const end = searchMarkdownPoint(root, anchor.end);
    if (!start || !end) return false;
    try {
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const target = start.node.parentElement;
      if (target && target.scrollIntoView) target.scrollIntoView({ block: "center", behavior: "smooth" });
      return true;
    } catch (_) { return false; }
  }

  function selectionReviewContext() {
    const body = $("note-body");
    const selection = window.getSelection();
    if (!body || !state.selectedRecordName || !selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!body.contains(range.startContainer) || !body.contains(range.endContainer)) return null;
    const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const endElement = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement;
    const startItem = startElement && startElement.closest ? startElement.closest("li") : null;
    const endItem = endElement && endElement.closest ? endElement.closest("li") : null;
    let block = null;
    let mapped = null;
    let paragraph = "";
    let paragraphStart = 0;
    if (startItem && startItem === endItem && body.contains(startItem)) {
      block = startItem;
      mapped = listItemReviewBlock(body, startItem);
      paragraph = mapped && mapped.markdown;
      paragraphStart = mapped ? mapped.start : 0;
    } else {
      let startBlock = startElement;
      let endBlock = endElement;
      while (startBlock && startBlock.parentElement !== body) startBlock = startBlock.parentElement;
      while (endBlock && endBlock.parentElement !== body) endBlock = endBlock.parentElement;
      if (!startBlock || startBlock !== endBlock || !["P", "DIV", "H1", "H2", "H3"].includes(startBlock.tagName)) return null;
      block = startBlock;
      const parts = bodyMarkdownParts(body);
      const part = parts.parts.find(function (candidate) { return candidate.node === block; });
      if (!part) return null;
      mapped = normalizedInlineReviewBlock(block);
      paragraph = mapped.markdown;
      const expected = markdownForEditorBlock(block);
      if (paragraph !== expected) return null;
      paragraphStart = part.start;
      mapped = {
        markdown: paragraph,
        toOffset: function (node, offset) {
          const local = normalizedInlineReviewBlock(block).toOffset(node, offset);
          return local == null ? null : part.start + local;
        }
      };
    }
    if (!mapped || !paragraph) return null;
    const start = mapped.toOffset(range.startContainer, range.startOffset);
    const end = mapped.toOffset(range.endContainer, range.endOffset);
    const noteText = state.editor ? state.editor.getMarkdown() : "";
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start || noteText.slice(start, end).length !== end - start) return null;
    const plainStart = editorTextOffset(body, range.startContainer, range.startOffset);
    const plainEnd = editorTextOffset(body, range.endContainer, range.endOffset);
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    const paragraphEnd = paragraphStart + paragraph.length;
    const isWholeParagraph = (block.tagName === "P" || block.tagName === "LI") && start === paragraphStart && end === paragraphEnd;
    const contextBefore = noteText.slice(Math.max(0, paragraphStart - 500), paragraphStart);
    const contextAfter = noteText.slice(paragraphEnd, paragraphEnd + 500);
    const method = isWholeParagraph ? "suggestSentences" : "suggestSelection";
    const payload = method === "suggestSentences"
      ? { paragraph: paragraph, start: paragraphStart, contextBefore: contextBefore, contextAfter: contextAfter }
      : { paragraph: paragraph, start: paragraphStart, selectionStart: start, selectionEnd: end, contextBefore: contextBefore, contextAfter: contextAfter };
    return {
      body: body,
      recordName: state.selectedRecordName,
      noteText: noteText,
      paragraph: paragraph,
      paragraphStart: paragraphStart,
      selectionStart: start,
      selectionEnd: end,
      plainStart: plainStart,
      plainEnd: plainEnd,
      range: rect,
      method: method,
      payload: payload
    };
  }

  function editorNodePath(root, node) {
    if (!root || !node || (node !== root && !root.contains(node))) return null;
    const path = [];
    let current = node;
    while (current && current !== root) {
      const parent = current.parentNode;
      if (!parent) return null;
      path.push(Array.prototype.indexOf.call(parent.childNodes, current));
      current = parent;
    }
    return current === root ? path.reverse() : null;
  }

  function resolveEditorNodePath(root, path) {
    let current = root;
    for (const index of path || []) {
      if (!current || !current.childNodes || !current.childNodes[index]) return null;
      current = current.childNodes[index];
    }
    return current;
  }

  function editorTextOffset(root, node, offset) {
    if (!root || !node || (node !== root && !root.contains(node))) return null;
    try {
      const range = document.createRange();
      range.selectNodeContents(root);
      range.setEnd(node, offset);
      return range.toString().length;
    } catch (_) { return null; }
  }

  function editorPointAtTextOffset(root, requestedOffset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, Number(requestedOffset) || 0);
    let last = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      last = node;
      if (remaining <= node.length) return { node: node, offset: remaining };
      remaining -= node.length;
    }
    return last ? { node: last, offset: last.length } : { node: root, offset: root.childNodes.length };
  }

  function restoreEditorTextSelection(root, saved) {
    if (!root || !saved) return false;
    const anchor = editorPointAtTextOffset(root, saved.anchorTextOffset);
    const focus = editorPointAtTextOffset(root, saved.focusTextOffset);
    try {
      const selection = window.getSelection();
      selection.removeAllRanges();
      if (typeof selection.setBaseAndExtent === "function") {
        selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
      } else {
        const range = document.createRange();
        range.setStart(anchor.node, anchor.offset);
        range.setEnd(focus.node, focus.offset);
        selection.addRange(range);
      }
      return true;
    } catch (_) { return false; }
  }

  function captureCorrectionSelection(root) {
    // Keep caret recovery inside its paragraph/list item; a whole-editor text
    // offset aliases the end of one block with a following empty block.
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
    function capturePoint(node, offset) {
      const block = editorBlockForNode(root, node);
      const textOffset = editorTextOffset(block, node, offset);
      return {
        blockPath: proofreadingBlockPath(block, root),
        nodePath: editorNodePath(block, node),
        nodeType: node.nodeType,
        offset: offset,
        textOffset: textOffset
      };
    }
    return {
      anchor: capturePoint(selection.anchorNode, selection.anchorOffset),
      focus: capturePoint(selection.focusNode, selection.focusOffset)
    };
  }

  function restoreCorrectionSelection(root, saved) {
    if (!root || !saved || !saved.anchor || !saved.focus) return false;
    function resolvePoint(point) {
      const block = proofreadingElementAtPath(root, point.blockPath || []);
      if (!block) return null;
      let node = resolveEditorNodePath(block, point.nodePath || []);
      let offset = Number(point.offset) || 0;
      if (node && node.nodeType === point.nodeType) {
        offset = Math.max(0, Math.min(offset, node.nodeType === Node.TEXT_NODE ? node.length : node.childNodes.length));
        if (editorTextOffset(block, node, offset) === point.textOffset) return { node: node, offset: offset };
      }
      const fallback = editorPointAtTextOffset(block, point.textOffset);
      return fallback ? { node: fallback.node, offset: fallback.offset } : null;
    }
    const anchor = resolvePoint(saved.anchor);
    const focus = resolvePoint(saved.focus);
    if (!anchor || !focus) return false;
    try {
      const selection = window.getSelection();
      selection.removeAllRanges();
      if (typeof selection.setBaseAndExtent === "function") {
        selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
      } else {
        const range = document.createRange();
        range.setStart(anchor.node, anchor.offset);
        range.setEnd(focus.node, focus.offset);
        selection.addRange(range);
      }
      return true;
    } catch (_) { return false; }
  }

  function captureEditorSelection(root) {
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
    return {
      anchorPath: editorNodePath(root, selection.anchorNode),
      anchorOffset: selection.anchorOffset,
      focusPath: editorNodePath(root, selection.focusNode),
      focusOffset: selection.focusOffset,
      anchorTextOffset: editorTextOffset(root, selection.anchorNode, selection.anchorOffset),
      focusTextOffset: editorTextOffset(root, selection.focusNode, selection.focusOffset)
    };
  }

  function restoreEditorSelection(root, saved) {
    if (!root || !saved) return false;
    const anchor = resolveEditorNodePath(root, saved.anchorPath);
    const focus = resolveEditorNodePath(root, saved.focusPath);
    if (!anchor || !focus) return restoreEditorTextSelection(root, saved);
    const boundOffset = function (node, offset) { return Math.max(0, Math.min(Number(offset) || 0, node.nodeType === Node.TEXT_NODE ? node.length : node.childNodes.length)); };
    try {
      const selection = window.getSelection();
      selection.removeAllRanges();
      if (typeof selection.setBaseAndExtent === "function") {
        selection.setBaseAndExtent(anchor, boundOffset(anchor, saved.anchorOffset), focus, boundOffset(focus, saved.focusOffset));
      } else {
        const range = document.createRange();
        range.setStart(anchor, boundOffset(anchor, saved.anchorOffset));
        range.setEnd(focus, boundOffset(focus, saved.focusOffset));
        selection.addRange(range);
      }
      return true;
    } catch (_) { return false; }
  }

  function captureEditorHistorySnapshot(options) {
    if (!state.selectedRecordName || !state.editor) return null;
    const opts = options || {};
    const title = $("note-title");
    const body = $("note-body");
    const active = document.activeElement;
    const isTitleFocused = active === title;
    const record = state.selectedRecord;
    const selectedNote = state.notes.find(function (item) { return item.recordName === state.selectedRecordName; });
    const generatedTitle = normalizedTitle(fieldValue(record, "generatedTitle") || firstLineTitle(fieldValue(record, "text")));
    const displayedTitle = normalizedTitle(title ? title.value : "");
    return {
      recordName: state.selectedRecordName,
      title: title ? title.value : "",
      body: String((opts.editorBodyChanged || state.bodyDirty || !selectedNote ? state.editor.getMarkdown() : selectedNote.editorBody) || ""),
      userTitle: displayedTitle === generatedTitle ? null : displayedTitle,
      focused: isTitleFocused ? "title" : (active === body || (body && body.contains(active)) ? "body" : "other"),
      titleSelection: isTitleFocused ? { start: title.selectionStart, end: title.selectionEnd, direction: title.selectionDirection } : null,
      bodySelection: body ? captureEditorSelection(body) : null
    };
  }

  function sameEditorContent(left, right) {
    return Boolean(left && right && left.recordName === right.recordName && left.title === right.title && left.body === right.body);
  }

  function restoreEditorSnapshotSelection(snapshot, fallbackSnapshot) {
    if (!snapshot && !fallbackSnapshot) return;
    const fallback = fallbackSnapshot || {};
    if (snapshot && snapshot.focused === "title") {
      const title = $("note-title");
      title.focus({ preventScroll: true });
      const saved = snapshot.titleSelection || (fallback.focused === "title" ? fallback.titleSelection : null);
      if (saved) {
        const start = Math.max(0, Math.min(title.value.length, Number(saved.start) || 0));
        const end = Math.max(start, Math.min(title.value.length, Number(saved.end) || start));
        title.setSelectionRange(start, end, saved.direction || "none");
      }
    } else if ((!snapshot || snapshot.focused !== "body") && fallback.focused === "title") {
      const title = $("note-title");
      title.focus({ preventScroll: true });
      if (fallback.titleSelection) {
        const start = Math.max(0, Math.min(title.value.length, Number(fallback.titleSelection.start) || 0));
        const end = Math.max(start, Math.min(title.value.length, Number(fallback.titleSelection.end) || start));
        title.setSelectionRange(start, end, fallback.titleSelection.direction || "none");
      }
    } else if ((snapshot && snapshot.focused === "body") || fallback.focused === "body") {
      const body = $("note-body");
      if (body) {
        body.focus({ preventScroll: true });
        const saved = snapshot && snapshot.focused === "body" && snapshot.bodySelection
          ? snapshot.bodySelection
          : fallback.bodySelection;
        if (!restoreEditorSelection(body, saved)) {
          const range = document.createRange();
          range.selectNodeContents(body);
          range.collapse(false);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }
  }

  function fitTitle() {
    const title = $("note-title");
    title.style.height = "auto";
    title.style.height = Math.max(44, title.scrollHeight) + "px";
  }

  function editorBlockForNode(body, node) {
    let element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    while (element && element !== body) {
      if (["P", "DIV", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6"].includes(element.tagName)) return element;
      element = element.parentElement;
    }
    return body;
  }

  function editorCaretContext(body) {
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || !selection.anchorNode || !body.contains(selection.anchorNode)) return null;
    const block = editorBlockForNode(body, selection.anchorNode);
    const before = document.createRange(); before.selectNodeContents(block); before.setEnd(selection.anchorNode, selection.anchorOffset);
    const after = document.createRange(); after.selectNodeContents(block); after.setStart(selection.anchorNode, selection.anchorOffset);
    return { selection: selection, block: block, before: textWithLineBreaks(before.cloneContents()), after: textWithLineBreaks(after.cloneContents()) };
  }

  function tryFormatTypedListMarker(body) {
    const context = editorCaretContext(body);
    if (!context || context.block.tagName === "LI" || context.before.includes("\n") || context.after.replace(/\n+$/g, "").trim()) return false;
    const bullet = context.before.match(/^([ \t]*)([-*+])$/);
    const number = context.before.match(/^([ \t]*)([0-9]+)([.)])$/);
    if (!bullet && !number) return false;
    if (context.block !== body && context.block.parentElement !== body) return false;
    const list = document.createElement(number ? "ol" : "ul");
    if (bullet) { list.dataset.marker = bullet[2]; list.dataset.indent = bullet[1]; }
    if (number) { list.start = Number(number[2]); list.dataset.delimiter = number[3]; list.dataset.indent = number[1]; }
    const item = document.createElement("li"); item.appendChild(document.createElement("br")); list.appendChild(item);
    if (context.block === body) body.replaceChildren(list); else context.block.replaceWith(list);
    const caret = document.createRange(); caret.selectNodeContents(item); caret.collapse(true);
    context.selection.removeAllRanges(); context.selection.addRange(caret);
    scheduleSave();
    return true;
  }

  function updateListItemIndent(item, nextIndent) {
    item.dataset.indent = String(nextIndent || "");
    const level = Math.ceil(item.dataset.indent.length / 2);
    item.dataset.indentLevel = String(level);
    item.style.marginLeft = level ? (level * 1.35) + "em" : "";
    item.style.listStyleType = item.parentElement.tagName === "OL" ? (level === 1 ? "lower-alpha" : level === 2 ? "lower-roman" : "decimal") : (level === 1 ? "circle" : level === 2 ? "square" : "disc");
  }

  function removeOneListIndent(indentation) {
    if (indentation.endsWith("\t")) return indentation.slice(0, -1);
    return indentation.slice(0, Math.max(0, indentation.length - 2));
  }

  function indentListItem(item, direction) {
    const list = item.parentElement;
    const indentation = item.dataset.indent != null ? item.dataset.indent : (list.dataset.indent || "");
    if (direction < 0 && !indentation.length) return false;
    updateListItemIndent(item, direction < 0 ? removeOneListIndent(indentation) : indentation + "  ");
    scheduleSave();
    return true;
  }

  function continueListItemIndent(item) {
    const list = item.parentElement;
    const indentation = item.dataset.indent != null ? item.dataset.indent : (list.dataset.indent || "");
    window.requestAnimationFrame(function () {
      const selection = window.getSelection();
      const anchor = selection && selection.anchorNode;
      const element = anchor && (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement);
      const nextItem = element && element.closest ? element.closest("li") : null;
      if (!nextItem || nextItem === item || nextItem.parentElement !== list || nextItem.previousElementSibling !== item) return;
      if (nextItem.dataset.indent == null || nextItem.dataset.indent === indentation) updateListItemIndent(nextItem, indentation);

      const previousCheckbox = item.querySelector('input[type="checkbox"]');
      const nextCheckbox = nextItem.querySelector('input[type="checkbox"]');
      if (previousCheckbox && nextCheckbox) nextCheckbox.checked = false;
      else if (previousCheckbox) {
        const checkbox = previousCheckbox.cloneNode(false);
        checkbox.checked = false;
        nextItem.insertBefore(checkbox, nextItem.firstChild);
      }
      scheduleSave();
    });
  }

  function exitEmptyListItem(item) {
    const list = item.parentElement;
    const parent = list.parentElement;
    const afterList = list.cloneNode(false);
    while (item.nextElementSibling) afterList.appendChild(item.nextElementSibling);
    item.remove();
    const paragraph = document.createElement("p"); paragraph.appendChild(document.createElement("br"));
    if (list.children.length) parent.insertBefore(paragraph, list.nextSibling);
    else { parent.insertBefore(paragraph, list); list.remove(); }
    if (afterList.children.length) parent.insertBefore(afterList, paragraph.nextSibling);
    const caret = document.createRange(); caret.selectNodeContents(paragraph); caret.collapse(true);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(caret);
  }

  function continueFromEmptyListItem(item) {
    if (indentListItem(item, -1)) return;
    exitEmptyListItem(item);
    scheduleSave();
  }

  function removeSelectedStrikethrough(body, selection) {
    if (!body || !selection || selection.isCollapsed || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    const elementForNode = function (node) { return node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement); };
    const start = elementForNode(range.startContainer);
    const end = elementForNode(range.endContainer);
    const startMark = start && start.closest ? start.closest("s, del, strike") : null;
    const endMark = end && end.closest ? end.closest("s, del, strike") : null;
    if (!startMark || startMark !== endMark || !body.contains(startMark)) return false;

    const fullRange = document.createRange();
    fullRange.selectNodeContents(startMark);
    try {
      if (fullRange.compareBoundaryPoints(Range.START_TO_START, range) < 0 ||
          fullRange.compareBoundaryPoints(Range.END_TO_END, range) > 0) return false;
    } catch (_) { return false; }

    const saved = captureEditorSelection(body);
    const parent = startMark.parentNode;
    if (!saved || !parent) return false;
    const contents = document.createDocumentFragment();
    while (startMark.firstChild) contents.appendChild(startMark.firstChild);
    startMark.replaceWith(contents);
    parent.normalize();
    restoreEditorTextSelection(body, saved);
    return true;
  }

  function applyRichFormat(command) {
    const body = $("note-body");
    const selection = window.getSelection();
    body.focus();
    if (command === "strikeThrough" && removeSelectedStrikethrough(body, selection)) {
      body.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "formatRemove", data: null }));
      return;
    }
    if (command === "checklist") {
      const anchor = selection && selection.anchorNode;
      const element = anchor && (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement);
      const existing = element && element.closest ? element.closest("ul") : null;
      if (existing && existing.dataset.checklist === "true") {
        existing.removeAttribute("data-checklist"); existing.querySelectorAll('input[type="checkbox"]').forEach(function (checkbox) { checkbox.remove(); });
      } else {
        let list = existing;
        if (!list) {
          document.execCommand("insertUnorderedList", false);
          const next = window.getSelection().anchorNode;
          list = next && (next.nodeType === Node.ELEMENT_NODE ? next : next.parentElement).closest("ul");
        }
        if (list) {
          list.dataset.checklist = "true";
          list.querySelectorAll("li").forEach(function (item) {
            if (!item.querySelector('input[type="checkbox"]')) { const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.setAttribute("contenteditable", "false"); checkbox.setAttribute("aria-label", "Checklist item"); item.insertBefore(checkbox, item.firstChild); }
          });
        }
      }
    } else if (command === "code" && selection && selection.rangeCount) {
      const range = selection.getRangeAt(0); const code = document.createElement("code");
      if (range.collapsed) { code.textContent = "code"; range.insertNode(code); range.setStart(code.firstChild, 0); range.setEnd(code.firstChild, 4); }
      else { try { range.surroundContents(code); } catch (_) { document.execCommand("insertHTML", false, "<code>" + escapeHTML(selection.toString()) + "</code>"); } }
      selection.removeAllRanges(); const updated = document.createRange(); updated.selectNodeContents(code); selection.addRange(updated);
    } else document.execCommand(command, false);
    scheduleSave();
  }

  function createEditor(value) {
    cancelAutomaticSpellingContextRequests();
    state.autoCorrectionReturnBoundary = null;
    if (state.editor) { state.editor.destroy(); state.editor = null; }
    const container = $("rich-editor"); container.replaceChildren();
    const body = document.createElement("div");
    body.id = "note-body"; body.className = "note-body"; body.contentEditable = "true";
    body.setAttribute("role", "textbox"); body.setAttribute("aria-label", "Note body"); body.setAttribute("aria-multiline", "true"); body.spellcheck = false;
    body.innerHTML = markdownHTML(value || "");
    const onInput = function (event) {
      const autoCorrection = state.autoCorrectionApplying;
      state.autoCorrectionApplying = false;
      cancelAutomaticSpellingContextRequests();
      if (!state.selectionReviewApplying) closeSelectionReview(false);
      scheduleSave(true, autoCorrection ? { label: "Auto-correct", groupKey: null } : null);
      const returnBoundary = state.autoCorrectionReturnBoundary;
      state.autoCorrectionReturnBoundary = null;
      const trigger = autoCorrection ? null : (autoCorrectionTrigger(body, event) || autoCorrectionReturnTrigger(body, event, returnBoundary));
      scheduleProofreading(body, trigger ? 0 : undefined, trigger);
      if (event.isComposing) window.clearTimeout(state.capitalizationContextTimer);
      else scheduleCapitalizationContextCheck(body);
      renderAboutPanel();
    };
    body.addEventListener("input", onInput);
    body.addEventListener("change", function (event) { if (event.target.matches('input[type="checkbox"]')) scheduleSave(); });
    body.addEventListener("keydown", function (event) {
      const correction = event.target && event.target.closest ? event.target.closest("[data-correction-id]") : null;
      if (correction && body.contains(correction) && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        openCorrectionPopover(correction, true, true);
        return;
      }
      if (event.altKey && event.key === "ArrowDown") {
        const selection = window.getSelection();
        const anchor = selection && selection.anchorNode;
        const element = anchor && (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement);
        const marked = element && element.closest ? element.closest("[data-correction-id]") : null;
        if (marked && body.contains(marked)) {
          event.preventDefault();
          openCorrectionPopover(marked, true, true);
          return;
        }
      }
      state.autoCorrectionReturnBoundary = event.key === "Enter" && !event.isComposing
        ? autoCorrectionBoundaryBeforeReturn(body)
        : null;
      const selection = window.getSelection();
      const anchor = selection && selection.anchorNode;
      const element = anchor && (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement);
      const item = element && element.closest ? element.closest("li") : null;
      if (event.key === "Tab" && item && body.contains(item)) { event.preventDefault(); indentListItem(item, event.shiftKey ? -1 : 1); return; }
      if (event.key === " " && !event.shiftKey && tryFormatTypedListMarker(body)) { event.preventDefault(); return; }
      const emptyListItem = item && body.contains(item) && selection && selection.isCollapsed && !textWithLineBreaks(item).trim();
      if (emptyListItem && ((event.key === "Enter" && !event.shiftKey) || event.key === "Backspace")) {
        event.preventDefault();
        continueFromEmptyListItem(item);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && item && body.contains(item) && selection.isCollapsed) continueListItemIndent(item);
    });
    body.addEventListener("pointerover", onCorrectionPointerOver);
    body.addEventListener("pointerout", onCorrectionPointerOut);
    body.addEventListener("click", onCorrectionClick);
    container.appendChild(body);
    state.editor = {
      getMarkdown: function () { return bodyMarkdown(body); },
      replaceMarkdown: function (markdown) {
        const selection = captureEditorSelection(body);
        const wasFocused = document.activeElement === body || body.contains(document.activeElement);
        const scrollTop = body.scrollTop;
        body.innerHTML = markdownHTML(markdown || "");
        if (wasFocused) body.focus({ preventScroll: true });
        if (selection) restoreEditorTextSelection(body, selection);
        body.scrollTop = scrollTop;
        scheduleProofreading(body, 120);
      },
      destroy: function () {
        body.removeEventListener("input", onInput);
        body.removeEventListener("pointerover", onCorrectionPointerOver);
        body.removeEventListener("pointerout", onCorrectionPointerOut);
        body.removeEventListener("click", onCorrectionClick);
      }
    };
    state.editorHistoryBaseline = captureEditorHistorySnapshot();
    const worker = ensureProofreadingWorker();
    if (worker) worker.postMessage({ type: "warm" });
    scheduleProofreading(body, 450);
  }

  function ensureProofreadingWorker() {
    if (state.proofreadingWorker) return state.proofreadingWorker;
    if (typeof Worker !== "function") return null;
    try {
      const worker = new Worker("./proofreading-worker.js?v=arb-190-instant-launch-20261125-a", { name: "arbor-local-proofreading" });
      worker.addEventListener("message", onProofreadingMessage);
      worker.addEventListener("error", function (event) {
        console.warn("Local writing suggestions could not start.", event.message || "Worker error");
      });
      state.proofreadingWorker = worker;
      return worker;
    } catch (error) {
      console.warn("Local writing suggestions are unavailable.", error);
      return null;
    }
  }

  function cancelAutomaticSpellingContextRequests() {
    state.automaticSpellingRequests.forEach(function (pending) { window.clearTimeout(pending.timeoutId); });
    state.automaticSpellingRequests.clear();
  }

  function proofreadingTextNodes(body) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!node.nodeValue || !node.nodeValue.trim() || (parent && parent.closest("code, pre, script, style, [data-proofreading-ignore]"))) continue;
      nodes.push(node);
    }
    return nodes;
  }

  function captureProofreadingSelection(body) {
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode || !body.contains(selection.anchorNode) || !body.contains(selection.focusNode)) return null;
    return {
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset
    };
  }

  function normalizeProofreadingTextNodes(parent, saved) {
    function normalizedBoundary(children, offset) {
      const end = Math.max(0, Math.min(Number(offset) || 0, children.length));
      let count = 0;
      let previousWasText = false;
      for (let index = 0; index < end; index += 1) {
        const child = children[index];
        if (child.nodeType === Node.TEXT_NODE) {
          if (!previousWasText) count += 1;
          previousWasText = true;
        } else {
          count += 1;
          previousWasText = false;
        }
      }
      return count;
    }

    function mergeChildren(node) {
      const children = Array.from(node.childNodes);
      if (saved && saved.anchorNode === node) saved.anchorOffset = normalizedBoundary(children, saved.anchorOffset);
      if (saved && saved.focusNode === node) saved.focusOffset = normalizedBoundary(children, saved.focusOffset);
      let previousText = null;
      children.forEach(function (child) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (previousText && previousText.parentNode === node) {
            const previousLength = previousText.length;
            if (saved && saved.anchorNode === child) {
              saved.anchorNode = previousText;
              saved.anchorOffset += previousLength;
            }
            if (saved && saved.focusNode === child) {
              saved.focusNode = previousText;
              saved.focusOffset += previousLength;
            }
            previousText.appendData(child.nodeValue || "");
            child.remove();
          } else previousText = child;
        } else {
          previousText = null;
          if (child.nodeType === Node.ELEMENT_NODE) mergeChildren(child);
        }
      });
    }

    mergeChildren(parent);
  }

  function restoreProofreadingSelection(body, saved) {
    if (!saved || !saved.anchorNode || !saved.focusNode || !body.contains(saved.anchorNode) || !body.contains(saved.focusNode)) return;
    function boundOffset(node, offset) {
      const limit = node.nodeType === Node.TEXT_NODE ? node.length : node.childNodes.length;
      return Math.max(0, Math.min(Number(offset) || 0, limit));
    }
    try {
      const selection = window.getSelection();
      selection.removeAllRanges();
      if (typeof selection.setBaseAndExtent === "function") {
        selection.setBaseAndExtent(
          saved.anchorNode, boundOffset(saved.anchorNode, saved.anchorOffset),
          saved.focusNode, boundOffset(saved.focusNode, saved.focusOffset)
        );
      } else {
        const range = document.createRange();
        range.setStart(saved.anchorNode, boundOffset(saved.anchorNode, saved.anchorOffset));
        range.setEnd(saved.focusNode, boundOffset(saved.focusNode, saved.focusOffset));
        selection.addRange(range);
      }
    } catch (_) {}
  }

  function splitProofreadingTextNode(node, offset, saved) {
    const splitOffset = Math.max(0, Math.min(Number(offset) || 0, node.length));
    const remainder = node.splitText(splitOffset);
    if (saved) {
      ["anchor", "focus"].forEach(function (side) {
        const nodeKey = side + "Node";
        const offsetKey = side + "Offset";
        if (saved[nodeKey] === node && saved[offsetKey] > splitOffset) {
          saved[nodeKey] = remainder;
          saved[offsetKey] -= splitOffset;
        }
      });
    }
    return remainder;
  }

  function unwrapProofreadingMarks(body) {
    const saved = captureProofreadingSelection(body);
    body.querySelectorAll("[data-correction-id]").forEach(function (mark) {
      if (saved && (saved.anchorNode === mark || saved.focusNode === mark)) {
        const parent = mark.parentNode;
        const index = Array.prototype.indexOf.call(parent.childNodes, mark);
        if (saved.anchorNode === mark) {
          saved.anchorNode = parent;
          saved.anchorOffset = index + saved.anchorOffset;
        }
        if (saved.focusNode === mark) {
          saved.focusNode = parent;
          saved.focusOffset = index + saved.focusOffset;
        }
      }
      mark.replaceWith.apply(mark, Array.from(mark.childNodes));
    });
    // WebKit can move a collapsed contenteditable caret to the start of the
    // editor when Node.normalize() merges text around removed marks. Merge
    // adjacent nodes ourselves and translate DOM points without flattening
    // offsets across paragraphs or empty list rows.
    normalizeProofreadingTextNodes(body, saved);
    restoreProofreadingSelection(body, saved);
  }

  function ignoredCorrectionKey(text, item) {
    const before = text.slice(Math.max(0, item.start - 18), item.start).replace(/\s+/g, " ");
    const after = text.slice(item.end, item.end + 18).replace(/\s+/g, " ");
    return [item.kind, String(item.word).toLocaleLowerCase(), before, after].join("\u001f");
  }

  function autoCorrectionTrigger(body, event) {
    if (!state.preferences.autoCorrectHighConfidence || !event || event.isComposing || event.inputType !== "insertText" ||
        typeof event.data !== "string" || !/^[\p{White_Space}\p{P}]$/u.test(event.data) || /^['’]$/u.test(event.data)) return null;
    const context = editorCaretContext(body);
    if (!context) return null;
    const match = context.before.match(/([\p{L}]+(?:['’][\p{L}]+)*)([\p{White_Space}\p{P}])$/u);
    if (!match) return null;
    if (/^['’]$/u.test(match[2])) return null;
    const selection = context.selection;
    const wordStart = context.before.length - match[1].length - match[2].length;
    const blockText = textWithLineBreaks(context.block);
    if (blockText.slice(wordStart, wordStart + match[1].length + match[2].length) !== match[1] + match[2]) return null;
    const wordPoint = editorPointAtTextWithBreaks(context.block, wordStart, "forward");
    const wordEndPoint = editorPointAtTextWithBreaks(context.block, wordStart + match[1].length);
    if (!wordPoint || !wordEndPoint || wordPoint.node !== wordEndPoint.node || wordPoint.node.nodeType !== Node.TEXT_NODE
        || wordPoint.node.nodeValue.slice(wordPoint.offset, wordEndPoint.offset) !== match[1]) return null;
    const parent = wordPoint.node.parentElement;
    if (parent && parent.closest("a, code, pre, [data-proofreading-ignore]")) return null;
    return {
      word: match[1],
      before: context.before.slice(0, context.before.length - match[1].length - match[2].length),
      fullBefore: context.before,
      block: context.block,
      wordStart: wordStart,
      delimiter: match[2],
      boundary: "typed",
      boundaryCaretNode: selection.anchorNode,
      boundaryCaretOffset: selection.anchorOffset,
      boundaryCaretBlock: editorBlockForNode(body, selection.anchorNode)
    };
  }

  function autoCorrectionBoundaryBeforeReturn(body) {
    if (!state.preferences.autoCorrectHighConfidence) return null;
    const context = editorCaretContext(body);
    if (!context || context.before.includes("\n")) return null;
    const match = context.before.match(/([\p{L}]+(?:['’][\p{L}]+)*)$/u);
    if (!match) return null;
    const wordStart = context.before.length - match[1].length;
    const wordPoint = editorPointAtTextWithBreaks(context.block, wordStart, "forward");
    const wordEndPoint = editorPointAtTextWithBreaks(context.block, wordStart + match[1].length);
    if (!wordPoint || !wordEndPoint || wordPoint.node !== wordEndPoint.node || wordPoint.node.nodeType !== Node.TEXT_NODE
        || wordPoint.node.nodeValue.slice(wordPoint.offset, wordEndPoint.offset) !== match[1]) return null;
    const parent = wordPoint.node.parentElement;
    if (parent && parent.closest("a, code, pre, [data-proofreading-ignore]")) return null;
    return {
      word: match[1],
      before: context.before.slice(0, context.before.length - match[1].length),
      fullBefore: context.before,
      block: context.block,
      wordStart: wordStart,
      delimiter: "",
      boundary: "return"
    };
  }

  function autoCorrectionReturnTrigger(body, event, boundary) {
    if (!boundary || boundary.boundary !== "return" || !event || event.isComposing
        || (event.inputType !== "insertParagraph" && event.inputType !== "insertLineBreak" && event.data !== "\n")) return null;
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || !selection.anchorNode || !body.contains(selection.anchorNode)) return null;
    return Object.assign({}, boundary, {
      returnCaretNode: selection.anchorNode,
      returnCaretOffset: selection.anchorOffset,
      returnCaretBlock: editorBlockForNode(body, selection.anchorNode)
    });
  }

  function editorPointAtTextWithBreaks(root, requestedOffset, bias) {
    let remaining = Math.max(0, Number(requestedOffset) || 0);
    function find(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (remaining < node.length || (remaining === node.length && bias !== "forward")) return { node: node, offset: remaining };
        remaining -= node.length;
        return null;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      if (node.tagName === "BR") {
        if (remaining === 0 && bias !== "forward") return { node: node.parentNode, offset: Array.prototype.indexOf.call(node.parentNode.childNodes, node) };
        remaining = Math.max(0, remaining - 1);
        return null;
      }
      for (const child of Array.from(node.childNodes)) {
        const point = find(child);
        if (point) return point;
      }
      return null;
    }
    return find(root) || editorPointAtTextOffset(root, requestedOffset);
  }

  function resolveAutoCorrectionTarget(body, trigger) {
    if (!trigger) return null;
    const selection = window.getSelection();
    let node;
    let start;
    let end;
    let caret;
    if (trigger.boundary === "return") {
      if (!trigger.block || !body.contains(trigger.block) || !trigger.returnCaretNode || !body.contains(trigger.returnCaretNode)
          || !selection || !selection.isCollapsed || selection.anchorNode !== trigger.returnCaretNode
          || selection.anchorOffset !== trigger.returnCaretOffset
          || editorBlockForNode(body, selection.anchorNode) !== trigger.returnCaretBlock) return null;
      const blockText = textWithLineBreaks(trigger.block);
      if (blockText.slice(trigger.wordStart, trigger.wordStart + trigger.word.length) !== trigger.word) return null;
      const beginning = editorPointAtTextWithBreaks(trigger.block, trigger.wordStart, "forward");
      const ending = editorPointAtTextWithBreaks(trigger.block, trigger.wordStart + trigger.word.length);
      if (!beginning || !ending || beginning.node !== ending.node || beginning.node.nodeType !== Node.TEXT_NODE
          || beginning.node.nodeValue.slice(beginning.offset, ending.offset) !== trigger.word) return null;
      node = beginning.node;
      start = beginning.offset;
      end = ending.offset;
      caret = end;
    } else {
      const context = editorCaretContext(body);
      if (!context || context.block !== trigger.block || context.before !== trigger.fullBefore) return null;
      const blockText = textWithLineBreaks(trigger.block);
      if (blockText.slice(trigger.wordStart, trigger.wordStart + trigger.word.length) !== trigger.word
          || blockText.slice(trigger.wordStart + trigger.word.length, trigger.wordStart + trigger.word.length + trigger.delimiter.length) !== trigger.delimiter) return null;
      const beginning = editorPointAtTextWithBreaks(trigger.block, trigger.wordStart, "forward");
      const ending = editorPointAtTextWithBreaks(trigger.block, trigger.wordStart + trigger.word.length);
      if (!beginning || !ending || beginning.node !== ending.node || beginning.node.nodeType !== Node.TEXT_NODE
          || beginning.node.nodeValue.slice(beginning.offset, ending.offset) !== trigger.word) return null;
      node = beginning.node;
      start = beginning.offset;
      end = ending.offset;
      caret = context.selection.anchorOffset;
    }
    return {
      node: node,
      start: start,
      end: end,
      caret: caret,
      word: trigger.word,
      boundary: trigger.boundary,
      block: trigger.block,
      boundaryFullBefore: trigger.fullBefore,
      boundaryCaretNode: trigger.boundaryCaretNode,
      boundaryCaretOffset: trigger.boundaryCaretOffset,
      boundaryCaretBlock: trigger.boundaryCaretBlock,
      returnCaretNode: trigger.returnCaretNode,
      returnCaretOffset: trigger.returnCaretOffset,
      returnCaretBlock: trigger.returnCaretBlock
    };
  }

  const CORRECTION_HIGHLIGHT_DURATION_MS = 3000;
  const CORRECTION_HIGHLIGHT_FADE_MS = 250;
  const automaticCorrectionHighlights = new WeakMap();

  function createCorrectionHighlight(replacement, reversibleCorrection) {
    const wrapper = document.createElement("span");
    wrapper.className = reversibleCorrection
      ? "correction-applied-highlight is-reversible" : "correction-applied-highlight";
    wrapper.setAttribute("data-proofreading-ignore", "");
    wrapper.textContent = String(replacement == null ? "" : replacement);
    if (reversibleCorrection) automaticCorrectionHighlights.set(wrapper, {
      original: String(reversibleCorrection.original || ""),
      replacement: String(replacement == null ? "" : replacement),
      recordName: reversibleCorrection.recordName,
      clearTimer: null,
      removeTimer: null
    });
    return wrapper;
  }

  function correctionClickTextOffset(wrapper, event) {
    const text = wrapper && wrapper.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) return 0;
    let point = null;
    if (typeof document.caretPositionFromPoint === "function") {
      const position = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (position && wrapper.contains(position.offsetNode)) point = { node: position.offsetNode, offset: position.offset };
    } else if (typeof document.caretRangeFromPoint === "function") {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range && wrapper.contains(range.startContainer)) point = { node: range.startContainer, offset: range.startOffset };
    }
    if (!point) return 0;
    if (point.node === text) return Math.max(0, Math.min(point.offset, text.length));
    return point.node === wrapper && point.offset > 0 ? text.length : 0;
  }

  function correctionSelectionAtBlockOffset(block, offset) {
    const point = editorPointAtTextOffset(block, offset);
    const selection = window.getSelection();
    if (!point || !selection) return false;
    try {
      const range = document.createRange();
      range.setStart(point.node, point.offset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch (_) { return false; }
  }

  function revertAutomaticCorrection(body, wrapper, event) {
    const correction = automaticCorrectionHighlights.get(wrapper);
    if (!correction || !wrapper.isConnected || correction.recordName !== state.selectedRecordName ||
        wrapper.textContent !== correction.replacement) return false;
    const block = editorBlockForNode(body, wrapper);
    if (!block) return false;
    const prefixOffset = editorTextOffset(block, wrapper, 0);
    if (prefixOffset == null) return false;
    const clickedOffset = correctionClickTextOffset(wrapper, event);
    window.clearTimeout(correction.clearTimer);
    window.clearTimeout(correction.removeTimer);
    automaticCorrectionHighlights.delete(wrapper);
    wrapper.replaceWith(document.createTextNode(correction.original));
    block.normalize();
    body.focus({ preventScroll: true });
    correctionSelectionAtBlockOffset(block, prefixOffset + Math.min(clickedOffset, correction.original.length));
    announceStatus("Restored “" + correction.replacement + "” to “" + correction.original + "”.");
    body.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: correction.original
    }));
    return true;
  }

  function finishCorrectionHighlight(body, wrapper, options) {
    if (!wrapper || !wrapper.isConnected) return;
    const opts = options || {};
    const correction = automaticCorrectionHighlights.get(wrapper);
    const beginFade = function () {
      if (!wrapper.isConnected) return;
      wrapper.classList.add("is-clearing");
      const removeHighlight = function () {
        if (!wrapper.isConnected) return;
        const saved = captureCorrectionSelection(body);
        const parent = wrapper.parentNode;
        const proofreadingContext = opts.proofreadingContextWrapper;
        if (proofreadingContext && proofreadingContext.isConnected) {
          proofreadingContext.replaceWith.apply(proofreadingContext, Array.from(proofreadingContext.childNodes));
        }
        wrapper.replaceWith.apply(wrapper, Array.from(wrapper.childNodes));
        if (parent) parent.normalize();
        if (saved) restoreCorrectionSelection(body, saved);
        automaticCorrectionHighlights.delete(wrapper);
        if (opts.recheckProofreading) scheduleProofreading(body, 0);
      };
      const removeTimer = window.setTimeout(removeHighlight, CORRECTION_HIGHLIGHT_FADE_MS);
      if (correction) correction.removeTimer = removeTimer;
    };
    const clearTimer = window.setTimeout(beginFade, CORRECTION_HIGHLIGHT_DURATION_MS);
    if (correction) correction.clearTimer = clearTimer;
  }

  function applyAutomaticCorrection(body, target, correction) {
    if (!state.preferences.autoCorrectHighConfidence || !target || !correction || correction.original !== target.word || !correction.replacement || correction.replacement === target.word ||
        proofreadingDictionary.hasDictionaryEntry(dictionaryTerms(), target.word)) return false;
    const node = target.node;
    const selection = window.getSelection();
    const currentContext = target.boundary === "typed" ? editorCaretContext(body) : null;
    const caretMatches = target.boundary === "return"
      ? selection && selection.isCollapsed && selection.anchorNode === target.returnCaretNode
        && selection.anchorOffset === target.returnCaretOffset && editorBlockForNode(body, selection.anchorNode) === target.returnCaretBlock
      : selection && selection.isCollapsed && currentContext && currentContext.block === target.block
        && currentContext.before === target.boundaryFullBefore;
    if (!node || !node.isConnected || !body.contains(node) || !caretMatches || node.nodeValue.slice(target.start, target.end) !== target.word) return false;
    const savedSelection = captureProofreadingSelection(body);
    const savedTextSelection = target.boundary === "typed" && savedSelection
      && (savedSelection.anchorNode === node || savedSelection.focusNode === node) ? captureEditorSelection(body) : null;
    const targetTextStart = target.boundary === "typed" ? editorTextOffset(body, node, target.start) : -1;
    const replacement = String(correction.replacement);
    const prefix = node.nodeValue.slice(0, target.start);
    const suffix = node.nodeValue.slice(target.end);
    const highlight = createCorrectionHighlight(replacement, {
      original: target.word,
      recordName: state.selectedRecordName
    });
    const fragment = document.createDocumentFragment();
    if (prefix) fragment.appendChild(document.createTextNode(prefix));
    fragment.appendChild(highlight);
    let suffixNode = null;
    if (suffix) { suffixNode = document.createTextNode(suffix); fragment.appendChild(suffixNode); }
    node.replaceWith(fragment);
    if (target.boundary === "return" && savedSelection) {
      restoreProofreadingSelection(body, savedSelection);
    } else if (savedTextSelection) {
      const delta = replacement.length - target.word.length;
      const adjusted = Object.assign({}, savedTextSelection, {
        anchorTextOffset: savedTextSelection.anchorTextOffset >= targetTextStart + target.word.length
          ? savedTextSelection.anchorTextOffset + delta : savedTextSelection.anchorTextOffset,
        focusTextOffset: savedTextSelection.focusTextOffset >= targetTextStart + target.word.length
          ? savedTextSelection.focusTextOffset + delta : savedTextSelection.focusTextOffset
      });
      restoreEditorTextSelection(body, adjusted);
    } else if (savedSelection) {
      restoreProofreadingSelection(body, savedSelection);
    } else {
      const range = document.createRange();
      if (suffixNode) range.setStart(suffixNode, Math.min(target.caret - target.end, suffixNode.length));
      else range.selectNodeContents(highlight);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    finishCorrectionHighlight(body, highlight);
    state.autoCorrectionApplying = true;
    announceStatus("Auto-corrected " + target.word + " to " + replacement + ". Undo is available.");
    body.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: replacement
    }));
    return true;
  }

  function scheduleProofreading(body, delay, autoCorrection) {
    if (!body || !state.selectedRecordName || body !== $("note-body")) return;
    window.clearTimeout(state.proofreadingTimer);
    const requestId = ++state.proofreadingRequestId;
    const recordName = state.selectedRecordName;
    const wait = delay == null ? 650 : delay;
    state.proofreadingTimer = window.setTimeout(function () {
      if (requestId !== state.proofreadingRequestId || state.selectedRecordName !== recordName || body !== $("note-body")) return;
      const worker = ensureProofreadingWorker();
      if (!worker) return;
      unwrapProofreadingMarks(body);
      // Text-offset restoration loses the caret at empty <br>-backed rows (for
      // example, immediately after Return in a list). Let the live DOM Range
      // track the unwrap/normalize mutation instead.
      const nodes = proofreadingTextNodes(body);
      const blocks = nodes.map(function (node) { return node.nodeValue || ""; });
      const autoCorrectionTarget = autoCorrection ? resolveAutoCorrectionTarget(body, autoCorrection) : null;
      state.proofreadingPending = {
        requestId: requestId,
        recordName: recordName,
        body: body,
        nodes: nodes,
        blocks: blocks,
        autoCorrectionTarget: autoCorrectionTarget,
        autoCorrectionTrigger: autoCorrectionTarget ? autoCorrection : null
      };
      worker.postMessage({
        type: "check",
        requestId: requestId,
        recordName: recordName,
        blocks: blocks,
        checkGrammarSuggestions: state.preferences.checkGrammarSuggestions,
        checkSentenceCapitalization: state.preferences.checkSentenceCapitalization,
        autocorrect: autoCorrectionTarget ? { word: autoCorrectionTarget.word, before: autoCorrection.before } : null,
        personalWords: autoCorrectionTarget ? dictionaryTerms() : []
      });
    }, wait);
  }

  function requestAutomaticSpellingContextCorrection(body, recordName, trigger, issue) {
    if (!state.preferences.autoCorrectHighConfidence || !trigger || !issue || !Array.isArray(issue.options) || issue.options.length < 2
        || !trigger.block || !body.contains(trigger.block) || !resolveAutoCorrectionTarget(body, trigger)) return;
    const paragraph = textWithLineBreaks(trigger.block);
    const selectionStart = trigger.wordStart;
    const selectionEnd = selectionStart + trigger.word.length;
    if (!paragraph || paragraph.length > 5000 || paragraph.slice(selectionStart, selectionEnd) !== trigger.word) return;
    const worker = ensureSelectionReviewWorker();
    if (!worker) return;
    const requestId = ++state.spellingContextRankRequestId;
    const pending = {
      requestId: requestId,
      recordName: recordName,
      body: body,
      trigger: trigger,
      word: trigger.word,
      paragraph: paragraph,
      selectionStart: selectionStart,
      selectionEnd: selectionEnd,
      options: issue.options.slice()
    };
    pending.timeoutId = window.setTimeout(function () {
      if (state.automaticSpellingRequests.get(requestId) === pending) state.automaticSpellingRequests.delete(requestId);
    }, AUTO_CORRECTION_CONTEXT_TIMEOUT_MS);
    state.automaticSpellingRequests.set(requestId, pending);
    try {
      worker.postMessage({
        type: "spelling-context-rank",
        requestId: requestId,
        payload: { paragraph: paragraph, selectionStart: selectionStart, selectionEnd: selectionEnd }
      });
    } catch (_) {
      window.clearTimeout(pending.timeoutId);
      state.automaticSpellingRequests.delete(requestId);
    }
  }

  function onAutomaticSpellingContextMessage(event) {
    const message = event.data || {};
    if (message.type === "spelling-context-rank-progress") return;
    if (message.type !== "spelling-context-rank-result") return;
    const pending = state.automaticSpellingRequests.get(message.requestId);
    if (!pending) return;
    state.automaticSpellingRequests.delete(message.requestId);
    window.clearTimeout(pending.timeoutId);
    if (pending.recordName !== state.selectedRecordName || pending.body !== $("note-body")
        || document.activeElement !== pending.body || !pending.body.contains(pending.trigger.block)
        || textWithLineBreaks(pending.trigger.block) !== pending.paragraph) return;
    const correction = window.ArborAutocorrect && window.ArborAutocorrect.contextCandidateCorrection(
      pending.word,
      pending.options,
      message.result,
      pending.selectionStart,
      pending.selectionEnd,
      dictionaryTerms()
    );
    const currentTarget = resolveAutoCorrectionTarget(pending.body, pending.trigger);
    if (!correction || !currentTarget) return;
    unwrapProofreadingMarks(pending.body);
    const target = resolveAutoCorrectionTarget(pending.body, pending.trigger);
    if (!target || !applyAutomaticCorrection(pending.body, target, correction)) scheduleProofreading(pending.body, 0);
  }

  function autoCorrectionIssueForTarget(pending, results) {
    const target = pending && pending.autoCorrectionTarget;
    if (!target) return null;
    const nodeIndex = pending.nodes.indexOf(target.node);
    if (nodeIndex < 0) return null;
    const issues = Array.isArray(results && results[nodeIndex]) ? results[nodeIndex] : [];
    return issues.find(function (item) {
      return item && item.kind === "spelling" && item.word === target.word
        && item.start === target.start && item.end === target.end
        && Array.isArray(item.options) && item.options.length > 1;
    }) || null;
  }

  function proofreadingBlockForNode(node, body) {
    const parent = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const block = parent && parent.closest ? parent.closest("p, li, blockquote, h1, h2, h3, h4, h5, h6") : null;
    return block && body.contains(block) ? block : body;
  }

  function proofreadingBlockText(block, nodes, body) {
    return nodes.filter(function (node) { return proofreadingBlockForNode(node, body) === block; })
      .map(function (node) { return node.nodeValue || ""; }).join("");
  }

  function proofreadingBlockPath(block, body) {
    const path = [];
    let current = block;
    while (current && current !== body) {
      const parent = current.parentElement;
      if (!parent) return null;
      path.unshift(Array.prototype.indexOf.call(parent.children, current));
      current = parent;
    }
    return current === body ? path : null;
  }

  function proofreadingElementAtPath(body, path) {
    let current = body;
    for (const index of path || []) {
      current = current && current.children ? current.children[index] : null;
      if (!current) return null;
    }
    return current;
  }

  function proofreadingBlockPosition(block, offset, nodes, body) {
    let blockOffset = 0;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (proofreadingBlockForNode(node, body) !== block) continue;
      if (offset >= blockOffset && offset < blockOffset + node.length) {
        return { node: node, nodeIndex: index, offset: offset - blockOffset };
      }
      blockOffset += node.length;
    }
    return null;
  }

  function proofreadingBlockOffset(block, targetNode, targetOffset, nodes, body) {
    let offset = 0;
    for (const node of nodes) {
      if (proofreadingBlockForNode(node, body) !== block) continue;
      if (node === targetNode) return offset + Math.max(0, Math.min(targetOffset, node.length));
      offset += node.length;
    }
    return null;
  }

  function sentenceRangeAt(text, requestedOffset) {
    if (!text) return null;
    const offset = Math.max(0, Math.min(requestedOffset, text.length));
    let segment = null;
    if (typeof Intl.Segmenter === "function") {
      const segments = Array.from(new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text));
      segment = segments.find(function (item) { return offset >= item.index && offset < item.index + item.segment.length; })
        || segments.find(function (item) { return offset === item.index + item.segment.length; })
        || null;
    }
    if (segment) {
      let start = segment.index;
      let end = start + segment.segment.length;
      while (start < end && /\s/u.test(text[start])) start += 1;
      while (end > start && /\s/u.test(text[end - 1])) end -= 1;
      return end > start ? { start: start, end: end, text: text.slice(start, end) } : null;
    }

    let start = 0;
    const previous = /[.!?](?:["'’”)]*)\s+/gu;
    let match;
    while ((match = previous.exec(text.slice(0, offset)))) start = match.index + match[0].length;
    const after = /[.!?](?:["'’”)]*)(?:\s+|$)/u.exec(text.slice(offset));
    let end = after ? offset + after.index + after[0].length : text.length;
    while (start < end && /\s/u.test(text[start])) start += 1;
    while (end > start && /\s/u.test(text[end - 1])) end -= 1;
    return end > start ? { start: start, end: end, text: text.slice(start, end) } : null;
  }

  function capitalizationContextAtCaret(body) {
    if (!body || body !== $("note-body") || !state.selectedRecordName || !state.preferences.checkSentenceCapitalization) return null;
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || !selection.anchorNode || !body.contains(selection.anchorNode)) return null;
    const anchorNode = selection.anchorNode;
    const anchorElement = anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement;
    if (!anchorElement || anchorElement.closest("a, code, pre, [data-proofreading-ignore]")) return null;
    const nodes = proofreadingTextNodes(body);
    if (anchorNode.nodeType !== Node.TEXT_NODE || !nodes.includes(anchorNode)) return null;
    const block = proofreadingBlockForNode(anchorNode, body);
    const blockText = proofreadingBlockText(block, nodes, body);
    const caretOffset = proofreadingBlockOffset(block, anchorNode, selection.anchorOffset, nodes, body);
    if (caretOffset === null) return null;
    const sentence = sentenceRangeAt(blockText, caretOffset);
    if (!sentence || sentence.text.length > 500) return null;
    const blockPath = proofreadingBlockPath(block, body);
    if (!blockPath) return null;
    return {
      recordName: state.selectedRecordName,
      body: body,
      blockPath: blockPath,
      blockText: blockText,
      sentenceStart: sentence.start,
      sentence: sentence.text,
      contextBefore: blockText.slice(Math.max(0, sentence.start - 240), sentence.start),
      contextAfter: blockText.slice(sentence.end, sentence.end + 240)
    };
  }

  function scheduleCapitalizationContextCheck(body, delay) {
    window.clearTimeout(state.capitalizationContextTimer);
    if (!state.preferences.checkSentenceCapitalization) return;
    const wait = delay === undefined ? 1100 : delay;
    state.capitalizationContextTimer = window.setTimeout(function () {
      if (!state.preferences.checkSentenceCapitalization || body !== $("note-body") || !state.selectedRecordName) return;
      const context = capitalizationContextAtCaret(body);
      if (!context) return;
      const key = [context.recordName, context.blockPath.join("."), context.blockText, context.sentenceStart, context.sentence].join("\u001f");
      if (key === state.capitalizationContextLastKey) return;
      if (state.capitalizationContextPending) {
        state.capitalizationContextRerun = true;
        return;
      }
      const worker = ensureSelectionReviewWorker();
      if (!worker) return;
      const requestId = ++state.capitalizationContextRequestId;
      const pending = Object.assign({}, context, { requestId: requestId, key: key });
      state.capitalizationContextPending = pending;
      state.capitalizationContextRerun = false;
      state.capitalizationContextTimeout = window.setTimeout(function () {
        if (state.capitalizationContextPending !== pending) return;
        state.capitalizationContextPending = null;
        state.capitalizationContextRerun = false;
      }, 45000);
      try {
        worker.postMessage({
          type: "capitalization-scan",
          requestId: requestId,
          payload: { paragraph: context.sentence, contextBefore: context.contextBefore, contextAfter: context.contextAfter }
        });
      } catch (_) {
        window.clearTimeout(state.capitalizationContextTimeout);
        state.capitalizationContextPending = null;
      }
    }, wait);
  }

  function onCapitalizationContextMessage(event) {
    const message = event.data || {};
    const pending = state.capitalizationContextPending;
    if (!pending || pending.requestId !== message.requestId) return;
    if (message.type === "capitalization-scan-progress") return;
    if (message.type !== "capitalization-scan-result") return;
    window.clearTimeout(state.capitalizationContextTimeout);
    state.capitalizationContextPending = null;

    const body = $("note-body");
    if (state.selectedRecordName === pending.recordName && body === pending.body &&
        state.preferences.checkSentenceCapitalization && body.isConnected) {
      const currentNodes = proofreadingTextNodes(body);
      const currentBlock = proofreadingElementAtPath(body, pending.blockPath);
      const sameCaretBlock = currentBlock && proofreadingBlockText(currentBlock, currentNodes, body) === pending.blockText;
      if (sameCaretBlock) {
        const result = message.result || {};
        const suggestions = result.status === "suggestions" && Array.isArray(result.suggestions) ? result.suggestions
          : result.status === "suggestion" ? [result] : [];
        const changes = [];
        suggestions.forEach(function (suggestion) {
          if (!suggestion || suggestion.status !== "suggestion" || typeof suggestion.original !== "string" || typeof suggestion.replacement !== "string") return;
          window.ArborProofreading.initialCapitalizationChanges(suggestion.original, suggestion.replacement, pending.sentenceStart)
            .forEach(function (change) {
              if (change.start <= pending.sentenceStart || change.original.toLocaleLowerCase() === "i") return;
              changes.push(change);
            });
        });
        changes.forEach(function (change) {
          const cacheKey = [pending.recordName, pending.blockPath.join("."), pending.blockText].join("\u001f");
          const cached = state.capitalizationContextCache.get(cacheKey) || {
            recordName: pending.recordName,
            blockPath: pending.blockPath,
            blockText: pending.blockText,
            items: []
          };
          const item = {
            blockOffset: change.start,
            word: change.original,
            replacement: change.replacement
          };
          if (!cached.items.some(function (existing) { return existing.blockOffset === item.blockOffset && existing.word === item.word; })) {
            cached.items.push(item);
          }
          state.capitalizationContextCache.set(cacheKey, cached);
        });
        state.capitalizationContextLastKey = pending.key;
        if (changes.length) scheduleProofreading(body, 0);
      }
    }

    const rerun = state.capitalizationContextRerun;
    state.capitalizationContextRerun = false;
    if (rerun && body && body === $("note-body")) scheduleCapitalizationContextCheck(body, 0);
  }

  function onProofreadingMessage(event) {
    const result = event.data || {};
    const pending = state.proofreadingPending;
    if (!pending || pending.requestId !== result.requestId || pending.recordName !== result.recordName || result.requestId !== state.proofreadingRequestId) return;
    if (result.type === "error") {
      state.proofreadingPending = null;
      console.warn("Local writing suggestions could not load.", result.message || "Dictionary load failed");
      return;
    }
    if (result.type !== "result" || !Array.isArray(result.results) || state.selectedRecordName !== pending.recordName || $("note-body") !== pending.body) return;
    const nodes = proofreadingTextNodes(pending.body);
    if (nodes.length !== pending.blocks.length || nodes.some(function (node, index) { return node.nodeValue !== pending.blocks[index]; })) {
      scheduleProofreading(pending.body, 0);
      return;
    }
    if (pending.autoCorrectionTarget && result.autocorrection) {
      state.proofreadingPending = null;
      if (applyAutomaticCorrection(pending.body, pending.autoCorrectionTarget, result.autocorrection)) return;
      state.proofreadingPending = pending;
    }
    if (pending.autoCorrectionTarget && pending.autoCorrectionTrigger && !result.autocorrection) {
      const spellingIssue = autoCorrectionIssueForTarget(pending, result.results);
      if (spellingIssue) requestAutomaticSpellingContextCorrection(pending.body, pending.recordName, pending.autoCorrectionTrigger, spellingIssue);
    }
    state.proofreadingPending = null;
    const savedSelection = captureProofreadingSelection(pending.body);
    closeCorrectionPopover(false);
    const ignored = state.proofreadingIgnored.get(pending.recordName) || new Set();
    state.proofreadingIgnored.set(pending.recordName, ignored);
    state.proofreadingCorrections = new Map();
    const entries = [];
    (result.results || []).forEach(function (items, nodeIndex) {
      const source = pending.blocks[nodeIndex] || "";
      (items || []).forEach(function (item) {
        const key = ignoredCorrectionKey(source, item);
        if (item.kind === "spelling" && proofreadingDictionary.hasDictionaryEntry(dictionaryTerms(), item.word)) return;
        if (!ignored.has(key)) entries.push({ nodeIndex: nodeIndex, source: source, item: item, key: key });
      });
    });
    Array.from(state.capitalizationContextCache.entries()).forEach(function (pair) {
      const cacheKey = pair[0];
      const cached = pair[1];
      if (cached.recordName !== pending.recordName || !state.preferences.checkSentenceCapitalization) return;
      const block = proofreadingElementAtPath(pending.body, cached.blockPath);
      if (!block || proofreadingBlockText(block, nodes, pending.body) !== cached.blockText) {
        state.capitalizationContextCache.delete(cacheKey);
        return;
      }
      cached.items.forEach(function (suggestion) {
        const position = proofreadingBlockPosition(block, suggestion.blockOffset, nodes, pending.body);
        if (!position || position.node.nodeValue.slice(position.offset, position.offset + suggestion.word.length) !== suggestion.word) return;
        const item = {
          start: position.offset,
          end: position.offset + 1,
          kind: "capitalization",
          word: suggestion.word,
          message: "Capitalization suggestion",
          options: [{ label: "Click to capitalize", replacement: suggestion.replacement[0] }]
        };
        const overlaps = entries.some(function (entry) {
          return entry.nodeIndex === position.nodeIndex && entry.item.start < item.end && entry.item.end > item.start;
        });
        if (overlaps) return;
        const key = ignoredCorrectionKey(position.node.nodeValue, item);
        if (!ignored.has(key)) entries.push({ nodeIndex: position.nodeIndex, source: position.node.nodeValue, item: item, key: key });
      });
    });
    entries.sort(function (left, right) { return left.nodeIndex - right.nodeIndex || right.item.start - left.item.start; });
    entries.forEach(function (entry, index) {
      const node = nodes[entry.nodeIndex];
      if (!node || !node.parentNode || entry.item.start < 0 || entry.item.end > node.length || entry.item.start >= entry.item.end) return;
      splitProofreadingTextNode(node, entry.item.end, savedSelection);
      const matchNode = splitProofreadingTextNode(node, entry.item.start, savedSelection);
      const mark = document.createElement("span");
      const id = "correction-" + result.requestId + "-" + index;
      mark.className = "correction-mark";
      mark.dataset.correctionId = id;
      mark.dataset.correctionKind = entry.item.kind;
      mark.setAttribute("role", "button");
      mark.setAttribute("tabindex", "0");
      mark.setAttribute("aria-haspopup", "listbox");
      mark.setAttribute("aria-expanded", "false");
      const modifier = /Mac|iPhone|iPad|iPod/i.test((navigator.platform || "") + " " + (navigator.userAgent || "")) ? "Option" : "Alt";
      const suggestionLabel = entry.item.kind === "spelling" ? "Spelling suggestion" : entry.item.message;
      mark.setAttribute("aria-label", suggestionLabel + ": " + entry.item.word + ". Press " + modifier + " and Down Arrow, Enter, or Space for suggestions.");
      matchNode.replaceWith(mark);
      mark.appendChild(matchNode);
      state.proofreadingCorrections.set(id, {
        id: id, marker: mark, recordName: pending.recordName, kind: entry.item.kind,
        word: entry.item.word, message: entry.item.message, options: entry.item.options || [], occurrenceKey: entry.key
      });
    });
    // splitText() and wrapping preserve the browser's live selection range.
    // Reconstructing it from a flattened text offset moves carets across empty
    // list items and paragraphs to the preceding block.
    restoreProofreadingSelection(pending.body, savedSelection);
  }

  function correctionMarkFromEvent(event) {
    const target = event.target && event.target.closest ? event.target.closest("[data-correction-id]") : null;
    return target && $("note-body") && $("note-body").contains(target) ? target : null;
  }

  function capitalizationCorrectionFromEvent(body, event) {
    let point = null;
    if (typeof document.caretPositionFromPoint === "function") {
      const position = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (position) point = { node: position.offsetNode, offset: position.offset };
    } else if (typeof document.caretRangeFromPoint === "function") {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range) point = { node: range.startContainer, offset: range.startOffset };
    }
    if ((!point || !body.contains(point.node)) && window.getSelection) {
      const selection = window.getSelection();
      if (selection && selection.anchorNode && body.contains(selection.anchorNode)) {
        point = { node: selection.anchorNode, offset: selection.anchorOffset };
      }
    }
    if (!point || !body.contains(point.node)) return null;

    for (const entry of (state.proofreadingCorrections || new Map()).values()) {
      if (entry.kind !== "capitalization" || !entry.marker || !entry.marker.isConnected) continue;
      if (entry.marker.contains(point.node)) return entry;
      const remainder = entry.marker.nextSibling;
      const wordRemainder = entry.word.slice(1);
      if (wordRemainder && remainder && remainder.nodeType === Node.TEXT_NODE && point.node === remainder &&
          remainder.nodeValue.slice(0, wordRemainder.length) === wordRemainder && point.offset <= wordRemainder.length) return entry;
    }
    return null;
  }

  function onCorrectionPointerOver(event) {
    if (event.pointerType !== "mouse") return;
    const mark = correctionMarkFromEvent(event);
    if (mark) openCorrectionPopover(mark, false);
  }

  function onCorrectionPointerOut(event) {
    if (event.pointerType === "touch") return;
    const mark = correctionMarkFromEvent(event);
    if (!mark || (event.relatedTarget && (mark.contains(event.relatedTarget) || $("correction-popover").contains(event.relatedTarget)))) return;
    scheduleCorrectionPopoverClose(false);
  }

  function onCorrectionClick(event) {
    const body = $("note-body");
    const appliedHighlight = event.target && event.target.closest
      ? event.target.closest(".correction-applied-highlight") : null;
    if (body && appliedHighlight && body.contains(appliedHighlight) && event.detail > 0 &&
        revertAutomaticCorrection(body, appliedHighlight, event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const mark = correctionMarkFromEvent(event);
    let entry = mark && state.proofreadingCorrections && state.proofreadingCorrections.get(mark.dataset.correctionId);
    const pointerType = event.pointerType || state.proofreadingLastPointerType;
    if (!entry && body && event.detail > 0) entry = capitalizationCorrectionFromEvent(body, event);
    if (entry && entry.kind === "capitalization" && event.detail > 0 && pointerType === "mouse") {
      event.preventDefault();
      applyCorrectionOption(0, entry);
      return;
    }
    if (entry && entry.kind === "capitalization" && event.detail > 0 && pointerType === "touch") {
      event.preventDefault();
      openCorrectionPopover(entry.marker, false, true);
      return;
    }
    if (mark) openCorrectionPopover(mark, false, true);
  }

  function scheduleCorrectionPopoverClose(restoreFocus) {
    window.clearTimeout(state.proofreadingCloseTimer);
    state.proofreadingCloseTimer = window.setTimeout(function () {
      const popover = $("correction-popover");
      if (popover && popover.contains(document.activeElement)) return;
      closeCorrectionPopover(restoreFocus);
    }, 140);
  }

  function correctionOptionKey(option) {
    if (!option) return "";
    return String(option.action || "") + "\u001f" + String(option.replacement == null ? option.label : option.replacement);
  }

  function renderCorrectionOptions(entry, selection) {
    const options = $("correction-options");
    const selectedKey = selection && selection.selectedKey;
    const focusedKey = selection && selection.focusedKey;
    const selectedIndex = selectedKey ? entry.options.findIndex(function (option) { return correctionOptionKey(option) === selectedKey; }) : -1;
    options.replaceChildren();
    entry.options.forEach(function (option, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "correction-option";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(selectedIndex < 0 ? index === 0 : index === selectedIndex));
      button.setAttribute("aria-label", entry.kind === "capitalization"
        ? "Click to capitalize " + entry.word
        : "Replace “" + entry.word + "” with “" + option.label + "”");
      button.textContent = option.label;
      button.dataset.correctionOption = String(index);
      options.appendChild(button);
      if (focusedKey && correctionOptionKey(option) === focusedKey) button.dataset.restoreFocus = "true";
    });
    const restoreFocus = options.querySelector('[data-restore-focus="true"]');
    if (restoreFocus) {
      restoreFocus.removeAttribute("data-restore-focus");
      restoreFocus.focus({ preventScroll: true });
    }
  }

  function correctionOptionSelection(entry) {
    const options = $("correction-options");
    const selected = options.querySelector('.correction-option[aria-selected="true"]');
    const focused = options.contains(document.activeElement) && document.activeElement.closest
      ? document.activeElement.closest(".correction-option")
      : null;
    return {
      selectedKey: selected ? correctionOptionKey(entry.options[Number(selected.dataset.correctionOption)]) : null,
      focusedKey: focused ? correctionOptionKey(entry.options[Number(focused.dataset.correctionOption)]) : null
    };
  }

  function positionCorrectionPopover(entry, popover) {
    const mark = entry && entry.marker;
    if (!mark) return;
    let bounds = mark.getBoundingClientRect();
    if (entry.kind === "capitalization") {
      const remainder = mark.nextSibling;
      const remainderText = entry.word.slice(1);
      if (remainderText && remainder && remainder.nodeType === Node.TEXT_NODE && remainder.nodeValue.startsWith(remainderText)) {
        try {
          const range = document.createRange();
          range.setStart(mark.firstChild || mark, 0);
          range.setEnd(remainder, remainderText.length);
          bounds = range.getBoundingClientRect();
        } catch (_) {}
      }
    }
    const padding = 10;
    const zoom = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
    const width = popover.offsetWidth;
    const center = Math.max(padding / zoom + width / 2, Math.min(window.innerWidth / zoom - padding / zoom - width / 2, (bounds.left + bounds.width / 2) / zoom));
    const openBelow = bounds.top / zoom < popover.offsetHeight + 18;
    popover.dataset.placement = openBelow ? "bottom" : "top";
    popover.style.left = center + "px";
    popover.style.top = (openBelow ? bounds.bottom + 8 : bounds.top - 8) / zoom + "px";
  }

  function correctionContext(entry) {
    const marker = entry && entry.marker;
    if (!marker || !marker.isConnected) return null;
    const body = $("note-body");
    let block = marker.closest("p, li, blockquote, h1, h2, h3, h4, h5, h6, [data-block]");
    if (!block) {
      block = marker.parentElement;
      while (block && block.parentElement && block.parentElement !== body) block = block.parentElement;
      if (!block) block = body;
    }
    if (!block) return null;
    const paragraph = block.textContent || "";
    const word = marker.textContent || "";
    if (!word) return null;
    try {
      const range = document.createRange();
      range.selectNodeContents(block);
      range.setEndBefore(marker);
      const selectionStart = range.toString().length;
      const selectionEnd = selectionStart + word.length;
      if (paragraph.slice(selectionStart, selectionEnd) !== word) return null;
      return { paragraph: paragraph, selectionStart: selectionStart, selectionEnd: selectionEnd };
    } catch (_) {
      return null;
    }
  }

  function setSpellingContextStatus(entry, text, kind) {
    const popover = $("correction-popover");
    if (!popover || state.proofreadingActive !== entry || popover.hidden || popover.getAttribute("aria-hidden") === "true") return;
    const message = $("correction-message");
    message.textContent = text;
    message.dataset.state = kind || "info";
    message.hidden = false;
    positionCorrectionPopover(entry, popover);
  }

  function requestSpellingContextRank(entry) {
    if (!entry || entry.kind !== "spelling" || !Array.isArray(entry.options) || entry.options.length < 2) return;
    if (entry.contextRankState === "done") {
      setSpellingContextStatus(entry, entry.contextRankStatus || "Showing spelling suggestions.", entry.contextRankStatusKind || "ready");
      return;
    }
    if (entry.contextRankRequestId) {
      const pending = state.spellingContextRankRequests.get(entry.contextRankRequestId);
      if (pending && state.proofreadingActive === entry) pending.popoverSessionId = state.proofreadingPopoverSessionId;
      setSpellingContextStatus(entry, "Checking sentence context locally. First use may download about 97 MB.", "loading");
      return;
    }
    const context = correctionContext(entry);
    if (!context || context.paragraph.length > 5000) {
      entry.contextRankState = "done";
      entry.contextRankStatus = "Sentence context is unavailable; showing dictionary order.";
      entry.contextRankStatusKind = "unavailable";
      setSpellingContextStatus(entry, entry.contextRankStatus, entry.contextRankStatusKind);
      return;
    }
    const worker = ensureSelectionReviewWorker();
    if (!worker) {
      entry.contextRankState = "done";
      entry.contextRankStatus = "Local context ranking is unavailable; showing dictionary order.";
      entry.contextRankStatusKind = "unavailable";
      setSpellingContextStatus(entry, entry.contextRankStatus, entry.contextRankStatusKind);
      return;
    }
    const requestId = ++state.spellingContextRankRequestId;
    const pending = Object.assign({}, context, {
      requestId: requestId,
      entry: entry,
      word: entry.word,
      recordName: entry.recordName,
      popoverSessionId: state.proofreadingPopoverSessionId
    });
    entry.contextRankState = "pending";
    entry.contextRankRequestId = requestId;
    state.spellingContextRankRequests.set(requestId, pending);
    pending.timeoutId = window.setTimeout(function () {
      if (state.spellingContextRankRequests.get(requestId) !== pending) return;
      state.spellingContextRankRequests.delete(requestId);
      entry.contextRankRequestId = null;
      entry.contextRankState = "done";
      entry.contextRankStatus = "Local context ranking took too long; showing dictionary order.";
      entry.contextRankStatusKind = "unavailable";
      setSpellingContextStatus(entry, entry.contextRankStatus, entry.contextRankStatusKind);
    }, SPELLING_CONTEXT_RANK_TIMEOUT_MS);
    setSpellingContextStatus(entry, "Checking sentence context locally. First use may download about 97 MB.", "loading");
    try {
      worker.postMessage({
        type: "spelling-context-rank",
        requestId: requestId,
        payload: {
          paragraph: context.paragraph,
          selectionStart: context.selectionStart,
          selectionEnd: context.selectionEnd
        }
      });
    } catch (_) {
      state.spellingContextRankRequests.delete(requestId);
      window.clearTimeout(pending.timeoutId);
      entry.contextRankRequestId = null;
      entry.contextRankState = "done";
      entry.contextRankStatus = "Local context ranking is unavailable; showing dictionary order.";
      entry.contextRankStatusKind = "unavailable";
      setSpellingContextStatus(entry, entry.contextRankStatus, entry.contextRankStatusKind);
    }
  }

  function onSpellingContextRankMessage(event) {
    const message = event.data || {};
    const pending = state.spellingContextRankRequests.get(message.requestId);
    if (!pending) return;
    const entry = pending.entry;
    const popover = $("correction-popover");
    const isPopoverOpen = state.proofreadingActive === entry && popover && !popover.hidden && popover.getAttribute("aria-hidden") !== "true";
    const isOpen = isPopoverOpen && state.proofreadingPopoverSessionId === pending.popoverSessionId;
    if (message.type === "spelling-context-rank-progress") {
      if (!isOpen) return;
      const progress = message.progress || {};
      if (progress.phase === "download" && Number(progress.total) > 0) {
        const percent = Math.max(0, Math.min(100, Math.round(Number(progress.loaded) / Number(progress.total) * 100)));
        setSpellingContextStatus(entry, "Loading local writing model · " + percent + "% · about 97 MB on first use.", "loading");
      } else if (progress.phase === "model") {
        setSpellingContextStatus(entry, "Loading the local writing model…", "loading");
      } else if (progress.phase === "tokenizer") {
        setSpellingContextStatus(entry, "Loading the local writing tokenizer…", "loading");
      } else {
        setSpellingContextStatus(entry, "Checking sentence context locally…", "loading");
      }
      return;
    }
    if (message.type !== "spelling-context-rank-result") return;
    state.spellingContextRankRequests.delete(message.requestId);
    window.clearTimeout(pending.timeoutId);
    entry.contextRankRequestId = null;
    if (!isOpen || !entry.marker.isConnected || state.selectedRecordName !== pending.recordName) {
      entry.contextRankState = "idle";
      if (isPopoverOpen) {
        entry.contextRankStatus = state.proofreadingPopoverSessionId === pending.popoverSessionId
          ? "The text changed during context ranking; showing dictionary order."
          : "The earlier context check was closed; showing dictionary order.";
        entry.contextRankStatusKind = "ready";
        setSpellingContextStatus(entry, entry.contextRankStatus, entry.contextRankStatusKind);
      }
      return;
    }
    const currentContext = correctionContext(entry);
    if (!currentContext || currentContext.paragraph !== pending.paragraph
      || currentContext.selectionStart !== pending.selectionStart
      || currentContext.selectionEnd !== pending.selectionEnd
      || entry.word !== pending.word) {
      entry.contextRankState = "idle";
      entry.contextRankStatus = "The text changed during context ranking; showing dictionary order.";
      entry.contextRankStatusKind = "ready";
      setSpellingContextStatus(entry, entry.contextRankStatus, entry.contextRankStatusKind);
      return;
    }
    if (entry.contextRankInteracted) {
      entry.contextRankState = "done";
      entry.contextRankStatus = "Suggestions stayed in place while you were choosing.";
      entry.contextRankStatusKind = "ready";
      setSpellingContextStatus(entry, entry.contextRankStatus, entry.contextRankStatusKind);
      return;
    }
    const result = message.result;
    const suggestions = result && Array.isArray(result.suggestions) ? result.suggestions : [];
    const wordSuggestion = suggestions.find(function (suggestion) {
      return suggestion && suggestion.status === "suggestion"
        && suggestion.start === pending.selectionStart
        && suggestion.end === pending.selectionEnd
        && suggestion.original === pending.word
        && typeof suggestion.replacement === "string";
    });
    const promoted = wordSuggestion
      ? window.ArborProofreading.promoteSpellingCandidate(entry.options, pending.word, wordSuggestion.replacement)
      : entry.options;
    const changed = promoted.length && promoted[0] !== entry.options[0];
    entry.contextRankState = "done";
    if (changed) {
      const selection = correctionOptionSelection(entry);
      entry.options = promoted;
      renderCorrectionOptions(entry, selection.focusedKey ? selection : null);
      entry.contextRankStatus = "Local sentence context moved one matching candidate first.";
      entry.contextRankStatusKind = "ready";
      $("correction-announcement").textContent = "Context-ranked spelling suggestions for " + entry.word + ": "
        + entry.options.map(function (option) { return option.label; }).join(", ") + ".";
    } else {
      entry.contextRankStatus = result && result.status === "unavailable"
        ? "Context ranking is unavailable; showing dictionary order."
        : "No safe context match; showing dictionary order.";
      entry.contextRankStatusKind = result && result.status === "unavailable" ? "unavailable" : "ready";
    }
    setSpellingContextStatus(entry, entry.contextRankStatus, entry.contextRankStatusKind);
  }

  function openCorrectionPopover(mark, focusFirst, rankWithContext) {
    const popover = $("correction-popover");
    const entry = mark && state.proofreadingCorrections && state.proofreadingCorrections.get(mark.dataset.correctionId);
    if (!popover || !entry || !mark.isConnected) return;
    window.clearTimeout(state.proofreadingCloseTimer);
    if (state.proofreadingActive !== entry || popover.hidden || popover.getAttribute("aria-hidden") === "true") {
      state.proofreadingPopoverSessionId += 1;
      entry.contextRankInteracted = false;
    }
    state.proofreadingActive = entry;
    state.proofreadingKeyboardOpen = Boolean(focusFirst);
    state.proofreadingFocusSelection = captureEditorSelection($("note-body"));
    entry.marker.setAttribute("aria-expanded", "true");
    const options = $("correction-options");
    const actions = $("correction-actions");
    options.setAttribute("role", "listbox");
    options.setAttribute("aria-label", (entry.kind === "spelling" ? "Spelling" : entry.message) + " suggestions");
    renderCorrectionOptions(entry, null);
    $("correction-term").textContent = entry.word;
    const message = $("correction-message");
    message.textContent = entry.kind === "spelling" ? "" : entry.message;
    message.hidden = entry.kind === "spelling";
    const ignore = $("correction-ignore");
    ignore.setAttribute("aria-label", "Ignore this occurrence");
    ignore.hidden = false;
    const addToDictionary = $("correction-add-dictionary");
    if (addToDictionary) {
      addToDictionary.hidden = entry.kind !== "spelling";
      addToDictionary.setAttribute("aria-label", "Add " + entry.word + " to your proofreading dictionary");
    }
    popover.dataset.kind = entry.kind;
    if (entry.kind === "spelling") popover.insertBefore(actions, options);
    else popover.appendChild(actions);
    $("correction-announcement").textContent = (entry.kind === "spelling" ? "Spelling suggestion" : entry.message)
      + ". Current text: " + entry.word + ". " + entry.options.map(function (option) { return option.label; }).join(", ")
      + ". Ignore this occurrence." + (entry.kind === "spelling" ? " Add to Dictionary." : "");
    popover.hidden = false;
    popover.setAttribute("aria-hidden", "false");
    popover.classList.remove("is-open");
    positionCorrectionPopover(entry, popover);
    window.requestAnimationFrame(function () { popover.classList.add("is-open"); });
    if (focusFirst) {
      const first = popover.querySelector(".correction-option") || ignore;
      if (first && !first.hidden) first.focus({ preventScroll: true });
    }
    if (rankWithContext) requestSpellingContextRank(entry);
  }

  function closeCorrectionPopover(restoreFocus) {
    const popover = $("correction-popover");
    if (!popover || popover.hidden) return;
    window.clearTimeout(state.proofreadingCloseTimer);
    const active = state.proofreadingActive;
    const selection = state.proofreadingFocusSelection;
    const shouldRestore = Boolean(restoreFocus || state.proofreadingKeyboardOpen);
    popover.classList.remove("is-open");
    popover.setAttribute("aria-hidden", "true");
    state.proofreadingActive = null;
    state.proofreadingKeyboardOpen = false;
    state.proofreadingFocusSelection = null;
    if (active && active.marker && active.marker.isConnected) active.marker.setAttribute("aria-expanded", "false");
    window.setTimeout(function () { if (!popover.classList.contains("is-open")) popover.hidden = true; }, 140);
    if (shouldRestore && active && active.recordName === state.selectedRecordName) {
      const body = $("note-body");
      if (body) {
        body.focus({ preventScroll: true });
        if (selection) restoreEditorSelection(body, selection);
      }
    }
  }

  function handleCorrectionPopoverKeydown(event) {
    const popover = $("correction-popover");
    if (!popover || popover.hidden || !state.proofreadingActive) return;
    const items = Array.from(popover.querySelectorAll(".correction-option, #correction-ignore, #correction-add-dictionary")).filter(function (item) { return !item.hidden; });
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); closeCorrectionPopover(true); return;
    }
    if (!items.includes(document.activeElement)) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      state.proofreadingActive.contextRankInteracted = true;
      const current = items.indexOf(document.activeElement);
      const offset = event.key === "ArrowDown" ? 1 : -1;
      const next = items[(current + offset + items.length) % items.length];
      items.forEach(function (item) { item.setAttribute("aria-selected", String(item === next)); });
      next.focus({ preventScroll: true });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      document.activeElement.click();
    }
  }

  function applyCorrectionOption(optionIndex, selectedEntry) {
    const entry = selectedEntry || state.proofreadingActive;
    if (!entry || entry.recordName !== state.selectedRecordName || !entry.marker.isConnected) return;
    const option = entry.options[optionIndex];
    if (!option) return;
    const marker = entry.marker;
    const body = $("note-body");
    const parent = marker.parentNode;
    let highlight = null;
    closeCorrectionPopover(false);
    if (option.action === "remove-duplicate") {
      const before = marker.previousSibling;
      if (before && before.nodeType === Node.TEXT_NODE) before.nodeValue = before.nodeValue.replace(/\s+$/, "");
      marker.remove();
      const previous = parent.lastChild;
      if (previous && previous.nodeType === Node.TEXT_NODE) {
        const range = document.createRange(); range.setStart(previous, previous.length); range.collapse(true);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      }
    } else {
      const replacementText = String(option.replacement == null ? option.label : option.replacement);
      highlight = createCorrectionHighlight(replacementText);
      if (entry.kind === "capitalization") {
        const following = marker.nextSibling;
        if (following && following.nodeType === Node.TEXT_NODE && following.nodeValue.trim()) {
          const contextWrapper = document.createElement("span");
          contextWrapper.setAttribute("data-proofreading-ignore", "");
          following.replaceWith(contextWrapper);
          contextWrapper.appendChild(following);
          highlight.proofreadingContextWrapper = contextWrapper;
          highlight.recheckProofreading = true;
        }
      }
      marker.replaceWith(highlight);
      const range = document.createRange(); range.selectNodeContents(highlight); range.collapse(false);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }
    body.focus({ preventScroll: true });
    body.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: option.action === "remove-duplicate" ? "deleteContentBackward" : "insertReplacementText",
      data: option.action === "remove-duplicate" ? null : String(option.replacement == null ? option.label : option.replacement)
    }));
    if (highlight) finishCorrectionHighlight(body, highlight, {
      proofreadingContextWrapper: highlight.proofreadingContextWrapper,
      recheckProofreading: highlight.recheckProofreading
    });
    scheduleProofreading(body, highlight ? 280 : 0);
  }

  function ignoreCorrectionOccurrence() {
    const entry = state.proofreadingActive;
    if (!entry || entry.recordName !== state.selectedRecordName) return;
    let ignored = state.proofreadingIgnored.get(entry.recordName);
    if (!ignored) { ignored = new Set(); state.proofreadingIgnored.set(entry.recordName, ignored); }
    ignored.add(entry.occurrenceKey);
    const body = $("note-body");
    closeCorrectionPopover(false);
    if (body) scheduleProofreading(body, 0);
  }

  function bindCorrectionPopover() {
    const popover = $("correction-popover");
    popover.addEventListener("pointerenter", function () { window.clearTimeout(state.proofreadingCloseTimer); });
    popover.addEventListener("pointerleave", function () { scheduleCorrectionPopoverClose(false); });
    popover.addEventListener("focusout", function (event) {
      if (!event.relatedTarget || !popover.contains(event.relatedTarget)) scheduleCorrectionPopoverClose(false);
    });
    popover.addEventListener("click", function (event) {
      const option = event.target.closest("[data-correction-option]");
      if (option) applyCorrectionOption(Number(option.dataset.correctionOption));
      else if (event.target.closest("#correction-ignore")) ignoreCorrectionOccurrence();
      else if (event.target.closest("#correction-add-dictionary")) {
        const active = state.proofreadingActive;
        if (!active || active.kind !== "spelling") return;
        const word = active.word;
        closeCorrectionPopover(false);
        queuePersonalDictionaryOperation(word, false);
      }
    });
    document.addEventListener("pointerdown", function (event) {
      state.proofreadingLastPointerType = event.pointerType || "";
      const mark = correctionMarkFromEvent(event);
      const entry = mark && state.proofreadingCorrections && state.proofreadingCorrections.get(mark.dataset.correctionId);
      if (entry && entry.kind === "capitalization" && event.pointerType === "touch") {
        event.preventDefault();
        openCorrectionPopover(mark, false);
        return;
      }
      if (!event.target.closest("#correction-popover") && !mark) closeCorrectionPopover(false);
    });
    document.addEventListener("keydown", handleCorrectionPopoverKeydown, true);
    document.addEventListener("scroll", function () { closeCorrectionPopover(false); }, true);
  }

  function scheduleSelectionReviewPosition() {
    if (state.selectionReviewPositionFrame) return;
    state.selectionReviewPositionFrame = window.requestAnimationFrame(function () {
      state.selectionReviewPositionFrame = 0;
      updateSelectionReviewAction();
    });
  }

  function setSelectionReviewPosition(element, rect, below) {
    if (!element || !rect) return;
    const margin = 10;
    const body = document.body;
    const bodyRect = body && body.getBoundingClientRect();
    const scale = body && body.offsetWidth && bodyRect && bodyRect.width ? bodyRect.width / body.offsetWidth : 1;
    const width = (element.offsetWidth || 180) * scale;
    const height = (element.offsetHeight || 44) * scale;
    const x = Math.max(margin + width / 2, Math.min(window.innerWidth - margin - width / 2, rect.left + rect.width / 2));
    let y = below ? rect.bottom + 9 : rect.top - 9;
    if (!below && y - height < margin) {
      below = true;
      y = rect.bottom + 9;
    }
    if (below && y + height > window.innerHeight - margin) y = Math.max(margin, rect.top - height - 9);
    element.dataset.placement = below ? "bottom" : "top";
    element.style.left = x / scale + "px";
    element.style.top = y / scale + "px";
  }

  function updateSelectionReviewAction() {
    const action = $("selection-review-action");
    const panel = $("selection-review-panel");
    if (!action || (panel && !panel.hidden)) return;
    const context = selectionReviewContext();
    if (!context) {
      state.selectionReviewContext = null;
      action.hidden = true;
      return;
    }
    state.selectionReviewContext = context;
    action.hidden = false;
    setSelectionReviewPosition(action, context.range, false);
  }

  function ensureSelectionReviewWorker() {
    if (state.selectionReviewWorker) return state.selectionReviewWorker;
    if (typeof Worker !== "function") return null;
    try {
      const worker = new Worker("./paragraph-proofreading-worker.js?v=arb-190-instant-launch-20261125-a", {
        type: "module",
        name: "arbor-on-device-paragraph-proofreading"
      });
      worker.addEventListener("message", onSelectionReviewMessage);
      worker.addEventListener("message", onSpellingContextRankMessage);
      worker.addEventListener("message", onAutomaticSpellingContextMessage);
      worker.addEventListener("message", onCapitalizationContextMessage);
      worker.addEventListener("error", function () {
        cancelAutomaticSpellingContextRequests();
        window.clearTimeout(state.capitalizationContextTimeout);
        state.capitalizationContextPending = null;
        state.capitalizationContextRerun = false;
        const pending = state.selectionReviewPending;
        if (pending) {
          state.selectionReviewPending = null;
          showSelectionReviewMessage("Local writing review is unavailable in this browser.", "unavailable");
        }
        const requests = Array.from(state.spellingContextRankRequests.values());
        state.spellingContextRankRequests.clear();
        requests.forEach(function (request) {
          window.clearTimeout(request.timeoutId);
          const entry = request.entry;
          entry.contextRankRequestId = null;
          if (state.proofreadingActive === entry) {
            entry.contextRankState = "done";
            entry.contextRankStatus = "Local context ranking is unavailable; showing dictionary order.";
            entry.contextRankStatusKind = "unavailable";
            setSpellingContextStatus(entry, entry.contextRankStatus, entry.contextRankStatusKind);
          } else {
            entry.contextRankState = "idle";
          }
        });
      });
      state.selectionReviewWorker = worker;
      return worker;
    } catch (_) {
      return null;
    }
  }

  function openSelectionReview() {
    const context = state.selectionReviewContext || selectionReviewContext();
    const panel = $("selection-review-panel");
    if (!context || !panel) return;
    state.selectionReviewContext = context;
    state.selectionReviewResult = null;
    state.selectionReviewPending = Object.assign({}, context, {
      requestId: ++state.selectionReviewRequestId,
      paragraphLength: context.paragraph.length
    });
    const pending = state.selectionReviewPending;
    const action = $("selection-review-action");
    if (action) action.hidden = true;
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    panel.classList.remove("is-open");
    $("selection-review-results").replaceChildren();
    $("selection-review-actions").hidden = true;
    $("selection-review-status").textContent = "Loading local writing review. First use may download about 97 MB; note text stays in your browser.";
    setSelectionReviewPosition(panel, context.range, true);
    window.requestAnimationFrame(function () {
      panel.classList.add("is-open");
      $("selection-review-close").focus({ preventScroll: true });
    });
    const worker = ensureSelectionReviewWorker();
    if (!worker) {
      state.selectionReviewPending = null;
      showSelectionReviewMessage("Local writing review is unavailable in this browser.", "unavailable");
      return;
    }
    try {
      worker.postMessage({
        type: "suggestion-review",
        requestId: pending.requestId,
        method: pending.method,
        payload: pending.payload
      });
    } catch (_) {
      state.selectionReviewPending = null;
      showSelectionReviewMessage("Local writing review couldn’t start. Try again.", "unavailable");
    }
  }

  function selectionReviewUnavailableMessage(reason) {
    if (reason === "input-too-long") return "This selection is too long for one local review.";
    if (reason === "multiple-paragraphs") return "Select one paragraph at a time.";
    if (reason === "model-unavailable" || reason === "local-model-unavailable" || reason === "inference-failed") return "Local writing review isn’t ready in this browser.";
    if (reason === "unsafe-structure-change") return "No safe suggestion was available for this text.";
    return "Local writing review couldn’t complete. Try again.";
  }

  function showSelectionReviewMessage(message, kind) {
    const panel = $("selection-review-panel");
    const status = $("selection-review-status");
    if (!panel || !status) return;
    status.textContent = message;
    status.dataset.state = kind || "info";
    $("selection-review-results").replaceChildren();
    $("selection-review-actions").hidden = true;
  }

  function onSelectionReviewMessage(event) {
    const message = event.data || {};
    const pending = state.selectionReviewPending;
    if (!pending || message.requestId !== pending.requestId || pending.requestId !== state.selectionReviewRequestId) return;
    if (message.type === "suggestion-review-progress") {
      const progress = message.progress || {};
      if (progress.phase === "download" && Number(progress.total) > 0) {
        const percent = Math.max(0, Math.min(100, Math.round(Number(progress.loaded) / Number(progress.total) * 100)));
        const file = typeof progress.file === "string" ? progress.file.split("/").pop() : "model asset";
        showSelectionReviewMessage("Downloading local review asset · " + file + " · " + percent + "%", "loading");
      } else if (progress.phase === "model") showSelectionReviewMessage("Loading the local writing model…", "loading");
      else if (progress.phase === "tokenizer") showSelectionReviewMessage("Loading the local writing tokenizer…", "loading");
      else showSelectionReviewMessage("Preparing local writing review…", "loading");
      return;
    }
    if (message.type !== "suggestion-review-result") return;
    const body = $("note-body");
    if (state.selectedRecordName !== pending.recordName || body !== pending.body || !state.editor || state.editor.getMarkdown() !== pending.noteText) {
      state.selectionReviewPending = null;
      showSelectionReviewMessage("This note changed during review. Select the text again to review it.", "stale");
      return;
    }
    state.selectionReviewPending = pending;
    state.selectionReviewResult = message.result || { status: "unavailable", reason: "malformed-result" };
    renderSelectionReviewResult();
  }

  function selectionReviewEntries(result) {
    if (!result) return [];
    if (Array.isArray(result.suggestions)) return result.suggestions;
    if (result.status === "suggestion") return [result.suggestion || result];
    return [];
  }

  function appendSelectionReviewEntry(container, entry, index, label) {
    const row = document.createElement("article");
    row.className = "selection-review-entry";
    const heading = document.createElement("h3");
    heading.className = "selection-review-entry-label";
    heading.textContent = label || "Suggested change";
    const source = document.createElement("p");
    source.className = "selection-review-original";
    source.textContent = entry.original;
    const replacement = document.createElement("p");
    replacement.className = "selection-review-replacement";
    replacement.textContent = entry.replacement;
    const accept = document.createElement("button");
    accept.className = "selection-review-accept";
    accept.type = "button";
    accept.dataset.reviewAccept = String(index);
    accept.textContent = label === "Full sentence suggestion" ? "Accept sentence" : label === "Full fragment suggestion" ? "Accept fragment" : "Accept";
    row.append(heading, source, replacement, accept);
    container.appendChild(row);
  }

  function renderSelectionReviewResult() {
    const result = state.selectionReviewResult;
    const pending = state.selectionReviewPending;
    const panel = $("selection-review-panel");
    const status = $("selection-review-status");
    const results = $("selection-review-results");
    const actions = $("selection-review-actions");
    const acceptAll = $("selection-review-accept-all");
    if (!result || !pending || !panel) return;
    results.replaceChildren();
    status.dataset.state = result.status;
    if (result.status === "unavailable") {
      showSelectionReviewMessage(selectionReviewUnavailableMessage(result.reason), "unavailable");
      return;
    }
    if (result.status === "no-suggestion") {
      showSelectionReviewMessage("No changes suggested for this selection.", "no-suggestion");
      return;
    }
    const entries = selectionReviewEntries(result);
    if (!entries.length && !result.paragraphSuggestion) {
      showSelectionReviewMessage("No changes suggested for this selection.", "no-suggestion");
      return;
    }
    if (pending.method === "suggestSentences") status.textContent = "Review each sentence. Accept All applies the paragraph suggestion.";
    else if (result.scope === "selection") status.textContent = "Suggested changes in the selected text.";
    else status.textContent = "Review this suggestion before accepting it.";
    entries.forEach(function (entry, index) {
      appendSelectionReviewEntry(results, entry, index, pending.method === "suggestSentences" ? "Sentence " + (index + 1) : "Suggested change");
    });
    if (result.scope === "selection" && result.fragmentSuggestion) {
      appendSelectionReviewEntry(results, result.fragmentSuggestion, entries.length, "Full fragment suggestion");
    }
    if (result.scope === "selection" && result.sentenceSuggestion) {
      appendSelectionReviewEntry(results, result.sentenceSuggestion, entries.length + (result.fragmentSuggestion ? 1 : 0), "Full sentence suggestion");
    }
    const hasAcceptAll = Boolean(result.paragraphSuggestion) || entries.length > 1;
    actions.hidden = false;
    acceptAll.hidden = !hasAcceptAll;
  }

  function applySelectionReviewMarkdown(nextNoteText, pending, replacement) {
    const body = $("note-body");
    if (!body || body !== pending.body || !state.editor || state.editor.getMarkdown() !== pending.noteText) return false;
    body.innerHTML = markdownHTML(nextNoteText);
    state.selectionReviewApplying = true;
    body.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: replacement || null }));
    state.selectionReviewApplying = false;
    const replacementElement = document.createElement("div");
    replacementElement.innerHTML = markdownHTML(replacement || "");
    const caretOffset = Math.min(body.textContent.length, pending.plainStart + replacementElement.textContent.length);
    const point = editorPointAtTextOffset(body, caretOffset);
    try {
      const range = document.createRange();
      range.setStart(point.node, point.offset);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      body.focus({ preventScroll: true });
    } catch (_) {}
    return true;
  }

  function updateSelectionReviewAfterAccept(entry, nextNoteText) {
    const pending = state.selectionReviewPending;
    const result = state.selectionReviewResult;
    if (!pending || !result) return false;
    const delta = entry.replacement.length - (entry.end - entry.start);
    pending.paragraphLength += delta;
    pending.noteText = nextNoteText;
    pending.paragraph = nextNoteText.slice(pending.paragraphStart, pending.paragraphStart + pending.paragraphLength);
    const remaining = selectionReviewEntries(result).filter(function (candidate) { return candidate !== entry; }).filter(function (candidate) {
      if (candidate.start < entry.end && candidate.end > entry.start) return false;
      if (candidate.start >= entry.end) { candidate.start += delta; candidate.end += delta; }
      return true;
    });
    if (!remaining.length) {
      state.selectionReviewResult = { status: "no-suggestion", reason: "accepted" };
      showSelectionReviewMessage("Suggestion accepted.", "accepted");
      return true;
    }
    const nextResult = Object.assign({}, result, { suggestions: remaining });
    if (result.paragraphSuggestion) {
      let combined = nextNoteText;
      const sorted = remaining.slice().sort(function (left, right) { return right.start - left.start; });
      for (const suggestion of sorted) {
        combined = applySelectionReviewSuggestion(combined, suggestion);
        if (combined == null) break;
      }
      if (combined != null) {
        const end = pending.paragraphStart + pending.paragraphLength;
        const deltaAfterRemaining = sorted.reduce(function (sum, suggestion) { return sum + suggestion.replacement.length - (suggestion.end - suggestion.start); }, 0);
        nextResult.paragraphSuggestion = {
          status: "suggestion",
          original: pending.paragraph,
          replacement: combined.slice(pending.paragraphStart, end + deltaAfterRemaining),
          start: pending.paragraphStart,
          end: end
        };
      } else delete nextResult.paragraphSuggestion;
    } else delete nextResult.paragraphSuggestion;
    if (result.fragmentSuggestion) delete nextResult.fragmentSuggestion;
    if (result.sentenceSuggestion) delete nextResult.sentenceSuggestion;
    state.selectionReviewResult = nextResult;
    renderSelectionReviewResult();
    return true;
  }

  function applySelectionReviewSuggestion(noteText, suggestion) {
    const proofreader = window.ArborParagraphProofreader;
    if (!proofreader || !suggestion) return null;
    const range = { start: suggestion.start, end: suggestion.end };
    if (typeof proofreader.applyAcceptedTextSuggestion === "function") {
      return proofreader.applyAcceptedTextSuggestion(noteText, range, suggestion);
    }
    if (typeof proofreader.applyAcceptedParagraphSuggestion === "function") {
      return proofreader.applyAcceptedParagraphSuggestion(noteText, range, Object.assign({ status: "suggestion" }, suggestion));
    }
    return null;
  }

  function acceptSelectionReviewEntry(index) {
    const pending = state.selectionReviewPending;
    const result = state.selectionReviewResult;
    const entries = selectionReviewEntries(result);
    let entry = entries[index];
    if (!entry && result && result.scope === "selection") {
      const alternatives = [result.fragmentSuggestion, result.sentenceSuggestion].filter(Boolean);
      entry = alternatives[index - entries.length];
    }
    if (!pending || !entry || !window.ArborParagraphProofreader) return;
    const current = state.editor && state.editor.getMarkdown();
    if (current !== pending.noteText) {
      state.selectionReviewPending = null;
      showSelectionReviewMessage("This note changed during review. Select the text again to review it.", "stale");
      return;
    }
    const next = applySelectionReviewSuggestion(current, entry);
    if (next == null) {
      showSelectionReviewMessage("This suggestion no longer matches the note. Review the text again.", "stale");
      return;
    }
    if (!applySelectionReviewMarkdown(next, pending, entry.replacement)) {
      showSelectionReviewMessage("This suggestion no longer matches the note. Review the text again.", "stale");
      return;
    }
    if (entry === result.fragmentSuggestion || entry === result.sentenceSuggestion) {
      state.selectionReviewPending = null;
      closeSelectionReview(false);
      return;
    }
    updateSelectionReviewAfterAccept(entry, next);
  }

  function acceptAllSelectionReview() {
    const pending = state.selectionReviewPending;
    const result = state.selectionReviewResult;
    if (!pending || !result || !window.ArborParagraphProofreader) return;
    const current = state.editor && state.editor.getMarkdown();
    if (current !== pending.noteText) {
      state.selectionReviewPending = null;
      showSelectionReviewMessage("This note changed during review. Select the text again to review it.", "stale");
      return;
    }
    let next = current;
    let replacement = "";
    if (result.paragraphSuggestion) {
      const suggestion = result.paragraphSuggestion;
      next = applySelectionReviewSuggestion(current, suggestion);
      replacement = suggestion.replacement;
    } else {
      const entries = selectionReviewEntries(result).slice().sort(function (left, right) { return right.start - left.start; });
      for (const suggestion of entries) {
        next = applySelectionReviewSuggestion(next, suggestion);
        if (next == null) break;
      }
      replacement = entries.map(function (suggestion) { return suggestion.replacement; }).join(" ");
    }
    if (next == null || next === current) {
      showSelectionReviewMessage("This suggestion no longer matches the note. Review the text again.", "stale");
      return;
    }
    if (!applySelectionReviewMarkdown(next, pending, replacement)) {
      showSelectionReviewMessage("This suggestion no longer matches the note. Review the text again.", "stale");
      return;
    }
    state.selectionReviewPending = null;
    closeSelectionReview(false, true);
  }

  function closeSelectionReview(restoreFocus, immediate) {
    const action = $("selection-review-action");
    const panel = $("selection-review-panel");
    if (!panel || panel.hidden) {
      if (action) action.hidden = true;
      state.selectionReviewContext = null;
      state.selectionReviewResult = null;
      return;
    }
    state.selectionReviewRequestId += 1;
    state.selectionReviewPending = null;
    state.selectionReviewResult = null;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    if (immediate) panel.hidden = true;
    else window.setTimeout(function () { if (!panel.classList.contains("is-open")) panel.hidden = true; }, 140);
    if (action) action.hidden = true;
    if (restoreFocus) {
      const body = $("note-body");
      if (body) body.focus({ preventScroll: true });
    }
    state.selectionReviewContext = null;
  }

  function bindSelectionReview() {
    const action = $("selection-review-action");
    const panel = $("selection-review-panel");
    if (!action || !panel) return;
    action.addEventListener("pointerdown", function (event) { event.preventDefault(); });
    action.addEventListener("click", openSelectionReview);
    $("selection-review-close").addEventListener("click", function () { closeSelectionReview(true); });
    $("selection-review-accept-all").addEventListener("click", acceptAllSelectionReview);
    panel.addEventListener("click", function (event) {
      const accept = event.target.closest("[data-review-accept]");
      if (accept) acceptSelectionReviewEntry(Number(accept.dataset.reviewAccept));
    });
    document.addEventListener("selectionchange", scheduleSelectionReviewPosition);
    document.addEventListener("scroll", scheduleSelectionReviewPosition, true);
    window.addEventListener("resize", scheduleSelectionReviewPosition);
    document.addEventListener("pointerdown", function (event) {
      if (event.target.closest("#selection-review-panel, #selection-review-action")) return;
      if (panel.hidden) return;
      closeSelectionReview(false);
    });
    document.addEventListener("keydown", function (event) {
      if (panel.hidden || event.key !== "Escape") return;
      event.preventDefault();
      closeSelectionReview(true);
    }, true);
  }

  function noteEditInProgress(recordName) {
    if (!recordName) return false;
    if (state.editQueue.some(function (edit) { return edit.recordName === recordName; })) return true;
    return state.selectedRecordName === recordName && (state.dirty || state.saveFlightCount > 0);
  }

  function selectRestoredNote(note) {
    if (!note) {
      if (noteEditInProgress(state.selectedRecordName)) return;
      selectNote(null);
      return;
    }
    if (state.selectedRecordName === note.recordName && state.editor && noteEditInProgress(note.recordName)) return;
    if (noteEditInProgress(state.selectedRecordName) && state.selectedRecordName !== note.recordName) return;
    selectNote(note);
  }

  function selectNote(note) {
    window.clearTimeout(state.proofreadingTimer);
    window.clearTimeout(state.capitalizationContextTimer);
    window.clearTimeout(state.capitalizationContextTimeout);
    state.proofreadingRequestId += 1;
    state.proofreadingPending = null;
    state.capitalizationContextPending = null;
    state.capitalizationContextRerun = false;
    closeCorrectionPopover(false);
    closeSelectionReview(false, true);
    const workspace = $("note-workspace");
    const empty = $("empty-state");
    if (!note) {
      if (state.editor) { state.editor.destroy(); state.editor = null; }
      $("rich-editor").replaceChildren();
      workspace.hidden = true; empty.hidden = false;
      $("note-actions-button").hidden = true;
      state.selectedRecord = null; state.selectedRecordName = null;
      const aboutPanel = $("about-note-panel");
      if (aboutPanel) {
        window.clearTimeout(state.aboutCloseTimer);
        aboutPanel.hidden = true;
        aboutPanel.classList.remove("is-open");
        aboutPanel.setAttribute("aria-hidden", "true");
      }
      frame.classList.remove("has-about-note");
      $("note-actions-button").setAttribute("aria-expanded", "false");
      state.editorHistoryBaseline = null;
      state.draftBaseline = null;
      state.bodyDirty = false;
      hideDraftBanner();
      hideSaveState();
      frame.classList.remove("mobile-note-open", "mobile-editor-open");
      renderOpenNoteTabs();
      return;
    }
    state.selectedRecord = note.record;
    state.selectedRecordName = note.recordName;
    applyNoteFontStyle(note);
    registerOpenNote(note);
    renderOpenNoteTabs();
    $("note-actions-button").hidden = Boolean(state.searchPage);
    state.dirty = false;
    state.bodyDirty = false;
    state.showCreatedDate = false;
    $("note-title").value = note.title === "Untitled" && !note.body ? "" : note.title;
    fitTitle();
    renderNoteDate(note);
    $("folder-select").innerHTML = '<option value="">Unfiled</option>' + state.folders.map(function (folder) {
      return '<option value="' + escapeHTML(folder.path) + '">' + escapeHTML(folder.path) + "</option>";
    }).join("");
    $("folder-select").value = note.folderPath || "";
    $("star-button").hidden = state.nativeSchema;
    $("star-button").classList.toggle("is-starred", note.starred);
    $("star-button").setAttribute("aria-label", note.starred ? "Unstar note" : "Star note");
    $("star-button").title = note.starred ? "Unstar note" : "Star note";
    empty.hidden = true; workspace.hidden = false;
    workspace.classList.remove("note-entering");
    void workspace.offsetWidth;
    workspace.classList.add("note-entering");
    if (state.editor) { state.editor.destroy(); state.editor = null; }
    $("rich-editor").replaceChildren();
    $("rich-editor").classList.remove("toolbar-open");

    const nativeNeedsBody = state.nativeSchema && isNativeModelRecord(note.record, "CapturedNote") &&
      !state.bodyCache.has(note.recordName) && typeof fieldValue(note.record, "text") !== "string";
    const legacyNeedsBody = !state.nativeSchema && note.record.recordType === "ArborNote" &&
      !state.bodyCache.has(note.recordName) && typeof fieldValue(note.record, "body") !== "string";
    if (nativeNeedsBody || legacyNeedsBody) {
      const recordName = note.recordName;
      const session = state.accountSession;
      const loading = document.createElement("div");
      loading.className = "editor-load-state"; loading.textContent = "Opening note…";
      $("rich-editor").replaceChildren(loading);
      setSaveState("Opening", "saving");
      const bodyPromise = nativeNeedsBody ? ensureNativeTextBody(note) : ensureWebTextBody(note);
      bodyPromise.then(function () {
        if (session !== state.accountSession || state.selectedRecordName !== recordName) return;
        state.selectedRecord = note.record;
        $("note-title").value = note.title === "Untitled" && !note.body ? "" : note.title;
        rememberSyncBaseline(note.recordName, { title: note.title, body: note.editorBody || "" });
        createEditor(note.editorBody);
        if (!revealRecoveredDraft(note)) setSaveState("Saved", "saved");
        renderNotes();
      }).catch(function () {
        if (session !== state.accountSession || state.selectedRecordName !== recordName) return;
        const message = document.createElement("div"); message.className = "editor-load-state is-error";
        const label = document.createElement("p"); label.textContent = "This note’s text could not load.";
        const retry = document.createElement("button"); retry.type = "button";
        retry.className = "editor-retry-button"; retry.textContent = "Try again";
        retry.addEventListener("click", function () { selectNote(note); });
        message.append(label, retry); $("rich-editor").replaceChildren(message); setSaveState("Load failed", "error");
      });
    } else {
      rememberSyncBaseline(note.recordName, { title: note.title, body: note.editorBody || "" });
      createEditor(note.editorBody);
      if (!revealRecoveredDraft(note)) setSaveState(state.demo ? "Preview only" : "Saved", "saved");
      if (state.nativeSchema && state.bodyCache.has(note.recordName) &&
          typeof fieldValue(note.record, "text") !== "string" && !fieldValue(note.record, "text_ckAsset")) {
        ensureFullNativeRecord(note).catch(function (error) {
          showToast("This note is cached, but CloudKit could not prepare it for editing: " + readableError(error), true);
        });
      }
    }
    if (window.matchMedia("(max-width: 820px)").matches) frame.classList.add("mobile-note-open", "mobile-editor-open");
    renderNotes();
  }

  async function openNote(recordName, options) {
    const tabIntent = options && options.tabIntent === "new" ? "new" : "replace";
    const session = state.accountSession;
    state.restoreHiddenNoteName = "";
    state.listCursor = recordName;
    if (state.selectedRecordName === recordName) {
      prepareNoteTabOpen(recordName, tabIntent);
      renderOpenNoteTabs();
      if (window.matchMedia("(max-width: 820px)").matches) frame.classList.add("mobile-note-open", "mobile-editor-open");
      applyListCursor(); return true;
    }
    try {
      await state.noteStyleSavePromise.catch(function () {});
      await flushSave();
      if (!accountSessionCurrent(session)) return false;
      const note = state.notes.find(function (item) { return item.recordName === recordName; });
      if (!note) return false;
      prepareNoteTabOpen(recordName, tabIntent);
      if (!options || !options.skipHistory) recordNoteHistory(recordName);
      state.selectedRecordName = recordName;
      renderAll(); selectNote(note);
      return true;
    } catch (error) { showToast(readableError(error), true); }
    return false;
  }

  async function closeNoteTab(recordName) {
    const index = state.openNoteTabs.indexOf(recordName);
    if (index < 0) return "";
    const wasActive = state.selectedRecordName === recordName || state.activeNoteTabName === recordName;
    const nextName = wasActive ? (state.openNoteTabs[index + 1] || state.openNoteTabs[index - 1] || "") : "";
    if (wasActive) {
      try { await flushSave(); }
      catch (error) { showToast(readableError(error), true); return ""; }
    }
    const pendingNote = state.notes.find(function (note) { return note.recordName === recordName; });
    if (state.pendingNewNoteRecords.has(recordName) && pendingNote && pendingNote.title === "Untitled" && !String(pendingNote.editorBody || "")) {
      state.pendingNewNoteRecords.delete(recordName);
      state.pendingNewNoteNavigation.delete(recordName);
      state.records.delete(recordName);
      clearDraft(recordName);
      syncDerivedCollections();
    }
    state.openNoteTabs.splice(index, 1);
    if (wasActive) state.activeNoteTabName = nextName;
    persistOpenNoteTabs();
    renderOpenNoteTabs();
    if (wasActive && nextName) await openNote(nextName);
    else if (wasActive) {
      state.selectedRecordName = null;
      selectNote(null);
    }
    renderAll();
    return wasActive ? nextName : "";
  }

  async function loadAssetBody(record) {
    const asset = fieldValue(record, "bodyAsset");
    const url = asset && (asset.downloadURL || asset.url);
    if (!url) throw new Error("This note’s attachment could not be opened.");
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not download this note’s text asset.");
    return await (await response.blob()).text();
  }

  async function ensureWebRecordZone() {
    const services = window.ArborCloudKitWebServices;
    const transport = state.arborCloudKitTransport;
    if (!services || typeof services.CloudKitEncryptedWebServices !== "function" || !transport) {
      throw new Error("Arbor could not prepare its private notes zone in iCloud.");
    }
    const client = new services.CloudKitEncryptedWebServices({
      containerIdentifier: config.containerIdentifier,
      environment: config.environment || "development",
      apiToken: String(config.apiToken || ""),
      authTokenStore: transport.authTokenStore,
      fetchImpl: transport.fetch
    });
    state.libraryLoadOperation = "zones/modify";
    const ensured = await client.ensureRecordZone(cloudKitWebZone.ARBOR_WEB_ZONE_ID);
    return ensured.zoneID || cloudKitWebZone.ARBOR_WEB_ZONE_ID;
  }

  function cachedBodyIsStale(previous, next) {
    if (!previous) return false;
    const previousModified = String(fieldValue(previous, "modifiedAt") || "");
    const nextModified = String(fieldValue(next, "modifiedAt") || "");
    if (previousModified !== nextModified) return true;
    const previousFingerprint = String(fieldValue(previous, "contentFingerprint") || "");
    const nextFingerprint = String(fieldValue(next, "contentFingerprint") || "");
    return Boolean(previousFingerprint && nextFingerprint && previousFingerprint !== nextFingerprint);
  }

  function applyLibraryRecord(record) {
    if (!cloudKitWebZone.isLibraryRecord(record, state.nativeSchema)) return;
    const previous = state.records.get(record.recordName);
    state.records.set(record.recordName, record);
    if (cachedBodyIsStale(previous, record)) {
      state.bodyCache.delete(record.recordName);
      state.previewCache.delete(record.recordName);
      state.previewLoadErrors.delete(record.recordName);
    }
  }

  async function loadZoneRecords(session) {
    if (!accountSessionCurrent(session)) return;
    state.loadingRecords = true; state.libraryLoadSlow = false; state.libraryLoadSlowMessage = ""; state.loadRecordsErrorMessage = ""; state.libraryLoadOperation = ""; renderNotes();
    if (config.schemaMode === "web") {
      state.nativeSchema = false;
      state.nativeZoneID = await ensureWebRecordZone();
      if (!accountSessionCurrent(session)) { state.loadingRecords = false; return; }
    } else if (!state.nativeZoneID) {
      const zoneResponse = assertResponse(await state.database.fetchAllRecordZones());
      if (!accountSessionCurrent(session)) { state.loadingRecords = false; return; }
      const zoneEntries = zoneResponse.zones || [];
      const nativeZone = zoneEntries.find(function (zone) {
        const id = zone.zoneID || zone;
        return id.zoneName === "com.apple.coredata.cloudkit.zone";
      });
      if (nativeZone) {
        state.nativeSchema = true;
        state.nativeZoneID = nativeZone.zoneID || nativeZone;
      } else {
        state.nativeSchema = false;
        state.nativeZoneID = await ensureWebRecordZone();
        if (!accountSessionCurrent(session)) { state.loadingRecords = false; return; }
      }
    }
    if (!accountSessionCurrent(session)) { state.loadingRecords = false; return; }
    state.nativeZoneExists = true;
    const fetchChanges = async function (startToken) {
      let token = startToken || null; let more = true; let safety = 0;
      while (more && safety < 1000) {
        if (!accountSessionCurrent(session) || !state.nativeZoneID) return;
        const options = cloudKitWebZone.metadataChangeOptions(state.nativeSchema, state.nativeZoneID);
        if (token) options.syncToken = token;
        state.libraryLoadOperation = "zones/fetch-changes";
        let response;
        try {
          response = assertResponse(await state.database.fetchRecordZoneChanges(options));
        } catch (error) {
          throw withCloudKitOperation(error, "zones/fetch-changes");
        }
        if (!accountSessionCurrent(session) || !state.nativeZoneID) return;
        const zones = response.zones || [];
        const changes = zones.find(function (zone) {
          const id = zone.zoneID || {};
          return id.zoneName === state.nativeZoneID.zoneName;
        }) || zones[0];
        if (!changes) break;
        (changes.records || []).forEach(function (record) {
          applyLibraryRecord(record);
        });
        (changes.deletedRecords || []).forEach(function (record) {
          state.records.delete(record.recordName); state.bodyCache.delete(record.recordName);
          state.previewCache.delete(record.recordName); state.previewLoadErrors.delete(record.recordName);
        });
        token = changes.syncToken || token; state.syncToken = token;
        syncDerivedCollections(); renderAll();
        more = Boolean(changes.moreComing); safety += 1;
      }
    };
    try { await fetchChanges(state.syncToken); }
    catch (error) {
      if (!accountSessionCurrent(session)) { state.loadingRecords = false; return; }
      const message = String(error && (error.reason || error.message || error.description) || error);
      if (!state.syncToken || !/CHANGE.?TOKEN|SYNC.?TOKEN|TOKEN.*EXPIRED|EXPIRED.*TOKEN/i.test(message)) throw error;
      state.records = new Map(); state.bodyCache = new Map(); state.previewCache = new Map(); resetPreviewHydration(); state.syncToken = null;
      syncDerivedCollections(); renderAll(); await fetchChanges(null);
    }
    if (!accountSessionCurrent(session)) { state.loadingRecords = false; return; }
    state.libraryLoadOperation = ""; state.loadingRecords = false; state.libraryLoadSlow = false; state.libraryLoadSlowMessage = "";
    syncDerivedCollections(); renderAll();
    const restoredState = restoreOpenTabsForLoadedNotes();
    const first = noteSorting.sortNotes(state.notes.filter(function (note) { return !isArchived(note.record); }), state.preferences.noteSortOrder)[0];
    const current = state.notes.find(function (note) { return note.recordName === state.selectedRecordName && !isArchived(note.record); });
    if (state.preferences.tabsEnabled && restoredState.note) selectRestoredNote(restoredState.note);
    else if (restoredState.hidden) selectRestoredNote(null);
    else if (!state.preferences.tabsEnabled && currentNoteFromHistory()) selectRestoredNote(currentNoteFromHistory());
    else if (current) selectRestoredNote(current); else if (first) selectRestoredNote(first); else selectRestoredNote(null);
    scheduleLibraryCacheWrite();
  }

  function sameSyncDocument(left, right) {
    return Boolean(left && right && left.title === right.title && left.body === right.body);
  }

  function replaceActiveEditorDocument(recordName, documentValue) {
    if (state.selectedRecordName !== recordName || !state.editor) return false;
    const note = state.notes.find(function (item) { return item.recordName === recordName; });
    if (!note) return false;
    const record = state.records.get(recordName) || state.selectedRecord;
    if (record) state.selectedRecord = record;
    note.title = documentValue.title;
    note.editorBody = documentValue.body;
    note.body = isNativeModelRecord(record, "CapturedNote")
      ? documentValue.body
      : documentValue.title + "\n\n" + documentValue.body;
    note.preview = previewText(documentValue.body);
    note.previewUnavailable = false;
    const titleInput = $("note-title");
    if (titleInput && document.activeElement !== titleInput) {
      titleInput.value = documentValue.title === "Untitled" && !documentValue.body ? "" : documentValue.title;
      fitTitle();
    }
    if (state.editor.getMarkdown() !== documentValue.body) state.editor.replaceMarkdown(documentValue.body);
    return true;
  }

  function applyRemoteDocumentToActiveEditor(record, documentValue) {
    const recordName = record.recordName;
    if (state.selectedRecordName !== recordName || state.dirty || state.saveFlightCount > 0 || !state.editor) return false;
    state.selectedRecord = record;
    if (!replaceActiveEditorDocument(recordName, documentValue)) return false;
    const note = state.notes.find(function (item) { return item.recordName === recordName; });
    state.bodyDirty = false;
    state.dirty = false;
    state.draftBaseline = null;
    clearDraft(recordName);
    rememberSyncBaseline(recordName, documentValue);
    state.editorHistoryBaseline = captureEditorHistorySnapshot({ editorBodyChanged: true });
    hideDraftBanner();
    setSaveState("Saved", "saved");
    if (note) renderNoteDate(note);
    renderAboutPanel();
    return true;
  }

  async function refreshZoneRecords(session) {
    if (!accountSessionCurrent(session) || !state.nativeZoneID || document.visibilityState === "hidden") return;
    if (state.realtimeSyncPromise) return state.realtimeSyncPromise;
    const database = state.database;
    const zoneID = state.nativeZoneID;
    const nativeSchema = state.nativeSchema;
    state.realtimeSyncPromise = (async function () {
      let token = state.syncToken;
      let more = true;
      let safety = 0;
      const changedNames = new Set();
      const deletedNames = new Set();
      while (more && safety < 1000) {
        if (!accountSessionCurrent(session) || database !== state.database || zoneID !== state.nativeZoneID) return;
        const options = cloudKitWebZone.metadataChangeOptions(nativeSchema, zoneID);
        if (token) options.syncToken = token;
        let response;
        try { response = assertResponse(await database.fetchRecordZoneChanges(options)); }
        catch (error) {
          const message = cloudKitErrorText(error);
          if (token && /CHANGE.?TOKEN|SYNC.?TOKEN|TOKEN.*EXPIRED|EXPIRED.*TOKEN/i.test(message)) {
            token = null;
            state.syncToken = null;
            more = true;
            continue;
          }
          throw error;
        }
        if (!accountSessionCurrent(session)) return;
        const zones = response.zones || [];
        const changes = zones.find(function (zone) {
          const id = zone.zoneID || {};
          return id.zoneName === zoneID.zoneName;
        }) || zones[0];
        if (!changes) break;
        (changes.records || []).forEach(function (record) {
          if (!cloudKitWebZone.isLibraryRecord(record, nativeSchema)) return;
          changedNames.add(record.recordName);
          if (record.recordName === state.selectedRecordName && (state.dirty || state.saveFlightCount > 0)) {
            state.pendingRemoteRecords.set(record.recordName, record);
            return;
          }
          applyLibraryRecord(record);
        });
        (changes.deletedRecords || []).forEach(function (record) {
          const recordName = record.recordName;
          deletedNames.add(recordName);
          if (recordName === state.selectedRecordName && (state.dirty || state.saveFlightCount > 0)) {
            state.pendingRemoteRecords.set(recordName, null);
            return;
          }
          state.records.delete(recordName);
          state.bodyCache.delete(recordName);
          state.previewCache.delete(recordName);
          state.previewLoadErrors.delete(recordName);
        });
        token = changes.syncToken || token;
        state.syncToken = token;
        more = Boolean(changes.moreComing);
        safety += 1;
      }
      if (!accountSessionCurrent(session)) return;
      const selectedName = state.selectedRecordName;
      const selectedChanged = selectedName &&
        (changedNames.has(selectedName) || state.pendingRemoteRecords.has(selectedName)) &&
        !state.dirty && state.saveFlightCount === 0;
      let selectedDocument = null;
      let selectedRecord = null;
      if (selectedChanged) {
        const fullResponse = assertResponse(await database.fetchRecords([selectedName], { zoneID: zoneID }));
        selectedRecord = (fullResponse.records || []).find(function (record) { return record.recordName === selectedName; });
        if (selectedRecord) {
          selectedDocument = await documentFromCloudKitRecord(selectedRecord, session, database, zoneID);
          if (!accountSessionCurrent(session)) return;
          if (state.dirty || state.saveFlightCount > 0) {
            state.pendingRemoteRecords.set(selectedName, selectedRecord);
          } else {
            state.records.set(selectedName, selectedRecord);
            const bodyText = isNativeModelRecord(selectedRecord, "CapturedNote")
              ? selectedDocument.body
              : selectedDocument.title + "\n\n" + selectedDocument.body;
            rememberRecordBody(selectedName, bodyText, session);
            state.pendingRemoteRecords.delete(selectedName);
          }
        }
      }
      if (changedNames.size || deletedNames.size || selectedRecord) {
        syncDerivedCollections();
        if (selectedRecord && selectedDocument && !state.dirty && state.saveFlightCount === 0) {
          applyRemoteDocumentToActiveEditor(selectedRecord, selectedDocument);
        }
        renderAll();
        scheduleLibraryCacheWrite();
      }
      if (accountSessionCurrent(session)) setConnection("Using your Apple Account.", true);
    })().catch(function (error) {
      if (accountSessionCurrent(session)) {
        const message = readableError(error);
        setConnection("Connected · waiting to sync", false);
        console.warn("Arbor could not refresh notes from iCloud.", message);
      }
    }).finally(function () { state.realtimeSyncPromise = null; });
    return state.realtimeSyncPromise;
  }

  function startRealtimeSync(session) {
    window.clearInterval(state.realtimeSyncTimer);
    state.realtimeSyncTimer = null;
    if (!accountSessionCurrent(session) || !state.nativeZoneID) return;
    refreshZoneRecords(session);
    state.realtimeSyncTimer = window.setInterval(function () { refreshZoneRecords(session); }, 1500);
  }

  async function configureRealtimeNotifications(session) {
    const container = state.container;
    const database = state.database;
    if (!container || !database || typeof database.saveSubscriptions !== "function" ||
        typeof container.addNotificationListener !== "function" || typeof container.registerForNotifications !== "function") return;
    try {
      if (!state.realtimeNotificationListenerAdded) {
        container.addNotificationListener(function () {
          if (state.database && !state.accountCacheSuspended) refreshZoneRecords(state.accountSession);
        });
        state.realtimeNotificationListenerAdded = true;
      }
      const zone = state.nativeZoneID;
      if (!zone || !accountSessionCurrent(session)) return;
      const subscription = {
        subscriptionType: "zone",
        subscriptionID: "arbor-active-note-sync-v1",
        zoneID: { zoneName: zone.zoneName, ownerName: zone.ownerName }
      };
      assertResponse(await database.saveSubscriptions(subscription));
      if (!accountSessionCurrent(session)) return;
      await container.registerForNotifications();
    } catch (error) {
      // CloudKit notifications improve latency but are not required for sync;
      // the foreground change-token refresh remains the reliable fallback.
      console.info("Arbor is using foreground iCloud refresh for live updates.", readableError(error));
    }
  }

  function ensureFullNativeRecord(note) {
    if (typeof fieldValue(note.record, "text") === "string" || fieldValue(note.record, "text_ckAsset")) return Promise.resolve(note.record);
    if (note.recordPromise) return note.recordPromise;
    const session = state.accountSession;
    const database = state.database;
    if (!database) return Promise.resolve(note.record);
    note.recordPromise = database.fetchRecords([note.recordName], { zoneID: state.nativeZoneID }).then(function (response) {
      assertResponse(response);
      const fetched = (response.records || []).find(function (item) { return item.recordName === note.recordName; });
      if (!fetched) throw new Error("CloudKit could not find this note.");
      if (!accountSessionCurrent(session)) return note.record;
      note.record = fetched;
      state.records.set(fetched.recordName, fetched);
      if (state.selectedRecordName === note.recordName) state.selectedRecord = fetched;
      return fetched;
    }).finally(function () { note.recordPromise = null; });
    return note.recordPromise;
  }

  async function loadNativeTextAsset(note, session) {
    const record = await ensureFullNativeRecord(note);
    if (session != null && !accountSessionCurrent(session)) return "";
    const current = fieldValue(record, "text");
    if (typeof current === "string" && current.length) return current;
    const asset = fieldValue(record, "text_ckAsset");
    const url = asset && (asset.downloadURL || asset.url);
    if (!url) return typeof current === "string" ? current : "";
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not download this note’s text asset.");
    const body = await (await response.blob()).text();
    if (!record.fields) record.fields = {};
    record.fields.CD_text = field(body);
    return body;
  }

  function ensureNativeTextBody(note) {
    if (state.bodyCache.has(note.recordName)) {
      note.body = state.bodyCache.get(note.recordName); note.editorBody = note.body;
      return Promise.resolve(note.body);
    }
    if (note.bodyPromise) return note.bodyPromise;
    const session = state.accountSession;
    note.bodyPromise = loadNativeTextAsset(note, session).then(function (body) {
      if (!accountSessionCurrent(session)) return body;
      note.body = body; note.editorBody = body; note.preview = previewText(body);
      if (!fieldValue(note.record, "userTitle") && !fieldValue(note.record, "generatedTitle") && (!note.title || note.title === "Untitled")) note.title = firstLineTitle(body);
      rememberRecordBody(note.recordName, body, session);
      if (state.selectedRecordName === note.recordName) state.selectedRecord = note.record;
      return body;
    }).finally(function () { note.bodyPromise = null; });
    return note.bodyPromise;
  }

  function ensureWebTextBody(note) {
    if (!note || !state.database) return Promise.reject(new Error("This note is not connected to iCloud."));
    if (state.bodyCache.has(note.recordName)) {
      const cachedBody = state.bodyCache.get(note.recordName);
      rememberRecordBody(note.recordName, cachedBody, state.accountSession);
      return Promise.resolve(cachedBody);
    }
    if (typeof fieldValue(note.record, "body") === "string") {
      const body = String(fieldValue(note.record, "body"));
      rememberRecordBody(note.recordName, body, state.accountSession);
      return Promise.resolve(body);
    }
    if (note.bodyPromise) return note.bodyPromise;
    const session = state.accountSession;
    const zoneID = state.nativeZoneID || cloudKitWebZone.ARBOR_WEB_ZONE_ID;
    note.bodyPromise = state.database.fetchRecords([note.recordName], { zoneID: zoneID }).then(async function (response) {
      assertResponse(response);
      const fetched = (response.records || []).find(function (record) { return record.recordName === note.recordName; });
      if (!fetched) throw new Error("CloudKit could not find this note.");
      if (!accountSessionCurrent(session)) return "";
      note.record = fetched;
      state.records.set(fetched.recordName, fetched);
      if (state.selectedRecordName === note.recordName) state.selectedRecord = fetched;
      const body = fieldValue(fetched, "bodyStorageRaw") === "asset"
        ? await loadAssetBody(fetched)
        : String(fieldValue(fetched, "body") || "");
      if (!accountSessionCurrent(session)) return body;
      rememberRecordBody(note.recordName, body, session);
      return body;
    }).finally(function () { note.bodyPromise = null; });
    return note.bodyPromise;
  }

  async function hydrateInlineBodies() {
    const assets = state.notes.filter(function (note) {
      return fieldValue(note.record, "bodyStorageRaw") === "asset" && !note.body;
    });
    await Promise.all(assets.map(async function (note) {
      try {
        note.body = await loadAssetBody(note.record);
        const parts = splitDocument(note.body);
        note.editorBody = parts.body;
        note.title = parts.title;
        note.preview = previewText(parts.body);
      } catch (_) {
        note.preview = "Text stored as an asset could not be loaded.";
      }
    }));
  }

  async function connectUser(identity) {
    if (!identity) return;
    const signedInDuringWelcome = !$("welcome-screen").hidden && $("welcome-screen").dataset.step === "auth";
    const userID = String(identity.userRecordName || "").trim();
    if (state.database && state.connectionUserID === userID && !state.accountCacheSuspended) return;
    const session = ++state.accountSession;
    const keepCachedLibrary = state.paintedFromCache && state.connectionUserID === userID;
    if (!keepCachedLibrary) showWelcomeChecking();
    setWelcomeStatus("Preparing your private notes…", true);
    const accountPreparationSlowTimer = window.setTimeout(function () {
      if (session !== state.accountSession) return;
      setWelcomeStatus("Arbor is still preparing your private notes on this browser. Your notes will load from iCloud next; keep this page open.", true);
    }, NOTE_LOAD_SLOW_NOTICE_MS);
    let ready = false;
    try {
      await enqueueAccountPersistence(async function () {
        if (session !== state.accountSession) return;
        const cache = await loadAccountCache();
        if (session !== state.accountSession) return;
        if (!userID) {
          state.accountCacheSuspended = true;
          state.cacheKey = null;
        } else {
          const stored = cache.readStoredAccountRecordName(window.localStorage);
          if (cache.accountNeedsClear(stored, userID)) {
            const hadUnsaved = state.dirty || state.saveFlightCount > 0 || hasStoredDrafts();
            state.accountCacheSuspended = true;
            state.cacheKey = null;
            state.database = null;
            state.shortcutStorageKey = "";
            state.shortcutOperations = [];
            state.shortcutBindings = window.ArborShortcuts ? window.ArborShortcuts.resolveShortcutBindings([]) : [];
            state.shortcutSyncStatus = "Loading shortcut preferences…";
            state.shortcutSyncError = null;
            renderSettingsShortcuts();
            discardInMemoryLibrary();
            renderAll();
            await detachUndoHistory();
            if (session !== state.accountSession) return;
            await cache.clearAccountCaches(accountCacheEnvironment());
            if (hadUnsaved) showToast("Switched accounts. Unsaved edits on this browser were removed.", true);
            if (session !== state.accountSession) return;
          }
          cache.rememberAccountRecordName(window.localStorage, userID);
          state.accountCacheSuspended = false;
          state.cacheKey = libraryCacheKey(userID);
          state.shortcutStorageKey = shortcutPreferenceStorageKey(userID);
          state.shortcutOperations = keyboardShortcutPreferences
            ? keyboardShortcutPreferences.normalizeOperations(loadShortcutOperations(state.shortcutStorageKey))
            : [];
          state.shortcutBindings = window.ArborShortcuts
            ? window.ArborShortcuts.resolveShortcutBindings(state.shortcutOperations)
            : [];
          state.shortcutSyncStatus = "Loading shortcut preferences…";
          state.shortcutSyncError = null;
        }
        if (session !== state.accountSession) return;
        state.user = identity;
        state.connectionUserID = userID;
        loadNoteHistory(libraryCacheKey(userID));
        state.database = state.container.privateCloudDatabase;
        state.nativeSchema = config.schemaMode === "native";
        state.nativeZoneID = null;
        state.nativeZoneExists = false;
        ready = true;
      });
    } catch (error) {
      window.clearTimeout(accountPreparationSlowTimer);
      if (session !== state.accountSession) return;
      setConnection("Signed in · Sync needs attention", false);
      showApp();
      renderAll();
      showToast(readableError(error), true);
      return;
    }
    window.clearTimeout(accountPreparationSlowTimer);
    if (!ready || session !== state.accountSession) return;
    state.loadingRecords = true;
    state.libraryLoadSlow = false;
    state.libraryLoadSlowMessage = "";
    state.loadRecordsErrorMessage = "";
    setConnection("Preparing your private notes…", false);
    updateArborName();
    showApp();
    renderAll();
    let preparationSlowTimer = window.setTimeout(function () {
      if (session !== state.accountSession || !state.loadingRecords) return;
      state.libraryLoadSlow = true;
      state.libraryLoadSlowMessage = state.notes.length
        ? "Still preparing your notes on this browser. Notes already loaded remain available."
        : "Still preparing your notes on this browser. They will appear here as soon as they are ready.";
      setConnection("Still preparing your notes…", false);
      renderAll();
    }, NOTE_LOAD_SLOW_NOTICE_MS);
    loadEditQueue();
    try { await openUndoHistoryForAccount(state.cacheKey, false); }
    catch (_) { showToast("Undo history could not be loaded from this browser.", true); }
    if (session !== state.accountSession) return;
    try {
      const restored = await restoreLibraryCache();
      if (session !== state.accountSession) return;
      if (restored) {
        syncDerivedCollections(); renderAll();
        const restoredState = restoreOpenTabsForLoadedNotes();
        const paintedNote = keepCachedLibrary
          ? state.notes.find(function (item) { return item.recordName === state.selectedRecordName; })
          : null;
        if (state.preferences.tabsEnabled && restoredState.note) selectRestoredNote(restoredState.note);
        else if (restoredState.hidden) selectNote(null);
        else if (currentNoteFromHistory()) selectRestoredNote(currentNoteFromHistory());
        else if (paintedNote) selectRestoredNote(paintedNote);
        else selectNote(null);
        setConnection("Connected · refreshing notes…", true);
      } else setConnection("Loading your notes from iCloud…", false);
      if (session !== state.accountSession) return;
      window.clearTimeout(preparationSlowTimer);
      preparationSlowTimer = null;
      state.libraryLoadSlow = false;
      state.libraryLoadSlowMessage = "";
      if (!(await loadZoneRecordsWithFeedback(session))) return;
      if (session !== state.accountSession) return;
      flushPendingEdits();
      startRealtimeSync(session);
      configureRealtimeNotifications(session);
      await syncPersonalDictionary(session);
      await syncKeyboardShortcutPreferences(session);
      if (session !== state.accountSession) return;
      setConnection("Using your Apple Account.", true);
      if (state.notes.length) {
        markFirstRunComplete(userID);
        showApp();
      } else if (firstRunComplete(userID)) {
        showApp();
      } else {
        showWelcomeStep(signedInDuringWelcome ? "note" : "intro");
      }
    } catch (error) {
      if (session !== state.accountSession) return;
      window.clearTimeout(preparationSlowTimer);
      if (state.loadingRecords) {
        state.loadingRecords = false;
        state.libraryLoadSlow = false;
        state.libraryLoadSlowMessage = "";
        state.loadRecordsErrorMessage = readableError(error);
        renderAll();
        setListMessage(state.loadRecordsErrorMessage, true, true, true);
      }
      setConnection("Signed in · Sync needs attention", false);
      if (!state.notes.length && !state.loadingRecords) {
        setListMessage(readableError(error), true, true, true);
      }
      showToast(readableError(error), true);
    }
  }

  const NOTE_LOAD_SLOW_NOTICE_MS = 10_000;

  async function loadZoneRecordsWithFeedback(session) {
    const slowNoticeTimer = window.setTimeout(function () {
      if (!accountSessionCurrent(session) || !state.loadingRecords) return;
      state.libraryLoadSlow = true;
      state.libraryLoadSlowMessage = state.notes.length
        ? "Your loaded notes remain available while Arbor checks iCloud for updates. This is taking longer than usual."
        : "Still loading your notes from iCloud. This is taking longer than usual; Arbor will show them here as soon as they arrive.";
      setConnection(state.notes.length ? "Still checking iCloud for note updates…" : "Still loading your notes from iCloud…", false);
      renderAll();
    }, NOTE_LOAD_SLOW_NOTICE_MS);
    try {
      await loadZoneRecords(session);
      if (!accountSessionCurrent(session)) return false;
      state.libraryLoadSlow = false;
      state.libraryLoadSlowMessage = "";
      return true;
    } catch (error) {
      if (!accountSessionCurrent(session)) return false;
      if (error && !error.operation && state.libraryLoadOperation) error = withCloudKitOperation(error, state.libraryLoadOperation);
      state.loadingRecords = false;
      state.libraryLoadSlow = false;
      state.libraryLoadSlowMessage = "";
      state.libraryLoadOperation = "";
      state.loadRecordsErrorMessage = readableError(error);
      renderAll();
      setListMessage(state.loadRecordsErrorMessage, true, true, true);
      setConnection("Signed in · Sync needs attention", false);
      showToast(readableError(error), true);
      return false;
    } finally {
      window.clearTimeout(slowNoticeTimer);
    }
  }

  async function retryNoteLoad() {
    const session = state.accountSession;
    if (!accountSessionCurrent(session) || state.loadingRecords) return;
    setConnection("Refreshing notes…", false);
    if (!(await loadZoneRecordsWithFeedback(session))) return;
    if (session !== state.accountSession) return;
    await syncPersonalDictionary(session);
    await syncKeyboardShortcutPreferences(session);
    if (session === state.accountSession) setConnection("Using your Apple Account.", true);
  }

  const AUTH_RESTORE_TIMEOUT_MS = 15_000;
  const AUTH_RESTORE_SLOW_NOTICE_MS = 10_000;

  function showCachedSignInFailure(message) {
    setConnection("Couldn’t reach iCloud. Showing notes saved in this browser.", false);
    setListMessage(message, true, true, true);
    showApp();
  }

  function initializeCloudKit() {
    if (demoMode) {
      initializeDemo();
      return;
    }
    const token = String(config.apiToken || "");
    if (!config.containerIdentifier || !token || token.indexOf("PASTE_") === 0) {
      showSetup("Paste your CloudKit API token into app/cloudkit-config.js, save the file, and reload this page.");
      return;
    }
    if (!window.CloudKit) {
      const message = "Arbor couldn’t load Apple’s sign-in service. Check your connection, then reload.";
      if (state.paintedFromCache) showCachedSignInFailure(message);
      else {
        showWelcomeCheckError();
        setWelcomeStatus(message, false);
      }
      return;
    }
    try {
      if (window.ArborCloudKitWebServices && typeof window.ArborCloudKitWebServices.createCloudKitAuthTransport === "function") {
        state.arborCloudKitTransport = window.ArborCloudKitWebServices.createCloudKitAuthTransport({
          containerIdentifier: config.containerIdentifier
        });
      }
      CloudKit.configure({
        locale: "en-us",
        services: state.arborCloudKitTransport ? {
          authTokenStore: state.arborCloudKitTransport.authTokenStore,
          fetch: state.arborCloudKitTransport.fetch
        } : undefined,
        containers: [{
          containerIdentifier: config.containerIdentifier,
          apiTokenAuth: {
            apiToken: token,
            persist: true,
            signInButton: { id: "apple-sign-in-button", theme: "black" },
            signOutButton: { id: "apple-sign-out-button", theme: "black" }
          },
          environment: config.environment || "development"
        }]
      });
      state.container = CloudKit.getDefaultContainer();
      const cachedFailure = "Arbor couldn’t restore its iCloud session. Your browser may still be signed in to Apple. These notes are the unencrypted copy saved in this browser. Reload to try again.";
      if (state.paintedFromCache) setConnection("Checking your Apple Account…", false);
      else {
        setConnection("Checking your Apple Account session…", false);
        showWelcomeChecking();
      }
      let authRestoreSettled = false;
      const authRestoreSlowTimer = window.setTimeout(function () {
        if (authRestoreSettled || state.paintedFromCache) return;
        setWelcomeStatus("Still checking your Apple Account session. This is taking longer than usual; keep this page open.", true);
      }, AUTH_RESTORE_SLOW_NOTICE_MS);
      const authRestoreTimer = window.setTimeout(function () {
        if (authRestoreSettled) return;
        window.clearTimeout(authRestoreSlowTimer);
        setConnection("Sign-in needs attention", false);
        if (state.paintedFromCache) showCachedSignInFailure(cachedFailure);
        else showWelcomeCheckError();
      }, AUTH_RESTORE_TIMEOUT_MS);
      const finishAuthRestore = function () {
        authRestoreSettled = true;
        window.clearTimeout(authRestoreSlowTimer);
        window.clearTimeout(authRestoreTimer);
      };
      state.container.setUpAuth().then(function (identity) {
        finishAuthRestore();
        if (identity) connectUser(identity);
        else if (state.paintedFromCache) showCachedSignInFailure("This browser is not signed in to iCloud. These notes are the unencrypted copy saved in this browser. Reload to sign in again.");
        else {
          setConnection("Not connected", false);
          showWelcomeSignedOut();
        }
      }).catch(function () {
        finishAuthRestore();
        setConnection("Sign-in needs attention", false);
        if (state.paintedFromCache) showCachedSignInFailure(cachedFailure);
        else showWelcomeCheckError();
      });
      state.container.whenUserSignsIn().then(function (identity) {
        finishAuthRestore();
        connectUser(identity);
      });
      state.container.whenUserSignsOut().then(function () {
        const hadUnsaved = state.dirty || state.saveFlightCount > 0 || hasStoredDrafts() || state.editQueue.length > 0;
        const session = ++state.accountSession;
        const undoClose = detachUndoHistory();
        // Wipe unsaved-edit drafts right away. The queued cache delete below also
        // calls clearDrafts, which is safe to run twice.
        clearDrafts();
        state.accountCacheSuspended = true;
        state.cacheKey = null;
        state.database = null;
        updateUndoControls();
        state.connectionUserID = null;
        state.user = null;
        state.shortcutStorageKey = "";
        state.shortcutOperations = [];
        state.shortcutBindings = window.ArborShortcuts ? window.ArborShortcuts.resolveShortcutBindings([]) : [];
        state.shortcutRecordingId = "";
        state.shortcutSyncStatus = "Sign in to sync shortcuts with your Apple Account.";
        state.shortcutSyncError = null;
        renderSettingsShortcuts();
        state.noteHistory = { recordNames: [], index: -1 };
        state.noteHistoryAccountKey = "";
        state.nativeSchema = false;
        discardInMemoryLibrary();
        renderAll();
        updateArborName();
        setConnection("Not connected", false);
        showWelcomeSignedOut();
        if (hadUnsaved) showToast("Signed out. Unsaved edits on this browser were removed.", true);
        return enqueueAccountPersistence(function () {
          if (session !== state.accountSession) return;
          return Promise.resolve(undoClose).then(function () { return loadAccountCache(); }).then(function (cache) {
            if (session !== state.accountSession) return;
            return cache.clearAccountCaches(accountCacheEnvironment());
          });
        });
      });
      window.addEventListener("online", function () {
        if (state.database && !state.accountCacheSuspended) {
          flushPendingEdits();
          refreshZoneRecords(state.accountSession);
          syncPersonalDictionary(state.accountSession);
          syncKeyboardShortcutPreferences(state.accountSession);
        }
      });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible" && state.database && !state.accountCacheSuspended) {
          refreshZoneRecords(state.accountSession);
          syncPersonalDictionary(state.accountSession);
          syncKeyboardShortcutPreferences(state.accountSession);
        }
      });
      window.addEventListener("focus", function () {
        if (state.database && !state.accountCacheSuspended) {
          refreshZoneRecords(state.accountSession);
          syncKeyboardShortcutPreferences(state.accountSession);
        }
      });
      window.addEventListener("storage", function (event) {
        if (!keyboardShortcutPreferences || !event.key || event.key !== state.shortcutStorageKey || !state.connectionUserID || state.accountCacheSuspended) return;
        const operations = loadShortcutOperations(event.key);
        applyShortcutOperations(keyboardShortcutPreferences.mergeOperations(state.shortcutOperations, operations));
        syncKeyboardShortcutPreferences(state.accountSession);
      });
      if (!state.shortcutSyncTimer) {
        state.shortcutSyncTimer = window.setInterval(function () {
          if (document.visibilityState === "visible" && state.database && !state.accountCacheSuspended) {
            syncKeyboardShortcutPreferences(state.accountSession);
          }
        }, SHORTCUT_SYNC_INTERVAL_MS);
      }
    } catch (error) {
      showSetup("CloudKit could not be configured: " + readableError(error));
    }
  }

  function demoFolderRecord(path, index) {
    const now = new Date();
    const uuid = "DEMO-FOLDER-" + index;
    return {
      recordName: "Folder-" + uuid,
      recordType: "ArborFolder",
      fields: {
        folderUUID: field(uuid),
        relativePath: field(path),
        createdAt: field(now),
        modifiedAt: field(now),
        lastModifiedDeviceID: field("demo-device"),
        lastModifiedDeviceName: field("Sample preview"),
        schemaEpoch: field(1)
      }
    };
  }

  function demoNoteRecord(id, title, content, folderPath, daysAgo, hour) {
    const sampleNow = new Date();
    const modifiedAt = new Date(sampleNow);
    modifiedAt.setDate(modifiedAt.getDate() - daysAgo);
    modifiedAt.setHours(hour, 43, 0, 0);
    if (modifiedAt > sampleNow) modifiedAt.setTime(sampleNow.getTime());
    const createdAt = new Date(modifiedAt.getTime() - 45 * 60 * 1000);
    const body = title + "\n\n" + content;
    const filename = cleanFilenameStem(title) + ".md";
    return {
      recordName: "Demo-Note-" + id,
      recordType: "ArborNote",
      fields: {
        noteUUID: field("DEMO-NOTE-" + id),
        relativePath: field((folderPath ? folderPath + "/" : "") + filename),
        bodyStorageRaw: field("inline"),
        body: field(body),
        bodyAsset: field(null),
        contentFingerprint: field(""),
        previousContentFingerprint: field(null),
        contentVersion: field(1),
        previousContentVersion: field(null),
        createdAt: field(createdAt),
        modifiedAt: field(modifiedAt),
        archivedAt: field(null),
        isStarred: field(id === 1 ? 1 : 0),
        lastModifiedDeviceID: field("demo-device"),
        lastModifiedDeviceName: field("Sample preview"),
        schemaEpoch: field(1)
      }
    };
  }

  const LARGE_DEMO_NOTE_COUNT = 600;
  const LARGE_DEMO_SPEAKERS = ["Mara Vale", "Amara Flores", "Micah Chen", "Jonah Reed", "Elena Park", "Ruth Ellis"];
  const LARGE_DEMO_CONTEXTS = [
    "an evening walk", "the commute home", "a quiet lunch break", "a conversation after a meeting", "rereading an older journal page",
    "a Sunday discussion group", "the first week of a new routine", "a phone call with a friend", "a difficult decision at work", "a slower weekend morning",
    "a question I heard from someone else", "the end of a busy month", "a draft I almost deleted", "a long drive across town", "a conversation I wanted to revisit",
    "a day when I felt uncertain", "a small change in my plans", "a note I found while cleaning my desk", "a walk before breakfast", "a moment when I needed to ask for help",
    "a family dinner", "the afternoon after a hard week", "a project review with the team", "a book I was reading slowly", "a quiet moment before bed"
  ];
  const LARGE_DEMO_TOPICS = [
    { label: "Wisdom", folder: "Faith", first: "I used to think a wise choice was one I could defend with certainty.", next: "I am beginning to think careful action and honest questions can belong together.", quote: "Wisdom can leave room for a question while we take the next faithful step.", response: "I like that image, though I do not know yet when waiting becomes avoidance.", question: "When does asking for more certainty help, and when does it keep me from acting?", reference: "James 1:5" },
    { label: "Jesus", folder: "Faith", first: "I want to notice what the story says before I decide what I expected it to say.", next: "Reading slowly leaves me with questions I had missed when I rushed to the application.", quote: "Stay with the details of the story before turning it into a lesson.", response: "I am trying to separate what I read from what I brought with me.", question: "Which part of the passage am I seeing clearly, and which part am I filling in?", reference: "Mark 4:35–41" },
    { label: "Love", folder: "Faith", first: "I have sometimes treated love as agreement, even when I was unsure.", next: "I am trying to make room for care and honest disagreement in the same conversation.", quote: "A loving answer can be truthful without being hurried.", response: "I agree about taking time, but I do not want kindness to become a reason to avoid the truth.", question: "How can I disagree without reducing the other person to the disagreement?", reference: "1 Corinthians 13:4–7" },
    { label: "Bible reading", folder: "Faith", first: "I often look for a sentence to carry away before I understand the whole passage.", next: "Context changed what I thought a familiar line was doing in the conversation.", quote: "Notice who is speaking, who is listening, and what happened just before this.", response: "That makes me want to read the surrounding chapter before writing a conclusion.", question: "What changes when I read this passage alongside its surrounding story?", reference: "Luke 10:38–42" },
    { label: "Prayer", folder: "Faith", first: "Some days I wait for the right words before I begin to pray.", next: "A short, honest sentence felt more possible than trying to sound resolved.", quote: "Silence can be part of prayer; it does not have to be filled immediately.", response: "I want to remember this without turning it into a rule for every day.", question: "What am I able to say honestly right now, even if I have no conclusion?", reference: "Psalm 13" },
    { label: "Service", folder: "Faith", first: "I have offered help before asking what would actually be useful.", next: "Asking first made it clearer whether to bring something, listen, or give space.", quote: "Let the person asking describe what help would mean to them.", response: "My eagerness to help can make me stop listening too soon.", question: "What might change if I ask one more question before I volunteer?", reference: "Mark 10:45" },
    { label: "Courage", folder: "Faith", first: "I thought courage meant waiting until fear was gone.", next: "I said the difficult thing while still afraid, and I was able to stay kind.", quote: "Fear may still be present when someone chooses to act.", response: "I have heard that before, but I am not sure I live as if it is true.", question: "What is the next small step I could take without pretending to feel fearless?", reference: "Joshua 1:9" },
    { label: "Patience", folder: "Faith", first: "I used to think patience meant staying quiet until the problem passed.", next: "I can wait thoughtfully and still name what needs to change.", quote: "Waiting is not always the same as refusing to act.", response: "I am still learning how to tell the difference in my own choices.", question: "What am I waiting for, and what would make waiting wise here?", reference: "James 5:7–8" },
    { label: "Friendship", folder: "Relationships", first: "I have tried to be available every time a friend asked, even when I was worn out.", next: "A clear boundary made it easier for me to listen well when we did talk.", quote: "A dependable friendship can include an honest no and a real yes later.", response: "I still worry that a boundary will sound like rejection.", question: "How can I describe my limits while making the care in this friendship clear?", reference: null },
    { label: "Listening", folder: "Relationships", first: "I often prepared my reply while the other person was still talking.", next: "Repeating what I heard changed the conversation more than giving quick advice.", quote: "Check what you understood before deciding what the other person needs.", response: "I noticed how often I had been answering a different question.", question: "What could I ask to make sure I understand before I respond?", reference: null },
    { label: "Forgiveness", folder: "Relationships", first: "I have treated forgiveness as if it required pretending the hurt was small.", next: "I can name the harm honestly without deciding today what reconciliation requires.", quote: "Forgiveness and restored trust are related, but they are not the same decision.", response: "I want to remember that distinction before making promises for someone else.", question: "Which part of this situation is mine to decide, and which is not?", reference: null },
    { label: "Family", folder: "Relationships", first: "I sometimes assume my family knows what I meant because they know me well.", next: "A direct question cleared up more than another round of guessing.", quote: "Familiarity does not always make an unspoken expectation clear.", response: "I want to ask plainly instead of testing whether someone notices.", question: "What am I expecting them to infer that I could say directly?", reference: null },
    { label: "Grief", folder: "Relationships", first: "I expected grief to move forward in a straight line if I kept busy.", next: "A familiar song brought the loss back, and that did not erase the steadier days.", quote: "Missing someone can return without meaning that every earlier step disappeared.", response: "I felt relieved, though I do not want to turn that into a timetable.", question: "What kind of support feels useful today, without setting a deadline for grief?", reference: null },
    { label: "Home", folder: "Personal", first: "I thought home was mostly about having a place where nothing could interrupt me.", next: "Some of my best evenings at home included someone else changing the plan.", quote: "A home can make room for people to arrive unfinished.", response: "I like that, though I also need quiet sometimes.", question: "What balance of company and quiet makes this place feel like home?", reference: null },
    { label: "Leadership", folder: "Work", first: "I thought leading meant having an answer before the meeting began.", next: "I can lead by naming what we do not know and asking who has seen it directly.", quote: "Make room for the people closest to the evidence.", response: "That sounds right, but I still feel pressure to be decisive.", question: "What do I know firsthand, and what should I ask the team to clarify?", reference: null },
    { label: "Ambition", folder: "Work", first: "I thought ambition meant always choosing the larger opportunity.", next: "I turned one opportunity down to keep doing work I value.", quote: "Growth can include deciding what not to pursue.", response: "That gave me permission to ask what I want the work to make possible.", question: "What am I hoping this opportunity will make possible, and what might it cost?", reference: null },
    { label: "Collaboration", folder: "Work", first: "I assumed a good teammate would notice where I needed help.", next: "Naming the stuck point gave the team something concrete to solve together.", quote: "Make the work visible early enough for someone else to contribute.", response: "I had waited until I felt behind before saying anything.", question: "What part of this work could I share before it becomes urgent?", reference: null },
    { label: "Money", folder: "Work", first: "I thought a careful budget meant avoiding every surprise.", next: "Planning for what matters helped more than trying to predict every expense.", quote: "A budget should leave room for the life it is meant to support.", response: "I still want a safety margin, but I do not want fear to make every choice.", question: "What is this plan meant to support, beyond avoiding mistakes?", reference: null },
    { label: "Creativity", folder: "Learning", first: "I kept waiting for a clear idea before starting the draft.", next: "The first rough page often showed me what the idea actually was.", quote: "Make a small version before deciding what it means.", response: "I had treated the blank page like a test instead of a place to find out.", question: "What could I make in ten minutes that would help me learn what I think?", reference: null },
    { label: "Attention", folder: "Learning", first: "I kept telling myself I could listen while checking messages.", next: "When I put the phone away, I remembered more of what my friend said.", quote: "Attention can show another person that what they say matters.", response: "I want to notice whether I am present before I promise to help.", question: "What is pulling my attention away from the person or task in front of me?", reference: null },
    { label: "Discipline", folder: "Learning", first: "I treated discipline as following the exact schedule I made on Sunday.", next: "A smaller practice I can return to after a hard week is more useful than a perfect plan I abandon.", quote: "A routine should survive an ordinary difficult day.", response: "I want consistency, but I do not want to punish myself for being tired.", question: "What is the smallest version of this practice I can return to tomorrow?", reference: null },
    { label: "Failure", folder: "Learning", first: "I took the missed deadline as proof I was not suited for this work.", next: "The miss showed me where the plan was unrealistic, not what I can do forever.", quote: "A failed attempt describes an attempt, not a whole person.", response: "I want to believe that when I look at the unfinished project.", question: "What did this attempt teach me about the plan, without deciding everything about me?", reference: null },
    { label: "Curiosity", folder: "Learning", first: "I sometimes avoid basic questions because I think I should already know the answer.", next: "Asking the question showed that several people had made the same assumption.", quote: "A useful question can reveal where an explanation stopped working.", response: "I want to remember that before I mistake silence for understanding.", question: "What assumption could I check by asking the simple version of the question?", reference: null }
  ];

  function largeDemoNoteContent(topic, variant, speaker) {
    const context = LARGE_DEMO_CONTEXTS[variant % LARGE_DEMO_CONTEXTS.length];
    switch (variant % 5) {
      case 0:
        return "## Personal reflection\n" + topic.first + "\n\nI wrote this after " + context + ". I am keeping it because I want to see whether my answer changes as I live with the question. This is one moment in a longer story, not a final position.";
      case 1:
        return "## Talk notes\nSpeaker: " + speaker + "\nContext: " + context + ".\n\n“" + topic.quote + "”\n\n## My response\n" + topic.response + " This is what I wrote down afterward; the speaker's words and my response are separate.";
      case 2:
        return "## Returning to " + topic.label.toLowerCase() + "\n" + topic.next + "\n\nThis came back to me after " + context + ". I am comparing it with an earlier note rather than assuming that one sentence settles the subject. I may still change my mind.";
      case 3:
        return "## Open question\n" + topic.question + "\n\nI wrote this question after " + context + ". I do not have a settled answer yet. I want to keep the uncertainty visible instead of turning this question into a belief I have not claimed.";
      default:
        return "## Reading reference\n" + (topic.reference ? "Reference only: " + topic.reference + ". No verse text is copied into this note." : "Reading note for " + topic.label.toLowerCase() + ".") + "\n\nI saved this pointer after " + context + ". It does not record what the source says or claim that I agree with it.";
    }
  }

  function createLargeDemoNotes(existingCount) {
    const notes = [];
    const generatedCount = Math.max(0, LARGE_DEMO_NOTE_COUNT - existingCount);
    for (let index = 0; index < generatedCount; index += 1) {
      const topicIndex = index % LARGE_DEMO_TOPICS.length;
      const topic = LARGE_DEMO_TOPICS[topicIndex];
      const variant = Math.floor(index / LARGE_DEMO_TOPICS.length);
      const kind = ["reflection", "talk notes", "returning note", "open question", "reading reference"][variant % 5];
      const ordinal = String(variant + 1).padStart(2, "0");
      const title = topic.label + " — " + kind + " " + ordinal;
      const daysAgo = (index * 17 + topicIndex * 31) % 1460;
      const hour = (index * 7 + topicIndex * 3) % 24;
      const speaker = LARGE_DEMO_SPEAKERS[(topicIndex + variant) % LARGE_DEMO_SPEAKERS.length];
      notes.push(demoNoteRecord(existingCount + index + 1, title, largeDemoNoteContent(topic, variant, speaker), topic.folder, daysAgo, hour));
    }
    return notes;
  }

  function initializeDemo() {
    state.demo = true;
    state.largeDemo = largeDemoMode;
    state.dictionaryEntries = [];
    state.dictionaryPending = [];
    state.dictionarySyncStatus = "Preview only; dictionary changes are not synced.";
    state.dictionarySyncError = null;
    loadNoteHistory("sample-preview");
    state.user = { nameComponents: { givenName: "Noah" } };
    openUndoHistoryForAccount("sample-preview", true).catch(function () {});
    state.records = new Map();
    state.database = {
      saveRecords: async function (records) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          throw new Error("You are offline. This edit is still on this browser.");
        }
        const list = Array.isArray(records) ? records : [records];
        const saved = list.map(function (record) {
          const copy = cloneRecord(record);
          state.records.set(copy.recordName, copy);
          return copy;
        });
        return { records: saved };
      },
      deleteRecords: async function (recordNames) {
        (Array.isArray(recordNames) ? recordNames : [recordNames]).forEach(function (record) { state.records.delete(String(record && record.recordName || record)); });
        return { recordsDeleted: recordNames };
      }
    };

    ["Work", "Personal", "Home", "Home/Projects"].forEach(function (path, index) {
      const record = demoFolderRecord(path, index + 1);
      state.records.set(record.recordName, record);
    });

    const sampleNotes = [
      demoNoteRecord(1, "Demo Website — Product Knowledge", "A sample project note showing how a longer document reads in Arbor.\n\n## Purpose\nGive visitors the details they need in a calm, easy-to-scan place.\n\n## Sections\n- Welcome and overview\n- Schedule and location\n- Questions and useful links\n\n## Next step\nReview the mobile layout and trim anything that does not help a visitor.", "Home/Projects", 0, 20),
      demoNoteRecord(2, "Project Runway — Project Knowledge", "A fictional product brief for the preview library.\n\n## Goal\nMake the first version useful in a few quiet, dependable steps.\n\n## Notes\n- Keep the main action obvious.\n- Let people edit immediately.\n- Prefer clear defaults over setup work.", "Home/Projects", 4, 14),
      demoNoteRecord(3, "An Analysis on Ed Sheeran’s Composition", "A sample research note with a short observation and a few supporting points.\n\n## Observation\nSmall changes in rhythm and repetition can make a chorus feel familiar before the listener notices why.\n\n## Listen for\n- Repeated melodic shapes\n- Contrast between verse and chorus\n- How the arrangement builds over time", "Home/Projects", 6, 11),
      demoNoteRecord(4, "How the Apple Computer Changed the World", "A sample history note saved in a project folder.\n\nThe personal computer moved from specialist equipment into homes, schools, and creative work. Its biggest change was not a single machine, but making computing feel ordinary and useful.", "Home/Projects", 18, 9)
    ];
    if (largeDemoMode) {
      ["Faith", "Relationships", "Learning", "Reading"].forEach(function (path, index) {
        const existing = Array.from(state.records.values()).some(function (record) { return fieldValue(record, "relativePath") === path; });
        if (!existing) {
          const record = demoFolderRecord(path, index + 5);
          state.records.set(record.recordName, record);
        }
      });
      sampleNotes.push.apply(sampleNotes, createLargeDemoNotes(sampleNotes.length));
    }
    sampleNotes.forEach(function (record) { state.records.set(record.recordName, record); });

    state.selectedFolder = largeDemoMode ? "" : "Home/Projects";
    syncDerivedCollections();
    showApp();
    const authButtons = document.querySelector(".auth-buttons");
    if (authButtons) authButtons.hidden = true;
    const badge = $("demo-badge");
    if (badge) {
      badge.hidden = false;
      badge.textContent = largeDemoMode ? LARGE_DEMO_NOTE_COUNT + " fictional notes · resets on reload" : "Sample data · resets on reload";
    }
    setConnection(largeDemoMode ? LARGE_DEMO_NOTE_COUNT + " fictional notes · resets on reload" : "Sample data · resets on reload", false);
    renderAll();
    const first = noteSorting.sortNotes(state.notes.filter(function (note) { return !isArchived(note.record); }), state.preferences.noteSortOrder)[0];
    const restoredState = restoreOpenTabsForLoadedNotes();
    if (state.preferences.tabsEnabled && restoredState.note) selectNote(restoredState.note);
    else if (restoredState.hidden) selectNote(null);
    else if (currentNoteFromHistory()) selectNote(currentNoteFromHistory());
    else if (first) selectNote(first);
  }

  function currentEditorBodyMarkdown() {
    const selectedNote = state.notes.find(function (note) { return note.recordName === state.selectedRecordName; });
    if (!state.bodyDirty || !state.editor) {
      if (selectedNote && typeof selectedNote.editorBody === "string") return selectedNote.editorBody;
      const storedBody = state.nativeSchema
        ? fieldValue(state.selectedRecord, "text")
        : fieldValue(state.selectedRecord, "body");
      if (typeof storedBody !== "string") return "";
      return state.nativeSchema ? storedBody : splitDocument(storedBody).body;
    }
    return String(state.editor.getMarkdown() || "");
  }

  function currentMarkdown() {
    const title = $("note-title").value.trim() || "Untitled";
    const body = currentEditorBodyMarkdown();
    if (state.nativeSchema) return { title: title, body: body };
    return title + "\n\n" + body;
  }

  const DRAFT_STORAGE_KEY = "arbor.web.drafts.v1";

  function normalizedTitle(value) {
    const text = String(value || "").trim();
    return text || "Untitled";
  }

  function documentForSaveBody(body, record) {
    if (isNativeModelRecord(record, "CapturedNote")) {
      const source = body && typeof body === "object" ? body : splitDocument(body);
      return { title: normalizedTitle(source.title), body: String(source.body || "") };
    }
    return splitDocument(typeof body === "string" ? body : String(body && body.body || ""));
  }

  function saveBodyForDocument(document, record) {
    if (isNativeModelRecord(record, "CapturedNote")) return { title: document.title, body: document.body };
    return document.title + "\n\n" + document.body;
  }

  function rememberSyncBaseline(recordName, document) {
    if (!recordName || !document || typeof document.title !== "string" || typeof document.body !== "string") return;
    state.syncBaselines.set(recordName, { title: document.title, body: document.body });
  }

  async function documentFromCloudKitRecord(record, session, database, zoneID) {
    if (!record) throw new Error("CloudKit returned no current note version.");
    if (isNativeModelRecord(record, "CapturedNote")) {
      let body = fieldValue(record, "text");
      if (typeof body !== "string") {
        const asset = fieldValue(record, "text_ckAsset");
        const url = asset && (asset.downloadURL || asset.url);
        if (!url) throw new Error("The newer iCloud note text could not be loaded safely.");
        const response = await fetch(url);
        if (!response.ok) throw new Error("The newer iCloud note text could not be downloaded safely.");
        body = await (await response.blob()).text();
      }
      return {
        title: normalizedTitle(fieldValue(record, "userTitle") || fieldValue(record, "generatedTitle") || firstLineTitle(body)),
        body: body
      };
    }
    let body = fieldValue(record, "body");
    if (typeof body !== "string") {
      try { body = await loadAssetBody(record); }
      catch (_) { throw new Error("The newer iCloud note text could not be loaded safely."); }
    }
    return splitDocument(body);
  }

  async function fetchCurrentNoteRecord(record, historyContext) {
    const database = historyContext ? historyContext.database : state.database;
    const nativeSchema = historyContext ? historyContext.nativeSchema : state.nativeSchema;
    const zoneID = nativeSchema
      ? (historyContext ? historyContext.nativeZoneID : state.nativeZoneID)
      : cloudKitWebZone.ARBOR_WEB_ZONE_ID;
    const response = assertResponse(await database.fetchRecords([record.recordName], { zoneID: zoneID }));
    const current = (response.records || []).find(function (item) { return item.recordName === record.recordName; });
    if (!current) throw new Error("CloudKit could not find the newer version of this note.");
    return current;
  }

  async function retryConflictedNoteSave(record, body, options, historyContext, attempt, originalError) {
    if (attempt >= 2 || !isCloudKitRecordConflict(originalError)) throw originalError;
    const session = historyContext ? historyContext.session : state.accountSession;
    const current = await fetchCurrentNoteRecord(record, historyContext);
    const currentDocument = await documentFromCloudKitRecord(current, session,
      historyContext ? historyContext.database : state.database,
      historyContext ? historyContext.nativeZoneID : state.nativeZoneID);
    if (historyContext ? !historyContextCurrent(historyContext) : !accountSessionCurrent(session)) return current;
    const baseline = state.syncBaselines.get(record.recordName) || await documentFromCloudKitRecord(record, session,
      historyContext ? historyContext.database : state.database,
      historyContext ? historyContext.nativeZoneID : state.nativeZoneID);
    const localDocument = documentForSaveBody(body, record);
    const merged = noteSync.mergeDocument(baseline, localDocument, currentDocument);
    if (merged.conflict) {
      state.pendingRemoteRecords.set(record.recordName, current);
      const error = new Error("This note has overlapping edits on two devices. Arbor kept the newer iCloud copy and saved your edits as a local draft on this device.");
      error.arborPreservedDraft = true;
      throw error;
    }
    if (merged.merged.title === currentDocument.title && merged.merged.body === currentDocument.body) {
      if (!historyContext && accountSessionCurrent(session)) {
        state.records.set(record.recordName, current);
        if (state.saveFlightCount === 0) state.pendingRemoteRecords.delete(record.recordName);
        rememberSyncBaseline(record.recordName, currentDocument);
        syncDerivedCollections();
      }
      return current;
    }
    return saveRecord(current, saveBodyForDocument(merged.merged, current), options, historyContext, attempt + 1);
  }

  function draftAccountKey() {
    if (state.demo) return "demo";
    if (!state.connectionUserID) return "";
    return libraryCacheKey(state.connectionUserID);
  }

  function readDraftStore() {
    try {
      const value = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "null");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }

  function writeDraftStore(store) {
    try {
      if (!store || !Object.keys(store).length) localStorage.removeItem(DRAFT_STORAGE_KEY);
      else localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(store));
    } catch (_) {}
  }

  function hasStoredDrafts() {
    const store = readDraftStore();
    return Object.keys(store).some(function (key) {
      const bucket = store[key];
      return bucket && typeof bucket === "object" && Object.keys(bucket).length > 0;
    });
  }

  function editorDraftParts() {
    const titleField = $("note-title");
    const title = normalizedTitle(titleField ? titleField.value : "");
    const body = currentEditorBodyMarkdown();
    return { title: title, body: String(body || "") };
  }

  function writeDraft(recordName, parts) {
    const account = draftAccountKey();
    if (!account || !recordName || !parts) return;
    const store = readDraftStore();
    const bucket = store[account] && typeof store[account] === "object" ? store[account] : {};
    bucket[recordName] = {
      recordName: recordName,
      title: normalizedTitle(parts.title),
      body: String(parts.body || ""),
      updatedAt: Date.now()
    };
    store[account] = bucket;
    writeDraftStore(store);
  }

  function persistCurrentDraft() {
    if (!state.dirty || !state.selectedRecordName) return;
    writeDraft(state.selectedRecordName, editorDraftParts());
  }

  function persistDraftSnapshot(recordName, parts) {
    if (!recordName || !parts) return;
    if (state.selectedRecordName === recordName && state.dirty) return;
    writeDraft(recordName, parts);
  }

  function draftFor(recordName) {
    const account = draftAccountKey();
    if (!account || !recordName) return null;
    const bucket = readDraftStore()[account];
    const draft = bucket && bucket[recordName];
    if (!draft || typeof draft.body !== "string") return null;
    return draft;
  }

  function clearDraft(recordName) {
    const account = draftAccountKey();
    if (!account || !recordName) return;
    const store = readDraftStore();
    const bucket = store[account];
    if (!bucket || !bucket[recordName]) return;
    delete bucket[recordName];
    if (!Object.keys(bucket).length) delete store[account];
    writeDraftStore(store);
  }

  function editQueueStorageKey() {
    const account = state.connectionUserID || state.cacheKey || "";
    return launchLibrary ? launchLibrary.editQueueKey(account) : "arbor.web.pending-edit.";
  }

  function loadEditQueue() {
    if (!launchLibrary) { state.editQueue = []; return; }
    try {
      state.editQueue = launchLibrary.normalizeEditQueue(JSON.parse(localStorage.getItem(editQueueStorageKey()) || "null"));
    } catch (_) { state.editQueue = []; }
  }

  function storeEditQueue() {
    if (!launchLibrary) return;
    try {
      const key = editQueueStorageKey();
      if (!state.editQueue.length) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(state.editQueue));
    } catch (_) {}
  }

  function jsonSafeModifiedAt(value) {
    if (value instanceof Date) return value.toISOString();
    if (value == null) return "";
    if (typeof value === "object") return "";
    return String(value);
  }

  function baseDocumentForEdit(recordName, record) {
    const baseline = state.syncBaselines.get(recordName);
    if (baseline && typeof baseline.title === "string" && typeof baseline.body === "string") {
      return { title: baseline.title, body: baseline.body };
    }
    const cached = state.bodyCache.get(recordName);
    if (typeof cached !== "string") return { title: "", body: "" };
    if (record && isNativeModelRecord(record, "CapturedNote")) {
      return {
        title: normalizedTitle(fieldValue(record, "userTitle") || fieldValue(record, "generatedTitle") || firstLineTitle(cached)),
        body: cached
      };
    }
    return splitDocument(cached);
  }

  function captureEditBase(recordName) {
    const record = state.records.get(recordName) || (state.selectedRecordName === recordName ? state.selectedRecord : null);
    const documentValue = baseDocumentForEdit(recordName, record);
    return {
      recordChangeTag: String(record && record.recordChangeTag || ""),
      modifiedAt: jsonSafeModifiedAt(record ? fieldValue(record, "modifiedAt") : ""),
      contentFingerprint: String(record ? fieldValue(record, "contentFingerprint") || "" : ""),
      title: documentValue.title,
      body: documentValue.body
    };
  }

  function rememberPendingEdit(recordName, body) {
    if (!launchLibrary || !recordName || body == null) return;
    const documentValue = documentForSaveBody(body, state.records.get(recordName) || state.selectedRecord);
    const existing = state.editQueue.find(function (edit) { return edit.recordName === recordName; });
    const base = existing && existing.base ? existing.base : captureEditBase(recordName);
    state.editQueue = launchLibrary.upsertPendingEdit(state.editQueue, {
      recordName: recordName,
      title: documentValue.title,
      body: body,
      updatedAt: Date.now(),
      base: base
    });
    storeEditQueue();
    if (!base.contentFingerprint && (base.title || base.body)) {
      const stamp = base.recordChangeTag + "\n" + base.modifiedAt;
      fingerprint(base.title + "\n" + base.body).then(function (hash) {
        let changed = false;
        state.editQueue = state.editQueue.map(function (edit) {
          if (edit.recordName !== recordName || !edit.base) return edit;
          if (edit.base.contentFingerprint) return edit;
          if ((edit.base.recordChangeTag + "\n" + edit.base.modifiedAt) !== stamp) return edit;
          changed = true;
          return Object.assign({}, edit, { base: Object.assign({}, edit.base, { contentFingerprint: hash }) });
        });
        if (changed) storeEditQueue();
      }).catch(function () {});
    }
  }

  function pendingEditFor(recordName) {
    return state.editQueue.find(function (edit) { return edit.recordName === recordName; }) || null;
  }

  function rememberPendingEditBaseline(edit) {
    if (!edit || !edit.base || !edit.base.recordChangeTag) return;
    if (typeof edit.base.title !== "string" || typeof edit.base.body !== "string") return;
    rememberSyncBaseline(edit.recordName, { title: edit.base.title, body: edit.base.body });
  }

  function recordForPendingEdit(record, edit) {
    if (!record) return null;
    const base = edit && edit.base;
    if (!base || !base.recordChangeTag) return record.recordChangeTag ? null : record;
    const copy = cloneRecord(record);
    copy.recordChangeTag = base.recordChangeTag;
    if (base.modifiedAt) setField(copy, "modifiedAt", base.modifiedAt);
    if (base.contentFingerprint && (record.recordType === "ArborNote" || fieldValue(record, "contentFingerprint") != null)) {
      setField(copy, "contentFingerprint", base.contentFingerprint);
    }
    return copy;
  }

  function dropPendingEdit(recordName) {
    if (!launchLibrary || !recordName) return;
    state.editQueue = launchLibrary.removePendingEdit(state.editQueue, recordName);
    storeEditQueue();
  }

  function browserOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  function clearDrafts() {
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch (_) {}
    state.editQueue = [];
    try { localStorage.removeItem(editQueueStorageKey()); } catch (_) {}
    window.clearTimeout(state.saveTimer);
    state.saveGeneration += 1;
    state.dirty = false;
    state.bodyDirty = false;
    state.draftBaseline = null;
    hideDraftBanner();
  }

  function draftDiffers(draft, note) {
    return normalizedTitle(draft.title) !== normalizedTitle(note.title) ||
      String(draft.body || "") !== String(note.editorBody || "");
  }

  function revealRecoveredDraft(note) {
    hideDraftBanner();
    const draft = draftFor(note.recordName);
    if (!draft) return false;
    if (!draftDiffers(draft, note)) {
      clearDraft(note.recordName);
      return false;
    }
    state.draftBaseline = {
      recordName: note.recordName,
      title: note.title,
      body: note.body,
      editorBody: note.editorBody || ""
    };
    const title = normalizedTitle(draft.title);
    state.bodyDirty = String(draft.body || "") !== String(note.editorBody || "");
    note.title = title;
    note.body = draft.body;
    note.editorBody = draft.body;
    note.preview = previewText(draft.body);
    advanceSemanticRevision(note);
    $("note-title").value = title === "Untitled" ? "" : title;
    fitTitle();
    if (state.editor) { state.editor.destroy(); state.editor = null; }
    createEditor(draft.body);
    state.dirty = true;
    writeDraft(note.recordName, { title: title, body: draft.body });
    setSaveState("Unsaved", "dirty");
    showDraftBanner();
    window.clearTimeout(state.saveTimer);
    return true;
  }

  function discardRecoveredDraft() {
    const recordName = state.selectedRecordName;
    const baseline = state.draftBaseline;
    const discardedDraft = captureEditorHistorySnapshot();
    window.clearTimeout(state.saveTimer);
    state.saveGeneration += 1;
    state.dirty = false;
    state.bodyDirty = false;
    if (recordName) clearDraft(recordName);
    hideDraftBanner();
    state.draftBaseline = null;
    if (!baseline || baseline.recordName !== recordName) {
      setSaveState(state.demo ? "Preview only" : "Saved", "saved");
      return;
    }
    const note = state.notes.find(function (item) { return item.recordName === recordName; });
    if (note) {
      note.title = baseline.title;
      note.body = baseline.body;
      note.editorBody = baseline.editorBody;
      note.preview = previewText(baseline.editorBody);
      advanceSemanticRevision(note);
    }
    const title = normalizedTitle(baseline.title);
    $("note-title").value = title === "Untitled" ? "" : baseline.title;
    fitTitle();
    if (state.editor) { state.editor.destroy(); state.editor = null; }
    createEditor(baseline.editorBody || "");
    const restoredSnapshot = captureEditorHistorySnapshot();
    if (discardedDraft && restoredSnapshot && !sameEditorContent(discardedDraft, restoredSnapshot)) {
      recordUndoAction({
        kind: "editor", target: recordName, label: "Discard recovered draft",
        before: discardedDraft, after: restoredSnapshot, updatedAt: Date.now()
      });
    }
    setSaveState(state.demo ? "Preview only" : "Saved", "saved");
    renderNotes();
  }

  function scheduleSave(bodyChanged, historyOptions) {
    if (!state.selectedRecord) return;
    const history = historyOptions || {};
    const recordName = state.selectedRecordName;
    const pendingCreation = state.pendingNewNoteRecords.has(recordName);
    const nextEditorState = captureEditorHistorySnapshot({ editorBodyChanged: bodyChanged !== false });
    if (nextEditorState) {
      const previousEditorState = state.editorHistoryBaseline;
      if (pendingCreation && previousEditorState && !sameEditorContent(previousEditorState, nextEditorState)) {
        state.editorHistoryBaseline = nextEditorState;
        const pendingNavigation = state.pendingNewNoteNavigation.get(recordName);
        if (pendingNavigation && !pendingNavigation.historyRecorded) {
          recordNoteHistory(recordName);
          pendingNavigation.historyRecorded = true;
        }
      } else if (!state.replayingHistory && previousEditorState && !sameEditorContent(previousEditorState, nextEditorState)) {
        recordUndoAction({
          kind: "editor",
          target: nextEditorState.recordName,
          label: history.label || "Edit note",
          groupKey: Object.prototype.hasOwnProperty.call(history, "groupKey") ? history.groupKey : "editor:" + nextEditorState.recordName,
          before: previousEditorState,
          after: nextEditorState,
          updatedAt: Date.now()
        });
      }
      state.editorHistoryBaseline = nextEditorState;
    }
    state.dirty = true;
    if (bodyChanged !== false) state.bodyDirty = true;
    const note = state.notes.find(function (item) { return item.recordName === state.selectedRecordName; });
    if (note && state.editor) {
      note.title = normalizedTitle($("note-title").value);
      note.body = currentEditorBodyMarkdown();
      note.editorBody = note.body;
      note.preview = previewText(note.body);
      advanceSemanticRevision(note);
    }
    persistCurrentDraft();
    rememberPendingEdit(recordName, currentMarkdown());
    setSaveState(browserOffline() ? "Offline" : "Unsaved", "dirty");
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(function () { flushSave().catch(function () {}); }, 350);
    if (pendingCreation) renderNotes();
  }

  function setField(record, name, value) {
    const key = record && String(record.recordType || "").startsWith("CD_") ? "CD_" + name : name;
    record.fields[key] = field(value);
  }
  function setNullableField(record, name, value) {
    const key = record && String(record.recordType || "").startsWith("CD_") ? "CD_" + name : name;
    record.fields[key] = field(value === undefined ? null : value);
  }

  function saveToDatabase(records, historyContext) {
    const nativeSchema = historyContext ? historyContext.nativeSchema : state.nativeSchema;
    const database = historyContext ? historyContext.database : state.database;
    const zoneID = nativeSchema ? (historyContext ? historyContext.nativeZoneID : state.nativeZoneID) : cloudKitWebZone.ARBOR_WEB_ZONE_ID;
    return database.saveRecords(records, { zoneID: zoneID });
  }

  function fingerprint(body) {
    const bytes = new TextEncoder().encode(body);
    return crypto.subtle.digest("SHA-256", bytes).then(function (hash) {
      return Array.from(new Uint8Array(hash)).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    });
  }

  function cloneRecord(record) {
    const copy = Object.assign({}, record);
    copy.fields = Object.assign({}, record.fields || {});
    return copy;
  }

  function currentPathForTitle(title, recordName, previousPath) {
    const wasArchived = /^Archive\//i.test(previousPath);
    const cleaned = previousPath.replace(/^Archive\//i, "");
    const folder = parentPath(cleaned);
    const taken = new Set(state.notes.filter(function (note) {
      return note.recordName !== recordName && parentPath(note.path.replace(/^Archive\//i, "")) === folder;
    }).map(function (note) { return note.path.split("/").pop().toLowerCase(); }));
    const filename = uniqueFilename(title, taken);
    return (wasArchived ? "Archive/" : "") + (folder ? folder + "/" : "") + filename;
  }

  function cleanFilenameStem(title) {
    let value = String(title || "").replace(/[\/:\\\u0000-\u001f\u007f]/g, " ");
    value = value.split(/\s+/).filter(Boolean).join(" ");
    while (value.startsWith(".")) value = value.slice(1);
    value = value.trim() || "Untitled";
    let result = "";
    for (const character of value) {
      if (new TextEncoder().encode(result + character).length > 252) break;
      result += character;
    }
    return result.trim() || "Untitled";
  }

  function uniqueFilename(title, taken) {
    const stem = cleanFilenameStem(title);
    const base = stem + ".md";
    if (!taken.has(base.toLowerCase())) return base;
    let counter = 2;
    while (counter < 10000) {
      const suffix = " -" + counter;
      let shortStem = "";
      for (const character of stem) {
        if (new TextEncoder().encode(shortStem + character).length > 252 - suffix.length) break;
        shortStem += character;
      }
      const candidate = shortStem + suffix + ".md";
      if (!taken.has(candidate.toLowerCase())) return candidate;
      counter += 1;
    }
    return stem + "-" + Date.now() + ".md";
  }

  async function saveRecord(record, body, options, historyContext, mergeAttempt) {
    const opts = options || {};
    const attempt = Number(mergeAttempt) || 0;
    const session = historyContext ? historyContext.session : state.accountSession;
    const isCurrent = function () { return historyContext ? historyContextCurrent(historyContext) : accountSessionCurrent(session); };
    const next = cloneRecord(record);
    if (isNativeModelRecord(record, "CapturedNote")) {
      const now = new Date();
      const draft = body && typeof body === "object" ? body : splitDocument(body);
      const title = String(draft.title || "Untitled");
      const noteBody = String(draft.body || "");
      setField(next, "text", noteBody);
      const currentDisplayTitle = String(fieldValue(record, "userTitle") || fieldValue(record, "generatedTitle") || firstLineTitle(fieldValue(record, "text")));
      if (title !== currentDisplayTitle) setField(next, "userTitle", title);
      if (Object.prototype.hasOwnProperty.call(opts, "userTitle")) setNullableField(next, "userTitle", opts.userTitle);
      setField(next, "modifiedAt", now);
      if (Object.prototype.hasOwnProperty.call(opts, "folderID")) setNullableField(next, "folderID", opts.folderID);
      if (historyContext) assertHistoryContext(historyContext);
      let response;
      try { response = assertResponse(await saveToDatabase(next, historyContext)); }
      catch (error) { return retryConflictedNoteSave(record, body, opts, historyContext, attempt, error); }
      const saved = response.records && response.records[0] ? response.records[0] : next;
      if (!isCurrent()) return saved;
      state.records.set(saved.recordName, saved);
      if (state.saveFlightCount === 0) state.pendingRemoteRecords.delete(saved.recordName);
      rememberSyncBaseline(saved.recordName, documentForSaveBody(body, saved));
      syncDerivedCollections();
      return saved;
    }
    const oldBodyFingerprint = String(fieldValue(record, "contentFingerprint") || "");
    const nextFingerprint = await fingerprint(body);
    const bodyChanged = oldBodyFingerprint !== nextFingerprint;
    const oldVersion = Number(fieldValue(record, "contentVersion") || 1);
    const now = new Date();
    const split = splitDocument(body);
    const oldPath = recordPath(record);
    const nextPath = opts.relativePath || currentPathForTitle(split.title, record.recordName, oldPath);
    const isAsset = new TextEncoder().encode(body).length > 262144;

    setField(next, "relativePath", nextPath);
    setField(next, "modifiedAt", now);
    setField(next, "bodyStorageRaw", isAsset ? "asset" : "inline");
    setField(next, "contentFingerprint", nextFingerprint);
    setField(next, "lastModifiedDeviceID", state.deviceID);
    setField(next, "lastModifiedDeviceName", "Arbor Web");
    setField(next, "schemaEpoch", 1);
    if (bodyChanged) {
      setNullableField(next, "previousContentFingerprint", oldBodyFingerprint || null);
      setField(next, "contentVersion", oldVersion + 1);
      setNullableField(next, "previousContentVersion", oldVersion);
    }
    if (isAsset) {
      setField(next, "body", null);
      setField(next, "bodyAsset", new Blob([body], { type: "text/markdown;charset=utf-8" }));
    } else {
      setField(next, "body", body);
      setField(next, "bodyAsset", null);
    }

    if (historyContext) assertHistoryContext(historyContext);
    let response;
    try { response = assertResponse(await saveToDatabase(next, historyContext)); }
    catch (error) { return retryConflictedNoteSave(record, body, opts, historyContext, attempt, error); }
    const saved = response.records && response.records[0] ? response.records[0] : next;
    if (!isCurrent()) return saved;
    state.records.set(saved.recordName, saved);
    if (state.saveFlightCount === 0) state.pendingRemoteRecords.delete(saved.recordName);
    rememberSyncBaseline(saved.recordName, documentForSaveBody(body, saved));
    syncDerivedCollections();
    return saved;
  }

  async function flushPendingEdits() {
    if (browserOffline() || !state.database || !state.editQueue.length) return;
    const pending = state.editQueue.slice();
    for (let index = 0; index < pending.length; index += 1) {
      const edit = pending[index];
      if (state.selectedRecordName === edit.recordName && state.dirty) {
        await flushSave();
        continue;
      }
      const record = state.records.get(edit.recordName);
      if (!record) continue;
      const based = recordForPendingEdit(record, edit);
      if (!based) {
        if (state.selectedRecordName === edit.recordName) {
          setSaveState("Needs attention", "error");
          showToast("This note changed in iCloud. Arbor kept your edits on this browser.", true);
        }
        continue;
      }
      try {
        if (state.selectedRecordName === edit.recordName) setSaveState("Saving…", "saving");
        rememberPendingEditBaseline(edit);
        await saveRecord(based, edit.body);
        dropPendingEdit(edit.recordName);
        clearDraft(edit.recordName);
        rememberRecordBody(edit.recordName, typeof edit.body === "string" ? edit.body : edit.body.title + "\n\n" + edit.body.body, state.accountSession);
        if (state.selectedRecordName === edit.recordName && !state.dirty) setSaveState("Saved", "saved");
      } catch (error) {
        if (launchLibrary && launchLibrary.isNetworkSaveFailure(error) || browserOffline()) {
          if (state.selectedRecordName === edit.recordName) setSaveState("Offline", "dirty");
          return;
        }
        if (error && error.arborPreservedDraft || isCloudKitRecordConflict(error)) {
          if (state.selectedRecordName === edit.recordName) setSaveState("Needs attention", "error");
          showToast(readableError(error), true);
          continue;
        }
        if (state.selectedRecordName === edit.recordName) setSaveState("Save failed", "error");
      }
    }
  }

  async function flushSave() {
    window.clearTimeout(state.saveTimer);
    if (browserOffline()) {
      if (state.dirty && state.selectedRecordName) rememberPendingEdit(state.selectedRecordName, currentMarkdown());
      if (state.dirty || state.editQueue.length) setSaveState("Offline", "dirty");
      return state.savePromise.catch(function () {});
    }
    if (!state.dirty || !state.selectedRecord || !state.database) return state.savePromise.catch(function () {});
    const recordName = state.selectedRecordName;
    const recordSnapshot = state.selectedRecord;
    const queuedEdit = pendingEditFor(recordName);
    const basedRecord = recordForPendingEdit(state.records.get(recordName) || recordSnapshot, queuedEdit);
    if (!basedRecord) {
      setSaveState("Needs attention", "error");
      showToast("This note changed in iCloud. Arbor kept your edits on this browser.", true);
      return state.savePromise.catch(function () {});
    }
    const body = currentMarkdown();
    const isFirstSaveForNewNote = state.pendingNewNoteRecords.has(recordName);
    const session = state.accountSession;
    const parts = editorDraftParts();
    const generation = state.saveGeneration;
    const superseded = function () { return generation !== state.saveGeneration || !accountSessionCurrent(session); };
    state.dirty = false;
    state.saveFlightCount += 1;
    setSaveState("Saving…", "saving");
    state.savePromise = state.savePromise.catch(function () {}).then(async function () {
      try {
        if (generation !== state.saveGeneration) return;
        const selectedNote = state.notes.find(function (note) { return note.recordName === recordName; });
        if (state.nativeSchema && selectedNote) await ensureFullNativeRecord(selectedNote);
        if (superseded()) return;
        const latest = recordForPendingEdit(state.records.get(recordName) || recordSnapshot, pendingEditFor(recordName)) || basedRecord;
        rememberPendingEditBaseline(pendingEditFor(recordName));
        const submittedDocument = documentForSaveBody(body, latest);
        const saved = await saveRecord(latest, body);
        if (superseded()) return;
        const savedDocument = state.syncBaselines.get(recordName) || submittedDocument;
        if (body && typeof body === "object") {
          rememberRecordBody(recordName, state.nativeSchema ? savedDocument.body : savedDocument.title + "\n\n" + savedDocument.body, session);
        }
        let newerEdit = state.selectedRecordName === recordName && state.dirty;
        if (state.selectedRecordName === recordName && !newerEdit && !sameSyncDocument(submittedDocument, savedDocument)) {
          replaceActiveEditorDocument(recordName, savedDocument);
        } else if (newerEdit && !sameSyncDocument(submittedDocument, savedDocument)) {
          const currentDocument = editorDraftParts();
          const combined = noteSync.mergeDocument(submittedDocument, currentDocument, savedDocument);
          if (!combined.conflict) {
            replaceActiveEditorDocument(recordName, combined.merged);
            state.dirty = true;
            state.bodyDirty = combined.merged.body !== savedDocument.body;
            state.editorHistoryBaseline = captureEditorHistorySnapshot({ editorBodyChanged: true });
            rememberSyncBaseline(recordName, savedDocument);
            persistCurrentDraft();
            setSaveState("Unsaved", "dirty");
            window.clearTimeout(state.saveTimer);
            state.saveTimer = window.setTimeout(function () { flushSave().catch(function () {}); }, 350);
          } else {
            rememberSyncBaseline(recordName, submittedDocument);
            state.pendingRemoteRecords.set(recordName, saved);
            persistCurrentDraft();
            showToast("A later edit overlaps with a change from another device. Arbor saved the earlier merge to iCloud and kept your latest text as a local draft.", true);
            setSaveState("Needs attention", "error");
          }
          newerEdit = true;
        }
        if (isFirstSaveForNewNote) {
          state.pendingNewNoteRecords.delete(recordName);
          const pendingNavigation = state.pendingNewNoteNavigation.get(recordName) || {};
          state.pendingNewNoteNavigation.delete(recordName);
          const content = { title: normalizedTitle(parts.title), body: String(parts.body || ""), userTitle: normalizedTitle(parts.title) };
          recordUndoAction({
            kind: "created-record", target: recordName, label: "Create note",
            record: cloneRecord(saved), content: content,
            signature: creationSignature(saved, content),
            navigationBefore: pendingNavigation.navigationBefore || { note: null, folder: state.selectedFolder, archive: false },
            navigationAfter: { note: recordName, folder: state.selectedFolder, archive: false },
            updatedAt: Date.now()
          });
          if (newerEdit) {
            const latestEditorState = captureEditorHistorySnapshot({ editorBodyChanged: true });
            const savedEditorState = Object.assign({}, latestEditorState || {}, {
              recordName: recordName, title: content.title, body: content.body
            });
            if (latestEditorState && !sameEditorContent(savedEditorState, latestEditorState)) {
              recordUndoAction({
                kind: "editor", target: recordName, label: "Edit note",
                groupKey: "editor:" + recordName,
                before: savedEditorState, after: latestEditorState, updatedAt: Date.now()
              });
            }
            if (latestEditorState) state.editorHistoryBaseline = latestEditorState;
          }
          scheduleLibraryCacheWrite();
        }
        if (!newerEdit) {
          clearDraft(recordName);
          dropPendingEdit(recordName);
        }
        if (state.selectedRecordName === recordName) {
          state.selectedRecord = saved;
          if (!newerEdit) state.bodyDirty = false;
          const updated = state.notes.find(function (note) { return note.recordName === recordName; });
          if (updated) {
            advanceSemanticRevision(updated);
            renderNoteDate(updated);
          }
          if (!state.dirty) {
            hideDraftBanner();
            state.draftBaseline = null;
            setSaveState(state.demo ? "Preview only" : "Saved", "saved");
          }
          renderAll();
        }
      } catch (error) {
        if (superseded()) return;
        const newerEdit = state.selectedRecordName === recordName && state.dirty;
        if (!newerEdit) persistDraftSnapshot(recordName, parts);
        if (state.selectedRecordName === recordName) {
          state.dirty = true;
          const networkFailure = launchLibrary && launchLibrary.isNetworkSaveFailure(error);
          const conflict = Boolean(error && error.arborPreservedDraft) || isCloudKitRecordConflict(error);
          setSaveState(networkFailure ? "Offline" : conflict ? "Needs attention" : "Save failed", networkFailure ? "dirty" : "error");
        }
        showToast(readableError(error), true);
        throw error;
      } finally {
        state.saveFlightCount = Math.max(0, state.saveFlightCount - 1);
        if (state.saveFlightCount === 0 && state.pendingRemoteRecords.has(recordName) && accountSessionCurrent(session)) {
          window.setTimeout(function () { refreshZoneRecords(session); }, 0);
        }
      }
    });
    try { await state.savePromise; } catch (_) {}
    return state.savePromise;
  }

  function makeNewNoteRecord(id, body, folderPath) {
    const now = new Date();
    const title = splitDocument(body).title;
    const path = (folderPath ? folderPath + "/" : "") + uniqueFilename(title, new Set());
    return {
      recordName: "Note-" + id,
      recordType: "ArborNote",
      fields: {
        noteUUID: field(id),
        relativePath: field(path),
        bodyStorageRaw: field("inline"),
        body: field(body),
        bodyAsset: field(null),
        contentFingerprint: field(""),
        previousContentFingerprint: field(null),
        contentVersion: field(1),
        previousContentVersion: field(null),
        createdAt: field(now),
        modifiedAt: field(now),
        archivedAt: field(null),
        isStarred: field(0),
        lastModifiedDeviceID: field(state.deviceID),
        lastModifiedDeviceName: field("Arbor Web"),
        schemaEpoch: field(1)
      }
    };
  }

  async function createPendingBlankNote() {
    if (!state.database) { showToast("Sign in with Apple before creating notes.", true); return; }
    if (!state.demo && !state.nativeZoneExists) { showToast("Arbor is still connecting to iCloud. Try again when the library has finished loading.", true); return; }
    const session = state.accountSession;
    const navigationBefore = navigationSnapshot();
    try {
      await flushSave();
      if (!accountSessionCurrent(session)) return;
      const id = crypto.randomUUID().toUpperCase();
      const recordName = state.nativeSchema ? "CD_CapturedNote_" + id : "Note-" + id;
      let record;
      if (state.nativeSchema) {
        const folder = state.folders.find(function (item) { return item.path === state.selectedFolder; });
        record = {
          recordName: recordName,
          recordType: "CD_CapturedNote",
          fields: {
            CD_entityName: field("CapturedNote"), CD_id: field(id), CD_text: field(""),
            CD_derivedAssociations: field(""), CD_userTitle: field("Untitled"),
            CD_createdAt: field(new Date()), CD_modifiedAt: field(new Date())
          }
        };
        if (folder) record.fields.CD_folderID = field(folder.uuid);
      } else {
        record = makeNewNoteRecord(id, "Untitled\n\n", state.selectedFolder);
      }
      state.records.set(recordName, record);
      state.pendingNewNoteRecords.add(recordName);
      state.pendingNewNoteNavigation.set(recordName, { navigationBefore: navigationBefore, historyRecorded: false });
      syncDerivedCollections();
      state.skipNextListTransition = true;
      renderAll();
      const opened = await openNote(recordName, { tabIntent: "new", skipHistory: true });
      if (!opened || !accountSessionCurrent(session)) return;
      const body = $("note-body");
      if (!body) return;
      body.focus({ preventScroll: true });
      const range = document.createRange(); range.selectNodeContents(body); range.collapse(false);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    } catch (error) {
      showToast(readableError(error), true);
    }
  }

  async function createNote(initialBody, focusBody, initialTitle) {
    if (!state.database) { showToast("Sign in with Apple before creating notes.", true); return false; }
    if (!state.demo && !state.nativeZoneExists) { showToast("Arbor is still connecting to iCloud. Try again when the library has finished loading.", true); return false; }
    const session = state.accountSession;
    const navigationBefore = navigationSnapshot();
    try {
      await flushSave();
      const id = crypto.randomUUID().toUpperCase();
      const noteTitle = String(initialTitle || "Untitled").trim().slice(0, 180) || "Untitled";
      const noteBody = String(initialBody || "");
      const legacyBody = noteTitle + "\n\n" + noteBody;
      let record;
      if (state.nativeSchema) {
        const folder = state.folders.find(function (item) { return item.path === state.selectedFolder; });
        record = {
          recordName: "CD_CapturedNote_" + id,
          recordType: "CD_CapturedNote",
          fields: {
            CD_entityName: field("CapturedNote"),
            CD_id: field(id),
            CD_text: field(noteBody),
            CD_derivedAssociations: field(""),
            CD_userTitle: field(noteTitle),
            CD_createdAt: field(new Date()),
            CD_modifiedAt: field(new Date())
          }
        };
        if (folder) record.fields.CD_folderID = field(folder.uuid);
      } else {
        record = makeNewNoteRecord(id, legacyBody, state.selectedFolder);
        setField(record, "contentFingerprint", await fingerprint(legacyBody));
      }
      const response = assertResponse(await saveToDatabase(record));
      if (!accountSessionCurrent(session)) return false;
      const saved = response.records && response.records[0] ? response.records[0] : record;
      state.records.set(saved.recordName, saved);
      syncDerivedCollections();
      const content = { title: noteTitle, body: noteBody, userTitle: noteTitle };
      recordUndoAction({
        kind: "created-record", target: saved.recordName, label: "Create note",
        record: cloneRecord(saved), content: content,
        signature: creationSignature(saved, content),
        navigationBefore: navigationBefore,
        navigationAfter: { note: saved.recordName, folder: state.selectedFolder, archive: false },
        updatedAt: Date.now()
      });
      state.skipNextListTransition = true;
      renderAll();
      const opened = await openNote(saved.recordName, { tabIntent: "new" });
      if (!opened) return false;
      if (!accountSessionCurrent(session)) return false;
      if (focusBody) {
        const body = $("note-body"); body.focus();
        const range = document.createRange(); range.selectNodeContents(body); range.collapse(false);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      } else {
        $("note-title").focus(); $("note-title").select();
      }
      return true;
    } catch (error) {
      showToast(readableError(error), true);
      return false;
    }
  }

  function cleanFolderName(name) {
    return String(name || "").replace(/[\/:\\\u0000-\u001f\u007f]/g, " ").split(/\s+/).filter(Boolean).join(" ").replace(/^\.+/, "").trim().slice(0, 120);
  }

  function uniqueFolderName(name, taken) {
    if (!taken.has(name.toLocaleLowerCase())) return name;
    let index = 2;
    while (taken.has((name + " -" + index).toLocaleLowerCase())) index += 1;
    return name + " -" + index;
  }

  async function createFolder(parentOverride) {
    if (!state.database) { showToast("Sign in with Apple before creating folders.", true); return; }
    if (!state.demo && !state.nativeZoneExists) { showToast("Arbor is still connecting to iCloud. Try again when the library has finished loading.", true); return; }
    const session = state.accountSession;
    const navigationBefore = navigationSnapshot();
    const parent = typeof parentOverride === "string" ? parentOverride : state.selectedFolder;
    const response = window.prompt(parent ? "Name this folder inside " + parent : "Name this folder");
    if (response === null) return;
    const label = cleanFolderName(response);
    if (!label) { showToast("Enter a folder name.", true); return; }
    const taken = new Set(state.folders.filter(function (folder) { return parentPath(folder.path) === parent; }).map(function (folder) { return folder.path.split("/").pop().toLowerCase(); }));
    const name = uniqueFolderName(label, taken);
    const path = parent ? parent + "/" + name : name;
    const uuid = crypto.randomUUID().toUpperCase();
    const now = new Date();
    const parentFolder = state.folders.find(function (folder) { return folder.path === parent; });
    const record = state.nativeSchema ? {
      recordName: "CD_NoteFolder_" + uuid,
      recordType: "CD_NoteFolder",
      fields: {
        CD_entityName: field("NoteFolder"),
        CD_id: field(uuid),
        CD_name: field(name),
        CD_createdAt: field(now)
      }
    } : {
      recordName: "Folder-" + uuid,
      recordType: "ArborFolder",
      fields: {
        folderUUID: field(uuid),
        relativePath: field(path),
        createdAt: field(now),
        modifiedAt: field(now),
        lastModifiedDeviceID: field(state.deviceID),
        lastModifiedDeviceName: field("Arbor Web"),
        schemaEpoch: field(1)
      }
    };
    if (state.nativeSchema && parentFolder) record.fields.CD_parentID = field(parentFolder.uuid);
    try {
      const savedResponse = assertResponse(await saveToDatabase(record));
      if (!accountSessionCurrent(session)) return;
      const saved = savedResponse.records && savedResponse.records[0] ? savedResponse.records[0] : record;
      state.records.set(saved.recordName, saved);
      syncDerivedCollections();
      state.selectedFolder = path;
      renderAll();
      recordUndoAction({
        kind: "created-record", target: saved.recordName, label: "Create folder",
        record: cloneRecord(saved), content: null,
        signature: creationSignature(saved, null),
        navigationBefore: navigationBefore,
        navigationAfter: navigationSnapshot(),
        updatedAt: Date.now()
      });
      showToast("Folder created.");
    } catch (error) {
      showToast(readableError(error), true);
    }
  }

  function folderPathIsWithin(path, root) {
    return path === root || path.indexOf(root + "/") === 0;
  }

  function folderSubtreePaths(root) {
    return state.folders.filter(function (folder) { return folderPathIsWithin(folder.path, root); })
      .map(function (folder) { return folder.path; })
      .sort(function (left, right) { return left.split("/").length - right.split("/").length || left.localeCompare(right); });
  }

  function rebaseFolderPath(path, source, destination) {
    const value = String(path || "");
    const archived = /^Archive\//i.test(value);
    const relative = archived ? value.slice("Archive/".length) : value;
    if (!folderPathIsWithin(relative, source)) return null;
    return (archived ? "Archive/" : "") + destination + relative.slice(source.length);
  }

  function folderPatchRecord(record, names, values) {
    const next = cloneRecord(record);
    names.forEach(function (name) { setNullableField(next, name, values[name]); });
    return next;
  }

  function uniqueDestinationPath(parent, leaf, excludedRoot) {
    const taken = new Set(state.folders.filter(function (folder) {
      return folder.path !== excludedRoot && !folderPathIsWithin(folder.path, excludedRoot) && parentPath(folder.path) === parent;
    }).map(function (folder) { return folder.path.split("/").pop().toLocaleLowerCase(); }));
    const unique = uniqueFolderName(leaf, taken);
    return parent ? parent + "/" + unique : unique;
  }

  function uniqueMovedNotePaths(notes, movingNames, source, destination, archiveUnfiled) {
    const moving = new Set(movingNames);
    const occupied = new Set();
    state.notes.forEach(function (note) {
      if (moving.has(note.recordName)) return;
      occupied.add(note.path.toLocaleLowerCase());
    });
    const result = new Map();
    notes.forEach(function (note) {
      let candidate;
      if (archiveUnfiled) candidate = "Archive/" + note.path.split("/").pop();
      else candidate = rebaseFolderPath(note.path, source, destination);
      if (!candidate) return;
      const archived = /^Archive\//i.test(candidate);
      const relative = archived ? candidate.slice("Archive/".length) : candidate;
      const parent = parentPath(relative);
      const taken = new Set();
      occupied.forEach(function (path) {
        const normalized = path.replace(/^archive\//i, "");
        if (parentPath(normalized) === parent && /^archive\//i.test(path) === archived) taken.add(normalized.split("/").pop());
      });
      const unique = uniqueFilename(relative.split("/").pop().replace(/\.md$/i, ""), taken);
      const nextPath = (archived ? "Archive/" : "") + (parent ? parent + "/" : "") + unique;
      const next = nextPath.toLocaleLowerCase();
      occupied.add(next);
      result.set(note.recordName, nextPath);
    });
    return result;
  }

  function makeFolderChangeAction(label, targetPath, updates, deletedRecords, navigationBefore, navigationAfter, preferencesBefore, preferencesAfter) {
    return {
      kind: "folder-change",
      target: "folder-tree:" + String(targetPath || (updates[0] && updates[0].record.recordName) || Date.now()),
      label: label,
      patches: updates.map(function (update) {
        return {
          recordName: update.record.recordName,
          fields: update.fields.slice(),
          before: patchForRecord(update.beforeRecord, update.fields),
          after: patchForRecord(update.record, update.fields)
        };
      }),
      deletedRecords: (deletedRecords || []).map(cloneRecord),
      navigationBefore: navigationBefore,
      navigationAfter: navigationAfter,
      preferencesBefore: preferencesBefore || null,
      preferencesAfter: preferencesAfter || null,
      updatedAt: Date.now()
    };
  }

  async function commitFolderMutation(label, targetPath, updates, deletedRecords, navigationBefore, navigationAfter, preferencesBefore, preferencesAfter) {
    const session = state.accountSession;
    await flushSave();
    if (!accountSessionCurrent(session)) return false;
    const savedUpdates = [];
    try {
      if (updates.length) {
        const response = assertResponse(await saveToDatabase(updates.map(function (update) { return update.record; })));
        if (!accountSessionCurrent(session)) return false;
        const savedByName = new Map((response.records || []).map(function (record) { return [record.recordName, record]; }));
        updates.forEach(function (update) {
          const saved = savedByName.get(update.record.recordName) || update.record;
          savedUpdates.push({ record: saved, beforeRecord: update.beforeRecord, fields: update.fields });
          state.records.set(saved.recordName, saved);
        });
      }
      if (deletedRecords && deletedRecords.length) {
        if (typeof state.database.deleteRecords !== "function") throw new Error("This CloudKit connection cannot archive folders yet.");
        const zoneID = state.nativeSchema ? state.nativeZoneID : cloudKitWebZone.ARBOR_WEB_ZONE_ID;
        assertResponse(await state.database.deleteRecords(deletedRecords, { zoneID: zoneID }));
        if (!accountSessionCurrent(session)) return false;
        deletedRecords.forEach(function (record) { state.records.delete(record.recordName); });
      }
      if (preferencesAfter) {
        state.preferences = Object.assign({}, state.preferences, preferencesAfter);
        normalizeSettingsPreferences();
        persistSettingsPreferences();
      }
      syncDerivedCollections();
      restoreHistoryNavigation(navigationAfter);
      if (updates.length || (deletedRecords && deletedRecords.length)) {
        recordUndoAction(makeFolderChangeAction(label, targetPath, savedUpdates, deletedRecords, navigationBefore, navigationAfter, preferencesBefore, preferencesAfter));
      }
      return true;
    } catch (error) {
      if (!accountSessionCurrent(session)) return false;
      if (savedUpdates.length) {
        try {
          const rollback = savedUpdates.map(function (update) {
            const record = cloneRecord(update.record);
            update.fields.forEach(function (name) { setNullableField(record, name, fieldValue(update.beforeRecord, name)); });
            return record;
          });
          const response = assertResponse(await saveToDatabase(rollback));
          (response.records || rollback).forEach(function (record) { state.records.set(record.recordName, record); });
        } catch (_) {}
      }
      if (deletedRecords && deletedRecords.length) {
        try {
          const restore = deletedRecords.map(function (record) {
            const copy = cloneRecord(record);
            delete copy.recordChangeTag; delete copy.created; delete copy.modified; delete copy.deleted;
            return copy;
          });
          const response = assertResponse(await saveToDatabase(restore));
          (response.records || restore).forEach(function (record) { state.records.set(record.recordName, record); });
        } catch (_) {}
      }
      syncDerivedCollections();
      renderAll();
      showToast(readableError(error), true);
      return false;
    }
  }

  function legacyFolderRebaseUpdates(source, destination, paths) {
    const updates = [];
    const affectedFolders = new Set(paths);
    for (const record of state.records.values()) {
      if (record.recordType === "ArborFolder") {
        const oldPath = folderPathFromRecord(record);
        if (!affectedFolders.has(oldPath)) continue;
        const nextPath = rebaseFolderPath(oldPath, source, destination);
        if (!nextPath) continue;
        const beforeRecord = cloneRecord(record);
        updates.push({ record: folderPatchRecord(record, ["relativePath", "modifiedAt", "lastModifiedDeviceID", "lastModifiedDeviceName"], {
          relativePath: nextPath, modifiedAt: new Date(), lastModifiedDeviceID: state.deviceID, lastModifiedDeviceName: "Arbor Web"
        }), beforeRecord: beforeRecord, fields: ["relativePath", "modifiedAt", "lastModifiedDeviceID", "lastModifiedDeviceName"] });
      }
    }
    const affectedNotes = state.notes.filter(function (note) { return folderPathIsWithin(note.folderPath, source); });
    const movingNames = affectedNotes.map(function (note) { return note.recordName; });
    const movePaths = uniqueMovedNotePaths(affectedNotes, movingNames, source, destination, false);
    affectedNotes.forEach(function (note) {
      const beforeRecord = cloneRecord(note.record);
      const finalPath = movePaths.get(note.recordName);
      const fields = ["relativePath", "modifiedAt", "lastModifiedDeviceID", "lastModifiedDeviceName"];
      const record = folderPatchRecord(note.record, fields, {
        relativePath: finalPath,
        modifiedAt: new Date(), lastModifiedDeviceID: state.deviceID, lastModifiedDeviceName: "Arbor Web"
      });
      updates.push({ record: record, beforeRecord: beforeRecord, fields: fields });
    });
    return updates;
  }

  async function renameFolder(path) {
    const session = state.accountSession;
    await flushSave();
    if (!accountSessionCurrent(session)) return;
    const folder = state.folders.find(function (item) { return item.path === path; });
    if (!folder || !state.database) return;
    const beforeName = path.split("/").pop();
    const response = window.prompt("Rename folder", beforeName);
    if (response === null) return;
    const cleaned = cleanFolderName(response);
    if (!cleaned) { showToast("Enter a folder name.", true); return; }
    const parent = parentPath(path);
    const target = uniqueDestinationPath(parent, cleaned, path);
    if (target === path) return;
    const navigationBefore = navigationSnapshot();
    const navigationAfter = Object.assign({}, navigationBefore);
    if (navigationAfter.folder && folderPathIsWithin(navigationAfter.folder, path)) navigationAfter.folder = target + navigationAfter.folder.slice(path.length);
    const updates = [];
    if (state.nativeSchema) {
      if (!folder.record) { showToast("This folder can’t be renamed in this iCloud schema.", true); return; }
      const fields = ["name"];
      updates.push({ record: folderPatchRecord(folder.record, fields, { name: target.split("/").pop() }), beforeRecord: cloneRecord(folder.record), fields: fields });
    } else {
      updates.push.apply(updates, legacyFolderRebaseUpdates(path, target, folderSubtreePaths(path)));
    }
    const success = await commitFolderMutation("Rename folder", path, updates, [], navigationBefore, navigationAfter);
    if (success) showToast("Folder renamed.");
  }

  async function moveFolder(path, parent) {
    const session = state.accountSession;
    await flushSave();
    if (!accountSessionCurrent(session)) return;
    const folder = state.folders.find(function (item) { return item.path === path; });
    if (!folder || !state.database || (parent && !state.folders.some(function (item) { return item.path === parent; }))) return;
    if (folderPathIsWithin(parent, path)) { showToast("A folder can’t be moved inside itself.", true); return; }
    if (parentPath(path) === parent) return;
    const target = uniqueDestinationPath(parent, path.split("/").pop(), path);
    const navigationBefore = navigationSnapshot();
    const navigationAfter = Object.assign({}, navigationBefore);
    if (navigationAfter.folder && folderPathIsWithin(navigationAfter.folder, path)) navigationAfter.folder = target + navigationAfter.folder.slice(path.length);
    const updates = [];
    if (state.nativeSchema) {
      if (!folder.record) { showToast("This folder can’t be moved in this iCloud schema.", true); return; }
      const newParent = state.folders.find(function (item) { return item.path === parent; });
      const fields = ["parentID", "name"];
      updates.push({ record: folderPatchRecord(folder.record, fields, { parentID: newParent ? newParent.uuid : null, name: target.split("/").pop() }), beforeRecord: cloneRecord(folder.record), fields: fields });
    } else {
      updates.push.apply(updates, legacyFolderRebaseUpdates(path, target, folderSubtreePaths(path)));
    }
    const success = await commitFolderMutation("Move folder", path, updates, [], navigationBefore, navigationAfter);
    if (success) showToast("Folder moved.");
  }

  function openFolderArchiveConfirmation(path) {
    folderArchivePendingPath = path;
    if (!state.preferences.confirmFolderArchive) {
      archiveFolder(path, false);
      return;
    }
    const dialog = $("folder-archive-dialog");
    $("folder-archive-title").textContent = "Archive “" + path.split("/").pop() + "”?";
    $("folder-archive-skip").checked = false;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else if (window.confirm("Archive this folder and its notes? The notes will remain in Archive.")) archiveFolder(path, false);
  }

  async function archiveFolder(path, skipConfirmationNextTime) {
    const session = state.accountSession;
    await flushSave();
    if (!accountSessionCurrent(session)) return;
    const folder = state.folders.find(function (item) { return item.path === path; });
    if (!folder || !state.database) return;
    const navigationBefore = navigationSnapshot();
    const navigationAfter = { note: navigationBefore.note, folder: "", archive: true };
    const paths = folderSubtreePaths(path);
    const deletedRecords = state.folders.filter(function (item) { return paths.includes(item.path) && item.record; }).map(function (item) { return cloneRecord(item.record); });
    const affectedNotes = state.notes.filter(function (note) { return folderPathIsWithin(note.folderPath, path); });
    const updates = [];
    if (state.nativeSchema) {
      const archivedAt = new Date();
      affectedNotes.forEach(function (note) {
        const fields = ["archivedAt", "folderID"];
        updates.push({ record: folderPatchRecord(note.record, fields, { archivedAt: archivedAt, folderID: null }), beforeRecord: cloneRecord(note.record), fields: fields });
      });
    } else {
      const movingNames = affectedNotes.map(function (note) { return note.recordName; });
      const archivePaths = uniqueMovedNotePaths(affectedNotes, movingNames, path, "", true);
      affectedNotes.forEach(function (note) {
        const filename = note.path.split("/").pop();
        const archivedName = archivePaths.get(note.recordName) || filename;
        const fields = ["relativePath", "modifiedAt", "lastModifiedDeviceID", "lastModifiedDeviceName"];
        updates.push({ record: folderPatchRecord(note.record, fields, {
          relativePath: "Archive/" + archivedName.split("/").pop(), modifiedAt: new Date(),
          lastModifiedDeviceID: state.deviceID, lastModifiedDeviceName: "Arbor Web"
        }), beforeRecord: cloneRecord(note.record), fields: fields });
      });
    }
    const preferencesBefore = skipConfirmationNextTime ? Object.assign({}, state.preferences) : null;
    const preferencesAfter = skipConfirmationNextTime ? Object.assign({}, state.preferences, { confirmFolderArchive: false }) : null;
    const done = await commitFolderMutation("Archive folder", path, updates, deletedRecords, navigationBefore, navigationAfter,
      preferencesBefore, preferencesAfter);
    if (done) showToast("Folder archived. Its notes are in Archive.");
  }

  async function moveNote(recordName, folderPath) {
    const session = state.accountSession;
    await flushSave();
    if (!accountSessionCurrent(session)) return;
    const note = state.notes.find(function (item) { return item.recordName === recordName; });
    if (!note || note.folderPath === folderPath) return;
    const navigationBefore = navigationSnapshot();
    const fields = state.nativeSchema ? ["folderID"] : ["relativePath"];
    const beforePatch = patchForRecord(note.record, fields);
    try {
      if (state.nativeSchema) {
        const destination = state.folders.find(function (folder) { return folder.path === folderPath; });
        const saved = await saveRecord(note.record, { title: note.title, body: note.body }, { folderID: destination ? destination.uuid : null });
        if (!accountSessionCurrent(session)) return;
        state.records.set(recordName, saved);
        syncDerivedCollections();
        renderAll();
        recordPatchHistory(recordName, "Move note", fields, beforePatch, patchForRecord(saved, fields), navigationBefore, navigationSnapshot());
        showToast("Note moved to " + (folderPath || "All Notes") + ".");
        return;
      }
      const filename = note.path.split("/").pop();
      const baseName = filename.replace(/\.md$/i, "");
      const taken = new Set(state.notes.filter(function (item) {
        return item.recordName !== recordName && parentPath(item.path.replace(/^Archive\//i, "")) === folderPath;
      }).map(function (item) { return item.path.split("/").pop().toLocaleLowerCase(); }));
      const unique = uniqueFilename(baseName, taken);
      const path = (folderPath ? folderPath + "/" : "") + unique;
      const saved = await saveRecord(note.record, note.body, { relativePath: path });
      if (!accountSessionCurrent(session)) return;
      state.records.set(recordName, saved);
      syncDerivedCollections();
      renderAll();
      recordPatchHistory(recordName, "Move note", fields, beforePatch, patchForRecord(saved, fields), navigationBefore, navigationSnapshot());
      showToast("Note moved to " + (folderPath || "All Notes") + ".");
    } catch (error) {
      showToast(readableError(error), true);
    }
  }

  async function archiveCurrentNote(recordName) {
    const name = typeof recordName === "string" ? recordName : (state.selectedRecordName || state.listCursor);
    let note = state.notes.find(function (item) { return item.recordName === name; });
    if (!note || !state.database) return;
    const session = state.accountSession;
    const navigationBefore = navigationSnapshot();
    const fields = state.nativeSchema ? ["archivedAt"] : ["relativePath"];
    const beforePatch = patchForRecord(note.record, fields);
    try {
      await flushSave();
      if (!accountSessionCurrent(session)) return;
      note = state.notes.find(function (item) { return item.recordName === name; });
      if (!note) return;
      let saved;
      if (state.nativeSchema) {
        await ensureFullNativeRecord(note);
        const record = cloneRecord(note.record);
        setNullableField(record, "archivedAt", new Date());
        const response = assertResponse(await saveToDatabase(record));
        saved = response.records && response.records[0] ? response.records[0] : record;
      } else {
        const path = "Archive/" + note.path.replace(/^Archive\//i, "");
        const record = cloneRecord(note.record);
        setField(record, "relativePath", path);
        const response = assertResponse(await saveToDatabase(record));
        saved = response.records && response.records[0] ? response.records[0] : record;
      }
      if (!accountSessionCurrent(session)) return;
      state.records.set(saved.recordName, saved); syncDerivedCollections();
      closeNoteActions();
      if (state.listCursor === name) state.listCursor = null;
      if (state.selectedRecordName === name && !state.preferences.tabsEnabled) {
        state.selectedRecordName = null;
        selectNote(null);
      }
      renderAll(); showToast("Note moved to Archive.");
      recordPatchHistory(name, "Archive note", fields, beforePatch, patchForRecord(saved, fields), navigationBefore, navigationSnapshot());
    } catch (error) { showToast(readableError(error), true); }
  }

  async function restoreArchivedNote(recordName) {
    const name = typeof recordName === "string" ? recordName : state.actionMenuRecordName;
    let note = state.notes.find(function (item) { return item.recordName === name; });
    if (!note || !isArchived(note.record) || !state.database) return;
    const session = state.accountSession;
    const navigationBefore = navigationSnapshot();
    const fields = state.nativeSchema ? ["archivedAt"] : ["relativePath"];
    const beforePatch = patchForRecord(note.record, fields);
    try {
      await flushSave();
      if (!accountSessionCurrent(session)) return;
      note = state.notes.find(function (item) { return item.recordName === name; });
      if (!note || !isArchived(note.record)) return;
      let record = cloneRecord(note.record);
      if (state.nativeSchema) {
        await ensureFullNativeRecord(note);
        record = cloneRecord(note.record);
        setNullableField(record, "archivedAt", null);
      } else {
        setField(record, "relativePath", note.path.replace(/^Archive\//i, ""));
      }
      const response = assertResponse(await saveToDatabase(record));
      if (!accountSessionCurrent(session)) return;
      const saved = response.records && response.records[0] ? response.records[0] : record;
      state.records.set(saved.recordName, saved);
      syncDerivedCollections();
      closeNoteActions();
      if (state.listCursor === name) state.listCursor = null;
      if (state.selectedRecordName === name && !state.preferences.tabsEnabled) {
        state.selectedRecordName = null;
        selectNote(null);
      }
      renderAll();
      showToast("Note restored from Archive.");
      recordPatchHistory(name, "Restore note", fields, beforePatch, patchForRecord(saved, fields), navigationBefore, navigationSnapshot());
    } catch (error) { showToast(readableError(error), true); }
  }

  async function toggleStar(recordName) {
    const name = typeof recordName === "string" ? recordName : (state.actionMenuRecordName || state.selectedRecordName);
    let noteToStar = state.notes.find(function (item) { return item.recordName === name; });
    if (!noteToStar || state.nativeSchema || isArchived(noteToStar.record)) return;
    const session = state.accountSession;
    try {
      await flushSave();
      if (!accountSessionCurrent(session)) return;
      noteToStar = state.notes.find(function (item) { return item.recordName === name; });
      if (!noteToStar || state.nativeSchema || isArchived(noteToStar.record)) return;
      const navigationBefore = navigationSnapshot();
      const beforePatch = patchForRecord(noteToStar.record, ["isStarred"]);
      const record = cloneRecord(noteToStar.record);
      const value = Number(fieldValue(record, "isStarred") || 0) === 0 ? 1 : 0;
      setField(record, "isStarred", value);
      setField(record, "modifiedAt", new Date());
      const response = assertResponse(await saveToDatabase(record));
      if (!accountSessionCurrent(session)) return;
      const saved = response.records && response.records[0] ? response.records[0] : record;
      state.records.set(saved.recordName, saved);
      syncDerivedCollections();
      const note = state.notes.find(function (item) { return item.recordName === saved.recordName; });
      if (state.selectedRecordName === saved.recordName) selectNote(note);
      closeNoteActions();
      renderAll();
      recordPatchHistory(name, Number(beforePatch.isStarred || 0) ? "Unstar note" : "Star note", ["isStarred"], beforePatch, patchForRecord(saved, ["isStarred"]), navigationBefore, navigationSnapshot());
    } catch (error) {
      showToast(readableError(error), true);
    }
  }

  function updateUndoControls() {
    const history = state.undoHistory;
    const unavailable = !state.database || state.accountCacheSuspended;
    const commandRunning = Boolean(state.historyCommandPromise);
    const undo = $("undo-action-button");
    const redo = $("redo-action-button");
    if (undo) {
      undo.disabled = unavailable || commandRunning || !history || !history.canUndo;
      undo.title = history && history.undoLabel ? "Undo " + history.undoLabel : "Undo";
      undo.setAttribute("aria-label", undo.title);
    }
    if (redo) {
      redo.disabled = unavailable || commandRunning || !history || !history.canRedo;
      redo.title = history && history.redoLabel ? "Redo " + history.redoLabel : "Redo";
      redo.setAttribute("aria-label", redo.title);
    }
  }

  function historyValuesEqual(left, right) {
    if (left instanceof Date || right instanceof Date) {
      const leftTime = left instanceof Date ? left.getTime() : new Date(left || 0).getTime();
      const rightTime = right instanceof Date ? right.getTime() : new Date(right || 0).getTime();
      return leftTime === rightTime;
    }
    return JSON.stringify(left === undefined ? null : left) === JSON.stringify(right === undefined ? null : right);
  }

  function navigationSnapshot() {
    return { note: state.selectedRecordName, folder: state.selectedFolder, archive: Boolean(state.showingArchive) };
  }

  function restoreHistoryNavigation(snapshot) {
    const target = snapshot || {};
    state.selectedFolder = String(target.folder || "");
    state.showingArchive = Boolean(target.archive);
    closeNoteActions();
    const note = target.note && state.notes.find(function (item) { return item.recordName === target.note && !isArchived(item.record); });
    state.selectedRecordName = note ? note.recordName : null;
    renderAll();
    selectNote(note || null);
  }

  function capturePreferences() {
    return {
      layout: Object.assign({}, state.layout),
      appearance: Object.assign({}, state.appearance),
      preferences: Object.assign({}, state.preferences),
      accountSettings: Object.assign({}, state.accountSettings)
    };
  }

  function recordPreferenceChange(before, label, groupKey) {
    const after = capturePreferences();
    if (!before || JSON.stringify(before) === JSON.stringify(after)) return;
    recordUndoAction({ kind: "preferences", target: "preferences", label: label || "Change settings", groupKey: groupKey || "", before: before, after: after, updatedAt: Date.now() });
  }

  function applyPreferences(snapshot) {
    const value = snapshot || {};
    const previousNoteSortOrder = state.preferences.noteSortOrder;
    state.layout = Object.assign({}, state.layout, value.layout || {});
    state.appearance = Object.assign({}, state.appearance, value.appearance || {});
    state.preferences = Object.assign({}, state.preferences, value.preferences || {});
    state.accountSettings = Object.assign({}, state.accountSettings, value.accountSettings || {});
    normalizeSettingsPreferences();
    persistLayout();
    persistAppearance();
    persistSettingsPreferences();
    persistAccountSettings();
    reconcileNoteTabPreference();
    applyLayout();
    applyAppearanceWithMotion();
    syncSettingsControls();
    if (previousNoteSortOrder !== state.preferences.noteSortOrder) renderNotes();
  }

  function historyContextCurrent(context) {
    return Boolean(context && context.session === state.accountSession && context.history === state.undoHistory &&
      context.accountKey === state.undoHistoryAccountKey && context.database === state.database &&
      context.database && !state.accountCacheSuspended);
  }

  function assertHistoryContext(context) {
    if (!historyContextCurrent(context)) throw new Error("Undo stopped because the signed-in account changed.");
  }

  function historyZoneID(context) {
    return context.nativeSchema ? context.nativeZoneID : cloudKitWebZone.ARBOR_WEB_ZONE_ID;
  }

  async function fetchLatestHistoryRecord(recordName, context) {
    assertHistoryContext(context);
    if (state.demo) return state.records.get(recordName) || null;
    const response = assertResponse(await context.database.fetchRecords([recordName], { zoneID: historyZoneID(context) }));
    assertHistoryContext(context);
    return (response.records || []).find(function (record) { return record.recordName === recordName; }) || null;
  }

  async function readRecordEditorContent(record) {
    let body;
    let title;
    if (isNativeModelRecord(record, "CapturedNote")) {
      body = fieldValue(record, "text");
      if (typeof body !== "string") {
        const asset = fieldValue(record, "text_ckAsset");
        const url = asset && (asset.downloadURL || asset.url);
        if (!url) body = "";
        else {
          const response = await fetch(url);
          if (!response.ok) throw new Error("Could not read this note before undoing it.");
          body = await (await response.blob()).text();
        }
      }
      title = String(fieldValue(record, "userTitle") || fieldValue(record, "generatedTitle") || firstLineTitle(body));
      return { title: normalizedTitle(title), body: String(body || "") };
    }
    body = fieldValue(record, "body");
    if (typeof body !== "string") {
      const asset = fieldValue(record, "bodyAsset");
      const url = asset && (asset.downloadURL || asset.url);
      if (!url) body = "";
      else {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Could not read this note before undoing it.");
        body = await (await response.blob()).text();
      }
    }
    const parts = splitDocument(body);
    return { title: normalizedTitle(parts.title), body: parts.body };
  }

  function editorContentMatches(left, right) {
    return Boolean(left && right && normalizedTitle(left.title) === normalizedTitle(right.title) && String(left.body || "") === String(right.body || ""));
  }

  function patchForRecord(record, names) {
    const values = {};
    (names || []).forEach(function (name) { values[name] = fieldValue(record, name); });
    return values;
  }

  function patchMatches(left, right, names) {
    return (names || []).every(function (name) { return historyValuesEqual(left && left[name], right && right[name]); });
  }

  function recordPatchHistory(recordName, label, fields, before, after, navigationBefore, navigationAfter) {
    if (patchMatches(before, after, fields)) return;
    recordUndoAction({
      kind: "record-patch", target: recordName, label: label,
      fields: fields.slice(), before: before, after: after,
      navigationBefore: navigationBefore || navigationSnapshot(),
      navigationAfter: navigationAfter || navigationSnapshot(),
      updatedAt: Date.now()
    });
  }

  async function historyConflict(action, message) {
    if (state.undoHistory) await state.undoHistory.discardTarget(action.target);
    throw new Error(message || "This item changed in iCloud. Its undo history was cleared to protect the newer version.");
  }

  async function applyEditorHistory(action, direction, context) {
    assertHistoryContext(context);
    const expected = direction === "undo" ? action.after : action.before;
    const desired = direction === "undo" ? action.before : action.after;
    const note = state.notes.find(function (item) { return item.recordName === action.target; });
    if (!note) return historyConflict(action, "This note is no longer available in this library.");
    const isSelected = state.selectedRecordName === note.recordName && Boolean(state.editor);
    const actual = isSelected
      ? { title: $("note-title").value || "Untitled", body: String(note.editorBody || "") }
      : { title: note.title, body: String(note.editorBody || "") };
    const desiredContent = { title: desired.title, body: desired.body };
    const expectedContent = { title: expected.title, body: expected.body };
    if (!editorContentMatches(actual, expectedContent) && !editorContentMatches(actual, desiredContent)) {
      return historyConflict(action, "This note changed since the last edit. Its undo history was cleared to protect the newer text.");
    }

    const wasAlreadyApplied = editorContentMatches(actual, desiredContent);
    if (wasAlreadyApplied) return;
    if (!isSelected && state.dirty) flushSave().catch(function () {});
    state.replayingHistory = true;
    try {
      note.title = desiredContent.title;
      note.body = desiredContent.body;
      note.editorBody = desiredContent.body;
      note.preview = previewText(desiredContent.body);
      state.bodyCache.set(note.recordName, state.nativeSchema
        ? String(desiredContent.body || "")
        : normalizedTitle(desiredContent.title) + "\n\n" + String(desiredContent.body || ""));
      writeDraft(note.recordName, { title: desiredContent.title, body: desiredContent.body });

      if (isSelected) {
        const liveEditorState = captureEditorHistorySnapshot({ editorBodyChanged: true });
        const activeBody = $("note-body");
        const scrollTop = activeBody ? activeBody.scrollTop : 0;
        const titleInput = $("note-title");
        titleInput.value = note.title === "Untitled" && !note.body ? "" : note.title;
        fitTitle();
        if (activeBody) activeBody.innerHTML = markdownHTML(desiredContent.body);
        if (activeBody) activeBody.scrollTop = scrollTop;
        state.bodyDirty = false;
        renderNoteDate(note);
        renderNotes();
        if (state.searchPage) renderSearchPage();
        restoreEditorSnapshotSelection(desired, liveEditorState);
      } else {
        assertHistoryContext(context);
        selectNote(note);
        restoreEditorSnapshotSelection(desired);
      }
      scheduleSave(false);
    } finally { state.replayingHistory = false; }
  }

  async function applyRecordPatchHistory(action, direction, context) {
    assertHistoryContext(context);
    const expected = direction === "undo" ? action.after : action.before;
    const desired = direction === "undo" ? action.before : action.after;
    const latest = await fetchLatestHistoryRecord(action.target, context);
    if (!latest) return historyConflict(action, "This item is no longer in iCloud. Its undo history was cleared.");
    const current = patchForRecord(latest, action.fields);
    if (!patchMatches(current, expected, action.fields) && !patchMatches(current, desired, action.fields)) {
      return historyConflict(action, "This item changed in iCloud. Its undo history was cleared to protect the newer version.");
    }
    if (!patchMatches(current, desired, action.fields)) {
      assertHistoryContext(context);
      const next = cloneRecord(latest);
      (action.fields || []).forEach(function (name) { setNullableField(next, name, desired[name]); });
      setField(next, "modifiedAt", new Date());
      const response = assertResponse(await saveToDatabase(next, context));
      assertHistoryContext(context);
      const saved = response.records && response.records[0] ? response.records[0] : next;
      state.records.set(saved.recordName, saved);
      syncDerivedCollections();
    } else {
      state.records.set(latest.recordName, latest);
      syncDerivedCollections();
    }
    closeNoteActions();
    const navigation = direction === "undo" ? action.navigationBefore : action.navigationAfter;
    restoreHistoryNavigation(navigation);
  }

  async function applyFolderChangeHistory(action, direction, context) {
    assertHistoryContext(context);
    const expectedKey = direction === "undo" ? "after" : "before";
    const desiredKey = direction === "undo" ? "before" : "after";
    const latestByName = new Map();
    const patches = action.patches || [];
    for (const patch of patches) {
      const latest = await fetchLatestHistoryRecord(patch.recordName, context);
      assertHistoryContext(context);
      if (!latest) return historyConflict(action, "A folder or note changed in iCloud. This folder action was stopped to protect the newer version.");
      const current = patchForRecord(latest, patch.fields);
      if (!patchMatches(current, patch[expectedKey], patch.fields) && !patchMatches(current, patch[desiredKey], patch.fields)) {
        return historyConflict(action, "A folder or note changed in iCloud. This folder action was stopped to protect the newer version.");
      }
      latestByName.set(latest.recordName, latest);
    }
    const deleted = action.deletedRecords || [];
    const deletedLatest = new Map();
    for (const snapshot of deleted) {
      const latest = await fetchLatestHistoryRecord(snapshot.recordName, context);
      assertHistoryContext(context);
      if (direction === "undo") {
        if (latest && !signaturesEqual(await createdRecordSignature(latest), await createdRecordSignature(snapshot))) {
          return historyConflict(action, "A folder with this identity changed in iCloud. Folder undo was stopped to protect it.");
        }
      } else {
        if (!latest || !signaturesEqual(await createdRecordSignature(latest), await createdRecordSignature(snapshot))) {
          return historyConflict(action, "A folder in this tree changed in iCloud. Folder redo was stopped to protect it.");
        }
      }
      deletedLatest.set(snapshot.recordName, latest);
    }

    const writes = [];
    patches.forEach(function (patch) {
      const latest = latestByName.get(patch.recordName);
      const current = patchForRecord(latest, patch.fields);
      if (patchMatches(current, patch[desiredKey], patch.fields)) return;
      const next = cloneRecord(latest);
      patch.fields.forEach(function (name) { setNullableField(next, name, patch[desiredKey][name]); });
      writes.push(next);
    });
    if (direction === "undo") {
      deleted.forEach(function (snapshot) {
        if (deletedLatest.get(snapshot.recordName)) return;
        const restored = cloneRecord(snapshot);
        delete restored.recordChangeTag; delete restored.created; delete restored.modified; delete restored.deleted;
        writes.push(restored);
      });
    }
    if (writes.length) {
      assertHistoryContext(context);
      const response = assertResponse(await saveToDatabase(writes, context));
      assertHistoryContext(context);
      const savedByName = new Map((response.records || []).map(function (record) { return [record.recordName, record]; }));
      writes.forEach(function (record) { state.records.set(record.recordName, savedByName.get(record.recordName) || record); });
    }
    if (direction === "redo" && deleted.length) {
      assertHistoryContext(context);
      if (typeof context.database.deleteRecords !== "function") throw new Error("This CloudKit connection cannot redo folder archive yet.");
      const records = deleted.map(function (snapshot) { return deletedLatest.get(snapshot.recordName); }).filter(Boolean);
      assertResponse(await context.database.deleteRecords(records, { zoneID: historyZoneID(context) }));
      assertHistoryContext(context);
      records.forEach(function (record) { state.records.delete(record.recordName); });
    }
    const preferences = direction === "undo" ? action.preferencesBefore : action.preferencesAfter;
    if (preferences) {
      state.preferences = Object.assign({}, state.preferences, preferences);
      normalizeSettingsPreferences();
      persistSettingsPreferences();
    }
    syncDerivedCollections();
    restoreHistoryNavigation(direction === "undo" ? action.navigationBefore : action.navigationAfter);
  }

  async function createdRecordSignature(record) {
    if (isNativeModelRecord(record, "CapturedNote")) {
      const content = await readRecordEditorContent(record);
      return { kind: "note", title: content.title, body: content.body, folderID: fieldValue(record, "folderID") };
    }
    if (isNativeModelRecord(record, "NoteFolder")) {
      return { kind: "folder", id: fieldValue(record, "id"), name: fieldValue(record, "name"), parentID: fieldValue(record, "parentID") };
    }
    if (record.recordType === "ArborNote") {
      const content = await readRecordEditorContent(record);
      return { kind: "note", title: content.title, body: content.body, path: recordPath(record) };
    }
    return { kind: "folder", id: fieldValue(record, "folderUUID"), path: fieldValue(record, "relativePath") };
  }

  function creationSignature(record, content) {
    if (isNativeModelRecord(record, "CapturedNote")) {
      return { kind: "note", title: normalizedTitle(content && content.title || fieldValue(record, "userTitle") || fieldValue(record, "generatedTitle")), body: String(content && content.body != null ? content.body : fieldValue(record, "text") || ""), folderID: fieldValue(record, "folderID") };
    }
    if (isNativeModelRecord(record, "NoteFolder")) {
      return { kind: "folder", id: fieldValue(record, "id"), name: fieldValue(record, "name"), parentID: fieldValue(record, "parentID") };
    }
    if (record.recordType === "ArborNote") {
      const parts = content || splitDocument(fieldValue(record, "body") || "");
      return { kind: "note", title: normalizedTitle(parts.title), body: String(parts.body || ""), path: recordPath(record) };
    }
    return { kind: "folder", id: fieldValue(record, "folderUUID"), path: fieldValue(record, "relativePath") };
  }

  function signaturesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function folderHasChildren(action) {
    const signature = action.signature || {};
    const folder = state.folders.find(function (item) { return item.uuid === signature.id || item.path === signature.path; });
    if (!folder) return false;
    const prefix = folder.path + "/";
    return state.notes.some(function (note) { return note.folderPath === folder.path || note.folderPath.indexOf(prefix) === 0; }) ||
      state.folders.some(function (item) { return item.path !== folder.path && item.path.indexOf(prefix) === 0; });
  }

  function recordForRedo(action) {
    const record = cloneRecord(action.record);
    delete record.recordChangeTag;
    delete record.created;
    delete record.modified;
    delete record.deleted;
    const content = action.content;
    if (content && isNativeModelRecord(record, "CapturedNote")) {
      setField(record, "text", String(content.body || ""));
      setNullableField(record, "text_ckAsset", null);
      setNullableField(record, "userTitle", content.userTitle || null);
      setField(record, "modifiedAt", new Date());
    } else if (content && record.recordType === "ArborNote") {
      const markdown = normalizedTitle(content.title) + "\n\n" + String(content.body || "");
      setField(record, "body", markdown);
      setNullableField(record, "bodyAsset", null);
      setField(record, "bodyStorageRaw", "inline");
      setField(record, "contentFingerprint", "");
      setField(record, "modifiedAt", new Date());
    }
    if (record.fields) {
      delete record.fields.CD_text_ckAsset;
      delete record.fields.text_ckAsset;
      if (content && record.recordType === "ArborNote") delete record.fields.bodyAsset;
    }
    return record;
  }

  async function deleteHistoryRecord(record, context) {
    assertHistoryContext(context);
    if (typeof context.database.deleteRecords !== "function") throw new Error("This CloudKit connection cannot safely undo creation yet.");
    const response = assertResponse(await context.database.deleteRecords([record], { zoneID: historyZoneID(context) }));
    assertHistoryContext(context);
    return response;
  }

  async function applyCreatedRecordHistory(action, direction, context) {
    assertHistoryContext(context);
    const latest = await fetchLatestHistoryRecord(action.target, context);
    if (direction === "undo") {
      if (!latest) return;
      if (action.signature && !signaturesEqual(await createdRecordSignature(latest), action.signature)) {
        assertHistoryContext(context);
        return historyConflict(action, "This item changed in iCloud. Its undo history was cleared to protect the newer version.");
      }
      assertHistoryContext(context);
      if (action.signature && action.signature.kind === "folder" && folderHasChildren(action)) {
        throw new Error("Move the folder’s contents before undoing its creation.");
      }
      await deleteHistoryRecord(latest, context);
      state.records.delete(action.target);
      state.bodyCache.delete(action.target);
      syncDerivedCollections();
    } else {
      if (latest) {
        if (action.signature && signaturesEqual(await createdRecordSignature(latest), action.signature)) return;
        return historyConflict(action, "An item with this identity changed in iCloud. Redo was stopped to protect it.");
      }
      const record = recordForRedo(action);
      if (action.content && record.recordType === "ArborNote") {
        const markdown = normalizedTitle(action.content.title) + "\n\n" + String(action.content.body || "");
        setField(record, "contentFingerprint", await fingerprint(markdown));
      }
      assertHistoryContext(context);
      const response = assertResponse(await saveToDatabase(record, context));
      assertHistoryContext(context);
      const saved = response.records && response.records[0] ? response.records[0] : record;
      state.records.set(saved.recordName, saved);
      if (action.content) state.bodyCache.set(saved.recordName, state.nativeSchema
        ? String(action.content.body || "")
        : normalizedTitle(action.content.title) + "\n\n" + String(action.content.body || ""));
      syncDerivedCollections();
    }
    closeNoteActions();
    restoreHistoryNavigation(direction === "undo" ? action.navigationBefore : action.navigationAfter);
  }

  async function applyHistoryAction(action, direction, context) {
    assertHistoryContext(context);
    if (action.kind === "editor") return applyEditorHistory(action, direction, context);
    if (action.kind === "record-patch") return applyRecordPatchHistory(action, direction, context);
    if (action.kind === "folder-change") return applyFolderChangeHistory(action, direction, context);
    if (action.kind === "created-record") return applyCreatedRecordHistory(action, direction, context);
    if (action.kind === "preferences") {
      applyPreferences(direction === "undo" ? action.before : action.after);
      return;
    }
    throw new Error("Arbor cannot replay this action yet.");
  }

  function performHistoryCommand(direction) {
    const requestedHistory = state.undoHistory;
    const requestedSession = state.accountSession;
    const requestedDatabase = state.database;
    const requestedAccountKey = state.undoHistoryAccountKey;
    const execute = async function () {
      const history = requestedHistory;
      if (!history || state.undoHistory !== history || state.accountSession !== requestedSession ||
          state.database !== requestedDatabase || state.undoHistoryAccountKey !== requestedAccountKey ||
          !requestedDatabase || state.accountCacheSuspended || (direction === "undo" ? !history.canUndo : !history.canRedo)) return false;
      const context = {
        session: requestedSession,
        accountKey: requestedAccountKey,
        history: history,
        database: requestedDatabase,
        nativeSchema: state.nativeSchema,
        nativeZoneID: state.nativeZoneID
      };
      const apply = async function (action, command) {
        assertHistoryContext(context);
        await applyHistoryAction(action, command, context);
        assertHistoryContext(context);
      };
      const action = direction === "undo" ? history.peekUndo() : history.peekRedo();
      try {
        if (direction === "undo") await history.undo(apply);
        else await history.redo(apply);
        if (action) showToast((direction === "undo" ? "Undid " : "Redid ") + String(action.label || "change").toLocaleLowerCase() + ".");
        return true;
      } catch (error) {
        showToast(readableError(error), true);
        return false;
      }
    };
    const previous = state.historyCommandPromise || Promise.resolve();
    const command = previous.catch(function () {}).then(execute);
    state.historyCommandPromise = command;
    updateUndoControls();
    const clear = function () {
      if (state.historyCommandPromise !== command) return;
      state.historyCommandPromise = null;
      updateUndoControls();
    };
    command.then(clear, clear);
    return command;
  }

  function setMobileNavigationOpen(open) {
    const expanded = Boolean(open);
    const isDrawerLayout = window.matchMedia("(max-width: 760px)").matches;
    const sidebar = $("sidebar");
    const scrim = $("mobile-sidebar-scrim");
    const trigger = $("mobile-menu-button");
    frame.classList.toggle("mobile-sidebar-open", expanded);
    frame.classList.toggle("sidebar-open", expanded);
    if (sidebar) sidebar.inert = isDrawerLayout && !expanded;
    if (scrim) {
      scrim.inert = !isDrawerLayout || !expanded;
      scrim.setAttribute("aria-hidden", String(!isDrawerLayout || !expanded));
    }
    if (trigger) {
      trigger.setAttribute("aria-expanded", String(isDrawerLayout && expanded));
      trigger.setAttribute("aria-label", isDrawerLayout && expanded ? "Close navigation" : "Open navigation");
    }
    if (!isDrawerLayout) return;
    if (expanded) {
      window.requestAnimationFrame(function () {
        const first = $("all-notes-button");
        if (first) first.focus({ preventScroll: true });
      });
    } else if (trigger) {
      trigger.focus({ preventScroll: true });
    }
  }

  function closeMobileNavigation() { setMobileNavigationOpen(false); }

  function synchronizeMobileNavigationBreakpoint() {
    const isDrawerLayout = window.matchMedia("(max-width: 760px)").matches;
    const expanded = isDrawerLayout && frame.classList.contains("sidebar-open");
    setMobileNavigationOpen(expanded);
  }

  const focusStack = [];

  function pushFocus() {
    const node = document.activeElement;
    focusStack.push(node && node !== document.body ? node : null);
  }

  function popFocus(fallback) {
    const node = focusStack.pop();
    if (node && node.isConnected) node.focus();
    else if (fallback && fallback.focus) fallback.focus();
  }

  function isTypingTarget(target) {
    if (!target || target.nodeType !== 1) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return Boolean(target.closest && target.closest("[contenteditable='true']"));
  }

  function isNativeTextEditingTarget(target) {
    if (!target || target.nodeType !== 1) return false;
    if (target.tagName === "TEXTAREA" || target.isContentEditable || (target.closest && target.closest("[contenteditable='true']"))) return true;
    if (target.tagName !== "INPUT") return false;
    return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(String(target.type || "text").toLowerCase());
  }

  function listNavigationAllowed(target) {
    if (!target || target === document.body || target === document.documentElement) return true;
    if (target.closest && target.closest("#sidebar, .settings-window, .settings-backdrop, .pane-resizer, dialog, .shortcut-sheet")) return false;
    return true;
  }

  function focusableIn(container) {
    return Array.from(container.querySelectorAll("button, [href], input, select, textarea, [tabindex]")).filter(function (el) {
      if (el.disabled || el.tabIndex < 0) return false;
      if (el.closest("[hidden]")) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function trapFocus(event, container) {
    if (event.key !== "Tab" || !container) return;
    const items = focusableIn(container);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const outside = !container.contains(active);
    if (event.shiftKey && (active === first || outside)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || outside)) { event.preventDefault(); first.focus(); }
  }

  function focusSettingsStart() {
    const selected = $("settings-modal").querySelector(".settings-sections button.is-selected");
    if (selected) selected.focus();
  }

  function openSettings() {
    const modal = $("settings-modal");
    if (!modal.hidden) { focusSettingsStart(); return; }
    pushFocus();
    renderSettingsShortcuts();
    setMotionVisibility(modal, true);
    document.body.classList.add("settings-open");
    frame.inert = true;
    focusSettingsStart();
  }

  function closeSettings() {
    const modal = $("settings-modal");
    if (modal.hidden) return;
    state.shortcutRecordingId = "";
    document.body.classList.remove("settings-open");
    setMotionVisibility(modal, false, function () {
      frame.inert = false;
      popFocus($("settings-open"));
    });
  }

  function renderShortcutHelp() {
    const api = window.ArborShortcuts;
    const body = $("shortcut-help-rows");
    if (!api || !body) return;
    const apple = api.usesCommandModifier((navigator.platform || "") + " " + (navigator.userAgent || ""));
    body.replaceChildren();
    api.shortcutHelpRows(apple, state.shortcutBindings).forEach(function (row) {
      const tr = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = row.label;
      const keys = document.createElement("td");
      keys.textContent = row.chords.join("  or  ");
      tr.append(name, keys);
      body.appendChild(tr);
    });
    updateUndoControls();
  }

  function shortcutPlatformIsApple() {
    const api = window.ArborShortcuts;
    return Boolean(api && api.usesCommandModifier((navigator.platform || "") + " " + (navigator.userAgent || "")));
  }

  function setShortcutSyncStatus(message, error) {
    state.shortcutSyncStatus = String(message || "");
    state.shortcutSyncError = error ? String(error) : null;
    const status = $("settings-shortcut-status");
    if (status) {
      status.textContent = state.shortcutSyncStatus;
      status.dataset.state = error ? "error" : "ready";
      if (error) status.title = error;
      else status.removeAttribute("title");
    }
  }

  function renderSettingsShortcuts() {
    const api = window.ArborShortcuts;
    const list = $("settings-shortcut-rows");
    if (!api || !list) return;
    const apple = shortcutPlatformIsApple();
    const query = String($("settings-shortcut-search") && $("settings-shortcut-search").value || "").trim().toLowerCase();
    list.replaceChildren();
    api.shortcutHelpRows(apple, state.shortcutBindings).forEach(function (row) {
      const chord = row.chords.join(" or ");
      if (query && !(row.label + " " + row.id + " " + chord).toLowerCase().includes(query)) return;
      const line = document.createElement("div");
      line.className = "settings-shortcut-row";
      const label = document.createElement("span");
      label.textContent = row.label;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.shortcutId = row.id;
      button.classList.toggle("is-recording", state.shortcutRecordingId === row.id);
      button.textContent = state.shortcutRecordingId === row.id ? "Press shortcut…" : chord;
      button.setAttribute("aria-label", state.shortcutRecordingId === row.id ? "Recording a shortcut for " + row.label + ". Press Escape to cancel." : "Change shortcut for " + row.label + ": " + chord);
      line.append(label, button);
      list.appendChild(line);
    });
    if (!list.childElementCount) {
      const empty = document.createElement("p");
      empty.className = "settings-shortcut-empty";
      empty.textContent = query ? "No Arbor commands match that search." : "No shortcut commands are available.";
      list.appendChild(empty);
    }
    const reset = $("settings-shortcut-reset");
    if (reset) reset.disabled = !state.shortcutOperations.some(function (operation) { return !operation.reset; });
    setShortcutSyncStatus(state.shortcutSyncStatus, state.shortcutSyncError);
  }

  function persistShortcutOperations() {
    if (state.demo || !state.connectionUserID || !state.shortcutStorageKey) return false;
    try {
      window.localStorage.setItem(state.shortcutStorageKey, JSON.stringify(state.shortcutOperations));
      return true;
    } catch (_) {
      return false;
    }
  }

  function applyShortcutOperations(operations) {
    const api = window.ArborShortcuts;
    state.shortcutOperations = keyboardShortcutPreferences.normalizeOperations(operations);
    state.shortcutBindings = api ? api.resolveShortcutBindings(state.shortcutOperations) : [];
    persistShortcutOperations();
    renderSettingsShortcuts();
  }

  function saveShortcutOperation(id, binding, reset) {
    const timestamps = state.shortcutOperations.map(function (operation) { return operation.modifiedAt; });
    const newest = timestamps.length ? Math.max.apply(Math, timestamps) : 0;
    const operation = keyboardShortcutPreferences.createOperation(id, binding, reset, newest + 1);
    applyShortcutOperations(keyboardShortcutPreferences.mergeOperations(state.shortcutOperations, [operation]));
    if (state.demo) {
      setShortcutSyncStatus("Preview only. Shortcut changes reset when you reload.");
      return;
    }
    setShortcutSyncStatus("Saved on this browser. Syncing with iCloud…");
    if (state.database && !state.accountCacheSuspended) syncKeyboardShortcutPreferences(state.accountSession);
  }

  async function syncKeyboardShortcutPreferences(session) {
    if (state.demo) return true;
    if (!state.database || state.accountCacheSuspended || session !== state.accountSession || !keyboardShortcutSync) return false;
    if (state.shortcutSyncPromise) return state.shortcutSyncPromise;
    const database = state.database;
    const run = (async function () {
      try {
        const result = await keyboardShortcutSync.synchronize(database, state.shortcutOperations);
        if (session !== state.accountSession || database !== state.database) return false;
        const merged = keyboardShortcutPreferences.mergeOperations(result.operations || [], state.shortcutOperations);
        const hasPending = !keyboardShortcutPreferences.sameSnapshot(merged, result.operations || []);
        applyShortcutOperations(merged);
        setShortcutSyncStatus(hasPending ? "Synced newer changes; sending the latest shortcut edit…" : "Synced with your Apple Account.");
        if (hasPending) window.setTimeout(function () { syncKeyboardShortcutPreferences(session); }, 0);
        return !hasPending;
      } catch (error) {
        if (session !== state.accountSession || database !== state.database) return false;
        setShortcutSyncStatus("Saved on this browser. Waiting for iCloud.", readableError(error));
        renderSettingsShortcuts();
        return false;
      }
    })();
    state.shortcutSyncPromise = run.finally(function () {
      state.shortcutSyncPromise = null;
      renderSettingsShortcuts();
    });
    return state.shortcutSyncPromise;
  }

  function beginShortcutRecording(id) {
    state.shortcutRecordingId = id;
    setShortcutSyncStatus("Press the key combination you want. Press Escape to cancel.");
    renderSettingsShortcuts();
    const button = Array.from($("settings-shortcut-rows").querySelectorAll("[data-shortcut-id]")).find(function (item) { return item.dataset.shortcutId === id; });
    if (button) button.focus();
  }

  function openShortcutHelp() {
    renderShortcutHelp();
    const dialog = $("shortcut-help");
    if (!dialog.open) {
      window.clearTimeout(shortcutCloseTimer);
      shortcutCloseTimer = 0;
      dialog.classList.remove("is-closing");
      dialog.showModal();
    }
    $("shortcut-help-close").focus();
  }

  function closeShortcutHelp() {
    const dialog = $("shortcut-help");
    if (!dialog.open || dialog.classList.contains("is-closing")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
      return;
    }
    dialog.classList.add("is-closing");
    const card = dialog.querySelector(".shortcut-sheet-card");
    const durationValue = getComputedStyle(document.documentElement).getPropertyValue("--motion-fade-duration").trim();
    const duration = Number.parseFloat(durationValue) * (durationValue.endsWith("ms") ? 1 : 1000);
    const finishClose = function () {
      if (!dialog.open || !dialog.classList.contains("is-closing")) return;
      window.clearTimeout(shortcutCloseTimer);
      shortcutCloseTimer = 0;
      dialog.classList.remove("is-closing");
      dialog.close();
    };
    const onAnimationEnd = function (event) {
      if (event.animationName !== "arbor-shortcut-sheet-exit") return;
      card.removeEventListener("animationend", onAnimationEnd);
      finishClose();
    };
    card.addEventListener("animationend", onAnimationEnd);
    shortcutCloseTimer = window.setTimeout(finishClose, (Number.isFinite(duration) && duration > 0 ? duration : 200) + 100);
  }

  function toggleShortcutHelp() {
    if ($("shortcut-help").open) closeShortcutHelp();
    else openShortcutHelp();
  }

  function surfaceBlocksCommands() {
    return !$("settings-modal").hidden || $("shortcut-help").open || $("capture-dialog").open || $("search-dialog").open || $("folder-archive-dialog").open;
  }

  function closeNoteActions(restoreFocus) {
    const menu = $("note-action-menu");
    if (menu) setMotionVisibility(menu, false);
    setMotionVisibility($("note-context-menu"), false);
    closeFolderSubmenu(false);
    const trigger = $("note-actions-button");
    if (trigger) trigger.setAttribute("aria-expanded", String(Boolean($("about-note-panel") && $("about-note-panel").classList.contains("is-open"))));
    document.querySelectorAll(".note-row[aria-expanded='true']").forEach(function (row) { row.setAttribute("aria-expanded", "false"); });
    const invoker = state.actionMenuInvoker;
    state.actionMenuRecordName = null;
    state.actionMenuInvoker = null;
    if (restoreFocus && invoker && invoker.isConnected && typeof invoker.focus === "function") invoker.focus();
  }

  function openNoteActionMenu(recordName, clientX, clientY, invoker) {
    const note = state.notes.find(function (item) { return item.recordName === recordName; });
    if (!note) return;
    closeNoteActions(false);
    const menu = $("note-action-menu");
    const archived = isArchived(note.record);
    state.actionMenuRecordName = recordName;
    state.actionMenuInvoker = invoker || document.activeElement;
    $("note-open-button").hidden = state.selectedRecordName === recordName;
    $("folder-action").hidden = archived;
    $("folder-select").innerHTML = '<option value="">Unfiled</option>' + state.folders.map(function (folder) {
      return '<option value="' + escapeHTML(folder.path) + '">' + escapeHTML(folder.path) + "</option>";
    }).join("");
    $("folder-select").value = note.folderPath || "";
    $("star-button").hidden = state.nativeSchema || archived;
    $("star-button").classList.toggle("is-starred", note.starred);
    $("star-button").textContent = note.starred ? "Unstar note" : "Star note";
    $("archive-note-button").textContent = archived ? "Restore from Archive" : "Move to Archive";
    $("archive-note-button").setAttribute("aria-label", archived ? "Restore note from Archive" : "Move note to Archive");
    setMotionVisibility(menu, true);
    const zoom = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const maxLeft = Math.max(8, window.innerWidth / zoom - width - 8);
    const maxTop = Math.max(8, window.innerHeight / zoom - height - 8);
    menu.style.left = Math.max(8, Math.min(maxLeft, Number(clientX || 8) / zoom)) + "px";
    menu.style.top = Math.max(8, Math.min(maxTop, Number(clientY || 8) / zoom)) + "px";
    const firstControl = Array.from(menu.querySelectorAll("select, button")).find(function (control) { return control.getClientRects().length > 0; });
    if (firstControl) firstControl.focus();
    const row = document.getElementById("note-row-" + String(recordName).replace(/[^A-Za-z0-9_-]/g, ""));
    if (row) row.setAttribute("aria-expanded", "true");
    if (state.selectedRecordName === recordName) $("note-actions-button").setAttribute("aria-expanded", String(Boolean($("about-note-panel") && $("about-note-panel").classList.contains("is-open"))));
  }

  function closeFolderSubmenu(restoreFocus) {
    const submenu = $("note-folder-submenu");
    if (submenu) setMotionVisibility(submenu, false);
    const trigger = $("context-move-folder");
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus && !trigger.hidden && typeof trigger.focus === "function" && document.activeElement !== trigger) {
        trigger.dataset.suppressOpenOnFocus = "true";
        trigger.focus();
      }
    }
  }

  function positionFolderSubmenu() {
    const menu = $("note-context-menu");
    const trigger = $("context-move-folder");
    const submenu = $("note-folder-submenu");
    if (!menu || !trigger || !submenu || submenu.hidden) return;
    const zoom = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
    const menuLeft = (Number.parseFloat(menu.style.left) || 0) * zoom;
    const menuTop = (Number.parseFloat(menu.style.top) || 0) * zoom;
    const menuWidth = menu.offsetWidth * zoom;
    const menuHeight = menu.offsetHeight * zoom;
    const triggerTop = menuTop + trigger.offsetTop * zoom;
    const width = submenu.offsetWidth * zoom;
    const height = submenu.offsetHeight * zoom;
    const gap = 9;
    let left;
    let top;
    const leftOption = menuLeft - width - gap;
    const rightOption = menuLeft + menuWidth + gap;
    const canPlaceLeft = leftOption >= 8;
    const canPlaceRight = rightOption + width <= window.innerWidth - 8;
    if (!canPlaceLeft && !canPlaceRight) {
      submenu.dataset.placement = "below";
      left = Math.max(8, Math.min(menuLeft, window.innerWidth - width - 8));
      top = menuTop + menuHeight + gap;
      if (top + height > window.innerHeight - 8) top = menuTop - height - gap;
    } else {
      submenu.dataset.placement = "side";
      left = canPlaceRight ? rightOption : leftOption;
      top = triggerTop;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    submenu.style.left = left / zoom + "px";
    submenu.style.top = top / zoom + "px";
  }

  function openFolderSubmenu(focusFirst) {
    const trigger = $("context-move-folder");
    const submenu = $("note-folder-submenu");
    if (!trigger || trigger.hidden || !submenu || $("note-context-menu").hidden) return;
    trigger.setAttribute("aria-expanded", "true");
    setMotionVisibility(submenu, true);
    positionFolderSubmenu();
    if (focusFirst) {
      const first = submenu.querySelector('[role="menuitem"]');
      if (first) first.focus();
    }
  }

  function closeFolderContextMenu(restoreFocus) {
    const menu = $("folder-context-menu");
    const submenu = $("folder-move-submenu");
    if (!menu || menu.hidden) return;
    setMotionVisibility(submenu, false);
    $("folder-context-move").setAttribute("aria-expanded", "false");
    setMotionVisibility(menu, false);
    const invoker = folderActionInvoker;
    folderActionPath = "";
    folderActionInvoker = null;
    if (restoreFocus && invoker && invoker.isConnected) invoker.focus();
  }

  function positionFolderMoveSubmenu() {
    const menu = $("folder-context-menu");
    const trigger = $("folder-context-move");
    const submenu = $("folder-move-submenu");
    if (!menu || menu.hidden || !trigger || trigger.hidden || !submenu || submenu.hidden) return;
    const zoom = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
    const menuLeft = (Number.parseFloat(menu.style.left) || 0) * zoom;
    const menuTop = (Number.parseFloat(menu.style.top) || 0) * zoom;
    const menuWidth = menu.offsetWidth * zoom;
    const menuHeight = menu.offsetHeight * zoom;
    const triggerTop = menuTop + trigger.offsetTop * zoom;
    const width = submenu.offsetWidth * zoom;
    const height = submenu.offsetHeight * zoom;
    const gap = 8;
    const leftOption = menuLeft - width - gap;
    const rightOption = menuLeft + menuWidth + gap;
    const canPlaceLeft = leftOption >= 8;
    const canPlaceRight = rightOption + width <= window.innerWidth - 8;
    let left;
    let top;
    if (!canPlaceLeft && !canPlaceRight) {
      submenu.dataset.placement = "below";
      left = Math.max(8, Math.min(menuLeft, window.innerWidth - width - 8));
      top = menuTop + menuHeight + gap;
      if (top + height > window.innerHeight - 8) top = menuTop - height - gap;
    } else {
      submenu.dataset.placement = "side";
      left = canPlaceRight ? rightOption : leftOption;
      top = triggerTop;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    submenu.style.left = left / zoom + "px";
    submenu.style.top = top / zoom + "px";
  }

  function openFolderMoveSubmenu(focusFirst) {
    const menu = $("folder-context-menu");
    const trigger = $("folder-context-move");
    const submenu = $("folder-move-submenu");
    const source = folderActionPath;
    if (!source || !menu || menu.hidden || !submenu) return;
    const sourceParent = parentPath(source);
    const blocked = new Set(folderSubtreePaths(source));
    const folders = state.folders.filter(function (folder) { return !blocked.has(folder.path) && folder.path !== sourceParent; });
    const leafNames = new Map();
    folders.forEach(function (folder) {
      const leaf = folder.path.split("/").pop();
      leafNames.set(leaf, (leafNames.get(leaf) || 0) + 1);
    });
    const destinations = [{ path: "", label: "All Notes", depth: 0, count: state.notes.filter(function (note) { return !isArchived(note.record) && !note.folderPath; }).length }].concat(folders.map(function (folder) {
      const depth = Math.max(0, folder.path.split("/").length - 1);
      const leaf = folder.path.split("/").pop();
      const count = state.notes.filter(function (note) {
        return !isArchived(note.record) && (note.folderPath === folder.path || note.folderPath.indexOf(folder.path + "/") === 0);
      }).length;
      return { path: folder.path, label: leafNames.get(leaf) > 1 ? folder.path : leaf, depth: depth, count: count };
    }));
    submenu.replaceChildren();
    destinations.forEach(function (destination) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "note-folder-item";
      button.setAttribute("role", "menuitem");
      button.tabIndex = -1;
      button.dataset.folderDestination = destination.path;
      button.dataset.depth = String(destination.depth);
      button.style.paddingLeft = "calc(var(--space-3) + " + destination.depth + "rem)";
      const label = document.createElement("span");
      label.textContent = destination.label;
      button.appendChild(label);
      const count = document.createElement("span");
      count.className = "note-folder-item-count";
      count.textContent = String(destination.count);
      button.appendChild(count);
      submenu.appendChild(button);
    });
    if (!destinations.length) {
      const empty = document.createElement("div");
      empty.className = "note-folder-empty";
      empty.textContent = "No available folders.";
      submenu.appendChild(empty);
    }
    trigger.setAttribute("aria-expanded", "true");
    setMotionVisibility(submenu, true);
    positionFolderMoveSubmenu();
    if (focusFirst) {
      const first = submenu.querySelector('[role="menuitem"]');
      if (first) first.focus();
    }
  }

  function openFolderContextMenu(path, clientX, clientY, invoker) {
    closeNoteActions(false);
    closeFolderContextMenu(false);
    folderActionPath = path || "";
    folderActionInvoker = invoker || document.activeElement;
    const menu = $("folder-context-menu");
    const hasFolder = Boolean(folderActionPath);
    $("folder-context-create").hidden = hasFolder;
    $("folder-context-subfolder").hidden = !hasFolder;
    $("folder-context-rename").hidden = !hasFolder;
    $("folder-context-move").hidden = !hasFolder;
    $("folder-context-archive").hidden = !hasFolder;
    $("folder-context-move").setAttribute("aria-expanded", "false");
    setMotionVisibility($("folder-move-submenu"), false);
    setMotionVisibility(menu, true);
    const zoom = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const maxLeft = Math.max(8, window.innerWidth / zoom - width - 8);
    const maxTop = Math.max(8, window.innerHeight / zoom - height - 8);
    menu.style.left = Math.max(8, Math.min(maxLeft, Number(clientX || 8) / zoom)) + "px";
    menu.style.top = Math.max(8, Math.min(maxTop, Number(clientY || 8) / zoom)) + "px";
    const first = menu.querySelector('[role="menuitem"]:not([hidden])');
    if (first) first.focus({ preventScroll: true });
  }

  function openNoteContextMenu(recordName, clientX, clientY, invoker) {
    const note = state.notes.find(function (item) { return item.recordName === recordName; });
    if (!note) return;
    closeNoteActions(false);
    const menu = $("note-context-menu");
    const submenu = $("note-folder-submenu");
    const folderButton = $("context-move-folder");
    const archiveButton = $("context-archive-note");
    const openButton = $("context-open-note");
    const archived = isArchived(note.record);
    state.actionMenuRecordName = recordName;
    state.actionMenuInvoker = invoker || document.activeElement;
    folderButton.hidden = archived;
    folderButton.setAttribute("aria-expanded", "false");
    const openLabel = state.preferences.tabsEnabled ? "Open in New Tab" : "Open Note";
    openButton.querySelector("span").textContent = openLabel;
    openButton.setAttribute("aria-label", openLabel);
    archiveButton.querySelector("span").textContent = archived ? "Restore from Archive" : "Move to Archive";
    archiveButton.setAttribute("aria-label", archived ? "Restore note from Archive" : "Move note to Archive");
    const folders = state.folders.slice().sort(function (left, right) { return left.path.localeCompare(right.path); });
    const leafNames = new Map();
    folders.forEach(function (folder) {
      const name = folder.path.split("/").pop();
      leafNames.set(name, (leafNames.get(name) || 0) + 1);
    });
    submenu.innerHTML = folders.length ? folders.map(function (folder) {
      const descendants = folder.path + "/";
      const count = state.notes.filter(function (candidate) {
        return !isArchived(candidate.record) && (candidate.folderPath === folder.path || candidate.folderPath.indexOf(descendants) === 0);
      }).length;
      const leaf = folder.path.split("/").pop();
      const label = leafNames.get(leaf) > 1 ? folder.path : leaf;
      const depth = Math.max(0, folder.path.split("/").length - 1);
      const current = note.folderPath === folder.path ? ' aria-current="true"' : "";
      return '<button class="note-folder-item" type="button" role="menuitem" tabindex="-1" data-depth="' + depth + '" style="padding-left:calc(var(--space-3) + ' + depth + 'rem)" data-folder-path="' + escapeHTML(folder.path) + '"' + current + '><span>' + escapeHTML(label) + '</span><span class="note-folder-item-count">' + count + '</span></button>';
    }).join("") : '<div class="note-folder-empty">No folders yet.</div>';
    setMotionVisibility(submenu, false);
    setMotionVisibility(menu, true);
    const zoom = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const maxLeft = Math.max(8, window.innerWidth / zoom - width - 8);
    const maxTop = Math.max(8, window.innerHeight / zoom - height - 8);
    menu.style.left = Math.max(8, Math.min(maxLeft, Number(clientX || 8) / zoom)) + "px";
    menu.style.top = Math.max(8, Math.min(maxTop, Number(clientY || 8) / zoom)) + "px";
    const row = document.getElementById("note-row-" + String(recordName).replace(/[^A-Za-z0-9_-]/g, ""));
    if (row) row.setAttribute("aria-expanded", "true");
    const first = menu.querySelector('[role="menuitem"]:not([hidden])');
    if (first) first.focus({ preventScroll: true });
  }

  function archiveTargetName() {
    const active = document.activeElement;
    if (active && active.closest && active.closest(".note-card")) return active.dataset.recordName;
    return state.selectedRecordName || state.listCursor;
  }

  function dismissTopSurface() {
    if ($("folder-archive-dialog").open) { $("folder-archive-dialog").close(); return true; }
    if ($("shortcut-help").open) { closeShortcutHelp(); return true; }
    if (!$("settings-modal").hidden) { closeSettings(); return true; }
    if ($("capture-dialog").open) { $("capture-dialog").close(); return true; }
    if ($("search-dialog").open) { $("search-dialog").close(); return true; }
    const contextMenu = $("note-context-menu");
    if (contextMenu && !contextMenu.hidden) {
      if (!$("note-folder-submenu").hidden) closeFolderSubmenu(true);
      else closeNoteActions(true);
      return true;
    }
    const folderMenu = $("folder-context-menu");
    if (folderMenu && !folderMenu.hidden) {
      if (!$("folder-move-submenu").hidden) {
        setMotionVisibility($("folder-move-submenu"), false);
        $("folder-context-move").setAttribute("aria-expanded", "false");
      } else closeFolderContextMenu(true);
      return true;
    }
    const menu = $("note-action-menu");
    if (menu && !menu.hidden) { closeNoteActions(true); return true; }
    if (state.searchPage) { closeExpandedSearch(); return true; }
    if (frame.classList.contains("mobile-sidebar-open") || frame.classList.contains("sidebar-open")) {
      closeMobileNavigation();
      return true;
    }
    return false;
  }

  function handleShortcut(event) {
    if (event.key === "Tab" && !$("settings-modal").hidden && !$("shortcut-help").open) trapFocus(event, $("settings-modal"));
    const api = window.ArborShortcuts;
    if (state.shortcutRecordingId && api) {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        state.shortcutRecordingId = "";
        setShortcutSyncStatus("Shortcut recording canceled.");
        renderSettingsShortcuts();
        return;
      }
      if (["Alt", "AltGraph", "Control", "Meta", "Shift"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const captured = api.captureShortcut(event, shortcutPlatformIsApple());
      if (!captured.binding) {
        setShortcutSyncStatus(captured.error || "Arbor could not record that shortcut.", captured.error);
        return;
      }
      const validation = api.validateShortcut(state.shortcutRecordingId, captured.binding, state.shortcutBindings, shortcutPlatformIsApple());
      if (validation) {
        setShortcutSyncStatus(validation, validation);
        return;
      }
      const id = state.shortcutRecordingId;
      state.shortcutRecordingId = "";
      saveShortcutOperation(id, captured.binding, false);
      setShortcutSyncStatus(state.demo ? "Shortcut changed for this preview." : "Shortcut changed. Syncing with iCloud…");
      renderSettingsShortcuts();
      return;
    }
    if (event.key === "Escape" && !event.isComposing && $("note-context-menu") && !$("note-context-menu").hidden && !$("note-folder-submenu").hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeFolderSubmenu(true);
      return;
    }
    if (!api) {
      if (event.key === "Escape" && !event.isComposing) dismissTopSurface();
      return;
    }
    const target = event.target;
    const id = api.matchArborShortcut(event, {
      applePlatform: api.usesCommandModifier((navigator.platform || "") + " " + (navigator.userAgent || "")),
      bindings: state.shortcutBindings,
      typing: isTypingTarget(target),
      listNavigation: listNavigationAllowed(target)
    });
    if (!id) return;
    if (id === "undo" || id === "redo") {
      const target = event.target;
      const noteEditor = target && ((target.id === "note-title") || (target.closest && target.closest("#note-body")));
      if (isNativeTextEditingTarget(target) && !noteEditor) return;
      const history = state.undoHistory;
      if (!history || (!state.historyCommandPromise && (id === "undo" ? !history.canUndo : !history.canRedo))) return;
      event.preventDefault();
      event.stopPropagation();
      performHistoryCommand(id);
      return;
    }
    if (id === "dismiss") {
      if (dismissTopSurface()) event.preventDefault();
      return;
    }
    if (id !== "list-previous" && id !== "list-next" && id !== "open-note") event.preventDefault();
    if (id === "focus-search" && $("search-dialog").open) { $("search-dialog").close(); return; }
    if (surfaceBlocksCommands() && id !== "help" && id !== "save") return;
    if (id === "help") { toggleShortcutHelp(); return; }
    if (id === "save") { flushSave().catch(function () {}); return; }
    if (id === "new-note") { openCapture(); return; }
    if (id === "new-folder") { createFolder(); return; }
    if (id === "focus-search") {
      if ($("search-dialog").open) $("search-dialog").close();
      else openSearch();
      return;
    }
    if (id === "settings") { openSettings(); return; }
    if (id === "archive-note") { archiveCurrentNote(archiveTargetName()); return; }
    if (id === "list-previous" || id === "list-next") {
      event.preventDefault();
      moveListCursor(id === "list-next" ? 1 : -1);
      return;
    }
    if (id === "open-note") {
      if (target && target.closest && target.closest(".note-card")) return;
      event.preventDefault();
      const notes = orderedVisibleNotes();
      if (!notes.length) return;
      syncListCursor(notes);
      if (state.listCursor) openNote(state.listCursor);
    }
  }

  function wireEvents() {
    bindCorrectionPopover();
    bindSelectionReview();
    $("welcome-continue").addEventListener("click", continueWelcome);
    $("welcome-auth-continue").addEventListener("click", function () { showWelcomeStep("note"); });
    $("welcome-note-form").addEventListener("submit", finishWelcomeNote);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Tab" || event.metaKey || event.ctrlKey || event.altKey || !isTypingTarget(event.target)) {
        document.documentElement.classList.add("keyboard-navigation");
      }
    }, true);
    document.addEventListener("pointerdown", function () {
      document.documentElement.classList.remove("keyboard-navigation");
    }, true);

    const richEditor = $("rich-editor");
    aboutFontControls();
    setAboutTab("information", false);
    $("note-actions-button").addEventListener("click", function () { toggleAboutPanel(); });
    $("about-note-tabs").addEventListener("click", function (event) {
      const tab = event.target.closest('[role="tab"]');
      if (tab) setAboutTab(tab.id === "about-tab-style" ? "style" : "information", false);
    });
    $("about-note-tabs").addEventListener("keydown", function (event) {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "information" : event.key === "End" ? "style"
        : (event.key === "ArrowLeft"
          ? (state.aboutActiveTab === "style" ? "information" : "style")
          : (state.aboutActiveTab === "information" ? "style" : "information"));
      setAboutTab(next, true);
    });
    $("about-note-panel").addEventListener("click", function (event) {
      const fontButton = event.target.closest("[data-about-font-kind]");
      if (fontButton) saveNoteFontValue(fontButton.dataset.aboutFontKind, fontButton.dataset.font);
      if (event.target.closest("#about-make-default")) {
        const note = state.notes.find(function (item) { return item.recordName === state.selectedRecordName; });
        if (note) setNoteFontDefaults(noteFontValue(note.record, "header"), noteFontValue(note.record, "body"));
      }
      if (event.target.closest("#about-style-undo")) undoNoteFontOverrides();
    });
    $("about-note-panel").addEventListener("keydown", function (event) {
      const button = event.target.closest("[data-about-font-kind]");
      if (!button || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const options = Array.from(button.parentElement.querySelectorAll("[data-about-font-kind]"));
      const index = options.indexOf(button);
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
      options[next].click();
      options[next].focus();
    });
    richEditor.addEventListener("focusin", function () { $("note-pane").classList.add("is-writing"); });
    richEditor.addEventListener("focusout", function (event) {
      if (!richEditor.contains(event.relatedTarget) && !$("editor-formatting-tools").contains(event.relatedTarget)) $("note-pane").classList.remove("is-writing");
    });
    $("editor-formatting-tools").querySelectorAll("[data-rich-format]").forEach(function (button) {
      button.addEventListener("mousedown", function (event) { event.preventDefault(); });
      button.addEventListener("click", function () { applyRichFormat(button.dataset.richFormat); });
    });
    $("all-notes-button").addEventListener("click", function () {
      flushSave().finally(function () {
        state.showingArchive = false;
        state.selectedFolder = "";
        state.searchPage = false; frame.classList.remove("is-search-expanded");
        closeNoteActions();
        if (!state.preferences.tabsEnabled) selectNote(null);
        renderAll();
        closeMobileNavigation();
      });
    });
    $("archive-notes-button").addEventListener("click", function () {
      flushSave().finally(function () {
        state.showingArchive = true;
        state.selectedFolder = "";
        state.searchPage = false; frame.classList.remove("is-search-expanded");
        closeNoteActions();
        if (!state.preferences.tabsEnabled) selectNote(null);
        renderAll();
        closeMobileNavigation();
      });
    });
    $("new-folder-button").addEventListener("click", createFolder);
    $("folder-tree").addEventListener("contextmenu", function (event) {
      if (event.target.closest(".folder-row")) return;
      event.preventDefault();
      openFolderContextMenu("", event.clientX, event.clientY, this);
    });
    $("folder-context-create").addEventListener("click", function () {
      closeFolderContextMenu();
      createFolder("");
    });
    $("folder-context-subfolder").addEventListener("click", function () {
      const path = folderActionPath;
      closeFolderContextMenu();
      createFolder(path);
    });
    $("folder-context-rename").addEventListener("click", function () {
      const path = folderActionPath;
      closeFolderContextMenu();
      if (path) renameFolder(path);
    });
    $("folder-context-archive").addEventListener("click", function () {
      const path = folderActionPath;
      closeFolderContextMenu();
      if (path) openFolderArchiveConfirmation(path);
    });
    $("folder-context-move").addEventListener("pointerenter", function () { openFolderMoveSubmenu(false); });
    $("folder-context-move").addEventListener("focus", function () { openFolderMoveSubmenu(false); });
    $("folder-context-move").addEventListener("click", function () {
      if ($("folder-move-submenu").hidden) openFolderMoveSubmenu(true);
      else {
        const first = $("folder-move-submenu").querySelector('[role="menuitem"]');
        if (first) first.focus();
      }
    });
    $("folder-context-menu").addEventListener("pointerover", function (event) {
      if (!event.target.closest("#folder-context-move")) {
        setMotionVisibility($("folder-move-submenu"), false);
        $("folder-context-move").setAttribute("aria-expanded", "false");
      }
    });
    $("folder-context-menu").addEventListener("focusin", function (event) {
      if (!event.target.closest("#folder-context-move")) {
        setMotionVisibility($("folder-move-submenu"), false);
        $("folder-context-move").setAttribute("aria-expanded", "false");
      }
    });
    $("folder-context-menu").addEventListener("keydown", function (event) {
      const items = Array.from(this.querySelectorAll('[role="menuitem"]')).filter(function (item) { return !item.hidden && item.getClientRects().length; });
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        items[(index + delta + items.length) % items.length].focus();
      } else if (event.key === "ArrowRight" && document.activeElement === $("folder-context-move")) {
        event.preventDefault();
        openFolderMoveSubmenu(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeFolderContextMenu(true);
      }
    });
    $("folder-move-submenu").addEventListener("click", function (event) {
      const destination = event.target.closest("[data-folder-destination]");
      if (!destination) return;
      const path = folderActionPath;
      const parent = destination.dataset.folderDestination;
      closeFolderContextMenu();
      if (path) moveFolder(path, parent);
    });
    $("folder-move-submenu").addEventListener("keydown", function (event) {
      const items = Array.from(this.querySelectorAll('[role="menuitem"]')).filter(function (item) { return item.getClientRects().length; });
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        items[(index + delta + items.length) % items.length].focus();
      } else if (event.key === "ArrowLeft" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setMotionVisibility($("folder-move-submenu"), false);
        $("folder-context-move").setAttribute("aria-expanded", "false");
        $("folder-context-move").focus();
      }
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest("#folder-context-menu") && !event.target.closest("#folder-move-submenu")) closeFolderContextMenu();
    });
    $("folder-archive-cancel").addEventListener("click", function () { $("folder-archive-dialog").close(); });
    $("folder-archive-form").addEventListener("submit", function (event) {
      event.preventDefault();
      const path = folderArchivePendingPath;
      const skip = $("folder-archive-skip").checked;
      folderArchivePendingPath = "";
      $("folder-archive-dialog").close();
      if (path) archiveFolder(path, skip);
    });
    $("folder-archive-dialog").addEventListener("click", function (event) {
      if (event.target === this) this.close();
    });
    $("folder-archive-dialog").addEventListener("close", function () { folderArchivePendingPath = ""; });
    $("new-note-button").addEventListener("click", openCapture);
    $("empty-new-note-button").addEventListener("click", openCapture);
    $("star-button").addEventListener("click", toggleStar);
    $("context-open-note").addEventListener("click", function () {
      const recordName = state.actionMenuRecordName;
      closeNoteActions();
      if (recordName) openNote(recordName, { tabIntent: state.preferences.tabsEnabled ? "new" : "replace" });
    });
    $("context-move-folder").addEventListener("pointerenter", function () { openFolderSubmenu(false); });
    $("context-move-folder").addEventListener("focus", function () {
      if (this.dataset.suppressOpenOnFocus === "true") {
        delete this.dataset.suppressOpenOnFocus;
        return;
      }
      openFolderSubmenu(false);
    });
    $("context-move-folder").addEventListener("click", function () {
      if ($("note-folder-submenu").hidden) openFolderSubmenu(true);
      else {
        const first = $("note-folder-submenu").querySelector('[role="menuitem"]');
        if (first) first.focus();
      }
    });
    $("note-context-menu").addEventListener("pointerover", function (event) {
      if (event.target.closest("#context-move-folder")) return;
      const pointerMoved = event.movementX !== 0 || event.movementY !== 0;
      if (document.activeElement !== $("context-move-folder") || pointerMoved) closeFolderSubmenu(false);
    });
    $("note-context-menu").addEventListener("focusin", function (event) {
      if (!event.target.closest("#context-move-folder")) closeFolderSubmenu(false);
    });
    $("note-context-menu").addEventListener("keydown", function (event) {
      const items = Array.from(this.querySelectorAll('[role="menuitem"]')).filter(function (item) { return !item.hidden && item.getClientRects().length; });
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        items[(index + delta + items.length) % items.length].focus();
      } else if (event.key === "ArrowRight" && document.activeElement === $("context-move-folder")) {
        event.preventDefault();
        openFolderSubmenu(true);
      } else if (event.key === "ArrowLeft" && !$("note-folder-submenu").hidden) {
        event.preventDefault();
        closeFolderSubmenu(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeNoteActions(true);
      }
    });
    $("note-folder-submenu").addEventListener("click", function (event) {
      const folder = event.target.closest("[data-folder-path]");
      if (!folder) return;
      const recordName = state.actionMenuRecordName;
      const folderPath = folder.dataset.folderPath;
      closeNoteActions();
      if (recordName) moveNote(recordName, folderPath);
    });
    $("note-folder-submenu").addEventListener("keydown", function (event) {
      const items = Array.from(this.querySelectorAll('[role="menuitem"]')).filter(function (item) { return !item.hidden && item.getClientRects().length; });
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement);
        const delta = event.key === "ArrowDown" ? 1 : -1;
        items[(index + delta + items.length) % items.length].focus();
      } else if (event.key === "ArrowLeft" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeFolderSubmenu(true);
      }
    });
    $("context-archive-note").addEventListener("click", function () {
      const recordName = state.actionMenuRecordName;
      const note = state.notes.find(function (item) { return item.recordName === recordName; });
      closeNoteActions();
      if (!note) return;
      if (isArchived(note.record)) restoreArchivedNote(recordName);
      else archiveCurrentNote(recordName);
    });
    window.addEventListener("resize", function () {
      if (!$("folder-context-menu").hidden) {
        const folderMenu = $("folder-context-menu");
        const zoom = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
        const maxLeft = Math.max(8, window.innerWidth / zoom - folderMenu.offsetWidth - 8);
        const maxTop = Math.max(8, window.innerHeight / zoom - folderMenu.offsetHeight - 8);
        folderMenu.style.left = Math.max(8, Math.min(maxLeft, Number.parseFloat(folderMenu.style.left) || 8)) + "px";
        folderMenu.style.top = Math.max(8, Math.min(maxTop, Number.parseFloat(folderMenu.style.top) || 8)) + "px";
        if (!$("folder-move-submenu").hidden) positionFolderMoveSubmenu();
      }
      if (!$("note-context-menu").hidden) {
        const menu = $("note-context-menu");
        const width = menu.offsetWidth;
        const height = menu.offsetHeight;
        const zoom = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
        const maxLeft = Math.max(8, window.innerWidth / zoom - width - 8);
        const maxTop = Math.max(8, window.innerHeight / zoom - height - 8);
        menu.style.left = Math.min(maxLeft, Number.parseFloat(menu.style.left) || 8) + "px";
        menu.style.top = Math.min(maxTop, Number.parseFloat(menu.style.top) || 8) + "px";
        if (!$("note-folder-submenu").hidden) positionFolderSubmenu();
      }
    });
    $("note-open-button").addEventListener("click", function () {
      const recordName = state.actionMenuRecordName;
      closeNoteActions();
      if (recordName) openNote(recordName);
    });
    $("note-title").addEventListener("input", function () { fitTitle(); scheduleSave(false); });
    const discardDraftButton = $("draft-discard");
    if (discardDraftButton) discardDraftButton.addEventListener("click", discardRecoveredDraft);
    window.addEventListener("beforeunload", function (event) {
      persistCurrentDraft();
      if (!state.dirty && state.saveFlightCount === 0) return;
      event.preventDefault();
      event.returnValue = "";
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        pauseSemanticWorkerForHiddenTab();
        persistCurrentDraft();
        if (state.dirty) flushSave().catch(function () {});
        return;
      }
      const searchIsOpen = state.searchPage || $("search-dialog").open;
      const input = $(state.searchPage ? "expanded-search-input" : "global-search-input");
      const query = input && input.value || state.searchQuery || "";
      if (searchIsOpen && query.trim().length >= 2 && !state.semanticWorkerUnavailable) requestSemanticSearch(query);
    });
    window.addEventListener("pagehide", function () {
      persistCurrentDraft();
      if (state.dirty) flushSave().catch(function () {});
    });
    $("search-nav-button").addEventListener("click", function () { openExpandedSearch(""); });
    document.addEventListener("input", noteSemanticActivity, true);
    document.addEventListener("scroll", noteSemanticActivity, true);
    window.addEventListener("arbor:semantic-index-reset", function () {
      stopSemanticWorker();
      const input = $(state.searchPage ? "expanded-search-input" : "global-search-input");
      const query = String(input && input.value || state.searchQuery || "").trim();
      state.semanticRequestedQuery = query.toLocaleLowerCase();
      state.semanticSearchQuery = "";
      state.semanticLoadingQuery = "";
      state.semanticErrorQuery = "";
      state.semanticProgress = null;
      state.semanticQueryVector = null;
      state.semanticScores = new Map();
      state.semanticPassages = new Map();
      state.semanticResultRevisions = new Map();
      state.semanticPendingNoteIds = new Set();
      state.semanticCurrentRequest = null;
      if (state.searchPage) renderSearchPage();
      else if ($("search-dialog").open) renderSearchSuggestions(query);
    });
    $("search-page-new-note").addEventListener("click", openCapture);
    $("capture-form").addEventListener("submit", function (event) { event.preventDefault(); commitCapture(); });
    $("capture-input").addEventListener("input", resizeCaptureInput);
    $("capture-input").addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); commitCapture(); }
      if (event.key === "Escape") $("capture-dialog").close();
    });
    $("capture-dialog").addEventListener("click", function (event) { if (event.target === $("capture-dialog")) $("capture-dialog").close(); });
    $("capture-dialog").addEventListener("close", function () {
      if (captureResizeAnimation) {
        captureResizeAnimation.cancel();
        captureResizeAnimation = null;
      }
    });
    $("search-form").addEventListener("submit", function (event) {
      event.preventDefault();
      const selected = state.searchItems[state.searchActiveIndex];
      if (selected) openSearchResult(selected.id); else openExpandedSearch($("global-search-input").value);
    });
    $("search-dialog").addEventListener("click", function (event) { if (event.target === $("search-dialog")) $("search-dialog").close(); });
    $("search-dialog").addEventListener("close", function () {
      stopSearchPrompt(); state.searchPromptActive = false; $("search-prompt").hidden = true; $("search-suggestions").hidden = true;
    });
    $("global-search-input").addEventListener("input", function () {
      if ($("global-search-input").value) { state.searchPromptActive = false; stopSearchPrompt(); $("search-prompt").hidden = true; }
      state.searchActiveIndex = -1; renderSearchSuggestions($("global-search-input").value);
    });
    $("global-search-input").addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); moveSearchSelection(event.key === "ArrowDown" ? 1 : -1); }
    });
    $("search-suggestions").addEventListener("click", function (event) {
      const result = event.target.closest("[data-search-note-id]");
      if (result) openSearchResult(result.dataset.searchNoteId);
    });
    $("search-suggestions").addEventListener("mousemove", function (event) {
      const result = event.target.closest("[data-search-index]");
      if (!result) return;
      const index = Number(result.dataset.searchIndex);
      if (!Number.isInteger(index) || index === state.searchActiveIndex) return;
      state.searchActiveIndex = index;
      $("search-suggestions").querySelectorAll("[data-search-index]").forEach(function (item) {
        const active = Number(item.dataset.searchIndex) === index;
        item.classList.toggle("is-active", active); item.setAttribute("aria-selected", String(active));
      });
    });
    $("expanded-search-form").addEventListener("submit", function (event) {
      event.preventDefault(); const selected = state.searchItems[state.searchActiveIndex]; if (selected) openSearchResult(selected.id);
    });
    $("expanded-search-input").addEventListener("input", function () { state.searchActiveIndex = 0; renderSearchPage(); });
    $("expanded-search-input").addEventListener("keydown", function (event) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault(); if (!state.searchItems.length) return;
      state.searchActiveIndex = (state.searchActiveIndex + (event.key === "ArrowDown" ? 1 : -1) + state.searchItems.length) % state.searchItems.length;
      renderSearchPage();
      const active = $("expanded-search-results").querySelector(".is-active"); if (active) active.scrollIntoView({ block: "nearest" });
    });
    $("expanded-search-results").addEventListener("click", function (event) {
      const result = event.target.closest("[data-search-note-id]");
      if (result) openSearchResult(result.dataset.searchNoteId);
    });
    $("mobile-menu-button").addEventListener("click", function () {
      setMobileNavigationOpen(!frame.classList.contains("sidebar-open"));
    });
    $("mobile-sidebar-scrim").addEventListener("click", closeMobileNavigation);
    const mobileDrawerMedia = window.matchMedia("(max-width: 760px)");
    if (mobileDrawerMedia.addEventListener) mobileDrawerMedia.addEventListener("change", synchronizeMobileNavigationBreakpoint);
    else if (mobileDrawerMedia.addListener) mobileDrawerMedia.addListener(synchronizeMobileNavigationBreakpoint);
    $("back-to-list-button").addEventListener("click", function () {
      flushSave().finally(function () { frame.classList.remove("mobile-note-open", "mobile-editor-open"); });
    });
    $("collapse-sidebar-button").addEventListener("click", function () { setSidebarCollapsed(!state.layout.sidebarCollapsed); });
    [[$("sidebar-resizer"), "sidebar"], [$("list-resizer"), "list"]].forEach(function (entry) {
      const resizer = entry[0]; const pane = entry[1];
      resizer.addEventListener("pointerdown", function (event) { beginPaneResize(event, pane); });
      resizer.addEventListener("keydown", function (event) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const before = capturePreferences();
        const current = pane === "sidebar" ? state.layout.sidebarWidth : state.layout.listWidth;
        resizePane(pane, current + (event.key === "ArrowRight" ? 12 : -12));
        recordPreferenceChange(before, "Resize panes");
      });
    });
    $("settings-open").addEventListener("click", openSettings);
    $("settings-close").addEventListener("click", closeSettings);
    const shortcutHelpOpen = $("shortcut-help-open");
    if (shortcutHelpOpen) shortcutHelpOpen.addEventListener("click", openShortcutHelp);
    $("shortcut-help-close").addEventListener("click", closeShortcutHelp);
    $("undo-action-button").addEventListener("click", function () { performHistoryCommand("undo"); });
    $("redo-action-button").addEventListener("click", function () { performHistoryCommand("redo"); });
    $("shortcut-help").addEventListener("cancel", function (event) {
      event.preventDefault();
      closeShortcutHelp();
    });
    $("settings-modal").addEventListener("click", function (event) {
      if (event.target === $("settings-modal")) closeSettings();
    });
    function activateSettingsSection(button) {
      const section = button.dataset.settingsSection;
      document.querySelectorAll("[data-settings-section]").forEach(function (item) {
        const selected = item === button;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
      });
      document.querySelectorAll("[data-settings-page]").forEach(function (page) {
        setMotionVisibility(page, page.dataset.settingsPage === section);
      });
      clearSettingsSearch();
    }
    const settingsTabs = Array.from(document.querySelectorAll("[data-settings-section]"));
    settingsTabs.forEach(function (button, index) {
      button.addEventListener("click", function () { activateSettingsSection(button); });
      button.addEventListener("keydown", function (event) {
        let nextIndex = index;
        if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = (index + 1) % settingsTabs.length;
        else if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = (index - 1 + settingsTabs.length) % settingsTabs.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = settingsTabs.length - 1;
        else return;
        event.preventDefault();
        activateSettingsSection(settingsTabs[nextIndex]);
        settingsTabs[nextIndex].focus();
      });
    });
    const settingsSearch = $("settings-search");
    const settingsSearchResults = $("settings-search-results");
    const settingsSectionsNav = document.querySelector(".settings-sections");
    function clearSettingsSearch() {
      if (!settingsSearch || !settingsSearchResults) return;
      settingsSearch.value = "";
      settingsSearch.setAttribute("aria-expanded", "false");
      settingsSearchResults.replaceChildren();
      settingsSearchResults.hidden = true;
      if (settingsSectionsNav) settingsSectionsNav.hidden = false;
    }
    function focusSettingTarget(target) {
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      const focusable = target.querySelector('[aria-checked="true"], input, select, summary, button');
      if (focusable) focusable.focus({ preventScroll: true });
      else {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    }
    function renderSettingsSearch() {
      if (!settingsSearch || !settingsSearchResults) return;
      const query = settingsSearch.value.trim().toLowerCase();
      settingsSearchResults.replaceChildren();
      settingsSearchResults.hidden = !query;
      settingsSearch.setAttribute("aria-expanded", String(Boolean(query)));
      if (settingsSectionsNav) settingsSectionsNav.hidden = Boolean(query);
      if (!query) return;
      const matches = Array.from(document.querySelectorAll("[data-setting-label]"))
        .filter(function (item) { return !item.hidden && !(item.id === "pwa-settings-field" && item.hidden); })
        .map(function (item) {
          const page = item.closest("[data-settings-page]");
          const section = page && page.dataset.settingsPage;
          const tab = settingsTabs.find(function (button) { return button.dataset.settingsSection === section; });
          const category = tab ? tab.textContent.trim() : "Settings";
          const text = [item.dataset.settingLabel, item.dataset.settingSearch, category].join(" ").toLowerCase();
          return text.includes(query) ? { item: item, section: section, category: category, label: item.dataset.settingLabel } : null;
        }).filter(Boolean).slice(0, 10);
      if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "settings-search-empty";
        empty.textContent = "No settings match that search.";
        settingsSearchResults.appendChild(empty);
        return;
      }
      matches.forEach(function (match) {
        const result = document.createElement("button");
        result.type = "button";
        result.className = "settings-search-result";
        const title = document.createElement("strong");
        title.textContent = match.label;
        const category = document.createElement("small");
        category.textContent = match.category;
        result.append(title, category);
        result.addEventListener("click", function () {
          const tab = settingsTabs.find(function (button) { return button.dataset.settingsSection === match.section; });
          if (tab) activateSettingsSection(tab);
          clearSettingsSearch();
          window.requestAnimationFrame(function () { focusSettingTarget(match.item); });
        });
        settingsSearchResults.appendChild(result);
      });
    }
    settingsSearch.addEventListener("input", renderSettingsSearch);
    settingsSearch.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && settingsSearch.value) { event.preventDefault(); event.stopPropagation(); clearSettingsSearch(); return; }
      if (event.key === "ArrowDown") {
        const first = settingsSearchResults.querySelector(".settings-search-result");
        if (first) { event.preventDefault(); first.focus(); }
      } else if (event.key === "Enter") {
        const results = settingsSearchResults.querySelectorAll(".settings-search-result");
        if (results.length === 1) { event.preventDefault(); results[0].click(); }
      }
    });
    $("settings-shortcut-search").addEventListener("input", renderSettingsShortcuts);
    $("settings-shortcut-rows").addEventListener("click", function (event) {
      const button = event.target.closest("[data-shortcut-id]");
      if (!button) return;
      const id = button.dataset.shortcutId;
      if (state.shortcutRecordingId === id) {
        state.shortcutRecordingId = "";
        setShortcutSyncStatus("Shortcut recording canceled.");
        renderSettingsShortcuts();
      } else beginShortcutRecording(id);
    });
    $("settings-shortcut-reset").addEventListener("click", function () {
      const api = window.ArborShortcuts;
      if (!api) return;
      let timestamp = Math.max(Date.now(), ...state.shortcutOperations.map(function (operation) { return operation.modifiedAt + 1; }));
      const resets = api.SHORTCUT_BINDINGS.map(function (binding) {
        const operation = keyboardShortcutPreferences.createOperation(binding.id, null, true, timestamp);
        timestamp = operation.modifiedAt + 1;
        return operation;
      });
      state.shortcutRecordingId = "";
      applyShortcutOperations(keyboardShortcutPreferences.mergeOperations(state.shortcutOperations, resets));
      setShortcutSyncStatus(state.demo ? "Preview only. Shortcut changes reset when you reload." : "Saved on this browser. Syncing with iCloud…");
      if (!state.demo && state.database) syncKeyboardShortcutPreferences(state.accountSession);
    });
    document.querySelectorAll("[data-setting-group]").forEach(function (button) {
      button.addEventListener("click", function () {
        const group = button.dataset.settingGroup;
        const value = button.dataset.settingValue;
        if (selectedSettingsValue(group) === value) { syncSettingGroup(group); return; }
        const before = capturePreferences();
        if (group === "theme") state.appearance.theme = value;
        else if (group === "headerFont") state.appearance.headerFont = value;
        else if (group === "bodyFont") { state.appearance.bodyFont = value; state.appearance.font = value; }
        else if (group === "textSize") {
          state.appearance.textSize = value;
          state.appearance.bodySize = TEXT_SIZE_OPTIONS[value];
        } else if (group === "margins") {
          state.appearance.margins = value;
          state.appearance.bodyWidth = MARGIN_OPTIONS[value];
        } else if (group === "tabs") state.preferences.tabsEnabled = value === "enabled";
        if (group === "tabs") {
          persistSettingsPreferences();
          reconcileNoteTabPreference();
        }
        else persistAppearance();
        if (group === "theme") applyAppearanceWithMotion();
        else applyAppearance();
        syncSettingsControls();
        const labels = { theme: "Change color theme", headerFont: "Change header font", bodyFont: "Change body font", textSize: "Change note text size", margins: "Change note margins", tabs: "Change note tabs preference" };
        recordPreferenceChange(before, labels[group], "settings-" + group);
      });
      button.addEventListener("keydown", function (event) {
        const group = button.dataset.settingGroup;
        const items = Array.from(document.querySelectorAll('[data-setting-group="' + group + '"]'));
        const index = items.indexOf(button);
        let nextIndex = index;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % items.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + items.length) % items.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = items.length - 1;
        else return;
        event.preventDefault();
        items[nextIndex].click();
        items[nextIndex].focus();
      });
    });
    const noteSortOrder = $("note-sort-order");
    if (noteSortOrder) noteSortOrder.addEventListener("change", function () {
      const value = noteSorting.normalizeOrder(noteSortOrder.value);
      if (state.preferences.noteSortOrder === value) return;
      const before = capturePreferences();
      state.preferences.noteSortOrder = value;
      persistSettingsPreferences();
      syncSettingsControls();
      renderNotes();
      recordPreferenceChange(before, "Change note list sorting", "settings-note-sort");
    });
    const autoCorrect = $("proofreading-autocorrect");
    const grammarSuggestions = $("proofreading-grammar-suggestions");
    const sentenceCapitalization = $("proofreading-sentence-capitalization");
    const dictionaryInput = $("personal-dictionary-input");
    const dictionaryAdd = $("personal-dictionary-add");
    const dictionaryList = $("personal-dictionary-entries");
    function addDictionaryFromSettings() {
      if (!dictionaryInput || !dictionaryInput.value.trim()) return;
      const value = dictionaryInput.value;
      dictionaryInput.value = "";
      queuePersonalDictionaryOperation(value, false);
    }
    if (dictionaryAdd) dictionaryAdd.addEventListener("click", addDictionaryFromSettings);
    if (dictionaryInput) dictionaryInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addDictionaryFromSettings();
    });
    if (dictionaryList) dictionaryList.addEventListener("click", function (event) {
      const button = event.target.closest("[data-dictionary-remove]");
      if (button) queuePersonalDictionaryOperation(button.dataset.dictionaryRemove, true);
    });
    if (autoCorrect) {
      autoCorrect.addEventListener("change", function () {
        const before = capturePreferences();
        state.preferences.autoCorrectHighConfidence = autoCorrect.checked;
        persistSettingsPreferences();
        syncSettingsControls();
        recordPreferenceChange(before, "Change automatic spelling correction", "proofreading-autocorrect");
      });
    }
    if (grammarSuggestions) {
      grammarSuggestions.addEventListener("change", function () {
        const before = capturePreferences();
        state.preferences.checkGrammarSuggestions = grammarSuggestions.checked;
        persistSettingsPreferences();
        syncSettingsControls();
        recordPreferenceChange(before, "Change grammar suggestions", "proofreading-grammar-suggestions");
        const body = $("note-body");
        if (body) scheduleProofreading(body, 0);
      });
    }
    if (sentenceCapitalization) {
      sentenceCapitalization.addEventListener("change", function () {
        const before = capturePreferences();
        state.preferences.checkSentenceCapitalization = sentenceCapitalization.checked;
        if (!sentenceCapitalization.checked) {
          window.clearTimeout(state.capitalizationContextTimer);
          window.clearTimeout(state.capitalizationContextTimeout);
          state.capitalizationContextRequestId += 1;
          state.capitalizationContextPending = null;
          state.capitalizationContextRerun = false;
          state.capitalizationContextLastKey = "";
          state.capitalizationContextCache.clear();
        }
        persistSettingsPreferences();
        syncSettingsControls();
        recordPreferenceChange(before, "Change sentence capitalization checking", "proofreading-sentence-capitalization");
        const body = $("note-body");
        if (body) scheduleProofreading(body, 0);
      });
    }
    const settingsName = $("settings-display-name");
    let accountSettingsBefore = null;
    settingsName.value = settingsAccountName();
    settingsName.addEventListener("focus", function () { accountSettingsBefore = capturePreferences(); });
    settingsName.addEventListener("input", function () {
      state.accountSettings.name = this.value.slice(0, 80);
      persistAccountSettings();
    });
    settingsName.addEventListener("change", function () {
      recordPreferenceChange(accountSettingsBefore, "Change account display name", "settings-account-name");
      accountSettingsBefore = null;
    });
    syncSettingsControls();
    const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    const onThemeMedia = function () { if (appearanceTheme() === "system") applyAppearanceWithMotion(); };
    if (themeMedia.addEventListener) themeMedia.addEventListener("change", onThemeMedia);
    else if (themeMedia.addListener) themeMedia.addListener(onThemeMedia);
    $("note-page").addEventListener("contextmenu", function (event) {
      event.preventDefault();
      if (state.selectedRecordName) openNoteContextMenu(state.selectedRecordName, event.clientX, event.clientY, document.activeElement);
    });
    $("folder-select").addEventListener("change", function () {
      const recordName = state.actionMenuRecordName; const folderPath = this.value; closeNoteActions();
      if (recordName) moveNote(recordName, folderPath);
    });
    $("archive-note-button").addEventListener("click", function () {
      const recordName = state.actionMenuRecordName;
      const note = state.notes.find(function (item) { return item.recordName === recordName; });
      closeNoteActions();
      if (!note) return;
      if (isArchived(note.record)) restoreArchivedNote(recordName);
      else archiveCurrentNote(recordName);
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".note-action-menu") && !event.target.closest("#note-context-menu") && !event.target.closest("#note-folder-submenu") && !event.target.closest("#note-actions-button")) closeNoteActions();
    });
    document.addEventListener("keydown", handleShortcut);
  }

  const welcomeRetry = $("welcome-retry");
  if (welcomeRetry) welcomeRetry.addEventListener("click", function () { window.location.reload(); });
  const listRetry = $("list-message-retry");
  if (listRetry) listRetry.addEventListener("click", function () {
    if (!state.database) { window.location.reload(); return; }
    retryNoteLoad();
  });
  wireEvents();
  window.addEventListener("online", function () {
    if (!state.accountCacheSuspended) flushPendingEdits();
  });
  async function prepareForShellUpdate() {
    const capture = $("capture-dialog");
    if (capture.open && $("capture-input").value.trim()) return { ok: false, reason: "capture" };
    if (state.demo && state.dirty) return { ok: false, reason: "sample" };

    frame.inert = true;
    capture.inert = true;
    $("search-dialog").inert = true;
    try {
      if (state.dirty) persistCurrentDraft();
      await flushSave();
      if (state.dirty || state.saveFlightCount !== 0) {
        cancelShellUpdatePreparation();
        return { ok: false, reason: "save" };
      }
      return { ok: true };
    } catch (_) {
      cancelShellUpdatePreparation();
      return { ok: false, reason: "save" };
    }
  }

  function cancelShellUpdatePreparation() {
    frame.inert = false;
    $("capture-dialog").inert = false;
    $("search-dialog").inert = false;
  }

  function getArborContext() {
    const userRecordName = state.user && state.user.userRecordName ? String(state.user.userRecordName).trim() : "";
    const accountId = state.demo ? "sample-preview" : userRecordName;
    const ready = Boolean(accountId && (state.demo || (state.database && !state.accountCacheSuspended)));
    const notes = state.notes.map(function (note) {
      const fieldBody = state.nativeSchema ? fieldValue(note.record, "text") : note.editorBody;
      const cachedBody = state.bodyCache.get(note.recordName);
      const canonicalBody = typeof fieldBody === "string" ? fieldBody : (typeof cachedBody === "string" ? cachedBody : "");
      const bodyAvailable = typeof fieldBody === "string" || typeof cachedBody === "string";
      const bodyHasUnsavedChanges = state.selectedRecordName === note.recordName && state.dirty;
      return {
        noteId: note.recordName,
        recordName: note.recordName,
        title: note.title,
        body: canonicalBody,
        bodyAvailable: bodyAvailable && !bodyHasUnsavedChanges,
        createdAt: note.createdAt,
        modifiedAt: note.modifiedAt,
        archived: isArchived(note.record),
        path: note.path
      };
    });
    return {
      accountId: accountId,
      session: state.accountSession,
      ready: ready,
      demo: state.demo,
      notes: notes
    };
  }

  function noteBodyReady(note) {
    return noteBodyLoaded(note);
  }

  async function paintCachedLibrary() {
    if (demoMode || state.paintedFromCache) return Boolean(state.paintedFromCache);
    try {
      const cache = await loadAccountCache();
      const stored = cache.readStoredAccountRecordName(window.localStorage);
      if (!stored) return false;
      state.connectionUserID = stored;
      state.cacheKey = libraryCacheKey(stored);
      state.accountCacheSuspended = false;
      loadNoteHistory(state.cacheKey);
      loadEditQueue();
      const restored = await restoreLibraryCache();
      state.loadingRecords = false;
      if (!restored || state.records.size === 0) return false;
      if (!launchLibrary || !launchLibrary.cachedLibraryIsPaintable({ records: Array.from(state.records.values()) })) return false;
      state.paintedFromCache = true;
      syncDerivedCollections();
      showApp();
      renderAll();
      const restoredState = restoreOpenTabsForLoadedNotes();
      let note = state.preferences.tabsEnabled ? restoredState.note : currentNoteFromHistory();
      if (!note) {
        const openedNames = Array.from(state.bodyCache.keys());
        const lastOpened = openedNames.length ? openedNames[openedNames.length - 1] : "";
        note = state.notes.find(function (item) { return item.recordName === lastOpened; }) || null;
      }
      if (note && !noteBodyReady(note)) note = null;
      selectNote(note || null);
      setConnection("Showing notes saved in this browser…", false);
      return true;
    } catch (_) {
      state.loadingRecords = false;
      return false;
    }
  }

  async function finishStartup(cloudKitError) {
    if (state.startupFinished) return;
    state.startupFinished = true;
    if (state.paintPromise) await state.paintPromise;
    if (demoMode || (!cloudKitError && window.CloudKit)) {
      initializeCloudKit();
      return;
    }
    const scriptFailure = cloudKitError && /^APPLE_CLOUDKIT_/.test(String(cloudKitError.code || ""));
    const message = scriptFailure
      ? "Arbor couldn’t load Apple’s sign-in service. Check your connection, then reload."
      : "Arbor couldn’t restore its iCloud session. Your browser may still be signed in to Apple; reload Arbor to retry.";
    if (state.paintedFromCache) showCachedSignInFailure(message);
    else if (!window.CloudKit) {
      showWelcomeCheckError();
      setWelcomeStatus(message, false);
    } else initializeCloudKit();
  }

  state.paintPromise = demoMode ? Promise.resolve(false) : paintCachedLibrary();
  window.arborWeb = {
    clearDrafts: clearDrafts,
    prepareForShellUpdate: prepareForShellUpdate,
    cancelShellUpdatePreparation: cancelShellUpdatePreparation,
    getArborContext: getArborContext,
    finishStartup: finishStartup
  };
  if (!window.__arborStartFromBootstrap) {
    state.paintPromise.then(function () { return finishStartup(window.__arborCloudKitStartupError || null); });
  }
})();
