// Fenêtre de confirmation : une action risquée n'est exécutée que si l'utilisateur clique « Autoriser » ICI
// (jamais sur la foi d'un mot écrit dans le texte). Refus définitif pour envoi de messages, paiements et mots de passe.
(function () {
  const queue = []; let box = null;
  const el = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt) e.textContent = txt; return e; };
  async function decide(id, ok, free) {
    try { await fetch("/api/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ok, free_minutes: free || 0 }) }); } catch (e) {}
    box && box.remove(); box = null; next();
  }
  function next() {
    if (box || !queue.length) return;
    const q = queue.shift();
    box = el("div", "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)");
    box.setAttribute("role", "alertdialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Autorisation demandée");
    const card = el("div", "max-width:560px;width:calc(100% - 32px);background:var(--panel,#1b1b22);color:var(--text,#fff);border:1px solid var(--line,#444);border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.5);font:14px system-ui");
    card.append(el("div", "font-weight:700;font-size:16px;margin-bottom:6px", "Nova demande ton autorisation"));
    card.append(el("div", "opacity:.8;margin-bottom:10px", "Action : " + (q.kind || "commande") + ". Rien ne s'exécute sans ton clic."));
    card.append(el("pre", "white-space:pre-wrap;word-break:break-all;background:rgba(0,0,0,.35);padding:10px;border-radius:10px;max-height:200px;overflow:auto;margin:0 0 14px", String(q.cmd || "")));
    const row = el("div", "display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end");
    const b = (t, f, primary) => { const x = el("button", "padding:8px 14px;border-radius:10px;border:1px solid var(--line,#555);cursor:pointer;background:" + (primary ? "var(--accent,#f97316)" : "transparent") + ";color:inherit;font:inherit", t); x.onclick = f; return x; };
    row.append(b("Refuser", () => decide(q.id, false)), b("Autoriser cette fois", () => decide(q.id, true), true));
    if (!/(rm|kill|sudo|base64|eval)/i.test(q.cmd || "")) row.append(b("Autoriser les commandes courantes 1 h", () => decide(q.id, true, 60)));
    card.append(row); box.append(card); document.body.append(box);
    const first = row.querySelector("button:nth-child(2)"); first && first.focus();
  }
  function connect() {
    const es = new EventSource("/api/events");
    es.addEventListener("confirm", (m) => { try { queue.push(JSON.parse(m.data)); next(); } catch (e) {} });
    es.onerror = () => { es.close(); setTimeout(connect, 4000); };
  }
  connect();
})();
