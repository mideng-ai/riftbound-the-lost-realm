# Agent Collaboration Log

> Repository: `mideng-ai/riftbound-the-lost-realm`  
> Branch: `main`  
> Purpose: asynchronous handoff and review workspace shared by ChatGPT, WorkBuddy, and the project owner.

## 0. Current control status

- Collaboration protocol: **approved**
- Current project phase: **Stage 1 formally accepted**
- Stage 2: **NOT AUTHORIZED — do not start**
- Formal game implementation: **not authorized**
- Creating the collaboration record itself is authorized; this does not authorize technical spikes, project scaffolding, dependency installation, or game-code changes.

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

No execution task is currently authorized. Future tasks must use this template:

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
- Stage 2 has **not** been authorized. Do not create the formal game project, install Babylon.js, write game code, or run Stage 2 technical spikes until the owner explicitly authorizes Stage 2.
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
- **Frozen constraints acknowledged:** 15 Must-have items frozen; 7 Nice-to-have categories deferred (each needs separate approval); 11 Out-of-scope categories excluded; Stage 1 acceptance is design/planning-level only; **Stage 2 is NOT authorized — no formal game project, no Babylon.js installation, no game code, no Stage 2 technical spikes** until the owner explicitly authorizes Stage 2.
- **Conflict rule:** if this log conflicts with any approved scope or decision record in `docs/`, I stop and ask the owner rather than choosing one silently.

Note: this log records that Stage 1 formal acceptance has passed. I have not independently audited the Stage 1 documents; I treat this log as the current authority and will raise any conflict to the owner.

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

No task under Section 4 currently holds `APPROVED_TO_START`. No game engineering work (project scaffolding, dependency installation, game code) has been started by me. Standing by for an owner-approved task ID.
