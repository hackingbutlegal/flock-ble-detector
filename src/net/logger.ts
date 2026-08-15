import type { DeviceContext } from "#ble/device-info.js";
import type { CheckResult } from "#checks/result.js";

/** Metadata captured alongside a logged snapshot. */
export interface LogMeta {
  readonly generatedAt: string;
  readonly deviceName?: string;
  readonly target?: string;
}

/** Inputs for a single snapshot: current metadata, results, and GATT log mirror. */
export interface LogInput {
  readonly meta: LogMeta;
  readonly results: CheckResult[];
  readonly gattLog: string;
  readonly device?: DeviceContext;
}

/** Full body POSTed to the backend log endpoint. */
export interface LogPayload {
  readonly sessionId: string;
  readonly meta: LogMeta;
  readonly results: readonly CheckResult[];
  readonly gattLog: string;
  readonly device?: DeviceContext;
}

/** A logger that mirrors verification state to the backend. */
export interface Logger {
  readonly sessionId: string;
  snapshot(input: LogInput): void;
  flush(): void;
}

const LOG_ENDPOINT = "/api/log";

/** Wrap the current session state into a serializable payload. */
export function buildPayload(sessionId: string, input: LogInput): LogPayload {
  const payload: LogPayload = {
    sessionId,
    meta: input.meta,
    results: input.results,
    gattLog: input.gattLog,
  };
  if (input.device !== undefined) {
    return { ...payload, device: input.device };
  }
  return payload;
}

async function defaultPost(body: string): Promise<void> {
  await fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

/**
 * Create a logger that POSTs a full snapshot on each `snapshot` call and beacons the last body on
 * `flush`.
 *
 * Failures are swallowed so logging never disrupts verification. The most recent serialized body is
 * retained and re-sent by `flush`.
 *
 * @param post Optional transport override (defaults to `fetch` against `/api/log`).
 */
export function createLogger(post: (body: string) => Promise<void> = defaultPost): Logger {
  const sessionId = crypto.randomUUID();
  let lastBody: string | undefined;

  function snapshot(input: LogInput): void {
    lastBody = JSON.stringify(buildPayload(sessionId, input));
    void post(lastBody).catch(() => undefined);
  }

  function flush(): void {
    if (lastBody === undefined) {
      return;
    }
    // Beacon a typed Blob so the request carries content-type application/json; a plain string
    // body would be sent as text/plain and rejected by the backend handler (415).
    navigator.sendBeacon(LOG_ENDPOINT, new Blob([lastBody], { type: "application/json" }));
  }

  return { sessionId, snapshot, flush };
}
