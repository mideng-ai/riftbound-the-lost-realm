# TASK-01 领域契约提案（Domain Contract Proposal V1.0）

> 编制：技术总监 高筑基 ｜ 日期：2026-11-14 ｜ 状态：**PROPOSAL — 待项目所有者逐节签收后冻结**
> 依据文档：`总纲-项目规划书V1.md`（D1–D4、§2.1–§2.6、§4.1）、`设计-设计总纲.md`、`设计-敌人名册提案.md` v1.1、`设计-局内升级系统.md`、`设计-Agent任务分配.md`（TASK-01 验收标准）、`音频-音效事件表.md`、`工程-技术架构.md`（ST2-G）及 `src/` 现有骨架 13 文件
> 结论（TD-ARCHITECTURE 预评）：**PASS（附条件）**——契约结构可以冻结，但有 10 个开放问题需要所有者拍板（见第 6 章），其中 3 个涉及文档间矛盾，需走变更传播。

---

## 0. 这份提案是什么（给所有者的一句话说明）

这份文档定义"所有游戏系统共用的一套数据语言"：玩家的血、怪物的属性、伤害怎么算、波次什么时候刷、升级卡有什么效果、存档长什么样——全部先用一份统一的"类型说明书"定死，再让各个开发任务并行开工。这样做的好处是：任何数值改动只改配置文件，任何系统之间不会互相踩脚；坏处是定得太早会返工，所以本文所有数值都标了来源，凡是文档没定义的地方都列进了"开放问题"，由你拍板后才冻结。

---

## 1. 模块依赖图

**人话解释**：把代码目录想象成一栋楼，楼上只能给楼下打电话（依赖只能向下），不能跨层串门，也不能回拨。这样任何一个模块被替换（比如换存档后端）都不会把整栋楼拆了。这一章在现有 Stage 2 骨架（`工程-技术架构.md` §2）的基础上**新增一层 `domain/`**，专门放本章第 2 节的契约类型。

```
            main.ts（组合根：只做"接线"，不含游戏规则）
               │
   ┌───────────┼───────────────┐
   ▼           ▼               ▼
 第4层   scenes/（唯一场景组装点）
   │          │
   │          ├─▶ render/  engine/  vfx/  debug/   ←—— 允许 import Babylon.js
   │          │
   │          └─▶ 第3层（引擎无关，只碰 DOM / Storage API）
   │                ├─ input/   （已有，S2-D 契约，保持不动）
   │                ├─ save/    （已有 SavePort + MockSaveAdapter，D-207 OPEN）
   │                └─ resources/（已有 AssetLoader，Stage 3 GLTF 预留）
   │
   └─▶ 第2层  domain/  【本提案新增，TASK-01 的交付物】
              纯 TypeScript：类型 + 纯函数，禁止 import Babylon.js / DOM
              ├─ 领域契约（§2 全部类型）
              └─ 领域事件总线、状态机、伤害结算、RNG、时钟
                     │
                     └─▶ 第1层  config/  【纯数据叶子】
                          现有 gameConfig.ts + 本提案新增的数值配置文件
                          ★ config 是叶子：不 import 任何 src 模块（含 domain）★
                          （依赖方向单向：domain → config 可以 import 值，config → domain 反向禁止）
```

**分层铁律（继承 ST2-G 规则并扩展）**：

| # | 规则 | 说明 |
|---|---|---|
| L1 | 依赖箭头只能向下 | `tsc` + 构建保证无循环引用（ST2-G 已验证） |
| L2 | `config/` 是叶子 | 数值配置文件互相也不 import（只允许共享一个 `config/common.ts` 常量）。依赖方向单向：**domain 可以 `import` config 的值**（既有 `import type` 也有值导入，如 `import { damageConfig }`，domain 需要用它们组装强类型对象并把数值收敛到单一来源），**config 不得反向 `import` domain / 渲染 / 引擎**。判定方法：`grep -rn "from '\.\./\(domain\|render\|scenes\)" src/config/` 必须为空 |
| L3 | `domain/` 禁止 Babylon / DOM | TASK-01 验收标准"契约不把 Babylon 场景对象暴露给领域逻辑"的实现手段；渲染层负责在 `Vec3 ↔ Vector3` 之间转换 |
| L4 | 场景组装只发生在 `scenes/` | `main.ts` 只接线单例、启动循环（ST2-G 规则 2 不变） |
| L5 | 跨模块通信只有两条路 | ① 读取 domain 的**状态快照**（轮询，每帧一次）；② 订阅 domain 的**离散事件**。禁止模块间直接持有对方引用 |

---

## 2. 公共领域类型契约（提案核心）

**人话解释**：下面每一段代码就是一份"填空题的标准答案格式"。比如"敌人"必须有哪些属性（血量、伤害、移速），“伤害"必须经过哪三层乘区——各开发任务拿到同一份格式，做出的东西才能拼在一起。所有数值都来自已定案文档，我在注释里标了出处；所有结构都优先用"固定字段"而不是"随时 new 新对象"，这是为了手机浏览器不掉帧。

### 2.1 基础原语：实体 ID、坐标、随机数、时钟

```ts
// src/domain/types.ts
/**
 * 领域基础原语。本文件是全项目最底层契约：不 import 任何 Babylon/DOM 模块；
 * 对 config 的依赖遵守 L2（依赖方向单向 domain → config；本文件实际不依赖 config）。
 */

/** 实体唯一 ID：连续整数（非字符串），对象池友好，可直接作数组下标。 */
export type EntityId = number & { readonly __brand: 'EntityId' };
export const INVALID_ENTITY_ID = -1 as EntityId;

/** 世界坐标（米）。领域层用普通数字三元组；渲染层负责换算成 Babylon Vector3。 */
export interface Vec3 { x: number; y: number; z: number }

/** 实体空间状态。字段固定、可复用同一对象原地改写（避免每帧分配）。 */
export interface Transform {
  position: Vec3;   // y 固定为地面接触高度，俯视角主要用 x/z
  facingDeg: number; // 朝向角（0–360，俯视角平面内）
}

/** 可种子化随机数：TASK-01 验收要求"随机生成支持 seed"。 */
export interface Rng {
  next(): number;                          // [0, 1)
  range(min: number, max: number): number; // [min, max)
  int(minInclusive: number, maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  /** 导出内部状态，便于 QA 复现平衡问题（设计-设计总纲.md §3.4） */
  snapshot(): number;
}
export type RngFactory = (seed: number) => Rng;
```

