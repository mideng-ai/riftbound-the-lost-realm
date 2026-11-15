/**
 * TASK-07 UI 文本端口。
 *
 * 铁律（docs/叙事-世界观与文案.md §6）：代码里禁止出现自然语言字面量，
 * 所有玩家可见文本走 nameKey / descKey。本仓库尚无文本表实现，因此 UI 只定义
 * **key 常量 + 注入式 resolver**，绝不自行撰写英文文案。
 *
 * - 正式接线：宿主注入 TextResolver（读 locale 表 / 叙事文案 §6 的 380 条）
 * - 未接线：keyLabel() 从 key 派生可读调试标签（从标识符派生，非自然语言字面量）
 *   —— 仅用于 UI 骨架验收，正式上线必须注入 resolver，否则玩家会看到 key。
 */
export type TextResolver = (key: string) => string;

/** UI 自身的文本 key（玩家可见文本的唯一起点）。 */
export const UI_TEXT_KEYS = {
  hp: 'ui.hud.hp',
  xp: 'ui.hud.xp',
  level: 'ui.hud.level',
  timer: 'ui.hud.timer',
  frozen: 'ui.hud.frozen',
  weaponStaff: 'ui.weapon.staff',
  weaponSword: 'ui.weapon.sword',
  cooldown: 'ui.weapon.cooldown',
  mastery: 'ui.meta.mastery',
  gems: 'ui.gem.open',
  gemTitle: 'ui.gem.title',
  gemSockets: 'ui.gem.sockets',
  gemInventory: 'ui.gem.inventory',
  gemCombine: 'ui.gem.combine',
  gemClose: 'ui.gem.close',
  gemMergeRule: 'ui.gem.mergeRule',
  upgradeTitle: 'ui.upgrade.title',
  upgradeFrozen: 'ui.upgrade.frozen',
  bossPhaseGuardian: 'ui.boss.phase.guardian',
  bossPhaseCorruption: 'ui.boss.phase.corruption',
  bossPhaseCoreFrenzy: 'ui.boss.phase.coreFrenzy',
  warning1: 'ui.warning.1',
  warning2: 'ui.warning.2',
  warning3: 'ui.warning.3',
  warningCountdown: 'ui.warning.countdown',
  elite: 'ui.toast.elite',
  eventStarted: 'ui.toast.event.started',
  eventCompleted: 'ui.toast.event.completed',
  eventExpired: 'ui.toast.event.expired',
  bossSpawned: 'ui.toast.boss.spawned',
  bossDefeated: 'ui.toast.boss.defeated',
  bossPhaseChanged: 'ui.toast.boss.phaseChanged',
  settleVictory: 'ui.settle.victory',
  settleDefeat: 'ui.settle.defeat',
  settleKept: 'ui.settle.kept',
  settleLost: 'ui.settle.lost',
  settleNewRun: 'ui.settle.newRun',
  settleSurvived: 'ui.settle.survived',
  pickedResources: 'ui.settle.pickedResources',
  currencyGold: 'ui.currency.gold',
  currencyForestMaterial: 'ui.currency.forestMaterial',
  currencyFireShard: 'ui.currency.fireShard',
  currencyIceShard: 'ui.currency.iceShard',
  currencyLightningShard: 'ui.currency.lightningShard',
  currencyShadowShard: 'ui.currency.shadowShard',
  currencyForestCore: 'ui.currency.forestCore',
} as const;

/** 默认解析器：返回 key 本身（最诚实，绝不伪造文案）。 */
export const identityTextResolver: TextResolver = (key) => key;

/**
 * 调试用可读标签：'upgrade.splitShot.name' → 'Split Shot'，
 * 'ui.upgrade.title' → 'Upgrade Title'，'ui.upgrade.frozen' → 'Upgrade Frozen'。
 * 从标识符派生，不是自然语言字面量；仅用于骨架验收显示。
 */
export function keyLabel(key: string): string {
  const parts = key.split('.');
  // ui.* 前缀去掉后保留全部段，避免同一命名空间下的不同 key 撞成同一个标签
  // 其余 key：以 name/desc 结尾取标识符段（'upgrade.splitShot.name' → 'Split Shot'），
  //          否则取末段（'gem.quality.common' → 'Common'）
  const tail = parts[parts.length - 1];
  const labelParts = key.startsWith('ui.')
    ? parts.slice(1)
    : tail === 'name' || tail === 'desc'
      ? parts.slice(-2, -1)
      : parts.slice(-1);
  const spaced = (labelParts.join(' ') || key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** 骨架验收用解析器（宿主未注入 locale 表时）。 */
export const debugTextResolver: TextResolver = (key) => keyLabel(key);
