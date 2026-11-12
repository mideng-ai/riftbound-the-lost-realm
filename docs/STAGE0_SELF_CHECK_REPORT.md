# 阶段 0 最终交付前自检报告

> **审计对象：** GitHub `mideng-ai/riftbound-the-lost-realm` main 分支最新文档（2026-11-12 拉取，以远端为准）
> **审计范围：** 8 份正式交付项目文档全量通读 + ASSET_LICENSE_RESEARCH.md 全部来源链接与许可证声明逐项线上核实（本报告自身为额外审计文件，不计入正式交付物）
> **报告状态：** 已提交至 GitHub main 分支（commit `75e305e4`）；2026-11-12 完成第二轮复核修订（见文末「修订记录」）
> **审计方式：** 文档通读与交叉比对；链接批量 HTTP 检查；官方页面许可证原文抓取比对。未运行游戏代码、未下载/安装/集成任何素材、未修改任何文档。
> **远端文档版本基线：** PROJECT_OVERVIEW v1.2 / DEVELOPMENT_ROADMAP **v1.7** / GAME_SCOPE v1.1 / GAME_DESIGN_PRINCIPLES v1.2 / DECISIONS_LOG **v1.7** / AI_TEAM_ROLES v1.1 / DEVELOPMENT_ENVIRONMENT v1.4 / ASSET_LICENSE_RESEARCH **v0.5**（加粗为本次审计时发现的远端新版本——ROADMAP 与 DECISIONS_LOG 在上轮推送后又有更新：资源调研清单 v0.5 已建立并同步）

---

## A. 已通过项目

