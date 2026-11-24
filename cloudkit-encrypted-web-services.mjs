const CLOUDKIT_WEB_SERVICES = "https://api.apple-cloudkit.com/database/1";
const CLOUDKIT_API_HOST = "api.apple-cloudkit.com";
const CLOUDKIT_SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function cloudKitURL(input) {
  try {
    if (typeof Request !== "undefined" && input instanceof Request) return new URL(input.url);
    return new URL(String(input), globalThis.location && globalThis.location.href || "https://arbor.invalid/");
  } catch {
    return null;
  }
}

/**
 * Creates one in-memory CloudKit JS auth-token store and a fetch adapter shared
 * by CloudKit JS and the encrypted-field Web Services client. Authenticated
 * CloudKit requests are serialized until the response body yields its rotated
 * one-use token, so concurrent SDK and sync requests cannot reuse a token.
 */
export function createCloudKitAuthTransport({
  containerIdentifier,
  fetchImpl = globalThis.fetch,
  tokenStore: suppliedTokenStore,
  documentRef = globalThis.document,
  locationRef = globalThis.location
} = {}) {
  if (typeof containerIdentifier !== "string" || !containerIdentifier) throw new TypeError("A CloudKit container identifier is required.");
  if (typeof fetchImpl !== "function") throw new TypeError("Fetch is unavailable.");

  const tokenStore = suppliedTokenStore || createCloudKitCookieAuthTokenStore(containerIdentifier, { documentRef, locationRef });
  if (!tokenStore || typeof tokenStore.getToken !== "function" || typeof tokenStore.putToken !== "function") {
    throw new TypeError("A CloudKit auth token store is required.");
  }
  const authTokenStore = Object.freeze({
    getToken(requestedContainer) {
      return requestedContainer === containerIdentifier ? tokenStore.getToken(containerIdentifier) : null;
    },
    putToken(requestedContainer, value) {
      if (requestedContainer === containerIdentifier) tokenStore.putToken(containerIdentifier, value);
    }
  });
  let lastConsumedToken = null;
  let queue = Promise.resolve();
  const setToken = value => authTokenStore.putToken(containerIdentifier, typeof value === "string" && value ? value : null);

  function fetchSerialized(input, init) {
    const originalURL = cloudKitURL(input);
    if (!originalURL || originalURL.hostname !== CLOUDKIT_API_HOST || !originalURL.searchParams.has("ckWebAuthToken")) {
      return fetchImpl(input, init);
    }

    const previous = queue.catch(() => undefined);
    const release = deferred();
    queue = release.promise;
    return previous.then(async () => {
      const requestURL = cloudKitURL(input);
      const urlToken = requestURL.searchParams.get("ckWebAuthToken");
      const storedToken = authTokenStore.getToken(containerIdentifier);
      const currentToken = storedToken || (urlToken !== lastConsumedToken ? urlToken : null);
      if (!currentToken) {
        release.resolve();
        throw new Error("Sign in to CloudKit before running this request.");
      }
      setToken(currentToken);
      lastConsumedToken = currentToken;
      requestURL.searchParams.set("ckWebAuthToken", currentToken);

      let response;
      try {
        const requestInput = typeof Request !== "undefined" && input instanceof Request
          ? new Request(requestURL.toString(), input, init)
          : requestURL.toString();
        response = await fetchImpl(requestInput, init);
      } catch {
        // A network failure does not tell us whether Apple consumed the token.
        // Keep the last token so a request that never reached Apple does not
        // force a new sign-in on the next page load. If Apple did consume it,
        // its explicit authentication error will clear the stale value below.
        release.resolve();
        throw new Error("CloudKit did not return a usable response.");
      }

      if (!response || !response.body || typeof ReadableStream === "undefined" || typeof Response === "undefined") {
        release.resolve();
        return response;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const tokenPattern = /"ckWebAuthToken"\s*:\s*("(?:\\.|[^"\\])*")/;
      let scanBuffer = "";
      let foundReplacement = false;
      let released = false;
      const finish = (clearUnrotatedToken = true) => {
        if (released) return;
        released = true;
        if (clearUnrotatedToken && !foundReplacement) setToken(null);
        release.resolve();
      };
      const inspect = (chunk, final) => {
        scanBuffer += decoder.decode(chunk || new Uint8Array(), { stream: !final });
        const match = tokenPattern.exec(scanBuffer);
        if (match) {
          try {
            const replacement = JSON.parse(match[1]);
            foundReplacement = typeof replacement === "string" && Boolean(replacement);
            setToken(foundReplacement ? replacement : null);
          } catch {
            setToken(null);
          }
        }
        if (!foundReplacement && scanBuffer.length > 1024) scanBuffer = scanBuffer.slice(-1024);
      };
      const rotatedBody = new ReadableStream({
        async pull(controller) {
          try {
            const { value, done } = await reader.read();
            if (done) {
              inspect(null, true);
              controller.close();
              finish();
              return;
            }
            inspect(value, false);
            controller.enqueue(value);
          } catch (error) {
            controller.error(error);
            finish(false);
          }
        },
        cancel(reason) {
          return reader.cancel(reason).finally(function () {
            // The response may have carried its replacement token after the
            // unread portion. Leave validation to the next authenticated call.
            if (!released) {
              released = true;
              release.resolve();
            }
          });
        }
      });
      return new Response(rotatedBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }).catch((error) => {
      release.resolve();
      throw error;
    });
  }

  return Object.freeze({
    authTokenStore,
    fetch: fetchSerialized,
    clearToken() { setToken(null); },
    hasToken() {
      const current = authTokenStore.getToken(containerIdentifier);
      return typeof current === "string" && current.length > 0;
    }
  });
}

/**
 * CloudKit JS calls this store for its session token. Keep the token in a
 * first-party cookie so the same auth state survives a page reload without
 * copying it into note storage, localStorage, IndexedDB, or Cache Storage.
 */
export function createCloudKitCookieAuthTokenStore(containerIdentifier, {
  documentRef = globalThis.document,
  locationRef = globalThis.location,
  maxAgeSeconds = CLOUDKIT_SESSION_MAX_AGE_SECONDS
} = {}) {
  if (typeof containerIdentifier !== "string" || !containerIdentifier) throw new TypeError("A CloudKit container identifier is required.");
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 1) throw new TypeError("A positive CloudKit session lifetime is required.");

  const secure = Boolean(locationRef && locationRef.protocol === "https:");
  const safeContainerSuffix = containerIdentifier.replace(/[^A-Za-z0-9_.-]/g, "_");
  const cookieName = `${secure ? "__Host-" : ""}arbor-cloudkit-${safeContainerSuffix}`;
  let memoryToken = null;

  function readCookie() {
    if (!documentRef) return memoryToken;
    try {
      const prefix = cookieName + "=";
      const entry = String(documentRef.cookie || "").split(";").map(part => part.trim()).find(part => part.startsWith(prefix));
      if (!entry) return null;
      const value = entry.slice(prefix.length);
      if (!value) return null;
      try { return decodeURIComponent(value); }
      catch (_) { return null; }
    } catch (_) {
      return null;
    }
  }

  function getToken(requestedContainer) {
    if (requestedContainer !== containerIdentifier) return null;
    const stored = readCookie();
    if (documentRef) {
      memoryToken = typeof stored === "string" && stored ? stored : null;
      return memoryToken;
    }
    return memoryToken;
  }

  function putToken(requestedContainer, value) {
    if (requestedContainer !== containerIdentifier) return;
    memoryToken = typeof value === "string" && value ? value : null;
    if (!documentRef) return;
    const encoded = memoryToken ? encodeURIComponent(memoryToken) : "";
    const maxAge = memoryToken ? maxAgeSeconds : 0;
    const secureAttribute = secure ? "; Secure" : "";
    try {
      documentRef.cookie = `${cookieName}=${encoded}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secureAttribute}`;
    } catch (_) {
      // Without a readable first-party cookie the auth store returns no token;
      // do not move the session into localStorage or another note-data store.
    }
  }

  return Object.freeze({ getToken, putToken });
}

