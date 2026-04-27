---
phase: 02-authority-governance-kernel
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - packages/authority/src/authorized-ops/workspace-op.ts
  - packages/authority/src/authorized-ops/subprocess-op.ts
  - packages/authority/src/authorized-ops/network-op.ts
  - packages/authority/src/authorized-ops/budget-op.ts
  - packages/authority/src/authorized-ops/index.ts
  - packages/authority/src/budget/tracker.ts
  - packages/authority/src/budget/aggregator.ts
  - packages/authority/src/authorized-ops/authorized-ops.test.ts
  - packages/authority/package.json
  - packages/authority/tsconfig.json
autonomous: true
requirements:
  - GOV-02
must_haves:
  truths:
    - "Four AuthorizedOp brands exist (`AuthorizedWorkspaceOp`, `AuthorizedSubprocessOp`, `AuthorizedNetworkOp`, `AuthorizedBudgetOp`) — only obtainable via the kernel's `authorize*Op` producers"
    - "Module-private mints (`mintAuthorizedXOp`) exist for each brand and are NOT re-exported from `@protostar/authority`'s public barrel"
    - "Each brand has a brand-witness re-export under `@protostar/authority/internal/brand-witness` for downstream contract tests"
    - "Each brand has a test-builder helper under `@protostar/authority/internal/test-builders` for use only by the admission-e2e package"
    - "Per-boundary budget tracker interface + central aggregator interface (Q-07) shipped as types only — no runtime implementation"
    - "Authority boundary preserved: zero `node:fs` imports under `packages/authority/src/`"
  artifacts:
    - path: packages/authority/src/authorized-ops/workspace-op.ts
      provides: "AuthorizedWorkspaceOp brand + module-private mintAuthorizedWorkspaceOp + public producer authorizeWorkspaceOp"
      exports: ["AuthorizedWorkspaceOp", "AuthorizedWorkspaceOpData", "authorizeWorkspaceOp"]
    - path: packages/authority/src/authorized-ops/subprocess-op.ts
      provides: "AuthorizedSubprocessOp brand + authorizeSubprocessOp (contracts only — Phase 3 wires real subprocess)"
      exports: ["AuthorizedSubprocessOp", "AuthorizedSubprocessOpData", "authorizeSubprocessOp"]
    - path: packages/authority/src/authorized-ops/network-op.ts
      provides: "AuthorizedNetworkOp brand + authorizeNetworkOp (contracts only)"
      exports: ["AuthorizedNetworkOp", "AuthorizedNetworkOpData", "authorizeNetworkOp"]
    - path: packages/authority/src/authorized-ops/budget-op.ts
      provides: "AuthorizedBudgetOp brand + authorizeBudgetOp"
      exports: ["AuthorizedBudgetOp", "AuthorizedBudgetOpData", "authorizeBudgetOp", "BudgetUnit"]
    - path: packages/authority/src/budget/tracker.ts
      provides: "BoundaryBudgetTracker interface (per-boundary counter contract, Q-07)"
      exports: ["BoundaryBudgetTracker"]
    - path: packages/authority/src/budget/aggregator.ts
      provides: "CentralBudgetAggregator interface (sums per-boundary counters)"
      exports: ["CentralBudgetAggregator"]
    - path: packages/authority/src/internal/brand-witness.ts
      provides: "Brand witness re-exports for the 4 AuthorizedOp brands"
      exports: ["AuthorizedWorkspaceOpBrandWitness", "AuthorizedSubprocessOpBrandWitness", "AuthorizedNetworkOpBrandWitness", "AuthorizedBudgetOpBrandWitness"]
    - path: packages/authority/src/internal/test-builders.ts
      provides: "Test-only builders that mint AuthorizedOps without going through the kernel checks"
      exports: ["buildAuthorizedWorkspaceOpForTest", "buildAuthorizedSubprocessOpForTest", "buildAuthorizedNetworkOpForTest", "buildAuthorizedBudgetOpForTest"]
  key_links:
    - from: packages/authority/src/index.ts
      to: packages/authority/src/authorized-ops/index.ts
      via: "barrel re-export of authorize* producers (NOT mints)"
      pattern: "authorizeWorkspaceOp"
    - from: packages/authority/src/authorized-ops/workspace-op.ts
      to: "@protostar/intent (CapabilityEnvelope, WorkspaceRef)"
      via: "type-only import"
      pattern: "import type"
