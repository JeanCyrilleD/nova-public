// Garde les boîtes web Outlook et Gmail (volets natifs déjà connectés) lisibles par l'assistant :
// charge les volets en arrière-plan puis envoie régulièrement un instantané texte au serveur,
// que l'outil mail_unread utilise quand Mail.app ne répond pas. Lecture seule : rien n'est envoyé ni modifié.
import { api } from "./core.js";
import { isNative, web } from "./native.js";

const BOXES = [["ol", "https://outlook.office.com/mail/"], ["gm", "https://mail.google.com/mail/u/0/"]];
const LOGIN = /pick an account|sign in|se connecter|choisir un compte|mot de passe|password/i;
const INBOX = /bo[iî]te de r[ée]ception|inbox|non lus|unread/i;

async function snap() {
  for (const [id] of BOXES) {
    try {
      const t = await web.text(id, 5000);
      if (!t || (LOGIN.test(t) && !INBOX.test(t))) { await api.post("/api/webmail", { id, text: "" }); continue; }
      await api.post("/api/webmail", { id, text: t });
    } catch {}
  }
}

export function startWebMailSync() {
  if (!isNative()) return;
  // Précharge les volets (1×1 px, aussitôt masqués) si l'utilisateur ne les a pas encore ouverts.
  setTimeout(() => {
    BOXES.forEach(([id, url]) => web.show(id, url, { x: 0, y: 0, w: 2, h: 2 }));
    setTimeout(() => web.hideAll(), 400);
  }, 4000);
  setTimeout(snap, 25000);
  setInterval(snap, 240000);
  window.addEventListener("nova:mail-sync", snap);
}
