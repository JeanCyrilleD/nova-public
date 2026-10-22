import { api, esc, md, h, safeUrl } from "../core.js";

/* ── Utilitaires locaux : stockage tolérant, accessibilité clavier, export, états ── */
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const act = (n, fn, label) => { n.setAttribute("role", "button"); n.tabIndex = 0; if (label) n.setAttribute("aria-label", label); n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(e); } }); n.addEventListener("click", fn); return n; };
const csvCell = (c) => { let s = String(c ?? ""); if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s.replace(",", ".")))) s = "'" + s; return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
const dl = (name, text, type = "text/plain") => { const u = URL.createObjectURL(new Blob(["﻿" + text], { type: type + ";charset=utf-8" })); const a = h("a", { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); };
const today = () => new Date().toISOString().slice(0, 10);
const errBox = (msg, retry) => h("div", { class: "card err", role: "alert" }, msg, retry ? [" ", h("button", { class: "btn sm", onclick: retry }, "Réessayer")] : null);
const loadBox = (t = "Chargement…") => h("div", { class: "card muted", role: "status" }, t);
const rid = () => { const a = new Uint8Array(4); try { crypto.getRandomValues(a); } catch { for (let i = 0; i < 4; i++) a[i] = Math.floor(Math.random() * 256); } return [...a].map((x) => x.toString(16).padStart(2, "0")).join(""); };
const TAG = /(^|[\s(])#([\p{L}\d_-]{2,30})/gu;
const tagsOf = (n) => { const s = new Set(); for (const m of ((n.title || "") + "\n" + (n.body || "")).matchAll(TAG)) s.add(m[2].toLowerCase()); return [...s]; };
const fmtD = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };

const notes = { id: "notes", title: "Notes", desc: "Écrire, retrouver, interroger", icon: "note", async render(el, ctx) {
  const holder = h("div"); el.append(holder); holder.append(loadBox("Chargement des notes…"));
  let items; const fetchAll = async () => { const r = await api.get("/api/notes"); return (r.items || []).filter((x) => x.kind !== "task"); };
  try { items = await fetchAll(); } catch (e) { holder.replaceChildren(errBox("Notes illisibles : " + (e && e.message || e), () => ctx.go(ctx.tab))); return; }
  const byDate = () => items.sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")));
  byDate(); let cur = items[0] || null, q = "", tag = "", dirty = false, timer = null;
  const list = h("div", { role: "list", "aria-label": "Liste des notes" }), tagBar = h("div", { class: "row", style: "flex-wrap:wrap;gap:4px" });
  const ti = h("input", { placeholder: "Titre", "aria-label": "Titre de la note" }), bo = h("textarea", { rows: 16, placeholder: "Écris ici… Ajoute des étiquettes avec #mot (enregistrement automatique)", "aria-label": "Contenu de la note" });
  const st = h("span", { class: "muted", role: "status", "aria-live": "polite" }, ""), tagsOfCur = h("div", { class: "row", style: "flex-wrap:wrap;gap:4px" });
  const search = h("input", { type: "search", placeholder: "Rechercher dans les notes…", "aria-label": "Rechercher dans les notes", style: "width:100%;margin-bottom:8px" });
  const visible = () => { const s = q.trim().toLowerCase(); return items.filter((n) => (!s || ((n.title || "") + " " + (n.body || "")).toLowerCase().includes(s)) && (!tag || tagsOf(n).includes(tag))); };
  const paint = () => { const v = visible();
    list.replaceChildren(...(v.length ? v.map((n) => { const on = cur && cur.id === n.id; const row = act(h("div", { class: "it" + (on ? " on" : ""), role: "listitem", "aria-current": on ? "true" : null, style: "padding:8px 10px;border-radius:10px;cursor:pointer" }, h("div", {}, n.title || "(sans titre)"), h("div", { class: "muted", style: "font-size:11px" }, fmtD(n.updated) + (tagsOf(n).length ? " · " + tagsOf(n).map((t) => "#" + t).join(" ") : ""))), () => switchTo(n), "Ouvrir la note " + (n.title || "sans titre")); return row; })
      : [h("div", { class: "muted", style: "padding:8px" }, items.length ? "Aucune note ne correspond." : "Aucune note. Crée la première avec « + Nouvelle note ».")]));
    const all = new Map(); items.forEach((n) => tagsOf(n).forEach((t) => all.set(t, (all.get(t) || 0) + 1)));
    tagBar.replaceChildren(...[...all].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t, c]) => h("button", { class: "btn sm" + (tag === t ? " primary" : ""), "aria-pressed": tag === t ? "true" : "false", onclick: () => { tag = tag === t ? "" : t; paint(); } }, "#" + t + " " + c)));
    tagsOfCur.replaceChildren(...(cur ? tagsOf({ title: ti.value, body: bo.value }) : []).map((t) => h("span", { class: "chip" }, "#" + t)));
  };
  const fill = () => { ti.value = cur ? cur.title : ""; bo.value = cur ? cur.body : ""; ti.disabled = bo.disabled = !cur; st.textContent = ""; paint(); };
  const flush = async () => { clearTimeout(timer); if (!dirty || !cur) return true; const n = cur, snap = { title: ti.value, body: bo.value };
    if (!snap.title.trim() && !snap.body.trim()) { dirty = false; return true; }   // note vide : rien à enregistrer
    st.textContent = "Enregistrement…";
    try { const r = await api.post("/api/notes/save", { id: n.id, title: snap.title, body: snap.body, kind: "note" }); if (!r || !r.item) throw new Error("réponse inattendue");
      Object.assign(n, r.item); if (!items.includes(n)) items.unshift(n); dirty = (ti.value !== snap.title || bo.value !== snap.body) && cur === n; byDate(); st.textContent = "Enregistré à " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); paint(); return true;
    } catch (e) { st.replaceChildren(h("span", { class: "err" }, "Échec de l'enregistrement : " + (e && e.message || e) + " "), h("button", { class: "btn sm", onclick: flush }, "Réessayer")); return false; } };
  const switchTo = async (n) => { if (!(await flush())) return; cur = n; dirty = false; fill(); };
  const edit = () => { dirty = true; st.textContent = "Modifications non enregistrées…"; clearTimeout(timer); timer = setTimeout(flush, 600); paint(); };
  ti.oninput = edit; bo.oninput = edit;
  ctx.onLeave && ctx.onLeave(() => { flush(); });
  search.oninput = () => { q = search.value; paint(); };
  const newNote = async () => { if (!(await flush())) return; cur = { id: rid(), title: "", body: "", updated: new Date().toISOString() }; dirty = false; fill(); ti.focus(); };
  const mdOf = (n) => "# " + (n.title || "Sans titre") + "\n\n_" + (n.updated || "") + "_\n\n" + (n.body || "") + "\n";
  const remove = async () => { if (!cur) return; if (!confirm("Supprimer la note « " + (cur.title || "sans titre") + " » ? Cette action est définitive.")) return; clearTimeout(timer); dirty = false; const n = cur;
    try { if (items.includes(n)) await api.post("/api/notes/remove", { id: n.id }); items = items.filter((x) => x.id !== n.id); cur = items[0] || null; fill(); ctx.toast("Note supprimée"); } catch (e) { st.replaceChildren(h("span", { class: "err" }, "Suppression impossible : " + (e && e.message || e))); } };
  holder.replaceChildren(h("div", { class: "hero card" }, h("h1", {}, "Notes"), h("div", { class: "muted" }, "Stockées sur ton Mac, jamais envoyées sans ton ordre. Étiquettes : écris #mot dans le titre ou le texte.")), h("div", { class: "grid", style: "grid-template-columns:260px 1fr;align-items:start" },
    h("div", { class: "card" }, h("button", { class: "btn sm", style: "width:100%;margin-bottom:8px", onclick: newNote }, "+ Nouvelle note"), search, tagBar, list,
      h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn sm", disabled: !items.length, onclick: () => dl("nova-notes-" + today() + ".md", items.map(mdOf).join("\n---\n\n")) }, "Tout exporter (.md)"), h("button", { class: "btn sm", onclick: () => dl("nova-notes-" + today() + ".json", JSON.stringify(items, null, 2), "application/json") }, "JSON"))),
    h("div", { class: "card grid" }, ti, tagsOfCur, bo, st, h("div", { class: "row" }, h("button", { class: "btn", onclick: () => { if (!cur) return; ctx.go("chat"); ctx.A.send("Voici ma note « " + ti.value + " ». Résume-la et propose les prochaines actions :\n\n" + bo.value, {}); } }, "Demander à Nova"),
      h("button", { class: "btn", onclick: () => { if (cur) dl(((cur.title || "note").replace(/[^\w\-À-ÿ ]+/g, "_").slice(0, 50)) + ".md", mdOf({ ...cur, title: ti.value, body: bo.value })); } }, "Exporter (.md)"),
      h("button", { class: "btn", onclick: remove }, "Supprimer")))));
  fill();
} };

