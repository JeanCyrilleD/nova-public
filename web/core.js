// Utilitaires partagés (fenêtre principale + panneau flottant)
export const api = {
  async get(p) { const r = await fetch(p); if (!r.ok) throw new Error(p + " → " + r.status); return r.json(); },
  async post(p, b = {}) { const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return r.json(); },
};
export const THEMES = [
  { id: "nova-imperial", name: "Nova Impérial", desc: "Noir bordeaux, carmin et or.", accent: "#D93226" },
  { id: "cyber", name: "Néo-Cyber 2088", desc: "Néons cyan et magenta, grille.", accent: "#00f0ff" },
  { id: "monolith", name: "Titanium Monolith", desc: "Acier et graphite, angles nets.", accent: "#e5e7eb" },
  { id: "zenith", name: "Solar Zenith", desc: "Nuit d'or, soleil au zénith.", accent: "#ffd700" },
];
export const UNIVERS = [
  { id: "aurore", name: "Aurore Boréale", desc: "Indigo nuit, vert menthe et violet. Verre profond, lettres fines et modernes.", accent: "#5cf2c8" },
  { id: "tokyo", name: "Néon Tokyo", desc: "Magenta et cyan, police mono, angles vifs, grille et lignes de balayage.", accent: "#ff2bd6" },
  { id: "papier", name: "Papier & Encre", desc: "Éditorial : papier crème, encre noire, empattements, ombres plates. Très lisible.", accent: "#b4451f" },
  { id: "ocean", name: "Océan Profond", desc: "Bleu abysse et aqua, formes très rondes, lueurs douces.", accent: "#2fd8e6" },
  { id: "sahel", name: "Sahel Doré", desc: "Sable, terre cuite, indigo ; bandeau inspiré des tissus, capitales Rockwell.", accent: "#c2410c" },
  { id: "titane", name: "Titane Studio", desc: "Graphite mat, bleu électrique, dense et net : l'outil de travail.", accent: "#4f8cff" },
  { id: "zen", name: "Verger Zen", desc: "Sauge et crème, très arrondi, ombres douces : calme et clair.", accent: "#3d8f5a" },
];
export const PRO = [
  { id: "auto", name: "Solaire Auto", desc: "Suit le soleil : Bureau le jour, Crépuscule le soir, Braise la nuit.", accent: "#e8a24a" },
  { id: "bureau", name: "Bureau Clair", desc: "Jour. Blanc froid, bleu net : lecture et travail.", accent: "#1d5fd1" },
  { id: "aube", name: "Aube Douce", desc: "Matin. Crème chaude, terre cuite.", accent: "#c4531f" },
  { id: "ardoise", name: "Ardoise Nuit", desc: "Soirée de travail. Gris bleuté, turquoise, sobre.", accent: "#4db6ac" },
  { id: "crepuscule", name: "Crépuscule", desc: "Coucher du soleil. Ambre chaud, peu de bleu.", accent: "#e8a24a" },
  { id: "braise", name: "Braise Nuit", desc: "Nuit. Très sombre, très chaud : repose les yeux.", accent: "#d9783a" },
];
export function solarTheme(d = new Date()) { const h = d.getHours() + d.getMinutes() / 60; return h >= 7 && h < 17 ? "bureau" : h >= 17 && h < 20 ? "crepuscule" : h >= 20 || h < 5 ? "braise" : "aube"; }
export const ACCESS = [{ id: "clair", name: "Clair", accent: "#C00000" }, { id: "nuit", name: "Confort nocturne", accent: "#f0b45a" }, { id: "contraste", name: "Contraste élevé", accent: "#ffe600" }];
export function applyTheme(id) {
  const all = THEMES.concat(UNIVERS, PRO, ACCESS); const t = all.find((x) => x.id === id) || THEMES[0];
  document.documentElement.dataset.theme = t.id === "auto" ? solarTheme() : t.id; document.documentElement.dataset.themePref = t.id; return t;
}
export const accentOf = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4cc9ff";
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* URL sûre : seuls http(s) et mailto passent (sinon « # »). */
export const safeUrl = (u) => (/^\s*(https?:|mailto:)/i.test(String(u ?? "")) ? String(u).trim() : "#");
/* V15 — cartes générées à la demande : le modèle renvoie du JSON (jamais du HTML) ; seuls ces composants existent, tout texte est échappé. */
function novaCard(raw) {
  let o; try { o = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")); } catch { return ""; }
  if (!o || typeof o !== "object") return "";
  const items = Array.isArray(o.items) ? o.items.slice(0, 12).filter((i) => i && typeof i === "object") : []; const t = (x) => esc(String(x ?? "").slice(0, 120));
  const head = o.title ? '<div class="ncard-t">' + t(o.title) + "</div>" : "";
  let body = "";
  if (o.type === "bars" || o.type === "gauge") {
    const nums = items.map((i) => Number(i.value)).filter((v) => isFinite(v)); const mx = Math.max(...items.map((i) => Number(i.max) || 0), ...nums, 1);
    body = items.map((i) => { const v = Number(i.value), pct = isFinite(v) ? Math.max(0, Math.min(100, (v / (Number(i.max) || mx)) * 100)) : 0;
      return '<div class="ncard-r"><span>' + t(i.label) + '</span><i style="--w:' + pct.toFixed(1) + '%"></i><b>' + t(i.value) + (i.unit ? " " + t(i.unit) : "") + "</b></div>"; }).join("");
  } else if (o.type === "stat") {
    body = '<div class="ncard-stats">' + items.map((i) => '<div><b>' + t(i.value) + (i.unit ? " <small>" + t(i.unit) + "</small>" : "") + "</b><span>" + t(i.label) + "</span></div>").join("") + "</div>";
  } else if (o.type === "list") {
    body = "<ul>" + items.map((i) => "<li><b>" + t(i.label) + "</b>" + (i.value != null ? " — " + t(i.value) : "") + "</li>").join("") + "</ul>";
  } else return "";
  return '<div class="ncard">' + head + body + "</div>";
}
export function md(src) {
  let s = esc(src); const blocks = [];
  s = s.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, l, c) => { blocks.push(l === "nova-card" ? (novaCard(c) || "<pre><code>" + c + "</code></pre>") : "<pre><code>" + c + "</code></pre>"); return "\u0000" + (blocks.length - 1) + "\u0000"; });
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">$1</a>')
    .replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>");
  s = s.replace(/(?:^|\n)((?:[-•] .*(?:\n|$))+)/g, (_, l) => "<ul>" + l.trim().split("\n").map((x) => "<li>" + x.replace(/^[-•] /, "") + "</li>").join("") + "</ul>");
  s = s.split(/\n{2,}/).map((p) => (/^<(ul|h\d|pre)/.test(p.trim()) ? p : "<p>" + p.replace(/\n/g, "<br>") + "</p>")).join("");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
}
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "html") e.innerHTML = v; else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v); }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  if (tag === "button" && attrs && attrs.title && !e.hasAttribute("aria-label") && e.textContent.trim().length <= 2) e.setAttribute("aria-label", attrs.title);   // bouton-icône sans texte
  return e;
}
export function openEvents(handlers) {
  const es = new EventSource("/api/events");
  for (const [k, f] of Object.entries(handlers)) es.addEventListener(k, (e) => { try { f(JSON.parse(e.data)); } catch {} });
  return es;
}
// Lecture d'un flux SSE (POST) : onEvent(nom, données) ; renvoie quand le flux se ferme. signal = AbortController.signal
export async function sse(path, body, onEvent, signal) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}), signal });
  if (!r.ok || !r.body) throw new Error(path + " → " + r.status);
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
  while (true) {
    const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const blk = buf.slice(0, i); buf = buf.slice(i + 2); let ev = "message", data = "";
      for (const l of blk.split("\n")) { if (l.startsWith("event:")) ev = l.slice(6).trim(); else if (l.startsWith("data:")) data += l.slice(5).trim(); }
      let d = {}; try { d = JSON.parse(data); } catch {} onEvent(ev, d);
    }
  }
}

