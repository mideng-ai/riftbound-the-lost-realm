/**
 * D-207 存档后端验收测试（ADR-TD-009）
 *
 * 运行：node --experimental-strip-types --no-warnings --test tests/save-backend.test.mjs
 * 说明：纯 JS 测试文件，直接 import 仓库 .ts 源码；headless StorageLike mock，
 *       不依赖真实浏览器、不引入新 npm 依赖。冻结契约 src/domain/** 只读引用。
 *
 * 覆盖：首次档 / 全字段往返 / v2 迁移 / v3 直通 / 损坏隔离 / 临时键恢复协议 /
 *       配额写失败主档完好 / validateSaveV3 守门 / SavePort v3 接口层 / 经济系统端到端落盘。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LocalStorageSaveAdapter,
  SAVE_MAIN_KEY,
  SAVE_NEXT_KEY,
  SAVE_CORRUPT_BACKUP_KEY,
} from '../src/save/LocalStorageSaveAdapter.ts';
import { MockSaveAdapter } from '../src/save/MockSaveAdapter.ts';
import {
  defaultSaveV3,
  validateSaveV3,
  SAVE_SCHEMA_VERSION,
} from '../src/domain/save.ts';
import { createEventBus, createMulberry32 } from '../src/domain/events.ts';
import { SavePortV3Bridge } from '../src/economy/saveBridge.ts';
import { EconomySystem } from '../src/economy/system.ts';
import { enemyConfig } from '../src/config/enemyConfig.ts';

/** headless StorageLike：可种子化、可覆盖 setItem 模拟配额异常。 */
function createStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

/** 冻结契约工厂 + 变异，不复制业务数值规则。 */
function freshSave(mutate = () => {}) {
  const save = structuredClone(defaultSaveV3());
  mutate(save);
  return save;
}

function fullSave() {
  return freshSave((s) => {
    s.savedAt = '2026-11-16T00:00:00.000Z';
    s.currencies.gold = 1234;
    s.currencies.forestMaterial = 56;
    s.currencies.elementalShards = { fire: 1, ice: 2, lightning: 3, shadow: 4 };
    s.currencies.forestCore = 7;
    s.gemInventory = [
      { itemInstanceId: 'gem-1', gemId: 'fire', quality: 'rare' },
      { itemInstanceId: 'gem-2', gemId: 'ice', quality: 'epic' },
    ];
    s.weapons.staff = { level: 4, sockets: ['gem-1', null, null] };
    s.weapons.sword = { level: 3, sockets: [null, 'gem-2', null] };
    s.metaProgress = { staffMastery: 8, swordMastery: 6, forestSurvival: 3 };
    s.settings.volumes = { sfx: 0.4, music: 0.6 };
    s.settings.quality = 'low';
    s.settings.colorblind = true;
    s.settings.language = 'en';
    s.stats = { runsPlayed: 42, bossKills: 5, bestTimeSec: 321.5 };
  });
}

// ═══════════════════════════════════════════════════════════
// A. 首次加载 + 全字段往返
// ═══════════════════════════════════════════════════════════

