---
phase: 03-repo-runtime-sandbox
plan: 11
type: execute
wave: 3
depends_on: [02, 05, 06, 07, 09, 10]
files_modified:
  - packages/repo/src/index.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/package.json
autonomous: true
requirements: [REPO-01, REPO-02, REPO-05, REPO-06, REPO-07]
must_haves:
  truths:
    - "@protostar/repo barrel re-exports cloneWorkspace, FS adapter, applyChangeSet, dirtyWorktreeStatus, runCommand, auditSymlinks, schema artifacts, parseRepoPolicy"
    - "apps/factory-cli/src/main.ts:172 + 199 use resolveWorkspaceRoot() instead of INIT_CWD ?? cwd()"
    - "runFactory invokes cloneWorkspace before any execution, wires symlink audit + dirty check + admission decision write"
    - "On run success, workspace dir is rm-rf'd; on failure, retained as tombstone (Q-11)"
    - "repo-runtime-admission-decision.json emitted per run via the per-gate triple-write helper"
  artifacts:
    - path: "packages/repo/src/index.ts"
      provides: "Public barrel for @protostar/repo"
      exports: ["cloneWorkspace", "applyChangeSet", "dirtyWorktreeStatus", "runCommand", "auditSymlinks", "FS adapter readFile/writeFile/deleteFile", "parseRepoPolicy", "DEFAULT_REPO_POLICY"]
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
---

<objective>
Wave 3 integration: surface every Wave 1-2 component through `@protostar/repo`'s barrel, then wire it all into `apps/factory-cli/src/main.ts` `runFactory`. Replace `INIT_CWD ?? cwd()` at lines 172 + 199 with `resolveWorkspaceRoot()`. Add clone → audit → dirty-check → admission-decision-emit → cleanup-or-tombstone lifecycle.

Purpose: After Wave 1-2, the runtime is a kit of parts. This plan assembles the kit into a working factory step.
Output: Barrel updated, factory-cli runFactory invokes the new runtime, admission decision emitted.
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

Q-11 lock: rollback = `rm -rf {workspaceRoot}/{runId}`. Tombstone-on-failure
retained for `tombstoneRetentionHours` (default 24). Cleanup helper uses
`fs.rm({recursive:true, force:true, maxRetries:3, retryDelay:100})` (Pitfall 6).

Q-15 lock: `resolveWorkspaceRoot()` replaces `INIT_CWD ?? cwd()` at
`apps/factory-cli/src/main.ts:172, 199`. (RESEARCH.md notes the actual lines
may have drifted; re-grep before editing.)

Per-gate triple-write helper (PATTERNS.md "Refusal Triple-Write"):
`apps/factory-cli/src/main.ts:726-753` `writeRefusalArtifacts`. New gate
literal `"repo-runtime"`. Phase 3 emits both refusal-style (clone fail, dirty
refusal, symlink refusal, allowlist refusal) AND allow-style admission
decisions; reuse the per-gate decision writer pattern Phase 2 Plan 02-07
established (`writeAdmissionDecision` or equivalent — find by greping main.ts).

