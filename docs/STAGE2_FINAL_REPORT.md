# Stage 2 Final Report — Remaining Work Execution (ST2-003)

> **Status: READY_FOR_REVIEW** — awaiting ChatGPT technical review and project-owner acceptance.
> **Executed by:** WorkBuddy, under the single owner approval `ST2-003 APPROVED_TO_START` (2026-11-13).
> **Scope document:** `docs/STAGE2_MASTER_EXECUTION_PLAN.md` v1.0 (Sections 3–9).
> **Not included by design:** Stage 3 / M1 gameplay; final D-207 / D-210 / rendering-direction decisions (owner-reserved); real-device test execution (owner hardware).

## 1. Executive summary

All Stage-2 work packages S2-C through S2-G were executed and pushed to `main` as independent, evidence-backed deliverables. Every package keeps its own source + raw logs + screenshots; every owner decision gate (D-207, D-210, render direction) is left **OPEN** with a recommendation only; every test that was not run is explicitly marked as such.

| Package | Deliverable | Location on `main` | Head commit range |
|---|---|---|---|
| S2-C | Spell VFX spike (projectile lifecycle, 2 spell compositions, dispose/leak & pooling experiments) | `st2003/c-vfx/` | `d4ea77d1 … f323f082` (17 files) |
| S2-D | Unified PC/mobile input abstraction (typed contract + adapters) | `st2003/d-input/` | `f323f082 … f3617d49` (20 files) |
| S2-E | D-207 storage comparison + minimum validation suite (3 browser profiles) | `st2003/e-save/` | `f3617d49 … dd5d3475` (18 files) |
| S2-F | D-210 performance ladder benchmark + provisional budget proposal | `st2003/f-perf/` | `dd5d3475 … c06defda` (17 files) |
| Device | Owner-run real-device verification package | `docs/STAGE2_DEVICE_TEST_CHECKLIST.md` | `c06defda` |
| S2-G | Formal Vite+TS+Babylon.js project skeleton, README, TECH_ARCHITECTURE.md | repo root + `docs/TECH_ARCHITECTURE.md` | `3d201d14 … cdac3162` (29 files) |
| Regression | Clean-directory integration regression | this report §6 | latest `main` tarball |

## 2. S2-C — Spell VFX spike (`st2003/c-vfx/`)

**Built:** projectile lifecycle (`fire → update → dispose`), two spell compositions — **L**: impact billboard + 12 particles; **R**: billboard + 60 particles + expanding shock ring + **one shared pulsing PointLight** — plus a `GlowLayer`, inverted-tween list, and three experiments (stress-dispose / stress-leak / micro-benchmark).

**Key results (software WebGL2, llvmpipe — directional only, not perf conclusions):**

| Experiment | Result |
|---|---|
| Dispose vs leak | dispose group `totalMeshes` 5 → 21 (Δ16 = in-flight only); leak group 5 → 53 (Δ48 growing linearly) → **dispose is mandatory** |
| Create+dispose cost | 200 ops = 68 ms ≈ **0.34 ms/op** — acceptable at < 50 concurrent projectiles |
| Pool re-use | < 0.005 ms/op, **> 60× faster** — pooling is an optional optimization; default OFF |
| Shared hit light | per-hit `new PointLight` triggers shader recompilation stalls; single shared pulsing light avoids it |

**Decision-gate status:** VFX numbers are spike observations; formal budget/pooling defaults live in `gameConfig` marked PROVISIONAL.

## 3. S2-D — Unified input abstraction (`st2003/d-input/`)

**Built:** typed input contract (`MoveVector` / `InstantAction` / `HeldAction` / `SystemState`) consumed via an `InputSystem` facade over two adapters: `KeyboardMouseAdapter` and `TouchAdapter` (left-half single-finger dynamic joystick, fixed zone assignment, `touchcancel` handling).

**Tests actually run:**

| Suite | Environment | Result |
|---|---|---|
| Desktop e2e (keyboard+mouse) | headless Firefox | **11/11 PASS** |
| Simulated touch e2e (synthetic TouchEvent) | Chromium + SwiftShader (`hasTouch: true`) | **5/5 PASS** |

