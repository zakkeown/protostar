# Phase 2: Authority + Governance Kernel — Research

**Researched:** 2026-04-27
**Domain:** Authority kernel for capability/precedence enforcement in a TypeScript monorepo (zero-runtime-dep, ESM, Node 22)
**Confidence:** HIGH (most claims verified against codebase; canonicalization spec proposal flagged `[ASSUMED]` pending user ratification)

## Summary

Phase 2 introduces `@protostar/authority` as the new pure-logic governance kernel. It owns: (a) precedence intersection across four constraint tiers, (b) the four `AuthorizedOp` brand mints + the `PrecedenceDecision` and `SignedAdmissionDecision` brands, (c) the central signature verifier, and (d) the per-gate admission-decision base type. The package writes nothing to disk — `apps/factory-cli` owns every fs write, and `packages/repo` owns the `WorkspaceRef.trust` runtime consumer. Phase 1 already shipped the brand-pattern infrastructure (`mintConfirmedIntent` + `internal/test-builders` subpath + `internal/brand-witness` + the three-layer admission-e2e contract test); Phase 2 instantiates that pattern six more times, mechanically.

The two genuinely new design surfaces are (1) the canonicalization spec for the SHA-256 signature payload — recommended below as a JCS-compatible subset implementable in ~30 lines using `JSON.stringify`'s built-in number formatting, and (2) the per-boundary budget tracker + central aggregator contract. Everything else reuses Phase 1 templates verbatim.

**Primary recommendation:** Treat Phase 2 as "Phase 1 brand-pattern × 6 + a precedence kernel + a SHA-256 verifier." Reference Phase 1 plans 04, 06b, and 08 as the templates the planner copies, not as inspirations.

## Architectural Responsibility Map

The template's web-tier vocabulary does not apply (this is a pure CLI factory). Tiers reframed as Protostar architectural layers, all governed by AGENTS.md's authority-boundary lock (only `apps/factory-cli` + `packages/repo` may touch the filesystem).

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Precedence intersection across four tiers | `@protostar/authority` (pure) | — | Pure logic, no I/O. Authority boundary lock forbids fs reach. [VERIFIED: AGENTS.md §Package Boundaries, §Development Rules] |
| AuthorizedOp brand mint (4 boundaries) | `@protostar/authority` (sole producer) | — | Each brand has one private mint, mirroring `mintConfirmedIntent` at `packages/intent/src/confirmed-intent.ts:92`. [VERIFIED: read] |
| Per-gate admission-decision base interface | `@protostar/authority` | per-gate evidence extensions in owning package's `schema/` | Q-13 hybrid: shared header in authority, gate-specific extension in owner. [CITED: 02-CONTEXT.md Q-13] |
| Per-gate admission-decision artifact writes | `apps/factory-cli` | — | Authority boundary lock — only factory-cli writes `.protostar/`. [VERIFIED: AGENTS.md, current `writeRefusalArtifacts` at apps/factory-cli/src/main.ts:605-632] |
| `admission-decisions.jsonl` append index | `apps/factory-cli` | — | Symmetric to existing `refusals.jsonl` writer at apps/factory-cli/src/main.ts:622-631. [VERIFIED: read] |
| `.protostar/repo-policy.json` load (parse + schema validate) | `apps/factory-cli` (fs read) | `@protostar/authority` (schema + parse function) | fs read crosses authority boundary; parse helper is pure. [VERIFIED: AGENTS.md] |
| `WorkspaceRef.trust` admission-time check | `@protostar/authority` (predicate) | `packages/intent/src/repo-scope-admission.ts` (caller) | Pure predicate; called from existing repo-scope admission. [VERIFIED: read] |
| `WorkspaceRef.trust` execution-time check | `packages/repo` (assertion before any fs op) | `@protostar/authority` (re-uses same predicate) | Repo package owns runtime FS; reuses authority predicate so single source of truth. [VERIFIED: AGENTS.md §Package Boundaries] |
| SHA-256 signature mint + verify | `@protostar/authority` (single helper) | `apps/factory-cli` (call site per stage) | Q-17 single-canonicalization-site lock. [CITED: 02-CONTEXT.md Q-17] |
| Two-key CLI launch (`--trust trusted` requires `--confirmed-intent`) | `apps/factory-cli/src/main.ts` | `@protostar/authority` (refusal-evidence builder) | CLI flag parsing belongs in factory-cli; refusal evidence shape is authority's. [VERIFIED: 02-CONTEXT.md Q-11; current hardcoded trust at apps/factory-cli/src/main.ts:333-337] |
| Per-boundary budget tracker | `@protostar/authority` (interface) | downstream consumers (Phase 3+ wire) | Phase 2 ships interface only (Q-06 contracts-only). [CITED: 02-CONTEXT.md Q-06] |
| Per-gate stage-scoped reader factory (`createAuthorityStageReader(runDir)`) | `@protostar/authority` (constructor) | `apps/factory-cli` (sole caller in Phase 2) | Q-09 stage-scoped client object. Reader is pure given the file bytes; the fs.readFile happens in caller (factory-cli). [CITED: 02-CONTEXT.md Q-09] |

## Standard Stack

### Core (Phase 2 adds zero new runtime deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` | built-in (Node 22+) | SHA-256 for signature payload | Q-15 lock; PROJECT.md "zero external runtime deps" constraint. [VERIFIED: read PROJECT.md L70, 02-CONTEXT.md Q-15] |
| `node:fs/promises` | built-in | Append `admission-decisions.jsonl`, write per-gate decision JSON | Already used by `writeRefusalArtifacts` pattern. [VERIFIED: apps/factory-cli/src/main.ts] |
| `node:test` | built-in | Test runner — runs against compiled `dist/*.test.js` | Locked by PROJECT.md Constraints L67. **Do NOT** propose `tsx`/`vitest`/`jest`. [VERIFIED: PROJECT.md] |
| TypeScript | ^6.0.3 strict | `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` | Locked by PROJECT.md L66. [VERIFIED] |
| pnpm + Turborepo | existing | Workspace package + project references | Already in place. [VERIFIED: pnpm-workspace.yaml exists, packages/ layout] |

### Supporting (Phase 2 adds nothing — by design)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@protostar/intent` | workspace | Re-export `ConfirmedIntent`, `CapabilityEnvelope`, `SignatureEnvelope` | Authority consumes; never reaches into private state. [VERIFIED: read] |
| `@protostar/repo` | workspace | `WorkspaceRef` consumer of trust check | Authority exports the predicate; repo is the runtime caller. [VERIFIED: packages/repo/src/index.ts] |
| `@protostar/admission-e2e` | workspace | New per-brand contract tests | Mechanical instantiation of `confirmed-intent-mint.contract.test.ts` template. [VERIFIED: read] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled JCS-subset canonicalizer | `json-canonicalize` npm package (full RFC 8785) | Adds runtime dep — violates PROJECT.md "zero external runtime deps" lock. **Rejected.** [CITED: PROJECT.md L70] |
| SHA-256 (Q-15) | HMAC w/ shared secret OR Ed25519 asymmetric | Q-15 explicitly chose SHA-256 for tamper-detection only; asymmetric explicitly deferred (02-CONTEXT.md Deferred Ideas). **Locked.** |
| Per-boundary trackers + aggregator (Q-07) | Single ledger | Q-07 chose per-boundary; matches per-brand-per-boundary symmetry. **Locked.** |

**Installation:** None — all deps are built-in or already in workspace.

