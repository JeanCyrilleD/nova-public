import { api, esc, md, h, sse } from "../core.js";
import { ic } from "../icons.js";

let chatPane = null;   // l'écran de conversation est construit UNE fois : il continue d'écouter l'assistant même quand on est sur un autre onglet
const BTN = "background:none;border:0;color:var(--txt3);cursor:pointer;font-size:11px;padding:2px 6px;border-radius:6px";
const TITLES_KEY = "nova_conv_titles";   // renommage local (aucune route serveur de renommage n'existe)
const titles = () => { try { return JSON.parse(localStorage.getItem(TITLES_KEY) || "{}"); } catch { return {}; } };
const setTitle = (id, t) => { try { const o = titles(); if (t) o[id] = t; else delete o[id]; localStorage.setItem(TITLES_KEY, JSON.stringify(o)); } catch {} };
const slug = (t) => String(t || "conversation").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "conversation";
function download(name, text, type = "text/markdown") { const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch { const ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = t; document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch {} ta.remove(); return ok; } }
const errHint = (m) => /cl[ée]|key|401|403|sans_cle|aucun cerveau|unauthor/i.test(m) ? " — Vérifie les clés dans Système › Réglages." : /ne r[ée]pond pas|Failed to fetch|r[ée]seau|HTTP 5|timeout/i.test(m) ? " — Vérifie que Nova tourne et que le réseau est disponible." : "";
const BUSY = ["thinking", "tool", "speaking"];

