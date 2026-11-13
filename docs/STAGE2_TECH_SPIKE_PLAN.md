# STAGE2_TECH_SPIKE_PLAN — 阶段2技术验证计划

> **项目：** Riftbound: The Lost Realm  
> **版本：** v1.1  
> **日期：** 2026-11-12  
> **状态：** 阶段2已获负责人授权并启动；各 WorkBuddy 执行任务仍须按任务编号单独审批。  
> **依据：** DEVELOPMENT_ROADMAP.md 阶段2、DECISIONS_LOG.md D-007/D-207/D-210、GAME_SCOPE.md、DEVELOPMENT_ENVIRONMENT.md。

## 1. 阶段2目标与边界

阶段2要验证并建立可靠的技术基础，为阶段3 M1 可玩原型提供稳定工程骨架。阶段2不实现完整玩法，不提前制作首版内容。

已授权阶段2开始（负责人明确指令：2026-11-12「开始第二阶段吧」）。此授权允许开展阶段2规划、技术 Spike、工程骨架与必要依赖验证；WorkBuddy 仍须对照 `AGENT_COLLABORATION.md`，仅执行拥有精确任务编号及负责人 `APPROVED_TO_START` 记录的任务。

## 2. 必须遵守的已确定约束

- 技术方向 D-007：Babylon.js + TypeScript + Vite。可以验证具体版本与能力；不得擅自换成其他引擎或框架。若证据显示方向存在重大问题，先提交对比证据，由负责人决定是否变更。
- 平台：PC 浏览器与手机浏览器均为首发目标；手机核心体验优先，但不能取消 PC。
- 美术方向：精致、鲜艳、卡通化的 3D 魔法奇幻风格。
- 首版范围：15 Must-have、7 类 Nice-to-have、11 类 Out of scope 均保持冻结。
- 不做多人、PvP、账号/云存档/跨设备同步、原生 App 等首版排除项。
- D-207 必须解决首版本地持久化技术方案；候选 localStorage / IndexedDB 只是待评估方向，当前没有用户最终选型。
- D-210 性能预算必须由真实测量支撑；不能把候选帧率目标直接写成已确认指标。
- 不得虚报测试。清楚区分 Linux 沙箱、用户 Mac、桌面浏览器、手机真机和模拟环境结果。

## 3. 技术验证工作包

| 工作包 | 内容 | 预期产出 | 负责人决策点 |
|---|---|---|---|
| S2-A | Babylon.js 基础兼容性与渲染 Spike：版本、Vite/TS 集成、3D 场景、俯视相机、WebGL2 基线、WebGPU 可用性/降级 | 可重复运行的最小 Spike、版本锁定建议、测试记录 | 是否通过基础引擎门槛 |
| S2-B | 卡通渲染方向 Spike：光照、材质、描边/色阶方案、移动端成本 | 对比截图、性能观察、推荐方案 | 确认视觉实现方向 |
| S2-C | 法术特效 Spike：基础投射物、命中闪光/粒子或替代方案 | 最小特效样例、性能与实现成本 | 确认阶段3可用的技术路径 |
| S2-D | 输入抽象层 Spike：统一键鼠/触屏接口、移动输入采样、焦点/多点触控边界 | 接口草案、PC 测试、手机真机测试计划/记录 | 验证跨端输入架构 |
| S2-E | D-207 本地存档 Spike：localStorage 与 IndexedDB 比较、数据量/事务/版本迁移/损坏恢复/配额/隐私边界 | 决策比较表、最小读写/迁移/恢复测试 | 负责人确认 D-207 |
| S2-F | D-210 性能测量：场景负载、帧时间、内存、加载、设备矩阵与测试方法 | 实测报告、分设备预算建议、未测清单 | 负责人确认 D-210 |
| S2-G | 工程骨架与架构文档：目录、模块边界、场景/输入/实体基础结构、资源加载、代码规范 | 正式 Vite + TS + Babylon.js 工程、README、TECH_ARCHITECTURE.md | 负责人验收阶段2工程基线 |

## 4. 建议执行顺序与依赖

1. S2-A 基础引擎兼容性 Spike。
2. S2-B 与 S2-C 渲染/特效 Spike（可在 A 通过后并行）。
3. S2-D 输入抽象 Spike。
4. S2-E D-207 存档 Spike。
5. S2-F D-210 性能测量；尽量使用与 S2-A/B/C 相同的场景与构建配置。
6. 汇总证据，形成架构决策建议。
7. S2-G 正式工程骨架，按已经验证的选择落地。

以上顺序是 ChatGPT 的执行建议，不是用户新增的技术决策；执行中可根据依赖调整，但不得扩大产品范围。

## 5. 测试环境与证据要求

### 已知环境基线
- 项目负责人 Mac mini：Apple M1、8GB、macOS 15.0.1；Node.js v24.16.0、npm 11.13.0、Git 2.39.5（依据 DEVELOPMENT_ENVIRONMENT.md，来源为负责人此前提供的实际终端输出）。
- WorkBuddy Linux 沙箱：Ubuntu 24.04.3、Node.js v22.13.1、npm 11.9.0、Git 2.43.0（依据 WorkBuddy onboarding 反馈）。
- 手机真机型号/操作系统/浏览器尚未在当前项目文档中建立经负责人核验的矩阵；不得推测。

### 每项 Spike 必须记录
- 设备/OS/浏览器/运行模式（真机、桌面、模拟器、沙箱）。
- Babylon.js、Vite、TypeScript 与相关依赖的准确版本。
- 操作命令、配置、测试场景与负载。
- 实际结果、帧时间/FPS（若测量）、内存/加载数据（若可测）。
- 失败、兼容问题、已知限制和未测项目。
- 可复现步骤与原始日志/截图/代码提交。

