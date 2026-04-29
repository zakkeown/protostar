---
phase: 12-authority-boundary-stabilization
plan: 06
subsystem: mechanical-via-repo + wiring decomposition
tags: [authority, mechanical-commands, subprocess, allowlist, wiring, AUTH-03, AUTH-05, AUTH-14, T-12-01]

requires:
  - phase: 12-authority-boundary-stabilization
    provides: ["confirmed-intent 1.6.0 mechanical.allowed enum (Wave 0)", "subprocess-runner inheritEnv required (12-04)"]
provides:
  - "@protostar/repo mechanical-commands module (CLOSED_MECHANICAL_COMMAND_NAMES, MECHANICAL_COMMAND_BINDINGS, MechanicalCommandRefusedError, inferMechanicalName)"
  - "apps/factory-cli/src/wiring/command-execution.ts (mechanical runtime via runCommand)"
  - "apps/factory-cli/src/wiring/delivery.ts (PROTOSTAR_GITHUB_TOKEN site, D-07 structural split)"
  - "factory-config.schema.json closed-enum mechanical commands"
  - "mechanical-via-repo.contract.test.ts (T-12-01 mitigation pin)"
affects:
  - "apps/factory-cli/src/main.ts (raw spawn / runSpawnedCommand / inline delivery block deleted)"
  - "@protostar/mechanical-checks (subprocess runner reshaped to name-shape; MechanicalChecksCommandConfig collapsed to closed-enum string)"
  - "@protostar/lmstudio-adapter factory-config (operator config commands collapsed to closed enum)"
  - "@protostar/factory-cli wiring/review-loop.ts (configuredMechanicalCommands intersects envelope)"

tech-stack:
  added: []
  patterns:
    - "Closed-enum allowlist + per-name argv binding at the library layer; operator can intersect, never extend"
    - "Wiring-layer subprocess runner using runCommand with inheritEnv: [] (baseline-only env)"
    - "Structural assertion via grep contract test: token site lives in delivery.ts, never in command-execution.ts"

key-files:
  created:
    - "packages/repo/src/mechanical-commands.ts"
    - "packages/repo/src/mechanical-commands.test.ts"
    - "apps/factory-cli/src/wiring/command-execution.ts"
    - "apps/factory-cli/src/wiring/command-execution.test.ts"
    - "apps/factory-cli/src/wiring/delivery.ts"
    - "apps/factory-cli/src/wiring/delivery.test.ts"
    - "packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts"
  modified:
    - "packages/repo/src/index.ts"
    - "packages/lmstudio-adapter/src/factory-config.schema.json"
    - "packages/lmstudio-adapter/src/factory-config.ts"
    - "packages/lmstudio-adapter/src/factory-config.test.ts"
    - "packages/mechanical-checks/src/create-mechanical-checks-adapter.ts"
    - "packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts"
    - "apps/factory-cli/src/main.ts"
    - "apps/factory-cli/src/wiring/review-loop.ts"
    - "apps/factory-cli/src/wiring/review-loop.test.ts"

key-decisions:
  - "MechanicalChecksCommandConfig collapsed to a string-literal type (the closed-enum name). The {id, argv} struct is gone — argv is bound at runtime by name from MECHANICAL_COMMAND_BINDINGS, so the operator-config + adapter-input shapes are now identical."
  - "Skipped the @protostar/repo/mechanical-commands subpath export. Barrel export from @protostar/repo is sufficient and avoids dist-layout fragility (per advisor note). Contract test imports via the main barrel."
  - "delivery.ts owns buildAuthorizationPayload + writeDeliveryAuthorizationPayloadAtomic (relocated from main.ts) so the token-adjacent helpers live with the token site. main.ts re-imports nothing from delivery.ts other than buildAndExecuteDelivery."
  - "Capability-envelope intersection added to BuildReviewRepairServicesInput as an optional allowedMechanicalCommands field. main.ts threads intent.capabilityEnvelope.mechanical.allowed through; legacy callers that omit it retain pre-intersection behavior. Schema is the structural enforcement; the runtime intersection is defense-in-depth."

