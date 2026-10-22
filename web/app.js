// Nova V10 — coque : groupes (dock), ruban 3D d'onglets, assistant flottant persistant, palette ⌘K.
import { moodFromText } from "./compagnon.js";
import { api, THEMES, UNIVERS, PRO, ACCESS, applyTheme, accentOf, esc, md, h, openEvents, t as tr } from "./core.js";
import { ic } from "./icons.js";
import { art } from "./appicons.js";
import { Assistant } from "./assistant.js";
import { createAvatarManager, AVATARS } from "./avatars.js";
import { converser } from "./tabs/converser.js";
import { temps } from "./tabs/temps.js";
import { savoir } from "./tabs/savoir.js";
import { agents, UI } from "./tabs/agents.js";
import { systeme } from "./tabs/systeme.js";
import { apparence } from "./tabs/apparence.js";
import { accueilGroup } from "./tabs/accueil.js";
import { web4 } from "./tabs/web.js";
import { medias } from "./tabs/medias.js";
import { vie } from "./tabs/vie.js";
import { ame, IDEES } from "./tabs/ame.js";
import { web as nativeWeb, isNative, winFS } from "./native.js";
import { getLayout, applyLayout } from "./layout.js";
import { pane as webPane } from "./tabs/web.js";
import { initDots } from "./dots-live.js";
import { startWebMailSync } from "./webmail.js";

export const GROUPS = [
  { id: "accueil", name: "Accueil & Mac", icon: "orb", tabs: accueilGroup },
  { id: "ame", name: "Âme de Nova", icon: "brain", tabs: ame },
  { id: "converser", name: "Converser", icon: "talk", tabs: converser },
  { id: "temps", name: "Mon temps", icon: "time", tabs: temps },
  { id: "web", name: "Messageries & Web", icon: "feed", tabs: web4 },
  { id: "medias", name: "Médias", icon: "mic", tabs: medias },
  { id: "savoir", name: "Savoir", icon: "know", tabs: savoir },
  { id: "agents", name: "Agents & mémoire", icon: "agent", tabs: agents },
  { id: "vie", name: "Vie & travail", icon: "keys", tabs: vie },
  { id: "systeme", name: "Système", icon: "system", tabs: systeme },
  { id: "apparence", name: "Apparence & aide", icon: "look", tabs: apparence },
];
const ALL = GROUPS.flatMap((g) => g.tabs.map((t) => ({ ...t, group: g.id })));
const LAYOUT = getLayout();
for (const c of LAYOUT.custom) ALL.push({ id: c.id, title: c.name, desc: c.url, icon: "search", native: true, group: "web", custom: true, async render(el, ctx) { webPane(ctx, el, { id: "w_" + c.id, url: c.url, title: c.name, ai: true }); } });
/* ── V13 : onglets principaux (hubs) — au plus 3 sous-onglets chacun, regroupés par thème ── */
const HUB_DEF = [
  { id: "h_accueil", name: "Accueil", icon: "orb", side: "L", subs: ["accueil", "mac", "amendements"] },
  { id: "h_converser", name: "Converser", icon: "talk", side: "L", subs: ["chat", "voix", "conseil"] },
  { id: "h_mail", name: "Communications", icon: "mail", side: "L", subs: ["courrier", "gmail", "outlook", "ambassade", "teams", "whatsapp", "telegram", "facebook"] },
  { id: "h_temps", name: "Mon temps", icon: "time", side: "L", subs: ["agenda", "monmac", "taches", "briefs"] },
  { id: "h_web", name: "Web & médias", icon: "search", side: "L", subs: ["navigateur", "tor", "recherche", "radio", "tv", "podcasts", "video"] },
  { id: "h_savoir", name: "Savoir & veille", icon: "know", side: "L", subs: ["notes", "journal", "temoin", "serendipite", "fichiers", "veille", "relaxation", "raccourcis"] },
  { id: "h_dots", name: "Dots Studio", icon: "agent", side: "R", subs: ["dots", "atelier", "skills"] },
  { id: "h_memoire", name: "Mémoire & Âme", icon: "brain", side: "R", subs: ["memoire", "actions", "brouillons", "miroir", "trajectoires", "relations", "jumeau", "orchestre", "corps", "rituels", "heritage", "vivant"] },
  { id: "h_vie", name: "Vie & travail", icon: "keys", side: "R", subs: ["focus", "finances", "sante", "travail"] },
  { id: "h_systeme", name: "Système & Réglages", icon: "system", side: "R", subs: ["reglages", "connexions", "routeur", "confidentialite", "diagnostics", "telephone", "themes", "avatar"] },
];
HUB_DEF.find((x) => x.id === "h_web").subs.push(...LAYOUT.custom.map((c) => c.id)); HUB_DEF.find((x) => x.id === "h_systeme").subs.push("disposition");
{ const known = new Set(ALL.map((t) => t.id)); for (const hb of HUB_DEF) hb.subs = hb.subs.filter((id) => known.has(id));
  const placed = new Set(HUB_DEF.flatMap((x) => x.subs)); const rest = ALL.filter((t) => !placed.has(t.id));
  for (let i = 0; i < rest.length; i += 3) HUB_DEF.push({ id: "h_plus" + i / 3, name: i ? "Plus " + (i / 3 + 1) : "Dossier", icon: rest[i].icon, side: "R", subs: rest.slice(i, i + 3).map((t) => t.id) });
  for (const hb of HUB_DEF) for (const id of hb.subs) { const t = ALL.find((x) => x.id === id); t.hub = hb.id; } }
export const HUBS = [];
{ const split = LAYOUT.mode === "tabs" ? null : new Set(LAYOUT.split);
  for (const hb of HUB_DEF.filter((x) => x.subs.length)) { if (!split || split.has(hb.id)) { for (const id of hb.subs) { const t = ALL.find((q) => q.id === id); HUBS.push({ id: "x_" + id, name: t.title, icon: t.icon, side: hb.side, subs: [id], of: hb.id }); } } else HUBS.push(hb); }
  for (const hb of HUBS) for (const id of hb.subs) { const t = ALL.find((x) => x.id === id); if (t) t.hub = hb.id; } }
