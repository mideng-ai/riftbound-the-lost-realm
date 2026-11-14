/**
 * 全部标识符字面量联合（与 设计-Agent任务分配.md TASK-01「最低数据契约建议」逐字对齐）。
 *
 * 为什么 ID 用字符串联合而不是 enum：
 *   字符串字面量零运行时开销（enum 会产出对象），可直接写进 config 的键与存档 JSON，
 *   且 `verbatimModuleSyntax` 下不需要值导入。代价是没有反向查名——但 ID 本来就不该反查。
 *
 * 本文件禁止 import Babylon / DOM；也不 import config（ID 是比数值更底层的事实）。
 */

/** 武器 ID：法杖 / 魔法剑（TASK-01 建议原文） */
export type WeaponId = 'staff' | 'sword';

/** 武器永久强化等级 Lv.1–Lv.5（TASK-01 建议原文；数值见 playerConfig.weaponUpgradePctByLevel） */
export type WeaponUpgradeLevel = 1 | 2 | 3 | 4 | 5;

/** 七种宝石 ID（TASK-01 建议原文） */
export type GemId = 'fire' | 'ice' | 'lightning' | 'shadow' | 'power' | 'haste' | 'vitality';

/** 五种品质，顺序由低到高（TASK-01 建议原文；倍率见 gemConfig.qualityMult） */
export type GemQuality = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * 货币 / 资源 ID（TASK-01 建议原文）。
 * 注意 shards 拆成四个具体 ID，而不是 `Record<ElementId, number>` 的键——
 * 因为存档里碎片是**独立账户**，与元素触发是两件事（见 save.ts）。
 */
export type CurrencyId =
  | 'gold'
  | 'forestMaterial'
  | 'fireShard'
  | 'iceShard'
  | 'lightningShard'
  | 'shadowShard'
  | 'forestCore';

/** 六种精英词缀（TASK-01 建议原文；数值见 enemyConfig.affixes） */
export type EliteAffixId = 'berserk' | 'split' | 'vampiric' | 'shielded' | 'summoner' | 'toxic';

/** 五种随机事件（TASK-01 建议原文；数值见 waveTimelineConfig.events） */
export type WorldEventId = 'lostChest' | 'elementalAltar' | 'monsterNest' | 'ancientAltar' | 'eliteInvasion';

/** Boss 三阶段（TASK-01 建议原文；血线见 设计-设计总纲.md §7.3，100–65 / 65–30 / 30–0） */
export type BossPhase = 'guardian' | 'corruption' | 'coreFrenzy';

/** 四种元素，用于元素 on-hit 触发（规划书 §2.1 定案） */
export type ElementId = 'fire' | 'ice' | 'lightning' | 'shadow';

/**
 * 敌人 ID：4 普通 + 2 精英 + 1 Boss（D-104 已确认数量；数值来源规划书 §2.2）。
 * 命名按规划书（Q5 采信：Rift Spitter / Rift Warden）。
 */
export type EnemyId =
  | 'riftHound' // EN-N01 裂隙猎犬
  | 'riftSpitter' // EN-N02 裂隙投射者
  | 'umbraDasher' // EN-N03 影跃者
  | 'riftNourisher' // EN-N04 裂隙滋养体
  | 'riftRavager' // EN-E01 林地重甲守卫（精英）
  | 'riftCaller' // EN-E02 裂隙唤灵者（精英）
  | 'riftWarden'; // EN-B01 裂隙守望者（Boss）

/** 4 种普通怪 ID 子集（刷怪权重表只允许普通怪，防止精英/Boss 混进波次池） */
export type NormalEnemyId = Extract<EnemyId, 'riftHound' | 'riftSpitter' | 'umbraDasher' | 'riftNourisher'>;

/** 2 种精英 ID 子集 */
export type EliteEnemyId = Extract<EnemyId, 'riftRavager' | 'riftCaller'>;

/** 同屏实体分类，供渲染层挑材质与对象池分组 */
export type EntityKind = 'player' | 'enemyNormal' | 'enemyElite' | 'boss' | 'projectile' | 'pickup' | 'vfx';
