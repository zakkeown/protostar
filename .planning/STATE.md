# Project State

**Last updated:** 2026-04-28

## Project

- **Name:** Protostar Factory
- **Vision:** Dark software factory control plane — humans confirm intent + review evidence; everything between runs autonomously
- **Current milestone:** v1 (10-phase roadmap)
- **Ordering principle:** *Admit safely, authorize narrowly, mutate carefully, review relentlessly, deliver only after proof.*

## Workflow

- **Mode:** YOLO
- **Granularity:** Standard (10 phases for v1)
- **Parallelization:** On
- **Commit planning docs:** Yes
- **Research before each phase:** Yes
- **Plan check:** Yes
- **Verifier:** Yes
- **Nyquist validation:** Yes
- **Auto-advance:** Yes
- **Model profile:** Balanced

## Current Phase

**Phase 5 — Review → Repair → Review Loop** (in progress)

Phase 5 is making the review-repair loop boundary real. Wave 0 is complete: `@protostar/repair` and `@protostar/mechanical-checks` now exist as workspace skeletons, confirmed-intent is bumped to schema `1.4.0` with `budget.maxRepairLoops`, and `PlanTask.acceptanceTestRefs` is available for downstream AC coverage work. Wave 1 pinned the shared repair/review/delivery/lifecycle contracts, with cycle-neutral `RepairContext` and `ExecutionRunResult` in `@protostar/planning`. Wave 2 has progressed: Plan 05-05 implemented pure repair plan synthesis and dependent-subgraph computation, Plan 05-06 extended execution adapter context and retry evidence for repair iterations, Plan 05-08 added the shared LM Studio client plus panel-of-one judge adapter, and Plan 05-09 added the per-task `applyChangeSet` cosmetic multi-file gate. Wave 3 is complete: Plan 05-11 now rejects structurally valid candidate plans whose `acceptanceTestRefs` do not cover every confirmed-intent AC, and Plan 05-07 implements the mechanical-checks adapter, run-level diff-name-only evidence, and command/AC findings.

**Next action:** Continue Phase 5 Wave 4 with `runReviewRepairLoop` after updating out-of-scope factory-cli inline planning fixtures before treating repo-wide `verify:full` as green under the universal AC-ref rule.

## Phase Status

| # | Phase | Status |
|---|-------|--------|
| 1 | Intent + Planning Admission | ✅ Complete (2026-04-27) |
| 2 | Authority + Governance Kernel | In progress — Waves 5–7 complete (Plans 11–15); awaiting re-verification |
| 3 | Repo Runtime + Sandbox | In progress — Plans 03-01 through 03-13 complete; phase not verified |
| 4 | Execution Engine | Automated verification passed — human LM Studio smoke pending |
| 5 | Review → Repair → Review Loop | In progress — Wave 3 started; 05-05, 05-06, 05-08, 05-09, and 05-11 complete |
| 6 | Live Dogpile Piles | Pending |
| 7 | Delivery | Pending |
| 8 | Evaluation + Evolution | Pending |
| 9 | Operator Surface + Resumability | Pending |
| 10 | V1 Hardening + Dogfood | Pending |

## Active Documents

- `.planning/PROJECT.md` — project context
- `.planning/REQUIREMENTS.md` — 65 v1 requirements mapped to 10 phases
- `.planning/ROADMAP.md` — phase-by-phase plan with success criteria
- `.planning/config.json` — workflow toggles
- `.planning/codebase/` — 7 codebase-map docs (committed `7922e3e`)

## Recent Sessions

