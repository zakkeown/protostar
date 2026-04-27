---
phase: 02-authority-governance-kernel
verified: 2026-04-27T16:55:51Z
status: gaps_found
score: 1/9 must-haves verified
overrides_applied: 0
requirement_coverage:
  GOV-01: failed
  GOV-02: failed
  GOV-03: failed
  GOV-04: failed
  GOV-05: failed
  GOV-06: partial
automated_checks:
  - command: "pnpm run verify:full"
    result: "reported passed by phase context after Waves 1, 2, 3, and Plans 09/10"
  - command: "pnpm run verify"
    result: "reported passed by phase context"
  - command: "pnpm run factory"
    result: "reported passed and emitted signed ConfirmedIntent schemaVersion 1.1.0"
  - command: "static verification via rg/nl/sed"
    result: "found goal-blocking semantic gaps despite green tests"
gaps:
  - truth: "Precedence is enforced before mutation and absent repo policy remains deny-all"
    status: failed
    reason: "Factory CLI loads DENY_ALL_REPO_POLICY but then replaces it with the intent's requested envelope and trustOverride trusted, so missing repo policy widens instead of denies."
    artifacts:
      - path: "apps/factory-cli/src/main.ts"
        issue: "repoPolicyForCurrentCompatibility rewrites DENY_ALL_REPO_POLICY into intent.capabilityEnvelope plus trustOverride trusted."
    missing:
      - "Remove repoPolicyForCurrentCompatibility or make it fail closed."
      - "If precedenceDecision.status is blocked-by-tier, write evidence and stop before signing/running."
  - truth: "Trusted two-key launch verifies the supplied confirmed intent before trusting the workspace"
    status: failed
    reason: "validateTwoKeyLaunch only checks that --confirmed-intent is a non-undefined string; runFactory does not read, parse, compare, or verify that file before minting a fresh signed intent."
    artifacts:
      - path: "apps/factory-cli/src/two-key-launch.ts"
        issue: "Any path string satisfies the second key."
      - path: "apps/factory-cli/src/main.test.ts"
        issue: "Trusted launch test writes { fixture: 'operator-confirmed-intent' } and expects success."
    missing:
      - "Read --confirmed-intent for trusted launch."
      - "parseConfirmedIntent, verifyConfirmedIntentSignature, and require it to match the promoted draft body/resolved policy snapshot."
      - "Reject missing, malformed, unsigned, mismatched, or unverifiable confirmed-intent files."
  - truth: "Capability envelope is a runtime check for workspace, subprocess, network, and budget authority"
    status: failed
    reason: "AuthorizedOp producers accept resolvedEnvelope but do not verify operations against it; tests prove writes/subprocess/network/budget authorize with an empty envelope."
    artifacts:
      - path: "packages/authority/src/authorized-ops/workspace-op.ts"
        issue: "Checks trust only; does not check repoScopes/path/access."
      - path: "packages/authority/src/authorized-ops/subprocess-op.ts"
        issue: "Checks shell metacharacters only; does not check executeGrants."
      - path: "packages/authority/src/authorized-ops/network-op.ts"
        issue: "Checks URL protocol only; does not check any envelope grant."
      - path: "packages/authority/src/authorized-ops/budget-op.ts"
        issue: "Checks finite/non-negative only; does not check budget caps."
      - path: "packages/authority/src/authorized-ops/authorized-ops.test.ts"
        issue: "Positive tests use resolvedEnvelope with empty repoScopes/toolPermissions/budget and still expect authorization."
    missing:
      - "Gate workspace ops against resolved repoScopes with sufficient access and path/workspace coverage."
      - "Gate subprocess ops against executeGrants."
      - "Define and enforce network/tool grant semantics or defer the network brand with explicit non-runtime status."
      - "Gate budget ops against relevant budget caps."
      - "Add negative tests for empty/mismatched resolvedEnvelope on every AuthorizedOp producer."
  - truth: "A denied workspace capability blocks at the authority boundary"
    status: failed
    reason: "Trust predicates exist, but factory CLI records workspace-trust outcome allow even when declaredTrust is untrusted and evidence.admitted is false; the CLI default-untrusted test exits 0."
    artifacts:
      - path: "apps/factory-cli/src/main.ts"
        issue: "workspace-trust decision is written with outcome allow unconditionally; evidence.admitted is just informational."
      - path: "apps/factory-cli/src/main.test.ts"
        issue: "Default untrusted workspace test expects exitCode 0 and only checks declaredTrust."
    missing:
      - "When workspace access requires trust and trust is untrusted, emit workspace-trust block/escalate and stop before downstream stages."
      - "Wire workspaceTrust into promotion/admission so repo_scope_workspace_trust_refused affects the factory CLI path, not only unit-level intent admission."
  - truth: "Admission decision artifacts for all gates conform to their versioned schemas"
    status: failed
    reason: "CLI-written evidence fields do not match the checked-in per-gate schemas, and run IDs use run_ while schemas require run-."
    artifacts:
      - path: "apps/factory-cli/src/main.ts"
        issue: "Planning writes candidateCount/planId/admitted/admissionStatus; schema requires candidatesConsidered. Capability, repo-scope, and workspace-trust evidence likewise miss required schema fields."
      - path: "packages/planning/schema/planning-admission-decision.schema.json"
        issue: "Requires candidatesConsidered and runId pattern run-."
      - path: "packages/intent/schema/capability-admission-decision.schema.json"
        issue: "Requires requestedEnvelope and resolvedEnvelope."
      - path: "packages/intent/schema/repo-scope-admission-decision.schema.json"
        issue: "Requires requestedScopes and grantedScopes."
      - path: "packages/repo/schema/workspace-trust-admission-decision.schema.json"
        issue: "Requires workspacePath and grantedAccess."
    missing:
      - "Align writer output and schemas."
      - "Add a successful CLI run test that validates every emitted gate artifact against its schema."
      - "Align runId pattern with the factory's run_ IDs or change run ID generation."
  - truth: "Stage reader can consume factory-cli admission-decisions.jsonl"
    status: failed
    reason: "Factory CLI writes artifactPath in JSONL entries, but AuthorityStageReader requires path and throws on valid CLI-written entries."
    artifacts:
      - path: "apps/factory-cli/src/write-admission-decision.ts"
        issue: "Index writer emits artifactPath."
      - path: "packages/authority/src/stage-reader/factory.ts"
        issue: "validateAdmissionDecisionIndexEntry requires path."
      - path: "packages/authority/src/stage-reader/factory.test.ts"
        issue: "Reader test fixture uses path, not the real CLI artifactPath field."
    missing:
      - "Standardize on artifactPath or path across writer, reader, and tests."
      - "Add CLI-to-AuthorityStageReader integration coverage for admissionDecisionsIndex()."
  - truth: "Downstream stages cannot accidentally consume an unverified ConfirmedIntent as branded authority"
    status: failed
    reason: "AuthorityStageReader.confirmedIntent() parses external intent.json and casts it to ConfirmedIntent before signature verification; only verifyConfirmedIntent() verifies the signature."
    artifacts:
      - path: "packages/authority/src/stage-reader/factory.ts"
        issue: "confirmedIntent(): Promise<ConfirmedIntent> returns result.data as ConfirmedIntent without requiring verifyConfirmedIntentSignature first."
    missing:
      - "Return unbranded parsed data from confirmedIntent(), or make the branded method perform signature verification before returning."
      - "Separate readParsedConfirmedIntent from readVerifiedConfirmedIntent to make the unsafe path explicit."