requirements-completed: [AUTH-03, AUTH-05, AUTH-14]

metrics:
  duration: ~55 minutes
  completed: 2026-04-29
  tasks: 3/3
---

# Phase 12 Plan 06: mechanical-via-repo + wiring decomposition Summary

Mechanical commands now run through `@protostar/repo`'s `runCommand` allowlist with closed names + per-name argv bindings. Operator config can only intersect the capability envelope's `mechanical.allowed[]` (closed-enum schema + runtime intersection). Raw `spawn` deleted from `main.ts`; the delivery wiring and the mechanical-command runner are extracted into `wiring/{delivery,command-execution}.ts` so the `PROTOSTAR_GITHUB_TOKEN` site lives at the library boundary in `delivery.ts` and never in `command-execution.ts` (D-07 structural assertion).

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 (TDD per task)
- **Files modified:** 9
- **Files created:** 7

## Accomplishments

- Closed 4-name mechanical command allowlist (`verify`, `typecheck`, `lint`, `test`) lives in `@protostar/repo/mechanical-commands` with frozen per-name argv bindings + `MechanicalCommandRefusedError` for refusal evidence + `inferMechanicalName` backward-compat helper for argv-shaped legacy callers.
- `apps/factory-cli/src/main.ts` no longer imports `node:child_process`. The local `createMechanicalSubprocessRunner` (raw spawn) and `runSpawnedCommand` (dead code) are deleted.
- New `apps/factory-cli/src/wiring/command-execution.ts` implements the mechanical runtime via `runCommand` from `@protostar/repo` with `inheritEnv: []` (D-06 baseline-only env). Refuses with typed `MechanicalCommandRefusedError` when a name falls outside the capability envelope.
- New `apps/factory-cli/src/wiring/delivery.ts` owns the entire delivery flow extracted from `main.ts` lines 1192-1267, including the only `PROTOSTAR_GITHUB_TOKEN` read site (handed in-process to Octokit + `isomorphic-git onAuth`; never to a subprocess).
- `packages/lmstudio-adapter/src/factory-config.schema.json` mechanicalChecks.commands is now a closed enum (no `{id, argv}` struct, no free-form argv). `MechanicalChecksCommandConfig` in `factory-config.ts` collapses to the string-literal type.
- `MechanicalChecksSubprocessRunner` accepts `name: MechanicalCommandName` (Pitfall 4) instead of `argv`. The adapter assembles result-evidence argv from `MECHANICAL_COMMAND_BINDINGS[name]`.
- `wiring/review-loop.ts` `defaultMechanicalCommandsForArchetype` and `configuredMechanicalCommands` return `MechanicalCommandName[]`. `mechanicalAdapterConfigSync` intersects operator config with `allowedMechanicalCommands` from the capability envelope (D-04 runtime gate).
- Six-case contract test `mechanical-via-repo.contract.test.ts` pins: no `node:child_process` import in `main.ts`, no `runSpawnedCommand` literal, schema-binding agreement at both factory-config and confirmed-intent layers, the delivery-token structural split, and the D-05 cwd forwarding shape.

## Task Commits

| # | Hash    | Message                                                                                              |
|---|---------|------------------------------------------------------------------------------------------------------|
| 1 | 18f1aa6 | `test(12-06): add failing mechanical-commands closed allowlist tests` (RED gate)                    |
| 2 | a59d4c3 | `feat(12-06): add @protostar/repo mechanical-commands module` (GREEN)                               |
| 3 | 5a959b3 | `feat(12-06): export mechanical-commands from @protostar/repo barrel`                               |
| 4 | 7281f64 | `feat(12-06): route mechanical commands through @protostar/repo + extract wiring/{command-execution,delivery}.ts` |
| 5 | 06e33e3 | `test(12-06): add mechanical-via-repo contract test`                                                |

## Verification

