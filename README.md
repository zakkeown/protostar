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
  evaluation/         # mechanical/semantic/consensus eval and evolution stubs
  delivery/           # post-approval delivery plans such as gh PR creation
  policy/             # autonomy policy and human-confirmation boundary
  artifacts/          # run manifest, stage records, trace/artifact refs
  repo/               # workspace/repository boundary contracts
  dogpile-adapter/    # factory pile presets over @dogpile/sdk
```

## Factory Spine

```txt
ConfirmedIntent
  -> AmbiguityGate
  -> PlanningPile
  -> PlanGraph
  -> ExecutionRunPlan
  -> ReviewGate
  -> RepairExecutionLoop
  -> EvaluationReport
  -> DeliveryPlan
```

The control plane is deterministic where authority matters. Piles are used where multiple model perspectives are useful over a bounded artifact.

## Local Commands

```sh
pnpm install
pnpm run typecheck
pnpm run factory
```

`pnpm run factory` builds the workspace and runs the sample confirmed intent at
`examples/intents/scaffold.json`, writing a local run bundle under
`.protostar/runs/<runId>/`.

Run the CLI directly with a different intent or output directory:

```sh
pnpm run build
pnpm --filter @protostar/factory-cli start -- run \
  --intent examples/intents/scaffold.json \
  --out .protostar/runs \
  --planning-fixture examples/planning-results/scaffold.json
```

Each run bundle currently contains:

- `intent.json`
- `intent-ambiguity.json`
- `manifest.json`
- `planning-mission.txt`
- `planning-result.json`
- `review-mission.txt`
- `plan.json`
- `execution-plan.json`
- `execution-events.json`
- `execution-result.json`
- `review-execution-loop.json`
- `execution-evidence/*.json`
- `review-gate.json`
- `evaluation-report.json`
- `evolution-decision.json`
- `delivery-plan.json`
- `delivery/pr-body.md`

The planning fixture is a deterministic stand-in for a future live Dogpile
planning run. Its `output` field must be JSON that parses into a valid
`PlanGraph`; invalid dependencies or malformed tasks fail before a run bundle is
written.

The execution stage is currently a deterministic dry run. It emits task lifecycle
events, enforces dependency ordering, and attaches evidence refs to passed or
failed tasks without modifying repository files. Use `--fail-task-ids` with a
comma-separated list to exercise failure and downstream blocking behavior.

The intent stage uses an Ouroboros-style ambiguity gate. Brownfield runs are the
default and must score `ambiguity <= 0.2` before planning begins; use
`--intent-mode greenfield` to switch to the greenfield weights.

The review stage is a deterministic mechanical gate inside a review-execute-review
loop. It checks that execution artifacts match the plan, every confirmed
acceptance criterion is covered, and passed work has evidence. Repairable
findings consume `capabilityEnvelope.budget.maxRepairLoops`; a later loop
attempt can approve the run. A passing review moves the manifest to
`ready-to-release`; repair exhaustion moves it to `repairing`; critical
consistency or intent-coverage failures move it to `blocked`.

Evaluation and evolution are stubbed after review. The evaluation report records
the `Mechanical -> Semantic -> Consensus` shape, while the evolution decision
uses an ontology-similarity convergence threshold of `>= 0.95`. Delivery is also
stubbed: after approval, `delivery-plan.json` contains the `gh pr create` command
that should be run to open a PR, but the CLI does not call GitHub yet.

`@protostar/dogpile-adapter` links to the sibling Dogpile checkout at `../dogpile`.
