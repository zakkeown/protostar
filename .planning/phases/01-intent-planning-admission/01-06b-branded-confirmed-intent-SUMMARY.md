---
phase: 01-intent-planning-admission
plan: 06b
status: COMPLETE
subsystem: intent
tags: [brand, confirmed-intent, admission, contract-test, internal-subpath]
requires: [04, 05, 06a]
provides: [INTENT-02]
affects: [intent, planning, dogpile-adapter, admission-e2e, factory-cli, review, execution, policy]
key-files:
  created:
    - packages/intent/src/internal/test-builders.ts
    - packages/intent/src/internal/brand-witness.ts
    - packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts
  modified:
    - packages/intent/src/confirmed-intent.ts
    - packages/intent/src/confirmed-intent/index.ts
    - packages/intent/src/index.ts
    - packages/intent/src/promote-intent-draft.ts
    - packages/intent/src/ambiguity-scoring.ts
    - packages/intent/src/confirmed-intent-readonly.contract.ts
    - packages/intent/src/confirmed-intent-immutability.test.ts
    - packages/intent/src/example-intent-fixtures.test.ts
    - packages/intent/src/example-intent-fixtures.test-support.ts
    - packages/intent/src/acceptance-criteria-normalization.test.ts
    - packages/intent/src/public-split-exports.contract.test.ts
    - packages/intent/package.json
    - packages/planning/src/(28 files)
    - packages/dogpile-adapter/src/public-candidate-plan.contract.test.ts
    - packages/review/src/admitted-artifact-integration.test.ts
    - packages/review/src/admitted-plan-runtime-admission.test.ts
    - packages/execution/src/admitted-artifact-integration.test.ts
    - packages/execution/src/admitted-plan-runtime-admission.test.ts
    - packages/execution/package.json
    - packages/execution/tsconfig.json
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/main.test.ts
    - apps/factory-cli/src/confirmed-intent-handoff.ts
  pruned:
    - packages/policy/dist/example-intent-fixtures.test.{js,d.ts}+map (stale build artifacts; src moved to intent in earlier plan)
decisions:
  - "Q-13b Option A: assertConfirmedIntent dropped from every barrel; defineConfirmedIntent fully deleted (no rename, no internal alias)"
  - "Q-13c Option α: --intent CLI flag, intentPath option, and confirmed-intent-input handoff source fully removed; only --intent-draft / --draft are accepted; CLI surfaces a deliberate error message if --intent is passed"
  - "Q-13d: buildConfirmedIntentForTest helper lives at @protostar/intent/internal/test-builders subpath (separate from public barrel); ConfirmedIntentBrandWitness type alias lives at @protostar/intent/internal/brand-witness for the admission-e2e contract test only"
  - "ConfirmedIntent brand: declare const ConfirmedIntentBrand: unique symbol — module-private; foreign callers cannot name it"
  - "ConfirmedIntentData = un-branded payload (parseConfirmedIntent returns this on success — re-promote via promoteIntentDraft to obtain the brand)"
  - "schemaVersion: '1.0.0' + signature: SignatureEnvelope | null added at the type level (Phase 1 emits null literal; Phase 2 GOV-06 reserves the nullable signature shape)"
  - "Helper signature: buildConfirmedIntentForTest(input: ConfirmedIntentMintInput) — the loose mint shape — so 30+ migration sites do not need new fields per fixture"
  - "Mint-surface contract test: type-level Equal<MintingKeys,'promoteIntentDraft'> + type-level negative-keyof + runtime leak grep (three-layer enforcement)"
metrics:
  duration: ~50 min
  completed: 2026-04-26
---

# Phase 1 Plan 06b: Branded ConfirmedIntent Summary

**One-liner:** ConfirmedIntent is now a unique-symbol-branded type produced ONLY by `promoteIntentDraft` on the public surface (with a non-public `internal/test-builders` helper for 30+ test sites and a `internal/brand-witness` type-only export for the admission-e2e contract test); factory-cli's `--intent` / `confirmed-intent-input` CLI bypass is fully removed; a three-layer contract test (type-level positive + type-level negative-keyof + runtime barrel leak grep) pins the public mint surface so any future regression breaks `tsc -b` or `node --test`.

