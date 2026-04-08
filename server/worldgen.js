import crypto from "node:crypto";

export const BlockTypes = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  BEDROCK: 4,
  ORE_COAL: 5,
  ORE_IRON: 6,
  CHEST: 7,
  WOOD: 8,
  LEAVES: 9,
};

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  if (typeof seed === "number") return seed >>> 0;
  const h = crypto.createHash("sha256").update(String(seed)).digest();
  return h.readUInt32LE(0);
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function randAt(baseSeed, i) {
  // Deterministic pseudo-random per integer i, mixed with baseSeed.
  let x = (i * 374761393) ^ baseSeed;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 1274126177) >>> 0;
  return (x & 0xffff) / 0xffff;
}

function valueNoise1D(baseSeed, x) {
  const xi = Math.floor(x);
  const xf = x - xi;
  const a = randAt(baseSeed, xi);
  const b = randAt(baseSeed, xi + 1);
  return a + (b - a) * smoothstep(xf);
}

function fbm1D(baseSeed, x, octaves = 5) {
  let value = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise1D(baseSeed + i * 1013, x * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return value / norm;
}

export function generateWorld({ w, h, seed }) {
  const s = hashSeed(seed);
  const rand = mulberry32(s);
  const tiles = new Uint8Array(w * h);

  const surface = new Int32Array(w);
  const base = Math.floor(h * 0.45);
  for (let x = 0; x < w; x += 1) {
    const n = fbm1D(s, x / 28, 5);
    const height = base + Math.floor((n - 0.5) * 28);
    surface[x] = Math.max(10, Math.min(h - 20, height));
  }

  for (let x = 0; x < w; x += 1) {
    const ySurface = surface[x];
    for (let y = 0; y < h; y += 1) {
      const i = y * w + x;
      if (y < ySurface) {
        tiles[i] = BlockTypes.AIR;
        continue;
      }
      if (y === h - 1) {
        tiles[i] = BlockTypes.BEDROCK;
        continue;
      }

      const depth = y - ySurface;
      if (depth === 0) tiles[i] = BlockTypes.GRASS;
      else if (depth < 5) tiles[i] = BlockTypes.DIRT;
      else tiles[i] = BlockTypes.STONE;
    }
  }

  for (let x = 0; x < w; x += 1) {
    for (let y = Math.floor(h * 0.5); y < h - 2; y += 1) {
      const i = y * w + x;
      if (tiles[i] !== BlockTypes.STONE) continue;
      const r = rand();
      if (r < 0.006) tiles[i] = BlockTypes.ORE_COAL;
      else if (r < 0.0085 && y > h * 0.65) tiles[i] = BlockTypes.ORE_IRON;
    }
  }

  for (let x = 3; x < w - 3; x += 1) {
    if (rand() > 0.055) continue;
    const yGround = surface[x];
    if (yGround <= 4 || yGround >= h - 6) continue;

    let treeBase = yGround - 1;
    if (tiles[treeBase * w + x] !== BlockTypes.AIR) continue;

    const trunkH = 4 + Math.floor(rand() * 3);
    const canopyY = treeBase - trunkH;
    if (canopyY < 3) continue;

    let blocked = false;
    for (let ty = treeBase; ty > canopyY - 2; ty -= 1) {
      if (tiles[ty * w + x] !== BlockTypes.AIR) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    for (let t = 0; t < trunkH; t += 1) {
      tiles[(treeBase - t) * w + x] = BlockTypes.WOOD;
    }

    const topY = treeBase - trunkH + 1;
    for (let dy = -2; dy <= 1; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist > 3) continue;
        const px = x + dx;
        const py = topY + dy;
        if (px < 0 || py < 0 || px >= w || py >= h - 1) continue;
        const idx = py * w + px;
        if (tiles[idx] === BlockTypes.AIR) {
          tiles[idx] = BlockTypes.LEAVES;
        }
      }
    }
    if (rand() > 0.5) {
      const branchY = treeBase - Math.max(1, Math.floor(trunkH * 0.5));
      const branchX = x + (rand() > 0.5 ? 1 : -1);
      if (branchX > 0 && branchX < w - 1 && branchY > 1) {
        tiles[branchY * w + branchX] = BlockTypes.WOOD;
      }
    }
  }

  return { w, h, seed: s, tiles: Array.from(tiles), chests: {} };
}

export function encodeWorldRLE(world) {
  const { w, h } = world;
  const tiles = world.tiles;
  const rle = [];
  let runType = tiles[0] ?? 0;
  let runLen = 1;
  for (let i = 1; i < tiles.length; i += 1) {
    const t = tiles[i];
    if (t === runType && runLen < 65535) {
      runLen += 1;
    } else {
      rle.push([runLen, runType]);
      runType = t;
      runLen = 1;
    }
  }
  rle.push([runLen, runType]);
  return { w, h, rle };
}