test('A1 首次加载返回默认档（schemaVersion=3，全字段为初始状态）', async () => {
  const adapter = new LocalStorageSaveAdapter(createStorage());
  const first = await adapter.load();
  assert.equal(first.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(first.currencies.gold, 0);
  assert.equal(first.weapons.staff.level, 1);
  assert.deepEqual(first.weapons.staff.sockets, [null, null, null]);
  assert.deepEqual(first.currencies.elementalShards, { fire: 0, ice: 0, lightning: 0, shadow: 0 });
  assert.deepEqual(first.metaProgress, { staffMastery: 0, swordMastery: 0, forestSurvival: 0 });
  assert.deepEqual(first.stats, { runsPlayed: 0, bossKills: 0, bestTimeSec: null });
});

test('A2 写入后重载：gold/gem/weapon/meta/stats/settings 全字段一致', async () => {
  const storage = createStorage();
  const adapter = new LocalStorageSaveAdapter(storage);
  const save = fullSave();
  assert.deepEqual(validateSaveV3(save), [], '测试夹具本身必须通过冻结契约校验');

  await adapter.save(save);
  const reloaded = await adapter.load();
  assert.deepEqual(reloaded, save, '往返后每个字段逐字节一致（含 savedAt）');
  assert.equal(storage.getItem(SAVE_NEXT_KEY), null, '正常写入后临时键被清理');
  assert.equal(JSON.parse(storage.getItem(SAVE_MAIN_KEY)).schemaVersion, 3);
});

// ═══════════════════════════════════════════════════════════
// B. 迁移：v2 → v3 / v3 直通
// ═══════════════════════════════════════════════════════════

test('B1 v2 旧档迁移：profile.gold → currencies.gold，且不覆盖原档', async () => {
  const v2 = {
    schemaVersion: 2,
    savedAt: '2026-01-01T00:00:00.000Z',
    profile: { gold: 777, unlocks: ['intro'] },
    inventory: [],
    stash: [],
    settings: { sfx: false, music: false },
  };
  const raw = JSON.stringify(v2);
  const storage = createStorage({ [SAVE_MAIN_KEY]: raw });
  const loaded = await new LocalStorageSaveAdapter(storage).load();
  assert.equal(loaded.schemaVersion, 3);
  assert.equal(loaded.currencies.gold, 777, 'v2 profile.gold 唯一迁移项');
  assert.equal(loaded.settings.volumes.music, 1, 'v2 布尔音量按契约不迁移，重置为 1');
  assert.equal(storage.getItem(SAVE_MAIN_KEY), raw, '加载路径不写回原档');
});

test('B2 v3 直通：不经过迁移，字段原样返回', async () => {
  const save = fullSave();
  const storage = createStorage({ [SAVE_MAIN_KEY]: JSON.stringify(save) });
  const loaded = await new LocalStorageSaveAdapter(storage).load();
  assert.deepEqual(loaded, save);
});

// ═══════════════════════════════════════════════════════════
// C. 损坏隔离（L3）
// ═══════════════════════════════════════════════════════════

test('C1 损坏 JSON：隔离备份 + 默认档 + 不抛错 + 原档不被覆盖', async () => {
  const badRaw = '{ this is not json';
  const storage = createStorage({ [SAVE_MAIN_KEY]: badRaw });
  const adapter = new LocalStorageSaveAdapter(storage);
  let loaded;
  assert.doesNotThrow(() => {
    // loadSync 同步路径用于构造 CombatRuntime；load() 也不得抛错
    loaded = adapter.loadSync();
  });
  assert.equal(loaded.schemaVersion, 3);
  assert.equal(loaded.currencies.gold, 0);
  assert.equal(storage.getItem(SAVE_MAIN_KEY), badRaw, '原档绝不覆盖');
  assert.equal(storage.getItem(SAVE_CORRUPT_BACKUP_KEY), badRaw, '坏档原文隔离到 _corrupt_backup');
  await assert.doesNotReject(() => adapter.load());
});

test('C2 结构畸形 v3（非 JSON 语法错误）：同样隔离并回默认档', async () => {
  const malformed = JSON.stringify({ schemaVersion: 3, currencies: { gold: -1 }, weapons: null });
  const storage = createStorage({ [SAVE_MAIN_KEY]: malformed });
  const loaded = await new LocalStorageSaveAdapter(storage).load();
  assert.equal(loaded.currencies.gold, 0);
  assert.equal(storage.getItem(SAVE_MAIN_KEY), malformed);
  assert.equal(storage.getItem(SAVE_CORRUPT_BACKUP_KEY), malformed);
});

// ═══════════════════════════════════════════════════════════
// D. 写前临时键协议（L6b / L6c）
// ═══════════════════════════════════════════════════════════

test('D1 save_next 有效：优先恢复并提交主档、清理临时键', async () => {
  const main = freshSave((s) => { s.currencies.gold = 111; });
  const next = freshSave((s) => { s.currencies.gold = 888; });
  const storage = createStorage({
    [SAVE_MAIN_KEY]: JSON.stringify(main),
    [SAVE_NEXT_KEY]: JSON.stringify(next),
  });
  const loaded = await new LocalStorageSaveAdapter(storage).load();
  assert.equal(loaded.currencies.gold, 888, '有效临时键优先恢复');
  assert.equal(JSON.parse(storage.getItem(SAVE_MAIN_KEY)).currencies.gold, 888, '恢复后正式提交主档');
  assert.equal(storage.getItem(SAVE_NEXT_KEY), null, '临时键清理');
  assert.equal(storage.getItem(SAVE_CORRUPT_BACKUP_KEY), null, '有效临时键不应被隔离');
});

test('D2 save_next 损坏：回退 save_main，坏临时键被隔离且主档不动', async () => {
  const mainRaw = JSON.stringify(freshSave((s) => { s.currencies.gold = 777; }));
  const brokenNext = '{ truncated';
  const storage = createStorage({
    [SAVE_MAIN_KEY]: mainRaw,
    [SAVE_NEXT_KEY]: brokenNext,
  });
  const loaded = await new LocalStorageSaveAdapter(storage).load();
  assert.equal(loaded.currencies.gold, 777, '回退主档');
  assert.equal(storage.getItem(SAVE_MAIN_KEY), mainRaw, '主档未被覆盖');
  assert.equal(storage.getItem(SAVE_CORRUPT_BACKUP_KEY), brokenNext, '坏临时键隔离');
  assert.equal(storage.getItem(SAVE_NEXT_KEY), null);
});

test('D3 正常写入路径：save_next 写完即校验、覆盖主档后清理', async () => {
  const storage = createStorage();
  const adapter = new LocalStorageSaveAdapter(storage);
  const save = freshSave((s) => { s.currencies.gold = 4321; });
  await adapter.save(save);
  assert.equal(storage.getItem(SAVE_NEXT_KEY), null);
  assert.equal(JSON.parse(storage.getItem(SAVE_MAIN_KEY)).currencies.gold, 4321);
  assert.equal(storage.getItem(SAVE_CORRUPT_BACKUP_KEY), null);
});

// ═══════════════════════════════════════════════════════════
// E. 写失败与守门
// ═══════════════════════════════════════════════════════════

test('E1 配额写失败（QuotaExceededError）：主档完好、无临时键残留', async () => {
  const mainRaw = JSON.stringify(freshSave((s) => { s.currencies.gold = 777; }));
  const storage = createStorage({ [SAVE_MAIN_KEY]: mainRaw });
  storage.setItem = (key, value) => {
    if (key === SAVE_NEXT_KEY) {
      const err = new Error('quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    }
    storage.map.set(key, String(value));
  };
  const adapter = new LocalStorageSaveAdapter(storage);
  await assert.rejects(
    () => adapter.save(freshSave((s) => { s.currencies.gold = 999; })),
    /quota exceeded/,
  );
  assert.equal(storage.getItem(SAVE_MAIN_KEY), mainRaw, '主档完全未被触碰');
  assert.equal(storage.getItem(SAVE_NEXT_KEY), null);
});

test('E2 validateSaveV3 拒绝畸形档：不落盘、不产生临时键', async () => {
  const storage = createStorage();
  const adapter = new LocalStorageSaveAdapter(storage);
  const broken = freshSave((s) => { s.metaProgress.staffMastery = 99; });
  assert.ok(validateSaveV3(broken).length > 0, '冻结契约必须判为畸形');
  await assert.rejects(() => adapter.save(broken), /拒绝写入非法存档/);
  assert.equal(storage.getItem(SAVE_MAIN_KEY), null);
  assert.equal(storage.getItem(SAVE_NEXT_KEY), null);
});

// ═══════════════════════════════════════════════════════════
// F. SavePort v3 接口层 + 经济系统端到端落盘
// ═══════════════════════════════════════════════════════════

test('F1 SavePort v3 接口：load/save 走 V3，loadSync 可选，mock 与真后端同签名', async () => {
  const storage = createStorage();
  const adapter = new LocalStorageSaveAdapter(storage);
  for (const method of ['load', 'save', 'reset', 'loadSync']) {
    assert.equal(typeof adapter[method], 'function', `缺少 ${method}`);
  }

  const mock = new MockSaveAdapter();
  assert.equal(typeof mock.loadSync, 'function');
  assert.equal((await mock.load()).schemaVersion, 3, 'mock 后端同为 V3 载荷');

  // 桥退化为直传：不再产生 V2 外壳
  const bridge = new SavePortV3Bridge(adapter);
  const save = freshSave((s) => { s.currencies.gold = 55; });
  await bridge.save(save);
  assert.equal((await bridge.load()).currencies.gold, 55);
  assert.equal(JSON.parse(storage.getItem(SAVE_MAIN_KEY)).schemaVersion, 3, '落盘直接是 V3');
});

test('F2 EconomySystem + localStorage 真后端：结算落盘，重载后统计一致', async () => {
  const storage = createStorage();
  const adapter = new LocalStorageSaveAdapter(storage);
  const sys = new EconomySystem(
    new SavePortV3Bridge(adapter),
    createEventBus(),
    createMulberry32(1),
  );
  const boot = await sys.boot();
  // 后端首次加载即返回合法 v3 默认档，系统侧如实报 v3-loaded（非「无档」语义）。
  assert.equal(boot.source, 'v3-loaded');

  // EconomySystem 当前只认内部 onBossDefeated 标志（SettleRunInput.bossDefeated 未被消费）。
  sys.onBossDefeated(100);
  await sys.settleRun({ victory: true, bossDefeated: true, elapsedSec: 123.5 });
  assert.equal(sys.saveView.stats.runsPlayed, 1);
  assert.equal(sys.saveView.stats.bossKills, 1);
  assert.equal(sys.saveView.stats.bestTimeSec, 123.5);

  // 新实例模拟页面重载
  const reloaded = new EconomySystem(
    new SavePortV3Bridge(adapter),
    createEventBus(),
    createMulberry32(1),
  );
  const report = await reloaded.boot();
  assert.equal(report.source, 'v3-loaded');
  assert.equal(reloaded.saveView.stats.runsPlayed, 1);
  assert.equal(reloaded.saveView.stats.bossKills, 1);
  assert.equal(reloaded.saveView.stats.bestTimeSec, 123.5);
});

// ═══════════════════════════════════════════════════════════
// G. D-207 验收后续：运行时经济入账链闭环（DEF-001/002/003）
//    mock bus + mock storage，证明击杀→掉落→拾取→结算落盘的端到端可用性。
// ═══════════════════════════════════════════════════════════

const SHARD_ELEMENTS = ['fire', 'ice', 'lightning', 'shadow'];

function makeEconomy(adapter, seed = 42) {
  return new EconomySystem(
    new SavePortV3Bridge(adapter),
    createEventBus(),
    createMulberry32(seed),
  );
}

test('G1 击杀→掉落→拾取→结算落盘端到端：结算屏 4 类货币与宝石非零，重载一致', async () => {
  const adapter = new LocalStorageSaveAdapter(createStorage());
  const bus = createEventBus();
  const sys = new EconomySystem(new SavePortV3Bridge(adapter), bus, createMulberry32(42));
  await sys.boot();
  sys.beginRun();

  const publishedDrops = [];
  bus.subscribe('resource.dropped', (p) => publishedDrops.push(p));

  // boss 档在冻结 config 中金币/材料/碎片/宝石均为保底；四种元素各摇一次，覆盖全部碎片。
  for (const element of SHARD_ELEMENTS) {
    const { drops } = sys.rollDropsForKill({
      tier: 'boss', defId: 'riftWarden', element, pos: { x: 1, y: 0, z: 2 },
    });
    for (const d of drops) sys.pickup(d.dropId);
  }

  const loot = sys.runLootView;
  assert.ok(loot.gold > 0, '金币必须真实入账');
  assert.ok(loot.forestMaterial > 0, '森林材料必须真实入账');
  for (const element of SHARD_ELEMENTS) {
    assert.ok(loot.shards[element] > 0, `${element} 碎片必须真实入账`);
  }
  assert.ok(loot.gems.length > 0, '宝石必须真实入账');
  assert.ok(publishedDrops.length > 0, 'resource.dropped 必须发布给场景铺地面');

  // 结算屏消费的正是场景层发布的 run.settled.pickedResources，与账本同源。
  let settlementPayload = null;
  bus.subscribe('run.settled', (p) => { settlementPayload = p; });
  const report = await sys.settleRun({ victory: true, bossDefeated: true, elapsedSec: 123.5 });

  assert.equal(report.persisted, true);
  assert.deepEqual(report.credited, loot);
  assert.equal(settlementPayload.victory, true);
  assert.deepEqual(settlementPayload.pickedResources, loot, '结算屏数据源必须与本局账本逐字一致');
  assert.ok(settlementPayload.pickedResources.gold > 0);
  assert.ok(settlementPayload.pickedResources.gems.length > 0);
  assert.equal(report.forestCoreCredited, enemyConfig.bossReward.forestCore);
  assert.equal(report.bossKillsCredited, 1);

  // 新实例模拟页面重载：四类货币 + 宝石 + 统计全部来自真实落盘。
  const reloaded = makeEconomy(adapter);
  await reloaded.boot();
  const saved = reloaded.saveView;
  assert.equal(saved.currencies.gold, loot.gold);
  assert.equal(saved.currencies.forestMaterial, loot.forestMaterial);
  for (const element of SHARD_ELEMENTS) {
    assert.equal(saved.currencies.elementalShards[element], loot.shards[element]);
  }
  assert.equal(saved.currencies.forestCore, enemyConfig.bossReward.forestCore);
  assert.equal(saved.gemInventory.length, loot.gems.length);
  assert.equal(saved.stats.bossKills, 1);
  assert.equal(saved.stats.runsPlayed, 1);
});

test('G2 重复拾取只入账一次（dropId 唯一锚点 + picked 防重入）', async () => {
  const sys = makeEconomy(new LocalStorageSaveAdapter(createStorage()));
  await sys.boot();
  sys.beginRun();
  const { drops } = sys.rollDropsForKill({ tier: 'elite', element: 'fire' });
  assert.ok(drops.length >= 2);
  assert.equal(new Set(drops.map((d) => d.dropId)).size, drops.length, 'dropId 必须互异');

  const target = drops[0];
  assert.equal(sys.pickup(target.dropId).ok, true);
  const afterFirst = sys.runLootView;
  const second = sys.pickup(target.dropId);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already-picked');
  assert.deepEqual(sys.runLootView, afterFirst, '重复拾取不得改变账本');
  assert.equal(sys.ledgerView.pickedCount, 1);
  assert.equal(sys.registryView.onGround.length, drops.length - 1, '已拾取物不再在地面');
});

test('G3 bossDefeated 入参生效：无需 onBossDefeated 绕过，且 victory/false 不重复入账', async () => {
  const sys = makeEconomy(new LocalStorageSaveAdapter(createStorage()));
  await sys.boot();
  sys.beginRun();
  const report = await sys.settleRun({ victory: true, bossDefeated: true, elapsedSec: 90 });
  assert.equal(report.bossKillsCredited, 1, '仅凭入参即入账，删除场景层置位绕过');
  assert.equal(sys.bossKills, 1);
  assert.equal(sys.forestCore, enemyConfig.bossReward.forestCore);

  // 同一调用点同时传 true 与内部标志：仍是 1 次，不重复。
  const both = makeEconomy(new LocalStorageSaveAdapter(createStorage()));
  await both.boot();
  both.beginRun();
  assert.equal(both.onBossDefeated(10), true);
  const bothReport = await both.settleRun({ victory: true, bossDefeated: true });
  assert.equal(bothReport.bossKillsCredited, 1);
  assert.equal(both.bossKills, 1);

  // 明确未击败 Boss：不得入账森林核心 / bossKills。
  const none = makeEconomy(new LocalStorageSaveAdapter(createStorage()));
  await none.boot();
  none.beginRun();
  const noneReport = await none.settleRun({ victory: true, bossDefeated: false });
  assert.equal(noneReport.bossKillsCredited, 0);
  assert.equal(none.forestCore, 0);
});

test('G4 settleRun 配额写失败：不 reject、不 unhandled、主档完好且有 console.error 留痕', async () => {
  const mainRaw = JSON.stringify(freshSave((s) => { s.currencies.gold = 777; }));
  const storage = createStorage({ [SAVE_MAIN_KEY]: mainRaw });
  storage.setItem = (key, value) => {
    if (key === SAVE_NEXT_KEY) {
      const err = new Error('quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    }
    storage.map.set(key, String(value));
  };
  const sys = makeEconomy(new LocalStorageSaveAdapter(storage), 7);
  await sys.boot();
  sys.beginRun();
  const { drops } = sys.rollDropsForKill({ tier: 'boss', element: 'fire' });
  for (const d of drops) sys.pickup(d.dropId);

  const originalError = console.error;
  const errors = [];
  console.error = (...args) => { errors.push(args); };
  let report;
  try {
    // await 能返回即证明没有 unhandled rejection（异常已被 settleRun 内部吞掉）。
    report = await sys.settleRun({ victory: true, bossDefeated: true, elapsedSec: 100 });
  } finally {
    console.error = originalError;
  }

  assert.equal(report.persisted, false, '不得误报成功');
  assert.equal(report.forestCoreCredited, 0);
  assert.equal(report.bossKillsCredited, 0);
  assert.ok(errors.length > 0, '必须有 console.error 留痕');
  assert.equal(storage.getItem(SAVE_MAIN_KEY), mainRaw, '主档完全未被触碰');
  assert.equal(storage.getItem(SAVE_NEXT_KEY), null, '无临时键残留');
  assert.equal(sys.saveView.currencies.gold, 777, '内存态也不得假装入账');
  assert.equal(sys.saveView.stats.bossKills, 0);
});

// ═══════════════════════════════════════════════════════════
// H. DEF-006：Boss 掉落入账先于结算快照 + 防重（冻结事件形状不变）
//    复用真实 createEventBus，按「EconomySystem 先构造 → 胜利桥后订阅」复刻
//    BootstrapScene.ts 的订阅先后顺序；不经 Babylon / 场景层。
// ═══════════════════════════════════════════════════════════

/** 带显式 bus 的经济系统工厂（H 组需持有同一条 bus 模拟订阅顺序） */
function makeEconomyOnBus(bus, adapter, seed = 42) {
  return new EconomySystem(new SavePortV3Bridge(adapter), bus, createMulberry32(seed));
}

test('H1 事件顺序：boss.defeated 的 Boss 掉落入账先于结算快照（回归 DEF-006）', async () => {
  const adapter = new LocalStorageSaveAdapter(createStorage());
  const bus = createEventBus();
  // ① EconomySystem 先构造：构造时抢占第一个 boss.defeated 订阅（等价 BootstrapScene:339）
  const sys = makeEconomyOnBus(bus, adapter, 42);
  await sys.boot();
  sys.beginRun();

  const trace = [];
  bus.subscribe('resource.picked_up', (p) => {
    if (p.currencyId === 'gold') trace.push('boss-gold-credited');
  });
  // ② 模拟 BossCombatBridge + offPhase：胜利桥后订阅 boss.defeated，收到后经
  //    run.phaseChanged('victory') 触发 settleRun；快照在 settleRun 首个 await 前同步完成。
  bus.subscribe('boss.defeated', () => bus.publish('run.phaseChanged', { from: 'running', to: 'victory' }));
  let reportPromise = null;
  bus.subscribe('run.phaseChanged', (p) => {
    if (p.to === 'victory') {
      trace.push('settlement-snapshot');
      reportPromise = sys.settleRun({ victory: true, bossDefeated: true, elapsedSec: 600 });
    }
  });

  // ③ VictorySettler 发一次 boss.defeated（事件形状未变：{ atSec }）
  bus.publish('boss.defeated', { atSec: 600 });

  assert.deepEqual(trace, ['boss-gold-credited', 'settlement-snapshot'],
    '必须先入账 Boss 掉落再触发结算快照；顺序反了即回到 DEF-006');

  const report = await reportPromise;
  assert.equal(report.persisted, true);
  assert.ok(report.credited.gold > 0, '结算报告 credited.gold 必须含 Boss 掉落');
  assert.ok(report.credited.forestMaterial > 0, '结算报告 credited.forestMaterial 必须含 Boss 掉落');
  assert.ok(SHARD_ELEMENTS.reduce((n, e) => n + report.credited.shards[e], 0) > 0,
    '结算报告必须含 Boss 碎片');
  assert.ok(report.credited.gems.length > 0, '结算报告必须含 Boss 宝石');
  assert.equal(report.forestCoreCredited, enemyConfig.bossReward.forestCore);
  assert.equal(report.bossKillsCredited, 1);
});

test('H2 Boss 掉落进本局结算与存档：四类货币非零，重载一致', async () => {
  const adapter = new LocalStorageSaveAdapter(createStorage());
  const bus = createEventBus();
  const sys = makeEconomyOnBus(bus, adapter, 7);
  await sys.boot();
  sys.beginRun();
  const before = structuredClone(sys.saveView);

  // 直接触发真实胜利事件（等价 VictorySettler.settle 发到 combat.bus）
  bus.publish('boss.defeated', { atSec: 600 });
  const loot = sys.runLootView;
  assert.ok(loot.gold > 0, 'Boss 金币已入本局账本');
  assert.ok(loot.forestMaterial > 0, 'Boss 材料已入本局账本');
  assert.ok(SHARD_ELEMENTS.reduce((n, e) => n + loot.shards[e], 0) > 0, 'Boss 碎片已入本局账本');
  assert.ok(loot.gems.length > 0, 'Boss 宝石已入本局账本');

  const report = await sys.settleRun({ victory: true, bossDefeated: true, elapsedSec: 612.5 });
  assert.equal(report.persisted, true);
  assert.deepEqual(report.credited, loot, '结算入账与结算前账本同源');

  const reloaded = makeEconomy(adapter);
  await reloaded.boot();
  const saved = reloaded.saveView;
  assert.equal(saved.currencies.gold, before.currencies.gold + loot.gold);
  assert.equal(saved.currencies.forestMaterial, before.currencies.forestMaterial + loot.forestMaterial);
  for (const e of SHARD_ELEMENTS) {
    assert.equal(saved.currencies.elementalShards[e], before.currencies.elementalShards[e] + loot.shards[e]);
  }
  assert.equal(saved.gemInventory.length, before.gemInventory.length + loot.gems.length);
  assert.equal(saved.currencies.forestCore, enemyConfig.bossReward.forestCore, '森林核心仍单独入账');
  assert.equal(saved.stats.bossKills, 1);
  assert.equal(saved.stats.bestTimeSec, 612.5);
});

test('H3 防重：多次 boss.defeated 只入账一次 Boss 掉落', async () => {
  const adapter = new LocalStorageSaveAdapter(createStorage());
  const bus = createEventBus();
  const sys = makeEconomyOnBus(bus, adapter, 42);
  await sys.boot();
  sys.beginRun();

  bus.publish('boss.defeated', { atSec: 600 });
  const afterFirst = sys.runLootView;
  const pickedFirst = sys.ledgerView.pickedCount;
  assert.ok(afterFirst.gold > 0);
  assert.ok(pickedFirst > 0);

  // 事件重放 2 次：bossDropsCredited 守卫 + ledger.pickedIds 兜底，账本不再变化
  bus.publish('boss.defeated', { atSec: 600 });
  bus.publish('boss.defeated', { atSec: 601 });
  assert.deepEqual(sys.runLootView, afterFirst, '重复 boss.defeated 不得重复入账');
  assert.equal(sys.ledgerView.pickedCount, pickedFirst);

  // onBossDefeated 自身每局只登记一次（其经 economyBus 发布被吞，不改变账本）
  assert.equal(sys.onBossDefeated(600), true);
  assert.equal(sys.onBossDefeated(600), false, '每局只登记一次');
  assert.deepEqual(sys.runLootView, afterFirst);

  const report = await sys.settleRun({ victory: true, bossDefeated: true, elapsedSec: 600 });
  assert.deepEqual(report.credited, afterFirst, '结算只记入一批 Boss 掉落');
  assert.equal(report.bossKillsCredited, 1);
});
