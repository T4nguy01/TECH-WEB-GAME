import { addItem, canAddItem, cloneInventory, removeItem } from "./inventory.js";

export class Crafting {
  constructor() {
    this.recipes = [
      {
        id: "pickaxe",
        label: "Pioche",
        description: "Débloque un minage plus rapide.",
        inputs: [
          { itemType: "block:stone", count: 3 },
          { itemType: "block:dirt", count: 2 },
        ],
        output: { itemType: "tool:pickaxe", count: 1 },
      },
      {
        id: "reinforced_pickaxe",
        label: "Pioche renforcée",
        description: "Utilise du minerai pour améliorer ton outil de minage.",
        inputs: [
          { itemType: "tool:pickaxe", count: 1 },
          { itemType: "material:iron", count: 2 },
          { itemType: "block:stone", count: 3 },
        ],
        output: { itemType: "tool:pickaxe_plus", count: 1 },
      },
      {
        id: "stone_bundle",
        label: "Pack de pierre",
        description: "Convertit de la terre et de l'herbe en pierre.",
        inputs: [
          { itemType: "block:dirt", count: 2 },
          { itemType: "block:grass", count: 1 },
        ],
        output: { itemType: "block:stone", count: 4 },
      },
      {
        id: "grass_bundle",
        label: "Pack d'herbe",
        description: "Convertit de la pierre et de la terre en herbe.",
        inputs: [
          { itemType: "block:stone", count: 2 },
          { itemType: "block:dirt", count: 1 },
        ],
        output: { itemType: "block:grass", count: 4 },
      },
      {
        id: "chest",
        label: "Coffre",
        description: "Crée un bloc de stockage pour ton butin.",
        inputs: [
          { itemType: "block:stone", count: 8 },
          { itemType: "material:coal", count: 1 },
        ],
        output: { itemType: "block:chest", count: 1 },
      },
      {
        id: "grenade_pack",
        label: "Pack de grenades",
        description: "Fabrique une petite réserve de grenades pour les combats explosifs.",
        inputs: [
          { itemType: "material:coal", count: 2 },
          { itemType: "block:wood", count: 2 },
        ],
        output: { itemType: "weapon:grenade", count: 3 },
      },
      {
        id: "smoke_pack",
        label: "Pack de fumigènes",
        description: "Prépare un lot de fumigènes pour disparaître dans la fumée.",
        inputs: [
          { itemType: "material:coal", count: 1 },
          { itemType: "block:wood", count: 2 },
          { itemType: "block:grass", count: 1 },
        ],
        output: { itemType: "weapon:smoke_grenade", count: 3 },
      },
      {
        id: "confetti_pack",
        label: "Pack à confettis",
        description: "Fabrique un canon qui transforme les combats en fête.",
        inputs: [
          { itemType: "block:wood", count: 2 },
          { itemType: "block:grass", count: 1 },
          { itemType: "material:coal", count: 1 },
        ],
        output: { itemType: "weapon:confetti_cannon", count: 3 },
      },
      {
        id: "stink_pack",
        label: "Pack puant",
        description: "Prépare des bombes vertes pour faire fuir tout le monde.",
        inputs: [
          { itemType: "block:grass", count: 2 },
          { itemType: "material:coal", count: 1 },
          { itemType: "block:wood", count: 1 },
        ],
        output: { itemType: "weapon:stink_bomb", count: 3 },
      },
      {
        id: "banana_pack",
        label: "Pack banane",
        description: "Fabrique des bombes bananes parce que pourquoi pas.",
        inputs: [
          { itemType: "block:stone", count: 2 },
          { itemType: "block:grass", count: 2 },
          { itemType: "material:iron", count: 1 },
        ],
        output: { itemType: "weapon:banana_bomb", count: 2 },
      },
      {
        id: "party_pack",
        label: "Pack de fête",
        description: "Mets le ciel en mode discothèque.",
        inputs: [
          { itemType: "block:wood", count: 2 },
          { itemType: "material:coal", count: 2 },
          { itemType: "material:iron", count: 1 },
        ],
        output: { itemType: "weapon:party_rocket", count: 2 },
      },
      {
        id: "bazooka_pack",
        label: "Pack bazooka",
        description: "Forge un équipement de roquettes pour les combats à distance.",
        inputs: [
          { itemType: "material:iron", count: 2 },
          { itemType: "block:stone", count: 4 },
          { itemType: "block:wood", count: 2 },
        ],
        output: { itemType: "weapon:bazooka", count: 1 },
      },
      {
        id: "slime_pack",
        label: "Pack slime",
        description: "Fabrique une arme gluante qui laisse une belle trace verte.",
        inputs: [
          { itemType: "block:grass", count: 2 },
          { itemType: "material:coal", count: 1 },
          { itemType: "block:wood", count: 1 },
        ],
        output: { itemType: "weapon:slime_bomb", count: 3 },
      },
      {
        id: "toilet_pack",
        label: "Pack toilette",
        description: "Prépare des rouleaux pour semer le chaos sanitaire.",
        inputs: [
          { itemType: "block:wood", count: 2 },
          { itemType: "block:dirt", count: 2 },
          { itemType: "material:coal", count: 1 },
        ],
        output: { itemType: "weapon:toilet_paper", count: 3 },
      },
      {
        id: "chicken_pack",
        label: "Pack poulet",
        description: "Charge un poulet caoutchouc pour les situations très sérieuses.",
        inputs: [
          { itemType: "block:wood", count: 2 },
          { itemType: "block:stone", count: 2 },
          { itemType: "material:iron", count: 1 },
        ],
        output: { itemType: "weapon:rubber_chicken", count: 2 },
      },
      {
        id: "disco_pack",
        label: "Pack disco",
        description: "Allume une boule disco qui transforme les combats en soirée.",
        inputs: [
          { itemType: "material:iron", count: 2 },
          { itemType: "material:coal", count: 2 },
          { itemType: "block:grass", count: 1 },
        ],
        output: { itemType: "weapon:disco_globe", count: 2 },
      },
    ];
  }
}

export function getRecipes() {
  return new Crafting().recipes;
}

export function getRecipe(recipeId) {
  return getRecipes().find((recipe) => recipe.id === recipeId) || null;
}

export function canCraft(recipe, inv) {
  if (!recipe || !inv) return false;
  const draft = cloneInventory(inv);
  for (const input of recipe.inputs) {
    const removed = removeItem(draft, input.itemType, input.count);
    if (removed < input.count) return false;
  }
  return canAddItem(draft, recipe.output.itemType, recipe.output.count, { preferHotbar: true });
}

export function craftRecipe(recipe, inv) {
  if (!canCraft(recipe, inv)) return false;
  const draft = cloneInventory(inv);
  for (const input of recipe.inputs) {
    const removed = removeItem(draft, input.itemType, input.count);
    if (removed < input.count) return false;
  }

  if (!canAddItem(draft, recipe.output.itemType, recipe.output.count, { preferHotbar: true })) return false;
  inv.slots = draft.slots;
  addItem(inv, recipe.output.itemType, recipe.output.count);
  return true;
}