- **2026-04-28:** Completed Phase 5 Plan 07 (`05-07-mechanical-checks-adapter-PLAN.md`): added `createMechanicalChecksAdapter`, `computeDiffNameOnly`, and `buildFindings` under `@protostar/mechanical-checks`; command execution, readFile, and git fs access are injected capabilities. `pnpm --filter @protostar/mechanical-checks build` and `pnpm --filter @protostar/mechanical-checks test` passed with 19 tests; repo-wide `pnpm run verify` is blocked by out-of-scope factory-cli inline planning fixtures missing `acceptanceTestRefs`; `pnpm run factory` built then stopped at the expected workspace-trust gate.
- **2026-04-28:** Completed Phase 5 Plan 11 (`05-11-admission-rule-ac-coverage-PLAN.md`): added structural planning admission rejection for incomplete `task.acceptanceTestRefs` AC coverage, serialized `ac-coverage-incomplete` with `missingAcIds`, cascaded scaffold/Dogpile passing fixtures, and added `bad-ac-coverage-incomplete.json`. `pnpm --filter @protostar/policy test`, `pnpm --filter @protostar/planning test`, and `pnpm --filter @protostar/admission-e2e test` passed; repo-wide `pnpm run verify:full` is blocked by out-of-scope factory-cli inline planning fixtures that still need `acceptanceTestRefs`.
- **2026-04-28:** Completed Phase 5 Plan 05 (`05-05-synthesize-repair-plan-PLAN.md`): added pure `computeRepairSubgraph` for repair seeds plus descendants in admitted-plan order, added pure `synthesizeRepairPlan` fan-in from mechanical findings and judge critiques, and exported both from `@protostar/repair`. `pnpm --filter @protostar/repair build && pnpm --filter @protostar/repair test` passed with 13 tests; `pnpm run verify` passed.
- **2026-04-28:** Completed Phase 5 Plan 08 (`05-08-judge-adapter-PLAN.md`): extracted shared LM Studio chat/preflight helpers, refactored the coder adapter onto the shared client, added `createLmstudioJudgeAdapter` with panel-of-one `JudgeCritique` output and `LmstudioJudgeParseError`, and extended factory-config schema/resolver coverage for `adapters.judge`. `pnpm --filter @protostar/lmstudio-adapter test` and `pnpm run verify` passed; `pnpm run factory` built then stopped at the expected workspace-trust gate.
- **2026-04-28:** Completed Phase 5 Plan 09 (`05-09-apply-change-set-cosmetic-gate-PLAN.md`): added optional `applyChangeSet` archetype metadata, refused multi-file `cosmetic-tweak` change sets with `cosmetic-archetype-multifile` before any writes, and expanded apply-change-set coverage to 14 tests. `pnpm --filter @protostar/repo test` passed; the shared-wave lmstudio-adapter blocker was cleared by Plan 05-08 and root `pnpm run verify` now passes.
- **2026-04-28:** Completed Phase 5 Plan 03 (`05-03-schema-bumps-PLAN.md`): bumped confirmed-intent to schema `1.4.0`, added `capabilityEnvelope.budget.maxRepairLoops` default/range handling, added `PlanTask.acceptanceTestRefs`, cascaded signed/test fixtures, and verified with `pnpm run verify:full`. `pnpm run factory` built then stopped at the expected workspace-trust gate.
- **2026-04-28:** Completed Phase 5 Plan 06 (`05-06-adapter-context-repair-extension-PLAN.md`): added planning-owned `RepairContext` to `AdapterContext`, widened adapter and task journal retry reasons with `"repair"`, and verified with `pnpm --filter @protostar/execution build`, `pnpm --filter @protostar/execution test`, and `pnpm -w exec tsc --build packages/planning packages/execution packages/review`. Root `pnpm run verify` is currently blocked by unrelated concurrent lmstudio-adapter/factory-cli edits.
- **2026-04-28:** Completed Phase 5 Plan 04 (`05-04-review-types-and-brands-PLAN.md`): added planning-owned `RepairContext`/`ExecutionRunResult`, review-owned repair/model/judge contracts, private-symbol `DeliveryAuthorization`, strict pass/pass `ReviewDecisionArtifact`, seven-kind `ReviewLifecycleEvent`, and review barrel exports. `pnpm --filter @protostar/review test` and `pnpm -w exec tsc --build packages/planning packages/execution packages/review` passed; root `pnpm run verify` still hits the known factory-cli `runRealExecution` cancellation cluster.
- **2026-04-28:** Executed Phase 4 (`execution-engine`): completed all 10 plans across waves 0-4, fixed review blockers in real-executor authority/outcome handling, added stdout/stderr evidence streams, refreshed code review with zero findings, and re-verified 12/12 automated must-haves. `pnpm run verify` passed; `pnpm run factory` built then stopped at the expected workspace-trust gate. Remaining: live LM Studio real-executor operator smoke with `qwen3-coder-next-mlx-4bit`.
- **2026-04-28:** Completed Phase 5 Plan 01 (`05-01-repair-package-skeleton-PLAN.md`): added the `@protostar/repair` workspace skeleton, declared pure-transform dependencies on review/planning/intent, registered the package in pnpm workspace metadata and root TypeScript references, and added the repair zero-test hook to root `pnpm run verify`. `pnpm install`, `pnpm --filter @protostar/repair build`, and `pnpm run verify` passed.
- **2026-04-28:** Completed Phase 5 Plan 02 (`05-02-mechanical-checks-package-skeleton-PLAN.md`): added the `@protostar/mechanical-checks` workspace skeleton, declared execution/repo/intent/review dependencies, registered the package in pnpm and TypeScript project references, and added a throwing `createMechanicalChecksAdapter` placeholder for downstream imports. `pnpm install`, `pnpm install --filter @protostar/mechanical-checks...`, and `pnpm --filter @protostar/mechanical-checks build` passed; repo-wide `pnpm run verify` reached an unrelated factory-cli `runRealExecution` cancellation failure.
- **2026-04-27:** Planned Phase 5 (`review-repair-loop`): 13 PLAN.md files across 7 waves covering all 18 CONTEXT.md decisions and LOOP-01..LOOP-06. Plan-checker verified iteration 2/3 after the planner relocated `RepairContext`/`AdapterAttemptRef`/`ExecutionRunResult`/`MechanicalCritiqueRef`/`ModelCritiqueRef` into `@protostar/planning` to break a review↔execution import cycle, fixed cascading wave numbers, added injected `readFile` + `RepoSubprocessRunner` capabilities to `@protostar/mechanical-checks` to honor the AGENTS.md fs-authority boundary, and pinned `appendFile` path-pattern verification for `review.jsonl` and per-iteration `iter-{N}/*.json` artifacts in 05-10 (Q-17/Q-18 verified at the Phase 5 boundary, not deferred to factory-cli wiring). Wave structure: 0 (skeletons + schema bumps) → 1 (types in planning) → 2 (transforms + adapter ctx + judge + per-task gate) → 3 (mechanical-checks adapter + AC-coverage admission rule) → 4 (loop body + persistence + DeliveryAuthorization mint) → 5 (factory-cli wiring) → 6 (Phase 7 delivery contract pin).
- **2026-04-27:** Completed Phase 3 Plan 13 (`03-13-dogpile-sdk-pin-and-fresh-clone-checkpoint-PLAN.md`): pinned `@dogpile/sdk@0.2.0` on `@protostar/dogpile-types`, replaced the local shim implementation with upstream re-exports, ran the approved no-sibling fresh-clone install smoke with `/Users/zakkeown/Code/dogpile` restored, and filled `03-VALIDATION.md` with a 33-row per-task validation map. `pnpm run verify:full` passed.
- **2026-04-27:** Completed Phase 3 Plan 12 (`03-12-admission-e2e-contract-suite-PLAN.md`): added five admission-e2e repo-runtime contract tests pinning hash-mismatch, 5-patch best-effort partial application, dirty-worktree refusal, symlink refusal, and subprocess allowlist/argv refusal evidence shapes. `pnpm --filter @protostar/admission-e2e test` passed with 60 tests; `pnpm run verify` passed.
- **2026-04-27:** Completed Phase 3 Plan 11 (`03-11-barrel-and-factory-cli-wiring-PLAN.md`): added `cleanupWorkspace` with success removal and failure tombstone retention, expanded the `@protostar/repo` barrel, replaced factory-cli `INIT_CWD` workspace-root resolution with `resolveWorkspaceRoot()`, and wired `runFactory` through clone, symlink audit evidence, dirty-worktree refusal, repo-runtime admission decisions, and cleanup/tombstone handling. `pnpm run verify:full` passed; `pnpm run factory` built then stopped at the expected workspace-trust gate.
- **2026-04-27:** Completed Phase 3 Plan 10 (`03-10-clone-and-dirty-and-policy-PLAN.md`): added `cloneWorkspace` with credentialRef auth, retry cancellation, mocked `git.clone` tests, HEAD resolution, and post-clone symlink audit; added `dirtyWorktreeStatus` with the CONFLICT-02 tracked-file statusMatrix filter; added repo runtime policy parsing/loading with Q-02 workspaceRoot recursive-clone refusal; exported repo-policy and repo-runtime admission-decision schemas. `pnpm --filter @protostar/repo test` and `pnpm run verify` passed; `pnpm run factory` built then stopped at the expected workspace-trust gate.
- **2026-04-27:** Completed Phase 3 Plan 09 (`03-09-subprocess-runner-PLAN.md`): added `runCommand` with pre-spawn allowlist/schema/argv validation, array-form `spawn` with `shell: false`, stdout/stderr stream-to-file capture, rolling tails, byte counts, timeout kill handling, and 10 subprocess runner integration tests. `pnpm --filter @protostar/repo test` and `pnpm run verify` passed; `pnpm run factory` built then stopped at the expected workspace-trust gate.
- **2026-04-27:** Completed Phase 3 Plan 07 (`03-07-apply-change-set-PLAN.md`): added `applyChangeSet` with SHA-256 pre-image gating, `diff.parsePatch`/`diff.applyPatch`, binary-marker refusal, no-hunk parse-error protection, best-effort ordered per-file `ApplyResult[]`, and 8 apply-change-set tests. `pnpm --filter @protostar/repo test` and `pnpm run verify` passed; `pnpm run factory` built then stopped at the expected workspace-trust gate.
- **2026-04-27:** Completed Phase 3 Plan 08 (`03-08-subprocess-allowlist-and-schemas-PLAN.md`): added frozen subprocess baseline allowlist, policy-extension union helper, outer argv guard with enumerated `ArgvViolation` reasons, frozen git/pnpm/node/tsc schemas, and 19 subprocess validation tests. `pnpm --filter @protostar/repo test` and `pnpm run verify` passed; `pnpm run factory` built then stopped at the expected workspace-trust gate.
- **2026-04-27:** Completed Phase 3 Plan 06 (`03-06-symlink-audit-PLAN.md`): added `auditSymlinks(workspaceRoot)` with Node 22 recursive `readdir`, stable workspace-relative POSIX offending paths, parentPath/path compatibility fallback, and 6 TDD audit tests covering clean, root, nested, multiple, outside-target, and broken symlinks.
- **2026-04-27:** Completed Phase 3 Plan 05 (`03-05-fs-adapter-PLAN.md`): added repo-owned `readFile`/`writeFile`/`deleteFile` adapter functions, `FsAdapterError` refusal reasons, lstat symlink refusal, workspace escape/canonicalization checks, and 8 TDD adapter tests.
- **2026-04-27:** Completed Phase 3 Plan 04 (`03-04-sacrificial-repo-test-fixture-PLAN.md`): added `buildSacrificialRepo` under `@protostar/repo/internal/test-fixtures`, backed by real `isomorphic-git` repos in tmpdir, with deterministic commits, branch/dirty/symlink options, subpath export wiring, and fixture self-tests.
- **2026-04-27:** Completed Phase 3 Plan 03 (`03-03-confirmed-intent-schema-bump-PLAN.md`): hard-bumped confirmed-intent to `schemaVersion: "1.2.0"`, added `capabilityEnvelope.workspace.allowDirty` defaulting and closed-key validation, cascaded signed-intent/authority/planning fixtures, and verified with `pnpm run verify:full`.
- **2026-04-27:** Completed Phase 3 Plan 01 (`03-01-conflict-errata-deps-and-env-PLAN.md`): recorded CONFLICT-01 erratum, rephrased runtime-dependency posture, pinned `isomorphic-git@1.37.6` + `diff@9.0.0` on `@protostar/repo`, added `.env.example`, ignored `.protostar/workspaces/`, and documented Phase 3 concerns.
- **2026-04-27:** Completed Phase 3 Plan 02 (`03-02-paths-package-and-agents-carveout-PLAN.md`): added `@protostar/paths` with synchronous `resolveWorkspaceRoot()` tests, registered the package in workspace/TypeScript metadata, and documented the AGENTS.md Q-15 scope-ceiling carve-out.
- **2026-04-27:** Completed Phase 2 Plan 10 (`02-10-admission-e2e-contract-suite-PLAN.md`): admission-e2e now pins all six Phase 2 authority brand public surfaces, enforces the authority no-fs regression, and verifies signed confirmed-intent artifacts through the stage reader with tamper coverage.
- **2026-04-27:** Planned Phase 2 gap closure after verification found 1/9 must-haves verified. Added Plans 11-15 for fail-closed precedence/gate evidence, AuthorizedOp resolved-envelope enforcement, verified two-key launch, stage-reader verified reads + JSONL compatibility, and schema parity/regression coverage.
- **2026-04-27:** Completed Phase 2 Plan 09 (`02-09-stage-reader-and-repo-runtime-PLAN.md`): added FsAdapter-injected `AuthorityStageReader`, legacy run fallback/upconversion, shared `assertTrustedWorkspaceForGrant`, intent admission trust enforcement, and repo runtime `WorkspaceTrustError` checks.
- **2026-04-27:** Completed Phase 2 Plan 08 (`02-08-two-key-launch-and-escalate-PLAN.md`): factory-cli now defaults workspace trust to untrusted, requires `--confirmed-intent` for trusted launch, removes the hardcoded trusted workspace, and writes `escalation-marker.json` with exit code 2 for escalate outcomes.
- **2026-04-27:** Completed Phase 2 Plan 07 (`02-07-factory-cli-per-gate-writer-PLAN.md`): factory-cli now writes five per-gate admission decisions, `admission-decisions.jsonl`, `policy-snapshot.json`, and signed `intent.json` for new runs.
- **2026-04-27:** Completed Phase 2 Plan 06b (`02-06b-per-gate-evidence-schemas-PLAN.md`): five owning-package per-gate admission-decision schemas now exist with strict inline base fields and package subpath exports.
- **2026-04-27:** Completed Phase 2 Plan 05 (`02-05-canonicalize-and-signature-PLAN.md`): authority signature helpers now provide fail-closed `json-c14n@1.0`, policy snapshot hashing, signed-intent envelope builders, and the central `verifyConfirmedIntentSignature` verifier.
- **2026-04-27:** Completed Phase 2 Plan 04 (`02-04-precedence-kernel-PLAN.md`): precedence intersection now emits branded `PrecedenceDecision` values with full blockedBy evidence, and repo-policy parsing ships with the A3 `DENY_ALL_REPO_POLICY` fallback.
- **2026-04-27:** Completed Phase 2 Plan 03 (`02-03-signature-envelope-extension-PLAN.md`): confirmed-intent artifacts now hard-bump to `schemaVersion: "1.1.0"` and `SignatureEnvelope` carries `canonicalForm: "json-c14n@1.0"` plus deterministic sub-hashes.
- **2026-04-27:** Completed Phase 2 Plan 06a (`02-06a-admission-decision-base-PLAN.md`): authority now owns `AdmissionDecisionBase`, re-exports the intent-owned admission outcome literal, and provides `SignedAdmissionDecision` signing/verification.

