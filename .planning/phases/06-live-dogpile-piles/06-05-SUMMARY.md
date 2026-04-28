---
phase: 06-live-dogpile-piles
plan: 05
subsystem: review
tags: [review, model-reviewer, q-14, q-17, pile-02]
requires: [06-03, 06-04]
provides:
  - "@protostar/review.ReviewPileResult"
  - "@protostar/review.ReviewPileBody"
  - "@protostar/review.PileSource"
  - "@protostar/review.parseReviewPileResult"
  - "@protostar/review.assertReviewPileResult"
  - "@protostar/review.createReviewPileModelReviewer"
  - "@protostar/review.ReviewPileModelReviewerDeps"
affects:
  - apps/factory-cli (Plan 07 will wire createReviewPileModelReviewer)
tech-stack:
  added:
    - "@protostar/review depends on @protostar/dogpile-adapter + @protostar/dogpile-types"
  patterns:
    - "Pile-result parser symmetric with parsePlanningPileResult (D-17 per-domain ownership)"
    - "ModelReviewer = function type (Phase 5); reviewer is a closure that calls runFactoryPile"
    - "Refusal symmetry: pile failure or parse error → block ModelReviewResult with failure as JudgeCritique rationale"
key-files:
  created:
    - packages/review/src/review-pile-result.ts
    - packages/review/src/review-pile-result.test.ts
    - packages/review/src/review-pile-reviewer.ts
    - packages/review/src/review-pile-reviewer.test.ts
  modified:
    - packages/review/src/index.ts
    - packages/review/package.json
    - packages/review/tsconfig.json
decisions:
  - "ModelReviewer is a function type (existing Phase 5 export at packages/review/src/repair-types.ts:59); createReviewPileModelReviewer returns a function, not an object with .review() — diverges from plan interfaces block which showed { review() } shape"
  - "Phase 5 ModelReviewInput has no intent / planningAdmission fields; deps gained buildMission(input) closure (in addition to plan-specified buildContext) so factory-cli closes over confirmed intent and admission at wiring time"
  - "aggregateVerdict typed as ReviewVerdict ('pass'|'repair'|'block') per Phase 5 Q-11 — plan must-haves used 'decision: pass|block|abstain'; abstain dropped to align with existing Phase 5 ReviewVerdict union"
  - "JudgeCritique field is 'verdict' (existing Phase 5 type at packages/review/src/judge-types.ts), not 'decision' — parser and tests use 'verdict'"
metrics:
  duration: ~25min
  tasks-completed: 2
  files-changed: 7
  tests-added: 10
  completed: 2026-04-28
---

# Phase 6 Plan 05: Review Pile Reviewer Summary

`@protostar/review` now ships the live Q-14 ModelReviewer implementation: `ReviewPileResult` wire format + parser, plus `createReviewPileModelReviewer(deps)` returning a Phase 5 ModelReviewer function that invokes `runFactoryPile` with `reviewPilePreset` and translates the aggregate verdict into a `ModelReviewResult`.

## Task 1 — ReviewPileResult shape + parseReviewPileResult (Q-17)

`packages/review/src/review-pile-result.ts` defines:

- `PileSource = { kind: "fixture" | "dogpile"; uri?: string }`
- `ReviewPileResult = { output: string; source?: PileSource }`
- `ReviewPileBody = { judgeCritiques: readonly JudgeCritique[]; aggregateVerdict: ReviewVerdict }`
- `assertReviewPileResult(value)` — single-ingress shape gate (T-6-03)
- `parseReviewPileResult(input)` — returns `{ ok: true; body }` or `{ ok: false; errors }`. JSON.parse failure surfaces `output is not valid JSON: <message>`. Validates judgeCritiques is array, aggregateVerdict is one of `pass | repair | block`, each critique has at minimum `judgeId: string` and `verdict: string`.

Mirrors `parsePlanningPileResult` style (`packages/planning/src/index.ts:1140`).

**Tests (6):** assert rejects non-string output; assert accepts minimal shape; parse non-JSON returns 'valid JSON' error; parse missing judgeCritiques returns ok=false; parse 2-critique pass body returns ok=true with 2 critiques; parse round-trips aggregateVerdict 'block'.

**Commit:** `98e61aa feat(06-05): add ReviewPileResult wire format and parser`

## Task 2 — createReviewPileModelReviewer (Q-14 retroactive Phase 5 implementation)

`packages/review/src/review-pile-reviewer.ts`:

```ts
export interface ReviewPileModelReviewerDeps {
  readonly runPile?: (mission: FactoryPileMission, ctx: PileRunContext) => Promise<PileRunOutcome>;
  readonly buildContext: (input: ModelReviewInput) => PileRunContext;
  readonly buildMission: (input: ModelReviewInput) => FactoryPileMission;
}

export function createReviewPileModelReviewer(deps: ReviewPileModelReviewerDeps): ModelReviewer
```

Flow:
1. `mission = deps.buildMission(input)` (closes over confirmed intent + planning admission supplied by factory-cli at wiring time)
2. `ctx = deps.buildContext(input)` (provider, signal, resolved budget)
3. `outcome = await runPile(mission, ctx)` (default `runPile` is `runFactoryPile`)
4. `outcome.ok === false` → `verdict: "block"` ModelReviewResult; PileFailure embedded in JudgeCritique rationale
5. Else `parseReviewPileResult({ output })`:
   - `ok: false` → block with parse errors in rationale
   - `ok: true` → critiques pass-through; aggregateVerdict drives top-level verdict

