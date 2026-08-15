import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import process from "node:process";
import { handleLog, MAX_BODY } from "./handler.js";
import { createFsStore } from "./store.js";

const PORT = Number(process.env["PORT"] ?? 8787);
if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`invalid PORT env: ${process.env["PORT"]} (expected an integer 1-65535)`);
}
const LOG_DIR = process.env["LOG_DIR"] ?? "/var/lib/pmic-ble-verifier-a";

const store = createFsStore(LOG_DIR);

function respond(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}

function readBody(req: IncomingMessage, res: ServerResponse): Promise<string | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY) {
        respond(res, 413, JSON.stringify({ ok: false, error: "body exceeds 1 MB cap" }));
        req.destroy();
        resolve(undefined);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(undefined));
  });
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.url === "/api/health" && req.method === "GET") {
    respond(res, 200, JSON.stringify({ ok: true }));
    return;
  }
  if (req.url !== "/api/log") {
    respond(res, 404, JSON.stringify({ ok: false, error: "not found" }));
    return;
  }
  const bodyText = await readBody(req, res);
  if (bodyText === undefined) {
    return;
  }
  const result = await handleLog(
    {
      method: req.method ?? "",
      contentType: req.headers["content-type"] ?? "",
      bodyText,
      remoteAddr: req.socket.remoteAddress ?? "",
      receivedAt: new Date().toISOString(),
    },
    store,
  );
  respond(res, result.status, result.body);
}

createServer((req, res) => {
  void route(req, res).catch(() => {
    respond(res, 500, JSON.stringify({ ok: false, error: "internal error" }));
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`ble-a logger listening on 127.0.0.1:${PORT}, LOG_DIR=${LOG_DIR}`);
});
