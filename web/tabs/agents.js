import { mountPlush } from "../plush.js";
import { api, esc, md, h, sse } from "../core.js";
const TOOLS = ["web_search", "web_fetch", "mail_unread", "calendar", "reminders", "read_file", "remember", "recall", "know", "system", "draft_reply", "processes", "open", "shell", "applescript", "app"];
const RISKY = ["shell", "applescript", "app", "open", "read_file"];   // outils à effet de bord ou d'accès fichiers : signalés avant toute importation

/* ══════════ Boîte à outils partagée (exportée : utilisée aussi par ame.js et app.js) ══════════
   Boîtes de dialogue accessibles, confirmation de suppression, annulation (toast), export/import JSON,
   barre de recherche, états chargement / erreur avec « Réessayer », conversion d'horaires en langage clair. */
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const uid = () => Math.random().toString(36).slice(2, 8);
const fdate = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const announce = (m) => { const e = document.getElementById("srlive"); if (e) { e.textContent = ""; setTimeout(() => (e.textContent = m), 40); } };
function toast(msg, ms = 2800) { const e = h("div", { class: "toast", role: "status" }, msg); document.body.append(e); setTimeout(() => e.remove(), ms); return e; }
function undoToast(msg, onUndo, ms = 9000) {
  let t; const e = h("div", { class: "toast ui-undo", role: "status" }, h("span", {}, msg), h("button", { class: "btn sm", type: "button", onclick: async () => { clearTimeout(t); e.remove(); try { await onUndo(); toast("Annulé : c'est rétabli."); } catch (x) { toast("Annulation impossible : " + (x && x.message || x)); } } }, "Annuler"));
  document.body.append(e); t = setTimeout(() => e.remove(), ms); return e;
}
/** Dialogue modal : role=dialog, focus piégé, Échap = annuler (sans interrompre Nova), focus rendu à l'élément d'origine. Résout la valeur de l'action choisie, ou null. */
function dlg({ title, body = [], actions = [{ label: "OK", primary: true, value: true }], wide = false }) {
  return new Promise((resolve) => {
    const prev = document.activeElement, tid = "dl" + uid(); let ov;
    const done = (v) => { ov.remove(); try { prev && prev.focus && prev.focus(); } catch {} resolve(v); };
    const btns = actions.map((a) => h("button", { class: "btn" + (a.primary ? " primary" : "") + (a.danger ? " danger" : ""), type: "button", onclick: () => { if (a.validate && a.validate() === false) return; done(typeof a.value === "function" ? a.value() : a.value === undefined ? true : a.value); } }, a.label));
    const box = h("div", { class: "card ui-dlg" + (wide ? " wide" : ""), role: "dialog", "aria-modal": "true", "aria-labelledby": tid, tabindex: "-1" }, h("h2", { id: tid }, title), ...[].concat(body), h("div", { class: "row ui-dact" }, h("button", { class: "btn", type: "button", onclick: () => done(null) }, "Annuler"), ...btns));
    ov = h("div", { class: "ui-ov", onpointerdown: (e) => { if (e.target === ov) done(null); }, onkeydown: (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); }
      else if (e.key === "Tab") { const f = [...box.querySelectorAll("button,input,select,textarea,a[href]")].filter((x) => !x.disabled && x.offsetParent !== null); if (!f.length) return; const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
      else if (e.key === "Enter" && e.target.tagName === "INPUT" && !["checkbox", "radio", "file"].includes(e.target.type)) { const p = box.querySelector(".btn.primary"); if (p) { e.preventDefault(); p.click(); } } } }, box);
    document.body.append(ov);
    (box.querySelector("[data-autofocus],input:not([type=checkbox]),textarea,select") || box.querySelector(".btn.primary") || box.querySelector(".ui-dact button") || box).focus();
  });
}
const confirmDlg = async (msg, { title = "Confirmer", ok = "Confirmer", danger = false, detail } = {}) =>
  !!(await dlg({ title, body: [h("p", {}, msg), detail ? h("p", { class: "muted" }, detail) : null], actions: [{ label: ok, primary: !danger, danger, value: true }] }));
