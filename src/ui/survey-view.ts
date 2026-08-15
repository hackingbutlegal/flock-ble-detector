/** Pure view-model + textContent renderer for the device-survey scored table. */

import type { AdvObservation, FlockConfidence, ScoredDevice } from "#ble/survey.js";
import { scoreProfile } from "#ble/survey.js";

/** One rendered survey row: a scored, display-formatted device observation. */
export interface SurveyRow {
  readonly id: string;
  readonly name: string;
  readonly rssi: string;
  readonly confidence: FlockConfidence;
  readonly serial?: string;
  readonly signals: readonly string[];
  readonly likelyTarget: boolean;
}

const CONFIDENCE_LABEL: Record<FlockConfidence, string> = {
  confirmed: "Confirmed Flock",
  likely: "Likely (DFU-capable)",
  none: "—",
};

/** Sorts scored devices by score (desc) then RSSI (desc); missing RSSI sorts last. */
function byScoreThenRssi(a: ScoredDevice, b: ScoredDevice): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  const ar = a.rssi ?? Number.NEGATIVE_INFINITY;
  const br = b.rssi ?? Number.NEGATIVE_INFINITY;
  return br - ar;
}

/**
 * Scores every observed device and projects it to a display row.
 *
 * Rows are ordered by `(score desc, rssi desc)` so highlighted, closest units rank first;
 * a missing RSSI sorts last. Unnamed devices render as `"(unnamed)"` and a missing RSSI as `"—"`.
 *
 * Args:
 *   devices: The accumulated observations keyed by device id.
 *
 * Returns:
 *   Display rows, most likely and closest target first.
 */
export function toSurveyRows(devices: ReadonlyMap<string, AdvObservation>): SurveyRow[] {
  const scored = [...devices.values()].map(scoreProfile).toSorted(byScoreThenRssi);
  return scored.map((d) => ({
    id: d.id,
    name: d.name ?? "(unnamed)",
    rssi: d.rssi === undefined ? "—" : `${d.rssi} dBm`,
    confidence: d.confidence,
    ...(d.serial !== undefined ? { serial: d.serial } : {}),
    signals: d.signals,
    likelyTarget: d.likelyTarget,
  }));
}

function appendField(parent: HTMLElement, label: string, value: string): void {
  const line = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  line.appendChild(strong);
  line.appendChild(document.createTextNode(value));
  parent.appendChild(line);
}

function appendSignals(parent: HTMLElement, signals: readonly string[]): void {
  if (signals.length === 0) {
    return;
  }
  const badges = document.createElement("div");
  badges.classList.add("signals");
  for (const signal of signals) {
    const badge = document.createElement("span");
    badge.classList.add("badge");
    badge.textContent = signal;
    badges.appendChild(badge);
  }
  parent.appendChild(badges);
}

function buildRow(row: SurveyRow): HTMLElement {
  const card = document.createElement("div");
  card.classList.add("survey-row");
  if (row.likelyTarget) {
    card.classList.add("likely-target");
  }
  if (row.confidence === "confirmed") {
    card.classList.add("confirmed-target");
  }
  appendField(card, "Name", row.name);
  if (row.confidence !== "none") {
    appendField(card, "Confidence", CONFIDENCE_LABEL[row.confidence]);
  }
  if (row.serial !== undefined) {
    appendField(card, "Serial", row.serial);
  }
  appendField(card, "Signal", row.rssi);
  appendSignals(card, row.signals);
  return card;
}

function buildHeader(rows: readonly SurveyRow[]): HTMLElement {
  const likely = rows.filter((r) => r.likelyTarget).length;
  const header = document.createElement("p");
  header.classList.add("survey-count");
  const count = rows.length;
  header.textContent = `${count} device${count === 1 ? "" : "s"} · ${likely} likely target${likely === 1 ? "" : "s"}`;
  return header;
}

/**
 * Renders the scored survey table into `container`, most likely target first.
 *
 * XSS-safe by construction: every device field is set via `textContent` and CSS classes come from
 * a fixed set — no `innerHTML`. Likely targets carry the `likely-target` class; a header line
 * reports the total device count and how many are likely targets.
 *
 * Args:
 *   container: The element to render into; its contents are replaced.
 *   devices: The accumulated observations keyed by device id.
 */
export function renderSurvey(
  container: HTMLElement,
  devices: ReadonlyMap<string, AdvObservation>,
): void {
  container.replaceChildren();
  const rows = toSurveyRows(devices);
  container.appendChild(buildHeader(rows));
  for (const row of rows) {
    container.appendChild(buildRow(row));
  }
}
