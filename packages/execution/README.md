# @protostar/execution

Execution task, adapter, journal, retry, snapshot, and dry-run contracts.

## Public exports

- `export * from "./adapter-contract.js"` - public surface exported from `src/index.ts`.
- `export * from "./backoff.js"` - public surface exported from `src/index.ts`.
- `export * from "./journal.js"` - public surface exported from `src/index.ts`.
- `export * from "./journal-types.js"` - public surface exported from `src/index.ts`.
- `export * from "./orphan-replay.js"` - public surface exported from `src/index.ts`.
- `export * from "./retry-classifier.js"` - public surface exported from `src/index.ts`.
- `export * from "./snapshot.js"` - public surface exported from `src/index.ts`.
- `ExecutionTaskStatus` - public surface exported from `src/index.ts`.
- `ExecutionTask` - public surface exported from `src/index.ts`.
- `ExecutionRunPlan` - public surface exported from `src/index.ts`.
- `ExecutionLifecycleEventType` - public surface exported from `src/index.ts`.
- `ExecutionLifecycleEvent` - public surface exported from `src/index.ts`.
- `ExecutionDryRunTaskResult` - public surface exported from `src/index.ts`.
- `ExecutionDryRunResult` - public surface exported from `src/index.ts`.
- `ExecutionDryRunOptions` - public surface exported from `src/index.ts`.
- `ExecutionAdmittedPlanAdmissionViolationCode` - public surface exported from `src/index.ts`.
- `ExecutionAdmittedPlanAdmissionViolation` - public surface exported from `src/index.ts`.
- `ExecutionAdmittedPlanAdmissionValidation` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/artifacts`
- `@protostar/intent`
- `@protostar/planning`
- `@protostar/repo`

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
