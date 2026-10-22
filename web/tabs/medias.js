import { api, esc, h, safeUrl } from "../core.js";
import { ic } from "../icons.js";

/* ── Utilitaires locaux : stockage tolérant (jamais bloquant), favoris/récents, lecteur commun ── */
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const show = (n, on) => { n.style.display = on ? "" : "none"; };
const errBox = (msg, retry) => h("div", { class: "card err", role: "alert" }, msg, retry ? [" ", h("button", { class: "btn sm", onclick: retry }, "Réessayer")] : null);
const loadBox = (t = "Chargement…") => h("div", { class: "card muted", role: "status" }, t);
const getFavs = (k) => lsGet("nova_fav_" + k, []);
const toggleFav = (k, it) => { let f = getFavs(k); const had = f.some((x) => x.id === it.id); f = had ? f.filter((x) => x.id !== it.id) : [it, ...f].slice(0, 80); lsSet("nova_fav_" + k, f); return !had; };
const pushRecent = (k, it) => lsSet("nova_rec_" + k, [it, ...lsGet("nova_rec_" + k, []).filter((x) => x.id !== it.id)].slice(0, 12));
const getVol = () => { const v = Number(lsGet("nova_vol", 0.8)); return isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8; };
const fmtT = (s) => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60), r = s % 60, hh = Math.floor(m / 60); return (hh ? hh + ":" + String(m % 60).padStart(2, "0") : m) + ":" + String(r).padStart(2, "0"); };
const imgOk = (u) => (/^https?:\/\//i.test(String(u || "")) ? u : "");

/* Lecteur audio commun (radio, podcasts, relaxation) : pause/reprise, volume mémorisé, position, état, erreur + réessai / suivante. */
let lastErr = "", lastTry = null, syncBar = null;
async function playAudio(ctx, it, kind, opts = {}) {
  lastErr = ""; lastTry = { it, kind, retry: () => playAudio(ctx, it, kind, opts), next: opts.next || null };
  const url = safeUrl(it.url); if (url === "#") { lastErr = "Adresse du flux invalide : " + it.name; syncBar && syncBar(); return false; }
  const ok = await ctx.player.play(url, it.title || it.name); try { ctx.player.el.volume = getVol(); } catch {}
  if (ok) { if (kind) pushRecent(kind, it); } else lastErr = "Flux indisponible : " + (it.title || it.name);
  syncBar && syncBar(); return ok;
}
async function playChain(ctx, list, i, kind, tries = 0) {
  const it = list[i], next = list.length > 1 ? () => playChain(ctx, list, (i + 1) % list.length, kind) : null;
  const ok = await playAudio(ctx, it, kind, { next });
  if (!ok && next && tries < 3) { ctx.toast("« " + it.name + " » indisponible — j'essaie la suivante"); return playChain(ctx, list, (i + 1) % list.length, kind, tries + 1); }
  if (!ok) ctx.toast("Flux indisponible : " + it.name);
  return ok;
}
function playerBar(ctx) {
  const p = ctx.player, a = p.el; try { a.volume = getVol(); } catch {}
  const dot = h("span", { class: "dot sans_cle", "aria-hidden": "true" }), ttl = h("b", {}, "Rien en lecture"), st = h("span", { class: "muted", role: "status", "aria-live": "polite" }), tm = h("span", { class: "muted" });
  const pp = h("button", { class: "btn sm", onclick: () => { if (!a.getAttribute("src")) return; a.paused ? a.play().catch(() => {}) : a.pause(); } }, "Pause");
  const stop = h("button", { class: "btn sm", onclick: () => { lastErr = ""; p.stop(); sync(); } }, "Arrêter");
  const retry = h("button", { class: "btn sm primary", onclick: () => lastTry && lastTry.retry() }, "Réessayer"), next = h("button", { class: "btn sm", onclick: () => lastTry && lastTry.next && lastTry.next() }, "Suivante");
  const vol = h("input", { type: "range", min: 0, max: 100, value: Math.round(getVol() * 100), "aria-label": "Volume", title: "Volume", style: "width:110px" });
  const seek = h("input", { type: "range", min: 0, max: 1000, value: 0, "aria-label": "Position de lecture", style: "flex:1;min-width:120px" });
  vol.oninput = () => { const v = vol.value / 100; try { a.volume = v; } catch {} lsSet("nova_vol", v); };
  seek.oninput = () => { if (isFinite(a.duration) && a.duration > 0) a.currentTime = a.duration * seek.value / 1000; };
  const bar = h("div", { class: "card row", role: "region", "aria-label": "Lecteur audio", style: "flex-wrap:wrap" }, dot, ttl, st, h("span", { class: "spacer" }), seek, tm, pp, next, retry, stop, h("label", { class: "row", style: "gap:4px" }, h("span", { class: "muted" }, "Volume"), vol));
  function sync() {
    const on = !!(p.title && a.getAttribute("src")), fin = isFinite(a.duration) && a.duration > 0;
    dot.className = "dot " + (on && !a.paused && !lastErr ? "ok" : "sans_cle"); ttl.textContent = p.title || "Rien en lecture";
    st.textContent = lastErr || (!on ? "" : a.paused ? "En pause" : a.readyState < 3 ? "Mise en mémoire tampon…" : "En lecture"); st.className = lastErr ? "err" : "muted";
    show(pp, on); show(stop, on || !!lastErr); show(retry, !!lastErr && !!lastTry); show(next, !!(lastTry && lastTry.next) && (on || !!lastErr)); show(seek, on && fin); show(tm, on && fin); pp.textContent = a.paused ? "Lecture" : "Pause";
    if (on && fin) { seek.value = Math.round(a.currentTime / a.duration * 1000); tm.textContent = fmtT(a.currentTime) + " / " + fmtT(a.duration); }
    document.querySelectorAll("[data-u]").forEach((t) => { const c = t.querySelector(".nowchip"); if (c) c.style.display = t.dataset.u === p.url && on && !a.paused ? "" : "none"; });
  }
  const evs = ["play", "pause", "playing", "waiting", "error", "ended", "timeupdate", "emptied", "loadedmetadata"];
  const fn = (e) => { if (bar.isConnected) bar._seen = true; else if (bar._seen) { evs.forEach((x) => a.removeEventListener(x, fn)); if (syncBar === sync) syncBar = null; return; } if (e.type === "error" && a.getAttribute("src")) lastErr = "Flux interrompu : " + (p.title || "lecture"); if (e.type === "playing") lastErr = ""; sync(); };
  evs.forEach((x) => a.addEventListener(x, fn)); syncBar = sync; sync(); return bar;
}
/* Tuile audio : écouter + favori ; « list » sert à enchaîner sur la suivante si le flux ne répond pas. */
function audioTile(ctx, it, kind, list, onFav) {
  const on = getFavs(kind).some((x) => x.id === it.id);
  const fav = h("button", { class: "btn sm", "aria-pressed": on ? "true" : "false", "aria-label": (on ? "Retirer des favoris : " : "Ajouter aux favoris : ") + it.name, title: "Favori", onclick: () => { const n = toggleFav(kind, it); fav.textContent = n ? "★" : "☆"; fav.setAttribute("aria-pressed", n ? "true" : "false"); fav.setAttribute("aria-label", (n ? "Retirer des favoris : " : "Ajouter aux favoris : ") + it.name); onFav && onFav(); } }, on ? "★" : "☆");
  return h("div", { class: "card tile", "data-u": it.url }, h("b", {}, it.name), h("div", { class: "muted" }, it.sub || ""), h("div", { class: "row", style: "margin-top:6px" }, h("button", { class: "btn sm primary", onclick: () => playChain(ctx, list, Math.max(0, list.indexOf(it)), kind) }, "Écouter"), fav, h("span", { class: "chip good nowchip", style: "display:none" }, "en lecture")));
}
const act = (n, fn, label) => { n.setAttribute("role", "button"); n.tabIndex = 0; if (label) n.setAttribute("aria-label", label); n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(e); } }); n.addEventListener("click", fn); return n; };

