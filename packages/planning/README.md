# @protostar/planning

Plan graph, candidate-plan admission, work-slicing, task capability, and planning artifact contracts.

## Public exports

- `export { ExecutionRunResult } from "./execution-run-result.js"` - public surface exported from `src/index.ts`.
- `PlanTaskKind` - public surface exported from `src/index.ts`.
- `PlanTaskId` - public surface exported from `src/index.ts`.
- `PlanTaskRiskDeclaration` - public surface exported from `src/index.ts`.
- `PlanTaskRiskCompatibilityRule` - public surface exported from `src/index.ts`.
- `PLAN_TASK_RISK_COMPATIBILITY_RULES` - public surface exported from `src/index.ts`.
- `PlanTaskRepoScopeCapabilityRequirement` - public surface exported from `src/index.ts`.
- `PlanTaskToolPermissionCapabilityRequirement` - public surface exported from `src/index.ts`.
- `PlanTaskExecuteGrantCapabilityRequirement` - public surface exported from `src/index.ts`.
- `PlanTaskBudgetCapabilityRequirement` - public surface exported from `src/index.ts`.
- `PlanTaskRequiredCapabilities` - public surface exported from `src/index.ts`.
- `PlanAcceptanceCriterion` - public surface exported from `src/index.ts`.
- `PlanTaskAcceptanceTestRef` - public surface exported from `src/index.ts`.
- `PlanTask` - public surface exported from `src/index.ts`.
- `PlanTaskCoverageLink` - public surface exported from `src/index.ts`.
- `PlanTaskDependencyEdge` - public surface exported from `src/index.ts`.
- `PlanTaskDependencyGraphNode` - public surface exported from `src/index.ts`.
- `PlanTaskDependencyGraph` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/artifacts`
- `@protostar/intent`
- `@protostar/policy`

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
