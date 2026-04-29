# Roadmap: Protostar Factory v1

**Defined:** 2026-04-26
**Ordering principle:** *Admit safely, authorize narrowly, mutate carefully, review relentlessly, deliver only after proof.*

Each phase carries forward the prior phase's invariants. No phase ships unless its requirements are verified against the live codebase. The thin-slice cosmetic-tweak loop from the 2026-04-24 v0.1 lock becomes a fixture in Phase 10, not a separate release.

## Phase Overview

| # | Phase | Goal | Blast Radius | Depends on |
|---|-------|------|--------------|------------|
| 1 | Intent + Planning Admission | No weak intent or bad plan reaches execution | Contracts only | — |
| 2 | Authority + Governance Kernel | Settle precedence; enforce capability envelope before mutation lands | Contracts only | 1 |
| 3 | Repo Runtime + Sandbox | Make the repo boundary real (clone, branch, write, rollback) | First real I/O | 2 |
| 4 | Execution Engine | Boring, deterministic task runner with resumable journal | Real subprocess + LM Studio calls | 2, 3 |
| 5 | Review → Repair → Review Loop | Central control loop; no delivery without approved exit | Composes 4 | 4 |
| 6 | Live Dogpile Piles | Bounded model coordination behind strict schemas | Real model calls | 1, 4, 5 |
| 7 | Delivery | Real GitHub PR with evidence bundle; no auto-merge | First external write | 5 |
| 8 | Evaluation + Evolution | Mechanical → semantic → consensus; spec/plan convergence | Real model calls | 5, 6 |
| 9 | Operator Surface + Resumability | `run` / `status` / `resume` / `cancel` / `inspect` / `deliver` | Operator UX | 4, 7 |
| 10 | V1 Hardening + Dogfood | Fixture matrix + sacrificial sibling repo + docs + security review | Real GitHub repo, real PRs | 1–9 |
| 11 | Headless Mode + E2E Stress | Headless CI run + stress sweep + TTT delivery | Multi-archetype + sustained load | 1–10 |
| 12 | Authority Boundary Stabilization | Fix CI gate + route mechanical commands through repo runner + scrub child env + tighten apply-change-set invariants + reconcile boundary truth source | Authority surface + subprocess wiring | 10, 11 |

## Phase 1 — Intent + Planning Admission ✅ Complete (2026-04-27)

**Status:** Verified — VERIFICATION.md PASSED 10/10. `pnpm run verify:full` 293/293 tests across 9 packages. Plan 06 was split into 06a (move `promoteIntentDraft` policy→intent) + 06b (brand `ConfirmedIntent`). Q-13b/c/d locks added (assertConfirmedIntent dropped, --intent CLI flag dropped, internal/test-builders subpath helper).

**Goal:** The front door is sealed. Every path that reaches execution went through ambiguity gate (≤0.2) and planning admission. No fixture or test bypass exists.

**Requirements:** INTENT-01, INTENT-02, INTENT-03, PLAN-A-01, PLAN-A-02, PLAN-A-03

**Success criteria:**
- `pnpm run verify` covers every package's tests
- Every fixture in `examples/intents/` and `examples/planning-results/` is exercised through the admission path in CI
- A fuzzed-bad intent and a fuzzed-bad plan each produce the correct no-admission artifact and refuse to advance

**Plans:** 10 plans across 4 waves (parallel within wave)

Plans:
- [ ] 01-01-tiered-verify-scripts-PLAN.md — wave 1 — root package.json `verify` (fast) + `verify:full` (recursive)
- [ ] 01-02-dogpile-types-shim-PLAN.md — wave 1 — `packages/dogpile-types` workspace replaces sibling-link `@dogpile/sdk`
- [ ] 01-03-bad-fixture-relocation-PLAN.md — wave 1 — relocate `bad-*.json` into `examples/**/bad/` subdirs (Q-06)
- [ ] 01-04-schema-version-infra-PLAN.md — wave 1 — JSON Schemas + `schemaVersion: "1.0.0"` field on refusal artifacts (Q-07)
- [ ] 01-05-admission-e2e-scaffold-PLAN.md — wave 1 — new `packages/admission-e2e/` test-only workspace (Q-09)
- [ ] 01-06-branded-confirmed-intent-PLAN.md — wave 2 — brand `ConfirmedIntent`, private mint, `signature: null` reservation (Q-03 + Q-13)
- [ ] 01-07-branded-admitted-plan-PLAN.md — wave 2 — brand `AdmittedPlan`, narrow execution input contract (Q-04)
- [ ] 01-08-refusal-artifact-layout-PLAN.md — wave 2 — `.protostar/runs/{id}/...` + `.protostar/refusals.jsonl` index (Q-08)
- [ ] 01-09-parameterized-admission-e2e-PLAN.md — wave 3 — `bad/`-driven e2e + AC deep-equal + snapshot mutator (Q-05, Q-10, Q-11)
- [ ] 01-10-github-actions-verify-PLAN.md — wave 4 — `.github/workflows/verify.yml` running `pnpm run verify:full` (Q-12)


**Notes:** Most of this is wiring + verify-gate fix. The ambiguity gate is already implemented (`packages/intent/src/ambiguity-scoring.ts`); this phase makes its enforcement uncircumventable.

## Phase 2 — Authority + Governance Kernel

**Goal:** Precedence is documented and enforced before any real mutation happens. Capability envelope is a runtime check, not a comment. ConfirmedIntent carries an admission signature that downstream stages verify.

**Requirements:** GOV-01, GOV-02, GOV-03, GOV-04, GOV-05, GOV-06

**Success criteria:**
- A test demonstrates a denied capability (e.g. `executionScope: "workspace"` with `trust: "untrusted"`) produces an evidence-bearing block at the authority boundary, not the execution stage
- Admission decision artifacts exist for intent, planning, capability, and repo-scope gates — all schema-versioned
- Tampering with a `ConfirmedIntent` between admission and execution is detected via signature mismatch

**Notes:** Builds directly on existing `packages/policy/src/admission.ts`, `capability-admission.ts`, `repo-scope-admission.ts`. GOV-06 (signed intent) is new and gates Phase 3.

**Plans:** 16 plans across 8 waves (parallel within wave) — Plan 06 split into 06a + 06b in revision iteration 2; Plans 11-15 added by gap-closure planning after 2026-04-27 verification found authority-governance blockers.

Plans:
- [x] 02-01-authority-package-skeleton-PLAN.md — wave 0 — `@protostar/authority` workspace skeleton + 5 schema files (zero-fs from day one)
- [x] 02-02-authorized-op-brands-PLAN.md — wave 1 — 4 AuthorizedOp brands (workspace/subprocess/network/budget) + budget tracker/aggregator interfaces (Q-05, Q-06, Q-07)
- [x] 02-03-signature-envelope-extension-PLAN.md — wave 1 — extend SignatureEnvelope with canonicalForm; HARD-BUMP confirmed-intent.schema.json to const 1.1.0 (Q-18 user lock — A8 widening overridden in iteration 2)
- [x] 02-04-precedence-kernel-PLAN.md — wave 2 — intersectEnvelopes + PrecedenceDecision brand + parseRepoPolicy + DENY_ALL_REPO_POLICY (A3 default-DENY lock)
- [x] 02-05-canonicalize-and-signature-PLAN.md — wave 2 — json-c14n@1.0 canonicalizer + buildSignatureEnvelope + verifyConfirmedIntentSignature single helper (Q-15, Q-16, Q-17, Q-18)
- [x] 02-06a-admission-decision-base-PLAN.md — wave 2 — AdmissionDecisionBase + SignedAdmissionDecision brand (sixth Phase 2 brand) (Q-13, Q-15, Q-17)
- [x] 02-06b-per-gate-evidence-schemas-PLAN.md — wave 2 — 5 per-gate evidence schemas in owning packages + git-mv intent rename + package.json exports (Q-13, Q-14)
- [x] 02-07-factory-cli-per-gate-writer-PLAN.md — wave 3 — runFactory wires precedence + per-gate triple-write + signed intent + policy-snapshot + admission-decisions.jsonl (Q-04, Q-14)
- [x] 02-08-two-key-launch-and-escalate-PLAN.md — wave 3 — `--trust`/`--confirmed-intent` flags + remove hardcoded trust at main.ts:335 + escalation-marker.json (Q-11, Q-12, A4, A5, A6)
- [x] 02-09-stage-reader-and-repo-runtime-PLAN.md — wave 4 — createAuthorityStageReader (FsAdapter-injected, legacy fallback) + assertTrustedWorkspaceForGrant predicate + packages/repo runtime trust check (Q-09, Q-10)
- [x] 02-10-admission-e2e-contract-suite-PLAN.md — wave 4 — 6 per-brand contract tests + authority-no-fs regression + signed-intent e2e (Q-08)
- [ ] 02-11-fail-closed-precedence-and-gate-evidence-PLAN.md — wave 5 — remove repo-policy compatibility widening, stop on blocked precedence, make workspace-trust gate outcomes real, and align gate evidence with schemas
- [ ] 02-12-authorized-op-envelope-enforcement-PLAN.md — wave 5 — enforce resolved-envelope grants in AuthorizedWorkspace/Subprocess/Network/Budget producers
- [ ] 02-13-verified-two-key-launch-PLAN.md — wave 6 — verify supplied `--confirmed-intent` before trusted workspace launch
- [ ] 02-14-stage-reader-branded-verification-and-index-PLAN.md — wave 6 — standardize `admission-decisions.jsonl` reader/writer fields and split parsed vs verified ConfirmedIntent reads
- [ ] 02-15-schema-parity-and-phase2-regression-suite-PLAN.md — wave 7 — close repo-policy schema parity warning and add cross-package Phase 2 regression coverage


