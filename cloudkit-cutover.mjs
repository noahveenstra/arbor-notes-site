import { CloudKitEncryptedWebServices, createCloudKitAuthTransport } from "./cloudkit-encrypted-web-services.mjs?v=arb-auth-cookie-20261124-a";
import { copyPrivateLibraryMigrationPlan, planPrivateLibraryMigration } from "./cloudkit-library-migration.mjs?v=arb-23-cloudkit-cutover-20261124-a";

const config = globalThis.ARBOR_CLOUDKIT_CONFIG || {};
const containerIdentifier = String(config.containerIdentifier || "");
const developmentToken = String(config.apiToken || "");
const productionToken = String(config.productionApiToken || "");
const accountStatus = document.querySelector("#account-status");
const status = document.querySelector("#migration-status");
const counts = document.querySelector("#migration-counts");
const previewButton = document.querySelector("#preview-migration");
const copyButton = document.querySelector("#copy-migration");
const signInButton = document.querySelector("#apple-sign-in-button");
const signOutButton = document.querySelector("#apple-sign-out-button");
const expectedAccountRecordName = new URLSearchParams(globalThis.location.hash.slice(1)).get("expected-account");

function setStatus(message) {
  status.textContent = message;
}

function displayError(error) {
  const code = String(error && error.code || "");
  const known = new Set([
    "PRODUCTION_HAS_EXTRA_RECORDS",
    "PRODUCTION_CONFLICT",
    "SHARED_RECORDS_PRESENT",
    "ASSET_LIST_UNSUPPORTED",
    "ASSET_UNAVAILABLE",
    "ASSET_TOO_LARGE",
    "ASSET_DOWNLOAD_FAILED",
    "ASSET_SIZE_INVALID",
    "ASSET_UPLOAD_URL_MISSING",
    "VERIFY_COUNT_MISMATCH",
    "VERIFY_CONTENT_MISMATCH"
  ]);
  if (known.has(code)) return error.message;
  if (code === "AUTHENTICATION_REQUIRED" || /Sign in to CloudKit/i.test(String(error && error.message || ""))) {
    return "Sign in with Apple, then check the libraries again.";
  }
  return "The CloudKit transfer could not finish. Development is still intact; refresh and check the libraries again.";
}

function setAccount(connected, message, signedIn = connected) {
  accountStatus.textContent = message || (connected ? "Apple Account confirmed" : "Sign in to continue");
  signInButton.hidden = signedIn;
  signOutButton.hidden = !signedIn;
  previewButton.disabled = !connected;
  if (!connected) copyButton.disabled = true;
}

if (!containerIdentifier || !developmentToken || !productionToken || !globalThis.CloudKit) {
  accountStatus.textContent = "CloudKit migration is not configured.";
  previewButton.disabled = true;
  copyButton.disabled = true;
} else {
  const transport = createCloudKitAuthTransport({ containerIdentifier });
  CloudKit.configure({
    locale: "en-us",
    services: { authTokenStore: transport.authTokenStore, fetch: transport.fetch },
    containers: [{
      containerIdentifier,
      apiTokenAuth: {
        apiToken: developmentToken,
        persist: true,
        signInButton: { id: "apple-sign-in-button", theme: "black" },
        signOutButton: { id: "apple-sign-out-button", theme: "black" }
      },
      environment: "development"
    }]
  });

  const development = new CloudKitEncryptedWebServices({
    containerIdentifier,
    environment: "development",
    apiToken: developmentToken,
    authTokenStore: transport.authTokenStore,
    fetchImpl: transport.fetch
  });
  const production = new CloudKitEncryptedWebServices({
    containerIdentifier,
    environment: "production",
    apiToken: productionToken,
    authTokenStore: transport.authTokenStore,
    fetchImpl: transport.fetch
  });
  const container = CloudKit.getDefaultContainer();
  let connected = false;
  let inFlight = false;

  function connectedToAccount(identity) {
    const actualRecordName = identity && typeof identity.userRecordName === "string" ? identity.userRecordName : "";
    if (!actualRecordName || !expectedAccountRecordName || actualRecordName !== expectedAccountRecordName) {
      connected = false;
      setAccount(false, actualRecordName
        ? "This Apple Account does not match the account selected for the Development library. Sign out and use the matching account."
        : "CloudKit did not identify the signed-in Apple Account. Sign out, then sign in again.", Boolean(actualRecordName));
      setStatus("");
      return;
    }
    connected = true;
    setAccount(true, "The signed-in Apple Account matches the Development library selected for this transfer.");
    setStatus("");
  }

  container.whenUserSignsIn().then(connectedToAccount).catch(() => {});
  container.whenUserSignsOut().then(() => {
    connected = false;
    setAccount(false, "Sign in to continue.", false);
    setStatus("Sign in to continue.");
  }).catch(() => {});
  container.setUpAuth().then(identity => {
    if (identity) connectedToAccount(identity);
    else setAccount(false);
  }).catch(() => setAccount(false));

  async function readPlan() {
    return planPrivateLibraryMigration({
      development,
      production,
      onProgress(progress) {
        if (progress.side) {
          const recordCount = Number(progress.records || 0);
          const zoneCount = Number(progress.zones || 0);
          const totalZones = Number(progress.totalZones || 0);
          setStatus(`Checking ${progress.side} (${zoneCount}${totalZones ? ` of ${totalZones}` : ""} zones, ${recordCount} records)…`);
        }
      }
    });
  }

  previewButton.addEventListener("click", async () => {
    if (inFlight || !connected) return;
    inFlight = true;
    previewButton.disabled = true;
    copyButton.disabled = true;
    counts.hidden = true;
    setStatus("Checking Development and Production…");
    try {
      const plan = await readPlan();
      counts.textContent = `${plan.counts.records} records across ${plan.counts.zones} zones; ${plan.counts.assets} attached CloudKit files.${plan.counts.alreadyPresent ? ` ${plan.counts.alreadyPresent} already match.` : ""}`;
      counts.hidden = false;
      setStatus("Both libraries are ready to compare and copy safely.");
      copyButton.disabled = false;
    } catch (error) {
      setStatus(displayError(error));
    } finally {
      inFlight = false;
      previewButton.disabled = !connected;
    }
  });

  copyButton.addEventListener("click", async () => {
    if (inFlight || !connected) return;
    inFlight = true;
    previewButton.disabled = true;
    copyButton.disabled = true;
    setStatus("Rechecking both libraries before any copy…");
    try {
      const plan = await readPlan();
      const result = await copyPrivateLibraryMigrationPlan(plan, {
        development,
        production,
        onProgress(progress) {
          if (progress.phase === "copying") {
            setStatus(`Copying ${Number(progress.records || 0)} of ${Number(progress.totalRecords || 0)} records and ${Number(progress.assets || 0)} of ${Number(progress.totalAssets || 0)} files…`);
          } else if (progress.phase === "verifying") {
            setStatus("Verifying the Production copy against Development…");
          }
        }
      });
      counts.textContent = `Verified ${result.verifiedRecords} records across ${result.verifiedZones} zones and ${result.copiedAssets} copied CloudKit files. Development remains unchanged.`;
      counts.hidden = false;
      setStatus("Copy complete and verified.");
      previewButton.disabled = true;
      copyButton.disabled = true;
    } catch (error) {
      setStatus(displayError(error));
      previewButton.disabled = !connected;
    } finally {
      inFlight = false;
    }
  });
}
