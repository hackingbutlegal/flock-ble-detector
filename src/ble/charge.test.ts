import { describe, expect, it } from "vitest";
import { setChargeState } from "./charge.js";
import { MockCharacteristic } from "./mock-gatt.js";
import type { GattOp } from "./mock-gatt.js";

/** Safety invariant: every write on a charge characteristic is immediately read back and verified. */
function assertEveryWriteReadBack(ops: readonly GattOp[]): void {
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op || op.op !== "write") {
      continue;
    }
    const next = ops[i + 1];
    expect(next, `write at index ${i} not followed by read-back`).toBeDefined();
    expect(next?.op).toBe("read");
    expect(Array.from(next?.value ?? [])).toEqual(Array.from(op.value));
  }
}

describe("F4 idempotent-write interlock", () => {
  it("never writes a value that is not immediately read back", async () => {
    const c = new MockCharacteristic("charge", Uint8Array.of(0x00));
    await setChargeState(c, Uint8Array.of(0x01));
    assertEveryWriteReadBack(c.ops);
  });
  it("is idempotent: no write when already at desired", async () => {
    const c = new MockCharacteristic("charge", Uint8Array.of(0x01));
    const r = await setChargeState(c, Uint8Array.of(0x01));
    expect(r.wrote).toBe(false);
    expect(c.ops.map((o) => o.op)).toEqual(["read"]);
  });
  it("throws on read-back mismatch (device ignored the write)", async () => {
    const c = new MockCharacteristic("charge", Uint8Array.of(0x00));
    c.rejectWrites = true;
    await expect(setChargeState(c, Uint8Array.of(0x01))).rejects.toThrow(/interlock/);
  });
});