- `pnpm --filter @protostar/repo test` — 127/127 pass (+11 new mechanical-commands tests).
- `pnpm --filter @protostar/mechanical-checks test` — 26/26 pass after adapter reshape.
- `pnpm --filter @protostar/lmstudio-adapter test` — 93/93 pass after schema/type collapse.
- `node --test apps/factory-cli/dist/wiring/{command-execution,delivery,review-loop}.test.js` — 10/10 pass.
- `node --test packages/admission-e2e/dist/contracts/mechanical-via-repo.contract.test.js` — 6/6 pass.
- `node --test packages/admission-e2e/dist/contracts/env-empty-default.contract.test.js` — 4/4 pass (12-04 invariants intact under the new wiring).
- Acceptance grep checks all green:
  - `! grep -q 'from "node:child_process"' apps/factory-cli/src/main.ts` ✓
  - `! grep -q 'runSpawnedCommand' apps/factory-cli/src/main.ts` ✓
  - `test -f apps/factory-cli/src/wiring/command-execution.ts` ✓
  - `test -f apps/factory-cli/src/wiring/delivery.ts` ✓
  - `grep -q 'PROTOSTAR_GITHUB_TOKEN' apps/factory-cli/src/wiring/delivery.ts` ✓
  - `! grep -q 'PROTOSTAR_GITHUB_TOKEN' apps/factory-cli/src/wiring/command-execution.ts` ✓
  - `grep -q '"enum": \["verify", "typecheck", "lint", "test"\]' packages/lmstudio-adapter/src/factory-config.schema.json` ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `MechanicalChecksCommandConfig` in `@protostar/lmstudio-adapter` was a hidden third site for the type collapse**
- **Found during:** Task 2 (advisor flagged before edit; Step E of plan only mentioned the adapter interface).
- **Issue:** Plan focused on the adapter interface; `factory-config.ts:89-96` declared the same type independently. Leaving it as `{id, argv}` would have caused an immediate type incompatibility once the schema flipped to a string array.
- **Fix:** Collapsed `MechanicalChecksCommandConfig` to `MechanicalCommandName` (string literal type). Updated `validateMechanicalCommands` in `factory-config.ts` to enforce closed-enum membership instead of object-shape validation. Updated the two `factory-config.test.ts` cases.
- **Files modified:** `packages/lmstudio-adapter/src/factory-config.ts`, `packages/lmstudio-adapter/src/factory-config.test.ts`
- **Commit:** 7281f64

**2. [Rule 1 - Bug] D-07 structural split assertion was tripped by a comment containing the literal token name**
- **Found during:** Task 2 verify step.
- **Issue:** The first draft of `wiring/command-execution.ts` mentioned `PROTOSTAR_GITHUB_TOKEN` in two doc-comments. The contract test (and the must_have grep `! grep -q 'PROTOSTAR_GITHUB_TOKEN' apps/factory-cli/src/wiring/command-execution.ts`) is intentionally strict: any literal occurrence — even in a comment — defeats the structural assertion.
- **Fix:** Rewrote the comments to refer to "the delivery-token env-var name" without naming it.
- **Files modified:** `apps/factory-cli/src/wiring/command-execution.ts`
- **Commit:** 7281f64

**3. [Rule 3 - Blocking] `wiring/delivery.test.ts` resolved the source-file path with one too few `..`s**
- **Found during:** Task 2 verify step (test ran from `dist/wiring`, computed `apps/src/wiring/delivery.ts`).
- **Fix:** distDir is `apps/factory-cli/dist/wiring` → up 2 to package root, then `src/wiring`. Replaced the path arithmetic.
- **Files modified:** `apps/factory-cli/src/wiring/delivery.test.ts`
- **Commit:** 7281f64

