---
phase: 02-authority-governance-kernel
plan: 09
type: execute
wave: 4
depends_on: [05, 06a, 06b, 07, 08]
files_modified:
  - packages/authority/src/stage-reader/fs-adapter.ts
  - packages/authority/src/stage-reader/factory.ts
  - packages/authority/src/stage-reader/factory.test.ts
  - packages/authority/src/workspace-trust/predicate.ts
  - packages/authority/src/workspace-trust/predicate.test.ts
  - packages/authority/src/index.ts
  - packages/repo/src/index.ts
  - packages/repo/src/workspace-trust-runtime.ts
  - packages/repo/src/workspace-trust-runtime.test.ts
  - packages/repo/package.json
  - packages/intent/src/repo-scope-admission.ts
autonomous: true
requirements:
  - GOV-03
  - GOV-04
must_haves:
  truths:
    - "`createAuthorityStageReader(runDir, fsAdapter)` returns a typed reader with methods for each gate's per-gate file + precedence + policy snapshot + admission-decisions index"
    - "Reader does try-new-then-legacy on filenames: `intent-admission-decision.json` first, falls back to `admission-decision.json` (Phase 1 emission) on ENOENT"
    - "Reader handles ConfirmedIntent schemaVersion legacy fallback: when reading a `1.0.0` ConfirmedIntent (pre-Phase 2 hard bump per Plan 03 Q-18 lock), the reader UP-CONVERTS in-memory by rewriting `schemaVersion: \"1.0.0\" → \"1.1.0\"` before calling `parseConfirmedIntent` and `verifyConfirmedIntentSignature`. Pre-Phase-2 fixtures had `signature: null` and never carried `canonicalForm`, so up-conversion is a pure schemaVersion-field rewrite with no semantic change. The 208 historical run dirs flagged in CONCERNS.md are read this way."
    - "Missing `admission-decisions.jsonl` returns `[]` (legacy run dirs predate the index — no error)"
    - "Reader validates `schemaVersion` and `gate` literal at every read; rejects mismatch"
    - "Reader calls `verifyConfirmedIntentSignature` when reading a `ConfirmedIntent` artifact (Q-17 single helper)"
    - "`assertTrustedWorkspaceForGrant(workspace, op)` is a pure predicate exported from `@protostar/authority`; consumed by `packages/repo` at execution time AND by `packages/intent`'s `repo-scope-admission` at admission time (Q-10 defense in depth)"
    - "`packages/repo` runtime trust check: `assertWorkspaceTrust(workspace, op)` refuses any write/execute when `workspace.trust !== \"trusted\"` — even if admission previously allowed (mid-run mutation/tamper detection)"
    - "Authority boundary: `@protostar/authority` STILL imports zero `node:fs`. Reader is constructed with an injected `FsAdapter`; the adapter is supplied by `apps/factory-cli` (or by `packages/repo` for stage-internal reads)."
  artifacts:
    - path: packages/authority/src/stage-reader/fs-adapter.ts
      provides: "FsAdapter interface — reader pulls bytes through this; authority package never imports node:fs"
      exports: ["FsAdapter", "FsReadResult"]
    - path: packages/authority/src/stage-reader/factory.ts
      provides: "createAuthorityStageReader(runDir, fsAdapter): AuthorityStageReader"
      exports: ["createAuthorityStageReader", "AuthorityStageReader"]
    - path: packages/authority/src/workspace-trust/predicate.ts
      provides: "assertTrustedWorkspaceForGrant pure predicate — single source of truth for trust check"
      exports: ["assertTrustedWorkspaceForGrant", "TrustAssertionResult"]
    - path: packages/repo/src/workspace-trust-runtime.ts
      provides: "Runtime trust assertion called by repo before any fs op (Phase 3 wires real ops; this plan ships the contract)"
      exports: ["assertWorkspaceTrust"]
  key_links:
    - from: packages/authority/src/stage-reader/factory.ts
      to: packages/authority/src/signature/verify.ts
      via: "stage reader calls verifyConfirmedIntentSignature on ConfirmedIntent reads"
      pattern: "verifyConfirmedIntentSignature"
    - from: packages/repo/src/workspace-trust-runtime.ts
      to: packages/authority/src/workspace-trust/predicate.ts
      via: "packages/repo reuses the authority predicate (single source of truth)"
      pattern: "assertTrustedWorkspaceForGrant"
    - from: packages/intent/src/repo-scope-admission.ts
      to: packages/authority/src/workspace-trust/predicate.ts
      via: "admission-time trust check (Q-10 defense in depth)"
      pattern: "assertTrustedWorkspaceForGrant"