const RADIOS = [
  ["Horizon FM 104.4 Ouaga", "Burkina · Ouagadougou", "https://stream.zeno.fm/0945crn4bf9uv"], ["Horizon FM Koudougou", "Burkina · musique africaine", "https://stream.zeno.fm/s2ypmeg0cf9uv"],
  ["Radio Balafon 102.7", "Burkina · Bobo-Dioulasso", "https://stream.zeno.fm/v3ddfda0cf9uv"],
  ["France Info", "Info en continu", "https://icecast.radiofrance.fr/franceinfo-midfi.mp3"], ["France Inter", "Généraliste", "https://icecast.radiofrance.fr/franceinter-midfi.mp3"],
  ["RFI Monde", "Actualité internationale", "https://rfimonde64k.ice.infomaniak.ch/rfimonde-64.mp3"], ["France Musique", "Classique & jazz", "https://icecast.radiofrance.fr/francemusique-midfi.mp3"],
  ["FIP", "Éclectique, sans pub", "https://icecast.radiofrance.fr/fip-midfi.mp3"], ["Mouv'", "Hip-hop & urbain", "https://icecast.radiofrance.fr/mouv-midfi.mp3"],
  ["SomaFM Groove Salad", "Chill / downtempo", "https://ice1.somafm.com/groovesalad-128-mp3"], ["SomaFM Drone Zone", "Ambiant profond", "https://ice1.somafm.com/dronezone-128-mp3"], ["SomaFM Deep Space One", "Ambiant spatial", "https://ice1.somafm.com/deepspaceone-128-mp3"],
];

