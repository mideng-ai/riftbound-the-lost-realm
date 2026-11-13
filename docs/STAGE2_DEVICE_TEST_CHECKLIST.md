# STAGE2_DEVICE_TEST_CHECKLIST — 真实设备验证执行包（一页式）

> ST2-003 真实设备验证协作包｜2026-11-13｜执行人：项目负责人
> WorkBuddy 沙箱无 GPU 且无手机/Mac 真机；本文档所有项目标记 **OWNER_DEVICE_TEST_REQUIRED**。
> 负责人把回传结果发到协作流程后，WorkBuddy 整理证据，ChatGPT 独立复核。

## 通用准备（一次性）

```bash
# Mac mini 终端：核对环境（把输出全部回传）
node -v && npm -v && sw_vers && system_profiler SPDisplaysDataType | grep -E "Chipset|Metal"
```

各 Spike/基准已带完整工程（精确 pin + HTTPS lockfile + `.npmrc`）：

```bash
# 任选一个干净目录 clone 后：
cd spikes/ST2-003-F-PERF && npm ci && npm run build
# 其余同理：ST2-003-C-VFX / ST2-003-D-INPUT / ST2-003-E-SAVE / S2-G 正式工程
```

## A. Mac mini（Apple M1，8GB，macOS 15.0.1）— 真 GPU 验证

| # | 步骤 | 命令 / 操作 | 回传证据 |
|---|---|---|---|
| A1 | 环境核对 | 上方"通用准备"命令 | 终端输出全文 |
| A2 | 干净安装 | `cd spikes/ST2-003-F-PERF && npm ci` | npm ci 输出（应 0 vulnerabilities） |
| A3 | 生产构建 | `npm run build` | 构建输出末尾 |
| A4 | WebGL2 真机确认 | 打开 `http://localhost:4176/?run=fixed&n=50`，F12 控制台 | `Babylon.js v9.36.0 - WebGL2` 行 + 无 [pageerror] |
| A5 | 负载阶梯 | 访问 `http://localhost:4176/?run=ladder`，等待约 60s | 控制台全部 `[load]` `[level]` `[result]` 行 |
| A6 | 长稳观察 | `?run=fixed&n=200` 持续 ≥2 分钟，观察 FPS 是否随时间下降（热节流） | 开始/结束各一张 HUD 截图 |
| A7 | 渲染 Spike 复核 | `cd spikes/ST2-002 && npm ci && npm run preview`，四列对比页 + 4 个 `?focus=A|B|C|D` | 各一张截图 |
| A8 | VFX Spike 复核 | `cd spikes/ST2-003-C-VFX && npm run preview` | `?mode=both` 一张（含命中瞬间更佳） |
| A9 | 输入 Spike（键鼠） | `cd spikes/ST2-003-D-INPUT && npm run preview`，手测 WASD/左键/Q/E/Space + 失焦 | HUD 截图 + 手感备注 |
| A10 | 存档 Spike | `cd spikes/ST2-003-E-SAVE && npm run preview` | 结果表截图（应 8/8 PASS） |

> 注意：A4–A10 的启动命令统一为各目录 `npm run preview`（端口 4173–4176）。若端口冲突改用 `npx vite preview --port <p>`。

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
- 同 Wi-Fi：Mac mini 运行 `npm run preview`，手机访问 `http://<Mac局域网IP>:4176/`（vite preview 默认仅本机？若不可达：`npx vite preview --port 4176 --host 0.0.0.0`）。
- 或 HTTPS 隧道（cloudflared / ngrok 等）后访问公网 URL（部分手机浏览器要求 HTTPS 才能用部分 API）。

| # | 步骤 | 页面 | 回传证据 |
|---|---|---|---|
| B1 | 渲染与 WebGL2 | `ST2-003-F-PERF` `?run=fixed&n=50` | 页面是否渲染 + FPS 显示截图；控制台错误（iOS Safari 接 Mac 远程调试，Android Chrome 用 chrome://inspect） |
| B2 | 负载阶梯 | `?run=ladder`（约 60s） | 控制台 `[result]` 全部行（若无远程调试，截 HUD 表格） |
| B3 | 触屏输入 12 项 | `ST2-003-D-INPUT` 页面 | 按 Spike README §5 的 M1–M12 逐项填写 |
| B4 | 横屏体验 | 同上（横屏） | M11 结果 |
| B5 | 存档 | `ST2-003-E-SAVE` | 结果表截图（手机浏览器 8/8 是否通过） |
| B6 | 发热/节流 | B2 后立刻/2 分钟后各读一次 FPS | 两次 FPS 截图 |

## C. 结果回传格式（建议）

每项一行：`[编号] 通过/失败/异常 + 数据 + 备注`，配截图。例如：
`[A5] 通过 | n=0 fps=120 p50=8.3ms ... n=200 fps=118 p50=8.4ms | 全程无视觉掉帧`

## D. 边界声明

- 桌面模拟 / DevTools 触摸模拟 / SwiftShader / llvmpipe 结果一律不填入本文档表格。
- WorkBuddy 不代填任何结果；未测项目在 STAGE2_FINAL_REPORT.md 中如实标注。
- 真机结果回传后由 WorkBuddy 整理进 S2-F 分栏与阶段2总报告，ChatGPT 复核。
