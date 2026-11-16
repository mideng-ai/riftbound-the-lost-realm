/**
 * src/combat/BossCombatBridge.ts — TASK-06 BossAgent ↔ TASK-02 CombatRuntime 集成适配层。
 *
 * 追溯：GDD 设计-设计总纲.md §7.1–§7.6 / 美术-美术圣经V0.5.md §4.1 / 冻结契约 src/domain + src/config。
 * 本文件是【集成层胶水】，不是 Boss 模块内部实现：BossAgent 的 8 个源文件一行未改。
 *
 * 职责边界：
 *  - HP 权威归 BossAgent（hpNow 只有 receiveHit 会改）；registry 里的 EnemyTarget 只是
 *    「命中几何载体 + UI 血条镜像」，每帧由 syncTarget() 从 agent 读回，绝不反向写 agent。
 *  - 玩家攻击命中 Boss 时，CombatResolver 已按 boss 档位结算出 dealt（含破甲一次）。
 *    本层把 dealt 还原成面板值后调用 agent.receiveHit() —— 内部再次走 domain.resolveDamageHit，
 *    乘 (1+armorBreakBonus) 恰好回到 dealt。破甲全程只乘一次，绝不双计。
 *  - Boss 对玩家的伤害经 damagePlayer 端口累积，由 BootstrapScene 注入 combat.step(incomingDamage)，
 *    仍走 TASK-02 唯一受击结算（0.5s 无敌帧 / damageTakenMul 不被绕过）。
 *  - boss.defeated → run.phaseChanged('victory') → run.settled → SettlementScreen 胜利屏。
 *  - 不 import Babylon / DOM；可在 Node 测试编译链（tsconfig.test.json）里直接单测。
 */
import { BossAgent } from '../boss/index.ts';
import type { BossFeedbackPort, BossSummonPort, WeaponHitInput } from '../boss/index.ts';
import type {
  EntityId,
  EventBusApi,
  Rng,
  Unsubscribe,
  Vec3,
  WeaponId,
} from '../domain/index.ts';
import type { CombatRuntime } from './CombatRuntime.ts';
import type { EnemyTarget } from './TargetRegistry.ts';

/** 与 BootstrapScene 既有 Boss 镜像目标同 id 段，避免与 EnemyManager 自增 id 相撞。 */
export const BOSS_BRIDGE_ENTITY_ID = 1_000_001 as EntityId;

export interface BossCombatBridgeDeps {
  readonly combat: CombatRuntime;
  /** 必须与 CombatRuntime / UiRoot 共用同一条领域总线。 */
  readonly bus: EventBusApi;
  readonly rng: Rng;
  readonly summons: BossSummonPort;
  /** Boss 登场位置（集成层取景决定，不是平衡数值）。 */
  readonly spawnPos: Vec3;
  readonly feedback?: BossFeedbackPort;
  readonly entityId?: EntityId;
}

export class BossCombatBridge {
  readonly agent: BossAgent;
  private readonly combat: CombatRuntime;
  private readonly bus: EventBusApi;
  private readonly spawnPos: Vec3;
  private target: EnemyTarget | null = null;
  private pendingPlayerDamage = 0;
  /** 只读取证：Boss 累计对玩家造成的原始伤害（不参与任何玩法结算）。 */
  private totalPlayerDamageDealt = 0;
  private readonly unsubs: Unsubscribe[] = [];

  constructor(deps: BossCombatBridgeDeps) {
    this.combat = deps.combat;
    this.bus = deps.bus;
    this.spawnPos = { ...deps.spawnPos };

    this.agent = new BossAgent(
      {
        clockElapsedSec: () => this.combat.progression.clock.elapsedSec,
        player: {
          playerPos: () => this.combat.player.runtime.transform.position,
          playerAlive: () => !this.combat.player.isDead && this.combat.player.hp > 0,
          damagePlayer: (amount) => {
            this.pendingPlayerDamage += amount;
          },
        },
        summons: deps.summons,
        rewards: {
          // TASK-04 Economy 未接入本试玩：不伪造资源入账，也不写存档（Boss 红线）。
          grantBossVictory: () => undefined,
        },
        bus: deps.bus,
        rng: deps.rng,
        feedback: deps.feedback,
      },
      { entityId: deps.entityId ?? BOSS_BRIDGE_ENTITY_ID },
    );

    // 唯一胜利入口：BossAgent 的 VictorySettler 发 boss.defeated（一次性）→ 终局阶段。
    // SettlementScreen 监听 run.settled，由 BootstrapScene 的 phaseChanged 适配负责发出。
    this.unsubs.push(
      this.bus.subscribe('boss.defeated', () => {
        if (this.combat.progression.phase === 'running') {
          this.combat.progression.setPhase('victory');
        }
      }),
    );
  }

