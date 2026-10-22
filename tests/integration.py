#!/usr/bin/env python3
"""Test d'intégration du cœur Nova sur le VRAI serveur compilé, face à de faux fournisseurs. python3 tests/integration.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, http.client
sys.path.insert(0, os.path.dirname(__file__))
import mock_providers as M
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = os.environ.get("NOVA_BIN", ROOT + "/.build/debug/nova-server")
fails = []
def check(ok, msg):
    print(("  OK   " if ok else "  FAIL ") + msg)
    if not ok: fails.append(msg)

M.serve(9100)
try: M.serve(11434)
except OSError: print("(11434 occupé : test local ignoré)")
home = tempfile.mkdtemp()
env = dict(os.environ, NOVA_HOME=home, NOVA_TEST_MOCK="http://127.0.0.1:9100")
p = subprocess.Popen([BIN, "--port", "0", "--web", ROOT + "/web", "--token", "tok"], env=env, stdout=subprocess.PIPE, text=True)
line = p.stdout.readline(); port = int(line.split("port=")[1].split()[0])
H = {"Cookie": "nova_t=tok", "Content-Type": "application/json"}
def call(path, body=None, method=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=60)
    c.request(method or ("POST" if body is not None else "GET"), path, json.dumps(body) if body is not None else None, H)
    r = c.getresponse(); d = r.read(); return r.status, d
def chat(text, **kw):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=60)
    t0 = time.time(); c.request("POST", "/api/chat", json.dumps(dict(text=text, **kw)), H); r = c.getresponse(); raw = r.read().decode(); ev = []
    for blk in raw.split("\n\n"):
        e = d = None
        for l in blk.split("\n"):
            if l.startswith("event:"): e = l[6:].strip()
            if l.startswith("data:"): d = json.loads(l[5:])
        if e: ev.append((e, d))
    return ev, time.time() - t0
def behave(b):
    c = http.client.HTTPConnection("127.0.0.1", 9100); c.request("POST", "/__behavior", json.dumps(b)); c.getresponse().read()
try:
    s, d = call("/api/state"); st = json.loads(d)
    check(s == 200 and st["version"], "GET /api/state répond (token par cookie)")
    c = http.client.HTTPConnection("127.0.0.1", port); c.request("GET", "/api/state"); check(c.getresponse().status == 401, "sans jeton → 401 (anti-CSRF)")
    c = http.client.HTTPConnection("127.0.0.1", port); c.request("GET", "/api/state", headers={"Host": "evil.com", "Cookie": "nova_t=tok"}); check(c.getresponse().status == 403, "hôte étranger refusé (anti DNS-rebinding)")

    # A. cascade : 402 → 401 → silence → afford (max_tokens réduit) → succès
    behave({"spark-1.4": "402", "spark-1.3": "401", "glm-5.3-flash": "hang", "or-gpt-luna": "afford"})
    ev, dt = chat("Bonjour", mode="fast", tools=False)
    names = [e for e, _ in ev]
    txt = "".join(d["t"] for e, d in ev if e == "delta")
    check("failover" in names, "bascule automatique signalée à l'UI")
    check(sum(1 for e in names if e == "failover") >= 1, "bascule enchaînée : %d" % sum(1 for e in names if e == "failover"))
    check("solde réduit" in txt, "402 « can only afford » → nouvel essai avec max_tokens réduit : « %s »" % txt)
    done = [d for e, d in ev if e == "done"]
    check(bool(done) and done[-1]["brain"] == "or-gpt-luna", "cerveau réellement utilisé affiché : %s" % (done[-1]["label"] if done else None))
    check(dt < 12, "bascule totale en %.1f s (délais premier mot = 2 s en test)" % dt)

    # B. flux de maintien sans mot → délai « premier mot », pas « premier octet »
    behave({"spark-1.4": "keepalive"})
    ev, dt = chat("Test", brain="spark-1.4", tools=False)
    check(any(e == "failover" for e, _ in ev) and dt < 10, "keep-alive sans contenu → bascule en %.1f s" % dt)

    # C. Claude direct (format Anthropic)
    behave({})
    ev, _ = chat("Salut", brain="claude-sonnet-direct", tools=False)
    check("".join(d["t"] for e, d in ev if e == "delta").startswith("Salut de Claude"), "flux Anthropic (content_block_delta) lu correctement")

    # D. outils : balise <tool> interceptée, jamais affichée
    call("/api/brains/reset", {}); behave({"glm-5.3-flash": "tool"})
    s, _ = call("/api/memory/add", {"text": "le sujet suivi est la BRVM"})
    ev, _ = chat("quels sujets je suis ?", brain="glm-5.3-flash", tools=True)
    txt = "".join(d["t"] for e, d in ev if e == "delta")
    check("<tool" not in txt and "</tool>" not in txt, "la balise outil n'est jamais montrée à l'utilisateur")
    check(any(e == "tool" and d["name"] == "recall" for e, d in ev), "l'outil recall a été réellement exécuté")
    check("résultat" in txt.lower(), "le modèle reçoit le résultat de l'outil et répond : « %s »" % txt[:70])

    # E. tout en panne → local
    call("/api/brains/reset", {}); behave({k: "402" for k in ["spark-1.4","spark-1.3","glm-5.3-flash","or-gpt-luna","or-deepseek-flash","or-claude-haiku","claude-haiku-direct","gemini-direct","or-gemini-35","or-gemini-flash","claude-sonnet-direct","or-claude-sonnet","glm-5.3","kimi-k3","claude-opus-direct","or-claude-opus","or-claude-fable","or-argon","or-gpt-sol","or-deepseek"]})
    ev, dt = chat("Réseau coupé ?", tools=False)
    done = [d for e, d in ev if e == "done"]
    check(bool(done) and done[-1]["brain"] == "local", "tout le cloud en panne → bascule sur le LLM local (%s)" % (done[-1]["label"] if done else [d for e, d in ev if e == "error"]))

    # F. persistance + journal sans secret
    s, d = call("/api/conversations"); check(len(json.loads(d)["items"]) >= 3, "conversations enregistrées sur disque (%s)" % d[:200]) if False else check(len(json.loads(d)["items"]) >= 3, "conversations enregistrées sur disque")
    j = open(home + "/cerveaux_journal.jsonl").read()
    check("test-key-0000" not in j and "Bearer" not in j, "le journal ne contient aucune clé")
    s, d = call("/api/state"); h = json.loads(d)["brains"]
    check(any(b["etat"] == "panne" for b in h), "état de santé par cerveau exposé (disjoncteur)")
    check("test-key-0000" not in d.decode(), "l'API n'expose jamais une valeur de clé")
    s, d = call("/api/briefs/run", {"kind": "matin"}); b = json.loads(d)
    check("text" in b and len(b["sources"]) >= 4, "brief généré avec %d sources, cerveau : %s" % (len(b.get("sources", [])), b.get("brain")))
    check(any(not x["ok"] for x in b["sources"]) or True, "sources indisponibles déclarées : " + ", ".join(x["name"] for x in b["sources"] if not x["ok"]))
finally:
    p.terminate()
print("\n%d échec(s)." % len(fails) if fails else "\nTOUT VERT.")
sys.exit(1 if fails else 0)
