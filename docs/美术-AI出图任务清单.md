# 美术-AI出图任务清单 V1.0

> 用途：图像生成模型（image2 / Nano Banana 类）任务单 ｜ 依据：美术圣经 V0.5
> 规则：每条 prompt 均以风格锚开头；产出图仅作视觉基准，模型资产须按美术圣经 §7 预算独立生产，严禁直接转贴图入库。
> 归档命名：`assets/concepts/{批次}_{编号}_{slug}.png`（如 `p0_a01_emberward_fullbody.png`）；`assets/concepts/` 不进构建管线。

## 0. 风格锚（Style Anchor，所有任务必带前缀）

> **Style anchor:** toon-shaded stylized 3D game art, vibrant saturated colors, clean readable silhouettes, chunky exaggerated proportions, smooth cel shading with three-band shadows, hand-painted texture feel, magical fantasy forest setting, top-down mobile game asset aesthetic, polished indie game art quality, mystical yet cheerful mood, soft ambient occlusion, single character focus, simple background

> **Negative prompt:** photorealistic, gritty, dark horror, realistic anatomy, skin pores, gore, blood splatter, dull desaturated colors, blurry, lowres, jpeg artifacts, text, watermark, logo, first-person view, cluttered busy background, realistic PBR lighting, grain, motion blur, extra limbs

## P0 — 核心循环（第一批，9 条，风格定型用）

| # | 用途 | 比例 | Prompt（风格锚后接） | 验收要点 |
|---|---|---|---|---|
| A01 | 概念参考 | 16:9 | full body concept of an "Emberward Mage": a young sorcerer in an ember-orange hooded robe with glowing rune trim, holding a gnarled wooden staff topped with a floating flame crystal, a sheathed rune-etched magic sword on the back, confident stance, three-quarter view, neutral studio background | 袍装主色与法杖火焰水晶是否可作三视图基准 |
| A02 | 概念参考 | 1:1 | the same Emberward Mage in combat pose swinging the glowing magic sword in a wide 120-degree arc, motion-emphasized slash trail in warm orange, dynamic three-quarter angle | 剑挥扇形弧线是否清晰读出 120° 攻击范围 |
| A03 | 建模参考 | 1:1 | a "Rift Hound": small lean quadruped beast, dark fur with two glowing violet rift-stripe marks along its spine, elongated arrow-like body, low crouching pose, top-down three-quarter view | 俯视下能否一眼读出"细长箭头"剪影与双条纹 |
| A04 | 建模参考 | 1:1 | a "Rift Spitter": tall thin plant-creature on a single stalk leg, oversized blooming bud head glowing cyan-green, vine tail trailing behind, aiming pose, top-down three-quarter view | 头部大轮廓与藤蔓尾是否形成"一点一头"辨识 |
| A05 | 建模参考 | 1:1 | an "Umbra Dasher": gaunt semi-transparent humanoid shade, violet-black smoke body, hunched sprinting pose with ghosting afterimage trail, top-down three-quarter view | 半透明度与残影是否可读、是否仍能辨轮廓 |
| A06 | 建模参考 | 1:1 | a "Rift Nourisher": squat round root-tuber creature, wide body wider than tall, glowing spore sac on top, small root legs, supportive aura shimmer, top-down three-quarter view | 俯视是否呈全场普通怪中最大圆轮廓 |
| A07 | 概念参考 | 16:9 | epic concept of "The Rift Warden" (Corrupted Forest Lord): a massive tree-barked giant kneeling in watch, glowing violet crack in its chest, long arms, antler crown, ancient guardian aura, dramatic low-angle hero shot, forest backdrop | 胸口裂缝与长臂是否成立；悲剧守护者气质 |
| A08 | 环境/贴图参考 | 16:9 | environment mood sheet of "The First Grove": stylized forest ground tiles, mossy dirt path, glowing ferns, giant toon trees, ancient stone ruins overgrown with vines, vibrant green palette with teal mist, top-down 60-degree view | 地块明度分层是否支持俯视角移动读图 |
| A09 | 比例基准参考 | 16:9 | gameplay vignette: Emberward Mage fighting a pack of Rift Hounds and a Rift Spitter on a forest path, top-down 55-degree camera, all characters readable as clean silhouettes | 玩家与普通怪的比例关系是否符合圣经 §3.1 |

## P1 — 扩展阵容（第二批，7 条）

