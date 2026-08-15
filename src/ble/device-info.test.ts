import { describe, expect, it } from "vitest";
import { readDeviceInfo } from "./device-info.js";
import { MockCharacteristic, MockServer, MockService } from "./mock-gatt.js";

const DIS_KEY = String(0x180a);
const MANUFACTURER_UUID = "00002a29-0000-1000-8000-00805f9b34fb";
const MODEL_UUID = "00002a24-0000-1000-8000-00805f9b34fb";
const FIRMWARE_UUID = "00002a26-0000-1000-8000-00805f9b34fb";

function utf8Char(uuid: string, text: string): MockCharacteristic {
  return new MockCharacteristic(uuid, new TextEncoder().encode(text));
}

describe("readDeviceInfo", () => {
  it("reads manufacturer/model/firmware and trims trailing NULs", async () => {
    const chars = new Map([
      [MANUFACTURER_UUID, utf8Char(MANUFACTURER_UUID, "Nothing Tech\0\0")],
      [MODEL_UUID, utf8Char(MODEL_UUID, "A063")],
      [FIRMWARE_UUID, utf8Char(FIRMWARE_UUID, "1.2.3\0")],
    ]);
    const server = new MockServer(new Map([[DIS_KEY, new MockService(chars, DIS_KEY)]]));

    const info = await readDeviceInfo(server);

    expect(info).toEqual({ manufacturer: "Nothing Tech", model: "A063", firmware: "1.2.3" });
  });

  it("returns {} when the device has no Device Information Service", async () => {
    const server = new MockServer(new Map([["other", new MockService(new Map(), "other")]]));

    await expect(readDeviceInfo(server)).resolves.toEqual({});
  });

  it("omits fields whose characteristic is missing", async () => {
    const chars = new Map([[MODEL_UUID, utf8Char(MODEL_UUID, "A063")]]);
    const server = new MockServer(new Map([[DIS_KEY, new MockService(chars, DIS_KEY)]]));

    const info = await readDeviceInfo(server);

    expect(info).toEqual({ model: "A063" });
    expect(info).not.toHaveProperty("manufacturer");
    expect(info).not.toHaveProperty("firmware");
  });
});
