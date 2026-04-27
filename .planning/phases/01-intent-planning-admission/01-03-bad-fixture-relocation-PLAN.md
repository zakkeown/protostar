---
phase: 01-intent-planning-admission
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - examples/intents/bad/missing-capability.json
  - examples/intents/bad/missing-capability.ambiguity.brownfield.json
  - examples/planning-results/bad/capability-envelope-expansion.json
  - examples/planning-results/bad/cyclic-plan-graph.json
  - examples/planning-results/bad/missing-acceptance-coverage.json
  - examples/planning-results/bad/missing-dependency.json
  - examples/planning-results/bad/missing-pr-write-verification.json
  - examples/planning-results/bad/unknown-acceptance-criterion.json
  - packages/policy/src/example-intent-fixtures.test.ts
  - packages/planning/src/pre-handoff-verification-admission.test.ts
  - apps/factory-cli/src/main.test.ts
autonomous: true
requirements:
  - INTENT-01
  - PLAN-A-02
must_haves:
  truths:
    - "Every intentionally-bad fixture lives under an `examples/**/bad/` subdirectory (Q-06)"
    - "No fixture under `examples/intents/bad/` or `examples/planning-results/bad/` carries the legacy `bad-` filename prefix"
    - "Every test that previously referenced a `bad-*.json` path now references the relocated path under `bad/`"
    - "Directory layout is the manifest: every file under `bad/` MUST reject; every file outside `bad/` MUST pass (verified end-to-end in Plan 09)"
  artifacts:
    - path: examples/intents/bad/
      provides: "Intent fixtures expected to be REJECTED by admission"
    - path: examples/planning-results/bad/
      provides: "Planning-result fixtures expected to be REJECTED by admission"
  key_links:
    - from: packages/policy/src/example-intent-fixtures.test.ts
      to: "examples/intents/bad/missing-capability.json"
      via: "relative path string"
      pattern: "examples/intents/bad/missing-capability\\.json"
    - from: apps/factory-cli/src/main.test.ts
      to: "examples/planning-results/bad/{cyclic-plan-graph,missing-acceptance-coverage,capability-envelope-expansion}.json"
      via: "relative path constants"
      pattern: "examples/planning-results/bad/"
---

<objective>
Relocate every intentionally-bad fixture into `examples/intents/bad/` and `examples/planning-results/bad/`, strip the `bad-` filename prefix, and update every existing test that referenced the old paths. Per CONTEXT.md Q-06 the directory becomes the manifest: discovery-by-directory replaces a file-listed manifest. This is a prerequisite for Plan 09's parameterized `bad/`-driven admission e2e test.

Purpose: Structural separation is self-documenting and harder to drift than a manifest. Pairs with Plan 09 (parameterized e2e) and Plan 04 (schemaVersion infra) which together close INTENT-01 and PLAN-A-02 enforcement.

