export class Player {
  constructor({ id, name, skin = "classic" }) {
    this.id = id;
    this.name = name;
    this.skin = skin;

    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.health = 20;
    this.maxHealth = 20;

    this.chat = null; // { text, untilMs }
  }

  applyServerState(s) {
    this.x = s.x;
    this.y = s.y;
    this.vx = s.vx;
    this.vy = s.vy;
    this.onGround = s.onGround;
    this.health = s.health;
    this.maxHealth = s.maxHealth ?? this.maxHealth;
    this.skin = s.skin || this.skin;
  }

  setChatBubble(text, durationMs = 3500) {
    this.chat = { text: String(text).slice(0, 120), untilMs: performance.now() + durationMs };
  }
}
