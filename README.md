# Protostar Factory

Protostar is a dark software factory control plane: once a human confirms intent, the system should plan, execute, review, repair, and prepare a release without additional human intervention unless policy says to stop.

The repo is intentionally scaffolded as a domain-first TypeScript monorepo. Dogpile is used as the bounded multi-agent coordination cell for planning, review, and execution coordination. Protostar owns lifecycle authority, policy, repo access, durable artifacts, and release gates.

## Shape

```txt
apps/
  factory-cli/        # first operator surface and composition smoke path

packages/
  intent/             # confirmed intent, acceptance criteria, capability envelope
  planning/           # plan DAG contracts and validation
  execution/          # execution work graph contracts
  review/             # review gate, findings, repair/block/pass verdicts
  policy/             # autonomy policy and human-confirmation boundary
  artifacts/          # run manifest, stage records, trace/artifact refs
  repo/               # workspace/repository boundary contracts
  dogpile-adapter/    # factory pile presets over @dogpile/sdk
```

## Factory Spine

```txt
ConfirmedIntent
  -> PlanningPile
  -> PlanGraph
  -> ExecutionRunPlan
  -> ReviewPile
  -> ReviewGate
  -> ReleaseGate
```

The control plane is deterministic where authority matters. Piles are used where multiple model perspectives are useful over a bounded artifact.

## Local Commands

```sh
pnpm install
pnpm run typecheck
pnpm run factory
```

`@protostar/dogpile-adapter` links to the sibling Dogpile checkout at `../dogpile`.
