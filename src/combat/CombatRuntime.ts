/**
 * TASK-02 战斗运行时组合根（渲染无关）。
 *
 * 把 player / weapons / combat / progression 四个模块串成一帧一帧可推进的循环，
 * 是场景层唯一需要接线的对象：BootstrapScene 只负责把本运行时映射到 Babylon Mesh。
 *
 * 依赖注入：存档（武器 Lv / 熟练 / 森林生存）、宝石 B 区条目、事件总线、随机源。
 * 所有平衡数值来自 domain + config；本文件不写死任何契约数值。
 *
 * 本文件禁止 import Babylon / DOM。
 */
import {
  deriveMaxHp,
  forestSurvivalPctOfLevel,
  masteryPctOfLevel,
  createEventBus,
  createRunSnapshot,
  updateRunSnapshot,
  createMulberry32,
  defaultSaveV3,
} from '../domain/index.ts';
import type {
  EntityId,
  Vec3,
  EventBusApi,
  Rng,
  SaveDataV3,
  GemDamageEntry,
  UpgradeId,
  RunSnapshot,
  DamageSource,
} from '../domain/index.ts';
import { PlayerEntity } from '../player/PlayerEntity.ts';
import { WeaponSystem } from '../weapons/WeaponSystem.ts';
import { StaticWeaponLevelPort } from '../weapons/types.ts';
import type { WeaponLevelPort, WeaponUpgradeEconomyPort, AttackRequest } from '../weapons/types.ts';
import { CombatResolver } from './CombatResolver.ts';
import { TargetRegistry } from './TargetRegistry.ts';
import { ProjectileSystem } from './ProjectileSystem.ts';
import { sectorHitsCircle } from './HitDetection.ts';
import { RunProgression } from '../progression/RunProgression.ts';
import type { ProjectileSystemOptions } from './ProjectileSystem.ts';

/** 一帧输入意图（由场景把 InputSystem 映射过来；逻辑层不认识 DOM 事件）。 */
export interface CombatFrameInput {
  /** 世界 x/z 方向移动分量（未归一化，逻辑层负责归一） */
  moveX: number;
  moveZ: number;
  /** 鼠标瞄准角（度，0 = +X）；不传则沿用移动方向推导的朝向 */
  facingDeg?: number;
  /** 普通攻击按住 */
  attack: boolean;
  /** Dash 边沿触发 */
  dash: boolean;
  /** 切换武器边沿触发 */
  switchWeapon: boolean;
  /** 选卡（upgradePick 阶段消费） */
  selectCardId?: UpgradeId | null;
  /** 本帧受到的原始伤害（敌人 / 环境，未乘 damageTakenMul） */
  incomingDamage?: number;
  /** 伤害来源，默认 environment */
  incomingSource?: DamageSource;
}

export interface CombatRuntimeOptions {
  readonly entityId?: EntityId;
  readonly spawnPos?: Vec3;
  /** 存档（武器 Lv / 熟练 / 森林生存 / 宝石槽）；默认 defaultSaveV3() */
  readonly save?: SaveDataV3;
  /** B 区宝石条目（TASK-03 宝石系统注入） */
  readonly gemEntries?: readonly GemDamageEntry[];
  /** 生命宝石加成（deriveMaxHp 第一参数） */
  readonly gemVitalityPct?: number;
  readonly bus?: EventBusApi;
  readonly rng?: Rng;
  /** 局内随机种子（未注入 rng 时使用） */
  readonly seed?: number;
  /** 武器等级端口（默认从 save.weapons 读） */
  readonly weaponLevelPort?: WeaponLevelPort;
  readonly upgradeEconomy?: WeaponUpgradeEconomyPort;
  readonly projectileOptions?: ProjectileSystemOptions;
  /** 攻击发生时的通知（场景层用来播 VFX / 音效；逻辑层不认识 Babylon） */
  readonly onAttack?: (req: AttackRequest) => void;
}

export class CombatRuntime {
  readonly bus: EventBusApi;
  readonly player: PlayerEntity;
  readonly weapons: WeaponSystem;
  readonly registry: TargetRegistry;
  readonly projectiles: ProjectileSystem;
  readonly resolver: CombatResolver;
  readonly progression: RunProgression;
  readonly save: SaveDataV3;
  readonly rng: Rng;
  readonly snapshot: RunSnapshot;

