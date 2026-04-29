# Phase 11 Deferred Items

## 2026-04-29 - Plan 11-07 Verification Blockers Outside Plan Scope

- `pnpm run verify` currently fails in `@protostar/mechanical-checks` because its existing `no-net.contract.test.ts` flags network/subprocess-shaped imports in:
  - `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts`
  - `packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts`
  - `packages/mechanical-checks/src/diff-name-only.ts`
  - `packages/mechanical-checks/src/diff-name-only.test.ts`
- This failure is outside Plan 11-07's hosted-adapter package scope and was not caused by the hosted adapter changes.
- A root `pnpm knip --no-config-hints` run also reports unrelated untracked `.claude/worktrees/...` files as unused files when those concurrent worktrees are present in the main checkout.

