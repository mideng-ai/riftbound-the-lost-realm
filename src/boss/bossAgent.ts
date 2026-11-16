/**
 * src/boss/bossAgent.ts — 裂隙守望者 The Rift Warden（TASK-06 Boss Agent）
 *
 * 全部契约数值只读引用冻结层：
 *   bossDefinition()（HP/攻击/阶段/summonCap）· bossPhaseAtHp() · RUN_TIMELINE ·
 *   bossPeriodRule() · resolveDamageHit() · EventBus 契约事件。
 *
 * 行为：
 * - 登场：时钟 600s 翻牌驱动（syncFromClock 幂等），510s 发 boss.warning_started
 * - 三阶段：guardian→corruption→coreFrenzy，只进不退，发 boss.phase_changed
 * - 六攻击循环：idle → 预警(telegraphSec) → 结算 → 间隔(派生)；同一时刻单攻击槽
 * - 腐化藤蔓持续区（每秒 damage，持续 corruptVinesDurationSec）
 * - 森林召唤（无预警无伤害，受 summonCap / normalCap 上限）
 * - 核心爆发 → recoveryWindowSec 输出窗口（Boss 停手）
 * - 受击只经 resolveDamageHit 单点结算（破甲 = 面板 ×(1+armorBreakBonus)，绝不双计）
 * - 不免疫任一武器/元素；死亡 → 一次性胜利结算（契约事件 + Reward 端口）
 *
 * 红线：不直接操作 UI / 存档；不改 src/domain、src/config；不 import Babylon / DOM。
 */
import {
  RUN_TIMELINE,
  bossDefinition,
  bossPeriodRule,
  bossPhaseAtHp,
  resolveDamageHit,
} from '../domain/index.ts';
import type {
  BossAttackDef,
  BossAttackId,
  BossDefinition,
  BossPhase,
  EntityId,
  EventBusApi,
  Rng,
  RunClockApi,
  Vec3,
} from '../domain/index.ts';
import { attackKind, buildAttackShape, summonCountOf, vineZoneDurationSec } from './attacks.ts';
import { attackIntervalSec, phaseAttackPool } from './tempo.ts';
import { pointInTelegraph, type TelegraphShape } from './telegraph.ts';
import { SummonDirector } from './summons.ts';
import { VictorySettler } from './victory.ts';
import type {
  BossAgentOptions,
  BossAgentState,
  BossPorts,
  BossSpawnPolicy,
  LastHitInfo,
  PersistentZone,
  TelegraphSnapshot,
  WeaponHitInput,
} from './types.ts';

const PHASE_ORDER: readonly BossPhase[] = ['guardian', 'corruption', 'coreFrenzy'];

/** Boss 实体 ID 占位：结算器只透传 targetId，不查实体表；接线时由 options.entityId 覆写。 */
const DEFAULT_BOSS_ENTITY_ID = 0 as EntityId;

interface TelegraphRuntime {
  readonly attack: BossAttackDef;
  readonly shape: TelegraphShape;
  timeLeftSec: number;
  readonly totalSec: number;
}

export class BossAgent {
  private readonly ports: BossPorts;
  private readonly bus: EventBusApi;
  private readonly rng: Rng;
  private readonly def: BossDefinition;
  private readonly entityId: EntityId;
  private readonly summonDirector: SummonDirector;
  private readonly victory: VictorySettler;
  private readonly maxHp: number;
  private hpNow: number;

  private agentState: BossAgentState = 'dormant';
  private bossPos: Vec3 = { x: 0, y: 0, z: 0 };
  private currentPhase: BossPhase = 'guardian';
  private telegraph: TelegraphRuntime | null = null;
  private idleTimerSec = 0;
  private lastAttackId: BossAttackId | null = null;
  private coreExposeTimerSec = 0;
  private zones: PersistentZone[] = [];
  private warningPublished = false;
  private lastHit: LastHitInfo | null = null;

  constructor(ports: BossPorts, options: BossAgentOptions = {}) {
    this.ports = ports;
    this.bus = ports.bus;
    this.rng = ports.rng;
    this.def = bossDefinition();
    this.entityId = options.entityId ?? DEFAULT_BOSS_ENTITY_ID;
    this.maxHp = this.def.baseHp;
    this.hpNow = this.maxHp;
    this.summonDirector = new SummonDirector({
      summons: ports.summons,
      rng: ports.rng,
      summonCap: this.def.summonCap,
    });
    this.victory = new VictorySettler({
      bus: ports.bus,
      rewards: ports.rewards,
      elapsedSec: () => ports.clockElapsedSec(),
    });
  }

  // ── 生命周期 / 时间轴 ──────────────────────────────────────

