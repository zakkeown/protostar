# Requirements: Protostar Factory

**Defined:** 2026-04-26
**Core Value:** Excise humans from everything except intent capture and final evidence review — the factory plans, builds, verifies, and ships software autonomously, ringing a human only on hard failures.

**Ordering principle (locked 2026-04-26):** *Admit safely, authorize narrowly, mutate carefully, review relentlessly, deliver only after proof.*

## v1 Requirements (Dark-Factory v1)

Requirements grouped by the 10-phase ordering. Each maps to exactly one phase.

### Phase 1 — Intent + Planning Admission

Front-door hardening. No weak intent or bad plan reaches execution.

- [ ] **INTENT-01**: Ambiguity gate (≤0.2 threshold) blocks any draft above threshold and produces an evidence-bearing `clarification-report.json`
- [ ] **INTENT-02**: `promoteIntentDraft` admission decision is the only path to `ConfirmedIntent`; no test or CLI bypass exists
- [ ] **INTENT-03**: Acceptance criteria normalization is contract-tested end-to-end (draft → confirmed → downstream stages observe identical AC)
- [ ] **PLAN-A-01**: Every candidate plan from any source (fixture or pile) flows through `parsePlanningPileResult` → `admitCandidatePlans` → `assertAdmittedPlanHandoff`
- [ ] **PLAN-A-02**: Pre-admission failure (parse error, all candidates rejected, missing AC coverage) writes a no-plan-admitted artifact and refuses to advance
- [ ] **PLAN-A-03**: `pnpm run verify` runs every package's tests (`policy`, `planning`, `execution`, `review`, `evaluation`, `delivery`, `artifacts`, `repo`, `dogpile-adapter`, `intent`, `factory-cli`) — admission contracts cannot regress silently

### Phase 2 — Authority + Governance Kernel

Settle precedence before any real mutation.

- [x] **GOV-01**: Precedence order is documented and enforced: confirmed intent ⟶ policy ⟶ repo instructions ⟶ operator settings; conflicts produce explicit deny/allow with evidence
- [x] **GOV-02**: Capability envelope (`intent.capabilityEnvelope`) is enforced at every authority boundary (workspace ops, network, subprocess, budget) — not just stored
- [x] **GOV-03**: Steward/owner boundary: each artifact has a single owning package; cross-stage reads go through admission helpers (no private-state reach-back)
- [x] **GOV-04**: `WorkspaceRef.trust` is consumed (not just declared) — `executionScope: "workspace"` grants are refused when trust ≠ `"trusted"`
- [x] **GOV-05**: Admission decisions ("allow" / "block" / "escalate") are persisted as `admission-decision.json` for every gate, not only the intent gate
- [x] **GOV-06**: Signed/admitted intent posture: `ConfirmedIntent` carries an admission signature (hash of intent + policy snapshot at admission time) that downstream stages verify before acting

### Phase 3 — Repo Runtime + Sandbox

Make the repo boundary real. This is where the dark factory starts touching matter.

- [x] **REPO-01**: Target repo registration — `defineWorkspace` accepts a `RepoTarget` (URL + credential ref) and produces a verified `WorkspaceRef`
- [x] **REPO-02**: Workspace snapshot / branch creation is implemented in `packages/repo` (clone, checkout, branch from base SHA)
- [x] **REPO-03**: File read/write caps enforced per `capabilityEnvelope` — paths outside the workspace are refused at the `repo` layer
- [x] **REPO-04**: Command caps — subprocess invocations go through a `repo`-owned runner with allowlist + arg validation (no shell strings)
- [x] **REPO-05**: Patch application + rollback — `applyChangeSet` is atomic; failure restores prior worktree state
- [x] **REPO-06**: Dirty-worktree handling — refuses to operate on uncommitted changes unless explicitly allowed by capability envelope
- [x] **REPO-07**: `workspaceRoot` resolved deterministically by walking up to `pnpm-workspace.yaml` (no `INIT_CWD`/`cwd()` reliance)
- [x] **REPO-08**: `@dogpile/sdk` is installable on a fresh-clone machine (published, vendored, or pinned tarball) — sibling `link:` removed
- [x] **REPO-09**: `.env.example` documents every env var (LM Studio endpoint, GitHub PAT, model names) before secrets are referenced

### Phase 4 — Execution Engine

Upgrade dry-run execution into a real, boring, deterministic task runner.

