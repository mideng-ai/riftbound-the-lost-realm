/**
 * TASK-04 验收测试（Economy & Meta Agent）—— 资源经济与永久成长
 *
 * 编译链与现有测试一致：
 *   tsc -p tsconfig.test.json → .testbuild/（CommonJS）→ tests/prepare.cjs
 *   本文件以 node:test 直接加载编译产物（createRequire）。
 *
 * 覆盖任务书 9 条验收标准：
 *   AC-1 掉落表数据驱动，改 config 即生效
 *   AC-2 拾取一次只入账一次（防重入）
 *   AC-3 玩家死亡后已拾取永久资源正确保存
 *   AC-4 地面未拾取物不会被结算
 *   AC-5 本局经验不误存为永久经验
 *   AC-6 金币成本公式与成长上限正确；Lv10 里程碑 +5% 生效
 *   AC-7 存档写入 SaveDataV3（schemaVersion=3，socket 字段为 itemInstanceId）
 *   AC-8 v2→v3 迁移 gold 正确保留；畸形存档不抛错
 *   AC-9 新增测试覆盖上述规则（本文件）
 *
 * 数值断言全部取自冻结 config / 契约函数，不写死业务数值副本。
 */
'use strict';

import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);

const economy = require('../.testbuild/economy/index.js');
const save = require('../.testbuild/domain/save.js');
const player = require('../.testbuild/domain/player.js');
const events = require('../.testbuild/domain/events.js');
const playerConfigMod = require('../.testbuild/config/playerConfig.js');
const damageConfigMod = require('../.testbuild/config/damageConfig.js');
const gemConfigMod = require('../.testbuild/config/gemConfig.js');
const enemyConfigMod = require('../.testbuild/config/enemyConfig.js');

const {
  EconomySystem,
  InMemoryEconomyStore,
  SavePortV3Bridge,
  V3_STASH_KEY,
  rollLoot,
  metaGrowthCostOfLevel,
  metaGrowthTotalInvestment,
  fullDualWeaponMaterialTotal,
  WEAPON_UPGRADE_MATERIAL_COST,
} = economy;

const { damageConfig } = damageConfigMod;
const { gemConfig } = gemConfigMod;
const { enemyConfig } = enemyConfigMod;
const { metaGrowthPctOfLevel, masteryPctOfLevel, metaGrowthCost, playerConfig } = playerConfigMod;

function freshSave(mutate = () => {}) {
  const s = JSON.parse(JSON.stringify(save.defaultSaveV3()));
  mutate(s);
  return s;
}

function makeSystem(initial = null, seed = 20261115) {
  const store = new InMemoryEconomyStore(initial);
  const bus = events.createEventBus();
  const rng = events.createMulberry32(seed);
  const sys = new EconomySystem(store, bus, rng);
  return { sys, store, bus };
}

function pctClose(actual, expected) {
  return Math.abs(actual - expected) < 1e-9;
}

const IDS = (() => {
  let n = 0;
  return {
    nextDropId: () => `d${n++}`,
    nextInstanceId: () => `i${n++}`,
  };
});

// ═══════════════════════════════════════════════════════════
// AC-1 掉落表数据驱动
// ═══════════════════════════════════════════════════════════

test('AC-1a | 掉落产出由冻结 config 掉落表逐规则推导（数量区间与概率）', () => {
  const rng = events.createMulberry32(42);
  for (const tier of Object.keys(damageConfig.loot)) {
    const stats = new Map();
    for (let i = 0; i < 400; i += 1) {
      const { rolls, drops } = rollLoot({ tier, element: 'fire' }, rng, IDS());
      for (const r of rolls) {
        const s = stats.get(r.currencyId) ?? { min: Infinity, max: -Infinity };
        s.min = Math.min(s.min, r.amount);
        s.max = Math.max(s.max, r.amount);
        stats.set(r.currencyId, s);
      }
      for (const d of drops) {
        if (d.kind === 'gem') {
          assert.ok(d.item.itemInstanceId.length > 0, '宝石掉落必须带实例 ID');
        }
      }
    }
    const table = damageConfig.loot[tier];
    // gold 必掉且落在 [min,max]
    const gold = stats.get('gold');
    assert.ok(gold, `${tier}: 金币必掉`);
    assert.ok(gold.min >= table.gold.min && gold.max <= table.gold.max,
      `${tier}: 金币越界 [${gold.min},${gold.max}] vs [${table.gold.min},${table.gold.max}]`);
    // 材料/碎片出现时数量落在表区间
    const material = stats.get('forestMaterial');
    if (material) {
      assert.ok(material.min >= table.material.min && material.max <= table.material.max,
        `${tier}: 材料越界`);
    }
    for (const cur of ['fireShard', 'iceShard', 'lightningShard', 'shadowShard']) {
      const sh = stats.get(cur);
      if (sh) {
        assert.ok(sh.min >= table.shard.min && sh.max <= table.shard.max,
          `${tier}: 碎片 ${cur} 越界`);
      }
    }
    // chance=0 的规则绝不产出
    if (table.shard.chance === 0) {
      for (const cur of ['fireShard', 'iceShard', 'lightningShard', 'shadowShard']) {
        assert.ok(!stats.has(cur), `${tier}: shard.chance=0 却产出 ${cur}`);
      }
    }
  }
});

