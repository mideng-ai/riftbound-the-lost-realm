/**
 * ST2-003-D — Demo scene: game logic consumes ONLY the InputSystem facade.
 * NOT gameplay: player cube + visual feedback for intents, for input evidence.
 */
import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  ArcRotateCamera,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
} from '@babylonjs/core';
import { InputSystem } from './input/InputSystem';
import type { InputEvent } from './input/types';

const hud = document.getElementById('hud')!;
const logEl = document.getElementById('eventlog')!;
const joyBase = document.getElementById('joyBase')!;
const joyKnob = document.getElementById('joyKnob')!;
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;

const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.043, 0.051, 0.071, 1);

const camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.05, 11, new Vector3(0, 0, 0), scene);
camera.attachControl(canvas, true);
new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene).intensity = 0.8;

const ground = MeshBuilder.CreateGround('ground', { width: 16, height: 16 }, scene);
const gm = new StandardMaterial('gm', scene);
gm.diffuseColor = new Color3(0.09, 0.11, 0.14);
gm.specularColor = Color3.Black();
ground.material = gm;

const player = MeshBuilder.CreateBox('player', { size: 0.7 }, scene);
player.position.y = 0.35;
const pm = new StandardMaterial('pm', scene);
pm.diffuseColor = new Color3(0.3, 0.7, 0.9);
pm.emissiveColor = new Color3(0.05, 0.15, 0.25);
player.material = pm;

// marker rings that pulse on intents
function ring(color: Color3): StandardMaterial {
  const m = new StandardMaterial('m' + color.toHexString(), scene);
  m.emissiveColor = color;
  m.disableLighting = true;
  return m;
}
const intentColors: Record<string, Color3> = {
  normalAttack: new Color3(1, 0.6, 0.2),
  skill1: new Color3(0.5, 0.4, 1),
  skill2: new Color3(0.3, 1, 0.6),
  dash: new Color3(1, 0.9, 0.3),
};

// ---- unified input (the ONLY input source consumed below) -------------------
const input = new InputSystem();
input.attachKeyboardMouse(canvas);
input.attachTouch(document.body, {
  onJoystickShow: (x, y) => {
    joyBase.style.display = 'block';
    joyBase.style.left = x - 48 + 'px';
    joyBase.style.top = y - 48 + 'px';
    joyKnob.style.display = 'block';
    joyKnob.style.left = x - 22 + 'px';
    joyKnob.style.top = y - 22 + 'px';
  },
  onJoystickMove: (dx, dy) => {
    const len = Math.hypot(dx, dy);
    const k = len > 48 ? 48 / len : 1;
    joyKnob.style.left = joyBase.offsetLeft + 26 + dx * k + 'px';
    joyKnob.style.top = joyBase.offsetTop + 26 + dy * k + 'px';
  },
  onJoystickHide: () => {
    joyBase.style.display = 'none';
    joyKnob.style.display = 'none';
  },
});
input.bindActionButton('btnAtk', 'normalAttack');
input.bindActionButton('btnDash', 'dash');
input.bindActionButton('btnQ', 'skill1');
input.bindActionButton('btnE', 'skill2');

// ---- event log (evidence) -----------------------------------------------------
const logLines: string[] = [];
let eventCount = 0;
input.addListener((ev: InputEvent) => {
  eventCount++;
  let line = '';
  switch (ev.kind) {
    case 'move':
      line = `move(${ev.source}) x=${ev.vec.x.toFixed(2)} y=${ev.vec.y.toFixed(2)}`;
      break;
    case 'intent':
      line = `INTENT ${ev.action} (${ev.source})`;
      break;
    case 'held':
      line = `held ${ev.action}=${ev.pressed ? 'DOWN' : 'UP'} (${ev.source})`;
      break;
    case 'suspend':
      line = `SUSPEND ${ev.reason} → ${ev.suspended}`;
      break;
    case 'pointerLockLost':
      line = `POINTER-LOCK LOST`;
      break;
  }
  logLines.unshift(`#${eventCount} ${line}`);
  if (logLines.length > 9) logLines.pop();
  logEl.textContent = '— event log —\n' + logLines.join('\n');
});

// ---- game logic consumes facade only ------------------------------------------
const intentCounts: Record<string, number> = { normalAttack: 0, skill1: 0, skill2: 0, dash: 0 };
let pulse = 0;

scene.onBeforeRenderObservable.add(() => {
  const dt = engine.getDeltaTime() / 1000;
  const mv = input.getMove();
  const speed = 4;
  player.position.x += mv.x * speed * dt;
  player.position.z += mv.y * speed * dt;
  player.position.x = Math.max(-7, Math.min(7, player.position.x));
  player.position.z = Math.max(-7, Math.min(7, player.position.z));

  for (const a of ['normalAttack', 'skill1', 'skill2', 'dash'] as const) {
    if (input.consumeIntent(a)) {
      intentCounts[a]++;
      pulse = 1;
      pm.emissiveColor = intentColors[a].scale(0.6);
      const r = MeshBuilder.CreateTorus('fx' + Date.now(), { diameter: 1, thickness: 0.05, tessellation: 20 }, scene);
      r.material = ring(intentColors[a]);
      r.position = player.position.clone();
      r.position.y = 0.05;
      let t = 0;
      const obs = scene.onBeforeRenderObservable.add(() => {
        t += engine.getDeltaTime();
        const k = t / 400;
        r.scaling.setAll(1 + 2.5 * k);
        (r.material as StandardMaterial).alpha = 1 - k;
        if (k >= 1) {
          scene.onBeforeRenderObservable.remove(obs);
          r.dispose(false, true);
        }
      });
    }
  }
  if (pulse > 0) {
    pulse -= dt * 2;
    if (pulse <= 0) pm.emissiveColor = new Color3(0.05, 0.15, 0.25);
  }
});

// ---- HUD -----------------------------------------------------------------------
setInterval(() => {
  const mv = input.getMove();
  const st = input.getSystemState();
  hud.textContent = [
    `fps=${engine.getFps().toFixed(0)}  events=${eventCount}`,
    `move x=${mv.x.toFixed(2)} y=${mv.y.toFixed(2)}`,
    `held normalAttack=${input.isHeld('normalAttack')}`,
    `intents atk=${intentCounts.normalAttack} q=${intentCounts.skill1} e=${intentCounts.skill2} dash=${intentCounts.dash}`,
    `suspended=${st.suspended} pointerLockLost=${st.pointerLockLost}`,
    st.suspended ? '>> INPUT SUSPENDED (blur/hidden) — gameplay should pause' : '',
  ].filter(Boolean).join('\n');
}, 250);

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
(window as unknown as Record<string, unknown>).__input = input; // evidence hooks
console.log('[st2-003-d] unified input spike started');
