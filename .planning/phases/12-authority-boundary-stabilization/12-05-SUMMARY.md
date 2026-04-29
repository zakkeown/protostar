---
phase: 12-authority-boundary-stabilization
plan: 05
subsystem: repo
tags: [patch-request, brand, canonicalize, path-invariant, applyChangeSet, mintPatchRequest, AUTH-09, AUTH-10]

requires:
  - phase: 12-authority-boundary-stabilization
    provides: ["@protostar/paths carve-out package (12-01)", "phase plan/research locks (12-04 prior wave)"]
provides:
  - "canonicalizeRelativePath helper in @protostar/paths"
  - "Branded PatchRequest type — only mintPatchRequest can construct it"
  - "mintPatchRequest constructor enforcing path/op.path/diff-filename equality after canonicalization"
  - "applyChangeSet defense-in-depth re-assertion catching handcrafted brand instances"
  - "apply-change-set-mismatch contract test in @protostar/admission-e2e (T-12-03 mitigation pin)"
affects: ["future patch-related plans", "factory-cli execution path", "any caller that builds PatchRequest objects"]

tech-stack:
  added: ["@protostar/paths workspace dependency in @protostar/repo"]
  patterns: ["unique-symbol brand on PatchRequest", "shared canonicalize helper at both mint and apply sites (Pitfall 5)", "absolute/relative op.path reconciliation before posix canonicalization"]

key-files:
  created:
    - "packages/paths/src/canonicalize-relative-path.ts"
    - "packages/paths/src/canonicalize-relative-path.test.ts"
    - "packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts"
  modified:
    - "packages/paths/src/index.ts"
    - "packages/repo/src/apply-change-set.ts"
    - "packages/repo/src/apply-change-set.test.ts"
    - "packages/repo/src/index.ts"
    - "packages/repo/package.json"
    - "packages/repo/tsconfig.json"
    - "apps/factory-cli/src/run-real-execution.ts"
    - "packages/admission-e2e/src/repo-runtime-hash-mismatch-refusal.contract.test.ts"
    - "packages/admission-e2e/src/repo-runtime-patch-apply-best-effort.contract.test.ts"

key-decisions:
  - "Reconciled absolute (production) vs relative (test) op.path in checkInvariant by relativizing absolute paths against op.workspace.root before canonicalization — fs-adapter mandates absolute op.path so the plan's relative-only assumption could not stand"
  - "Treated parsePatch returning a single empty/headerless patch as diff-parse-error (not diff-filename-mismatch) so 'not a unified diff' inputs surface the right refusal code"
  - "Migrated existing apply-change-set.test.ts hunk-fit/binary/parse-error/io-error tests through mintPatchRequest where the diff is mintable; converted unmintable cases (binary, garbage) to handcrafted-fake-brand cases that exercise the applyChangeSet re-assertion path"

patterns-established:
  - "Brand-via-mint pattern: unique-symbol brand + sole constructor function returning a discriminated result"
  - "Defense-in-depth re-assertion: identical invariant check at the function-entry boundary, sharing the same canonicalize helper as the mint constructor"
  - "Cross-package canonicalize helper lives in the paths carve-out (no business logic, pure node:path/posix manipulation)"

requirements-completed: [AUTH-09, AUTH-10]

duration: 32min
completed: 2026-04-29
---

# Phase 12 Plan 05: patch-request-brand Summary

**Branded PatchRequest with mintPatchRequest constructor and applyChangeSet defense-in-depth re-assertion, sharing one canonicalizeRelativePath helper in @protostar/paths so path/op/diff disagreement is refused at both mint and apply (T-12-03 mitigation).**

## Performance

- **Duration:** ~32 min
- **Tasks:** 3 (all TDD: RED → GREEN per task)
- **Files modified:** 10
- **Files created:** 3

## Accomplishments

- `canonicalizeRelativePath` exported from `@protostar/paths`: posix-only, refuses absolute and `..`-escaping inputs, strips a single leading `./`. Six unit tests cover the contract.
- `PatchRequest` branded with a `unique symbol`; raw object literals no longer satisfy the type. Forces every call site through `mintPatchRequest`.
- `mintPatchRequest` returns a discriminated result (`{ok:true, request}` | `{ok:false, error}`) with three machine-readable refusal codes: `path-mismatch`, `diff-filename-mismatch`, `diff-parse-error`.
- `applyChangeSet` re-asserts the same invariant at function entry using the same `checkInvariant`/`canonicalizeRelativePath` helper (Pitfall 5). Handcrafted fake-brand instances hit `skipped-error` / `path-op-diff-mismatch` before any I/O.
- Contract test `apply-change-set-mismatch.contract.test.ts` pins all five behaviors (3 mint refusals + canonicalization round-trip + applyChangeSet re-assertion).
- `apps/factory-cli/src/run-real-execution.ts` migrated to mint via `mintPatchRequest`; throws on refusal so workspace-write authorization failures surface as evidence.

