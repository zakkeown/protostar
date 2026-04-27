---
phase: 02-authority-governance-kernel
plan: 12
type: execute
wave: 5
depends_on: [02, 04]
files_modified:
  - packages/authority/src/authorized-ops/grant-checks.ts
  - packages/authority/src/authorized-ops/workspace-op.ts
  - packages/authority/src/authorized-ops/subprocess-op.ts
  - packages/authority/src/authorized-ops/network-op.ts
  - packages/authority/src/authorized-ops/budget-op.ts
  - packages/authority/src/authorized-ops/authorized-ops.test.ts
  - packages/authority/src/authorized-ops/index.ts
requirements:
  - GOV-02
  - GOV-04
autonomous: true
must_haves:
  truths:
    - "Every AuthorizedOp producer rejects an empty `resolvedEnvelope` for operations that require workspace, subprocess, network, or budget authority."
    - "Workspace authorization checks both workspace trust and matching `resolvedEnvelope.repoScopes` before minting `AuthorizedWorkspaceOp`."
    - "Subprocess authorization checks `resolvedEnvelope.executeGrants` before minting `AuthorizedSubprocessOp`."
    - "Network authorization is explicitly scoped to a tool permission grant: `tool: \"network\"` with `permissionLevel` of `use`, `execute`, or `admin`."
    - "Budget authorization checks a requested `budgetKey` against `resolvedEnvelope.budget[budgetKey]` and rejects missing or exceeded caps."
  artifacts:
    - path: packages/authority/src/authorized-ops/grant-checks.ts
      provides: "Shared pure grant matching helpers"
      contains: "hasWorkspaceGrant"
    - path: packages/authority/src/authorized-ops/authorized-ops.test.ts
      provides: "Negative tests for empty and mismatched resolved envelopes at every boundary"
      contains: "empty resolved envelope"
---

<objective>
Close the GOV-02 blocker: AuthorizedOp brands are currently runtime comments because producers accept `resolvedEnvelope` but do not check it. This plan makes the resolved envelope load-bearing for workspace, subprocess, network, and budget operations.
</objective>

<context>
@.planning/phases/02-authority-governance-kernel/02-VERIFICATION.md
@.planning/phases/02-authority-governance-kernel/02-CONTEXT.md
@packages/authority/src/authorized-ops/workspace-op.ts
@packages/authority/src/authorized-ops/subprocess-op.ts
@packages/authority/src/authorized-ops/network-op.ts
@packages/authority/src/authorized-ops/budget-op.ts
@packages/authority/src/authorized-ops/authorized-ops.test.ts
@packages/intent/src/capability-envelope.ts
</context>

<threat_model>
Threats addressed:
- T-2-2 brand laundering: callers mint authorized operations despite no resolved grant.
- T-2-5 workspace trust bypass: a trusted workspace alone is enough even when scope is absent.

