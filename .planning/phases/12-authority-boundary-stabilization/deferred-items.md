## Phase 11 hosted-llm-adapter pre-existing build failures (deferred from 12-03)

Encountered while running `pnpm --filter @protostar/factory-cli build` during 12-03.
These TS errors exist at the worktree base (71f21fb) and are out of scope for 12-03:

- packages/hosted-llm-adapter/src/coder-adapter.test.ts(7,58): module './coder-adapter.js' not found
- packages/hosted-llm-adapter/src/hosted-openai-client.test.ts: multiple errors (module not found, types)

These belong to Phase 11 work (hosted adapter scaffolding) running in parallel.
12-03 verification narrowed to typecheck/test of @protostar/factory-cli source via `tsc --noEmit -p apps/factory-cli` excluding cross-package test files (handled at Wave 0 verify gate).
