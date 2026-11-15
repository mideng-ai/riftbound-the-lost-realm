/**
 * TASK-03 宝石系统自动化测试（七宝石 / 五品质 / 三槽位 / 合成）。
 *
 * 覆盖任务书全部验收标准：
 *   - 合成只接受三颗同种同品质；传说不可继续合成
 *   - 镶嵌宝石在局内不被意外替换
 *   - 元素效果从正确武器命中事件触发（武器错配零触发）
 *   - 重复镶嵌 1.0/1.5/2.0 倍率生效；触发概率总上限 50% 不被突破
 *   - 重新加载后库存与槽位一致（validateSaveV3 拦截悬空 itemInstanceId）
 *   - 品质倍率 / 重复倍率 / 控制上限全部来自 config（与常量比对，无硬编码锚点）
 *
 * 运行：npm run test:gems
 * 编译链：tsc -p tsconfig.test.json → .testbuild/（CommonJS）→ tests/prepare.cjs
 */
'use strict';

import { createRequire } from 'node:module';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);

const gems = require('../.testbuild/gems/index.js');
const saveMod = require('../.testbuild/domain/save.js');
const damageMod = require('../.testbuild/domain/damage.js');
const eventsMod = require('../.testbuild/domain/events.js');
const gemConfig = require('../.testbuild/config/gemConfig.js').gemConfig;
const common = require('../.testbuild/config/common.js');

const { defaultSaveV3, validateSaveV3 } = saveMod;
const { createMulberry32 } = eventsMod;

function newSave() {
  return defaultSaveV3();
}

function add(save, gemId, quality) {
  const r = gems.addGem(save, gemId, quality);
  assert.ok(r.ok, `addGem ${gemId}/${quality} 失败: ${r.message}`);
  return r.save;
}

function socket(save, weapon, slot, id) {
  const r = gems.socketGem(save, weapon, slot, id);
  assert.ok(r.ok, `socketGem 失败: ${r.message}`);
  return r.save;
}

function hit(weapon, opts = {}) {
  return {
    weaponId: weapon,
    hitDamage: opts.hitDamage ?? 100,
    target: { id: 'enemy-1', tier: opts.tier ?? 'normal' },
    playerMaxHp: opts.playerMaxHp ?? 100,
    healedThisSecond: opts.healedThisSecond ?? 0,
  };
}

describe('TASK-03 合成（三合一）', () => {
  test('三颗同种同品质 → 升一级（确定性，不随机不失败；81 颗普通 → 1 颗传说）', () => {
    let s = newSave();
    for (let i = 0; i < 81; i++) s = add(s, 'fire', 'common');
    const ladder = [['common', 'uncommon', 27], ['uncommon', 'rare', 9], ['rare', 'epic', 3], ['epic', 'legendary', 1]];
    for (const [from, to, expectedToCount] of ladder) {
      while (s.gemInventory.filter((g) => g.quality === from).length >= 3) {
        const ids = s.gemInventory.filter((g) => g.quality === from).map((g) => g.itemInstanceId).slice(0, 3);
        const r = gems.mergeGems(s, ids);
        assert.ok(r.ok, r.message);
        s = r.save;
      }
      assert.equal(s.gemInventory.filter((g) => g.quality === from).length, 0, from);
      assert.equal(s.gemInventory.filter((g) => g.quality === to).length, expectedToCount, to);
    }
    assert.equal(s.gemInventory.length, 1);
    assert.equal(s.gemInventory[0].quality, 'legendary');
  });

  test('传说不可继续合成；拒绝时库存零变化', () => {
    let s = newSave();
    for (let i = 0; i < 3; i++) s = add(s, 'ice', 'legendary');
    const ids = s.gemInventory.map((g) => g.itemInstanceId);
    const r = gems.mergeGems(s, ids);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'GEM_MERGE_TOP');
    assert.equal(r.save, undefined); // 拒绝分支不构造新存档
  });

  test('拒绝：颗数不足 / 混品质 / 混种类 / 含镶嵌中材料', () => {
    let s = newSave();
    s = add(s, 'fire', 'common');
    s = add(s, 'fire', 'common');
    assert.equal(gems.mergeGems(s, s.gemInventory.map((g) => g.itemInstanceId)).code, 'GEM_MERGE_COUNT');

    s = newSave();
    s = add(s, 'fire', 'common'); s = add(s, 'fire', 'uncommon'); s = add(s, 'fire', 'common');
    assert.equal(gems.mergeGems(s, s.gemInventory.map((g) => g.itemInstanceId)).code, 'GEM_MERGE_QUALITY');

    s = newSave();
    s = add(s, 'fire', 'common'); s = add(s, 'ice', 'common'); s = add(s, 'power', 'common');
    assert.equal(gems.mergeGems(s, s.gemInventory.map((g) => g.itemInstanceId)).code, 'GEM_MERGE_KIND');

    s = newSave();
    s = add(s, 'fire', 'common'); s = add(s, 'fire', 'common'); s = add(s, 'fire', 'common');
    const socketedId = s.gemInventory[0].itemInstanceId;
    s = socket(s, 'staff', 0, socketedId);
    const ids = [socketedId, s.gemInventory[1].itemInstanceId, s.gemInventory[2].itemInstanceId];
    assert.equal(gems.mergeGems(s, ids).code, 'GEM_MERGE_SOCKETED');
  });

  test('canMerge 只读判定与 mergeGems 一致（UI 置灰用）', () => {
    let s = newSave();
    for (let i = 0; i < 3; i++) s = add(s, 'power', 'rare');
    const ids = s.gemInventory.map((g) => g.itemInstanceId);
    assert.equal(gems.canMerge(s, ids).ok, true);
    assert.equal(gems.nextQuality('rare'), 'epic');
    assert.equal(gems.nextQuality('legendary'), null);
  });
});

