# Phase 2 Plan Corrections (post-advisor review, 2026-04-27)

After the initial 10 plans were drafted, the advisor flagged three blocker-class issues. This file records the corrections applied as plan-level deltas. **Executors MUST read this file before executing Phase 2 plans.** Where this file conflicts with the original PLAN.md, this file wins.

## Correction 1 — Wave-2 root-barrel conflict (Plans 02, 04, 05, 06)

> **STATUS: RESOLVED — 2026-04-27 (revision iteration 3).** Frontmatter clean; task bodies retain stub-then-append-fill semantics for `internal/brand-witness.ts`, `internal/test-builders.ts`, and `src/index.ts` re-exports. **Semantics:** Plan 01 pre-populates these files with stubs in W0; Plans 02/04/06a APPEND concrete witness/test-builder entries and add their src/index.ts re-exports. Waves do not conflict because Plan 01 finishes first (W0) and downstream writes are append-only — executors append, never overwrite. `files_modified` frontmatter intentionally omits the shared barrel/internal files since each plan's contribution is additive and ordered by wave. (Earlier iteration-2 wording said "removed"; clarified to "stub-then-append-fill" in iteration 3.)

**Original:** Plans 02, 04, 05, 06 each list `packages/authority/src/index.ts` and (for some) `packages/authority/src/internal/brand-witness.ts` + `internal/test-builders.ts` in `files_modified`. They were scheduled as parallel within their waves. Three plans in the same wave touching the same files = serial dependency. Same-wave plans MUST have zero `files_modified` overlap.

**Correction (stub-then-fill approach):**

**Plan 01 Task 1 is amended** to additionally pre-populate the root barrel + internal aggregator files with all six brand re-exports as stubs (forward references to subdir barrels and witness types that DO NOT YET EXIST — Plans 02/04/06 create them):

In `packages/authority/src/index.ts` (replace the placeholder line from Plan 01 Task 1):
```ts
// Pre-populated barrel — Plans 02/04/05/06 fill in the subdir barrels they re-export.
// Each subdir's index.ts must exist (created as `export {};` stub here in Plan 01,
// populated by the owning plan).
export * from "./authorized-ops/index.js";
export * from "./precedence/index.js";
export * from "./repo-policy/index.js";
export * from "./signature/index.js";
export * from "./admission-decision/index.js";
export * from "./stage-reader/index.js";
export * from "./workspace-trust/index.js";
export * from "./budget/index.js";
```

**Plan 01 Task 1 ALSO creates these stub barrels** (each just `export {};` initially):
- `packages/authority/src/authorized-ops/index.ts`
- `packages/authority/src/precedence/index.ts`
- `packages/authority/src/repo-policy/index.ts`
- `packages/authority/src/signature/index.ts`
- `packages/authority/src/admission-decision/index.ts`
- `packages/authority/src/stage-reader/index.ts`
- `packages/authority/src/workspace-trust/index.ts`
- `packages/authority/src/budget/index.ts`

**Plan 01 Task 1 ALSO pre-populates `packages/authority/src/internal/brand-witness.ts`** with all six brand-witness aliases as forward declarations using lazy types. Since the witness source modules don't exist yet, use the file structure:
```ts
// Pre-populated stub. Plans 02/04/06 populate the actual brand types in their subdir
// modules; this barrel re-exports them. TypeScript resolves these on a per-plan compile
// after each plan adds its source file.
export type { AuthorizedWorkspaceOpBrandWitness } from "../authorized-ops/workspace-op.js";
export type { AuthorizedSubprocessOpBrandWitness } from "../authorized-ops/subprocess-op.js";
export type { AuthorizedNetworkOpBrandWitness } from "../authorized-ops/network-op.js";
export type { AuthorizedBudgetOpBrandWitness } from "../authorized-ops/budget-op.js";
export type { PrecedenceDecisionBrandWitness } from "../precedence/precedence-decision.js";
export type { SignedAdmissionDecisionBrandWitness } from "../admission-decision/signed-admission-decision.js";
```

