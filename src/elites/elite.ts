/**
 * TASK-05 ｜ 精英实体（六词缀 + 领主）
 *
 * 锚点：
 * - 精英数值由 domain.eliteStats 派生（Q2 猎犬基底 × HP4/伤1.5/体1.5/经验5），业务侧不写数字
 * - 词缀数值从 domain.eliteAffixDef 读取（→ config），禁止组合由 domain.isForbiddenAffixPair 过滤
 * - 词缀数：普通 1 / 领主 2（config.eliteTierRules），同屏 ≤2 且领主 ≤1 由 Spawn Director 把关
 * - 受击仍一律走 domain.resolveDamageHit；护盾只改「过结算器的血量口径」与「落血顺序」
 */
import { eliteAffixDef, normalEnemyDefinition } from '../domain/enemy.ts';
import type { EliteAffixId, EnemyId, NormalEnemyId } from '../domain/ids.ts';
import type { EntityId, Vec3 } from '../domain/types.ts';
import { BEHAVIOR_EXTRA } from '../enemy/behaviorParams.ts';
import { Enemy } from '../enemy/enemy.ts';
import type { EnemyTickContext, PoisonCloud } from '../enemy/types.ts';

export type EliteRank = 'normal' | 'lord';

export interface EliteSplitRequest {
  readonly defId: NormalEnemyId;
  readonly position: Vec3;
  readonly hpOverride: number;
  readonly damageOverride: number;
}

export interface EliteDeathEffects {
  readonly splits: readonly EliteSplitRequest[];
  readonly clouds: readonly PoisonCloud[];
}

export class EliteEnemy extends Enemy {
  affixes: EliteAffixId[] = [];
  rank: EliteRank = 'normal';

  /** 护盾剩余（shielded 词缀；先于本体吸收） */
  shield = 0;
  /** 召唤词缀累计生成的子体 ID（上限按存活数计） */
  readonly minionEntityIds: EntityId[] = [];

  private healPctOfDealt = 0;
  private splitCount = 0;
  private summonIntervalSec = 0;
  private summonMax = 0;
  private summonTimer = 0;
  private toxicZoneSec = 0;
  private toxicDps = 0;
  private casterRangeM = 0;

  protected onReset(): void {
    this.affixes = [];
    this.rank = 'normal';
    this.shield = 0;
    this.minionEntityIds.length = 0;
    this.healPctOfDealt = 0;
    this.splitCount = 0;
    this.summonIntervalSec = 0;
    this.summonMax = 0;
    this.summonTimer = 0;
    this.toxicZoneSec = 0;
    this.toxicDps = 0;
    this.casterRangeM = BEHAVIOR_EXTRA.casterRangeM;
  }

  /** 装配词缀（factory 调；词缀列表已通过禁止组合与去重校验） */
  setup(rank: EliteRank, affixes: readonly EliteAffixId[]): void {
    this.rank = rank;
    this.affixes = [...affixes];
    for (const id of affixes) {
      const params = eliteAffixDef(id).params;
      switch (params.kind) {
        case 'berserk':
          this.moveSpeedMps *= 1 + params.moveSpeedPct;
          this.attackIntervalSec /= 1 + params.attackSpeedPct;
          break;
        case 'split':
          this.splitCount = params.spawnCount;
          break;
        case 'vampiric':
          this.healPctOfDealt = params.healPctOfDealt;
          break;
        case 'shielded':
          this.shield = this.maxHp * params.shieldPctOfMaxHp;
          break;
        case 'summoner':
          this.summonIntervalSec = params.intervalSec;
          this.summonMax = params.maxSummons;
          this.summonTimer = params.intervalSec;
          break;
        case 'toxic':
          this.toxicZoneSec = params.zoneSec;
          this.toxicDps = params.dps;
          break;
      }
    }
  }

  // ── 受击口径：护盾 + 本体一起过 resolveDamageHit ──────────────
  protected hitPoolHp(): number {
    return this.hp + this.shield;
  }

