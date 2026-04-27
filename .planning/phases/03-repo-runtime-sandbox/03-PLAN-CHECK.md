# Phase 3 Plan Check — Iteration 2

**Verifier:** gsd-plan-checker
**Date:** 2026-04-27
**Phase:** 03-repo-runtime-sandbox
**Plans checked:** 13 (across 6 waves)
**Iteration:** 2 (re-verification after planner revisions to Plans 10 + 11)
**Methodology:** goal-backward — verify the 3 iteration-1 HIGH blockers are actually closed; confirm no regressions elsewhere

---

## VERDICT: PASS-WITH-NOTES

All three iteration-1 HIGH blockers are closed with verifiable changes in Plans 10 and 11. No regressions detected in the rest of the phase. Two MEDIUM/LOW warnings (W-01 VALIDATION.md fill-in timing, W-03 Wave 0 sequencing) carry over from iteration 1 — they are documented for planner awareness but do not block execution.

---

## Iteration-1 Blocker Closeout

### B-01 — Cleanup-on-success + tombstone-on-failure (Q-11) → **CLOSED**

**Evidence in Plan 11:**
- Task 1 sub-step A implements `packages/repo/src/cleanup-workspace.ts` with both branches:
  - `reason: "success"` → `fs.rm(dir, {recursive:true, force:true, maxRetries:3, retryDelay:100})` (Pitfall 6 retries honored)
  - `reason: "failure"` → writes `tombstone.json` with `{runId, failedAt: ISO8601, retentionExpiresAt: ISO8601, reason: "failure", errorMessage?}`; dir retained
- Task 1 sub-step B specifies 5 unit tests covering: success removal, success-idempotent-on-absent-dir, failure tombstone shape, default 24h retention, custom retention. Retention-delta arithmetic asserted within tolerance.
- Task 3 step 5 wires try/catch/finally in `runFactory` with both call sites — failure branch reads `repoPolicy.tombstoneRetentionHours` and passes `errorMessage`; success branch is unconditional `rm -rf`.
- `tombstoneRetentionHours` (default 24, `minimum: 0`) lives in Plan 10's `repo-policy.schema.json` (verified) and parser rejection of negative values is in Task 2 behavior.
- Verification grep `cleanupWorkspace ≥ 2` in main.ts pins both branches at the call site.
- Plan 12 contract test referenced at end of Task 3 step 5: success → `existsSync(cloneDir) === false`; failure → dir + `tombstone.json` present with retentionExpiresAt populated.
- T-03-11-01 (disk-fill on stuck-run streak) disposition `accept v1`; CONCERNS.md addendum delegated to Plan 01.

**No scope reduction language (`v1`, `static`, `TODO`, `future enhancement`) appears in Task 3 step 5.** The earlier "leave cleanup as a TODO" wording is gone.

### B-02 — `loadRepoPolicy` IO glue → **CLOSED**

**Evidence in Plan 10:**
- Task 2 behavior block enumerates 8 cases for `loadRepoPolicy`:
  - Missing file → `{ok:true, policy: DEFAULT_REPO_POLICY}`
  - Malformed JSON → `{ok:false, errors:[/invalid JSON/]}`
  - Unreadable (permission denied) → `{ok:false, errors:[/unreadable/]}`
  - Valid + workspaceRoot omitted → ok
  - Valid + workspaceRoot disjoint absolute → ok
  - Q-02 refusal — workspaceRoot === projectRoot
  - Q-02 refusal — workspaceRoot resolves to `<projectRoot>/.protostar/workspaces`
  - Q-02 refusal — relative `./.protostar/workspaces`
  - Q-02 ok — `os.tmpdir()/protostar-workspaces`
- Action block ships the full implementation inline (readFile + try/catch ENOENT + JSON.parse + parseRepoPolicy + workspaceRoot resolution + outside-source check).
- Interfaces section types the result as `{ok:true, policy} | {ok:false, errors}` — matches the consumer shape Plan 11 needs.

**Evidence in Plan 11:**
- Task 1 sub-step C barrel exports `loadRepoPolicy` from `@protostar/repo`.
- Task 3 step 1 imports `loadRepoPolicy` from the barrel.
- Task 3 step 2 invokes `loadRepoPolicy(projectRoot)` BEFORE any clone attempt; on `{ok:false}` writes `repo-policy-load-failed` refusal admission decision via `writeRefusalArtifacts` and returns early (no cleanup needed because no clone happened — explicit comment in plan).
- Plan 11 must_haves truth: "loadRepoPolicy is consumed from @protostar/repo (not redefined here)".

### B-03 — workspaceRoot-outside-source check → **CLOSED**

**Evidence in Plan 10:**
- Q-02 lock language quoted verbatim in the context block: "This plan owns the check — implemented inside `loadRepoPolicy`, after `parseRepoPolicy` resolves the optional `workspaceRoot` field. No deferral to Plan 11."
- Action block implementation: `absWorkspaceRoot === absProjectRoot || absWorkspaceRoot.startsWith(absProjectRoot + sep)` → return `{ok:false}` with structured error message containing both paths and the phrase "outside the source repo".
- Promoted to a load-bearing bullet in `<success_criteria>`: "**`loadRepoPolicy` reads `.protostar/repo-policy.json`, default-fills when absent, refuses workspaceRoot resolving inside or equal to projectRoot (Q-02), and is the canonical config-load entry point consumed by Plan 11**".
- Regression test pinned in Task 2 done-criterion: "Q-02 refusal pinned by named regression test (workspaceRoot pointing inside projectRoot)".
- Verification grep: `grep -cE 'startsWith.*sep|recursive.*clone|outside the source' packages/repo/src/repo-policy.ts ≥ 1`.
- T-03-10-05 disposition flipped from "deferred" to `mitigate` with concrete mitigation pointing at `loadRepoPolicy`.
- Threat model entry T-03-11-02 in Plan 11 also confirms Plan 11 only handles the `{ok:false}` branch — no orphaning between plans.