describe('TASK-03 镶嵌 / 拆卸', () => {
  test('槽位保存 itemInstanceId——同种不同品质必须可区分', () => {
    let s = newSave();
    s = add(s, 'fire', 'common');
    const commonId = s.gemInventory.at(-1).itemInstanceId;
    s = add(s, 'fire', 'epic');
    const epicId = s.gemInventory.at(-1).itemInstanceId;
    s = socket(s, 'staff', 0, commonId);
    s = socket(s, 'staff', 1, epicId);
    assert.equal(s.weapons.staff.sockets[0], commonId);
    assert.equal(s.weapons.staff.sockets[1], epicId);
    const list = gems.socketedGemsOf(s, 'staff');
    assert.deepEqual(list.map((x) => x.gem.quality), ['common', 'epic']);
  });

  test('局内不被意外替换：占用槽拒绝隐式顶替', () => {
    let s = newSave();
    s = add(s, 'fire', 'common');
    s = add(s, 'power', 'rare');
    const fireId = s.gemInventory[0].itemInstanceId;
    const powerId = s.gemInventory[1].itemInstanceId;
    s = socket(s, 'staff', 1, fireId);
    const r = gems.socketGem(s, 'staff', 1, powerId);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'GEM_SLOT_OCCUPIED');
    assert.equal(s.weapons.staff.sockets[1], fireId); // 原宝石未被顶替
  });

  test('同一实例不可同时进两个槽（含跨武器）；拆卸后可重镶', () => {
    let s = newSave();
    s = add(s, 'haste', 'common');
    const id = s.gemInventory.at(-1).itemInstanceId;
    s = socket(s, 'staff', 0, id);
    assert.equal(gems.socketGem(s, 'staff', 2, id).code, 'GEM_ALREADY_SOCKETED');
    assert.equal(gems.socketGem(s, 'sword', 0, id).code, 'GEM_ALREADY_SOCKETED');
    const out = gems.unsocketGem(s, 'staff', 0);
    assert.ok(out.ok);
    assert.equal(out.removed, id);
    s = socket(out.save, 'staff', 2, id); // 拆卸后重镶合法
    assert.equal(gems.unsocketGem(s, 'staff', 1).code, 'GEM_SLOT_EMPTY');
    assert.equal(gems.socketGem(s, 'staff', 3, id).code, 'GEM_BAD_SLOT'); // 越界
  });

  test('重复镶嵌：同种三颗占满 3 槽合法', () => {
    let s = newSave();
    const ids = [];
    for (let i = 0; i < 3; i++) {
      s = add(s, 'fire', 'common');
      const id = s.gemInventory.at(-1).itemInstanceId;
      ids.push(id);
      s = socket(s, 'staff', i, id);
    }
    assert.deepEqual(s.weapons.staff.sockets, ids);
  });

  test('镶嵌中的宝石不可从库存移除（防悬空引用）', () => {
    let s = newSave();
    s = add(s, 'fire', 'common');
    const id = s.gemInventory.at(-1).itemInstanceId;
    s = socket(s, 'sword', 0, id);
    assert.equal(gems.removeGem(s, id).code, 'GEM_IS_SOCKETED');
    const out = gems.unsocketGem(s, 'sword', 0);
    assert.ok(gems.removeGem(out.save, id).ok);
  });

  test('事件 payload 与 domain 事件表形状一致（gem.socketed / unsocketed / merged）', () => {
    let s = newSave();
    s = add(s, 'fire', 'common');
    const id = s.gemInventory.at(-1).itemInstanceId;
    s = socket(s, 'staff', 2, id);
    const ev = gems.socketedEvent(s, 'staff', 2);
    assert.deepEqual(ev, { weaponId: 'staff', slot: 2, itemInstanceId: id });
    assert.deepEqual(gems.unsocketedEvent('staff', 2), { weaponId: 'staff', slot: 2 });
    assert.deepEqual(gems.mergedEvent('fire', 'common', 'uncommon'), { gemId: 'fire', fromQuality: 'common', toQuality: 'uncommon' });
  });
});

