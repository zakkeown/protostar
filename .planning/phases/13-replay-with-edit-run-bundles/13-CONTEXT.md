# Phase 13: Replay-with-Edit for Run Bundles - Context

**Status:** Stub — to be filled in via `/gsd-discuss-phase 13`

## Phase Boundary

Take a recorded Protostar run bundle (under `.protostar/runs/<run-id>/`), let an operator edit a single recorded artifact (e.g. a judge verdict, reviewer comment, task result, or LLM completion), and replay the run deterministically from that point forward — reusing every prior recorded artifact unchanged.

This is a debugging/forensics tool: it lets us isolate "would the run have succeeded if the judge had returned X?" without re-running upstream stages, and pin regressions to a specific stage's output by mutating it in isolation.

## Why now

- v1 dogfood (Phase 10) and headless stress (Phase 11) both produce failed runs whose post-mortem currently requires reading raw bundle JSON and re-reasoning by hand.
- Phase 5 (review→repair loop) and Phase 8 (evaluation/evolution) both depend on judge/reviewer behaviour we cannot currently A/B test against a fixed prefix.
- Run bundles are already content-addressed and append-only (Phase 9 OP-08 prune work confirmed the layout) — replay-with-edit is the next leverage point on that substrate.

## Open questions (to resolve in CONTEXT/SEED)

- What's the edit surface? Single artifact swap, or multi-artifact patch set?
- Determinism contract: do we re-run downstream LLM calls, or replay them too unless the edit invalidates the cache key?
- UX: CLI-only (`factory-cli replay --run <id> --edit <artifact>=<file>`), or also a TUI/operator-surface entry?
- Schema: do edits land as a sibling `replay-bundle/` next to the original, or as an overlay manifest?
- How does this interact with Phase 12's authority boundary — replay must not re-enter delivery (no PRs from a replayed run by default).
- Eval integration: should replay-with-edit feed Phase 8 evolution as a counterfactual signal?

## Requirements

*(to be derived; tentative theme: REPLAY-01..REPLAY-N covering bundle addressing, edit surface, determinism contract, downstream replay scope, CLI ergonomics, authority-boundary behaviour, eval integration)*
