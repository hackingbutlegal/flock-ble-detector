import { describe, expect, it } from "vitest";
import { parsePairingPrompt } from "./pairing-select.js";

describe("parsePairingPrompt", () => {
  it("passes valid values through", () => {
    expect(parsePairingPrompt("authenticated")).toBe("authenticated");
    expect(parsePairingPrompt("just-works")).toBe("just-works");
    expect(parsePairingPrompt("failed")).toBe("failed");
    expect(parsePairingPrompt("none")).toBe("none");
  });
  it("unknown input falls back to none", () => {
    expect(parsePairingPrompt("bogus")).toBe("none");
    expect(parsePairingPrompt("")).toBe("none");
  });
});