function buildChat(ctx) {
  const { A } = ctx;
  let filter = "", att = [];   // filtre de recherche ; pièces jointes texte en attente
  const list = h("div", { role: "list", "aria-label": "Conversations" }), msgs = h("div", { id: "msgs", role: "log", "aria-live": "polite", "aria-label": "Conversation", tabindex: "0" }), ta = h("textarea", { placeholder: "Écris ou parle…  (Entrée = envoyer, Maj+Entrée = ligne)", rows: 1, "aria-label": "Message" });
  const stLabel = h("div", { class: "st", role: "status" }, "Au repos"), sub = h("div", { class: "muted", id: "stageSub", role: "status" }, "Prêt.");
  const stageHost = h("div", { class: "stagehost", style: "flex:1;position:relative;min-height:260px" });
  const banner = h("div");
  const micLvl = h("i", { style: "display:block;height:100%;width:0;background:var(--accent);transition:width .08s" });
  const micMeter = h("span", { "aria-hidden": "true", style: "display:none;width:44px;height:6px;border-radius:99px;background:var(--surface3);overflow:hidden;align-self:center" }, micLvl);
  const micBtn = h("button", { class: "mic", title: "Conversation vocale : micro ouvert en continu, tu peux m'interrompre à la voix", "aria-label": "Micro", "aria-pressed": "false", html: ic("mic", 22) });
  const mode = h("select", { style: "width:auto", "aria-label": "Profondeur de réponse" }, h("option", { value: "1" }, "Courant"), h("option", { value: "0" }, "Surface · 1 phrase"), h("option", { value: "2" }, "Profond · analyse"), h("option", { value: "3" }, "Nuit · réflexion lente"));
  const brainSel = h("select", { style: "width:auto;max-width:230px", "aria-label": "Cerveau" });
  const voiceTog = h("span", { class: "switch" + (ctx.st.settings.voice_enabled ? " on" : ""), title: "Lire les réponses à voix haute", role: "switch", tabindex: "0", "aria-label": "Lire les réponses à voix haute", "aria-checked": ctx.st.settings.voice_enabled ? "true" : "false" });
  const send = h("button", { class: "btn primary", "aria-label": "Envoyer le message" }, "Envoyer");
  const stopBtn = h("button", { class: "btn", style: "display:none", title: "Arrêter la génération et la voix (Échap)", "aria-label": "Arrêter" }, "■ Stop");
  const fileIn = h("input", { type: "file", multiple: true, accept: ".txt,.md,.markdown,.csv,.json,.log,.html,.xml,.yml,.yaml,.js,.ts,.py,.swift,.sh,text/*", hidden: true });
  const attBtn = h("button", { class: "btn sm", title: "Joindre un fichier texte (contenu ajouté au message)", "aria-label": "Joindre un fichier texte", onclick: () => fileIn.click() }, "📎");
  const chips = h("div", { class: "row", style: "gap:6px;flex-wrap:wrap" });
  const refillBrains = () => brainSel.replaceChildren(h("option", { value: "auto" }, "Cerveau : auto"), ...ctx.st.brains.filter((b) => !["sans_cle", "absent"].includes(b.etat)).map((b) => h("option", { value: b.id }, b.label)));
  refillBrains();
  const searches = [];
  const mkSearch = () => { const i = h("input", { type: "search", placeholder: "Rechercher une conversation…", "aria-label": "Rechercher une conversation", style: "width:100%;margin-bottom:8px" }); i.oninput = () => { filter = i.value; searches.forEach((x) => x !== i && (x.value = filter)); render(); }; searches.push(i); return i; };
  const side = h("div", { class: "glass side" }, h("button", { class: "btn sm", style: "width:100%;margin-bottom:8px", onclick: () => newConv() }, "+ Nouvelle"), mkSearch(), list);
  const histList = h("div", { class: "histpanel glass", hidden: true }), histItems = h("div", { role: "list" });
  histList.append(mkSearch(), histItems);
  const histBtn = h("button", { class: "btn sm histbtn", title: "Retrouver et reprendre une ancienne conversation", "aria-haspopup": "true", "aria-expanded": "false", onclick: () => { histList.hidden = !histList.hidden; histBtn.setAttribute("aria-expanded", String(!histList.hidden)); if (!histList.hidden) loadConvs(); } }, "Historique ▾");
  const exportBtn = h("button", { class: "btn sm", title: "Exporter la conversation en Markdown (Alt+E)", onclick: () => exportConv() }, "Exporter .md");
  const copyAllBtn = h("button", { class: "btn sm", title: "Copier toute la conversation", onclick: async () => { const t = await convMarkdown(); sub.textContent = t && (await copyText(t)) ? "Conversation copiée." : "Rien à copier."; } }, "Copier tout");
  const histBar = h("div", { class: "histbar row" }, histBtn, h("button", { class: "btn sm", onclick: () => newConv() }, "+ Nouvelle"), exportBtn, copyAllBtn, histList);
  const toBottom = h("button", { class: "btn sm", hidden: true, "aria-label": "Aller en bas", title: "Aller au dernier message", style: "position:absolute;right:10px;bottom:8px;z-index:5;border-radius:99px", onclick: () => scroll(true) }, "↓ En bas");
  const center = h("div", { class: "center" }, histBar, banner, msgs, h("div", { style: "position:relative;height:0" }, toBottom),
    h("div", { class: "composer glass" }, micBtn, micMeter, attBtn, fileIn, ta, send, stopBtn), chips,
    h("div", { class: "row muted", style: "margin-top:8px" }, mode, brainSel, h("span", {}, "Lire à voix haute"), voiceTog));
  const stage = h("div", { class: "glass stage" }, stageHost, h("div", { class: "hud" }), h("div", { class: "bar" }, stLabel, sub));
  const root = h("div", { class: "chat" }, side, center, stage);
  const Lb = { idle: "Au repos", listening: "J'écoute", thinking: "Je réfléchis", tool: "J'utilise un outil", speaking: "Je parle", error: "Problème" };
  let cur = null, curText = "", curBrain = "", notes = [], lastUser = "", typing = null;
  const near = () => msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
  const scroll = (force) => { if (force || near()) { msgs.scrollTop = msgs.scrollHeight; toBottom.hidden = true; } else toBottom.hidden = false; };
  msgs.addEventListener("scroll", () => { toBottom.hidden = near(); });
  const opts = () => ({ voice: voiceTog.classList.contains("on") || A.voiceOn, brain: brainSel.value, mode: +mode.value >= 2 ? "deep" : "fast", depth: +mode.value });
  const showTyping = (on) => { if (typing) { typing.remove(); typing = null; } if (on) { typing = h("div", { class: "sys", role: "status" }, "Nova écrit…"); msgs.append(typing); scroll(); } };
  const actions = (m, raw, isLast) => {
    if (m.querySelector(".macts")) return; const bar = h("div", { class: "macts", style: "display:flex;gap:4px;margin-top:4px" });
    const cp = h("button", { style: BTN, title: "Copier ce message", "aria-label": "Copier ce message" }, "Copier"); cp.onclick = async () => { cp.textContent = (await copyText(m.dataset.raw || raw)) ? "Copié ✓" : "Échec"; setTimeout(() => (cp.textContent = "Copier"), 1500); };
    bar.append(cp);
    if (isLast) { msgs.querySelectorAll(".regen").forEach((x) => x.remove()); bar.append(h("button", { class: "regen", style: BTN, title: "Régénérer la réponse", "aria-label": "Régénérer la réponse", onclick: () => lastUser && A.send(lastUser, opts()) }, "↻ Régénérer")); }
    m.append(bar);
  };
  const addMsg = (role, text, meta) => { const m = h("div", { class: "msg " + role + (role === "assistant" ? " md" : ""), html: role === "user" ? esc(text).replace(/\n/g, "<br>") : md(text) }); m.dataset.raw = text; if (role === "user") m.prepend(h("img", { class: "msgme", src: "assets/profile.jpg", alt: "" })); if (meta) m.append(h("div", { class: "meta" }, meta)); msgs.append(m); scroll(role === "user"); return m; };
  const finish = () => { showTyping(false); if (cur && !cur.querySelector(".meta")) { cur.dataset.raw = curText; cur.append(h("div", { class: "meta" }, "via " + curBrain + (notes.length ? " · outils : " + notes.join(", ") : ""))); actions(cur, curText, true); } };
  const on = (t, f) => A.addEventListener(t, f);
  on("state", (e) => { const s = e.detail.state; stLabel.textContent = Lb[s] || s; micBtn.classList.toggle("on", A.voiceOn); const busy = BUSY.includes(s); stopBtn.style.display = busy ? "" : "none"; send.style.display = busy ? "none" : ""; if (!busy) showTyping(false); else if (s !== "speaking" && !cur) showTyping(true); });
  on("voice", (e) => { micBtn.setAttribute("aria-pressed", String(e.detail.on)); micMeter.style.display = e.detail.on ? "" : "none"; if (!e.detail.on) micLvl.style.width = "0"; });
  on("level", (e) => { if (A.voiceOn) micLvl.style.width = Math.round(e.detail.level * 100) + "%"; });
  on("user", (e) => { addMsg("user", e.detail.text); lastUser = e.detail.text; cur = null; curText = ""; notes = []; });
  on("meta", () => { try { if (A.convId) localStorage.setItem("nova_conv", A.convId); } catch {} loadConvs(); });
  on("brain", (e) => { curBrain = e.detail.label; sub.textContent = "Cerveau : " + e.detail.label; });
  on("failover", (e) => { msgs.append(h("div", { class: "sys warn" }, "⤳ Bascule : " + e.detail.from + " → " + e.detail.to + " — " + String(e.detail.reason).replace(e.detail.from + " : ", ""))); scroll(); });
  on("tool", (e) => { showTyping(false); msgs.append(h("details", { class: "tool" }, h("summary", {}, "🔧 " + e.detail.name + " — " + String(e.detail.input).slice(0, 60)), h("pre", { style: "white-space:pre-wrap;margin:6px 0 0" }, e.detail.output))); scroll(); notes.push(e.detail.name); cur = null; curText = ""; });
  on("delta", (e) => { showTyping(false); curText += e.detail.t; if (!cur) cur = addMsg("assistant", ""); cur.innerHTML = md(curText); cur.dataset.raw = curText; scroll(); });
  on("done", () => finish());
  on("error", (e) => {
    showTyping(false); const m = String(e.detail.message || "Erreur inconnue");
    const row = h("div", { class: "sys warn", role: "alert" }, "⚠ " + m + errHint(m) + " ", lastUser ? h("button", { class: "btn sm", onclick: () => { row.remove(); A.retry(opts()); } }, "Réessayer") : null);
    msgs.append(row); scroll(); sub.textContent = m;
  });
  on("engine", (e) => { if (e.detail.engine !== "elevenlabs") banner.replaceChildren(h("div", { class: "banner" }, "Voix de repli (" + e.detail.engine + ") — ElevenLabs n'a pas répondu : " + (e.detail.reason || "voir Voix"))); else banner.replaceChildren(); });
  on("barge", () => { sub.textContent = "Interrompu à la voix."; });
  on("stt", (e) => { sub.textContent = "Entendu en " + e.detail.ms + " ms : « " + e.detail.text + " »"; });
  const doStop = () => { A.interrupt("bouton"); finish(); sub.textContent = "Arrêté."; };
  stopBtn.onclick = doStop;
  const renderChips = () => chips.replaceChildren(...att.map((f, i) => h("span", { class: "chip" }, "📎 " + f.name + " ", h("button", { style: BTN, "aria-label": "Retirer " + f.name, onclick: () => { att.splice(i, 1); renderChips(); } }, "✕"))));
  fileIn.onchange = async () => { for (const f of fileIn.files) { if (f.size > 120000) { sub.textContent = f.name + " : trop volumineux (120 Ko max)."; continue; } try { const t = await f.text(); if (t.includes("\u0000")) throw 0; att.push({ name: f.name, text: t }); } catch { sub.textContent = f.name + " : seuls les fichiers texte sont acceptés (pas d'image/PDF via l'API actuelle)."; } } fileIn.value = ""; renderChips(); };
  const doSend = () => {
    let t = ta.value.trim(); if (!t && !att.length) return; if (BUSY.includes(A.state)) doStop();
    for (const f of att) t += "\n\n[Fichier joint : " + f.name + "]\n```\n" + f.text.split("```").join("~~~") + "\n```"; att = []; renderChips();
    ta.value = ""; ta.style.height = "46px"; A.send(t.trim(), opts());
  };
  send.onclick = doSend;
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); } else if (e.key === "ArrowUp" && !ta.value && lastUser) { e.preventDefault(); ta.value = lastUser; } };
  ta.oninput = () => { ta.style.height = "46px"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; };
  const togVoice = async () => { voiceTog.classList.toggle("on"); const v = voiceTog.classList.contains("on"); voiceTog.setAttribute("aria-checked", String(v)); try { await api.post("/api/settings", { voice_enabled: v }); } catch { sub.textContent = "Réglage non enregistré (moteur injoignable)."; } };
  voiceTog.onclick = togVoice; voiceTog.onkeydown = (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); togVoice(); } };
  micBtn.onclick = () => ctx.toggleVoice();
  // Raccourcis (actifs seulement quand la conversation est affichée) : Échap = stop, Alt+N = nouvelle, / = focus message, Alt+E = exporter
  window.addEventListener("keydown", (e) => {
    if (!root.isConnected || !root.offsetParent) return; const typingIn = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if (e.key === "Escape") { if (!histList.hidden) { histList.hidden = true; histBtn.setAttribute("aria-expanded", "false"); histBtn.focus(); } else if (BUSY.includes(A.state)) doStop(); }
    else if (e.altKey && e.code === "KeyN") { e.preventDefault(); newConv(); ta.focus(); }
    else if (e.altKey && e.code === "KeyE") { e.preventDefault(); exportConv(); }
    else if (e.key === "/" && !typingIn && !e.metaKey && !e.ctrlKey) { e.preventDefault(); ta.focus(); }
  });
  async function convMarkdown() {
    if (!A.convId) return ""; let c; try { c = await api.get("/api/conversation?id=" + encodeURIComponent(A.convId)); } catch { sub.textContent = "Export impossible : moteur injoignable."; return ""; }
    const ms = c.messages || []; if (!ms.length) return ""; const name = titles()[A.convId] || c.title || "Conversation";
    return "# " + name + "\n\n_Exporté de Nova le " + new Date().toLocaleString("fr-FR") + "_\n\n" + ms.map((m) => "## " + (m.role === "user" ? "Moi" : "Nova") + (m.ts ? " · " + String(m.ts).slice(0, 16).replace("T", " ") : "") + "\n\n" + m.content + (m.brain ? "\n\n_via " + m.brain + "_" : "")).join("\n\n---\n\n") + "\n";
  }
  async function exportConv() { const t = await convMarkdown(); if (!t) { sub.textContent = "Aucune conversation à exporter."; return; } download("nova-" + slug(titles()[A.convId] || t.split("\n")[0].slice(2)) + "-" + new Date().toISOString().slice(0, 10) + ".md", t); sub.textContent = "Conversation exportée (Markdown)."; }
  let allItems = [];
  const row = (c, hide) => {
    const name = titles()[c.id] || c.title || "(sans titre)"; const open = () => { if (hide) { histList.hidden = true; histBtn.setAttribute("aria-expanded", "false"); } openConv(c.id); };
    const label = h("span", { style: "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, name);
    const ren = h("button", { style: BTN, title: "Renommer", "aria-label": "Renommer " + name }, "✎"), del = h("button", { style: BTN, title: "Supprimer", "aria-label": "Supprimer " + name }, "🗑");
    const r = h("div", { class: "it" + (c.id === A.convId ? " on" : ""), role: "listitem", style: "display:flex;align-items:center;gap:4px" }, label, h("span", { class: "muted" }, "· " + c.count), ren, del);
    label.tabIndex = 0; label.setAttribute("role", "button"); label.onclick = open; label.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    ren.onclick = (e) => { e.stopPropagation(); const i = h("input", { value: name, "aria-label": "Nouveau titre", style: "flex:1;min-width:0" }); label.replaceWith(i); i.focus(); i.select(); let done = false;
      const fin = (ok) => { if (done) return; done = true; if (ok) setTitle(c.id, i.value.trim() === (c.title || "") ? "" : i.value.trim()); render(); }; i.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === "Enter") fin(true); else if (ev.key === "Escape") fin(false); }; i.onblur = () => fin(true); i.onclick = (ev) => ev.stopPropagation(); };
    let armed = 0; del.onclick = async (e) => { e.stopPropagation();
      if (!armed) { armed = 1; del.textContent = "Confirmer ?"; setTimeout(() => { if (del.isConnected) { armed = 0; del.textContent = "🗑"; } }, 3000); return; }
      try { await api.post("/api/conversation/delete", { id: c.id }); setTitle(c.id, ""); if (c.id === A.convId) newConv(); else loadConvs(); } catch { sub.textContent = "Suppression impossible : moteur injoignable."; } };
    return r;
  };
  function render() {
    const q = filter.trim().toLowerCase(), items = q ? allItems.filter((c) => (titles()[c.id] || c.title || "").toLowerCase().includes(q)) : allItems;
    const empty = (m) => h("div", { class: "muted", style: "padding:8px" }, m); const msg = allItems.length ? "Aucun résultat pour « " + filter + " »." : "Aucune conversation enregistrée.";
    list.replaceChildren(...(items.length ? items.map((c) => row(c, false)) : [empty(msg)])); histItems.replaceChildren(...(items.length ? items.map((c) => row(c, true)) : [empty(msg)]));
  }
  async function loadConvs() { try { const { items } = await api.get("/api/conversations"); allItems = items || []; render(); return allItems; } catch { list.replaceChildren(h("div", { class: "muted", style: "padding:8px" }, "Historique indisponible (moteur injoignable).")); return []; } }
  async function openConv(id) {
    A.interrupt("", true); A.convId = id; try { localStorage.setItem("nova_conv", id); } catch {}
    let c; try { c = await api.get("/api/conversation?id=" + encodeURIComponent(id)); } catch { sub.textContent = "Ouverture impossible : moteur injoignable."; return; }
    msgs.replaceChildren(); cur = null; lastUser = ""; const ms = c.messages || [];
    ms.forEach((m, i) => { const el = addMsg(m.role, m.content, m.brain ? "via " + m.brain : ""); if (m.role === "user") lastUser = m.content; else actions(el, m.content, i === ms.length - 1); });
    if (!ms.length) welcome(); scroll(true); loadConvs();
  }
  function newConv() { A.interrupt("", true); A.convId = null; cur = null; lastUser = ""; try { localStorage.removeItem("nova_conv"); } catch {} msgs.replaceChildren(); welcome(); loadConvs(); }
  window.addEventListener("nova:newconv", newConv);
  const QUICK = [["Mon agenda", "Qu'est-ce que j'ai à l'agenda dans les prochains jours ?"], ["Mails non lus", "Résume mes mails non lus et dis-moi lesquels sont urgents."], ["Actualité", "Cherche les dernières nouvelles importantes pour moi et résume-les."], ["Mon Mac va bien ?", "Comment va mon Mac (batterie, charge, disque) ? Sois factuelle."]];
  function welcome() {
    msgs.append(h("div", { class: "sys" }, "Je suis prête. Écris, ou clique sur le micro pour parler. Je lis l'agenda, les mails, le web, et je te dis quand un outil échoue. Raccourcis : Échap = stop, / = écrire, Alt+N = nouvelle, Alt+E = exporter."),
      h("div", { style: "align-self:center;display:flex;flex-wrap:wrap;justify-content:center;gap:8px" }, ...QUICK.map(([l, q]) => h("button", { class: "btn sm", onclick: () => A.send(q, opts()) }, l))));
  }
  welcome();
  // Reprend la dernière conversation au démarrage (les échanges et leurs outils reviennent tels quels).
  loadConvs().then((items) => { let id = null; try { id = localStorage.getItem("nova_conv"); } catch {} if (id && items && items.some((c) => c.id === id)) openConv(id); }).catch(() => {});
  root.refill = () => { refillBrains(); const v = !!ctx.st.settings.voice_enabled; voiceTog.classList.toggle("on", v); voiceTog.setAttribute("aria-checked", String(v)); };
  root.stageHost = stageHost; root.loadConvs = loadConvs;
  return root;
}

