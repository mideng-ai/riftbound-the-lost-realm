/**
 * TASK-02 玩家实体 · 双武器 · 局内升级 —— 自动化验收测试。
 *
 * 编译链与既有契约测试一致：tsc -p tsconfig.test.json → .testbuild/（CommonJS）
 * → tests/prepare.cjs 标记 CJS → node:test 直接 require 编译产物。
 *
 * 覆盖：三层锚点 24.26592 / DPS 48.53184、扇形边界（正 60° / 2.5m 整）、
 * 双武器独立 CD 与独立 Lv、快速切换、0.5s 无敌帧、Dash 3.5m·0.15s·CD1.5s·不无敌、
 * 升级冻结时钟、3 选 1 恒 3 张不重复 + scope 过滤、强化经 Economy 接口、
 * 唯一伤害出口、armorBreak 不进 C 区（R-01）、XP 曲线、击杀经验、端到端战斗循环。
 */
'use strict';

import { createRequire } from 'node:module';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);

// ── 领域契约（只读引用，用于核对配置与派生值）──
const domain = require('../.testbuild/domain/index.js');
const playerConfigMod = require('../.testbuild/config/playerConfig.js');
const damageConfigMod = require('../.testbuild/config/damageConfig.js');
const upgradePoolMod = require('../.testbuild/config/upgradePoolConfig.js');
const enemyConfigMod = require('../.testbuild/config/enemyConfig.js');

// ── TASK-02 新增模块 ──
const { PlayerEntity, normalizeDeg, tickStatusSlots } = require('../.testbuild/player/PlayerEntity.js');
const { WeaponSystem } = require('../.testbuild/weapons/WeaponSystem.js');
const { StaticWeaponLevelPort, DENY_UPGRADE_ECONOMY } = require('../.testbuild/weapons/types.js');
const { buildStaffAttack, pierceTargetCount, staffProjectileAngles } = require('../.testbuild/weapons/staffWeapon.js');
const { buildSwordAttack } = require('../.testbuild/weapons/swordWeapon.js');
const {
  sectorHitsCircle,
  shortestAngleDeltaDeg,
  pointSegmentDistanceXZ,
  segmentHitsCircleXZ,
} = require('../.testbuild/combat/HitDetection.js');
const { CombatResolver } = require('../.testbuild/combat/CombatResolver.js');
const { TargetRegistry, makeEnemyTarget } = require('../.testbuild/combat/TargetRegistry.js');
const { ProjectileSystem } = require('../.testbuild/combat/ProjectileSystem.js');
const { CombatRuntime } = require('../.testbuild/combat/CombatRuntime.js');
const { RunProgression, takenTierCount } = require('../.testbuild/progression/RunProgression.js');

const {
  createEventBus,
  createMulberry32,
  deriveMaxHp,
  forestSurvivalPctOfLevel,
  masteryPctOfLevel,
  defaultSaveV3,
  xpToNextLevel,
  rebuildDamageLayers,
  computeShotDamage,
  baseWeaponDamage,
  playerDefinition,
  dashSpeedMps,
  dashCooldownSec,
  weaponIntervalSec,
  allUpgradeCards,
  rollUpgradeChoices,
  cardToBuffEntry,
  upgradeCard,
  canTransition,
  normalEnemyDefinition,
  bossDefinition,
} = domain;

const { playerConfig } = playerConfigMod;
const { damageConfig } = damageConfigMod;
const { upgradePoolConfig } = upgradePoolMod;
const { enemyConfig } = enemyConfigMod;
const caps = damageConfig.caps;

