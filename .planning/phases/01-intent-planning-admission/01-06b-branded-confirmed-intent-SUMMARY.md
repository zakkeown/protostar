---
phase: 01-intent-planning-admission
plan: 06b
status: BLOCKED
subsystem: intent
tags: [brand, confirmed-intent, blocker, architectural-decision, contract-test]
requires: [04, 05, 06a]
provides: []
affects: [intent, planning, factory-cli, dogpile-adapter, admission-e2e]
key-files:
  created: []
  modified: []
decisions: []
metrics:
  duration: blocked-pre-execution
  completed: never
---

# Phase 1 Plan 06b: Branded ConfirmedIntent — BLOCKED

**One-liner:** Execution halted pre-Task-1. Plan contains an internal contradiction between Task 1 step 1f (`assertConfirmedIntent` "stays" returning branded `ConfirmedIntent`) and Task 2's contract test (asserts `MintingKeys === "promoteIntentDraft"`, which fails type-check whenever ANY public function returns `ConfirmedIntent`). Resolving the contradiction also surfaces an unscoped INTENT-02 violation in `apps/factory-cli/src/confirmed-intent-handoff.ts`'s `"confirmed-intent-input"` source path: it loads a pre-confirmed-intent JSON file and produces a branded `ConfirmedIntent` without going through `promoteIntentDraft` — exactly the CLI bypass the plan is meant to close. Both questions are Rule 4 (architectural) and exceed autonomous execution scope.

## Status

**No tasks executed. No commits made. No source files modified.**

The plan was read end-to-end, the codebase was inspected (every `defineConfirmedIntent` / `parseConfirmedIntent` / `assertConfirmedIntent` call site enumerated across `packages/intent`, `packages/planning`, `packages/dogpile-adapter`, `apps/factory-cli`), and the contradiction surfaced before any code was written. This SUMMARY is the blocker artifact.

## Blocker 1: Plan internal contradiction on `assertConfirmedIntent`

### What Task 1 step 1f says

