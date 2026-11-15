/**
 * TASK-07 Boss 阶段血条 + 预警横幅。
 * 血量/阶段来自每帧 RunSnapshot（bossHpPct / bossPhase 是领域权威，UI 不自行判阶段）；
 * 预警检查点与登场秒来自 config（RUN_TIMELINE_CONST），由 UiRoot 注入视图模型。
 * 三阶段与三点预警均带几何形状（色盲可区分，不只靠颜色）。
 */
import type { HudViewModel } from './viewModel.ts';
import type { TextResolver } from './uiText.ts';
import { el, shapeBadge, setIfChanged, textCell } from './dom.ts';
import { WARNING_SHAPES } from './theme.ts';
import { UI_TEXT_KEYS } from './uiText.ts';

export class BossHud {
  readonly root: HTMLElement;
  private readonly barWrap: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly phaseIcon: HTMLElement;
  private readonly phaseLabel = textCell(el('span', { class: 'rb-boss-phase-label' }));
  private readonly hpText = textCell(el('span', { class: 'rb-boss-hp-text' }));
  private readonly warnBanner: HTMLElement;
  private readonly warnIcon: HTMLElement;
  private readonly warnText = textCell(el('span', { class: 'rb-warn-text' }));
  private readonly warnCountdown = textCell(el('span', { class: 'rb-warn-countdown' }));
  private lastPhase = '';
  private lastWarn = -1;

  constructor(parent: HTMLElement, private readonly text: TextResolver) {
    this.root = el('div', { class: 'rb-boss-hud' });

    this.barWrap = el('div', { class: 'rb-boss-bar-wrap', role: 'progressbar', 'aria-label': text(UI_TEXT_KEYS.hp) });
    this.bar = el('div', { class: 'rb-boss-bar' });
    this.barWrap.appendChild(this.bar);
    const meta = el('div', { class: 'rb-boss-meta' });
    this.phaseIcon = el('span', { class: 'rb-boss-phase-icon' });
    meta.append(this.phaseIcon, this.phaseLabel.node, this.hpText.node);
    // meta 放在裁剪容器外（旧实现曾被 overflow:hidden 裁掉）

    this.warnBanner = el('div', { class: 'rb-warn-banner', role: 'alert', 'aria-live': 'assertive' });
    this.warnIcon = el('span', { class: 'rb-warn-icon' });
    this.warnBanner.append(this.warnIcon, this.warnText.node, this.warnCountdown.node);

    this.root.append(this.warnBanner, this.barWrap, meta);
    parent.appendChild(this.root);
  }

  update(vm: HudViewModel): void {
    const boss = vm.bossBar;
    this.barWrap.classList.toggle('rb-hidden', boss === null);
    if (boss) {
      this.bar.style.width = `${Math.round(boss.hpPct * 100)}%`;
      this.bar.style.background = boss.color;
      if (this.lastPhase !== boss.phase) {
        this.lastPhase = boss.phase;
        this.phaseIcon.replaceChildren(shapeBadge(boss.shape, boss.color, 16));
        setIfChanged(this.phaseLabel, this.text(boss.labelKey));
        this.phaseLabel.node.style.color = boss.color;
      }
      setIfChanged(this.hpText, boss.hpText);
    }

    const warn = vm.warning;
    this.warnBanner.classList.toggle('rb-on', warn !== null);
    if (warn) {
      if (this.lastWarn !== warn.index) {
        this.lastWarn = warn.index;
        const shapeCfg = WARNING_SHAPES[warn.shape as keyof typeof WARNING_SHAPES];
        this.warnIcon.replaceChildren(shapeBadge(warn.shape, shapeCfg?.color ?? '#E0453A', 18));
        setIfChanged(this.warnText, this.text(warn.labelKey));
      }
      setIfChanged(this.warnCountdown, warn.countdownText);
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
