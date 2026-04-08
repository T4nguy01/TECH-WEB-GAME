import { nameForItem } from "./items.js";

export const DEFAULT_INVENTORY_SIZE = 36;
export const DEFAULT_HOTBAR_SIZE = 9;
export const DEFAULT_STORAGE_SIZE = 16;
export const DEFAULT_PLAYER_INVENTORY_SIZE = 9;
export const STACK_LIMIT = 99;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function createEmptySlot() {
  return null;
}

export function createDefaultInventory({ size = DEFAULT_INVENTORY_SIZE, hotbarSize = DEFAULT_HOTBAR_SIZE } = {}) {
  return normalizeInventory({
    size: DEFAULT_PLAYER_INVENTORY_SIZE,
    hotbarSize: DEFAULT_PLAYER_INVENTORY_SIZE,
    selectedSlot: 0,
    slots: [
      { itemType: "block:dirt", count: 64 },
      { itemType: "block:stone", count: 64 },
      { itemType: "block:grass", count: 64 },
      { itemType: "block:wood", count: 64 },
      { itemType: "tool:pickaxe", count: 1 },
      { itemType: "weapon:smoke_grenade", count: 3 },
    ],
  });
}

export function normalizePlayerInventory(input = {}) {
  const normalized = normalizeInventory({
    ...input,
    size: DEFAULT_PLAYER_INVENTORY_SIZE,
    hotbarSize: DEFAULT_PLAYER_INVENTORY_SIZE,
  });
  normalized.size = DEFAULT_PLAYER_INVENTORY_SIZE;
  normalized.hotbarSize = DEFAULT_PLAYER_INVENTORY_SIZE;
  normalized.selectedSlot = clamp(Math.floor(normalized.selectedSlot || 0), 0, DEFAULT_PLAYER_INVENTORY_SIZE - 1);
  normalized.slots = normalized.slots.slice(0, DEFAULT_PLAYER_INVENTORY_SIZE);
  while (normalized.slots.length < DEFAULT_PLAYER_INVENTORY_SIZE) normalized.slots.push(null);
  return normalized;
}

export function createStorageInventory({ size = DEFAULT_STORAGE_SIZE } = {}) {
  return normalizeInventory({
    size,
    hotbarSize: 0,
    selectedSlot: 0,
    slots: Array.from({ length: size }, () => null),
  });
}

export function normalizeInventory(input = {}) {
  const size = Number.isFinite(input.size) ? clamp(Number(input.size), 1, 120) : DEFAULT_INVENTORY_SIZE;
  const rawHotbarSize = Number.isFinite(input.hotbarSize) ? Math.floor(Number(input.hotbarSize)) : DEFAULT_HOTBAR_SIZE;
  const hotbarSize = clamp(rawHotbarSize, 0, Math.min(9, size));
  const selectedSlot = hotbarSize > 0 && Number.isFinite(input.selectedSlot) ? clamp(Number(input.selectedSlot), 0, hotbarSize - 1) : 0;
  const slots = Array.from({ length: size }, () => createEmptySlot());
  const src = Array.isArray(input.slots) ? input.slots : [];

  for (let i = 0; i < Math.min(size, src.length); i += 1) {
    const s = src[i];
    if (!s || !s.itemType || !Number.isFinite(s.count) || s.count <= 0) continue;
    slots[i] = {
      itemType: String(s.itemType),
      count: clamp(Math.floor(s.count), 1, STACK_LIMIT),
    };
  }

  return { size, hotbarSize, selectedSlot, slots };
}

export function cloneInventory(inv) {
  return normalizeInventory(inv);
}

export function getSlot(inv, index) {
  if (!inv || !Array.isArray(inv.slots)) return null;
  if (!Number.isFinite(index)) return null;
  const i = clamp(Math.floor(index), 0, inv.slots.length - 1);
  const slot = inv.slots[i];
  return slot ? { itemType: slot.itemType, count: slot.count } : null;
}

export function setSelectedSlot(inv, slotIndex) {
  if (!inv) return;
  if (!Number.isFinite(inv.hotbarSize) || inv.hotbarSize <= 0) {
    inv.selectedSlot = 0;
    return;
  }
  inv.selectedSlot = clamp(Math.floor(slotIndex), 0, Math.max(0, inv.hotbarSize - 1));
}

export function getSelectedSlot(inv) {
  return Number.isFinite(inv?.selectedSlot) ? inv.selectedSlot : 0;
}

export function countItem(inv, itemType) {
  const target = String(itemType);
  let total = 0;
  for (const slot of inv?.slots || []) {
    if (slot && slot.itemType === target) total += slot.count;
  }
  return total;
}

export function findFirstSlotWithItem(inv, itemType) {
  const target = String(itemType);
  return (inv?.slots || []).findIndex((slot) => slot && slot.itemType === target);
}

