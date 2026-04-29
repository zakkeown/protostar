# @protostar/repair

Repair-plan synthesis, repair subgraph selection, and execution-coordination pile result parsing.

## Public exports

- `export * from "./synthesize-repair-plan.js"` - public surface exported from `src/index.ts`.
- `export * from "./compute-repair-subgraph.js"` - public surface exported from `src/index.ts`.
- `export * from "./execution-coordination-pile-result.js"` - public surface exported from `src/index.ts`.
- `export * from "./admit-repair-plan-proposal.js"` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/planning`
- `@protostar/intent`

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
