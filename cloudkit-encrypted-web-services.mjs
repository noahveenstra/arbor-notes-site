const CLOUDKIT_WEB_SERVICES = "https://api.apple-cloudkit.com/database/1";

function safeErrorCode(payload) {
  const code = String(payload && payload.serverErrorCode || "REQUEST_FAILED");
  return /^[A-Z_]+$/.test(code) ? code : "REQUEST_FAILED";
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

  createEncryptedStringRecord(recordType, recordName, fieldName, value) {
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
    }).then((payload) => {
      const result = payload.records && payload.records[0];
      if (!result || result.serverErrorCode) throw new Error(`CloudKit record creation failed (${safeErrorCode(result || payload)}).`);
      return result;
    });
  }

  lookupRecord(recordName, desiredKeys) {
    if (typeof recordName !== "string" || !recordName) throw new TypeError("Record name is required.");
    const payload = { records: [{ recordName }] };
    if (Array.isArray(desiredKeys)) payload.desiredKeys = desiredKeys;

    return this.#request("records/lookup", payload).then((response) => {
      const result = response.records && response.records[0];
      if (!result || result.serverErrorCode) throw new Error(`CloudKit record lookup failed (${safeErrorCode(result || response)}).`);
      return result;
    });
  }

  deleteRecord(recordName) {
    if (typeof recordName !== "string" || !recordName) throw new TypeError("Record name is required.");

    return this.#request("records/modify", {
      operations: [{ operationType: "delete", record: { recordName } }],
    }).then((payload) => {
      const result = payload.records && payload.records[0];
      if (!result || result.serverErrorCode) throw new Error(`CloudKit record cleanup failed (${safeErrorCode(result || payload)}).`);
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
    if (!response.ok || payload.serverErrorCode) {
      throw new Error(`CloudKit Web Services request failed (${safeErrorCode(payload)}).`);
    }
    if (typeof replacement !== "string" || !replacement) {
      throw new Error("CloudKit did not return a replacement authentication token.");
    }
    return payload;
  }
}
