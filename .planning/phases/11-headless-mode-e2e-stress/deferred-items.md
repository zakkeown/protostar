# Phase 11 Deferred Items

## 2026-04-29 - Plan 11-07 Verification Blockers Outside Plan Scope

- `pnpm run verify` currently fails in `@protostar/mechanical-checks` because its existing `no-net.contract.test.ts` flags network/subprocess-shaped imports in:
  - `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts`
  - `packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts`
  - `packages/mechanical-checks/src/diff-name-only.ts`
  - `packages/mechanical-checks/src/diff-name-only.test.ts`
- This failure is outside Plan 11-07's hosted-adapter package scope and was not caused by the hosted adapter changes.
- A root `pnpm knip --no-config-hints` run also reports unrelated untracked `.claude/worktrees/...` files as unused files when those concurrent worktrees are present in the main checkout.

Resolution before continuing Wave 3:
- The mechanical-checks failure was stale ignored `dist/diff-name-only*` output after Phase 12 moved `computeDiffNameOnly` into `@protostar/repo`; source no longer imports `isomorphic-git`.
- Removed the stale ignored build output from the local checkout and re-ran `pnpm --filter @protostar/mechanical-checks test` successfully.
- Fixed the remaining `pnpm knip --no-config-hints` blocker by making the internal mechanical command allowlist in `packages/intent/src/capability-envelope.ts` non-exported.
