# @protostar/evaluation-runner

Evaluation-stage orchestrator that runs mechanical, semantic, consensus, and evolution decisions behind injected services.

## Public exports

- No public barrel exports declared in `src/index.ts`.

## Runtime dependencies

- `@protostar/evaluation`
- `@protostar/dogpile-adapter`
- `@protostar/dogpile-types`
- `@protostar/intent`
- `@protostar/planning`
- `@protostar/review`

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
