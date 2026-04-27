---
phase: 03-repo-runtime-sandbox
plan: 13
task: 2
created: 2026-04-27T22:21:41Z
status: passed
---

# Plan 03-13 Task 2 Fresh-Clone Smoke

REPO-08 fresh-clone install smoke passed on 2026-04-27.

## Procedure

1. Temporarily moved `/Users/zakkeown/Code/dogpile` to `/Users/zakkeown/Code/dogpile.bak.03-13.1777328518`.
2. Removed `node_modules`, `packages/*/node_modules`, and `apps/*/node_modules`.
3. Ran `pnpm install --frozen-lockfile`.
4. Restored `/Users/zakkeown/Code/dogpile`.
5. Verified `/Users/zakkeown/Code/dogpile` is present after restore.
6. Ran `pnpm --filter @protostar/dogpile-types why @dogpile/sdk`.
7. Ran `pnpm list @dogpile/sdk --filter @protostar/dogpile-types --depth 0`.
8. Ran `pnpm run verify:full`.

## Results

- `pnpm install --frozen-lockfile`: passed; lockfile was up to date and 60 packages were added from the pnpm store.
- `pnpm --filter @protostar/dogpile-types why @dogpile/sdk`: reported `@dogpile/sdk@0.2.0` under `@protostar/dogpile-types` dependencies.
- `pnpm list @dogpile/sdk --filter @protostar/dogpile-types --depth 0`: reported `@dogpile/sdk@0.2.0`.
- `pnpm run verify:full`: passed.
- Sibling restore: `/Users/zakkeown/Code/dogpile` restored and present.

## Link Check

No sibling `link:` dependency is used for `@dogpile/sdk`. `pnpm-lock.yaml` records `@dogpile/sdk@0.2.0` with a registry integrity entry.
