import { describe, expect, it } from "vitest";
import {
  advertisementTells,
  decodeFlockSerial,
  FLOCK_COMPANY_ID,
  hasRavenGatt,
  isScanningSupported,
  mergeAdvertisement,
  NORDIC_DFU_UUID,
  scoreProfile,
  SMP_SERVICE_UUID,
  toObservation,
} from "./survey.js";

const obs = (over = {}) => ({ id: "d1", serviceUuids: [], companyIds: [], ...over });

function dv(bytes: number[]): DataView {
  return new DataView(Uint8Array.from(bytes).buffer);
}

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

describe("survey scoring", () => {
  it("confirms a device advertising the Flock company id (0x09C8)", () => {
    const r = scoreProfile(obs({ companyIds: [FLOCK_COMPANY_ID] }));
    expect(r.confidence).toBe("confirmed");
    expect(r.likelyTarget).toBe(true);
    expect(r.signals.join(" ")).toMatch(/Flock/i);
  });

  it("confirms a Penguin / FS Ext battery name (case-insensitive)", () => {
    expect(scoreProfile(obs({ name: "Penguin-0123456789" })).confidence).toBe("confirmed");
    expect(scoreProfile(obs({ name: "FS Ext Battery" })).confidence).toBe("confirmed");
  });

  it("rates a bare DFU service as likely (DFU-capable), not confirmed", () => {
    expect(scoreProfile(obs({ serviceUuids: [NORDIC_DFU_UUID] })).confidence).toBe("likely");
    expect(scoreProfile(obs({ serviceUuids: [SMP_SERVICE_UUID] })).confidence).toBe("likely");
  });

  it("does not flag an unrelated device", () => {
    const r = scoreProfile(obs({ serviceUuids: ["0000180f-0000-1000-8000-00805f9b34fb"] }));
    expect(r.confidence).toBe("none");
    expect(r.likelyTarget).toBe(false);
    expect(r.score).toBe(0);
  });

  it("ranks confirmed above likely for sorting", () => {
    const confirmed = scoreProfile(obs({ companyIds: [FLOCK_COMPANY_ID] })).score;
    const likely = scoreProfile(obs({ serviceUuids: [NORDIC_DFU_UUID] })).score;
    expect(confirmed).toBeGreaterThan(likely);
  });

  it("decodeFlockSerial extracts the ASCII serial from the 0x09C8 payload", () => {
    const serial = "TN00000000000000";
    expect(decodeFlockSerial(dv([0x00, 0x01, ...ascii(serial)]))).toBe(serial);
    expect(decodeFlockSerial(dv([0x00, 0x01]))).toBeUndefined();
    expect(decodeFlockSerial(undefined)).toBeUndefined();
  });

  it("toObservation decodes the Flock serial and lowercases uuids", () => {
    const serial = "TN00000000000000";
    const md = new Map([[FLOCK_COMPANY_ID, dv(ascii(serial))]]);
    const o = toObservation({
      id: "d1",
      uuids: ["0000FE59-0000-1000-8000-00805F9B34FB"],
      manufacturerData: md,
    });
    expect(o.serviceUuids).toContain(NORDIC_DFU_UUID);
    expect(o.companyIds).toEqual([FLOCK_COMPANY_ID]);
    expect(o.serial).toBe(serial);
  });

  it("advertisementTells confirms via the Flock company id and passes the serial + company ids", () => {
    const t = advertisementTells(obs({ companyIds: [FLOCK_COMPANY_ID], serial: "TN700" }));
    expect(t.confidence).toBe("confirmed");
    expect(t.serial).toBe("TN700");
    expect(t.companyIds).toContain(FLOCK_COMPANY_ID);
  });

  it("advertisementTells rates a bare DFU-service device as likely with no serial", () => {
    const t = advertisementTells(obs({ serviceUuids: [NORDIC_DFU_UUID] }));
    expect(t.confidence).toBe("likely");
    expect(t.serial).toBeUndefined();
  });

  it("hasRavenGatt detects a Raven custom service (0x3100-0x3500)", () => {
    expect(hasRavenGatt(["00003100-0000-1000-8000-00805f9b34fb"])).toBe(true);
    expect(hasRavenGatt(["00003500-0000-1000-8000-00805f9b34fb"])).toBe(true);
    expect(hasRavenGatt(["0000fe59-0000-1000-8000-00805f9b34fb"])).toBe(false);
    expect(hasRavenGatt(["00003600-0000-1000-8000-00805f9b34fb"])).toBe(false);
  });

  it("mergeAdvertisement dedupes by id, updates rssi, keeps serial + name", () => {
    let acc = new Map();
    acc = mergeAdvertisement(acc, obs({ rssi: -70, serviceUuids: [NORDIC_DFU_UUID] }));
    acc = mergeAdvertisement(
      acc,
      obs({ rssi: -55, companyIds: [FLOCK_COMPANY_ID], name: "Penguin-1", serial: "TN700" }),
    );
    expect(acc.size).toBe(1);
    const m = acc.get("d1");
    expect(m?.rssi).toBe(-55);
    expect(m?.name).toBe("Penguin-1");
    expect(m?.serial).toBe("TN700");
    expect(scoreProfile(m!).confidence).toBe("confirmed");
  });

  it("mergeAdvertisement keeps a real name over a later empty-string name", () => {
    let acc = new Map();
    acc = mergeAdvertisement(acc, obs({ name: "Penguin-01" }));
    acc = mergeAdvertisement(acc, obs({ name: "" }));
    expect(acc.get("d1")?.name).toBe("Penguin-01");
  });

  it("isScanningSupported reflects requestLEScan presence", () => {
    expect(isScanningSupported({ bluetooth: { requestLEScan: () => {} } })).toBe(true);
    expect(isScanningSupported({ bluetooth: {} })).toBe(false);
    expect(isScanningSupported({})).toBe(false);
  });
});