```ts
// src/domain/clock.ts
/**
 * 单局时钟契约。设计-局内升级系统.md §1 明确要求：
 * "升级选卡时时间冻结（含 Boss 预警计时）——写进 TASK-01 时钟契约"。
 */
export interface RunClock {
  /** 本局已进行秒数。只在 running 状态下推进（见 §2.6 状态机）。 */
  readonly elapsedSec: number;
  /** 每帧推进；frozen=true 时直接返回，不累计。 */
  advance(dtSec: number): void;
  freeze(): void;   // 升级选卡 / 暂停 / 切后台时调用
  resume(): void;
  readonly frozen: boolean;
  /** Boss 预警（8:30 = 510s）是否已触发，供 Spawn Director 与 UI 查询 */
  readonly bossWarningStarted: boolean;
  /** Boss 登场（10:00 = 600s）是否已触发 */
  readonly bossSpawned: boolean;
}
```

### 2.2 标识符枚举（对齐 TASK-01 最低数据契约建议，原文采纳）

```ts
// src/domain/ids.ts —— 与 docs/设计-Agent任务分配.md TASK-01 建议逐字对齐
export type WeaponId = 'staff' | 'sword';
export type WeaponUpgradeLevel = 1 | 2 | 3 | 4 | 5;
export type GemId = 'fire' | 'ice' | 'lightning' | 'shadow' | 'power' | 'haste' | 'vitality';
export type GemQuality = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type CurrencyId =
  | 'gold' | 'forestMaterial'
  | 'fireShard' | 'iceShard' | 'lightningShard' | 'shadowShard'
  | 'forestCore';
export type EliteAffixId = 'berserk' | 'split' | 'vampiric' | 'shielded' | 'summoner' | 'toxic';
export type WorldEventId = 'lostChest' | 'elementalAltar' | 'monsterNest' | 'ancientAltar' | 'eliteInvasion';
export type BossPhase = 'guardian' | 'corruption' | 'coreFrenzy';   // 100–65% / 65–30% / 30–0%（设计-设计总纲.md §7.3）
export type ElementId = 'fire' | 'ice' | 'lightning' | 'shadow';    // 元素触发（规划书 §2.1）

/** 敌人 ID：4 普通 + 2 精英 + 1 Boss（D-104 已确认数量；数值来源规划书 §2.2） */
export type EnemyId =
  | 'riftHound'      // EN-N01 裂隙猎犬
  | 'riftSpitter'    // EN-N02 裂隙投射者（工作名差异见开放问题 Q5）
  | 'umbraDasher'    // EN-N03 影跃者
  | 'riftNourisher'  // EN-N04 裂隙滋养体
  | 'riftRavager'    // EN-E01 林地重甲守卫（精英）
  | 'riftCaller'     // EN-E02 裂隙唤灵者（精英）
  | 'riftWarden';    // EN-B01 裂隙守望者（Boss，主名采用方案 A）

/** 同屏实体分类，供渲染层挑材质与对象池分组 */
export type EntityKind = 'player' | 'enemyNormal' | 'enemyElite' | 'boss' | 'projectile' | 'pickup' | 'vfx';
```

### 2.3 伤害三层乘区管线（规划书 §2.1 定案的结构化表达）

