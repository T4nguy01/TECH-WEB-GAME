import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer } from "ws";

import { createServerNetwork } from "./network.js";
import { generateWorld } from "./worldgen.js";
import { PlayerManager } from "./playerManager.js";
import { SaveSystem } from "./saveSystem.js";
import { AuthStore } from "./authStore.js";
import { normalizeSkinId } from "../client/skins.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ROOT = path.resolve(process.cwd());
const CLIENT_DIR = path.join(ROOT, "client");
const DATA_DIR = path.join(ROOT, "data");

fs.mkdirSync(DATA_DIR, { recursive: true });

const auth = new AuthStore({ dataDir: DATA_DIR });
const save = new SaveSystem({ dataDir: DATA_DIR, fileName: "world.json" });
const loaded = save.load();

const world =
  loaded?.world ??
  generateWorld({
    w: 500,
    h: 200,
    seed: Date.now() & 0xffffffff,
  });
world.chests ||= {};

const playerManager = new PlayerManager({
  world,
  onInventoryChange(userId, inventory, mode) {
    if (mode === "creative") return;
    auth.updateInventory(userId, inventory);
  },
});

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 50_000) reject(new Error("BODY_TOO_LARGE"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(new Error("JSON_INVALID"));
      }
    });
  });
}

function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Allow": "GET, HEAD" });
    res.end("Method Not Allowed");
    return;
  }

  let filePath;
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    filePath = decodeURIComponent(filePath);
  } catch {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  const fullPath = path.resolve(CLIENT_DIR, `.${filePath}`);
  const relative = path.relative(CLIENT_DIR, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const type =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".css"
          ? "text/css; charset=utf-8"
          : ext === ".js"
            ? "text/javascript; charset=utf-8"
            : "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") res.end();
    else res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  // Simple JSON auth API (same-origin)
  if (req.url.startsWith("/api/")) {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      const code = e?.message === "BODY_TOO_LARGE" ? 413 : 400;
      return sendJson(res, code, { ok: false, error: "BAD_REQUEST" });
    }

    if (req.url === "/api/register") {
      const r = auth.register({ username: body.username, password: body.password });
      return sendJson(res, r.ok ? 200 : 400, r);
    }

    if (req.url === "/api/login") {
      const r = auth.login({ username: body.username, password: body.password });
      return sendJson(res, r.ok ? 200 : 400, r);
    }

    if (req.url === "/api/skin") {
      const token = String(body.token || "");
      const skinId = normalizeSkinId(body.skinId);
      const authInfo = auth.verifyToken(token);
      if (!authInfo) return sendJson(res, 401, { ok: false, error: "AUTH_REQUIRED" });
      const r = auth.updateSkin(authInfo.userId, skinId);
      if (!r.ok) return sendJson(res, 400, r);
      playerManager.setSkinByUserId(authInfo.userId, r.skin);
      net.broadcastState();
      return sendJson(res, 200, { ok: true, skin: r.skin });
    }

    return sendJson(res, 404, { ok: false, error: "NOT_FOUND" });
  }

  if (req.url.startsWith("/ws")) {
    res.writeHead(426);
    res.end("Upgrade Required");
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on("upgrade", (req, socket, head) => {
  if (!req.url?.startsWith("/ws")) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

const net = createServerNetwork({ wss, playerManager, world, auth });

save.setState({ world, playerManager });
save.startAutosave(30_000);

const TICK_HZ = 20;
setInterval(() => {
  const events = playerManager.tick(1 / TICK_HZ) || [];
  for (const event of events) {
    if (event.type === "blockUpdate") {
      net.broadcastBlockUpdate(event);
      continue;
    }
    if (event.type === "explosion") {
      net.broadcastExplosion(event);
      continue;
    }
    if (event.type === "smoke") {
      net.broadcast("smoke", event);
      continue;
    }
    if (event.type === "confetti") {
      net.broadcast("confetti", event);
      continue;
    }
    if (event.type === "burst") {
      net.broadcast("burst", event);
      continue;
    }
  }
  net.broadcastState();
}, 1000 / TICK_HZ);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`);
});
