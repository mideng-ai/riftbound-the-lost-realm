/**
 * TASK-07 UI 契约测试（单独运行：node --experimental-strip-types --test tests/ui-contract.test.mjs）
 *
 * 不接入 package.json 的 `npm run test` —— 该门禁是仓库既有的 53+18 条，
 * 本分支不得改动其脚本或让任何一条变红。本文件直接 import 真实
 * src/config / src/domain / src/ui 模块，验证：
 *  - UI 展示值来自领域/config（改注入值 → 视图跟着变）
 *  - 形状双通道（色盲可区分）
 *  - 冻结契约 src/domain/ 与 src/config/ 未被本分支改动
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

import { formatTime, formatCount, formatPct, clamp01, hpDisplayTier } from '../src/ui/format.ts';
import {
  WARNING_SHAPES,
  AFFIX_SHAPE,
  BOSS_PHASE_THEME,
  GEM_KIND_SHAPE,
  GEM_QUALITY_THEME,
  CURRENCY_THEME,
  TAP_MIN_PX,
  shapePath,
} from '../src/ui/theme.ts';
import { buildHudViewModel } from '../src/ui/viewModel.ts';
import { UI_TEXT_KEYS, keyLabel, identityTextResolver } from '../src/ui/uiText.ts';
import { createEventBus, createRunSnapshot, xpToNextLevel } from '../src/domain/index.ts';
import { RUN_TIMELINE_CONST } from '../src/config/common.ts';
import { playerConfig } from '../src/config/playerConfig.ts';
import { gemConfig } from '../src/config/gemConfig.ts';

// ── A. 格式化纯函数 ──

test('AC-U01 formatTime / formatCount / formatPct 边界', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(615), '10:15');
  assert.equal(formatTime(-5), '0:00');
  assert.equal(formatTime(Number.NaN), '0:00');
  assert.equal(formatCount(1234), '1,234');
  assert.equal(formatCount(-3), '0');
  assert.equal(formatPct(0.5), '50%');
  assert.equal(formatPct(1.2), '100%');
  assert.equal(clamp01(Number.NaN), 0);
  assert.equal(hpDisplayTier(0.25), 'low');
  assert.equal(hpDisplayTier(0.26), 'mid');
  assert.equal(hpDisplayTier(0.56), 'high');
});

// ── B. 形状双通道（色盲无障碍） ──

test('AC-U02 六预警形状 / 六词缀形状互异', () => {
  const warnShapes = Object.values(WARNING_SHAPES).map((v) => v.shape);
  assert.equal(warnShapes.length, 6);
  assert.equal(new Set(warnShapes).size, 6);
  const affixShapes = Object.values(AFFIX_SHAPE);
  assert.equal(affixShapes.length, 6);
  assert.equal(new Set(affixShapes).size, 6);
  for (const s of warnShapes) assert.ok(shapePath(s).length > 5, `shape ${s} 应有 SVG path`);
});

test('AC-U03 Boss 三阶段 / 七宝石 / 五品质 / 七货币形状互异', () => {
  assert.equal(new Set(Object.values(BOSS_PHASE_THEME).map((v) => v.shape)).size, 3);
  assert.equal(new Set(Object.values(BOSS_PHASE_THEME).map((v) => v.color)).size, 3);
  assert.equal(Object.keys(GEM_KIND_SHAPE).length, 7);
  assert.equal(new Set(Object.values(GEM_KIND_SHAPE)).size, 7);
  assert.equal(Object.keys(GEM_QUALITY_THEME).length, 5);
  assert.equal(new Set(Object.values(GEM_QUALITY_THEME).map((v) => v.border)).size >= 4, true);
  assert.equal(Object.keys(CURRENCY_THEME).length, 7);
  assert.ok(TAP_MIN_PX >= 44);
});

test('AC-U04 文本端口：key 常量与解析器不伪造文案', () => {
  assert.equal(identityTextResolver('upgrade.splitShot.name'), 'upgrade.splitShot.name');
  assert.equal(keyLabel('upgrade.splitShot.name'), 'Split Shot');
  assert.ok(Object.values(UI_TEXT_KEYS).every((k) => typeof k === 'string' && k.startsWith('ui.')));
});

// ── C. 视图模型：数据来自领域/config ──

function baseInputs(overrides = {}) {
  const { snapshot: snapOverrides, ...rest } = overrides;
  const s = createRunSnapshot();
  Object.assign(s, {
    phase: 'running',
    elapsedSec: 525,
    playerHp: 100,
    playerMaxHp: 100,
    currentWeapon: 'staff',
    xp: 20,
    level: 5,
    bossHpPct: null,
    bossPhase: null,
    bossWarning: false,
  }, snapOverrides ?? {});
  return {
    snapshot: s,
    xpToNext: xpToNextLevel,
    warnCheckpointsSec: RUN_TIMELINE_CONST.bossWarnCheckpointsSec,
    bossSpawnSec: RUN_TIMELINE_CONST.bossSpawnSec,
    maxMetaLevel: playerConfig.metaGrowth.maxLevel,
    ...rest,
  };
}

test('AC-U05 快照 1:1 映射 + XP 需求取领域函数 xpToNextLevel', () => {
  const vm = buildHudViewModel(baseInputs());
  assert.equal(vm.hpText, '100 / 100');
  assert.equal(vm.hpPct, 1);
  assert.equal(vm.timeText, '8:45');
  assert.equal(vm.levelText, 'Lv.5');
  assert.ok(Math.abs(vm.xpPct - 20 / xpToNextLevel(5)) < 1e-12);
  assert.equal(vm.timeFrozen, false);
  assert.equal(vm.hudVisible, true);
  assert.equal(vm.weapons[0].active, true);
  assert.equal(vm.weapons[1].active, false);
  assert.equal(vm.currencies.length, 7);
  assert.ok(vm.currencies.every((c) => c.text === null)); // 端口未接线 → 占位
});

test('AC-U06 改注入数值 → UI 跟随（验收：改 config 后 UI 跟着变）', () => {
  const a = buildHudViewModel(baseInputs());
  const b = buildHudViewModel(baseInputs({ snapshot: { playerHp: 55, level: 8, xp: 100, elapsedSec: 555 } }));
  assert.equal(b.hpText, '55 / 100');
  assert.equal(b.hpPct, 0.55);
  assert.equal(b.hpTier, 'mid');
  assert.equal(b.levelText, 'Lv.8');
  assert.ok(Math.abs(b.xpPct - 100 / xpToNextLevel(8)) < 1e-12);
  assert.notEqual(a.hpPct, b.hpPct);
  // 时间轴锚点改成另一组值 → 预警形态立刻跟着变（UI 内无 510/540/570/600 字面量）
  const c = buildHudViewModel(baseInputs({
    warnCheckpointsSec: [100, 300, 500],
    bossSpawnSec: 700,
    snapshot: { elapsedSec: 320, bossWarning: true },
  }));
  assert.equal(c.warning?.index, 1);
  assert.equal(c.warning?.countdownText, '6:20'); // 700 - 320 = 380s
});

test('AC-U07 低频端口注入 → 展示值来自宿主（UI 不推算）', () => {
  const vm = buildHudViewModel(baseInputs({
    currencies: { gold: 1234, forestMaterial: 5, fireShard: 8, iceShard: 2, lightningShard: 0, shadowShard: 1, forestCore: 3 },
    weaponLevels: { staff: 3, sword: 2 },
    weaponCooldownPct: { staff: 0.4, sword: 1 },
    metaProgress: { staffMastery: 9, swordMastery: 10, forestSurvival: 4 },
  }));
  assert.equal(vm.currencies[0].text, '1,234');
  assert.equal(vm.weapons[0].levelText, 'Lv.3');
  assert.equal(vm.weapons[1].levelText, 'Lv.2');
  assert.equal(vm.weapons[0].cooldownPct, 0.4);
  assert.equal(vm.weapons[1].cooldownPct, 1);
  assert.equal(vm.masteryText, `9/${playerConfig.metaGrowth.maxLevel} · 10/${playerConfig.metaGrowth.maxLevel} · 4/${playerConfig.metaGrowth.maxLevel}`);
});

test('AC-U08 Boss 阶段取快照 / 预警窗口与三点检查点', () => {
  const vm = buildHudViewModel(baseInputs({ snapshot: { bossHpPct: 0.5, bossPhase: 'corruption', elapsedSec: 555, bossWarning: true } }));
  assert.equal(vm.bossBar?.phase, 'corruption');
  assert.equal(vm.bossBar?.hpPct, 0.5);
  assert.equal(vm.bossBar?.hpText, '50%');
  assert.equal(vm.warning?.index, 1); // 555s 落在 540 检查点之后、570 之前
  assert.equal(vm.warning?.countdownText, '0:45');
  const noWarn = buildHudViewModel(baseInputs({ snapshot: { elapsedSec: 600, bossWarning: true } }));
  assert.equal(noWarn.warning, null); // Boss 登场后不再显示预警横幅
});

test('AC-U09 终态隐藏 HUD / 升级选卡冻结标识', () => {
  assert.equal(buildHudViewModel(baseInputs({ snapshot: { phase: 'victory' } })).hudVisible, false);
  assert.equal(buildHudViewModel(baseInputs({ snapshot: { phase: 'defeat' } })).hudVisible, false);
  assert.equal(buildHudViewModel(baseInputs({ snapshot: { phase: 'upgradePick' } })).timeFrozen, true);
  assert.equal(buildHudViewModel(baseInputs({ snapshot: { phase: 'running' } })).timeFrozen, false);
});

// ── D. EventBus 泄漏防线（冻结契约自带，UI dispose 依赖） ──

test('AC-U10 subscribe 退订 / clearAll / 异常隔离', () => {
  const bus = createEventBus();
  let hits = 0;
  const off = bus.subscribe('resource.picked_up', () => { hits += 1; });
  bus.publish('resource.picked_up', { currencyId: 'gold', amount: 1 });
  assert.equal(hits, 1);
  assert.equal(bus.listenerCount('resource.picked_up'), 1);
  off();
  assert.equal(bus.listenerCount('resource.picked_up'), 0);
  bus.subscribe('boss.phase_changed', () => { throw new Error('isolated'); });
  let second = 0;
  bus.subscribe('boss.phase_changed', () => { second += 1; });
  bus.publish('boss.phase_changed', { phase: 'corruption', hpPct: 0.5 });
  assert.equal(second, 1);
  bus.clearAll();
  assert.equal(bus.listenerCount('boss.phase_changed'), 0);
});

// ── E. 红线：冻结契约未被改动 / config 数值未硬编码进 UI ──

test('AC-U11 src/domain/ 与 src/config/ 无本分支改动', () => {
  const changed = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim().slice(3))
    .filter(Boolean);
  const violations = changed.filter((p) => p.startsWith('src/domain/') || p.startsWith('src/config/'));
  assert.deepEqual(violations, [], `冻结契约被改动: ${violations.join(', ')}`);
});

test('AC-U12 UI 源码不写死时间轴 / XP 曲线 / 槽位数字面量', () => {
  const files = readdirSync('src/ui').filter((f) => f.endsWith('.ts'));
  const forbidden = /\b(510|540|570|600|1\.35|slotsPerWeapon\s*[:=]\s*3)\b/;
  for (const f of files) {
    const src = readFileSync(`src/ui/${f}`, 'utf8');
    // 允许注释里引用文档数值；本检查只扫描非注释行（粗略去掉 // 行）
    const code = src.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
    assert.equal(forbidden.test(code), false, `${f} 出现硬编码数值: ${code.match(forbidden)?.[0]}`);
  }
  assert.equal(gemConfig.slotsPerWeapon, 3); // 槽位数来自 config
  assert.equal(gemConfig.merge.requiredCount, 3);
  assert.equal(RUN_TIMELINE_CONST.bossWarnSec, 510); // 时间轴来自 config
});
