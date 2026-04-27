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
    - "loadRepoPolicy reads `${projectRoot}/.protostar/repo-policy.json`, default-fills when absent, refuses workspaceRoot resolving inside or equal to projectRoot (Q-02 recursive-clone safety)"
    - "repo-runtime-admission-decision schema covers auth, effectiveAllowlist, symlinkRefusal, patchResults, subprocessRecords"
    - "file:// clone feasibility is locked: tests use buildOnAuth unit-tests + mocked git.clone for cloneWorkspace integration (no live network or file:// dependency)"
  artifacts:
    - path: "packages/repo/src/clone-workspace.ts"
      provides: "Clone + auth + symlink-audit-trigger orchestration helper"
      exports: ["cloneWorkspace", "CloneAuthMode", "CloneResult", "CredentialRefusedError", "buildOnAuth"]
    - path: "packages/repo/src/dirty-worktree-status.ts"
      provides: "statusMatrix wrapper with --untracked-files=no semantics"
      exports: ["dirtyWorktreeStatus", "DirtyWorktreeStatus"]
    - path: "packages/repo/src/repo-policy.ts"
      provides: "Repo-policy schema + parser + IO loader (with workspaceRoot-outside-source check)"
      exports: ["parseRepoPolicy", "loadRepoPolicy", "RepoPolicy", "DEFAULT_REPO_POLICY"]
    - path: "packages/repo/schema/repo-runtime-admission-decision.schema.json"
      provides: "Per-gate decision JSON schema"
  key_links:
    - from: "packages/repo/src/clone-workspace.ts"
      to: "packages/repo/src/symlink-audit.ts"
      via: "post-clone tree audit"
      pattern: "auditSymlinks"
    - from: "packages/repo/src/repo-policy.ts (loadRepoPolicy)"
      to: ".protostar/repo-policy.json"
      via: "fs.readFile + JSON.parse + parseRepoPolicy + workspaceRoot-outside-source check"
      pattern: "loadRepoPolicy"
---

<objective>
Three small interrelated pieces in one plan: clone orchestration (isomorphic-git + auth shim + symlink audit trigger), dirty-worktree status (statusMatrix with CONFLICT-02 filter), and repo-policy parser + IO loader + schemas (workspaceRoot, subprocessTailBytes, commandAllowlist, tombstoneRetentionHours, plus the per-gate admission-decision JSON schema). The IO loader (`loadRepoPolicy`) is the natural config-load site for the Q-02 workspaceRoot-outside-source-repo safety check.

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

Q-02 lock (load-bearing): "Validate at config-load that `workspaceRoot` is
*outside* the source repo (no recursive clones)." This plan owns the check —
implemented inside `loadRepoPolicy`, after `parseRepoPolicy` resolves the
optional `workspaceRoot` field. No deferral to Plan 11.

Q-04 lock: Both — credentialRef preferred, system fallback. Admission decision
records `auth.mode: credentialRef|system|anonymous` plus `auth.credentialRef`
(name only, never value).

Q-11 lock: cleanup primitive surface. `tombstoneRetentionHours` (default 24)
lands in this plan's policy schema; Plan 11 owns the call sites + tombstone
write. The schema must reject negative values.

Q-13 lock + CONFLICT-02 (load-bearing): statusMatrix filter must be
`row[HEAD]===1 && (row[WORKDIR]!==row[HEAD] || row[STAGE]!==row[HEAD])`.
Naive `matrix.length > 0` reports dirty on every fresh clone with build
artifacts. Test must explicitly exercise: freshly-cloned repo with `dist/`
present → reports CLEAN.

Pitfall 1 (RESEARCH.md lines 494-499): `onAuth` retry storm. Track invocation
count in closure; cancel after 2 invocations with same ref.

PATTERNS.md analogs:
- `clone-workspace.ts`: error class shape from `workspace-trust-runtime.ts:10-20`.
- `dirty-worktree-status.ts`: predicate-result shape from same.
- `repo-policy.ts`: full template from `packages/authority/src/repo-policy/parse.ts`.
- admission-decision schema: copy `workspace-trust-admission-decision.schema.json` template, adapt evidence shape per Q-04/07/09/12.

