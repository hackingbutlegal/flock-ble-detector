import { appendFile, mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface EventRecord {
  receivedAt: string;
  remoteAddr: string;
  sessionId: string;
  resultCount: number;
  verdictCounts: Record<string, number>;
  deviceName?: string;
}

export interface Store {
  appendEvent(rec: EventRecord): Promise<void>;
  writeSession(sessionId: string, snapshot: unknown): Promise<void>;
}

const DEFAULT_ROTATE_BYTES = 5 * 1024 * 1024;

function dayOf(snapshot: unknown): string {
  const receivedAt =
    typeof snapshot === "object" && snapshot !== null && "receivedAt" in snapshot
      ? (snapshot as { receivedAt: unknown }).receivedAt
      : undefined;
  if (typeof receivedAt !== "string" || receivedAt.length < 10) {
    throw new Error(
      "writeSession: snapshot must carry an ISO receivedAt string (stamped by the caller)",
    );
  }
  return receivedAt.slice(0, 10);
}

/**
 * Creates a filesystem-backed store under `dir`.
 *
 * Events append as JSON lines to `<dir>/events.jsonl`, rotating the file to
 * `events.jsonl.1` (keeping one prior) once it reaches `opts.rotateBytes`
 * (default 5 MB). Session snapshots are written pretty-printed to
 * `<dir>/sessions/<YYYY-MM-DD>/<sessionId>.json`, with the date taken from the
 * snapshot's caller-stamped `receivedAt` field. Directories are created as
 * needed.
 *
 * @param dir Data directory (outside the web root).
 * @param opts Optional `rotateBytes` rotation threshold in bytes.
 */
export function createFsStore(dir: string, opts?: { rotateBytes?: number }): Store {
  const rotateBytes = opts?.rotateBytes ?? DEFAULT_ROTATE_BYTES;
  const eventsPath = path.join(dir, "events.jsonl");

  async function rotateIfNeeded(): Promise<void> {
    let size: number;
    try {
      size = (await stat(eventsPath)).size;
    } catch {
      return;
    }
    if (size >= rotateBytes) {
      await rename(eventsPath, `${eventsPath}.1`);
    }
  }

  return {
    async appendEvent(rec: EventRecord): Promise<void> {
      await mkdir(dir, { recursive: true });
      await rotateIfNeeded();
      await appendFile(eventsPath, `${JSON.stringify(rec)}\n`, "utf8");
    },
    async writeSession(sessionId: string, snapshot: unknown): Promise<void> {
      const sessionDir = path.join(dir, "sessions", dayOf(snapshot));
      await mkdir(sessionDir, { recursive: true });
      const file = path.join(sessionDir, `${sessionId}.json`);
      await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    },
  };
}