const CC = [["BF", "Burkina Faso"], ["CI", "Côte d'Ivoire"], ["ML", "Mali"], ["SN", "Sénégal"], ["NE", "Niger"], ["TG", "Togo"], ["BJ", "Bénin"], ["GH", "Ghana"], ["NG", "Nigeria"], ["GN", "Guinée"], ["CM", "Cameroun"], ["GA", "Gabon"], ["CG", "Congo"], ["CD", "RD Congo"], ["MA", "Maroc"], ["DZ", "Algérie"], ["TN", "Tunisie"], ["EG", "Égypte"], ["ZA", "Afrique du Sud"], ["KE", "Kenya"], ["FR", "France"], ["BE", "Belgique"], ["CH", "Suisse"], ["CA", "Canada"], ["GB", "Royaume-Uni"], ["US", "États-Unis"], ["BR", "Brésil"], ["DE", "Allemagne"], ["ES", "Espagne"], ["IT", "Italie"], ["JP", "Japon"]];
const radio = { id: "radio", title: "Radio", desc: "Flux en direct", icon: "mic", async render(el, ctx) {
  const country = h("select", { "aria-label": "Pays" }, h("option", { value: "" }, "Tous les pays"), ...CC.map(([c, n]) => h("option", { value: c, selected: c === "BF" }, n)));
  const name = h("input", { type: "search", placeholder: "Nom de la radio (ex. Omega, Savane, RTB, Ouaga FM…)", "aria-label": "Nom de la radio", style: "flex:1;min-width:240px" });
  const results = h("div", { class: "grid g3" }); let offset = 0, found = []; const more = h("button", { class: "btn", style: "margin-top:10px", onclick: () => search(true) }, "Voir d'autres radios");
  const status = h("div", { class: "muted", role: "status", "aria-live": "polite" });
  const favBox = h("div"), recBox = h("div");
  const starters = RADIOS.map(([n, d, u]) => ({ id: u, name: n, sub: d, url: u }));
  const paintLists = () => { const f = getFavs("radio"), r = lsGet("nova_rec_radio", []);
    favBox.replaceChildren(h("h2", {}, "★ Mes favoris"), f.length ? h("div", { class: "grid g3" }, ...f.map((s) => audioTile(ctx, s, "radio", f, paintLists))) : h("div", { class: "muted" }, "Aucun favori : clique sur ☆ sur une radio pour la retrouver ici."));
    recBox.replaceChildren(h("h2", {}, "Écoutées récemment"), r.length ? h("div", { class: "grid g3" }, ...r.slice(0, 6).map((s) => audioTile(ctx, s, "radio", r, paintLists))) : h("div", { class: "muted" }, "Rien écouté pour l'instant.")); syncBar && syncBar(); };
  async function search(append = false) {
    if (!append) { offset = 0; found = []; results.replaceChildren(); } status.textContent = "Recherche dans l'annuaire mondial…";
    try { const r = await api.get("/api/radio/search?country=" + encodeURIComponent(country.value) + "&name=" + encodeURIComponent(name.value.trim()) + "&limit=60&offset=" + offset);
      if (r.error) { status.className = "err"; status.textContent = r.error; return; } status.className = "muted"; offset += 60;
      const seen = new Set(found.map((x) => x.url));
      for (const s of r.items || []) { if (seen.has(s.url)) continue; const it = { id: s.url, name: s.name, sub: [s.country, (s.tags || "").split(",").slice(0, 3).join(", "), s.bitrate ? s.bitrate + " kb/s" : ""].filter(Boolean).join(" · "), url: s.url }; found.push(it); results.append(audioTile(ctx, it, "radio", found, paintLists)); }
      status.textContent = found.length ? found.length + " radio(s) — « Écouter » pour lancer, ☆ pour garder en favori." : "Aucune radio trouvée : essaie un autre nom ou « Tous les pays ».";
      syncBar && syncBar();
    } catch (e) { status.className = "err"; status.textContent = "Annuaire injoignable : " + (e && e.message || e) + " — la sélection de départ ci-dessous reste disponible."; }
  }
  country.onchange = () => search(); name.onkeydown = (e) => { if (e.key === "Enter") search(); };
  const finder = h("div", { class: "card grid" }, h("h2", {}, "Trouver une radio"), h("div", { class: "row" }, country, name, h("button", { class: "btn primary", onclick: () => search() }, "Chercher"), h("button", { class: "btn", title: "Recharger la liste du pays", onclick: () => search() }, "Actualiser")), status, results, more);
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Radio en ligne"), h("div", { class: "muted" }, "Annuaire mondial : choisis un pays, tape un nom, ou actualise pour en découvrir. Lecture dans Nova ; si un flux ne répond pas, Nova passe à la suivante. La lecture continue quand tu changes d'onglet (mini-lecteur en haut).")), playerBar(ctx),
    favBox, recBox, finder, h("h2", {}, "Sélection de départ"), h("div", { class: "grid g3" }, ...starters.map((s) => audioTile(ctx, s, "radio", starters, paintLists))));
  paintLists(); search();
} };

