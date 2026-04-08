import { canCraft } from "./crafting.js";
import { labelForItem } from "./items.js";
import { normalizeInventory, normalizePlayerInventory, slotLabel } from "./inventory.js";
import { skinById } from "./skins.js";

const FUN_OPTIONS_KEY = "webgame_fun_options";

export class UI {
  constructor({
    hotbarEl,
    chatLogEl,
    chatFormEl,
    chatInputEl,
    inventoryOverlayEl,
    inventorySubEl,
    inventoryGridEl,
    chestSectionEl,
    chestGridEl,
    craftListEl,
    modeButtonEl,
    funButtonEl,
    funOverlayEl,
    funCloseEl,
    sparkleToggleEl,
    discoToggleEl,
    giantHeadToggleEl,
    jumpBurstToggleEl,
    inventoryDropEl,
    inventoryButtonEl,
    inventoryCloseEl,
  }) {
    this.hotbarEl = hotbarEl;
    this.chatLogEl = chatLogEl;
    this.chatFormEl = chatFormEl;
    this.chatInputEl = chatInputEl;
    this.inventoryOverlayEl = inventoryOverlayEl;
    this.inventorySubEl = inventorySubEl;
    this.inventoryGridEl = inventoryGridEl;
    this.chestSectionEl = chestSectionEl;
    this.chestGridEl = chestGridEl;
    this.craftListEl = craftListEl;
    this.modeButtonEl = modeButtonEl;
    this.funButtonEl = funButtonEl;
    this.funOverlayEl = funOverlayEl;
    this.funCloseEl = funCloseEl;
    this.sparkleToggleEl = sparkleToggleEl;
    this.discoToggleEl = discoToggleEl;
    this.giantHeadToggleEl = giantHeadToggleEl;
    this.jumpBurstToggleEl = jumpBurstToggleEl;
    this.inventoryDropEl = inventoryDropEl;
    this.inventoryButtonEl = inventoryButtonEl;
    this.inventoryCloseEl = inventoryCloseEl;

    this.onChatSend = null;
    this.onInventoryToggle = null;
    this.onHotbarSelect = null;
    this.onCraftRequest = null;
    this.onModeToggle = null;
    this.onFunOptionsChange = null;
    this.onDropRequest = null;
    this.onInventorySwap = null;
    this.onInventoryTransfer = null;

    this._activeHotbar = 0;
    this._players = [];
    this._inventory = normalizePlayerInventory();
    this._recipes = [];
    this._gameMode = "survival";
    this._funOptions = this._loadFunOptions();
    this._dragSourceSlot = null;
    this._dragSourceScope = "player";
    this._dragPointerId = null;
    this._dragStartPoint = null;
    this._dragging = false;
    this._dropTargetActive = false;
    this._chest = null;
    this._localHud = { health: 20, maxHealth: 20, itemLabel: "Emplacement vide", itemHint: "Aucun objet sélectionné" };

    this.playerListEl = document.getElementById("playerList");
    this.playerCountEl = document.getElementById("playerCount");
    this.healthFillEl = document.getElementById("healthFill");
    this.healthTextEl = document.getElementById("healthText");
    this.selectedItemEl = document.getElementById("selectedItem");
    this.selectedHintEl = document.getElementById("selectedHint");

    this._bindChat();
    this._bindInventory();
    this._bindMode();
    this._bindFun();
    this.setGameMode("survival");
    this.setFunOptions(this._funOptions);
  }

  initHotbar(n, items = null) {
    if (!this.hotbarEl) return;
    this.hotbarEl.innerHTML = "";
    for (let i = 0; i < n; i += 1) {
      const el = document.createElement("div");
      el.className = `slot ${i === this._activeHotbar ? "active" : ""}`;

      const index = document.createElement("span");
      index.className = "slotIndex";
      index.textContent = String(i + 1);

      const label = document.createElement("span");
      label.className = "slotLabel";
      label.textContent = items?.[i]?.label || "Vide";

      const count = document.createElement("span");
      count.className = "slotCount";
      count.textContent = items?.[i]?.count ? `x${items[i].count}` : "";

      el.appendChild(index);
      el.appendChild(label);
      el.appendChild(count);
      this.hotbarEl.appendChild(el);
    }
  }

  setActiveHotbar(i) {
    if (this._activeHotbar === i) return;
    this._activeHotbar = i;
    const slots = this.hotbarEl?.querySelectorAll(".slot");
    if (!slots) return;
    for (let s = 0; s < slots.length; s += 1) {
      slots[s].classList.toggle("active", s === i);
    }
    if (this.isInventoryOpen()) this._renderInventory();
  }

