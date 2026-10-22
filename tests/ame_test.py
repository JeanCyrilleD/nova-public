#!/usr/bin/env python3
"""Âme de Nova : documents, stats réelles, pardon, héritage, skills, plan/orchestre (sans cerveau : échec propre), silence. python3 tests/ame_test.py"""
import json, os, subprocess, sys, tempfile, time, http.client
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = os.environ.get("NOVA_BIN", "/tmp/bt/release/nova-server")
fails = []
def check(ok, msg):
    print(("  OK   " if ok else "  FAIL ") + msg)
    if not ok: fails.append(msg)
nh = tempfile.mkdtemp(); fakehome = tempfile.mkdtemp()
env = dict(os.environ, NOVA_HOME=nh, HOME=fakehome)
p = subprocess.Popen([BIN, "--port", "0", "--web", ROOT + "/web", "--token", "tok"], env=env, stdout=subprocess.PIPE, text=True)
port = int(p.stdout.readline().split("port=")[1].split()[0]); H = {"Cookie": "nova_t=tok", "Content-Type": "application/json"}
def call(path, body=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=60); c.request("POST" if body is not None else "GET", path, json.dumps(body) if body is not None else None, H)
    r = c.getresponse(); d = r.read(); return r.status, (json.loads(d) if d else {})
try:
    s, d = call("/api/ame/doc", {"name": "valeurs", "data": [{"id": "a", "text": "test", "on": True}]}); check(s == 200, "valeurs enregistrées")
    s, d = call("/api/ame/doc?name=valeurs"); check(d["data"][0]["text"] == "test", "valeurs relues")
    s, d = call("/api/ame/doc?name=../etc/passwd"); check(s == 400, "nom de document hors liste refusé")
    s, d = call("/api/ame/doc", {"name": "relations", "data": [{"id": "r", "name": "Awa", "cadence": 7}]}); check(s == 200, "relations enregistrées")
    # conversation + mémoire réelles → stats
    for t in ["Je prépare le budget SBIF pour la réunion", "Le budget SBIF avance, charte Teams à revoir", "charte Teams validée aujourd'hui"]:
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=120); c.request("POST", "/api/chat", json.dumps({"text": t, "tools": False}), H); c.getresponse().read()
    s, d = call("/api/memory/add", {"text": "Je préfère les messages courts"}); mid = d["item"]["id"]
    s, d = call("/api/ame/stats"); check(s == 200 and len(d["heures"]) == 24 and len(d["jours"]) == 14, "stats : 24 heures, 14 jours")
    check(d["messages_60j"] >= 3, "stats comptent les vrais messages (%s)" % d["messages_60j"]); check(d["souvenirs"] == 1, "stats comptent la mémoire")
    check(d["plafond"] == 6, "plafond de silence par défaut = 6")
    s, d = call("/api/ame/pardon", {"id": mid}); check(d.get("forgiven") is True, "pardon : fait marqué pardonné")
    s, d = call("/api/ame/memoire"); check(d["items"][0].get("forgiven") is True, "pardon persisté")
    s, d = call("/api/ame/pardon", {"id": "nope"}); check(s == 404, "pardon d'un fait inconnu → 404")
    s, d = call("/api/ame/heritage", {}); check(d.get("ok") and os.path.isfile(os.path.join(fakehome, "NOVA_ECHANGE", os.listdir(os.path.join(fakehome, "NOVA_ECHANGE"))[0], "memoire.json")), "héritage écrit : " + str(d.get("path")))
    hd = os.path.join(fakehome, "NOVA_ECHANGE", os.listdir(os.path.join(fakehome, "NOVA_ECHANGE"))[0]); blob = "".join(open(os.path.join(hd, f), errors="ignore").read() for f in os.listdir(hd))
    check("sk-" not in blob and "api_key" not in blob.lower(), "héritage : aucune clé")
    s, d = call("/api/ame/skills/save", {"name": "Message Teams!", "body": "# Teams\nRédige dans la charte."}); check(d.get("name") == "message-teams", "skill enregistrée (nom assaini)")
    s, d = call("/api/ame/skills"); check(any(x["name"] == "message-teams" for x in d["items"]), "skill listée")
    s, d = call("/api/ame/skills/run", {"name": "../../x"}); check(s == 404, "skill hors dossier refusée")
    s, d = call("/api/ame/llm", {"kind": "inconnu"}); check(s == 400, "intelligence inconnue refusée")
    s, d = call("/api/ame/llm", {"kind": "jumeau", "input": ""}); check(s == 400, "jumeau sans décision refusé")
    s, d = call("/api/ame/llm", {"kind": "reve"}); check("text" in d or "error" in d, "rêve répond proprement")
    s, d = call("/api/ame/orchestre/run", {"goal": "g", "steps": [{"titre": "t", "task": "x"}]}); rid = d["id"]
    for _ in range(60):
        time.sleep(1); s, r = call("/api/ame/orchestre/run?id=" + rid)
        if r.get("done"): break
    check(r.get("done") is True and r["steps"][0]["status"] in ("fait", "échec"), "orchestre termine proprement (%s)" % r["steps"][0]["status"])
    s, d = call("/api/ame/corps"); check(s == 200 and d["seuil_min"] == 90, "corps : seuil 90 min, mesurable=%s" % d["mesurable"])
    s, d = call("/api/ame/corps/test", {}); check(s == 200, "rappel de test")
finally:
    p.terminate()
print("\n" + ("TOUT VERT" if not fails else "ÉCHECS : %d" % len(fails)))
sys.exit(1 if fails else 0)
