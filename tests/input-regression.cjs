/**
 * ST2-003 correction round — regression tests for R2 (listener lifecycle) and
 * R3 (touchcancel must not clear suspension).
 *
 * Runs on plain Node (no browser, no extra dependency): the compiled input
 * modules under .testbuild/ are exercised against minimal DOM stubs.
 * Run: npm run test:input
 */
'use strict';

const { InputSystem } = require('../.testbuild/input/InputSystem.js');

// ---------------- minimal DOM stubs ----------------
class FakeElement extends EventTarget {
  constructor(id) {
    super();
    this.id = id;
    this.style = {};
  }
}

const elements = new Map();
for (const id of ['btnAtk', 'btnDash', 'btnQ', 'btnE']) elements.set(id, new FakeElement(id));

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.hidden = false;
    this.pointerLockElement = null;
  }
  getElementById(id) {
    return elements.get(id) ?? null;
  }
}

class FakeWindow extends EventTarget {
  constructor() {
    super();
    this.innerWidth = 800;
    this.innerHeight = 600;
  }
}

const fakeDocument = new FakeDocument();
const fakeWindow = new FakeWindow();
globalThis.document = fakeDocument;
globalThis.window = fakeWindow;

class FakeTouchEvent extends Event {
  constructor(type, touches) {
    super(type);
    this.changedTouches = touches;
  }
}

const touch = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- test harness ----------------
const lines = [];
let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) pass++;
  else fail++;
  lines.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  // ---------- R2: action-button listener lifecycle ----------
  const sys = new InputSystem();
  const events = [];
  sys.addListener((ev) => events.push(ev));
  sys.attachKeyboardMouse(new FakeElement('canvas'));
  sys.attachTouch(new FakeElement('touchzone'));
  sys.bindActionButton('btnAtk', 'normalAttack');
  sys.bindActionButton('btnDash', 'dash');

  elements.get('btnDash').dispatchEvent(new Event('mousedown'));
  check('R2-1 mousedown on bound button produces one dash intent', sys.consumeIntent('dash'), 'intent consumed');
  check('R2-1b intent not duplicated', !sys.consumeIntent('dash'), 'second poll returns false');

  elements.get('btnDash').dispatchEvent(new FakeTouchEvent('touchstart', [touch(1, 700, 500)]));
  check('R2-2 touchstart on bound button produces one dash intent', sys.consumeIntent('dash'), 'intent consumed');

  // hold-release timer must be cancelled by dispose (not fire against a dead instance)
  const beforeDispose = events.filter((e) => e.kind === 'held').length;
  elements.get('btnAtk').dispatchEvent(new FakeTouchEvent('touchstart', [touch(2, 700, 400)]));
  check('R2-3 normalAttack press emits held=true', sys.isHeld('normalAttack'), 'held state true');
  sys.dispose();
  await sleep(220);
  const afterDispose = events.filter((e) => e.kind === 'held').length;
  check(
    'R2-4 dispose cancels pending hold-release timer',
    afterDispose === beforeDispose + 1,
    `held events delta=${afterDispose - beforeDispose} (expected 1 = the press only)`
  );

  // listeners must be gone after dispose
  events.length = 0;
  elements.get('btnDash').dispatchEvent(new Event('mousedown'));
  elements.get('btnDash').dispatchEvent(new FakeTouchEvent('touchstart', [touch(3, 700, 500)]));
  fakeWindow.dispatchEvent(new Event('keydown'));
  check('R2-5 disposed instance receives no button intents', !sys.consumeIntent('dash'), 'consumeIntent=false');
  check('R2-6 disposed instance records no events', events.length === 0, `events=${events.length}`);

  // ---------- re-attach must not duplicate listeners ----------
  const sys2 = new InputSystem();
  const events2 = [];
  sys2.addListener((ev) => events2.push(ev));
  sys2.attachKeyboardMouse(new FakeElement('canvas2'));
  sys2.attachTouch(new FakeElement('touchzone2'));
  sys2.bindActionButton('btnAtk', 'normalAttack');
  sys2.bindActionButton('btnDash', 'dash');

  const dashIntents = [];
  sys2.addListener((ev) => {
    if (ev.kind === 'intent' && ev.action === 'dash') dashIntents.push(ev);
  });
  elements.get('btnDash').dispatchEvent(new Event('mousedown'));
  check('R2-7 re-attached instance gets exactly one intent', dashIntents.length === 1, `count=${dashIntents.length}`);
  check('R2-8 re-attached instance consumes the intent', sys2.consumeIntent('dash'), 'consumed');

  // ---------- R3: touchcancel must never clear suspension ----------
  const sys3 = new InputSystem();
  const zone = new FakeElement('zone3');
  sys3.attachKeyboardMouse(new FakeElement('canvas3'));
  sys3.attachTouch(zone);
  sys3.bindActionButton('btnAtk', 'normalAttack');

  fakeWindow.dispatchEvent(new Event('blur'));
  check('R3-1 blur sets suspended=true', sys3.getSystemState().suspended === true, 'suspended=true');

  zone.dispatchEvent(new FakeTouchEvent('touchcancel', [touch(9, 100, 100)]));
  check(
    'R3-2 blur → touchcancel keeps suspended=true',
    sys3.getSystemState().suspended === true,
    'touchcancel must not resume'
  );

  fakeDocument.hidden = false;
  fakeDocument.dispatchEvent(new Event('visibilitychange'));
  check('R3-3 visibility resume clears suspension', sys3.getSystemState().suspended === false, 'suspended=false');

  fakeWindow.dispatchEvent(new Event('blur'));
  fakeWindow.dispatchEvent(new Event('focus'));
  check('R3-4 blur → focus clears suspension', sys3.getSystemState().suspended === false, 'suspended=false');

  fakeDocument.hidden = true;
  fakeDocument.dispatchEvent(new Event('visibilitychange'));
  check('R3-5 hidden sets suspended=true', sys3.getSystemState().suspended === true, 'suspended=true');

  zone.dispatchEvent(new FakeTouchEvent('touchcancel', [touch(10, 100, 100)]));
  check(
    'R3-6 hidden → touchcancel keeps suspended=true',
    sys3.getSystemState().suspended === true,
    'still suspended'
  );

  fakeDocument.hidden = false;
  fakeDocument.dispatchEvent(new Event('visibilitychange'));
  check('R3-7 visibility recovery after touchcancel resumes', sys3.getSystemState().suspended === false, 'suspended=false');

  zone.dispatchEvent(new FakeTouchEvent('touchcancel', [touch(11, 100, 100)]));
  check(
    'R3-8 touchcancel alone does not suspend',
    sys3.getSystemState().suspended === false,
    'suspended stays false'
  );

  // joystick release on touchcancel still resets movement
  zone.dispatchEvent(new FakeTouchEvent('touchstart', [touch(12, 100, 300)]));
  zone.dispatchEvent(new FakeTouchEvent('touchmove', [touch(12, 160, 300)]));
  const moved = sys3.getMove();
  zone.dispatchEvent(new FakeTouchEvent('touchcancel', [touch(12, 160, 300)]));
  const afterCancel = sys3.getMove();
  check(
    'R3-9 touchcancel still releases joystick movement',
    moved.x > 0 && afterCancel.x === 0 && afterCancel.y === 0,
    `moved=(${moved.x.toFixed(2)},${moved.y.toFixed(2)}) → released=(0,0)`
  );

  sys2.dispose();
  sys3.dispose();

  console.log(lines.join('\n'));
  console.log(`\nsummary: ${pass} passed, ${fail} failed, ${pass + fail} checks`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
