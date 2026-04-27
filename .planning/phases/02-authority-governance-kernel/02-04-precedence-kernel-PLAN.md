---
phase: 02-authority-governance-kernel
plan: 04
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - packages/authority/src/precedence/index.ts
  - packages/authority/src/precedence/tiers.ts
  - packages/authority/src/precedence/precedence-decision.ts
  - packages/authority/src/precedence/intersect.ts
  - packages/authority/src/precedence/precedence.test.ts
  - packages/authority/src/repo-policy/parse.ts
  - packages/authority/src/repo-policy/repo-policy.test.ts
autonomous: true
requirements:
  - GOV-01
must_haves:
  truths:
    - "`intersectEnvelopes(tiers)` returns a branded `PrecedenceDecision` whose `resolvedEnvelope` is the strict intersection across all four tiers"
    - "Conflict path: when ANY tier denies on an axis, `status` is `\"blocked-by-tier\"` and `blockedBy` enumerates EVERY tier that contributed a denial (Q-02 — non-unique)"
    - "Precedence order documented + enforced: `confirmed-intent` → `policy` → `repo-policy` → `operator-settings` (matches REQUIREMENTS.md GOV-01 statement)"
    - "`parseRepoPolicy(unknown)` returns a `Result<RepoPolicy, errors>`; absent file → caller defaults to **DENY ALL** (A3 lock — overrides research's permissive recommendation)"
    - "`PrecedenceDecision` brand: module-private mint; only producer is `intersectEnvelopes`; not on public barrel"
    - "Authority boundary preserved: `parseRepoPolicy` accepts `unknown` (never reads the file itself); `apps/factory-cli` does the fs read in Wave 3"
  artifacts:
    - path: packages/authority/src/precedence/index.ts
      provides: "intersectEnvelopes producer + PrecedenceDecision public type"
      exports: ["intersectEnvelopes", "PrecedenceDecision", "TierName", "TierConstraint"]
    - path: packages/authority/src/precedence/precedence-decision.ts
      provides: "Branded PrecedenceDecision + module-private mint"
      exports: ["PrecedenceDecision", "PrecedenceDecisionData"]
    - path: packages/authority/src/repo-policy/parse.ts
      provides: "Pure parser: unknown -> Result<RepoPolicy, string[]>; treats absent (caller-supplied null) as DENY-ALL"
      exports: ["parseRepoPolicy", "RepoPolicy", "DENY_ALL_REPO_POLICY"]
  key_links:
    - from: packages/authority/src/precedence/intersect.ts
      to: packages/authority/src/precedence/precedence-decision.ts
      via: "calls module-private mint after computing intersection"
      pattern: "mintPrecedenceDecision"
    - from: packages/authority/src/repo-policy/parse.ts
      to: packages/authority/schema/repo-policy.schema.json
      via: "structural shape mirrors the JSON Schema laid down in Plan 01 Task 2"
      pattern: "RepoPolicy"
---

