/**
 * TASK-02 战斗结算器 —— **唯一伤害出口**。
 *
 * 三层乘区快照的唯一组装点：rebuildDamageLayers(a, b, c, caps)。
 * 任何一次对敌人扣血，都必须经本文件 resolveHit → domain.resolveDamageHit；
 * 武器模块只产出攻击描述，TargetRegistry 只写血，绝不自行算伤害。
 *
 * A 区 = 1 + 武器强化%(按当前武器 Lv) + 熟练%(按当前武器的 staffMastery/swordMastery)
 * B 区 = 属性宝石（同种取最强，异种加算）
 * C 区 = 局内 buff（两级夹取，armorBreak 不进 C 区，R-01 裁定）
 *
 * 本文件禁止 import Babylon / DOM。
 */
import {
  rebuildDamageLayers,
  resolveDamageHit,
  computeShotDamage,
  baseWeaponDamage,
} from '../domain/index.ts';
import type {
  DamageLayers,
  OutrunBaseLayerInput,
  GemDamageEntry,
  InRunBuffEntry,
  DamageCaps,
  DamageResult,
  EntityId,
  Vec3,
  WeaponId,
  ControlTier,
} from '../domain/index.ts';
import { damageConfig } from '../config/damageConfig.ts';

/** 局外基础 + 宝石输入（由组合根从存档/宝石系统注入）。 */
export interface OutrunLayerInput extends OutrunBaseLayerInput {
  readonly gemEntries: readonly GemDamageEntry[];
}

/** 构造函数可选种子的形状（避免对象字面量多余属性检查）。 */
type OutRunLayerSeed = OutrunLayerInput;

/** 一次命中结算请求。 */
export interface HitRequest {
  readonly weaponId: WeaponId;
  readonly targetId: EntityId;
  readonly hitPos: Vec3;
  readonly targetHp: number;
  readonly targetTier: ControlTier;
  /** 已穿透的目标数（每穿一个 × damageConfig.pierce.dmgMultPerTarget） */
  readonly pierceDepth?: number;
}

export class CombatResolver {
  /** 上限表来自 config（禁止业务侧自带 caps 常量）。 */
  readonly caps: DamageCaps = damageConfig.caps;
  private current: DamageLayers;
  /** 出口计数：测试可断言「所有伤害都经过本结算器」。 */
  private hitCount = 0;

  constructor(initial?: { readonly outrun?: OutRunLayerSeed; readonly buffs?: readonly InRunBuffEntry[] }) {
    const outrun = initial?.outrun;
    this.current = rebuildDamageLayers(
      { weaponUpgradePct: outrun?.weaponUpgradePct ?? 0, masteryPct: outrun?.masteryPct ?? 0 },
      { entries: outrun?.gemEntries ?? [] },
      initial?.buffs ?? [],
      this.caps,
    );
  }

  get layers(): DamageLayers {
    return this.current;
  }

  get totalHits(): number {
    return this.hitCount;
  }

  /**
   * 重算三层快照。在「选择升级卡 / 切换武器 / 更换宝石 / 载入存档」后调用。
   * 每发子弹只做乘法（computeShotDamage），不重算，移动端零分配。
   */
  rebuild(outrun: OutrunLayerInput, buffs: readonly InRunBuffEntry[]): DamageLayers {
    const a: OutrunBaseLayerInput = {
      weaponUpgradePct: outrun.weaponUpgradePct,
      masteryPct: outrun.masteryPct,
    };
    const b = { entries: outrun.gemEntries };
    this.current = rebuildDamageLayers(a, b, buffs, this.caps);
    return this.current;
  }

  /** 单发面板伤害（含分裂弹 ×0.6^extra 摊薄），供武器描述与 HUD 显示。 */
  shotDamage(weaponId: WeaponId): number {
    return computeShotDamage(baseWeaponDamage(weaponId), this.current);
  }

  /**
   * **唯一出口**：面板伤害 → 穿透衰减 → domain.resolveDamageHit（破甲按目标档位独立乘区）。
   *
   * 破甲（armorBreakBonus）只对 elite / boss 生效由 domain 内部保证；
   * 它绝不参与 C 区（R-01：否则 Boss TTK 从 2.94 分塌到 1.18 分）。
   */
  resolveHit(req: HitRequest): DamageResult {
    const depth = Math.max(0, Math.floor(req.pierceDepth ?? 0));
    const pierceMul = Math.pow(damageConfig.pierce.dmgMultPerTarget, depth);
    const panel = this.shotDamage(req.weaponId) * pierceMul;
    this.hitCount++;
    return resolveDamageHit({
      source: req.weaponId === 'staff' ? 'staff' : 'sword',
      baseDamage: panel,
      targetId: req.targetId,
      hitPos: req.hitPos,
      targetHp: req.targetHp,
      targetTier: req.targetTier,
      armorBreakBonus: this.current.armorBreakBonus,
    });
  }
}
