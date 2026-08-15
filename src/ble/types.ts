/** Structural GATT interfaces satisfied by both the real Web Bluetooth objects and the mock. */

export interface GattCharacteristic {
  readonly uuid: string;
  readonly properties?: {
    readonly read?: boolean;
    readonly write: boolean;
    readonly writeWithoutResponse?: boolean;
    readonly notify: boolean;
    readonly indicate: boolean;
  };
  value?: DataView;
  readValue(): Promise<DataView>;
  // SAFETY: on a privileged/charge characteristic, write only via charge.ts's
  // setChargeState() — direct writeValue* here bypasses the read-back interlock.
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<GattCharacteristic>;
  addEventListener(type: "characteristicvaluechanged", cb: (e: Event) => void): void;
}

export interface GattService {
  readonly uuid?: string;
  getCharacteristic(uuid: BluetoothCharacteristicUUID): Promise<GattCharacteristic>;
  getCharacteristics(): Promise<GattCharacteristic[]>;
}

export interface GattServer {
  readonly connected: boolean;
  connect(): Promise<GattServer>;
  getPrimaryService(uuid: string | number): Promise<GattService>;
  getPrimaryServices(): Promise<GattService[]>;
}
