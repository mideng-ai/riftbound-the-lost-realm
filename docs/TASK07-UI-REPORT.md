# TASK-07 交付报告 — UI / UX Agent（统一工作流版）

分支：`feat/task-07-ui-ux`（从 `main` 切出，禁止直接改 main）
基线：`main` @ `87cd1de`（Q-NEW-3 数值重标定 + 15 条 AC-Q 测试防线）

> **上一轮 REBUILD 交付全部作废**：本轮按所有者统一工作流，从真实仓库 clone、只读引用冻结契约 `src/domain/` + `src/config/`，所有游戏数值取自 config / domain 函数，UI 源码无数值字面量。

## 1. 严格对齐冻结契约（未修改一行 domain / config）

| 契约事实 | UI 用法 |
|---|---|
| `EventBusApi.subscribe / publish / listenerCount / clearAll` | 离散事件订阅；`UiRoot.dispose()` 逐层退订 + `clearAll()` 兜底 |
| `RunSnapshot` 11 字段 | 每帧 `tick()` 轮询，高频数值唯一来源 |
| `RunPhase` 含 `upgradePick` | 时间冻结徽标 + 升级弹窗每帧兜底隐藏 |
| `xpToNextLevel(level)`（domain，读 upgradePoolConfig） | 经验条进度注入 viewModel，UI 不写 XP 公式 |
| `RUN_TIMELINE_CONST.bossWarnCheckpointsSec = [510,540,570]` / `bossSpawnSec = 600` | 预警三点与倒计时，代码内无 510/540/570/600 字面量 |
| `playerConfig.metaGrowth.maxLevel = 10` | Lv10 里程碑进度显示 |
| `gemConfig.slotsPerWeapon = 3` / `merge.requiredCount = 3` / `merge.topQuality` / `qualityNameKey` / `gems[].nameKey` | 宝石界面槽位、合成规则、品质与宝石名 |
| `audioEventMapConfig.eventToSfx` | `ui:playSfx` 命令的 sfxId 由宿主从 config 取，UI 不硬编码音效名 |
| `UpgradeCardDef.nameKey / descKey / tiers` | 三选一卡面文本与数值（来自 `upgrade.offered` payload） |
| `SaveRunLoot`（gold / forestMaterial / shards / gems） | 结算页保留资源表 |

**文本铁律**（`docs/叙事-世界观与文案.md` §6）：代码内无自然语言字面量，所有玩家可见文本走 `nameKey`。UI 提供 `TextResolver` 注入端口；仓库尚无 locale 表实现，骨架验收用 `keyLabel()` 从 key 派生调试标签（如 `Upgrade Title`），**正式上线必须注入 resolver**。

**视觉**（`docs/美术-美术圣经V0.5.md`）：§1 色板、§4.1 六预警形状、§8.1 七宝石形状、§3.3 Boss 三阶段语义，全部落在 `src/ui/theme.ts`；三阶段 / 六预警 / 六词缀 / 七宝石形状均互异（有断言）。

## 2. 冻结契约缺口的处理（重要，需宿主接线）

`RunSnapshot` **不含**金币/资源、武器强化等级、冷却、宝石库存/槽位、局外成长进度。契约禁止修改，因此 UI 定义 `UiDataSources` 注入端口（`currencies / weaponLevels / weaponCooldownPct / gemInventory / gemSockets / metaProgress`），由宿主在真实系统接线时提供：

- 未提供 → UI 显示占位 `—`，**绝不自行推算、绝不从 config 反推玩法数值**
- 命令出口 `onCommand`：玩家点击只发 `UiCommand`，宿主未接线时只记录日志，不改领域状态
- `BootstrapScene.ts` 接线点：`deps.ui`（数据源）与 `deps.onUiCommand`（命令处理器）；未提供时用契约工厂 `createEventBus()` + `createRunSnapshot()` 建骨架数据源供界面验收
- `clearAllOnDispose`：真实共享总线传 `false`（只逐层退订，避免清掉其它系统监听器）；骨架独占总线默认 `true`

