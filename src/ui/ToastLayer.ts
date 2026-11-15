/**
 * TASK-07 离散事件提示层：精英（含六词缀形状图标）、随机事件、Boss 换阶段/登场/击败、宝石合成。
 * 全部走 EventBus.subscribe；上限 4 条、屏幕上方 1/3，避免遮挡战斗区。
 */
import type { EventBusApi, WorldEventId } from '../domain/index.ts';
import { waveTimelineConfig } from '../config/waveTimelineConfig.ts';
import { el, shapeBadge } from './dom.ts';
import { AFFIX_SHAPE, BOSS_PHASE_THEME, WARNING_SHAPES } from './theme.ts';
import { UI_TEXT_KEYS, type TextResolver } from './uiText.ts';

const TOAST_MS = 4000;
const MAX_TOASTS = 4;

interface ToastItem {
  readonly node: HTMLElement;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class ToastLayer {
  readonly root: HTMLElement;
  private readonly toasts: ToastItem[] = [];
  private readonly unsubs: (() => void)[] = [];

  constructor(parent: HTMLElement, bus: EventBusApi, private readonly text: TextResolver) {
    this.root = el('div', { class: 'rb-toasts', role: 'log', 'aria-live': 'polite' });
    parent.appendChild(this.root);

    this.unsubs.push(
      bus.subscribe('elite.spawned', (p) => {
        const head = el('span', { class: 'rb-toast-head' }, this.text('enemy.' + p.defId + '.name'));
        const row = el('span', { class: 'rb-affix-row' });
        for (const affix of p.affixes) {
          const shapeId = AFFIX_SHAPE[affix];
          const cfg = WARNING_SHAPES[shapeId];
          const chip = el('span', { class: 'rb-affix-chip', 'data-shape': shapeId });
          chip.appendChild(shapeBadge(shapeId, cfg.color, 12));
          chip.appendChild(el('span', undefined, this.text('affix.' + affix + '.name')));
          row.appendChild(chip);
        }
        this.push([el('span', { class: 'rb-toast-kicker' }, this.text(UI_TEXT_KEYS.elite)), head, row], 'rb-toast-elite');
      }),
      bus.subscribe('world_event.started', (p) => {
        this.push([this.eventHead(p.id), el('span', { class: 'rb-toast-kicker' }, this.text(UI_TEXT_KEYS.eventStarted))], 'rb-toast-event');
      }),
      bus.subscribe('world_event.completed', (p) => {
        this.push([this.eventHead(p.id), el('span', { class: 'rb-toast-kicker' }, this.text(UI_TEXT_KEYS.eventCompleted))], 'rb-toast-event');
      }),
      bus.subscribe('world_event.expired', (p) => {
        this.push([this.eventHead(p.id), el('span', { class: 'rb-toast-kicker' }, this.text(UI_TEXT_KEYS.eventExpired))], 'rb-toast-event');
      }),
      bus.subscribe('boss.spawned', () => {
        this.push([el('span', { class: 'rb-toast-head' }, this.text(UI_TEXT_KEYS.bossSpawned))], 'rb-toast-boss');
      }),
      bus.subscribe('boss.defeated', () => {
        this.push([el('span', { class: 'rb-toast-head' }, this.text(UI_TEXT_KEYS.bossDefeated))], 'rb-toast-boss');
      }),
      bus.subscribe('boss.phase_changed', (p) => {
        const theme = BOSS_PHASE_THEME[p.phase];
        const icon = el('span', { class: 'rb-toast-icon' });
        icon.appendChild(shapeBadge(theme.shape, theme.color, 16));
        this.push([icon, el('span', { class: 'rb-toast-head' }, this.text(theme.labelKey))], 'rb-toast-boss-phase');
      }),
      bus.subscribe('gem.merged', (p) => {
        const icon = el('span', { class: 'rb-toast-icon' });
        icon.appendChild(shapeBadge('star', '#F2A93B', 14));
        this.push([icon, el('span', { class: 'rb-toast-head' }, `${p.gemId} · ${p.fromQuality} → ${p.toQuality}`)], 'rb-toast-gem');
      }),
      bus.subscribe('player.leveledUp', (p) => {
        this.push([el('span', { class: 'rb-toast-head' }, `${this.text(UI_TEXT_KEYS.level)} ${p.level}`)], 'rb-toast-level');
      }),
    );
  }

  private eventHead(id: WorldEventId): HTMLElement {
    const head = el('span', { class: 'rb-toast-head' });
    head.textContent = this.text(waveTimelineConfig.events[id].nameKey);
    return head;
  }

  private push(children: readonly HTMLElement[], cls: string): void {
    const node = el('div', { class: `rb-toast ${cls}` });
    node.append(...children);
    this.root.appendChild(node);
    const timer = setTimeout(() => {
      node.classList.add('rb-toast-out');
      setTimeout(() => node.remove(), 300);
      const idx = this.toasts.findIndex((t) => t.node === node);
      if (idx >= 0) this.toasts.splice(idx, 1);
    }, TOAST_MS);
    this.toasts.push({ node, timer });
    while (this.toasts.length > MAX_TOASTS) {
      const old = this.toasts.shift();
      if (old) {
        clearTimeout(old.timer);
        old.node.remove();
      }
    }
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    for (const t of this.toasts) clearTimeout(t.timer);
    this.toasts.length = 0;
    this.root.remove();
  }
}
