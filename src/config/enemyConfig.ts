/**
 * 敌人名册 / 精英词缀 / Boss 数值。
 *
 * 数值唯一来源：
 *   - 总纲-项目规划书V1.md §2.2 敌人名册表（CONFIRMED）
 *   - 设计-设计总纲.md §8.1 六词缀 / §8.2 精英等级与禁止组合 / §7.3 Boss 阶段 / §7.4 六攻击
 *
 * 开放问题采信结论：
 *   - Q2：精英基底 = EN-N01 猎犬模板（HP 20 / 伤害 8 / 移速 4.2 / 间隔 1.0），
 *         再乘规划书 §2.2 的精英倍率 HP×4 / 伤害×1.5 / 体型×1.5 / 经验×5。
 *   - Q5：命名按规划书（Rift Spitter / Rift Warden）。
 *   - Q8：XP 值文档未定义，首版普通怪从 10 起、精英 ×5、Boss 大量 —— PROVISIONAL。
 *
 * 本文件是纯数据叶子：不 import 任何其他 config 文件（common.ts 在此无需引用）。
 */

export const enemyConfig = {
  /**
   * 4 种普通怪。来源：规划书 §2.2 名册表。状态：数值 CONFIRMED / 行为参数 PROVISIONAL。
   * 行为要点必须与名册数值一致，命名按规划书（Q5 采信）。
   */
  normals: {
    /** EN-N01 裂隙猎犬 Rift Hound —— 近冲咬，群体包抄 — CONFIRMED */
    riftHound: {
      codename: 'EN-N01',
      name: 'Rift Hound',
      nameKey: 'enemy.riftHound.name',
      baseHp: 20,
      baseDamage: 8,
      moveSpeedMps: 4.2,
      attackIntervalSec: 1.0,
      radiusM: 0.45, // 普通体型基准半径 — PROVISIONAL（无文档定义，按猎犬体型估）
      /** 击杀经验 10 —— PROVISIONAL（Q8 首版值，升级曲线 40×L^1.35 校准） */
      xpValue: 20, // Q-NEW-3 裁定（裁决书 §5.1）：AC-6 可达性 + 卡池利用率 2420XP→Lv8/7卡
      behavior: { kind: 'meleeChase' },
    },

    /** EN-N02 裂隙投射者 Rift Spitter —— 8m 远程弹，风筝走位 — CONFIRMED */
    riftSpitter: {
      codename: 'EN-N02',
      name: 'Rift Spitter',
      nameKey: 'enemy.riftSpitter.name',
      baseHp: 15,
      baseDamage: 6,
      moveSpeedMps: 2.0,
      attackIntervalSec: 2.0,
      radiusM: 0.5, // — PROVISIONAL
      xpValue: 20, // Q-NEW-3 裁定（裁决书 §5.1）：AC-6 可达性 + 卡池利用率 2420XP→Lv8/7卡
      /** 8m 远程弹（规划书 §2.2「8m 远程弹」）— CONFIRMED */
      behavior: { kind: 'rangedKite', rangeM: 8 },
    },

    /** EN-N03 影跃者 Umbra Dasher —— 8m 跃进贴身，CD 4s — CONFIRMED */
    umbraDasher: {
      codename: 'EN-N03',
      name: 'Umbra Dasher',
      nameKey: 'enemy.umbraDasher.name',
      baseHp: 25,
      baseDamage: 10,
      moveSpeedMps: 3.5,
      attackIntervalSec: 1.2,
      radiusM: 0.45, // — PROVISIONAL
      xpValue: 20, // Q-NEW-3 裁定（裁决书 §5.1）：AC-6 可达性 + 卡池利用率 2420XP→Lv8/7卡
      /** 8m 跃进，CD 4s（规划书 §2.2）— CONFIRMED */
      behavior: { kind: 'leapStrike', leapRangeM: 8, leapCdSec: 4 },
    },

    /** EN-N04 裂隙滋养体 Rift Nourisher —— 6m 光环友军移速 +20%；死亡分裂 2 幼体(HP5/伤4) — CONFIRMED */
    riftNourisher: {
      codename: 'EN-N04',
      name: 'Rift Nourisher',
      nameKey: 'enemy.riftNourisher.name',
      baseHp: 28, // Q-NEW-3 裁定（§5.1）：40 时 P1 中位 P4 = 6发/2.76s 踩线；28→67.2HP→5发/2.30s 回带内
      baseDamage: 5,
      moveSpeedMps: 1.5,
      attackIntervalSec: 2.5,
      radiusM: 0.6, // — PROVISIONAL
      xpValue: 20, // Q-NEW-3 裁定（裁决书 §5.1）：AC-6 可达性 + 卡池利用率 2420XP→Lv8/7卡
      /** 光环 6m / +20% 友军移速 / 死亡分裂 2 只 HP5 伤4（规划书 §2.2）— CONFIRMED */
      behavior: {
        kind: 'supportAura',
        auraRadiusM: 6,
        allySpeedPct: 0.2,
        onDeathSplit: { count: 2, hp: 5, damage: 4 },
      },
    },
  },

  /**
   * 精英基底模板（Q2 采信：以 EN-N01 猎犬为基底）。状态：CONFIRMED（采信结论）。
   * 精英数值 = 基底 × eliteStatMultipliers；由 TASK-05 / NEW-02 读取计算，禁止业务侧硬编码。
   */
  eliteBaseTemplate: {
    /** 基底模板 ID，必须是 normals 里的键 — CONFIRMED（Q2） */
    baseEnemyId: 'riftHound',
  },

  /**
   * 精英词缀外加成。来源：规划书 §2.2 名册表精英行。状态：CONFIRMED。
   * HP×4 / 伤害×1.5 / 体型×1.5 / 经验×5。
   */
  eliteStatMultipliers: {
    hp: 4,
    damage: 1.5,
    size: 1.5,
    xp: 5,
  },

  /**
   * 2 种精英。来源：规划书 §2.2 名册（EN-E01 / EN-E02）。状态：CONFIRMED（身份）/ 行为 PROVISIONAL。
   * 注意：精英的 HP/伤害/移速/间隔不由本表定义，一律由 eliteBaseTemplate × eliteStatMultipliers 派生。
   */
  elites: {
    /** EN-E01 林地重甲守卫 Rift Ravager —— 重型近战压迫 — CONFIRMED */
    riftRavager: {
      codename: 'EN-E01',
      name: 'Rift Ravager',
      nameKey: 'enemy.riftRavager.name',
      behavior: { kind: 'eliteMelee' },
    },
    /** EN-E02 裂隙唤灵者 Rift Caller —— 远程施法 / 有限召唤 — CONFIRMED */
    riftCaller: {
      codename: 'EN-E02',
      name: 'Rift Caller',
      nameKey: 'enemy.riftCaller.name',
      behavior: { kind: 'eliteCaster' },
    },
  },

  /**
   * 六种精英词缀。来源：设计-设计总纲.md §8.1 表。状态：规则 CONFIRMED / 数值 PROVISIONAL。
   */
  affixes: {
    /** 狂暴：移速 +25%，攻速 +20% — PROVISIONAL */
    berserk: { nameKey: 'affix.berserk.name', params: { kind: 'berserk', moveSpeedPct: 0.25, attackSpeedPct: 0.2 } },
    /** 分裂：死亡分裂为 2 只低生命普通怪 — PROVISIONAL */
    split: { nameKey: 'affix.split.name', params: { kind: 'split', spawnCount: 2 } },
    /** 吸血：恢复本次伤害的 2% — PROVISIONAL */
    vampiric: { nameKey: 'affix.vampiric.name', params: { kind: 'vampiric', healPctOfDealt: 0.02 } },
    /** 护盾：护盾 = 最大生命 30% — PROVISIONAL */
    shielded: { nameKey: 'affix.shielded.name', params: { kind: 'shielded', shieldPctOfMaxHp: 0.3 } },
    /** 召唤：每 12 秒 1 只，最多 3 只 — PROVISIONAL */
    summoner: { nameKey: 'affix.summoner.name', params: { kind: 'summoner', intervalSec: 12, maxSummons: 3 } },
    /** 剧毒：毒区持续 3 秒，每秒伤害 4 — PROVISIONAL */
    toxic: { nameKey: 'affix.toxic.name', params: { kind: 'toxic', zoneSec: 3, dps: 4 } },
  },

  /**
   * 禁止组合。来源：设计-设计总纲.md §8.2。状态：CONFIRMED。
   * 护盾+吸血 / 召唤+分裂 / 狂暴+吸血。数据驱动，TASK-05 查表过滤。
   */
  forbiddenAffixPairs: [
    ['shielded', 'vampiric'],
    ['summoner', 'split'],
    ['berserk', 'vampiric'],
  ],

  /**
   * 精英等级规则。来源：设计-设计总纲.md §8.2。状态：CONFIRMED。
   */
  eliteTierRules: {
    /** 普通精英词缀数 — CONFIRMED */
    normalAffixCount: 1,
    /** 精英领主词缀数 — CONFIRMED */
    lordAffixCount: 2,
    /** V1.0 不做三词缀超级精英 — CONFIRMED */
    maxAffixCount: 2,
    /** 同屏精英上限 2 只；其中领主最多 1 只 — CONFIRMED */
    maxElitesOnScreen: 2,
    maxEliteLordsOnScreen: 1,
  },

  /**
   * Boss：EN-B01 裂隙守望者 The Rift Warden（Q5 采信：主名按规划书方案 A）。
   * 来源：规划书 §2.2（6000 HP 校验）、设计-设计总纲.md §7.1 / §7.3 / §7.4。
   */
  boss: {
    codename: 'EN-B01',
    name: 'The Rift Warden',
    nameKey: 'enemy.riftWarden.name',
    /** 称号：The Corrupted Forest Lord — CONFIRMED（规划书方案 A） */
    titleKey: 'enemy.riftWarden.title',
    /** Boss 基础生命 6000（规划书 §2.2 校验：6000 ÷ 35 DPS ≈ 171s ≈ 2.9 分钟）— CONFIRMED */
    baseHp: 6000,
    /** Boss 体型半径 — PROVISIONAL（无文档定义） */
    radiusM: 2.0,
    /** Boss 击杀经验：文档只写"大量本局经验"（总纲 §7.6）— PROVISIONAL（Q8 首版取 500） */
    xpValue: 500,

    /**
     * 三阶段血线阈值。来源：设计-设计总纲.md §7.3。状态：CONFIRMED。
     * 100–65% guardian / 65–30% corruption / 30–0% coreFrenzy。
     */
    phases: [
      { phase: 'guardian', hpFromPct: 1.0, hpToPct: 0.65 },
      { phase: 'corruption', hpFromPct: 0.65, hpToPct: 0.3 },
      { phase: 'coreFrenzy', hpFromPct: 0.3, hpToPct: 0.0 },
    ],

    /**
     * 六种攻击。来源：设计-设计总纲.md §7.4（伤害与时序均 PROVISIONAL）。状态：PROVISIONAL。
     * telegraphSec = 预警时长；damage = 单次/每秒伤害；recoveryWindowSec = 输出窗口（0 = 无）。
     * 质量规则（总纲 §7.5）：预警形状/范围/时长必须与实际碰撞判定一致。
     */
    attacks: [
      // 1 根须突刺：线形预警 0.9s 后突刺，伤害 20 — PROVISIONAL
      { id: 'rootSpike', telegraphSec: 0.9, damage: 20, recoveryWindowSec: 0 },
      // 2 扇形横扫：扇形预警 1.0s 后横扫，伤害 25 — PROVISIONAL
      { id: 'sweepSwipe', telegraphSec: 1.0, damage: 25, recoveryWindowSec: 0 },
      // 3 地面震荡：重击地面 1.2s 后环形冲击波，伤害 18 — PROVISIONAL
      { id: 'groundSlam', telegraphSec: 1.2, damage: 18, recoveryWindowSec: 0 },
      // 4 腐化藤蔓：区域预警 1.5s，持续 4s，每秒 6 — PROVISIONAL（damage 为每秒值）
      { id: 'corruptVines', telegraphSec: 1.5, damage: 6, recoveryWindowSec: 0 },
      // 5 森林召唤：无预警无伤害，召唤 3 只普通怪（受 summonCap 限制）— PROVISIONAL
      { id: 'forestSummon', telegraphSec: 0, damage: 0, recoveryWindowSec: 0, summonCount: 3 },
      // 6 核心爆发：蓄能 2.0s 后范围伤害 30，随后核心暴露 2s 输出窗口 — PROVISIONAL
      { id: 'coreBurst', telegraphSec: 2.0, damage: 30, recoveryWindowSec: 2.0 },
    ],

    /** 召唤物上限：森林召唤不允许无限生成（总纲 §7.4 / 名册 §6）— CONFIRMED */
    summonCap: 3,
    /** 腐化藤蔓持续时间 4s（总纲 §7.4）— PROVISIONAL */
    corruptVinesDurationSec: 4,
  },

  /**
   * Boss 奖励。来源：设计-设计总纲.md §7.6 + §6.2 掉落表 Boss 行。状态：PROVISIONAL。
   * 金额为区间，实际值由 TASK-04 按每局平均击杀数与通胀实测校准。
   */
  bossReward: {
    goldMin: 80,
    goldMax: 120,
    forestMaterialMin: 10,
    forestMaterialMax: 15,
    /** Boss 稳定给森林核心（总纲 §6.5：森林核心只由 Boss 胜利奖励）— CONFIRMED */
    forestCore: 1,
    /**
     * Boss 稀有宝石奖励的最低品质。
     * 取值引用 common.GEM_QUALITY_MULT_CONST 的键集合事实（epic 及以上），此处只写 ID 字符串，
     * 校验由 domain 侧 `GemQuality` 联合类型保证 — PROVISIONAL（总纲 §7.6「稀有宝石」）。
     */
    minGemQuality: 'epic',
  },
} as const;