function safeErrorCode(payload) {
  const code = String(payload && payload.serverErrorCode || "REQUEST_FAILED");
  return /^[A-Z_]+$/.test(code) ? code : "REQUEST_FAILED";
}

function cloudKitError(message, payload) {
  const code = safeErrorCode(payload);
  const error = new Error(`${message} (${code}).`);
  error.code = code;
  return error;
}

/**
 * Minimal authenticated CloudKit Web Services client for encrypted fields.
 * CloudKit web-auth tokens are single-use, so requests are serialized and the
 * replacement token is retained only by the supplied in-memory token store.
 */
export class CloudKitEncryptedWebServices {
  constructor({ containerIdentifier, environment, apiToken, authTokenStore, fetchImpl = globalThis.fetch }) {
    if (!containerIdentifier || !environment || !apiToken) throw new TypeError("CloudKit configuration is incomplete.");
    if (!authTokenStore || typeof authTokenStore.getToken !== "function" || typeof authTokenStore.putToken !== "function") {
      throw new TypeError("An authentication token store is required.");
    }
    if (typeof fetchImpl !== "function") throw new TypeError("Fetch is unavailable.");

    this.containerIdentifier = containerIdentifier;
    this.environment = environment;
    this.apiToken = apiToken;
    this.authTokenStore = authTokenStore;
    this.fetchImpl = fetchImpl;
    this.pending = Promise.resolve();
  }