function download(name, data, type = "application/json") {
  const txt = typeof data === "string" ? data : JSON.stringify(data, null, 2); const url = URL.createObjectURL(new Blob([txt], { type }));
  const a = h("a", { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
function pickJSON(maxBytes = 5e6) {
  return new Promise((res) => { const i = h("input", { type: "file", accept: ".json,application/json", style: "display:none", "aria-label": "Choisir un fichier JSON" });
    i.onchange = async () => { const f = i.files[0]; i.remove(); if (!f) return res(null); if (f.size > maxBytes) { toast("Fichier trop volumineux (> 5 Mo)."); return res(null); }
      try { res(JSON.parse(await f.text())); } catch { toast("Ce fichier n'est pas un JSON valide."); res(null); } };
    i.addEventListener("cancel", () => { i.remove(); res(null); }); document.body.append(i); i.click(); });
}
function searchBar({ placeholder, label, value = "", onInput, extra = [] }) {
  const inp = h("input", { type: "search", placeholder, "aria-label": label || placeholder, value, style: "flex:1;min-width:180px" }); let t;
  inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => onInput(inp.value), 120); });
  return { el: h("div", { class: "row ui-bar", role: "search" }, inp, ...extra), inp };
}
const errCard = (e, retry) => h("div", { class: "card banner", role: "alert" }, h("b", {}, "Impossible de charger cet écran. "), h("span", {}, String((e && e.message) || e || "erreur inconnue")), retry ? h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn primary", type: "button", onclick: retry }, "Réessayer")) : null);
const emptyCard = (msg, cta) => h("div", { class: "card muted", role: "status" }, msg, cta ? h("div", { class: "row", style: "margin-top:8px" }, cta) : null);
/** Monte un onglet dans `el` : état de chargement, erreur avec « Réessayer », rechargement local (sans quitter l'onglet). */
async function page(el, ctx, build) {
  const box = h("div", { class: "ui-root" }); el.append(box);
  const mount = async () => { box.replaceChildren(); try { await build(box, mount); } catch (e) { console.error(e); box.replaceChildren(errCard(e, mount)); } };
  await mount();
}
const takeHintObj = (ctx, id) => (ctx && ctx.takeHint ? ctx.takeHint(id) : null);
const takeHint = (ctx, id) => { const o = takeHintObj(ctx, id); return (o && o.q) || ""; };
const csvCell = (v) => { let s = String(v ?? "").replace(/\r?\n/g, " "); if (/^[=+\-@\t]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };

/* Horaires des Dots : même grammaire que le planificateur Swift (« 07:30 », « 07:30,12:00 », préfixe « lun-ven » ou « sam »). */
const DAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"], DAYFR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
function parseSched(raw) {
  const s0 = String(raw ?? "").toLowerCase().trim(); if (!s0) return { empty: true, days: null, times: [], text: "manuel (aucun horaire)" };
  let s = s0, days = null, dl = "tous les jours"; const m = s.match(/^([a-zé]{3}(?:-[a-zé]{3})?)\s+/);
  if (m) { const p = m[1].split("-"), idx = p.map((x) => DAYS.indexOf(x));
    if (idx.includes(-1)) return { error: "Jour inconnu « " + m[1] + " » : utilise lun, mar, mer, jeu, ven, sam, dim (ex. : lun-ven 08:00)." };
    const rng = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    days = p.length === 2 ? (idx[0] <= idx[1] ? rng(idx[0], idx[1]) : [...rng(idx[0], 6), ...rng(0, idx[1])]) : [idx[0]]; dl = p.length === 2 ? p[0] + "–" + p[1] : "chaque " + DAYFR[idx[0]]; s = s.slice(m[0].length); }
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean); if (!parts.length) return { error: "Aucune heure. Format : HH:MM (ex. : 07:30 ou lun-ven 08:00,18:30)." };
  const times = []; for (const t of parts) { const mm = t.match(/^(\d{1,2}):(\d{2})$/); if (!mm || +mm[1] > 23 || +mm[2] > 59) return { error: "Heure invalide « " + t + " » : format HH:MM entre 00:00 et 23:59." }; times.push(+mm[1] * 60 + +mm[2]); }
  const ts = [...new Set(times)].sort((a, b) => a - b);
  return { days, times: ts, text: dl + " à " + ts.map((t) => String(t / 60 | 0).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0")).join(", ") };
}
function nextRun(p, now = new Date()) {
  if (!p || p.error || p.empty) return null;
  for (let off = 0; off < 8; off++) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off); if (p.days && !p.days.includes((d.getDay() + 6) % 7)) continue;
    for (const t of p.times) { const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), t / 60 | 0, t % 60); if (dt > now) return dt; } }
  return null;
}
function fmtNext(dt) {
  if (!dt) return "—"; const now = new Date(), t = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), diff = Math.round((day(dt) - day(now)) / 86400000);
  return diff === 0 ? "aujourd'hui " + t : diff === 1 ? "demain " + t : dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) + " " + t;
}
const ago = (iso) => { if (!iso) return "jamais"; const m = Math.round((Date.now() - new Date(iso)) / 60000); return isNaN(m) ? "—" : m < 1 ? "à l'instant" : m < 60 ? "il y a " + m + " min" : m < 1440 ? "il y a " + Math.round(m / 60) + " h" : "il y a " + Math.round(m / 1440) + " j"; };
const isActive = (d) => !!String(d.schedule || "").trim();
const cleanDot = (d) => { const n = { ...d }; delete n.persona; return n; };
async function askSchedule(initial = "09:00") {
  const inp = h("input", { value: initial, "aria-label": "Horaire", placeholder: "07:30 ou lun-ven 08:00,18:30", "aria-describedby": "schm" }), msg = h("div", { id: "schm", class: "muted", role: "status" });
  const upd = () => { const p = parseSched(inp.value); msg.textContent = p.error ? "⚠ " + p.error : p.empty ? "Saisis un horaire pour activer." : "→ " + p.text + " · prochaine : " + fmtNext(nextRun(p)); msg.style.color = p.error ? "#ff8c98" : ""; }; inp.addEventListener("input", upd); upd();
  return dlg({ title: "Activer ce Dot : à quelle heure ?", body: [h("p", { class: "muted" }, "Le Dot n'a pas d'horaire mémorisé. Exemples : 07:30 · 07:30,18:30 · lun-ven 08:00 · sam 10:00"), inp, msg],
    actions: [{ label: "Activer", primary: true, value: () => inp.value.trim(), validate: () => { const p = parseSched(inp.value); if (p.error || p.empty) { upd(); return false; } } }] });
}
async function setActive(d, on) {
  const nd = cleanDot(d);
  if (on) { let s = String(d.schedule_saved || "").trim(); if (!s || parseSched(s).error) { s = await askSchedule(s || "09:00"); if (!s) return false; } nd.schedule = s; delete nd.schedule_saved; }
  else { nd.schedule_saved = String(d.schedule || d.schedule_saved || ""); nd.schedule = ""; }
  const r = await api.post("/api/dots/save", nd); if (r && r.error) throw new Error(r.error); return true;
}
/** Nettoie un Dot importé : champs bornés, outils limités à la liste connue, horaire validé. */
function sanitizeDot(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null; const name = String(d.name || "").trim().slice(0, 80); if (!name) return null;
  const sch = String(d.schedule || d.schedule_saved || "").trim(), ok = sch && !parseSched(sch).error;
  return { id: /^[a-z0-9][a-z0-9_-]{0,39}$/i.test(String(d.id || "")) ? String(d.id) : "", name, emoji: String(d.emoji || "🟣").slice(0, 8), role: String(d.role || "").slice(0, 200), prompt: String(d.prompt || "").slice(0, 8000),
    tools: (Array.isArray(d.tools) ? d.tools : []).filter((t) => TOOLS.includes(t)), brain: /^[a-z0-9_-]{1,30}$/i.test(String(d.brain || "")) ? String(d.brain) : "auto", color: /^#[0-9a-f]{6}$/i.test(String(d.color || "")) ? d.color : "#8b5cf6", schedule_saved: ok ? sch : "" };
}
const exportDots = (items) => { download("dots-nova-" + stamp() + ".json", { nova_dots: 1, exported: new Date().toISOString(), items: items.map(cleanDot) }); toast(items.length + " Dot(s) exporté(s)."); };
async function importDots(items, ctx, done) {
  const data = await pickJSON(); if (!data) return;
  const raw = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : null; if (!raw) return toast("Format non reconnu : attendu { items: [ … ] } exporté par Nova.");
  const list = raw.slice(0, 100).map(sanitizeDot).filter(Boolean); if (!list.length) return toast("Aucun Dot valide dans ce fichier.");
  const have = new Set(items.map((x) => x.id)), clash = list.filter((x) => x.id && have.has(x.id)), risky = [...new Set(list.flatMap((x) => x.tools.filter((t) => RISKY.includes(t))))];
  const choice = await dlg({ title: "Importer " + list.length + " Dot(s)", wide: true, body: [h("ul", {}, ...list.slice(0, 12).map((x) => h("li", {}, x.emoji + " " + x.name + (x.id && have.has(x.id) ? " — existe déjà" : "")))), list.length > 12 ? h("p", { class: "muted" }, "… et " + (list.length - 12) + " autre(s)") : null,
    h("p", { class: "muted" }, "Sécurité : les Dots importés arrivent inactifs (aucun lancement automatique) ; tu les actives toi-même après relecture."), risky.length ? h("p", { class: "banner" }, "⚠ Outils sensibles demandés : " + risky.join(", ") + ". Relis leurs consignes avant d'activer.") : null],
    actions: [{ label: "Importer (garder l'existant)", primary: true, value: "keep" }, clash.length ? { label: "Importer et remplacer " + clash.length + " existant(s)", danger: true, value: "replace" } : null].filter(Boolean) });
  if (!choice) return; let n = 0, skipped = 0;
  for (const x of list) { if (x.id && have.has(x.id) && choice === "keep") { skipped++; continue; } const o = { ...x, id: x.id || (x.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "dot") + "-" + uid(), schedule: "" };
    const r = await api.post("/api/dots/save", o); if (!r || r.error) { toast("Échec pour « " + x.name + " »."); continue; } n++; }
  toast(n + " Dot(s) importé(s)" + (skipped ? " · " + skipped + " ignoré(s)" : "") + "."); done && done();
}
export const UI = { dlg, confirm: confirmDlg, toast, undoToast, download, pickJSON, searchBar, errCard, emptyCard, page, norm, uid, fdate, announce, takeHint, takeHintObj, csvCell, stamp, parseSched, nextRun, fmtNext, ago };

async function runDot(d, task, out, ctx, after) {
  let text = "", failed = false; const box = h("div", { class: "md", "aria-live": "polite" }), steps = h("div", { class: "grid" }), status = h("div", { class: "muted", role: "status" }, "⏳ Exécution en cours…");
  out.replaceChildren(h("h2", {}, d.emoji + " " + d.name), status, steps, box);
  const t0 = Date.now();
  try {
    await sse("/api/dots/run", { id: d.id, task }, (ev, x) => {
      if (ev === "delta") { text += x.t; box.innerHTML = md(text); }
      else if (ev === "tool") steps.append(h("details", { class: "tool" }, h("summary", {}, "🔧 " + x.name + " " + String(x.input || "").slice(0, 80)), h("pre", { style: "white-space:pre-wrap" }, x.output)));
      else if (ev === "failover") steps.append(h("div", { class: "sys warn" }, "⤳ " + x.from + " → " + x.to));
      else if (ev === "error") { failed = true; steps.append(h("div", { class: "sys warn" }, "⚠ " + x.message)); } });
  } catch (e) { failed = true; steps.append(h("div", { class: "sys warn" }, "⚠ " + e.message)); }
  const ok = !!text && !failed;
  status.textContent = (ok ? "✓ Terminé" : text ? "⚠ Terminé avec des erreurs" : "✗ Échec") + " en " + Math.round((Date.now() - t0) / 1000) + " s";
  if (!text) box.append(h("div", { class: "err" }, "Aucun résultat : voir les erreurs ci-dessus."));
  if (!ok) out.append(h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn primary", type: "button", onclick: () => runDot(d, task, out, ctx, after) }, "↻ Réessayer")));
  UI.announce(d.name + " : " + (ok ? "terminé" : "échec")); after && after(ok);
}
const CAP = {
  chercheur: ["Tendances du secteur", "Analyse de la concurrence", "Opportunités", "Synthèses sourcées"],
  analytics: ["Suivre les indicateurs", "Analyser fichiers et données", "Repérer les opportunités", "Rapports chiffrés"],
  contenu: ["Articles et pages", "Contenus sociaux", "Optimisation SEO", "Brouillons à ton ton"],
  social: ["Créer les publications", "Planifier les horaires", "Préparer les réponses", "Suivre les résultats"],
  code: ["Lire les projets", "Repérer bugs et dette", "Proposer des correctifs", "Automatiser des tâches"],
  projet: ["Planifier et coordonner", "Suivre l'avancement", "Gérer les échéances", "Te tenir au courant"],
  ops: ["Surveiller le Mac", "Processus et fichiers", "Maintenance proposée", "Gagner du temps"],
  courrier: ["Lire les mails non lus", "Classer par urgence", "Brouillons de réponse", "Ne jamais envoyer"],
  redacteur: ["Messages Teams et mails", "Ta charte exacte", "HTML prêt à coller", "Brouillon seulement"],
  agenda: ["Plan des 24 h", "Rappels", "Conflits d'horaires", "À préparer"],
  veille: ["Actualité des sujets suivis", "Sources et dates", "Synthèse en puces", "Zéro chiffre sans source"],
  brvm: ["Indices BRVM", "Hausses et baisses", "Annonces des sociétés", "Aucun conseil d'achat"],
  mac: ["Batterie", "Mémoire et disque", "Charge machine", "Alerte seulement si besoin"],
  bilan: ["Ce qui s'est passé", "Ce qui reste", "Préparer demain", "Fermer la journée"],
};
const TOOLFR = { web_search: "Recherche web", web_fetch: "Lecture de pages", mail_unread: "Mails", calendar: "Agenda", reminders: "Rappels", read_file: "Fichiers", remember: "Mémoire", recall: "Mémoire", know: "Tes documents", system: "État du Mac", draft_reply: "Brouillons", processes: "Processus" };
const EVERY = [["60", "chaque heure"], ["240", "toutes les 4 h"], ["720", "2 fois par jour"], ["1440", "chaque jour"], ["10080", "chaque semaine"]];
const MSTATUS = { active: "en cours", paused: "en pause", waiting: "attend ta décision", done: "terminée" };

const dots = { id: "dots", title: "Dots", desc: "Agents autonomes, missions de fond", icon: "dot", async render(el, ctx) {
  const S = { q: takeHint(ctx, "dots"), f: "tous", mq: "", mf: "ouvertes" };
  return page(el, ctx, async (box, reload) => {
    const d0 = await api.get("/api/dots"); const items = d0.items || []; let runs = d0.runs || [], missions = [], mErr = null;
    try { missions = (await api.get("/api/missions")).items || []; } catch (e) { mErr = e; }
    const out = h("div", { class: "card", style: "min-height:120px", tabindex: "-1", "aria-live": "polite" }, h("div", { class: "muted" }, "Choisis un Dot pour le lancer, voir ses étapes, son horaire et son historique."));
    const task = h("input", { placeholder: "Tâche ponctuelle (facultatif — sinon sa mission permanente)", "aria-label": "Tâche ponctuelle" }); let sel = null;
    const by = (id) => items.find((d) => d.id === id);
    const lastOf = (d) => runs.find((x) => x.dot === d.id);
    const st = ctx.st && ctx.st.settings || {}, autoOff = st.dots_auto === false;
    const info = (d) => { const p = parseSched(d.schedule); return { p, active: isActive(d), next: isActive(d) && !p.error ? fmtNext(nextRun(p)) : null }; };
    const afterRun = async () => { try { const n = await api.get("/api/dots"); runs = n.runs || runs; } catch {} paintCards(); if (sel) open(sel, false); };
    /* ── fiche d'un Dot : horaire lisible, prochaine exécution, historique, actions ── */
    const runItem = (r, d) => h("details", { class: "card act " + (r.ok ? "r" : "w") },
      h("summary", { class: "row" }, h("span", { class: "chip " + (r.ok ? "good" : "bad") }, r.ok ? "réussi" : "échec"), h("b", {}, fdate(r.ts)), h("span", { class: "muted", style: "flex:1" }, (r.ms ? Math.round(r.ms / 1000) + " s" : "") + (r.brain ? " · " + r.brain : "") + (r.task ? " · tâche : " + String(r.task).slice(0, 60) : "")),
        r.ok ? null : h("button", { class: "btn sm", type: "button", onclick: (e) => { e.preventDefault(); runDot(d, r.task || "", out, ctx, afterRun); } }, "↻ Réessayer")),
      r.result ? h("div", { class: "md", html: md(r.result) }) : h("div", { class: "muted" }, "(aucun texte produit)"), ...((r.steps || []).map((s) => h("details", { class: "tool" }, h("summary", {}, "🔧 " + s.tool + " " + String(s.input || "").slice(0, 80)), h("pre", { style: "white-space:pre-wrap" }, s.output || "")))));
    function open(d, scroll = true) {
      sel = d; const i = info(d), mine = runs.filter((x) => x.dot === d.id);
      const toggle = h("button", { class: "btn", type: "button", role: "switch", "aria-checked": String(i.active), onclick: async (e) => { e.currentTarget.disabled = true; try { if (await setActive(d, !i.active)) { toast(i.active ? "Dot désactivé : plus d'exécution automatique." : "Dot activé."); reload(); } else e.target.disabled = false; } catch (x) { toast("Échec : " + x.message); e.target.disabled = false; } } }, i.active ? "⏸ Désactiver" : "▶ Activer");
      out.replaceChildren(h("h2", {}, d.emoji + " " + d.name), h("div", { class: "muted" }, d.role), h("div", { class: "row", style: "margin:8px 0" }, ...(d.tools || []).map((t) => h("span", { class: "chip" + (RISKY.includes(t) ? " bad" : "") }, (RISKY.includes(t) ? "⚠ " : "") + t))),
        h("div", { class: "row", style: "margin:6px 0" }, h("span", { class: "chip " + (i.active ? "good" : "") }, i.active ? "● actif" : "○ inactif"), i.p.error ? h("span", { class: "chip bad" }, "horaire invalide") : h("span", {}, i.active ? "Horaire : " + i.p.text : d.schedule_saved ? "Horaire mémorisé : " + (parseSched(d.schedule_saved).text || d.schedule_saved) : "Lancement manuel uniquement"), i.next ? h("b", {}, "Prochaine exécution : " + i.next + (autoOff ? " (suspendue : automatismes coupés)" : "")) : null),
        h("div", { class: "row" }, task, h("button", { class: "btn primary", type: "button", onclick: async (e) => { e.target.disabled = true; await runDot(d, task.value, out, ctx, afterRun); } }, "Lancer maintenant")),
        h("div", { class: "row", style: "margin-top:8px" }, toggle, h("button", { class: "btn", type: "button", onclick: () => { ctx.setHint && ctx.setHint("atelier", d.id); ctx.go("atelier"); } }, "✎ Modifier"), h("button", { class: "btn", type: "button", onclick: () => exportDots([d]) }, "Exporter ce Dot"),
          h("button", { class: "btn", type: "button", onclick: async () => { if (!await confirmDlg("Supprimer le Dot « " + d.name + " » ? Ses missions resteront mais n'avanceront plus.", { title: "Supprimer ce Dot", ok: "Supprimer", danger: true })) return; const copy = cleanDot(d); await api.post("/api/dots/remove", { id: d.id }); undoToast("Dot « " + d.name + " » supprimé.", async () => { await api.post("/api/dots/save", copy); reload(); }); reload(); } }, "Supprimer")),
        h("h3", { style: "margin:14px 0 6px" }, "Historique des exécutions (" + mine.length + ")"), h("div", { class: "muted", style: "font-size:12px;margin-bottom:6px" }, "Les 30 dernières exécutions, tous Dots confondus, sont conservées côté écran."),
        ...(mine.length ? mine.map((r) => runItem(r, d)) : [h("div", { class: "muted" }, "Aucune exécution enregistrée pour ce Dot.")]));
      if (scroll) { out.scrollIntoView({ behavior: "smooth", block: "nearest" }); out.focus({ preventScroll: true }); }
    }
    const card = (d) => {
      const host = h("div", { class: "dsorb big", title: "Faire apparaître " + d.name, "aria-hidden": "true" }); mountPlush(host, d.color || "#D93226", 118, d.id, d.emoji);
      const last = lastOf(d), i = info(d), caps = CAP[d.id] || [...new Set((d.tools || []).map((t) => TOOLFR[t]).filter(Boolean))].slice(0, 4), mine = missions.filter((x) => x.dot === d.id && x.status !== "done").length;
      return h("div", { class: "dcard", role: "button", tabindex: "0", "aria-label": d.name + " — " + (i.active ? "actif" : "inactif") + (last ? (last.ok ? ", dernier lancement réussi" : ", dernier lancement en échec") : ""), style: "--dc:" + (d.color || "#D93226") + (i.active ? "" : ";opacity:.78"), onclick: () => open(d),
        onkeydown: (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); open(d); } } },
        h("div", { class: "dhead" }, host, h("div", {}, h("b", {}, (d.persona ? d.persona.who + " · " : "") + d.name), h("div", { class: "dsub" }, i.active ? "● actif · ⏰ " + (i.p.error ? d.schedule : i.p.text) : "○ inactif"), i.next ? h("div", { class: "dsub" }, "↳ prochaine : " + i.next) : null)),
        h("ul", { class: "dcaps" }, ...caps.map((c) => h("li", {}, c))),
        h("div", { class: "dfoot" }, h("span", {}, last ? "dernier : " + ago(last.ts) + (last.ok ? " ✓" : " ✗ échec") : "jamais lancé"), mine ? h("span", { class: "dm" }, mine + " mission" + (mine > 1 ? "s" : "")) : h("span")));
    };
    const grid = h("div", { class: "dgrid", role: "group", "aria-label": "Dots" }), cnt = h("span", { class: "muted", role: "status" });
    const visible = () => items.filter((d) => { const i = info(d), l = lastOf(d);
      return (S.f === "tous" || (S.f === "actifs" && i.active) || (S.f === "inactifs" && !i.active) || (S.f === "échecs" && l && !l.ok)) && (!S.q || norm([d.name, d.role, d.id, (d.tools || []).join(" ")].join(" ")).includes(norm(S.q))); });
    function paintCards() { const v = visible(); grid.replaceChildren(...(v.length ? v.map(card) : [emptyCard(items.length ? "Aucun Dot ne correspond à « " + S.q + " » avec ce filtre." : "Aucun Dot. Crée le premier dans l'Atelier de Dots.", items.length ? h("button", { class: "btn sm", type: "button", onclick: () => { S.q = ""; S.f = "tous"; fq.inp.value = ""; ff.value = "tous"; paintCards(); } }, "Effacer les filtres") : h("button", { class: "btn primary", type: "button", onclick: () => ctx.go("atelier") }, "Ouvrir l'Atelier"))])); cnt.textContent = v.length + " / " + items.length + " Dot(s)"; }
    const ff = h("select", { "aria-label": "Filtrer les Dots", style: "width:auto", onchange: () => { S.f = ff.value; paintCards(); } }, ...["tous", "actifs", "inactifs", "échecs"].map((k) => h("option", { value: k, selected: k === S.f }, k === "échecs" ? "dernier lancement en échec" : k)));
    const fq = searchBar({ placeholder: "Rechercher un Dot (nom, rôle, outil)…", label: "Rechercher un Dot", value: S.q, onInput: (v) => { S.q = v; paintCards(); }, extra: [ff, cnt] });
    /* ── missions ── */
    const mbox = h("div", { class: "grid", "aria-label": "Missions" });
    const act = async (url, body, msg) => { try { const r = await api.post(url, body); if (r && r.error) throw new Error(r.error); missions = (await api.get("/api/missions")).items || []; paintM(); if (msg) toast(msg); } catch (e) { toast("Échec : " + e.message); } };
    const mnext = (m) => m.status !== "active" ? null : !m.next_due || m.next_due * 1000 <= Date.now() + 60000 ? "imminent" : fmtNext(new Date(m.next_due * 1000));
    function paintM() {
      const q = norm(S.mq), list = missions.slice().reverse().filter((m) => (S.mf === "toutes" || (S.mf === "ouvertes" ? m.status !== "done" : m.status === S.mf)) && (!q || norm(m.goal + " " + ((by(m.dot) || {}).name || m.dot)).includes(q)));
      mbox.replaceChildren(...(list.length ? list.map((m) => {
        const d = by(m.dot) || {}, log = (m.log || []).slice(-1)[0], ans = h("input", { placeholder: "Ta réponse…", "aria-label": "Ta réponse à la mission" });
        const ev = h("select", { "aria-label": "Fréquence de la mission", style: "width:auto", onchange: () => act("/api/missions/patch", { id: m.id, every_min: +ev.value }, "Fréquence mise à jour") }, ...(EVERY.some((e) => +e[0] === m.every_min) ? [] : [h("option", { value: m.every_min, selected: true }, "toutes les " + m.every_min + " min")]), ...EVERY.map((e) => h("option", { value: e[0], selected: +e[0] === m.every_min }, e[1])));
        return h("div", { class: "card mcard", style: "border-left:4px solid " + (d.color || "var(--accent)") },
          h("div", { class: "row" }, h("b", { class: "grow", style: "flex:1" }, (d.emoji || "●") + " " + (d.name || m.dot) + " — " + m.goal), h("span", { class: "pill" }, MSTATUS[m.status] || m.status)),
          h("div", { class: "muted", style: "font-size:12px" }, (m.steps || 0) + " pas · dernier " + ago(m.last_run) + (mnext(m) ? " · prochain pas : " + mnext(m) : "") + " · créée " + ago(m.created)),
          log ? h("div", { class: "md", style: "margin-top:6px", html: md(log.text) }) : h("div", { class: "muted" }, "Premier pas imminent…"),
          (m.log || []).length > 1 ? h("details", { style: "margin-top:6px" }, h("summary", {}, "Journal complet (" + m.log.length + ")"), ...m.log.slice().reverse().map((l) => h("div", { class: "cmem", style: "padding:6px 10px;margin-top:4px" }, h("div", { class: "muted", style: "font-size:11px" }, fdate(l.ts) + " · " + (l.who || "")), h("div", { class: "md", html: md(l.text || "") })))) : null,
          m.status === "waiting" ? h("div", { class: "row", style: "margin-top:6px" }, h("b", {}, m.question || "Une décision est nécessaire."), ans, h("button", { class: "btn primary", type: "button", onclick: () => ans.value.trim() ? act("/api/missions/answer", { id: m.id, text: ans.value }, "Réponse envoyée") : ans.focus() }, "Répondre")) : null,
          h("div", { class: "row", style: "margin-top:8px" }, m.status !== "done" ? ev : null,
            m.status === "active" ? h("button", { class: "btn sm", type: "button", title: "Exécuter le prochain pas dès maintenant", onclick: () => act("/api/missions/patch", { id: m.id, status: "active" }, "Prochain pas demandé") }, "Avancer maintenant") : null,
            m.status === "active" ? h("button", { class: "btn sm", type: "button", onclick: () => act("/api/missions/patch", { id: m.id, status: "paused" }, "Mission en pause") }, "Pause") : null,
            m.status === "paused" ? h("button", { class: "btn sm", type: "button", onclick: () => act("/api/missions/patch", { id: m.id, status: "active" }, "Mission reprise") }, "Reprendre") : null,
            m.status === "done" ? h("button", { class: "btn sm", type: "button", onclick: () => act("/api/missions/patch", { id: m.id, status: "active" }, "Mission rouverte") }, "Rouvrir") : null,
            m.status !== "done" ? h("button", { class: "btn sm", type: "button", onclick: async () => { if (await confirmDlg("Marquer cette mission comme terminée ?", { ok: "Terminer" })) act("/api/missions/patch", { id: m.id, status: "done" }, "Mission terminée"); } }, "Terminer") : null,
            h("button", { class: "btn sm", type: "button", onclick: async () => { if (await confirmDlg("Supprimer définitivement la mission « " + m.goal.slice(0, 80) + " » et son journal ?", { title: "Supprimer la mission", ok: "Supprimer", danger: true })) act("/api/missions/remove", { id: m.id }, "Mission supprimée"); } }, "Supprimer")));
      }) : [emptyCard(mErr ? "Missions indisponibles : " + mErr.message : missions.length ? "Aucune mission ne correspond au filtre." : "Aucune mission. Confie-en une : le Dot avance par petits pas, garde un journal, et revient vers toi quand il a besoin d'une décision. Il ne peut rien envoyer ni supprimer.", mErr ? h("button", { class: "btn primary", type: "button", onclick: reload }, "Réessayer") : null)]));
    }
    const mf = h("select", { "aria-label": "Filtrer les missions", style: "width:auto", onchange: () => { S.mf = mf.value; paintM(); } }, ...[["ouvertes", "ouvertes"], ["active", "en cours"], ["paused", "en pause"], ["waiting", "attendent une décision"], ["done", "terminées"], ["toutes", "toutes"]].map((k) => h("option", { value: k[0], selected: k[0] === S.mf }, k[1])));
    const mq = searchBar({ placeholder: "Rechercher une mission…", label: "Rechercher une mission", onInput: (v) => { S.mq = v; paintM(); }, extra: [mf] });
    const who = h("select", { "aria-label": "Dot de la mission" }, ...items.map((d) => h("option", { value: d.id }, d.emoji + " " + d.name))), goal = h("textarea", { rows: 2, "aria-label": "Objectif de la mission", placeholder: "Ex. : surveiller la BRVM et me préparer chaque semaine une note sur mes 5 plus grosses lignes ; ou : préparer le dossier visa Thaïlande et me dire ce qui manque." }), every = h("select", { "aria-label": "Fréquence", }, ...EVERY.map((e) => h("option", { value: e[0], selected: e[0] === "240" }, e[1])));
    const give = h("div", { class: "card grid" }, h("h2", {}, "Confier une mission"), h("div", { class: "muted" }, "Le Dot continue en arrière-plan tant que Nova tourne (fenêtre fermée comprise) et te montre le résultat aux étapes importantes."), h("div", { class: "row" }, who, every), goal,
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: async () => { if (!goal.value.trim()) { toast("Décris d'abord l'objectif."); return goal.focus(); } await act("/api/missions/add", { dot: who.value, goal: goal.value, every_min: +every.value }, "Mission confiée"); goal.value = ""; } }, "Confier la mission")));
    paintCards(); paintM();
    const nAct = items.filter(isActive).length;
    box.append(h("div", { class: "hero card" }, h("h1", {}, "Meet Dots"), h("div", { class: "muted" }, "Des agents toujours actifs qui travaillent en arrière-plan avec tes outils et tes objectifs, et te remontent l'essentiel. Chacun a une liste blanche d'outils ; aucun ne peut envoyer ni supprimer."),
      autoOff ? h("div", { class: "banner", style: "margin-top:8px" }, "⚠ Les automatismes sont coupés dans les réglages : aucun Dot ne se lance tout seul.") : (ctx.st && ctx.st.quiet) ? h("div", { class: "banner", style: "margin-top:8px" }, "Heures calmes en cours : les lancements planifiés attendent.") : null,
      h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn primary", type: "button", onclick: async (e) => { if (!await confirmDlg("Lancer maintenant les " + items.length + " Dots ? Chacun va utiliser ses outils autorisés.", { title: "Lancer tous les Dots", ok: "Tout lancer" })) return; e.target.disabled = true; let bad = 0; for (const d of items) { try { const r = await api.post("/api/dots/launch", { id: d.id, task: "" }); if (r && r.error) bad++; } catch { bad++; } } e.target.disabled = false; toast(bad ? bad + " Dot(s) n'ont pas pu démarrer." : "Tous les Dots se préparent…"); } }, "▶ Lancer tous les Dots"),
        h("button", { class: "btn", type: "button", onclick: () => exportDots(items) }, "Exporter (JSON)"), h("button", { class: "btn", type: "button", onclick: () => importDots(items, ctx, reload) }, "Importer (JSON)"),
        h("span", { class: "muted" }, nAct + "/" + items.length + " actifs · " + missions.filter((m) => m.status === "active").length + " mission(s) en cours"))),
      fq.el, grid, out, give, h("h2", { style: "margin:14px 0 6px" }, "Missions"), mq.el, mbox);
  });
} };

