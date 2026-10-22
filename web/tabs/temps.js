import { api, esc, md, h } from "../core.js";
import { web as nativeWebTxt } from "../native.js";
const webText = (id) => nativeWebTxt.text(id);
// Les brouillons peuvent contenir du HTML simple (<p>, <b>, <ul>) : on l'affiche en texte lisible, jamais en balises brutes.
const plain = (t) => String(t == null ? "" : t).replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|h\d|ul|ol)>/gi, "\n\n").replace(/<li[^>]*>/gi, "• ").replace(/<\/li>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();


/* ── Aides communes (exportées : l'Accueil les réutilise) ── */
export const BAD = /indisponible|a échoué|délai|autorisation|ne répond pas/i;
const pad2 = (n) => String(n).padStart(2, "0");
export const hhmm = (d) => pad2(d.getHours()) + ":" + pad2(d.getMinutes());
export const stampText = (d) => "Mis à jour à " + hhmm(d || new Date());
/* Appel d'outil avec délai maximal : ne reste jamais bloqué. Renvoie { ok, text }. */
export async function readTool(name, arg = "", ms = 100000) {
  let timer;
  try {
    const r = await Promise.race([api.post("/api/tool", { name, arg }), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("délai dépassé")), ms); })]);
    if (!r || typeof r.output !== "string") return { ok: false, text: (r && r.error) || "Réponse inattendue du serveur." };
    return { ok: !BAD.test(r.output), text: r.output };
  } catch (e) { return { ok: false, text: "Lecture impossible : " + e.message }; } finally { clearTimeout(timer); }
}
/* Rafraîchissement automatique (en pause quand la fenêtre est masquée), arrêté en quittant l'onglet. */
export function autoRefresh(ctx, fn, ms) { const t = setInterval(() => { if (!document.hidden) fn(); }, ms); if (ctx && ctx.onLeave) ctx.onLeave(() => clearInterval(t)); }
/* Zone à états : chargement / erreur (avec Réessayer) / vide / contenu. */
export function stateBox(cls = "card") {
  const box = h("div", { class: cls, "aria-live": "polite" });
  return { box,
    set(...n) { box.replaceChildren(...n); },
    loading(t) { box.replaceChildren(h("div", { class: "muted", role: "status" }, t)); },
    empty(t) { box.replaceChildren(h("div", { class: "muted" }, t)); },
    error(msg, retry, hint) { box.replaceChildren(h("div", { class: "banner", role: "alert" }, msg), hint ? h("p", { class: "muted" }, hint) : null, retry ? h("button", { class: "btn", onclick: retry }, "Réessayer") : null); } };
}
const searchBox = (label, ph, onInput) => h("input", { type: "search", class: "inp", placeholder: ph, "aria-label": label, style: "flex:1;min-width:160px", oninput: (e) => onInput(e.target.value) });
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const MON = (s) => { s = norm(s); if (/^juin|^june?$/.test(s)) return 5; if (/^juil|^july?$/.test(s)) return 6; const i = ["jan", "fev", "mar", "avr", "mai", "jui", "jui", "aou", "sep", "oct", "nov", "dec"].indexOf(s.slice(0, 3)); if (i >= 0) return i === 5 ? -1 : i;
  return { feb: 1, apr: 3, may: 4, aug: 7 }[s.slice(0, 3)] ?? -1; };
/* Dates renvoyées par AppleScript (« mardi 20 octobre 2026 à 09:00:00 » ou « Tuesday, October 20, 2026 at 9:00:00 AM »). */
export function parseDate(str) {
  const s = norm(str); let m = s.match(/(\d{1,2})(?:er)?\s+([a-z]+)\.?\s+(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (m) { const mo = MON(m[2]); if (mo >= 0) return new Date(+m[3], mo, +m[1], +(m[4] || 0), +(m[5] || 0)); }
  m = s.match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:\D+(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?)?/);
  if (m) { const mo = MON(m[1]); if (mo >= 0) { let hh = +(m[4] || 0); if (m[6] === "pm" && hh < 12) hh += 12; if (m[6] === "am" && hh === 12) hh = 0; return new Date(+m[3], mo, +m[2], hh, +(m[5] || 0)); } }
  return null;
}
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dayLabel = (d) => { const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1); const base = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); return sameDay(d, n) ? "Aujourd'hui · " + base : sameDay(d, t) ? "Demain · " + base : base; };
const inText = (d) => { const mn = Math.round((d - new Date()) / 60000); if (mn <= 0) return "en cours"; if (mn < 60) return "dans " + mn + " min"; if (mn < 1440) return "dans " + Math.floor(mn / 60) + " h" + (mn % 60 ? " " + pad2(mn % 60) : ""); const j = Math.round(mn / 1440); return "dans " + j + " jour" + (j > 1 ? "s" : ""); };
export function parseEvents(text) {
  const ev = [], notes = [];
  for (const line of String(text).split("\n")) { const p = line.split(" | "); if (p.length >= 2) { const d = parseDate(p[0]); if (d) { ev.push({ d, title: p[1].trim(), cal: (p[2] || "").trim(), allDay: d.getHours() === 0 && d.getMinutes() === 0 }); continue; } } const t = line.trim(); if (t) notes.push(t); }
  ev.sort((a, b) => a.d - b.d); return { ev, notes };
}
export function nextEvent(ev) { const n = new Date(); return ev.find((e) => !e.allDay && e.d >= n) || null; }
const askNova = (ctx, prompt) => { ctx.go("chat"); ctx.A.send(prompt, { voice: ctx.st.settings.voice_enabled }); };

