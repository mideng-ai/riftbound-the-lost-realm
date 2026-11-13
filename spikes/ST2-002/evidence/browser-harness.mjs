// ST2-001 取证脚本（沙箱侧 Playwright 驱动；非 Spike 应用代码）
// 用法: node evidence/browser-harness.mjs <url> <输出截图路径>
// 前提: Xvfb :99 运行中；Firefox 146 (Playwright) + LIBGL_ALWAYS_SOFTWARE=1 (llvmpipe) 提供软件 WebGL2。
// 背景: 沙箱容器无 GPU (/dev/dri 不存在)，Chrome/Chromium 的 GPU 进程 EGL 初始化失败，
//       无法创建 WebGL 上下文；Firefox 146 在上述配置下以软件渲染提供 WebGL2。
import { firefox } from '/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.mjs';
const [url, out] = process.argv.slice(2);
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
await page.waitForTimeout(7000);
const hud = await page.evaluate(() => document.getElementById('hud')?.textContent ?? 'HUD not found');
const info = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  let renderer = 'n/a';
  if (gl) { const e = gl.getExtension('WEBGL_debug_renderer_info'); if (e) renderer = gl.getParameter(e.UNMASKED_RENDERER_WEBGL); }
  return { ua: navigator.userAgent, renderer, webgl2: !!gl };
});
console.log('=== HUD ===\n' + hud);
console.log('=== ENV ===\n' + JSON.stringify(info, null, 1));
console.log('=== CONSOLE ===\n' + logs.slice(0, 10).join('\n'));
await page.screenshot({ path: out });
console.log('saved:', out);
await browser.close();
