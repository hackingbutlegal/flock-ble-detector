import type { GattCharacteristic } from "#ble/types.js";
import type { CheckResult } from "./result.js";

export type PairingPrompt = "none" | "just-works" | "authenticated" | "failed";

export interface PairingSignals {
  readonly readSucceeded: boolean;
  readonly prompt: PairingPrompt;
  readonly elapsedMs: number;
}

const LIMIT =
  "Web Bluetooth cannot read the SMP security level / MITM flag; the verdict is inferred " +
  "from the protected read plus the pairing-prompt type you selected. Pick the option that " +
  "matches the Android dialog you observed.";

export function classifyPairing(s: PairingSignals): CheckResult {
  const base = {
    id: "F1",
    title: "BLE pairing accepts Just Works",
    s4ref: "§4.2",
    limits: LIMIT,
  } as const;
  if (!s.readSucceeded || s.prompt === "failed") {
    return {
      ...base,
      verdict: "inconclusive",
      evidence: "Encryption-required read did not complete.",
    };
  }
  if (s.prompt === "authenticated") {
    return {
      ...base,
      verdict: "refuted",
      evidence:
        `A passkey / numeric-compare dialog appeared (elapsed ${s.elapsedMs} ms) — ` +
        `authenticated pairing in force.`,
    };
  }
  if (s.prompt === "just-works") {
    return {
      ...base,
      verdict: "confirmed",
      evidence:
        `Protected read succeeded after a plain "Pair?" prompt (elapsed ${s.elapsedMs} ms) — ` +
        `unauthenticated (Just Works) bond.`,
    };
  }
  return {
    ...base,
    verdict: "inconclusive",
    evidence:
      `Read succeeded with no pairing prompt (elapsed ${s.elapsedMs} ms) — the device may ` +
      `already be bonded or the characteristic is not encryption-gated. Forget the bond in ` +
      `Android Bluetooth settings and reconnect to observe the pairing method.`,
  };
}

/**
 * Read an encryption-required characteristic; `prompt` is the pairing-dialog type the
 * tester selected in the UI.
 */
export async function runF1(
  protectedChar: GattCharacteristic,
  prompt: PairingPrompt,
): Promise<CheckResult> {
  const start = Date.now();
  try {
    await protectedChar.readValue();
    return classifyPairing({ readSucceeded: true, prompt, elapsedMs: Date.now() - start });
  } catch {
    return classifyPairing({ readSucceeded: false, prompt, elapsedMs: Date.now() - start });
  }
}
