---
phase: 12-authority-boundary-stabilization
plan: 01
subsystem: governance
tags: [verify, ci, requirements, authority-boundary]
requires: []
provides:
  - unified-verify-script
  - auth-requirements-block
affects:
  - package.json
  - .github/workflows/verify.yml
  - .planning/REQUIREMENTS.md
tech_stack_added: []
patterns_used:
  - single-source-of-truth verify pipeline (local == CI)
key_files_created: []
key_files_modified:
  - package.json
  - .github/workflows/verify.yml
  - .planning/REQUIREMENTS.md
decisions:
  - D-01 verify-script collapse applied verbatim
  - Inserted AUTH block after Phase 11 (not after Phase 10.1) to keep phase ordering monotone
  - Coverage total adjusted to 107 (plan literal '93' was stale pre-Phase-11)
metrics:
  duration_minutes: ~5
  completed_date: 2026-04-29
  tasks_completed: 2
  tasks_total: 3
  files_modified: 3
requirements: [AUTH-01, AUTH-16]
---

# Phase 12 Plan 01: Verify Collapse Summary

Collapsed `verify`/`verify:full` into a single CI-equivalent script and seeded the AUTH-01..AUTH-16 requirements block so every later Phase 12 plan can reference real IDs.

## Tasks

### Task 1: Unify verify script — Commit `4e88240`

- `package.json`: replaced `verify` value with the unified pipeline (`pnpm run typecheck && node --experimental-strip-types tools/check-subpath-exports.ts && pnpm -r test && pnpm knip --no-config-hints`); deleted `verify:full`.
- `.github/workflows/verify.yml`: job name and step now invoke `pnpm run verify` (was `verify:full`).
- Acceptance:
  - `grep -c '"verify:full"' package.json` → `0` ✓
  - unified `verify` literal present ✓
  - `grep -c 'verify:full' .github/workflows/verify.yml` → `0` ✓
  - `pnpm run typecheck` → exit 0 ✓
- Full unified `pnpm run verify` intentionally NOT run — gated by Wave 0 end-of-wave check (Task 3), which depends on 12-02 and 12-03 also landing.

### Task 2: AUTH-01..AUTH-16 block in REQUIREMENTS.md — Commit `c988f51`

- Appended `### Phase 12 — Authority Boundary Stabilization (inserted)` section with 16 AUTH-NN bullets (D-01..D-16).
- Appended 16 traceability rows (`| AUTH-01..16 | Phase 12 | Pending |`); AUTH-16 annotated `Pending (no test artifact)`.
- Coverage block updated: `65 + 12 Phase 10.1 + 14 Phase 11 + 16 Phase 12`; `Mapped to phases: 107`.
- Acceptance:
  - 16 AUTH-NN bullets ✓
  - 16 `| AUTH-XX | Phase 12 |` traceability rows ✓
  - Coverage updated (to 107, not the stale plan literal 93 — see Deviations) ✓

### Task 3: Wave 0 end-of-wave verify gate (5x flake check) — NOT EXECUTED IN THIS WORKTREE

Per the plan's own preamble: *"This task runs ONLY AFTER 12-02 (schema cascade) and 12-03 (diff-name-only relocate) have both landed."* Both are sibling Wave 0 plans running in parallel worktrees right now; they have not landed in this branch's history. Task 3 is therefore an orchestrator-owned wave-end gate, not a step this worktree executor can run.

Action for orchestrator: after 12-01, 12-02, 12-03 are all merged into main, run `for i in 1 2 3 4 5; do pnpm run verify || exit 1; done` and write `12-01-WAVE0-VERIFY-EVIDENCE.md`. Treat any Plan 06-09 `run-real-execution.test.ts` flake as a stop condition per Pitfall 7.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan stale literal] Coverage total updated to 107, not 93**
- **Found during:** Task 2 setup
- **Issue:** Plan instructs `Update 'Mapped to phases: 77' to 'Mapped to phases: 93'`, but actual file already read `Mapped to phases: 91` (Phase 11 STRESS block had been added since the plan was authored). The plan's intent — "add the 16 AUTH requirements to the count" — is unambiguous; only the literal target was stale.
- **Fix:** Wrote `Mapped to phases: 107` (= 65 base + 12 BOUNDARY + 14 STRESS + 16 AUTH). Plan's automated verify (`grep -q 'Mapped to phases: 93'`) will fail by design; that check is itself stale and should be re-tuned to `107`.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Commit:** `c988f51`

**2. [Rule 1 - Plan stale anchor] AUTH block inserted after Phase 11, not after Phase 10.1**
- **Found during:** Task 2 setup
- **Issue:** Plan instructs `Append a new section AFTER the existing Phase 10.1 BOUNDARY block (after line 148), BEFORE the '## Deferred (post-v1)' heading`. The Phase 11 STRESS block now lives between Phase 10.1 and `## Deferred`; inserting at the literal position would break monotone phase ordering.
- **Fix:** Inserted the AUTH block after the Phase 11 section, immediately before `## Deferred (post-v1)`. Section content unchanged. Acceptance criteria are position-agnostic (count-based) so they still pass.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Commit:** `c988f51`

**3. [Rule 1 - Plan stale anchor] Traceability rows appended after STRESS-14, not after BOUNDARY-12**
- **Found during:** Task 2 setup
- **Issue:** Same root cause — plan anchored on `| BOUNDARY-12 | Phase 10.1 | Complete |` but Phase 11 STRESS-01..14 rows now sit after that line.
- **Fix:** Appended AUTH-01..16 traceability rows after STRESS-14. Acceptance check (`grep -c '| AUTH-[0-9]\+ | Phase 12 |'` == 16) is position-agnostic.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Commit:** `c988f51`

No Rule 2/3 fixes were required. No Rule 4 architectural changes encountered.

## Threat Model Coverage

T-12-05 (Repudiation — verify gate divergence between local-dev and CI) is mitigated. There is now exactly one verify command and CI invokes it.

## Known Stubs

None. The plan introduces no source code; both edits are configuration / documentation.

## Self-Check: PASSED

- File `.planning/REQUIREMENTS.md` modified — present, contains 16 AUTH bullets + 16 AUTH traceability rows.
- File `package.json` modified — `verify:full` removed, unified `verify` present.
- File `.github/workflows/verify.yml` modified — `verify:full` references removed.
- Commit `4e88240` exists (`refactor(12-01): unify verify and verify:full scripts`).
- Commit `c988f51` exists (`docs(12-01): add AUTH-01..AUTH-16 requirements block`).
