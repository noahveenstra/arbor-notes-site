// Account-local, reload-safe undo history for browser actions.
export const UNDO_HISTORY_DATABASE = "arbor-web-undo-history";
export const UNDO_HISTORY_MAX_ACTIONS = 100;
export const UNDO_HISTORY_MAX_BYTES = 8 * 1024 * 1024;
export const UNDO_GROUP_WINDOW_MS = 800;

function cloneValue(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function approximateBytes(value) {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
  catch (_) { return Number.POSITIVE_INFINITY; }
}

function openDatabase(indexedDB) {
  return new Promise(function (resolve) {
    if (!indexedDB || typeof indexedDB.open !== "function") { resolve(null); return; }
    let request;
    try { request = indexedDB.open(UNDO_HISTORY_DATABASE, 1); }
    catch (_) { resolve(null); return; }
    request.onupgradeneeded = function () {
      const database = request.result;
      if (!database.objectStoreNames.contains("accounts")) database.createObjectStore("accounts", { keyPath: "key" });
    };
    request.onsuccess = function () {
      const database = request.result;
      database.onversionchange = function () { database.close(); };
      resolve(database);
    };
    request.onerror = function () { resolve(null); };
    request.onblocked = function () { resolve(null); };
  });
}

function readAccount(database, key) {
  return new Promise(function (resolve) {
    if (!database) { resolve(null); return; }
    let request;
    try { request = database.transaction("accounts", "readonly").objectStore("accounts").get(key); }
    catch (_) { resolve(null); return; }
    request.onsuccess = function () { resolve(request.result || null); };
    request.onerror = function () { resolve(null); };
  });
}

function writeAccount(database, entry) {
  return new Promise(function (resolve, reject) {
    if (!database) { reject(new Error("Undo history storage is unavailable.")); return; }
    let transaction;
    try {
      transaction = database.transaction("accounts", "readwrite");
      transaction.objectStore("accounts").put(entry);
    } catch (error) { reject(error); return; }
    transaction.oncomplete = function () { resolve(); };
    transaction.onerror = function () { reject(transaction.error || new Error("Undo history could not be saved.")); };
    transaction.onabort = function () { reject(transaction.error || new Error("Undo history could not be saved.")); };
  });
}

export async function openUndoHistory(options) {
  const opts = options || {};
  const key = String(opts.accountKey || "");
  if (!key) throw new Error("Undo history needs an account key.");
  const memoryOnly = Boolean(opts.memoryOnly);
  const database = memoryOnly ? null : await openDatabase(opts.indexedDB);
  const stored = database ? await readAccount(database, key) : null;
  let undoStack = Array.isArray(stored && stored.undoStack) ? stored.undoStack : [];
  let redoStack = Array.isArray(stored && stored.redoStack) ? stored.redoStack : [];
  let closed = false;
  let persistenceAvailable = memoryOnly || Boolean(database);
  let writeChain = Promise.resolve();
  const onChange = typeof opts.onChange === "function" ? opts.onChange : function () {};
  const maxActions = Math.max(1, Number(opts.maxActions) || UNDO_HISTORY_MAX_ACTIONS);
  const maxBytes = Math.max(1024, Number(opts.maxBytes) || UNDO_HISTORY_MAX_BYTES);

  function notify(error) {
    try {
      onChange({
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        undoLabel: undoStack.length ? undoStack[undoStack.length - 1].label : "",
        redoLabel: redoStack.length ? redoStack[redoStack.length - 1].label : "",
        persistenceAvailable: persistenceAvailable,
        error: error || null
      });
    } catch (_) {}
  }

  function persist() {
    if (closed || memoryOnly || !database) return Promise.resolve(false);
    const snapshot = {
      key: key,
      undoStack: cloneValue(undoStack),
      redoStack: cloneValue(redoStack),
      updatedAt: Date.now()
    };
    const next = writeChain.then(function () { return writeAccount(database, snapshot); });
    writeChain = next.then(function () {
      persistenceAvailable = true;
      notify();
      return true;
    }, function (error) {
      persistenceAvailable = false;
      notify(error);
      return false;
    });
    return writeChain;
  }

  function trimHistory() {
    while (undoStack.length > maxActions) undoStack.shift();
    while (redoStack.length > maxActions) redoStack.shift();
    while (approximateBytes({ undoStack: undoStack, redoStack: redoStack }) > maxBytes && undoStack.length) undoStack.shift();
    while (approximateBytes({ undoStack: undoStack, redoStack: redoStack }) > maxBytes && redoStack.length) redoStack.shift();
  }

  const controller = {
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    get persistenceAvailable() { return persistenceAvailable; },
    get undoLabel() { return undoStack.length ? undoStack[undoStack.length - 1].label : ""; },
    get redoLabel() { return redoStack.length ? redoStack[redoStack.length - 1].label : ""; },
    record: function (action) {
      return controller.recordMany([action]);
    },
    recordMany: function (actions) {
      if (closed) return Promise.resolve(false);
      let recorded = false;
      for (const action of actions) {
        if (!action || !action.kind || !action.target) continue;
        const next = cloneValue(action);
        const now = Number(next.updatedAt) || Date.now();
        next.updatedAt = now;
        next.label = String(next.label || "Change");
        const previous = undoStack[undoStack.length - 1];
        if (next.groupKey && previous && previous.groupKey === next.groupKey && now - previous.updatedAt <= UNDO_GROUP_WINDOW_MS) {
          previous.after = next.after;
          previous.afterSelection = next.afterSelection;
          previous.updatedAt = now;
          previous.label = next.label;
        } else {
          undoStack.push(next);
        }
        recorded = true;
      }
      if (!recorded) return Promise.resolve(false);
      redoStack = [];
      trimHistory();
      notify();
      return persist();
    },
    // Formatting can be undone before the first save of a newly created
    // note. Insert its eventual Create action below those editor actions and
    // keep any format Redo that the user already earned while the save ran.
    recordCreationBeforeEdits: function (action) {
      if (closed || action?.kind !== "created-record" || !action.target) return Promise.resolve(false);
      const isCreation = entry => entry.kind === "created-record" && entry.target === action.target;
      if (undoStack.some(isCreation) || redoStack.some(isCreation)) return Promise.resolve(true);
      const creation = cloneValue(action);
      const first = undoStack.findIndex(entry => entry.target === action.target && entry.initialListEdit);
      undoStack.splice(first < 0 ? undoStack.length : first, 0, creation);
      trimHistory();
      notify();
      return persist();
    },
    peekUndo: function () { return undoStack.length ? cloneValue(undoStack[undoStack.length - 1]) : null; },
    peekRedo: function () { return redoStack.length ? cloneValue(redoStack[redoStack.length - 1]) : null; },
    undo: async function (apply) {
      const action = controller.peekUndo();
      if (!action || typeof apply !== "function") return false;
      await apply(action, "undo");
      if (closed) return false;
      undoStack.pop();
      redoStack.push(action);
      trimHistory();
      notify();
      await persist();
      return true;
    },
    redo: async function (apply) {
      const action = controller.peekRedo();
      if (!action || typeof apply !== "function") return false;
      await apply(action, "redo");
      if (closed) return false;
      redoStack.pop();
      undoStack.push(action);
      trimHistory();
      notify();
      await persist();
      return true;
    },
    discardTarget: function (target) {
      const value = String(target || "");
      if (!value) return Promise.resolve(false);
      undoStack = undoStack.filter(function (action) { return action.target !== value; });
      redoStack = redoStack.filter(function (action) { return action.target !== value; });
      notify();
      return persist();
    },
    flush: function () { return writeChain; },
    close: async function () {
      if (closed) return;
      await writeChain;
      closed = true;
      if (database) database.close();
    }
  };
  notify();
  return controller;
}
