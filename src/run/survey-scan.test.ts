import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdvObservation, RawAdvertisement } from "#ble/survey.js";
import { NORDIC_DFU_UUID, toObservation } from "#ble/survey.js";
import type { Scanner } from "./survey-scan.js";
import { startSurvey, SURVEY_TIMEOUT_MS } from "./survey-scan.js";

/** In-memory scanner: captures the observation callback and lets a test emit raw advertisements. */
class FakeScanner implements Scanner {
  stopped = false;
  private cb: ((obs: AdvObservation) => void) | undefined;

  async start(onAdvertisement: (obs: AdvObservation) => void): Promise<{ stop(): void }> {
    this.cb = onAdvertisement;
    return {
      stop: () => {
        this.stopped = true;
      },
    };
  }

  emit(raw: RawAdvertisement): void {
    this.cb?.(toObservation(raw));
  }
}

describe("startSurvey", () => {
  it("merges advertisements for the same id into a single entry via onUpdate", async () => {
    const scanner = new FakeScanner();
    const updates: ReadonlyMap<string, AdvObservation>[] = [];
    const handle = await startSurvey({
      scanner,
      onUpdate: (m) => updates.push(m),
      onStopped: () => {},
    });

    scanner.emit({ id: "d1", rssi: -70, uuids: [NORDIC_DFU_UUID] });
    scanner.emit({ id: "d1", rssi: -55, name: "PMIC" });

    const last = updates.at(-1)!;
    expect(last.size).toBe(1);
    expect(last.get("d1")?.rssi).toBe(-55);
    expect(last.get("d1")?.name).toBe("PMIC");
    handle.stop();
  });

  it("stop() stops the underlying scan and fires onStopped exactly once", async () => {
    const scanner = new FakeScanner();
    let stoppedCount = 0;
    const handle = await startSurvey({
      scanner,
      onUpdate: () => {},
      onStopped: () => {
        stoppedCount += 1;
      },
    });

    handle.stop();
    expect(scanner.stopped).toBe(true);
    expect(stoppedCount).toBe(1);

    handle.stop();
    expect(stoppedCount).toBe(1);
  });

  describe("timeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("auto-stops after the timeout, firing onStopped once", async () => {
      const scanner = new FakeScanner();
      let stoppedCount = 0;
      await startSurvey({
        scanner,
        onUpdate: () => {},
        onStopped: () => {
          stoppedCount += 1;
        },
      });

      vi.advanceTimersByTime(SURVEY_TIMEOUT_MS);
      expect(scanner.stopped).toBe(true);
      expect(stoppedCount).toBe(1);
    });
  });
});
