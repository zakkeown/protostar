# Phase 3: Repo Runtime + Sandbox — Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 28 (19 new, 9 modified)
**Analogs found:** 26 / 28

---

## File Classification

### New files

| New file | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `packages/repo/src/clone-workspace.ts` | repo-runtime / git wrapper | request-response (network → FS) | `packages/authority/src/workspace-trust/predicate.ts` (predicate result shape) + `packages/repo/src/workspace-trust-runtime.ts` (error class + brand-consume shape) | role-match |
| `packages/repo/src/symlink-audit.ts` | FS audit | batch (tree walk → refusal[]) | `packages/repo/src/workspace-trust-runtime.ts` (error-class+result pattern) | role-match |
| `packages/repo/src/fs-adapter.ts` | brand consumer / FS adapter | request-response | `packages/authority/src/stage-reader/fs-adapter.ts` (interface) + `packages/authority/src/authorized-ops/workspace-op.ts` (brand consumption shape) | exact (interface), role-match (consumer) |
| `packages/repo/src/apply-change-set.ts` | patch pipeline | transform (bytes→bytes) | `packages/intent/src/confirmed-intent.ts` parse pattern (per-item result list) | partial |
| `packages/repo/src/dirty-worktree-status.ts` | status query | request-response | `packages/repo/src/workspace-trust-runtime.ts` (predicate-result shape) | role-match |
| `packages/repo/src/subprocess-runner.ts` | brand consumer / process spawn | streaming (stdout/stderr → file + tail) | `packages/authority/src/authorized-ops/subprocess-op.ts` (consumption shape) | role-match |
| `packages/repo/src/subprocess-allowlist.ts` | const + intersect | pure | `packages/authority/src/repo-policy/parse.ts` `DENY_ALL_REPO_POLICY` constant + `parseRepoPolicy` validator | exact |
| `packages/repo/src/subprocess-schemas/git.ts` | per-command schema | pure | `packages/authority/src/repo-policy/parse.ts` (typed-record + read-helpers pattern) | role-match |
| `packages/repo/src/subprocess-schemas/pnpm.ts` | per-command schema | pure | same as `git.ts` | role-match |
| `packages/repo/src/subprocess-schemas/node.ts` | per-command schema | pure | same as `git.ts` | role-match |
| `packages/repo/src/subprocess-schemas/tsc.ts` | per-command schema | pure | same as `git.ts` | role-match |
| `packages/repo/src/repo-policy.ts` (extension) | config parser | pure | `packages/authority/src/repo-policy/parse.ts` (full template) | exact |
| `packages/repo/internal/test-fixtures/build-sacrificial-repo.ts` | test fixture builder | batch (init → commit → branch) | `packages/intent/src/internal/brand-witness.ts` (subpath export discipline only — fixture builder has no analog) | partial |
| `packages/repo/schema/repo-runtime-admission-decision.schema.json` | JSON schema | static | `packages/repo/schema/workspace-trust-admission-decision.schema.json` | exact |
| `packages/paths/package.json` | package skeleton | — | `packages/dogpile-types/package.json` (smallest skeleton, zero workspace deps) | exact |
| `packages/paths/src/index.ts` | utility | pure | `packages/repo/src/index.ts` (24-line re-export skeleton) | role-match |
| `packages/paths/src/resolve-workspace-root.ts` | utility / FS walk | request-response (stat-walk) | none — first stat-walking utility in repo | none |
| `packages/admission-e2e/src/repo-runtime-*.contract.test.ts` (multiple) | contract tests | — | `packages/admission-e2e/src/authorized-workspace-op-mint.contract.test.ts` + `signed-confirmed-intent.e2e.test.ts` | exact |
| `.env.example` (root) | config doc | static | none (new file) | none |

### Modified files

