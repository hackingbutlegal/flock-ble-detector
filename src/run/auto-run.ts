import type { DiscoveredMap } from "#ble/connection.js";
import type { CheckContext } from "#checks/execute.js";
import { executeCh1, executeF1, executeF2, executeF4, executeF5 } from "#checks/execute.js";
import type { CheckResult } from "#checks/result.js";

/** Callbacks + discovery the auto-runner needs; DOM-free so it stays unit-testable. */
export interface AutoRunDeps {
  readonly discovered: DiscoveredMap;
  readonly onResult: (r: CheckResult) => void;
  readonly onLog: (line: string) => void;
}

/**
 * Run every check in order F1 → CH-1 → F4 → F5 → F2 via the shared `execute*()` functions.
 *
 * All five checks run: access to the tool is controlled at the edge (authorized testers only), so
 * no per-run authorization gate is imposed. Device-write safety interlocks remain in force — CH-1
 * is forced `sendButtonless:false` so the device-rebooting ENTER write is never sent, and F2 is
 * forced `commit:false` so it never flashes. Each `execute*()` never throws, so the sequence always
 * completes and every result flows through `onResult`.
 *
 * @param ctx DOM-free check context (server, config, prompt, optional F2 image).
 * @param deps Discovery and the result/log callbacks.
 */
export async function runAll(ctx: CheckContext, deps: AutoRunDeps): Promise<void> {
  deps.onLog("Auto-run started: F1 → CH-1 → F4 → F5 → F2 (safe set — never reboots or flashes).");
  deps.onResult(await executeF1(ctx));
  deps.onResult(await executeCh1(ctx, deps.discovered, { sendButtonless: false }));
  deps.onResult(await executeF4(ctx));
  deps.onResult(await executeF5(ctx));
  deps.onResult(await executeF2(ctx, { commit: false }));
  deps.onLog("Auto-run finished.");
}
