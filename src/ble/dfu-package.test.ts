import { describe, expect, it } from "vitest";
import { isSignedInitPacket, parseManifest } from "./dfu-package.js";

describe("parseManifest", () => {
  it("reads application dat/bin file names", () => {
    const json = JSON.stringify({
      manifest: { application: { bin_file: "app.bin", dat_file: "app.dat" } },
    });
    expect(parseManifest(json)).toEqual({ datFile: "app.dat", binFile: "app.bin" });
  });
  it("throws on a non-application manifest (PoC is application-only)", () => {
    const json = JSON.stringify({ manifest: { softdevice_bootloader: {} } });
    expect(() => parseManifest(json)).toThrow(/application/);
  });
});

describe("isSignedInitPacket", () => {
  it("labels a top-level field-2 (signed_command) packet as signed", () => {
    // protobuf: field 2, wire type 2 (LEN) => tag byte 0x12
    expect(isSignedInitPacket(Uint8Array.of(0x12, 0x04, 0xde, 0xad, 0xbe, 0xef))).toBe(true);
  });
  it("labels a top-level field-1 (command) packet as unsigned", () => {
    // protobuf: field 1, wire type 2 (LEN) => tag byte 0x0a
    expect(isSignedInitPacket(Uint8Array.of(0x0a, 0x02, 0x08, 0x01))).toBe(false);
  });
});
