/**
 * TASK-06 Boss Agent 验收测试（基于真实冻结契约，无 REBUILD、无硬编码数值）。
 *
 * 编译链与既有测试一致：tsc -p tsconfig.test.json → .testbuild/（CommonJS）
 * → tests/prepare.cjs 标记 CJS → 本文件用 node:test 加载编译产物。
 *
 * 覆盖（TASK-06 验收 + 用户统一工作流）：
 *  1. 预警 510s / 登场 600s，实测误差 ≤ 1 帧；契约事件各发一次
 *  2. 三阶段阈值 65%/30%；满血不得误判第三阶段（回归）
 *  3. 六攻击可触发、可躲避、有预警与反馈；预警与碰撞同源
 *  4. Boss 不免疫任一武器或元素
 *  5. 不产生无法躲避的攻击组合（预警总时长 < 攻击间隔）
 *  6. 破甲不得双计（单发 = 面板 × 1.5，非 ×1.5×1.5）
 *  7. Boss 击败只触发一次胜利结算（事件 + Reward 端口）
 *  8. Boss 期硬规则（不清场 / 停刷 / ≤4 / 45s 补 2 猎犬 / 精英全禁）
 *  9. 森林召唤物数量上限 summonCap
 * 10. 核心爆发后 recoveryWindowSec 输出窗口
 * 11. 所有数值来自 src/config（经 bossDefinition()/enemyConfig 只读引用）
 */
'use strict';

import { createRequire } from 'node:module';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);

const boss = require('../.testbuild/boss/index.js');
const domain = require('../.testbuild/domain/index.js');
const { enemyConfig } = require('../.testbuild/config/enemyConfig.js');
const { RUN_TIMELINE_CONST } = require('../.testbuild/config/common.js');
const { waveTimelineConfig } = require('../.testbuild/config/waveTimelineConfig.js');
const { damageConfig } = require('../.testbuild/config/damageConfig.js');

const {
  runTimeline = domain.RUN_TIMELINE,
} = {};
const RUN_TIMELINE = runTimeline;
const caps = damageConfig.caps;

// 六种攻击全部从冻结配置读取（顺序 = 设计总纲 §7.4），零硬编码。
const [rootSpike, sweepSwipe, groundSlam, corruptVines, forestSummon, coreBurst] = enemyConfig.boss.attacks;
const FRAME = 1 / 60;
const FAR = { x: 50, y: 0, z: 50 };

// ── 测试装置 ─────────────────────────────────────────────────

function layers(opts = {}) {
  return domain.rebuildDamageLayers(
    opts.a ?? { weaponUpgradePct: 0, masteryPct: 0 },
    opts.b ?? { entries: [] },
    opts.c ?? [],
    caps,
  );
}

/** D-09/R-01 锚点层：A=1.57 / B=1.288 / C=1.50 / 破甲 0.5。 */
const ANCHOR_LAYERS = layers({
  a: { weaponUpgradePct: 0.57, masteryPct: 0 },
  b: { entries: [{ gemId: 'power', basePct: 0.288, qualityMult: 1, repeatMult: 1 }] },
  c: [
    { buffId: 'card-damage', category: 'damage', pct: 0.5 },
    { buffId: 'card-armorBreak', category: 'armorBreak', pct: 0.5 },
  ],
});

function makeHarness(opts = {}) {
  let playerPos = { x: 3, y: 0, z: 0 };
  let playerAlive = true;
  let normals = opts.initialNormals ?? 0;
  let elapsedSec = 0;
  let rewardCount = 0;
  const damageLog = [];
  const hounds = [];
  const minions = [];
  const resolved = [];
  const telegraphs = [];
  const exposed = [];
  const seen = { warn: [], spawn: [], phase: [], defeated: [] };

  const bus = domain.createEventBus();
  bus.subscribe('boss.warning_started', (p) => seen.warn.push(p));
  bus.subscribe('boss.spawned', (p) => seen.spawn.push(p));
  bus.subscribe('boss.phase_changed', (p) => seen.phase.push(p));
  bus.subscribe('boss.defeated', (p) => seen.defeated.push(p));

  const rng = domain.createMulberry32(opts.seed ?? 20261115);
  const ports = {
    clockElapsedSec: () => elapsedSec,
    player: {
      playerPos: () => playerPos,
      playerAlive: () => playerAlive,
      damagePlayer: (amount, attack) => damageLog.push({ amount, attack }),
    },
    summons: {
      normalCount: () => normals,
      spawnHound: (defId, at) => {
        hounds.push({ defId, at });
        normals++;
      },
      spawnMinion: (defId, at) => {
        minions.push({ defId, at });
        normals++;
      },
    },
    rewards: {
      grantBossVictory: () => {
        rewardCount++;
      },
    },
    bus,
    rng,
    feedback: {
      onTelegraph: (attack, shape, warningSec) => telegraphs.push({ attack, shape, warningSec }),
      onAttackResolved: (attack, hitPlayer) => resolved.push({ attack, hitPlayer }),
      onCoreExposed: (seconds) => exposed.push(seconds),
    },
  };
  const agent = new boss.BossAgent(ports);

  return {
    agent,
    bus,
    damageLog,
    hounds,
    minions,
    resolved,
    telegraphs,
    exposed,
    seen,
    get playerPos() {
      return playerPos;
    },
    setPlayerPos(v) {
      playerPos = v;
    },
    get playerAlive() {
      return playerAlive;
    },
    setPlayerAlive(v) {
      playerAlive = v;
    },
    get normals() {
      return normals;
    },
    get rewardCount() {
      return rewardCount;
    },
    get elapsedSec() {
      return elapsedSec;
    },
    setElapsedSec(v) {
      elapsedSec = v;
    },
  };
}

