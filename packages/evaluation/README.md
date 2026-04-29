# @protostar/evaluation

Pure evaluation and evolution scoring contracts, rubrics, thresholds, and ontology helpers.

## Public exports

- `EvaluationStageKind` - public surface exported from `src/index.ts`.
- `EvaluationStageStatus` - public surface exported from `src/index.ts`.
- `EvaluationVerdict` - public surface exported from `src/index.ts`.
- `EvolutionAction` - public surface exported from `src/index.ts`.
- `ONTOLOGY_CONVERGENCE_THRESHOLD` - public surface exported from `src/index.ts`.
- `MAX_EVOLUTION_GENERATIONS` - public surface exported from `src/index.ts`.
- `EVALUATION_RUBRIC_DIMENSIONS` - public surface exported from `src/index.ts`.
- `EvaluationRubricDimension` - public surface exported from `src/index.ts`.
- `T_MECH` - public surface exported from `src/index.ts`.
- `T_CONF` - public surface exported from `src/index.ts`.
- `T_MEAN_JUDGES` - public surface exported from `src/index.ts`.
- `T_MIN_JUDGES` - public surface exported from `src/index.ts`.
- `T_MEAN_DIMS` - public surface exported from `src/index.ts`.
- `T_MIN_DIMS` - public surface exported from `src/index.ts`.
- `EvaluationStageResult` - public surface exported from `src/index.ts`.
- `EvaluationReport` - public surface exported from `src/index.ts`.
- `MechanicalEvalResult` - public surface exported from `src/index.ts`.
- `JudgePerDimensionScores` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/intent`
- `@protostar/review`

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
