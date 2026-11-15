/**
 * TASK-07 UiRoot：UI 总装配（唯一入口）。
 *
 * 数据铁律：
 *  - 高频数值每帧读 RunSnapshot（tick）→ 纯函数 viewModel → 各层 update
 *  - 离散事件各层订阅 EventBusApi；dispose 时逐层退订 + clearAll() 兜底
 *  - 低频展示值（货币/武器等级/冷却/宝石/成长）走注入的只读端口，未接线显示占位
 *  - 所有游戏数值从 domain 函数 / config 常量注入 viewModel，UI 不写死
 *
 * 与本仓库冻结契约的对齐：
 *  - EventBusApi.subscribe/publish/listenerCount/clearAll（domain/events.ts）
 *  - RunSnapshot 11 字段（phase/elapsedSec/playerHp/...）
 *  - RunPhase 含 upgradePick
 *  - xpToNextLevel（domain/runState.ts，内部读 upgradePoolConfig）
 *  - RUN_TIMELINE_CONST / playerConfig.metaGrowth.maxLevel（config）
 */
import { xpToNextLevel } from '../domain/index.ts';
import { RUN_TIMELINE_CONST } from '../config/common.ts';
import { playerConfig } from '../config/playerConfig.ts';
import type { UiCommand } from './commands.ts';
import type { UiDataSources } from './dataSources.ts';
import { buildHudViewModel } from './viewModel.ts';
import { HudLayer } from './HudLayer.ts';
import { BossHud } from './BossHud.ts';
import { ToastLayer } from './ToastLayer.ts';
import { UpgradeOverlay } from './UpgradeOverlay.ts';
import { GemPanel } from './GemPanel.ts';
import { SettlementScreen } from './SettlementScreen.ts';
import { debugTextResolver, type TextResolver } from './uiText.ts';

export interface UiRootOptions extends UiDataSources {
  /** 宿主命令处理器（玩家输入的唯一出口）。 */
  readonly onCommand: (cmd: UiCommand) => void;
  /**
   * 销毁时是否调 bus.clearAll()（TASK-07 验收要求）。
   * 默认 true；若总线被跨场景/其它系统共享，宿主应传 false（各层仍会逐个退订）。
   */
  readonly clearAllOnDispose?: boolean;
}

export class UiRoot {
  readonly root: HTMLElement;
  private readonly opts: UiRootOptions;
  private readonly text: TextResolver;
  private readonly hud: HudLayer;
  private readonly bossHud: BossHud;
  private readonly toasts: ToastLayer;
  private readonly upgradeOverlay: UpgradeOverlay;
  private readonly gemPanel: GemPanel;
  private readonly settlement: SettlementScreen;
  private disposed = false;

  constructor(container: HTMLElement, opts: UiRootOptions) {
    this.opts = opts;
    this.text = opts.text ?? debugTextResolver;
    this.root = document.createElement('div');
    this.root.className = 'rb-ui-root';
    container.appendChild(this.root);

    // 命令分发：gem 面板开合在 UI 内路由，其余全部上抛宿主（UI 不改领域状态）
    const dispatch = (cmd: UiCommand): void => {
      if (this.disposed) return;
      if (cmd.type === 'gem:open') {
        this.gemPanel.setOpen(true);
        return;
      }
      if (cmd.type === 'gem:close') {
        this.gemPanel.setOpen(false);
        return;
      }
      opts.onCommand(cmd);
    };

    this.hud = new HudLayer(this.root, opts.bus, dispatch, this.text);
    this.bossHud = new BossHud(this.root, this.text);
    this.toasts = new ToastLayer(this.root, opts.bus, this.text);
    this.upgradeOverlay = new UpgradeOverlay(this.root, opts.bus, dispatch, this.text);
    this.gemPanel = new GemPanel(
      this.root,
      opts.bus,
      { gemInventory: opts.gemInventory, gemSockets: opts.gemSockets },
      dispatch,
      this.text,
    );
    this.settlement = new SettlementScreen(this.root, opts.bus, opts.snapshot, dispatch, this.text);
  }

  /** 每帧由宿主渲染循环调用（高频数值唯一更新通道）。 */
  tick(): void {
    if (this.disposed) return;
    const s = this.opts.snapshot();
    const vm = buildHudViewModel({
      snapshot: s,
      xpToNext: xpToNextLevel,
      warnCheckpointsSec: RUN_TIMELINE_CONST.bossWarnCheckpointsSec,
      bossSpawnSec: RUN_TIMELINE_CONST.bossSpawnSec,
      maxMetaLevel: playerConfig.metaGrowth.maxLevel,
      currencies: this.opts.currencies?.() ?? null,
      weaponLevels: this.opts.weaponLevels?.() ?? null,
      weaponCooldownPct: this.opts.weaponCooldownPct?.() ?? null,
      metaProgress: this.opts.metaProgress?.() ?? null,
    });
    this.hud.update(vm);
    this.bossHud.update(vm);
    this.upgradeOverlay.update(s);
    this.gemPanel.update();
  }

  /** 验收用：直接打开宝石面板（等效 gem:open 命令）。 */
  debugOpenGemPanel(): void {
    this.gemPanel.setOpen(true);
  }

  /** 场景销毁：逐层退订 + clearAll 兜底，防监听器泄漏。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hud.dispose();
    this.bossHud.dispose();
    this.toasts.dispose();
    this.upgradeOverlay.dispose();
    this.gemPanel.dispose();
    this.settlement.dispose();
    if (this.opts.clearAllOnDispose !== false) this.opts.bus.clearAll();
    this.root.remove();
  }
}