<objective>
Wave 2 — the precedence kernel. Ships the intersection algorithm across the 4 tiers (Q-02 lock: strictest-wins / no widening), the branded `PrecedenceDecision` (5th brand of the phase's six), and the pure `parseRepoPolicy` helper for `.protostar/repo-policy.json` (Q-03).

**A3 lock (planning_context override of research):** When `.protostar/repo-policy.json` is **absent**, the caller (factory-cli, Plan 07) MUST construct a `DENY_ALL_REPO_POLICY` constraint tier. This matches dark-factory posture and Q-11 untrusted default. RESEARCH.md recommended default-permissive; the orchestrator explicitly inverts. This plan ships the `DENY_ALL_REPO_POLICY` constant and an action-block comment recording the inversion.

Per Q-02 explicit note: "who denied may not be unique under intersection, so evidence captures the full set." The `blockedBy` array MUST list every tier that contributed a denial on every axis.

Per Q-04: nested `precedenceResolution` summary lives on every per-gate `admission-decision.json`; the **separate** `precedence-decision.json` artifact is emitted iff `status !== "no-conflict"` (write happens in factory-cli, Plan 07).

Authority boundary: this plan has ZERO `node:fs` imports. Inputs are `unknown` (for parsing) or already-typed `TierConstraint[]` (for intersection).

Output: pure functions returning branded data; consumed by Wave 3 factory-cli wiring.
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
@packages/authority/schema/repo-policy.schema.json
@packages/authority/schema/precedence-decision.schema.json
@packages/intent/src/capability-admission.ts
@packages/intent/src/capability-grant-admission.ts
@packages/intent/src/repo-scope-admission.ts
@packages/intent/src/confirmed-intent.ts

<interfaces>
<!-- Reuse Phase 1 types; do not redefine. -->

From @protostar/intent:
- `CapabilityEnvelope` — the envelope shape (executionScope, allowedTools, repoScopes, budget, ...)

Brand mint template (mirror packages/intent/src/confirmed-intent.ts:13-17, 92-116):
```ts
declare const PrecedenceDecisionBrand: unique symbol;
function mintPrecedenceDecision(data: PrecedenceDecisionData): PrecedenceDecision { ... }
```

JSON Schema RepoPolicy (Plan 01 Task 2 — packages/authority/schema/repo-policy.schema.json):
- schemaVersion: "1.0.0"
- allowedScopes?: string[]
- deniedTools?: string[]
- budgetCaps?: { maxUsd?, maxTokens?, timeoutMs?, maxRepairLoops? }
- trustOverride?: "trusted"|"untrusted"
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: PrecedenceDecision brand + intersectEnvelopes algorithm</name>
  <files>
    packages/authority/src/precedence/tiers.ts,
    packages/authority/src/precedence/precedence-decision.ts,
    packages/authority/src/precedence/intersect.ts,
    packages/authority/src/precedence/index.ts,
    packages/authority/src/precedence/precedence.test.ts,
    packages/authority/src/internal/brand-witness.ts,
    packages/authority/src/internal/test-builders.ts,
    packages/authority/src/index.ts
  </files>
  <read_first>
    - packages/intent/src/confirmed-intent.ts (mint template — copy structure for PrecedenceDecision)
    - packages/intent/src/capability-admission.ts (CapabilityEnvelope axes — what fields exist; what each means)
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Precedence intersection — TypeScript shape" (lines ~474-503)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-02, Q-04
    - packages/authority/schema/precedence-decision.schema.json (laid down in Plan 01 Task 2 — TS shape mirrors this)
  </read_first>
  <behavior>
    - `TierName` literal: `"confirmed-intent" | "policy" | "repo-policy" | "operator-settings"` (precedence ORDER per GOV-01)
    - `TierConstraint`: `{ tier: TierName; envelope: CapabilityEnvelope; source: string }`
    - `PrecedenceDecisionData`: `{ schemaVersion: "1.0.0"; status: "no-conflict"|"resolved"|"blocked-by-tier"; resolvedEnvelope: CapabilityEnvelope; tiers: readonly TierConstraint[]; blockedBy: readonly { tier, axis, message }[] }`
    - `PrecedenceDecision` = branded `PrecedenceDecisionData`
    - `mintPrecedenceDecision` is module-private; sole consumer is `intersectEnvelopes`
    - `intersectEnvelopes(tiers)` walks each axis of `CapabilityEnvelope` and computes the strictest constraint:
      - `executionScope`: if any tier says `"none"`, result is `"none"`; if any says `"workspace-readonly"`, that wins over `"workspace"`; etc. (formalize as ordered enum with strictest-wins lookup)
      - `allowedTools`: array intersection
      - `repoScopes`: array intersection
      - `deniedTools` (from repo-policy): subtract from allowedTools
      - `budget.{maxUsd, maxTokens, timeoutMs, maxRepairLoops}`: numeric `Math.min` across present values
      - `trustOverride` (repo-policy only): if any tier sets `"untrusted"`, result is `"untrusted"`
    - For each axis where a tier's contribution makes the result strictly tighter than another tier expected: status becomes `"resolved"` (a conflict was resolved by intersection). Where a tier contributes a `"none"`-equivalent: status becomes `"blocked-by-tier"` and the tier appears in `blockedBy`.
    - `blockedBy` MUST list EVERY contributing tier, not just the first found (Q-02 explicit: "may not be unique under intersection")
    - `intersectEnvelopes([])` → status: "no-conflict", resolvedEnvelope = a wide-open default (`buildOpenEnvelope()`; safe because the empty case means "no constraints declared anywhere" — only reachable in tests; production callers always supply ≥1 tier)
  </behavior>
  <action>
**`packages/authority/src/precedence/tiers.ts`:**
```ts
import type { CapabilityEnvelope } from "@protostar/intent";

export type TierName = "confirmed-intent" | "policy" | "repo-policy" | "operator-settings";
export const TIER_PRECEDENCE_ORDER: readonly TierName[] = [
  "confirmed-intent", "policy", "repo-policy", "operator-settings",
] as const;  // GOV-01 documented order

export interface TierConstraint {
  readonly tier: TierName;
  readonly envelope: CapabilityEnvelope;
  readonly source: string;  // human-readable provenance
}
```

**`packages/authority/src/precedence/precedence-decision.ts`:**
```ts
import type { CapabilityEnvelope } from "@protostar/intent";
import type { TierName, TierConstraint } from "./tiers.js";

declare const PrecedenceDecisionBrand: unique symbol;

export interface PrecedenceDecisionDeniedAxis {
  readonly tier: TierName;
  readonly axis: string;          // e.g. "executionScope", "allowedTools.write"
  readonly message: string;       // operator-readable
}

export interface PrecedenceDecisionData {
  readonly schemaVersion: "1.0.0";
  readonly status: "no-conflict" | "resolved" | "blocked-by-tier";
  readonly resolvedEnvelope: CapabilityEnvelope;
  readonly tiers: readonly TierConstraint[];
  readonly blockedBy: readonly PrecedenceDecisionDeniedAxis[];
}

export type PrecedenceDecision = PrecedenceDecisionData & {
  readonly [PrecedenceDecisionBrand]: true;
};

export function mintPrecedenceDecision(data: PrecedenceDecisionData): PrecedenceDecision {
  // deep-freeze; matches mintConfirmedIntent shape
  return Object.freeze({
    ...data,
    tiers: Object.freeze([...data.tiers]),
    blockedBy: Object.freeze([...data.blockedBy]),
  }) as PrecedenceDecision;
}
```
The mint is module-private to `precedence/`; sole external producer is `intersectEnvelopes` in the sibling file. Do NOT re-export from `packages/authority/src/index.ts`.

**`packages/authority/src/precedence/intersect.ts`:**
Implement `intersectEnvelopes(tiers: readonly TierConstraint[]): PrecedenceDecision`. Walk axis-by-axis; for each axis, compute strictest value across all tiers; record any tier that contributed a denial in `blockedBy`. Status logic:
- All tiers compatible, no narrowing needed → `"no-conflict"`
- Narrowed without total denial → `"resolved"`
- Any axis hits a "block" floor (e.g. `executionScope: "none"`, empty allowedTools intersection where one was required) → `"blocked-by-tier"`

Walk EVERY tier on EVERY axis to populate `blockedBy` correctly (Q-02). Pseudocode:
```ts
for each axis A:
  let strictest = unconstrained;
  for each tier in tiers:
    const contribution = tier.envelope[A];
    if (contribution is stricter than strictest):
      strictest = contribution;
    if (contribution is a denial):
      blockedBy.push({ tier: tier.tier, axis: A, message: ... });
  resolved[A] = strictest;
```

**`packages/authority/src/precedence/index.ts`** — public barrel for this subdir:
```ts
export { intersectEnvelopes } from "./intersect.js";
export type { PrecedenceDecision, PrecedenceDecisionData, PrecedenceDecisionDeniedAxis } from "./precedence-decision.js";
export type { TierName, TierConstraint } from "./tiers.js";
export { TIER_PRECEDENCE_ORDER } from "./tiers.js";
// Do NOT export mintPrecedenceDecision.
```

**Update `packages/authority/src/internal/brand-witness.ts`** — add `export type PrecedenceDecisionBrandWitness = PrecedenceDecision;`.

**Update `packages/authority/src/internal/test-builders.ts`** — add `buildPrecedenceDecisionForTest(overrides?)` that constructs from `mintPrecedenceDecision` directly.

**Update `packages/authority/src/index.ts`** — re-export from `./precedence/index.js`.

**`packages/authority/src/precedence/precedence.test.ts`** — test cases (each from VALIDATION.md):
1. Empty tiers → status: "no-conflict", resolvedEnvelope is wide-open default
2. Single tier, no conflict → status: "no-conflict"
3. Two tiers, both compatible but one stricter → status: "resolved", `blockedBy: []`
4. Repo-policy denies tool X → status: "blocked-by-tier", `blockedBy[0].tier === "repo-policy"`, axis is `allowedTools` or `deniedTools`
5. Two tiers deny same axis (e.g. policy AND operator-settings both forbid network) → `blockedBy.length === 2`, contains BOTH tiers — Q-02 lock
6. Result is frozen — assignment to `result.tiers` throws under strict mode

Each test asserts on the brand witness shape (compile-time) and the runtime data.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/authority test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/authority test` exits 0
    - `grep -c 'export.*intersectEnvelopes' packages/authority/src/precedence/index.ts` >= 1
    - `grep -v '^#' packages/authority/src/index.ts | grep -c 'mintPrecedenceDecision'` outputs `0`
    - `grep -c 'TIER_PRECEDENCE_ORDER' packages/authority/src/precedence/tiers.ts` >= 1
    - The Q-02 test ("two tiers deny same axis → blockedBy lists BOTH") is present and passes (`grep -l 'blockedBy.length === 2\\|blockedBy.length, 2' packages/authority/src/precedence/precedence.test.ts | wc -l` >= 1)
    - `grep -RIn "from ['\"]node:fs['\"]\\|from ['\"]fs['\"]" packages/authority/src/precedence/ packages/authority/src/repo-policy/ | grep -v '^#' | wc -l` outputs `0`
  </acceptance_criteria>
  <done>Precedence kernel ships; brand minted privately; multi-tier denial enumeration verified; pure logic only.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: parseRepoPolicy + DENY_ALL_REPO_POLICY (A3 lock)</name>
  <files>
    packages/authority/src/repo-policy/parse.ts,
    packages/authority/src/repo-policy/repo-policy.test.ts,
    packages/authority/src/index.ts
  </files>
  <read_first>
    - packages/authority/schema/repo-policy.schema.json (laid down in Plan 01 Task 2 — structural shape mirrors this)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-03 (`.protostar/repo-policy.json` separate from AGENTS.md)
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"`.protostar/repo-policy.json` proposed schema" + Pitfall 4 ("Per-gate file write inside @protostar/authority")
    - <planning_context> A3 lock — default DENY when absent
    - packages/intent/src/confirmed-intent.ts (Result<T,errors> shape — mirror)
  </read_first>
  <behavior>
    - `parseRepoPolicy(input: unknown)` returns `{ ok: true; policy: RepoPolicy; errors: [] } | { ok: false; errors: string[] }`
    - Zero `node:fs` imports — input is already-loaded JSON (factory-cli reads the file in Plan 07)
    - Validates: required `schemaVersion: "1.0.0"`; optional `allowedScopes`, `deniedTools`, `budgetCaps`, `trustOverride` per schema
    - `DENY_ALL_REPO_POLICY: RepoPolicy` exported constant — A3 lock fallback when file absent
    - Caller behavior (documented in JSDoc on `DENY_ALL_REPO_POLICY`): "When `.protostar/repo-policy.json` does not exist on disk, the factory-cli loader supplies this constant as the repo-policy tier's contribution to `intersectEnvelopes`. This is an A3 lock from `.planning/phases/02-authority-governance-kernel/02-CONTEXT.md` planning_context — research recommended default-permissive; orchestrator explicitly inverts to default-DENY for dark-factory posture."
  </behavior>
  <action>
**`packages/authority/src/repo-policy/parse.ts`:**

```ts
export interface RepoPolicy {
  readonly schemaVersion: "1.0.0";
  readonly allowedScopes?: readonly string[];
  readonly deniedTools?: readonly string[];
  readonly budgetCaps?: {
    readonly maxUsd?: number;
    readonly maxTokens?: number;
    readonly timeoutMs?: number;
    readonly maxRepairLoops?: number;
  };
  readonly trustOverride?: "trusted" | "untrusted";
}

export type ParseRepoPolicyResult =
  | { readonly ok: true;  readonly policy: RepoPolicy; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

export function parseRepoPolicy(input: unknown): ParseRepoPolicyResult {
  // Hand-rolled validator (matches Phase 1 parseConfirmedIntent style — no ajv).
  // Validate type-tag, required fields, optional field shapes, additionalProperties=false.
  // ...
}

/**
 * A3 lock — see .planning/phases/02-authority-governance-kernel/02-CONTEXT.md and
 * the planning_context A3 directive: when `.protostar/repo-policy.json` is absent,
 * the factory-cli loader (Plan 07) supplies THIS constant as the repo-policy tier
 * contribution to `intersectEnvelopes`. Default DENY matches dark-factory posture.
 *
 * Research recommended default-permissive (RESEARCH.md line ~533); the orchestrator
 * inverted to default-DENY in planning_context for Phase 2.
 */
export const DENY_ALL_REPO_POLICY: RepoPolicy = Object.freeze({
  schemaVersion: "1.0.0",
  allowedScopes: Object.freeze([]),
  deniedTools: Object.freeze([] as string[]),  // empty here means "no allowlist on tools"
  // Effective denial comes from the policy interacting with the kernel's intersection:
  // an empty `allowedScopes` paired with the policy tier's required scope = block.
  trustOverride: "untrusted",
}) as RepoPolicy;
```

NOTE on the encoding of "deny-all" via the existing `RepoPolicy` shape: the schema doesn't have an explicit `denyAll: true` flag. The deny-all effect is achieved by setting `allowedScopes: []` and `trustOverride: "untrusted"`, which under intersection with any other tier produces `executionScope: "none"`-equivalent. If the team prefers an explicit flag, document the choice in the PLAN's SUMMARY; the constant must produce the right behavior when fed to `intersectEnvelopes` either way. **Verify via test 5 below.**

**`packages/authority/src/repo-policy/repo-policy.test.ts`:**

1. Valid minimal policy: `{schemaVersion: "1.0.0"}` → `ok: true`
2. Missing schemaVersion → `ok: false`, errors mentions schemaVersion
3. Wrong schemaVersion (`"2.0.0"`) → `ok: false`
4. Extra unknown key (e.g. `randomField: "x"`) → `ok: false` (additionalProperties: false)
5. **A3 behavior test**: feed `DENY_ALL_REPO_POLICY` as a tier into `intersectEnvelopes` alongside a tier that requests `executionScope: "workspace"`; assert result is `status: "blocked-by-tier"` with `blockedBy` containing `tier: "repo-policy"`. **This test pins the A3 contract.**
6. Negative number in budgetCaps.maxUsd → `ok: false`
7. Wrong-type trustOverride (`"unknown"`) → `ok: false`

**Update `packages/authority/src/index.ts`** to re-export `parseRepoPolicy`, `RepoPolicy`, `DENY_ALL_REPO_POLICY` from `./repo-policy/parse.js`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/authority test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/authority test` exits 0
    - `grep -c 'DENY_ALL_REPO_POLICY' packages/authority/src/repo-policy/parse.ts` >= 1
    - `grep -c 'A3 lock' packages/authority/src/repo-policy/parse.ts` >= 1 (records the inversion in source)
    - The A3-contract test exists: `grep -l 'DENY_ALL_REPO_POLICY' packages/authority/src/repo-policy/repo-policy.test.ts` matches
    - The A3-contract test asserts `blocked-by-tier` AND `tier: "repo-policy"` (`grep -c 'blocked-by-tier' packages/authority/src/repo-policy/repo-policy.test.ts` >= 1)
    - `grep -RIn "from ['\"]node:fs['\"]\\|from ['\"]fs['\"]" packages/authority/src/repo-policy/ | grep -v '^#' | wc -l` outputs `0`
  </acceptance_criteria>
  <done>parseRepoPolicy ships as pure validator; A3 default-DENY constant exported with documented inversion; repo-policy contract test pins the dark-factory posture.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Repo-policy load boundary | `.protostar/repo-policy.json` is operator-controlled file read by factory-cli; absence MUST default to DENY (A3) |
| Precedence-tier boundary | Intersection is the only way to combine tiers; no tier can widen |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-3 | Tampering / Information Disclosure | Repo-policy.json absent → permissive default | mitigate | A3 lock implemented as `DENY_ALL_REPO_POLICY` constant; contract test verifies the constant produces `blocked-by-tier` under intersection. Plan 07 wires the file-absent fallback in factory-cli. |
| T-2-4 | Elevation of Privilege | `escalate` verdict bypassed by inner gate returning admit | mitigate (partial) | Intersection algorithm guarantees no tier widens — if any tier denies, result is denial. The full escalate-vs-block precedence chain ships in Plan 06 (per-gate base) + Plan 07 (factory-cli wiring). |
</threat_model>

<verification>
- `pnpm --filter @protostar/authority test` exits 0 (precedence + repo-policy suites pass)
- Q-02 multi-tier-denial test: `blockedBy` contains every contributing tier
- A3 contract test: `DENY_ALL_REPO_POLICY` produces `blocked-by-tier` under intersection
- Authority boundary preserved (zero fs imports)
</verification>

<success_criteria>
- `intersectEnvelopes` returns branded `PrecedenceDecision`
- Multi-tier denials enumerate every contributor (Q-02)
- `parseRepoPolicy` rejects malformed input; `DENY_ALL_REPO_POLICY` is the documented absent-file fallback (A3)
- GOV-01 enforcement primitives ready for factory-cli wiring (Plan 07)
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-04-precedence-kernel-SUMMARY.md`
</output>
