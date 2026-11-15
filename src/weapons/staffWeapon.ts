/**
 * TASK-02 法杖（staff）基础攻击 —— 魔法箭。
 *
 * 只产出「攻击描述」，不结算伤害；数值全部来自 domain 派生函数与 config。
 * 本文件禁止 import Babylon / DOM。
 */
import {
  computeShotDamage,
  baseWeaponDamage,
  playerDefinition,
} from '../domain/index.ts';
import type { DamageLayers, InRunBuffEntry, Vec3 } from '../domain/index.ts';
import type { AttackRequest } from './types.ts';

/** 穿透目标数：pierce 类 buff 的 pct 存「可穿透数」，重复拿同一张卡按最大 tier 生效。 */
export function pierceTargetCount(buffs: readonly InRunBuffEntry[]): number {
  let count = 0;
  for (const b of buffs) {
    if (b.category === 'pierce' && Number.isFinite(b.pct)) count = Math.max(count, Math.floor(b.pct));
  }
  return count;
}

/** 分裂弹各弹道相对朝向的偏角（度）。纯几何布局，config 未定义该项，由调用方注入。 */
export function staffProjectileAngles(count: number, spreadDeg: number): number[] {
  const n = Math.max(1, Math.floor(count));
  if (n === 1) return [0];
  const angles: number[] = [];
  for (let i = 0; i < n; i++) angles.push((i - (n - 1) / 2) * spreadDeg);
  return angles;
}

export interface StaffAttackOptions {
  /** 法杖弹速，默认取 playerDefinition().staff.projectileSpeedMps（14 m/s） */
  readonly speedMps?: number;
  /** 分裂弹散开角（纯视觉/几何参数，非平衡数值） */
  readonly spreadDeg?: number;
}

/**
 * 组装一次法杖齐射。
 * 单发面板伤害 = computeShotDamage(baseWeaponDamage('staff'), layers)，
 * 已包含分裂弹 ×0.6^extra 摊薄（domain/damage.ts 契约）。
 */
export function buildStaffAttack(
  origin: Vec3,
  facingDeg: number,
  layers: DamageLayers,
  buffs: readonly InRunBuffEntry[],
  opts: StaffAttackOptions = {},
): AttackRequest {
  const def = playerDefinition();
  return {
    kind: 'staff',
    weaponId: 'staff',
    origin: { ...origin },
    facingDeg,
    projectileCount: layers.projectileCount,
    speedMps: opts.speedMps ?? def.staff.projectileSpeedMps,
    damagePerShot: computeShotDamage(baseWeaponDamage('staff'), layers),
    pierceTargets: pierceTargetCount(buffs),
    buffs,
  };
}
