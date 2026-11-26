// Cache one integrity-checked release of the static app shell.
// This worker never caches CloudKit traffic or user data.

importScripts("./shell-release.js");

const APP_SHELL_CACHE = self.ARBOR_SHELL_RELEASE.cacheName;
const RUNTIME_ASSET_CACHE = "arbor-runtime-v1";
const SHELL_ASSETS = self.ARBOR_SHELL_RELEASE.assets;
const SHELL_ASSET_BY_URL = new Map(SHELL_ASSETS.map(function (asset) {
  return [asset.url, asset];
}));
const SHELL_PATHS = new Set(SHELL_ASSETS.map(function (asset) {
  return new URL(asset.url, self.registration.scope).pathname;
}));
const APP_SCOPE_PATH = new URL(self.registration.scope).pathname;
const APP_ROOT_PATH = APP_SCOPE_PATH === "/" ? "" : APP_SCOPE_PATH.replace(/\/$/, "");
const APP_INDEX_URL = new URL("index.html", self.registration.scope).href;
const APP_INDEX_PATH = new URL("index.html", self.registration.scope).pathname;
const AUTH_CALLBACK_URL = new URL("auth-callback.html", self.registration.scope);
const RUNTIME_VENDOR_PATH = new URL("vendor/", self.registration.scope).pathname;
const RUNTIME_MODELS_PATH = new URL("models/", self.registration.scope).pathname;

function isWithinAppScope(pathname) {
  return pathname === APP_ROOT_PATH || pathname.startsWith(APP_SCOPE_PATH);
}

function isCloudKitHost(hostname) {
  return hostname === "cdn.apple-cloudkit.com"
    || hostname === "api.apple-cloudkit.com"
    || hostname.endsWith(".apple-cloudkit.com");
}

function isAppNavigation(url, request) {
  if (request.mode !== "navigate") return false;
  return url.pathname === APP_ROOT_PATH || url.pathname === APP_SCOPE_PATH || url.pathname === APP_INDEX_PATH;
}

function isRuntimeAsset(pathname) {
  return pathname.startsWith(RUNTIME_VENDOR_PATH) || pathname.startsWith(RUNTIME_MODELS_PATH);
}

function canStore(response) {
  return response && response.ok && response.type === "basic" && !response.redirected && response.status !== 206;
}

async function responseHash(response) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await response.clone().arrayBuffer()));
  return Array.from(digest, function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
}

async function verifyWorkerRelease() {
  const response = await fetch(self.location.href, {
    cache: "reload",
    credentials: "same-origin",
    redirect: "error"
  });
  if (!canStore(response)) throw new Error("App shell worker request failed");
  if (await responseHash(response) !== self.ARBOR_SHELL_RELEASE.workerSha256) {
    throw new Error("App shell worker does not match its release manifest");
  }
}

function isOptionalWritingAsset(asset) {
  const filename = new URL(asset.url, self.registration.scope).pathname.split("/").pop();
  return filename.startsWith("proofreading-") || filename.startsWith("paragraph-proofreading-")
    || filename.startsWith("gector-")
    || ["proofreading.js", "paragraph-proofreader.js", "personal-dictionary.js", "autocorrect.js",
      "display-name.js", "note-revisions.js", "theme-bootstrap.js"].includes(filename);
}

async function cacheShellAsset(cache, asset) {
  const url = new URL(asset.url, self.registration.scope);
  const response = await fetch(url.href, {
    cache: "reload",
    credentials: "same-origin",
    redirect: "error"
  });
  if (!canStore(response)) throw new Error("App shell request failed: " + asset.url);
  if (await responseHash(response) !== asset.sha256) {
    throw new Error("App shell integrity check failed: " + asset.url);
  }
  await cache.put(url.href, response.clone());
  return response;
}

async function precacheShell(cache) {
  for (let start = 0; start < SHELL_ASSETS.length; start += 6) {
    await Promise.all(SHELL_ASSETS.slice(start, start + 6).map(async function (asset) {
      try {
        await cacheShellAsset(cache, asset);
      } catch (error) {
        if (!isOptionalWritingAsset(asset)) throw error;
      }
    }));
  }
}

