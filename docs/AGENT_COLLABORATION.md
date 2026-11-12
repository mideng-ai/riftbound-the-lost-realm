# Agent Collaboration Log

> Repository: `mideng-ai/riftbound-the-lost-realm`  
> Branch: `main`  
> Purpose: asynchronous handoff and review workspace shared by ChatGPT, WorkBuddy, and the project owner.

## 0. Current control status

- Collaboration protocol: **approved**
- Current project phase: **Stage 2 authorized and in progress; Stage 1 formally accepted**
- Stage 2: **AUTHORIZED — in progress**
- Formal Stage 2 engineering and technical spikes: **authorized only under individually approved task scopes**
- Stage 3 / M1 gameplay implementation: **not authorized**
- Stage 2 phase authorization does not by itself authorize a specific WorkBuddy task; task-specific approval is required. ST2-001 has now received that approval. Stage 3 / M1 gameplay implementation remains unauthorized.

**Hard gate:** WorkBuddy must not execute a task unless this document contains an explicit owner approval for that exact task, identified by task ID, with status `APPROVED_TO_START`. A general approval of this collaboration process is not task approval. ChatGPT may draft tasks and review results, but cannot grant owner approval. If approval is absent, ambiguous, expired, or does not match the task ID and scope, stop and ask the owner.

## 1. Roles and authority

### Project owner
- Owns scope, priorities, approvals, and final acceptance.
- Reviews each proposed task and explicitly authorizes its start.
- May pause, reject, revise, or cancel work at any time.
- Only the owner can authorize entry into a new project phase.

### ChatGPT — planning and review
- Converts approved project requirements into small, testable task instructions.
- Records task objectives, scope boundaries, implementation guidance, and acceptance criteria.
- Reviews WorkBuddy's reports and evidence; requests corrections where needed.
- Proposes the next task only after the current task has been reviewed.
- Must not mark owner approval as granted or start implementation without it.

### WorkBuddy — execution and reporting
- Reads this document before starting work and checks the task's approval status.
- Executes only the exact scope approved by the owner.
- Reports changed files, commit identifiers, commands, test results, failures, and unresolved risks.
- Does not expand scope, silently make product decisions, or begin dependent tasks without separate approval.
- If blocked or if requirements conflict, stops and records the issue instead of guessing.

## 2. Mandatory workflow

1. **Draft:** ChatGPT adds a task under “ChatGPT → WorkBuddy tasks” with status `DRAFT`.
2. **Owner review:** The owner reviews the task and either requests changes, rejects it, or adds an explicit approval entry for that task ID.
3. **Execution:** WorkBuddy verifies the exact approval entry and then performs only the approved work.
4. **Report:** WorkBuddy fills in the matching execution report, links commits/files, and records actual test evidence. It sets the task to `READY_FOR_REVIEW`.
5. **Review:** ChatGPT inspects the report and available repository changes, then records `REVIEW_PASSED`, `CHANGES_REQUESTED`, or `BLOCKED`, with reasons.
6. **Owner acceptance:** The owner decides whether the result is accepted and whether another task may start. Acceptance of a result does not automatically approve the next task.

Do not overwrite or erase previous reports or approval records. Append dated updates and preserve the audit trail.

## 3. Status definitions

| Status | Meaning |
|---|---|
| `DRAFT` | Proposed by ChatGPT; not approved; do not execute |
| `CHANGES_REQUESTED` | Owner or reviewer requires edits; do not execute |
| `APPROVED_TO_START` | Owner explicitly approved this exact task ID and scope |
| `IN_PROGRESS` | WorkBuddy has started an approved task |
| `READY_FOR_REVIEW` | WorkBuddy says execution is complete and evidence is recorded |
| `CHANGES_REQUESTED_BY_REVIEW` | ChatGPT review found issues; correction requires the existing approval scope or a new owner approval if scope changes |
| `REVIEW_PASSED` | ChatGPT found the submitted evidence meets the task's criteria |
| `OWNER_ACCEPTED` | Owner accepted the task result |
| `BLOCKED` | Work cannot safely continue; owner decision or missing dependency required |
| `CANCELLED` | Owner cancelled the task |

## 4. ChatGPT → WorkBuddy tasks

ST2-001 is approved to start. Its exact scope and approval are recorded in Section 11.2 and Section 5. Future tasks must use this template:

### [TASK-ID] Task title

- **Status:** `DRAFT`
- **Created:** YYYY-MM-DD
- **Objective:**
- **Background / references:**
- **Exact scope:**
- **Out of scope:**
- **Instructions:**
- **Files expected to change:**
- **Acceptance criteria:**
- **Required verification / tests:**
- **Risks and stop conditions:**
- **Owner approval:** Not granted

## 5. Owner approvals