**Version verification:** N/A (no new external packages).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       apps/factory-cli (runFactory)                     │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │ 1. Parse CLI args:  --trust {untrusted|trusted}                   │  │
│   │                     --confirmed-intent <path>  (required iff      │  │
│   │                                                  --trust trusted) │  │
│   │ 2. Load .protostar/repo-policy.json   (factory-cli reads file)    │  │
│   │ 3. Load operator-settings (CLI flags)                              │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                                  │                                      │
│                                  ▼ (4 constraint sets in)               │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │              @protostar/authority — pure kernel                    │  │
│   │                                                                    │  │
│   │  intersectEnvelopes(intentTier, policyTier, repoTier, opTier)      │  │
│   │     │                                                              │  │
│   │     ▼                                                              │  │
│   │  PrecedenceDecision (branded)                                      │  │
│   │  ├─ status: "no-conflict" | "resolved" | "blocked-by-tier"         │  │
│   │  ├─ resolvedEnvelope: CapabilityEnvelope                            │  │
│   │  └─ blockedBy: readonly TierName[]   (full set under intersection) │  │
│   │                                                                    │  │
│   │  ─────────────  per-gate admission base  ─────────────             │  │
│   │  AdmissionDecisionBase                                             │  │
│   │  ├─ schemaVersion: "1.0.0"                                         │  │
│   │  ├─ runId, gate, outcome: "allow"|"block"|"escalate"               │  │
│   │  ├─ precedenceResolution (nested summary, Q-04)                    │  │
│   │  └─ evidence: <gate-specific extension>                            │  │
│   │                                                                    │  │
│   │  ─────────────  signature verifier  ─────────────                  │  │
│   │  verifyConfirmedIntentSignature(intent, policySnapshot)            │  │
│   │     ├─ canonicalize via canonicalForm tag dispatch                 │  │
│   │     ├─ SHA-256 (intent + resolvedEnvelope + policySnapshotHash)    │  │
│   │     └─ Result: { ok:true; verified:VerifiedIntent }                │  │
│   │              | { ok:false; mismatch:{field,expected,actual} }      │  │
│   │                                                                    │  │
│   │  ─────────────  AuthorizedOp brand mints (Phase 2 ships 4) ─────  │  │
│   │  authorizeWorkspaceOp(op, env) -> AuthorizedWorkspaceOp            │  │
│   │  authorizeSubprocessOp(op, env) -> AuthorizedSubprocessOp          │  │
│   │  authorizeNetworkOp(op, env)   -> AuthorizedNetworkOp              │  │
│   │  authorizeBudgetOp(op, env)    -> AuthorizedBudgetOp               │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                                  │                                      │
│                                  ▼ (decisions back in CLI)              │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │ 6. Per-gate write:                                                │  │
│   │    .protostar/runs/{id}/{gate}-admission-decision.json            │  │
│   │    .protostar/runs/{id}/precedence-decision.json (iff conflict)   │  │
│   │    .protostar/runs/{id}/policy-snapshot.json                      │  │
│   │    .protostar/runs/{id}/escalation-marker.json (iff escalate)     │  │
│   │    APPEND .protostar/runs/{id}/admission-decisions.jsonl          │  │
│   │ 7. On block/escalate: writeRefusalArtifacts (existing) +          │  │
│   │    non-zero exit. escalate marker is distinct from block.         │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
              ┌────────────────────────────────────────┐
              │   packages/repo — execution-time spine │
              │                                        │
              │  assertWorkspaceTrust(workspace, op)   │
              │   uses @protostar/authority predicate  │
              │   (single source of truth)             │
              │   refuses if workspace.trust !== "trusted"
              └────────────────────────────────────────┘
```

### Recommended Project Structure

```
packages/authority/
├── package.json                              # exports: ., ./schema/*, ./internal/brand-witness, ./internal/test-builders
├── src/
│   ├── index.ts                              # public barrel
│   ├── precedence/
│   │   ├── index.ts                          # intersectEnvelopes
│   │   ├── tiers.ts                          # TierName literal union, TierConstraint type
│   │   └── precedence-decision.ts            # branded PrecedenceDecision + module-private mint
│   ├── admission-decision/
│   │   ├── base.ts                           # AdmissionDecisionBase + GateName literal union
│   │   └── outcome.ts                        # re-exports the existing ADMISSION_DECISION_OUTCOMES literal
│   ├── authorized-ops/
│   │   ├── workspace-op.ts                   # branded AuthorizedWorkspaceOp + private mint
│   │   ├── subprocess-op.ts                  # contracts only (Q-06)
│   │   ├── network-op.ts                     # contracts only (Q-06)
│   │   └── budget-op.ts                      # branded AuthorizedBudgetOp + private mint
│   ├── budget/
│   │   ├── tracker.ts                        # BoundaryBudgetTracker interface
│   │   └── aggregator.ts                     # CentralBudgetAggregator interface (Q-07)
│   ├── repo-policy/
│   │   ├── parse.ts                          # parseRepoPolicy(unknown): Result
│   │   └── load-helpers.ts                   # path resolution helpers (no fs)
│   ├── signature/
│   │   ├── canonicalize.ts                   # canonicalForm "json-c14n@1.0" canonicalizer
│   │   ├── canonical-form-registry.ts        # tag → canonicalizer dispatch
│   │   ├── sign.ts                           # signConfirmedIntent helper
│   │   └── verify.ts                         # verifyConfirmedIntentSignature
│   ├── stage-reader/
│   │   └── factory.ts                        # createAuthorityStageReader(runDir)
│   ├── workspace-trust/
│   │   └── predicate.ts                      # assertTrustedWorkspaceForGrant
│   └── internal/
│       ├── brand-witness.ts                  # ConfirmedIntent-style brand witnesses for each Op
│       └── test-builders.ts                  # buildAuthorizedWorkspaceOpForTest, etc.
└── schema/
    ├── admission-decision-base.schema.json   # shared header
    ├── precedence-decision.schema.json
    ├── policy-snapshot.schema.json
    ├── escalation-marker.schema.json
    └── repo-policy.schema.json               # `.protostar/repo-policy.json` schema
```

Per-gate evidence-extension schemas live in their owning package's `schema/` dir (Q-13):
- `packages/intent/schema/intent-admission-decision.schema.json` (extends base; renamed from current `admission-decision.schema.json`)
- `packages/planning/schema/planning-admission-decision.schema.json`
- `packages/intent/schema/capability-admission-decision.schema.json`
- `packages/intent/schema/repo-scope-admission-decision.schema.json`
- `packages/repo/schema/workspace-trust-admission-decision.schema.json`

### Pattern 1: Module-Private Brand Mint with Three-Layer Contract Guard

**What:** Phase 1's exact pattern at `packages/intent/src/confirmed-intent.ts:13-17, 92-116` plus the contract test at `packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts`.

**When to use:** Every new branded type in Phase 2 — six instances total.

**Template (verbatim from Phase 1):**

```typescript
// packages/authority/src/authorized-ops/workspace-op.ts

// Module-private brand. NOT exported. Foreign callers cannot name this symbol.
declare const AuthorizedWorkspaceOpBrand: unique symbol;

export interface AuthorizedWorkspaceOpData {
  readonly workspace: WorkspaceRef;
  readonly path: string;
  readonly access: "read" | "write" | "execute";
  readonly resolvedEnvelope: CapabilityEnvelope;  // post-intersection
}

export type AuthorizedWorkspaceOp = AuthorizedWorkspaceOpData & {
  readonly [AuthorizedWorkspaceOpBrand]: true;
};

