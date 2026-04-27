---
phase: 01-intent-planning-admission
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
autonomous: true
requirements:
  - PLAN-A-03
must_haves:
  truths:
    - "`pnpm run verify` runs fast (typecheck + intent + factory-cli) for local-iteration use"
    - "`pnpm run verify:full` runs every package's tests via `pnpm -r test` for CI/pre-merge use (Q-01)"
    - "Adding a new package with a `test` script auto-joins `verify:full` without further wiring"
    - "Test runner remains `pnpm run build && node --test dist/*.test.js`; no new test framework introduced"
  artifacts:
    - path: package.json
      provides: "Tiered verify scripts: `verify` (fast) and `verify:full` (recursive all-packages)"
      contains: "verify:full"
  key_links:
    - from: package.json scripts.verify:full
      to: every package with a `test` script
      via: "`pnpm -r test`"
      pattern: "pnpm -r test"
---

<objective>
Replace today's filtered `verify` (only `intent` + `factory-cli`) with a tiered pair: `verify` stays fast for local dev, `verify:full` recursively runs every package's tests so admission contracts can no longer regress silently. Closes the verify gap flagged in `.planning/codebase/CONCERNS.md` ("verify script") and is the prerequisite for PLAN-A-03 and the Phase 1 CI workflow (Q-12 / Plan 10).

Purpose: Phase 1's success criterion "`pnpm run verify` covers every package's tests" cannot be satisfied without this change. Specifically, the 4684-line `packages/policy/src/admission-control.test.ts` is invisible to the current gate.

Output: Updated root `package.json` with `verify` (fast) and `verify:full` (recursive) scripts.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/codebase/CONCERNS.md
@.planning/codebase/TESTING.md
@package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace `verify` with tiered scripts in root package.json</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/package.json (current scripts block — line 11 has the existing `verify`)
    - /Users/zakkeown/Code/protostar/.planning/codebase/CONCERNS.md (the "verify script" debt entry — explains why filtered verify is unsafe)
    - /Users/zakkeown/Code/protostar/pnpm-workspace.yaml (to confirm `apps/*` + `packages/*` are the recursion roots)
  </read_first>
  <action>
    Edit `/Users/zakkeown/Code/protostar/package.json`. Replace the single `verify` script with two:

    ```json
    "verify": "pnpm run typecheck && pnpm --filter @protostar/intent test && pnpm --filter @protostar/factory-cli test",
    "verify:full": "pnpm run typecheck && pnpm -r test"
    ```

    Exact script names per Q-01: `verify` (fast) and `verify:full` (CI). Do NOT remove or rename other scripts (`build`, `typecheck`, `factory`). Preserve trailing-comma JSON conventions. Do not add new dependencies.

    Note: `pnpm -r test` will recurse into every workspace member with a `test` script. Each package's `test` already runs `pnpm run build && node --test dist/*.test.js` per `.planning/codebase/TESTING.md`, so no per-package change is needed here.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && node -e "const p=require('./package.json'); if(!p.scripts['verify:full']||!/pnpm -r test/.test(p.scripts['verify:full'])) {console.error('verify:full missing or wrong'); process.exit(1)} if(!p.scripts.verify||!/typecheck/.test(p.scripts.verify)) {console.error('verify missing or wrong'); process.exit(1)} console.log('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `node -e "console.log(require('./package.json').scripts['verify:full'])"` prints a string containing `pnpm -r test`.
    - `node -e "console.log(require('./package.json').scripts.verify)"` prints a string containing `typecheck` and at least one `pnpm --filter` invocation.
    - `grep -c '"verify"' package.json` is `1`; `grep -c '"verify:full"' package.json` is `1`.
    - `package.json` parses as valid JSON: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` exits 0.
  </acceptance_criteria>
  <done>Both scripts present; JSON valid; no other scripts modified.</done>
</task>

<task type="auto">
  <name>Task 2: Smoke-run `verify:full` against the current tree to surface any latent failure</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/package.json (verify:full just added)
    - /Users/zakkeown/Code/protostar/.planning/codebase/CONCERNS.md (`@dogpile/sdk` link risk — `pnpm -r test` will recurse into `dogpile-adapter`, which depends on the link; if the sibling repo is present locally this passes, if not it fails — that is exactly the symptom Plan 02 fixes)
  </read_first>
  <action>
    Run `pnpm run verify:full` from `/Users/zakkeown/Code/protostar`. Capture the result.

    Expected outcomes (any of these counts as "smoke-run complete"):
    1. Green: every package's tests pass. Record this in the SUMMARY.
    2. Red because of `@dogpile/sdk` link (sibling repo missing): record the failing package + error and call out that Plan 02 (`@dogpile/sdk` link risk) MUST land before Plan 10 (CI workflow).
    3. Red because of an actual contract regression: STOP and surface the failure to the operator — this is the kind of regression the gate is meant to catch.

    Do NOT modify any test or production code in this task. The point is to discover whether tiered verify exposes pre-existing breakage so downstream plans can plan around it.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm run verify:full; echo "EXIT=$?"</automated>
  </verify>
  <acceptance_criteria>
    - Command runs to completion (does not hang). Exit code is recorded in the SUMMARY.
    - If exit 0: SUMMARY notes "verify:full green at end of Plan 01".
    - If exit non-zero: SUMMARY records the failing package (e.g. `@protostar/dogpile-adapter`) + first failure line; downstream plan ordering (especially Plan 02 for dogpile, Plan 10 for CI) is updated accordingly.
  </acceptance_criteria>
  <done>verify:full has been executed once; outcome recorded in SUMMARY for downstream consumption.</done>
</task>

</tasks>

<verification>
- `verify` and `verify:full` are both present in root `package.json`.
- `verify:full` recurses via `pnpm -r test` (no per-package allowlist).
- Tiered verify has been smoke-run once; outcome is documented in SUMMARY.
</verification>

<success_criteria>
The verify gate now has a fast lane and a complete lane. PLAN-A-03's "every package's tests" requirement has its enabling script in place; later plans wire CI on top of `verify:full`.
</success_criteria>

<output>
After completion, create `.planning/phases/01-intent-planning-admission/01-01-SUMMARY.md` recording: which scripts were added, the verify:full smoke-run exit code, and any failing packages discovered (so Plans 02 and 10 can plan around them).
</output>