const chat = { id: "chat", title: "Conversation", desc: "Parler et écrire avec Nova", icon: "chat", stage: true, wide: true, async render(el, ctx) {
  if (!chatPane) chatPane = buildChat(ctx); else chatPane.refill();
  el.append(chatPane); ctx.placeAvatar(chatPane.stageHost); chatPane.loadConvs();
  const m = chatPane.querySelector("#msgs"); m.scrollTop = m.scrollHeight;
} };

const voix = { id: "voix", title: "Voix", desc: "Micro, voix, tests réels", icon: "mic", async render(el, ctx) {
  const { A, st } = ctx; const s = st.settings; const F = (k, label, ph) => { const i = h("input", { value: s[k] ?? "", placeholder: ph || "", "aria-label": label }); i.onchange = async () => { try { await api.post("/api/settings", { [k]: i.value }); ctx.refresh(); ctx.toast("Enregistré"); } catch { ctx.toast("Échec de l'enregistrement : moteur injoignable"); } }; return h("label", {}, h("div", { class: "muted" }, label), i); };
  const meter = h("div", { role: "presentation", "aria-hidden": "true", style: "height:14px;border-radius:99px;background:var(--surface3);overflow:hidden;border:1px solid var(--line2)" }, h("i", { style: "display:block;height:100%;width:0;background:linear-gradient(90deg,#3ddc97,var(--accent));transition:width .08s" }));
  const mout = h("div", { class: "muted", role: "status" }, "Appuie sur « Tester le micro » et parle.");
  let stream, raf;
  let mac = null, audio = null;
  const stopMeter = () => { cancelAnimationFrame(raf); try { mac && mac.close(); } catch {} mac = null; stream && stream.getTracks().forEach((t) => t.stop()); stream = null; meter.firstChild.style.width = "0"; };
  const testMic = h("button", { class: "btn primary", onclick: async () => {
    if (stream) { stopMeter(); mout.textContent = "Micro coupé."; return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { mout.textContent = "Micro refusé ou absent : " + e.name; return; }
    const ac = mac = new AudioContext(), an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an); const b = new Uint8Array(an.fftSize); let peak = 0;
    const tick = () => { an.getByteTimeDomainData(b); let sum = 0; for (const x of b) { const v = (x - 128) / 128; sum += v * v; } const lv = Math.min(1, Math.sqrt(sum / b.length) * 5); peak = Math.max(peak, lv); meter.firstChild.style.width = lv * 100 + "%"; mout.textContent = "Niveau réel du micro · pic " + Math.round(peak * 100) + " %" + (peak < 0.05 ? " (silence : parle plus fort ou vérifie le micro)" : " ✓ le micro capte"); raf = requestAnimationFrame(tick); };
    tick(); } }, "Tester le micro");
  const tout = h("div", { class: "muted", role: "status", "aria-live": "polite" }, "Génère une phrase avec la voix choisie et mesure le délai réel.");
  const testVoice = h("button", { class: "btn primary", onclick: async () => {
    if (audio) { audio.pause(); audio = null; testVoice.textContent = "Tester la voix"; tout.textContent = "Lecture arrêtée."; return; }
    tout.textContent = "Synthèse en cours…"; const t0 = performance.now(); let r;
    try { r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Bonjour, ici Nova. Ceci est un test de ma voix." }) }); } catch (e) { tout.textContent = "Moteur injoignable : " + e.message + " — réessaie."; return; }
    if (!r.ok) { tout.textContent = "Échec voix : HTTP " + r.status + (r.status === 401 || r.status === 403 ? " (clé ElevenLabs refusée ?)" : "") + " — réessaie ou vérifie la clé dans Réglages."; return; }
    const engine = r.headers.get("X-Nova-Voice") || "?"; const blob = await r.blob(); const ms = Math.round(performance.now() - t0);
    const a = audio = new Audio(URL.createObjectURL(blob)); a.onended = () => { audio = null; testVoice.textContent = "Tester la voix"; }; testVoice.textContent = "■ Arrêter"; a.play().catch(() => { audio = null; testVoice.textContent = "Tester la voix"; }); tout.textContent = "Moteur : " + engine + " · " + ms + " ms · " + Math.round(blob.size / 1024) + " Ko" + (engine === "elevenlabs" ? " ✓" : " (voix de repli : ElevenLabs n'a pas répondu)");
  } }, "Tester la voix");
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Voix"), h("div", { class: "muted" }, "Pipeline : micro → détection de parole → transcription (ElevenLabs Scribe, repli Whisper local) → cerveau → voix en flux, interruptible à la voix. Rien ici n'est simulé : les tests mesurent le vrai micro et la vraie synthèse.")),
    h("div", { class: "grid g2" },
      h("div", { class: "card grid" }, h("h2", {}, "Micro"), meter, mout, h("div", { class: "row" }, testMic, h("button", { class: "btn", onclick: () => ctx.toggleVoice() }, A.voiceOn ? "Couper la conversation vocale" : "Lancer la conversation vocale"))),
      h("div", { class: "card grid" }, h("h2", {}, "Synthèse vocale"), h("div", { class: "row" }, h("span", { class: "dot " + (st.voice.elevenlabs_key ? "ok" : "sans_cle") }), st.voice.elevenlabs_key ? "Clé ElevenLabs trouvée" : "Pas de clé ElevenLabs : voix de repli macOS"), tout, testVoice)),
    h("div", { class: "card grid g2" }, F("voice_id", "Voix ElevenLabs (identifiant)"), F("voice_model", "Modèle de voix"),
      h("label", { class: "row" }, h("span", { class: "switch" + (s.auto_speak_briefs ? " on" : ""), role: "switch", tabindex: "0", "aria-checked": s.auto_speak_briefs ? "true" : "false", "aria-label": "Lire les briefs à voix haute", onkeydown: (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.target.click(); } }, onclick: async (e) => { e.target.classList.toggle("on"); e.target.setAttribute("aria-checked", String(e.target.classList.contains("on"))); try { await api.post("/api/settings", { auto_speak_briefs: e.target.classList.contains("on") }); } catch { ctx.toast("Non enregistré : moteur injoignable"); } } }), "Lire les briefs à voix haute dès leur arrivée")));
} };

