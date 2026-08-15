import { describe, expect, it } from "vitest";
import type { GattCharacteristic } from "#ble/types.js";
import { classifyUnreadableLog, runF5, scanLog } from "./f5-log.js";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("F5 log-leak scan", () => {
  it("confirmed: submitted marker appears verbatim in the log buffer", () => {
    expect(scanLog(enc("auth fail: POCMARK-9931 at t=5"), "POCMARK-9931").verdict).toBe(
      "confirmed",
    );
  });
  it("refuted: marker absent from the log buffer", () => {
    expect(scanLog(enc("auth fail at t=5"), "POCMARK-9931").verdict).toBe("refuted");
  });
  it("documents that the timing side-channel is not tested", () => {
    expect(scanLog(enc("x"), "y").limits).toMatch(/timing/i);
  });
  it("inconclusive: classifyUnreadableLog answers §4.4", () => {
    const r = classifyUnreadableLog();
    expect(r.verdict).toBe("inconclusive");
    expect(r.evidence).toMatch(/not readable over BLE/i);
  });
  it("runF5 returns inconclusive when the log read rejects", async () => {
    const passphrase = {
      writeValueWithResponse: async () => undefined,
    } as unknown as GattCharacteristic;
    const logChar = {
      readValue: async () => {
        throw new DOMException("nope", "NotSupportedError");
      },
    } as unknown as GattCharacteristic;
    expect((await runF5(passphrase, logChar, "MARK")).verdict).toBe("inconclusive");
  });
});