---

<objective>
Wave 4 — close GOV-03 (steward boundary via stage-scoped readers) and the second half of GOV-04 (execution-time runtime trust check). Three modules ship:

1. **`AuthorityStageReader` factory** (Q-09) — typed client object with one method per per-gate decision + precedence + policy snapshot + admission-decisions index. Reader is FS-adapter-injected so `@protostar/authority` retains its zero-fs posture (Pitfall 4 + AGENTS.md authority boundary). Includes try-new-then-legacy filename fallback for the 208 historical run dirs (Pitfall 2).
2. **`assertTrustedWorkspaceForGrant` predicate** — single source of truth for "is this workspace trusted enough for this grant?" Consumed by:
   - `packages/intent/src/repo-scope-admission.ts` at admission time (existing module — extend, don't replace)
   - `packages/repo/src/workspace-trust-runtime.ts` at execution time (NEW — runtime spine, Q-10 defense in depth)
3. **`packages/repo` runtime trust check** — `assertWorkspaceTrust` refuses any write/execute op when trust mid-run does not match what was admitted. This is Phase 2's blast-radius-zero contract; Phase 3 invokes it from real fs operations.

Per Q-10: "Both — envelope-time admission + execution-time runtime check. Defense in depth." Per RESEARCH.md Architectural Responsibility Map: predicate lives in @protostar/authority; both intent (admission) and repo (runtime) call it. Single source of truth.

Per Pitfall 2 (legacy filename fallback): reader does `intent-admission-decision.json` first, falls back to `admission-decision.json`; missing JSONL index returns `[]`. **Never rename-on-read** — historical artifacts must remain bit-identical.

Per Q-17: every stage that consumes a ConfirmedIntent calls `verifyConfirmedIntentSignature`. The stage reader is the natural site for that — once a stage reads via the reader, it cannot accidentally skip verification.

Output: stage reader + runtime trust check shipped; admission-time and execution-time both call the same predicate.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/02-authority-governance-kernel/02-CONTEXT.md
@.planning/phases/02-authority-governance-kernel/02-RESEARCH.md
@.planning/phases/02-authority-governance-kernel/02-VALIDATION.md
@packages/authority/src/signature/verify.ts
@packages/authority/src/admission-decision/base.ts
@packages/authority/schema/admission-decision-base.schema.json
@packages/intent/schema/intent-admission-decision.schema.json
@packages/intent/src/repo-scope-admission.ts
@packages/repo/src/index.ts
@AGENTS.md

<interfaces>
<!-- WorkspaceRef shape from packages/repo. -->
From packages/repo/src/index.ts:
  interface WorkspaceRef { path: string; trust: "trusted" | "untrusted"; ... }

From @protostar/authority (Plans 04-06):
  - AuthorityStageReader interface (defined in this plan)
  - verifyConfirmedIntentSignature
  - GateName, AdmissionDecisionBase
  - PrecedenceDecision, PolicySnapshot

From the per-gate writers (Plan 07):
  - runs/{id}/intent-admission-decision.json (post-Phase-2)
  - runs/{id}/admission-decision.json (legacy, Phase 1; never written by new runs)
  - runs/{id}/admission-decisions.jsonl (post-Phase-2; absent on legacy runs)
  - runs/{id}/precedence-decision.json (when status ≠ no-conflict)
  - runs/{id}/policy-snapshot.json
  - runs/{id}/intent.json (signed ConfirmedIntent)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: FsAdapter + AuthorityStageReader factory with legacy fallback</name>
  <files>
    packages/authority/src/stage-reader/fs-adapter.ts,
    packages/authority/src/stage-reader/factory.ts,
    packages/authority/src/stage-reader/factory.test.ts,
    packages/authority/src/index.ts
  </files>
  <read_first>
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Pattern 2: Stage-Scoped Reader Factory" (lines ~270-292)
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Pitfall 2: Backward compat for the 208 existing run dirs"
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-09, Q-14, Q-17
    - packages/authority/src/signature/verify.ts (verifier called on ConfirmedIntent reads)
    - packages/authority/schema/admission-decision-base.schema.json + per-gate schemas (validation contract)
    - AGENTS.md §Package Boundaries (zero-fs in authority)
  </read_first>
  <behavior>
    - `FsAdapter` interface: `{ readFile(path): Promise<string>; exists(path): Promise<boolean> }` — minimal surface; consumers in factory-cli construct from `node:fs/promises`
    - `createAuthorityStageReader(runDir, fsAdapter)` returns an `AuthorityStageReader` with methods:
      - `intentAdmissionDecision()` — try `intent-admission-decision.json`; on ENOENT fall back to `admission-decision.json` (legacy); validate `schemaVersion` + `gate === "intent"` (legacy may lack gate; treat as intent)
      - `planningAdmissionDecision()`, `capabilityAdmissionDecision()`, `repoScopeAdmissionDecision()`, `workspaceTrustAdmissionDecision()` — read each per-gate file; legacy runs may lack these → return `null` (these gates didn't exist before Phase 2)
      - `precedenceDecision()` — returns `PrecedenceDecision | null` (null when file absent — most no-conflict runs)
      - `policySnapshot()` — returns `PolicySnapshot | null` (null on legacy runs)
      - `confirmedIntent()` — reads `intent.json`; calls `verifyConfirmedIntentSignature(intent, snapshot, resolvedEnvelope)` (Q-17 — verification at read site); returns `Result<VerifiedIntent, errors>` or skips verification when intent is unsigned (`signature: null` — Phase 1 fixtures)
      - `admissionDecisionsIndex()` — reads `admission-decisions.jsonl`; on ENOENT returns `[]` (legacy fallback per Pitfall 2)
    - All methods validate parsed JSON against the corresponding schema (use a hand-rolled validator matching Phase 1's pattern, or `JSON.parse` + manual structural check — no ajv dep)
    - On schema mismatch: throw a structured `StageReaderError` with `{ artifact, reason, path }`
    - Reader does NOT rename-on-read — legacy filenames remain bit-identical (Pitfall 2)
    - Authority boundary: this file uses ONLY the injected `FsAdapter`; ZERO `node:fs` imports
    - **Up-converter defensive guard (Plan 03 hard-bump compatibility):** when `confirmedIntent()` reads an `intent.json` whose `raw.schemaVersion === "1.0.0"`, the reader up-converts in-memory by rewriting `schemaVersion` to `"1.1.0"` before calling `parseConfirmedIntent`. Pre-Phase-2 fixtures had `signature: null` and never carried `canonicalForm`, so this is a pure field rewrite. **Precondition:** if `raw.schemaVersion === "1.0.0"` AND `raw.signature !== null`, throw `StageReaderError("intent.json", "legacy 1.0.0 with non-null signature is unsupported — pre-Phase-2 fixtures must have signature: null", path)`. This guard prevents silently up-converting a malformed/forged 1.0.0-with-signature artifact (1.0.0 fixtures could not have been signed because Phase 2 introduced the signer; a 1.0.0 file with a populated signature is either corruption or tampering and must fail closed).
  </behavior>
  <action>
**`packages/authority/src/stage-reader/fs-adapter.ts`:**
```ts
export interface FsAdapter {
  readFile(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}

export class StageReaderError extends Error {
  constructor(
    public readonly artifact: string,
    public readonly reason: string,
    public readonly artifactPath: string,
  ) {
    super(`stage reader: ${reason} (${artifact} at ${artifactPath})`);
  }
}
```

**`packages/authority/src/stage-reader/factory.ts`:**
```ts
import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmissionDecisionBase, GateName } from "../admission-decision/base.js";
import type { PrecedenceDecision } from "../precedence/precedence-decision.js";
import type { PolicySnapshot } from "../signature/policy-snapshot.js";
import {
  verifyConfirmedIntentSignature,
  type VerifyConfirmedIntentSignatureResult,
} from "../signature/verify.js";
import { type FsAdapter, StageReaderError } from "./fs-adapter.js";

export interface AuthorityStageReader {
  intentAdmissionDecision(): Promise<AdmissionDecisionBase>;
  planningAdmissionDecision(): Promise<AdmissionDecisionBase | null>;
  capabilityAdmissionDecision(): Promise<AdmissionDecisionBase | null>;
  repoScopeAdmissionDecision(): Promise<AdmissionDecisionBase | null>;
  workspaceTrustAdmissionDecision(): Promise<AdmissionDecisionBase | null>;
  precedenceDecision(): Promise<PrecedenceDecision | null>;
  policySnapshot(): Promise<PolicySnapshot | null>;
  confirmedIntent(): Promise<ConfirmedIntent>;
  verifyConfirmedIntent(): Promise<VerifyConfirmedIntentSignatureResult>;
  admissionDecisionsIndex(): Promise<readonly AdmissionDecisionIndexEntry[]>;
}

export function createAuthorityStageReader(runDir: string, fs: FsAdapter): AuthorityStageReader {
  return {
    async intentAdmissionDecision() {
      const newPath = `${runDir}/intent-admission-decision.json`;
      const legacyPath = `${runDir}/admission-decision.json`;
      // try new first
      if (await fs.exists(newPath)) {
        const raw = await fs.readFile(newPath);
        return validateAdmissionDecision(raw, "intent", newPath);
      }
      // legacy fallback (Pitfall 2 — never rename on read)
      if (await fs.exists(legacyPath)) {
        const raw = await fs.readFile(legacyPath);
        return validateLegacyIntentAdmissionDecision(raw, legacyPath);
      }
      throw new StageReaderError("intent-admission-decision", "neither new nor legacy file present", newPath);
    },

    async planningAdmissionDecision() {
      const p = `${runDir}/planning-admission-decision.json`;
      if (!(await fs.exists(p))) return null;
      const raw = await fs.readFile(p);
      return validateAdmissionDecision(raw, "planning", p);
    },

    // ... capabilityAdmissionDecision, repoScopeAdmissionDecision, workspaceTrustAdmissionDecision: same pattern

    async precedenceDecision() {
      const p = `${runDir}/precedence-decision.json`;
      if (!(await fs.exists(p))) return null;
      // schema validate, return parsed PrecedenceDecision (note: NOT branded — readers cannot
      // mint brand without sole producer; downstream code treats reader output as data, not branded
      // unless they re-mint via intersectEnvelopes which they cannot do at read time)
      return validatePrecedenceDecision(await fs.readFile(p), p);
    },

    async policySnapshot() {
      const p = `${runDir}/policy-snapshot.json`;
      if (!(await fs.exists(p))) return null;
      return validatePolicySnapshot(await fs.readFile(p), p);
    },

    async confirmedIntent() {
      const p = `${runDir}/intent.json`;
      const raw = await fs.readFile(p);
      // schema-validate against widened (1.0.0|1.1.0) confirmed-intent.schema.json
      // Phase 1 reader pattern — hand-rolled validator
      return validateConfirmedIntent(raw, p);
    },

    async verifyConfirmedIntent() {
      const intent = await this.confirmedIntent();
      const snapshot = await this.policySnapshot();
      if (snapshot === null) {
        return { ok: false, errors: ["policy-snapshot.json missing — cannot verify signature"], mismatch: { field: "policySnapshotHash", expected: "present", actual: "missing" } };
      }
      const precedence = await this.precedenceDecision();
      const resolvedEnvelope = precedence?.resolvedEnvelope ?? snapshot.resolvedEnvelope;
      return verifyConfirmedIntentSignature(intent, snapshot, resolvedEnvelope);
    },

    async admissionDecisionsIndex() {
      const p = `${runDir}/admission-decisions.jsonl`;
      if (!(await fs.exists(p))) return [];   // Pitfall 2 — legacy runs predate the index
      const raw = await fs.readFile(p);
      return raw.split("\n").filter(line => line.length > 0).map(parseIndexLine);
    },
  };
}

// Hand-rolled validators below; mirror the parseConfirmedIntent style at packages/intent/src/confirmed-intent.ts
```

Each validator: parses JSON, walks expected keys, checks `schemaVersion`, throws `StageReaderError` on mismatch.

**Update `packages/authority/src/index.ts`** to re-export `createAuthorityStageReader`, `AuthorityStageReader`, `FsAdapter`, `StageReaderError`.

**`packages/authority/src/stage-reader/factory.test.ts`** — uses an in-memory FsAdapter:
```ts
class InMemoryFs implements FsAdapter {
  constructor(private readonly files: Map<string, string>) {}
  async readFile(p: string) { const v = this.files.get(p); if (v === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); return v; }
  async exists(p: string) { return this.files.has(p); }
}
```

Test cases (each from VALIDATION.md GOV-05 rows):
1. **Happy path**: in-memory fs has all per-gate files + jsonl + intent.json + policy-snapshot.json → reader returns each artifact correctly
2. **Legacy run (Pitfall 2)**: in-memory fs has ONLY `admission-decision.json` (no `intent-admission-decision.json`, no `admission-decisions.jsonl`) → `intentAdmissionDecision()` succeeds via legacy fallback; `admissionDecisionsIndex()` returns `[]`; no error
3. **Missing per-gate files**: planning-admission-decision.json absent → `planningAdmissionDecision()` returns `null` (not an error)
4. **Schema mismatch**: `gate: "intent"` file has `gate: "planning"` literal → throws `StageReaderError`
5. **schemaVersion mismatch**: file has `schemaVersion: "2.0.0"` → throws (forward-incompatible)
6. **Round-trip with verify**: write a signed intent + snapshot via test-builders → reader's `verifyConfirmedIntent()` returns `ok: true`
7. **Tampered intent.json**: mutate value byte → `verifyConfirmedIntent()` returns `ok: false`
8. **Phase 1 fixture (signature: null)**: `confirmedIntent()` returns it; `verifyConfirmedIntent()` returns `ok: false` with `errors[0]` mentioning unsigned, NOT a crash
9. **No node:fs in authority**: structural assertion via grep (covered in Plan 10's regression suite)
  </action>
  <verify>
    <automated>pnpm --filter @protostar/authority test &amp;&amp; ! grep -RIn "from ['\"]node:fs['\"]\\|from ['\"]fs['\"]" packages/authority/src/</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/authority test` exits 0
    - `grep -c 'createAuthorityStageReader' packages/authority/src/stage-reader/factory.ts` >= 1
    - `grep -c 'admission-decisions.jsonl' packages/authority/src/stage-reader/factory.ts` >= 1
    - **Legacy fallback present:** `grep -c 'admission-decision.json' packages/authority/src/stage-reader/factory.ts` >= 1 (the legacy filename string used as fallback)
    - **Authority boundary regression:** `grep -RIn "from ['\"]node:fs['\"]\\|from ['\"]fs['\"]" packages/authority/src/ | grep -v '^#' | wc -l` outputs `0`
    - All 9 reader tests pass
    - **`return [];` for missing JSONL** (Pitfall 2): `grep -A2 'admission-decisions.jsonl' packages/authority/src/stage-reader/factory.ts | grep -c 'return \\[\\]'` >= 1
    - **Up-converter defensive guard test exists:** `grep -c 'legacy 1.0.0 with non-null signature unsupported\\|legacy 1.0.0 with non-null signature is unsupported' packages/authority/src/stage-reader/factory.test.ts` >= 1
  </acceptance_criteria>
  <done>Stage reader ships with FsAdapter injection (zero fs in authority), legacy fallback (Pitfall 2), Q-17 verifier hook, schema validation at read site.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: assertTrustedWorkspaceForGrant predicate + packages/repo runtime trust check + admission-time wiring</name>
  <files>
    packages/authority/src/workspace-trust/predicate.ts,
    packages/authority/src/workspace-trust/predicate.test.ts,
    packages/authority/src/index.ts,
    packages/repo/src/workspace-trust-runtime.ts,
    packages/repo/src/workspace-trust-runtime.test.ts,
    packages/repo/src/index.ts,
    packages/repo/package.json,
    packages/intent/src/repo-scope-admission.ts
  </files>
  <read_first>
    - packages/repo/src/index.ts (current WorkspaceRef shape; what's exported)
    - packages/repo/package.json (does it depend on @protostar/authority? add if not)
    - packages/intent/src/repo-scope-admission.ts (existing admission flow — extend to call the new predicate)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-10
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Architectural Responsibility Map" for the predicate ownership
    - packages/authority/src/authorized-ops/workspace-op.ts (Plan 02 — `authorizeWorkspaceOp` already includes a trust check; this plan extracts the predicate so both intent and repo can call the same logic)
  </read_first>
  <behavior>
    - `assertTrustedWorkspaceForGrant({ workspace, requestedAccess, requestedScope })` returns `{ ok: true } | { ok: false; reason: string; refusalEvidence: ... }`
    - Refuses when `requestedAccess !== "read"` AND `workspace.trust !== "trusted"` (matches Plan 02's check)
    - Also refuses when `requestedScope === "workspace"` (full workspace) AND `workspace.trust !== "trusted"` — GOV-04 success criterion ("`executionScope: \"workspace\"` grants are refused when trust ≠ `\"trusted\"`")
    - `packages/repo`'s `assertWorkspaceTrust(workspace, op)`:
      - Pure function — no fs ops happen here in Phase 2 (Phase 3 wires real repo ops calling this)
      - Calls `assertTrustedWorkspaceForGrant` from authority
      - Throws `WorkspaceTrustError` on refusal (refusal at runtime → caller halts; admission-time refusal in intent uses Result shape; runtime refusal in repo uses throw because repo ops are imperative)
    - Existing `packages/intent/src/repo-scope-admission.ts` is extended to ALSO call the predicate (admission-time half — Q-10 defense in depth). Existing behavior preserved; added rejection paths use the predicate's evidence shape.
    - `packages/authority/src/authorized-ops/workspace-op.ts` (Plan 02) is REFACTORED to call `assertTrustedWorkspaceForGrant` instead of inlining the trust check — single source of truth (Plan 02 had a duplicated predicate; this plan deduplicates).
  </behavior>
  <action>
**`packages/authority/src/workspace-trust/predicate.ts`:**
```ts
import type { WorkspaceRef } from "@protostar/repo";

export type AccessLevel = "read" | "write" | "execute";
export type ExecutionScope = "none" | "workspace-readonly" | "workspace";

export interface AssertTrustInput {
  readonly workspace: WorkspaceRef;
  readonly requestedAccess: AccessLevel;
  readonly requestedScope?: ExecutionScope;   // optional; only relevant for grant checks
}

export interface TrustRefusalEvidence {
  readonly workspacePath: string;
  readonly declaredTrust: "trusted" | "untrusted";
  readonly requestedAccess: AccessLevel;
  readonly requestedScope?: ExecutionScope;
  readonly reason: string;
}

export type TrustAssertionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly evidence: TrustRefusalEvidence };

/**
 * Single source of truth for "is this workspace trusted enough for this access?"
 * Called from:
 * - packages/intent/src/repo-scope-admission.ts at admission time (Q-10)
 * - packages/repo/src/workspace-trust-runtime.ts at execution time (Q-10)
 * - packages/authority/src/authorized-ops/workspace-op.ts via authorizeWorkspaceOp (Plan 02)
 *
 * Defense in depth — three call sites, one predicate.
 */
export function assertTrustedWorkspaceForGrant(input: AssertTrustInput): TrustAssertionResult {
  const { workspace, requestedAccess, requestedScope } = input;

  // Read access is always permitted (subject to other gates)
  if (requestedAccess === "read" && requestedScope !== "workspace") return { ok: true };

  // Anything beyond read OR a full-workspace scope requires trusted
  if (workspace.trust !== "trusted") {
    return {
      ok: false,
      evidence: {
        workspacePath: workspace.path,
        declaredTrust: workspace.trust,
        requestedAccess,
        ...(requestedScope !== undefined ? { requestedScope } : {}),
        reason: requestedScope === "workspace"
          ? `executionScope "workspace" requires trust="trusted"; got "${workspace.trust}"`
          : `${requestedAccess} access requires trust="trusted"; got "${workspace.trust}"`,
      },
    };
  }
  return { ok: true };
}
```

**Refactor `packages/authority/src/authorized-ops/workspace-op.ts` (from Plan 02)** — replace the inline trust check in `authorizeWorkspaceOp` with a call to `assertTrustedWorkspaceForGrant`. Behavior must be identical (existing Plan 02 tests still pass).

**Update `packages/authority/src/index.ts`** — re-export `assertTrustedWorkspaceForGrant`, `TrustAssertionResult`, `TrustRefusalEvidence`.

**`packages/authority/src/workspace-trust/predicate.test.ts`** — test cases:
1. Read access on untrusted workspace → ok: true
2. Read access on trusted workspace → ok: true
3. Write access on untrusted → ok: false, evidence.reason mentions trust
4. Write access on trusted → ok: true
5. Execute access on untrusted → ok: false
6. requestedScope: "workspace" on untrusted (even with read access) → ok: false (full-workspace grant requires trusted)
7. requestedScope: "workspace" on trusted → ok: true

**`packages/repo/src/workspace-trust-runtime.ts`** (NEW file in packages/repo):
```ts
import {
  assertTrustedWorkspaceForGrant,
  type AccessLevel,
  type ExecutionScope,
} from "@protostar/authority";
import type { WorkspaceRef } from "./index.js";

export class WorkspaceTrustError extends Error {
  constructor(
    public readonly workspace: WorkspaceRef,
    public readonly requestedAccess: AccessLevel,
    public readonly evidence: unknown,
  ) {
    super(`workspace-trust runtime refusal: ${workspace.path} cannot ${requestedAccess} (trust=${workspace.trust})`);
  }
}

export interface RuntimeWorkspaceOp {
  readonly workspace: WorkspaceRef;
  readonly requestedAccess: AccessLevel;
  readonly requestedScope?: ExecutionScope;
}

/**
 * Phase 2 contract — Phase 3+ real repo ops invoke this BEFORE any fs/subprocess
 * call. The runtime check catches mid-run mutation: if the workspace's trust
 * was somehow downgraded (config change, malicious mutation) since admission,
 * this throws — admission-time check + runtime check together close GOV-04.
 */
export function assertWorkspaceTrust(op: RuntimeWorkspaceOp): void {
  const result = assertTrustedWorkspaceForGrant({
    workspace: op.workspace,
    requestedAccess: op.requestedAccess,
    ...(op.requestedScope !== undefined ? { requestedScope: op.requestedScope } : {}),
  });
  if (!result.ok) {
    throw new WorkspaceTrustError(op.workspace, op.requestedAccess, result.evidence);
  }
}
```

**Update `packages/repo/package.json`** — add `"@protostar/authority": "workspace:*"` to dependencies if not already present.
**Update `packages/repo/src/index.ts`** — re-export `assertWorkspaceTrust` and `WorkspaceTrustError` from `./workspace-trust-runtime.js`.
**Update `packages/repo/tsconfig.json`** — add `{path: "../authority"}` to references if not already present (note: this is a packaging refinement; verify by reading current tsconfig).

**`packages/repo/src/workspace-trust-runtime.test.ts`** — runtime test cases:
1. trusted + write → no throw
2. untrusted + write → throws WorkspaceTrustError; error.workspace.trust === "untrusted"
3. untrusted + read → no throw
4. trusted + workspace-scope → no throw
5. untrusted + workspace-scope → throws (Q-10 mid-run mutation simulation: construct a workspace ref with `trust: "untrusted"` directly and call assertWorkspaceTrust)

**Update `packages/intent/src/repo-scope-admission.ts`** (admission-time half of Q-10) — locate the existing repo-scope admission logic; ADD a call to `assertTrustedWorkspaceForGrant` for any grant whose `executionScope === "workspace"` (per GOV-04 success criterion). On refusal, the existing admission Result shape carries the refusal forward as a `block` outcome with the predicate's evidence. Add a unit test in `packages/intent/src/repo-scope-admission.test.ts` (or a new file alongside) covering:
1. workspace scope + trusted → admit
2. workspace scope + untrusted → block, evidence references trust mismatch

Verify Plan 02's `authorizeWorkspaceOp` tests still pass after the refactor (the predicate is now shared but the tests assert the same outcomes).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/authority test &amp;&amp; pnpm --filter @protostar/repo test &amp;&amp; pnpm --filter @protostar/intent test</automated>
  </verify>
  <acceptance_criteria>
    - All three filtered test suites exit 0
    - `pnpm run verify:full` exits 0
    - `grep -c 'assertTrustedWorkspaceForGrant' packages/authority/src/workspace-trust/predicate.ts` >= 1
    - **Single-source-of-truth check:** `assertTrustedWorkspaceForGrant` referenced from at least 3 sites:
      - `grep -l 'assertTrustedWorkspaceForGrant' packages/authority/src/authorized-ops/workspace-op.ts`
      - `grep -l 'assertTrustedWorkspaceForGrant' packages/repo/src/workspace-trust-runtime.ts`
      - `grep -l 'assertTrustedWorkspaceForGrant' packages/intent/src/repo-scope-admission.ts`
      All three commands return non-empty
    - `grep -c 'WorkspaceTrustError' packages/repo/src/workspace-trust-runtime.ts` >= 1
    - **Authority boundary preserved:** `grep -RIn "from ['\"]node:fs['\"]\\|from ['\"]fs['\"]" packages/authority/src/ | grep -v '^#' | wc -l` outputs `0`
    - GOV-04 admission-time test exists: `grep -l 'workspace.*untrusted.*executionScope.*workspace' packages/intent/src/*.test.ts | wc -l` >= 1 OR equivalent assertion
    - GOV-04 runtime test exists: `grep -l 'WorkspaceTrustError\\|assertWorkspaceTrust.*throw' packages/repo/src/workspace-trust-runtime.test.ts | wc -l` >= 1
  </acceptance_criteria>
  <done>Single-predicate trust check used at three call sites; runtime refusal contract ready for Phase 3 fs ops; admission-time check extended in repo-scope-admission. GOV-04 fully closed (CLI-level via Plan 08 + admission-time via this Task + runtime via this Task).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Stage-read boundary | All cross-stage reads go through `AuthorityStageReader`; no stage reaches into prior stage's private state |
| FS-adapter boundary | Authority package never imports `node:fs`; readers receive an injected adapter |
| Trust predicate boundary | One predicate, three call sites — admission, runtime, AuthorizedOp mint — all converge |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-1 | Tampering | Tampered ConfirmedIntent reaches execution | mitigate (high severity, primary closure) | Stage reader's `verifyConfirmedIntent()` calls Q-17's `verifyConfirmedIntentSignature` on every read. Test 7 (tampered intent.json → ok:false) verifies. |
| T-2-5 | Elevation of Privilege | Hardcoded trust + missing runtime check | mitigate (high severity, third layer) | This plan adds the runtime layer (`assertWorkspaceTrust` in packages/repo). Combined with Plan 08's CLI removal + Plan 02's admission-time check, all three layers of GOV-04 are now in place. |
| T-2-6 | Tampering | Stage reader accepts wrong-schema artifact | mitigate (medium, primary closure) | Reader validates `schemaVersion` + `gate` literal at every read; throws `StageReaderError` on mismatch. Tests 4-5 verify. |
</threat_model>

<verification>
- All Phase 2 packages green (`@protostar/authority`, `@protostar/repo`, `@protostar/intent`)
- `pnpm run verify:full` exits 0
- Stage reader: legacy fallback (Pitfall 2) + verifier integration + schema validation
- Three call sites of `assertTrustedWorkspaceForGrant` (single source of truth)
- Authority boundary preserved (zero fs imports)
- GOV-04 closed at three layers (CLI / admission / runtime)
</verification>

<success_criteria>
- `AuthorityStageReader` shipped with FsAdapter injection + legacy fallback + verify-on-read
- `assertTrustedWorkspaceForGrant` is the single trust predicate; consumed at admission + runtime + AuthorizedOp mint
- `packages/repo` runtime trust contract ready for Phase 3 to invoke from real fs ops
- GOV-03 steward boundary (Q-09 stage-scoped reader) live
- GOV-04 fully closed
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-09-stage-reader-and-repo-runtime-SUMMARY.md`
</output>
