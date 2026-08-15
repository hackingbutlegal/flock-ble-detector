import { describe, expect, it } from "vitest";
import { crc32 } from "./crc32.js";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("crc32 (IEEE/zlib)", () => {
  it("matches known vectors", () => {
    expect(crc32(new Uint8Array(0)) >>> 0).toBe(0x00000000);
    expect(crc32(enc("123456789")) >>> 0).toBe(0xcbf43926); // canonical CRC-32 check value
    expect(crc32(enc("The quick brown fox jumps over the lazy dog")) >>> 0).toBe(0x414fa339);
  });
  it("is resumable via seed (chunked == whole)", () => {
    const whole = crc32(enc("123456789")) >>> 0;
    const a = crc32(enc("12345"));
    const chunked = crc32(enc("6789"), a) >>> 0;
    expect(chunked).toBe(whole);
  });
});
