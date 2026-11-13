# Technical Architecture — Stage 2 Formal Skeleton (S2-G)

> **Status: READY_FOR_REVIEW (ST2-003).** This document describes the module
> layout, dependency rules, and lifecycle of the Stage-2 formal skeleton.
> Every item marked **PROVISIONAL / OPEN** is a decision gate that belongs to
> the project owner and MUST NOT be treated as final by any implementation work.

## 1. Stack & toolchain (pinned)

| Layer | Version | Note |
|---|---|---|
| Babylon.js `@babylonjs/core` | **9.36.0** exact pin | esm imports |
| TypeScript | **5.9.3** exact pin | `strict` + `verbatimModuleSyntax` |
| Vite (rolldown) | **8.3.8** exact pin | dev/build/preview |
| Registry | `https://registry.npmjs.org` only | `.npmrc` forces it; lockfile contains 49/49 https URLs, zero mirror/http entries |

`tsconfig` highlights: `ES2022` target, `moduleResolution: bundler`,
`noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`, `noEmit` (build runs
`tsc` first, then Vite bundles).

## 2. Module map & dependency direction

Dependency arrows may only point **downward**; no circular imports exist
(verified by `tsc` + successful build).

```
main.ts  (composition root)
 ├─▶ engine/EngineHost        ── owns Engine, canvas, lifecycle
 ├─▶ input/InputSystem        ── facade over KeyboardMouseAdapter + TouchAdapter
 ├─▶ save/MockSaveAdapter     ── implements save/SavePort        (D-207 OPEN)
 ├─▶ debug/PerfMonitor        ── HUD; reads Engine, writes DOM
 └─▶ scenes/BootstrapScene    (scene assembler)
       ├─▶ render/CameraRig
       ├─▶ render/ToonMaterial   (PROVISIONAL rendering direction)
       ├─▶ vfx/ProjectileSystem  (S2-C lifecycle path)
       ├─▶ save/SavePort         (type-only import + defaultSave factory)
       └─▶ config/gameConfig     (all modules may import config; config imports nothing)
```

Rules:

1. **`config/gameConfig.ts` is a leaf** — it may never import other modules.
   All tunables live here, flagged `PROVISIONAL` where a decision gate applies.
2. **Scene assembly happens in exactly one place** (`BootstrapScene`); `main.ts`
   only wires singletons and starts the loop.
3. **Babylon imports** are allowed in `engine/`, `render/`, `vfx/`, `scenes/`,
   and `debug/`; `input/`, `save/`, and `config/` are engine-agnostic by design
   (input adapters touch only DOM events; save touches only storage APIs).
4. `save/SavePort.ts` is consumed as a **type-only import** in scene code
   (`verbatimModuleSyntax`), keeping the backend swappable with zero runtime cost.

## 3. Module responsibilities & lifecycle

### engine/EngineHost
Creates `WebGLEngine` on the given canvas, owns `resize` handling, and pauses
`engine.renderLoop()` on `visibilitychange` hidden / resumes on visible.
Lifecycle: `construct → start() → (auto) → dispose()`.

### input/ (S2-D contract)
- `types.ts` — the typed contract: `MoveVector {x,y}`, `InstantAction`
  (`'dash'|'confirm'|'cancel'`), `HeldAction`, `SystemState`
  (`'blur'|'visibilityHidden'|'touchCancel'`), plus `InputListener` /
  `InputSystemFacade`.
- `KeyboardMouseAdapter` — **pointer** events (`pointerdown/pointerup` with
  `pointerType === 'mouse'`), not mouse events; Babylon's canvas
  `preventDefault` on `pointerdown` suppresses synthesized mousedown.
- `TouchAdapter` — left-half single-finger dynamic joystick, fixed zone
  assignment (a touch never migrates zones), right-half action buttons;
  `touchcancel` clears state.
- `InputSystem` — collects adapter events into a per-frame `pending` set,
  consumed exactly once by the game, then cleared; `SystemState` events
  (blur/visibility/touchcancel) flush held state immediately.

### render/CameraRig
Orthographic-style top-down camera; `follow(target, dt)` applies exponential
smoothing so camera motion is framerate-independent.