test('AC-1b | 改 config（damageConfig.loot）即生效 —— 数据驱动', () => {
  const original = damageConfig.loot.normal.gold;
  try {
    damageConfig.loot.normal.gold = { min: 7, max: 7 };
    const { rolls } = rollLoot({ tier: 'normal' }, events.createMulberry32(7), IDS());
    const gold = rolls.filter((r) => r.currencyId === 'gold');
    assert.equal(gold.length, 1);
    assert.equal(gold[0].amount, 7, '改表后掉落立刻变 7 金');
  } finally {
    damageConfig.loot.normal.gold = original; // 还原，零污染
  }
});

test('AC-1c | 元素维度决定碎片种类；Boss 宝石品质取 enemyConfig.bossReward.minGemQuality', () => {
  const rng = events.createMulberry32(11);
  // elemental 的 shard.chance=0.4，多次摇取必出现
  let sawShadowShard = false;
  for (let i = 0; i < 60; i += 1) {
    const { rolls } = rollLoot({ tier: 'elemental', element: 'shadow' }, rng, IDS());
    if (rolls.some((r) => r.currencyId === 'shadowShard')) sawShadowShard = true;
    assert.ok(rolls.every((r) => !r.currencyId.endsWith('Shard') || r.currencyId === 'shadowShard'),
      'element=shadow 时只能产出 shadowShard');
  }
  assert.ok(sawShadowShard, 'elemental 碎片概率应可观测到');

  // Boss gem.chance=1.0 → 必掉宝石且品质不低于 minGemQuality
  const { drops } = rollLoot({ tier: 'boss', element: 'fire' }, rng, IDS());
  const gems = drops.filter((d) => d.kind === 'gem');
  assert.equal(gems.length, 1);
  assert.equal(gems[0].item.quality, enemyConfig.bossReward.minGemQuality);
});

test('AC-1d | Rng 同 seed 产出完全一致的掉落序列（可复现）', () => {
  const a = rollLoot({ tier: 'elite', element: 'ice' }, events.createMulberry32(99), IDS());
  const b = rollLoot({ tier: 'elite', element: 'ice' }, events.createMulberry32(99),
    (() => { let n = 0; return { nextDropId: () => `d${n++}`, nextInstanceId: () => `i${n++}` }; })());
  assert.deepEqual(a.rolls, b.rolls);
});

// ═══════════════════════════════════════════════════════════
// AC-2 拾取防重入
// ═══════════════════════════════════════════════════════════

test('AC-2a | 同一 dropId 拾取两次只入账一次', async () => {
  const { sys, bus } = makeSystem();
  await sys.boot();
  sys.beginRun();
  let pickedEvents = 0;
  bus.subscribe('resource.picked_up', () => { pickedEvents += 1; });
  const { drops } = sys.rollDropsForKill({ tier: 'elite', element: 'fire' });
  const target = drops.find((d) => d.kind === 'resource');
  assert.ok(target);

  const first = sys.pickup(target.dropId);
  assert.equal(first.ok, true);
  const afterFirst = sys.runLootView;
  const second = sys.pickup(target.dropId);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already-picked');
  assert.deepEqual(sys.runLootView, afterFirst, '重复拾取不得重复入账');
  assert.equal(sys.ledgerView.pickedCount, 1);
  assert.equal(pickedEvents, 1, 'resource.picked_up 事件只发一次');
});

