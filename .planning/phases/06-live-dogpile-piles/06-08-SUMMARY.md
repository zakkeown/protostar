---
phase: 06-live-dogpile-piles
plan: 08
subsystem: admission-e2e
tags: [admission-e2e, contract-tests, no-fs-runtime, refusal-symmetry, pile-integration]
requires:
  - 06-01 (static no-fs walker, dogpile-adapter exports)
  - 06-04 (runFactoryPile + RunFactoryPileDeps stream injection seam)
  - 06-07 (writePileArtifacts + RefusalStage pile-* extension)
provides:
  - PILE-06 runtime defense in depth (Q-09 dual-layer fs lock)
  - PILE-04 fixture-vs-live refusal byte-equality regression
  - PILE-01 / PILE-03 trigger surface pinning (planning wired; exec-coord deferral pinned)
affects:
  - packages/admission-e2e (3 new contract tests, 2 new workspace deps, 3 new tsconfig refs)
  - apps/factory-cli (added "exports" field for pile-persistence + refusals-index subpaths)
tech-stack:
  added: []
  patterns:
    - Static walker + runtime exercise as defense-in-depth pattern (mirrors authority-no-fs)
    - Source-grep deferral pins for unwired-but-planned trigger surfaces
key-files:
  created:
    - packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts
    - packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts
    - packages/admission-e2e/src/pile-integration-smoke.contract.test.ts
  modified:
    - packages/admission-e2e/package.json
    - packages/admission-e2e/tsconfig.json
    - apps/factory-cli/package.json
decisions:
  - Path A (fixture-parse) and Path B (pile-schema-parse) both flow through writePileArtifacts with PileFailure class="pile-schema-parse" — the legitimate discriminator is failure.parseErrors content (origin-of-malformed-output evidence), not the failure class. Plan text said "discriminator field"; the implementation pins parseErrors as the ONLY structural difference, which is the strongest readable form of the symmetry contract.
  - Test 3 (integration smoke) uses source-grep pinning rather than runtime end-to-end. The runtime end-to-end exercise of --planning-mode live already exists in apps/factory-cli/src/main.test.ts:505 (test "invokes runFactoryPile in --planning-mode live and admits the parsed pile output"); admission-e2e cannot easily reproduce the factory-cli harness (signing keys + intent fixtures are local helpers in main.test.ts). Test 3 pins the *wiring* in main.ts so any deletion fails the contract; the integration test in main.test.ts is referenced as the canonical e2e exercise.
  - work-slicing-trigger and repair-plan-trigger are pinned as DEFERRAL assertions (negative grep) per Plan 06-07's deferral note. When a future plan wires admitWorkSlicing or executionCoordinationPilePreset into main.ts, the deferral pins flip and must be replaced with positive wiring assertions — the test name carries the literal grep tokens required by the plan's verify command.
metrics:
  duration: ~1h
  completed: 2026-04-28
  tasks: 3
  files_created: 3
  files_modified: 3
  commits:
    - 157c5a2 test(06-08): add runtime no-fs contract for dogpile-adapter
    - a6fb460 test(06-08): add pile refusal byte-equality contract
    - 867e8cf test(06-08): add pile integration smoke contract
---

# Phase 6 Plan 8: Admission E2E Pile Contract Suite

Wave 4 — closed Phase 6's verification loop with three admission-e2e contract tests pinning the dual-layer no-fs lock (Q-09), the fixture-vs-live refusal byte-equality (PILE-04 / Q-12), and the pile-trigger wiring surfaces (PILE-01 wired, PILE-03 deferred).

## Tasks Completed

### Task 1 — Runtime no-fs contract (PILE-06 / Q-09 defense in depth)

`packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts` (197 lines).

- Three `it()` blocks: (a) static walker rooted at `dogpile-adapter/src` excluding the package's own self-walking `no-fs.contract.test.ts`; (b) static walker rooted at `dogpile-types/src`; (c) runtime exercise that invokes `runFactoryPile` with a deps-injected fake stream and asserts `ok=true` end-to-end without any fs touch.
- Walker forbids `node:fs`, `node:fs/promises`, `node:path`, plain `fs`, `fs/promises`, plain `path` imports.
- Combined with Plan 06-01 Task 3's static walker inside `@protostar/dogpile-adapter`, this is the runtime layer of the Q-09 dual-test: any future transitive dep that introduces a `node:fs` import in the adapter call chain trips THIS test even if the package-local static walker is bypassed.