```ts
// src/domain/damage.ts
/**
 * 伤害模型（规划书 §2.1 已裁决定案，结构不可改，数值全部在 config/damageConfig.ts）：
 *   单发伤害 = 武器基础伤害 × A × B × C
 *   A = 1 + 武器强化% + 金币熟练%      —— 局外基础区，层内加算（裁决 #2）
 *   B = 1 + Σ(属性宝石：最强单颗 × 品质倍率 × 重复倍率)，异属性加算合并（裁决 #3）
 *   C = 1 + Σ 局内临时%                —— 升级卡/事件 buff，加算合并，总上限 +150%
 * 元素触发效果独立结算，不进乘区。
 */

/** A 区输入。强化表语义按裁决 #1：表中数值即该级总值（如 Lv5 = +32%），非平加。 */
export interface OutrunBaseLayerInput {
  weaponUpgradePct: number; // staff/sword Lv1–5 → 0 / 0.08 / 0.16 / 0.24 / 0.32（设计-设计总纲.md §4.2）
  masteryPct: number;       // 金币熟练 Lv0–10 → 每级 +2%，Lv.10 里程碑额外 +5% → Lv.10 = 25%
                            //（设计-设计总纲.md §6.4 + D-08 裁定，见 D09-D08-R01 仲裁书 §2.2）
}
/**
 * ⚠ 基准算例（D-09 裁定后唯一权威值，仲裁书 §4.1）：
 *   A = 1 + 32%（强化 Lv5）+ 25%（熟练 Lv10）= 1.57
 *   B = 1 + 0.06 × 2.4 × 2.0（力量传说×3）= 1.288
 *   C = 1 + 12% + 18% + 20%（攻击卡I/II + 古老祭坛）= 1.50
 *   单发 = 8 × 1.57 × 1.288 × 1.50 = 24.2659 ≈ 24.27/发
 *   DPS  = 24.2659 ÷ 0.50 = 48.5318 ≈ 48.53
 *   Boss 6000 HP ÷ (48.5318 × 0.7) = 176.6s ≈ 2.94 分（2–3 分带内）
 * 旧值 22.4 / 44.8 来自「强化 Lv5 = 20%」的笔误，已按 D-09 作废。
 * 熟练 Lv0–Lv10 完整曲线见仲裁书 §2.2（Lv9 = 18%，Lv10 = 25%，断层 +7%）。
 */

/**
 * B 区输入：按宝石种类各留一条槽位（7 种 GemId 固定）。
 * 力量传说×3 的官方算例：0.06 × 2.4 × 2.0 = 28.8%（规划书 §2.1 裁决 #3）。
 * 迅捷（攻速）、生命（最大生命）宝石不进伤害 B 区，分别走 §2.7 的武器/玩家派生。
 */
export interface GemDamageEntry {
  gemId: 'power';              // V1.0 进伤害乘区的属性宝石只有力量
  basePct: number;             // 普通品质基础值 0.06（设计-设计总纲.md §5.3）
  qualityMult: number;         // 1.00/1.25/1.55/1.95/2.40（设计-设计总纲.md §5.4）
  repeatMult: number;          // 1 颗 1.0 / 2 颗 1.5 / 3 颗 2.0（设计-设计总纲.md §5.5）
}
export interface GemDamageLayerInput { readonly entries: readonly GemDamageEntry[] }

/** C 区输入：升级卡与事件 buff 的逐条加成，按类别分组以便施加类别上限。 */
export type InRunBuffCategory =
  | 'damage'        // C 区伤害类，类别上限 +100%（升级池 #5/#6；与 domain/damage.ts InRunBuffCategory 注释一致，#9 破甲是独立类别 armorBreak，不属于伤害类）
  | 'interval'      // 攻速类（=间隔缩短），合计上限 −40%，升级卡 #2 与 #8 共享
  | 'moveSpeed'     // 疾风步 #11，上限 +40%
  | 'damageTaken'   // 石肤 #12，受伤减免上限 −40%
  | 'procChance'    // 元素共鸣 #4，概率总上限 +50%（绝对值）
  | 'armorBreak'    // 破甲 #9，对精英/Boss 上限 +50%
  | 'arcAngle'      // 剑气扩展 #10，扇形上限 240°
  | 'dashCd'        // 虚空冲刺 #13，CD 下限 0.9s
  | 'xpGain'        // 时之沙 #15
  | 'lifesteal';    // 吸血剑气 #7 / 汲取 #14
export interface InRunBuffEntry { buffId: string; category: InRunBuffCategory; pct: number }

/** 三层快照：数值只在 buff 变化时重算（dirty 标记），每发子弹只做乘法——移动端零分配关键设计。 */
export interface DamageLayers {
  A: number; B: number; C: number;
  /** 派生只读值，随快照一起重算 */
  intervalMul: number;      // 攻击间隔 = 基础间隔 × (1 − intervalReduction)，floor 见 caps
  moveSpeedMul: number;
  damageTakenMul: number;   // 玩家受伤乘区（石肤），上限 −40%
  procChanceBonus: number;  // 元素共鸣绝对值加成
  armorBreakBonus: number;
  arcAngleDeg: number;      // 剑扇形角，cap 240
  dashCdMul: number;
  xpGainMul: number;
}
/** 重建快照的纯函数签名（NEW-03 / TASK-03 / TASK-04 共同调用；实现在 domain，禁止业务侧自算） */
export function rebuildDamageLayers(
  a: OutrunBaseLayerInput, b: GemDamageLayerInput,
  c: readonly InRunBuffEntry[], caps: DamageCaps,
): DamageLayers;

/** 上限表：全部来自规划书/升级文档定案，数值在 config/damageConfig.ts */
export interface DamageCaps {
  /**
   * C 区总上限 +150%（规划书 §2.1）——保留，但**当前卡池不可达**（R-01 裁定）。
   * C 区只计 damage 一类，其单类上限 +100% 使 C ≤ 2.00，永不可能触发总上限。
   * 职责是约束"未来新增的、不属于 damage 的 C 区放大类别"与可重复事件 buff。
   * ⚠ 数值待定：Q-NEW-4（总上限与单类上限顺序倒置）未裁定前保持 1.5。
   */
  inRunTotalPct: 1.5;
  inRunDamagePct: 1.0;      // C 区伤害类 +100%（升级池 #5）
  /**
   * ⚠ 破甲**不得**计入 C 区（R-01 裁定）：它由 `resolveDamageHit` 作为目标维度独立乘区结算，
   * 重复计入会破甲双计 → Boss TTK 从 2.94 分塌到约 1.18 分。
   * `C_ZONE_DERIVED_CATEGORIES` 必须保持 `['damage']`。
   */
  intervalReductionPct: 0.4;// 间隔类合计 −40%，#2/#8 共享（升级池 #2/#8）
  procChanceAbs: 0.5;       // 触发概率总上限 50%（升级池 #4）
  armorBreakPct: 0.5;       // 破甲 +50%（升级池 #9）
  arcAngleDegCap: 240;      // 剑气扩展（升级池 #10）
  moveSpeedPct: 0.4;        // 疾风步 +40%（升级池 #11）
  damageTakenRedPct: 0.4;   // 石肤 −40%（升级池 #12）
  dashCdFloorSec: 0.9;      // 虚空冲刺 CD ≥ 0.9s（升级池 #13）
}

/** 元素 on-hit 触发（独立结算，不进乘区；数值=规划书 §2.1 定案） */
export interface ElementProcDef {
  element: ElementId;
  baseChancePct: number;      // 火15 / 冰20 / 雷12 / 暗8
  effect: ElementEffect;
}
export type ElementEffect =
  | { kind: 'burn'; dpsPctOfHit: 0.08; durationSec: 3 }        // 命中伤害×8%/s，命中刷新并 +1 层
  | { kind: 'slow'; slowPct: 0.20; durationSec: 1.5 }          // 不叠加，刷新时长
  | { kind: 'chain'; jumpDmgPct: 0.40; jumps: 2; radiusM: 3 }  // 每目标每次限 1 跳
  | { kind: 'lifesteal'; healPctOfHit: 0.05; perSecCapPctMaxHp: 0.05 }; // 回复上限 5%最大生命/s

/** 控制上限表（对 Boss 衰减；规划书 §2.1 定案，按敌人档位查） */
export type ControlTier = 'normal' | 'elite' | 'boss';
export interface ControlCaps {
  slowMaxPct:    Record<ControlTier, number>; // 0.20 / 0.15 / 0.10
  burnMaxStacks: Record<ControlTier, number>; // 3 / 3 / 2
  chainMaxJumps: Record<ControlTier, number>; // 2 / 2 / 1
  poisonMaxStacks: Record<ControlTier, number>; // 5 / 3 / 2（毒 4%/s，4s 刷新）
}

/** 敌人运行时状态槽：固定字段、无嵌套数组，配合对象池复用同一实例 */
export interface StatusSlots {
  burnStacks: number; burnTimerSec: number;
  slowPct: number;    slowTimerSec: number;
  poisonStacks: number; poisonTimerSec: number;
  chainJumpDone: boolean; // 连锁"每目标每次限 1 跳"标记，每次连锁事件重置
}

/** 结算入口签名（实现归 NEW-01/NEW-02 共用的 combat 结算器，TASK-01 只冻结签名） */
export interface DamageHitRequest {
  source: DamageSource;          // 见下
  baseDamage: number;            // 已乘 A/B/C 后的单发面板值由调用方传入快照乘积
  targetId: EntityId;
  hitPos: Vec3;
}
export type DamageSource = 'staff' | 'sword' | 'burnDot' | 'poisonDot' | 'chainLightning' | 'boss' | 'environment';
export interface DamageResult { targetId: EntityId; dealt: number; killed: boolean }
export function resolveDamageHit(req: DamageHitRequest): DamageResult;
```

### 2.4 敌人定义（对齐规划书 §2.2 名册数值）