const podcasts = { id: "podcasts", title: "Podcasts", desc: "Recherche + épisodes", icon: "talk", async render(el, ctx) {
  const q = h("input", { type: "search", placeholder: "Chercher un podcast (ex. « RFI Afrique », « économie »)…", "aria-label": "Chercher un podcast" }), shows = h("div", { class: "grid g3" }), eps = h("div", { class: "card", style: "display:none" }), favBox = h("div"), recBox = h("div");
  const pos = lsGet("nova_pod_pos", {}); let curEp = "", lastSave = 0;
  const onTime = () => { if (!curEp || ctx.player.url !== curEp || Date.now() - lastSave < 5000) return; lastSave = Date.now(); const t = ctx.player.el.currentTime; if (t > 5) { pos[curEp] = Math.floor(t); const ks = Object.keys(pos); if (ks.length > 200) delete pos[ks[0]]; lsSet("nova_pod_pos", pos); } };
  ctx.player.el.addEventListener("timeupdate", onTime); ctx.onLeave && ctx.onLeave(() => ctx.player.el.removeEventListener("timeupdate", onTime));
  const showTile = (s) => { const on = getFavs("podshow").some((x) => x.id === s.feed); const art = imgOk(s.art);
    const fav = h("button", { class: "btn sm", "aria-pressed": on ? "true" : "false", "aria-label": (on ? "Retirer des favoris : " : "Ajouter aux favoris : ") + s.name, onclick: () => { const n = toggleFav("podshow", { id: s.feed, name: s.name, artist: s.artist, feed: s.feed, art: s.art }); fav.textContent = n ? "★" : "☆"; fav.setAttribute("aria-pressed", n ? "true" : "false"); paintLists(); } }, on ? "★" : "☆");
    return h("div", { class: "card tile row" }, art ? h("img", { src: art, alt: "", width: 54, height: 54, style: "border-radius:10px" }) : null, h("div", { style: "flex:1" }, h("b", {}, s.name), h("div", { class: "muted" }, s.artist), h("div", { class: "row", style: "margin-top:6px" }, h("button", { class: "btn sm primary", onclick: () => openShow(s) }, "Épisodes"), fav))); };
  const paintLists = () => { const f = getFavs("podshow"), r = lsGet("nova_rec_podep", []);
    favBox.replaceChildren(h("h2", {}, "★ Mes podcasts"), f.length ? h("div", { class: "grid g3" }, ...f.map(showTile)) : h("div", { class: "muted" }, "Aucun favori : clique sur ☆ sur un podcast."));
    recBox.replaceChildren(h("h2", {}, "Épisodes récents"), r.length ? h("div", {}, ...r.slice(0, 6).map((e) => h("div", { class: "row", style: "padding:5px 0;border-top:1px solid var(--line)" }, h("button", { class: "btn sm primary", onclick: () => playEp(e, e.sub) }, pos[e.url] ? "Reprendre " + fmtT(pos[e.url]) : "Lire"), h("span", { style: "flex:1" }, e.name, h("span", { class: "muted" }, " — " + (e.sub || "")))))) : h("div", { class: "muted" }, "Aucun épisode écouté pour l'instant.")); };
  const playEp = async (e, showName) => { curEp = safeUrl(e.url); const it = { id: e.url, name: e.name || e.title, sub: showName, url: e.url, title: (showName ? showName + " — " : "") + (e.name || e.title) };
    const ok = await playAudio(ctx, it, "podep"); if (ok && pos[e.url] > 10) { try { ctx.player.el.currentTime = pos[e.url]; ctx.toast("Reprise à " + fmtT(pos[e.url])); } catch {} } else if (!ok) ctx.toast("Épisode indisponible"); paintLists(); };
  const search = async () => { if (!q.value.trim()) { shows.replaceChildren(h("div", { class: "card muted" }, "Tape un nom de podcast ou un thème.")); return; } shows.replaceChildren(loadBox("Recherche…"));
    try { const r = await api.get("/api/podcast/search?q=" + encodeURIComponent(q.value)); shows.replaceChildren(...((r.items || []).length ? r.items.map(showTile) : [h("div", { class: "card muted" }, r.error || "Aucun résultat.")])); } catch (e) { shows.replaceChildren(errBox("Recherche indisponible : " + (e && e.message || e), search)); } };
  const openShow = async (s) => { eps.style.display = ""; eps.replaceChildren(loadBox("Lecture du flux…")); eps.scrollIntoView({ behavior: "smooth" });
    try { const r = await api.get("/api/podcast/episodes?feed=" + encodeURIComponent(s.feed)); if (r.error) { eps.replaceChildren(errBox(r.error, () => openShow(s))); return; }
      eps.replaceChildren(h("h2", {}, s.name), ...((r.items || []).length ? r.items.map((e) => h("div", { class: "row", style: "padding:7px 0;border-top:1px solid var(--line)" }, h("button", { class: "btn sm primary", "aria-label": "Lire " + e.title, onclick: () => playEp({ url: e.url, name: e.title }, s.name) }, pos[e.url] ? "Reprendre" : "Lire"), h("span", { style: "flex:1" }, e.title), h("span", { class: "muted" }, (e.duration || "") + " " + String(e.date || "").slice(0, 16)))) : [h("div", { class: "muted" }, "Ce flux ne contient aucun épisode lisible.")]));
    } catch (e) { eps.replaceChildren(errBox("Flux illisible : " + (e && e.message || e), () => openShow(s))); } };
  q.onkeydown = (e) => { if (e.key === "Enter") search(); };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Podcasts"), h("div", { class: "row" }, q, h("button", { class: "btn primary", onclick: search }, "Chercher"))), playerBar(ctx), favBox, recBox, shows, eps);
  paintLists();
} };

