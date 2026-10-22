// Nova V10.5 — « Âme de Nova » : les idées du Programme 47, vivantes. Chaque onglet lit des données réelles (conversations, mémoire,
// Dots, documents, Mac) et agit ; rien n'est envoyé, supprimé ou payé sans ton GO.
import { api, esc, md, h } from "../core.js";
import { UI } from "./agents.js";

const doc = {
  get: async (n) => (await api.get("/api/ame/doc?name=" + n)).data,
  async set(n, d) { const r = await api.post("/api/ame/doc", { name: n, data: d }); if (!r || r.error || r.ok === false) throw new Error((r && r.error) || "enregistrement refusé"); return r; },
};
/** Enregistre un document et le dit : jamais d'échec silencieux. */
const persist = async (n, d, okMsg) => { try { await doc.set(n, d); if (okMsg) UI.toast(okMsg); return true; } catch (e) { UI.toast("⚠ Non enregistré : " + e.message, 4500); return false; } };
const uid = () => Math.random().toString(36).slice(2, 10);
const copyText = async (t) => { try { await navigator.clipboard.writeText(t); UI.toast("Copié."); } catch { UI.toast("Copie impossible : sélectionne le texte à la main."); } };
const hhmm = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/* Derniers résultats « intelligents » : gardés sur ce Mac (5 par rubrique) pour ne rien perdre en changeant d'onglet. */
const TH = {
  get(k) { try { return JSON.parse(localStorage.getItem("nova_th_" + k) || "[]"); } catch { return []; } },
  push(k, e) { try { localStorage.setItem("nova_th_" + k, JSON.stringify([e, ...TH.get(k)].slice(0, 5))); } catch {} },
  clear(k) { try { localStorage.removeItem("nova_th_" + k); } catch {} },
};
/** Bouton « intelligence » : appelle /api/ame/llm ; résultat (markdown), erreur avec « Réessayer », copie, export, historique local. */
function think(kind, getInput, { label = "Lancer", primary = true, onResult, needsInput = false, inputHint = "Saisis d'abord le texte à traiter." } = {}) {
  const out = h("div", { class: "md", style: "margin-top:10px", "aria-live": "polite" }), tools = h("div", { class: "row", style: "margin-top:6px" }), histBox = h("div"); let last = null;
  const showTools = () => tools.replaceChildren(...(last ? [h("button", { class: "btn sm", type: "button", onclick: () => copyText(last.text) }, "Copier"), h("button", { class: "btn sm", type: "button", onclick: () => UI.download(kind + "-" + UI.stamp() + ".md", last.text, "text/markdown") }, "Télécharger (.md)"), last.ts ? h("span", { class: "muted" }, "généré le " + UI.fdate(last.ts)) : ""] : []));
  const render = (r) => { out.innerHTML = md(r.text || "") + (r.brain ? '<div class="muted" style="margin-top:8px">Cerveau : ' + esc(r.brain) + "</div>" : ""); last = r; showTools(); };
  const paintHist = () => { const hs = TH.get(kind).slice(1); histBox.replaceChildren(...(hs.length ? [h("details", { style: "margin-top:8px" }, h("summary", {}, "Résultats précédents (" + hs.length + ", sur ce Mac)"), ...hs.map((x) => h("div", { class: "card", style: "margin-top:6px" }, h("div", { class: "muted", style: "font-size:11px" }, UI.fdate(x.ts)), h("div", { class: "md", html: md(x.text || "") }))), h("button", { class: "btn sm", type: "button", onclick: () => { TH.clear(kind); paintHist(); } }, "Effacer l'historique"))] : [])); };
  const prev = TH.get(kind)[0]; if (prev) { render(prev); out.prepend(h("div", { class: "muted", style: "font-size:11px" }, "Dernier résultat conservé (relance pour le renouveler)")); } paintHist();
  const btn = h("button", { class: "btn" + (primary ? " primary" : ""), type: "button", onclick: async () => {
    const input = getInput ? getInput() : "";
    if (needsInput && !String(input).trim()) { out.replaceChildren(h("div", { class: "banner", role: "alert" }, inputHint)); return; }
    btn.disabled = true; tools.replaceChildren(); out.innerHTML = '<span class="muted">Nova réfléchit… (lecture de tes données réelles)</span>';
    let r;
    try { r = await Promise.race([api.post("/api/ame/llm", { kind, input }), new Promise((_, rej) => setTimeout(() => rej(new Error("délai dépassé (3 min)")), 180000))]); if (r.error) throw new Error(r.error); }
    catch (e) { out.replaceChildren(h("div", { class: "banner", role: "alert" }, "Échec : " + e.message), h("div", { class: "row", style: "margin-top:6px" }, h("button", { class: "btn sm primary", type: "button", onclick: () => btn.click() }, "↻ Réessayer"))); btn.disabled = false; return; }
    render({ text: r.text || "", brain: r.brain, ts: new Date().toISOString() }); TH.push(kind, { text: String(r.text || "").slice(0, 20000), brain: r.brain, ts: last.ts }); paintHist();
    if (onResult) { try { await onResult(r); } catch (e) { UI.toast("Résultat affiché mais non traité : " + e.message); } }
    btn.disabled = false; } }, label);
  return { btn, out: h("div", {}, out, tools, histBox) };
}
const hero = (t, d) => h("div", { class: "hero card" }, h("h1", {}, t), h("div", { class: "muted" }, d));
const bars = (vals, { labels = [], hi = -1, hgt = 70, name = "Histogramme" } = {}) => {
  const m = Math.max(1, ...vals);
  return h("div", { role: "img", "aria-label": name + " : " + vals.map((v, i) => (labels[i] ?? i) + " = " + v).join(", "), style: `display:flex;align-items:flex-end;gap:3px;height:${hgt + 18}px` }, ...vals.map((v, i) => h("div", { title: (labels[i] ?? i) + " : " + v, style: "flex:1;display:flex;flex-direction:column;align-items:center;gap:3px" },
    h("div", { style: `width:100%;height:${Math.max(2, (v / m) * hgt)}px;border-radius:5px 5px 2px 2px;background:${i === hi ? "var(--accent)" : "color-mix(in srgb,var(--accent) 38%,var(--surface3))"};box-shadow:${i === hi ? "0 0 14px var(--accent)" : "none"}` }),
    h("span", { class: "muted", style: "font-size:9px" }, labels[i] ?? ""))));
};
const chip = (t, kind) => h("span", { class: "pill", style: kind === "up" ? "border-color:#10b981;color:#10b981" : kind === "down" ? "border-color:#f59e0b;color:#f59e0b" : "" }, t);
const tools2 = (...n) => h("div", { class: "row" }, ...n);

