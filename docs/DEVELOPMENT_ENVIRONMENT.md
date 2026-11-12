# DEVELOPMENT_ENVIRONMENT — 开发环境说明文档

> **项目：** Riftbound: The Lost Realm
> **版本：** v1.3
> **创建日期：** 2026-11-11
> **状态：** 阶段0（项目准备）
> **v1.1 修订（2026-11-12）：** ① Node.js 版本说明明确为「20.19+ 或 22.12+，符合当前 Vite 8 要求，优先使用受支持的 LTS 版本」；② 安全扫描表述修正为「npm audit 报告 0 个已知漏洞」；③ 补充验证日志留存说明（见第五节末）。
> **v1.2 修订（2026-11-12）：** 补充用户提供的本机设备信息（设备：Mac mini；芯片：Apple M1；内存：8GB），明确标注信息来自用户提供、尚未完成本机实际环境验证；macOS 具体版本与 Node.js / npm / Git 版本留待本机检查，不做猜测。原有 Linux 沙箱测试记录保持不变，沙箱测试结果不代表 Mac 本机测试结果。
> **v1.3 修订（2026-11-12）：** 第六节用户本机设备信息由「用户提供、未验证」更新为**已检查**（Mac mini / arm64 / Apple M1 / 8GB / macOS 15.0.1 Build 24A348 / Node.js v24.16.0 / npm 11.13.0 / Git 2.39.5，来自项目负责人提供的实际终端命令输出）；第七节未测试项改为「Mac 本机 Vite 空工程验证」，明确**版本检查已完成，但 Vite 创建、依赖安装、构建、浏览器运行结果尚未收到，未标记通过**；Linux 沙箱验证记录全部保留，与 Mac 本机结果分开记录、不混淆。
> **文档目的：** 记录开发环境要求、安装方法与实际验证结果，为阶段2（技术基础）的正式工程搭建做准备。本文档属于阶段0产出，**不构成阶段2的开始**：本任务未创建正式游戏工程、未安装 Babylon.js、未编写任何游戏代码。
> **配套文档：** [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)（技术方向）、[DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md)（阶段0验收标准含本验证）、[GAME_SCOPE.md](./GAME_SCOPE.md)、[AI_TEAM_ROLES.md](./AI_TEAM_ROLES.md)、[DECISIONS_LOG.md](./DECISIONS_LOG.md)

---

## 一、文档目的与适用阶段

- **适用阶段：** 阶段0（环境准备与验证）；阶段2 搭建正式工程时的环境参考。
- **内容边界：** 环境要求、安装说明、Vite **空工程**验证。Babylon.js + TypeScript + Vite 是项目当前选定的技术方向（待阶段2技术验证，见 PROJECT_OVERVIEW.md 第 6 节与 DECISIONS_LOG.md D-007）；本文档的 Vite 验证仅为环境可用性检查，**不代表技术验证，也不代表正式工程已搭建**。

## 二、推荐开发环境

| 项 | 要求 | 说明 |
|---|---|---|
| 操作系统 | Windows 10+ / macOS 12+ / Linux（Ubuntu 22.04+） | 任一主流桌面系统 |
| Node.js | Node.js 20.19+ 或 22.12+，符合当前 Vite 8 要求 | 优先使用受支持的 LTS 版本 |
| npm | 随 Node.js 附带（v10+） | 也可用 pnpm/yarn，团队统一即可 |
| Git | 2.30+ | 版本控制，配合 GitHub 仓库 |
| 浏览器 | Chrome / Edge / Firefox 最新稳定版 | 阶段2起的调试目标；手机浏览器真机调试列入后续验证 |
| 编辑器 | VS Code（推荐） | TypeScript 支持完善 |

> 手机浏览器是首发平台之一（PROJECT_OVERVIEW.md 第 1 节），但**手机端真机开发调试环境未在本次验证范围内**，须在阶段2另行建立验证方法。

## 三、软件及工具清单（Linux 沙箱本次验证所用）

