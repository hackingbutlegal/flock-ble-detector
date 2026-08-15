import type { CheckResult, Verdict } from "#checks/result.js";
import { summarize } from "#report/report.js";

/** View model for a single result card, derived from a `CheckResult`. */
export interface ResultCardVM {
  readonly id: string;
  readonly title: string;
  readonly verdict: Verdict;
  readonly badgeClass: "confirmed" | "refuted" | "inconclusive";
  readonly s4ref: string;
  readonly evidence: string;
  readonly limits: string;
  readonly rawLines: readonly string[];
}

/**
 * Map check results to view models for rendering.
 *
 * `badgeClass` mirrors the verdict (the CSS hook in index.html); `rawLines` flattens each captured
 * frame to a `"<label>: <hex>"` string, or an empty array when no frames were captured.
 */
export function toResultCards(results: CheckResult[]): ResultCardVM[] {
  return results.map((r) => ({
    id: r.id,
    title: r.title,
    verdict: r.verdict,
    badgeClass: r.verdict,
    s4ref: r.s4ref,
    evidence: r.evidence,
    limits: r.limits,
    rawLines: r.raw?.map((f) => `${f.label}: ${f.hex}`) ?? [],
  }));
}

function appendField(card: HTMLElement, label: string, value: string): void {
  const row = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  row.appendChild(strong);
  row.appendChild(document.createTextNode(value));
  card.appendChild(row);
}

function appendRawFrames(card: HTMLElement, rawLines: readonly string[]): void {
  if (rawLines.length === 0) {
    return;
  }
  const heading = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = "Raw frames:";
  heading.appendChild(strong);
  card.appendChild(heading);
  const list = document.createElement("ul");
  for (const line of rawLines) {
    const item = document.createElement("li");
    item.textContent = line;
    list.appendChild(item);
  }
  card.appendChild(list);
}

function buildCard(vm: ResultCardVM): HTMLElement {
  const card = document.createElement("article");
  card.classList.add("result-card");
  const header = document.createElement("h3");
  header.textContent = `${vm.id} — ${vm.title} (${vm.s4ref})`;
  card.appendChild(header);
  const badge = document.createElement("span");
  badge.classList.add("badge", vm.badgeClass);
  badge.textContent = vm.verdict;
  card.appendChild(badge);
  appendField(card, "Evidence", vm.evidence);
  appendField(card, "Limits", vm.limits);
  appendRawFrames(card, vm.rawLines);
  return card;
}

function buildSummaryStrip(results: CheckResult[]): HTMLElement {
  const s = summarize(results);
  const strip = document.createElement("div");
  strip.classList.add("summary-strip");
  strip.textContent = `${s.confirmed} confirmed · ${s.refuted} refuted · ${s.inconclusive} inconclusive`;
  return strip;
}

/**
 * Render result cards and a summary strip into `container`.
 *
 * XSS-safe by construction: every value is set via `textContent` and CSS classes come from the
 * fixed `badgeClass` union — no `innerHTML`.
 */
export function renderResults(container: HTMLElement, results: CheckResult[]): void {
  container.replaceChildren();
  container.appendChild(buildSummaryStrip(results));
  for (const vm of toResultCards(results)) {
    container.appendChild(buildCard(vm));
  }
}
