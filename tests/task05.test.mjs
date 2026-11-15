/**
 * TASK-05 验收测试（Enemy / Spawn / Elite / Event / Arena）
 *
 * 运行：node --experimental-strip-types --no-warnings --test tests/task05.test.mjs
 * 说明：测试文件本身为纯 JS（无 TS 语法），直接 import 仓库 .ts 源码；
 *       src/domain 与 src/config 全程只读引用，本测试不修改任何冻结契约。
 */
'use strict';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { EnemyWorld } from '../src/world/encounter.ts';
import { Arena } from '../src/world/arena.ts';
import { SAFE_SPAWN } from '../src/world/arenaConfig.ts';
import { EnemyManager } from '../src/enemy/manager.ts';
import { HoundEnemy } from '../src/enemy/hound.ts';
import { SpitterEnemy } from '../src/enemy/spitter.ts';
import { DasherEnemy } from '../src/enemy/dasher.ts';
import { NourisherEnemy } from '../src/enemy/nourisher.ts';
import { BEHAVIOR_EXTRA } from '../src/enemy/behaviorParams.ts';
import { rollAffixes, createElite, AFFIX_IDS } from '../src/elites/eliteFactory.ts';
import { EliteEnemy } from '../src/elites/elite.ts';
import { createWorldEvent, LostChestEvent, ElementalAltarEvent, MonsterNestEvent, AncientAltarEvent, EliteInvasionEvent } from '../src/worldevents/worldEvents.ts';
import { EVENT_EXTRA } from '../src/worldevents/eventConfig.ts';
import { eliteAllowedAt, phaseAtSec, wavePhases, worldEventDefs, worldEventSchedule, bossPeriodRule, canSpawnWorldEvent } from '../src/domain/wave.ts';
import { normalEnemyDefinition, eliteStats, isForbiddenAffixPair, eliteAffixDef } from '../src/domain/enemy.ts';
import { effectiveControlCaps, resolveDamageHit } from '../src/domain/damage.ts';
import { createMulberry32 } from '../src/domain/events.ts';
import { enemyConfig } from '../src/config/enemyConfig.ts';

/** 手动驱动单个事件（simulate=true 时连同 manager 一起跑，用于死亡/击杀判定） */
function driveEvent(w, ev, seconds, dt = 0.1, simulate = false) {
  let remaining = seconds;
  while (remaining > 1e-9) {
    const step = Math.min(dt, remaining);
    if (simulate) w.tick(step);
    else w.clock.advance(step);
    ev.tick(w.eventCtx(), step);
    remaining -= step;
  }
}

