// STAGE-2 local environment verification: opens the vite dev server in the
// system Chrome and records load state, console errors, WebGL backend, HUD.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const url = process.argv[2] ?? 'http://localhost:5173/';
const outLog = '/tmp/r2-verify/07-browser-check.log';
const outShot = '/tmp/r2-verify/07-browser-screenshot.png';
const waitMs = Number(process.argv[3] ?? 8000);

const logs = [];
const log = (s) => { logs.push(s); console.log(s); };

const launchOpts = { channel: 'chrome', headless: true };
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => logs.push(`[console:${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText ?? ''}`));

const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
log(`timestamp_utc=${new Date().toISOString()}`);
log(`chrome=${browser.version()} launch=${JSON.stringify(launchOpts)}`);
log(`http_status=${resp.status()}`);
log(`title=${await page.title()}`);
await page.waitForTimeout(waitMs);

const state = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl2 = c.getContext('webgl2');
  const gl = gl2 || c.getContext('webgl');
  let gpu = null;
  if (gl) {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = dbg ? `${gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)} | ${gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)}` : gl.getParameter(gl.RENDERER);
  }
  return {
    hud: document.getElementById('hud')?.textContent ?? '(no #hud element)',
    canvasCount: document.querySelectorAll('canvas').length,
    webgl2: !!gl2,
    gpu,
  };
});
log(`canvas_count=${state.canvasCount}`);
log(`webgl2=${state.webgl2}`);
log(`gpu_backend=${state.gpu}`);
log(`hud=${state.hud}`);
await page.screenshot({ path: outShot, fullPage: false });

const pageErrors = logs.filter((l) => l.startsWith('[pageerror]'));
const consoleErrors = logs.filter((l) => l.startsWith('[console:error]'));
const failed = logs.filter((l) => l.startsWith('[requestfailed]'));
log(`pageerrors=${pageErrors.length}`);
log(`console_errors=${consoleErrors.length}`);
log(`requestfailed=${failed.length}`);
log('--- console errors ---');
for (const l of consoleErrors) log(l);
log('--- failed requests ---');
for (const l of failed) log(l);
writeFileSync(outLog, logs.join('\n') + '\n');
await browser.close();
