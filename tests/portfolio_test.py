#!/usr/bin/env python3
"""Portefeuilles SBIF : lecture de vrais relevés PDF (tests/data), calculs, dossier surveillé, verrou du coffre."""
import json, os, subprocess, tempfile, time, http.client, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = os.environ.get("NOVA_BIN", "/tmp/bt/release/nova-server")
fails = []
def check(ok, msg):
    print(("  OK   " if ok else "  FAIL ") + msg)
    if not ok: fails.append(msg)
real = os.path.expanduser("~"); home = tempfile.mkdtemp(prefix="novatest_", dir=real); nh = tempfile.mkdtemp()
env = dict(os.environ, NOVA_HOME=nh, HOME=home)
p = subprocess.Popen([BIN, "--port", "0", "--web", ROOT + "/web", "--token", "tok"], env=env, stdout=subprocess.PIPE, text=True)
port = int(p.stdout.readline().split("port=")[1].split()[0]); V = {}
def call(path, body=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=60)
    c.request("POST" if body is not None else "GET", path, json.dumps(body) if body is not None else None, dict({"Cookie": "nova_t=tok", "Content-Type": "application/json"}, **V)); r = c.getresponse(); d = r.read(); return r.status, json.loads(d or b"{}")
try:
    check(call("/api/portfolio")[0] == 423, "portefeuilles refusés tant que le coffre est verrouillé")
    call("/api/vault/setup", {"salt": "a" * 16, "hash": "b" * 32}); s, d = call("/api/vault/unlock", {"hash": "b" * 32}); V["x-vault"] = d["token"]
    for n in (6, 7):
        shutil.copy(f"{ROOT}/tests/data/sbif{n}.pdf", f"{home}/sbif{n}.pdf")
        s, d = call("/api/portfolio/import", {"path": f"{home}/sbif{n}.pdf"}); check(s == 200, f"relevé {n} lu : {d}")
    s, d = call("/api/portfolio"); a = d["accounts"]
    check(set(a) == {"0077431008", "0106631038"}, "deux comptes reconnus : %s" % list(a))
    A, B = a["0077431008"], a["0106631038"]
    check(len(A["positions"]) == 29, "compte 1 : %d lignes" % len(A["positions"]))
    check(len(B["positions"]) == 8, "compte 2 : 8 lignes (dont nom coupé « BRIDGE BANK GROUP ») : %d" % len(B["positions"]))
    check(abs(B["total_releve"] - 3710424) < 1 and abs(B["cash"] - 502) < 1, "compte 2 : total 3 710 424 et liquidité 502")
    check(abs(A["total_releve"] - 17229561) < 1 and abs(A["cash"] - 6451) < 1, "compte 1 : total 17 229 561 et liquidité 6 451")
    sv = sum(x["valeur_releve"] for x in A["positions"]) + A["cash"]; check(abs(sv - A["total_releve"]) < 1, "compte 1 : somme des lignes = total du relevé (%s)" % sv)
    sv = sum(x["valeur_releve"] for x in B["positions"]) + B["cash"]; check(abs(sv - B["total_releve"]) < 1, "compte 2 : somme des lignes = total du relevé (%s)" % sv)
    check(all(x["sym"] for x in A["positions"] + B["positions"]), "tous les titres ont un symbole BRVM : %s" % [x["name"] for x in A["positions"] + B["positions"] if not x["sym"]])
    etit = [x for x in B["positions"] if x["name"] == "ETIT"][0]; check(etit["qty"] == 10122, "quantité « 10 122 » lue en un seul nombre")
    # dossier surveillé
    W = real + "/Nova-Finances"; os.makedirs(W, exist_ok=True); call("/api/portfolio/remove", {"account": "0106631038"}); shutil.copy(f"{ROOT}/tests/data/sbif7.pdf", W + "/nouveau.pdf")
    s, d = call("/api/portfolio/refresh", {}); print("   refresh:", s, d)
    check("0106631038" in call("/api/portfolio")[1]["accounts"], "le PDF déposé dans Nova-Finances est importé automatiquement")
    # compte saisi / déposé en JSON (Africam)
    st, d = call("/api/portfolio/manual", {"account": "Africam", "kind": "Compte Africam", "invested": 1059211, "positions": [{"name": "SONATEL", "qty": 10, "cmp": 20000}]})
    check(st == 200, "compte manuel Africam enregistré : %s" % d)
    open(W + "/africam2.json", "w").write(json.dumps({"account": "Africam2", "total_releve": 1336570, "invested": 1059211}))
    call("/api/portfolio/refresh", {}); aa = call("/api/portfolio")[1]["accounts"]
    check("Africam2" in aa and abs(aa["Africam2"]["total_releve"] - 1336570) < 1, "JSON déposé dans Nova-Finances importé")
    check(aa["Africam"]["positions"][0]["sym"] == "SNTS" and abs(aa["Africam"]["total_releve"] - 200000) < 1, "positions manuelles : symbole BRVM + total")
    check(call("/api/portfolio/import", {"path": "/etc/passwd"})[0] == 400, "import hors de ton dossier refusé")
finally:
    p.terminate(); shutil.rmtree(real + "/Nova-Finances", ignore_errors=True); shutil.rmtree(home, ignore_errors=True)
print("\nTOUT VERT." if not fails else "\n%d échec(s)." % len(fails)); raise SystemExit(1 if fails else 0)
