---
phase: 02-authority-governance-kernel
plan: 11
type: execute
wave: 5
depends_on: [04, 06b, 07, 08]
files_modified:
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/main.test.ts
  - apps/factory-cli/src/write-admission-decision.test.ts
  - packages/planning/schema/planning-admission-decision.schema.json
  - packages/intent/schema/capability-admission-decision.schema.json
  - packages/intent/schema/repo-scope-admission-decision.schema.json
  - packages/repo/schema/workspace-trust-admission-decision.schema.json
autonomous: true
requirements:
  - GOV-01
  - GOV-04
  - GOV-05
must_haves:
  truths:
    - "Factory CLI passes the loaded repo policy to `intersectEnvelopes` unchanged; absent `.protostar/repo-policy.json` remains `DENY_ALL_REPO_POLICY` and cannot be widened for compatibility."
    - "A `PrecedenceDecision` with `status: \"blocked-by-tier\"` writes durable evidence and stops before signing `intent.json`, planning admission, or downstream stage execution."
    - "The workspace-trust gate writes `outcome: \"block\"` or `outcome: \"escalate\"` when `declaredTrust !== \"trusted\"`; it never writes `outcome: \"allow\"` with `evidence.admitted: false`."
    - "Factory CLI emitted per-gate admission-decision evidence matches the checked-in schemas for planning, capability, repo-scope, and workspace-trust gates."
  artifacts:
    - path: apps/factory-cli/src/main.ts
      provides: "Fail-closed precedence and workspace-trust gate behavior in the composition path"
      contains: "precedenceDecision.status === \"blocked-by-tier\""
    - path: apps/factory-cli/src/main.test.ts
      provides: "Regression tests for default-deny repo policy, blocked precedence, schema-conformant gate evidence, and untrusted workspace block"
      contains: "candidatesConsidered"
    - path: packages/repo/schema/workspace-trust-admission-decision.schema.json
      provides: "Workspace trust evidence contract used by the factory-cli writer"
      contains: "grantedAccess"
  key_links:
    - from: apps/factory-cli/src/main.ts
      to: packages/authority/src/repo-policy/parse.ts
      via: "uses `DENY_ALL_REPO_POLICY` from `loadRepoPolicy()` without compatibility widening"
      pattern: "DENY_ALL_REPO_POLICY"
    - from: apps/factory-cli/src/main.ts
      to: packages/authority/src/precedence/intersect.ts
      via: "`intersectEnvelopes(buildTierConstraints(... repoPolicy ...))` decides whether the run may proceed"
      pattern: "intersectEnvelopes"
---

<objective>
Close the verification blockers where factory-cli defeats the authority kernel after the contracts have been built:

1. Remove the compatibility widening that rewrites `DENY_ALL_REPO_POLICY` into the requested intent envelope.
2. Stop the run when precedence blocks before minting a signed `ConfirmedIntent` or proceeding to planning.
3. Make workspace trust a real gate outcome, not an informational field attached to an allow decision.
4. Align factory-cli gate evidence with the shipped per-gate schemas.

This plan is intentionally limited to the composition layer and schema contracts. It does not change `intersectEnvelopes`; it makes factory-cli honor it.
</objective>

<context>
@.planning/phases/02-authority-governance-kernel/02-VERIFICATION.md
@.planning/phases/02-authority-governance-kernel/02-CONTEXT.md
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/main.test.ts
@apps/factory-cli/src/write-admission-decision.ts
@apps/factory-cli/src/load-repo-policy.ts
@packages/authority/src/repo-policy/parse.ts
@packages/planning/schema/planning-admission-decision.schema.json
@packages/intent/schema/capability-admission-decision.schema.json
@packages/intent/schema/repo-scope-admission-decision.schema.json
@packages/repo/schema/workspace-trust-admission-decision.schema.json
</context>

<threat_model>
Threats addressed:
- T-2-3 precedence bypass: default deny is silently widened before enforcement.
- T-2-5 trust bypass: untrusted workspaces receive allow decisions with contradictory evidence.
- T-2-6 artifact drift: durable gate evidence cannot be consumed as a schema-versioned authority contract.

