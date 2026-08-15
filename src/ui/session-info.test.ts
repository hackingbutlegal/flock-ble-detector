import { describe, expect, it } from "vitest";
import { sessionMeta } from "./session-info.js";

describe("sessionMeta", () => {
  it("omits blank or whitespace-only fields", () => {
    expect(sessionMeta("", "   ")).toEqual({});
  });

  it("trims and includes provided fields", () => {
    expect(sessionMeta("  PMIC-01 ", "charge state")).toEqual({
      deviceName: "PMIC-01",
      target: "charge state",
    });
  });

  it("includes only the field that is filled", () => {
    expect(sessionMeta("PMIC-01", "")).toEqual({ deviceName: "PMIC-01" });
  });
});
