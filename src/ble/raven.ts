/**
 * Read-only decoder for Flock Raven telemetry, exposed over custom BLE services `0x3100`–`0x3500`.
 *
 * The Raven publishes each telemetry value as a human-readable UTF-8 string, so a "decode" is a
 * getCharacteristic → readValue → UTF-8 → trim; there is no binary scaling. Reads are read-only and
 * intended for authorized assessment of a device already in hand.
 *
 * Characteristic map sourced from colonelpanichacks/flock-you (MIT),
 * `datasets/raven_configurations.json` (the firmware 1.2.0 / 1.3.1 custom-service layout).
 */

import type { GattServer, GattService } from "./types.js";

/** Raven telemetry service ids (16-bit), granted post-connect so their values can be read. */
export const RAVEN_SERVICE_IDS = [0x3100, 0x3200, 0x3300, 0x3400, 0x3500] as const;

/** Telemetry grouping; power (battery/PMIC) first. */
export type RavenGroup = "power" | "gps" | "network" | "uploads" | "failures";

interface RavenCharDef {
  readonly service: number;
  readonly char: number;
  readonly name: string;
  readonly group: RavenGroup;
}

/** The recognized Raven characteristics, power group first (drives read + display order). */
const RAVEN_CHARS: readonly RavenCharDef[] = [
  { service: 0x3200, char: 0x3201, name: "Board Temperature", group: "power" },
  { service: 0x3200, char: 0x3202, name: "Battery Voltage", group: "power" },
  { service: 0x3200, char: 0x3203, name: "Charge/Discharge Current", group: "power" },
  { service: 0x3200, char: 0x3204, name: "10 W Solar Voltage", group: "power" },
  { service: 0x3200, char: 0x3205, name: "Battery State", group: "power" },
  { service: 0x3100, char: 0x3101, name: "GPS Latitude", group: "gps" },
  { service: 0x3100, char: 0x3102, name: "GPS Longitude", group: "gps" },
  { service: 0x3100, char: 0x3103, name: "GPS Altitude", group: "gps" },
  { service: 0x3300, char: 0x3301, name: "Last Connected", group: "network" },
  { service: 0x3300, char: 0x3302, name: "LTE Network Type", group: "network" },
  { service: 0x3300, char: 0x3303, name: "LTE Operator", group: "network" },
  { service: 0x3300, char: 0x3304, name: "LTE RSSI", group: "network" },
  { service: 0x3300, char: 0x3305, name: "LTE RSRQ", group: "network" },
  { service: 0x3300, char: 0x3306, name: "LTE RSRP", group: "network" },
  { service: 0x3300, char: 0x3307, name: "LTE SINR", group: "network" },
  { service: 0x3300, char: 0x3308, name: "Last Connected WiFi SSID", group: "network" },
  { service: 0x3300, char: 0x3309, name: "WiFi RSSI", group: "network" },
  { service: 0x3300, char: 0x330a, name: "Network Connection Status", group: "network" },
  { service: 0x3400, char: 0x3401, name: "Average Upload Time", group: "uploads" },
  { service: 0x3400, char: 0x3402, name: "Most Recent Upload Time", group: "uploads" },
  { service: 0x3400, char: 0x3403, name: "Number of Audio Uploads Since Boot", group: "uploads" },
  { service: 0x3500, char: 0x3501, name: "Identity Check Failures", group: "failures" },
  { service: 0x3500, char: 0x3502, name: "Status Update Failures", group: "failures" },
  { service: 0x3500, char: 0x3503, name: "Heartbeat Failures", group: "failures" },
  { service: 0x3500, char: 0x3504, name: "OTA Update Failures", group: "failures" },
  { service: 0x3500, char: 0x3505, name: "Audio Upload Failures", group: "failures" },
];

/** One decoded telemetry reading. */
export interface RavenReading {
  readonly name: string;
  readonly group: RavenGroup;
  readonly value: string;
}

function uuid16(short: number): string {
  return `0000${short.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;
}

/** Decode a Raven characteristic value: UTF-8, with trailing NULs and surrounding whitespace removed. */
export function decodeRavenValue(view: DataView): string {
  let text = new TextDecoder().decode(view);
  while (text.endsWith("\0")) {
    text = text.slice(0, -1);
  }
  return text.trim();
}

async function readCharString(service: GattService, uuid: string): Promise<string | undefined> {
  try {
    const characteristic = await service.getCharacteristic(uuid);
    const value = decodeRavenValue(await characteristic.readValue());
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function groupByService(defs: readonly RavenCharDef[]): Map<number, RavenCharDef[]> {
  const byService = new Map<number, RavenCharDef[]>();
  for (const def of defs) {
    const list = byService.get(def.service) ?? [];
    list.push(def);
    byService.set(def.service, list);
  }
  return byService;
}

/**
 * Read every recognized Raven telemetry characteristic the connected device exposes.
 *
 * Read-only. Never throws: an absent service or characteristic, or an empty/unreadable value, is
 * skipped. Values are returned power group first, in {@link RAVEN_CHARS} order.
 *
 * Args:
 *   server: A connected GATT server (real or mock) with the Raven services granted.
 */
export async function readRavenTelemetry(server: GattServer): Promise<RavenReading[]> {
  const readings: RavenReading[] = [];
  for (const [service, defs] of groupByService(RAVEN_CHARS)) {
    let svc: GattService;
    try {
      svc = await server.getPrimaryService(service);
    } catch {
      continue;
    }
    for (const def of defs) {
      const value = await readCharString(svc, uuid16(def.char));
      if (value !== undefined) {
        readings.push({ name: def.name, group: def.group, value });
      }
    }
  }
  return readings;
}