function hit(h, damage, opts = {}) {
  return h.agent.receiveHit({
    source: opts.source ?? 'staff',
    weapon: opts.weapon ?? 'staff',
    element: opts.element ?? null,
    baseDamage: damage,
    layers: opts.layers ?? layers(),
    hitPos: opts.hitPos ?? { x: 0, y: 0, z: 0 },
  });
}

function step(h, seconds) {
  const frames = Math.round(seconds / FRAME);
  for (let i = 0; i < frames; i++) h.agent.update(FRAME);
}

/** 把 Boss 打到目标血量比例（面板伤害 = 扣血量，无破甲层）。 */
function setHpFrac(h, frac) {
  const target = h.agent.maxHpValue * frac;
  hit(h, h.agent.hp - target);
  h.agent.update(FRAME); // 阶段在 update 中推进
}

function driveUntilTelegraph(h, attackId, timeoutSec = 300) {
  let waited = 0;
  while (waited < timeoutSec) {
    h.agent.update(FRAME);
    waited += FRAME;
    const t = h.agent.currentTelegraph;
    if (t && t.attack === attackId) return t;
  }
  throw new Error(`driveUntilTelegraph: ${attackId} 未在 ${timeoutSec}s 内出现`);
}

function driveUntilResolved(h, attackId, timeoutSec = 300) {
  const before = h.resolved.filter((r) => r.attack === attackId).length;
  let waited = 0;
  while (waited < timeoutSec) {
    h.agent.update(FRAME);
    waited += FRAME;
    if (h.resolved.filter((r) => r.attack === attackId).length > before) return;
  }
  throw new Error(`driveUntilResolved: ${attackId} 未在 ${timeoutSec}s 内结算`);
}

function driveThroughTelegraph(h, extraSec = 0.5) {
  const t = h.agent.currentTelegraph;
  assert.ok(t, 'driveThroughTelegraph: 当前无预警');
  step(h, t.totalSec + extraSec);
}

// ── 1. 冻结契约数值单一来源 ──────────────────────────────────

describe('契约数值：全部只读引用 src/config（禁止 REBUILD / 硬编码）', () => {
  test('Boss HP / 六攻击 / summonCap / 阶段阈值 与 enemyConfig 逐项一致', () => {
    const def = domain.bossDefinition();
    assert.equal(def.baseHp, enemyConfig.boss.baseHp);
    assert.equal(def.baseHp, 6000, '规划书 §2.2 校验锚点');
    assert.equal(def.summonCap, enemyConfig.boss.summonCap);
    assert.equal(def.attacks.length, 6);
    for (let i = 0; i < def.attacks.length; i++) {
      const a = def.attacks[i];
      const cfg = enemyConfig.boss.attacks[i];
      assert.equal(a.id, cfg.id);
      assert.equal(a.telegraphSec, cfg.telegraphSec);
      assert.equal(a.damage, cfg.damage);
      assert.equal(a.recoveryWindowSec, cfg.recoveryWindowSec);
      assert.equal(a.summonCount ?? 0, cfg.summonCount ?? 0);
    }
    assert.deepEqual(
      def.phases.map((p) => [p.phase, p.hpFromPct, p.hpToPct]),
      enemyConfig.boss.phases.map((p) => [p.phase, p.hpFromPct, p.hpToPct]),
    );
  });

  test('时间轴常量 510/600 与三点音效从 config 读取', () => {
    assert.equal(RUN_TIMELINE.bossWarnSec, 510);
    assert.equal(RUN_TIMELINE.bossSpawnSec, 600);
    assert.equal(RUN_TIMELINE.bossWarnSec, RUN_TIMELINE_CONST.bossWarnSec);
    assert.deepEqual([...RUN_TIMELINE.bossWarnCheckpointsSec], [510, 540, 570]);
  });

  test('阶段攻击池按设计总纲 §7.3 从 config 切片（3 / 5 / 6 招）', () => {
    const def = domain.bossDefinition();
    const all = enemyConfig.boss.attacks.map((a) => a.id);
    assert.deepEqual(
      boss.phaseAttackPool('guardian', def).map((a) => a.id),
      all.slice(0, 3),
    );
    assert.deepEqual(
      boss.phaseAttackPool('corruption', def).map((a) => a.id),
      all.slice(0, 5),
    );
    assert.deepEqual(
      boss.phaseAttackPool('coreFrenzy', def).map((a) => a.id),
      all.slice(0, all.length),
    );
  });

  test('六攻击行为分派穷尽（契约新增第七招会编译期拦截）', () => {
    assert.equal(boss.attackKind(rootSpike.id), 'direct');
    assert.equal(boss.attackKind(sweepSwipe.id), 'direct');
    assert.equal(boss.attackKind(groundSlam.id), 'direct');
    assert.equal(boss.attackKind(coreBurst.id), 'direct');
    assert.equal(boss.attackKind(corruptVines.id), 'dotZone');
    assert.equal(boss.attackKind(forestSummon.id), 'summon');
    assert.equal(boss.vineZoneDurationSec(), enemyConfig.boss.corruptVinesDurationSec);
    assert.equal(boss.summonCountOf(domain.bossDefinition().attacks.find((a) => a.id === forestSummon.id)), forestSummon.summonCount);
  });
});

