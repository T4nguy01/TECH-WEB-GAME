import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SKIN_ID, normalizeSkinId } from "../client/skins.js";
import {
  createDefaultInventory,
  inventoryToPublic,
  normalizePlayerInventory,
} from "../client/inventory.js";

function normalizeGameMode(mode) {
  return String(mode) === "creative" ? "creative" : "survival";
}

function nowMs() {
  return Date.now();
}

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, filePath);
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function scryptHash(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

function validateUsername(username) {
  const u = String(username || "").trim();
  if (u.length < 3 || u.length > 16) return null;
  if (!/^[a-zA-Z0-9_]+$/.test(u)) return null;
  return u;
}

function validatePassword(password) {
  const p = String(password || "");
  if (p.length < 6 || p.length > 64) return null;
  return p;
}

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(str) {
  const s = String(str).replaceAll("-", "+").replaceAll("_", "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, "base64");
}

function signHmac(secret, data) {
  return crypto.createHmac("sha256", secret).update(data).digest();
}

function loadOrCreateSecret(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (raw.length >= 32) return raw;
  } catch {
    // ignore
  }
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(filePath, secret);
  return secret;
}

export class AuthStore {
  constructor({ dataDir }) {
    this.filePath = path.join(dataDir, "accounts.json");
    this.data = readJson(this.filePath, { version: 1, users: [] });

    this.secretPath = path.join(dataDir, "auth_secret.txt");
    this.secret = loadOrCreateSecret(this.secretPath);
    this.sessionTtlMs = 24 * 60 * 60 * 1000;
  }

  _save() {
    writeJsonAtomic(this.filePath, this.data);
  }

  _findUserByUsername(username) {
    const u = String(username).toLowerCase();
    return this.data.users.find((x) => String(x.username).toLowerCase() === u) || null;
  }

  register({ username, password }) {
    const u = validateUsername(username);
    const p = validatePassword(password);
    if (!u) return { ok: false, error: "USERNAME_INVALID" };
    if (!p) return { ok: false, error: "PASSWORD_INVALID" };
    if (this._findUserByUsername(u)) return { ok: false, error: "USERNAME_TAKEN" };

    const id = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = scryptHash(p, salt);

    this.data.users.push({
      id,
      username: u,
      provider: "local",
      skin: DEFAULT_SKIN_ID,
      mode: "survival",
      inventory: createDefaultInventory(),
      salt,
      hash,
      createdAt: nowMs(),
    });
    this._save();

    const token = this._createToken({ userId: id, username: u });
    return { ok: true, token, username: u, skin: DEFAULT_SKIN_ID, mode: "survival", inventory: inventoryToPublic(createDefaultInventory()) };
  }

  login({ username, password }) {
    const u = validateUsername(username);
    const p = validatePassword(password);
    if (!u || !p) return { ok: false, error: "CREDENTIALS_INVALID" };

    const user = this._findUserByUsername(u);
    if (!user) return { ok: false, error: "CREDENTIALS_INVALID" };
    if (user.provider && user.provider !== "local") return { ok: false, error: "CREDENTIALS_INVALID" };

    const hash = scryptHash(p, user.salt);
    if (!safeEqual(hash, user.hash)) return { ok: false, error: "CREDENTIALS_INVALID" };

    const token = this._createToken({ userId: user.id, username: user.username });
    return {
      ok: true,
      token,
      username: user.username,
      skin: normalizeSkinId(user.skin),
      mode: normalizeGameMode(user.mode),
      inventory: inventoryToPublic(user.inventory || createDefaultInventory()),
    };
  }

  getUserById(userId) {
    return this.data.users.find((x) => String(x.id) === String(userId)) || null;
  }

  getSkin(userId) {
    return normalizeSkinId(this.getUserById(userId)?.skin);
  }

  updateSkin(userId, skinId) {
    const user = this.getUserById(userId);
    if (!user) return { ok: false, error: "USER_NOT_FOUND" };
    user.skin = normalizeSkinId(skinId);
    this._save();
    return { ok: true, skin: user.skin };
  }

  getInventory(userId) {
    return normalizePlayerInventory(this.getUserById(userId)?.inventory || createDefaultInventory());
  }

  updateInventory(userId, inventory) {
    const user = this.getUserById(userId);
    if (!user) return { ok: false, error: "USER_NOT_FOUND" };
    user.inventory = normalizePlayerInventory(inventory);
    this._save();
    return { ok: true, inventory: inventoryToPublic(user.inventory) };
  }

  getProfile(userId) {
    const user = this.getUserById(userId);
    if (!user) return null;
    return {
      skin: normalizeSkinId(user.skin),
      mode: normalizeGameMode(user.mode),
      inventory: inventoryToPublic(normalizePlayerInventory(user.inventory || createDefaultInventory())),
    };
  }

  updateProfile(userId, { skin, inventory } = {}) {
    const user = this.getUserById(userId);
    if (!user) return { ok: false, error: "USER_NOT_FOUND" };
    if (skin != null) user.skin = normalizeSkinId(skin);
    if (inventory != null) user.inventory = normalizePlayerInventory(inventory);
    this._save();
    return {
      ok: true,
      skin: normalizeSkinId(user.skin),
      mode: normalizeGameMode(user.mode),
      inventory: inventoryToPublic(normalizePlayerInventory(user.inventory || createDefaultInventory())),
    };
  }

  getMode(userId) {
    return normalizeGameMode(this.getUserById(userId)?.mode);
  }

  updateMode(userId, mode) {
    const user = this.getUserById(userId);
    if (!user) return { ok: false, error: "USER_NOT_FOUND" };
    user.mode = normalizeGameMode(mode);
    this._save();
    return { ok: true, mode: user.mode };
  }

  _createToken({ userId, username }) {
    const payload = {
      v: 1,
      uid: String(userId),
      u: String(username),
      iat: nowMs(),
      exp: nowMs() + this.sessionTtlMs,
    };
    const p = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
    const sig = base64UrlEncode(signHmac(this.secret, p));
    return `${p}.${sig}`;
  }

  verifyToken(token) {
    const t = String(token || "");
    const parts = t.split(".");
    if (parts.length !== 2) return null;
    const [p, sig] = parts;

    try {
      const expected = base64UrlEncode(signHmac(this.secret, p));
      if (!safeEqual(expected, sig)) return null;
      const payload = JSON.parse(base64UrlDecode(p).toString("utf8"));
      if (!payload?.uid || !payload?.u || !payload?.exp) return null;
      if (Number(payload.exp) <= nowMs()) return null;
      return { userId: String(payload.uid), username: String(payload.u) };
    } catch {
      return null;
    }
  }
}
