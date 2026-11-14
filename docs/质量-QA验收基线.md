# QA 验收基线（质量门禁 V1.0）

> 来源：`总纲-项目规划书V1.md` §6 ｜ 状态：生效——TASK-01 起所有任务按此执行

## 1. Definition of Done（一个故事要标 QA_VERIFIED 必须 8 条全满足）

- **D1** 变更清单 + 未完成项明确列出
- **D2** typecheck / build / test 的**完整粘贴输出**，不接受"已通过"三个字
- **D3** 每条验收标准 ≥1 个断言级用例，带 ID（`AC-T05-03`），附"验收标准→用例"对照表
- **D4** Seed 复现：seed + 复现命令 + 期望末态 hash
- **D5** 任何玩家可观察项提交截图/录屏（标注 seed、局内时间、分辨率、设备）
- **D6** 性能对比：改动前后 P95 帧时间与 drawCall
- **D7** 已知缺陷披露，未修的 P1/P2 不得隐瞒
- **D8** 状态单一：`IMPLEMENTED` 或 `QA_VERIFIED` 二选一；**实现者不得自签 QA_VERIFIED**

## 2. 缺陷分级

| 级别 | 定义 | 发布判定 |
|---|---|---|
| P0 | 崩溃/白屏；存档损坏；无法结算；主循环卡死 | 禁止合并、禁止发布 |
| P1 | 核心玩法失效但可绕过；目标设备 <30fps | 禁止发布，本冲刺必修 |
| P2 | 有替代路径的体验受损 | 可发布，需制作人签字 + 已知问题清单 |
| P3 | 文案、视觉抖动、边缘情况 | 记录即可 |

硬规则：P0/P1 必须附 seed + 复现步骤；无法复现降级 P2 标 `unverified`。

## 3. 必补测试基础设施（5 项，按优先级）

1. **Vitest**（node 环境）+ 聚合 `npm test`——现有 18 个输入用例迁入
2. **Seeded PRNG + RunSeed 录制/回放**——`createRng(seed) → {next(), int(n), pick(arr)}`，算法定死（mulberry32），格式 `{seed, engineVersion, inputLog[]}`，回放末态 hash 必须一致；**必须先于 TASK-05/06 落地**
3. **Headless Run Harness**——不接渲染，注入时钟把 Spawn/Boss/Event 状态机直接跑到 t=10:30
4. **Playwright 冒烟 + 固定 seed 截图基线**——进局→攻击→切武器→Boss→结算 1 条关键路径
5. **性能基准脚本**——固定场景（150 敌人+60 弹道+10 特效）60s，输出 P50/P95/activeMeshes/drawCalls 对 `perf-baseline.json`

## 4. 自证式验收项的改写（替换原任务规格原文）

| 原文 | 改写为 |
|---|---|
| "攻击范围…可通过测试或调试可视化验证" | staff 射程=R、sword 扇形=angle/r、`cooldown(level)` 由配置表逐级比对；几何用纯函数 `getAttackShape()` 单测 |
| "不改变魔法剑攻击形状" | 对 `getAttackShape()` 做快照断言（120°/2.5m 基准已定） |
| "随机生成支持 seed" | PRNG 接口 + 黄金值用例（seed→前 10 输出） |
| "玩家近距离不无预警刷怪" | `minSpawnDistance=12`、`telegraph≥0.8s`，对每次 spawn 做几何断言 |
| "怪物数量不会无限增长" | `maxAlive=150`（可视 ≤80），断言 `alive≤cap` 且溢出走延迟队列 |
| "不产生无法躲避的攻击组合" | 500 seed 回放，断言任意时刻存在安全落点（≥战场 15%）且玩家可位移到达 |
| "长时间运行能正确清理" | 连续跑 25min，断言 t=25min 的 `activeMeshes/observableCount/activeTimers` ≤ t=5min ×1.2 |
| "状态变化能及时反映" | ≤100ms 或 ≤2 帧内更新，Playwright 断言 DOM |

## 5. 铁律

- 编译通过 ≠ 玩法通过
- 没有实际执行的测试必须标记"未执行"，不得声称已跑
- parse check 不算 run；玩家可见改动必须有截图/录屏证据
