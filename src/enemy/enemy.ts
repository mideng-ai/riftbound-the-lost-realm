/**
 * TASK-05 ｜ Enemy 基类
 *
 * 契约锚点：
 * - 数值全部来自 domain normalEnemyDefinition / eliteStats（→ config），禁止硬编码
 * - 受击一律走 domain.resolveDamageHit（红线）；护盾吸收在调用前后处理（契约注释授权）
 * - 状态槽使用 domain StatusSlots + effectiveControlCaps 按档位夹取
 * - 对象池友好：activate() 原地重置全部字段，运行期零容器分配
 */

import {
  createEmptyStatusSlots,
  effectiveControlCaps,
  enemyTierOf,
  resolveDamageHit,
} from '../domain/damage.ts';
import type { ControlTier, DamageResult, DamageSource, StatusSlots } from '../domain/damage.ts';
import { eliteStats, isEliteEnemyId, normalEnemyDefinition } from '../domain/enemy.ts';
import type { EnemyId } from '../domain/ids.ts';
import type { EntityId, Vec3 } from '../domain/types.ts';
import { BEHAVIOR_EXTRA } from './behaviorParams.ts';
import type { EnemyTickContext } from './types.ts';

export interface EnemyActivateOptions {
  readonly position?: Vec3;
  readonly hpScale?: number;
  readonly damageScale?: number;
  /** 直接覆盖最终 HP/伤害（分裂体/召唤物等派生数值；仍来自 config 派生，非硬编码） */
  readonly hpOverride?: number;
  readonly damageOverride?: number;
}

/** DoT tick 间隔（秒）：与帧率解耦 */
const DOT_TICK_SEC = 1.0;

export abstract class Enemy {
  entityId!: EntityId;
  defId!: EnemyId;
  tier: ControlTier = 'normal';
  isElite = false;

  hp = 0;
  maxHp = 0;
  /** 攻击面板值（已含 damageScale / 精英倍率 / 词缀加成） */
  damage = 0;
  moveSpeedMps = 0;
  attackIntervalSec = 0;
  radiusM = 0;
  xpValue = 0;

  position: Vec3 = { x: 0, y: 0, z: 0 };
  facingDeg = 0;
  attackTimer = 0;
  alive = false;

  /** 滋养体光环当帧加成（manager 每帧重算；契约：allySpeedPct=0.2） */
  auraSpeedPct = 0;

  /** 状态槽（domain 形状；控制上限按 tier 查表夹取） */
  statuses: StatusSlots = createEmptyStatusSlots();
  /** DoT 每层每秒伤害（由施加方传入 —— TASK-03 procResolver 的 payload 值） */
  burnDpsPerStack = 0;
  poisonDpsPerStack = 0;
  private burnTickTimer = 0;
  private poisonTickTimer = 0;

  // ------------------------------------------------------------------
  // 生命周期（池友好）
  // ------------------------------------------------------------------

  /** 从池中激活：按定义 + 缩放重置全部字段 */
  activate(defId: EnemyId, entityId: EntityId, opts: EnemyActivateOptions): this {
    const hpScale = opts.hpScale ?? 1;
    const damageScale = opts.damageScale ?? 1;
    // 普通怪走名册定义；精英走 Q2 基底派生（eliteStats），Boss 不进本系统。
    // 全部数值来自 domain → config，业务侧不写第二份数字。
    const stats = isEliteEnemyId(defId) ? eliteStats(defId) : normalEnemyDefinition(defId);
    this.defId = defId;
    this.entityId = entityId;
    this.tier = enemyTierOf(defId);
    this.isElite = this.tier === 'elite';
    this.maxHp = opts.hpOverride ?? stats.baseHp * hpScale;
    this.hp = this.maxHp;
    this.damage = opts.damageOverride ?? stats.baseDamage * damageScale;
    this.moveSpeedMps = stats.moveSpeed;
    this.attackIntervalSec = stats.attackIntervalSec;
    this.radiusM = stats.radiusM;
    this.xpValue = stats.xpValue;
    if (opts.position) {
      this.position.x = opts.position.x;
      this.position.y = opts.position.y ?? 0;
      this.position.z = opts.position.z;
    } else {
      this.position.x = 0;
      this.position.y = 0;
      this.position.z = 0;
    }
    this.facingDeg = 0;
    this.attackTimer = 0;
    this.alive = true;
    this.auraSpeedPct = 0;
    this.statuses = createEmptyStatusSlots();
    this.burnDpsPerStack = 0;
    this.poisonDpsPerStack = 0;
    this.burnTickTimer = 0;
    this.poisonTickTimer = 0;
    this.onReset();
    return this;
  }

