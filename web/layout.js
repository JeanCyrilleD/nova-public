// Disposition + persistance unique des préférences d'affichage.
//
// PERSISTANCE (helper unique) — toute clé localStorage « nova… » listée dans TRACKED est :
//   1. copiée côté serveur (réglage « ui_prefs » via POST /api/settings), automatiquement, quel que soit le fichier qui l'écrit
//      (setItem / removeItem / clear sont observés : plus aucun bricolage clé par clé) ;
//   2. restaurée AU DÉMARRAGE (avant app.js, grâce à l'await de niveau module) quand l'origine est neuve ou vidée
//      (le port local, donc l'origine, a déjà changé à chaque lancement : plus rien ne doit se perdre).
// Le serveur ne retient que les clés connues de Settings.defaults : « ui_prefs » doit y figurer (voir rapport, besoin Swift).
const KEY = "nova_layout";
export const LAYOUT_DEFAULT = { scale: 1, sideW: 272, tile: 1, dockScale: 1, dockPos: "bottom", autoHide: false, liquid: false, mode: "hubs", split: [], custom: [] };

/* ── Clés suivies ───────────────────────────────────────────────────────────── */
export const TRACKED = [
  "nova_layout", "nova_lang", "nova_avatar", "nova_orb_size", "nova_orb", "nova_collapsed", "nova_pins", "nova_lastsub", "nova_mode", "nova_tvc", "nova_conv",
  // drapeaux de migration : sans eux, une origine neuve rejouerait les migrations et écraserait épingles / avatar / imports
  "nova_avatar_spark1", "nova_pins_mail3", "nova_pins_apps1", "nova_imp1",
];
export const TRACKED_PREFIX = ["nova_pref_", "nova.fav."];   // préférences d'affichage + favoris web (l'historique de navigation n'est volontairement PAS synchronisé)
const SENTINEL = "nova_ui_synced";
export const isTracked = (k) => typeof k === "string" && (TRACKED.includes(k) || TRACKED_PREFIX.some((p) => k.startsWith(p)));

let LS = null; try { LS = window.localStorage; LS.length; } catch { LS = null; }
const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem, rawClear = Storage.prototype.clear;
const status = { state: "idle", at: 0, detail: "", keys: 0, restored: 0 };   // idle | ok | unsupported | offline | error
const listeners = new Set();
export const persistStatus = () => ({ ...status });
export const onPersistStatus = (f) => { listeners.add(f); return () => listeners.delete(f); };
const setStatus = (p) => { Object.assign(status, p); for (const f of listeners) try { f(persistStatus()); } catch {} };

export function snapshot() {
  const data = {}; if (!LS) return data;
  try { for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (isTracked(k)) { const v = LS.getItem(k); if (v !== null) data[k] = v; } } } catch {}
  return data;
}
function payload() {
  let data = snapshot();
  if (JSON.stringify(data).length > 400000) data = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith("nova.fav.")));   // garde-fou de taille
  return { v: 1, ts: new Date().toISOString(), data };
}

async function jget(path, ms = 3000) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(path, { signal: c.signal }); if (!r.ok) throw new Error(path + " → " + r.status); return await r.json(); } finally { clearTimeout(t); } }
async function jpost(path, body, ms = 5000) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: c.signal }); if (!r.ok) throw new Error(path + " → " + r.status); return await r.json(); } finally { clearTimeout(t); } }

let canPush = false, lastSent = "", timer = null, pushing = false, again = false;
export function syncSoon(ms = 700) { if (pushing) again = true; clearTimeout(timer); timer = setTimeout(() => { pushNow().catch(() => {}); }, ms); }
export async function pushNow() {
  if (!LS || pushing) return status;
  if (!canPush) { await restoreFromServer(); if (!canPush) return status; }   // jamais d'écrasement du serveur avant d'avoir pu le lire
  pushing = true;
  try {
    const p = payload(), sig = JSON.stringify(p.data);
    if (sig === lastSent && status.state === "ok") return status;
    const r = await jpost("/api/settings", { ui_prefs: p });
    const echoed = r && r.settings && r.settings.ui_prefs;
    if (echoed && echoed.data) { lastSent = sig; setStatus({ state: "ok", at: Date.now(), detail: "", keys: Object.keys(p.data).length }); }
    else setStatus({ state: "unsupported", at: Date.now(), detail: "Le serveur n'a pas retenu « ui_prefs » (clé absente de Settings.defaults).", keys: Object.keys(p.data).length });
  } catch (e) { setStatus({ state: navigator.onLine ? "error" : "offline", at: Date.now(), detail: String(e && e.message || e) }); }
  finally { pushing = false; if (again) { again = false; syncSoon(300); } }
  return status;
}

