import { discover, requestPmicDevice, serialize } from "#ble/connection.js";
import type { DiscoveredMap, FilterMode } from "#ble/connection.js";
import type { DeviceContext, DeviceInfo } from "#ble/device-info.js";
import { readDeviceInfo } from "#ble/device-info.js";
import type { DfuImage } from "#ble/dfu-package.js";
import { isSignedInitPacket, parseManifest } from "#ble/dfu-package.js";
import { enumerate } from "#ble/gatt-model.js";
import { DFU, LEGACY } from "#ble/nordic-constants.js";
import type { RavenReading } from "#ble/raven.js";
import { readRavenTelemetry } from "#ble/raven.js";
import type { AdvObservation } from "#ble/survey.js";
import {
  advertisementTells,
  hasRavenGatt,
  isScanningSupported,
  toObservation,
} from "#ble/survey.js";
import type { GattServer } from "#ble/types.js";
import { parseUuidInput } from "#ble/uuid.js";
import type { CheckContext, ConfigInputs } from "#checks/execute.js";
import { executeCh1, executeF1, executeF2, executeF4, executeF5 } from "#checks/execute.js";
import type { CheckResult } from "#checks/result.js";
import { createLogger } from "#net/logger.js";
import { downloadText, reportFilename } from "#report/download.js";
import type { ReportMeta } from "#report/report.js";
import { toJson, toMarkdown } from "#report/report.js";
import { runAll } from "#run/auto-run.js";
import { startSurvey } from "#run/survey-scan.js";
import type { SurveyHandle } from "#run/survey-scan.js";
import { renderGattTable } from "#ui/gatt-table.js";
import { renderSurvey } from "#ui/survey-view.js";
import { parsePairingPrompt } from "#ui/pairing-select.js";
import { renderResults } from "#ui/results-view.js";
import { mountSessionInfo } from "#ui/session-info.js";
import type { SessionInfoHandle } from "#ui/session-info.js";

const DEFAULT_MARKER = "VERIFIER-BENIGN-MARKER-0001";
const RUN_BUTTON_IDS = ["run-f1", "run-ch1", "run-f4", "run-f5", "run-f2", "run-all"] as const;

interface AppState {
  server?: GattServer;
  discovered?: DiscoveredMap;
  device?: DeviceContext;
}

const state: AppState = {};
const results: CheckResult[] = [];
const logger = createLogger();
let gattLog = "";
let sessionInfo: SessionInfoHandle | undefined;
let surveyHandle: SurveyHandle | undefined;
let surveyStarting = false;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`missing #${id}`);
  }
  return el as T;
};