  private readonly gemEntries: readonly GemDamageEntry[];
  private readonly levelPort: WeaponLevelPort;
  private readonly onAttack?: (req: AttackRequest) => void;
  private lastKillCount = 0;
  private lastDamageDealt = 0;

  constructor(opts: CombatRuntimeOptions = {}) {
    this.save = opts.save ?? defaultSaveV3();
    this.bus = opts.bus ?? createEventBus();
    this.rng = opts.rng ?? createMulberry32(opts.seed ?? 1);
    this.gemEntries = opts.gemEntries ?? [];
    this.onAttack = opts.onAttack;

    const entityId = opts.entityId ?? (1 as EntityId);
    const spawnPos: Vec3 = opts.spawnPos ?? { x: 0, y: 0, z: 0 };
    const maxHp = deriveMaxHp(
      opts.gemVitalityPct ?? 0,
      forestSurvivalPctOfLevel(this.save.metaProgress.forestSurvival),
    );
    this.player = new PlayerEntity({ entityId, spawnPos, maxHp, bus: this.bus });

    this.levelPort =
      opts.weaponLevelPort ??
      new StaticWeaponLevelPort({
        staff: this.save.weapons.staff.level,
        sword: this.save.weapons.sword.level,
      });
    this.weapons = new WeaponSystem({
      runtime: this.player.runtime,
      levelPort: this.levelPort,
      bus: this.bus,
      economy: opts.upgradeEconomy,
    });

    this.registry = new TargetRegistry(this.bus);
    this.projectiles = new ProjectileSystem(opts.projectileOptions);
    this.resolver = new CombatResolver();
    this.snapshot = createRunSnapshot();

    this.progression = new RunProgression({
      bus: this.bus,
      rng: this.rng,
      currentWeapon: () => this.weapons.current,
      xpGainMul: () => this.resolver.layers.xpGainMul,
      onRebuild: () => this.rebuildLayers(),
    });

    this.rebuildLayers();
    this.refreshSnapshot();
  }

  /** 组装 A/B/C 并交给唯一结算器重算（切换武器 / 选卡 / 强化后调用）。 */
  rebuildLayers(): void {
    const weaponId = this.weapons.current;
    const masteryLevel =
      weaponId === 'staff' ? this.save.metaProgress.staffMastery : this.save.metaProgress.swordMastery;
    this.resolver.rebuild(
      {
        weaponUpgradePct: this.weapons.weaponUpgradePct(weaponId),
        masteryPct: masteryPctOfLevel(masteryLevel),
        gemEntries: this.gemEntries,
      },
      this.progression.buffs,
    );
  }

  /** 当前三层乘区快照（HUD / 调试）。 */
  get layers() {
    return this.resolver.layers;
  }

  /** 本帧累计伤害（调试可视化）。 */
  get lastFrameDamage(): number {
    return this.lastDamageDealt;
  }

  /** 累计击杀数（调试可视化）。 */
  get killCount(): number {
    return this.lastKillCount;
  }

  /**
   * 推进一帧。升级选卡 / 暂停阶段：只消费选卡输入，不推进任何战斗逻辑
   * （时钟由 RunClock.phaseProvider + freeze 双保险冻结）。
   */
  step(dtSec: number, input: CombatFrameInput): void {
    if (input.selectCardId) this.progression.selectCard(input.selectCardId);
    if (this.progression.phase !== 'running') {
      this.refreshSnapshot();
      return;
    }

    this.lastDamageDealt = 0;
    this.progression.advanceClock(dtSec);
    const atSec = this.progression.clock.elapsedSec;

    // 1) 输入 → 玩家状态
    if (input.switchWeapon) {
      this.weapons.switchWeapon();
      this.rebuildLayers(); // A 区按当前武器取强化/熟练，切换后必须重算
    }
    if (input.facingDeg !== undefined) this.player.setFacingDeg(input.facingDeg);
    if (input.dash) this.player.tryDash(input.moveX, input.moveZ, this.resolver.layers);
    this.player.tick(dtSec);
    this.player.stepDash(dtSec);
    this.player.move(input.moveX, input.moveZ, dtSec, this.resolver.layers.moveSpeedMul);

    // 2) 武器冷却 + 攻击
    this.weapons.tick(dtSec);
    if (input.attack) {
      const req = this.weapons.tryAttack(this.resolver.layers, this.progression.buffs);
      if (req) this.executeAttack(req, atSec);
    }

    // 3) 飞行中的投射物命中
    this.projectiles.step(dtSec, this.registry.alive(), (hit) => {
      this.resolveAndApply(reqWeaponOfProjectile(), hit.target.entityId, hit.hitPos, hit.target, hit.pierceDepth, atSec);
    });

    // 4) 玩家受击（敌人 / 环境）
    if (input.incomingDamage !== undefined && input.incomingDamage > 0) {
      this.player.takeDamage(
        input.incomingDamage,
        this.resolver.layers,
        input.incomingSource ?? 'environment',
        atSec,
      );
      if (this.player.isDead) this.progression.setPhase('defeat');
    }

    this.refreshSnapshot();
  }