| Modified file | Role | Closest analog | Match |
|---|---|---|---|
| `packages/repo/src/index.ts` | barrel | current file (extend it) | self |
| `packages/repo/package.json` | manifest | current file + `packages/intent/package.json` (subpath-export pattern for `./internal/test-fixtures` and new schema) | exact |
| `packages/dogpile-adapter/package.json` | manifest | self (replace one dep line) | self |
| `apps/factory-cli/src/main.ts` (lines ~150, 199, 605–632) | composition root | self | self |
| `packages/intent/schema/confirmed-intent.schema.json` | JSON schema | self | self |
| `packages/intent/src/confirmed-intent.ts` | brand mint | self | self |
| `.planning/PROJECT.md` | doc | self | self |
| `AGENTS.md` | doc | self | self |
| `.gitignore` | config | self | self |

---

## Pattern Assignments

### `packages/repo/src/clone-workspace.ts` (repo-runtime / git wrapper)

**Analog:** `packages/repo/src/workspace-trust-runtime.ts` (error class + brand-consume shape) and `packages/authority/src/workspace-trust/predicate.ts` (result discriminated union).

**Imports / shape pattern** (`workspace-trust-runtime.ts:1-9`):
```typescript
import {
  assertTrustedWorkspaceForGrant,
  type AccessLevel,
  type ExecutionScope,
  type TrustRefusalEvidence
} from "@protostar/authority";

import type { WorkspaceRef } from "./index.js";
```

**Error class pattern** (`workspace-trust-runtime.ts:10-20`):
```typescript
export class WorkspaceTrustError extends Error {
  constructor(
    public readonly workspace: WorkspaceRef,
    public readonly requestedAccess: AccessLevel,
    public readonly evidence: TrustRefusalEvidence
  ) {
    super(`workspace-trust runtime refusal: ${workspace.root} cannot ${requestedAccess} (trust=${workspace.trust})`);
  }
}
```

**Differences to note:**
- New file imports `isomorphic-git` (`clone`, plus `http/node` and `node:fs`). First file in repo to import `isomorphic-git`; no existing import precedent — see RESEARCH.md §Standard Stack.
- `onAuth` callback is novel (no analog) — encapsulate the `credentialRef → process.env[ref]` lookup behind a separate small fn so it's testable without a real network.
- Return shape mirrors `assertTrustedWorkspaceForGrant`'s discriminated union: `{ ok: true, workspace: WorkspaceRef, auth: { mode, credentialRef? } } | { ok: false, errors: readonly string[] }`.

---

### `packages/repo/src/fs-adapter.ts` (brand consumer / FS adapter)

**Primary analog:** `packages/authority/src/stage-reader/fs-adapter.ts` (interface shape).

**Existing FsAdapter interface** (`stage-reader/fs-adapter.ts:1-4`):
```typescript
export interface FsAdapter {
  readFile(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}
```

**Secondary analog (brand consumption):** `packages/authority/src/authorized-ops/workspace-op.ts:8-21`:
```typescript
export interface AuthorizedWorkspaceOpData {
  readonly workspace: WorkspaceRef;
  readonly path: string;
  readonly access: "read" | "write" | "execute";
  readonly resolvedEnvelope: CapabilityEnvelope;
}

export type AuthorizedWorkspaceOp = AuthorizedWorkspaceOpData & {
  readonly [AuthorizedWorkspaceOpBrand]: true;
};
```

**Error class pattern (reuse `workspace-trust-runtime.ts:10-20` shape):** new file should export `FsAdapterError` with `readonly op: AuthorizedWorkspaceOp` and `readonly reason: string`.

**Differences to note:**
- Phase 2 stage-reader adapter is read-only (`readFile`, `exists`). Phase 3 adapter takes `AuthorizedWorkspaceOp` and exposes `readFile(op)`, `writeFile(op, bytes)`, `deleteFile(op)`.
- Belt-and-suspenders (Q-05): adapter must call `path.resolve(op.path)` and assert the resolved path equals `op.path` AND that it's prefix-contained in `op.workspace.root`. Then `lstat(op.path)` and refuse on `dirent.isSymbolicLink()` (Q-06).
- Imports `node:fs/promises` (`readFile`, `writeFile`, `lstat`, `unlink`) and `node:path` (`resolve`, `relative`). No analog uses these in this combination.