const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
const atelier = { id: "atelier", title: "Atelier de Dots", desc: "Créer et régler un agent", icon: "forge", async render(el, ctx) {
  const S = { q: "", hint: takeHint(ctx, "atelier") };
  return page(el, ctx, async (box, reload) => {
    const { items = [] } = await api.get("/api/dots"); const holder = h("div"), out = h("div", { class: "card", style: "display:none" }), list = h("div", { class: "row", role: "list", "aria-label": "Dots existants" }); let dirty = false;
    const paintList = () => { const v = items.filter((d) => !S.q || norm(d.name + " " + d.role + " " + d.id).includes(norm(S.q)));
      list.replaceChildren(...v.map((d) => h("button", { class: "btn", type: "button", role: "listitem", onclick: () => edit(d) }, (isActive(d) ? "● " : "○ ") + d.emoji + " " + d.name)), v.length ? "" : h("span", { class: "muted", role: "status" }, "Aucun Dot ne correspond.")); };
    const sb = searchBar({ placeholder: "Filtrer les Dots…", label: "Filtrer les Dots", onInput: (v) => { S.q = v; paintList(); } });
    async function edit(d, dup = false) {
      if (dirty && !(await confirmDlg("Abandonner les modifications non enregistrées ?", { title: "Modifications en cours", ok: "Abandonner", danger: true }))) return; dirty = false; out.style.display = "none";
      const dd = d ? { ...d } : { id: "", name: "", emoji: "🟣", role: "", prompt: "", tools: ["web_search"], brain: "auto", color: "#8b5cf6", schedule: "" }; const isNew = !d || dup;
      if (dup) { dd.id = ""; dd.name += " (copie)"; delete dd.schedule_saved; dd.schedule = ""; }
      const f = { name: h("input", { value: dd.name, placeholder: "Nom", "aria-label": "Nom du Dot", required: true }), emoji: h("input", { value: dd.emoji, style: "width:70px", "aria-label": "Emoji" }), role: h("input", { value: dd.role, placeholder: "Rôle en une ligne", "aria-label": "Rôle" }),
        schedule: h("input", { value: dd.schedule || dd.schedule_saved || "", placeholder: "Horaire (ex. 07:30 ou lun-ven 08:00,18:30) — vide = manuel", "aria-label": "Horaire d'apparition", "aria-describedby": "schinfo" }), prompt: h("textarea", { rows: 7, "aria-label": "Mission permanente", placeholder: "Mission permanente : ce que ce Dot doit faire, ses règles, son format de livraison." }, dd.prompt) };
      const on = h("input", { type: "checkbox", style: "width:auto", id: "dact" }); on.checked = isActive(dd) || (isNew && !!dd.schedule);
      const info = h("div", { id: "schinfo", class: "muted", role: "status" }), nerr = h("div", { class: "err", role: "alert" });
      const upd = () => { const p = parseSched(f.schedule.value); f.schedule.setAttribute("aria-invalid", String(!!p.error)); info.style.color = p.error ? "#ff8c98" : ""; info.textContent = p.error ? "⚠ " + p.error : p.empty ? "Aucun horaire : le Dot ne se lance qu'à la demande." : "→ " + p.text + (on.checked ? " · prochaine exécution : " + fmtNext(nextRun(p)) : " · inactif tant que « Actif » n'est pas coché"); };
      const checks = TOOLS.map((t) => { const c = h("input", { type: "checkbox", style: "width:auto" }); c.checked = (dd.tools || []).includes(t); c.dataset.t = t; return h("label", { class: "chip" + (RISKY.includes(t) ? " bad" : ""), title: RISKY.includes(t) ? "Outil sensible : accès fichiers ou commandes" : "" }, c, (RISKY.includes(t) ? "⚠ " : "") + t); });
      const form = h("div", { class: "card grid" }, h("h2", {}, dup ? "Dupliquer " + d.name : d ? "Modifier " + d.name : "Nouveau Dot"), h("div", { class: "row" }, f.emoji, f.name), nerr, f.role, f.schedule, info, h("label", { class: "row" }, on, "Actif (se lance tout seul à l'horaire)"), f.prompt, h("div", { class: "muted" }, "Outils autorisés (appliqués à l'exécution) :"), h("div", { class: "row", role: "group", "aria-label": "Outils autorisés" }, ...checks));
      const sv = async (andTest) => {
        nerr.textContent = ""; const name = f.name.value.trim(), p = parseSched(f.schedule.value);
        if (!name) { nerr.textContent = "Le nom est obligatoire."; f.name.setAttribute("aria-invalid", "true"); return f.name.focus(); }
        if (p.error) { upd(); return f.schedule.focus(); }
        if (on.checked && p.empty) { nerr.textContent = "Pour activer le Dot, saisis un horaire."; return f.schedule.focus(); }
        if (items.some((x) => x.id !== dd.id && norm(x.name) === norm(name))) { nerr.textContent = "Un Dot porte déjà ce nom."; return f.name.focus(); }
        const sch = f.schedule.value.trim(), tools = checks.filter((l) => l.firstChild.checked).map((l) => l.firstChild.dataset.t);
        const o = { ...cleanDot(dd), id: dd.id || slug(name) + "-" + uid(), name, emoji: f.emoji.value.trim() || "🟣", role: f.role.value, prompt: f.prompt.value, tools, schedule: on.checked ? sch : "" };
        if (!on.checked && sch) o.schedule_saved = sch; else delete o.schedule_saved;
        try { const r = await api.post("/api/dots/save", o); if (r && r.error) throw new Error(r.error); } catch (e) { nerr.textContent = "Enregistrement impossible : " + e.message; return; }
        dirty = false; toast("Dot enregistré"); if (andTest) { const i = items.findIndex((x) => x.id === o.id); if (i >= 0) items[i] = o; else items.push(o); out.style.display = ""; out.scrollIntoView({ block: "nearest" }); await runDot(o, "", out, ctx); } else { S.hint = ""; reload(); }
      };
      [f.name, f.emoji, f.role, f.schedule, f.prompt, on, ...checks.map((c) => c.firstChild)].forEach((x) => x.addEventListener("input", () => { dirty = true; })); f.schedule.addEventListener("input", upd); on.addEventListener("change", upd); upd();
      const acts = h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: () => sv(false) }, "Enregistrer"), h("button", { class: "btn", type: "button", title: "Enregistre puis lance une exécution d'essai", onclick: () => sv(true) }, "Enregistrer et tester"),
        !isNew ? h("button", { class: "btn", type: "button", onclick: () => { dirty = false; edit(d, true); } }, "Dupliquer") : null, !isNew ? h("button", { class: "btn", type: "button", onclick: () => exportDots([d]) }, "Exporter") : null,
        !isNew ? h("button", { class: "btn", type: "button", onclick: async () => { if (!await confirmDlg("Supprimer le Dot « " + d.name + " » ? Cette action retire aussi son horaire.", { title: "Supprimer ce Dot", ok: "Supprimer", danger: true })) return; const copy = cleanDot(d); await api.post("/api/dots/remove", { id: d.id }); dirty = false; undoToast("Dot « " + d.name + " » supprimé.", async () => { await api.post("/api/dots/save", copy); reload(); }); reload(); } }, "Supprimer") : null);
      form.append(acts); holder.replaceChildren(form, out); f.name.focus({ preventScroll: true });
    }
    box.append(h("div", { class: "hero card" }, h("h1", {}, "Atelier de Dots"), h("div", { class: "muted" }, "Crée, règle, teste, duplique ou supprime un agent. Un Dot actif se lance seul à son horaire ; inactif, il ne se lance qu'à la demande.")), sb.el,
      h("div", { class: "row" }, list, h("button", { class: "btn primary", type: "button", onclick: () => edit(null) }, "+ Nouveau Dot"),
        h("button", { class: "btn", type: "button", title: "Reprend les automatismes de Bionic et de Muse/Spark (rapport du matin, rituels…) sans écraser tes Dots", onclick: async () => { try { const it = await (await fetch("docs/automatismes_import.json")).json(); const r = await api.post("/api/dots/import", { items: it }); toast((r.imported || 0) + " automatisme(s) importé(s)"); reload(); } catch (e) { toast("Import impossible : " + e.message); } } }, "Importer Bionic / Muse"),
        h("button", { class: "btn", type: "button", onclick: () => exportDots(items) }, "Exporter tout (JSON)"), h("button", { class: "btn", type: "button", onclick: () => importDots(items, ctx, reload) }, "Importer (JSON)")), holder);
    paintList(); if (S.hint) { const d = items.find((x) => x.id === S.hint || norm(x.name) === norm(S.hint)); if (d) edit(d); }
  });
} };

