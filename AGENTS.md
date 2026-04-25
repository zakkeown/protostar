# Protostar Factory Agent Guide

This repo is a dark software factory control plane. Keep the authority boundary explicit:

- Protostar owns lifecycle, policy, repository access, durable artifacts, verification, repair loops, and release gates.
- Dogpile is a bounded coordination cell for planning, review, and execution coordination. Do not make Dogpile the factory authority boundary.
- Human input is required to confirm intent. After confirmation, autonomy is governed by policy, capability envelopes, budgets, and stop gates.

## Package Boundaries

- `packages/intent`: confirmed intent, acceptance criteria, capability envelope.
- `packages/planning`: plan DAGs and plan validation.
- `packages/execution`: execution run plans and task status contracts.
- `packages/review`: review gates, findings, and pass/repair/block verdicts.
- `packages/policy`: autonomy policy and escalation decisions.
- `packages/artifacts`: run manifests, stages, and durable artifact references.
- `packages/repo`: workspace and repository access contracts.
- `packages/dogpile-adapter`: Dogpile presets only. No filesystem authority here.
- `apps/factory-cli`: operator surface and composition smoke path.

## Development Rules

- Keep packages domain-first. Avoid generic `utils`, `agents`, or catch-all factory packages.
- Stage contracts should pass durable data forward; do not let later stages reach into private state from earlier stages.
- Side effects belong behind `repo`, `execution`, or caller-owned tool adapters, not in planning or review contracts.
- Run `pnpm run verify` before handing work back.
- Run `pnpm run factory` after changing stage composition or package exports.
