---
phase: 03-repo-runtime-sandbox
plan: 11
type: execute
wave: 3
depends_on: [02, 05, 06, 07, 09, 10]
files_modified:
  - packages/repo/src/index.ts
  - packages/repo/src/cleanup-workspace.ts
  - packages/repo/src/cleanup-workspace.test.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/package.json
autonomous: true
requirements: [REPO-01, REPO-02, REPO-05, REPO-06, REPO-07]
must_haves:
  truths:
    - "@protostar/repo barrel re-exports cloneWorkspace, FS adapter, applyChangeSet, dirtyWorktreeStatus, runCommand, auditSymlinks, schema artifacts, parseRepoPolicy, loadRepoPolicy, cleanupWorkspace"
    - "apps/factory-cli/src/main.ts:172 + 199 use resolveWorkspaceRoot() instead of INIT_CWD ?? cwd()"
    - "runFactory invokes cloneWorkspace before any execution, wires symlink audit + dirty check + admission decision write"
    - "On run success, runFactory calls cleanupWorkspace(cloneDir, runId, {reason:'success'}) which rm-rf's the run dir (Q-11 success branch)"
    - "On run failure, runFactory leaves cloneDir in place and writes `${cloneDir}/tombstone.json` with {runId, failedAt, retentionExpiresAt, reason} per Q-11; tombstone retention honors repoPolicy.tombstoneRetentionHours"
    - "repo-runtime-admission-decision.json emitted per run via the per-gate triple-write helper, with patchResults: [] and subprocessRecords: [] (empty arrays, not undefined — W-04 alignment)"
    - "loadRepoPolicy is consumed from @protostar/repo (not redefined here); workspaceRoot-outside-source check runs at this config-load site"
  artifacts:
    - path: "packages/repo/src/index.ts"
      provides: "Public barrel for @protostar/repo"
      exports: ["cloneWorkspace", "applyChangeSet", "dirtyWorktreeStatus", "runCommand", "auditSymlinks", "FS adapter readFile/writeFile/deleteFile", "parseRepoPolicy", "loadRepoPolicy", "DEFAULT_REPO_POLICY", "cleanupWorkspace"]
    - path: "packages/repo/src/cleanup-workspace.ts"
      provides: "Q-11 cleanup primitive — rm-rf on success, tombstone marker on failure"
      exports: ["cleanupWorkspace", "writeTombstone", "type CleanupReason"]
    - path: "apps/factory-cli/src/main.ts"
      provides: "runFactory orchestrating the new repo runtime"
  key_links:
    - from: "apps/factory-cli/src/main.ts"
      to: "@protostar/repo cloneWorkspace"
      via: "import + invocation per run"
      pattern: "cloneWorkspace"
    - from: "apps/factory-cli/src/main.ts"
      to: "@protostar/paths resolveWorkspaceRoot"
      via: "replaces INIT_CWD usage"
      pattern: "resolveWorkspaceRoot"
    - from: "apps/factory-cli/src/main.ts"
      to: "@protostar/repo loadRepoPolicy"
      via: "loadRepoPolicy(projectRoot) at start of runFactory"
      pattern: "loadRepoPolicy"
    - from: "apps/factory-cli/src/main.ts"
      to: "@protostar/repo cleanupWorkspace"
      via: "try/finally — success calls cleanupWorkspace; failure writes tombstone"
      pattern: "cleanupWorkspace|tombstone.json"
---

<objective>
Wave 3 integration: surface every Wave 1-2 component (plus the new cleanup primitive) through `@protostar/repo`'s barrel, then wire it all into `apps/factory-cli/src/main.ts` `runFactory`. Replace `INIT_CWD ?? cwd()` at lines 172 + 199 with `resolveWorkspaceRoot()`. Add clone → audit → dirty-check → admission-decision-emit → cleanup-or-tombstone lifecycle.

Per Q-11 lock, this plan ships the cleanup primitive AND the success-path call site AND the failure-path tombstone. The Phase-7-delivery handoff ("or after delivery in Phase 7") is a Phase 7 concern — Phase 3 owns the contract.

Purpose: After Wave 1-2, the runtime is a kit of parts. This plan assembles the kit into a working factory step.
Output: Barrel updated, cleanup primitive added, factory-cli runFactory invokes the new runtime end-to-end including cleanup/tombstone.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md
@.planning/phases/03-repo-runtime-sandbox/03-PATTERNS.md
@apps/factory-cli/src/main.ts
@packages/repo/src/index.ts