test('AC-2b | 未知 dropId 拒绝且零副作用', async () => {
  const { sys } = makeSystem();
  await sys.boot();
  sys.beginRun();
  const r = sys.pickup('no-such-drop');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown-drop');
  assert.equal(sys.ledgerView.pickedCount, 0);
});

test('AC-2c | 拾取宝石实例只入库存一次', async () => {
  const { sys } = makeSystem();
  await sys.boot();
  sys.beginRun();
  const { drops } = sys.rollDropsForKill({ tier: 'boss', element: 'fire' });
  const gem = drops.find((d) => d.kind === 'gem');
  assert.ok(gem, 'Boss 必掉宝石');
  assert.equal(sys.pickup(gem.dropId).ok, true);
  assert.equal(sys.pickup(gem.dropId).reason, 'already-picked');
  assert.equal(sys.runLootView.gems.length, 1);
});

// ═══════════════════════════════════════════════════════════
// AC-3 / AC-4 / AC-5 结算
// ═══════════════════════════════════════════════════════════

test('AC-3 | 死亡（victory=false）结算保留已拾取资源与宝石', async () => {
  const { sys, store } = makeSystem();
  await sys.boot();
  sys.beginRun();
  const before = JSON.parse(JSON.stringify(sys.saveView));

  for (let i = 0; i < 8; i += 1) {
    const { drops } = sys.rollDropsForKill({ tier: 'elite', element: 'fire' });
    for (const d of drops) sys.pickup(d.dropId);
  }
  const loot = sys.runLootView;
  assert.ok(loot.gold > 0, '本局确有拾取');

  const report = await sys.settleRun({ victory: false });
  assert.equal(report.victory, false);
  assert.deepEqual(report.credited, loot);

  const after = sys.saveView;
  assert.equal(after.currencies.gold, before.currencies.gold + loot.gold);
  assert.equal(after.currencies.forestMaterial, before.currencies.forestMaterial + loot.forestMaterial);
  for (const e of ['fire', 'ice', 'lightning', 'shadow']) {
    assert.equal(after.currencies.elementalShards[e], before.currencies.elementalShards[e] + loot.shards[e]);
  }
  assert.equal(after.gemInventory.length, before.gemInventory.length + loot.gems.length);
  // 死亡不给森林核心、不加 Boss 击败进度（总纲 §6.5）
  assert.equal(after.currencies.forestCore, before.currencies.forestCore);
  assert.equal(report.forestCoreCredited, 0);
  assert.equal(report.bossKillsCredited, 0);
  assert.ok(store.writeCount > 0, '结算必须落盘');
});

test('AC-4 | 地面未拾取物不结算', async () => {
  const { sys } = makeSystem();
  await sys.boot();
  sys.beginRun();
  const before = JSON.parse(JSON.stringify(sys.saveView));
  for (let i = 0; i < 10; i += 1) sys.rollDropsForKill({ tier: 'boss', element: 'fire' });
  const onGround = sys.registryView.onGround;
  assert.ok(onGround.length > 0);

  const report = await sys.settleRun({ victory: true });
  assert.equal(report.credited.gold, 0);
  assert.equal(report.credited.forestMaterial, 0);
  assert.equal(report.credited.gems.length, 0);
  assert.ok(Object.keys(report.discarded).length > 0);
  // 丢弃明细 = 地面汇总
  const expected = {};
  for (const d of onGround) {
    const key = d.kind === 'resource' ? d.currencyId : 'gem';
    expected[key] = (expected[key] ?? 0) + (d.kind === 'resource' ? d.amount : 1);
  }
  assert.deepEqual(report.discarded, expected);
  assert.equal(sys.saveView.currencies.gold, before.currencies.gold);
  assert.equal(sys.saveView.currencies.forestMaterial, before.currencies.forestMaterial);
  assert.equal(sys.saveView.gemInventory.length, before.gemInventory.length);
});