export const HUB_BASE = HUB_DEF;
applyLayout(LAYOUT);
const hubOf = (tid) => HUBS.find((x) => x.id === (ALL.find((t) => t.id === tid) || {}).hub);
const lastSub = {}; try { Object.assign(lastSub, JSON.parse(localStorage.getItem("nova_lastsub") || "{}")); } catch {}
const $ = (s) => document.querySelector(s);
window.__stage="app.js: modules chargés, init";
const side = $("#side"), side2 = $("#side2"), view = $("#view"), ribbon = $("#ribbon"), dock = $("#dock"), top = $("#top"), orb = $("#orb"), pal = $("#pal");
const A = new Assistant(api);
const ctx = { A, st: null, tab: null, unread: 0, go: (id) => go(id), refresh: () => refresh(), toast, esc, md, h, api, ic, avatar: null, avHost: h("div", { class: "host" }), THEMES, UNIVERS, PRO, ACCESS, all: ALL, groups: GROUPS, openPalette: () => openPal(), syncTheme: () => ctx.avatar && ctx.avatar.setTheme(document.documentElement.dataset.theme, accentOf()) };
const leaveCbs = []; ctx.onLeave = (f) => leaveCbs.push(f);
/* indice de navigation : la recherche globale ouvre un onglet déjà filtré sur le résultat (consommé une seule fois par l'onglet cible) */
let pendingHint = null; ctx.setHint = (tab, q, extra) => { pendingHint = { tab, q: q || "", ...(extra || {}) }; }; ctx.takeHint = (id) => { const x = pendingHint; if (x && x.tab === id) { pendingHint = null; return x; } return null; };
// Lecteur global (radio, podcasts, relaxation) : continue quand on change d'onglet
ctx.player = (() => { const el = new Audio(); el.preload = "none"; const p = { el, title: "", url: "", playing: false,
  async play(url, title) { try { el.src = url; await el.play(); p.url = url; p.title = title; p.playing = true; renderTop(); return true; } catch (e) { p.playing = false; renderTop(); return false; } },
  stop() { el.pause(); el.removeAttribute("src"); el.load(); p.playing = false; p.title = ""; p.url = ""; renderTop(); } };
  el.addEventListener("error", () => { if (p.playing) { p.playing = false; renderTop(); } }); el.addEventListener("ended", () => { p.playing = false; renderTop(); }); return p; })();
ctx.hubBase = HUB_DEF;
window.Nova = { A, ctx };

function toast(t, ms = 2600) { const e = h("div", { class: "toast", role: "status" }, t); document.body.append(e); setTimeout(() => e.remove(), ms); }

/* ── avatar unique, déplacé entre l'écran de conversation (grand) et l'orbe flottant (petit) ── */
try { if (!localStorage.getItem("nova_avatar_spark1")) { localStorage.setItem("nova_avatar", "c_spark"); localStorage.setItem("nova_avatar_spark1", "1"); } } catch {}
ctx.AVATARS = AVATARS; ctx.avatar = createAvatarManager(ctx.avHost, (() => { try { return localStorage.getItem("nova_avatar") || "panda"; } catch { return "panda"; } })());
ctx.setAvatar = async (id) => { ctx.avatar.setKind(id); ctx.syncTheme(); try { localStorage.setItem("nova_avatar", id); } catch {} try { await api.post("/api/settings", { avatar: id }); } catch {} };
export function placeAvatar(container) { container.prepend(ctx.avHost); }
ctx.placeAvatar = placeAvatar;
const orbHost = orb.querySelector(".shell");
function dockAvatar(inStage) { orb.classList.toggle("docked", !!inStage); if (!inStage) orbHost.prepend(ctx.avHost); }

/* ── orbe : état, bulle de parole, micro, déplacement ── */
const L = { idle: "", listening: "j'écoute", thinking: "je réfléchis", tool: "outil", speaking: "je parle", error: "problème" };
const orbBtns = orb.querySelector(".ob"), bub = orb.querySelector(".bub"), lab = orb.querySelector(".lab");
const micB = h("button", { title: "Parler (⌥ Espace)", "aria-label": tr("Micro", "Micro"), onclick: () => toggleVoice() }, h("span", { html: ic("mic", 18) }));
const openB = h("button", { title: "Ouvrir la conversation", "aria-label": tr("Conversation", "Conversation"), onclick: () => go("chat") }, h("span", { html: ic("chat", 18) }));
orbBtns.append(openB, micB);
/* taille de l'assistant flottant : boutons − / + (survol) et curseur dans Avatar & profil ; mémorisée */
const SZ = { min: 110, max: 380, def: 176 };
const getSz = () => { try { return Math.min(SZ.max, Math.max(SZ.min, +localStorage.getItem("nova_orb_size") || SZ.def)); } catch { return SZ.def; } };
ctx.setOrbSize = (px) => { px = Math.round(Math.min(SZ.max, Math.max(SZ.min, px))); orb.style.setProperty("--orbs", px + "px"); try { localStorage.setItem("nova_orb_size", String(px)); } catch {} window.dispatchEvent(new CustomEvent("orbsize", { detail: px })); return px; };
ctx.getOrbSize = getSz; orb.style.setProperty("--orbs", getSz() + "px");
const szB = h("div", { class: "orbsz" }, h("button", { title: "Réduire l'assistant", "aria-label": tr("Réduire", "Réduire"), onclick: (e) => { e.stopPropagation(); ctx.setOrbSize(getSz() - 24); } }, "−"), h("button", { title: "Agrandir l'assistant", "aria-label": tr("Agrandir", "Agrandir"), onclick: (e) => { e.stopPropagation(); ctx.setOrbSize(getSz() + 24); } }, "+"));
orb.append(szB);
let hideT;
bub.setAttribute("aria-live", "polite");
const say = (t, cls = "") => { bub.className = "bub show " + cls; bub.textContent = t.length > 200 ? "…" + t.slice(-200) : t; clearTimeout(hideT); };
const fade = (ms = 6000) => { clearTimeout(hideT); hideT = setTimeout(() => (bub.className = "bub"), ms); };
async function toggleVoice() { if (A.voiceOn) { A.interrupt("bouton"); A.stopVoice(); } else { await A.startVoice(); } micB.classList.toggle("on", A.voiceOn); document.querySelectorAll(".mic").forEach((m) => m.classList.toggle("on", A.voiceOn)); }
ctx.toggleVoice = toggleVoice; window.Nova.toggleVoice = toggleVoice;
A.addEventListener("state", (e) => { ctx.avatar.setState(e.detail.state); lab.textContent = L[e.detail.state] || ""; micB.classList.toggle("on", A.voiceOn); if (["idle", "listening"].includes(e.detail.state)) fade(); });
A.addEventListener("level", (e) => ctx.avatar.setLevel(e.detail.level));
A.addEventListener("user", (e) => { say(e.detail.text, "user"); const m = moodFromText(e.detail.text); if (m) ctx.avatar.react(m); });
A.addEventListener("delta", (e) => say(e.detail.full || e.detail.t || ""));
let lastFull = "";
A.addEventListener("delta", (e) => { lastFull = e.detail.full || lastFull; });
A.addEventListener("done", () => { fade(9000); const t = lastFull; lastFull = ""; const m = /d[ée]sol[ée]|erreur|impossible|[ée]chec|n'ai pas pu/i.test(t) ? "desole" : /bravo|f[ée]licit|c'est fait|termin[ée]|r[ée]ussi|parfait/i.test(t) ? "fete" : /urgent|attention|alerte/i.test(t) ? "alerte" : /\?\s*$/.test(t.trim()) ? "attente" : /merci|avec plaisir/i.test(t) ? "content" : ""; if (m) ctx.avatar.react(m); });
A.addEventListener("error", (e) => say("⚠ " + e.detail.message));
(() => { // glisser l'orbe
  const sh = orb.querySelector(".shell"); let d = null;
  try { const p = JSON.parse(localStorage.getItem("nova_orb") || "null"); if (p) { orb.style.left = p.x + "px"; orb.style.top = p.y + "px"; orb.style.right = "auto"; orb.style.bottom = "auto"; } } catch {}
  sh.tabIndex = 0; sh.setAttribute("role", "button"); sh.setAttribute("aria-label", tr("Assistant", "Assistant") + " — " + tr("Micro", "Micro"));
  sh.addEventListener("keydown", (e) => { if (e.target === sh && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleVoice(); } });
  sh.addEventListener("pointerdown", (e) => { const r = orb.getBoundingClientRect(); d = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false, x0: e.clientX, y0: e.clientY }; sh.setPointerCapture(e.pointerId); });
  sh.addEventListener("pointermove", (e) => { if (!d) return; if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 5) { d.moved = true; orb.classList.add("drag"); }
    if (d.moved) { const x = Math.min(innerWidth - getSz() - 14, Math.max(6, e.clientX - d.dx)), y = Math.min(innerHeight - getSz() - 24, Math.max(60, e.clientY - d.dy)); Object.assign(orb.style, { left: x + "px", top: y + "px", right: "auto", bottom: "auto" }); } });
  sh.addEventListener("pointerup", () => { if (d && d.moved) { try { const r = orb.getBoundingClientRect(); localStorage.setItem("nova_orb", JSON.stringify({ x: r.left, y: r.top })); } catch {} } else if (d) toggleVoice(); orb.classList.remove("drag"); d = null; });
})();

