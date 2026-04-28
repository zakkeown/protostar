---
phase: 08-evaluation-evolution
verified: 2026-04-28T18:45:00Z
status: verified
verdict: PASS
score: 7/7 Phase 8 requirements verified
overrides_applied: 0
gaps: []
scope_clarifications:
  - "EVOL-03 is complete for Phase 8 as calibration evidence capture plus configurable thresholds. The >=10-run empirical calibration is formally owned by Phase 10 DOG-04 per REQUIREMENTS.md, ROADMAP.md, and 08-DISCUSSION-LOG.md."
human_verification:
  - test: "Live heterogeneous-local evaluation smoke"
    expected: "With LM Studio configured for semantic and consensus judge models, a real run invokes Qwen semantic judging and a different-family consensus judge when confidence is below threshold."
    why_human: "Automated tests use mocked/fake pile outputs; live local model availability and model-family diversity cannot be proven by static code inspection."
security_follow_up_missing: false
---

# Phase 8: Evaluation + Evolution Verification Report

**Phase Goal:** Three-stage evaluation (mechanical -> semantic -> consensus) with heterogeneous-local judges; evolution decides continue/converged/exhausted from cross-run ontology snapshots; specs/plans evolve before code.
**Verdict:** PASS
**Verified:** 2026-04-28T18:45:00Z
**Mode:** Goal-backward verification plus post-review/security refresh.

## Goal Achievement

Phase 8 is achieved. The evaluation pipeline, no-skipped report contract, evolution snapshot/chain plumbing, planning-prior feedback loop, structured refusal paths, release-blocking behavior, and security posture are implemented and tested. EVOL-03 is verified under the clarified phase contract: Phase 8 records calibration evidence and exposes configurable thresholds; Phase 10 DOG-04 owns the >=10-run empirical threshold tuning.

## Requirements

| Requirement | Verdict | Evidence |
| --- | --- | --- |
| EVAL-01 Mechanical numeric scores | PASS | `packages/evaluation/src/compute-mechanical-scores.ts:19` computes build/lint/diffSize/acCoverage numeric scores and min-score verdict; `packages/mechanical-checks/src/findings.ts:100` produces the same four-field score payload from command/diff/AC evidence; `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts:130` threads `mechanicalScores` into evidence. |
| EVAL-02 Semantic eval judge | PASS with live-smoke risk | `packages/dogpile-adapter/src/index.ts:150` defines `evaluationPilePreset` with Qwen model; `packages/dogpile-adapter/src/evaluation-mission.ts:43` builds rubric-scored model JSON mission; `packages/evaluation-runner/src/run-evaluation-stages.ts:86` invokes the evaluation pile and `:128` builds semantic numeric scores/confidence. |
| EVAL-03 Consensus eval harsher rule | PASS with live-smoke risk | `packages/evaluation-runner/src/run-evaluation-stages.ts:129` gates consensus on confidence, `:139` appends the consensus agent, and `:180` calls `evaluateConsensus`; `packages/evaluation/src/evaluate-consensus.ts:31` enforces mean/min judges plus mean/min dimensions and records `thresholdsHit`; default consensus model is DeepSeek at `packages/dogpile-adapter/src/index.ts:169`. |
| EVAL-04 No skipped stubs | PASS | `packages/evaluation/src/index.ts:9` restricts stage status to `pass | fail`; `packages/evaluation/src/create-evaluation-report.ts:18` assembles real scored stages; `packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts` statically and runtime-checks absence of `"skipped"` verdicts. |
| EVOL-01 Reads previous snapshot and decides | PASS | `packages/evaluation-runner/src/run-evaluation-stages.ts:336` reads prior snapshot via injected `snapshotReader`; `packages/evaluation/src/index.ts:171` implements `decideEvolution`; `apps/factory-cli/src/evolution-chain-index.ts:32` reads latest chain entry. |
| EVOL-02 Spec/plan refinement before code; code opt-in | PASS | `apps/factory-cli/src/main.ts:451` builds prior-generation summary, `:513` passes it into planning mission, and code hints are gated by `resolveCodeEvolutionMode`; `packages/dogpile-adapter/src/index.ts:195` includes previous generation summary and only includes `Prior diff` when enabled. |
| EVOL-03 Calibration evidence and configurable thresholds | PASS | `apps/factory-cli/src/calibration-log.ts:16` appends calibration observations; factory config and CLI wiring make evaluation/evolution thresholds operator-tunable; `packages/admission-e2e/src/calibration-log-append.contract.test.ts` pins JSONL append shape. `08-DISCUSSION-LOG.md`, `REQUIREMENTS.md`, and `ROADMAP.md` formally assign >=10-run empirical calibration to Phase 10 DOG-04. |

