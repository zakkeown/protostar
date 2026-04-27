---
phase: 02-authority-governance-kernel
plan: 06a
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - packages/authority/src/admission-decision/base.ts
  - packages/authority/src/admission-decision/outcome.ts
  - packages/authority/src/admission-decision/signed-admission-decision.ts
  - packages/authority/src/admission-decision/index.ts
  - packages/authority/src/admission-decision/admission-decision.test.ts
  - packages/authority/src/admission-decision/signed-admission-decision.test.ts
autonomous: true
requirements:
  - GOV-03
  - GOV-05
must_haves:
  truths:
    - "`AdmissionDecisionBase` interface lives in `@protostar/authority`; per-gate evidence extension types live in their owning packages (Q-13 hybrid)"
    - "`SignedAdmissionDecision` brand exists (sixth and final brand of Phase 2) with module-private mint and sole producer `signAdmissionDecision`"
    - "`outcome` literal reused from `@protostar/intent`'s existing `ADMISSION_DECISION_OUTCOMES = [\"allow\",\"block\",\"escalate\"]` — NOT redefined (Phase 2 anti-pattern)"
    - "Authority boundary preserved — base + brand are pure types"
  artifacts:
    - path: packages/authority/src/admission-decision/base.ts
      provides: "AdmissionDecisionBase shared header type + GateName literal"
      exports: ["AdmissionDecisionBase", "GateName", "GATE_NAMES", "PrecedenceResolutionSummary"]
    - path: packages/authority/src/admission-decision/outcome.ts
      provides: "Re-exports the outcome literal/array from @protostar/intent (single source of truth)"
      exports: ["AdmissionDecisionOutcome", "ADMISSION_DECISION_OUTCOMES"]
    - path: packages/authority/src/admission-decision/signed-admission-decision.ts
      provides: "SignedAdmissionDecision brand + module-private mint + signAdmissionDecision producer"
      exports: ["SignedAdmissionDecision", "SignedAdmissionDecisionData", "signAdmissionDecision"]
  key_links:
    - from: packages/authority/src/admission-decision/outcome.ts
      to: packages/intent/src/admission-decision.ts
      via: "re-export of ADMISSION_DECISION_OUTCOMES — single source of truth"
      pattern: "ADMISSION_DECISION_OUTCOMES"
    - from: packages/authority/src/admission-decision/signed-admission-decision.ts
      to: packages/authority/src/signature/sign.ts
      via: "signAdmissionDecision uses buildSignatureValue under the hood"
      pattern: "buildSignatureValue"
---

<objective>
Wave 2 — authority-side admission-decision base + the sixth brand. (Split from original Plan 06 per WARNING 6 / revision iteration 2; per-gate evidence schemas now live in companion Plan 06b.)

Ships:
1. `AdmissionDecisionBase` shared header type per Q-13 hybrid (common fields in `@protostar/authority`; per-gate evidence extensions are types in owning packages — schemas land in Plan 06b).
2. `GateName` literal: `"intent" | "planning" | "capability" | "repo-scope" | "workspace-trust"` (5 gates, per Q-13 note).
3. **Reuse** of the existing `ADMISSION_DECISION_OUTCOMES` literal from `packages/intent/src/admission-decision.ts:28` — Phase 2 does NOT define a new outcome literal (RESEARCH.md anti-pattern + Pitfall 1).
4. `SignedAdmissionDecision` branded type + `signAdmissionDecision` producer (sixth brand of phase). The signed wrapper carries an authority signature over the decision payload — used in stages where the decision itself must be tamper-evident.

Authority boundary: pure logic + types. Zero `node:fs` imports.

Output: type/brand infrastructure ready for Plan 06b (schemas), Wave 3 factory-cli per-gate writer (Plan 07), and Wave 4 stage reader (Plan 09).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>