/* 3 · 23 · 29 · 31 — Miroir, miroir moral, miroir des valeurs, contrat */
const miroir = { id: "miroir", title: "Miroir & contrat", desc: "Ce que tu fais vraiment · tes valeurs", icon: "avatar", async render(el, ctx) {
  let q = UI.takeHint(ctx, "miroir");
  return UI.page(el, ctx, async (box, reload) => {
    let vals = await doc.get("valeurs"); if (!Array.isArray(vals)) vals = [];
    let seeded = false; try { seeded = !!localStorage.getItem("nova_valeurs_seeded"); } catch {}
    if (!vals.length && !seeded) { vals = [
      { id: uid(), text: "Je n'envoie, ne supprime et ne paie rien sans mon GO explicite sur le contenu exact.", on: true },
      { id: uid(), text: "Aucun conseil d'investissement : des faits sourcés.", on: true },
      { id: uid(), text: "Mes messages Teams et mails suivent ma charte : salutation, contexte, points clés, action en gras, clôture.", on: true },
      { id: uid(), text: "Mes finances et ma santé restent dans le Coffre.", on: true }]; await persist("valeurs", vals); try { localStorage.setItem("nova_valeurs_seeded", "1"); } catch {} }
    const list = h("div", { class: "grid", role: "list", "aria-label": "Valeurs et règles" }), stat = h("span", { class: "muted", role: "status" });
    const save = async () => { stat.textContent = "Enregistrement…"; const ok = await persist("valeurs", vals); stat.textContent = ok ? "✓ Enregistré à " + hhmm() : "⚠ Non enregistré"; };
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= vals.length) return; [vals[i], vals[j]] = [vals[j], vals[i]]; save(); paint(); };
    function paint() {
      const nq = UI.norm(q), rows = vals.map((v, i) => ({ v, i })).filter((x) => !nq || UI.norm(x.v.text).includes(nq));
      list.replaceChildren(...(rows.length ? rows.map(({ v, i }) => { const t = h("input", { value: v.text, style: "flex:1", "aria-label": "Texte de la règle " + (i + 1), maxlength: "400" }); t.onchange = () => { if (!t.value.trim()) { t.value = v.text; return UI.toast("Une règle ne peut pas être vide : utilise ✕ pour la retirer."); } v.text = t.value.trim(); save(); };
        const c = h("input", { type: "checkbox", style: "width:auto", "aria-label": "Règle active : " + v.text.slice(0, 40) }); c.checked = v.on !== false; c.onchange = () => { v.on = c.checked; save(); };
        return h("div", { class: "row", role: "listitem", style: "gap:10px" }, c, t, h("button", { class: "btn sm", type: "button", "aria-label": "Monter", title: "Monter", disabled: i === 0, onclick: () => move(i, -1) }, "↑"), h("button", { class: "btn sm", type: "button", "aria-label": "Descendre", title: "Descendre", disabled: i === vals.length - 1, onclick: () => move(i, 1) }, "↓"),
          h("button", { class: "btn sm", type: "button", title: "Retirer", "aria-label": "Retirer : " + v.text.slice(0, 40), onclick: async () => { if (!await UI.confirm("Retirer cette règle du contrat ?", { title: "Retirer la règle", ok: "Retirer", danger: true, detail: v.text })) return; const k = vals.indexOf(v); vals.splice(k, 1); save(); paint(); UI.undoToast("Règle retirée.", async () => { vals.splice(Math.min(k, vals.length), 0, v); await save(); paint(); }); } }, "✕")); })
        : [UI.emptyCard(vals.length ? "Aucune règle ne correspond." : "Aucune règle. Ajoute ta première valeur ci-dessous.")]));
    }
    paint();
    const add = h("input", { placeholder: "Ajouter une valeur ou une règle de vie…", style: "flex:1", "aria-label": "Nouvelle règle", maxlength: "400" });
    const doAdd = () => { const t = add.value.trim(); if (!t) return add.focus(); if (vals.some((x) => UI.norm(x.text) === UI.norm(t))) return UI.toast("Cette règle existe déjà."); vals.push({ id: uid(), text: t, on: true }); add.value = ""; save(); paint(); };
    add.onkeydown = (e) => { if (e.key === "Enter") doAdd(); };
    const expo = () => UI.download("contrat-valeurs-" + UI.stamp() + ".json", { nova_valeurs: 1, exported: new Date().toISOString(), items: vals.map((v) => ({ text: v.text, on: v.on !== false })) });
    const impo = async () => { const d = await UI.pickJSON(); if (!d) return; const raw = Array.isArray(d) ? d : d.items; if (!Array.isArray(raw)) return UI.toast("Format non reconnu."); const have = new Set(vals.map((v) => UI.norm(v.text))), fresh = [];
      for (const x of raw.slice(0, 200)) { const t = String(typeof x === "string" ? x : x && x.text || "").trim().slice(0, 400); if (t && !have.has(UI.norm(t))) { have.add(UI.norm(t)); fresh.push({ id: uid(), text: t, on: !(x && x.on === false) }); } }
      if (!fresh.length) return UI.toast("Rien de nouveau."); if (!await UI.confirm("Ajouter " + fresh.length + " règle(s) au contrat ?", { title: "Importer des règles", ok: "Importer" })) return; vals.push(...fresh); save(); paint(); };
    const sb = UI.searchBar({ placeholder: "Filtrer les règles…", label: "Filtrer les règles", value: q, onInput: (v) => { q = v; paint(); } });
    const m = think("miroir", null, { label: "Me refléter (14 derniers jours)" });
    box.append(hero("Miroir & contrat", "Nova te montre ce que tu répètes, ce que tu repousses et où tes actes contredisent tes propres valeurs — d'après tes conversations, ta mémoire et les résultats des Dots. Il cite, il n'invente pas."),
      h("div", { class: "grid g2", style: "align-items:start" },
        h("div", { class: "card grid" }, h("h2", {}, "Mon contrat (valeurs & règles)"), h("div", { class: "muted" }, "Coche = actif. Chaque ligne active est vérifiée par le Miroir moral. Ces règles sont aussi des garde-fous pour Nova."), vals.length > 5 ? sb.el : "", list, h("div", { class: "row" }, add, h("button", { class: "btn", type: "button", onclick: doAdd }, "Ajouter")),
          h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: expo }, "Exporter (JSON)"), h("button", { class: "btn sm", type: "button", onclick: impo }, "Importer (JSON)"), stat)),
        h("div", { class: "card" }, h("h2", {}, "Le Miroir"), m.btn, m.out)));
  });
} };

/* 2 · 12 · 18 · 22 · 28 · 30 — Trajectoires, archéologue, sérendipité, chronobiologie */
const trajectoires = { id: "trajectoires", title: "Trajectoires", desc: "Ton rythme, tes sujets, ton évolution", icon: "pulse", async render(el, ctx) {
  return UI.page(el, ctx, async (box, reload) => {
    const s = await api.get("/api/ame/stats"), jours = s.jours || [], hrs = s.heures || [], pic = s.pic;
    const topics = (arr, key, kind) => (arr || []).length ? h("div", { class: "row", style: "flex-wrap:wrap;gap:6px" }, ...arr.map((x) => chip(x.mot + (key ? " ×" + x[key] : ""), kind))) : h("span", { class: "muted" }, "Pas encore assez de messages pour comparer.");
    const q = h("input", { placeholder: "Sujet à retracer (ex. : SBIF, charte, Bangkok…)", style: "flex:1", "aria-label": "Sujet à retracer" }); const arch = think("archeo", () => q.value, { label: "Retracer l'évolution", needsInput: true, inputHint: "Saisis d'abord un sujet à retracer." });
    q.onkeydown = (e) => { if (e.key === "Enter") arch.btn.click(); };
    const ser = think("serendipite", null, { label: "Surprends-moi", primary: false });
    const table = (title, labels, vals) => h("details", {}, h("summary", {}, title + " — voir les valeurs"), h("table", {}, h("tbody", {}, ...vals.map((v, i) => h("tr", {}, h("td", {}, String(labels[i] ?? i)), h("td", {}, String(v)))))));
    box.append(hero("Trajectoires", "Calculées sur tes vrais échanges avec Nova (" + (s.messages_60j ?? 0) + " messages sur 60 jours, " + (s.souvenirs ?? 0) + " souvenirs en mémoire). Aucune donnée n'est inventée : peu de messages = peu de courbe."),
      h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: reload }, "↻ Actualiser"), h("button", { class: "btn sm", type: "button", onclick: () => UI.download("trajectoires-" + UI.stamp() + ".json", s) }, "Exporter les chiffres (JSON)")),
      h("div", { class: "grid g2", style: "align-items:start" },
        h("div", { class: "card grid" }, h("h2", {}, "Ton rythme sur 14 jours"), jours.length ? bars(jours.map((d) => d.n), { labels: jours.map((d) => d.d.slice(8)), name: "Messages par jour" }) : UI.emptyCard("Pas encore de données."), jours.length ? table("Messages par jour", jours.map((d) => d.d), jours.map((d) => d.n)) : ""),
        h("div", { class: "card grid" }, h("h2", {}, "Chronobiologie : tes heures vives"), hrs.length ? bars(hrs, { labels: hrs.map((_, i) => i), hi: pic ? pic.debut : -1, name: "Messages par heure" }) : "",
          pic ? h("div", {}, "Créneau de travail profond suggéré : ", h("b", {}, pic.debut + "h – " + pic.fin + "h"), h("div", { class: "muted" }, "Déduit de l'heure de tes messages à Nova (pas de ton agenda). Réserve ce créneau pour ce qui demande de la concentration.")) : h("div", { class: "muted" }, "Pas encore de données."))),
      h("div", { class: "card grid" }, h("h2", {}, "Dérive de tes sujets (mots des 14 derniers jours comparés aux 14 précédents)"),
        h("div", {}, h("b", {}, "Qui montent "), topics(s.montent, "recent", "up")), h("div", {}, h("b", {}, "Constants "), topics(s.constants, "recent")), h("div", {}, h("b", {}, "Qui disparaissent (silence) "), topics(s.disparaissent, "avant", "down"))),
      h("div", { class: "grid g2", style: "align-items:start" },
        h("div", { class: "card grid" }, h("h2", {}, "Archéologue"), h("div", { class: "muted" }, "Cherche dans tes conversations, ta mémoire et tes documents, puis retrace comment ta pensée a évolué."), h("div", { class: "row" }, q, arch.btn), arch.out),
        h("div", { class: "card grid" }, h("h2", {}, "Sérendipité"), h("div", { class: "muted" }, "Relie au hasard des éléments réels de ta mémoire et de tes documents pour faire surgir une idée à tester."), ser.btn, ser.out)));
  });
} };