test('AC-5 | 本局经验不误存为永久经验（结构 + 行为双断言）', async () => {
  const { sys } = makeSystem();
  await sys.boot();
  sys.beginRun();
  for (let i = 0; i < 8; i += 1) {
    const { drops } = sys.rollDropsForKill({ tier: 'normal', element: 'ice' });
    for (const d of drops) sys.pickup(d.dropId);
  }
  const metaBefore = JSON.parse(JSON.stringify(sys.saveView.metaProgress));
  const weaponsBefore = JSON.parse(JSON.stringify(sys.saveView.weapons));
  await sys.settleRun({ victory: true });
  assert.deepEqual(sys.saveView.metaProgress, metaBefore, 'metaProgress 不被局内经验触碰');
  assert.deepEqual(sys.saveView.weapons, weaponsBefore, '局内等级不写永久存档');
  assert.ok(!('xp' in sys.saveView) && !('level' in sys.saveView), 'SaveDataV3 无 XP/等级字段');
  assert.equal(EconomySystem.prototype.settleRun.length, 1, '结算接口只有 outcome 入参');
});

test('结算 | run.settled 事件 payload 为 {victory, pickedResources: SaveRunLoot}', async () => {
  const { sys, bus } = makeSystem();
  await sys.boot();
  sys.beginRun();
  const { drops } = sys.rollDropsForKill({ tier: 'normal', element: 'fire' });
  for (const d of drops) sys.pickup(d.dropId);
  const expected = sys.runLootView;
  let seen = null;
  bus.subscribe('run.settled', (p) => { seen = p; });
  await sys.settleRun({ victory: false });
  assert.ok(seen);
  assert.equal(seen.victory, false);
  assert.deepEqual(seen.pickedResources, expected);
  assert.equal(typeof seen.pickedResources.shards.fire, 'number');
});

test('Boss 规则 | 森林核心与击败进度只在 victory && bossDefeated 入账', async () => {
  const { sys } = makeSystem();
  await sys.boot();
  sys.beginRun();
  assert.equal(sys.onBossDefeated(600), true);
  assert.equal(sys.onBossDefeated(600), false, '每局只登记一次');
  const before = JSON.parse(JSON.stringify(sys.saveView));
  const report = await sys.settleRun({ victory: true, bossDefeated: true, elapsedSec: 700 });
  assert.equal(report.forestCoreCredited, enemyConfig.bossReward.forestCore);
  assert.equal(report.bossKillsCredited, 1);
  assert.equal(sys.forestCore, before.currencies.forestCore + enemyConfig.bossReward.forestCore);
  assert.equal(sys.bossKills, before.stats.bossKills + 1);
  assert.equal(sys.saveView.stats.bestTimeSec, 700);
  assert.equal(sys.saveView.stats.runsPlayed, before.stats.runsPlayed + 1);
});

// ═══════════════════════════════════════════════════════════
// AC-6 成本公式 / 上限 / Lv10 里程碑
// ═══════════════════════════════════════════════════════════

test('AC-6a | 成本 C(L) = base + step×(L−1)，取自冻结 getter；单线总投入 3250', () => {
  assert.equal(metaGrowthCostOfLevel(1), metaGrowthCost.base);
  assert.equal(metaGrowthCostOfLevel(2), metaGrowthCost.base + metaGrowthCost.step);
  assert.equal(metaGrowthCostOfLevel(10), metaGrowthCost.base + 9 * metaGrowthCost.step);
  assert.equal(metaGrowthCostOfLevel(0), 0);
  assert.equal(metaGrowthTotalInvestment(), 3250);
  assert.equal(metaGrowthCost.maxLevel, 10);
});

test('AC-6b | 熟练度 Lv10 = 25%（2%×10 + 里程碑 5%）；Lv9 = 18%', () => {
  assert.ok(pctClose(masteryPctOfLevel(9), 0.18));
  assert.ok(pctClose(masteryPctOfLevel(10), 0.25));
  const curve = Array.from({ length: 11 }, (_, l) => masteryPctOfLevel(l));
  for (let l = 1; l <= 9; l += 1) assert.ok(pctClose(curve[l] - curve[l - 1], playerConfig.metaGrowth.masteryPctPerLevel));
  assert.ok(pctClose(curve[10] - curve[9], 0.07));
});

test('AC-6c | 森林生存 Lv10 = 15% 而非 14%（里程碑陷阱）；MaxHp = 115', () => {
  assert.ok(pctClose(metaGrowthPctOfLevel('forestSurvival', 9), 0.09));
  assert.ok(pctClose(metaGrowthPctOfLevel('forestSurvival', 10), 0.15));
  assert.ok(!pctClose(metaGrowthPctOfLevel('forestSurvival', 10), 0.14), '错误公式 9%+5%=14% 必须被排除');
  assert.ok(pctClose(player.deriveMaxHp(0, player.forestSurvivalPctOfLevel(10)), 115));
});