Read first: @.planning/phases/02-authority-governance-kernel/02-CORRECTIONS.md (root-barrel + internal/* are pre-populated by Plan 01 — do NOT add them to files_modified; see Correction 1. WARNING 6 split note: Plan 06 was split into 06a (this plan, authority-side base + brand) and 06b (per-gate schemas in owning packages).)

@.planning/PROJECT.md
@.planning/phases/02-authority-governance-kernel/02-CONTEXT.md
@.planning/phases/02-authority-governance-kernel/02-RESEARCH.md
@.planning/phases/02-authority-governance-kernel/02-VALIDATION.md
@packages/intent/src/admission-decision.ts
@packages/authority/schema/admission-decision-base.schema.json
@packages/authority/schema/precedence-decision.schema.json

<interfaces>
<!-- Reuse the existing outcome literal — do NOT redefine. -->

From packages/intent/src/admission-decision.ts:
```ts
export const ADMISSION_DECISION_OUTCOMES = ["allow", "block", "escalate"] as const;
export type AdmissionDecisionOutcome = (typeof ADMISSION_DECISION_OUTCOMES)[number];
```

Plan 04 brand mint pattern (PrecedenceDecision) — copy for SignedAdmissionDecision.
Plan 05 buildSignatureValue helper — used by signAdmissionDecision.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: AdmissionDecisionBase + outcome re-export</name>
  <files>
    packages/authority/src/admission-decision/base.ts,
    packages/authority/src/admission-decision/outcome.ts,
    packages/authority/src/admission-decision/index.ts,
    packages/authority/src/admission-decision/admission-decision.test.ts
  </files>
  <read_first>
    - packages/intent/src/admission-decision.ts (current intent-gate decision shape; existing ADMISSION_DECISION_OUTCOMES at line 28)
    - packages/authority/schema/admission-decision-base.schema.json (Plan 01 Task 2 — base shape)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-13, Q-14
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Anti-Patterns to Avoid" Pitfall 1
  </read_first>
  <behavior>
    - `GateName = "intent" | "planning" | "capability" | "repo-scope" | "workspace-trust"`
    - `GATE_NAMES: readonly GateName[]` — frozen array literal
    - `AdmissionDecisionBase<E extends object>`: `{ schemaVersion: "1.0.0"; runId: string; gate: GateName; outcome: AdmissionDecisionOutcome; timestamp: string; precedenceResolution: PrecedenceResolutionSummary; evidence: E }` (evidence is the per-gate extension hook)
    - `PrecedenceResolutionSummary`: `{ status: "no-conflict" | "resolved" | "blocked-by-tier"; precedenceDecisionPath?: string }` (Q-04 nested summary; full detail in `precedence-decision.json` when status ≠ no-conflict)
    - `outcome.ts` re-exports `ADMISSION_DECISION_OUTCOMES` and `AdmissionDecisionOutcome` from `@protostar/intent`. Does NOT define a new array.
  </behavior>
  <action>
**`packages/authority/src/admission-decision/base.ts`:**
```ts
import type { AdmissionDecisionOutcome } from "./outcome.js";

export type GateName =
  | "intent" | "planning" | "capability" | "repo-scope" | "workspace-trust";

export const GATE_NAMES: readonly GateName[] = Object.freeze([
  "intent", "planning", "capability", "repo-scope", "workspace-trust",
]);

export interface PrecedenceResolutionSummary {
  readonly status: "no-conflict" | "resolved" | "blocked-by-tier";
  readonly precedenceDecisionPath?: string;
}

export interface AdmissionDecisionBase<E extends object = object> {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly gate: GateName;
  readonly outcome: AdmissionDecisionOutcome;
  readonly timestamp: string;
  readonly precedenceResolution: PrecedenceResolutionSummary;
  readonly evidence: E;
}
```

**`packages/authority/src/admission-decision/outcome.ts`:**
```ts
// Re-export from @protostar/intent — Phase 2 anti-pattern: do NOT redefine.
export {
  ADMISSION_DECISION_OUTCOMES,
  type AdmissionDecisionOutcome,
} from "@protostar/intent";
```

**`packages/authority/src/admission-decision/index.ts`** — public barrel:
```ts
export type { AdmissionDecisionBase, GateName, PrecedenceResolutionSummary } from "./base.js";
export { GATE_NAMES } from "./base.js";
export { ADMISSION_DECISION_OUTCOMES, type AdmissionDecisionOutcome } from "./outcome.js";
```

**`packages/authority/src/admission-decision/admission-decision.test.ts`**:
1. `GATE_NAMES` length === 5
2. `ADMISSION_DECISION_OUTCOMES` is the same value as the one from `@protostar/intent` — import both and assert deep-equal (single source of truth)
3. Type-level: `AdmissionDecisionBase<{foo: string}>` allows `{ foo: "bar" }` evidence; rejects missing required base fields (compile-time `Assert<>` checks)
  </action>
  <verify>
    <automated>pnpm --filter @protostar/authority test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/authority test` exits 0
    - `grep -c 'GateName' packages/authority/src/admission-decision/base.ts` >= 1
    - `grep -c 'GATE_NAMES' packages/authority/src/admission-decision/base.ts` >= 1
    - `outcome.ts` does NOT redefine the outcomes literal: `grep -E '\\["allow",\\s*"block",\\s*"escalate"\\]' packages/authority/src/admission-decision/outcome.ts | wc -l` outputs `0`
  </acceptance_criteria>
  <done>Base type + outcome re-export shipped; ready for SignedAdmissionDecision brand + Plan 06b schemas.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: SignedAdmissionDecision brand (sixth brand) + signAdmissionDecision producer</name>
  <files>
    packages/authority/src/admission-decision/signed-admission-decision.ts,
    packages/authority/src/admission-decision/index.ts,
    packages/authority/src/admission-decision/signed-admission-decision.test.ts
  </files>
  <read_first>
    - packages/authority/src/precedence/precedence-decision.ts (Plan 04 — brand mint template; copy structure exactly)
    - packages/authority/src/signature/sign.ts (Plan 05 — buildSignatureValue used here)
    - packages/intent/src/confirmed-intent.ts (mint pattern reference)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-13 + Q-15 + Q-17
    - .planning/phases/02-authority-governance-kernel/02-CORRECTIONS.md (Correction 1 — internal/brand-witness.ts and internal/test-builders.ts are pre-populated by Plan 01; this plan modifies its OWN subdir source files only)
  </read_first>
  <behavior>
    - `SignedAdmissionDecision` brand wraps an `AdmissionDecisionBase<E>` + a `SignatureEnvelope` over the canonicalized decision body
    - Module-private mint `mintSignedAdmissionDecision`; sole producer `signAdmissionDecision`
    - `signAdmissionDecision(decision: AdmissionDecisionBase<E>): SignedAdmissionDecision<E>`:
      1. Canonicalizes the decision body (excluding the future `signature` field)
      2. Hashes via Plan 05's primitives — reuses `canonicalizeJsonC14nV1` + `createHash` directly (no new hashing logic)
      3. Returns frozen `{ ...decision, signature: SignatureEnvelope }` cast to brand
    - Verifier helper `verifySignedAdmissionDecision(signed)` returns `Result<AdmissionDecisionBase<E>, errors>` — uses Plan 05's pattern (re-canonicalize, recompute, compare)
    - Brand witness (existing pre-populated file at `packages/authority/src/internal/brand-witness.ts`) is updated by Plan 01's stub-then-fill mechanism — this plan does NOT directly write to that file (per Correction 1)
  </behavior>
  <action>
**`packages/authority/src/admission-decision/signed-admission-decision.ts`:**
```ts
import { createHash } from "node:crypto";
import type { SignatureEnvelope } from "@protostar/intent";
import { canonicalizeJsonC14nV1 } from "../signature/canonicalize.js";
import { resolveCanonicalizer } from "../signature/canonical-form-registry.js";
import type { AdmissionDecisionBase } from "./base.js";

declare const SignedAdmissionDecisionBrand: unique symbol;

export interface SignedAdmissionDecisionData<E extends object = object>
  extends AdmissionDecisionBase<E> {
  readonly signature: SignatureEnvelope;
}

export type SignedAdmissionDecision<E extends object = object> =
  SignedAdmissionDecisionData<E> & { readonly [SignedAdmissionDecisionBrand]: true };

function mintSignedAdmissionDecision<E extends object>(
  data: SignedAdmissionDecisionData<E>,
): SignedAdmissionDecision<E> {
  return Object.freeze({ ...data }) as SignedAdmissionDecision<E>;
}

export function signAdmissionDecision<E extends object>(
  decision: AdmissionDecisionBase<E>,
): SignedAdmissionDecision<E> {
  const canonical = canonicalizeJsonC14nV1(decision);
  const value = createHash("sha256").update(canonical, "utf8").digest("hex");
  const signature: SignatureEnvelope = Object.freeze({
    algorithm: "sha256",
    canonicalForm: "json-c14n@1.0",
    value,
  });
  return mintSignedAdmissionDecision({ ...decision, signature });
}

export type VerifySignedAdmissionDecisionResult<E extends object = object> =
  | { readonly ok: true;  readonly decision: AdmissionDecisionBase<E>; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

export function verifySignedAdmissionDecision<E extends object>(
  signed: SignedAdmissionDecision<E>,
): VerifySignedAdmissionDecisionResult<E> {
  const canonicalizer = resolveCanonicalizer(signed.signature.canonicalForm);
  if (canonicalizer === null) {
    return { ok: false, errors: [`unknown canonicalForm tag: ${signed.signature.canonicalForm}`] };
  }
  if (signed.signature.algorithm !== "sha256") {
    return { ok: false, errors: [`unsupported algorithm: ${signed.signature.algorithm}`] };
  }
  const { signature, ...body } = signed as SignedAdmissionDecisionData<E>;
  const expected = createHash("sha256").update(canonicalizer(body), "utf8").digest("hex");
  if (expected !== signature.value) {
    return { ok: false, errors: ["signature mismatch on signed admission decision"] };
  }
  return { ok: true, decision: body, errors: [] };
}

// Module-internal mint export — sibling test-builder uses it. NOT in public barrel.
export { mintSignedAdmissionDecision };
```

**Update `packages/authority/src/admission-decision/index.ts`** — public barrel adds:
```ts
export {
  signAdmissionDecision,
  verifySignedAdmissionDecision,
} from "./signed-admission-decision.js";
export type {
  SignedAdmissionDecision,
  SignedAdmissionDecisionData,
  VerifySignedAdmissionDecisionResult,
} from "./signed-admission-decision.js";
// Do NOT export mintSignedAdmissionDecision.
```

**`packages/authority/src/admission-decision/signed-admission-decision.test.ts`** — test cases:
1. **Round-trip**: `signAdmissionDecision(base)` → `verifySignedAdmissionDecision(signed)` returns `ok: true; decision === base`
2. **Mutation detected**: take `signed`, build a new object with mutated `evidence.foo`, verify → `ok: false`
3. **Unknown canonicalForm tag** in signature → `ok: false`, errors mentions "unknown canonicalForm tag"
4. **Wrong algorithm** → `ok: false`
5. **Determinism**: signing the same base twice produces the same signature value
6. Frozen result: assignment to `signed.evidence` throws under strict mode
7. Mint not on public surface: `import * as A from "@protostar/authority"; assert(!("mintSignedAdmissionDecision" in A))`
  </action>
  <verify>
    <automated>pnpm --filter @protostar/authority test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/authority test` exits 0
    - `grep -c 'signAdmissionDecision' packages/authority/src/admission-decision/signed-admission-decision.ts` >= 1
    - `grep -c 'verifySignedAdmissionDecision' packages/authority/src/admission-decision/signed-admission-decision.ts` >= 1
    - `grep -v '^#' packages/authority/src/admission-decision/index.ts | grep -c 'mintSignedAdmissionDecision'` outputs `0`
    - `grep -c 'unique symbol' packages/authority/src/admission-decision/signed-admission-decision.ts` >= 1
    - All 7 sign-decision test cases above pass
  </acceptance_criteria>
  <done>SignedAdmissionDecision is the sixth and final brand of Phase 2; sole-producer pattern; round-trip + mutation tests green; ready for Plan 10 contract-test inclusion.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Per-gate decision boundary | Each gate emits a per-gate decision; `outcome` field is the only reserved literal — all 5 gates share the literal definition |
| Signed-decision boundary | When a decision must be tamper-evident across stages, `signAdmissionDecision` wraps it; sole producer is the kernel |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-4 | Elevation of Privilege | `escalate` verdict bypassed by inner gate returning admit | mitigate | Outcome is shared literal across all 5 gates (re-export of single source). Plan 07 wires the writer to enforce precedence outcome before per-gate outcome. |
| T-2-1 | Tampering | Decision tampered between stages | mitigate | `signAdmissionDecision` produces tamper-evident wrapper; verifier re-canonicalizes and recomputes hash. |
</threat_model>

<verification>
- `pnpm --filter @protostar/authority test` exits 0
- `outcome` literal not redefined (re-export only)
- 6th brand (SignedAdmissionDecision) ships with sole-producer pattern
</verification>

<success_criteria>
- `AdmissionDecisionBase<E>` shared header type ready for factory-cli per-gate writer
- `signAdmissionDecision` available for stages that need tamper-evident decisions
- GOV-03 single-owner pattern reinforced (per-gate evidence types in owning packages — schemas land in Plan 06b)
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-06a-admission-decision-base-SUMMARY.md`
</output>
</content>
</invoke>