| # | 检查项 | 结论与依据 |
|---|---|---|
| A1 | **文档体系完整** | 8 份正式交付文档齐全，版本记录连续可溯；ROADMAP v1.7 / DECISIONS_LOG v1.7 与 ASSET_LICENSE_RESEARCH v0.5 相互同步（审计时点；审计后经批准已升版为 ASSET v0.6 / OVERVIEW v1.3 / AI_TEAM_ROLES v1.2 / DECISIONS_LOG v1.8，见修订记录） |
| A2 | **决策状态纪律** | D-001~D-012 已确定、D-101~D-104 暂定、**D-201~D-210 共 10 项全部保持「待确认」**，候选方向内容逐字未变；v1.1~v1.7 各批次变更记录均显式声明「不改变任何游戏设计决策」 |
| A3 | **阶段状态纪律（未误写阶段完成）** | 全部文档阶段0 均为「进行中」；DECISIONS_LOG v1.7 已主动修正 v1.6 标题「阶段0 环境验证完成」→「阶段0环境验证**项**完成」；ENV v1.4 第九节明确「该条通过不等于阶段0完成」；ROADMAP v1.7 含「本阶段状态说明：阶段0 仍为进行中，不得因环境验证通过而标记完成」。未发现任何把单项完成写成阶段完成、或把阶段0完成写成可进入阶段1的表述 |
| A4 | **构筑数量口径一致** | 「最低至少 2 种、目标争取 3 种、不为数量牺牲质量」在 GAME_SCOPE 第 1 节 #10 与 1.1 表、GAME_DESIGN_PRINCIPLES 8.1 完全一致（D-103 统一口径落实） |
| A5 | **怪物数量口径一致** | 「4 普 + 2 精英 + 1 Boss，待阶段1最终确认」在 PROJECT_OVERVIEW 第 5 节、GAME_SCOPE #5、PRINCIPLES 7.2、AI_TEAM_ROLES 策划岗职责四处一致（D-104 暂定落实） |
| A6 | **待确认引用全部正确** | GAME_SCOPE 中 D-201/D-202/D-204/D-205/D-206/D-207/D-209 引用均指向 DECISIONS_LOG 实际存在的待确认项；PRINCIPLES 5.2 明确「以 D-202 为准，不预设候选方案」；未发现早期已纠正过的「按已确认方案实现」类错误引用回潮 |
| A7 | **技术栈表述一致** | Babylon.js + TypeScript + Vite「当前选定、待阶段2技术验证、未经批准不得更换」在 PROJECT_OVERVIEW 第 6 节、AI_TEAM_ROLES 总则 6、DECISIONS_LOG D-007 三处一致 |
| A8 | **M1 与首版边界一致** | PROJECT_OVERVIEW 第 8 节与 ROADMAP 阶段3 的「M1 ≠ 首版发布版本」表述一致 |
| A9 | **环境验证记录真实、分组、不混淆** | ENV v1.4 第七节沙箱五项与 Mac 本机五项分列两表，数据均来自实际执行（Mac 数据来源为负责人终端输出与截图）；第六节版本比对四项均满足；无把沙箱结果表述为 Mac 结果之处 |
| A10 | **PixelFX 声明核实一致** | 经 GitHub 页面核实：仓库存在（patch-gg/pixelfx）；「244 pixel art effects」、**MIT（code and effects）**、`gallery/fonts` 中 Patch Pixel 字体**不受 MIT 覆盖**、NOTICE 提及改编自 Hugo Duprez 与 Hollow Crown 的 MIT 项目、浏览器 Canvas/Phaser/PixiJS/Kaplay/three.js 支持——文档 2.1 全部条目与 README 原文一致；文档对「像素风 vs 3D 卡通风」「未列 Babylon.js」的风险提示准确 |
| A11 | **Kenney 系列核实一致** | nature-kit 页面标注 License: Creative Commons CC0；Particle Pack 页面「Files 80×, Tile size 512×512, CC0」与文档「80 个文件，512×512 tile」一致；Smoke Particles「Files 70×, CC0」与文档一致 |
| A12 | **Quaternius QAL 核实一致** | Bestiary 页面标注 License: QAL（非 CC0，文档判断正确）；QAL v1.0「Last updated: 8/28/2026」与文档「更新于 2026-08-28」一致；条款「personal, educational, and commercial games…no credit required」「You may not: a) Resell or redistribute the Assets themselves」与文档商业使用/限制描述一致；**第 7 条「Changes will not apply retroactively to Assets you've already obtained」**与文档「后续许可变更不追溯、应记录取得时间」一致 |
| A13 | **Poly Haven / ambientCG / StylizedTextures / 3DTexel / ShareTextures 核实一致** | Poly Haven「100% Free…CC0…without restrictions」；ambientCG「All assets are released under the Creative Commons CC0 license…without attribution - even in commercial circumstances」；StylizedTextures FAQ「All textures…CC0…commercial projects, without attribution required」「All free textures are provided in 4K resolution (4096×4096)」；3DTexel 页面确认「298 free CC0 stylized textures」与「3DTexel License」付费/AI 材质并存（文档「不能将整个网站视为同一许可」的提醒准确）；ShareTextures 主页「copyright-free…includes commercial projects」 |
| A14 | **Sonniss / Pixabay 核实一致** | Sonniss「royalty free and commercially usable. No attribution is required…unlimited number of projects」（文档 2.14 一致）；Pixabay 许可摘要「免费、无需署名、可修改改编」+「不得以 Standalone 形式出售分发」（文档 2.15 一致）。两站直连返回 403 系反爬，非链接失效 |
| A15 | **CC0 / MIT / CC BY / 自定义许可区分明确** | 音频第 3 节「常见许可判断」逐类列出 CC0、CC BY、CC BY-NC、CC BY-ND、平台自定义许可的处理规则；各资源条目均明确标注许可类型；Quaternius QAL、Sonniss、Pixabay、ShareTextures、3DTexel 付费部分均被明确识别为「非 CC0 / 自定义许可」，无混标 |
| A16 | **NC 素材排除与逐文件登记规则明确** | Freesound 条目「只筛选 CC0 或允许商业使用的 CC BY 文件；CC BY-NC 不适合商业游戏」；OpenGameArt「NC 条目排除」；音频采用前逐文件登记清单（作者/URL/日期/许可版本/署名要求）完整 |
| A17 | **Babylon.js 技术资料核实一致** | 官方 GPU 粒子文档确认「WebGL2 feature, the transform feedback buffer」且注明可用性限制，与文档「GPU 粒子需要 WebGL2、需准备 CPU 降级」一致；4 个 doc.babylonjs.com 链接全部 200 |
| A18 | **来源链接有效性（2026-11-12 第二轮重新统计）** | 清单共含 **32 个去重 URL**（正文出现 33 次，PixelFX 主页出现 2 次）。统计口径如下——① **直连 HTTP 200：21 个**（Kenney×7、Quaternius×2、Poly Haven、ambientCG、StylizedTextures、3DTexel、ShareTextures、doc.babylonjs×4、Incompetech、Freesound、OpenGameArt；第二轮复核 20 个再次 200，StylizedTextures 本轮超时但首轮实测 200 且已完成许可证原文比对）；② **直连 403（反爬）、经代理通道核实页面内容有效：2 个**（Sonniss、Pixabay 许可摘要）；③ **github.com 被沙箱屏蔽、经代理通道核实仓库存在与 README：1 个**（patch-gg/pixelfx）；④ **未单独核实、采用前须逐个确认的同域附属链接：4 个**（pixelfx NOTICE.md、pixelfx gallery/fonts、pixabay.com/music、pixabay.com/sound-effects）；⑤ **本执行环境网络不可达（非确认失效）：4 个**（KayKit itch.io×4，见 B 项 C1 说明）。**0 个确认失效** |