/* 10 · 16 · 17 · 32 — Gardien des relations, ambassadeur, deuil */
const relations = { id: "relations", title: "Relations", desc: "Ne perds personne de vue", icon: "talk", async render(el, ctx) {
  const S = { q: UI.takeHint(ctx, "relations"), sort: "relance" };
  return UI.page(el, ctx, async (box, reload) => {
    let rels = await doc.get("relations"); if (!Array.isArray(rels)) rels = [];
    const list = h("div", { class: "grid", role: "list", "aria-label": "Personnes suivies" }), cnt = h("span", { class: "muted", role: "status" }); const save = () => persist("relations", rels);
    const days = (r) => r.last ? Math.floor((Date.now() - new Date(r.last)) / 86400000) : null;
    const due = (r) => (r.deuil || !(r.cadence > 0)) ? null : new Date((r.last ? +new Date(r.last) : Date.now()) + r.cadence * 86400000);
    const isLate = (r) => { const d = days(r); return !r.deuil && r.cadence > 0 && (d === null || d > r.cadence); };
    const fday = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
    const score = (r) => r.deuil ? 1e9 : (due(r) ? +due(r) : 9e12);
    async function editRel(r) {
      const n = h("input", { value: r.name, "aria-label": "Nom", maxlength: "80" }), no = h("textarea", { rows: 3, "aria-label": "Notes", maxlength: "500" }, r.notes || ""), c = h("input", { type: "number", min: 0, max: 3650, value: r.cadence || 0, "aria-label": "Cadence en jours (0 = aucune relance)" }), l = h("input", { type: "date", value: r.last ? String(r.last).slice(0, 10) : "", "aria-label": "Dernier contact" });
      const v = await UI.dlg({ title: "Modifier " + r.name, body: [h("label", {}, "Nom", n), h("label", {}, "Notes", no), h("label", {}, "Relancer tous les (jours, 0 = jamais)", c), h("label", {}, "Dernier contact", l)],
        actions: [{ label: "Enregistrer", primary: true, value: () => ({ name: n.value.trim(), notes: no.value.trim(), cadence: Math.max(0, Math.min(3650, +c.value || 0)), last: l.value ? new Date(l.value + "T12:00:00").toISOString() : null }), validate: () => { if (!n.value.trim()) { n.focus(); return false; } if (rels.some((x) => x !== r && UI.norm(x.name) === UI.norm(n.value))) { UI.toast("Cette personne existe déjà."); return false; } } }] });
      if (!v) return; Object.assign(r, v); save(); paint();
    }
    function paint() {
      const nq = UI.norm(S.q); let v = rels.filter((r) => !nq || UI.norm(r.name + " " + (r.notes || "")).includes(nq));
      v = S.sort === "nom" ? v.slice().sort((a, b) => a.name.localeCompare(b.name, "fr")) : S.sort === "contact" ? v.slice().sort((a, b) => +new Date(a.last || 0) - +new Date(b.last || 0)) : v.slice().sort((a, b) => score(a) - score(b));
      cnt.textContent = v.length + " / " + rels.length + " personne(s) · " + rels.filter(isLate).length + " à relancer";
      list.replaceChildren(...(v.length ? v.map((r) => { const d = days(r), late = isLate(r), dd = due(r);
        const draft = think("relation", () => `Personne : ${r.name}. Notes : ${r.notes || "(aucune)"}. Dernier contact : ${r.last ? r.last.slice(0, 10) : "inconnu"}.`, { label: "Brouillon de message", primary: false });
        return h("div", { class: "card grid", role: "listitem", style: late ? "border-color:#f59e0b" : "" },
          h("div", { class: "row" }, h("b", {}, (r.deuil ? "🕊 " : "") + r.name), h("span", { class: "spacer" }), r.deuil ? chip("avec égard") : late ? chip(d === null ? "jamais contacté" : d + " j sans nouvelles", "down") : chip(d === null ? "—" : d + " j", "up"), r.cadence ? chip("tous les " + r.cadence + " j") : ""),
          r.notes ? h("div", { class: "muted" }, r.notes) : "", h("div", { class: "muted", style: "font-size:12px" }, "Dernier contact : " + (r.last ? fday(new Date(r.last)) : "jamais") + (dd ? " · prochaine relance : " + (late ? "maintenant" : fday(dd)) : "")),
          h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: () => { const prev = r.last; r.last = new Date().toISOString(); save(); paint(); UI.undoToast("Contact enregistré pour " + r.name + ".", async () => { r.last = prev; await save(); paint(); }); } }, "Contacté aujourd'hui ✓"), r.deuil ? "" : draft.btn,
            h("button", { class: "btn sm", type: "button", onclick: () => editRel(r) }, "Modifier"),
            h("button", { class: "btn sm", type: "button", title: "Garder son souvenir sans relance", onclick: () => { r.deuil = !r.deuil; save(); paint(); } }, r.deuil ? "Reprendre les relances" : "Honorer / ne plus relancer"),
            h("button", { class: "btn sm", type: "button", onclick: async () => { if (!await UI.confirm("Retirer " + r.name + " de la liste ?", { title: "Retirer cette personne", ok: "Retirer", danger: true })) return; const k = rels.indexOf(r); rels.splice(k, 1); save(); paint(); UI.undoToast(r.name + " retiré(e).", async () => { rels.splice(Math.min(k, rels.length), 0, r); await save(); paint(); }); } }, "Retirer")), draft.out); })
        : [UI.emptyCard(rels.length ? "Personne ne correspond." : "Personne pour l'instant. Ajoute les personnes qui comptent : Nova te prévient chaque jour dès 9 h si quelqu'un attend de tes nouvelles.")]));
    }
    paint();
    const n = h("input", { placeholder: "Nom", style: "flex:1", "aria-label": "Nom de la personne", maxlength: "80" }), c = h("input", { type: "number", value: 30, min: 0, max: 3650, style: "width:90px", title: "Cadence en jours (0 = aucune relance)", "aria-label": "Cadence en jours" }), no = h("input", { placeholder: "Notes (contexte, sujet)", style: "flex:2", "aria-label": "Notes", maxlength: "500" });
    const doAdd = () => { const name = n.value.trim(); if (!name) return n.focus(); if (rels.some((x) => UI.norm(x.name) === UI.norm(name))) return UI.toast("Cette personne existe déjà."); rels.push({ id: uid(), name, notes: no.value.trim(), cadence: Math.max(0, Math.min(3650, +c.value || 0)), last: new Date().toISOString() }); n.value = no.value = ""; save(); paint(); };
    n.onkeydown = (e) => { if (e.key === "Enter") doAdd(); };
    const sort = h("select", { "aria-label": "Trier", style: "width:auto", onchange: () => { S.sort = sort.value; paint(); } }, h("option", { value: "relance" }, "à relancer d'abord"), h("option", { value: "nom" }, "par nom"), h("option", { value: "contact" }, "contact le plus ancien"));
    const sb = UI.searchBar({ placeholder: "Rechercher une personne…", label: "Rechercher une personne", value: S.q, onInput: (v) => { S.q = v; paint(); }, extra: [sort, cnt] });
    const expo = () => UI.download("relations-" + UI.stamp() + ".json", { nova_relations: 1, exported: new Date().toISOString(), items: rels });
    const csv = () => UI.download("relations-" + UI.stamp() + ".csv", ["nom,notes,cadence_jours,dernier_contact,honorer"].concat(rels.map((r) => [r.name, r.notes, r.cadence, r.last, r.deuil ? "oui" : ""].map(UI.csvCell).join(","))).join("\n"), "text/csv");
    const impo = async () => { const d = await UI.pickJSON(); if (!d) return; const raw = Array.isArray(d) ? d : d.items; if (!Array.isArray(raw)) return UI.toast("Format non reconnu."); const have = new Set(rels.map((r) => UI.norm(r.name))), fresh = [];
      for (const x of raw.slice(0, 500)) { const name = String(x && x.name || "").trim().slice(0, 80); if (name && !have.has(UI.norm(name))) { have.add(UI.norm(name)); fresh.push({ id: uid(), name, notes: String(x.notes || "").slice(0, 500), cadence: Math.max(0, Math.min(3650, +x.cadence || 0)), last: x.last && !isNaN(new Date(x.last)) ? new Date(x.last).toISOString() : null, deuil: !!x.deuil }); } }
      if (!fresh.length) return UI.toast("Rien de nouveau."); if (!await UI.confirm("Ajouter " + fresh.length + " personne(s) ?", { title: "Importer des relations", ok: "Importer" })) return; rels.push(...fresh); save(); paint(); };
    box.append(hero("Relations", "Le Gardien te signale, une fois par jour dès 9 h et seulement si besoin, qui attend de tes nouvelles. L'Ambassadeur rédige un brouillon dans ta charte — il ne l'envoie jamais."),
      h("div", { class: "card row" }, n, no, c, h("span", { class: "muted" }, "jours"), h("button", { class: "btn primary", type: "button", onclick: doAdd }, "Ajouter")),
      sb.el, h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: expo }, "Exporter (JSON)"), h("button", { class: "btn sm", type: "button", onclick: csv }, "Exporter (CSV)"), h("button", { class: "btn sm", type: "button", onclick: impo }, "Importer (JSON)")), list);
  });
} };

