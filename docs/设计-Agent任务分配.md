# Riftbound: The Lost Realm — Codex Multi-Agent Execution Spec V1.0

> 本文件与 docs/设计-设计总纲.md 配套使用（原 GAME_DESIGN_BIBLE_V1.md）。
> 游戏设计规则以设计总纲为准；本文件只定义如何分工、实现、集成和验收。
> 项目所有者已审核通过五项独有系统。系统结构视为 CONFIRMED；具体数值仍是 PROVISIONAL，必须可配置并经实测。
> **2026-11-14 修订**：新增 NEW-01~04 任务与 05/06/07/04 拆分（见 docs/总纲-项目规划书V1.md 第四部分）；验收项按 docs/质量-QA验收基线.md §4 改写。

## 1. 开工前的强制步骤

主控 Agent 在分配任何功能开发前必须：

1. 阅读根目录 README、总纲-游戏简报.md、本文件和 设计-设计总纲.md。
2. 检查 git status、当前分支、最近提交、实际目录结构和现有测试。
3. 运行项目现有的 typecheck、build、test 命令，记录真实输出。
4. 读取与本任务相关的实际实现和已有 Spike/evidence。
5. 标注哪些接口已存在、哪些缺失；不得假设设计目标目录已在仓库中存在。
6. 建立模块映射表后再创建新文件；禁止为了套用模板而重建项目或大规模重构。

当前工程基线：Babylon.js + TypeScript + Vite；README 明确说明 Stage 2 工程骨架不是可玩游戏。已有输入、相机、渲染、存档接口、资源加载、性能监控和弹道生命周期骨架。保留并扩展这些实现，不要另建不兼容的平行系统。

## 2. Agent 角色与责任边界

### A. Orchestrator / Producer — 总协调
负责路线图、依赖、唯一 Owner、集成窗口、风险和交付汇总。不包办业务实现，不代替 QA 批准自己写的功能。

### B. Technical Architect — 技术架构与接口
负责公共类型、领域事件、模块边界、配置格式、存档迁移接口和集成约束。先交接口提案，再允许各业务 Agent 并行开发。未经审核不得更换引擎、框架、渲染方案或存档后端。

### C. Weapon & Combat Agent — 武器与战斗
负责法杖、魔法剑、武器切换、武器强化属性应用和武器攻击事件接入。法杖保持远程魔法箭；魔法剑保持扇形挥砍、范围 B 方案、标准挥砍速度。不得修改宝石库存、金币结算或 Boss AI。

### D. Gem Systems Agent — 宝石
负责七种基础宝石、五种品质、三槽位、镶嵌/拆卸、三合一合成、宝石效果数据和效果解析。只向 Combat/Weapon 提供效果接口，不直接修改武器攻击内部算法，也不实现 UI 页面。

### E. Economy & Meta Progression Agent — 资源经济
负责金币、森林材料、元素碎片、森林核心、怪物掉落表、拾取入账、局外金币成长、材料强化成本、元素宝石制作配方和结算持久化接口。不得改变战斗伤害计算或敌人 AI。

### F. Spawn / Elite / World Event Agent — 怪物潮、精英与随机事件
负责时间驱动 Spawn Director、精英词缀、精英组合规则、精英生成节奏、五种世界事件的状态和奖励请求。普通怪物 AI 通过现有 Enemy 接口调用，不得重复实现整个 Enemy 系统。不得创建区域难度递进或地图轮换。

### G. Boss Agent — 腐化森林之主
负责 Boss 状态机、三阶段、六种攻击、预警、伤害判定、召唤物数量控制、阶段变化和 Boss 击败事件。通过统一战斗、生成、掉落接口接入，不直接操作 UI 或存档。

### H. UI / UX Agent — 界面
负责战斗 HUD、宝石准备界面、宝石合成、武器强化、金币成长、事件提示、Boss HUD 和结算显示。只读取领域状态并发送玩家意图，不成为游戏规则唯一数据源。

### I. QA / Performance Agent — 独立质量保障
负责测试计划、单元/集成/端到端验证、性能回归、随机 seed 复现和缺陷报告。实现 Owner 不可自我批准。编译通过不等于玩法通过。

## 3. 任务包

### TASK-00：Phase 0 工程基线审查
Owner：Orchestrator + Technical Architect；QA 独立复核。

交付：
- 实际目录和模块职责清单；
- 现有输入、Combat、Enemy、Spawn、Progression、Inventory、Save 能力盘点；
- 当前分支、工作区状态、现有测试命令和基线结果；
- 需要扩展的现有文件与新增文件建议；
- 风险、依赖和任务顺序。

验收：
- typecheck/build/test 的真实输出已记录；
- 没有把 README 声明的 Stage 2 骨架误报为可玩游戏；
- 提供基于真实代码的模块映射，未经验证的模块明确标为缺失。

### TASK-01：公共领域契约与配置
Owner：Technical Architect。