## B. 发现的问题（已获项目负责人批准，于 2026-11-12 执行修订完毕，见文末修订记录）

| # | 文件 | 位置 | 原文/现状 | 问题 | 修改建议 |
|---|---|---|---|---|---|
| B1 | ASSET_LICENSE_RESEARCH.md | 全文结构 | 「## 3. 初步筛选建议」出现于第 146 行，其后才继续 2.8~2.12（材质）、2.13~2.18（音频）、2.19~2.21（特效）条目；「## 4. 初步筛选建议」「## 3. 音频资源…」「## 3. Babylon.js 特效…」等编号多次重复；「## 6. 后续调研项」「## 7. 变更记录」与前文编号冲突 | **章节编号错乱、资源条目插在各组筛选建议之后**。成因为 v0.2→v0.5 按批次增量追加未做整体重组；导致「见第 X 节」类引用有歧义 | 重组为：1 调研目的 / 2 候选资源（2.1~2.21 连续编号） / 3 分类使用说明（PBR、音频、Babylon.js 特效三部分） / 4 分类筛选建议 / 5 后续调研项 / 6 变更记录。内容不变，仅调整结构与编号 |
| B2 | ASSET_LICENSE_RESEARCH.md | 第 58、148、253 行 | 「与首张地图 **Shadowgrove** 森林环境高度相关」「按首张地图 Shadowgrove 和当前开发阶段排序」「针对 Shadowgrove：」 | 地图名「Shadowgrove」在其余 8 份文档中均不存在；地图/世界观属阶段1设计范围（关联 D-208），该名称**未标注暂定/待确认**即被当既定名使用，违反文档自身「记录为候选不等于批准」及 AI_TEAM_ROLES「设计未确认项不得写死」的纪律 | 三处改为「首张森林主题地图（暂定名 Shadowgrove，待阶段1确认）」，或径直去掉专名改为「首张森林地图」 |
| B3 | ASSET_LICENSE_RESEARCH.md | 文档头部 | 「状态：调研中；本清单不代表资源已获准集成或已通过项目验收」 | 与 ROADMAP v1.7「第一轮调研已完成」、DECISIONS_LOG v1.7「完成第一轮资料调研」表述不一致（「调研中」暗示首轮未完） | 头部改为「状态：第一轮调研完成（v0.5）；后续调研项见第 6 节；资源仍为候选，未获准集成或验收」 |

## C. 建议修订项（非错误，供决定）

