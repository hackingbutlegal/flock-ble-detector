import { packU32le, u32le } from "./bytes.js";
import { EXT, OP, RESULT } from "./nordic-constants.js";

export interface DfuResponse {
  readonly requestOp: number;
  readonly result: number;
  readonly extError?: number;
  readonly maxSize?: number;
  readonly offset?: number;
  readonly crc32?: number;
}

export function buildSelect(objType: number): Uint8Array {
  return Uint8Array.of(OP.SELECT, objType);
}

export function buildCreate(objType: number, size: number): Uint8Array {
  return Uint8Array.of(OP.CREATE, objType, ...packU32le(size));
}

export function buildChecksum(): Uint8Array {
  return Uint8Array.of(OP.CHECKSUM);
}

export function buildExecute(): Uint8Array {
  return Uint8Array.of(OP.EXECUTE);
}

export function buildSetPrn(n: number): Uint8Array {
  const out = new Uint8Array(3);
  out[0] = OP.SET_PRN;
  new DataView(out.buffer).setUint16(1, n, true);
  return out;
}

/** Parse a DFU Control Point notification. Frames start `0x60 <reqOp> <result>`; payload at byte 3. */
export function parseResponse(view: DataView): DfuResponse {
  if (view.byteLength < 3 || view.getUint8(0) !== OP.RESPONSE) {
    throw new Error("bad DFU response marker (expected 0x60)");
  }
  const requestOp = view.getUint8(1);
  const result = view.getUint8(2);
  if (result === RESULT.SUCCESS && view.byteLength >= 15 && requestOp === 0x06) {
    return {
      requestOp,
      result,
      maxSize: u32le(view, 3),
      offset: u32le(view, 7),
      crc32: u32le(view, 11),
    };
  }
  if (result === RESULT.SUCCESS && view.byteLength >= 11 && requestOp === 0x03) {
    return { requestOp, result, offset: u32le(view, 3), crc32: u32le(view, 7) };
  }
  if (result === RESULT.EXT_ERROR && view.byteLength >= 4) {
    return { requestOp, result, extError: view.getUint8(3) };
  }
  return { requestOp, result };
}

const PRE_SIGNATURE_EXT: ReadonlySet<number> = new Set([
  EXT.FW_VERSION_FAILURE,
  EXT.HW_VERSION_FAILURE,
  EXT.SD_VERSION_FAILURE,
]);

/**
 * Classify the response to Execute of the COMMAND (init) object — the F2 lever.
 * SUCCESS on an unsigned application init packet => bootloader does not enforce signing.
 */
export function classifyCommandExecute(
  resp: DfuResponse,
): "signed-enforced" | "unsigned-accepted" | "malformed" | "pre-signature-failure" | "unknown" {
  if (resp.result === RESULT.SUCCESS) {
    return "unsigned-accepted";
  }
  if (resp.result === RESULT.EXT_ERROR) {
    if (resp.extError === EXT.SIGNATURE_MISSING || resp.extError === EXT.WRONG_SIGNATURE_TYPE) {
      return "signed-enforced";
    }
    if (resp.extError !== undefined && PRE_SIGNATURE_EXT.has(resp.extError)) {
      return "pre-signature-failure";
    }
    // Other ext codes (e.g. VERIFICATION_FAILED 0x0c, the data-object image-hash mismatch
    // code, not a command-object signature code) are intentionally inconclusive here — never
    // map an unrecognized code to signed-enforced, which would risk a false "secure".
    return "unknown";
  }
  if (resp.result === RESULT.INVALID_OBJECT) {
    return "signed-enforced";
  }
  return "unknown";
}