| 软件 | 实测版本 | 来源 |
|---|---|---|
| 操作系统 | Ubuntu 24.04.3 LTS（Linux 容器环境） | 本次验证环境 |
| Node.js | v22.13.1 | nodejs.org（环境预装） |
| npm | 11.9.0 | 随 Node.js 附带（环境预装） |
| Git | 2.43.0 | git-scm.com（环境预装） |
| create-vite | v9.3.4（npx 临时拉取执行） | npm registry |
| Vite | v8.3.8（dev 实际运行版） | npm registry |
| TypeScript | ~7.0.2（vanilla-ts 模板自带） | npm registry |

## 四、安装步骤

### 1. Node.js

- 官方来源：https://nodejs.org/ → 下载 LTS 版本安装包（推荐 v22 LTS）。
- Linux（nvm 方式，便于多版本管理）：
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
  nvm install --lts
  ```
- 验证：`node --version`、`npm --version`。

### 2. npm 基本使用

- npm 随 Node.js 一起安装，无需单独安装。
- 常用命令：`npm install`（按 package.json 安装全部依赖）、`npm install <包>`（安装单个依赖并写入 package.json）、`npm run <脚本>`（执行 package.json scripts 中定义的命令）、`npm create vite@latest`（执行脚手架工具）。
- 换源（网络受限时）：`npm config set registry https://registry.npmmirror.com`（国内镜像，非官方源，自行斟酌）。

### 3. Git

- 官方来源：https://git-scm.com/downloads （Windows/macOS 安装包；Linux 用系统包管理器如 `apt install git`）。
- 首次配置：`git config --global user.name "<名字>"`、`git config --global user.email "<邮箱>"`。
- 项目仓库：https://github.com/mideng-ai/riftbound-the-lost-realm （HTTPS 方式 clone/push 需 GitHub 账号授权或 PAT）。

## 五、Vite 空工程验证步骤（本次在 Linux 沙箱实际执行）

以下命令在**临时目录**执行（验证用，不属于正式项目工程）：

```bash
# 1. 创建空工程（vanilla-ts 模板：空白 + TypeScript，贴近项目技术方向且无业务代码）
npm create vite@latest vite-empty-test -- --template vanilla-ts

# 2. 安装依赖
cd vite-empty-test
npm install        # 实际输出：added 17 packages，0 vulnerabilities

# 3. 启动开发服务器
npm run dev        # 实际输出：VITE v8.3.8 ready in 191 ms，Local: http://localhost:5173/

# 4. 验证页面响应（另开终端）
curl http://localhost:5173/    # 实际结果：HTTP 200

# 5. 验证 TypeScript 编译与生产构建
npm run build      # 实际输出：tsc 编译通过，✓ built in 60ms，产出 dist/
```

验证完成后删除临时目录（`rm -rf`），正式项目仓库不受影响。

> **验证日志留存说明（如实记录）：** 本次验证未将完整终端输出单独保存为日志文件；执行结果（关键命令与输出摘要）记录于本节与第七节的验证表中。后续如需完整日志，可在下次验证时执行 `npm run dev 2>&1 | tee dev-log.txt` 等方式留存原始输出，此为建议，本次未执行。

## 六、当前电脑实际环境检查结果

> 本节含两组独立记录：**① Linux 沙箱实测**（本次验证执行环境）；**② Mac 本机版本检查**（项目负责人实际开发机）。两组数据来源不同、不得混用。

### Linux 沙箱环境（本次验证执行环境）

本次验证在项目工作沙箱（Linux 容器）中执行，实测数据如下（全部来自实际命令输出，无推测值）：

| 检查项 | 实测结果 |
|---|---|
| 操作系统 | Ubuntu 24.04.3 LTS（内核 6.6.117，x86_64，容器环境） |
| Node.js | 已安装，v22.13.1 |
| npm | 已安装，11.9.0 |
| Git | 已安装，2.43.0 |
| 磁盘空间 | 充足（可用 254G） |
| npm registry 网络连通 | 正常（依赖安装成功） |
| 运行 Vite 创建命令的条件 | **具备**（Node ≥ 20.19 / 22.12 满足 Vite 8 要求） |

