# @protostar/paths

Narrow workspace-root path resolution helper package.

## Public exports

- `export { resolveWorkspaceRoot } from "./resolve-workspace-root.js"` - public surface exported from `src/index.ts`.

## Runtime dependencies

- none (pure)

## Authority constraints

fs-permitted, network-forbidden carve-out. Scope ceiling is path resolution only: sentinel detection with existsSync/statSync and pure node:path manipulation.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
