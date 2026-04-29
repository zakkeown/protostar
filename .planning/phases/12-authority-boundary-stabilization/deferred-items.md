## Phase 11 hosted-llm-adapter pre-existing build failures (deferred from 12-03)

Encountered while running `pnpm --filter @protostar/factory-cli build` during 12-03.
These TS errors exist at the worktree base (71f21fb) and are out of scope for 12-03:

- packages/hosted-llm-adapter/src/coder-adapter.test.ts(7,58): module './coder-adapter.js' not found
- packages/hosted-llm-adapter/src/hosted-openai-client.test.ts: multiple errors (module not found, types)

These belong to Phase 11 work (hosted adapter scaffolding) running in parallel.
12-03 verification narrowed to typecheck/test of @protostar/factory-cli source via `tsc --noEmit -p apps/factory-cli` excluding cross-package test files (handled at Wave 0 verify gate).

## Pre-existing factory-cli stress test build failures (observed during 12-05)

The following test files reference source modules that do not exist on disk:

- apps/factory-cli/src/commands/__stress-step.test.ts → ./__stress-step.js
- apps/factory-cli/src/stress/seed-materialization.test.ts → ./seed-materialization.js
- apps/factory-cli/src/stress/stress-caps.test.ts → ./stress-session.js, ./stress-caps.js
- apps/factory-cli/src/stress/stress-session.test.ts → ./stress-session.js
- apps/factory-cli/src/stress/wedge-detection.test.ts → ./wedge-detection.js

These break `pnpm --filter @protostar/factory-cli typecheck` and propagate to any package
that references factory-cli's tsconfig (e.g., `@protostar/admission-e2e`). They exist at
12-05 base and are NOT a regression from 12-05.

12-05 verification: ran new contract test directly via `node --test
dist/contracts/apply-change-set-mismatch.contract.test.js` — all 5 cases pass.

## CLI prune --help snapshot drift (Phase 11 regression, observed wave-1 post-merge)

`prune --help` actual output now lists `.protostar/stress/<sessionId>/` (added by
Phase 11 stress work) but `factory-cli-help.contract.test.ts` and
`cli-help-snapshot-drift.contract.test.ts` still expect the pre-stress fixture.
This is Phase 11 ownership, not a Phase 12 regression. Failing tests:
`factory-cli help snapshots - Phase 9 Q-04/OP-07 lock` (#28) and
`cli-help-snapshot-drift` (#14).

## paths package — pre-existing test failure (observed during 12-05)

`resolve-workspace-root.test.js` "uses pnpm-workspace.yaml as the sentinel rather than a
.git directory" fails inside the worktree (returns repo root instead of nested workspace).
Likely a worktree-context bug in `resolveWorkspaceRoot`, not a 12-05 regression.
