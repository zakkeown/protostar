---
phase: 12-authority-boundary-stabilization
plan: 02
subsystem: intent-schema, capability-envelope
tags: [schema-cascade, mechanical-allowlist, signing, c14n, AUTH-04]
requires:
  - confirmed-intent schema 1.5.0 (Phase 7 plan 07-01)
  - canonical signing pipeline (json-c14n@1.0)
provides:
  - confirmed-intent schema 1.6.0
  - capabilityEnvelope.mechanical.allowed closed enum (verify|typecheck|lint|test)
  - default mechanical: { allowed: ["verify","lint"] } across all fixtures (Pitfall 8 mitigation)
affects:
  - All packages that read/write ConfirmedIntent (intent, authority, evaluation, lmstudio-adapter, admission-e2e, factory-cli)
tech-stack:
  added: []
  patterns: [closed-enum-at-admission, c14n-resign-pipeline]
key-files:
  created:
    - packages/admission-e2e/src/signed-intent-1-6-0.test.ts (renamed from signed-intent-1-5-0.test.ts)
  modified:
    - packages/intent/schema/confirmed-intent.schema.json
    - packages/intent/src/confirmed-intent.ts
    - packages/intent/src/capability-envelope.ts
    - packages/intent/src/promote-intent-draft.ts
    - packages/authority/src/stage-reader/factory.ts
    - 16 test/fixture files (cascade + mechanical injection)
    - examples/intents/scaffold.json (re-signed)
    - examples/intents/bad/missing-capability.json (re-signed)
decisions:
  - Auto-extended capability-envelope.ts parser (Rule 2): added mechanical to allowed keys + parseMechanical helper; otherwise the runtime would reject every fixture before the schema enum could enforce closure.
  - Auto-extended copyCapabilityEnvelope (Rule 2): preserves mechanical block through deepFreeze-on-mint; without this the central mint silently dropped the field.
  - Used a one-shot resign script (deleted post-use) invoking buildSignatureEnvelope from packages/authority/dist; matches Phase 7 plan 07-01 recipe.
metrics:
  duration: ~75 min
  completed: 2026-04-29
---

# Phase 12 Plan 02: Schema Cascade 1.5.0 → 1.6.0 Summary

JWT-style schema bump for ConfirmedIntent: 1.5.0 → 1.6.0 with new `capabilityEnvelope.mechanical.allowed` closed enum (verify | typecheck | lint | test), cascade across all source/test/fixture/example files, default-allow injection of `["verify", "lint"]` per Pitfall 8, and re-signing of the two example intents under canonical c14n@1.0.

## Tasks

| # | Name                                                     | Commit  |
| - | -------------------------------------------------------- | ------- |
| 1 | Bump schema 1.5.0→1.6.0 + add mechanical.allowed enum    | 624989e |
| 2 | Cascade test/fixture literals + inject mechanical defaults| b9431f0 |
| 3 | Re-sign signed fixtures + rename signed-intent test       | ed54aaf |

## Verification

- `grep -rln '"1\.5\.0"' packages/ apps/ examples/` → 0 results.
- Schema contains `"const": "1.6.0"` and `mechanical.allowed.items.enum = ["verify","typecheck","lint","test"]`.
- `pnpm --filter @protostar/intent build` exits 0.
- `pnpm --filter @protostar/intent test` → 143 / 143 pass.
- `pnpm --filter @protostar/authority build` exits 0.
- `pnpm --filter @protostar/authority test` → 125 / 125 pass.
- `pnpm --filter @protostar/evaluation test` → 66 / 66 pass.
- `pnpm --filter @protostar/lmstudio-adapter build` exits 0.
- `packages/admission-e2e` direct tsc + `node --test` → 156 / 156 pass across 60 suites (signed-intent-1-6-0 verify-after-canonicalization green; signed-confirmed-intent.e2e green against re-signed scaffold.json).
- `apps/factory-cli` direct tsc + `node --test` → 262 / 262 pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Extended capability-envelope.ts runtime parser**
- **Found during:** Task 1 (orientation pass).
- **Issue:** Schema 1.6.0 added `mechanical` to capabilityEnvelope, but `parseCapabilityEnvelope` in `packages/intent/src/capability-envelope.ts:225` rejects unknown keys via `rejectUnknownKeys([...allowedKeys])`. Adding `mechanical` to fixtures would have failed parsing with `capabilityEnvelope.mechanical is not allowed`, before the schema enum could even run.
- **Fix:** Added `"mechanical"` to the allowed-keys list, added `optionalMechanical` + `parseMechanical` + `readMechanicalAllowed` helpers (mirroring the `pnpm` shape), and exported `CAPABILITY_ENVELOPE_MECHANICAL_ALLOWED_COMMANDS` + `CapabilityEnvelopeMechanicalCommand` + `CapabilityEnvelopeMechanical` types so other packages can consume the closed enum.
- **Files modified:** packages/intent/src/capability-envelope.ts.
- **Commit:** 624989e (Task 1).

