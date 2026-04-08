/**
 * InputManager — Centralized input handling for the game.
 *
 * Maps physical keys to logical game actions.
 * Handles contextual blocking (chat, overlays).
 * Supports remappable keybindings stored in localStorage.
 */

const STORAGE_KEY = "webgame_keybinds";

/** Default mapping:  actionName → array of key identifiers (lowercase) */
const DEFAULT_BINDINGS = {
  moveLeft:    ["a", "q", "arrowleft"],
  moveRight:   ["d", "arrowright"],
  jump:        ["w", "z", "arrowup", " "],
  chat:        ["t", "enter"],
  inventory:   ["i", "e"],
  drop:        ["j"],
  pause:       ["escape"],
  debug:       ["f3"],
  skin:        ["f4"],
  funOptions:  ["f5"],
  toggleMode:  ["f6"],
  hotbar1:     ["1"],
  hotbar2:     ["2"],
  hotbar3:     ["3"],
  hotbar4:     ["4"],
  hotbar5:     ["5"],
  hotbar6:     ["6"],
  hotbar7:     ["7"],
  hotbar8:     ["8"],
  hotbar9:     ["9"],
  emote:       ["b"],
  ping:        ["v"],
  scoreboard:  ["tab"],
};

/** Actions that should work even when an overlay is open */
const ALWAYS_ALLOWED = new Set(["pause", "inventory"]);

/** Actions blocked when the chat input is focused */
const BLOCKED_IN_CHAT = new Set([
  "moveLeft", "moveRight", "jump", "drop", "inventory",
  "pause", "debug", "skin", "funOptions", "toggleMode",
  "hotbar1", "hotbar2", "hotbar3", "hotbar4", "hotbar5",
  "hotbar6", "hotbar7", "hotbar8", "hotbar9",
  "emote", "ping", "scoreboard",
]);

/** Actions held continuously (movement + tab overlay) */
const HELD_ACTIONS = new Set(["moveLeft", "moveRight", "jump", "scoreboard"]);

/** Pretty labels for actions (FR) */
export const ACTION_LABELS = {
  moveLeft:    "Aller à gauche",
  moveRight:   "Aller à droite",
  jump:        "Sauter",
  chat:        "Ouvrir le chat",
  inventory:   "Inventaire",
  drop:        "Jeter l'objet",
  pause:       "Pause / Menu",
  debug:       "Infos de debug",
  skin:        "Apparence",
  funOptions:  "Options visuelles",
  toggleMode:  "Basculer créatif/survie",
  hotbar1:     "Slot 1",
  hotbar2:     "Slot 2",
  hotbar3:     "Slot 3",
  hotbar4:     "Slot 4",
  hotbar5:     "Slot 5",
  hotbar6:     "Slot 6",
  hotbar7:     "Slot 7",
  hotbar8:     "Slot 8",
  hotbar9:     "Slot 9",
  emote:       "Emotes",
  ping:        "Placer un marqueur",
  scoreboard:  "Tableau des scores",
};

/** Action categories for the keybind UI */
export const ACTION_CATEGORIES = {
  "Mouvement": ["moveLeft", "moveRight", "jump"],
  "Combat & Objets": ["hotbar1", "hotbar2", "hotbar3", "hotbar4", "hotbar5", "hotbar6", "hotbar7", "hotbar8", "hotbar9", "drop"],
  "Interface": ["inventory", "pause", "debug", "skin", "funOptions", "toggleMode", "scoreboard"],
  "Social": ["chat", "emote", "ping"],
};

/** Pretty label for a key code */
export function prettyKey(key) {
  const map = {
    " ": "Espace",
    "arrowleft": "←",
    "arrowright": "→",
    "arrowup": "↑",
    "arrowdown": "↓",
    "escape": "Échap",
    "enter": "Entrée",
    "tab": "Tab",
    "control": "Ctrl",
    "shift": "Maj",
    "alt": "Alt",
    "f1": "F1", "f2": "F2", "f3": "F3", "f4": "F4",
    "f5": "F5", "f6": "F6", "f7": "F7", "f8": "F8",
    "f9": "F9", "f10": "F10", "f11": "F11", "f12": "F12",
    "backspace": "Retour",
    "delete": "Suppr",
  };
  const k = String(key).toLowerCase();
  return map[k] || k.toUpperCase();
}

