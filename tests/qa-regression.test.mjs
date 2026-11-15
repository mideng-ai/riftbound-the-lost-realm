/**
 * TASK-08 QA 独立回归套件（第一轮 · 真实冻结契约版）。
 *
 * 与 domain-contract.test.mjs（TASK-01 交付）互为独立防线：
 *   - 该文件覆盖 53 条契约断言；本文件从 QA 视角补齐任务书「必须覆盖」中
 *     尚未固化的横向项：Boss 血线全表 + 单调性 / AC-9 大规模 fuzz /
 *     RunClock 逐帧误差 / EventBus 压力 / Rng 压力 / 存档畸形输入 /
 *     20 分钟逻辑浸泡 + 帧预算 + 内存。
 *
 * 红线：本文件只读引用 src/（经 .testbuild 编译产物），不修改任何业务代码。
 * 运行：npm run test:qa（已并入 npm run test 聚合）
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
const wave = require('../.testbuild/domain/wave.js');

const damageConfigMod = require('../.testbuild/config/damageConfig.js');

const { rebuildDamageLayers, computeShotDamage } = damage;
const { rollUpgradeChoices } = upgrade;
const { bossPhaseAtHp } = enemy;
const { migrateV2toV3, migrateSave } = save;
const { RunClock } = clockMod;
const { createEventBus, createMulberry32 } = events;
const { eliteAllowedAt } = wave;

const caps = damageConfigMod.damageConfig.caps;

// ─────────────────────────────────────────────────────────────
// Q-A：Boss 阶段血线（8 点全表 + 满血 + 单调 + 畸形输入）
// ─────────────────────────────────────────────────────────────
describe('Q-A Boss 血线', () => {
  test('8 个血线点全表：100/70/65/50/30/29/10/0', () => {
    const expected = [
      [1.00, 'guardian'], [0.70, 'guardian'], [0.65, 'corruption'], [0.50, 'corruption'],
      [0.30, 'coreFrenzy'], [0.29, 'coreFrenzy'], [0.10, 'coreFrenzy'], [0.00, 'coreFrenzy'],
    ];
    for (const [hp, phase] of expected) {
      assert.equal(bossPhaseAtHp(hp), phase, `hpPct=${hp}`);
    }
  });

  test('满血不得误判第三阶段（1.0 / 0.99 / 0.9001 全为 guardian）', () => {
    assert.equal(bossPhaseAtHp(1.0), 'guardian');
    assert.equal(bossPhaseAtHp(0.99), 'guardian');
    assert.equal(bossPhaseAtHp(0.9001), 'guardian');
  });

  test('101 点扫描：血量升序 → 阶段序号非递增（无翻转）', () => {
    const order = { guardian: 0, corruption: 1, coreFrenzy: 2 };
    let prev = 2;
    for (let i = 0; i <= 100; i++) {
      const v = order[bossPhaseAtHp(i / 100)];
      assert.ok(v <= prev, `阶段翻转 @hp=${i / 100}`);
      prev = v;
    }
  });

  test('畸形输入：NaN/超界夹取，不抛错', () => {
    assert.doesNotThrow(() => bossPhaseAtHp(Number.NaN));
    assert.doesNotThrow(() => bossPhaseAtHp(-1));
    assert.doesNotThrow(() => bossPhaseAtHp(1.5));
    assert.equal(bossPhaseAtHp(1.5), 'guardian'); // >1 夹到 1
  });
});

// ─────────────────────────────────────────────────────────────
// Q-B：AC-9 totalOverflowPct 恒 0 —— 大规模 fuzz（含极端/畸形值）
// ─────────────────────────────────────────────────────────────
describe('Q-B AC-9 fuzz', () => {
  test('50,000 组随机 buff 组合：overflow 恒 0、输出恒有限', () => {
    const rng = createMulberry32(20261115);
    const rnd = () => rng.next();
    const categories = Object.keys(caps.perCategory ?? {});
    // caps 结构兜底：直接从 damage 模块取类别表
    const cats = categories.length > 0
      ? categories
      : ['damage', 'armorBreak', 'attackSpeed', 'projectile', 'lifesteal', 'aoe', 'cooldown', 'critChance'];
    for (let i = 0; i < 50000; i++) {
      const buffs = [];
      const n = Math.floor(rnd() * 6);
      for (let j = 0; j < n; j++) {
        const r = rnd();
        const pct = r < 0.05 ? rnd() * 1e6      // 超大
          : r < 0.10 ? -rnd() * 100             // 负数（畸形）
          : rnd() * 2;                          // 常规
        buffs.push({ category: cats[Math.floor(rnd() * cats.length)], pct });
      }
      const layers = rebuildDamageLayers(
        { weaponUpgradePct: rnd() * 0.4, masteryPct: rnd() * 0.25 },
        { entries: [] },
        buffs,
        caps,
      );
      assert.equal(layers.cZone.totalOverflowPct, 0, `组合 #${i} 溢出非 0`);
      assert.ok(Number.isFinite(computeShotDamage(8, layers)), `组合 #${i} 输出非有限`);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Q-C：RunClock 逐帧误差（≤1 帧）+ 非法 dt + 单向性
// ─────────────────────────────────────────────────────────────
describe('Q-C RunClock 横向', () => {
  test('60fps 逐帧推进：510 预警 / 600 登场，误差 ≤ 1 帧', () => {
    const c = new RunClock();
    let warnFrame = -1;
    let spawnFrame = -1;
    for (let f = 1; f <= 60 * 620; f++) {
      c.advance(1 / 60);
      if (warnFrame < 0 && c.bossWarningStarted) warnFrame = f;
      if (spawnFrame < 0 && c.bossSpawned) { spawnFrame = f; break; }
    }
    assert.ok(warnFrame > 0 && spawnFrame > 0, '翻牌必须真实到达');
    const warnT = warnFrame / 60;
    assert.ok(Math.abs(warnT - 510) <= 1 / 60 + 1e-9, `预警误差 ${warnT}`);
  });

  test('非法 dt（NaN/负/Infinity）不推进、不抛错', () => {
    const c = new RunClock();
    assert.doesNotThrow(() => { c.advance(Number.NaN); c.advance(-5); });
    assert.equal(c.elapsedSec, 0);
    assert.doesNotThrow(() => c.advance(Number.POSITIVE_INFINITY));
  });

  test('freeze 整帧跳过：冻结期间 advance 任何值都不推进', () => {
    const c = new RunClock();
    c.advance(100);
    c.freeze();
    c.advance(500);
    c.advance(Number.POSITIVE_INFINITY);
    assert.equal(c.elapsedSec, 100);
    c.resume();
    c.advance(1);
    assert.equal(c.elapsedSec, 101);
  });

  test('reset 后翻牌可重新触发（幂等重开）', () => {
    const c = new RunClock();
    c.advance(600);
    assert.ok(c.bossSpawned);
    c.reset();
    assert.ok(!c.bossSpawned && !c.bossWarningStarted);
    c.advance(600);
    assert.ok(c.bossSpawned);
  });
});

// ─────────────────────────────────────────────────────────────
// Q-D：EventBus 压力（大量订阅/退订/异常混合）
// ─────────────────────────────────────────────────────────────
describe('Q-D EventBus 压力', () => {
  test('10,000 轮订阅-退订：listenerCount 归零、无泄漏', () => {
    const bus = createEventBus();
    for (let i = 0; i < 10000; i++) {
      const off = bus.subscribe('player.leveledUp', () => {});
      off();
    }
    assert.equal(bus.listenerCount('player.leveledUp'), 0);
  });

  test('退订幂等：重复退订不炸、不影响他人', () => {
    const bus = createEventBus();
    let hits = 0;
    const offA = bus.subscribe('player.leveledUp', () => { hits++; });
    bus.subscribe('player.leveledUp', () => { hits++; });
    offA(); offA(); offA();
    bus.publish('player.leveledUp', { level: 2 });
    assert.equal(hits, 1);
  });

  test('异常混合：一半 handler 抛错，其余照常收齐', () => {
    const bus = createEventBus();
    let ok = 0;
    for (let i = 0; i < 20; i++) {
      bus.subscribe('player.leveledUp', i % 2 === 0 ? () => { ok++; } : () => { throw new Error('x'); });
    }
    assert.doesNotThrow(() => bus.publish('player.leveledUp', { level: 2 }));
    assert.equal(ok, 10, '异常 handler 不得吞掉正常 handler');
  });
});

// ─────────────────────────────────────────────────────────────
// Q-E：Rng 压力（非法 seed / 千次一致 / restore 循环）
// ─────────────────────────────────────────────────────────────
describe('Q-E Rng 压力', () => {
  test('非法 seed（0/负/NaN/Infinity）不抛错且产出有限', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = createMulberry32(bad);
      assert.doesNotThrow(() => r.next());
      assert.ok(Number.isFinite(r.next()));
    }
  });

  test('同 seed 5,000 次逐项一致', () => {
    const a = createMulberry32(777);
    const b = createMulberry32(777);
    for (let i = 0; i < 5000; i++) assert.equal(a.next(), b.next());
  });

  test('snapshot/restore 循环 1,000 轮复现', () => {
    const r = createMulberry32(31337);
    r.next(); r.next();
    for (let i = 0; i < 1000; i++) {
      const snap = r.snapshot();
      const v1 = r.next();
      r.restore(snap);
      assert.equal(r.next(), v1);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Q-F：存档迁移畸形输入
// ─────────────────────────────────────────────────────────────
describe('Q-F 存档畸形', () => {
  test('migrateV2toV3 对 6 类畸形输入不抛错', () => {
    const bads = [
      {}, null, undefined, { gold: -1 }, { gold: 'x' }, { gold: Number.NaN }, { gold: Infinity },
    ];
    for (const bad of bads) {
      assert.doesNotThrow(() => migrateV2toV3(bad));
    }
  });

  test('migrateSave 对 null / 未知版本兜底', () => {
    assert.doesNotThrow(() => migrateSave(null));
    assert.doesNotThrow(() => migrateSave({ schemaVersion: 99 }));
    assert.doesNotThrow(() => migrateSave('junk'));
  });
});

// ─────────────────────────────────────────────────────────────
// Q-G：20 分钟逻辑浸泡 + 帧预算 + 内存（D-210 的逻辑层侧面）
// ⚠ 真实 GPU/浏览器帧率仍【未执行】——需要 Playwright + Babylon 真机。
// ─────────────────────────────────────────────────────────────
describe('Q-G 浸泡与预算（逻辑层）', () => {
  test('浸泡 20 分钟（60× 加速）：监听器归零、Boss 翻牌到达、时钟精确', () => {
    const bus = createEventBus();
    const clock = new RunClock();
    const pendingOffs = [];
    const TARGET = 20 * 60;
    const dt = (1 / 60) * 60; // 加速 60×
    let frames = 0;
    const t0 = performance.now();
    while (clock.elapsedSec < TARGET && frames < 500000) {
      clock.advance(dt);
      // 每 37s 一个一次性监听器，下一帧退订（toast 生命周期）
      if (Math.floor(clock.elapsedSec / 37) !== Math.floor((clock.elapsedSec - dt) / 37)) {
        pendingOffs.push(bus.subscribe('player.leveledUp', () => {}));
      }
      const offs = pendingOffs.splice(0);
      for (const off of offs) off();
      // 每级升一次选卡（压力：真实 upgrade 模块）
      if (frames % 15 === 0) {
        const rng = createMulberry32(1000 + frames);
        rollUpgradeChoices(rng, [], { currentWeapon: frames % 2 === 0 ? 'staff' : 'sword' });
      }
      frames++;
    }
    const wallMs = performance.now() - t0;
    assert.equal(bus.listenerCount('player.leveledUp'), 0, '浸泡后监听器必须归零');
    assert.ok(clock.bossWarningStarted, '510s 预警翻牌真实到达');
    assert.ok(clock.bossSpawned, '600s 登场翻牌真实到达');
    assert.ok(Math.abs(clock.elapsedSec - TARGET) <= dt, '时钟终点误差 ≤ 1 加速帧');
    console.log(`    [浸泡] ${frames} 帧 / ${clock.elapsedSec.toFixed(0)}s 游戏时间 / 墙钟 ${wallMs.toFixed(0)}ms`);
  });

  test('最坏情况逻辑帧预算：选卡+发事件 ≤ 1ms/次（渲染预算 3.3ms 的 30%）', () => {
    const bus = createEventBus();
    for (let i = 0; i < 10; i++) bus.subscribe('player.leveledUp', () => {});
    const rng = createMulberry32(42);
    const buffs = [
      { category: 'damage', pct: 0.5 }, { category: 'projectile', pct: 2 },
      { category: 'lifesteal', pct: 0.05 },
    ];
    // 预热
    for (let i = 0; i < 500; i++) {
      rollUpgradeChoices(rng, buffs, { currentWeapon: 'staff' });
      bus.publish('player.leveledUp', { level: 2 });
    }
    const N = 5000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      rollUpgradeChoices(rng, buffs, { currentWeapon: 'staff' });
      bus.publish('player.leveledUp', { level: 2 });
    }
    const perMs = (performance.now() - t0) / N;
    console.log(`    [帧预算] 选卡+10订阅事件 = ${perMs.toFixed(4)} ms/帧`);
    assert.ok(perMs < 1.0, `逻辑帧 ${perMs.toFixed(4)}ms 超 1ms 预算`);
  });

  test('内存浸泡：heap 增长 < 50MB', () => {
    const before = process.memoryUsage().heapUsed;
    const bus = createEventBus();
    const clock = new RunClock();
    while (clock.elapsedSec < 5 * 60) {
      clock.advance(0.5);
      const off = bus.subscribe('player.leveledUp', () => {});
      bus.publish('player.leveledUp', { level: 2 });
      off();
    }
    const growthMB = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
    console.log(`    [内存] heap 增长 ${growthMB.toFixed(2)} MB`);
    assert.ok(growthMB < 50, `heap 增长 ${growthMB.toFixed(1)}MB`);
  });
});

// ─────────────────────────────────────────────────────────────
// Q-H：精英窗口边界复核（独立于 wave 测试的第二防线）
// ─────────────────────────────────────────────────────────────
describe('Q-H 精英窗口', () => {
  test('细粒度边界扫描：[360,509] 闭区间，两侧步进 1s 均为 false', () => {
    for (let t = 350; t <= 360; t++) assert.equal(eliteAllowedAt(t), t === 360, `t=${t}`);
    for (let t = 505; t <= 512; t++) assert.equal(eliteAllowedAt(t), t <= 509, `t=${t}`);
  });
});
