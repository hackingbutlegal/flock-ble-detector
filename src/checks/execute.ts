import { serialize } from "#ble/connection.js";
import type { DiscoveredMap } from "#ble/connection.js";
import type { DfuImage } from "#ble/dfu-package.js";
import type { GattCharacteristic, GattServer } from "#ble/types.js";
import { parseUuidInput } from "#ble/uuid.js";
import { runCh1 } from "./ch1-dfu.js";
import type { PairingPrompt } from "./f1-pairing.js";
import { runF1 } from "./f1-pairing.js";
import { runF2 } from "./f2-signature.js";
import { runF4 } from "./f4-privwrite.js";
import { runF5 } from "./f5-log.js";
import type { CheckResult } from "./result.js";

const DEFAULT_MARKER = "VERIFIER-BENIGN-MARKER-0001";
/** CH-1 uses a 5000ms guard on its single buttonless wait; F2 waits on this repeatedly across
 * a multi-step transfer, so it gets a longer budget. */
const F2_NOTIFICATION_TIMEOUT_MS = 10_000;

/** Raw config-form strings; parsed/validated inside the execute functions, never trusted blindly. */
export interface ConfigInputs {
  readonly dfuService: string;
  readonly controlPoint: string;
  readonly packet: string;
  readonly buttonless: string;
  readonly vendorService: string;
  readonly chargeChar: string;
  readonly passphraseChar: string;
  readonly logChar: string;
  readonly marker: string;
}

/**
 * DOM-free inputs a per-check `execute*()` needs. Built by `main.ts` from the form and by the
 * auto-runner. Device-write safety interlocks (idempotent F4 write-back, F2 abort-safe, the
 * passphrase/charge collision guard) live inside these functions, not in the UI layer.
 */
export interface CheckContext {
  readonly server: GattServer;
  readonly cfg: ConfigInputs;
  readonly prompt: PairingPrompt;
  readonly marker: string;
  readonly f2?: { readonly image: DfuImage; readonly signed: boolean };
  readonly nextNotification?: (char: GattCharacteristic) => () => Promise<DataView>;
}

const CHECK_META = {
  F1: { id: "F1", title: "BLE pairing accepts Just Works", s4ref: "§4.2" },
  "CH-1": { id: "CH-1", title: "DFU reachable from an unauthenticated bond", s4ref: "§4.2" },
  F4: { id: "F4", title: "Unpaired privileged-write gate", s4ref: "§4.3" },
  F5: { id: "F5", title: "Plaintext logging of submitted passphrases", s4ref: "§4.4" },
  F2: { id: "F2", title: "DFU image signature enforcement", s4ref: "§4.1" },
} as const satisfies Record<
  CheckResult["id"],
  { id: CheckResult["id"]; title: string; s4ref: string }
>;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** An `inconclusive` result carrying the right check identity, used for skips and caught errors. */
function inconclusive(id: CheckResult["id"], evidence: string): CheckResult {
  return {
    ...CHECK_META[id],
    verdict: "inconclusive",
    evidence,
    limits: "Precondition not met — the check did not run to completion. See evidence.",
  };
}

function requireUuid(raw: string, label: string): BluetoothServiceUUID {
  const parsed = parseUuidInput(raw);
  if (parsed === undefined) {
    throw new Error(`${label} is required — fill it in the config panel.`);
  }
  return parsed;
}

/** Parse an optional UUID field. Blank or malformed input is treated as unset (never throws). */
function parseOptionalUuid(raw: string): BluetoothServiceUUID | undefined {
  try {
    return parseUuidInput(raw);
  } catch {
    return undefined;
  }
}

/**
 * True when the passphrase and charge/privileged characteristic UUIDs resolve to the same value.
 * F4/F5 raw-write the passphrase characteristic; if it aliases the charge characteristic that
 * write bypasses setChargeState's read-back interlock (spec §3.1). Values may be a number (short
 * UUID) or a string (canonical UUID) — normalize both sides.
 */
export function collidesWithCharge(
  passphraseUuid: BluetoothCharacteristicUUID | undefined,
  chargeUuid: BluetoothCharacteristicUUID | undefined,
): boolean {
  if (passphraseUuid === undefined || chargeUuid === undefined) {
    return false;
  }
  return String(passphraseUuid).toLowerCase() === String(chargeUuid).toLowerCase();
}

