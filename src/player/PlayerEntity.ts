/**
 * TASK-02 玩家实体（NEW-01）。
 *
 * 契约纪律：
 *   - 运行时状态**直接使用 domain 的 PlayerRuntime**（扁平、对象池友好），不另造一份；
 *   - 生命 / 无敌帧 / Dash 全部通过 domain 的纯函数派生，数值唯一来源 config/playerConfig.ts；
 *   - 本文件禁止 import Babylon / DOM（分层铁律 L3），可在 node:test 里直接跑。
 *
 * 状态槽：domain.PlayerRuntime.statusSlots 由本实体维护计时器（到期清层），
 * DOT 伤害结算属于敌人 / 词缀系统范围，TASK-02 不越界实现。
 */
import {
  createPlayerRuntime,
  applyPlayerDamage,
  playerDefinition,
  dashSpeedMps,
  dashCooldownSec,
} from '../domain/index.ts';
import type {
  PlayerRuntime,
  EntityId,
  Vec3,
  EventBusApi,
  DamageSource,
  StatusSlots,
  DamageLayers,
} from '../domain/index.ts';

/** 归一化到 [0, 360)。 */
export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** 维护状态槽计时器：到期把对应层数 / 百分比清零（不结算 DOT 伤害）。 */
export function tickStatusSlots(slots: StatusSlots, dtSec: number): void {
  slots.burnTimerSec = Math.max(0, slots.burnTimerSec - dtSec);
  if (slots.burnTimerSec === 0) slots.burnStacks = 0;
  slots.slowTimerSec = Math.max(0, slots.slowTimerSec - dtSec);
  if (slots.slowTimerSec === 0) slots.slowPct = 0;
  slots.poisonTimerSec = Math.max(0, slots.poisonTimerSec - dtSec);
  if (slots.poisonTimerSec === 0) slots.poisonStacks = 0;
}

export interface PlayerEntityDeps {
  readonly entityId: EntityId;
  readonly spawnPos: Vec3;
  /** 必须来自 deriveMaxHp(gemVitalityPct, forestSurvivalPctOfLevel(...))，不得硬编码 100 */
  readonly maxHp: number;
  readonly bus: EventBusApi;
}

/**
 * 玩家实体：持有 domain.PlayerRuntime，负责把「扣血 / 无敌帧 / Dash / 移动」写进状态。
 *
 * Dash 语义（规划书 §2.2 + Q9）：3.5m 匀速冲刺 / 0.15s / CD 1.5s / **冲刺期间不无敌**。
 * 冲刺位移按「剩余距离」结算，保证跨帧累加后总位移精确等于 distanceM。
 */
export class PlayerEntity {
  readonly runtime: PlayerRuntime;
  private readonly bus: EventBusApi;
  private readonly def = playerDefinition();
  private dashDirX = 0;
  private dashDirZ = 0;
  private dashRemainingM = 0;

  constructor(deps: PlayerEntityDeps) {
    this.runtime = createPlayerRuntime(deps.entityId, deps.spawnPos, deps.maxHp);
    this.bus = deps.bus;
  }

  get hp(): number {
    return this.runtime.hp;
  }

  get maxHp(): number {
    return this.runtime.maxHp;
  }

  get isDead(): boolean {
    return this.runtime.hp <= 0;
  }

  /** Dash 冷却剩余（秒）。 */
  get dashCooldownRemainingSec(): number {
    return this.runtime.dashTimerSec;
  }

  /** 受击无敌帧剩余（秒）。 */
  get invulnRemainingSec(): number {
    return this.runtime.invulnTimerSec;
  }

  /** 递增计时器：无敌帧 / Dash CD / 状态槽。Dash 位移单独在 stepDash 结算。 */
  tick(dtSec: number): void {
    const r = this.runtime;
    r.invulnTimerSec = Math.max(0, r.invulnTimerSec - dtSec);
    r.dashTimerSec = Math.max(0, r.dashTimerSec - dtSec);
    tickStatusSlots(r.statusSlots, dtSec);
  }