function log(line: string): void {
  gattLog += `${line}\n`;
  const el = $("log");
  el.textContent += `${line}\n`;
  el.scrollTop = el.scrollHeight;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Build report/log metadata from the session id, the current time, and the session-info panel. */
function buildMeta(): ReportMeta {
  return {
    generatedAt: new Date().toISOString(),
    sessionId: logger.sessionId,
    ...sessionInfo?.getMeta(),
    ...(state.device ? { device: state.device } : {}),
  };
}

const DOWNLOAD_BUTTON_IDS = ["export", "export-json", "download-md", "download-json"] as const;

function refreshResults(): void {
  renderResults($("results"), results);
  const hidden = results.length === 0;
  for (const id of DOWNLOAD_BUTTON_IDS) {
    $<HTMLButtonElement>(id).hidden = hidden;
  }
}

function recordResult(result: CheckResult): void {
  results.push(result);
  log(`${result.id}: ${result.verdict} — ${result.evidence}`);
  refreshResults();
  logger.snapshot({
    meta: buildMeta(),
    results,
    gattLog,
    ...(state.device ? { device: state.device } : {}),
  });
}

function requireServer(): GattServer | undefined {
  if (!state.server) {
    log("Not connected — connect and save the vendor config first.");
    return undefined;
  }
  return state.server;
}

function readConfig(): ConfigInputs {
  return {
    dfuService: $<HTMLInputElement>("cfg-dfu-service").value,
    controlPoint: $<HTMLInputElement>("cfg-control-point").value,
    packet: $<HTMLInputElement>("cfg-packet").value,
    buttonless: $<HTMLInputElement>("cfg-buttonless").value,
    vendorService: $<HTMLInputElement>("cfg-vendor-service").value,
    chargeChar: $<HTMLInputElement>("cfg-charge-char").value,
    passphraseChar: $<HTMLInputElement>("cfg-passphrase-char").value,
    logChar: $<HTMLInputElement>("cfg-log-char").value,
    marker: $<HTMLInputElement>("cfg-marker").value,
  };
}

function initDefaults(): void {
  $<HTMLInputElement>("cfg-dfu-service").value = `0x${DFU.SERVICE.toString(16)}`;
  $<HTMLInputElement>("cfg-control-point").value = DFU.CONTROL_POINT;
  $<HTMLInputElement>("cfg-packet").value = DFU.PACKET;
  $<HTMLInputElement>("cfg-buttonless").value = DFU.BUTTONLESS_UNBONDED;
  $<HTMLInputElement>("cfg-marker").value = DEFAULT_MARKER;
}

/** If discovery found legacy DFU, switch the DFU fields to the legacy UUIDs (secure DFU stays
 * the default). */
function applyDiscoveredDefaults(flavor: DiscoveredMap["dfuFlavor"]): void {
  if (flavor !== "legacy") {
    return;
  }
  $<HTMLInputElement>("cfg-dfu-service").value = LEGACY.SERVICE;
  $<HTMLInputElement>("cfg-control-point").value = LEGACY.CONTROL_POINT;
  $<HTMLInputElement>("cfg-packet").value = LEGACY.PACKET;
}

// ---- connect / reconnect -------------------------------------------------

/** Read the chooser filter mode and optional name prefix that narrow the device picker. */
function chooserOpts(): { readonly filterMode: FilterMode; readonly namePrefix?: string } {
  const filterMode: FilterMode =
    $<HTMLSelectElement>("cfg-filter-mode").value === "all" ? "all" : "likely";
  const namePrefix = $<HTMLInputElement>("cfg-name-filter").value.trim();
  return namePrefix.length > 0 ? { filterMode, namePrefix } : { filterMode };
}

/** Click-to-assign handler: write a discovered UUID into the matching config field. */
function assignField(field: string, uuid: string): void {
  $<HTMLInputElement>(`cfg-${field}`).value = uuid;
  log(`Assigned ${uuid} to ${field}.`);
}

function appendDeviceRow(panel: HTMLElement, label: string, value: string): void {
  const line = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  line.appendChild(strong);
  line.appendChild(document.createTextNode(value));
  panel.appendChild(line);
}

/** Render the connected device's name and Device Information strings (textContent only). */
function renderDeviceInfo(name: string | undefined, info: DeviceInfo): void {
  const panel = $("device-info");
  panel.replaceChildren();
  appendDeviceRow(panel, "Name", name || "(unknown)");
  appendDeviceRow(panel, "Manufacturer", info.manufacturer || "(not reported)");
  appendDeviceRow(panel, "Model", info.model || "(not reported)");
  appendDeviceRow(panel, "Firmware", info.firmware || "(not reported)");
}

/** Append each read-only Raven telemetry reading as a name/value row (textContent only). */
function renderRavenTelemetry(panel: HTMLElement, readings: readonly RavenReading[]): void {
  for (const reading of readings) {
    appendDeviceRow(panel, reading.name, reading.value);
  }
}

const ADV_CAPTURE_TIMEOUT_MS = 4000;

/** Structural view of the experimental per-device advertisement watch API (flag-gated). */
interface WatchableDevice {
  watchAdvertisements(opts?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(
    type: "advertisementreceived",
    cb: (e: {
      readonly rssi?: number;
      readonly uuids?: string[];
      readonly manufacturerData?: ReadonlyMap<number, DataView>;
    }) => void,
    opts?: { once?: boolean },
  ): void;
}

/**
 * Capture one BLE advertisement for the connected device via `watchAdvertisements`, so the Flock
 * company id (0x09C8) and serial can be read. Needs the experimental scanning flag; resolves
 * `undefined` when unsupported or none arrives within {@link ADV_CAPTURE_TIMEOUT_MS}.
 */
async function captureAdvertisement(device: BluetoothDevice): Promise<AdvObservation | undefined> {
  const watchable = device as unknown as Partial<WatchableDevice>;
  if (typeof watchable.watchAdvertisements !== "function") {
    return undefined;
  }
  const dev = watchable as WatchableDevice;
  const controller = new AbortController();
  return new Promise<AdvObservation | undefined>((resolve) => {
    const finish = (obs: AdvObservation | undefined): void => {
      controller.abort();
      resolve(obs);
    };
    const timer = setTimeout(() => finish(undefined), ADV_CAPTURE_TIMEOUT_MS);
    dev.addEventListener(
      "advertisementreceived",
      (e) => {
        clearTimeout(timer);
        finish(
          toObservation({
            id: device.id,
            ...(device.name !== undefined ? { name: device.name } : {}),
            ...(e.rssi !== undefined ? { rssi: e.rssi } : {}),
            ...(e.uuids !== undefined ? { uuids: e.uuids } : {}),
            ...(e.manufacturerData !== undefined ? { manufacturerData: e.manufacturerData } : {}),
          }),
        );
      },
      { once: true },
    );
    dev.watchAdvertisements({ signal: controller.signal }).catch(() => {
      clearTimeout(timer);
      finish(undefined);
    });
  });
}

/**
 * Fold the connected device's name + enumerated services and (when captured) the advertised
 * company ids / serial into one observation for Flock scoring.
 */
function connectedObservation(
  device: BluetoothDevice,
  serviceUuids: readonly string[],
  captured: AdvObservation | undefined,
): AdvObservation {
  const base = toObservation({
    id: device.id,
    ...(device.name !== undefined ? { name: device.name } : {}),
    uuids: [...serviceUuids],
  });
  if (!captured) {
    return base;
  }
  return {
    ...base,
    companyIds: [...new Set([...base.companyIds, ...captured.companyIds])],
    serviceUuids: [...new Set([...base.serviceUuids, ...captured.serviceUuids])],
    ...(captured.serial !== undefined ? { serial: captured.serial } : {}),
  };
}

async function connectAndDiscover(device: BluetoothDevice): Promise<void> {
  const gatt = device.gatt;
  if (!gatt) {
    log("Device exposes no GATT server.");
    return;
  }
  const server = (await serialize(() => gatt.connect())) as GattServer;
  state.server = server;
  const found = await serialize(() => discover(server));
  state.discovered = found;
  applyDiscoveredDefaults(found.dfuFlavor);
  const services = found.services.join(", ") || "(none granted yet)";
  log(`Connected. DFU flavor: ${found.dfuFlavor}. Services: ${services}`);
  const table = await serialize(() => enumerate(server));
  const info = await serialize(() => readDeviceInfo(server));
  const captured = await captureAdvertisement(device);
  const flock = advertisementTells(
    connectedObservation(
      device,
      table.map((s) => s.uuid),
      captured,
    ),
  );
  renderDeviceInfo(device.name, info);
  const capNote = captured
    ? ""
    : " — name/service only; enable the scanning flag for company id/serial";
  log(
    `Flock assessment: ${flock.confidence}${flock.serial ? ` · serial ${flock.serial}` : ""}${capNote}`,
  );
  appendDeviceRow(
    $("device-info"),
    "Flock assessment",
    `${flock.confidence}${flock.serial ? ` · ${flock.serial}` : ""}`,
  );
  let raven: RavenReading[] = [];
  if (hasRavenGatt(table.map((s) => s.uuid))) {
    appendDeviceRow($("device-info"), "BLE model", "Flock Raven (acoustic sensor)");
    raven = await serialize(() => readRavenTelemetry(server));
    renderRavenTelemetry($("device-info"), raven);
    log(`Raven telemetry: ${raven.length} value(s) read.`);
  }
  state.device = {
    info,
    gatt: table,
    flock,
    ...(device.name ? { name: device.name } : {}),
    ...(raven.length > 0 ? { raven } : {}),
  };
  renderGattTable($("gatt-table"), table, assignField);
  $("device-section").hidden = false;
}

async function onConnect(): Promise<void> {
  if (!navigator.bluetooth) {
    log("Web Bluetooth unavailable — use Chrome for Android over HTTPS.");
    return;
  }
  try {
    // LEGACY.SERVICE is requested up front (a known constant) so legacy-DFU devices classify
    // correctly on the first pass; vendor UUIDs are unknown until the tester fills the config
    // form, so those are granted on reconnect.
    const device = await requestPmicDevice([LEGACY.SERVICE], chooserOpts());
    await connectAndDiscover(device);
    $("config").hidden = false;
  } catch (err) {
    log(`Connect failed: ${describeError(err)}`);
  }
}

async function onSaveConfigAndReconnect(): Promise<void> {
  const cfg = readConfig();
  let vendorService: BluetoothServiceUUID | undefined;
  try {
    vendorService = parseUuidInput(cfg.vendorService);
  } catch (err) {
    log(`Vendor service UUID: ${describeError(err)} — treating as not configured.`);
    vendorService = undefined;
  }
  if (vendorService === undefined) {
    log("Enter a valid vendor service UUID before reconnecting.");
    return;
  }
  try {
    const device = await requestPmicDevice([vendorService], chooserOpts());
    await connectAndDiscover(device);
    $("checks").hidden = false;
    log("Vendor service granted — checks enabled.");
  } catch (err) {
    log(`Reconnect failed: ${describeError(err)}`);
  }
}

// ---- survey (client-only; never logged) -----------------------------------
// The survey profiles bystander advertisements to help pick the right unit. It never touches
// GATT, recordResult, or the logger, so it stays out of the per-check run-lock.

/** Return the survey button to its idle state and clear the status line. */
function resetSurveyButton(): void {
  surveyHandle = undefined;
  $<HTMLButtonElement>("survey-btn").textContent = "Survey nearby devices";
  $("survey-status").textContent = "";
}

/** Toggle the passive advertisement survey; scan errors surface in the status line, never thrown. */
async function onSurveyToggle(): Promise<void> {
  if (surveyHandle) {
    surveyHandle.stop();
    return;
  }
  if (surveyStarting) {
    return; // a scan is already spinning up — ignore a double-tap during the in-flight window
  }
  surveyStarting = true;
  $("survey-status").textContent = "Scanning… tap to stop";
  $<HTMLButtonElement>("survey-btn").textContent = "Stop survey";
  try {
    surveyHandle = await startSurvey({
      onUpdate: (devices) => renderSurvey($("survey-results"), devices),
      onStopped: () => resetSurveyButton(),
    });
  } catch (err) {
    resetSurveyButton();
    $("survey-status").textContent = `Survey failed: ${describeError(err)}`;
  } finally {
    surveyStarting = false;
  }
}

/** Wire the survey button when the Scanning API is present; otherwise show the enable-flag help. */
function initSurveyPanel(): void {
  if (!isScanningSupported()) {
    $<HTMLButtonElement>("survey-btn").hidden = true;
    $("survey-help").hidden = false;
    return;
  }
  $<HTMLButtonElement>("survey-btn").addEventListener("click", () => void onSurveyToggle());
}

// ---- per-check handlers ---------------------------------------------------
// Each handler builds a DOM-free CheckContext and delegates to the matching execute*()
// function (shared with the auto-runner); those never throw and hold the GATT queue via
// serialize() internally. Device-write safety interlocks live inside the execute*() functions.

/** Read the form + connected server into a CheckContext; undefined when not yet connected. */
function buildContext(f2?: { image: DfuImage; signed: boolean }): CheckContext | undefined {
  const server = requireServer();
  if (!server) {
    return undefined;
  }
  const cfg = readConfig();
  const prompt = parsePairingPrompt($<HTMLSelectElement>("f1-prompt-type").value);
  const marker = cfg.marker || DEFAULT_MARKER;
  return f2 ? { server, cfg, prompt, marker, f2 } : { server, cfg, prompt, marker };
}

async function handleRunF1(): Promise<void> {
  const ctx = buildContext();
  if (!ctx) {
    return;
  }
  log("F1: reading the protected characteristic…");
  recordResult(await executeF1(ctx));
}

async function handleRunCh1(): Promise<void> {
  const ctx = buildContext();
  if (!ctx || !state.discovered) {
    return;
  }
  log("CH-1: probing DFU reachability…");
  recordResult(await executeCh1(ctx, state.discovered, { sendButtonless: true }));
}

async function handleRunF4(): Promise<void> {
  const ctx = buildContext();
  if (!ctx) {
    return;
  }
  log("F4: probing the unpaired privileged-write gate…");
  recordResult(await executeF4(ctx));
}

async function handleRunF5(): Promise<void> {
  const ctx = buildContext();
  if (!ctx) {
    return;
  }
  log("F5: submitting the benign marker and scanning the log…");
  recordResult(await executeF5(ctx));
}

async function loadF2Image(): Promise<{ image: DfuImage; signed: boolean }> {
  const manifestFile = $<HTMLInputElement>("f2-manifest").files?.[0];
  const datFile = $<HTMLInputElement>("f2-dat").files?.[0];
  const binFile = $<HTMLInputElement>("f2-bin").files?.[0];
  if (!manifestFile || !datFile || !binFile) {
    throw new Error("manifest.json, .dat, and .bin files are all required");
  }
  const manifestInfo = parseManifest(await manifestFile.text());
  if (manifestInfo.datFile !== datFile.name || manifestInfo.binFile !== binFile.name) {
    log(
      `F2 warning: manifest references ${manifestInfo.datFile}/${manifestInfo.binFile}, ` +
        `loaded ${datFile.name}/${binFile.name}.`,
    );
  }
  const initPacket = new Uint8Array(await datFile.arrayBuffer());
  const firmware = new Uint8Array(await binFile.arrayBuffer());
  const image: DfuImage = { initPacket, firmware, label: binFile.name };
  return { image, signed: isSignedInitPacket(initPacket) };
}

async function handleRunF2(): Promise<void> {
  if (!requireServer()) {
    return;
  }
  let f2: { image: DfuImage; signed: boolean };
  try {
    f2 = await loadF2Image();
  } catch (err) {
    log(`F2 skipped: ${describeError(err)}`);
    return;
  }
  const ctx = buildContext(f2);
  if (!ctx) {
    return;
  }
  const commit = $<HTMLInputElement>("f2-commit").checked;
  log(`F2: transferring the init packet (${f2.signed ? "signed" : "unsigned"})…`);
  recordResult(await executeF2(ctx, { commit }));
}

/** Attempt to load the F2 files for auto-run; absent/invalid files leave F2 to skip gracefully. */
async function tryLoadF2Image(): Promise<{ image: DfuImage; signed: boolean } | undefined> {
  try {
    return await loadF2Image();
  } catch {
    return undefined;
  }
}

/** Auto-run: build the context (with F2 files when present) and run every check as a safe set. */
async function handleRunAll(): Promise<void> {
  if (!requireServer() || !state.discovered) {
    return;
  }
  const ctx = buildContext(await tryLoadF2Image());
  if (!ctx) {
    return;
  }
  await runAll(ctx, {
    discovered: state.discovered,
    onResult: recordResult,
    onLog: log,
  });
}

// ---- one-at-a-time run lock -----------------------------------------------
// Carry-forward contract: while a check runs, every Run button is disabled so runF* calls
// never overlap.

function setRunButtonsEnabled(enabled: boolean): void {
  for (const id of RUN_BUTTON_IDS) {
    $<HTMLButtonElement>(id).disabled = !enabled;
  }
}

/** Toggle the per-check running indicator (a status chip inside each check card). */
function setCheckRunning(key: string, running: boolean): void {
  const el = $(`status-${key}`);
  el.textContent = running ? "Running…" : "";
  el.classList.toggle("running", running);
}

async function withRunLock(key: string, fn: () => Promise<void>): Promise<void> {
  setRunButtonsEnabled(false);
  setCheckRunning(key, true);
  try {
    await fn();
  } catch (err) {
    log(`Unexpected error: ${describeError(err)}`);
  } finally {
    setCheckRunning(key, false);
    setRunButtonsEnabled(true);
  }
}

function wireRunButtons(): void {
  const bindings: ReadonlyArray<readonly [string, string, () => Promise<void>]> = [
    ["run-f1", "f1", handleRunF1],
    ["run-ch1", "ch1", handleRunCh1],
    ["run-f4", "f4", handleRunF4],
    ["run-f5", "f5", handleRunF5],
    ["run-f2", "f2", handleRunF2],
    ["run-all", "all", handleRunAll],
  ];
  for (const [buttonId, key, handler] of bindings) {
    $(buttonId).addEventListener("click", () => void withRunLock(key, handler));
  }
}

function wireTopLevelButtons(): void {
  $<HTMLButtonElement>("connect").addEventListener("click", () => {
    void onConnect();
  });
  $<HTMLButtonElement>("reconnect").addEventListener("click", () => {
    void onSaveConfigAndReconnect();
  });
  $<HTMLButtonElement>("export").addEventListener("click", () => {
    void navigator.clipboard.writeText(toMarkdown(results, buildMeta()));
  });
  $<HTMLButtonElement>("export-json").addEventListener("click", () => {
    void navigator.clipboard.writeText(toJson(results, buildMeta()));
  });
  $<HTMLButtonElement>("download-md").addEventListener("click", () => {
    const meta = buildMeta();
    downloadText(reportFilename(meta, "md"), toMarkdown(results, meta), "text/markdown");
  });
  $<HTMLButtonElement>("download-json").addEventListener("click", () => {
    const meta = buildMeta();
    downloadText(reportFilename(meta, "json"), toJson(results, meta), "application/json");
  });
}

initDefaults();
sessionInfo = mountSessionInfo($("session-info"));
wireTopLevelButtons();
wireRunButtons();
initSurveyPanel();
window.addEventListener("pagehide", () => logger.flush());
log(`DFU service default: 0x${DFU.SERVICE.toString(16)}`);
refreshResults();
