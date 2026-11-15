/**
 * TASK-07 视图模型：RunSnapshot + 只读端口 → 展示模型的**纯映射**。
 *
 * 设计目的：
 *  1. 把展示逻辑抽成纯函数，无 DOM / 无 Babylon，可在 node 直接单测
 *  2. 固化数据铁律：本层只做 1:1 映射与格式转换，
 *     XP 需求、预警检查点、Boss 登场秒、成长上限全部由**调用方注入**（来自 domain / config），
 *     UI 不写死任何游戏数值、不推导任何玩法结果。
 */
import type {
  CurrencyId,
  RunSnapshot,
  SaveMetaProgress,
  WeaponId,
  WeaponUpgradeLevel,
  BossPhase,
} from '../domain/index.ts';
import { clamp01, formatCount, formatPct, formatTime, hpDisplayTier } from './format.ts';
import { BOSS_PHASE_THEME, BOSS_WARN_SHAPE, CURRENCY_THEME } from './theme.ts';
import { UI_TEXT_KEYS } from './uiText.ts';

const CURRENCY_LABEL_KEY: Readonly<Record<CurrencyId, string>> = {
  gold: UI_TEXT_KEYS.currencyGold,
  forestMaterial: UI_TEXT_KEYS.currencyForestMaterial,
  fireShard: UI_TEXT_KEYS.currencyFireShard,
  iceShard: UI_TEXT_KEYS.currencyIceShard,
  lightningShard: UI_TEXT_KEYS.currencyLightningShard,
  shadowShard: UI_TEXT_KEYS.currencyShadowShard,
  forestCore: UI_TEXT_KEYS.currencyForestCore,
};

export const CURRENCY_ORDER: readonly CurrencyId[] = [
  'gold',
  'forestMaterial',
  'fireShard',
  'iceShard',
  'lightningShard',
  'shadowShard',
  'forestCore',
];

export interface WeaponSlotVm {
  readonly id: WeaponId;
  readonly labelKey: string;
  readonly levelText: string | null;
  readonly cooldownPct: number | null;
  readonly active: boolean;
}

export interface CurrencyChipVm {
  readonly id: CurrencyId;
  readonly labelKey: string;
  readonly text: string | null; // null = 端口未接线，UI 显示占位
  readonly color: string;
  readonly shape: string;
}

export interface BossBarVm {
  readonly phase: BossPhase;
  readonly labelKey: string;
  readonly color: string;
  readonly shape: string;
  readonly hpPct: number;
  readonly hpText: string;
}

export interface WarningBannerVm {
  readonly index: 0 | 1 | 2;
  readonly shape: string;
  readonly labelKey: string;
  readonly countdownText: string;
}

export interface HudViewModel {
  readonly hudVisible: boolean;
  readonly hpText: string;
  readonly hpPct: number;
  readonly hpTier: ReturnType<typeof hpDisplayTier>;
  readonly timeText: string;
  readonly timeFrozen: boolean;
  readonly levelText: string;
  readonly xpPct: number;
  readonly masteryText: string | null;
  readonly weapons: readonly WeaponSlotVm[];
  readonly currencies: readonly CurrencyChipVm[];
  readonly bossBar: BossBarVm | null;
  readonly warning: WarningBannerVm | null;
}

export interface ViewModelInputs {
  readonly snapshot: RunSnapshot;
  /** 领域函数 xpToNextLevel（domain/runState.ts，数值来自 config）。 */
  readonly xpToNext: (level: number) => number;
  /** config：RUN_TIMELINE_CONST.bossWarnCheckpointsSec。 */
  readonly warnCheckpointsSec: readonly number[];
  /** config：RUN_TIMELINE_CONST.bossSpawnSec。 */
  readonly bossSpawnSec: number;
  /** config：playerConfig.metaGrowth.maxLevel。 */
  readonly maxMetaLevel: number;
  readonly currencies?: Readonly<Partial<Record<CurrencyId, number>>> | null;
  readonly weaponLevels?: Readonly<Record<WeaponId, WeaponUpgradeLevel>> | null;
  readonly weaponCooldownPct?: Readonly<Record<WeaponId, number>> | null;
  readonly metaProgress?: SaveMetaProgress | null;
}

