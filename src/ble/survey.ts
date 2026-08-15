/** Pure device-survey core: Flock identification signals, scoring, reducer, feature-detect. */

// ---- Flock external-battery (PMIC) identification signals -----------------
// Primary source: ryanohoro, "Spotting Flock Safety's Falcon Cameras" (the XUNTONG 0x09C8
// manufacturer id, the "Penguin-"/"FS Ext Battery" GAP names, and the ASCII serial in the advert),
// corroborated by the FlipDeFlock counter-surveillance project. The battery beacons these during
// normal operation. Its BLE address is random, so no OUI/MAC signal is usable (and Web Bluetooth
// hides the address anyway) — identity rests on the company id, name, and serial.

/** XUNTONG manufacturer id in the Flock external-battery advert (carried in the scan response). */
export const FLOCK_COMPANY_ID = 0x09c8;

/** GAP name prefixes for the Flock external battery (case-insensitive). Post-2025-03 firmware
 * drops "Penguin-" and names the unit with the bare digit serial. */
export const FLOCK_NAME_PREFIXES = ["penguin", "fs ext"] as const;

// ---- Weaker "DFU-capable" signals (firmware-updatable, not Flock-specific) ----
/** Nordic DFU service UUID (`0xFE59` expanded). */
export const NORDIC_DFU_UUID = "0000fe59-0000-1000-8000-00805f9b34fb";
/** MCUmgr SMP service UUID (MCUboot DFU-over-BLE). */
export const SMP_SERVICE_UUID = "8d53dc1d-1db7-4cd3-868b-8a527460aa84";

/** How sure we are a device is a Flock/PMIC target — precision-over-recall (a false Flock is worse
 * than a missed one): a Flock-specific tell confirms, a generic DFU service is only "likely". */
export type FlockConfidence = "confirmed" | "likely" | "none";

/** A normalized snapshot of one device's advertised data. */
export interface AdvObservation {
  readonly id: string;
  readonly name?: string;
  readonly rssi?: number;
  readonly serviceUuids: readonly string[];
  readonly companyIds: readonly number[];
  /** ASCII serial decoded from the Flock 0x09C8 manufacturer payload, when present. */
  readonly serial?: string;
}

/** An observation annotated with its confidence rung and the signals that produced it. */
export interface ScoredDevice extends AdvObservation {
  readonly confidence: FlockConfidence;
  readonly signals: readonly string[];
  readonly likelyTarget: boolean;
  /** Sort rank derived from confidence: confirmed 2, likely 1, none 0. */
  readonly score: number;
}

/** A raw advertisement event shape, as read off a `requestLEScan` `advertisementreceived`. */
export interface RawAdvertisement {
  readonly id: string;
  readonly name?: string;
  readonly rssi?: number;
  readonly uuids?: readonly string[];
  readonly manufacturerData?: ReadonlyMap<number, DataView>;
}

function isAlphaNum(b: number): boolean {
  return (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a);
}

/**
 * Extract the Flock device serial from the 0x09C8 manufacturer payload.
 *
 * Web Bluetooth strips the 2-byte company id (it is the map key), so the payload is scanned in
 * full for the longest printable-ASCII alphanumeric run of at least 6 chars — the shape of the
 * "TN…" serial in the advert. Returns `undefined` when no plausible serial is present.
 *
 * @param payload The manufacturer-data DataView for company id 0x09C8, or `undefined`.
 */
export function decodeFlockSerial(payload: DataView | undefined): string | undefined {
  if (!payload) {
    return undefined;
  }
  let bestStart = 0;
  let bestLen = 0;
  let runStart = 0;
  let runLen = 0;
  for (let i = 0; i <= payload.byteLength; i++) {
    if (i < payload.byteLength && isAlphaNum(payload.getUint8(i))) {
      if (runLen === 0) {
        runStart = i;
      }
      runLen++;
    } else {
      if (runLen > bestLen) {
        bestLen = runLen;
        bestStart = runStart;
      }
      runLen = 0;
    }
  }
  if (bestLen < 6) {
    return undefined;
  }
  let serial = "";
  for (let i = bestStart; i < bestStart + bestLen; i++) {
    serial += String.fromCharCode(payload.getUint8(i));
  }
  return serial;
}

/**
 * Normalizes a raw advertisement into an `AdvObservation`.
 *
 * Service UUIDs are lowercased, company ids taken from the manufacturer-data map keys, and the
 * Flock serial decoded from the 0x09C8 payload when present.
 */
export function toObservation(raw: RawAdvertisement): AdvObservation {
  const serial = decodeFlockSerial(raw.manufacturerData?.get(FLOCK_COMPANY_ID));
  return {
    id: raw.id,
    serviceUuids: (raw.uuids ?? []).map((u) => u.toLowerCase()),
    companyIds: raw.manufacturerData ? [...raw.manufacturerData.keys()] : [],
    ...(raw.name !== undefined ? { name: raw.name } : {}),
    ...(raw.rssi !== undefined ? { rssi: raw.rssi } : {}),
    ...(serial !== undefined ? { serial } : {}),
  };
}

