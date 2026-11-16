/**
 * TASK-07 宝石管理界面：准备 / 镶嵌 / 拆卸 / 合成（每武器 3 槽，数值取 gemConfig）。
 *
 * 数据来源：
 *  - 库存 / 槽位 → 注入的只读端口（存档/宝石系统），UI 不持有权威状态
 *  - 操作结果刷新 → EventBus gem.socketed / gem.unsocketed / gem.merged
 *  - 槽位数 / 合成所需数量 / 封顶品质 / 品质与宝石名 key → gemConfig（冻结契约只读）
 * 所有操作只发 UiCommand；UI 不判断合成产物品质（由领域系统决定）。
 */
import type { EventBusApi, GemInventoryItem, WeaponId } from '../domain/index.ts';
import { gemConfig } from '../config/gemConfig.ts';
import type { UiCommandSink } from './commands.ts';
import { el, shapeBadge } from './dom.ts';
import { GEM_KIND_SHAPE, GEM_QUALITY_THEME, TAP_MIN_PX } from './theme.ts';
import { UI_TEXT_KEYS, type TextResolver } from './uiText.ts';

export interface GemPanelPorts {
  readonly gemInventory?: () => readonly GemInventoryItem[] | null;
  readonly gemSockets?: () => Readonly<Record<WeaponId, readonly (string | null)[]>> | null;
}

export class GemPanel {
  readonly root: HTMLElement;
  private readonly socketsRow: HTMLElement;
  private readonly invList: HTMLElement;
  private readonly combineHint: HTMLElement;
  private readonly combineBtn: HTMLButtonElement;
  private readonly unsubs: (() => void)[] = [];
  private open = false;
  private selected: string[] = [];
  private socketSig = '';
  private invSig = '';

  constructor(
    parent: HTMLElement,
    bus: EventBusApi,
    private readonly ports: GemPanelPorts,
    private readonly dispatch: UiCommandSink,
    private readonly text: TextResolver,
  ) {
    this.root = el('div', { class: 'rb-gem-panel rb-hidden', role: 'dialog', 'aria-label': this.text(UI_TEXT_KEYS.gemTitle) });
    const head = el('div', { class: 'rb-gem-head' });
    const close = el('button', { class: 'rb-gem-close', 'aria-label': this.text(UI_TEXT_KEYS.gemClose) }, '×');
    close.style.minWidth = `${TAP_MIN_PX}px`;
    close.style.minHeight = `${TAP_MIN_PX}px`;
    close.addEventListener('click', () => this.dispatch({ type: 'gem:close' }));
    head.append(el('h2', undefined, this.text(UI_TEXT_KEYS.gemTitle)), close);
    this.root.appendChild(head);

    const socketBox = el('div', { class: 'rb-gem-section' });
    socketBox.appendChild(el('h3', undefined, this.text(UI_TEXT_KEYS.gemSockets)));
    this.socketsRow = el('div', { class: 'rb-sockets' });
    socketBox.appendChild(this.socketsRow);

    const invBox = el('div', { class: 'rb-gem-section' });
    invBox.appendChild(el('h3', undefined, this.text(UI_TEXT_KEYS.gemInventory)));
    this.invList = el('div', { class: 'rb-inventory' });
    invBox.appendChild(this.invList);

    const combineBar = el('div', { class: 'rb-gem-combine' });
    this.combineHint = el('span', { class: 'rb-combine-hint' }, this.text(UI_TEXT_KEYS.gemMergeRule));
    this.combineBtn = el('button', { class: 'rb-combine-btn' }, this.text(UI_TEXT_KEYS.gemCombine));
    this.combineBtn.style.minHeight = `${TAP_MIN_PX}px`;
    this.combineBtn.disabled = true;
    this.combineBtn.addEventListener('click', () => {
      const picked = this.currentSelection();
      const first = picked[0];
      if (!first || picked.length !== gemConfig.merge.requiredCount) return;
      this.dispatch({
        type: 'gem:merge',
        gemId: first.gemId,
        fromQuality: first.quality,
        itemInstanceIds: picked.map((g) => g.itemInstanceId),
      });
      this.selected = [];
      this.refresh();
    });
    combineBar.append(this.combineHint, this.combineBtn);

    this.root.append(socketBox, invBox, combineBar);
    parent.appendChild(this.root);

    const onGemChange = (): void => {
      if (this.open) this.refresh();
    };
    this.unsubs.push(
      bus.subscribe('gem.socketed', onGemChange),
      bus.subscribe('gem.unsocketed', onGemChange),
      bus.subscribe('gem.merged', onGemChange),
    );
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.root.classList.toggle('rb-hidden', !open);
    if (open) this.refresh();
  }

  isOpen(): boolean {
    return this.open;
  }

  /** 每帧：数据签名变化才重绘（避免每帧 DOM 重建）。 */
  update(): void {
    if (this.open) this.refresh();
  }

  private currentSelection(): readonly GemInventoryItem[] {
    const inv = this.ports.gemInventory?.() ?? [];
    return this.selected.map((id) => inv.find((g) => g.itemInstanceId === id)).filter((g): g is GemInventoryItem => !!g);
  }

