import { Game } from "./game.js";
import { Renderer } from "./renderer.js";
import { NetworkClient } from "./network.js";
import { UI } from "./ui.js";
import { AuthUI } from "./auth.js";
import { SkinUI } from "./skin.js";

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing #game canvas");

const netStatusEl = document.getElementById("netStatus");
const fpsEl = document.getElementById("fps");
const posEl = document.getElementById("pos");

const renderer = new Renderer(canvas);
const ui = new UI({
  hotbarEl: document.getElementById("hotbar"),
  chatLogEl: document.getElementById("chatLog"),
  chatFormEl: document.getElementById("chatForm"),
  chatInputEl: document.getElementById("chatInput"),
  inventoryOverlayEl: document.getElementById("inventoryOverlay"),
  inventorySubEl: document.getElementById("inventorySub"),
  inventoryGridEl: document.getElementById("inventoryGrid"),
  chestSectionEl: document.getElementById("chestSection"),
  chestGridEl: document.getElementById("chestGrid"),
  craftListEl: document.getElementById("craftList"),
  modeButtonEl: document.getElementById("modeButton"),
  funButtonEl: document.getElementById("funButton"),
  funOverlayEl: document.getElementById("funOverlay"),
  funCloseEl: document.getElementById("funClose"),
  sparkleToggleEl: document.getElementById("sparkleToggle"),
  discoToggleEl: document.getElementById("discoToggle"),
  giantHeadToggleEl: document.getElementById("giantHeadToggle"),
  jumpBurstToggleEl: document.getElementById("jumpBurstToggle"),
  inventoryDropEl: document.getElementById("inventoryDrop"),
  inventoryButtonEl: document.getElementById("inventoryButton"),
  inventoryCloseEl: document.getElementById("inventoryClose"),
});

const auth = new AuthUI();
const skinUI = new SkinUI({
  buttonEl: document.getElementById("skinButton"),
  overlayEl: document.getElementById("skinOverlay"),
  gridEl: document.getElementById("skinGrid"),
  closeEl: document.getElementById("skinClose"),
});
skinUI.syncFromStorage();

const network = new NetworkClient({
  url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
  onStatus(status) {
    netStatusEl.textContent = status === "online" ? "en ligne" : "hors ligne";
    netStatusEl.className = `pill ${status === "online" ? "ok" : "err"}`;
  },
  onClose(ev) {
    if (ev.code === 4001) {
      auth.clearToken();
      auth.show();
    }
  },
});

const game = new Game({ renderer, network, ui });

let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let fps = 0;

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  game.update(dt);
  game.render();

  fpsAcc += dt;
  fpsFrames += 1;
  if (fpsAcc >= 0.5) {
    fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
  }

  fpsEl.textContent = `FPS : ${fps}`;
  const p = game.getLocalPlayer();
  if (p) posEl.textContent = `x: ${p.x.toFixed(1)} y: ${p.y.toFixed(1)}`;

  requestAnimationFrame(frame);
}

auth.requireAuth().then(({ token }) => {
  skinUI.syncFromStorage();
  network.connect({ token });
});
requestAnimationFrame(frame);
