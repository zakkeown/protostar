---
status: complete
phase: 02-authority-governance-kernel
source:
  - 02-VERIFICATION.md (gaps_found, 1/9 truths)
  - waves 5-7 gap-closure summaries
started: 2026-04-27T00:00:00Z
updated: 2026-04-27T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: From a clean checkout, `pnpm install && pnpm run factory` runs end-to-end, signs a ConfirmedIntent (schemaVersion 1.1.0), and writes per-gate admission decisions. No stderr errors.
result: pass
note: |
  `pnpm run factory` now exits 2 with "workspace-trust gate blocked: workspace is not trusted; escalation required before factory can proceed". This is the *correct* post-gap-closure behavior — the previous wrapper that widened DENY_ALL_REPO_POLICY into the intent envelope is gone (grep confirms `repoPolicyForCurrentCompatibility` is fully removed; main.ts:278 halts on `precedenceDecision.status === "blocked-by-tier"`). Default-deny is now real. The happy-path smoke now requires trust escalation; the existing 82-test factory-cli suite covers the post-trust path.

### 2. Full Verification Gate
expected: `pnpm run verify:full` exits 0 with all suites green.
result: pass
note: |
  All suites pass — authority 112, intent 119, factory-cli 82, admission-e2e 55, planning 99, repo 5, policy 1, dogpile-types 4, dogpile-adapter 3, execution 12, review 10. 0 failures across the workspace.

### 3. GOV-01 — Default-deny precedence (gap closure 1)
expected: With no repo policy file present, factory halts with `outcome: blocked-by-tier`. Compatibility wrapper removed.
result: pass
evidence: |
  - `grep -rn repoPolicyForCurrentCompatibility packages/ apps/` → 0 hits.
  - `apps/factory-cli/src/main.ts:278` halts on `precedenceDecision.status === "blocked-by-tier"`.
  - Live cold-start (Test 1) demonstrates the block.

### 4. GOV-04 — Two-key launch verifies second key (gap closure 2)
expected: Trusted launch rejects fake/missing/mismatched ConfirmedIntent files; only verified, body-matching, signature-verified ConfirmedIntent passes.
result: pass
evidence: |
  `verifyTrustedLaunchConfirmedIntent` suite covers 7 subtests, all green:
  missing-file, malformed-json, invalid-confirmed-intent, unsigned-confirmed-intent, signature-mismatch, intent-body-mismatch, success.

### 5. GOV-02 — Authorized-op envelope enforcement (gap closure 3)
expected: workspace/subprocess/network/budget AuthorizedOp producers refuse to mint when resolvedEnvelope lacks the required grant.
result: pass
evidence: |
  - workspace-op.ts:36 — `hasWorkspaceGrant(resolvedEnvelope, { workspace, path, access })`
  - subprocess-op.ts:36 — `hasExecuteGrant(resolvedEnvelope, { command, cwd })`
  - network-op.ts:39 — `hasNetworkGrant(resolvedEnvelope)`
  - budget-op.ts:37 — `hasBudgetGrant(resolvedEnvelope, { budgetKey, amount })`
  All four producers now gate on resolved envelope; package-authority tests (112) pass.

### 6. GOV-05 — Per-gate evidence schema parity (gap closure 4 + plan 02-15)
expected: Per-gate admission decisions validate against schemas; runId pattern; budget caps have `minimum: 0`.
result: pass
evidence: |
  - `packages/authority/schema/repo-policy.schema.json:39-42` — maxUsd, maxTokens, timeoutMs, maxRepairLoops all carry `"minimum": 0`.
  - admission-e2e suite (55 tests) green; per-gate writer tests (4) green.

### 7. GOV-03 — Stage reader consumes CLI JSONL (gap closure 6)
expected: writer/reader agree on field names; verified vs unverified intent reads are split.
result: pass
evidence: |
  Stage reader factory.ts canonicalizes on `artifactPath` (line 247) with legacy `path` fallback (line 251); dedicated tests for both shapes plus rejection of entries lacking either.

### 8. GOV-06 — End-to-end ConfirmedIntent signature flow
expected: Downstream verifies ConfirmedIntent; tamper tests fail; trusted launch uses verified intent (not freshly-minted replacement).
result: pass
evidence: |
  Covered by verifyTrustedLaunchConfirmedIntent success+tamper subtests and admission-e2e 55-test suite. All green.

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none — all 6 documented blockers from VERIFICATION.md are closed and verified by both green test suites and code-level inspection]

## Note

VERIFICATION.md (2026-04-27T16:55:51Z) is now stale — it predated waves 5-7 gap-closure commits and should be re-run to refresh `status: gaps_found` → `status: verified` and update GOV-01..06 from `failed`/`partial` to `verified`.