  get bossTarget(): EnemyTarget | null {
    return this.target;
  }

  /** 由场景层在 boss.spawned 时注入 registry 镜像目标；HP/位置立刻对齐 agent。 */
  attachTarget(target: EnemyTarget): void {
    this.target = target;
    this.syncTarget();
  }

  /** 时钟 → Agent 幂等同步（510s 预警 / 600s 登场，事件由 BossAgent 发，不重复发）。 */
  syncClock(): void {
    BossAgent.syncFromClock(this.combat.progression.clock, this.agent, this.spawnPos);
  }

  /** 每帧推进 Boss AI；返回本帧 Boss 对玩家造成的原始伤害（交给唯一受击出口）。 */
  step(dtSec: number): number {
    this.pendingPlayerDamage = 0;
    if (this.agent.state === 'active') this.agent.update(dtSec);
    this.totalPlayerDamageDealt += this.pendingPlayerDamage;
    return this.pendingPlayerDamage;
  }

  /** 只读取证端口：Boss 累计对玩家的原始伤害（Playwright 用，证明预警判定生效）。 */
  get playerDamageDealt(): number {
    return this.totalPlayerDamageDealt;
  }

  /**
   * 玩家攻击命中入口（由场景层包装 registry.applyDamage 转发）。
   * @param dealt 已由 CombatResolver 按 boss 档位结算过的最终伤害（破甲已乘一次）
   * @param weapon 命中武器（法杖投射物 / 魔法剑）
   * @returns BossAgent 实际接受的伤害（HP 权威侧返回值）
   */
  applyResolvedDamage(dealt: number, weapon: WeaponId): number {
    if (!this.target || !this.target.alive || this.agent.state !== 'active' || dealt <= 0) return 0;
    const layers = this.combat.resolver.layers;
    // dealt = panel × (1 + armorBreak)；反推 panel，交给 receiveHit 再走一次同一个公式。
    // targetHp 两侧同源（syncTarget 每帧镜像），因此 min(outgoing, hp) 的夹取也一致。
    const panel = dealt / (1 + layers.armorBreakBonus);
    const input: WeaponHitInput = {
      source: weapon,
      weapon,
      element: null, // 本试玩未接宝石元素 on-hit；不伪造元素
      baseDamage: panel,
      layers,
      hitPos: { ...this.target.position },
    };
    const applied = this.agent.receiveHit(input);
    this.syncTarget();
    return applied;
  }

  /**
   * ⚠ 测试用调试入口（仅 ?bossHP / ?killboss 触发，正常游戏绝不调用）：
   * 把 Boss HP 削到指定值。仍走 receiveHit → resolveDamageHit，不是直接改私有字段。
   */
  debugSetHp(hp: number): void {
    if (this.agent.state !== 'active') return;
    const clamped = Math.max(0, Math.min(this.agent.maxHpValue, hp));
    const damage = this.agent.hp - clamped;
    if (damage <= 0) return;
    const layers = this.combat.resolver.layers;
    const input: WeaponHitInput = {
      source: 'environment',
      weapon: 'staff',
      element: null,
      baseDamage: damage / (1 + layers.armorBreakBonus),
      layers,
      hitPos: { ...this.agent.position },
    };
    this.agent.receiveHit(input);
    this.syncTarget();
  }

  /** 只读镜像：HP 从 agent → registry target（UI 血条 / 命中几何都读这个对象）。 */
  syncTarget(): void {
    if (!this.target) return;
    this.target.hp = this.agent.hp;
    this.target.alive = this.agent.state !== 'defeated';
    const pos = this.agent.position;
    this.target.position.x = pos.x;
    this.target.position.z = pos.z;
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    this.target = null;
  }
}
