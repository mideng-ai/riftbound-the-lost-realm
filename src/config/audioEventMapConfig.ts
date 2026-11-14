/**
 * 领域事件 → 音效 ID 映射 + 混音优先级。
 *
 * 数值唯一来源：音频-音效事件表.md §1–§5。状态：事件清单 CONFIRMED / 混音数值 PROVISIONAL。
 *
 * 开放问题采信结论：
 *   - Q7：音效文件名保持音效表原文不动（`sfx_proc_frost` / `sfx_proc_storm`），
 *         契约侧统一用元素 ID（ice / lightning），在**本映射表**做转换。
 *         即：领域事件 `proc.triggered` + element='ice' → 播 `sfx_proc_frost`。
 *
 * 音频引擎选型（Babylon AudioEngine vs 裸 Web Audio）仍是 D-OPEN，S6 前关闭；
 * 本表只表达"什么时候该响什么音"，不绑定任何引擎 API。
 *
 * 本文件是纯数据叶子：不 import 任何其他 config 文件。
 */

export const audioEventMapConfig = {
  /**
   * 元素 ID → 实际音效文件名 ID 的转换表（Q7 采信）。
   * 键 = 契约元素 ID，值 = 音效事件表原文文件名（不带扩展名/变体后缀）。
   * 状态：CONFIRMED。
   */
  elementToProcSfx: {
    fire: 'sfx_proc_fire',
    ice: 'sfx_proc_frost', // 音效表原文 frost（Q7：文件名不动）
    lightning: 'sfx_proc_storm', // 音效表原文 storm（Q7：文件名不动）
    shadow: 'sfx_proc_shadow',
  },

  /**
   * 领域事件 → 音效 ID 列表。键与 domain/events.ts 的 GameEventMap 一一对应。
   * 状态：CONFIRMED（映射关系）。
   *
   * 约定：
   *   - 只列**一瞬间发生一次**的事件（每帧变化的数值走 RunSnapshot 轮询，不出事件、不播音）。
   *   - 空数组表示该事件无音效（显式写出来，便于审计"这个事件确实不需要声音"）。
   */
  eventToSfx: {
    'run.started': ['sfx_ui_click'],
    'run.phaseChanged': [],
    'run.settled': ['sfx_run_win'],
    'player.damaged': ['sfx_player_hurt'],
    'player.died': ['sfx_player_death'],
    'player.leveledUp': ['sfx_levelup'],
    'upgrade.offered': [],
    'upgrade.selected': ['sfx_upgrade_pick'],
    'weapon.switched': ['sfx_weapon_switch'],
    'weapon.upgraded': ['sfx_weapon_upgrade'],
    'gem.socketed': ['sfx_gem_socket'],
    'gem.unsocketed': ['sfx_gem_unsocket'],
    'gem.merged': ['sfx_gem_merge'],
    'enemy.spawned': [],
    'enemy.killed': [],
    'proc.triggered': [], // 由 elementToProcSfx 按元素决定，见 resolveSfxForProc
    'elite.spawned': ['sfx_elite_spawn'],
    'resource.dropped': [],
    'resource.picked_up': [], // 按货币种类映射，见 currencyToPickupSfx
    'world_event.started': ['sfx_event_start'],
    'world_event.completed': ['sfx_event_done'],
    'world_event.expired': ['sfx_event_done'], // 超时与完成共用（音效表 §4「可共用 + 变体」）
    'boss.warning_started': ['sfx_boss_warn_1'],
    'boss.spawned': [],
    'boss.phase_changed': [], // 按阶段映射，见 bossPhaseToSfx
    'boss.defeated': ['sfx_boss_defeat'],
  },

  /**
   * 资源货币 → 拾取音效。来源：音效表 §2「sfx_pickup_gold / _material / _shard / _core」。
   * 状态：CONFIRMED。四种元素碎片共用 sfx_pickup_shard。
   */
  currencyToPickupSfx: {
    gold: 'sfx_pickup_gold',
    forestMaterial: 'sfx_pickup_material',
    fireShard: 'sfx_pickup_shard',
    iceShard: 'sfx_pickup_shard',
    lightningShard: 'sfx_pickup_shard',
    shadowShard: 'sfx_pickup_shard',
    forestCore: 'sfx_pickup_core',
  },

  /**
   * Boss 阶段切换音效。来源：音效表 §3「sfx_boss_phase_2 / _3」。
   * guardian 是初始阶段，切换进来不需要音效（null）。
   * 状态：CONFIRMED。
   */
  bossPhaseToSfx: {
    guardian: null,
    corruption: 'sfx_boss_phase_2',
    coreFrenzy: 'sfx_boss_phase_3',
  },

  /**
   * Boss 预警三点音效。来源：音效表 §3「8:30 / 9:00 / 9:30」= RUN_TIMELINE 的检查点。
   * 状态：CONFIRMED。下标与 common.RUN_TIMELINE_CONST.bossWarnCheckpointsSec 对齐。
   */
  bossWarnSfxByCheckpoint: ['sfx_boss_warn_1', 'sfx_boss_warn_2', 'sfx_boss_warn_3'],

  /**
   * 精英词缀提示音效。来源：音效表 §3「sfx_affix_<6 种词缀>」。状态：CONFIRMED。
   */
  affixToSfx: {
    berserk: 'sfx_affix_berserk',
    split: 'sfx_affix_split',
    vampiric: 'sfx_affix_vampiric',
    shielded: 'sfx_affix_shielded',
    summoner: 'sfx_affix_summoner',
    toxic: 'sfx_affix_toxic',
  },

  /**
   * Boss 六种攻击音效。来源：音效表 §3「sfx_boss_attack_1..6」。状态：CONFIRMED。
   * 顺序与 enemyConfig.boss.attacks 的数组顺序一致（根须突刺→核心爆发）。
   */
  bossAttackSfx: [
    'sfx_boss_attack_1',
    'sfx_boss_attack_2',
    'sfx_boss_attack_3',
    'sfx_boss_attack_4',
    'sfx_boss_attack_5',
    'sfx_boss_attack_6',
  ],

  /**
   * 混音优先级。来源：音效表 §5「Boss 预警 > Boss 攻击 > 词缀 > 常规」。状态：PROVISIONAL。
   * 数字越大越不容易被抢占（同屏音源上限的实现留给音频层，本表只给排序依据）。
   */
  mixerPriority: {
    bossWarn: 40, // Boss 预警（最高）
    bossAttack: 30, // Boss 攻击
    affix: 20, // 词缀提示
    normal: 10, // 常规
  },

  /**
   * 同屏音源上限（防止手机音频通道被占满）。来源：音效表 §5。状态：PROVISIONAL。
   */
  maxConcurrentVoices: 16,
} as const;