// ── 2. 时间轴（510/600，误差 ≤ 1 帧，契约事件）────────────────

describe('时间轴：510s 预警 / 600s 登场，实测误差 ≤ 1 帧', () => {
  test('RunClock 边沿翻牌 + syncFromClock 幂等 + 契约事件各一次', () => {
    const h = makeHarness();
    const clock = new domain.RunClock();
    const spawnPos = { x: 0, y: 0, z: 0 };
    let elapsed = 0;
    for (let i = 0; i < Math.ceil(610 / FRAME); i++) {
      clock.advance(FRAME);
      elapsed += FRAME;
      h.setElapsedSec(elapsed);
      boss.BossAgent.syncFromClock(clock, h.agent, spawnPos);
    }
    assert.equal(clock.bossWarningStarted, true);
    assert.equal(clock.bossSpawned, true);
    assert.equal(h.seen.warn.length, 1, 'boss.warning_started 恰好一次');
    assert.equal(h.seen.spawn.length, 1, 'boss.spawned 恰好一次');
    assert.equal(h.agent.state, 'active');

    const warnErr = h.seen.warn[0].atSec - RUN_TIMELINE.bossWarnSec;
    const spawnErr = h.seen.spawn[0].atSec - RUN_TIMELINE.bossSpawnSec;
    assert.ok(warnErr >= 0 && warnErr <= FRAME + 1e-9, `预警误差 ${warnErr}s 超 1 帧`);
    assert.ok(spawnErr >= 0 && spawnErr <= FRAME + 1e-9, `登场误差 ${spawnErr}s 超 1 帧`);

    // 幂等：重复 sync 不再发事件、不再登场。
    boss.BossAgent.syncFromClock(clock, h.agent, spawnPos);
    boss.BossAgent.syncFromClock(clock, h.agent, spawnPos);
    assert.equal(h.seen.warn.length, 1);
    assert.equal(h.seen.spawn.length, 1);
  });

  test('600s 之前不登场；预警事件先于登场事件', () => {
    const h = makeHarness();
    const clock = new domain.RunClock();
    let elapsed = 0;
    for (let i = 0; i < Math.ceil(599 / FRAME); i++) {
      clock.advance(FRAME);
      elapsed += FRAME;
      h.setElapsedSec(elapsed);
      boss.BossAgent.syncFromClock(clock, h.agent, { x: 0, y: 0, z: 0 });
    }
    assert.equal(h.agent.state, 'dormant', '600s 前不登场');
    assert.equal(h.seen.warn.length, 1, '510s 预警已发');
    assert.equal(h.seen.spawn.length, 0);
  });

  test('freeze 冻结 + 非法 dt 忽略（真实 RunClock 契约）', () => {
    const clock = new domain.RunClock();
    clock.advance(100);
    clock.freeze();
    clock.advance(500);
    assert.equal(clock.elapsedSec, 100);
    clock.resume();
    clock.advance(Number.NaN);
    clock.advance(-5);
    assert.equal(clock.elapsedSec, 100);
    clock.reset();
    assert.equal(clock.bossSpawned, false);
  });
});

// ── 3. 三阶段阈值（含满血回归）───────────────────────────────

