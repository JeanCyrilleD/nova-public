import { api, esc, md, h } from "../core.js";
import { ic } from "../icons.js";
import { focus } from "./focus.js";

// ── Coffre : Finances et Santé restent grisés tant que le code n'est pas saisi (vérifié côté serveur, 15 min) ──
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
/* PBKDF2-HMAC-SHA256 en JavaScript pur : repli quand crypto.subtle n'est pas disponible (WebView macOS hors « contexte sécurisé »). */
const K256 = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const W = new Uint32Array(64);
function compress(st, blk) { // blk : Uint32Array(16) big-endian déjà lu ; st : Uint32Array(8) modifié en place
  for (let i = 0; i < 16; i++) W[i] = blk[i];
  for (let i = 16; i < 64; i++) { const a = W[i - 15], b = W[i - 2]; const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3), s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0; }
  let a = st[0], b = st[1], c = st[2], d = st[3], e = st[4], f = st[5], g = st[6], hh = st[7];
  for (let i = 0; i < 64; i++) { const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K256[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0; hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
  st[0] += a; st[1] += b; st[2] += c; st[3] += d; st[4] += e; st[5] += f; st[6] += g; st[7] += hh;
}
const IV = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
function sha256(bytes, prefixState = null, prefixLen = 0) { // sha256 d'un message ; prefixState = état après un bloc déjà absorbé (HMAC)
  const total = prefixLen + bytes.length, padLen = (((bytes.length + 9 + 63) >> 6) << 6), buf = new Uint8Array(padLen); buf.set(bytes); buf[bytes.length] = 0x80;
  const dv = new DataView(buf.buffer); dv.setUint32(padLen - 4, (total * 8) >>> 0); dv.setUint32(padLen - 8, Math.floor(total / 0x20000000));
  const st = new Uint32Array(prefixState || IV), blk = new Uint32Array(16);
  for (let o = 0; o < padLen; o += 64) { for (let i = 0; i < 16; i++) blk[i] = dv.getUint32(o + i * 4); compress(st, blk); }
  const out = new Uint8Array(32), od = new DataView(out.buffer); for (let i = 0; i < 8; i++) od.setUint32(i * 4, st[i]); return out;
}
function pbkdf2JS(pw, salt, iters) {
  let key = pw; if (key.length > 64) key = sha256(key); const ik = new Uint8Array(64).fill(0x36), ok = new Uint8Array(64).fill(0x5c); key.forEach((v, i) => { ik[i] ^= v; ok[i] ^= v; });
  const absorb = (blk64) => { const st = new Uint32Array(IV), dv = new DataView(blk64.buffer), blk = new Uint32Array(16); for (let i = 0; i < 16; i++) blk[i] = dv.getUint32(i * 4); compress(st, blk); return st; };
  const inner = absorb(ik), outer = absorb(ok);
  const hmac = (msg) => sha256(sha256(msg, inner, 64), outer, 64);
  const s1 = new Uint8Array(salt.length + 4); s1.set(salt); s1[salt.length + 3] = 1;
  let u = hmac(s1); const t = new Uint8Array(u); for (let i = 1; i < iters; i++) { u = hmac(u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; } return t;
}
async function derive(code, saltHex) {
  const salt = new Uint8Array(saltHex.match(/../g).map((x) => parseInt(x, 16))), pw = new TextEncoder().encode(code);
  if (window.crypto && crypto.subtle) { try {
    const k = await crypto.subtle.importKey("raw", pw, "PBKDF2", false, ["deriveBits"]);
    return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 200000 }, k, 256)); } catch (e) { /* repli ci-dessous */ } }
  await new Promise((r) => setTimeout(r, 30)); return hex(pbkdf2JS(pw, salt, 200000));
}
const randSalt = () => { const a = new Uint8Array(16); if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256); return a; };
export const vault = { token: null, until: 0 };
export const vaultOpen = () => vault.token && Date.now() < vault.until;
export const vget = async (path) => { const r = await fetch(path, { headers: { "x-vault": vault.token || "" } }); const j = await r.json(); if (r.status === 423) { vault.token = null; } return { status: r.status, j }; };
export const vpost = async (path, body) => { const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "x-vault": vault.token || "" }, body: JSON.stringify(body || {}) }); return { status: r.status, j: await r.json() }; };

