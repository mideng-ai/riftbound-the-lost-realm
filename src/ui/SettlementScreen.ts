/**
 * TASK-07 胜利/失败结算页（展示本局资源保留结果）。
 * 数据来源：EventBus 'run.settled'（victory + pickedResources: SaveRunLoot，唯一入口）。
 * 契约未提供「地面未拾取」字段，因此不编造 Lost 数值；只展示已保留资源。
 * Restart 只发 UiCommand，不直接重载场景或写存档。
 */
import type { EventBusApi, RunSnapshot } from '../domain/index.ts';
import type { UiCommandSink } from './commands.ts';
import { el, setIfChanged, shapeBadge, textCell, type TextCell } from './dom.ts';
import { CURRENCY_THEME, TAP_MIN_PX } from './theme.ts';
import { formatTime } from './format.ts';
import { UI_TEXT_KEYS, type TextResolver } from './uiText.ts';

export class SettlementScreen {
  readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly subCell: TextCell = textCell(el('span', { class: 'rb-st-sub' }));
  private readonly unsubs: (() => void)[] = [];

  constructor(
    parent: HTMLElement,
    bus: EventBusApi,
    private readonly snapshot: () => RunSnapshot,
    private readonly dispatch: UiCommandSink,
    private readonly text: TextResolver,
  ) {
    this.root = el('div', { class: 'rb-settlement rb-hidden', role: 'dialog', 'aria-label': text(UI_TEXT_KEYS.settleVictory) });
    this.body = el('div', { class: 'rb-settlement-card' });
    this.root.appendChild(this.body);
    parent.appendChild(this.root);
    this.unsubs.push(bus.subscribe('run.settled', (p) => this.show(p)));
  }

  private show(p: { readonly victory: boolean; readonly pickedResources: import('../domain/index.ts').SaveRunLoot }): void {
    const loot = p.pickedResources;
    const rows: readonly (readonly [string, number])[] = [
      [UI_TEXT_KEYS.currencyGold, loot.gold],
      [UI_TEXT_KEYS.currencyForestMaterial, loot.forestMaterial],
      [UI_TEXT_KEYS.currencyFireShard, loot.shards.fire],
      [UI_TEXT_KEYS.currencyIceShard, loot.shards.ice],
      [UI_TEXT_KEYS.currencyLightningShard, loot.shards.lightning],
      [UI_TEXT_KEYS.currencyShadowShard, loot.shards.shadow],
      [UI_TEXT_KEYS.gemInventory, loot.gems.length],
    ];
    const table = el('table', { class: 'rb-st-table' });
    const thead = el('thead');
    const hr = el('tr');
    hr.append(el('th', undefined, this.text(UI_TEXT_KEYS.pickedResources)), el('th', undefined, this.text(UI_TEXT_KEYS.settleKept)));
    thead.appendChild(hr);
    const tbody = el('tbody');
    let n = 0;
    for (const [key, value] of rows) {
      const tr = el('tr');
      const name = el('td');
      const shapes = ['circle', 'square', 'diamond', 'hexagon', 'triangle', 'crescent', 'star'];
      const colors = [
        CURRENCY_THEME.gold.color,
        CURRENCY_THEME.forestMaterial.color,
        CURRENCY_THEME.fireShard.color,
        CURRENCY_THEME.iceShard.color,
        CURRENCY_THEME.lightningShard.color,
        CURRENCY_THEME.shadowShard.color,
        CURRENCY_THEME.forestCore.color,
      ];
      name.appendChild(shapeBadge(shapes[n] ?? 'circle', colors[n] ?? '#C9C2B4', 12));
      name.appendChild(el('span', undefined, ' ' + this.text(key)));
      tr.append(name, el('td', undefined, String(value)));
      tbody.appendChild(tr);
      n += 1;
    }
    table.append(thead, tbody);

    const restart = el('button', { class: 'rb-st-restart', 'aria-label': this.text(UI_TEXT_KEYS.settleNewRun) }, this.text(UI_TEXT_KEYS.settleNewRun));
    restart.style.minWidth = `${TAP_MIN_PX + 80}px`;
    restart.style.minHeight = `${TAP_MIN_PX + 8}px`;
    restart.addEventListener('click', () => {
      this.dispatch({ type: 'run:restart' });
      this.hide();
    });

    this.body.replaceChildren(
      el('h2', { class: p.victory ? 'rb-st-win' : 'rb-st-lose' }, this.text(p.victory ? UI_TEXT_KEYS.settleVictory : UI_TEXT_KEYS.settleDefeat)),
      this.subCell.node,
      table,
      restart,
    );
    this.root.classList.remove('rb-hidden');
    // run.settled 从 run.phaseChanged 同步发出，早于 combat.step 末尾的 refreshSnapshot，
    // 事件当场读 snapshot 会拿到上一帧（快进试玩里就是 0:00）。显示后立刻补一次。
    this.refreshTime(this.snapshot().elapsedSec);
  }

  /** 每帧由 UiRoot.tick() 调用：修正结算事件早于快照刷新导致的 0:00。 */
  refreshTime(elapsedSec: number): void {
    if (this.root.classList.contains('rb-hidden')) return;
    setIfChanged(this.subCell, `${this.text(UI_TEXT_KEYS.settleSurvived)} ${formatTime(elapsedSec)}`);
  }

  hide(): void {
    this.root.classList.add('rb-hidden');
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    this.root.remove();
  }
}
