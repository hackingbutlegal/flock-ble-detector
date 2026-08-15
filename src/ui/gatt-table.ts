/** Pure view-model + textContent renderer for the enumerated GATT table with click-to-assign. */

import type { GattTable } from "#ble/gatt-model.js";

/** Config field a discovered service/characteristic UUID can be assigned to. */
export type AssignField =
  | "dfu-service"
  | "control-point"
  | "packet"
  | "buttonless"
  | "vendor-service"
  | "charge-char"
  | "passphrase-char"
  | "log-char";

/** One rendered row: a characteristic, its service, its properties, and its assignment targets. */
export interface GattRowVM {
  readonly serviceUuid: string;
  readonly charUuid: string;
  readonly properties: string;
  readonly assignable: readonly AssignField[];
}

/** Every assignment target is offered on every row; the tester chooses which one fits. */
const ASSIGN_TARGETS: readonly AssignField[] = [
  "dfu-service",
  "control-point",
  "packet",
  "buttonless",
  "vendor-service",
  "charge-char",
  "passphrase-char",
  "log-char",
];

/** Targets that name a service (assigned the service UUID) rather than a characteristic. */
const SERVICE_FIELDS: ReadonlySet<AssignField> = new Set(["dfu-service", "vendor-service"]);

const FIELD_LABELS: Record<AssignField, string> = {
  "dfu-service": "DFU service",
  "control-point": "DFU control point",
  packet: "DFU packet",
  buttonless: "DFU buttonless",
  "vendor-service": "vendor service",
  "charge-char": "charge / privileged",
  "passphrase-char": "passphrase",
  "log-char": "log",
};

/**
 * Flattens an enumerated GATT table into one row per characteristic.
 *
 * Args:
 *   table: Services with their characteristics and property lists.
 *
 * Returns:
 *   A row per characteristic carrying its service UUID, a comma-joined property summary, and the
 *   full set of assignment targets the tester may pick from.
 */
export function toGattRows(table: GattTable): GattRowVM[] {
  const rows: GattRowVM[] = [];
  for (const service of table) {
    for (const characteristic of service.characteristics) {
      rows.push({
        serviceUuid: service.uuid,
        charUuid: characteristic.uuid,
        properties: characteristic.properties.join(", "),
        assignable: ASSIGN_TARGETS,
      });
    }
  }
  return rows;
}

/** The UUID an assignment writes: the service UUID for service targets, else the characteristic. */
function uuidForField(field: AssignField, row: GattRowVM): string {
  return SERVICE_FIELDS.has(field) ? row.serviceUuid : row.charUuid;
}

function appendField(parent: HTMLElement, label: string, value: string): void {
  const line = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  line.appendChild(strong);
  line.appendChild(document.createTextNode(value || "(none)"));
  parent.appendChild(line);
}

function buildRow(row: GattRowVM, assign: (field: string, uuid: string) => void): HTMLElement {
  const card = document.createElement("div");
  card.classList.add("gatt-row");
  appendField(card, "Characteristic", row.charUuid);
  appendField(card, "Service", row.serviceUuid);
  appendField(card, "Properties", row.properties);
  const actions = document.createElement("div");
  actions.classList.add("actions");
  for (const field of row.assignable) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("secondary");
    button.textContent = `Use as ${FIELD_LABELS[field]}`;
    button.addEventListener("click", () => assign(field, uuidForField(field, row)));
    actions.appendChild(button);
  }
  card.appendChild(actions);
  return card;
}

/**
 * Renders the GATT table into `container` with a click-to-assign button per target.
 *
 * XSS-safe by construction: every UUID and property string is set via `textContent`; button
 * classes come from a fixed set. `assign(field, uuid)` is invoked with the config field slug and
 * the UUID to write (service UUID for service targets, else the characteristic UUID).
 */
export function renderGattTable(
  container: HTMLElement,
  table: GattTable,
  assign: (field: string, uuid: string) => void,
): void {
  container.replaceChildren();
  const rows = toGattRows(table);
  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No services enumerated yet — grant the vendor service to see more.";
    container.appendChild(empty);
    return;
  }
  for (const row of rows) {
    container.appendChild(buildRow(row, assign));
  }
}