/* ── colonne verticale 3D : 10 groupes dépliables, 38 onglets en dalles de verre en relief ── */
const collapsed = new Set(); try { JSON.parse(localStorage.getItem("nova_collapsed") || "[]").forEach((x) => collapsed.add(x)); } catch {}
const DEFAULT_PINS = ["gmail", "outlook", "teams", "whatsapp", "telegram", "facebook", "navigateur", "tor", "radio", "tv"];
let pins = DEFAULT_PINS.slice(); try { const p = JSON.parse(localStorage.getItem("nova_pins") || "null"); if (Array.isArray(p)) pins = p; } catch {}
try { if (!localStorage.getItem("nova_pins_mail3")) { for (const id of ["gmail", "outlook", "teams"]) if (!pins.includes(id)) pins.push(id); localStorage.setItem("nova_pins_mail3", "1"); localStorage.setItem("nova_pins", JSON.stringify(pins)); } } catch {}
try { if (!localStorage.getItem("nova_pins_apps1")) { pins = DEFAULT_PINS.slice(); localStorage.setItem("nova_pins_apps1", "1"); localStorage.setItem("nova_pins", JSON.stringify(pins)); } } catch {}
pins = pins.filter((id) => ALL.some((t) => t.id === id));
function togglePin(id) { pins = pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id]; try { localStorage.setItem("nova_pins", JSON.stringify(pins)); } catch {} renderSide(); renderDock(); }
/* rail : TOUS les groupes ouverts d'emblée, onglets compacts sur 2 colonnes — rien de caché. ★ = épingler dans la barre du bas. */
const LEFT_IDS = ["accueil", "converser", "temps", "web", "medias", "savoir"];
function groupSection(g) {
  const isOpen = !collapsed.has(g.id) || ctx.group === g.id, act = ctx.group === g.id;
  return h("section", { class: "sg" + (isOpen ? " open" : "") + (act ? " act" : ""), "data-group": g.id },
    h("button", { class: "sgh", "aria-expanded": isOpen, onclick: () => { collapsed.has(g.id) ? collapsed.delete(g.id) : collapsed.add(g.id); try { localStorage.setItem("nova_collapsed", JSON.stringify([...collapsed])); } catch {} renderSide(); } },
      h("span", { class: "sgi", html: ic(g.icon, 16) }), h("span", { class: "sgn" }, tr(g.name, g.name)), h("em", {}, g.tabs.length), h("span", { class: "chev" }, "›")),
    h("div", { class: "sgb" }, h("div", { class: "sgl" }, ...g.tabs.map((t) => h("div", { class: "stabw", role: "presentation" },
      h("button", { class: "stab" + (ctx.tab === t.id ? " on" : ""), "data-tab": t.id, role: "tab", "aria-label": t.title, title: t.title + " — " + (t.desc || ""), "aria-selected": ctx.tab === t.id, onclick: () => go(t.id) },
        h("i", { class: "fc fr" }), h("i", { class: "fc sr" }), h("i", { class: "fc sl" }), h("i", { class: "fc tp" }), h("i", { class: "fc bt" }),
        h("span", { class: "hubtile" }, tile(t, 30)), h("span", { class: "stt" }, h("b", {}, t.title), h("small", {}, t.desc || "")), t.id === "briefs" && ctx.unread ? h("span", { class: "badge" }, ctx.unread) : null),
      h("button", { class: "pinb" + (pins.includes(t.id) ? " on" : ""), title: pins.includes(t.id) ? "Retirer de la barre du bas" : "Épingler dans la barre du bas", "aria-label": "Épingler " + t.title, onclick: (e) => { e.stopPropagation(); togglePin(t.id); } }, "★"))))));
}
/* trois zones : rail GAUCHE, rail DROIT (un onglet principal = une dalle 3D, 2-3 sous-onglets dedans), barre du BAS (épinglés). Rien à scroller. */
function hubSlab(hb) {
  const on = ctx.hub === hb.id, subs = hb.subs.map((id) => ALL.find((t) => t.id === id));
  const open = () => go(subs.some((t) => t.id === lastSub[hb.id]) ? lastSub[hb.id] : subs[0].id);
  return h("div", { class: "stabw hubw", role: "presentation" },
    h("button", { class: "stab hub" + (on ? " on" : ""), "data-hub": hb.id, "data-tab": subs[0].id, role: "tab", "aria-label": tr(hb.name, hb.name), title: tr(hb.name, hb.name) + " — " + subs.map((t) => t.title).join(" · "), "aria-selected": on, onclick: open },
      h("i", { class: "fc fr" }), h("i", { class: "fc sr" }), h("i", { class: "fc sl" }), h("i", { class: "fc tp" }), h("i", { class: "fc bt" }),
      h("span", { class: "hubtile" }, tile({ id: hb.id, icon: hb.icon }, 38)), h("span", { class: "stt" }, h("b", {}, tr(hb.name, hb.name)), h("small", {}, subs.slice(0, 3).map((t) => t.title).join(" · ") + (subs.length > 3 ? " · +" + (subs.length - 3) : ""))),
      hb.subs.includes("briefs") && ctx.unread ? h("span", { class: "badge" }, ctx.unread) : null));
}
function renderSide() {
  side.replaceChildren(h("section", { class: "sg open" }, h("div", { class: "sgb" }, h("div", { class: "sgl", role: "tablist", "aria-orientation": "vertical", "aria-label": tr("Navigation", "Navigation") }, ...HUBS.filter((x) => x.side === "L").map(hubSlab)))));
  side2.replaceChildren(h("section", { class: "sg open" }, h("div", { class: "sgb" }, h("div", { class: "sgl", role: "tablist", "aria-orientation": "vertical", "aria-label": tr("Navigation", "Navigation") + " 2" }, ...HUBS.filter((x) => x.side === "R").map(hubSlab)))));
}
for (const el of [side, side2]) el.addEventListener("pointermove", (e) => { const b = e.target.closest(".stab"); if (!b) return; const r = b.getBoundingClientRect(); b.style.setProperty("--tx", ((e.clientX - r.left) / r.width - 0.5).toFixed(2)); b.style.setProperty("--ty", ((e.clientY - r.top) / r.height - 0.5).toFixed(2)); });

