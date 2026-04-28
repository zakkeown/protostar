---
phase: 08-evaluation-evolution
audited: 2026-04-28T18:20:00Z
asvs_level: 1
block_on: open
verdict: SECURED
threats_total: 29
threats_closed: 29
threats_open: 0
unregistered_flags: 0
---

# Phase 08 Security Verification

## Verdict

SECURED. All 29 declared Phase 8 threats resolve to CLOSED or documented accepted risk. No implementation files were modified during this audit.

ASVS/config note: no `<config>` block with `asvs_level` or `block_on` was present in the Phase 8 plan, summary, or review artifacts. This audit records the default gate as `asvs_level: 1`, `block_on: open`.

## Threat Checklist

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-08-01-01 | Elevation of Privilege | mitigate | CLOSED | `packages/evaluation-runner/src/no-fs.contract.test.ts:25` forbids fs/path imports; `pnpm --filter @protostar/evaluation-runner test` passed. |
| T-08-01-02 | Tampering | accept | CLOSED | Accepted risk: `packages/evaluation-runner/package.json:4` is private and dependencies are workspace-pinned at `packages/evaluation-runner/package.json:19`. |
| T-08-02-01 | Tampering | mitigate | CLOSED | `packages/lmstudio-adapter/src/factory-config.schema.json:6`, `:11`, `:32`, `:37`, `:45`, and `:55` set `additionalProperties: false`. |
| T-08-02-02 | Information Disclosure | accept | CLOSED | Accepted risk: local judge `baseUrl` is operator configuration, not treated as a secret; schema only constrains it as a URI at `packages/lmstudio-adapter/src/factory-config.schema.json:40` and `:48`. |
| T-08-02-03 | Tampering | mitigate | CLOSED | `EvaluationStageStatus` is only `"pass" | "fail"` at `packages/evaluation/src/index.ts:9`; no-skipped contract checks source and runtime artifacts at `packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts:154`. |
| T-08-02-04 | Repudiation | mitigate | CLOSED | `eval-consensus-block` carries `breakdown` and `thresholdsHit` at `packages/dogpile-adapter/src/pile-failure-types.ts:85`. |
| T-08-02-05 | Tampering | mitigate | CLOSED | Legacy degraded overload is gone; real assembler requires mechanical/semantic inputs at `packages/evaluation/src/create-evaluation-report.ts:11` and derives fail/pass from all stage verdicts at `:50`. |
| T-08-03-01 | Tampering | mitigate | CLOSED | `evaluateConsensus` throws on missing rubric dimensions at `packages/evaluation/src/evaluate-consensus.ts:39`. |
| T-08-03-02 | Tampering | mitigate | CLOSED | Lineage uses canonical JSON plus SHA-256 prefix at `packages/evaluation/src/lineage-hash.ts:14`. |
| T-08-03-03 | Repudiation | mitigate | CLOSED | Consensus `breakdown` records judge means, dim means, thresholds, and hits at `packages/evaluation/src/evaluate-consensus.ts:69`. |
| T-08-03-04 | Information Disclosure | accept | CLOSED | Accepted risk: lineage ID truncates SHA-256 to 12 hex chars at `packages/evaluation/src/lineage-hash.ts:15`; acceptable for planned run volume. |
| T-08-04-01 | Tampering | mitigate | CLOSED | Pure score producer maps exit codes/diff/AC coverage deterministically at `packages/mechanical-checks/src/findings.ts:100`. |
| T-08-04-02 | Repudiation | mitigate | CLOSED | Adapter preserves commands, diff, findings, and `mechanicalScores` evidence at `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts:137`. |
| T-08-05-01 | Tampering | mitigate | CLOSED | Parser rejects unknown/missing rubric keys and out-of-range values at `packages/evaluation/src/evaluation-pile-result.ts:38`. |
| T-08-05-02 | Information Disclosure | mitigate | CLOSED | Mission stdout tail is bounded to 2000 chars and keeps the newest output at `packages/dogpile-adapter/src/evaluation-mission.ts:29`. |
| T-08-05-03 | Tampering | mitigate | CLOSED | Dogpile adapter no-fs contract forbids fs/path imports at `packages/dogpile-adapter/src/no-fs.contract.test.ts:30`; targeted dogpile tests passed. |
| T-08-06-01 | Elevation of Privilege | mitigate | CLOSED | Runner takes `snapshotReader` injection at `packages/evaluation-runner/src/run-evaluation-stages.ts:40`; static/runtime no-fs contracts passed. |
| T-08-06-02 | Tampering | mitigate | CLOSED | Report verdict is computed from every stage at `packages/evaluation/src/create-evaluation-report.ts:50`; runner test suite passed. |
| T-08-06-03 | Repudiation | mitigate | CLOSED | Parse failures and empty semantic/consensus outputs become `PileFailure` refusals at `packages/evaluation-runner/src/run-evaluation-stages.ts:103`, `:116`, `:154`, and `:167`. |
| T-08-06-04 | Tampering | accept | CLOSED | Accepted risk: semantic pass rule is documented inline at `packages/evaluation-runner/src/run-evaluation-stages.ts:257`; Phase 10 calibration may revise. |
| T-08-07-01 | Tampering | mitigate | CLOSED | `chainIndexPath` rejects traversal-shaped lineage IDs via regex and `"."`/`".."` checks at `apps/factory-cli/src/evolution-chain-index.ts:18`. |
| T-08-07-02 | Tampering | mitigate | CLOSED | Evolution snapshot uses tmp write, datasync, rename, and best-effort directory sync at `apps/factory-cli/src/evolution-snapshot-writer.ts:21`. |
| T-08-07-03 | Information Disclosure | mitigate | CLOSED | `factory-cli` only includes prior code hints when code evolution is opt-in at `apps/factory-cli/src/main.ts:451`; admission contract asserts disabled-mode omission. |
| T-08-07-04 | Repudiation | mitigate | CLOSED | Eval refusals write `stage: "pile-evaluation"` and `sourceOfTruth: "EvaluationResult"` at `apps/factory-cli/src/main.ts:1503`; refusal index stage type includes `"pile-evaluation"` at `apps/factory-cli/src/refusals-index.ts:14`. |
| T-08-07-05 | Denial of Service | mitigate | CLOSED | `--generation` parsing rejects negative, non-integer, and over-cap values at `apps/factory-cli/src/cli-args.ts:165`. |
| T-08-08-01 | Tampering | mitigate | CLOSED | Static/runtime no-skipped contract at `packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts:157`; targeted admission-e2e tests passed. |
| T-08-08-02 | Elevation of Privilege | mitigate | CLOSED | Runtime fs-proxy sentinel confirms `runEvaluationStages` completes without forbidden fs access at `packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts:101`. |
| T-08-08-03 | Repudiation | mitigate | CLOSED | Evaluation refusal byte-equality contract pins `stage` and `EvaluationResult` source at `packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts:53`. |
| T-08-08-04 | Information Disclosure | mitigate | CLOSED | Prior-summary contract asserts `Prior diff:` is absent when code hints are disabled at `packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts:17`. |

