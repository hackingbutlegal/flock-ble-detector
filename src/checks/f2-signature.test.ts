import { describe, expect, it } from "vitest";
import { packU32le } from "#ble/bytes.js";
import { crc32 } from "#ble/crc32.js";
import type { DfuImage } from "#ble/dfu-package.js";
import type { GattCharacteristic } from "#ble/types.js";
import { interpretF2, runF2 } from "./f2-signature.js";

function view(bytes: readonly number[]): DataView {
  return new DataView(Uint8Array.of(...bytes).buffer);
}

async function noop(): Promise<void> {
  return undefined;
}

describe("F2 interpretation from command-Execute classification", () => {
  it("unsigned-accepted => confirmed (CRC-only, Critical branch)", () => {
    const r = interpretF2("unsigned-accepted", { signed: false });
    expect(r.verdict).toBe("confirmed");
    expect(r.evidence).toMatch(/CRC-only|does not enforce/i);
  });
  it("signed-enforced => refuted (signed bootloader; chain drops to DoS)", () => {
    expect(interpretF2("signed-enforced", { signed: false }).verdict).toBe("refuted");
  });
  it("pre-signature-failure => inconclusive (metadata rejected before signature)", () => {
    expect(interpretF2("pre-signature-failure", { signed: false }).verdict).toBe("inconclusive");
  });
  it("unknown => inconclusive", () => {
    expect(interpretF2("unknown", { signed: false }).verdict).toBe("inconclusive");
  });
  it("notes when the tester's package was itself signed (attacker-key lever)", () => {
    expect(interpretF2("signed-enforced", { signed: true }).limits).toMatch(
      /attacker-key|wrong key/i,
    );
  });
});

describe("F2 runF2 raw-frame capture", () => {
  it("attaches the Execute response frame as raw evidence", async () => {
    const initPacket = Uint8Array.of(0x12, 0x34, 0x56);
    const image: DfuImage = { initPacket, firmware: Uint8Array.of(0xaa), label: "test" };
    const checksumFrame = view([0x60, 0x03, 0x01, 0, 0, 0, 0, ...packU32le(crc32(initPacket))]);
    const queue = [
      view([0x60, 0x06, 0x01]), // Select response
      view([0x60, 0x01, 0x01]), // Create response
      checksumFrame, // Checksum response (matching CRC32)
      view([0x60, 0x04, 0x01]), // Execute response (SUCCESS)
    ];
    let i = 0;
    const nextNotification = async (): Promise<DataView> => {
      const frame = queue[i];
      i += 1;
      if (!frame) {
        throw new Error("notification queue exhausted");
      }
      return frame;
    };
    const controlPoint = { writeValueWithResponse: noop } as unknown as GattCharacteristic;
    const packet = { writeValueWithoutResponse: noop } as unknown as GattCharacteristic;

    const result = await runF2(controlPoint, packet, image, {
      signedPackage: false,
      commitBenignImage: false,
      nextNotification,
    });

    expect(result.raw?.some((f) => f.label === "Execute response" && f.hex === "60 04 01")).toBe(
      true,
    );
  });
});
