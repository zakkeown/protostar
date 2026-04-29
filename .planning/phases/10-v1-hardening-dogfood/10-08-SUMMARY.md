# Phase 10 Plan 08 Implementation Checkpoint

**Plan:** `10-08-PLAN.md`
**Requirement:** DOG-04
**Checkpoint:** 2026-04-29

## Status

Implementation is complete through Task 3. The live Task 4 gate remains pending because it requires the operator/live environment: `PROTOSTAR_DOGFOOD_PAT`, LM Studio models, GitHub access, and the hours-long ≥10-run dogfood session.

## Landed

- `apps/factory-cli/src/dogfood/cursor-schema.ts`
- `apps/factory-cli/src/dogfood/report-schema.ts`
- `apps/factory-cli/src/commands/__dogfood-step.ts`
- `scripts/dogfood.sh`
- `packages/admission-e2e/src/dogfood-report-byte-equality.contract.test.ts`
- `.planning/phases/10-v1-hardening-dogfood/10-CONTEXT.md` addendum documenting the internal-subcommand authority choice

## Notes

- All `.protostar/dogfood/<sessionId>/` state writes are owned by `apps/factory-cli` via the hidden `__dogfood-step` command.
- `scripts/dogfood.sh` is executable, dark, sequential, and delegates dogfood state/cursor/report logic to `__dogfood-step`.
- `__dogfood-step` is registered with commander as hidden and does not appear in public help or `docs/cli` snapshots.
- The actual toy repo owner is `zakkeown/protostar-toy-ttt`; older Phase 10 plan text contained the typo `zkeown`.

## Verification

- `pnpm --filter @protostar/factory-cli build`
- `node --test apps/factory-cli/dist/commands/__dogfood-step.test.js apps/factory-cli/dist/dogfood/*.test.js`
- `pnpm --filter @protostar/admission-e2e build`
- `node --test packages/admission-e2e/dist/dogfood-report-byte-equality.contract.test.js`
- `pnpm --filter @protostar/factory-cli test`
- `pnpm --filter @protostar/admission-e2e test`
- `pnpm knip --no-config-hints`
- `git diff --check`
- `pnpm run verify`

## Remaining Gate

Run:

```bash
bash scripts/dogfood.sh --runs 10
```

Then copy the qualifying cursor/report into `10-08-EVIDENCE/`, author `dog-04-calibration-justification.md`, and only then mark Phase 10 closed.