---

### `packages/repo/src/symlink-audit.ts` (post-clone tree walk)

**Analog:** `packages/repo/src/workspace-trust-runtime.ts` (refusal-evidence + result-union shape only — no tree-walk analog exists).

**Result shape pattern** (`workspace-trust-runtime.ts:28-38`):
```typescript
export function assertWorkspaceTrust(op: RuntimeWorkspaceOp): void {
  const result = assertTrustedWorkspaceForGrant({ /* ... */ });
  if (!result.ok) {
    throw new WorkspaceTrustError(op.workspace, op.requestedAccess, result.evidence);
  }
}
```

**Recommended shape (no analog):**
```typescript
export interface SymlinkAuditResult {
  readonly ok: boolean;
  readonly offendingPaths: readonly string[]; // workspace-relative
}
export async function auditSymlinks(workspaceRoot: string): Promise<SymlinkAuditResult>;
```

**Differences to note:**
- Use `fs.readdir(root, { recursive: true, withFileTypes: true })` then `dirent.isSymbolicLink()` (per RESEARCH.md — faster than per-path `lstat`). No existing repo file uses `readdir` recursively.
- Refusal-artifact shape must align with `apps/factory-cli/src/main.ts:726-753` `writeRefusalArtifacts` (see Shared Pattern: Refusal Triple-Write).

---

### `packages/repo/src/apply-change-set.ts` (patch pipeline)

**Analog:** weak — `packages/intent/src/confirmed-intent.ts` per-item parse result aggregation (no direct match).

**Per-item result-array pattern** matching CONTEXT.md Q-12:
```typescript
export type ApplyResult = {
  readonly path: string;
  readonly status: "applied" | "skipped-hash-mismatch" | "skipped-error";
  readonly error?: string;
};
export async function applyChangeSet(
  fsAdapter: FsAdapter,
  patches: readonly PatchRequest[]
): Promise<readonly ApplyResult[]>;
```

**Pipeline (from RESEARCH.md §CONFLICT-01 sketch):** sha256 verify → `diff.parsePatch` → `diff.applyPatch` → `fsAdapter.writeFile`. **NOT `isomorphic-git.apply` — that API does not exist.** This is the load-bearing CONFLICT-01 deviation; planner must surface in CONTEXT.md errata before coding.

**Imports (no analog):**
- `import { parsePatch, applyPatch } from "diff";` (first use in repo)
- `import { createHash } from "node:crypto";` (used in `packages/authority/src/signature/...` — search there for sha256 idiom)

**Differences to note:**
- Binary file detection: pre-screen patch text for `^Binary files ` header → record `{status: "skipped-error", error: "binary-not-supported"}`. Document in CONCERNS.md.

---

### `packages/repo/src/dirty-worktree-status.ts`

**Analog:** none direct. Result shape mirrors `workspace-trust-runtime.ts` predicate style.

**Required filter (RESEARCH.md CONFLICT-02 — load-bearing):**
```typescript
const FILE = 0, HEAD = 1, WORKDIR = 2, STAGE = 3;
const dirtyRows = matrix.filter(row =>
  row[HEAD] === 1 && (row[WORKDIR] !== row[HEAD] || row[STAGE] !== row[HEAD])
);
const isDirty = dirtyRows.length > 0;
```

**Differences to note:** naive `matrix.length > 0` is a known bug — it would fire on every fresh clone. Plan must call this filter out explicitly.

---

### `packages/repo/src/subprocess-runner.ts` (brand consumer / spawn)

**Analog:** `packages/authority/src/authorized-ops/subprocess-op.ts` (brand-consumption shape only — runner is novel).

**Brand input shape** (`subprocess-op.ts:5-13`):
```typescript
export interface AuthorizedSubprocessOpData {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly resolvedEnvelope: CapabilityEnvelope;
}
```

