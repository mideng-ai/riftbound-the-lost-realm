import json
from playwright.sync_api import sync_playwright
OUT="/workspace/riftbound-the-lost-realm/evidence/qa-d207-final"
logs=[]
with sync_playwright() as p:
    b=p.chromium.launch(headless=False, executable_path="/usr/bin/chromium",
        args=["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-dev-shm-usage"])
    page=b.new_page(viewport={"width":1280,"height":800})
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    page.goto("http://localhost:4170/", wait_until="load", timeout=60000)
    page.evaluate("() => localStorage.clear()")
    page.reload(wait_until="load", timeout=60000)
    box=page.locator("#renderCanvas").bounding_box()
    page.mouse.move(box["x"]+box["width"]/2, box["y"]+box["height"]/2)
    page.mouse.down()  # staff held attack
    page.wait_for_timeout(22000)  # let multiple waves approach & die at range
    page.mouse.up()
    probe=page.evaluate("() => window.__rbProbe ? window.__rbProbe() : null")
    st=page.evaluate("""() => { const e=document.querySelector('.rb-settlement'); if(!e) return {visible:false};
      return {visible:!e.classList.contains('rb-hidden'), rows:Array.from(e.querySelectorAll('.rb-st-table tbody tr')).map(tr=>{const t=tr.querySelectorAll('td');return [t[0]?.textContent?.trim(),t[1]?.textContent?.trim()]})}; }""")
    main=page.evaluate("() => localStorage.getItem('riftbound.save_main')")
    b.close()
res={"phase":probe["phase"],"economy":probe["economy"],"aliveEnemies":probe["aliveEnemies"],"settlement":st,
     "saved":json.loads(main) if main else None,"console_tail":logs[-6:]}
print(json.dumps(res,ensure_ascii=False,indent=2))
with open(f"{OUT}/browser-realplay2.json","w") as f: json.dump(res,f,ensure_ascii=False,indent=2)
