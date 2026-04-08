import { BlockTypes } from "./worldgen.js";

export const ItemTypes = {
  BLOCK_DIRT: "block:dirt",
  BLOCK_STONE: "block:stone",
  BLOCK_GRASS: "block:grass",
  BLOCK_CHEST: "block:chest",
  BLOCK_WOOD: "block:wood",
  WEAPON_GRENADE: "weapon:grenade",
  WEAPON_SMOKE_GRENADE: "weapon:smoke_grenade",
  WEAPON_BAZOOKA: "weapon:bazooka",
  MATERIAL_COAL: "material:coal",
  MATERIAL_IRON: "material:iron",
  TOOL_PICKAXE: "tool:pickaxe",
  TOOL_PICKAXE_PLUS: "tool:pickaxe_plus",
};

export function defaultHotbar() {
  return [
    ItemTypes.BLOCK_DIRT,
    ItemTypes.BLOCK_STONE,
    ItemTypes.BLOCK_GRASS,
    ItemTypes.TOOL_PICKAXE,
    null,
    null,
    null,
    null,
    null,
  ];
}

export function placeBlockTypeForItem(itemType) {
  switch (itemType) {
    case ItemTypes.BLOCK_DIRT:
      return BlockTypes.DIRT;
    case ItemTypes.BLOCK_STONE:
      return BlockTypes.STONE;
    case ItemTypes.BLOCK_GRASS:
      return BlockTypes.GRASS;
    case ItemTypes.BLOCK_CHEST:
      return BlockTypes.CHEST;
    case ItemTypes.BLOCK_WOOD:
      return BlockTypes.WOOD;
    default:
      return null;
  }
}

export function toolForItem(itemType) {
  switch (itemType) {
    case ItemTypes.TOOL_PICKAXE:
      return "pickaxe";
    case ItemTypes.TOOL_PICKAXE_PLUS:
      return "pickaxe_plus";
    default:
      return "hand";
  }
}
