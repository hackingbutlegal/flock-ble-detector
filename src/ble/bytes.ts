/** Byte + DataView helpers for BLE (BLE multi-byte fields are little-endian). */

export function toBytes(source: BufferSource): Uint8Array {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source.slice(0));
  }
  return new Uint8Array(
    source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
  );
}

export function viewEquals(view: DataView, expected: Uint8Array): boolean {
  if (view.byteLength !== expected.length) {
    return false;
  }
  for (let i = 0; i < expected.length; i++) {
    if (view.getUint8(i) !== expected[i]) {
      return false;
    }
  }
  return true;
}

export function hex(data: DataView | Uint8Array): string {
  const bytes =
    data instanceof DataView ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function spacedHex(data: DataView | Uint8Array): string {
  const bytes =
    data instanceof DataView ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

export function u32le(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

export function packU32le(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, true);
  return out;
}
