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

## paths package — pre-existing test failure (observed during 12-05)

`resolve-workspace-root.test.js` "uses pnpm-workspace.yaml as the sentinel rather than a
.git directory" fails inside the worktree (returns repo root instead of nested workspace).
Likely a worktree-context bug in `resolveWorkspaceRoot`, not a 12-05 regression.
