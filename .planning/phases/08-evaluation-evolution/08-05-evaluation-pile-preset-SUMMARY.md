---
phase: 08-evaluation-evolution
plan: 05
subsystem: evaluation
tags: [evaluation, dogpile, parser, semantic-judge, tdd]

requires:
  - phase: 08-evaluation-evolution
    provides: 08-02 rubric dimensions, evaluation kind, and refusal type surface
  - phase: 08-evaluation-evolution
    provides: 08-03 pure evaluation helpers and consensus gating contracts
provides:
  - Strict evaluation pile JSON parser in @protostar/evaluation
  - Baseline-only evaluationPilePreset in @protostar/dogpile-adapter
  - Default consensus judge constant for Plan 08-06 runner composition
  - Deterministic evaluation mission builder with bounded stdout evidence
affects: [08-evaluation-evolution, evaluation-runner, factory-cli, dogpile-adapter]

tech-stack:
  added: []
  patterns: [TDD red/green commits, strict single-ingress parser, baseline-only preset plus runner-appended consensus]

key-files:
  created:
    - packages/evaluation/src/evaluation-pile-result.ts
    - packages/evaluation/src/evaluation-pile-result.test.ts
    - packages/dogpile-adapter/src/evaluation-mission.ts
    - packages/dogpile-adapter/src/evaluation-mission.test.ts
  modified:
    - packages/evaluation/src/index.ts
    - packages/dogpile-adapter/src/index.ts

key-decisions:
  - "Kept evaluationPilePreset baseline-only; Plan 08-06 appends EVAL_CONSENSUS_AGENT_DEFAULT only when consensus is required."
  - "Used a local FactoryAgentSpec extension for optional per-agent model metadata because the pinned Dogpile AgentSpec type does not expose model yet."
  - "Kept dogpile-adapter independent of @protostar/evaluation by duplicating the locked five rubric names in mission text, avoiding a new package dependency outside the plan file list."

patterns-established:
  - "Model-generated evaluation JSON crosses one parser gate that accumulates all shape errors and never throws."
  - "Evaluation mission text lists the exact five rubric dimensions and asks for judgeCritiques JSON."

requirements-completed: [EVAL-02, EVAL-03]

duration: 6min
completed: 2026-04-28
---

# Phase 08 Plan 05: Evaluation Pile Preset Summary

**Evaluation pile preset, deterministic semantic-judge mission text, and strict non-throwing evaluation JSON parser are now wired for Plan 08-06.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-28T16:26:38Z
- **Completed:** 2026-04-28T16:32:19Z
- **Tasks:** 2
- **Files modified:** 6 plan files

## Accomplishments

- Added `EvaluationPileBody`, `EvaluationJudgeCritique`, `EvaluationPileResult`, and `parseEvaluationPileResult` with 12 parser tests covering valid bodies, malformed JSON, strict rubric keys, score bounds, invalid verdicts, and empty judge arrays.
- Added `evaluationPilePreset` as the fourth factory pile preset with `kind: "evaluation"`, baseline `eval-baseline` agent, Qwen default model, review-like broadcast protocol, and review-like budget/termination defaults.
- Added `EVAL_CONSENSUS_AGENT_DEFAULT` with the DeepSeek default model, intentionally outside the preset so the runner can append it conditionally.
- Added `buildEvaluationMission` with exact rubric dimensions, intent/AC context, admitted plan summary, diff file list, build/lint exit codes, and a 2000-character stdout tail cap.

## Task Commits

1. **Task 1 RED:** `1167c5a` test(08-05): add failing evaluation pile parser tests
2. **Task 1 GREEN:** `3a331e2` feat(08-05): implement evaluation pile parser
3. **Task 2 RED:** `0280d80` test(08-05): add failing evaluation mission tests
4. **Task 2 GREEN:** `48e58d5` feat(08-05): add evaluation pile mission preset

## Verification

