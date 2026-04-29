# @protostar/authority

Authority, precedence, signature, workspace-trust, and stage-reader contracts for confirmed factory runs.

## Public exports

- `export * from "./authorized-ops/index.js"` - public surface exported from `src/index.ts`.
- `export * from "./admission-decision/index.js"` - public surface exported from `src/index.ts`.
- `export * from "./budget/index.js"` - public surface exported from `src/index.ts`.
- `export * from "./precedence/index.js"` - public surface exported from `src/index.ts`.
- `export * from "./repo-policy/index.js"` - public surface exported from `src/index.ts`.
- `export * from "./signature/index.js"` - public surface exported from `src/index.ts`.
- `export * from "./stage-reader/factory.js"` - public surface exported from `src/index.ts`.
- `export * from "./stage-reader/fs-adapter.js"` - public surface exported from `src/index.ts`.
- `export * from "./workspace-trust/predicate.js"` - public surface exported from `src/index.ts`.
- `__authorityPackageReady` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/intent`
- `@protostar/repo`

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
