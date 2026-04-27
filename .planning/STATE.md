# Project State

**Last updated:** 2026-04-27

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

**Phase 3 — Repo Runtime + Sandbox** (in progress)

Phase 3 is making the repo boundary real: dependencies/env, path resolution, schema bump, sacrificial repo fixture, the brand-consuming FS adapter, and strict symlink audit are complete.

**Next action:** Continue Phase 3 Wave 1 with Plan 08 (subprocess allowlist/schemas).

## Phase Status

| # | Phase | Status |
|---|-------|--------|
| 1 | Intent + Planning Admission | ✅ Complete (2026-04-27) |
| 2 | Authority + Governance Kernel | In progress — Waves 5–7 complete (Plans 11–15); awaiting re-verification |
| 3 | Repo Runtime + Sandbox | In progress — Plans 03-01 through 03-06 complete; phase not verified |
| 4 | Execution Engine | Pending |
| 5 | Review → Repair → Review Loop | Pending |
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