**Existing shell-metacharacter guard** (`subprocess-op.ts:30-32`) — Phase 3 layered guard reuses this exact regex on top of per-command schemas:
```typescript
if (input.command.includes(" ") || /[;&|`$<>]/.test(input.command)) {
  errors.push(`subprocess command "${input.command}" must not contain shell metacharacters`);
}
```

**Differences to note:**
- Imports `node:child_process` `spawn` (array form, `{shell: false}` — never `exec`/`execSync`). No existing `@protostar/repo` file spawns.
- Streams `child.stdout.pipe(createWriteStream(...))` to `runs/{id}/subprocess/{n}-stdout.log`; ring-buffer last N KB into admission decision.
- Returns `{ argv, exitCode, durationMs, stdoutPath, stderrPath, stdoutTail, stderrTail, stdoutBytes, stderrBytes }` (CONTEXT.md Q-09).

---

### `packages/repo/src/subprocess-allowlist.ts`

**Analog:** `packages/authority/src/repo-policy/parse.ts` `DENY_ALL_REPO_POLICY` baseline-constant pattern.

**Frozen-constant pattern** (`repo-policy/parse.ts:29-34, 155-165`):
```typescript
export const DENY_ALL_REPO_POLICY: RepoPolicy = deepFreeze({
  schemaVersion: "1.0.0",
  allowedScopes: [],
  deniedTools: [],
  trustOverride: "untrusted"
});

function deepFreeze<T>(value: T): T { /* ... */ }
```

**Apply to:**
```typescript
export const SUBPROCESS_BASELINE_ALLOWLIST = Object.freeze(["git", "pnpm", "node", "tsc"] as const);
export function intersectAllowlist(policyExtension?: readonly string[]): readonly string[];
```

**Differences to note:** policy may add (union) but never remove (Q-07). Mirror `parseRepoPolicy`'s `readOptionalStringArray` for the policy-side `commandAllowlist?: string[]` field.

---

### `packages/repo/src/subprocess-schemas/{git,pnpm,node,tsc}.ts`

**Analog:** `packages/authority/src/repo-policy/parse.ts` typed-record + key-set + reject-unknown pattern.

**Pattern** (`repo-policy/parse.ts:36-37, 138-149`):
```typescript
const TOP_LEVEL_KEYS = new Set(["schemaVersion", "allowedScopes", /* ... */]);
const BUDGET_CAP_KEYS = new Set(["maxUsd", "maxTokens", "timeoutMs", "maxRepairLoops"]);

