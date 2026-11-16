/**
 * src/boss/tempo.ts — 三阶段攻击池与攻击间隔（TASK-06）
 *
 * 全部从冻结契约派生，不手抄任何攻击 ID / 预警时长：
 *   - 攻击表顺序 = enemyConfig.boss.attacks（设计总纲 §7.4 顺序：根须突刺 → 核心爆发），
 *     经 domain 的 bossDefinition() 组装后只读引用。
 *   - 阶段池 = 设计总纲 §7.3「第一阶段 3 招 / 第二阶段加入 2 招 / 第三阶段加入核心爆发」，
 *     按上表顺序切片（0 = 全池），不写死任何 ID。
 *   - 攻击间隔 = 该阶段池内最大预警时长 + 反应余量，保证硬约束
 *     「预警总时长 < 攻击间隔」恒成立；第三阶段余量更小 → 攻击节奏提高
 *     （设计总纲 §7.5「提高攻击压力，不单纯堆伤害」）。
 *
 * ⚠ PROVISIONAL：冻结契约只给了 telegraphSec，没有给「攻击间隔」这一数值。
 *   因此间隔由预警时长派生 + 反应余量（本文件唯一一处自定数值，集中标注）。
 *   若将来 config 增加攻击间隔字段，只需改 attackIntervalSec() 一处。
 */
import type { BossAttackDef, BossDefinition, BossPhase } from '../domain/index.ts';

/**
 * 阶段池截取长度（设计总纲 §7.3 结构，非数值配置）：
 * 0 = 全池（第三阶段六攻击全开）。
 */
const PHASE_POOL_LENGTH: Readonly<Record<BossPhase, number>> = {
  guardian: 3,
  corruption: 5,
  coreFrenzy: 0,
};

/**
 * 反应余量（秒）— PROVISIONAL：契约未定义攻击间隔，此处保证玩家在预警结束后
 * 仍有富余窗口走位；第三阶段收紧以体现「攻击节奏提高」。
 * 唯一硬约束：余量 > 0 ⇒ interval > 池内最大预警时长。
 */
const REACTION_MARGIN_SEC: Readonly<Record<BossPhase, number>> = {
  guardian: 2.3,
  corruption: 1.8,
  coreFrenzy: 1.2,
};

/** 某阶段的攻击池（从冻结契约 bossDefinition().attacks 切片）。 */
export function phaseAttackPool(phase: BossPhase, def: BossDefinition): readonly BossAttackDef[] {
  const len = PHASE_POOL_LENGTH[phase];
  return len === 0 ? def.attacks : def.attacks.slice(0, Math.min(len, def.attacks.length));
}

/** 池内最大预警时长（秒）；森林召唤 telegraphSec=0 不影响结果。 */
export function maxTelegraphSec(pool: readonly BossAttackDef[]): number {
  let max = 0;
  for (const a of pool) max = Math.max(max, a.telegraphSec);
  return max;
}

/** 某阶段攻击间隔（秒）：结算后到下一次预警开始之间的空档。 */
export function attackIntervalSec(phase: BossPhase, def: BossDefinition): number {
  return maxTelegraphSec(phaseAttackPool(phase, def)) + REACTION_MARGIN_SEC[phase];
}

export interface DodgeabilityRow {
  readonly phase: BossPhase;
  readonly poolSize: number;
  readonly maxTelegraphSec: number;
  readonly intervalSec: number;
  /** 预警总时长 < 攻击间隔 ⇒ 无不可躲避组合（TASK-06 验收）。 */
  readonly dodgeable: boolean;
}

/** 三阶段「预警 < 间隔」检查表（测试与运行时自检共用）。 */
export function dodgeabilityReport(def: BossDefinition): readonly DodgeabilityRow[] {
  return (['guardian', 'corruption', 'coreFrenzy'] as const).map((phase) => {
    const pool = phaseAttackPool(phase, def);
    const maxT = maxTelegraphSec(pool);
    const interval = attackIntervalSec(phase, def);
    return {
      phase,
      poolSize: pool.length,
      maxTelegraphSec: maxT,
      intervalSec: interval,
      dodgeable: maxT < interval,
    };
  });
}
