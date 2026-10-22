import sys, asyncio, subprocess, time
from playwright.async_api import async_playwright
async def main():
    srv = subprocess.Popen(["python3","-m","http.server","8901","-d","web"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--use-gl=angle"])
        for th,st in [("nova-imperial","idle"),("cyber","speaking"),("monolith","thinking"),("zenith","listening")]:
            pg = await b.new_page(viewport={"width":520,"height":560})
            msgs=[]; pg.on("console", lambda m: msgs.append(m.text)); pg.on("pageerror", lambda e: msgs.append("ERR "+str(e)))
            await pg.goto(f"http://127.0.0.1:8901/_avatar_test.html?th={th}&st={st}")
            await pg.wait_for_function("window.ready===true", timeout=15000)
            if st=="speaking": await pg.evaluate("setInterval(()=>a.setLevel(0.5+0.5*Math.sin(performance.now()/90)),30)")
            await pg.mouse.move(380,200)
            await pg.wait_for_timeout(1800)
            await pg.screenshot(path=f"/tmp/av_{th}.png"); print(th, st, msgs[:3])
        await b.close()
    srv.terminate()
asyncio.run(main())