describe('TASK-03 重复倍率与触发概率上限', () => {
  test('Q4-B 公式：概率 = base + 品质步数×2% + (颗数−1)×2%，全部来自 config', () => {
    // 与 domain elementProcChance 的契约对齐（不能绕开 domain 公式）
    for (const element of ['fire', 'ice', 'lightning', 'shadow']) {
      for (const quality of ['common', 'uncommon', 'rare', 'epic', 'legendary']) {
        for (const count of [1, 2, 3]) {
          let s = newSave();
          for (let i = 0; i < count; i++) s = add(s, element, quality);
          const ids = s.gemInventory.map((g) => g.itemInstanceId);
          ids.forEach((id, i) => (s = socket(s, 'staff', i, id)));
          const states = gems.elementProcStates(s, 'staff');
          assert.equal(states.length, 1, `${element}×${count}`);
          const expected = damageMod.elementProcChance(element, quality, count, 0);
          assert.ok(Math.abs(states[0].chance - expected) < 1e-12, `${element}/${quality}/${count}`);
        }
      }
    }
  });

  test('触发概率总上限 50%（procChanceAbs）不被突破：传说 3 颗雷 raw=0.12+0.08+0.04=0.24 → 未及上限；极端加成口径下仍封顶', () => {
    // 3 颗传说雷电：0.12 + 4×0.02 + 2×0.02 = 0.24 < 0.5 —— 用 domain 直测上限封顶
    const capped = damageMod.elementProcChance('ice', 'legendary', 3, 10 /* 超大加成 */);
    assert.equal(capped, common.DAMAGE_CAPS_CONST.procChanceAbs); // 0.5
    assert.equal(capped, 0.5);
    // 宝石侧数值路径：3 传说冰 = 0.20+0.08+0.04 = 0.32
    let s = newSave();
    for (let i = 0; i < 3; i++) {
      s = add(s, 'ice', 'legendary');
      s = socket(s, 'staff', i, s.gemInventory.at(-1).itemInstanceId);
    }
    assert.ok(Math.abs(gems.elementProcStates(s, 'staff')[0].chance - 0.32) < 1e-12);
  });

  test('重复倍率表 1.0/1.5/2.0 进入属性宝石效果（power/haste/vitality）', () => {
    const mult = common.GEM_REPEAT_MULT_BY_COUNT_CONST;
    assert.deepEqual([...mult], [1.0, 1.5, 2.0]);
    for (let count = 1; count <= 3; count++) {
      let s = newSave();
      for (let i = 0; i < count; i++) {
        s = add(s, 'power', 'common');
        s = socket(s, 'sword', i, s.gemInventory.at(-1).itemInstanceId);
      }
      const b = gems.weaponGemStatBonuses(s, 'sword');
      assert.ok(Math.abs(b.powerPct - gemConfig.gems.power.basePct * mult[count - 1]) < 1e-12, `power×${count}`);
    }
  });

  test('品质倍率表（1.00/1.25/1.55/1.95/2.40）进入属性效果', () => {
    for (const [q, m] of Object.entries(common.GEM_QUALITY_MULT_CONST)) {
      let s = newSave();
      s = add(s, 'vitality', q);
      s = socket(s, 'staff', 0, s.gemInventory.at(-1).itemInstanceId);
      assert.ok(Math.abs(gems.vitalityPct(s) - gemConfig.gems.vitality.basePct * m) < 1e-12, `vitality ${q}`);
    }
  });

  test('同种不同品质：取最高品质结算，重复颗数全计入', () => {
    let s = newSave();
    s = add(s, 'power', 'common'); s = socket(s, 'staff', 0, s.gemInventory.at(-1).itemInstanceId);
    s = add(s, 'power', 'epic'); s = socket(s, 'staff', 1, s.gemInventory.at(-1).itemInstanceId);
    const b = gems.weaponGemStatBonuses(s, 'staff');
    const expected = gemConfig.gems.power.basePct * common.GEM_QUALITY_MULT_CONST.epic * common.GEM_REPEAT_MULT_BY_COUNT_CONST[1];
    assert.ok(Math.abs(b.powerPct - expected) < 1e-12);
  });

  test('vitality 全局生效：两把武器分别镶嵌则相加', () => {
    let s = newSave();
    s = add(s, 'vitality', 'common'); s = socket(s, 'staff', 0, s.gemInventory.at(-1).itemInstanceId);
    s = add(s, 'vitality', 'common'); s = socket(s, 'sword', 0, s.gemInventory.at(-1).itemInstanceId);
    assert.ok(Math.abs(gems.vitalityPct(s) - gemConfig.gems.vitality.basePct * 2) < 1e-12);
  });
});

