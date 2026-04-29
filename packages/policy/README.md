# @protostar/policy

Compatibility public surface for autonomy policy, archetype, and capability-admission contracts sourced from intent.

## Public exports

- `export { authorizeFactoryStart, createAdmissionDecisionArtifact, evaluateIntentAmbiguityAdmission, promoteIntentDraft } from "./admission.js"` - public surface exported from `src/index.ts`.
- `export { PolicyVerdict } from "./admission.js"` - public surface exported from `src/index.ts`.
- `export { autoTagIntentDraftArchetype, proposeIntentDraftArchetype } from "@protostar/intent"` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@protostar/artifacts`
- `@protostar/intent`

## Authority constraints

pure package: no filesystem, no network, no subprocess authority. Side effects must stay behind repo, execution, delivery-runtime, or caller-owned adapters.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
