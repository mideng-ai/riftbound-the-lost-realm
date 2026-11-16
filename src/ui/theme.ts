/**
 * TASK-07 UI 视觉 token —— 唯一来源 docs/美术-美术圣经V0.5.md。
 *
 * ⚠ 本文件只放**美术常量**（色值 / 形状语言），不含任何游戏数值。
 *   游戏数值一律从 src/config/ 与 src/domain/ 读取（见各组件）；
 *   本文件与 config 零耦合，便于美术改版时整文件替换。
 *
 * 来源索引：
 *   §1.1 环境主色 5 / §1.2 元素色 4（双通道：色相 + 形状） / §1.3 状态色 3
 *   §3.3 Boss 三阶段形态语义 / §4.1 预警形状语言（六形状，与判定几何 1:1）
 *   §8.1 宝石图标形状语言（元素四角形 + 属性三圆系）
 *   §5 触控：按钮 ≥ 12mm（≈45px），TASK-07 验收取 ≥44px
 */

/** 触控命中区最小边长（TASK-07 验收标准；美术圣经 §5 的 12mm ≈ 45px 更严，取较大者兼容）。 */
export const TAP_MIN_PX = 44;

/** 层叠顺序（显式分层，避免面板/HUD 堆叠歧义）。 */
export const Z = { hud: 50, gemPanel: 55, upgrade: 60, settlement: 70 } as const;

/** §1.1 环境主色 + §1.3 状态色 + 中性辅助。 */
export const PALETTE = {
  forest: '#2E7D4F',
  sprout: '#8FD14F',
  soil: '#7A5230',
  stone: '#C9C2B4',
  mist: '#A8D8D0',
  hitWhite: '#FFFFFF',
  poison: '#A3E635',
  slow: '#6EC6FF',
  uiBase: '#F5EFE0',
  uiInk: '#1E2A24',
  echoGold: '#F2A93B',
  danger: '#E0453A',
} as const;

/** §1.2 元素色（含色盲替代色）。 */
export const ELEMENT_THEME = {
  fire: { color: '#FF7A2F', colorblind: '#E0453A' },
  ice: { color: '#4FC3E8', colorblind: '#BFEFF5' },
  lightning: { color: '#FFE14D', colorblind: '#FFFFFF' },
  shadow: { color: '#8B5CF6', colorblind: '#3D3B8E' },
} as const;

/**
 * §4.1 六种预警形状（与地面判定几何 1:1）。
 * UI 图标复用同一形状语言，保证地面贴花与 HUD 提示读法一致。
 */
export const WARNING_SHAPES = {
  aoeCircle: { shape: 'aoeCircle', color: PALETTE.danger, labelKey: 'ui.warningShape.aoeCircle' },
  cone: { shape: 'cone', color: PALETTE.danger, labelKey: 'ui.warningShape.cone' },
  chargeLine: { shape: 'chargeLine', color: PALETTE.danger, labelKey: 'ui.warningShape.chargeLine' },
  hexField: { shape: 'hexField', color: PALETTE.poison, labelKey: 'ui.warningShape.hexField' },
  ringAura: { shape: 'ringAura', color: PALETTE.echoGold, labelKey: 'ui.warningShape.ringAura' },
  chainBolt: { shape: 'chainBolt', color: '#FFE14D', labelKey: 'ui.warningShape.chainBolt' },
} as const;

export type WarningShapeId = keyof typeof WARNING_SHAPES;

/** 六种精英词缀 → 六形状（互异，色盲模式可区分；形状语义近似 §4.1）。 */
export const AFFIX_SHAPE = {
  berserk: 'chargeLine',
  split: 'aoeCircle',
  vampiric: 'ringAura',
  shielded: 'hexField',
  summoner: 'cone',
  toxic: 'chainBolt',
} as const satisfies Record<string, WarningShapeId>;

/** Boss 三阶段（§3.3 形态语义 → 颜色 + 形状 + 文本 key，三者互异）。 */
export const BOSS_PHASE_THEME = {
  guardian: { color: PALETTE.mist, shape: 'shield', labelKey: 'ui.boss.phase.guardian' },
  corruption: { color: PALETTE.echoGold, shape: 'blossom', labelKey: 'ui.boss.phase.corruption' },
  coreFrenzy: { color: PALETTE.danger, shape: 'riftRing', labelKey: 'ui.boss.phase.coreFrenzy' },
} as const;

/** Boss 预警三点 → 三形状（§4.1 前三种危险形状，互异）。 */
export const BOSS_WARN_SHAPE = ['aoeCircle', 'cone', 'chargeLine'] as const;

/** §8.1 七宝石形状（元素四角形 + 属性三圆系，互异）。 */
export const GEM_KIND_SHAPE = {
  fire: 'diamond',
  ice: 'hexagon',
  lightning: 'triangle',
  shadow: 'crescent',
  power: 'shieldCircle',
  haste: 'windRing',
  vitality: 'leafHeart',
} as const;

