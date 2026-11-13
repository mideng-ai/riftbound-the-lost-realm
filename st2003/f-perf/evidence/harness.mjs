// ST2-003-F 基准取证（沙箱侧 Playwright；非应用代码）
// 用法: node evidence/harness.mjs <firefox|chromium> <url> <waitMs> <outTxt> <outPng>
const [engineName, url, waitMsS, outTxt, outPng] = process.argv.slice(2);
const pw = await import('/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.mjs');
let browser;
if (engineName === 'firefox') {
  browser = await pw.firefox.launch({
    headless: false,
    env: { ...process.env, DISPLAY: ':99', LIBGL_ALWAYS_SOFTWARE: '1' },
    firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.enable-webgl2': true },
  });
} else {
  browser = await pw.chromium.launch({
    headless: false,
    env: { ...process.env, DISPLAY: ':99', LIBGL_ALWAYS_SOFTWARE: '1' },
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  });
}
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', m => logs.push(m.text()));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(Number(waitMsS));
const hud = await page.evaluate(() => document.getElementById('hud')?.textContent ?? '');
const info = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  let renderer = 'n/a';
  if (gl) { const e = gl.getExtension('WEBGL_debug_renderer_info'); if (e) renderer = gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }
  return { ua: navigator.userAgent.slice(0, 130), renderer, dpr: devicePixelRatio, mem: performance.memory ? 'available' : 'unavailable' };
});
const out = ['=== HUD ===\n' + hud, '=== CONSOLE ===\n' + logs.filter(l => l.startsWith('[')).join('\n'), '=== ENV ===\n' + JSON.stringify(info, null, 1)].join('\n\n');
console.log(out);
await (await import('fs')).promises.writeFile(outTxt, out);
await page.screenshot({ path: outPng });
await browser.close();
console.log('saved:', outTxt, outPng);