/* identité visuelle : chaque onglet/app a sa pastille « app Mac » (squircle dégradé + pictogramme blanc) */
const TILE = { h_accueil: ["#ff5a4d", "#D93226"], h_converser: ["#ff7a59", "#e0452b"], h_mail: ["#5ec8ff", "#2a7be4"], h_temps: ["#ff9f43", "#e0641a"], h_social: ["#3fe07a", "#128c4a"], h_web: ["#4db2ff", "#1565d8"], h_medias: ["#b27af0", "#6a2fc0"], h_savoir: ["#ffd84d", "#e09a00"], h_detente: ["#4dd0c8", "#0f8f8a"], h_dots: ["#ff5a4d", "#b81f16"], h_memoire: ["#8c9eff", "#3f51b5"], h_vie: ["#7bd88f", "#2e8b57"], h_systeme: ["#9aa4b2", "#4b5563"], h_reglages: ["#f48fb1", "#c2185b"], gmail: ["#ff6b5e", "#c5221f"], outlook: ["#2f9bff", "#0a53b8"], teams: ["#7b83eb", "#464eb8"], whatsapp: ["#3fe07a", "#128c4a"], telegram: ["#41c3f5", "#1a7fc4"], facebook: ["#4a8bff", "#1450c9"], tor: ["#b27af0", "#5b2a9e"], navigateur: ["#4db2ff", "#1565d8"], courrier: ["#5ec8ff", "#2a7be4"], chat: ["#ff5a4d", "#D93226"], voix: ["#ff7a59", "#e0452b"], agenda: ["#ff6a5c", "#d92f26"], taches: ["#ffb340", "#f08000"], radio: ["#ff8a4c", "#e0541c"], tv: ["#6b7bff", "#3a3fd1"], dots: ["#ff5a4d", "#D93226"], notes: ["#ffd84d", "#e0a800"], fichiers: ["#5ec8ff", "#1f8fe6"], accueil: ["#ff5a4d", "#D93226"], mac: ["#9aa4b2", "#5b6573"] };
const HUES = [[ "#ff8a65", "#e64a19" ], [ "#4dd0e1", "#00838f" ], [ "#9575cd", "#512da8" ], [ "#81c784", "#2e7d32" ], [ "#f06292", "#ad1457" ], [ "#64b5f6", "#1565c0" ], [ "#ffb74d", "#ef6c00" ]];
function tilePair(t) { if (TILE[t.id]) return TILE[t.id]; let n = 0; for (const c of t.id) n = (n * 31 + c.charCodeAt(0)) >>> 0; return HUES[n % HUES.length]; }
function tile(t, px = 30) { const [a, b] = tilePair(t); return h("span", { class: "apptile", style: `--a:${a};--b:${b};--px:${px}px`, html: art(t) }); }
/* barre du bas, horizontale : les onglets épinglés, toujours à portée de clic */
let dockSig = "";
function renderDock() {
  const sig = [ctx.tab, pins.join(","), ctx.unread, document.body.classList.contains("webfs")].join("|"); if (sig === dockSig) return; dockSig = sig;   // ne reconstruit pas les boutons si rien n'a changé (évite de perdre un clic)
  renderSide();
  const POD = { gmail: "Messagerie", outlook: "Messagerie", teams: "Messagerie", whatsapp: "Messagerie", telegram: "Messagerie", facebook: "Messagerie" };
  const items = pins.map((id) => ALL.find((t) => t.id === id)).filter(Boolean); const pods = [];
  for (const t of items) { const name = POD[t.id] || "Web & médias"; let p = pods.find((x) => x.name === name); if (!p) pods.push(p = { name, items: [] }); p.items.push(t); }
  dock.setAttribute("role", "tablist"); dock.setAttribute("aria-label", tr("Barre du bas", "Barre du bas"));
  dock.replaceChildren(...pods.map((p) => h("div", { class: "dpod", role: "presentation" }, h("span", { class: "dpl" }, tr(p.name, p.name)),
    ...p.items.map((t) => h("button", { class: "dk" + (ctx.tab === t.id ? " on" : ""), "data-tab": t.id, role: "tab", "aria-selected": ctx.tab === t.id, title: t.title, "aria-label": t.title, onclick: () => go(t.id) },
      tile(t, 44), h("small", {}, t.title), t.id === "briefs" && ctx.unread ? h("span", { class: "badge" }, ctx.unread) : null)))));
  const fs = document.body.classList.contains("webfs");
  dock.append(h("div", { class: "dpod dpfs", role: "presentation" }, h("button", { class: "dk dkfs" + (fs ? " on" : ""), title: (fs ? "Réduire" : "Plein écran") + " — tout l'espace de la fenêtre (⌥↵)", "aria-label": tr("Plein écran", "Plein écran"), "aria-pressed": fs, onclick: () => toggleFS() }, h("span", { style: "font-size:20px;line-height:20px" }, fs ? "⤡" : "⤢"), h("small", {}, fs ? tr("Réduire", "Réduire") : tr("Plein écran", "Plein écran")))));
}
function renderRibbon() {}