/** §8.1 品质：色彩深度 + 边框（普通银边 / 稀有金边 / 传说发光橙金双边）。 */
export const GEM_QUALITY_THEME = {
  common: { border: PALETTE.stone, fill: '#E8E3D6', glow: false },
  uncommon: { border: PALETTE.sprout, fill: '#C7E8A6', glow: false },
  rare: { border: PALETTE.echoGold, fill: '#FFD98A', glow: false },
  epic: { border: '#8B5CF6', fill: '#C4A9FA', glow: false },
  legendary: { border: PALETTE.echoGold, fill: '#3D2A16', glow: true },
} as const;

/** 七货币 chip 的形状与颜色（形状互异，形状优先于颜色）。 */
export const CURRENCY_THEME = {
  gold: { color: PALETTE.echoGold, shape: 'circle' },
  forestMaterial: { color: PALETTE.soil, shape: 'square' },
  fireShard: { color: ELEMENT_THEME.fire.color, shape: 'diamond' },
  iceShard: { color: ELEMENT_THEME.ice.color, shape: 'hexagon' },
  lightningShard: { color: ELEMENT_THEME.lightning.color, shape: 'triangle' },
  shadowShard: { color: ELEMENT_THEME.shadow.color, shape: 'crescent' },
  forestCore: { color: PALETTE.forest, shape: 'star' },
} as const;

/** 形状 → SVG path（统一 viewBox 0 0 12 12；偶数环/折线用 fill-rule 或 stroke 表达）。 */
export function shapePath(shape: string): string {
  switch (shape) {
    case 'circle':
    case 'aoeCircle':
      return 'M6 1.1a4.9 4.9 0 1 0 0 9.8a4.9 4.9 0 1 0 0-9.8z';
    case 'ringAura':
      return 'M6 0.8a5.2 5.2 0 1 0 0 10.4a5.2 5.2 0 1 0 0-10.4z M6 2.7a3.3 3.3 0 1 1 0 6.6a3.3 3.3 0 1 1 0-6.6z';
    case 'windRing':
      return 'M6 1.4a4.6 4.6 0 1 0 0 9.2a4.6 4.6 0 1 0 0-9.2z M6 3.3a2.7 2.7 0 1 1 0 5.4a2.7 2.7 0 1 1 0-5.4z M0.4 6h3.1';
    case 'cone':
      return 'M6 1.8L11.3 10.6H0.7z';
    case 'chargeLine':
      return 'M1 4.4h7.2l2.4 1.6l-2.4 1.6H1z M9 3.2L11.4 6L9 8.8z';
    case 'hexField':
    case 'hexagon':
      return 'M3.2 1.3h5.6l2.7 4.7l-2.7 4.7H3.2L0.5 6z';
    case 'chainBolt':
      return 'M1 2.1l3.2 3.3L1.5 9l3.3 1.1l-1.7-3.6l3.3-3.1z M6.4 2.1l3.2 3.3L7.1 9l3.3 1.1L8.7 6.5L12 3.4z';
    case 'diamond':
      return 'M6 0.9L11.1 6L6 11.1L0.9 6z';
    case 'triangle':
      return 'M6 1L11.2 10.7H0.8z';
    case 'square':
      return 'M1.6 1.6h8.8v8.8H1.6z';
    case 'star':
    case 'riftRing':
      return 'M6 0.7l1.6 3.5l3.8.4l-2.9 2.5l.9 3.8L6 9.1l-3.4 1.8l.9-3.8L0.6 4.6l3.8-.4z';
    case 'crescent':
      return 'M7.8 1.1a4.9 4.9 0 1 0 2.1 8.7A4.2 4.2 0 1 1 7.8 1.1z';
    case 'shield':
      return 'M6 0.9l4.6 1.9v3.4c0 2.7-1.9 4.6-4.6 5.4C3.3 10.8 1.4 8.9 1.4 6.2V2.8z';
    case 'shieldCircle':
      return 'M6 1a5 5 0 1 0 0 10a5 5 0 1 0 0-10z M6 2.7l2 1.1v2c0 1.2-.8 2-2 2.5c-1.2-.5-2-1.3-2-2.5v-2z';
    case 'blossom':
      return 'M6 1.2a2 2 0 1 1 1.9 2.7A2 2 0 1 1 9.7 6a2 2 0 1 1-1.8 2.1A2 2 0 1 1 6 10.8a2 2 0 1 1-1.9-2.7A2 2 0 1 1 2.3 6a2 2 0 1 1 1.8-2.1A2 2 0 0 1 6 1.2z';
    case 'leafHeart':
      return 'M6 10.9C2.8 8.7 1.2 6.9 1.2 4.8A2.9 2.9 0 0 1 6 3.1a2.9 2.9 0 0 1 4.8 1.7c0 2.1-1.6 3.9-4.8 6.1z';
    default:
      return 'M6 1.1a4.9 4.9 0 1 0 0 9.8a4.9 4.9 0 1 0 0-9.8z';
  }
}

/** 需要 evenodd / 镂空的形状（环形类）。 */
export function shapeNeedsEvenOdd(shape: string): boolean {
  return shape === 'ringAura' || shape === 'windRing' || shape === 'shieldCircle' || shape === 'crescent';
}
