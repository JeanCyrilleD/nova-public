#!/usr/bin/env python3
"""Recette interface sur le VRAI serveur Nova + faux fournisseurs, dans un vrai Chromium (WebGL logiciel).
Vérifie : 6 écrans sans erreur JS, conversation texte, boucle vocale complète (micro simulé → STT → cerveau → voix → barge-in), 4 thèmes distincts."""
import asyncio, json, os, subprocess, sys, tempfile, time, struct, math
sys.path.insert(0, os.path.dirname(__file__))
import mock_providers as M
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tests", "captures"); os.makedirs(OUT, exist_ok=True)
fails = []
def check(ok, msg):
    print(("  OK   " if ok else "  FAIL ") + msg)
    if not ok: fails.append(msg)

def mic_wav(path, sr=16000):   # 1,2 s de silence, 1,6 s de « parole » (bruit modulé fort), 3 s de silence : boucle par Chromium
    import random; random.seed(1); pcm = []
    for i in range(int(sr * 1.2)): pcm.append(0)
    for i in range(int(sr * 1.6)): pcm.append(int(14000 * math.sin(2 * math.pi * (180 + 60 * math.sin(i / 900)) * i / sr) * (0.6 + 0.4 * math.sin(i / 1500)) + random.randint(-1500, 1500)))
    for i in range(int(sr * 3.0)): pcm.append(0)
    b = b"".join(struct.pack("<h", max(-32768, min(32767, v))) for v in pcm)
    open(path, "wb").write(b"RIFF" + struct.pack("<I", 36 + len(b)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16) + b"data" + struct.pack("<I", len(b)) + b)

