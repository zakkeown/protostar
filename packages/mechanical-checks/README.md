# @protostar/mechanical-checks

Mechanical review adapter that turns injected subprocess/read-file capabilities into review findings.

## Public exports

- `export * from "./create-mechanical-checks-adapter.js"` - public surface exported from `src/index.ts`.
- `export * from "./diff-name-only.js"` - public surface exported from `src/index.ts`.
- `export * from "./findings.js"` - public surface exported from `src/index.ts`.
- `export { computeMechanicalScoresFromFindings } from "./findings.js"` - public surface exported from `src/index.ts`.
- `export { MechanicalScoresInput } from "./findings.js"` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/execution`
- `@protostar/repo`
- `@protostar/intent`
- `@protostar/review`
- `isomorphic-git`

## Authority constraints

pure adapter contract package: no direct filesystem or network authority; reads and subprocess execution arrive as injected capabilities.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