warnings:
  - truth: "Repo policy schema and parser accept the same budget-cap domain"
    status: partial
    reason: "Parser rejects negative budget caps, but repo-policy.schema.json lacks minimum: 0 for budget cap fields."
    artifacts:
      - path: "packages/authority/schema/repo-policy.schema.json"
        issue: "budgetCaps values are only type number."
    missing:
      - "Add minimum: 0 schema constraints and schema/parser parity tests."
deferred: []
human_verification: []
---

# Phase 2: Authority + Governance Kernel Verification Report

**Phase Goal:** Precedence is documented and enforced before any real mutation happens. Capability envelope is a runtime check, not a comment. ConfirmedIntent carries an admission signature that downstream stages verify.
**Verified:** 2026-04-27T16:55:51Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Missing repo policy remains deny-all and precedence cannot widen lower tiers | FAILED | `apps/factory-cli/src/main.ts:271-275` passes `repoPolicyForCurrentCompatibility(...)`; `main.ts:919-933` turns `DENY_ALL_REPO_POLICY` into intent grants plus `trustOverride: "trusted"`. |
| 2 | Capability envelope is enforced by AuthorizedOp producers at runtime | FAILED | `workspace-op.ts:27-36`, `subprocess-op.ts:27-35`, `network-op.ts:25-38`, and `budget-op.ts:27-35` do not check the requested op against `resolvedEnvelope`. Tests at `authorized-ops.test.ts:14-18` use an empty envelope and still expect positive authorization. |
| 3 | Denied workspace capability blocks at authority boundary | FAILED | Trust predicate/runtime exist, but factory CLI writes workspace-trust `outcome: "allow"` even when `declaredTrust` is untrusted and `admitted` is false (`main.ts:841-855`); test expects default untrusted run to exit 0 (`main.test.ts:165-182`). |
| 4 | Admission decisions exist for intent, planning, capability, repo-scope, and workspace-trust gates and conform to schemas | FAILED | Files are written, but evidence shapes and `runId` patterns do not match schemas (`main.ts:792-855` vs schema required fields). |
| 5 | Stage-scoped readers consume durable gate artifacts from factory CLI | FAILED | Writer emits `artifactPath` (`write-admission-decision.ts:34-40`), reader requires `path` (`factory.ts:213-221`). |
| 6 | Trusted two-key launch verifies supplied ConfirmedIntent | FAILED | `validateTwoKeyLaunch` accepts any non-undefined string (`two-key-launch.ts:16-21`), and the trusted-success test writes a dummy object as the confirmed intent (`main.test.ts:125-147`). |
| 7 | ConfirmedIntent tampering is detectable via signature mismatch | VERIFIED | `verifyConfirmedIntentSignature` exists and signed-intent e2e tests exercise happy path plus tampered intent/policy/canonical form in `packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts`. |
| 8 | Downstream read path cannot accidentally brand unverified external intent JSON | FAILED | `AuthorityStageReader.confirmedIntent()` returns `ConfirmedIntent` from parsed disk JSON before signature verification (`factory.ts:85-103`, `factory.ts:191-198`). |
| 9 | Repo policy schema and parser agree on accepted values | FAILED | Parser rejects negative budget caps, but schema only uses `"type": "number"` with no minimum (`repo-policy.schema.json:16-19`). |

