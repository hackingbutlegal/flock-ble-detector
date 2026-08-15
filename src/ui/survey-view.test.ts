import { describe, expect, it } from "vitest";
import type { AdvObservation } from "#ble/survey.js";
import { FLOCK_COMPANY_ID, NORDIC_DFU_UUID } from "#ble/survey.js";
import { toSurveyRows } from "./survey-view.js";

describe("toSurveyRows", () => {
  it("ranks confirmed Flock first, then likely, then unrelated — with confidence + serial", () => {
    const devices = new Map<string, AdvObservation>([
      ["unrelated", { id: "unrelated", serviceUuids: [], companyIds: [] }],
      [
        "dfu",
        { id: "dfu", name: "PMIC", rssi: -50, serviceUuids: [NORDIC_DFU_UUID], companyIds: [] },
      ],
      [
        "flock",
        {
          id: "flock",
          name: "Penguin-1",
          rssi: -70,
          serviceUuids: [],
          companyIds: [FLOCK_COMPANY_ID],
          serial: "TN700",
        },
      ],
    ]);
    const rows = toSurveyRows(devices);
    // confirmed outranks likely outranks none, regardless of RSSI.
    expect(rows.map((r) => r.id)).toEqual(["flock", "dfu", "unrelated"]);

    const flock = rows[0]!;
    expect(flock.confidence).toBe("confirmed");
    expect(flock.likelyTarget).toBe(true);
    expect(flock.serial).toBe("TN700");

    const dfu = rows[1]!;
    expect(dfu.confidence).toBe("likely");
    expect(dfu.name).toBe("PMIC");
    expect(dfu.rssi).toBe("-50 dBm");

    const unrelated = rows[2]!;
    expect(unrelated.confidence).toBe("none");
    expect(unrelated.likelyTarget).toBe(false);
    expect(unrelated.name).toBe("(unnamed)");
    expect(unrelated.rssi).toBe("—");
  });
});
