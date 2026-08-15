import { spacedHex } from "#ble/bytes.js";
import { crc32 } from "#ble/crc32.js";
import {
  buildChecksum,
  buildCreate,
  buildExecute,
  buildSelect,
  classifyCommandExecute,
  parseResponse,
} from "#ble/dfu-codec.js";
import type { DfuImage } from "#ble/dfu-package.js";
import { OBJ } from "#ble/nordic-constants.js";
import type { GattCharacteristic } from "#ble/types.js";
import type { CheckResult, RawFrame } from "./result.js";

type Classification = ReturnType<typeof classifyCommandExecute>;

const BASE = {
  id: "F2",
  title: "DFU image signature enforcement",
  s4ref: "§4.1",
} as const;

/** Map the command-object Execute classification to a CheckResult (pure; unit-tested). */
export function interpretF2(c: Classification, pkg: { signed: boolean }): CheckResult {
  const signedNote = pkg.signed
    ? " Package was signed with an attacker-generated (wrong key) — the tool-supported F2 lever."
    : " Package used an unsigned init packet.";
  const limits =
    "INVALID_OBJECT alone is ambiguous (bad signature vs malformed protobuf); confirm the " +
    ".dat decodes. Ensure SD/HW/FW-version metadata is correct so rejection is " +
    "attributable to the signature step." +
    signedNote;
  switch (c) {
    case "unsigned-accepted":
      return {
        ...BASE,
        verdict: "confirmed",
        limits,
        evidence:
          "Execute of the command object returned SUCCESS (0x60 04 01): the bootloader " +
          "does not enforce image signatures (CRC-only). CH-1/F2 Critical branch.",
      };
    case "signed-enforced":
      return {
        ...BASE,
        verdict: "refuted",
        limits,
        evidence:
          "Execute of the command object was rejected on signature grounds " +
          "(SIGNATURE_MISSING / WRONG_SIGNATURE_TYPE / INVALID_OBJECT): a signed " +
          "bootloader re-validates. Chain drops to forced-DFU DoS (§3 Medium branch).",
      };
    case "pre-signature-failure":
      return {
        ...BASE,
        verdict: "inconclusive",
        limits,
        evidence:
          "Rejected on metadata (SD/HW/FW version) BEFORE the signature check — fix " +
          "--sd-req/--hw-version/--application-version and retry.",
      };
    default:
      return {
        ...BASE,
        verdict: "inconclusive",
        limits,
        evidence: "Unrecognized Execute response; see the captured control-point frames.",
      };
  }
}

/**
 * Type-only cast: the dfu-codec `build*()` helpers and `DfuImage`'s byte fields are typed as bare
 * `Uint8Array` (which defaults to `Uint8Array<ArrayBufferLike>`, including SharedArrayBuffer), but
 * `writeValue*()` requires the narrower `Uint8Array<ArrayBuffer>` (same TS-strict gap documented in
 * charge.ts / the Task 13 report). Runtime bytes are unaffected either way.
 */
function asWritable(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes as unknown as Uint8Array<ArrayBuffer>;
}

async function writePacketChunks(
  packet: GattCharacteristic,
  data: Uint8Array,
  chunk = 20,
): Promise<void> {
  for (let i = 0; i < data.length; i += chunk) {
    await packet.writeValueWithoutResponse(asWritable(data.subarray(i, i + chunk)));
  }
}

export interface F2Options {
  readonly signedPackage: boolean;
  /**
   * Interlock #3: only transfer the benign data object after an unsigned-accepted result
   * AND explicit opt-in.
   */
  readonly commitBenignImage: boolean;
  /** Await the next Control Point notification (wired by the UI to characteristicvaluechanged). */
  readonly nextNotification: () => Promise<DataView>;
}

/**
 * Transfer the command (init) object only, read the Execute response, classify (F2), and —
 * only if the device accepted an unsigned image AND the tester opted in — transfer the
 * benign data object. Abort-safe.
 */
export async function runF2(
  controlPoint: GattCharacteristic,
  packet: GattCharacteristic,
  image: DfuImage,
  opts: F2Options,
): Promise<CheckResult> {
  const raw: RawFrame[] = [];
  await controlPoint.writeValueWithResponse(asWritable(buildSelect(OBJ.COMMAND)));
  raw.push({ label: "Select response", hex: spacedHex(await opts.nextNotification()) });
  await controlPoint.writeValueWithResponse(
    asWritable(buildCreate(OBJ.COMMAND, image.initPacket.length)),
  );
  await opts.nextNotification();
  await writePacketChunks(packet, image.initPacket);
  await controlPoint.writeValueWithResponse(asWritable(buildChecksum()));
  const checksumView = await opts.nextNotification();
  raw.push({ label: "Checksum response", hex: spacedHex(checksumView) });
  const checksum = parseResponse(checksumView);
  if (checksum.crc32 !== undefined && checksum.crc32 !== crc32(image.initPacket)) {
    return {
      ...BASE,
      verdict: "inconclusive",
      limits: "Transport CRC mismatch on init packet.",
      evidence: "Init packet CRC32 did not match; retry transfer.",
      raw,
    };
  }
  await controlPoint.writeValueWithResponse(asWritable(buildExecute()));
  const executeView = await opts.nextNotification();
  raw.push({ label: "Execute response", hex: spacedHex(executeView) });
  const classification = classifyCommandExecute(parseResponse(executeView));
  const result = { ...interpretF2(classification, { signed: opts.signedPackage }), raw };

  if (classification === "unsigned-accepted" && opts.commitBenignImage) {
    await transferDataObject(controlPoint, packet, image.firmware, opts);
  }
  return result;
}

async function transferDataObject(
  controlPoint: GattCharacteristic,
  packet: GattCharacteristic,
  firmware: Uint8Array,
  opts: F2Options,
): Promise<void> {
  await controlPoint.writeValueWithResponse(asWritable(buildSelect(OBJ.DATA)));
  const sel = parseResponse(await opts.nextNotification());
  const maxSize = sel.maxSize ?? 4096;
  for (let off = 0; off < firmware.length; off += maxSize) {
    const chunk = firmware.subarray(off, off + maxSize);
    await controlPoint.writeValueWithResponse(asWritable(buildCreate(OBJ.DATA, chunk.length)));
    await opts.nextNotification();
    await writePacketChunks(packet, chunk);
    await controlPoint.writeValueWithResponse(asWritable(buildChecksum()));
    await opts.nextNotification();
    await controlPoint.writeValueWithResponse(asWritable(buildExecute()));
    await opts.nextNotification();
  }
}