export function findFirstEmptySlot(inv, startIndex = 0, endIndex = null) {
  const slots = inv?.slots || [];
  const end = endIndex == null ? slots.length : clamp(Math.floor(endIndex), 0, slots.length);
  for (let i = clamp(Math.floor(startIndex), 0, slots.length); i < end; i += 1) {
    if (!slots[i]) return i;
  }
  return -1;
}

export function addItem(inv, itemType, amount = 1, { preferHotbar = true } = {}) {
  if (!inv || !itemType || amount <= 0) return 0;
  const target = String(itemType);
  let remaining = Math.floor(amount);
  const slots = inv.slots || [];

  for (let i = 0; i < slots.length && remaining > 0; i += 1) {
    const slot = slots[i];
    if (!slot || slot.itemType !== target) continue;
    const space = STACK_LIMIT - slot.count;
    if (space <= 0) continue;
    const add = Math.min(space, remaining);
    slot.count += add;
    remaining -= add;
  }

  const startIndex = preferHotbar ? 0 : inv.hotbarSize;
  const endIndex = preferHotbar ? inv.hotbarSize : slots.length;
  while (remaining > 0) {
    const empty = findFirstEmptySlot(inv, startIndex, endIndex);
    if (empty < 0) break;
    const add = Math.min(STACK_LIMIT, remaining);
    slots[empty] = { itemType: target, count: add };
    remaining -= add;
  }

  if (remaining > 0) {
    for (let i = 0; i < slots.length && remaining > 0; i += 1) {
      if (i >= startIndex && i < endIndex) continue;
      if (slots[i]) continue;
      const add = Math.min(STACK_LIMIT, remaining);
      slots[i] = { itemType: target, count: add };
      remaining -= add;
    }
  }

  return remaining;
}

export function canAddItem(inv, itemType, amount = 1, { preferHotbar = true } = {}) {
  if (!inv || !itemType || amount <= 0) return false;
  const target = String(itemType);
  let remaining = Math.floor(amount);
  const slots = inv.slots || [];

  for (const slot of slots) {
    if (!slot || slot.itemType !== target) continue;
    const space = STACK_LIMIT - slot.count;
    if (space <= 0) continue;
    const take = Math.min(space, remaining);
    remaining -= take;
    if (remaining <= 0) return true;
  }

  const startIndex = preferHotbar ? 0 : inv.hotbarSize;
  const endIndex = preferHotbar ? inv.hotbarSize : slots.length;
  for (let i = startIndex; i < endIndex && remaining > 0; i += 1) {
    if (slots[i]) continue;
    remaining -= Math.min(STACK_LIMIT, remaining);
  }

  if (remaining > 0) {
    for (let i = 0; i < slots.length && remaining > 0; i += 1) {
      if (i >= startIndex && i < endIndex) continue;
      if (slots[i]) continue;
      remaining -= Math.min(STACK_LIMIT, remaining);
    }
  }

  return remaining <= 0;
}

export function removeItem(inv, itemType, amount = 1) {
  if (!inv || !itemType || amount <= 0) return 0;
  const target = String(itemType);
  let remaining = Math.floor(amount);
  const slots = inv.slots || [];

  for (let i = 0; i < slots.length && remaining > 0; i += 1) {
    const slot = slots[i];
    if (!slot || slot.itemType !== target) continue;
    const take = Math.min(slot.count, remaining);
    slot.count -= take;
    remaining -= take;
    if (slot.count <= 0) slots[i] = null;
  }

  return amount - remaining;
}

export function swapSlots(inv, from, to) {
  if (!inv) return false;
  const slots = inv.slots || [];
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  const a = clamp(Math.floor(from), 0, slots.length - 1);
  const b = clamp(Math.floor(to), 0, slots.length - 1);
  if (a === b) return true;
  [slots[a], slots[b]] = [slots[b], slots[a]];
  return true;
}

export function clearInventory(inv) {
  if (!inv) return;
  inv.slots = Array.from({ length: inv.size || DEFAULT_INVENTORY_SIZE }, () => null);
}

export function inventoryToPublic(inv) {
  const normalized = normalizeInventory(inv);
  return {
    size: normalized.size,
    hotbarSize: normalized.hotbarSize,
    selectedSlot: normalized.selectedSlot,
    slots: normalized.slots.map((slot) => (slot ? { itemType: slot.itemType, count: slot.count, name: nameForItem(slot.itemType) } : null)),
  };
}

export function slotLabel(slot) {
  if (!slot) return "";
  return nameForItem(slot.itemType);
}

export class Inventory {
  constructor({ size = DEFAULT_INVENTORY_SIZE, hotbarSize = DEFAULT_HOTBAR_SIZE } = {}) {
    this.size = size;
    this.hotbarSize = hotbarSize;
    this.selectedSlot = 0;
    this.slots = Array.from({ length: size }, () => null);
  }
}