最低数据契约建议：
- WeaponId：staff | sword
- WeaponUpgradeLevel：1 | 2 | 3 | 4 | 5
- GemId：fire | ice | lightning | shadow | power | haste | vitality
- GemQuality：common | uncommon | rare | epic | legendary
- CurrencyId：gold | forestMaterial | fireShard | iceShard | lightningShard | shadowShard | forestCore
- EliteAffixId：berserk | split | vampiric | shielded | summoner | toxic
- WorldEventId：lostChest | elementalAltar | monsterNest | ancientAltar | eliteInvasion
- BossPhase：guardian | corruption | coreFrenzy

建议领域事件：
weapon.upgraded、weapon.switched、gem.socketed、gem.unsocketed、gem.merged、resource.dropped、resource.picked_up、run.settled、elite.spawned、world_event.started、world_event.completed、world_event.expired、boss.phase_changed、boss.defeated。

验收：
- 类型和配置能被各模块共同使用；
- 数值可配置；
- 数据契约没有把 UI 组件或 Babylon 场景对象暴露给领域逻辑；
- 随机生成支持 seed。

### TASK-02：双武器成长
Owner：Weapon & Combat Agent。
依赖：TASK-01；现有 Input/Projectile/Combat 代码审查。

范围：
- 法杖魔法箭基础攻击；
- 魔法剑扇形挥砍，范围 B 方案、标准挥砍速度；
- 快速切换，两把武器独立状态；
- 两把武器 Lv.1–Lv.5 永久强化效果；
- 森林材料强化成本配置；
- 与宝石效果解析接口衔接。

不包含：宝石合成、资源掉落、UI 布局、Boss AI。

验收：
- 法杖与剑都可攻击并能快速切换；
- 攻击范围、冷却、伤害可通过测试或调试可视化验证；
- 强化等级和属性变化符合配置；
- 两把武器强化状态互不覆盖；
- 不改变已确认的魔法剑攻击形状；
- 强化消费通过 Economy 接口完成，不在武器模块自行扣除资源。

### TASK-03：宝石系统
Owner：Gem Systems Agent。
依赖：TASK-01、TASK-02 的武器效果接口。

范围：
- 七种基础宝石、五种品质；
- 每把武器三个槽位；
- 镶嵌、拆卸、重复镶嵌；
- 三合一合成；
- 元素宝石对法杖与魔法剑的不同适配；
- 力量、迅捷、生命属性效果；
- 品质倍率、重复宝石倍率、控制与属性上限全部配置化。

验收：
- 合成只接受三颗同种同品质宝石；
- 传说品质不可继续合成；
- 镶嵌宝石在局内不被意外替换；
- 元素效果从正确武器命中事件触发；
- 相同宝石重复镶嵌不错误叠加触发概率；
- 重新加载后库存与槽位一致。

### TASK-04：资源经济与永久成长
Owner：Economy & Meta Progression Agent。
依赖：TASK-01；TASK-02/03 的成本与奖励接口定义。

范围：
- 四类资源账户；
- 普通怪、元素怪、强化怪、精英、Boss 掉落表；
- 地面拾取与本局资源统计；
- 胜利/失败结算和已拾取资源保留；
- 三种金币永久成长，最高 Lv.10；
- 森林材料武器强化成本；
- 元素碎片制作四种普通元素宝石；
- 森林核心持有记录和 Boss 胜利进度。

验收：
- 掉落表数据驱动；
- 拾取一次只入账一次；
- 玩家死亡后已拾取永久资源正确保存；
- 地面未拾取物不会被结算；
- 本局经验不误存为永久经验；
- 金币成本公式和成长上限正确；
- 存档接口使用现有 SavePort 抽象，不擅自决定 D-207 的真实存档后端。

### TASK-05：时间驱动怪物潮、精英与随机事件
Owner：Spawn / Elite / World Event Agent。
依赖：TASK-01；Enemy、Combat、Loot 的现有接口。

范围：
- 单张固定地图上的时间驱动 Spawn Director；
- 生成频率、每波数量、怪物等级和怪物池权重随时间提高；
- 同屏上限和玩家周边安全生成规则；
- 六种精英词缀、普通精英与精英领主；
- 禁止的词缀组合和同时精英数量上限；
- 遗落宝箱、元素祭坛、怪物巢穴、古老祭坛、精英入侵；
- 事件出现、完成、失败、超时和清理流程。

验收：
- 怪物在同一张地图中随时间变多、变强；
- 没有区域解锁难度或地图轮换；
- 玩家近距离不无预警刷怪；
- 怪物数量不会无限增长；
- 六种词缀各自效果正确；
- 禁止组合不能生成；
- 五类事件生命周期完整；
- Boss 预警后不产生新的主要事件；
- 固定 seed 可以复现问题。

### TASK-06：腐化森林之主 Boss
Owner：Boss Agent。
依赖：TASK-01、TASK-05 的生成状态接口、TASK-02 的 Combat 接口。