Block on high severity threats. If any acceptance criterion below cannot be met, stop and leave the failing test in place.
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Preserve DENY_ALL repo policy and fail closed on blocked precedence</name>
  <files>
    apps/factory-cli/src/main.ts,
    apps/factory-cli/src/main.test.ts
  </files>
  <read_first>
    - apps/factory-cli/src/main.ts (current `repoPolicyForCurrentCompatibility` and precedence setup)
    - apps/factory-cli/src/load-repo-policy.ts (source of `DENY_ALL_REPO_POLICY` when repo policy is absent)
    - packages/authority/src/repo-policy/parse.ts (`DENY_ALL_REPO_POLICY`)
    - packages/authority/src/precedence/intersect.ts (`blocked-by-tier` behavior)
    - .planning/phases/02-authority-governance-kernel/02-VERIFICATION.md (first failed truth)
  </read_first>
  <action>
    Remove `repoPolicyForCurrentCompatibility` from `apps/factory-cli/src/main.ts`.

    Change the precedence call from:
    `repoPolicy: repoPolicyForCurrentCompatibility(repoPolicy, unsignedIntent)`

    to:
    `repoPolicy`

    Immediately after `await writePrecedenceDecision({ runDir, decision: precedenceDecision });`, add a fail-closed branch:
    - If `precedenceDecision.status === "blocked-by-tier"`, write an admission decision for `gate: "repo-scope"` with `outcome: "block"`.
    - Evidence must include `requestedScopes`, `grantedScopes`, and `blockedBy`.
    - Write refusal or terminal marker evidence consistent with existing factory-cli refusal handling.
    - Throw `CliExitError` with exit code `1` and a reason containing `precedence blocked by tier`.
    - Do this before `buildPolicySnapshot`, `buildSignatureEnvelope`, `promoteAndSignIntent`, planning admission, or factory task output.

    Add a regression test where `.protostar/repo-policy.json` is absent. The fixture intent requests a workspace write. Assert:
    - `precedence-decision.json` has `status: "blocked-by-tier"`.
    - No `intent.json` exists in the run directory.
    - `repo-scope-admission-decision.json` has `outcome: "block"`.
    - The CLI exits non-zero.
  </action>
  <acceptance_criteria>
    - `rg "repoPolicyForCurrentCompatibility" apps/factory-cli/src/main.ts` exits 1.
    - `apps/factory-cli/src/main.ts` contains `repoPolicy` in the `buildTierConstraints({` input and does not contain `trustOverride: "trusted"` in any repo-policy compatibility helper.
    - `apps/factory-cli/src/main.ts` contains `precedenceDecision.status === "blocked-by-tier"`.
    - `apps/factory-cli/src/main.test.ts` contains `precedence-decision.json` and `precedence blocked by tier`.
    - `pnpm --filter @protostar/factory-cli test` exits 0.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Make workspace trust block/escalate and align per-gate evidence with schemas</name>
  <files>
    apps/factory-cli/src/main.ts,
    apps/factory-cli/src/main.test.ts,
    apps/factory-cli/src/write-admission-decision.test.ts,
    packages/planning/schema/planning-admission-decision.schema.json,
    packages/intent/schema/capability-admission-decision.schema.json,
    packages/intent/schema/repo-scope-admission-decision.schema.json,
    packages/repo/schema/workspace-trust-admission-decision.schema.json
  </files>
  <read_first>
    - apps/factory-cli/src/main.ts (`writeSuccessfulGateAdmissionDecisions`, `baseAdmissionDecision`)
    - packages/planning/schema/planning-admission-decision.schema.json
    - packages/intent/schema/capability-admission-decision.schema.json
    - packages/intent/schema/repo-scope-admission-decision.schema.json
    - packages/repo/schema/workspace-trust-admission-decision.schema.json
    - packages/intent/src/clarification-report-schema.test.ts (`validateAgainstSchema` local helper pattern)
  </read_first>
  <action>
    Update `writeSuccessfulGateAdmissionDecisions` evidence shapes exactly:

    Planning evidence:
    - `candidatesConsidered: readCandidateCount(input.planningAdmission)`
    - Remove `candidateCount`.

    Capability evidence:
    - `requestedEnvelope: input.admissionDecision.intent.capabilityEnvelope` or the closest existing requested envelope source from the admitted intent.
    - `resolvedEnvelope: input.precedenceDecision.resolvedEnvelope`
    - Remove synthetic-only `violationCount` unless the schema explicitly allows it.

    Repo-scope evidence:
    - `requestedScopes: input.admissionDecision.intent.capabilityEnvelope.repoScopes.map(scope => scope.path)`
    - `grantedScopes: input.precedenceDecision.resolvedEnvelope.repoScopes.map(scope => scope.path)`

    Workspace-trust evidence:
    - `workspacePath: <workspace root/path used by factory-cli>`
    - `declaredTrust: input.workspaceTrust`
    - `grantedAccess: input.workspaceTrust === "trusted" ? "write" : "none"`

    For `input.workspaceTrust !== "trusted"`, write `outcome: "block"` or `outcome: "escalate"` according to the existing two-key/escalation branch, and stop before downstream stages. Do not emit `outcome: "allow"` with `admitted: false`.

    Add a small test-local JSON Schema validator by copying the recursive helper style from `packages/intent/src/clarification-report-schema.test.ts`. Use it to validate the factory-cli emitted planning, capability, repo-scope, and workspace-trust decisions against their checked-in schemas.
  </action>
  <acceptance_criteria>
    - `apps/factory-cli/src/main.ts` contains `candidatesConsidered` and does not contain `candidateCount:` in per-gate planning evidence.
    - `apps/factory-cli/src/main.ts` contains `requestedEnvelope` and `resolvedEnvelope`.
    - `apps/factory-cli/src/main.ts` contains `requestedScopes` and `grantedScopes`.
    - `apps/factory-cli/src/main.ts` contains `workspacePath` and `grantedAccess`.
    - `apps/factory-cli/src/main.test.ts` validates emitted gate decisions against all four schema files.
    - The default untrusted workspace test expects non-zero/block or escalate instead of exit code 0.
    - `pnpm --filter @protostar/factory-cli test` exits 0.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm --filter @protostar/factory-cli test`
- `pnpm run verify`
- Static check: `rg "repoPolicyForCurrentCompatibility|candidateCount:" apps/factory-cli/src/main.ts` must not find the removed compatibility/evidence fields.
</verification>

<success_criteria>
- Missing repo policy is deny-all through the live factory-cli path.
- Blocked precedence halts before signing or planning.
- Workspace trust refusal is an actual gate outcome.
- Factory-cli gate artifacts conform to their schemas.
</success_criteria>