/* Restauration : ne remplit que les clés ABSENTES (force=true : le serveur écrase le local). */
export async function restoreFromServer(force = false) {
  if (!LS) return 0;
  let st; try { st = await jget("/api/state"); } catch (e) { setStatus({ state: "offline", detail: String(e && e.message || e) }); return 0; }
  const s = (st && st.settings) || {}, u = s.ui_prefs; let n = 0;
  if (u && u.data && typeof u.data === "object") {
    for (const [k, v] of Object.entries(u.data)) { if (!isTracked(k) || typeof v !== "string") continue; try { if (force || LS.getItem(k) === null) { rawSet.call(LS, k, v); n++; } } catch {} }
    lastSent = JSON.stringify(u.data);
  } else {
    // Repli sans « ui_prefs » côté serveur : l'avatar est déjà un réglage serveur connu → on le réutilise.
    try { if (s.avatar && LS.getItem("nova_avatar") === null) { rawSet.call(LS, "nova_avatar", String(s.avatar)); rawSet.call(LS, "nova_avatar_spark1", "1"); n++; } } catch {}
  }
  try { rawSet.call(LS, SENTINEL, "1"); } catch {}
  canPush = true; setStatus({ restored: n });
  return n;
}

/* Observation des écritures : n'importe quel module qui écrit une clé suivie déclenche la copie serveur. */
if (LS && !Storage.prototype.__novaPersist) {
  Object.defineProperty(Storage.prototype, "__novaPersist", { value: true });
  Storage.prototype.setItem = function (k, v) { const r = rawSet.call(this, k, v); if (this === LS && isTracked(String(k))) syncSoon(); return r; };
  Storage.prototype.removeItem = function (k) { const r = rawRemove.call(this, k); if (this === LS && isTracked(String(k))) syncSoon(); return r; };
  Storage.prototype.clear = function () { const r = rawClear.call(this); if (this === LS) syncSoon(); return r; };
}
window.addEventListener("pagehide", () => { if (!canPush || !LS) return; try { const p = payload(); if (JSON.stringify(p.data) !== lastSent) navigator.sendBeacon && navigator.sendBeacon("/api/settings", new Blob([JSON.stringify({ ui_prefs: p })], { type: "application/json" })); } catch {} });
window.addEventListener("online", () => syncSoon(500));

/* Démarrage : origine neuve (pas de témoin) → on restaure AVANT que app.js lise localStorage. */
if (LS) {
  let seen = false; try { seen = LS.getItem(SENTINEL) === "1"; } catch {}
  if (!seen) { try { await restoreFromServer(); } catch {} } else canPush = true;
  try { const l = LS.getItem("nova_lang"); if (l === "en" || l === "fr") document.documentElement.lang = l; } catch {}
  setTimeout(() => syncSoon(0), 4000);   // première copie (utilisateurs existants dont le serveur n'a pas encore de ui_prefs)
}

