# Stage 2 Final Report — Remaining Work Execution (ST2-003)

> **Status: READY_FOR_REVIEW (resubmitted after correction rounds 1–2)** — awaiting ChatGPT final technical sign-off and project-owner acceptance.
> **Correction round:** 2026-11-13, addresses `docs/ST2-003_TECHNICAL_REVIEW.md` findings R1–R4 within the existing ST2-003 approval (see §11) and R5 GPU-backend evidence in round 2 (see §12).
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

1. **ChatGPT:** re-review of ST2-003 after the correction round (§11; Section 6 report in `AGENT_COLLABORATION.md`).
2. **Owner:** run the device checklist (Mac mini + phone); decide D-207, D-210, rendering direction.
3. After owner acceptance of Stage 2: Stage 3 authorization remains a separate owner decision (not requested here).

## 11. Correction round — R1–R4 (2026-11-13, post-review)

Trigger: `docs/ST2-003_TECHNICAL_REVIEW.md` (`CHANGES_REQUESTED`). All four findings were corrected inside the existing owner approval; no new start approval was requested, no Stage-3/M1 work, no decision gate was closed.

### 11.1 R1 — device-checklist / plan paths (blocking) → fixed

- All `spikes/ST2-003-*` references replaced with the real directories (`st2003/c-vfx/`, `st2003/d-input/`, `st2003/e-save/`, `st2003/f-perf/`) in `docs/STAGE2_DEVICE_TEST_CHECKLIST.md`, `docs/STAGE2_MASTER_EXECUTION_PLAN.md` §9, `docs/TECH_ARCHITECTURE.md`, root `README.md` and the migration comments in `src/**`.
- The checklist now contains a complete copy-pasteable sequence (clone → `cd` → `npm ci` → `npm run build` → `npm run preview`) per directory.
- Ports were **fixed in code** (`--strictPort`) and then verified by actually starting each preview: `4176` f-perf, `4173` c-vfx, `4174` d-input, `4175` e-save, `4170` formal skeleton. Raw log: `evidence/correction-2026-11-13/preview-ports.log` (each entry: HTTP 200, served `<title>`, and the server's own "Local:" line confirming the port).

### 11.2 R2 — `bindActionButton` listener lifecycle (blocking) → fixed

- `src/input/InputSystem.ts` now retains every bound element + handler in `boundButtons`; `dispose()` removes both `touchstart` and `mousedown`; `TouchAdapter` tracks and clears the pending 120 ms hold-release timer on dispose.
- Regression test: `npm run test:input` → `tests/input-regression.cjs` (compiled via `tsconfig.test.json`, DOM stubs, no new runtime dependency).
- Checks R2-1…R2-8: button intent fires once per press; after `dispose()` no intents and no listener callbacks are observed; a re-created instance receives exactly one intent (no duplicated listeners); a pending hold-release timer does not fire after dispose.

### 11.3 R3 — `touchcancel` clearing suspension (blocking) → fixed

- `InputSystem.route()` now changes `SystemState.suspended` only for `blur` (→true), `focus` (→false) and `visibility` (→`document.hidden`). `touchcancel` is input-release only and never touches suspension.
- Added a real `focus` recovery path in `KeyboardMouseAdapter` (previously only blur → suspend existed); `TouchAdapter.onTouchCancel` still releases the joystick and emits move 0.
- Checks R3-1…R3-9: blur→touchcancel stays suspended; hidden→touchcancel stays suspended; visibility recovery and blur→focus do resume; touchcancel alone does not suspend; joystick movement is still released on touchcancel.

### 11.4 R4 — D-207 quota / write-failure path (blocking for S2-E) → fixed and measured

- `st2003/e-save/src/main.ts` gained three assertions: **L6** fills storage down to <512 bytes of headroom, then attempts the temp-key write of a realistic ~2 KB save; **L6b** validates interrupted-write recovery preferring a valid `save_next`; **L6c** validates fallback to `save_main` when `save_next` is corrupt.
- Result (macOS HeadlessChrome 157.0.8103.51, WebGL2; GPU backend identified as `ANGLE Metal Renderer: Apple M1` — see §12): **11/11 PASS** — L6 observed `QuotaExceededError`, `save_next` absent, `save_main` read back intact (`gold=777`). Evidence: `st2003/e-save/evidence/results-chrome-macos.txt` + `shot-chrome-macos.png`.
- **Firefox / Firefox private: L6 NOT VERIFIED** — no Firefox on this machine; the historical 3-profile 8/8 results were produced with the earlier suite (no L6) and are left untouched. The UI prints `NOT VERIFIED` rather than PASS when quota cannot be triggered.

### 11.5 Regression re-run (macOS 15, Node 22.22.2, HeadlessChrome 157.0.8103.51, WebGL2 — see §12 for GPU backend)

> Scope note: these are **agent-automated headless runs**. They are not the project owner's A1–A10 device-checklist run and must not be read as one; the GPU backend is identified in §12, the device validation is not.

| Check | Result | Evidence |
|---|---|---|
| `npm ci` (clean) | ✅ 0 vulnerabilities | `evidence/correction-2026-11-13/npmci.log` |
| `npm audit` | ✅ 0 vulnerabilities | `…/npm-audit.log` |
| `npm run typecheck` | ✅ clean | `…/typecheck.log` |
| `npm run test:input` | ✅ 18/18 PASS | `…/input-regression.log` |
| `npm run build` | ✅ built in 1.16 s (expected chunk-size warning) | `…/build.log` |
| preview + Chrome smoke | ✅ HUD live, `projectiles live=1`, mock-save first-run, **0 pageerror** | `…/preview-smoke.log`, `…/preview-smoke.png` |

### 11.6 Honest notes from the correction round

1. L6 initially **failed twice** in this environment: the first version wrote a tiny temp payload into remaining headroom (no exception); the second stopped filling at the first oversized chunk. Both were test-design defects, fixed by decreasing chunk sizes until headroom < 512 B; the final run is a real `QuotaExceededError` observation, not a simulated one.
2. The smoke log contains one non-blocking `404` resource error (favicon); no `[pageerror]`.
3. The phrase “real GPU Chrome/macOS” as written in round 1 was **not backed by any committed artifact** — the browser log carried only the UA string. The claim is now substantiated with renderer/vendor evidence recorded inside the evidence files themselves (§12, correction R5), and the wording is restated precisely. The run is still desktop-only and headless: Mac-mini checklist items A1–A10 and phone items B1–B6 remain **OWNER_DEVICE_TEST_REQUIRED**.
4. Bundle remains unoptimized (chunk-size warning) — deliberate Stage-2 boundary.

### 11.7 Files changed in this round

Modified: `src/input/{InputSystem,KeyboardMouseAdapter,TouchAdapter,types}.ts`, `package.json`, `tsconfig.test.json` (new), `.gitignore` (new), `tests/input-regression.cjs` (new), `tests/prepare.cjs` (new), `st2003/{c-vfx,d-input,e-save,f-perf}/package.json` (preview ports), `st2003/e-save/src/main.ts`, `st2003/e-save/README.md`, `docs/STAGE2_DEVICE_TEST_CHECKLIST.md`, `docs/STAGE2_MASTER_EXECUTION_PLAN.md`, `docs/TECH_ARCHITECTURE.md`, `README.md`, this report, `docs/AGENT_COLLABORATION.md`. New evidence: `evidence/correction-2026-11-13/*`, `st2003/e-save/evidence/results-chrome-macos.txt`, `st2003/e-save/evidence/shot-chrome-macos.png`.

## 12. Correction round 2 — R5 GPU-backend evidence (2026-11-13, post-re-review)

Trigger: `docs/ST2-003_TECHNICAL_REVIEW.md` → “Remaining correction R5 — unsupported real-GPU claim”. R1–R4 were accepted in that re-review; R5 is the only open finding. No implementation change, no scope change, no decision gate touched, no Stage 3/M1 work.

### 12.1 Which option was taken

The review allowed either (a) reproducible GPU-backend evidence or (b) rewording to “macOS HeadlessChrome/WebGL2; GPU backend not independently verified.” A probe was run before editing anything, because (b) is only the honest wording when the backend genuinely cannot be identified. The probe identified the backend, so (a) is used — with (b) kept as the rule for any run that lacks the renderer string.

### 12.2 Measured backend

Recorded via `WEBGL_debug_renderer_info` **in the same browser session as the evidence runs** (not in a separate later probe):

| Field | Value |
|---|---|
| User agent | `HeadlessChrome/157.0.0.0` on macOS |
| Chrome build | `157.0.8103.51` |
| Launch configuration | `playwright-core 1.49.1` → `chromium.launch({ channel: 'chrome', headless: true })`; viewport 1280×1000 (S2-E suite) / 1280×800 (smoke) |
| WebGL version | `WebGL 2.0 (OpenGL ES 3.0 Chromium)` |
| `UNMASKED_VENDOR_WEBGL` | `Google Inc. (Apple)` |
| `UNMASKED_RENDERER_WEBGL` | `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)` |
| `MAX_TEXTURE_SIZE` | `16384` |
| Host identity (probe) | `Model Name: Mac mini` · `Model Identifier: Macmini9,1` · `Chip: Apple M1` · `Memory: 8 GB` · `macOS 15` |
| Host GPU (independent of the browser) | `system_profiler SPDisplaysDataType` → `Chipset Model: Apple M1` · `Vendor: Apple (0x106b)` · `Metal Support: Metal 3` |

`ANGLE Metal Renderer: Apple M1` is ANGLE's Metal backend on the integrated Apple GPU. A fallback renderer reports differently (`ANGLE (Google, … SwiftShader …)` for Chromium's software path, `llvmpipe` in the Linux sandbox), so these strings do distinguish hardware from software rasterization.

