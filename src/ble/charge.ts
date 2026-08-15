import { hex, viewEquals } from "./bytes.js";
import type { GattCharacteristic } from "./types.js";

export interface ChargeWriteResult {
  readonly wrote: boolean;
}

/**
 * The ONLY permitted writer of a privileged/charge characteristic (spec §3 interlock).
 * read → return unchanged if already equal (idempotent) → write → read back → throw unless identical.
 * For the F4 gate probe, `desired` MUST be the value just read from the same characteristic.
 *
 * CALLER CONTRACT: All GATT operations against a device, including this function's
 * read→write→read sequence, MUST be issued through connection.serialize() — Chromium
 * rejects overlapping GATT operations. Callers are responsible for serialization;
 * setChargeState does not serialize internally.
 *
 * SAFETY: privileged/charge characteristics must only ever be written via setChargeState();
 * direct writeValue* on a charge characteristic bypasses the read-back interlock. This is
 * enforced by convention in the PoC; a lint/facade safeguard is deferred to the Phase-2
 * guardrail-hardening work.
 */
export async function setChargeState(
  charge: GattCharacteristic,
  desired: Uint8Array<ArrayBuffer>,
): Promise<ChargeWriteResult> {
  const current = await charge.readValue();
  if (viewEquals(current, desired)) {
    return { wrote: false };
  }
  await charge.writeValueWithResponse(desired);
  const readback = await charge.readValue();
  if (!viewEquals(readback, desired)) {
    throw new Error(`charge interlock: read-back ${hex(readback)} != desired ${hex(desired)}`);
  }
  return { wrote: true };
}
