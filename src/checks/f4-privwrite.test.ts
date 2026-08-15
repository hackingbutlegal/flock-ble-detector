import { describe, expect, it } from "vitest";
import { classifyGateError } from "./f4-privwrite.js";

const domErr = (name: string, msg = ""): DOMException => new DOMException(msg, name);

describe("F4 gate classification", () => {
  it("confirmed: idempotent write succeeded on an unpaired link", () => {
    expect(classifyGateError(undefined, true).verdict).toBe("confirmed");
  });
  it("refuted: SecurityError 'GATT operation not authorized'", () => {
    const r = classifyGateError(domErr("SecurityError", "GATT operation not authorized."), false);
    expect(r.verdict).toBe("refuted");
  });
  it("inconclusive: NetworkError 'Not paired' (pairing not completed)", () => {
    expect(
      classifyGateError(domErr("NetworkError", "GATT Error: Not paired."), false).verdict,
    ).toBe("inconclusive");
  });
  it("inconclusive: SecurityError from a missing optionalServices dev bug", () => {
    const r = classifyGateError(
      domErr("SecurityError", "Origin is not allowed to access the service."),
      false,
    );
    expect(r.verdict).toBe("inconclusive");
  });
  it("inconclusive: generic NotSupportedError 'unknown reason' is NOT an auth verdict", () => {
    expect(
      classifyGateError(
        domErr("NotSupportedError", "GATT operation failed for unknown reason."),
        false,
      ).verdict,
    ).toBe("inconclusive");
  });
});