const conseil = { id: "conseil", title: "Conseil", desc: "Plusieurs IA, un président", icon: "council", async render(el, ctx) {
  const brains = ctx.st.brains.filter((b) => ["ok", "non_teste"].includes(b.etat) && b.id !== "local"); const picked = new Set();
  const q = h("textarea", { rows: 3, "aria-label": "Question pour le conseil", placeholder: "Pose une question de fond : plusieurs IA répondent en parallèle, puis un président synthétise accords et désaccords." });
  const out = h("div", { class: "grid g2", "aria-live": "polite" }), chair = h("div", { class: "card md", style: "display:none" });
  const chips = brains.map((b) => { const c = h("label", { class: "chip", style: "cursor:pointer" }, h("input", { type: "checkbox", style: "width:auto" }), b.label); c.firstChild.onchange = () => (c.firstChild.checked ? picked.add(b.id) : picked.delete(b.id)); return c; });
  const go = h("button", { class: "btn primary" }, "Réunir le conseil"); let ctl = null;
  const info = h("div", { class: "muted", role: "status" }, brains.length ? "Coche des membres, ou laisse vide : Nova en choisit jusqu'à 4. Ctrl/Cmd+Entrée pour lancer." : "Aucun cerveau connecté : ajoute une clé dans Système › Réglages pour réunir le conseil.");
  const stopC = h("button", { class: "btn", style: "display:none", onclick: () => { ctl && ctl.abort(); } }, "■ Stop");
  const cpC = h("button", { class: "btn", style: "display:none", onclick: async () => { const t = (all.length ? all.join("\n\n---\n\n") + "\n\n---\n\n" : "") + "## Synthèse du président\n\n" + ctext; let ok = false; try { await navigator.clipboard.writeText(t); ok = true; } catch {} cpC.textContent = ok ? "Copié ✓" : "Copie impossible"; setTimeout(() => (cpC.textContent = "Copier le résultat"), 1500); } }, "Copier le résultat");
  let ctext = "", all = [];
  go.onclick = async () => {
    if (!q.value.trim()) { info.textContent = "Écris d'abord une question."; q.focus(); return; } if (!brains.length) return; if (ctl) ctl.abort(); ctl = new AbortController(); out.replaceChildren(); chair.style.display = "none"; chair.replaceChildren(); go.disabled = true; go.textContent = "Délibération…"; stopC.style.display = ""; cpC.style.display = "none"; info.textContent = "Les membres répondent en parallèle…";
    const cards = {}, texts = {}; ctext = ""; all = [];
    try {
      await sse("/api/council", { question: q.value, members: [...picked] }, (ev, d) => {
        if (ev === "members") d.items.forEach((m) => { cards[m.id] = h("div", { class: "card" }, h("h3", {}, m.label), h("div", { class: "md muted" }, "…")); texts[m.id] = ""; out.append(cards[m.id]); });
        else if (ev === "mdelta") { texts[d.id] += d.t; cards[d.id].lastChild.className = "md"; cards[d.id].lastChild.innerHTML = md(texts[d.id]); }
        else if (ev === "mdone") { if (d.ok) all.push("## " + (cards[d.id].firstChild.textContent) + "\n\n" + texts[d.id]); if (!d.ok) cards[d.id].lastChild.innerHTML = '<span class="err">Indisponible : ' + esc(d.error) + "</span>"; }
        else if (ev === "chair") { chair.style.display = ""; chair.append(h("h2", {}, "Synthèse du président")); }
        else if (ev === "chairbrain") chair.append(h("div", { class: "muted" }, "président : " + d.label));
        else if (ev === "delta") { ctext += d.t; chair.querySelector(".body")?.remove(); chair.append(h("div", { class: "body", html: md(ctext) })); }
        else if (ev === "error") ctx.toast(d.message, 5000);
      }, ctl.signal);
      info.textContent = ctext || all.length ? "Terminé." : "Aucune réponse reçue : réessaie ou vérifie les clés.";
    } catch (e) { if (e.name === "AbortError") info.textContent = "Délibération arrêtée."; else { ctx.toast("Conseil interrompu : " + e.message, 5000); info.textContent = "Conseil interrompu : " + e.message + " — clique sur « Réunir le conseil » pour réessayer."; } }
    go.disabled = false; go.textContent = "Réunir le conseil"; stopC.style.display = "none"; if (ctext || all.length) cpC.style.display = "";
  };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Conseil des IA"), h("div", { class: "muted" }, "Les membres sont de vrais appels à tes cerveaux connectés ; chaque réponse est attribuée, les pannes sont affichées. Sans choix, Nova prend jusqu'à 4 fournisseurs différents.")),
    h("div", { class: "card grid" }, q, h("div", { class: "row", role: "group", "aria-label": "Membres du conseil" }, ...chips), h("div", { class: "row" }, go, stopC, cpC), info), out, chair);
  q.onkeydown = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go.click(); } };
} };