## Phase 3 — Repo Runtime + Sandbox

**Goal:** The repo boundary is real. `packages/repo` actually clones, branches, reads/writes within caps, applies patches atomically, and rolls back on failure. This is where the dark factory starts touching matter.

**Requirements:** REPO-01, REPO-02, REPO-03, REPO-04, REPO-05, REPO-06, REPO-07, REPO-08, REPO-09

**Success criteria:**
- Tests against an in-process sacrificial git repo prove: clone, branch, file-write within caps, patch apply, rollback after induced failure, dirty-worktree refusal
- A subprocess invocation through the `repo`-owned runner refuses an arg outside the allowlist
- `pnpm install` succeeds on a fresh-clone machine with no sibling `dogpile/` directory
- `.env.example` documents every var the factory will read in Phases 4–7

**Notes:** Resolves the "`packages/repo` is essentially empty" debt from `.planning/codebase/CONCERNS.md`. Resolves the `@dogpile/sdk` link risk before second contributors.

**Plans:** 13 plans across 6 waves (Wave 0 sequential foundations; Waves 1-5 implementation/integration).

Plans:
- [x] 03-01-conflict-errata-deps-and-env-PLAN.md — wave 0 — CONFLICT-01 erratum + isomorphic-git@1.37.6 + diff@9.0.0 deps + PROJECT.md rephrase + .gitignore + .env.example + CONCERNS.md addendum (Q-17, Q-01, Q-02)
- [x] 03-02-paths-package-and-agents-carveout-PLAN.md — wave 0 — `@protostar/paths` skeleton + sync `resolveWorkspaceRoot()` + AGENTS.md scope-ceiling carve-out (Q-15)
- [x] 03-03-confirmed-intent-schema-bump-PLAN.md — wave 0 — confirmed-intent 1.1.0 → 1.2.0 + `capabilityEnvelope.workspace.allowDirty: false` default + cascade audit of every "1.1.0" literal (Q-14)
- [x] 03-04-sacrificial-repo-test-fixture-PLAN.md — wave 0 — `buildSacrificialRepo` programmatic helper + subpath export `./internal/test-fixtures` (Q-18)
- [x] 03-05-fs-adapter-PLAN.md — wave 1 — TDD: brand-consuming FS adapter w/ re-canonicalize + lstat-symlink-refusal + escape detection (Q-05, Q-06)
- [x] 03-06-symlink-audit-PLAN.md — wave 1 — TDD: post-clone tree audit via Node 22 readdir({recursive,withFileTypes}) (Q-06)
- [x] 03-08-subprocess-allowlist-and-schemas-PLAN.md — wave 1 — TDD: baseline allowlist + intersect helper + outer pattern guard + per-command schemas (git/pnpm/node/tsc) (Q-07, Q-08)
- [x] 03-07-apply-change-set-PLAN.md — wave 2 — TDD: patch pipeline using diff@9.0.0 (CONFLICT-01 resolution) — sha256 gate → parsePatch → binary detect → applyPatch → write; best-effort partial result (Q-10, Q-12)
- [x] 03-09-subprocess-runner-PLAN.md — wave 2 — spawn array-form + pre-spawn validation + stream-to-file + rolling tail + flush-on-exit + timeout (Q-09, Q-04)
- [x] 03-10-clone-and-dirty-and-policy-PLAN.md — wave 2 — TDD: cloneWorkspace (isomorphic-git + onAuth shim + retry-cancel) + dirtyWorktreeStatus (CONFLICT-02 filter) + repo-policy parser + admission-decision JSON schema (Q-04, Q-13, Q-02)
- [x] 03-11-barrel-and-factory-cli-wiring-PLAN.md — wave 3 — barrel re-exports + INIT_CWD → resolveWorkspaceRoot + clone/audit/dirty/admission-decision-emit/cleanup-or-tombstone wiring into runFactory (Q-15, Q-11)
- [x] 03-12-admission-e2e-contract-suite-PLAN.md — wave 4 — five contract tests pinning per-gate evidence shapes: dirty-refusal, symlink-refusal, allowlist-refusal, hash-mismatch refusal, best-effort partial (REPO-05 lead)
- [x] 03-13-dogpile-sdk-pin-and-fresh-clone-checkpoint-PLAN.md — wave 5 — pin @dogpile/sdk@0.2.0 on dogpile-types (retain re-export shim) + REPO-08 fresh-clone install checkpoint + 03-VALIDATION.md fill-in (Q-16)


## Phase 4 — Execution Engine

**Status:** Automated verification passed — 12/12 must-haves verified; live LM Studio operator smoke pending.

**Goal:** Replace the dry-run executor with a boring, deterministic, resumable task runner. The first real `ExecutionAdapter` is the LM Studio coder (Qwen3-Coder-Next-MLX-4bit) producing real diffs.

**Requirements:** EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08

**Success criteria:**
- Task state transitions are persisted; killing the process mid-run + resuming reaches the same terminal state
- LM Studio coder adapter produces a non-empty diff for the cosmetic-tweak fixture
- Adding a stub second adapter (e.g. echo / mock) requires zero contract change in `packages/execution`
- Lifecycle events are identical between dry-run and real-execution paths (assertion)

**Notes:** Provider abstraction is the load-bearing decision here — locks in Qwen as the first provider without making it the only one.

**Plans:** 10 plans across 5 waves (0..4; parallel within wave).

Plans:
- [x] 04-01-state-machine-flip-PLAN.md — wave 0 — flip ExecutionTaskStatus + ExecutionLifecycleEventType to EXEC-01 vocab; rewrite dry-run executor; no compat shim (Q-01, Q-04)
- [x] 04-02-execution-contracts-PLAN.md — wave 1 — adapter-contract.ts (ExecutionAdapter, AdapterEvent, AdapterResult, AdapterContext, AdapterFailureReason) + journal-types.ts (TaskJournalEvent, ExecutionSnapshot) + exhaustiveness pins (Q-02, Q-05)
- [x] 04-03-stub-server-and-fixture-PLAN.md — wave 0 — @protostar/lmstudio-adapter workspace skeleton + stub LM Studio HTTP server (7 failure modes) + cosmetic-tweak fixture (load-bearing test asset)
- [x] 04-04-lmstudio-config-and-preflight-PLAN.md — wave 1 — pure resolveFactoryConfig (file+env+default+configHash) + factory-config.schema.json + preflightLmstudio classifier (5 outcomes) (Q-09, Q-13)
- [x] 04-05-sse-diff-retry-helpers-PLAN.md — wave 2 — sse-parser (Pitfall 1 fix) + diff-parser (strict fence) + prompt-builder + retry-classifier + deterministic backoff (Q-10, Q-12, Q-14)
- [x] 04-06-coder-adapter-orchestrator-PLAN.md — wave 3 — createLmstudioCoderAdapter ties parser+reader+retry+signal; happy / parse-reformat / retry / timeout paths; Hash 1 of 2 comment (Q-05, Q-06, Q-15)
- [x] 04-07-envelope-schema-bump-PLAN.md — wave 2 — confirmed-intent.schema.json 1.2.0 → 1.3.0 (network.allow + budget.adapterRetriesPerTask + budget.taskWallClockMs + allowedHosts) + repo-wide signed-intent fixture regeneration (Pitfall 7) (Q-14, Q-15, Q-18)
- [x] 04-08-network-op-and-plan-schema-PLAN.md — wave 3 — extend authorizeNetworkOp for network.allow enum + plan-schema task.targetFiles (≥1) + task.adapterRef admitted against allowedAdapters (Q-08, Q-11, Q-18)
- [x] 04-09-journal-snapshot-orphan-PLAN.md — wave 3 — pure formatTaskJournalLine / parseJournalLines / reduceJournalToSnapshot / replayOrphanedTasks in @protostar/execution + fs writers (append+fsync, tmp+rename) in apps/factory-cli (Q-02, Q-03)
- [x] 04-10-factory-cli-real-executor-wiring-PLAN.md — wave 4 — coderAdapterReadyAdmission gate + runRealExecution loop (apply-boundary, evidence, journal, snapshot, orphan-replay) + SIGINT/sentinel cancel + main.ts --executor real branch + .env.example (Q-13, Q-16, Q-17, Q-19)


## Phase 5 — Review → Repair → Review Loop ✅ Complete (2026-04-28)

**Goal:** The central control loop. Mechanical first, model second, repair plans typed, re-execution under shared budget. No delivery unless this loop exits `pass`.

**Requirements:** LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05, LOOP-06