const journal = { id: "journal", title: "Journal", desc: "Ce que Nova a vraiment fait", icon: "journal", async render(el, ctx) {
  const body = h("div"); const q = h("input", { type: "search", placeholder: "Rechercher (IA, erreur, date 2026-10-15…)", "aria-label": "Rechercher dans le journal", style: "flex:1;min-width:220px" });
  const only = h("select", { "aria-label": "Filtrer par résultat", style: "width:auto" }, h("option", { value: "" }, "Tout"), h("option", { value: "ko" }, "Échecs seulement"), h("option", { value: "ok" }, "Réussites seulement"));
  let J = null; const T = (e) => String(e.ts || e.t || "").replace("T", " ").slice(0, 19);
  const norm = (e, kind) => ({ ts: T(e), who: e.brain || e.moteur || e.engine || "", ok: e.ok !== false, evt: e.event || e.evt || e.type || "", detail: String(e.error || e.err || e.detail || e.reason || "").slice(0, 140), ms: e.ms || "", kind });
  const rowsOf = (arr, kind) => (arr || []).map((e) => norm(e, kind)).reverse();
  const filt = (rows) => { const s = q.value.trim().toLowerCase(); return rows.filter((r) => (!only.value || (only.value === "ok") === r.ok) && (!s || (r.ts + " " + r.who + " " + r.evt + " " + r.detail).toLowerCase().includes(s))); };
  const tbl = (rows, title) => h("div", { class: "card" }, h("h2", {}, title + " (" + rows.length + ")"), rows.length ? h("div", { style: "overflow:auto;max-height:55vh", tabindex: "0", role: "region", "aria-label": "Journal " + title }, h("table", {}, h("thead", {}, h("tr", {}, ...["Quand", "Qui", "Résultat", "Détail", "Durée"].map((c) => h("th", { scope: "col" }, c)))), h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", { class: "muted" }, r.ts), h("td", {}, r.who), h("td", {}, (r.ok ? "ok" : "échec") + (r.evt ? " · " + r.evt : "")), h("td", { class: "muted" }, r.detail), h("td", { class: "muted" }, r.ms ? r.ms + " ms" : "")))))) : h("div", { class: "muted" }, J && (J.cerveaux.length + J.voix.length) ? "Aucune entrée ne correspond aux filtres." : "Aucun appel pour l'instant."));
  const paint = () => { if (!J) return; body.replaceChildren(tbl(filt(rowsOf(J.cerveaux, "Cerveaux")), "Cerveaux"), tbl(filt(rowsOf(J.voix, "Voix")), "Voix")); };
  const load = async () => { body.replaceChildren(loadBox("Lecture du journal…")); try { J = await api.get("/api/journal"); J.cerveaux = J.cerveaux || []; J.voix = J.voix || []; paint(); } catch (e) { body.replaceChildren(errBox("Journal illisible : " + (e && e.message || e), load)); } };
  q.oninput = paint; only.onchange = paint;
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Journal de vérité"), h("div", { class: "muted" }, "Chaque appel aux IA et à la voix est consigné ici, daté, sans aucune clé. C'est la preuve de ce qui a marché ou échoué."),
    h("div", { class: "row", style: "margin-top:8px" }, q, only, h("button", { class: "btn", onclick: load }, "Actualiser"), h("button", { class: "btn", onclick: () => { if (!J) return; dl("nova-journal-" + today() + ".csv", toCsv([["Type", "Quand", "Qui", "Résultat", "Événement", "Détail", "Durée ms"], ...[...filt(rowsOf(J.cerveaux, "Cerveaux")), ...filt(rowsOf(J.voix, "Voix"))].map((r) => [r.kind, r.ts, r.who, r.ok ? "ok" : "échec", r.evt, r.detail, r.ms])]), "text/csv"); } }, "Exporter CSV"))), body);
  load();
} };

const fichiers = { id: "fichiers", title: "Fichiers", desc: "Lire un fichier de ton dossier", icon: "file", async render(el, ctx) {
  const p = h("input", { placeholder: "~/Documents/mon-fichier.txt", "aria-label": "Chemin du fichier", style: "flex:1;min-width:240px" });
  const q = h("input", { type: "search", placeholder: "Rechercher dans mes documents indexés (mots du contenu)…", "aria-label": "Rechercher dans mes documents", style: "flex:1;min-width:240px" });
  const out = h("div", { class: "card md", "aria-live": "polite" }, h("span", { class: "muted" }, "Nova lit uniquement dans ton dossier personnel et refuse les emplacements sensibles (clés, trousseau, mots de passe). Choisis un fichier ci-dessous, cherche dans tes documents, ou saisis un chemin."));
  const hits = h("div", { class: "grid" }), rec = h("div", { class: "row", style: "flex-wrap:wrap" }), brow = h("div", { class: "card", style: "display:none" }); let last = ""; const recents = lsGet("nova_files_recent", []);
  const paintRec = () => rec.replaceChildren(...(recents.length ? [h("span", { class: "muted" }, "Récents :"), ...recents.slice(0, 6).map((f) => h("button", { class: "btn sm", title: f, onclick: () => { p.value = f; go(); } }, f.split("/").pop())), h("button", { class: "btn sm", onclick: () => { recents.length = 0; lsSet("nova_files_recent", recents); paintRec(); } }, "Effacer")] : []));
  const go = async () => { const path = p.value.trim(); if (!path) { out.replaceChildren(h("span", { class: "muted" }, "Indique un chemin de fichier.")); return; } out.replaceChildren(h("span", { class: "muted", role: "status" }, "Lecture…"));
    try { const r = await api.post("/api/tool", { name: "read_file", arg: path }); last = String(r.output ?? r.error ?? "");
      const i = recents.indexOf(path); if (i >= 0) recents.splice(i, 1); recents.unshift(path); recents.length = Math.min(recents.length, 10); lsSet("nova_files_recent", recents); paintRec();
      out.replaceChildren(h("div", { class: "row" }, h("b", {}, path.split("/").pop()), h("span", { class: "muted" }, last.length + " caractères · aperçu texte"), h("span", { class: "spacer" }), h("button", { class: "btn sm", onclick: () => { try { navigator.clipboard.writeText(path); ctx.toast("Chemin copié"); } catch { ctx.toast("Copie impossible"); } } }, "Copier le chemin")), h("pre", { style: "white-space:pre-wrap;max-height:50vh;overflow:auto", tabindex: "0" }, last));
    } catch (e) { last = ""; out.replaceChildren(h("div", { class: "err", role: "alert" }, "Lecture impossible : " + (e && e.message || e))); } };
  const search = async () => { const s = q.value.trim(); if (!s) { hits.replaceChildren(); return; } hits.replaceChildren(loadBox("Recherche…"));
    try { const r = await api.get("/api/knowledge/search?q=" + encodeURIComponent(s)); const it = r.items || [];
      hits.replaceChildren(...(it.length ? it.map((x) => act(h("div", { class: "card tile" }, h("b", {}, x.file || x.path), h("div", { class: "muted" }, x.path), h("div", { style: "white-space:pre-wrap;font-size:12.5px;margin-top:4px" }, String(x.text || "").slice(0, 220))), () => { p.value = x.path; go(); out.scrollIntoView({ behavior: "smooth" }); }, "Ouvrir " + (x.file || x.path))) : [h("div", { class: "card muted" }, "Aucun document ne correspond. L'index couvre les dossiers configurés dans Savoir & réglages.")]));
    } catch (e) { hits.replaceChildren(errBox("Recherche indisponible : " + (e && e.message || e), search)); } };
  const browse = async (dir) => { brow.style.display = ""; brow.replaceChildren(loadBox("Chargement du dossier…"));
    try { const r = await api.get("/api/ls?path=" + encodeURIComponent(dir)); if (r.error) { brow.replaceChildren(h("div", { class: "err", role: "alert" }, r.error)); return; }
      brow.replaceChildren(h("div", { class: "row" }, h("button", { class: "btn sm", onclick: () => browse(r.path.split("/").slice(0, -1).join("/") || "~") }, "↑ Parent"), h("span", { class: "muted" }, r.path + " · " + r.items.length + " élément(s)")), ...(r.items.length ? r.items.map((i) => act(h("div", { class: "row", style: "padding:5px 0;border-top:1px solid var(--line);cursor:pointer" }, h("span", { style: "flex:1" }, (i.dir ? "📁 " : "") + i.name), h("span", { class: "muted" }, i.dir ? "" : Math.round(i.size / 1024) + " Ko")), () => (i.dir ? browse(r.path + "/" + i.name) : (p.value = r.path + "/" + i.name, go())), (i.dir ? "Ouvrir le dossier " : "Lire ") + i.name)) : [h("div", { class: "muted" }, "Dossier vide.")]));
    } catch (e) { brow.replaceChildren(errBox("Dossier illisible : " + (e && e.message || e), () => browse(dir))); } };
  p.onkeydown = (e) => { if (e.key === "Enter") go(); }; q.onkeydown = (e) => { if (e.key === "Enter") search(); };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Fichiers"), h("div", { class: "row" }, p, h("button", { class: "btn primary", onclick: go }, "Lire"), h("button", { class: "btn", onclick: () => browse(p.value.trim().split("/").slice(0, -1).join("/") || "~/Documents") }, "Parcourir"), h("button", { class: "btn", onclick: () => { if (last) { ctx.go("chat"); ctx.A.send("Résume ce fichier (" + p.value + ") :\n\n" + last.slice(0, 6000), {}); } else ctx.toast("Lis d'abord un fichier"); } }, "Résumer avec Nova")), h("div", { class: "row", style: "margin-top:8px" }, q, h("button", { class: "btn", onclick: search }, "Rechercher")), rec), hits, brow, out);
  paintRec();
} };

const veille = { id: "veille", title: "Veille", desc: "Flux d'actualité réels", icon: "feed", async render(el, ctx) {
  const getFeeds = () => ((ctx.st.settings && ctx.st.settings.feeds) || []).slice(); let readSet = new Set(lsGet("nova_veille_read", []));
  const saveRead = () => lsSet("nova_veille_read", [...readSet].slice(-1500));
  const box = h("div", { class: "grid g2" }), flist = h("div", { class: "grid" }), stat = h("span", { class: "muted", role: "status", "aria-live": "polite" });
  const q = h("input", { type: "search", placeholder: "Filtrer les titres…", "aria-label": "Filtrer les articles", style: "min-width:180px" }), unreadOnly = h("input", { type: "checkbox", id: "vl-unread", "aria-label": "Non lus seulement" }), srcSel = h("select", { "aria-label": "Source", style: "width:auto" });
  const nu = h("input", { type: "url", placeholder: "https://exemple.com/rss.xml", "aria-label": "Adresse d'un flux RSS à ajouter", style: "flex:1;min-width:240px" }), addMsg = h("div", { class: "muted", role: "status" });
  let R = null, errs = [];
  const persist = async (arr) => { await api.post("/api/settings", { feeds: arr }); if (ctx.st.settings) ctx.st.settings.feeds = arr; };
  const add = async () => { const v = nu.value.trim(); let u; try { u = new URL(v); } catch {} if (!u || !/^https?:$/.test(u.protocol)) { addMsg.className = "err"; addMsg.textContent = "Adresse invalide : saisis une URL http(s) complète."; return; }
    const cur = getFeeds(); if (cur.includes(u.href) || cur.includes(v)) { addMsg.className = "err"; addMsg.textContent = "Ce flux est déjà dans la liste."; return; }
    try { await persist([...cur, u.href]); nu.value = ""; addMsg.className = "muted"; addMsg.textContent = "Flux ajouté."; load(); } catch (e) { addMsg.className = "err"; addMsg.textContent = "Ajout impossible : " + (e && e.message || e); } };
  const del = async (f) => { if (!confirm("Retirer ce flux ?\n" + f)) return; try { await persist(getFeeds().filter((x) => x !== f)); load(); } catch (e) { addMsg.className = "err"; addMsg.textContent = "Suppression impossible : " + (e && e.message || e); } };
  const paintFeeds = () => { const fs = getFeeds(); const bad = (f) => errs.find((e) => String(e).startsWith(f));
    flist.replaceChildren(...(fs.length ? fs.map((f) => { const b = bad(f); return h("div", { class: "row", style: "padding:4px 0;border-top:1px solid var(--line)" }, h("span", { class: "chip " + (R ? (b ? "bad" : "good") : "") }, R ? (b ? "erreur" : "ok") : "…"), h("span", { style: "flex:1;word-break:break-all" }, f, b ? h("div", { class: "err", role: "alert" }, "Illisible : " + String(b).slice(f.length).trim() + " — vérifie l'adresse ou réessaie") : null), h("button", { class: "btn sm", "aria-label": "Retirer le flux " + f, onclick: () => del(f) }, "Retirer")); }) : [h("div", { class: "muted" }, "Aucun flux. Ajoute l'adresse d'un flux RSS ci-dessus.")])); };
  const paintItems = () => { if (!R) return; const s = q.value.trim().toLowerCase(), src = srcSel.value; const all = R.items || [];
    const v = all.filter((a) => (!src || a.source === src) && (!unreadOnly.checked || !readSet.has(a.link)) && (!s || (a.title || "").toLowerCase().includes(s)));
    const unread = all.filter((a) => !readSet.has(a.link)).length; stat.textContent = all.length + " article(s) · " + unread + " non lu(s)";
    box.replaceChildren(...(v.length ? v.slice(0, 60).map((a) => { const rd = readSet.has(a.link);
      return h("div", { class: "card tile", style: rd ? "opacity:.6" : "" }, h("a", { href: safeUrl(a.link), target: "_blank", rel: "noopener noreferrer", style: "text-decoration:none;color:var(--txt)", onclick: () => { readSet.add(a.link); saveRead(); paintItems(); } }, h("b", {}, (rd ? "" : "● ") + (a.title || "(sans titre)"))), h("div", { class: "muted" }, (a.source || "") + " · " + (a.date || "")), h("button", { class: "btn sm", "aria-pressed": rd ? "true" : "false", onclick: () => { rd ? readSet.delete(a.link) : readSet.add(a.link); saveRead(); paintItems(); } }, rd ? "Marquer non lu" : "Marquer lu")); })
      : [h("div", { class: "card muted" }, all.length ? "Aucun article ne correspond aux filtres." : "Aucun article.")])); };
  const load = async () => { box.replaceChildren(loadBox("Lecture des flux…")); paintFeeds();
    if (!getFeeds().length) { R = { items: [], errors: [] }; errs = []; box.replaceChildren(h("div", { class: "card muted" }, "Aucun flux configuré : ajoute un flux RSS dans « Mes flux ».")); stat.textContent = ""; paintFeeds(); return; }
    try { R = await api.get("/api/feed"); errs = R.errors || []; const cur = srcSel.value; srcSel.replaceChildren(h("option", { value: "" }, "Toutes les sources"), ...[...new Set((R.items || []).map((a) => a.source))].map((s) => h("option", { value: s }, s))); srcSel.value = cur;
      paintFeeds(); paintItems(); if (errs.length) box.prepend(h("div", { class: "card banner", role: "alert", style: "grid-column:1/-1" }, errs.length + " flux en erreur : " + errs.join(" ; ")));
    } catch (e) { R = null; box.replaceChildren(errBox("Flux injoignables : " + (e && e.message || e), load)); } };
  q.oninput = paintItems; unreadOnly.onchange = paintItems; srcSel.onchange = paintItems; nu.onkeydown = (e) => { if (e.key === "Enter") add(); };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Veille"), h("div", { class: "row" }, h("button", { class: "btn primary", onclick: () => { ctx.go("chat"); ctx.A.send("Fais-moi une veille : analyse les titres d'actualité de mes flux (utilise la recherche web pour les points importants) et dis-moi ce qui compte.", {}); } }, "Synthèse par Nova"), h("button", { class: "btn", onclick: load }, "Actualiser les flux"),
    h("button", { class: "btn", onclick: () => { (R && R.items || []).forEach((a) => readSet.add(a.link)); saveRead(); paintItems(); } }, "Tout marquer comme lu"), stat),
    h("div", { class: "row", style: "margin-top:8px" }, q, srcSel, h("label", { for: "vl-unread", class: "row", style: "gap:4px" }, unreadOnly, "Non lus"))),
    box, h("div", { class: "card grid" }, h("h2", {}, "Mes flux (RSS)"), h("div", { class: "row" }, nu, h("button", { class: "btn primary", onclick: add }, "Ajouter")), addMsg, flist));
  load();
} };