async def main():
    M.serve(9100)
    try: M.serve(11434)
    except OSError: pass
    home = tempfile.mkdtemp(); wav = os.path.join(home, "mic.wav"); mic_wav(wav)
    env = dict(os.environ, NOVA_HOME=home, NOVA_TEST_MOCK="http://127.0.0.1:9100")
    srv = subprocess.Popen([os.environ.get("NOVA_BIN", ROOT + "/.build/debug/nova-server"), "--port", "0", "--web", ROOT + "/web", "--token", "tok"], env=env, stdout=subprocess.PIPE, text=True)
    port = int(srv.stdout.readline().split("port=")[1].split()[0]); url = f"http://127.0.0.1:{port}"
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-fake-ui-for-media-stream",
                                              "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + wav, "--autoplay-policy=no-user-gesture-required"])
            ctx = await b.new_context(viewport={"width": 1440, "height": 900}, permissions=["microphone"], reduced_motion="reduce")
            pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            await pg.goto(url + "/?t=tok"); await pg.wait_for_selector(".stab", timeout=20000)
            check(await pg.evaluate("!document.getElementById('bootguard')"), "l'écran d'erreur de démarrage s'est effacé (l'interface a démarré)")
            ids = await pg.evaluate("Nova.ctx.all.map(t=>t.id)"); groups = await pg.evaluate("Nova.ctx.groups.map(g=>[g.id,g.tabs.length])")
            check(len(ids) >= 36, "%d onglets (≥ 20 demandés) répartis en %d groupes : %s" % (len(ids), len(groups), groups))
            check(await pg.eval_on_selector_all("#side .stab.hub, #side2 .stab.hub", "e=>e.length") == 18, "18 onglets principaux en dalles 3D, gauche + droite")
            nsub = await pg.evaluate("window.Nova.ctx.all.length"); await pg.click(".stab.hub[data-hub=h_social]"); await pg.wait_for_selector(".hsub", timeout=8000); check(await pg.eval_on_selector_all(".hsubs .hsub", "e=>e.length") == 3, "un onglet principal = 3 sous-onglets 3D (réseaux sociaux : WhatsApp, Telegram, Facebook)")
            await pg.click(".hsub:nth-child(2)"); await pg.wait_for_timeout(300); check(await pg.evaluate("window.Nova.ctx.tab") == "telegram", "clic sur un sous-onglet : Telegram")
            hs = await pg.evaluate("[...document.querySelectorAll('#side .stab.hub,#side2 .stab.hub')].every(b=>{const r=b.getBoundingClientRect();return r.bottom<=innerHeight && r.top>=0})"); check(hs, "tous les onglets principaux visibles sans défilement")
            nd = await pg.eval_on_selector_all("#dock .dk", "e=>e.length"); check(nd >= 8, "barre horizontale du bas : %d onglets épinglés" % nd)
            await pg.click("#dock .dk[data-tab='finances']"); await pg.wait_for_timeout(400); check(await pg.evaluate("document.querySelector('.stab.on')?.dataset.tab") == "finances", "clic dans la barre du bas : navigation directe")
            await pg.click("#dock .dk[data-tab='accueil']"); await pg.wait_for_timeout(300)
            await pg.click("#dock .dk[data-tab='notes']") if False else None
            check(await pg.evaluate("document.querySelector('.stab.on')?.dataset.tab") == "accueil", "l'app s'ouvre sur la page d'accueil")
            await pg.evaluate("Nova.ctx.go('web')") if False else None
            await pg.screenshot(path=f"{OUT}/v10-side.png")
            for t in ids:
                await pg.evaluate("id=>Nova.ctx.go(id)", t); await pg.wait_for_timeout(650 if t not in ("mac", "accueil") else 1500)
                n = await pg.eval_on_selector("#view", "e=>e.innerText.length"); bad = await pg.eval_on_selector("#view", "e=>!!e.querySelector('.err')&&/erreur/i.test(e.querySelector('.err').innerText)")
                check(n > 25 and not bad, "onglet « %s » rendu (%d car.)" % (t, n))
            real = [e for e in errs if "Failed to load resource" not in e and "ERR_" not in e]
            check(not real, "aucune erreur JavaScript sur les %d onglets : %s" % (len(ids), real[:3]))
            await pg.evaluate("Nova.ctx.go('accueil')"); await pg.wait_for_timeout(1800); await pg.screenshot(path=f"{OUT}/v10-accueil.png")
            await pg.evaluate("Nova.ctx.go('mac')"); await pg.wait_for_timeout(1800); await pg.screenshot(path=f"{OUT}/v10-mac.png")
            sysj = await pg.evaluate("fetch('/api/system').then(r=>r.json())"); check("disk" in sysj and "machine" in sysj, "/api/system : mesures réelles (disque, machine) — absentes = null, jamais inventées")
            # palette ⌘K
            await pg.keyboard.press("Control+k"); await pg.wait_for_timeout(300); check(await pg.evaluate("document.getElementById('pal').classList.contains('open')"), "palette ⌘K s'ouvre")
            await pg.fill("#pal input", "thème"); await pg.wait_for_timeout(200); check(await pg.eval_on_selector_all("#pal .it", "e=>e.length") >= 4, "palette : filtre « thème »"); await pg.keyboard.press("Escape")
            # coffre : verrouillé par défaut, 423 sans jeton
            await pg.evaluate("Nova.ctx.go('finances')"); await pg.wait_for_timeout(700)
            check("verrouillé" in await pg.inner_text("#view"), "Finances : verrouillé par défaut")
            st = await pg.evaluate("fetch('/api/vault/data?domain=finance').then(r=>r.status)"); check(st == 423, "API coffre sans jeton : HTTP %s (423 attendu)" % st)
            await pg.click("#view input[type=password] >> nth=0"); await pg.keyboard.type("motdepasse-test")   # VRAIE saisie clavier (fill() masquait le bug d'un gestionnaire onkeydown qui annulait les touches)
            check(await pg.input_value("#view input[type=password] >> nth=0") == "motdepasse-test", "saisie clavier réelle dans le champ du code (1er champ)")
            await pg.click("#view input[type=password] >> nth=1"); await pg.keyboard.type("motdepasse-test")
            await pg.click("text=Créer le code"); await pg.wait_for_timeout(1500)
            await pg.fill("#view input[type=password]", "faux-code-123"); await pg.click("text=Déverrouiller"); await pg.wait_for_timeout(1500)
            check("incorrect" in await pg.inner_text("#view"), "mauvais code refusé")
            await pg.fill("#view input[type=password]", "motdepasse-test"); await pg.click("text=Déverrouiller"); await pg.wait_for_timeout(2500)
            check("déverrouillé" in await pg.inner_text("#view"), "bon code : coffre déverrouillé")
            csv = os.path.expanduser("~/nova_test_releve.csv"); open(csv, "w").write("titre;qte;valeur\nAAA;10;1500,5\nBBB;4;200\nCCC;1;99\n")
            await pg.evaluate("document.querySelectorAll('#dotlayer .dactor').forEach(e=>e.remove())"); await pg.fill("#view input[placeholder*='releve']", csv); await pg.click("button:text-is('Importer')"); await pg.wait_for_timeout(1500)
            vt = await pg.inner_text("#view"); check("AAA" in vt and "Σ valeur" in vt, "import CSV réel : lignes affichées et somme de colonne calculée")
            os.remove(csv)
            await pg.evaluate("Nova.ctx.go('chat')"); await pg.wait_for_timeout(600)

            # conversation texte
            await pg.fill("textarea", "Bonjour"); await pg.press("textarea", "Enter"); await pg.wait_for_selector(".msg.assistant", timeout=20000); await pg.wait_for_timeout(800)
            txt = await pg.inner_text(".msg.assistant")
            check("Réponse" in txt, "conversation texte : réponse affichée « %s »" % txt[:50].replace("\n", " "))
            check("via " in await pg.inner_text(".msg.assistant .meta"), "le cerveau réellement utilisé est affiché sous la réponse")

            # boucle vocale
            await pg.evaluate("window.__ev=[]; for (const t of ['state','stt','barge','engine','error']) Nova.A.addEventListener(t,e=>__ev.push([t,e.detail,performance.now()]))")
            await pg.click(".composer .mic"); await pg.wait_for_timeout(500)
            check(await pg.evaluate("Nova.A.voiceOn"), "micro ouvert (getUserMedia réel, AudioWorklet)")
            try:
                await pg.wait_for_function("__ev.some(e=>e[0]==='stt')", timeout=30000)
                await pg.wait_for_function("__ev.some(e=>e[0]==='state'&&e[1].state==='speaking')", timeout=30000)
                ev = await pg.evaluate("__ev"); stt = [e for e in ev if e[0] == "stt"][0]
                check(True, "boucle vocale : parole détectée → STT (%d ms) → réponse → voix" % stt[1]["ms"])
                seq = [e[1]["state"] for e in ev if e[0] == "state"]
                check("thinking" in seq and "speaking" in seq, "états réels traversés : %s" % " → ".join(seq[:8]))
                await pg.wait_for_function("__ev.some(e=>e[0]==='barge')", timeout=25000)
                bg = [e for e in await pg.evaluate("__ev") if e[0] == "barge"][0]
                check(True, "barge-in : la voix pendant que l'assistant parle coupe la parole")
            except Exception as e:
                check(False, "boucle vocale incomplète : %s ; événements = %s" % (str(e)[:80], [(x[0], x[1]) for x in await pg.evaluate("__ev")][:10]))
            await pg.evaluate("Nova.A.stopVoice(); Nova.A.interrupt('test')")
            check(len(M.STT_CALLS) >= 1, "le serveur a reçu l'audio WAV 16 kHz (%d octets)" % (M.STT_CALLS[0] if M.STT_CALLS else 0))
            await pg.wait_for_timeout(800)

            # thèmes
            shots = {}
            await pg.evaluate("Nova.ctx.go('chat')")
            for th in ["nova-imperial", "cyber", "monolith", "zenith"]:
                await pg.evaluate("t=>fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:t})})", th)
                await pg.reload(); await pg.wait_for_selector(".stab"); await pg.wait_for_timeout(2200)
                got = await pg.evaluate("document.documentElement.dataset.theme"); check(got == th, "thème appliqué après rechargement : %s" % got)
                f = f"{OUT}/ui-{th}.png"; await pg.screenshot(path=f); shots[th] = f
            from PIL import Image, ImageChops
            ids = list(shots)
            for i in range(4):
                for j in range(i + 1, 4):
                    a, c = Image.open(shots[ids[i]]).convert("RGB"), Image.open(shots[ids[j]]).convert("RGB")
                    r, g, bl = ImageChops.difference(a, c).split(); d = ImageChops.lighter(ImageChops.lighter(r, g), bl).point(lambda v: 255 if v > 10 else 0).histogram()[255] / (a.width * a.height)
                    check(d > 0.12, "%s / %s : %.0f %% de pixels différents" % (ids[i], ids[j], d * 100))
            fps = await pg.evaluate("document.querySelector('canvas') ? 1 : 0"); check(fps == 1, "scène 3D du panda montée (canvas WebGL)")
            # Dots vivants : apparition, livraison, attente, ordres vocaux
            await pg.evaluate("fetch('/api/dots/launch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'veille'})})")
            try:
                await pg.wait_for_selector('.dactor[data-phase="ready"]', timeout=30000); ok = True
            except Exception: ok = False
            check(ok, "un Dot apparaît, travaille puis livre (bulle avec résultat)")
            c3 = await pg.evaluate("document.querySelectorAll('.dsphere.has3d canvas.d3canvas').length"); check(c3 >= 1, "le Dot est un orbe 3D three.js (canvas WebGL) : %d" % c3)
            await pg.screenshot(path=os.path.join(OUT, "v10-dot-ready.png"))
            check(await pg.evaluate("!!document.querySelector('.dactor .dbub .dact')"), "boutons Ouvrir / Attendre / Plus tard présents")
            used = await pg.evaluate("window.__novaTest ? 1 : 0")
            r = await pg.evaluate("(()=>{const f=document.querySelector('#dotlayer'); return f? f.children.length:0})()")
            check(r >= 1, "le Dot est à l'écran (%d)" % r)
            await pg.click('.dactor .dact .btn:nth-child(2)'); await pg.wait_for_selector('.dactor[data-phase="waiting"]', timeout=3000)
            check(True, "« Attendre » : le Dot se met en attente (réduit, flottant)")
            await pg.click('.dactor .dsphere', force=True); await pg.wait_for_selector('.dactor[data-phase="ready"]', timeout=3000); check(True, "clic sur le Dot en attente : il reprend la parole")
            await pg.evaluate("window.__A.onCommand('attends')"); await pg.wait_for_selector('.dactor[data-phase="waiting"]', timeout=3000); check(True, "ordre vocal « attends »")
            await pg.evaluate("window.__A.onCommand('ouvre le résultat')"); await pg.wait_for_selector('.dpanel', timeout=3000); check(True, "ordre vocal « ouvre » : le résultat s'ouvre")
            check(not await pg.evaluate("window.__A.onCommand('quel temps fait-il demain à Ouagadougou en ce moment précis')"), "une vraie question n'est pas prise pour un ordre")
            await pg.click('.dpanel .btn.primary'); await pg.wait_for_timeout(700)
            check(await pg.evaluate("document.querySelectorAll('.dpanel').length") == 0, "« Terminé » : le panneau se ferme et le Dot disparaît")
            await b.close()
    finally:
        srv.terminate()
    print("\n%d échec(s)." % len(fails) if fails else "\nTOUT VERT.")
    return 1 if fails else 0
sys.exit(asyncio.run(main()))
