# STAGE2_DEVICE_TEST_CHECKLIST — 真实设备验证执行包（一页式）

> ST2-003 真实设备验证协作包｜2026-11-13｜执行人：**项目负责人**
> 本文档所有项目标记 **OWNER_DEVICE_TEST_REQUIRED**；负责人把回传结果发到协作流程后，WorkBuddy 整理证据，ChatGPT 独立复核。
> 代理侧的自动化运行**不能**替代本文档任何一项：此前 Linux 沙箱无 GPU；修正轮 R4/R5 的浏览器证据虽是 **Mac mini 主机（Macmini9,1 / Apple M1）上的 headless Chrome，并已确认走 ANGLE/Metal**，但那是无人值守的自动化会话，不含交互窗口、屏幕输出、输入延迟和手感判断，不属于真机验证。
>
> **修正轮 R1（2026-11-13）**：所有目录路径已对齐仓库实际结构（`st2003/*`，不是 `spikes/ST2-003-*`），
> 所有 preview 端口已写入各 `package.json`（`--strictPort`）并逐个启动实测 HTTP 200；
> 以下命令可直接复制执行。
>
> **修正轮 R5（2026-11-13）**：本文档 A 节的口径是「负责人在 Mac mini 上亲自执行」。代理侧的自动化 headless 运行即使跑在同一台机器上，也**不填写** A1–A10 的任何结果格。

## 通用准备（一次性）

```bash
# 1) 检出仓库（私有仓库，需已登录 gh 或有凭据）
git clone https://github.com/mideng-ai/riftbound-the-lost-realm.git
cd riftbound-the-lost-realm

# 2) 核对环境（把输出全部回传）
node -v && npm -v && sw_vers && system_profiler SPDisplaysDataType | grep -E "Chipset|Metal"
```

### 目录与端口对照（端口已固化，启动日志会打印实际端口）

| 用途 | 目录 | preview 端口 | 启动命令（在仓库根目录执行） |
|---|---|---|---|
| 性能阶梯 / D-210 | `st2003/f-perf/` | **4176** | `cd st2003/f-perf && npm ci && npm run build && npm run preview` |
| 法术 VFX / S2-C | `st2003/c-vfx/` | **4173** | `cd st2003/c-vfx && npm ci && npm run build && npm run preview` |
| 统一输入 / S2-D | `st2003/d-input/` | **4174** | `cd st2003/d-input && npm ci && npm run build && npm run preview` |
| 存档比较 / D-207 | `st2003/e-save/` | **4175** | `cd st2003/e-save && npm ci && npm run build && npm run preview` |
| 正式工程骨架 / S2-G | 仓库根目录 | **4170** | `npm ci && npm run build && npm run preview` |
| 渲染对比（已验收，勿改） | `spikes/ST2-002/` | 4173（默认） | `cd spikes/ST2-002 && npm ci && npm run build && npm run preview` |

> 每个 preview 都是 `vite preview --port <固定端口> --strictPort`：**端口被占用时会直接报错，不会静默换端口**。
> 换目录前先 `Ctrl+C` 停掉上一个服务，或另开终端。同一时刻不要开两个用 4173 的服务（`c-vfx` 与 `spikes/ST2-002`）。

## A. Mac mini（Apple M1，8GB，macOS 15.0.1）— 真 GPU 验证