const temoin = { id: "temoin", title: "Témoin", desc: "Ce que tu as réellement fait", icon: "eye", async render(el, ctx) {
  const per = h("input", { placeholder: "Période : 2026-10-15, 2026-10… (vide = tout)", "aria-label": "Période", style: "flex:1" }), body = h("div"); let lines = [], fails = [];
  const load = async () => {
    body.replaceChildren(loadBox("Lecture…"));
    try { const [a, j] = await Promise.all([api.get("/api/actions"), api.get("/api/journal")]); const q = per.value.trim();
      const T = (e) => String(e.ts || e.t || ""); const ok = (e) => !q || T(e).startsWith(q);
      lines = (a.items || []).filter(ok).map((e) => T(e).replace("T", " ").slice(0, 16) + " · " + (e.actor || "Nova") + " · " + e.tool + (e.why ? " — " + e.why : "") + (e.ok === false ? " ✗" : ""));
      fails = [...(a.items || []).filter((e) => e.ok === false), ...(j.cerveaux || []).filter((e) => e.ok === false), ...(j.voix || []).filter((e) => e.ok === false)].filter(ok);
      body.replaceChildren(
        h("div", { class: "card" }, h("h2", {}, lines.length + " action(s) réelle(s)"), lines.length ? h("ul", { style: "margin:8px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px" }, ...lines.slice(0, 80).map((l) => h("li", {}, l))) : h("div", { class: "muted" }, "Rien sur cette période.")),
        fails.length ? h("div", { class: "card" }, h("h2", {}, "Manquements (" + fails.length + ")"), h("ul", { style: "margin:8px 0 0;padding-left:18px" }, ...fails.slice(0, 40).map((e) => h("li", {}, h("span", { class: "muted" }, String(e.ts || e.t || "").slice(0, 16) + " "), (e.brain || e.tool || e.engine || "") + " — " + String(e.err || e.error || e.result || e.kind || "échec").slice(0, 140))))) : h("span"));
    } catch (e) { body.replaceChildren(errBox("Lecture impossible : " + (e && e.message || e), load)); }
  };
  per.onkeydown = (e) => { if (e.key === "Enter") load(); };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Témoin"), h("div", { class: "muted" }, "Le biographe silencieux : les lignes réelles du journal d'actions et les échecs, sur une période. La synthèse rédigée est facultative."),
    h("div", { class: "row", style: "margin-top:10px" }, per, h("button", { class: "btn", onclick: load }, "Relire"), h("button", { class: "btn", onclick: () => { if (lines.length) dl("nova-temoin-" + today() + ".txt", lines.join("\n")); else ctx.toast("Rien à exporter"); } }, "Exporter (.txt)"), h("button", { class: "btn primary", onclick: () => { ctx.go("chat"); ctx.A.send("Témoin : voici ce qui a réellement été fait" + (per.value ? " sur " + per.value : "") + ". Rédige une synthèse honnête (fait, appris, laissé en suspens, manquements), sans rien inventer :\n\n" + lines.slice(0, 60).join("\n") + (fails.length ? "\n\nÉchecs :\n" + fails.slice(0, 20).map((e) => (e.brain || e.tool || "") + " " + (e.err || e.error || e.result || "")).join("\n") : ""), {}); } }, "Rédiger la synthèse"))), body);
  load();
} };