## Status

**5 atomic commits, all green; pnpm run verify:full exit 0.**

| Task | Commit | Description |
|------|--------|-------------|
| A | `2cc6a97` | Brand ConfirmedIntent + module-private mint + drop assertConfirmedIntent + delete defineConfirmedIntent |
| B | `e3a2ad6` | Add internal/test-builders subpath + migrate intent-package-internal test callsites |
| C1 | `895d64d` | Migrate cross-package test callsites (planning + dogpile-adapter) to buildConfirmedIntentForTest |
| C2 | `2a70efb` | Drop --intent CLI flag + confirmed-intent-input handoff source from factory-cli |
| D | `1625a2f` | Pin public mint surface — admission-e2e contract test |

## Brand Mechanism

```ts
declare const ConfirmedIntentBrand: unique symbol; // module-private; not exported

export type ConfirmedIntentData = DeepReadonly<ConfirmedIntentBaseShape>; // un-branded
export type ConfirmedIntent = ConfirmedIntentData & {
  readonly [ConfirmedIntentBrand]: true;
};
```

- **Sibling-export mint**: `mintConfirmedIntent(input: ConfirmedIntentMintInput): ConfirmedIntent` is exported from `confirmed-intent.ts` so sibling files (`promote-intent-draft.ts`, `internal/test-builders.ts`) can produce branded values, but the public barrel and the `./confirmed-intent` subpath barrel both scrub it.
- **parseConfirmedIntent narrowing**: success branch returns `{ ok: true; data: ConfirmedIntentData }` (un-branded). Consumers that need the brand must re-promote.
- **Module-private symbol**: foreign callers cannot name `ConfirmedIntentBrand` and therefore cannot fabricate a `ConfirmedIntent` literal — `tsc` rejects the missing symbol property.

## Two Non-Public Mint Subpaths

Both subpaths are tagged with a top-of-file PRIVATE SUBPATH banner stating they are test-/contract-only and may be relocated or removed without notice in Phase 2.

| Subpath | Kind | Purpose |
|---------|------|---------|
| `@protostar/intent/internal/test-builders` | value | `buildConfirmedIntentForTest(input: ConfirmedIntentMintInput): ConfirmedIntent` — test-only producer for 30+ migrated test sites; calls `mintConfirmedIntent` directly |
| `@protostar/intent/internal/brand-witness` | type-only | `export type { ConfirmedIntent as ConfirmedIntentBrandWitness }` — re-exposes the branded type under an obvious alias so admission-e2e's contract test can name the otherwise module-private brand |

Neither subpath is re-exported from any consumer-facing `index.ts` under `packages/intent/src/`. The admission-e2e contract test enforces this with a runtime leak grep (Spike 3 below).

## parseConfirmedIntent Narrowing — Migrated Sites

Every site that previously indexed `.intent` on the success arm of `parseConfirmedIntent` was migrated to `.data`:

