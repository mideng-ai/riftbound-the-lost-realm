import { chromium } from 'playwright-core';
import fs from 'fs';
const target = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || '/tmp/tlsfix/10-find404-full.log';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
const net = [];
cdp.on('Network.responseReceived', (p) => {
  net.push('HTTP ' + p.response.status + ' ' + p.response.mimeType + ' ' + p.response.url);
});
const consoleErrs = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
page.on('pageerror', (e) => consoleErrs.push('PAGEERROR ' + e.message));
await cdp.send('Network.enable');
await page.goto(target, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(6000);
await browser.close();
const bad = net.filter((l) => !l.startsWith('HTTP 2'));
const text = '=== all non-2xx responses (CDP) ===\n' +
  (bad.length ? bad.join('\n') : '(none)') +
  '\n=== total network responses seen: ' + net.length + ' ===\n' +
  '=== console errors ===\n' + (consoleErrs.join('\n') || '(none)') + '\n';
console.log(text);
fs.writeFileSync(out, text);