  /**
   * Boss 正式登场（引擎在时钟 bossSpawned 翻牌时经 syncFromClock 调用）。
   * 契约：clearOnSpawn=false —— 不清场，已有怪由 Spawn 系统自己保留。
   */
  spawn(pos: Vec3): void {
    if (this.agentState !== 'dormant') return;
    this.bossPos = { x: pos.x, y: 0, z: pos.z };
    this.agentState = 'active';
    this.idleTimerSec = attackIntervalSec(this.currentPhase, this.def);
    this.bus.publish('boss.spawned', { atSec: this.ports.clockElapsedSec() });
  }

  /**
   * 时钟 → Agent 的每帧同步（幂等）：
   * - 510s 翻牌 → 发契约事件 boss.warning_started（atSec = 实际时钟，误差 ≤ 1 帧）
   * - 600s 翻牌 → 登场 + 发契约事件 boss.spawned
   */
  static syncFromClock(clock: RunClockApi, agent: BossAgent, spawnPos: Vec3): void {
    if (clock.bossWarningStarted && !agent.warningPublished) {
      agent.warningPublished = true;
      agent.bus.publish('boss.warning_started', { atSec: agent.ports.clockElapsedSec() });
    }
    if (clock.bossSpawned && agent.state === 'dormant') {
      agent.spawn(spawnPos);
    }
  }

  get state(): BossAgentState {
    return this.agentState;
  }

  get hp(): number {
    return this.hpNow;
  }

  get maxHpValue(): number {
    return this.maxHp;
  }

  /** 冻结契约组装出的 Boss 定义（只读）。 */
  get definition(): BossDefinition {
    return this.def;
  }

  get phase(): BossPhase {
    return this.currentPhase;
  }

  get position(): Vec3 {
    return { ...this.bossPos };
  }

  /** 当前地面预警（渲染层画贴花的唯一数据源；无预警为 null）。 */
  get currentTelegraph(): TelegraphSnapshot | null {
    if (!this.telegraph) return null;
    return {
      attack: this.telegraph.attack.id,
      def: this.telegraph.attack,
      shape: this.telegraph.shape,
      timeLeftSec: this.telegraph.timeLeftSec,
      totalSec: this.telegraph.totalSec,
    };
  }

  get isCoreExposed(): boolean {
    return this.coreExposeTimerSec > 0;
  }

  get coreExposeRemainingSec(): number {
    return Math.max(0, this.coreExposeTimerSec);
  }

  get activeZones(): readonly PersistentZone[] {
    return this.zones.map((z) => ({ ...z }));
  }

  get lastHitInfo(): LastHitInfo | null {
    return this.lastHit ? { ...this.lastHit } : null;
  }

  get houndRefillDeferredLast(): boolean {
    return this.summonDirector.lastRefillDeferred;
  }

  get isWarningPublished(): boolean {
    return this.warningPublished;
  }

  /** Boss 期刷怪策略（TASK-05 接线用；全部从冻结契约派生）。 */
  spawnPolicy(): BossSpawnPolicy {
    const rule = bossPeriodRule();
    return {
      regularSpawnsEnabled: false, // 停刷（规划书 §2.3 Boss 期硬规则）
      eliteAllowed: !rule.eliteBanned,
      maxNormals: rule.normalCap,
      clearOnSpawn: rule.clearOnSpawn,
    };
  }

  /** 时间轴权威值（只读引用，供 UI / 音效接线）。 */
  static get timeline(): typeof RUN_TIMELINE {
    return RUN_TIMELINE;
  }

  // ── 受击（破甲只经 resolveDamageHit 乘一次）────────────────

  /**
   * 玩家武器命中 Boss，返回实际扣血。
   *
   * 「Boss 不免疫任一武器或元素」：weapon/element 只做记录，不做任何门控；
   * baseDamage 是已乘 A×B×C 的面板值（不含破甲），破甲由 resolveDamageHit
   * 按 targetTier='boss' 乘一次 —— 结构上杜绝 ×1.5×1.5 双计。
   */
  receiveHit(input: WeaponHitInput): number {
    if (this.agentState !== 'active') return 0;
    const result = resolveDamageHit({
      source: input.source,
      baseDamage: input.baseDamage,
      targetId: this.entityId,
      hitPos: input.hitPos,
      targetHp: this.hpNow,
      targetTier: 'boss',
      armorBreakBonus: input.layers.armorBreakBonus,
    });
    this.lastHit = {
      source: input.source,
      weapon: input.weapon,
      element: input.element,
      dealt: result.dealt,
    };
    this.hpNow = Math.max(0, this.hpNow - result.dealt);
    if (result.killed) this.defeat();
    return result.dealt;
  }

  // ── 帧更新 ────────────────────────────────────────────────

