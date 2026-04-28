# Phase 9 — Discussion Log

**Mode:** `--power` (offline answer-pass via `09-QUESTIONS.html` / `09-QUESTIONS.json`)
**Date:** 2026-04-28
**Total questions:** 22 / 22 answered (no chat-more notes)

This log is a human-reference audit trail. Downstream agents (researcher, planner, executor) read `09-CONTEXT.md`, not this file.

## Section 1 — CLI Architecture

| Q | Title | Choice | Label |
|---|---|---|---|
| Q-01 | Subcommand router refactor | b | Per-command modules under `apps/factory-cli/src/commands/` |
| Q-02 | Argument parser library | b | `commander` (`@commander-js/extra-typings`) |
| Q-03 | Exit-code taxonomy | b | Curated taxonomy (0..6) |
| Q-04 | stdout vs stderr discipline | a | Strict — stdout = data only |

## Section 2 — Status Command (OP-02, OP-07)

| Q | Title | Choice | Label |
|---|---|---|---|
| Q-05 | Default output mode | b | Human by default, `--json` flag |
| Q-06 | Default N | b | 25 (with `--limit`, `--since`, `--all`) |
| Q-07 | Status row schema | c | Tiered (minimal default + `--full` opt-in) |
| Q-08 | Run discovery | a | Directory scan, sorted by mtime |
| Q-09 | Mid-run / corrupted manifest | b | Compute liveness from journal + sentinel |

## Section 3 — Inspect Command (OP-05, OP-07)

| Q | Title | Choice | Label |
|---|---|---|---|
| Q-10 | Default inspect view | b | Manifest + index of artifact paths |
| Q-11 | Trace inclusion | b | Always reference, never inline |
| Q-12 | Field ordering / canonicalization | a | Sorted keys via `sortJsonValue` |

## Section 4 — Resume Command (OP-03)

| Q | Title | Choice | Label |
|---|---|---|---|
| Q-13 | What stages can resume from? | b | Stage-aware resume |
| Q-14 | Re-execution semantics | a | Replay only orphaned tasks |
| Q-15 | Cancel sentinel on resume | c | Refuse if `manifest.status === 'cancelled'`; auto-unlink otherwise |

## Section 5 — Cancel Command (OP-04)

| Q | Title | Choice | Label |
|---|---|---|---|
| Q-16 | Out-of-process cancel mechanism | c | Sentinel + manifest mark (`cancelling`) |
| Q-17 | Cancel against finished run | b | Refuse with exit code 4 (conflict) |

## Section 6 — Manifest Status & Authority

| Q | Title | Choice | Label |
|---|---|---|---|
| Q-18 | FactoryRunStatus enum extension | d | Add `cancelled` + `cancelling` + `orphaned` |
| Q-19 | runId validation | c | Both: regex + path-confinement |

## Section 7 — Deliver Command (OP-06)

| Q | Title | Choice | Label |
|---|---|---|---|
| Q-20 | When does `deliver <runId>` apply? | c | Both: gated mode + retry idempotency |
| Q-21 | Authority loading for `deliver` | a | Persist `authorization.json`; deliver re-mints via validator |

## Section 8 — Prune Command (OP-08)

| Q | Title | Choice | Label |
|---|---|---|---|
| Q-22 | Prune surface and safety | b | Full subcommand with `--dry-run` default + active-status guard |

## Deferred Ideas (rolled into CONTEXT.md `<deferred_ideas>`)

- `.protostar/runs.jsonl` index — Phase 10 if scan latency surfaces.
- `--from <taskId>` resume escape hatch — Phase 10+.
- Manifest watchdog for `running → orphaned` transition — v1.0.
- `trace` subcommand — Phase 10 / v1.0.
- TUI / `status --watch` — explicitly out per ROADMAP.md Phase 9 notes.
- Cross-host PID-file cancel — out of scope.
- Empirical calibration of `operator.livenessThresholdMs` — Phase 10 dogfood.
- Composite/full inspect view — v1.0.

## Claude's Discretion (no question asked)

- All atomic file writes use the Phase 6 Q-07 tmp+rename pattern (carried forward; not re-asked).
- All canonical-JSON output uses sorted keys (Q-12 explicit).
- All append-only workspace files (`refusals.jsonl`, `evolution/{lineageId}.jsonl`) are off-limits to prune (Phase 8 Q-14 lock; not re-asked).
- v0.1 archetype scope is `cosmetic-tweak` only (project-level constraint; carried forward).
