/**
 * 敌人定义 / 精英词缀 / Boss 定义类型。
 *
 * 数值唯一来源：config/enemyConfig.ts（本文件不写死任何数字）。
 * 文档来源：总纲-项目规划书V1.md §2.2 名册、设计-设计总纲.md §7.3–§7.4 / §8.1–§8.2。
 * 开放问题采信：Q2（精英基底 = EN-N01 猎犬）、Q5（命名按规划书）、Q8（XP PROVISIONAL）。
 *
 * 本文件禁止 import Babylon / DOM。
 */
import { enemyConfig } from '../config/enemyConfig.ts';
import type { EliteAffixId, EnemyId } from './ids.ts';
import type { ControlTier } from './damage.ts';

// ─────────────────────────────────────────────────────────────
// 行为
// ─────────────────────────────────────────────────────────────

/**
 * 敌人行为参数（每种敌人必须有可辨识行为差异，名册提案 §1 验收约束）。
 *
 * 参数值用 `typeof config` 引用，保证 NEW-02 拿到的类型与配置里的实际数值一致；
 * 若将来调 config 里的 leapCdSec，这里的类型会跟着变，不会出现"类型说 4、实跑是 5"。
 */
export type EnemyBehavior =
  | { readonly kind: 'meleeChase' } // 猎犬：近冲咬，群体包抄
  | { readonly kind: 'rangedKite'; readonly rangeM: typeof enemyConfig.normals.riftSpitter.behavior.rangeM } // 投射者：8m 远程弹，风筝走位
  | {
      // 影跃者：8m 跃进贴身，CD 4s
      readonly kind: 'leapStrike';
      readonly leapRangeM: typeof enemyConfig.normals.umbraDasher.behavior.leapRangeM;
      readonly leapCdSec: typeof enemyConfig.normals.umbraDasher.behavior.leapCdSec;
    }
  | {
      // 滋养体：6m 光环 +20% 友军移速，死亡分裂 2 只（HP5 / 伤4）
      readonly kind: 'supportAura';
      readonly auraRadiusM: typeof enemyConfig.normals.riftNourisher.behavior.auraRadiusM;
      readonly allySpeedPct: typeof enemyConfig.normals.riftNourisher.behavior.allySpeedPct;
      readonly onDeathSplit: {
        readonly count: typeof enemyConfig.normals.riftNourisher.behavior.onDeathSplit.count;
        readonly hp: typeof enemyConfig.normals.riftNourisher.behavior.onDeathSplit.hp;
        readonly damage: typeof enemyConfig.normals.riftNourisher.behavior.onDeathSplit.damage;
      };
    }
  | { readonly kind: 'eliteMelee' } // 精英：重型近战压迫
  | { readonly kind: 'eliteCaster' }; // 精英：远程施法 / 有限召唤

// ─────────────────────────────────────────────────────────────
// 普通怪定义
// ─────────────────────────────────────────────────────────────

/**
 * 敌人定义（普通怪）。
 *
 * baseHp / baseDamage / moveSpeed / attackIntervalSec 为**未缩放**基础值；
 * 实际数值 = base × 波次阶段 hpScale / damageScale（见 wave.ts），由 Spawn Director 计算。
 */
export interface EnemyDefinition {
  readonly id: EnemyId;
  /** 名册编号（'EN-N01' 等），便于追溯 */
  readonly codename: string;
  /** 文本外置 key（对齐叙事文案 §6 约定），改文案不动代码 */
  readonly nameKey: string;
  /** 决定控制上限查表档位 */
  readonly tier: ControlTier;
  readonly baseHp: number;
  readonly baseDamage: number;
  /** m/s */
  readonly moveSpeed: number;
  readonly attackIntervalSec: number;
  readonly behavior: EnemyBehavior;
  /** 击杀经验（NEW-03 消费；Q8 采信：普通怪从 10 起，PROVISIONAL） */
  readonly xpValue: number;
  /** 碰撞/体型半径（米），精英体型 ×1.5 */
  readonly radiusM: number;
}

// ─────────────────────────────────────────────────────────────
// 精英词缀
// ─────────────────────────────────────────────────────────────