```ts
// src/domain/enemy.ts —— 数值唯一来源：config/enemyConfig.ts（本提案不写死任何数字）
export interface EnemyDefinition {
  id: EnemyId;
  codename: string;            // 'EN-N01' 等名册编号，便于追溯
  nameKey: string;             // 文本外置 key（对齐叙事文案 §6 约定）
  tier: ControlTier;           // 决定控制上限查表档位
  baseHp: number;              // N01=20 N02=15 N03=25 N04=40（规划书 §2.2）
  baseDamage: number;          // 8 / 6 / 10 / 5
  moveSpeed: number;           // 4.2 / 2.0 / 3.5 / 1.5（m/s）
  attackIntervalSec: number;   // 1.0 / 2.0 / 1.2 / 2.5
  behavior: EnemyBehavior;     // 每种敌人必须有可辨识行为差异（名册提案 §1 验收约束）
  xpValue: number;             // 击杀经验（NEW-03 消费；具体数值开放问题 Q8）
  radiusM: number;             // 碰撞/体型半径（精英体型 ×1.5）
}
export type EnemyBehavior =
  | { kind: 'meleeChase' }                                  // 猎犬：近冲咬，群体包抄
  | { kind: 'rangedKite'; rangeM: 8 }                       // 投射者：8m 远程弹，风筝走位
  | { kind: 'leapStrike'; leapRangeM: 8; leapCdSec: 4 }     // 影跃者：8m 跃进，CD 4s
  | { kind: 'supportAura'; auraRadiusM: 6; allySpeedPct: 0.20;
      onDeathSplit: { count: 2; hp: 5; damage: 4 } }        // 滋养体：6m 光环 +20%，死亡分裂 2 幼体
  | { kind: 'eliteMelee' } | { kind: 'eliteCaster' };       // 精英行为，词缀叠加见下

/** 精英词缀（六词缀，设计-设计总纲.md §8.1；数值 PROVISIONAL 进 config） */
export interface EliteAffixDef { id: EliteAffixId; nameKey: string; params: EliteAffixParams }
export type EliteAffixParams =
  | { kind: 'berserk';  moveSpeedPct: 0.25; attackSpeedPct: 0.20 }
  | { kind: 'split';    spawnCount: 2 }
  | { kind: 'vampiric'; healPctOfDealt: 0.02 }
  | { kind: 'shielded'; shieldPctOfMaxHp: 0.30 }
  | { kind: 'summoner'; intervalSec: 12; maxSummons: 3 }
  | { kind: 'toxic';    zoneSec: 3; dps: 4 };
/** 禁止组合（设计-设计总纲.md §8.2）：护盾+吸血 / 召唤+分裂 / 狂暴+吸血 —— 数据驱动，TASK-05 查表过滤 */
export const FORBIDDEN_AFFIX_PAIRS: readonly [EliteAffixId, EliteAffixId][] = [
  ['shielded', 'vampiric'], ['summoner', 'split'], ['berserk', 'vampiric'],
];

/** 精英词缀外加成（规划书 §2.2）：HP×4、伤害×1.5、体型×1.5、经验×5——基底见开放问题 Q2 */
export interface EliteStatMultipliers { hp: 4; damage: 1.5; size: 1.5; xp: 5 }

/** Boss（EN-B01 裂隙守望者，6000 HP 校验见规划书 §2.2；三阶段阈值设计-设计总纲.md §7.3） */
export interface BossDefinition {
  id: 'riftWarden'; baseHp: 6000; titleKey: string; nameKey: string; // 方案 A：主名 Rift Warden
  phases: readonly [
    { phase: 'guardian';   hpFromPct: 1.00; hpToPct: 0.65 },
    { phase: 'corruption'; hpFromPct: 0.65; hpToPct: 0.30 },
    { phase: 'coreFrenzy'; hpFromPct: 0.30; hpToPct: 0.00 },
  ];
  /** 六种攻击（设计-设计总纲.md §7.4，伤害与时序 PROVISIONAL 进 config；预警判定须与碰撞一致） */
  attacks: readonly BossAttackDef[];
  summonCap: number; // 森林召唤物有上限，不允许无限生成
}
export interface BossAttackDef {
  id: 'rootSpike' | 'sweepSwipe' | 'groundSlam' | 'corruptVines' | 'forestSummon' | 'coreBurst';
  telegraphSec: number;   // 预警时长（0.9 / 1.0 / 1.2 / 1.5 / — / 2.0）
  damage: number;         // 20 / 25 / 18 / 每秒6 / — / 30
  recoveryWindowSec: number; // 核心爆发后核心暴露 2s 输出窗口
}
```

### 2.5 波次表与单局时间轴（规划书 §2.3 六阶段表 + D1 时长裁决）

```ts
// src/domain/wave.ts —— D1 已拍板：Boss 预警 8:30 / 登场 10:00，全时间轴 ×0.6
export const RUN_TIMELINE = {
  bossWarnSec: 510,   // 8:30（D1）
  bossSpawnSec: 600,  // 10:00（D1）
  /** Boss 预警三点（音频-音效事件表 §3：8:30 / 9:00 / 9:30） */
  warnSfxCheckpointSec: [510, 540, 570],
} as const;

export interface WavePhaseDef {
  index: 1 | 2 | 3 | 4 | 5 | 6;
  label: 'warmup' | 'expand' | 'escalate' | 'pressure' | 'warning' | 'boss';
  startSec: number; endSec: number;      // 0–150 / 150–300 / 300–450 / 450–510 / 510–600 / 600–结束
  spawnIntervalSec: number;              // 30 / 25 / 22 / 20 / 生成减半 / 补怪 45s
  waveSize: number;                      // 3 / 4 / 5 / 6 / — / Boss 期每 45s 补 2 只猎犬
  enemyWeights: Partial<Record<EnemyId, number>>; // 各阶段可用怪种与权重（1 猎犬 → 4 全种）
  maxOnScreen: number;                   // 8 / 12 / 16 / 20 / 12 / 4
  hpScale: number;                       // 1.0 / 1.3 / 1.8 / 2.4 / 2.4 / —（Boss 期不缩放 Boss 本体）
  damageScale: number;                   // 1.0 / 1.1 / 1.2 / 1.3 / 1.3 / 1.0
  eliteRule: EliteRule;                  // 无 / 无 / 6:00 首只后每 90s / 每 75s / 停刷 / 全禁
}
export interface EliteRule {
  firstSpawnSec: number | null; // 360（6:00）
  repeatEverySec: number | null;// 90 → 阶段 4 改 75
  bannedAfterSec: number | null;// 510 起 停刷；Boss 期全禁
  /** 双词缀精英占用同屏精英上限；满 2 只推迟 30s 重试 ×3（规划书 §2.5 补丁） */
  deferRetrySec: 30; maxRetries: 3;
}
/** Boss 期间硬规则（规划书 §2.3 定案，原文"可调整"已改硬规则）：不清场、停刷、普通怪同屏 ≤4、精英全禁 */
export interface BossPeriodRule { clearOnSpawn: false; normalCap: 4; replenish: { everySec: 45; enemyId: 'riftHound'; count: 2 }; eliteBanned: true }

/** 随机事件时间轴（规划书 §2.3 ×0.6 版）：首场 2:00–3:30，约 1.8 分钟间隔，同种不连续，预警后停刷 */
export interface WorldEventSchedule {
  firstWindowSec: { start: 120; end: 210 };
  intervalSec: 108;
  maxConcurrent: 1;
  noImmediateRepeat: true;
  stopAfterSec: 510; // Boss 预警后停刷主要事件（设计-设计总纲.md §8.5 / 规划书 §2.5）
}
/** 事件定义（设计-设计总纲.md §8.4；巢穴 HP 1000、祭坛增益 90s 等数值进 config） */
export interface WorldEventDef { id: WorldEventId; nameKey: string; params: WorldEventParams; timeoutSec: number }
```