Block on high severity threats. Empty or mismatched envelopes must fail in tests.
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add shared resolved-envelope grant checks</name>
  <files>
    packages/authority/src/authorized-ops/grant-checks.ts,
    packages/authority/src/authorized-ops/index.ts,
    packages/authority/src/authorized-ops/authorized-ops.test.ts
  </files>
  <read_first>
    - packages/intent/src/capability-envelope.ts (`CapabilityEnvelope`, `RepoScopeGrant`, `ExecuteGrant`, `ToolPermissionGrant`, `FactoryBudget`)
    - packages/authority/src/precedence/precedence-decision.ts (resolved envelope shape after intersection)
    - packages/authority/src/authorized-ops/authorized-ops.test.ts (current empty-envelope positive tests to replace)
  </read_first>
  <action>
    Create `packages/authority/src/authorized-ops/grant-checks.ts` with pure helpers:

    - `hasWorkspaceGrant(envelope, { workspace, path, access })`
      - Match when a repo scope has `scope.workspace === workspace.root` OR `scope.workspace === "main"`.
      - Match when `path === scope.path` OR `path.startsWith(scope.path + "/")`.
      - Access order: `read < write < execute`; a higher grant covers lower access.

    - `hasExecuteGrant(envelope, { command, cwd })`
      - Match when an execute grant has exact `grant.command === command`.
      - Match scope when `grant.scope === cwd`, `grant.scope === "."`, or `cwd.startsWith(grant.scope + "/")`.

    - `hasNetworkGrant(envelope)`
      - Match when `toolPermissions` contains `tool === "network"` and `permissionLevel` is `use`, `execute`, or `admin`.

    - `hasBudgetGrant(envelope, { budgetKey, amount })`
      - Match when `typeof envelope.budget[budgetKey] === "number"` and `amount <= envelope.budget[budgetKey]`.

    Export these helpers from the internal `authorized-ops/index.ts` only if tests need them; otherwise keep them file-local to the authorized-op producers.
  </action>
  <acceptance_criteria>
    - `packages/authority/src/authorized-ops/grant-checks.ts` contains `hasWorkspaceGrant`, `hasExecuteGrant`, `hasNetworkGrant`, and `hasBudgetGrant`.
    - `packages/authority/src/authorized-ops/authorized-ops.test.ts` contains a fixture named or described as `empty resolved envelope`.
    - `pnpm --filter @protostar/authority test` exits 0.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Enforce grants in all AuthorizedOp producers</name>
  <files>
    packages/authority/src/authorized-ops/workspace-op.ts,
    packages/authority/src/authorized-ops/subprocess-op.ts,
    packages/authority/src/authorized-ops/network-op.ts,
    packages/authority/src/authorized-ops/budget-op.ts,
    packages/authority/src/authorized-ops/authorized-ops.test.ts
  </files>
  <read_first>
    - packages/authority/src/authorized-ops/grant-checks.ts (new helper)
    - packages/authority/src/workspace-trust/predicate.ts (trust remains a separate required check)
    - packages/authority/src/authorized-ops/*.ts (current producers)
  </read_first>
  <action>
    Update producers:

    - `authorizeWorkspaceOp` keeps `assertTrustedWorkspaceForGrant` and additionally rejects when `hasWorkspaceGrant(...)` is false. Error text must include `resolvedEnvelope.repoScopes`.
    - `authorizeSubprocessOp` keeps shell metacharacter rejection and additionally rejects when `hasExecuteGrant(...)` is false. Error text must include `resolvedEnvelope.executeGrants`.
    - `authorizeNetworkOp` keeps URL parse/protocol rejection and additionally rejects when `hasNetworkGrant(...)` is false. Error text must include `toolPermissions network`.
    - Extend `AuthorizedBudgetOpData` with `readonly budgetKey: "maxUsd" | "maxTokens" | "timeoutMs" | "maxRepairLoops"`. `authorizeBudgetOp` rejects missing caps and `amount > cap`. Error text must include `resolvedEnvelope.budget`.

    Replace current empty-envelope positive tests with:
    - Positive cases use a populated envelope with matching repo scope, execute grant, network tool permission, and budget cap.
    - Negative cases assert empty envelope rejection for workspace, subprocess, network, and budget.
    - Negative cases assert mismatched path, command, missing network permission, and exceeded budget cap.
  </action>
  <acceptance_criteria>
    - `packages/authority/src/authorized-ops/workspace-op.ts` contains `hasWorkspaceGrant`.
    - `packages/authority/src/authorized-ops/subprocess-op.ts` contains `hasExecuteGrant`.
    - `packages/authority/src/authorized-ops/network-op.ts` contains `hasNetworkGrant`.
    - `packages/authority/src/authorized-ops/budget-op.ts` contains `budgetKey` and `hasBudgetGrant`.
    - `packages/authority/src/authorized-ops/authorized-ops.test.ts` contains `resolvedEnvelope.repoScopes`, `resolvedEnvelope.executeGrants`, `toolPermissions network`, and `resolvedEnvelope.budget`.
    - `pnpm --filter @protostar/authority test` exits 0.
    - `pnpm --filter @protostar/admission-e2e test` exits 0 so brand contract surfaces remain pinned.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm --filter @protostar/authority test`
- `pnpm --filter @protostar/admission-e2e test`
- `pnpm run verify`
</verification>

<success_criteria>
- No AuthorizedOp producer mints a brand from an empty envelope.
- Existing brand contract tests still pass.
- Workspace, subprocess, network, and budget checks are all grounded in the post-precedence resolved envelope.
</success_criteria>
