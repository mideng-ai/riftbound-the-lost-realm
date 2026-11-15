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
  // TASK-02：HUD 改读真实战斗运行时快照，不再是 Stage-2 占位文案。
  const v = boot.combat.debugView();
  hud.textContent = [
    `TASK-02 combat | phase=${v.phase}  LV ${v.level}  XP ${v.xp.toFixed(0)}`,
    `HP ${v.hp.toFixed(1)}/${v.maxHp.toFixed(1)}  weapon=${v.weapon}  enemies=${v.aliveEnemies}`,
    `staff Lv${v.staffLevel} cd=${v.staffCd.toFixed(2)}s | sword Lv${v.swordLevel} cd=${v.swordCd.toFixed(2)}s`,
    `layers A=${v.A.toFixed(3)} B=${v.B.toFixed(3)} C=${v.C.toFixed(3)}  proj=${v.projectileCount} arc=${v.arcAngleDeg.toFixed(0)}°`,
    `move x=${mv.x.toFixed(2)} y=${mv.y.toFixed(2)}  suspended=${st.suspended}  VFX proj=${boot.projectiles.liveCount}`,
    `saveAdapter=${gameConfig.saveAdapter} (D-207 pending)  [Tab]切换武器 [1/2/3]选卡`,
  ].join('\n');
}, 300);

window.addEventListener('resize', () => host.engine.resize());
console.log('[s2g] TASK-02 combat runtime wired; render pipeline = PROVISIONAL toon (ST2-002 path B)');
