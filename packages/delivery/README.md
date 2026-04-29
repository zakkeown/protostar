# @protostar/delivery

Pure delivery-domain brands, PR body composition, authorization payloads, and refusal contracts.

## Public exports

- `export * from "./brands.js"` - public surface exported from `src/index.ts`.
- `export * from "./authorization-payload.js"` - public surface exported from `src/index.ts`.
- `export * from "./delivery-contract.js"` - public surface exported from `src/index.ts`.
- `export * from "./evidence-marker.js"` - public surface exported from `src/index.ts`.
- `export * from "./pr-body/compose-artifact-list.js"` - public surface exported from `src/index.ts`.
- `export * from "./pr-body/compose-footer.js"` - public surface exported from `src/index.ts`.
- `export * from "./pr-body/compose-judge-panel.js"` - public surface exported from `src/index.ts`.
- `export * from "./pr-body/compose-mechanical-summary.js"` - public surface exported from `src/index.ts`.
- `export * from "./pr-body/compose-repair-history.js"` - public surface exported from `src/index.ts`.
- `export * from "./pr-body/compose-run-summary.js"` - public surface exported from `src/index.ts`.
- `export * from "./pr-body/compose-score-sheet.js"` - public surface exported from `src/index.ts`.
- `export * from "./refusals.js"` - public surface exported from `src/index.ts`.
- `export { isValidGitHubTokenFormat, validateBranchName, validatePrBody, validatePrTitle } from "./brands.js"` - public surface exported from `src/index.ts`.
- `export { composeArtifactList } from "./pr-body/compose-artifact-list.js"` - public surface exported from `src/index.ts`.
- `export { composeFooter } from "./pr-body/compose-footer.js"` - public surface exported from `src/index.ts`.
- `export { composeJudgePanel } from "./pr-body/compose-judge-panel.js"` - public surface exported from `src/index.ts`.
- `export { composeMechanicalSummary } from "./pr-body/compose-mechanical-summary.js"` - public surface exported from `src/index.ts`.
- `export { composeRepairHistory } from "./pr-body/compose-repair-history.js"` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/artifacts`
- `@protostar/intent`

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
