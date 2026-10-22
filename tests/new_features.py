#!/usr/bin/env python3
"""Connaissances (indexation + exclusions + masquage) et Dots (planificateur, attente, report) sur le VRAI serveur. python3 tests/new_features.py"""
import json, os, subprocess, sys, tempfile, time, http.client, threading
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = os.environ.get("NOVA_BIN", "/tmp/bt/release/nova-server")
fails = []
def check(ok, msg):
    print(("  OK   " if ok else "  FAIL ") + msg)
    if not ok: fails.append(msg)
real = os.path.expanduser("~"); home = tempfile.mkdtemp(prefix="novatest_", dir=real); nh = tempfile.mkdtemp()
os.makedirs(home + "/docs/sub"); os.makedirs(home + "/docs/.git")
open(home + "/docs/charte_teams.md", "w").write("# Charte Teams\n\nToujours un message poli : salutation, une phrase de contexte, points clés en liste, action demandée en gras.\n\nLe rouge Nova impérial est la couleur d'accent.\n")
open(home + "/docs/mot_de_passe_banque.md", "w").write("mot de passe du compte : zzz-secret-unique\n")
open(home + "/docs/notes.md", "w").write("Réunion budget.\napi_key: sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456\nLe plan du projet Alpha est validé.\n")
open(home + "/docs/.git/x.md", "w").write("fichier git secretgit")
open(home + "/docs/sub/finance_sbif.md", "w").write("solde SBIF 123456 secretfinance")
env = dict(os.environ, NOVA_HOME=nh)
p = subprocess.Popen([BIN, "--port", "0", "--web", ROOT + "/web", "--token", "tok"], env=env, stdout=subprocess.PIPE, text=True)
port = int(p.stdout.readline().split("port=")[1].split()[0])
H = {"Cookie": "nova_t=tok", "Content-Type": "application/json"}
def call(path, body=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=40)
    c.request("POST" if body is not None else "GET", path, json.dumps(body) if body is not None else None, H); r = c.getresponse(); d = r.read(); return r.status, json.loads(d or b"{}")
events = []
def listen():
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=60); c.request("GET", "/api/events", headers=H); r = c.getresponse(); ev = None
    while True:
        l = r.fp.readline().decode()
        if not l: break
        l = l.strip()
        if l.startswith("event:"): ev = l[6:].strip()
        elif l.startswith("data:") and ev: events.append((ev, json.loads(l[5:])))
try:
    threading.Thread(target=listen, daemon=True).start(); time.sleep(0.5)
    s, d = call("/api/knowledge/roots", {"roots": ["~/" + os.path.basename(home) + "/docs", "/etc"]}); check(s == 200, "dossiers enregistrés")
    s, d = call("/api/knowledge/scan", {}); check(s == 200, "indexation lancée")
    for _ in range(40):
        time.sleep(0.5); st = call("/api/knowledge/status")[1]["status"]
        if not st["scanning"] and st.get("state") == "ok": break
    check(st["state"] == "ok" and st["files"] == 2, "2 fichiers indexés (charte + notes) : %s" % st)
    check(st["skipped"] >= 1, "fichier de mot de passe exclu : %s exclus" % st["skipped"])
    check(st["masked"] == 1, "ligne de clé API masquée (%s)" % st["masked"])
    r = call("/api/knowledge/search?q=" + "charte%20teams%20salutation")[1]["items"]
    check(r and r[0]["file"] == "charte_teams.md", "recherche : la charte Teams remonte en premier")
    check(not call("/api/knowledge/search?q=zzz-secret-unique")[1]["items"], "le mot de passe n'est pas indexé")
    check(not call("/api/knowledge/search?q=secretfinance")[1]["items"], "finance exclue")
    check(not call("/api/knowledge/search?q=secretgit")[1]["items"], ".git exclu")
    check(not call("/api/knowledge/search?q=ABCDEFGHIJKLMNOPQRSTUVWXYZ123456")[1]["items"], "la clé API masquée n'est pas retrouvable")
    check(call("/api/knowledge/search?q=plan%20projet%20Alpha")[1]["items"][0]["file"] == "notes.md", "recherche d'un autre document")
    s, d = call("/api/tool", {"name": "know", "arg": "charte teams"}); check("charte_teams.md" in d.get("output", ""), "outil know utilisable par l'assistant")
    # Dots
    items = call("/api/dots")[1]["items"]; ids = {i["id"]: i for i in items}
    check("bilan" in ids and ids["bilan"]["schedule"] == "18:30" and all(k in ids for k in ("brvm","mac","redacteur")), "Dots prêts à l emploi (bilan, brvm, mac, redacteur) ; Dot « Bilan du jour » présent avec horaire 18:30")
    check(ids["veille"]["schedule"] == "07:30", "horaires par défaut posés")
    s, d = call("/api/dots/launch", {"id": "agenda"}); check(s == 200, "lancement manuel d'un Dot")
    for _ in range(60):
        time.sleep(0.5)
        if any(e == "dot" and x.get("phase") == "ready" for e, x in events): break
    ph = [x["phase"] for e, x in events if e == "dot"]
    check("working" in ph and "ready" in ph and ph.index("working") < ph.index("ready"), "le Dot apparaît (working) puis livre (ready) : %s" % ph)
    w = call("/api/dots/waiting")[1]["items"]; check(len(w) == 1 and w[0]["dot"] == "agenda", "le Dot attend (non acquitté)")
    rid = w[0]["run_id"]; call("/api/dots/snooze", {"run_id": rid, "minutes": 30}); check(call("/api/dots/waiting")[1]["items"] == [], "reporté : n'apparaît plus avant l'heure")
    call("/api/dots/ack", {"run_id": rid}); check(call("/api/dots/waiting")[1]["items"] == [], "acquitté")
    call("/api/settings", {"quiet_from": "00:00", "quiet_to": "00:00"})
    # planification : créneau = maintenant
    now = time.localtime(time.time() + 60); sl = "%02d:%02d" % (now.tm_hour, now.tm_min)
    dd = ids["courrier"]; dd["schedule"] = sl; call("/api/dots/save", dd); n0 = len([1 for e, x in events if e == "dot" and x.get("dot") == "courrier"])
    for _ in range(260):
        time.sleep(0.5)
        if any(e == "dot" and x.get("dot") == "courrier" for e, x in events): break
    check(any(e == "dot" and x.get("dot") == "courrier" and x.get("phase") == "ready" or x.get("dot") == "courrier" for e, x in events), "le planificateur déclenche le Dot à l'heure prévue (%s)" % sl)
finally:
    p.terminate()
print("\n%d échec(s)." % len(fails) if fails else "\nTOUT VERT."); sys.exit(1 if fails else 0)