- [ ] **EXEC-01**: Task state machine: `pending → running → succeeded | failed | timeout | cancelled` with persisted transitions
- [ ] **EXEC-02**: Command / tool adapters live behind a typed `ExecutionAdapter` interface (LM Studio coder model is the first adapter)
- [ ] **EXEC-03**: LM Studio coder adapter (Qwen3-Coder-Next-MLX-4bit, OpenAI-compatible API) produces a real diff against the workspace
- [ ] **EXEC-04**: Provider-abstracted execution — adding a second OpenAI-compatible endpoint requires no contract change
- [ ] **EXEC-05**: Evidence capture — each task writes `task-<id>/stdout.log`, `stderr.log`, `evidence.json` to the run bundle
- [ ] **EXEC-06**: Retries with exponential backoff for transient adapter failures; capped per task by capability envelope
- [ ] **EXEC-07**: Timeout handling — per-task timeout enforced and logged as a typed failure
- [ ] **EXEC-08**: Resumable task journal — a crashed run can be resumed from the last persisted task state

### Phase 5 — Review → Repair → Review Loop

The central control loop. No delivery without an approved exit.

- [x] **LOOP-01**: Mechanical review runs first (build, lint, diff-touches-≤1-file for cosmetic archetype, AC presence)
- [x] **LOOP-02**: Model review runs second (semantic + consensus stages from Phase 8 plug in here)
- [x] **LOOP-03**: Repair plan generation — failed verdicts produce a typed `RepairPlan` consumed by execution
- [x] **LOOP-04**: Re-execution under repair plan emits the same lifecycle events; budget is shared with mechanical (`maxRepairLoops`, default N=3)
- [x] **LOOP-05**: Final gate — only `pass` from both mechanical and model review allows progression to delivery
- [x] **LOOP-06**: Budget exhaustion produces an evidence-bearing `block` verdict with all judge critiques captured

### Phase 6 — Live Dogpile Piles

Live piles behind strict schemas. Protostar remains authority; Dogpile supplies bounded opinions.

- [ ] **PILE-01**: `--planning-mode pile` invokes `planningPilePreset` against `@dogpile/sdk`; output flows through the existing planning admission path
- [ ] **PILE-02**: `reviewPilePreset` is invoked after mechanical review; output flows through review admission and composes with mechanical verdict
- [ ] **PILE-03**: `executionCoordinationPilePreset` is invoked when execution proposes work-slicing or repair-plan generation
- [ ] **PILE-04**: Pile output failure modes (timeout, schema parse error, all candidates rejected) produce the same no-admission artifacts as the fixture path
- [ ] **PILE-05**: Pile invocations carry the capability envelope's budget (max calls, max wall-clock); exhaustion fails the pile, not the run
- [ ] **PILE-06**: `dogpile-adapter` still has zero filesystem authority — invocations are owned by `apps/factory-cli`

### Phase 7 — Delivery

Real GitHub PR delivery. No auto-merge for v1.

- [ ] **DELIVER-01**: `packages/delivery` executes the built command (Octokit `@octokit/rest` + GitHub PAT from env) and returns a real PR URL
- [ ] **DELIVER-02**: Branch push uses the validated branch name (`^[a-zA-Z0-9._/-]+$`); PR title and body are validated separately
- [ ] **DELIVER-03**: PR body includes evidence bundle: PR URL, before/after screenshots (or Playwright trace path), 2-judge score sheet, mechanical-review summary, repair-loop history
- [ ] **DELIVER-04**: After PR creation, factory polls CI/status checks until they complete; status snapshot is captured into the run bundle
- [ ] **DELIVER-05**: Final delivery artifact (`delivery-result.json`) records PR URL, head/base SHA, CI verdict, and timestamps
- [ ] **DELIVER-06**: PR body filenames match the actual artifact list emitted by `runFactory` (no drift)
- [ ] **DELIVER-07**: No auto-merge — `merge` is an explicit operator action outside the factory for v1

### Phase 8 — Evaluation + Evolution

Formalize the Ouroboros-inspired loop. Evolve specs/plans before evolving code.

- [ ] **EVAL-01**: Mechanical eval stage produces deterministic numeric scores (build pass, lint clean, diff size, AC coverage)
- [ ] **EVAL-02**: Semantic eval stage calls a heterogeneous-local judge (e.g. Qwen3-Next-80B-A3B-MLX-4bit) against diff + AC and returns numeric scores
- [ ] **EVAL-03**: Consensus eval stage runs a second judge from a different model family when semantic confidence is below threshold; produces `pass`/`fail` using harsher-than-baseline rule (high mean AND high min)
- [x] **EVAL-04**: Stubbed `status: "skipped"` branches in `createEvaluationReport` are removed once mechanical + semantic + consensus are wired
- [x] **EVOL-01**: Ontology / spec convergence — `decideEvolution` reads the previous run's snapshot from disk and produces `continue` / `converged` / `exhausted`
- [x] **EVOL-02**: Evolution decision drives spec/plan refinement on the next run; core code evolution is gated behind explicit operator opt-in
- [x] **EVOL-03**: Convergence threshold is configurable and every run appends calibration evidence for Phase 10 empirical tuning; the ≥10-run empirical calibration itself is owned by DOG-04

### Phase 9 — Operator Surface + Resumability