### 2.6 玩家状态与游戏状态机

```ts
// src/domain/player.ts —— 数值来源：规划书 §2.2 战斗基准表
export interface PlayerDefinition {
  maxHp: 100;                  // 基准 100；最终 maxHp = 100 ×(1+ 生命宝石 Σ + 森林生存 Lv×1%)，见 deriveMaxHp
  moveSpeed: 5.0;              // m/s
  hitInvulnSec: 0.5;           // 受击无敌帧
  dash: { distanceM: 3.5; cooldownSec: 1.5; invulnSec: 0 }; // Dash 无敌帧：无（原样保留待原型验证）
  staff: { damage: 8; intervalSec: 0.5; projectileSpeedMps: 14 };
  sword: { damage: 6; arcAngleDeg: 120; radiusM: 2.5; intervalSec: 0.8 }; // D-104 扇形 B 方案
}
export function deriveMaxHp(gemVitalityPct: number, forestSurvivalPct: number): number;
/** 武器实际间隔 = 基础 × (1 − 间隔类缩短)，floor 由 DamageCaps.intervalReductionPct 决定 */

export interface PlayerRuntime {
  entityId: EntityId;
  hp: number; maxHp: number;
  transform: Transform;
  invulnTimerSec: number;      // >0 期间免疫伤害
  dashTimerSec: number;        // Dash CD 剩余
  currentWeapon: WeaponId;
  statusSlots: StatusSlots;    // 玩家也可中毒/减速（毒区、剧毒词缀）
}

// src/domain/runState.ts —— 状态机（含 TASK-01 时钟暂停语义）
export type RunPhase =
  | 'boot'          // 资源/存档加载
  | 'menu'          // 主菜单
  | 'metaHub'       // 局外准备：宝石镶嵌/合成/强化/金币成长（设计-设计总纲.md §9）
  | 'runStarting'   // 选 seed、生成局面
  | 'running'       // 战斗中，唯一推进 RunClock 的状态
  | 'upgradePick'   // 升级三选一：时间冻结（升级文档 §1）+ 暂停语义
  | 'paused'        // 手动暂停 / 切后台（input SystemState.suspended 映射到这里）
  | 'victory'       // Boss 击败
  | 'defeat';       // 生命归零 / 中途退出按失败结算（设计-设计总纲.md §6.5）
/** 合法迁移表（数据驱动，非法迁移在开发期 console.error） */
export const RUN_PHASE_TRANSITIONS: Readonly<Record<RunPhase, readonly RunPhase[]>> = {
  boot: ['menu'], menu: ['metaHub', 'runStarting'], metaHub: ['menu', 'runStarting'],
  runStarting: ['running'], running: ['upgradePick', 'paused', 'victory', 'defeat'],
  upgradePick: ['running'], paused: ['running', 'menu'],
  victory: ['metaHub', 'menu'], defeat: ['metaHub', 'menu'],
};
/** 局内经验（NEW-03 消费）：XP(L) = 40 × L^1.35，L1–10 逐级 40/102/176/260/312/449/553/662/777/896 */
export function xpToNextLevel(level: number): number;
```

### 2.7 事件总线（EventBus）

**人话解释**：事件总线是游戏内部的"广播电台"——某个系统发生了值得别人知道的事（怪物死了、Boss 换阶段了），就广播一条消息，关心的系统自己订阅。注意：血条、计时器这类**每帧都在变**的数值不走广播（会在手机上制造海量垃圾对象），改为各系统每帧轮询状态快照；事件只用于"一瞬间发生一次"的事情。

```ts
// src/domain/events.ts
export interface GameEventMap {
  // —— 局流程 ——
  'run.started':        { seed: number };
  'run.phaseChanged':   { from: RunPhase; to: RunPhase };
  'run.settled':        { victory: boolean; pickedResources: SaveRunLoot };
  // —— 玩家 ——
  'player.damaged':     { amount: number; source: DamageSource; hpLeft: number };
  'player.died':        { atSec: number };
  'player.leveledUp':   { level: number };
  'upgrade.offered':    { level: number; choices: UpgradeCardDef[] /* 每级 3 选 1 */ };
  'upgrade.selected':   { cardId: UpgradeId; tier: 1 | 2 | 3 };
  // —— 武器 / 宝石（TASK-01 建议事件名原文采纳）——
  'weapon.switched':    { from: WeaponId; to: WeaponId };
  'weapon.upgraded':    { weaponId: WeaponId; level: WeaponUpgradeLevel };
  'gem.socketed':       { weaponId: WeaponId; slot: 0 | 1 | 2; itemInstanceId: string };
  'gem.unsocketed':     { weaponId: WeaponId; slot: 0 | 1 | 2 };
  'gem.merged':         { gemId: GemId; fromQuality: GemQuality; toQuality: GemQuality };
  // —— 敌人 / 战斗 ——
  'enemy.spawned':      { enemyId: EntityId; defId: EnemyId; isElite: boolean; affixes?: readonly EliteAffixId[] };
  'enemy.killed':       { defId: EnemyId; atSec: number; drops: readonly LootRoll[] };
  'proc.triggered':     { element: ElementId; targetId: EntityId };
  'elite.spawned':      { defId: EnemyId; affixes: readonly EliteAffixId[] };
  // —— 资源 / 事件 / Boss（TASK-01 建议事件名原文采纳）——
  'resource.dropped':   { currencyId: CurrencyId; amount: number; pos: Vec3 };
  'resource.picked_up': { currencyId: CurrencyId; amount: number }; // 防重复入账由 Economy 侧保证
  'world_event.started':   { id: WorldEventId };
  'world_event.completed': { id: WorldEventId };
  'world_event.expired':   { id: WorldEventId };
  'boss.warning_started':  { atSec: 510 };
  'boss.spawned':          { atSec: 600 };
  'boss.phase_changed':    { phase: BossPhase; hpPct: number };
  'boss.defeated':         { atSec: number };
}

export type GameEvent<K extends keyof GameEventMap = keyof GameEventMap> =
  { readonly type: K; readonly payload: GameEventMap[K] };
export type Unsubscribe = () => void;

export interface EventBus {
  publish<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]): void;
  subscribe<K extends keyof GameEventMap>(type: K, handler: (payload: GameEventMap[K]) => void): Unsubscribe;
  /** 场景销毁时统一退订，防监听器泄漏（合并门槛 §5.6 的清理要求） */
  clearAll(): void;
}
/** 每帧轮询用的只读快照（HUD / UI 的数据源，替代高频事件）：由领域层每帧原地改写同一对象 */
export interface RunSnapshot {
  phase: RunPhase; elapsedSec: number; playerHp: number; playerMaxHp: number;
  currentWeapon: WeaponId; xp: number; level: number; aliveEnemyCount: number;
  bossHpPct: number | null; bossPhase: BossPhase | null; bossWarning: boolean;
}
```

