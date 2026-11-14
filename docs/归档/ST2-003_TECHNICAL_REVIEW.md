# ST2-003 ChatGPT Technical Review

> Date: 2026-11-13
> Task: ST2-003 — Stage 2 Remaining Work Master Execution
> Review result: **CHANGES_REQUESTED**
> Submitted status: READY_FOR_REVIEW
> Scope: review of current `main` deliverables, source files, raw test logs, execution report, and device checklist.

## Summary

The overall structure and evidence package are substantial. S2-C through S2-G have been delivered, the owner decision gates remain open, and the report does not claim Mac/phone real-device testing or Stage 3/M1 implementation. The submitted work is **not yet ready for technical approval** because the following defects and evidence gaps must be corrected within the existing ST2-003 approval.

## Findings requiring correction

### R1 — Device checklist paths do not match the repository (blocking)

`docs/STAGE2_DEVICE_TEST_CHECKLIST.md` instructs the owner to enter directories such as:

- `spikes/ST2-003-F-PERF`
- `spikes/ST2-003-C-VFX`
- `spikes/ST2-003-D-INPUT`
- `spikes/ST2-003-E-SAVE`

The actual directories on `main` are `st2003/f-perf/`, `st2003/c-vfx/`, `st2003/d-input/`, and `st2003/e-save/`. The commands as written will fail. The checklist also describes cloning but does not provide a complete, correct checkout/working-directory sequence. The master plan §9 still lists the old `spikes/ST2-003-*` paths, while the report and repository use `st2003/*`.

**Required:** correct every path in the device checklist, master plan, and relevant README/comments; provide a copy-pasteable sequence from repository checkout to each preview server. Verify each command against the actual directory names and ports. Do not mark any real-device result complete.

### R2 — InputSystem.dispose() leaks action-button DOM listeners (blocking)

In `src/input/InputSystem.ts`, `bindActionButton()` registers anonymous `touchstart` and `mousedown` callbacks on DOM elements. Their references are not retained and `dispose()` does not remove them. This contradicts the `InputSystemFacade.dispose()` contract (“release all listeners/DOM hooks”). Recreating or disposing the input system can leave stale callbacks firing against an old instance.

**Required:** retain each bound element and callback (and any outstanding timeout if applicable), remove all listeners during dispose, and add a regression test proving that button events no longer reach the disposed instance and do not duplicate after re-attach.

### R3 — touchcancel can incorrectly clear the global suspended state (blocking)

`TouchAdapter.onTouchCancel()` emits `{ kind: 'suspend', reason: 'touchcancel', suspended: false }`. `InputSystem.route()` currently treats this as a system resume and sets `system.suspended = false`. A touch cancellation is an input-release event, not proof that the window regained focus or the page became visible. It must not override a blur/hidden suspension.

**Required:** separate touch/gesture cancellation from focus/visibility state transitions. Only the actual focus/visibility recovery path may clear `SystemState.suspended`. Add tests for blur → touchcancel (must remain suspended), hidden → touchcancel (must remain suspended), and actual visibility/focus recovery (may resume).

### R4 — D-207 quota/write-failure handling is not actually validated (blocking for S2-E acceptance)

The raw storage logs show eight PASS assertions, but quota observations are recorded as `INFO` (L4/I4), not PASS. The localStorage experiment observes a QuotaExceededError after approximately 4 MB; it does not assert application-level failure handling or prove that an existing valid save remains recoverable after a failed write. The recommended temporary-key recovery protocol is described but not tested.

**Required:** keep the eight existing PASS assertions accurately labeled, and add a reproducible failure-path test that fills storage to trigger QuotaExceededError, attempts a save, verifies the previous valid save remains intact/readable, and records the exact recovery behavior. If a browser cannot reliably trigger quota in automation, label that specific part as NOT VERIFIED rather than PASS. Do not choose or wire the production backend; D-207 remains owner-reserved.

## Items accepted as correctly disclosed (no correction required)

- S2-C lightweight/rich VFX comparison, disposal/leak experiment, and provisional pooling recommendation are useful Spike evidence. Software-rendering timings are not real-GPU performance claims.
- S2-D desktop automation and synthetic touch tests are correctly distinguished from physical phone tests.
- S2-F software-rendering measurements are clearly separated and all proposed budgets remain PROVISIONAL.
- S2-G uses Babylon.js + TypeScript + Vite, exact direct dependency pins and a lockfile; D-207 uses a mock adapter; rendering and D-210 values remain provisional.
- Integration regression evidence records Linux Firefox/llvmpipe, a WebGL debug deprecation warning, and a successful build/typecheck/audit/smoke sequence. No real Mac GPU, physical phone, or Babylon WebGPU engine result is claimed.
- No Stage 3/M1 gameplay work or scope expansion was identified in the reviewed entry point and bootstrap scene.

