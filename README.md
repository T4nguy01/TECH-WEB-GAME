# 🌍 Web Sandbox 2D (Multiplayer Prototype)

[![Node.js](https://img.shields.io/badge/Node.js-v18+-68a063.svg)](https://nodejs.org/)
[![WebSockets](https://img.shields.io/badge/WebSockets-ws-blue.svg)](https://github.com/websockets/ws)
[![Graphics](https://img.shields.io/badge/Graphics-Canvas_2D-f34b7d.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_2D_API)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A high-performance, modular 2D multiplayer sandbox engine running entirely in the browser. Inspired by classic survival-crafting games, this prototype features a robust authoritative server model, procedural world generation, and a premium visual experience.

> [!NOTE]
> This is a production-quality prototype designed for extensibility and ease of use.

## ✨ Features

- **🌐 Multiplayer by Design**: Real-time player synchronization using an authoritative Node.js server and WebSockets.
- **🖼️ Premium Rendering**: 
  - **Parallax Background**: Multi-layered depth for an immersive environment.
  - **Smooth Lighting**: Ambient occlusion and soft shadows for world geometry.
  - **Procedural Textures**: Organic material-based block rendering (Grass, Dirt, Stone, Ores).
  - **Dynamic Particles**: Fluid sparkle and smoke effects for interactions.
- **🧱 Sandbox Mechanics**:
  - **World Generation**: Procedural map generation with multiple biomes and ore distribution.
  - **Building & Mining**: Server-validated block placement and mining with durability.
  - **Inventory System**: Comprehensive slot-based inventory with crafting support.
- **🔒 Persistence & Auth**: Secure HMAC-signed session tokens and automatic world autosaving every 30 seconds.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Version 18 or higher)
- npm (installed with Node.js)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/web-game-sandbox.git
   cd web-game-sandbox
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Game

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

*To simulate multiplayer, simply open the URL in multiple tabs or windows!*

### World Management

To reset the world and generate a fresh map:
```bash
npm run reset-world
```
*(Remember to restart the server after resetting the world)*

---

## 🎮 Controls

| Action | Key / Input |
| :--- | :--- |
| **Move Left / Right** | `A` or `Q` / `D` |
| **Jump** | `W`, `Z`, or `Space` |
| **Mine / Attack** | `Left Click` (Hold) |
| **Place / Interact** | `Right Click` |
| **Inventory** | `E` (Toggle) |
| **Chat** | `Enter` (Focus / Send) |
| **Hotbar** | `1-9` or `Scroll Wheel` |

---

## 🛠️ Architecture

The codebase is designed to be lean, modular, and dependency-free on the client side.

- **`client/`**: Browser-side logic (Canvas 2D rendering, UI state, WebSocket client).
- **`server/`**: Node.js authoritative server (Gameplay state, World persistence, Auth).
- **`shared/`**: Shared constants and utilities used by both client and server.
- **`data/`**: Local storage for world persistence and account data.
- **`assets/`**: Texture packs and sprites (future integration).

---

## 📜 License

This project is licensed under the **MIT License**. See the `LICENSE` file for more details.

---

*Made with ❤️ for the 2D Sandbox Community.*