**Caveat:** TypeScript will fail this stub compile until Plans 02/04/06 land their source files. Two options:
- (a) Plan 01 ALSO creates each source file as a `export type FooBrandWitness = unknown;` stub (which Plans 02/04/06 then replace). Tradeoff: more pre-population but compiles immediately.
- (b) Defer the brand-witness re-exports until each plan lands. Plan 01 leaves `internal/brand-witness.ts` with `export {};`; each of Plans 02/04/06 writes ITS OWN witness file (e.g. `packages/authority/src/internal/brand-witness/workspace-op.ts`) and the root `internal/brand-witness.ts` re-exports via `export * from "./brand-witness/workspace-op.js"`. Each plan adds its own line to root brand-witness.ts.

**Choose option (a)** — simpler. Plan 01 Task 1 creates ALL six placeholder brand-source files (e.g. `packages/authority/src/authorized-ops/workspace-op.ts` with just `export type AuthorizedWorkspaceOpBrandWitness = unknown;` and an empty subdir `index.ts`). Plans 02/04/06 OVERWRITE these placeholders with their real implementations (and now their `files_modified` doesn't include `index.ts` or `internal/brand-witness.ts` — only their own subdir source files).

Same approach for `internal/test-builders.ts` — Plan 01 pre-populates with stub re-exports; each plan supplies its own builder source.

**Updated `files_modified` for Plans 02/04/05/06** — REMOVE `packages/authority/src/index.ts`, `packages/authority/src/internal/brand-witness.ts`, `packages/authority/src/internal/test-builders.ts` from each plan's `files_modified`. Each plan modifies ONLY its own subdir source files (which are forward-referenced by Plan 01's stubs).

This restores wave-2 parallelism (Plans 04/05/06 can now run in parallel; each modifies only its subdir).

## Correction 2 — Wave-3 main.ts conflict (Plans 07, 08)

> **STATUS: RESOLVED — 2026-04-27 (revision iteration 2).** Plan 08 frontmatter `depends_on` updated to `[04, 06a, 06b, 07]` (Plan 07 dependency added; serializes within wave 3).

**Original:** Plans 07 and 08 both list `apps/factory-cli/src/main.ts` and `main.test.ts` in `files_modified`, both wave 3.

**Correction:** **Serialize**. Update Plan 08 frontmatter:
```yaml
wave: 3
depends_on: [04, 06, 07]   # was [04, 06]
```
Plan 08 now depends on Plan 07 and runs sequentially after it within wave 3. (Or alternatively bump Plan 08 to wave 4; either works. Sequential within wave 3 is simpler — Wave 3 becomes a 2-step serial.)

Update Plan 09 + Plan 10 frontmatter `depends_on` to reflect: [04, 05, 06, 07, 08] for Plan 09 (already [05,06,07,08] — close enough); Plan 10 [02, 04, 05, 06, 07, 08, 09] (already correct).

## Correction 3 — Plan 05 signature mismatch narrowing must be deterministic

> **STATUS: RECORDED — apply during execution.** Plan 05 PLAN.md retains the heuristic-narrowing wording for now; the `SignatureEnvelope` sub-hash extension here is the definitive design that executors must apply.

**Original:** Plan 05 said "exact-field narrowing in v1 is heuristic." But VALIDATION.md and Plan 05's own acceptance criteria require deterministic field identification: `mismatch.field === "intentBody"`, `=== "resolvedEnvelope"`, `=== "policySnapshotHash"`.

**Correction:** Embed per-component sub-hashes in `SignatureEnvelope` AS SIBLINGS of `value` (not inside the canonicalized payload). The top-level `value` stays exactly as Plan 05 designed it: `sha256(canonicalize({intent, resolvedEnvelope, policySnapshotHash}))`. The sub-hashes are recorded alongside for verifier narrowing only.

**Updated `SignatureEnvelope` shape (Plan 03 amendment):**
```ts
export interface SignatureEnvelope {
  readonly algorithm: "sha256";
  readonly canonicalForm: CanonicalFormTag;
  readonly value: string;                    // top-level — sha256(canonicalize({intent, resolvedEnvelope, policySnapshotHash}))
  readonly intentHash: string;               // NEW — sha256(canonicalize(intent body alone))
  readonly envelopeHash: string;             // NEW — sha256(canonicalize(resolvedEnvelope alone))
  readonly policySnapshotHash: string;       // NEW — sha256(canonicalize(policy-snapshot.json)); also recorded for verifier narrowing
}
```

