import { Player } from "./player.js";
import { World, BlockTypes, TILE_SIZE } from "./world.js";
import { getRecipes } from "./crafting.js";
import { hintForItem, labelForItem, nameForItem, placeBlockTypeForItem } from "./items.js";
import { createDefaultInventory, normalizePlayerInventory } from "./inventory.js";
import { isWeaponItem } from "./weapons.js";

const PLAYER_W = 14;
const PLAYER_H = 32;

export class Game {
  constructor({ renderer, network, ui }) {
    this.renderer = renderer;
    this.network = network;
    this.ui = ui;

    this.world = null;
    this.players = new Map();
    this.localId = null;
    this.inventory = createDefaultInventory();
    this.projectiles = [];
    this.droppedItems = [];
    this._pendingBlockUpdates = [];
    this._prevJumpInput = false;

    this.input = {
      left: false,
      right: false,
      jump: false,
      hotbar: 0,
      mouse: { x: 0, y: 0, left: false, right: false, leftClicked: false, rightClicked: false },
    };

    this._lastBlockActionSent = 0;

    this._bindInput();
    this._bindNetwork();
    this.ui.initHotbar(9, this._hotbarUiItems());
    this.ui.setRecipes(getRecipes());
    this.renderer.setFunOptions(this.ui.getFunOptions?.() || {});
  }

  _sendInputState() {
    this.network.send("input", {
      input: {
        left: this.input.left,
        right: this.input.right,
        jump: this.input.jump,
        hotbar: this.input.hotbar,
      },
    });
  }

  _blockOverlapsPlayer(x, y, player) {
    if (!player) return false;
    const blockRect = {
      x0: x * TILE_SIZE,
      x1: (x + 1) * TILE_SIZE,
      y0: y * TILE_SIZE,
      y1: (y + 1) * TILE_SIZE,
    };
    const playerRect = {
      x0: player.x - PLAYER_W * 0.5,
      x1: player.x + PLAYER_W * 0.5,
      y0: player.y - PLAYER_H,
      y1: player.y,
    };
    return blockRect.x0 < playerRect.x1 && blockRect.x1 > playerRect.x0 && blockRect.y0 < playerRect.y1 && blockRect.y1 > playerRect.y0;
  }

  _canPlaceAt(x, y) {
    for (const player of this.players.values()) {
      if (this._blockOverlapsPlayer(x, y, player)) return false;
    }
    return true;
  }