### render/ToonMaterial — **PROVISIONAL**
`ShaderMaterial` with inline GLSL cel banding
`0.30·step(0.08,N·L) + 0.32·step(0.44,N·L) + 0.38·step(0.78,N·L)`, migrated
from the ST2-002 path-B spike. `bindLight()` feeds the single scene light.
The whole class is replaceable once the owner picks the final render
direction; nothing outside `render/` references shader internals.

### save/ (D-207 OPEN)
`SavePort { load(): Promise<SaveDataV2|null>; save(): Promise<void>;
reset(): Promise<void> }`, `CURRENT_SCHEMA_VERSION = 2`, `defaultSave()`
factory. Only `MockSaveAdapter` (in-memory) is wired. The localStorage-vs-
IndexedDB decision is the owner's; the S2-E evidence (Firefox real quota
~4–5 MB, IDB sync-abort atomicity, 8/8 PASS ×3 browser profiles) lives in
`spikes/ST2-003-E-SAVE/`.

### resources/AssetLoader
Programmatic placeholder geometry/materials today; exposes an async
`loadStage3Assets()` stub with the intended GLTF flow so the interface shape
is settled before Stage 3.

### vfx/ProjectileSystem (S2-C)
Lightweight path: `fire() → update(dt) → dispose` on hit/expire. Per S2-C
evidence, create+dispose costs ≈ 0.34 ms/op and is sufficient at <50
concurrent projectiles; pooling exists behind `gameConfig.vfx.poolingEnabled`
(default **false**). Hit VFX reuses **one shared pulsing PointLight** — never
one light per hit (each new light triggers a shader recompilation stall).

### debug/PerfMonitor
HUD-only (fps, p50, p95). Values are **observations, not budget**; the D-210
budget decision belongs to the owner (S2-F ladder data is in
`spikes/ST2-003-F-PERF/`).

### scenes/BootstrapScene
Single assembly point: ground + player (toon material) + camera follow +
auto-fire projectile demo + mock-save first-run write + input-driven movement
and dash pulse. Returns a `dispose()` that tears down scene objects; engine
teardown stays in `main.ts`/`EngineHost`.

## 4. Data flow per frame

```
adapters ──▶ InputSystem.pending ──▶ BootstrapScene.update(dt)
                                        ├─ move player (MoveVector)
                                        ├─ dash pulse (InstantAction)
                                        ├─ ProjectileSystem.update(dt)
                                        └─ CameraRig.follow(dt)
EngineHost.renderLoop ──▶ scene.render()   (skipped while hidden)
```

The input contract is **consumed, not polled from DOM** inside scene code —
scene never touches DOM events directly.

## 5. Coding conventions

- Exact-pinned dependencies; lockfile must remain 100% `https://registry.npmjs.org`.
- `strict` TS; `verbatimModuleSyntax` — `import type` for type-only imports.
- No `any` in module public APIs (internal escape hatches only with a comment).
- Every decision-gated value lives in `gameConfig` with a `PROVISIONAL` /
  `OPEN` comment naming the gate (D-207 / D-210 / render direction).
- Units explicit: `Ms` suffix for milliseconds, `dt` in seconds.
- Dispose discipline: every mesh/particle/texture created outside a factory
  must have a documented owner that disposes it (S2-C leak evidence:
  skipping dispose grows `scene.meshes` linearly).

## 6. Decision-gate status (owner-owned, unchanged by S2-G)

| Gate | Topic | Status | Evidence |
|---|---|---|---|
| D-207 | Save backend (localStorage vs IndexedDB) | **OPEN** — recommendation only | `spikes/ST2-003-E-SAVE/README.md` |
| D-210 | Performance budget | **OPEN** — all numbers provisional | `spikes/ST2-003-F-PERF/` |
| Render direction | Toon pipeline (path B) | **OPEN** — ToonMaterial marked PROVISIONAL | `spikes/ST2-002-*` + this doc §3 |
| Real devices | Mac mini / phone matrix | **NOT EXECUTED by agent** | `docs/STAGE2_DEVICE_TEST_CHECKLIST.md` |

## 7. Verification record

See `evidence/`: `npmci.log` (0 vulnerabilities), `npm-audit.log`,
`build.log` (clean build, dist sizes), `dist-hash.txt`, `run.log` (smoke:
HUD live, `projectiles live=1`, mock save write, no pageerror),
`shot-smoke.png`, and `harness.mjs` (the Playwright smoke driver).
