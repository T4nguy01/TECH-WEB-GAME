const TOKEN_KEY = "webgame_token";
const USERNAME_KEY = "webgame_username";
const SKIN_KEY = "webgame_skin";

function mapError(code) {
  switch (code) {
    case "USERNAME_INVALID":
      return "Le nom d'utilisateur doit faire 3 à 16 caractères : lettres, chiffres ou underscore.";
    case "PASSWORD_INVALID":
      return "Le mot de passe doit faire 6 à 64 caractères.";
    case "USERNAME_TAKEN":
      return "Ce nom d'utilisateur est déjà pris.";
    case "CREDENTIALS_INVALID":
      return "Nom d'utilisateur ou mot de passe invalide.";
    default:
      return "Une erreur est survenue. Réessaie.";
  }
}

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

export class AuthUI {
  constructor() {
    this.overlayEl = document.getElementById("authOverlay");
    this.formEl = document.getElementById("authForm");
    this.userEl = document.getElementById("authUser");
    this.passEl = document.getElementById("authPass");
    this.errorEl = document.getElementById("authError");
    this.btnLogin = document.getElementById("btnLogin");
    this.btnRegister = document.getElementById("btnRegister");

    if (!this.overlayEl) throw new Error("Missing auth overlay");
    this._busy = false;

    this.btnLogin?.addEventListener("click", () => this._submit("login"));
    this.btnRegister?.addEventListener("click", () => this._submit("register"));
    this.formEl?.addEventListener("submit", (e) => {
      e.preventDefault();
      this._submit("login");
    });
  }

  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    localStorage.removeItem(SKIN_KEY);
  }

  async requireAuth() {
    const existing = this.getToken();
    if (existing) {
      return {
        token: existing,
        username: localStorage.getItem(USERNAME_KEY) || "",
        skin: localStorage.getItem(SKIN_KEY) || "classic",
      };
    }
    this.show();
    return await new Promise((resolve) => {
      this._resolveAuth = resolve;
    });
  }

  show() {
    this.errorEl.textContent = "";
    this.overlayEl.classList.remove("hidden");
    this.userEl?.focus();
  }

  hide() {
    this.overlayEl.classList.add("hidden");
  }

  _setBusy(busy) {
    this._busy = busy;
    if (this.btnLogin) this.btnLogin.disabled = busy;
    if (this.btnRegister) this.btnRegister.disabled = busy;
    if (this.userEl) this.userEl.disabled = busy;
    if (this.passEl) this.passEl.disabled = busy;
  }

  async _submit(mode) {
    if (this._busy) return;
    const username = String(this.userEl?.value || "").trim();
    const password = String(this.passEl?.value || "");
    this.errorEl.textContent = "";

    this._setBusy(true);
    const endpoint = mode === "register" ? "/api/register" : "/api/login";
    const r = await postJson(endpoint, { username, password });
    this._setBusy(false);

    if (!r.ok) {
      this.errorEl.textContent = mapError(r.error);
      return;
    }

    localStorage.setItem(TOKEN_KEY, r.token);
    localStorage.setItem(USERNAME_KEY, r.username || username);
    if (r.skin) localStorage.setItem(SKIN_KEY, r.skin);
    this.hide();
    this._resolveAuth?.({ token: r.token, username: r.username || username, skin: r.skin || "classic" });
  }
}