> **重要说明：** 以上是**本次执行验证的 Linux 沙箱环境**数据，**不代表用户 Mac 本机的测试结果**，两者不得混淆。项目负责人实际开发电脑为 macOS 设备（Mac mini），其**版本检查已完成**（见下表，来自项目负责人提供的实际终端命令输出），但**该机上的 Vite 空工程验证尚未执行/结果尚未收到**（见第七节）。

### 用户本机设备信息（已检查，来源：项目负责人提供的实际终端命令输出）

| 检查项 | 实际结果 | 状态 |
|---|---|---|
| 设备 | Mac mini | 已检查 |
| 芯片架构 | arm64 | 已检查 |
| 芯片 | Apple M1 | 已检查 |
| 内存 | 8GB | 已检查 |
| macOS | 15.0.1（Build 24A348） | 已检查 |
| Node.js | v24.16.0 | 已检查 |
| npm | 11.13.0 | 已检查 |
| Git | 2.39.5 | 已检查 |

**与第二节「推荐开发环境」要求比对（据上表数值判断）：**

- 操作系统：macOS 15.0.1 ≥ macOS 12 → 满足。
- Node.js：v24.16.0 ≥ 20.19 / 22.12 → 满足 Vite 8 的版本要求（高于第二节推荐版本，如需与团队统一可后续评估，不属本次任务）。
- npm：11.13.0 ≥ 10 → 满足。
- Git：2.39.5 ≥ 2.30 → 满足。

> **重要说明（验证边界）：** 上表**仅代表版本检查通过**——即该机的系统与工具链版本符合要求。**这不等于环境验证通过**：Mac 本机上的 `npm create vite` 创建、`npm install` 依赖安装、`npm run build` 构建、浏览器实际运行等结果**尚未收到，本文档不将其标记为通过**，也未写入任何未经确认的 Mac 本机测试结论。

## 七、验证结果（通过 / 未测试 / 失败，如实分类）

### 已通过（Linux 沙箱环境实际验证，仅限沙箱）

| 项目 | 结果 |
|---|---|
| Vite 空工程创建 | ✅ 通过（create-vite v9.3.4，vanilla-ts 模板，脚手架结构完整） |
| 依赖安装 | ✅ 通过（17 个包；npm audit 报告 0 个已知漏洞） |
| dev server 启动 | ✅ 通过（Vite v8.3.8，191ms 就绪，监听 5173 端口） |
| 页面 HTTP 响应 | ✅ 通过（GET / 返回 HTTP 200，返回正常 index.html） |
| TypeScript 编译 | ✅ 通过（npm run build：tsc 无报错，构建产出 dist/，60ms） |

> 上表五行结果**全部来自 Linux 沙箱**，与 Mac 本机无关，不得作为 Mac 本机验证结论引用。

### 已完成（Mac 本机，仅限版本检查）

| 项目 | 结果 |
|---|---|
| 系统与工具链版本检查 | ✅ 已完成（macOS 15.0.1 Build 24A348、arm64、Apple M1、8GB、Node.js v24.16.0、npm 11.13.0、Git 2.39.5，见第六节） |

> 该机**仅完成版本检查**；Vite 空工程相关验证（创建、安装、构建、浏览器运行）**尚未收到结果**，不在本表中，也不得记为通过。

### 未测试（本次环境无法覆盖，如实列出）

| 项目 | 原因 |
|---|---|
| **Mac 本机 Vite 空工程验证** | 版本检查已完成（见第六节），但 Mac 本机上的 `npm create vite` 创建、`npm install` 安装、`npm run build` 构建、浏览器实际运行**结果尚未收到**，不得标记为通过，待项目负责人在本机执行后补充 |
| Babylon.js 渲染能力与性能 | 属阶段2技术验证内容；本次按任务约束未安装 Babylon.js |
| 手机浏览器真机运行 | 沙箱无手机真机；须阶段2建立真机调试方法后验证 |
| pnpm / yarn 替代 npm | 本次仅用 npm 验证；不影响项目（团队统一用 npm 即可） |
| WebGPU / WebGL 兼容性细节 | 属阶段2技术验证（含 D-210 性能预算的制定） |

### 失败

无。本次执行范围内未出现失败项。遇到的问题见下节。

## 八、验证中遇到的问题及常见问题排查