export class InputManager {
  constructor() {
    /** @type {Record<string, string[]>} current keybindings */
    this.bindings = this._loadBindings();

    /** @type {Record<string, boolean>} held state per action */
    this.held = {};
    for (const action of Object.keys(DEFAULT_BINDINGS)) {
      this.held[action] = false;
    }

    /** @type {Record<string, Set<Function>>} callbacks per action (pressed) */
    this._onPress = {};
    /** @type {Record<string, Set<Function>>} callbacks per action (released) */
    this._onRelease = {};

    /** Context flags */
    this._chatFocused = false;
    this._overlayOpen = false;
    this._remapping = false;
    /** If set, the next key press is captured for remapping */
    this._remapTarget = null;
    this._remapResolve = null;

    /** Reverse map: key → action[] for fast lookup */
    this._keyToActions = new Map();
    this._rebuildReverse();

    /** Mouse state */
    this.mouse = {
      x: 0, y: 0,
      left: false, right: false,
      leftClicked: false, rightClicked: false,
    };

    /** Wheel events */
    this._onWheel = new Set();

    this._bindGlobal();
  }

  // ── Event emitter ──────────────────────────────────────

  /** Register a callback for when an action is first pressed */
  on(action, callback) {
    if (!this._onPress[action]) this._onPress[action] = new Set();
    this._onPress[action].add(callback);
  }

  /** Register a callback for when an action is released */
  onRelease(action, callback) {
    if (!this._onRelease[action]) this._onRelease[action] = new Set();
    this._onRelease[action].add(callback);
  }

  off(action, callback) {
    this._onPress[action]?.delete(callback);
    this._onRelease[action]?.delete(callback);
  }

  onWheelChange(callback) {
    this._onWheel.add(callback);
  }

  offWheelChange(callback) {
    this._onWheel.delete(callback);
  }

  // ── Context setters ────────────────────────────────────

  setChatFocused(focused) {
    this._chatFocused = Boolean(focused);
    if (focused) {
      // Release all movement when entering chat
      for (const action of HELD_ACTIONS) {
        this._setHeld(action, false);
      }
    }
  }

  setOverlayOpen(open) {
    this._overlayOpen = Boolean(open);
    if (open) {
      for (const action of HELD_ACTIONS) {
        this._setHeld(action, false);
      }
    }
  }

  // ── Keybinding management ──────────────────────────────

  getBindings() {
    return JSON.parse(JSON.stringify(this.bindings));
  }

  getDefaultBindings() {
    return JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
  }

  setBinding(action, keys) {
    if (!DEFAULT_BINDINGS[action]) return;
    this.bindings[action] = Array.isArray(keys)
      ? keys.map((k) => String(k).toLowerCase())
      : [String(keys).toLowerCase()];
    this._saveBindings();
    this._rebuildReverse();
  }

  resetBindings() {
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    this._saveBindings();
    this._rebuildReverse();
  }

  resetBinding(action) {
    if (!DEFAULT_BINDINGS[action]) return;
    this.bindings[action] = [...DEFAULT_BINDINGS[action]];
    this._saveBindings();
    this._rebuildReverse();
  }

  /**
   * Enter remap mode: the next key pressed will be captured.
   * Returns a Promise<string> that resolves to the pressed key.
   */
  startRemap(action) {
    return new Promise((resolve) => {
      this._remapTarget = action;
      this._remapResolve = resolve;
      this._remapping = true;
    });
  }

  cancelRemap() {
    this._remapTarget = null;
    this._remapResolve = null;
    this._remapping = false;
  }

  // ── Internals ──────────────────────────────────────────

