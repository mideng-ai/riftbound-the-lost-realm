/**
 * 集成层 adapter：TASK-02 CombatRuntime → TASK-07 UiDataSources / UiCommandSink。
 *
 * 为什么需要适配层（本轮「真实数据源接线」的核心）：
 *  1. CombatRuntime.snapshot 已是 RunSnapshot 形状，但 refreshSnapshot() 只维护 9 个字段，
 *     bossHpPct / bossPhase 恒为初始值 null —— Boss 实体由集成层桥接，combat 模块不持有。
 *     本 adapter 每帧**复制**一份快照并补齐 Boss 展示字段，不改 combat 模块内部、不改 domain 契约。
 *  2. UiDataSources 的低频只读端口（武器等级 / 冷却 / 货币 / 宝石 / 局外成长）在
 *     RunSnapshot 里没有对应字段（冻结契约只有 11 个高频字段），由本 adapter 从
 *     combat 与其 save 读取；UI 不自行推算、不从 config 反推玩法数值。
 *  3. UiCommand 只表达玩家意图。本 adapter 把它排队，由渲染循环消费成 CombatFrameInput，
 *     UI 不直接写领域状态（TASK-07 红线）。
 *
 * 总线：本 adapter 创建并持有的 EventBusApi 同时注入 CombatRuntime 与 UiRoot，
 *       因此 upgrade.offered / boss.phaseChanged / run.settled 等离散事件 UI 都收得到。
 *
 * 分层：不 import Babylon，不持有任何 Mesh / Scene 引用。
 */
import {
  createEventBus,
  createRunSnapshot,
  updateRunSnapshot,
  bossPhaseAtHp,
} from '../domain/index.ts';
import type {
  BossPhase,
  EventBusApi,
  RunSnapshot,
  UpgradeId,
  WeaponId,
} from '../domain/index.ts';
import type { CombatRuntime } from '../combat/CombatRuntime.ts';
import type { EnemyTarget } from '../combat/TargetRegistry.ts';
import type { UiDataSources } from '../ui/dataSources.ts';
import type { UiCommandSink } from '../ui/commands.ts';
import { playerConfig } from '../config/playerConfig.ts';

/** Boss 血条权威展示数据（直接来自 BossAgent 的只读 getter，不是集成层伪造的固定血条）。 */
export interface BossHudSource {
  readonly hp: number;
  readonly maxHp: number;
  readonly phase: BossPhase;
  readonly active: boolean;
}

/** 冷却就绪比例：0 = 刚开火，1 = 就绪。间隔基准来自 config（宿主端口，UI 不推算）。 */
function readyPct(cooldownSec: number, intervalSec: number): number {
  if (intervalSec <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - cooldownSec / intervalSec));
}

export class CombatUiBridge {
  /** 共享领域总线：CombatRuntime 与 UiRoot 用同一条，离散事件才不会丢。 */
  readonly bus: EventBusApi = createEventBus();

  /** adapter 自持的快照副本（不共享 combat 内部可变对象）。 */
  private readonly snap: RunSnapshot = createRunSnapshot();
  private combat: CombatRuntime | null = null;
  private bossProvider: () => EnemyTarget | null = () => null;
  /** TASK-06 接线后优先读 BossAgent 权威值；未接线时为 null，退回 registry 镜像。 */
  private bossAgentSource: (() => BossHudSource | null) | null = null;

  private pendingCard: UpgradeId | null = null;
  private pendingSwitchTo: WeaponId | null = null;