function rejectUnknownKeys(record, allowedKeys, prefix, errors) {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) errors.push(`${prefix}${key} is not allowed.`);
  }
}
```

**Apply to (each schema file):**
```typescript
export const GIT_SCHEMA = Object.freeze({
  allowedSubcommands: Object.freeze(["clone", "checkout", "branch", "status"] as const),
  allowedFlags: Object.freeze({
    clone: Object.freeze(["--depth", "--single-branch", "--branch"] as const),
    /* ... */
  }),
  refValuePattern: /^[a-zA-Z0-9._/-]+$/
});
```

**Differences to note:** Q-08 mandates `--` separator before user-controlled values. Each schema also publishes a `refValuePattern` regex for the outer pattern guard.

---

### `packages/repo/internal/test-fixtures/build-sacrificial-repo.ts`

**Analog:** `packages/intent/src/internal/brand-witness.ts` — subpath-export discipline only (the file's content is a single re-export; not analogous to a fixture builder).

**Discipline header** (`brand-witness.ts:1-12`) — copy verbatim, adapt wording:
```typescript
// ============================================================================
// PRIVATE SUBPATH — packages/repo tests + admission-e2e ONLY. NOT a public API.
//
// Programmatic builder for sacrificial git repos used in Phase 3 contract
// tests. Backed by isomorphic-git init/commit/branch over a tmpdir. Output
// path returned to caller; cleanup via `t.after(() => fs.rm(...))`.
//
// Phase N may relocate or remove this file without notice.
// ============================================================================
```

**Subpath export pattern** (`packages/intent/package.json:41-44`):
```json
"./internal/brand-witness": {
  "types": "./dist/internal/brand-witness.d.ts",
  "import": "./dist/internal/brand-witness.js"
}
```

**Apply to `packages/repo/package.json`:**
```json
"./internal/test-fixtures": {
  "types": "./dist/internal/test-fixtures/build-sacrificial-repo.d.ts",
  "import": "./dist/internal/test-fixtures/build-sacrificial-repo.js"
}
```

**Differences to note:** unlike `brand-witness.ts` (a pure type re-export), this file is implementation-bearing — uses `isomorphic-git`, `node:fs/promises`, `node:os.tmpdir()`, `crypto.randomUUID()` (no `nanoid` dep — RESEARCH.md).

---

### `packages/repo/schema/repo-runtime-admission-decision.schema.json`

**Analog:** `packages/repo/schema/workspace-trust-admission-decision.schema.json` (exact — same package, same gate-decision shape).

**Full template to copy and adapt** (lines 1-35 of analog):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://protostar.local/schema/repo-runtime-admission-decision.schema.json",
  "title": "RepoRuntimeAdmissionDecision",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "runId", "gate", "outcome", "timestamp", "precedenceResolution", "evidence"],
  "properties": {
    "schemaVersion": { "const": "1.0.0" },
    "runId": { "type": "string", "pattern": "^run-[A-Za-z0-9_-]+$" },
    "gate": { "const": "repo-runtime" },
    "outcome": { "enum": ["allow", "block", "escalate"] },
    "timestamp": { "type": "string", "format": "date-time" },
    "precedenceResolution": { /* identical to analog */ },
    "evidence": {
      "type": "object",
      "additionalProperties": false,
      "required": ["workspaceRoot", "auth", "effectiveAllowlist"],
      "properties": {
        "workspaceRoot": { "type": "string" },
        "auth": {
          "type": "object",
          "additionalProperties": false,
          "required": ["mode"],
          "properties": {
            "mode": { "enum": ["credentialRef", "system", "anonymous"] },
            "credentialRef": { "type": "string" }
          }
        },
        "effectiveAllowlist": { "type": "array", "items": { "type": "string" } },
        "symlinkRefusal": { "type": "object" },
        "patchResults": { "type": "array" },
        "subprocessRecords": { "type": "array" }
      }
    }
  }
}
```

**Differences to note:** evidence shape is richer than workspace-trust (multi-aspect — auth, allowlist, patch results, subprocess records). Each subfield's exact shape is locked by Q-04, Q-07, Q-09, Q-12.

---

### `packages/paths/package.json` (new package skeleton)

**Analog:** `packages/dogpile-types/package.json` (smallest skeleton, zero workspace deps).

**Full template** (verbatim):
```json
{
  "name": "@protostar/paths",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "test": "pnpm run build && node --test dist/*.test.js",
    "typecheck": "tsc -b --pretty false"
  },
  "sideEffects": false
}
```

**Differences to note:** zero `dependencies` block (paths walks FS via `node:fs` only — Q-15 scope ceiling). Add `tsconfig.json` mirroring `packages/dogpile-types/tsconfig.json`.

---

### `packages/paths/src/resolve-workspace-root.ts`

**Analog:** none — first stat-walking utility in repo.

**Recommended shape:**
```typescript
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function resolveWorkspaceRoot(startDir: string = process.cwd()): string {
  let cur = resolve(startDir);
  while (true) {
    if (existsSync(resolve(cur, "pnpm-workspace.yaml"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) throw new Error(`No pnpm-workspace.yaml ancestor of ${startDir}`);
    cur = parent;
  }
}
```

**Differences to note:** synchronous on purpose (consumers — `apps/factory-cli/src/main.ts:172, 199` — are sync at call site). No I/O beyond `existsSync`. AGENTS.md carve-out scope ceiling: **path resolution only — no business logic**.

