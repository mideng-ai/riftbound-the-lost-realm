/**
 * TASK-07 UI 命令协议。
 *
 * 红线（TASK-07 验收）：玩家点击只发出命令，UI 不直接改伤害、资源、存档，
 * 也不直接调用领域写接口。命令由宿主（BootstrapScene 接线处）转发给领域系统。
 */
import type { GemId, GemQuality, WeaponId } from '../domain/index.ts';

export type UiCommand =
  | { readonly type: 'upgrade:select'; readonly cardId: string }
  | { readonly type: 'weapon:switch'; readonly to: WeaponId }
  | { readonly type: 'gem:open' }
  | { readonly type: 'gem:close' }
  | { readonly type: 'gem:socket'; readonly weaponId: WeaponId; readonly slot: number; readonly itemInstanceId: string }
  | { readonly type: 'gem:unsocket'; readonly weaponId: WeaponId; readonly slot: number }
  | {
      readonly type: 'gem:merge';
      readonly gemId: GemId;
      readonly fromQuality: GemQuality;
      readonly itemInstanceIds: readonly string[];
    }
  | { readonly type: 'run:restart' }
  /** UI 交互音效：sfxId 必须取自 config/audioEventMapConfig，不得硬编码。 */
  | { readonly type: 'ui:playSfx'; readonly sfxId: string };

export type UiCommandSink = (cmd: UiCommand) => void;
