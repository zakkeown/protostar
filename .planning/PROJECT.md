# Protostar Factory

## What This Is

Protostar is a dark software factory control plane: a TypeScript monorepo that takes a human-confirmed intent and runs the full plan → execute → review → repair → evaluate → deliver loop with no further human intervention unless policy says to stop. Humans confirm intent and review the evidence bundle (PR, test results, eval scores, diff summary); the rest runs dark.

## Core Value

Excise humans from everything except intent capture and final evidence review — the factory plans, builds, verifies, and ships software autonomously, ringing a human only on hard failures the policy can't recover from.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — scaffold is in place but no end-to-end shipped run has been validated against a live target repo.)

### Active

<!-- v1 scope, ordered: admit safely, authorize narrowly, mutate carefully, review relentlessly, deliver only after proof. Full phase mapping in ROADMAP.md. -->

- [ ] **Phase 1 — Intent + Planning Admission** — front door sealed; no weak intent or bad plan reaches execution
- [ ] **Phase 2 — Authority + Governance Kernel** — precedence, capability envelope, signed intent — before any real mutation
- [ ] **Phase 3 — Repo Runtime + Sandbox** — clone, branch, file-write caps, atomic patch + rollback, dirty-worktree handling
- [ ] **Phase 4 — Execution Engine** — boring deterministic task runner with resumable journal; first `ExecutionAdapter` is the LM Studio coder
- [ ] **Phase 5 — Review → Repair → Review Loop** — central control loop; no delivery without approved exit
- [ ] **Phase 6 — Live Dogpile Piles** — bounded model coordination behind strict schemas; Protostar stays authority
- [ ] **Phase 7 — Delivery** — real GitHub PR via Octokit, evidence bundle in PR body, CI status capture, no auto-merge
- [ ] **Phase 8 — Evaluation + Evolution** — mechanical → semantic → consensus, heterogeneous-local panel, cross-run ontology convergence
- [ ] **Phase 9 — Operator Surface + Resumability** — `run` / `status` / `resume` / `cancel` / `inspect` / `deliver`
- [ ] **Phase 10 — V1 Hardening + Dogfood** — sacrificial sibling repo + fixture matrix + ≥10 consecutive runs ≥80% PR-ready + docs + security review

### Out of Scope

<!-- Explicit boundaries from 2026-04-24 dark-factory locks. -->

- **Beads-style memory graph** — deferred to 1.0; v0.1 has no graph memory
- **Parallel wave execution (GSD-style)** — single-shot executor for v0.1; no parallel waves
- **Adaptive-by-risk judge panel sizing** — fixed N=2 for v0.1; "blast radius" formalism is a 1.0 problem
- **Self-improvement / factory editing its own repo** — out of scope for 0.1
- **Numeric calibration of harsh consensus thresholds** — set empirically once 0.1 ships, not pre-tuned
- **Token-budget unit** — empirical ($/GPU-hour likely), not a v0.1 deliverable
- **Cloud / hosted judges** — heterogeneous-local only (LM Studio); no cloud judge cost
- **Non-cosmetic archetypes for v0.1** — `feature-add`, `refactor`, `bugfix` archetypes are scaffolded as `stub` deliberately; only `cosmetic-tweak` is wired in v0.1 (per `packages/policy/src/admission-paths.ts`)
- **GUI intake / TUI wizard / 9-role architecture** — explicitly rebound away from 2026-04-22 design; CLI-only intake
- **Ouroboros (`ooo`) workflow as part of factory runtime** — Ouroboros is the design conversation tool, not a runtime dependency of the factory

## Context

**Greenfield TypeScript autonomous factory.** Inspired by Q00/Ouroboros (spec-first loop, ambiguity gate ≤0.2), GSD/get-shit-done (parallel waves, atomic tasks — deferred to 1.0), gastownhall/beads (graph memory — deferred to 1.0). The earlier "Protostar v0.0.1" PR-loop design is parked; this repo is the dark-factory rebind.

**Repo state (2026-04-26):** Spine fully scaffolded with 10 domain packages + `apps/factory-cli`. Stage contracts, admission gates, and run-bundle persistence are done. The dead branches that need wiring are real planning pile execution, real review pile execution, real workspace ops, real code execution, and real PR delivery — see `.planning/codebase/CONCERNS.md` for the full audit.