- `packages/intent/src/example-intent-fixtures.test.ts:166,243`
- `packages/intent/src/example-intent-fixtures.test-support.ts:165,171`
- `packages/intent/src/acceptance-criteria-normalization.test.ts:455,458,459,460,461,463,466` (also gated under `parsed.ok` since the un-branded data isn't optional anymore)
- `apps/factory-cli/src/main.test.ts:197,284,304,313,431` (perl sed sweep)

## Q-13b/c/d Locked Decisions (cross-link to 01-CONTEXT.md)

The original Plan 06b execution surfaced two architectural blockers (recorded as the prior SUMMARY artifact, preserved at commit `5359300^`). The replan locked three user decisions in `01-CONTEXT.md`:

1. **Q-13b (assertConfirmedIntent disposition)** → **Option A**: drop from every barrel; promoteIntentDraft is the only public producer. `defineConfirmedIntent` is fully deleted; `assertConfirmedIntent` is removed entirely from `confirmed-intent.ts` (no internal helper survived since no internal caller remains).
2. **Q-13c (confirmed-intent-input CLI source)** → **Option α**: drop entirely. The `--intent` flag, the `intentPath` option, and the `"confirmed-intent-input"` handoff source are all gone. The CLI flag parser surfaces a deliberate error message if `--intent` is passed: *"The --intent flag is no longer supported. Provide an IntentDraft via --intent-draft or --draft; ConfirmedIntent values can only originate from the draft admission gate."*
3. **Q-13d (test-helper containment)** → **in scope**: `@protostar/intent/internal/test-builders` subpath with the loose `ConfirmedIntentMintInput` signature. The 30+ migration sites moved mechanically without restructuring.

## 33+ Callsite Migration

| Package | Files | Strategy |
|---------|-------|----------|
| `packages/intent/src/` | 3 (acceptance-criteria-normalization.test.ts, public-split-exports.contract.test.ts, confirmed-intent-immutability.test.ts) | Imported `buildConfirmedIntentForTest` from the internal subpath; `defineConfirmedIntent(` → `buildConfirmedIntentForTest(`. The immutability test was rewritten to mint via the helper directly because its prior cosmetic-tweak draft fixture would have flunked the ambiguity threshold under `promoteIntentDraft`. |
| `packages/planning/src/` | 26 (24 test files + 2 contract files) | Mechanical sed sweep: import line replaced, call identifier renamed. Mixed imports kept their other named symbols and gained a separate import line for the helper. |
| `packages/dogpile-adapter/src/` | 1 (public-candidate-plan.contract.test.ts) | Same mechanical sweep. |
| `packages/review/src/` | 2 (admitted-artifact-integration.test.ts, admitted-plan-runtime-admission.test.ts) | **Out-of-scope discovery (Rule 3 unblocker, NOT in plan's file_modified list)**: these tests construct `PlanningIntent` literals via `as const satisfies PlanningIntent`. With the brand, literal objects can no longer satisfy `ConfirmedIntent`; both files were migrated to mint via `buildConfirmedIntentForTest`. |
| `packages/execution/src/` | 2 (admitted-artifact-integration.test.ts, admitted-plan-runtime-admission.test.ts) | Same out-of-scope discovery; same fix. Plus added `@protostar/intent` workspace dep + project reference. |
| `apps/factory-cli/src/` | 3 (main.ts, main.test.ts, confirmed-intent-handoff.ts) | Plan-scope surgery (Task C2). |

**Total: 37 files migrated.** Zero callsites required restructuring beyond the helper signature; the `ConfirmedIntentMintInput` (loose) shape covered every site mechanically. `schemaVersion: "1.0.0"` and `signature: null` are defaulted inside `mintConfirmedIntent`, so fixtures did not need to add the new fields.

## factory-cli Surgery (Task C2)

**Removed:**
- `--intent <path>` CLI flag (replaced with explicit error message)
- `RunCommandOptions.intentPath?` field (`intentDraftPath` is now non-optional)
- `"confirmed-intent-input"` literal in `ConfirmedIntentHandoffSource` union (now a single literal `"draft-admission-gate"`)
- `parsedIntentInput` parameter from `CreateConfirmedIntentHandoffInput`
- `assertConfirmedIntent` import (was used at lines 26 + 192 of main.ts and at line 7 of confirmed-intent-handoff.ts)
- The `assertConfirmedIntent(parsedIntentInput).id` runId fallback path

**Tests retired:** None. `main.test.ts` line 2776 already asserted `args.includes("--intent") === false` (regression check post-Q-13c); that assertion remains as a runtime tripwire if future code re-introduces the flag. The legacy fixture path constants (`legacySampleConfirmedIntentFixtureRelativePath`) survive as guards in `assertSampleFactoryArgsAvoidLegacyBypass`.

**Tests amended:** the stdout payload key list at `main.test.ts:111-128` gained `"schemaVersion"` + `"signature"` to match the new ConfirmedIntent shape.

## ConfirmedIntent Readonly Contract — New Keys

`packages/intent/src/confirmed-intent-readonly.contract.ts` extended to assert `IsReadonlyField<ConfirmedIntent, "schemaVersion">` and `IsReadonlyField<ConfirmedIntent, "signature">` on top of the existing 13-key chain. A comment notes: *"The unique-symbol brand property is module-private and CANNOT appear in the foreign-module key set; this contract asserts the structural shape only, including the new schemaVersion + signature fields added by Plan 06b."*

## Public Mint-Surface Contract Test (Task D)

The admission-e2e contract test pins three layers:

1. **Type-level positive** — `Equal<MintingKeys, "promoteIntentDraft">`. Walks every key of `typeof IntentPublicApi`, infers the function return type, and uses `Extract<R, ConfirmedIntentBrandWitness>` + `Extract<R, { intent: ConfirmedIntentBrandWitness }>` to find the brand. The discriminated-union return shape of `PromoteIntentDraftResult` (`{ ok: true; intent: ConfirmedIntent } | { ok: false; ... }`) is handled with the second `Extract` — without it, `R extends { intent: ... }` collapses to false because the failure arm lacks the property.
2. **Type-level negative-keyof** — `defineConfirmedIntent` / `assertConfirmedIntent` / `mintConfirmedIntent` / `buildConfirmedIntentForTest` must NOT appear in `keyof typeof IntentPublicApi`.
3. **Runtime leak grep** — walks every `index.ts` under `packages/intent/src/` (skipping the `internal/` subtree itself) and asserts none of them import `from "...internal/..."`. Strips line + block comments before the grep so banner text doesn't false-positive.

## Sanity Spike Outcomes (REQUIRED — each applied + reverted; all confirmed)

| Spike | Mutation | Expected failure | Observed failure | Result |
|-------|----------|------------------|------------------|--------|
| 1 (positive-key leak) | Added `export function createConfirmedIntent(...): ConfirmedIntent { return promoteIntentDraft(input).intent as ConfirmedIntent; }` to `packages/intent/src/index.ts` | `_MintSurfacePinned` Assert fails because `MintingKeys` now includes `"createConfirmedIntent"` | `TS2344` at `packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts(44,34): Type 'false' does not satisfy the constraint 'true'.` Build also broke inside intent on the spike's own `.intent` access — extra confirmation. | ✅ |
| 2 (test-helper leak) | Added `export { buildConfirmedIntentForTest } from "./internal/test-builders.js";` to `packages/intent/src/index.ts` | `_NoBuildConfirmedIntentForTest` and `_MintSurfacePinned` Asserts both fail | `TS2344` at three sites: `packages/intent/src/public-split-exports.contract.test.ts(27,3)` (in-package tripwire), `packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts(44,34)` (`_MintSurfacePinned`), `(49,3)` (`_NoBuildConfirmedIntentForTest`). | ✅ |
| 3 (runtime export-* leak) | Added `export * from "../internal/test-builders.js";` to `packages/intent/src/confirmed-intent/index.ts` | Runtime "no consumer-facing barrel re-exports from ./internal/*" test fails listing the offending barrel | `pnpm --filter @protostar/admission-e2e test`: `not ok 2 - no consumer-facing barrel re-exports from ./internal/*` with message `Public/subpath barrels must not re-export from internal/. Offenders: /Users/zakkeown/Code/protostar/packages/intent/src/confirmed-intent/index.ts`. | ✅ |

All three spikes confirmed the contract test catches the corresponding regression. The brand + the contract test together close INTENT-02 at three layers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored array recursion in deepFreeze**
- **Found during:** Task B test run (immutability test failures).
- **Issue:** During the Task A rewrite I narrowed `isFreezable` to `typeof === "object" && !== null && !Array.isArray(value)`, which accidentally excluded arrays from deepFreeze recursion. The original code intentionally included arrays so `acceptanceCriteria`, `repoScopes`, etc. would be frozen.
- **Fix:** Reverted `isFreezable` to `typeof === "object" && !== null` (with `value is object` type guard). Confirmed via `Object.isFrozen(intent.acceptanceCriteria) === true` and `Object.isFrozen(intent.acceptanceCriteria[0]) === true`.
- **Files modified:** `packages/intent/src/confirmed-intent.ts`
- **Commit:** `e3a2ad6` (folded into Task B).

**2. [Rule 3 - Unblocker] Migrated review + execution test fixtures (out of plan's file_modified list)**
- **Found during:** Task C2 build (`pnpm --filter @protostar/factory-cli build` chained to review + execution).
- **Issue:** `packages/review/src/admitted-{artifact-integration,plan-runtime-admission}.test.ts` and `packages/execution/src/admitted-{artifact-integration,plan-runtime-admission}.test.ts` constructed `PlanningIntent` fixtures via `as const satisfies PlanningIntent`. With the new brand, literal objects no longer satisfy `ConfirmedIntent` — they're missing the brand property and now also `schemaVersion` + `signature`.
- **Fix:** Imported `buildConfirmedIntentForTest` from the internal subpath; replaced each literal with a `buildConfirmedIntentForTest({...})` call. Added `@protostar/intent` workspace dep + tsconfig project reference to `packages/execution` (review already had it).
- **Files modified:** 4 test files + `packages/execution/{package.json,tsconfig.json}` + `pnpm-lock.yaml`
- **Commit:** `2a70efb` (folded into Task C2).

**3. [Rule 1 - Bug] Pruned stale packages/policy/dist/example-intent-fixtures.test.* artifacts**
- **Found during:** `pnpm run verify:full` after Task C1.
- **Issue:** `packages/policy/dist/` contained compiled `.test.js` for source files that had been relocated to `packages/intent/` in an earlier plan. The stale dist tests started failing under the new ConfirmedIntent shape ("ConfirmedIntent parse result should include intent" — they expected `.intent`, not `.data`).
- **Fix:** Deleted `packages/policy/dist/`; `pnpm --filter @protostar/policy build` regenerated only the actual source files. Test count for policy went from 57 (with the orphans) to 1.
- **Files modified:** none in source tree; pruned dist directory.
- **Commit:** `2a70efb` (folded into Task C2).

**4. [Rule 1 - Bug] Discriminated-union return shape in MintingKeys**
- **Found during:** Task D first build of admission-e2e.
- **Issue:** `R extends { readonly intent: ConfirmedIntentBrandWitness }` returned `false` for `PromoteIntentDraftResult` because the failure arm of the union has no `intent` property; the conditional was not distributing.
- **Fix:** Replaced with `Extract<R, { readonly intent: ConfirmedIntentBrandWitness }> extends never ? false : true`. Now correctly identifies the success arm even when one or more arms of the discriminated union lack `intent`.
- **Files modified:** `packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts`
- **Commit:** `1625a2f` (folded into Task D).

### Plan steps NOT executed exactly as written

- **Task A step 6 — immutability test migration target:** Plan said "Replace defineConfirmedIntent calls with promoteIntentDraft calls (using a passing draft fixture from intent/src/example-intent-fixtures.test-support.ts)". I attempted this first; the fixture I built failed admission with `Intent ambiguity 0.51 exceeds admission ceiling 0.20`, and the existing example fixtures load at runtime which makes them unsuitable for synchronous test setup. I switched to `buildConfirmedIntentForTest` (the helper Task B introduces) — same outcome (any frozen ConfirmedIntent), and the test stays focused on immutability rather than admission policy. Recorded both approaches were tried.

- **Task A step 1h — assertConfirmedIntent disposition (option i vs ii):** Plan offered "delete entirely if no internal caller remains, else keep file-local". I deleted entirely; no internal caller in `packages/intent/src/` remained after step 4.

## Authentication Gates

None.

## Threat Flags

None — the plan's `<threat_model>` already enumerated every relevant trust boundary.

## Self-Check: PASSED

- All 5 expected commits in `git log --oneline`: `2cc6a97`, `e3a2ad6`, `895d64d`, `2a70efb`, `1625a2f`. Verified.
- `packages/admission-e2e/src/confirmed-intent-mint.contract.test.ts` exists. Verified.
- `packages/intent/src/internal/test-builders.ts` + `packages/intent/src/internal/brand-witness.ts` exist. Verified.
- `pnpm run verify:full` exit 0. Verified at the close of Task D.
- `grep -rln defineConfirmedIntent packages/ apps/` (excluding `dist/`, comments, and string-literal negative asserts in contract tests) == 0. Verified.
- All three sanity spikes break the build / test as expected. Verified.
- ConfirmedIntent brand mechanism: module-private unique symbol → foreign object literal cannot fabricate the brand → `tsc` rejects.
- Single public mint path: `promoteIntentDraft`. Two non-public mint subpaths (test-builders + brand-witness) both off every consumer-facing barrel.

INTENT-02 closed.
