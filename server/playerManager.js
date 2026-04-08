import { BlockTypes } from "./worldgen.js";
import { placeBlockTypeForItem, toolForItem } from "./items.js";
import {
  addItem,
  cloneInventory,
  createDefaultInventory,
  createStorageInventory,
  canAddItem,
  getSelectedSlot,
  getSlot,
  normalizeInventory,
  normalizePlayerInventory,
  removeItem,
  setSelectedSlot,
  swapSlots,
} from "../client/inventory.js";
import { canCraft, getRecipe } from "../client/crafting.js";
import { weaponByItem } from "../client/weapons.js";
import { DEFAULT_SKIN_ID, normalizeSkinId } from "../client/skins.js";

const TILE = 16;
const GRAVITY = 1800;
const MOVE_ACCEL = 2200;
const MAX_SPEED = 220;
const JUMP_VELOCITY = -520;
const PLAYER_W = 14;
const PLAYER_H = 32;
const MAX_HEALTH = 20;
const ATTACK_REACH = TILE * 3;
const ATTACK_COOLDOWN_MS = 350;
const BASE_ATTACK_DAMAGE = 4;
const CHEST_SIZE = 16;
const WEAPON_MIN_FIRE_INTERVAL_MS = 120;
const GAME_MODE_SURVIVAL = "survival";
const GAME_MODE_CREATIVE = "creative";

const BASE_HIT_DAMAGE = 10; // per breakBlock request

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function blockDurability(type) {
  switch (type) {
    case BlockTypes.GRASS:
      return 20;
    case BlockTypes.DIRT:
      return 25;
    case BlockTypes.STONE:
      return 80;
    case BlockTypes.ORE_COAL:
      return 90;
    case BlockTypes.ORE_IRON:
      return 110;
    case BlockTypes.WOOD:
      return 28;
    case BlockTypes.LEAVES:
      return 12;
    case BlockTypes.CHEST:
      return 60;
    case BlockTypes.BEDROCK:
      return Infinity;
    default:
      return 0;
  }
}

function getTile(world, x, y) {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return BlockTypes.AIR;
  return world.tiles[y * world.w + x];
}

function setTile(world, x, y, type) {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
  world.tiles[y * world.w + x] = type;
  return true;
}

function isSolid(world, x, y) {
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return true;
  return getTile(world, x, y) !== BlockTypes.AIR;
}

function aabbCollides(world, x, y, w, h) {
  const x0 = Math.floor((x - w * 0.5) / TILE);
  const x1 = Math.floor((x + w * 0.5 - 1) / TILE);
  const y0 = Math.floor((y - h) / TILE);
  const y1 = Math.floor((y - 1) / TILE);
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      if (isSolid(world, tx, ty)) return true;
    }
  }
  return false;
}

function rectsOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function blockIntersectsPlayer(bx, by, p) {
  const blockRect = {
    x0: bx * TILE,
    x1: (bx + 1) * TILE,
    y0: by * TILE,
    y1: (by + 1) * TILE,
  };
  const playerRect = {
    x0: p.x - PLAYER_W * 0.5,
    x1: p.x + PLAYER_W * 0.5,
    y0: p.y - PLAYER_H,
    y1: p.y,
  };
  return rectsOverlap(blockRect, playerRect);
}

function miningMultiplier(tool, blockType) {
  // Prototype: only pickaxe is special.
  if (tool === "pickaxe_plus") {
    if (blockType === BlockTypes.STONE || blockType === BlockTypes.ORE_COAL || blockType === BlockTypes.ORE_IRON) {
      return 4.2;
    }
    return 1.4;
  }
  if (tool === "pickaxe") {
    if (blockType === BlockTypes.STONE || blockType === BlockTypes.ORE_COAL || blockType === BlockTypes.ORE_IRON) {
      return 3.0;
    }
    return 1.0;
  }
  // Hand is slow on stone/ores
  if (blockType === BlockTypes.STONE || blockType === BlockTypes.ORE_COAL || blockType === BlockTypes.ORE_IRON) {
    return 0.6;
  }
  return 1.0;
}

function playerAabb(p) {
  return {
    x0: p.x - PLAYER_W * 0.5,
    x1: p.x + PLAYER_W * 0.5,
    y0: p.y - PLAYER_H,
    y1: p.y,
  };
}

