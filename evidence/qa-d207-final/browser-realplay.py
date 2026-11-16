import json
from playwright.sync_api import sync_playwright
OUT = "/workspace/riftbound-the-lost-realm/evidence/qa-d207-final"
logs=[]
with sync_playwright() as p:
    b=p.chromium.launch(headless=False, executable_path="/usr/bin/chromium",
        args=["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-dev-shm-usage"])
    page=b.new_page(viewport={"width":1280,"height":800})
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    # fresh profile: clear any prior save
    page.goto("http://localhost:4170/", wait_until="load", timeout=60000)
    page.evaluate("() => { localStorage.clear(); }")
    page.reload(wait_until="load", timeout=60000)
    # switch to sword (melee) so kills happen within pickup radius, then hold attack
    page.keyboard.press("Tab")
    box = page.locator("#renderCanvas").bounding_box()
    cx, cy = box["x"]+box["width"]/2, box["y"]+box["height"]/2
    page.mouse.move(cx, cy)
    page.mouse.down()
    # let waves come, player kills at melee range, walk in a small circle via WASD
    for i in range(9):
        for k in ["KeyD","KeyS","KeyA","KeyW"]:
            page.keyboard.down(k); page.wait_for_timeout(1100); page.keyboard.up(k)
    page.mouse.up()
    probe=page.evaluate("() => window.__rbProbe ? window.__rbProbe() : null")
    st=page.evaluate("""() => { const e=document.querySelector('.rb-settlement'); if(!e) return {visible:false};
      return {visible:!e.classList.contains('rb-hidden'), rows:Array.from(e.querySelectorAll('.rb-st-table tbody tr')).map(tr=>{const t=tr.querySelectorAll('td');return [t[0]?.textContent?.trim(),t[1]?.textContent?.trim()]})}; }""")
    main=page.evaluate("() => localStorage.getItem('riftbound.save_main')")
    page.screenshot(path=f"{OUT}/qa-d207-realplay.png")
    b.close()
res={"probe":probe, "settlement":st, "saved":json.loads(main) if main else None, "logs":logs[-10:]}
print(json.dumps(res,ensure_ascii=False,indent=2))
with open(f"{OUT}/browser-realplay.json","w") as f: json.dump(res,f,ensure_ascii=False,indent=2)
