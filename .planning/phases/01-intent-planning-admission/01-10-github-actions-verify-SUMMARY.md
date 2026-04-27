---
phase: 01-intent-planning-admission
plan: 10
subsystem: infra
tags: [github-actions, ci, pnpm, node22, verify-gate]

requires:
  - phase: 01-intent-planning-admission
    provides: "Plan 01 verify:full script (root package.json) and Plan 02 dogpile-types shim that unblocks --frozen-lockfile on hosted runners"
provides:
  - ".github/workflows/verify.yml — minimal CI gate running pnpm install --frozen-lockfile && pnpm run verify:full on PR + push to main"
  - "Phase 1 'in CI' literal success criterion (Q-12) closed at the workflow-file level"
affects: [phase-02-governance, phase-10-dogfood-and-hardening]

tech-stack:
  added: [actions/checkout@v4, pnpm/action-setup@v4, actions/setup-node@v4]
  patterns: ["Two-step toolchain: pnpm/action-setup before actions/setup-node so cache: pnpm resolves the pinned binary"]

key-files:
  created:
    - .github/workflows/verify.yml
  modified: []

key-decisions:
  - "Pinned pnpm 10.33.0 to match package.json packageManager (no floating range)"
  - "Pinned Node 22 to match engines.node (no matrix in Phase 1; deferred to Phase 10)"
  - "Workflow has zero secrets and zero write permissions — Phase 1 introduces no LM Studio / Octokit credentials"
  - "Branch-protection 'required check' configuration is operator-only (cannot self-grant via YAML); flagged in this SUMMARY for repo-admin follow-up"

patterns-established:
  - "CI gate pattern: pnpm/action-setup@v4 (version pin) → actions/setup-node@v4 (node-version + cache: pnpm) → pnpm install --frozen-lockfile → pnpm run verify:full"

requirements-completed: [PLAN-A-03]

duration: ~5min
completed: 2026-04-27
---

# Phase 01 Plan 10: GitHub Actions verify Workflow Summary

**Minimal CI gate at .github/workflows/verify.yml runs pnpm run verify:full on every PR and push to main, using pinned Node 22 + pnpm 10.33.0.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-27T13:40Z
- **Completed:** 2026-04-27T13:45:22Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Workflow file created and structurally validated (parses via node, contains all required tokens per acceptance criteria).
- Local `pnpm run verify:full` re-run pre-merge: **exit code 0** (34 tests, 4 suites, 0 fail) — proxy confirmation that CI will be green when GitHub schedules the runner.
- PLAN-A-03 closed at the artifact level for Phase 1.

## Task Commits

1. **Task 1: Author .github/workflows/verify.yml** — `30b8c1f` (ci)

## Files Created/Modified

- `.github/workflows/verify.yml` — Single-job workflow (`verify` on `ubuntu-latest`) triggered by `pull_request` and `push` to `main`. Steps: checkout → setup-pnpm@v4 (10.33.0) → setup-node@v4 (Node 22, pnpm cache) → pnpm install --frozen-lockfile → pnpm run verify:full.

## Decisions Made

None beyond what the plan specified. File written verbatim from `<action>` block.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. `actionlint` and `yamllint` were not installed locally; structural YAML validation was performed via `node` (regex + token presence + tab/structure check) and exit-code-0 from a full local `pnpm run verify:full` run.

## Operator Follow-up Required (NOT a task gate, but blocks Phase 1 closure)

**Branch protection — required status check.** GitHub Actions YAML alone cannot mark itself as a required check; this is repo-admin-only and must be configured in the GitHub UI by a maintainer:

1. Navigate to GitHub repo → **Settings → Branches → Branch protection rules**
2. Add or edit the rule for `main`
3. Enable **Require status checks to pass before merging**
4. Search for and select **`verify / pnpm run verify:full`** (the job name as it will appear after the workflow runs at least once on a PR)
5. Optionally enable **Require branches to be up to date before merging**
6. Save

**Why this is operator-only:** Branch-protection settings require repo-admin auth that the workflow's default `GITHUB_TOKEN` does not (and per Phase 1 threat model T-01-10-02, should not) hold. Phase 10 (DOG-08 / hardening) may automate this via the GitHub API once an admin-scoped credential is in scope.

**Consequence if skipped:** The workflow still runs on every PR and push, but PRs can be merged while it's red. Phase 1's literal success criterion ("required check on main") is only fully met after this operator step.

## Pre-merge Local Verification

```
$ pnpm run verify:full
... (34 tests, 4 suites, 0 fail)
EXIT=0
```

The workflow will reproduce this on `ubuntu-latest` with the same Node 22 + pnpm 10.33.0 toolchain.

## Next Phase Readiness

- Phase 1 admission/intent gates are now CI-enforced (subject to the operator follow-up above).
- Phase 2 (governance) inherits a working CI surface with no secrets — when GOV-06 introduces signing material, the workflow will need a `permissions:` block and secret references; Plan 10 deliberately omits both to avoid premature coupling.
- Phase 10 (dogfood + hardening) will harden this workflow with: matrix builds (multi-Node, multi-OS), security scanning (CodeQL or equivalent), concurrency cancel for stale PR pushes, and end-to-end dogfood of the factory itself.

## Self-Check: PASSED

- File exists: `.github/workflows/verify.yml` — FOUND
- Commit exists: `30b8c1f` — FOUND in `git log`
- Required tokens present: `pnpm run verify:full`, `frozen-lockfile`, `node-version: 22`, `version: 10.33.0`, `pull_request`, `push` — all FOUND
- Local `pnpm run verify:full` exit code: **0**

---
*Phase: 01-intent-planning-admission*
*Completed: 2026-04-27*