**Updated `confirmed-intent.schema.json` $defs.SignatureEnvelope** (Plan 03 amendment):
```json
"SignatureEnvelope": {
  "type": "object",
  "additionalProperties": false,
  "required": ["algorithm", "canonicalForm", "value", "intentHash", "envelopeHash", "policySnapshotHash"],
  "properties": {
    "algorithm": { "const": "sha256" },
    "canonicalForm": { "enum": ["json-c14n@1.0"] },
    "value":              { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "intentHash":         { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "envelopeHash":       { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "policySnapshotHash": { "type": "string", "pattern": "^[0-9a-f]{64}$" }
  }
}
```

**Plan 05 amendment** — `buildSignatureEnvelope` ALSO computes and embeds the three sub-hashes:
```ts
export function buildSignatureEnvelope(inputs: SignatureInputs): SignatureEnvelope {
  const intentHash         = createHash("sha256").update(canonicalizeJsonC14nV1(inputs.intent), "utf8").digest("hex");
  const envelopeHash       = createHash("sha256").update(canonicalizeJsonC14nV1(inputs.resolvedEnvelope), "utf8").digest("hex");
  const policySnapshotHash = inputs.policySnapshotHash;
  const value              = buildSignatureValue(inputs);
  return Object.freeze({ algorithm: "sha256", canonicalForm: "json-c14n@1.0", value, intentHash, envelopeHash, policySnapshotHash });
}
```

**Plan 05 amendment** — `verifyConfirmedIntentSignature` deterministic narrowing:
1. Recompute `intentHashCurrent`, `envelopeHashCurrent`, `policySnapshotHashCurrent` from current inputs
2. Compare each to recorded sub-hash; first mismatch wins as `mismatch.field`:
   - `intentHashCurrent !== signature.intentHash` → `field: "intentBody"`
   - else `envelopeHashCurrent !== signature.envelopeHash` → `field: "resolvedEnvelope"`
   - else `policySnapshotHashCurrent !== signature.policySnapshotHash` → `field: "policySnapshotHash"`
   - else (all sub-hashes match but top-level value differs) → `field: "canonicalForm"` or `"algorithm"` based on which differs

This makes narrowing deterministic and lets VALIDATION.md tests assert exact field literals.

## Correction 4 — Plan 06 drop duplicate `admission-decision.json` write

> **STATUS: RESOLVED — 2026-04-27 (revision iteration 2).** Absorbed into the new Plan 06b: `git mv` + REMOVE old export entry. No dual-write. Plan 09 stage reader handles legacy disk fallback at READ time.

**Original:** Plan 06 said "Keep the old `./schema/admission-decision.schema.json` export entry pointing to the same file (a JSON copy or symlink) so any external reader that still uses the old name doesn't break."

**Correction:** Drop the duplicate. Plan 09's stage reader already does try-new-then-legacy at READ time (Pitfall 2). Writing both filenames creates two-source-of-truth. Update Plan 06 Task 1 to:
- Rename `packages/intent/schema/admission-decision.schema.json` → `intent-admission-decision.schema.json` via `git mv`
- DELETE the old export entry from `packages/intent/package.json`
- Plan 09's reader handles legacy filename fallback for the 208 historical run dirs

## Correction 5 — Plan 06 schema composition approach

> **STATUS: RESOLVED — 2026-04-27 (revision iteration 2).** Absorbed into Plan 06b action block: each per-gate schema repeats base fields inline with `additionalProperties: false`. No $ref across packages.

**Original:** Plan 06 left "$ref vs allOf vs inline base fields" open.

**Correction:** **Each per-gate schema repeats the base fields with `additionalProperties: false`.** Do NOT $ref across packages. Apply uniformly to all 5 per-gate schemas.

## Correction 6 — Plan 07 Phase 1 contract surface widening (`promoteAndSignIntent`)

> **STATUS: RECORDED — apply during execution.** Plan 07 PLAN.md is unchanged in this revision iteration; executor applies the `promoteAndSignIntent` design as documented here.

**Original:** Plan 07 said "modify `promoteIntentDraft` to accept an optional `signatureProvider` callback." This embeds Phase 2 behavior inside a Phase-1-load-bearing function via a hidden callback.

**Correction:** Add a NEW public producer `promoteAndSignIntent` to `@protostar/intent` that calls `mintConfirmedIntent` with the signature filled. This is a controlled surface change rather than a hidden callback. Specifically:

