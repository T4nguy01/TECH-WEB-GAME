import fs from "node:fs";
import path from "node:path";

import { generateWorld } from "../server/worldgen.js";

const root = process.cwd();
const dataDir = path.join(root, "data");
const filePath = path.join(dataDir, "world.json");

fs.mkdirSync(dataDir, { recursive: true });

const world = generateWorld({
  w: 500,
  h: 200,
  seed: Date.now(),
});

const payload = {
  version: 1,
  savedAt: Date.now(),
  world: {
    w: world.w,
    h: world.h,
    seed: world.seed,
    tiles: world.tiles,
    chests: {},
  },
};

fs.writeFileSync(filePath, JSON.stringify(payload));
console.log(`World regenerated: ${filePath}`);
