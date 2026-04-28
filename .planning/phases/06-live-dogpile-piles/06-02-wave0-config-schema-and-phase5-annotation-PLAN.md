---
phase: 06-live-dogpile-piles
plan: 02
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/lmstudio-adapter/src/factory-config.schema.json
  - .planning/phases/05-review-repair-loop/05-CONTEXT.md
autonomous: true
requirements: []
tags: [factory-config, schema, phase5-retro, q-04, q-14]
must_haves:
  truths:
    - "factory-config.schema.json declares a top-level `piles` block with `planning`, `review`, `executionCoordination` per-pile mode = fixture | live (Q-04)"
    - "Each pile sub-block has `mode` enum, optional `fixturePath`; executionCoordination has nested `workSlicing.{maxTargetFiles,maxEstimatedTurns}` (Claude's discretion default 3 / 5)"
    - "Phase 5 CONTEXT.md Q-10 carries an annotation pointing readers to Phase 6 Q-14 (review pile replaces single-Qwen judge); annotation contains the literal string `Re-locked in Phase 6 Q-14`"
  artifacts:
    - path: "packages/lmstudio-adapter/src/factory-config.schema.json"
      provides: "Phase 6 piles.{kind}.mode schema additions"
      contains: "\"piles\""
    - path: ".planning/phases/05-review-repair-loop/05-CONTEXT.md"
      provides: "Q-10 retroactive annotation directing implementers to Phase 6 Q-14"
      contains: "Re-locked in Phase 6 Q-14"
  key_links:
    - from: ".planning/phases/05-review-repair-loop/05-CONTEXT.md"
      to: ".planning/phases/06-live-dogpile-piles/06-CONTEXT.md"
      via: "explicit cross-reference annotation"
      pattern: "Re-locked in Phase 6 Q-14"
---

<objective>
Wave 0 part B — extend `factory-config.schema.json` with the `piles` block (Q-04) and land the Q-14 retroactive annotation on Phase 5's Q-10 to ensure no `single-Qwen judge` adapter ships before Phase 6 wires the review pile.

Purpose: The schema bump is the contract Wave 3 (Plan 07) parses. The Phase 5 annotation is the highest-risk doc update in the phase (RESEARCH Pitfall 5) — Phase 5 is in progress and a stub Qwen-judge adapter could ship before Phase 6 lands without this annotation.

Output: Schema declares the new piles block; Phase 5 Q-10 carries the explicit retroactive lock.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-live-dogpile-piles/06-CONTEXT.md
@.planning/phases/06-live-dogpile-piles/06-RESEARCH.md
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@packages/lmstudio-adapter/src/factory-config.schema.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add `piles` block to factory-config.schema.json</name>
  <files>packages/lmstudio-adapter/src/factory-config.schema.json</files>
  <read_first>
    - packages/lmstudio-adapter/src/factory-config.schema.json (current Phase 4 Q-09 schema body — full file)
    - .planning/phases/06-live-dogpile-piles/06-RESEARCH.md §"Example 4: factory-config.json schema extension" (lines ~647-695 — exact JSON shape to land)
  </read_first>
  <behavior>
    - JSON parses (no comma errors).
    - Top-level `properties.piles` exists with three sub-objects: `planning`, `review`, `executionCoordination`.
    - Each sub-object: `additionalProperties: false`; `properties.mode` enum `["fixture","live"]` with `default: "fixture"`; optional `fixturePath: string`.
    - `executionCoordination` additionally has `properties.workSlicing` with nested `maxTargetFiles` (number, default 3) and `maxEstimatedTurns` (number, default 5).
    - `piles` itself is `additionalProperties: false`; not in top-level `required` (additive, optional).
    - Schema description fields explicitly note: per D-05/Q-05, default mode is `fixture`; per D-06/Q-06, live failure NEVER auto-falls-back to fixture.
  </behavior>
  <action>
    Open `packages/lmstudio-adapter/src/factory-config.schema.json`. Insert a top-level `piles` property under `properties`, structured exactly per RESEARCH §"Example 4". Do not modify existing `adapters` block. Per D-04 (Q-04): keys are `planning`, `review`, `executionCoordination` (NOT `execution-coordination` — the JSON key uses camelCase to match TypeScript field names; the kind discriminator string `execution-coordination` lives elsewhere). Add `description` strings on each `mode` enum referencing CLI override flags `--planning-mode`, `--review-mode`, `--exec-coord-mode` (Q-04 precedence: CLI > config > built-in default).
    Validate JSON: `node -e "JSON.parse(require('fs').readFileSync('packages/lmstudio-adapter/src/factory-config.schema.json','utf8'))"`.
  </action>
  <verify>
    <automated>node -e "const s=JSON.parse(require('fs').readFileSync('packages/lmstudio-adapter/src/factory-config.schema.json','utf8')); const p=s.properties.piles.properties; if (!p.planning||!p.review||!p.executionCoordination) throw new Error('missing pile sub-block'); for (const k of ['planning','review','executionCoordination']) { const m=p[k].properties.mode; if (m.enum[0]!=='fixture'||m.enum[1]!=='live') throw new Error('bad mode enum: '+k); if (m.default!=='fixture') throw new Error('default must be fixture: '+k); } if (!p.executionCoordination.properties.workSlicing) throw new Error('missing workSlicing'); console.log('schema ok');"</automated>
  </verify>
  <done>
    Schema validates as JSON; the inline node assertion prints `schema ok`; existing `adapters` block intact (`grep -q '\"adapters\"' packages/lmstudio-adapter/src/factory-config.schema.json`).
  </done>
