---
phase: 03-repo-runtime-sandbox
plan: 06
type: tdd
wave: 1
depends_on: [01, 04]
files_modified:
  - packages/repo/src/symlink-audit.ts
  - packages/repo/src/symlink-audit.test.ts
autonomous: true
requirements: [REPO-03]
must_haves:
  truths:
    - "auditSymlinks(workspaceRoot) walks the tree once via readdir({recursive, withFileTypes}) and returns offending paths"
    - "Returns { ok: true, offendingPaths: [] } for clean repos"
    - "Returns { ok: false, offendingPaths: [...] } when any symlink exists, regardless of target"
    - "Workspace-relative paths in result (not absolute)"
  artifacts:
    - path: "packages/repo/src/symlink-audit.ts"
      provides: "Post-clone tree walk; refuses any workspace symlink"
      exports: ["auditSymlinks", "SymlinkAuditResult"]
  key_links:
    - from: "packages/repo/src/symlink-audit.ts"
      to: "@protostar/repo clone-workspace caller (Plan 09)"
      via: "called immediately after clone completes"
      pattern: "auditSymlinks"
---

<objective>
Implement Q-06 strict symlink refusal: post-clone tree walk via Node 22 `readdir({withFileTypes, recursive})`, returning every symlink found. Result is consumed by Plan 09 (clone-workspace orchestration) which marks the workspace untrusted on any non-empty offendingPaths list.

Purpose: REPO-03 requires the symlink rule. One-shot at clone time is the simplest enforcement; per-op `lstat` (Plan 05) is the suspenders.
Output: `auditSymlinks` async function, comprehensive test suite covering empty/clean/dirty/nested/at-root cases.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md
@.planning/phases/03-repo-runtime-sandbox/03-PATTERNS.md
@packages/repo/src/workspace-trust-runtime.ts

Q-06 lock: Refuse all symlinks tree-wide at clone time. Refusal artifact carries
the offending paths. v1 accepts false positives if a target repo legitimately
ships symlinks (none expected in our cosmetic-tweak loop scope).

RESEARCH.md Code Examples (lines 603-622) — `findSymlinks` reference impl using
`readdir({ withFileTypes: true, recursive: true })` + `dirent.isSymbolicLink()`.
Node 22 `Dirent.parentPath` (or `path` on older shapes) gives the parent dir;
join with `entry.name` for the full path.

RESEARCH.md Assumption A3: `dirent.parentPath` may not always be present
(version-dependent). Fallback: track parent dir via manual recursion if needed.
For Node 22.22.1 (current env), `parentPath` is documented and present.

<interfaces>
```typescript
export interface SymlinkAuditResult {
  readonly ok: boolean;
  /** Workspace-relative POSIX-style paths of all symlinks found. Empty when ok=true. */
  readonly offendingPaths: readonly string[];
}

/**
 * Walk `workspaceRoot` recursively. Return all symlink entries (workspace-relative).
 * One-pass tree audit; per Q-06 strict refusal — does NOT follow symlink targets.
 *
 * @throws never — IO errors during walk are converted to a fail result with an
 *                 entry under offendingPaths shaped as ".audit-error:{relpath}"
 *                 OR rethrown — choose one and document. Recommendation: rethrow,
 *                 caller (Plan 09) handles by marking workspace untrusted via the
 *                 broader admission-decision path.
 */
export async function auditSymlinks(workspaceRoot: string): Promise<SymlinkAuditResult>;
```

Implementation:
```typescript
import { readdir } from "node:fs/promises";
import { relative } from "node:path";

export async function auditSymlinks(workspaceRoot: string): Promise<SymlinkAuditResult> {
  const entries = await readdir(workspaceRoot, {
    withFileTypes: true,
    recursive: true,
  });
  const offending: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      // Node 22 Dirent has parentPath (string) on recursive walks.
      const parent = (entry as { parentPath?: string; path?: string }).parentPath
                   ?? (entry as { parentPath?: string; path?: string }).path
                   ?? workspaceRoot;
      const absolutePath = `${parent}/${entry.name}`;
      offending.push(relative(workspaceRoot, absolutePath));
    }
  }
  return { ok: offending.length === 0, offendingPaths: offending };
}
```

