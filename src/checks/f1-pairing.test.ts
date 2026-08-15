import { describe, expect, it } from "vitest";
import { classifyPairing, type PairingPrompt, type PairingSignals } from "./f1-pairing.js";

const at = (prompt: PairingPrompt): PairingSignals => ({
  readSucceeded: true,
  prompt,
  elapsedMs: 5,
});

describe("F1 pairing classification", () => {
  it("just-works + read ok -> confirmed", () => {
    expect(classifyPairing(at("just-works")).verdict).toBe("confirmed");
  });
  it("authenticated -> refuted", () => {
    expect(classifyPairing(at("authenticated")).verdict).toBe("refuted");
  });
  it("none -> inconclusive with forget-bond guidance", () => {
    const r = classifyPairing(at("none"));
    expect(r.verdict).toBe("inconclusive");
    expect(r.evidence).toMatch(/forget the bond/i);
  });
  it("failed or read-fail -> inconclusive", () => {
    expect(
      classifyPairing({ readSucceeded: false, prompt: "just-works", elapsedMs: 1 }).verdict,
    ).toBe("inconclusive");
    expect(classifyPairing(at("failed")).verdict).toBe("inconclusive");
  });
  it("always documents the SMP-level limit", () => {
    expect(classifyPairing(at("just-works")).limits).toMatch(/SMP|security level/i);
  });
});
