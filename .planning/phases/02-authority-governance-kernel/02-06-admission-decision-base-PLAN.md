---
phase: 02-authority-governance-kernel
plan: 06
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - packages/authority/src/admission-decision/base.ts
  - packages/authority/src/admission-decision/outcome.ts
  - packages/authority/src/admission-decision/signed-admission-decision.ts
  - packages/authority/src/admission-decision/index.ts
  - packages/authority/src/admission-decision/admission-decision.test.ts
  - packages/authority/src/internal/brand-witness.ts
  - packages/authority/src/internal/test-builders.ts
  - packages/authority/src/index.ts
  - packages/intent/schema/intent-admission-decision.schema.json
  - packages/planning/schema/planning-admission-decision.schema.json
  - packages/intent/schema/capability-admission-decision.schema.json
  - packages/intent/schema/repo-scope-admission-decision.schema.json
  - packages/repo/schema/workspace-trust-admission-decision.schema.json
  - packages/intent/package.json
  - packages/planning/package.json
  - packages/repo/package.json
autonomous: true
requirements:
  - GOV-03
  - GOV-05
must_haves:
  truths:
    - "`AdmissionDecisionBase` interface lives in `@protostar/authority`; per-gate evidence extension types live in their owning packages (Q-13 hybrid)"
    - "`SignedAdmissionDecision` brand exists (sixth and final brand of Phase 2) with module-private mint and sole producer `signAdmissionDecision`"
    - "`outcome` literal reused from `@protostar/intent`'s existing `ADMISSION_DECISION_OUTCOMES = [\"allow\",\"block\",\"escalate\"]` — NOT redefined (Phase 2 anti-pattern)"
    - "Per-gate evidence schemas exist for all 5 gates: intent, planning, capability, repo-scope, workspace-trust — each in its owning package's `schema/` dir, each extending the base"
    - "Existing intent gate schema renamed: `packages/intent/schema/intent-admission-decision.schema.json` (was `admission-decision.schema.json`); old name kept as alias only if package.json exports needs it for legacy readers"
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
    - path: packages/intent/schema/intent-admission-decision.schema.json
      provides: "Intent-gate evidence extension schema"
      contains: '"intent-admission-decision"'
    - path: packages/repo/schema/workspace-trust-admission-decision.schema.json
      provides: "Workspace-trust gate evidence schema (NEW gate, Q-11/Q-12)"
      contains: '"workspace-trust-admission-decision"'
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
Wave 2 — the per-gate admission-decision base + the sixth brand. Ships:

1. `AdmissionDecisionBase` shared header type per Q-13 hybrid (common fields in `@protostar/authority`; per-gate evidence extensions in owning packages).
2. `GateName` literal: `"intent" | "planning" | "capability" | "repo-scope" | "workspace-trust"` (5 gates, per Q-13 note).
3. **Reuse** of the existing `ADMISSION_DECISION_OUTCOMES` literal from `packages/intent/src/admission-decision.ts:28` — Phase 2 does NOT define a new outcome literal (RESEARCH.md anti-pattern + Pitfall 1).
4. `SignedAdmissionDecision` branded type + `signAdmissionDecision` producer (sixth brand of phase). The signed wrapper carries an authority signature over the decision payload — used in stages where the decision itself must be tamper-evident.
5. Five per-gate evidence-extension JSON schemas, each in the owning package, each `additionalProperties: false`, each extending the base shape.

Per Q-13: "Per-gate filenames (`{gate}-admission-decision.json`), shared base schema + gate-specific extension." Per Q-14: existing `runs/{id}/admission-decision.json` (intent only) becomes `runs/{id}/intent-admission-decision.json`. Plan 09 (stage reader) handles the legacy filename fallback for the 208 historical run dirs.

Authority boundary: still pure logic + types. Schemas are static JSON files. Zero `node:fs` imports.

Output: type/schema infrastructure ready for Wave 3 factory-cli per-gate writer (Plan 07) and Wave 4 stage reader (Plan 09).
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
@packages/intent/src/admission-decision.ts
@packages/intent/schema/clarification-report.schema.json
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

