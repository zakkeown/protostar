---
phase: 03-repo-runtime-sandbox
plan: 05
type: tdd
wave: 1
depends_on: [01, 04]
files_modified:
  - packages/repo/src/fs-adapter.ts
  - packages/repo/src/fs-adapter.test.ts
autonomous: true
requirements: [REPO-03]
must_haves:
  truths:
    - "FS adapter accepts AuthorizedWorkspaceOp and re-canonicalizes path before any node:fs call (belt-and-suspenders Q-05)"
    - "Adapter refuses symlinks at entry via lstat (Q-06 defense in depth)"
    - "Adapter refuses paths that escape workspaceRoot via path.relative startsWith ('..')"
    - "readFile, writeFile, deleteFile each take AuthorizedWorkspaceOp; access discrimination matches op.access"
  artifacts:
    - path: "packages/repo/src/fs-adapter.ts"
      provides: "Brand-consuming FS adapter for Phase 3 I/O"
      exports: ["readFile", "writeFile", "deleteFile", "FsAdapterError"]
  key_links:
    - from: "packages/repo/src/fs-adapter.ts"
      to: "@protostar/authority AuthorizedWorkspaceOp"
      via: "type import + brand consumption"
      pattern: "AuthorizedWorkspaceOp"
---

<objective>
Build the brand-consuming FS adapter (Q-05 belt-and-suspenders): every read/write/delete takes `AuthorizedWorkspaceOp` (minted in `@protostar/authority` per Phase 2), re-canonicalizes the path, asserts equality with the brand's resolved path, refuses symlinks via `lstat`, and refuses workspace-escape via `path.relative`.

Purpose: Plan 07 (apply-change-set) and Plan 11 (factory-cli wiring) consume this adapter. Standing it alone with TDD-first means the contract is locked before downstream code calls it.
Output: `fs-adapter.ts` with `readFile`/`writeFile`/`deleteFile` + `FsAdapterError`. Comprehensive RED→GREEN test suite covering happy path, escape, symlink, canonicalization mismatch.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md
@.planning/phases/03-repo-runtime-sandbox/03-PATTERNS.md
@packages/authority/src/authorized-ops/workspace-op.ts
@packages/authority/src/stage-reader/fs-adapter.ts
@packages/repo/src/workspace-trust-runtime.ts

Q-05 lock: belt-and-suspenders. Mint-time cap-check on `AuthorizedWorkspaceOp`
(Phase 2 — currently a no-op pass-through; Plan 02-12 lands real envelope check)
PLUS adapter re-canonicalizes at entry. This plan is the adapter half.

Q-06 lock: refuse all symlinks. Tree-wide audit at clone time (Plan 06) AND
per-op `lstat` here (defense in depth).

PATTERNS.md analog (`packages/authority/src/stage-reader/fs-adapter.ts:1-4`):
the existing adapter is read-only; Phase 3 adapter is broader. Brand shape from
`packages/authority/src/authorized-ops/workspace-op.ts:8-21`.

RESEARCH.md Pattern 1 (lines 334-362): full reference impl. Use it as the basis;
adapt to existing `AuthorizedWorkspaceOp` field names (`workspace`, `path`,
`access`, `resolvedEnvelope`).

RESEARCH.md Pitfall 4 (lines 514-520): `path.resolve` is lexical — does NOT
follow symlinks. Always `lstat` before any read; refuse symlinks.

<interfaces>
Brand shape (from `packages/authority/src/authorized-ops/workspace-op.ts:8-21`):
```typescript
export interface AuthorizedWorkspaceOpData {
  readonly workspace: WorkspaceRef;     // .root: string
  readonly path: string;                 // canonicalized at mint
  readonly access: "read" | "write" | "execute";
  readonly resolvedEnvelope: CapabilityEnvelope;
}
export type AuthorizedWorkspaceOp = AuthorizedWorkspaceOpData & {
  readonly [AuthorizedWorkspaceOpBrand]: true;
};
```

Target API:
```typescript
export class FsAdapterError extends Error {
  constructor(
    public readonly op: AuthorizedWorkspaceOp,
    public readonly reason:
      | "canonicalization-mismatch"
      | "escape-attempt"
      | "symlink-refusal"
      | "access-mismatch"
      | "io-error",
    message: string
  ) { super(message); this.name = "FsAdapterError"; }
}

export async function readFile(op: AuthorizedWorkspaceOp): Promise<Buffer>;
export async function writeFile(op: AuthorizedWorkspaceOp, bytes: Buffer): Promise<void>;
export async function deleteFile(op: AuthorizedWorkspaceOp): Promise<void>;
```