**`packages/intent/src/promote-and-sign-intent.ts` (NEW):**
```ts
import { mintConfirmedIntent } from "./confirmed-intent.js";  // sibling-module import, not on public barrel
import type { ConfirmedIntent, SignatureEnvelope, ConfirmedIntentMintInput } from "./confirmed-intent.js";

export interface PromoteAndSignIntentInput extends ConfirmedIntentMintInput {
  readonly signature: SignatureEnvelope;   // required for this producer
}

export type PromoteAndSignIntentResult =
  | { readonly ok: true;  readonly intent: ConfirmedIntent; readonly errors: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

export function promoteAndSignIntent(input: PromoteAndSignIntentInput): PromoteAndSignIntentResult {
  // Validate (mirror existing promoteIntentDraft validation), then mint with signature.
  try {
    const intent = mintConfirmedIntent(input);
    return { ok: true, intent, errors: [] };
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] };
  }
}
```

Add to `packages/intent/src/index.ts` public barrel: `export { promoteAndSignIntent } from "./promote-and-sign-intent.js";`.

**Update Phase 1 contract test** (`packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts`):
```ts
// Was: type _MintSurfacePinned = Assert<Equal<MintingKeys, "promoteIntentDraft">>;
// Now (deliberate Phase 2 widening — see Plan 07 + Plan 10):
type _MintSurfacePinned = Assert<Equal<MintingKeys, "promoteIntentDraft" | "promoteAndSignIntent">>;
```

**Update Plan 10 Task 1** to include this widening as part of the contract-test maintenance. Add a code comment in the test file pointing to Plan 07 + Phase 2 corrections.

**Plan 07 Task 2 amendment**: factory-cli calls `promoteAndSignIntent` (not `promoteIntentDraft` with callback) for the signed-intent path. Phase 1's `promoteIntentDraft` is unchanged.

## Correction 7 — Plan 07 hardcoded grep gate refinement (cosmetic)

> **STATUS: RECORDED — apply during execution.** Cosmetic refinement; executor uses the tightened grep gate when verifying.

**Original Plan 07 acceptance:** `grep -v '^#' apps/factory-cli/src/main.ts | grep -c '"admission-decision.json"' outputs 0`

**Correction:** Tighten to write callsites only:
```bash
grep -E 'writeFile.*"admission-decision\\.json"|"admission-decision\\.json".*writeFile' apps/factory-cli/src/main.ts | grep -v '^#' | wc -l
```
Should output `0`. Comments/fallback-read paths (e.g. in stage reader) are allowed.

## Correction 8 — Plan 08 escalate vs two-key launch exit codes (informational)

> **STATUS: RECORDED — informational.** Both exit code 2 by design. Document the choice in Plan 08's SUMMARY.

**Original:** Plan 08 has both escalate and two-key-launch refusal exit with code 2 (A6 lock says "escalate exit = 2 distinct from refusal exit 1").

**Note:** Both are "stop-for-human" conditions (escalate awaits resume; two-key launch awaits operator re-invocation with second key). Sharing exit code 2 is defensible. If operator surface (Phase 9) needs to disambiguate, two-key launch can be promoted to exit code 3 in a future revision. **For Phase 2: ship as designed (both exit 2).** Document the choice in Plan 08's SUMMARY.

---


---

## Iteration 2 Resolutions (2026-04-27)

> Added when checker BLOCKERS were addressed in revision iteration 2. Preserves audit trail.

### BLOCKER 1 — VALIDATION.md was unfilled template
**STATUS: RESOLVED — 2026-04-27.** Per-task verification map populated with one row per task across all 11 plans. Frontmatter `nyquist_compliant: true` and `wave_0_complete: true` set. Sign-off list checked.

### BLOCKER 4 — Q-18 hard bump (user lock OVERRIDES A8 widening assumption)
**STATUS: RESOLVED — 2026-04-27.** Plan 03 reverted from enum-widening (`["1.0.0", "1.1.0"]`) to single-value hard bump (`const: "1.1.0"`). Phase 1 in-repo tests that hardcoded `schemaVersion: "1.0.0"` migrated to `"1.1.0"` (5 sites across 4 test files). Legacy disk artifacts (208 historical run dirs) handled by Plan 09 stage reader's try-new-then-legacy pattern at READ time — not by schema acceptance. A8 assumption is OVERRIDDEN; do NOT re-introduce dual-version validation or `if/then/else` schema branching.