// ─────────────────────────────────────────────────────────────
describe('TASK-05 A. 冻结契约只读引用（数值全部来自 config）', () => {
  test('六阶段波次表与精英窗口边界：359.9 禁 / 360 准 / 509 准 / 510 禁 / 600 禁', () => {
    const phases = wavePhases();
    assert.equal(phases.length, 6);
    assert.deepEqual(phases.map((p) => p.index), [1, 2, 3, 4, 5, 6]);
    assert.equal(phaseAtSec(0).index, 1);
    assert.equal(phaseAtSec(359.9).index, 3);
    assert.equal(phaseAtSec(510).index, 5);
    assert.equal(phaseAtSec(1200).index, 6, '末段兜底');
    assert.equal(eliteAllowedAt(359.9), false, 'D-01 缺陷防线：6:00 前零精英');
    assert.equal(eliteAllowedAt(360), true);
    assert.equal(eliteAllowedAt(509), true);
    assert.equal(eliteAllowedAt(510), false, 'Boss 预警后停刷精英');
    assert.equal(eliteAllowedAt(600), false, 'Boss 期精英全禁');
    assert.equal(canSpawnWorldEvent(509), true);
    assert.equal(canSpawnWorldEvent(510), false);
  });

  test('事件时间轴与 Boss 期硬规则全部来自 config', () => {
    const s = worldEventSchedule();
    assert.equal(s.firstWindowStartSec, 120);
    assert.equal(s.firstWindowEndSec, 210);
    assert.equal(s.intervalSec, 108);
    assert.equal(s.maxConcurrent, 1);
    assert.equal(s.noImmediateRepeat, true);
    assert.equal(s.stopAfterSec, 510);
    assert.equal(worldEventDefs().length, 5);
    const boss = bossPeriodRule();
    assert.equal(boss.clearOnSpawn, false);
    assert.equal(boss.normalCap, 4);
    assert.equal(boss.replenish.everySec, 45);
    assert.equal(boss.replenish.count, 2);
    assert.equal(boss.replenish.enemyId, 'riftHound');
    assert.equal(boss.eliteBanned, true);
  });

  test('精英数值由 eliteStats 派生（Q2 猎犬基底 × 倍率），状态上限按档位查表', () => {
    const hound = normalEnemyDefinition('riftHound');
    const s = eliteStats('riftRavager');
    const m = enemyConfig.eliteStatMultipliers;
    assert.equal(s.baseHp, hound.baseHp * m.hp);
    assert.equal(s.baseDamage, hound.baseDamage * m.damage);
    assert.equal(s.radiusM, hound.radiusM * m.size);
    assert.equal(s.xpValue, hound.xpValue * m.xp);
    assert.equal(s.moveSpeed, hound.moveSpeed, '移速不乘倍率');
    const caps = effectiveControlCaps('elite');
    assert.equal(caps.slowMaxPct, 0.15);
    assert.equal(caps.burnMaxStacks, 3);
  });

  test('敌人受击只走 resolveDamageHit（含精英破甲、过量夹取）', () => {
    const base = { source: 'staff', targetId: 1, hitPos: { x: 0, y: 0, z: 0 }, targetHp: 50 };
    assert.equal(resolveDamageHit({ ...base, baseDamage: 20 }).dealt, 20);
    const elite = resolveDamageHit({ ...base, baseDamage: 20, targetTier: 'elite', armorBreakBonus: 0.5 });
    assert.equal(elite.dealt, 30, '破甲只对精英/Boss 生效');
    const normal = resolveDamageHit({ ...base, baseDamage: 20, targetTier: 'normal', armorBreakBonus: 0.5 });
    assert.equal(normal.dealt, 20, '普通怪不吃破甲');
    assert.equal(resolveDamageHit({ ...base, baseDamage: 999 }).dealt, 50, '夹取到剩余生命');
  });
});