describe('三阶段：65% / 30% 阈值 + 满血回归', () => {
  test('bossPhaseAtHp 满血 = guardian（历史 bug 回归）', () => {
    assert.equal(domain.bossPhaseAtHp(1), 'guardian');
    assert.notEqual(domain.bossPhaseAtHp(1), 'coreFrenzy');
  });

  test('边界归下段：0.65 → corruption、0.30 → coreFrenzy', () => {
    assert.equal(domain.bossPhaseAtHp(0.66), 'guardian');
    assert.equal(domain.bossPhaseAtHp(0.65), 'corruption');
    assert.equal(domain.bossPhaseAtHp(0.31), 'corruption');
    assert.equal(domain.bossPhaseAtHp(0.3), 'coreFrenzy');
    assert.equal(domain.bossPhaseAtHp(0), 'coreFrenzy');
  });

  test('101 点扫描单调不回退', () => {
    const order = ['guardian', 'corruption', 'coreFrenzy'];
    let last = -1;
    for (let i = 100; i >= 0; i--) {
      const idx = order.indexOf(domain.bossPhaseAtHp(i / 100));
      assert.ok(idx >= last, `血量 ${i}% 阶段回退`);
      last = Math.max(last, idx);
    }
  });

  test('Agent 阶段推进：只进不退 + boss.phase_changed 事件顺序', () => {
    const h = makeHarness();
    h.agent.spawn({ x: 0, y: 0, z: 0 });
    assert.equal(h.agent.hp, 6000);
    assert.equal(h.agent.phase, 'guardian');

    setHpFrac(h, 0.6498);
    assert.equal(h.agent.phase, 'corruption');
    setHpFrac(h, 0.2998);
    assert.equal(h.agent.phase, 'coreFrenzy');
    assert.equal(h.seen.phase.length, 2);
    assert.equal(h.seen.phase[0].phase, 'corruption');
    assert.equal(h.seen.phase[1].phase, 'coreFrenzy');
  });
});

// ── 4. 六攻击：可触发 / 可躲避 / 预警 / 反馈 ──────────────────

const HIT_CASES = [
  { atk: rootSpike, frac: 1 },
  { atk: sweepSwipe, frac: 1 },
  { atk: groundSlam, frac: 1 },
  { atk: corruptVines, frac: 0.5 },
  { atk: coreBurst, frac: 0.2 },
];

for (const c of HIT_CASES) {
  const id = c.atk.id;

  test(`六攻击[${id}]：可触发 + 预警时长 = config.telegraphSec + 形状锁定`, () => {
    const h = makeHarness({ seed: 7 + id.length });
    h.agent.spawn({ x: 0, y: 0, z: 0 });
    setHpFrac(h, c.frac);
    const t = driveUntilTelegraph(h, id);
    assert.equal(t.totalSec, c.atk.telegraphSec);
    assert.equal(t.def.damage, c.atk.damage);
    assert.notEqual(t.shape.kind, 'none');
    const shapeRef = t.shape;
    h.agent.update(FRAME);
    assert.equal(h.agent.currentTelegraph.shape, shapeRef, '预警形状必须锁定（画什么判什么）');
    assert.ok(h.telegraphs.some((e) => e.attack === id && e.warningSec === c.atk.telegraphSec));
  });

  test(`六攻击[${id}]：预警期跑出形状 → 零伤害（可躲避）`, () => {
    const h = makeHarness({ seed: 11 + id.length });
    h.agent.spawn({ x: 0, y: 0, z: 0 });
    setHpFrac(h, c.frac);
    driveUntilTelegraph(h, id);
    const before = h.damageLog.filter((d) => d.attack === id).length;
    h.setPlayerPos(FAR);
    driveThroughTelegraph(h);
    assert.equal(
      h.damageLog.filter((d) => d.attack === id).length,
      before,
      `${id} 躲避失败：形状外仍被命中`,
    );
  });
}

for (const c of HIT_CASES.filter((x) => boss.attackKind(x.atk.id) === 'direct')) {
  const id = c.atk.id;
  test(`六攻击[${id}]：站形状内 → 按 config.damage 结算一次`, () => {
    const h = makeHarness({ seed: 23 + id.length });
    h.agent.spawn({ x: 0, y: 0, z: 0 });
    setHpFrac(h, c.frac);
    const t = driveUntilTelegraph(h, id);
    h.setPlayerPos(boss.somePointInside(t.shape));
    const before = h.damageLog.length;
    driveThroughTelegraph(h);
    const dealt = h.damageLog.slice(before).filter((d) => d.attack === id);
    assert.equal(dealt.length, 1, `${id} 应恰好结算一次`);
    assert.equal(dealt[0].amount, c.atk.damage);
    assert.ok(h.resolved.some((r) => r.attack === id && r.hitPlayer === true));
  });
}

test('六攻击[corruptVines]：持续区每秒 config.damage、持续 config 时长、跑出即停', () => {
  const h = makeHarness({ seed: 71 });
  h.agent.spawn({ x: 0, y: 0, z: 0 });
  setHpFrac(h, 0.5);
  const t = driveUntilTelegraph(h, corruptVines.id);
  h.setPlayerPos(boss.somePointInside(t.shape));
  driveThroughTelegraph(h);
  assert.equal(h.agent.activeZones.length, 1);
  const zone = h.agent.activeZones[0];
  assert.equal(zone.damagePerSec, corruptVines.damage);
  assert.ok(Math.abs(zone.remainingSec - enemyConfig.boss.corruptVinesDurationSec) < 0.6);

  const sumVine = () => h.damageLog.filter((d) => d.attack === corruptVines.id).reduce((s, d) => s + d.amount, 0);
  const before = sumVine();
  step(h, 1.0);
  const mid = sumVine();
  assert.ok(Math.abs(mid - before - corruptVines.damage) < 0.15, `藤蔓 DoT ≈ ${corruptVines.damage}/s，实测 ${mid - before}`);
  h.setPlayerPos(FAR);
  step(h, 1.0);
  assert.ok(Math.abs(sumVine() - mid) < 1e-9, '跑出藤蔓区后 DoT 停止');
});

