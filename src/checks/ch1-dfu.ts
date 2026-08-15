import { spacedHex } from "#ble/bytes.js";
import type { DiscoveredMap } from "#ble/connection.js";
import { BUTTONLESS } from "#ble/nordic-constants.js";
import type { GattCharacteristic } from "#ble/types.js";
import type { CheckResult } from "./result.js";

const BUTTONLESS_RESP_TIMEOUT_MS = 5000;

const BASE = {
  id: "CH-1",
  title: "DFU reachable from an unauthenticated bond",
  s4ref: "§4.2",
  limits: "Confirms DFU entry is gated by bonding only. Does not itself flash firmware (see F2).",
} as const;

export function classifyDfuReach(
  flavor: DiscoveredMap["dfuFlavor"],
  buttonlessResp?: Uint8Array,
): CheckResult {
  if (flavor === "secure") {
    return {
      ...BASE,
      verdict: "confirmed",
      evidence: "Secure DFU control point + packet exposed (device in bootloader / DFU open).",
    };
  }
  if (flavor === "legacy") {
    return {
      ...BASE,
      verdict: "confirmed",
      evidence: "Legacy DFU (0x1530) present — a CRC-only, non-signature path is exposed.",
    };
  }
  if (flavor === "buttonless-only") {
    const raw = buttonlessResp
      ? { raw: [{ label: "Buttonless ENTER response", hex: spacedHex(buttonlessResp) }] }
      : {};
    if (
      buttonlessResp &&
      buttonlessResp[0] === BUTTONLESS.RESP &&
      buttonlessResp[2] === BUTTONLESS.R_SUCCESS
    ) {
      return {
        ...BASE,
        verdict: "confirmed",
        evidence:
          "Buttonless ENTER accepted (0x20 01 01) from the current bond; device rebooted to DFU.",
        ...raw,
      };
    }
    if (buttonlessResp && buttonlessResp[2] === BUTTONLESS.R_NOT_BONDED) {
      return {
        ...BASE,
        verdict: "refuted",
        evidence:
          "Buttonless returned NOT_BONDED (0x07) — DFU entry requires bonding the app did " +
          "not grant.",
        ...raw,
      };
    }
    return {
      ...BASE,
      verdict: "inconclusive",
      evidence: "Buttonless characteristic present but no success indication captured.",
      ...raw,
    };
  }
  return { ...BASE, verdict: "inconclusive", evidence: "No DFU service discovered." };
}

/** Subscribe to the buttonless indication, write ENTER, and classify the captured response. */
export async function runCh1(
  discovered: DiscoveredMap,
  buttonlessChar?: GattCharacteristic,
): Promise<CheckResult> {
  if (discovered.dfuFlavor !== "buttonless-only" || !buttonlessChar) {
    return classifyDfuReach(discovered.dfuFlavor);
  }
  const resp = await new Promise<Uint8Array | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), BUTTONLESS_RESP_TIMEOUT_MS);
    buttonlessChar.addEventListener("characteristicvaluechanged", (e) => {
      clearTimeout(timer);
      const v = (e.target as { value?: DataView }).value;
      resolve(v ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : undefined);
    });
    void buttonlessChar
      .startNotifications()
      .then(() => buttonlessChar.writeValueWithResponse(Uint8Array.of(BUTTONLESS.ENTER)));
  });
  return classifyDfuReach(discovered.dfuFlavor, resp);
}
