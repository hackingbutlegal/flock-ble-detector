import { describe, expect, it } from "vitest";
import {
  buildCreate,
  buildExecute,
  buildSelect,
  classifyCommandExecute,
  parseResponse,
} from "./dfu-codec.js";
import { EXT, OBJ, OP, RESULT } from "./nordic-constants.js";

const dv = (...b: number[]): DataView => new DataView(Uint8Array.of(...b).buffer);

describe("dfu-codec builders", () => {
  it("builds Select command", () => {
    expect([...buildSelect(OBJ.COMMAND)]).toEqual([OP.SELECT, OBJ.COMMAND]);
  });
  it("builds Create data with LE size", () => {
    expect([...buildCreate(OBJ.DATA, 4096)]).toEqual([OP.CREATE, OBJ.DATA, 0x00, 0x10, 0x00, 0x00]);
  });
  it("builds Execute", () => {
    expect([...buildExecute()]).toEqual([OP.EXECUTE]);
  });
});

describe("parseResponse", () => {
  it("parses a Select success (15 bytes)", () => {
    const r = parseResponse(
      dv(0x60, 0x06, 0x01, 0x00, 0x10, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x11, 0x22, 0x33, 0x44),
    );
    expect(r).toMatchObject({ requestOp: 0x06, result: 0x01, maxSize: 0x1000, offset: 5 });
    expect(r.crc32).toBe(0x44332211);
  });
  it("parses a plain error", () => {
    expect(parseResponse(dv(0x60, 0x04, 0x05))).toMatchObject({
      requestOp: 0x04,
      result: RESULT.INVALID_OBJECT,
    });
  });
  it("parses an extended error", () => {
    expect(parseResponse(dv(0x60, 0x04, 0x0b, EXT.SIGNATURE_MISSING))).toMatchObject({
      result: RESULT.EXT_ERROR,
      extError: EXT.SIGNATURE_MISSING,
    });
  });
  it("throws on a non-0x60 frame", () => {
    expect(() => parseResponse(dv(0x20, 0x01, 0x01))).toThrow(/response marker/);
  });
});

describe("classifyCommandExecute (F2 truth table)", () => {
  it("SUCCESS from an unsigned app init packet => unsigned-accepted (CRC-only)", () => {
    expect(classifyCommandExecute(parseResponse(dv(0x60, 0x04, 0x01)))).toBe("unsigned-accepted");
  });
  it("EXT SIGNATURE_MISSING => signed-enforced", () => {
    expect(classifyCommandExecute(parseResponse(dv(0x60, 0x04, 0x0b, EXT.SIGNATURE_MISSING)))).toBe(
      "signed-enforced",
    );
  });
  it("EXT WRONG_SIGNATURE_TYPE => signed-enforced", () => {
    expect(
      classifyCommandExecute(parseResponse(dv(0x60, 0x04, 0x0b, EXT.WRONG_SIGNATURE_TYPE))),
    ).toBe("signed-enforced");
  });
  it("plain INVALID_OBJECT => signed-enforced (bad signature) OR malformed — reported as signed-enforced", () => {
    expect(classifyCommandExecute(parseResponse(dv(0x60, 0x04, 0x05)))).toBe("signed-enforced");
  });
  it("pre-signature metadata failure (SD version) => pre-signature-failure", () => {
    expect(
      classifyCommandExecute(parseResponse(dv(0x60, 0x04, 0x0b, EXT.SD_VERSION_FAILURE))),
    ).toBe("pre-signature-failure");
  });
  it("EXT VERIFICATION_FAILED (0x0c, data-object hash code) => unknown", () => {
    expect(
      classifyCommandExecute(parseResponse(dv(0x60, 0x04, 0x0b, EXT.VERIFICATION_FAILED))),
    ).toBe("unknown");
  });
  it("unrecognized EXT code => unknown", () => {
    expect(classifyCommandExecute(parseResponse(dv(0x60, 0x04, 0x0b, 0x09)))).toBe("unknown");
  });
});