test('六攻击[forestSummon]：无预警、无伤害、召唤数受上限', () => {
  const h = makeHarness({ seed: 31 });
  h.agent.spawn({ x: 0, y: 0, z: 0 });
  setHpFrac(h, 0.5);
  const minionsBefore = h.minions.length;
  driveUntilResolved(h, forestSummon.id);
  assert.equal(forestSummon.telegraphSec, 0, '契约：森林召唤无预警');
  assert.equal(forestSummon.damage, 0, '契约：森林召唤无伤害');
  assert.ok(h.minions.length > minionsBefore, '森林召唤应生成召唤物');
  assert.equal(h.damageLog.filter((d) => d.attack === forestSummon.id).length, 0);
  assert.equal(h.telegraphs.filter((e) => e.attack === forestSummon.id).length, 0, '无预警不得画贴花');
});

test('六攻击[groundSlam]：环形内圈贴身可躲避（形状与判定同源）', () => {
  const h = makeHarness({ seed: 99 });
  h.agent.spawn({ x: 0, y: 0, z: 0 });
  setHpFrac(h, 1);
  driveUntilTelegraph(h, groundSlam.id);
  h.setPlayerPos({ x: 0.2, y: 0, z: 0 });
  const before = h.damageLog.filter((d) => d.attack === groundSlam.id).length;
  driveThroughTelegraph(h);
  assert.equal(h.damageLog.filter((d) => d.attack === groundSlam.id).length, before, '内圈内不受地面震荡');
});

// ── 5. 预警几何与碰撞同源 ────────────────────────────────────

test('预警形状与碰撞判定同源：pointInTelegraph 是唯一入口', () => {
  const at0 = { x: 0, y: 0, z: 0 };
  const circle = { kind: 'circle', center: at0, radiusM: 2 };
  assert.ok(boss.pointInTelegraph(circle, { x: 1, y: 0, z: 1 }));
  assert.ok(boss.pointInTelegraph(circle, { x: 2, y: 0, z: 0 }));
  assert.ok(!boss.pointInTelegraph(circle, { x: 2.01, y: 0, z: 0 }));
  const sector = { kind: 'sector', origin: at0, facingRad: 0, radiusM: 4, halfAngleRad: Math.PI / 3 };
  assert.ok(boss.pointInTelegraph(sector, { x: 3, y: 0, z: 0.5 }));
  assert.ok(!boss.pointInTelegraph(sector, { x: 0, y: 0, z: 3.9 }));
  const ring = { kind: 'ring', center: at0, innerRadiusM: 2, outerRadiusM: 4 };
  assert.ok(boss.pointInTelegraph(ring, { x: 3, y: 0, z: 0 }));
  assert.ok(!boss.pointInTelegraph(ring, { x: 1, y: 0, z: 0 }));
  assert.ok(!boss.pointInTelegraph(ring, { x: 4.5, y: 0, z: 0 }));
  const rect = { kind: 'rect', origin: at0, facingRad: 0, lengthM: 5, widthM: 2 };
  assert.ok(boss.pointInTelegraph(rect, { x: 4, y: 0, z: 0.5 }));
  assert.ok(!boss.pointInTelegraph(rect, { x: 5.5, y: 0, z: 0 }));
  assert.ok(!boss.pointInTelegraph(rect, { x: 2, y: 0, z: 1.5 }));
  const multi = {
    kind: 'multiSpot',
    spots: [
      { center: { x: 1, y: 0, z: 1 }, radiusM: 0.5 },
      { center: { x: -2, y: 0, z: 0 }, radiusM: 0.5 },
    ],
  };
  assert.ok(boss.pointInTelegraph(multi, { x: 1, y: 0, z: 1 }));
  assert.ok(!boss.pointInTelegraph(multi, at0));
  assert.ok(!boss.pointInTelegraph({ kind: 'none' }, at0));
});

// ── 6. 不免疫任一武器 / 元素 ──────────────────────────────────

test('Boss 不免疫任一武器或元素（2 武器 × 4 元素 + null，伤害均 > 0）', () => {
  const weapons = ['staff', 'sword'];
  const elements = ['fire', 'ice', 'lightning', 'shadow', null];
  const h = makeHarness();
  h.agent.spawn({ x: 0, y: 0, z: 0 });
  let hp = h.agent.hp;
  for (const w of weapons) {
    for (const e of elements) {
      const dealt = hit(h, 10, { weapon: w, element: e, source: w });
      assert.ok(dealt > 0, `weapon=${w} element=${e} 被免疫`);
      assert.ok(h.agent.hp < hp);
      hp = h.agent.hp;
      assert.equal(h.agent.lastHitInfo.weapon, w);
      assert.equal(h.agent.lastHitInfo.element, e);
    }
  }
});