**Tests (4):** happy path (pass aggregateVerdict, 2 critiques); model-reviewer-conformance (compile-time `const r: ModelReviewer = createReviewPileModelReviewer(...)` + runtime callability); pile-timeout failure → block carrying `pile-timeout` in rationale; parse error → block with `valid JSON` substring in rationale.

**Commit:** `f1a88ce feat(06-05): add createReviewPileModelReviewer (Q-14 live impl)`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking dep] Added `@protostar/dogpile-adapter` + `@protostar/dogpile-types` to `packages/review/package.json` and `tsconfig.json` references**
- **Found during:** Task 2 build
- **Issue:** Reviewer imports `runFactoryPile`, `PileRunContext`, `PileRunOutcome`, `FactoryPileMission`, `PileFailure` — none of those packages were declared deps of `@protostar/review`.
- **Fix:** Added both to `dependencies` and TypeScript project `references`; ran `pnpm install`.
- **Files modified:** `packages/review/package.json`, `packages/review/tsconfig.json`, `pnpm-lock.yaml`
- **Commit:** `f1a88ce`

### Interface Reconciliation (vs plan `<interfaces>` block)

The plan's interfaces block proposed `interface ModelReviewer { review: (input) => Promise<ModelReviewResult> }` but Phase 5 already shipped `ModelReviewer` as a **function type** (`packages/review/src/repair-types.ts:59`):

```ts
export type ModelReviewer = (input: ModelReviewInput) => Promise<ModelReviewResult>;
```

The plan also instructed: *"executor will not invent shape changes; only reproduce what Phase 5 documents."* Per that directive, `createReviewPileModelReviewer` returns a function. Test 2 (`model-reviewer-conformance`) still proves Phase 5 conformance via `const reviewer: ModelReviewer = createReviewPileModelReviewer(deps)`.

Similarly, `ModelReviewInput` carries `admittedPlan, executionResult, mechanicalGate, diff, repairContext?` — no `intent` or `planningAdmission`. The plan's Q-14 wiring step 1 referenced `input.intent` / `input.planningAdmission` which don't exist on the input. Rather than mutate the Phase 5 input shape, `deps.buildMission(input)` accepts a closure that the caller (factory-cli, Plan 07) constructs over the confirmed intent and planning admission. This parallels the `deps.buildContext` pattern already specified.

The plan's must-haves used `aggregateVerdict.decision: pass|block|abstain` and JudgeCritique `decision`. Phase 5 Q-11 pinned `JudgeCritique.verdict: ReviewVerdict` and `ReviewVerdict = 'pass'|'repair'|'block'` (no abstain). Implementation follows Phase 5; "abstain" dropped.

### Authentication Gates

None.

## Verification

- `pnpm --filter @protostar/review test --grep review-pile-result` → 6/6 new + 51/51 pre-existing = 55 total pass
- `pnpm --filter @protostar/review test --grep review-pile-reviewer` → 4/4 new pass
- `pnpm --filter @protostar/review test --grep model-reviewer-conformance` → 1/1 pass
- `pnpm --filter @protostar/review build` → ok
- `pnpm --filter @protostar/dogpile-adapter build && test` → 32/32 pass (re-exports compile; static no-fs contract still passes per Plan 06-01 Task 3)

The task acceptance command included `node -e "const r=require('@protostar/review');..."` from cwd. `@protostar/review` is workspace-only ESM-only (`"type": "module"`, exports condition `import` only); `require()` from repo root cannot resolve workspace packages. Equivalent runtime check from a workspace consumer (`apps/factory-cli`) via dynamic `import()` succeeded:

```bash
$ cd apps/factory-cli && node --input-type=module -e \
  "import('@protostar/review').then(r => { for (const k of ['assertReviewPileResult','parseReviewPileResult']) { if (typeof r[k] !== 'function') throw new Error('review missing '+k); } console.log('ok'); })"
ok
```

Functional acceptance satisfied; literal command form is broken upstream by workspace-resolution semantics, not by this plan.

## Threat Flags

None — no new network, fs, or trust-boundary surface introduced. The reviewer only routes through `runFactoryPile` (Plan 06-04, already audited) and parses adversarial pile output through `parseReviewPileResult` (T-6-03 mitigation: single ingress; verdict=block on any parse failure).

## Self-Check: PASSED

Files exist:
- `/Users/zakkeown/Code/protostar/packages/review/src/review-pile-result.ts` — FOUND
- `/Users/zakkeown/Code/protostar/packages/review/src/review-pile-result.test.ts` — FOUND
- `/Users/zakkeown/Code/protostar/packages/review/src/review-pile-reviewer.ts` — FOUND
- `/Users/zakkeown/Code/protostar/packages/review/src/review-pile-reviewer.test.ts` — FOUND

Commits exist:
- `98e61aa feat(06-05): add ReviewPileResult wire format and parser` — FOUND
- `f1a88ce feat(06-05): add createReviewPileModelReviewer (Q-14 live impl)` — FOUND
