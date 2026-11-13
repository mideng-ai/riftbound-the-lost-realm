/**
 * Application entry point — wires EngineHost, input, save, bootstrap scene.
 */
import { EngineHost } from './engine/EngineHost';
import { InputSystem } from './input/InputSystem';
import { MockSaveAdapter } from './save/MockSaveAdapter';
import { PerfMonitor } from './debug/PerfMonitor';
import { createBootstrapScene } from './scenes/BootstrapScene';
import { gameConfig } from './config/gameConfig';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const hud = document.getElementById('hud')!;
const joyBase = document.getElementById('joyBase')!;
const joyKnob = document.getElementById('joyKnob')!;

const host = new EngineHost({ canvas });
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

// D-207 gate: only the mock adapter exists until the owner decides.
const save = new MockSaveAdapter();

const boot = createBootstrapScene({ engine: host.engine, canvas, input, save });
host.useScene(boot.scene);

// focus loss suspends inputs (gameplay should pause on this state)
input.addListener((ev) => {
  if (ev.kind === 'suspend' && ev.suspended) {
    hud.textContent = '>> SUSPENDED (window blurred / page hidden) — inputs cleared';
  }
});

if (gameConfig.debug.showPerfHud) {
  new PerfMonitor(host.engine, boot.scene, true);
}

setInterval(() => {
  const mv = input.getMove();
  const st = input.getSystemState();
  hud.textContent = [
    'Stage-2 skeleton (NOT gameplay): move + VFX lifecycle demo + mock save',
    `move x=${mv.x.toFixed(2)} y=${mv.y.toFixed(2)}  suspended=${st.suspended}`,
    `projectiles live=${boot.projectiles.liveCount}`,
    `saveAdapter=${gameConfig.saveAdapter} (D-207 pending)`,
  ].join('\n');
}, 300);

window.addEventListener('resize', () => host.engine.resize());
console.log('[s2g] formal skeleton started; render pipeline = PROVISIONAL toon (ST2-002 path B)');
