---
phase: 02-authority-governance-kernel
plan: 05
type: execute
wave: 2
depends_on: [01, 03]
files_modified:
  - packages/authority/src/signature/canonicalize.ts
  - packages/authority/src/signature/canonical-form-registry.ts
  - packages/authority/src/signature/sign.ts
  - packages/authority/src/signature/verify.ts
  - packages/authority/src/signature/policy-snapshot.ts
  - packages/authority/src/signature/canonicalize.test.ts
  - packages/authority/src/signature/sign-verify.test.ts
  - packages/authority/src/index.ts
autonomous: true
requirements:
  - GOV-06
must_haves:
  truths:
    - "`json-c14n@1.0` canonicalizer rejects NaN, Infinity, -0, undefined, Symbol keys, BigInt, Date, RegExp, Map, Set"
    - "`buildSignatureValue(inputs)` produces a deterministic SHA-256 hex digest over the canonicalized payload (intent + resolvedEnvelope + policySnapshotHash)"
    - "`verifyConfirmedIntentSignature(intent, policySnapshot, resolvedEnvelope)` returns `{ ok: true; verified } | { ok: false; mismatch: { field, expected, actual } }`"
    - "Verifier fail-closes on unknown `canonicalForm` tags (e.g. `\"json-c14n@2.0\"`) with `mismatch.field === \"canonicalForm\"`"
    - "Single canonicalization site (Q-17 lock) — every stage calls the same `verifyConfirmedIntentSignature`"
    - "`buildPolicySnapshot(...)` produces a `PolicySnapshot` with `repoPolicyHash` (sha256 of canonicalized repo-policy when present)"
    - "Authority boundary preserved: zero `node:fs` imports under `packages/authority/src/signature/`"
  artifacts:
    - path: packages/authority/src/signature/canonicalize.ts
      provides: "canonicalizeJsonC14nV1(value): string — fail-closed canonicalizer per the json-c14n@1.0 spec"
      exports: ["canonicalizeJsonC14nV1", "validateCanonicalInput"]
    - path: packages/authority/src/signature/canonical-form-registry.ts
      provides: "Tag dispatch: resolveCanonicalizer(tag) -> canonicalizer | null"
      exports: ["resolveCanonicalizer", "CANONICAL_FORM_TAGS"]
    - path: packages/authority/src/signature/sign.ts
      provides: "buildSignatureValue + buildSignatureEnvelope helpers used by Plan 07 to mint signed intents"
      exports: ["buildSignatureValue", "buildSignatureEnvelope", "SignatureInputs"]
    - path: packages/authority/src/signature/verify.ts
      provides: "verifyConfirmedIntentSignature — the single helper every stage calls (Q-17)"
      exports: ["verifyConfirmedIntentSignature", "SignatureMismatch", "VerifyConfirmedIntentSignatureResult", "VerifiedIntent"]
    - path: packages/authority/src/signature/policy-snapshot.ts
      provides: "buildPolicySnapshot pure helper; PolicySnapshot type"
      exports: ["buildPolicySnapshot", "hashPolicySnapshot", "PolicySnapshot"]
  key_links:
    - from: packages/authority/src/signature/sign.ts
      to: packages/authority/src/signature/canonicalize.ts
      via: "buildSignatureValue calls canonicalizeJsonC14nV1"
      pattern: "canonicalizeJsonC14nV1"
    - from: packages/authority/src/signature/verify.ts
      to: packages/authority/src/signature/canonical-form-registry.ts
      via: "verifier dispatches via resolveCanonicalizer; fail-closes on null"
      pattern: "resolveCanonicalizer"
---

<objective>
Wave 2 — the signature spine. Ships:
1. The `json-c14n@1.0` canonicalizer (Q-18 lock) — JCS-subset, fail-closed on anomalies (NaN, Infinity, -0, undefined, non-plain types, duplicate keys, Symbol keys).
2. The canonicalForm tag registry (single dispatch table; future tags add one entry).
3. `buildSignatureValue` + `buildSignatureEnvelope` (Q-15: SHA-256 via `node:crypto`).
4. `verifyConfirmedIntentSignature` — Q-17 SINGLE central verifier returning structured mismatch evidence.
5. `buildPolicySnapshot` + `hashPolicySnapshot` — pure builders; factory-cli writes the `policy-snapshot.json` artifact in Plan 07.