## Key Locks (Carried Forward)

From `MEMORY.md`:
- **Dark factory locks (2026-04-24):** dark-except-hard-failures, heterogeneous-local judge panel, harsher-than-baseline consensus, 5–10 retry-cycle hard cap, ambiguity gate ≤0.2
- **v0.1 cosmetic-tweak loop:** Now folded into Phase 10 dogfood — first row of the fixture matrix and the seed for repeat runs
- **Stack:** pnpm + TS 6 strict + Node 22 + ESM + `node:test`; no replatforming
- **Authority boundary:** only `apps/factory-cli` + `packages/repo` may touch the filesystem; `dogpile-adapter` is coordination-only

## Open Questions (deferred to per-phase planning)

- TS runtime — Node confirmed; Bun/Deno deferred indefinitely
- Specific second judge model family (Phase 8) — Llama-70B vs DeepSeek vs other; pick during Phase 8 research
- Toy-app linkage (Phase 10) — clone vs submodule vs worktree
- Demo recording medium (Phase 10) — screenshot vs Playwright video trace
- Convergence threshold calibration (Phase 8 EVOL-03) — needs ≥10 dogfood runs first

---
*Initialized: 2026-04-26 via `/gsd-new-project` brownfield init against dark-factory locks + operator-supplied 10-phase v1 ordering*
