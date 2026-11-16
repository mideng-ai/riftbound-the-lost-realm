/**
 * TASK-02 局内成长 —— XP / 升级冻结 / 3 选 1 / buff 写入。
 *
 * 全部走 domain 桶契约：
 *   - xpToNextLevel(level)         XP 曲线（公式 round(40 × L^1.35) 为准）
 *   - transitionPhase / canTransition  RunPhase 九态机（running → upgradePick → running）
 *   - RunClock                      只在 phase==='running' 推进，选卡期间冻结（含 Boss 预警）
 *   - rollUpgradeChoices            无放回抽 3 张（scope 过滤 / 满级 / 上限过滤）
 *   - cardToBuffEntry               选卡落地成 InRunBuffEntry
 *
 * 本文件不持有 DamageLayers，选卡后通过 onRebuild 回调让 CombatResolver 重算三层，
 * 避免升级系统与结算器互相依赖。
 *
 * 本文件禁止 import Babylon / DOM。
 */
import {
  xpToNextLevel,
  transitionPhase,
  canTransition,
  RunClock,
  rollUpgradeChoices,
  cardToBuffEntry,
  upgradeCard,
  isCardMaxed,
} from '../domain/index.ts';
import type {
  RunPhase,
  Rng,
  EventBusApi,
  WeaponId,
  InRunBuffEntry,
  UpgradeId,
  UpgradeTier,
  UpgradeCardDef,
} from '../domain/index.ts';
import { upgradePoolConfig } from '../config/upgradePoolConfig.ts';

/**
 * 与 domain/upgrade.takenTierCount 同语义（按同 buffId 出现次数推断 tier）。
 * 桶导出未包含该函数，业务侧按契约注释实现等效计数，不改变契约。
 */
export function takenTierCount(card: UpgradeCardDef, buffs: readonly InRunBuffEntry[]): number {
  let n = 0;
  for (const b of buffs) if (b.buffId === card.id) n++;
  return n;
}

export interface RunProgressionDeps {
  readonly bus: EventBusApi;
  readonly rng: Rng;
  /** 当前武器（决定 3 选 1 的 scope 过滤） */
  readonly currentWeapon: () => WeaponId;
  /** 经验获取乘数（DamageLayers.xpGainMul，时之沙 #15） */
  readonly xpGainMul: () => number;
  /** buff 变化后重算三层乘区（由 CombatRuntime 注入 CombatResolver.rebuild） */
  readonly onRebuild: () => void;
  /** 时钟推进时取当前阶段；未注入时用本对象内部 phase */
  readonly clockPhase?: () => RunPhase;
}

export class RunProgression {
  readonly clock: RunClock;
  private readonly bus: EventBusApi;
  private readonly rng: Rng;
  private readonly currentWeaponFn: () => WeaponId;
  private readonly xpGainMulFn: () => number;
  private readonly onRebuildFn: () => void;

  private currentPhase: RunPhase = 'running';
  private pendingOffers = 0;
  private offeredChoices: readonly UpgradeCardDef[] = [];

  level = 1;
  xp = 0;
  readonly buffs: InRunBuffEntry[] = [];

  /** 局内等级上限来自 config（禁止硬编码 10）。 */
  readonly maxLevel: number = upgradePoolConfig.xpCurve.maxRunLevel;

  constructor(deps: RunProgressionDeps) {
    this.bus = deps.bus;
    this.rng = deps.rng;
    this.currentWeaponFn = deps.currentWeapon;
    this.xpGainMulFn = deps.xpGainMul;
    this.onRebuildFn = deps.onRebuild;
    this.clock = new RunClock({ phaseProvider: deps.clockPhase ?? (() => this.currentPhase) });
  }

  get phase(): RunPhase {
    return this.currentPhase;
  }

  /** 当前待选的 3 张卡（非空时 UI 应显示选卡界面）。 */
  get choices(): readonly UpgradeCardDef[] {
    return this.offeredChoices;
  }

  /** 还需玩家做出的选择次数（连升多级时 > 1）。 */
  get pendingChoiceCount(): number {
    return this.pendingOffers;
  }

  /** 推进单局时钟。phase !== 'running' 时由 RunClock 的 phaseProvider 自动不累计。 */
  advanceClock(dtSec: number): void {
    this.clock.advance(dtSec);
  }

