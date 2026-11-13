// ST2-003-D 桌面键鼠自动化验证（沙箱侧 Playwright；非应用代码）
// 前提: preview 服务器已运行；Xvfb :99。
import { firefox } from '/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.mjs';
const url = process.argv[2] ?? 'http://localhost:4174/';
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
await page.waitForTimeout(3000);

const results = [];
async function check(name, fn) {
  try {
    const ok = await fn();
    results.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
    return ok;
  } catch (e) {
    results.push(`ERROR ${name}: ${e.message}`);
    return false;
  }
}
const hud = () => page.evaluate(() => document.getElementById('hud').textContent);
const log = () => page.evaluate(() => document.getElementById('eventlog').textContent);

// 1. WASD movement
await page.keyboard.down('KeyW');
await page.waitForTimeout(400);
const hud1 = await hud();
results.push(`${hud1.includes('move x=0.00 y=-1.00') ? 'PASS' : 'FAIL'} W → move y=-1.00 (got: ${hud1.split('\n')[1]})`);
await page.keyboard.down('KeyD');
await page.waitForTimeout(400);
const hud2 = await hud();
results.push(`${hud2.includes('move x=1.00 y=-1.00') ? 'PASS' : 'FAIL'} W+D → move x=1.00 y=-1.00 (got: ${hud2.split('\n')[1]})`);
await page.keyboard.up('KeyW');
await page.keyboard.up('KeyD');
await page.waitForTimeout(300);
const hud3 = await hud();
results.push(`${hud3.includes('move x=0.00 y=0.00') ? 'PASS' : 'FAIL'} release → move 0,0 (got: ${hud3.split('\n')[1]})`);

// 2. left-click normal attack intent
await page.mouse.click(640, 400);
await page.waitForTimeout(300);
const logA = await log();
results.push(`${logA.includes('INTENT normalAttack (kbm)') ? 'PASS' : 'FAIL'} left-click → normalAttack intent`);

// 3. Space dash, Q/E skills
await page.keyboard.press('Space');
await page.waitForTimeout(200);
await page.keyboard.press('KeyQ');
await page.waitForTimeout(200);
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
const hud4 = await hud();
const m = hud4.match(/intents atk=(\d+) q=(\d+) e=(\d+) dash=(\d+)/);
results.push(`${m && m[4] === '1' ? 'PASS' : 'FAIL'} Space → dash intent (intents: ${m?.slice(1).join('/')})`);
results.push(`${m && m[2] === '1' && m[3] === '1' ? 'PASS' : 'FAIL'} Q/E → skill intents`);

// 4. held normalAttack while mouse down
await page.mouse.move(640, 400);
await page.mouse.down();
await page.waitForTimeout(400);
const hud5 = await hud();
results.push(`${hud5.includes('held normalAttack=true') ? 'PASS' : 'FAIL'} mouse held → normalAttack held=true`);
await page.mouse.up();
await page.waitForTimeout(300);
const hud6 = await hud();
results.push(`${hud6.includes('held normalAttack=false') ? 'PASS' : 'FAIL'} mouse up → held=false`);

// 5. blur → suspension + stuck-input reset
await page.keyboard.down('KeyA');
await page.waitForTimeout(200);
await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
await page.waitForTimeout(300);
const hud7 = await hud();
results.push(`${hud7.includes('suspended=true') ? 'PASS' : 'FAIL'} blur → suspended=true`);
results.push(`${hud7.includes('move x=0.00 y=0.00') ? 'PASS' : 'FAIL'} blur → stuck move reset to 0,0`);
await page.keyboard.up('KeyA');

// 6. touch button path via DOM mousedown (desktop preview of touch intent path)
await page.evaluate(() => document.getElementById('btnDash').dispatchEvent(new MouseEvent('mousedown')));
await page.waitForTimeout(300);
const logB = await log();
results.push(`${logB.includes('INTENT dash (touch)') ? 'PASS' : 'FAIL'} DOM action button → dash intent via touch path`);

await page.screenshot({ path: 'evidence/shot-e2e-desktop.png' });
console.log('=== AUTOMATED INPUT RESULTS ===');
console.log(results.join('\n'));
const pass = results.filter(r => r.startsWith('PASS')).length;
console.log(`\nTOTAL: ${pass}/${results.length} PASS`);
console.log('=== CONSOLE ===\n' + logs.slice(0, 12).join('\n'));
await browser.close();
