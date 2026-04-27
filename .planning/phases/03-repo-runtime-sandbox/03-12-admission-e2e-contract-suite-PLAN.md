---
phase: 03-repo-runtime-sandbox
plan: 12
type: execute
wave: 4
depends_on: [11]
files_modified:
  - packages/admission-e2e/src/repo-runtime-dirty-worktree-refusal.contract.test.ts
  - packages/admission-e2e/src/repo-runtime-symlink-refusal.contract.test.ts
  - packages/admission-e2e/src/repo-runtime-subprocess-allowlist-refusal.contract.test.ts
  - packages/admission-e2e/src/repo-runtime-patch-apply-best-effort.contract.test.ts
  - packages/admission-e2e/src/repo-runtime-hash-mismatch-refusal.contract.test.ts
  - packages/admission-e2e/package.json
autonomous: true
requirements: [REPO-03, REPO-04, REPO-05, REPO-06]
must_haves:
  truths:
    - "Five new contract tests in @protostar/admission-e2e pin the per-gate evidence shapes for Phase 3"
    - "Each test consumes buildSacrificialRepo from @protostar/repo/internal/test-fixtures"
    - "Each test asserts on the schema'd shape of repo-runtime-admission-decision.json (not just outcome)"
    - "Subprocess allowlist refusal test exercises a real 'cargo' (or other non-baseline) command and confirms refusal"
    - "Patch-apply best-effort test (REPO-05 lead) asserts 5-patch result with patch-3 hash-mismatch"
  artifacts:
    - path: "packages/admission-e2e/src/repo-runtime-*.contract.test.ts"
      provides: "Five evidence-shape contract tests"
  key_links:
    - from: "packages/admission-e2e/src/repo-runtime-*.contract.test.ts"
      to: "@protostar/repo barrel + @protostar/repo/internal/test-fixtures"
      via: "imports + invocation"
      pattern: "buildSacrificialRepo|applyChangeSet|runCommand"
---

<objective>
Five contract tests in `@protostar/admission-e2e` pinning the per-gate evidence shapes Phase 3 emits. Mirrors Phase 2's `02-10-admission-e2e-contract-suite` precedent.

Purpose: Lock the admission-decision schema cross-package so future refactors don't drift the evidence shape. Each test corresponds to one of Phase 3's refusal/allow paths.
Output: Five new test files in `packages/admission-e2e/src/`, all green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-PATTERNS.md
@.planning/phases/02-authority-governance-kernel/02-10-admission-e2e-contract-suite-SUMMARY.md
@packages/admission-e2e/src
@packages/repo/schema/repo-runtime-admission-decision.schema.json

PATTERNS.md `packages/admission-e2e/src/repo-runtime-*.contract.test.ts`
analog (lines 426-466). The five contract tests are explicitly enumerated in
CONTEXT.md `<integration_points>`. Each test exercises one Phase 3 refusal /
evidence shape:
1. Dirty-worktree refusal evidence
2. Symlink refusal evidence
3. Subprocess-allowlist refusal evidence
4. Patch-apply best-effort partial-result evidence (REPO-05 lead)
5. Hash-mismatch refusal evidence

Pattern: each test (a) builds a sacrificial repo, (b) invokes the relevant
runtime function (or a smoke-runFactory subset) to trigger the path, (c)
asserts on the resulting admission-decision JSON's evidence shape against the
schema.

Add `@protostar/repo` workspace dep to `admission-e2e/package.json` if not
already present (it likely depends on `@protostar/authority` only — check).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Hash-mismatch + best-effort patch contract tests</name>
  <files>packages/admission-e2e/src/repo-runtime-hash-mismatch-refusal.contract.test.ts, packages/admission-e2e/src/repo-runtime-patch-apply-best-effort.contract.test.ts, packages/admission-e2e/package.json</files>
  <action>
    1. Add `@protostar/repo` and `@protostar/intent` to admission-e2e deps if
       missing.

    2. **hash-mismatch test:** build sacrificial repo with seed-0.txt; mint
       op via `@protostar/authority`; construct PatchRequest with deliberately
       wrong preImageSha256; call `applyChangeSet([patch])`; assert result
       length 1 with `status: "skipped-hash-mismatch"`; verify file unchanged
       on disk.

       Additionally: test that Phase 3 emits a refusal / evidence record
       containing the patch result via `applyChangeSet` return. (Plan 11's
       runFactory writes admission-decision.json with patchResults; mocking
       runFactory for a unit-style admission-e2e test may be too heavy —
       option: test the function-level evidence shape, document that
       full-runFactory integration is the smoke path.)

    3. **best-effort test (REPO-05 lead):** build repo with 5 seed files;
       construct 5 PatchRequests where patch 3 has wrong hash; call
       applyChangeSet; assert result is exactly:
       ```typescript
       [
         {path: "f1.txt", status: "applied"},
         {path: "f2.txt", status: "applied"},
         {path: "f3.txt", status: "skipped-hash-mismatch"},
         {path: "f4.txt", status: "applied"},
         {path: "f5.txt", status: "applied"},
       ]
       ```
       Verify on disk: f1, f2, f4, f5 mutated; f3 unchanged.

    Commit: `test(03-12): add hash-mismatch + best-effort partial contract tests`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <done>Two contract tests green; admission-e2e test count grew by 2.</done>
