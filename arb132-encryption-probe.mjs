import { CloudKitEncryptedWebServices } from "./cloudkit-encrypted-web-services.mjs";

const TYPE = "ARB132_EncryptionProbe";
const FIELD = "probeEncryptedValue";
const config = window.ARBOR_CLOUDKIT_CONFIG;
const status = document.getElementById("probe-status");
const runButton = document.getElementById("run-probe");
let signedIn = false;
let running = false;
let token = null;

const tokenStore = {
  getToken(containerIdentifier) {
    return containerIdentifier === config.containerIdentifier ? token : null;
  },
  putToken(containerIdentifier, value) {
    if (containerIdentifier === config.containerIdentifier) token = typeof value === "string" ? value : null;
  },
};

function setStatus(message) {
  status.textContent = message;
}

function refreshAvailability() {
  runButton.disabled = !signedIn || !token || running;
}

function connect(identity) {
  signedIn = Boolean(identity);
  if (!signedIn) token = null;
  setStatus(signedIn ? "Signed in. Only the synthetic Development probe is available." : "Sign in with Apple to run the Development-only check.");
  refreshAvailability();
}

function isSuccessfulRecordResult(result) {
  return Boolean(result && !result.serverErrorCode);
}

async function runProbe() {
  if (running || !signedIn || !token) return;
  if (!config || config.environment !== "development") {
    setStatus("Stopped: the site is not configured for CloudKit Development.");
    return;
  }

  running = true;
  refreshAvailability();
  const id = crypto.randomUUID();
  const recordName = `arb132-encryption-probe-${id}`;
  const syntheticValue = `Synthetic ARB-132 encryption probe ${id}`;
  const client = new CloudKitEncryptedWebServices({
    containerIdentifier: config.containerIdentifier,
    environment: "development",
    apiToken: config.apiToken,
    authTokenStore: tokenStore,
  });
  let attemptedCreate = false;
  let created = false;
  let roundTripPassed = false;
  let cleanupPassed = false;

  try {
    setStatus("Writing one synthetic encrypted string…");
    attemptedCreate = true;
    const createdRecord = await client.createEncryptedStringRecord(TYPE, recordName, FIELD, syntheticValue);
    created = isSuccessfulRecordResult(createdRecord);
    if (!created) throw new Error("The synthetic probe record was not created.");

    setStatus("Reading back the synthetic encrypted string…");
    const fetchedRecord = await client.lookupRecord(recordName, [FIELD]);
    roundTripPassed = fetchedRecord.recordType === TYPE && fetchedRecord.fields && fetchedRecord.fields[FIELD] && fetchedRecord.fields[FIELD].value === syntheticValue;
    if (!roundTripPassed) throw new Error("The encrypted value did not round-trip exactly.");
  } catch (error) {
    setStatus(`Probe stopped: ${error && error.message ? error.message : "CloudKit request failed."}`);
  } finally {
    if (attemptedCreate && token) {
      try {
        await client.deleteRecord(recordName);
        cleanupPassed = true;
      } catch {
        cleanupPassed = false;
      }
    }
    if (roundTripPassed && cleanupPassed) {
      setStatus("Passed: CloudKit Web Services wrote and read the encrypted Development field, then removed the synthetic record.");
    } else if (created && !cleanupPassed) {
      setStatus("The round trip completed, but cleanup could not be confirmed. The isolated synthetic probe record may remain in Development.");
    }
    running = false;
    refreshAvailability();
  }
}

if (!config || config.environment !== "development" || !config.apiToken || !window.CloudKit) {
  setStatus("Unavailable: this check requires Arbor’s CloudKit Development configuration and Apple’s CloudKit JS library.");
} else {
  try {
    CloudKit.configure({
      locale: "en-us",
      services: { authTokenStore: tokenStore },
      containers: [{
        containerIdentifier: config.containerIdentifier,
        apiTokenAuth: {
          apiToken: config.apiToken,
          // CloudKit JS uses the supplied authTokenStore when persist is true.
          // This probe's implementation is RAM-only, not cookie/local storage.
          persist: true,
          signInButton: { id: "apple-sign-in-button", theme: "black" },
          signOutButton: { id: "apple-sign-out-button", theme: "black" },
        },
        environment: "development",
      }],
    });
    const container = CloudKit.getDefaultContainer();
    container.setUpAuth().then(connect).catch(() => connect(null));
    container.whenUserSignsIn().then(connect);
    container.whenUserSignsOut().then(() => connect(null));
    runButton.addEventListener("click", runProbe);
  } catch {
    setStatus("Unavailable: CloudKit could not be initialized for this Development-only check.");
  }
}
