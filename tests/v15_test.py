#!/usr/bin/env python3
"""V15 : journal d'actions + annulation, mémoire contrôlée (sans mémoire, rétention, export), import des automatismes. python3 tests/v15_test.py"""
import json, os, subprocess, tempfile, http.client
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = os.environ.get("NOVA_BIN", "/tmp/bt/release/nova-server")
fails = []
def check(ok, msg):
    print(("  OK   " if ok else "  FAIL ") + msg)
    if not ok: fails.append(msg)
nh = tempfile.mkdtemp()
p = subprocess.Popen([BIN, "--port", "0", "--web", ROOT + "/web", "--token", "tok"], env=dict(os.environ, NOVA_HOME=nh), stdout=subprocess.PIPE, text=True)
port = int(p.stdout.readline().split("port=")[1].split()[0])
H = {"Cookie": "nova_t=tok", "Content-Type": "application/json"}
def call(path, body=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=40)
    c.request("POST" if body is not None else "GET", path, json.dumps(body) if body is not None else None, H); r = c.getresponse(); return r.status, json.loads(r.read() or b"{}")
try:
    # outils exposés par /api/tool ? sinon via l'endpoint générique d'Extras
    st, _ = call("/api/tool", {"name": "remember", "arg": "mon sujet suivi est la BRVM test"})
    check(st == 200, "outil remember exécuté (HTTP %s)" % st)
    st, a = call("/api/actions"); items = a.get("items", [])
    e = next((x for x in items if x["tool"] == "remember"), None)
    check(e is not None and e["effect"] == "écrit" and e.get("undo"), "action journalisée, annulable")
    st, m = call("/api/memory"); check(any("BRVM test" in x["text"] for x in m["items"]), "souvenir présent")
    st, u = call("/api/actions/undo", {"id": e["id"]}); check("effacé" in u["message"], "annulation : " + u["message"])
    st, m = call("/api/memory"); check(not any("BRVM test" in x["text"] for x in m["items"]), "souvenir effacé après annulation")
    st, u = call("/api/actions/undo", {"id": e["id"]}); check("Déjà" in u["message"] or "absent" in u["message"], "double annulation sans effet : " + u["message"])
    call("/api/memory/settings", {"off": True}); st, r = call("/api/memory/add", {"text": "ne doit pas être retenu"})
    st, m = call("/api/memory"); check(not any("ne doit pas" in x["text"] for x in m["items"]), "mode sans mémoire : rien retenu")
    call("/api/memory/settings", {"off": False}); call("/api/memory/add", {"text": "Mon solde bancaire est confidentiel"})
    st, s = call("/api/memory/settings", {"sensitive_days": 0}); check(s["sensitive_days"] == 0 and s["off"] is False, "réglages enregistrés")
    st, x = call("/api/memory/export"); check(len(x["items"]) >= 1 and "settings" in x, "export JSON")
    it = json.load(open(ROOT + "/web/docs/automatismes_import.json"))
    st, r = call("/api/dots/import", {"items": it}); check(r["imported"] == len(it), "import : %s Dots" % r["imported"])
    st, r = call("/api/dots/import", {"items": it}); check(r["imported"] == 0, "import idempotent")
    st, d = call("/api/dots"); ids = [x["id"] for x in d["items"]]
    check("imp-rapport-matin" in ids, "Dot du matin présent")
finally:
    p.kill()
print("TOUT VERT." if not fails else "ÉCHECS : %d" % len(fails)); raise SystemExit(1 if fails else 0)
