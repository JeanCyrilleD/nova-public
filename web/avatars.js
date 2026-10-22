// V16 — choix d'avatars : le panda 3D d'origine + des orbes à visage (même moteur que les Dots), tous reliés à l'état réel de l'assistant.
import { createAvatar } from "./avatar.js";
import { mountDot3D, webglOK } from "./dot3d.js";
import { MASCOTS, createCompagnon } from "./compagnon.js";

export const AVATARS = [
  ...MASCOTS.map(([id, name, desc]) => ({ id: "c_" + id, name, desc, color: "#FF8A3D", compagnon: id })),
  { id: "panda", name: "Panda", desc: "Le compagnon d'origine : bras, oreilles, accessoires du thème.", color: "#f6f4ee" },
  { id: "capitaine", name: "Carmin", desc: "Orbe carmin, regard franc.", color: "#D93226", face: { glasses: false, eye: 1.1, smile: .45, brow: .05 } },
  { id: "aurore", name: "Aurore", desc: "Orbe or, vive et souriante.", color: "#e0a030", face: { glasses: false, eye: 1.25, smile: .6, brow: .15 } },
  { id: "idris", name: "Idris", desc: "Orbe turquoise à lunettes, posé.", color: "#2fb5a8", face: { glasses: true, eye: .95, smile: .25, brow: -.03 } },
  { id: "emeraude", name: "Émeraude", desc: "Orbe vert, joyeuse.", color: "#35c48a", face: { glasses: false, eye: 1.2, smile: .7, brow: .12 } },
  { id: "saphir", name: "Saphir", desc: "Orbe bleu à lunettes, sérieux.", color: "#4f7cff", face: { glasses: true, eye: 1, smile: .3, brow: .02 } },
  { id: "perle", name: "Perle", desc: "Orbe nacré, discret.", color: "#cfc8bd", face: { glasses: false, eye: 1.05, smile: .35, brow: 0 } },
];
const PHASE = { idle: "idle", listening: "listening", thinking: "working", tool: "working", speaking: "speaking", error: "idle" };

function createOrb(host, a) {
  const holder = document.createElement("div"); holder.style.cssText = "position:absolute;inset:0"; host.appendChild(holder);
  const m = mountDot3D(holder, a.color, 300, { face: a.face }, { zoom: 3.5 }); if (!m) { holder.remove(); return null; }
  m.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
  const fit = () => { const w = host.clientWidth || 200, h = host.clientHeight || 200; m.resize(w, h); };
  const ro = new ResizeObserver(fit); ro.observe(host); fit();
  let state = "idle";
  return {
    setState(s) { state = s; m.setPhase(PHASE[s] || "idle"); m.setMood(s === "error" ? "confused" : "calm"); },
    setLevel(v) { m.setLevel(v); },
    setTheme() {}, lookAt() {}, get state() { return state; },
    destroy() { ro.disconnect(); m.dispose(); holder.remove(); },
  };
}

/** Proxy : même API que createAvatar, mais l'implémentation peut être changée à chaud. */
export function createAvatarManager(host, first = "panda") {
  let cur = null, impl = null, state = "idle", level = 0, theme = null, accent = null;
  const make = (id) => {
    const a = AVATARS.find((x) => x.id === id) || AVATARS[0];
    if (impl && impl.destroy) { try { impl.destroy(); } catch {} } impl = null;
    for (const c of [...host.children]) if (c.tagName === "CANVAS" || c.dataset?.avatarHolder) c.remove();
    impl = a.compagnon ? createCompagnon(host, a.compagnon) : (a.id !== "panda" && webglOK() ? createOrb(host, a) : null);
    if (!impl) impl = createAvatar(host); cur = a.compagnon ? a.id : (impl === null ? "panda" : (a.id !== "panda" && impl && !impl._head ? a.id : "panda"));
    impl.setState(state); impl.setLevel(level); if (theme) impl.setTheme(theme, accent);
  };
  make(first);
  return {
    get kind() { return cur; },
    setKind(id) { if (id !== cur) make(id); },
    setState(s) { state = s; impl.setState(s); }, setLevel(v) { level = v; impl.setLevel(v); },
    setTheme(t, ac) { theme = t; accent = ac; impl.setTheme && impl.setTheme(t, ac); },
    lookAt(x, y) { impl.lookAt && impl.lookAt(x, y); }, react(m) { impl && impl.react && impl.react(m); },
    get state() { return state; }, get fps() { return impl.fps || 0; },
    snapshot() { return impl.snapshot ? impl.snapshot() : ""; },
  };
}
