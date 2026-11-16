/**
 * TASK-02 魔法剑（sword）基础攻击 —— 120° 扇形挥砍。
 *
 * 只产出「攻击描述」，不结算伤害；扇形角度来自 DamageLayers.arcAngleDeg
 * （base 120 / cap 240，由 #10 剑气扩展派生），半径来自 config.sword.radiusM。
 * 本文件禁止 import Babylon / DOM。
 */
import {
  computeShotDamage,
  baseWeaponDamage,
  playerDefinition,
} from '../domain/index.ts';
import type { DamageLayers, Vec3 } from '../domain/index.ts';
import type { AttackRequest } from './types.ts';

/**
 * 组装一次剑挥砍。
 * 攻击形状（扇形 120° / 半径 2.5m）是 CONFIRMED 契约，
 * 唯一可变的是通过 DamageLayers.arcAngleDeg 传入的 #10 扩展角（上限 240°）。
 */
export function buildSwordAttack(origin: Vec3, facingDeg: number, layers: DamageLayers): AttackRequest {
  const def = playerDefinition();
  return {
    kind: 'sword',
    weaponId: 'sword',
    origin: { ...origin },
    facingDeg,
    arcAngleDeg: layers.arcAngleDeg,
    radiusM: def.sword.radiusM,
    damage: computeShotDamage(baseWeaponDamage('sword'), layers),
    lifestealPctMaxHp: layers.lifestealPctMaxHp,
  };
}
