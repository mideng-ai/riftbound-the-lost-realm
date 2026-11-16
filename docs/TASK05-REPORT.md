# TASK-05 交付报告（Spawn / Elite / Event Agent）

分支：`feat/task-05-spawn-elite-worldevents`（从 `main` @ `87cd1de` 切出）

## 工作流合规

| 项 | 结果 |
|---|---|
| 克隆真实仓库 + 从 main 切分支 | ✅ |
| `src/domain/` / `src/config/` 冻结契约只读引用 | ✅ `git diff -- src/domain src/config` 为空，零 untracked |
| 数值以 config 为准 | ✅ 时间轴/波次/名册/词缀/事件参数全部经 `domain` 组装函数读取 |
| 禁止凭记忆重建契约 | ✅ 本轮废弃上一轮 REBUILD 实现，全部在真实仓库内重写 |
| `npx tsc --noEmit` | ✅ 0 错误 |
| `npm run test` | ✅ 53 + 18 + 27 全绿 |
| `git push origin <branch>` | 见交付汇报 |

## 新增模块（全部在 `src/` 下，未触碰冻结层）

| 目录 | 内容 |
|---|---|
| `src/world/` | 失落森林固定场地（边界/障碍/合法生成点/12m 安全生成）+ `EnemyWorld` 顶层装配 |
| `src/enemy/` | Enemy 基类（受击全走 `resolveDamageHit`、状态槽按档位夹取、池友好）+ 4 类行为 + Manager（对象池/投射物/毒区/光环/死亡结算） |
| `src/elites/` | 六词缀精英 + 领主 + 禁止组合过滤（`isForbiddenAffixPair`）+ 工厂 |
| `src/spawn/` | 时间驱动 SpawnDirector：六阶段波次、精英窗口只调 `eliteAllowedAt`、满员 30s×3 重试、Boss 期硬规则 |
| `src/worldevents/` | 五种事件 + 调度器（首场 [120,210]、108s 间隔、单并发、同种不连续、510s 停刷） |
| `tests/task05.test.mjs` | 27 条验收断言 |

## 验收锚点（27 条断言）

- **精英窗口精确 [360,509]**：6 个 seed 实测首只 360.0 / 第二只 450.0；359.9s 前零精英；510/600 全禁。
- **同屏精英 ≤2、领主 ≤1**；满员时按 `deferRetrySec` 30s × `maxRetries` 3 次推迟后放弃。
- **四类怪行为可辨识**：猎犬包抄合围 / 投射者 8m 弹道 / 影跃者可闪避蓄力 + 4s CD / 滋养体 6m 光环 + 死亡分裂 2 幼体（HP5/伤4，数值来自名册）。
- **安全生成**：所有 director 波次与分裂/召唤子体生成瞬间距玩家 ≥12m；同屏数量有界（阶段上限 + 分裂保底 2）。
- **事件生命周期**：完成/超时双路径，巢穴与精英入侵超时清余怪，700s 容器有界；所有 `world_event.started` < 510s。
- **seed 可复现**：同 seed 两次 700s 逐字段一致；新增源码零 `Math.random`。

## 待裁定口径（PROVISIONAL，集中在 `behaviorParams.ts` / `eventConfig.ts` / `arenaConfig.ts` / `defaultDropTable.ts`）

契约未定义的**行为微参数**独立成模块数据，不写进冻结 config：包抄角、跃进修风窗口、投射弹速度、12m 安全距离、引导时长、守巢刷怪节奏、领主概率 0.4、分裂保底 +2、掉落基数。实机校准时只改这四处。

另外三处需联调确认：
1. 精英入侵在窗口外（t<360）降级为猎犬狼群，而非生成真精英——以此守住「360s 前零精英」防线。
2. 精英数值不叠加波次 `hpScale/damageScale`（契约中该缩放语义为普通怪），由 `eliteStats` 单独派生。
3. 阶段切换不清场（`clearOnSpawn=false`），存量可短时高于新阶段上限，但生成本身受当前阶段上限约束。

## 集成说明

场景层只需：

```ts
const world = new EnemyWorld({ seed });
world.tick(dt); // 每帧
```

所有对玩家/经济/UI 的副作用经 `EnemyWorldOptions` 端口注入（`damagePlayer` / `applyBuff` / `spendGold` / `bus` / `clock` / `player`），默认端口是无头测试夹具。Boss 本体与 `boss.spawned` 事件属 TASK-06 范围。