const agenda = { id: "agenda", title: "Agenda", desc: "Calendar.app, en direct", icon: "calendar", async render(el, ctx) {
  let ev = [], notes = [], mode = "semaine", q = "", seq = 0, last = null, failed = "";
  const st = stateBox("card"); const stamp = h("span", { class: "muted", role: "status" }, "");
  const draw = () => {
    const now = new Date(), nq = norm(q);
    const shown = ev.filter((e) => (mode === "semaine" || sameDay(e.d, now)) && (!nq || norm(e.title + " " + e.cal).includes(nq)));
    const nx = nextEvent(ev), kids = [];
    if (failed) kids.push(h("div", { class: "banner", role: "alert" }, "Dernière lecture échouée (données de " + (last ? hhmm(last) : "?") + " affichées) : " + failed, " ", h("button", { class: "btn sm", onclick: () => load() }, "Réessayer")));
    if (nx) kids.push(h("div", { class: "card", style: "border-left:4px solid var(--accent);margin:0 0 10px" }, h("div", { class: "muted" }, "Prochain événement · " + inText(nx.d)), h("b", { style: "font-size:1.1em" }, hhmm(nx.d) + "  " + nx.title), nx.cal ? h("span", { class: "muted" }, "  · " + nx.cal) : null));
    if (!shown.length) kids.push(h("div", { class: "muted" }, ev.length ? "Aucun événement ne correspond" + (mode === "jour" ? " pour aujourd'hui" : "") + (q ? " à « " + q + " »" : "") + "." : "Rien à l'agenda sur les 7 prochains jours."));
    let cur = "";
    for (const e of shown) { const dl = dayLabel(e.d); if (dl !== cur) { cur = dl; kids.push(h("h3", { style: "margin:12px 0 4px;text-transform:capitalize" }, dl)); }
      const past = !e.allDay && e.d < now && sameDay(e.d, now);
      kids.push(h("div", { class: "row", style: "padding:5px 0;border-top:1px solid var(--line)" + (past ? ";opacity:.55" : "") }, h("b", { style: "min-width:64px" }, e.allDay ? "journée" : hhmm(e.d)), h("span", { style: "flex:1" }, e.title), e.cal ? h("span", { class: "chip" }, e.cal) : null)); }
    if (notes.length) kids.push(h("div", { class: "muted", style: "margin-top:10px;white-space:pre-line" }, notes.join("\n")));
    st.set(...kids);
  };
  const modeBtn = (id, label) => { const b = h("button", { class: "btn" + (mode === id ? " primary" : ""), "aria-pressed": mode === id, onclick: () => { mode = id; for (const x of seg.children) { const on = x === b; x.classList.toggle("primary", on); x.setAttribute("aria-pressed", on); } draw(); } }, label); b.dataset.m = id; return b; };
  const seg = h("div", { class: "row", role: "group", "aria-label": "Période" }, modeBtn("jour", "Aujourd'hui"), modeBtn("semaine", "7 jours"));
  const rbtn = h("button", { class: "btn", onclick: () => load() }, "Actualiser");
  const load = async (quiet) => {
    const my = ++seq; rbtn.disabled = true; if (!quiet && !ev.length) st.loading("Lecture de Calendar… (jusqu'à une minute si l'app démarre)");
    const r = await readTool("calendar"); if (my !== seq) return; rbtn.disabled = false;
    const p = parseEvents(r.text);
    if (p.ev.length || /aucun événement/i.test(r.text)) { ev = p.ev; notes = p.notes.filter((x) => /^\(/.test(x)); failed = ""; last = new Date(); stamp.textContent = stampText(last); draw(); return; }
    if (r.ok && !BAD.test(r.text)) { ev = []; notes = []; failed = ""; last = new Date(); stamp.textContent = stampText(last); st.set(h("div", { class: "muted" }, "Rien à l'agenda sur les 7 prochains jours."), h("pre", { style: "white-space:pre-wrap" }, r.text.trim())); return; }
    if (ev.length) { failed = r.text.slice(0, 160); draw(); } else st.error(r.text.slice(0, 300), () => load(), "Autorise Nova à contrôler Calendar : Réglages Système › Confidentialité › Automatisation.");
  };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Agenda"), h("div", { class: "row" }, seg, searchBox("Filtrer l'agenda", "Filtrer (titre, calendrier)…", (v) => { q = v; draw(); }), rbtn,
    h("button", { class: "btn primary", onclick: () => askNova(ctx, "Qu'est-ce que j'ai à l'agenda dans les prochains jours ? Signale les conflits et ce que je dois préparer.") }, "Demander à Nova"), stamp)), st.box);
  seg.children[1].setAttribute("aria-pressed", "true"); seg.children[1].classList.add("primary");
  autoRefresh(ctx, () => load(true), 300000); await load();
} };
const courrier = { id: "courrier", title: "Courrier", desc: "Non lus + brouillons", icon: "mail", async render(el, ctx) {
  let rows = [], count = null, rawTxt = "", q = "", seq = 0, last = null, failed = "";
  const st = stateBox("card md"), dr = h("div", { class: "card" }), stamp = h("span", { class: "muted", role: "status" }, ""), badge = h("span", { class: "chip", "aria-live": "polite" }, "");
  const draw = () => {
    const nq = norm(q), shown = rows.filter((r) => !nq || norm(r.from + " " + r.subject).includes(nq)), kids = [];
    if (failed) kids.push(h("div", { class: "banner", role: "alert" }, "Dernière lecture échouée (données de " + (last ? hhmm(last) : "?") + " affichées) : " + failed, " ", h("button", { class: "btn sm", onclick: () => load() }, "Réessayer")));
    if (rows.length) { if (!shown.length) kids.push(h("div", { class: "muted" }, "Aucun message ne correspond à « " + q + " »."));
      for (const r of shown) kids.push(h("div", { style: "padding:7px 0;border-top:1px solid var(--line)" }, h("b", {}, r.subject || "(sans objet)"), h("div", { class: "muted" }, r.from + (r.date ? " · " + r.date : ""))));
      if (count != null && count > rows.length) kids.push(h("div", { class: "muted", style: "margin-top:8px" }, "Les " + rows.length + " plus récents sur " + count + " non lus.")); }
    else if (count === 0) kids.push(h("div", { class: "muted" }, "Aucun message non lu."));
    else if (count > 0 && !rawTxt) kids.push(h("div", { class: "muted" }, count + " non lu(s), mais aucun parmi les 40 plus récents de la boîte."));
    else if (rawTxt) kids.push(h("pre", { style: "white-space:pre-wrap;margin:0" }, rawTxt));
    st.set(...kids);
  };
  const rbtn = h("button", { class: "btn", onclick: () => load() }, "Actualiser");
  const load = async (quiet) => {
    const my = ++seq; rbtn.disabled = true; if (!quiet && !rows.length) st.loading("Lecture de Mail… (peut être lent si Mail démarre)");
    const r = await readTool("mail_unread", "", 100000); if (my !== seq) return; rbtn.disabled = false;
    const m = r.text.match(/NONLUS=(\d+)/), parsed = [];
    for (const l of r.text.split("\n")) { const p = l.split(" | "); if (p.length >= 3 && !/^\(/.test(l)) parsed.push({ from: p[0].trim(), subject: p.slice(1, -1).join(" | ").trim(), date: p[p.length - 1].trim() }); }
    if (m || parsed.length) { count = m ? +m[1] : parsed.length; rows = parsed; rawTxt = parsed.length || count === 0 ? "" : r.text.trim(); failed = ""; last = new Date(); stamp.textContent = stampText(last); badge.textContent = count + " non lu" + (count > 1 ? "s" : ""); draw(); return; }
    if (r.ok) { rows = []; count = null; rawTxt = r.text.trim(); failed = ""; last = new Date(); stamp.textContent = stampText(last); badge.textContent = ""; rawTxt ? draw() : st.empty("Aucun message non lu."); return; }
    if (rows.length) { failed = r.text.slice(0, 160); draw(); } else st.error(r.text.slice(0, 400), () => load(), "Astuce : « Trier Outlook (web) » et « Trier Gmail (web) » lisent tes boîtes web déjà connectées, sans Mail.app.");
  };
  const drl = async () => { dr.replaceChildren(h("div", { class: "muted", role: "status" }, "Lecture des brouillons…"));
    try { const { items } = await api.get("/api/drafts"); const list = items.slice().reverse();
      dr.replaceChildren(h("h2", {}, "Brouillons préparés (" + items.length + ")"), h("div", { class: "muted" }, "Nova ne ENVOIE jamais : elle prépare, tu valides et tu envoies."), items.length ? "" : h("div", { class: "muted", style: "margin-top:8px" }, "Aucun brouillon pour l'instant. Demande à Nova d'en préparer un."),
        ...list.map((d) => h("div", { style: "padding:8px 0;border-top:1px solid var(--line)" }, h("div", { class: "row" }, h("b", {}, d.subject || "(sans objet)"), h("span", { class: "muted" }, " → " + d.to), h("span", { class: "spacer" }),
          h("button", { class: "btn sm", "aria-label": "Copier le brouillon « " + (d.subject || "sans objet") + " »", onclick: async () => { try { await navigator.clipboard.writeText((d.subject ? d.subject + "\n\n" : "") + plain(d.body)); ctx.toast("Brouillon copié"); } catch { ctx.toast("Copie impossible : sélectionne le texte à la main."); } } }, "Copier")), h("div", { style: "white-space:pre-wrap" }, plain(d.body)))));
    } catch (e) { dr.replaceChildren(h("div", { class: "banner", role: "alert" }, "Brouillons illisibles : " + e.message), h("button", { class: "btn", onclick: drl }, "Réessayer")); } };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Courrier"), h("div", { class: "row" }, badge, searchBox("Filtrer les mails non lus", "Filtrer (expéditeur, objet)…", (v) => { q = v; draw(); }), rbtn, stamp), h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn primary", onclick: () => askNova(ctx, "Résume mes mails non lus, classe-les par urgence et prépare un brouillon de réponse pour le plus urgent (sans l'envoyer).") }, "Trier et préparer avec Nova"),
    ...[["ol", "Outlook", "outlook"], ["gm", "Gmail", "gmail"]].map(([pid, nm, tab]) => h("button", { class: "btn", title: "Lit la boîte " + nm + " web déjà connectée dans Nova (session ouverte, sans mot de passe)", onclick: async () => {
      const t = await webText(pid); if (!t) { ctx.toast("Ouvre d'abord l'onglet " + nm + " (il charge la boîte), puis réessaie."); ctx.go(tab); return; }
      if (!/bo[iî]te de r[ée]ception|inbox|non lus|unread/i.test(t) && /pick an account|sign in|se connecter|choisir un compte|mot de passe|password/i.test(t)) { ctx.toast(nm + " affiche encore la page de connexion : choisis ton compte dans l'onglet " + nm + ", puis réessaie."); ctx.go(tab); return; }
      ctx.go("chat"); ctx.A.send("Voici le contenu de ma boîte " + nm + " (web). Résume les messages non lus par urgence, dis ce qui demande une action, et prépare un brouillon de réponse pour le plus urgent (sans l'envoyer, avec l'outil draft_reply).\n\n" + t.slice(0, 5500), {}); } }, "Trier " + nm + " (web)")))), st.box, dr);
  autoRefresh(ctx, () => load(true), 300000); drl(); await load();
} };
/* Échéance d'une tâche : conservée en tête du champ « body » (le serveur ne stocke pas de champ dédié). */
const DUE_RX = /^échéance:(\d{4}-\d{2}-\d{2})\n?/;
const dueOf = (x) => { const m = DUE_RX.exec(x.body || ""); return m ? m[1] : ""; };
const bodyWith = (x, due) => (due ? "échéance:" + due + "\n" : "") + String(x.body || "").replace(DUE_RX, "");
const todayISO = () => { const n = new Date(); return n.getFullYear() + "-" + pad2(n.getMonth() + 1) + "-" + pad2(n.getDate()); };
const taches = { id: "taches", title: "Tâches", desc: "Les tiennes + Rappels macOS", icon: "check", async render(el, ctx) {
  let tasks = [], filt = "todo", sort = "due", q = "", seq = 0, rq = "", rlines = [];
  const inp = h("input", { class: "inp", placeholder: "Nouvelle tâche…", "aria-label": "Nouvelle tâche", style: "flex:1;min-width:140px" }), due = h("input", { type: "date", class: "inp", "aria-label": "Échéance (facultative)" });
  const lst = stateBox(""), rem = stateBox("card md"); const count = h("span", { class: "muted", role: "status" }), stampR = h("span", { class: "muted" });
  const save = async (x) => { try { const r = await api.post("/api/notes/save", x); if (!r || !r.item) throw new Error((r && r.error) || "réponse invalide"); return r.item; } catch (e) { ctx.toast("Enregistrement impossible : " + e.message); return null; } };
  const draw = () => {
    const nq = norm(q), n = todayISO(); let t = tasks.filter((x) => (filt === "all" || (filt === "done") === !!x.done) && (!nq || norm(x.title).includes(nq)));
    t = t.slice().sort((a, b) => sort === "az" ? a.title.localeCompare(b.title, "fr") : sort === "recent" ? String(b.updated || "").localeCompare(String(a.updated || "")) : (!!a.done - !!b.done) || (dueOf(a) || "9999").localeCompare(dueOf(b) || "9999"));
    count.textContent = tasks.filter((x) => !x.done).length + " à faire · " + tasks.filter((x) => x.done).length + " faites";
    lst.set(...(t.length ? t.map(row) : [h("div", { class: "muted" }, tasks.length ? "Aucune tâche ne correspond au filtre." : "Aucune tâche. Ajoute-en une ci-dessus.")]));
    function row(x) { const d = dueOf(x), late = d && !x.done && d < n;
      const title = h("span", { style: "flex:1;" + (x.done ? "text-decoration:line-through;color:var(--txt3)" : ""), tabindex: 0, role: "button", title: "Modifier", "aria-label": "Modifier la tâche : " + x.title, onclick: () => edit(x, title), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); edit(x, title); } } }, x.title);
      const del = h("button", { class: "btn sm", "aria-label": "Retirer la tâche : " + x.title, onclick: async () => { if (!del.dataset.sure) { del.dataset.sure = "1"; del.textContent = "Confirmer ?"; setTimeout(() => { if (del.isConnected) { delete del.dataset.sure; del.textContent = "Retirer"; } }, 3000); return; }
        try { await api.post("/api/notes/remove", { id: x.id }); tasks = tasks.filter((y) => y.id !== x.id); draw(); } catch (e) { ctx.toast("Suppression impossible : " + e.message); } } }, "Retirer");
      const dd = h("input", { type: "date", class: "inp", value: d, "aria-label": "Échéance de : " + x.title, style: "width:140px" + (late ? ";border-color:#ff4d5e" : ""), onchange: async (e) => { const it = await save({ ...x, body: bodyWith(x, e.target.value) }); if (it) { Object.assign(x, it); draw(); } } });
      const cb = h("input", { type: "checkbox", checked: x.done, "aria-label": "Terminer : " + x.title, onchange: async (e) => { const it = await save({ ...x, done: e.target.checked }); if (it) Object.assign(x, it); else e.target.checked = !e.target.checked; draw(); } });
      return h("div", { class: "row", style: "padding:7px 0;border-top:1px solid var(--line)" }, cb, title, late ? h("span", { class: "chip bad" }, "en retard") : null, dd, del); }
  };
  const edit = (x, span) => { const i = h("input", { class: "inp", value: x.title, "aria-label": "Titre de la tâche", style: "flex:1" }); span.replaceWith(i); i.focus(); i.select(); let done = false;
    const fin = async (ok) => { if (done) return; done = true; const v = i.value.trim(); if (ok && v && v !== x.title) { const it = await save({ ...x, title: v }); if (it) Object.assign(x, it); } draw(); };
    i.onkeydown = (e) => { if (e.key === "Enter") fin(true); else if (e.key === "Escape") fin(false); }; i.onblur = () => fin(true); };
  const load = async () => { const my = ++seq; if (!tasks.length) lst.loading("Lecture des tâches…");
    try { const { items } = await api.get("/api/notes"); if (my !== seq) return; tasks = items.filter((x) => x.kind === "task"); draw(); } catch (e) { if (my === seq) lst.error("Tâches illisibles : " + e.message, load); } };
  const add = async () => { const v = inp.value.trim(); if (!v) { ctx.toast("Écris d'abord la tâche."); inp.focus(); return; } const it = await save({ title: v, kind: "task", done: false, body: due.value ? "échéance:" + due.value : "" }); if (it) { inp.value = ""; due.value = ""; tasks.unshift(it); draw(); inp.focus(); } };
  inp.onkeydown = (e) => { if (e.key === "Enter") add(); };
  const sel = (label, opts, v, f) => h("select", { class: "inp", "aria-label": label, onchange: (e) => f(e.target.value) }, ...opts.map(([k, l]) => h("option", { value: k, selected: k === v }, l)));
  const drawR = () => { const nq = norm(rq), l = rlines.filter((x) => !nq || norm(x).includes(nq));
    rem.set(h("div", { class: "row" }, h("h2", { style: "margin:0" }, "Rappels (Reminders.app)"), h("span", { class: "spacer" }), stampR, h("button", { class: "btn sm", onclick: loadR }, "Actualiser")),
      searchBox("Filtrer les rappels", "Filtrer les rappels…", (v) => { rq = v; drawR(); }), l.length ? h("ul", {}, ...l.map((x) => h("li", {}, x))) : h("div", { class: "muted" }, rlines.length ? "Aucun rappel ne correspond." : "Aucun rappel en attente.")); };
  const loadR = async () => { if (!rlines.length) rem.loading("Lecture des rappels…"); const r = await readTool("reminders", "", 60000);
    if (!r.ok) { rem.error(r.text.slice(0, 300), loadR, "Autorise Nova à contrôler Rappels : Réglages Système › Confidentialité › Automatisation."); return; }
    rlines = r.text.split("\n").slice(1).map((x) => x.trim()).filter(Boolean); stampR.textContent = stampText(); drawR(); };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Tâches & rappels")), h("div", { class: "grid g2" }, h("div", { class: "card" }, h("h2", {}, "Mes tâches"), h("div", { class: "row" }, inp, due, h("button", { class: "btn primary", onclick: add }, "Ajouter")),
    h("div", { class: "row", style: "margin:8px 0" }, searchBox("Chercher une tâche", "Chercher…", (v) => { q = v; draw(); }), sel("Afficher", [["todo", "À faire"], ["done", "Faites"], ["all", "Toutes"]], filt, (v) => { filt = v; draw(); }), sel("Trier par", [["due", "Tri : échéance"], ["recent", "Tri : récentes"], ["az", "Tri : A → Z"]], sort, (v) => { sort = v; draw(); })), count, lst.box), rem.box));
  autoRefresh(ctx, () => { if (!document.querySelector(".row input:focus")) load(); }, 60000);
  load(); loadR();
} };
const sw = (on, label, onToggle) => { const s = h("span", { class: "switch" + (on ? " on" : ""), role: "switch", tabindex: 0, "aria-checked": !!on, "aria-label": label });
  const tg = async () => { const v = !s.classList.contains("on"); s.classList.toggle("on", v); s.setAttribute("aria-checked", v); const ok = await onToggle(v); if (ok === false) { s.classList.toggle("on", !v); s.setAttribute("aria-checked", !v); } };
  s.onclick = tg; s.onkeydown = (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); tg(); } }; return s; };