| # | 文件 | 建议 |
|---|---|---|
| C1 | ASSET_LICENSE_RESEARCH.md | 2.2~2.5 KayKit 条目的「页面标注 CC0」声明：本环境无法访问 itch.io 无法直接核实，建议在每条「当前状态」补一句「页面许可标注待用户本机复核并留存页面快照」，把核实责任落到采用前动作（与文档既有规则一致，属强化表述） |
| C2 | ASSET_LICENSE_RESEARCH.md | 2.16 Incompetech 条目：官方页面为动态结构，本轮未能直接抓取 CC BY 原文（与 Incompetech 长期公开的「CC BY 4.0 / 付费 Standard License 免署名」模式一致，但非本次核实）。建议补注「采用前须在具体曲目页面核对许可并保存署名文本」 |
| C3 | PROJECT_OVERVIEW.md | 末尾「关联文档」列表仅含五份基础文档，未含 AI_TEAM_ROLES / DEVELOPMENT_ENVIRONMENT / ASSET_LICENSE_RESEARCH 三份阶段0 新增文档，建议补全或加「另有阶段0专项文档：…」一行 |
| C4 | AI_TEAM_ROLES.md | 头部「配套使用」列表同上，未含环境与资源清单文档，建议同步补全（若采纳 C3 则两处一起改，保持引用对齐） |
| C5 | ASSET_LICENSE_RESEARCH.md | 全文「阶段 0」（含空格）与其他文档「阶段0」写法不统一，建议统一为「阶段0」；文档头部可补「0.x → 1.0 转正条件」（如：用户验收后升 1.0），与仓库其他文档版本惯例对齐 |

## D. 仍需项目负责人决定的事项

1. ~~**B1~B3 三项修订的批准**~~ **已批准并执行完毕（2026-11-12）**：ASSET_LICENSE_RESEARCH 升至 v0.6，DECISIONS_LOG 升至 v1.8 同步登记。
2. ~~**C1~C5 是否执行**~~ **C3~C5 已批准并执行完毕**（OVERVIEW v1.3、AI_TEAM_ROLES v1.2、ASSET v0.6）；**C1（KayKit 页面许可标注待本机复核）、C2（Incompetech 采用前核对具体曲目许可）未执行**，保留为采用前动作。
3. **阶段0 验收动作本身**：四项验收标准中 ③（环境）④（待确认清单+责任人）已达成；①（五份基础文档经用户验收确认）②（AI 岗位职责验收）的**用户正式验收尚未执行**——需要你对全部 8 份项目文档给出验收结论。
4. **D-101（文档体系）验收**，以及 DECISIONS_LOG 待办汇总「阶段0 结束前」栏的另一项：**确认 D-201~D-210 中是否有需要提前到阶段0 讨论的事项**（默认无需，全部留到阶段1）。
5. KayKit 4 个链接如需提前核实，可在你本机打开 itch.io 页面确认「CC0」标注后告知我补档。
6. 验收通过后是否批准进入阶段1（游戏设计）——按路线图须由你明确确认。
7. **范围外遗留（本轮未批准修改）**：DEVELOPMENT_ROADMAP.md v1.7 第 40 行仍引用「ASSET_LICENSE_RESEARCH.md v0.5」，资源清单已升至 v0.6，该引用已滞后；待你批准后可做一行同步修订。

## E. 阶段 0 是否具备正式验收条件

**结论：基本具备，建议完成一处小修后即可正式验收。**

