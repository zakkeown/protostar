---
phase: 06-live-dogpile-piles
plan: 05
type: execute
wave: 2
depends_on: [04]
files_modified:
  - packages/review/src/review-pile-result.ts
  - packages/review/src/review-pile-result.test.ts
  - packages/review/src/review-pile-reviewer.ts
  - packages/review/src/review-pile-reviewer.test.ts
  - packages/review/src/index.ts
autonomous: true
requirements: [PILE-02]
tags: [review, model-reviewer, q-14, q-17]
must_haves:
  truths:
    - "ReviewPileResult is defined in @protostar/review with shape `{ output: string, source?: PileSource }` (Q-17)"
    - "parseReviewPileResult validates structure and returns either parsed JudgeCritique[] + aggregateVerdict OR ParseError[] (Q-17)"
    - "createReviewPileModelReviewer() returns a ModelReviewer (Phase 5 Q-10 interface) whose review() method invokes runFactoryPile with reviewPilePreset and translates ReviewPileResult → ModelReviewResult (Q-14)"
  artifacts:
    - path: "packages/review/src/review-pile-result.ts"
      provides: "Wire format + parser for review-pile output (Q-17)"
      contains: "export function parseReviewPileResult"
    - path: "packages/review/src/review-pile-reviewer.ts"
      provides: "Phase 5 ModelReviewer implementation backed by review pile (Q-14)"
      contains: "export function createReviewPileModelReviewer"
  key_links:
    - from: "packages/review/src/review-pile-reviewer.ts"
      to: "@protostar/dogpile-adapter runFactoryPile"
      via: "import"
      pattern: "runFactoryPile.*from \\\"@protostar/dogpile-adapter\\\""
---

<objective>
Wave 2 — supply the Phase 5 `ModelReviewer` interface implementation by wiring the review pile through `runFactoryPile`. This is the load-bearing Q-14 retroactive lock made real: Phase 5 ships only the interface + fixture passthrough, Phase 6 supplies the live implementation.

Purpose: PILE-02 — `reviewPilePreset` invoked after mechanical review, output composes with mechanical verdict via the Phase 5 loop's existing seam.

Output: `ReviewPileResult` parser; `createReviewPileModelReviewer()` consumer of `runFactoryPile`; barrel re-exports both ways.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-live-dogpile-piles/06-CONTEXT.md
@.planning/phases/06-live-dogpile-piles/06-RESEARCH.md
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@packages/review/src/index.ts
@packages/dogpile-adapter/src/index.ts
@packages/planning/src/index.ts

<interfaces>
<!-- Wire format mirrors PlanningPileResult (planning/src/index.ts:206-212) -->

```ts
// New in @protostar/review:
export interface PileSource {
  readonly kind: "fixture" | "dogpile";
  readonly uri?: string;
}

export interface ReviewPileResult {
  readonly output: string;          // JSON-stringified { judgeCritiques: JudgeCritique[], aggregateVerdict: ReviewVerdict }
  readonly source?: PileSource;
}

// Parsed body schema (validated by parseReviewPileResult):
export interface ReviewPileBody {
  readonly judgeCritiques: readonly JudgeCritique[];
  readonly aggregateVerdict: ReviewVerdict;
}

// Phase 5 Q-10 interface (defined in @protostar/review during Phase 5; Phase 6 implements):
export interface ModelReviewer {
  readonly review: (input: ModelReviewerInput) => Promise<ModelReviewResult>;
}
```

PILE-02 / Q-14 wiring:
1. Caller invokes `reviewer.review(input)` from inside Phase 5's review-repair loop.
2. Reviewer calls `runFactoryPile({ preset: reviewPilePreset, intent: buildReviewMission(...).intent }, ctx)` where ctx is supplied by the caller (factory-cli passes provider, signal, resolved budget).
3. On `ok: true`: `parseReviewPileResult({ output: result.output })` → either ReviewPileBody or ParseError[].
4. ReviewPileBody → ModelReviewResult (each JudgeCritique becomes a critique entry; aggregateVerdict drives pass/block decision).
5. On `ok: false` or parse error: synthesize a ModelReviewResult with `verdict: "block"` carrying PileFailure / parse-error evidence (per Q-12 — refusal symmetry).