Only the project owner may add an approval entry. Approval must be explicit and tied to a task ID and the exact task scope.

### Approval record template

- **Task ID:**
- **Decision:** `APPROVED_TO_START` / `REJECTED` / `CHANGES_REQUESTED`
- **Approved scope (must match the task):**
- **Approved by:** Project owner
- **Date:**
- **Conditions / limits:**

An approval for one task does not approve another task, a broader scope, or a later project phase.

## 6. WorkBuddy → ChatGPT execution reports

WorkBuddy must append a report under the matching task ID:

### [TASK-ID] Execution report

- **Execution status:** `IN_PROGRESS` / `READY_FOR_REVIEW` / `BLOCKED`
- **Started / completed:** YYYY-MM-DD / YYYY-MM-DD
- **Approval record checked:**
- **Work performed:**
- **Files changed:**
- **Commits / pull requests:**
- **Commands run:**
- **Tests and actual results:**
- **Screenshots / logs / other evidence:**
- **Known issues / deviations:**
- **Scope changes:** None, or explain and STOP for owner approval
- **Next action requested:**

Never claim a test passed unless it was actually run. Distinguish “not run”, “failed”, and “passed”.

## 7. ChatGPT review records

### [TASK-ID] Review

- **Review date:**
- **Decision:** `REVIEW_PASSED` / `CHANGES_REQUESTED` / `BLOCKED`
- **Evidence inspected:**
- **Acceptance criteria results:**
- **Issues found:**
- **Required corrections:**
- **Recommendation to owner:** Accept / request changes / hold

ChatGPT review is a technical recommendation, not owner acceptance.

## 8. Frozen project constraints

The following scope decisions remain binding:
- 15 **Must-have** items are frozen: do not add or remove items.
- 7 **Nice-to-have** categories are deferred by default. They may be considered only after all Must-have items are complete, and each requires separate owner approval.
- 11 **Out of scope** categories are excluded from the first release unless the owner explicitly approves a scope change and the governing project documents are updated.
- Stage 1 formal acceptance has passed.
- Stage 2 was explicitly authorized by the owner on 2026-11-12. Stage 2 technical spikes and engineering may proceed only within a task-specific owner approval recorded in Section 5. Stage 3 / M1 gameplay implementation remains unauthorized.
- Stage 1 acceptance is a design/planning acceptance, not evidence that the game has been implemented or runtime-tested.

For detailed product decisions and requirements, consult the current authoritative project documents in `docs/`. If this collaboration log conflicts with an approved scope or decision record, stop and ask the owner rather than choosing one silently.

## 9. Change log

- 2026-11-12 — Created the shared asynchronous collaboration protocol. The protocol is approved; no Stage 2 task or implementation work is authorized by this entry.
- 2026-11-12 — WorkBuddy onboarding: read the protocol from `main`, confirmed read/update access via the GitHub REST API, and recorded its understanding, verified capabilities, and permission limits in Section 10. No execution task started; no task ID currently holds `APPROVED_TO_START`.

## 10. WorkBuddy onboarding feedback

> **Recorded:** 2026-11-12
> **Trigger:** explicit owner instruction (2026-11-12) to read this document and record feedback. This is an onboarding record only — it is not task approval and authorizes no implementation work.

### 10.1 Understanding of the protocol (confirmed read)

- **Hard gate:** I will not execute any task unless this document contains an explicit owner approval entry with status `APPROVED_TO_START` for that exact task ID and scope. Approval of the collaboration process itself is not task approval; ChatGPT cannot grant approvals. If an approval is absent, ambiguous, expired, or mismatched with the task ID/scope, I stop and ask the owner.
- **Workflow:** `DRAFT` (ChatGPT) → owner approval entry (Section 5 template) → execution strictly within approved scope → execution report with evidence (Section 6 template, `READY_FOR_REVIEW`) → ChatGPT review record → owner acceptance. Acceptance of one result does not authorize the next task or a broader scope.
- **Audit trail:** append dated updates only; never overwrite or erase previous reports, approvals, or review records.
- **Evidence honesty:** never claim a test passed unless it was actually run; distinguish "passed" / "failed" / "not run"; report commands, commits, files, failures, and unresolved risks as-is.
- **Frozen constraints acknowledged:** 15 Must-have items frozen; 7 Nice-to-have categories deferred (each needs separate approval); 11 Out-of-scope categories excluded; Stage 1 acceptance was design/planning-level only. At the time of this onboarding feedback (2026-11-12), Stage 2 had not yet been authorized; that historical status was superseded by the owner's later Stage 2 authorization recorded in Section 11.
- **Conflict rule:** if this log conflicts with any approved scope or decision record in `docs/`, I stop and ask the owner rather than choosing one silently.

