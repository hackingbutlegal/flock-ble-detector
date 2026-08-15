import { describe, expect, it } from "vitest";
import { classifyDfuReach } from "./ch1-dfu.js";
import { BUTTONLESS } from "#ble/nordic-constants.js";

describe("CH-1 DFU reachability", () => {
  it("confirmed: secure DFU already exposed (in bootloader)", () => {
    expect(classifyDfuReach("secure").verdict).toBe("confirmed");
  });
  it("confirmed: buttonless enter accepted (0x20 01 01) from current bond", () => {
    expect(
      classifyDfuReach(
        "buttonless-only",
        Uint8Array.of(BUTTONLESS.RESP, 0x01, BUTTONLESS.R_SUCCESS),
      ).verdict,
    ).toBe("confirmed");
  });
  it("refuted: buttonless returns NOT_BONDED (0x07)", () => {
    expect(
      classifyDfuReach(
        "buttonless-only",
        Uint8Array.of(BUTTONLESS.RESP, 0x01, BUTTONLESS.R_NOT_BONDED),
      ).verdict,
    ).toBe("refuted");
  });
  it("inconclusive: no DFU service found", () => {
    expect(classifyDfuReach("none").verdict).toBe("inconclusive");
  });
  it("legacy DFU present => confirmed (CRC-only path exposed)", () => {
    expect(classifyDfuReach("legacy").verdict).toBe("confirmed");
  });
  it("captures the buttonless response frame as raw evidence", () => {
    const resp = Uint8Array.of(0x20, 0x01, 0x01); // BUTTONLESS RESP + ENTER + SUCCESS
    const r = classifyDfuReach("buttonless-only", resp);
    expect(r.raw?.[0]?.hex).toBe("20 01 01");
  });
});