### 2.8 局内升级卡（对齐升级池 15 条）

```ts
// src/domain/upgrade.ts —— 数值唯一来源：config/upgradePoolConfig.ts
export type UpgradeId =
  | 'splitShot' | 'chargeHaste' | 'pierceShot' | 'elementalResonance' | 'heavyShot'   // 杖 1–5
  | 'bladeEnhance' | 'vampiricBlade' | 'whirlwind' | 'armorBreak' | 'arcExtend'       // 剑 6–10
  | 'swiftStep' | 'stoneSkin' | 'voidDash' | 'leech' | 'timeSand';                    // 通用 11–15

export interface UpgradeCardDef {
  id: UpgradeId;
  nameKey: string; descKey: string;          // 文本外置（升级文档 §3，对齐叙事文案 §6）
  scope: WeaponId | 'generic';
  tiers: readonly [number, number, number];  // I/II/III 定案值，如 splitShot 弹道 [2,3,4]
  maxTier: 1 | 2 | 3;
  capGroup: InRunBuffCategory | null;        // 达上限的卡在生成 3 选 1 时过滤（升级文档 §3）
  effect: UpgradeEffect;
}
export type UpgradeEffect =
  | { kind: 'projectileCount'; multPerExtraShot: 0.6 }        // #1 单弹伤害 ×0.6 累乘（N3 已定案）
  | { kind: 'intervalReduction' } | { kind: 'damagePct' }
  | { kind: 'pierce'; dmgMultPerTarget: 0.7 }                 // #3 每穿 −30%
  | { kind: 'procChanceAbs' } | { kind: 'swordLifestealPctMaxHp' } // #7 回复 1/1.5/2% 最大生命
  | { kind: 'armorBreakPct' } | { kind: 'arcAngleDeg' }
  | { kind: 'moveSpeedPct' } | { kind: 'damageTakenRedPct' }
  | { kind: 'dashCdReduction' } | { kind: 'killHealHp' }      // #14 击杀回复 1/2/3 生命
  | { kind: 'xpGainPct' };
/** 选卡生成：入参 Rng（可复现）+ 当前 buff 列表（做上限过滤）+ 玩家武器状态（过滤 scope） */
export function rollUpgradeChoices(rng: Rng, current: readonly InRunBuffEntry[], ctx: UpgradeRollContext): UpgradeCardDef[] /* 恒 3 张 */;
```

### 2.9 存档结构（规划书 §2.6 SaveDataV3 原文 + 一处修正建议）

```ts
// src/domain/save.ts —— 后端仍走现有 save/SavePort 抽象（D-207 保持 OPEN）
export const SAVE_SCHEMA_VERSION = 3;
export interface WeaponSaveSlot { level: WeaponUpgradeLevel; sockets: readonly (string | null)[] /* 3 槽，存 itemInstanceId，见 Q6 */ }
export interface GemInventoryItem { itemInstanceId: string; gemId: GemId; quality: GemQuality }
export interface SaveRunLoot { gold: number; forestMaterial: number; shards: Record<ElementId, number>; gems: readonly GemInventoryItem[] }

export interface SaveDataV3 {
  schemaVersion: 3;
  savedAt: string;
  /** ★ 修正建议（开放问题 Q6）：规划书原文 sockets 存 gemId，无法区分"同种宝石不同品质"，
   *  改为存 gemInventory 的 itemInstanceId。此项需你签收后才写入正式 schema。 */
  weapons: { staff: WeaponSaveSlot; sword: WeaponSaveSlot };
  gemInventory: GemInventoryItem[];
  currencies: {
    gold: number; forestMaterial: number;
    elementalShards: Record<ElementId, number>; forestCore: number;
  };
  metaProgress: { staffMastery: number; swordMastery: number; forestSurvival: number }; // 0–10，设计-设计总纲.md §6.4（Lv.10 里程碑 +5%，D-08）
  settings: { volumes: { sfx: number; music: number }; quality: string; colorblind: boolean; language: string };
  stats: { runsPlayed: number; bossKills: number; bestTimeSec: number | null };
}
export function migrateV2toV3(v2: SaveDataV2): SaveDataV3; // 迁移：gold→gold，其余 v2 字段归档不迁移
export function defaultSaveV3(): SaveDataV3;
```

### 2.10 音频事件引用（对齐音频-音效事件表命名）

```ts
// src/domain/audio.ts —— 事件名 = 音效事件表 §1–4 原文；前缀规范 sfx_<系统>_<动作>_<变体>
export type AudioEventId =
  | 'sfx_staff_cast' | 'sfx_staff_hit' | 'sfx_sword_swing' | 'sfx_sword_hit'
  | 'sfx_proc_fire' | 'sfx_proc_frost' | 'sfx_proc_storm' | 'sfx_proc_shadow'  // 命名映射见开放问题 Q7
  | 'sfx_player_hurt' | 'sfx_player_death' | 'sfx_dash'
  | 'sfx_pickup_gold' | 'sfx_pickup_material' | 'sfx_pickup_shard' | 'sfx_pickup_core'
  | 'sfx_levelup' | 'sfx_upgrade_pick'
  | 'sfx_gem_socket' | 'sfx_gem_unsocket' | 'sfx_gem_merge' | 'sfx_weapon_upgrade' | 'sfx_weapon_switch' | 'sfx_purchase'
  | 'sfx_elite_spawn' | `sfx_affix_${EliteAffixId}`
  | 'sfx_boss_warn_1' | 'sfx_boss_warn_2' | 'sfx_boss_warn_3'   // 8:30 / 9:00 / 9:30（=RUN_TIMELINE.checkpoint）
  | 'sfx_boss_attack_1' | 'sfx_boss_attack_2' | 'sfx_boss_attack_3' | 'sfx_boss_attack_4' | 'sfx_boss_attack_5' | 'sfx_boss_attack_6'
  | 'sfx_boss_phase_2' | 'sfx_boss_phase_3' | 'sfx_boss_defeat'
  | 'sfx_event_start' | 'sfx_event_done'
  | 'sfx_ui_click' | 'sfx_ui_error' | 'sfx_run_win' | 'sfx_run_lose';
/** 领域事件 → 音频 ID 的映射表（数据驱动，config/audioEventMapConfig.ts）。
 *  引擎选型（Babylon AudioEngine vs 裸 Web Audio）是 D-OPEN，S6 前关闭——本契约不绑定引擎。 */
export const AUDIO_EVENT_MAP: Readonly<Partial<Record<keyof GameEventMap, readonly AudioEventId[]>>>;
```

