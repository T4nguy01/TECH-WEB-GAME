import { BlockTypes } from "./world.js";

export const ItemTypes = {
  BLOCK_DIRT: "block:dirt",
  BLOCK_STONE: "block:stone",
  BLOCK_GRASS: "block:grass",
  BLOCK_CHEST: "block:chest",
  BLOCK_WOOD: "block:wood",
  WEAPON_GRENADE: "weapon:grenade",
  WEAPON_SMOKE_GRENADE: "weapon:smoke_grenade",
  WEAPON_CONFETTI_CANNON: "weapon:confetti_cannon",
  WEAPON_STINK_BOMB: "weapon:stink_bomb",
  WEAPON_BANANA_BOMB: "weapon:banana_bomb",
  WEAPON_PARTY_ROCKET: "weapon:party_rocket",
  WEAPON_BAZOOKA: "weapon:bazooka",
  WEAPON_SLIME_BOMB: "weapon:slime_bomb",
  WEAPON_TOILET_PAPER: "weapon:toilet_paper",
  WEAPON_RUBBER_CHICKEN: "weapon:rubber_chicken",
  WEAPON_DISCO_GLOBE: "weapon:disco_globe",
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

export function labelForItem(itemType) {
  switch (itemType) {
    case ItemTypes.BLOCK_DIRT:
      return "TERRE";
    case ItemTypes.BLOCK_STONE:
      return "PIERRE";
    case ItemTypes.BLOCK_GRASS:
      return "HERBE";
    case ItemTypes.BLOCK_CHEST:
      return "COFFRE";
    case ItemTypes.BLOCK_WOOD:
      return "BOIS";
    case ItemTypes.WEAPON_GRENADE:
      return "GRN";
    case ItemTypes.WEAPON_SMOKE_GRENADE:
      return "FUM";
    case ItemTypes.WEAPON_CONFETTI_CANNON:
      return "CON";
    case ItemTypes.WEAPON_STINK_BOMB:
      return "PUE";
    case ItemTypes.WEAPON_BANANA_BOMB:
      return "BAN";
    case ItemTypes.WEAPON_PARTY_ROCKET:
      return "PTY";
    case ItemTypes.WEAPON_BAZOOKA:
      return "BZO";
    case ItemTypes.WEAPON_SLIME_BOMB:
      return "SLM";
    case ItemTypes.WEAPON_TOILET_PAPER:
      return "WC";
    case ItemTypes.WEAPON_RUBBER_CHICKEN:
      return "CHK";
    case ItemTypes.WEAPON_DISCO_GLOBE:
      return "DSC";
    case ItemTypes.TOOL_PICKAXE:
    case ItemTypes.TOOL_PICKAXE_PLUS:
      return "PIOC";
    case ItemTypes.MATERIAL_COAL:
      return "CHARB";
    case ItemTypes.MATERIAL_IRON:
      return "FER";
    default:
      return "";
  }
}

export function nameForItem(itemType) {
  switch (itemType) {
    case ItemTypes.BLOCK_DIRT:
      return "Bloc de terre";
    case ItemTypes.BLOCK_STONE:
      return "Bloc de pierre";
    case ItemTypes.BLOCK_GRASS:
      return "Bloc d'herbe";
    case ItemTypes.BLOCK_CHEST:
      return "Coffre";
    case ItemTypes.BLOCK_WOOD:
      return "Bloc de bois";
    case ItemTypes.WEAPON_GRENADE:
      return "Grenade";
    case ItemTypes.WEAPON_SMOKE_GRENADE:
      return "Fumigène";
    case ItemTypes.WEAPON_CONFETTI_CANNON:
      return "Canon à confettis";
    case ItemTypes.WEAPON_STINK_BOMB:
      return "Bombe puante";
    case ItemTypes.WEAPON_BANANA_BOMB:
      return "Bombe banane";
    case ItemTypes.WEAPON_PARTY_ROCKET:
      return "Roquette de fête";
    case ItemTypes.WEAPON_BAZOOKA:
      return "Bazooka";
    case ItemTypes.WEAPON_SLIME_BOMB:
      return "Bombe slime";
    case ItemTypes.WEAPON_TOILET_PAPER:
      return "Papier toilette explosif";
    case ItemTypes.WEAPON_RUBBER_CHICKEN:
      return "Poulet caoutchouc";
    case ItemTypes.WEAPON_DISCO_GLOBE:
      return "Boule disco";
    case ItemTypes.MATERIAL_COAL:
      return "Charbon";
    case ItemTypes.MATERIAL_IRON:
      return "Fer";
    case ItemTypes.TOOL_PICKAXE:
      return "Pioche";
    case ItemTypes.TOOL_PICKAXE_PLUS:
      return "Pioche renforcée";
    default:
      return "Emplacement vide";
  }
}

export function hintForItem(itemType) {
  switch (itemType) {
    case ItemTypes.BLOCK_DIRT:
    case ItemTypes.BLOCK_STONE:
    case ItemTypes.BLOCK_GRASS:
    case ItemTypes.BLOCK_CHEST:
    case ItemTypes.BLOCK_WOOD:
      return "Clic droit pour poser";
    case ItemTypes.WEAPON_GRENADE:
      return "Clic gauche pour lancer une grenade explosive";
    case ItemTypes.WEAPON_SMOKE_GRENADE:
      return "Clic gauche pour lancer un fumigène";
    case ItemTypes.WEAPON_CONFETTI_CANNON:
      return "Clic gauche pour cracher des confettis partout";
    case ItemTypes.WEAPON_STINK_BOMB:
      return "Clic gauche pour étouffer la zone dans une fumée verte";
    case ItemTypes.WEAPON_BANANA_BOMB:
      return "Clic gauche pour faire un gros boom jaune";
    case ItemTypes.WEAPON_PARTY_ROCKET:
      return "Clic gauche pour déclencher une fête au ciel";
    case ItemTypes.WEAPON_BAZOOKA:
      return "Clic gauche pour tirer une roquette";
    case ItemTypes.WEAPON_SLIME_BOMB:
      return "Clic gauche pour jeter une boule de slime";
    case ItemTypes.WEAPON_TOILET_PAPER:
      return "Clic gauche pour asperger la zone de papier toilette";
    case ItemTypes.WEAPON_RUBBER_CHICKEN:
      return "Clic gauche pour balancer un poulet très sérieux";
    case ItemTypes.WEAPON_DISCO_GLOBE:
      return "Clic gauche pour allumer une boule disco";
    case ItemTypes.TOOL_PICKAXE:
      return "Mine la pierre plus vite et touche les joueurs";
    case ItemTypes.TOOL_PICKAXE_PLUS:
      return "Mine encore plus vite et frappe plus fort";
    case ItemTypes.MATERIAL_COAL:
      return "Utilisé pour l'artisanat";
    case ItemTypes.MATERIAL_IRON:
      return "Utilisé pour l'artisanat avancé";
    default:
      return "Aucun objet sélectionné";
  }
}
