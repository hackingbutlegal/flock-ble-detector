import { describe, expect, it } from "vitest";
import type { CheckResult } from "#checks/result.js";
import { toResultCards } from "./results-view.js";

const sample: CheckResult[] = [
  {
    id: "F2",
    title: "No signature enforcement",
    verdict: "confirmed",
    s4ref: "§4.1",
    evidence: "Execute of unsigned app init packet returned 0x60 04 01 (SUCCESS).",
    limits: "Confirm the init packet decodes; INVALID_OBJECT alone is ambiguous.",
    raw: [{ label: "Execute response", hex: "60 04 01" }],
  },
];

describe("toResultCards", () => {
  it("mirrors verdict into badgeClass and renders raw lines", () => {
    const cards = toResultCards(sample);
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.badgeClass).toBe("confirmed");
    expect(card.rawLines[0]).toContain("Execute response");
    expect(card.rawLines[0]).toContain("60 04 01");
  });

  it("yields an empty rawLines array when no frames are present", () => {
    const cards = toResultCards([
      {
        id: "F5",
        title: "Log readable",
        verdict: "inconclusive",
        s4ref: "§4.4",
        evidence: "Log characteristic not readable over BLE.",
        limits: "Wired-only.",
      },
    ]);
    expect(cards[0]!.badgeClass).toBe("inconclusive");
    expect(cards[0]!.rawLines).toEqual([]);
  });
});
