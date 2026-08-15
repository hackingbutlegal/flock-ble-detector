import type { AdvObservation, RawAdvertisement } from "#ble/survey.js";
import { mergeAdvertisement, toObservation } from "#ble/survey.js";

/** A pluggable scan source: `start` begins scanning and returns a handle to stop it. */
export interface Scanner {
  start(onAdvertisement: (obs: AdvObservation) => void): Promise<{ stop(): void }>;
}

/** Bound on how long a survey scans before auto-stopping, to limit battery and privacy exposure. */
export const SURVEY_TIMEOUT_MS = 20_000;

/** Callbacks and injectable scanner the survey orchestration needs; DOM-free for testability. */
export interface SurveyDeps {
  readonly onUpdate: (devices: ReadonlyMap<string, AdvObservation>) => void;
  readonly onStopped: () => void;
  readonly scanner?: Scanner;
  readonly timeoutMs?: number;
}

/** A live survey; `stop()` ends the scan and is safe to call more than once. */
export interface SurveyHandle {
  stop(): void;
}

/**
 * Starts a passive advertisement survey over an injectable scanner.
 *
 * Each advertisement is folded into a running map via `mergeAdvertisement` and pushed through
 * `onUpdate`. The scan auto-stops after `timeoutMs` (default `SURVEY_TIMEOUT_MS`); `stop()` ends
 * the scan, clears the timer, and calls `onStopped` exactly once (idempotent).
 *
 * Args:
 *   deps: Update/stopped callbacks, an optional scanner (defaults to `realScanner()`), and an
 *     optional timeout override.
 *
 * Returns:
 *   A handle whose `stop()` tears down the scan.
 */
export async function startSurvey(deps: SurveyDeps): Promise<SurveyHandle> {
  const scanner = deps.scanner ?? realScanner();
  const timeoutMs = deps.timeoutMs ?? SURVEY_TIMEOUT_MS;
  let acc: ReadonlyMap<string, AdvObservation> = new Map();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const running = await scanner.start((obs) => {
    acc = mergeAdvertisement(acc, obs);
    deps.onUpdate(acc);
  });

  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    running.stop();
    deps.onStopped();
  };

  timer = setTimeout(stop, timeoutMs);
  return { stop };
}

/** An `advertisementreceived` event, narrowed to the fields the survey reads. */
interface AdvertisementEvent {
  readonly device: { readonly id: string; readonly name?: string };
  readonly rssi?: number;
  readonly uuids?: readonly string[];
  readonly manufacturerData?: ReadonlyMap<number, DataView>;
}

/** The experimental Scanning surface of `navigator.bluetooth`, declared locally to avoid `any`. */
interface ScanningBluetooth {
  requestLEScan(options: {
    acceptAllAdvertisements: boolean;
    keepRepeatedDevices: boolean;
  }): Promise<{ stop(): void }>;
  addEventListener(
    type: "advertisementreceived",
    listener: (event: AdvertisementEvent) => void,
  ): void;
  removeEventListener(
    type: "advertisementreceived",
    listener: (event: AdvertisementEvent) => void,
  ): void;
}

function eventToRaw(event: AdvertisementEvent): RawAdvertisement {
  return {
    id: event.device.id,
    ...(event.device.name !== undefined ? { name: event.device.name } : {}),
    ...(event.rssi !== undefined ? { rssi: event.rssi } : {}),
    ...(event.uuids !== undefined ? { uuids: event.uuids } : {}),
    ...(event.manufacturerData !== undefined ? { manufacturerData: event.manufacturerData } : {}),
  };
}

/**
 * Builds the production scanner backed by `navigator.bluetooth.requestLEScan`.
 *
 * Returns:
 *   A `Scanner` that listens for `advertisementreceived`, maps each event through
 *   `toObservation`, and whose `stop()` removes the listener and stops the scan.
 */
export function realScanner(): Scanner {
  return {
    async start(onAdvertisement) {
      const bluetooth = navigator.bluetooth as unknown as ScanningBluetooth;
      const listener = (event: AdvertisementEvent): void => {
        onAdvertisement(toObservation(eventToRaw(event)));
      };
      bluetooth.addEventListener("advertisementreceived", listener);
      const scan = await bluetooth.requestLEScan({
        acceptAllAdvertisements: true,
        keepRepeatedDevices: true,
      });
      return {
        stop() {
          bluetooth.removeEventListener("advertisementreceived", listener);
          scan.stop();
        },
      };
    },
  };
}
