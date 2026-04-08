import { encodeWorldRLE } from "./worldgen.js";

export function createServerNetwork({ wss, playerManager, world, auth }) {
  const conns = new Map(); // ws -> playerId

  function send(ws, type, data = {}) {
    ws.send(JSON.stringify({ type, ...data }));
  }

  function broadcast(type, data = {}) {
    const msg = JSON.stringify({ type, ...data });
    for (const ws of wss.clients) {
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  function broadcastState() {
    const players = playerManager.getPublicStates();
    const projectiles = playerManager.getPublicProjectiles();
    const items = playerManager.getPublicDroppedItems();
    broadcast("state", { players, projectiles, items });
  }

  function broadcastBlockUpdate(event) {
    if (!event) return;
    broadcast("blockUpdate", event);
  }

  function broadcastExplosion(event) {
    if (!event) return;
    broadcast("explosion", event);
  }

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/ws", "http://localhost");
    const token = url.searchParams.get("token") || "";
    const authInfo = auth.verifyToken(token);

    if (!authInfo) {
      ws.close(4001, "AUTH_REQUIRED");
      return;
    }

    const profile = auth.getProfile(authInfo.userId) || {
      skin: auth.getSkin(authInfo.userId),
      inventory: null,
    };
    const playerId = playerManager.addPlayer({
      name: authInfo.username,
      userId: authInfo.userId,
      skin: profile.skin,
      mode: profile.mode,
      inventory: profile.inventory,
    });
    conns.set(ws, playerId);

    send(ws, "welcome", {
      id: playerId,
      hotbar: playerManager.getHotbar(playerId),
      skin: profile.skin,
      mode: profile.mode,
      inventory: playerManager.getInventory(playerId),
    });
    send(ws, "world", { world: encodeWorldRLE(world) });
    broadcast("chat", { id: null, name: "serveur", text: `${playerManager.getName(playerId)} a rejoint la partie.` });

    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;

      const id = conns.get(ws);
      if (!id) return;

      if (msg.type === "input") {
        playerManager.setInput(id, msg.input);
        return;
      }

      if (msg.type === "chat") {
        const text = String(msg.text || "").trim().slice(0, 180);
        if (!text) return;
        broadcast("chat", { id, name: playerManager.getName(id), text });
        return;
      }

      if (msg.type === "placeBlock") {
        const x = Number(msg.x);
        const y = Number(msg.y);
        const blockType = Number(msg.blockType);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(blockType)) return;
        if (playerManager.tryPlaceBlock(id, x, y, blockType)) {
          const update = { x, y, blockType };
          broadcast("blockUpdate", update);
          send(ws, "inventory", { inventory: playerManager.getInventory(id) });
        }
        return;
      }

      if (msg.type === "breakBlock") {
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const mined = playerManager.tryMineBlock(id, x, y);
        if (!mined) return;
        if (mined.broken) {
          for (const update of mined.updates || []) {
            broadcast("blockUpdate", update);
          }
          send(ws, "blockDamage", { x, y, progress: 0 });
          send(ws, "inventory", { inventory: playerManager.getInventory(id) });
        } else {
          send(ws, "blockDamage", { x, y, progress: mined.progress });
        }
        return;
      }

      if (msg.type === "moveItem") {
        if (typeof msg.from === "number" || typeof msg.to === "number") {
          const from = Number(msg.from);
          const to = Number(msg.to);
          if (!Number.isFinite(from) || !Number.isFinite(to)) return;
          if (playerManager.moveInventorySlot(id, from, to)) {
            send(ws, "inventory", { inventory: playerManager.getInventory(id) });
          }
          return;
        }

        if (msg.from && msg.to) {
          const result = playerManager.transferInventoryItem(id, { from: msg.from, to: msg.to });
          if (result) {
            send(ws, "inventory", { inventory: result.inventory });
            if (result.chest && result.chestPos) {
              send(ws, "chest", { x: result.chestPos.x, y: result.chestPos.y, inventory: result.chest });
            }
          }
        }
        return;
      }

      if (msg.type === "dropItem") {
        const slot = Number(msg.slot);
        const amount = Number(msg.amount);
        if (!Number.isFinite(slot)) return;
        const dropped = playerManager.dropInventoryItem(id, slot, Number.isFinite(amount) ? amount : null);
        if (!dropped) return;
        send(ws, "inventory", { inventory: playerManager.getInventory(id) });
        broadcastState();
        return;
      }

      if (msg.type === "craft") {
        const recipeId = String(msg.recipeId || "");
        if (!recipeId) return;
        const result = playerManager.tryCraft(id, recipeId);
        if (result) {
          send(ws, "inventory", { inventory: result.inventory });
        }
        return;
      }

      if (msg.type === "mode") {
        const mode = String(msg.mode || "");
        if (mode !== "survival" && mode !== "creative") return;
        const authInfoForConn = auth.verifyToken(token);
        if (!authInfoForConn) return;
        const updated = auth.updateMode(authInfoForConn.userId, mode);
        if (!updated.ok) return;
        playerManager.setModeByUserId(authInfoForConn.userId, updated.mode);
        for (const [clientWs, playerId] of conns.entries()) {
          if (playerManager.getUserId(playerId) !== authInfoForConn.userId) continue;
          send(clientWs, "inventory", { inventory: playerManager.getInventory(playerId) });
        }
        return;
      }

      if (msg.type === "fireWeapon") {
        const targetX = Number(msg.targetX);
        const targetY = Number(msg.targetY);
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
        const projectile = playerManager.tryFireWeapon(id, targetX, targetY);
        if (!projectile) return;
        send(ws, "inventory", { inventory: playerManager.getInventory(id) });
        broadcastState();
        return;
      }

      if (msg.type === "openChest") {
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const chest = playerManager.openChest(id, x, y);
        if (!chest) return;
        send(ws, "chest", chest);
        return;
      }

      if (msg.type === "attackPlayer") {
        const targetId = String(msg.targetId || "");
        if (!targetId) return;
        const result = playerManager.tryAttackPlayer(id, targetId);
        if (!result) return;
        broadcastState();
        if (result.defeated) {
          broadcast("chat", {
            id: null,
            name: "serveur",
            text: `${playerManager.getName(id)} a vaincu ${playerManager.getName(targetId)}.`,
          });
        }
      }
    });

    ws.on("close", () => {
      const id = conns.get(ws);
      conns.delete(ws);
      if (!id) return;
      broadcast("chat", { id: null, name: "serveur", text: `${playerManager.getName(id)} a quitté la partie.` });
      playerManager.removePlayer(id);
    });
  });

  return { broadcastState, broadcastBlockUpdate, broadcastExplosion, broadcast };
}
