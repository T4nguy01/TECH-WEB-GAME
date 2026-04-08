import { TILE_SIZE, BlockTypes } from "./world.js";
import { skinById } from "./skins.js";
import { labelForItem } from "./items.js";

const PLAYER_W = 14;
const PLAYER_H = 32;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (!this.ctx) throw new Error("2D context unavailable");

    this.world = null;
    this.camera = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    this.aimBlock = null; // {x,y}
    this.breakDamage = null; // {x,y,progress,untilMs}
    this.explosions = [];
    this.particles = [];
    this.smokes = [];
    this.funOptions = { sparkles: true, disco: false, giantHead: false, jumpBurst: false };
    this._shake = null;
    this._lastRenderMs = performance.now();

    window.addEventListener("resize", () => this._resizeToCSS());
    this._resizeToCSS();
  }

  setWorld(world) {
    this.world = world;
  }

  _resizeToCSS() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const cssW = Math.max(1, this.canvas.clientWidth || this.canvas.width);
    const cssH = Math.max(1, this.canvas.clientHeight || this.canvas.height);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.camera.w = w;
    this.camera.h = h;
  }

  _blockColor(type) {
    switch (type) {
      case BlockTypes.GRASS:
        return "#4fbf5a";
      case BlockTypes.DIRT:
        return "#8b5a2b";
      case BlockTypes.STONE:
        return "#8a8f9a";
      case BlockTypes.ORE_COAL:
        return "#2b2f38";
      case BlockTypes.ORE_IRON:
        return "#c1a074";
      case BlockTypes.CHEST:
        return "#9b6a3d";
      case BlockTypes.WOOD:
        return "#7b4e2d";
      case BlockTypes.LEAVES:
        return "#3f9a4a";
      case BlockTypes.BEDROCK:
        return "#1e1f24";
      default:
        return null;
    }
  }

  _screenToWorld(sx, sy) {
    return { x: sx + this.camera.x, y: sy + this.camera.y };
  }

  _syncCamera(localPlayer) {
    if (!localPlayer) return;
    this.camera.x = localPlayer.x - this.camera.w * 0.5;
    this.camera.y = localPlayer.y - this.camera.h * 0.5;
  }

  pickBlock(clientX, clientY, localPlayer) {
    if (!this.world) return null;
    this._syncCamera(localPlayer);
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / Math.max(1, rect.width);
    const sx = (clientX - rect.left) * dpr;
    const sy = (clientY - rect.top) * dpr;
    const w = this._screenToWorld(sx, sy);
    const bx = Math.floor(w.x / TILE_SIZE);
    const by = Math.floor(w.y / TILE_SIZE);
    if (!this.world.inBounds(bx, by)) return null;

    const cx = (bx + 0.5) * TILE_SIZE;
    const cy = (by + 0.5) * TILE_SIZE;
    const dist = Math.hypot(localPlayer.x - cx, localPlayer.y - cy);
    if (dist > TILE_SIZE * 6) return null;

    return { x: bx, y: by };
  }

  pickPlayer(clientX, clientY, players, localId) {
    if (!this.world) return null;
    const local = players.find((p) => p.id === localId);
    if (!local) return null;
    this._syncCamera(local);

    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / Math.max(1, rect.width);
    const sx = (clientX - rect.left) * dpr;
    const sy = (clientY - rect.top) * dpr;

    let best = null;
    let bestDist = Infinity;
    for (const p of players) {
      if (p.id === localId) continue;
      const px = p.x - this.camera.x;
      const py = p.y - this.camera.y;
      const pad = 6;
      const x0 = px - PLAYER_W * 0.5 - pad;
      const x1 = px + PLAYER_W * 0.5 + pad;
      const y0 = py - PLAYER_H - pad;
      const y1 = py + pad;
      if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
      const dist = Math.hypot(sx - px, sy - (py - PLAYER_H * 0.5));
      if (dist < bestDist) {
        best = p;
        bestDist = dist;
      }
    }
    return best;
  }

  pickWorldPoint(clientX, clientY, localPlayer) {
    if (!this.world || !localPlayer) return null;
    this._syncCamera(localPlayer);
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / Math.max(1, rect.width);
    return {
      x: (clientX - rect.left) * dpr + this.camera.x,
      y: (clientY - rect.top) * dpr + this.camera.y,
    };
  }

  setAimBlock(b) {
    this.aimBlock = b;
  }

  setBreakDamage({ x, y, progress }) {
    if (!Number.isFinite(progress) || progress <= 0) {
      this.breakDamage = null;
      return;
    }
    this.breakDamage = { x, y, progress, untilMs: performance.now() + 500 };
  }

  addExplosion({ x, y, radius, color }) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.explosions.push({
      x,
      y,
      radius: Number.isFinite(radius) ? radius : 48,
      color: color || "rgba(255,140,60,0.9)",
      untilMs: performance.now() + 280,
    });
  }

  addSmokeCloud({ x, y, radius, durationMs, color, density, opacity }) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.smokes.push({
      x,
      y,
      radius: Number.isFinite(radius) ? radius : 72,
      density: Number.isFinite(density) ? density : 18,
      opacity: Number.isFinite(opacity) ? opacity : 0.62,
      color: color || "rgba(170,170,180,0.62)",
      untilMs: performance.now() + (Number.isFinite(durationMs) ? durationMs : 4200),
    });
  }

  triggerShake(intensity = 1, durationMs = 180) {
    this._shake = {
      intensity: Math.max(0, Number(intensity) || 0),
      untilMs: performance.now() + Math.max(1, Number(durationMs) || 1),
    };
  }

  setFunOptions(options = {}) {
    this.funOptions = {
      sparkles: Boolean(options.sparkles),
      disco: Boolean(options.disco),
      giantHead: Boolean(options.giantHead),
      jumpBurst: Boolean(options.jumpBurst),
    };
  }

  spawnSparkles(x, y, { count = 12, colors = null, spread = 1 } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const palette = colors || ["#8b7bff", "#2dd4bf", "#25d695", "#ffbd49", "#ff4d6d"];
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = 18 + Math.random() * 56 * spread;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 18,
        color: palette[i % palette.length],
        life: 0.45 + Math.random() * 0.35,
      });
    }
  }

  _tickParticles(dt) {
    const next = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += 120 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      next.push(p);
    }
    this.particles = next;
  }

  _drawParticles(ctx) {
    if (!this.particles.length) return;
    for (const p of this.particles) {
      const sx = p.x - this.camera.x;
      const sy = p.y - this.camera.y;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.8));
      ctx.beginPath();
      ctx.arc(sx, sy, 2 + ctx.globalAlpha * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawSmokes(ctx, camX, camY) {
    if (!this.smokes.length) return;
    const now = performance.now();
    this.smokes = this.smokes.filter((s) => s.untilMs > now);
    for (const smoke of this.smokes) {
      const age = 1 - (smoke.untilMs - now) / 4200;
      const baseR = smoke.radius * (0.7 + age * 0.65);
      const opacity = Number.isFinite(smoke.opacity) ? smoke.opacity : 0.62;
      const density = Math.max(10, Math.round(smoke.density || 18));
      const alpha = Math.max(0, opacity * (1 - age * 0.35));
      for (let i = 0; i < density; i += 1) {
        const angle = (Math.PI * 2 * i) / density + age * 1.8;
        const dist = baseR * (0.08 + (i % 4) * 0.16);
        const px = smoke.x + Math.cos(angle) * dist - camX;
        const py = smoke.y + Math.sin(angle) * dist * 0.6 - camY;
        ctx.fillStyle = smoke.color;
        ctx.globalAlpha = alpha * (0.72 + (i % 5) * 0.055);
        ctx.beginPath();
        ctx.arc(px, py, baseR * 0.24 + (i % 3) * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  _currentShake() {
    if (!this._shake || this._shake.untilMs <= performance.now()) return { x: 0, y: 0 };
    const remaining = Math.max(0, this._shake.untilMs - performance.now());
    const t = remaining / 180;
    const power = this._shake.intensity * t;
    return {
      x: (Math.random() - 0.5) * power * 4,
      y: (Math.random() - 0.5) * power * 4,
    };
  }

  render({ players, localId, projectiles = [], items = [] }) {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - this._lastRenderMs) / 1000));
    this._lastRenderMs = now;
    this._tickParticles(dt);
    this._resizeToCSS();
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(124,92,255,0.18)");
    g.addColorStop(0.6, "rgba(11,16,32,0.0)");
    g.addColorStop(1, "rgba(0,0,0,0.10)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (!this.world) return;

    const local = players.find((p) => p.id === localId);
    if (local) {
      this._syncCamera(local);
    }

    const shake = this._currentShake();
    const camX = this.camera.x + shake.x;
    const camY = this.camera.y + shake.y;

    const x0 = Math.max(0, Math.floor(camX / TILE_SIZE) - 1);
    const y0 = Math.max(0, Math.floor(camY / TILE_SIZE) - 1);
    const x1 = Math.min(this.world.w - 1, Math.ceil((camX + w) / TILE_SIZE) + 1);
    const y1 = Math.min(this.world.h - 1, Math.ceil((camY + h) / TILE_SIZE) + 1);

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const t = this.world.get(x, y);
        const c = this._blockColor(t);
        if (!c) continue;
        const sx = x * TILE_SIZE - camX;
        const sy = y * TILE_SIZE - camY;
        ctx.fillStyle = c;
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      }
    }

    // Aim highlight
    if (this.aimBlock && this.world.inBounds(this.aimBlock.x, this.aimBlock.y)) {
      const ax = this.aimBlock.x * TILE_SIZE - camX;
      const ay = this.aimBlock.y * TILE_SIZE - camY;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.strokeRect(ax + 1, ay + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }

    // Break progress overlay (local only)
    if (this.breakDamage && this.breakDamage.untilMs > performance.now()) {
      const bx = this.breakDamage.x * TILE_SIZE - camX;
      const by = this.breakDamage.y * TILE_SIZE - camY;
      const p = Math.max(0, Math.min(1, this.breakDamage.progress));
      ctx.fillStyle = `rgba(255, 77, 109, ${0.12 + p * 0.22})`;
      ctx.fillRect(bx, by, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = `rgba(255, 77, 109, ${0.3 + p * 0.5})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 2, by + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }

    this._drawParticles(ctx);

    this.explosions = this.explosions.filter((e) => e.untilMs > performance.now());
    for (const explosion of this.explosions) {
      const ex = explosion.x - camX;
      const ey = explosion.y - camY;
      const age = 1 - (explosion.untilMs - performance.now()) / 280;
      const radius = explosion.radius * (0.35 + age * 0.9);
      ctx.beginPath();
      ctx.strokeStyle = explosion.color;
      ctx.globalAlpha = 0.8 * (1 - age);
      ctx.lineWidth = 4;
      ctx.arc(ex, ey, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const p of players) {
      const sx = p.x - camX;
      const sy = p.y - camY;
      this._drawPlayer(ctx, sx, sy, p, p.id === localId);

      const maxHealth = Number.isFinite(p.maxHealth) ? p.maxHealth : 20;
      const ratio = maxHealth > 0 ? Math.max(0, Math.min(1, (p.health ?? 0) / maxHealth)) : 0;
      const barW = 34;
      const barH = 5;
      const barX = sx - barW * 0.5;
      const barY = sy - PLAYER_H - 24;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = ratio > 0.5 ? "rgba(37,214,149,0.95)" : ratio > 0.25 ? "rgba(255,189,73,0.95)" : "rgba(255,77,109,0.95)";
      ctx.fillRect(barX, barY, Math.max(2, barW * ratio), barH);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);

      // Chat bubble
      if (p.chat && p.chat.untilMs > performance.now()) {
        this._drawBubble(ctx, sx, sy - PLAYER_H - 10, p.chat.text);
      }

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(sx - 34, sy - PLAYER_H - 22, 68, 16);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.fillText(p.name, sx, sy - PLAYER_H - 10);
    }

    for (const projectile of projectiles) {
      const px = projectile.x - camX;
      const py = projectile.y - camY;
      const radius = Number.isFinite(projectile.radius) ? projectile.radius : 4;
      ctx.beginPath();
      ctx.fillStyle = projectile.color || "rgba(255,255,255,0.9)";
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (const item of items) {
      const bob = Math.sin((performance.now() * 0.004) + (item.bobSeed || 0)) * 3;
      const sx = item.x - camX;
      const sy = item.y - camY + bob;
      const label = labelForItem(item.itemType) || "?";

      ctx.fillStyle = "rgba(10,15,28,0.72)";
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      this._roundRect(ctx, sx - 12, sy - 12, 24, 24, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, sx, sy - 1);

      if (item.count > 1) {
        ctx.fillStyle = "rgba(255,255,255,0.86)";
        ctx.font = "10px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
        ctx.fillText(`x${item.count}`, sx, sy + 9);
      }
    }

    this._drawSmokes(ctx, camX, camY);
  }

  _drawPlayer(ctx, sx, sy, player, isLocal) {
    const skin = skinById(player.skin);
    const x = Math.round(sx - PLAYER_W * 0.5);
    const y = Math.round(sy - PLAYER_H);
    const outline = skin.outline;
    const body = skin.body;
    const accent = skin.accent;
    const hair = skin.hair;

    const disco = isLocal && this.funOptions.disco;
    const giantHead = isLocal && this.funOptions.giantHead;
    const rainbow = disco ? `hsl(${Math.floor(performance.now() * 0.1) % 360} 85% 65%)` : outline;

    ctx.fillStyle = rainbow;
    ctx.fillRect(x - 1, y - 1, PLAYER_W + 2, PLAYER_H + 2);

    ctx.fillStyle = hair;
    ctx.fillRect(x + 1, y + 1, PLAYER_W - 2, giantHead ? 10 : 7);

    ctx.fillStyle = body;
    ctx.fillRect(x + 1, y + (giantHead ? 10 : 7), PLAYER_W - 2, giantHead ? 15 : 12);

    ctx.fillStyle = accent;
    ctx.fillRect(x + 1, y + (giantHead ? 25 : 19), PLAYER_W - 2, giantHead ? 10 : 8);

    ctx.fillStyle = isLocal ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(x + 3, y + (giantHead ? 13 : 9), PLAYER_W - 6, 2);
    ctx.fillRect(x + 3, y + (giantHead ? 28 : 22), PLAYER_W - 6, 2);

    ctx.fillStyle = disco ? `hsl(${Math.floor(performance.now() * 0.15) % 360} 90% 72%)` : skin.namePlate || "rgba(255,255,255,0.9)";
    ctx.fillRect(x + 4, y + 4, 2, 2);
    ctx.fillRect(x + PLAYER_W - 6, y + 4, 2, 2);
  }

  _drawBubble(ctx, x, y, text) {
    const padX = 8;
    const padY = 6;
    const maxW = 220;
    ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lines = this._wrapText(ctx, String(text), maxW - padX * 2);
    const lineH = 14;
    const w = Math.min(
      maxW,
      Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2
    );
    const h = lines.length * lineH + padY * 2;

    const bx = Math.round(x - w / 2);
    const by = Math.round(y - h);
    const r = 10;

    ctx.fillStyle = "rgba(11,16,32,0.78)";
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;

    this._roundRect(ctx, bx, by, w, h, r);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    for (let i = 0; i < lines.length; i += 1) {
      ctx.fillText(lines[i], x, by + padY + lineH * 0.5 + i * lineH);
    }
  }

  _wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width <= maxWidth) {
        line = next;
      } else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}
