import { setChargeState } from "#ble/charge.js";
import type { GattCharacteristic } from "#ble/types.js";
import type { CheckResult } from "./result.js";

const BASE = {
  id: "F4",
  title: "Unpaired privileged-write gate",
  s4ref: "§4.3",
  limits:
    "Probe writes the charge characteristic's current value back to itself (idempotent) — " +
    "no charge value is changed. error.name collides (SecurityError = auth-reject AND " +
    "config bug), so the message substring disambiguates.",
} as const;

/** Interpret the outcome of an unpaired idempotent write to the privileged characteristic. */
export function classifyGateError(err: unknown, wrote: boolean): CheckResult {
  if (err === undefined) {
    return {
      ...BASE,
      verdict: "confirmed",
      evidence: wrote
        ? "Idempotent write to the privileged characteristic succeeded on an unpaired link."
        : "Privileged characteristic was already at its value; read succeeded on an " +
          "unpaired link (no auth challenge).",
    };
  }
  if (err instanceof DOMException) {
    if (err.name === "SecurityError" && /not authorized/i.test(err.message)) {
      return {
        ...BASE,
        verdict: "refuted",
        evidence: `Device rejected the write: ${err.name} "${err.message}". Gate holds.`,
      };
    }
    if (err.name === "SecurityError" && /not allowed to access the service/i.test(err.message)) {
      return {
        ...BASE,
        verdict: "inconclusive",
        evidence: "Config bug: service missing from optionalServices — fix and rerun.",
      };
    }
    return {
      ...BASE,
      verdict: "inconclusive",
      evidence: `Non-authoritative failure: ${err.name} "${err.message}".`,
    };
  }
  return { ...BASE, verdict: "inconclusive", evidence: `Unexpected error: ${String(err)}` };
}

/**
 * Optionally submit the passphrase, then attempt an idempotent write to the privileged
 * characteristic over the current (unpaired) link. Never changes a charge value
 * (setChargeState interlock).
 */
export async function runF4(
  passphraseChar: GattCharacteristic | undefined,
  chargeChar: GattCharacteristic,
  passphrase: Uint8Array<ArrayBuffer> | undefined,
): Promise<CheckResult> {
  try {
    if (passphraseChar && passphrase) {
      await passphraseChar.writeValueWithResponse(passphrase);
    }
    const current = await chargeChar.readValue();
    // Type-only cast: DataView.buffer is typed ArrayBufferLike (includes SharedArrayBuffer),
    // but setChargeState requires Uint8Array<ArrayBuffer> (see charge.ts). Runtime bytes are
    // identical either way — this is the same TS-strict gap documented in the Phase C report.
    const identical = new Uint8Array(
      current.buffer,
      current.byteOffset,
      current.byteLength,
    ).slice() as unknown as Uint8Array<ArrayBuffer>;
    const { wrote } = await setChargeState(chargeChar, identical);
    return classifyGateError(undefined, wrote);
  } catch (err) {
    return classifyGateError(err, false);
  }
}