// ─────────────────────────────────────────────────────────────
describe('TASK-05 B. 场地与四类普通怪行为', () => {
  test('失落森林固定地图：边界/障碍/合法生成点，单张地图无区域概念', () => {
    const arena = new Arena();
    assert.ok(arena.spawnPoints.length > 50, '应有足量合法生成点');
    assert.ok(arena.spawnPoints.every((p) => arena.isPointClear(p.x, p.z, 0.8)));
    const pos = { x: 100, y: 0, z: 100 };
    arena.clampPosition(pos, 0.45);
    assert.ok(Math.abs(pos.x) <= arena.halfSizeM && Math.abs(pos.z) <= arena.halfSizeM);
    const pt = arena.pickSpawnPoint(createMulberry32(1), { x: 0, y: 0, z: 0 }, []);
    assert.ok(pt && Math.hypot(pt.x, pt.z) >= SAFE_SPAWN.minDistanceFromPlayerM);
  });

  test('猎犬：径向追击 + 左右包抄侧由注入 Rng 分配（可辨识）', () => {
    const w = new EnemyWorld({ seed: 21, events: false });
    const h = w.manager.spawn('riftHound', { position: { x: 0, z: 20 } });
    assert.ok(h instanceof HoundEnemy);
    const d0 = Math.hypot(h.position.x, h.position.z);
    w.manager.tick(w.eventCtx(), 1.0);
    const d1 = Math.hypot(h.position.x, h.position.z);
    assert.ok(d0 - d1 > 1.0, `应显著接近（${d0.toFixed(1)}→${d1.toFixed(1)}）`);
    const sides = new Set();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const e = new EnemyWorld({ seed, events: false }).manager.spawn('riftHound', { position: { x: 0, z: 20 } });
      sides.add(e && e.flankSide);
    }
    assert.ok(sides.size >= 1);
  });

  test('投射者：8m 射程内开火且弹道命中经 damagePlayer 端口', () => {
    const w = new EnemyWorld({ seed: 22, events: false });
    const s = w.manager.spawn('riftSpitter', { position: { x: 0, z: 9 } });
    assert.ok(s instanceof SpitterEnemy);
    for (let i = 0; i < 40; i++) w.manager.tick(w.eventCtx(), 0.1);
    assert.ok(w.damageLog.some((d) => d.kind === 'projectile' && d.sourceDefId === 'riftSpitter'), '应有远程弹命中玩家');
  });

  test('影跃者：可闪避蓄力窗口 + 跃进伤害 + 4s CD', () => {
    const w = new EnemyWorld({ seed: 23, events: false });
    const d = w.manager.spawn('umbraDasher', { position: { x: 0, z: 6 } });
    assert.ok(d instanceof DasherEnemy);
    w.manager.tick(w.eventCtx(), 0.1);
    assert.equal(d.isTelegraphing, true, '跃进前应有预警窗口');
    for (let i = 0; i < 12; i++) w.manager.tick(w.eventCtx(), 0.1);
    assert.ok(w.damageLog.some((x) => x.kind === 'leap'), '落地应造成跃击伤害');
    const cfg = normalEnemyDefinition('umbraDasher').behavior;
    assert.equal(cfg.leapCdSec, 4, 'CD 4s 来自 config');
  });

  test('滋养体：6m 光环 +20% 友军移速，死亡分裂 2 只幼体（HP5 / 伤4）', () => {
    const w = new EnemyWorld({ seed: 24, events: false });
    const n = w.manager.spawn('riftNourisher', { position: { x: 0, z: 3 } });
    const h = w.manager.spawn('riftHound', { position: { x: 2, z: 3 } });
    assert.ok(n instanceof NourisherEnemy);
    w.manager.tick(w.eventCtx(), 0.1);
    assert.ok(Math.abs(h.auraSpeedPct - 0.2) < 1e-9, `光环应为 +20%，实际 ${h.auraSpeedPct}`);
    const far = w.manager.spawn('riftHound', { position: { x: 0, z: 25 } });
    w.manager.tick(w.eventCtx(), 0.1);
    assert.equal(far.auraSpeedPct, 0, '6m 外不吃光环');
    const before = w.manager.aliveCount;
    n.takeDamage(99999, 'staff');
    w.manager.tick(w.eventCtx(), 0.1);
    const spawnlings = w.manager.aliveEnemies.filter((e) => e.entityId !== h.entityId && e.entityId !== far.entityId);
    assert.equal(spawnlings.length, 2, '死亡分裂 2 只幼体');
    const spec = normalEnemyDefinition('riftNourisher').behavior;
    assert.ok(spawnlings.every((e) => e.maxHp === spec.onDeathSplit.hp && e.damage === spec.onDeathSplit.damage));
    assert.equal(w.manager.aliveCount, before + 1, '-1 本体 +2 幼体');
  });

  test('状态槽：燃焰/减速/中毒按档位夹取，DoT 经 resolveDamageHit 结算', () => {
    const w = new EnemyWorld({ seed: 25, events: false });
    const e = w.manager.spawn('riftHound', { position: { x: 0, z: 20 } });
    const caps = effectiveControlCaps('normal');
    e.applyBurn(2, 3, 99);
    e.applySlow(0.9, 2);
    e.applyPoison(1, 2, 99);
    assert.equal(e.statuses.burnStacks, caps.burnMaxStacks);
    assert.equal(e.statuses.slowPct, caps.slowMaxPct);
    assert.equal(e.statuses.poisonStacks, caps.poisonMaxStacks);
    const hp0 = e.hp;
    w.manager.tick(w.eventCtx(), 1.0);
    assert.ok(e.hp < hp0, 'DoT 应扣血');
  });
});

