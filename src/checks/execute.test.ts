import { describe, expect, it } from "vitest";
import { MockCharacteristic, MockServer, MockService } from "#ble/mock-gatt.js";
import type { GattServer } from "#ble/types.js";
import type { DiscoveredMap } from "#ble/connection.js";
import type { CheckContext, ConfigInputs } from "./execute.js";
import { executeCh1, executeF1, executeF2, executeF4, executeF5 } from "./execute.js";

const VENDOR = "0000fe59-0000-1000-8000-00805f9b34fb";
const CHARGE = "00002a00-0000-1000-8000-00805f9b34fb";
const LOG = "00002a01-0000-1000-8000-00805f9b34fb";

const BLANK_CFG: ConfigInputs = {
  dfuService: "",
  controlPoint: "",
  packet: "",
  buttonless: "",
  vendorService: "",
  chargeChar: "",
  passphraseChar: "",
  logChar: "",
  marker: "MARKER",
};

function serverWithCharge(): GattServer {
  const chars = new Map([[CHARGE, new MockCharacteristic(CHARGE)]]);
  return new MockServer(new Map([[VENDOR, new MockService(chars, VENDOR)]]));
}

function ctxWith(cfg: Partial<ConfigInputs>, server: GattServer): CheckContext {
  return { server, cfg: { ...BLANK_CFG, ...cfg }, prompt: "just-works", marker: "MARKER" };
}

describe("execute per-check functions", () => {
  it("executeF1 returns a verdict on a readable characteristic", async () => {
    const ctx = ctxWith({ vendorService: VENDOR, chargeChar: CHARGE }, serverWithCharge());
    const result = await executeF1(ctx);
    expect(result.id).toBe("F1");
    expect(result.verdict).toBe("confirmed");
  });

  it("executeF4 is inconclusive (never throws) when the vendor UUID is blank", async () => {
    const ctx = ctxWith({ chargeChar: CHARGE }, serverWithCharge());
    const result = await executeF4(ctx);
    expect(result.id).toBe("F4");
    expect(result.verdict).toBe("inconclusive");
    expect(result.evidence).toMatch(/required/i);
  });

  it("executeF5 is inconclusive when the vendor UUID is blank", async () => {
    const ctx = ctxWith({ passphraseChar: CHARGE, logChar: LOG }, serverWithCharge());
    const result = await executeF5(ctx);
    expect(result.verdict).toBe("inconclusive");
    expect(result.evidence).toMatch(/required/i);
  });

  it("executeF5 is inconclusive when passphrase and charge UUIDs collide", async () => {
    const ctx = ctxWith(
      { vendorService: VENDOR, passphraseChar: CHARGE, chargeChar: CHARGE, logChar: LOG },
      serverWithCharge(),
    );
    const result = await executeF5(ctx);
    expect(result.verdict).toBe("inconclusive");
    expect(result.evidence).toMatch(/distinct/i);
  });

  it("executeCh1 annotates the skipped buttonless ENTER in auto-run (never sends it)", async () => {
    const discovered: DiscoveredMap = { services: [], dfuFlavor: "buttonless-only" };
    const ctx = ctxWith({}, serverWithCharge());
    const result = await executeCh1(ctx, discovered, { sendButtonless: false });
    expect(result.id).toBe("CH-1");
    expect(result.verdict).toBe("inconclusive");
    expect(result.evidence).toMatch(/skipped in auto-run/i);
    expect(result.evidence).toMatch(/run CH-1 manually/i);
  });

  it("executeF2 is inconclusive when no DFU files are loaded", async () => {
    const ctx = ctxWith(
      { dfuService: VENDOR, controlPoint: CHARGE, packet: LOG },
      serverWithCharge(),
    );
    const result = await executeF2(ctx, { commit: false });
    expect(result.verdict).toBe("inconclusive");
    expect(result.evidence).toMatch(/manifest/i);
  });
});
