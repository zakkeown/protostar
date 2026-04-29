# Phase 16: Trace / Dataflow Inspector - Context

**Status:** Stub — to be filled in via `/gsd-discuss-phase 16`

## Phase Boundary

`protostar inspect` should feel closer to a real trace debugger than a directory dump — surface stage inputs/outputs, authority decisions, variable bindings, refusal reasons, and repair-loop history along a single navigable timeline anchored to the run bundle. See ROADMAP.md → Phase 16 for the working goal, depends-on, and tentative success criteria.

## Open Questions (seeds for discuss-phase)

- Timeline model: linear stage list, tree (with repair-loop branches), or DAG (with dataflow edges between artifact producers/consumers)?
- Node addressing: synthetic ids, artifact paths, or content hashes — and which is stable across replays (Phase 13)?
- Surface: terminal-only (TUI), single-file static HTML rendered into the bundle, or both — and where does each live relative to `.protostar/runs/<id>/...`?
- Variable / binding rendering: snapshot at point of consumption, full lineage back to producer, or both views toggleable?
- Authority-decision view: per-gate cards with linked evidence artifacts, or unified envelope-resolution timeline?
- Refusal evidence: inline excerpt with link to artifact, or pure link — and what's the contract with Phase 14 validation reports anchoring on the same nodes?
- Repair-loop diffing: textual diff of changed task results, structural diff (added/removed reviewer comments), or both?
- Read-only enforcement: contract test (no-net + no-fs-write) in inspector workspace, or compile-time via capability injection?
- Replay-with-edit (Phase 13) handoff: does inspector emit the edit target as a structured handoff (run-id + node-id) the replay command consumes, or is replay invoked from inside inspector?
- Bundle compatibility: target only the post-Phase 9 layout, or back-fill an adapter for pre-stabilization bundles produced during Phases 10–12 dogfood?
- Performance ceiling: what's the largest bundle the inspector must open responsively (Phase 11 stress sweep observed 200+ runs/day) — does it need streaming/lazy loading?
