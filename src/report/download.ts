import type { ReportMeta } from "#report/report.js";

/**
 * Build a stable download filename of the form `pmic-verify-<sessionId8>-<date>.<ext>`.
 *
 * The date is derived from `meta.generatedAt` (ISO string) so the function stays pure and
 * deterministic. Falls back to a fixed name when `meta` is absent.
 */
export function reportFilename(meta: ReportMeta | undefined, ext: "md" | "json"): string {
  const sessionId8 = meta?.sessionId.slice(0, 8) ?? "session";
  const date = meta?.generatedAt.slice(0, 10) ?? "unknown";
  return `pmic-verify-${sessionId8}-${date}.${ext}`;
}

/**
 * Trigger a browser download of `text` as `filename`.
 *
 * Browser-only: creates a Blob, an object URL and a transient anchor click. Not unit-tested.
 */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
