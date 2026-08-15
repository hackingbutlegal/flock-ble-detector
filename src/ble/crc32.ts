/** Standard IEEE/zlib CRC-32 (poly 0xEDB88320). Transport integrity only — NOT authentication. */

const TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

/**
 * Compute CRC-32 over `data`, optionally continuing from a previous result.
 * @param data bytes to accumulate
 * @param seed previous crc32() return value to continue from (default: fresh start)
 */
export function crc32(data: Uint8Array, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) {
    crc = ((TABLE[(crc ^ (data[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