const TVC = [["bf", "Burkina Faso"], ["ml", "Mali"], ["ne", "Niger"], ["ci", "Côte d'Ivoire"], ["tg", "Togo"], ["bj", "Bénin"], ["cm", "Cameroun"], ["ga", "Gabon"], ["sn", "Sénégal"], ["gn", "Guinée"], ["cg", "Congo"], ["cd", "RD Congo"], ["ma", "Maroc"], ["dz", "Algérie"], ["tn", "Tunisie"], ["mg", "Madagascar"], ["fr", "France"], ["be", "Belgique"], ["ch", "Suisse"], ["ca", "Canada"], ["fra", "Toutes chaînes en français"]];
// Télé : un seul lecteur global qui continue en arrière-plan (mini-fenêtre flottante) quand on change d'onglet
let tvVideo = null, tvMini = null, tvName = "";
function tvEnsure(ctx) {
  if (tvVideo) return;
  tvVideo = h("video", { controls: true, autoplay: true, playsinline: true, style: "width:100%;height:100%;background:#000;display:block" });
  const bar = h("div", { style: "display:flex;gap:6px;align-items:center;padding:4px 8px;font-size:12px;cursor:move;background:rgba(0,0,0,.55);color:#fff" },
    h("span", { id: "tvminiName", style: "flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" }, ""),
    h("button", { class: "btn sm", title: "Revenir à la Télé", onclick: () => ctx.go("tv") }, "⤢"),
    h("button", { class: "btn sm", title: "Arrêter", onclick: () => tvStop() }, "✕"));
  tvMini = h("div", { style: "position:fixed;right:16px;bottom:16px;width:320px;aspect-ratio:16/9;z-index:9000;border-radius:12px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.5);display:none;background:#000;flex-direction:column" }, bar);
  let dx = 0, dy = 0, drag = false;
  bar.onmousedown = (e) => { if (e.target.tagName === "BUTTON") return; drag = true; const r = tvMini.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top; e.preventDefault(); };
  window.addEventListener("mousemove", (e) => { if (!drag) return; tvMini.style.left = (e.clientX - dx) + "px"; tvMini.style.top = (e.clientY - dy) + "px"; tvMini.style.right = "auto"; tvMini.style.bottom = "auto"; });
  window.addEventListener("mouseup", () => { drag = false; });
  document.body.append(tvMini);
}
function tvStop() { if (!tvVideo) return; try { tvVideo.pause(); tvVideo.removeAttribute("src"); tvVideo.load(); } catch {} tvName = ""; if (tvMini) tvMini.style.display = "none"; }
const tvActive = () => tvVideo && tvVideo.getAttribute("src") && !tvVideo.paused;
const TVF = [
  ["fav", "⭐ Favoris Burkina (RTB, BF1, Canal 3, 3TV, Burkina Info, Savane…)", [["bf", ""], ["fra", "RTB|BF ?1|Canal ?3|3 ?TV|Burkina|Savane|Impact|Filinfo"]]],
  ["canal", "Canal+ (toutes les chaînes)", [["fra", "Canal"]]],
  ["frall", "Toutes les chaînes françaises", [["fra", ""]]],
  ["ci", "Côte d'Ivoire (toutes)", [["ci", ""]]], ["ml", "Mali (toutes)", [["ml", ""]]], ["ne", "Niger (toutes)", [["ne", ""]]], ["cm", "Cameroun (toutes)", [["cm", ""]]], ["ga", "Gabon (toutes)", [["ga", ""]]], ["sn", "Sénégal (toutes)", [["sn", ""]]],
  ["news", "Actualités en français", [["fra", "News|Info|24|Euronews|BFM|CNews|LCI|Africanews|TV5"]]],
  ["div", "Divertissement", [["fra", "Entertainment|Comedy|Series|Divertissement|Kids|General"]]],
  ["mus", "Musique", [["fra", "Music|Musique|Trace|MCM|MTV|Clip|Rap|Hits"]]],
  ["film", "Films & séries", [["fra", "Movies|Cinema|Cinéma|Film|Série|Series|Ciné"]]],
];
const tv = { id: "tv", title: "Télé", desc: "Chaînes en direct (IPTV)", icon: "look", async render(el, ctx) {
  tvEnsure(ctx); try { tvVideo.volume = getVol(); } catch {} tvVideo.onvolumechange = () => lsSet("nova_vol", tvVideo.volume);
  const country = h("select", { "aria-label": "Pays ou groupe de chaînes" }, ...TVF.map(([c, n]) => h("option", { value: c }, n)), ...TVC.map(([c, n]) => h("option", { value: "c:" + c }, n + " (liste complète)")));
  try { const sv = localStorage.getItem("nova_tvc"); if (sv) country.value = sv; } catch {}
  const filter = h("input", { type: "search", placeholder: "Filtrer par nom (ex. RTB, Canal, TV5, France 24…)", "aria-label": "Filtrer les chaînes", style: "flex:1;min-width:220px" });
  const video = tvVideo;
  const stage = h("div", { class: "glass", style: "aspect-ratio:16/9;max-height:52vh;display:grid;place-items:center;overflow:hidden" }, h("div", { class: "muted" }, "Recherche des chaînes qui répondent…"));
  if (tvVideo.getAttribute("src")) { tvMini.style.display = "none"; stage.replaceChildren(video); }
  const list = h("div", { class: "grid g3" }), status = h("div", { class: "muted", role: "status", "aria-live": "polite" }), favBox = h("div"), recBox = h("div"); let all = [], tries = 0, cur = null;
  const retryB = h("button", { class: "btn", onclick: () => cur && play(cur, false, all) }, "Réessayer"), prevB = h("button", { class: "btn", "aria-label": "Chaîne précédente", onclick: () => step(-1) }, "◀"), nextB = h("button", { class: "btn", "aria-label": "Chaîne suivante", onclick: () => step(1) }, "▶");
  const vol = h("input", { type: "range", min: 0, max: 100, value: Math.round(getVol() * 100), "aria-label": "Volume", title: "Volume", style: "width:110px" }); vol.oninput = () => { try { tvVideo.volume = vol.value / 100; } catch {} lsSet("nova_vol", vol.value / 100); };
  const step = (d) => { if (!cur || !all.length) return; const i = all.indexOf(cur); play(all[((i < 0 ? 0 : i) + d + all.length) % all.length], false, all); };
  const chOf = (c) => ({ id: c.url, name: c.name, url: c.url, logo: c.logo || "", group: c.group || "" });
  const tile = (c, lst) => { const on = getFavs("tv").some((x) => x.id === c.url), logo = imgOk(c.logo);
    const fav = h("button", { class: "btn sm", "aria-pressed": on ? "true" : "false", "aria-label": (on ? "Retirer des favoris : " : "Ajouter aux favoris : ") + c.name, onclick: () => { const n = toggleFav("tv", chOf(c)); fav.textContent = n ? "★" : "☆"; fav.setAttribute("aria-pressed", n ? "true" : "false"); paintLists(); } }, on ? "★" : "☆");
    return h("div", { class: "card tile" }, h("div", { class: "row" }, logo ? h("img", { src: logo, alt: "", style: "width:34px;height:34px;object-fit:contain;border-radius:6px;background:#fff2", onerror: (e) => e.target.remove() }) : null, h("div", { style: "flex:1" }, h("b", {}, c.name), h("div", { class: "muted" }, c.group || ""))), h("div", { class: "row", style: "margin-top:6px" }, h("button", { class: "btn sm primary", "aria-label": "Regarder " + c.name, onclick: () => play(c, false, lst) }, "Regarder"), fav)); };
  const paintLists = () => { const f = getFavs("tv"), r = lsGet("nova_rec_tv", []);
    favBox.replaceChildren(h("h2", {}, "★ Mes chaînes"), f.length ? h("div", { class: "grid g3" }, ...f.map((c) => tile(c, f))) : h("div", { class: "muted" }, "Aucune chaîne favorite : clique sur ☆."));
    recBox.replaceChildren(h("h2", {}, "Regardées récemment"), r.length ? h("div", { class: "grid g3" }, ...r.slice(0, 6).map((c) => tile(c, r))) : h("div", { class: "muted" }, "Rien regardé pour l'instant.")); };
  const draw = () => { const q = filter.value.trim().toLowerCase(), v = all.filter((c) => !q || c.name.toLowerCase().includes(q)); list.replaceChildren(...(v.length ? v.map((c) => tile(c, all)) : [h("div", { class: "muted" }, all.length ? "Aucune chaîne ne correspond." : "")])); };
  function play(c, auto, lst) {
    lst = lst || all; cur = c; ctx.player.stop && ctx.player.stop(); stage.replaceChildren(video); tvName = c.name; const my = ++tries;
    video.onerror = () => { if (my !== tries) return; if (direct && video.src.indexOf("/api/tv/stream") >= 0) { video.src = direct; video.play().catch(() => {}); return; } const i = lst.indexOf(c); status.className = "err"; status.textContent = "« " + c.name + " » ne répond pas" + (auto !== false && i >= 0 && i + 1 < lst.length ? " — j'essaie la suivante…" : " — « Réessayer » ou choisis une autre chaîne."); if (auto !== false && i >= 0 && i + 1 < lst.length) setTimeout(() => play(lst[i + 1], true, lst), 400); };
    video.src = c.url; video.play().catch(() => {}); status.className = "muted"; status.textContent = "⏳ " + c.name + "…";
    let okp = false; const good = () => { if (!okp) { okp = true; pushRecent("tv", chOf(c)); paintLists(); } if (my === tries) { status.className = "muted"; status.textContent = "▶ " + c.name; } };
    video.onplaying = good; video.onloadeddata = good; video.oncanplay = good;
    const direct = (c.url.split("u=")[1] || "") ? decodeURIComponent(c.url.split("u=")[1]) : "";
    setTimeout(() => { if (my === tries && !okp && direct && video.src.indexOf("/api/tv/stream") >= 0) { status.textContent = "⏳ " + c.name + " (accès direct)…"; video.src = direct; video.play().catch(() => {}); } }, 12000);
    setTimeout(() => { if (my === tries && !okp) { const i = lst.indexOf(c); status.className = "err"; status.textContent = "« " + c.name + " » ne répond pas" + (auto !== false && i >= 0 && i + 1 < lst.length ? " — chaîne suivante…" : "."); if (auto !== false && i >= 0 && i + 1 < lst.length) play(lst[i + 1], true, lst); } }, 26000);
  }
  async function load(userAct) { status.className = "muted"; status.textContent = "Test des chaînes en cours (quelques secondes)…"; list.replaceChildren(); try { localStorage.setItem("nova_tvc", country.value); } catch {}
    try { const f = TVF.find((x) => x[0] === country.value), srcs = f ? f[2] : [[country.value.replace(/^c:/, ""), ""]];
      const rs = await Promise.all(srcs.map(([c, q]) => api.get("/api/tv/channels?country=" + c + (q ? "&q=" + encodeURIComponent(q) : "")).catch(() => ({ items: [], error: "Liste des chaînes injoignable" }))));
      const seen = new Set(); all = rs.flatMap((r) => r.items || []).filter((c) => { const k = c.name.toLowerCase().replace(/\s*\(.*?\)|\[.*?\]/g, "").trim(); if (seen.has(k)) return false; seen.add(k); return true; });
      if (!all.length) { const m = (rs.find((r) => r.error) || {}).error || "Aucune chaîne en ligne pour ce choix pour l'instant."; status.className = "err"; status.textContent = m; if (!tvActive()) stage.replaceChildren(h("div", { class: "muted" }, m + " Essaie « Actualiser » ou un autre pays.")); return; }
      status.textContent = all.length + " chaîne(s) en ligne (testées à l'instant)."; draw(); if (userAct || !tvActive()) play(all[0], true, all); } catch (e) { status.className = "err"; status.textContent = "Liste injoignable : " + (e && e.message || e); } }
  country.onchange = () => load(true); filter.oninput = draw;
  ctx.onLeave && ctx.onLeave(() => { if (tvActive()) { tvMini.append(video); tvMini.style.display = "flex"; const n = tvMini.querySelector("#tvminiName"); if (n) n.textContent = "▶ " + tvName; video.play().catch(() => {}); } });
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Télé en direct"), h("div", { class: "row" }, country, filter, h("button", { class: "btn", onclick: () => load(true) }, "Actualiser")), h("div", { class: "row", style: "margin-top:8px" }, prevB, nextB, retryB, h("label", { class: "row", style: "gap:4px" }, h("span", { class: "muted" }, "Volume"), vol)), status), stage, favBox, recBox, h("h2", {}, "Chaînes"), list);
  paintLists(); load();
} };
const video = { id: "video", title: "Vidéo", desc: "YouTube ou fichier local", icon: "look", async render(el, ctx) {
  const stage = h("div", { class: "glass", style: "aspect-ratio:16/9;max-height:60vh;display:grid;place-items:center;overflow:hidden" }, h("div", { class: "muted" }, "Colle un lien YouTube ou choisis un fichier vidéo."));
  const u = h("input", { placeholder: "https://www.youtube.com/watch?v=…  ou  identifiant de vidéo", "aria-label": "Lien YouTube", style: "flex:1;min-width:240px" }), ttl = h("input", { placeholder: "Titre (facultatif, pour les favoris)", "aria-label": "Titre", style: "width:220px" });
  const msg = h("div", { class: "muted", role: "status", "aria-live": "polite" }), favBox = h("div"), recBox = h("div"); let objUrl = null;
  const ytId = (v) => { const m = v.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || v.match(/^([\w-]{11})$/); return m && m[1]; };
  const row = (it, kind) => { const on = getFavs("vid").some((x) => x.id === it.id);
    return h("div", { class: "row", style: "padding:5px 0;border-top:1px solid var(--line)" }, h("button", { class: "btn sm primary", "aria-label": "Lire " + it.name, onclick: () => playId(it.id, it.name) }, "Lire"), h("span", { style: "flex:1" }, it.name),
      h("button", { class: "btn sm", "aria-pressed": on ? "true" : "false", "aria-label": (on ? "Retirer des favoris : " : "Ajouter aux favoris : ") + it.name, onclick: () => { toggleFav("vid", it); paintLists(); } }, on ? "★" : "☆")); };
  const paintLists = () => { const f = getFavs("vid"), r = lsGet("nova_rec_vid", []);
    favBox.replaceChildren(h("h2", {}, "★ Mes vidéos"), f.length ? h("div", {}, ...f.map((it) => row(it))) : h("div", { class: "muted" }, "Aucun favori."));
    recBox.replaceChildren(h("h2", {}, "Vues récemment"), r.length ? h("div", {}, ...r.map((it) => row(it))) : h("div", { class: "muted" }, "Aucune vidéo vue pour l'instant.")); };
  const playId = (id, name) => { try { ctx.player.stop(); } catch {} if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
    stage.replaceChildren(h("iframe", { src: "https://www.youtube-nocookie.com/embed/" + id + "?rel=0", title: "Lecteur YouTube : " + (name || id), style: "width:100%;height:100%;border:0", allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: "" }));
    msg.replaceChildren("Lecture de « " + (name || id) + " ». Si rien ne s'affiche, l'auteur a peut-être interdit l'intégration : ", h("a", { href: "https://www.youtube.com/watch?v=" + id, target: "_blank", rel: "noopener noreferrer", style: "color:var(--accent)" }, "ouvrir sur YouTube")); pushRecent("vid", { id, name: name || "YouTube " + id }); paintLists(); };
  const play = () => { const id = ytId(u.value.trim()); if (!id) { msg.className = "err"; msg.textContent = "Lien YouTube non reconnu : colle l'adresse complète ou l'identifiant de 11 caractères."; ctx.toast("Lien YouTube non reconnu"); return; } msg.className = "muted"; playId(id, ttl.value.trim()); };
  u.onkeydown = (e) => { if (e.key === "Enter") play(); };
  const f = h("input", { type: "file", accept: "video/*,audio/*", "aria-label": "Choisir un fichier vidéo ou audio local", onchange: (e) => { const file = e.target.files[0]; if (!file) return; try { ctx.player.stop(); } catch {} if (objUrl) URL.revokeObjectURL(objUrl); objUrl = URL.createObjectURL(file);
    const v = h("video", { src: objUrl, controls: true, autoplay: true, style: "width:100%;height:100%" }); try { v.volume = getVol(); } catch {} v.onvolumechange = () => lsSet("nova_vol", v.volume); v.onerror = () => { msg.className = "err"; msg.textContent = "Ce fichier ne peut pas être lu (format non pris en charge) : " + file.name; };
    msg.className = "muted"; msg.textContent = "Fichier local : " + file.name + " (non conservé dans les récents)."; stage.replaceChildren(v); } });
  ctx.onLeave && ctx.onLeave(() => { if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; } });
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Vidéo"), h("div", { class: "row" }, u, ttl, h("button", { class: "btn primary", onclick: play }, "Lire"), f), msg), stage, favBox, recBox);
  paintLists();
} };

