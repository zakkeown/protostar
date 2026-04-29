# @protostar/dogpile-types

Pinned public Dogpile SDK shim consumed by the Protostar adapter.

## Public exports

- `export { AgentSpec, DogpileOptions } from "@dogpile/sdk/types"` - public surface exported from `src/index.ts`.
- `export { budget, convergence, firstOf } from "@dogpile/sdk"` - public surface exported from `src/index.ts`.
- `export { createOpenAICompatibleProvider, run, stream } from "@dogpile/sdk"` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@dogpile/sdk`

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