const TERMINAL_PHASES = new Set(['victory', 'defeat']);

/** 快照 → HUD 视图模型（纯函数，无副作用）。 */
export function buildHudViewModel(i: ViewModelInputs): HudViewModel {
  const s = i.snapshot;
  const hpPct = s.playerMaxHp > 0 ? clamp01(s.playerHp / s.playerMaxHp) : 0;
  const xpNeed = i.xpToNext(s.level);
  const xpPct = xpNeed > 0 ? clamp01(s.xp / xpNeed) : 0;

  const weapons: WeaponSlotVm[] = (['staff', 'sword'] as const).map((id) => ({
    id,
    labelKey: id === 'staff' ? UI_TEXT_KEYS.weaponStaff : UI_TEXT_KEYS.weaponSword,
    levelText: i.weaponLevels ? `Lv.${i.weaponLevels[id]}` : null,
    cooldownPct: i.weaponCooldownPct ? clamp01(i.weaponCooldownPct[id]) : null,
    active: s.currentWeapon === id,
  }));

  const currencies: CurrencyChipVm[] = CURRENCY_ORDER.map((id) => ({
    id,
    labelKey: CURRENCY_LABEL_KEY[id],
    text: i.currencies && typeof i.currencies[id] === 'number' ? formatCount(i.currencies[id] as number) : null,
    color: CURRENCY_THEME[id].color,
    shape: CURRENCY_THEME[id].shape,
  }));

  const masteryText = i.metaProgress
    ? `${i.metaProgress.staffMastery}/${i.maxMetaLevel} · ${i.metaProgress.swordMastery}/${i.maxMetaLevel} · ${i.metaProgress.forestSurvival}/${i.maxMetaLevel}`
    : null;

  const bossBar: BossBarVm | null =
    s.bossHpPct !== null && s.bossPhase !== null
      ? {
          phase: s.bossPhase,
          labelKey: BOSS_PHASE_THEME[s.bossPhase].labelKey,
          color: BOSS_PHASE_THEME[s.bossPhase].color,
          shape: BOSS_PHASE_THEME[s.bossPhase].shape,
          hpPct: clamp01(s.bossHpPct),
          hpText: formatPct(s.bossHpPct),
        }
      : null;

  // 预警：快照布尔给出窗口，检查点/登场秒来自 config（UI 不写死 510/540/570/600）
  let warning: WarningBannerVm | null = null;
  if (s.bossWarning && s.elapsedSec < i.bossSpawnSec) {
    let index: 0 | 1 | 2 = 0;
    for (let k = 0; k < i.warnCheckpointsSec.length; k++) {
      if (s.elapsedSec >= i.warnCheckpointsSec[k]) index = Math.min(2, k) as 0 | 1 | 2;
    }
    const labelKeys = [UI_TEXT_KEYS.warning1, UI_TEXT_KEYS.warning2, UI_TEXT_KEYS.warning3];
    warning = {
      index,
      shape: BOSS_WARN_SHAPE[index],
      labelKey: labelKeys[index],
      countdownText: formatTime(Math.max(0, i.bossSpawnSec - s.elapsedSec)),
    };
  }

  return {
    hudVisible: !TERMINAL_PHASES.has(s.phase),
    hpText: `${formatCount(s.playerHp)} / ${formatCount(s.playerMaxHp)}`,
    hpPct,
    hpTier: hpDisplayTier(hpPct),
    timeText: formatTime(s.elapsedSec),
    timeFrozen: s.phase === 'upgradePick',
    levelText: `Lv.${s.level}`,
    xpPct,
    masteryText,
    weapons,
    currencies,
    bossBar,
    warning,
  };
}