describe('TASK-03 元素效果：从正确武器命中事件触发', () => {
  test('武器错配零触发：法杖宝石不吃剑的命中', () => {
    let s = newSave();
    for (const el of ['fire', 'ice', 'lightning']) {
      s = add(s, el, 'legendary');
      s = socket(s, 'staff', ['fire', 'ice', 'lightning'].indexOf(el), s.gemInventory.at(-1).itemInstanceId);
    }
    const rng = createMulberry32(1);
    // rng.next() 连续返回 0 不可造（mulberry32 不会返回 0 当 seed 合法），
    // 用固定 seed 多次命中验证概率收敛之外的硬规则：错配武器永远零触发
    for (let i = 0; i < 100; i++) {
      const res = gems.resolveGemHit(s, hit('sword'), rng);
      assert.equal(res.outcomes.length, 0);
    }
  });

  test('正确武器 + 必触发（rng 注入恒 0 的 stub）→ 产出事件 payload 与控制上限', () => {
    let s = newSave();
    s = add(s, 'fire', 'common');
    s = socket(s, 'staff', 0, s.gemInventory.at(-1).itemInstanceId);
    const zeroRng = { next: () => 0, range: (a, b) => a, int: (a) => a, pick: (arr) => arr[0], snapshot: () => 0, restore: () => {} };
    const res = gems.resolveGemHit(s, hit('staff', { tier: 'boss', hitDamage: 200 }), zeroRng);
    assert.equal(res.outcomes.length, 1);
    const o = res.outcomes[0];
    assert.equal(o.element, 'fire');
    assert.deepEqual(o.event, { element: 'fire', targetId: 'enemy-1' });
    // 控制上限来自 config（Boss：燃烧 2 层 / 减速 10% / 连锁 1 跳）
    assert.equal(o.controlCaps.burnMaxStacks, gemConfig.controlCaps.burnMaxStacks.boss);
    assert.equal(o.controlCaps.slowMaxPct, gemConfig.controlCaps.slowMaxPct.boss);
    assert.equal(o.controlCaps.chainMaxJumps, gemConfig.controlCaps.chainMaxJumps.boss);
    assert.equal(o.lifestealHealAmount, 0); // 非暗影
  });

  test('控制上限按敌档区分（normal/elite/boss 三行全查）', () => {
    const zeroRng = { next: () => 0, range: (a) => a, int: (a) => a, pick: (arr) => arr[0], snapshot: () => 0, restore: () => {} };
    for (const el of ['fire', 'ice', 'lightning', 'shadow']) {
      let s = newSave();
      s = add(s, el, 'legendary');
      s = socket(s, 'sword', 0, s.gemInventory.at(-1).itemInstanceId);
      for (const tier of ['normal', 'elite', 'boss']) {
        const res = gems.resolveGemHit(s, hit('sword', { tier }), zeroRng);
        const o = res.outcomes[0];
        assert.equal(o.controlCaps.burnMaxStacks, gemConfig.controlCaps.burnMaxStacks[tier], `${el}/${tier}`);
        assert.equal(o.controlCaps.slowMaxPct, gemConfig.controlCaps.slowMaxPct[tier], `${el}/${tier}`);
        assert.equal(o.controlCaps.chainMaxJumps, gemConfig.controlCaps.chainMaxJumps[tier], `${el}/${tier}`);
      }
    }
  });

  test('暗影吸血：命中伤害 5%，受每秒 ≤5% 最大生命约束；吸血量不受品质放大', () => {
    assert.ok(Math.abs(gems.lifestealHeal(200, 100, 0) - 5) < 1e-12); // 200×5%=10 → 夹 5
    assert.ok(Math.abs(gems.lifestealHeal(100, 100, 3) - 2) < 1e-12); // 5−3
    assert.equal(gems.lifestealHeal(100, 100, 5), 0); // 已触顶
    // 传说暗影的治疗量口径与普通一致（只有概率放大，量不放大）
    const zeroRng = { next: () => 0, range: (a) => a, int: (a) => a, pick: (arr) => arr[0], snapshot: () => 0, restore: () => {} };
    for (const q of ['common', 'legendary']) {
      let s = newSave();
      s = add(s, 'shadow', q);
      s = socket(s, 'staff', 0, s.gemInventory.at(-1).itemInstanceId);
      const res = gems.resolveGemHit(s, hit('staff', { hitDamage: 100, playerMaxHp: 1000 }), zeroRng);
      assert.ok(Math.abs(res.outcomes[0].lifestealHealAmount - gemConfig.gems.shadow.effect.healPctOfHit * 100) < 1e-12, q);
    }
  });

  test('rng 未命中则不触发（seed 固定可复现）', () => {
    let s = newSave();
    s = add(s, 'fire', 'common'); // 15%
    s = socket(s, 'staff', 0, s.gemInventory.at(-1).itemInstanceId);
    const rng = createMulberry32(42);
    let triggered = 0;
    for (let i = 0; i < 2000; i++) {
      if (gems.resolveGemHit(s, hit('staff'), rng).outcomes.length > 0) triggered++;
    }
    // 15% 概率 2000 次命中 → 期望 ~300，容差 5σ（σ≈16）
    assert.ok(triggered > 220 && triggered < 380, `triggered=${triggered}`);
    // 同 seed 复现
    const rng2 = createMulberry32(42);
    let triggered2 = 0;
    for (let i = 0; i < 2000; i++) {
      if (gems.resolveGemHit(s, hit('staff'), rng2).outcomes.length > 0) triggered2++;
    }
    assert.equal(triggered, triggered2);
  });
});

