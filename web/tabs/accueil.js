import { api, esc, md, h } from "../core.js";
import { ic } from "../icons.js";
import { vaultOpen } from "./vie.js";
import { readTool, parseEvents, nextEvent, stampText, hhmm, autoRefresh } from "./temps.js";

const gauge = (pct, label, sub, color) => { const p = Math.max(0, Math.min(100, pct ?? 0)), r = 34, c = 2 * Math.PI * r;
  return h("div", { class: "gauge", style: "text-align:center" }, h("div", { html: `<svg width="92" height="92" viewBox="0 0 92 92"><circle cx="46" cy="46" r="${r}" fill="none" stroke="var(--surface3)" stroke-width="8"/><circle cx="46" cy="46" r="${r}" fill="none" stroke="${color || "var(--accent)"}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c}" transform="rotate(-90 46 46)" style="filter:drop-shadow(0 0 5px ${color || "var(--accent)"});transition:stroke-dasharray .8s"/><text x="46" y="52" text-anchor="middle" fill="var(--txt)" font-size="19" font-weight="700" font-family="var(--display)">${pct == null ? "—" : Math.round(p) + "%"}</text></svg>` }), h("div", { style: "font-weight:600;font-size:13px" }, label), h("div", { class: "muted" }, sub || "")); };
const fmtB = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + " Go" : Math.round(b / 1e6) + " Mo");
const dur = (s) => { const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return (d ? d + " j " : "") + hh + " h " + m + " min"; };