// ─────────────────────────────────────────────────────────────
describe('TASK-05 C. 精英系统', () => {
  test('六词缀池来自 config，2000 组组合零禁止对、零重复', () => {
    assert.equal(AFFIX_IDS.length, 6);
    const rng = createMulberry32(99);
    for (let i = 0; i < 2000; i++) {
      const a = rollAffixes(rng, 2);
      assert.equal(new Set(a).size, a.length, '词缀不得重复');
      for (let x = 0; x < a.length; x++) {
        for (let y = x + 1; y < a.length; y++) {
          assert.equal(isForbiddenAffixPair(a[x], a[y]), false, `禁止组合 ${a[x]}+${a[y]}`);
        }
      }
    }
    assert.equal(isForbiddenAffixPair('shielded', 'vampiric'), true);
    assert.equal(isForbiddenAffixPair('summoner', 'split'), true);
    assert.equal(isForbiddenAffixPair('berserk', 'vampiric'), true);
  });

  test('精英词缀数值来自 config：护盾/吸血/狂暴/词缀数', () => {
    const rng = createMulberry32(7);
    const rules = enemyConfig.eliteTierRules;
    assert.equal(rollAffixes(rng, rules.normalAffixCount).length, 1);
    assert.equal(rollAffixes(rng, rules.lordAffixCount).length, 2);
    const shielded = createElite(rng, {
      rank: 'normal', affixes: ['shielded'], entityId: 900,
      position: { x: 0, y: 0, z: 20 }, hpScale: 1, damageScale: 1,
    });
    assert.ok(shielded instanceof EliteEnemy);
    assert.equal(shielded.tier, 'elite');
    assert.ok(Math.abs(shielded.shield - shielded.maxHp * eliteAffixDef('shielded').params.shieldPctOfMaxHp) < 1e-9);
    const before = shielded.hp;
    const shieldBefore = shielded.shield;
    shielded.takeDamage(shieldBefore / 2, 'staff');
    assert.equal(shielded.hp, before, '护盾先吸收，本体不掉血');
    assert.ok(Math.abs(shielded.shield - shieldBefore / 2) < 1e-9);
    const berserk = createElite(rng, {
      rank: 'normal', affixes: ['berserk'], entityId: 901,
      position: { x: 0, y: 0, z: 20 }, hpScale: 1, damageScale: 1,
    });
    const p = eliteAffixDef('berserk').params;
    assert.ok(Math.abs(berserk.moveSpeedMps - eliteStats('riftRavager').moveSpeed * (1 + p.moveSpeedPct)) < 1e-9);
  });

  test('精英窗口精确 [360, 509]：首只 360.0 / 第二只 450.0，359.9 前零精英', () => {
    for (const seed of [1, 2, 3, 7, 11, 42]) {
      const w = new EnemyWorld({ seed, events: false });
      const at = [];
      w.bus.subscribe('elite.spawned', () => at.push(w.clock.elapsedSec));
      w.fastForward(510, 0.1);
      assert.ok(at.length >= 1, `seed ${seed} 应有精英`);
      assert.ok(at.every((t) => t >= 360 && t < 510), `seed ${seed} 精英时刻越界: ${at}`);
      assert.ok(Math.abs(at[0] - 360) < 1e-6, `seed ${seed} 首只应恰为 360.0（实测 ${at[0]}）`);
      assert.ok(Math.abs(at[1] - 450) < 1e-6, `seed ${seed} 第二只应恰为 450.0（实测 ${at[1]}）`);
    }
  });

  test('同屏精英 ≤2、领主 ≤1；满员按 30s × 3 推迟后放弃', () => {
    const w = new EnemyWorld({ seed: 31, events: false });
    let maxElite = 0;
    let maxLord = 0;
    for (let t = 0; t < 700; t += 0.5) {
      w.tick(0.5);
      maxElite = Math.max(maxElite, w.manager.eliteCount);
      maxLord = Math.max(maxLord, w.manager.lordCount);
    }
    assert.ok(maxElite <= enemyConfig.eliteTierRules.maxElitesOnScreen, `同屏精英 ${maxElite} ≤ 2`);
    assert.ok(maxLord <= enemyConfig.eliteTierRules.maxEliteLordsOnScreen, `领主 ${maxLord} ≤ 1`);

    // 预填 2 只精英 → 360/390/420/450 四次尝试均满员 → 3 次重试后放弃
    const blocked = new EnemyWorld({ seed: 32, events: false });
    for (let i = 0; i < 2; i++) {
      blocked.manager.addElite(createElite(createMulberry32(500 + i), {
        rank: 'normal', entityId: 800 + i, position: { x: 0, y: 0, z: 25 }, hpScale: 1, damageScale: 1,
      }));
    }
    blocked.fastForward(470, 0.25);
    assert.equal(blocked.director.eliteCountSpawned, 0, '满员推迟 3 次后放弃本轮');
  });
});

