# ST2-003-D — PC/手机统一输入抽象 Spike

> ST2-003 子工作包 S2-D｜2026-11-13｜状态：桌面证据完整；手机真机 **OWNER_DEVICE_TEST_REQUIRED**
> 游戏逻辑只消费统一接口，不直接读取 DOM 键盘/鼠标/触屏事件。

## 1. 架构（三层分离）

```
┌──────────────────────────────────────────────────────┐
│ 游戏逻辑（演示场景 main.ts）— 只调用 InputSystem      │
└──────────────▲───────────────────────────────────────┘
               │ InputSystemFacade（getMove / consumeIntent / isHeld / getSystemState）
┌──────────────┴───────────────────────────────────────┐
│ InputSystem — 合并适配器流、意图缓冲一次消费、暂停态   │
└──────▲───────────────────────────▲───────────────────┘
       │                           │
┌──────┴──────────────┐  ┌─────────┴──────────────────┐
│ KeyboardMouseAdapter│  │ TouchAdapter                │
│ 键盘 WASD/Q/E/Space │  │ 左半屏动态虚拟摇杆(单指)     │
│ 鼠标左键普攻(intent+ │  │ 右半屏 DOM 按钮（ATK/DASH/  │
│ held)、pointer 事件 │  │ Q/E)；分区一次性分配，跨区   │
│                     │  │ 不迁移；touchcancel 释放    │
└─────────────────────┘  └─────────────────────────────┘
```

文件：`src/input/types.ts`（契约）、`KeyboardMouseAdapter.ts`、`TouchAdapter.ts`、`InputSystem.ts`、`main.ts`（演示消费方）。

## 2. 输入契约（typed）

| 类别 | 定义 | PC 映射 | 手机映射 |
|---|---|---|---|
| 持续移动 | `MoveVector{x,y}`（-1..1） | WASD | 左半屏动态摇杆 |
| 瞬时意图 | `normalAttack / skill1 / skill2 / dash` | 左键 / Q / E / Space | 右半屏按钮 ATK/Q/E/DASH |
| 按住 | `normalAttack` held | 左键按住 | 按钮短暂按住（自动触发口径以 D-201 为准） |
| 系统态 | `suspended`（blur/hidden）、`pointerLockLost` | — | — |

- 瞬时意图在 `InputSystem` 缓冲，`consumeIntent()` 一次消费——避免帧间丢失或重复触发。
- 键盘 OS 自动重复（`e.repeat`）被过滤。
- 移动向量合并策略：触屏摇杆非零时优先（活动手指），否则键盘。

## 3. 边界事件处理矩阵

| 事件 | 处理 | 验证 |
|---|---|---|
| window blur | 清空按键/鼠标态、move 归零、`suspended=true` | 自动化 PASS |
| visibilitychange hidden | 同 blur；恢复时清除 suspended | 代码路径（桌面无法模拟 hidden，未自动化） |
| touchcancel | 摇杆释放、move 归零 | 模拟 PASS |
| 指针锁丢失 | `pointerLockLost=true` 供游戏暂停瞄准模式 | 代码路径（演示未启用指针锁，未自动化） |
| 手指跨区拖动 | 分区在 touchstart 一次性分配，不迁移 | 模拟 PASS（T5） |
| 第二根摇杆手指 | 忽略（保持单摇杆指） | 模拟 PASS（T4） |
| 右半屏非按钮触摸 | 忽略（不触发意图） | 模拟 PASS（T3） |

## 4. 已验证证据

### 4.1 桌面键鼠自动化（Playwright + Firefox 146，`evidence/e2e-results.txt`）

**11/11 PASS**：W/W+D/release 移动向量、左键普攻意图、Space/Q/E 意图、按住/释放 held、blur 挂起+卡键清零、DOM 按钮经触屏路径触发意图。

### 4.2 触摸路径桌面模拟（Chromium + SwiftShader 合成 TouchEvent，`evidence/e2e-touch-results.txt`）