---

### `packages/admission-e2e/src/repo-runtime-*.contract.test.ts` (multiple new contract tests)

**Analogs:**
- Brand-mint surface tests: `authorized-workspace-op-mint.contract.test.ts` (full file, lines 1-64) and `authorized-subprocess-op-mint.contract.test.ts` (full file, lines 1-58).
- E2E refusal-evidence tests: `signed-confirmed-intent.e2e.test.ts` (path-pattern reference; not read above but established as the E2E pattern in the package).

**Surface-pin pattern** (`authorized-workspace-op-mint.contract.test.ts:10-34`):
```typescript
type AuthoritySurface = typeof AuthorityPublicApi;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type ReturnsBrand<K extends keyof AuthoritySurface> = /* ... */;
type MintingKeys = { [K in keyof AuthoritySurface]: ReturnsBrand<K> extends true ? K : never; }[keyof AuthoritySurface];

type _SurfacePinned = Assert<Equal<MintingKeys, "authorizeWorkspaceOp">>;
```

**Barrel-walking + leak-check pattern** (lines 40-58):
```typescript
describe("@protostar/authority - AuthorizedWorkspaceOp mint surface", () => {
  it("public producer is authorizeWorkspaceOp at runtime", () => {
    assert.equal(typeof AuthorityPublicApi.authorizeWorkspaceOp, "function");
  });
  it("mintAuthorizedWorkspaceOp is not on public barrels", async () => {
    for await (const barrelPath of walkPublicBarrels()) {
      const contents = await readAll(barrelPath);
      assert.equal(contents.includes("mintAuthorizedWorkspaceOp"), false, `mint leaked at ${barrelPath}`);
    }
  });
});
```

**Required Phase 3 contract tests (CONTEXT.md `<integration_points>`):**
- `repo-runtime-dirty-worktree-refusal.contract.test.ts`
- `repo-runtime-symlink-refusal.contract.test.ts`
- `repo-runtime-subprocess-allowlist-refusal.contract.test.ts`
- `repo-runtime-patch-apply-best-effort.contract.test.ts` (3-of-5 partial result, per Q-12)
- `repo-runtime-hash-mismatch-refusal.contract.test.ts` (mutate pre-image between hash and apply)

**Differences to note:** Phase 3 tests assert *evidence shapes* in admission-decision JSON, not just brand surface. Use `buildSacrificialRepo` from `@protostar/repo/internal/test-fixtures` rather than fixture files on disk.

---

### `apps/factory-cli/src/main.ts` (modifications)

**Analog:** self.

**Lines 172 + 199 — replace `INIT_CWD ?? cwd()`:**
```typescript
// Before:
const workspaceRoot = process.env["INIT_CWD"] ?? process.cwd();
// After:
import { resolveWorkspaceRoot } from "@protostar/paths";
const workspaceRoot = resolveWorkspaceRoot();
```

**Lines 605-632 (referenced in original prompt as `writeRefusalArtifacts`) — actual location lines 726-753:** do **not** modify; this is the canonical refusal-triple-write helper Phase 3 *consumes*. Patch-apply hash-mismatch failures and symlink-audit refusals call this exact function with `stage`/`reason`/`refusalArtifact` matching the new admission-decision schema.

---

### `packages/intent/schema/confirmed-intent.schema.json` (1.1.0 → 1.2.0)

**Analog:** self.

**Current version pin** (line 21):
```json
"schemaVersion": { "const": "1.1.0" }
```

**Bump to:**
```json
"schemaVersion": { "const": "1.2.0" }
```

**Add additive field under `capabilityEnvelope.workspace`** (Q-14). Note: current schema declares `capabilityEnvelope` as a free-form `{ "type": "object" }` (line 32); the strong shape lives in `packages/intent/src/capability-envelope.ts`. The schema bump is real (the version), but the structural change is in the TypeScript shape + parser — see next entry.