/* 1 · 19 · F2 — Chef d'orchestre */
const orchestre = { id: "orchestre", title: "Chef d'orchestre", desc: "Un objectif → un plan → des agents", icon: "council", async render(el, ctx) {
  return UI.page(el, ctx, async (box, reload) => {
    let hist = await doc.get("plans"); if (!Array.isArray(hist)) hist = [];
    const goal = h("textarea", { rows: 3, "aria-label": "Objectif", maxlength: "2000", placeholder: "Ex. : prépare mon point de demain : agenda, mails non lus, actualité BRVM, et ce qui reste à faire." });
    const plan = h("div", { class: "grid" }), run = h("div", { class: "grid", "aria-live": "polite" }), histBox = h("div", { class: "grid" });
    let steps = [], poll = null, curId = null, curHist = null, idxMap = [], fails = 0;
    const MAX = 8, saveHist = () => persist("plans", hist.slice(0, 20));
    const paintPlan = () => {
      plan.replaceChildren(...steps.map((s, i) => { const t = h("input", { value: s.titre, style: "flex:1", "aria-label": "Titre de l'étape " + (i + 1) }); t.onchange = () => (s.titre = t.value); const ta = h("textarea", { rows: 2, "aria-label": "Consigne de l'étape " + (i + 1) }, s.task); ta.onchange = () => (s.task = ta.value);
        const mv = (d) => { const j = i + d; if (j < 0 || j >= steps.length) return; [steps[i], steps[j]] = [steps[j], steps[i]]; paintPlan(); };
        return h("div", { class: "card grid" }, h("div", { class: "row" }, h("b", {}, (i + 1) + "."), t, h("button", { class: "btn sm", type: "button", "aria-label": "Monter l'étape", disabled: i === 0, onclick: () => mv(-1) }, "↑"), h("button", { class: "btn sm", type: "button", "aria-label": "Descendre l'étape", disabled: i === steps.length - 1, onclick: () => mv(1) }, "↓"), h("button", { class: "btn sm", type: "button", "aria-label": "Supprimer l'étape " + (i + 1), onclick: () => { steps.splice(i, 1); paintPlan(); } }, "✕")), ta); }));
      if (steps.length) plan.append(h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: () => exec() }, "▶ Exécuter le plan"), h("button", { class: "btn", type: "button", disabled: steps.length >= MAX, onclick: () => { steps.push({ titre: "Nouvelle étape", task: "" }); paintPlan(); } }, "+ Ajouter une étape"), h("span", { class: "muted" }, "Lecture seule : aucun envoi, aucune suppression, aucun paiement. " + steps.length + "/" + MAX + " étapes.")));
    };
    const planBtn = h("button", { class: "btn primary", type: "button", onclick: async () => {
      if (!goal.value.trim()) { plan.replaceChildren(h("div", { class: "banner", role: "alert" }, "Décris d'abord ton objectif.")); return goal.focus(); }
      planBtn.disabled = true; plan.innerHTML = '<div class="muted">Le chef d\'orchestre compose le plan…</div>'; run.replaceChildren();
      try { const r = await api.post("/api/ame/llm", { kind: "plan", input: goal.value }); if (r.error) throw new Error(r.error);
        steps = (Array.isArray(r.steps) ? r.steps : []).slice(0, MAX).map((s) => ({ titre: String(s && s.titre || "Étape"), task: String(s && s.task || "") })); if (!steps.length) throw new Error("aucune étape proposée"); paintPlan(); }
      catch (e) { plan.replaceChildren(h("div", { class: "banner", role: "alert" }, "Échec : " + e.message), h("div", { class: "row", style: "margin-top:6px" }, h("button", { class: "btn sm primary", type: "button", onclick: () => planBtn.click() }, "↻ Réessayer"))); }
      planBtn.disabled = false; } }, "Composer le plan");
    async function exec(only) {
      const idx = only || steps.map((_, i) => i), todo = idx.map((i) => steps[i]);
      if (!goal.value.trim() || !todo.length || todo.some((s) => !s.titre.trim() || !s.task.trim())) return UI.toast("Chaque étape doit avoir un titre et une consigne.");
      let r; try { r = await api.post("/api/ame/orchestre/run", { goal: goal.value, steps: todo }); } catch (e) { return UI.toast("Lancement impossible : " + e.message); } if (r.error) return UI.toast(r.error);
      idxMap = idx; curId = r.id; curHist = { id: uid(), ts: new Date().toISOString(), goal: goal.value, steps: steps.map((s) => ({ titre: s.titre, task: s.task })), run_id: r.id, status: "en cours", results: [], synthese: "" }; hist.unshift(curHist); hist = hist.slice(0, 20); saveHist(); paintHist(); follow();
    }
    function follow() {
      clearInterval(poll); fails = 0;
      const draw = async () => {
        let s; try { s = await api.get("/api/ame/orchestre/run?id=" + encodeURIComponent(curId)); fails = 0; } catch (e) { if (++fails >= 3) { clearInterval(poll); run.prepend(h("div", { class: "banner", role: "alert" }, "Suivi interrompu : " + e.message + " ", h("button", { class: "btn sm", type: "button", onclick: follow }, "Reprendre le suivi"))); } return; }
        if (s.error) { clearInterval(poll); run.replaceChildren(h("div", { class: "banner", role: "alert" }, s.error + " — le suivi s'arrête (le moteur a peut-être redémarré).")); if (curHist) { curHist.status = "perdu"; saveHist(); paintHist(); } return; }
        const ss = s.steps || [], failed = ss.map((x, i) => (x.status === "échec" ? idxMap[i] : -1)).filter((i) => i >= 0);
        run.replaceChildren(...ss.map((x, i) => h("div", { class: "card" }, h("div", { class: "row" }, h("b", {}, (i + 1) + ". " + x.titre), h("span", { class: "spacer" }), chip(x.status, x.status === "fait" ? "up" : x.status === "échec" ? "down" : "")), x.result ? h("div", { class: "md", html: md(x.result) }) : "")),
          s.synthese ? h("div", { class: "card hero" }, h("h2", {}, "Synthèse"), h("div", { class: "md", html: md(s.synthese) }), h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: () => copyText(s.synthese) }, "Copier"), h("button", { class: "btn sm", type: "button", onclick: () => UI.download("synthese-" + UI.stamp() + ".md", s.synthese, "text/markdown") }, "Télécharger (.md)"))) : "",
          s.done ? (failed.length ? h("div", { class: "row" }, h("span", { class: "err" }, failed.length + " étape(s) en échec."), h("button", { class: "btn primary", type: "button", onclick: () => exec(failed) }, "↻ Relancer les étapes en échec")) : "") : h("div", { class: "row" }, h("span", { class: "muted" }, "Exécution en cours…"), h("button", { class: "btn sm", type: "button", title: "L'exécution continue côté Nova ; seul le suivi à l'écran s'arrête", onclick: () => { clearInterval(poll); UI.toast("Suivi arrêté (l'exécution continue en arrière-plan)."); } }, "Arrêter le suivi")));
        if (s.done) { clearInterval(poll); UI.announce("Plan terminé"); if (curHist) { curHist.status = failed.length ? "partiel" : "terminé"; curHist.results = ss.map((x) => ({ titre: x.titre, status: x.status, result: String(x.result || "").slice(0, 4000) })); curHist.synthese = String(s.synthese || "").slice(0, 6000); saveHist(); paintHist(); } }
      };
      draw(); poll = setInterval(draw, 2500); ctx.onLeave && ctx.onLeave(() => clearInterval(poll));
    }
    function paintHist() {
      histBox.replaceChildren(...(hist.length ? [h("div", { class: "row" }, h("h2", { style: "flex:1" }, "Historique des plans (" + hist.length + ")"), h("button", { class: "btn sm", type: "button", onclick: async () => { if (!await UI.confirm("Effacer tout l'historique des plans ?", { title: "Effacer l'historique", ok: "Tout effacer", danger: true })) return; const old = hist; hist = []; await saveHist(); paintHist(); UI.undoToast("Historique effacé.", async () => { hist = old; await saveHist(); paintHist(); }); } }, "Tout effacer")),
        ...hist.map((x) => h("details", { class: "card" }, h("summary", { class: "row" }, chip(x.status || "—", x.status === "terminé" ? "up" : x.status === "partiel" || x.status === "perdu" ? "down" : ""), h("b", { style: "flex:1" }, String(x.goal || "").slice(0, 90)), h("span", { class: "muted" }, UI.fdate(x.ts))),
          x.synthese ? h("div", { class: "md", html: md(x.synthese) }) : h("div", { class: "muted" }, "Pas de synthèse enregistrée."), ...(x.results || []).map((r) => h("details", {}, h("summary", {}, r.titre + " — " + r.status), h("div", { class: "md", html: md(r.result || "") }))),
          h("div", { class: "row", style: "margin-top:6px" }, h("button", { class: "btn sm", type: "button", onclick: () => { goal.value = x.goal; steps = (x.steps || []).map((s) => ({ titre: s.titre, task: s.task })); paintPlan(); goal.scrollIntoView({ block: "center" }); } }, "Rejouer / modifier"),
            h("button", { class: "btn sm", type: "button", onclick: async () => { if (!await UI.confirm("Supprimer ce plan de l'historique ?", { title: "Supprimer", ok: "Supprimer", danger: true })) return; const k = hist.indexOf(x); hist.splice(k, 1); await saveHist(); paintHist(); UI.undoToast("Plan supprimé.", async () => { hist.splice(Math.min(k, hist.length), 0, x); await saveHist(); paintHist(); }); } }, "Supprimer"))))] : []));
    }
    paintHist();
    box.append(hero("Chef d'orchestre", "Tu donnes un objectif ; Nova le découpe en étapes, lance un sous-agent par étape avec les vrais outils (web, agenda, rappels, mails non lus, tes documents, le Mac), puis fait la synthèse. Tu peux modifier le plan avant."), h("div", { class: "card grid" }, goal, h("div", { class: "row" }, planBtn)), plan, run, histBox);
  });
} };

