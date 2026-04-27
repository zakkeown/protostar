---
phase: 03-repo-runtime-sandbox
plan: 10
type: tdd
wave: 2
depends_on: [01, 03, 04, 06]
files_modified:
  - packages/repo/src/clone-workspace.ts
  - packages/repo/src/clone-workspace.test.ts
  - packages/repo/src/dirty-worktree-status.ts
  - packages/repo/src/dirty-worktree-status.test.ts
  - packages/repo/src/repo-policy.ts
  - packages/repo/src/repo-policy.test.ts
  - packages/repo/schema/repo-policy.schema.json
  - packages/repo/schema/repo-runtime-admission-decision.schema.json
autonomous: true
requirements: [REPO-01, REPO-02, REPO-06]
must_haves:
  truths:
    - "cloneWorkspace clones via isomorphic-git with onAuth shim that uses credentialRef → process.env, falls back to anonymous"
    - "onAuth retries cancel after 2 invocations with same ref (Pitfall 1)"
    - "Clone result records auth.mode: credentialRef|system|anonymous and auth.credentialRef name (never value)"
    - "dirtyWorktreeStatus uses statusMatrix with the CONFLICT-02 filter (HEAD === 1 && (WORKDIR !== HEAD || STAGE !== HEAD))"
    - "Naive matrix.length > 0 is NOT used; freshly-cloned repo with build artifacts reports clean"
    - "repoPolicy parser supports workspaceRoot, subprocessTailBytes, commandAllowlist, tombstoneRetentionHours fields"
    - "repo-runtime-admission-decision schema covers auth, effectiveAllowlist, symlinkRefusal, patchResults, subprocessRecords"
  artifacts:
    - path: "packages/repo/src/clone-workspace.ts"
      provides: "Clone + auth + symlink-audit-trigger orchestration helper"
      exports: ["cloneWorkspace", "CloneAuthMode", "CloneResult", "CredentialRefusedError"]
    - path: "packages/repo/src/dirty-worktree-status.ts"
      provides: "statusMatrix wrapper with --untracked-files=no semantics"
      exports: ["dirtyWorktreeStatus", "DirtyWorktreeStatus"]
    - path: "packages/repo/src/repo-policy.ts"
      provides: "Repo-policy schema + parser"
      exports: ["parseRepoPolicy", "RepoPolicy", "DEFAULT_REPO_POLICY"]
    - path: "packages/repo/schema/repo-runtime-admission-decision.schema.json"
      provides: "Per-gate decision JSON schema"
  key_links:
    - from: "packages/repo/src/clone-workspace.ts"
      to: "packages/repo/src/symlink-audit.ts"
      via: "post-clone tree audit"
      pattern: "auditSymlinks"
---

<objective>
Three small interrelated pieces in one plan: clone orchestration (isomorphic-git + auth shim + symlink audit trigger), dirty-worktree status (statusMatrix with CONFLICT-02 filter), and repo-policy parser + schemas (workspaceRoot, subprocessTailBytes, commandAllowlist, tombstoneRetentionHours, plus the per-gate admission-decision JSON schema).

Purpose: Plan 11 wires these into runFactory; Plan 12 contract-tests the admission decision shape. They group here because they share the `isomorphic-git` import, the policy/schema bundle, and they're self-contained beyond depending on Plans 04/06.
Output: Three TS source files, three test files, two new JSON schemas.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md
@.planning/phases/03-repo-runtime-sandbox/03-PATTERNS.md
@packages/authority/src/repo-policy/parse.ts
@packages/repo/schema/workspace-trust-admission-decision.schema.json
@packages/repo/src/symlink-audit.ts

Q-04 lock: Both — credentialRef preferred, system fallback. Admission decision
records `auth.mode: credentialRef|system|anonymous` plus `auth.credentialRef`
(name only, never value).

Q-13 lock + CONFLICT-02 (load-bearing): statusMatrix filter must be
`row[HEAD]===1 && (row[WORKDIR]!==row[HEAD] || row[STAGE]!==row[HEAD])`.
Naive `matrix.length > 0` reports dirty on every fresh clone with build
artifacts. Test must explicitly exercise: freshly-cloned repo with `dist/`
present → reports CLEAN.

Pitfall 1 (lines 494-499): `onAuth` retry storm. Track invocation count in
closure; cancel after 2 invocations with same ref.

