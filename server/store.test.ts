import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFsStore, type EventRecord } from "./store.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "ble-a-store-"));
}

function makeRecord(overrides?: Partial<EventRecord>): EventRecord {
  return {
    receivedAt: "2026-08-13T12:00:00.000Z",
    remoteAddr: "127.0.0.1",
    sessionId: "11111111-2222-3333-4444-555555555555",
    resultCount: 2,
    verdictCounts: { confirmed: 1, inconclusive: 1 },
    deviceName: "PMIC",
    ...overrides,
  };
}

describe("createFsStore", () => {
  it("appendEvent writes one parseable JSONL line", async () => {
    const dir = await makeTempDir();
    const store = createFsStore(dir);
    const record = makeRecord();
    await store.appendEvent(record);
    const text = await readFile(path.join(dir, "events.jsonl"), "utf8");
    const lines = text.split("\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual(record);
  });

  it("writeSession writes sessions/<date>/<id>.json containing the snapshot", async () => {
    const dir = await makeTempDir();
    const store = createFsStore(dir);
    const snapshot = {
      receivedAt: "2026-08-13T12:00:00.000Z",
      sessionId: "11111111-2222-3333-4444-555555555555",
      results: [],
    };
    await store.writeSession(snapshot.sessionId, snapshot);
    const file = path.join(dir, "sessions", "2026-08-13", `${snapshot.sessionId}.json`);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(snapshot);
  });

  it("writeSession rejects a snapshot without a receivedAt string", async () => {
    const dir = await makeTempDir();
    const store = createFsStore(dir);
    await expect(store.writeSession("abc", { results: [] })).rejects.toThrow(/receivedAt/);
  });

  it("rotates events.jsonl to events.jsonl.1 past rotateBytes, keeping one prior", async () => {
    const dir = await makeTempDir();
    const store = createFsStore(dir, { rotateBytes: 10 });
    const first = makeRecord({ deviceName: "first" });
    const second = makeRecord({ deviceName: "second" });
    await store.appendEvent(first);
    await store.appendEvent(second);
    const rotated = await readFile(path.join(dir, "events.jsonl.1"), "utf8");
    const current = await readFile(path.join(dir, "events.jsonl"), "utf8");
    expect(JSON.parse(rotated.trim())).toEqual(first);
    expect(JSON.parse(current.trim())).toEqual(second);
  });
});
