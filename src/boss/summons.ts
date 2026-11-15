/**
 * src/boss/summons.ts — 召唤导演：森林召唤上限 + Boss 期猎犬补充（TASK-06）
 *
 * 全部数值只读冻结契约 bossPeriodRule() / bossDefinition()，零硬编码。
 *
 * 两条上限规则各自独立，绝不可合并成同一个 cap：
 *   - 森林召唤（forestSummon）：场上召唤物 ≤ summonCap，且不得越过普通怪同屏
 *     normalCap；有效上限 = min(summonCap, normalCap)。
 *   - 猎犬补充（replenish）：每 everySec 补 count 只，只受 normalCap 约束，
 *     不受 summonCap 卡住（这是森林召唤与波次补充的语义边界）。
 * 二者共享 normalCount()（普通怪总数），因此任意时刻普通怪总数 ≤ normalCap。
 * 上限在【生成入口】执行，不是事后清理；clearOnSpawn=false 时不触碰已有怪。
 */
import { NORMAL_ENEMY_IDS, bossPeriodRule } from '../domain/index.ts';
import type { EnemyId, Rng, Vec3 } from '../domain/index.ts';
import type { BossSummonPort } from './types.ts';

export interface SummonDirectorDeps {
  readonly summons: BossSummonPort;
  readonly rng: Rng;
  /** 森林召唤物上限（bossDefinition().summonCap，由调用方注入，保持本模块零契约数值）。 */
  readonly summonCap: number;
}

export class SummonDirector {
  private readonly summons: BossSummonPort;
  private readonly rng: Rng;
  /** 森林召唤物上限；猎犬补充不使用该值。 */
  private readonly summonCap: number;
  private refillAccSec = 0;
  /** 供测试观察：满员导致最近一次补充落空。 */
  lastRefillDeferred = false;

  constructor(deps: SummonDirectorDeps) {
    this.summons = deps.summons;
    this.rng = deps.rng;
    this.summonCap = deps.summonCap;
  }

  /** 森林召唤有效上限：min(summonCap, normalCap)。 */
  effectiveCap(): number {
    return Math.min(this.summonCap, bossPeriodRule().normalCap);
  }

  /** 猎犬补充上限：只取 Boss 期普通怪同屏上限 normalCap。 */
  houndCap(): number {
    return bossPeriodRule().normalCap;
  }

  /** Boss 期心跳：每 replenish.everySec 尝试补 replenish.count 只猎犬（满员则本次落空）。 */
  tickHoundRefill(dtSec: number, spawnAt: Vec3): void {
    const rule = bossPeriodRule();
    this.refillAccSec += dtSec;
    while (this.refillAccSec >= rule.replenish.everySec) {
      this.refillAccSec -= rule.replenish.everySec;
      this.refillHounds(spawnAt);
    }
  }

  refillHounds(spawnAt: Vec3): void {
    const rule = bossPeriodRule();
    const room = this.houndCap() - this.summons.normalCount();
    const want = Math.max(0, Math.min(rule.replenish.count, room));
    this.lastRefillDeferred = want < rule.replenish.count;
    for (let i = 0; i < want; i++) {
      this.summons.spawnHound(rule.replenish.enemyId, {
        x: spawnAt.x + (i === 0 ? -1.5 : 1.5),
        y: 0,
        z: spawnAt.z + (i === 0 ? 1.0 : -1.0),
      });
    }
  }

  /**
   * 森林召唤：尝试召唤 count 只普通怪（ID 从冻结契约 NORMAL_ENEMY_IDS 抽取），
   * 只生成有效上限内的数量，返回实际召唤数。
   */
  trySummonMinions(count: number, center: Vec3): number {
    const room = this.effectiveCap() - this.summons.normalCount();
    const actual = Math.max(0, Math.min(count, room));
    for (let i = 0; i < actual; i++) {
      const defId: EnemyId = this.rng.pick(NORMAL_ENEMY_IDS);
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(1.0, 2.5);
      this.summons.spawnMinion(defId, {
        x: center.x + Math.cos(a) * r,
        y: 0,
        z: center.z + Math.sin(a) * r,
      });
    }
    return actual;
  }

  reset(): void {
    this.refillAccSec = 0;
    this.lastRefillDeferred = false;
  }
}
