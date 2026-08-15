import type { PairingPrompt } from "#checks/f1-pairing.js";

const VALID: ReadonlySet<string> = new Set(["none", "just-works", "authenticated", "failed"]);

/** Parse the `#f1-prompt-type` select value; unknown input falls back to `"none"`. */
export function parsePairingPrompt(raw: string): PairingPrompt {
  return VALID.has(raw) ? (raw as PairingPrompt) : "none";
}