---

<objective>
Wave 1 / parallel-friendly: instantiate the Phase 1 brand-mint pattern four times for the four authority boundaries (workspace, subprocess, network, budget). Each brand has a module-private `unique symbol` mint, a single public producer (`authorizeXOp`), a brand-witness re-export, and a test-builder. Also ships the per-boundary budget tracker interface + central aggregator interface (Q-07) — types only; Phase 4+ wires real counters.

Per Q-05 (locked): "Branded operation types. Each boundary accepts only branded inputs. The only way to get the brand is through the authority kernel's check." Per Q-06 (locked): "Contracts + helpers only. Phase 3 wires real I/O." Per Q-07 (locked): per-boundary trackers + central aggregator.

Per RESEARCH.md anti-pattern: do NOT redefine `escalate` — it already exists at `packages/intent/src/admission-decision.ts:28`. This plan does not touch that literal.

Per A7 lock: `BudgetUnit = number` aliased per-boundary; concrete unit (token vs usd-cents) deferred to Phase 4.

Purpose: Without these brands, GOV-02 is uncheckable — any boundary could "forget" to validate. Compile-time enforcement matches Phase 1's `ConfirmedIntent`/`AdmittedPlan` ceiling.

Output: Four branded types ready to be consumed by Wave 3 (factory-cli wiring) and Wave 4 (admission-e2e contract tests in Plan 10).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>

