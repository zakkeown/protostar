---
phase: 11-headless-mode-e2e-stress
plan: 03
type: execute
wave: 2
depends_on:
  - 11-01
  - 11-02
files_modified:
  - packages/fixtures/src/seeds/index.ts
  - packages/fixtures/src/seeds/feature-add/ttt-game.json
  - packages/fixtures/src/seeds/feature-add/ttt-game.ts
  - packages/fixtures/src/seeds/seed-library.test.ts
  - packages/fixtures/__fixtures__/feature-add/ttt-game/expectations.ts
  - packages/admission-e2e/package.json
  - packages/admission-e2e/tsconfig.json
  - packages/admission-e2e/src/seed-library-shape.contract.test.ts
  - packages/admission-e2e/src/ttt-seed-ambiguity.contract.test.ts
  - pnpm-lock.yaml
autonomous: true
requirements:
  - STRESS-03
must_haves:
  truths:
    - "Seed library is keyed by archetype and preserves the Phase 10 cosmetic seeds."
    - "TTT feature-add seed has rich AC that drives ambiguity below 0.2 without changing the threshold."
    - "TTT seed references immutable toy repo verification files as required acceptance criteria."
    - "Admission-e2e materializes the TTT seed into the real draft shape and proves the existing admission path accepts ambiguity at <= 0.2."
  artifacts:
    - path: "packages/fixtures/src/seeds/index.ts"
      provides: "frozen per-archetype seedLibrary record"
      contains: "feature-add"
    - path: "packages/fixtures/src/seeds/feature-add/ttt-game.json"
      provides: "operator-authored TTT intent and AC fixture"
      contains: "tests/ttt-state.property.test.ts"
    - path: "packages/admission-e2e/src/seed-library-shape.contract.test.ts"
      provides: "cross-package contract for seed library shape"
      contains: "seedLibrary"
    - path: "packages/admission-e2e/src/ttt-seed-ambiguity.contract.test.ts"
      provides: "TTT seed ambiguity/admission contract"
      contains: "promoteIntentDraft"
  key_links:
    - from: "packages/fixtures/src/seeds/feature-add/ttt-game.json"
      to: "packages/intent/src/ambiguity-scoring.ts"
      via: "AC-rich intent must pass existing ambiguity threshold"
      pattern: "0.2"
    - from: "packages/fixtures/src/seeds/index.ts"
      to: "scripts/stress.sh"
      via: "stress drivers flatten archetype-keyed seeds"
      pattern: "seedLibrary"
    - from: "packages/admission-e2e/package.json"
      to: "packages/fixtures/package.json"
      via: "workspace dependency for admission-e2e seed imports"
      pattern: "@protostar/fixtures"
---

<objective>
Create the Phase 11 per-archetype seed library and the single-shot TTT feature-add seed.

Purpose: stress and delivery need deterministic seeds while Phase 10's cosmetic seed order stays stable.
Output: grouped fixture exports, TTT seed data, expectations, and shape contracts.
</objective>

