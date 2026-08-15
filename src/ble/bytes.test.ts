import { describe, expect, it } from "vitest";
import { hex, packU32le, spacedHex, toBytes, u32le, viewEquals } from "./bytes.js";

describe("bytes", () => {
  it("hex renders lowercase padded bytes", () => {
    expect(hex(Uint8Array.of(0x00, 0x0f, 0xff))).toBe("000fff");
  });
  it("spacedHex renders uppercase space-separated bytes", () => {
    expect(spacedHex(Uint8Array.of(0x60, 0x04, 0x01))).toBe("60 04 01");
    expect(spacedHex(new DataView(Uint8Array.of(0x0a, 0xff).buffer))).toBe("0A FF");
  });
  it("viewEquals compares by length and content", () => {
    const dv = new DataView(Uint8Array.of(1, 2, 3).buffer);
    expect(viewEquals(dv, Uint8Array.of(1, 2, 3))).toBe(true);
    expect(viewEquals(dv, Uint8Array.of(1, 2))).toBe(false);
  });
  it("u32le reads a little-endian u32 at an offset", () => {
    // 0x60 0x06 0x01 | 00 10 00 00 -> max_size 0x1000 at offset 3
    const dv = new DataView(Uint8Array.of(0x60, 0x06, 0x01, 0x00, 0x10, 0x00, 0x00).buffer);
    expect(u32le(dv, 3)).toBe(0x1000);
  });
  it("packU32le round-trips with u32le", () => {
    const packed = packU32le(4096);
    expect(u32le(new DataView(packed.buffer), 0)).toBe(4096);
  });
  it("toBytes copies (does not alias) the source buffer", () => {
    const src = Uint8Array.of(9, 9);
    const out = toBytes(src);
    out[0] = 0;
    expect(src[0]).toBe(9);
  });
});