function closeTo(actual, expected, tol = 1e-3, msg = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg} 期望 ≈ ${expected}，实际 ${actual}（偏差 ${Math.abs(actual - expected)} > ${tol}）`,
  );
}

/** 空 buff 的基准三层快照。 */
function baseLayers(buffs = []) {
  return rebuildDamageLayers(
    { weaponUpgradePct: 0, masteryPct: 0 },
    { entries: [] },
    buffs,
    caps,
  );
}

/** 满配锚点：A=1.57 / B=1.288 / C=1.5。 */
function anchorOutrun() {
  return {
    weaponUpgradePct: 0.32,
    masteryPct: 0.25,
    gemEntries: [{ gemId: 'power', basePct: 0.06, qualityMult: 2.4, repeatMult: 2.0 }],
  };
}

function anchorBuffs() {
  return [{ buffId: 'heavyShot', category: 'damage', pct: 0.5 }];
}

// ═══════════════════════════════════════════════════════════
// 1. 三层乘区锚点（唯一伤害出口）
// ═══════════════════════════════════════════════════════════
describe('TASK-02 / A1 三层乘区锚点 24.26592 / DPS 48.53184', () => {
  test('CombatResolver.rebuild 得到 A=1.57 / B=1.288 / C=1.5', () => {
    const r = new CombatResolver();
    const layers = r.rebuild(anchorOutrun(), anchorBuffs());
    closeTo(layers.A, 1.57, 1e-9, 'A 区');
    closeTo(layers.B, 1.288, 1e-9, 'B 区');
    closeTo(layers.C, 1.5, 1e-9, 'C 区');
    assert.equal(r.caps, caps, 'caps 必须来自 config，不得自带常量');
  });

  test('法杖单发 = 24.26592，DPS = 48.53184（÷ 0.5s）', () => {
    const r = new CombatResolver();
    r.rebuild(anchorOutrun(), anchorBuffs());
    const shot = r.shotDamage('staff');
    closeTo(shot, 24.26592, 1e-4, '单发伤害');
    closeTo(shot / playerConfig.staff.intervalSec, 48.53184, 1e-2, 'DPS');
  });

  test('唯一出口：resolveHit 对普通怪结算 24.26592，totalHits 递增', () => {
    const r = new CombatResolver();
    r.rebuild(anchorOutrun(), anchorBuffs());
    const res = r.resolveHit({
      weaponId: 'staff',
      targetId: 7,
      hitPos: { x: 1, y: 0, z: 0 },
      targetHp: 1000,
      targetTier: 'normal',
    });
    closeTo(res.dealt, 24.26592, 1e-4, 'dealt');
    assert.equal(res.targetId, 7);
    assert.equal(res.killed, false);
    assert.equal(r.totalHits, 1, '所有伤害都经过本结算器');
  });

  test('armorBreak 不进 C 区（R-01）；破甲只对 elite / boss 生效', () => {
    const r = new CombatResolver();
    const buffs = [
      { buffId: 'heavyShot', category: 'damage', pct: 0.5 },
      { buffId: 'armorBreak', category: 'armorBreak', pct: 0.5 },
    ];
    const layers = r.rebuild(anchorOutrun(), buffs);
    closeTo(layers.C, 1.5, 1e-9, 'C 区不得被破甲污染');
    closeTo(layers.armorBreakBonus, 0.5, 1e-9, '破甲独立派生');

    const normal = r.resolveHit({ weaponId: 'sword', targetId: 1, hitPos: { x: 0, y: 0, z: 0 }, targetHp: 1000, targetTier: 'normal' });
    const elite = r.resolveHit({ weaponId: 'sword', targetId: 2, hitPos: { x: 0, y: 0, z: 0 }, targetHp: 1000, targetTier: 'elite' });
    const boss = r.resolveHit({ weaponId: 'sword', targetId: 3, hitPos: { x: 0, y: 0, z: 0 }, targetHp: 1000, targetTier: 'boss' });
    const panel = computeShotDamage(baseWeaponDamage('sword'), layers);
    closeTo(normal.dealt, panel, 1e-6, '普通怪不吃破甲');
    closeTo(elite.dealt, panel * 1.5, 1e-6, '精英 ×1.5');
    closeTo(boss.dealt, panel * 1.5, 1e-6, 'Boss ×1.5');
  });

  test('分裂弹 ×0.6^extra 摊薄 + 穿透 ×0.7^depth', () => {
    const r = new CombatResolver();
    const buffs = [
      { buffId: 'splitShot', category: 'projectileCount', pct: 3 },
      { buffId: 'heavyShot', category: 'damage', pct: 0.5 },
    ];
    const layers = r.rebuild(anchorOutrun(), buffs);
    assert.equal(layers.projectileCount, 3);
    closeTo(r.shotDamage('staff'), 24.26592 * 0.6 * 0.6, 1e-4, '单弹摊薄');
    const pierced = r.resolveHit({ weaponId: 'staff', targetId: 1, hitPos: { x: 0, y: 0, z: 0 }, targetHp: 1000, targetTier: 'normal', pierceDepth: 1 });
    closeTo(pierced.dealt, 24.26592 * 0.36 * damageConfig.pierce.dmgMultPerTarget, 1e-4, '穿透衰减');
  });
});

// ═══════════════════════════════════════════════════════════
// 2. 玩家实体：HP / 无敌帧 / Dash / 状态槽
// ═══════════════════════════════════════════════════════════
describe('TASK-02 / A2 玩家实体', () => {
  const makePlayer = (maxHp = deriveMaxHp(0, forestSurvivalPctOfLevel(0))) =>
    new PlayerEntity({ entityId: 1, spawnPos: { x: 0, y: 0, z: 0 }, maxHp, bus: createEventBus() });

  test('maxHp 由 deriveMaxHp 派生；森林生存 Lv10 = 115（D-08 里程碑 15%）', () => {
    closeTo(forestSurvivalPctOfLevel(10), 0.15, 1e-12);
    closeTo(deriveMaxHp(0, forestSurvivalPctOfLevel(10)), 115, 1e-9);
    const p = new PlayerEntity({
      entityId: 1,
      spawnPos: { x: 0, y: 0, z: 0 },
      maxHp: deriveMaxHp(0, forestSurvivalPctOfLevel(10)),
      bus: createEventBus(),
    });
    closeTo(p.maxHp, 115, 1e-9, '契约保留浮点精度，不做取整');
    assert.equal(p.runtime.currentWeapon, 'staff', '默认起手法杖');
  });

  test('受击扣血并广播 player.damaged；0.5s 无敌帧内二次受击为 0', () => {
    const bus = createEventBus();
    const damaged = [];
    bus.subscribe('player.damaged', (e) => damaged.push(e));
    const p = new PlayerEntity({ entityId: 1, spawnPos: { x: 0, y: 0, z: 0 }, maxHp: 100, bus });
    const layers = baseLayers();
    assert.equal(p.takeDamage(10, layers, 'environment', 0), 10);
    assert.equal(p.hp, 90);
    assert.equal(p.takeDamage(10, layers, 'environment', 0.01), 0, '无敌帧内免伤');
    assert.equal(p.hp, 90);
    closeTo(p.invulnRemainingSec, playerConfig.base.hitInvulnSec, 1e-12);
    p.tick(playerConfig.base.hitInvulnSec);
    assert.equal(p.takeDamage(10, layers, 'environment', 0.6), 10, '无敌帧结束后可再受击');
    assert.equal(p.hp, 80);
    assert.equal(damaged.length, 2);
    assert.equal(damaged[0].hpLeft, 90);
  });

  test('石肤 #12：damageTakenMul 生效（10 点原始伤害只扣 8）', () => {
    const p = makePlayer();
    const layers = baseLayers([{ buffId: 'stoneSkin', category: 'damageTaken', pct: 0.2 }]);
    closeTo(layers.damageTakenMul, 0.8, 1e-9);
    assert.equal(p.takeDamage(10, layers, 'environment', 0), 8);
    assert.equal(p.hp, 92);
  });

  test('死亡广播 player.died 且后续受击/回血无效', () => {
    const bus = createEventBus();
    let diedAt = null;
    bus.subscribe('player.died', (e) => { diedAt = e.atSec; });
    const p = new PlayerEntity({ entityId: 1, spawnPos: { x: 0, y: 0, z: 0 }, maxHp: 100, bus });
    p.takeDamage(1000, baseLayers(), 'environment', 3.5);
    assert.equal(p.isDead, true);
    assert.equal(diedAt, 3.5);
    assert.equal(p.takeDamage(10, baseLayers(), 'environment', 4), 0);
    assert.equal(p.heal(50), 0);
  });

  test('Dash：3.5m / 0.15s / CD 1.5s，冲刺期间不无敌', () => {
    const p = makePlayer();
    const layers = baseLayers();
    assert.equal(p.tryDash(1, 0, layers), true);
    closeTo(p.runtime.dashActiveTimerSec, playerConfig.dash.durationSec, 1e-12);
    closeTo(p.dashCooldownRemainingSec, dashCooldownSec(1), 1e-12);
    closeTo(dashCooldownSec(1), playerConfig.dash.cooldownSec, 1e-12);
    assert.equal(p.invulnRemainingSec, 0, '冲刺不赋予无敌帧（config.dash.invulnSec = 0）');

    p.stepDash(playerConfig.dash.durationSec);
    closeTo(p.runtime.transform.position.x, playerConfig.dash.distanceM, 1e-9, '总位移精确 3.5m');
    closeTo(p.runtime.transform.position.z, 0, 1e-9);
    assert.equal(p.tryDash(1, 0, layers), false, 'CD 未就绪不能再冲');
    p.tick(playerConfig.dash.cooldownSec);
    assert.equal(p.tryDash(0, 1, layers), true, 'CD 结束后可再冲');
  });

  test('Dash 速度 = distanceM / durationSec（domain.dashSpeedMps）', () => {
    closeTo(dashSpeedMps(), playerConfig.dash.distanceM / playerConfig.dash.durationSec, 1e-9);
  });

  test('移动按 moveSpeedMul 派生；斜向不超速；状态槽计时到期清层', () => {
    const p = makePlayer();
    const layers = baseLayers([{ buffId: 'swiftStep', category: 'moveSpeed', pct: 0.2 }]);
    p.move(1, 1, 1, layers.moveSpeedMul);
    closeTo(p.runtime.transform.position.x, playerConfig.base.moveSpeedMps * 1.2 / Math.SQRT2, 1e-9);
    closeTo(p.runtime.transform.position.z, playerConfig.base.moveSpeedMps * 1.2 / Math.SQRT2, 1e-9);
    p.runtime.statusSlots.burnStacks = 2;
    p.runtime.statusSlots.burnTimerSec = 0.3;
    tickStatusSlots(p.runtime.statusSlots, 0.5);
    assert.equal(p.runtime.statusSlots.burnStacks, 0);
    assert.equal(p.runtime.statusSlots.burnTimerSec, 0);
  });

  test('normalizeDeg 归一化到 [0,360)', () => {
    assert.equal(normalizeDeg(-90), 270);
    assert.equal(normalizeDeg(450), 90);
  });
});

// ═══════════════════════════════════════════════════════════
// 3. 命中几何：扇形边界 / 扫掠
// ═══════════════════════════════════════════════════════════
describe('TASK-02 / A3 扇形与扫掠判定', () => {
  const origin = { x: 0, z: 0 };
  const arc = playerConfig.sword.arcAngleDeg; // 120
  const radius = playerConfig.sword.radiusM; // 2.5

  test('魔法剑形状 CONFIRMED：120° / 2.5m 来自 config，未被改写', () => {
    assert.equal(arc, 120);
    assert.equal(radius, 2.5);
    const req = buildSwordAttack({ x: 0, y: 0, z: 0 }, 0, baseLayers());
    assert.equal(req.kind, 'sword');
    assert.equal(req.arcAngleDeg, 120);
    assert.equal(req.radiusM, 2.5);
    closeTo(req.damage, baseWeaponDamage('sword'), 1e-9);
  });

  test('正前方命中；正 60° 边界命中；61° 不命中', () => {
    const at = (deg, d) => ({ x: Math.cos((deg * Math.PI) / 180) * d, z: Math.sin((deg * Math.PI) / 180) * d });
    assert.equal(sectorHitsCircle(origin, 0, arc, radius, at(0, 2), 0), true);
    assert.equal(sectorHitsCircle(origin, 0, arc, radius, at(60, 2), 0), true, '正 60° 边界');
    assert.equal(sectorHitsCircle(origin, 0, arc, radius, at(61, 2), 0), false);
    assert.equal(sectorHitsCircle(origin, 0, arc, radius, at(-60, 2), 0), true);
    assert.equal(sectorHitsCircle(origin, 0, arc, radius, at(-61, 2), 0), false);
  });

  test('2.5m 整命中，超过则不命中；目标半径补偿贴边怪', () => {
    assert.equal(sectorHitsCircle(origin, 0, arc, radius, { x: 2.5, z: 0 }, 0), true, '2.5m 整');
    assert.equal(sectorHitsCircle(origin, 0, arc, radius, { x: 2.51, z: 0 }, 0), false);
    // 目标有半径时，中心略超出半径仍可命中
    assert.equal(sectorHitsCircle(origin, 0, arc, radius, { x: 2.7, z: 0 }, 0.3), true);
    // 略超角度但目标张角覆盖
    assert.equal(sectorHitsCircle(origin, 0, arc, radius, { x: 2, z: 0 }, 0) === false, false);
  });

  test('arcExtend #10 派生：base 120 + buff，最终 cap 240 生效', () => {
    const layers = baseLayers([{ buffId: 'arcExtend', category: 'arcAngle', pct: 400 }]);
    assert.equal(layers.arcAngleDeg, caps.arcAngleDegCap, '不得超过 240°');
    const req = buildSwordAttack({ x: 0, y: 0, z: 0 }, 0, layers);
    assert.equal(req.arcAngleDeg, 240);
  });

  test('最短角差与线段扫掠（防止高速弹穿模）', () => {
    closeTo(shortestAngleDeltaDeg(350, 10), 20, 1e-9);
    closeTo(shortestAngleDeltaDeg(10, 350), -20, 1e-9);
    closeTo(pointSegmentDistanceXZ({ x: 1, z: 1 }, { x: 0, z: 0 }, { x: 2, z: 0 }), 1, 1e-9);
    assert.equal(segmentHitsCircleXZ({ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 2, z: 0.4 }, 0.5), true);
    assert.equal(segmentHitsCircleXZ({ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 2, z: 1.4 }, 0.5), false);
  });
});

// ═══════════════════════════════════════════════════════════
// 4. 双武器：独立 CD / 独立 Lv / 快速切换 / Economy
// ═══════════════════════════════════════════════════════════
describe('TASK-02 / A4 双武器独立状态', () => {
  const makeWeapons = (levels = { staff: 1, sword: 1 }, economy = undefined) => {
    const bus = createEventBus();
    const runtimePlayer = new PlayerEntity({ entityId: 1, spawnPos: { x: 0, y: 0, z: 0 }, maxHp: 100, bus });
    const ws = new WeaponSystem({
      runtime: runtimePlayer.runtime,
      levelPort: new StaticWeaponLevelPort(levels),
      bus,
      economy,
    });
    return { ws, bus, runtimePlayer };
  };

  test('两把武器 Lv 互不覆盖；A 区强化加成按表取该级总值', () => {
    const { ws } = makeWeapons({ staff: 5, sword: 1 });
    assert.equal(ws.levelOf('staff'), 5);
    assert.equal(ws.levelOf('sword'), 1);
    closeTo(ws.weaponUpgradePct('staff'), playerConfig.weaponUpgradePctByLevel[4], 1e-12);
    closeTo(ws.weaponUpgradePct('sword'), playerConfig.weaponUpgradePctByLevel[0], 1e-12);
    closeTo(ws.weaponUpgradePct('staff'), 0.32, 1e-12);
  });

  test('两把武器 CD 完全独立：切换不重置、不互相清零', () => {
    const { ws } = makeWeapons();
    const layers = baseLayers();
    const staff = ws.tryAttack(layers, []);
    assert.equal(staff.kind, 'staff');
    closeTo(ws.stateOf('staff').cooldownSec, weaponIntervalSec('staff', 1), 1e-12);
    assert.equal(ws.stateOf('sword').cooldownSec, 0, '剑 CD 未被法杖攻击影响');

    ws.switchWeapon();
    assert.equal(ws.current, 'sword');
    assert.ok(ws.stateOf('staff').cooldownSec > 0, '切回来时法杖 CD 仍在');

    const sword = ws.tryAttack(layers, []);
    assert.equal(sword.kind, 'sword');
    closeTo(ws.stateOf('sword').cooldownSec, weaponIntervalSec('sword', 1), 1e-12);
    ws.tick(weaponIntervalSec('staff', 1));
    closeTo(ws.stateOf('staff').cooldownSec, 0, 1e-12);
    assert.ok(ws.stateOf('sword').cooldownSec > 0, '剑 CD 独立递减未被提前清零');
  });

  test('快速切换广播 weapon.switched {from,to}，且即时可来回切', () => {
    const { ws, bus } = makeWeapons();
    const events = [];
    bus.subscribe('weapon.switched', (e) => events.push(e));
    ws.switchWeapon();
    ws.switchWeapon();
    assert.deepEqual(events, [
      { from: 'staff', to: 'sword' },
      { from: 'sword', to: 'staff' },
    ]);
  });

  test('攻击间隔走 domain.weaponIntervalSec（含 intervalMul 夹取）', () => {
    const { ws } = makeWeapons();
    const layers = baseLayers([{ buffId: 'chargeHaste', category: 'interval', pct: 0.5 }]);
    closeTo(layers.intervalMul, 1 - caps.intervalReductionPct, 1e-9, '−40% 上限');
    closeTo(ws.intervalSec('staff', layers), playerConfig.staff.intervalSec * 0.6, 1e-9);
    closeTo(ws.intervalSec('sword', layers), playerConfig.sword.intervalSec * 0.6, 1e-9);
  });

  test('强化消费通过 Economy 接口；未批准不得白嫖；批准只升指定武器', () => {
    const charges = [];
    const economy = {
      chargeUpgrade: (weaponId, fromLevel) => {
        charges.push({ weaponId, fromLevel });
        return true;
      },
    };
    const { ws, bus } = makeWeapons({ staff: 1, sword: 1 }, economy);
    const upgraded = [];
    bus.subscribe('weapon.upgraded', (e) => upgraded.push(e));

    assert.equal(ws.requestUpgrade('staff'), true);
    assert.equal(ws.levelOf('staff'), 2);
    assert.equal(ws.levelOf('sword'), 1, '剑等级不受影响');
    assert.deepEqual(charges, [{ weaponId: 'staff', fromLevel: 1 }]);
    assert.deepEqual(upgraded, [{ weaponId: 'staff', level: 2 }]);

    // 未接 Economy（拒绝实现）时不得升级
    const { ws: denied } = makeWeapons({ staff: 1, sword: 1 }, DENY_UPGRADE_ECONOMY);
    assert.equal(denied.requestUpgrade('staff'), false);
    assert.equal(denied.levelOf('staff'), 1);
  });

  test('Lv5 封顶：满级后 requestUpgrade 返回 false 且不调用 Economy', () => {
    let calls = 0;
    const { ws } = makeWeapons({ staff: 5, sword: 1 }, { chargeUpgrade: () => { calls++; return true; } });
    assert.equal(ws.requestUpgrade('staff'), false);
    assert.equal(calls, 0);
  });

  test('法杖：弹速 14、分裂弹数来自 layers、穿透数来自 pierce buff', () => {
    const layers = baseLayers([{ buffId: 'splitShot', category: 'projectileCount', pct: 3 }]);
    const buffs = [
      { buffId: 'splitShot', category: 'projectileCount', pct: 3 },
      { buffId: 'pierceShot', category: 'pierce', pct: 2 },
    ];
    const req = buildStaffAttack({ x: 0, y: 0, z: 0 }, 0, layers, buffs);
    assert.equal(req.kind, 'staff');
    assert.equal(req.projectileCount, 3);
    assert.equal(req.speedMps, playerConfig.staff.projectileSpeedMps);
    assert.equal(req.pierceTargets, 2);
    closeTo(req.damagePerShot, baseWeaponDamage('staff') * 0.36, 1e-9, '3 弹摊薄');
    assert.equal(pierceTargetCount(buffs), 2);
    assert.deepEqual(staffProjectileAngles(3, 10), [-10, 0, 10]);
  });
});

// ═══════════════════════════════════════════════════════════
// 5. 目标注册表 / 逻辑投射物
// ═══════════════════════════════════════════════════════════
describe('TASK-02 / A5 目标与投射物', () => {
  test('普通怪 HP/半径/经验从 config 派生（Q-NEW-3：xpValue=20）', () => {
    const def = normalEnemyDefinition('riftHound');
    assert.equal(def.xpValue, enemyConfig.normals.riftHound.xpValue);
    assert.equal(def.xpValue, 20);
    const t = makeEnemyTarget('riftHound', { x: 2, y: 0, z: 0 }, 1, 0);
    assert.equal(t.maxHp, def.baseHp); // 0s 阶段 hpScale = 1
    assert.equal(t.xpValue, 20);
    assert.equal(t.tier, 'normal');
  });

  test('Boss 经验 500 / HP 6000，档位 boss', () => {
    const boss = bossDefinition();
    assert.equal(boss.xpValue, 500);
    assert.equal(boss.baseHp, 6000);
    const t = makeEnemyTarget('riftWarden', { x: 3, y: 0, z: 0 }, 9, 0);
    assert.equal(t.tier, 'boss');
    assert.equal(t.xpValue, 500);
  });

  test('击杀：applyDamage 致死返回击杀信息并广播 enemy.killed（drops 形状完整）', () => {
    const bus = createEventBus();
    const killed = [];
    bus.subscribe('enemy.killed', (e) => killed.push(e));
    const reg = new TargetRegistry(bus);
    const t = reg.spawn('riftHound', { x: 2, y: 0, z: 0 }, 0);
    assert.equal(reg.aliveCount, 1);
    assert.equal(reg.applyDamage(t.entityId, 5, 1), null, '未致死返回 null');
    closeTo(t.hp, t.maxHp - 5, 1e-9);
    const kill = reg.applyDamage(t.entityId, 1000, 2);
    assert.equal(kill.xpValue, 20);
    assert.equal(kill.defId, 'riftHound');
    assert.equal(reg.aliveCount, 0);
    assert.equal(killed.length, 1);
    assert.equal(killed[0].atSec, 2);
    assert.deepEqual(killed[0].drops, []);
  });

  test('投射物扫掠命中 + 穿透计数 + 每穿衰减 depth', () => {
    const sys = new ProjectileSystem({ spreadDeg: 0 });
    const req = buildStaffAttack(
      { x: 0, y: 0, z: 0 },
      0,
      baseLayers(),
      [{ buffId: 'pierceShot', category: 'pierce', pct: 1 }],
    );
    assert.equal(sys.launchStaff(req), 1);
    const targets = [
      { entityId: 10, defId: 'riftHound', tier: 'normal', radiusM: 0.45, xpValue: 20, hp: 100, maxHp: 100, position: { x: 2, y: 0, z: 0 }, alive: true },
      { entityId: 11, defId: 'riftHound', tier: 'normal', radiusM: 0.45, xpValue: 20, hp: 100, maxHp: 100, position: { x: 4, y: 0, z: 0 }, alive: true },
    ];
    const hits = [];
    // 14 m/s × 0.3s = 4.2m，一帧扫过两个目标
    sys.step(0.3, targets, (h) => hits.push(h));
    assert.equal(hits.length, 2, '穿透命中两个目标');
    assert.equal(hits[0].pierceDepth, 0);
    assert.equal(hits[1].pierceDepth, 1);
    assert.equal(sys.liveCount, 0, '穿透用尽后销毁');
  });
});

// ═══════════════════════════════════════════════════════════
// 6. 局内升级：XP 曲线 / 冻结 / 3 选 1 / buff 写入
// ═══════════════════════════════════════════════════════════
describe('TASK-02 / A6 局内升级', () => {
  const makeProg = (weapon = 'staff') => {
    const bus = createEventBus();
    let rebuilds = 0;
    let mul = 1;
    const p = new RunProgression({
      bus,
      rng: createMulberry32(42),
      currentWeapon: () => weapon,
      xpGainMul: () => mul,
      onRebuild: () => { rebuilds++; },
    });
    return { p, bus, rebuilds: () => rebuilds, setMul: (v) => { mul = v; } };
  };

  test('XP 曲线以公式为准：L1–L10 = [40,102,176,260,351,449,553,663,777,895]', () => {
    assert.deepEqual(
      Array.from({ length: 10 }, (_, i) => xpToNextLevel(i + 1)),
      [40, 102, 176, 260, 351, 449, 553, 663, 777, 895],
    );
    assert.equal(upgradePoolConfig.xpCurve.maxRunLevel, 10);
  });

  test('3 选 1 恒 3 张、不重复、scope 按当前武器过滤', () => {
    const rng = createMulberry32(7);
    for (let seed = 0; seed < 20; seed++) {
      rng.restore(seed + 1);
      const choices = rollUpgradeChoices(rng, [], { currentWeapon: 'staff', level: 2 });
      assert.equal(choices.length, upgradePoolConfig.choicesPerLevel);
      assert.equal(new Set(choices.map((c) => c.id)).size, 3, '无放回、不重复');
      assert.ok(choices.every((c) => c.scope !== 'sword'), '法杖时不得出现剑专属卡');
    }
    const swordChoices = rollUpgradeChoices(createMulberry32(3), [], { currentWeapon: 'sword', level: 2 });
    assert.ok(swordChoices.every((c) => c.scope !== 'staff'), '剑时不得出现法杖专属卡');
    assert.equal(allUpgradeCards().length, 15);
  });

  test('升级 → running→upgradePick → 时钟冻结（含 Boss 预警）+ offered 广播', () => {
    const { p, bus } = makeProg();
    const offered = [];
    const leveled = [];
    const phases = [];
    bus.subscribe('upgrade.offered', (e) => offered.push(e));
    bus.subscribe('player.leveledUp', (e) => leveled.push(e));
    bus.subscribe('run.phaseChanged', (e) => phases.push(e));

    p.advanceClock(1.0);
    const before = p.clock.elapsedSec;
    closeTo(before, 1.0, 1e-9);

    p.gainXp(xpToNextLevel(1)); // 40 → Lv2
    assert.equal(p.level, 2);
    assert.equal(p.phase, 'upgradePick');
    assert.equal(p.clock.frozen, true);
    assert.equal(p.choices.length, 3);
    assert.deepEqual(leveled, [{ level: 2 }]);
    assert.deepEqual(phases, [{ from: 'running', to: 'upgradePick' }]);
    assert.equal(offered.length, 1);
    assert.equal(offered[0].choices.length, 3);

    // 冻结期间时钟不推进（phaseProvider + freeze 双保险）
    p.advanceClock(600);
    closeTo(p.clock.elapsedSec, before, 1e-9, '选卡期间含 Boss 预警计时全部冻结');
    assert.equal(p.clock.bossSpawned, false);
  });

  test('选卡写 buff、触发 rebuild、恢复 running 并解冻；时之沙提升 xpGainMul', () => {
    const { p, bus, rebuilds, setMul } = makeProg();
    const selected = [];
    bus.subscribe('upgrade.selected', (e) => selected.push(e));
    p.gainXp(40);
    const cardId = p.choices[0].id;
    assert.equal(p.selectCard(cardId), true);
    assert.equal(p.buffs.length, 1);
    assert.equal(p.buffs[0].buffId, cardId);
    assert.equal(p.phase, 'running');
    assert.equal(p.clock.frozen, false);
    assert.equal(rebuilds(), 1, '选卡后必须重算三层乘区');
    assert.equal(selected.length, 1);
    assert.equal(selected[0].cardId, cardId);
    assert.equal(selected[0].tier, 1);

    p.advanceClock(0.5);
    closeTo(p.clock.elapsedSec, 0.5, 1e-9, '解冻后时钟恢复推进');

    // 非本轮 offered 的卡 / 非 upgradePick 阶段的选择必须被拒绝
    assert.equal(p.selectCard('timeSand'), false);
    assert.equal(p.buffs.length, 1);
  });

  test('takenTierCount 与 domain 语义一致；同一张卡 tier 递增', () => {
    const card = upgradeCard('heavyShot');
    const buffs = [];
    assert.equal(takenTierCount(card, buffs), 0);
    buffs.push(cardToBuffEntry(card, 1));
    assert.equal(takenTierCount(card, buffs), 1);
    buffs.push(cardToBuffEntry(card, 2));
    assert.equal(takenTierCount(card, buffs), 2);
  });

  test('xpGainMul（时之沙 #15）在 gainXp 中生效', () => {
    const { p, setMul } = makeProg();
    setMul(2);
    p.gainXp(20); // 20 × 2 = 40 → 升级
    assert.equal(p.level, 2);
    assert.equal(p.phase, 'upgradePick');
  });

  test('连升多级：pendingChoiceCount 累积，逐轮开卡，全部选完才恢复', () => {
    const { p } = makeProg();
    p.gainXp(40 + 102); // Lv1→2 (40) → Lv2→3 (102)
    assert.equal(p.level, 3);
    assert.equal(p.pendingChoiceCount, 2);
    assert.equal(p.phase, 'upgradePick');
    assert.equal(p.selectCard(p.choices[0].id), true);
    assert.equal(p.pendingChoiceCount, 1);
    assert.equal(p.phase, 'upgradePick', '仍有一轮待选');
    assert.equal(p.selectCard(p.choices[0].id), true);
    assert.equal(p.phase, 'running');
    assert.equal(p.buffs.length, 2);
  });

  test('满级与封顶过滤：池子抽干时不卡死，自动恢复 running', () => {
    const bus = createEventBus();
    const p = new RunProgression({
      bus,
      rng: createMulberry32(1),
      currentWeapon: () => 'staff',
      xpGainMul: () => 1,
      onRebuild: () => {},
    });
    // 造一份「全部卡满级」的 buff 列表
    for (const card of allUpgradeCards()) {
      for (let t = 1; t <= card.maxTier; t++) p.buffs.push(cardToBuffEntry(card, t));
    }
    p.gainXp(40);
    assert.equal(p.level, 2);
    assert.equal(p.phase, 'running', '无卡可抽时自动恢复，流程不卡死');
    assert.equal(p.clock.frozen, false);
  });

  test('RunPhase 合法迁移表（升级冻结/胜负/暂停）', () => {
    assert.equal(canTransition('running', 'upgradePick'), true);
    assert.equal(canTransition('upgradePick', 'running'), true);
    assert.equal(canTransition('running', 'defeat'), true);
    assert.equal(canTransition('running', 'victory'), true);
    assert.equal(canTransition('upgradePick', 'defeat'), false);
  });
});

// ═══════════════════════════════════════════════════════════
// 7. 端到端：CombatRuntime 一帧一帧推进
// ═══════════════════════════════════════════════════════════
describe('TASK-02 / A7 CombatRuntime 端到端', () => {
  const frame = (over = {}) => ({
    moveX: 0,
    moveZ: 0,
    facingDeg: 0,
    attack: false,
    dash: false,
    switchWeapon: false,
    ...over,
  });

  test('法杖攻击 → 投射物飞行 → 命中扣血（唯一出口 totalHits 增长）', () => {
    const rt = new CombatRuntime({ seed: 1 });
    const t = rt.registry.spawn('riftHound', { x: 2, y: 0, z: 0 }, 0);
    const hp0 = t.hp;
    rt.step(0.016, frame({ attack: true }));
    assert.equal(rt.projectiles.liveCount, 1, '发射 1 发魔法箭');
    for (let i = 0; i < 20; i++) rt.step(0.016, frame());
    assert.ok(t.hp < hp0, '命中并扣血');
    assert.ok(rt.resolver.totalHits >= 1, '伤害经过唯一结算器');
    assert.equal(rt.layers.A, 1, '默认存档 A 区 = 1');
  });

  test('剑扇形即时命中：扇形内扣血、扇形外不受伤', () => {
    const rt = new CombatRuntime({ seed: 2 });
    rt.step(0.016, frame({ switchWeapon: true })); // 切到剑
    assert.equal(rt.weapons.current, 'sword');
    const inside = rt.registry.spawn('riftHound', { x: 1.5, y: 0, z: 0 }, 0);
    const outside = rt.registry.spawn('riftHound', { x: -1.5, y: 0, z: 0 }, 0);
    rt.step(0.016, frame({ attack: true }));
    assert.ok(inside.hp < inside.maxHp, '扇形内命中');
    assert.equal(outside.hp, outside.maxHp, '背后不受伤');
  });

  test('击杀 → 获得经验 → 升级 → 冻结时钟（含 Boss 预警）→ 选卡恢复', () => {
    const rt = new CombatRuntime({ seed: 3 });
    const t = rt.registry.spawn('riftHound', { x: 2, y: 0, z: 0 }, 0);
    t.hp = 1; // 夹具：一发即死
    rt.step(0.016, frame({ attack: true }));
    for (let i = 0; i < 20 && rt.progression.phase === 'running'; i++) rt.step(0.016, frame());
    assert.equal(rt.killCount, 1);
    closeTo(rt.progression.xp, 20, 1e-9, '普通怪 20 XP（Q-NEW-3）');
    assert.equal(rt.progression.phase, 'running', '20 XP 未到 40，不升级');

    // 第二只击杀 → 累计 40 → 升级
    const t2 = rt.registry.spawn('riftHound', { x: 2, y: 0, z: 0 }, 0);
    t2.hp = 1;
    for (let i = 0; i < 60 && rt.progression.phase === 'running'; i++) rt.step(0.016, frame({ attack: true }));
    assert.equal(rt.killCount, 2);
    assert.equal(rt.progression.level, 2);
    assert.equal(rt.progression.phase, 'upgradePick');
    assert.equal(rt.progression.clock.frozen, true);

    const frozenAt = rt.progression.clock.elapsedSec;
    for (let i = 0; i < 10; i++) rt.step(1, frame({ attack: true }));
    closeTo(rt.progression.clock.elapsedSec, frozenAt, 1e-9, '冻结期间不推进（含 600s Boss 阈值）');
    assert.equal(rt.progression.clock.bossSpawned, false);

    const pick = rt.progression.choices[0].id;
    rt.step(0.016, frame({ selectCardId: pick }));
    assert.equal(rt.progression.phase, 'running');
    assert.equal(rt.progression.buffs.length, 1);
    assert.equal(rt.progression.clock.frozen, false);
  });

  test('切换武器后 A 区按当前武器重算（强化/熟练互不覆盖）', () => {
    const save = defaultSaveV3();
    const custom = {
      ...save,
      weapons: { staff: { ...save.weapons.staff, level: 5 }, sword: { ...save.weapons.sword, level: 1 } },
      metaProgress: { ...save.metaProgress, staffMastery: 10, swordMastery: 0, forestSurvival: 0 },
    };
    const rt = new CombatRuntime({ save: custom });
    closeTo(rt.layers.A, 1 + 0.32 + masteryPctOfLevel(10), 1e-9, '法杖满配 A');
    closeTo(rt.layers.A, 1.57, 1e-9);
    rt.step(0.016, frame({ switchWeapon: true }));
    closeTo(rt.layers.A, 1, 1e-9, '切到 Lv1 剑后 A 区回落为 1');
    assert.equal(rt.weapons.levelOf('staff'), 5, '法杖 Lv5 未被覆盖');
    assert.equal(rt.weapons.levelOf('sword'), 1);
  });

  test('debugView 暴露 HP/双 CD/双 Lv/ABC/弹道/扇形/敌人数，供调试可视化', () => {
    const rt = new CombatRuntime({ seed: 4 });
    rt.registry.spawn('riftHound', { x: 2, y: 0, z: 0 }, 0);
    const v = rt.debugView();
    assert.equal(v.weapon, 'staff');
    assert.equal(v.hp, 100);
    assert.equal(v.aliveEnemies, 1);
    assert.equal(v.staffLevel, 1);
    assert.equal(v.swordLevel, 1);
    assert.equal(v.projectileCount, 1);
    assert.equal(v.arcAngleDeg, 120);
    closeTo(v.A, 1, 1e-9);
    closeTo(v.B, 1, 1e-9);
    closeTo(v.C, 1, 1e-9);
  });

  test('RunSnapshot 轮询：phase / hp / level / xp / aliveEnemyCount 随帧更新', () => {
    const rt = new CombatRuntime({ seed: 5 });
    rt.registry.spawn('riftHound', { x: 2, y: 0, z: 0 }, 0);
    rt.step(0.5, frame());
    assert.equal(rt.snapshot.phase, 'running');
    assert.equal(rt.snapshot.playerHp, 100);
    assert.equal(rt.snapshot.playerMaxHp, 100);
    assert.equal(rt.snapshot.currentWeapon, 'staff');
    assert.equal(rt.snapshot.aliveEnemyCount, 1);
    assert.equal(rt.snapshot.bossWarning, false);
    closeTo(rt.snapshot.elapsedSec, 0.5, 1e-9);
  });

  test('玩家受击 → 死亡 → phase 迁移到 defeat', () => {
    const rt = new CombatRuntime({ seed: 6 });
    rt.step(0.016, frame({ incomingDamage: 1000, incomingSource: 'environment' }));
    assert.equal(rt.player.isDead, true);
    assert.equal(rt.progression.phase, 'defeat');
  });
});
