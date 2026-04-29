# @protostar/lmstudio-adapter

LM Studio coder and judge adapters plus local model configuration/preflight helpers.

## Public exports

- `export { DIFF_FENCE_RE, parseDiffBlock, type DiffParseResult } from "./diff-parser.js"` - public surface exported from `src/index.ts`.
- `export { parseSseStream } from "./sse-parser.js"` - public surface exported from `src/index.ts`.
- `export { createLmstudioCoderAdapter, type LmstudioAdapterConfig } from "./coder-adapter.js"` - public surface exported from `src/index.ts`.
- `export * from "./lmstudio-client.js"` - public surface exported from `src/index.ts`.
- `export * from "./create-judge-adapter.js"` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/execution`
- `@protostar/intent`
- `@protostar/authority`
- `@protostar/repo`
- `@protostar/artifacts`
- `@protostar/review`
- `diff`

## Authority constraints

network-permitted adapter tier for configured LM Studio endpoints; filesystem authority is forbidden and file access must be caller-injected.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