The factory-cli changes are SUBSTANTIAL but follow established patterns. This
plan is execute-not-tdd because the hard test surface is the next plan
(admission-e2e contract suite).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update @protostar/repo barrel + add @protostar/paths dep</name>
  <files>packages/repo/src/index.ts, packages/repo/package.json</files>
  <action>
    Re-export from each Wave 1-2 module:
    ```typescript
    // packages/repo/src/index.ts (replace 24-line stub; preserve the existing exports first)
    export type { WorkspaceRef } from "./index-types.js"; // or wherever it lives currently
    export { assertWorkspaceTrust, WorkspaceTrustError } from "./workspace-trust-runtime.js";

    // Phase 3 additions:
    export { cloneWorkspace, type CloneRequest, type CloneResult, type CloneAuthMode, CredentialRefusedError } from "./clone-workspace.js";
    export { auditSymlinks, type SymlinkAuditResult } from "./symlink-audit.js";
    export { readFile, writeFile, deleteFile, FsAdapterError } from "./fs-adapter.js";
    export { applyChangeSet, type ApplyResult, type PatchRequest, type ApplyStatus } from "./apply-change-set.js";
    export { dirtyWorktreeStatus, type DirtyWorktreeStatus } from "./dirty-worktree-status.js";
    export { runCommand, type SubprocessResult, type RunCommandOptions, SubprocessRefusedError } from "./subprocess-runner.js";
    export { SUBPROCESS_BASELINE_ALLOWLIST, intersectAllowlist } from "./subprocess-allowlist.js";
    export { applyOuterPatternGuard, ArgvViolation, type OuterGuardSchema } from "./argv-pattern-guard.js";
    export { GIT_SCHEMA, PNPM_SCHEMA, NODE_SCHEMA, TSC_SCHEMA, type CommandSchema } from "./subprocess-schemas/index.js";
    export { parseRepoPolicy, DEFAULT_REPO_POLICY, type RepoPolicy } from "./repo-policy.js";
    ```

    Verify everything resolves: `pnpm --filter @protostar/repo build`.

    Add `@protostar/paths` as a workspace dep on `@protostar/repo`:
    ```bash
    pnpm --filter @protostar/repo add @protostar/paths@workspace:*
    ```

    Verify `pnpm --filter @protostar/repo test` still green.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>Barrel re-exports every Wave 1-2 surface. `@protostar/paths` declared as dep. Tests still green.</done>
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
  <name>Task 3: Wire cloneWorkspace + audit + dirty-check + admission-decision + cleanup into runFactory</name>
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
         parseRepoPolicy, DEFAULT_REPO_POLICY,
         CredentialRefusedError, FsAdapterError, SubprocessRefusedError,
       } from "@protostar/repo";
       ```

    2. Locate the top of `runFactory` where the workspace dir was previously
       resolved. Replace any "use existing dir" logic with:
       ```typescript
       const repoPolicy = await loadRepoPolicy(workspaceRoot); // optional file at .protostar/repo-policy.json
       const cloneDir = resolve(repoPolicy.workspaceRoot ?? join(workspaceRoot, ".protostar/workspaces"), runId);
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
         contains offendingPaths. Then `return` from runFactory.
       - Check `dirtyWorktreeStatus(cloneDir)`. If `isDirty: true` AND
         `confirmedIntent.capabilityEnvelope.workspace?.allowDirty !== true`
         (Q-14): emit refusal admission, stage `"repo-runtime"`, reason
         `"dirty-worktree-refused"`. Return.

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
           symlinkRefusal: { ok: cloneResult.symlinkAudit.ok, offendingPaths: [...] },
         },
       };
       await writeJson(join(runDir, "repo-runtime-admission-decision.json"), decision);
       await appendAdmissionDecisionsJsonl(runDir, decision);
       ```

       Also include patchResults + subprocessRecords once execution lands
       (Phase 4); Phase 3 leaves these arrays empty/undefined per schema
       optionality.

    5. Cleanup-vs-tombstone (Q-11): wrap the run body in try/finally:
       ```typescript
       try {
         // ... actual run ...
         // success: rm -rf cloneDir at the END (after delivery in Phase 7;
         // for Phase 3 v1 stub, retain for inspection — document)
       } catch (err) {
         // failure: retain as tombstone for repoPolicy.tombstoneRetentionHours.
         // Plan 11 stops here; the actual prune helper is Phase 9.
         throw err;
       }
       ```
       For Phase 3 v1, leave cleanup as a TODO with comment pointing to
       Phase 7 delivery + Phase 9 prune. The success-criteria green path
       must still produce a runnable bundle.

    6. Run `pnpm --filter @protostar/factory-cli test`. Many existing tests
       will need updates (they assume the old INIT_CWD-based path; new
       cloning step changes behavior). Update tests minimally — assert that
       a smoke run produces the expected artifact set including
       `repo-runtime-admission-decision.json`. Anything beyond that is Plan 12
       (admission-e2e contract suite).

    Commit: `feat(03-11): wire repo runtime into runFactory (clone+audit+dirty+decision+cleanup-stub)`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test &amp;&amp; pnpm run verify:full</automated>
  </verify>
  <done>runFactory invokes cloneWorkspace; admission decision emitted on each run; existing tests pass (with minimal adjustments where behavior shifted); verify:full green modulo Phase 2 Plans 11-15 pre-existing gaps.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Confirmed intent → runFactory | Phase 2 brand consumer; allowDirty + capability envelope flow through |
| Run lifecycle → workspace dir | Cleanup decision, tombstone retention, disk-fill |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-11-01 | DoS | Tombstone disk-fill on stuck-run streak | accept v1 | repoPolicy.tombstoneRetentionHours bound; Phase 9 prune cleans. CONCERNS.md addendum (Plan 01) documents. |
| T-03-11-02 | Tampering | Recursive workspace clone (workspaceRoot inside source) | mitigate | parseRepoPolicy validates `workspaceRoot` is OUTSIDE source repo at config-load (when policy file is provided); else default `.protostar/workspaces/` is sibling, not nested. |
| T-03-11-03 | Information Disclosure | Admission decision JSON leaks PAT value | mitigate | `cloneResult.auth.credentialRef` is the NAME; never the value. Plan 10 contract test pins this; Plan 12 will re-pin in admission-e2e. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-01 (RepoTarget plumbing into clone), REPO-02 (clone), REPO-06 (dirty refusal at gate), REPO-07 (resolveWorkspaceRoot replaces INIT_CWD).
- **Sample frequency:** Per-task `pnpm --filter @protostar/factory-cli test`; final `pnpm run verify:full`.
- **Observability:** `repo-runtime-admission-decision.json` per run; refusal artifacts via triple-write.
- **Nyquist:** Existing factory-cli tests + admission-decision shape grep; full integration coverage in Plan 12.
</validation_strategy>

<verification>
- `! grep -n 'INIT_CWD' apps/factory-cli/src/main.ts`
- `grep -c 'cloneWorkspace' apps/factory-cli/src/main.ts | grep -v '^#'` ≥ 1
- `grep -c 'repo-runtime-admission-decision' apps/factory-cli/src/main.ts | grep -v '^#'` ≥ 1
- `pnpm run verify:full` green
</verification>

<success_criteria>
- Barrel re-exports every Wave 1-2 surface
- INIT_CWD eliminated from factory-cli
- runFactory invokes cloneWorkspace + auditSymlinks + dirtyWorktreeStatus
- Admission decision emitted (allow OR block per gate path)
- Cleanup stubbed with TODO pointing to Phase 7/9
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-11-SUMMARY.md` with: barrel re-export list, INIT_CWD line numbers actually edited (vs research-time), test diff (which existing tests adjusted), Phase 7/9 cleanup TODO location.
</output>
