import { describe, expect, it } from "vitest";
import type { DiscoveredMap } from "#ble/connection.js";
import { MockCharacteristic, MockServer, MockService } from "#ble/mock-gatt.js";
import type { GattServer } from "#ble/types.js";
import type { CheckContext, ConfigInputs } from "#checks/execute.js";
import type { CheckResult } from "#checks/result.js";
import { runAll } from "./auto-run.js";

const VENDOR = "0000fe59-0000-1000-8000-00805f9b34fb";
const CHARGE = "00002a00-0000-1000-8000-00805f9b34fb";
const LOG = "00002a01-0000-1000-8000-00805f9b34fb";
const DFU_SVC = "0000fe59-0000-1000-8000-00805f9b34fc";
const BUTTONLESS_CHAR = "00008ec4-0000-1000-8000-00805f9b34fb";

const CFG: ConfigInputs = {
  dfuService: DFU_SVC,
  controlPoint: CHARGE,
  packet: LOG,
  buttonless: BUTTONLESS_CHAR,
  vendorService: VENDOR,
  chargeChar: CHARGE,
  passphraseChar: LOG,
  logChar: LOG,
  marker: "MARKER",
};

function ctxFor(server: GattServer): CheckContext {
  return { server, cfg: CFG, prompt: "just-works", marker: "MARKER" };
}

function vendorServer(): GattServer {
  const chars = new Map([[CHARGE, new MockCharacteristic(CHARGE)]]);
  return new MockServer(new Map([[VENDOR, new MockService(chars, VENDOR)]]));
}

interface Collected {
  readonly results: CheckResult[];
  readonly logs: string[];
}

async function collect(ctx: CheckContext, discovered: DiscoveredMap): Promise<Collected> {
  const results: CheckResult[] = [];
  const logs: string[] = [];
  await runAll(ctx, {
    discovered,
    onResult: (r) => results.push(r),
    onLog: (l) => logs.push(l),
  });
  return { results, logs };
}

describe("auto-run", () => {
  it("runs F1 → CH-1 → F4 → F5 → F2 in order", async () => {
    const { results, logs } = await collect(ctxFor(vendorServer()), {
      services: [VENDOR],
      dfuFlavor: "secure",
    });
    expect(results.map((r) => r.id)).toEqual(["F1", "CH-1", "F4", "F5", "F2"]);
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  it("runs the write tier (F4/F5/F2) with no authorization gate", async () => {
    const { results } = await collect(ctxFor(vendorServer()), {
      services: [VENDOR],
      dfuFlavor: "secure",
    });
    for (const id of ["F4", "F5", "F2"] as const) {
      const r = results.find((x) => x.id === id);
      expect(r).toBeDefined();
      expect(r?.evidence ?? "").not.toMatch(/attestation/i);
    }
  });

  it("never sends the buttonless ENTER write in auto-run", async () => {
    const buttonless = new MockCharacteristic(BUTTONLESS_CHAR);
    const dfuChars = new Map([[BUTTONLESS_CHAR, buttonless]]);
    const server = new MockServer(new Map([[DFU_SVC, new MockService(dfuChars, DFU_SVC)]]));
    const { results } = await collect(ctxFor(server), {
      services: [DFU_SVC],
      dfuFlavor: "buttonless-only",
    });
    const ch1 = results.find((r) => r.id === "CH-1");
    expect(ch1?.id).toBe("CH-1");
    expect(buttonless.ops.some((o) => o.op === "write")).toBe(false);
  });
});