**Documented pitfall (passed on to S2-G):** Babylon's canvas `pointerdown` calls `preventDefault`, which suppresses synthesized `mousedown` — adapters must use **pointer** events. First implementation failed 2/11 mouse-intent checks for exactly this reason; fix verified.

**Physical mobile tests: NOT run** — recorded per-item as `OWNER_DEVICE_TEST_REQUIRED` in the S2-D README table (M1–M12) and consolidated in `docs/STAGE2_DEVICE_TEST_CHECKLIST.md` §B.

## 4. S2-E — D-207 storage comparison (`st2003/e-save/`)

**Built:** minimal validation suite — L1 versioned read/write, L2 v1→v2 migration, L3 corruption isolation, L4 transaction-atomicity (synchronous `tx.abort()`), L5 quota behavior, I1–I5 IndexedDB equivalents, P1 batch-write timing.

**Tests actually run — 8/8 PASS in all three profiles:** Firefox (regular), Chromium, Firefox private window.

**Key facts measured:** Firefox localStorage real quota ≈ **4–5 MB** (write FAILs beyond ~300 × 10 KB); IDB transaction abort is all-or-nothing when issued synchronously; `DataCloneError` reproduces in both engines.

**D-207 status: OPEN.** Advisory recommendation only: **localStorage** for v1 (simpler, synchronous, sufficient for schema-v2 saves) with a documented trigger list for migrating to IndexedDB (saves > ~1 MB, frequent autosaves, large stash). Final choice is the owner's; `SavePort` interface + `MockSaveAdapter` wired in S2-G so the backend is a drop-in swap.

## 5. S2-F — D-210 performance ladder (`st2003/f-perf/`)

**Built:** entity-load ladder benchmark (N = 0 / 25 / 50 / 100 / 200 InstancedMesh entities + particle `emitRate` coupled), frame-time percentiles (p50/p95), memory when available (`performance.memory`, Chromium only).

**Measurements (raw, committed):**

| Engine | N=0 | N=200 | Notes |
|---|---|---|---|
| Chromium + SwiftShader | 24.0 fps | 14.7 fps | p50 18.2 → 87.6 ms; heap stable 22–24 MB |
| Firefox + llvmpipe | 57.3 fps | 59.0 fps | pinned to vsync — software rasterizer saturates differently |

**D-210 status: OPEN — all budget numbers PROVISIONAL.** The README proposes a split budget (mobile mid-tier p95 ≤ 33.3 ms ≈ 30 fps; desktop 60 fps) as a *candidate only*. **Software-rendering data from two engines differing up to 4× must not be extrapolated to real GPUs**; the Mac M1 real-GPU run is owner-side (`docs/STAGE2_DEVICE_TEST_CHECKLIST.md` §A, `OWNER_DEVICE_TEST_REQUIRED`).

## 6. S2-G — Formal project skeleton (repo root) + integration regression

**Built (all in root, keeping `st2003/` spike evidence intact):** `EngineHost`, `CameraRig`, `ToonMaterial` (**PROVISIONAL**, ST2-002 path-B GLSL cel), typed `InputSystem` (migrated from S2-D), `SavePort` + `MockSaveAdapter` (D-207 open), `AssetLoader` (Stage-3 GLTF stub), `PerfMonitor` (observations only), `ProjectileSystem` (S2-C lightweight path), `BootstrapScene` assembler, `gameConfig` (all gated values flagged), root `README.md`, `docs/TECH_ARCHITECTURE.md`.

**S2-G verification chain (committed evidence in `evidence/`):** clean `npm ci` → 0 vulnerabilities (`npm-audit.log`); lockfile **49/49 HTTPS `registry.npmjs.org`, 0 plaintext http**; `tsc --noEmit` clean; production build ✓ (dist hash recorded); headless-Firefox smoke: HUD live, `projectiles live=1`, `[save] first run — default save written via mock adapter`, **0 pageerror** (`run.log`, `shot-smoke.png`).