/** 词缀参数（六种）；数值来源 设计-设计总纲.md §8.1。 */
export type EliteAffixParams =
  | {
      readonly kind: 'berserk';
      readonly moveSpeedPct: typeof enemyConfig.affixes.berserk.params.moveSpeedPct;
      readonly attackSpeedPct: typeof enemyConfig.affixes.berserk.params.attackSpeedPct;
    }
  | { readonly kind: 'split'; readonly spawnCount: typeof enemyConfig.affixes.split.params.spawnCount }
  | { readonly kind: 'vampiric'; readonly healPctOfDealt: typeof enemyConfig.affixes.vampiric.params.healPctOfDealt }
  | { readonly kind: 'shielded'; readonly shieldPctOfMaxHp: typeof enemyConfig.affixes.shielded.params.shieldPctOfMaxHp }
  | {
      readonly kind: 'summoner';
      readonly intervalSec: typeof enemyConfig.affixes.summoner.params.intervalSec;
      readonly maxSummons: typeof enemyConfig.affixes.summoner.params.maxSummons;
    }
  | {
      readonly kind: 'toxic';
      readonly zoneSec: typeof enemyConfig.affixes.toxic.params.zoneSec;
      readonly dps: typeof enemyConfig.affixes.toxic.params.dps;
    };

/** 一条精英词缀。 */
export interface EliteAffixDef {
  readonly id: EliteAffixId;
  readonly nameKey: string;
  readonly params: EliteAffixParams;
}

/** 词缀 ID → 定义（从 config 组装）。 */
export function eliteAffixDef(id: EliteAffixId): EliteAffixDef {
  const cfg = enemyConfig.affixes[id];
  return { id, nameKey: cfg.nameKey, params: cfg.params };
}

/**
 * 精英词缀外加成（规划书 §2.2）：HP×4、伤害×1.5、体型×1.5、经验×5。
 * 基底见 Q2：EN-N01 猎犬模板。
 */
export interface EliteStatMultipliers {
  readonly hp: typeof enemyConfig.eliteStatMultipliers.hp;
  readonly damage: typeof enemyConfig.eliteStatMultipliers.damage;
  readonly size: typeof enemyConfig.eliteStatMultipliers.size;
  readonly xp: typeof enemyConfig.eliteStatMultipliers.xp;
}

/**
 * 禁止组合（总纲 §8.2）：护盾+吸血 / 召唤+分裂 / 狂暴+吸血。数据驱动，TASK-05 查表过滤。
 *
 * 类型用 `readonly (readonly [EliteAffixId, EliteAffixId])[]` 而不是
 * `readonly [EliteAffixId, EliteAffixId][]`——后者是「一个可变二维数组」，
 * 在 verbatimModuleSyntax + readonly 配置下赋值会报警。
 */
export const FORBIDDEN_AFFIX_PAIRS: readonly (readonly [EliteAffixId, EliteAffixId])[] = enemyConfig.forbiddenAffixPairs;