  createEncryptedStringRecord(recordType, recordName, fieldName, value, zoneID) {
    if (![recordType, recordName, fieldName].every((part) => typeof part === "string" && part.length > 0)) {
      throw new TypeError("Record type, name, and field name are required.");
    }
    if (typeof value !== "string") throw new TypeError("Encrypted string values must be strings.");

    return this.#request("records/modify", {
      operations: [{
        operationType: "create",
        record: {
          recordType,
          recordName,
          fields: { [fieldName]: { value, type: "STRING", isEncrypted: true } },
        },
      }],
      ...(zoneID ? { zoneID } : {})
    }).then((payload) => {
      const result = payload.records && payload.records[0];
      if (!result || result.serverErrorCode) throw cloudKitError("CloudKit record creation failed", result || payload);
      return result;
    });
  }

  updateEncryptedStringRecord(recordType, recordName, fieldName, value, recordChangeTag, zoneID) {
    if (![recordType, recordName, fieldName, recordChangeTag].every((part) => typeof part === "string" && part.length > 0)) {
      throw new TypeError("Record type, name, field, and change tag are required.");
    }
    if (typeof value !== "string") throw new TypeError("Encrypted string values must be strings.");
    return this.#request("records/modify", {
      operations: [{
        operationType: "update",
        record: {
          recordType,
          recordName,
          recordChangeTag,
          fields: { [fieldName]: { value, type: "STRING", isEncrypted: true } }
        }
      }],
      ...(zoneID ? { zoneID } : {})
    }).then((payload) => {
      const result = payload.records && payload.records[0];
      if (!result || result.serverErrorCode) throw cloudKitError("CloudKit record update failed", result || payload);
      return result;
    });
  }

  ensureRecordZone(zoneNameOrID) {
    const zoneID = typeof zoneNameOrID === "string" ? { zoneName: zoneNameOrID } : zoneNameOrID;
    if (!zoneID || typeof zoneID.zoneName !== "string" || !zoneID.zoneName) throw new TypeError("A record zone is required.");
    return this.#request("zones/modify", {
      operations: [{ operationType: "create", zone: { zoneID } }]
    }).then((payload) => {
      const result = payload.zones && payload.zones[0];
      const error = result && result.serverErrorCode ? result : payload.serverErrorCode ? payload : null;
      if (error && !["ZONE_ALREADY_EXISTS", "ALREADY_EXISTS", "EXISTS"].includes(safeErrorCode(error))) {
        throw cloudKitError("CloudKit zone creation failed", error);
      }
      if (!error && (!result || !result.zoneID || result.zoneID.zoneName !== zoneID.zoneName)) throw new TypeError("CloudKit did not confirm creation of the Arbor sync zone.");
      return { zoneID, alreadyExists: Boolean(error || (result && result.serverErrorCode)), record: result || null };
    });
  }

  listRecordZones() {
    return this.#request("zones/list", undefined, "GET");
  }

  fetchRecordZoneChanges(zoneID, syncToken, resultsLimit = 200) {
    if (!zoneID || typeof zoneID.zoneName !== "string" || !zoneID.zoneName || zoneID.zoneName === "_defaultZone") {
      throw new TypeError("A custom record zone is required.");
    }
    const zone = { zoneID };
    if (syncToken) zone.syncToken = syncToken;
    return this.#request("changes/zone", { zones: [zone], resultsLimit });
  }

  lookupRecords(recordNames, zoneID, desiredKeys) {
    if (!Array.isArray(recordNames) || recordNames.some((name) => typeof name !== "string" || !name)) {
      throw new TypeError("Record names are required.");
    }
    if (recordNames.length > 200) throw new RangeError("CloudKit accepts at most 200 record lookups per request.");
    const body = { records: recordNames.map((recordName) => ({ recordName })) };
    if (zoneID) body.zoneID = zoneID;
    if (Array.isArray(desiredKeys)) body.desiredKeys = desiredKeys;
    return this.#request("records/lookup", body);
  }

  modifyRecords(operations, zoneID, atomic = true) {
    if (!Array.isArray(operations) || !operations.length) throw new TypeError("Record operations are required.");
    if (operations.length > 200) throw new RangeError("CloudKit accepts at most 200 record operations per request.");
    return this.#request("records/modify", {
      operations,
      atomic,
      ...(zoneID ? { zoneID } : {})
    });
  }

  requestAssetUploads(tokens, zoneID) {
    if (!Array.isArray(tokens) || !tokens.length) throw new TypeError("Asset upload fields are required.");
    if (tokens.length > 200) throw new RangeError("CloudKit accepts at most 200 asset upload fields per request.");
    return this.#request("assets/upload", { tokens, ...(zoneID ? { zoneID } : {}) });
  }

  uploadAssetData(uploadURL, data) {
    if (typeof uploadURL !== "string" || !uploadURL || !(data instanceof Blob || data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
      throw new TypeError("An asset upload URL and file data are required.");
    }
    return this.fetchImpl(uploadURL, { method: "POST", body: data }).then(async (response) => {
      let payload;
      try { payload = await response.json(); }
      catch { throw new Error("CloudKit asset upload did not return a usable response."); }
      if (!response.ok || !payload || payload.serverErrorCode) throw cloudKitError("CloudKit asset upload failed", payload || {});
      const asset = payload.singleFile || payload;
      if (!asset || typeof asset !== "object" || typeof asset.fileChecksum !== "string" || !asset.fileChecksum) {
        throw new Error("CloudKit asset upload did not confirm the file.");
      }
      return asset;
    });
  }

  lookupRecord(recordName, desiredKeys, zoneID) {
    if (typeof recordName !== "string" || !recordName) throw new TypeError("Record name is required.");
    const payload = { records: [{ recordName }] };
    if (Array.isArray(desiredKeys)) payload.desiredKeys = desiredKeys;
    if (zoneID) payload.zoneID = zoneID;

    return this.#request("records/lookup", payload).then((response) => {
      const result = response.records && response.records[0];
      if (!result || result.serverErrorCode) throw cloudKitError("CloudKit record lookup failed", result || response);
      return result;
    });
  }

  deleteRecord(recordName, zoneID) {
    if (typeof recordName !== "string" || !recordName) throw new TypeError("Record name is required.");

    return this.#request("records/modify", {
      operations: [{ operationType: "delete", record: { recordName } }],
      ...(zoneID ? { zoneID } : {})
    }).then((payload) => {
      const result = payload.records && payload.records[0];
      if (!result || result.serverErrorCode) throw cloudKitError("CloudKit record cleanup failed", result || payload);
      return result;
    });
  }

  request(operation, body, method = "POST") {
    if (typeof operation !== "string" || !/^[a-z]+(?:\/[a-z]+)+$/.test(operation)) throw new TypeError("A valid CloudKit operation is required.");
    if (method !== "GET" && method !== "POST") throw new TypeError("A valid CloudKit method is required.");
    return this.#request(operation, body, method);
  }

  #request(operation, body, method = "POST") {
    const request = () => this.#send(operation, body, method);
    const result = this.pending.then(request, request);
    this.pending = result.catch(() => undefined);
    return result;
  }

  async #send(operation, body, method = "POST") {
    const token = this.authTokenStore.getToken(this.containerIdentifier);
    if (typeof token !== "string" || !token) throw new Error("Sign in to CloudKit before running this request.");

    const url = new URL(`${CLOUDKIT_WEB_SERVICES}/${encodeURIComponent(this.containerIdentifier)}/${encodeURIComponent(this.environment)}/private/${operation}`);
    url.searchParams.set("ckAPIToken", this.apiToken);
    url.searchParams.set("ckWebAuthToken", token);

    let response;
    let payload;
    try {
      response = await this.fetchImpl(url.toString(), method === "GET" ? { method: "GET" } : {
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=UTF-8" },
        body: JSON.stringify(body),
      });
      payload = await response.json();
    } catch {
      // The server may have consumed the one-use token even if the response
      // was lost. Preserve it until Apple explicitly rejects it; the request
      // may have failed before leaving this browser.
      throw new Error("CloudKit Web Services did not return a usable response.");
    }

    const replacement = payload && payload.ckWebAuthToken;
    this.authTokenStore.putToken(
      this.containerIdentifier,
      typeof replacement === "string" && replacement ? replacement : null,
    );
    const zoneAlreadyExists = operation === "zones/modify" && ["ZONE_ALREADY_EXISTS", "ALREADY_EXISTS", "EXISTS"].includes(safeErrorCode(payload));
    if ((!response.ok && !zoneAlreadyExists) || (payload.serverErrorCode && !zoneAlreadyExists)) {
      throw cloudKitError("CloudKit Web Services request failed", payload);
    }
    if (typeof replacement !== "string" || !replacement) {
      throw new Error("CloudKit did not return a replacement authentication token.");
    }
    return payload;
  }
}