### WARNING 6 — Plan 06 split into 06a + 06b (16 → 6 + 8 files)
**STATUS: RESOLVED — 2026-04-27.** Original Plan 06 split:
- `02-06a-admission-decision-base-PLAN.md` — authority-side base + SignedAdmissionDecision brand + tests (6 files; wave 2; depends_on `[01, 02, 03, 05]`)
- `02-06b-per-gate-evidence-schemas-PLAN.md` — 5 per-gate schemas + 3 package.json updates (8 files; wave 2; depends_on `[01, 06a]`)

Both cover GOV-03 + GOV-05. Downstream plans updated:
- Plan 07: `[04, 05, 06]` → `[04, 05, 06a, 06b]`
- Plan 08: `[04, 06]` → `[04, 06a, 06b, 07]`
- Plan 09: `[05, 06, 07, 08]` → `[05, 06a, 06b, 07, 08]`
- Plan 10: `[02, 04, 05, 06, 07, 08, 09]` → `[02, 04, 05, 06a, 06b, 07, 08, 09]`

ROADMAP.md Phase 2 plan list updated to reflect 11 total plans.

### WARNING 7 — Plan 06 truth #5 alias drift
**STATUS: RESOLVED — 2026-04-27 (absorbed into WARNING 6 split).** Plan 06b drops the "old name kept as alias" clause. Single source of truth: rename via `git mv`, REMOVE old package.json export entry. Plan 09 stage reader handles legacy disk-fallback at read time.


---
*Corrections recorded 2026-04-27 from advisor review. Apply during execution; original PLAN.md files retain their structure.*

---

## Iteration 3 Resolutions (2026-04-27)

> Final revision iteration (max-cap). All checker blockers/warnings closed.

### BLOCKER 1 — Plan 03 omitted production mint path `packages/intent/src/promote-intent-draft.ts:192`
**STATUS: RESOLVED — 2026-04-27.** Plan 03 patched:
- `files_modified` frontmatter now includes `packages/intent/src/promote-intent-draft.ts`
- Task 1 `<files>` block now includes the same path
- Task 1 `<read_first>` adds the file with explicit note about line 192 and the production-breaking risk
- Task 1 `<action>` adds an explicit migration step: line 192 literal `schemaVersion: "1.0.0"` → `"1.1.0"`
- Task 1 `<acceptance_criteria>` adds tighter grep gate covering ALL bare `schemaVersion: "1.0.0"` sites in `packages/intent/src/*.ts` (excluding `clarification-report*` files which intentionally stay at 1.0.0): `grep -rn 'schemaVersion[^"]*"1\.0\.0"' packages/intent/src/ | grep -v 'clarification-report' | wc -l` MUST equal 0
- Phase 1's intent tests call `promoteIntentDraft`, so `pnpm run verify:full` (already in Plan 03 acceptance) exercises the production mint path end-to-end after the migration

### WARNING 2 — Plan 02/04 task-body writes to `internal/*` and `src/index.ts`
**STATUS: RESOLVED via semantic clarification — 2026-04-27.** Iteration-2 update removed those paths from `files_modified` frontmatter but task bodies legitimately describe stub-then-append-fill writes (Plan 01 pre-populates stubs; Plans 02/04/06a append concrete entries — append-only, wave-ordered, no conflict). Correction 1 STATUS line updated above to make this semantic explicit. No PLAN.md edits required for Plans 02 or 04.

### WARNING 3 — Plan 09 up-converter defensive guard
**STATUS: RESOLVED — 2026-04-27.** Plan 09 Task 1 patched:
- `<behavior>` adds the up-converter description with explicit precondition: if `raw.schemaVersion === "1.0.0"` AND `raw.signature !== null`, throw `StageReaderError("intent.json", "legacy 1.0.0 with non-null signature is unsupported — pre-Phase-2 fixtures must have signature: null", path)`. Closes the silent-up-convert-of-tampered-artifact gap (1.0.0 fixtures predate the Phase 2 signer; any 1.0.0 file with a populated signature is corruption or tampering).
- `<acceptance_criteria>` adds: `grep -c 'legacy 1.0.0 with non-null signature unsupported\|legacy 1.0.0 with non-null signature is unsupported' packages/authority/src/stage-reader/factory.test.ts >= 1` to ensure the regression test ships.
