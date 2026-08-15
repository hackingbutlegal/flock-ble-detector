import { describe, expect, it } from "vitest";
import { DFU, EXT, OBJ, OP, RESULT } from "./nordic-constants.js";

describe("nordic-constants", () => {
  it("has the canonical Secure DFU UUIDs", () => {
    expect(DFU.SERVICE).toBe(0xfe59);
    expect(DFU.CONTROL_POINT).toBe("8ec90001-f315-4f60-9fb8-838830daea50");
    expect(DFU.PACKET).toBe("8ec90002-f315-4f60-9fb8-838830daea50");
    expect(DFU.BUTTONLESS_UNBONDED).toBe("8ec90003-f315-4f60-9fb8-838830daea50");
    expect(DFU.BUTTONLESS_BONDED).toBe("8ec90004-f315-4f60-9fb8-838830daea50");
  });
  it("encodes the F2-relevant opcodes and codes", () => {
    expect(OP.EXECUTE).toBe(0x04);
    expect(OBJ.COMMAND).toBe(0x01);
    expect(RESULT.INVALID_OBJECT).toBe(0x05);
    expect(RESULT.EXT_ERROR).toBe(0x0b);
    expect(EXT.SIGNATURE_MISSING).toBe(0x08);
    expect(EXT.VERIFICATION_FAILED).toBe(0x0c);
  });
});