> `assertConfirmedIntent` is a TYPE GUARD over an already-branded value — it stays. Keep its predicate signature `value is ConfirmedIntent` (TS narrows on the brand).
>
> `parseConfirmedIntent` … NARROW its return type to a NON-branded shape (e.g. change the result type's success branch from `{ ok: true; intent: ConfirmedIntent }` to `{ ok: true; data: ConfirmedIntentData }` …). Callers that need a branded ConfirmedIntent must re-promote through `promoteIntentDraft`.

### What Task 2 contract test does

```ts
type ReturnsConfirmed<K extends keyof IntentPublicSurface> =
  IntentPublicSurface[K] extends (...args: any[]) => infer R
    ? Extract<R, ConfirmedIntentBrandWitness> extends never
      ? (R extends { readonly intent: ConfirmedIntentBrandWitness } ? true : false)
      : true
    : false;
type MintingKeys = { [K in keyof IntentPublicSurface]: ReturnsConfirmed<K> extends true ? K : never }[keyof IntentPublicSurface];
type _MintSurfacePinned = Assert<Equal<MintingKeys, "promoteIntentDraft">>;
```

### The contradiction

`assertConfirmedIntent`'s current signature is `(value: unknown) => ConfirmedIntent`. Under Task 2's `ReturnsConfirmed`, `R = ConfirmedIntent` → `Extract<R, ConfirmedIntentBrandWitness>` is not `never` → `MintingKeys` includes `"assertConfirmedIntent"` → `Equal<..., "promoteIntentDraft">` fails. Task 1 step 1f and Task 2's contract test cannot both be true as written.

Even if step 1f's "type guard" wording is interpreted as `(value: unknown) => asserts value is ConfirmedIntent` (return type `void`, which would NOT trip the contract test), the implementation of that assertion at runtime must produce a brand for downstream narrowing to be sound — i.e. it would call `mintConfirmedIntent` internally, becoming a SECOND public path that mints `ConfirmedIntent`. That violates the must-have truth: *"promoteIntentDraft is the SOLE function in @protostar/intent's public surface that produces a ConfirmedIntent value"*.

The contradiction has three plausible resolutions; each requires a planner-level decision:

| Option | Effect on `assertConfirmedIntent` | Public surface impact |
|--------|------------------------------------|------------------------|
| A. Drop `assertConfirmedIntent` from the public barrel | Removed entirely | `apps/factory-cli/src/main.ts:192` (uses `.id` only) and `apps/factory-cli/src/confirmed-intent-handoff.ts:39` (uses the full brand) need migration. |
| B. Narrow return to `ConfirmedIntentData` (mirror `parseConfirmedIntent`) | Stays public but unbranded | Same call-site surgery as A; still leaves the `confirmed-intent-input` path broken — see Blocker 2. |
| C. Keep returning `ConfirmedIntent`, internally call `mintConfirmedIntent` | Stays public, second mint path | Defeats the plan's purpose; contract test would also need a hand-curated allow-list including `assertConfirmedIntent`, abandoning the type-pinned guarantee. |

## Blocker 2: `confirmed-intent-handoff.ts` is an unaddressed CLI bypass channel

`apps/factory-cli/src/confirmed-intent-handoff.ts:24-49` defines two sources for a branded `ConfirmedIntent`:

```ts
"draft-admission-gate"      // input.promotedIntent.intent — already came from promoteIntentDraft, fine.
"confirmed-intent-input"    // assertConfirmedIntent(input.parsedIntentInput) — produces a brand directly from JSON on disk.
```

The second branch loads a pre-confirmed-intent JSON file and feeds it to `assertConfirmedIntent`, which today returns a branded `ConfirmedIntent` without going through `promoteIntentDraft`. Phase 1's success criterion (INTENT-02): *"no test or CLI path can produce a ConfirmedIntent except by going through promoteIntentDraft"*. **This branch IS the CLI path that the plan is meant to close, and the plan does not address it.**

Three possible resolutions; all exceed Plan 06b's stated scope:

| Option | What changes | Risk |
|--------|--------------|------|
| α. Drop `confirmed-intent-input` from factory-cli for Phase 1 (draft-only input) | `apps/factory-cli/src/main.ts` reads only drafts; existing `confirmed-intent-input` test fixtures retired or migrated to `.draft.json` form | Smallest surface, cleanest enforcement; breaks any user/CI flow that feeds confirmed-intent JSON directly |
| β. Synthesize an `IntentDraft` from the loaded JSON and re-promote via `promoteIntentDraft` | New helper `confirmedIntentJsonToDraft` builds a draft from the confirmed shape; `createConfirmedIntentHandoff` always runs through promotion | Preserves backward compat; semantic risk if loaded JSON has fields a draft cannot represent identically (e.g. derived AC ids may diverge) |
| γ. Defer to a follow-on plan; ship 06b with the `confirmed-intent-input` path temporarily broken | `assertConfirmedIntent` removed from public barrel; `confirmed-intent-handoff.ts` left non-compiling or with an `as any` cast | Worst — known-failing consumer, also fails `pnpm -r build` gate the plan requires. |

The plan's `<threat_model>` row T-01-06b-03 acknowledges `parseConfirmedIntent` reads external JSON, but the corresponding mitigation ("Narrow parseConfirmedIntent's return type") does not address the analogous path through `assertConfirmedIntent` — exactly the path factory-cli uses.

## Blast radius the plan undersells

The plan's `files_modified` lists only intent-package files plus `confirmed-intent-mint.contract.test.ts`. Reality, based on `grep -ln "defineConfirmedIntent" packages/**/src/**`:

| Package | Files using `defineConfirmedIntent` | Estimated migration |
|---------|--------------------------------------|----------------------|
| `packages/planning/src/` | 28 test files + `candidate-admitted-plan-boundary.contract.ts` + `confirmed-intent-boundary.contract.ts` | Each constructs a raw branded intent for plan-admission tests; under Plan 06b's brand they cannot construct a `ConfirmedIntent` directly — must build a draft and run `promoteIntentDraft` |
| `packages/dogpile-adapter/src/public-candidate-plan.contract.test.ts` | 1 file | Same migration |
| `packages/intent/src/acceptance-criteria-normalization.test.ts` | 1 file | Same migration |
| `packages/intent/src/public-split-exports.contract.test.ts` | 1 file | Plan Task 2 step 5 acknowledges; needs `defineConfirmedIntent` removed and replaced with `promoteIntentDraft` |
| `packages/intent/src/example-intent-fixtures.test.ts` | 1 file (calls `parseConfirmedIntent(result.promotion.intent)`) | After narrowing, `result.promotion.intent` is branded but `parseConfirmedIntent` returns un-branded data — assertions `parsed.intent` need to become `parsed.data` |
| `apps/factory-cli/src/main.ts` + `main.test.ts` | 2 files (assertConfirmedIntent + parseConfirmedIntent) | Hits both blockers above |

Conservatively, **30+ files** require non-mechanical migration to land 06b cleanly. The plan's "fix the consumer in this task — do not paper over with `as ConfirmedIntent` casts" instruction implicitly authorizes this work but the file-modification list and the two-task atomic-commit structure don't reflect it. Without a shared `buildConfirmedIntentForTest` helper that takes sparse overrides, builds a passing draft, and runs `promoteIntentDraft`, each test site becomes 30+ lines of draft scaffolding — well past the plan's stated scope and the auto-fix attempt limit.

## What was inspected (no edits)

- `packages/intent/src/confirmed-intent.ts` — current `defineConfirmedIntent`/`parseConfirmedIntent`/`assertConfirmedIntent`; no brand, no `schemaVersion`, no `signature` yet.
- `packages/intent/src/confirmed-intent/index.ts` — re-exports the three functions above.
- `packages/intent/src/confirmed-intent-readonly.contract.ts` — 13-key readonly chain; needs `schemaVersion` + `signature` added.
- `packages/intent/src/confirmed-intent-immutability.test.ts` — runtime mutation tests via `defineConfirmedIntent`; need switch to `promoteIntentDraft`.
- `packages/intent/src/promote-intent-draft.ts` — calls `defineConfirmedIntent` on the success branch (lines 178-192). Easy switch to `mintConfirmedIntent`.
- `packages/intent/src/index.ts` — exports `defineConfirmedIntent` + `assertConfirmedIntent` + `parseConfirmedIntent` + `promoteIntentDraft`. Removal of `defineConfirmedIntent` is straightforward; `assertConfirmedIntent` is the contradiction (Blocker 1).
- `packages/intent/package.json` — `exports` map already wires `./confirmed-intent`; `./internal` subpath needs adding for Task 2.
- `packages/intent/schema/confirmed-intent.schema.json` — already includes `schemaVersion: "1.0.0"` and `signature: SignatureEnvelope | null` (added by Plan 04). The TS type needs to catch up.
- `packages/intent/src/example-intent-fixtures.test-support.ts` — fixture loader exposes `parseConfirmedIntent` via `parseResult: ReturnType<typeof parseConfirmedIntent>`; downstream consumers index `.intent` on the success arm.
- `packages/intent/src/example-intent-fixtures.test.ts:166,243` — calls `parseConfirmedIntent(result.promotion.intent).intent` (Blocker — narrowing changes `.intent` → `.data`).
- `packages/intent/src/public-split-exports.contract.test.ts` — calls `defineConfirmedIntent` directly via the `./confirmed-intent` subpath and `parseConfirmedIntent` via the same subpath; needs migration.
- `packages/intent/src/acceptance-criteria-normalization.test.ts` — calls `defineConfirmedIntent`.
- `packages/planning/src/*.test.ts` (28 sites) + `packages/planning/src/candidate-admitted-plan-boundary.contract.ts` + `packages/planning/src/confirmed-intent-boundary.contract.ts` — all construct raw branded intents.
- `packages/dogpile-adapter/src/public-candidate-plan.contract.test.ts` — same.
- `apps/factory-cli/src/main.ts:26,192` — `assertConfirmedIntent(parsedIntentInput).id` (Blocker 1 + Blocker 2).
- `apps/factory-cli/src/main.test.ts:10,197,284,304,431` — `parseConfirmedIntent(payload)` and `.intent` indexing (Blocker via narrowing).
- `apps/factory-cli/src/confirmed-intent-handoff.ts:24-49` — the load-bearing `"confirmed-intent-input"` bypass (Blocker 2).
- `packages/admission-e2e/{package.json,tsconfig.json,src/index.ts}` — Plan 05's scaffold; `tsconfig.json` already references `intent`/`policy`/`planning`/`execution`. Ready to host `confirmed-intent-mint.contract.test.ts` once Blocker 1 is resolved.
- `.planning/phases/01-intent-planning-admission/01-06-branded-confirmed-intent-SUMMARY.md` — original Plan 06's BLOCKED summary establishing the precedent of stopping pre-write when a Rule 4 architectural decision is needed.

## Why this is Rule 4, not Rule 1-3

- **Rule 1-3** = fix bugs / add missing critical functionality / unblock the current task, when the fix is mechanical and stays inside the plan's scope. Resolving Blocker 1 requires choosing an option that materially changes `assertConfirmedIntent`'s public contract and rewires factory-cli — outside the plan's two-task atomic structure.
- **Rule 4** = fix requires significant structural modification (new approach, breaking API change, switching libraries). Both blockers fall here:
  - Blocker 1 is a public-API change and a planner contradiction.
  - Blocker 2 is a Phase-1 input-contract decision (drop confirmed-intent.json input vs. synthesize draft vs. defer) that affects what the factory-cli accepts as input.

The plan's threat register says (T-01-06b-04): *"even if mintConfirmedIntent leaked at runtime, this test would fail"* — but it does not say *"and assertConfirmedIntent's brand-returning shape is intentional"*. The simplest reading is: the planner forgot to update step 1f when they wrote Task 2.

## Recommended next step

Re-plan 06b. The decisions the planner owes the executor:

1. **`assertConfirmedIntent` disposition (Blocker 1):** A (drop from public barrel), B (narrow return to `ConfirmedIntentData`), or C (keep, accept second mint).
2. **`confirmed-intent-input` factory-cli source (Blocker 2):** α (drop), β (synthesize draft + re-promote), or γ (defer + ship broken).
3. **Test-migration helper:** is a shared `buildConfirmedIntentForTest({ overrides })` helper (in `packages/intent/src/test-support` or similar — accessed via a private subpath) the right containment strategy for the 30+ planning-test sites, given that direct `defineConfirmedIntent` access is being removed?

Once those three are answered, Plan 06b becomes executable as 3-4 atomic commits (brand + private mint, helper for tests, mass migration, contract test) instead of two.

## Self-Check: PASSED

- No commits attempted; `git log --oneline -1` shows `088c14a docs(01-08): summary — refusal artifact triple on every refusal branch` (HEAD unchanged from before Plan 06b execution started).
- No source files modified; `git status --short packages/intent packages/planning packages/admission-e2e packages/dogpile-adapter apps/factory-cli` shows no `M` entries.
- Untracked `packages/artifacts/src/index.{d.ts,js,d.ts.map,js.map}` files are pre-existing build artifacts (not introduced by this execution).
- This SUMMARY is the only file written by Plan 06b execution.
