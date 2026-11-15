/**
 * TASK-05 ｜ 行为补充参数
 *
 * 契约（config）覆盖：HP/伤害/移速/攻击间隔/体型/8m 射程/8m 跃程/4s 跃进 CD/
 * 6m 光环/+20% 友军移速/死亡分裂 2×(5HP/4伤)/全部词缀数值 —— 一律从 config 读取。
 *
 * 本文件只补齐契约**没有**的行为微参数（PROVISIONAL，TASK-05 首轮实机校准后
 * 建议沉入 config——但当前阶段禁止改冻结契约，故独立成模块数据）。
 */

export const BEHAVIOR_EXTRA = {
  /** 近战接触判定余量（米）：dist ≤ 双方半径 + 该值即可攻击 */
  meleeReachMarginM: 0.3,
  /** 影跃者跃进耗时（秒） */
  leapDurationSec: 0.35,
  /** 影跃者起跳最小距离（低于此距离直接近战） */
  leapMinRangeM: 2.0,
  /** 投射弹速度（米/秒） */
  projectileSpeedMps: 10.0,
  /** 投射弹碰撞半径（米） */
  projectileRadiusM: 0.35,
  /** 投射弹最长飞行时间（秒） */
  projectileLifetimeSec: 3.0,
  /** 投射者风筝带：内沿 = 射程 × 该系数 */
  kiteBandInnerRatio: 0.75,
  /** 风筝横移速度系数（占移速比例） */
  strafeSpeedPct: 0.6,
  /** 滋养体与玩家的保持距离（米） */
  nourisherFollowRangeM: 4.5,
  /** 唤灵者（eliteCaster）交战距离（米） */
  casterRangeM: 10.0,
  /** 猎犬包抄偏角（度） */
  flankAngleDeg: 55,
  /** 分裂词缀幼体数值（占猎犬基础 HP/伤害比例，「低生命普通怪」契约未给数） */
  eliteSplitStatPct: 0.5,
  /** 影跃者蓄力窗口（秒）：预警形状与落点一致，玩家可闪避 */
  leapWindupSec: 0.45,
  /** 剧毒死亡毒区半径（米） */
  toxicCloudRadiusM: 3.0,
  /** 分裂/召唤子体相对本体的散布半径（米） */
  minionScatterRadiusM: 1.5,
  /** 首领（双词缀领主）生成概率：首只必普通，其后无领主在场时掷骰 — PROVISIONAL */
  lordSpawnChance: 0.4,
  /** 尸体分裂/召唤允许的有界超同屏上限（+2，一次性保底，防无限增殖） */
  splitOvercapAllowance: 2,
} as const;