async function gate(el, ctx, title, unlocked) {
  const stt = (await vget("/api/vault/status")).j; if (!stt.unlocked) vault.token = null;
  if (vaultOpen() && stt.unlocked) return unlocked();
  const msg = h("div", { class: "muted" }); const code = h("input", { type: "password", inputmode: "numeric", placeholder: stt.configured ? "Code du coffre" : "Choisis un code (6 caractères minimum)", autofocus: true, style: "max-width:280px" });
  const code2 = h("input", { type: "password", placeholder: "Confirme le code", style: "max-width:280px" });
  const submit = async () => { try { await submit0(); } catch (e) { msg.textContent = "Erreur : " + (e && e.message || e); } };
  const submit0 = async () => { msg.textContent = "Calcul en cours… (quelques secondes)";
    if (!stt.configured) {
      if (code.value.length < 6) { msg.textContent = "6 caractères minimum."; return; } if (code.value !== code2.value) { msg.textContent = "Les deux codes diffèrent."; return; }
      const salt = hex(randSalt()); const hash = await derive(code.value, salt); const r = await api.post("/api/vault/setup", { salt, hash });
      if (!r.ok) { msg.textContent = r.error || "Échec"; return; } ctx.toast("Code créé. Ne l'oublie pas : il n'est pas récupérable."); return ctx.go(ctx.tab);
    }
    const hash = await derive(code.value, stt.salt); const r = await fetch("/api/vault/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hash }) }); const j = await r.json();
    if (!r.ok) { msg.textContent = j.error || "Refusé"; return; } vault.token = j.token; vault.until = Date.now() + j.ttl * 1000; ctx.go(ctx.tab);
  };
  code.onkeydown = (e) => { if (e.key === "Enter") submit(); };
  const ghost = ["Total", "Positions", "Variation", "Échéances"].map((t) => h("div", { class: "card", style: "filter:blur(9px) grayscale(1);opacity:.55;user-select:none" }, h("div", { class: "muted" }, t), h("div", { class: "kpi" }, "•••••••")));
  el.append(h("div", { class: "hero card" }, h("h1", {}, title + " — verrouillé"), h("div", { class: "muted" }, stt.configured ? "Les chiffres restent grisés tant que tu n'as pas saisi ton code. Il est vérifié par le moteur local, avec blocage après 5 erreurs." : "Premier usage : choisis un code. Il protège Finances et Santé. Il n'est jamais stocké en clair et ne peut pas être récupéré.")),
    h("div", { class: "grid g3" }, ...ghost), h("div", { class: "card grid", style: "justify-items:start" }, code, stt.configured ? null : code2, h("div", { class: "row" }, h("button", { class: "btn primary", onclick: submit }, stt.configured ? "Déverrouiller" : "Créer le code")), msg));
}

/* ── Utilitaires locaux (stockage tolérant, accessibilité clavier, export CSV) ── */
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const act = (n, fn, label) => { n.setAttribute("role", "button"); n.tabIndex = 0; if (label) n.setAttribute("aria-label", label); n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(e); } }); n.addEventListener("click", fn); return n; };
const csvCell = (c) => { let s = String(c ?? ""); if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s.replace(",", ".")))) s = "'" + s; return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };   // anti-injection de formules
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
const nf = (n) => (n == null || !isFinite(n)) ? "" : String(Math.round(n * 100) / 100).replace(".", ",");
const dl = (name, text, type = "text/csv") => { const u = URL.createObjectURL(new Blob(["﻿" + text], { type: type + ";charset=utf-8" })); const a = h("a", { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); };
const today = () => new Date().toISOString().slice(0, 10);
const IDLE_MS = 5 * 60 * 1000;
/* Verrouillage automatique : 5 min sans clic/clavier/souris → le coffre est reverrouillé côté serveur puis l'écran de code revient. */
function armAutoLock(el, ctx) {
  let last = Date.now(); const bump = () => { last = Date.now(); }; const evs = ["pointerdown", "keydown", "mousemove", "touchstart", "scroll"];
  evs.forEach((e) => document.addEventListener(e, bump, { passive: true, capture: true }));
  let tm = null; const stop = () => { clearInterval(tm); evs.forEach((e) => document.removeEventListener(e, bump, { capture: true })); };
  tm = setInterval(async () => {
    if (!document.body.contains(el)) { stop(); return; }
    if (!vaultOpen()) { stop(); ctx.go(ctx.tab); return; }
    if (Date.now() - last > IDLE_MS) { stop(); try { await vpost("/api/vault/lock"); } catch {} vault.token = null; ctx.toast("Coffre reverrouillé après 5 min d'inactivité"); ctx.go(ctx.tab); }
  }, 10000);
  ctx.onLeave && ctx.onLeave(stop);
}

function table(src) { return h("div", { style: "overflow:auto;max-height:46vh", tabindex: "0", role: "region", "aria-label": "Tableau " + src.label }, h("table", {}, h("caption", { class: "muted", style: "text-align:left" }, src.label), h("thead", {}, h("tr", {}, ...src.columns.map((c) => h("th", { scope: "col" }, c)))), h("tbody", {}, ...src.rows.slice(0, 200).map((r) => h("tr", {}, ...src.columns.map((_, i) => h("td", {}, r[i] ?? ""))))))); }
const numOf = (v) => { const n = parseFloat(String(v).replace(/\s/g, "").replace(",", ".").replace(/[^\d.\-]/g, "")); return isFinite(n) ? n : null; };

async function dataView(el, ctx, domain, title, hint) {
  const loading = h("div", { class: "card muted", role: "status" }, "Chargement…"); el.append(loading);
  let st, j; try { ({ status: st, j } = await vget("/api/vault/data?domain=" + domain)); } catch (e) { loading.className = "card err"; loading.setAttribute("role", "alert"); loading.textContent = "Moteur local injoignable : " + (e && e.message || e); return; }
  if (st === 423) { loading.remove(); return ctx.go(ctx.tab); }
  if (!j.sources) { loading.className = "card err"; loading.setAttribute("role", "alert"); loading.textContent = "Lecture impossible : " + (j.error || "réponse inattendue"); return; }
  loading.remove(); armAutoLock(el, ctx);
  const path = h("input", { placeholder: hint, style: "flex:1;min-width:260px", "aria-label": "Chemin du fichier à importer" }), lab = h("input", { placeholder: "Nom (ex. Compte BRVM)", style: "width:200px", "aria-label": "Nom de la source" }); const out = h("div", { class: "muted", role: "status", "aria-live": "polite" });
  const imp = async (btn) => { if (!path.value.trim()) { out.textContent = "Indique le chemin d'un fichier (CSV, JSON ou PDF)."; return; } btn.disabled = true; out.textContent = "Import…";
    try { const r = await vpost("/api/vault/import", { domain, path: path.value, label: lab.value }); if (r.status === 200) { ctx.toast("Importé : " + r.j.rows + " lignes"); ctx.go(ctx.tab); } else if (r.status === 423) ctx.go(ctx.tab); else { out.className = "err"; out.textContent = r.j.error || "Échec de l'import"; } } catch (e) { out.className = "err"; out.textContent = "Import impossible : " + (e && e.message || e); } btn.disabled = false; };
  const cards = j.sources.map((s) => { const sums = s.columns.map((c, i) => { const v = s.rows.map((r) => numOf(r[i])).filter((x) => x !== null); return v.length >= Math.max(2, s.rows.length * 0.8) ? [c, v.reduce((a, b) => a + b, 0)] : null; }).filter(Boolean);
    return h("div", { class: "card grid" }, h("div", { class: "row" }, h("h2", { style: "margin:0" }, s.label), h("span", { class: "muted" }, s.rows.length + " lignes · importé " + String(s.imported).slice(0, 10)), h("span", { class: "spacer" }),
      h("button", { class: "btn sm", onclick: () => dl("nova-" + domain + "-" + String(s.label).replace(/[^\w-]+/g, "_") + "-" + today() + ".csv", toCsv([s.columns, ...s.rows])) }, "Exporter CSV"),
      h("button", { class: "btn sm", onclick: () => { if (confirm("Envoyer ces données à l'IA pour analyse ? Elles quitteront ton Mac vers le cerveau actif.")) { ctx.go("chat"); ctx.A.send("Analyse ces données " + domain + " (« " + s.label + " »). Ne suppose rien qui n'y figure pas :\n\n" + s.columns.join(" | ") + "\n" + s.rows.slice(0, 80).map((r) => r.join(" | ")).join("\n"), {}); } } }, "Analyser avec Nova…"),
      h("button", { class: "btn sm", onclick: async () => { if (!confirm("Retirer « " + s.label + " » du coffre ?")) return; await vpost("/api/vault/remove", { domain, id: s.id }); ctx.go(ctx.tab); } }, "Retirer")),
      sums.length ? h("div", { class: "row" }, ...sums.slice(0, 6).map(([c, v]) => h("div", { class: "card" }, h("div", { class: "muted" }, "Σ " + c), h("div", { class: "kpi", style: "font-size:22px" }, v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }))))) : null,
      h("div", { class: "muted" }, "Les Σ sont de simples sommes de colonnes numériques de ton fichier, sans interprétation."), table(s)); });
  el.append(h("div", { class: "hero card" }, h("div", { class: "row" }, h("h1", { style: "margin:0" }, title), h("span", { class: "spacer" }), h("span", { class: "chip good", title: "Reverrouillage automatique après 5 min d'inactivité" }, "déverrouillé · se reverrouille à " + new Date(vault.until).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })), h("button", { class: "btn", onclick: async () => { await vpost("/api/vault/lock"); vault.token = null; ctx.go(ctx.tab); } }, "Verrouiller")),
    h("div", { class: "muted" }, "Rien ici n'est inventé : tu importes tes propres relevés (CSV, JSON ou PDF, depuis ton dossier personnel) et Nova les affiche tels quels. Reverrouillage automatique après 5 min d'inactivité.")),
    h("div", { class: "card grid" }, h("h2", {}, "Importer un fichier"), h("div", { class: "row" }, path, lab, h("button", { class: "btn primary", onclick: (e) => imp(e.currentTarget) }, "Importer")), out), ...(cards.length ? cards : [h("div", { class: "card muted" }, "Aucune donnée importée. Indique ci-dessus le chemin d'un fichier CSV, JSON ou PDF.")]));
}
const F = (n, d = 0) => (n == null || !isFinite(n)) ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });
const SG = (n, d = 0) => (n == null || !isFinite(n)) ? "—" : (n > 0 ? "▲ +" : n < 0 ? "▼ " : "") + F(n, d);
const tone = (n) => (n > 0 ? "color:#3ddc97" : n < 0 ? "color:#ff4d5e" : "");   // la couleur n'est jamais seule : ▲/▼ et signe
/* Séance BRVM : même définition que le moteur (lun–ven, 9 h–16 h UTC). Jours fériés non connus. */
const sessionOpen = (d = new Date()) => { const w = d.getUTCDay(), hh = d.getUTCHours(); return w >= 1 && w <= 5 && hh >= 9 && hh < 16; };
const ago = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? s + " s" : s < 5400 ? Math.round(s / 60) + " min" : s < 172800 ? Math.round(s / 3600) + " h" : Math.round(s / 86400) + " j"; };
let pfTimer = null, pfSort = { k: "v", dir: -1 };
/* Portefeuilles SBIF : relevés PDF + cours BRVM publics, mis à jour tout seul (dossier ~/Nova-Finances surveillé, cours toutes les 60 s en séance). */
async function portfolioView(el, ctx) {
  const sec = h("div", { class: "card grid pf", "aria-busy": "true" }, h("div", { class: "muted", role: "status" }, "Chargement des portefeuilles…")); el.children[0].after(sec);
  const path = h("input", { placeholder: "~/Downloads/sbif.pdf", style: "flex:1;min-width:240px", "aria-label": "Chemin du relevé PDF" }); const out = h("div", { class: "muted", role: "status", "aria-live": "polite" });
  let data = null, err = "", busy = false, lastOk = 0;
  const pull = async (refresh, manual) => {
    if (busy) return; busy = true; if (data) paint();
    try {
      if (refresh) { const r = await vpost("/api/portfolio/refresh", {}); if (r.status === 423) { vault.token = null; return ctx.go(ctx.tab); }
        if (r.status !== 200) err = "Source des cours indisponible : " + (r.j.error || "HTTP " + r.status) + ". Les derniers cours connus restent affichés."; else { err = ""; lastOk = Date.now(); if (manual) ctx.toast("Cours actualisés (" + (r.j.quotes || 0) + " titres" + (r.j.new_files ? ", " + r.j.new_files + " nouveau(x) relevé(s)" : "") + ")"); } }
      const g = await vget("/api/portfolio"); if (g.status === 423) return ctx.go(ctx.tab);
      if (g.status !== 200) { err = "Lecture du portefeuille impossible : " + (g.j.error || "HTTP " + g.status); } else data = g.j;
    } catch (e) { err = "Moteur local injoignable : " + (e && e.message || e); }
    busy = false; sec.removeAttribute("aria-busy"); paint();
  };
  const act2 = async (url, body, ok) => { out.className = "muted"; out.textContent = "…"; try { const r = await vpost(url, body); if (r.status === 200) { out.textContent = ""; ctx.toast(ok); pull(false); } else if (r.status === 423) ctx.go(ctx.tab); else { out.className = "err"; out.textContent = r.j.error || "Échec"; } } catch (e) { out.className = "err"; out.textContent = "Échec : " + (e && e.message || e); } };
  const compute = () => { const q = data.quotes || {}, accs = Object.values(data.accounts || {}); let grand = 0, grandPl = 0, grandCost = 0;
    const list = accs.map((a) => { let tot = a.cash || 0, pl = 0, cost = 0;
      const rows = a.positions.map((p) => { const lq = q[p.sym], px = lq ? lq.price : p.cours_releve, v = p.qty * px, c = p.qty * p.cmp; tot += v; if (p.cmp) { pl += v - c; cost += c; } return { p, px, v, c, pl: p.cmp ? v - c : null, perf: p.cmp && c ? (v / c - 1) * 100 : null, vr: lq ? lq.var : null, live: !!lq, sym: p.sym || p.name, qty: p.qty, cmp: p.cmp || null }; });
      if (a.invested > 0) { cost = a.invested; pl = tot - (a.cash || 0) - a.invested; }
      grand += tot; grandPl += pl; grandCost += cost; return { a, rows, tot, pl, cost }; });
    return { list, grand, grandPl, grandCost }; };
  const sortRows = (rows) => rows.slice().sort((x, y) => { const k = pfSort.k, A = x[k], B = y[k]; if (A == null && B == null) return 0; if (A == null) return 1; if (B == null) return -1; return (typeof A === "string" ? A.localeCompare(B, "fr") : A - B) * pfSort.dir; });
  const exportCsv = () => { const c = compute(); const rows = [["Compte", "Symbole", "Titre", "Quantité", "CMP", "Cours", "Variation jour %", "Valeur", "+/- value", "Performance %", "Source du cours"]];
    for (const { a, rows: rs, tot, pl } of c.list) { for (const r of rs) rows.push([a.account, r.p.sym, r.p.name, nf(r.qty), nf(r.cmp), nf(r.px), nf(r.vr), nf(r.v), nf(r.pl), nf(r.perf), r.live ? "BRVM" : "relevé"]); rows.push([a.account, "", "Liquidités", "", "", "", "", nf(a.cash || 0), "", "", ""]); rows.push([a.account, "", "TOTAL compte", "", "", "", "", nf(tot), nf(pl), "", ""]); }
    rows.push(["", "", "TOTAL GÉNÉRAL", "", "", "", "", nf(c.grand), nf(c.grandPl), nf(c.grandCost ? c.grandPl / c.grandCost * 100 : 0), ""]); rows.push(["Cours au", data.quotes_at || "inconnu"]); dl("nova-portefeuille-" + today() + ".csv", toCsv(rows)); };
  function paint() {
    if (!data) { sec.replaceChildren(h("div", { class: "chip bad", role: "alert" }, err || "Aucune donnée"), h("button", { class: "btn", onclick: () => pull(true, true) }, "Réessayer")); return; }
    const c = compute(), open = sessionOpen(), qa = data.quotes_at ? new Date(data.quotes_at) : null, age = qa ? Date.now() - qa.getTime() : null, stale = open && (age == null || age > 180000);
    const head = (label, k) => h("th", { scope: "col", "aria-sort": pfSort.k === k ? (pfSort.dir > 0 ? "ascending" : "descending") : "none" }, h("button", { class: "btn sm", style: "padding:2px 8px", title: "Trier par " + label, onclick: () => { pfSort = { k, dir: pfSort.k === k ? -pfSort.dir : (k === "sym" ? 1 : -1) }; paint(); } }, label + (pfSort.k === k ? (pfSort.dir > 0 ? " ↑" : " ↓") : "")));
    const cards = c.list.map(({ a, rows, tot, pl, cost }) => h("div", { class: "card grid" }, h("div", { class: "row" }, h("h2", { style: "margin:0" }, a.kind + " · " + a.account), h("span", { class: "muted" }, "relevé du " + a.as_of + " · " + a.source), h("span", { class: "spacer" }), h("button", { class: "btn sm", onclick: () => { if (confirm("Retirer le compte « " + a.account + " » ?")) act2("/api/portfolio/remove", { account: a.account }, "Compte retiré"); } }, "Retirer")),
      h("div", { class: "row" }, h("div", { class: "card" }, h("div", { class: "muted" }, "Valeur totale (cours en direct)"), h("div", { class: "kpi", style: "font-size:24px" }, F(tot) + " FCFA")),
        h("div", { class: "card" }, h("div", { class: "muted" }, "Plus-value latente"), h("div", { class: "kpi", style: "font-size:24px;" + tone(pl) }, SG(pl) + " FCFA"), h("div", { class: "muted" }, F(cost ? pl / cost * 100 : 0, 1) + " % du coût")),
        h("div", { class: "card" }, h("div", { class: "muted" }, "Liquidités"), h("div", { class: "kpi", style: "font-size:24px" }, F(a.cash) + " FCFA"), h("div", { class: "muted" }, "Total du relevé : " + F(a.total_releve)))),
      rows.length ? h("div", { style: "overflow:auto;max-height:46vh", tabindex: "0", role: "region", "aria-label": "Positions du compte " + a.account }, h("table", {}, h("caption", { class: "muted", style: "text-align:left" }, "Positions — cours BRVM ; « * » = cours du relevé (BRVM indisponible pour ce titre)"),
        h("thead", {}, h("tr", {}, head("Titre", "sym"), head("Qté", "qty"), head("CMP", "cmp"), head("Cours", "px"), head("Jour", "vr"), head("Valeur", "v"), head("+/- value", "pl"), head("%", "perf"))),
        h("tbody", {}, ...sortRows(rows).map((r) => h("tr", {}, h("td", {}, h("b", {}, r.p.sym || ""), " ", h("span", { class: "muted" }, r.p.name)), h("td", {}, F(r.qty)), h("td", {}, r.cmp ? F(r.cmp, 1) : "—"), h("td", {}, F(r.px, r.px < 1000 ? 2 : 0) + (r.live ? "" : " *")), h("td", { style: tone(r.vr) }, r.vr == null ? "—" : SG(r.vr, 2) + " %"), h("td", {}, F(r.v)), h("td", { style: tone(r.pl) }, r.pl == null ? "—" : SG(r.pl)), h("td", { style: tone(r.perf) }, r.perf == null ? "—" : SG(r.perf, 1) + " %")))),
        h("tfoot", {}, h("tr", {}, h("th", { scope: "row", colspan: 5 }, "Total titres"), h("td", {}, h("b", {}, F(rows.reduce((s, r) => s + r.v, 0)))), h("td", { style: tone(pl) }, h("b", {}, SG(pl))), h("td", {}))))) : h("div", { class: "muted" }, "Aucune position dans ce relevé.")));
    sec.replaceChildren(
      h("div", { class: "row" }, h("h2", { style: "margin:0" }, "Mes portefeuilles (SBIF)"), h("span", { class: "spacer" }),
        h("span", { class: "chip " + (open ? "good" : ""), title: "Lun–ven 9 h–16 h UTC ; jours fériés non pris en compte" }, open ? "● Séance ouverte" : "○ Séance fermée"),
        h("span", { class: "chip " + (stale ? "bad" : ""), title: qa ? qa.toLocaleString("fr-FR") : "" }, qa ? "cours BRVM : " + qa.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " (il y a " + ago(age) + ")" : "cours : pas encore chargés"),
        h("button", { class: "btn", disabled: !c.list.length, onclick: exportCsv }, "Exporter CSV"), h("button", { class: "btn primary", disabled: busy, onclick: () => pull(true, true) }, busy ? "Actualisation…" : "Actualiser maintenant")),
      err ? h("div", { class: "banner", role: "alert" }, err + " ", h("button", { class: "btn sm", onclick: () => pull(true, true) }, "Réessayer")) : "",
      stale && !err ? h("div", { class: "banner", role: "status" }, "Séance ouverte mais les cours ont plus de 3 minutes : la source BRVM tarde à répondre.") : "",
      c.list.length ? h("div", { class: "row" }, h("div", { class: "card" }, h("div", { class: "muted" }, "Total des " + c.list.length + " compte(s)"), h("div", { class: "kpi", style: "font-size:28px" }, F(c.grand) + " FCFA"), h("div", { class: "muted", style: tone(c.grandPl) }, "plus-value latente " + SG(c.grandPl) + " (" + F(c.grandCost ? c.grandPl / c.grandCost * 100 : 0, 1) + " %)"))) : h("div", { class: "card muted" }, "Aucun portefeuille. Dépose un relevé PDF SBIF dans « " + (data.watch || "~/Nova-Finances") + " » ou importe-le ci-dessous."),
      data.last_error ? h("div", { class: "chip bad", role: "alert" }, "Dernier relevé non lu : " + data.last_error) : "",
      h("div", { class: "muted" }, "Mise à jour automatique : dépose chaque nouveau relevé PDF dans « " + (data.watch || "~/Nova-Finances") + " » (lu en moins d'une minute), et les cours BRVM se rafraîchissent seuls toutes les minutes pendant la séance (source : site public de la BRVM). Aucun mot de passe, aucune connexion à SBIF, aucun ordre de bourse. La valeur affichée = quantité du dernier relevé × cours BRVM public (indicatif, hors frais)."),
      h("div", { class: "row" }, path, h("button", { class: "btn", onclick: () => { if (!path.value.trim()) { out.textContent = "Indique le chemin d'un relevé PDF."; return; } act2("/api/portfolio/import", { path: path.value }, "Relevé importé"); } }, "Importer un relevé PDF")), out, ...cards);
  }
  clearInterval(pfTimer);
  pfTimer = setInterval(() => { if (!document.body.contains(sec)) { clearInterval(pfTimer); return; } if (document.hidden || !vaultOpen()) return; const qa = data && data.quotes_at ? Date.now() - new Date(data.quotes_at).getTime() : Infinity; pull(sessionOpen() && qa > 120000, false); }, 60000);
  ctx.onLeave && ctx.onLeave(() => clearInterval(pfTimer));
  await pull(false);
}
const finances = { id: "finances", title: "Finances", desc: "Comptes, titres, fonds — verrouillé", icon: "keys", async render(el, ctx) { await gate(el, ctx, "Finances", async () => { await dataView(el, ctx, "finance", "Finances", "~/Documents/releve-sbif.csv"); if (el.children.length) await portfolioView(el, ctx); }); } };
const sante = { id: "sante", title: "Santé", desc: "Données perso — verrouillé", icon: "pulse", async render(el, ctx) { await gate(el, ctx, "Santé", () => dataView(el, ctx, "sante", "Santé", "~/Documents/sante.csv")); } };