  /** 子类行为字段重置（池复用入口） */
  protected abstract onReset(): void;

  /** 行为帧（先状态后行为；DoT 可致死） */
  update(ctx: EnemyTickContext, dt: number): void {
    if (!this.alive) return;
    this.updateStatuses(dt);
    if (!this.alive) return;
    if (this.attackTimer > 0) this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.updateBehavior(ctx, dt);
  }

  protected abstract updateBehavior(ctx: EnemyTickContext, dt: number): void;

  // ------------------------------------------------------------------
  // 受击（红线：只走 resolveDamageHit）
  // ------------------------------------------------------------------

  /**
   * 结算一次受击。
   * @param panelDamage 已乘 A×B×C 的单发面板值（TASK-02 传入 computeShotDamage 结果）
   */
  takeDamage(panelDamage: number, source: DamageSource, armorBreakBonus = 0): DamageResult {
    return this.resolveHit(panelDamage, source, armorBreakBonus);
  }

  /** 实际过结算器的血量口径（护盾子类覆写：护盾 + 本体） */
  protected hitPoolHp(): number {
    return this.hp;
  }

  /** 把结算器返回的 dealt 落到实体（护盾子类覆写吸收顺序） */
  protected applyDealt(dealt: number, killed: boolean): void {
    this.hp = killed ? 0 : this.hp - dealt;
    if (killed || this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  private resolveHit(panelDamage: number, source: DamageSource, armorBreakBonus: number): DamageResult {
    const result = resolveDamageHit({
      source,
      baseDamage: panelDamage,
      targetId: this.entityId,
      hitPos: this.position,
      targetHp: this.hitPoolHp(),
      targetTier: this.tier,
      armorBreakBonus,
    });
    this.applyDealt(result.dealt, result.killed);
    return result;
  }

  // ------------------------------------------------------------------
  // 状态槽（燃焰/减速/中毒/连锁标记；上限按档位查表）
  // ------------------------------------------------------------------

  /** 施加燃焰（dpsPerStack 由 TASK-03 proc payload 提供；层数夹取 burnMaxStacks） */
  applyBurn(dpsPerStack: number, durationSec: number, stacks: number): void {
    const caps = effectiveControlCaps(this.tier);
    this.burnDpsPerStack = dpsPerStack;
    this.statuses.burnStacks = Math.min(caps.burnMaxStacks, Math.max(0, stacks));
    this.statuses.burnTimerSec = Math.max(this.statuses.burnTimerSec, durationSec);
  }

  /** 施加减速（幅度夹取 slowMaxPct） */
  applySlow(pct: number, durationSec: number): void {
    const caps = effectiveControlCaps(this.tier);
    this.statuses.slowPct = Math.min(caps.slowMaxPct, Math.max(0, pct));
    this.statuses.slowTimerSec = Math.max(this.statuses.slowTimerSec, durationSec);
  }

  /** 施加中毒（dpsPerStack 由 proc payload 提供；层数夹取 poisonMaxStacks） */
  applyPoison(dpsPerStack: number, durationSec: number, stacks: number): void {
    const caps = effectiveControlCaps(this.tier);
    this.poisonDpsPerStack = dpsPerStack;
    this.statuses.poisonStacks = Math.min(caps.poisonMaxStacks, Math.max(0, stacks));
    this.statuses.poisonTimerSec = Math.max(this.statuses.poisonTimerSec, durationSec);
  }

  /** 连锁标记（每目标每次限 1 跳；每次连锁事件由调用方重置） */
  markChainJump(): void {
    this.statuses.chainJumpDone = true;
  }
  clearChainJump(): void {
    this.statuses.chainJumpDone = false;
  }

  private updateStatuses(dt: number): void {
    const s = this.statuses;
    // 燃焰
    if (s.burnTimerSec > 0 && s.burnStacks > 0) {
      s.burnTimerSec -= dt;
      this.burnTickTimer -= dt;
      while (this.burnTickTimer <= 0 && s.burnTimerSec > 0 && s.burnStacks > 0) {
        this.burnTickTimer += DOT_TICK_SEC;
        this.resolveHit(s.burnStacks * this.burnDpsPerStack * DOT_TICK_SEC, 'burnDot', 0);
        if (!this.alive) return;
      }
      if (s.burnTimerSec <= 0) s.burnStacks = 0;
    }
    // 中毒
    if (s.poisonTimerSec > 0 && s.poisonStacks > 0) {
      s.poisonTimerSec -= dt;
      this.poisonTickTimer -= dt;
      while (this.poisonTickTimer <= 0 && s.poisonTimerSec > 0 && s.poisonStacks > 0) {
        this.poisonTickTimer += DOT_TICK_SEC;
        this.resolveHit(s.poisonStacks * this.poisonDpsPerStack * DOT_TICK_SEC, 'poisonDot', 0);
        if (!this.alive) return;
      }
      if (s.poisonTimerSec <= 0) s.poisonStacks = 0;
    }
    // 减速
    if (s.slowTimerSec > 0) {
      s.slowTimerSec -= dt;
      if (s.slowTimerSec <= 0) s.slowPct = 0;
    }
  }

  /** 当前生效移速（减速 ×（1+光环）） */
  effectiveMoveSpeed(): number {
    return this.moveSpeedMps * (1 - this.statuses.slowPct) * (1 + this.auraSpeedPct);
  }

  // ------------------------------------------------------------------
  // 移动辅助（边界/障碍夹取由 manager 做，这里只算位移）
  // ------------------------------------------------------------------

  protected moveToward(target: Vec3, dt: number, speedScale = 1): void {
    const speed = this.effectiveMoveSpeed() * speedScale;
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    const step = Math.min(d, speed * dt);
    this.position.x += (dx / d) * step;
    this.position.z += (dz / d) * step;
    this.facingDeg = norm360((Math.atan2(dz, dx) * 180) / Math.PI);
  }

  protected moveAwayFrom(from: Vec3, dt: number, speedScale = 1): void {
    const speed = this.effectiveMoveSpeed() * speedScale;
    const dx = this.position.x - from.x;
    const dz = this.position.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    this.position.x += (dx / d) * speed * dt;
    this.position.z += (dz / d) * speed * dt;
    this.facingDeg = norm360((Math.atan2(dz, dx) * 180) / Math.PI);
  }

  protected distToPlayer(ctx: EnemyTickContext): number {
    const p = ctx.player.position;
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  /** 近战接触判定 */
  protected inMeleeReach(ctx: EnemyTickContext): boolean {
    return this.distToPlayer(ctx) <= ctx.player.radiusM + this.radiusM + BEHAVIOR_EXTRA.meleeReachMarginM;
  }

  /** 接触攻击（攻速受词缀影响由子类覆写 attackIntervalSec） */
  protected tryMeleeAttack(ctx: EnemyTickContext): boolean {
    if (this.attackTimer > 0 || !this.inMeleeReach(ctx)) return false;
    this.attackTimer = this.attackIntervalSec;
    ctx.damagePlayer(this.damage, this, 'melee');
    this.onDealtDamage(this.damage);
    return true;
  }

  /** 供管理器在「投射物/毒区命中玩家」后通知命中钩子（吸血词缀） */
  noteDamageDealt(amount: number): void {
    this.onDealtDamage(amount);
  }

  /** 命中钩子（吸血词缀覆写） */
  protected onDealtDamage(_amount: number): void {
    // 基类无效果
  }
}

function norm360(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}