function itemTypeForBlockType(blockType) {
  switch (blockType) {
    case BlockTypes.GRASS:
      return "block:grass";
    case BlockTypes.DIRT:
      return "block:dirt";
    case BlockTypes.STONE:
      return "block:stone";
    case BlockTypes.CHEST:
      return "block:chest";
    case BlockTypes.WOOD:
      return "block:wood";
    case BlockTypes.ORE_COAL:
      return "material:coal";
    case BlockTypes.ORE_IRON:
      return "material:iron";
    default:
      return null;
  }
}

function chestKey(x, y) {
  return `${x},${y}`;
}

function normalizeGameMode(mode) {
  return String(mode) === GAME_MODE_CREATIVE ? GAME_MODE_CREATIVE : GAME_MODE_SURVIVAL;
}

function createCreativeInventory(selectedSlot = 0) {
  return normalizePlayerInventory({
    selectedSlot,
    slots: [
      { itemType: "block:dirt", count: 64 },
      { itemType: "block:stone", count: 64 },
      { itemType: "block:grass", count: 64 },
      { itemType: "block:wood", count: 64 },
      { itemType: "block:chest", count: 64 },
      { itemType: "material:coal", count: 64 },
      { itemType: "weapon:smoke_grenade", count: 3 },
      { itemType: "tool:pickaxe", count: 1 },
      { itemType: "tool:pickaxe_plus", count: 1 },
    ],
  });
}

export class PlayerManager {
  constructor({ world, onInventoryChange = null }) {
    this.world = world;
    this.players = new Map();
    this.inputs = new Map();
    this._id = 1;
    this.mining = new Map(); // playerId -> { x, y, type, damage, lastMs }
    this.attacks = new Map(); // playerId -> last attack ms
    this.weaponFire = new Map(); // playerId -> last fire ms
    this.projectiles = new Map();
    this._projectileId = 1;
    this.droppedItems = new Map();
    this._droppedItemId = 1;
    this.events = [];
    this.onInventoryChange = onInventoryChange;
  }

  nextId() {
    return String(this._id);
  }

  addPlayer({ name, userId, skin, inventory, mode }) {
    const id = String(this._id++);
    const spawn = this._findSpawn();
    const inv = normalizePlayerInventory(inventory || createDefaultInventory());
    const gameMode = normalizeGameMode(mode);
    const playerInv = gameMode === GAME_MODE_CREATIVE ? createCreativeInventory(getSelectedSlot(inv)) : inv;
    this.players.set(id, {
      id,
      userId: String(userId || ""),
      name,
      skin: normalizeSkinId(skin || DEFAULT_SKIN_ID),
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      onGround: false,
      health: MAX_HEALTH,
      maxHealth: MAX_HEALTH,
      mode: gameMode,
      savedSurvivalInventory: gameMode === GAME_MODE_CREATIVE ? cloneInventory(inv) : null,
      inventory: playerInv,
    });
    this.inputs.set(id, { left: false, right: false, jump: false, hotbar: getSelectedSlot(playerInv) });
    this.attacks.set(id, 0);
    return id;
  }

  _getChestMap() {
    if (!this.world.chests || typeof this.world.chests !== "object") {
      this.world.chests = {};
    }
    return this.world.chests;
  }

  _getChest(x, y, createIfMissing = false) {
    const key = chestKey(x, y);
    const map = this._getChestMap();
    let chest = map[key];
    if (!chest && createIfMissing) {
      chest = createStorageInventory({ size: CHEST_SIZE });
      map[key] = chest;
    } else if (chest) {
      chest = normalizeInventory({
        size: CHEST_SIZE,
        hotbarSize: 0,
        selectedSlot: 0,
        slots: Array.isArray(chest.slots) ? chest.slots : [],
      });
      map[key] = chest;
    }
    return chest || null;
  }

  _setChest(x, y, inventory) {
    const key = chestKey(x, y);
    const map = this._getChestMap();
    if (!inventory) {
      delete map[key];
      return null;
    }
    map[key] = normalizeInventory({
      size: CHEST_SIZE,
      hotbarSize: 0,
      selectedSlot: 0,
      slots: inventory.slots || [],
    });
    return map[key];
  }

  getChestInventory(x, y) {
    const chest = this._getChest(x, y, false);
    return chest ? cloneInventory(chest) : null;
  }

  removePlayer(id) {
    this.players.delete(id);
    this.inputs.delete(id);
    this.mining.delete(id);
    this.attacks.delete(id);
    this.weaponFire.delete(id);
  }

  getName(id) {
    return this.players.get(id)?.name || "unknown";
  }

  getUserId(id) {
    return String(this.players.get(id)?.userId || "");
  }