const serendipite = { id: "serendipite", title: "Sérendipité", desc: "Collisions entre tes contenus", icon: "spark", async render(el, ctx) {
  const body = h("div", { class: "grid" });
  const compute = async () => { body.replaceChildren(loadBox("Calcul des collisions…"));
    try { const items = (await api.get("/api/notes")).items || []; const mem = await api.get("/api/memory").catch(() => ({})); const facts = (mem.items || mem.facts || []).map((f, i) => ({ id: "m" + i, kind: "fait", title: String(f.text || f).slice(0, 90), body: String(f.text || f) }));
      const all = [...items.map((n) => ({ ...n, kind: n.kind === "task" ? "tâche" : "note" })), ...facts];
      const words = (x) => new Set(((x.title || "") + " " + (x.body || "")).toLowerCase().match(/[a-zà-ÿ]{6,}/g) || []); const W = all.map(words); const df = {}; W.forEach((s) => s.forEach((w) => { df[w] = (df[w] || 0) + 1; }));
      const out = []; for (let i = 0; i < all.length; i++) for (let k = i + 1; k < all.length; k++) { if (all[i].kind === all[k].kind) continue; for (const w of W[i]) if (W[k].has(w) && df[w] === 2) { out.push([w, all[i], all[k]]); break; } }
      const side = (x) => h("div", { class: "muted" }, "[" + x.kind + "] ", h("b", {}, x.title || "(sans titre)"));
      body.replaceChildren(...(out.length ? out.slice(0, 30).map(([w, a, b]) => h("div", { class: "card" }, h("div", { class: "row" }, h("span", { class: "pill" }, "mot partagé"), h("b", {}, w)), side(a), side(b))) : [h("div", { class: "card muted" }, "Aucune collision pour l'instant : il faut au moins deux sortes de contenus (une note et une tâche ou un fait) qui partagent un mot rare.")]));
    } catch (e) { body.replaceChildren(errBox("Calcul impossible : " + (e && e.message || e), compute)); } };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Sérendipité"), h("div", { class: "muted" }, "Deux contenus de natures différentes qui partagent un mot rare : une collision qui peut valoir une idée. Calculé sur ton Mac, sans modèle."), h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn", onclick: compute }, "Recalculer"))), body);
  compute();
} };
export const savoir = [notes, journal, temoin, serendipite, fichiers, veille];