**Domain inspirations preserved as architecture:**
- Ouroboros → ambiguity gate (`packages/intent/src/ambiguity-scoring.ts`, threshold 0.2)
- Adversarial multi-model consensus → judge panel (`packages/evaluation`)
- Domain-first packages → no `utils`/`agents`/`factory` catch-all (per `AGENTS.md`)

**Authority boundary (load-bearing):** Only `apps/factory-cli` and `packages/repo` may touch the filesystem. `packages/dogpile-adapter` MUST NOT do I/O. ConfirmedIntent is `DeepReadonly` post-promotion.

**Dogpile linkage:** `@dogpile/sdk` is currently `link:../../../dogpile` — sibling-repo file link. Build only succeeds on contributor machines with that exact layout.

## Constraints

- **Tech stack**: pnpm workspaces + Turborepo-style project references, TypeScript ^6.0.3 strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Node.js >=22, ESM-only (`module: NodeNext`, `.js` import suffixes) — established by existing scaffold; do not replatform
- **Testing**: `node:test` built-in runner against compiled `dist/*.test.js` — no Jest/Vitest, no `tsx`/`ts-node` shortcut in CI
- **Authority**: Only `apps/factory-cli` + `packages/repo` may do filesystem I/O; `dogpile-adapter` is coordination-only
- **Domain-first packaging**: No `utils`, `agents`, `factory`, or other catch-all packages (`AGENTS.md` rule)
- **Runtime dependency posture (rephrased Phase 3, 2026-04-27):** Protostar maintains minimal external runtime deps. Phase 3 introduces two carve-outs on `@protostar/repo` — `isomorphic-git@1.37.6` (Q-01: pure-JS git mechanics) and `diff@9.0.0` (CONFLICT-01: unified-diff parse/apply mechanics). Plus `@dogpile/sdk@0.2.0` on `@protostar/dogpile-adapter` (REPO-08). Plus `commander@14.0.3` + `@commander-js/extra-typings@14.0.0` on `apps/factory-cli` (Phase 9 Q-02: subcommand DSL + auditable --help output). Any further runtime-dep additions require an explicit lock-revision note here.
- **Phase 10 dev-dep additions (lock revision 2026-04-29; dev-only, not runtime deps):** `zod-to-json-schema@^3` and `zod@^3` on `@protostar/artifacts` (DOG-05 schema appendix generator), `knip@^5` on root (DOG-06 unused-export/dep enforcement), `@changesets/cli@^2` on root (DOG-07 release tooling).
- **Local-only judges**: Judge panel is heterogeneous-local via LM Studio (Qwen3-80B + another family). No cloud-LLM judges
- **Autonomy line**: Dark except hard failures; no progress logs, no human pings except policy-defined stop gates
- **Ambiguity gate**: 0.2 threshold is a hard contract (`INTENT_AMBIGUITY_THRESHOLD`); changing it is a v1.0 calibration task, not a v0.1 task
- **PR delivery**: GitHub via `gh` CLI / Octokit + PAT from env var; never pass branch names to a shell unvalidated (`^[a-zA-Z0-9._/-]+$`)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Domain-first monorepo, no catch-all packages | Prevents authority ambiguity that earlier designs suffered from | ✓ Good — boundary is enforceable |
| Stage forward-only data flow (no reaching back) | Each stage admits the next via durable artifact; bypasses are compile errors | ✓ Good |
| Dogpile is a coordination cell, not authority | Authority lives in Protostar; Dogpile is bounded N-of-M model coordination | ✓ Good — adapter has no I/O |
| Three-stage evaluation shape (mechanical/semantic/consensus) | Anticipates the heterogeneous-local judge panel from 2026-04-24 lock | ⚠️ Revisit — semantic + consensus currently stubbed; if v0.1 ships with only mechanical, collapse the artifact shape |
| `node:test` against compiled `dist/*.test.js` | Determinism, no extra dev dependency surface | ✓ Good for CI; add `tsx` watch path for local DX |
| `@dogpile/sdk` via `link:../../../dogpile` | Quick iteration during co-design with sibling repo | ⚠️ Revisit — blocks fresh-machine onboarding; publish or vendor before second contributor |
| YOLO mode + standard granularity for GSD planning | Matches dark-factory autonomy posture: minimize human gates | — Pending |
| Cosmetic-tweak as the only wired archetype for v0.1 | Thin slice — prove the loop end-to-end before broadening blast radius | — Pending — v0.1 ships will validate |

---
*Last updated: 2026-04-26 after `/gsd-new-project` brownfield init against dark-factory locks*