  isChatFocused() {
    return document.activeElement === this.chatInputEl;
  }

  _bindChat() {
    if (!this.chatFormEl || !this.chatInputEl) return;

    window.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();
      const overlay = document.getElementById("authOverlay");
      if (overlay && !overlay.classList.contains("hidden")) return;
      if (this.isChatFocused()) return;
      if (key !== "enter" && key !== "t") return;
      e.preventDefault();
      this.chatInputEl.focus();
    });

    this.chatFormEl.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = String(this.chatInputEl.value || "").trim();
      if (!text) return;
      this.chatInputEl.value = "";
      this.chatInputEl.blur();
      this.onChatSend?.(text);
    });
  }

  _bindInventory() {
    this.inventoryButtonEl?.addEventListener("click", () => this.toggleInventory());
    this.inventoryDropEl?.addEventListener("click", () => this.dropSelectedItem());
    this.inventoryCloseEl?.addEventListener("click", () => this.closeInventory());
    this.inventoryOverlayEl?.addEventListener("click", (e) => {
      if (e.target === this.inventoryOverlayEl) this.closeInventory();
    });

    window.addEventListener("pointermove", (e) => this._handleInventoryPointerMove(e));
    window.addEventListener("pointerup", (e) => this._handleInventoryPointerUp(e));
    window.addEventListener("pointercancel", () => this.clearDrag());
    window.addEventListener("blur", () => this.clearDrag());

    window.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();
      const overlay = document.getElementById("authOverlay");
      if (overlay && !overlay.classList.contains("hidden")) return;
      if (this.isChatFocused()) return;
      if (key === "j") {
        e.preventDefault();
        this.dropSelectedItem();
        return;
      }
      if (key !== "i" && key !== "e" && key !== "escape") return;
      if (key === "escape" && !this.isInventoryOpen()) return;
      e.preventDefault();
      if (key === "escape") this.closeInventory();
      else this.toggleInventory();
    });
  }

  _bindMode() {
    this.modeButtonEl?.addEventListener("click", () => {
      const next = this._gameMode === "creative" ? "survival" : "creative";
      this.setGameMode(next);
      this.onModeToggle?.(next);
    });
  }

  _bindFun() {
    this.funButtonEl?.addEventListener("click", () => this.toggleFunOptions());
    this.funCloseEl?.addEventListener("click", () => this.closeFunOptions());
    this.funOverlayEl?.addEventListener("click", (e) => {
      if (e.target === this.funOverlayEl) this.closeFunOptions();
    });

    this.sparkleToggleEl?.addEventListener("change", () => {
      this.setFunOptions({
        ...this._funOptions,
        sparkles: Boolean(this.sparkleToggleEl.checked),
      });
    });

    this.discoToggleEl?.addEventListener("change", () => {
      this.setFunOptions({
        ...this._funOptions,
        disco: Boolean(this.discoToggleEl.checked),
      });
    });

    this.giantHeadToggleEl?.addEventListener("change", () => {
      this.setFunOptions({
        ...this._funOptions,
        giantHead: Boolean(this.giantHeadToggleEl.checked),
      });
    });

    this.jumpBurstToggleEl?.addEventListener("change", () => {
      this.setFunOptions({
        ...this._funOptions,
        jumpBurst: Boolean(this.jumpBurstToggleEl.checked),
      });
    });
  }

  isInventoryOpen() {
    return !!this.inventoryOverlayEl && !this.inventoryOverlayEl.classList.contains("hidden");
  }

  toggleInventory(force) {
    const next = typeof force === "boolean" ? force : !this.isInventoryOpen();
    if (next) {
      this.inventoryOverlayEl?.classList.remove("hidden");
      this._renderInventory();
      this.onInventoryToggle?.(true);
    } else {
      this.closeInventory();
    }
  }

  openInventory() {
    this.toggleInventory(true);
  }

  closeInventory() {
    if (!this.inventoryOverlayEl) return;
    this.inventoryOverlayEl.classList.add("hidden");
    this.clearDrag();
    this.setChest(null, { silent: true });
    this.onInventoryToggle?.(false);
  }

  dropSelectedItem() {
    const source = Number.isFinite(this._dragSourceSlot) ? this._dragSourceSlot : this._inventory.selectedSlot;
    this.dropInventorySlot(source);
  }

  dropInventorySlot(slotIndex) {
    const slot = this._inventory.slots?.[slotIndex] || null;
    if (!slot) return;
    this.onDropRequest?.(slotIndex);
  }

  setInventory(inventory) {
    this._inventory = normalizePlayerInventory(inventory);
    if (Number.isFinite(this._dragSourceSlot)) {
      const max = Math.max(0, this._inventory.slots.length - 1);
      this._dragSourceSlot = Math.max(0, Math.min(max, this._dragSourceSlot));
    }
    this._renderInventory();
  }

  setGameMode(mode) {
    this._gameMode = String(mode) === "creative" ? "creative" : "survival";
    if (this.modeButtonEl) {
      this.modeButtonEl.textContent = this._gameMode === "creative" ? "mode: créatif" : "mode: survie";
      this.modeButtonEl.classList.toggle("ok", this._gameMode === "creative");
    }
  }

  _loadFunOptions() {
    try {
      const raw = localStorage.getItem(FUN_OPTIONS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        sparkles: parsed.sparkles !== false,
        disco: Boolean(parsed.disco),
        giantHead: Boolean(parsed.giantHead),
        jumpBurst: Boolean(parsed.jumpBurst),
      };
    } catch {
      return { sparkles: true, disco: false, giantHead: false, jumpBurst: false };
    }
  }

  _saveFunOptions() {
    localStorage.setItem(FUN_OPTIONS_KEY, JSON.stringify(this._funOptions));
  }

  getFunOptions() {
    return { ...this._funOptions };
  }

  setFunOptions(options) {
    this._funOptions = {
      sparkles: options?.sparkles !== false,
      disco: Boolean(options?.disco),
      giantHead: Boolean(options?.giantHead),
      jumpBurst: Boolean(options?.jumpBurst),
    };
    this._saveFunOptions();
    if (this.sparkleToggleEl) this.sparkleToggleEl.checked = this._funOptions.sparkles;
    if (this.discoToggleEl) this.discoToggleEl.checked = this._funOptions.disco;
    if (this.giantHeadToggleEl) this.giantHeadToggleEl.checked = this._funOptions.giantHead;
    if (this.jumpBurstToggleEl) this.jumpBurstToggleEl.checked = this._funOptions.jumpBurst;
    this.onFunOptionsChange?.(this.getFunOptions());
  }

  isFunOptionsOpen() {
    return !!this.funOverlayEl && !this.funOverlayEl.classList.contains("hidden");
  }

  toggleFunOptions(force) {
    const next = typeof force === "boolean" ? force : !this.isFunOptionsOpen();
    if (next) {
      this.funOverlayEl?.classList.remove("hidden");
    } else {
      this.closeFunOptions();
    }
  }

  closeFunOptions() {
    this.funOverlayEl?.classList.add("hidden");
  }

  setChest(chest, { silent = false } = {}) {
    if (!chest || !Number.isFinite(chest.x) || !Number.isFinite(chest.y) || !chest.inventory) {
      this._chest = null;
      this._dragSourceSlot = null;
      this._dragSourceScope = "player";
      if (this.chestSectionEl) this.chestSectionEl.classList.add("hidden");
      if (this.inventorySubEl) {
        this.inventorySubEl.textContent = "Vue agrandie pour lire plus vite les objets, les quantités et les recettes.";
      }
      this.clearDrag();
      if (!silent) this._renderInventory();
      return;
    }

    this._chest = {
      x: Math.floor(chest.x),
      y: Math.floor(chest.y),
      inventory: normalizeInventory(chest.inventory),
    };
    if (this.chestSectionEl) this.chestSectionEl.classList.remove("hidden");
    if (this.inventorySubEl) {
      this.inventorySubEl.textContent = `Coffre ouvert en ${this._chest.x}, ${this._chest.y}. Glisse un objet entre le sac et le coffre pour le transférer.`;
    }
    if (!silent && !this.isInventoryOpen()) {
      this.openInventory();
    } else if (!silent) {
      this._renderInventory();
    }
  }

  setRecipes(recipes) {
    this._recipes = Array.isArray(recipes) ? recipes.slice() : [];
    this._renderInventory();
  }

  clearDrag() {
    this._setDraggingSlot(null);
    this._setDropTarget(false);
    this._clearGridDropTargets();
    this._dragPointerId = null;
    this._dragStartPoint = null;
    this._dragging = false;
    this._dragSourceScope = "player";
  }

  _handleInventoryPointerMove(event) {
    this._updateInventoryDrag(event);
  }

  _handleInventoryPointerUp(event) {
    this._finishInventoryDrag(event);
  }

  _setDraggingSlot(slotIndex) {
    this._dragSourceSlot = Number.isFinite(slotIndex) ? Math.floor(slotIndex) : null;
    const scope = this._dragSourceScope;
    for (const grid of [this.inventoryGridEl, this.chestGridEl]) {
      if (!grid) continue;
      for (const el of grid.querySelectorAll(".invSlot")) {
        const index = Number(el.dataset.slotIndex);
        const slotScope = el.dataset.slotScope || "player";
        el.classList.toggle("dragging", this._dragSourceSlot != null && index === this._dragSourceSlot && slotScope === scope);
        el.classList.remove("dropTarget");
      }
    }
    const selected = this._inventory.slots[this._inventory.selectedSlot];
    const dragged =
      this._dragSourceScope === "player" && Number.isFinite(this._dragSourceSlot)
        ? this._inventory.slots[this._dragSourceSlot]
        : null;
    if (this.inventoryDropEl) this.inventoryDropEl.disabled = !selected && !dragged;
  }

  _setDropTarget(active) {
    this._dropTargetActive = Boolean(active);
    this.inventoryDropEl?.classList.toggle("dropTarget", this._dropTargetActive);
  }

  _getInventoryHitTarget(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const slotEl = el.closest?.(".invSlot");
    if (slotEl && this.inventoryGridEl?.contains(slotEl)) {
      const slotIndex = Number(slotEl.dataset.slotIndex);
      if (Number.isFinite(slotIndex)) {
        return { kind: "slot", scope: slotEl.dataset.slotScope || "player", slotIndex: Math.floor(slotIndex), element: slotEl };
      }
    }
    if (slotEl && this.chestGridEl?.contains(slotEl)) {
      const slotIndex = Number(slotEl.dataset.slotIndex);
      if (Number.isFinite(slotIndex)) {
        return { kind: "slot", scope: slotEl.dataset.slotScope || "chest", slotIndex: Math.floor(slotIndex), element: slotEl };
      }
    }
    const dropButton = el.closest?.("#inventoryDrop");
    if (dropButton && this.inventoryDropEl?.contains(dropButton)) {
      return { kind: "drop", element: this.inventoryDropEl };
    }
    return null;
  }

  _beginInventoryDrag(slotIndex, event, canDrag = true) {
    this._dragSourceSlot = canDrag && Number.isFinite(slotIndex) ? Math.floor(slotIndex) : null;
    this._dragSourceScope = event?.currentTarget?.dataset?.slotScope || "player";
    this._dragPointerId = event.pointerId;
    this._dragStartPoint = { x: event.clientX, y: event.clientY };
    this._dragging = false;
    this._setDraggingSlot(this._dragSourceSlot);
    this._setDropTarget(false);
    this._clearGridDropTargets();
  }

  _updateInventoryDrag(event) {
    if (!this.isInventoryOpen()) return;
    if (this._dragPointerId == null || event.pointerId !== this._dragPointerId) return;
    if (this._dragSourceSlot == null) return;

    const start = this._dragStartPoint;
    if (!this._dragging && start) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) >= 6) {
        this._dragging = true;
      }
    }

    if (!this._dragging) {
      this._setDropTarget(false);
      this._clearGridDropTargets();
      return;
    }

    const hit = this._getInventoryHitTarget(event.clientX, event.clientY);
    if (!hit) {
      this._setDropTarget(false);
      this._clearGridDropTargets();
      return;
    }

    if (hit.kind === "slot" && hit.slotIndex !== this._dragSourceSlot) {
      this._setDropTarget(false);
      this._clearGridDropTargets();
      hit.element.classList.add("dropTarget");
      return;
    }

    if (hit.kind === "drop") {
      this._clearGridDropTargets();
      this._setDropTarget(true);
      return;
    }

    this._setDropTarget(false);
    this._clearGridDropTargets();
  }

  _finishInventoryDrag(event) {
    if (this._dragPointerId == null || event.pointerId !== this._dragPointerId) return;
    const source = this._dragSourceSlot;
    const wasDragging = this._dragging;
    const hit = this._getInventoryHitTarget(event.clientX, event.clientY);
    this.clearDrag();

    if (source == null) return;

    if (!wasDragging) {
      if (this._dragSourceScope !== "player") return;
      if (hit?.kind === "slot" && hit.scope === "player") {
        this.onHotbarSelect?.(hit.slotIndex);
      } else {
        this.onHotbarSelect?.(source);
      }
      return;
    }

    if (!hit || hit.kind === "drop") {
      if (this._dragSourceScope === "player") this.dropInventorySlot(source);
      return;
    }

    if (hit.kind === "slot") {
      if (hit.slotIndex === source && hit.scope === this._dragSourceScope) return;
      if (this._dragSourceScope === "player" && hit.scope === "player") {
        this.onInventorySwap?.(source, hit.slotIndex);
      } else {
        this.onInventoryTransfer?.({
          from: this._dragSourceScope === "chest"
            ? { scope: "chest", x: this._chest?.x, y: this._chest?.y, slot: source }
            : { scope: "player", slot: source },
          to: hit.scope === "chest"
            ? { scope: "chest", x: this._chest?.x, y: this._chest?.y, slot: hit.slotIndex }
            : { scope: "player", slot: hit.slotIndex },
        });
      }
    }
  }

  _clearGridDropTargets() {
    for (const grid of [this.inventoryGridEl, this.chestGridEl]) {
      if (!grid) continue;
      for (const el of grid.querySelectorAll(".invSlot")) {
        el.classList.remove("dropTarget");
      }
    }
  }

  _renderInventoryGrid(containerEl, inv, scope = "player") {
    if (!containerEl) return;
    containerEl.innerHTML = "";
    const slots = scope === "chest" ? normalizeInventory(inv).slots : normalizePlayerInventory(inv).slots;
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      const el = document.createElement("button");
      el.type = "button";
      el.className = `invSlot ${scope === "player" && i === this._activeHotbar ? "active" : ""} ${scope === "chest" ? "container" : ""}`;
      el.dataset.slotIndex = String(i);
      el.dataset.slotScope = scope;
      el.draggable = false;

      const index = document.createElement("span");
      index.className = "invIndex";
      index.textContent = String(i + 1);

      const name = document.createElement("span");
      name.className = "invName";
      name.textContent = slot ? slotLabel(slot) : "Vide";

      const count = document.createElement("span");
      count.className = "invCount";
      count.textContent = slot ? `x${slot.count}` : "";

      el.appendChild(index);
      el.appendChild(name);
      el.appendChild(count);
      el.addEventListener("pointerdown", (e) => {
        if (!this.isInventoryOpen()) return;
        if (e.button !== 0) return;
        e.preventDefault();
        this._beginInventoryDrag(i, e, Boolean(slot));
      });
      containerEl.appendChild(el);
    }
    if (Number.isFinite(this._dragSourceSlot)) {
      this._setDraggingSlot(this._dragSourceSlot);
    }
  }

  _renderInventory() {
    if (this.inventoryGridEl) {
      this._renderInventoryGrid(this.inventoryGridEl, this._inventory, "player");
    }

    if (this.chestGridEl) {
      if (this._chest) this._renderInventoryGrid(this.chestGridEl, this._chest.inventory, "chest");
      else this.chestGridEl.innerHTML = "";
    }

    if (this.craftListEl) {
      this._renderCraftList();
    }

    if (this.selectedItemEl) {
      const slot = this._inventory.slots[this._inventory.selectedSlot];
      this.selectedItemEl.textContent = slot ? `${slotLabel(slot)} x${slot.count}` : "Emplacement vide";
    }

    if (this.selectedHintEl) {
      this.selectedHintEl.textContent = this._inventory.slots[this._inventory.selectedSlot]
        ? "Clique un emplacement pour le sélectionner."
        : "Aucun objet sélectionné";
    }

    if (this.inventoryDropEl) {
      const selected = this._inventory.slots[this._inventory.selectedSlot];
      const dragged = this._dragSourceScope === "player" && Number.isFinite(this._dragSourceSlot) ? this._inventory.slots[this._dragSourceSlot] : null;
      this.inventoryDropEl.disabled = !selected && !dragged;
      this.inventoryDropEl.classList.toggle("dropTarget", this._dropTargetActive);
    }
  }

  _renderCraftList() {
    this.craftListEl.innerHTML = "";

    if (!this._recipes.length) {
      const empty = document.createElement("div");
      empty.className = "craftCard";
      empty.style.cursor = "default";
      empty.innerHTML = `
        <div class="craftTop">
          <div class="craftTitle">Aucune recette</div>
          <div class="craftStatus locked">vide</div>
        </div>
        <div class="craftReq">Ajoute des recettes dans <code>client/crafting.js</code>.</div>
      `;
      this.craftListEl.appendChild(empty);
      return;
    }

    for (const recipe of this._recipes) {
      const ready = canCraft(recipe, this._inventory);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "craftCard";
      button.disabled = !ready;
      button.innerHTML = `
        <div class="craftTop">
          <div class="craftTitle">${recipe.label}</div>
          <div class="craftStatus ${ready ? "ready" : "locked"}">${ready ? "prêt" : "bloqué"}</div>
        </div>
        <div class="craftReq"><strong>Requiert :</strong> ${this._formatRecipeInputs(recipe)}</div>
        <div class="craftOut"><strong>Produit :</strong> ${this._formatRecipeOutput(recipe)}</div>
        <div class="craftReq">${recipe.description || ""}</div>
      `;
      button.addEventListener("click", () => {
        if (!ready) return;
        this.onCraftRequest?.(recipe.id);
      });
      this.craftListEl.appendChild(button);
    }
  }

  _formatRecipeInputs(recipe) {
    return (recipe?.inputs || [])
      .map((input) => `${input.count} ${labelForItem(input.itemType) || input.itemType}`)
      .join(", ");
  }

  _formatRecipeOutput(recipe) {
    if (!recipe?.output) return "Rien";
    return `${recipe.output.count} ${labelForItem(recipe.output.itemType) || recipe.output.itemType}`;
  }

  addChatLine(text) {
    if (!this.chatLogEl) return;
    const line = document.createElement("div");
    line.className = "chatLine";
    line.textContent = text;
    this.chatLogEl.appendChild(line);
    this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
  }

  setLocalHud({ health, maxHealth, itemLabel, itemHint }) {
    const next = {
      health: Number.isFinite(health) ? health : this._localHud.health,
      maxHealth: Number.isFinite(maxHealth) ? maxHealth : this._localHud.maxHealth,
      itemLabel: itemLabel || "Emplacement vide",
      itemHint: itemHint || "Aucun objet sélectionné",
    };
    this._localHud = next;

    const ratio = next.maxHealth > 0 ? Math.max(0, Math.min(1, next.health / next.maxHealth)) : 0;
    if (this.healthFillEl) this.healthFillEl.style.width = `${ratio * 100}%`;
    if (this.healthTextEl) this.healthTextEl.textContent = `${Math.max(0, Math.round(next.health))}/${next.maxHealth}`;
    if (this.selectedItemEl) this.selectedItemEl.textContent = next.itemLabel;
    if (this.selectedHintEl) this.selectedHintEl.textContent = next.itemHint;
  }

  setPlayers(players, localId) {
    const list = (players || [])
      .map((p) => ({
        id: String(p.id),
        name: String(p.name),
        health: Number.isFinite(p.health) ? p.health : 0,
        maxHealth: Number.isFinite(p.maxHealth) ? p.maxHealth : 20,
        skin: String(p.skin || "classic"),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));

    const same =
      list.length === this._players.length &&
      list.every(
        (p, i) =>
          p.id === this._players[i].id &&
          p.name === this._players[i].name &&
          p.health === this._players[i].health &&
          p.maxHealth === this._players[i].maxHealth &&
          p.skin === this._players[i].skin
      );
    if (same) return;

    this._players = list;
    if (this.playerCountEl) this.playerCountEl.textContent = String(list.length);
    if (!this.playerListEl) return;

    this.playerListEl.innerHTML = "";
    for (const p of list) {
      const row = document.createElement("div");
      row.className = `playerRow ${p.id === String(localId || "") ? "me" : ""}`;

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "10px";

      const dot = document.createElement("div");
      dot.className = "playerDot";
      dot.style.background = skinById(p.skin).accent;
      const name = document.createElement("div");
      name.textContent = p.name;

      left.appendChild(dot);
      left.appendChild(name);
      row.appendChild(left);

      const meta = document.createElement("div");
      meta.className = "playerMeta";

      const healthLabel = document.createElement("div");
      healthLabel.className = "playerMetaText";
      healthLabel.textContent = `${Math.max(0, Math.round(p.health))}/${p.maxHealth}`;

      const healthBar = document.createElement("div");
      healthBar.className = "playerMiniHealth";

      const healthFill = document.createElement("div");
      healthFill.className = "playerMiniHealthFill";
      healthFill.style.width = `${p.maxHealth > 0 ? Math.max(0, Math.min(1, p.health / p.maxHealth)) * 100 : 0}%`;

      healthBar.appendChild(healthFill);
      meta.appendChild(healthLabel);
      meta.appendChild(healthBar);
      row.appendChild(meta);

      this.playerListEl.appendChild(row);
    }
  }
}