function renderTop() {
  const s = ctx.st; const t = ALL.find((x) => x.id === ctx.tab); const g = GROUPS.find((x) => x.id === ctx.group);
  const ok = s ? s.brains.filter((b) => b.etat === "ok").length : 0, avail = s ? s.brains.filter((b) => !["sans_cle", "absent", "desactive"].includes(b.etat)).length : 0;
  top.replaceChildren(...[h("div", { class: "logo" }, h("img", { class: "logoimg", src: "assets/logo.png", alt: "" }), "NOVA", s ? h("span", { class: "logoname" }, "· " + (s.settings.full_name || s.settings.name || "")) : null), h("span", { class: "crumb" }, ((hubOf(t.id) || g).name) === t.title ? t.title : ((hubOf(t.id) || g).name) + "  ›  " + t.title), h("span", { class: "spacer" }),
    s ? h("button", { class: "pill", title: "Cerveaux avec clé / répondant au dernier test", onclick: () => go("routeur") }, h("span", { class: "dot " + (ok ? "ok" : avail ? "non_teste" : "panne") }), avail + " cerveaux prêts · " + ok + " OK") : null,
    s ? h("button", { class: "pill", onclick: () => go("voix") }, h("span", { class: "dot " + (s.voice.elevenlabs_key ? "ok" : "sans_cle") }), s.voice.elevenlabs_key ? "Voix ElevenLabs" : "Voix de repli") : null,
    ctx.player.playing ? h("button", { class: "pill", title: "Arrêter la lecture", onclick: () => ctx.player.stop() }, h("span", { class: "dot ok" }), "▶ " + ctx.player.title.slice(0, 34) + "  ■") : null,
    t && !t.native ? h("button", { class: "pill", title: "Ouvrir cet onglet dans une fenêtre flottante (reste ouvert pendant que tu travailles ailleurs)", onclick: () => floatTab(t.id) }, "⧉ Flotter") : null,
    s && s.quiet ? h("span", { class: "pill" }, "heures calmes") : null,
    h("label", { class: "gsearch", title: "Rechercher partout (⌘K)" }, h("span", { html: ic("cmd", 14) }), (() => { const i = h("input", { type: "search", placeholder: tr("Rechercher partout…", "Rechercher partout…"), "aria-label": "Rechercher partout", autocomplete: "off", spellcheck: "false" }); i.addEventListener("input", () => { const v = i.value; i.value = ""; openPal(v); }); i.addEventListener("click", () => openPal("")); return i; })(), h("kbd", {}, "⌘K")),
    h("button", { class: "pill", type: "button", title: "Raccourcis clavier (?)", "aria-label": "Raccourcis clavier", onclick: () => showShortcuts() }, "?"),
    s ? h("button", { class: "me", title: (s.settings.full_name || s.settings.name || "Profil") + " — profil et réglages", onclick: () => go("apparence") }, h("img", { src: "assets/profile.jpg", alt: s.settings.full_name || "Profil" })) : null].filter(Boolean));
}

async function refresh() {
  try { ctx.st = await api.get("/api/state"); ctx.unread = ctx.st.unread_briefs; applyTheme(ctx.st.settings.theme); ctx.syncTheme(); setTitle(); try { const av = ctx.st.settings.avatar; if (av && !localStorage.getItem("nova_avatar")) ctx.avatar.setKind(av); } catch {} renderDock(); renderRibbon(); renderTop(); }
  catch (e) { top.replaceChildren(h("span", { role: "alert" }, "Moteur injoignable : " + e.message + " "), h("button", { class: "pill", type: "button", onclick: () => refresh() }, "Réessayer")); }
}
let navTok = 0;
/* titre de fenêtre : « (n) Nova — Onglet » (n = brefs non lus) ; repris par l'app Mac pour le titre de la fenêtre */
function setTitle(t) { t = t || ALL.find((x) => x.id === ctx.tab); document.title = (ctx.unread ? "(" + ctx.unread + ") " : "") + "Nova — " + (t ? t.title : ""); }
function toggleFS(on) { const b = document.body.classList; if (on === undefined) b.toggle("webfs"); else b.toggle("webfs", on); winFS(b.contains("webfs")); renderDock(); window.dispatchEvent(new Event("resize")); setTimeout(() => window.dispatchEvent(new Event("resize")), 250); }
window.addEventListener("nova:togglefs", () => toggleFS());
const recent = [];   // onglets récents (le plus récent d'abord) pour le sélecteur Ctrl+Tab
const sw = { open: false, sel: 0, list: [], el: null };
function swRender() {
  if (!sw.el) { sw.el = h("div", { id: "switcher", class: "glass" }); document.body.append(sw.el); }
  sw.el.replaceChildren(h("div", { class: "swh" }, "Passer à… (garde Ctrl, appuie sur Tab)"), ...sw.list.map((id, i) => { const t = ALL.find((x) => x.id === id); return h("button", { class: "swi" + (i === sw.sel ? " on" : ""), onclick: () => { sw.sel = i; swCommit(); } }, tile(t, 30), h("b", {}, t.title), h("small", {}, (GROUPS.find((g) => g.id === t.group) || {}).name || "")); }));
  sw.el.classList.add("open");
}
function swStep(d) {
  if (!sw.open) { sw.list = recent.filter((id) => ALL.some((t) => t.id === id)).slice(0, 9); if (sw.list.length < 2) return; sw.open = true; sw.sel = d > 0 ? 1 : sw.list.length - 1; nativeWeb.hideAll(); }
  else sw.sel = (sw.sel + d + sw.list.length) % sw.list.length;
  swRender();
}
function swCommit(cancel) { if (!sw.open) return; sw.open = false; if (sw.el) sw.el.classList.remove("open"); const id = sw.list[sw.sel]; if (!cancel && id) go(id); else { const t = ALL.find((x) => x.id === ctx.tab); if (t && t.native) go(t.id); } }
window.NovaSwitch = { step: swStep, commit: () => swCommit(false), cancel: () => swCommit(true) };
async function go(id) {
  const t = ALL.find((x) => x.id === id) || ALL[0]; ctx.tab = t.id;
  { const i = recent.indexOf(t.id); if (i >= 0) recent.splice(i, 1); recent.unshift(t.id); if (recent.length > 14) recent.pop(); }
  try { localStorage.setItem("nova_lasttab", t.id); } catch {} setTitle(t); UI.announce(t.title + " ouvert");
  document.body.dataset.tab = t.id; document.body.classList.toggle("nat", !!t.native); ctx.group = t.group; ctx.hub = t.hub; if (t.hub) { lastSub[t.hub] = t.id; try { localStorage.setItem("nova_lastsub", JSON.stringify(lastSub)); } catch {} } navTok++; const my = navTok;
  leaveCbs.splice(0).forEach((f) => { try { f(); } catch {} }); nativeWeb.hideAll();
  history.replaceState(null, "", "#/" + t.id); renderDock(); renderRibbon(); renderTop();
  dockAvatar(!!t.stage || !!t.native); view.scrollTop = 0;
  const page = h("div", { class: "page" + (t.wide ? " wide" : "") }); const hbx = hubOf(t.id);
  const subbar = hbx && hbx.subs.length > 1 ? h("div", { class: "hsubs", role: "tablist", "aria-label": hbx.name }, ...hbx.subs.map((id) => { const x = ALL.find((q) => q.id === id); return h("button", { class: "hsub" + (id === t.id ? " on" : ""), role: "tab", "aria-selected": id === t.id, onclick: () => go(id) }, h("span", { class: "hsi" }, tile(x, 22)), h("b", {}, x.title), x.id === "briefs" && ctx.unread ? h("span", { class: "badge" }, ctx.unread) : null); })) : null;
  view.replaceChildren(...[subbar, page].filter(Boolean)); view.className = "";
  if (!t.stage && !t.native && !page.querySelector(":scope > .thero")) { const g0 = GROUPS.find((x) => x.id === t.group);
    if (t.id !== "accueil") page.prepend(h("header", { class: "thero" }, h("div", { class: "thico" }, tile(t, 54)), h("div", { class: "thtx" }, h("small", {}, g0.name), h("h1", {}, t.title), h("p", {}, t.desc || "")), h("button", { class: "pinb2" + (pins.includes(t.id) ? " on" : ""), "aria-label": "Épingler " + t.title, title: "Épingler dans la barre du bas", onclick: (e) => { togglePin(t.id); e.currentTarget.classList.toggle("on", pins.includes(t.id)); } }, "★"))); }
  const ld = h("div", { class: "card ldg" }, h("span", { class: "spin" }), " Chargement de " + t.title + "…"); if (!t.stage && !t.native) page.append(ld);
  try { await t.render(page, ctx); ld.remove(); } catch (e) { if (my === navTok) page.replaceChildren(h("div", { class: "card err", role: "alert" }, "Cet onglet a rencontré une erreur : " + e.message + " ", h("button", { class: "btn primary", type: "button", onclick: () => go(t.id) }, "Réessayer"))); console.error(e); }
  setTitle(t);
  page.querySelectorAll(":scope > .card,:scope > .grid > *,:scope > .glass").forEach((c, i) => c.style.setProperty("--i", Math.min(i, 14)));
  view.querySelectorAll(".card,.glass").forEach((c) => c.addEventListener("pointermove", (e) => { const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px"); }));
}

/* ── fenêtres flottantes : plusieurs onglets ouverts en même temps (comme sur un Mac) ── */
const floats = []; let fz = 8000;
async function floatTab(id) {
  const t = ALL.find((x) => x.id === id); if (!t) return;
  if (t.native) { toast("Cet onglet (web natif) s'ouvre plein écran uniquement."); return; }
  { const ex = floats.find((w) => w.dataset.tab === id); if (ex) { ex.style.zIndex = ++fz; ex.focus(); return; } }   // déjà ouverte : on la ramène devant
  const n = floats.length % 8, leave = [];
  const body = h("div", { class: "page", style: "padding:10px;overflow:auto;flex:1;min-height:0" });
  const close = h("button", { class: "btn sm", type: "button", title: "Fermer (Échap)", "aria-label": "Fermer la fenêtre " + t.title, onclick: () => { leave.splice(0).forEach((f) => { try { f(); } catch {} }); w.remove(); floats.splice(floats.indexOf(w), 1); } }, "✕");
  const big = h("button", { class: "btn sm", type: "button", title: "Ouvrir plein écran", "aria-label": "Ouvrir " + t.title + " plein écran", onclick: () => { close.click(); go(id); } }, "⤢");
  const bar = h("div", { style: "display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:move;background:rgba(0,0,0,.35);user-select:none" }, h("b", { style: "flex:1", id: "fw_" + id + "_" + (++fz) }, t.title), big, close);
  const w = h("div", { class: "glass", role: "dialog", "aria-label": "Fenêtre flottante : " + t.title, tabindex: "-1", "data-tab": id, style: "position:fixed;left:" + (120 + n * 34) + "px;top:" + (90 + n * 34) + "px;width:min(560px,90vw);height:min(420px,70vh);min-width:260px;min-height:160px;resize:both;overflow:hidden;display:flex;flex-direction:column;z-index:" + (++fz) + ";border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.55)" }, bar, body);
  w.addEventListener("pointerdown", () => { w.style.zIndex = ++fz; });
  w.addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); close.click(); } });
  let dx = 0, dy = 0, drag = false;
  bar.addEventListener("pointerdown", (e) => { if (e.target.tagName === "BUTTON") return; drag = true; const r = w.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top; bar.setPointerCapture(e.pointerId); });
  bar.addEventListener("pointermove", (e) => { if (!drag) return; w.style.left = Math.max(0, e.clientX - dx) + "px"; w.style.top = Math.max(0, e.clientY - dy) + "px"; });
  bar.addEventListener("pointerup", () => { drag = false; });
  document.body.append(w); floats.push(w);
  const fctx = Object.create(ctx); fctx.onLeave = (f) => leave.push(f);
  const mountF = async () => { body.replaceChildren(); try { await t.render(body, fctx); } catch (e) { body.replaceChildren(h("div", { class: "card err", role: "alert" }, "Erreur : " + e.message + " ", h("button", { class: "btn sm", type: "button", onclick: mountF }, "Réessayer"))); } };
  await mountF(); w.focus();
}
const closeFloats = () => { for (const w of floats.slice()) { const b = w.querySelector("button[aria-label^='Fermer']"); b && b.click(); } };
ctx.floatTab = floatTab;

