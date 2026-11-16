/**
 * Riftbound: The Lost Realm —— 首发英语（en）玩家可见文本表。
 *
 * 唯一命名源：docs/叙事-世界观与文案.md §2 术语表；Boss 与事件文案见同文档 §3 / §4。
 * 命名冲突时一律以术语表为准（例如地形 ID 为 ice/lightning，但玩家可见名是 Frost/Storm）。
 *
 * 本文件是纯数据叶子：零 import、零逻辑，任何层都可安全引用。
 * 字符串值全部英文；注释为中文，只给维护者看，不进游戏、不进打包产物。
 *
 * 接线方式：宿主把 enTexts 作为 TextResolver 注入 src/ui/uiText.ts（详见说明文档 §5）。
 * 本地化冻结后禁止改动已发布源字符串，除非走设计变更流程。
 *
 * 标记约定：注释含「待定」= PROVISIONAL，需原型实测或所有者拍板；未标记者为定案。
 */

export const enTexts: Record<string, string> = {
  // ══ HUD ══════════════════════════════════════════════════════════════
  'ui.hud.hp': 'Health', // 血条 aria-label
  'ui.hud.xp': 'Experience', // 经验条 aria-label
  'ui.hud.level': 'Level', // 升级 toast 前缀："Level 3"
  'ui.hud.timer': 'Time', // 计时器标签（当前只显示 formatTime 结果）
  'ui.hud.frozen': 'Time Frozen', // 选卡时冻结徽标

  // ══ 武器 ══════════════════════════════════════════════════════════════
  'ui.weapon.staff': 'Staff', // 法杖按钮 + 宝石槽列标题
  'ui.weapon.sword': 'Sword', // 魔法剑按钮 + 宝石槽列标题
  'ui.weapon.cooldown': 'Cooldown', // 冷却遮罩备用标签（当前由 CSS 变量表现）

  // ══ 成长 ══════════════════════════════════════════════════════════════
  'ui.meta.mastery': 'Mastery', // HUD 永久成长进度标签

  // ══ 宝石面板 ══════════════════════════════════════════════════════════
  'ui.gem.open': 'Gems', // HUD 打开按钮
  'ui.gem.title': 'Gem Forge', // 面板标题 / dialog aria-label
  'ui.gem.sockets': 'Sockets', // 镶嵌区小节标题
  'ui.gem.inventory': 'Gems', // 库存小节标题；结算页宝石行名（一物两用，取通用短名）
  'ui.gem.combine': 'Combine', // 合成按钮
  'ui.gem.close': 'Close', // 关闭 / 拆卸按钮 aria-label（可见字形为 ×）
  'ui.gem.mergeRule': 'Select three identical gems to merge.', // 合成提示
  'ui.gem.topQuality': 'Already legendary — cannot merge further.', // 传说品质提示（GemPanel 硬编码 key）

  // ══ 升级卡 ════════════════════════════════════════════════════════════
  'ui.upgrade.title': 'Choose an Upgrade', // 三选一 dialog 标题
  'ui.upgrade.frozen': 'The Rift holds its breath while you choose.', // 冻结状态文案
  'ui.scope.staff': 'Staff', // 卡面范围徽标
  'ui.scope.sword': 'Sword', // 卡面范围徽标
  'ui.scope.generic': 'Any Weapon', // 卡面范围徽标（通用）

  // 15 条升级卡：名称 / 描述。数值由 UI 从 tiers 单独渲染，描述不重复数字。
  'upgrade.splitShot.name': 'Split Shot',
  'upgrade.splitShot.desc': 'Staff fires extra projectiles; each one hits softer than the last.',
  'upgrade.chargeHaste.name': 'Charge Haste',
  'upgrade.chargeHaste.desc': 'Shorten the time between staff casts.',
  'upgrade.pierceShot.name': 'Pierce Shot',
  'upgrade.pierceShot.desc': 'Bolts pass through foes, weakening with every body they cross.',
  'upgrade.elementalResonance.name': 'Elemental Resonance',
  'upgrade.elementalResonance.desc': "Raise the chance your gems' elements ignite on a hit.",
  'upgrade.heavyShot.name': 'Heavy Shot',
  'upgrade.heavyShot.desc': 'Strike harder with every staff bolt.',
  'upgrade.bladeEnhance.name': 'Blade Enhancement',
  'upgrade.bladeEnhance.desc': 'Increase the damage of each sword swing.',
  'upgrade.vampiricBlade.name': 'Vampiric Blade',
  'upgrade.vampiricBlade.desc': 'Sword hits restore a fraction of your maximum health.',
  'upgrade.whirlwind.name': 'Whirlwind',
  'upgrade.whirlwind.desc': 'Shorten the time between sword swings.',
  'upgrade.armorBreak.name': 'Armor Break',
  'upgrade.armorBreak.desc': 'Cut deeper into elites and the Warden.',
  'upgrade.arcExtend.name': 'Arc Extension',
  'upgrade.arcExtend.desc': "Widen the sword's sweeping arc.",
  'upgrade.swiftStep.name': 'Swift Step',
  'upgrade.swiftStep.desc': 'Move faster across the forest floor.',
  'upgrade.stoneSkin.name': 'Stone Skin',
  'upgrade.stoneSkin.desc': 'Take less damage from every source.',
  'upgrade.voidDash.name': 'Void Dash',
  'upgrade.voidDash.desc': 'Recover your dash sooner.',
  'upgrade.leech.name': 'Leech',
  'upgrade.leech.desc': 'Restore health with every kill.',
  'upgrade.timeSand.name': 'Sands of Time',
  'upgrade.timeSand.desc': 'Gain more experience from every enemy.',

  // ══ Boss 阶段与预警 ══════════════════════════════════════════════════
  // 三阶段名严格取自术语表，不得自造。
  'ui.boss.phase.guardian': "The Warden's Wake",
  'ui.boss.phase.corruption': 'Corrupted Bloom',
  'ui.boss.phase.coreFrenzy': 'Rift Unbound',
  'ui.warning.1': 'The forest holds its breath.', // 8:30 第一预警
  'ui.warning.2': 'Something stirs beneath the roots.', // 9:00 第二预警
  'ui.warning.3': 'The Warden is coming.', // 9:30 第三预警
  'ui.warning.countdown': 'Countdown', // 倒计时格备用标签
  // 形状无障碍标签（当前 UI 用 warning.1/2/3，形状名保留给后续 tooltip / aria）
  'ui.warningShape.aoeCircle': 'Circle',
  'ui.warningShape.cone': 'Cone',
  'ui.warningShape.chargeLine': 'Charge Line',
  'ui.warningShape.hexField': 'Hex Field',
  'ui.warningShape.ringAura': 'Ring Aura',
  'ui.warningShape.chainBolt': 'Chain Bolt',
  // 待定：当前 UI 走 BOSS_PHASE_THEME.labelKey，此 key 无挂载点，作为换阶段 toast 的备用短标签。
  'ui.toast.boss.phaseChanged': 'Phase Shift',

  // ══ Toast ══════════════════════════════════════════════════════════════
  'ui.toast.elite': 'Elite', // 精英 toast kicker
  'ui.toast.event.started': 'Event Started',
  'ui.toast.event.completed': 'Event Completed',
  'ui.toast.event.expired': 'Event Expired',
  'ui.toast.boss.spawned': 'The Rift Warden has awakened.',
  'ui.toast.boss.defeated': 'The Rift Warden has fallen.',

  // ══ 结算 ══════════════════════════════════════════════════════════════
  'ui.settle.victory': 'Victory',
  'ui.settle.defeat': 'Defeat',
  'ui.settle.kept': 'Kept', // 表格列头
  'ui.settle.lost': 'Lost', // 对应列头；契约无「地面未拾取」字段，当前无挂载点
  'ui.settle.newRun': 'Begin a New Run',
  'ui.settle.survived': 'Survived', // "Survived 10:23"
  'ui.settle.pickedResources': 'Recovered', // 表头 + 拾取提示 "Recovered: gold +5"
  // 待定（S3）：结算页是否暗示续作由所有者拍板；此句仅在签字后接线，默认不显示。
  'ui.settle.afterword': 'The Rift endures. Another must keep watch.',

  // ══ 资源 / 货币 ═══════════════════════════════════════════════════════
  // forestMaterial 的玩家可见名用术语表 Wildwood；ice/lightning 碎片用 Frost/Storm 保持元素命名一致。
  'ui.currency.gold': 'Gold',
  'ui.currency.forestMaterial': 'Wildwood',
  'ui.currency.fireShard': 'Fire Shard',
  'ui.currency.iceShard': 'Frost Shard',
  'ui.currency.lightningShard': 'Storm Shard',
  'ui.currency.shadowShard': 'Shadow Shard',
  'ui.currency.forestCore': 'Forest Core',

  // ══ 敌人（4 普通 + 2 精英 + Boss）═══════════════════════════════════
  'enemy.riftHound.name': 'Rift Hound',
  'enemy.riftSpitter.name': 'Rift Spitter',
  'enemy.umbraDasher.name': 'Umbra Dasher',
  'enemy.riftNourisher.name': 'Rift Nourisher',
  'enemy.riftRavager.name': 'Rift Ravager',
  'enemy.riftCaller.name': 'Rift Caller',
  'enemy.riftWarden.name': 'The Rift Warden', // 方案 A：血条主名
  'enemy.riftWarden.title': 'Corrupted Forest Lord', // 方案 A：称号副题

  // ══ 精英词缀（ID 与玩家可见名不同，以术语表为准）════════════════════
  'affix.berserk.name': 'Frenzied',
  'affix.split.name': 'Splitting',
  'affix.vampiric.name': 'Vampiric',
  'affix.shielded.name': 'Shielded',
  'affix.summoner.name': 'Summoning',
  'affix.toxic.name': 'Virulent',

  // ══ 世界事件（5 种）══════════════════════════════════════════════════
  'event.lostChest.name': 'Lost Cache',
  'event.elementalAltar.name': 'Elemental Altar',
  'event.monsterNest.name': 'Monster Nest',
  'event.ancientAltar.name': 'Ancient Altar',
  'event.eliteInvasion.name': 'Elite Incursion',
  // 事件三段文案（出现 / 选择 / 结果），取自叙事文档 §4，尚未有 UI 挂载点。
  'event.lostChest.appear': "A settler's keepsake survived the rot.",
  'event.lostChest.choice': 'Open it. Lost things should return.',
  'event.lostChest.result': 'The lid clicks shut, like a late thank-you.',
  'event.elementalAltar.appear': 'The wild current has crystallized here.',
  'event.elementalAltar.choice': 'Trade shards for an elemental gem?',
  'event.elementalAltar.result': 'The gem is warm. Still beating.',
  'event.monsterNest.appear': 'Something breeds beneath the roots.',
  'event.monsterNest.choice': 'Burn it, or loot while they sleep.',
  'event.monsterNest.result': "The nest's cries fade with the smoke.",
  'event.ancientAltar.appear': 'The old altar still drinks in echoes.',
  'event.ancientAltar.choice': 'Offer gold. Forge what lasts.',
  'event.ancientAltar.result': 'The echoes settle. You weigh more now.',
  'event.eliteInvasion.appear': "From the Rift's deep, a Ravager scents you.",
  'event.eliteInvasion.choice': 'Face it. It carries a corruption strain.',
  'event.eliteInvasion.result': 'The strain dies out. The forest breathes.',

  // ══ Boss 台词（登场 / 两次转阶段 / 击败），取自叙事文档 §3 ═══════════
  'boss.line.intro': 'The Warden wakes. The forest rots with him.',
  'boss.line.phase1to2': 'He resists no more. Flowers bloom from bone.',
  'boss.line.phase2to3': 'The Rift whispers through him: let it all go.',
  'boss.line.defeated': 'My watch ends... the seal is yours to keep.',

  // ══ Boss 六攻击名 ════════════════════════════════════════════════════
  // 待定：当前预警 UI 只显示形状与 ui.warning.*，攻击名无挂载点；保留给演出/图鉴。
  'boss.attack.rootSpike.name': 'Root Spike',
  'boss.attack.sweepSwipe.name': 'Sweeping Swipe',
  'boss.attack.groundSlam.name': 'Ground Slam',
  'boss.attack.corruptVines.name': 'Corrupt Vines',
  'boss.attack.forestSummon.name': 'Forest Summon',
  'boss.attack.coreBurst.name': 'Core Burst',

  // ══ 宝石（7 种）与品质（5 级）═══════════════════════════════════════
  // ID ice/lightning/power/vitality → 玩家可见名 Frost/Storm/Might/Vital（术语表）
  'gem.fire.name': 'Fire Gem',
  'gem.ice.name': 'Frost Gem',
  'gem.lightning.name': 'Storm Gem',
  'gem.shadow.name': 'Shadow Gem',
  'gem.power.name': 'Might Gem',
  'gem.haste.name': 'Haste Gem',
  'gem.vitality.name': 'Vital Gem',
  'gem.quality.common': 'Common',
  'gem.quality.uncommon': 'Uncommon',
  'gem.quality.rare': 'Rare',
  'gem.quality.epic': 'Epic',
  'gem.quality.legendary': 'Legendary',
};