const memoire = { id: "memoire", title: "Mémoire", desc: "Ce que Nova retient de toi", icon: "brain", async render(el, ctx) {
  const ho = takeHintObj(ctx, "memoire") || {}, S = { q: ho.q || "", src: "", sort: "recent", n: 100 };
  return page(el, ctx, async (box, reload) => {
    let { items = [] } = await api.get("/api/memory");
    const inp = h("input", { placeholder: "Retenir un fait (ex. « Mon sujet suivi est la BRVM »)", "aria-label": "Nouveau souvenir" });
    const add = async () => { const t = inp.value.trim(); if (!t) return inp.focus(); if (t.length > 2000) return toast("Souvenir trop long (2000 caractères max)."); if (items.some((m) => norm(m.text) === norm(t))) return toast("Nova le sait déjà."); try { const r = await api.post("/api/memory/add", { text: t }); if (!r || !r.item) return toast("Rien n'a été retenu (mode sans mémoire ou contenu refusé)."); inp.value = ""; toast("Retenu."); reload(); } catch (e) { toast("Échec : " + e.message); } };
    inp.onkeydown = (e) => { if (e.key === "Enter") add(); };
    const ms = await api.get("/api/memory/settings").catch(() => ({ off: false, sensitive_days: 90 }));
    const days = h("input", { type: "number", min: 0, max: 3650, value: ms.sensitive_days, style: "width:90px", "aria-label": "Jours de rétention" });
    const ctl = h("div", { class: "card" }, h("h2", {}, "Contrôle de la mémoire"),
      h("div", { class: "muted" }, "Rien n'est retenu en silence. Les souvenirs touchant la santé ou les finances expirent tout seuls (0 = jamais). Tu peux couper entièrement la mémoire, exporter ou réimporter ce que Nova retient."),
      ms.off ? h("div", { class: "banner", style: "margin-top:8px" }, "Mode sans mémoire actif : rien n'est retenu ni relu.") : null,
      h("div", { class: "row", style: "margin:8px 0" }, h("label", { class: "row" }, h("input", { type: "checkbox", checked: ms.off, onchange: async (e) => { await api.post("/api/memory/settings", { off: e.target.checked }); toast(e.target.checked ? "Mode sans mémoire activé" : "Mémoire réactivée"); reload(); } }), "Mode sans mémoire (rien n'est retenu ni relu)")),
      h("div", { class: "row" }, h("span", {}, "Expiration santé/finances après"), days, h("span", {}, "jours"),
        h("button", { class: "btn", type: "button", onclick: async () => { const n = Math.max(0, Math.min(3650, +days.value || 0)); days.value = n; const r = await api.post("/api/memory/settings", { sensitive_days: n }); toast("Enregistré" + (r.purged ? " · " + r.purged + " souvenir(s) expiré(s) effacé(s)" : "")); if (r.purged) reload(); } }, "Appliquer"),
        h("button", { class: "btn", type: "button", onclick: async () => { try { const d = await api.get("/api/memory/export"); download("memoire-nova-" + stamp() + ".json", d); toast("Export de " + (d.items || []).length + " souvenir(s)."); } catch (e) { toast("Export impossible : " + e.message); } } }, "Exporter (JSON)"),
        h("button", { class: "btn", type: "button", onclick: importMem }, "Importer (JSON)")));
    async function importMem() {
      const data = await pickJSON(); if (!data) return; const raw = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : null; if (!raw) return toast("Format non reconnu : attendu { items: [ { text } ] } (export de Nova).");
      const have = new Set(items.map((m) => norm(m.text))), fresh = []; for (const x of raw.slice(0, 1000)) { const t = String(typeof x === "string" ? x : x && x.text || "").trim().slice(0, 2000); if (t && !have.has(norm(t))) { have.add(norm(t)); fresh.push(t); } }
      if (!fresh.length) return toast("Rien de nouveau : tous ces souvenirs existent déjà.");
      if (!await confirmDlg("Ajouter " + fresh.length + " souvenir(s) à la mémoire ? Les doublons sont ignorés ; dates et sources d'origine ne sont pas reprises.", { title: "Importer des souvenirs", ok: "Importer" })) return;
      let n = 0; for (const t of fresh.slice(0, 500)) { try { const r = await api.post("/api/memory/add", { text: t }); if (r && r.item) n++; } catch {} }
      toast(n + " souvenir(s) importé(s)" + (n < fresh.length ? " · " + (fresh.length - n) + " refusé(s) ou ignoré(s)" : "") + "."); reload();
    }
    /* connaissances */
    const kb = h("div", { class: "card" }, h("span", { class: "muted" }, "Connaissances : chargement…"));
    const kbLoad = async () => {
      let res;
      try { res = await api.get("/api/knowledge/status"); } catch (e) { return kb.replaceChildren(h("h2", {}, "Connaissances personnelles"), errCard(e, kbLoad)); }
      const { status: st = {}, roots = [] } = res; const ta = h("textarea", { rows: 3, style: "width:100%", spellcheck: "false", "aria-label": "Dossiers indexés" }); ta.value = roots.join("\n");
      const q = h("input", { placeholder: "Tester la recherche dans tes documents (ex. « charte Teams »)", "aria-label": "Rechercher dans tes documents" }), r = h("div", { "aria-live": "polite" });
      const doSearch = async () => { if (!q.value.trim()) return q.focus(); r.replaceChildren(h("span", { class: "muted" }, "Recherche…")); try { const x = await api.get("/api/knowledge/search?q=" + encodeURIComponent(q.value)); r.replaceChildren(...((x.items || []).length ? x.items.map((i) => h("div", { class: "card", style: "margin-top:6px" }, h("b", {}, i.file), h("span", { class: "muted" }, " · " + String(i.path || "").replace(/^\/Users\/[^/]+/, "~")), h("div", { style: "white-space:pre-wrap;font-size:12px;margin-top:4px" }, String(i.text || "").slice(0, 320)))) : [h("div", { class: "muted" }, "Rien trouvé.")])); } catch (e) { r.replaceChildren(errCard(e, doSearch)); } };
      q.onkeydown = (e) => { if (e.key === "Enter") doSearch(); };
      const save = async () => { const rr = ta.value.split("\n").map((x) => x.trim()).filter(Boolean); await api.post("/api/knowledge/roots", { roots: rr }); };
      kb.replaceChildren(h("h2", {}, "Connaissances personnelles"), h("div", { class: "muted" }, "Nova lit lui-même les documents (md, txt, docx, html) de ces dossiers, sur ce Mac uniquement, et s'en sert avant de répondre : tes chartes, règles, cahiers, historiques. Exclus d'office : clés, mots de passe, cookies, finances, santé, passeports ; les lignes qui ressemblent à un secret sont masquées. Finances et santé passent par le Coffre."),
        h("div", { class: "row", style: "margin:8px 0" }, h("span", { class: "chip" }, st.scanning ? "⏳ indexation… " + (st.files || 0) + " fichiers" : (st.indexed_chunks || 0) + " passages indexés"), h("span", { class: "chip" }, (st.files || 0) + " fichiers"), h("span", { class: "chip" }, (st.skipped || 0) + " exclus"), h("span", { class: "chip" }, (st.masked || 0) + " lignes masquées"), st.ts ? h("span", { class: "muted" }, "dernier passage : " + new Date(st.ts).toLocaleString("fr-FR")) : h("span", { class: "muted" }, "jamais indexé")),
        h("div", { class: "muted" }, "Dossiers indexés (un par ligne, sous ton dossier personnel) — ex. ~/Documents, ~/Desktop (macOS te demandera l'autorisation)."), ta,
        h("div", { class: "row", style: "margin:8px 0" }, h("button", { class: "btn", type: "button", onclick: async () => { await save(); toast("Dossiers enregistrés"); } }, "Enregistrer"),
          h("button", { class: "btn primary", type: "button", onclick: async (e) => { e.target.disabled = true; try { await save(); await api.post("/api/knowledge/scan", {}); toast("Indexation lancée"); } catch (x) { e.target.disabled = false; return toast("Échec : " + x.message); } const t = setInterval(async () => { if (!document.body.contains(kb)) return clearInterval(t); try { const s = (await api.get("/api/knowledge/status")).status; if (!s.scanning) { clearInterval(t); kbLoad(); } } catch { clearInterval(t); } }, 2500); } }, "Indexer maintenant")),
        h("div", { class: "row" }, q, h("button", { class: "btn", type: "button", onclick: doSearch }, "Chercher")), r);
      if (ho.kb) { q.value = ho.kb; ho.kb = ""; doSearch(); }
    };
    kbLoad();
    /* liste filtrable, modifiable, pagination */
    const list = h("div", { role: "list", "aria-label": "Souvenirs" }), cnt = h("span", { class: "muted", role: "status" }), more = h("div");
    const srcs = [...new Set(items.map((m) => m.source).filter(Boolean))];
    const view = () => { let v = items.filter((m) => (!S.src || m.source === S.src) && (!S.q || norm(m.text + " " + m.source).includes(norm(S.q)))); v = S.sort === "recent" ? v.slice().reverse() : S.sort === "ancien" ? v.slice() : v.slice().sort((a, b) => String(a.text).localeCompare(String(b.text), "fr")); return v; };
    async function editMem(m) {
      const ta = h("textarea", { rows: 4, "aria-label": "Texte du souvenir", maxlength: "2000", style: "width:100%" }, m.text);
      const v = await dlg({ title: "Modifier ce souvenir", body: [ta, h("p", { class: "muted" }, "Le souvenir est remplacé : sa date devient celle d'aujourd'hui.")], actions: [{ label: "Enregistrer", primary: true, value: () => ta.value.trim(), validate: () => !!ta.value.trim() }] }); if (!v || v === m.text) return;
      try { const r = await api.post("/api/memory/add", { text: v }); if (!r || !r.item) return toast("Modification refusée : l'ancien souvenir est conservé."); await api.post("/api/memory/remove", { id: m.id }); toast("Souvenir modifié."); reload(); } catch (e) { toast("Échec : " + e.message); }
    }
    async function forget(m) {
      if (!await confirmDlg("Oublier ce souvenir ?", { title: "Oublier", ok: "Oublier", danger: true, detail: m.text.slice(0, 200) })) return;
      try { await api.post("/api/memory/remove", { id: m.id }); } catch (e) { return toast("Échec : " + e.message); }
      items = items.filter((x) => x.id !== m.id); paint(); undoToast("Souvenir oublié.", async () => { const r = await api.post("/api/memory/add", { text: m.text }); if (!r || !r.item) throw new Error("refusé"); reload(); });
    }
    function paint() {
      const v = view(), shown = v.slice(0, S.n); cnt.textContent = v.length + " / " + items.length + " souvenir(s)";
      list.replaceChildren(...(shown.length ? shown.map((m) => h("div", { class: "row cmem", role: "listitem", style: "padding:7px 10px;margin-top:6px" }, h("span", { style: "flex:1;white-space:pre-wrap" }, m.text), h("span", { class: "muted" }, (m.source || "") + " · " + String(m.ts).slice(0, 10)),
        h("button", { class: "btn sm", type: "button", "aria-label": "Modifier : " + m.text.slice(0, 40), onclick: () => editMem(m) }, "Modifier"), h("button", { class: "btn sm", type: "button", "aria-label": "Oublier : " + m.text.slice(0, 40), onclick: () => forget(m) }, "Oublier"))) : [emptyCard(items.length ? "Aucun souvenir ne correspond." : "Rien en mémoire. Dis « retiens que… » à Nova, ou ajoute un fait ci-dessus.")]));
      more.replaceChildren(v.length > S.n ? h("button", { class: "btn", type: "button", onclick: () => { S.n += 100; paint(); } }, "Afficher plus (" + (v.length - S.n) + " restants)") : "");
    }
    const sfl = h("select", { "aria-label": "Filtrer par source", style: "width:auto", onchange: () => { S.src = sfl.value; S.n = 100; paint(); } }, h("option", { value: "" }, "toutes les sources"), ...srcs.map((s) => h("option", { value: s }, s)));
    const sso = h("select", { "aria-label": "Trier", style: "width:auto", onchange: () => { S.sort = sso.value; paint(); } }, h("option", { value: "recent" }, "récents d'abord"), h("option", { value: "ancien" }, "anciens d'abord"), h("option", { value: "az" }, "A → Z"));
    const sb = searchBar({ placeholder: "Rechercher dans la mémoire…", label: "Rechercher dans la mémoire", value: S.q, onInput: (v) => { S.q = v; S.n = 100; paint(); }, extra: [sfl, sso, cnt] });
    paint();
    box.append(h("div", { class: "hero card" }, h("h1", {}, "Mémoire (" + items.length + ")"), h("div", { class: "muted" }, "Chaque fait est daté et sourcé. Je ne retiens que ce que tu dis ou me demandes de retenir ; tu peux tout modifier, exporter ou supprimer.")), ctl, kb,
      h("div", { class: "card" }, h("div", { class: "row" }, inp, h("button", { class: "btn primary", type: "button", onclick: add }, "Retenir"), h("button", { class: "btn", type: "button", title: "Importe faits, leçons, objectifs de ~/spark-local/data", onclick: async (e) => { e.target.disabled = true; try { const r = await api.post("/api/import/spark", {}); toast("Import : " + (r.imported ?? 0) + " éléments"); reload(); } catch (x) { toast("Import impossible : " + x.message); e.target.disabled = false; } } }, "Importer de Spark Local")), sb.el, list, more));
  });
} };