---

### `packages/intent/src/confirmed-intent.ts` + `capability-envelope.ts` (`allowDirty`)

**Analog:** self — `packages/intent/src/capability-envelope.ts:5-9` `RepoScopeGrant` interface.

**Current shape** (`capability-envelope.ts:82-87`):
```typescript
export interface CapabilityEnvelope {
  readonly repoScopes: readonly RepoScopeGrant[];
  readonly toolPermissions: readonly ToolPermissionGrant[];
  readonly executeGrants?: readonly ExecuteGrant[];
  readonly budget: FactoryBudget;
}
```

**Add (Q-14) — new `workspace` sub-object:**
```typescript
export interface CapabilityEnvelopeWorkspace {
  readonly allowDirty: boolean;
}

export interface CapabilityEnvelope {
  // ...existing...
  readonly workspace?: CapabilityEnvelopeWorkspace; // default { allowDirty: false }
}
```

**Differences to note:** `parseCapabilityEnvelope` must default `allowDirty` to `false` when `workspace` is absent (CONTEXT.md Q-14 explicit). `confirmed-intent.ts:44` `schemaVersion` literal type bumps to `"1.2.0"`. Brand-mint and `validateConfirmedIntent` in `stage-reader/factory.ts:200-210` upconvert path needs a 1.1.0→1.2.0 case (default-fill `workspace.allowDirty: false`).

---

### `packages/dogpile-adapter/package.json`

**Analog:** self.

**Current** (line 19-23):
```json
"dependencies": {
  "@protostar/dogpile-types": "workspace:*",
  "@protostar/intent": "workspace:*",
  "@protostar/planning": "workspace:*"
}
```

**The original prompt referenced `link:../../../dogpile` at line 21 — that line is not present in the current manifest.** The `link:` may have already been removed, or the prompt refers to a sibling `dogpile-types` package internal manifest. Verify by grep before editing:
```bash
grep -rn 'link:' /Users/zakkeown/Code/protostar/packages/dogpile*
```
If `link:` survives somewhere, replace with `"@dogpile/sdk": "0.2.0"` (RESEARCH.md verified version). If absent, decision Q-16 may be a no-op for this manifest and the dep instead lands on `@protostar/dogpile-types` re-export.

---

### `packages/repo/package.json` (modifications)

**Analog:** self + `packages/intent/package.json` (subpath-export idiom).

**Current `dependencies`** (line 21-23):
```json
"dependencies": {
  "@protostar/authority": "workspace:*"
}
```

**Add (RESEARCH.md):**
```json
"dependencies": {
  "@protostar/authority": "workspace:*",
  "@protostar/paths": "workspace:*",
  "isomorphic-git": "1.37.6",
  "diff": "9.0.0"
}
```

**Add subpath exports** (mirror `packages/intent/package.json:41-49`):
```json
"./internal/test-fixtures": {
  "types": "./dist/internal/test-fixtures/build-sacrificial-repo.d.ts",
  "import": "./dist/internal/test-fixtures/build-sacrificial-repo.js"
},
"./schema/repo-runtime-admission-decision.schema.json": "./schema/repo-runtime-admission-decision.schema.json"
```

---

## Shared Patterns

### Refusal Triple-Write
**Source:** `apps/factory-cli/src/main.ts:726-753` `writeRefusalArtifacts`.
**Apply to:** all Phase 3 refusal sites — patch-apply hash mismatch, symlink audit, subprocess allowlist denial, dirty-worktree refusal.
```typescript
async function writeRefusalArtifacts(input: {
  readonly runDir: string;
  readonly outDir: string;
  readonly runId: string;
  readonly stage: RefusalStage;
  readonly reason: string;
  readonly refusalArtifact: string;
}): Promise<void> {
  await mkdir(input.runDir, { recursive: true });
  const terminalStatus = buildTerminalStatusArtifact({ /* ... */ });
  await writeJson(resolve(input.runDir, TERMINAL_STATUS_ARTIFACT_NAME), terminalStatus);
  const refusalsIndexPath = resolveRefusalsIndexPath(input.outDir);
  await appendRefusalIndexEntry(refusalsIndexPath, { /* ... */ });
}
```
Phase 3 callers pass new `RefusalStage` literals (e.g., `"repo-clone"`, `"symlink-audit"`, `"patch-apply"`, `"subprocess-runner"`).

