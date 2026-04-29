# @protostar/dogpile-adapter

Network-only Dogpile coordination adapter for planning, review, execution coordination, and evaluation piles.

## Public exports

- `FactoryPileKind` - public surface exported from `src/index.ts`.
- `export { resolvePileBudget } from "./resolve-pile-budget.js"` - public surface exported from `src/index.ts`.
- `export { runFactoryPile } from "./run-factory-pile.js"` - public surface exported from `src/index.ts`.
- `export { buildExecutionCoordinationMission } from "./execution-coordination-mission.js"` - public surface exported from `src/index.ts`.
- `export { buildEvaluationMission } from "./evaluation-mission.js"` - public surface exported from `src/index.ts`.
- `export { EvaluationMissionInput } from "./evaluation-mission.js"` - public surface exported from `src/index.ts`.
- `FactoryPilePreset` - public surface exported from `src/index.ts`.
- `FactoryAgentSpec` - public surface exported from `src/index.ts`.
- `FactoryPileMission` - public surface exported from `src/index.ts`.
- `PriorGenerationSummary` - public surface exported from `src/index.ts`.
- `planningPilePreset` - public surface exported from `src/index.ts`.
- `reviewPilePreset` - public surface exported from `src/index.ts`.
- `executionCoordinationPilePreset` - public surface exported from `src/index.ts`.
- `evaluationPilePreset` - public surface exported from `src/index.ts`.
- `EVAL_CONSENSUS_AGENT_DEFAULT` - public surface exported from `src/index.ts`.
- `buildPlanningMission` - public surface exported from `src/index.ts`.
- `buildReviewMission` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/dogpile-types`
- `@protostar/intent`
- `@protostar/planning`

## Authority constraints

network-permitted, fs-forbidden domain network tier. `no-fs.contract.test.ts` enforces zero filesystem/path imports in source; Dogpile remains coordination-only.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
