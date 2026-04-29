# @protostar/review

Review gate, repair loop, judge, persistence, delivery authorization, and review-pile contracts.

## Public exports

- `export * from "./repair-types.js"` - public surface exported from `src/index.ts`.
- `export * from "./judge-types.js"` - public surface exported from `src/index.ts`.
- `export * from "./delivery-authorization.js"` - public surface exported from `src/index.ts`.
- `export { reAuthorizeFromPayload } from "./delivery-authorization.js"` - public surface exported from `src/index.ts`.
- `export * from "./lifecycle-events.js"` - public surface exported from `src/index.ts`.
- `export * from "./run-review-repair-loop.js"` - public surface exported from `src/index.ts`.
- `export * from "./persist-iteration.js"` - public surface exported from `src/index.ts`.
- `export * from "./load-delivery-authorization.js"` - public surface exported from `src/index.ts`.
- `export * from "./review-pile-result.js"` - public surface exported from `src/index.ts`.
- `export * from "./review-pile-reviewer.js"` - public surface exported from `src/index.ts`.
- `ReviewVerdict` - public surface exported from `src/index.ts`.
- `ReviewSeverity` - public surface exported from `src/index.ts`.
- `ReviewRuleId` - public surface exported from `src/index.ts`.
- `ReviewFinding` - public surface exported from `src/index.ts`.
- `MechanicalScores` - public surface exported from `src/index.ts`.
- `ReviewGate` - public surface exported from `src/index.ts`.
- `MechanicalReviewGateInput` - public surface exported from `src/index.ts`.
- `ReviewAdmittedPlanAdmissionViolationCode` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/artifacts`
- `@protostar/delivery`
- `@protostar/dogpile-adapter`
- `@protostar/dogpile-types`
- `@protostar/execution`
- `@protostar/intent`
- `@protostar/planning`
- `@protostar/repo`
- `@protostar/repair`

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
