/**
 * TASK-07 UI 只读数据源端口。
 *
 * 冻结契约 RunSnapshot 只含 11 个高频字段（domain/events.ts §轮询快照），
 * **不含**金币/资源、武器强化等级、冷却、宝石库存/槽位、局外成长进度。
 * 契约禁止修改，因此这些低频展示值一律通过注入的只读端口获取：
 *  - 端口由宿主在真实系统（TASK-02/03/04 等）接线时提供
 *  - 未提供 → UI 显示占位（'—'），绝不自行推算、绝不从 config 反推玩法数值
 *  - 高频数值永远只走 snapshot()，离散变化永远只走 EventBusApi.subscribe()
 *
 * UI 不持有权威状态；所有端口都是 getter（每次读取宿主最新值）。
 */
import type {
  CurrencyId,
  EventBusApi,
  GemInventoryItem,
  RunSnapshot,
  SaveMetaProgress,
  WeaponId,
  WeaponUpgradeLevel,
} from '../domain/index.ts';
import type { TextResolver } from './uiText.ts';

export interface UiDataSources {
  /** 每帧轮询的高频快照（唯一权威来源）。 */
  readonly snapshot: () => RunSnapshot;
  /** 离散事件总线（只读订阅）。 */
  readonly bus: EventBusApi;
  /** 文本解析器（正式上线必须注入；未注入用 keyLabel 调试显示）。 */
  readonly text?: TextResolver;
  /** 局内已拾取货币账本（Economy 系统提供；缺失 → 占位）。 */
  readonly currencies?: () => Readonly<Partial<Record<CurrencyId, number>>> | null;
  /** 双武器永久强化等级（武器/存档系统提供）。 */
  readonly weaponLevels?: () => Readonly<Record<WeaponId, WeaponUpgradeLevel>> | null;
  /** 双武器冷却就绪比例 0..1（战斗系统提供；UI 不自行按 intervalSec 推算）。 */
  readonly weaponCooldownPct?: () => Readonly<Record<WeaponId, number>> | null;
  /** 永久宝石库存（存档/宝石系统提供）。 */
  readonly gemInventory?: () => readonly GemInventoryItem[] | null;
  /** 双武器槽位内容（itemInstanceId，Q6 签收语义）。 */
  readonly gemSockets?: () => Readonly<Record<WeaponId, readonly (string | null)[]>> | null;
  /** 局外永久成长（Lv.0–10，用于里程碑进度展示）。 */
  readonly metaProgress?: () => SaveMetaProgress | null;
}
