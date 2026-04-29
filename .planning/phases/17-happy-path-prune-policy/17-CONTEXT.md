# Phase 17: Happy-Path Prune Policy - Context

**Status:** Stub — to be filled in via `/gsd-discuss-phase 17`

## Phase Boundary

Absorb the operational rule *"delete on happy path, preserve failed runs, sweep old dirs"* into Protostar's prune direction. Make `.protostar/runs/` self-maintaining: successful runs that have produced their evidence bundle (and, where applicable, a delivered PR) are reaped automatically; failed / blocked / refused / cancelled / orphaned runs are retained for forensic replay; and stale directories beyond a configured horizon are swept regardless of verdict. See ROADMAP.md → Phase 17 for the working goal, depends-on, and tentative success criteria.

## Open Questions (seeds for discuss-phase)

- Happy-path predicate: `verdict == pr-ready` only, or `pr-ready AND delivered`? Where does `accepted-no-delivery` land?
- Preservation predicate: enumerate the protected `FactoryRunStatus` values, or invert (delete only if status ∈ {pr-ready}) so new statuses default to *preserve*?
- Sweep horizon default: 7d / 14d / 30d? Per-archetype override, or single global value?
- Active-guard composition: reuse Phase 9 OP-08 active-guard verbatim, or extend with `cancelling` / `repairing` / `ready-to-release` defense-in-depth?
- Trigger model: explicit `protostar-factory prune --happy-path` only, post-run hook, idle-trigger daemon, or all three?
- Audit log shape: JSONL alongside `.protostar/runs/`, or per-decision entries inside each preserved bundle? Schema versioned via `@protostar/artifacts`?
- Dry-run parity: does `--dry-run` exist on the auto-trigger path, or only on the explicit CLI?
- Replay (Phase 13) + Inspect (Phase 16) composition: contract test that a preserved failed run remains content-hash-addressable across a happy-path prune cycle — fixture lives where?
- Authority boundary: prune policy in `apps/factory-cli`, prune writes in `@protostar/repo` — confirm split, or lift policy into a pure-tier `@protostar/prune-policy` package?
- Migration: existing `.protostar/runs/` directories on operator machines — one-shot reconciliation pass, or let the next prune handle them?
- Eval integration: do reaped happy-path runs still contribute to Phase 8 calibration JSONL before deletion, or is calibration data extracted to a separate retained artifact?