| # | 步骤 | 命令 / 操作 | 回传证据 |
|---|---|---|---|
| A1 | 环境核对 | 「通用准备」第 2 步命令 | 终端输出全文 |
| A2 | 干净安装 | `cd st2003/f-perf && npm ci` | npm ci 输出（应 0 vulnerabilities） |
| A3 | 生产构建 | `npm run build`（同目录） | 构建输出末尾 |
| A4 | WebGL2 真机确认 | `npm run preview` 后打开 `http://localhost:4176/?run=fixed&n=50`，F12 控制台 | `Babylon.js v9.36.0 - WebGL2` 行 + 无 [pageerror] |
| A5 | 负载阶梯 | 访问 `http://localhost:4176/?run=ladder`，等待约 60s | 控制台全部 `[load]` `[level]` `[result]` 行 |
| A6 | 长稳观察 | `http://localhost:4176/?run=fixed&n=200` 持续 ≥2 分钟，观察 FPS 是否随时间下降（热节流） | 开始/结束各一张 HUD 截图 |
| A7 | 渲染 Spike 复核 | `cd spikes/ST2-002 && npm ci && npm run build && npm run preview`，打开 `http://localhost:4173/` 四列对比页 + 4 个 `?focus=A\|B\|C\|D` | 各一张截图 |
| A8 | VFX Spike 复核 | `cd st2003/c-vfx && npm ci && npm run build && npm run preview`，打开 `http://localhost:4173/?mode=both` | 一张（含命中瞬间更佳） |
| A9 | 输入 Spike（键鼠） | `cd st2003/d-input && npm ci && npm run build && npm run preview`，打开 `http://localhost:4174/`，手测 WASD/左键/Q/E/Space + 切窗失焦/回焦 | HUD 截图 + 手感备注 |
| A10 | 存档 Spike | `cd st2003/e-save && npm ci && npm run build && npm run preview`，打开 `http://localhost:4175/` | 结果表截图（预期 11/11 PASS；若某项显示 NOT VERIFIED，原样回传，不要补写成 PASS） |

> A10 说明：修正轮新增 L6（配额写失败后旧档完好）、L6b/L6c（中断写恢复协议）。
> L6 需要浏览器真实抛 `QuotaExceededError`；若你的浏览器环境触发不了，界面会明确显示 `NOT VERIFIED`。
> A7 若与 A8 冲突（都用 4173），先停 A8 再跑 A7。

## B. 真实手机 — 触屏与移动性能验证

**设备矩阵登记（请填写实际测试设备）：**

| 字段 | 值（负责人填写） |
|---|---|
| 型号 / 系统 | ☐ |
| 浏览器 + 版本 | ☐ |
| 分辨率 / DPR | ☐ |
| 电源状态（充电/电池、省电模式） | ☐ |
| 网络（同 Wi-Fi / HTTPS 隧道） | ☐ |

**访问方式（二选一）：**
- 同 Wi-Fi：Mac mini 在对应目录运行 `npm run preview -- --host 0.0.0.0`，手机访问 `http://<Mac局域网IP>:<端口>/`
  （端口见上表：f-perf 4176 / c-vfx 4173 / d-input 4174 / e-save 4175 / 骨架 4170）。
- 或 HTTPS 隧道（cloudflared / ngrok 等）后访问公网 URL（部分手机浏览器要求 HTTPS 才能用部分 API）。

| # | 步骤 | 页面 | 回传证据 |
|---|---|---|---|
| B1 | 渲染与 WebGL2 | `st2003/f-perf` → `http://<MacIP>:4176/?run=fixed&n=50` | 页面是否渲染 + FPS 显示截图；控制台错误（iOS Safari 接 Mac 远程调试，Android Chrome 用 chrome://inspect） |
| B2 | 负载阶梯 | `http://<MacIP>:4176/?run=ladder`（约 60s） | 控制台 `[result]` 全部行（若无远程调试，截 HUD 表格） |
| B3 | 触屏输入 12 项 | `st2003/d-input` → `http://<MacIP>:4174/` | 按 Spike README §5 的 M1–M12 逐项填写 |
| B4 | 横屏体验 | 同上（横屏） | M11 结果 |
| B5 | 存档 | `st2003/e-save` → `http://<MacIP>:4175/` | 结果表截图（手机浏览器各项是否通过；NOT VERIFIED 原样记录） |
| B6 | 发热/节流 | B2 后立刻/2 分钟后各读一次 FPS | 两次 FPS 截图 |

## C. 结果回传格式（建议）

每项一行：`[编号] 通过/失败/异常 + 数据 + 备注`，配截图。例如：
`[A5] 通过 | n=0 fps=120 p50=8.3ms ... n=200 fps=118 p50=8.4ms | 全程无视觉掉帧`

## D. 边界声明

- 桌面模拟 / DevTools 触摸模拟 / SwiftShader / llvmpipe 结果一律不填入本文档表格。
- WorkBuddy 不代填任何结果；未测项目在 STAGE2_FINAL_REPORT.md 中如实标注。
- 真机结果回传后由 WorkBuddy 整理进 S2-F 分栏与阶段2总报告，ChatGPT 复核。