CLI first. The product feel: walk away, come back, understand exactly what happened.

- [x] **OP-01**: `protostar-factory run` — start a new run from a draft or confirmed intent
- [x] **OP-02**: `protostar-factory status [--run <runId>]` — current state of a run or all runs (last N)
- [ ] **OP-03**: `protostar-factory resume <runId>` — pick up from the last persisted task journal entry
- [x] **OP-04**: `protostar-factory cancel <runId>` — cooperative cancel with cleanup
- [x] **OP-05**: `protostar-factory inspect <runId>` — pretty-print the run bundle (manifest, stage records, artifacts)
- [x] **OP-06**: `protostar-factory deliver <runId>` — explicit delivery trigger (when delivery is gated to operator action)
- [x] **OP-07**: Status / inspect output is non-decorative — JSON-stable so it's pipeable
- [ ] **OP-08**: Documented prune recipe (or `protostar-factory prune --older-than <duration>`) for `.protostar/runs/`

### Phase 10 — V1 Hardening + Dogfood

Run against the sacrificial sibling repo repeatedly. Build the fixture matrix. Then ship.

- [ ] **DOG-01**: Sibling Tauri+React+TypeScript repo (`../protostar-toy-ttt`) scaffolded via `create-tauri-app` and pushed as a fresh GitHub repo
- [ ] **DOG-02**: Fixture matrix — at least one passing run captured for each: `accepted`, `ambiguous`, `bad-plan`, `failed-execution`, `repaired-execution`, `blocked-review`, `pr-ready`
- [ ] **DOG-03**: First seed ("change primary button color and add a hover state") runs end-to-end against the toy repo with zero human input mid-loop
- [ ] **DOG-04**: ≥10 consecutive dogfood runs against the toy repo with ≥80% reaching `pr-ready`, including empirical convergence-threshold calibration from the appended Phase 8 calibration evidence
- [ ] **DOG-05**: Docs — README explains the run lifecycle, every CLI command, and the run-bundle schema
- [ ] **DOG-06**: Package hygiene — every package has a tested public surface, version pinned, no unused exports
- [ ] **DOG-07**: Release scripts — `pnpm release` builds, tests, tags, and produces a publishable artifact set (or documents why packages stay private)
- [ ] **DOG-08**: Security review — capability envelope enforcement audited; subprocess + filesystem + network paths reviewed; secret-handling reviewed

## Deferred (post-v1)

Tracked but out of the v1 roadmap.

### Architecture (Beyond v1)

- **POST-01**: Beads-style memory graph for cross-run context accumulation
- **POST-02**: Parallel wave execution (GSD-style) for multi-task seeds
- **POST-03**: Adaptive-by-risk judge panel sizing (trivial → 2, high-risk → 5+) with a "blast radius" formalism
- **POST-04**: Self-improvement loop — factory edits its own repo
- **POST-05**: Token-budget unit ($/GPU-hour) replaces today's repair-loop count

### Archetype Coverage (Beyond v1)

- **POST-06**: Wire `feature-add` archetype (currently `stub`)
- **POST-07**: Wire `refactor` archetype
- **POST-08**: Wire `bugfix` archetype
- **POST-09**: CLI error message distinguishes "archetype not yet wired" from "intent rejected on merits"

### Observability (Beyond v1)

