/**
 * TASK-01 领域契约层自动化测试（QA 复测 D-10，MUST 级）。
 *
 * 覆盖范围：
 *   - AC-1 ~ AC-10 全部十条（docs/设计-D09-D08-R01数值锚点仲裁书.md §验收标准）
 *   - QA 前两轮发现的核心行为回归：三层乘区锚点 / Boss 阶段血线 / 精英窗口 /
 *     穿透不污染吸血 / 选卡过滤 / Rng 确定性 / 存档 v3 迁移 / RunClock 冻结 /
 *     EventBus 生命周期 / totalOverflowPct 恒 0 / 森林生存里程碑
 *
 * 断言全部写死期望值（锚点数字来自仲裁书），不存在"跑一遍看看对不对"。
 *
 * 运行：npm run test:domain
 * 编译链：tsc -p tsconfig.test.json → .testbuild/（CommonJS）→ tests/prepare.cjs
 *         标记 CJS → 本文件以 node:test 直接加载编译产物。
 */
'use strict';

import { createRequire } from 'node:module';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);

const damage = require('../.testbuild/domain/damage.js');
const upgrade = require('../.testbuild/domain/upgrade.js');
const enemy = require('../.testbuild/domain/enemy.js');
const save = require('../.testbuild/domain/save.js');
const clockMod = require('../.testbuild/domain/clock.js');
const events = require('../.testbuild/domain/events.js');
const player = require('../.testbuild/domain/player.js');
const runState = require('../.testbuild/domain/runState.js');
const wave = require('../.testbuild/domain/wave.js');

const playerConfigMod = require('../.testbuild/config/playerConfig.js');
const commonMod = require('../.testbuild/config/common.js');
const damageConfigMod = require('../.testbuild/config/damageConfig.js');
const upgradePoolMod = require('../.testbuild/config/upgradePoolConfig.js');

const { rebuildDamageLayers, computeShotDamage, resolveDamageHit, C_ZONE_DERIVED_CATEGORIES } = damage;
const { rollUpgradeChoices, cardToBuffEntry, upgradeCard, allUpgradeCards } = upgrade;
const { bossPhaseAtHp, bossDefinition } = enemy;
const { SAVE_SCHEMA_VERSION, defaultSaveV3, migrateV2toV3, migrateSave, validateSaveV3 } = save;
const { RunClock } = clockMod;
const { createEventBus, createMulberry32 } = events;
const { forestSurvivalPctOfLevel, deriveMaxHp } = player;
const { xpToNextLevel, canTransition } = runState;
const { eliteAllowedAt, phaseAtSec } = wave;

const { playerConfig } = playerConfigMod;
const { DAMAGE_CAPS_CONST } = commonMod;
const { damageConfig } = damageConfigMod;
const { upgradePoolConfig } = upgradePoolMod;

/** 测试专用 caps（与生产 damageConfig.caps 同源，显式传递）。 */
const caps = damageConfig.caps;

