const CLOUDKIT_WEB_SERVICES = "https://api.apple-cloudkit.com/database/1";
const CLOUDKIT_API_HOST = "api.apple-cloudkit.com";

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
export function createCloudKitAuthTransport({ containerIdentifier, fetchImpl = globalThis.fetch } = {}) {
  if (typeof containerIdentifier !== "string" || !containerIdentifier) throw new TypeError("A CloudKit container identifier is required.");
  if (typeof fetchImpl !== "function") throw new TypeError("Fetch is unavailable.");

  let token = null;
  let lastConsumedToken = null;
  let queue = Promise.resolve();
  const authTokenStore = Object.freeze({
    getToken(requestedContainer) {
      return requestedContainer === containerIdentifier ? token : null;
    },
    putToken(requestedContainer, value) {
      if (requestedContainer === containerIdentifier) token = typeof value === "string" && value ? value : null;
    }
  });

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
      const currentToken = token || (urlToken !== lastConsumedToken ? urlToken : null);
      if (!currentToken) {
        release.resolve();
        throw new Error("Sign in to CloudKit before running this request.");
      }
      token = currentToken;
      lastConsumedToken = currentToken;
      requestURL.searchParams.set("ckWebAuthToken", currentToken);

      let response;
      try {
        const requestInput = typeof Request !== "undefined" && input instanceof Request
          ? new Request(requestURL.toString(), input, init)
          : requestURL.toString();
        response = await fetchImpl(requestInput, init);
      } catch {
        token = null;
        release.resolve();
        throw new Error("CloudKit did not return a usable response.");
      }

      if (!response || !response.body || typeof ReadableStream === "undefined" || typeof Response === "undefined") {
        token = null;
        release.resolve();
        return response;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const tokenPattern = /"ckWebAuthToken"\s*:\s*("(?:\\.|[^"\\])*")/;
      let scanBuffer = "";
      let foundReplacement = false;
      let released = false;
      const finish = () => {
        if (released) return;
        released = true;
        if (!foundReplacement) token = null;
        release.resolve();
      };
      const inspect = (chunk, final) => {
        scanBuffer += decoder.decode(chunk || new Uint8Array(), { stream: !final });
        const match = tokenPattern.exec(scanBuffer);
        if (match) {
          try {
            const replacement = JSON.parse(match[1]);
            token = typeof replacement === "string" && replacement ? replacement : null;
            foundReplacement = Boolean(token);
          } catch {
            token = null;
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
            token = null;
            controller.error(error);
            finish();
          }
        },
        cancel(reason) {
          token = null;
          return reader.cancel(reason).finally(finish);
        }
      });
      return new Response(rotatedBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }).catch((error) => {
      token = null;
      release.resolve();
      throw error;
    });
  }

  return Object.freeze({
    authTokenStore,
    fetch: fetchSerialized,
    clearToken() { token = null; },
    hasToken() { return typeof token === "string" && token.length > 0; }
  });
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

  ensureRecordZone(zoneName) {
    if (typeof zoneName !== "string" || !zoneName) throw new TypeError("A record zone name is required.");
    const zoneID = { zoneName };
    return this.#request("zones/modify", {
      operations: [{ operationType: "create", zone: { zoneID } }]
    }).then((payload) => {
      const result = payload.zones && payload.zones[0];
      const error = result && result.serverErrorCode ? result : payload.serverErrorCode ? payload : null;
      if (error && !["ZONE_ALREADY_EXISTS", "ALREADY_EXISTS", "EXISTS"].includes(safeErrorCode(error))) {
        throw cloudKitError("CloudKit zone creation failed", error);
      }
      if (!error && (!result || !result.zoneID || result.zoneID.zoneName !== zoneName)) throw new TypeError("CloudKit did not confirm creation of the Arbor sync zone.");
      return { zoneID, alreadyExists: Boolean(error || (result && result.serverErrorCode)), record: result || null };
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

  #request(operation, body) {
    const request = () => this.#send(operation, body);
    const result = this.pending.then(request, request);
    this.pending = result.catch(() => undefined);
    return result;
  }

  async #send(operation, body) {
    const token = this.authTokenStore.getToken(this.containerIdentifier);
    if (typeof token !== "string" || !token) throw new Error("Sign in to CloudKit before running this request.");

    const url = new URL(`${CLOUDKIT_WEB_SERVICES}/${encodeURIComponent(this.containerIdentifier)}/${encodeURIComponent(this.environment)}/private/${operation}`);
    url.searchParams.set("ckAPIToken", this.apiToken);
    url.searchParams.set("ckWebAuthToken", token);

    let response;
    let payload;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=UTF-8" },
        body: JSON.stringify(body),
      });
      payload = await response.json();
    } catch {
      // The server may have consumed the one-use token even if the response
      // was lost. Never retry with a token that might already be invalid.
      this.authTokenStore.putToken(this.containerIdentifier, null);
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