const recherche = { id: "recherche", title: "Recherche web", desc: "Web + synthèse par Nova", icon: "search", async render(el, ctx) {
  const HK = "nova_search_hist"; const hist = () => { try { return JSON.parse(localStorage.getItem(HK) || "[]"); } catch { return []; } };
  const q = h("input", { type: "search", placeholder: "Rechercher sur le web…", autofocus: true, "aria-label": "Recherche web" });
  const res = h("div", { class: "card md", role: "region", "aria-live": "polite", "aria-label": "Résultats" }, h("span", { class: "muted" }, "Les résultats viennent de DuckDuckGo, en direct. Tape une requête puis Entrée."));
  const recent = h("div", { class: "row", style: "gap:6px;flex-wrap:wrap" });
  let last = "", busy = false;
  const showRecent = () => recent.replaceChildren(...hist().map((x) => h("button", { class: "btn sm", onclick: () => { q.value = x; go(); } }, x)));
  const go = async () => {
    const term = q.value.trim(); if (!term) { res.innerHTML = '<span class="muted">Écris une requête à rechercher.</span>'; q.focus(); return; } if (busy) return; busy = true; last = ""; res.innerHTML = '<span class="muted">Recherche…</span>';
    try {
      const r = await api.post("/api/tool", { name: "web_search", arg: term });
      if (r.error || !r.output) throw new Error(r.error || "réponse vide");
      last = r.output; res.innerHTML = md(last); try { localStorage.setItem(HK, JSON.stringify([term, ...hist().filter((x) => x !== term)].slice(0, 8))); } catch {} showRecent();
    } catch (e) {
      res.replaceChildren(h("div", { class: "err", role: "alert" }, "Recherche impossible : " + e.message + (/Failed to fetch|NetworkError/i.test(e.message) ? " (moteur ou réseau injoignable)" : "") + ". "), h("button", { class: "btn sm", onclick: go }, "Réessayer"));
    }
    busy = false;
  };
  q.onkeydown = (e) => { if (e.key === "Enter") go(); };
  const cp = h("button", { class: "btn", onclick: async () => { if (!last) return; let ok = false; try { await navigator.clipboard.writeText(last); ok = true; } catch {} cp.textContent = ok ? "Copié ✓" : "Copie impossible"; setTimeout(() => (cp.textContent = "Copier"), 1500); } }, "Copier");
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Recherche web"), h("div", { class: "row" }, q, h("button", { class: "btn primary", onclick: go }, "Chercher"),
    h("button", { class: "btn", onclick: () => { if (!last) { res.innerHTML = '<span class="muted">Lance d\'abord une recherche.</span>'; return; } ctx.go("chat"); ctx.A.send("Synthétise ces résultats de recherche sur « " + q.value + " » en citant les sources :\n\n" + last, { voice: false }); } }, "Synthétiser avec Nova"), cp), recent), res);
  showRecent();
} };
export const converser = [chat, voix, conseil, recherche];