## Acceptance Criteria

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| `status: "skipped"` stubs gone; semantic + consensus produce numeric scores | PASS | No `"skipped"` verdict in `packages/evaluation/src`; report stages carry `verdict`, `score`, optional `scores`; no-skipped contract passed. |
| Two-judge panel with different model families; harsher-than-baseline rule documented/enforced | PASS with live-smoke risk | Semantic default Qwen and consensus default DeepSeek are separate model families in code; consensus uses all four harsh thresholds. Needs live LM Studio smoke to prove configured local models are available. |
| `decideEvolution` reads previous snapshot from disk; generation can advance past 0 | PASS | Factory CLI reads `.protostar/evolution/{lineage}.jsonl`, computes next generation, reads snapshot path, and writes next snapshot/chain entry. Tests cover generation advance and convergence/exhaustion. |
| Convergence calibration evidence captured for empirical tuning | PASS | Phase 8 writes calibration JSONL observations and documents the DOG-04 empirical tuning handoff; the phase no longer claims to complete the >=10-run dogfood analysis before dogfood exists. |

## Artifact/Wiring Evidence

| Artifact | Status | Details |
| --- | --- | --- |
| `packages/evaluation/src/*` | VERIFIED | Numeric types, mechanical/semantic confidence, consensus, report assembler, ontology snapshot, lineage hash, and decision helpers exist with package tests. |
| `packages/evaluation-runner/src/run-evaluation-stages.ts` | VERIFIED | Orchestrates mechanical -> semantic -> optional consensus, returns refusal on pile/schema/consensus failures, reads prior snapshot through injected reader. |
| `packages/dogpile-adapter/src/evaluation-mission.ts` | VERIFIED | Builds model-visible evaluation mission with rubric, ACs, admitted plan, diff files, and execution evidence. |
| `apps/factory-cli/src/main.ts` | VERIFIED | Calls `runEvaluationStages`, blocks on evaluation failures before delivery, writes evaluation report, snapshot, chain, and calibration records on pass. |
| `packages/admission-e2e/src/*evaluation*.test.ts` | VERIFIED | Cross-package contracts cover no-skipped, refusal symmetry, no-fs defense, prior mission summary, and calibration log append. |
| `.planning/phases/08-evaluation-evolution/08-SECURITY.md` | VERIFIED | Security audit reports SECURED, 29/29 threats closed, including evaluation-runner no-fs, dogpile-adapter no-fs/no-path, structured refusals, no skipped verdicts, and release blocking on failed evaluations. |

## Review/Test Evidence

| Check | Result |
| --- | --- |
| `08-REVIEW.md` | Clean review, 0 findings, 6 files reviewed. Review specifically confirms evaluation failure blocks before snapshot/chain/calibration/delivery. |
| `08-SECURITY.md` | SECURED, 29/29 threats closed, no unregistered flags. |
| `pnpm --filter @protostar/evaluation test` | PASS, 65 tests. |
| `pnpm --filter @protostar/evaluation-runner test` | PASS, 14 tests. |
| `pnpm --filter @protostar/dogpile-adapter test` | PASS, 47 tests. |
| `pnpm --filter @protostar/admission-e2e test --run ...Phase 8 contracts...` | PASS overall admission-e2e run, 103 tests. |
| `pnpm run verify` | PASS on rerun after the initial verifier-local transient. Typecheck passed; repair 22, evaluation-runner 14, intent 141, delivery-runtime 86, and factory-cli 214 tests passed. |

## Residual Risks

- Live local-model behavior is not proven by the automated tests; semantic and consensus tests use mocked pile outputs.
- No explicit enforcement prevents an operator from configuring semantic and consensus to the same model family, though defaults are heterogeneous.
- DOG-04 must consume the Phase 8 calibration log across >=10 dogfood runs before v1 claims empirical threshold tuning.

## Security Follow-Up

Security verification is complete in `.planning/phases/08-evaluation-evolution/08-SECURITY.md`: SECURED, 29/29 threats closed, no unregistered flags.

## Gaps Summary

No Phase 8 blocking gaps remain. The empirical calibration work is explicitly carried by Phase 10 DOG-04, where the required dogfood run population exists.

---

_Verified: 2026-04-28T18:45:00Z_
_Verifier: Codex + gsd-verifier + gsd-security-auditor_