Read first: @.planning/phases/02-authority-governance-kernel/02-CORRECTIONS.md (root-barrel + internal/* are pre-populated by Plan 01 — do NOT add them to files_modified; see Correction 1)
@.planning/PROJECT.md
@.planning/phases/02-authority-governance-kernel/02-CONTEXT.md
@.planning/phases/02-authority-governance-kernel/02-RESEARCH.md
@.planning/phases/02-authority-governance-kernel/02-VALIDATION.md
@.planning/phases/01-intent-planning-admission/01-06b-branded-confirmed-intent-PLAN.md
@.planning/phases/01-intent-planning-admission/01-07-branded-admitted-plan-PLAN.md
@packages/intent/src/confirmed-intent.ts
@packages/intent/src/internal/brand-witness.ts
@packages/intent/src/internal/test-builders.ts
@packages/intent/src/capability-admission.ts
@packages/intent/src/capability-grant-admission.ts
@packages/repo/src/index.ts

<interfaces>
<!-- Templates from Phase 1. Copy verbatim. -->

From packages/intent/src/confirmed-intent.ts (mint pattern):
```ts
declare const ConfirmedIntentBrand: unique symbol;
export interface ConfirmedIntentBaseShape { /* data */ }
export type ConfirmedIntent = ConfirmedIntentBaseShape & {
  readonly [ConfirmedIntentBrand]: true;
};
export function mintConfirmedIntent(input: ConfirmedIntentMintInput): ConfirmedIntent {
  // validate, copy, deepFreeze
  return deepFreeze(data) as ConfirmedIntent;
}
```

From packages/intent/src/internal/brand-witness.ts (re-export pattern):
```ts
import type { ConfirmedIntent } from "../confirmed-intent.js";
export type ConfirmedIntentBrandWitness = ConfirmedIntent;
```

From packages/intent/src/internal/test-builders.ts (test-only builder):
```ts
export function buildConfirmedIntentForTest(overrides?: ...): ConfirmedIntent {
  return mintConfirmedIntent({ /* defaults */ });
}
```

From @protostar/intent public surface (consumed via type-only imports):
- `CapabilityEnvelope` (from `@protostar/intent`) — the post-intersection envelope
- `WorkspaceRef` from `@protostar/repo` (path, trust: "trusted"|"untrusted")
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create the four AuthorizedOp brand modules</name>
  <files>
    packages/authority/src/authorized-ops/workspace-op.ts,
    packages/authority/src/authorized-ops/subprocess-op.ts,
    packages/authority/src/authorized-ops/network-op.ts,
    packages/authority/src/authorized-ops/budget-op.ts,
    packages/authority/src/authorized-ops/index.ts,
    packages/authority/src/authorized-ops/authorized-ops.test.ts,
    packages/authority/package.json,
    packages/authority/tsconfig.json
  </files>
  <read_first>
    - packages/intent/src/confirmed-intent.ts (mint template — lines 13-17 brand declare, 92-116 mintConfirmedIntent)
    - packages/intent/src/capability-admission.ts (CapabilityEnvelope shape; how envelopes describe constraints)
    - packages/intent/src/capability-grant-admission.ts (existing capability-grant flow that authorizeWorkspaceOp augments at runtime)
    - packages/repo/src/index.ts (WorkspaceRef.trust shape — consumed by authorizeWorkspaceOp)
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Pattern 1: Module-Private Brand Mint" (lines ~191-260) for the verbatim template
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-05, Q-06, A7
  </read_first>
  <behavior>
    - For each of the 4 brands: a `unique symbol` is declared but NOT exported; the brand is structurally unforgeable from outside the module
    - Module-private `mintAuthorizedXOp(data)` exists, freezes input, casts to brand
    - Public `authorizeXOp(input, env)` is the SOLE non-test producer; performs the kernel check (Q-05) and calls `mintAuthorizedXOp` on success or returns a failure Result on denial
    - `authorizeWorkspaceOp` REJECTS when `workspace.trust !== "trusted"` AND `op.access !== "read"` — wires GOV-04 admission-time half (the runtime half lives in packages/repo, Plan 09)
    - For subprocess + network: `authorizeXOp` is contracts-only — accepts an envelope + op spec, returns a branded result if envelope permits; Phase 3 supplies real op specs
    - The barrel `authorized-ops/index.ts` re-exports ONLY the public producer functions and the brand TYPES, never the mint functions
    - Authority boundary: zero `node:fs` imports anywhere in this task's files
  </behavior>
  <action>
For each brand, follow the **exact template** from `packages/intent/src/confirmed-intent.ts:13-17, 92-116`. Module structure (one file per brand):

**`packages/authority/src/authorized-ops/workspace-op.ts`:**
```ts
import type { CapabilityEnvelope } from "@protostar/intent";
import type { WorkspaceRef } from "@protostar/repo";

declare const AuthorizedWorkspaceOpBrand: unique symbol;

export interface AuthorizedWorkspaceOpData {
  readonly workspace: WorkspaceRef;
  readonly path: string;          // workspace-relative
  readonly access: "read" | "write" | "execute";
  readonly resolvedEnvelope: CapabilityEnvelope;  // post-intersection envelope
}

export type AuthorizedWorkspaceOp = AuthorizedWorkspaceOpData & {
  readonly [AuthorizedWorkspaceOpBrand]: true;
};

// Module-private. NOT re-exported from `./index.ts` or `../index.ts`.
function mintAuthorizedWorkspaceOp(data: AuthorizedWorkspaceOpData): AuthorizedWorkspaceOp {
  return Object.freeze({ ...data }) as AuthorizedWorkspaceOp;
}

