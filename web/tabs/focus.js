import { api, h } from "../core.js";

// Mode Focus : une intention, un minuteur, des notes de session, aucune distraction. Le résumé est écrit par l'assistant (cerveau auto : Muse Spark en tête).
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
try { if (localStorage.getItem("nova_focus_calm") === "1") document.body.classList.add("focus-calm"); } catch {}
const fmt = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");

export const focus = { id: "focus", title: "Mode Focus", desc: "Une tâche, un minuteur, zéro distraction", icon: "pulse", async render(el, ctx) {
  const st = lsGet("nova_focus", { intent: "", notes: "", end: 0, total: 25 * 60, done: [] });   // end : instant de fin (ms) si le minuteur tourne
  const save = () => lsSet("nova_focus", st);
  const intent = h("input", { value: st.intent, placeholder: "Sur quoi je travaille maintenant ?", "aria-label": "Intention de la session", style: "width:100%;font-size:1.15rem" });
  const notes = h("textarea", { rows: 8, placeholder: "Notes de session (idées, blocages, décisions)…", "aria-label": "Notes de session", style: "width:100%" }); notes.value = st.notes;
  const clock = h("div", { style: "font-size:3.2rem;font-weight:700;font-variant-numeric:tabular-nums;text-align:center", role: "timer", "aria-live": "off" }, fmt(st.total));
  const bar = h("div", { style: "height:8px;border-radius:99px;background:var(--line);overflow:hidden" }, h("div", { style: "height:100%;width:0;background:var(--accent,#2e8b57);transition:width .5s" }));
  const calm = h("input", { type: "checkbox" }); calm.checked = document.body.classList.contains("focus-calm");
  const dur = h("select", { "aria-label": "Durée", style: "width:auto" }, ...[[25, "25 min"], [50, "50 min"], [90, "90 min"]].map(([m, l]) => h("option", { value: m, selected: m * 60 === st.total }, l)));
  const log = h("div", { class: "muted" });
  let tick = null;
  const left = () => Math.max(0, Math.round((st.end - Date.now()) / 1000));
  const paint = () => {
    const run = st.end > 0, rest = run ? left() : st.total;
    clock.textContent = fmt(rest); bar.firstChild.style.width = (run ? Math.round(100 * (1 - rest / st.total)) : 0) + "%";
    if (run && rest <= 0) finish();
  };
  const finish = () => {
    clearInterval(tick); tick = null; const min = Math.round(st.total / 60); st.end = 0; st.done = [...(st.done || []).slice(-9), { t: new Date().toISOString(), min, intent: st.intent }]; save();
    ctx.toast("Session terminée : " + min + " min. Bravo."); try { ctx.say && ctx.say("Session de " + min + " minutes terminée."); } catch {} paint(); drawLog();
  };
  const drawLog = () => { const d = (st.done || []).filter((x) => String(x.t).slice(0, 10) === new Date().toISOString().slice(0, 10)); log.textContent = d.length ? "Aujourd'hui : " + d.length + " session(s), " + d.reduce((a, x) => a + x.min, 0) + " min de concentration." : "Aucune session terminée aujourd'hui."; };
  const start = () => { st.total = +dur.value * 60; st.end = Date.now() + st.total * 1000; st.intent = intent.value; save(); clearInterval(tick); tick = setInterval(paint, 1000); paint(); };
  const stop = () => { clearInterval(tick); tick = null; st.end = 0; save(); paint(); };
  const setCalm = (on) => { document.body.classList.toggle("focus-calm", on); try { localStorage.setItem("nova_focus_calm", on ? "1" : "0"); } catch {} };
  intent.oninput = () => { st.intent = intent.value; save(); }; notes.oninput = () => { st.notes = notes.value; save(); }; calm.onchange = () => setCalm(calm.checked);
  const summary = () => { ctx.go("chat"); ctx.A.send("Résume ma session de concentration en 5 lignes maximum et propose la prochaine action concrète.\nObjectif : " + (st.intent || "non précisé") + "\nDurée : " + Math.round(st.total / 60) + " min\nNotes :\n" + (st.notes || "(aucune)")); };
  const keep = async () => { try { await api.post("/api/notes/save", { title: "Focus — " + (st.intent || "session") + " (" + new Date().toLocaleDateString("fr-FR") + ")", body: st.notes }); ctx.toast("Notes enregistrées dans Notes."); } catch (e) { ctx.toast("Échec : " + (e && e.message || e)); } };
  el.append(
    h("div", { class: "hero card" }, h("h1", {}, "Mode Focus"), h("div", { class: "muted" }, "Une intention, un minuteur, des notes. Le mode calme masque les bulles des agents et le dock pour que rien ne te sorte de ta tâche.")),
    h("div", { class: "card", style: "display:grid;gap:12px" }, intent, clock, bar,
      h("div", { class: "row" }, dur, h("button", { class: "btn primary", onclick: start }, "Démarrer"), h("button", { class: "btn", onclick: stop }, "Arrêter"), h("span", { class: "spacer" }),
        h("label", { class: "row", style: "gap:6px" }, calm, "Mode calme (masque bulles et dock)")), log),
    h("div", { class: "card", style: "display:grid;gap:10px" }, notes,
      h("div", { class: "row" }, h("button", { class: "btn primary", onclick: summary }, "Résumé de session par l'assistant"), h("button", { class: "btn", onclick: keep }, "Enregistrer dans Notes"), h("button", { class: "btn", onclick: () => ctx.go("agenda") }, "Voir l'agenda"))));
  drawLog(); paint(); if (st.end > 0) tick = setInterval(paint, 1000);
} };
