/**
 * src/boss/attacks.ts — 六攻击的形状构建与结算分派（TASK-06）
 *
 * 形状在【预警开始瞬间】锁定（含朝向/落点）：预警画什么、结算就判什么 ——
 * 玩家在 telegraphSec 内跑出形状即可躲避，与设计总纲 §7.5「预警形状/范围/
 * 持续时间与碰撞判定一致」一致。
 *
 * 所有契约数值从 bossDefinition()/enemyConfig（只读引用）取；本文件唯一的
 * PROVISIONAL 是自定的「几何比例」（冻结契约没有形状半径/角度数值），
 * 统一乘 bossDefinition().radiusM 派生，并集中在 SHAPE_SCALE 一处。
 */
import { enemyConfig } from '../config/enemyConfig.ts';
import type { BossAttackDef, BossAttackId, Rng, Vec3 } from '../domain/index.ts';
import { headingRad, type TelegraphShape } from './telegraph.ts';

/**
 * 形状几何比例（PROVISIONAL）：文档只定形状语言（美术圣经 §4.1）与预警时长
 * （enemyConfig），未定尺寸。以 Boss 体型半径为基准缩放，改数值只动这一处。
 */
const SHAPE_SCALE = {
  /** 根须突刺：长条矩形（线形预警区） */
  rootSpikeLength: 4.0,
  rootSpikeWidth: 0.6,
  /** 扇形横扫：120° 扇形（美术圣经 §4.1 定 120°） */
  sweepRadius: 3.0,
  sweepHalfAngleDeg: 60,
  /** 地面震荡：环形冲击波 */
  slamInner: 0.8,
  slamOuter: 3.2,
  /** 腐化藤蔓：多个地面持续危险区 */
  vineZoneRadius: 0.9,
  vineZoneCount: 3,
  vineZoneSpread: 2.5,
  /** 核心爆发：范围 AOE 实心圆 */
  burstRadius: 3.0,
} as const;

/** 攻击行为分类（设计总纲 §7.4 的行为差异，与 config 的 ID 一一对应）。 */
export type AttackKind = 'direct' | 'dotZone' | 'summon';

function assertNever(x: never): never {
  throw new Error(`[boss/attacks] 未分派的攻击 ID: ${String(x)}`);
}

/**
 * 穷尽分派：若冻结契约新增第七种攻击而这里没分派，编译期即失败（护栏）。
 */
export function attackKind(id: BossAttackId): AttackKind {
  switch (id) {
    case 'rootSpike':
    case 'sweepSwipe':
    case 'groundSlam':
    case 'coreBurst':
      return 'direct';
    case 'corruptVines':
      return 'dotZone';
    case 'forestSummon':
      return 'summon';
    default:
      return assertNever(id);
  }
}

export interface ShapeContext {
  readonly attack: BossAttackDef;
  readonly bossPos: Vec3;
  /** 预警开始瞬间的玩家位置（用于瞄准；锁定后不再跟随）。 */
  readonly playerPos: Vec3;
  /** Boss 体型半径（bossDefinition().radiusM，冻结契约值）。 */
  readonly radiusM: number;
  readonly rng: Rng;
}

/** 构建某次攻击的预警 / 碰撞形状（同一份数据两用）。 */
export function buildAttackShape(ctx: ShapeContext): TelegraphShape {
  const { attack, bossPos, playerPos, radiusM, rng } = ctx;
  switch (attack.id) {
    case 'rootSpike':
      return {
        kind: 'rect',
        origin: { ...bossPos },
        facingRad: headingRad(bossPos, playerPos),
        lengthM: radiusM * SHAPE_SCALE.rootSpikeLength,
        widthM: radiusM * SHAPE_SCALE.rootSpikeWidth,
      };
    case 'sweepSwipe':
      return {
        kind: 'sector',
        origin: { ...bossPos },
        facingRad: headingRad(bossPos, playerPos),
        radiusM: radiusM * SHAPE_SCALE.sweepRadius,
        halfAngleRad: (SHAPE_SCALE.sweepHalfAngleDeg * Math.PI) / 180,
      };
    case 'groundSlam':
      return {
        kind: 'ring',
        center: { ...bossPos },
        innerRadiusM: radiusM * SHAPE_SCALE.slamInner,
        outerRadiusM: radiusM * SHAPE_SCALE.slamOuter,
      };
    case 'corruptVines': {
      const spots: { center: Vec3; radiusM: number }[] = [];
      for (let i = 0; i < SHAPE_SCALE.vineZoneCount; i++) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(0, radiusM * SHAPE_SCALE.vineZoneSpread);
        spots.push({
          center: { x: playerPos.x + Math.cos(a) * r, y: 0, z: playerPos.z + Math.sin(a) * r },
          radiusM: radiusM * SHAPE_SCALE.vineZoneRadius,
        });
      }
      return { kind: 'multiSpot', spots };
    }
    case 'coreBurst':
      return {
        kind: 'circle',
        center: { ...bossPos },
        radiusM: radiusM * SHAPE_SCALE.burstRadius,
      };
    case 'forestSummon':
      // 契约：森林召唤无预警、无伤害（telegraphSec=0 / damage=0）。
      return { kind: 'none' };
    default:
      return assertNever(attack.id);
  }
}

/** 腐化藤蔓持续时长（秒）—— 只读引用冻结配置，不在 Boss 层重写数字。 */
export function vineZoneDurationSec(): number {
  return enemyConfig.boss.corruptVinesDurationSec;
}

/** 森林召唤单次数量（契约 BossAttackDef.summonCount；缺省 0）。 */
export function summonCountOf(attack: BossAttackDef): number {
  return attack.summonCount ?? 0;
}
