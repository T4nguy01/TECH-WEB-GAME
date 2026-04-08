export class NetworkClient {
  constructor({ url, onStatus, onClose }) {
    this.url = url;
    this.onStatus = onStatus;
    this.onClose = onClose;
    this.ws = null;
    this.handlers = new Map();
    this._lastInputSent = 0;
    this.token = null;
  }

  on(type, fn) {
    this.handlers.set(type, fn);
  }

  _emit(type, msg) {
    const fn = this.handlers.get(type);
    if (fn) fn(msg);
  }

  connect({ token } = {}) {
    this.token = token || null;
    this.onStatus?.("offline");
    const wsUrl = this.token ? `${this.url}?token=${encodeURIComponent(this.token)}` : this.url;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.addEventListener("open", () => this.onStatus?.("online"));
    ws.addEventListener("close", (ev) => {
      this.onStatus?.("offline");
      this.onClose?.(ev);
    });
    ws.addEventListener("error", () => this.onStatus?.("offline"));

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (!msg || typeof msg.type !== "string") return;
        this._emit(msg.type, msg);
      } catch {
        // Ignore malformed frames from the network instead of crashing the client.
      }
    });
  }

  send(type, data = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, ...data }));
  }

  sendInput(input) {
    const now = performance.now();
    if (now - this._lastInputSent < 50) return;
    this._lastInputSent = now;
    this.send("input", { input });
  }
}