---

## Regression Check (rest of phase)

| Concern | Status | Evidence |
|---|---|---|
| CONFLICT-01 (diff library choice) | UNCHANGED | Plan 01 + Plan 07 still own resolution; not touched in iteration 2 |
| CONFLICT-02 (statusMatrix filter) | UNCHANGED | Plan 10 Task 1 still has explicit regression test for `dist/foo.js` untracked → CLEAN |
| Schema bump cascade (Q-14) | UNCHANGED | Plan 03 still owns 1.1.0 → 1.2.0 cascade across apps/packages/examples/admission-e2e |
| Authority boundary | UNCHANGED | No new FS/subprocess surface outside `@protostar/repo`; cleanup-workspace.ts lives in repo |
| Plan 11 admission-evidence shape (W-04) | RESOLVED | Plan 10 schema marks `patchResults`/`subprocessRecords` as required arrays; Plan 11 Task 3 step 4 emits explicit empty arrays — aligned with Plan 12 contract |
| Plan 11 dependencies | VALID | `depends_on: [02, 05, 06, 07, 09, 10]` includes Plan 10; wave 3 follows Plan 10's wave 2 |
| Plan 10 dependencies | VALID | `depends_on: [01, 03, 04, 06]`; wave 2 |
| W-02 (file:// feasibility) | RESOLVED | Plan 10 Task 3 explicitly locks to MOCK path: "tests use buildOnAuth unit-tests + mocked git.clone … no live network or file:// dependency"; success criterion mirrors |
| Test infrastructure | UNCHANGED | Plan 04 fixture still consumed by 05/06/07/09/10/12 |
| Subpath export discipline | UNCHANGED | New `cleanup-workspace.ts` is package-internal, exported via barrel only — consistent with existing pattern |
| Nyquist (Dim 8) | INTACT | Each task in Plans 10/11 carries `<automated>`; new cleanup-workspace.ts has 5 unit tests; sampling continuity holds |

**No new contradictions introduced.** Plan 10 owns the Q-02 check; Plan 11 only consumes the result. Plan 11's barrel re-export of `loadRepoPolicy` is consistent with Plan 10's interfaces. Empty-array contract for admission-decision evidence is unified between Plan 10 schema, Plan 11 emit-site, and Plan 12 contract assertion.

---

## Carry-Over Warnings (non-blocking)

### W-01 [MEDIUM] VALIDATION.md filled in Wave 5, not Wave 0

Plan 13 Task 3 still owns the VALIDATION.md fill-in. Each individual plan carries its own `<validation_strategy>` so the per-plan Nyquist gate passes; the phase-level rollup is what's late. Not a blocker — execution can proceed because the per-plan validation is independently sufficient — but the document is structurally late. Planner can fold into Plan 01 in a follow-up if desired.

### W-03 [LOW] Wave 0 internal sequencing ambiguous

Plans 02 and 04 are `wave: 0` with `depends_on: [01]`; Plan 03 is `wave: 0` with `depends_on: []`. Either tag the dependent plans as wave 1 or document "Wave 0 = sequential, dependencies advisory." Doesn't block execution.

### W-04 [LOW] → Closed by iteration-2 W-04 alignment

Plan 10 schema now marks `patchResults`/`subprocessRecords` as required arrays; Plan 11 Task 3 step 4 emits explicit `[]`. No further action.

---

## Coverage Matrix (post-revision)

| Req | Description (abbrev) | Plans claiming coverage | Status |
|---|---|---|---|
| REPO-01 | RepoTarget URL + credentialRef → WorkspaceRef | 10, 11 | COVERED (workspaceRoot-outside-source check landed in Plan 10) |
| REPO-02 | Clone, checkout, branch from base SHA | 04, 10, 11 | COVERED |
| REPO-03 | FS caps enforced | 05, 06, 12 | COVERED |
| REPO-04 | Subprocess runner + allowlist + arg validation | 08, 09, 12 | COVERED |
| REPO-05 | applyChangeSet atomic; rollback | 07, 11 (cleanup primitive + tombstone), 12 | **COVERED** (Q-11 fully shipped — no longer degraded) |
| REPO-06 | Dirty-worktree refusal | 03, 10, 11, 12 | COVERED |
| REPO-07 | workspaceRoot via pnpm-workspace.yaml walk | 02, 11 | COVERED |
| REPO-08 | @dogpile/sdk on fresh-clone | 13 | COVERED |
| REPO-09 | .env.example documents Phase 4–7 vars | 01 | COVERED |

---

## Recommendation

Execute. The three blockers are closed with concrete, verifiable plan changes. W-01 (VALIDATION.md timing) and W-03 (Wave 0 sequencing) are quality-of-life concerns that do not affect goal achievement.

## PLAN CHECK COMPLETE

VERDICT: **PASS-WITH-NOTES**
Blockers closed: B-01 (Q-11 cleanup + tombstone shipped in Plan 11), B-02 (loadRepoPolicy defined in Plan 10, consumed in Plan 11), B-03 (workspaceRoot-outside-source check landed in Plan 10's loadRepoPolicy with named regression test).
Carry-over warnings: W-01 (VALIDATION.md late), W-03 (Wave 0 sequencing) — neither blocks execution.
Coverage: REPO-01..09 all present; REPO-05 fully covered (no longer degraded).
