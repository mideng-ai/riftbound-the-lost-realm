/**
 * TASK-05 ｜ 世界事件调度器
 *
 * 时间轴全部来自 domain.worldEventSchedule()（→ config）：
 * 首场 2:00–3:30 随机、间隔 108s、单并发、同种不连续、Boss 预警 510s 后停刷。
 * 停刷判定走 domain.canSpawnWorldEvent（唯一入口）。
 */
import { canSpawnWorldEvent, worldEventDefs, worldEventSchedule } from '../domain/wave.ts';
import type { WorldEventId } from '../domain/ids.ts';
import type { Rng } from '../domain/types.ts';
import type { EventBusApi } from '../domain/events.ts';
import type { EventWorldContext } from '../enemy/types.ts';
import { createWorldEvent } from './worldEvents.ts';
import type { WorldEvent } from './worldEvents.ts';

export class WorldEventScheduler {
  private active: WorldEvent | null = null;
  private nextAtSec: number | null = null;
  private lastId: WorldEventId | null = null;
  private readonly bus: EventBusApi;
  private readonly rng: Rng;

  constructor(bus: EventBusApi, rng: Rng) {
    this.bus = bus;
    this.rng = rng;
  }

  get activeEventId(): WorldEventId | null {
    return this.active?.id ?? null;
  }
  get activeEvent(): WorldEvent | null {
    return this.active;
  }

  tick(ctx: EventWorldContext, dt: number): void {
    const t = ctx.clock.elapsedSec;
    const schedule = worldEventSchedule();
    if (this.nextAtSec === null) {
      this.nextAtSec = this.rng.range(schedule.firstWindowStartSec, schedule.firstWindowEndSec);
    }

    if (this.active) {
      this.active.tick(ctx, dt);
      if (this.active.state !== 'active') {
        this.lastId = this.active.id;
        this.active = null;
        this.nextAtSec = t + schedule.intervalSec;
      }
      return;
    }

    if (schedule.maxConcurrent <= 0) return;
    if (!canSpawnWorldEvent(t)) return;
    if (t < this.nextAtSec) return;

    const ids = worldEventDefs()
      .map((d) => d.id)
      .filter((id) => !schedule.noImmediateRepeat || id !== this.lastId);
    const id = this.rng.pick(ids);
    this.active = createWorldEvent(id, this.bus);
    this.bus.publish('world_event.started', { id });
    this.active.start(ctx);
  }
}