test('AC-6d | 等级边界夹取（负数 / NaN / 10.9 / 100）', () => {
  assert.equal(metaGrowthPctOfLevel('mastery', -5), 0);
  assert.equal(metaGrowthPctOfLevel('mastery', NaN), 0);
  assert.ok(pctClose(metaGrowthPctOfLevel('forestSurvival', 10.9), 0.15));
  assert.ok(pctClose(metaGrowthPctOfLevel('forestSurvival', 100), 0.15));
});

test('AC-6e | 购买成长端到端：三条线买满恰花 3250×3，金币归零，Lv10 封顶', async () => {
  const initial = freshSave((s) => { s.currencies.gold = 3250 * 3; });
  const { sys } = makeSystem(initial);
  await sys.boot();
  for (const track of ['staffMastery', 'swordMastery', 'forestSurvival']) {
    for (let l = 1; l <= 10; l += 1) {
      const r = await sys.purchaseMetaGrowth(track);
      assert.equal(r.ok, true, `${track} 第 ${l} 级`);
      assert.equal(r.goldSpent, metaGrowthCostOfLevel(l));
    }
    const capped = await sys.purchaseMetaGrowth(track);
    assert.equal(capped.ok, false);
    assert.equal(capped.reason, 'already-max');
  }
  assert.equal(sys.gold, 0);
  assert.equal(sys.metaLevel('forestSurvival'), 10);
});

test('AC-6f | 余额不足拒绝且零副作用', async () => {
  const initial = freshSave((s) => { s.currencies.gold = metaGrowthCost.base - 1; });
  const { sys } = makeSystem(initial);
  await sys.boot();
  const r = await sys.purchaseMetaGrowth('staffMastery');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient-gold');
  assert.equal(sys.metaLevel('staffMastery'), 0);
  assert.equal(sys.gold, metaGrowthCost.base - 1);
});

// ═══════════════════════════════════════════════════════════
// AC-7 武器强化 / 制作 / SaveDataV3 落盘
// ═══════════════════════════════════════════════════════════

test('AC-7a | 武器强化成本序列与总量（10/20/35/55、单武器 120、双武器 240）', async () => {
  assert.deepEqual([...WEAPON_UPGRADE_MATERIAL_COST], [10, 20, 35, 55]);
  assert.equal([...WEAPON_UPGRADE_MATERIAL_COST].reduce((a, b) => a + b, 0), 120);
  assert.equal(fullDualWeaponMaterialTotal(), 240);

  const initial = freshSave((s) => { s.currencies.forestMaterial = 240; });
  const { sys } = makeSystem(initial);
  await sys.boot();
  for (const weapon of ['staff', 'sword']) {
    for (let i = 0; i < 4; i += 1) {
      const r = await sys.upgradeWeapon(weapon);
      assert.equal(r.ok, true);
      assert.equal(r.materialSpent, WEAPON_UPGRADE_MATERIAL_COST[i]);
    }
    assert.equal((await sys.upgradeWeapon(weapon)).reason, 'already-max');
  }
  assert.equal(sys.material, 0);
  assert.equal(sys.weaponLevel('staff'), 5);
  assert.equal(sys.weaponLevel('sword'), 5);
});

test('AC-7b | 材料不足拒绝且零副作用；weapon.upgraded 事件形状正确', async () => {
  const { sys, bus } = makeSystem();
  await sys.boot();
  const r = await sys.upgradeWeapon('sword');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient-material');
  assert.equal(sys.weaponLevel('sword'), 1);

  let seen = null;
  bus.subscribe('weapon.upgraded', (p) => { seen = p; });
  const initial2 = freshSave((s) => { s.currencies.forestMaterial = 10; });
  const ctx = makeSystem(initial2);
  await ctx.sys.boot();
  ctx.bus.subscribe('weapon.upgraded', (p) => { seen = p; });
  assert.equal((await ctx.sys.upgradeWeapon('staff')).ok, true);
  assert.deepEqual(seen, { weaponId: 'staff', level: 2 });
});