Artifacts:
- `evidence/correction-2026-11-13/gpu-backend-probe.txt` — standalone probe: Chrome build, launch config, renderer/vendor, host identity, display profiler output.
- `st2003/e-save/evidence/results-chrome-macos.txt` — suite log; header now carries UA, Chrome build, launch config, WebGL version, vendor, renderer, `MAX_TEXTURE_SIZE` and host identity, so the GPU path is inside the evidence file itself.
- `evidence/correction-2026-11-13/preview-smoke.log` — smoke log with `webgl_renderer=` line.

### 12.3 What this establishes, and what it does not

- **Establishes:** the automated Chrome sessions that produced the 11/11 storage results and the smoke log rendered through the Apple M1 GPU (ANGLE/Metal), not a software rasterizer.
- **Does not establish:** the project owner's Mac mini device validation. These are **agent-automated headless runs**; the relationship between the run host and the owner's checklist machine is not established by these artifacts. Nothing here substitutes for `docs/STAGE2_DEVICE_TEST_CHECKLIST.md` A1–A10 (interactive window, on-screen output, frame pacing, input latency) or B1–B6 (physical phones). Both remain `OWNER_DEVICE_TEST_REQUIRED`. The test is described as “automated headless Chrome on a Mac mini host”, never as the owner's device run.
- **Does not establish:** any performance conclusion. GPU identity is recorded for the storage/smoke evidence only; D-210 numbers remain PROVISIONAL and were measured under software rendering (SwiftShader / llvmpipe) in the sandbox.