**Integration regression (clean directory, from `main` tarball at `cdac3162`, not a reused workspace):**

| Check | Result |
|---|---|
| tarball fetch (API; direct git clone blocked by sandbox network to `github.com:443`) | ✅ 2.9 MB, contains `cdac3162` |
| lockfile URLs | ✅ 49 HTTPS / 0 http |
| `npm ci` | ✅ 0 vulnerabilities |
| `npm audit` | ✅ 0 vulnerabilities |
| `npm run typecheck` | ✅ clean |
| `npm run build` | ✅ built in 1.37 s (expected chunk-size warning — Babylon esm barrel; Stage-3 optimization task) |
| preview + headless Firefox smoke | ✅ HUD live, `suspended=false`, mock-save first-run write, 0 pageerror (`regression-smoke.log`, staged for commit) |

## 7. Real-device verification status

`docs/STAGE2_DEVICE_TEST_CHECKLIST.md` provides the owner-run package: **Mac mini A1–A10** (real-GPU WebGL2, perf ladder on M1, pointer-lock/keyboard flows) and **phone B1–B6** (touch joystick/actions, viewport, storage quota on device). **None of these tests were executed by the agent**; all result cells remain empty by design. No software-rendered result anywhere in Stage 2 is claimed as device evidence.

## 8. Decision gates & risks

| Item | Status | Owner action needed |
|---|---|---|
| D-207 save backend | OPEN — recommendation: localStorage (S2-E) | Decide; swap `SavePort` backend (drop-in) |
| D-210 perf budget | OPEN — all numbers PROVISIONAL (S2-F) | Decide after Mac M1 real-GPU run |
| Final rendering direction | OPEN — `ToonMaterial` marked PROVISIONAL | Decide; class is self-contained in `src/render/` |
| Device matrix | NOT EXECUTED by agent | Run `STAGE2_DEVICE_TEST_CHECKLIST.md` |

**Risks / known limitations (honest list):**
1. All browser evidence is **software-rendered** (llvmpipe / SwiftShader) — directional only.
2. Simulated touch used Chromium synthetic TouchEvents, not a real touchscreen.
3. Bundle is unoptimized (chunk-size warning) — deliberate Stage-2 boundary.
4. Sandbox cannot reach `github.com:443` for native git; all commits via Contents API (one file per commit).
5. `performance.memory` exists only in Chromium; Firefox heap numbers are unavailable.

## 9. Stage-2 acceptance traceability (vs `STAGE2_MASTER_EXECUTION_PLAN.md` §8)

| Requirement | Status | Evidence |
|---|---|---|
| §8.1–2 S2-C VFX validation + experiments | DONE | `st2003/c-vfx/` README + evidence |
| §8.3 S2-D input abstraction, honest testing | DONE (desktop + simulated touch) | `st2003/d-input/` e2e logs |
| §8.4 S2-E storage comparison + min tests | DONE | `st2003/e-save/` 3-profile results |
| §8.5 S2-F perf measurement + budget rec | DONE (PROVISIONAL) | `st2003/f-perf/` ladders |
| §8.6 Device verification prep | DONE (owner-run package) | `docs/STAGE2_DEVICE_TEST_CHECKLIST.md` |
| §8.7 S2-G skeleton + README + TECH_ARCHITECTURE | DONE | repo root + `docs/TECH_ARCHITECTURE.md` |
| §8.8 Integration regression + evidence package | DONE | this report §6 |
| Decision gates respected | YES | D-207/D-210/render all OPEN, recommendations only |
| Stage 3 / M1 entered | NO | no gameplay code anywhere on `main` |

## 10. Next actions requested

1. **ChatGPT:** technical review of ST2-003 (Section 6 report in `AGENT_COLLABORATION.md`).
2. **Owner:** run the device checklist (Mac mini + phone); decide D-207, D-210, rendering direction.
3. After owner acceptance of Stage 2: Stage 3 authorization remains a separate owner decision (not requested here).