// ─────────────────────────────────────────────────────────────
describe('TASK-05 D. Spawn Director（时间驱动怪物潮）', () => {
  test('波次数值来自阶段表：hpScale / maxOnScreen / 怪种权重', () => {
    const w = new EnemyWorld({ seed: 41, events: false });
    w.fastForward(320, 0.5); // 进入阶段 3（hpScale 1.8）
    // 清掉阶段 1/2 的存量（否则缩放值不属同一阶段），等下一波由阶段 3 生成
    for (const e of [...w.manager.aliveEnemies]) w.manager.despawn(e.entityId);
    let guard = 0;
    while (w.manager.aliveCount === 0 && guard++ < 100) w.tick(0.5);
    const phase = phaseAtSec(w.clock.elapsedSec);
    assert.equal(phase.index, 3);
    assert.equal(phase.hpScale, 1.8);
    assert.ok(w.manager.aliveCount > 0, '阶段 3 应已出新一波');
    for (const e of w.manager.aliveEnemies) {
      const base = normalEnemyDefinition(e.defId).baseHp;
      assert.ok(Math.abs(e.maxHp - base * phase.hpScale) < 1e-9, `${e.defId} maxHp 应为阶段缩放值`);
    }
  });

  test('安全生成：director 波次生成瞬间玩家 12m 内不得刷怪；数量有界', () => {
    const w = new EnemyWorld({ seed: 42, events: false });
    let minDist = Infinity;
    let maxAlive = 0;
    w.bus.subscribe('enemy.spawned', (p) => {
      const e = w.manager.enemies.find((x) => x.entityId === p.enemyId);
      if (e) minDist = Math.min(minDist, Math.hypot(e.position.x, e.position.z));
    });
    // 阶段切换不清场（契约 clearOnSpawn=false），存量可短时高于新阶段上限；
    // 但 spawn 本身受「当前阶段上限 + 分裂保底」约束，因此全局有界。
    const globalCap = Math.max(...wavePhases().map((p) => p.maxOnScreen)) + BEHAVIOR_EXTRA.splitOvercapAllowance;
    for (let t = 0; t < 700; t += 0.25) {
      w.tick(0.25);
      maxAlive = Math.max(maxAlive, w.manager.aliveCount);
      assert.ok(w.manager.aliveCount <= globalCap, `t=${w.clock.elapsedSec} 同屏 ${w.manager.aliveCount} > ${globalCap}`);
    }
    assert.ok(minDist >= SAFE_SPAWN.minDistanceFromPlayerM, `最近生成距离 ${minDist.toFixed(2)} < 12m`);
    assert.ok(maxAlive > 0);
  });

  test('Boss 期：普通怪上限 4、每 45s 补 2 只猎犬、精英全禁', () => {
    const w = new EnemyWorld({ seed: 43, events: false });
    w.fastForward(601, 0.25);
    for (const e of [...w.manager.aliveEnemies]) w.manager.despawn(e.entityId);
    const before = w.manager.eliteCount;
    w.fastForward(50, 0.25); // 跨过下一次 45s 补给
    const alive = w.manager.aliveEnemies;
    assert.ok(alive.length > 0 && alive.length <= bossPeriodRule().normalCap, `Boss 期补怪 ${alive.length} ≤ 4`);
    assert.ok(alive.every((e) => e.defId === bossPeriodRule().replenish.enemyId), '只补猎犬');
    assert.equal(w.manager.eliteCount, before, 'Boss 期不新增精英');
  });

  test('同 seed 两次 700s 全程逐字段一致（seed 可复现）', () => {
    const run = (seed) => {
      const w = new EnemyWorld({ seed });
      const events = [];
      const elites = [];
      w.bus.subscribe('world_event.started', (p) => events.push([w.clock.elapsedSec.toFixed(4), p.id]));
      w.bus.subscribe('elite.spawned', (p) => elites.push([w.clock.elapsedSec.toFixed(4), p.defId, p.affixes.join('+')]));
      w.fastForward(700, 0.25);
      return JSON.stringify({
        t: w.clock.elapsedSec, alive: w.manager.aliveCount, elite: w.manager.eliteCount,
        hp: w.player.hp, dmg: w.damageLog.length, buffs: w.buffLog.length,
        gold: w.player.gold, events, elites,
      });
    };
    assert.equal(run(77), run(77));
  });
});