/* 6 · 19 · 25 — Jumeau & Sparring */
const conseil2 = { id: "jumeau", title: "Jumeau & sparring", desc: "Simuler · être contredit", icon: "brain", async render(el, ctx) {
  return UI.page(el, ctx, async (box) => {
    const d = h("textarea", { rows: 3, "aria-label": "Décision à simuler", maxlength: "3000", placeholder: "Décision à simuler (ex. : accepter la mission X, déménager, lancer le projet Y)…" }), p = h("textarea", { rows: 3, "aria-label": "Position à challenger", maxlength: "3000", placeholder: "Ta position à challenger (ex. : « je dois répondre tout de suite à ce courrier »)…" });
    const j = think("jumeau", () => d.value, { label: "Simuler avec mon jumeau", needsInput: true, inputHint: "Décris d'abord la décision à simuler." }), sp = think("sparring", () => p.value, { label: "Me contredire", primary: false, needsInput: true, inputHint: "Écris d'abord la position à challenger." });
    box.append(hero("Jumeau & sparring", "Le Jumeau simule ta décision à partir de ta mémoire, de tes valeurs et de tes habitudes : trois scénarios, des hypothèses explicites, jamais de certitude. Le Sparring t'attaque avec rigueur et te dit à quelle condition il changerait d'avis."),
      h("div", { class: "grid g2", style: "align-items:start" }, h("div", { class: "card grid" }, h("h2", {}, "Mon jumeau"), d, j.btn, j.out), h("div", { class: "card grid" }, h("h2", {}, "Sparring"), p, sp.btn, sp.out)));
  });
} };

/* 4 · 11 · 21 · 27 — Corps & présence, le Vide */
const corps = { id: "corps", title: "Corps & Vide", desc: "Pauses · silence total", icon: "shield", async render(el, ctx) {
  return UI.page(el, ctx, async (box, reload) => {
    const cards = h("div", { class: "grid g3" }), errBox = h("div"); let t;
    const load = async () => {
      if (document.hidden && cards.childElementCount) return;
      try { const c = await api.get("/api/ame/corps"); errBox.replaceChildren();
        cards.replaceChildren(
          h("div", { class: "card" }, h("h2", {}, "Activité continue"), h("div", { style: "font-size:34px;font-weight:700" }, c.mesurable ? c.streak_min + " min" : "—"), h("div", { class: "muted" }, c.mesurable ? "sans pause de 5 min (clavier/souris, mesuré par macOS)" : "Mesure disponible seulement sur le Mac.")),
          h("div", { class: "card" }, h("h2", {}, "Prochain rappel"), h("div", { style: "font-size:34px;font-weight:700" }, c.mesurable ? Math.max(0, c.seuil_min - c.streak_min) + " min" : "—"), h("div", { class: "muted" }, "Seuil : " + c.seuil_min + " min. Silencieux la nuit.")),
          h("div", { class: "card" }, h("h2", {}, "Le Mac"), h("div", {}, c.batterie ? "Batterie " + c.batterie.pct + " % (" + c.batterie.source + ")" : "Batterie : non mesurée"), h("div", { class: "muted" }, c.uptime_s ? "Allumé depuis " + Math.round(c.uptime_s / 3600) + " h" : "")));
      } catch (e) { errBox.replaceChildren(h("div", { class: "banner", role: "alert" }, "Mesure indisponible : " + e.message + " ", h("button", { class: "btn sm", type: "button", onclick: load }, "Réessayer"))); }
    };
    await load(); t = setInterval(() => { if (!document.body.contains(cards)) return clearInterval(t); load(); }, 15000); ctx.onLeave && ctx.onLeave(() => clearInterval(t));
    const s = (ctx.st && ctx.st.settings) || {}; const on = h("input", { type: "checkbox", style: "width:auto" }); on.checked = s.corps_on !== false;
    on.onchange = async () => { try { const r = await api.post("/api/settings", { corps_on: on.checked }); if (r && r.error) throw new Error(r.error); UI.toast(on.checked ? "Rappels de pause activés" : "Rappels de pause coupés"); ctx.refresh(); } catch (e) { on.checked = !on.checked; UI.toast("Échec : " + e.message); } };
    const th = h("input", { type: "number", min: 20, max: 240, value: s.corps_pause_min || 90, style: "width:90px", "aria-label": "Minutes d'activité continue avant rappel" });
    th.onchange = async () => { const v = Math.max(20, Math.min(240, Math.round(+th.value) || 90)); th.value = v; try { await api.post("/api/settings", { corps_pause_min: v }); UI.toast("Seuil enregistré : " + v + " min"); } catch (e) { UI.toast("Échec : " + e.message); } };
    box.append(hero("Corps & présence", "Le Gardien du corps ne devine rien : il mesure l'inactivité réelle du clavier et de la souris. Quand tu restes actif trop longtemps sans vraie pause, un Dot apparaît avec un geste simple. Pas de surveillance des contenus."), errBox, cards,
      h("div", { class: "grid g2" }, h("div", { class: "card grid" }, h("h2", {}, "Réglages"), h("label", { class: "row" }, on, "Rappeler les pauses"), h("div", { class: "row" }, "Me prévenir après", th, "minutes d'activité continue (20 à 240)"), h("button", { class: "btn", type: "button", onclick: async () => { try { await api.post("/api/ame/corps/test"); UI.toast("Rappel de test envoyé"); } catch (e) { UI.toast("Échec : " + e.message); } } }, "Tester le rappel")),
        h("div", { class: "card grid" }, h("h2", {}, "Le Vide"), h("div", { class: "muted" }, "Efface tout sauf Nova : plus d'onglets, plus de barres. Une seule présence calme. Tu peux dire « mode vide » puis « quitte le vide », cliquer sur « Quitter le Vide » ou appuyer sur Échap."), h("button", { class: "btn primary", type: "button", onclick: () => window.Nova && window.Nova.vide && window.Nova.vide(true) }, "Entrer dans le Vide"))));
  });
} };