// ── 7. 无不可躲避组合（预警 < 攻击间隔）───────────────────────

test('三阶段预警总时长 < 攻击间隔（冻结契约派生的硬约束）', () => {
  const report = boss.dodgeabilityReport(domain.bossDefinition());
  assert.equal(report.length, 3);
  for (const row of report) {
    assert.ok(row.dodgeable, `${row.phase}: 预警 ${row.maxTelegraphSec}s ≥ 间隔 ${row.intervalSec}s`);
    assert.ok(row.maxTelegraphSec < row.intervalSec);
  }
  // 第三阶段攻击节奏提高（间隔更短），但不靠堆伤害。
  const guardian = report.find((r) => r.phase === 'guardian');
  const frenzy = report.find((r) => r.phase === 'coreFrenzy');
  assert.ok(frenzy.intervalSec < guardian.intervalSec, '第三阶段应提高攻击压力（缩短间隔）');
});

test('单攻击槽：预警窗口严格闭合后才开下一个（核心暴走长模拟）', () => {
  const h = makeHarness({ seed: 4242 });
  h.agent.spawn({ x: 0, y: 0, z: 0 });
  setHpFrac(h, 0.2);
  h.setPlayerPos(FAR);
  let inTelegraph = false;
  let transitions = 0;
  for (let f = 0; f < Math.ceil(120 / FRAME); f++) {
    h.agent.update(FRAME);
    const has = h.agent.currentTelegraph !== null;
    if (has !== inTelegraph) {
      transitions++;
      inTelegraph = has;
    }
  }
  assert.equal(transitions % 2, 0, '预警窗口必须完整闭合后才开下一个');
  assert.ok(transitions >= 2, '核心暴走阶段应持续施压');
});

// ── 8. 破甲不得双计 ──────────────────────────────────────────

describe('破甲：单发 = 面板 × 1.5（非 ×1.5×1.5）', () => {
  test('锚点：面板 24.26592 → 结算 36.39888（真实 resolveDamageHit）', () => {
    const panel = domain.computeShotDamage(8, ANCHOR_LAYERS);
    assert.ok(Math.abs(panel - 24.26592) < 1e-6, `面板 ${panel}`);
    const res = domain.resolveDamageHit({
      source: 'staff',
      baseDamage: panel,
      targetId: 0,
      hitPos: { x: 0, y: 0, z: 0 },
      targetHp: enemyConfig.boss.baseHp,
      targetTier: 'boss',
      armorBreakBonus: ANCHOR_LAYERS.armorBreakBonus,
    });
    assert.ok(Math.abs(res.dealt - 36.39888) < 1e-6, `结算 ${res.dealt}`);
    assert.ok(Math.abs(res.dealt - panel * 2.25) > 1, '不得出现 ×2.25 双计');
  });

  test('armorBreak 不入 C 区（R-01 红线）', () => {
    assert.ok(!domain.C_ZONE_DERIVED_CATEGORIES.includes('armorBreak'));
    const noBreak = layers({
      a: { weaponUpgradePct: 0.57, masteryPct: 0 },
      b: { entries: [{ gemId: 'power', basePct: 0.288, qualityMult: 1, repeatMult: 1 }] },
      c: [{ buffId: 'card-damage', category: 'damage', pct: 0.5 }],
    });
    assert.equal(ANCHOR_LAYERS.C, noBreak.C, '加入 armorBreak 不得改变 C 区');
    assert.equal(ANCHOR_LAYERS.armorBreakBonus, caps.armorBreakPct);
    // normal 档位不吃破甲。
    const normal = domain.resolveDamageHit({
      source: 'staff',
      baseDamage: 10,
      targetId: 0,
      hitPos: { x: 0, y: 0, z: 0 },
      targetHp: 100,
      targetTier: 'normal',
      armorBreakBonus: 0.5,
    });
    assert.equal(normal.dealt, 10);
  });

  test('Agent 受击路径与 resolveDamageHit 完全一致（结构性单点结算）', () => {
    const panel = domain.computeShotDamage(8, ANCHOR_LAYERS);
    const expected = domain.resolveDamageHit({
      source: 'staff',
      baseDamage: panel,
      targetId: 0,
      hitPos: { x: 0, y: 0, z: 0 },
      targetHp: enemyConfig.boss.baseHp,
      targetTier: 'boss',
      armorBreakBonus: ANCHOR_LAYERS.armorBreakBonus,
    }).dealt;
    const h = makeHarness();
    h.agent.spawn({ x: 0, y: 0, z: 0 });
    const before = h.agent.hp;
    const dealt = hit(h, panel, { layers: ANCHOR_LAYERS });
    assert.ok(Math.abs(dealt - expected) < 1e-9);
    assert.ok(Math.abs(before - h.agent.hp - dealt) < 1e-9);
  });
});

// ── 9. 胜利结算只一次 ────────────────────────────────────────