const brouillons = { id: "brouillons", title: "Brouillons", desc: "À valider — jamais envoyés", icon: "draft", async render(el, ctx) {
  const S = { q: takeHint(ctx, "brouillons"), f: "tous" }; let done = new Set(); try { done = new Set(JSON.parse(localStorage.getItem("nova_drafts_done") || "[]")); } catch {}
  const saveDone = () => { try { localStorage.setItem("nova_drafts_done", JSON.stringify([...done].slice(-300))); } catch {} };
  return page(el, ctx, async (box, reload) => {
    let { items = [] } = await api.get("/api/drafts"); let acts = []; try { acts = (await api.get("/api/actions")).items || []; } catch {}
    const undoOf = (d) => acts.find((a) => a.undo && a.undo.kind === "draft" && a.undo.id === d.id && !a.undone);   // seule voie de suppression côté serveur : annuler l'action qui l'a créé
    const list = h("div", { class: "grid", role: "list", "aria-label": "Brouillons" }), cnt = h("span", { class: "muted", role: "status" });
    const full = (d) => "À : " + (d.to || "") + "\nObjet : " + (d.subject || "") + "\n\n" + (d.body || "");
    const copy = async (t, what) => { try { await navigator.clipboard.writeText(t); toast(what + " copié."); } catch { toast("Copie impossible : sélectionne le texte et copie-le à la main."); } };
    const view = () => items.slice().reverse().filter((d) => (S.f === "tous" || (S.f === "traités" ? done.has(d.id) : !done.has(d.id))) && (!S.q || norm([d.subject, d.to, d.body].join(" ")).includes(norm(S.q))));
    function paint() {
      const v = view(); cnt.textContent = v.length + " / " + items.length + " brouillon(s)";
      list.replaceChildren(...(v.length ? v.map((d) => { const body = h("textarea", { rows: Math.min(14, Math.max(4, String(d.body || "").split("\n").length + 1)), "aria-label": "Texte du brouillon (modifiable avant copie, non enregistré)", style: "width:100%;margin-top:6px" }, d.body || ""), u = undoOf(d), fin = done.has(d.id);
        return h("div", { class: "card", role: "listitem", style: fin ? "opacity:.7" : "" }, h("div", { class: "row" }, h("b", { style: "flex:1" }, d.subject || "(sans objet)"), fin ? h("span", { class: "chip good" }, "traité") : null), h("div", { class: "muted" }, "→ " + (d.to || "(destinataire non précisé)") + (d.ts ? " · " + fdate(d.ts) : "")), body,
          h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn sm", type: "button", onclick: () => copy(body.value, "Texte") }, "Copier le texte"), h("button", { class: "btn sm", type: "button", onclick: () => copy(full({ ...d, body: body.value }), "Brouillon complet") }, "Copier tout"),
            h("button", { class: "btn sm", type: "button", onclick: () => { fin ? done.delete(d.id) : done.add(d.id); saveDone(); paint(); } }, fin ? "Rouvrir" : "Marquer traité"),
            h("button", { class: "btn sm", type: "button", disabled: !u, title: u ? "Supprime ce brouillon (annule l'action qui l'a créé)" : "Suppression indisponible pour ce brouillon (aucune action annulable trouvée)", onclick: async () => { if (!await confirmDlg("Supprimer ce brouillon ?", { title: "Supprimer le brouillon", ok: "Supprimer", danger: true, detail: d.subject || "" })) return; const r = await api.post("/api/actions/undo", { id: u.id }); toast(r.message || "Supprimé"); reload(); } }, "Supprimer"))); })
        : [emptyCard(items.length ? "Aucun brouillon ne correspond." : "Aucun brouillon. Demande à Nova « prépare une réponse à … » : il apparaîtra ici.")]));
    }
    const ff = h("select", { "aria-label": "Filtrer les brouillons", style: "width:auto", onchange: () => { S.f = ff.value; paint(); } }, ...["tous", "à traiter", "traités"].map((k) => h("option", { value: k }, k)));
    const sb = searchBar({ placeholder: "Rechercher (objet, destinataire, texte)…", label: "Rechercher un brouillon", value: S.q, onInput: (v) => { S.q = v; paint(); }, extra: [ff, cnt, h("button", { class: "btn sm", type: "button", disabled: !items.length, onclick: () => download("brouillons-nova-" + stamp() + ".json", { exported: new Date().toISOString(), items }) }, "Exporter (JSON)")] });
    paint();
    box.append(h("div", { class: "hero card" }, h("h1", {}, "Brouillons à valider (" + items.length + ")"), h("div", { class: "muted" }, "Garde-fou : Nova n'envoie rien, jamais. Elle prépare le texte ; tu le copies, le corriges, l'envoies toi-même. « Traité » est mémorisé sur ce Mac seulement.")), sb.el, list);
  });
} };