/** 判断两个词缀是否属于禁止组合（顺序无关）。 */
export function isForbiddenAffixPair(a: EliteAffixId, b: EliteAffixId): boolean {
  for (const pair of FORBIDDEN_AFFIX_PAIRS) {
    if ((pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Boss
// ─────────────────────────────────────────────────────────────

/** Boss 六种攻击 ID（总纲 §7.4 顺序：根须突刺 → 核心爆发）。 */
export type BossAttackId = (typeof enemyConfig.boss.attacks)[number]['id'];

/** Boss 攻击定义。telegraphSec = 预警时长；damage = 单次值（腐化藤蔓为每秒值）。 */
export interface BossAttackDef {
  readonly id: BossAttackId;
  /** 预警时长（秒）；0 表示无预警（森林召唤） */
  readonly telegraphSec: number;
  /** 伤害；0 表示无直接伤害（森林召唤） */
  readonly damage: number;
  /** 攻击后核心暴露的输出窗口（秒）；0 = 无 */
  readonly recoveryWindowSec: number;
  /** 召唤数量（仅森林召唤有），受 summonCap 限制 */
  readonly summonCount?: number;
}

/** Boss 阶段区间（血线百分比，1.0 = 100%）。 */
export interface BossPhaseRange {
  readonly phase: 'guardian' | 'corruption' | 'coreFrenzy';
  /** 阶段起始血线（含） */
  readonly hpFromPct: number;
  /** 阶段结束血线（不含） */
  readonly hpToPct: number;
}

/** Boss 定义（EN-B01 裂隙守望者）。 */
export interface BossDefinition {
  readonly id: 'riftWarden';
  readonly codename: string;
  readonly nameKey: string;
  readonly titleKey: string;
  /** 6000 HP（规划书 §2.2 校验：6000 ÷ 35 DPS ≈ 171s ≈ 2.9 分钟） */
  readonly baseHp: number;
  readonly radiusM: number;
  /** Boss 击杀经验（PROVISIONAL，Q8） */
  readonly xpValue: number;
  /** 三阶段血线（总纲 §7.3：100–65 / 65–30 / 30–0） */
  readonly phases: readonly BossPhaseRange[];
  /** 六种攻击（总纲 §7.4，伤害与时序 PROVISIONAL） */
  readonly attacks: readonly BossAttackDef[];
  /** 森林召唤物上限，不允许无限生成 */
  readonly summonCap: number;
}

/** 从 config 组装 Boss 定义（避免 TASK-06 手抄数值）。 */
export function bossDefinition(): BossDefinition {
  const cfg = enemyConfig.boss;
  return {
    id: 'riftWarden', // 唯一 Boss（D-104：4 普通 + 2 精英 + 1 Boss）
    codename: cfg.codename,
    nameKey: cfg.nameKey,
    titleKey: cfg.titleKey,
    baseHp: cfg.baseHp,
    radiusM: cfg.radiusM,
    xpValue: cfg.xpValue,
    phases: cfg.phases.map((p) => ({ phase: p.phase, hpFromPct: p.hpFromPct, hpToPct: p.hpToPct })),
    attacks: cfg.attacks.map((atk) => ({
      id: atk.id,
      telegraphSec: atk.telegraphSec,
      damage: atk.damage,
      recoveryWindowSec: atk.recoveryWindowSec,
      ...('summonCount' in atk ? { summonCount: atk.summonCount } : {}),
    })),
    summonCap: cfg.summonCap,
  };
}

/**
 * 按血线百分比查 Boss 当前阶段。
 *
 * 语义：hpPct 落在 **hpToPct ≤ p < hpFromPct** 内即为该阶段（右开区间）。
 *   - 100%（满血）→ guardian
 *   - 65%（恰好跌破第一阈值）→ corruption（总纲 §7.3 表「65%–30%」）
 *   - 64.9% → corruption
 *   - 30%（恰好）→ coreFrenzy；0%（刚死）→ coreFrenzy
 *
 * 「恰好 65% 算哪一阶段」是有实际后果的边界：Boss 换阶段要发 boss.phase_changed
 * 事件并切攻击表，若两边都算 guardian 就永远不会切到 corruption。这里统一取右开，
 * 与总纲表里「65%–30%」的写法一致（上一段的终点 = 下一段的起点）。
 *
 * @param hpPct 当前生命百分比（0–1），越界自动夹取
 */
export function bossPhaseAtHp(hpPct: number): BossPhaseRange['phase'] {
  const p = Number.isFinite(hpPct) ? Math.min(1, Math.max(0, hpPct)) : 0;
  const phases = enemyConfig.boss.phases;
  // 逐段判定 [hpToPct, hpFromPct)，并允许最后一段包含 0：
  //   guardian   1.00 ≤ p ≤ 1.00 ？不 —— guardian 是 [0.65, 1.00]，用 `p >= hpToPct && p <= hpFromPct`
  // 统一写法：p ∈ [hpToPct, hpFromPct]，但对非首段要求 p < 上一段 hpToPct 已被前一轮排除，
  // 因此这里只需 `p >= hpToPct` 且按**从高到低**遍历（guardian → coreFrenzy），
  // 第一个满足的即为答案：p=1.0 → guardian（1.0>=0.65）；p=0.65 → guardian；
  // 但总纲要求 65% 属第二段，故 guardian 的判定必须用 `p > hpToPct`（严格大于）。
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const isLast = i === phases.length - 1;
    // 首段上界含（满血）；每段下界：非末段严格大于（把边界让给下一段），末段含
    if (p >= phase.hpToPct && (isLast || p > phase.hpToPct) && p <= phase.hpFromPct) return phase.phase;
  }
  return 'coreFrenzy';
}

// ─────────────────────────────────────────────────────────────
// 派生：精英数值（Q2：基底 × 倍率）
// ─────────────────────────────────────────────────────────────

/** 普通怪 ID 集合（用于在运行时判断 defId 是否为普通怪）。 */
export const NORMAL_ENEMY_IDS = ['riftHound', 'riftSpitter', 'umbraDasher', 'riftNourisher'] as const;

/** 精英 ID 集合。 */
export const ELITE_ENEMY_IDS = ['riftRavager', 'riftCaller'] as const;

/**
 * 判断某 ID 是否为普通怪。
 * @param id 敌人 ID
 */
export function isNormalEnemyId(id: EnemyId): boolean {
  return (NORMAL_ENEMY_IDS as readonly string[]).includes(id);
}

/**
 * 判断某 ID 是否为精英。
 * @param id 敌人 ID
 */
export function isEliteEnemyId(id: EnemyId): boolean {
  return (ELITE_ENEMY_IDS as readonly string[]).includes(id);
}

/**
 * 读取某个普通怪的定义（从 config 组装）。
 * 精英 / Boss 不能走这里——它们的数值是派生的，见 eliteStats / bossDefinition。
 *
 * @param id 普通怪 ID；传入精英或 Boss 会抛错（把误用挡在最早的地方）
 */
export function normalEnemyDefinition(id: EnemyId): EnemyDefinition {
  if (!isNormalEnemyId(id)) {
    throw new Error(`[domain/enemy] normalEnemyDefinition() 只接受普通怪 ID，收到: ${id}`);
  }
  const def = enemyConfig.normals[id as keyof typeof enemyConfig.normals];
  return {
    id,
    codename: def.codename,
    nameKey: def.nameKey,
    tier: 'normal',
    baseHp: def.baseHp,
    baseDamage: def.baseDamage,
    moveSpeed: def.moveSpeedMps,
    attackIntervalSec: def.attackIntervalSec,
    behavior: def.behavior,
    xpValue: def.xpValue,
    radiusM: def.radiusM,
  };
}

/** 精英派生后的实际数值。 */
export interface EliteDerivedStats {
  readonly baseHp: number;
  readonly baseDamage: number;
  readonly moveSpeed: number;
  readonly attackIntervalSec: number;
  readonly radiusM: number;
  readonly xpValue: number;
  readonly behavior: EnemyBehavior;
}

/**
 * 精英数值派生：基底（EN-N01 猎犬，Q2 采信）× 精英倍率（HP×4 / 伤×1.5 / 体×1.5 / 经验×5）。
 *
 * 移速与攻击间隔不乘倍率——规划书 §2.2 明列的四项倍率里没有它们，
 * 精英的机动性差异由「重型近战 / 远程施法」行为区分（名册 §6 要求行为差异而非数值换皮）。
 *
 * @param eliteId 精英 ID
 */
export function eliteStats(eliteId: EnemyId): EliteDerivedStats {
  if (!isEliteEnemyId(eliteId)) {
    throw new Error(`[domain/enemy] eliteStats() 只接受精英 ID，收到: ${eliteId}`);
  }
  const baseId = enemyConfig.eliteBaseTemplate.baseEnemyId;
  const base = normalEnemyDefinition(baseId);
  const m = enemyConfig.eliteStatMultipliers;
  const def = enemyConfig.elites[eliteId as keyof typeof enemyConfig.elites];

  return {
    baseHp: base.baseHp * m.hp,
    baseDamage: base.baseDamage * m.damage,
    moveSpeed: base.moveSpeed, // 不乘倍率
    attackIntervalSec: base.attackIntervalSec, // 不乘倍率
    radiusM: base.radiusM * m.size,
    xpValue: base.xpValue * m.xp,
    behavior: def.behavior,
  };
}