// Module-internal mint — used by sibling authorize* function and internal/test-builders.
// NOT re-exported from public barrel.
export function mintAuthorizedWorkspaceOp(data: AuthorizedWorkspaceOpData): AuthorizedWorkspaceOp {
  return Object.freeze({ ...data }) as AuthorizedWorkspaceOp;
}
```

```typescript
// packages/authority/src/internal/brand-witness.ts
// Mirrors packages/intent/src/internal/brand-witness.ts. Used only by admission-e2e contract tests.
import type { AuthorizedWorkspaceOp } from "../authorized-ops/workspace-op.js";
export type AuthorizedWorkspaceOpBrandWitness = AuthorizedWorkspaceOp;
// (one re-export per brand)
```

```typescript
// packages/admission-e2e/src/authorized-workspace-op-mint.contract.test.ts
// Three-layer guard, copy of packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts.

import * as AuthorityPublicApi from "@protostar/authority";
import type { AuthorizedWorkspaceOpBrandWitness } from "@protostar/authority/internal/brand-witness";

// Layer 1: type-level positive — exactly one public function returns the brand
type AuthoritySurface = typeof AuthorityPublicApi;
type ReturnsAuthorizedWorkspaceOp<K extends keyof AuthoritySurface> =
  AuthoritySurface[K] extends (...args: never[]) => infer R
    ? Extract<R, AuthorizedWorkspaceOpBrandWitness> extends never
      ? Extract<R, { readonly authorized: AuthorizedWorkspaceOpBrandWitness }> extends never
        ? false
        : true
      : true
    : false;
type MintingKeys = {
  [K in keyof AuthoritySurface]: ReturnsAuthorizedWorkspaceOp<K> extends true ? K : never;
}[keyof AuthoritySurface];
type _SurfacePinned = Assert<Equal<MintingKeys, "authorizeWorkspaceOp">>;

// Layer 2: type-level negative — no test/internal helpers leak
type AuthorityKeys = keyof typeof AuthorityPublicApi;
type _NoMintExported = Assert<"mintAuthorizedWorkspaceOp" extends AuthorityKeys ? false : true>;
type _NoTestBuilderExported = Assert<"buildAuthorizedWorkspaceOpForTest" extends AuthorityKeys ? false : true>;

// Layer 3: runtime barrel-leak grep — ensure dist/index.js doesn't string-contain the test-builder
// (full pattern lifted from confirmed-intent-mint.contract.test.ts)
```

**Six brands needing this template in Phase 2** (planner: six parallel tasks, mechanical):
1. `AuthorizedWorkspaceOp` (sole public producer: `authorizeWorkspaceOp`)
2. `AuthorizedSubprocessOp` (`authorizeSubprocessOp`)
3. `AuthorizedNetworkOp` (`authorizeNetworkOp`)
4. `AuthorizedBudgetOp` (`authorizeBudgetOp`)
5. `PrecedenceDecision` (`intersectEnvelopes`)
6. `SignedAdmissionDecision` (`signAdmissionDecision`)

### Pattern 2: Stage-Scoped Reader Factory (Q-09)

```typescript
// packages/authority/src/stage-reader/factory.ts

export interface AuthorityStageReader {
  // Reads .protostar/runs/{id}/intent-admission-decision.json (NEW name).
  // Falls back to legacy admission-decision.json on miss; never renames-on-read.
  intentAdmissionDecision(): Promise<IntentAdmissionDecision>;
  planningAdmissionDecision(): Promise<PlanningAdmissionDecision>;
  capabilityAdmissionDecision(): Promise<CapabilityAdmissionDecision>;
  repoScopeAdmissionDecision(): Promise<RepoScopeAdmissionDecision>;
  workspaceTrustAdmissionDecision(): Promise<WorkspaceTrustAdmissionDecision>;
  precedenceDecision(): Promise<PrecedenceDecision | null>;        // null = no conflict, no file
  policySnapshot(): Promise<PolicySnapshot>;
  // For cross-gate scans:
  admissionDecisionsIndex(): Promise<readonly AdmissionDecisionIndexEntry[]>;
}

export function createAuthorityStageReader(runDir: string): AuthorityStageReader { /* ... */ }
```

Each method: read file (via `fs/promises.readFile` injected at construction or imported here — pure-package question; recommend constructor takes a `FsAdapter` so `@protostar/authority` itself does not import `node:fs`, preserving the authority-boundary lock). Validate `schemaVersion`; reject unknowns.

### Pattern 3: Canonical Form Tagged Dispatch (Signature Verifier)

```typescript
// packages/authority/src/signature/canonical-form-registry.ts
const CANONICALIZERS = {
  "json-c14n@1.0": canonicalizeJsonC14nV1,
} as const satisfies Record<string, (value: unknown) => string>;

