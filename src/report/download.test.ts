import { describe, expect, it } from "vitest";
import type { ReportMeta } from "./report.js";
import { reportFilename } from "./download.js";

const meta: ReportMeta = {
  generatedAt: "2026-08-13T12:00:00.000Z",
  sessionId: "abcdef12-3456-7890-abcd-ef1234567890",
};

describe("reportFilename", () => {
  it("builds pmic-verify-<sessionId8>-<date>.<ext>", () => {
    expect(reportFilename(meta, "md")).toBe("pmic-verify-abcdef12-2026-08-13.md");
    expect(reportFilename(meta, "json")).toBe("pmic-verify-abcdef12-2026-08-13.json");
  });

  it("falls back to a stable name when meta is undefined", () => {
    expect(reportFilename(undefined, "md")).toBe("pmic-verify-session-unknown.md");
  });
});
