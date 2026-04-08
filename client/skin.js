import { SKINS, defaultSkinId, normalizeSkinId, skinById } from "./skins.js";

const SKIN_KEY = "webgame_skin";

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    return { ok: false, error: json?.error || "BAD_REQUEST" };
  }
  return json;
}

export class SkinUI {
  constructor({ buttonEl, overlayEl, gridEl, closeEl }) {
    this.buttonEl = buttonEl;
    this.overlayEl = overlayEl;
    this.gridEl = gridEl;
    this.closeEl = closeEl;
    this._currentSkin = normalizeSkinId(localStorage.getItem(SKIN_KEY) || defaultSkinId());

    this.buttonEl?.addEventListener("click", () => this.open());
    this.closeEl?.addEventListener("click", () => this.close());
    this.overlayEl?.addEventListener("click", (e) => {
      if (e.target === this.overlayEl) this.close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (this.isOpen()) {
        e.preventDefault();
        this.close();
      }
    });
  }

  isOpen() {
    return !!this.overlayEl && !this.overlayEl.classList.contains("hidden");
  }

  getCurrentSkin() {
    return this._currentSkin;
  }

  syncFromStorage() {
    this._currentSkin = normalizeSkinId(localStorage.getItem(SKIN_KEY) || this._currentSkin);
    this._render();
  }

  open() {
    this._render();
    this.overlayEl?.classList.remove("hidden");
  }

  close() {
    this.overlayEl?.classList.add("hidden");
  }

  async saveSkin(skinId) {
    const normalized = normalizeSkinId(skinId);
    const token = localStorage.getItem("webgame_token");
    if (!token) return { ok: false, error: "AUTH_REQUIRED" };

    const r = await postJson("/api/skin", { token, skinId: normalized });
    if (!r.ok) return r;

    this._currentSkin = r.skin || normalized;
    localStorage.setItem(SKIN_KEY, this._currentSkin);
    this._render();
    return { ok: true, skin: this._currentSkin };
  }

  _render() {
    if (!this.gridEl) return;
    this.gridEl.innerHTML = "";

    for (const skin of SKINS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `skinCard ${skin.id === this._currentSkin ? "active" : ""}`;
      btn.setAttribute("aria-pressed", skin.id === this._currentSkin ? "true" : "false");

      const preview = document.createElement("div");
      preview.className = "skinPreview";
      preview.style.setProperty("--skin-body", skin.body);
      preview.style.setProperty("--skin-accent", skin.accent);
      preview.style.setProperty("--skin-hair", skin.hair);
      preview.style.setProperty("--skin-outline", skin.outline);

      const label = document.createElement("div");
      label.className = "skinLabel";
      label.textContent = skin.label;

      btn.appendChild(preview);
      btn.appendChild(label);
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const result = await this.saveSkin(skin.id);
        btn.disabled = false;
        if (!result.ok) return;
      });

      this.gridEl.appendChild(btn);
    }

    const current = skinById(this._currentSkin);
    this.overlayEl?.style.setProperty("--current-skin-accent", current.accent);
  }
}