describe('击败只触发一次胜利结算', () => {
  test('事件 + Reward 端口各一次；超杀帧不再结算', () => {
    const h = makeHarness();
    h.agent.spawn({ x: 0, y: 0, z: 0 });
    hit(h, 5999);
    assert.equal(h.agent.state, 'active');
    assert.equal(h.rewardCount, 0);
    hit(h, 1);
    assert.equal(h.agent.state, 'defeated');
    assert.equal(h.rewardCount, 1);
    assert.equal(h.seen.defeated.length, 1);
    assert.equal(hit(h, 50), 0, '死亡后受击返回 0');
    assert.equal(h.agent.hp, 0);
    assert.equal(h.rewardCount, 1);
    assert.equal(h.seen.defeated.length, 1);
    step(h, 10);
    assert.equal(h.rewardCount, 1);
    assert.equal(h.damageLog.length, 0, '死后不再造成任何伤害');
  });

  test('同帧双致命也只结算一次', () => {
    const h = makeHarness();
    h.agent.spawn({ x: 0, y: 0, z: 0 });
    hit(h, enemyConfig.boss.baseHp);
    hit(h, enemyConfig.boss.baseHp);
    assert.equal(h.rewardCount, 1);
    assert.equal(h.seen.defeated.length, 1);
  });

  test('登场前（dormant）受击无效', () => {
    const h = makeHarness();
    assert.equal(hit(h, 50), 0);
    assert.equal(h.agent.state, 'dormant');
    assert.equal(h.rewardCount, 0);
  });
});

// ── 10. Boss 期硬规则 ────────────────────────────────────────

describe('Boss 期硬规则（冻结契约 bossPeriodRule）', () => {
  test('契约值：不清场 / 停刷 / ≤4 / 45s×2 猎犬 / 精英全禁', () => {
    const rule = domain.bossPeriodRule();
    assert.equal(rule.clearOnSpawn, false);
    assert.equal(rule.normalCap, 4);
    assert.equal(rule.replenish.everySec, 45);
    assert.equal(rule.replenish.count, 2);
    assert.equal(rule.replenish.enemyId, 'riftHound');
    assert.equal(rule.eliteBanned, true);
    assert.equal(rule.normalCap, waveTimelineConfig.bossPeriodRule.normalCap);

    const policy = makeHarness().agent.spawnPolicy();
    assert.equal(policy.regularSpawnsEnabled, false);
    assert.equal(policy.eliteAllowed, false);
    assert.equal(policy.maxNormals, rule.normalCap);
    assert.equal(policy.clearOnSpawn, rule.clearOnSpawn);
  });

  test('不清场：登场不触碰场上已有的怪', () => {
    const h = makeHarness({ initialNormals: 3 });
    h.agent.spawn({ x: 0, y: 0, z: 0 });
    assert.equal(h.normals, 3);
    assert.equal(h.hounds.length, 0, '登场本身不刷怪');
  });

  test('45s 猎犬补充：每 45s 补 2，同屏 4 封顶', () => {
    const h = makeHarness();
    h.agent.spawn({ x: 0, y: 0, z: 0 });
    h.setPlayerPos(FAR);
    step(h, 45.5);
    assert.equal(h.hounds.length, 2, '首个 45s 窗口补 2 只');
    assert.ok(h.hounds.every((x) => x.defId === domain.bossPeriodRule().replenish.enemyId));
    step(h, 45);
    assert.equal(h.hounds.length, 4, '第二个窗口再补 2（到 4 上限）');
    step(h, 45);
    assert.equal(h.hounds.length, 4, '满员后补充落空');
    assert.equal(h.agent.houndRefillDeferredLast, true);
  });
});

// ── 11. 召唤上限 summonCap ───────────────────────────────────

test('森林召唤上限：normalCount=2 时 summon(3) 只生成 1（有效上限 = min(summonCap, normalCap)）', () => {
  let normals = 2;
  const spawned = [];
  const summons = {
    normalCount: () => normals,
    spawnHound: () => {
      normals++;
    },
    spawnMinion: (defId, at) => {
      spawned.push({ defId, at });
      normals++;
    },
  };
  const director = new boss.SummonDirector({
    summons,
    rng: domain.createMulberry32(1),
    summonCap: enemyConfig.boss.summonCap,
  });
  assert.equal(director.effectiveCap(), Math.min(enemyConfig.boss.summonCap, domain.bossPeriodRule().normalCap));
  assert.equal(director.trySummonMinions(forestSummon.summonCount, { x: 0, y: 0, z: 0 }), 1);
  assert.equal(spawned.length, 1);
  assert.ok(domain.NORMAL_ENEMY_IDS.includes(spawned[0].defId), '召唤物 ID 必须来自冻结契约普通怪集合');
  assert.equal(director.trySummonMinions(forestSummon.summonCount, { x: 0, y: 0, z: 0 }), 0, '满员拒绝');
});