  /**
   * 获得经验（击杀时由 CombatRuntime 传入 def.xpValue）。
   * 经验乘数在此统一应用；升级会触发「冻结时钟 + 3 选 1」。
   * 选卡 / 暂停期间不吃经验，避免升级态下继续累积。
   */
  gainXp(rawXp: number): void {
    if (this.currentPhase !== 'running') return;
    if (!Number.isFinite(rawXp) || rawXp <= 0) return;
    this.xp += rawXp * Math.max(0, this.xpGainMulFn());

    while (this.level < this.maxLevel && this.xp >= xpToNextLevel(this.level)) {
      this.xp -= xpToNextLevel(this.level);
      this.level++;
      this.pendingOffers++;
      this.bus.publish('player.leveledUp', { level: this.level });
    }
    if (this.pendingOffers > 0 && this.currentPhase === 'running') this.openOffer();
  }

  /** 打开选卡：状态机迁移 + 冻结时钟 + 抽 3 张 + 广播。 */
  private openOffer(): void {
    const from = this.currentPhase;
    if (!canTransition(from, 'upgradePick')) return;
    this.currentPhase = transitionPhase(from, 'upgradePick');
    this.clock.freeze();
    this.bus.publish('run.phaseChanged', { from, to: this.currentPhase });

    this.offeredChoices = rollUpgradeChoices(this.rng, this.buffs, {
      currentWeapon: this.currentWeaponFn(),
      level: this.level,
    });
    // 池子被抽干（全满级/全封顶）：不卡死流程，直接恢复
    if (this.offeredChoices.length === 0) {
      this.pendingOffers = 0;
      this.offeredChoices = [];
      this.resumeRun();
      return;
    }
    this.bus.publish('upgrade.offered', { level: this.level, choices: this.offeredChoices });
  }

  /**
   * 玩家选择一张卡。校验「必须在 upgradePick 阶段 / 必须是本轮 offered 的卡 / 未满级」。
   * 落地 buff → 触发三层重算 → 恢复时钟；连升多级时继续弹下一轮。
   * @returns 是否选择成功
   */
  selectCard(cardId: UpgradeId): boolean {
    if (this.currentPhase !== 'upgradePick') return false;
    const card = this.offeredChoices.find((c) => c.id === cardId);
    if (!card || isCardMaxed(card, this.buffs)) return false;

    const tier = Math.min(card.maxTier, takenTierCount(card, this.buffs) + 1) as UpgradeTier;
    this.buffs.push(cardToBuffEntry(card, tier));
    this.bus.publish('upgrade.selected', { cardId, tier });
    this.onRebuildFn();
    this.offeredChoices = [];
    this.pendingOffers = Math.max(0, this.pendingOffers - 1);

    if (this.pendingOffers > 0) {
      this.openOfferAfterPending();
    } else {
      this.resumeRun();
    }
    return true;
  }

  /** 连升多级：仍处于 upgradePick，直接再抽一轮（不能再做 running→upgradePick 迁移）。 */
  private openOfferAfterPending(): void {
    this.offeredChoices = rollUpgradeChoices(this.rng, this.buffs, {
      currentWeapon: this.currentWeaponFn(),
      level: this.level,
    });
    if (this.offeredChoices.length === 0) {
      this.pendingOffers = 0;
      this.resumeRun();
      return;
    }
    this.bus.publish('upgrade.offered', { level: this.level, choices: this.offeredChoices });
  }

  /** 选卡结束：恢复 running 并解冻时钟。 */
  private resumeRun(): void {
    const from = this.currentPhase;
    this.currentPhase = transitionPhase(from, 'running');
    this.clock.resume();
    this.bus.publish('run.phaseChanged', { from, to: this.currentPhase });
  }

  /**
   * 通用阶段迁移（死亡 → defeat / 击杀 Boss → victory / 暂停），广播 run.phaseChanged。
   * 受 RUN_PHASE_TRANSITIONS 约束；非法迁移由 domain 拒绝并保持原阶段。
   */
  setPhase(to: RunPhase): RunPhase {
    const from = this.currentPhase;
    const next = transitionPhase(from, to);
    if (next !== from) this.bus.publish('run.phaseChanged', { from, to: next });
    this.currentPhase = next;
    return next;
  }

  /** 供测试 / 工具查询某张卡是否已在 offered 列表中。 */
  hasOffer(cardId: UpgradeId): boolean {
    return this.offeredChoices.some((c) => c.id === cardId);
  }

  /** 按 ID 取卡定义（转发 domain，避免业务侧深路径导入）。 */
  cardById(cardId: UpgradeId): UpgradeCardDef {
    return upgradeCard(cardId);
  }
}
