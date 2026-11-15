# TASK-04 交付报告 — Economy & Meta Agent（基于冻结契约重做版）

> ⚠ **上一轮 REBUILD 版全部作废**：按统一工作流，本次从 git 仓库 `main` 切分支重做。
> `src/domain/` 与 `src/config/` 为冻结契约，只读引用，`git diff --name-only -- src/domain src/config` 为空。
> 上一轮沙箱里凭记忆重建的契约与业务代码未纳入本仓库，不参与任何验收。

## 结论

| 门禁 | 结果 |
|---|---|
| `npx tsc --noEmit` | **EXIT 0**（strict + noUnusedLocals + verbatimModuleSyntax） |
| `npm run test` | **全绿**：domain 53/53 + input 18/18 + economy 29/29（现有 53+18 条零变红） |
| `git push origin feat/task-04-economy` | 见提交汇报（commit SHA） |

## 交付物（新增/修改文件）

**新增 `src/economy/` 10 文件**：

| 文件 | 职责 |
|---|---|
| `system.ts` | EconomySystem 聚合：boot（migrateSave/温和修复/validate 守门）· 掉落铺场 · 拾取 · 结算 · 永久消费 · 持久化（校验不过拒绝落盘并回滚） |
| `drops.ts` | `rollLoot` 读 `damageConfig.loot`（零数值字面量）· 地面注册表 |
| `ledger.ts` | 本局账本：dropId 唯一锚点防重入，累计为契约形状 `SaveRunLoot` |
| `growth.ts` | 金币三线成长（成本读 `metaGrowthCost` getter） |
| `weaponUpgrade.ts` | 森林材料强化 Lv1→5 |
| `crafting.ts` | 元素碎片制作（读 `gemConfig.craft`） |
| `saveBridge.ts` | `SavePort`（V2 抽象）→ V3 存档桥；**未决定任何存储后端**（D-207 OPEN） |
| `economyConfig.ts` | 仅补冻结 config 缺口的数据表（见下） |
| `types.ts` / `index.ts` | 类型契约与桶导出 |

**其他**：`tests/economy.test.mjs`（29 测试）、`package.json`（新增 `test:economy` 并串入 `test`）、`tsconfig.test.json`（include 加 `src/economy`）、`evidence/task-04-npm-test.txt`（完整测试输出原文）、本报告。

## 数值来源（全部以冻结 `src/config/` 为准）

| 数值 | 来源（只读） |
|---|---|
| 掉落表（normal/elemental/reinforced/elite/boss，金币/材料/碎片/宝石概率与区间） | `damageConfig.loot` |
| 成长成本 C(L)=base+step×(L−1)、maxLevel=10 | `metaGrowthCost`（getter 转发 `playerConfig.metaGrowth`） |
| Lv10 里程碑 +5%、熟练 25% / 生存 15% | `metaGrowthPctOfLevel` / `masteryPctOfLevel`（domain 桶转出） |
| 制作配方 8 碎片 + 5 材料、四种可制作元素 | `gemConfig.craft` |
| Boss 森林核心 1、稀有宝石下限品质 | `enemyConfig.bossReward` |
| 宝石品质轴 | `GEM_QUALITY_MULT_CONST`（经 `gemConfig` 使用） |
| **武器强化材料成本 10/20/35/55** | ❗ **冻结 config 无此键**：集中放在 `src/economy/economyConfig.ts`（来源 `docs/设计-设计总纲.md §4.3` + TASK-04 任务书，PROVISIONAL）。建议 TA 后续收编进 `src/config/playerConfig.ts`，业务侧无需改。 |

## 验收标准 9/9

| # | 项 | 结果 |
|---|---|---|
| 1 | 掉落表数据驱动，改 config 即生效 | ✅ AC-1a~d：逐规则区间/概率推导 + **运行时改 `damageConfig.loot` 即生效**（try/finally 还原零污染）+ 同 seed 复现 |
| 2 | 拾取一次只入账一次 | ✅ 同 dropId 二次拾取 `already-picked`，账本/流水/`resource.picked_up` 事件均只一次；宝石实例同样防重 |
| 3 | 死亡后已拾取资源正确保存 | ✅ `victory=false` 结算后逐货币 + 宝石库存核对存档增量 = 本局已拾取 |
| 4 | 地面未拾取物不结算 | ✅ credited 全 0、discarded = 地面汇总、存档资源零变化 |
| 5 | 本局经验不误存 | ✅ 结算前后 `metaProgress`/`weapons` 相等；SaveDataV3 无 xp/level 字段；`settleRun` 仅一个入参（结构性杜绝） |
| 6 | 成本公式/上限/里程碑 | ✅ C(1)=base、C(10)=base+9×step、单线 3250、三线 9750；熟练 Lv10=25%、**森林生存 Lv10=15% 而非 14%**（错误公式被 notClose 固化）、MaxHp 115；Lv10 封顶拒绝 |
| 7 | SaveDataV3 / schemaVersion=3 / socket=itemInstanceId | ✅ 落盘形状 + 实例 ID 唯一；socket 绑定实例通过 `validateSaveV3`，悬空 ID 被拦截 |
| 8 | v2→v3 gold 保留；畸形不抛错 | ✅ `profile.gold → currencies.gold`；10 种畸形输入 `migrateSave`/`boot` 均不抛错；温和修复保 gold、重度兜底默认档 |
| 9 | 新增测试覆盖 | ✅ 29 测试（含 Boss 规则、事件 payload、SavePort 桥、连续局重置、契约纪律回归） |

## 按冻结契约修正的两条规则（与上一轮 REBUILD 版不同）

1. **森林核心只由 Boss 胜利奖励**（`docs/设计-设计总纲.md §6.5 CONFIRMED`）：`victory && bossDefeated` 才 `currencies.forestCore += enemyConfig.bossReward.forestCore` 且 `stats.bossKills += 1`；失败结算两者都不给。`SaveRunLoot` 契约本身不含 core，地面不产出核心。
2. **Boss 击败进度 = `SaveStats.bossKills`**（冻结存档字段），不再另立字段；`bestTimeSec` 在胜利时按 `elapsedSec` 取最小值刷新。

## 持久化方案（不越权决定后端）

`SavePort` 当前只接受 `SaveDataV2`（D-207 OPEN）。`SavePortV3Bridge` 把 V3 存档原样装进 V2 的 `stash` 并加标记键 `__riftboundSaveV3`；`load` 优先解出 V3，纯 V2 则原样交给 `migrateSave` 迁移 `profile.gold`。**未修改 `src/save/SavePort.ts`，未引入 localStorage/IndexedDB**。

## 需主理人过目 / 未解决问题

1. **config 缺口**：武器强化材料成本不在冻结 config（见上表），当前在 economy 自有数据表；建议 TA 收编。
2. **碎片种类**：`enemyConfig` 敌人定义无元素字段，无法按 `defId` 推导；`rollLoot` 由调用方传 `element`，缺省 `rng.pick` 四元素。TASK-05 刷怪侧接线时需传元素维度。
3. **宝石掉落品质**：普通档默认 `common`、Boss 档取 `minGemQuality`（epic）；掉落概率来自 config，品质分布 PROVISIONAL 待平衡校准。
4. `package.json` / `tsconfig.test.json` 为接入 `test:economy` 的最小改动，合并时如与其他 Agent 冲突请以此处口径为准。
5. 未测试：与真实 Babylon 场景/UI 的运行时接线（本模块为纯领域逻辑，零 Babylon/DOM 依赖）；实际浏览器存档后端待 D-207 裁定。
