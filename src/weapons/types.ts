/**
 * TASK-02 双武器公共类型 / 端口。
 *
 * 分层纪律：武器模块只**读**契约与配置，不持有存档、不自行扣除资源
 * （TASK-02 验收「强化消费通过 Economy 接口完成」）。
 * 本文件禁止 import Babylon / DOM。
 */
import type {
  WeaponId,
  WeaponUpgradeLevel,
  Vec3,
  InRunBuffEntry,
} from '../domain/index.ts';

/** 两把武器各自独立的运行时状态：等级与冷却互不覆盖。 */
export interface WeaponRuntimeState {
  readonly id: WeaponId;
  level: WeaponUpgradeLevel;
  /** 剩余冷却（秒）；切换武器不会重置另一把的 CD */
  cooldownSec: number;
}

/**
 * 武器永久强化等级来源（存档 / Economy 实现，武器模块只读不写）。
 * TASK-01 契约 SaveDataV3.weapons[weaponId].level 即此值的真实来源。
 */
export interface WeaponLevelPort {
  getLevel(weaponId: WeaponId): WeaponUpgradeLevel;
}

/**
 * Economy 强化消费接口（TASK-04 实现）。
 *
 * 契约：武器模块**只发起请求**，森林材料成本与扣除全部由 Economy 侧完成；
 * 返回 true 表示已扣费并批准升级，武器模块才把等级 +1 并广播 weapon.upgraded。
 */
export interface WeaponUpgradeEconomyPort {
  /** @returns 是否成功扣费并批准从 fromLevel 升到 fromLevel+1 */
  chargeUpgrade(weaponId: WeaponId, fromLevel: WeaponUpgradeLevel): boolean;
}

/** 拒绝一切升级的兜底实现（未接 Economy 时使用，避免静默白嫖强化）。 */
export const DENY_UPGRADE_ECONOMY: WeaponUpgradeEconomyPort = {
  chargeUpgrade: () => false,
};

/** 一次攻击的描述（渲染无关；由 CombatRuntime 消费）。 */
export type AttackRequest =
  | {
      readonly kind: 'staff';
      readonly weaponId: 'staff';
      readonly origin: Vec3;
      readonly facingDeg: number;
      /** 分裂弹弹道数（DamageLayers.projectileCount，≤4） */
      readonly projectileCount: number;
      /** 弹速 m/s（config.staff.projectileSpeedMps） */
      readonly speedMps: number;
      /** 单发已摊薄伤害（computeShotDamage） */
      readonly damagePerShot: number;
      /** 可额外穿透的目标数（穿透法术 #3） */
      readonly pierceTargets: number;
      /** 当前局内 buff（供 CombatResolver 读取派生属性） */
      readonly buffs: readonly InRunBuffEntry[];
    }
  | {
      readonly kind: 'sword';
      readonly weaponId: 'sword';
      readonly origin: Vec3;
      readonly facingDeg: number;
      /** 扇形张角（DamageLayers.arcAngleDeg，base 120 / cap 240） */
      readonly arcAngleDeg: number;
      /** 扇形半径（config.sword.radiusM = 2.5） */
      readonly radiusM: number;
      /** 单次伤害（computeShotDamage） */
      readonly damage: number;
      /** 吸血剑气：按最大生命比例回复 */
      readonly lifestealPctMaxHp: number;
    };

/** 静态等级端口（测试 / 未接存档时使用；默认两把均 Lv.1）。 */
export class StaticWeaponLevelPort implements WeaponLevelPort {
  private readonly levels: Record<WeaponId, WeaponUpgradeLevel>;

  constructor(levels: Partial<Record<WeaponId, WeaponUpgradeLevel>> = {}) {
    this.levels = { staff: levels.staff ?? 1, sword: levels.sword ?? 1 };
  }

  getLevel(weaponId: WeaponId): WeaponUpgradeLevel {
    return this.levels[weaponId];
  }

  /** 仅测试/Economy 侧写入；武器模块自身不调用 */
  setLevel(weaponId: WeaponId, level: WeaponUpgradeLevel): void {
    this.levels[weaponId] = level;
  }
}
