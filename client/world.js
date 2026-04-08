export const TILE_SIZE = 16;

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

export class World {
  constructor({ w, h, tiles }) {
    this.w = w;
    this.h = h;
    this.tiles = tiles;
  }

  static fromRLE({ w, h, rle }) {
    const tiles = new Uint8Array(w * h);
    let idx = 0;
    for (const [count, type] of rle) {
      tiles.fill(type, idx, idx + count);
      idx += count;
    }
    return new World({ w, h, tiles });
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  _i(x, y) {
    return y * this.w + x;
  }

  get(x, y) {
    if (!this.inBounds(x, y)) return BlockTypes.AIR;
    return this.tiles[this._i(x, y)];
  }

  set(x, y, type) {
    if (!this.inBounds(x, y)) return;
    this.tiles[this._i(x, y)] = type;
  }
}
