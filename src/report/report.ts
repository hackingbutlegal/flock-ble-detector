import type { DeviceContext } from "#ble/device-info.js";
import type { CheckResult } from "#checks/result.js";

/** Report metadata captured at generation time. */
export interface ReportMeta {
  readonly generatedAt: string;
  readonly deviceName?: string;
  readonly target?: string;
  readonly sessionId: string;
  readonly device?: DeviceContext;
}

/** Count check results by verdict. */
export function summarize(results: CheckResult[]): {
  confirmed: number;
  refuted: number;
  inconclusive: number;
} {
  const counts = { confirmed: 0, refuted: 0, inconclusive: 0 };
  for (const r of results) {
    counts[r.verdict] += 1;
  }
  return counts;
}

function deviceSection(device: DeviceContext): string[] {
  const lines = ["## Device", ""];
  if (device.name) {
    lines.push(`- **Name:** ${device.name}`);
  }
  const info = device.info;
  if (info?.manufacturer) {
    lines.push(`- **Manufacturer:** ${info.manufacturer}`);
  }
  if (info?.model) {
    lines.push(`- **Model:** ${info.model}`);
  }
  if (info?.firmware) {
    lines.push(`- **Firmware:** ${info.firmware}`);
  }
  const flock = device.flock;
  if (flock) {
    const tail = flock.signals.length > 0 ? ` (${flock.signals.join(", ")})` : "";
    lines.push(`- **Flock assessment:** ${flock.confidence}${tail}`);
    if (flock.serial) {
      lines.push(`- **Serial:** ${flock.serial}`);
    }
    if (flock.companyIds.length > 0) {
      const ids = flock.companyIds.map((c) => `0x${c.toString(16).padStart(4, "0")}`).join(", ");
      lines.push(`- **Advertised company ids:** ${ids}`);
    }
  }
  const raven = device.raven;
  if (raven && raven.length > 0) {
    lines.push("", "### Raven telemetry (read-only)");
    for (const reading of raven) {
      lines.push(`- **${reading.name}:** ${reading.value}`);
    }
  }
  lines.push("");
  return lines;
}

function metaLines(meta: ReportMeta): string[] {
  const lines = [`- **Generated:** ${meta.generatedAt}`, `- **Session:** ${meta.sessionId}`];
  if (meta.deviceName) {
    lines.push(`- **Device:** ${meta.deviceName}`);
  }
  if (meta.target) {
    lines.push(`- **Target:** ${meta.target}`);
  }
  lines.push("");
  return lines;
}

/**
 * Render results as Markdown that slots under the report's "§4 Open verification items".
 *
 * Prepends a metadata header (when `meta` is supplied) and a verdict summary line, and renders
 * captured raw frames under each finding.
 */
export function toMarkdown(results: CheckResult[], meta?: ReportMeta): string {
  const lines = ["# On-device verification results", ""];
  if (meta) {
    lines.push(...metaLines(meta));
  }
  const s = summarize(results);
  lines.push(
    `**Summary:** ${s.confirmed} confirmed, ${s.refuted} refuted, ${s.inconclusive} inconclusive.`,
    "",
  );
  if (meta?.device) {
    lines.push(...deviceSection(meta.device));
  }
  for (const r of results) {
    lines.push(
      `## ${r.id} — ${r.title} (${r.s4ref})`,
      "",
      `- **Verdict:** ${r.verdict}`,
      `- **Evidence:** ${r.evidence}`,
      `- **Limits:** ${r.limits}`,
    );
    if (r.raw && r.raw.length > 0) {
      lines.push("- **Raw frames:**");
      for (const f of r.raw) {
        lines.push(`  - ${f.label}: \`${f.hex}\``);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Serialize `{ meta, results }` as pretty-printed JSON. */
export function toJson(results: CheckResult[], meta?: ReportMeta): string {
  return JSON.stringify({ meta, results }, null, 2);
}
