/**
 * TASK-05 ｜ 默认掉落表（PROVISIONAL）
 *
 * 契约的 LootRoll / CurrencyId 来自 domain.events；普通怪掉落金额文档未定义，
 * 由 TASK-04 经济侧按每局平均击杀数校准。本文件是 TASK-05 自有模块数据，
 * 不写进冻结 config（禁止改契约），集中一处便于后续替换注入。
 */
import type { LootRoll } from '../domain/events.ts';
import type { EnemyId } from '../domain/ids.ts';

export interface DropVictim {
  readonly defId: EnemyId;
  readonly isElite: boolean;
  readonly rank: 'normal' | 'lord' | null;
  readonly position: { readonly x: number; readonly z: number };
}

/** 掉落基数（PROVISIONAL，TASK-04 校准口径） */
const DROP_BASE = {
  gold: 2,
  forestMaterial: 1,
  /** 精英额外倍率 */
  eliteMult: 5,
  /** 领主额外倍率 */
  lordMult: 2,
} as const;

export function defaultDropTable(victim: DropVictim): LootRoll[] {
  const mult = victim.isElite ? DROP_BASE.eliteMult * (victim.rank === 'lord' ? DROP_BASE.lordMult : 1) : 1;
  const rolls: LootRoll[] = [{ currencyId: 'gold', amount: DROP_BASE.gold * mult }];
  if (victim.isElite) rolls.push({ currencyId: 'forestMaterial', amount: DROP_BASE.forestMaterial });
  return rolls;
}