describe('TASK-03 存档一致性', () => {
  test('完整流程后 validateSaveV3 通过（无悬空引用）', () => {
    let s = newSave();
    s = add(s, 'fire', 'common');
    s = add(s, 'power', 'rare');
    s = socket(s, 'staff', 0, s.gemInventory[0].itemInstanceId);
    s = socket(s, 'sword', 2, s.gemInventory[1].itemInstanceId);
    const issues = validateSaveV3(s);
    assert.deepEqual([...issues], []);
  });

  test('悬空 itemInstanceId 被 validateSaveV3 拦截', () => {
    let s = newSave();
    s = add(s, 'fire', 'common');
    s = socket(s, 'staff', 1, s.gemInventory.at(-1).itemInstanceId);
    const broken = { ...s, gemInventory: [] }; // 库存丢失但槽位仍引用
    const issues = validateSaveV3(broken);
    assert.ok(issues.some((msg) => msg.includes('不存在的 itemInstanceId')));
  });

  test('实例 ID 生成不回退、不碰撞；非法 gemId/quality 被拒', () => {
    let s = newSave();
    s = add(s, 'fire', 'common');
    assert.equal(gems.nextItemInstanceId(s), 'gem-2');
    const bad1 = gems.addGem(s, 'fireball', 'common');
    assert.equal(bad1.ok, false);
    const bad2 = gems.addGem(s, 'fire', 'super');
    assert.equal(bad2.ok, false);
    assert.ok(gems.isValidGemId('vitality') && !gems.isValidGemId('hp'));
  });
});
