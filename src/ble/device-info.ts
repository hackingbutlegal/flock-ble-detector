/** Reader for the standard Device Information Service (0x180A). */

import type { GattTable } from "./gatt-model.js";
import type { RavenReading } from "./raven.js";
import type { AdvertisementTells } from "./survey.js";
import type { GattServer, GattService } from "./types.js";

export interface DeviceInfo {
  manufacturer?: string;
  model?: string;
  firmware?: string;
}

/** Device identity captured for a session: chooser name, DIS strings, enumerated GATT table, the
 * connected target's Flock advertisement tells (company id / serial / confidence), and any Raven
 * telemetry read back (read-only). */
export interface DeviceContext {
  readonly name?: string;
  readonly info?: DeviceInfo;
  readonly gatt?: GattTable;
  readonly flock?: AdvertisementTells;
  readonly raven?: readonly RavenReading[];
}

const MANUFACTURER_NAME_UUID = "00002a29-0000-1000-8000-00805f9b34fb";
const MODEL_NUMBER_UUID = "00002a24-0000-1000-8000-00805f9b34fb";
const FIRMWARE_REVISION_UUID = "00002a26-0000-1000-8000-00805f9b34fb";

async function readUtf8String(service: GattService, uuid: string): Promise<string | undefined> {
  try {
    const characteristic = await service.getCharacteristic(uuid);
    const view = await characteristic.readValue();
    let text = new TextDecoder().decode(view);
    while (text.endsWith("\0")) {
      text = text.slice(0, -1);
    }
    return text;
  } catch {
    return undefined;
  }
}

/**
 * Reads manufacturer, model, and firmware strings from the Device Information Service.
 *
 * Args:
 *   server: A connected GATT server (real or mock).
 *
 * Returns:
 *   The available strings, trimmed of trailing NULs. Never throws: a missing
 *   service yields `{}` and a missing or unreadable characteristic omits that field.
 */
export async function readDeviceInfo(server: GattServer): Promise<DeviceInfo> {
  let service: GattService;
  try {
    service = await server.getPrimaryService(0x180a);
  } catch {
    return {};
  }
  const info: DeviceInfo = {};
  const manufacturer = await readUtf8String(service, MANUFACTURER_NAME_UUID);
  if (manufacturer !== undefined) {
    info.manufacturer = manufacturer;
  }
  const model = await readUtf8String(service, MODEL_NUMBER_UUID);
  if (model !== undefined) {
    info.model = model;
  }
  const firmware = await readUtf8String(service, FIRMWARE_REVISION_UUID);
  if (firmware !== undefined) {
    info.firmware = firmware;
  }
  return info;
}