const travail = { id: "travail", title: "Travail", desc: "Dossiers, fichiers, assistant", icon: "file", async render(el, ctx) {
  const s = ctx.st.settings; const dir = h("input", { value: s.work_dir || "~/Documents", style: "flex:1;min-width:260px", "aria-label": "Dossier de travail" }); const list = h("div", { class: "card", "aria-live": "polite" }), view = h("div", { class: "card md", style: "display:none" });
  const flt = h("input", { type: "search", placeholder: "Filtrer par nom…", "aria-label": "Filtrer les fichiers", style: "max-width:220px" }), srt = h("select", { "aria-label": "Trier", style: "width:auto" }, ...[["name", "Nom"], ["mtime", "Date (récent d'abord)"], ["size", "Taille"]].map(([v, n]) => h("option", { value: v }, n)));
  let cur = null; const recents = lsGet("nova_work_recent", []);
  const paint = () => { if (!cur) return; const q = flt.value.trim().toLowerCase(); let it = cur.items.filter((i) => !q || i.name.toLowerCase().includes(q));
    it = it.slice().sort((a, b) => (a.dir === b.dir ? 0 : a.dir ? -1 : 1) || (srt.value === "mtime" ? String(b.mtime).localeCompare(String(a.mtime)) : srt.value === "size" ? b.size - a.size : a.name.localeCompare(b.name, "fr")));
    list.replaceChildren(h("div", { class: "row" }, h("button", { class: "btn sm", onclick: () => load(cur.path.split("/").slice(0, -1).join("/") || "~") }, "↑ Dossier parent"), h("span", { class: "muted" }, cur.path + " · " + it.length + " élément(s)")),
      ...(it.length ? it.map((i) => act(h("div", { class: "row", style: "padding:6px 0;border-top:1px solid var(--line);cursor:pointer" }, h("span", { html: ic(i.dir ? "file" : "note", 18), "aria-hidden": "true" }), h("span", { style: "flex:1" }, (i.dir ? "Dossier " : "") + i.name), h("span", { class: "muted" }, i.dir ? "" : Math.round(i.size / 1024) + " Ko"), h("span", { class: "muted" }, String(i.mtime).slice(0, 10))), () => (i.dir ? load(cur.path + "/" + i.name) : open(cur.path + "/" + i.name)), (i.dir ? "Ouvrir le dossier " : "Lire le fichier ") + i.name)) : [h("div", { class: "muted", style: "padding:8px 0" }, q ? "Aucun élément ne correspond à « " + flt.value + " »." : "Dossier vide.")])); };
  const load = async (p) => { dir.value = p; list.replaceChildren(h("div", { class: "muted", role: "status" }, "Chargement…"));
    try { await api.post("/api/settings", { work_dir: p }); const r = await api.get("/api/ls?path=" + encodeURIComponent(p));
      if (r.error) { list.replaceChildren(h("div", { class: "err", role: "alert" }, r.error)); return; } cur = r; paint(); } catch (e) { list.replaceChildren(h("div", { class: "err", role: "alert" }, "Dossier illisible : " + (e && e.message || e), " ", h("button", { class: "btn sm", onclick: () => load(p) }, "Réessayer"))); } };
  const open = async (p) => { view.style.display = ""; view.replaceChildren(h("span", { class: "muted", role: "status" }, "Lecture…"));
    try { const r = await api.post("/api/tool", { name: "read_file", arg: p }); const txt = String(r.output ?? r.error ?? "");
      const i = recents.indexOf(p); if (i >= 0) recents.splice(i, 1); recents.unshift(p); recents.length = Math.min(recents.length, 8); lsSet("nova_work_recent", recents);
      view.replaceChildren(h("div", { class: "row" }, h("b", {}, p.split("/").pop()), h("span", { class: "muted" }, txt.length + " caractères"), h("span", { class: "spacer" }), h("button", { class: "btn sm", onclick: () => { ctx.go("chat"); ctx.A.send("Voici le fichier « " + p.split("/").pop() + " ». Résume-le et dis-moi ce que je dois en faire :\n\n" + txt.slice(0, 8000), {}); } }, "Demander à Nova"), h("button", { class: "btn sm", onclick: () => { view.style.display = "none"; } }, "Fermer")), h("pre", { style: "white-space:pre-wrap;max-height:40vh;overflow:auto", tabindex: "0" }, txt)); view.scrollIntoView({ behavior: "smooth" });
    } catch (e) { view.replaceChildren(h("div", { class: "err", role: "alert" }, "Lecture impossible : " + (e && e.message || e))); } };
  flt.oninput = paint; srt.onchange = paint; dir.onkeydown = (e) => { if (e.key === "Enter") load(dir.value); };
  el.append(h("div", { class: "hero card" }, h("h1", {}, "Travail"), h("div", { class: "muted" }, "Parcours tes dossiers de travail (lecture seule, dans ton espace personnel) et fais lire un document à Nova. Les agents « Courrier », « Agenda » et « Chercheur » sont dans Agents & mémoire."), h("div", { class: "row", style: "margin-top:8px" }, dir, h("button", { class: "btn primary", onclick: () => load(dir.value) }, "Ouvrir")), h("div", { class: "row", style: "margin-top:8px" }, flt, srt),
    recents.length ? h("div", { class: "row", style: "margin-top:8px" }, h("span", { class: "muted" }, "Récents :"), ...recents.slice(0, 5).map((p) => h("button", { class: "btn sm", title: p, onclick: () => open(p) }, p.split("/").pop()))) : null), list, view);
  load(dir.value);
} };
export const vie = [focus, finances, sante, travail];
