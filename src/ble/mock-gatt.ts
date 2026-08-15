import { toBytes } from "./bytes.js";
import type { GattCharacteristic, GattServer, GattService } from "./types.js";

export type GattOp =
  | { readonly op: "read"; readonly value: Uint8Array }
  | { readonly op: "write"; readonly value: Uint8Array };

export class MockCharacteristic implements GattCharacteristic {
  readonly ops: GattOp[] = [];
  rejectWrites = false;
  value?: DataView;
  readonly properties = {
    read: true,
    write: true,
    writeWithoutResponse: true,
    notify: true,
    indicate: true,
  } as const;
  private state: Uint8Array;
  private readonly listeners: Array<(e: Event) => void> = [];

  constructor(
    readonly uuid: string,
    initial: Uint8Array = Uint8Array.of(0x00),
  ) {
    this.state = initial.slice();
  }

  async readValue(): Promise<DataView> {
    const snapshot = this.state.slice();
    this.ops.push({ op: "read", value: snapshot });
    this.value = new DataView(snapshot.buffer);
    return this.value;
  }

  async writeValueWithResponse(value: BufferSource): Promise<void> {
    const bytes = toBytes(value);
    this.ops.push({ op: "write", value: bytes });
    if (!this.rejectWrites) {
      this.state = bytes.slice();
    }
  }

  async writeValueWithoutResponse(value: BufferSource): Promise<void> {
    await this.writeValueWithResponse(value);
  }

  async startNotifications(): Promise<GattCharacteristic> {
    return this;
  }

  addEventListener(_type: "characteristicvaluechanged", cb: (e: Event) => void): void {
    this.listeners.push(cb);
  }

  /** Test helper: deliver a notification frame to listeners. */
  emit(bytes: Uint8Array): void {
    this.value = new DataView(bytes.slice().buffer);
    const event = { target: this } as unknown as Event;
    for (const cb of this.listeners) {
      cb(event);
    }
  }
}

export class MockService implements GattService {
  constructor(
    private readonly characteristics: Map<string, MockCharacteristic>,
    readonly uuid = "mock-service",
  ) {}

  async getCharacteristic(uuid: string): Promise<GattCharacteristic> {
    const found = this.characteristics.get(uuid);
    if (!found) {
      throw new DOMException(`no characteristic ${uuid}`, "NotFoundError");
    }
    return found;
  }

  async getCharacteristics(): Promise<GattCharacteristic[]> {
    return [...this.characteristics.values()];
  }
}

export class MockServer implements GattServer {
  connected = false;
  constructor(private readonly services: Map<string, MockService>) {}

  async connect(): Promise<GattServer> {
    this.connected = true;
    return this;
  }

  async getPrimaryService(uuid: string | number): Promise<GattService> {
    const found = this.services.get(String(uuid));
    if (!found) {
      throw new DOMException(`no service ${String(uuid)}`, "NotFoundError");
    }
    return found;
  }

  async getPrimaryServices(): Promise<GattService[]> {
    return [...this.services.values()];
  }
}