**断言 5/5 PASS**（T3/T4/T5/T6/T7）。T1/T2 为状态快照。**明确声明：这是桌面模拟，不是真机证据。**（桌面 Firefox 不暴露 Touch API，改用 Chromium；SwiftShader 渲染 WebGL2 正常，fps≈37。）

### 4.3 实现过程中发现并修正的问题（记录价值）

- 最初 adapter 监听 `mousedown`，桌面自动化中鼠标意图从未触发。根因：**Babylon 的 canvas `pointerdown` 处理调用 `preventDefault()`，Firefox 因此不再派发合成 `mousedown`**。修正为监听 pointer 事件（`pointerdown/pointerup` + `pointerType==='mouse'` 判定），真实事件流可靠。该坑对阶段3集成有直接参考价值。

## 5. 手机真机测试包（OWNER_DEVICE_TEST_REQUIRED）

WorkBuddy 沙箱无手机设备。以下测试**必须由负责人在真机执行**，桌面模拟与 DevTools 触摸模拟一律不算通过。

### 访问步骤
1. Mac mini 上在本 Spike 目录执行 `npm ci && npm run build && npm run preview`（端口 4174）。
2. 手机与 Mac 连同一 Wi-Fi，访问 `http://<Mac局域网IP>:4174/`（或经 HTTPS 隧道）。
3. 打开页面后按下列表逐项测试并记录。

### 逐项记录表（请负责人填写）

| # | 测试项 | 预期 | 结果（通过/失败/备注） |
|---|---|---|---|
| M1 | 页面加载与渲染 | 无白屏、无控制台错误（需 vConsole 或远程调试） | ☐ |
| M2 | 左半屏按下出现虚拟摇杆 | 摇杆出现在触点处 | ☐ |
| M3 | 摇杆拖动方向/幅度 | 玩家方块按向量移动，力度随半径 | ☐ |
| M4 | 摇杆松开归零 | 方块停止 | ☐ |
| M5 | 右半屏非按钮触摸无反应 | 不触发技能 | ☐ |
| M6 | 右半屏按钮触发对应意图 | 日志面板出现对应 INTENT | ☐ |
| M7 | 摇杆手指拖过右半屏 | 摇杆不丢失、不触发按钮 | ☐ |
| M8 | 双指同时（摇杆+按钮） | 互不干扰 | ☐ |
| M9 | 来电/通知中断（touchcancel） | 摇杆归零、无卡死输入 | ☐ |
| M10 | 切后台再回前台 | 输入恢复、无卡键 | ☐ |
| M11 | 横屏/竖屏切换 | 布局与分区仍正确 | ☐ |
| M12 | 记录设备型号/系统/浏览器/分辨率 | — | ☐ |

## 6. 桌面手动测试清单（可选复核）

- [ ] WASD 八方向移动；按住左键普攻 held 持续 true
- [ ] Q/E/Space 各触发一次意图（OS 重复按键不重复触发）
- [ ] 点击页面外窗口（失焦）→ HUD 显示 suspended=true 且 move 归零
- [ ] 回到窗口 → 输入恢复

## 7. 限制与未测项

- 手机真机全部 12 项：**OWNER_DEVICE_TEST_REQUIRED**（见 §5 表格）。
- visibilitychange/pointerlockchange 代码路径已实现，桌面自动化无法模拟，未自动化验证。
- 本 Spike 的按钮布局/摇杆半径等参数为演示值，正式 HUD 由阶段3按设计实现。
- 不改变已确认的玩法输入规则（D-201 键位口径未动）。

## 8. 复现

```bash
npm ci && npm run build && npm run preview   # http://localhost:4174
node evidence/e2e-input.mjs                  # 桌面键鼠 11/11
node evidence/e2e-touch-sim.mjs              # 触摸桌面模拟（需 Chromium+SwiftShader）
```