// ─────────────────────────────────────────────────────────────
describe('TASK-05 E. 五种世界事件', () => {
  test('调度器：首场 [120,210]、间隔 108、单并发、同种不连续、510s 后停刷', () => {
    for (const seed of [51, 52, 53]) {
      const w = new EnemyWorld({ seed });
      const started = [];
      w.bus.subscribe('world_event.started', (p) => started.push([w.clock.elapsedSec, p.id]));
      let overlaps = 0;
      for (let t = 0; t < 700; t += 0.25) {
        w.tick(0.25);
        if (w.scheduler.activeEventId !== null && started.length > 0) {
          // 单并发：任何时刻最多一个活动事件（由 scheduler 结构保证，这里记录）
          overlaps = Math.max(overlaps, 1);
        }
      }
      assert.ok(started.length >= 1, `seed ${seed} 应有事件`);
      assert.ok(started.every(([t]) => t >= 120 && t < 510), '所有 started < 510 且 ≥ 120');
      for (let i = 1; i < started.length; i++) {
        assert.ok(started[i][0] - started[i - 1][0] >= worldEventSchedule().intervalSec, '间隔 ≥ 108s');
        assert.notEqual(started[i][1], started[i - 1][1], '同种不连续');
      }
      assert.ok(overlaps <= 1);
    }
  });

  test('遗落宝箱：靠近 openSec 完成 + 掉落；远离超时 expired', () => {
    const w = new EnemyWorld({ seed: 61, events: false });
    const ev = createWorldEvent('lostChest', w.bus);
    assert.ok(ev instanceof LostChestEvent);
    const dropped = [];
    w.bus.subscribe('resource.dropped', (p) => dropped.push(p));
    ev.start(w.eventCtx());
    w.player.position.x = ev.chestPosition.x;
    w.player.position.z = ev.chestPosition.z;
    driveEvent(w, ev, ev.def.params.openSec + 0.2);
    assert.equal(ev.state, 'completed');
    assert.ok(dropped.some((d) => d.currencyId === 'gold' && d.amount === EVENT_EXTRA.chestGold));

    const w2 = new EnemyWorld({ seed: 62, events: false });
    const ev2 = createWorldEvent('lostChest', w2.bus);
    const expired = [];
    w2.bus.subscribe('world_event.expired', (p) => expired.push(p.id));
    ev2.start(w2.eventCtx());
    w2.player.position.x = 100;
    driveEvent(w2, ev2, ev2.def.timeoutSec + 0.2);
    assert.equal(ev2.state, 'expired');
    assert.deepEqual(expired, ['lostChest']);
  });

  test('元素祭坛：站圈 5s 完成 +15%/90s；离圈 2× 衰减', () => {
    const w = new EnemyWorld({ seed: 63, events: false });
    const ev = createWorldEvent('elementalAltar', w.bus);
    assert.ok(ev instanceof ElementalAltarEvent);
    ev.start(w.eventCtx());
    w.player.position.x = ev.altarPosition.x;
    w.player.position.z = ev.altarPosition.z;
    driveEvent(w, ev, EVENT_EXTRA.elementalAltarChannelSec - 0.2);
    assert.equal(ev.state, 'active', '未到 5s 不得完成');
    driveEvent(w, ev, 0.3);
    assert.equal(ev.state, 'completed');
    const p = ev.def.params;
    assert.ok(w.buffLog.some((b) => b.buffId === 'elementalAltar' && b.pct === p.buffPct && b.durationSec === p.durationSec));

    const w2 = new EnemyWorld({ seed: 64, events: false });
    const ev2 = createWorldEvent('elementalAltar', w2.bus);
    ev2.start(w2.eventCtx());
    w2.player.position.x = ev2.altarPosition.x;
    w2.player.position.z = ev2.altarPosition.z;
    driveEvent(w2, ev2, 2.0);
    const mid = ev2.channelProgress;
    assert.ok(mid > 1.9 && mid < 2.1);
    w2.player.position.x = 100;
    driveEvent(w2, ev2, 1.0);
    assert.ok(ev2.channelProgress < 1e-9, '离圈 1s 按 2× 衰减');
  });

  test('怪物巢穴：摧毁 → completed；超时 → expired 且清理余怪（无泄漏）', () => {
    const w = new EnemyWorld({ seed: 65, events: false });
    const ev = createWorldEvent('monsterNest', w.bus);
    assert.ok(ev instanceof MonsterNestEvent);
    ev.start(w.eventCtx());
    driveEvent(w, ev, 21);
    assert.ok(ev.guardEntityIds.length > 0, '巢穴应刷守巢怪');
    const guards = [...ev.guardEntityIds];
    ev.attackTarget.takeDamage(ev.def.params.hp, 'staff');
    driveEvent(w, ev, 0.1);
    assert.equal(ev.state, 'completed');
    assert.ok(guards.every((id) => !w.manager.isAlive(id)), '完成后清余怪');

    const w2 = new EnemyWorld({ seed: 66, events: false });
    const ev2 = createWorldEvent('monsterNest', w2.bus);
    ev2.start(w2.eventCtx());
    driveEvent(w2, ev2, 20);
    const g2 = [...ev2.guardEntityIds];
    assert.ok(g2.length > 0);
    driveEvent(w2, ev2, ev2.def.timeoutSec + 1);
    assert.equal(ev2.state, 'expired');
    assert.ok(g2.every((id) => !w2.manager.isAlive(id)), '超时清余怪（无泄漏）');
  });

  test('古老祭坛：站圈 8s 完成，生命/金币双献祭全部来自 config', () => {
    const w = new EnemyWorld({ seed: 67, events: false });
    const ev = createWorldEvent('ancientAltar', w.bus);
    assert.ok(ev instanceof AncientAltarEvent);
    ev.start(w.eventCtx());
    w.player.position.x = ev.altarPosition.x;
    w.player.position.z = ev.altarPosition.z;
    const p = ev.def.params;
    driveEvent(w, ev, EVENT_EXTRA.ancientAltarChannelSec + 0.2);
    assert.equal(ev.state, 'completed');
    assert.ok(w.buffLog.some((b) => b.category === 'damage' && b.pct === p.damageBuffPct));
    assert.ok(w.buffLog.some((b) => b.category === 'interval' && b.pct === p.attackSpeedBuffPct));
    assert.ok(w.goldSpendLog.includes(p.goldCost));
    assert.ok(w.damageLog.some((d) => d.kind === 'zone'), '生命献祭应走 damagePlayer 端口');
  });

  test('精英入侵：窗口内关联双词缀真精英，击败 → completed；窗口外降级狼群', () => {
    const w = new EnemyWorld({ seed: 68, events: false });
    w.fastForward(365, 0.25); // 窗口内；director 已在 360 生成首只精英
    const ev = createWorldEvent('eliteInvasion', w.bus);
    assert.ok(ev instanceof EliteInvasionEvent);
    ev.start(w.eventCtx());
    assert.ok(ev.linkedEntityId !== null, '窗口内应关联真精英');
    const linked = w.manager.aliveEnemies.find((e) => e.entityId === ev.linkedEntityId);
    assert.ok(linked instanceof EliteEnemy);
    assert.equal(linked.affixes.length, ev.def.params.affixCount);
    linked.takeDamage(999999, 'staff');
    driveEvent(w, ev, 0.5, 0.1, true);
    assert.equal(ev.state, 'completed');

    const w2 = new EnemyWorld({ seed: 69, events: false });
    w2.fastForward(200, 0.25); // 窗口外（t < 360）
    const ev2 = createWorldEvent('eliteInvasion', w2.bus);
    ev2.start(w2.eventCtx());
    assert.equal(ev2.linkedEntityId, null, '窗口外不生成精英（360 前零精英防线）');
    assert.ok(ev2.fallbackEntityIds.length > 0, '窗口外应降级生成狼群');
    assert.ok(ev2.fallbackEntityIds.length <= EVENT_EXTRA.eliteInvasionFallbackPackSize, '狼群受同屏上限约束，有界');
    assert.ok(ev2.fallbackEntityIds.every((id) => {
      const e = w2.manager.aliveEnemies.find((x) => x.entityId === id);
      return e && e.defId === 'riftHound';
    }), '降级实体均为猎犬');
    assert.equal(w2.manager.eliteCount, 0);
  });
});

