# @protostar/admission-e2e

Cross-package contract tests that prove admission, authority, delivery, CLI, and dogfood evidence surfaces stay wired together.

## Public exports

- `ADMISSION_E2E_PACKAGE_NAME` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/authority`
- `@protostar/repo`
- `@protostar/intent`
- `@protostar/policy`
- `@protostar/planning`
- `@protostar/execution`
- `@protostar/delivery-runtime`
- `@protostar/delivery`
- `@protostar/dogpile-adapter`
- `@protostar/dogpile-types`
- `@protostar/evaluation`
- `@protostar/evaluation-runner`
- `@protostar/artifacts`
- `@protostar/factory-cli`
- `@protostar/review`

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
