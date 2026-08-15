import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDeviceFilters, discover, requestPmicDevice, serialize } from "./connection.js";
import { DFU, LEGACY } from "./nordic-constants.js";
import { FLOCK_COMPANY_ID, SMP_SERVICE_UUID } from "./survey.js";
import { MockCharacteristic, MockServer, MockService } from "./mock-gatt.js";

interface CapturedFilter {
  readonly namePrefix?: string;
  readonly services?: readonly (string | number)[];
  readonly manufacturerData?: readonly { readonly companyIdentifier: number }[];
}

interface CapturedOptions {
  readonly acceptAllDevices?: boolean;
  readonly filters?: readonly CapturedFilter[];
  readonly optionalServices?: readonly (string | number)[];
}

describe("serialize", () => {
  it("runs queued ops one at a time in order", async () => {
    const order: number[] = [];
    const mk = (n: number, ms: number) =>
      serialize(async () => {
        await new Promise((r) => setTimeout(r, ms));
        order.push(n);
        return n;
      });
    await Promise.all([mk(1, 20), mk(2, 5), mk(3, 1)]);
    expect(order).toEqual([1, 2, 3]); // FIFO, non-overlapping
  });
});

describe("discover", () => {
  it("reports secure DFU when control point + packet present", async () => {
    const svc = new MockService(
      new Map([
        [DFU.CONTROL_POINT, new MockCharacteristic(DFU.CONTROL_POINT)],
        [DFU.PACKET, new MockCharacteristic(DFU.PACKET)],
      ]),
      String(DFU.SERVICE),
    );
    const server = new MockServer(new Map([[String(DFU.SERVICE), svc]]));
    await server.connect();
    const d = await discover(server);
    expect(d.dfuFlavor).toBe("secure");
  });

  it("reports buttonless-only when only the buttonless char is present", async () => {
    const svc = new MockService(
      new Map([[DFU.BUTTONLESS_UNBONDED, new MockCharacteristic(DFU.BUTTONLESS_UNBONDED)]]),
      String(DFU.SERVICE),
    );
    const server = new MockServer(new Map([[String(DFU.SERVICE), svc]]));
    await server.connect();
    expect((await discover(server)).dfuFlavor).toBe("buttonless-only");
  });
});

function stubRequestDevice(): ReturnType<
  typeof vi.fn<(options: RequestDeviceOptions) => Promise<BluetoothDevice>>
> {
  const requestDevice = vi.fn<(options: RequestDeviceOptions) => Promise<BluetoothDevice>>(
    async () => ({}) as unknown as BluetoothDevice,
  );
  vi.stubGlobal("navigator", { bluetooth: { requestDevice } });
  return requestDevice;
}

describe("buildDeviceFilters", () => {
  it("builds likely-target OR-filters for Flock company id, Flock names, and DFU services", () => {
    const opts = buildDeviceFilters({
      filterMode: "likely",
      optionalServices: [],
    }) as CapturedOptions;
    expect(opts.acceptAllDevices).toBeUndefined();
    expect(opts.filters).toContainEqual({
      manufacturerData: [{ companyIdentifier: FLOCK_COMPANY_ID }],
    });
    expect(opts.filters).toContainEqual({ namePrefix: "Penguin" });
    expect(opts.filters).toContainEqual({ namePrefix: "FS Ext" });
    expect(opts.filters).toContainEqual({ services: [DFU.SERVICE] });
    expect(opts.filters).toContainEqual({ services: [SMP_SERVICE_UUID] });
    expect(opts.filters).not.toContainEqual(expect.objectContaining({ namePrefix: "PMIC" }));
  });

  it("adds a namePrefix filter when a name prefix is set in likely mode", () => {
    const opts = buildDeviceFilters({
      filterMode: "likely",
      namePrefix: "PMIC",
      optionalServices: [],
    }) as CapturedOptions;
    expect(opts.filters).toContainEqual({ namePrefix: "PMIC" });
    expect(opts.filters).toContainEqual({ services: [DFU.SERVICE] });
  });

  it("yields acceptAllDevices for all mode, ignoring any namePrefix", () => {
    const opts = buildDeviceFilters({
      filterMode: "all",
      namePrefix: "PMIC",
      optionalServices: [0x180a],
    }) as CapturedOptions;
    expect(opts.acceptAllDevices).toBe(true);
    expect(opts.filters).toBeUndefined();
    expect(opts.optionalServices).toContain(0x180a);
  });
});

describe("requestPmicDevice", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes likely-target filters (not acceptAllDevices) by default", async () => {
    const requestDevice = stubRequestDevice();
    await requestPmicDevice([LEGACY.SERVICE]);
    const opts = requestDevice.mock.calls[0]![0] as CapturedOptions;
    expect(opts.acceptAllDevices).toBeUndefined();
    expect(opts.filters).toContainEqual({ services: [DFU.SERVICE] });
    expect(opts.filters).toContainEqual({
      manufacturerData: [{ companyIdentifier: FLOCK_COMPANY_ID }],
    });
    expect(opts.optionalServices).toContain(SMP_SERVICE_UUID);
    expect(opts.optionalServices).toContain(0x180a);
    expect(opts.optionalServices).toContain(0x1800);
    expect(opts.optionalServices).toContain(LEGACY.SERVICE);
  });

  it("adds a namePrefix filter to the likely-target filters when given", async () => {
    const requestDevice = stubRequestDevice();
    await requestPmicDevice([], { namePrefix: "PMIC" });
    const opts = requestDevice.mock.calls[0]![0] as CapturedOptions;
    expect(opts.filters).toContainEqual({ namePrefix: "PMIC" });
    expect(opts.filters).toContainEqual({ services: [DFU.SERVICE] });
    expect(opts.acceptAllDevices).toBeUndefined();
  });

  it("accepts all devices when filterMode is all", async () => {
    const requestDevice = stubRequestDevice();
    await requestPmicDevice([], { filterMode: "all", namePrefix: "PMIC" });
    const opts = requestDevice.mock.calls[0]![0] as CapturedOptions;
    expect(opts.acceptAllDevices).toBe(true);
    expect(opts.filters).toBeUndefined();
  });
});