---

## 3. 配置文件结构（src/config）

**人话解释**：所有会调的数字（伤害、血量、刷新时间……）都放进"配置文件"，就像游戏的"设置面板"放在代码里。想调平衡时只改配置，不碰游戏逻辑代码。配置采用**同步打包**方式加载——即编译时直接打进游戏包里，玩家打开网页第一秒就能拿到全部数值，不需要额外等网络下载，这对手机浏览器的首屏速度最友好（配置总量预计 < 50KB，打包进 JS 比异步 fetch 更快更稳）。

| 文件 | 内容 | 数值来源 | 状态 |
|---|---|---|---|
| `config/common.ts` | 跨文件共享常量（时间轴秒数、ControlTier 表） | — | 新增，唯一允许被其他 config 文件 import 的文件 |
| `config/gameConfig.ts` | 引擎层：perfBudget / saveAdapter / render / vfx / debug | ST2-G | **已有，保持不动**（D-207/D-210 OPEN 标注不变） |
| `config/playerConfig.ts` | 玩家 100HP/移速5.0/无敌帧0.5s/Dash 3.5m CD1.5s；法杖 8伤/0.5s/弹速14；剑 6伤/120°/2.5m/0.8s | 规划书 §2.2 | 新增 |
| `config/enemyConfig.ts` | 4 普通怪全数值 + 精英倍率（HP×4/伤×1.5/体×1.5/验×5）+ Boss 6000 + 六词缀 + 禁止组合表 | 规划书 §2.2、总纲 §8.1–8.2 | 新增 |
| `config/waveTimelineConfig.ts` | 六阶段波次表 + Boss 时间轴（510/600）+ 精英节奏 + 事件时间轴 + Boss 期硬规则 | 规划书 §2.3、§2.5 | 新增 |
| `config/upgradePoolConfig.ts` | 15 条升级卡 tier 值 + XP 曲线 40×L^1.35 + 各类上限 | 升级文档 §1–2 | 新增 |
| `config/gemConfig.ts` | 7 宝石基础效果 + 5 品质倍率（1.00–2.40）+ 重复倍率（1.0/1.5/2.0）+ 元素触发四条 + 控制上限表 | 总纲 §5、规划书 §2.1 | 新增 |
| `config/damageConfig.ts` | 三层乘区 caps + 掉落表（普通 1 金币/8% 材料/1% 宝石…Boss 80–120 金币） | 规划书 §2.1、总纲 §6.2 | 新增 |
| `config/audioEventMapConfig.ts` | 领域事件 → AudioEventId 映射 + 混音优先级（Boss 预警 > Boss 攻击 > 词缀 > 常规） | 音效事件表 §3/§5 | 新增 |

**命名与加载约定**：

1. 配置一律 `export const xxxConfig = { ... } as const`，对象字面量 + 中文注释标注来源文档与 CONFIRMED/PROVISIONAL/OPEN 状态（沿用 ST2-G §5 约定）。
2. 单位后缀强制：`Sec` / `Ms` / `Pct` / `Mps` / `M`（继承 ST2-G "Units explicit" 规则）。
3. **加载方式：同步静态 import**（Vite 打包进主 bundle）。理由：① 手机首屏无额外请求瀑布；② 类型检查能覆盖配置结构错误；③ 总量小，tree-shaking 无负担。未来若做"热更新数值"再引入异步 fetch，接口已由 `import` 形状预留（改为 `await import()` 即可）。
4. 配置文件禁止 import 领域逻辑、禁止 new 对象、禁止运行时计算（纯数据）。

---

## 4. TASK-01 新建文件清单（只规划，不实现）

**人话解释**：下面是这次任务要"新建的空房子"清单——每个文件写好类型定义和带注释的函数签名，但不写游戏逻辑。冻结后各任务就在这些房子里装修。

| 路径 | 职责（一句话） |
|---|---|
| `src/domain/types.ts` | EntityId / Vec3 / Transform / Rng 等全项目最底层原语 |
| `src/domain/ids.ts` | 全部 ID 字面量联合（武器/宝石/货币/词缀/事件/Boss/敌人） |
| `src/domain/clock.ts` | RunClock 时钟契约（含升级选卡冻结语义与 Boss 预警标记） |
| `src/domain/damage.ts` | 三层乘区输入/快照/caps/元素触发/控制上限 + 结算函数签名 |
| `src/domain/enemy.ts` | 敌人/精英词缀/Boss 定义类型 + 禁止组合常量 |
| `src/domain/wave.ts` | 波次阶段、精英规则、事件时间轴、Boss 期硬规则、RUN_TIMELINE 常量 |
| `src/domain/player.ts` | 玩家定义与运行时状态、maxHp/武器间隔派生函数签名 |
| `src/domain/runState.ts` | RunPhase 状态机 + 迁移表 + XP 曲线签名 |
| `src/domain/upgrade.ts` | 15 条升级卡类型 + 3 选 1 生成签名 + 上限过滤契约 |
| `src/domain/events.ts` | GameEventMap、EventBus、RunSnapshot 轮询快照 |
| `src/domain/save.ts` | SaveDataV3、migrateV2toV3、defaultSaveV3 |
| `src/domain/audio.ts` | AudioEventId 联合 + 领域事件→音频映射类型 |
| `src/domain/index.ts` | 桶导出（barrel），外部模块只允许从 `domain` 导入 |
| `src/config/common.ts` | 跨配置共享常量（config 内唯一可被互引的文件） |
| `src/config/playerConfig.ts` | 玩家与双武器基准数值（§3 表） |
| `src/config/enemyConfig.ts` | 敌人名册 + 词缀 + Boss 定义数值 |
| `src/config/waveTimelineConfig.ts` | 六阶段波次表 + Boss/事件时间轴数值 |
| `src/config/upgradePoolConfig.ts` | 15 条升级卡数值 + XP 曲线数值 |
| `src/config/gemConfig.ts` | 宝石/品质/重复倍率/元素触发/控制上限数值 |
| `src/config/damageConfig.ts` | 乘区 caps + 掉落表数值 |
| `src/config/audioEventMapConfig.ts` | 事件→音效映射与混音优先级数值 |

**明确不新建**：`src/player/`、`src/enemy/`、`src/progression/`、`src/world/` 等业务目录——那是 NEW-01~04 的文件修改范围（规划书 §4.1），TASK-01 只交契约。**明确不动**：`input/`、`save/SavePort.ts` 接口形状、`engine/`、`render/`、`vfx/`、`scenes/` 现有实现（合并门槛"不得覆盖 Stage 2 骨架"）。

---

## 5. 接口冻结清单

**人话解释**：不是所有契约都要一次定死。下表列出"哪些契约一旦评审通过就锁死不再改"，锁死后对应任务才能开工——锁早了会返工，锁晚了大家都在等。★ 标记为冻结硬前提。

