import { describe, expect, it } from "vitest";
import { charProperties, enumerate } from "./gatt-model.js";
import { MockCharacteristic, MockServer, MockService } from "./mock-gatt.js";

describe("gatt-model", () => {
  it("charProperties lists only the true flags in order", () => {
    expect(charProperties({ read: true, write: false, notify: true, indicate: false })).toEqual([
      "read",
      "notify",
    ]);
    expect(charProperties(undefined)).toEqual([]);
  });

  it("enumerate maps services -> characteristics -> properties (lowercased uuids)", async () => {
    const chars = new Map([["ABCD", new MockCharacteristic("ABCD")]]);
    const server = new MockServer(new Map([["svc-1", new MockService(chars, "SVC-1")]]));
    const table = await enumerate(server);
    expect(table[0]?.uuid).toBe("svc-1");
    expect(table[0]?.characteristics[0]?.uuid).toBe("abcd");
    expect(table[0]?.characteristics[0]?.properties).toContain("write");
  });
});