/* ── i18n minimal : dictionnaire EN, repli sur le français passé en argument ── */
const EN = {
  "Accueil & Mac": "Home & Mac", "Âme de Nova": "Nova's Soul", "Converser": "Chat", "Mon temps": "My time", "Messageries & Web": "Messaging & Web", "Médias": "Media", "Savoir": "Knowledge", "Agents & mémoire": "Agents & memory", "Vie & travail": "Life & work", "Système": "System", "Apparence & aide": "Appearance & help",
  "Accueil": "Home", "Communications": "Communications", "Web & médias": "Web & media", "Savoir & veille": "Knowledge & watch", "Dots Studio": "Dots Studio", "Mémoire & Âme": "Memory & Soul", "Système & Réglages": "System & Settings", "Dossier": "Folder", "Plus": "More",
  "Rechercher partout": "Search everywhere", "Rechercher": "Search", "Palette de commandes": "Command palette", "Plein écran": "Full screen", "Réduire": "Collapse", "Agrandir": "Enlarge", "Messagerie": "Messaging", "Épingler": "Pin",
  "Micro": "Microphone", "Conversation": "Conversation", "Langue": "Language", "Français": "French", "Fermer": "Close", "Appliquer": "Apply", "Annuler": "Cancel", "Enregistrer": "Save", "Chargement": "Loading", "Barre du bas": "Bottom bar", "Assistant": "Assistant",
};
let LANG = "fr";
try { const l = localStorage.getItem("nova_lang"); if (l === "en" || l === "fr") LANG = l; } catch {}
try { document.documentElement.lang = LANG; } catch {}
export const getLang = () => LANG;
export const t = (k, fr) => (LANG === "en" ? EN[k] ?? fr ?? k : fr ?? k);
export function setLang(l) { LANG = l === "en" ? "en" : "fr"; try { localStorage.setItem("nova_lang", LANG); } catch {} try { document.documentElement.lang = LANG; } catch {} }
