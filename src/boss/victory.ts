/**
 * src/boss/victory.ts — 一次性胜利结算守卫（TASK-06）
 *
 * 契约（TASK-06 验收）：「Boss 击败只触发一次胜利结算」。
 * 结构性保证：第一次 settle 成功后进入 closed；之后任何重复调用
 * （超杀帧、事件重放、同帧多次 hp<=0）直接返回 false，不重发事件、不重发奖励。
 *
 * 奖励经 Economy/Reward 端口（BossRewardPort）发放；Boss 不直接操作存档（TASK-06 红线）。
 */
import type { EventBusApi } from '../domain/index.ts';
import type { BossRewardPort } from './types.ts';

export interface VictorySettlerDeps {
  readonly bus: EventBusApi;
  readonly rewards: BossRewardPort;
  /** 本局已进行秒数（契约事件 boss.defeated.atSec）。 */
  readonly elapsedSec: () => number;
}

export class VictorySettler {
  private readonly bus: EventBusApi;
  private readonly rewards: BossRewardPort;
  private readonly elapsedSec: () => number;
  private settled = false;

  constructor(deps: VictorySettlerDeps) {
    this.bus = deps.bus;
    this.rewards = deps.rewards;
    this.elapsedSec = deps.elapsedSec;
  }

  get isSettled(): boolean {
    return this.settled;
  }

  /** 结算：仅第一次生效，返回本次是否真正结算。 */
  settle(): boolean {
    if (this.settled) return false;
    this.settled = true;
    // 契约事件（GameEventMap['boss.defeated']）：只发一次。
    this.bus.publish('boss.defeated', { atSec: this.elapsedSec() });
    // 奖励经 Economy/Reward 接口，Boss 侧不碰存档。
    this.rewards.grantBossVictory();
    return true;
  }
}