export type AuthorizeWorkspaceOpResult =
  | { readonly ok: true;  readonly authorized: AuthorizedWorkspaceOp; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

export function authorizeWorkspaceOp(input: AuthorizedWorkspaceOpData): AuthorizeWorkspaceOpResult {
  const errors: string[] = [];

  // GOV-04 admission-time predicate (Q-10): write/execute requires trust="trusted"
  if (input.access !== "read" && input.workspace.trust !== "trusted") {
    errors.push(
      `workspace ${input.workspace.path} has trust="${input.workspace.trust}"; ` +
      `${input.access} requires trust="trusted"`,
    );
  }
  // additional envelope-axis checks (executionScope, allowedTools, etc.) go here;
  // Wave 2's precedence kernel produces resolvedEnvelope, this is the post-check
  // gate that confirms a specific op fits within it.

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, authorized: mintAuthorizedWorkspaceOp(input), errors: [] };
}

// Allow internal/test-builders + sibling modules in this dir to import the mint by name
// via a sibling-only export. To prevent leakage from the package public surface, the
// barrel `./index.ts` MUST NOT re-export this. (Phase 1 enforces this with a contract test.)
export { mintAuthorizedWorkspaceOp };
```

Note on the sibling-export trap: Phase 1's `mintConfirmedIntent` is exported by name from its module so `internal/test-builders.ts` and `promote-intent-draft.ts` can use it; the leak prevention is at the BARREL level (`packages/intent/src/index.ts` does not re-export it) plus the admission-e2e contract test. Mirror this exactly — `mintAuthorizedWorkspaceOp` is exported from `workspace-op.ts` but NOT from `authorized-ops/index.ts` and NOT from `src/index.ts`.

**`packages/authority/src/authorized-ops/subprocess-op.ts`** (Q-06: contracts only):
```ts
import type { CapabilityEnvelope } from "@protostar/intent";

declare const AuthorizedSubprocessOpBrand: unique symbol;

export interface AuthorizedSubprocessOpData {
  readonly command: string;       // executable (allowlist enforced by Phase 3 packages/repo runner)
  readonly args: readonly string[];
  readonly cwd: string;           // workspace-relative
  readonly resolvedEnvelope: CapabilityEnvelope;
}

export type AuthorizedSubprocessOp = AuthorizedSubprocessOpData & {
  readonly [AuthorizedSubprocessOpBrand]: true;
};

function mintAuthorizedSubprocessOp(data: AuthorizedSubprocessOpData): AuthorizedSubprocessOp {
  return Object.freeze({ ...data, args: Object.freeze([...data.args]) }) as AuthorizedSubprocessOp;
}

