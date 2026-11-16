import json
from playwright.sync_api import sync_playwright
OUT="/workspace/riftbound-the-lost-realm/evidence/qa-d207-final"
with sync_playwright() as p:
    b=p.chromium.launch(headless=False, executable_path="/usr/bin/chromium",
        args=["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-dev-shm-usage"])
    page=b.new_page(viewport={"width":1280,"height":800})
    page.goto("http://localhost:4170/", wait_until="load", timeout=60000)
    page.evaluate("() => localStorage.clear()")
    page.reload(wait_until="load", timeout=60000)
    page.keyboard.press("Tab")  # sword melee
    box=page.locator("#renderCanvas").bounding_box()
    page.mouse.move(box["x"]+box["width"]/2, box["y"]+box["height"]/2)
    page.mouse.down()
    # walk north into oncoming hounds, sweep directions
    seq=[("KeyW",3000),("KeyD",2000),("KeyS",2500),("KeyA",2500),("KeyW",2000)]
    for k,ms in seq:
        page.keyboard.down(k); page.wait_for_timeout(ms); page.keyboard.up(k)
    page.mouse.up()
    probe=page.evaluate("() => window.__rbProbe ? window.__rbProbe() : null")
    # also read HUD debug for level/xp (proxy for kills)
    hud=page.evaluate("() => document.getElementById('hud')?.textContent ?? ''")
    b.close()
print(json.dumps({"phase":probe["phase"],"economy":probe["economy"],"level":probe["level"],"xp":probe["xp"],
   "hud_head":hud[:120]},ensure_ascii=False,indent=2))