## Task Commits

1. **Task 1 RED:** `c60b3dd` — `test(12-05): add failing canonicalizeRelativePath helper tests`
2. **Task 1 GREEN:** `44ff526` — `feat(12-05): add canonicalizeRelativePath helper to @protostar/paths`
3. **Task 2 RED:** `4cea694` — `test(12-05): add failing PatchRequest brand and re-assertion tests`
4. **Task 2 GREEN:** `15b69f0` — `feat(12-05): brand PatchRequest with mintPatchRequest and applyChangeSet re-assertion`
5. **Task 3:** `313dd95` — `test(12-05): add apply-change-set-mismatch contract test`
6. **Deviation fix:** `306b8e1` — `fix(12-05): migrate existing repo-runtime contract tests to mintPatchRequest`

## Files Created/Modified

### Created
- `packages/paths/src/canonicalize-relative-path.ts` — Pure posix path canonicalization helper.
- `packages/paths/src/canonicalize-relative-path.test.ts` — Six behavior tests.
- `packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts` — T-12-03 mitigation pin.

### Modified
- `packages/paths/src/index.ts` — Re-exports `canonicalizeRelativePath`.
- `packages/repo/src/apply-change-set.ts` — Added brand symbol, `mintPatchRequest`, `checkInvariant`, `reassertInvariants`, absolute/relative `op.path` reconciliation; added `path-op-diff-mismatch` to `ApplyError` union.
- `packages/repo/src/apply-change-set.test.ts` — `patchFor` mints; new tests for brand refusals, canonicalization round-trip, and re-assertion path.
- `packages/repo/src/index.ts` — Re-exports `mintPatchRequest`, `PatchRequestMintError`, `PatchRequestMintInput`.
- `packages/repo/package.json` — Adds `@protostar/paths` workspace dep.
- `packages/repo/tsconfig.json` — Adds `../paths` reference.
- `apps/factory-cli/src/run-real-execution.ts` — `patchesFromChangeSet` now mints; throws on refusal.
- `packages/admission-e2e/src/repo-runtime-hash-mismatch-refusal.contract.test.ts` — Migrated to `mintPatchRequest` (existing object literals stopped compiling against the branded type).
- `packages/admission-e2e/src/repo-runtime-patch-apply-best-effort.contract.test.ts` — Same migration; explicit `as PatchRequest` cast on the spread that overrides `preImageSha256` for the third patch.

## Decisions Made

1. **op.path absolute/relative reconciliation.** The plan's `mintPatchRequest` example assumed `op.path` would be relative, but `packages/repo/src/fs-adapter.ts:88-99` requires `op.path` to be absolute in production (it re-resolves and demands strict equality, throwing `canonicalization-mismatch` otherwise). Solved by relativizing absolute `op.path` against `op.workspace.root` (using OS-path `relative`) before passing to `canonicalizeRelativePath`. Both production (absolute) and contract-test (relative) op shapes flow through the same gate.
2. **diff-parse-error vs diff-filename-mismatch tie-break.** When `parsePatch` is given garbage like `"not a unified diff"`, it returns a single empty patch with no header. Distinguished `diff-parse-error` (no recognizable header at all, zero hunks) from `diff-filename-mismatch` (header parses but filename differs from path) so refusal codes carry signal.
3. **Existing parse-error / binary-not-supported tests.** With the brand boundary in place, garbage and binary diffs no longer reach `applyOnePatch` via the public API — they refuse at mint. Kept the original test files but split each into (a) a `mintPatchRequest` refusal assertion and (b) a handcrafted-fake-brand assertion that exercises the `applyChangeSet` re-assertion path. The internal `applyOnePatch` parse-error / binary-not-supported branches remain reachable only via fake brands; this is acceptable belt-and-suspenders.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] op.path absolute/relative reconciliation in checkInvariant**
- **Found during:** Task 2 (mintPatchRequest implementation)
- **Issue:** Plan said `canonicalizeRelativePath(input.op.path)` directly — but production `op.path` is absolute (fs-adapter requires it), so this would throw `"absolute path not allowed"` for every real call.
- **Fix:** Added `opPathRelative()` helper that uses OS-path `isAbsolute`/`relative` against `op.workspace.root` before posix-canonicalizing. Tests pass for both production (absolute) and contract-test (relative) shapes.
- **Files modified:** `packages/repo/src/apply-change-set.ts`
- **Verification:** All 116 `@protostar/repo` tests pass, including the 14 pre-existing `applyChangeSet` cases that flow through the new re-assertion gate.
- **Committed in:** `15b69f0`

