import os, json, sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:4170/?t=600&killboss=1&mute=1&debug=1"
OUT = "/workspace/riftbound-the-lost-realm/evidence/qa-d207-final"
logs = []
with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=False,
        executable_path="/usr/bin/chromium",
        args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"],
    )
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.on("console", lambda m: logs.append(f"[console:{m.type}] {m.text}"))
    page.on("pageerror", lambda e: logs.append(f"[pageerror] {e.message}"))
    page.goto(URL, wait_until="load", timeout=60000)
    page.wait_for_timeout(6000)
    probe = page.evaluate("() => (typeof window.__rbProbe === 'function') ? window.__rbProbe() : null")
    settlement = page.evaluate("""() => {
        const el = document.querySelector('.rb-settlement');
        if (!el) return {visible:false};
        const hidden = el.classList.contains('rb-hidden');
        const rows = Array.from(el.querySelectorAll('.rb-st-table tbody tr')).map(tr => {
            const tds = tr.querySelectorAll('td');
            return { name: tds[0]?.textContent?.trim(), value: tds[1]?.textContent?.trim() };
        });
        const title = el.querySelector('h2')?.textContent?.trim();
        const sub = el.querySelector('.rb-st-sub')?.textContent?.trim();
        return {visible:!hidden, title, sub, rows};
    }""")
    ls = page.evaluate("""() => ({ main: localStorage.getItem('riftbound.save_main') })""")
    page.screenshot(path=f"{OUT}/qa-d207-settlement-smoke.png", full_page=False)
    browser.close()

result = {"probe": probe, "settlement": settlement, "localStorage": ls, "logs": logs}
print(json.dumps(result, ensure_ascii=False, indent=2))
with open(f"{OUT}/browser-probe.json", "w") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