  _loadBindings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
      const parsed = JSON.parse(raw);
      // Merge with defaults to ensure all actions exist
      const result = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
      for (const action of Object.keys(result)) {
        if (Array.isArray(parsed[action]) && parsed[action].length > 0) {
          result[action] = parsed[action].map((k) => String(k).toLowerCase());
        }
      }
      return result;
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    }
  }

  _saveBindings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
  }

  _rebuildReverse() {
    this._keyToActions = new Map();
    for (const [action, keys] of Object.entries(this.bindings)) {
      for (const key of keys) {
        const k = key.toLowerCase();
        if (!this._keyToActions.has(k)) this._keyToActions.set(k, []);
        this._keyToActions.get(k).push(action);
      }
    }
  }

  _setHeld(action, down) {
    const was = this.held[action];
    this.held[action] = down;
    if (down && !was) {
      for (const cb of this._onPress[action] || []) cb();
    }
    if (!down && was) {
      for (const cb of this._onRelease[action] || []) cb();
    }
  }

  _isBlocked(action) {
    if (this._chatFocused && BLOCKED_IN_CHAT.has(action)) return true;
    if (this._overlayOpen && !ALWAYS_ALLOWED.has(action)) return true;
    return false;
  }

  _bindGlobal() {
    window.addEventListener("keydown", (e) => {
      // Remap mode intercept
      if (this._remapping && this._remapTarget) {
        e.preventDefault();
        e.stopPropagation();
        const key = e.key.toLowerCase();
        if (key === "escape") {
          // Cancel remap
          const resolve = this._remapResolve;
          this.cancelRemap();
          resolve?.(null);
          return;
        }
        const action = this._remapTarget;
        const resolve = this._remapResolve;
        this.setBinding(action, [key]);
        this.cancelRemap();
        resolve?.(key);
        return;
      }

      const key = e.key.toLowerCase();
      const actions = this._keyToActions.get(key) || [];

      // Skip game actions when typing in any input field (auth, chat, etc.)
      const active = document.activeElement;
      const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
      if (isTyping) {
        // Only allow Escape through so the user can close overlays
        if (key !== "escape") return;
      }

      for (const action of actions) {
        // Prevent default for game keys (avoid scrolling, tab switch, etc.)
        // We do this BEFORE the isBlocked check but AFTER isTyping
        if (["tab", "f3", "f4", "f5", "f6", " "].includes(key)) {
          e.preventDefault();
        }

        if (this._isBlocked(action)) continue;

        if (HELD_ACTIONS.has(action)) {
          this._setHeld(action, true);
        } else if (!e.repeat) {
          // Instant actions fire once
          this._setHeld(action, true);
          // Auto-release for non-held actions
          requestAnimationFrame(() => this._setHeld(action, false));
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      if (this._remapping) return;
      const key = e.key.toLowerCase();
      const actions = this._keyToActions.get(key) || [];
      for (const action of actions) {
        if (HELD_ACTIONS.has(action)) {
          this._setHeld(action, false);
        }
      }
    });

    // ── Mouse ──
    const onPointerMove = (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    };

    const onPointerDown = (e) => {
      if (e.button === 2) e.preventDefault();
      if (e.button === 0) {
        this.mouse.left = true;
        this.mouse.leftClicked = true;
      }
      if (e.button === 2) {
        this.mouse.right = true;
        this.mouse.rightClicked = true;
      }
    };

    const onPointerUp = (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    };

    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("contextmenu", (e) => e.preventDefault());

    // ── Wheel ──
    window.addEventListener("wheel", (e) => {
      if (this._chatFocused) return;
      const delta = Math.sign(e.deltaY);
      if (!delta) return;
      e.preventDefault();
      for (const cb of this._onWheel) cb(delta);
    }, { passive: false });

    // ── Focus loss & visibility loss: release everything ──
    const releaseAll = () => {
      for (const action of Object.keys(this.held)) {
        this._setHeld(action, false);
      }
      this.mouse.left = false;
      this.mouse.right = false;
    };

    window.addEventListener("blur", releaseAll);
    window.addEventListener("focus", releaseAll);
    document.addEventListener("visibilitychange", releaseAll);
  }

  /** Consume the click flags (call once per frame) */
  consumeClicks() {
    const left = this.mouse.leftClicked;
    const right = this.mouse.rightClicked;
    this.mouse.leftClicked = false;
    this.mouse.rightClicked = false;
    return { left, right };
  }
}
