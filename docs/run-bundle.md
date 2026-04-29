# Run Bundle

A Protostar run bundle is the durable evidence trail for one factory invocation. The bundle is written under `.protostar/runs/<runId>/` and is meant to answer three questions: what was authorized, what changed, and why the run did or did not reach delivery.

`manifest.json` is the index. It records the run id, intent id, terminal status, stage statuses, and artifact references. Operator commands such as `status`, `inspect`, `resume`, and `deliver` use it as the first durable state boundary.

`intent.json` is the admitted confirmed intent. For draft launches, the bundle may also contain `intent-draft.json`, `clarification-report.json`, `intent-ambiguity.json`, `intent-archetype-suggestion.json`, and gate-specific admission decision artifacts. These files explain why a draft became executable or why it stopped.

`plan.json` is the admitted plan. It is written only after candidate planning output passes the planning admission boundary. Invalid dependencies, authority expansion, missing acceptance-criteria coverage, and malformed task shapes stop before this artifact is treated as executable.

`execution-plan.json` is the execution view derived from the admitted plan. `execution-events.json`, task journal files, snapshots, and `execution-evidence/*.json` then explain how each task moved through pending, running, passed, failed, blocked, or cancelled states.

`review-gate.json` is the release gate. It captures the mechanical and model review verdicts that decide whether a run can be repaired, blocked, or prepared for delivery. Repair iterations live under `review/iter-<N>/`, with `mechanical-result.json`, `model-result.json`, and `repair-plan.json` when present.

`evolution/snapshot.json` and `.protostar/evolution/<lineageId>.jsonl` preserve the evaluation and convergence trail. They let later generations compare ontology snapshots and decide whether to continue, converge, or exhaust.

`piles/<kind>/iter-<N>/` stores bounded Dogpile coordination artifacts. Planning, review, and execution-coordination piles each write structured `result.json`, `trace.json`, or `refusal.json` files so live model variability remains inspectable and replayable.

Delivery artifacts live under `delivery/`. `delivery-result.json` records PR URL, head SHA, CI snapshots, CI verdict, and non-blocking evidence-comment failures when they occur. `ci-events.jsonl` is append-only so polling history is preserved.

For machine-readable JSON Schema, see [run-bundle.appendix.md](./run-bundle.appendix.md).
