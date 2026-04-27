---
phase: 02-authority-governance-kernel
reviewed: 2026-04-27T16:52:08Z
depth: standard
files_reviewed: 97
findings:
  critical: 5
  warning: 2
  info: 0
  total: 7
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-04-27T16:52:08Z
**Depth:** standard
**Files Reviewed:** 97
**Status:** issues_found

## Summary

Reviewed the supplied Phase 2 authority, admission, trust, signature, schema, CLI, and contract-test changes. I found multiple blockers that invalidate the authority-governance goal: absent repo policy is converted from deny-all to allow, the trusted two-key launch key is not consumed or verified, authorized operation brands can be minted without checking the resolved envelope, generated gate artifacts do not match their schemas, and the stage reader cannot read the CLI-written admission index.

## Critical Issues

### CR-01: [BLOCKER] Missing repo policy is changed from deny-all to allow

**File:** `apps/factory-cli/src/main.ts:919`

**Issue:** `loadRepoPolicy()` correctly returns `DENY_ALL_REPO_POLICY` when `.protostar/repo-policy.json` is absent, but `repoPolicyForCurrentCompatibility()` replaces that deny-all policy with the intent's own envelope and `trustOverride: "trusted"` at lines 924-933. That means an absent repo policy no longer blocks anything; it makes precedence resolve as if repo policy granted exactly what the intent requested. This directly contradicts the documented deny-all default in `packages/authority/src/repo-policy/parse.ts:20-34` and bypasses the repo-policy tier.

**Fix:**
```ts
// Remove repoPolicyForCurrentCompatibility entirely.
repoPolicy,
```

Then fail closed before signing/running when `precedenceDecision.status === "blocked-by-tier"`, writing the precedence decision and a terminal refusal artifact instead of continuing.

### CR-02: [BLOCKER] Trusted two-key launch accepts any path and never verifies the operator intent

**File:** `apps/factory-cli/src/two-key-launch.ts:16`

**Issue:** `validateTwoKeyLaunch()` treats the second key as present when `confirmedIntent` is any non-undefined string. `runFactory()` resolves `options.confirmedIntent` only as a launch flag and never reads, parses, compares, or verifies it before minting a new signed intent from the draft. The test at `apps/factory-cli/src/main.test.ts:125-127` even writes `{ fixture: "operator-confirmed-intent" }` and the trusted launch succeeds. This makes `--trust trusted --confirmed-intent /does/not/matter` equivalent to operator approval.

**Fix:** Read the supplied confirmed intent path during trusted launch, parse it with `parseConfirmedIntent()`, verify its signature against the policy snapshot/resolved envelope, and require it to match the promoted draft body before declaring the workspace trusted. Missing, malformed, unsigned, mismatched, or unverifiable files must produce the existing workspace-trust refusal path.

### CR-03: [BLOCKER] Authorized operation brands are minted without enforcing the resolved capability envelope

**Files:** `packages/authority/src/authorized-ops/workspace-op.ts:27`, `packages/authority/src/authorized-ops/subprocess-op.ts:27`, `packages/authority/src/authorized-ops/network-op.ts:25`, `packages/authority/src/authorized-ops/budget-op.ts:27`

**Issue:** The public minting functions accept a `resolvedEnvelope`, but they do not check that the requested operation is actually granted by it. For example, `authorizeWorkspaceOp()` only checks trust and will mint a write op for `path: "src/example.ts"` even when `resolvedEnvelope.repoScopes` is empty. `authorizeSubprocessOp()` only rejects shell metacharacters, `authorizeNetworkOp()` only checks URL protocol, and `authorizeBudgetOp()` only checks non-negative finite amounts. A caller can therefore obtain branded authority for operations that precedence never granted.

**Fix:** Gate each mint against `resolvedEnvelope`: workspace ops must match a repo scope with sufficient access and path/workspace coverage; subprocess ops must match `executeGrants`; network/tool ops must match an explicit tool/network grant or be modeled separately; budget ops must reject amounts over the relevant budget cap. Add negative tests with empty and mismatched envelopes.