  protected applyDealt(dealt: number, killed: boolean): void {
    let rest = dealt;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, rest);
      this.shield -= absorbed;
      rest -= absorbed;
    }
    this.hp = killed ? 0 : Math.max(0, this.hp - rest);
    if (killed || this.hp <= 0) {
      this.hp = 0;
      this.shield = 0;
      this.alive = false;
    }
  }

  /** 吸血：恢复本次造成伤害的 healPct（词缀参数来自 config） */
  protected onDealtDamage(amount: number): void {
    if (this.healPctOfDealt > 0 && this.alive) {
      this.hp = Math.min(this.maxHp, this.hp + amount * this.healPctOfDealt);
    }
  }

  // ── 行为 ────────────────────────────────────────────────────
  protected updateBehavior(ctx: EnemyTickContext, dt: number): void {
    this.updateSummoner(ctx, dt);

    const p = ctx.player.position;
    const d = this.distToPlayer(ctx);
    // 精英行为：riftRavager 重型近战压迫 / riftCaller 远程施法（名册 §6 行为差异）
    if (this.defId === 'riftCaller') {
      if (d > this.casterRangeM) this.moveToward(p, dt);
      else this.moveAwayFrom(p, dt, BEHAVIOR_EXTRA.strafeSpeedPct);
      if (d <= this.casterRangeM && this.attackTimer <= 0) {
        const ux = d > 1e-6 ? (p.x - this.position.x) / d : 1;
        const uz = d > 1e-6 ? (p.z - this.position.z) / d : 0;
        ctx.projectiles.fire(
          this,
          this.position,
          ux,
          uz,
          BEHAVIOR_EXTRA.projectileSpeedMps,
          BEHAVIOR_EXTRA.projectileRadiusM,
          this.damage,
        );
        this.attackTimer = this.attackIntervalSec;
      }
      return;
    }

    if (!this.inMeleeReach(ctx)) this.moveToward(p, dt);
    if (this.inMeleeReach(ctx)) this.tryMeleeAttack(ctx);
  }

  /** 召唤词缀：每 intervalSec 1 只，存活数 ≤ maxSummons（config） */
  private updateSummoner(ctx: EnemyTickContext, dt: number): void {
    if (this.summonIntervalSec <= 0) return;
    // 清理已阵亡子体记录
    for (let i = this.minionEntityIds.length - 1; i >= 0; i--) {
      const id = this.minionEntityIds[i];
      if (!ctx.aliveEnemies.some((e) => e.entityId === id)) this.minionEntityIds.splice(i, 1);
    }
    this.summonTimer -= dt;
    if (this.summonTimer > 0 || this.minionEntityIds.length >= this.summonMax) return;
    this.summonTimer += this.summonIntervalSec;
    const angle = ctx.rng.range(0, Math.PI * 2);
    const pos: Vec3 = {
      x: this.position.x + Math.cos(angle) * BEHAVIOR_EXTRA.minionScatterRadiusM,
      y: 0,
      z: this.position.z + Math.sin(angle) * BEHAVIOR_EXTRA.minionScatterRadiusM,
    };
    const minion = ctx.requestSpawn(this, 'riftHound', pos);
    if (minion) this.minionEntityIds.push(minion.entityId);
  }

  /** 死亡后效应：分裂词缀幼体 + 剧毒遗留毒区（由 manager 统一落地，保证同屏上限受控） */
  deathEffects(): EliteDeathEffects {
    const splits: EliteSplitRequest[] = [];
    if (this.splitCount > 0) {
      // 「低生命普通怪」数值从名册猎犬派生（config），不硬编码
      const base = normalEnemyDefinition('riftHound');
      for (let i = 0; i < this.splitCount; i++) {
        const angle = (i / this.splitCount) * Math.PI * 2;
        splits.push({
          defId: 'riftHound' as NormalEnemyId,
          position: {
            x: this.position.x + Math.cos(angle) * BEHAVIOR_EXTRA.minionScatterRadiusM,
            y: 0,
            z: this.position.z + Math.sin(angle) * BEHAVIOR_EXTRA.minionScatterRadiusM,
          },
          hpOverride: base.baseHp * BEHAVIOR_EXTRA.eliteSplitStatPct,
          damageOverride: base.baseDamage * BEHAVIOR_EXTRA.eliteSplitStatPct,
        });
      }
    }
    const clouds: PoisonCloud[] = [];
    if (this.toxicZoneSec > 0) {
      clouds.push({
        x: this.position.x,
        z: this.position.z,
        radiusM: BEHAVIOR_EXTRA.toxicCloudRadiusM,
        remainingSec: this.toxicZoneSec,
        dps: this.toxicDps,
        tickTimer: 0,
        owner: this,
      });
    }
    return { splits, clouds };
  }

  /** 精英 defId 合法性（两个精英 ID 之外不接受） */
  static isValidDefId(id: EnemyId): boolean {
    return id === 'riftRavager' || id === 'riftCaller';
  }
}
