# @protostar/artifacts

Run-manifest and durable artifact reference contracts shared by factory stages.

## Public exports

- `export { sortJsonValue } from "./canonical-json.js"` - public surface exported from `src/index.ts`.
- `FactoryStage` - public surface exported from `src/index.ts`.
- `FactoryRunStatus` - public surface exported from `src/index.ts`.
- `StageArtifactRef` - public surface exported from `src/index.ts`.
- `StageRecord` - public surface exported from `src/index.ts`.
- `FactoryRunManifest` - public surface exported from `src/index.ts`.
- `RecordStageArtifactsInput` - public surface exported from `src/index.ts`.
- `createFactoryRunManifest` - public surface exported from `src/index.ts`.
- `recordStageArtifacts` - public surface exported from `src/index.ts`.
- `setFactoryRunStatus` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/intent`

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
