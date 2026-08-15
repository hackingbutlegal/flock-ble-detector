import { describe, expect, it } from "vitest";
import type { CheckResult } from "#checks/result.js";
import type { ReportMeta } from "./report.js";
import { summarize, toJson, toMarkdown } from "./report.js";

const sample: CheckResult[] = [
  {
    id: "F2",
    title: "No signature enforcement",
    verdict: "confirmed",
    s4ref: "§4.1",
    evidence: "Execute of unsigned app init packet returned 0x60 04 01 (SUCCESS).",
    limits: "Confirm the init packet decodes; INVALID_OBJECT alone is ambiguous.",
    raw: [{ label: "Execute response", hex: "60 04 01" }],
  },
  {
    id: "F5",
    title: "Log readable",
    verdict: "inconclusive",
    s4ref: "§4.4",
    evidence: "Log characteristic not readable over BLE.",
    limits: "Wired-only.",
  },
];

const meta: ReportMeta = {
  generatedAt: "2026-08-13T12:00:00.000Z",
  sessionId: "abcdef12-3456-7890-abcd-ef1234567890",
  deviceName: "PMIC-DUT",
  target: "charger",
};

describe("report", () => {
  it("summarize counts results by verdict", () => {
    expect(summarize(sample)).toEqual({ confirmed: 1, refuted: 0, inconclusive: 1 });
  });

  it("markdown includes id, §4 ref, verdict and evidence", () => {
    const md = toMarkdown(sample);
    expect(md).toContain("F2");
    expect(md).toContain("§4.1");
    expect(md).toContain("confirmed");
    expect(md).toContain("SUCCESS");
  });

  it("markdown includes metadata header, summary line and raw frame hex", () => {
    const md = toMarkdown(sample, meta);
    expect(md).toContain("2026-08-13T12:00:00.000Z");
    expect(md).toContain("abcdef12-3456-7890-abcd-ef1234567890");
    expect(md).toContain("1 confirmed");
    expect(md).toContain("1 inconclusive");
    expect(md).toContain("60 04 01");
  });

  it("json serializes to { meta, results }", () => {
    expect(JSON.parse(toJson(sample, meta))).toEqual({ meta, results: sample });
  });

  it("json wraps results when no meta given", () => {
    expect(JSON.parse(toJson(sample))).toEqual({ results: sample });
  });

  it("markdown renders a Device section from meta.device", () => {
    const md = toMarkdown(sample, {
      ...meta,
      device: {
        name: "PMIC-DUT",
        info: { manufacturer: "Hewlett Packard Enterprise", model: "X1", firmware: "1.2.3" },
      },
    });
    expect(md).toContain("## Device");
    expect(md).toContain("Hewlett Packard Enterprise");
    expect(md).toContain("1.2.3");
  });

  it("markdown omits the Device section when meta has no device", () => {
    expect(toMarkdown(sample, meta)).not.toContain("## Device");
  });

  it("markdown renders read-only Raven telemetry from the device context", () => {
    const md = toMarkdown(sample, {
      ...meta,
      device: {
        name: "Raven",
        raven: [
          { name: "Battery Voltage", group: "power", value: "4.05 V" },
          { name: "GPS Latitude", group: "gps", value: "37.7749" },
        ],
      },
    });
    expect(md).toContain("### Raven telemetry (read-only)");
    expect(md).toContain("Battery Voltage:** 4.05 V");
    expect(md).toContain("GPS Latitude:** 37.7749");
  });

  it("markdown renders the Flock assessment (confidence, serial, company id) from the device tells", () => {
    const md = toMarkdown(sample, {
      ...meta,
      device: {
        name: "Penguin-42",
        flock: {
          confidence: "confirmed",
          signals: ["Flock mfg id (0x09C8)"],
          companyIds: [0x09c8],
          serial: "TN00000000000000",
        },
      },
    });
    expect(md).toContain("Flock assessment:** confirmed");
    expect(md).toContain("TN00000000000000");
    expect(md).toContain("0x09c8");
  });
});