self.addEventListener("install", function (event) {
  event.waitUntil(verifyWorkerRelease().then(function () {
    return caches.open(APP_SHELL_CACHE).then(precacheShell);
  }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (key) {
      const oldShell = key.startsWith("arbor-shell-") && key !== APP_SHELL_CACHE;
      const oldRuntime = key.startsWith("arbor-runtime-") && key !== RUNTIME_ASSET_CACHE;
      if (oldShell || oldRuntime) return caches.delete(key);
      return Promise.resolve(false);
    }));
  }));
});

// An update takes over only after the user requests it and this is the sole
// open Arbor client. Activating removes the previous shell cache, so another
// tab must not still be running against that release.
self.addEventListener("message", function (event) {
  if (!event.data || event.data.type !== "ARBOR_APPLY_UPDATE") return;
  event.waitUntil((async function () {
    const source = event.source;
    const port = event.ports && event.ports[0];
    const sourceUrl = source && source.url ? new URL(source.url) : null;
    const sourceIsApp = sourceUrl && sourceUrl.origin === self.location.origin && isWithinAppScope(sourceUrl.pathname);
    if (!source || source.type !== "window" || !sourceIsApp) {
      if (port) port.postMessage({ type: "ARBOR_UPDATE_REJECTED" });
      return;
    }

    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const appClients = clients.filter(function (client) {
      try {
        const url = new URL(client.url);
        return url.origin === self.location.origin && isWithinAppScope(url.pathname);
      } catch (_) {
        return false;
      }
    });
    if (appClients.length !== 1 || appClients[0].id !== source.id) {
      if (port) port.postMessage({ type: "ARBOR_UPDATE_BLOCKED", reason: "other-tabs" });
      return;
    }

    try {
      await self.skipWaiting();
      if (port) port.postMessage({ type: "ARBOR_UPDATE_ACCEPTED" });
    } catch (_) {
      if (port) port.postMessage({ type: "ARBOR_UPDATE_REJECTED" });
    }
  })());
});

function offlineShellResponse() {
  return new Response("Arbor could not load a complete app-shell release. Reopen the page to retry.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function readShellAsset(url) {
  const key = `${url.pathname}${url.search}`;
  const asset = SHELL_ASSET_BY_URL.get(key);
  if (!asset) return Promise.resolve(offlineShellResponse());
  return caches.open(APP_SHELL_CACHE).then(function (cache) {
    return cache.match(new URL(key, self.registration.scope).href).then(function (cached) {
      if (cached) return cached;
      if (isOptionalWritingAsset(asset)) return cacheShellAsset(cache, asset).catch(offlineShellResponse);
      return offlineShellResponse();
    });
  });
}

function shellNavigate() {
  return caches.open(APP_SHELL_CACHE).then(function (cache) {
    return cache.match(APP_INDEX_URL).then(function (cached) {
      return cached || offlineShellResponse();
    });
  });
}

function store(cache, key, response) {
  if (!canStore(response)) return Promise.resolve(response);
  const copy = response.clone();
  return cache.put(key, copy).then(function () { return response; });
}

function cacheFirst(request) {
  return caches.open(RUNTIME_ASSET_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        return store(cache, request, response);
      });
    });
  });
}

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;
  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  if (isCloudKitHost(url.hostname)) return;
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && url.pathname === AUTH_CALLBACK_URL.pathname) {
    // Only the canonical, integrity-checked document may enter Cache Storage.
    // Keep the original navigation URL out of network requests and cache keys.
    event.respondWith(readShellAsset(AUTH_CALLBACK_URL).then(function (response) {
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("Referrer-Policy", "no-referrer");
      return new Response(response.body, { status: response.status, headers: headers });
    }));
    return;
  }
  if (request.headers.has("range")) return;

  if (isAppNavigation(url, request)) {
    event.respondWith(shellNavigate());
    return;
  }
  if (SHELL_PATHS.has(url.pathname)) {
    event.respondWith(readShellAsset(url));
    return;
  }
  if (isRuntimeAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
