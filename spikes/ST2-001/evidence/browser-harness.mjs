// ST2-001 取证脚本（沙箱侧 Playwright 驱动；非 Spike 应用代码）
// 用法：node evidence/browser-harness.mjs <url> <输出截图路径>
// 背景：沙箱容器无 GPU（/dev/dri 不存在）。Chrome/Chromium 的 GPU 进程 EGL 初始化失败，
// 无法创建 WebGL 上下文；Firefox 146 在 Xvfb + LIBGL_ALWAYS_SOFTWARE=1（llvmpipe）下
// 以软件渲染提供 WebGL2。故本取证使用 headful Firefox + Xvfb。
import { firefox } from '/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.mjs';
const [url = 'http://localhost:5173/', out = 'screenshot.png'] = process.argv.slice(2);
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
await page.waitForTimeout(6000);
console.log('=== HUD ===\n' + await page.evaluate(() => document.getElementById('hud')?.textContent ?? 'HUD not found'));
console.log('=== Console ===\n' + logs.slice(0, 15).join('\n'));
await page.screenshot({ path: out });
console.log('screenshot saved:', out);
await browser.close();