// Relaxation : sons synthétisés en direct (aucun fichier, aucun réseau) + flux ambiants
let ac = null, noiseNodes = [];
function startNoise(kind, vol) {
  ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume();
  const len = ac.sampleRate * 4, buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else if (kind === "pink") { last = 0.97 * last + 0.03 * w; d[i] = last * 2.2; } else d[i] = w * 0.5; } }
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; const g = ac.createGain(); g.gain.value = vol; const f = ac.createBiquadFilter();
  if (kind === "rain") { f.type = "highpass"; f.frequency.value = 1400; } else if (kind === "ocean") { f.type = "lowpass"; f.frequency.value = 600; const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 0.35; lfo.connect(lg); lg.connect(g.gain); lfo.start(); noiseNodes.push(lfo); } else { f.type = "lowpass"; f.frequency.value = 9000; }
  src.connect(f); f.connect(g); g.connect(ac.destination); src.start(); noiseNodes.push(src, g); return g;
}
const stopNoise = () => { noiseNodes.forEach((n) => { try { n.stop ? n.stop() : n.disconnect(); } catch {} }); noiseNodes = []; };
let rlx = { name: "", end: 0, timer: null };
const relax = { id: "relaxation", title: "Relaxation", desc: "Sons apaisants, minuteur", icon: "pulse", async render(el, ctx) {
  const vol = h("input", { type: "range", min: 5, max: 100, value: Math.round(lsGet("nova_relax_vol", 40)), "aria-label": "Volume des sons" }); const st = h("div", { class: "muted", role: "status", "aria-live": "polite" }, "Aucun son en cours."); let gain = null, tick = null;
  const SOUNDS = [["Pluie", "rain"], ["Océan", "ocean"], ["Bruit brun (concentration)", "brown"], ["Bruit rose (sommeil)", "pink"]];
  const tm = h("select", { style: "width:auto", "aria-label": "Minuteur d'arrêt" }, h("option", { value: 0 }, "Pas de minuteur"), ...[15, 30, 60].map((m) => h("option", { value: m }, m + " min"))); tm.value = String(lsGet("nova_relax_tm", 0));
  const tiles = [];
  const paintSt = () => { if (!document.body.contains(st)) { clearInterval(tick); return; } const left = rlx.end ? Math.max(0, Math.round((rlx.end - Date.now()) / 1000)) : 0;
    st.textContent = rlx.name ? "▶ " + rlx.name + " — synthétisé en direct, sans réseau." + (rlx.end ? " Arrêt dans " + fmtT(left) + "." : "") : "Aucun son en cours."; tiles.forEach(([t, n]) => t.setAttribute("aria-pressed", rlx.name === n ? "true" : "false")); tiles.forEach(([t, n]) => { t.style.outline = rlx.name === n ? "2px solid var(--accent)" : ""; }); };
  const arm = () => { clearTimeout(rlx.timer); rlx.end = 0; if (+tm.value) { rlx.end = Date.now() + tm.value * 60000; rlx.timer = setTimeout(() => { stopNoise(); try { ctx.player.stop(); } catch {} rlx.name = ""; rlx.end = 0; paintSt(); }, tm.value * 60000); } paintSt(); };
  const go = (k, n) => { stopNoise(); gain = startNoise(k, vol.value / 100 * 0.5); rlx.name = n; arm(); };
  vol.oninput = () => { lsSet("nova_relax_vol", +vol.value); if (gain) gain.gain.value = vol.value / 100 * 0.5; };
  tm.onchange = () => { lsSet("nova_relax_tm", +tm.value); if (rlx.name) arm(); else paintSt(); };
  const stopAll = () => { stopNoise(); try { ctx.player.stop(); } catch {} clearTimeout(rlx.timer); rlx = { name: "", end: 0, timer: null }; paintSt(); };
  const sTiles = SOUNDS.map(([n, k]) => { const t = act(h("div", { class: "card tile" }, h("b", {}, n), h("div", { class: "muted" }, "Appuie pour jouer")), () => go(k, n), "Jouer " + n); tiles.push([t, n]); return t; });
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Relaxation"), h("div", { class: "muted" }, "Sons générés par ton Mac, sans connexion. Ajoute un flux ambiant pour la musique.")), playerBar(ctx),
    h("div", { class: "grid g3" }, ...sTiles),
    h("div", { class: "card row" }, h("label", { class: "row", style: "gap:6px" }, h("span", {}, "Volume"), vol), h("label", { class: "row", style: "gap:6px" }, h("span", {}, "Minuteur"), tm), h("span", { class: "spacer" }), h("button", { class: "btn", onclick: stopAll }, "Tout arrêter")),
    st, h("h2", {}, "Flux ambiants"), h("div", { class: "grid g3" }, ...RADIOS.filter((r) => r[0].startsWith("SomaFM")).map(([n, d, u]) => { const it = { id: u, name: n, sub: d, url: u }; const l = [it]; return h("div", { class: "card tile", "data-u": u }, h("b", {}, n), h("div", { class: "muted" }, d), h("div", { class: "row", style: "margin-top:6px" }, h("button", { class: "btn sm primary", onclick: () => { stopNoise(); rlx.name = ""; paintSt(); playChain(ctx, l, 0, "radio"); } }, "Écouter"), h("span", { class: "chip good nowchip", style: "display:none" }, "en lecture"))); })));
  paintSt(); tick = setInterval(paintSt, 1000); ctx.onLeave && ctx.onLeave(() => clearInterval(tick));
} };
export const medias = [radio, tv, podcasts, video, relax];
