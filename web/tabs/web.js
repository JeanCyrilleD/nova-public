import { esc, h } from "../core.js";
import { ic } from "../icons.js";
import { isNative, web, onNav, rectOf, tor } from "../native.js";

// Volet web natif : la zone .webslot réserve la place, l'application Mac y pose une vraie WKWebView (session persistante).
const memHist = {}, memFav = {};
const ENGINES = [   // moteurs choisissables (Tor : le .onion passe par le réseau Tor de bout en bout)
  { id: "ddg", n: "DuckDuckGo", u: "https://duckduckgo.com/?q=" },
  { id: "ddgo", n: "DuckDuckGo (.onion)", u: "http://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion/?q=", onion: true },
  { id: "ahmia", n: "Ahmia (sites .onion)", u: "https://ahmia.fi/search/?q=" },
  { id: "startpage", n: "Startpage", u: "https://www.startpage.com/do/search?q=" },
  { id: "brave", n: "Brave Search", u: "https://search.brave.com/search?q=" },
  { id: "mojeek", n: "Mojeek", u: "https://www.mojeek.com/search?q=" },
];
let engMem = "ddg";
const engGet = (needsTor, id) => { if (needsTor) return engMem; try { return localStorage.getItem("nova.eng." + id) || "ddg"; } catch { return "ddg"; } };   // Tor : historique gardé en mémoire seulement (rien sur disque), perdu à la fermeture de Nova
export function pane(ctx, el, { id, url, title, ai, multi, needsTor }) {
  const HK = "nova.hist." + id;
  let eng = engGet(needsTor, id); const engUrl = () => (ENGINES.find((e) => e.id === eng) || ENGINES[0]).u;
  const hist = () => { if (needsTor) return (memHist[id] = memHist[id] || []); try { return JSON.parse(localStorage.getItem(HK) || "[]"); } catch { return []; } };
  const saveHist = (a) => { if (needsTor) { memHist[id] = a; return; } try { localStorage.setItem(HK, JSON.stringify(a.slice(0, 300))); } catch {} };
  const record = (u, t) => { if (!/^https?:/i.test(u || "")) return; const a = hist(); if (a[0] && a[0].url === u) { if (t && !a[0].title) a[0].title = t; saveHist(a); return; } a.unshift({ url: u, title: t || "", at: Date.now() }); saveHist(a.slice(0, 300)); };
  const slot = h("div", { class: "webslot glass", style: "height:calc(100vh - 200px);min-height:320px;display:grid;place-items:center;overflow:hidden" });
  const urlIn = h("input", { value: needsTor ? "" : url, "aria-label": "Adresse", style: "flex:1;min-width:200px" });
  let cur = { url, title: "", loading: false, canBack: false, canForward: false };
  const norm = (v) => { v = v.trim(); if (!v) return null;
    if (/^https?:\/\//i.test(v)) { try { return new URL(v).href; } catch { return null; } }
    if (/^(javascript|data|file|vbscript|blob|about):/i.test(v)) { ctx.toast("Adresse non autorisée"); return null; }
    if (/^[a-z2-7]{16,56}\.onion(\/.*)?$/i.test(v)) return "http://" + v;
    if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(v)) return "http://" + v;
    if (!/\s/.test(v) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(v)) return "https://" + v;
    return engUrl() + encodeURIComponent(v); };
  const homeUrl = (t) => "data:text/html;base64," + btoa(unescape(encodeURIComponent(t.replace("__ENGINES__", JSON.stringify(ENGINES)).replace("__ENG__", eng))));
  const goHome = async () => { try { web.nav(id, "go", homeUrl(await (await fetch("tor-home.html")).text())); } catch {} };
  const go = () => { const u = norm(urlIn.value); if (u) { web.nav(id, "go", u); urlIn.blur(); } };
  urlIn.onkeydown = (e) => { if (e.key === "Enter") go(); else if (e.key === "Escape") { urlIn.value = cur.url || url; urlIn.blur(); } };
  urlIn.onfocus = () => urlIn.select();
  // Indicateur de sécurité (https / http / autre)
  const lock = h("span", { role: "img", style: "font-size:13px;white-space:nowrap" });
  const setLock = (u) => { const s = /^https:/i.test(u || ""); const p = /^http:/i.test(u || ""); lock.textContent = s ? "🔒" : p ? "⚠ Non sécurisé" : ""; lock.title = lock.ariaLabel = s ? "Connexion sécurisée (https)" : p ? "Connexion non chiffrée (http) : évite d'y saisir des mots de passe" : ""; lock.setAttribute("aria-label", lock.title); };
  setLock(url);
  // Favoris : localStorage « nova.fav.<id> » (mémoire seule pour Tor)
  const FK = "nova.fav." + id;
  const favs = () => { if (needsTor) return (memFav[id] = memFav[id] || []); try { return JSON.parse(localStorage.getItem(FK) || "[]"); } catch { return []; } };
  const saveFavs = (a) => { if (needsTor) { memFav[id] = a; return; } try { localStorage.setItem(FK, JSON.stringify(a.slice(0, 200))); } catch { ctx.toast("Impossible d'enregistrer les favoris"); } };
  const isFav = (u) => favs().some((x) => x.url === u);
  const favBtn = h("button", { class: "btn sm", title: "Ajouter aux favoris (⌘D)", onclick: () => toggleFav() }, "☆");
  const refreshFav = () => { const f = isFav(cur.url || url); favBtn.textContent = f ? "★" : "☆"; favBtn.title = favBtn.ariaLabel = f ? "Retirer des favoris (⌘D)" : "Ajouter aux favoris (⌘D)"; favBtn.setAttribute("aria-label", favBtn.title); };
  const toggleFav = () => { const u = cur.url || url; if (!/^https?:/i.test(u)) return; const a = favs(); const i = a.findIndex((x) => x.url === u); if (i >= 0) { a.splice(i, 1); ctx.toast("Favori retiré"); } else { a.unshift({ url: u, title: cur.title || "", at: Date.now() }); ctx.toast("Ajouté aux favoris"); } saveFavs(a); refreshFav(); if (panelOpen === "fav") renderPanel("fav"); };
  // Bandeau d'état (hors connexion, erreur de chargement, chargement lent) + barre de progression
  const status = h("div", { class: "glass row", role: "status", "aria-live": "polite", hidden: true, style: "padding:8px 12px;border-radius:14px" });
  const retryBtn = h("button", { class: "btn sm primary", onclick: () => web.nav(popBtn.hidden ? id : id + ".pop", "reload") }, "Réessayer");
  const statusMsg = h("span", {});
  status.append(statusMsg, retryBtn);
  const showStatus = (t, retry = true) => { statusMsg.textContent = t; retryBtn.hidden = !retry; status.hidden = false; };
  const prog = h("div", { style: "height:3px;width:0;background:var(--accent,#4cc9ff);border-radius:2px;opacity:0;transition:width .3s,opacity .3s" });
  let slowT = 0, errMsg = "";
  const refreshStatus = () => { if (!navigator.onLine) return showStatus("Hors connexion : vérifie ta connexion Internet.", false); if (errMsg) return showStatus("Impossible de charger cette page : " + errMsg); status.hidden = true; };
  const setLoading = (on) => { clearTimeout(slowT);
    if (on) { prog.style.opacity = "1"; prog.style.width = "70%"; slowT = setTimeout(() => { if (!errMsg && navigator.onLine) showStatus("Chargement lent… la page ne répond pas encore."); }, 20000); }
    else { prog.style.width = "100%"; setTimeout(() => { prog.style.opacity = "0"; prog.style.width = "0"; }, 350); } };
  const onOff = () => { refreshStatus(); }; window.addEventListener("online", onOff); window.addEventListener("offline", onOff); ctx.onLeave(() => { window.removeEventListener("online", onOff); window.removeEventListener("offline", onOff); clearTimeout(slowT); });
  const btn = (label, icon, f, extra = "") => h("button", { class: "btn sm " + extra, title: label, "aria-label": label, onclick: f, html: ic(icon, 16) });
  const askPage = async (prompt) => {
    const t = await web.text(id); if (!t) { ctx.toast("Impossible de lire la page (encore en chargement ?)"); return; }
    ctx.go("chat"); ctx.A.send(prompt + "\n\nPage : " + (cur.title || cur.url) + " (" + cur.url + ")\n\n" + t.slice(0, 9000), { voice: ctx.st.settings.voice_enabled });
  };
  const q = h("input", { placeholder: "Poser une question sur cette page…", style: "flex:1;min-width:220px" });
  q.onkeydown = (e) => { if (e.key === "Enter" && q.value.trim()) { askPage("Réponds à cette question en t'appuyant uniquement sur la page ci-dessous : " + q.value); q.value = ""; } };
  const tb = (label, f, extra = "") => h("button", { class: "btn sm " + extra, title: label, "aria-label": label, onclick: f }, label);
  // Document ouvert « dans une nouvelle fenêtre » : il s'affiche par-dessus le volet ; ce bouton le ferme et rend la boîte d'origine.
  const popBtn = tb("✕ Fermer le document", () => { web.close(id + ".pop"); popBtn.hidden = true; setTimeout(() => web.move(id, rectOf(slot)), 50); }, "primary"); popBtn.hidden = true;
  const fsBtn = tb("⤢ Plein écran", () => { window.dispatchEvent(new Event("nova:togglefs")); setTimeout(() => { try { fit(); } catch {} }, 120); setTimeout(() => { try { fit(); } catch {} }, 400); });
  const fsLab = () => { fsBtn.textContent = document.body.classList.contains("webfs") ? "⤡ Réduire" : "⤢ Plein écran"; };
  fsLab(); window.addEventListener("resize", fsLab); ctx.onLeave(() => window.removeEventListener("resize", fsLab));
  // Panneaux Historique / Favoris dans la zone du volet (le volet natif est masqué pendant l'affichage)
  let panelOpen = null;
  const closePanel = () => { panelOpen = null; slot.replaceChildren(); slot.style.display = "grid"; web.show(id, cur.url || url, rectOf(slot)); };
  const renderPanel = (kind, filter = "") => {
    const isH = kind === "hist"; const all = isH ? hist() : favs(); const f = filter.trim().toLowerCase();
    const a = f ? all.filter((x) => ((x.title || "") + " " + x.url).toLowerCase().includes(f)) : all;
    const search = h("input", { placeholder: "Filtrer…", value: filter, "aria-label": "Filtrer la liste", style: "min-width:160px" });
    search.oninput = () => { renderPanel(kind, search.value); const n = slot.querySelector("input"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } };
    const open = (x) => { panelOpen = null; slot.replaceChildren(); slot.style.display = "grid"; web.show(id, x.url, rectOf(slot)); web.nav(id, "go", x.url); };
    const rows = a.length ? a.map((x) => { const r = h("div", { class: "row", tabindex: "0", role: "button", "aria-label": "Ouvrir " + (x.title || x.url), style: "padding:6px 0;border-bottom:1px solid var(--line,#ffffff22);cursor:pointer", onclick: () => open(x) },
        isH ? h("span", { class: "muted", style: "min-width:92px" }, new Date(x.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })) : null,
        h("span", {}, x.title || x.url), h("span", { class: "muted", style: "margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40%;flex:1" }, x.url),
        h("button", { class: "btn sm", title: "Supprimer", "aria-label": "Supprimer cette entrée", onclick: (e) => { e.stopPropagation(); const cur2 = isH ? hist() : favs(); const i = cur2.findIndex((y) => y.url === x.url && y.at === x.at); if (i >= 0) cur2.splice(i, 1); isH ? saveHist(cur2) : saveFavs(cur2); refreshFav(); renderPanel(kind, search.value); } }, "✕"));
        r.onkeydown = (e) => { if (e.key === "Enter") open(x); }; return r; })
      : [h("div", { class: "muted" }, f ? "Aucun résultat." : isH ? "Aucune page consultée pour l'instant." : "Aucun favori. Clique sur ☆ pour ajouter la page courante.")];
    const list = h("div", { style: "width:100%;height:100%;overflow:auto;padding:14px;text-align:left" },
      h("div", { class: "row", style: "margin-bottom:10px;flex-wrap:wrap" }, h("b", {}, (isH ? "Pages consultées" + (needsTor ? " (mémoire seulement : effacé à la fermeture de Nova)" : "") : "Favoris" + (needsTor ? " (mémoire seulement)" : "")) + " · " + all.length), search,
        all.length ? h("button", { class: "btn sm", onclick: () => { if (!confirm(isH ? "Effacer tout l'historique ?" : "Supprimer tous les favoris ?")) return; isH ? saveHist([]) : saveFavs([]); refreshFav(); renderPanel(kind); } }, isH ? "Effacer l'historique" : "Tout supprimer") : null,
        h("button", { class: "btn sm", onclick: closePanel }, "Fermer (Échap)")), rows);
    slot.style.display = "block"; slot.replaceChildren(list);
  };
  const togglePanel = (kind) => { if (panelOpen === kind) return closePanel(); if (!panelOpen) web.hideAll(); panelOpen = kind; renderPanel(kind); };
  const histBtn = tb("🕘 Historique", () => togglePanel("hist"));
  const favListBtn = tb("⭐ Favoris", () => togglePanel("fav"));
  // Raccourcis clavier (⌘/Ctrl) : L adresse, D favori, R recharger, [ ] précédent/suivant, Échap ferme le panneau
  const nv = (a) => web.nav(popBtn.hidden ? id : id + ".pop", a);
  const keys = (e) => { const m = e.metaKey || e.ctrlKey; if (e.key === "Escape" && panelOpen) { closePanel(); return; } if (!m) return;
    if (e.key === "l") { e.preventDefault(); urlIn.focus(); } else if (e.key === "d") { e.preventDefault(); toggleFav(); } else if (e.key === "r") { e.preventDefault(); nv("reload"); } else if (e.key === "[") { e.preventDefault(); nv("back"); } else if (e.key === "]") { e.preventDefault(); nv("forward"); } };
  window.addEventListener("keydown", keys); ctx.onLeave(() => window.removeEventListener("keydown", keys));
  const ib = (label, icon, f, extra = "") => h("button", { class: "btn sm ibtn " + extra, title: label, "aria-label": label, onclick: f }, label);
  const engSel = h("select", { "aria-label": "Moteur de recherche", title: "Moteur de recherche utilisé quand tu tapes des mots dans la barre", class: "engsel" }, ...ENGINES.map((e) => h("option", { value: e.id }, e.n)));
  engSel.value = eng; engSel.onchange = () => { eng = engSel.value; if (needsTor) engMem = eng; else { try { localStorage.setItem("nova.eng." + id, eng); } catch {} } ctx.toast("Moteur : " + (ENGINES.find((e) => e.id === eng) || {}).n); };
  const moreBtn = tb("⋯", () => { more.hidden = !more.hidden; }); moreBtn.title = "Plus : historique, favoris, plein écran, accueil";
  const more = h("div", { class: "row", hidden: true, style: "gap:6px;flex-wrap:wrap;padding:2px 4px" }, popBtn, fsBtn, histBtn, favListBtn, tb("⌂ Accueil", () => { web.close(id + ".pop"); popBtn.hidden = true; if (needsTor) goHome(); else web.nav(id, "go", url); more.hidden = true; }));
  const bar = h("div", { class: "glass row webbar", style: "padding:4px 8px;border-radius:14px;flex-wrap:nowrap;gap:6px" },
    tb("←", () => { if (!popBtn.hidden) { web.nav(id + ".pop", "back"); } else web.nav(id, "back"); }), tb("→", () => web.nav(popBtn.hidden ? id : id + ".pop", "forward")), tb("↻", () => web.nav(popBtn.hidden ? id : id + ".pop", "reload")),
    lock, urlIn, (id === "browser" || id === "tor") ? engSel : null, h("button", { class: "btn sm primary", onclick: go }, "Aller"), favBtn, moreBtn,
    ai ? [h("button", { class: "btn sm", onclick: () => askPage("Résume cette page en points clés, fidèlement, sans rien inventer.") }, "Résumer"), h("button", { class: "btn sm", onclick: () => askPage("Extrais les informations importantes et les actions à entreprendre sur cette page.") }, "Points d'action")] : null);
  [["←", "Page précédente"], ["→", "Page suivante"], ["↻", "Recharger"]].forEach(([t, l], i) => { const b = bar.children[i]; b.title = l; b.setAttribute("aria-label", l); });
  el.append(bar, more, prog, status);
  if (ai) el.append(h("div", { class: "row askrow" }, q, h("span", { class: "muted" }, "Nova lit la page seulement quand tu cliques.")));
  el.append(slot);
  if (!isNative()) {
    slot.append(h("div", { style: "text-align:center;max-width:520px;padding:24px" }, h("h2", {}, title + " — volet natif"), h("div", { class: "muted" }, "Ce volet est une vraie fenêtre web intégrée à l'application Mac Nova (session conservée, aucun lien externe). Tu es ici dans un navigateur de test, où macOS ne peut pas l'incruster. Ouvre l'app Nova.app pour l'utiliser.")));
    return;
  }
  slot.append(h("div", { class: "muted" }, "Chargement de " + title + "…"));
  // Le volet occupe TOUT l'espace libre : du bas de la barre d'adresse jusqu'au dock (recalculé à chaque redimensionnement).
  const fit = () => { try { const r = slot.getBoundingClientRect(); const dk = document.getElementById("dock"); const lim = dk && dk.getBoundingClientRect().height ? dk.getBoundingClientRect().top - 12 : innerHeight - 14; slot.style.height = Math.max(300, Math.floor(lim - r.top)) + "px"; web.move(id, rectOf(slot)); } catch {} };
  const roFit = new ResizeObserver(fit); roFit.observe(el); window.addEventListener("resize", fit); setTimeout(fit, 60); setTimeout(fit, 400);
  const place = async () => { let u = url; if (needsTor) { try { u = homeUrl(await (await fetch("tor-home.html")).text()); } catch {} } web.show(id, u, rectOf(slot)); [250, 800, 2000, 4500].forEach((ms) => setTimeout(() => { if (slot.isConnected) web.move(id, rectOf(slot)); }, ms)); };
  if (needsTor) {   // Tor : on démarre tor, on attend la connexion au réseau (100 %), puis seulement on ouvre le volet
    let shown = false; const msg = (t) => { if (!shown) slot.replaceChildren(h("div", { style: "text-align:center;max-width:560px;padding:24px" }, h("h2", {}, "Navigateur Tor"), h("div", { class: "muted" }, t))); };
    msg("Démarrage de Tor…");
    const offT = tor.on((st) => { if (shown) return;
      if (!st.installed && !st.running) return msg("Tor n'est pas installé sur ce Mac. Installe « Tor Browser » depuis torproject.org (ou « brew install tor ») : Nova repère tout seul le moteur Tor et le démarre, puis rouvre cet onglet.");
      if (st.ready || (st.running && st.pct >= 100)) { shown = true; slot.replaceChildren(); place(); return; }
      msg("Connexion au réseau Tor… " + (st.pct || 0) + " %"); });
    ctx.onLeave(() => offT()); tor.start(); const iv = setInterval(() => { if (shown) return clearInterval(iv); tor.status(); }, 1500); ctx.onLeave(() => clearInterval(iv));
  } else requestAnimationFrame(place); const ro = new ResizeObserver(() => web.move(id, rectOf(slot))); ro.observe(slot); const sc = () => web.move(id, rectOf(slot)); document.getElementById("view").addEventListener("scroll", sc, { passive: true }); window.addEventListener("resize", sc);
  const off = onNav((st) => { if (st.id === id + ".pop") { popBtn.hidden = !!st.closed; return; } if (st.id !== id) return; cur = Object.assign({}, cur, st); if (document.activeElement !== urlIn && st.url) urlIn.value = /^data:/.test(st.url) ? "" : st.url; if (st.url) { if (!/^data:/.test(st.url)) record(st.url, st.title); setLock(st.url); refreshFav(); }
    errMsg = st.error ? (typeof st.error === "string" ? st.error : "erreur réseau ou site indisponible") : ""; setLoading(!!st.loading); refreshStatus(); });
  refreshStatus(); refreshFav();
  ctx.onLeave(() => { off(); ro.disconnect(); roFit.disconnect(); window.removeEventListener("resize", fit); window.removeEventListener("resize", sc); });
}