async function macPanel(box, ctx, full) {
  const s = await api.get("/api/system"); const cpu = s.cpu ? 100 - s.cpu.idle : null; const memPct = s.mem_used && s.machine ? s.mem_used / s.machine.mem_total * 100 : null;
  const col = (v, warn = 70, bad = 90) => (v == null ? "var(--txt3)" : v >= bad ? "#ff4d5e" : v >= warn ? "#ffb020" : "#3ddc97");
  const kids = [gauge(cpu, "Processeur", s.cpu ? s.cpu.user.toFixed(0) + "% usr · " + s.cpu.sys.toFixed(0) + "% sys" : "non mesuré", col(cpu)), gauge(memPct, "Mémoire", s.mem_used && s.machine ? fmtB(s.mem_used) + " / " + fmtB(s.machine.mem_total) : "", col(memPct)),
    gauge(s.disk ? s.disk.pct : null, "Disque", s.disk ? fmtB(s.disk.used) + " / " + fmtB(s.disk.total) : "", col(s.disk ? s.disk.pct : null, 80, 92)),
    gauge(s.gpu ? s.gpu.util : null, "GPU", s.gpu ? "utilisation" : "non exposé", col(s.gpu ? s.gpu.util : null)),
    gauge(s.battery ? s.battery.pct : null, "Batterie", s.battery ? s.battery.source + " · " + s.battery.state + (s.battery.remaining ? " · " + s.battery.remaining : "") : "pas de batterie", s.battery ? (s.battery.pct < 20 && s.battery.source === "batterie" ? "#ff4d5e" : "#3ddc97") : "var(--txt3)")];
  box.replaceChildren(h("div", { class: "row", style: "justify-content:space-around" }, ...kids));
  if (full) { box.append(h("div", { class: "grid g2", style: "margin-top:14px" }, h("div", { class: "card" }, h("h3", {}, "Machine"), h("div", { class: "muted", style: "white-space:pre-line" }, (s.machine ? s.machine.cpu + " · " + s.machine.cores + " cœurs · charge " + s.machine.load : "") + "\nÉtat thermique : " + s.thermal + (s.uptime_s ? "\nAllumé depuis " + dur(s.uptime_s) : ""))),
    h("div", { class: "card" }, h("h3", {}, "Processus les plus gourmands"), s.procs.length ? h("table", {}, h("tbody", {}, ...s.procs.map((p) => h("tr", {}, h("td", {}, p.name), h("td", { class: "muted" }, p.cpu.toFixed(1) + " % CPU"), h("td", { class: "muted" }, p.mem.toFixed(1) + " % mém."))))) : h("div", { class: "muted" }, "Non mesuré sur cette plateforme.")))); }
  return s;
}
const mac = { id: "mac", title: "État du Mac", desc: "Batterie, CPU, GPU, mémoire", icon: "system", async render(el, ctx) {
  const box = h("div", { class: "card", "aria-live": "polite" }, h("div", { class: "muted", role: "status" }, "Mesure en cours…")); let alive = true, paused = false, timer = null, fails = 0; ctx.onLeave(() => { alive = false; clearTimeout(timer); });
  const stamp = h("span", { class: "muted", role: "status" }, ""); const pbtn = h("button", { class: "btn", "aria-pressed": "false", onclick: () => { paused = !paused; pbtn.setAttribute("aria-pressed", paused); pbtn.textContent = paused ? "Reprendre l'actualisation" : "Mettre en pause"; if (!paused) tick(); } }, "Mettre en pause");
  el.append(h("div", { class: "hero card" }, h("h1", {}, "État du Mac"), h("div", { class: "muted" }, "Mesures réelles (pmset, top, vm_stat, ioreg), rafraîchies toutes les 5 s. Une mesure impossible est marquée « non mesuré », jamais inventée."),
    h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn primary", onclick: () => { ctx.go("chat"); ctx.A.send("Comment va mon Mac ? Utilise ses mesures réelles et dis-moi s'il y a un problème.", {}); } }, "Demander à Nova"), h("button", { class: "btn", onclick: () => tick(true) }, "Actualiser"), pbtn, stamp)), box);
  const tick = async (manual) => { if (!alive) return; clearTimeout(timer);
    if (!manual && (paused || document.hidden)) { timer = setTimeout(tick, 5000); return; }
    try { await macPanel(box, ctx, true); fails = 0; stamp.textContent = stampText(); } catch (e) { fails++; box.replaceChildren(h("div", { class: "banner", role: "alert" }, "Mesure impossible : " + e.message), h("button", { class: "btn", onclick: () => tick(true) }, "Réessayer")); }
    if (alive) timer = setTimeout(tick, Math.min(60000, 5000 * (1 + fails * 2))); }; tick(true);
} };

const amendements = { id: "amendements", title: "Charte & amendements", desc: "Philosophies et 47 idées → Nova", icon: "shield", async render(el, ctx) {
  const body = h("div", { class: "card md", "aria-live": "polite" }, h("span", { class: "muted", role: "status" }, "Chargement…")); let q = "", text = "";
  const draw = () => { if (!q.trim()) { body.innerHTML = md(text); return; } const nq = q.toLowerCase(), parts = text.split(/\n{2,}/).filter((x) => x.toLowerCase().includes(nq));
    if (parts.length) body.innerHTML = md(parts.join("\n\n")); else body.replaceChildren(h("span", { class: "muted" }, "Aucun passage ne contient « " + q + " ».")); };
  const get = async (f) => { const r = await fetch("docs/" + f); if (!r.ok) throw new Error(f + " → " + r.status); return r.text(); };
  const load = async () => { body.replaceChildren(h("span", { class: "muted", role: "status" }, "Chargement…"));
    try { text = (await get("INVENTAIRE_47_NOVA.md")) + "\n\n---\n\n" + (await get("AMENDEMENTS_ET_COMPARTIMENTS.md")); draw(); } catch (e) { body.replaceChildren(h("div", { class: "banner", role: "alert" }, "Document introuvable : " + e.message), h("button", { class: "btn", onclick: load }, "Réessayer")); } };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Charte & amendements"), h("div", { class: "muted" }, "Les philosophies et le Programme 47 idées (INVENTAIRE_47) retrouvés dans tes dossiers, avec leur traduction dans Nova et leur statut réel."),
    h("input", { type: "search", class: "inp", placeholder: "Chercher dans la charte…", "aria-label": "Chercher dans la charte et les amendements", style: "margin-top:8px", oninput: (e) => { q = e.target.value; if (text) draw(); } })), body);
  await load();
} };