### 12.4 Wording changes

- Every unqualified “real GPU Chrome/macOS” / “真机 GPU” phrase removed from `docs/STAGE2_FINAL_REPORT.md` (§11.4, §11.6), `docs/AGENT_COLLABORATION.md` (Section 6 round-1 report, Section 9 change log), `st2003/e-save/README.md` (results table, L6 row, conclusions, limits) and the regenerated evidence headers.
- Replacement is the measured form: “macOS HeadlessChrome 157 / WebGL2 — ANGLE Metal (Apple M1), agent-automated; not owner device validation”.
- Runs that never recorded a renderer string (historical Firefox/llvmpipe 8/8, sandbox Chromium/SwiftShader) keep their software-rendering disclosure; any future run without the renderer string must use the review's fallback wording verbatim: **“macOS HeadlessChrome/WebGL2; GPU backend not independently verified.”**

### 12.5 Re-run of the evidence chain after the artifact change

| Check | Result | Evidence |
|---|---|---|
| `st2003/e-save` `npm ci` | ✅ 0 vulnerabilities | `evidence/correction-2026-11-13/round2/e-save-npmci.log` |
| `st2003/e-save` `npm run build` | ✅ built in 324 ms | `…/round2/e-save-build.log` |
| S2-E suite (HeadlessChrome 157, ANGLE Metal/Apple M1) | ✅ **11/11 PASS**; L6 `QuotaExceededError`, `save_next` absent, `save_main` intact `gold=777` | `st2003/e-save/evidence/results-chrome-macos.txt` |
| root `npm ci` / `npm audit` | ✅ 0 vulnerabilities | `…/round2/root-npmci.log`, `…/round2/npm-audit.log` |
| `npm run typecheck` / `npm run test:input` | ✅ clean / **18/18 PASS** | `…/round2/typecheck.log`, `…/round2/input-regression.log` |
| root `npm run build` | ✅ built in 1.16 s | `…/round2/root-build.log` |
| preview smoke on :4170 | ✅ HUD live, `projectiles live=1`, mock-save first-run, **0 pageerror** (one non-blocking favicon 404) | `evidence/correction-2026-11-13/preview-smoke.log` |

No source code changed in this round, so round-1 logs (same code) remain valid and are kept alongside the round-2 logs. The round-1 storage artifact is preserved unchanged as `st2003/e-save/evidence/results-chrome-macos-r4.txt`.

### 12.6 Files changed in round 2

`docs/STAGE2_FINAL_REPORT.md`, `docs/AGENT_COLLABORATION.md`, `st2003/e-save/README.md`; regenerated `st2003/e-save/evidence/results-chrome-macos.txt` + `shot-chrome-macos.png`; new `st2003/e-save/evidence/results-chrome-macos-r4.txt`, `evidence/correction-2026-11-13/gpu-backend-probe.txt`, `evidence/correction-2026-11-13/round2/*.log`; regenerated `evidence/correction-2026-11-13/preview-smoke.log` + `.png`. **No source-code change.**