/** 浮点近似相等（锚点容差 1e-3，覆盖手算四舍五入）。 */
function closeTo(actual, expected, tol = 1e-3, msg = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg} 期望 ≈ ${expected}，实际 ${actual}（偏差 ${Math.abs(actual - expected)} 超容差 ${tol}）`,
  );
}

/** 生产口径的完整三层快照（法杖、力量传说×3、重弹 III）。 */
function anchorLayers(damagePct = 0.5) {
  return rebuildDamageLayers(
    { weaponUpgradePct: 0.32, masteryPct: 0.25 },
    { entries: [{ gemId: 'power', basePct: 0.06, qualityMult: 2.4, repeatMult: 2.0 }] },
    [{ buffId: 'heavyShot', category: 'damage', pct: damagePct }],
    caps,
  );
}

// ═══════════════════════════════════════════════════════════
// AC-1 ~ AC-10：数值锚点（docs/设计-D09-D08-R01数值锚点仲裁书.md §验收标准）
// ═══════════════════════════════════════════════════════════

describe('AC-1 基准算例：三层乘区锚点 24.2659 / DPS 48.53', () => {
  test('A×B×C 与配置表自洽，单发 = 24.2659', () => {
    const layers = anchorLayers();
    // 算例：8 × (1+0.32+0.25) × 1.288 × 1.50
    closeTo(layers.A, 1.57, 1e-9, 'A 区');
    closeTo(layers.B, 1.288, 1e-9, 'B 区（0.06×2.4×2.0 = 0.288）');
    closeTo(layers.C, 1.5, 1e-9, 'C 区');
    closeTo(computeShotDamage(playerConfig.staff.baseDamage, layers), 24.2659, 1e-3, '单发伤害');
  });

  test('法杖 DPS = 48.53（单发 ÷ 0.5s 间隔）', () => {
    const layers = anchorLayers();
    const dps = computeShotDamage(playerConfig.staff.baseDamage, layers) / playerConfig.staff.intervalSec;
    closeTo(dps, 48.5318, 1e-2, 'DPS');
  });
});

describe('AC-2 强化表等差性：相邻差恒为 0.08', () => {
  test('weaponUpgradePctByLevel 逐级差 = 0.08', () => {
    const table = playerConfig.weaponUpgradePctByLevel;
    assert.equal(table.length, 5);
    for (let i = 1; i < table.length; i++) {
      closeTo(table[i] - table[i - 1], 0.08, 1e-12, `Lv${i}→Lv${i + 1}`);
    }
  });
});

describe('AC-3 熟练 Lv10 = 25%', () => {
  test('masteryPctOfLevel(10) === 0.25（含里程碑 +5%）', () => {
    closeTo(playerConfigMod.masteryPctOfLevel(10), 0.25, 1e-12);
    // 约束式：perLevel × 10 + milestone = 0.25
    const m = playerConfig.metaGrowth;
    closeTo(m.masteryPctPerLevel * 10 + m.milestoneBonus.masteryPct, 0.25, 1e-12);
  });
});

describe('AC-4 熟练 Lv9 / Lv10 断层', () => {
  test('Lv9 = 0.18，Lv10 = 0.25，差 0.07', () => {
    closeTo(playerConfigMod.masteryPctOfLevel(9), 0.18, 1e-12);
    closeTo(playerConfigMod.masteryPctOfLevel(10), 0.25, 1e-12);
    closeTo(playerConfigMod.masteryPctOfLevel(10) - playerConfigMod.masteryPctOfLevel(9), 0.07, 1e-12);
  });
});

describe('AC-5 A 区满配 = 1.57', () => {
  test('1 + 0.32 + 0.25 = 1.57', () => {
    const layers = rebuildDamageLayers(
      { weaponUpgradePct: playerConfig.weaponUpgradePctByLevel[4], masteryPct: 0.25 },
      { entries: [] },
      [],
      caps,
    );
    closeTo(layers.A, 1.57, 1e-9);
  });
});

describe('AC-6 Boss TTK（×0.7 口径）落在 2–3 分钟', () => {
  test('6000 / (48.5318 × 0.7) ≈ 176.6s', () => {
    const layers = anchorLayers();
    const dps = computeShotDamage(playerConfig.staff.baseDamage, layers) / playerConfig.staff.intervalSec;
    const ttk = bossDefinition().baseHp / (dps * 0.7);
    closeTo(ttk, 176.6, 0.5, 'TTK');
    assert.ok(ttk >= 120 && ttk <= 180, `TTK ${ttk}s 应在 2–3 分钟（120–180s）`);
  });
});

describe('AC-7 破甲不被双计', () => {
  test('Boss 满破甲：单发 = A×B×C × 1.5（不是 ×1.5×1.5）', () => {
    const layers = rebuildDamageLayers(
      { weaponUpgradePct: 0.32, masteryPct: 0.25 },
      { entries: [{ gemId: 'power', basePct: 0.06, qualityMult: 2.4, repeatMult: 2.0 }] },
      [
        { buffId: 'heavyShot', category: 'damage', pct: 0.5 },
        { buffId: 'armorBreak', category: 'armorBreak', pct: 0.5 },
      ],
      caps,
    );
    closeTo(layers.armorBreakBonus, 0.5, 1e-12, '满配破甲 0.5');
    const base = computeShotDamage(playerConfig.staff.baseDamage, layers); // 24.2659
    const r = resolveDamageHit({
      source: 'staff',
      baseDamage: base,
      targetId: 1,
      hitPos: { x: 0, y: 0, z: 0 },
      targetHp: 99999,
      targetTier: 'boss',
      armorBreakBonus: layers.armorBreakBonus, // 满配 0.5
    });
    closeTo(r.dealt, base * 1.5, 1e-9, '破甲单次乘算');
    assert.ok(r.dealt < base * 2.24, `不得出现双重破甲（${r.dealt} ≥ ${base * 2.24}）`);
  });

  test('普通怪不吃破甲', () => {
    const r = resolveDamageHit({
      source: 'staff',
      baseDamage: 100,
      targetId: 1,
      hitPos: { x: 0, y: 0, z: 0 },
      targetHp: 99999,
      targetTier: 'normal',
      armorBreakBonus: 0.5,
    });
    closeTo(r.dealt, 100, 1e-12, 'normal 档位破甲无效');
  });
});

describe('AC-8 C_ZONE_DERIVED_CATEGORIES === ["damage"]', () => {
  test('常量仍是单元素 damage，armorBreak 未被加入', () => {
    assert.deepEqual([...C_ZONE_DERIVED_CATEGORIES], ['damage']);
    assert.ok(!C_ZONE_DERIVED_CATEGORIES.includes('armorBreak'));
  });
});

describe('AC-9 totalOverflowPct 恒为 0（总上限不可达被固化）', () => {
  test('合法与超限输入下 totalOverflowPct 恒 = 0', () => {
    const cases = [
      [],
      [{ buffId: 'heavyShot', category: 'damage', pct: 0.25 }],
      // 远超 damage 单类上限 +100%：单类先夹到 1.0，C 区 = 1.0 < 1.5，总上限仍不触发
      [
        { buffId: 'heavyShot', category: 'damage', pct: 0.5 },
        { buffId: 'bladeEnhance', category: 'damage', pct: 0.5 },
        { buffId: 'eventSurge', category: 'damage', pct: 3.0 },
      ],
      [{ buffId: 'swiftStep', category: 'moveSpeed', pct: 0.2 }, { buffId: 'x', category: 'interval', pct: 0.2 }],
    ];
    for (const buffs of cases) {
      const layers = rebuildDamageLayers({ weaponUpgradePct: 0.32, masteryPct: 0.25 }, { entries: [] }, buffs, caps);
      assert.equal(layers.cZone.totalOverflowPct, 0, `输入 ${JSON.stringify(buffs)} 时 totalOverflowPct 应为 0`);
      assert.equal(layers.cZone.appliedPct, layers.cZone.cZonePct, 'appliedPct 应等于未被总上限削减的 cZonePct');
    }
  });

  test('damage 单类上限 +100% 真实生效（超限部分进 damageOverflowPct）', () => {
    const layers = rebuildDamageLayers(
      { weaponUpgradePct: 0, masteryPct: 0 },
      { entries: [] },
      [{ buffId: 'eventSurge', category: 'damage', pct: 3.0 }],
      caps,
    );
    closeTo(layers.cZone.damageClampedPct, 1.0, 1e-12);
    closeTo(layers.cZone.damageOverflowPct, 2.0, 1e-12);
    closeTo(layers.C, 2.0, 1e-12);
  });
});

describe('AC-10 强化 Lv5 = 32%（规划书算例 / 总纲表 / playerConfig 三处一致）', () => {
  test('weaponUpgradePctByLevel[4] === 0.32', () => {
    assert.equal(playerConfig.weaponUpgradePctByLevel[4], 0.32);
    // A 区满配算例反证：8 × 1.57 里含 0.32 强化项（AC-1 已锚定 24.2659）
    closeTo(1 + playerConfig.weaponUpgradePctByLevel[4] + 0.25, 1.57, 1e-12);
  });
});

// ═══════════════════════════════════════════════════════════
// QA 前两轮核心行为回归
// ═══════════════════════════════════════════════════════════

describe('Boss 阶段：8 个血线点（100/70/65/50/30/29/10/0%）', () => {
  test('边界语义：65% 归 corruption、30% 归 coreFrenzy（右开）', () => {
    const cases = [
      [1.0, 'guardian'],
      [0.7, 'guardian'],
      [0.65, 'corruption'],
      [0.5, 'corruption'],
      [0.3, 'coreFrenzy'],
      [0.29, 'coreFrenzy'],
      [0.1, 'coreFrenzy'],
      [0.0, 'coreFrenzy'],
    ];
    for (const [pct, expected] of cases) {
      assert.equal(bossPhaseAtHp(pct), expected, `血线 ${pct} 应为 ${expected}`);
    }
    assert.equal(bossDefinition().baseHp, 6000);
  });
});

describe('精英窗口 [360, 509]', () => {
  test('eliteAllowedAt 六个边界点', () => {
    assert.equal(eliteAllowedAt(299), false, '阶段 2 内不刷精英');
    assert.equal(eliteAllowedAt(300), false, '阶段 3 起点，但首刷 360s 未到（D-01 缺陷根因）');
    assert.equal(eliteAllowedAt(359), false, '首刷前一秒');
    assert.equal(eliteAllowedAt(360), true, '首刷时刻含');
    assert.equal(eliteAllowedAt(509), true, '阶段 4 内仍允许');
    assert.equal(eliteAllowedAt(510), false, '510s 起停刷（Boss 预警）');
  });
});

describe('穿透不污染吸血（lifesteal = 0）', () => {
  test('pierce 类 buff 进快照后 lifestealPctMaxHp 仍为 0', () => {
    const layers = rebuildDamageLayers(
      { weaponUpgradePct: 0, masteryPct: 0 },
      { entries: [] },
      [
        cardToBuffEntry(upgradeCard('pierceShot'), 3), // { category: 'pierce', pct: 3 }
        { buffId: 'leech', category: 'killHeal', pct: 3 },
      ],
      caps,
    );
    assert.equal(layers.lifestealPctMaxHp, 0, '穿透/汲取不得被当作吸血比例');
    assert.equal(layers.killHealHp, 3);
  });

  test('吸血只认 vampiricBlade 白名单', () => {
    const layers = rebuildDamageLayers(
      { weaponUpgradePct: 0, masteryPct: 0 },
      { entries: [] },
      [{ buffId: 'vampiricBlade', category: 'lifesteal', pct: 0.015 }],
      caps,
    );
    closeTo(layers.lifestealPctMaxHp, 0.015, 1e-12);
  });
});

describe('选卡：恒 3 张 / 不重复 / scope 过滤 / 满级过滤', () => {
  test('空 buff + staff：恒 3 张、无重复、全部为 staff 或 generic', () => {
    for (const seed of [1, 42, 20261114]) {
      const rng = createMulberry32(seed);
      const picks = rollUpgradeChoices(rng, [], { currentWeapon: 'staff' });
      assert.equal(picks.length, 3, `seed=${seed} 应出 3 张`);
      const ids = picks.map((c) => c.id);
      assert.equal(new Set(ids).size, 3, `seed=${seed} 不得重复`);
      for (const c of picks) {
        assert.ok(c.scope === 'staff' || c.scope === 'generic', `卡 ${c.id} scope=${c.scope} 不属于 staff 局`);
      }
    }
  });

  test('sword 局不出现 staff 专属卡', () => {
    const rng = createMulberry32(7);
    const picks = rollUpgradeChoices(rng, [], { currentWeapon: 'sword' });
    assert.equal(picks.length, 3);
    for (const c of picks) assert.notEqual(c.scope, 'staff');
  });

  test('满级卡（heavyShot ×3）被过滤', () => {
    const maxed = [
      { buffId: 'heavyShot', category: 'damage', pct: 0.12 },
      { buffId: 'heavyShot', category: 'damage', pct: 0.18 },
      { buffId: 'heavyShot', category: 'damage', pct: 0.25 },
    ];
    const rng = createMulberry32(1);
    const picks = rollUpgradeChoices(rng, maxed, { currentWeapon: 'staff' });
    assert.equal(picks.length, 3);
    assert.ok(!picks.some((c) => c.id === 'heavyShot'), '满级卡不得再出现');
  });

  test('同 seed 选卡序列可复现', () => {
    const a = rollUpgradeChoices(createMulberry32(99), [], { currentWeapon: 'staff' }).map((c) => c.id);
    const b = rollUpgradeChoices(createMulberry32(99), [], { currentWeapon: 'staff' }).map((c) => c.id);
    assert.deepEqual(a, b);
  });
});

describe('Rng：同 seed 一致、不同 seed 不同', () => {
  test('createMulberry32 确定性', () => {
    const a = createMulberry32(1234);
    const b = createMulberry32(1234);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    assert.deepEqual(seqA, seqB);

    const c = createMulberry32(1235);
    const seqC = [c.next(), c.next(), c.next()];
    assert.notDeepEqual(seqA, seqC);
  });

  test('snapshot / restore 可复现中间状态', () => {
    const r = createMulberry32(8);
    r.next();
    r.next();
    const snap = r.snapshot();
    const expected = r.next();
    r.restore(snap);
    assert.equal(r.next(), expected);
  });
});

describe('存档：v3 schema / socket = itemInstanceId / v2→v3 迁移', () => {
  test('SAVE_SCHEMA_VERSION === 3，默认存档自洽', () => {
    assert.equal(SAVE_SCHEMA_VERSION, 3);
    const s = defaultSaveV3();
    assert.equal(s.schemaVersion, 3);
    assert.deepEqual([...s.weapons.staff.sockets], [null, null, null]);
    assert.deepEqual(validateSaveV3(s), []);
  });

  test('socket 存 itemInstanceId，引用完整则校验通过', () => {
    const s = defaultSaveV3();
    const gem = { itemInstanceId: 'gem-inst-1', gemId: 'fire', quality: 'legendary' };
    const withGem = {
      ...s,
      gemInventory: [gem],
      weapons: { staff: { level: 1, sockets: ['gem-inst-1', null, null] }, sword: s.weapons.sword },
    };
    assert.deepEqual(validateSaveV3(withGem), []);
  });

  test('悬空 socket ID 被校验拦截（Q6 的直接后果）', () => {
    const s = defaultSaveV3();
    const broken = {
      ...s,
      weapons: { staff: { level: 1, sockets: ['ghost-id', null, null] }, sword: s.weapons.sword },
    };
    const issues = validateSaveV3(broken);
    assert.equal(issues.length, 1);
    assert.match(issues[0], /ghost-id/);
  });

  test('v2→v3 迁移：只迁移 gold，音量重置为默认 1', () => {
    const v2 = {
      schemaVersion: 2,
      savedAt: '2026-11-01T00:00:00.000Z',
      profile: { gold: 123, unlocks: ['staff'] },
      inventory: [{ junk: true }],
      stash: [],
      settings: { sfx: false, music: false },
    };
    const v3 = migrateV2toV3(v2);
    assert.equal(v3.schemaVersion, 3);
    assert.equal(v3.currencies.gold, 123, 'gold 是唯一迁移项');
    assert.equal(v3.settings.volumes.music, 1, 'V2 布尔音量不迁移，重置为 1');
    assert.deepEqual(validateSaveV3(v3), []);
    // 幂等：不修改入参
    assert.equal(v2.profile.gold, 123);
  });

  test('migrateSave：v2 直通 / null 兜底 / 未知版本回退默认', () => {
    assert.equal(migrateSave({ schemaVersion: 2, profile: { gold: 50 } }).schemaVersion, 3);
    assert.equal(migrateSave(null).schemaVersion, 3);
    assert.equal(migrateSave({ schemaVersion: 999 }).schemaVersion, 3);
    assert.equal(migrateSave({ schemaVersion: 2, profile: { gold: 50 } }).currencies.gold, 50);
  });
});

describe('RunClock：freeze 不累计、resume 恢复', () => {
  test('冻结期间 advance 无效，resume 后继续累计', () => {
    const clock = new RunClock();
    clock.advance(10);
    closeTo(clock.elapsedSec, 10, 1e-12);
    clock.freeze();
    assert.equal(clock.frozen, true);
    clock.advance(5);
    clock.advance(3);
    closeTo(clock.elapsedSec, 10, 1e-12, '冻结期间不得累计');
    clock.resume();
    clock.advance(2);
    closeTo(clock.elapsedSec, 12, 1e-12, 'resume 后恢复累计');
  });

  test('reset 清零并解除冻结；Boss 阈值边沿标记 510/600', () => {
    const clock = new RunClock();
    clock.advance(600);
    assert.equal(clock.bossWarningStarted, true, '510s 预警边沿');
    assert.equal(clock.bossSpawned, true, '600s 登场边沿');
    clock.freeze();
    clock.reset();
    assert.equal(clock.elapsedSec, 0);
    assert.equal(clock.frozen, false);
    assert.equal(clock.bossWarningStarted, false);
  });
});

describe('EventBus：退订 / clearAll / 异常隔离', () => {
  test('退订后不再收到事件（幂等退订）', () => {
    const bus = createEventBus();
    let count = 0;
    const unsub = bus.subscribe('enemy.killed', () => count++);
    bus.publish('enemy.killed', { defId: 'riftHound', atSec: 1, drops: [] });
    assert.equal(count, 1);
    assert.equal(bus.listenerCount('enemy.killed'), 1);
    unsub();
    unsub(); // 幂等
    bus.publish('enemy.killed', { defId: 'riftHound', atSec: 2, drops: [] });
    assert.equal(count, 1);
    assert.equal(bus.listenerCount('enemy.killed'), 0);
  });

  test('clearAll 清空全部监听器', () => {
    const bus = createEventBus();
    bus.subscribe('run.started', () => {});
    bus.subscribe('player.died', () => {});
    assert.equal(bus.listenerCount('run.started'), 1);
    assert.equal(bus.listenerCount('player.died'), 1);
    bus.clearAll();
    assert.equal(bus.listenerCount('run.started'), 0);
    assert.equal(bus.listenerCount('player.died'), 0);
  });

  test('单个 handler 抛错不中断其余监听', () => {
    const bus = createEventBus();
    let good = 0;
    bus.subscribe('boss.defeated', () => {
      throw new Error('boom');
    });
    bus.subscribe('boss.defeated', () => good++);
    assert.doesNotThrow(() => bus.publish('boss.defeated', { atSec: 100 }));
    assert.equal(good, 1, '异常必须被隔离，后续 handler 仍执行');
  });
});

describe('森林生存 Lv10 = 15%（不是 14%）', () => {
  test('Lv9 = 9%，Lv10 = 10% + 5% 里程碑 = 15%', () => {
    closeTo(forestSurvivalPctOfLevel(9), 0.09, 1e-12);
    closeTo(forestSurvivalPctOfLevel(10), 0.15, 1e-12, '里程碑加在满级线性值上，不是 Lv9 值');
    assert.notEqual(forestSurvivalPctOfLevel(10), 0.14);
    closeTo(deriveMaxHp(0, forestSurvivalPctOfLevel(10)), 115, 1e-9, '最大生命 100 → 115');
  });
});

describe('C_ZONE_DERIVED_CATEGORIES 仍为 ["damage"]（AC-8 的固化副本）', () => {
  test('与 ADR-TD-007 一致：armorBreak 不在 C 区总量表内', () => {
    assert.deepEqual([...C_ZONE_DERIVED_CATEGORIES], ['damage']);
  });
});

// ═══════════════════════════════════════════════════════════
// 契约自检补充：caps 单一来源 + XP 曲线（选卡与升级系统的输入）
// ═══════════════════════════════════════════════════════════

describe('caps 单一来源与 XP 曲线', () => {
  test('damageConfig.caps 与 DAMAGE_CAPS_CONST / upgradePoolConfig.caps 三处同源', () => {
    for (const key of ['inRunTotalPct', 'inRunDamagePct', 'intervalReductionPct', 'procChanceAbs', 'armorBreakPct']) {
      assert.equal(damageConfig.caps[key], DAMAGE_CAPS_CONST[key], `caps.${key} 漂移`);
      if (key in upgradePoolConfig.caps) assert.equal(damageConfig.caps[key], upgradePoolConfig.caps[key]);
    }
    assert.equal(damageConfig.caps.inRunTotalPct, 1.5);
    assert.equal(damageConfig.caps.inRunDamagePct, 1.0);
  });

  test('选卡数量契约 choicesPerLevel = 3；15 张卡齐全', () => {
    assert.equal(upgradePoolConfig.choicesPerLevel, 3);
    assert.equal(allUpgradeCards().length, 15);
  });

  test('XP 曲线按公式 round(40 × L^1.35)', () => {
    closeTo(xpToNextLevel(1), 40, 1e-9);
    closeTo(xpToNextLevel(5), 351, 1e-9, '以公式为准（附表 312 为手算误差）');
    assert.equal(canTransition('running', 'upgradePick'), true);
    assert.equal(canTransition('upgradePick', 'victory'), false, '选卡期非法直出胜负');
  });
});