const actions = { id: "actions", title: "Actions", desc: "Tout ce que Nova et les Dots ont fait — et pourquoi", icon: "check", async render(el, ctx) {
  const S = { q: takeHint(ctx, "actions"), f: "tout", who: "" };
  return page(el, ctx, async (box, reload) => {
    let { items = [] } = await api.get("/api/actions"); const list = h("div", { role: "list", "aria-label": "Journal des actions" }), cnt = h("span", { class: "muted", role: "status" });
    const when = (t) => { const d = new Date(t); return isNaN(d) ? "" : d.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); };
    const filt = { tout: () => true, écrit: (e) => e.effect === "écrit", lecture: (e) => e.effect !== "écrit", échecs: (e) => !e.ok, annulables: (e) => e.undo && !e.undone, annulées: (e) => e.undone };
    const view = () => items.filter((e) => (filt[S.f] || filt.tout)(e) && (!S.who || e.actor === S.who) && (!S.q || norm([e.tool, e.actor, e.why, e.input, e.result].join(" ")).includes(norm(S.q))));
    const undo = async (e) => {
      if (!await confirmDlg("Annuler cette action ?", { title: "Annuler l'action", ok: "Annuler l'action", danger: true, detail: e.tool + " — " + String(e.input || "").slice(0, 160) })) return;
      try { const r = await api.post("/api/actions/undo", { id: e.id }); toast(r.message || "Fait"); reload(); } catch (x) { toast("Annulation impossible : " + x.message); }
    };
    function paint() {
      const v = view(); cnt.textContent = v.length + " / " + items.length + " action(s)";
      list.replaceChildren(...(v.length ? v.map((e) => h("details", { class: "card act " + (e.effect === "écrit" ? "w" : "r"), role: "listitem" },
        h("summary", { class: "row" }, h("span", { class: "chip", style: e.effect === "écrit" ? "background:#D9322633" : "" }, e.effect === "écrit" ? "écrit" : "lecture"), h("b", {}, e.tool), e.undone ? h("span", { class: "chip" }, "annulée") : null, h("span", { class: "muted", style: "flex:1" }, e.actor + " · " + when(e.ts) + " · " + e.ms + " ms" + (e.ok ? "" : " · ⚠ échec")),
          e.undo && !e.undone ? h("button", { class: "btn sm", type: "button", onclick: (ev) => { ev.preventDefault(); undo(e); } }, "Annuler") : null),
        h("div", { class: "muted" }, "Pourquoi : " + (e.why || "(mission planifiée)")), h("div", {}, h("b", {}, "Entrée : "), e.input || "—"), h("div", { style: "white-space:pre-wrap" }, h("b", {}, "Résultat : "), e.result || "—"),
        e.ok ? null : h("div", { class: "row", style: "margin-top:6px" }, h("span", { class: "err" }, "Cette action a échoué."), h("button", { class: "btn sm", type: "button", onclick: () => { ctx.setHint && ctx.setHint("dots", ""); ctx.go("dots"); } }, "Relancer depuis les Dots / le chat")))) : [emptyCard(items.length ? "Aucune action ne correspond à ces filtres." : "Aucune action pour l'instant. Demande à Nova de consulter ton agenda ou de retenir un fait : elle apparaîtra ici.")]));
    }
    const actors = [...new Set(items.map((e) => e.actor).filter(Boolean))];
    const ff = h("select", { "aria-label": "Type d'action", style: "width:auto", onchange: () => { S.f = ff.value; paint(); } }, ...Object.keys(filt).map((k) => h("option", { value: k, selected: k === S.f }, k)));
    const fw = h("select", { "aria-label": "Auteur de l'action", style: "width:auto", onchange: () => { S.who = fw.value; paint(); } }, h("option", { value: "" }, "tous les auteurs"), ...actors.map((a) => h("option", { value: a }, a)));
    const sb = searchBar({ placeholder: "Rechercher (outil, auteur, raison, entrée, résultat)…", label: "Rechercher dans le journal", value: S.q, onInput: (v) => { S.q = v; paint(); }, extra: [ff, fw, cnt] });
    const csv = () => download("actions-nova-" + stamp() + ".csv", ["date,auteur,outil,effet,ok,pourquoi,entree,resultat"].concat(view().map((e) => [e.ts, e.actor, e.tool, e.effect, e.ok, e.why, e.input, e.result].map(csvCell).join(","))).join("\n"), "text/csv");
    paint();
    box.append(h("div", { class: "hero card" }, h("h1", {}, "Journal des actions (" + items.length + ")"), h("div", { class: "muted" }, "Chaque outil lancé par Nova ou un Dot est noté ici avec la vraie demande qui l'a déclenché, l'entrée et le résultat réels (300 dernières). Ce qui est écrit (souvenir, brouillon) peut être annulé d'un clic, après confirmation ; rien n'est envoyé, payé ni supprimé sans ton accord.")), sb.el,
      h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: reload }, "↻ Actualiser"), h("button", { class: "btn sm", type: "button", onclick: () => download("actions-nova-" + stamp() + ".json", { exported: new Date().toISOString(), items: view() }) }, "Exporter (JSON)"), h("button", { class: "btn sm", type: "button", onclick: csv }, "Exporter (CSV)")), list);
  });
} };
export const agents = [dots, atelier, memoire, actions, brouillons];