Note on `.git/` directory: isomorphic-git's `init` does not create symlinks
inside `.git/`, but real-world cloned repos *can* have symlinked refs (rare).
Q-06 strict mode means even those are flagged. Test fixture's `buildSacrificialRepo`
won't generate `.git/` symlinks via isomorphic-git; if a target repo does, the
operator must opt-in via repo-policy (deferred per CONTEXT.md `<deferred>`).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (RED): Write failing audit-symlinks test suite</name>
  <files>packages/repo/src/symlink-audit.test.ts</files>
  <behavior>
    Tests using `buildSacrificialRepo`:
    - **clean-empty:** Default repo (1 commit, no symlinks). `auditSymlinks(repo.dir)` returns `{ ok: true, offendingPaths: [] }`.
    - **single-symlink-at-root:** Fixture with `symlinks: [{ path: "link.txt", target: "seed-0.txt" }]`. Returns `{ ok: false, offendingPaths: ["link.txt"] }`.
    - **nested-symlink:** Use `dirtyFiles` to seed `subdir/file.txt`, then manually create `subdir/inner-link.txt -> ../seed-0.txt` via `fs.symlink` after fixture. Expect path `subdir/inner-link.txt` in result.
    - **multiple-symlinks:** Two symlinks, both reported.
    - **symlink-to-outside-workspace:** symlink target is `/etc/hosts` (or any absolute outside path). Audit still reports it (we don't follow targets; we report by entry type). Result `ok: false`.
    - **broken-symlink:** symlink target doesn't exist. `lstat` reports symbolic link regardless of target — audit still reports it.
  </behavior>
  <action>
    Create `packages/repo/src/symlink-audit.test.ts`. Use `buildSacrificialRepo`
    where possible; for cases the fixture options don't cover (broken symlink,
    nested), augment the returned `repo.dir` with manual `fs.symlink`/
    `fs.writeFile` calls inside `t.beforeEach` or test setup.

    Build expected paths using POSIX separators (`subdir/inner-link.txt`) — on
    macOS/linux this is consistent; tests don't run on Windows for now.

    Run `pnpm --filter @protostar/repo build` — expect compile fail (no
    `symlink-audit.ts`). RED commit: `test(03-06): add failing symlink-audit suite`.
  </action>
  <verify>
    <automated>! pnpm --filter @protostar/repo build 2&gt;/dev/null</automated>
  </verify>
  <done>Test file with 6 cases exists; build fails for missing source.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (GREEN): Implement auditSymlinks</name>
  <files>packages/repo/src/symlink-audit.ts</files>
  <action>
    Implement per `<interfaces>` block. Use Node 22 `readdir` recursive form.
    Sort `offendingPaths` lexicographically before returning so test assertions
    are order-stable.

    Run `pnpm --filter @protostar/repo test`. All 6 cases green.

    Commit: `feat(03-06): one-pass symlink tree audit (Q-06 strict refusal)`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>6/6 audit tests pass. RED + GREEN commits in log.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cloned target repo → workspace | Adversarial target repo could ship symlinks pointing outside workspace; audit refuses categorically. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-06-01 | Information Disclosure | Symlink target outside workspace (e.g., `/etc/passwd`) | mitigate | Refuse on entry-type, not target. We don't `readlink` and we don't `stat` (which follows). Q-06 strict. |
| T-03-06-02 | Tampering | Race between audit and patch-apply (symlink injected post-audit) | mitigate | Per-op `lstat` in Plan 05 fs-adapter (defense in depth). Plan 09 calls auditSymlinks immediately after clone — narrow window. |
| T-03-06-03 | DoS | Pathological deep tree | accept | Node 22 `readdir({recursive})` is one syscall fan-out; for cosmetic-tweak loop targets (Tauri toy ~MBs), trivially bounded. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-03 symlink half (fs-adapter belt is Plan 05; this plan is the suspenders at clone time).
- **Sample frequency:** Per-task `pnpm --filter @protostar/repo test`.
- **Observability:** offendingPaths returned to caller verbatim — refusal-artifact-friendly.
- **Nyquist:** 6 cases cover root, nested, multiple, broken, outside-target.
</validation_strategy>

<verification>
- `pnpm --filter @protostar/repo test` green with ≥6 audit tests
- RED then GREEN commit history
</verification>

<success_criteria>
- `auditSymlinks` exported from `packages/repo/src/symlink-audit.ts`
- Result discriminated union per `<interfaces>`
- Workspace-relative paths in offendingPaths
- Tests exercise nested + broken + outside-target symlink cases
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-06-SUMMARY.md` with: test count, observed `Dirent.parentPath` behavior on Node 22.22.1, any platform notes.
</output>
