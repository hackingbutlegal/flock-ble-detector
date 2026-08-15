import { describe, expect, it } from "vitest";
import { handleLog } from "./handler.js";
import type { EventRecord, Store } from "./store.js";

interface MemoryStore extends Store {
  readonly events: EventRecord[];
  readonly sessions: { sessionId: string; snapshot: unknown }[];
}

function makeMemoryStore(): MemoryStore {
  const events: EventRecord[] = [];
  const sessions: { sessionId: string; snapshot: unknown }[] = [];
  return {
    events,
    sessions,
    async appendEvent(rec: EventRecord): Promise<void> {
      events.push(rec);
    },
    async writeSession(sessionId: string, snapshot: unknown): Promise<void> {
      sessions.push({ sessionId, snapshot });
    },
  };
}

const SESSION_ID = "11111111-2222-3333-4444-555555555555";

function validBody(): string {
  return JSON.stringify({
    sessionId: SESSION_ID,
    meta: { generatedAt: "2026-08-13T12:00:00.000Z", deviceName: "PMIC" },
    results: [
      { id: "F1", verdict: "confirmed" },
      { id: "F5", verdict: "inconclusive" },
    ],
    gattLog: "connected\n",
  });
}

function makeInput(overrides?: Partial<Parameters<typeof handleLog>[0]>) {
  return {
    method: "POST",
    contentType: "application/json",
    bodyText: validBody(),
    remoteAddr: "127.0.0.1",
    receivedAt: "2026-08-13T12:00:01.000Z",
    ...overrides,
  };
}

describe("handleLog", () => {
  it("accepts a valid snapshot: 200, one event, one session write", async () => {
    const store = makeMemoryStore();
    const res = await handleLog(makeInput(), store);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toEqual({
      receivedAt: "2026-08-13T12:00:01.000Z",
      remoteAddr: "127.0.0.1",
      sessionId: SESSION_ID,
      resultCount: 2,
      verdictCounts: { confirmed: 1, inconclusive: 1 },
      deviceName: "PMIC",
    });
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]?.sessionId).toBe(SESSION_ID);
    const snapshot = store.sessions[0]?.snapshot as { receivedAt?: string; gattLog?: string };
    expect(snapshot.receivedAt).toBe("2026-08-13T12:00:01.000Z");
    expect(snapshot.gattLog).toBe("connected\n");
  });

  it("rejects non-POST with 405 and writes nothing", async () => {
    const store = makeMemoryStore();
    const res = await handleLog(makeInput({ method: "GET" }), store);
    expect(res.status).toBe(405);
    expect(store.events).toHaveLength(0);
    expect(store.sessions).toHaveLength(0);
  });

  it("rejects non-JSON content type with 415 and writes nothing", async () => {
    const store = makeMemoryStore();
    const res = await handleLog(makeInput({ contentType: "text/plain" }), store);
    expect(res.status).toBe(415);
    expect(store.events).toHaveLength(0);
    expect(store.sessions).toHaveLength(0);
  });

  it("rejects an oversized body with 413 and writes nothing", async () => {
    const store = makeMemoryStore();
    const res = await handleLog(makeInput({ bodyText: "x".repeat(1024 * 1024 + 1) }), store);
    expect(res.status).toBe(413);
    expect(store.events).toHaveLength(0);
    expect(store.sessions).toHaveLength(0);
  });

  it("rejects malformed JSON with 400 and writes nothing", async () => {
    const store = makeMemoryStore();
    const res = await handleLog(makeInput({ bodyText: "{not json" }), store);
    expect(res.status).toBe(400);
    expect(store.events).toHaveLength(0);
    expect(store.sessions).toHaveLength(0);
  });

  it("rejects a traversal sessionId with 400 and writes nothing", async () => {
    const store = makeMemoryStore();
    const body = JSON.stringify({ sessionId: "../etc", results: [] });
    const res = await handleLog(makeInput({ bodyText: body }), store);
    expect(res.status).toBe(400);
    expect(store.events).toHaveLength(0);
    expect(store.sessions).toHaveLength(0);
  });

  it("rejects a missing sessionId with 400 and writes nothing", async () => {
    const store = makeMemoryStore();
    const body = JSON.stringify({ results: [] });
    const res = await handleLog(makeInput({ bodyText: body }), store);
    expect(res.status).toBe(400);
    expect(store.events).toHaveLength(0);
    expect(store.sessions).toHaveLength(0);
  });

  it("rejects non-array results with 400 and writes nothing", async () => {
    const store = makeMemoryStore();
    const body = JSON.stringify({ sessionId: SESSION_ID, results: "nope" });
    const res = await handleLog(makeInput({ bodyText: body }), store);
    expect(res.status).toBe(400);
    expect(store.events).toHaveLength(0);
    expect(store.sessions).toHaveLength(0);
  });
});
