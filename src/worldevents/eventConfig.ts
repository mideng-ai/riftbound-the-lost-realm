/**
 * TASK-05 ｜ 世界事件补充参数（PROVISIONAL）
 *
 * config 已定义：五事件的 timeoutSec / buffPct / hp / hpCostPctOfCurrent /
 * damageBuffPct / goldCost / attackSpeedBuffPct / durationSec / affixCount / gemMinCount。
 * 本文件只补契约**没有**的交互微参数（引导时长、交互半径、守巢刷怪节奏等），
 * 属 TASK-05 自有模块数据，集中一处便于实机校准；禁止写进冻结 config。
 */
export const EVENT_EXTRA = {
  /** 玩家与事件物件的交互半径（米） */
  interactRadiusM: 2.0,
  /** 事件物件距玩家的最小/最大落点距离（米，避免贴脸刷物件） */
  propMinPlayerDistM: 8,
  propMaxPlayerDistM: 25,
  /** 元素祭坛引导时长（秒）；离圈按 channelDecayMult 倍衰减 */
  elementalAltarChannelSec: 5.0,
  channelDecayMult: 2.0,
  /** 古老祭坛引导时长（秒） */
  ancientAltarChannelSec: 8.0,
  /** 怪物巢穴守巢怪刷新间隔与批量 */
  monsterNestSpawnIntervalSec: 8.0,
  monsterNestSpawnCount: 2,
  monsterNestSpawnRadiusM: 4.0,
  /** 精英入侵窗口外/满员时的降级狼群规模与血量系数 */
  eliteInvasionFallbackPackSize: 4,
  eliteInvasionFallbackHpScale: 1.5,
  /** 遗落宝箱奖励（金币 / 森林材料；TASK-04 校准口径） */
  chestGold: 20,
  chestMaterial: 3,
} as const;
