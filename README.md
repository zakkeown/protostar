# Protostar Factory

Protostar is a dark software factory control plane: once a human confirms intent, the system should plan, execute, review, repair, and prepare a release without additional human intervention unless policy says to stop.

The repo is intentionally scaffolded as a domain-first TypeScript monorepo. Dogpile is used as the bounded multi-agent coordination cell for planning, review, and execution coordination. Protostar owns lifecycle authority, policy, repo access, durable artifacts, and release gates.

## Shape

```txt
apps/
  factory-cli/        # first operator surface and composition smoke path

packages/
  intent/             # draft, ambiguity, acceptance criteria, clarification report, confirmed intent
  planning/           # plan DAG contracts and validation
  execution/          # execution work graph contracts
  review/             # review gate, findings, repair/block/pass verdicts
  evaluation/         # mechanical/semantic/consensus eval and evolution stubs
  delivery/           # post-approval delivery plans such as gh PR creation
  policy/             # admission, archetypes, capability envelope admission, policy artifacts
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

`pnpm run factory` builds the workspace, promotes the sample intent draft at
`examples/intents/scaffold.draft.json`, and writes a local run bundle under
`.protostar/runs/<runId>/`.

Run the CLI directly with a different intent or output directory:

```sh
pnpm run build
pnpm --filter @protostar/factory-cli start -- run \
  --draft examples/intents/scaffold.draft.json \
  --out .protostar/runs \
  --confirmed-intent-output .protostar/confirmed-intent.json \
  --planning-fixture examples/planning-results/scaffold.json
```

Each run bundle currently contains:

- `intent.json`
- `intent-draft.json` for draft inputs
- `clarification-report.json` for draft inputs
- `admission-decision.json` for draft inputs
- `intent-ambiguity.json`
- `intent-archetype-suggestion.json` for draft inputs
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
planning run. Its `output` field is treated only as candidate-plan source data:
it must parse into a candidate `PlanGraph`, then `planning-admission.json` must
allow that candidate before `plan.json` is written for execution. Invalid
dependencies, malformed tasks, authority expansion, or execution-ready/admitted
fields fail before execution and review artifacts are written.

The execution stage is currently a deterministic dry run. It emits task lifecycle
events, enforces dependency ordering, and attaches evidence refs to passed or
failed tasks without modifying repository files. Use `--fail-task-ids` with a
comma-separated list to exercise failure and downstream blocking behavior.

The intent stage uses an Ouroboros-style admission gate. Draft runs are promoted
to immutable `ConfirmedIntent` values only after required fields pass, acceptance
criteria normalize, archetype policy checks run, and ambiguity scores
`<= 0.2`; draft runs also persist a deterministic archetype suggestion with a
confidence score. Draft runs also persist `clarification-report.json`, whose
schema is exported by `@protostar/intent/clarification-report` as
`CLARIFICATION_REPORT_JSON_SCHEMA` and records deterministic questions, required
clarifications, missing fields, and unresolved question entries. Draft runs
persist `admission-decision.json`, whose payload is exported by
`@protostar/policy/artifacts` as `AdmissionDecisionArtifactPayload`;
its `decision` is exactly one of `allow`, `block`, or `escalate` and its required
details include ambiguity evidence, required-field and required-dimension
checklists, missing-field detections, hard-zero reasons, clarification questions,
policy findings, archetype suggestion, and failure details when no
`ConfirmedIntent` was created. Promoted draft runs preserve the admitted
`sourceDraftId`, `mode`, `goalArchetype`, `context`, and `stopConditions` on the
confirmed intent artifact. Use `--intent-mode greenfield` to switch to the
greenfield weights. Already-confirmed fixtures can still be passed with
`--intent`. Use `--confirmed-intent-output` to write the admitted intent to an
explicit `confirmed-intent.json` or `intent.json` path; failed draft hardening
does not create that file.

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
