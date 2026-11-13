// ST2-003-E 存储测试取证（沙箱侧 Playwright；非应用代码）
// 用法: node evidence/harness.mjs <浏览器:firefox|chromium> <url> <输出txt> <输出png> [private]
const [engine, url, outTxt, outPng, priv] = process.argv.slice(2);
const pw = await import('/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.mjs');
let browser;
if (engine === 'firefox') {
  browser = await pw.firefox.launch({
    headless: false,
    env: { ...process.env, DISPLAY: ':99' },
    args: priv === 'private' ? ['-private'] : [],
  });
} else {
  browser = await pw.chromium.launch({
    headless: false,
    env: { ...process.env, DISPLAY: ':99' },
    args: ['--enable-unsafe-swiftshader'],
  });
}
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#results')?.textContent?.includes('suite') ||
  document.body.textContent?.includes('completed'), { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(4000);
const table = await page.evaluate(() => document.getElementById('results')?.textContent ?? '');
console.log('=== RESULTS TABLE ===\n' + table);
console.log('=== CONSOLE ===\n' + logs.join('\n'));
const ua = await page.evaluate(() => ({ ua: navigator.userAgent.slice(0, 110), storage: navigator.storage ? 'supported' : 'absent' }));
console.log('=== ENV ===\n' + JSON.stringify(ua));
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
console.log('saved:', outPng);