**2. [Rule 3 - Blocking] Migrate two existing admission-e2e contract tests to mintPatchRequest**
- **Found during:** Task 3 verify (admission-e2e build)
- **Issue:** `repo-runtime-hash-mismatch-refusal.contract.test.ts` and `repo-runtime-patch-apply-best-effort.contract.test.ts` constructed raw `PatchRequest` literals; after branding, these stopped compiling. Build break would have prevented Task 3's contract test from running in the pnpm test command.
- **Fix:** Migrated both to use `mintPatchRequest`; added explicit `as PatchRequest` cast on the spread that overrides `preImageSha256` mid-test (since spreading erases the brand at the type level).
- **Files modified:** `packages/admission-e2e/src/repo-runtime-hash-mismatch-refusal.contract.test.ts`, `packages/admission-e2e/src/repo-runtime-patch-apply-best-effort.contract.test.ts`
- **Verification:** `node --test dist/contracts/apply-change-set-mismatch.contract.test.js` runs all 5 cases green.
- **Committed in:** `306b8e1`

**3. [Rule 2 - Missing Critical] Added `path-op-diff-mismatch` to `ApplyError` union**
- **Found during:** Task 2 (re-assertion implementation)
- **Issue:** Plan step 3 noted "ADD `path-op-diff-mismatch` as a permitted error string in the result type union" if not present — it was not.
- **Fix:** Extended `ApplyError` union with `"path-op-diff-mismatch"`.
- **Files modified:** `packages/repo/src/apply-change-set.ts`
- **Verification:** Type check + new re-assertion test pass.
- **Committed in:** `15b69f0`

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 missing critical)
**Impact on plan:** All three were correctness/build prerequisites; no scope creep. Plan executed as designed otherwise.

## Issues Encountered

### Out-of-scope build failures (deferred)

Pre-existing build failures unrelated to this plan are tracked in
`.planning/phases/12-authority-boundary-stabilization/deferred-items.md`:

- `apps/factory-cli/src/{commands,stress}/*.test.ts` — six test files reference source modules that do not exist on disk. Breaks `pnpm --filter @protostar/factory-cli typecheck` and propagates to any package whose tsconfig references factory-cli. Existed at 12-05 base.
- `packages/paths/src/resolve-workspace-root.test.ts` — one case fails inside the worktree (worktree-context bug in `resolveWorkspaceRoot`). Unchanged by 12-05.

12-05 verification path used to work around these:
- `pnpm --filter @protostar/repo test` — 116/116 pass.
- `pnpm --filter @protostar/paths test` — 10/11 pass; the 1 failure is the pre-existing worktree-context bug.
- `node --test packages/admission-e2e/dist/contracts/apply-change-set-mismatch.contract.test.js` — 5/5 pass.

Full `pnpm run verify` is not green at HEAD, but the failures are pre-existing and not introduced by this plan.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| (none) | — | No new security-relevant surface beyond the planned mitigation. The brand boundary tightens the existing surface; it does not add new endpoints, auth paths, or trust-boundary I/O. |

## Next Phase Readiness

- AUTH-09 satisfied: `PatchRequest` mint constructor refuses path/op/diff disagreement; `applyChangeSet` re-asserts.
- AUTH-10 satisfied: exact-string `===` equality after canonicalization through one shared helper in `@protostar/paths`.
- Contract test pins T-12-03; future regressions will be caught at the admission-e2e gate.
- `mintPatchRequest` is now the only legitimate construction path; downstream callers (factory-cli, admission-e2e contracts) updated.

## Self-Check: PASSED

Verified files exist:
- `packages/paths/src/canonicalize-relative-path.ts` — FOUND
- `packages/paths/src/canonicalize-relative-path.test.ts` — FOUND
- `packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts` — FOUND

Verified commits exist (range `7c1fe13..HEAD`):
- `c60b3dd` test(12-05): RED canonicalize tests — FOUND
- `44ff526` feat(12-05): canonicalize helper — FOUND
- `4cea694` test(12-05): RED brand tests — FOUND
- `15b69f0` feat(12-05): brand + mint + re-assertion — FOUND
- `313dd95` test(12-05): contract test — FOUND
- `306b8e1` fix(12-05): admission-e2e migration — FOUND

---
*Phase: 12-authority-boundary-stabilization*
*Completed: 2026-04-29*
