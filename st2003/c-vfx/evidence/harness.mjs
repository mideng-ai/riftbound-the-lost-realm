// ST2-003-C 取证脚本（沙箱侧 Playwright 驱动；非 Spike 应用代码）
// 用法: node evidence/harness.mjs <url> <输出截图路径> <waitMs> [camAlpha camBeta camRadius camTargetX camTargetY camTargetZ]
// 前提: Xvfb :99；Firefox (Playwright) + LIBGL_ALWAYS_SOFTWARE=1 (llvmpipe) 软件渲染 WebGL2。
import { firefox } from '/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.mjs';
const args = process.argv.slice(2);
const [url, out, waitMsS, aS, bS, rS, txS, tyS, tzS] = args;
const waitMs = Number(waitMsS ?? 7000);
const browser = await firefox.launch({
  headless: false,
  env: { ...process.env, DISPLAY: ':99', LIBGL_ALWAYS_SOFTWARE: '1' },
  firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.enable-webgl2': true },
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(waitMs);
if (aS) {
  await page.evaluate((s) => {
    const [a, b, r, tx, ty, tz] = s.split(',').map(Number);
    const cam = window.__cam;
    cam.alpha = a; cam.beta = b; cam.radius = r;
    cam.target.x = tx; cam.target.y = ty; cam.target.z = tz;
  }, `${aS},${bS},${rS},${txS},${tyS},${tzS}`);
  await page.waitForTimeout(1500);
}
const hud = await page.evaluate(() => document.getElementById('hud')?.textContent ?? 'HUD not found');
const info = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  let renderer = 'n/a';
  if (gl) { const e = gl.getExtension('WEBGL_debug_renderer_info'); if (e) renderer = gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }
  return { ua: navigator.userAgent.slice(0, 120), renderer, webgl2: !!gl };
});
console.log('=== HUD ===\n' + hud);
console.log('=== ENV ===\n' + JSON.stringify(info, null, 1));
console.log('=== CONSOLE (all) ===\n' + logs.filter(l => !/Download the React DevTools/.test(l)).join('\n'));
await page.screenshot({ path: out });
await browser.close();
console.log('screenshot saved:', out);
