/**
 * TASK-06 Boss 接线端到端验收（BossAgent ↔ CombatRuntime 适配层，不改任何既有测试）。
 *
 * 编译链与既有测试一致：tsc -p tsconfig.test.json → .testbuild/（CommonJS）
 * → tests/prepare.cjs 标记 CJS → node:test 加载编译产物。
 *
 * 覆盖（用户第 4 项要求）：
 *  1. 三阶段判定：满血不误判 coreFrenzy（回归）；agent.update 推进只发一次阶段事件
 *  2. 六攻击可触发：coreFrenzy 全池跑够时长，feedback.onTelegraph 收齐六种 attack id
 *  3. 预警命中 / 躲开：站在 somePointInside(shape) 掉血；站远 (50,50) 不掉血
 *  4. 胜利只结算一次：boss.defeated 事件恰好一次，重复命中不再结算
 *  5. HP 权威归 BossAgent：applyResolvedDamage 后 agent.hp 与 registry 镜像同步
 *
 * 所有数值从 enemyConfig / bossDefinition 读，零硬编码 6000 / 20 / 0.9。
 */
'use strict';

import { createRequire } from 'node:module';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);

const bridgeMod = require('../.testbuild/combat/BossCombatBridge.js');
const bossMod = require('../.testbuild/boss/index.js');
const domain = require('../.testbuild/domain/index.js');
const { CombatRuntime } = require('../.testbuild/combat/CombatRuntime.js');
const { enemyConfig } = require('../.testbuild/config/enemyConfig.js');

const { BossCombatBridge, BOSS_BRIDGE_ENTITY_ID } = bridgeMod;
const { bossPhaseAtHp } = domain;
const BOSS_DEF = domain.bossDefinition();
const DIRECT_IDS = enemyConfig.boss.attacks
  .filter((a) => a.damage > 0 && a.id !== 'corruptVines')
  .map((a) => a.id);
const FAR = { x: 50, y: 0, z: 50 };
const FRAME = 1 / 60;

function makeHarness(opts = {}) {
  const bus = domain.createEventBus();
  const combat = new CombatRuntime({ bus, seed: opts.seed ?? 42 });
  const events = { spawn: [], phase: [], defeated: [] };
  bus.subscribe('boss.spawned', (p) => events.spawn.push(p));
  bus.subscribe('boss.phase_changed', (p) => events.phase.push(p));
  bus.subscribe('boss.defeated', (p) => events.defeated.push(p));

  const telegraphs = [];
  const resolved = [];
  const minions = [];
  const feedback = {
    onTelegraph: (attack, shape, warningSec) => telegraphs.push({ attack, shape, warningSec }),
    onAttackResolved: (attack, hit) => resolved.push({ attack, hit }),
  };
  const summons = {
    normalCount: () => minions.length,
    spawnHound: (defId, at) => minions.push({ defId, at }),
    spawnMinion: (defId, at) => minions.push({ defId, at }),
  };

  const bridge = new BossCombatBridge({
    combat,
    bus,
    rng: combat.rng,
    summons,
    feedback,
    spawnPos: { x: 0, y: 0, z: -8 },
  });

  // 用公开 API 登场（syncFromClock 的 600s 翻牌由另一组测试覆盖，此处专注接线）
  bridge.agent.spawn({ x: 0, y: 0, z: -8 });
  const target = {
    entityId: BOSS_BRIDGE_ENTITY_ID,
    defId: 'riftWarden',
    tier: 'boss',
    radiusM: BOSS_DEF.radiusM,
    xpValue: BOSS_DEF.xpValue,
    hp: bridge.agent.hp,
    maxHp: bridge.agent.maxHpValue,
    position: { ...bridge.agent.position },
    alive: true,
  };
  combat.registry.add(target);
  bridge.attachTarget(target);

  return { bus, combat, bridge, target, events, telegraphs, resolved, minions };
}

/** 推进到某类攻击开始预警，返回该次 TelegraphShape（null = 超时）。 */
function runUntilTelegraph(h, acceptedIds, maxFrames = 6000) {
  for (let i = 0; i < maxFrames; i++) {
    h.bridge.step(0.1);
    const tg = h.bridge.agent.currentTelegraph;
    if (tg && acceptedIds.includes(tg.attack)) return tg;
  }
  return null;
}

/** 推进直到当前预警结算完毕，返回期间累计的对玩家伤害。 */
function runUntilResolved(h, maxFrames = 200) {
  let damage = 0;
  for (let i = 0; i < maxFrames; i++) {
    damage += h.bridge.step(FRAME);
    if (!h.bridge.agent.currentTelegraph) return damage;
  }
  return damage;
}