Each function must:
1. Verify `op.access` permits the action (`readFile` requires `"read"` or `"write"` or `"execute"`-with-read; `writeFile`/`deleteFile` require `"write"`).
2. Compute `reResolved = path.resolve(op.workspace.root, op.path)` IF `op.path` is workspace-relative, OR `path.resolve(op.path)` if absolute. Match what Phase 2 mint stores — verify by reading `workspace-op.ts` mint logic. **Assumption:** mint stores absolute canonical path. If so, `reResolved = path.resolve(op.path)` and assert `reResolved === op.path` (no-op-equality is the canary; if they ever diverge, brand was mutated post-mint).
3. Verify `path.relative(op.workspace.root, reResolved)` does NOT start with `".."` (workspace containment).
4. `lstat(reResolved)`. If `.isSymbolicLink()` → throw `FsAdapterError` with reason `"symlink-refusal"`.
5. Perform the actual `node:fs/promises` call.

For `writeFile`: the file may not exist yet (legitimate create). `lstat` on
non-existent path throws `ENOENT` — catch and treat as "no symlink at target,
proceed to write" (write to `reResolved`). After write, optionally re-`lstat`
to confirm we didn't write to a TOCTOU-injected symlink (extra suspenders).

For `deleteFile`: `lstat` first (must exist; symlink check applies).