## Decision and next status

**ST2-003 remains `CHANGES_REQUESTED`.** These corrections are within the already approved ST2-003 scope; no new owner start approval is required. WorkBuddy should correct the four findings, add raw logs/tests, update the final report and device instructions, then resubmit as `READY_FOR_REVIEW`.

This review is not owner acceptance, does not close Stage 2, does not decide D-207/D-210/rendering direction, and does not authorize Stage 3/M1. The owner must still execute the Mac mini and physical-phone checklist before any real-device compatibility/performance conclusion can be made.


## Re-review — correction round 1 (2026-11-13)

- **R1:** PASS. Device checklist and master plan now use the actual `st2003/*` paths. Preview-port evidence records HTTP 200 and the server's confirmed ports 4173–4176.
- **R2:** PASS. Bound action-button handlers are retained and removed on dispose; touch hold-release timer is cleared. Regression log records R2-1…R2-8 passing.
- **R3:** PASS. `InputSystem.route()` changes suspension only for blur/focus/visibility. Regression log records blur→touchcancel and hidden→touchcancel remaining suspended, plus valid focus/visibility recovery.
- **R4:** PASS for the tested Chrome profile. L6 records an actual `QuotaExceededError`, absence of `save_next`, and intact `save_main` readback; L6b/L6c recovery assertions pass. Firefox/private and physical-mobile L6 remain unverified and are disclosed as such.
- **Build/regression evidence:** clean `npm ci` (0 vulnerabilities), `npm audit` (0 vulnerabilities), typecheck, input tests (18/18), production build, and preview smoke (0 pageerrors) are recorded. A favicon 404 and chunk-size warning remain disclosed.

### Remaining correction R5 — unsupported real-GPU claim

The correction report §11.6 says the new Chrome/macOS evidence is **“real GPU Chrome/macOS”**. The committed browser log identifies the user agent as `HeadlessChrome/157` and records WebGL behavior, but the evidence reviewed does not include a WebGL renderer/vendor string, `chrome://gpu` report, or another artifact establishing that the browser used the Mac's physical GPU rather than a software/virtualized renderer. The device checklist also continues to mark the Mac mini's A1–A10 real-device run as `OWNER_DEVICE_TEST_REQUIRED`.

**Required:** either add reproducible GPU-backend evidence (renderer/vendor plus the host/device identity and launch configuration), or change the report wording to “macOS HeadlessChrome/WebGL2; GPU backend not independently verified.” Do not describe this as the owner's Mac mini validation unless that exact device is evidenced. This is a reporting/evidence correction; no new implementation or owner start approval is needed.

**Current review status: `CHANGES_REQUESTED` (R5 only).** R1–R4 are accepted. Once R5 is corrected, resubmit the report as `READY_FOR_REVIEW` for final technical sign-off. Real Mac mini and physical-phone tests remain owner-required; they are not a blocker to closing the ST2-003 agent execution task if the report keeps them explicitly pending, but they remain a blocker to claiming complete real-device validation or setting device-dependent Stage 2 acceptance criteria as passed.

This re-review does not constitute owner acceptance or authorize Stage 3/M1.


## Final technical sign-off — correction round 2 (2026-11-13)

- **R5:** PASS. The committed probe and same-session test artifacts record `UNMASKED_RENDERER_WEBGL=ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)`, host identity `Macmini9,1 / Apple M1 / 8 GB`, macOS display-profiler output showing Apple M1 and Metal 3, and the Playwright Chrome headless launch configuration. The storage-suite and preview-smoke logs carry the renderer identity in the same sessions as their results.
- The report now accurately describes these as **agent-automated headless Chrome runs on a Mac mini host using ANGLE/Metal (Apple M1)**, not as the project owner's interactive A1–A10 device validation.
- **R1–R4:** remain PASS from correction round 1.
- **Build/regression evidence:** reviewed round-2 clean install, audit, typecheck, 18/18 input regression, production build, preview smoke, and S2-E 11/11 storage suite. Known non-blocking favicon 404 and chunk-size warning remain disclosed.
- **Technical review result: `REVIEW_PASSED` for ST2-003 execution deliverables.**

### Boundaries after technical sign-off

1. This is ChatGPT technical sign-off only. **The project owner has not yet formally accepted ST2-003 or Stage 2.**
2. Mac mini interactive checklist A1–A10 and physical-phone checklist B1–B6 remain `OWNER_DEVICE_TEST_REQUIRED`; the automated headless run does not replace them.
3. D-207 storage backend, D-210 performance budget, and final rendering direction remain OPEN and require explicit owner decisions. The current localStorage recommendation, performance numbers, and GLSL toon path remain recommendations/provisional.
4. Stage 2 is not yet owner-accepted or closed. Stage 3/M1 remains unauthorized and must not begin without separate explicit owner authorization.