</task>

<task type="auto">
  <name>Task 2: Dirty-worktree + symlink refusal contract tests</name>
  <files>packages/admission-e2e/src/repo-runtime-dirty-worktree-refusal.contract.test.ts, packages/admission-e2e/src/repo-runtime-symlink-refusal.contract.test.ts</files>
  <action>
    1. **Dirty-worktree refusal:** build sacrificial repo with seed-0.txt
       committed; modify the file post-commit (overwrite it via the fixture's
       `dirtyFiles` option pointing to the same path — implementation detail:
       fixture writes after commit if path matches a committed path).
       Call `dirtyWorktreeStatus(repo.dir)`; assert `isDirty: true,
       dirtyFiles: ["seed-0.txt"]`.

       For the admission-e2e flavor: assert the dirty-status structure
       matches what `repo-runtime-admission-decision.schema.json` expects
       under the refusal-evidence shape (ie if the schema expects
       `evidence.dirtyFiles: string[]`, our test produces a value that
       fits).

    2. **Symlink refusal:** build sacrificial repo with `symlinks: [{path:
       "link.txt", target: "seed-0.txt"}]`. Call `auditSymlinks(repo.dir)`.
       Assert `ok: false, offendingPaths: ["link.txt"]`.

       Match against admission-decision schema's
       `evidence.symlinkRefusal: {ok, offendingPaths[]}` shape.

    Commit: `test(03-12): add dirty-worktree + symlink refusal contracts`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <done>Two more contract tests green; total +4 admission-e2e tests.</done>
</task>

<task type="auto">
  <name>Task 3: Subprocess-allowlist refusal contract test</name>
  <files>packages/admission-e2e/src/repo-runtime-subprocess-allowlist-refusal.contract.test.ts</files>
  <action>
    Construct an `AuthorizedSubprocessOp` for command `"cargo"` (NOT in
    baseline allowlist). Call `runCommand(op, {effectiveAllowlist:
    intersectAllowlist(/* no extension */), schemas: { /* ... */ }, ...})`.
    Expect `SubprocessRefusedError` with reason `"command-not-allowlisted"`.

    Then test argv-violation: command "node" (allowlisted), argv contains
    `"--upload-pack=evil"` — outer guard refuses; reason `"argv-violation"`.

    For an admission-decision-shape assertion: Plan 11 doesn't currently emit
    a per-subprocess admission-decision (subprocesses fire mid-run; Phase 5+
    consumes them). For Phase 3 v1, the contract test asserts the
    SubprocessRefusedError shape AND that the admission-decision evidence
    shape (when emitted) accommodates a `subprocessRecords` array with the
    refusal recorded.

    Commit: `test(03-12): subprocess allowlist refusal contract`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <done>Five contract tests green. Phase 3 admission-e2e suite complete.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| admission-e2e tests → repo runtime | Tests are the contract; they detect drift between schema and producer |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-12-01 | Repudiation | Schema drifts without test failure | mitigate | Five contract tests pin evidence shapes; future producer changes that drop fields fail these tests. |
| T-03-12-02 | Tampering | Test bypass via direct shape construction | accept | Tests construct evidence via real producers (applyChangeSet, auditSymlinks, etc.), not by hand-rolling shapes. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-03, REPO-04, REPO-05, REPO-06 (each refusal path).
- **Sample frequency:** Per-task `pnpm --filter @protostar/admission-e2e test`.
- **Observability:** Five distinct `*.contract.test.ts` files; each pins one evidence shape.
- **Nyquist:** Phase-3 contract suite augments Phase 2's; together they form the e2e regression net.
</validation_strategy>

<verification>
- `pnpm --filter @protostar/admission-e2e test` green
- `ls packages/admission-e2e/src/repo-runtime-*.contract.test.ts | wc -l` == 5
</verification>

<success_criteria>
- Five Phase-3 contract tests green
- Each consumes `buildSacrificialRepo`
- Each pins one evidence shape from `repo-runtime-admission-decision.schema.json`
- No new dep additions beyond `@protostar/repo` + `@protostar/intent`
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-12-SUMMARY.md` with: per-test name + assertion shape + line count, total admission-e2e test count delta.
</output>