Throw `FsAdapterError` with `reason: "io-error"` and original error chained as
`cause` for any `node:fs/promises` failure.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (RED): Write failing test suite for fs-adapter</name>
  <files>packages/repo/src/fs-adapter.test.ts</files>
  <behavior>
    Tests using `buildSacrificialRepo` from Plan 04. Each test wraps in `t.after(rm)`.

    Helper: in-test mint of an `AuthorizedWorkspaceOp`. Use the public
    `authorizeWorkspaceOp` from `@protostar/authority` (Phase 2 producer); for
    constructing the brand directly without the full envelope path, the test
    can either (a) call `authorizeWorkspaceOp` with a minimal valid envelope, or
    (b) cast a constructed object to `AuthorizedWorkspaceOp` if testing the
    adapter in isolation. Prefer (a) for realism; (b) only if (a) requires
    more setup than the adapter test should carry — document in test comment.

    Test cases:
    - **read-happy:** seed file via fixture, `readFile(op)` returns expected bytes.
    - **write-happy:** `writeFile(op, bytes)` creates file; subsequent `readFile` returns same bytes.
    - **delete-happy:** seed file, `deleteFile(op)` removes it; `readFile` then throws ENOENT-flavored `FsAdapterError`.
    - **escape-attempt:** craft an op whose `path` resolves outside `workspace.root` (e.g., `../../etc/passwd` resolved). Expect `FsAdapterError` with `reason: "escape-attempt"`.
    - **symlink-refusal-read:** seed a symlink via `dirtyFiles`+`symlinks` option in fixture; `readFile` throws with `reason: "symlink-refusal"`.
    - **symlink-refusal-write:** seed a symlink at the target path; `writeFile` throws (don't follow into the linked file).
    - **canonicalization-mismatch:** construct an op where `op.path` is non-canonical (e.g., contains `./` or `//`); adapter detects mismatch and throws (this guards against post-mint mutation; the brand-mint should produce canonical paths, so any test op must be hand-crafted via type assertion).
    - **access-mismatch:** op with `access: "read"` passed to `writeFile` throws `reason: "access-mismatch"`.

    All tests fail initially (RED) — `fs-adapter.ts` doesn't exist yet.
  </behavior>
  <action>
    Create `packages/repo/src/fs-adapter.test.ts` with tests above. Run:
    ```bash
    pnpm --filter @protostar/repo test 2>&1 | grep -E "fail|pass" | head
    ```
    Expect 8 failures (one per test). Commit RED state with message
    `test(03-05): add failing fs-adapter contract`.

    Note: tests will fail to compile because `fs-adapter.ts` doesn't exist. The
    "RED" here is build failure — that counts. Document the exact compile
    error in the commit message body.
  </action>
  <verify>
    <automated>! pnpm --filter @protostar/repo build 2&gt;/dev/null</automated>
  </verify>
  <done>Test file exists, 8 test cases written, build fails (no fs-adapter.ts yet) — RED state committed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (GREEN): Implement fs-adapter to satisfy the suite</name>
  <files>packages/repo/src/fs-adapter.ts</files>
  <action>
    Implement per `<interfaces>` block in context. Follow PATTERNS.md analog
    closely. Imports:
    ```typescript
    import { lstat, readFile as fsReadFile, writeFile as fsWriteFile, unlink } from "node:fs/promises";
    import { resolve, relative, isAbsolute } from "node:path";
    import type { AuthorizedWorkspaceOp } from "@protostar/authority";
    ```

    Order of checks per call:
    1. Access discrimination (`op.access` vs operation).
    2. Path canonical equality (`resolve(op.path) === op.path` if mint stores
       absolute; verify by reading `workspace-op.ts` mint).
    3. Workspace containment (`!relative(op.workspace.root, reResolved).startsWith("..")`).
    4. `lstat` symlink refusal (skip for `writeFile` if target doesn't exist).
    5. Actual `node:fs/promises` call, wrapping errors in `FsAdapterError`
       with `reason: "io-error"` and `cause`.

    Run `pnpm --filter @protostar/repo test`. Expect 8/8 GREEN. Commit:
    `feat(03-05): implement fs-adapter brand-consumer with belt-and-suspenders checks`.

    If any test fails on first run, debug surgically — do NOT loosen tests; if
    a test seems wrong (e.g., access-mismatch semantics), revisit `<interfaces>`
    and document the deviation.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>8/8 fs-adapter tests pass. Implementation imports only `node:fs/promises`, `node:path`, and `@protostar/authority` types. Two commits in git log: RED then GREEN.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Brand → adapter | Phase 2 mints brand; Phase 3 adapter is the consumer. Re-canonicalize as suspenders even if mint should have done belt. |
| Workspace path → filesystem | Caller-controlled path could escape workspace; adapter is the last line of defense before `node:fs`. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-05-01 | Tampering | Path traversal via `../../etc/passwd` | mitigate | `path.relative(workspace.root, reResolved).startsWith("..")` rejection (test escape-attempt). |
| T-03-05-02 | Information Disclosure | Symlink TOCTOU follows to outside-workspace target | mitigate | `lstat` first; refuse `isSymbolicLink()`. Combined with Plan 06 tree audit at clone time. (Pitfall 4) |
| T-03-05-03 | Tampering | Brand mutation between mint and adapter (canonical path edited) | mitigate | Re-canonicalize on entry; assert equality with `op.path`; throw `canonicalization-mismatch` (test). |
| T-03-05-04 | Elevation of Privilege | `writeFile` called with `access: "read"` op | mitigate | Access-discrimination check; throw `access-mismatch`. |
| T-03-05-05 | Tampering | TOCTOU between `lstat` and `writeFile`/`readFile` (symlink replaced) | accept | Mitigation cost (open-then-stat-fd, race-free) is high; Phase 3 v1 accepts the residual risk; combined with clone-time audit it's ALARP for the threat model. Document in CONCERNS.md addendum if surfaced in review. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-03 (FS caps enforced; paths outside workspace refused at repo layer).
- **Sample frequency:** RED commit + GREEN commit + per-task `pnpm --filter @protostar/repo test`.
- **Observability:** Each `FsAdapterError` reason is enumerated; tests assert on `.reason`, not just throw.
- **Nyquist:** 8 tests cover all five rejection reasons + happy paths; <30s wall clock.
</validation_strategy>

<verification>
- `pnpm --filter @protostar/repo test` green; ≥8 fs-adapter tests
- `git log --oneline | head -5` shows RED then GREEN commits
- Adapter has no imports from `@protostar/authority` runtime (types only)
</verification>

<success_criteria>
- `readFile`/`writeFile`/`deleteFile` exported, accepting `AuthorizedWorkspaceOp`
- `FsAdapterError` with five enumerated reasons
- Test suite covers each reason + happy paths
- TDD discipline: RED commit then GREEN commit
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-05-SUMMARY.md` with: test count by category, FsAdapterError reason enum, any deviations from PATTERNS.md analog and why.
</output>