const briefs = { id: "briefs", title: "Briefs", desc: "Automatiques, avec sources", icon: "brief", async render(el, ctx) {
  const s = ctx.st.settings; let items = [], q = "", last = null;
  const st = stateBox(""), stamp = h("span", { class: "muted", role: "status" }, "");
  const put = async (patch, okMsg) => { try { const r = await api.post("/api/settings", patch); if (r && r.error) throw new Error(r.error); ctx.refresh(); ctx.toast(okMsg || "Enregistré"); return true; } catch (e) { ctx.toast("Enregistrement impossible : " + e.message); return false; } };
  const F = (k, label, num) => { const i = h("input", { value: s[k] ?? "", "aria-label": label }); i.onchange = () => put({ [k]: num ? parseFloat(i.value) : i.value }); return h("label", {}, h("div", { class: "muted" }, label), i); };
  const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const gen = async (b, btn) => { btn.disabled = true; btn.textContent = "Génération…"; try { const r = await api.post("/api/briefs/run", { kind: b.kind }); if (r && r.error) throw new Error(r.error); await ctx.refresh(); ctx.go("briefs"); } catch (e) { btn.disabled = false; btn.textContent = "Réessayer"; ctx.toast("Génération impossible : " + e.message); } };
  const sched = h("div", { class: "card" }, h("h2", {}, "Planification"), ...s.briefs.map((b) => h("div", { class: "row", style: "margin:7px 0" },
    sw(b.enabled, "Activer : " + b.label, async (v) => { const old = b.enabled; b.enabled = v; const ok = await put({ briefs: s.briefs }); if (!ok) b.enabled = old; return ok; }),
    h("input", { value: b.time, style: "width:84px", placeholder: "HH:MM", maxlength: 5, "aria-label": "Heure : " + b.label, onchange: async (e) => { const v = e.target.value.trim(); if (!TIME.test(v)) { ctx.toast("Heure invalide : format HH:MM (ex. 07:30)."); e.target.value = b.time; return; } const old = b.time; b.time = v.padStart(5, "0"); e.target.value = b.time; if (!(await put({ briefs: s.briefs }))) { b.time = old; e.target.value = old; } } }), h("span", {}, b.label), h("span", { class: "spacer" }),
    h("button", { class: "btn sm", onclick: (e) => gen(b, e.currentTarget) }, "Générer maintenant"))),
    h("div", { class: "muted", style: "margin-top:8px" }, "Les briefs partent à l'heure dite et se rattrapent jusqu'à 10 h après si le Mac dormait. Notification macOS hors heures calmes. Chaque brief liste ses sources, y compris celles qui ont échoué."),
    h("div", { class: "grid g2", style: "margin-top:10px" }, F("city", "Ville (météo)"), F("quiet_from", "Heures calmes — début"), F("quiet_to", "Heures calmes — fin"),
      h("label", { class: "row" }, sw(s.notify, "Notification macOS", async (v) => put({ notify: v })), "Notification macOS")));
  const draw = () => { const nq = norm(q), l = items.filter((b) => !nq || norm(b.title + " " + b.text).includes(nq));
    st.set(...(l.length ? l.map((b) => h("div", { class: "card" }, h("div", { class: "row" }, h("h2", { style: "margin:0" }, b.title), h("span", { class: "muted" }, new Date(b.ts).toLocaleString("fr-FR")), h("span", { class: "spacer" }),
      b.rattrapage ? h("span", { class: "chip" }, "rattrapage") : null, h("span", { class: "chip" }, "via " + b.brain), h("button", { class: "btn sm", onclick: () => ctx.A.send("Lis-moi ce brief et ajoute ce que tu en penses :\n\n" + b.text, { voice: true }) }, "Lire à voix haute"),
      b.kind && s.briefs.some((x) => x.kind === b.kind) ? h("button", { class: "btn sm", title: "Régénère un brief de ce type avec les données actuelles", onclick: (e) => gen(b, e.currentTarget) }, "Relancer") : null),
      h("div", { class: "md", html: md(b.text), style: "margin-top:8px" }), h("div", { class: "row", style: "margin-top:8px" }, ...b.sources.map((x) => h("span", { class: "chip " + (x.ok ? "good" : "bad"), title: x.ok ? "ok" : x.detail }, (x.ok ? "✓ " : "✗ ") + x.name))))) :
      [h("div", { class: "card muted" }, items.length ? "Aucun brief ne correspond à « " + q + " »." : "Aucun brief pour l'instant. Clique « Générer maintenant » : tu verras exactement quelles sources ont répondu.")])); };
  const load = async () => { st.loading("Lecture des briefs…"); try { items = (await api.get("/api/briefs")).items; last = new Date(); stamp.textContent = stampText(last); draw();
    for (const b of items) if (!b.read) api.post("/api/briefs/read", { id: b.id }); if (items.some((b) => !b.read)) setTimeout(ctx.refresh, 800); } catch (e) { st.error("Briefs illisibles : " + e.message, load); } };
  el.append(sched, h("div", { class: "row", style: "margin:8px 0" }, searchBox("Filtrer les briefs", "Filtrer les briefs…", (v) => { q = v; draw(); }), h("button", { class: "btn", onclick: load }, "Actualiser"), stamp), st.box);
  autoRefresh(ctx, () => { if (!st.box.querySelector("input:focus")) api.get("/api/briefs").then((r) => { if (JSON.stringify(r.items.map((b) => b.id)) !== JSON.stringify(items.map((b) => b.id))) { items = r.items; draw(); } stamp.textContent = stampText(); }).catch(() => {}); }, 120000);
  await load();
} };
const ambassade = { id: "ambassade", title: "Ambassade", desc: "Nova te représente : un texte à ton ton", icon: "send", async render(el, ctx) {
  const F = (label, node) => h("label", { class: "field" }, h("span", { class: "muted" }, label), node);
  const who = h("input", { placeholder: "Pour qui ? (ex. un collègue, une équipe, un partenaire)" });
  const what = h("textarea", { rows: 5, placeholder: "Ce que tu veux dire, en vrac : faits, dates, demande, ce qu'il ne faut pas oublier…" });
  const chan = h("select", {}, ...[["email", "E-mail"], ["teams", "Message Teams"], ["whatsapp", "WhatsApp / SMS"], ["note", "Note à laisser"]].map(([v, l]) => h("option", { value: v }, l)));
  const tone = h("select", {}, ...[["posé et professionnel", "Posé, professionnel"], ["chaleureux", "Chaleureux"], ["bref et direct", "Bref et direct"], ["ferme mais courtois", "Ferme mais courtois"]].map(([v, l]) => h("option", { value: v }, l)));
  const lang = h("select", {}, ...[["français", "Français"], ["anglais", "Anglais"]].map(([v, l]) => h("option", { value: v }, l)));
  const go = () => {
    if (!what.value.trim()) { ctx.toast("Dis d'abord ce que tu veux faire passer."); return; }
    const teams = chan.value === "teams" ? " Mise en forme Teams : salutation, une phrase de contexte, points clés en liste, action demandée en gras, formule de clôture." : "";
    const p = "Ambassade : écris un message " + (chan.value === "email" ? "e-mail (avec objet)" : chan.value === "teams" ? "Teams" : chan.value === "whatsapp" ? "WhatsApp" : "court") + " en " + lang.value + ", à mon ton (" + tone.value + "), pour " + (who.value.trim() || "la personne concernée") + ", qui n'est pas là. Ce que je veux faire passer :\n" + what.value.trim() + "\n\nRègles : tu ne l'envoies pas ; tu me le présentes prêt à relire, et tu le sauvegardes comme brouillon. Ne mets aucune information que je ne t'ai pas donnée." + teams;
    ctx.go("chat"); setTimeout(() => ctx.A.send(p, {}), 60);
  };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Ambassade"), h("div", { class: "muted" }, "Nova te représente auprès de quelqu'un qui n'est pas là : elle rédige à ton ton. Rien ne part d'ici : tu relis, tu copies, tu envoies toi-même.")),
    h("div", { class: "card grid" }, F("Pour qui", who), h("div", { class: "grid g3" }, F("Canal", chan), F("Ton", tone), F("Langue", lang)), F("Ce que tu veux dire", what), h("div", { class: "row" }, h("button", { class: "btn primary", onclick: go }, "Rédiger à mon ton"))));
} };
const monmac = { id: "monmac", title: "Mon Mac", desc: "Notes, contacts, fichiers, raccourcis", icon: "search", async render(el, ctx) {
  const st = stateBox("card md"); st.empty("Choisis une source, ou cherche un mot."); let lastRun = null, seq = 0;
  const q = h("input", { class: "inp", placeholder: "Mot, nom ou fichier à chercher…", "aria-label": "Mot, nom ou fichier à chercher", style: "flex:1;min-width:200px" });
  const stamp = h("span", { class: "muted", role: "status" }, "");
  const run = async (name, arg, label, needsQ) => { if (needsQ && !arg.trim()) { ctx.toast("Tape d'abord un mot à chercher."); q.focus(); return; } lastRun = () => run(name, arg, label, needsQ); const my = ++seq; st.loading(label + "…");
    const r = await readTool(name, arg, 90000); if (my !== seq) return; stamp.textContent = label + " · " + stampText();
    if (!r.ok) { st.error(r.text.slice(0, 400), lastRun, "Si besoin : Réglages Système › Confidentialité › Automatisation › Nova."); return; }
    if (!r.text.trim()) { st.empty("Aucun résultat."); return; }
    st.set(h("pre", { style: "white-space:pre-wrap;margin:0" }, r.text)); };
  const b = (t, f) => h("button", { class: "btn", onclick: f }, t);
  q.onkeydown = (e) => { if (e.key === "Enter") run("find", q.value, "Recherche", true); };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Mon Mac"), h("div", { class: "muted" }, "Lecture seule, en direct. Rien n'est modifié ni envoyé."),
    h("div", { class: "row" }, q, b("Fichiers (Spotlight)", () => run("find", q.value, "Recherche", true)), b("Notes", () => run("notes", q.value, "Lecture des Notes")), b("Contacts", () => run("contacts", q.value, "Recherche du contact")))),
    h("div", { class: "row" }, b("Presse-papiers", () => run("clipboard", "", "Lecture")), b("Ma journée", () => run("today", "", "Lecture")), b("Mobile money", () => run("momo", "list", "Lecture")), b("Raccourcis Apple", () => run("shortcut", "list", "Lecture")), b("Écrans et fenêtres", () => run("ui", "windows", "Lecture")), b("Mémoire & disque", () => run("system", "", "Lecture")), stamp), st.box);
} };
export const temps = [agenda, courrier, monmac, ambassade, taches, briefs];