Output: New `bad/` subdirs populated; old `bad-*.json` paths removed; every existing test updated to the new path.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-intent-planning-admission/01-CONTEXT.md
@.planning/codebase/STRUCTURE.md
@examples/intents
@examples/planning-results
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move bad-* fixtures into `bad/` subdirs and strip the prefix</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/examples/intents/ (current files — confirm exact filenames)
    - /Users/zakkeown/Code/protostar/examples/planning-results/ (current files — confirm exact filenames)
    - /Users/zakkeown/Code/protostar/.planning/phases/01-intent-planning-admission/01-CONTEXT.md (Q-06 decision text — directory-as-manifest)
  </read_first>
  <action>
    Use `git mv` (preserves history) to relocate. Exact moves required (verbatim):

    Intents:
    - `examples/intents/bad-missing-capability.json` → `examples/intents/bad/missing-capability.json`
    - `examples/intents/bad-missing-capability.ambiguity.brownfield.json` → `examples/intents/bad/missing-capability.ambiguity.brownfield.json`

    Planning results:
    - `examples/planning-results/bad-capability-envelope-expansion.json` → `examples/planning-results/bad/capability-envelope-expansion.json`
    - `examples/planning-results/bad-cyclic-plan-graph.json` → `examples/planning-results/bad/cyclic-plan-graph.json`
    - `examples/planning-results/bad-missing-acceptance-coverage.json` → `examples/planning-results/bad/missing-acceptance-coverage.json`
    - `examples/planning-results/bad-missing-dependency.json` → `examples/planning-results/bad/missing-dependency.json`
    - `examples/planning-results/bad-missing-pr-write-verification.json` → `examples/planning-results/bad/missing-pr-write-verification.json`
    - `examples/planning-results/bad-unknown-acceptance-criterion.json` → `examples/planning-results/bad/unknown-acceptance-criterion.json`

    Use `mkdir -p examples/intents/bad examples/planning-results/bad` first. Then `git mv` each file. Do NOT alter file CONTENTS in this task — only the path. Schema-version annotation lives in Plan 04.

    Note: `scaffold.json`, `scaffold.draft.json`, `scaffold.ambiguity.greenfield.json`, `scaffold.ambiguity.brownfield.json`, `cosmetic-tweak.draft.json`, `bugfix.draft.json`, `feature-add.draft.json`, `refactor.draft.json`, and the `greenfield/` + `brownfield/` subdirs stay where they are — they are not bad fixtures.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && test -d examples/intents/bad && test -d examples/planning-results/bad && test -f examples/intents/bad/missing-capability.json && test -f examples/planning-results/bad/cyclic-plan-graph.json && test -f examples/planning-results/bad/missing-acceptance-coverage.json && test -f examples/planning-results/bad/capability-envelope-expansion.json && test -f examples/planning-results/bad/missing-dependency.json && test -f examples/planning-results/bad/missing-pr-write-verification.json && test -f examples/planning-results/bad/unknown-acceptance-criterion.json && ls examples/intents/bad-*.json 2>/dev/null | grep -v '^#' | wc -l | xargs -I{} test {} -eq 0 && ls examples/planning-results/bad-*.json 2>/dev/null | grep -v '^#' | wc -l | xargs -I{} test {} -eq 0</automated>
  </verify>
  <acceptance_criteria>
    - All 8 expected files exist at their new `bad/` paths (listed verbatim above).
    - `ls examples/intents/bad-*.json 2>/dev/null | wc -l` is `0`.
    - `ls examples/planning-results/bad-*.json 2>/dev/null | wc -l` is `0`.
    - `git status --short` shows the moves as renames (`R` prefix), not as delete+add (verifies `git mv` was used).
    - File contents are byte-identical pre/post move: `git show HEAD:examples/intents/bad-missing-capability.json | diff - examples/intents/bad/missing-capability.json` produces no output.
  </acceptance_criteria>
  <done>All 8 fixtures relocated; no `bad-*.json` remains in the old locations; contents unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Update every test path reference to the new locations</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/policy/src/example-intent-fixtures.test.ts (lines 17-18 reference `bad-missing-capability.*`)
    - /Users/zakkeown/Code/protostar/packages/planning/src/pre-handoff-verification-admission.test.ts (line 147 references `bad-missing-pr-write-verification.json`)
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/main.test.ts (lines 34-37 reference `bad-missing-acceptance-coverage.json`, `bad-cyclic-plan-graph.json`, `bad-capability-envelope-expansion.json`)
  </read_first>
  <behavior>
    - Test: `pnpm --filter @protostar/policy test`, `pnpm --filter @protostar/planning test`, and `pnpm --filter @protostar/factory-cli test` all pass after the path edits
    - Test: no source file under `packages/`, `apps/`, or `.planning/` references the old `bad-` prefix paths
  </behavior>
  <action>
    Edit every reference. EXACT string replacements (do these case-sensitively, replace verbatim):

    1. `packages/policy/src/example-intent-fixtures.test.ts`:
       - `"bad-missing-capability.ambiguity.brownfield.json"` → `"bad/missing-capability.ambiguity.brownfield.json"`
       - `"bad-missing-capability.json"` → `"bad/missing-capability.json"`

    2. `packages/planning/src/pre-handoff-verification-admission.test.ts`:
       - `"../../../examples/planning-results/bad-missing-pr-write-verification.json"` → `"../../../examples/planning-results/bad/missing-pr-write-verification.json"`

    3. `apps/factory-cli/src/main.test.ts`:
       - `"examples/planning-results/bad-missing-acceptance-coverage.json"` → `"examples/planning-results/bad/missing-acceptance-coverage.json"`
       - `"examples/planning-results/bad-cyclic-plan-graph.json"` → `"examples/planning-results/bad/cyclic-plan-graph.json"`
       - `"examples/planning-results/bad-capability-envelope-expansion.json"` → `"examples/planning-results/bad/capability-envelope-expansion.json"`

    After edits, do a final repo-wide grep to catch anything missed: `grep -rn "bad-missing\|bad-cyclic\|bad-capability\|bad-unknown" packages apps examples --include='*.ts' --include='*.json'` — every hit must be in a relocated `bad/` file's contents (a test description string is fine; a path reference is not).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && (grep -rn "examples/planning-results/bad-\|examples/intents/bad-\|\"bad-missing-capability" packages apps --include='*.ts' --include='*.json' | grep -v dist | grep -v node_modules | grep -v '^#' | wc -l | xargs -I{} test {} -eq 0) && pnpm --filter @protostar/policy build && pnpm --filter @protostar/policy test && pnpm --filter @protostar/planning build && pnpm --filter @protostar/planning test && pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rn 'examples/planning-results/bad-' packages apps --include='*.ts' --include='*.json' | grep -v dist | grep -v node_modules | wc -l` is `0`.
    - `grep -rn 'examples/intents/bad-' packages apps --include='*.ts' --include='*.json' | grep -v dist | grep -v node_modules | wc -l` is `0`.
    - `grep -c '"bad/missing-capability.json"' packages/policy/src/example-intent-fixtures.test.ts` is at least `1`.
    - `grep -c "examples/planning-results/bad/cyclic-plan-graph.json" apps/factory-cli/src/main.test.ts` is at least `1`.
    - `pnpm --filter @protostar/policy test` exits 0.
    - `pnpm --filter @protostar/planning test` exits 0.
    - `pnpm --filter @protostar/factory-cli test` exits 0.
  </acceptance_criteria>
  <done>All path references updated; every affected package's tests pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Test fixture path strings ↔ admission test runners | A wrong path silently turns "rejection expected" into "file not found" → false green |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-03-01 | Repudiation | Bad-fixture admission test runners | mitigate | Acceptance grep gates in Task 2 ensure no stale `bad-*` path references remain; per-package test runs verify each consumer still passes |
| T-01-03-02 | Tampering | git history of relocated fixtures | mitigate | `git mv` preserves rename detection; T1 acceptance verifies via `git status --short` showing `R` prefixes |
</threat_model>

<verification>
- 8 fixtures present at new `bad/` paths.
- 0 `bad-*.json` remain at old paths.
- 0 stale path references in `packages/` or `apps/`.
- `pnpm --filter` test passes for `policy`, `planning`, `factory-cli`.
</verification>

<success_criteria>
Directory layout becomes the manifest: every file under `examples/**/bad/` is by-construction a rejection fixture, every file outside is by-construction an acceptance fixture. Plan 09 will codify this as enforcement.
</success_criteria>

<output>
After completion, create `.planning/phases/01-intent-planning-admission/01-03-SUMMARY.md` listing every relocated file and every edited test file with line numbers, so Plan 09's e2e test can build its discovery loop on the same path basis.
</output>
