import { DFU, LEGACY } from "./nordic-constants.js";
import { RAVEN_SERVICE_IDS } from "./raven.js";
import { FLOCK_COMPANY_ID, SMP_SERVICE_UUID } from "./survey.js";
import type { GattServer, GattService } from "./types.js";

let tail: Promise<unknown> = Promise.resolve();

/** Serialize GATT operations: Chromium rejects overlapping reads/writes. FIFO, non-overlapping. */
export function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export interface DiscoveredMap {
  readonly services: string[];
  readonly dfuFlavor: "secure" | "legacy" | "buttonless-only" | "none";
}

async function characteristicUuids(svc: GattService): Promise<Set<string>> {
  const chars = await svc.getCharacteristics();
  return new Set(chars.map((c) => c.uuid.toLowerCase()));
}

/** Enumerate services and classify which DFU path (if any) the device exposes. */
export async function discover(server: GattServer): Promise<DiscoveredMap> {
  const services = await server.getPrimaryServices();
  const uuids = services.map((s) => (s.uuid ?? "").toLowerCase());
  let dfuFlavor: DiscoveredMap["dfuFlavor"] = "none";

  const hasDfuService =
    uuids.includes(String(DFU.SERVICE)) || uuids.includes("0000fe59-0000-1000-8000-00805f9b34fb");
  if (hasDfuService) {
    const dfuSvc = services.find(
      (s) => (s.uuid ?? "") === String(DFU.SERVICE) || (s.uuid ?? "").includes("fe59"),
    );
    const chars = dfuSvc ? await characteristicUuids(dfuSvc) : new Set<string>();
    if (chars.has(DFU.CONTROL_POINT) && chars.has(DFU.PACKET)) {
      dfuFlavor = "secure";
    } else if (chars.has(DFU.BUTTONLESS_UNBONDED) || chars.has(DFU.BUTTONLESS_BONDED)) {
      dfuFlavor = "buttonless-only";
    }
  } else if (uuids.includes(LEGACY.SERVICE)) {
    dfuFlavor = "legacy";
  }

  return { services: uuids, dfuFlavor };
}

/** Chooser scope: narrow to likely PMIC targets, or accept every advertising device. */
export type FilterMode = "likely" | "all";

/**
 * Build the `requestDevice` options for a chooser filter mode.
 *
 * `"likely"` yields Web Bluetooth OR-filters — a device is offered if it advertises the Flock
 * external-battery company id (`0x09C8`), a `Penguin`/`FS Ext` name, the Nordic DFU service
 * (`0xFE59`), the MCUmgr SMP service, or (when set) a caller name prefix. `"all"` yields
 * `acceptAllDevices` as the escape hatch and ignores any name prefix. A filter only matches
 * advertised data, so a device that isn't currently advertising a matched signal can be hidden by
 * `"likely"` — hence the `"all"` fallback. The chooser does an active scan, so it sees the Flock
 * scan-response company id.
 *
 * Args:
 *   opts.filterMode: `"likely"` to narrow to likely targets, `"all"` to accept every device.
 *   opts.namePrefix: Optional device-name prefix, added as an extra OR-filter in `"likely"` mode.
 *   opts.optionalServices: Service UUIDs to grant post-connect access to.
 */
export function buildDeviceFilters(opts: {
  readonly filterMode: FilterMode;
  readonly namePrefix?: string;
  readonly optionalServices: BluetoothServiceUUID[];
}): RequestDeviceOptions {
  const { filterMode, namePrefix, optionalServices } = opts;
  if (filterMode === "all") {
    return { acceptAllDevices: true, optionalServices };
  }
  const filters: BluetoothLEScanFilter[] = [
    { manufacturerData: [{ companyIdentifier: FLOCK_COMPANY_ID }] },
    { namePrefix: "Penguin" },
    { namePrefix: "FS Ext" },
    { services: [DFU.SERVICE] },
    { services: [SMP_SERVICE_UUID] },
  ];
  if (namePrefix !== undefined && namePrefix.length > 0) {
    filters.push({ namePrefix });
  }
  return { filters, optionalServices };
}

/**
 * Prompt the user to pick the device. MUST be called from a user gesture and a secure context.
 *
 * The chooser is narrowed via `buildDeviceFilters`. `optionalServices` always includes the Nordic
 * DFU service, the MCUmgr SMP service, Device Information (0x180A), Generic Access (0x1800), and the
 * Flock Raven telemetry services (0x3100–0x3500) so they can be read after connect. `opts.filterMode`
 * defaults to `"likely"`; an explicit `"all"` ignores `namePrefix`.
 *
 * Args:
 *   optionalUuids: Extra service UUIDs (e.g. legacy DFU, tester-entered vendor UUID) to grant.
 *   opts: Optional `filterMode` (default `"likely"`) and `namePrefix` to narrow the chooser.
 */
export async function requestPmicDevice(
  optionalUuids: BluetoothServiceUUID[],
  opts?: { readonly filterMode?: FilterMode; readonly namePrefix?: string },
): Promise<BluetoothDevice> {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth unavailable — use Chrome for Android over HTTPS.");
  }
  const optionalServices: BluetoothServiceUUID[] = [
    DFU.SERVICE,
    SMP_SERVICE_UUID,
    0x180a,
    0x1800,
    ...RAVEN_SERVICE_IDS,
    ...optionalUuids,
  ];
  const filterMode = opts?.filterMode ?? "likely";
  return navigator.bluetooth.requestDevice(
    buildDeviceFilters({
      filterMode,
      optionalServices,
      ...(opts?.namePrefix !== undefined ? { namePrefix: opts.namePrefix } : {}),
    }),
  );
}
