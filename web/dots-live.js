// V10 — Dots vivants : des agents animés qui apparaissent à l'heure prévue, livrent leur résultat, puis ATTENDENT ton ordre.
// Pilotage : clic (Ouvrir / Attendre / Plus tard / Fermer) ou voix (« ouvre », « attends », « plus tard », « dans 20 minutes », « ferme »).
import { api, h, md, esc } from "./core.js";
import { mountPlush } from "./plush.js";

export function initDots(ctx, A) {
  const layer = h("div", { id: "dotlayer", "aria-live": "polite" }); document.body.append(layer);
  const actors = new Map();   // key (run_id ou dot) -> actor
  let last = null;
  const personas = {};   // id du Dot -> personnage (prénom, trait, visage…)
  const loadPersonas = async () => { try { const r = await api.get("/api/dots"); for (const x of (r.dots || r.items || [])) if (x.persona) personas[x.id] = x.persona; } catch {} };
  const ready0 = loadPersonas();
  const pOf = (d) => personas[d.dot || d.id] || null;
  const who = (d) => { const p = pOf(d); return p ? p.who + " · " + (d.name || "Dot") : (d.name || "Dot"); };

  function chime(ok = true) {
    try { const ac = new (window.AudioContext || window.webkitAudioContext)(); const t = ac.currentTime;
      [ok ? 660 : 330, ok ? 990 : 247].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.0001, t + i * 0.11); g.gain.exponentialRampToValueAtTime(0.07, t + i * 0.11 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.11 + 0.5); o.start(t + i * 0.11); o.stop(t + i * 0.11 + 0.55); });
      setTimeout(() => ac.close(), 1500); } catch {}
  }

  function build(d) {
    const sphere = h("div", { class: "dsphere" }, h("span", { class: "dface" }, d.emoji || "●"), h("i", { class: "dring r1" }), h("i", { class: "dring r2" }), h("i", { class: "dspark s1" }), h("i", { class: "dspark s2" }), h("i", { class: "dspark s3" }));
    const bub = h("div", { class: "dbub" });
    const el = h("div", { class: "dactor spawn", style: `--dc:${d.color || "#D93226"}` }, bub, sphere);
    sphere.addEventListener("click", () => { if (a.phase === "waiting") ready(a); else open(a); });
    const a = { el, bub, d, phase: "working", run_id: d.run_id || null, summary: "", g3: null };
    sphere.classList.add("pl"); a.g3 = mountPlush(sphere, d.color || "#D93226", 120, d.dot || d.id, d.emoji);   // orbe 3D réel (shader three.js) ; sans WebGL, la sphère CSS reste
    return a;
  }

  const GOOD = /bonne nouvelle|f[ée]licit|bravo|r[ée]ussi|succ[èe]s|excellent|objectif atteint|gagn|hausse|plus-value/i, BAD = /urgent|alerte|retard|erreur|[ée]chec|conflit|impay|probl[èe]me|attention|annul|baisse forte|risque/i;
  function moodOf(d) { if (d.mood) return d.mood; const t = (d.summary || "") + " " + (d.name || ""); if (d.ok === false || BAD.test(t)) return "confused"; if (GOOD.test(t)) return "dance"; return "calm"; }
  function setMood(a, m) { a.mood = m; a.el.dataset.mood = m; if (a.g3 && a.g3.setMood) a.g3.setMood(m); }
  function setPhase(a, p) { a.phase = p; a.el.dataset.phase = p; if (a.g3) a.g3.setPhase(p); }

  function working(d) {
    const key = "w:" + d.dot; if (actors.has(key)) return;
    const a = build({ ...d, emoji: d.emoji }); a.key = key; actors.set(key, a); layer.append(a.el); setPhase(a, "working");
    a.bub.replaceChildren(h("b", {}, who(d)), h("div", { class: "muted" }, (pOf(d)?.hello ? "" : "") + "Je prépare ton point…")); a.el.classList.add("showb");
    requestAnimationFrame(() => a.el.classList.remove("spawn"));
  }

  function ready(a) {
    for (const o of actors.values()) if (o !== a && o.phase === "ready") wait(o);   // une seule bulle à la fois : les autres se mettent en attente (pastille)
    try { ctx.avatar.react(a.d.ok === false ? "alerte" : "courrier"); } catch {}
    setPhase(a, "ready"); a.el.classList.add("showb");
    a.bub.replaceChildren(...[h("b", {}, who(a.d)), pOf(a.d)?.motto ? h("div", { class: "muted dmotto" }, "« " + pOf(a.d).motto + " »") : null, h("div", { class: "dsum" }, a.summary || "Résultat prêt."),
      h("div", { class: "row dact" },
        h("button", { class: "btn primary", onclick: () => open(a) }, "Ouvrir"),
        h("button", { class: "btn", onclick: () => wait(a) }, "Attendre"),
        h("select", { onchange: (e) => { const m = +e.target.value; if (m) later(a, m); e.target.value = ""; }, "aria-label": "Plus tard" }, h("option", { value: "" }, "Plus tard…"), h("option", { value: "15" }, "15 min"), h("option", { value: "60" }, "1 heure"), h("option", { value: "240" }, "4 heures")),
        h("button", { class: "btn", title: "Fermer", onclick: () => close(a) }, "✕"))].filter(Boolean));
    last = a;
  }

  function wait(a) { setPhase(a, "waiting"); a.el.classList.remove("showb"); a.bub.replaceChildren(); }
  async function later(a, minutes) { if (a.run_id) await api.post("/api/dots/snooze", { run_id: a.run_id, minutes }); ctx.toast((a.d.name || "Dot") + " reviendra dans " + (minutes >= 60 ? minutes / 60 + " h" : minutes + " min")); remove(a); }
  async function close(a) { if (a.run_id) await api.post("/api/dots/ack", { run_id: a.run_id }); remove(a); }
  function remove(a) { a.el.classList.add("bye"); setTimeout(() => { if (a.g3) a.g3.dispose(); a.el.remove(); actors.delete(a.key); if (last === a) last = null; }, 450); }

  async function open(a) {
    setPhase(a, "open"); a.el.classList.remove("showb");
    let run = null; try { const { runs } = await api.get("/api/dots"); run = runs.find((r) => r.id === a.run_id) || runs.find((r) => r.dot === a.d.dot); } catch {}
    const ov = h("div", { class: "dpanel glass", style: `--dc:${a.d.color || "#D93226"}` }, h("div", { class: "row" }, h("h2", {}, (a.d.emoji || "") + " " + (a.d.name || "Dot")), h("span", { class: "spacer" }), h("button", { class: "btn", onclick: () => { ov.remove(); wait(a); } }, "Attendre"), h("button", { class: "btn primary", onclick: () => { ov.remove(); close(a); } }, "Terminé")),
      h("div", { class: "md", html: md(run ? run.result : a.summary) }), run && run.steps?.length ? h("details", {}, h("summary", { class: "muted" }, run.steps.length + " étapes (outils utilisés)"), ...run.steps.map((s) => h("div", { class: "muted" }, "• " + s.tool + " — " + (s.input || "")))) : null);
    document.body.append(ov);
  }

  function onEvent(d) {
    if (d.phase === "working") return working(d);
    const key = d.run_id || ("w:" + d.dot); const w = actors.get("w:" + d.dot);
    let a = actors.get(key) || w;
    if (!a) { a = build(d); layer.append(a.el); requestAnimationFrame(() => a.el.classList.remove("spawn")); }
    if (w && w !== a) { if (w.g3) w.g3.dispose(); w.el.remove(); actors.delete("w:" + d.dot); }
    actors.delete(a.key); a.key = key; actors.set(key, a); a.d = { ...a.d, ...d }; a.run_id = d.run_id; a.summary = d.summary || "";
    a.el.querySelector(".dface").textContent = d.ok === false ? "⚠️" : (d.emoji || "●");
    setMood(a, moodOf(d));
    if (d.ok === false) { wait(a); return; }   // un échec ne s'affiche pas en grande bulle : pastille discrète, détail dans l'onglet Dots
    ready(a); chime(a.mood !== "confused");
    if (ctx.say) { const p = pOf(d); ctx.say(p && p.hello ? p.who + " : " + p.hello : (d.name || "Un Dot") + " a un point pour toi."); }
  }

  // Ordres vocaux / texte, appliqués au dernier Dot prêt (ou à celui qu'on nomme). Retourne true si l'ordre a été consommé.
  function command(text) {
    const live = [...actors.values()].filter((a) => ["ready", "waiting", "open"].includes(a.phase)); if (!live.length) return false;
    const t = text.toLowerCase().replace(/[.!?,]/g, " ").replace(/\s+/g, " ").trim();
    if (t.split(" ").length > 9) return false;   // une vraie question n'est pas un ordre
    const named = live.find((a) => t.includes((a.d.name || "").toLowerCase().split(" ")[0])) || (/\bbilan\b/.test(t) && live.find((a) => a.d.dot === "bilan"));
    const a = named || (last && live.includes(last) ? last : live[live.length - 1]);
    const speak = (s) => { if (ctx.say) ctx.say(s); };
    let m;
    if (/^(ouvre|ouvrir|montre|affiche|lis|vas-y|vas y|je t'écoute|dis-moi|dis moi)\b/.test(t)) { open(a); speak("Je l'ouvre."); return true; }
    if ((m = t.match(/(plus tard|après|apres|rappelle[- ]moi|reviens)(.*?)(dans )?(\d+)\s*(min|minute|minutes|heure|heures|h)\b/))) { const n = +m[4]; later(a, /^h/.test(m[5]) ? n * 60 : n); speak("D'accord, je reviens."); return true; }
    if (/(plus tard|après|apres|reviens plus tard)/.test(t)) { later(a, 60); speak("D'accord, dans une heure."); return true; }
    if (/(attends|attend|patiente|mets[- ]toi en attente|en attente)/.test(t)) { wait(a); speak("Je reste là, à ton signal."); return true; }
    if (/^(ferme|fermer|ignore|c'est bon|merci|terminé|ok merci)/.test(t)) { close(a); speak("Fait."); return true; }
    return false;
  }
  A.onCommand = command;

  // Dots livrés mais pas encore acquittés (app fermée entre-temps) : ils réapparaissent en attente.
  (async () => { try { await ready0; const { items } = await api.get("/api/dots/waiting"); items.forEach((d) => { const a = build(d); a.key = d.run_id; a.run_id = d.run_id; a.summary = d.summary; actors.set(a.key, a); layer.append(a.el); requestAnimationFrame(() => a.el.classList.remove("spawn")); wait(a); }); } catch {} })();

  return { onEvent: (x) => { ready0.then(() => onEvent(x)); }, command, count: () => actors.size };
}