**结论**：界面外壳与全部交互链路已完成并可验收；真实玩法数值接入仍待 TASK-02/03/04/05/06 交付物在 main 上可用。

## 3. 交付物

**新增 `src/ui/`（16 文件）**：
`uiText.ts`（文本端口 + UI key 常量）· `format.ts` · `commands.ts`（UiCommand）· `dataSources.ts`（只读端口）· `viewModel.ts`（纯映射）· `dom.ts`（el/shapeBadge/TextCell）· `theme.ts`（美术 token + 形状 SVG）· `HudLayer.ts` · `BossHud.ts` · `ToastLayer.ts` · `UpgradeOverlay.ts` · `GemPanel.ts` · `SettlementScreen.ts` · `UiRoot.ts` · `ui.css` · `css.d.ts`

**接线（允许范围）**：`src/scenes/BootstrapScene.ts` 增加可选 `deps.ui` / `deps.onUiCommand`、每帧 `ui.tick()`、`dispose` 调 `ui.dispose()`；**未修改 `src/main.ts` / `index.html` / `package.json` / 任何测试脚本**。

**测试**：`tests/ui-contract.test.mjs`（12 断言，单独运行 `node --experimental-strip-types --test tests/ui-contract.test.mjs`）—— 含「改注入 config 值 → UI 跟随」「形状互异」「冻结契约无改动」「UI 源码无时间轴/XP/槽位字面量」「EventBus 退订与异常隔离」。

**证据**：`evidence/task07/`（8 张 Playwright 真实渲染截图 + `test-output.txt` + `ui-test-output.txt` + `tsc-output.txt`）。

## 4. 验收结果

| 门禁 | 结果 |
|---|---|
| `npx tsc --noEmit` | **0 错误**（`evidence/task07/tsc-output.txt` 空文件 = 无输出） |
| `npm run test` | **53/53 + 18/18 全绿，现有条数零变红**（原文见 `evidence/task07/test-output.txt`） |
| UI 契约测试 | **12/12 全绿**（原文见 `evidence/task07/ui-test-output.txt`） |
| 视觉验收 8 状态 | HUD / 8:45 预警 / Boss 三阶段 / 升级三选一 / 宝石面板 / 精英词缀+事件提示 / 结算 / 竖屏 720×1280 全部通过 |
| 监听器泄漏 | 8/8 状态 `dispose()` 后 `listenerCount` 归零 |
| 移动端 | 触控 ≥44px（TAP_MIN_PX 常量 + 断言）、竖屏 Boss 条避让计时器 |
| 色盲无障碍 | 形状 + 颜色双通道，三阶段/六预警/六词缀/七宝石形状互异（断言固化） |
| 冻结契约红线 | `git status --porcelain` 断言 `src/domain/`、`src/config/` 零改动 |

验收过程中修复的真实缺陷：① 冷却遮罩盖住武器卡文字（z-index 分层）② `keyLabel` 把 `ui.upgrade.title` 与 `ui.upgrade.frozen` 截成同一标签 ③ 品质名 key 截成笼统 "Quality"。

## 5. 未解决 / 风险

1. **低频端口未接线**：真实货币/武器/宝石/成长数据需宿主注入；当前为占位显示
2. **文本表未落码**：正式上线必须注入 `TextResolver`（叙事文案 §6 的 380 条），否则玩家看到 key 派生标签
3. **骨架 HUD 视觉重叠**：`index.html` 的 Stage-2 调试 `#hud`（z10）被 TASK-07 HUD（z50）覆盖；本分支未改 index.html/main.ts，正式接线时由宿主决定保留哪一个
4. `gem.merged` 事件只带 `gemId/fromQuality/toQuality`，合成产物由领域决定；UI 不计算产物品质
5. `clearAll()` 会清空整个总线：真实共享总线宿主必须传 `clearAllOnDispose: false`（已内置默认策略）
6. 真机触控、屏幕阅读器完整走查、P95 帧时间对比（QA 基线 D6）待 TASK-08
7. 本轮 UI 测试**未接入** `npm run test`，避免改动现有 53+18 门禁脚本；如需要纳入，请单独批准改 `package.json`
