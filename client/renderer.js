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
    this._lastRenderMs = performance.now();
    this._bgSeed = Math.random();
    this._vignette = null;

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
      const alpha = Math.max(0, Math.min(1, p.life / 0.8));
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      const size = (2 + alpha * 2.5) * (1 + Math.sin(performance.now() * 0.01) * 0.2);
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
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

    const local = players.find((p) => p.id === localId);
    if (local) {
      this._syncCamera(local);
    }

    const shake = this._currentShake();
    const camX = this.camera.x + shake.x;
    const camY = this.camera.y + shake.y;

    this._drawBackground(ctx, w, h, camX, camY);

    if (!this.world) return;

    const x0 = Math.max(0, Math.floor(camX / TILE_SIZE) - 1);
    const y0 = Math.max(0, Math.floor(camY / TILE_SIZE) - 1);
    const x1 = Math.min(this.world.w - 1, Math.ceil((camX + w) / TILE_SIZE) + 1);
    const y1 = Math.min(this.world.h - 1, Math.ceil((camY + h) / TILE_SIZE) + 1);

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const type = this.world.get(x, y);
        if (type === BlockTypes.AIR) continue;
        const sx = x * TILE_SIZE - camX;
        const sy = y * TILE_SIZE - camY;
        this._drawBlock(ctx, sx, sy, x, y, type);
      }
    }

    this._drawVignette(ctx, w, h);

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
      
      // Cracks overlay
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const seed = this.breakDamage.x * 123 + this.breakDamage.y * 456;
      for (let i = 0; i < 4; i++) {
          const angle = (seed + i * 90) * (Math.PI / 180);
          const r = 4 + p * 10;
          ctx.moveTo(bx + TILE_SIZE/2, by + TILE_SIZE/2);
          ctx.lineTo(bx + TILE_SIZE/2 + Math.cos(angle) * r, by + TILE_SIZE/2 + Math.sin(angle) * r);
      }
      ctx.stroke();

      ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + p * 0.15})`;
      ctx.fillRect(bx, by, TILE_SIZE, TILE_SIZE);
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

      // Inner glow
      const itemGrad = ctx.createRadialGradient(sx, sy, 2, sx, sy, 14);
      itemGrad.addColorStop(0, "rgba(139, 123, 255, 0.15)");
      itemGrad.addColorStop(1, "rgba(139, 123, 255, 0)");
      ctx.fillStyle = itemGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(10,15,28,0.8)";
      this._roundRect(ctx, sx - 12, sy - 12, 24, 24, 8);
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
    const time = performance.now() * 0.001;
    
    // Animation states
    const isMoving = Math.abs(player.vx || 0) > 20;
    const breathe = Math.sin(time * 3) * 0.5 + 0.5; // 0 to 1
    const walk = isMoving ? Math.sin(time * 15) : 0;
    
    ctx.save();
    ctx.translate(sx, sy);
    
    // Tilt when moving
    if (isMoving) {
        ctx.rotate(player.vx * 0.0002);
    }
    
    // Slight squashing based on breathing
    ctx.scale(1 + breathe * 0.02, 1 - breathe * 0.02);

    const x = -PLAYER_W * 0.5;
    const y = -PLAYER_H;
    const outline = skin.outline;
    const body = skin.body;
    const accent = skin.accent;
    const hair = skin.hair;

    const disco = isLocal && this.funOptions.disco;
    const giantHead = isLocal && this.funOptions.giantHead;
    const rainbow = disco ? `hsl(${Math.floor(performance.now() * 0.1) % 360} 85% 65%)` : outline;

    // Outline / Border
    ctx.fillStyle = rainbow;
    this._roundRect(ctx, x - 1, y - 1, PLAYER_W + 2, PLAYER_H + 2, 6);
    ctx.fill();

    // Hair / Head
    ctx.fillStyle = hair;
    this._roundRect(ctx, x + 1, y + 1, PLAYER_W - 2, giantHead ? 10 : 7, 4);
    ctx.fill();

    // Body
    ctx.fillStyle = body;
    ctx.fillRect(x + 1, y + (giantHead ? 10 : 7), PLAYER_W - 2, giantHead ? 15 : 12);

    // Legs / Accent
    ctx.fillStyle = accent;
    const legOffset = walk * 2;
    ctx.fillRect(x + 1, y + (giantHead ? 25 : 19), PLAYER_W - 2, giantHead ? 10 : 8);

    // Details / Shine
    ctx.fillStyle = isLocal ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)";
    ctx.fillRect(x + 3, y + (giantHead ? 13 : 9), PLAYER_W - 6, 2);
    ctx.fillRect(x + 3, y + (giantHead ? 28 : 22), PLAYER_W - 6, 2);

    // Eyes
    ctx.fillStyle = disco ? `hsl(${Math.floor(performance.now() * 0.15) % 360} 90% 72%)` : skin.namePlate || "rgba(255,255,255,0.9)";
    const eyeBlink = Math.sin(time * 0.5) > 0.98 ? 0 : 2;
    if (eyeBlink > 0) {
        ctx.fillRect(x + 4, y + 4, 3, eyeBlink);
        ctx.fillRect(x + PLAYER_W - 7, y + 4, 3, eyeBlink);
    }
    
    ctx.restore();
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

  _drawBlock(ctx, sx, sy, bx, by, type) {
    const baseColor = this._blockColor(type);
    if (!baseColor) return;

    // Base Fill
    ctx.fillStyle = baseColor;
    ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

    // Texture Pattern
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ffffff";
    if (type === BlockTypes.STONE || type === BlockTypes.ORE_COAL || type === BlockTypes.ORE_IRON) {
      // Noise / Crackle for stone
      const noise = (Math.sin(bx * 13 + by * 37) * 0.5 + 0.5);
      if (noise > 0.7) ctx.fillRect(sx + 2, sy + 3, 4, 1);
      if (noise < 0.3) ctx.fillRect(sx + 8, sy + 10, 2, 2);
    } else if (type === BlockTypes.GRASS) {
      // Blade shapes
      ctx.fillRect(sx + 4, sy + 2, 1, 3);
      ctx.fillRect(sx + 10, sy + 1, 1, 4);
    } else if (type === BlockTypes.DIRT) {
      // Specks
      ctx.fillRect(sx + 3, sy + 5, 2, 1);
      ctx.fillRect(sx + 11, sy + 9, 1, 2);
    }
    ctx.globalAlpha = 1.0;

    // Top Highlight / Shine
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(sx, sy, TILE_SIZE, 1);
    ctx.fillRect(sx, sy, 1, TILE_SIZE);

    // Ambient Occlusion (Shadows from neighbors)
    const neighbors = [
      { x: 0, y: -1, code: 1 }, // T
      { x: -1, y: 0, code: 2 }, // L
    ];
    
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    if (this._isSolid(bx, by - 1)) ctx.fillRect(sx, sy, TILE_SIZE, 3); // Top shadow
    if (this._isSolid(bx - 1, by)) ctx.fillRect(sx, sy, 3, TILE_SIZE); // Left shadow
    
    // Smooth corners
    if (this._isSolid(bx - 1, by - 1) && !this._isSolid(bx, by - 1) && !this._isSolid(bx - 1, by)) {
      ctx.fillRect(sx, sy, 4, 4);
    }

    // Material specific overlays
    if (type === BlockTypes.ORE_COAL) {
      ctx.fillStyle = "#111111";
      ctx.fillRect(sx + 4, sy + 4, 3, 3);
      ctx.fillRect(sx + 10, sy + 8, 2, 2);
    } else if (type === BlockTypes.ORE_IRON) {
      ctx.fillStyle = "#e8d0b0";
      ctx.fillRect(sx + 5, sy + 3, 4, 2);
      ctx.fillRect(sx + 2, sy + 10, 3, 3);
    }
  }

  _isSolid(x, y) {
    if (!this.world) return false;
    return this.world.get(x, y) !== BlockTypes.AIR;
  }

  _drawBackground(ctx, w, h, camX, camY) {
    const time = performance.now() * 0.0001;
    
    // Layer 1: Distant Mountains (Very slow parallax)
    this._drawParallaxLayer(ctx, w, h, camX * 0.05, camY * 0.02, 160, "rgba(20, 25, 45, 0.4)", 0.4);
    
    // Layer 2: Mid Hills (Medium parallax)
    this._drawParallaxLayer(ctx, w, h, camX * 0.15, camY * 0.05, 120, "rgba(30, 40, 70, 0.3)", 0.6);
    
    // Layer 3: Nearer Details (Faster parallax)
    this._drawParallaxLayer(ctx, w, h, camX * 0.3, camY * 0.1, 80, "rgba(40, 55, 95, 0.2)", 0.8);

    // Clouds
    ctx.globalAlpha = 0.15;
    const cloudColor = "rgba(255,255,255,0.4)";
    for (let i = 0; i < 5; i++) {
        const offset = i * 400 + time * 1000 * (0.5 + i * 0.2);
        const cx = (offset % (w + 400)) - 200;
        const cy = 100 + Math.sin(time + i) * 50;
        this._drawCloud(ctx, cx, cy, 60 + i * 10, cloudColor);
    }
    ctx.globalAlpha = 1.0;
  }

  _drawParallaxLayer(ctx, w, h, offX, offY, height, color, scale) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 40) {
      const worldX = x + offX;
      const noise = Math.sin(worldX * 0.005 * scale) * 40 + Math.sin(worldX * 0.012 * scale) * 20;
      const py = h - height - noise - offY * 0.5;
      ctx.lineTo(x, py);
    }
    ctx.lineTo(w, h);
    ctx.fill();
  }

  _drawCloud(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.arc(x + size * 0.6, y - size * 0.3, size * 0.8, 0, Math.PI * 2);
    ctx.arc(x + size * 1.2, y, size * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawVignette(ctx, w, h) {
    if (!this._vignette || this._vignette.w !== w || this._vignette.h !== h) {
      this._vignette = { w, h, grad: ctx.createRadialGradient(w/2, h/2, w/4, w/2, h/2, w*0.8) };
      this._vignette.grad.addColorStop(0, "rgba(0,0,0,0)");
      this._vignette.grad.addColorStop(1, "rgba(0,0,0,0.35)");
    }
    ctx.fillStyle = this._vignette.grad;
    ctx.fillRect(0, 0, w, h);
  }
}