export function resolveCanonicalizer(tag: string): ((value: unknown) => string) | null {
  return (CANONICALIZERS as Record<string, (v: unknown) => string>)[tag] ?? null;
}
```

The verifier **fail-closes** on unknown tags. Adding a new canonicalForm in a future phase is one new entry + a bumped tag in newly minted intents.

### Anti-Patterns to Avoid

- **Letting `@protostar/authority` import `node:fs`.** AGENTS.md authority boundary lock — only `apps/factory-cli` and `packages/repo` do FS I/O. Authority is pure logic. Use injected `FsAdapter` if reading-side is needed inside the kernel.
- **Re-exporting any `mintAuthorizedXOp` or `mintPrecedenceDecision` from the public barrel.** Same trap Phase 1's contract test catches; Phase 2 must catch six new brands the same way.
- **Hand-rolling SHA-256.** Use `node:crypto`. Q-15 lock.
- **Hand-rolling canonicalization that JSON.stringify already does.** Numbers: ECMAScript's number→string is already RFC 8785-compatible. Don't reimplement.
- **Putting the per-gate file write inside `@protostar/authority`.** It must live in `apps/factory-cli` mirroring `writeRefusalArtifacts` at lines 605-632.
- **Treating `escalate` as a brand-new outcome literal.** It already exists at `packages/intent/src/admission-decision.ts:28` (`ADMISSION_DECISION_OUTCOMES = ["allow", "block", "escalate"]`). Phase 2 *wires* it for trust failure + adds the marker artifact.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | Custom hash | `node:crypto.createHash("sha256")` | Built-in, audited, zero-dep. [VERIFIED: Q-15] |
| JSON number formatting | Custom number→string | ECMAScript `JSON.stringify` (already RFC 8785-compatible for numbers) | Spec-grade output for free. [CITED: RFC 8785 §3.2.2.3] |
| String escaping | Custom escape | `JSON.stringify` default string serialization | Same. |
| Object key sorting | Custom collation | `Object.keys(obj).sort()` (UTF-16 code unit, JS default) | RFC 8785 §3.2.3 specifies UTF-16 code unit order, which is JS string default. [CITED: RFC 8785] |
| Branded type "private mint" mechanics | Re-derive per brand | Reuse Phase 1 `mintConfirmedIntent` template at `packages/intent/src/confirmed-intent.ts:13,92-116` | Locked pattern; copy six times. |
| Three-layer contract test | Re-derive | Copy `packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` and parameterize over the six new brands | Mechanical; Plan 09 already parameterized similar tests. |
| JSONL append index format | Re-derive | Reuse `RefusalIndexEntry` + `formatRefusalIndexLine` shape from `apps/factory-cli/src/refusals-index.ts` | Symmetric to refusals.jsonl; one new pure helper for `AdmissionDecisionIndexEntry`. |
| `Result<T,E>` generic | Define new type | Use the codebase's existing discriminated-union shape: `{ ok: true; data: T; errors: readonly string[] } \| { ok: false; errors: readonly string[]; mismatch?: ... }` | Established by `parseConfirmedIntent` and friends — no new generic needed. [VERIFIED: packages/intent/src/confirmed-intent.ts L53-64] |

**Key insight:** Phase 2's surface looks large (4 brands + precedence kernel + verifier + per-gate base + `.protostar/repo-policy.json` parser + reader factory + budget contract) but every component has a Phase 1 template. The unique design work is the canonicalization spec and the precedence intersection algorithm; everything else is mechanical instantiation.

## Common Pitfalls

### Pitfall 1: Treating `escalate` as a new outcome literal
**What goes wrong:** Planner adds `"escalate"` to a new union somewhere; existing `AdmissionDecisionOutcome` already has it.
**Why it happens:** Q-12's framing reads as "new verdict."
**How to avoid:** Reuse `ADMISSION_DECISION_OUTCOMES` from `packages/intent/src/admission-decision.ts:28`. Phase 2 wiring is: (a) trust-failure path emits an `escalate` decision, (b) factory-cli writes `escalation-marker.json` distinct from refusal artifacts, (c) exit code is non-zero but distinct semantic from block (planner: choose two distinct exit codes).
**Warning signs:** Diff shows new `as const` array of outcomes, or new union literal.

### Pitfall 2: Backward compat for the 208 existing run dirs (Q-14)
**What goes wrong:** Reader factory throws on legacy runs that have `admission-decision.json` (old name) + no `admission-decisions.jsonl` index.
**Why it happens:** Q-14 renames the intent-gate file to `intent-admission-decision.json` and introduces the JSONL index — but historical dirs predate both.
**How to avoid:** Reader does try-new-then-legacy: read `intent-admission-decision.json`, on ENOENT fall back to `admission-decision.json`. Treat missing `admission-decisions.jsonl` as `[]` (legacy run, no cross-gate trail), not as error. **Never rename-on-read** — historical artifacts must remain bit-identical for any future audit.
**Warning signs:** Test passes only on freshly created run dirs; reading any pre-Phase-2 run throws.

### Pitfall 3: Canonicalization edge cases
**What goes wrong:** Verifier accepts/rejects a payload non-deterministically because of `-0`, `NaN`, `Infinity`, `undefined` values, or duplicate keys.
**Why it happens:** JSON.stringify is mostly-RFC-8785-compatible but has gotchas.
**How to avoid:** The `json-c14n@1.0` canonicalizer (recommended below) **rejects** non-finite numbers, `undefined` values, and `-0`. It validates input *before* serializing. Add a unit test for each rejection case.
**Warning signs:** Signature verifies sometimes-not-always for the "same" input.

### Pitfall 4: Per-gate file write inside `@protostar/authority`
**What goes wrong:** Authority package imports `node:fs/promises`. AGENTS.md authority-boundary lock breaks.
**Why it happens:** Convenience — the kernel "knows" the data, why not write?
**How to avoid:** Authority returns the *fully-shaped artifact* (including filename literal); `apps/factory-cli` calls `writeJson`. Mirror Phase 1's split: `createAdmissionDecisionArtifact` (pure, in `@protostar/intent`) + `writeDraftAdmissionArtifacts` (fs, in `apps/factory-cli`).
**Warning signs:** `import ... from "node:fs"` anywhere under `packages/authority/src/`.

### Pitfall 5: Two-key launch refusal path drops the existing capability-envelope refusal
**What goes wrong:** Adding `--trust trusted` requires `--confirmed-intent` check before existing capability-envelope checks; if planner gates the existing refusals behind the new check, runs that should refuse on capability grounds don't.
**Why it happens:** Easy to put the two-key check in the wrong order.
**How to avoid:** The two-key check is a **CLI argument validation** (fails before runFactory does anything), not an admission gate. Refuse with exit code distinct from envelope refusal; emit a refusal artifact tagged with stage `"workspace-trust"` and an evidence body explaining "trust=trusted requires --confirmed-intent."
**Warning signs:** Test for missing `--confirmed-intent` shows the run progressing past CLI parse before failing.

### Pitfall 6: schemaVersion bump strategy
**What goes wrong:** Bumping `confirmed-intent.schema.json` from `const: "1.0.0"` to `const: "1.1.0"` breaks reads of any existing 1.0.0-tagged file.
**Why it happens:** Direct const replacement.
**How to avoid:** Widen to `enum: ["1.0.0", "1.1.0"]` (or `oneOf`) so readers accept both. Phase 1 always emitted `signature: null`; Phase 2 emits filled signatures with `canonicalForm`. Both shapes valid against the widened schema. **Note:** verify whether any of the 208 historical run dirs actually contain a `ConfirmedIntent` artifact (search `intent.json` files) before deciding bump strategy. If none: hard-bump is fine. If some: widen.
**Warning signs:** Test reads a Phase-1-era `intent.json` and fails schema validation.

## Code Examples

### `json-c14n@1.0` canonicalizer (proposed spec)

```typescript
// packages/authority/src/signature/canonicalize.ts

/**
 * canonicalForm "json-c14n@1.0" — JCS-compatible subset.
 *
 * Rules (verifier MUST fail-closed on inputs that violate any of these):
 * 1. Recursively canonicalize. Object keys sorted by UTF-16 code unit (JS default `.sort()`).
 * 2. Reject non-finite numbers (NaN, Infinity, -Infinity).
 * 3. Reject `-0` (collapse: writers must serialize as 0; verifier rejects literal -0).
 * 4. Reject `undefined` values anywhere (in objects: drop those keys is NOT permitted; reject).
 * 5. Reject Symbol keys, BigInt values, Date, RegExp, Map, Set, etc. (only plain JSON types).
 * 6. Strings: emit via JSON.stringify (handles RFC 8259 escapes correctly per ECMA-262).
 * 7. Numbers: emit via JSON.stringify (ECMAScript number→string is RFC 8785 §3.2.2.3 compatible).
 * 8. No whitespace, no trailing newline.
 * 9. Arrays preserve order.
 *
 * Why "subset" not "RFC 8785 conformant": we explicitly reject inputs the standard would canonicalize
 * (e.g. -0 → 0). This is deliberate — Protostar emits its own data, so reject-on-anomaly catches bugs.
 */
export function canonicalizeJsonC14nV1(value: unknown): string {
  validateCanonicalInput(value); // throws on -0, NaN, Infinity, undefined, non-plain types
  return canonicalSerialize(value);
}

function canonicalSerialize(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return JSON.stringify(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) {
    return "[" + v.map(canonicalSerialize).join(",") + "]";
  }
  // plain object
  const keys = Object.keys(v as object).sort(); // UTF-16 code unit (JS default)
  return "{" + keys.map(k =>
    JSON.stringify(k) + ":" + canonicalSerialize((v as Record<string, unknown>)[k])
  ).join(",") + "}";
}
```

[ASSUMED] — User has not ratified this exact spec; Q-18 only locks the *tag* `"json-c14n@1.0"`. Add to Assumptions Log.

### Signature payload + verifier shape

```typescript
// packages/authority/src/signature/sign.ts
import { createHash } from "node:crypto";

export interface SignatureInputs {
  readonly intent: ConfirmedIntentData;       // un-branded; signature carries the brand-evidence
  readonly resolvedEnvelope: CapabilityEnvelope;  // post-precedence intersection
  readonly policySnapshotHash: string;        // sha256(canonicalize(policy-snapshot.json))
}