### Brand Consumption
**Source:** `packages/authority/src/authorized-ops/{workspace-op,subprocess-op}.ts`.
**Apply to:** `fs-adapter.ts`, `subprocess-runner.ts`.
- Receive op as `AuthorizedWorkspaceOp` / `AuthorizedSubprocessOp` (already minted by `@protostar/authority`).
- Consumers re-validate at entry (Q-05 belt-and-suspenders) — for FS: `path.resolve` equality + envelope-prefix containment + `lstat` symlink check. For subprocess: outer pattern guard + per-command schema lookup.
- Never mint the brand inside `@protostar/repo` — module-private mint stays in authority.

### Result-Union Discriminator
**Source:** `packages/authority/src/repo-policy/parse.ts:16-18`, `packages/authority/src/authorized-ops/workspace-op.ts:23-25`.
**Apply to:** every Phase 3 entry point that can refuse.
```typescript
export type ResultName =
  | { readonly ok: true; readonly /* payload */; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };
```
Throw `*Error` classes only at adapter boundaries (FS adapter, subprocess runner) where caller cannot meaningfully branch. Pure parsers/validators return the union.

### Deep Freeze
**Source:** `packages/authority/src/repo-policy/parse.ts:155-165`.
**Apply to:** `subprocess-allowlist.ts` baseline const, all per-command schemas.
```typescript
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const v of Object.values(value)) deepFreeze(v);
  return Object.freeze(value);
}
```

### Stage-Reader Extension
**Source:** `packages/authority/src/stage-reader/factory.ts:31-115`.
**Apply to (optional, Phase 3 may add):** `createRepoRuntimeStageReader(runDir, fs)` exposing `repoRuntimeAdmissionDecision()`. If added, register the gate literal in `factory.ts:241-247` `isGateName` (literal `"repo-runtime"`).

### Subpath-Export Discipline
**Source:** `packages/intent/src/internal/brand-witness.ts:1-12` (header) + `packages/intent/package.json:41-44` (export).
**Apply to:** `packages/repo/internal/test-fixtures/build-sacrificial-repo.ts`.

---

## No Analog Found

| File | Why no analog |
|---|---|
| `packages/paths/src/resolve-workspace-root.ts` | First stat-walking utility — no FS-walk precedent in repo. Use the recommended shape above. |
| `.env.example` | First env-var documentation file in repo. |
| `packages/repo/src/clone-workspace.ts` (network I/O specifics) | First file to use `isomorphic-git` clone + `onAuth`. RESEARCH.md §Standard Stack is the only reference. |
| `packages/repo/src/apply-change-set.ts` (patch mechanics) | First file to use `diff` library. CONFLICT-01 in RESEARCH.md is load-bearing — `isomorphic-git.apply` does not exist. |

---

## Metadata

**Analog search scope:** `packages/repo/`, `packages/authority/`, `packages/intent/`, `packages/admission-e2e/`, `apps/factory-cli/src/main.ts`.
**Files scanned:** ~25 (full reads on 12, targeted greps on 13).
**Pattern extraction date:** 2026-04-27.
**Open conflicts surfaced for planner:**
1. RESEARCH.md CONFLICT-01 — Q-10 mechanism (`isomorphic-git.apply`) does not exist; `diff@9.0.0` substitution required.
2. RESEARCH.md CONFLICT-02 — `statusMatrix` filter for `--untracked-files=no` semantics is non-trivial.
3. Original prompt referenced `packages/dogpile-adapter/package.json:21` `link:` line — **not present in current manifest**; planner must re-grep before editing.