/* ── Préférences d'affichage (nova_pref_*) : un seul endroit, appliquées dès le démarrage ── */
export const pref = {
  get(k, d) { try { const v = LS.getItem("nova_pref_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { LS.setItem("nova_pref_" + k, JSON.stringify(v)); } catch {} applyPrefs(); },
  remove(k) { try { LS.removeItem("nova_pref_" + k); } catch {} applyPrefs(); },
};
export function applyPrefs() {
  const b = document.body, r = document.documentElement; if (!b) return;
  const fs = Math.min(1.5, Math.max(0.8, +pref.get("fontScale", 1) || 1));
  r.style.setProperty("--ui-font", fs); b.style.fontSize = fs === 1 ? "" : 14 * fs + "px";
  b.classList.toggle("reduce-motion", !!pref.get("calm", false));
  b.classList.toggle("compact", !!pref.get("compact", false));
  b.classList.toggle("hc", !!pref.get("contrast", false));
  b.classList.toggle("focus-strong", !!pref.get("focusStrong", false));
}
/* Mode clair / sombre / auto-système : pilote le thème serveur existant (« bureau » le jour, « ardoise » la nuit). */
export const COLOR_MODES = { theme: "Selon le thème choisi", light: "Toujours clair", dark: "Toujours sombre", system: "Suivre le Mac (clair / sombre)" };
export const LIGHT_THEME = "bureau", DARK_THEME = "ardoise";
export function targetThemeForMode(mode) { return mode === "light" ? LIGHT_THEME : mode === "dark" ? DARK_THEME : mode === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? DARK_THEME : LIGHT_THEME) : null; }
async function followSystem() {
  if (pref.get("colorMode", "theme") !== "system") return;
  const id = targetThemeForMode("system"); if (document.documentElement.dataset.themePref === id) return;
  try { await jpost("/api/settings", { theme: id }); const { applyTheme } = await import("./core.js"); applyTheme(id); } catch {}
}
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", followSystem); } catch {}
setTimeout(followSystem, 1500);
applyPrefs();

/* ── Disposition ─────────────────────────────────────────────────────────────── */
const num = (v, d, lo, hi) => { v = +v; return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
export function sanitizeLayout(o) {
  o = o && typeof o === "object" ? o : {}; const D = LAYOUT_DEFAULT;
  return { scale: num(o.scale, D.scale, 0.8, 1.25), sideW: num(o.sideW, D.sideW, 190, 340), tile: num(o.tile, D.tile, 0.7, 1.4), dockScale: num(o.dockScale, D.dockScale, 0.7, 1.4),
    dockPos: ["bottom", "top", "hidden"].includes(o.dockPos) ? o.dockPos : D.dockPos, autoHide: o.autoHide === true, liquid: o.liquid === true, mode: o.mode === "tabs" ? "tabs" : "hubs",
    split: Array.isArray(o.split) ? o.split.filter((x) => typeof x === "string" && /^[\w-]{1,40}$/.test(x)) : [],
    custom: Array.isArray(o.custom) ? o.custom.filter((c) => c && typeof c.id === "string" && /^c_[a-z0-9]{1,20}$/.test(c.id) && /^https?:\/\//i.test(String(c.url || ""))).map((c) => ({ id: c.id, name: String(c.name || "Onglet").slice(0, 60), url: String(c.url).slice(0, 500) })) : [] };
}
export function getLayout() { try { return sanitizeLayout({ ...LAYOUT_DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) || "{}")) }); } catch { return { ...LAYOUT_DEFAULT }; } }
export function setLayout(patch) { const L = sanitizeLayout({ ...getLayout(), ...patch }); try { localStorage.setItem(KEY, JSON.stringify(L)); } catch {} applyLayout(L); return L; }
export function applyLayout(L = getLayout()) {
  const r = document.documentElement, b = document.body;
  r.style.setProperty("--sw", L.sideW + "px"); r.style.setProperty("--tz", L.tile); r.style.setProperty("--dz", L.dockScale);
  const app = document.getElementById("app"); if (app) app.style.zoom = L.scale === 1 ? "" : L.scale;
  if (b) { b.classList.toggle("autohide", !!L.autoHide); b.classList.toggle("liquid", !!L.liquid); b.classList.toggle("dock-top", L.dockPos === "top"); b.classList.toggle("dock-off", L.dockPos === "hidden"); b.classList.toggle("tabs-exploded", L.mode === "tabs" || (L.split || []).length > 0); }
}

/* ── Export / import / réinitialisation (réglages d'affichage) ──────────────── */
export function exportUI() { return { nova_ui_export: 1, exported: new Date().toISOString(), data: snapshot() }; }
export function importUI(obj) {   // renvoie le nombre de clés importées ; ne touche qu'aux clés suivies, valeurs = chaînes
  const d = obj && (obj.data || (obj.ui && obj.ui.data)); if (!d || typeof d !== "object") throw new Error("Fichier sans section « data »");
  let n = 0; for (const [k, v] of Object.entries(d)) { if (!isTracked(k) || typeof v !== "string" || v.length > 200000) continue; if (k === KEY) { try { JSON.parse(v); } catch { continue; } try { LS.setItem(k, JSON.stringify(sanitizeLayout(JSON.parse(v)))); n++; } catch {} continue; } try { LS.setItem(k, v); n++; } catch {} }
  return n;
}
export const DISPLAY_KEYS = ["nova_layout", "nova_orb_size", "nova_orb", "nova_collapsed", "nova_pins", "nova_lastsub"];
export function resetUI({ all = false } = {}) {   // all=false : disposition + position/taille de l'assistant + épingles ; all=true : aussi préférences d'affichage
  const kill = []; try { for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (DISPLAY_KEYS.includes(k) || (all && k.startsWith("nova_pref_"))) kill.push(k); } } catch {}
  for (const k of kill) try { LS.removeItem(k); } catch {} applyPrefs(); return kill.length;
}

/* ── Utilitaires d'interface partagés (sans innerHTML) ──────────────────────── */
export function downloadJSON(name, obj) { const a = document.createElement("a"), u = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" })); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
export function pickJSON() {
  return new Promise((res, rej) => { const i = document.createElement("input"); i.type = "file"; i.accept = "application/json,.json"; i.onchange = () => { const f = i.files && i.files[0]; if (!f) return rej(new Error("Aucun fichier")); if (f.size > 2e6) return rej(new Error("Fichier trop gros")); f.text().then((t) => { try { res(JSON.parse(t)); } catch { rej(new Error("JSON invalide")); } }, rej); }; i.click(); });
}
/* Confirmation accessible (alertdialog, focus piégé, Échap = annuler). */
export function confirmDialog(message, okLabel = "Confirmer", { danger = false } = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement, back = document.createElement("div"); back.style.cssText = "position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)";
    const box = document.createElement("div"); box.setAttribute("role", "alertdialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Confirmation"); box.style.cssText = "max-width:460px;width:calc(100% - 32px);background:var(--surface,#1b1b22);color:var(--txt,#fff);border:1px solid var(--line2,#555);border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.5)";
    const p = document.createElement("p"); p.textContent = message; p.style.cssText = "margin:0 0 16px;line-height:1.45";
    const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
    const mk = (t, cls, v) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = t; b.onclick = () => done(v); return b; };
    const no = mk("Annuler", "btn", false), ok = mk(okLabel, "btn primary", true); if (danger) ok.style.background = "#b3261e";
    row.append(no, ok); box.append(p, row); back.append(box); document.body.append(back); no.focus();
    function done(v) { back.remove(); document.removeEventListener("keydown", key, true); try { prev && prev.focus && prev.focus(); } catch {} resolve(v); }
    function key(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); } else if (e.key === "Tab") { const f = [no, ok], i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + 2) % 2].focus(); } }
    document.addEventListener("keydown", key, true);
  });
}

/* Masquage automatique : colonnes, onglets du haut et barre du bas se cachent ; le curseur près d'un bord les fait réapparaître. */
{ const B = () => document.body; let t = 0; const set = (c, on) => B() && B().classList.toggle(c, on);
  window.addEventListener("mousemove", (e) => { if (!B() || !B().classList.contains("autohide")) return; const W = innerWidth, H = innerHeight, x = e.clientX, y = e.clientY, b = B().classList;
    const l = x < (b.contains("rv-l") ? 280 : 14), r = x > W - (b.contains("rv-r") ? 280 : 14), bt = y > H - (b.contains("rv-b") ? 110 : 12), tp = y < (b.contains("rv-t") ? 150 : 10);
    set("rv-l", l); set("rv-r", r); set("rv-b", bt); set("rv-t", tp); }, { passive: true });
  document.addEventListener("mouseleave", () => ["rv-l", "rv-r", "rv-b", "rv-t"].forEach((c) => set(c, false)));
  window.addEventListener("blur", () => ["rv-l", "rv-r", "rv-b", "rv-t"].forEach((c) => set(c, false))); }