describe('Boss 接线端到端（TASK-06 integration）', () => {
  test('三阶段判定：满血 guardian，65% corruption，30% coreFrenzy；不误判第三阶段', () => {
    assert.equal(bossPhaseAtHp(1), 'guardian');
    assert.equal(bossPhaseAtHp(0.65), 'corruption');
    assert.equal(bossPhaseAtHp(0.30), 'coreFrenzy');

    const h = makeHarness();
    assert.equal(h.bridge.agent.state, 'active');
    assert.equal(h.bridge.agent.hp, BOSS_DEF.baseHp, '满血 HP 必须等于冻结 config 的 baseHp');
    assert.equal(h.bridge.agent.phase, 'guardian', '满血绝不能误判第三阶段');
    assert.equal(h.events.phase.length, 0);

    h.bridge.debugSetHp(BOSS_DEF.baseHp * 0.64);
    h.bridge.step(FRAME);
    assert.equal(h.bridge.agent.phase, 'corruption');
    assert.equal(h.events.phase.length, 1);
    assert.equal(h.events.phase[0].phase, 'corruption');

    h.bridge.debugSetHp(BOSS_DEF.baseHp * 0.29);
    h.bridge.step(FRAME);
    assert.equal(h.bridge.agent.phase, 'coreFrenzy');
    assert.equal(h.events.phase.length, 2);
    assert.equal(h.events.phase[1].phase, 'coreFrenzy');
  });

  test('六攻击可触发：第三阶段全池跑够时长收齐六种 attack id', () => {
    const h = makeHarness({ seed: 20261116 });
    h.bridge.debugSetHp(BOSS_DEF.baseHp * 0.2); // 进入 coreFrenzy 全池
    h.bridge.step(FRAME);
    assert.equal(h.bridge.agent.phase, 'coreFrenzy');

    // 玩家放远，避免 dotZone 把玩家打死影响判定；bridge.step 不会真正扣 combat.player.hp
    h.combat.player.runtime.transform.position.x = FAR.x;
    h.combat.player.runtime.transform.position.z = FAR.z;

    for (let i = 0; i < 4000; i++) h.bridge.step(0.1); // 400s，远超六招循环所需

    const seen = new Set(h.telegraphs.map((t) => t.attack));
    // 森林召唤 telegraphSec=0，无预警，由 onAttackResolved 观测
    const resolvedIds = new Set(h.resolved.map((r) => r.attack));
    const all = new Set([...seen, ...resolvedIds]);
    for (const a of enemyConfig.boss.attacks) {
      assert.ok(all.has(a.id), `第三阶段应能触发 ${a.id}，实际未出现`);
    }
    assert.equal(all.size, enemyConfig.boss.attacks.length);
    // 预警时长必须与冻结 config 一致（不硬编码 0.9/1.0/1.2/1.5/2.0）
    for (const t of h.telegraphs) {
      const def = enemyConfig.boss.attacks.find((a) => a.id === t.attack);
      assert.equal(t.warningSec, def.telegraphSec, `${t.attack} 预警时长必须来自 config`);
    }
  });

  test('预警命中：站在形状内结算掉血；躲开：站远不掉血', () => {
    const h = makeHarness({ seed: 7 });
    const p = h.combat.player.runtime.transform.position;
    p.x = FAR.x;
    p.z = FAR.z;

    const tg = runUntilTelegraph(h, DIRECT_IDS);
    assert.ok(tg, '应能在有限帧内观测到直接伤害攻击预警');
    assert.ok(tg.shape.kind !== 'none');

    // 站进预警形状（用 Boss 模块自己的 somePointInside，与判定同源）
    const inside = bossMod.somePointInside(tg.shape);
    p.x = inside.x;
    p.z = inside.z;
    const hitDamage = runUntilResolved(h);
    assert.ok(hitDamage > 0, `站在预警形状内必须掉血（实际 ${hitDamage}）`);
    assert.ok(h.resolved.some((r) => r.hit === true), '结算反馈应标记 hitPlayer=true');

    // 第二次攻击：站远躲开
    p.x = FAR.x;
    p.z = FAR.z;
    const tg2 = runUntilTelegraph(h, DIRECT_IDS);
    assert.ok(tg2, '应能观测到第二次直接伤害攻击');
    const dodgeDamage = runUntilResolved(h);
    assert.equal(dodgeDamage, 0, `躲开预警后不应掉血（实际 ${dodgeDamage}）`);
  });

  test('胜利只结算一次：boss.defeated 恰好一次，重复命中不重发', () => {
    const h = makeHarness();
    const hp = h.bridge.agent.hp;

    h.bridge.debugSetHp(0);
    assert.equal(h.bridge.agent.state, 'defeated');
    assert.equal(h.bridge.agent.hp, 0);
    assert.equal(h.events.defeated.length, 1, '首次击杀必须恰好发一次 boss.defeated');
    assert.equal(h.events.defeated[0].atSec, h.combat.progression.clock.elapsedSec);

    // 重复打残 / 重复命中都不再结算
    h.bridge.debugSetHp(0);
    const again = h.bridge.applyResolvedDamage(hp, 'staff');
    assert.equal(again, 0, 'defeated 后不再接受伤害');
    assert.equal(h.events.defeated.length, 1, '胜利结算绝不重复');

    // Boss 死亡同时把终局阶段推到 victory（SettlementScreen 的胜利屏入口）
    assert.equal(h.combat.progression.phase, 'victory');
  });

  test('HP 权威归 BossAgent：applyResolvedDamage 后 agent 与镜像同步', () => {
    const h = makeHarness();
    const before = h.bridge.agent.hp;
    const dealt = h.bridge.applyResolvedDamage(123, 'staff');
    assert.ok(dealt > 0);
    assert.equal(h.bridge.agent.hp, before - dealt);
    assert.equal(h.target.hp, h.bridge.agent.hp, 'registry 镜像必须只读 agent 权威 HP');
    assert.equal(h.target.maxHp, h.bridge.agent.maxHpValue);
    assert.equal(h.bridge.agent.lastHitInfo.weapon, 'staff');
  });

  test('召唤上限：SummonDirector 经适配层受 summonCap / normalCap 双重约束', () => {
    const h = makeHarness({ seed: 99 });
    h.bridge.debugSetHp(BOSS_DEF.baseHp * 0.5); // corruption 池含 forestSummon
    h.bridge.step(FRAME);
    h.combat.player.runtime.transform.position.x = FAR.x;
    h.combat.player.runtime.transform.position.z = FAR.z;
    for (let i = 0; i < 4000; i++) h.bridge.step(0.1);
    const cap = Math.min(BOSS_DEF.summonCap, domain.bossPeriodRule().normalCap);
    assert.ok(h.minions.length <= cap + domain.bossPeriodRule().replenish.count,
      `召唤物应受上限约束（实际 ${h.minions.length}）`);
  });
});