test('两条上限互相独立：summonCap 只卡森林召唤，normalCap 只卡猎犬补充', () => {
  const rule = domain.bossPeriodRule();
  assert.ok(rule.normalCap > enemyConfig.boss.summonCap, '契约前提：normalCap 必须大于 summonCap 才能区分两条规则');

  let normals = enemyConfig.boss.summonCap; // 场上已有 3 只（森林召唤已满）
  const hounds = [];
  const minions = [];
  const summons = {
    normalCount: () => normals,
    spawnHound: (defId, at) => {
      hounds.push({ defId, at });
      normals++;
    },
    spawnMinion: (defId, at) => {
      minions.push({ defId, at });
      normals++;
    },
  };
  const director = new boss.SummonDirector({
    summons,
    rng: domain.createMulberry32(7),
    summonCap: enemyConfig.boss.summonCap,
  });

  assert.equal(director.effectiveCap(), Math.min(enemyConfig.boss.summonCap, rule.normalCap));
  assert.equal(director.houndCap(), rule.normalCap, '猎犬上限 = normalCap，与 summonCap 无关');
  assert.equal(director.trySummonMinions(forestSummon.summonCount, { x: 0, y: 0, z: 0 }), 0, '召唤物已满，拒绝生成');
  director.refillHounds({ x: 0, y: 0, z: 0 });
  assert.equal(hounds.length, rule.normalCap - enemyConfig.boss.summonCap, '猎犬仍可补到 normalCap，不受 summonCap 卡住');
  assert.ok(hounds.every((x) => x.defId === rule.replenish.enemyId));
  assert.equal(minions.length, 0);
  assert.equal(normals, rule.normalCap);
  director.refillHounds({ x: 0, y: 0, z: 0 });
  assert.equal(hounds.length, rule.normalCap - enemyConfig.boss.summonCap, '满员后猎犬补充落空');
  assert.equal(director.lastRefillDeferred, true);
});

test('长模拟：普通怪峰值 ≤ normalCap，且森林召唤在 summonCap 内发生', () => {
  const h = makeHarness({ seed: 777 });
  h.agent.spawn({ x: 0, y: 0, z: 0 });
  setHpFrac(h, 0.5); // corruption 池含 forestSummon
  h.setPlayerPos(FAR);
  let peak = 0;
  for (let f = 0; f < Math.ceil(200 / FRAME); f++) {
    h.agent.update(FRAME);
    peak = Math.max(peak, h.normals);
  }
  const rule = domain.bossPeriodRule();
  assert.ok(peak <= rule.normalCap, `普通怪峰值 ${peak} 超同屏上限 ${rule.normalCap}`);
  assert.ok(h.minions.length > 0, '模拟中确实发生过森林召唤');
  assert.ok(h.minions.length <= enemyConfig.boss.summonCap * forestSummon.summonCount, '累计召唤量未失控');
});

// ── 12. 核心暴露输出窗口 ─────────────────────────────────────

test('核心爆发 → 暴露 recoveryWindowSec(2s)：窗口内停手、窗口后恢复', () => {
  const h = makeHarness({ seed: 555 });
  h.agent.spawn({ x: 0, y: 0, z: 0 });
  setHpFrac(h, 0.2);
  driveUntilTelegraph(h, coreBurst.id);
  h.setPlayerPos(FAR); // 躲直伤，专注窗口观察
  let guard = 0;
  while (!h.agent.isCoreExposed && guard++ < 600) h.agent.update(FRAME);
  assert.equal(h.agent.isCoreExposed, true);
  assert.ok(Math.abs(h.agent.coreExposeRemainingSec - coreBurst.recoveryWindowSec) < 0.1);
  assert.equal(h.exposed.length, 1);
  assert.equal(h.exposed[0], coreBurst.recoveryWindowSec);

  let sawTelegraph = false;
  for (let f = 0; f < Math.ceil((coreBurst.recoveryWindowSec - 0.1) / FRAME); f++) {
    h.agent.update(FRAME);
    if (h.agent.currentTelegraph !== null) sawTelegraph = true;
  }
  assert.equal(sawTelegraph, false, '核心暴露期 Boss 停手（输出窗口）');
  step(h, 0.2);
  assert.equal(h.agent.isCoreExposed, false, '窗口时间到后关闭');

  let resumed = false;
  for (let f = 0; f < Math.ceil(8 / FRAME); f++) {
    h.agent.update(FRAME);
    if (h.agent.currentTelegraph !== null) resumed = true;
  }
  assert.ok(resumed, '窗口结束后恢复攻击循环');
});

// ── 13. 玩家死亡语义 ────────────────────────────────────────

test('玩家死亡后攻击照常结算但不再对尸体造成伤害', () => {
  const h = makeHarness({ seed: 31337 });
  h.agent.spawn({ x: 0, y: 0, z: 0 });
  h.setPlayerAlive(false);
  h.setPlayerPos({ x: 0, y: 0, z: 0 });
  step(h, 30);
  assert.equal(h.damageLog.length, 0);
  assert.equal(h.agent.state, 'active', '玩家死亡不等于 Boss 被击败');
});