- **POST-10**: Structured run-bundle index across runs (queryable manifest)
- **POST-11**: Prometheus / OTel emission for hard-failure rates, repair-loop occupancy, judge-disagreement frequency
- **POST-12**: Auto-merge mode (gated behind explicit operator opt-in)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Cloud / hosted LLM judges | Heterogeneous-local lock — no cloud cost, diverse failure modes |
| GUI intake / TUI wizard | Rebound away from 2026-04-22 design; CLI-only intake for v1 |
| 9-role agent architecture | Rebound away; domain packages, not roles |
| Daemon / always-on background process | Single-shot CLI invocation per Seed |
| Human progress logs during a run | Violates "dark except hard failures" autonomy line |
| Generic `utils` / `agents` / `factory` package | `AGENTS.md` rule — domain-first only |
| Auto-merge on PR-ready | v1 stops at PR creation; merge is operator action |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INTENT-01 | Phase 1 | Pending |
| INTENT-02 | Phase 1 | Pending |
| INTENT-03 | Phase 1 | Pending |
| PLAN-A-01 | Phase 1 | Pending |
| PLAN-A-02 | Phase 1 | Pending |
| PLAN-A-03 | Phase 1 | Pending |
| GOV-01 | Phase 2 | Complete |
| GOV-02 | Phase 2 | Complete |
| GOV-03 | Phase 2 | Complete |
| GOV-04 | Phase 2 | Complete |
| GOV-05 | Phase 2 | Complete |
| GOV-06 | Phase 2 | Complete |
| REPO-01 | Phase 3 | Complete |
| REPO-02 | Phase 3 | Complete |
| REPO-03 | Phase 3 | Complete |
| REPO-04 | Phase 3 | Complete |
| REPO-05 | Phase 3 | Complete |
| REPO-06 | Phase 3 | Complete |
| REPO-07 | Phase 3 | Complete |
| REPO-08 | Phase 3 | Complete |
| REPO-09 | Phase 3 | Complete |
| EXEC-01 | Phase 4 | Verified (human smoke pending) |
| EXEC-02 | Phase 4 | Verified (human smoke pending) |
| EXEC-03 | Phase 4 | Verified (human smoke pending) |
| EXEC-04 | Phase 4 | Verified (human smoke pending) |
| EXEC-05 | Phase 4 | Verified (human smoke pending) |
| EXEC-06 | Phase 4 | Verified (human smoke pending) |
| EXEC-07 | Phase 4 | Verified (human smoke pending) |
| EXEC-08 | Phase 4 | Verified (human smoke pending) |
| LOOP-01 | Phase 5 | Complete — 05-07 emits mechanical findings and 05-10 consumes them first in the strict review loop before model review |
| LOOP-02 | Phase 5 | Complete — 05-08 added ModelReviewer and 05-10 invokes it only after mechanical pass |
| LOOP-03 | Phase 5 | Complete — 05-05 added repair synthesis and 05-10 generates RepairPlan values for non-pass review iterations |
| LOOP-04 | Phase 5 | Complete — 05-03 added maxRepairLoops, 05-05 added repair subgraph, 05-06 added repair context, and 05-10 re-executes via executor.executeRepairTasks |
| LOOP-05 | Phase 5 | Complete — 05-10 writes review-decision.json and mints DeliveryAuthorization only on mechanical pass plus model pass; 05-13 pins the Phase 7 delivery contract to require that brand |
| LOOP-06 | Phase 5 | Complete — 05-10 writes review-block.json with iteration history and budget/mechanical/model block reasons |
| PILE-01 | Phase 6 | Pending |
| PILE-02 | Phase 6 | Pending |
| PILE-03 | Phase 6 | Pending |
| PILE-04 | Phase 6 | Pending |
| PILE-05 | Phase 6 | Pending |
| PILE-06 | Phase 6 | Pending |
| DELIVER-01 | Phase 7 | Pending |
| DELIVER-02 | Phase 7 | Pending |
| DELIVER-03 | Phase 7 | Pending |
| DELIVER-04 | Phase 7 | Pending |
| DELIVER-05 | Phase 7 | Pending |
| DELIVER-06 | Phase 7 | Pending |
| DELIVER-07 | Phase 7 | Pending |
| EVAL-01 | Phase 8 | Pending |
| EVAL-02 | Phase 8 | Pending |
| EVAL-03 | Phase 8 | Pending |
| EVAL-04 | Phase 8 | Complete |
| EVOL-01 | Phase 8 | Complete |
| EVOL-02 | Phase 8 | Complete |
| EVOL-03 | Phase 8 | Complete — configurable threshold plus calibration JSONL evidence; empirical tuning delegated to DOG-04 |
| OP-01 | Phase 9 | Complete — 09-01 commander run extraction preserved run behavior behind the new dispatcher |
| OP-02 | Phase 9 | Complete — 09-04 added status for recent runs and single-run lookup with human/JSON output |
| OP-03 | Phase 9 | Pending |
| OP-04 | Phase 9 | Complete — 09-06 added cancel with atomic manifest cancelling writes, CANCEL sentinel touch, terminal-run refusal, and sentinel teardown to cancelled |
| OP-05 | Phase 9 | Complete — 09-05 added inspect with canonical {manifest, artifacts, summary}, path-indexed artifacts, sha256/bytes, stage filtering, and no trace inlining |
| OP-06 | Phase 9 | Complete — 09-09 added deliver with gated first delivery, idempotent noop, retry, conflict branches, and reAuthorizeFromPayload before delivery-runtime |
| OP-07 | Phase 9 | Complete — 09-04 status and 09-05 inspect both emit canonical JSON-stable output for automation |
| OP-08 | Phase 9 | Pending |
| DOG-01 | Phase 10 | Pending |
| DOG-02 | Phase 10 | Pending |
| DOG-03 | Phase 10 | Pending |
| DOG-04 | Phase 10 | Pending — includes empirical convergence-threshold calibration from ≥10 dogfood runs |
| DOG-05 | Phase 10 | Pending |
| DOG-06 | Phase 10 | Pending |
| DOG-07 | Phase 10 | Pending |
| DOG-08 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 65 total
- Mapped to phases: 65
- Unmapped: 0

---
*Requirements defined: 2026-04-26*
*Last updated: 2026-04-26 after operator-supplied 10-phase v1 ordering*