  update(dtSec: number): void {
    if (this.agentState !== 'active') return;
    if (!Number.isFinite(dtSec) || dtSec <= 0) return;

    // 1. 阶段推进（只进不退）。
    const byHp = bossPhaseAtHp(this.hpNow / this.maxHp);
    if (PHASE_ORDER.indexOf(byHp) > PHASE_ORDER.indexOf(this.currentPhase)) {
      this.currentPhase = byHp;
      this.bus.publish('boss.phase_changed', { phase: byHp, hpPct: this.hpNow / this.maxHp });
    }

    // 2. Boss 期硬规则：45s 猎犬补充心跳。
    this.summonDirector.tickHoundRefill(dtSec, this.bossPos);

    // 3. 持续危险区（腐化藤蔓）：站区内每秒掉血，跑出即停。
    if (this.ports.player.playerAlive()) {
      for (const zone of this.zones) {
        if (pointInTelegraph(zone.shape, this.ports.player.playerPos())) {
          this.ports.player.damagePlayer(zone.damagePerSec * dtSec, zone.attack);
        }
      }
    }
    this.zones = this.zones.filter((z) => {
      z.remainingSec -= dtSec;
      return z.remainingSec > 0;
    });

    // 4. 核心暴露：Boss 停手站桩，倒计时结束后恢复攻击循环。
    if (this.coreExposeTimerSec > 0) {
      this.coreExposeTimerSec -= dtSec;
      if (this.coreExposeTimerSec <= 0) {
        this.coreExposeTimerSec = 0;
        this.idleTimerSec = attackIntervalSec(this.currentPhase, this.def);
      }
      return;
    }

    // 5. 攻击状态机（单攻击槽：预警中不可能开第二个攻击 → 无重叠组合）。
    if (this.telegraph) {
      this.telegraph.timeLeftSec -= dtSec;
      if (this.telegraph.timeLeftSec <= 0) {
        const { attack, shape } = this.telegraph;
        this.telegraph = null;
        this.resolveAttack(attack, shape);
      }
      return;
    }

    this.idleTimerSec -= dtSec;
    if (this.idleTimerSec <= 0) this.startNextAttack();
  }

  // ── 内部 ──────────────────────────────────────────────────

  private startNextAttack(): void {
    const pool = phaseAttackPool(this.currentPhase, this.def);
    const candidates = pool.length > 1 ? pool.filter((a) => a.id !== this.lastAttackId) : pool;
    const attack = this.rng.pick(candidates.length > 0 ? candidates : pool);
    const shape = buildAttackShape({
      attack,
      bossPos: this.bossPos,
      playerPos: this.ports.player.playerPos(),
      radiusM: this.def.radiusM,
      rng: this.rng,
    });
    this.lastAttackId = attack.id;

    if (attack.telegraphSec <= 0) {
      // 契约：森林召唤 telegraphSec=0（无预警），立即结算、直接伤害为 0。
      this.resolveAttack(attack, shape);
      return;
    }

    this.telegraph = {
      attack,
      shape,
      timeLeftSec: attack.telegraphSec,
      totalSec: attack.telegraphSec,
    };
    this.ports.feedback?.onTelegraph?.(attack.id, shape, attack.telegraphSec);
  }

  private resolveAttack(attack: BossAttackDef, shape: TelegraphShape): void {
    const kind = attackKind(attack.id);
    let hitPlayer = false;

    if (kind === 'direct') {
      if (this.ports.player.playerAlive() && pointInTelegraph(shape, this.ports.player.playerPos())) {
        this.ports.player.damagePlayer(attack.damage, attack.id);
        hitPlayer = true;
      }
    } else if (kind === 'dotZone') {
      // 契约：腐化藤蔓 damage 为每秒值，持续时间读 enemyConfig。
      this.zones.push({
        attack: attack.id,
        shape,
        damagePerSec: attack.damage,
        remainingSec: vineZoneDurationSec(),
      });
    } else {
      // 契约：森林召唤无伤害，召唤数量受 summonCap / normalCap 上限。
      this.summonDirector.trySummonMinions(summonCountOf(attack), this.ports.player.playerPos());
    }

    if (attack.recoveryWindowSec > 0) {
      // 契约：核心爆发后核心暴露输出窗口（重型攻击后的可利用窗口，§7.5）。
      this.coreExposeTimerSec = attack.recoveryWindowSec;
      this.ports.feedback?.onCoreExposed?.(attack.recoveryWindowSec);
    }

    this.ports.feedback?.onAttackResolved?.(attack.id, hitPlayer);
    // 间隔从结算后起算 —— 预警与结算期间不存在第二个攻击（可躲避保证）。
    this.idleTimerSec = attackIntervalSec(this.currentPhase, this.def);
  }

  private defeat(): void {
    if (this.agentState !== 'active') return;
    this.agentState = 'defeated';
    this.telegraph = null;
    this.coreExposeTimerSec = 0;
    this.zones = [];
    // 一次性胜利结算（契约事件 + Reward 端口；重复调用被守卫拦截）。
    this.victory.settle();
  }
}
