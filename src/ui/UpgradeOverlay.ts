/**
 * TASK-07 升级三选一界面。
 * 显示：EventBus 'upgrade.offered'（choices 由 domain 掷出，UI 不调 rollUpgradeChoices）；
 * 隐藏：'upgrade.selected' 事件 + 每帧 phase 快照兜底（≤1 帧）。
 * 卡面文本走 nameKey/descKey，卡面数值来自 payload 的 tiers（config 经领域转发）。
 */
import type { EventBusApi, RunSnapshot, UpgradeCardDef, UpgradeId } from '../domain/index.ts';
import type { UiCommandSink } from './commands.ts';
import { el, shapeBadge } from './dom.ts';
import { TAP_MIN_PX } from './theme.ts';
import { UI_TEXT_KEYS, type TextResolver } from './uiText.ts';

const SCOPE_SHAPE = { staff: 'diamond', sword: 'triangle', generic: 'circle' } as const;

export class UpgradeOverlay {
  readonly root: HTMLElement;
  private readonly cardRow: HTMLElement;
  private readonly unsubs: (() => void)[] = [];
  /** 事件到达后给宿主的 phase 同步留出 2 帧（否则 domain 尚未切 upgradePick 会被兜底逻辑立刻关掉）。 */
  private pendingFrames = 0;

  constructor(parent: HTMLElement, bus: EventBusApi, private readonly dispatch: UiCommandSink, private readonly text: TextResolver) {
    this.root = el('div', { class: 'rb-upgrade-overlay rb-hidden', role: 'dialog', 'aria-label': this.text(UI_TEXT_KEYS.upgradeTitle) });
    const title = el('h2', { class: 'rb-upgrade-title' }, this.text(UI_TEXT_KEYS.upgradeTitle));
    const frozen = el('p', { class: 'rb-upgrade-frozen', role: 'status' }, this.text(UI_TEXT_KEYS.upgradeFrozen));
    this.cardRow = el('div', { class: 'rb-upgrade-cards' });
    this.root.append(title, frozen, this.cardRow);
    parent.appendChild(this.root);

    this.unsubs.push(
      bus.subscribe('upgrade.offered', (p) => this.show(p.choices)),
      bus.subscribe('upgrade.selected', () => this.hide()),
    );
  }

  private show(cards: readonly UpgradeCardDef[]): void {
    this.cardRow.replaceChildren();
    for (const card of cards) {
      const shape = SCOPE_SHAPE[card.scope];
      const btn = el('button', { class: 'rb-upgrade-card', 'aria-label': this.text(card.nameKey) });
      btn.style.minWidth = `${TAP_MIN_PX + 60}px`;
      btn.style.minHeight = `${TAP_MIN_PX + 120}px`;
      const scope = el('span', { class: 'rb-card-scope', 'data-shape': shape });
      scope.appendChild(shapeBadge(shape, '#C9C2B4', 12));
      scope.appendChild(el('span', undefined, this.text('ui.scope.' + card.scope)));
      const name = el('span', { class: 'rb-card-title' }, this.text(card.nameKey));
      const desc = el('span', { class: 'rb-card-desc' }, this.text(card.descKey));
      // tiers 值来自领域 payload（config 数值），UI 只做展示
      const tiers = el('span', { class: 'rb-card-tiers' }, card.tiers.map((v) => String(v)).join(' / '));
      btn.append(scope, name, desc, tiers);
      btn.addEventListener('click', () => {
        this.dispatch({ type: 'upgrade:select', cardId: card.id as UpgradeId });
        this.hide();
      });
      this.cardRow.appendChild(btn);
    }
    this.pendingFrames = 2;
    this.root.classList.remove('rb-hidden');
  }

  private hide(): void {
    this.pendingFrames = 0;
    this.root.classList.add('rb-hidden');
  }

  /** 每帧兜底：phase 离开 upgradePick 后隐藏（不依赖点击事件到达）。 */
  update(s: RunSnapshot): void {
    if (s.phase === 'upgradePick') {
      this.pendingFrames = 0;
    } else if (this.pendingFrames > 0) {
      this.pendingFrames -= 1;
    } else {
      this.hide();
    }
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    this.root.remove();
  }
}
