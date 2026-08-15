import type { EventRecord, Store } from "./store.js";

/** Outcome of handling one request: HTTP status plus a JSON body string. */
export interface HandleResult {
  status: number;
  body: string;
}

/** Maximum accepted request body size in bytes (1 MB). */
export const MAX_BODY = 1024 * 1024;

const SESSION_ID_RE = /^[0-9a-f-]{36}$/i;

interface LogRequest {
  method: string;
  contentType: string;
  bodyText: string;
  remoteAddr: string;
  receivedAt: string;
}

function reject(status: number, error: string): HandleResult {
  return { status, body: JSON.stringify({ ok: false, error }) };
}

function countVerdicts(results: unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) {
    if (typeof result === "object" && result !== null && "verdict" in result) {
      const verdict = (result as { verdict: unknown }).verdict;
      if (typeof verdict === "string") {
        counts[verdict] = (counts[verdict] ?? 0) + 1;
      }
    }
  }
  return counts;
}

function deviceNameOf(payload: Record<string, unknown>): string | undefined {
  const meta = payload["meta"];
  if (typeof meta === "object" && meta !== null && "deviceName" in meta) {
    const deviceName = (meta as { deviceName: unknown }).deviceName;
    if (typeof deviceName === "string") {
      return deviceName;
    }
  }
  return undefined;
}

/**
 * Validates and persists one `/api/log` snapshot.
 *
 * Rejects non-POST (405), non-JSON content types (415), bodies over `MAX_BODY`
 * (413), and malformed payloads (400): unparseable JSON, a `sessionId` not
 * matching the UUID charset (traversal-safe — checked before any path use), or
 * a non-array `results`. On success appends a compact `EventRecord` and writes
 * the full snapshot (stamped with `receivedAt`) via the injected store.
 *
 * @param input Request method, content type, body text, remote address, and caller-stamped
 *   ISO `receivedAt`.
 * @param store Destination for the event line and session snapshot.
 */
export async function handleLog(input: LogRequest, store: Store): Promise<HandleResult> {
  if (input.method !== "POST") {
    return reject(405, "method not allowed");
  }
  if (!input.contentType.toLowerCase().includes("application/json")) {
    return reject(415, "content-type must be application/json");
  }
  if (Buffer.byteLength(input.bodyText, "utf8") > MAX_BODY) {
    return reject(413, "body exceeds 1 MB cap");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(input.bodyText);
  } catch {
    return reject(400, "body is not valid JSON");
  }
  if (typeof payload !== "object" || payload === null) {
    return reject(400, "body must be a JSON object");
  }
  const record = payload as Record<string, unknown>;
  const sessionId = record["sessionId"];
  if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) {
    return reject(400, "sessionId must be a 36-char UUID");
  }
  const results = record["results"];
  if (!Array.isArray(results)) {
    return reject(400, "results must be an array");
  }

  const event: EventRecord = {
    receivedAt: input.receivedAt,
    remoteAddr: input.remoteAddr,
    sessionId,
    resultCount: results.length,
    verdictCounts: countVerdicts(results),
  };
  const deviceName = deviceNameOf(record);
  if (deviceName !== undefined) {
    event.deviceName = deviceName;
  }
  await store.appendEvent(event);
  await store.writeSession(sessionId, { ...record, receivedAt: input.receivedAt });
  return { status: 200, body: JSON.stringify({ ok: true }) };
}
