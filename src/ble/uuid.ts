/** Parse a tester-entered service/characteristic identifier from the config form. */

const SHORT_HEX = /^0x[0-9a-f]{1,8}$/i;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalize a tester-entered UUID field into what the Web Bluetooth GATT APIs expect.
 *
 * Accepts a canonical 128-bit UUID string (returned lowercased) or a bare `0x`-prefixed
 * 16/32-bit short UUID (returned as a number, since Chromium only expands short UUIDs given
 * as numbers — a string like `"0xfe59"` is not a valid Bluetooth UUID and would be rejected
 * as-is). Blank/whitespace-only input returns `undefined` so callers can treat the field as
 * unset. Anything else (not blank, not short-hex, not a canonical UUID) throws a labeled
 * Error rather than surfacing as an unlabeled browser rejection later.
 */
export function parseUuidInput(raw: string): BluetoothServiceUUID | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return undefined;
  }
  if (SHORT_HEX.test(trimmed)) {
    return Number.parseInt(trimmed, 16);
  }
  if (CANONICAL_UUID.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  throw new Error(
    `Invalid UUID "${trimmed}" — expected a 0x-prefixed short form (e.g. 0xfe59) or a ` +
      "canonical 8-4-4-4-12 hex UUID.",
  );
}