NOTE on Phase 5 dependency: Phase 5 ships the `ModelReviewer` interface + ModelReviewResult/JudgeCritique/ReviewVerdict types. If those exact types are not yet present in `packages/review/src/index.ts` at execution time, the executor must:
- Read Phase 5 CONTEXT.md Q-10/Q-11 sections.
- Define the interface in this plan ONLY if Phase 5 hasn't landed it yet (use the shapes documented in Phase 5 CONTEXT.md verbatim).
- The executor will not invent shape changes; only reproduce what Phase 5 documents.
</interfaces>
</context>

## Notes

Adapter ergonomic re-exports are deferred for v0.1 — factory-cli imports directly from owning packages.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: ReviewPileResult shape + parseReviewPileResult + assertReviewPileResult (Q-17)</name>
  <files>packages/review/src/review-pile-result.ts, packages/review/src/review-pile-result.test.ts, packages/review/src/index.ts</files>
  <read_first>
    - packages/planning/src/index.ts (lines 206-212 for PlanningPileResult shape; lines 1102-1163 for assertPlanningPileResult / parsePlanningPileResult patterns to mirror)
    - packages/review/src/index.ts (existing review surface — confirm whether JudgeCritique / ReviewVerdict / ModelReviewResult types are already present from Phase 5; if absent, define minimal shapes here per Phase 5 CONTEXT.md)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §"Q-11" (JudgeCritique shape: judgeId, model, rubric, decision, summary, evidence)
  </read_first>
  <behavior>
    - `ReviewPileResult` and `ReviewPileBody` exported with `readonly` fields.
    - `assertReviewPileResult(value): asserts value is ReviewPileResult` throws on shape mismatch (output not string, etc.).
    - `parseReviewPileResult(input: ReviewPileResult): { ok: true; body: ReviewPileBody } | { ok: false; errors: readonly string[] }`:
      - Parses `input.output` as JSON; on JSON.parse failure returns `ok: false` with `errors: ["output is not valid JSON: <message>"]`.
      - Validates body has `judgeCritiques: array` and `aggregateVerdict: { decision: "pass"|"block"|"abstain", … }`.
      - Validates each JudgeCritique has at minimum `judgeId: string`, `decision: string`.
      - Returns `ok: true` with the typed body on success.
    - Pure: no I/O.
  </behavior>
  <action>
    Write tests FIRST. Test cases (6) in `review-pile-result.test.ts`:
    1. `assertReviewPileResult` rejects non-string output → throws with descriptive message.
    2. `assertReviewPileResult` accepts `{ output: "..." }`.
    3. `parseReviewPileResult` returns ok=false with `"valid JSON"` substring for non-JSON output.
    4. `parseReviewPileResult` returns ok=false when judgeCritiques missing.
    5. `parseReviewPileResult` returns ok=true for valid body with 2 judgeCritiques + aggregateVerdict { decision: "pass" }.
    6. `parseReviewPileResult` populates body.aggregateVerdict.decision === "block" round-trip.

    Run RED. Implement `review-pile-result.ts` mirroring `parsePlanningPileResult` style. GREEN.

    Update `packages/review/src/index.ts`: re-export `ReviewPileResult`, `ReviewPileBody`, `PileSource`, `parseReviewPileResult`, `assertReviewPileResult`.

    **Do NOT edit `packages/dogpile-adapter/src/index.ts` in this plan** — Plan 05 and Plan 06 are both Wave 2 and share the dogpile-adapter barrel; to keep Wave 2 file ownership disjoint, ergonomic re-exports from `@protostar/review` (Q-17) and `@protostar/repair` (Q-18) are deferred. Downstream consumers (Plan 07 factory-cli) import from the owning packages directly: `import { parseReviewPileResult, createReviewPileModelReviewer } from "@protostar/review"`. The dogpile-adapter barrel keeps its Wave 1 surface; ergonomic re-exports can be added in a future hardening pass without breaking the import path established here.

    Per D-17 (Q-17): each domain owns its pile-output contract; review-pile result lives in @protostar/review.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/review test --grep review-pile-result &amp;&amp; pnpm --filter @protostar/review build &amp;&amp; node -e "const r=require('@protostar/review'); for (const k of ['assertReviewPileResult','parseReviewPileResult']) { if (typeof r[k] !== 'function') throw new Error('review missing '+k); } console.log('ok')"</automated>
  </verify>
  <acceptance_criteria>
    - Command exits 0: `pnpm --filter @protostar/review test --grep review-pile-result &amp;&amp; pnpm --filter @protostar/review build &amp;&amp; node -e "const r=require('@protostar/review'); for (const k of ['assertReviewPileResult','parseReviewPileResult']) { if (typeof r[k] !== 'function') throw new Error('review missing '+k); } console.log('ok')"`
    - All grep/test invocations inside the command match (the command's `&&` chain enforces this — any failed step fails the whole gate).
    - No subjective judgment used; verification is binary on the shell exit status of the automated command above.
    - Note: dogpile-adapter ergonomic re-export is intentionally deferred (see action body — Wave 2 file-ownership disjointness rule); acceptance tests @protostar/review surface only.
  </acceptance_criteria>
  <done>
    All 6 tests pass; @protostar/review builds and exports the new symbols. (Adapter ergonomic re-exports deferred — see action notes; consumers import from @protostar/review directly.)
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: createReviewPileModelReviewer (Q-14 retroactive Phase 5 implementation)</name>
  <files>packages/review/src/review-pile-reviewer.ts, packages/review/src/review-pile-reviewer.test.ts, packages/review/src/index.ts</files>
  <read_first>
    - packages/review/src/index.ts (after Task 1 — confirm parseReviewPileResult is exported)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §"Q-10" + Q-11 (ModelReviewer interface; ModelReviewResult shape; JudgeCritique fields)
    - packages/dogpile-adapter/src/index.ts (after Plan 04 — confirm runFactoryPile + reviewPilePreset + buildReviewMission exports)
    - packages/dogpile-adapter/src/run-factory-pile.ts (Plan 04 — PileRunContext shape)
  </read_first>
  <behavior>
    - `createReviewPileModelReviewer(deps)` returns a `ModelReviewer`.
    - `deps` shape:
      ```ts
      export interface ReviewPileModelReviewerDeps {
        readonly runPile: typeof runFactoryPile;        // injectable for tests
        readonly buildContext: (input: ModelReviewerInput) => PileRunContext;  // factory-cli supplies provider+signal+budget
      }
      ```
      Default `runPile` is the real `runFactoryPile`.
    - reviewer.review(input) implementation:
      1. Build mission via `buildReviewMission(input.intent, input.planningAdmission)`.
      2. ctx = deps.buildContext(input).
      3. outcome = await runPile(mission, ctx).
      4. If outcome.ok === false: return ModelReviewResult with verdict="block", critiques=[], pileFailure=outcome.failure (preserved as evidence).
      5. parsed = parseReviewPileResult({ output: outcome.result.output }).
      6. If parsed.ok === false: return ModelReviewResult with verdict="block", critiques=[], parseErrors=parsed.errors.
      7. Else: map parsed.body.judgeCritiques → ModelReviewResult.critiques and parsed.body.aggregateVerdict → ModelReviewResult.verdict.
    - Reviewer is NOT responsible for persistence (factory-cli's job in Plan 07).
  </behavior>
  <action>
    Test cases (4) in `review-pile-reviewer.test.ts` using stubbed `runPile`:
    1. **review-pile-reviewer happy path** — runPile returns `{ ok: true, result: { output: '{"judgeCritiques":[...],"aggregateVerdict":{"decision":"pass"}}', ... } }`; assert reviewer.review() resolves to ModelReviewResult with verdict.decision === "pass" AND critiques.length === expected.
    2. **model-reviewer-conformance** — assert createReviewPileModelReviewer({ runPile, buildContext }) returns an object with a `review` function whose return type matches Phase 5's ModelReviewer interface (compile-time check — assign result to `const r: ModelReviewer = ...`); test name includes `"model-reviewer-conformance"`.
    3. **pile failure → block** — runPile returns `{ ok: false, failure: { kind: "review", class: "pile-timeout", elapsedMs: 130000, configuredTimeoutMs: 120000 } }`; assert reviewer.review() returns `verdict.decision === "block"` AND result carries the PileFailure as evidence (some field, e.g. `pileFailure` or `metadata`, is populated).
    4. **parse error → block** — runPile returns ok=true with output `"not json"`; assert reviewer.review() returns `verdict.decision === "block"` AND parseErrors are surfaced.

    Run RED. Implement `review-pile-reviewer.ts`. Re-run GREEN.

    Update `packages/review/src/index.ts` to export `createReviewPileModelReviewer` and `ReviewPileModelReviewerDeps`.

    Per D-14 (Q-14): single review path. Phase 5 Q-10 retroactive lock holds — this is the live implementation that replaces the dropped single-Qwen judge.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/review test --grep review-pile-reviewer &amp;&amp; pnpm --filter @protostar/review test --grep model-reviewer-conformance &amp;&amp; pnpm --filter @protostar/review build</automated>
  </verify>
  <acceptance_criteria>
    - Command exits 0: `pnpm --filter @protostar/review test --grep review-pile-reviewer &amp;&amp; pnpm --filter @protostar/review test --grep model-reviewer-conformance &amp;&amp; pnpm --filter @protostar/review build`
    - All grep/test invocations inside the command match (the command's `&&` chain enforces this — any failed step fails the whole gate).
    - No subjective judgment used; verification is binary on the shell exit status of the automated command above.
  </acceptance_criteria>
  <done>
    All 4 reviewer tests pass; `createReviewPileModelReviewer` exported; phase 5 ModelReviewer interface satisfied (compile-time assignment in Test 2).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Pile output JSON → parseReviewPileResult | Untrusted model output crosses here; must validate before becoming ModelReviewResult. |
| ReviewPileResult.output → JSON.parse | Adversarial input boundary (model can produce malformed/oversized output). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-03 | Tampering | Malformed pile output bypasses validation and reaches Phase 5 loop | mitigate | parseReviewPileResult is the single ingress; Test 1.3-1.4 cover non-JSON and missing-field cases; verdict=block on any parse failure |
| T-6-17 | Denial of Service | Oversized pile output crashes JSON.parse | accept | runFactoryPile budget caps maxTokens; SDK enforces size limits; large strings still parse in JS |
| T-6-18 | Spoofing | Model emits judgeCritique with crafted judgeId impersonating mechanical reviewer | mitigate | judgeId from pile is namespaced; mechanical critiques (Phase 5) come from a different code path that does not consume pile-supplied judgeId; Phase 5 loop composes via verdict aggregation only |
</threat_model>

<verification>
- All Plan 05 tests pass.
- `pnpm --filter @protostar/review test` passes (existing + new tests).
- `pnpm --filter @protostar/dogpile-adapter build` passes (re-exports compile).
- The static no-fs contract test on dogpile-adapter (from Plan 01) still passes — re-exports do NOT introduce fs dependencies because @protostar/review may import fs but the dogpile-adapter re-export is typed-only at the boundary it crosses (verify by re-running Plan 01 Task 3's automated check).
</verification>

<success_criteria>
- Phase 5's review-repair loop can swap its fixture passthrough for `createReviewPileModelReviewer({ runPile: runFactoryPile, buildContext })` once factory-cli (Plan 07) supplies the buildContext factory.
- The Q-14 retroactive lock is satisfied: live model-review path exists and runs against the review pile.
</success_criteria>

<output>
After completion, create `.planning/phases/06-live-dogpile-piles/06-05-SUMMARY.md` recording: ReviewPileResult shape, reviewer test counts, Phase 5 ModelReviewer conformance proof.
</output>
</output>