Q-11 lock (load-bearing): cleanup policy.
- Successful run → workspace deleted at end via `cleanupWorkspace(dir, runId, {reason:"success"})` which calls `fs.rm(dir, {recursive:true, force:true, maxRetries:3, retryDelay:100})` (Pitfall 6).
- Failed run → workspace retained as tombstone for `tombstoneRetentionHours` (default 24) or until operator-resume / explicit cleanup. A `tombstone.json` marker is written into the workspace dir with `{runId, failedAt, retentionExpiresAt, reason}`. The actual prune sweep (after retention expires) is Phase 9; Phase 3 ships the marker + cleanup primitive + success-path call site.
- Document tombstone semantics in CONCERNS.md (delegated to Plan 01 — already addressed there per the existing CONCERNS.md addendum task; if not, add a one-line note in this plan's SUMMARY).

Q-15 lock: `resolveWorkspaceRoot()` replaces `INIT_CWD ?? cwd()` at
`apps/factory-cli/src/main.ts:172, 199`. (RESEARCH.md notes the actual lines
may have drifted; re-grep before editing.)

`loadRepoPolicy` lives in `@protostar/repo` (Plan 10). Plan 11 imports it and
calls `loadRepoPolicy(projectRoot)`. Q-02 workspaceRoot-outside-source check
fires inside that helper — Plan 11 only needs to handle the `{ok:false}`
branch by writing a refusal admission decision and returning.

Per-gate triple-write helper (PATTERNS.md "Refusal Triple-Write"):
`apps/factory-cli/src/main.ts:726-753` `writeRefusalArtifacts`. New gate
literal `"repo-runtime"`. Phase 3 emits both refusal-style (clone fail, dirty
refusal, symlink refusal, allowlist refusal, repo-policy load failure) AND
allow-style admission decisions; reuse the per-gate decision writer pattern
Phase 2 Plan 02-07 established (`writeAdmissionDecision` or equivalent — find
by greping main.ts).

The factory-cli changes are SUBSTANTIAL but follow established patterns. This
plan is execute-not-tdd because the hard test surface is the next plan
(admission-e2e contract suite). The `cleanup-workspace.ts` helper IS
unit-tested here (Task 1.5 — small TDD-flavored sub-task) because its
contract is small, hermetic, and load-bearing for Q-11.
</context>

<tasks>

<task type="auto">
  <name>Task 1: cleanup primitive + barrel update + @protostar/paths dep</name>
  <files>packages/repo/src/cleanup-workspace.ts, packages/repo/src/cleanup-workspace.test.ts, packages/repo/src/index.ts, packages/repo/package.json</files>
  <action>
    **Sub-step A: Implement `cleanup-workspace.ts`** (small, hermetic, testable):
    ```typescript
    import { rm, writeFile, mkdir } from "node:fs/promises";
    import { join } from "node:path";

    export type CleanupReason = "success" | "failure";

    export interface CleanupOptions {
      readonly reason: CleanupReason;
      /** For failure path; default 24h. Read from repoPolicy.tombstoneRetentionHours at the call site. */
      readonly tombstoneRetentionHours?: number;
      /** Optional human/machine error message recorded into tombstone.json. */
      readonly errorMessage?: string;
    }

    export interface TombstoneRecord {
      readonly runId: string;
      readonly failedAt: string;          // ISO 8601
      readonly retentionExpiresAt: string; // ISO 8601
      readonly reason: "failure";
      readonly errorMessage?: string;
    }

    /**
     * Q-11 cleanup primitive.
     * - reason "success" → rm -rf the dir (Pitfall 6 retries).
     * - reason "failure" → leave dir in place; write tombstone.json with retention metadata.
     * Idempotent: if dir already absent on success path, returns silently.
     */
    export async function cleanupWorkspace(
      dir: string,
      runId: string,
      opts: CleanupOptions
    ): Promise<{ removed: boolean; tombstonePath?: string }> {
      if (opts.reason === "success") {
        await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        return { removed: true };
      }
      // failure: write tombstone, do NOT remove
      const retentionHours = opts.tombstoneRetentionHours ?? 24;
      const failedAt = new Date();
      const retentionExpiresAt = new Date(failedAt.getTime() + retentionHours * 3600 * 1000);
      const record: TombstoneRecord = {
        runId,
        failedAt: failedAt.toISOString(),
        retentionExpiresAt: retentionExpiresAt.toISOString(),
        reason: "failure",
        ...(opts.errorMessage ? { errorMessage: opts.errorMessage } : {}),
      };
      await mkdir(dir, { recursive: true }); // ensure dir exists (it should, but be defensive)
      const tombstonePath = join(dir, "tombstone.json");
      await writeFile(tombstonePath, JSON.stringify(record, null, 2), "utf8");
      return { removed: false, tombstonePath };
    }
    ```

    **Sub-step B: Tests in `cleanup-workspace.test.ts`:**
    - **success — dir removed:** create temp dir with files; cleanupWorkspace(dir, "run-1", {reason:"success"}); assert `existsSync(dir) === false`; assert returned `{removed: true}`.
    - **success — idempotent on already-absent dir:** cleanupWorkspace on a non-existent path; returns `{removed: true}` without throwing (force:true semantics).
    - **failure — dir retained, tombstone written:** create temp dir with files; cleanupWorkspace(dir, "run-2", {reason:"failure", tombstoneRetentionHours: 24, errorMessage: "boom"}); assert dir still exists; read `tombstone.json`; assert shape `{runId:"run-2", failedAt:<iso>, retentionExpiresAt:<iso>, reason:"failure", errorMessage:"boom"}`; assert `retentionExpiresAt - failedAt === 24 * 3600 * 1000` ms (within tolerance).
    - **failure — default retention 24h:** when tombstoneRetentionHours omitted, retentionExpiresAt - failedAt === 24h.
    - **failure — custom retention 1h:** tombstoneRetentionHours: 1 → 1h delta.
    - Cleanup test fixtures with `t.after(() => rm(tmpDir, {recursive:true, force:true}))`.

    **Sub-step C: Update `packages/repo/src/index.ts` barrel** — re-export from each Wave 1-2 module + the new cleanup primitive + Plan 10's loadRepoPolicy:
    ```typescript
    // packages/repo/src/index.ts (replace 24-line stub; preserve existing exports first)
    export type { WorkspaceRef } from "./index-types.js"; // or wherever it lives currently
    export { assertWorkspaceTrust, WorkspaceTrustError } from "./workspace-trust-runtime.js";

    // Phase 3 additions:
    export { cloneWorkspace, buildOnAuth, type CloneRequest, type CloneResult, type CloneAuthMode, CredentialRefusedError } from "./clone-workspace.js";
    export { auditSymlinks, type SymlinkAuditResult } from "./symlink-audit.js";
    export { readFile, writeFile, deleteFile, FsAdapterError } from "./fs-adapter.js";
    export { applyChangeSet, type ApplyResult, type PatchRequest, type ApplyStatus } from "./apply-change-set.js";
    export { dirtyWorktreeStatus, type DirtyWorktreeStatus } from "./dirty-worktree-status.js";
    export { runCommand, type SubprocessResult, type RunCommandOptions, SubprocessRefusedError } from "./subprocess-runner.js";
    export { SUBPROCESS_BASELINE_ALLOWLIST, intersectAllowlist } from "./subprocess-allowlist.js";
    export { applyOuterPatternGuard, ArgvViolation, type OuterGuardSchema } from "./argv-pattern-guard.js";
    export { GIT_SCHEMA, PNPM_SCHEMA, NODE_SCHEMA, TSC_SCHEMA, type CommandSchema } from "./subprocess-schemas/index.js";
    export { parseRepoPolicy, loadRepoPolicy, DEFAULT_REPO_POLICY, type RepoPolicy } from "./repo-policy.js";
    export { cleanupWorkspace, type CleanupReason, type CleanupOptions, type TombstoneRecord } from "./cleanup-workspace.js";
    ```

    Verify everything resolves: `pnpm --filter @protostar/repo build`.

    **Sub-step D: Add `@protostar/paths` as workspace dep:**
    ```bash
    pnpm --filter @protostar/repo add @protostar/paths@workspace:*
    ```

    Verify `pnpm --filter @protostar/repo test` still green.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>cleanupWorkspace 5/5 tests green. Barrel re-exports every Wave 1-2 surface + cleanupWorkspace + loadRepoPolicy. `@protostar/paths` declared as dep.</done>
</task>

<task type="auto">
  <name>Task 2: Replace INIT_CWD with resolveWorkspaceRoot in factory-cli</name>
  <files>apps/factory-cli/src/main.ts, apps/factory-cli/package.json</files>
  <action>
    1. Add `@protostar/paths` to factory-cli deps:
    ```bash
    pnpm --filter @protostar/factory-cli add @protostar/paths@workspace:*
    ```

    2. Re-grep for `INIT_CWD` in `apps/factory-cli/src/main.ts`:
    ```bash
    grep -n 'INIT_CWD\|cwd()' apps/factory-cli/src/main.ts
    ```

    For EACH occurrence (research said lines 172, 199; verify current line
    numbers), replace:
    ```typescript
    const workspaceRoot = process.env["INIT_CWD"] ?? process.cwd();
    ```
    with:
    ```typescript
    import { resolveWorkspaceRoot } from "@protostar/paths";
    // ...
    const workspaceRoot = resolveWorkspaceRoot();
    ```

    Single import at file top; multiple call-sites use the imported function.

    3. Run `pnpm --filter @protostar/factory-cli test`. If existing tests
    pass, commit: `refactor(03-11): use resolveWorkspaceRoot() in factory-cli`.

    If tests fail because they assumed `INIT_CWD` quirks (RESEARCH.md A6 risk):
    investigate. Common cause: a test sets `process.env.INIT_CWD` to point
    to a fixture; switch the test to invoke `runFactory({...})` with an
    explicit workspaceRoot if the entry point accepts it, OR `chdir` to the
    fixture. Document fix in commit message.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test &amp;&amp; ! grep -n 'INIT_CWD' apps/factory-cli/src/main.ts</automated>
  </verify>
  <done>No `INIT_CWD` reference remains in main.ts; tests green.</done>
</task>

<task type="auto">
  <name>Task 3: Wire clone + audit + dirty + admission-decision + cleanup/tombstone into runFactory</name>
  <files>apps/factory-cli/src/main.ts</files>
  <action>
    This is the heaviest task in the plan. Pattern: follow Phase 2 Plan 02-07
    `factory-cli per-gate writer` precedent — find the existing
    `writeAdmissionDecision`-style helper and add a `repo-runtime` gate path.

    Steps:
    1. Import the new surface:
       ```typescript
       import {
         cloneWorkspace, auditSymlinks, dirtyWorktreeStatus,
         applyChangeSet, runCommand,
         intersectAllowlist, SUBPROCESS_BASELINE_ALLOWLIST,
         GIT_SCHEMA, PNPM_SCHEMA, NODE_SCHEMA, TSC_SCHEMA,
         parseRepoPolicy, loadRepoPolicy, DEFAULT_REPO_POLICY,
         cleanupWorkspace,
         CredentialRefusedError, FsAdapterError, SubprocessRefusedError,
       } from "@protostar/repo";
       ```

    2. Locate the top of `runFactory` where the workspace dir was previously
       resolved. Replace any "use existing dir" logic with:
       ```typescript
       const projectRoot = workspaceRoot; // resolveWorkspaceRoot() result
       const policyResult = await loadRepoPolicy(projectRoot);
       if (!policyResult.ok) {
         // Q-02 refusal OR malformed config — emit refusal admission decision and return
         await writeRefusalArtifacts(runDir, {
           gate: "repo-runtime",
           reason: "repo-policy-load-failed",
           errors: policyResult.errors,
         });
         return; // no clone happened; nothing to clean up
       }
       const repoPolicy = policyResult.policy;
       const cloneDir = resolve(repoPolicy.workspaceRoot ?? join(projectRoot, ".protostar/workspaces"), runId);
       const cloneResult = await cloneWorkspace({
         url: target.url, dir: cloneDir, ref: target.ref,
         credentialRef: target.credentialRef, depth: 1,
       });
       ```
       — `target` here comes from the confirmed-intent's RepoTarget (REPO-01).
       Plumbing the RepoTarget through to runFactory may itself require a
       small edit at the intent-consumption site; flag in SUMMARY if
       discovered.

    3. Immediately after clone:
       - Check `cloneResult.symlinkAudit.ok`. If false → emit refusal admission
         decision via existing triple-write helper (`writeRefusalArtifacts`),
         stage `"repo-runtime"`, reason `"symlinks-refused"`, evidence array
         contains offendingPaths. Treat as run failure → fall through to the
         tombstone branch in step 5.
       - Check `dirtyWorktreeStatus(cloneDir)`. If `isDirty: true` AND
         `confirmedIntent.capabilityEnvelope.workspace?.allowDirty !== true`
         (Q-14): emit refusal admission, stage `"repo-runtime"`, reason
         `"dirty-worktree-refused"`. Treat as failure → tombstone branch.

    4. If clone+audit+dirty all pass → emit ALLOW admission decision:
       ```typescript
       const decision = {
         schemaVersion: "1.0.0",
         runId,
         gate: "repo-runtime",
         outcome: "allow",
         timestamp: new Date().toISOString(),
         precedenceResolution: { /* from Phase 2 plumbing */ },
         evidence: {
           workspaceRoot: cloneResult.dir,
           auth: cloneResult.auth,
           effectiveAllowlist: intersectAllowlist(repoPolicy.commandAllowlist),
           symlinkRefusal: { ok: cloneResult.symlinkAudit.ok, offendingPaths: [...cloneResult.symlinkAudit.offendingPaths] },
           // W-04 alignment: explicit empty arrays, not undefined
           patchResults: [],
           subprocessRecords: [],
         },
       };
       await writeJson(join(runDir, "repo-runtime-admission-decision.json"), decision);
       await appendAdmissionDecisionsJsonl(runDir, decision);
       ```

       The `patchResults` and `subprocessRecords` fields will be populated
       once Phase 4 execution lands; Phase 3 ships them as empty arrays
       (NOT undefined / NOT omitted) so Plan 12 contract tests can assert
       presence.

    5. Cleanup-vs-tombstone (Q-11) — wrap the run body in try/catch/finally:
       ```typescript
       let runFailed = false;
       let runFailureMessage: string | undefined;
       try {
         // ... actual run body — admission decision, downstream stages, etc.
         // (Phase 4-7 stages are NOT in scope for Plan 11; the v1 run body
         //  here may be minimal — clone + audit + dirty-check + decision only.)
       } catch (err) {
         runFailed = true;
         runFailureMessage = err instanceof Error ? err.message : String(err);
         throw err;  // re-throw so the CLI exits non-zero
       } finally {
         // Q-11 success/failure branches:
         if (runFailed) {
           // Failure: leave cloneDir; write tombstone.json
           await cleanupWorkspace(cloneDir, runId, {
             reason: "failure",
             tombstoneRetentionHours: repoPolicy.tombstoneRetentionHours,
             errorMessage: runFailureMessage,
           });
         } else {
           // Success: rm -rf cloneDir
           await cleanupWorkspace(cloneDir, runId, { reason: "success" });
         }
       }
       ```

       **Phase 7 handoff note:** Q-11 says "successful run → workspace deleted at end (or after delivery in Phase 7)". Phase 3's contract is the cleanup-on-success call site at the end of runFactory. When Phase 7 lands a delivery stage, it may move this call to *after* delivery — that refactor is Phase 7's concern. The factory-cli does not need to know about delivery yet.

       **Plan 12 will add a contract test** asserting:
       - successful smoke run → `existsSync(cloneDir) === false` after runFactory returns
       - failing smoke run → `existsSync(cloneDir) === true` AND `existsSync(join(cloneDir, "tombstone.json")) === true` with shape `{runId, failedAt, retentionExpiresAt, reason: "failure"}`

    6. Run `pnpm --filter @protostar/factory-cli test`. Many existing tests
       will need updates (they assume the old INIT_CWD-based path; new
       cloning step changes behavior). Update tests minimally — assert that
       a smoke run produces the expected artifact set including
       `repo-runtime-admission-decision.json`. The cleanup-vs-tombstone
       contract tests live in Plan 12 (admission-e2e contract suite).

    Commit: `feat(03-11): wire repo runtime into runFactory (clone+audit+dirty+decision+cleanup+tombstone)`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test &amp;&amp; pnpm run verify:full</automated>
  </verify>
  <done>runFactory invokes cloneWorkspace; admission decision emitted on each run with patchResults/subprocessRecords as empty arrays; success path rm-rfs cloneDir; failure path leaves cloneDir + tombstone.json; loadRepoPolicy refusal (Q-02) emits a repo-policy-load-failed refusal decision and returns; existing tests pass (with minimal adjustments where behavior shifted); verify:full green modulo Phase 2 Plans 11-15 pre-existing gaps.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Confirmed intent → runFactory | Phase 2 brand consumer; allowDirty + capability envelope flow through |
| Run lifecycle → workspace dir | Cleanup decision, tombstone retention, disk-fill |
| Operator repo-policy.json → loadRepoPolicy | Mis-configured workspaceRoot caught at config-load (delegated to Plan 10's loadRepoPolicy) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-11-01 | DoS | Tombstone disk-fill on stuck-run streak | accept v1 | repoPolicy.tombstoneRetentionHours bound; tombstone.json carries retentionExpiresAt; Phase 9 prune sweep cleans expired tombstones. CONCERNS.md addendum (Plan 01) documents tombstoneRetentionHours as the operator knob for disk-fill mitigation. |
| T-03-11-02 | Tampering | Recursive workspace clone (workspaceRoot inside source) | mitigate | `loadRepoPolicy` (Plan 10) refuses workspaceRoot resolving inside or equal to projectRoot; Plan 11 returns early on `{ok:false}` and writes a `repo-policy-load-failed` refusal decision before any clone happens. |
| T-03-11-03 | Information Disclosure | Admission decision JSON leaks PAT value | mitigate | `cloneResult.auth.credentialRef` is the NAME; never the value. Plan 10 contract test pins this; Plan 12 will re-pin in admission-e2e. |
| T-03-11-04 | DoS | Cleanup `rm -rf` interrupted (e.g., open file handle on Windows) | mitigate | `cleanupWorkspace` uses `fs.rm({recursive:true, force:true, maxRetries:3, retryDelay:100})` per Pitfall 6; success path is idempotent so retry on next run is safe. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-01 (RepoTarget plumbing into clone), REPO-02 (clone), REPO-05 (Q-11 cleanup primitive — both branches exercised), REPO-06 (dirty refusal at gate), REPO-07 (resolveWorkspaceRoot replaces INIT_CWD).
- **Sample frequency:** Per-task `pnpm --filter @protostar/factory-cli test`; final `pnpm run verify:full`.
- **Observability:** `repo-runtime-admission-decision.json` per run with empty patchResults/subprocessRecords arrays; refusal artifacts via triple-write; `tombstone.json` per failed run; success path leaves no workspace dir.
- **Nyquist:** 5 unit tests on cleanup-workspace; existing factory-cli tests + admission-decision shape grep; full integration coverage in Plan 12 (cleanup/tombstone contract tests live there).
</validation_strategy>

<verification>
- `! grep -n 'INIT_CWD' apps/factory-cli/src/main.ts`
- `grep -v '^#' apps/factory-cli/src/main.ts | grep -c 'cloneWorkspace'` ≥ 1
- `grep -v '^#' apps/factory-cli/src/main.ts | grep -c 'repo-runtime-admission-decision'` ≥ 1
- `grep -v '^#' apps/factory-cli/src/main.ts | grep -c 'cleanupWorkspace'` ≥ 2  # success branch + failure branch
- `grep -v '^#' apps/factory-cli/src/main.ts | grep -c 'loadRepoPolicy'` ≥ 1
- `grep -v '^#' packages/repo/src/cleanup-workspace.ts | grep -cE 'tombstone|retentionExpiresAt'` ≥ 2
- `pnpm run verify:full` green
</verification>

<success_criteria>
- Barrel re-exports every Wave 1-2 surface + cleanupWorkspace + loadRepoPolicy
- `cleanupWorkspace` ships with both branches (success rm-rf, failure tombstone) + 5 unit tests
- INIT_CWD eliminated from factory-cli
- runFactory invokes cloneWorkspace + auditSymlinks + dirtyWorktreeStatus + loadRepoPolicy
- Admission decision emitted (allow OR block per gate path) with `patchResults: []` and `subprocessRecords: []` (empty arrays, never undefined)
- **Successful run leaves no workspace dir on disk** (Q-11 success branch)
- **Failed run leaves workspace dir + `tombstone.json` with retentionExpiresAt set per `repoPolicy.tombstoneRetentionHours`** (Q-11 failure branch)
- Q-02 refusal (workspaceRoot inside projectRoot) caught by loadRepoPolicy → repo-policy-load-failed refusal decision emitted; no clone attempted
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-11-SUMMARY.md` with: barrel re-export list, INIT_CWD line numbers actually edited (vs research-time), test diff (which existing tests adjusted), exact tombstone.json shape emitted, success-path artifact-list (no workspace dir), failure-path artifact-list (workspace dir + tombstone.json).
</output>