const navigateur = { id: "navigateur", title: "Navigateur", desc: "Web intégré + IA qui lit la page", icon: "search", native: true, async render(el, ctx) { pane(ctx, el, { id: "browser", url: "https://duckduckgo.com", title: "Navigateur", ai: true }); } };
const torb = { id: "tor", title: "Navigateur Tor", desc: "Web anonyme (réseau Tor), dans l'app", icon: "search", native: true, async render(el, ctx) { pane(ctx, el, { id: "tor", url: "https://duckduckgo.com/", title: "Navigateur Tor", ai: false, needsTor: true }); } };
const whatsapp = { id: "whatsapp", title: "WhatsApp", desc: "Ta messagerie, dans l'app", icon: "chat", native: true, async render(el, ctx) { pane(ctx, el, { id: "wa", url: "https://web.whatsapp.com", title: "WhatsApp", ai: true }); } };
const telegram = { id: "telegram", title: "Telegram", desc: "Ta messagerie, dans l'app", icon: "send", native: true, async render(el, ctx) { pane(ctx, el, { id: "tg", url: "https://web.telegram.org/k/", title: "Telegram", ai: true }); } };
const facebook = { id: "facebook", title: "Facebook", desc: "Ton fil, dans l'app", icon: "talk", native: true, async render(el, ctx) { pane(ctx, el, { id: "fb", url: "https://www.facebook.com", title: "Facebook", ai: true }); } };
const gmail = { id: "gmail", title: "Gmail", desc: "Ta boîte Gmail, dans l'app", icon: "mail", native: true, async render(el, ctx) { pane(ctx, el, { id: "gm", url: "https://mail.google.com/mail/u/0/", title: "Gmail", ai: true }); } };
const outlook = { id: "outlook", title: "Outlook", desc: "Ta boîte Outlook, dans l'app", icon: "mail", native: true, async render(el, ctx) { pane(ctx, el, { id: "ol", url: "https://outlook.office.com/mail/", title: "Outlook", ai: true }); } };
const teams = { id: "teams", title: "Teams", desc: "Réunions et messages, dans l'app", icon: "council", native: true, async render(el, ctx) { pane(ctx, el, { id: "tm", url: "https://teams.microsoft.com", title: "Teams", ai: true }); } };
export const web4 = [navigateur, torb, gmail, outlook, teams, whatsapp, telegram, facebook];
