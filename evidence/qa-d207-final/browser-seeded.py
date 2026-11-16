import json
from playwright.sync_api import sync_playwright

OUT = "/workspace/riftbound-the-lost-realm/evidence/qa-d207-final"
# Seed a rich pre-existing save BEFORE the app loads, to test DEF-005 race and economyView reading real data.
seed = {
  "schemaVersion": 3,
  "savedAt": "2026-11-15T00:00:00.000Z",
  "weapons": {"staff": {"level": 4, "sockets": [None,None,None]}, "sword": {"level": 3, "sockets": [None,None,None]}},
  "gemInventory": [{"itemInstanceId":"seed-gem-1","gemId":"fire","quality":"rare"}],
  "currencies": {"gold": 999, "forestMaterial": 55, "elementalShards": {"fire":7,"ice":8,"lightning":9,"shadow":10}, "forestCore": 2},
  "metaProgress": {"staffMastery": 5, "swordMastery": 4, "forestSurvival": 3},
  "settings": {"volumes": {"sfx": 1, "music": 1}, "quality": "high", "colorblind": False, "language": "en"},
  "stats": {"runsPlayed": 10, "bossKills": 3, "bestTimeSec": 400},
}
seed_json = json.dumps(seed, ensure_ascii=False)
logs = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, executable_path="/usr/bin/chromium",
        args=["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-dev-shm-usage"])
    page = browser.new_page(viewport={"width":1280,"height":800})
    page.on("console", lambda m: logs.append(f"[console:{m.type}] {m.text}"))
    page.on("pageerror", lambda e: logs.append(f"[pageerror] {e.message}"))
    page.goto("http://localhost:4170/", wait_until="load", timeout=60000)  # load origin first
    page.evaluate("(s) => localStorage.setItem('riftbound.save_main', s)", seed_json)
    # now navigate with fast-forward params
    page.goto("http://localhost:4170/?t=600&killboss=1&mute=1", wait_until="load", timeout=60000)
    page.wait_for_timeout(6000)
    probe = page.evaluate("() => window.__rbProbe ? window.__rbProbe() : null")
    main = page.evaluate("() => localStorage.getItem('riftbound.save_main')")
    browser.close()
result = {"probe.economy": (probe or {}).get("economy"), "runsPlayed": (probe or {}).get("economy",{}).get("runsPlayed"),
          "bossKills": (probe or {}).get("economy",{}).get("bossKills"),
          "savedAfter": json.loads(main) if main else None, "logs": logs}
print(json.dumps(result, ensure_ascii=False, indent=2))
with open(f"{OUT}/browser-seeded.json","w") as f: json.dump(result,f,ensure_ascii=False,indent=2)
