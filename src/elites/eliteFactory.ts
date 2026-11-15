/**
 * TASK-05 ｜ 精英工厂（词缀抽取 / 禁止组合 / 领主）
 *
 * 全部规则数据来自冻结契约：
 * - 词缀池 = config/enemyConfig.affixes 的键（只读引用，不另写一份 ID 列表）
 * - 禁止组合 = domain.isForbiddenAffixPair（护盾+吸血 / 召唤+分裂 / 狂暴+吸血）
 * - 词缀数 = config.eliteTierRules.normalAffixCount / lordAffixCount / maxAffixCount
 * - 精英数值 = domain.eliteStats（Q2 基底派生），由 Enemy.activate 内部完成
 */
import { enemyConfig } from '../config/enemyConfig.ts';
import { ELITE_ENEMY_IDS, isForbiddenAffixPair } from '../domain/enemy.ts';
import type { EliteAffixId, EliteEnemyId } from '../domain/ids.ts';
import type { EntityId, Rng, Vec3 } from '../domain/types.ts';
import { EliteEnemy } from './elite.ts';
import type { EliteRank } from './elite.ts';

/** 六种词缀 ID（从 config 键集合派生，避免业务侧手写第二份清单） */
export const AFFIX_IDS: readonly EliteAffixId[] = Object.keys(enemyConfig.affixes) as EliteAffixId[];

/**
 * 摇取互不冲突的词缀组合。
 * 过滤两条：不重复、与已选词缀不构成禁止组合。
 * 池子被禁止组合耗尽时提前返回较短组合（不会摇出非法组合）。
 */
export function rollAffixes(rng: Rng, count: number): EliteAffixId[] {
  const rules = enemyConfig.eliteTierRules;
  const target = Math.min(Math.max(0, count), rules.maxAffixCount);
  const picked: EliteAffixId[] = [];
  while (picked.length < target) {
    const legal = AFFIX_IDS.filter(
      (id) => !picked.includes(id) && !picked.some((p) => isForbiddenAffixPair(p, id)),
    );
    if (legal.length === 0) break;
    picked.push(rng.pick(legal));
  }
  return picked;
}

export interface CreateEliteOptions {
  readonly defId?: EliteEnemyId;
  readonly rank: EliteRank;
  readonly entityId: EntityId;
  readonly position: Vec3;
  readonly hpScale: number;
  readonly damageScale: number;
  /** 显式指定词缀（测试/精英入侵可复现注入）；省略则按 rank 摇取 */
  readonly affixes?: readonly EliteAffixId[];
}

export function createElite(rng: Rng, opts: CreateEliteOptions): EliteEnemy {
  const rules = enemyConfig.eliteTierRules;
  const wanted = opts.rank === 'lord' ? rules.lordAffixCount : rules.normalAffixCount;
  const affixes = opts.affixes ? [...opts.affixes] : rollAffixes(rng, wanted);
  const defId = opts.defId ?? rng.pick(ELITE_ENEMY_IDS);

  const elite = new EliteEnemy();
  elite.activate(defId, opts.entityId, {
    position: opts.position,
    hpScale: opts.hpScale,
    damageScale: opts.damageScale,
  });
  elite.setup(opts.rank, affixes);
  return elite;
}