**4. [Rule 2 - Missing Critical] `BuildReviewRepairServicesInput` did not thread `allowedMechanicalCommands`**
- **Found during:** Task 2.
- **Issue:** Plan Step D rewrote `configuredMechanicalCommands` to take an envelope argument, but the wiring callers (`main.ts:919`) had no way to pass it.
- **Fix:** Added optional `allowedMechanicalCommands` field to `BuildReviewRepairServicesInput`. `mechanicalAdapterConfigSync` filters `requested` by it when present, falls through when absent (legacy contract). `main.ts` extracts `intent.capabilityEnvelope.mechanical?.allowed ?? []` and passes it through both to `buildReviewRepairServices` and to the new `createMechanicalSubprocessRunner` runner.
- **Files modified:** `apps/factory-cli/src/wiring/review-loop.ts`, `apps/factory-cli/src/main.ts`
- **Commit:** 7281f64

**5. [Rule 1 - Bug] `wireExecuteDelivery` requires `intent.title: string` but extracted input typed it `string | undefined`**
- **Found during:** Task 2 build (factory-cli typecheck error TS2322).
- **Fix:** Tightened the `intent.title` field in `BuildAndExecuteDeliveryInput` to required string (mirroring the underlying `ConfirmedIntent.title` shape).
- **Files modified:** `apps/factory-cli/src/wiring/delivery.ts`
- **Commit:** 7281f64

### Observations (not auto-fixed; out of scope)

**Wave 0 fixture coverage gap.** Many test fixtures and `examples/intents/*.draft.json` files do not declare `capabilityEnvelope.mechanical.allowed`. Schema default is `[]`, so admission still passes, but the new runtime intersection in `mechanicalAdapterConfigSync` will produce zero mechanical commands for those fixtures. This is by design — the schema (Wave 0) intentionally requires explicit envelope opt-in. Existing `cosmetic-tweak-fixture.ts` (in `lmstudio-adapter`) already declares `mechanical: { allowed: ["verify", "lint"] }`, which is the canonical shape for runtime tests. Other fixtures will need the block populated when their hosting tests start exercising the mechanical loop end-to-end. Logged in this Summary; no `deferred-items.md` entry needed since the fixtures still admit.

## Deferred Issues (out of scope)

Pre-existing failures unaffected by this plan:

- `factory-cli help snapshots` and `cli-help-snapshot-drift` — already documented in `.planning/phases/12-authority-boundary-stabilization/deferred-items.md` as Phase 11 ownership (prune --help output drift).
- `apps/factory-cli/src/{commands,stress}/*.test.ts` — five test files reference source modules that do not exist on disk; tracked in `deferred-items.md`. Verification narrowed to the new wiring/contract tests via `node --test dist/...test.js` (mirrors 12-05's pattern).

## Threat Mitigation

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-12-01 (mechanical argv injection) | **Mitigated.** Closed name allowlist at the library layer (`@protostar/repo/mechanical-commands`) + per-name argv binding (operator cannot supply argv) + raw `spawn` deleted from `apps/factory-cli` + capability-envelope runtime intersection + contract test pin (no `node:child_process` import in `main.ts`). |

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| (none) | — | The plan tightens existing surface; no new endpoints, auth paths, or trust-boundary I/O added. |

## Self-Check: PASSED

Verified files exist:
- `packages/repo/src/mechanical-commands.ts` — FOUND
- `packages/repo/src/mechanical-commands.test.ts` — FOUND
- `apps/factory-cli/src/wiring/command-execution.ts` — FOUND
- `apps/factory-cli/src/wiring/command-execution.test.ts` — FOUND
- `apps/factory-cli/src/wiring/delivery.ts` — FOUND
- `apps/factory-cli/src/wiring/delivery.test.ts` — FOUND
- `packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts` — FOUND

Verified commits exist (range `30d2cc3..HEAD`):
- `18f1aa6` test(12-06): RED mechanical-commands tests — FOUND
- `a59d4c3` feat(12-06): mechanical-commands module — FOUND
- `5a959b3` feat(12-06): barrel export — FOUND
- `7281f64` feat(12-06): wiring extraction + raw spawn deletion — FOUND
- `06e33e3` test(12-06): mechanical-via-repo contract test — FOUND

---
*Phase: 12-authority-boundary-stabilization*
*Completed: 2026-04-29*