PATTERNS.md analogs:
- `clone-workspace.ts`: error class shape from `workspace-trust-runtime.ts:10-20`.
- `dirty-worktree-status.ts`: predicate-result shape from same.
- `repo-policy.ts`: full template from `packages/authority/src/repo-policy/parse.ts`.
- admission-decision schema: copy `workspace-trust-admission-decision.schema.json` template, adapt evidence shape per Q-04/07/09/12.

RESEARCH.md Code Examples (lines 552-622) for clone + statusMatrix + symlinks
reference impls.

<interfaces>
```typescript
// clone-workspace.ts
export type CloneAuthMode = "credentialRef" | "system" | "anonymous";

export interface CloneRequest {
  readonly url: string;
  readonly dir: string;             // workspace dir (must NOT exist or be empty)
  readonly ref?: string;            // branch/tag (default: remote HEAD)
  readonly depth?: number;          // default 1 (single-branch shallow)
  readonly credentialRef?: string;  // env-var name (e.g., "GITHUB_PAT")
}

export interface CloneResult {
  readonly dir: string;
  readonly headSha: string;
  readonly auth: { readonly mode: CloneAuthMode; readonly credentialRef?: string };
  readonly symlinkAudit: { readonly ok: boolean; readonly offendingPaths: readonly string[] };
}

export class CredentialRefusedError extends Error { /* tracks ref name only, never value */ }

export async function cloneWorkspace(req: CloneRequest): Promise<CloneResult>;

// dirty-worktree-status.ts
export interface DirtyWorktreeStatus {
  readonly isDirty: boolean;
  readonly dirtyFiles: readonly string[];   // workspace-relative
}

/** Wraps isomorphic-git statusMatrix with the --untracked-files=no filter (CONFLICT-02). */
export async function dirtyWorktreeStatus(dir: string): Promise<DirtyWorktreeStatus>;

// repo-policy.ts
export interface RepoPolicy {
  readonly schemaVersion: "1.0.0";
  readonly workspaceRoot?: string;
  readonly subprocessTailBytes: { readonly stdout: number; readonly stderr: number };
  readonly commandAllowlist?: readonly string[];
  readonly tombstoneRetentionHours: number;
}

export const DEFAULT_REPO_POLICY: RepoPolicy = Object.freeze({
  schemaVersion: "1.0.0",
  subprocessTailBytes: { stdout: 8192, stderr: 4096 },
  tombstoneRetentionHours: 24,
});

/** Parse from JSON text or object; reject unknown keys; default-fill missing. */
export function parseRepoPolicy(input: unknown): { ok: boolean; policy: RepoPolicy; errors: readonly string[] };
```

