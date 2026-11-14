# Riftbound: The Lost Realm — Stage 2 Formal Skeleton (S2-G)

> **Documentation map (2026-11-14 reorganization, Chinese names with category prefixes):**
> - Master plan: `docs/总纲-项目规划书V1.md`
> - Game brief: `总纲-游戏简报.md` · Design bible: `docs/设计-设计总纲.md`
> - Agent tasks: `docs/设计-Agent任务分配.md` · Numeric baseline: `docs/设计-数值定案表.md`
> - Narrative: `docs/叙事-世界观与文案.md` · Art bible: `docs/美术-美术圣经V0.1.md`
> - Audio: `docs/音频-音效事件表.md` / `docs/音频-背景音乐.md`
> - QA baseline: `docs/质量-QA验收基线.md` · Sprints: `docs/流程-冲刺排期.md`
> - All legacy "search-fight-extract" era docs live in `docs/归档/` (**obsolete, reference only**).

> **Status: READY_FOR_REVIEW (ST2-003)** — this is the formal Stage-2 engineering
> skeleton produced by the S2-G work package. It is **NOT gameplay**. All
> provisional values are clearly marked and remain subject to owner decisions
> (D-207 save adapter, D-210 performance budget, final rendering direction).

## What this is

A minimal, typed, modular Babylon.js + TypeScript + Vite application that
integrates the verified conclusions of the four Stage-2 spikes into one
coherent codebase:

- **EngineHost** — engine lifecycle, tab-hidden render pause (`visibilitychange`).
- **CameraRig** — top-down camera with smoothed follow.
- **ToonMaterial** — *PROVISIONAL* `ShaderMaterial` with inline GLSL cel shading
  (ST2-002 path B: 3 bands at N·L = 0.08 / 0.44 / 0.78, weights 0.30/0.32/0.38).
  Swappable once the owner picks the final rendering direction.
- **InputSystem** — typed event contract (`MoveVector` / `InstantAction` /
  `HeldAction` / `SystemState`) with `KeyboardMouseAdapter` + `TouchAdapter`
  (migrated verbatim from ST2-003-D, which passed 11/11 desktop + 5/5 simulated
  touch e2e checks).
- **SavePort + MockSaveAdapter** — D-207 left open: only an in-memory mock is
  wired. The real backend (localStorage vs IndexedDB) is decided by the owner;
  see `st2003/e-save/README.md` for the comparison evidence.
- **AssetLoader** — programmatic placeholders now; Stage-3 GLTF interface stub.
- **PerfMonitor** — dev HUD (fps, p50, p95). Observations only, **not** a budget.
- **ProjectileSystem** — lightweight lifecycle path from ST2-003-C
  (create→update→dispose; pooling optional and currently OFF).

## Requirements

- Node.js ≥ 20 (tested on 22.x)
- A WebGL2-capable browser

## Install

```bash
npm ci        # uses package-lock.json — all 49 URLs pinned to https://registry.npmjs.org
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc` type-check + production build (`dist/`) |
| `npm run preview` | Serve the production build on port **4170** (`--strictPort`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:input` | Input regression suite (18 checks: listener lifecycle + focus/visibility/touchcancel) |

## What you should see on first run

1. Top-down view of a ground plane; player cube follows WASD / arrow keys
   (touch devices: left-half virtual joystick + action buttons).
2. The player auto-fires a projectile every 2 s (S2-C lifecycle demo).
3. HUD (top-left): fps / p50 / p95, and
   `saveAdapter=mock (D-207 pending)`.
4. Console: `[save] first run — default save written via mock adapter`.

## Directory layout

```
index.html              entry page (canvas + touch DOM controls)
src/
  main.ts               bootstrap wiring
  config/gameConfig.ts  central config; PROVISIONAL values flagged
  engine/EngineHost.ts  engine + lifecycle
  render/CameraRig.ts   camera
  render/ToonMaterial.ts PROVISIONAL cel-shader material
  input/                typed input contract + adapters (from S2-D)
  save/                 SavePort interface + MockSaveAdapter (D-207 open)
  resources/AssetLoader.ts
  debug/PerfMonitor.ts
  vfx/Projectile.ts     projectile lifecycle (from S2-C)
  scenes/BootstrapScene.ts composition root for the demo scene
evidence/               build/audit/install logs, smoke screenshot, harness
```

## Verification performed (this skeleton)

- `npm ci` — 0 vulnerabilities, lockfile 49/49 HTTPS resolved URLs (no mirror/http).
- `npm run typecheck` — clean (strict mode, `verbatimModuleSyntax`).
- `npm run build` — succeeds; dist hash recorded in `evidence/dist-hash.txt`.
- Headless Firefox (software WebGL2) smoke run: HUD live, projectile
  `live=1`, mock save first-run write, **zero `pageerror`** — see
  `evidence/run.log` and `evidence/shot-smoke.png`.

## Known limits / what this is NOT

- **Not gameplay.** No combat logic, no enemies, no level content, no audio.
- All budgets and tuning numbers are **provisional** pending owner decisions.
- Real-device (Mac mini / phone) verification is tracked separately in
  `docs/归档/STAGE2_DEVICE_TEST_CHECKLIST.md` and has **not** been executed by the
  agent; those cells stay empty for the owner to fill.
- Performance data from software-rendered CI browsers must **not** be
  extrapolated to real GPUs (S2-F conclusion).
- Bundle is intentionally unoptimized: a chunk-size warning is expected
  because the full `@babylonjs/core` esm barrel is imported. Tree-shaking /
  side-effect tuning is Stage-3 work, not a Stage-2 deliverable.