**Score:** 1/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/authority` | Pure authority package, no filesystem authority | VERIFIED | Package exists; no `node:fs`/bare `fs` imports found under `packages/authority/src`. |
| `packages/authority/src/precedence/*` | Precedence kernel and default-deny repo policy | PARTIAL | Kernel exists, but factory CLI compatibility wrapper defeats default deny. |
| `packages/authority/src/authorized-ops/*` | Runtime AuthorizedOp brands gated by resolved envelope | FAILED | Brands exist, but producers do not enforce resolved envelope grants. |
| `packages/intent/schema/*-admission-decision.schema.json`, `packages/planning/schema/*`, `packages/repo/schema/*` | Gate schemas match emitted artifacts | FAILED | Schema files exist but do not match factory CLI output. |
| `packages/authority/src/stage-reader/factory.ts` | Stage reader validates and consumes durable gate artifacts | FAILED | Reader cannot parse factory CLI JSONL index and can return branded unverified intent. |
| `apps/factory-cli/src/main.ts` | Composition smoke path writes per-gate decisions and signed intent | PARTIAL | Writes artifacts and signed intent, but does not fail closed on blocked precedence and writes schema-mismatched evidence. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `runFactory` | `intersectEnvelopes` | `buildTierConstraints(...)` | FAILED | Wired, but repo tier is rewritten through `repoPolicyForCurrentCompatibility`, widening missing repo policy. |
| `AuthorizedOp` producers | `resolvedEnvelope` | producer input | FAILED | Parameter exists but is not used for grant checks. |
| `factory-cli` admission writer | per-gate schemas | emitted JSON | FAILED | Output shape conflicts with schemas. |
| `factory-cli` JSONL writer | `AuthorityStageReader.admissionDecisionsIndex()` | `admission-decisions.jsonl` | FAILED | Field name mismatch: `artifactPath` vs `path`. |
| `AuthorityStageReader.verifyConfirmedIntent()` | `verifyConfirmedIntentSignature` | central verifier helper | VERIFIED | Verification helper is called by `verifyConfirmedIntent()`. |
| `AuthorityStageReader.confirmedIntent()` | branded `ConfirmedIntent` | parse/cast | FAILED | Can return a branded value without signature verification. |
| `packages/repo` runtime | authority trust predicate | `assertWorkspaceTrust` | VERIFIED | `packages/repo/src/workspace-trust-runtime.ts:28-37` calls `assertTrustedWorkspaceForGrant`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `apps/factory-cli/src/main.ts` | `repoPolicy` | `loadRepoPolicy(workspaceRoot)` | Yes, but transformed unsafely | FAILED — DENY_ALL fallback is overwritten before precedence. |
| `apps/factory-cli/src/main.ts` | per-gate `evidence` | `writeSuccessfulGateAdmissionDecisions` | Static/synthetic | FAILED — evidence does not reflect schema contract or actual trust block outcome. |
| `packages/authority/src/stage-reader/factory.ts` | admission index entries | `admission-decisions.jsonl` | Real file data | FAILED — rejects real writer field name. |
| `packages/authority/src/authorized-ops/*` | `resolvedEnvelope` | caller-supplied post-precedence envelope | Present but ignored | FAILED — no grant-flow check before mint. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Existing automated suite | `pnpm run verify` | Reported passed in phase context | PASS, but insufficient |
| Existing full suite | `pnpm run verify:full` | Reported passed in phase context | PASS, but insufficient |
| Factory smoke path | `pnpm run factory` | Reported passed and emitted signed intent | PASS, but insufficient |
| Trusted launch rejects fake second key | Static check of `two-key-launch.ts` and `main.test.ts` | Any non-undefined path passes; test uses dummy object | FAIL |
| Authorized workspace write with empty envelope is rejected | Static check of `authorized-ops.test.ts` | Empty envelope write is expected to pass | FAIL |
| Stage reader reads CLI JSONL | Static writer/reader comparison | Writer emits `artifactPath`, reader requires `path` | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| GOV-01 | Plans 01, 04, 07 | Precedence order documented/enforced; conflicts deny/allow with evidence | FAILED | Precedence kernel exists, but missing repo policy is converted to allow/trusted in factory CLI. |
| GOV-02 | Plans 02, 10 | Capability envelope enforced at workspace, network, subprocess, budget boundaries | FAILED | AuthorizedOp producers do not enforce `resolvedEnvelope`; tests authorize against an empty envelope. |
| GOV-03 | Plans 01, 06a, 06b, 09, 10 | Single owning package; cross-stage reads through admission helpers | FAILED | Package ownership mostly exists, but the stage reader cannot consume CLI JSONL and can return branded unverified intent. |
| GOV-04 | Plans 08, 09 | WorkspaceRef.trust consumed; workspace grants refused unless trusted | FAILED | Trust predicate and repo runtime exist, but factory CLI trusted launch accepts fake files and default untrusted flow exits 0 with `outcome: allow`. |
| GOV-05 | Plans 01, 06a, 06b, 07 | Per-gate admission decisions persisted and schema-versioned | FAILED | Artifacts are written, but schema-versioned contracts do not match emitted evidence/runId shape. |
| GOV-06 | Plans 03, 05, 09, 10 | ConfirmedIntent carries admission signature verified downstream | PARTIAL | Signature helper and tamper tests exist, but trusted launch does not verify supplied intent and stage reader can brand unverified disk JSON. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `apps/factory-cli/src/main.ts` | 919 | Compatibility wrapper widens deny-all | BLOCKER | Defeats precedence/default-deny goal. |
| `apps/factory-cli/src/two-key-launch.ts` | 20 | Presence-only second-key check | BLOCKER | Trusted workspace can be granted with any path string. |
| `packages/authority/src/authorized-ops/authorized-ops.test.ts` | 14 | Empty resolved envelope used in positive tests | BLOCKER | Tests lock in missing runtime envelope enforcement. |
| `apps/factory-cli/src/main.ts` | 792 | Schema-mismatched synthetic gate evidence | BLOCKER | Durable admission artifacts are not trustworthy contracts. |
| `packages/authority/src/stage-reader/factory.ts` | 198 | Casts parsed disk JSON to branded ConfirmedIntent | WARNING | Allows accidental unverified branded consumption. |
| `packages/authority/schema/repo-policy.schema.json` | 16 | Schema accepts negative budget caps | WARNING | Parser/schema mismatch can surprise schema consumers. |

### Human Verification Required

None. The blocking gaps are observable from source and test wiring. Visual/UX clarity for escalation markers can wait until blockers close.

### Gaps Summary

Phase 2 does not achieve the authority-governance goal. The codebase contains important building blocks, and the reported automated checks can be green, but the live wiring still violates the phase's must-have truths:

- Precedence default deny is overwritten before use.
- The two-key trust launch does not verify the second key.
- Authorized operation brands are mintable without checking the resolved capability envelope.
- Per-gate artifacts do not match their schemas.
- The stage reader cannot read the factory CLI admission index.

These are blockers, not deferred Phase 3 work. Later roadmap phases depend on Phase 2's authority contract already being correct before real repo mutation lands.

## Gap Closure Recommendations

1. Remove `repoPolicyForCurrentCompatibility`, preserve `DENY_ALL_REPO_POLICY`, and stop the run on `precedenceDecision.status === "blocked-by-tier"` with durable evidence.
2. Implement real two-key launch verification: read supplied confirmed intent, parse, verify signature, compare to promoted draft/resolved policy snapshot, and reject all malformed or mismatched inputs.
3. Add resolved-envelope enforcement to every `authorize*Op` producer and replace current empty-envelope positive tests with negative tests.
4. Change workspace-trust CLI behavior so untrusted workspace-scope/write/execute grants produce block/escalate, not `outcome: allow`.
5. Align per-gate writer payloads with schemas, including run ID pattern, then add schema validation for artifacts emitted by a successful CLI run.
6. Standardize admission index entry field names between writer and reader; add a CLI-to-stage-reader integration test.
7. Split parsed/unverified intent reads from verified/branded reads in `AuthorityStageReader`.
8. Add `minimum: 0` to repo policy budget cap schema fields and test parser/schema parity.

---

_Verified: 2026-04-27T16:55:51Z_  
_Verifier: the agent (gsd-verifier)_