RESEARCH.md Code Examples (lines 552-622) for clone + statusMatrix + symlinks
reference impls.

**file:// clone feasibility (W-02 resolution):** Locked to MOCK path. Live
`file://` clones via isomorphic-git are not exercised in this phase's tests.
The auth-shim split via `buildOnAuth(credentialRef?)` makes the onAuth logic
unit-testable in isolation; the wired `cloneWorkspace` integration uses a
dependency-injected or vi.mock'd `git.clone` to assert the call shape (correct
url/dir/onAuth/depth/singleBranch wiring) without performing real I/O.
Rationale: keeps tests hermetic, removes any "does isomorphic-git support
file://" question from the critical path. A real-clone smoke test is
optionally added in Plan 13's checkpoint, not here.

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

export function buildOnAuth(credentialRef: string | undefined): GitOnAuth;
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

/** Parse from JSON text or object; reject unknown keys; default-fill missing. PURE — no IO. */
export function parseRepoPolicy(input: unknown): { ok: true; policy: RepoPolicy } | { ok: false; errors: readonly string[] };

/**
 * IO + parse + default-fill + Q-02 recursive-clone safety check.
 * - Missing `${projectRoot}/.protostar/repo-policy.json` → ok with DEFAULT_REPO_POLICY.
 * - Unreadable file → ok:false.
 * - Malformed JSON → ok:false.
 * - parseRepoPolicy failure → ok:false (errors propagated).
 * - workspaceRoot resolving inside or equal to projectRoot → ok:false (Q-02 refusal).
 */