export type AuthorizeSubprocessOpResult =
  | { readonly ok: true;  readonly authorized: AuthorizedSubprocessOp; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

export function authorizeSubprocessOp(input: AuthorizedSubprocessOpData): AuthorizeSubprocessOpResult {
  // Phase 2 contracts only: accept any envelope-shaped input; refuse only on
  // structurally-invalid args (e.g. shell metachar in command). Real allowlist
  // enforcement lives in packages/repo (Phase 3, REPO-04).
  const errors: string[] = [];
  if (input.command.includes(" ") || /[;&|`$<>]/.test(input.command)) {
    errors.push(`subprocess command "${input.command}" must not contain shell metacharacters`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, authorized: mintAuthorizedSubprocessOp(input), errors: [] };
}

export { mintAuthorizedSubprocessOp };
```

**`packages/authority/src/authorized-ops/network-op.ts`** (Q-06: contracts only):
- Same shape. `AuthorizedNetworkOpData` = `{ method: "GET"|"POST"|...; url: string; resolvedEnvelope: CapabilityEnvelope }`. `authorizeNetworkOp` checks URL is parseable + protocol is http/https. Real egress filter is Phase 6/7.

**`packages/authority/src/authorized-ops/budget-op.ts`** (per A7 lock):
- `export type BudgetUnit = number;` (per A7 — token/usd-cents-agnostic; aliased per-boundary; concrete unit choice deferred to Phase 4).
- `AuthorizedBudgetOpData` = `{ boundary: "subprocess"|"network"|"judge-panel"; amount: BudgetUnit; resolvedEnvelope: CapabilityEnvelope }`.
- `authorizeBudgetOp` checks `amount >= 0` and `Number.isFinite(amount)`. Per-boundary running totals are tracked by `BoundaryBudgetTracker` (Task 2).

**`packages/authority/src/authorized-ops/index.ts`** (PUBLIC barrel for this subdir):
```ts
export {
  authorizeWorkspaceOp,
} from "./workspace-op.js";
export type {
  AuthorizedWorkspaceOp,
  AuthorizedWorkspaceOpData,
  AuthorizeWorkspaceOpResult,
} from "./workspace-op.js";

// Repeat for subprocess, network, budget.
// CRITICAL: do NOT re-export any `mintAuthorizedXOp` here.
```

**Update `packages/authority/src/index.ts`** to re-export from `./authorized-ops/index.js`. Do NOT export mints.

**Update `packages/authority/tsconfig.json`** `references` to add `[{path: "../intent"}, {path: "../repo"}]`.

**Update `packages/authority/package.json`** to add `"@protostar/intent": "workspace:*"` and `"@protostar/repo": "workspace:*"` to `dependencies`.

**`packages/authority/src/authorized-ops/authorized-ops.test.ts`** (`node:test`):
- For each of 4 brands: success case (valid input → `ok: true`; result is frozen)
- For each: structural-failure case (e.g. `authorizeWorkspaceOp` with `trust: "untrusted"` + `access: "write"` → `ok: false`; errors array non-empty; no `authorized` field)
- `authorizeBudgetOp` rejects negative + non-finite
- `authorizeSubprocessOp` rejects shell metacharacters
- Round-trip: `authorizeWorkspaceOp` returns a frozen object — assigning to it throws (TypeError under strict)
  </action>
  <verify>
    <automated>pnpm --filter @protostar/authority test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/authority test` exits 0
    - `pnpm --filter @protostar/authority build` exits 0
    - `grep -c 'export.*authorizeWorkspaceOp' packages/authority/src/authorized-ops/workspace-op.ts` >= 1
    - `grep -c 'export.*authorizeSubprocessOp' packages/authority/src/authorized-ops/subprocess-op.ts` >= 1
    - `grep -c 'export.*authorizeNetworkOp' packages/authority/src/authorized-ops/network-op.ts` >= 1
    - `grep -c 'export.*authorizeBudgetOp' packages/authority/src/authorized-ops/budget-op.ts` >= 1
    - `grep -v '^#' packages/authority/src/index.ts | grep -c 'mintAuthorized'` outputs `0` (mints not re-exported from public barrel)
    - `grep -v '^#' packages/authority/src/authorized-ops/index.ts | grep -c 'mintAuthorized'` outputs `0` (not re-exported from subdir barrel either)
    - `grep -RIn "from ['\"]node:fs['\"]\\|from ['\"]fs['\"]" packages/authority/src/ | grep -v '^#' | wc -l` outputs `0`
    - All 4 brand files contain `unique symbol` (`grep -c 'unique symbol' packages/authority/src/authorized-ops/*.ts | grep -v ':0'` returns 4 lines)
  </acceptance_criteria>
  <done>Four AuthorizedOp brands ship with sole-public-producer pattern; package builds; admission-time trust check wired for workspace ops.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Brand witnesses + test-builders + budget tracker/aggregator interfaces</name>
  <files>
    packages/authority/src/internal/brand-witness.ts,
    packages/authority/src/internal/test-builders.ts,
    packages/authority/src/budget/tracker.ts,
    packages/authority/src/budget/aggregator.ts,
    packages/authority/src/budget/budget.test.ts
  </files>
  <read_first>
    - packages/intent/src/internal/brand-witness.ts (re-export template — copy structure)
    - packages/intent/src/internal/test-builders.ts (test-builder template — uses sibling mint imports)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-07
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Pattern 1" + Recommended Project Structure for budget/ layout
  </read_first>
  <behavior>
    - `internal/brand-witness.ts` re-exports the 4 brand types as `<Brand>BrandWitness` aliases (admission-e2e in Plan 10 imports these)
    - `internal/test-builders.ts` exposes `buildAuthorizedXOpForTest` for each brand — uses sibling-module mint imports, not the public producer (so test fixtures aren't gated by GOV-04 trust check)
    - `BoundaryBudgetTracker` interface specifies: `record(op: AuthorizedBudgetOp): void`, `total(): BudgetUnit`, `boundary: BoundaryName`
    - `CentralBudgetAggregator` interface: `register(tracker: BoundaryBudgetTracker): void`, `total(): BudgetUnit`, `withinEnvelope(envelope: CapabilityEnvelope): boolean`
    - Both budget interfaces are types only (no concrete classes) in Phase 2
    - One test asserting the interface shapes via type-level Assert (compiles or doesn't)
  </behavior>
  <action>
**`packages/authority/src/internal/brand-witness.ts`** — replace the placeholder from Plan 01:
```ts
import type { AuthorizedWorkspaceOp } from "../authorized-ops/workspace-op.js";
import type { AuthorizedSubprocessOp } from "../authorized-ops/subprocess-op.js";
import type { AuthorizedNetworkOp } from "../authorized-ops/network-op.js";
import type { AuthorizedBudgetOp } from "../authorized-ops/budget-op.js";

export type AuthorizedWorkspaceOpBrandWitness = AuthorizedWorkspaceOp;
export type AuthorizedSubprocessOpBrandWitness = AuthorizedSubprocessOp;
export type AuthorizedNetworkOpBrandWitness = AuthorizedNetworkOp;
export type AuthorizedBudgetOpBrandWitness = AuthorizedBudgetOp;
```

**`packages/authority/src/internal/test-builders.ts`** — replace the placeholder. Mirror `packages/intent/src/internal/test-builders.ts` shape. Each builder accepts `Partial<AuthorizedXOpData>` overrides, fills sensible defaults, and calls the sibling-module mint directly (NOT the public producer — test fixtures must be able to construct an `AuthorizedWorkspaceOp` for an `untrusted` workspace if the test specifically wants that shape):

```ts
import {
  type AuthorizedWorkspaceOpData,
  type AuthorizedWorkspaceOp,
  mintAuthorizedWorkspaceOp,
} from "../authorized-ops/workspace-op.js";
// ... same imports for the other 3

export function buildAuthorizedWorkspaceOpForTest(
  overrides: Partial<AuthorizedWorkspaceOpData> = {},
): AuthorizedWorkspaceOp {
  const defaults: AuthorizedWorkspaceOpData = {
    workspace: { path: "/tmp/test-workspace", trust: "trusted" },
    path: "src/example.ts",
    access: "read",
    resolvedEnvelope: { /* minimal envelope */ } as CapabilityEnvelope,
  };
  return mintAuthorizedWorkspaceOp({ ...defaults, ...overrides });
}
// Repeat for buildAuthorizedSubprocessOpForTest, buildAuthorizedNetworkOpForTest, buildAuthorizedBudgetOpForTest
```

For `WorkspaceRef`/`CapabilityEnvelope` defaults: import the test-builders from `@protostar/intent/internal/test-builders` if they exist (Phase 1 shipped `buildConfirmedIntentForTest` which contains a sample envelope) — otherwise inline a minimal valid envelope. Do not duplicate logic.

**`packages/authority/src/budget/tracker.ts`** (interface only, Q-07):
```ts
import type { AuthorizedBudgetOp, BudgetUnit } from "../authorized-ops/budget-op.js";

export type BoundaryName = "subprocess" | "network" | "judge-panel";

export interface BoundaryBudgetTracker {
  readonly boundary: BoundaryName;
  record(op: AuthorizedBudgetOp): void;
  total(): BudgetUnit;
}
```

**`packages/authority/src/budget/aggregator.ts`** (interface only):
```ts
import type { CapabilityEnvelope } from "@protostar/intent";
import type { BudgetUnit } from "../authorized-ops/budget-op.js";
import type { BoundaryBudgetTracker } from "./tracker.js";

export interface CentralBudgetAggregator {
  register(tracker: BoundaryBudgetTracker): void;
  total(): BudgetUnit;
  withinEnvelope(envelope: CapabilityEnvelope): boolean;
}
```

**`packages/authority/src/budget/budget.test.ts`** — type-level assertion that the interfaces compile + a tiny in-memory tracker stub (test-only; not exported) verifying the contract shape:

```ts
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import type { BoundaryBudgetTracker, CentralBudgetAggregator } from "../budget/aggregator.js";
import { buildAuthorizedBudgetOpForTest } from "../internal/test-builders.js";

class InMemoryTracker implements BoundaryBudgetTracker {
  readonly boundary = "subprocess" as const;
  #total = 0;
  record(op: AuthorizedBudgetOp) { this.#total += op.amount; }
  total() { return this.#total; }
}

describe("budget tracker contract", () => {
  it("records authorized ops and returns running total", () => {
    const t = new InMemoryTracker();
    t.record(buildAuthorizedBudgetOpForTest({ amount: 5 }));
    t.record(buildAuthorizedBudgetOpForTest({ amount: 3 }));
    assert.equal(t.total(), 8);
  });
});
```

**Wire `internal/brand-witness` and `internal/test-builders` and the four authorized-op type re-exports into `packages/authority/src/index.ts`** — but ONLY the public producer `authorize*Op` functions and brand TYPES, never `mint*` and never the test-builders.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/authority test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/authority test` exits 0
    - `grep -c 'BrandWitness' packages/authority/src/internal/brand-witness.ts` >= 4 (one per brand)
    - `grep -c 'ForTest' packages/authority/src/internal/test-builders.ts` >= 4
    - `grep -v '^#' packages/authority/src/index.ts | grep -c 'ForTest'` outputs `0` (test-builders never on public surface)
    - `grep -c 'BoundaryBudgetTracker' packages/authority/src/budget/tracker.ts` >= 1
    - `grep -c 'CentralBudgetAggregator' packages/authority/src/budget/aggregator.ts` >= 1
    - File `packages/authority/src/budget/budget.test.ts` exists and runs
    - `node -e "const m = require('./packages/authority/dist/internal/test-builders.js'); if (typeof m.buildAuthorizedWorkspaceOpForTest !== 'function') process.exit(1)"` exits 0 (subpath import works post-build)
  </acceptance_criteria>
  <done>Brand witnesses, test-builders, and budget interfaces shipped; admission-e2e (Plan 10) and Wave 3 factory-cli wiring can now import them.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| AuthorizedOp brand surface | Anything outside @protostar/authority must go through `authorize*Op` to obtain a brand |
| Test-builder boundary | `internal/test-builders` is admissible only by `@protostar/admission-e2e`; never on public barrel |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-2 | Tampering / Elevation of Privilege | AuthorizedOp envelope widening between admission and execution | mitigate | Branded type with module-private mint — boundaries cannot accept anything but a brand obtained from `authorize*Op`. Plan 10 ships the contract test that pins this surface. |
| T-2-5 | Elevation of Privilege | Hardcoded `trust: "trusted"` at apps/factory-cli/src/main.ts:335 | mitigate (partial) | This plan ships the `authorizeWorkspaceOp` predicate that refuses `write/execute` against `trust !== "trusted"`. Plan 08 removes the hardcoded value. Together they close the gap. |
</threat_model>

<verification>
- `pnpm --filter @protostar/authority test` exits 0
- `pnpm run verify:full` exits 0
- Mints not on public surface (grep checks)
- Authority boundary preserved (no fs imports)
</verification>

<success_criteria>
- Four AuthorizedOp brands available via `authorize*Op` producers
- Brand witnesses + test-builders ready for Plan 10 contract tests
- Budget tracker + aggregator interfaces shipped (Q-07)
- GOV-04 admission-time trust check live in `authorizeWorkspaceOp`
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-02-authorized-op-brands-SUMMARY.md`
</output>
