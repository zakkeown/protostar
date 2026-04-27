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

**Phase 2 — Authority + Governance Kernel** (in progress)

Front door is sealed (Phase 1 verified 2026-04-27, 293/293 tests). Phase 2 builds the authority kernel: capability grants, signed admission decisions (GOV-06), and the governance event log.

**Next action:** Continue Phase 2 Wave 4 with `02-10-admission-e2e-contract-suite-PLAN.md`; Plan 09 is complete and GOV-03/GOV-04 now have stage-reader and repo-runtime coverage.

## Phase Status

| # | Phase | Status |
|---|-------|--------|
| 1 | Intent + Planning Admission | ✅ Complete (2026-04-27) |
| 2 | Authority + Governance Kernel | In progress — Wave 4 Plan 09 complete; Plan 10 remains |
| 3 | Repo Runtime + Sandbox | Pending |
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
