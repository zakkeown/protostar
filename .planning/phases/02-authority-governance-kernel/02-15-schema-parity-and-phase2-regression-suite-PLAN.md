---
phase: 02-authority-governance-kernel
plan: 15
type: execute
wave: 7
depends_on: [11, 12, 13, 14]
files_modified:
  - packages/authority/schema/repo-policy.schema.json
  - packages/authority/src/repo-policy/repo-policy.test.ts
  - apps/factory-cli/src/main.test.ts
  - packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts
  - packages/admission-e2e/package.json
requirements:
  - GOV-01
  - GOV-02
  - GOV-03
  - GOV-04
  - GOV-05
  - GOV-06
autonomous: true
must_haves:
  truths:
    - "Repo policy parser and JSON Schema agree that budget caps must be non-negative finite numbers."
    - "A successful factory-cli run validates every emitted gate decision against its owning schema."
    - "A Phase 2 regression e2e proves the eight verification gaps stay closed together, not only in isolated unit tests."
  artifacts:
    - path: packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts
      provides: "End-to-end regression for Phase 2 verification gaps"
      contains: "blocked-by-tier"
    - path: packages/authority/schema/repo-policy.schema.json
      provides: "Schema/parser parity for non-negative budget caps"
      contains: "minimum"
---

<objective>
Add the final regression net after the targeted repairs. This plan covers the partial repo-policy schema warning and adds cross-package tests that exercise the Phase 2 authority contract as one flow.
</objective>

<context>
@.planning/phases/02-authority-governance-kernel/02-VERIFICATION.md
@packages/authority/schema/repo-policy.schema.json
@packages/authority/src/repo-policy/parse.ts
@packages/authority/src/repo-policy/repo-policy.test.ts
@apps/factory-cli/src/main.test.ts
@packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts
</context>

<threat_model>
Threats addressed:
- T-2-6 schema drift: parser and schema disagree.
- Regression risk: isolated fixes pass but the factory authority flow still admits a blocked or unverified path.

Block on high severity threats. The e2e must fail before Plans 11-14 and pass after them.
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add repo-policy schema/parser parity for non-negative budget caps</name>
  <files>
    packages/authority/schema/repo-policy.schema.json,
    packages/authority/src/repo-policy/repo-policy.test.ts
  </files>
  <read_first>
    - packages/authority/schema/repo-policy.schema.json
    - packages/authority/src/repo-policy/parse.ts (`readOptionalBudgetCaps`)
    - packages/authority/src/repo-policy/repo-policy.test.ts
  </read_first>
  <action>
    Add `"minimum": 0` to all four budget cap schema properties:
    - `budgetCaps.maxUsd`
    - `budgetCaps.maxTokens`
    - `budgetCaps.timeoutMs`
    - `budgetCaps.maxRepairLoops`

    Add a schema parity test that loads `repo-policy.schema.json` and asserts each property has `type: "number"` and `minimum: 0`. Keep the existing parser test that rejects `budgetCaps.maxUsd: -1`.
  </action>
  <acceptance_criteria>
    - `packages/authority/schema/repo-policy.schema.json` contains four `minimum` entries under `budgetCaps`.
    - `packages/authority/src/repo-policy/repo-policy.test.ts` asserts `minimum === 0` for all four cap fields.
    - `pnpm --filter @protostar/authority test` exits 0.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add Phase 2 authority-governance regression e2e</name>
  <files>
    apps/factory-cli/src/main.test.ts,
    packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts,
    packages/admission-e2e/package.json
  </files>
  <read_first>
    - apps/factory-cli/src/main.test.ts (factory fixture helpers)
    - packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts (signed-intent e2e pattern)
    - packages/authority/src/stage-reader/factory.ts (reader APIs after Plan 14)
    - packages/authority/src/authorized-ops/authorized-ops.test.ts (grant semantics after Plan 12)
  </read_first>
  <action>
    Add a cross-package e2e test named `authority-governance-kernel.e2e.test.ts`.

    It must prove:
    - Missing `.protostar/repo-policy.json` blocks requested workspace write with `precedence-decision.json.status === "blocked-by-tier"`.
    - A permissive repo policy allows a run to emit all five gate decisions.
    - The emitted `admission-decisions.jsonl` is readable through `AuthorityStageReader.admissionDecisionsIndex()` and every entry has `artifactPath`.
    - `AuthorityStageReader.confirmedIntent()` succeeds on the emitted signed intent.
    - Mutating persisted `intent.json` causes `AuthorityStageReader.confirmedIntent()` to reject.
    - Empty-envelope calls to `authorizeWorkspaceOp`, `authorizeSubprocessOp`, `authorizeNetworkOp`, and `authorizeBudgetOp` all return `ok: false`.

    If admission-e2e cannot call factory-cli internals without crossing package boundaries, keep the factory-cli flow tests in `apps/factory-cli/src/main.test.ts` and put the reader/AuthorizedOp integration in admission-e2e. Do not introduce runtime dependencies.
  </action>
  <acceptance_criteria>
    - `packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts` contains `blocked-by-tier`, `artifactPath`, `confirmedIntent()`, and `authorizeWorkspaceOp`.
    - `apps/factory-cli/src/main.test.ts` validates every emitted gate artifact against its schema for a successful run.
    - `pnpm --filter @protostar/factory-cli test` exits 0.
    - `pnpm --filter @protostar/admission-e2e test` exits 0.
    - `pnpm run verify:full` exits 0.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm --filter @protostar/authority test`
- `pnpm --filter @protostar/factory-cli test`
- `pnpm --filter @protostar/admission-e2e test`
- `pnpm run verify:full`
- `pnpm run factory`
</verification>

<success_criteria>
- The repo-policy schema warning is closed.
- A single regression suite catches recurrence of the Phase 2 verification failures.
- Phase 2 can be re-verified against all GOV-01 through GOV-06 requirements.
</success_criteria>