export function buildSignatureValue(inputs: SignatureInputs): string {
  const canonical = canonicalizeJsonC14nV1({
    intent: inputs.intent,
    resolvedEnvelope: inputs.resolvedEnvelope,
    policySnapshotHash: inputs.policySnapshotHash,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function buildSignatureEnvelope(inputs: SignatureInputs): SignatureEnvelopeV2 {
  return {
    algorithm: "sha256",
    canonicalForm: "json-c14n@1.0",
    value: buildSignatureValue(inputs),
  };
}
```

```typescript
// packages/authority/src/signature/verify.ts

export type VerifyConfirmedIntentSignatureResult =
  | { readonly ok: true;  readonly verified: VerifiedIntent;  readonly errors: readonly string[] }
  | { readonly ok: false;
      readonly errors: readonly string[];
      readonly mismatch: SignatureMismatch }

export interface SignatureMismatch {
  readonly field: "intentBody" | "resolvedEnvelope" | "policySnapshotHash" | "canonicalForm" | "algorithm";
  readonly expected: string;
  readonly actual: string;
}

export function verifyConfirmedIntentSignature(
  intent: ConfirmedIntent,
  policySnapshot: PolicySnapshot,
  resolvedEnvelope: CapabilityEnvelope,
): VerifyConfirmedIntentSignatureResult { /* ... */ }
```

[VERIFIED: shape mirrors `parseConfirmedIntent` discriminated-union pattern at `packages/intent/src/confirmed-intent.ts:53-64`]

### Precedence intersection — TypeScript shape

```typescript
// packages/authority/src/precedence/index.ts

export type TierName = "confirmed-intent" | "policy" | "repo-policy" | "operator-settings";

export interface TierConstraint {
  readonly tier: TierName;
  readonly envelope: CapabilityEnvelope;        // each tier expressed as a capability set
  readonly source: string;                      // human-readable provenance ("policy:cosmetic-tweak", etc.)
}

export interface PrecedenceDecisionData {
  readonly schemaVersion: "1.0.0";
  readonly status: "no-conflict" | "resolved" | "blocked-by-tier";
  readonly resolvedEnvelope: CapabilityEnvelope;
  readonly tiers: readonly TierConstraint[];
  // Q-02 note: blockedBy is the FULL set of tiers that contributed a denial under intersection.
  readonly blockedBy: readonly { readonly tier: TierName; readonly axis: string; readonly message: string }[];
}

declare const PrecedenceDecisionBrand: unique symbol;
export type PrecedenceDecision = PrecedenceDecisionData & {
  readonly [PrecedenceDecisionBrand]: true;
};

export function intersectEnvelopes(tiers: readonly TierConstraint[]): PrecedenceDecision { /* ... */ }
```

The intersection algorithm walks each axis (repoScopes, toolPermissions, executeGrants, budget) and takes the strictest constraint. For each axis, every tier that imposed a denial appears in `blockedBy` (Q-02 explicit: "who denied may not be unique").

### `.protostar/repo-policy.json` proposed schema [ASSUMED]

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://protostar.local/schema/repo-policy.schema.json",
  "title": "RepoPolicy",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion"],
  "properties": {
    "schemaVersion": { "const": "1.0.0" },
    "allowedScopes": { "type": "array", "items": { "type": "string" } },
    "deniedTools": { "type": "array", "items": { "type": "string" } },
    "budgetCaps": {
      "type": "object",
      "properties": {
        "maxUsd": { "type": "number" },
        "maxTokens": { "type": "number" },
        "timeoutMs": { "type": "number" },
        "maxRepairLoops": { "type": "number" }
      },
      "additionalProperties": false
    },
    "trustOverride": { "enum": ["trusted", "untrusted"] }
  }
}
```

**Default-deny vs. default-permissive when file is absent:** **Recommended: default-permissive in Phase 2** (no real I/O happens; absence = "no extra constraint from repo tier"). Phase 3, when real fs writes land, may revisit. [ASSUMED]

### Two-key CLI launch refusal

```typescript
// apps/factory-cli/src/main.ts (proposed)
if (args.trust === "trusted" && args.confirmedIntent === undefined) {
  // CLI-level refusal: don't even enter runFactory.
  await writeRefusalArtifacts({
    runId: args.runId ?? generateRunId(),
    stage: "workspace-trust",          // new RefusalStage literal
    reason: "--trust trusted requires --confirmed-intent <path> (two-key launch)",
    refusalArtifact: "trust-refusal.json",
    // ... other fields per existing helper signature
  });
  process.exitCode = 2;                // distinct from refusal exit code (currently 1)
  return;
}
```

### State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `trust: "trusted"` at apps/factory-cli/src/main.ts:333-337 | CLI-flag-driven trust + two-key launch | Phase 2 (this phase) | Closes the highest-impact security gap flagged in `.planning/codebase/CONCERNS.md` |
| Single intent-gate `admission-decision.json` | Per-gate `{gate}-admission-decision.json` + JSONL index | Phase 2 | Phase 9 inspect surface gets cheap cross-gate scans |
| Reserved `signature: SignatureEnvelope \| null` slot (always null) | Filled signature with canonicalForm tag | Phase 2 | Tamper detection across stages |
| Capability envelope as admission-time validation | Capability envelope as runtime AuthorizedOp brand | Phase 2 | Boundaries can no longer "forget" to check |

## Project Constraints (from CLAUDE.md and AGENTS.md)

These directives must hold. Plan must not violate any:

- **Authority boundary lock (load-bearing):** Only `apps/factory-cli` and `packages/repo` may touch the filesystem. `@protostar/authority` is pure logic + types. `dogpile-adapter` has zero filesystem authority. [SOURCE: AGENTS.md §Package Boundaries; CLAUDE.md "authority boundary"]
- **Domain-first packaging:** No generic `utils`, `agents`, or catch-all factory packages. [SOURCE: AGENTS.md §Development Rules]
- **Stage forward-only data flow:** Each stage admits the next via durable artifact; no reaching back into prior private state. Cross-stage reads go through admission helpers (Q-09 stage-scoped readers). [SOURCE: AGENTS.md §Development Rules]
- **Zero external runtime deps:** PROJECT.md L70 — "New runtime deps require a 'why'". Phase 2 adds zero. [SOURCE: PROJECT.md]
- **ESM-only, Node 22, TypeScript ^6.0.3 strict:** `module: NodeNext`, `.js` import suffixes, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`. [SOURCE: PROJECT.md L66]
- **`node:test` against compiled `dist/*.test.js`:** No Jest, Vitest, or `tsx`/`ts-node` in CI. Do not propose alternative runners. [SOURCE: PROJECT.md L67]
- **`pnpm run verify` before handing work back:** [SOURCE: AGENTS.md §Development Rules]
- **Dark except hard failures:** No progress logs, no human pings except policy-defined stop gates (the `escalate` verdict IS such a gate). [SOURCE: PROJECT.md "Autonomy line"; CLAUDE.md "dark factory"]
- **Ouroboros not a runtime dep:** Ouroboros is design-conversation tooling; do not import or reference at runtime. [SOURCE: PROJECT.md "Out of Scope"]

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GOV-01 | Precedence (intent → policy → repo → operator) documented + enforced; conflicts produce evidence | Pattern 2 reader factory + intersection algorithm + nested `precedenceResolution` summary + separate `precedence-decision.json` (Q-02, Q-04) |
| GOV-02 | Capability envelope enforced at every authority boundary (workspace, network, subprocess, budget) | Four `AuthorizedOp` brands with three-layer contract guard each (Q-05, Q-06: contracts only) |
| GOV-03 | Single-owner per artifact; cross-stage reads via admission helpers | Strict `package.json` exports + admission-e2e contract tests (Q-08) + stage-scoped reader factory (Q-09) |
| GOV-04 | `WorkspaceRef.trust` consumed; `executionScope: "workspace"` refused when `trust !== "trusted"` | `assertTrustedWorkspaceForGrant` predicate in `@protostar/authority`, called both at admission AND from `packages/repo` at execution time (Q-10); two-key CLI launch removes hardcoded `trust: "trusted"` (Q-11) |
| GOV-05 | Per-gate `admission-decision.json` for every gate (intent/planning/capability/repo-scope/workspace-trust) | Per-gate filenames + shared base + gate extension (Q-13) + JSONL index (Q-14) + backward-compat reader for the 208 legacy runs |
| GOV-06 | `ConfirmedIntent` carries admission signature (hash of intent + policy snapshot at admission); verified before each stage acts | SHA-256 via `node:crypto` (Q-15) + payload covers intent + resolved envelope + policySnapshotHash (Q-16) + central `verifyConfirmedIntentSignature` helper with `Result<VerifiedIntent, SignatureMismatchError>` shape (Q-17) + `canonicalForm: "json-c14n@1.0"` field added to `SignatureEnvelope`, schema bumped to 1.1.0 widened enum (Q-18) |

## Runtime State Inventory

> Phase 2 is **contracts only** (no real I/O lands), but it **renames** `runs/{id}/admission-decision.json` → `runs/{id}/intent-admission-decision.json` (Q-14) and **bumps** `confirmed-intent.schema.json` to 1.1.0. The 208 historical run dirs flagged in `.planning/codebase/CONCERNS.md` are the relevant runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 208 historical run dirs under `.protostar/runs/` (per CONCERNS.md) — each contains `admission-decision.json` (Phase 1's intent-gate file). Some may also contain `intent.json` (ConfirmedIntent payload, schemaVersion 1.0.0, signature: null). | **No data migration.** Reader factory does try-new-then-legacy on filename (`intent-admission-decision.json` → fallback to `admission-decision.json`). Schema-version reader widens to enum `["1.0.0", "1.1.0"]` so Phase-1-era intents still validate. Never rename-on-read. |
| Live service config | None — no n8n/Tailscale/Cloudflare/Datadog services in this project. Verified by inspection of `package.json` and PROJECT.md. | None. |
| OS-registered state | None — no Task Scheduler / launchd / systemd / pm2 registrations referencing Protostar names. The CLI is invoked directly. | None. |
| Secrets / env vars | LM Studio endpoint, GitHub PAT, model names (per PROJECT.md L74). **None of these reference any string Phase 2 changes.** Phase 2 introduces no new secrets or env vars. | None. |
| Build artifacts / installed packages | `dist/` directories under each package — these will rebuild as part of normal Phase 2 implementation. New `packages/authority/` workspace package needs `pnpm install` after creation to register in workspace. | Standard `pnpm install` + `pnpm -r build` after package skeleton lands. |

**The canonical question — *after every file in the repo is updated, what runtime systems still have the old string cached?*** Only the 208 historical run dirs. Mitigated by reader-side backward-compat (no migration of historical data).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime + node:crypto | ✓ (assumed — Phase 1 already shipped) | ≥22 | — |
| pnpm | Workspace | ✓ | (existing) | — |
| TypeScript ^6.0.3 | Build | ✓ | 6.0.3+ | — |
| `node:crypto` | SHA-256 | ✓ (built-in) | — | — |
| `node:test` | Test runner | ✓ (built-in) | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

Phase 2 introduces zero new external dependencies — no audit needed beyond confirming Node 22 + pnpm + tsc are present (already established by Phase 1).

## Validation Architecture

> Required because `workflow.nyquist_validation: true` in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in, Node ≥22) |
| Config file | None — each package's `package.json` `"test"` script runs `node --test dist/**/*.test.js` |
| Quick run command | `pnpm --filter @protostar/authority test` (or owning package) |
| Full suite command | `pnpm run verify:full` (existing — runs every workspace package's tests) |

[VERIFIED: PROJECT.md L67 + Phase 1 plan 01-01-tiered-verify-scripts]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GOV-01 | Intersect 4 tiers, no conflict → resolved envelope returned | unit | `pnpm --filter @protostar/authority test` | ❌ Wave 0 |
| GOV-01 | Intersect 4 tiers, repo-policy denies tool X → status:"blocked-by-tier", blockedBy includes "repo-policy" | unit | same | ❌ Wave 0 |
| GOV-01 | Intersect, two tiers deny same axis → blockedBy lists BOTH | unit | same | ❌ Wave 0 |
| GOV-01 | precedence-decision.json artifact emitted only when status≠"no-conflict" | integration | `pnpm --filter @protostar/factory-cli test` | ❌ Wave 0 |
| GOV-02 | `AuthorizedWorkspaceOp` — three-layer contract test (positive keyof, negative keyof, runtime barrel grep) | contract | `pnpm --filter @protostar/admission-e2e test` | ❌ Wave 0 |
| GOV-02 | `AuthorizedSubprocessOp` — three-layer contract test | contract | same | ❌ Wave 0 |
| GOV-02 | `AuthorizedNetworkOp` — three-layer contract test | contract | same | ❌ Wave 0 |
| GOV-02 | `AuthorizedBudgetOp` — three-layer contract test | contract | same | ❌ Wave 0 |
| GOV-02 | `PrecedenceDecision` brand — three-layer contract test | contract | same | ❌ Wave 0 |
| GOV-02 | `SignedAdmissionDecision` brand — three-layer contract test | contract | same | ❌ Wave 0 |
| GOV-02 | Object literal cast to `AuthorizedWorkspaceOp` fails `tsc -b` | type-test | `pnpm --filter @protostar/authority build` | ❌ Wave 0 |
| GOV-03 | `package.json` exports allow `import { authorizeWorkspaceOp }` and reject `import { mintAuthorizedWorkspaceOp }` | contract | admission-e2e | ❌ Wave 0 |
| GOV-03 | `createAuthorityStageReader(runDir)` exposes only the documented method set; foreign keys absent | contract | `pnpm --filter @protostar/authority test` | ❌ Wave 0 |
| GOV-04 | `executionScope: "workspace"` grant + `trust: "untrusted"` → admission-time refusal with stage `"workspace-trust"` | unit | `pnpm --filter @protostar/intent test` (caller of predicate) | ❌ Wave 0 |
| GOV-04 | Same workspace mutated to untrusted mid-run → execution-time refusal in `packages/repo` | unit | `pnpm --filter @protostar/repo test` | ❌ Wave 0 |
| GOV-04 | CLI: `--trust trusted` without `--confirmed-intent` → exit code 2 + `trust-refusal.json` | integration | `pnpm --filter @protostar/factory-cli test` | ❌ Wave 0 |
| GOV-04 | CLI: `--trust trusted --confirmed-intent <valid-path>` → run proceeds | integration | same | ❌ Wave 0 |
| GOV-04 | Hardcoded `trust: "trusted"` removed from main.ts:333-337 — grep returns 0 hits | regression | `! grep -F 'trust: "trusted"' apps/factory-cli/src/main.ts` | ❌ Wave 0 |
| GOV-05 | Per-gate file `intent-admission-decision.json` written; `admission-decision.json` no longer written for new runs | integration | factory-cli | ❌ Wave 0 |
| GOV-05 | All 5 gates emit per-gate file on a happy-path run | integration | same | ❌ Wave 0 |
| GOV-05 | `admission-decisions.jsonl` index appended once per gate, schemaVersion-tagged | integration | same | ❌ Wave 0 |
| GOV-05 | Reader: legacy run dir (only `admission-decision.json`, no jsonl) → reader returns intent decision via fallback path; index returns `[]` | unit | `pnpm --filter @protostar/authority test` (with fixture) | ❌ Wave 0 |
| GOV-05 | `escalate` verdict path: emits `escalation-marker.json` distinct from refusal artifacts; exit code distinct from block | integration | factory-cli | ❌ Wave 0 |
| GOV-06 | `signConfirmedIntent` produces deterministic SHA-256 over canonicalized payload | unit | `pnpm --filter @protostar/authority test` | ❌ Wave 0 |
| GOV-06 | `verifyConfirmedIntentSignature` round-trip — sign + verify same inputs → ok:true | unit | same | ❌ Wave 0 |
| GOV-06 | Verifier rejects mutated intent body → mismatch.field === "intentBody" | unit | same | ❌ Wave 0 |
| GOV-06 | Verifier rejects mutated resolvedEnvelope → mismatch.field === "resolvedEnvelope" | unit | same | ❌ Wave 0 |
| GOV-06 | Verifier rejects stale policySnapshotHash → mismatch.field === "policySnapshotHash" | unit | same | ❌ Wave 0 |
| GOV-06 | Verifier rejects unknown canonicalForm tag (e.g. "json-c14n@2.0") → mismatch.field === "canonicalForm"; fail-closed | unit | same | ❌ Wave 0 |
| GOV-06 | Canonicalizer rejects NaN, Infinity, -0, undefined values | unit | same | ❌ Wave 0 |
| GOV-06 | `confirmed-intent.schema.json` accepts both `1.0.0` and `1.1.0` | schema-test | `pnpm --filter @protostar/intent test` | ❌ Wave 0 |
| GOV-06 | Phase 1 fixture (signature: null, schemaVersion: 1.0.0) still validates | regression | `pnpm --filter @protostar/intent test` | partial — `clarification-report-schema.test.ts` exists |

### Sampling Rate

- **Per task commit:** owning package's `pnpm --filter <pkg> test` (≤ 30s per package)
- **Per wave merge:** `pnpm run verify:full` (full suite green)
- **Phase gate:** Full suite green + admission-e2e contract tests green + `pnpm run factory --dry-run` smoke against fixtures matrix → `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/authority/package.json` + `tsconfig.json` + skeleton `src/index.ts` — package does not exist yet
- [ ] `packages/authority/src/precedence/precedence-intersection.test.ts`
- [ ] `packages/authority/src/signature/canonicalize.test.ts` (covers all rejection cases)
- [ ] `packages/authority/src/signature/verify-signature.test.ts`
- [ ] `packages/authority/src/stage-reader/factory.test.ts` (covers legacy-fallback path)
- [ ] `packages/authority/src/workspace-trust/predicate.test.ts`
- [ ] `packages/authority/src/internal/brand-witness.ts` (six brand witness re-exports)
- [ ] `packages/authority/src/internal/test-builders.ts` (six test-builder fns)
- [ ] `packages/admission-e2e/src/authorized-workspace-op-mint.contract.test.ts`
- [ ] `packages/admission-e2e/src/authorized-subprocess-op-mint.contract.test.ts`
- [ ] `packages/admission-e2e/src/authorized-network-op-mint.contract.test.ts`
- [ ] `packages/admission-e2e/src/authorized-budget-op-mint.contract.test.ts`
- [ ] `packages/admission-e2e/src/precedence-decision-mint.contract.test.ts`
- [ ] `packages/admission-e2e/src/signed-admission-decision-mint.contract.test.ts`
- [ ] `apps/factory-cli/src/two-key-launch.test.ts`
- [ ] `apps/factory-cli/src/admission-decisions-jsonl.test.ts`
- [ ] `apps/factory-cli/src/escalation-marker.test.ts`
- [ ] `packages/repo/src/workspace-trust-runtime.test.ts`

No framework install needed — `node:test` is built-in and already used. Phase 1's `verify:full` script will pick up the new package once it exists in `pnpm-workspace.yaml`.

## Security Domain

> `security_enforcement` is implicitly enabled (config has no opt-out).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No human auth surface in this phase. The "two-key" CLI launch is operator policy, not authentication. |
| V3 Session Management | no | Single-shot CLI invocation; no sessions. |
| V4 Access Control | yes | Capability envelope IS the access-control mechanism. AuthorizedOp brands enforce at compile-time + runtime. |
| V5 Input Validation | yes | `.protostar/repo-policy.json` parsing (untrusted file content). `ConfirmedIntent` JSON parsing. CLI argument validation. Use schemaVersion-pinned JSON Schemas (Phase 1 plan 04 pattern). |
| V6 Cryptography | yes | SHA-256 via `node:crypto` only. **Never hand-roll.** Q-15 lock. |
| V7 Error Handling | yes | Verifier returns structured `SignatureMismatch` evidence; never leaks raw bytes of expected/actual hashes beyond hex digests. |
| V14 Configuration | yes | `.protostar/repo-policy.json` parse must reject unknown top-level keys (`additionalProperties: false`); fail-closed on schemaVersion mismatch. |

### Known Threat Patterns for Protostar Phase 2

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged ConfirmedIntent (bypass admission) | Spoofing | Module-private brand mint + admission-e2e contract test pinning sole producer (Phase 1 lock; Phase 2 extends to AuthorizedOp brands) |
| Forged AuthorizedOp (skip envelope check) | Elevation of Privilege | Same — six new branded types, six contract tests |
| Tampered ConfirmedIntent in transit between stages | Tampering | SHA-256 signature over (intent + resolvedEnvelope + policySnapshotHash); central verifier called before each stage acts (Q-17) |
| Policy drift between admission and execution | Tampering | `policy-snapshot.json` + `policySnapshotHash` in signature payload (Q-16) |
| Malicious `.protostar/repo-policy.json` (e.g. widening capability) | Tampering / EoP | Intersection rule (Q-02): no tier can WIDEN. Even a hostile repo-policy can only narrow; a hostile policy that "widens" is silently ignored under intersection. |
| Forgotten boundary check | EoP | Boundaries accept ONLY `AuthorizedXOp` branded types; calling them with raw data fails `tsc -b`. |
| Unknown `canonicalForm` tag (downgrade attack) | Tampering | Verifier fail-closes on unknown tags (registry dispatch) |
| Replay of old signed intent | Tampering | `policySnapshotHash` covers a snapshot file; if policy changed since admission, hash differs, verifier rejects |
| Trust-bypass via hardcoded `trust: "trusted"` | EoP | Q-11 removes the hardcode; CLI default is `untrusted`; `trusted` requires two-key launch |
| Malformed JSON injection via `intent.json` parse | Tampering | Existing `parseConfirmedIntent` rejects non-record / unknown shape; schema validates schemaVersion enum |

## Sources

### Primary (HIGH confidence — verified in this session)

- `[VERIFIED]` `.planning/phases/02-authority-governance-kernel/02-CONTEXT.md` — all 18 locked decisions
- `[VERIFIED]` `.planning/REQUIREMENTS.md` §"Phase 2" — GOV-01..06
- `[VERIFIED]` `.planning/PROJECT.md` — constraints, authority boundary, dep-light posture
- `[VERIFIED]` `AGENTS.md` — package boundaries, authority boundary
- `[VERIFIED]` `packages/intent/src/admission-decision.ts` — `ADMISSION_DECISION_OUTCOMES` already includes `escalate` (line 28); current intent-only artifact shape Phase 2 generalizes
- `[VERIFIED]` `packages/intent/src/confirmed-intent.ts` — brand pattern at lines 13-17, mint at 92-116, `SignatureEnvelope` shape at 19-22, schemaVersion at 38, signature slot at 39
- `[VERIFIED]` `packages/intent/schema/confirmed-intent.schema.json` — schemaVersion `const: "1.0.0"`, `signature` `oneOf [null, {algorithm, value}]`
- `[VERIFIED]` `packages/repo/src/index.ts` — `WorkspaceRef.trust` field declared but unused
- `[VERIFIED]` `apps/factory-cli/src/main.ts:333-337` — current hardcoded `trust: "trusted"`; `writeRefusalArtifacts` at 605-632; `resolveRefusalsIndexPath` at 596-603
- `[VERIFIED]` `packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` — three-layer contract template (positive Equal, negative keyof, runtime grep)
- `[VERIFIED]` `.planning/phases/01-intent-planning-admission/01-04-schema-version-infra-PLAN.md` — schemaVersion infra pattern
- `[VERIFIED]` `.planning/phases/01-intent-planning-admission/01-08-refusal-artifact-layout-PLAN.md` — `runs/{id}/` + JSONL index pattern; `formatRefusalIndexLine` shape
- `[VERIFIED]` `.planning/phases/01-intent-planning-admission/01-06b-branded-confirmed-intent-PLAN.md` — three-layer brand guard template, internal/test-builders subpath pattern

### Secondary (MEDIUM confidence — single source, well-known)

- `[CITED]` RFC 8785 (https://www.rfc-editor.org/rfc/rfc8785) — JSON Canonicalization Scheme; ECMAScript number→string is RFC-compatible (§3.2.2.3); object keys sorted by UTF-16 code unit (§3.2.3); `JSON.stringify` string escaping is RFC 8259 compatible

### Tertiary (LOW confidence — proposed by researcher, not user-ratified)

- `[ASSUMED]` `json-c14n@1.0` exact spec (rejection rules: NaN/Infinity/-0/undefined). User locked the *tag*; this researcher proposes the spec.
- `[ASSUMED]` `.protostar/repo-policy.json` field set (`schemaVersion`, `allowedScopes`, `deniedTools`, `budgetCaps`, `trustOverride`).
- `[ASSUMED]` Default-permissive when `repo-policy.json` is absent (Phase 2 has no real I/O; absence = no constraint from this tier).
- `[ASSUMED]` Confirmed-intent CLI flag name: `--confirmed-intent <path>`.
- `[ASSUMED]` Escalation marker artifact filename: `escalation-marker.json`.
- `[ASSUMED]` `escalate` exit code distinct from `block` exit code (recommend 2 vs 1; current refusal exits 1).
- `[ASSUMED]` Budget-tracker unit: abstract `BudgetUnit` (concrete unit deferred to a future phase per PROJECT.md "POST-05 Token-budget unit").
- `[ASSUMED]` schemaVersion bump: widen to enum `["1.0.0", "1.1.0"]` rather than hard-bump (preserves backward compat for any 1.0.0-tagged historical intents).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `json-c14n@1.0` rejects NaN/Infinity/-0/undefined and uses sorted-keys + JSON.stringify defaults | Pattern 3 + Code Examples | If user wanted strict RFC 8785 conformance: planner must swap canonicalizer impl, but verifier dispatch + tag stay — low cost. |
| A2 | `.protostar/repo-policy.json` has `schemaVersion`, `allowedScopes`, `deniedTools`, `budgetCaps`, `trustOverride` | repo-policy schema | If field set differs: schema file changes; intersection algorithm only consumes whatever fields exist. Low cost. |
| A3 | Default-permissive when repo-policy.json absent | Pitfall 4 + repo-policy section | If user wants default-deny: every Phase 2 fixture run breaks until a repo-policy.json is added — flag for confirmation BEFORE planner commits. |
| A4 | `--confirmed-intent <path>` flag name | Two-key launch | Low — bikeshed. |
| A5 | `escalation-marker.json` filename | Q-12 wiring | Low — bikeshed. |
| A6 | Escalate exit code = 2, block = 1 | Pitfall 1, two-key launch | Low — but planner MUST pick distinct codes. |
| A7 | Budget-tracker unit is abstract `BudgetUnit` | Architectural Map row 9 | If user wants concrete tokens / USD-cents now: trivial to widen. POST-05 explicitly defers concrete unit to v1.0+. |
| A8 | schemaVersion bumps to widened enum `["1.0.0", "1.1.0"]` not hard-bump to "1.1.0" | Pitfall 6 | If hard-bump preferred: any historical run dir with intent.json fails 1.1.0 schema validation. Recommend planner first greps for `intent.json` files in `.protostar/runs/` to count actual exposure before deciding. |

**These 8 items should be raised in `/gsd-discuss-phase`-style follow-up OR locked-in by the planner with a brief justification.** A3 (default-deny vs. default-permissive) is the highest-risk one — flag explicitly.

## Open Questions

1. **Of the 208 historical run dirs, how many actually contain a `ConfirmedIntent` artifact (`intent.json` with schemaVersion: 1.0.0)?**
   - What we know: all 208 contain at least an intent-gate `admission-decision.json` (Phase 1 always writes it).
   - What's unclear: whether any actually finished promotion to write `intent.json` (depends on how many Phase 1 runs were happy-path).
   - Recommendation: Wave 0 task = `find .protostar/runs -name intent.json | wc -l` to count. Result drives A8 decision.

2. **`policy-snapshot.json` content scope.**
   - What we know: Q-16 says it's hash-addressable and small.
   - What's unclear: Should it include the `archetypePolicy` (cosmetic-tweak admission policy) only, or also the loaded `.protostar/repo-policy.json`?
   - Recommendation: include BOTH — that's what "policy snapshot" means at this phase. Schema-versioned object with two top-level keys.

3. **`@protostar/policy` vs `@protostar/authority` boundary.**
   - What we know: 02-CONTEXT.md `<specifics>` says shared admission-decision base lives in `@protostar/authority`. Q-01 keeps `@protostar/policy` from becoming a god-package.
   - What's unclear: does `@protostar/policy` keep its current admission re-exports (`packages/policy/src/admission.ts`)? Likely yes — it's the consumer surface; authority is the producer.
   - Recommendation: planner should verify `packages/policy/src/admission.ts` after package skeleton lands and confirm no import cycle (authority → policy or vice versa). The architectural map puts authority at the bottom of the dep graph.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — verified zero new deps; everything built-in or workspace.
- Architecture patterns: HIGH — six brand mints + reader factory + verifier are all direct templates from Phase 1.
- Pitfalls: HIGH — pitfalls 1, 2, 4, 5, 6 all verified against current codebase state.
- Canonicalization spec: MEDIUM-HIGH — RFC 8785 cited; exact spec proposed (A1 [ASSUMED]).
- `.protostar/repo-policy.json` schema: LOW-MEDIUM — proposed (A2, A3 [ASSUMED]); user has only locked the file existing + being JSON.
- Validation Architecture: HIGH — every test mapped to a concrete file path, all use `node:test`.

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (30 days for stable Phase 2 contracts; longer for the `node:crypto` and RFC 8785 portions).