| 冻结项 | 解锁 | 解锁前置条件 |
|---|---|---|
| ★ `ids.ts` 全部 ID 枚举 + `damage.ts` 三层结构与结算签名 + `events.ts` 事件名 + `runState.ts` 状态机 | **NEW-01（玩家实体）** | §2.1–2.3、§2.6、§2.7 冻结；玩家伤害入口（`DamageHitRequest`）与无敌帧字段定案；Dash 手感参数（Q9）可后补进 config 不阻塞 |
| ★ 上行 + `enemy.ts` + `types.ts` EntityId/对象池约定 + `clock.ts` | **NEW-02（Enemy 系统）** | 敌人运行时结构（StatusSlots）冻结；精英基底数值（Q2）需拍板，拍板前可先实现 4 普通怪 |
| ★ `damage.ts` + `ids.ts`（WeaponId/GemId）+ `events.ts`（weapon.*/gem.* 事件） | **TASK-02（双武器成长，规划书定义）** | 武器伤害源、命中事件 payload 冻结；若"TASK-02 渲染管线"另有所指，见 Q10 附注 |
| `save.ts` SaveDataV3 + `CurrencyId` + 掉落表 config | TASK-04（资源经济，唯一真并行） | Q6（socket 存实例 ID）签收 |
| `upgrade.ts` + XP 曲线 | NEW-03（局内升级） | 15 条卡数值签收（文档已定案，预期无阻塞） |
| `wave.ts` 全部 | TASK-05（怪物潮/精英/事件） | Q2、Q8（精英基底、经验值）拍板 |
| `enemy.ts` BossDefinition + `wave.ts` RUN_TIMELINE | TASK-06（Boss） | Boss 六攻击数值 PROVISIONAL 可后调 |
| `events.ts` + `RunSnapshot` + `audio.ts` | TASK-07（UI）与音频选型 | Q7（音效命名映射）拍板 |

**冻结纪律**：冻结后任何修改走变更流程（由主理人传播到受影响任务），禁止各 Agent 私改契约文件；PROVISIONAL 数值改动不触发变更流程（只改 config）。

---

## 6. 开放问题（需项目所有者拍板）

**人话解释**：下面是我在对照全部文档时发现的"文档打架"和"文档没写"的地方。每条都给了我的建议方案，你逐条回复"同意"或给出你的决定即可；这些决定不阻塞本章 §2 契约结构的评审，但会阻塞第 5 章对应任务的解锁。

| # | 问题 | 我的建议 |
|---|---|---|
| Q1 | **时间轴数字自洽性**：D1 说"全时间轴 ×0.6"，但 16:30×0.6=9:54、18:00×0.6=10:48，与已拍板的 8:30/10:00 不符。判定：8:30/10:00 是权威定案（本提案已采用），"×0.6"是对阶段表的约数描述。**连带**：总纲 §1.3/§3.3/§7.2 仍写着 16:30/18:00/20–24 分钟，未随 D1 更新 | 确认 D1 为准；走变更传播更新总纲对应章节，避免后续 Agent 引用旧时间 |
| Q2 | **精英基底未定义**：规划书 §2.2 精英行只写"词缀外加成 HP×4/伤×1.5/体×1.5/经验×5"，没说乘在哪个基础上（哪种普通怪模板？） | 建议精英以 EN-N01 猎犬为基底模板，数值进 config 可调；需你确认 |
| Q3 | **元素触发数值矛盾**：总纲 §5.3（燃烧 2 秒、额外伤害 40% 武器伤害）vs 规划书 §2.1 定案（8%/s、3 秒、叠层）。两者不可共存 | 按规划书 §2.1（后出、且为 B2 裁决）执行；建议在总纲标注"已被规划书 §2.1 取代" |
| Q4 | **触发概率与品质矛盾**：总纲 §5.4"元素触发概率默认不随品质提高" vs 规划书 §2.1 暗影行"品质/重复只提升触发概率（上限 50%）" | 二选一：A=概率恒定（总纲），B=品质提升概率（规划书）。类型上已预留 `procChanceBonus` 字段，两种都能表达，但平衡走向需你定 |
| Q5 | **敌人命名不一致**：名册提案工作名"荆棘投射者" vs 规划书"裂隙投射者 / Rift Spitter"；Boss 主名总纲 §7.1 "The Corrupted Forest Warden" vs 规划书 S1 方案 A "The Rift Warden + Corrupted Forest Lord 称号" | 按规划书（S1 已建议方案 A、名册 v1.1 已声明以规划书 §2.2 为准）；`nameKey` 全部走文本表，改文案不动代码 |
| Q6 | **SaveDataV3 socket 无法区分品质**：规划书 §2.6 `sockets: [gemId|null ×3]`，但允许重复镶嵌且库存条目含品质——两个"fire"无法区分 | 修改 schema：socket 存 `itemInstanceId`。这是对设计文档的一处技术性修正，需你签收后写入正式契约（§2.9 已按修正后版本起草） |
| Q7 | **音效命名映射**：音效表 `sfx_proc_frost`/`sfx_proc_storm` vs 契约 `ice`/`lightning` | 保持音效文件名不动（对齐音效表），在 audioEventMapConfig 做映射；建议音效表补一行映射说明 |
| Q8 | **击杀经验数值缺失**：升级曲线已定（40×L^1.35），但普通怪/精英 XP 值未在任何文档定义 | 建议首版：普通怪 XP 进 config 从 10 起、精英 ×5（名册倍率）、Boss 大量；PROVISIONAL 实测调 |
| Q9 | **Dash 持续时间缺失**：只定了距离 3.5m/CD 1.5s/无无敌帧，没定"瞬间位移还是 0.1–0.2s 冲刺" | 建议 0.15s 匀速冲刺（手感可调，进 config），NEW-01 原型验证后定案 |
| Q10 | **胜利条件的边缘情况**：名册提案 §8 "Boss 为可选遭遇，不作为撤离条件"，但本项目无撤离机制、胜利唯一路径是杀 Boss——Boss 期不清场停刷，玩家无法"绕过"Boss | 建议明确：V1.0 胜利 = 击杀 Boss，死亡 = 失败，无第三结局；"可选遭遇"表述视为对旧搜打撤方案的残留，建议删除。需你确认 |

**遗留 OPEN 门（不阻塞 TASK-01，S6 前必须关闭）**：D-207 存档后端、D-210 性能预算、渲染方向（ToonMaterial）、音频引擎选型、真机验证矩阵——维持原状，本提案不代替任何所有者决策。

---

*技术总监 高筑基 ｜ 本文为 TASK-01 冻结前提案，全部数值标注来源、可追溯至规划书/总纲/升级文档/音效表；签收后按第 5 章清单逐项解锁下游任务。仓库代码零改动。*