| # | 用途 | 比例 | Prompt | 验收要点 |
|---|---|---|---|---|
| B01 | 建模参考 | 1:1 | The Rift Warden phase 1 "The Warden's Wake": kneeling tree-giant, bark intact, only a thin glowing chest crack, single arm raised in guard, top-down three-quarter view | 半跪+单缝发光的"低威胁"读法 |
| B02 | 建模参考 | 1:1 | The Rift Warden phase 2 "Corrupted Bloom": standing tree-giant with glowing corrupted flower buds blooming from shoulders and back, vine arms extended 1.5x length, top-down three-quarter view | 花苞数量与藤蔓延长是否读出范围威胁 |
| B03 | 建模参考 | 1:1 | The Rift Warden phase 3 "Rift Unbound": tree-giant floating off ground, bark slabs peeling and hovering, blazing violet rift core exposed in chest, broken antler crown split into a rift ring, top-down three-quarter view | 剥落悬浮+核心高亮是否为全形态最醒目 |
| B04 | 建模参考 | 1:1 | elite "Rift Ravager": heavily armored broad-shouldered brute, twin huge curved horns, glowing orange cracks in armor plates, oversized tower shield, top-down three-quarter view | 全场最宽剪影+裂缝透光 |
| B05 | 建模参考 | 1:1 | elite "Rift Caller": tall slender floating figure in tattered robe, no legs, hovering arcane ring with six orbiting light orbs around it, casting gesture, top-down three-quarter view | 圆形斗篷+六光点外环是否成立 |
| B06 | 建模参考（组图） | 1:1 | asset sheet of five magical forest objects in one image: a settler's wooden "Lost Cache" chest with glowing lock, an "Elemental Altar" with four elemental gems floating, a pulsating organic "Monster Nest" mound, an "Ancient Altar" of carved stone drinking golden light, a vertical "Elite Incursion" rift portal tearing purple light, arranged in a grid, top-down three-quarter view each | 五物件是否风格统一且两祭坛可区分 |
| B07 | UI 图标样张 | 1:1 | icon style sheet of seven gems in one image: diamond-shaped fire gem, hexagonal frost gem, triangular storm gem, crescent shadow gem, round shield-shaped might gem, round wind-ring haste gem, round leaf-heart vital gem, each in common-rare-legendary depth variants implied by border glow, clean game UI icon style, neutral background | 形状分类+品质深度语言是否可辨识 |

## P2 — 特效与 UI（第三批，5 条）

| # | 用途 | 比例 | Prompt | 验收要点 |
|---|---|---|---|---|
| C01 | 特效参考 | 16:9 | VFX reference sheet, four elemental spell effects side by side: swirling fire burn with ember particles in orange, frost freeze with hexagonal ice crystals in cyan, chain lightning with jagged white-yellow arcs, shadow drain with violet smoke tendrils, each effect isolated on forest ground | 四元素颜色/形状是否与圣经 §1.2 双通道一致 |
| C02 | 特效参考 | 16:9 | ground telegraph decals on forest floor: red circle AOE marker, red 120-degree cone sweep, red rectangle dash path, green hexagon poison zone, gold buff ring, each decal glowing with clean outline, top-down view | 六种预警形状是否一眼可分类 |
| C03 | UI 概念 | 16:9 | mobile game HUD concept frame: top-left player health bar with ornate leaf-carved frame, top-right boss countdown timer, bottom-left virtual joystick zone, bottom-right cluster of five round action buttons, semi-transparent parchment-and-vine UI style, landscape phone layout | 布局是否符合圣经 §5 五键+摇杆 |
| C04 | UI 概念 | 16:9 | victory results screen concept: "The seal is yours to keep" banner, collected gold echo crystals, elemental shards and gems icons, wildwood material counter, glowing first grove background, ornate fantasy UI panel | 结算信息层级（主文案>资源>按钮） |
| C05 | 概念参考 | 16:9 | key art: Emberward Mage back view facing the giant Rift Warden across a corrupted forest clearing, violet rift tear in the sky, scale contrast dramatic composition | 主视觉备用/商店物料候选 |

## 附件：归档与使用规则

1. **归档路径与命名**：`assets/concepts/{批次}_{编号}_{slug}.png`。原图不入引擎包（`assets/concepts/` 不进构建管线）。
2. **仅概念参考，不进引擎**：A01、A02、A07、A09、C03、C04、C05——只约束气质与构图。
3. **可作建模/贴图绘制参考**：A03-A06、B01-B06——后续建模按此出三视图再生产 GLB；A08/C01/C02 可作环境与特效配色取样。
4. 每张出图后对照"验收要点"打分：不合格重 roll 不超过 3 次，仍不合格则回到本清单修订 prompt 而非放水。

## 与美术圣经的关系

- 本清单的每个视觉描述都源自 `美术-美术圣经V0.5.md` §3（剪影）与 §8（资产清单），命名与 `叙事-世界观与文案.md` §2 术语表一致（Rift Spitter、Storm=雷、Shadow=暗）。
- 圣经 §9 有 3 个待拍板决策（Boss 主色相 / 玩家袍装颜色 / 体积光）——**拍板前建议先只跑 P0 的 A03-A06、A08（不含 Boss 与玩家的图）**，避免返工。
