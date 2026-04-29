# @protostar/factory-cli

Operator CLI and orchestration tier that composes intent, authority, planning, execution, review, evaluation, and delivery.

## Public exports

- CLI binary entrypoint; no package barrel exports.

## Runtime dependencies

- `@commander-js/extra-typings`
- `@protostar/artifacts`
- `@protostar/authority`
- `@protostar/delivery`
- `@protostar/delivery-runtime`
- `@protostar/dogpile-adapter`
- `@protostar/dogpile-types`
- `@protostar/evaluation`
- `@protostar/evaluation-runner`
- `@protostar/execution`
- `@protostar/intent`
- `@protostar/lmstudio-adapter`
- `@protostar/mechanical-checks`
- `@protostar/paths`
- `@protostar/planning`
- `@protostar/policy`
- `@protostar/repair`
- `@protostar/repo`
- `@protostar/review`
- `commander`

## Authority constraints

fs-permitted, network-permitted orchestration tier. Owns lifecycle composition, durable run artifacts, operator commands, and external delivery orchestration.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