<execution_context>
@/Users/zakkeown/.codex/get-shit-done/workflows/execute-plan.md
@/Users/zakkeown/.codex/get-shit-done/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
@.planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md
@.planning/phases/11-headless-mode-e2e-stress/11-PATTERNS.md
@packages/fixtures/src/seeds/index.ts
@packages/fixtures/src/seeds/seed-library.test.ts
@packages/fixtures/src/seeds/button-color-hover.ts
@packages/intent/src/ambiguity-scoring.ts
@packages/intent/src/promote-intent-draft.ts
@packages/admission-e2e/package.json
@packages/admission-e2e/tsconfig.json
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Convert seed library tests to per-archetype shape</name>
  <read_first>
    - packages/fixtures/src/seeds/index.ts
    - packages/fixtures/src/seeds/seed-library.test.ts
    - packages/admission-e2e/src/dogfood-report-byte-equality.contract.test.ts
  </read_first>
  <files>packages/fixtures/src/seeds/seed-library.test.ts, packages/admission-e2e/package.json, packages/admission-e2e/tsconfig.json, packages/admission-e2e/src/seed-library-shape.contract.test.ts, pnpm-lock.yaml</files>
  <action>
    Update fixture tests before changing implementation. Assert `seedLibrary` is a frozen record with keys exactly `["cosmetic-tweak", "feature-add", "bugfix", "refactor"]`.
    Assert `seedLibrary["cosmetic-tweak"]` preserves the ordered ids `button-color-hover`, `card-shadow`, `navbar-aria`.
    Assert `seedLibrary["feature-add"]` contains `ttt-game`; `bugfix` and `refactor` arrays may be empty in this plan because Plan 11-02 wires admission while this plan owns only the TTT seed.
    Add `packages/admission-e2e/src/seed-library-shape.contract.test.ts` that imports the compiled fixtures package and asserts every seed has `{ id, intent, archetype, notes, acceptanceCriteria }`, and every `archetype` equals its record key.
    Wire that import explicitly: add `@protostar/fixtures: "workspace:*"` to `packages/admission-e2e/package.json`, add `{ "path": "../fixtures" }` to `packages/admission-e2e/tsconfig.json` references, and run `pnpm install --lockfile-only` so `pnpm-lock.yaml` records the admission-e2e workspace dependency. Do not rely on transitive imports through factory-cli.
  </action>
  <verify>
    <automated>pnpm install --lockfile-only && pnpm --filter @protostar/fixtures test && pnpm --filter @protostar/admission-e2e test && rg -n "@protostar/fixtures|packages/fixtures" packages/admission-e2e/package.json packages/admission-e2e/tsconfig.json pnpm-lock.yaml</automated>
  </verify>
  <acceptance_criteria>
    - Tests fail before implementation because `seedLibrary` is currently an array.
    - Contract test names include `feature-add` and `ttt-game`.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Add the TTT feature-add seed and expectations</name>
  <read_first>
    - packages/fixtures/src/seeds/index.ts
    - packages/fixtures/src/seeds/button-color-hover.ts
    - .planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
  </read_first>
  <files>packages/fixtures/src/seeds/index.ts, packages/fixtures/src/seeds/feature-add/ttt-game.json, packages/fixtures/src/seeds/feature-add/ttt-game.ts, packages/fixtures/__fixtures__/feature-add/ttt-game/expectations.ts</files>
  <action>
    Extend `SeedArchetype` to `"cosmetic-tweak" | "feature-add" | "bugfix" | "refactor"` and extend `Seed` with `readonly acceptanceCriteria: readonly string[]` plus optional `readonly capabilityEnvelope?: { readonly budget?: { readonly maxRepairLoops?: number } }`.
    Export `seedLibrary` as a deeply frozen record. Add helper functions `listSeedIds(archetype?: SeedArchetype)` and `flattenSeedLibrary()` that return frozen arrays.
    Create `packages/fixtures/src/seeds/feature-add/ttt-game.json` with id `ttt-game`, archetype `feature-add`, intent `Build a playable Tauri tic-tac-toe game in the toy app`, budget `maxRepairLoops: 9`, and these ten AC strings exactly: 3x3 grid with 9 clickable cells; X moves first and players alternate; eight win conditions; winning player banner plus winning line; draw UI; restart resets to X; React state only, no persistence; keyboard accessible cells with Space activation; `e2e/ttt.spec.ts` already exists and must pass; `tests/ttt-state.property.test.ts` already exists and must pass.
    Create `ttt-game.ts` exporting a typed `tttGameSeed` constant with the same values so the package remains pure and does not perform runtime filesystem reads.
    Create expectations with `expectedTargetRepo: "../protostar-toy-ttt"`, `immutableVerificationFiles: ["e2e/ttt.spec.ts", "tests/ttt-state.property.test.ts"]`, `requiredCiChecks: ["build-and-test", "playwright-e2e"]`, and `expectedMaxAmbiguity: 0.2`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/fixtures test && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "ttt-game|tests/ttt-state.property.test.ts|e2e/ttt.spec.ts" packages/fixtures` finds seed data, typed export, and expectations.
    - `pnpm --filter @protostar/fixtures test` passes with frozen output assertions.
    - No Phase 10 fixture matrix files are regenerated or rewritten.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Prove the TTT seed clears the existing ambiguity gate</name>
  <read_first>
    - packages/fixtures/src/seeds/feature-add/ttt-game.ts
    - packages/fixtures/__fixtures__/feature-add/ttt-game/expectations.ts
    - examples/intents/feature-add.draft.json
    - packages/intent/src/promote-intent-draft.ts
    - packages/intent/src/admission-control.test.ts
  </read_first>
  <files>packages/admission-e2e/src/ttt-seed-ambiguity.contract.test.ts</files>
  <action>
    Add an admission-e2e contract that imports `tttGameSeed` and its expectations from `@protostar/fixtures`, materializes a real `IntentDraft` object in the same shape as `examples/intents/feature-add.draft.json`, and calls the existing `promoteIntentDraft({ draft, mode: "brownfield", confirmedAt })` path from `@protostar/intent`.
    The materialized draft must include `draftId`, `title`, `problem`, `requester`, `mode: "brownfield"`, `goalArchetype: "feature-add"`, `context` naming `../protostar-toy-ttt`, AC objects converted from the seed strings with non-manual `verification` values, constraints that forbid edits to `e2e/ttt.spec.ts` and `tests/ttt-state.property.test.ts`, stop conditions, and a capability envelope with `maxRepairLoops: 9`.
    Assert `result.ok === true`, `result.ambiguityAssessment.accepted === true`, `result.ambiguityAssessment.ambiguity <= 0.2`, `result.ambiguityAssessment.threshold === 0.2`, and zero required clarifications. Do not change the ambiguity threshold or scorer calibration to make this pass.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test -- --test-name-pattern "TTT seed ambiguity"</automated>
  </verify>
  <acceptance_criteria>
    - The contract fails if the TTT seed is vague, malformed, or accepted only by changing the canonical ambiguity threshold.
    - The test imports both `@protostar/fixtures` and `@protostar/intent` through explicit package wiring, not transitive dependencies.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| fixture data -> admitted intent | Static seed content becomes executable factory intent. |
| toy verification names -> delivery gate | Seed AC references files the factory must not edit. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-09 | Tampering | `ttt-game` seed | mitigate | Freeze seed exports and pin shape in admission-e2e. |
| T-11-10 | Elevation of Privilege | TTT seed capability envelope | mitigate | Budget is `maxRepairLoops: 9` only; no token-budget unit or wider authority added here. |
| T-11-11 | Tampering | toy verification AC | mitigate | AC names immutable verification files that Plan 11-04 refuses in targetFiles. |
| T-11-12 | Repudiation | seed-library grouping | mitigate | Contract asserts every seed archetype matches its record key. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/fixtures test`, `pnpm --filter @protostar/admission-e2e test`, and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
The grouped seed library is stable, cosmetic seeds are preserved, and `ttt-game` is available as a rich `feature-add` seed with immutable verification assumptions.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-03-SUMMARY.md`.
</output>