Per Q-16: signature payload = `{ intent, resolvedEnvelope, policySnapshotHash }`. The `policySnapshotHash` is `sha256(canonicalize(policySnapshot))` — two-level hash chain so the snapshot can be a separate verifiable artifact.

Per RESEARCH.md Pitfall 3: canonicalizer MUST validate input BEFORE serializing — reject `-0`, `NaN`, `Infinity`, `undefined`, non-plain types. Tests cover each rejection case.

Per RESEARCH.md anti-pattern: do NOT hand-roll SHA-256 (use `node:crypto.createHash`). Do NOT hand-roll JSON number formatting (ECMAScript's already RFC 8785-compatible).

Single canonicalization site (Q-17): `buildSignatureValue` and `verifyConfirmedIntentSignature` both call `canonicalizeJsonC14nV1` via the registry — never inline.

Output: pure helpers; consumed by factory-cli (Plan 07) for sign-on-mint, by stage readers (Plan 09) for verify-on-read.
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
@packages/intent/src/confirmed-intent.ts
@packages/authority/schema/policy-snapshot.schema.json

<interfaces>
<!-- After Plan 03, SignatureEnvelope has canonicalForm field. Use that. -->

From @protostar/intent (after Plan 03):
- `SignatureEnvelope`: `{ algorithm: "sha256"; canonicalForm: "json-c14n@1.0"; value: string }`
- `ConfirmedIntent` (branded): includes `signature: SignatureEnvelope | null`
- `CapabilityEnvelope`

From node:crypto:
- `createHash("sha256").update(str, "utf8").digest("hex")` — locked by Q-15

PolicySnapshot schema (Plan 01 Task 2): includes capturedAt, policy, resolvedEnvelope, repoPolicyHash?
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: json-c14n@1.0 canonicalizer + tag registry</name>
  <files>
    packages/authority/src/signature/canonicalize.ts,
    packages/authority/src/signature/canonical-form-registry.ts,
    packages/authority/src/signature/canonicalize.test.ts
  </files>
  <read_first>
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"`json-c14n@1.0` canonicalizer (proposed spec)" (lines ~373-414) — verbatim spec
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Pitfall 3: Canonicalization edge cases" (lines ~347-352)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-18
  </read_first>
  <behavior>
    - `canonicalizeJsonC14nV1(value: unknown): string` — produces deterministic UTF-8 string per spec
    - Fails (throws `CanonicalizationError`) on:
      - `Number.isNaN(v)`, `!Number.isFinite(v)`, `Object.is(v, -0)` (literal -0; reject before serialize)
      - `v === undefined` anywhere (including object property values)
      - Symbol keys (objects with symbol keys), BigInt, Date, RegExp, Map, Set
    - Object keys: sorted by `Array.prototype.sort()` default (UTF-16 code unit) — RFC 8785 §3.2.3 compatible
    - Numbers/strings: emitted via `JSON.stringify` (already RFC 8785 compatible)
    - Arrays: preserve order; recurse
    - No whitespace, no trailing newline
    - Output is byte-stable: `canonicalize({a:1,b:2})` === `canonicalize({b:2,a:1})`
    - `resolveCanonicalizer("json-c14n@1.0")` returns the function; any other tag returns `null`
  </behavior>
  <action>
**`packages/authority/src/signature/canonicalize.ts`** — implement per RESEARCH.md spec verbatim. Use the example code from research lines ~395-413 as the starting point. Add explicit `validateCanonicalInput` recursive helper that throws on anomalies BEFORE `canonicalSerialize` runs (split-validate-then-serialize prevents partial output on errors). Export both functions.

```ts
export class CanonicalizationError extends Error {
  constructor(public readonly reason: string, public readonly path: string) {
    super(`canonicalize: ${reason} at ${path}`);
  }
}

export function canonicalizeJsonC14nV1(value: unknown): string {
  validateCanonicalInput(value, "$");
  return canonicalSerialize(value);
}

export function validateCanonicalInput(v: unknown, path: string): void {
  if (v === undefined) throw new CanonicalizationError("undefined not permitted", path);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new CanonicalizationError("non-finite number", path);
    if (Object.is(v, -0)) throw new CanonicalizationError("-0 not permitted", path);
    return;
  }
  if (v === null || typeof v === "boolean" || typeof v === "string") return;
  if (typeof v === "bigint") throw new CanonicalizationError("BigInt not permitted", path);
  if (typeof v === "symbol") throw new CanonicalizationError("Symbol not permitted", path);
  if (typeof v === "function") throw new CanonicalizationError("function not permitted", path);
  if (Array.isArray(v)) {
    v.forEach((item, i) => validateCanonicalInput(item, `${path}[${i}]`));
    return;
  }
  // plain object check: reject Date, RegExp, Map, Set, etc.
  if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) {
    throw new CanonicalizationError(`non-plain object (${(v as object).constructor?.name ?? "?"})`, path);
  }
  for (const sym of Object.getOwnPropertySymbols(v as object)) {
    void sym;
    throw new CanonicalizationError("Symbol keys not permitted", path);
  }
  for (const k of Object.keys(v as object)) {
    validateCanonicalInput((v as Record<string, unknown>)[k], `${path}.${k}`);
  }
}

function canonicalSerialize(v: unknown): string { /* per RESEARCH.md spec */ }
```

**`packages/authority/src/signature/canonical-form-registry.ts`:**
```ts
import type { CanonicalFormTag } from "@protostar/intent";  // "json-c14n@1.0"
import { canonicalizeJsonC14nV1 } from "./canonicalize.js";

const CANONICALIZERS = {
  "json-c14n@1.0": canonicalizeJsonC14nV1,
} as const satisfies Record<CanonicalFormTag, (value: unknown) => string>;

export const CANONICAL_FORM_TAGS: readonly CanonicalFormTag[] = Object.freeze(
  Object.keys(CANONICALIZERS) as CanonicalFormTag[],
);

export function resolveCanonicalizer(tag: string): ((value: unknown) => string) | null {
  return (CANONICALIZERS as Record<string, (v: unknown) => string>)[tag] ?? null;
}
```
The registry is the single dispatch point. Adding `json-c14n@2.0` later = one entry + extend the `CanonicalFormTag` literal in `@protostar/intent`.

**`packages/authority/src/signature/canonicalize.test.ts`** — test cases (each from VALIDATION.md GOV-06 row "Canonicalizer rejects ..."):
1. `canonicalizeJsonC14nV1({a:1,b:2})` === `canonicalizeJsonC14nV1({b:2,a:1})` (key order independence)
2. `canonicalizeJsonC14nV1({a:1, b:[2,3,{c:4}]})` produces a stable specific string (snapshot)
3. `canonicalizeJsonC14nV1(NaN)` throws `CanonicalizationError`
4. `canonicalizeJsonC14nV1(Infinity)` throws
5. `canonicalizeJsonC14nV1(-Infinity)` throws
6. `canonicalizeJsonC14nV1(-0)` throws ("collapse rejected")
7. `canonicalizeJsonC14nV1(undefined)` throws
8. `canonicalizeJsonC14nV1({a: undefined})` throws (does NOT silently drop)
9. `canonicalizeJsonC14nV1({a: 1n})` throws (BigInt)
10. `canonicalizeJsonC14nV1(new Date())` throws (non-plain)
11. `canonicalizeJsonC14nV1(/foo/)` throws (non-plain)
12. `canonicalizeJsonC14nV1(new Map([["a",1]]))` throws
13. Symbol keys: `canonicalizeJsonC14nV1({[Symbol("k")]: 1})` throws
14. `resolveCanonicalizer("json-c14n@1.0")` returns the canonicalizer
15. `resolveCanonicalizer("json-c14n@2.0")` returns `null` (unknown tag)
16. `resolveCanonicalizer("rfc8785@1.0")` returns `null`
  </action>
  <verify>
    <automated>pnpm --filter @protostar/authority test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/authority test` exits 0
    - All 16 test cases above pass (verified by test output containing "ok 16" or equivalent)
    - `grep -c 'CanonicalizationError' packages/authority/src/signature/canonicalize.ts` >= 2 (class + throw sites)
    - `grep -c 'json-c14n@1.0' packages/authority/src/signature/canonical-form-registry.ts` >= 1
    - `grep -RIn "from ['\"]node:fs['\"]\\|from ['\"]fs['\"]" packages/authority/src/signature/ | grep -v '^#' | wc -l` outputs `0`
  </acceptance_criteria>
  <done>Canonicalizer fail-closes per spec; tag registry single-dispatches; all rejection cases tested; pure logic only.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: signConfirmedIntent + verifyConfirmedIntentSignature + buildPolicySnapshot</name>
  <files>
    packages/authority/src/signature/sign.ts,
    packages/authority/src/signature/verify.ts,
    packages/authority/src/signature/policy-snapshot.ts,
    packages/authority/src/signature/sign-verify.test.ts,
    packages/authority/src/index.ts
  </files>
  <read_first>
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Signature payload + verifier shape" (lines ~418-470)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-15, Q-16, Q-17
    - packages/intent/src/confirmed-intent.ts (after Plan 03 — SignatureEnvelope shape with canonicalForm)
    - packages/authority/schema/policy-snapshot.schema.json (Plan 01 Task 2)
  </read_first>
  <behavior>
    - `buildSignatureValue({ intent, resolvedEnvelope, policySnapshotHash })`: returns hex SHA-256 of the canonicalized payload `{intent, resolvedEnvelope, policySnapshotHash}`
    - `buildSignatureEnvelope(inputs)`: returns `{ algorithm: "sha256", canonicalForm: "json-c14n@1.0", value: <hex> }`
    - `verifyConfirmedIntentSignature(intent, policySnapshot, resolvedEnvelope)` returns `Result<VerifiedIntent, SignatureMismatch>`:
      - Resolves canonicalizer from `intent.signature.canonicalForm` via the registry
      - Unknown tag → `mismatch.field === "canonicalForm"`, fail-closed (no fallback)
      - Wrong algorithm → `mismatch.field === "algorithm"`
      - Recompute the expected signature value over current inputs; compare with `intent.signature.value`
      - On mismatch, narrow the divergent field by re-hashing each component independently:
        - intent body alone hashed → if matches recorded, intent body is fine; else `mismatch.field === "intentBody"`
        - resolvedEnvelope alone → if matches recorded, fine; else `mismatch.field === "resolvedEnvelope"`
        - policySnapshotHash literal compare → mismatch → `mismatch.field === "policySnapshotHash"`
        - This narrowing requires that signing also persists per-component intermediate hashes (or the verifier recomputes by trial). **Simpler approach**: structured mismatch carries the full canonicalized payload + value; the field is identified by re-canonicalizing each component and showing which one diverges from a hash recorded alongside the signature. **For Phase 2, ship the simpler shape**: `mismatch.field` is identified by re-canonicalizing inputs in isolation and comparing partial hashes (deterministic). Document the algorithm in JSDoc.
    - `buildPolicySnapshot({ policy, resolvedEnvelope, repoPolicy, capturedAt })`: returns a `PolicySnapshot`
    - `hashPolicySnapshot(snapshot)`: returns sha256 hex of canonicalized snapshot — used as the `policySnapshotHash` field
    - All helpers pure; consumers (factory-cli) handle file I/O
  </behavior>
  <action>
**`packages/authority/src/signature/policy-snapshot.ts`:**
```ts
import { createHash } from "node:crypto";
import type { CapabilityEnvelope } from "@protostar/intent";
import type { RepoPolicy } from "../repo-policy/parse.js";
import { canonicalizeJsonC14nV1 } from "./canonicalize.js";

export interface PolicySnapshot {
  readonly schemaVersion: "1.0.0";
  readonly capturedAt: string;        // ISO date-time
  readonly policy: object;            // additionalProperties: true; tightened in Phase 8
  readonly resolvedEnvelope: CapabilityEnvelope;
  readonly repoPolicyHash?: string;   // sha256 hex of canonicalized RepoPolicy when present
}

export function buildPolicySnapshot(input: {
  capturedAt?: string;
  policy: object;
  resolvedEnvelope: CapabilityEnvelope;
  repoPolicy?: RepoPolicy;
}): PolicySnapshot {
  const snap: PolicySnapshot = {
    schemaVersion: "1.0.0",
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    policy: input.policy,
    resolvedEnvelope: input.resolvedEnvelope,
    ...(input.repoPolicy ? { repoPolicyHash: hashPolicySnapshot(input.repoPolicy) } : {}),
  };
  return Object.freeze(snap);
}

export function hashPolicySnapshot(value: unknown): string {
  return createHash("sha256").update(canonicalizeJsonC14nV1(value), "utf8").digest("hex");
}
```

**`packages/authority/src/signature/sign.ts`:**
```ts
import { createHash } from "node:crypto";
import type { CapabilityEnvelope, ConfirmedIntent, SignatureEnvelope } from "@protostar/intent";
import { canonicalizeJsonC14nV1 } from "./canonicalize.js";

export interface SignatureInputs {
  readonly intent: object;                       // un-branded intent body (pre-mint)
  readonly resolvedEnvelope: CapabilityEnvelope; // post-precedence intersection
  readonly policySnapshotHash: string;           // sha256 hex
}

export function buildSignatureValue(inputs: SignatureInputs): string {
  const canonical = canonicalizeJsonC14nV1({
    intent: inputs.intent,
    resolvedEnvelope: inputs.resolvedEnvelope,
    policySnapshotHash: inputs.policySnapshotHash,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function buildSignatureEnvelope(inputs: SignatureInputs): SignatureEnvelope {
  return Object.freeze({
    algorithm: "sha256",
    canonicalForm: "json-c14n@1.0",
    value: buildSignatureValue(inputs),
  } as const);
}
```

**`packages/authority/src/signature/verify.ts`:**
```ts
import { createHash } from "node:crypto";
import type { CapabilityEnvelope, ConfirmedIntent } from "@protostar/intent";
import { resolveCanonicalizer } from "./canonical-form-registry.js";
import { canonicalizeJsonC14nV1 } from "./canonicalize.js";
import type { PolicySnapshot } from "./policy-snapshot.js";

export interface VerifiedIntent {
  readonly intent: ConfirmedIntent;
  readonly verifiedAt: string;
}

export type SignatureMismatchField =
  | "intentBody" | "resolvedEnvelope" | "policySnapshotHash"
  | "canonicalForm" | "algorithm";

export interface SignatureMismatch {
  readonly field: SignatureMismatchField;
  readonly expected: string;
  readonly actual: string;
}

export type VerifyConfirmedIntentSignatureResult =
  | { readonly ok: true;  readonly verified: VerifiedIntent;     readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[];    readonly mismatch: SignatureMismatch };

/**
 * Q-17 single canonicalization site. Every stage that consumes a signed
 * ConfirmedIntent calls THIS function. There is no inline verification path.
 */
export function verifyConfirmedIntentSignature(
  intent: ConfirmedIntent,
  policySnapshot: PolicySnapshot,
  resolvedEnvelope: CapabilityEnvelope,
): VerifyConfirmedIntentSignatureResult {
  if (intent.signature === null) {
    return { ok: false, errors: ["intent has no signature"], mismatch: { field: "intentBody", expected: "signed", actual: "null" } };
  }
  if (intent.signature.algorithm !== "sha256") {
    return { ok: false, errors: [...], mismatch: { field: "algorithm", expected: "sha256", actual: intent.signature.algorithm } };
  }
  const canonicalizer = resolveCanonicalizer(intent.signature.canonicalForm);
  if (canonicalizer === null) {
    return { ok: false, errors: [`unknown canonicalForm tag: ${intent.signature.canonicalForm}`], mismatch: { field: "canonicalForm", expected: "json-c14n@1.0", actual: intent.signature.canonicalForm } };
  }

  // Recompute. Strip the brand + signature off the intent body for hashing.
  const intentBody = stripSignatureAndBrand(intent);
  const policySnapshotHash = createHash("sha256").update(canonicalizer(policySnapshot), "utf8").digest("hex");
  const expected = createHash("sha256").update(canonicalizer({
    intent: intentBody,
    resolvedEnvelope,
    policySnapshotHash,
  }), "utf8").digest("hex");

  if (expected !== intent.signature.value) {
    // Narrow which component diverged by re-hashing each in isolation
    // and comparing to a baseline computed from the recorded inputs.
    // For Phase 2: the simple approach — emit a generic intentBody mismatch
    // and let the verifier caller drill in. We can refine narrowing later.
    return {
      ok: false,
      errors: ["signature mismatch — payload differs from signed inputs"],
      mismatch: { field: detectDivergentField(intent, policySnapshot, resolvedEnvelope, canonicalizer), expected, actual: intent.signature.value },
    };
  }

  return { ok: true, verified: { intent, verifiedAt: new Date().toISOString() }, errors: [] };
}
```

`detectDivergentField`: re-canonicalizes each subcomponent and compares to a recorded sub-hash. For Phase 2 simpler shape: hash each of `intentBody`, `resolvedEnvelope`, and the literal `policySnapshotHash` separately; compare to the corresponding sub-hash that was embedded in the signing-time payload. Since the signing-time payload was a single combined canonicalized string, recovering per-component sub-hashes requires either (a) embedding sub-hashes in the SignatureEnvelope (NOT done — keeps envelope minimal per Q-16) or (b) the verifier re-computes from the supplied current inputs. For now: when full hash differs but `policySnapshotHash` argument equals `intent.signature ... policySnapshotHash` (which is NOT stored in envelope; this is a gap)...

**Pragmatic resolution for Phase 2:** the verifier's `mismatch.field` is best-effort. The narrowing test will:
- Pass `expected/actual` as full hex digests
- Set `field: "intentBody"` as the default fallback
- Override to `"resolvedEnvelope"` if recomputing with the originally-signed envelope (passed as a param to a test-only helper) produces a match
- Override to `"policySnapshotHash"` if the supplied `policySnapshot` differs from one re-canonicalized at sign time

For Phase 2's failure modes, the simpler approach: tests construct deliberate mismatches (mutate one field at a time) and assert `mismatch.field` is set to the corresponding identifier via the equivalence check above. Document the limitation: "exact-field narrowing in v1 is heuristic; future phases may extend SignatureEnvelope with per-component sub-hashes."

**`packages/authority/src/signature/sign-verify.test.ts`** — test cases (each from VALIDATION.md GOV-06 rows):
1. **Round-trip**: build inputs → sign → verify with same inputs → `ok: true`
2. **Mutated intent body** (e.g. change `title`): verify → `ok: false`, `mismatch.field === "intentBody"`
3. **Mutated resolvedEnvelope**: verify → `ok: false`, `mismatch.field === "resolvedEnvelope"`
4. **Stale policySnapshot** (different snapshot than signing time): verify → `ok: false`, `mismatch.field === "policySnapshotHash"`
5. **Unknown canonicalForm tag** (`"json-c14n@2.0"`): verify → `ok: false`, `mismatch.field === "canonicalForm"`, fail-closed (no canonicalizer attempted)
6. **Wrong algorithm** (`"sha512"` — type-coerced for the test): verify → `ok: false`, `mismatch.field === "algorithm"`
7. **Determinism**: `buildSignatureValue(sameInputs)` called twice produces identical hex
8. **buildPolicySnapshot includes repoPolicyHash when repoPolicy provided; omits when not** (exactOptionalPropertyTypes)
9. **hashPolicySnapshot** is deterministic over the canonicalizer

**Update `packages/authority/src/index.ts`** to re-export public surface from `./signature/sign.js`, `./signature/verify.js`, `./signature/policy-snapshot.js`, and `./signature/canonical-form-registry.js`. Do NOT export private mints (none in this plan).

NOTE on the `node:crypto` import: `createHash` is the only usage; this is permitted under PROJECT.md zero-external-runtime-deps because `node:crypto` is built-in (Q-15 lock). It does NOT count as fs imports for the authority-boundary check.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/authority test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/authority test` exits 0
    - All 9 sign-verify test cases above pass
    - `grep -c 'verifyConfirmedIntentSignature' packages/authority/src/signature/verify.ts` >= 1
    - `grep -c 'createHash' packages/authority/src/signature/sign.ts packages/authority/src/signature/policy-snapshot.ts | grep -v ':0'` returns >=2 lines (sha256 used)
    - `grep -c 'buildPolicySnapshot' packages/authority/src/signature/policy-snapshot.ts` >= 1
    - `grep -c '\"sha256\"' packages/authority/src/signature/sign.ts` >= 1 (algorithm locked, Q-15)
    - Verifier fail-closes on unknown canonicalForm: explicit test asserts `mismatch.field === "canonicalForm"` AND `errors[0]` mentions "unknown canonicalForm tag"
    - `grep -RIn "from ['\"]node:fs['\"]\\|from ['\"]fs['\"]" packages/authority/src/signature/ | grep -v '^#' | wc -l` outputs `0` (only node:crypto is allowed; fs is forbidden)
    - `pnpm run verify:full` exits 0
  </acceptance_criteria>
  <done>Single central signature verifier ships; deterministic round-trip; all 5 mismatch fields detectable; fail-closed on unknown tags; pure helpers only; ready for factory-cli wiring (Plan 07) and stage readers (Plan 09).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Sign / verify boundary | Every stage that acts on a ConfirmedIntent must verify via `verifyConfirmedIntentSignature` (Q-17 single helper) |
| Canonical form dispatch boundary | Unknown `canonicalForm` tags fail-closed; never silently fall back |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-1 | Tampering | Tampered ConfirmedIntent reaches execution | mitigate (high severity) | `verifyConfirmedIntentSignature` central helper (Q-17) — single canonicalization site, structured mismatch evidence on every divergent field. Plan 09's stage reader calls this on every read. |
| T-2-7 | Tampering | Canonicalization ambiguity producing different hashes for equivalent inputs | mitigate (high severity) | `json-c14n@1.0` canonicalizer fail-closes on `-0`, NaN, Infinity, undefined, non-plain types. Tag registry single-dispatches; unknown tags fail-closed (no fallback canonicalizer). 16 rejection-case unit tests. |
</threat_model>

<verification>
- `pnpm --filter @protostar/authority test` exits 0 (canonicalize + sign-verify suites green)
- 16 canonicalization rejection tests pass
- 9 sign-verify tests pass (round-trip, 4 mismatch fields, unknown tag, wrong algorithm, determinism, snapshot)
- Authority boundary preserved (no fs imports; node:crypto allowed per Q-15)
</verification>

<success_criteria>
- `verifyConfirmedIntentSignature` is the single helper every stage calls (Q-17)
- Canonicalizer fail-closes on every documented anomaly
- Tag registry rejects unknown forms (forward-compat headroom for json-c14n@2.0)
- Pure helpers — fs writes deferred to factory-cli (Plan 07)
- GOV-06 verification primitive ready
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-05-canonicalize-and-signature-SUMMARY.md`
</output>
