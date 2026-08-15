import { describe, expect, it } from "vitest";
import type { GattTable } from "#ble/gatt-model.js";
import { toGattRows } from "./gatt-table.js";

describe("toGattRows", () => {
  it("maps a characteristic to a row with joined properties and non-empty assignable targets", () => {
    const table: GattTable = [
      { uuid: "svc-1", characteristics: [{ uuid: "abcd", properties: ["read", "notify"] }] },
    ];
    const rows = toGattRows(table);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.serviceUuid).toBe("svc-1");
    expect(rows[0]?.charUuid).toBe("abcd");
    expect(rows[0]?.properties).toBe("read, notify");
    expect(rows[0]?.assignable.length).toBeGreaterThan(0);
  });

  it("emits one row per characteristic across every service, in order", () => {
    const table: GattTable = [
      {
        uuid: "s1",
        characteristics: [
          { uuid: "c1", properties: [] },
          { uuid: "c2", properties: ["write"] },
        ],
      },
      { uuid: "s2", characteristics: [{ uuid: "c3", properties: ["indicate"] }] },
    ];
    expect(toGattRows(table).map((r) => r.charUuid)).toEqual(["c1", "c2", "c3"]);
    expect(toGattRows(table).map((r) => r.serviceUuid)).toEqual(["s1", "s1", "s2"]);
  });

  it("renders an empty properties string when a characteristic has no flags", () => {
    const table: GattTable = [{ uuid: "s1", characteristics: [{ uuid: "c1", properties: [] }] }];
    expect(toGattRows(table)[0]?.properties).toBe("");
  });

  it("yields no rows for an empty table", () => {
    expect(toGattRows([])).toEqual([]);
  });
});