/**
 * Scores an observation for how likely it is to be a Flock external battery (PMIC) target.
 *
 * A Flock-specific tell — the XUNTONG company id `0x09C8` or a `Penguin`/`FS Ext` GAP name —
 * yields `confirmed`. A generic DFU service (Nordic `0xFE59` or MCUmgr SMP) with no Flock tell is
 * only `likely` (DFU-capable, not identified). Nothing else is a target. The name is the
 * passive-scan-safe signal; the company id and serial live in the scan response.
 */
export function scoreProfile(o: AdvObservation): ScoredDevice {
  const signals: string[] = [];
  const nameLc = (o.name ?? "").toLowerCase();
  const flockName = FLOCK_NAME_PREFIXES.some((p) => nameLc.startsWith(p));
  const flockCompany = o.companyIds.includes(FLOCK_COMPANY_ID);
  if (flockName) {
    signals.push("Flock battery name");
  }
  if (flockCompany) {
    signals.push("Flock mfg id (0x09C8)");
  }
  const dfu = o.serviceUuids.includes(NORDIC_DFU_UUID);
  const smp = o.serviceUuids.includes(SMP_SERVICE_UUID);
  if (dfu) {
    signals.push("Nordic DFU (0xFE59)");
  }
  if (smp) {
    signals.push("MCUboot SMP DFU");
  }
  let confidence: FlockConfidence = "none";
  if (flockName || flockCompany) {
    confidence = "confirmed";
  } else if (dfu || smp) {
    confidence = "likely";
  }
  const score = confidence === "confirmed" ? 2 : confidence === "likely" ? 1 : 0;
  return { ...o, confidence, signals, likelyTarget: confidence !== "none", score };
}

/** Flock identification tells recorded for a connected target, for the session log/report. */
export interface AdvertisementTells {
  readonly confidence: FlockConfidence;
  readonly signals: readonly string[];
  readonly companyIds: readonly number[];
  readonly serial?: string;
}

/**
 * Summarize an observation's Flock tells for logging: the confidence rung, matched signals, the
 * advertised company ids, and the decoded serial (when present).
 *
 * Used to record the *connected target's* own advertisement/identity in the session — distinct
 * from the bystander survey, which is never logged.
 */
export function advertisementTells(o: AdvObservation): AdvertisementTells {
  const scored = scoreProfile(o);
  return {
    confidence: scored.confidence,
    signals: scored.signals,
    companyIds: o.companyIds,
    ...(o.serial !== undefined ? { serial: o.serial } : {}),
  };
}

/**
 * True when the enumerated services include a Raven-specific custom service (`0x3100`–`0x3500`).
 *
 * Those services are exposed by the Flock Raven acoustic sensor and not by the Falcon or the bare
 * battery, so a match is a positive, GATT-backed Raven identification (post-connect only).
 */
export function hasRavenGatt(serviceUuids: readonly string[]): boolean {
  return serviceUuids.some((u) => {
    const short = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i.exec(u)?.[1];
    if (short === undefined) {
      return false;
    }
    const value = Number.parseInt(short, 16);
    return value >= 0x3100 && value <= 0x3500;
  });
}

function union<T>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])];
}

/**
 * Merges a new observation into the running map keyed by device id.
 *
 * The latest RSSI wins, service UUIDs and company ids are unioned, and the last non-empty name and
 * serial are retained. Returns a new map; the input accumulator is not mutated.
 */
export function mergeAdvertisement(
  acc: ReadonlyMap<string, AdvObservation>,
  obs: AdvObservation,
): Map<string, AdvObservation> {
  const next = new Map(acc);
  const prev = acc.get(obs.id);
  if (!prev) {
    next.set(obs.id, obs);
    return next;
  }
  const name = obs.name !== undefined && obs.name !== "" ? obs.name : prev.name;
  const rssi = obs.rssi ?? prev.rssi;
  const serial = obs.serial ?? prev.serial;
  const merged: AdvObservation = {
    id: obs.id,
    serviceUuids: union(prev.serviceUuids, obs.serviceUuids),
    companyIds: union(prev.companyIds, obs.companyIds),
    ...(name !== undefined ? { name } : {}),
    ...(rssi !== undefined ? { rssi } : {}),
    ...(serial !== undefined ? { serial } : {}),
  };
  next.set(obs.id, merged);
  return next;
}

/**
 * Feature-detects the experimental Web Bluetooth Scanning API.
 *
 * @param nav A navigator-like object; defaults to the global `navigator` when available.
 * @returns True when a `bluetooth` object exists and exposes `requestLEScan`.
 */
export function isScanningSupported(nav?: { bluetooth?: object }): boolean {
  const target = nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
  const bluetooth = target?.bluetooth;
  return !!bluetooth && "requestLEScan" in bluetooth;
}