  _bindNetwork() {
    this.network.on("welcome", (msg) => {
      if (!msg || typeof msg !== "object") return;
      this.localId = msg.id;
      if (msg.skin) localStorage.setItem("webgame_skin", msg.skin);
      if (msg.inventory) this.inventory = normalizePlayerInventory(msg.inventory);
      else if (Array.isArray(msg.hotbar) && msg.hotbar.length === 9) {
        this.inventory = normalizePlayerInventory({ slots: msg.hotbar.map((itemType) => (itemType ? { itemType, count: 1 } : null)) });
      }
      this.input.hotbar = Number.isFinite(this.inventory.selectedSlot) ? this.inventory.selectedSlot : 0;
      this.ui.setGameMode(msg.mode || "survival");
      this.ui.initHotbar(9, this._hotbarUiItems());
      this.ui.setInventory(this.inventory);
      this.ui.setChest(null);
    });

    this.network.on("world", (msg) => {
      if (!msg || !msg.world) return;
      this.world = World.fromRLE(msg.world);
      this.renderer.setWorld(this.world);
      if (this._pendingBlockUpdates.length) {
        for (const update of this._pendingBlockUpdates.splice(0)) {
          this._applyBlockUpdate(update);
        }
      }
    });

    this.network.on("state", (msg) => {
      const players = Array.isArray(msg?.players) ? msg.players : [];
      for (const s of players) {
        let p = this.players.get(s.id);
        if (!p) {
          p = new Player({ id: s.id, name: s.name, skin: s.skin });
          this.players.set(s.id, p);
        }
        p.applyServerState(s);
      }
      for (const id of Array.from(this.players.keys())) {
        if (!players.some((p) => p.id === id)) this.players.delete(id);
      }
      this.projectiles = Array.isArray(msg.projectiles) ? msg.projectiles : [];
      this.droppedItems = Array.isArray(msg.items) ? msg.items : [];
      this.ui.setPlayers(players, this.localId);
    });

    this.network.on("blockUpdate", (msg) => {
      if (!msg || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      if (!this.world) {
        this._pendingBlockUpdates.push(msg);
        return;
      }
      this._applyBlockUpdate(msg);
    });

    this.network.on("blockDamage", (msg) => {
      if (!msg || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      this.renderer.setBreakDamage({ x: msg.x, y: msg.y, progress: msg.progress });
    });

    this.network.on("explosion", (msg) => {
      if (!msg || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      this.renderer.addExplosion(msg);
    });

    this.network.on("smoke", (msg) => {
      if (!msg || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      this.renderer.addSmokeCloud(msg);
      if (this.ui.getFunOptions?.().sparkles) {
        this.renderer.spawnSparkles(msg.x, msg.y, {
          count: 14,
          spread: 1.1,
          colors: ["rgba(200,200,210,0.9)", "rgba(150,150,160,0.9)", "rgba(220,220,225,0.9)"],
        });
      }
    });

    this.network.on("confetti", (msg) => {
      if (!msg || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      this.renderer.spawnSparkles(msg.x, msg.y, {
        count: Number.isFinite(msg.count) ? msg.count : 28,
        spread: Number.isFinite(msg.spread) ? msg.spread : 1.2,
        colors: Array.isArray(msg.colors) && msg.colors.length ? msg.colors : ["#ff4d6d", "#ffbd49", "#2dd4bf", "#8b7bff", "#ffffff"],
      });
    });

    this.network.on("burst", (msg) => {
      if (!msg || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      this.renderer.addExplosion({
        x: msg.x,
        y: msg.y,
        radius: Number.isFinite(msg.radius) ? msg.radius : 60,
        color: msg.color || "#8b7bff",
      });
      this.renderer.spawnSparkles(msg.x, msg.y, {
        count: Number.isFinite(msg.sparkles) ? msg.sparkles : 22,
        spread: 1.3,
        colors: ["#ffffff", "#ffbd49", "#2dd4bf", "#8b7bff", "#ff4d6d"],
      });
    });

    this.network.on("inventory", (msg) => {
      if (!msg || !msg.inventory) return;
      this.inventory = normalizePlayerInventory(msg.inventory);
      this.input.hotbar = Number.isFinite(this.inventory.selectedSlot) ? this.inventory.selectedSlot : this.input.hotbar;
      this.ui.setInventory(this.inventory);
      this.ui.initHotbar(9, this._hotbarUiItems());
    });

    this.network.on("chest", (msg) => {
      if (!msg || msg.inventory == null) {
        this.ui.setChest(null);
        return;
      }
      this.ui.setChest(msg);
    });

    this.network.on("chat", (msg) => {
      if (!msg || typeof msg.text !== "string") return;
      this.ui.addChatLine(`[${msg.name}] ${msg.text}`);
      if (msg.id != null) {
        const p = this.players.get(msg.id);
        if (p) p.setChatBubble(msg.text);
      }
    });

    this.ui.onChatSend = (text) => {
      this.network.send("chat", { text });
    };

    this.ui.onHotbarSelect = (slot) => {
      this.input.hotbar = slot;
      this.inventory.selectedSlot = slot;
      this.ui.setInventory(this.inventory);
      this._sendInputState();
    };

    this.ui.onInventorySwap = (from, to) => {
      this.network.send("moveItem", { from, to });
    };

    this.ui.onInventoryTransfer = (payload) => {
      this.network.send("moveItem", payload);
    };

    this.ui.onCraftRequest = (recipeId) => {
      this.network.send("craft", { recipeId });
      if (this.ui.getFunOptions?.().sparkles) {
        const local = this.getLocalPlayer();
        if (local) this.renderer.spawnSparkles(local.x, local.y - 18, { count: 16, spread: 1.2 });
      }
    };

    this.ui.onModeToggle = (mode) => {
      this.network.send("mode", { mode });
    };

    this.ui.onFunOptionsChange = (options) => {
      this.renderer.setFunOptions(options);
    };

    this.ui.onDropRequest = (slotIndex) => {
      this.network.send("dropItem", { slot: slotIndex });
    };

    this.ui.onInventoryToggle = (open) => {
      if (open) {
        this.input.left = false;
        this.input.right = false;
        this.input.jump = false;
        this.network.sendInput({
          left: false,
          right: false,
          jump: false,
          hotbar: this.input.hotbar,
        });
        this.ui.setInventory(this.inventory);
      } else {
        this.ui.setChest(null);
      }
    };
  }

  _bindInput() {
    const canvas = this.renderer?.canvas || null;
    const onKey = (e, down) => {
      const k = e.key.toLowerCase();
      const inventoryOpen = this.ui.isInventoryOpen();
      if (inventoryOpen && (k === "a" || k === "q" || k === "d" || k === "w" || k === "z" || k === " " || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp")) {
        return;
      }
      if (k === "a" || k === "q" || e.key === "ArrowLeft") this.input.left = down;
      if (k === "d" || e.key === "ArrowRight") this.input.right = down;
      if (k === "w" || k === "z" || e.key === "ArrowUp" || e.key === " ") this.input.jump = down;
      if (/^[1-9]$/.test(k) && down) {
        this.input.hotbar = Number(k) - 1;
        this._sendInputState();
      }
    };

    window.addEventListener("keydown", (e) => {
      if (this.ui.isChatFocused()) return;
      onKey(e, true);
    });
    window.addEventListener("keyup", (e) => onKey(e, false));

    const onPointerMove = (e) => {
      this.input.mouse.x = e.clientX;
      this.input.mouse.y = e.clientY;
    };

    const onPointerDown = (e) => {
      if (e.button === 2) e.preventDefault();
      if (e.button === 0) {
        this.input.mouse.left = true;
        this.input.mouse.leftClicked = true;
      }
      if (e.button === 2) {
        this.input.mouse.right = true;
        this.input.mouse.rightClicked = true;
      }
    };

    const onPointerUp = (e) => {
      if (e.button === 0) this.input.mouse.left = false;
      if (e.button === 2) this.input.mouse.right = false;
    };

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mouseup", onPointerUp);

    canvas?.addEventListener("pointermove", onPointerMove);
    canvas?.addEventListener("pointerdown", onPointerDown);
    canvas?.addEventListener("pointerup", onPointerUp);
    canvas?.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener(
      "wheel",
      (e) => {
        if (this.ui.isChatFocused()) return;
        const delta = Math.sign(e.deltaY);
        if (!delta) return;
        e.preventDefault();
        const next = (this.input.hotbar + (delta > 0 ? 1 : -1) + 9) % 9;
        this.input.hotbar = next;
        this._sendInputState();
      },
      { passive: false }
    );
  }

  getLocalPlayer() {
    if (!this.localId) return null;
    return this.players.get(this.localId) || null;
  }

  update(_dt) {
    this.ui.setActiveHotbar(this.input.hotbar);
    if (this.inventory.selectedSlot !== this.input.hotbar) {
      this.inventory.selectedSlot = this.input.hotbar;
      if (this.ui.isInventoryOpen()) this.ui.setInventory(this.inventory);
    }

    if (!this.world || !this.localId) return;

    const local = this.getLocalPlayer();
    if (!local) return;

    const jumpPressed = this.input.jump && !this._prevJumpInput;
    this._prevJumpInput = this.input.jump;
    if (!this.ui.isInventoryOpen() && jumpPressed && this.ui.getFunOptions?.().jumpBurst) {
      this.renderer.spawnSparkles(local.x, local.y + 2, {
        count: 14,
        spread: 1.4,
        colors: ["#ffffff", "#8b7bff", "#2dd4bf", "#ffbd49"],
      });
      this.renderer.triggerShake(1.8, 120);
    }

    const selectedItem = this.inventory.slots[this.input.hotbar] || null;
    this.ui.setLocalHud({
      health: local.health,
      maxHealth: local.maxHealth ?? 20,
      itemLabel: selectedItem ? `${nameForItem(selectedItem.itemType)} x${selectedItem.count}` : "Emplacement vide",
      itemHint: selectedItem ? hintForItem(selectedItem.itemType) : "Aucun objet sélectionné",
    });

    if (this.ui.isInventoryOpen()) {
      this._sendInputState();
      return;
    }

    this._sendInputState();

    const action = this.renderer.pickBlock(this.input.mouse.x, this.input.mouse.y, local);
    const worldPoint = this.renderer.pickWorldPoint(this.input.mouse.x, this.input.mouse.y, local);
    const placeAim = worldPoint ? this._findPlacementTarget(worldPoint.x, worldPoint.y, local) : null;
    this.renderer.setAimBlock(action || placeAim);
    const targetPlayer = this.renderer.pickPlayer(
      this.input.mouse.x,
      this.input.mouse.y,
      Array.from(this.players.values()),
      this.localId
    );

    const now = performance.now();
    if (now - this._lastBlockActionSent < 100) return;
    const leftClicked = this.input.mouse.leftClicked;
    const rightClicked = this.input.mouse.rightClicked;
    this.input.mouse.leftClicked = false;
    this.input.mouse.rightClicked = false;

    // Minecraft-like: left = mine, right = place
    if (leftClicked || this.input.mouse.left) {
      if (selectedItem && isWeaponItem(selectedItem.itemType)) {
        const aim = this.renderer.pickWorldPoint(this.input.mouse.x, this.input.mouse.y, local);
        if (aim) this.network.send("fireWeapon", { targetX: aim.x, targetY: aim.y });
      } else if (targetPlayer) {
        this.network.send("attackPlayer", { targetId: targetPlayer.id });
      } else if (action) {
        this.network.send("breakBlock", { ...action });
        if (this.ui.getFunOptions?.().sparkles) {
          this.renderer.spawnSparkles((action.x + 0.5) * TILE_SIZE, (action.y + 0.5) * TILE_SIZE, {
            count: 10,
            spread: 1.1,
          });
        }
      }
    }

    if (rightClicked || this.input.mouse.right) {
      const t = placeAim;
      const itemType = selectedItem?.itemType || null;
      const placeType = placeBlockTypeForItem(itemType);
      const targetBlock = action ? this.world?.get(action.x, action.y) : null;
      if (targetBlock === BlockTypes.CHEST) {
        this.network.send("openChest", { x: action.x, y: action.y });
      } else if (t && placeType != null) {
        this.network.send("placeBlock", { ...t, blockType: placeType });
        if (this.ui.getFunOptions?.().sparkles) {
          this.renderer.spawnSparkles((t.x + 0.5) * TILE_SIZE, (t.y + 0.5) * TILE_SIZE, {
            count: 8,
            spread: 0.9,
            colors: ["#25d695", "#2dd4bf", "#8b7bff"],
          });
        }
      }
    }
    if (this.input.mouse.left || this.input.mouse.right) this._lastBlockActionSent = now;
  }

  render() {
    this.renderer.render({
      players: Array.from(this.players.values()),
      localId: this.localId,
      projectiles: this.projectiles,
      items: this.droppedItems,
    });
  }

  _findPlacementTarget(worldX, worldY, localPlayer) {
    if (!this.world || !localPlayer) return null;

    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
    const reach = 6;
    const maxDist = TILE_SIZE * reach;
    let best = null;
    let bestScore = Infinity;

    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const x = tileX + dx;
        const y = tileY + dy;
        if (!this.world.inBounds(x, y)) continue;
        if (this.world.get(x, y) !== BlockTypes.AIR) continue;
        if (!this._canPlaceAt(x, y)) continue;

        const cx = (x + 0.5) * TILE_SIZE;
        const cy = (y + 0.5) * TILE_SIZE;
        const distToPlayer = Math.hypot(localPlayer.x - cx, localPlayer.y - cy);
        if (distToPlayer > maxDist) continue;

        const distToCursor = Math.hypot(worldX - cx, worldY - cy);
        const score = distToCursor + distToPlayer * 0.15;
        if (score < bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }

    return best;
  }

  _applyBlockUpdate(msg) {
    if (!this.world) return;
    const blockType = Number.isFinite(msg.blockType) ? msg.blockType : 0;
    this.world.set(msg.x, msg.y, blockType);
    if (this.renderer.breakDamage && this.renderer.breakDamage.x === msg.x && this.renderer.breakDamage.y === msg.y) {
      this.renderer.setBreakDamage({ x: msg.x, y: msg.y, progress: 0 });
    }
  }

  _hotbarUiItems() {
    return this.inventory.slots.slice(0, this.inventory.hotbarSize).map((slot) => ({
      label: slot ? labelForItem(slot.itemType) || "Item" : "Empty",
      count: slot?.count || 0,
    }));
  }
}