/* 5 · 15 · 20 · 26 · C1 — Rituels, laisser, rêves, silence */
const rituels = { id: "rituels", title: "Rituels & rêves", desc: "Matin · soir · laisser · silence", icon: "time", async render(el, ctx) {
  const S = { lq: UI.takeHint(ctx, "rituels"), rf: "proposé", all: false };
  return UI.page(el, ctx, async (box, reload) => {
    const mat = think("rituel_matin", null, { label: "Rituel du matin" }), soir = think("rituel_soir", null, { label: "Rituel du soir", primary: false });
    let laisser = await doc.get("laisser"); if (!Array.isArray(laisser)) laisser = []; const lbox = h("div", { class: "grid", role: "list", "aria-label": "Ce que je laisse" }), li = h("input", { placeholder: "Ce que je laisse ce soir (je n'y reviens pas demain)…", style: "flex:1", "aria-label": "Ce que je laisse", maxlength: "500" });
    const saveL = () => persist("laisser", laisser);
    const paintL = () => { const nq = UI.norm(S.lq), v = laisser.slice().reverse().filter((x) => !nq || UI.norm(x.text).includes(nq)), shown = S.all || nq ? v : v.slice(0, 8);
      lbox.replaceChildren(...(shown.length ? shown.map((x) => h("div", { class: "row", role: "listitem" }, h("span", { class: "muted" }, String(x.ts).slice(0, 10)), h("span", { style: "flex:1" }, x.text),
        h("button", { class: "btn sm", type: "button", "aria-label": "Retirer : " + x.text.slice(0, 40), onclick: async () => { if (!await UI.confirm("Retirer cet élément ?", { title: "Retirer", ok: "Retirer", danger: true, detail: x.text })) return; const k = laisser.indexOf(x); laisser.splice(k, 1); saveL(); paintL(); UI.undoToast("Élément retiré.", async () => { laisser.splice(Math.min(k, laisser.length), 0, x); await saveL(); paintL(); }); } }, "✕"))) : [UI.emptyCard(laisser.length ? "Rien ne correspond." : "Rien n'est laissé pour l'instant.")]),
        !S.all && !nq && v.length > 8 ? h("button", { class: "btn sm", type: "button", onclick: () => { S.all = true; paintL(); } }, "Voir tout (" + v.length + ")") : ""); }; paintL();
    const addL = () => { const t = li.value.trim(); if (!t) return li.focus(); laisser.push({ id: uid(), text: t, ts: new Date().toISOString() }); saveL(); li.value = ""; paintL(); }; li.onkeydown = (e) => { if (e.key === "Enter") addL(); };
    let reves = await doc.get("reves"); if (!Array.isArray(reves)) reves = []; const rbox = h("div", { class: "grid", role: "list", "aria-label": "Rêves" });
    const saveR = () => persist("reves", reves);
    const paintR = () => { const p = reves.filter((r) => S.rf === "tous" || r.status === S.rf).reverse();
      rbox.replaceChildren(...(p.length ? p.map((r) => h("div", { class: "row", role: "listitem" }, h("span", { class: "muted" }, String(r.ts).slice(0, 10)), h("span", { style: "flex:1" }, r.text), r.status !== "proposé" ? chip(r.status) : "",
        r.status === "proposé" ? h("button", { class: "btn sm primary", type: "button", onclick: async () => { try { const x = await api.post("/api/memory/add", { text: r.text }); if (!x || !x.item) return UI.toast("Rien n'a été retenu (mode sans mémoire ou contenu refusé)."); r.status = "retenu"; saveR(); paintR(); UI.toast("Retenu en mémoire"); } catch (e) { UI.toast("Échec : " + e.message); } } }, "Retenir") : "",
        r.status === "proposé" ? h("button", { class: "btn sm", type: "button", onclick: () => { r.status = "écarté"; saveR(); paintR(); } }, "Écarter") : "", r.status === "écarté" ? h("button", { class: "btn sm", type: "button", onclick: () => { r.status = "proposé"; saveR(); paintR(); } }, "Remettre à l'examen") : ""))
        : [h("div", { class: "muted", role: "status" }, S.rf === "proposé" ? "Rien à valider. Chaque nuit à 23 h 30, Nova distille ta journée en propositions ; rien n'est retenu sans ton accord." : "Aucun rêve dans cette catégorie.")])); }; paintR();
    const rf = h("select", { "aria-label": "Filtrer les rêves", style: "width:auto", onchange: () => { S.rf = rf.value; paintR(); } }, ...["proposé", "retenu", "écarté", "tous"].map((k) => h("option", { value: k, selected: k === S.rf }, k === "tous" ? "tous" : k + "s")));
    const dream = think("reve", null, { label: "Rêver maintenant (distiller aujourd'hui)", primary: false, onResult: async (r) => { (r.items || []).forEach((t) => { if (!reves.some((x) => x.text === t)) reves.push({ id: uid(), text: String(t), ts: new Date().toISOString(), status: "proposé" }); }); await doc.set("reves", reves); S.rf = "proposé"; rf.value = "proposé"; paintR(); } });
    const s = (ctx.st && ctx.st.settings) || {}, pl = h("input", { type: "range", min: 1, max: 15, value: s.dots_plafond || 6, "aria-label": "Plafond d'interruptions par jour" }), plv = h("b", {}, String(s.dots_plafond || 6)); pl.oninput = () => (plv.textContent = pl.value); pl.onchange = async () => { try { await api.post("/api/settings", { dots_plafond: +pl.value }); UI.toast("Plafond enregistré : " + pl.value); } catch (e) { UI.toast("Échec : " + e.message); } };
    let st = {}; try { st = await api.get("/api/ame/stats"); } catch {}
    box.append(hero("Rituels & rêves", "Le matin : ce qu'on commence. Le soir : ce qu'on laisse. La nuit : Nova rêve ta journée et te propose ce qui mérite d'être retenu. Le Silence plafonne les interruptions."),
      h("div", { class: "grid g2", style: "align-items:start" }, h("div", { class: "card grid" }, h("h2", {}, "Matin"), mat.btn, mat.out), h("div", { class: "card grid" }, h("h2", {}, "Soir"), soir.btn, soir.out)),
      h("div", { class: "grid g2", style: "align-items:start" },
        h("div", { class: "card grid" }, h("h2", {}, "Ce que je laisse"), h("div", { class: "row" }, li, h("button", { class: "btn", type: "button", onclick: addL }, "Laisser")), UI.searchBar({ placeholder: "Filtrer…", label: "Filtrer ce que je laisse", value: S.lq, onInput: (v) => { S.lq = v; paintL(); } }).el, lbox, h("div", { class: "muted" }, "Le rituel du matin t'indique ce que tu as choisi de ne pas reprendre.")),
        h("div", { class: "card grid" }, h("h2", {}, "Rêves (propositions de mémoire)"), h("div", { class: "row" }, "Afficher", rf), rbox, dream.btn, dream.out)),
      h("div", { class: "card grid" }, h("h2", {}, "Silence"), h("div", { class: "row" }, "Au plus ", plv, " interruptions de Dots par jour", pl), h("div", { class: "muted" }, st.plafond !== undefined ? "Aujourd'hui : " + st.interruptions_aujourdhui + " / " + st.plafond + ". Au-delà, les Dots restent dans l'onglet Dots sans te déranger." : "Compteur du jour indisponible.")));
  });
} };

/* 8 · 24 · 33 · P1 — Héritage, manière de penser, pardon */
const heritage = { id: "heritage", title: "Héritage & pardon", desc: "Transmettre · oublier avec égards", icon: "book", async render(el, ctx) {
  const S = { q: UI.takeHint(ctx, "heritage"), f: "tous", n: 80 };
  return UI.page(el, ctx, async (box, reload) => {
    let saved = await doc.get("pensee"); if (!saved || typeof saved !== "object") saved = {};
    const savedBox = h("div", { class: "md" }), paintSaved = () => savedBox.replaceChildren(saved.text ? h("div", {}, h("div", { class: "muted", style: "font-size:11px" }, "Version enregistrée · " + UI.fdate(saved.ts)), h("div", { class: "md", html: md(saved.text) }), h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: () => copyText(saved.text) }, "Copier"), h("button", { class: "btn sm", type: "button", onclick: () => UI.download("ma-maniere-de-penser-" + UI.stamp() + ".md", saved.text, "text/markdown") }, "Télécharger (.md)"))) : h("div", { class: "muted" }, "Aucune version enregistrée. Lance la rédaction : elle sera conservée ici."));
    paintSaved();
    const pen = think("pensee", null, { label: "Rédiger « Ma manière de penser »", onResult: async (r) => { const d = { text: r.text, ts: new Date().toISOString() }; if (await persist("pensee", d, "Version enregistrée")) { saved = d; paintSaved(); } } });
    const exp = h("div", { class: "muted", role: "status" });
    const expB = h("button", { class: "btn", type: "button", onclick: async () => { expB.disabled = true; exp.textContent = "Export en cours…"; try { const r = await api.post("/api/ame/heritage"); if (r.ok) exp.replaceChildren("Paquet écrit dans ", h("b", {}, r.path), " (sans aucune clé ni donnée du Coffre). ", h("button", { class: "btn sm", type: "button", onclick: () => copyText(r.path) }, "Copier le chemin")); else exp.textContent = "Échec : " + (r.error || "export refusé"); } catch (e) { exp.textContent = "Échec : " + e.message; } expB.disabled = false; } }, "Exporter le paquet d'héritage");
    const mem = h("div", { class: "grid", role: "list", "aria-label": "Souvenirs" }), cnt = h("span", { class: "muted", role: "status" }); let items = (await api.get("/api/ame/memoire")).items || [];
    const view = () => items.filter((m) => (S.f === "tous" || (S.f === "pardonnés" ? m.forgiven : !m.forgiven)) && (!S.q || UI.norm(m.text).includes(UI.norm(S.q))));
    const paint = () => { const v = view(), shown = v.slice(0, S.n); cnt.textContent = v.length + " / " + items.length + " souvenir(s)";
      mem.replaceChildren(...(shown.length ? shown.map((m) => h("div", { class: "row", role: "listitem", style: m.forgiven ? "opacity:.55" : "" }, h("span", { style: "flex:1" }, (m.forgiven ? "🕊 " : "") + m.text, h("span", { class: "muted" }, "  · " + String(m.ts || "").slice(0, 10))),
        h("button", { class: "btn sm", type: "button", title: "Le fait reste mais Nova ne s'en sert plus", onclick: async () => { try { await api.post("/api/ame/pardon", { id: m.id }); items = (await api.get("/api/ame/memoire")).items || []; paint(); UI.toast(m.forgiven ? "Souvenir pardonné : Nova ne s'en sert plus." : "Souvenir réactivé."); } catch (e) { UI.toast("Échec : " + e.message); } } }, m.forgiven ? "Réactiver" : "Pardonner"),
        h("button", { class: "btn sm", type: "button", onclick: async () => { if (!await UI.confirm("Oublier définitivement ce souvenir ?", { title: "Oublier", ok: "Oublier", danger: true, detail: m.text })) return; try { await api.post("/api/memory/remove", { id: m.id }); } catch (e) { return UI.toast("Échec : " + e.message); } items = items.filter((x) => x.id !== m.id); paint(); UI.undoToast("Souvenir oublié.", async () => { const r = await api.post("/api/memory/add", { text: m.text }); if (!r || !r.item) throw new Error("refusé"); items = (await api.get("/api/ame/memoire")).items || []; paint(); }); } }, "Oublier")))
        : [UI.emptyCard(items.length ? "Aucun souvenir ne correspond." : "La mémoire est vide.")]), v.length > S.n ? h("button", { class: "btn", type: "button", onclick: () => { S.n += 80; paint(); } }, "Afficher plus (" + (v.length - S.n) + ")") : ""); };
    paint();
    const ff = h("select", { "aria-label": "Filtrer", style: "width:auto", onchange: () => { S.f = ff.value; S.n = 80; paint(); } }, ...["tous", "actifs", "pardonnés"].map((k) => h("option", { value: k }, k)));
    const sb = UI.searchBar({ placeholder: "Rechercher un souvenir…", label: "Rechercher un souvenir", value: S.q, onInput: (v) => { S.q = v; S.n = 80; paint(); }, extra: [ff, cnt] });
    box.append(hero("Héritage & pardon", "Ce que tu sais, ta façon de décider, tes règles : Nova en fait un document transmissible. Et tu gardes le droit de pardonner (Nova cesse de s'en servir) ou d'oublier, toujours avec confirmation."),
      h("div", { class: "grid g2", style: "align-items:start" }, h("div", { class: "card grid" }, h("h2", {}, "Ma manière de penser"), savedBox, pen.btn, pen.out, h("div", { class: "row" }, expB), exp), h("div", { class: "card grid" }, h("h2", {}, "Pardon & oubli"), sb.el, mem)));
  });
} };