  private refresh(): void {
    const inv = this.ports.gemInventory?.() ?? [];
    const sockets = this.ports.gemSockets?.();
    const invSig = JSON.stringify(inv);
    const socketSig = JSON.stringify(sockets ?? null);
    if (invSig !== this.invSig) {
      this.invSig = invSig;
      this.renderInventory(inv);
    }
    if (socketSig !== this.socketSig) {
      this.socketSig = socketSig;
      this.renderSockets(inv, sockets ?? null);
    }
    this.updateCombineState();
  }

  private renderInventory(inv: readonly GemInventoryItem[]): void {
    this.invList.replaceChildren();
    if (inv.length === 0) {
      this.invList.appendChild(el('span', { class: 'rb-empty' }, '—'));
      return;
    }
    for (const gem of inv) {
      const q = GEM_QUALITY_THEME[gem.quality];
      const chip = el('button', {
        class: 'rb-inv-chip',
        'aria-label': `${this.text(gemConfig.qualityNameKey[gem.quality])} ${this.text(gemConfig.gems[gem.gemId].nameKey)}`,
        'data-shape': GEM_KIND_SHAPE[gem.gemId],
      });
      chip.style.minWidth = `${TAP_MIN_PX}px`;
      chip.style.minHeight = `${TAP_MIN_PX}px`;
      chip.style.borderColor = q.border;
      chip.style.background = q.fill;
      if (q.glow) chip.classList.add('rb-legendary');
      chip.appendChild(shapeBadge(GEM_KIND_SHAPE[gem.gemId], q.border, 16));
      chip.appendChild(el('span', { class: 'rb-inv-kind' }, this.text(gemConfig.gems[gem.gemId].nameKey)));
      chip.dataset.instanceId = gem.itemInstanceId;
      chip.addEventListener('click', () => {
        const idx = this.selected.indexOf(gem.itemInstanceId);
        if (idx >= 0) this.selected.splice(idx, 1);
        else if (this.selected.length < gemConfig.merge.requiredCount) this.selected.push(gem.itemInstanceId);
        this.markSelection();
        this.updateCombineState();
      });
      this.invList.appendChild(chip);
    }
    this.markSelection();
  }

  private markSelection(): void {
    for (const node of Array.from(this.invList.querySelectorAll<HTMLElement>('.rb-inv-chip'))) {
      node.classList.toggle('rb-selected', this.selected.includes(node.dataset.instanceId ?? ''));
    }
  }

  private renderSockets(inv: readonly GemInventoryItem[], sockets: Readonly<Record<WeaponId, readonly (string | null)[]>> | null): void {
    this.socketsRow.replaceChildren();
    for (const wid of ['staff', 'sword'] as const) {
      const col = el('div', { class: 'rb-socket-col' });
      col.appendChild(el('span', { class: 'rb-socket-weapon' }, this.text(wid === 'staff' ? UI_TEXT_KEYS.weaponStaff : UI_TEXT_KEYS.weaponSword)));
      for (let slot = 0; slot < gemConfig.slotsPerWeapon; slot++) {
        const instanceId = sockets?.[wid]?.[slot] ?? null;
        const gem = instanceId ? inv.find((g) => g.itemInstanceId === instanceId) : undefined;
        const cell = el('div', { class: 'rb-socket ' + (gem ? 'rb-filled' : 'rb-empty') });
        if (gem) {
          const q = GEM_QUALITY_THEME[gem.quality];
          cell.appendChild(shapeBadge(GEM_KIND_SHAPE[gem.gemId], q.border, 18));
          cell.appendChild(el('span', { class: 'rb-socket-kind' }, this.text(gemConfig.gems[gem.gemId].nameKey)));
          cell.appendChild(el('span', { class: 'rb-socket-q' }, this.text(gemConfig.qualityNameKey[gem.quality])));
          const un = el('button', { class: 'rb-unsocket', 'aria-label': this.text(UI_TEXT_KEYS.gemClose) }, '×');
          un.style.minWidth = `${TAP_MIN_PX}px`;
          un.style.minHeight = `${TAP_MIN_PX}px`;
          un.addEventListener('click', () => this.dispatch({ type: 'gem:unsocket', weaponId: wid, slot }));
          cell.appendChild(un);
        } else {
          cell.appendChild(el('span', { class: 'rb-socket-empty-mark' }, '+'));
          cell.addEventListener('click', () => {
            if (this.selected.length === 1) {
              this.dispatch({ type: 'gem:socket', weaponId: wid, slot, itemInstanceId: this.selected[0] });
              this.selected = [];
              this.refresh();
            }
          });
        }
        col.appendChild(cell);
      }
      this.socketsRow.appendChild(col);
    }
  }

  private updateCombineState(): void {
    const picked = this.currentSelection();
    const ready =
      picked.length === gemConfig.merge.requiredCount &&
      picked.every((g) => g.gemId === picked[0].gemId && g.quality === picked[0].quality) &&
      picked[0].quality !== gemConfig.merge.topQuality;
    this.combineBtn.disabled = !ready;
    this.combineHint.textContent = ready
      ? `${picked.length} × ${this.text(gemConfig.qualityNameKey[picked[0].quality])} ${this.text(gemConfig.gems[picked[0].gemId].nameKey)}`
      : picked[0]?.quality === gemConfig.merge.topQuality
        ? this.text('ui.gem.topQuality')
        : this.text(UI_TEXT_KEYS.gemMergeRule);
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    this.selected = [];
    this.root.remove();
  }
}