**Success criteria:**
- A failed mechanical verdict produces a typed `RepairPlan` that execution consumes; re-execution emits the same lifecycle events
- Budget exhaustion (N=3) produces a `block` verdict with all judge critiques captured in the run bundle
- A delivery attempt with anything other than `pass`/`pass` is refused at the contract layer

**Notes:** Existing `runMechanicalReviewExecutionLoop` becomes one half of this loop. The model-review half is wired in Phase 8; this phase locks the loop shape so Phase 8 can plug in.

**Plans:** 13 plans across 7 waves (0..6; parallel within wave). Wave numbering revised in iteration 2 after the plan-checker flagged depends-on cascades.

Cross-cutting constraints (must_haves.truths shared across plans):
- DeliveryAuthorization is a brand-only type; minted only on loop-approved path; required by Phase 7 delivery boundary (Q-15, Q-16) — appears in 05-04, 05-10, 05-13
- Capability envelope owns budget.maxRepairLoops (Q-12) — appears in 05-03, 05-10
- Strict pass/pass at brand mint; `model: "skipped"` rejected (Q-15) — appears in 05-04, 05-10
- Cycle-resolution: shared types (RepairContext, AdapterAttemptRef, ExecutionRunResult, MechanicalCritiqueRef, ModelCritiqueRef) live in @protostar/planning to prevent review↔execution import cycle — appears in 05-04, 05-06, 05-10
- AGENTS.md authority boundary: only apps/factory-cli + packages/repo touch fs; mechanical-checks adapter takes injected readFile + subprocess capabilities — appears in 05-07, 05-12

Plans:

**Wave 0** (skeletons + schema bumps; foundation for all downstream waves)
- [x] 05-01-repair-package-skeleton-PLAN.md — wave 0 — `@protostar/repair` workspace skeleton (pure-transform sibling to dogpile-adapter) (Q-05)
- [x] 05-02-mechanical-checks-package-skeleton-PLAN.md — wave 0 — `@protostar/mechanical-checks` workspace skeleton (subprocess-driven adapter) (Q-07)
- [x] 05-03-schema-bumps-PLAN.md — wave 0 — confirmedIntent 1.3.0 → 1.4.0 + budget.maxRepairLoops + plan-schema task.acceptanceTestRefs + fixture cascade (Q-09, Q-12)

**Wave 1** *(blocked on Wave 0 completion)* (type contracts, including cycle-neutral relocation into @protostar/planning)
- [x] 05-04-review-types-and-brands-PLAN.md — wave 1 — RepairPlan/RepairContext/ModelReviewer/JudgeCritique/DeliveryAuthorization brand + ReviewLifecycleEvent union; relocates RepairContext/AdapterAttemptRef/ExecutionRunResult/MechanicalCritiqueRef/ModelCritiqueRef into @protostar/planning to break review↔execution cycle (Q-04, Q-06, Q-10, Q-11, Q-15, Q-16, Q-18)

**Wave 2** *(blocked on Wave 1 completion)* (pure transforms + adapter context + per-task gate + judge adapter)
- [x] 05-05-synthesize-repair-plan-PLAN.md — wave 2 — pure-transform synthesizeRepairPlan + computeRepairSubgraph in @protostar/repair (Q-03, Q-04, Q-05)
- [x] 05-06-adapter-context-repair-extension-PLAN.md — wave 2 — AdapterContext.repairContext (sourced from @protostar/planning) + retryReason "repair" widening (Q-06)
- [x] 05-08-judge-adapter-PLAN.md — wave 2 — createLmstudioJudgeAdapter + shared lmstudio-client extraction + factory-config adapters.judge schema (Q-10, Q-11)
- [x] 05-09-apply-change-set-cosmetic-gate-PLAN.md — wave 2 — applyChangeSet per-task ≤1-file gate for cosmetic-tweak archetype (Q-08 first defense)

**Wave 3** *(blocked on Wave 2 completion)* (mechanical-checks adapter + admission AC-coverage rule)
- [x] 05-07-mechanical-checks-adapter-PLAN.md — wave 3 — createMechanicalChecksAdapter (with injected readFile + subprocess capabilities — no node:fs in source) + diff-name-only + buildFindings (Q-07, Q-08 run-level, Q-09 mechanical side)
- [x] 05-11-admission-rule-ac-coverage-PLAN.md — wave 3 — admission rule rejecting plans without AC coverage + fixture cascade (Q-09 admission side)

**Wave 4** *(blocked on Wave 3 completion)* (the loop body + persistence + DeliveryAuthorization minting)
- [x] 05-10-run-review-repair-loop-PLAN.md — wave 4 — runReviewRepairLoop body + ReviewPersistence (iter-N dirs, review.jsonl path-pattern verified, review-decision.json, review-block.json) + loadDeliveryAuthorization; ExecutionRunResult sourced from @protostar/planning (Q-01, Q-02, Q-12, Q-13, Q-14, Q-15, Q-17, Q-18)

**Wave 5** *(blocked on Wave 4 completion)* (factory-cli wiring)
- [x] 05-12-factory-cli-wiring-PLAN.md — wave 5 — runFactory swaps to runReviewRepairLoop + buildReviewRepairServices (injects readFile + RepoSubprocessRunner into mechanical-checks) + preflightCoderAndJudge + .env.example (Q-01 wiring, Q-10 preflight)

**Wave 6** *(blocked on Wave 5 completion)* (Phase 7 contract pin)
- [x] 05-13-delivery-contract-pin-PLAN.md — wave 6 — packages/delivery declares createGitHubPrDeliveryPlan(authorization: DeliveryAuthorization, ...) signature + @ts-expect-error negative tests (Q-16)


## Phase 6 — Live Dogpile Piles

**Goal:** Live planning, review, and execution-coordination piles behind strict schemas. Protostar remains authority; Dogpile supplies bounded opinions.

**Requirements:** PILE-01, PILE-02, PILE-03, PILE-04, PILE-05, PILE-06

**Success criteria:**
- `--planning-mode pile` runs a real planning pile against `@dogpile/sdk` and produces an admitted plan via the unchanged admission path
- `dogpile-adapter` still does zero filesystem I/O (contract test)
- Pile timeout / budget exhaustion fails the pile (not the run); fixture-mode fallback still works
- Schema parse errors on pile output produce the same no-admission artifacts as fixture parse errors

**Notes:** The reason this comes after 4+5 (not before): we want the deterministic engine + control loop to work end-to-end with fixtures before introducing live model variability into planning/review.

**Plans:** 10 plans across 7 waves (0..6; parallel within wave). Initial verification 2026-04-28 surfaced 2 gaps (PILE-03 runtime + PLAN-A-03 verify-gate flake) closed by Plans 06-09 + 06-10 (gap_closure: true).

Plans:
- [x] 06-01-wave0-types-and-rename-PLAN.md — wave 0 — widen @protostar/dogpile-types runtime+type re-exports; Q-16 rename executionCoordinatorPilePreset → executionCoordinationPilePreset; static no-fs.contract.test.ts in @protostar/dogpile-adapter (Q-09 static, Q-16, PILE-06)
- [x] 06-02-wave0-config-schema-and-phase5-annotation-PLAN.md — wave 0 — factory-config.schema.json piles.{planning,review,executionCoordination}.mode block + Phase 5 CONTEXT.md Q-10 retroactive annotation per Phase 6 Q-14 (Q-04, Q-14)
- [x] 06-03-adapter-budget-failure-types-PLAN.md — wave 1 — PileFailure six-variant union + ResolvedPileBudget + resolvePileBudget (envelope clamps preset) + mapSdkStopToPileFailure (Q-10, Q-13, PILE-04, PILE-05)
- [x] 06-04-adapter-run-factory-pile-PLAN.md — wave 1 — runFactoryPile via @dogpile/sdk stream() + AbortSignal.any hierarchical aborts + onEvent forwarding + buildExecutionCoordinationMission (Q-01, Q-02, Q-11, Q-15, PILE-01)
- [x] 06-05-review-pile-reviewer-PLAN.md — wave 2 — @protostar/review ReviewPileResult + parseReviewPileResult + createReviewPileModelReviewer (Phase 5 Q-10 ModelReviewer impl) (Q-14, Q-17, PILE-02)
- [x] 06-06-repair-and-planning-coordination-PLAN.md — wave 2 — @protostar/repair ExecutionCoordinationPileResult + parser + admitRepairPlanProposal; @protostar/planning admitWorkSlicing (Q-15, Q-18, PILE-03)
- [x] 06-07-factory-cli-pile-wiring-PLAN.md — wave 3 — CLI flags --planning-mode/--review-mode/--exec-coord-mode + factory-config piles parsing + RefusalStage extension + pile-mode-resolver + pile-persistence (runs/{id}/piles/{kind}/iter-{N}/) + main.ts pile invocation flow with run-level AbortController (Q-03 fallback, Q-04, Q-06, Q-07, Q-08, Q-12, PILE-01, PILE-04, PILE-05)
- [x] 06-08-admission-e2e-pile-contract-PLAN.md — wave 4 — admission-e2e runtime no-fs contract (Q-09 runtime defense in depth) + refusal byte-equality (PILE-04 fixture-vs-live symmetry) + integration smoke (planning-pile-live, work-slicing-trigger, repair-plan-trigger) (PILE-03, PILE-04, PILE-06)
- [ ] 06-09-verify-gate-flake-fix-PLAN.md — wave 5 — gap-closure: diagnose run-real-execution.test.ts flake under chained `pnpm run verify`; harden async resource teardown (AbortController/timer/listener); restore PLAN-A-03 invariant (5 consecutive verify exit-0 runs); confirms Phase 5 LOOP-04 closure on the verify path (PLAN-A-03)
- [ ] 06-10-exec-coord-runtime-wiring-PLAN.md — wave 6 — gap-closure: add repairPlanRefiner hook to runReviewRepairLoop + repair-plan-refined lifecycle event; new exec-coord-trigger module (work-slicing heuristic + admitWorkSlicing wrapper + admitRepairPlanProposal wrapper); wire both triggers in factory-cli main.ts (hard-fail at work-slicing, soft-fallback at refinement per Q-15); flip negative-grep deferral pins in pile-integration-smoke.contract.test.ts to positive wiring assertions (PILE-03, Q-15)