### CR-04: [BLOCKER] CLI per-gate admission artifacts do not conform to their schemas

**Files:** `apps/factory-cli/src/main.ts:792`, `packages/planning/schema/planning-admission-decision.schema.json:23`, `packages/intent/schema/capability-admission-decision.schema.json:23`, `packages/intent/schema/repo-scope-admission-decision.schema.json:23`, `packages/repo/schema/workspace-trust-admission-decision.schema.json:23`

**Issue:** The generated evidence shapes do not match the checked-in schemas. Planning writes `planId`, `admitted`, `admissionStatus`, and `candidateCount`, but the planning schema requires `candidatesConsidered`. Capability writes `admissionStage`, `planId`, `violationCount`, and `admitted`, but the schema requires `requestedEnvelope` and `resolvedEnvelope`. Repo-scope writes `deniedScopes` and `admitted`, but the schema requires `requestedScopes` and `grantedScopes`. Workspace-trust writes `declaredTrust`, `requiredTrust`, and `admitted`, but the schema requires `workspacePath`, `declaredTrust`, and `grantedAccess`. The same schema family also uses `^run-[A-Za-z0-9_-]+$` while the CLI emits `run_...` IDs at `apps/factory-cli/src/main.ts:1288-1291`.

**Fix:** Either change `baseAdmissionDecision()`/`writeSuccessfulGateAdmissionDecisions()` to emit the schema-required fields and run ID format, or update the schemas to reflect the actual artifact contracts. Add schema validation tests that validate every artifact emitted by a successful CLI run.

### CR-05: [BLOCKER] Stage reader cannot read the admission index written by factory-cli

**File:** `packages/authority/src/stage-reader/factory.ts:213`

**Issue:** `validateAdmissionDecisionIndexEntry()` requires each JSONL entry to contain `path`, but `writeAdmissionDecision()` writes `artifactPath` at `apps/factory-cli/src/write-admission-decision.ts:34-40`. The stage-reader test uses `{ gate, path }`, so it misses the real CLI format. Any consumer using `AuthorityStageReader.admissionDecisionsIndex()` on a factory run will throw on the first valid CLI-written line.

**Fix:**
```ts
const artifactPath = parsed["artifactPath"] ?? parsed["path"];
if (typeof artifactPath !== "string") {
  throw new StageReaderError("admission-decisions.jsonl", "artifactPath must be a string", `${path}:${line}`);
}
return { ...parsed, path: artifactPath } as unknown as AdmissionDecisionIndexEntry;
```

Better yet, standardize the field name in both writer and reader and add a CLI-to-stage-reader integration test.

## Warnings

### WR-01: [WARNING] Stage reader brands unverified external intent JSON

**File:** `packages/authority/src/stage-reader/factory.ts:191`

**Issue:** `validateConfirmedIntent()` parses external `intent.json` and casts `result.data as ConfirmedIntent` at line 198 before signature verification. The parser intentionally returns unbranded data, but this API rebrands disk input even when callers only call `confirmedIntent()` and never call `verifyConfirmedIntent()`.

**Fix:** Return `ConfirmedIntentData` from `confirmedIntent()`, or make the branded-returning method verify the signature first and expose unsigned parsed data through a separate method.

### WR-02: [WARNING] Repo policy schema accepts values the parser rejects

**File:** `packages/authority/schema/repo-policy.schema.json:16`

**Issue:** `parseRepoPolicy()` rejects negative budget caps at `packages/authority/src/repo-policy/parse.ts:116-118`, but the JSON schema only says `"type": "number"` for `maxUsd`, `maxTokens`, `timeoutMs`, and `maxRepairLoops`. Schema consumers can accept policy files that the runtime later rejects.

**Fix:** Add `"minimum": 0` to each budget cap schema property and add a schema/parser parity test for negative caps.

---

_Reviewed: 2026-04-27T16:52:08Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
