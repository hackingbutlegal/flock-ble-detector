import { describe, expect, it } from "vitest";
import { hex } from "./bytes.js";
import { MockCharacteristic, MockServer } from "./mock-gatt.js";

describe("mock-gatt", () => {
  it("records reads and writes in order and updates state", async () => {
    const c = new MockCharacteristic("c", Uint8Array.of(0x00));
    await c.writeValueWithResponse(Uint8Array.of(0x01));
    const v = await c.readValue();
    expect(hex(v)).toBe("01");
    expect(c.ops.map((o) => o.op)).toEqual(["write", "read"]);
  });
  it("rejectWrites leaves state unchanged", async () => {
    const c = new MockCharacteristic("c", Uint8Array.of(0x00));
    c.rejectWrites = true;
    await c.writeValueWithResponse(Uint8Array.of(0x09));
    expect(hex(await c.readValue())).toBe("00");
  });
  it("emit() delivers a notification to characteristicvaluechanged listeners", async () => {
    const c = new MockCharacteristic("c");
    const seen: string[] = [];
    c.addEventListener("characteristicvaluechanged", (e) => {
      seen.push(hex((e.target as unknown as { value: DataView }).value));
    });
    await c.startNotifications();
    c.emit(Uint8Array.of(0x60, 0x04, 0x01));
    expect(seen).toEqual(["600401"]);
  });
  it("getPrimaryService throws NotFoundError for an absent service", async () => {
    const s = new MockServer(new Map());
    await s.connect();
    await expect(s.getPrimaryService("nope")).rejects.toMatchObject({ name: "NotFoundError" });
  });
});