/* ── recherche globale ⌘K : onglets, actions, ET contenu (Dots, missions, mémoire, brouillons, actions, skills, relations, règles, idées, documents) ── */
const CMDS = () => [
  ...ALL.map((t) => ({ k: t.title, sub: GROUPS.find((g) => g.id === t.group).name, icon: t.icon, hay: UI.norm(t.title + " " + (t.desc || "")), run: () => go(t.id) })),
  ...ALL.filter((t) => !t.native).map((t) => ({ k: "Fenêtre flottante : " + t.title, sub: "s'ouvre à côté, reste active", icon: t.icon, run: () => floatTab(t.id) })),
  ...(floats.length ? [{ k: "Fermer les fenêtres flottantes", sub: "action", icon: "cmd", run: closeFloats }] : []),
  { k: "Raccourcis clavier", sub: "aide  (?)", icon: "cmd", run: () => showShortcuts() },
  { k: "Entrer dans le Vide", sub: "action  (Échap pour sortir)", icon: "orb", run: () => vide(true) },
  { k: "Nouvelle conversation", sub: "action", icon: "chat", run: () => { A.interrupt("", true); A.convId = null; go("chat"); window.dispatchEvent(new Event("nova:newconv")); } },
  { k: "Parler / couper le micro", sub: "action  ⌥ Espace", icon: "mic", run: toggleVoice },
  { k: "Générer le brief du matin", sub: "action", icon: "brief", run: async () => { toast("Brief en cours de génération…"); try { await api.post("/api/briefs/run", { kind: "matin" }); await refresh(); go("briefs"); } catch (e) { toast("Échec : " + e.message); } } },
  ...UNIVERS.concat(PRO, THEMES).map((t) => ({ k: "Thème : " + t.name, sub: "apparence", icon: "palette", run: async () => { await api.post("/api/settings", { theme: t.id }); applyTheme(t.id); ctx.syncTheme(); refresh(); } })),
];
/* index de contenu, chargé à l'ouverture (valable 30 s) ; chaque source qui échoue est simplement ignorée */
const IDX = { ts: 0, items: [], busy: null };
const cut = (s, n = 90) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
async function buildIndex() {
  const g = (u) => api.get(u).catch(() => null), dc = (n) => api.get("/api/ame/doc?name=" + n).then((r) => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
  const [dots, miss, mem, dr, ac, sk, rel, val, lai] = await Promise.all([g("/api/dots"), g("/api/missions"), g("/api/memory"), g("/api/drafts"), g("/api/actions"), g("/api/ame/skills"), dc("relations"), dc("valeurs"), dc("laisser")]);
  const out = [], add = (type, tab, k, hint, ...hay) => out.push({ type, tab, k: cut(k), hint: cut(hint || k, 40), hay: UI.norm(hay.join(" ")) });
  for (const d of (dots && dots.items) || []) add("Dot", "dots", (d.emoji || "") + " " + d.name, d.name, d.name, d.role, d.id, cut(d.prompt, 300));
  for (const m of (miss && miss.items) || []) add("Mission", "dots", m.goal, m.goal, m.goal, m.status);
  for (const m of ((mem && mem.items) || []).slice(-400)) add("Mémoire", "memoire", m.text, m.text, m.text, m.source);
  for (const d of (dr && dr.items) || []) add("Brouillon", "brouillons", d.subject || "(sans objet)", d.subject || d.to, d.subject, d.to, cut(d.body, 300));
  for (const a of ((ac && ac.items) || []).slice(0, 120)) add("Action", "actions", a.tool + " — " + (a.why || a.input || ""), a.tool, a.tool, a.actor, a.why, a.input, cut(a.result, 200));
  for (const s of (sk && sk.items) || []) add("Skill", "skills", s.name, s.name, s.name, cut(s.body, 300));
  for (const r of rel) add("Relation", "relations", r.name, r.name, r.name, r.notes);
  for (const v of val) add("Règle", "miroir", v.text, v.text, v.text);
  for (const l of lai) add("Laissé", "rituels", l.text, l.text, l.text);
  for (const x of IDEES) add("Idée", x[3] && ALL.some((t) => t.id === x[3]) ? x[3] : "vivant", x[0] + " · " + x[1], x[1], x.join(" "));
  IDX.items = out; IDX.ts = Date.now();
}
const loadIndex = () => { if (Date.now() - IDX.ts < 30000) return Promise.resolve(); return IDX.busy || (IDX.busy = buildIndex().catch(() => {}).finally(() => { IDX.busy = null; })); };
let sel = 0, items = [], palPrev = null, docTimer = null, docHits = [], docQ = "";
const palIn = pal.querySelector("input"), palList = pal.querySelector(".list");
function renderPal() {
  const raw = palIn.value.trim(), q = UI.norm(raw); let cmds = CMDS();
  if (!q) { const rec = recent.map((id) => ALL.find((t) => t.id === id)).filter(Boolean).slice(1, 6).map((t) => ({ k: t.title, sub: "récent", icon: t.icon, run: () => go(t.id) })); items = [...rec, ...cmds]; }
  else {
    const m = (c) => (c.hay || UI.norm(c.k + " " + c.sub)).includes(q), cm = cmds.filter(m), ct = IDX.items.filter((c) => c.hay.includes(q)).slice(0, 30).map((c) => ({ k: c.k, sub: c.type, icon: (ALL.find((t) => t.id === c.tab) || {}).icon || "search", run: () => { ctx.setHint(c.tab, c.hint); go(c.tab); } }));
    const dh = docQ === raw ? docHits.map((x) => ({ k: x.file, sub: "Document · " + cut(x.text, 60), icon: "know", run: () => { ctx.setHint("memoire", "", { kb: raw }); go("memoire"); } })) : [];
    items = [...cm, ...ct, ...dh];
    if (raw.length >= 3 && docQ !== raw) { clearTimeout(docTimer); docTimer = setTimeout(async () => { const mine = raw; try { const r = await api.get("/api/knowledge/search?q=" + encodeURIComponent(mine)); if (palIn.value.trim() === mine) { docQ = mine; docHits = (r.items || []).slice(0, 5); renderPal(); } } catch {} }, 350); }
  }
  items = items.slice(0, 60); sel = Math.min(sel, Math.max(0, items.length - 1));
  palList.replaceChildren(...(items.length ? items.map((c, i) => h("div", { class: "it" + (i === sel ? " sel" : ""), id: "palo" + i, role: "option", "aria-selected": String(i === sel), onclick: () => { closePal(true); c.run(); } }, h("span", { html: ic(c.icon, 18), "aria-hidden": "true" }), c.k, h("small", {}, c.sub))) : [h("div", { class: "it", role: "status" }, "Aucun résultat pour « " + raw + " »")]));
  palIn.setAttribute("aria-activedescendant", items.length ? "palo" + sel : ""); palIn.setAttribute("aria-expanded", "true");
  const s = palList.querySelector(".sel"); s && s.scrollIntoView && s.scrollIntoView({ block: "nearest" });
}
function openPal(seed) { seed = typeof seed === "string" ? seed : ""; nativeWeb.hideAll(); palPrev = document.activeElement; pal.classList.add("open"); palIn.value = seed; sel = 0; docQ = ""; docHits = []; renderPal(); palIn.focus(); try { palIn.setSelectionRange(seed.length, seed.length); } catch {} loadIndex().then(() => { if (pal.classList.contains("open")) renderPal(); }); }
function closePal(ran) { pal.classList.remove("open"); palIn.setAttribute("aria-expanded", "false"); const t = ALL.find((x) => x.id === ctx.tab); if (t && t.native) go(t.id); else if (!ran && palPrev && palPrev.focus) { try { palPrev.focus(); } catch {} } }
pal.addEventListener("pointerdown", (e) => { if (e.target === pal) closePal(); });
palIn.addEventListener("input", () => { sel = 0; renderPal(); });
palIn.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); renderPal(); e.preventDefault(); } else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); renderPal(); e.preventDefault(); }
  else if (e.key === "Enter" && items[sel]) { const c = items[sel]; closePal(true); c.run(); } });