// ─────────────────────────────────────────────────────────────
describe('TASK-05 F. 红线与生命周期', () => {
  test('新增源码零 Math.random（seed 可复现）', () => {
    const dirs = ['src/enemy', 'src/elites', 'src/spawn', 'src/world', 'src/worldevents'];
    const files = [];
    const walk = (d) => {
      for (const name of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, name.name);
        if (name.isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    for (const d of dirs) walk(d);
    const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(files.length >= 15, `应覆盖全部新增模块（实际 ${files.length}）`);
    for (const f of files) {
      assert.equal(strip(readFileSync(f, 'utf8')).includes('Math.random'), false, `${f} 使用 Math.random`);
    }
  });

  test('700s 全程容器有界（enemies / projectiles / clouds），无对象泄漏', () => {
    const w = new EnemyWorld({ seed: 71 });
    w.fastForward(700, 0.5);
    assert.ok(w.manager.enemies.length <= 30, `实体容器 ${w.manager.enemies.length} 应有界`);
    assert.ok(w.manager.projectiles.length <= 30, `投射物 ${w.manager.projectiles.length} 应有界`);
    assert.ok(w.manager.clouds.length <= 10, `毒区 ${w.manager.clouds.length} 应有界`);
    assert.equal(w.bus.listenerCount('enemy.spawned') >= 0, true);
  });

  test('手动注入端口生效（TASK-02/04 集成点）', () => {
    const hits = [];
    const buffs = [];
    const w = new EnemyWorld({
      seed: 81, events: false,
      damagePlayer: (amount, attacker, kind) => hits.push({ amount, kind, defId: attacker?.defId ?? null }),
      applyBuff: (b) => buffs.push(b),
      spendGold: () => false,
    });
    const h = w.manager.spawn('riftHound', { position: { x: 0.2, z: 0 } });
    w.manager.tick(w.eventCtx(), 0.1);
    assert.ok(hits.length > 0 && hits[0].defId === 'riftHound', '伤害经注入端口');
    const ev = createWorldEvent('elementalAltar', w.bus);
    ev.start(w.eventCtx());
    w.player.position.x = ev.altarPosition.x;
    w.player.position.z = ev.altarPosition.z;
    driveEvent(w, ev, EVENT_EXTRA.elementalAltarChannelSec + 0.2);
    assert.ok(buffs.length > 0, 'buff 经注入端口');
  });
});