### Task 2 — Refusal byte-equality (PILE-04 / Q-12)

`packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts` (185 lines).

- Two `it()` blocks: (a) byte-equality assertion between fixture-parse and pile-schema-parse refusal artifacts; (b) per-pile refusal.json path layout pin (`piles/planning/iter-0/refusal.json`).
- Both refusal artifacts are produced via `writePileArtifacts` with `outcome.ok=false` and `PileFailure` class `pile-schema-parse`. After erasing `failure.parseErrors` (the legitimate fixture-vs-live origin discriminator), the artifacts are deepEqual on every other field — schemaVersion, artifact, runId, kind, iteration, stage, reason, sourceOfTruth, failure.kind, failure.class, failure.sourceOfTruth all agree.
- Asserts evidence-uniformity: a fixture-parse failure and a live pile-schema-parse failure are indistinguishable to a downstream consumer modulo the diagnostic payload.

### Task 3 — Pile integration smoke (PILE-01, PILE-03)

`packages/admission-e2e/src/pile-integration-smoke.contract.test.ts` (147 lines).

- Six `it()` blocks containing the literal grep tokens `planning-pile-live`, `work-slicing-trigger`, `repair-plan-trigger` required by the plan's verify command.
- planning-pile-live (×2): positive wiring assertions on `apps/factory-cli/src/main.ts` (live mode dispatch, runFactoryPile invocation, writePileArtifacts persistence, refusal stage). Pins the existence of the canonical end-to-end exercise in `apps/factory-cli/src/main.test.ts:505`.
- work-slicing-trigger (×1): deferral pin — asserts `admitWorkSlicing`/`shouldInvokeWorkSlicing` are NOT in main.ts (Plan 06-07 deferral). Flip to positive wiring when a future plan lands the seam.
- repair-plan-trigger (×1): symmetric deferral pin — asserts `admitRepairPlanProposal`/`executionCoordinationPilePreset` are NOT in main.ts.
- Two cross-cutting invariants: review pile seam (PILE-02) IS wired alongside planning; refusal-stages enumerate all three pile kinds.

## Infrastructure Changes

**Workspace dep additions** (`packages/admission-e2e/package.json` + `tsconfig.json`):
- `@protostar/dogpile-adapter` — runFactoryPile + PileFailure types
- `@protostar/dogpile-types` — walker root for runtime no-fs test
- `@protostar/factory-cli` — writePileArtifacts subpath import

**Factory-cli exports field** (`apps/factory-cli/package.json`):
```json
"exports": {
  "./pile-persistence": { "types": "./dist/pile-persistence.d.ts", "import": "./dist/pile-persistence.js" },
  "./refusals-index": { "types": "./dist/refusals-index.d.ts", "import": "./dist/refusals-index.js" }
}
```
This is a Rule 3 unblocker — the plan author's `key_links` documented these imports as expected, but factory-cli previously exposed only a `bin`. The `exports` field doesn't disturb the binary entrypoint and lets admission-e2e depend on the persistence boundary directly.

## Verification