</task>

<task type="auto">
  <name>Task 2: Annotate Phase 5 CONTEXT.md Q-10 with Phase 6 Q-14 retroactive lock</name>
  <files>.planning/phases/05-review-repair-loop/05-CONTEXT.md</files>
  <read_first>
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md (locate the Q-10 section by `grep -n "Q-10" .planning/phases/05-review-repair-loop/05-CONTEXT.md`)
    - .planning/phases/06-live-dogpile-piles/06-CONTEXT.md §"Q-14" lines 117-130 (source of the annotation)
  </read_first>
  <behavior>
    - The Phase 5 Q-10 section gains an explicit annotation block immediately after its `**Status:**` line that:
      a) Begins with the literal phrase `Re-locked in Phase 6 Q-14:` so future readers can grep for it.
      b) States: ship the `ModelReviewer` interface + a fixture passthrough only; do NOT ship a single-Qwen lmstudio-judge adapter in Phase 5.
      c) Cross-references `.planning/phases/06-live-dogpile-piles/06-CONTEXT.md` Q-14 and the Phase 6 plan that supplies `createReviewPileModelReviewer()` (Plan 05).
    - No other content of Phase 5 CONTEXT.md is altered.
  </behavior>
  <action>
    Use Edit to insert the annotation block into `.planning/phases/05-review-repair-loop/05-CONTEXT.md` directly after the existing Q-10 `**Status:**` line. Block text:

    ```
    > **Re-locked in Phase 6 Q-14 (2026-04-27):** Phase 5 ships only the `ModelReviewer` interface + a fixture passthrough. Do NOT ship a single-Qwen lmstudio-judge adapter in Phase 5. The real model-review implementation lands in Phase 6 as `createReviewPileModelReviewer()` (`@protostar/review`), which calls `runFactoryPile({ preset: reviewPilePreset, … })` and translates `ReviewPileResult → ModelReviewResult`. See `.planning/phases/06-live-dogpile-piles/06-CONTEXT.md` Q-14 and `06-05-review-pile-reviewer-PLAN.md`.
    ```

    Per D-14 (Q-14): this is the single most load-bearing decision in Phase 6 — the annotation is the load-bearing artifact that prevents drift.
  </action>
  <verify>
    <automated>grep -q "Re-locked in Phase 6 Q-14" .planning/phases/05-review-repair-loop/05-CONTEXT.md &amp;&amp; grep -q "createReviewPileModelReviewer" .planning/phases/05-review-repair-loop/05-CONTEXT.md</automated>
  </verify>
  <done>
    The annotation is present; both sentinel strings (`Re-locked in Phase 6 Q-14`, `createReviewPileModelReviewer`) grep-match. No other Phase 5 content modified (`git diff .planning/phases/05-review-repair-loop/05-CONTEXT.md` shows ONLY the inserted annotation block).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| factory-config.json (operator-authored) → factory-cli loader | Untrusted operator input crosses here at run start. |
| Phase 5 in-flight planning → Phase 6 retroactive constraint | Documentation-level boundary; drift = wrong implementation shipped. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-10 | Tampering / Elevation | Operator config bypasses pile mode invariants | mitigate | Schema sets `additionalProperties: false` on piles + each sub-block; mode is a fixed `enum`; loader (Wave 3 Plan 07) validates against schema and refuses malformed config |
| T-6-11 | Repudiation / Information Disclosure | Phase 5 ships a Qwen-judge adapter without retroactive lock visibility | mitigate | Task 2 lands the annotation with a grep-able sentinel string (`Re-locked in Phase 6 Q-14`) so Phase 5 plan-checker can't miss it |
| T-6-12 | Denial of Service | workSlicing thresholds set so low that every plan triggers exec-coord pile | accept | Defaults are 3 / 5 per RESEARCH; operator can tune via config; Phase 8 will calibrate from dogfood data |
</threat_model>

<verification>
- JSON schema parses cleanly.
- `grep -q "Re-locked in Phase 6 Q-14" .planning/phases/05-review-repair-loop/05-CONTEXT.md` succeeds.
- Existing Phase 5 CONTEXT.md content (other than the inserted block) is byte-identical (`git diff` review).
</verification>

<success_criteria>
- Wave 3 (Plan 07) can read `piles.{planning,review,executionCoordination}.mode` from `factory-config.json` after schema-validating against the updated schema.
- Phase 5 implementers, when they reach Q-10, see the retroactive lock and stop before building a Qwen-judge adapter.
</success_criteria>

<output>
After completion, create `.planning/phases/06-live-dogpile-piles/06-02-SUMMARY.md` recording: schema piles block landed, Phase 5 annotation in place, byte-equality of remaining Phase 5 CONTEXT verified.
</output>