### 本次实际遇到的情况

- **无阻断性问题。** 整个验证（创建→安装→启动→响应→构建）一次通过，无需回滚或修复。
- 非问题备注：create-vite 通过 `npx` 临时拉取执行，会显示在输出中带 `> npx` 前缀，属正常现象。

### 常见环境问题及基本排查方法

| 问题 | 排查方法 |
|---|---|
| `npm create vite` 报 Node 版本过低 | `node --version` 确认 ≥ 20.19（Vite 8 要求）；过低则升级 Node 或改用 Vite 5（需评估，涉及技术栈版本须报项目负责人） |
| 依赖安装超时/失败 | 检查网络与代理；确认 registry 可达（`npm config get registry`）；必要时临时切换镜像源 |
| dev server 启动但浏览器打不开 | 确认端口（默认 5173）未被占用：`lsof -i :5173`；被占用时 vite 会自动换端口，看启动日志 |
| `tsc` 报 TypeScript 配置错误 | 确认 tsconfig.json 未被手动改动；脚手架模板自带配置开箱即用 |
| Windows 下命令不可用 | 用 PowerShell 或 Git Bash；确认 Node 安装时勾选了 PATH 环境变量 |
| 手机真机访问 dev server | dev server 默认仅本地监听，需 `--host` 参数（`npm run dev -- --host`）后同网段访问；此为阶段2事项，本次未测试 |

## 九、阶段0与阶段2的工作边界

- **本任务（阶段0）完成的：** 环境检查、安装说明整理、Vite **空工程**可用性验证（Linux 沙箱临时目录，已清理）；Mac 本机的系统与工具链**版本检查**（见第六节）。
- **本任务明确未做、属于阶段2的：** 搭建正式游戏工程（含 Babylon.js 依赖引入）、渲染性能验证、性能预算（D-210 待确认）制定、双端兼容性测试、任何游戏代码。
- 依据：DEVELOPMENT_ROADMAP.md 阶段0验收标准「开发环境可在本机运行 npm create vite 空工程（仅验证环境，不算开始阶段2）」——沙箱侧已验证通过，**Mac 本机侧该条尚未验证**（版本检查已完成，但创建/安装/构建/浏览器运行结果未收到）；**阶段0未标记完成**，其余产出（开源资源调研清单）与用户验收仍在进行中。
- 阶段0→阶段2之间必须经过：阶段0用户验收 → 阶段1（游戏设计）完成并验收。任何提前搭建正式工程的行为须项目负责人明确批准。

## 十、文档版本与变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-11-11 | 初版创建：环境实测（Ubuntu 24.04.3 / Node 22.13.1 / npm 11.9.0 / Git 2.43.0）、安装说明、Vite 空工程五项验证全部通过（创建/安装/启动/HTTP 响应/TS 构建），验证用临时目录已清理 |
| v1.1 | 2026-11-12 | 复审修订：Node.js 版本说明明确为 20.19+ 或 22.12+（优先受支持 LTS）；安全扫描表述改为「npm audit 报告 0 个已知漏洞」；补充验证日志留存说明（未保存完整日志文件，如实说明） |
| v1.2 | 2026-11-12 | 补充用户提供的本机设备信息（Mac mini / Apple M1 / 8GB 内存，来源标注为用户提供、未验证）；macOS 与 Node.js / npm / Git 版本标记待检查、不做猜测；保留全部 Linux 沙箱测试记录，明确沙箱结果不代表 Mac 本机测试结果 |
| v1.3 | 2026-11-12 | Mac 本机版本检查结果落档并标记「已检查」：Mac mini / arm64 / Apple M1 / 8GB / macOS 15.0.1 Build 24A348 / Node.js v24.16.0 / npm 11.13.0 / Git 2.39.5，与第二节要求逐项比对均满足；第七节未测试项改为「Mac 本机 Vite 空工程验证」，明确仅版本检查完成、Vite 创建/安装/构建/浏览器运行结果未收到、未标记通过；Linux 沙箱记录全保留并加注「仅限沙箱」 |

> 本文档不改变任何游戏设计决策；D-201～D-210 待确认状态不变；未标记阶段0完成。
