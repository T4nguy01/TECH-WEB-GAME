import fs from "node:fs";
import path from "node:path";
import { normalizeInventory } from "../client/inventory.js";

export class SaveSystem {
  constructor({ dataDir, fileName }) {
    this.filePath = path.join(dataDir, fileName);
    this._state = null;
    this._timer = null;
  }

  setState(state) {
    this._state = state;
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const world = parsed?.world;
      if (!world || !Number.isFinite(world.w) || !Number.isFinite(world.h) || !Array.isArray(world.tiles)) return null;
      const w = Math.floor(world.w);
      const h = Math.floor(world.h);
      if (w < 1 || h < 1 || w > 2000 || h > 2000) return null;
      if (w * h > 4_000_000) return null;
      if (world.tiles.length !== w * h) return null;
      const chests = {};
      if (world.chests && typeof world.chests === "object") {
        for (const [key, chest] of Object.entries(world.chests)) {
          if (!chest || typeof chest !== "object") continue;
          chests[key] = normalizeInventory({
            size: 16,
            hotbarSize: 0,
            selectedSlot: 0,
            slots: Array.isArray(chest.slots) ? chest.slots : [],
          });
        }
      }
      return {
        world: {
          w,
          h,
          seed: Number.isFinite(world.seed) ? world.seed : 0,
          tiles: world.tiles,
          chests,
        },
      };
    } catch {
      return null;
    }
  }

  saveNow() {
    if (!this._state) return;
    const { world } = this._state;
    const payload = {
      version: 1,
      savedAt: Date.now(),
      world: {
        w: world.w,
        h: world.h,
        seed: world.seed,
        tiles: world.tiles,
        chests: world.chests || {},
      },
    };
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, this.filePath);
  }

  startAutosave(ms) {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.saveNow(), ms);
  }
}