test('AC-7c | 制作配方数值来自 gemConfig.craft（8 碎片 + 5 材料 → common 元素宝石）', async () => {
  const initial = freshSave((s) => {
    s.currencies.elementalShards.fire = gemConfig.craft.shardCost * 2;
    s.currencies.forestMaterial = gemConfig.craft.materialCost * 2;
  });
  const { sys } = makeSystem(initial);
  await sys.boot();
  const r1 = await sys.craftGem('fire');
  const r2 = await sys.craftGem('fire');
  assert.equal(r1.ok && r2.ok, true);
  assert.equal(r1.shardSpent, gemConfig.craft.shardCost);
  assert.equal(r1.materialSpent, gemConfig.craft.materialCost);
  assert.equal(r1.created.gemId, 'fire');
  assert.equal(r1.created.quality, 'common');
  assert.ok(r1.created.itemInstanceId);
  assert.equal(sys.shardBalance('fire'), 0);
  assert.equal(sys.material, 0);
  const ids = sys.saveView.gemInventory.map((g) => g.itemInstanceId);
  assert.equal(new Set(ids).size, 2, '实例 ID 唯一');
  assert.equal((await sys.craftGem('fire')).reason, 'insufficient-shard');
});

test('AC-7d | 存档落盘 schemaVersion=3；socket 字段为 itemInstanceId（非模板 gemId）', async () => {
  const initial = freshSave((s) => {
    s.currencies.elementalShards.fire = gemConfig.craft.shardCost;
    s.currencies.forestMaterial = gemConfig.craft.materialCost;
  });
  const { sys, store } = makeSystem(initial);
  await sys.boot();
  await sys.craftGem('fire');
  const inst = sys.saveView.gemInventory[0];
  const written = await store.load();
  assert.equal(written.schemaVersion, 3);
  assert.equal(written.gemInventory[0].itemInstanceId, inst.itemInstanceId);

  // 构造 socket 绑定实例 ID → validateSaveV3 通过
  const withSocket = JSON.parse(JSON.stringify(written));
  withSocket.weapons.staff.sockets[0] = inst.itemInstanceId;
  assert.deepEqual([...save.validateSaveV3(withSocket)], []);
  // 悬空 ID 被拦截
  withSocket.weapons.staff.sockets[0] = 'ghost-instance';
  assert.ok(save.validateSaveV3(withSocket).some((e) => e.includes('itemInstanceId')));
  // 槽位字段是实例 ID 而不是 gemId 模板
  assert.equal(withSocket.gemInventory[0].gemId, 'fire');
  assert.notEqual(withSocket.weapons.staff.sockets[0], 'fire');
});

// ═══════════════════════════════════════════════════════════
// AC-8 v2→v3 迁移 / 畸形容错 / SavePort 桥
// ═══════════════════════════════════════════════════════════

test('AC-8a | v2→v3 迁移：profile.gold 正确保留到 currencies.gold', () => {
  const v2 = {
    schemaVersion: 2, savedAt: '2026-01-01T00:00:00.000Z',
    profile: { gold: 777, unlocks: ['intro'] },
    inventory: [], stash: [], settings: { sfx: false, music: false },
  };
  const v3 = save.migrateV2toV3(v2);
  assert.equal(v3.schemaVersion, 3);
  assert.equal(v3.currencies.gold, 777);
  assert.equal(v3.settings.volumes.music, 1, 'V2 布尔音量按契约不迁移，重置为 1');
});

test('AC-8b | 畸形存档（migrateSave / boot）均不抛错', async () => {
  const cases = [
    null, undefined, 'garbage', 42, [], {},
    { schemaVersion: 9 }, { schemaVersion: 3, currencies: 'bad' },
    { schemaVersion: 3, weapons: null }, { schemaVersion: 2, profile: null },
  ];
  for (const c of cases) {
    assert.doesNotThrow(() => save.migrateSave(c), `migrateSave 不得抛错: ${JSON.stringify(c)}`);
  }
  for (const c of cases) {
    const { sys } = makeSystem(c);
    assert.doesNotThrow(() => save.validateSaveV3(save.defaultSaveV3()), '契约校验本身不得抛错');
    const report = await sys.boot(); // 抛错会让测试直接失败
    assert.equal(sys.saveView.schemaVersion, 3);
    assert.ok(report.source.length > 0);
  }
});