Linux 沙箱或桌面模拟结果不能冒充手机真机结果；负责人 Mac mini 结果不能代表全部手机设备。

## 6. 阶段2验收门槛

阶段2完成前必须具备：
- PC 与手机浏览器均能加载空 3D 场景并响应输入；手机真机证据必须明确设备和浏览器。
- 键鼠与触屏使用平台无关的输入抽象接口。
- 俯视相机、卡通渲染方向、法术特效各有实测结论（成功或放弃及理由）。
- D-207 存档技术方案有对比、最小验证和负责人明确确认。
- D-210 性能预算有设备矩阵、测试方法、实测数据和负责人明确确认。
- 正式工程骨架可重复安装、启动和构建；README 与 TECH_ARCHITECTURE.md 完整。
- 所有未测事项、风险与限制如实列出。

阶段2验收通过仍须负责人明确确认后，方可进入阶段3。阶段2通过不代表 M1 已实现。

## 7. 当前第一个 WorkBuddy 任务（草案）

### ST2-001 — Babylon.js 基础渲染与构建兼容性 Spike

- **状态：** `OWNER_ACCEPTED`（负责人于 2026-11-13 在 ChatGPT 技术复审通过后正式验收；任务已关闭。历史开始授权日期为 2026-11-12，仅限本任务准确范围）
- **目标：** 在隔离的临时 Spike 目录中验证 Babylon.js 与 Vite + TypeScript 的最小集成，以及浏览器 WebGL2 基础 3D 场景可运行性。
- **范围：**
  1. 调研并记录当前稳定 Babylon.js 版本与官方支持/兼容信息。
  2. 在隔离目录建立最小 Vite + TypeScript + Babylon.js Spike，不改动正式游戏工程（正式工程尚未创建）。
  3. 创建一个简单 3D 场景和俯视相机；验证开发服务器与生产构建。
  4. 记录 WebGL2 运行结果；若当前环境支持，额外记录 WebGPU 探测结果，但不得让 WebGPU 成为运行前置条件。
  5. 提交精确依赖版本、运行命令、日志、截图或其他可核验结果。
- **不在范围内：** 卡通渲染定案、法术特效、正式输入系统、存档实现、性能预算定案、正式项目目录/架构搭建、玩法代码、任何超出本 Spike 的功能。
- **验收标准：** 干净安装成功；开发服务器可运行；3D 场景可渲染；生产构建成功；版本、浏览器/环境和未测事项完整记录。
- **停止条件：** Babylon.js 与既定技术方向存在阻断问题、依赖漏洞/许可异常、环境限制导致无法验证，或需要扩大任务范围时，停止并报告，不得自行换引擎。
- **负责人批准：** 已于 2026-11-12 明确授予；审批记录见 `docs/AGENT_COLLABORATION.md` Section 5。


## 9. ST2-002 — Cartoon rendering direction comparison Spike (task draft)

- **Status:** `DRAFT` — proposed by ChatGPT on 2026-11-13; not approved to start.
- **Prerequisite:** ST2-001 has been technically reviewed and owner-accepted. Its sandbox-only WebGL2 result does not establish real-GPU or mobile compatibility.
- **Objective:** Compare a minimum of two practical cartoon-rendering approaches in Babylon.js using a controlled scene, then provide reproducible evidence and a recommendation for the project owner. The recommendation is advisory; final selection remains with the owner.
- **Scope:**
  1. Build a new isolated, disposable Spike in `spikes/ST2-002/`.
  2. Use the existing Babylon.js + TypeScript + Vite direction; pin exact versions, commit a lockfile, and use HTTPS package registry URLs.
  3. Use identical camera, geometry, lighting, and scene conditions to compare at least two distinct approaches (for example, stepped/toon lighting and a NodeMaterial/custom-shader approach). Evaluate outline techniques separately where feasible.
  4. Capture screenshots and describe visual quality, implementation complexity, shader/material constraints, and observed runtime behavior.
  5. Run clean install, audit, production build, dev/preview and desktop-browser rendering checks; include full logs and exact environment.
  6. If mobile emulation is available, label it strictly as emulation. Physical mobile and owner Mac tests must be marked not run unless actually performed.
- **Out of scope:** final rendering decision; formal project architecture; production pipeline; gameplay; spell VFX (S2-C); input abstraction (S2-D); save system/D-207; performance budget/D-210; mobile hardware claims without real-device evidence; Stage 3/M1.
- **Acceptance criteria:** two or more approaches run in the same controlled scene; source and screenshots are committed; reproducible clean install/build and audit evidence are present; browser/environment limitations are explicit; report distinguishes visual feasibility from performance conclusions; no scope expansion.
- **Stop conditions:** no engine/framework substitution; stop and report if an approach requires changing D-007, a major unapproved dependency/architecture change, or work beyond the approved task.
- **Owner approval:** Not granted. WorkBuddy may not execute until an explicit `APPROVED_TO_START` record for ST2-002 is added to `AGENT_COLLABORATION.md` Section 5.

## 10. Change log

- 2026-11-13 v1.1 — ST2-001 owner acceptance recorded; ST2-002 cartoon-rendering comparison added as a draft only. No ST2-002 execution approval and no rendering decision made.

## 10. 变更记录

- 2026-11-12 v1.0：负责人授权开始阶段2；建立技术 Spike 工作包、证据规则与阶段验收门槛；ST2-001 建立为待单独批准的首个 WorkBuddy 执行任务。
- 2026-11-13 v1.1：ST2-001 经 ChatGPT 技术复审通过并由负责人正式验收；新增 ST2-002 卡通渲染方向比较 Spike 草案，尚未获准开始。
