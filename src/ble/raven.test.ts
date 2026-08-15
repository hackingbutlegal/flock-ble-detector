import { describe, expect, it } from "vitest";
import { MockCharacteristic, MockServer, MockService } from "./mock-gatt.js";
import { decodeRavenValue, RAVEN_SERVICE_IDS, readRavenTelemetry } from "./raven.js";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const uuid16 = (n: number): string =>
  `0000${n.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;

function serviceWith(serviceId: number, chars: ReadonlyArray<[number, string]>): MockServer {
  const map = new Map(
    chars.map(([id, val]) => [uuid16(id), new MockCharacteristic(uuid16(id), enc(val))]),
  );
  return new MockServer(new Map([[String(serviceId), new MockService(map, uuid16(serviceId))]]));
}

describe("raven telemetry", () => {
  it("decodeRavenValue decodes UTF-8 and trims NULs + surrounding whitespace", () => {
    expect(decodeRavenValue(new DataView(enc("  4.05 V\0\0").buffer))).toBe("4.05 V");
  });

  it("reads recognized power characteristics, labeled and grouped as power", async () => {
    const server = serviceWith(0x3200, [
      [0x3202, "4.05 V"],
      [0x3203, "-120 mA"],
    ]);
    await expect(readRavenTelemetry(server)).resolves.toEqual([
      { name: "Battery Voltage", group: "power", value: "4.05 V" },
      { name: "Charge/Discharge Current", group: "power", value: "-120 mA" },
    ]);
  });

  it("decodes a GPS reading from the 0x3100 service", async () => {
    const server = serviceWith(0x3100, [[0x3101, "37.7749"]]);
    await expect(readRavenTelemetry(server)).resolves.toEqual([
      { name: "GPS Latitude", group: "gps", value: "37.7749" },
    ]);
  });

  it("skips absent services and characteristics without throwing", async () => {
    await expect(
      readRavenTelemetry(new MockServer(new Map())).catch(() => "threw"),
    ).resolves.toEqual([]);
  });

  it("skips empty / whitespace-only values", async () => {
    const server = serviceWith(0x3200, [[0x3202, "   "]]);
    await expect(readRavenTelemetry(server)).resolves.toEqual([]);
  });

  it("ignores unrecognized characteristics on a known service", async () => {
    const server = serviceWith(0x3200, [[0x32ff, "junk"]]);
    await expect(readRavenTelemetry(server)).resolves.toEqual([]);
  });

  it("RAVEN_SERVICE_IDS spans 0x3100–0x3500", () => {
    expect(RAVEN_SERVICE_IDS).toEqual([0x3100, 0x3200, 0x3300, 0x3400, 0x3500]);
  });
});