## Phase 7 — Delivery

**Status:** Verified complete (2026-04-28). `07-VERIFICATION.md` passed 10/11 active must-haves with Phase 10 deferrals for real toy-repo PR and screenshots; `07-REVIEW.md` unblocked with one warning; `07-SECURITY.md` secured 43/43 threats.

**Goal:** Real GitHub PR delivery via Octokit + PAT, evidence bundle in the PR body, CI status capture. No auto-merge.

**Requirements:** DELIVER-01, DELIVER-02, DELIVER-03, DELIVER-04, DELIVER-05, DELIVER-06, DELIVER-07

**Success criteria:**
- A `pass` run against the sibling toy repo (Phase 10 dependency) produces a real PR with the full evidence bundle in its body
- CI status is polled and captured; the run bundle records final CI verdict
- Branch/title/body validation refuses an injected control character
- No code path can call `merge`

**Notes:** Phase 7 depends on Phase 5 (loop must exit `pass`) but can execute against a hand-curated `pass` fixture before the toy repo from Phase 10 exists. v0.1 ships nock-only against fixtures; real GitHub waits for Phase 10 dogfood.

**Plans:** 12 plans across 7 waves (parallel within wave).

Plans:
- [x] 07-01-schema-cascade-PLAN.md — wave 0 — confirmedIntent 1.4.0 → 1.5.0 + delivery.target + budget.deliveryWallClockMs + 19-file cascade + 2 fixture re-signs (Q-05, Q-14)
- [x] 07-02-delivery-runtime-skeleton-PLAN.md — wave 0 — `@protostar/delivery-runtime` workspace + no-fs/no-merge static contracts + nock-vs-Octokit-22 smoke (Pitfall 6 gate; Q-01)
- [x] 07-03-wiring-config-PLAN.md — wave 0 — AGENTS.md tier table + .env.example PAT docs + factory-config.requiredChecks + computeDeliveryAllowedHosts helper (Q-04, Q-05, Q-15)
- [x] 07-04-brands-and-refusals-PLAN.md — wave 1 — BranchName/PrTitle/PrBody brands + DeliveryRefusal 14-variant union + evidence-marker (runId-extended per Pitfall 9) + drop gh argv (Q-02, Q-08, Q-09, Q-10, Q-20, Pitfall 2, Pitfall 3)
- [x] 07-05-pr-body-composers-PLAN.md — wave 1 — 7 per-section composers + drift-by-construction contract (DELIVER-06) + Pitfall 8 mitigation (Q-12, Q-13, Q-11)
- [x] 07-06-octokit-and-preflight-PLAN.md — wave 2 — buildOctokit + retry/throttling plugins + preflightDeliveryFast/Full (6 outcomes) + mapOctokitErrorToRefusal token redaction (Q-06, Q-20, Pitfall 4)
- [x] 07-07-push-branch-PLAN.md — wave 2 — pushBranch with Q-03 verbatim onAuth + force-with-lease emulation (Pitfall 5) + two-layer cancel (Pitfall 11) + branch-template (Q-07, Pitfall 10)
- [x] 07-08-execute-delivery-PLAN.md — wave 3 — executeDelivery 5-brand stack + findExistingPr + postEvidenceComment + idempotency contract + secret-leak contract (Q-08, Q-10, Q-16, Q-18, Q-19)
- [x] 07-09-poll-ci-status-PLAN.md — wave 4 — computeCiVerdict + pollCiStatus async generator + DeliveryResult/CiEvent schema (Q-14, Q-15, Q-16, Q-17)
- [x] 07-10-factory-cli-preflight-wiring-PLAN.md — wave 5 — fast preflight at run start + full preflight at delivery boundary + hierarchical AbortSignal composition (Q-06, Q-19)
- [x] 07-11-factory-cli-execute-delivery-wiring-PLAN.md — wave 5 — assembleDeliveryBody (composer ordering + spillover) + drivePollCiStatus + wireExecuteDelivery + main.ts replaces FIXME (Q-08, Q-10, Q-13, Q-16, Q-17)
- [x] 07-12-admission-e2e-contracts-PLAN.md — wave 6 — repo-wide no-merge contract (strongest DELIVER-07 invariant) + delivery-result schema + preflight refusal taxonomy contracts

## Phase 8 — Evaluation + Evolution

**Status:** Verified complete (2026-04-28). `08-VERIFICATION.md` passed 7/7 Phase 8 requirements after formally clarifying that Phase 8 owns calibration evidence capture while DOG-04 owns the ≥10-run empirical threshold tuning; `08-REVIEW.md` is clean and `08-SECURITY.md` secured 29/29 threats.

**Goal:** Three-stage evaluation (mechanical → semantic → consensus) with the heterogeneous-local judge panel. Evolution decides `continue` / `converged` / `exhausted` from cross-run ontology snapshots. Specs and plans evolve before code.

**Requirements:** EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVOL-01, EVOL-02, EVOL-03

**Plans:** 8 plans across 7 waves (0..6; parallel within wave).

Plans:
- [x] 08-01-evaluation-runner-skeleton-PLAN.md — wave 0 — new @protostar/evaluation-runner workspace skeleton (Q-20)
- [x] 08-02-types-and-schema-extensions-PLAN.md — wave 1 — EvaluationStageResult shape (Q-03 BREAKING) + EVALUATION_RUBRIC_DIMENSIONS (Q-06) + 6 threshold constants (Q-02/Q-05/Q-09) + MechanicalEvalResult/SemanticEvalResult/ConsensusEvalResult (Q-12) + ReviewGate.mechanicalScores (Q-01) + PileFailure 'eval-consensus-block' variant + 'EvaluationResult' sourceOfTruth + 'pile-evaluation' RefusalStage (Q-10) + factory-config evaluation/evolution blocks (Q-07/Q-08/Q-15/Q-17/Q-18) + 'skipped' literal removal (Q-11)
- [x] 08-03-evaluation-pure-helpers-PLAN.md — wave 2 — computeMechanicalScores + computeSemanticConfidence + shouldRunConsensus + evaluateConsensus (4-way truth table) + createSpecOntologySnapshot + computeLineageId (Q-01/Q-02/Q-05/Q-09/Q-12/Q-13/Q-15)
- [x] 08-04-mechanical-scores-producer-PLAN.md — wave 2 — mechanical-checks numeric score producer threading mechanicalScores into produced ReviewGate (Q-01)
- [x] 08-05-evaluation-pile-preset-PLAN.md — wave 3 — evaluationPilePreset (4th FactoryPilePreset) + buildEvaluationMission + EvaluationPileBody + parseEvaluationPileResult (Q-04/Q-06/Q-07/Q-08)
- [x] 08-06-evaluation-runner-PLAN.md — wave 4 — runEvaluationStages orchestrator with injected snapshotReader + createEvaluationReport real implementation + static no-fs contract (Q-12/Q-20)
- [x] 08-07-factory-cli-wiring-PLAN.md — wave 5 — 5 CLI flags (--lineage, --evolve-code, --generation, --semantic-judge-model, --consensus-judge-model) + 6 resolvers + atomic snapshot writer + JSONL chain index + calibration log stub + replace main.ts:889 stub call site + buildPlanningMission(intent, prior?) extension (Q-13/Q-14/Q-15/Q-16/Q-17/Q-18/Q-19)
- [x] 08-08-admission-e2e-contracts-PLAN.md — wave 6 — no-skipped-evaluation contract (EVAL-04 risk closure) + eval-refusal-byte-equality + runtime evaluation-runner-no-fs + planning-mission-prior-summary + calibration-log-append

**Success criteria:**
- The `status: "skipped"` stubs in `createEvaluationReport` are gone; semantic + consensus produce real numeric scores
- Two-judge panel runs with different model families (Qwen3-80B + e.g. DeepSeek/Llama via LM Studio); harsher-than-baseline rule documented and enforced
- `decideEvolution` reads the previous run's snapshot from disk; generation can advance past 0
- Convergence threshold is configurable and every run appends calibration evidence; DOG-04 performs the ≥10-run empirical tuning