- `pnpm --filter @protostar/evaluation test -- --test-name-pattern evaluation-pile-result` passed, including the 12 new parser cases.
- `pnpm --filter @protostar/dogpile-adapter test -- --test-name-pattern evaluation-mission` passed, including the 10 new preset/mission cases.
- `pnpm --filter @protostar/dogpile-adapter test -- --test-name-pattern no-fs` passed.
- `pnpm --filter @protostar/evaluation test` passed: 57 tests.
- `pnpm --filter @protostar/dogpile-adapter test` passed: 44 tests.
- `pnpm --filter @protostar/dogpile-adapter build` passed.
- `pnpm run verify` blocked on unrelated dirty Phase 7 factory-cli errors:
  - `apps/factory-cli/src/exec-coord-trigger.ts(364,60): error TS2366`
  - `apps/factory-cli/src/main.ts(2530,57): error TS2366`
- `pnpm run factory` blocked on the same unrelated TypeScript errors during build.

## Files Created/Modified

- `packages/evaluation/src/evaluation-pile-result.ts` - Strict single-ingress parser and evaluation pile body types.
- `packages/evaluation/src/evaluation-pile-result.test.ts` - 12 TDD parser tests.
- `packages/evaluation/src/index.ts` - Barrel export for the parser surface.
- `packages/dogpile-adapter/src/index.ts` - Evaluation pile preset, consensus default, and model-aware factory agent metadata type.
- `packages/dogpile-adapter/src/evaluation-mission.ts` - Deterministic evaluation mission builder.
- `packages/dogpile-adapter/src/evaluation-mission.test.ts` - 10 TDD preset and mission tests.

## Decisions Made

- `evaluationPilePreset.agents` remains baseline-only by default. Consensus is a separate exported constant for Plan 08-06 to append only when `shouldRunConsensus` requires it.
- The mission builder keeps its own locked rubric-name list rather than importing from `@protostar/evaluation`, preserving the scoped dogpile-adapter package boundary for this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended factory agent metadata for model defaults**
- **Found during:** Task 2 (evaluationPilePreset implementation)
- **Issue:** The pinned `@dogpile/sdk` `AgentSpec` type exposes `id`, `role`, and `instructions`, but Phase 8 requires baked per-agent `model` defaults for evaluation and consensus.
- **Fix:** Added local `FactoryAgentSpec extends AgentSpec` with optional `model`, then typed `FactoryPilePreset.agents` and `EVAL_CONSENSUS_AGENT_DEFAULT` with that local factory metadata surface.
- **Files modified:** `packages/dogpile-adapter/src/index.ts`
- **Verification:** `pnpm --filter @protostar/dogpile-adapter test -- --test-name-pattern evaluation-mission` passed.
- **Committed in:** `48e58d5`

---

**Total deviations:** 1 auto-fixed (Rule 3).  
**Impact on plan:** The required model defaults landed without modifying SDK types or package metadata outside the plan-owned files.

## Known Stubs

None in files created or modified by this plan. Stub scan only matched intentional parser null checks and the pre-existing documentation word "placeholder" in `packages/evaluation/src/index.ts`.

## Threat Flags

None. The new parser is pure, the dogpile-adapter mission builder has no fs/path imports, and the only new model-facing text surface is bounded by the planned stdout-tail cap.

## Issues Encountered

- Repo-wide verification remains blocked by unrelated dirty Phase 7 files in `apps/factory-cli`. These files were explicitly out of scope and were not modified or staged.
- The local GSD SDK query path was not available in this checkout, and the `gsd-sdk` on PATH exposes a different command surface. State/roadmap files already had unrelated dirty edits, so they were left untouched per the plan instruction.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 08-06 can import `buildEvaluationMission`, `evaluationPilePreset`, `EVAL_CONSENSUS_AGENT_DEFAULT`, and `parseEvaluationPileResult` to run semantic evaluation and conditionally append the consensus judge.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/08-evaluation-evolution/08-05-evaluation-pile-preset-SUMMARY.md`.
- All four task commits were found in `git log --all`.
- Plan-owned code files and tests exist on disk.

---
*Phase: 08-evaluation-evolution*
*Completed: 2026-04-28*
