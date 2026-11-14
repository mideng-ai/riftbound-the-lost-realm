/**
 * 波次时间轴 / 精英节奏 / 随机事件时间轴 / Boss 期硬规则 / 胜利条件。
 *
 * 数值唯一来源：
 *   - 总纲-项目规划书V1.md §2.3 时间轴表（六阶段）、§2.5 精英入侵补丁
 *   - 设计-设计总纲.md §8.3 精英出现节奏、§8.4 五种随机事件、§8.5 事件生成
 *
 * 开放问题采信结论：
 *   - Q1：8:30 / 10:00 为权威值（"×0.6" 是约数描述）。
 *   - Q10：V1.0 胜利 = 击杀 Boss，删除"可选遭遇"表述，无第三结局。
 *
 * 本文件是纯数据叶子：只 import config/common.ts。
 */
import { RUN_TIMELINE_CONST } from './common.ts';

export const waveTimelineConfig = {
  /**
   * 单局关键时间点（D1 权威值）。状态：CONFIRMED。
   * bossWarnSec = 510（8:30）/ bossSpawnSec = 600（10:00）。
   */
  timeline: {
    bossWarnSec: RUN_TIMELINE_CONST.bossWarnSec,
    bossSpawnSec: RUN_TIMELINE_CONST.bossSpawnSec,
    /** Boss 预警三点音效检查点 510 / 540 / 570（音效事件表 §3）— CONFIRMED */
    bossWarnCheckpointsSec: RUN_TIMELINE_CONST.bossWarnCheckpointsSec,
    /** 单局最长时长上限（秒）：Boss 登场后给足 2–3 分钟 TTK 余量 — PROVISIONAL */
    maxRunSec: 1200,
  },

  /**
   * 六阶段波次表。来源：规划书 §2.3。状态：时段/上限/缩放 CONFIRMED，
   * spawnIntervalSec 在预警期"生成减半"由 CONFIRMED 时段语义推导。
   *
   * 每阶段：
   *   index / label        阶段编号与语义标签
   *   startSec / endSec    阶段时段（秒，左闭右开；末段 endSec = null 表示持续到本局结束）
   *   spawnIntervalSec     刷怪间隔
   *   waveSize             每批生成数量
   *   enemyWeights         该阶段可用的怪种与权重（按权重随机，null = 不含普通怪）
   *   maxOnScreen          同屏普通怪上限
   *   hpScale / damageScale 普通怪数值缩放
   *   eliteRule            精英生成规则
   */
  phases: [
    {
      index: 1,
      label: 'warmup',
      startSec: 0,
      endSec: 150, // 0:00–2:30
      spawnIntervalSec: 30, // 30s × 3 只猎犬 — CONFIRMED
      waveSize: 3,
      /** 仅猎犬 — CONFIRMED */
      enemyWeights: { riftHound: 1 },
      maxOnScreen: 8,
      hpScale: 1.0,
      damageScale: 1.0,
      /** 0–6 分钟不生成精英（总纲 §8.3 / 规划书 §2.3「无」）— CONFIRMED */
      eliteRule: { firstSpawnSec: null, repeatEverySec: null, bannedAfterSec: null, deferRetrySec: 30, maxRetries: 3 },
    },
    {
      index: 2,
      label: 'expand',
      startSec: 150, // 2:30–5:00
      endSec: 300,
      spawnIntervalSec: 25, // 25s × 4 混编 — CONFIRMED
      waveSize: 4,
      /** +投射者 — CONFIRMED */
      enemyWeights: { riftHound: 3, riftSpitter: 1 },
      maxOnScreen: 12,
      hpScale: 1.3,
      damageScale: 1.1,
      eliteRule: { firstSpawnSec: null, repeatEverySec: null, bannedAfterSec: null, deferRetrySec: 30, maxRetries: 3 },
    },
    {
      index: 3,
      label: 'escalate',
      startSec: 300, // 5:00–7:30
      endSec: 450,
      spawnIntervalSec: 22, // 22s × 5 混编 — CONFIRMED
      waveSize: 5,
      /** +影跃者 — CONFIRMED */
      enemyWeights: { riftHound: 3, riftSpitter: 2, umbraDasher: 1 },
      maxOnScreen: 16,
      hpScale: 1.8,
      damageScale: 1.2,
      /**
       * 6:00（360s）首只精英，之后每 90s（规划书 §2.3 + 总纲 §8.3）— CONFIRMED
       * 精英入侵若因同屏已满被推迟：30s 重试，最多 3 次（规划书 §2.5）— CONFIRMED
       */
      eliteRule: { firstSpawnSec: 360, repeatEverySec: 90, bannedAfterSec: null, deferRetrySec: 30, maxRetries: 3 },
    },
    {
      index: 4,
      label: 'pressure',
      startSec: 450, // 7:30–8:30
      endSec: 510,
      spawnIntervalSec: 20, // 20s × 6 全种 — CONFIRMED
      waveSize: 6,
      /** 4 全种 — CONFIRMED */
      enemyWeights: { riftHound: 3, riftSpitter: 2, umbraDasher: 2, riftNourisher: 1 },
      maxOnScreen: 20,
      hpScale: 2.4,
      damageScale: 1.3,
      /** 每 75s 一只精英 — CONFIRMED */
      eliteRule: { firstSpawnSec: null, repeatEverySec: 75, bannedAfterSec: null, deferRetrySec: 30, maxRetries: 3 },
    },
    {
      index: 5,
      label: 'warning',
      startSec: 510, // 8:30–10:00
      endSec: 600,
      /** 生成减半：22s→11s 间隔（规划书 §2.3「生成减半」按阶段 3 基准折半）— CONFIRMED（语义） */
      spawnIntervalSec: 11,
      waveSize: 3, // 减半：同屏上限降为 12，批量相应减半 — CONFIRMED（语义）
      enemyWeights: { riftHound: 3, riftSpitter: 2, umbraDasher: 2, riftNourisher: 1 },
      maxOnScreen: 12,
      hpScale: 2.4,
      damageScale: 1.3,
      /** 停刷精英（规划书 §2.3「停刷」）— CONFIRMED */
      eliteRule: { firstSpawnSec: null, repeatEverySec: null, bannedAfterSec: 510, deferRetrySec: 30, maxRetries: 3 },
    },
    {
      index: 6,
      label: 'boss',
      startSec: 600, // 10:00–结束
      endSec: null,
      /** Boss 期停刷主要刷怪，仅每 45s 补 2 只猎犬（见 bossPeriodRule）— CONFIRMED */
      spawnIntervalSec: 45,
      waveSize: 2,
      /** 只补猎犬 — CONFIRMED */
      enemyWeights: { riftHound: 1 },
      maxOnScreen: 4, // 同屏普通怪上限 4 — CONFIRMED
      hpScale: 2.4, // 普通怪沿用高压期缩放 — CONFIRMED（语义）
      damageScale: 1.0, // Boss 期普通怪伤害不额外缩放 — CONFIRMED（规划书 §2.3 表「×1.0」）
      /** Boss 期精英全禁（规划书 §2.3「全禁」）— CONFIRMED */
      eliteRule: { firstSpawnSec: null, repeatEverySec: null, bannedAfterSec: 600, deferRetrySec: 30, maxRetries: 3 },
    },
  ],

  /**
   * Boss 期硬规则。来源：规划书 §2.3 定案（原文"可调整"已改为硬规则）。状态：CONFIRMED。
   * 不清场、停刷、普通怪同屏 ≤4、每 45s 补 2 只猎犬、精英全禁。
   */
  bossPeriodRule: {
    clearOnSpawn: false, // 不清场 — CONFIRMED
    normalCap: 4, // 普通怪同屏上限 4 — CONFIRMED
    replenish: { everySec: 45, enemyId: 'riftHound', count: 2 }, // 每 45s 补 2 只猎犬 — CONFIRMED
    eliteBanned: true, // 精英全禁 — CONFIRMED
  },

  /**
   * 随机事件时间轴。来源：规划书 §2.3「事件时间轴（×0.6）」。状态：CONFIRMED。
   * 首场 2:00–3:30；此后约 1.8 分钟（108s）间隔；同时最多 1 个；同种不连续；Boss 预警后停刷。
   */
  eventSchedule: {
    firstWindowStartSec: 120, // 2:00 — CONFIRMED
    firstWindowEndSec: 210, // 3:30 — CONFIRMED
    intervalSec: 108, // 约 1.8 分钟 — CONFIRMED
    maxConcurrent: 1, // 同时最多 1 个 — CONFIRMED
    noImmediateRepeat: true, // 同种不连续 — CONFIRMED
    stopAfterSec: 510, // Boss 预警后停刷（总纲 §8.5）— CONFIRMED
  },

  /**
   * 五种随机事件数值。来源：设计-设计总纲.md §8.4。状态：数值 PROVISIONAL。
   * 事件完成/失败/超时都必须正确结束状态并清理对象（总纲 §8.5）。
   */
  events: {
    /** 遗落宝箱：靠近后约 1 秒开启 — PROVISIONAL */
    lostChest: { nameKey: 'event.lostChest.name', timeoutSec: 120, openSec: 1.0 },
    /** 元素祭坛：选一种元素，效果强度 +15%，持续 90s — PROVISIONAL */
    elementalAltar: { nameKey: 'event.elementalAltar.name', timeoutSec: 120, buffPct: 0.15, durationSec: 90 },
    /** 怪物巢穴：独立生命值，摧毁后奖励；有超时消失规则 — PROVISIONAL（HP 1000） */
    monsterNest: { nameKey: 'event.monsterNest.name', timeoutSec: 120, hp: 1000 },
    /** 古老祭坛：生命献祭 −15% 当前生命换 +20% 伤害 90s；金币献祭 50 金币换 +15% 攻速 90s — PROVISIONAL */
    ancientAltar: {
      nameKey: 'event.ancientAltar.name',
      timeoutSec: 120,
      hpCostPctOfCurrent: 0.15,
      damageBuffPct: 0.2,
      goldCost: 50,
      attackSpeedBuffPct: 0.15,
      durationSec: 90,
    },
    /** 精英入侵：生成 1 只双词缀精英；击败奖励金币/材料/碎片 + 1 颗普通或更高品质宝石 — PROVISIONAL */
    eliteInvasion: { nameKey: 'event.eliteInvasion.name', timeoutSec: 120, affixCount: 2, gemMinCount: 1 },
  },

  /**
   * V1.0 胜利条件（Q10 采信）。状态：CONFIRMED。
   * 胜利 = 击杀 Boss；死亡 / 中途退出 = 失败；无第三结局，无撤离机制。
   */
  winCondition: {
    /** 唯一胜利路径 = 击杀 Boss（Q10 采信，删除"可选遭遇"表述）— CONFIRMED */
    kind: 'killBoss',
    /** 无撤离机制、无第三结局 — CONFIRMED */
    hasExtraction: false,
    hasThirdOutcome: false,
  },
} as const;
