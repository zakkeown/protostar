# @protostar/hosted-llm-adapter

Hosted OpenAI-compatible execution adapter package for headless factory runs.

## Public exports

- `export * from "./hosted-openai-client.js"` - OpenAI-compatible hosted chat client surface.
- `export * from "./coder-adapter.js"` - `ExecutionAdapter` implementation surface.

## Runtime dependencies

- `@protostar/execution`
- `@protostar/lmstudio-adapter`

## Authority constraints

network-permitted adapter tier for operator-selected OpenAI-compatible endpoints; filesystem authority is forbidden and file access must be caller-injected.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
