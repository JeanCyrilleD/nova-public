// Pont vers les vrais volets web natifs de l'application Mac (WKWebView persistants : sessions WhatsApp, Telegram, Facebook, navigation).
// Hors de l'app Mac (navigateur de test), isNative() est faux et les onglets le disent honnêtement.
const post = (m) => { try { window.webkit.messageHandlers.nova.postMessage(m); return true; } catch { return false; } };
export const isNative = () => !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nova) && window.__NOVA_NATIVE_WEB === true;
const torL = new Set(); const listeners = new Set(); const waiters = new Map();
window.NovaNative = {
  onNav: (st) => listeners.forEach((f) => f(st)),
  onTor: (st) => torL.forEach((f) => f(st)),
  onText: (id, text) => { const w = waiters.get(id); if (w) { waiters.delete(id); w(text); } },
};
export const onNav = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const web = {
  show: (id, url, r) => post({ cmd: "web.show", id, url, x: r.x, y: r.y, w: r.w, h: r.h }),
  move: (id, r) => post({ cmd: "web.move", id, x: r.x, y: r.y, w: r.w, h: r.h }),
  hideAll: () => post({ cmd: "web.hideAll" }),
  nav: (id, action, url) => post({ cmd: "web.nav", id, action, url }),
  close: (id) => post({ cmd: "web.close", id }),
  text: (id, ms = 6000) => new Promise((res) => { waiters.set(id, res); post({ cmd: "web.text", id }); setTimeout(() => { if (waiters.has(id)) { waiters.delete(id); res(""); } }, ms); }),
};
export const winFS = (on) => post({ cmd: "win.fs", on });
export const tor = { start: () => post({ cmd: "tor.start" }), status: () => post({ cmd: "tor.status" }), on: (f) => { torL.add(f); return () => torL.delete(f); } };
export const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
