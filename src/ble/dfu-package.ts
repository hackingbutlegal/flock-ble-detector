/** Load a tester-supplied Nordic DFU package (application-only) from its unzipped parts. */

export interface DfuImage {
  readonly initPacket: Uint8Array;
  readonly firmware: Uint8Array;
  readonly label: string;
}

interface ManifestFiles {
  readonly datFile: string;
  readonly binFile: string;
}

export function parseManifest(json: string): ManifestFiles {
  const parsed = JSON.parse(json) as {
    manifest?: { application?: { dat_file?: string; bin_file?: string } };
  };
  const app = parsed.manifest?.application;
  if (!app?.dat_file || !app.bin_file) {
    throw new Error(
      "manifest.json has no 'application' entry (PoC supports application updates only)",
    );
  }
  return { datFile: app.dat_file, binFile: app.bin_file };
}

/**
 * Heuristic label only (report display): a Nordic dfu-cc Packet with top-level
 * field 1 (`command`) is unsigned; field 2 (`signed_command`) is signed.
 */
export function isSignedInitPacket(initPacket: Uint8Array): boolean {
  const tag = initPacket[0];
  return tag === 0x12; // field 2, wire type 2 (LEN)
}