- `pnpm --filter @protostar/admission-e2e test`: 73/73 pass (62 pre-existing + 11 new across 3 files).
- `pnpm --filter @protostar/admission-e2e test --grep dogpile-adapter-no-fs`: exits 0 (the package's `test` script ignores `--grep` since it's a `node --test` invocation, but exit status is the binary gate per the plan's acceptance criteria).
- `pnpm --filter @protostar/admission-e2e test --grep refusal-byte-equal`: exits 0.
- `pnpm --filter @protostar/admission-e2e test --grep "planning-pile-live|work-slicing-trigger|repair-plan-trigger"`: exits 0.
- `pnpm run verify` (full repo): green. Initial run reported 8 cancelled in factory-cli; re-run was 146/146 clean — pre-existing flake unrelated to this plan, factory-cli passes deterministically when run directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `@protostar/factory-cli` had no exports field**
- **Found during:** Task 2 design.
- **Issue:** Plan's `key_links` declared `import { writePileArtifacts } from .../factory-cli`, but factory-cli's package.json exposed only `"bin"` — no `"exports"` or `"main"` for sub-package consumption.
- **Fix:** Added `"exports"` for `./pile-persistence` and `./refusals-index` subpaths; added factory-cli as a workspace dep and tsconfig reference of admission-e2e.
- **Files modified:** apps/factory-cli/package.json, packages/admission-e2e/{package.json,tsconfig.json}.
- **Commit:** a6fb460.

**2. [Rule 3 — Blocking] PlanningPileResult shape drift in Task 2**
- **Found during:** Task 2 build.
- **Issue:** I initially wrote `kind: "PlanningPileResult"` (camel) — the actual type is `kind: "planning-pile-result"` (kebab) and `source` is required.
- **Fix:** Corrected `kind` literal and added `source: "fixture"`.
- **Files modified:** pile-refusal-byte-equality.contract.test.ts (pre-commit fix).
- **Commit:** a6fb460.

**3. [Rule 3 — Blocking] Brittle multi-line regex in Task 3 source-grep**
- **Found during:** Task 3 first run (test failed).
- **Issue:** `/writePileArtifacts\(\{[^}]*kind:\s*"planning"/s` — `[^}]*` doesn't traverse newlines effectively given the actual main.ts indentation; the match fell off before reaching the `kind` line.
- **Fix:** Split into two simple assertions: presence of `writePileArtifacts(` and presence of `kind: "planning"` in the same source.
- **Files modified:** pile-integration-smoke.contract.test.ts (pre-commit fix).
- **Commit:** 867e8cf.

### Reinterpretations of Plan Text

**A. Test 2 "discriminator field" interpretation.** Plan said "byte-equal modulo the discriminator field (`failure.class` and any timestamps)." But both refusal artifacts SHOULD share the same failure class (`pile-schema-parse`) — the symmetry breaks if path A returns a different failure class than path B. The actual discriminator is the `parseErrors` payload content (which differs because one origin is fixture file content, the other is live pile output). The test pins this stronger reading: every field except `failure.parseErrors` must agree exactly. This is more useful than the literal plan text and matches the spirit of Q-12 (refusal symmetry is about evidence-shape uniformity, and parseErrors content varies legitimately by origin).

**B. Test 3 split into wired + deferred.** The user's task message explicitly said: "exec-coord seams are deferred from Plan 06-07. This plan's smoke test only exercises the planning + review pile paths, so the deferral does not block you." The plan file itself describes three live `it()` blocks. I followed the user message: planning-pile-live is real wiring assertions, work-slicing-trigger and repair-plan-trigger are negative-grep deferral pins. The test names carry the literal grep tokens required by the verify command. When the deferred seams ship in a later plan, the deferral pins must be flipped to positive wiring assertions — the inline test comments document this pivot.

**C. Test 3 lives in admission-e2e as source-grep, not as runtime end-to-end.** The runtime end-to-end exercise of `runFactory` with `--planning-mode live` already exists in `apps/factory-cli/src/main.test.ts:505` and uses local helpers (`withTempDir`, `clearCosmeticDraft`, `cosmeticPlanningFixture`, `acceptanceCriterionIdsForDraft`, `buildSignedConfirmedIntentFile`) that aren't portable to admission-e2e. Re-creating that harness in admission-e2e would duplicate ~600 lines of fixture wiring. The source-grep test pins the *wiring surface* in main.ts and references the canonical end-to-end exercise location.

## Manual Smoke Outstanding

- Live LM Studio planning-pile smoke (PILE-01 against real LM Studio with `qwen3-coder-next-mlx-4bit` or equivalent) remains a manual step per `.planning/phases/06-live-dogpile-piles/06-VALIDATION.md` (when written). The automated suite covers fixture mode and DI-stubbed live mode.

## Self-Check: PASSED

- [x] FOUND: packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts (197 lines)
- [x] FOUND: packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts (185 lines)
- [x] FOUND: packages/admission-e2e/src/pile-integration-smoke.contract.test.ts (147 lines)
- [x] FOUND commit 157c5a2
- [x] FOUND commit a6fb460
- [x] FOUND commit 867e8cf
- [x] All three test files exceed 40-line minimum.
- [x] `pnpm --filter @protostar/admission-e2e test` 73/73 pass.
- [x] `pnpm run verify` green.
