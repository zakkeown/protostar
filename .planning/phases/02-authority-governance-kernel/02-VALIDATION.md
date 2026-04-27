---
phase: 2
slug: authority-governance-kernel
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-27
updated: 2026-04-27 (revision iteration 2 — populated per BLOCKER 1)
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in, ESM, Node 22) |
| **Config file** | none — per-package `tsconfig.json` + workspace `package.json` test scripts |
| **Quick run command** | `pnpm run verify` (fast, scoped) |
| **Full suite command** | `pnpm run verify:full` (recursive, all 9+ workspaces) |
| **Estimated runtime** | ~30s quick / ~90s full |

---

## Sampling Rate

- **After every task commit:** Run `pnpm run verify`
- **After every plan wave:** Run `pnpm run verify:full`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~90s

---

## Per-Task Verification Map

> 20 tasks across 11 plans. Each row maps a task to its automated verify command and the requirement/threat it samples. File-exists column reflects whether the test file is created in this task (or by a Wave 0 dependency).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 01 | 0 | GOV-01, GOV-02, GOV-03, GOV-05 | — | `@protostar/authority` workspace skeleton compiles + tests run | unit | `pnpm --filter @protostar/authority test` | ✅ (test scaffold created in this task) | ⬜ pending |
| 02-01-T2 | 01 | 0 | GOV-01, GOV-03, GOV-05 | — | 5 authority-owned schemas exist + are valid JSON Schema 2020-12 | unit | `pnpm --filter @protostar/authority test` | ✅ | ⬜ pending |
| 02-02-T1 | 02 | 1 | GOV-02 | T-2-2, T-2-5 | 4 AuthorizedOp brands minted only via authorize*Op producers; workspace-trust check rejects untrusted writes | unit | `pnpm --filter @protostar/authority test` | ✅ (created in this task) | ⬜ pending |
| 02-02-T2 | 02 | 1 | GOV-02 | T-2-2 | Brand witnesses + test-builders ship under internal/* (Plan 01 stub-then-fill); budget tracker/aggregator interfaces compile | unit | `pnpm --filter @protostar/authority test` | ✅ | ⬜ pending |
| 02-03-T1 | 03 | 1 | GOV-06 | T-2-7, T-2-6 | SignatureEnvelope carries canonicalForm; schemaVersion HARD-BUMPED to 1.1.0; Phase 1 inline-literal tests migrated; 1.0.0 fails parse | unit + contract | `pnpm --filter @protostar/intent test && pnpm --filter @protostar/admission-e2e test` | ✅ | ⬜ pending |
| 02-04-T1 | 04 | 2 | GOV-01 | T-2-3, T-2-4 | intersectEnvelopes returns branded PrecedenceDecision; multi-tier denials enumerate every contributing tier (Q-02) | unit | `pnpm --filter @protostar/authority test` | ✅ (created in this task) | ⬜ pending |
| 02-04-T2 | 04 | 2 | GOV-01 | T-2-3 | parseRepoPolicy validates input; DENY_ALL_REPO_POLICY default-DENY produces blocked-by-tier under intersection (A3) | unit | `pnpm --filter @protostar/authority test` | ✅ | ⬜ pending |
| 02-05-T1 | 05 | 2 | GOV-06 | T-2-7 | json-c14n@1.0 canonicalizer fail-closes on NaN/Infinity/-0/undefined/BigInt/Symbol/Date/RegExp/Map/Set; tag registry rejects unknown forms | unit | `pnpm --filter @protostar/authority test` | ✅ (created in this task) | ⬜ pending |
| 02-05-T2 | 05 | 2 | GOV-06 | T-2-1, T-2-7 | verifyConfirmedIntentSignature is single helper (Q-17); detects mutated intent / envelope / policySnapshot / unknown canonicalForm / wrong algorithm | unit + contract | `pnpm --filter @protostar/authority test` | ✅ | ⬜ pending |
| 02-06a-T1 | 06a | 2 | GOV-03, GOV-05 | T-2-4, T-2-6 | AdmissionDecisionBase + GateName (5 gates) + outcome re-exported from @protostar/intent (single source of truth) | unit | `pnpm --filter @protostar/authority test` | ✅ | ⬜ pending |
| 02-06a-T2 | 06a | 2 | GOV-03 | T-2-1, T-2-4 | SignedAdmissionDecision (6th brand) round-trips; mutation detected; mint NOT on public surface | unit + contract | `pnpm --filter @protostar/authority test` | ✅ | ⬜ pending |
| 02-06b-T1 | 06b | 2 | GOV-03, GOV-05 | T-2-6 | 5 per-gate evidence schemas exist with additionalProperties:false; existing intent schema renamed via git mv; old export entry removed | integration | `pnpm --filter @protostar/intent test && pnpm --filter @protostar/planning test && pnpm --filter @protostar/repo test && pnpm run verify:full` | ✅ | ⬜ pending |
| 02-07-T1 | 07 | 3 | GOV-01, GOV-05 | T-2-3, T-2-6 | admission-decisions.jsonl index writer + per-gate writer + repo-policy loader (DENY_ALL fallback when absent) | unit | `pnpm --filter @protostar/factory-cli test` | ✅ | ⬜ pending |
| 02-07-T2 | 07 | 3 | GOV-01, GOV-05 | T-2-1, T-2-3 | runFactory wires precedence + per-gate triple-write + signed intent (promoteAndSignIntent per Correction 6) + policy-snapshot.json | integration | `pnpm --filter @protostar/factory-cli test && pnpm run verify:full` | ✅ | ⬜ pending |
| 02-08-T1 | 08 | 3 | GOV-04 | T-2-5 | --trust trusted requires --confirmed-intent (two-key launch refusal at CLI arg parse, before runFactory) | unit | `pnpm --filter @protostar/factory-cli test` | ✅ | ⬜ pending |
| 02-08-T2 | 08 | 3 | GOV-04 | T-2-5, T-2-4 | escalation-marker.json written on escalate verdict; hardcoded `trust: "trusted"` at main.ts:335 removed (grep regression) | integration | `pnpm --filter @protostar/factory-cli test && pnpm run verify:full` | ✅ | ⬜ pending |
| 02-09-T1 | 09 | 4 | GOV-03 | T-2-1, T-2-6 | createAuthorityStageReader with FsAdapter; legacy filename fallback (intent → admission-decision.json); calls verifyConfirmedIntentSignature (Q-17) | unit + contract | `pnpm --filter @protostar/authority test` | ✅ | ⬜ pending |
| 02-09-T2 | 09 | 4 | GOV-04 | T-2-5 | assertTrustedWorkspaceForGrant predicate + packages/repo runtime trust check (defense in depth — admission AND execution) | unit + integration | `pnpm --filter @protostar/authority test && pnpm --filter @protostar/repo test && pnpm --filter @protostar/intent test` | ✅ | ⬜ pending |
| 02-10-T1 | 10 | 4 | GOV-02, GOV-03 | T-2-2, T-2-1 | 6 per-brand contract tests pin sole-public-producer pattern; authority-no-fs grep regression | contract | `pnpm --filter @protostar/admission-e2e test` | ✅ | ⬜ pending |
| 02-10-T2 | 10 | 4 | GOV-06 | T-2-1, T-2-7 | end-to-end signed-intent verifier round-trip + tamper-detection across full Phase 2 pipeline | integration (e2e) | `pnpm --filter @protostar/admission-e2e test && pnpm run verify:full` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Total: 20 tasks across 11 plans.**

---

## Wave 0 Requirements

- [x] `packages/authority/` workspace skeleton (package.json, tsconfig.json, src/index.ts pre-populated barrel, test scaffold) — Plan 01 Task 1
- [x] `packages/authority/test/` — `node:test` smoke test wired — Plan 01 Task 1
- [x] Stub source files for 6 brands pre-populated by Plan 01 Task 1 (Correction 1 stub-then-fill: `authorized-ops/{workspace,subprocess,network,budget}-op.ts`, `precedence/precedence-decision.ts`, `admission-decision/signed-admission-decision.ts` with placeholder `export type FooBrandWitness = unknown;`)
- [x] Stub barrels pre-populated by Plan 01 Task 1: `authorized-ops/index.ts`, `precedence/index.ts`, `repo-policy/index.ts`, `signature/index.ts`, `admission-decision/index.ts`, `stage-reader/index.ts`, `workspace-trust/index.ts`, `budget/index.ts` (each `export {};`)
- [x] `internal/brand-witness.ts` and `internal/test-builders.ts` pre-populated by Plan 01 Task 1 with forward-reference re-exports
- [x] 5 authority-owned schema files: `repo-policy.schema.json`, `admission-decision-base.schema.json`, `precedence-decision.schema.json`, `policy-snapshot.schema.json`, `escalation-marker.schema.json` — Plan 01 Task 2
- [x] `packages/admission-e2e/test/` — contract test files for the 6 new brands (created in Plan 10 Task 1; until then, contract tests are MISSING — Plan 10 IS the gap-closing wave 4 work)

*Existing `pnpm run verify:full` infrastructure (from Phase 1 Plan 01) covers test discovery once new workspaces are wired into the root package.json.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two-key launch UX (`--trust trusted` requires `--confirmed-intent`) | GOV-04 | CLI ergonomics + error message clarity | Invoke `pnpm factory --trust trusted` without `--confirmed-intent`; assert refusal artifact + non-zero exit; assert error message names the missing flag |
| `escalate` verdict marker artifact readability | GOV-04 (Q-12) | Operators read this in Phase 9; format must be human-scannable | Trigger an escalate-producing condition in a test fixture; manually inspect `runs/{id}/escalation-marker.json` for clarity |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (stub-then-fill via Plan 01 per Correction 1)
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] `wave_0_complete: true` set in frontmatter

**Approval:** ✅ approved (revision iteration 2, 2026-04-27)
</content>
</invoke>