const tile = (ctx, { to, title, icon, wide }, ...kids) => h("div", { class: "card tile", style: wide ? "grid-column:span 2" : "", role: "link", tabindex: 0, "aria-label": "Ouvrir : " + title, onclick: () => ctx.go(to), onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); ctx.go(to); } } }, h("div", { class: "row", style: "margin-bottom:6px" }, h("span", { html: ic(icon, 20), style: "color:var(--accent)" }), h("b", {}, title)), ...kids);
const accueil = { id: "accueil", title: "Accueil", desc: "Tout en un coup d'œil", icon: "orb", wide: true, async render(el, ctx) {
  const s = ctx.st, name = s.settings.user_title || s.settings.name || ""; const hr = new Date().getHours(); const hello = hr < 5 ? "Bonne nuit" : hr < 12 ? "Bonjour" : hr < 18 ? "Bon après-midi" : "Bonsoir";
  const stampEl = h("span", { class: "muted", role: "status" }, ""); const slot = (t) => h("div", { class: "muted" }, t);
  const cBrain = slot("…"), cMac = h("div", { class: "muted" }, "Mesure…"), cBrief = slot("…"), cAg = slot("Lecture de Calendar…"), cMail = slot("Lecture de Mail…"), cDots = slot("…"), cMem = slot("…"), cTask = slot("…"), cVeille = slot("…"), cFin = h("div", { class: "kpi", style: "filter:blur(7px) grayscale(1);user-select:none" }, "•••••••"), cSan = h("div", { class: "kpi", style: "filter:blur(7px) grayscale(1);user-select:none" }, "•••••••");
  const MODES = [["simple", "Simple", "Conversation seule : Nova répond, sans toucher à rien."], ["cowork", "Co-Work", "Nova agit avec toi : propose, prépare, demande avant le risqué."], ["total", "Contrôle total", "Nova pilote le Mac et les apps ; envoi de mails, paiements et mots de passe restent à toi."]];
  let mode = "cowork"; try { mode = localStorage.getItem("nova_mode") || "cowork"; } catch {}
  const modeHint = h("div", { class: "cp-hint" }, (MODES.find((m) => m[0] === mode) || MODES[1])[2]);
  const seg = h("div", { class: "cp-modes", role: "radiogroup", "aria-label": "Mode de Nova" }, ...MODES.map(([id, label, hint], i) => h("button", { class: "cp-mode" + (id === mode ? " on" : ""), role: "radio", "aria-checked": id === mode, title: hint, onclick: (e) => { mode = id; try { localStorage.setItem("nova_mode", id); } catch {} for (const b of seg.children) { const on = b === e.currentTarget; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); } modeHint.textContent = hint; ctx.toast("Mode " + label); } }, h("span", { class: "cp-n" }, i + 1), label)));
  const cmd = h("input", { class: "cp-input", placeholder: "Dis ou écris un ordre à Nova… (ex. lis mes mails non lus, ouvre Teams, prépare une réponse)", "aria-label": "Ordre à Nova" });
  const sendCmd = () => { const t = cmd.value.trim(); if (!t) return; cmd.value = ""; ctx.go("chat"); setTimeout(() => ctx.A.send(t, {}), 60); };
  cmd.onkeydown = (e) => { if (e.key === "Enter") sendCmd(); };
  const cockpit = h("div", { class: "card cockpit" },
    h("div", { class: "cp-top" }, h("div", { class: "cp-ttl" }, h("b", {}, "Cockpit"), h("span", { class: "muted" }, " · ton centre de commande")), seg),
    h("div", { class: "cp-bar" }, cmd, h("button", { class: "btn primary cp-go", title: "Envoyer", "aria-label": "Envoyer", onclick: sendCmd }, "↑")),
    modeHint);
  el.append(h("div", { class: "hero card herome" }, h("img", { class: "heroface", src: "assets/profile.jpg", alt: "" }), h("h1", {}, hello + (name ? ", " + name : "") + "."), h("div", { class: "muted" }, new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " · " + (s.quiet ? "heures calmes" : "Nova veille")),
    h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn primary", onclick: () => ctx.go("chat") }, "Parler à Nova"), h("button", { class: "btn", onclick: () => ctx.openPalette() }, "Palette ⌘K"), h("button", { class: "btn", onclick: () => refreshAll(true) }, "Actualiser"), stampEl)),
    cockpit,
    h("div", { class: "grid g3" },
      tile(ctx, { to: "routeur", title: "Cerveaux IA", icon: "brain" }, cBrain), tile(ctx, { to: "mac", title: "Mon Mac", icon: "system", wide: true }, cMac),
      tile(ctx, { to: "briefs", title: "Briefs", icon: "brief" }, cBrief), tile(ctx, { to: "agenda", title: "Agenda", icon: "calendar" }, cAg), tile(ctx, { to: "courrier", title: "Courrier", icon: "mail" }, cMail),
      tile(ctx, { to: "dots", title: "Dots (agents)", icon: "dot" }, cDots), tile(ctx, { to: "memoire", title: "Mémoire", icon: "know" }, cMem), tile(ctx, { to: "taches", title: "Tâches", icon: "check" }, cTask),
      tile(ctx, { to: "veille", title: "Veille", icon: "feed", wide: true }, cVeille),
      tile(ctx, { to: "finances", title: "Finances", icon: "keys" }, cFin, h("div", { class: "muted" }, "Grisé — code requis")), tile(ctx, { to: "sante", title: "Santé", icon: "pulse" }, cSan, h("div", { class: "muted" }, "Grisé — code requis")),
      tile(ctx, { to: "whatsapp", title: "Messageries", icon: "chat" }, h("div", { class: "row" }, h("span", { class: "chip" }, "WhatsApp"), h("span", { class: "chip" }, "Telegram"), h("span", { class: "chip" }, "Facebook"))),
      tile(ctx, { to: "radio", title: "Médias", icon: "mic" }, h("div", { class: "muted" }, ctx.player.playing ? "▶ " + ctx.player.title : "Radio · podcasts · relaxation")),
      tile(ctx, { to: "navigateur", title: "Navigateur", icon: "search" }, h("div", { class: "muted" }, "Web intégré, lu par l'IA"))));
  if (vaultOpen()) { cFin.style.filter = ""; cFin.textContent = "déverrouillé"; cSan.style.filter = ""; cSan.textContent = "déverrouillé"; }
  const fail = (c, msg, retry) => c.replaceChildren(h("span", { class: "muted" }, msg + " "), h("button", { class: "btn sm", onclick: (e) => { e.stopPropagation(); retry(); } }, "Réessayer"));
  const lines = (c, ...l) => c.replaceChildren(...l.flatMap((x, i) => (i ? [h("br"), x] : [x])));
  const sub = (t) => h("span", { class: "muted" }, t);
  const L = {
    brain: async () => { const st = ctx.st || s; const okB = st.brains.filter((b) => b.etat === "ok"), av = st.brains.filter((b) => !["sans_cle", "absent", "desactive"].includes(b.etat));
      lines(cBrain, h("span", {}, h("span", { class: "kpi" }, String(av.length)), " prêts · " + okB.length + " testés OK"), sub(okB.length ? "dernier OK : " + okB[0].label : "lance un test dans Routeur & santé")); },
    brief: () => api.get("/api/briefs").then(({ items }) => { if (!items.length) { cBrief.textContent = "Aucun brief. Génère le premier."; return; } lines(cBrief, h("b", {}, items[0].title), sub(new Date(items[0].ts).toLocaleString("fr-FR") + " · " + ctx.unread + " non lu(s)")); }).catch(() => fail(cBrief, "Briefs illisibles.", L.brief)),
    dots: () => api.get("/api/dots").then(({ items, runs }) => lines(cDots, h("span", {}, items.length + " agents · " + runs.length + " exécution(s)"), sub(runs[0] ? "dernière : " + runs[0].dot + (runs[0].ok ? " ✓" : " ✗") : "aucune exécution"))).catch(() => fail(cDots, "Dots illisibles.", L.dots)),
    mem: () => api.get("/api/memory").then(({ items }) => cMem.replaceChildren(h("span", { class: "kpi" }, String(items.length)), " faits retenus")).catch(() => fail(cMem, "Mémoire illisible.", L.mem)),
    task: () => api.get("/api/notes").then(({ items }) => { const t = items.filter((x) => x.kind === "task"), open = t.filter((x) => !x.done);
      const today = new Date(), iso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
      const late = open.filter((x) => { const m = /^échéance:(\d{4}-\d{2}-\d{2})/.exec(x.body || ""); return m && m[1] < iso; }).length;
      cTask.replaceChildren(h("span", { class: "kpi" }, String(open.length)), " à faire · " + (t.length - open.length) + " faites", late ? h("span", { class: "chip bad", style: "margin-left:6px" }, late + " en retard") : null); }).catch(() => fail(cTask, "Tâches illisibles.", L.task)),
    veille: () => api.get("/api/feed").then((r) => cVeille.replaceChildren(...(r.items.length ? r.items.slice(0, 3).map((a) => h("div", { style: "margin:3px 0" }, "• " + a.title, h("span", { class: "muted" }, "  " + a.source))) : [h("span", { class: "muted" }, "Aucun flux lisible")]))).catch(() => fail(cVeille, "Veille illisible.", L.veille)),
    mac: () => macPanel(cMac, ctx, false).catch(() => fail(cMac, "Mesure indisponible.", L.mac)),
    ag: async () => { const r = await readTool("calendar", "", 60000), p = parseEvents(r.text);
      if (p.ev.length) { const now = new Date(), nx = nextEvent(p.ev), td = p.ev.filter((e) => e.d.toDateString() === now.toDateString());
        lines(cAg, nx ? h("span", {}, h("b", {}, hhmm(nx.d)), " " + nx.title.slice(0, 60)) : h("span", {}, "Plus rien de daté aujourd'hui"), sub(td.length + " événement(s) aujourd'hui · " + p.ev.length + " sur 7 jours")); return; }
      if (r.ok || /aucun événement/i.test(r.text)) { cAg.textContent = "Rien à l'agenda sur 7 jours."; return; }
      fail(cAg, r.text.slice(0, 90), L.ag); },
    mail: async () => { const r = await readTool("mail_unread", "", 90000), m = r.text.match(/NONLUS=(\d+)/);
      if (m) { const first = r.text.split("\n").find((l) => l.split(" | ").length >= 3); const f = first ? first.split(" | ") : null;
        lines(cMail, h("span", {}, h("span", { class: "kpi" }, m[1]), " non lu(s)"), sub(f ? (f[0] + " — " + f[1]).slice(0, 80) : "")); return; }
      if (r.ok) { cMail.textContent = r.text.split("\n").slice(0, 3).join(" · ").slice(0, 160); return; }
      fail(cMail, r.text.slice(0, 90), L.mail); },
  };
  const FAST = ["brain", "brief", "dots", "mem", "task", "veille", "mac"], SLOW = ["ag", "mail"];
  let busy = false;
  const refreshAll = async (manual) => { if (busy && !manual) return; busy = true; await Promise.allSettled(Object.keys(L).map((k) => L[k]())); busy = false; stampEl.textContent = stampText(); };
  const refreshFast = () => { for (const k of FAST) L[k](); stampEl.textContent = stampText(); };
  autoRefresh(ctx, refreshFast, 30000); autoRefresh(ctx, () => { for (const k of SLOW) L[k](); }, 300000);
  refreshAll(true);
} };
export const accueilGroup = [accueil, mac, amendements];
