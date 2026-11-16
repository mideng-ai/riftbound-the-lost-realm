/**
 * TASK-07 战斗 HUD：HP、双武器（强化等级/冷却/切换）、经验条、计时器、七货币 chips、成长进度。
 * 高频数值每帧由 UiRoot.tick() 驱动；文本只在值变化时写 DOM（移动端性能）。
 */
import type { EventBusApi } from '../domain/index.ts';
import type { UiCommandSink } from './commands.ts';
import type { HudViewModel } from './viewModel.ts';
import type { TextResolver } from './uiText.ts';
import { el, setIfChanged, shapeBadge, textCell, type TextCell } from './dom.ts';
import { TAP_MIN_PX } from './theme.ts';
import { UI_TEXT_KEYS } from './uiText.ts';

export class HudLayer {
  readonly root: HTMLElement;
  private readonly hpBar: HTMLElement;
  private readonly hpBox: HTMLElement;
  private readonly hpText = textCell(el('span', { class: 'rb-hp-text' }));
  private readonly xpBar: HTMLElement;
  private readonly levelTextCell = textCell(el('span', { class: 'rb-level' }));
  private readonly timerCell = textCell(el('span', { class: 'rb-timer' }));
  private readonly frozenBadge: HTMLElement;
  private readonly masteryCell = textCell(el('span', { class: 'rb-mastery' }));
  private readonly pickupCell = textCell(el('span', { class: 'rb-last-pickup' }));
  private readonly currencyCells: TextCell[] = [];
  private readonly weaponCards: {
    readonly root: HTMLElement;
    readonly level: TextCell;
    readonly cooldown: HTMLElement;
    readonly btn: HTMLButtonElement;
  }[] = [];
  private readonly unsubs: (() => void)[] = [];

  constructor(parent: HTMLElement, bus: EventBusApi, dispatch: UiCommandSink, private readonly text: TextResolver) {
    this.root = el('div', { class: 'rb-hud' });
    parent.appendChild(this.root);

    // ── 左上：HP / XP / 成长里程碑 ──
    const left = el('div', { class: 'rb-hud-left' });
    this.hpBox = el('div', { class: 'rb-hp-box', role: 'img', 'aria-label': text(UI_TEXT_KEYS.hp) });
    this.hpBar = el('div', { class: 'rb-hp-bar' });
    this.hpBox.append(this.hpBar, this.hpText.node);
    const xpRow = el('div', { class: 'rb-xp-row' });
    const xpTrack = el('div', { class: 'rb-xp-track', role: 'progressbar', 'aria-label': text(UI_TEXT_KEYS.xp) });
    this.xpBar = el('div', { class: 'rb-xp-bar' });
    xpTrack.appendChild(this.xpBar);
    xpRow.append(this.levelTextCell.node, xpTrack);
    left.append(this.hpBox, xpRow, this.masteryCell.node);

    // ── 中上：计时器 + 冻结徽标 ──
    const center = el('div', { class: 'rb-hud-center' });
    this.frozenBadge = el('span', { class: 'rb-frozen-badge', role: 'status' }, text(UI_TEXT_KEYS.frozen));
    center.append(this.timerCell.node, this.frozenBadge);

    // ── 右上：七货币 chips（形状 + 颜色双通道）+ 宝石入口 ──
    const right = el('div', { class: 'rb-hud-right' });
    const chips = el('div', { class: 'rb-currency-row' });
    for (let n = 0; n < 7; n++) {
      const chip = el('span', { class: 'rb-currency-chip' });
      const badge = el('span', { class: 'rb-chip-badge' });
      chip.appendChild(badge);
      const value = el('span', { class: 'rb-chip-value' });
      chip.appendChild(value);
      this.currencyCells.push(textCell(value));
      chips.appendChild(chip);
    }
    const gemBtn = el('button', { class: 'rb-gem-btn', 'aria-label': text(UI_TEXT_KEYS.gems) }, text(UI_TEXT_KEYS.gems));
    gemBtn.style.minWidth = `${TAP_MIN_PX + 20}px`;
    gemBtn.style.minHeight = `${TAP_MIN_PX}px`;
    gemBtn.addEventListener('click', () => dispatch({ type: 'gem:open' }));
    right.append(chips, gemBtn, this.pickupCell.node);

    // ── 左下：双武器（强化等级 / 冷却遮罩 / 切换命令）──
    const weapons = el('div', { class: 'rb-weapons' });
    for (const id of ['staff', 'sword'] as const) {
      const card = el('div', { class: 'rb-weapon-card' });
      const btn = el('button', { class: 'rb-weapon-btn', 'aria-label': text(id === 'staff' ? UI_TEXT_KEYS.weaponStaff : UI_TEXT_KEYS.weaponSword) });
      btn.style.minWidth = `${TAP_MIN_PX + 20}px`;
      btn.style.minHeight = `${TAP_MIN_PX + 20}px`;
      const label = el('span', { class: 'rb-weapon-label' }, text(id === 'staff' ? UI_TEXT_KEYS.weaponStaff : UI_TEXT_KEYS.weaponSword));
      const level = el('span', { class: 'rb-weapon-level' });
      const cooldown = el('div', { class: 'rb-weapon-cd', 'aria-hidden': 'true' });
      btn.append(label, level);
      card.append(btn, cooldown);
      btn.addEventListener('click', () => dispatch({ type: 'weapon:switch', to: id }));
      weapons.appendChild(card);
      this.weaponCards.push({ root: card, level: textCell(level), cooldown, btn });
    }

    this.root.append(left, center, right, weapons);

    // 离散事件：最近一次拾取（金额来自事件 payload，UI 不累加资源）
    this.unsubs.push(
      bus.subscribe('resource.picked_up', (p) => {
        setIfChanged(this.pickupCell, `${text(UI_TEXT_KEYS.pickedResources)}: ${p.currencyId} +${p.amount}`);
      }),
    );
  }

  update(vm: HudViewModel): void {
    this.root.classList.toggle('rb-hidden', !vm.hudVisible);

    this.hpBar.style.width = `${Math.round(vm.hpPct * 100)}%`;
    this.hpBox.dataset.state = vm.hpTier;
    setIfChanged(this.hpText, vm.hpText);
    this.xpBar.style.width = `${Math.round(vm.xpPct * 100)}%`;
    setIfChanged(this.levelTextCell, vm.levelText);
    setIfChanged(this.timerCell, vm.timeText);
    this.frozenBadge.classList.toggle('rb-on', vm.timeFrozen);
    setIfChanged(this.masteryCell, vm.masteryText ?? '—');

    for (let n = 0; n < this.currencyCells.length; n++) {
      const vmChip = vm.currencies[n];
      setIfChanged(this.currencyCells[n], vmChip.text ?? '—');
      const chip = this.currencyCells[n].node.parentElement;
      const badge = chip?.querySelector('.rb-chip-badge');
      if (badge && badge.childElementCount === 0) {
        badge.appendChild(shapeBadge(vmChip.shape, vmChip.color, 12));
        chip?.setAttribute('title', this.text(vmChip.labelKey));
        chip?.setAttribute('aria-label', this.text(vmChip.labelKey));
      }
    }

    for (let n = 0; n < this.weaponCards.length; n++) {
      const w = vm.weapons[n];
      const c = this.weaponCards[n];
      setIfChanged(c.level, w.levelText ?? '—');
      c.root.classList.toggle('rb-active', w.active);
      c.cooldown.style.setProperty('--cd', w.cooldownPct === null ? '0' : String(1 - w.cooldownPct));
    }
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    this.root.remove();
  }
}