Note: this log records that Stage 1 formal acceptance has passed. I have not independently audited the Stage 1 documents; I treat the approved project documents as authoritative and will raise any conflict to the owner.

### 10.2 Confirmed capabilities (verified in this environment)

- **Read and update this document and any repo file on `main`** via the GitHub REST API (`api.github.com`). This entry itself is the write confirmation; the commit SHA is reported to the owner in chat.
- View repository file lists, commit history, and per-commit changed files via the same API.
- Operate a Linux sandbox (Node.js / npm / Python / Git CLI available) for document diffs, link and license verification (HTTP fetching + content comparison), and general non-game-engineering work.
- Produce deliverable files visible to the owner (workspace files, self-check reports, etc.).

### 10.3 Current permission and environment limits

- The sandbox blocks direct `github.com` git traffic; only `api.github.com` is reachable. Commits are therefore made **file-by-file via the Contents API** — no native `git push`, no multi-file atomic commit, no branch/PR creation via git. Each file update is its own commit, which suits the one-task-one-file-report audit style of this protocol.
- The project net-drive (tdrive) sync channel is currently unavailable; **GitHub `main` is the sole baseline**. Historical doc versions are preserved both in Git history and local backups.
- `itch.io` domains are unreachable from this environment; KayKit page license labels must be verified by the owner locally (as recorded in `docs/STAGE0_SELF_CHECK_REPORT.md`).
- I cannot run anything on the owner's Mac mini; local machine checks remain owner-side actions.
- I will never add or modify entries in Section 5 (owner approvals) — that section is owner-only by protocol.
- Onboarding honesty note: my reports distinguish sandbox-executed results from owner-machine results; I do not present sandbox verification as local-machine verification.

### 10.4 Current status

Stage 2 is authorized. The owner explicitly approved ST2-001 on 2026-11-12 with the message: “我批准 ST2-001，允许 WorkBuddy 按 GitHub 文档中的准确范围开始执行。” The approval is recorded in Section 5. WorkBuddy may execute only the exact ST2-001 scope described in Section 11.2 and `STAGE2_TECH_SPIKE_PLAN.md` Section 7. Stage 3 / M1 gameplay work is not authorized.


## 11. Stage 2 authorization and first task

> **Recorded:** 2026-11-12  
> **Owner instruction:** “开始第二阶段吧。”  
> **Meaning:** Stage 2 (Technical Foundation) is explicitly authorized and has started. This phase authorization does not bypass task-specific approval for WorkBuddy.

### 11.1 Stage 2 control status
- Stage 1: formally accepted and closed.
- Stage 2: **AUTHORIZED / IN PROGRESS**.
- Stage 3 and M1 gameplay implementation: not authorized.
- Stage 2 technical planning and spike design may proceed.
- WorkBuddy may execute only a task with a matching task ID, exact scope, and owner approval entry in Section 5.

### 11.2 First approved task

#### ST2-001 — Babylon.js baseline rendering and build compatibility Spike
- **Status:** `APPROVED_TO_START` — owner approved on 2026-11-12; exact scope only.
- **Plan:** `docs/STAGE2_TECH_SPIKE_PLAN.md`, Section 7.
- **Scope:** isolated disposable Vite + TypeScript + Babylon.js spike; minimal 3D scene and top-down camera; WebGL2 verification; optional WebGPU capability probe; dev server and production build verification.
- **Out of scope:** formal game project architecture, gameplay code, full input system, cartoon-rendering decision, spell VFX, save implementation, performance-budget decision, and Stage 3 work.
- **Acceptance criteria:** clean dependency install, browser 3D scene render, successful production build, exact versions and reproducible logs/screenshots, honest environment/untested notes.
- **Owner approval:** Granted on 2026-11-12; see the owner approval record in Section 5.


### Approval record — ST2-001

- **Task ID:** ST2-001
- **Decision:** `APPROVED_TO_START`
- **Approved scope:** The exact scope, exclusions, acceptance criteria, and stop conditions in `docs/STAGE2_TECH_SPIKE_PLAN.md`, Section 7, and the matching task entry in Section 11.2 of this document. No scope expansion.
- **Approved by:** Project owner
- **Date:** 2026-11-12
- **Source:** Explicit owner message in ChatGPT: “我批准 ST2-001，允许 WorkBuddy 按 GitHub 文档中的准确范围开始执行。”
- **Conditions / limits:** Isolated disposable Spike only. Do not create the formal game project or implement gameplay. Do not decide cartoon rendering, spell VFX, input architecture, D-207, or D-210 as part of this task. Stop and report if the task cannot be completed within the approved scope.
- **Record transcription:** This entry transcribes the owner's explicit approval; ChatGPT is not granting approval on the owner's behalf.
