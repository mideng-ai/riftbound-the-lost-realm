# DEVELOPMENT_ENVIRONMENT — 开发环境说明文档

> **项目：** Riftbound: The Lost Realm
> **版本：** v1.1
> **创建日期：** 2026-11-11
> **状态：** 阶段0（项目准备）
> **v1.1 修订（2026-11-12）：** ① Node.js 版本说明明确为「20.19+ 或 22.12+，符合当前 Vite 8 要求，优先使用受支持的 LTS 版本」；② 安全扫描表述修正为「npm audit 报告 0 个已知漏洞」；③ 补充验证日志留存说明（见第五节末）。
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

## 三、软件及工具清单（本次实际验证所用）

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

## 五、Vite 空工程验证步骤（本次实际执行）

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

> **重要说明：** 以上是**本次执行验证的沙箱环境**数据。项目负责人实际开发电脑（可能为 Windows/macOS 本地环境）**未在本次验证范围内**，其环境检查须在实际开发机上另行执行，结果以实际为准。路线图阶段0验收标准中的「开发环境可在本机运行 npm create vite 空工程」，在沙箱已验证通过；用户本机验证仍待执行（见第七节）。

## 七、验证结果（通过 / 未测试 / 失败，如实分类）

### 已通过（本次实际验证）

| 项目 | 结果 |
|---|---|
| Vite 空工程创建 | ✅ 通过（create-vite v9.3.4，vanilla-ts 模板，脚手架结构完整） |
| 依赖安装 | ✅ 通过（17 个包；npm audit 报告 0 个已知漏洞） |
| dev server 启动 | ✅ 通过（Vite v8.3.8，191ms 就绪，监听 5173 端口） |
| 页面 HTTP 响应 | ✅ 通过（GET / 返回 HTTP 200，返回正常 index.html） |
| TypeScript 编译 | ✅ 通过（npm run build：tsc 无报错，构建产出 dist/，60ms） |

### 未测试（本次环境无法覆盖，如实列出）

| 项目 | 原因 |
|---|---|
| Babylon.js 渲染能力与性能 | 属阶段2技术验证内容；本次按任务约束未安装 Babylon.js |
| 手机浏览器真机运行 | 沙箱无手机真机；须阶段2建立真机调试方法后验证 |
| 用户本地开发机（Windows/macOS）环境 | 本次仅在沙箱验证；须用户在实际开发机上执行第六节检查 |
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

- **本任务（阶段0）完成的：** 环境检查、安装说明整理、Vite **空工程**可用性验证（临时目录，已清理）。
- **本任务明确未做、属于阶段2的：** 搭建正式游戏工程（含 Babylon.js 依赖引入）、渲染性能验证、性能预算（D-210 待确认）制定、双端兼容性测试、任何游戏代码。
- 依据：DEVELOPMENT_ROADMAP.md 阶段0验收标准「开发环境可在本机运行 npm create vite 空工程（仅验证环境，不算开始阶段2）」——本验证即对应该条标准；**阶段0未标记完成**，其余产出（开源资源调研清单）与用户验收仍在进行中。
- 阶段0→阶段2之间必须经过：阶段0用户验收 → 阶段1（游戏设计）完成并验收。任何提前搭建正式工程的行为须项目负责人明确批准。

## 十、文档版本与变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-11-11 | 初版创建：环境实测（Ubuntu 24.04.3 / Node 22.13.1 / npm 11.9.0 / Git 2.43.0）、安装说明、Vite 空工程五项验证全部通过（创建/安装/启动/HTTP 响应/TS 构建），验证用临时目录已清理 |
| v1.1 | 2026-11-12 | 复审修订：Node.js 版本说明明确为 20.19+ 或 22.12+（优先受支持 LTS）；安全扫描表述改为「npm audit 报告 0 个已知漏洞」；补充验证日志留存说明（未保存完整日志文件，如实说明） |

> 本文档不改变任何游戏设计决策；D-201～D-210 待确认状态不变；未标记阶段0完成。