- **产出完成度：** 阶段0 规划的产出共 8 份文档——五份基础文档 ✅、AI_TEAM_ROLES v1.1→v1.2 ✅（待验收）、DEVELOPMENT_ENVIRONMENT v1.4 ✅（沙箱+Mac 本机双重验证）、ASSET_LICENSE_RESEARCH v0.5→v0.6 ✅（第一轮调研完成）。无缺失产出。
- **验收标准逐条：** ①文档完整、无内部矛盾——完整 ✅，本轮交叉审计未发现规则冲突（B1~B3 属 ASSET 文档自身的结构/命名表述问题，不影响其他文档，已修订）；②AI 岗位职责明确不冲突——文档层面 ✅；③开发环境本机运行 `npm create vite` 空工程——✅ **已于 2026-11-12 在 Mac mini 实际达成**（五项验证）；④待确认事项有明确清单和责任人——✅（D-201~D-210 清单完整，责任人为用户）。
- **未通过/未完成项如实声明：** 用户正式验收动作未执行；ASSET 清单资源均为候选、未下载未集成（符合阶段约束，本就不是验收障碍）；项目网盘同步自 v1.2 后中断，当前以 GitHub main 为唯一同步基准（AI_TEAM_ROLES 第四节「双通道同步」的要求暂未满足，属环境遗留问题，如实记录）。
- **建议流程：** ~~你批准 B1~B3（可含 C 类）→ 我执行小修并升版推送~~（已完成：ASSET v0.6 / OVERVIEW v1.3 / AI_TEAM_ROLES v1.2 / DECISIONS_LOG v1.8，同日推送）→ 你对 8 份项目文档正式验收 → 阶段0 标记完成 → 你确认后进入阶段1。

---

### 审计方法与诚实声明

- 本报告所有「核实一致」结论均来自对官方页面的**实际抓取比对**（curl 直连 + 代理通道），非凭记忆判断；无法核实的项目（itch.io 4 个链接、Incompetech 许可原文）已明确标注「未核实」，未将其计入已通过项。
- 本次审计未运行任何游戏代码、未下载/安装/集成任何素材、未修改仓库任何文档、未改变 D-201~D-210 状态、未触碰技术路线——符合任务书全部约束。（后续经负责人批准的修订为独立批次，见下方修订记录。）
- 报告本身已于 2026-11-12 提交至 GitHub main 分支（commit `75e305e4`），属额外审计文件，不计入阶段0 的 8 份正式交付文档。

---

## 修订记录

### 2026-11-12　第二轮复核修订（报告 v1.1）

经项目负责人复核指出后修正本报告自身的统计与事实错误：

1. **报告入库状态更正**：报告已于当日提交 GitHub main（commit `75e305e4`），删除「未推送至 GitHub」的过时表述，头部增加「报告状态」行。
2. **链接统计重新核对**：原 A18「29 个链接、23 个核实有效、5 个 itch.io」有误。重新逐项核对清单后更正为 **32 个去重 URL（正文出现 33 次）**，并给出五组统计口径（直连 200×21、403 反爬经代理核实×2、github 屏蔽经代理核实×1、同域附属未单独核实×4、本环境不可达×4），0 个确认失效。第二轮复核实测：直连 21 个中 20 个再次 200，StylizedTextures 本轮超时（首轮 200 且已完成原文比对），如实标注。
3. **KayKit itch.io 链接数量更正**：清单中为 **4 个**（kaykit-forest / kaykit-adventurers / kaykit-character-animations / kaykit-dungeon-pack），原报告「5 个」有误；并明确「本执行环境网络不可达」与「链接确认失效」的区别——4 个均属前者，0 个确认失效。
4. **正式交付物数量更正**：阶段0 正式交付物为 **8 份项目文档**，本报告属额外审计文件不计入；原「9 份文档正式验收」等表述已全部更正。
5. **结论同步至最新文档状态**：B1~B3、C3~C5 已获批准并执行（ASSET v0.6 / OVERVIEW v1.3 / AI_TEAM_ROLES v1.2 / DECISIONS_LOG v1.8），B 节标题、D 节事项 1/2、E 节产出与流程状态已同步更新；新增范围外遗留事项（ROADMAP v1.7 引用 v0.5 滞后）供负责人决定。

本轮修订仍受原任务约束：不进入阶段1/2、不建工程、不写游戏代码、不下载集成素材、不改 D-201~D-210 状态、不将阶段0标记为完成、不代替负责人执行正式验收。