范围：
- 10:00（600s）登场，8:30（510s）开始三点递进预警（510/540/570s）；
- Boss 6000 生命测试配置；
- 三阶段、六种攻击；
- 地面预警和最终判定一致；
- 森林召唤物数量上限；
- 核心爆发后的输出窗口；
- Boss 击败与奖励事件。

验收：
- 三阶段阈值 65% / 30% 正确；
- 六种攻击可触发、可躲避、有对应反馈；
- Boss 不免疫任一武器；
- 不产生无法躲避的攻击组合；
- Boss 击败只触发一次胜利结算；
- Boss 奖励由 Economy/Reward 接口发放，不直接修改存档数据。

### TASK-07：UI 接入
Owner：UI / UX Agent。
依赖：TASK-01 至 TASK-06 提供的领域状态与命令接口。

范围：
- 战斗 HUD；
- 武器切换和强化显示；
- 宝石准备、镶嵌、拆卸与合成；
- 金币成长和资源展示；
- 精英与随机事件提示；
- Boss 阶段和生命条；
- 胜利/失败结算。

验收：
- UI 展示值来自领域系统；
- 玩家点击只发出命令，不直接改伤害、资源或存档；
- 状态变化能及时反映；
- 事件和 Boss 预警不遮挡关键战斗信息。

### TASK-08：独立 QA 与性能验收
Owner：QA / Performance Agent。
依赖：各任务有可运行构建和测试场景。

必须覆盖：
- 法杖、魔法剑、切换、攻击命中与冷却；
- 武器五级强化及材料成本；
- 七种宝石、五种品质、重复镶嵌、合成和效果叠加；
- 资源掉落、拾取、防重复入账、死亡结算和重新加载；
- 时间驱动刷怪、怪物上限、精英词缀与组合限制；
- 五种事件的开始/完成/超时/清理；
- Boss 三阶段、六种攻击、预警判定、奖励和胜利结算；
- 长时间运行的实体/特效/监听器/计时器清理；
- 多个敌人、弹道和事件同时存在时的性能。

交付：测试命令、真实输出、录屏/截图或日志证据、缺陷列表、回归结论。没有执行的测试必须标记未执行。

## 4. 开发依赖与建议并行顺序

1. TASK-00：先查仓库现状。
2. TASK-01：先统一数据契约和接口。
3. TASK-02、TASK-03、TASK-04 可在接口稳定后有限并行；所有跨模块改动先协调。
4. TASK-05 在 Enemy/Combat/Loot 接口明确后实现；Spawn Director 与精英/事件由同一 Owner 统一协调。
5. TASK-06 在基础 Combat 与 Spawn 接口稳定后实现。
6. TASK-07 在领域数据和命令接口可用后接入。
7. TASK-08 从每个任务的早期原型开始持续测试，最后做全量回归。

不得一次启动所有 Agent 同时改同一批文件。每个任务必须有唯一 Owner、文件修改范围和 reviewer。

## 5. 交付与合并质量门槛

每个 Agent 交付必须包含：
- 修改文件清单；
- 实现摘要与未完成项；
- 新增/变更的数据契约；
- 执行过的测试命令及真实结果；
- 已知缺陷、风险和性能影响；
- 下一 Agent 的交接说明。

合并前要求：
1. TypeScript 类型检查通过；
2. 生产构建通过；
3. 相关单元/集成测试通过，或明确列出测试缺口；
4. 手动验收步骤可复现；
5. 无未解释的 console/page error；
6. 对象、事件监听器、定时器和粒子/弹道生命周期能正确清理；
7. QA 独立审查后标记 QA_VERIFIED。

## 6. Agent 执行时绝对禁止

- 不得把游戏改回搜打撤，不得实现撤离点或撤离倒计时。
- 不得把地图改成轮换地图或区域难度解锁。
- 不得让怪物难度依赖固定区域深度；怪物潮主要按时间增长。
- 不得增添装备部位、随机装备词条、套装或第三把武器。
- 不得擅自增加职业、多 Boss、多人联机或新的核心系统。
- 不得擅自更换 Babylon.js、TypeScript、Vite 或最终渲染/存档决策。
- 不得覆盖现有 Stage 2 骨架或 Spike 证据目录。
- 不得把 PROVISIONAL 数值写死在业务逻辑中。
- 不得把 IMPLEMENTED 说成 QA_VERIFIED。
- 不得声称执行过未实际运行的测试。

## 7. Codex 每次会话启动模板

开始任何任务，先输出：
- 当前分支和 git status；
- 读取了哪些项目文档和代码；
- 任务 ID、唯一 Owner、依赖和修改范围；
- 当前可复用的接口；
- 预计修改/新增文件；
- 验收命令和可观察标准。

完成后输出：
- 实际修改文件；
- 实际实现内容；
- 实际测试及原始结果；
- 未完成事项；
- 风险与交接人；
- 当前状态（IMPLEMENTED 或 QA_VERIFIED，不得混用）。
