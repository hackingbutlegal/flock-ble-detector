import { describe, expect, it, vi } from "vitest";
import type { DeviceContext } from "#ble/device-info.js";
import type { CheckResult } from "#checks/result.js";
import { buildPayload, createLogger } from "#net/logger.js";

const results: CheckResult[] = [
  {
    id: "F5",
    title: "Log readable",
    verdict: "inconclusive",
    s4ref: "§4.4",
    evidence: "Log characteristic not readable over BLE.",
    limits: "Wired-only.",
  },
];

const input = {
  meta: { generatedAt: "2026-08-13T00:00:00.000Z", deviceName: "PMIC", target: "unit-1" },
  results,
  gattLog: "connect\nread",
};

describe("buildPayload", () => {
  it("wraps sessionId, meta, results, and gattLog", () => {
    const payload = buildPayload("abc", input);
    expect(payload.sessionId).toBe("abc");
    expect(payload.meta).toEqual(input.meta);
    expect(payload.results).toBe(results);
    expect(payload.gattLog).toBe("connect\nread");
  });

  it("omits device when none is supplied", () => {
    expect(buildPayload("abc", input).device).toBeUndefined();
  });

  it("passes through the device context when supplied", () => {
    const device: DeviceContext = {
      name: "PMIC",
      info: { manufacturer: "Hewlett Packard Enterprise" },
      gatt: [{ uuid: "180a", characteristics: [] }],
    };
    const payload = buildPayload("abc", { ...input, device });
    expect(payload.device).toEqual(device);
  });
});

describe("createLogger", () => {
  it("assigns a sessionId and posts a JSON body containing it", () => {
    const post = vi.fn<(body: string) => Promise<void>>(async () => undefined);
    const logger = createLogger(post);
    expect(logger.sessionId).toMatch(/[0-9a-f-]{36}/i);
    logger.snapshot(input);
    expect(post).toHaveBeenCalledTimes(1);
    const body = post.mock.calls[0]![0];
    const parsed = JSON.parse(body) as { sessionId: string };
    expect(parsed.sessionId).toBe(logger.sessionId);
  });

  it("swallows a rejecting post without throwing", () => {
    const post = vi.fn(async () => {
      throw new Error("network down");
    });
    const logger = createLogger(post);
    expect(() => {
      logger.snapshot(input);
    }).not.toThrow();
  });
});