**Notes:** Plugs into Phase 5's `LOOP-02`. Resolves the stubbed-evaluation tech debt from `.planning/codebase/CONCERNS.md`. Threshold calibration follows `08-DISCUSSION-LOG.md`: Phase 8 records observations, Phase 10 dogfood calibrates from them.

## Phase 9 — Operator Surface + Resumability

**Goal:** CLI commands that make a dark factory legible. You walk away, come back, and understand exactly what happened.

**Requirements:** OP-01, OP-02, OP-03, OP-04, OP-05, OP-06, OP-07, OP-08

**Success criteria:**
- `protostar-factory status` lists last N runs with verdict + archetype + duration; `--run <id>` prints the manifest summary
- `protostar-factory resume <id>` recovers a killed run from its task journal (Phase 4 dependency)
- `protostar-factory inspect <id>` is JSON-stable and pipeable
- A pruning recipe exists; `.protostar/runs/` does not balloon unattended

**Plans:** 11 plans

Plans (wave structure: W1 = {02, 03}; W2 = {01}; W3 = {04, 05, 06, 08}; W4 = {07, 09, 10}; W5 = {11}):
- [x] 09-01-dispatcher-and-cli-primitives-PLAN.md — [W2; deps: 02] commander dispatcher + ExitCode + io.ts + run-id.ts + duration.ts + run command extraction
- [x] 09-02-canonical-json-lift-PLAN.md — [W1] lift sortJsonValue to @protostar/artifacts/canonical-json (Q-12)
- [x] 09-03-factory-run-status-enum-bump-PLAN.md — [W1] FactoryRunStatus += cancelling | cancelled | orphaned (Q-18)
- [x] 09-04-status-command-PLAN.md — [W3; deps: 01, 02, 03] listRuns + computeRunLiveness + status command (human + JSON, tiered rows)
- [x] 09-05-inspect-command-PLAN.md — [W3; deps: 01, 02] inspect command, path-indexed artifacts, no trace inlining (Q-10/Q-11)
- [x] 09-06-cancel-command-PLAN.md — [W3; deps: 01, 03] cancel command (sentinel + manifest cancelling) + cancelled transition writer (Q-16/Q-17)
- [x] 09-07-resume-command-PLAN.md — [W4; deps: 01, 03, 04] stage-aware resume with replayOrphanedTasks + sentinel handling (Q-13/Q-14/Q-15)
- [x] 09-08-gated-delivery-and-authorization-writer-PLAN.md — [W3; deps: 01, 03] delivery.mode + authorization.json write site + reAuthorizeFromPayload validator (Q-20/Q-21)
- [x] 09-09-deliver-command-PLAN.md — [W4; deps: 01, 03, 08] deliver command with idempotent retry + gated first delivery (Q-20/Q-21)
- [x] 09-10-prune-command-PLAN.md — [W4; deps: 01, 03, 04] prune --older-than with active-guard + JSONL preservation (Q-22)
- [x] 09-11-admission-e2e-cli-contracts-PLAN.md — [W5; deps: 01–10] 7 admission-e2e contract tests + 8 --help fixtures locking the public CLI surface

**Notes:** TUI is deferred. The product feel is "boring CLI you trust."

## Phase 10 — V1 Hardening + Dogfood

**Goal:** Run the factory against the sibling toy repo until you're bored. Build the fixture matrix. Then docs, package hygiene, security review, ship.

**Requirements:** DOG-01, DOG-02, DOG-03, DOG-04, DOG-05, DOG-06, DOG-07, DOG-08

**Success criteria:**
- Sibling Tauri+React+TypeScript repo (`../protostar-toy-ttt`) exists and is the registered target
- Fixture matrix has at least one passing run for each scenario: `accepted`, `ambiguous`, `bad-plan`, `failed-execution`, `repaired-execution`, `blocked-review`, `pr-ready`
- ≥10 consecutive cosmetic-tweak runs against the toy repo, ≥80% reaching `pr-ready`, with convergence-threshold tuning justified from the Phase 8 calibration JSONL evidence
- README + package docs are accurate; `pnpm release` produces shippable artifacts; security review is signed off

**Plans:** 8 plans

Plans (wave structure: W1 = {01, 02}; W2 = {03, 04, 05, 06, 07}; W3 = {08}):
- [x] 10-01-PLAN.md — [W1] DOG-01: toy repo scaffold + CI on `../protostar-toy-ttt` + dedicated PAT (autonomous: false)
- [x] 10-02-PLAN.md — [W1; deps: 01] DOG-03: 3-seed library + single end-to-end run + Phase 7 deferred PR catch-up + prune scope to `.protostar/dogfood/` (autonomous: false)
- [x] 10-03-PLAN.md — [W2; deps: 02] DOG-02: 7-row fixture matrix + `regen-matrix.sh` + coverage/age contracts
- [x] 10-04-PLAN.md — [W2; deps: 02] DOG-05: root README + lifecycle mermaid + run-bundle appendix + CLI snapshots + drift contract + PROJECT.md lock-revision (owns full Phase 10 dev-dep entry)
- [x] 10-05-PLAN.md — [W2; deps: 02] DOG-06: knip + `pnpm verify` + per-package READMEs + coverage contract
- [x] 10-06-PLAN.md — [W2; deps: 02] DOG-07: changesets + public `@protostar/*` publish tooling + `pnpm release` + changeset-required CI gate (autonomous: false; publish not run)
- [x] 10-07-PLAN.md — [W2; deps: 02] DOG-08: SECURITY.md + SECURITY-REVIEW.md + authority-boundary AST contract
- [ ] 10-08-PLAN.md — [W3; deps: 01..07] DOG-04: dogfood driver + ≥10×≥80% exit gate + calibration justification (autonomous: false)

**Notes:** This is where the v0.1 cosmetic-tweak loop from the 2026-04-24 lock actually ships — as the first row of DOG-02's fixture matrix and the seed for DOG-04's repeat runs. Plan 10-02 completed 2026-04-29 with `zakkeown/protostar-toy-ttt#1` and green `build-and-test`; screenshot PNG capture remains deferred. Plan 10-03 completed 2026-04-29 with the seven-row fixture matrix, typed accessors, regeneration script, and coverage/age contracts. Plan 10-04 completed 2026-04-29 with operator docs, run-bundle schema appendix generation, CLI help snapshots, and drift enforcement. Plan 10-05 completed 2026-04-29 with knip in verify, per-package READMEs, and README coverage enforcement. Plan 10-06 completed 2026-04-29 with Changesets release tooling, public publish metadata, initial `0.1.0` changeset, and a changeset-required PR workflow; no npm publish was run. Plan 10-07 completed 2026-04-29 with public/internal security artifacts and an authority-boundary admission-e2e contract.

### Phase 10.1: boundary hygiene pass (INSERTED)

**Status:** ✅ Complete (2026-04-29)

**Goal:** Align package manifests and dependency-boundary enforcement with the source-level architecture so the monorepo reads as deliberate separation of concerns, not accidental package sprawl.
**Requirements:** BOUNDARY-01, BOUNDARY-02, BOUNDARY-03, BOUNDARY-04, BOUNDARY-05, BOUNDARY-06, BOUNDARY-07, BOUNDARY-08, BOUNDARY-09, BOUNDARY-10, BOUNDARY-11, BOUNDARY-12
**Depends on:** Phase 10
**Plans:** 7 plans across 4 waves (parallel within wave)

