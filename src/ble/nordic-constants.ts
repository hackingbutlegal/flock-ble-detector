/** Nordic DFU protocol constants (stock nRF5-SDK Secure DFU). Verify against target responses. */

export const DFU = {
  SERVICE: 0xfe59,
  CONTROL_POINT: "8ec90001-f315-4f60-9fb8-838830daea50",
  PACKET: "8ec90002-f315-4f60-9fb8-838830daea50",
  BUTTONLESS_UNBONDED: "8ec90003-f315-4f60-9fb8-838830daea50",
  BUTTONLESS_BONDED: "8ec90004-f315-4f60-9fb8-838830daea50",
} as const;

export const LEGACY = {
  SERVICE: "00001530-1212-efde-1523-785feabcd123",
  CONTROL_POINT: "00001531-1212-efde-1523-785feabcd123",
  PACKET: "00001532-1212-efde-1523-785feabcd123",
} as const;

export const OP = {
  CREATE: 0x01,
  SET_PRN: 0x02,
  CHECKSUM: 0x03,
  EXECUTE: 0x04,
  SELECT: 0x06,
  RESPONSE: 0x60,
} as const;

export const OBJ = { COMMAND: 0x01, DATA: 0x02 } as const;

export const RESULT = {
  SUCCESS: 0x01,
  OP_NOT_SUPPORTED: 0x02,
  INVALID_PARAM: 0x03,
  INSUFFICIENT_RESOURCES: 0x04,
  INVALID_OBJECT: 0x05,
  UNSUPPORTED_TYPE: 0x07,
  OP_NOT_PERMITTED: 0x08,
  OPERATION_FAILED: 0x0a,
  EXT_ERROR: 0x0b,
} as const;

export const EXT = {
  FW_VERSION_FAILURE: 0x05,
  HW_VERSION_FAILURE: 0x06,
  SD_VERSION_FAILURE: 0x07,
  SIGNATURE_MISSING: 0x08,
  WRONG_SIGNATURE_TYPE: 0x0b,
  VERIFICATION_FAILED: 0x0c,
} as const;

export const BUTTONLESS = {
  ENTER: 0x01,
  RESP: 0x20,
  R_SUCCESS: 0x01,
  R_NOT_BONDED: 0x07,
} as const;