  /**
   * 常规移动。moveSpeedMul 来自 DamageLayers.moveSpeedMul（疾风步 #11）。
   * 输入向量自动归一化，斜向不会超速；朝向按世界 x/z 平面计算（0° = +X）。
   */
  move(dirX: number, dirZ: number, dtSec: number, moveSpeedMul: number): void {
    const r = this.runtime;
    const len = Math.hypot(dirX, dirZ);
    if (len <= 1e-6) return;
    const nx = dirX / len;
    const nz = dirZ / len;
    const mul = Number.isFinite(moveSpeedMul) ? Math.max(0, moveSpeedMul) : 1;
    const speed = this.def.moveSpeedMps * mul;
    r.transform.position.x += nx * speed * dtSec;
    r.transform.position.z += nz * speed * dtSec;
    r.transform.facingDeg = normalizeDeg((Math.atan2(nz, nx) * 180) / Math.PI);
  }

  /** 直接设定朝向（鼠标瞄准用）。 */
  setFacingDeg(deg: number): void {
    this.runtime.transform.facingDeg = normalizeDeg(deg);
  }

  /** 设定世界坐标（场景接线 / 出生点复用）。 */
  setPosition(pos: Vec3): void {
    this.runtime.transform.position.x = pos.x;
    this.runtime.transform.position.y = pos.y;
    this.runtime.transform.position.z = pos.z;
  }

  /**
   * 尝试触发 Dash。无输入方向时沿当前朝向冲刺。
   * @returns 是否成功触发（CD 未就绪返回 false）
   */
  tryDash(dirX: number, dirZ: number, layers: DamageLayers): boolean {
    const r = this.runtime;
    if (r.dashTimerSec > 0 || this.isDead) return false;

    const len = Math.hypot(dirX, dirZ);
    if (len > 1e-6) {
      this.dashDirX = dirX / len;
      this.dashDirZ = dirZ / len;
    } else {
      const rad = (r.transform.facingDeg * Math.PI) / 180;
      this.dashDirX = Math.cos(rad);
      this.dashDirZ = Math.sin(rad);
    }

    r.dashTimerSec = dashCooldownSec(layers.dashCdMul);
    r.dashActiveTimerSec = this.def.dash.durationSec;
    this.dashRemainingM = this.def.dash.distanceM;
    // 规划书 §2.2：Dash 无敌帧 = 0（this.def.dash.invulnSec）。
    // 这里**刻意不写** r.invulnTimerSec —— 冲刺期间照常可被击中。
    return true;
  }

  /** 结算本帧冲刺位移；总位移夹到 def.dash.distanceM，冲刺速度取 domain.dashSpeedMps()。 */
  stepDash(dtSec: number): void {
    const r = this.runtime;
    if (r.dashActiveTimerSec <= 0) return;
    const active = Math.min(dtSec, r.dashActiveTimerSec);
    const step = Math.min(dashSpeedMps() * active, this.dashRemainingM);
    r.transform.position.x += this.dashDirX * step;
    r.transform.position.z += this.dashDirZ * step;
    this.dashRemainingM -= step;
    r.dashActiveTimerSec = Math.max(0, r.dashActiveTimerSec - dtSec);
  }

  /**
   * 受击：唯一入口走 domain.applyPlayerDamage（含无敌帧判定与 damageTakenMul）。
   * 命中后设置 0.5s 无敌帧，并广播 player.damaged / player.died。
   * @returns 实际扣血量（0 = 无敌帧内或已死亡）
   */
  takeDamage(rawDamage: number, layers: DamageLayers, source: DamageSource, atSec: number): number {
    const r = this.runtime;
    const dealt = applyPlayerDamage(r, rawDamage, layers.damageTakenMul);
    if (dealt <= 0) return 0;
    r.hp = Math.max(0, r.hp - dealt);
    r.invulnTimerSec = this.def.hitInvulnSec;
    this.bus.publish('player.damaged', { amount: dealt, source, hpLeft: r.hp });
    if (r.hp <= 0) this.bus.publish('player.died', { atSec });
    return dealt;
  }

  /** 回血（吸血剑气 / 汲取），夹到 maxHp。 */
  heal(amount: number): number {
    if (this.isDead || !Number.isFinite(amount) || amount <= 0) return 0;
    const before = this.runtime.hp;
    this.runtime.hp = Math.min(this.runtime.maxHp, this.runtime.hp + amount);
    return this.runtime.hp - before;
  }
}