/* C2 · S4 — Skills « un fichier » */
const skills = { id: "skills", title: "Skills", desc: "Une compétence = un fichier", icon: "forge", async render(el, ctx) {
  return UI.page(el, ctx, async (box, reload) => {
    let items = (await api.get("/api/ame/skills")).items || [], cur = null, dirty = false, q = UI.takeHint(ctx, "skills");
    const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    const list = h("div", { class: "grid", role: "list", "aria-label": "Compétences" });
    const name = h("input", { placeholder: "nom-de-la-competence", "aria-label": "Nom de la compétence", maxlength: "60" }), body = h("textarea", { rows: 8, maxlength: "19000", "aria-label": "Instructions de la compétence", placeholder: "# Ce que fait cette compétence\nÉcris simplement les instructions, en français. Exemple : « Rédige un message Teams dans ma charte à partir du texte fourni. »" });
    const preview = h("div", { class: "muted", role: "status", style: "font-size:12px" }), dot = h("span", { class: "muted" });
    const upd = () => { const sl = slug(name.value); preview.textContent = name.value.trim() ? "Sera enregistrée sous : " + (sl || "(nom invalide)") + ".md" : ""; };
    const mark = (d) => { dirty = d; dot.textContent = d ? "● modifications non enregistrées" : ""; }; name.addEventListener("input", () => { upd(); mark(true); }); body.addEventListener("input", () => mark(true));
    const inp = h("textarea", { rows: 3, "aria-label": "Texte à traiter", placeholder: "Texte à traiter avec la compétence sélectionnée…" }); const out = h("div", { class: "md", "aria-live": "polite" });
    const pick = async (s) => { if (dirty && !await UI.confirm("Abandonner les modifications non enregistrées ?", { title: "Modifications en cours", ok: "Abandonner", danger: true })) return; cur = s ? s.name : null; name.value = s ? s.name : ""; body.value = s ? s.body : ""; mark(false); upd(); paint(); out.replaceChildren(); };
    const paint = () => { const nq = UI.norm(q), v = items.filter((s) => !nq || UI.norm(s.name + " " + s.body).includes(nq));
      list.replaceChildren(...(v.length ? v.map((s) => h("button", { class: "btn" + (cur === s.name ? " primary" : ""), type: "button", role: "listitem", "aria-pressed": String(cur === s.name), onclick: () => pick(s) }, s.name)) : [h("div", { class: "muted", role: "status" }, items.length ? "Aucune compétence ne correspond." : "Aucune compétence. Crée la première ci-contre.")])); }; paint();
    const save = async () => {
      const sl = slug(name.value); if (!sl) { UI.toast("Donne un nom (lettres, chiffres, tirets)."); return name.focus(); } if (!body.value.trim()) { UI.toast("Écris d'abord les instructions."); return body.focus(); }
      if (items.some((s) => s.name === sl) && cur !== sl && !await UI.confirm("Une compétence « " + sl + " » existe déjà. La remplacer ?", { title: "Remplacer", ok: "Remplacer", danger: true })) return;
      try { const r = await api.post("/api/ame/skills/save", { name: name.value, body: body.value }); if (r.error) throw new Error(r.error); items = (await api.get("/api/ame/skills")).items || []; cur = r.name; name.value = r.name; mark(false); upd(); paint(); UI.toast("Compétence enregistrée"); } catch (e) { UI.toast("Échec : " + e.message); }
    };
    const apply = async () => { if (!cur) { UI.toast("Choisis une compétence"); return; } out.innerHTML = '<span class="muted">Nova applique la compétence…</span>';
      try { const r = await api.post("/api/ame/skills/run", { name: cur, input: inp.value }); if (r.error) throw new Error(r.error); out.innerHTML = md(r.text); out.append(h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: () => copyText(r.text) }, "Copier"))); }
      catch (e) { out.replaceChildren(h("div", { class: "banner", role: "alert" }, "Échec : " + e.message), h("button", { class: "btn sm primary", type: "button", onclick: apply }, "↻ Réessayer")); } };
    const expo = () => UI.download("skills-nova-" + UI.stamp() + ".json", { nova_skills: 1, exported: new Date().toISOString(), items: items.map((s) => ({ name: s.name, body: s.body })) });
    const impo = async () => { const d = await UI.pickJSON(); if (!d) return; const raw = Array.isArray(d) ? d : d.items; if (!Array.isArray(raw)) return UI.toast("Format non reconnu."); const list2 = raw.slice(0, 100).map((x) => ({ name: slug(x && x.name || ""), body: String(x && x.body || "").slice(0, 19000) })).filter((x) => x.name && x.body.trim());
      if (!list2.length) return UI.toast("Aucune compétence valide."); const clash = list2.filter((x) => items.some((s) => s.name === x.name)).length;
      if (!await UI.confirm("Importer " + list2.length + " compétence(s)" + (clash ? " dont " + clash + " remplaceront l'existant" : "") + " ?", { title: "Importer des compétences", ok: "Importer", danger: clash > 0 })) return; let n = 0;
      for (const x of list2) { try { const r = await api.post("/api/ame/skills/save", x); if (!r.error) n++; } catch {} } UI.toast(n + " compétence(s) importée(s)."); reload(); };
    box.append(hero("Skills", "Une compétence est un simple fichier texte stocké sur ton Mac : tu la rédiges une fois, Nova l'applique à la lettre à chaque fois. Aucun code."),
      h("div", { class: "grid g2", style: "align-items:start" }, h("div", { class: "card grid" }, h("h2", {}, "Mes compétences"), UI.searchBar({ placeholder: "Filtrer les compétences…", label: "Filtrer les compétences", value: q, onInput: (v) => { q = v; paint(); } }).el, list, h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: () => pick(null) }, "+ Nouvelle compétence"), h("button", { class: "btn sm", type: "button", disabled: !items.length, onclick: expo }, "Exporter (JSON)"), h("button", { class: "btn sm", type: "button", onclick: impo }, "Importer (JSON)")), name, preview, body,
        h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: save }, "Enregistrer"), h("button", { class: "btn", type: "button", disabled: !cur, onclick: () => cur && UI.download(cur + ".md", body.value, "text/markdown") }, "Télécharger (.md)"), dot),
        h("div", { class: "muted", style: "font-size:12px" }, "La suppression d'une compétence n'est pas encore proposée ici : retire son fichier .md du dossier des skills.")),
        h("div", { class: "card grid" }, h("h2", {}, "Utiliser"), inp, h("button", { class: "btn primary", type: "button", onclick: apply }, "Appliquer"), out)));
  });
} };

