# @protostar/fixtures

Dogfood seed library and the seven-row Phase 10 outcome fixture matrix.

## Public exports

- `export * from "./seeds/index.js"` - public surface exported from `src/index.ts`.
- `export * from "./matrix/index.js"` - public surface exported from `src/index.ts`.

## Runtime dependencies

- none (pure)

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
