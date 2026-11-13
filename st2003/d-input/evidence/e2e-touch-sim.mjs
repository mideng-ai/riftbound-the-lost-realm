// ST2-003-D 触摸路径桌面模拟验证（合成 TouchEvent；非真机证据，真机测试归 OWNER_DEVICE_TEST_REQUIRED）
// Chromium + SwiftShader: desktop Firefox does not expose the Touch API;
// Chromium does, and with --enable-unsafe-swiftshader it renders WebGL2.
// These are DESKTOP EMULATION results, NOT a physical device.
import { chromium } from '/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({
  headless: false,
  env: { ...process.env, DISPLAY: ':99', LIBGL_ALWAYS_SOFTWARE: '1' },
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://localhost:4174/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(2500);

const results = [];
function touch(id, type, x, y, target) {
  return page.evaluate(([id, type, x, y, target]) => {
    const el = target === 'body' ? document.body : document.getElementById(target);
    const t = new Touch({ identifier: id, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touch' + type, {
      changedTouches: [t], touches: type === 'end' || type === 'cancel' ? [] : [t],
      bubbles: true, cancelable: true,
    }));
  }, [id, type, x, y, target]);
}
async function snap(label) {
  const hud = await page.evaluate(() => document.getElementById('hud').textContent);
  const log = await page.evaluate(() => document.getElementById('eventlog').textContent);
  const joy = await page.evaluate(() => document.getElementById('joyBase').style.display);
  results.push(`${label}: joy=${joy} | ${hud.split('\n')[1]} | ${log.split('\n').slice(1).join(' ; ')}`);
}

// 1. left-half touchstart → joystick zone assigned
await touch(1, 'start', 200, 600, 'body');
await page.waitForTimeout(200);
await snap('T1 left-zone touchstart');

// 2. drag joystick finger
await touch(1, 'move', 240, 640, 'body');
await page.waitForTimeout(200);
await snap('T2 joystick drag (+x,+y)');

// 3. right-half canvas touch (not on button) → must be ignored
await touch(2, 'start', 1100, 300, 'body');
await page.waitForTimeout(200);
const log3 = await page.evaluate(() => document.getElementById('eventlog').textContent);
results.push(`${log3.split('INTENT').length - 1 === 0 ? 'PASS' : 'FAIL'} T3 right-zone canvas touch ignored (no intent fired)`);

// 4. second left-zone finger while joystick active → ignored (single joystick finger)
await touch(3, 'start', 150, 500, 'body');
await page.waitForTimeout(200);
const log4 = await page.evaluate(() => document.getElementById('eventlog').textContent);
results.push(`${log4.split('move(touch)').length - 1 <= 2 ? 'PASS' : 'FAIL'} T4 second left-zone finger does not create a second joystick`);

// 5. cross-zone drag: finger 1 (joystick) drags to right half → stays joystick
await touch(1, 'move', 1100, 300, 'body');
await page.waitForTimeout(200);
const joy5 = await page.evaluate(() => document.getElementById('joyBase').style.display);
const log5 = await page.evaluate(() => document.getElementById('eventlog').textContent);
results.push(`${joy5 === 'block' ? 'PASS' : 'FAIL'} T5 cross-zone drag keeps finger in move zone (joystick still visible)`);

// 6. touchcancel → joystick released, move zeroed
await touch(1, 'cancel', 1100, 300, 'body');
await touch(2, 'end', 1100, 300, 'body');
await touch(3, 'end', 150, 500, 'body');
await page.waitForTimeout(300);
await snap('T6 touchcancel release');
const hud6 = await page.evaluate(() => document.getElementById('hud').textContent);
results.push(`${hud6.includes('move x=0.00 y=0.00') && hud6.includes('joy') === false ? 'PASS' : 'FAIL'} T6 touchcancel → move reset 0,0`);

// 7. action button (right zone DOM) touchstart → intent via touch path
await touch(4, 'start', 1150, 700, 'btnQ');
await page.waitForTimeout(300);
const log7 = await page.evaluate(() => document.getElementById('eventlog').textContent);
results.push(`${log7.includes('INTENT skill1 (touch)') ? 'PASS' : 'FAIL'} T7 DOM button touchstart → skill1 intent (touch)`);

await page.screenshot({ path: 'evidence/shot-e2e-touch-sim.png' });
console.log('=== TOUCH SIM RESULTS (desktop emulation; NOT a physical device) ===');
console.log(results.join('\n'));
const pass = results.filter(r => r.startsWith('PASS')).length;
console.log(`\nTOTAL: ${pass}/${results.length} PASS`);
await browser.close();