  /** TASK-07 UI 的唯一数据源。低频端口全部是 getter，每次读宿主最新值。 */
  readonly sources: UiDataSources = {
    bus: this.bus,
    snapshot: () => this.readSnapshot(),
    weaponLevels: () => {
      const c = this.combat;
      return c
        ? { staff: c.weapons.levelOf('staff'), sword: c.weapons.levelOf('sword') }
        : null;
    },
    weaponCooldownPct: () => {
      const c = this.combat;
      if (!c) return null;
      return {
        staff: readyPct(c.weapons.stateOf('staff').cooldownSec, playerConfig.staff.intervalSec),
        sword: readyPct(c.weapons.stateOf('sword').cooldownSec, playerConfig.sword.intervalSec),
      };
    },
    currencies: () => {
      const cur = this.combat?.save.currencies;
      if (!cur) return null;
      // SaveCurrencies → CurrencyId 的形状适配（碎片四个独立账户 → 四个 chip）
      return {
        gold: cur.gold,
        forestMaterial: cur.forestMaterial,
        fireShard: cur.elementalShards.fire,
        iceShard: cur.elementalShards.ice,
        lightningShard: cur.elementalShards.lightning,
        shadowShard: cur.elementalShards.shadow,
        forestCore: cur.forestCore,
      };
    },
    metaProgress: () => this.combat?.save.metaProgress ?? null,
    gemInventory: () => this.combat?.save.gemInventory ?? null,
    gemSockets: () => {
      const w = this.combat?.save.weapons;
      return w ? { staff: w.staff.sockets, sword: w.sword.sockets } : null;
    },
  };

  /** UI 命令出口：只排队，不直接改 combat（下一帧由渲染循环消费）。 */
  readonly onCommand: UiCommandSink = (cmd) => {
    switch (cmd.type) {
      case 'upgrade:select':
        // cardId 在协议里是 string，领域侧是 UpgradeId 联合；合法性由
        // RunProgression.selectCard 校验（必须是本轮 offered 的卡），这里只转发。
        this.pendingCard = cmd.cardId as UpgradeId;
        break;
      case 'weapon:switch':
        this.pendingSwitchTo = cmd.to;
        break;
      case 'run:restart':
        // 集成层演示重开：整页重建组合根。正式实现应走 RunClock.reset + registry.clear，
        // 当前契约未暴露这些端口，故只产出重载，不伪造「局内重置」。
        window.location.reload();
        break;
      default:
        // gem:socket / gem:unsocket / gem:merge / ui:playSfx：
        // TASK-03 宝石系统与音频系统未接入本试玩，如实留空（不假装已生效）。
        console.debug('[ui] command not wired in this demo:', cmd.type);
        break;
    }
  };

  /** 由 BootstrapScene 在 CombatRuntime 创建后注入（combat 在场景内组合，宿主拿不到构造期引用）。 */
  attach(
    combat: CombatRuntime,
    bossProvider: () => EnemyTarget | null,
    bossAgentSource?: () => BossHudSource | null,
  ): void {
    this.combat = combat;
    this.bossProvider = bossProvider;
    this.bossAgentSource = bossAgentSource ?? null;
  }

  /** 消费一帧的 UI 选卡意图。 */
  consumeCard(): UpgradeId | null {
    const v = this.pendingCard;
    this.pendingCard = null;
    return v;
  }

  /** 消费一帧的 UI 切武器意图；目标已是当前武器则丢弃，避免「切换」语义被误用成「设定」。 */
  consumeSwitch(): boolean {
    const to = this.pendingSwitchTo;
    this.pendingSwitchTo = null;
    if (!to || !this.combat || this.combat.weapons.current === to) return false;
    return true;
  }

  private readSnapshot(): RunSnapshot {
    const c = this.combat;
    if (!c) return this.snap;
    // 1:1 复制 combat 的权威快照
    updateRunSnapshot(this.snap, c.snapshot);
    // adapter 补齐：combat.refreshSnapshot 不维护 bossHpPct / bossPhase。
    // TASK-06 接线后优先读 BossAgent 权威 HP/阶段（含换阶段事件同源）；
    // 未接线时退回 registry 镜像（按血线反推阶段，保持旧行为兼容）。
    const agent = this.bossAgentSource?.();
    if (agent && agent.active && agent.maxHp > 0) {
      const pct = Math.max(0, Math.min(1, agent.hp / agent.maxHp));
      this.snap.bossHpPct = pct;
      this.snap.bossPhase = agent.phase;
    } else {
      const boss = this.bossProvider();
      if (boss && boss.alive && boss.maxHp > 0) {
        const pct = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
        this.snap.bossHpPct = pct;
        this.snap.bossPhase = bossPhaseAtHp(pct);
      } else {
        this.snap.bossHpPct = null;
        this.snap.bossPhase = null;
      }
    }
    return this.snap;
  }
}