Schema files:
- `packages/repo/schema/repo-policy.schema.json`: standard JSON-schema draft 2020-12; mirror `workspace-trust-admission-decision.schema.json` style for shape; closed-set per `additionalProperties: false`.
- `packages/repo/schema/repo-runtime-admission-decision.schema.json`: shape per PATTERNS.md template (lines 326-363) with `evidence.{workspaceRoot, auth, effectiveAllowlist, symlinkRefusal?, patchResults?, subprocessRecords?}`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: dirty-worktree-status (CONFLICT-02 filter) — RED+GREEN</name>
  <files>packages/repo/src/dirty-worktree-status.ts, packages/repo/src/dirty-worktree-status.test.ts</files>
  <behavior>
    Tests using `buildSacrificialRepo`:
    - Empty/clean 1-commit repo with NO dirty files: `isDirty: false, dirtyFiles: []`.
    - Repo with `dirtyFiles: [{path:"x.txt", content:"y"}]` (untracked): per `--untracked-files=no` semantics, isDirty: false (untracked files don't count). dirtyFiles: [].
    - Repo where seed-0.txt is committed then modified post-commit (use `dirtyFiles` to overwrite a path that matches a seeded committed file — fixture builder seeds `seed-0.txt`; modifying it post-commit makes it tracked-modified): `isDirty: true, dirtyFiles: ["seed-0.txt"]`.
    - **CONFLICT-02 regression test (load-bearing):** repo with untracked `dist/foo.js` (e.g., `dirtyFiles: [{path:"dist/foo.js",...}]`): `isDirty: false`. This test MUST be present; documents the bug fix.
  </behavior>
  <action>
    Implement per `<interfaces>` and RESEARCH.md §statusMatrix-based dirty detection
    (lines 583-601). Filter exactly:
    ```typescript
    const FILE = 0, HEAD = 1, WORKDIR = 2, STAGE = 3;
    const dirtyRows = matrix.filter(row =>
      row[HEAD] === 1 && (row[WORKDIR] !== row[HEAD] || row[STAGE] !== row[HEAD])
    );
    ```

    Write tests. Two commits (RED then GREEN).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>4/4 dirty-worktree tests green. CONFLICT-02 regression test passes. Two-commit history.</done>
</task>

<task type="auto">
  <name>Task 2: repo-policy parser + JSON schema</name>
  <files>packages/repo/src/repo-policy.ts, packages/repo/src/repo-policy.test.ts, packages/repo/schema/repo-policy.schema.json</files>
  <action>
    Mirror `packages/authority/src/repo-policy/parse.ts` (existing) for parser
    style: `readOptionalString`, `readOptionalNumber`, `readOptionalStringArray`,
    `rejectUnknownKeys`. Phase 2 already has a `repo-policy/parse.ts`; this
    plan introduces a new policy *for the repo runtime* (different schema —
    workspaceRoot, subprocessTailBytes, etc.). Decide naming to avoid
    collision: this file lives at `packages/repo/src/repo-policy.ts` (NOT
    in `packages/authority/src/repo-policy/`). Different package; different
    schema; different consumer.

    Schema file `packages/repo/schema/repo-policy.schema.json`:
    ```json
    {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "https://protostar.local/schema/repo-policy.schema.json",
      "title": "RepoPolicy",
      "type": "object",
      "additionalProperties": false,
      "required": ["schemaVersion", "subprocessTailBytes", "tombstoneRetentionHours"],
      "properties": {
        "schemaVersion": { "const": "1.0.0" },
        "workspaceRoot": { "type": "string" },
        "subprocessTailBytes": {
          "type": "object",
          "additionalProperties": false,
          "required": ["stdout", "stderr"],
          "properties": {
            "stdout": { "type": "integer", "minimum": 0 },
            "stderr": { "type": "integer", "minimum": 0 }
          }
        },
        "commandAllowlist": { "type": "array", "items": { "type": "string" } },
        "tombstoneRetentionHours": { "type": "number", "minimum": 0 }
      }
    }
    ```

    Update `packages/repo/package.json` exports to include the new schema file
    (mirror the existing `workspace-trust-admission-decision.schema.json` entry).

    Tests:
    - DEFAULT_REPO_POLICY is frozen and matches schema.
    - Parser rejects unknown keys.
    - Parser accepts minimal `{schemaVersion: "1.0.0", subprocessTailBytes: {stdout:8192,stderr:4096}, tombstoneRetentionHours: 24}`.
    - Parser default-fills missing optional fields.
    - Parser rejects negative `tombstoneRetentionHours`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>Parser + schema tests green. Schema exported via package.json.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: clone-workspace (isomorphic-git + onAuth + symlink-audit trigger)</name>
  <files>packages/repo/src/clone-workspace.ts, packages/repo/src/clone-workspace.test.ts, packages/repo/schema/repo-runtime-admission-decision.schema.json</files>
  <behavior>
    Tests are tricky because real network clones are not hermetic. Strategy:
    use `buildSacrificialRepo` to build a *source* repo on disk, then clone
    it via `isomorphic-git.clone({ url: 'file://' + sourceRepo.dir })` to a
    new dir. isomorphic-git supports `file://` URLs for local clones.
    [VERIFY: research mention or quick spike — if file:// is unsupported,
    fall back to git protocol or skip live-clone tests and exercise only the
    auth-shim logic with mocked `git.clone`.]

    Cases:
    - **happy local clone:** clone from a sacrificial source repo to a new dir; result.dir is a real workspace; result.headSha matches source HEAD; auth.mode === "anonymous"; symlinkAudit.ok === true.
    - **credentialRef mode:** mock `git.clone` (or use a wrapper around it for testability) to capture the `onAuth` callback; assert that when `credentialRef: "TEST_TOKEN"` is set and `process.env.TEST_TOKEN = "abc123"`, onAuth returns `{username: "abc123", password: "x-oauth-basic"}`; result.auth.mode === "credentialRef" and credentialRef === "TEST_TOKEN" (NEVER the value).
    - **credentialRef missing env:** ref set but env unset → onAuth returns `{cancel: true}` and clone fails with CredentialRefusedError.
    - **retry storm:** simulate 3 onAuth calls with same ref → after 2nd, returns `{cancel: true}` (Pitfall 1).
    - **post-clone symlink-audit fires:** clone a source that contains a symlink → result.symlinkAudit.ok === false with the offending path.
    - **secret never logged:** assert that the value of `process.env.TEST_TOKEN` does NOT appear in any logged output, error message, or returned field. (Test by setting a sentinel value and grepping the result JSON.)

    The credentialRef tests require either DI of the `clone` function or
    extracting the onAuth shim into a separately-testable function:
    ```typescript
    export function buildOnAuth(credentialRef: string | undefined): GitOnAuth { /* ... */ }
    ```
    Test buildOnAuth in isolation; integration test the wired version.
  </behavior>
  <action>
    1. Implement `clone-workspace.ts`:
       - Export `buildOnAuth(credentialRef?)` separately for unit-testability.
       - `cloneWorkspace(req)` — call `git.clone({fs, http: httpNode, dir: req.dir, url: req.url, singleBranch: true, depth: req.depth ?? 1, ref: req.ref, onAuth: buildOnAuth(req.credentialRef)})`.
       - `headSha = await git.resolveRef({fs, dir, ref: "HEAD"})`.
       - Call `auditSymlinks(req.dir)` and embed in result.
       - Auth mode: if credentialRef set + onAuth was invoked AND not cancelled → `"credentialRef"`. If unset → `"anonymous"`. (Future: detect system credential helper invocation → `"system"`. v1 returns "anonymous" when ref unset, since isomorphic-git has no system helper.)

    2. Schema `repo-runtime-admission-decision.schema.json` — copy template
       from PATTERNS.md (lines 326-363). Add to package.json exports.

    3. Tests in `clone-workspace.test.ts` per behavior. Strongly prefer the
       split: unit-test `buildOnAuth` alone (4 sub-cases: ref+env, ref+no-env,
       no-ref, retry-cancel); integration-test happy clone using `file://` if
       supported, else skip with a documented note.

    Two commits expected (RED + GREEN, or impl-first + test-first depending
    on TDD style).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>cloneWorkspace + buildOnAuth tested; symlink audit triggered post-clone; auth.credentialRef in result is the NAME only (regex assertion: result JSON does not contain the env value).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| RepoTarget URL → isomorphic-git network | Clone-time auth surface; PAT or anonymous |
| Process env → onAuth callback | Secret material flows in; admission decision records name only |
| Repo-policy.json → runtime config | Operator-controlled; schema bounds shape |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-10-01 | Information Disclosure | Credential value logged | mitigate | onAuth reads `process.env[ref]` inline; result records ref name only; explicit test checks value-not-leaked. |
| T-03-10-02 | DoS | Bad PAT retry storm | mitigate | onAuth invocation counter; `{cancel:true}` after 2 (Pitfall 1). |
| T-03-10-03 | Tampering | Clone target's symlinks redirect FS adapter | mitigate | Plan 06 audit fires post-clone; cloneWorkspace embeds result; Plan 11 wires admission-decision block. |
| T-03-10-04 | Tampering | Naive dirty detection false-positive on every fresh clone | mitigate | CONFLICT-02 filter; explicit regression test. |
| T-03-10-05 | Elevation of Privilege | Recursive workspace clone (workspaceRoot inside source) | mitigate | repo-policy parser SHOULD validate at config-load time; deferred to Plan 11 wiring (config-load there); document in CONCERNS.md. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-01 (target registration: url + credentialRef), REPO-02 (clone+branch+checkout via isomorphic-git), REPO-06 (dirty detection).
- **Sample frequency:** Per-task `pnpm --filter @protostar/repo test`.
- **Observability:** auth.credentialRef name appears in admission decision; CredentialRefusedError catches retry storm; CONFLICT-02 filter tested explicitly.
- **Nyquist:** ~12 tests across three files; each rejection reason has a case.
</validation_strategy>

<verification>
- `pnpm --filter @protostar/repo test` green
- `cat packages/repo/schema/repo-runtime-admission-decision.schema.json | jq -r '.title'` returns `"RepoRuntimeAdmissionDecision"`
- `grep -E 'matrix\.length\s*>\s*0' packages/repo/src/dirty-worktree-status.ts | grep -v '^#'` returns nothing
- `grep -c 'WORKDIR\|STAGE' packages/repo/src/dirty-worktree-status.ts | grep -v '^#'` ≥ 2
</verification>

<success_criteria>
- `cloneWorkspace` integrates symlink-audit; result has typed auth field
- `dirtyWorktreeStatus` uses CONFLICT-02 filter; regression test pinned
- `parseRepoPolicy` accepts/rejects per schema; DEFAULT_REPO_POLICY frozen
- Two new JSON schemas exported via package.json
- Credential value never appears in returned data or logs
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-10-SUMMARY.md` with: per-file test count, file:// clone-test feasibility (worked / fell back to mock), CONFLICT-02 regression-test exact assertion, schema export entries.
</output>
