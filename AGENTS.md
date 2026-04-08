# Project Guidelines (WEB-GAME Sandbox)

This repository is a production-quality, modular multiplayer 2D sandbox prototype (Terraria-like) running locally in a browser.

## Goals

- Keep the codebase clean, small, and easy to extend.
- Server is authoritative for gameplay state (world, players, block updates).
- Client is responsible for rendering, input capture, and UI only.
- Multiplayer uses WebSockets (`ws`).
- Persistence uses JSON save files under `data/`.

## Architecture

**Folders**
- `client/`: browser code (Canvas 2D, UI, network client).
- `server/`: Node.js server (HTTP static, WebSocket gameplay, worldgen, save).
- `data/`: local persistent files (`world.json`, `accounts.json`, `auth_secret.txt`).
- `assets/`: textures/sprites (future).

**Authoritative model**
- Server owns:
  - world tiles
  - block mining/breaking results
  - placement validation
  - player physics/collisions
  - chat broadcast
- Client owns:
  - rendering and camera
  - local HUD/UI
  - sending input + action requests (mine/place/chat)
  - transient visuals (aim highlight, mining overlay, chat bubbles)

## Networking Protocol

**Rule: never reuse `type` for payload fields.**
- `type` is reserved for message kind only (e.g. `"blockUpdate"`).
- For blocks, use `blockType`.

**Client → Server**
- `input`: `{ input: { left, right, jump, hotbar } }`
- `chat`: `{ text }`
- `breakBlock`: `{ x, y }` (request; server decides)
- `placeBlock`: `{ x, y, blockType }` (request; server validates)

**Server → Client**
- `welcome`: `{ id, hotbar }`
- `world`: `{ world: { w, h, rle } }`
- `state`: `{ players: [...] }`
- `blockUpdate`: `{ x, y, blockType }`
- `blockDamage`: `{ x, y, progress }` (per-connection feedback)
- `chat`: `{ id|null, name, text }`

## Gameplay Rules (current prototype)

- Mining is server-side with durability; tools affect mining speed.
- Placement is server-validated by selected hotbar item.
- Prevent placing blocks inside any player AABB.
- Reach check is enforced server-side for mine/place.

## Rendering Coordinate Conventions

- Tile size: `16px`.
- Player `x,y` is **world-space pixels**.
- Player `y` represents the **bottom** of the character (feet).
- Client rendering must match server collision box:
  - width: `14px`
  - height: `32px`

## Persistence & Auth

- World autosaves every 30 seconds to `data/world.json`.
- Accounts are stored in `data/accounts.json`.
- Tokens are HMAC-signed and persist across server restarts:
  - secret stored in `data/auth_secret.txt` (ignored by git).

## Code Quality Rules

- Avoid duplication; prefer small helpers and shared constants.
- Keep changes focused; don’t refactor unrelated code.
- Validate all untrusted inputs on the server.
- Keep client modules dependency-free (no bundler required).
- Prefer clear naming over cleverness.

## How to Run

- Install: `npm install`
- Start: `node server/server.js`
- Open: `http://localhost:3000` (multiple tabs simulate multiple players)