const V = "vivant", P = "partiel", A = "absent";
export const IDEES = [
  ["P1", "Intimité radicale", P, "heritage", "Clés en Trousseau, Coffre, paquet d'héritage sans clés ; pas de pack d'âme à 33 règles."], ["P2", "Action, pas conversation", V, "orchestre", "Plans exécutés par des sous-agents avec de vrais outils."],
  ["P3", "Interface vivante", V, "chat", "Panda 3D, orbe flottant, Dots animés."], ["P4", "Anticipation", P, "rituels", "Rituels, Dots planifiés ; fiche de réunion automatique absente."],
  ["P5", "Boucle fermée", P, "miroir", "Miroir + Rêve → mémoire ; pas d'auto-évaluation sur 10 axes."], ["P6", "Fusion", V, "accueil", "Mail, agenda, web, messageries, médias dans une seule app."],
  ["1", "Chef d'orchestre", V, "orchestre", "Objectif → plan éditable → agents → synthèse."], ["2", "Mémoire temporelle", V, "trajectoires", "Courbes et dérive calculées sur tes échanges."],
  ["3", "Miroir", V, "miroir", "Reflet sourcé de tes habitudes."], ["4", "Présence ambiante", P, "corps", "Orbe flottant + panneau ; widgets macOS absents."],
  ["5", "Rêves", V, "rituels", "Distillation à 23 h 30 → propositions à valider."], ["6", "Jumeau", V, "jumeau", "Simulation qualitative, hypothèses explicites."],
  ["7", "Voix native", P, "voix", "Micro + voix ElevenLabs ; pas de coupure vocale ni de raccourci global."], ["8", "Héritage portable", V, "heritage", "Paquet exporté dans ~/NOVA_ECHANGE."],
  ["9", "App qui se réécrit", A, "", "Non construit."], ["10", "Gardien des relations", V, "relations", "Alerte quotidienne dès 9 h si quelqu'un attend."],
  ["11", "Gardien du corps", V, "corps", "Inactivité clavier/souris mesurée par macOS → Dot de pause."], ["12", "Sérendipité", V, "trajectoires", "Liens réels entre mémoire et documents."],
  ["13", "Double écriture", A, "", "Non construit dans Nova."], ["14", "Profondeurs", V, "chat", "Sélecteur Surface · Courant · Profond · Nuit dans Conversation."],
  ["15", "Silence", V, "rituels", "Plafond d'interruptions par jour + heures calmes."], ["16", "Ambassadeur", V, "relations", "Brouillons dans ta charte, jamais envoyés."],
  ["17", "Témoin", P, "journal", "Journal de vérité de ce que Nova a fait ; témoin de tes engagements absent."], ["18", "Chronobiologie", P, "trajectoires", "Pic d'activité mesuré ; placement auto dans l'agenda absent."],
  ["19", "Maître", P, "jumeau", "Sparring + conseil ; objectif « autonomie » absent."], ["20", "Rituels sacrés", V, "rituels", "Matin, soir, laisser."], ["21", "Le Vide", V, "corps", "Mode Vide : seule présence de Nova."],
  ["22", "Sagesse compoundée", P, "trajectoires", "Mémoire + dérive ; pondération temporelle absente."], ["23", "Miroir moral", V, "miroir", "Actes confrontés à ton contrat."], ["24", "Héritage-transmission", V, "heritage", "« Ma manière de penser » rédigée et exportée."],
  ["25", "Maître-sparring", V, "jumeau", "Contradiction rigoureuse."], ["26", "Rituels matin/soir", V, "rituels", "Trois tuiles à partir de ton agenda et rappels réels."], ["27", "Vide-bouton", V, "corps", "Bouton + voix + Échap."],
  ["28", "Sagesse-mécanique", P, "trajectoires", "Dérive des sujets ; synthèse annuelle absente."], ["29", "Miroir-valeurs", V, "miroir", "Chaque valeur activable."], ["30", "Archéologue", V, "trajectoires", "Recherche + évolution datée."],
  ["31", "Contrat", V, "miroir", "Règles éditables, appliquées par le Miroir."], ["32", "Deuil", V, "relations", "Honorer sans relancer."], ["33", "Pardon", V, "heritage", "Pardonner ou oublier, avec confirmation."],
  ["S1", "Routage intelligent", V, "diagnostics", "Cascade de cerveaux + bascule sur panne/crédit."], ["S2", "Mémoire écran", A, "", "Non construit."], ["S3", "Isolation des secrets", P, "connexions", "Trousseau ; pas de processus séparé."],
  ["S4", "Écosystème de skills", V, "skills", "Compétences en fichiers."], ["S5", "MCP natif", A, "", "Non construit."], ["S6", "Dictée système", A, "", "Non construit."], ["S7", "Visuel inline", A, "", "Non construit."], ["S8", "Proactivité", V, "dots", "Dots planifiés, animés, en attente."],
  ["C1", "Mémoire qui apprend", V, "rituels", "Rêve → propositions → mémoire."], ["C2", "Skills un fichier", V, "skills", "Un fichier = une compétence."], ["C3", "Réponse HTML", A, "", "Non construit."], ["C4", "Routage une passe", V, "diagnostics", "Sans appel supplémentaire."],
  ["C5", "Agent web rapide", P, "recherche", "Recherche et lecture de pages ; pas d'agent navigateur furtif."], ["C6", "Audit indépendant", A, "", "Non construit."], ["C7", "Ami du notch", A, "", "Non construit."], ["C8", "Diagrammes interactifs", A, "", "Non construit."], ["C9", "Navigateur furtif", A, "", "Écarté (conflit avec ta règle de non-script)."],
  ["F1", "Compagnon physique", A, "", "Matériel, hors périmètre logiciel."], ["F2", "Essaims", P, "orchestre", "Jusqu'à 8 sous-agents séquentiels."], ["F3", "Petits modèles partout", P, "diagnostics", "Cerveau local en dernier recours."], ["F4", "Labo interne", A, "", "Non construit."],
  ["F5", "Gouvernance souveraine", P, "memoire", "Local d'abord, aucun envoi sans ordre."], ["F6", "Leçon des 40 %", A, "", "Non construit."],
];

const vivant = { id: "vivant", title: "Les 47, vivantes", desc: "L'état réel de chaque idée", icon: "check", async render(el, ctx) {
  const S = { q: UI.takeHint(ctx, "vivant"), f: "" };
  return UI.page(el, ctx, async (box) => {
    const n = (k) => IDEES.filter((x) => x[2] === k).length; const col = { [V]: "#10b981", [P]: "#f59e0b", [A]: "#6b7280" };
    const flt = h("select", { style: "width:auto", "aria-label": "Filtrer par état", onchange: () => { S.f = flt.value; paint(); } }, h("option", { value: "" }, "Toutes"), h("option", { value: V }, "Vivantes"), h("option", { value: P }, "Partielles"), h("option", { value: A }, "Pas encore")); const grid = h("div", { class: "grid g3", role: "list", "aria-label": "Idées" }), cnt = h("span", { class: "muted", role: "status" });
    function paint() { const nq = UI.norm(S.q), v = IDEES.filter((x) => (!S.f || x[2] === S.f) && (!nq || UI.norm(x.join(" ")).includes(nq))); cnt.textContent = v.length + " / " + IDEES.length + " idées";
      grid.replaceChildren(...(v.length ? v.map((x) => { const tab = ctx.all.find((t) => t.id === x[3]), go = () => tab && ctx.go(tab.id);
        return h("div", Object.assign({ class: "card tile", role: "listitem", style: `border-left:4px solid ${col[x[2]]};${tab ? "cursor:pointer" : ""}` }, tab ? { tabindex: "0", "aria-label": x[0] + " " + x[1] + " — " + x[2] + ". Ouvrir " + tab.title, onclick: go, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } } } : {}),
          h("div", { class: "row" }, h("b", {}, x[0] + " · " + x[1]), h("span", { class: "spacer" }), h("span", { class: "pill", style: `color:${col[x[2]]};border-color:${col[x[2]]}` }, x[2])), h("div", { class: "muted" }, x[4]), tab ? h("div", { style: "color:var(--accent);font-size:12px;margin-top:6px" }, "Ouvrir : " + tab.title + " →") : ""); })
        : [UI.emptyCard("Aucune idée ne correspond.", h("button", { class: "btn sm", type: "button", onclick: () => { S.q = ""; S.f = ""; sb.inp.value = ""; flt.value = ""; paint(); } }, "Effacer les filtres"))])); }
    const sb = UI.searchBar({ placeholder: "Rechercher une idée (nom, état, description)…", label: "Rechercher une idée", value: S.q, onInput: (v) => { S.q = v; paint(); }, extra: [flt, cnt, h("button", { class: "btn sm", type: "button", onclick: () => UI.download("idees-nova-" + UI.stamp() + ".json", IDEES.map((x) => ({ id: x[0], nom: x[1], etat: x[2], onglet: x[3], note: x[4] }))) }, "Exporter (JSON)")] });
    paint();
    box.append(hero("Les 47 idées — état réel", n(V) + " vivantes · " + n(P) + " partielles · " + n(A) + " pas encore construites, sur " + IDEES.length + ". Cette liste est mon engagement d'honnêteté : « vivante » veut dire qu'elle agit sur tes vraies données ; clique pour l'utiliser."), sb.el, grid);
  });
} };

export const ame = [vivant, miroir, trajectoires, relations, orchestre, conseil2, corps, rituels, heritage, skills];
