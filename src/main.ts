/**
 * Application entry point — wires EngineHost, input, save, bootstrap scene.
 *
 * 本轮「真实数据源接线」：
 *  - 通过 CombatUiBridge 把 TASK-02 CombatRuntime 接成 TASK-07 UI 的唯一数据源
 *    （snapshot = combat 运行时状态的 adapter；bus = combat.bus；onUiCommand → combat 命令）；
 *  - 旧 #hud 降级为调试开关：默认隐藏，?debug=1 显示。旧 300ms 轮询逻辑**完整保留**，
 *    便于后续对照 TASK-02 debugView 与 TASK-07 真 HUD 是否一致。
 */
import { EngineHost } from './engine/EngineHost';
import { InputSystem } from './input/InputSystem';
import { MockSaveAdapter } from './save/MockSaveAdapter';
import { PerfMonitor } from './debug/PerfMonitor';
import { createBootstrapScene } from './scenes/BootstrapScene';
import { CombatUiBridge } from './scenes/CombatUiBridge';
import { gameConfig } from './config/gameConfig';
// 文案表注入（叙事规格 §5）：真实运行路径用 enResolver，不再走 keyLabel 反推标签。
import { enResolver } from './text/resolver.ts';
// 程序化音频运行时（ADR-TD-008）：零外部资产，首次手势解锁。
import { createAudioRuntime } from './audio/index.ts';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const hud = document.getElementById('hud')!;
const joyBase = document.getElementById('joyBase')!;
const joyKnob = document.getElementById('joyKnob')!;

const params = new URLSearchParams(location.search);
/** 旧 #hud 只在 ?debug=1 时显示；玩家默认只看 TASK-07 真 HUD。 */
const showDebugHud = params.get('debug') === '1';
if (showDebugHud) hud.style.display = 'block';

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
// Q/E 当前没有技能实现：按钮在 index.html 默认隐藏，避免「点了没反应」的死键。
// 绑定与键盘 intent 保留（隐藏元素上不会触发），待技能系统接入时再放开。
input.bindActionButton('btnQ', 'skill1');
input.bindActionButton('btnE', 'skill2');

// D-207 gate: only the mock adapter exists until the owner decides.
const save = new MockSaveAdapter();

// ── 真实数据源接线 ─────────────────────────────────────────────
// bridge 持有共享领域总线（同时注入 CombatRuntime 与 UiRoot），
// 把 combat.snapshot 适配成 RunSnapshot（补齐 Boss 血条字段），
// 并把 UI 命令转成下一帧的 CombatFrameInput（升级选卡 / 武器切换）。
const bridge = new CombatUiBridge();
// 与 combat/UI 共享同一条 bus；?mute=1 供 QA/调试静音，不进玩法逻辑。
const audio = createAudioRuntime({ bus: bridge.bus, muted: params.get('mute') === '1' });
(window as unknown as { __rbAudio: () => unknown }).__rbAudio = () => ({
  muted: audio.isMuted,
  voices: audio.activeVoices,
  track: audio.currentTrack,
});
const boot = createBootstrapScene({
  engine: host.engine,
  canvas,
  input,
  save,
  ui: bridge.sources,
  onUiCommand: bridge.onCommand,
  uiBridge: bridge,
  text: enResolver,
});
host.useScene(boot.scene);

/** 只读取证端口：不参与玩法，仅供 Playwright / QA 读逻辑状态（避免只靠像素猜）。 */
(window as unknown as { __rbProbe: () => unknown }).__rbProbe = () => boot.probe();

// focus loss suspends inputs (gameplay should pause on this state)
input.addListener((ev) => {
  if (ev.kind === 'suspend' && ev.suspended) {
    hud.textContent = '>> SUSPENDED (window blurred / page hidden) — inputs cleared';
  }
});

// PerfMonitor 是调试设施：默认关闭，避免调试文字盖住试玩画面；?perf=1 时打开。
if (gameConfig.debug.showPerfHud && params.get('perf') === '1') {
  new PerfMonitor(host.engine, boot.scene, true);
}

// 旧调试 HUD 逻辑：不删、不改，默认由 CSS 隐藏；?debug=1 时用于对照。
setInterval(() => {
  const mv = input.getMove();
  const st = input.getSystemState();
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
console.log('[s2g] real UI data source wired: combat.snapshot + combat.bus + UI command sink');