async function resolveChar(
  server: GattServer,
  serviceUuid: BluetoothServiceUUID,
  charUuid: BluetoothCharacteristicUUID,
): Promise<GattCharacteristic> {
  const svc = await server.getPrimaryService(serviceUuid);
  return svc.getCharacteristic(charUuid);
}

const COLLISION_EVIDENCE =
  "Passphrase and charge characteristics must be distinct; writing the passphrase probe to the " +
  "charge characteristic would bypass the safety interlock.";

/** F1: read the protected characteristic and classify from the tester's pairing-prompt choice. */
export async function executeF1(ctx: CheckContext): Promise<CheckResult> {
  let vendorSvc: BluetoothServiceUUID;
  let chargeUuid: BluetoothCharacteristicUUID;
  try {
    vendorSvc = requireUuid(ctx.cfg.vendorService, "Vendor service UUID");
    chargeUuid = requireUuid(ctx.cfg.chargeChar, "Charge/privileged characteristic UUID");
  } catch (err) {
    return inconclusive("F1", describeError(err));
  }
  try {
    return await serialize(async () => {
      const char = await resolveChar(ctx.server, vendorSvc, chargeUuid);
      return runF1(char, ctx.prompt);
    });
  } catch (err) {
    return inconclusive(
      "F1",
      `GATT error resolving the protected characteristic: ${describeError(err)}`,
    );
  }
}

/**
 * CH-1: classify DFU reachability. With `sendButtonless:false` (auto-run) a buttonless-only device
 * is classified from discovery alone — the device-rebooting ENTER write is never sent.
 */
export async function executeCh1(
  ctx: CheckContext,
  discovered: DiscoveredMap,
  opts: { readonly sendButtonless: boolean },
): Promise<CheckResult> {
  try {
    return await serialize(async () => {
      if (discovered.dfuFlavor === "buttonless-only" && !opts.sendButtonless) {
        return inconclusive(
          "CH-1",
          "Buttonless-only device — the buttonless ENTER write (which reboots the device into " +
            "DFU) was skipped in auto-run. Run CH-1 manually to send it.",
        );
      }
      if (discovered.dfuFlavor !== "buttonless-only") {
        return runCh1(discovered);
      }
      try {
        const dfuSvc = requireUuid(ctx.cfg.dfuService, "DFU service UUID");
        const buttonlessUuid = requireUuid(ctx.cfg.buttonless, "Buttonless characteristic UUID");
        const char = await resolveChar(ctx.server, dfuSvc, buttonlessUuid);
        return runCh1(discovered, char);
      } catch {
        return runCh1(discovered);
      }
    });
  } catch (err) {
    return inconclusive("CH-1", `GATT error probing DFU reachability: ${describeError(err)}`);
  }
}

/** F4: probe the unpaired privileged-write gate via an idempotent write-back (no state change). */
export async function executeF4(ctx: CheckContext): Promise<CheckResult> {
  let vendorSvc: BluetoothServiceUUID;
  let chargeUuid: BluetoothCharacteristicUUID;
  try {
    vendorSvc = requireUuid(ctx.cfg.vendorService, "Vendor service UUID");
    chargeUuid = requireUuid(ctx.cfg.chargeChar, "Charge/privileged characteristic UUID");
  } catch (err) {
    return inconclusive("F4", describeError(err));
  }
  const passphraseUuid = parseOptionalUuid(ctx.cfg.passphraseChar);
  if (collidesWithCharge(passphraseUuid, chargeUuid)) {
    return inconclusive("F4", COLLISION_EVIDENCE);
  }
  const marker = ctx.marker || DEFAULT_MARKER;
  try {
    return await serialize(async () => {
      const chargeChar = await resolveChar(ctx.server, vendorSvc, chargeUuid);
      const passphraseChar =
        passphraseUuid === undefined
          ? undefined
          : await resolveChar(ctx.server, vendorSvc, passphraseUuid);
      const passphraseBytes = passphraseChar ? new TextEncoder().encode(marker) : undefined;
      return runF4(passphraseChar, chargeChar, passphraseBytes);
    });
  } catch (err) {
    return inconclusive(
      "F4",
      `GATT error resolving the privileged characteristic: ${describeError(err)}`,
    );
  }
}

