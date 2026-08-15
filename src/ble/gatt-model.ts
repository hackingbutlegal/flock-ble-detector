/** Pure model types and mappers for an enumerated GATT table. */

import type { GattServer } from "./types.js";

export type GattProperty = "read" | "write" | "writeWithoutResponse" | "notify" | "indicate";

export interface GattCharModel {
  readonly uuid: string;
  readonly properties: readonly GattProperty[];
}

export interface GattServiceModel {
  readonly uuid: string;
  readonly characteristics: readonly GattCharModel[];
}

export type GattTable = readonly GattServiceModel[];

interface PropsShape {
  readonly read?: boolean;
  readonly write?: boolean;
  readonly writeWithoutResponse?: boolean;
  readonly notify?: boolean;
  readonly indicate?: boolean;
}

/** Maps a characteristic's property flags to the list of property names that are set. */
export function charProperties(p?: PropsShape): GattProperty[] {
  const out: GattProperty[] = [];
  if (!p) {
    return out;
  }
  if (p.read) {
    out.push("read");
  }
  if (p.write) {
    out.push("write");
  }
  if (p.writeWithoutResponse) {
    out.push("writeWithoutResponse");
  }
  if (p.notify) {
    out.push("notify");
  }
  if (p.indicate) {
    out.push("indicate");
  }
  return out;
}

/**
 * Enumerates every granted primary service into a pure GATT table.
 *
 * Args:
 *   server: A connected GATT server (real or mock).
 *
 * Returns:
 *   Services with their characteristics and property lists, uuids lowercased.
 */
export async function enumerate(server: GattServer): Promise<GattTable> {
  const services = await server.getPrimaryServices();
  const table: GattServiceModel[] = [];
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    table.push({
      uuid: (svc.uuid ?? "").toLowerCase(),
      characteristics: chars.map((c) => ({
        uuid: c.uuid.toLowerCase(),
        properties: charProperties(c.properties),
      })),
    });
  }
  return table;
}