export async function loadRepoPolicy(
  projectRoot: string
): Promise<{ ok: true; policy: RepoPolicy } | { ok: false; errors: readonly string[] }>;
```

Schema files:
- `packages/repo/schema/repo-policy.schema.json`: standard JSON-schema draft 2020-12; mirror `workspace-trust-admission-decision.schema.json` style for shape; closed-set per `additionalProperties: false`.
- `packages/repo/schema/repo-runtime-admission-decision.schema.json`: shape per PATTERNS.md template (lines 326-363) with `evidence.{workspaceRoot, auth, effectiveAllowlist, symlinkRefusal?, patchResults: array, subprocessRecords: array}`. Per W-04 alignment: `patchResults` and `subprocessRecords` are **required arrays** (may be empty `[]` in v1) — not optional/undefined — so Plan 12 contract assertions can rely on their presence.
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

<task type="auto" tdd="true">
  <name>Task 2: repo-policy parser + loadRepoPolicy (with Q-02 check) + JSON schema</name>
  <files>packages/repo/src/repo-policy.ts, packages/repo/src/repo-policy.test.ts, packages/repo/schema/repo-policy.schema.json</files>
  <behavior>
    parseRepoPolicy (pure):
    - DEFAULT_REPO_POLICY is frozen and matches schema.
    - Rejects unknown keys.
    - Accepts minimal `{schemaVersion: "1.0.0", subprocessTailBytes: {stdout:8192,stderr:4096}, tombstoneRetentionHours: 24}`.
    - Default-fills missing optional fields.
    - Rejects negative `tombstoneRetentionHours`.
    - Rejects unknown schemaVersion.

    loadRepoPolicy (IO, projectRoot arg):
    - **Missing file** (`${projectRoot}/.protostar/repo-policy.json` does not exist) → `{ok:true, policy: DEFAULT_REPO_POLICY}`.
    - **Malformed JSON** → `{ok:false, errors: ["repo-policy invalid JSON: <reason>"]}`.
    - **Unreadable** (permission denied, etc.) → `{ok:false, errors: ["repo-policy unreadable: <reason>"]}`.
    - **Valid file with valid policy, workspaceRoot omitted** → `{ok:true, policy}` (no Q-02 check needed).
    - **Valid file, workspaceRoot points to OS tmpdir / disjoint absolute path** → `{ok:true, policy}` with absolute resolved workspaceRoot.
    - **Q-02 refusal — workspaceRoot equal to projectRoot** → `{ok:false, errors: [/recursive.*clone/i]}`.
    - **Q-02 refusal — workspaceRoot resolves to `<projectRoot>/.protostar/workspaces`** (a path inside projectRoot) → `{ok:false, errors: [/workspaceRoot must be outside the source repo/]}`. This pins the canonical "operator points workspaceRoot at source repo" footgun.
    - **Q-02 ok — workspaceRoot resolves to `os.tmpdir()/protostar-workspaces`** → `{ok:true, policy}`.
    - **Relative workspaceRoot** is resolved against `projectRoot` before the inside-check (so `"./.protostar/workspaces"` is REFUSED — it's inside projectRoot once resolved).
  </behavior>
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

    Implement `loadRepoPolicy(projectRoot)`:
    ```typescript
    import { readFile } from "node:fs/promises";
    import { join, resolve, sep } from "node:path";

    export async function loadRepoPolicy(projectRoot: string) {
      const path = join(projectRoot, ".protostar/repo-policy.json");
      let raw: string;
      try {
        raw = await readFile(path, "utf8");
      } catch (err: any) {
        if (err?.code === "ENOENT") {
          return { ok: true as const, policy: DEFAULT_REPO_POLICY };
        }
        return { ok: false as const, errors: [`repo-policy unreadable: ${err?.message ?? String(err)}`] };
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch (err: any) {
        return { ok: false as const, errors: [`repo-policy invalid JSON: ${err?.message ?? String(err)}`] };
      }
      const result = parseRepoPolicy(parsedJson);
      if (!result.ok) return result;
      // Q-02: workspaceRoot must be outside source repo
      if (result.policy.workspaceRoot !== undefined) {
        const absProjectRoot = resolve(projectRoot);
        const absWorkspaceRoot = resolve(projectRoot, result.policy.workspaceRoot);
        if (
          absWorkspaceRoot === absProjectRoot ||
          absWorkspaceRoot.startsWith(absProjectRoot + sep)
        ) {
          return {
            ok: false as const,
            errors: [
              `workspaceRoot must be outside the source repo (recursive-clone risk): ${absWorkspaceRoot} is inside ${absProjectRoot}`,
            ],
          };
        }
      }
      return result;
    }
    ```

    Note: the Q-02 check lives in `loadRepoPolicy` (not `parseRepoPolicy`)
    because parsing is pure and doesn't know about the project root. The
    config-load site (Plan 11) calls `loadRepoPolicy(projectRoot)` and gets
    the safety check for free.

    Tests live in `repo-policy.test.ts`; use `os.tmpdir()` + nanoid for
    isolated projectRoot fixtures, write a `repo-policy.json` to disk, then
    call `loadRepoPolicy`. Cleanup with `t.after(() => rm -rf)`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>parseRepoPolicy + loadRepoPolicy tests green. All 6 parser cases + 8 loadRepoPolicy cases pass. Schema exported via package.json. Q-02 refusal pinned by named regression test (workspaceRoot pointing inside projectRoot).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: clone-workspace (isomorphic-git + onAuth + symlink-audit trigger)</name>
  <files>packages/repo/src/clone-workspace.ts, packages/repo/src/clone-workspace.test.ts, packages/repo/schema/repo-runtime-admission-decision.schema.json</files>
  <behavior>
    **W-02 resolution: tests use mocked `git.clone`, NOT live file:// clones.**
    The auth-shim split via `buildOnAuth(credentialRef?)` makes the onAuth
    closure unit-testable without ever invoking isomorphic-git over the
    network or filesystem. The integration test asserts `cloneWorkspace`
    calls `git.clone` with the right shape (url, dir, depth:1,
    singleBranch:true, ref, onAuth-from-buildOnAuth) and then calls
    `auditSymlinks(dir)` and `git.resolveRef`.

    Cases:
    - **buildOnAuth — credentialRef + env set:** `process.env.TEST_TOKEN = "abc123"`; `buildOnAuth("TEST_TOKEN")(url, {})` → `{username: "abc123", password: "x-oauth-basic"}`.
    - **buildOnAuth — credentialRef + env unset:** `delete process.env.TEST_TOKEN`; `buildOnAuth("TEST_TOKEN")(url, {})` → `{cancel: true}`.
    - **buildOnAuth — no credentialRef:** `buildOnAuth(undefined)(url, {})` → `{cancel: true}` or anonymous depending on isomorphic-git's expected shape.
    - **buildOnAuth — retry storm:** call same closure 3 times; 3rd call returns `{cancel: true}` regardless of env (Pitfall 1 — counter inside closure).
    - **cloneWorkspace integration — happy path with mocked git.clone:** mock returns successfully; mock auditSymlinks returns `{ok:true, offendingPaths:[]}`; mock resolveRef returns "abc123def456..."; assert result.dir === req.dir, result.headSha === "abc123def456...", auth.mode === "anonymous" (no credentialRef).
    - **cloneWorkspace — credentialRef path:** with `credentialRef: "TEST_TOKEN"` set, assert that the onAuth passed to git.clone IS the buildOnAuth("TEST_TOKEN") closure (call it once, assert behavior); result.auth.mode === "credentialRef", result.auth.credentialRef === "TEST_TOKEN".
    - **cloneWorkspace — symlink-audit refusal propagates:** mock auditSymlinks returns `{ok:false, offendingPaths:["foo/bar"]}`; result.symlinkAudit reflects it (cloneWorkspace does NOT throw — it just embeds the audit; the refusal-decision write happens in Plan 11).
    - **cloneWorkspace — credentialRef value never appears in result:** with `process.env.TEST_TOKEN = "SENTINEL_VALUE_xyz"`, the JSON-serialized result must NOT contain "SENTINEL_VALUE_xyz" anywhere.
    - **CredentialRefusedError:** if isomorphic-git's clone throws because onAuth returned cancel, cloneWorkspace wraps as CredentialRefusedError with the ref name.
  </behavior>
  <action>
    1. Implement `clone-workspace.ts`:
       - Export `buildOnAuth(credentialRef?)` separately for unit-testability.
         Track invocation count in closure; cancel after 2 with same ref.
       - `cloneWorkspace(req)` — call `git.clone({fs, http: httpNode, dir: req.dir, url: req.url, singleBranch: true, depth: req.depth ?? 1, ref: req.ref, onAuth: buildOnAuth(req.credentialRef)})`.
       - `headSha = await git.resolveRef({fs, dir, ref: "HEAD"})`.
       - Call `auditSymlinks(req.dir)` and embed in result.
       - Auth mode: if credentialRef set + onAuth was invoked AND not cancelled → `"credentialRef"`. If unset → `"anonymous"`. (Future: detect system credential helper invocation → `"system"`. v1 returns "anonymous" when ref unset, since isomorphic-git has no system helper.)
       - Wrap `git.clone` import behind a dependency-injected handle (e.g.,
         module-level `gitClone = git.clone` + `__setGitCloneForTests` or
         vi.mock at the test side) so tests do not perform real I/O.

    2. Schema `repo-runtime-admission-decision.schema.json` — copy template
       from PATTERNS.md (lines 326-363). Add to package.json exports.
       **W-04 alignment:** `evidence.patchResults` and `evidence.subprocessRecords`
       are typed as `"type": "array"` and listed under `required` (may be empty
       `[]` in v1, never `undefined`/omitted).

    3. Tests in `clone-workspace.test.ts` per behavior. Strongly prefer the
       split: unit-test `buildOnAuth` alone (4 sub-cases); integration-test
       cloneWorkspace with vi.mock'd `git.clone` (4 sub-cases).

    Two commits expected (RED + GREEN).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>cloneWorkspace + buildOnAuth tested with mocks (no live network/file://); symlink audit triggered post-clone; auth.credentialRef in result is the NAME only (regex assertion: result JSON does not contain the env value).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| RepoTarget URL → isomorphic-git network | Clone-time auth surface; PAT or anonymous |
| Process env → onAuth callback | Secret material flows in; admission decision records name only |
| Repo-policy.json → runtime config | Operator-controlled; schema bounds shape |
| Operator-supplied workspaceRoot → filesystem | Mis-pointing at source repo causes recursive self-clones |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-10-01 | Information Disclosure | Credential value logged | mitigate | onAuth reads `process.env[ref]` inline; result records ref name only; explicit test checks value-not-leaked. |
| T-03-10-02 | DoS | Bad PAT retry storm | mitigate | onAuth invocation counter; `{cancel:true}` after 2 (Pitfall 1). |
| T-03-10-03 | Tampering | Clone target's symlinks redirect FS adapter | mitigate | Plan 06 audit fires post-clone; cloneWorkspace embeds result; Plan 11 wires admission-decision block. |
| T-03-10-04 | Tampering | Naive dirty detection false-positive on every fresh clone | mitigate | CONFLICT-02 filter; explicit regression test. |
| T-03-10-05 | Elevation of Privilege | Recursive workspace clone (workspaceRoot inside source) | mitigate | `loadRepoPolicy` resolves workspaceRoot to absolute, refuses if equal to or starts-with `projectRoot + sep`. Pinned by Q-02 regression test. CONCERNS.md addendum (Plan 01) documents the footgun. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-01 (target registration: url + credentialRef), REPO-02 (clone+branch+checkout via isomorphic-git, mocked in tests), REPO-06 (dirty detection), Q-02 (workspaceRoot-outside-source enforced at config-load).
- **Sample frequency:** Per-task `pnpm --filter @protostar/repo test`.
- **Observability:** auth.credentialRef name appears in admission decision; CredentialRefusedError catches retry storm; CONFLICT-02 filter tested explicitly; loadRepoPolicy refusal carries the resolved-path pair in the error message.
- **Nyquist:** ~18 tests across three files (4 dirty + 6 parse + 8 loadRepoPolicy + 8 clone-workspace incl. buildOnAuth); each rejection reason has a case.
</validation_strategy>

<verification>
- `pnpm --filter @protostar/repo test` green
- `cat packages/repo/schema/repo-runtime-admission-decision.schema.json | jq -r '.title'` returns `"RepoRuntimeAdmissionDecision"`
- `grep -E 'matrix\.length\s*>\s*0' packages/repo/src/dirty-worktree-status.ts | grep -v '^#'` returns nothing
- `grep -v '^#' packages/repo/src/dirty-worktree-status.ts | grep -cE 'WORKDIR|STAGE'` ≥ 2
- `grep -v '^#' packages/repo/src/repo-policy.ts | grep -c 'loadRepoPolicy'` ≥ 1
- `grep -v '^#' packages/repo/src/repo-policy.ts | grep -cE 'startsWith.*sep|recursive.*clone|outside the source'` ≥ 1
</verification>

<success_criteria>
- `cloneWorkspace` integrates symlink-audit; result has typed auth field
- `dirtyWorktreeStatus` uses CONFLICT-02 filter; regression test pinned
- `parseRepoPolicy` accepts/rejects per schema; DEFAULT_REPO_POLICY frozen
- **`loadRepoPolicy` reads `.protostar/repo-policy.json`, default-fills when absent, refuses workspaceRoot resolving inside or equal to projectRoot (Q-02), and is the canonical config-load entry point consumed by Plan 11**
- Two new JSON schemas exported via package.json
- Credential value never appears in returned data or logs
- `patchResults` and `subprocessRecords` in admission-decision schema are required arrays (may be empty)
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-10-SUMMARY.md` with: per-file test count, mocking strategy used for git.clone, CONFLICT-02 regression-test exact assertion, schema export entries, loadRepoPolicy Q-02 refusal exact error message string.
</output>
