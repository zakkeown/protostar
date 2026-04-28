# Phase 8 — Discussion Log

**Mode:** `--power` (offline question answering)
**Generated:** 2026-04-28
**Source:** `08-QUESTIONS.json` (20/20 answered)

This log is for human reference only (audits, retrospectives) and is NOT consumed by downstream agents.

## Coverage

| Section | Questions | Answered |
|---|---|---|
| Mechanical Eval — Numeric Scores | Q-01..03 | 3/3 |
| Semantic Judge | Q-04..07 | 4/4 |
| Consensus + Harsh Rule | Q-08..10 | 3/3 |
| Stub Removal | Q-11..12 | 2/2 |
| Evolution Snapshots | Q-13..15 | 3/3 |
| Evolution → Next Run + Threshold | Q-16..19 | 4/4 |
| Authority Boundary + Package Shape | Q-20 | 1/1 |
| **Total** | **20** | **20** |

## Decisions Summary

| ID | Topic | Choice | Note |
|---|---|---|---|
| Q-01 | Mechanical score source | (c) Hybrid — scores on ReviewGate, evaluation renumbers | Phase 5 type extension |
| Q-02 | Mechanical aggregation | (b) 4 sub-scores + min-rule | Mirrors EVAL-03 'high min' |
| Q-03 | Stage status mapping | (b) Replace status with verdict + score (breaking) | evaluation-report.json schema bump |
| Q-04 | Semantic stage shape | (b) New `evaluationPilePreset` | Separate from review pile |
| Q-05 | Confidence signal | (a) Inverse variance across judge means | Numeric, composable |
| Q-06 | Rubric dimensions | (b) 5 dims: acMet, codeQuality, security, regressionRisk, releaseReadiness | Fixed across runs |
| Q-07 | Default semantic judge | (a) Qwen3-Next-80B-A3B-MLX-4bit | Per REQUIREMENTS example |
| Q-08 | Consensus judge family | (a) DeepSeek-Coder-V2-Lite | Different family, code-trained |
| Q-09 | Harsh-rule operationalization | (c) Both — per-judge AND per-dimension | Strictest possible |
| Q-10 | Failure surface | (a) Reuse PileFailure + new `EvaluationResult` sourceOfTruth | Extend with `eval-consensus-block` variant |
| Q-11 | `'skipped'` status | (a) Remove entirely | Pass/fail only |
| Q-12 | createEvaluationReport signature | (c) Pre-computed + `shouldRunConsensus` helper | Pure gating logic |
| Q-13 | Snapshot subject | (b) Spec ontology (intent + AC) | Ouroboros spec-first framing |
| Q-14 | Persistence path | (a) Per-run + chain index `.protostar/evolution/{lineageId}.jsonl` | Refusals.jsonl pattern |
| Q-15 | Lineage identity | (b) `--lineage` flag, hash default | Operator override |
| Q-16 | Continue → next run | (a) Prior summary fed into planning mission | Implicit refinement |
| Q-17 | Code evolution opt-in | (c) Both — config default + CLI override | Phase 6 mode pattern |
| Q-18 | Threshold calibration | (b) Config field + Phase 10 calibration script | Operator-tunable from day one |
| Q-19 | Generation source | (c) Auto from disk + `--generation` override | Phase 9 ergonomics |
| Q-20 | Where evaluation reads disk | (c) New `@protostar/evaluation-runner` package | Mirror dogpile-adapter split |

## Deferred Ideas

See `08-CONTEXT.md` `<deferred_ideas>` for the canonical list. Highlights:

- Plan-vs-plan or combined spec+plan ontology comparison — v1.0
- Adaptive judge-panel sizing — already in PROJECT.md Out of Scope
- Empirical calibration of all thresholds — Phase 10 DOG-04
- `pnpm calibrate:convergence` script implementation — Phase 10 deliverable
- Additional rubric dimensions (performance, ergonomics) — v1.0 expansion
- Phase 9 `inspect` lineage view — designed in Phase 9

## Process Notes

- All 20 questions answered offline via the power-mode HTML companion.
- No scope creep — every gray area mapped to an existing requirement (EVAL-01..04, EVOL-01..03).
- All cross-phase locks (Phase 6 Q-03/Q-07/Q-08/Q-09/Q-12/Q-13/Q-14) carried forward without re-asking.
- Six new threshold constants introduced (`T_MECH`, `T_CONF`, four consensus thresholds); all explicitly placeholders pending Phase 10 calibration.
- Two breaking changes: `EvaluationStageResult` shape (Q-03) and `EvaluationStageStatus` enum (Q-11). One additive change to Phase 5 (`ReviewGate.mechanicalScores`, Q-01).
- One new workspace introduced (`@protostar/evaluation-runner`, Q-20).
- One new pile preset introduced (`evaluationPilePreset`, Q-04).
