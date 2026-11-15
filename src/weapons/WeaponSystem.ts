/**
 * TASK-02 双武器系统 —— 独立冷却 / 独立强化等级 / 快速切换。
 *
 * 验收锚点：
 *   - 法杖与剑都可攻击并能快速切换；
 *   - 两把武器 Lv.1–Lv.5 永久强化状态互不覆盖；
 *   - 强化消费通过 Economy 接口完成，不在武器模块自行扣除资源；
 *   - 不改变已确认的魔法剑攻击形状（扇形 120° / 2.5m 来自 config + layers.arcAngleDeg）。
 *
 * 本文件禁止 import Babylon / DOM。
 */
import { weaponIntervalSec } from '../domain/index.ts';
import type {
  PlayerRuntime,
  WeaponId,
  WeaponUpgradeLevel,
  DamageLayers,
  InRunBuffEntry,
  Vec3,
  EventBusApi,
} from '../domain/index.ts';
import { playerConfig } from '../config/playerConfig.ts';
import { buildStaffAttack, type StaffAttackOptions } from './staffWeapon.ts';
import { buildSwordAttack } from './swordWeapon.ts';
import type {
  AttackRequest,
  WeaponLevelPort,
  WeaponRuntimeState,
  WeaponUpgradeEconomyPort,
} from './types.ts';
import { DENY_UPGRADE_ECONOMY } from './types.ts';

const MAX_WEAPON_LEVEL: WeaponUpgradeLevel = 5;

export interface WeaponSystemDeps {
  /** 玩家运行时（currentWeapon 是唯一事实源，存在 domain.PlayerRuntime 里） */
  readonly runtime: PlayerRuntime;
  readonly levelPort: WeaponLevelPort;
  readonly bus: EventBusApi;
  /** 未接 Economy 时拒绝所有强化，避免"白嫖升级" */
  readonly economy?: WeaponUpgradeEconomyPort;
}

export class WeaponSystem {
  private readonly runtime: PlayerRuntime;
  private readonly levelPort: WeaponLevelPort;
  private readonly bus: EventBusApi;
  private readonly economy: WeaponUpgradeEconomyPort;
  /** 两把武器各自独立的状态对象，切换不会互相写 */
  private readonly states: Record<WeaponId, WeaponRuntimeState>;

  constructor(deps: WeaponSystemDeps) {
    this.runtime = deps.runtime;
    this.levelPort = deps.levelPort;
    this.bus = deps.bus;
    this.economy = deps.economy ?? DENY_UPGRADE_ECONOMY;
    this.states = {
      staff: { id: 'staff', level: this.levelPort.getLevel('staff'), cooldownSec: 0 },
      sword: { id: 'sword', level: this.levelPort.getLevel('sword'), cooldownSec: 0 },
    };
  }

  get current(): WeaponId {
    return this.runtime.currentWeapon;
  }

  /** 只读状态快照（调试面板 / 测试用）。 */
  stateOf(weaponId: WeaponId): Readonly<WeaponRuntimeState> {
    return { ...this.states[weaponId] };
  }

  /** 武器永久强化等级（Lv.1–Lv.5）。 */
  levelOf(weaponId: WeaponId): WeaponUpgradeLevel {
    return this.states[weaponId].level;
  }

  /** A 区武器强化加成 = config.weaponUpgradePctByLevel[level-1]（裁决 #1：表值为该级总值）。 */
  weaponUpgradePct(weaponId: WeaponId): number {
    const level = this.states[weaponId].level;
    return playerConfig.weaponUpgradePctByLevel[level - 1] ?? 0;
  }

  /** 当前实际攻击间隔（含 intervalMul，−40% 上限由 domain 夹取）。 */
  intervalSec(weaponId: WeaponId, layers: DamageLayers): number {
    return weaponIntervalSec(weaponId, layers.intervalMul);
  }

  /** 两把武器 CD 独立递减——切换武器不会重置另一把的冷却。 */
  tick(dtSec: number): void {
    for (const id of ['staff', 'sword'] as const) {
      const s = this.states[id];
      s.cooldownSec = Math.max(0, s.cooldownSec - dtSec);
    }
  }

  /** 快速切换：即时生效，无切换 CD；只改 currentWeapon 并广播。 */
  switchWeapon(): { from: WeaponId; to: WeaponId } {
    const from = this.runtime.currentWeapon;
    const to: WeaponId = from === 'staff' ? 'sword' : 'staff';
    this.runtime.currentWeapon = to;
    this.bus.publish('weapon.switched', { from, to });
    return { from, to };
  }

  /**
   * 请求一次攻击。当前武器 CD 就绪时返回攻击描述并把该武器 CD 置为实际间隔；
   * 否则返回 null（不消耗、不改另一把武器）。
   */
  tryAttack(
    layers: DamageLayers,
    buffs: readonly InRunBuffEntry[],
    opts: StaffAttackOptions = {},
  ): AttackRequest | null {
    const id = this.runtime.currentWeapon;
    const state = this.states[id];
    if (state.cooldownSec > 0) return null;

    state.cooldownSec = this.intervalSec(id, layers);
    const origin: Vec3 = { ...this.runtime.transform.position };
    const facingDeg = this.runtime.transform.facingDeg;
    return id === 'staff'
      ? buildStaffAttack(origin, facingDeg, layers, buffs, opts)
      : buildSwordAttack(origin, facingDeg, layers);
  }

  /**
   * 局外永久强化：只向 Economy 端口发起扣费请求，成功后才 +1 并广播。
   * 森林材料成本与账户扣减完全由 TASK-04 实现，本模块不碰资源。
   * @returns 是否升级成功
   */
  requestUpgrade(weaponId: WeaponId): boolean {
    const state = this.states[weaponId];
    if (state.level >= MAX_WEAPON_LEVEL) return false;
    const from = state.level;
    if (!this.economy.chargeUpgrade(weaponId, from)) return false;
    const next = (from + 1) as WeaponUpgradeLevel;
    state.level = next;
    this.bus.publish('weapon.upgraded', { weaponId, level: next });
    return true;
  }
}
