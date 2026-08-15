import type { GattCharacteristic } from "#ble/types.js";
import type { CheckResult } from "./result.js";

const BASE = {
  id: "F5",
  title: "Plaintext logging of submitted passphrases",
  s4ref: "§4.4",
  limits:
    "Only the plaintext-logging half is tested; the non-constant-time-compare timing " +
    "oracle is not measurable over Web Bluetooth (JS + BLE interval jitter). A benign " +
    "marker is submitted — no real credential is used.",
} as const;

export function scanLog(logBytes: Uint8Array, marker: string): CheckResult {
  const text = new TextDecoder().decode(logBytes);
  if (text.includes(marker)) {
    return {
      ...BASE,
      verdict: "confirmed",
      evidence: `Marker "${marker}" found verbatim in the readable log buffer.`,
    };
  }
  return {
    ...BASE,
    verdict: "refuted",
    evidence: `Marker "${marker}" not present in the readable log buffer.`,
  };
}

/** Classify a log characteristic that cannot be read over BLE (§4.4 wired-only, AV:P). */
export function classifyUnreadableLog(): CheckResult {
  return {
    ...BASE,
    verdict: "inconclusive",
    evidence:
      "Log characteristic not readable over BLE — §4.4 resolves to Informational " +
      "(wired-only, AV:P).",
  };
}

/** Submit a benign marker to the passphrase path, then read + scan the log characteristic. */
export async function runF5(
  passphraseChar: GattCharacteristic,
  logChar: GattCharacteristic,
  marker: string,
): Promise<CheckResult> {
  await passphraseChar.writeValueWithResponse(new TextEncoder().encode(marker));
  let view: DataView;
  try {
    view = await logChar.readValue();
  } catch {
    return classifyUnreadableLog();
  }
  return scanLog(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), marker);
}