Plans:
- [x] 10.1.1-tier-classification-PLAN.md — wave 1 — add `protostar.tier` to every package.json + rewrite AGENTS.md Authority Tiers table (BOUNDARY-01, BOUNDARY-02)
- [x] 10.1.2-back-edge-audit-PLAN.md — wave 2 — remove 3 phantom deps (intent->authority, repo->authority, repo->paths); add review tsconfig refs to delivery+repair; document 3 accepted back-edges in AGENTS.md (BOUNDARY-11, BOUNDARY-12)
- [x] 10.1.3-network-no-fs-contracts-PLAN.md — wave 3 — add no-fs.contract.test.ts to lmstudio-adapter; verify evaluation-runner contract preserved (BOUNDARY-03, BOUNDARY-04)
- [x] 10.1.4-pure-no-net-contracts-PLAN.md — wave 3 — add no-net.contract.test.ts to 12 pure-tier packages (BOUNDARY-05)
- [x] 10.1.5-manifest-hygiene-sweep-PLAN.md — wave 3 — public-flip + engines + sideEffects sweep across 19 packages/* manifests; install knip + tools/check-subpath-exports.ts; wire into verify (BOUNDARY-07, BOUNDARY-08, BOUNDARY-09; also lands Phase 10 Q-17 + Q-19)
- [x] 10.1.6-factory-cli-publish-wiring-PLAN.md — wave 3 — flip apps/factory-cli to publish-ready + tools/factory-cli-pack-smoke.sh (BOUNDARY-10)
- [x] 10.1.7-workspace-conformance-gate-PLAN.md — wave 4 — packages/admission-e2e/src/tier-conformance.contract.test.ts (flat top — NOT in subdirectory) asserting tier rules + dep-direction + tsconfig refs alignment + no-fs presence + sideEffects + engines + acyclic dep graph (BOUNDARY-06)

## Phase 11 — Headless Mode + E2E Stress

**Goal:** Run the factory in fully headless CI mode and stress-test the full E2E pipeline against synthetic load until we can build and deliver a Tauri-based tic-tac-toe game in `../protostar-toy-ttt`.

**Requirements:** STRESS-01, STRESS-02, STRESS-03, STRESS-04, STRESS-05, STRESS-06, STRESS-07, STRESS-08, STRESS-09, STRESS-10, STRESS-11, STRESS-12, STRESS-13, STRESS-14

**Success criteria:**
- Factory runs end-to-end without an interactive operator (driven from CI / cron / detached runner) — no operator-attached terminal required for any successful path
- Pipeline survives sustained-load, concurrency, and fault-injection stress sessions without a wedge, artifact corruption, prompt hang, secret leak, or merge/update-branch authority
- A working Tauri-based tic-tac-toe game is delivered to `../protostar-toy-ttt` via a factory PR with CI green, Playwright E2E pass, property test pass, and Tauri debug build evidence
- Phase 11 stress evidence is written to `.protostar/stress/<sessionId>/stress-report.json` and append-only `.protostar/stress/<sessionId>/events.jsonl`; no HTTP dashboard/server is added in Phase 11
- The final gate is the Boolean conjunction `(ttt-delivered AND stress-clean)`

**Plans:** 15 plans across 8 waves

Plans:
- [x] 11-01-requirements-traceability-PLAN.md — W0 — STRESS-01 requirements/roadmap/validation traceability
- [x] 11-02-archetype-admission-lift-PLAN.md — W1; deps: 11-01 — all-three narrow `feature-add`/`bugfix`/`refactor` admission lift with exact repair-loop caps
- [x] 11-04-immutable-toy-verification-PLAN.md — W1; deps: 11-01 — Wave 1 preflight/refusal plus operator-authored setup gate for immutable toy verification files
- [x] 11-05-headless-mode-config-cli-PLAN.md — W1; deps: 11-01 — `factory.headlessMode`, `factory.stress.caps`, `--headless-mode`, non-interactive CLI support, and all-three headless setup docs
- [x] 11-08-stress-artifact-schema-and-events-PLAN.md — W1; deps: 11-01 — canonical `stress-report.json`, append-only `events.jsonl`, and R2 no-dashboard contract
- [x] 11-03-seed-library-ttt-PLAN.md — W2; deps: 11-01, 11-02 — per-archetype seed library and `feature-add/ttt-game` seed
- [x] 11-06-llm-backend-selection-PLAN.md — W2; deps: 11-05 — `factory.llmBackend`, `--llm-backend`, and LM Studio default-preserving selector
- [x] 11-12-pnpm-add-allowlist-PLAN.md — W2; deps: 11-02, 11-04 — feature-add `pnpm.allowedAdds`, bounded multi-file admission, immutable-file refusal, and repo-owned exact `pnpm add` allowlist
- [x] 11-07-hosted-and-mock-adapters-PLAN.md — W3; deps: 11-06 — hosted OpenAI-compatible adapter package and hosted package wiring
- [x] 11-09-stress-session-core-PLAN.md — W3; deps: 11-06, 11-08 — shared stress session paths, seed/draft/sign input preparation, append writer, stress cap resolver/breach evidence, and prune extension
- [ ] 11-15-mock-adapter-selector-wiring-PLAN.md — W4; deps: 11-06, 11-07 — deterministic mock adapter package plus hosted/mock selector wiring
- [ ] 11-10-sustained-load-bash-driver-PLAN.md — W5; deps: 11-05, 11-09, 11-15 — `scripts/stress.sh` for sustained-load only
- [ ] 11-11-concurrency-fault-ts-driver-PLAN.md — W5; deps: 11-09, 11-15 — TypeScript concurrency and fault-injection stress runner covering `network-drop`, `llm-timeout`, `disk-full`, and `abort-signal`
- [ ] 11-13-ci-headless-security-gates-PLAN.md — W6; deps: 11-05, 11-07, 11-10, 11-11, 11-12, 11-15 — PR mock smokes, all-three headless-mode setup contracts, no-prompt, secret-redaction, no-merge, and security review gates
- [ ] 11-14-ttt-delivery-and-stress-gate-PLAN.md — W7; deps: 11-02, 11-03, 11-04, 11-09, 11-10, 11-11, 11-12, 11-13, 11-15 — final non-autonomous `(ttt-delivered AND stress-clean)` evidence gate, TTT 50-attempt/14-day caps, and all four fault scenarios

**Notes:** Phase 11 chooses Q-17 R2: append-only `.protostar/stress/<sessionId>/events.jsonl` and no HTTP dashboard/server. LM Studio remains the default backend; hosted OpenAI-compatible and deterministic mock backends are sibling packages behind the existing `ExecutionAdapter` contract. The toy repo verification files are operator-authored preconditions and immutable from factory-generated plans. Stress and TTT runs use materialized draft files plus signed confirmed-intent files before `protostar-factory run`. PR CI gets fast mock smokes; full stress caps are manual/scheduled phase-gate evidence.

## Phase 12 — Authority Boundary Stabilization

**Goal:** Re-seal the authority boundary after the v1 dogfood pass — make CI green again, route mechanical review through `@protostar/repo`'s hardened subprocess runner, scrub child-process env by default, tighten `applyChangeSet`'s display-vs-write invariant, and reconcile the duplicated tier/boundary encoding so manifests, AGENTS.md, and contract tests agree.

**Requirements:** AUTH-01..AUTH-16 (see REQUIREMENTS.md §"Phase 12"). AUTH-16 is the pre-phase ordering check (no test artifact).

**Plans:** 8 plans in 5 waves
- [ ] 12-01-verify-collapse-PLAN.md — W0; deps: — — Unify `verify` script + add AUTH-01..AUTH-16 block to REQUIREMENTS.md (AUTH-01, AUTH-16)
- [ ] 12-02-schema-cascade-PLAN.md — W0; deps: — — Bump confirmed-intent 1.5.0 → 1.6.0; cascade 25 source files; re-sign 2 example intents; rename signed-intent test (AUTH-04)
- [ ] 12-03-diff-name-only-relocate-PLAN.md — W0; deps: — — Move `computeDiffNameOnly` (and isomorphic-git) from `@protostar/mechanical-checks` → `@protostar/repo`; reshape adapter (AUTH-02)
- [ ] 12-04-subprocess-env-and-redact-PLAN.md — W1; deps: 12-01, 12-03 — subprocess-runner POSIX baseline + required `inheritEnv`; lift TOKEN_PATTERNS into `@protostar/delivery/redact`; env-empty-default contract test (AUTH-06, AUTH-07, AUTH-08)
- [ ] 12-05-patch-request-brand-PLAN.md — W1; deps: 12-01, 12-04 — `canonicalizeRelativePath` in `@protostar/paths`; brand `PatchRequest` + `mintPatchRequest`; `applyChangeSet` re-assertion; mismatch contract test (AUTH-09, AUTH-10)
- [ ] 12-06-mechanical-via-repo-and-wiring-PLAN.md — W2; deps: 12-02, 12-03, 12-04, 12-05 — Closed mechanical command bindings in `@protostar/repo`; extract `wiring/{command-execution,delivery}.ts`; delete raw spawn from `main.ts`; close operator config schema enum (AUTH-03, AUTH-05, AUTH-14)
- [ ] 12-07-tier-conformance-three-way-PLAN.md — W3; deps: 12-03 — Flip evaluation-runner authority-boundary entry to network; extend `tier-conformance.contract.test.ts` to assert manifest == AGENTS.md == authority-boundary entry per package (AUTH-11, AUTH-12, AUTH-13)
- [ ] 12-08-secret-leak-and-dogfood-PLAN.md — W4; deps: 12-02, 12-04, 12-06, 12-07 — Secret-leak attack test (sentinel token + shared TOKEN_PATTERNS); operator-driven Phase 10 dogfood re-run on protostar-toy-ttt (AUTH-15)

**Success criteria:**
- `pnpm run verify` is the single unified script — green locally and in `.github/workflows/verify.yml`. `verify:full` is gone.
- `@protostar/mechanical-checks` no-net contract holds in production — `diff-name-only` and its `isomorphic-git` import live in `@protostar/repo`; mechanical-checks stays `pure`.
- Configured mechanical commands flow through `@protostar/repo`'s allowlist + per-command schema + refusal-evidence runner — no raw `spawn` in `apps/factory-cli/src/main.ts`. Operator config schema is a closed enum of `["verify","typecheck","lint","test"]`.
- `packages/repo/src/subprocess-runner.ts` defaults child env to a tiny POSIX baseline; callers MUST declare `inheritEnv` (required field). `PROTOSTAR_GITHUB_TOKEN` cannot appear in any `inheritEnv` literal (static contract test).
- `applyChangeSet` refuses when `PatchRequest.path`, `patch.op.path`, and parsed-diff filename disagree — both at admission (`mintPatchRequest`) and as defense-in-depth at function entry. Equality is exact-string after canonicalization through one shared helper in `@protostar/paths`.
- Boundary tiers have one source of truth — `package.json` `protostar.tier` is canonical; AGENTS.md table and `authority-boundary.contract.test.ts` are cross-asserted by `tier-conformance.contract.test.ts`. `evaluation-runner` is `network` in all three sources.
- Done-criteria: secret-leak attack test green (sentinel token absent from persisted artifacts; shares `TOKEN_PATTERNS` with the runtime filter); Phase 10 dogfood loop re-runs end-to-end ≥3 times on protostar-toy-ttt with ≥2/3 reaching pr-ready.

**Notes:** Seeded by post-v1 review findings (verify-gate divergence, mechanical-argv bypass, env leakage, apply-change-set display-vs-write split, manifest-vs-contract drift). Decomposition allowed for `apps/factory-cli/src/wiring/{command-execution,delivery}.ts` only — `packages/planning/src/index.ts` (5701 LOC) decomposition is explicitly deferred to Phase 13. AUTH-16 (Phase ordering: 12 runs after 11) is a pre-phase orchestrator check with no test artifact.

## Phase 13 — Replay-with-Edit for Run Bundles

**Goal:** Take a failed Protostar run bundle, let an operator edit a single recorded artifact (judge verdict, reviewer comment, task result, LLM completion), and replay the run deterministically from that point forward — reusing every prior recorded artifact unchanged. Counterfactual debugging without re-running upstream stages.

**Requirements:** *(to be derived from `13-CONTEXT.md`; tentative theme: REPLAY-01..REPLAY-N covering bundle addressing, edit surface, determinism contract, downstream replay scope, CLI ergonomics, authority-boundary behaviour, eval integration)*

**Depends on:** Phase 9 (operator surface + run-bundle layout), Phase 12 (authority boundary stable so replay cannot accidentally re-enter delivery)

**Success criteria:**
- Operator can replay a run from `.protostar/runs/<run-id>/` with one or more recorded artifacts swapped, and the replayed run is deterministic — identical edited prefix → identical downstream artifacts (verified by content-hash comparison on a fixture)
- Edit surface covers at minimum: judge verdict, reviewer comment, task result, raw LLM completion — schema and CLI contract pinned in SEED
- Replay-with-edit defaults to **no delivery** — no PRs, no pushes; opt-in flag required and audited
- A failing-run regression fixture is committed to `packages/admission-e2e/` (or successor) showing edit→replay→pass and edit→replay→still-fail paths
- Replayed runs are stored as a sibling artifact addressable from the original run bundle (overlay manifest vs. sibling bundle decided in CONTEXT) — original bundle is never mutated
- Eval integration path is decided (Phase 8 counterfactual signal in-scope vs. deferred) and documented

**Notes:** Seeded by the dogfood post-mortem cost observed in Phase 10 + 11 — failed runs currently require hand-reading bundle JSON to reason about "would judge X have unblocked this?". Replay-with-edit turns that into a one-command experiment. Builds on the content-addressed append-only run-bundle layout from Phase 9. Must compose cleanly with Phase 12's authority hardening: replay cannot bypass admission, cannot reach delivery without explicit opt-in, and must surface refusal evidence the same way a fresh run does.

## Phase 14 — Pluggable Validation Reports

**Goal:** Add a save-time validation style alongside the existing admission gates: given an intent / plan / config / change-set, return a *report* that lists **all** blockers and warnings anchored to specific nodes (JSON pointers, plan IDs, capability fields, config paths) instead of failing on the first issue. Validators are pluggable and reports are first-class, schema-versioned artifacts. Admission posture (default-DENY, fail-closed) is preserved — reports compose with gates, they do not replace them.

**Requirements:** *(to be derived from `14-CONTEXT.md`; tentative theme: VALID-01..VALID-N covering validator plugin contract, report schema, anchor format, severity model, admission-gate composition, artifact persistence, CLI/operator rendering, determinism + version pinning)*

**Depends on:** Phase 1 (intent admission contracts), Phase 2 (authority/governance — capability + repo policy are validation targets), Phase 12 (authority boundary stable so validator chain has a single truth source)

**Success criteria:**
- A single validation pass over a malformed intent / plan / capability envelope / repo policy returns **all** findings in one report — operators no longer have to fix-one, re-run, repeat
- Each finding is anchored to a specific node (JSON Pointer or domain path like `plans[03].waves[2]`) and carries severity, validator id+version, and a stable code
- Validators are registered through a plugin contract in a `@protostar/validation` (or equivalent) workspace; adding a new validator does not require changes to the gate runner or admission packages
- Report schema is versioned (`schemaVersion`) and persisted as a first-class artifact (location decided in CONTEXT — e.g. `.protostar/runs/<id>/validation/<artifact>.report.json`); the original artifact is never mutated by validation
- Admission gates compose with reports — gate outcome = `report.blockers.length === 0` for the validated artifact, with no behaviour regression vs. existing fail-closed posture (proven by contract test)
- Determinism: same input + same registered validators (with pinned versions) → byte-identical report (verified by content-hash on a fixture)
- CLI renders reports grouped by severity and anchor path; an operator-surface entry can diff two reports for an edited artifact (composes with Phase 13 replay-with-edit)

**Notes:** Seeded by author-experience cost observed during Phases 10–11: a single bad config field can take 3–5 round-trips to discover all issues under the current first-fail gate UX. This phase is intentionally *additive* — gates keep their fail-closed posture; reports surface the same constraints earlier and in bulk. Composes naturally with Phase 13's replay-with-edit, which becomes substantially more useful when each replayed artifact carries a full validation report rather than a single first-fail message.

## Phase 15 — Prompt Partials / Pinned Prompt Modules

**Goal:** Versioned, reusable prompt fragments for reviewer / producer / evaluator roles so Protostar's model-facing contracts can be evolved safely. Replace ad-hoc inline prompt strings with a registry of pinned partials addressed by id+version, composed into role prompts at runtime, and persisted to run bundles so every artifact records exactly which prompt fragments produced it.

**Requirements:** *(to be derived from `15-CONTEXT.md`; tentative theme: PROMPT-01..PROMPT-N covering partial registry + addressing, role-prompt composition contract, version pinning + change policy, run-bundle provenance, evaluation/diff tooling, authority-boundary behaviour, determinism)*

**Depends on:** Phase 8 (evaluation harness — needs to evaluate prompt deltas), Phase 9 (run-bundle layout — partial provenance is recorded there), Phase 13 (replay-with-edit composes with prompt-partial swaps)

**Success criteria:**
- Reviewer / producer / evaluator role prompts are composed from a registry of addressable partials (id + semver-or-content-hash); no role prompt is constructed from raw inline strings outside the registry
- Every run bundle records the exact partial id+version set that produced each model-facing artifact — `.protostar/runs/<id>/...` is sufficient to reconstruct the prompt without re-reading source
- Partial changes are versioned and reviewable as artifacts (not silent string edits); a contract test fails if a partial is mutated in place without a version bump
- Determinism: same partial set + same inputs → byte-identical composed prompt (verified by content-hash on a fixture)
- Eval integration (Phase 8): comparing two runs that differ only in one partial version produces a clean A/B signal — partial id is a first-class dimension in eval reports
- Replay integration (Phase 13): replay-with-edit can swap a partial version on a recorded run and replay deterministically downstream
- Authority boundary preserved: partial registry lives in a pure-tier package; only the factory-cli composes prompts at the boundary

**Notes:** Seeded as a `/gsd-add-phase` capture from the operator — model-facing contracts are currently inline strings scattered across reviewer/producer/evaluator code paths, which makes safe evolution of those prompts hard to review and impossible to A/B cleanly. Phase 15 turns prompts into versioned artifacts the same way Phase 14 turns validation findings into versioned reports.

## Phase 16 — Trace / Dataflow Inspector

**Goal:** `protostar inspect` should feel closer to a real trace debugger than a directory dump — surface stage inputs/outputs, authority decisions, variable bindings, refusal reasons, and repair-loop history along a single navigable timeline anchored to the run bundle.

**Requirements:** *(to be derived from `16-CONTEXT.md`; tentative theme: INSPECT-01..INSPECT-N covering timeline model, stage I/O addressing, authority-decision rendering, variable/binding scopes, refusal-evidence linkage, repair-loop history, navigation/diff ergonomics, determinism + offline operation)*

**Depends on:** Phase 9 (operator surface + run-bundle layout — inspector reads bundles), Phase 12 (authority boundary stable so authority-decision view has a single truth source), Phase 13 (replay-with-edit — inspector is the natural launchpad for picking the artifact to edit), Phase 14 (validation reports — anchors render in the same timeline)

**Success criteria:**
- A single `protostar inspect <run-id>` view walks every stage in order with inputs, outputs, authority decisions, refusal artifacts, and repair-loop iterations linked inline — operator no longer hand-reads bundle JSON
- Each timeline node is addressable (run-id + stable node id) and links back to the underlying artifact path under `.protostar/runs/<run-id>/...` — no inspector-only state
- Variable / binding scopes (ConfirmedIntent fields, capability envelope, repo policy resolution) render at the point they're consumed, not just where they're produced
- Refusal reasons render with their evidence artifact + per-gate decision — no "denied" without a clickable why
- Repair-loop history shows iteration N → N+1 deltas (changed task results, changed reviewer comments) instead of dumping every iteration as a sibling directory
- Inspector is read-only and offline: no network, no model calls, no mutation of the run bundle (verified by no-net + no-fs-write contract tests in the inspector workspace)
- Composes with Phase 13: an inspector node can be passed directly to replay-with-edit as the edit target; composes with Phase 14: validation reports render as anchors on the same timeline

**Notes:** Seeded by author cost observed across Phases 10–12 dogfood — debugging a failed run today means hand-walking JSON across `.protostar/runs/<id>/...`. The inspector turns the run bundle into a first-class debugging surface and becomes the operator entry point that Phases 13 (replay-with-edit) and 14 (validation reports) compose into.

## Phase 17 — Happy-Path Prune Policy

**Goal:** Absorb the operational rule *"delete on happy path, preserve failed runs, sweep old dirs"* into Protostar's prune direction. Make `.protostar/runs/` self-maintaining: successful runs that have already produced their evidence bundle (and, where applicable, a delivered PR) are reaped automatically, failed / blocked / refused runs are retained for forensic replay, and stale directories beyond a configured horizon are swept regardless of verdict.

**Requirements:** *(to be derived from `17-CONTEXT.md`; tentative theme: PRUNE-01..PRUNE-N covering happy-path detection, failure-preservation predicate, sweep horizon + active-guard, dry-run + audit log, CLI surface, eval/replay composition, authority-boundary behaviour)*

**Depends on:** Phase 9 (operator surface — `prune` command and run-bundle layout), Phase 13 (replay-with-edit — preserved failed runs are replay inputs), Phase 16 (trace inspector — preserved failed runs are inspector inputs)

**Success criteria:**
- `protostar-factory prune` reaps successful runs by default — definition of "successful" is a single predicate (verdict + delivery state) pinned in CONTEXT and contract-tested; no manual `--all` flag required for the happy path
- Failed / blocked / refused / cancelled / orphaned runs are **never** auto-deleted — preservation predicate is contract-tested against the full `FactoryRunStatus` enum so a new status defaults to *preserve*, not *delete*
- A separate sweep horizon (`--older-than`, default decided in CONTEXT) deletes runs of any verdict past the horizon, with the active-guard from Phase 9 OP-08 still honored
- Pruning is observable: every reaped/preserved/swept decision lands in an audit JSONL alongside the run-bundle root, and `--dry-run` prints the same plan without filesystem effects
- A scheduled / idle-trigger prune mode is wired so `.protostar/runs/` doesn't accumulate (Phase 9 OP-08 risk register entry — observed 208 runs/day during scaffold work — is closed)
- Replay (Phase 13) and inspect (Phase 16) regression fixtures show that a preserved failed run remains addressable after a happy-path prune cycle (verified by content-hash on the preserved bundle)
- Authority boundary preserved: prune logic lives behind `@protostar/repo`'s filesystem authority; CLI composes the policy, repo enforces the writes

**Notes:** Seeded by an operator capture on 2026-04-29 — the v0.1 dogfood loop demonstrated that successful cosmetic-tweak runs are cheap to reproduce but expensive to store, while failed runs are the only artifacts worth keeping for replay/inspect. Phase 17 turns that asymmetry into Protostar's default disk posture instead of a manual operator chore. Composes naturally with Phases 13 and 16 (preserved failures are the corpus those tools operate on) and closes the open OP-08 risk-register entry.

## Phase 18 — Typed Factory Recipes (Paved-Road Templates)

**Goal:** Ship a small, source-backed library of typed factory **recipes** that emit known-safe artifacts — intent draft skeletons, factory config fragments, mechanical check profiles, review/eval policy defaults, operator docs — for the most common Protostar paths. Recipes are *materializers*, not a workflow authoring surface: every recipe still goes through normal admission (capability envelope, signed intent, repo policy, review authorization, delivery gates). The steal from CodeFlow's visual templates (review-loop-pair, hitl-approval-gate, setup-loop-finalize, lifecycle-wrapper) is **paved roads, not a second control plane**.

**Requirements:** *(to be derived from `18-CONTEXT.md`; tentative theme: RECIPE-01..RECIPE-N covering recipe registry + addressing, materializer contract, admission-pass-through guarantee, artifact-set schema, operator CLI surface, version pinning + provenance, authority-boundary behaviour)*

**Depends on:** Phase 1 (intent admission contracts — recipes emit drafts that must admit), Phase 2 (capability envelope — recipes set defaults but never bypass), Phase 7 (delivery gates — `human-delivery-gate` recipe composes here), Phase 10 (dogfood harness — `dogfood-batch` recipe encodes the existing repeat-run shape), Phase 12 (authority boundary stable so recipes target a single truth source)

**Success criteria:**
- `protostar-factory recipes list` and `protostar-factory recipes materialize <name>` are wired with a typed registry; no string-keyed lookup outside the registry
- Five recipes ship in v1: `cosmetic-pr` (single-file cap, pnpm verify, gated PR delivery, no auto-merge), `review-repair-loop` (default `maxRepairLoops`, judge prompts, repair-evidence shape, refusal handling), `human-delivery-gate` (always pause before PR creation / final delivery evidence publication), `dogfood-batch` (N attempts, pass-rate record, preserved failed workdirs, calibration notes), `phase-lifecycle` (intent → plan → execute → review → evaluate → deliver with stage evidence expectations predeclared)
- **Admission-pass-through** is contract-tested: a recipe-materialized run takes the same admission path as a hand-authored run — capability envelope, signed intent, repo policy, review authorization, and delivery gates all fire identically (proven by per-recipe e2e fixture)
- Recipes **never** mutate authority defaults toward looser; a recipe attempting to widen capability envelope, skip review, or auto-merge fails a static check at registration time
- Every materialized artifact set carries provenance: recipe id + version + content-hash recorded in the run bundle so an operator can answer "which recipe produced this run" from `.protostar/runs/<id>/...` alone
- Recipes are versioned; mutating a recipe in place without a version bump fails a contract test (matches the Phase 15 prompt-partial change-policy pattern)
- No visual / graph authoring surface ships with this phase — recipes are typed code, not data the operator can freely compose into new stage graphs (explicit non-goal documented in CONTEXT)
- Operator docs render alongside the materialized artifacts (per-recipe README emitted into the target directory) so a new contributor can run `cosmetic-pr` end-to-end without hand-reading the factory source

**Notes:** Seeded by an operator capture on 2026-04-29 comparing CodeFlow's source-backed templates (review-loop-pair, hitl-approval-gate, setup-loop-finalize, lifecycle-wrapper) against Protostar's current "hand-author every intent + config" cost. The translation is deliberate: CodeFlow uses templates as a *visual workflow authoring* affordance; Protostar uses recipes as *paved-road materializers* over its existing admission graph. Visual stage-graph authoring is an **explicit non-goal** for v1 — Protostar's strongest property right now is that authority is boring and explicit, and arbitrary graph authoring would create a second policy language before the current one is fully hardened. The `cosmetic-pr` recipe directly absorbs the v0.1 thin-slice (locked 2026-04-24) so the happy-path starter stops being a bespoke fixture. `dogfood-batch` directly encodes the Phase 10/11 dogfood harness shape so calibration runs become a one-command operation. `phase-lifecycle` is a `.planning`-scoped recipe — useful for new contributors orienting on the factory lifecycle without hand-reading half the repo.

## Cross-Phase Constraints

- **Strict TypeScript posture:** `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` apply to every phase; no opt-outs
- **ESM only:** all new modules use `module: NodeNext` with `.js` import suffixes
- **Domain-first packages:** no `utils` / `agents` / `factory` catch-all; if multiple stages need a type, lift it to the upstream stage
- **Authority boundary:** only `apps/factory-cli` and `packages/repo` may touch the filesystem
- **Stage forward-only data:** later stages must consume durable artifacts via admission helpers, never reach back into earlier stages' private state
- **Dark autonomy:** no progress logs; the only human-facing output is the evidence bundle and hard-failure errors

## Risk Register

| Risk | Phase | Mitigation |
|------|-------|------------|
| `@dogpile/sdk` link blocks fresh contributors | 3 | REPO-08 — publish, vendor, or pinned tarball before adding contributors |
| Stubbed evaluation lies in artifacts shipped pre-Phase 8 | 8 | EVAL-04 — remove stubs the moment semantic + consensus land; add contract test that no stub status is emitted |
| Repair loop runaway under live execution | 4, 5 | EXEC-06 + LOOP-04 — capability envelope budget enforced at every retry |
| Subprocess injection via PR title / branch name | 3, 7 | REPO-04 + DELIVER-02 — allowlist + arg-array validation, never shell strings |
| `.protostar/runs/` accumulates unbounded | 9 | OP-08 — pruning recipe; observed 208 runs in one day during scaffold work |

---
*Roadmap defined: 2026-04-26 from operator-supplied 10-phase v1 ordering*