test('AC-8c | boot 全链路：V2 存档经系统加载后 gold 保留并可继续游玩', async () => {
  const v2 = {
    schemaVersion: 2, savedAt: '2026-01-01T00:00:00.000Z',
    profile: { gold: 500, unlocks: [] }, inventory: [], stash: [],
    settings: { sfx: true, music: true },
  };
  const { sys } = makeSystem(v2);
  const report = await sys.boot();
  assert.equal(report.source, 'v2-migrated');
  assert.equal(sys.gold, 500);
  assert.equal((await sys.purchaseMetaGrowth('staffMastery')).ok, true);
  assert.equal(sys.gold, 500 - metaGrowthCostOfLevel(1));
});

test('AC-8d | SavePortV3Bridge：V3 直传、历史 stash 套壳兼容、纯 V2 交 migrateSave', async () => {
  const port = {
    data: null,
    async load() { return this.data; },
    async save(d) { this.data = JSON.parse(JSON.stringify(d)); },
    async reset() { this.data = null; },
  };
  const bridge = new SavePortV3Bridge(port);
  const v3 = freshSave((s) => { s.currencies.gold = 321; });
  await bridge.save(v3);
  const loaded = await bridge.load();
  assert.equal(loaded.schemaVersion, 3);
  assert.equal(loaded.currencies.gold, 321);
  assert.equal(port.data.schemaVersion, 3, 'ADR-TD-009：SavePort 直接承载 V3，不再套 V2 外壳');

  // 历史 Mock 阶段套壳档仍可读，不因接口升级丢档
  port.data = {
    schemaVersion: 2, savedAt: '2026-01-01T00:00:00.000Z',
    profile: { gold: 0, unlocks: [] }, inventory: [],
    stash: [{ [V3_STASH_KEY]: v3 }],
    settings: { sfx: true, music: true },
  };
  const legacy = await bridge.load();
  assert.equal(legacy.schemaVersion, 3);
  assert.equal(legacy.currencies.gold, 321);

  port.data = {
    schemaVersion: 2, savedAt: '2026-01-01T00:00:00.000Z',
    profile: { gold: 654, unlocks: [] }, inventory: [], stash: [],
    settings: { sfx: true, music: true },
  };
  const rawV2 = await bridge.load();
  assert.equal(rawV2.schemaVersion, 2);
  assert.equal(save.migrateSave(rawV2).currencies.gold, 654);
});

test('AC-8e | 温和畸形 V3 修复后 gold 保留；重度畸形兜底默认档', async () => {
  const partial = { schemaVersion: 3, currencies: { gold: 555 } };
  const { sys } = makeSystem(partial);
  const report = await sys.boot();
  assert.equal(report.source, 'v3-loaded');
  assert.equal(sys.gold, 555);

  const broken = { schemaVersion: 3, currencies: { gold: 8 }, metaProgress: { staffMastery: 99 } };
  const { sys: sys2 } = makeSystem(broken);
  const report2 = await sys2.boot();
  assert.equal(report2.source, 'v3-fallback');
  assert.ok(report2.issues.length > 0, '问题登记而非抛错');
  assert.equal(sys2.gold, 0);
});

// ═══════════════════════════════════════════════════════════
// 回归 / 契约纪律
// ═══════════════════════════════════════════════════════════

test('REG-1 | 连续局：beginRun 重置地面/账本/Boss 登记', async () => {
  const { sys } = makeSystem();
  await sys.boot();
  sys.beginRun();
  const { drops } = sys.rollDropsForKill({ tier: 'normal', element: 'fire' });
  sys.pickup(drops[0].dropId);
  sys.onBossDefeated(600);
  await sys.settleRun({ victory: true, bossDefeated: true });
  sys.beginRun();
  assert.equal(sys.registryView.onGround.length, 0);
  assert.equal(sys.ledgerView.pickedCount, 0);
  assert.equal(sys.onBossDefeated(600), true, 'Boss 登记已重置');
});

test('REG-2 | 冻结契约纪律：经济模块只读 config，业务数值全部来自配置', () => {
  assert.equal(damageConfig.loot.normal.gold.min, 1);
  assert.equal(damageConfig.loot.boss.gold.min, enemyConfig.bossReward.goldMin);
  assert.equal(gemConfig.craft.shardCost, 8);
  assert.equal(gemConfig.craft.materialCost, 5);
  assert.equal(playerConfig.weaponUpgradePctByLevel[4], 0.32, 'Lv5=+32%（D-09）');
  assert.equal(metaGrowthCost.step, playerConfig.metaGrowth.costStep, '成本 getter 与单一事实来源恒等');
});