**2. [Rule 2 - Missing Critical Functionality] Extended copyCapabilityEnvelope to preserve mechanical**
- **Found during:** Task 1 (orientation pass).
- **Issue:** `copyCapabilityEnvelope` in `confirmed-intent.ts` does field-by-field copying; without explicit handling of `mechanical`, the deepFreeze-on-mint pipeline would have silently dropped it from any ConfirmedIntent passed through `mintConfirmedIntent`.
- **Fix:** Added an `...(envelope.mechanical !== undefined ? { mechanical: { ...allowed copy } } : {})` branch that mirrors the existing `pnpm` shape.
- **Files modified:** packages/intent/src/confirmed-intent.ts.
- **Commit:** 624989e (Task 1).

**3. [Rule 1 - Type widening] Added `as const` to EMPTY_ENVELOPE.mechanical.allowed**
- **Found during:** Task 2 build pass.
- **Issue:** `Object.freeze({ mechanical: { allowed: ["verify", "lint"] } })` widened the array literal to `string[]`, which TypeScript rejected against the closed enum union.
- **Fix:** Added `as const` to the inner literal.
- **Files modified:** packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts.
- **Commit:** b9431f0 (Task 2).

### Authentication Gates

None.

## Threat Mitigations Realized

- **T-12-01 (mechanical argv injection)**: Closed-enum `mechanical.allowed` at admission time refuses unknown command names before the signature is sealed. Operator must enumerate intended mechanical commands at intent-time, signed under c14n@1.0. The 12-01 admission gate (parallel wave) reads this list to authorize the verify/lint subprocesses; without this plan it would have nothing to read.

## Pitfall 8 Mitigation

Every existing fixture, example, and test that builds a `capabilityEnvelope` now includes `mechanical: { allowed: ["verify", "lint"] }` (or `["verify", "lint"] as const` where TS narrowing is needed). This matches `defaultMechanicalCommandsForArchetype` for cosmetic-tweak so existing cosmetic-tweak runs continue to admit verify+lint after default-deny ships in 12-01.

Files updated with default mechanical block:
- packages/intent/src/{confirmed-intent.test.ts, capability-envelope.test.ts, confirmed-intent-immutability.test.ts, public-split-exports.contract.test.ts, acceptance-criteria-normalization.test.ts}
- packages/authority/src/{stage-reader/factory.test.ts, signature/sign-verify.test.ts}
- packages/admission-e2e/src/{authority-governance-kernel.e2e.test.ts, calibration-log-append.contract.test.ts, evaluation-runner-no-fs.contract.test.ts, no-skipped-evaluation.contract.test.ts, planning-mission-prior-summary.contract.test.ts, signed-intent-1-6-0.test.ts}
- packages/evaluation/src/{create-spec-ontology-snapshot.test.ts, lineage-hash.test.ts}
- packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts (CapabilityEnvelope15 type + frozen literal)
- apps/factory-cli/src/{load-factory-config.test.ts, run-real-execution.test.ts}
- examples/intents/scaffold.json
- examples/intents/bad/missing-capability.json

## Cross-Plan Notes

- **Phase 11 cross-dep**: `pnpm --filter @protostar/admission-e2e build` fails inside this worktree because Phase 11's hosted-llm-adapter is in-flight in a parallel worktree (`coder-adapter.test.ts` referencing `coder-adapter.js` not yet implemented). The plan's verify clause `pnpm --filter @protostar/admission-e2e test` therefore exits non-zero on the build step in this worktree's view; direct `tsc -p tsconfig.json` for admission-e2e succeeds and `node --test dist/*.test.js` passes 156/156. This is documented per the parallel_execution context — Phase 11 work in another worktree resolves it.
- **Wave 0 end-of-wave gate**: 5x flake-loop `pnpm run verify` is owned by 12-01 Task 3 and runs after 12-01 + 12-02 + 12-03 land.

## Decisions Made

- **Closed enum on mechanical.allowed**: Rejected open-string array; the threat model says unknown command names must be refused at admission time, so the schema literal must enumerate the four allowed mechanical commands.
- **Default `["verify", "lint"]` injection**: Rejected leaving fixtures undefined and relying on a runtime default; explicit defaults make the intent of every fixture self-documenting and avoid silent default-drift across plans.
- **Re-sign script deleted post-use**: The script was a one-shot to produce deterministic SHA-256 hashes for the two examples; committing it would imply ongoing use, but the next signature change should follow the same 5-line recipe.

## Self-Check: PASSED

- packages/admission-e2e/src/signed-intent-1-6-0.test.ts → FOUND
- packages/admission-e2e/src/signed-intent-1-5-0.test.ts → MISSING (intentional rename)
- examples/intents/scaffold.json contains `"schemaVersion": "1.6.0"` → FOUND
- examples/intents/scaffold.json contains `"canonicalForm": "json-c14n@1.0"` → FOUND
- Commit 624989e → FOUND
- Commit b9431f0 → FOUND
- Commit ed54aaf → FOUND
- `grep -rln '"1.5.0"' packages/ apps/ examples/` → 0 (cascade clean)