/* aide : raccourcis clavier (dialogue accessible) */
function showShortcuts() {
  const mod = /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘" : "Ctrl", rows = [[mod + " K", "Recherche globale (onglets, Dots, mémoire, brouillons, actions, documents) et commandes"], ["?", "Afficher cette aide (hors zone de saisie)"], ["⌥ 1 … ⌥ 9, ⌥ 0", "Aller au 1er … 10e onglet principal"], [mod + " ← / →", "Sous-onglet précédent / suivant"], ["Ctrl Tab  (⇧ pour reculer)", "Basculer entre les onglets récents"], ["⌥ ↵", "Plein écran"], ["⌥ Espace", "Parler / couper le micro"], ["← → ↑ ↓, Début, Fin", "Se déplacer entre les onglets d'une barre (puis ↵ pour ouvrir)"], ["Échap", "Ferme la fenêtre ouverte, la palette, le Vide, ou interrompt Nova"]];
  UI.dlg({ title: "Raccourcis clavier", wide: true, body: [h("table", { class: "ui-kbd" }, h("tbody", {}, ...rows.map((r) => h("tr", {}, h("th", { scope: "row" }, h("kbd", {}, r[0])), h("td", {}, r[1])))))], actions: [{ label: "Fermer", primary: true, value: true }] });
}
window.addEventListener("keyup", (e) => { if (sw.open && (e.key === "Control" || e.key === "Alt")) swCommit(false); });
const editable = (el) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
window.addEventListener("keydown", (e) => {
  if (e.key === "?" && !editable(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey && !document.querySelector(".ui-ov")) { e.preventDefault(); showShortcuts(); return; }
  /* barres d'onglets (role=tablist) : flèches / Début / Fin déplacent le focus, Entrée ouvre */
  if (!e.metaKey && !e.ctrlKey && !e.altKey && e.target.matches && e.target.matches("[role=tab]") && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
    const bar = e.target.closest("[role=tablist]"), tabs = bar ? [...bar.querySelectorAll("[role=tab]")].filter((x) => x.offsetParent !== null) : [], i = tabs.indexOf(e.target);
    if (tabs.length > 1 && i >= 0) { e.preventDefault(); const j = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + tabs.length) % tabs.length; tabs[j].focus(); return; } }
  if (e.key === "Tab" && (e.ctrlKey || e.altKey) && !e.metaKey) { e.preventDefault(); swStep(e.shiftKey ? -1 : 1); return; }
  if (sw.open && e.key === "Escape") { e.preventDefault(); swCommit(true); return; }
  if (e.altKey && e.key === "Enter" && true) { e.preventDefault(); toggleFS(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pal.classList.contains("open") ? closePal() : openPal(); }
  else if (e.key === "Escape") { if (document.body.classList.contains("vide")) vide(false); else if (pal.classList.contains("open")) closePal(); else A.interrupt("touche"); }
  else if (e.altKey && /^[0-9]$/.test(e.key)) { const hb = HUBS[e.key === "0" ? 9 : +e.key - 1]; if (hb) go(lastSub[hb.id] && hb.subs.includes(lastSub[hb.id]) ? lastSub[hb.id] : hb.subs[0]); }
  else if ((e.metaKey || e.ctrlKey) && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { const hb = hubOf(ctx.tab); if (hb && hb.subs.length > 1) { const i = hb.subs.indexOf(ctx.tab), d = e.key === "ArrowRight" ? 1 : hb.subs.length - 1; go(hb.subs[(i + d) % hb.subs.length]); } }

});

let dotsLive = null;
openEvents({ nav: (d) => { if (d && d.tab && ALL.some((t) => t.id === d.tab)) go(d.tab); }, dot: (d) => dotsLive && dotsLive.onEvent(d), brief: (b) => { refresh(); if (ctx.tab === "briefs") go("briefs"); say("Nouveau : " + b.title + " est prêt."); fade(8000); if (ctx.st?.settings.auto_speak_briefs) A.send("Lis-moi ce brief : " + b.text, { voice: true }); },
  assistant: (d) => { if (!A.voiceOn && A.state !== d.state && !["thinking", "speaking", "tool"].includes(A.state)) ctx.avatar.setState(d.state); } });
dotsLive = initDots(ctx, A); window.__A = A; window.__dots = dotsLive;
startWebMailSync();
/* V15 : première ouverture — reprise automatique (une seule fois) des automatismes Bionic / Muse comme Dots planifiés */
(async () => { try { if (localStorage.getItem("nova_imp1")) return; const it = await (await fetch("docs/automatismes_import.json")).json(); const r = await api.post("/api/dots/import", { items: it }); if (r && r.imported >= 0) localStorage.setItem("nova_imp1", "1"); if (r.imported) ctx.toast(r.imported + " automatismes Bionic/Muse repris"); } catch {} })();
/* Le Vide (idées 21, 27) : on efface tout sauf Nova. Voix : « mode vide » / « quitte le vide ». */
function vide(on) { document.body.classList.toggle("vide", !!on); for (const n of [side, side2, view, top, dock]) { try { n.inert = !!on; } catch {} } if (on) { const vx = document.getElementById("videx"); vx && vx.focus(); } if (on) { dockAvatar(false); say("Je suis là. Silence.", ""); fade(3000); } }
window.Nova.vide = vide;
{ const prev = A.onCommand; A.onCommand = (t) => { const x = String(t).toLowerCase();
  if (/(mode vide|entre dans le vide|fais le vide|le vide)\b/.test(x) && x.split(" ").length < 7) { vide(true); return true; }
  if (/(quitte le vide|sors du vide|sortir du vide|fin du vide)/.test(x)) { vide(false); return true; }
  return prev ? prev(t) : false; }; }
 ctx.say = say; ctx.dots = dotsLive;
window.__stage="boot: refresh()";
await refresh(); window.__stage="boot: avatar";
dockAvatar(false); placeAvatar(orbHost); window.__stage="boot: go()";
{ let last = ""; try { last = localStorage.getItem("nova_lasttab") || ""; } catch {}   // restaure le dernier onglet ouvert (le lien #/onglet reste prioritaire)
  const hashId = (location.hash.match(/#\/(\w+)/) || [])[1];
  await go(hashId && ALL.some((t) => t.id === hashId) ? hashId : ALL.some((t) => t.id === last) ? last : "accueil"); }
{ const sk = document.getElementById("skip"); sk && sk.addEventListener("click", (e) => { e.preventDefault(); view.focus(); });
  const vx = document.getElementById("videx"); vx && vx.addEventListener("click", () => vide(false)); }
setInterval(refresh, 30000);
window.__novaBooted && window.__novaBooted();
window.addEventListener("hashchange", () => { const m = location.hash.match(/#\/(\w+)/); if (m && m[1] !== ctx.tab && ALL.some((t) => t.id === m[1])) go(m[1]); });

/* inclinaison 3D douce des cartes selon le pointeur (délégation, aucune boucle) */
view.addEventListener("pointermove", (e) => { const c = e.target.closest && e.target.closest(".card,.tile"); if (!c || c.querySelector("button,input,select,textarea,a,.webslot")) return;   // jamais d'inclinaison sous une zone cliquable ou de saisie
  const r = c.getBoundingClientRect(); if (r.height > 520) return; c.style.setProperty("--rx", (-((e.clientY - r.top) / r.height - 0.5) * 5).toFixed(2) + "deg"); c.style.setProperty("--ry", (((e.clientX - r.left) / r.width - 0.5) * 6).toFixed(2) + "deg"); });
view.addEventListener("pointerout", (e) => { const c = e.target.closest && e.target.closest(".card,.tile"); if (c) { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); } });

// Thème « Solaire Auto » : on réévalue toutes les 5 min (jour → crépuscule → nuit).
setInterval(() => { try { if (document.documentElement.dataset.themePref === "auto") { applyTheme("auto"); ctx.syncTheme && ctx.syncTheme(); } } catch {} }, 300000);