/** F5: submit a benign marker to the passphrase path, then read + scan the log characteristic. */
export async function executeF5(ctx: CheckContext): Promise<CheckResult> {
  let vendorSvc: BluetoothServiceUUID;
  let passphraseUuid: BluetoothCharacteristicUUID;
  let logUuid: BluetoothCharacteristicUUID;
  try {
    vendorSvc = requireUuid(ctx.cfg.vendorService, "Vendor service UUID");
    passphraseUuid = requireUuid(ctx.cfg.passphraseChar, "Passphrase characteristic UUID");
    logUuid = requireUuid(ctx.cfg.logChar, "Log characteristic UUID");
  } catch (err) {
    return inconclusive("F5", describeError(err));
  }
  const chargeUuid = parseOptionalUuid(ctx.cfg.chargeChar);
  if (collidesWithCharge(passphraseUuid, chargeUuid)) {
    return inconclusive("F5", COLLISION_EVIDENCE);
  }
  const marker = ctx.marker || DEFAULT_MARKER;
  try {
    return await serialize(async () => {
      const passphraseChar = await resolveChar(ctx.server, vendorSvc, passphraseUuid);
      const logChar = await resolveChar(ctx.server, vendorSvc, logUuid);
      return runF5(passphraseChar, logChar, marker);
    });
  } catch (err) {
    return inconclusive(
      "F5",
      `GATT error resolving the passphrase/log characteristic: ${describeError(err)}`,
    );
  }
}

/**
 * Resolve on the next `characteristicvaluechanged` event, or reject after
 * F2_NOTIFICATION_TIMEOUT_MS if the device never notifies. Without this, a hung wait would never
 * release serialize()'s run-lock.
 */
export function makeNotificationWaiter(char: GattCharacteristic): () => Promise<DataView> {
  let pending: ((view: DataView) => void) | undefined;
  char.addEventListener("characteristicvaluechanged", (event) => {
    const view = (event.target as { value?: DataView }).value;
    if (pending && view) {
      const resolve = pending;
      pending = undefined;
      resolve(view);
    }
  });
  return () =>
    new Promise<DataView>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending = undefined;
        reject(new Error("F2 timed out waiting for a DFU Control Point notification"));
      }, F2_NOTIFICATION_TIMEOUT_MS);
      pending = (view) => {
        clearTimeout(timer);
        resolve(view);
      };
    });
}

/**
 * F2: transfer the init packet and classify signature enforcement. Abort-safe — flashing only
 * happens with `opts.commit` AND an unsigned-accepted device. Requires DFU files on `ctx.f2`.
 */
export async function executeF2(
  ctx: CheckContext,
  opts: { readonly commit: boolean },
): Promise<CheckResult> {
  const f2 = ctx.f2;
  if (!f2) {
    return inconclusive("F2", "F2 requires manifest/.dat/.bin — load all three files first.");
  }
  let dfuSvc: BluetoothServiceUUID;
  let controlPointUuid: BluetoothCharacteristicUUID;
  let packetUuid: BluetoothCharacteristicUUID;
  try {
    dfuSvc = requireUuid(ctx.cfg.dfuService, "DFU service UUID");
    controlPointUuid = requireUuid(ctx.cfg.controlPoint, "Control point characteristic UUID");
    packetUuid = requireUuid(ctx.cfg.packet, "Packet characteristic UUID");
  } catch (err) {
    return inconclusive("F2", describeError(err));
  }
  const waiterFactory = ctx.nextNotification ?? makeNotificationWaiter;
  try {
    return await serialize(async () => {
      const controlPoint = await resolveChar(ctx.server, dfuSvc, controlPointUuid);
      const packet = await resolveChar(ctx.server, dfuSvc, packetUuid);
      const nextNotification = waiterFactory(controlPoint);
      await controlPoint.startNotifications();
      return runF2(controlPoint, packet, f2.image, {
        signedPackage: f2.signed,
        commitBenignImage: opts.commit,
        nextNotification,
      });
    });
  } catch (err) {
    return inconclusive("F2", `GATT error during the DFU transfer: ${describeError(err)}`);
  }
}