## Authority Boundary Findings

- `@protostar/evaluation-runner` has no fs/path authority in implementation source. Evidence: static contract at `packages/evaluation-runner/src/no-fs.contract.test.ts:25`, runtime contract at `packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts:101`, and injected `snapshotReader` at `packages/evaluation-runner/src/run-evaluation-stages.ts:40`.
- `@protostar/dogpile-adapter` has no fs/path authority in implementation source. Evidence: no-fs contract at `packages/dogpile-adapter/src/no-fs.contract.test.ts:30`; evaluation mission builder is pure and bounded at `packages/dogpile-adapter/src/evaluation-mission.ts:7`.
- `apps/factory-cli` owns Phase 8 persistence: snapshot writes at `apps/factory-cli/src/evolution-snapshot-writer.ts:16`, chain JSONL appends at `apps/factory-cli/src/evolution-chain-index.ts:27`, calibration JSONL appends at `apps/factory-cli/src/calibration-log.ts:16`, and final `evaluation-report.json` persistence at `apps/factory-cli/src/main.ts:1325`.
- Failed evaluation reports block release before evolution snapshot, chain, calibration, delivery, or final manifest writes. Evidence: `apps/factory-cli/src/main.ts:1083`; regression test passed for `apps/factory-cli/src/main.test.ts:322`.

## Threat Flags

No unregistered flags. The summaries with `## Threat Flags` report none for mechanical checks, evaluation pile preset, and evaluation runner. The remaining summaries did not declare additional threat flags.

## Accepted Risks

| Threat ID | Risk | Rationale |
|-----------|------|-----------|
| T-08-01-02 | Workspace dependency tampering | Private package plus workspace-pinned deps are acceptable for this phase; no publication surface. |
| T-08-02-02 | Operator LM Studio base URL visibility | Local base URL is configuration, not a credential; secrets remain in API-key env handling. |
| T-08-03-04 | 12-char lineage hash prefix | Collision risk is acceptable for expected run volume; full input is not intended as a secret. |
| T-08-06-04 | Semantic verdict threshold may need calibration | Rule is explicit and evidence-bearing; Phase 10 can tune without changing authority boundaries. |

## Verification Commands

- `pnpm --filter @protostar/evaluation-runner test` passed: 14/14.
- `pnpm --filter @protostar/dogpile-adapter test --run no-fs evaluation-mission pile-failure-types` passed. The package runner also executed related dogpile tests; 47/47 passed.
- `pnpm --filter @protostar/admission-e2e test --run no-skipped-evaluation evaluation-runner-no-fs eval-refusal-byte-equality planning-mission-prior-summary calibration-log-append` passed. The package runner also executed other admission tests; 103/103 passed.
- `pnpm --filter @protostar/factory-cli test --run main evolution-chain-index evolution-snapshot-writer calibration-log refusals-index load-factory-config` partially failed: the Phase 8 release-blocking test passed, but an unrelated trusted-workspace local-clone test failed with `clone-failed: git clone failed with exit code 128` / `update_ref failed ... nonexistent object`. Treat as non-Phase-8 test environment/repo-state follow-up, not an open Phase 8 threat.

## Residual Risks

- Semantic evaluation remains model-judged. The parser and refusal paths are structured and fail closed, but rubric quality still depends on future calibration.
- The broad factory-cli test command is currently not a clean release signal because of an unrelated local clone failure. Narrow Phase 8 evidence passed.

## Required Follow-ups

- Investigate the unrelated `factory-cli` trusted-workspace local clone failure before using the full `factory-cli --run main ...` selection as a release gate.
- Carry T-08-06-04 into Phase 10 calibration work as planned; do not loosen refusal or no-skipped contracts while tuning semantic thresholds.