  /** 执行一次攻击描述：法杖发射 / 剑扇形即时判定。 */
  private executeAttack(req: AttackRequest, atSec: number): void {
    this.onAttack?.(req);
    if (req.kind === 'staff') {
      this.projectiles.launchStaff(req);
      return;
    }
    // 魔法剑：扇形 × 圆，命中每个目标只结算一次
    for (const target of this.registry.alive()) {
      if (
        !sectorHitsCircle(
          req.origin,
          req.facingDeg,
          req.arcAngleDeg,
          req.radiusM,
          target.position,
          target.radiusM,
        )
      ) {
        continue;
      }
      this.resolveAndApply('sword', target.entityId, target.position, target, 0, atSec);
      // #7 吸血剑气：按最大生命比例回复
      if (req.lifestealPctMaxHp > 0) this.player.heal(req.lifestealPctMaxHp * this.player.maxHp);
    }
  }

  /** 唯一伤害出口 → 注册表扣血 → 击杀经验 / 汲取回复。 */
  private resolveAndApply(
    weaponId: 'staff' | 'sword',
    targetId: EntityId,
    hitPos: Vec3,
    target: { hp: number; tier: 'normal' | 'elite' | 'boss' },
    pierceDepth: number,
    atSec: number,
  ): void {
    const result = this.resolver.resolveHit({
      weaponId,
      targetId,
      hitPos,
      targetHp: target.hp,
      targetTier: target.tier,
      pierceDepth,
    });
    this.lastDamageDealt += result.dealt;
    const kill = this.registry.applyDamage(result.targetId, result.dealt, atSec);
    if (!kill) return;

    this.lastKillCount++;
    this.progression.gainXp(kill.xpValue);
    // #14 汲取：击杀回复固定生命
    if (this.resolver.layers.killHealHp > 0) this.player.heal(this.resolver.layers.killHealHp);
  }

  /** 原地刷新 RunSnapshot（轮询，不广播）。 */
  private refreshSnapshot(): void {
    updateRunSnapshot(this.snapshot, {
      phase: this.progression.phase,
      elapsedSec: this.progression.clock.elapsedSec,
      playerHp: this.player.hp,
      playerMaxHp: this.player.maxHp,
      currentWeapon: this.weapons.current,
      xp: this.progression.xp,
      level: this.progression.level,
      aliveEnemyCount: this.registry.aliveCount,
      bossWarning: this.progression.clock.bossWarningStarted,
    });
  }

  /** 生成调试视图需要的扁平快照（不引 Babylon）。 */
  debugView(): {
    phase: string;
    hp: number;
    maxHp: number;
    weapon: string;
    level: number;
    xp: number;
    staffCd: number;
    swordCd: number;
    staffLevel: number;
    swordLevel: number;
    A: number;
    B: number;
    C: number;
    projectileCount: number;
    arcAngleDeg: number;
    aliveEnemies: number;
    liveProjectiles: number;
  } {
    const l = this.resolver.layers;
    return {
      phase: this.progression.phase,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      weapon: this.weapons.current,
      level: this.progression.level,
      xp: this.progression.xp,
      staffCd: this.weapons.stateOf('staff').cooldownSec,
      swordCd: this.weapons.stateOf('sword').cooldownSec,
      staffLevel: this.weapons.levelOf('staff'),
      swordLevel: this.weapons.levelOf('sword'),
      A: l.A,
      B: l.B,
      C: l.C,
      projectileCount: l.projectileCount,
      arcAngleDeg: l.arcAngleDeg,
      aliveEnemies: this.registry.aliveCount,
      liveProjectiles: this.projectiles.liveCount,
    };
  }
}

/** 投射物永远来自法杖（剑是即时扇形）。 */
function reqWeaponOfProjectile(): 'staff' {
  return 'staff';
}