  setInput(id, input) {
    const prev = this.inputs.get(id);
    if (!prev) return;
    const hotbar = Number.isFinite(input?.hotbar) ? clamp(input.hotbar, 0, 8) : prev.hotbar;
    this.inputs.set(id, {
      left: Boolean(input?.left),
      right: Boolean(input?.right),
      jump: Boolean(input?.jump),
      hotbar,
    });
    const p = this.players.get(id);
    if (p && p.inventory && p.inventory.selectedSlot !== hotbar) {
      p.inventory.selectedSlot = hotbar;
      this._emitInventoryChange(id);
    }
  }

  getPublicStates() {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      onGround: p.onGround,
      health: p.health,
      maxHealth: p.maxHealth,
      skin: p.skin,
      mode: normalizeGameMode(p.mode),
    }));
  }

  getPublicProjectiles() {
    return Array.from(this.projectiles.values()).map((p) => ({
      id: p.id,
      ownerId: p.ownerId,
      kind: p.kind,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      radius: p.radius,
      color: p.color,
    }));
  }

  getPublicDroppedItems() {
    return Array.from(this.droppedItems.values()).map((item) => ({
      id: item.id,
      x: item.x,
      y: item.y,
      itemType: item.itemType,
      count: item.count,
      bobSeed: item.bobSeed,
      color: item.color,
    }));
  }

  getHotbar(id) {
    const inv = normalizePlayerInventory(this.players.get(id)?.inventory || createDefaultInventory());
    return inv.slots.slice(0, inv.hotbarSize).map((slot) => slot?.itemType || null);
  }

  getInventory(id) {
    const inv = normalizePlayerInventory(this.players.get(id)?.inventory || createDefaultInventory());
    return cloneInventory(inv);
  }

  _emitInventoryChange(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.onInventoryChange?.(p.userId, p.inventory, normalizeGameMode(p.mode));
  }

  _selectedItem(id) {
    const input = this.inputs.get(id);
    const slot = input ? clamp(input.hotbar, 0, 8) : 0;
    const inv = normalizePlayerInventory(this.players.get(id)?.inventory || createDefaultInventory());
    return getSlot(inv, slot)?.itemType || null;
  }

  _selectedTool(id) {
    return toolForItem(this._selectedItem(id));
  }

  _selectedPlaceType(id) {
    return placeBlockTypeForItem(this._selectedItem(id));
  }

  _selectedWeapon(id) {
    return weaponByItem(this._selectedItem(id));
  }

  addDroppedItem({ x, y, itemType, count, ownerId = null }) {
    if (!itemType || !Number.isFinite(count) || count <= 0) return null;
    const drop = {
      id: String(this._droppedItemId++),
      ownerId: ownerId != null ? String(ownerId) : null,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      itemType: String(itemType),
      count: Math.max(1, Math.floor(count)),
      bobSeed: Math.random() * Math.PI * 2,
      pickupDelayUntil: Date.now() + 250,
      color: "#ffffff",
    };
    this.droppedItems.set(drop.id, drop);
    this._queueDroppedItem(drop);
    return drop;
  }

  dropInventoryItem(id, slotIndex, amount = null) {
    const p = this.players.get(id);
    if (!p) return null;

    const inv = normalizePlayerInventory(p.inventory);
    const idx = Number(slotIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= inv.slots.length) return null;
    const slot = inv.slots[idx];
    if (!slot || slot.count <= 0) return null;

    const dropCount = Number.isFinite(amount) ? Math.max(1, Math.min(slot.count, Math.floor(amount))) : slot.count;
    const itemType = slot.itemType;
    if (dropCount >= slot.count) {
      inv.slots[idx] = null;
    } else {
      slot.count -= dropCount;
    }

    p.inventory = inv;
    this._emitInventoryChange(id);

    return this.addDroppedItem({
      x: p.x + 6,
      y: p.y - 14,
      itemType,
      count: dropCount,
      ownerId: id,
    });
  }

  _collectDroppedItems() {
    const now = Date.now();
    for (const drop of Array.from(this.droppedItems.values())) {
      if (now < drop.pickupDelayUntil) continue;

      for (const p of this.players.values()) {
        const dist = Math.hypot(p.x - drop.x, p.y - drop.y);
        if (dist > 22) continue;

        const inv = normalizePlayerInventory(p.inventory);
        const remaining = addItem(inv, drop.itemType, drop.count, { preferHotbar: false });
        const taken = drop.count - remaining;
        if (taken <= 0) continue;

        p.inventory = inv;
        this._emitInventoryChange(p.id);

        if (remaining <= 0) {
          this.droppedItems.delete(drop.id);
        } else {
          drop.count = remaining;
        }
        break;
      }
    }
  }

  setSelectedSlot(id, slot) {
    const p = this.players.get(id);
    if (!p) return false;
    const inv = normalizePlayerInventory(p.inventory);
    setSelectedSlot(inv, slot);
    const current = this.inputs.get(id);
    if (current) {
      current.hotbar = getSelectedSlot(inv);
    }
    p.inventory = inv;
    this._emitInventoryChange(id);
    return true;
  }

  _respawnPlayer(p) {
    const spawn = this._findSpawn();
    p.x = spawn.x;
    p.y = spawn.y;
    p.vx = 0;
    p.vy = 0;
    p.onGround = false;
    p.health = MAX_HEALTH;
  }

  _queueBlockUpdate(x, y, blockType) {
    this.events.push({ type: "blockUpdate", x, y, blockType });
  }

  _queueExplosion(explosion) {
    if (!explosion?.type) {
      this.events.push({ type: "explosion", ...explosion });
      return;
    }
    this.events.push({ ...explosion });
  }

  _queueDroppedItem(item) {
    this.events.push({ type: "drop", ...item });
  }

  setSkinByUserId(userId, skinId) {
    const skin = normalizeSkinId(skinId);
    let updated = false;
    for (const p of this.players.values()) {
      if (String(p.userId) !== String(userId)) continue;
      p.skin = skin;
      updated = true;
    }
    return updated;
  }

  setModeByUserId(userId, mode) {
    const nextMode = normalizeGameMode(mode);
    let updated = false;
    for (const p of this.players.values()) {
      if (String(p.userId) !== String(userId)) continue;
      const prevMode = normalizeGameMode(p.mode);
      if (prevMode === nextMode) continue;
      const selectedSlot = getSelectedSlot(normalizePlayerInventory(p.inventory));
      if (nextMode === GAME_MODE_CREATIVE) {
        p.savedSurvivalInventory = cloneInventory(normalizePlayerInventory(p.inventory));
        p.inventory = createCreativeInventory(selectedSlot);
      } else if (p.savedSurvivalInventory) {
        p.inventory = cloneInventory(p.savedSurvivalInventory);
        p.savedSurvivalInventory = null;
      }
      p.mode = nextMode;
      const inv = normalizePlayerInventory(p.inventory);
      p.inventory = inv;
      const input = this.inputs.get(p.id);
      if (input) input.hotbar = getSelectedSlot(inv);
      this._emitInventoryChange(p.id);
      updated = true;
    }
    return updated;
  }

  getMode(id) {
    return normalizeGameMode(this.players.get(id)?.mode);
  }

  _isCreative(id) {
    return this.getMode(id) === GAME_MODE_CREATIVE;
  }

  moveInventorySlot(id, from, to) {
    const p = this.players.get(id);
    if (!p) return false;
    const inv = normalizePlayerInventory(p.inventory);
    const src = Number(from);
    const dst = Number(to);
    if (!Number.isFinite(src) || !Number.isFinite(dst)) return false;
    if (src < 0 || dst < 0 || src >= inv.slots.length || dst >= inv.slots.length) return false;
    swapSlots(inv, src, dst);
    p.inventory = inv;
    this._emitInventoryChange(id);
    return true;
  }

  tryCraft(id, recipeId) {
    const p = this.players.get(id);
    if (!p) return null;
    const recipe = getRecipe(recipeId);
    if (!recipe) return null;
    const inv = normalizePlayerInventory(p.inventory);
    if (!canCraft(recipe, inv)) return null;

    const draft = cloneInventory(inv);
    for (const input of recipe.inputs) {
      const removed = removeItem(draft, input.itemType, input.count);
      if (removed < input.count) return null;
    }
    if (!canAddItem(draft, recipe.output.itemType, recipe.output.count, { preferHotbar: true })) return null;

    p.inventory = normalizePlayerInventory(draft);
    addItem(p.inventory, recipe.output.itemType, recipe.output.count, { preferHotbar: true });
    this._emitInventoryChange(id);
    return { recipeId, inventory: cloneInventory(p.inventory) };
  }

  tryFireWeapon(id, targetX, targetY) {
    const p = this.players.get(id);
    if (!p) return null;

    const weapon = this._selectedWeapon(id);
    if (!weapon) return null;

    const now = Date.now();
    const lastFire = this.weaponFire.get(id) || 0;
    if (now - lastFire < Math.max(WEAPON_MIN_FIRE_INTERVAL_MS, weapon.cooldownMs || 0)) return null;

    const selected = this.inputs.get(id)?.hotbar ?? 0;
    const inv = normalizePlayerInventory(p.inventory);
    const slot = inv.slots[selected];
    if (!slot || slot.itemType !== weapon.itemType || slot.count <= 0) return null;

    const sx = Number(targetX);
    const sy = Number(targetY);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;

    const originX = p.x + Math.sign(sx - p.x || 1) * 10;
    const originY = p.y - PLAYER_H * 0.55;
    const dx = sx - originX;
    const dy = sy - originY;
    const len = Math.hypot(dx, dy) || 1;
    const dirX = dx / len;
    const dirY = dy / len;

    slot.count -= 1;
    if (slot.count <= 0) inv.slots[selected] = null;
    p.inventory = inv;

    const projectile = {
      id: String(this._projectileId++),
      ownerId: id,
      kind: weapon.itemType,
      effect: weapon.effect || null,
      destructive: weapon.destructive !== false,
      x: originX,
      y: originY,
      vx: dirX * weapon.speed,
      vy: dirY * weapon.speed,
      radius: 4,
      damage: weapon.damage,
      splashRadius: weapon.splashRadius,
      gravity: weapon.gravity,
      bornAt: now,
      fuseMs: weapon.fuseMs || 0,
      ttlMs: 5000,
      color: weapon.color,
    };

    this.projectiles.set(projectile.id, projectile);
    this.weaponFire.set(id, now);
    this._emitInventoryChange(id);
    return projectile;
  }

  _explodeProjectile(projectile) {
    if (!projectile || !this.projectiles.has(projectile.id)) return null;
    this.projectiles.delete(projectile.id);

    if (projectile.effect === "smoke") {
      return {
        type: "smoke",
        x: projectile.x,
        y: projectile.y,
        radius: 112,
        durationMs: 5600,
        density: 18,
        opacity: 0.62,
        color: projectile.color || "rgba(170,170,180,0.62)",
      };
    }

    if (projectile.effect === "stink") {
      return {
        type: "smoke",
        x: projectile.x,
        y: projectile.y,
        radius: 104,
        durationMs: 5600,
        color: projectile.color || "rgba(124,199,96,0.28)",
      };
    }

    if (projectile.effect === "confetti") {
      return {
        type: "confetti",
        x: projectile.x,
        y: projectile.y,
        count: 34,
        spread: 1.2,
        colors: ["#ff4d6d", "#ffbd49", "#2dd4bf", "#8b7bff", "#ffffff"],
      };
    }

    if (projectile.effect === "party") {
      return {
        type: "burst",
        x: projectile.x,
        y: projectile.y,
        radius: 68,
        color: projectile.color || "#8b7bff",
        sparkles: 28,
      };
    }

    if (projectile.effect === "slime") {
      return {
        type: "smoke",
        x: projectile.x,
        y: projectile.y,
        radius: 120,
        durationMs: 5200,
        color: "rgba(112, 230, 107, 0.32)",
      };
    }

    if (projectile.effect === "toilet") {
      return {
        type: "confetti",
        x: projectile.x,
        y: projectile.y,
        count: 42,
        spread: 1.35,
        colors: ["#ffffff", "#f7f3e8", "#e8e2d2", "#d7d0c2"],
      };
    }

    if (projectile.effect === "chicken") {
      return {
        type: "burst",
        x: projectile.x,
        y: projectile.y,
        radius: 58,
        color: "#ffd84d",
        sparkles: 22,
      };
    }

    if (projectile.effect === "disco") {
      return {
        type: "burst",
        x: projectile.x,
        y: projectile.y,
        radius: 86,
        color: "#8b7bff",
        sparkles: 40,
      };
    }

    if (projectile.destructive === false) {
      return {
        type: "burst",
        x: projectile.x,
        y: projectile.y,
        radius: 44,
        color: projectile.color || "rgba(255,255,255,0.9)",
        sparkles: 16,
      };
    }

    const radius = projectile.splashRadius || 48;
    const cx = projectile.x;
    const cy = projectile.y;

    const x0 = Math.max(0, Math.floor((cx - radius) / TILE));
    const x1 = Math.min(this.world.w - 1, Math.floor((cx + radius) / TILE));
    const y0 = Math.max(0, Math.floor((cy - radius) / TILE));
    const y1 = Math.min(this.world.h - 1, Math.floor((cy + radius) / TILE));
    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        const blockCx = (tx + 0.5) * TILE;
        const blockCy = (ty + 0.5) * TILE;
        if (Math.hypot(blockCx - cx, blockCy - cy) > radius) continue;
        const type = getTile(this.world, tx, ty);
        if (type === BlockTypes.AIR || type === BlockTypes.BEDROCK || type === BlockTypes.CHEST) continue;
        setTile(this.world, tx, ty, BlockTypes.AIR);
        this._queueBlockUpdate(tx, ty, BlockTypes.AIR);
      }
    }

    const events = [];
    for (const p of this.players.values()) {
      const px = p.x;
      const py = p.y - PLAYER_H * 0.5;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      const damage = Math.max(0, Math.round(projectile.damage * falloff));
      if (damage <= 0) continue;
      p.health = clamp(p.health - damage, 0, p.maxHealth || MAX_HEALTH);
      const push = 260 * falloff;
      const nx = (px - cx) / (dist || 1);
      const ny = (py - cy) / (dist || 1);
      p.vx += nx * push;
      p.vy += ny * push * 0.35 - 90 * falloff;
      if (p.health <= 0) this._respawnPlayer(p);
      events.push({ id: p.id, damage });
    }

    return {
      x: cx,
      y: cy,
      radius,
      color: projectile.color,
      hits: events,
    };
  }

  _tickProjectiles(dt) {
    const now = Date.now();
    const toExplode = [];
    for (const projectile of this.projectiles.values()) {
      const age = now - projectile.bornAt;
      if (projectile.fuseMs > 0 && age >= projectile.fuseMs) {
        toExplode.push(projectile);
        continue;
      }

      const stepCount = Math.max(1, Math.ceil((Math.abs(projectile.vx) + Math.abs(projectile.vy)) * dt / 48));
      const stepDt = dt / stepCount;
      let exploded = false;
      for (let i = 0; i < stepCount; i += 1) {
        projectile.vy += projectile.gravity * stepDt;
        projectile.x += projectile.vx * stepDt;
        projectile.y += projectile.vy * stepDt;

        if (projectile.x < 0 || projectile.y < 0 || projectile.x >= this.world.w * TILE || projectile.y >= this.world.h * TILE) {
          exploded = true;
          break;
        }

        const tx = Math.floor(projectile.x / TILE);
        const ty = Math.floor(projectile.y / TILE);
        if (getTile(this.world, tx, ty) !== BlockTypes.AIR) {
          exploded = true;
          break;
        }
      }

      if (exploded || age >= projectile.ttlMs) {
        toExplode.push(projectile);
      }
    }

    const explosions = [];
    for (const projectile of toExplode) {
      const explosion = this._explodeProjectile(projectile);
      if (explosion) {
        explosions.push(explosion);
        this._queueExplosion(explosion);
      }
    }
    return explosions;
  }

  tick(dt) {
    for (const p of this.players.values()) {
      const input = this.inputs.get(p.id);
      if (!input) continue;

      const dir = (input.right ? 1 : 0) + (input.left ? -1 : 0);
      p.vx += dir * MOVE_ACCEL * dt;
      p.vx *= input.left || input.right ? 0.92 : 0.86;
      p.vx = clamp(p.vx, -MAX_SPEED, MAX_SPEED);

      p.vy += GRAVITY * dt;

      if (input.jump && p.onGround) {
        p.vy = JUMP_VELOCITY;
        p.onGround = false;
      }

      const nx = p.x + p.vx * dt;
      if (aabbCollides(this.world, nx, p.y, PLAYER_W, PLAYER_H)) {
        const step = Math.sign(p.vx) * 1;
        while (!aabbCollides(this.world, p.x + step, p.y, PLAYER_W, PLAYER_H)) p.x += step;
        p.vx = 0;
      } else {
        p.x = nx;
      }

      const ny = p.y + p.vy * dt;
      if (aabbCollides(this.world, p.x, ny, PLAYER_W, PLAYER_H)) {
        const step = Math.sign(p.vy) * 1;
        while (!aabbCollides(this.world, p.x, p.y + step, PLAYER_W, PLAYER_H)) p.y += step;
        if (p.vy > 0) p.onGround = true;
        p.vy = 0;
      } else {
        p.y = ny;
        p.onGround = false;
      }

      p.x = clamp(p.x, 0, this.world.w * TILE);
      p.y = clamp(p.y, 0, this.world.h * TILE);

      if (p.health <= 0) {
        this._respawnPlayer(p);
      }
    }

    this._collectDroppedItems();
    this._tickProjectiles(dt);
    const events = this.events;
    this.events = [];
    return events;
  }

  _findSpawn() {
    const w = this.world.w;
    const h = this.world.h;
    const x = Math.floor(w / 2);
    let y = 0;
    for (let i = 0; i < h; i += 1) {
      if (getTile(this.world, x, i) !== BlockTypes.AIR) {
        y = i - 2;
        break;
      }
    }
    return { x: (x + 0.5) * TILE, y: (y + 1) * TILE };
  }

  _withinReach(id, bx, by) {
    const p = this.players.get(id);
    if (!p) return false;
    const cx = (bx + 0.5) * TILE;
    const cy = (by + 0.5) * TILE;
    return Math.hypot(p.x - cx, p.y - cy) <= TILE * 6;
  }

  _breakBlockAt(id, bx, by) {
    const existing = getTile(this.world, bx, by);
    if (existing === BlockTypes.AIR || existing === BlockTypes.BEDROCK) return null;

    const player = this.players.get(id);
    if (existing === BlockTypes.CHEST) {
      const chest = this._getChest(bx, by, false);
      if (chest) {
        for (const slot of chest.slots || []) {
          if (!slot) continue;
          if (player) addItem(player.inventory, slot.itemType, slot.count, { preferHotbar: false });
        }
      }
      const map = this._getChestMap();
      delete map[chestKey(bx, by)];
    }

    setTile(this.world, bx, by, BlockTypes.AIR);
    const itemType = itemTypeForBlockType(existing);
    if (player && itemType) addItem(player.inventory, itemType, 1);
    if (player) this._emitInventoryChange(id);
    return { x: bx, y: by, blockType: BlockTypes.AIR };
  }

  tryPlaceBlock(id, bx, by, requestedBlockType) {
    if (!this._withinReach(id, bx, by)) return false;
    if (getTile(this.world, bx, by) !== BlockTypes.AIR) return false;
    const placeType = this._selectedPlaceType(id);
    if (placeType == null) return false;
    if (Number(requestedBlockType) !== Number(placeType)) return false;
    if (placeType === BlockTypes.AIR || placeType === BlockTypes.BEDROCK) return false;
    const player = this.players.get(id);
    if (!player) return false;
    const selected = this.inputs.get(id)?.hotbar ?? 0;
    const inv = normalizePlayerInventory(player.inventory);
    const slot = inv.slots[selected];
    if (!slot || slot.count <= 0) return false;
    if (placeBlockTypeForItem(slot.itemType) !== placeType) return false;
    for (const other of this.players.values()) {
      if (blockIntersectsPlayer(bx, by, other)) return false;
    }
    if (!setTile(this.world, bx, by, placeType)) return false;
    if (placeType === BlockTypes.CHEST) {
      this._getChest(bx, by, true);
    }
    if (!this._isCreative(id)) {
      slot.count -= 1;
      if (slot.count <= 0) inv.slots[selected] = null;
    }
    player.inventory = inv;
    this._emitInventoryChange(id);
    return true;
  }

  tryMineBlock(id, bx, by) {
    if (!this._withinReach(id, bx, by)) return null;
    const existing = getTile(this.world, bx, by);
    if (existing === BlockTypes.AIR || existing === BlockTypes.BEDROCK) return null;
    const dur = blockDurability(existing);
    if (!Number.isFinite(dur) || dur <= 0) return null;

    if (this._isCreative(id)) {
      setTile(this.world, bx, by, BlockTypes.AIR);
      const player = this.players.get(id);
      if (player && existing === BlockTypes.CHEST) {
        const map = this._getChestMap();
        delete map[chestKey(bx, by)];
      }
      return { broken: true, type: BlockTypes.AIR, progress: 0 };
    }

    const now = Date.now();
    const tool = this._selectedTool(id);
    const hitDamage = BASE_HIT_DAMAGE * miningMultiplier(tool, existing);
    const m = this.mining.get(id);
    if (!m || m.x !== bx || m.y !== by || m.type !== existing || now - m.lastMs > 1200) {
      this.mining.set(id, { x: bx, y: by, type: existing, damage: hitDamage, lastMs: now });
    } else {
      m.damage += hitDamage;
      m.lastMs = now;
    }

    const cur = this.mining.get(id);
    const progress = clamp(cur.damage / dur, 0, 1);
    if (progress >= 1) {
      this.mining.delete(id);
      const broken = [];
      const primary = this._breakBlockAt(id, bx, by);
      if (primary) broken.push(primary);

      const tool = this._selectedTool(id);
      if (tool === "pickaxe" || tool === "pickaxe_plus") {
        const extraY = by - 1;
        if (this._withinReach(id, bx, extraY)) {
          const extra = this._breakBlockAt(id, bx, extraY);
          if (extra) broken.push(extra);
        }
      }
      return { broken: true, progress: 0, updates: broken };
    }

    return { broken: false, type: existing, progress };
  }

  openChest(id, bx, by) {
    if (!this._withinReach(id, bx, by)) return null;
    if (getTile(this.world, bx, by) !== BlockTypes.CHEST) return null;
    const chest = this._getChest(bx, by, true);
    return {
      x: bx,
      y: by,
      inventory: cloneInventory(chest),
    };
  }

  transferInventoryItem(id, payload = {}) {
    const p = this.players.get(id);
    if (!p) return false;

    const from = payload.from || {};
    const to = payload.to || {};
    const fromScope = String(from.scope || "player");
    const toScope = String(to.scope || "player");
    const fromSlot = Number(from.slot);
    const toSlot = Number(to.slot);
    if (!Number.isFinite(fromSlot) || !Number.isFinite(toSlot)) return false;

    const playerInv = p.inventory;
    const fromChest = fromScope === "chest" ? this._getChest(Number(from.x), Number(from.y), false) : null;
    const toChest = toScope === "chest" ? this._getChest(Number(to.x), Number(to.y), false) : null;
    const sourceInv = fromScope === "chest" ? fromChest : playerInv;
    const targetInv = toScope === "chest" ? toChest : playerInv;
    if (!sourceInv || !targetInv) return false;

    if (fromScope === "chest") {
      if (fromChest == null || getTile(this.world, Number(from.x), Number(from.y)) !== BlockTypes.CHEST) return false;
      if (!this._withinReach(id, Number(from.x), Number(from.y))) return false;
    }
    if (toScope === "chest") {
      if (toChest == null || getTile(this.world, Number(to.x), Number(to.y)) !== BlockTypes.CHEST) return false;
      if (!this._withinReach(id, Number(to.x), Number(to.y))) return false;
    }

    if (fromSlot < 0 || toSlot < 0 || fromSlot >= sourceInv.slots.length || toSlot >= targetInv.slots.length) return false;
    if (sourceInv === targetInv && fromSlot === toSlot) {
      return {
        inventory: cloneInventory(playerInv),
        chest: fromChest ? cloneInventory(fromChest) : toChest ? cloneInventory(toChest) : null,
        chestPos: fromChest ? { x: Number(from.x), y: Number(from.y) } : toChest ? { x: Number(to.x), y: Number(to.y) } : null,
      };
    }

    [sourceInv.slots[fromSlot], targetInv.slots[toSlot]] = [targetInv.slots[toSlot], sourceInv.slots[fromSlot]];

    this._emitInventoryChange(id);
    return {
      inventory: cloneInventory(playerInv),
      chest: fromChest ? cloneInventory(fromChest) : toChest ? cloneInventory(toChest) : null,
      chestPos: fromChest ? { x: Number(from.x), y: Number(from.y) } : toChest ? { x: Number(to.x), y: Number(to.y) } : null,
    };
  }

  tryAttackPlayer(attackerId, targetId) {
    if (attackerId === targetId) return null;
    const attacker = this.players.get(attackerId);
    const target = this.players.get(targetId);
    if (!attacker || !target) return null;
    if (attacker.health <= 0 || target.health <= 0) return null;

    const now = Date.now();
    const lastAttack = this.attacks.get(attackerId) || 0;
    if (now - lastAttack < ATTACK_COOLDOWN_MS) return null;

    const attackerCx = attacker.x;
    const attackerCy = attacker.y - PLAYER_H * 0.5;
    const targetBox = playerAabb(target);
    const targetCx = (targetBox.x0 + targetBox.x1) * 0.5;
    const targetCy = (targetBox.y0 + targetBox.y1) * 0.5;
    if (Math.hypot(attackerCx - targetCx, attackerCy - targetCy) > ATTACK_REACH) return null;

    this.attacks.set(attackerId, now);

    const selectedTool = this._selectedTool(attackerId);
    const damage = selectedTool === "pickaxe_plus" ? BASE_ATTACK_DAMAGE + 2 : selectedTool === "pickaxe" ? BASE_ATTACK_DAMAGE + 1 : BASE_ATTACK_DAMAGE;
    target.health = clamp(target.health - damage, 0, target.maxHealth || MAX_HEALTH);

    const defeated = target.health <= 0;
    if (defeated) {
      this._respawnPlayer(target);
    }

    return {
      attackerId,
      targetId,
      damage,
      defeated,
      targetHealth: target.health,
      targetMaxHealth: target.maxHealth || MAX_HEALTH,
    };
  }
}