Existing schema: packages/intent/schema/admission-decision.schema.json (pre-Phase 2; Phase 1 emitted to runs/{id}/admission-decision.json). Renamed in this plan to `intent-admission-decision.schema.json`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: AdmissionDecisionBase + outcome re-export + per-gate schemas</name>
  <files>
    packages/authority/src/admission-decision/base.ts,
    packages/authority/src/admission-decision/outcome.ts,
    packages/authority/src/admission-decision/index.ts,
    packages/authority/src/admission-decision/admission-decision.test.ts,
    packages/authority/src/index.ts,
    packages/intent/schema/intent-admission-decision.schema.json,
    packages/planning/schema/planning-admission-decision.schema.json,
    packages/intent/schema/capability-admission-decision.schema.json,
    packages/intent/schema/repo-scope-admission-decision.schema.json,
    packages/repo/schema/workspace-trust-admission-decision.schema.json,
    packages/intent/package.json,
    packages/planning/package.json,
    packages/repo/package.json
  </files>
  <read_first>
    - packages/intent/src/admission-decision.ts (current intent-gate decision shape; existing ADMISSION_DECISION_OUTCOMES at line 28)
    - packages/intent/schema/admission-decision.schema.json (current schema; informs the rename)
    - packages/authority/schema/admission-decision-base.schema.json (Plan 01 Task 2 — base shape)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-13, Q-14
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Anti-Patterns to Avoid" Pitfall 1
    - packages/intent/package.json + packages/planning/package.json + packages/repo/package.json (subpath exports for schema/* — pattern from Phase 1)
  </read_first>
  <behavior>
    - `GateName = "intent" | "planning" | "capability" | "repo-scope" | "workspace-trust"`
    - `GATE_NAMES: readonly GateName[]` — frozen array literal
    - `AdmissionDecisionBase`: `{ schemaVersion: "1.0.0"; runId: string; gate: GateName; outcome: AdmissionDecisionOutcome; timestamp: string; precedenceResolution: PrecedenceResolutionSummary; evidence: object }` (evidence is the per-gate extension hook)
    - `PrecedenceResolutionSummary`: `{ status: "no-conflict" | "resolved" | "blocked-by-tier"; precedenceDecisionPath?: string }` (Q-04 nested summary; full detail in `precedence-decision.json` when status ≠ no-conflict)
    - `outcome.ts` re-exports `ADMISSION_DECISION_OUTCOMES` and `AdmissionDecisionOutcome` from `@protostar/intent`. Does NOT define a new array.
    - All 5 per-gate JSON schemas reference the base via `$ref` to the authority schema OR inline the base fields with `allOf` — pick one approach and apply uniformly. Recommended: each gate schema is a complete shape with `additionalProperties: false`, repeating the base fields (simpler than $ref-across-package; `additionalProperties: false` enforces the contract regardless).
    - The intent-gate evidence extension preserves all evidence fields the existing Phase 1 `admission-decision.schema.json` already had (so existing readers continue to work)
    - `packages/intent/package.json` exports gain `./schema/intent-admission-decision.schema.json` (and `./schema/capability-admission-decision.schema.json` and `./schema/repo-scope-admission-decision.schema.json`)
    - `packages/planning/package.json` exports gain `./schema/planning-admission-decision.schema.json`
    - `packages/repo/package.json` exports gain `./schema/workspace-trust-admission-decision.schema.json`
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
  readonly precedenceDecisionPath?: string;  // .protostar/runs/{id}/precedence-decision.json when present
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
// (See packages/intent/src/admission-decision.ts:28.)
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

**Update `packages/authority/src/index.ts`** to re-export from `./admission-decision/index.js`.

**Per-gate evidence-extension JSON schemas** — five files. Each follows the same shape:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://protostar.local/schema/{gate}-admission-decision.schema.json",
  "title": "{Gate}AdmissionDecision",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "runId", "gate", "outcome", "timestamp", "precedenceResolution", "evidence"],
  "properties": {
    "schemaVersion": { "const": "1.0.0" },
    "runId": { "type": "string", "pattern": "^run-[A-Za-z0-9_-]+$" },
    "gate": { "const": "{gate}" },
    "outcome": { "enum": ["allow", "block", "escalate"] },
    "timestamp": { "type": "string", "format": "date-time" },
    "precedenceResolution": {
      "type": "object",
      "additionalProperties": false,
      "required": ["status"],
      "properties": {
        "status": { "enum": ["no-conflict", "resolved", "blocked-by-tier"] },
        "precedenceDecisionPath": { "type": "string" }
      }
    },
    "evidence": {
      "type": "object",
      "additionalProperties": false,
      "required": [...],
      "properties": { ...gate-specific evidence... }
    }
  }
}
```

Specific evidence content per gate:

- **`intent-admission-decision.schema.json`** (rename of existing — preserve all fields the existing Phase 1 schema had): evidence includes `{ ambiguityScore, clarificationReportPath?, refusedReasons?, admissionStage }` — port from current `packages/intent/schema/admission-decision.schema.json`.
- **`planning-admission-decision.schema.json`**: evidence `{ candidatesConsidered: number, admittedPlanId?: string, refusedReasons?: string[] }`.
- **`capability-admission-decision.schema.json`**: evidence `{ requestedEnvelope: object, resolvedEnvelope: object, blockedAxes?: string[] }`.
- **`repo-scope-admission-decision.schema.json`**: evidence `{ requestedScopes: string[], grantedScopes: string[], deniedScopes?: string[] }`.
- **`workspace-trust-admission-decision.schema.json`**: evidence `{ workspacePath: string, declaredTrust: "trusted"|"untrusted", grantedAccess: "read"|"write"|"execute"|"none", refusalReason?: string }` — Q-11/Q-12 new gate.

**Rename** `packages/intent/schema/admission-decision.schema.json` to `intent-admission-decision.schema.json`. Add the rename via `git mv` and update `packages/intent/package.json` exports to:
```json
"./schema/intent-admission-decision.schema.json": "./schema/intent-admission-decision.schema.json"
```
**Keep** the old `./schema/admission-decision.schema.json` export entry pointing to the same file (a JSON copy or symlink) so any external reader that still uses the old name doesn't break — Plan 09 stage reader handles legacy fallback at the file level. Document this dual export as transitional. (Practical: copy the renamed schema bytes back to the old filename so both files exist; commit both. The old file is frozen — no future edits.)

Add new `./schema/capability-admission-decision.schema.json` and `./schema/repo-scope-admission-decision.schema.json` entries to `packages/intent/package.json` exports.

Add `./schema/planning-admission-decision.schema.json` to `packages/planning/package.json` exports.

Add `./schema/workspace-trust-admission-decision.schema.json` to `packages/repo/package.json` exports. (`packages/repo/schema/` directory may not exist — create it; add `"files": [..., "schema"]` to `packages/repo/package.json` if absent.)

**`packages/authority/src/admission-decision/admission-decision.test.ts`**:
1. `GATE_NAMES` length === 5
2. `ADMISSION_DECISION_OUTCOMES` is the same array reference (or value-equal) as the one from `@protostar/intent` — import both and assert deep-equal (single source of truth)
3. Type-level: `AdmissionDecisionBase<{foo: string}>` allows `{ foo: "bar" }` evidence; rejects missing required base fields (compile-time `Assert<>` checks)
  </action>
  <verify>
    <automated>pnpm --filter @protostar/authority test &amp;&amp; pnpm --filter @protostar/intent test &amp;&amp; pnpm --filter @protostar/planning test &amp;&amp; pnpm --filter @protostar/repo test</automated>
  </verify>
  <acceptance_criteria>
    - All four `pnpm --filter` runs above exit 0
    - `pnpm run verify:full` exits 0 (Phase 1 regression)
    - `grep -c 'GateName' packages/authority/src/admission-decision/base.ts` >= 1
    - `grep -c 'GATE_NAMES' packages/authority/src/admission-decision/base.ts` >= 1
    - All 5 schema files exist:
      - `test -f packages/intent/schema/intent-admission-decision.schema.json && echo ok`
      - `test -f packages/planning/schema/planning-admission-decision.schema.json && echo ok`
      - `test -f packages/intent/schema/capability-admission-decision.schema.json && echo ok`
      - `test -f packages/intent/schema/repo-scope-admission-decision.schema.json && echo ok`
      - `test -f packages/repo/schema/workspace-trust-admission-decision.schema.json && echo ok`
    - Each schema has `"additionalProperties": false` at top level: `for f in <list>; do grep -c '"additionalProperties": false' $f; done` returns >=1 per file
    - The existing `packages/intent/schema/admission-decision.schema.json` still exists (legacy alias)
    - `outcome.ts` does NOT redefine the outcomes literal: `! grep -E '\\["allow",\\s*"block",\\s*"escalate"\\]' packages/authority/src/admission-decision/outcome.ts` (it should re-export, not redefine)
  </acceptance_criteria>
  <done>Per-gate decision schemas + base type + outcome re-export shipped; legacy intent-decision schema preserved; ready for factory-cli writer.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: SignedAdmissionDecision brand (sixth brand) + signAdmissionDecision producer</name>
  <files>
    packages/authority/src/admission-decision/signed-admission-decision.ts,
    packages/authority/src/admission-decision/index.ts,
    packages/authority/src/admission-decision/signed-admission-decision.test.ts,
    packages/authority/src/internal/brand-witness.ts,
    packages/authority/src/internal/test-builders.ts,
    packages/authority/src/index.ts
  </files>
  <read_first>
    - packages/authority/src/precedence/precedence-decision.ts (Plan 04 — brand mint template; copy structure exactly)
    - packages/authority/src/signature/sign.ts (Plan 05 — buildSignatureValue used here)
    - packages/intent/src/confirmed-intent.ts (mint pattern reference)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-13 + Q-15 + Q-17
  </read_first>
  <behavior>
    - `SignedAdmissionDecision` brand wraps an `AdmissionDecisionBase<E>` + a `SignatureEnvelope` over the canonicalized decision body
    - Module-private mint `mintSignedAdmissionDecision`; sole producer `signAdmissionDecision`
    - `signAdmissionDecision(decision: AdmissionDecisionBase<E>): SignedAdmissionDecision<E>`:
      1. Canonicalizes the decision body (excluding the future `signature` field)
      2. Hashes via `buildSignatureValue` with the decision body as the "intent" slot (reuses Plan 05's signing primitive — no new hashing logic)
      3. Returns frozen `{ ...decision, signature: SignatureEnvelope }` cast to brand
    - Verifier helper `verifySignedAdmissionDecision(signed)` returns `Result<AdmissionDecisionBase<E>, SignatureMismatch>` — uses Plan 05's `verifyConfirmedIntentSignature` pattern (re-canonicalize, recompute, compare)
    - Brand witness re-exported under `internal/brand-witness`; test-builder added under `internal/test-builders`
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

**Update `packages/authority/src/internal/brand-witness.ts`** — add `export type SignedAdmissionDecisionBrandWitness<E extends object = object> = SignedAdmissionDecision<E>;`.

**Update `packages/authority/src/internal/test-builders.ts`** — add `buildSignedAdmissionDecisionForTest(overrides?)` that constructs an `AdmissionDecisionBase` with sensible defaults, then calls `mintSignedAdmissionDecision` directly with a placeholder signature value (test fixtures don't need real signing for shape testing — but ALSO provide a `buildRealSignedAdmissionDecisionForTest` that calls the public `signAdmissionDecision` for round-trip tests).

**`packages/authority/src/admission-decision/signed-admission-decision.test.ts`** — test cases:
1. **Round-trip**: `signAdmissionDecision(base)` → `verifySignedAdmissionDecision(signed)` returns `ok: true; decision === base`
2. **Mutation detected**: take `signed`, mutate `evidence.foo` (rebuild a new object with the mutation), verify → `ok: false`
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
    - `grep -v '^#' packages/authority/src/index.ts | grep -c 'mintSignedAdmissionDecision'` outputs `0`
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
| T-2-6 | Tampering | Stage reader accepts a wrong-schema artifact | mitigate | Per-gate schemas use `additionalProperties: false`, `gate: { const }`, `outcome: enum` — each gate's reader (Plan 09) validates `schemaVersion` and matches `gate` literal at read time. |
| T-2-4 | Elevation of Privilege | `escalate` verdict bypassed by inner gate returning admit | mitigate | Outcome is shared literal across all 5 gates; precedence-resolution summary on every decision references the precedence-decision artifact when status ≠ no-conflict. Plan 07 wires the writer to enforce precedence outcome before per-gate outcome. |
</threat_model>

<verification>
- All four owning packages' tests pass (authority, intent, planning, repo)
- `pnpm run verify:full` exits 0 (Phase 1 regression)
- 5 per-gate schemas exist and validate as JSON
- `outcome` literal not redefined (re-export only)
- 6th brand (SignedAdmissionDecision) ships with sole-producer pattern
</verification>

<success_criteria>
- `AdmissionDecisionBase<E>` shared header type ready for factory-cli per-gate writer
- All 5 per-gate evidence-extension schemas committed in owning packages
- `signAdmissionDecision` available for stages that need tamper-evident decisions
- GOV-03 single-owner pattern reinforced (per-gate evidence in owning packages)
- GOV-05 schema infrastructure ready
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-06-admission-decision-base-SUMMARY.md`
</output>
