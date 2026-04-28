---
phase: 09-operator-surface-resumability
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/artifacts/src/index.ts
  - packages/artifacts/src/factory-run-status.test.ts
  - packages/admission-e2e/src/manifest-status-enum.contract.test.ts
  - apps/factory-cli/src/main.ts
autonomous: true
requirements: [OP-02, OP-03, OP-04]
must_haves:
  truths:
    - "FactoryRunStatus union members are exactly: 'created' | 'running' | 'cancelling' | 'cancelled' | 'orphaned' | 'blocked' | 'repairing' | 'ready-to-release' | 'completed' (Q-18, 9 values)"
    - "All existing setFactoryRunStatus call sites in main.ts compile against the widened union"
    - "All existing string literals in main.ts that match the OLD union still compile (additive change only)"
    - "An admission-e2e contract test pins the exact 9 union members and refuses regression"
    - "No new transition writers added in this plan — Plan 09-06 (cancel command) adds the running→cancelling and cancelling→cancelled writers; Plan 09-09 / others remain unchanged"
  artifacts:
    - path: packages/artifacts/src/index.ts
      contains: '"cancelling"'
    - path: packages/artifacts/src/index.ts
      contains: '"cancelled"'
    - path: packages/artifacts/src/index.ts
      contains: '"orphaned"'
    - path: packages/admission-e2e/src/manifest-status-enum.contract.test.ts
      provides: "Snapshot test pinning the FactoryRunStatus union to 9 values"
  key_links:
    - from: packages/admission-e2e/src/manifest-status-enum.contract.test.ts
      to: packages/artifacts/src/index.ts
      via: "Imports FactoryRunStatus type and asserts a frozen sample list of values matches"
      pattern: "FactoryRunStatus"
---

<objective>
Bump `FactoryRunStatus` (Q-18) from 6 to 9 members by adding `'cancelling' | 'cancelled' | 'orphaned'`. This is the public-schema prerequisite for Plan 09-04 (status command surfaces `cancelled`/`orphaned`/`cancelling` in row state), Plan 09-06 (cancel command writes `cancelling`/`cancelled`), and Plan 09-07 (resume refuses on `cancelled`). Add an admission-e2e snapshot test that locks the exact union members.

Purpose: One coordinated public-schema bump (Q-18) so subsequent commands consume the new union without secondary schema bumps in Phase 10 (CONTEXT decision).
Output: Widened type + audited main.ts call sites + admission-e2e contract test. NO transition writers added in this plan — those land in 09-06.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/09-operator-surface-resumability/09-CONTEXT.md
@.planning/phases/09-operator-surface-resumability/09-RESEARCH.md
@AGENTS.md
@packages/artifacts/src/index.ts
@packages/admission-e2e/package.json
@apps/factory-cli/src/main.ts

<interfaces>
```typescript
// packages/artifacts/src/index.ts — bumped union (Q-18)
export type FactoryRunStatus =
  | "created"
  | "running"
  | "cancelling"
  | "cancelled"
  | "orphaned"
  | "blocked"
  | "repairing"
  | "ready-to-release"
  | "completed";

// setFactoryRunStatus signature unchanged — still accepts FactoryRunStatus, now widened.
export function setFactoryRunStatus(
  manifest: FactoryRunManifest,
  status: FactoryRunStatus
): FactoryRunManifest;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Widen FactoryRunStatus + audit main.ts string literals + add unit test</name>
  <read_first>
    - packages/artifacts/src/index.ts (FULL FILE — FactoryRunStatus at line 4, FactoryRunManifest, setFactoryRunStatus at line 80)
    - apps/factory-cli/src/main.ts (audit ALL string literals matching the OLD union — grep for 'created', 'running', 'blocked', 'repairing', 'ready-to-release', 'completed' across the file; especially line ~1295 setFactoryRunStatus call site and line ~1528 statusForReviewVerdict)
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-18, Pitfall 5 in RESEARCH)
    - .planning/phases/09-operator-surface-resumability/09-RESEARCH.md (Pitfall 5 — auditing all status literals)
  </read_first>
  <files>packages/artifacts/src/index.ts, packages/artifacts/src/factory-run-status.test.ts, apps/factory-cli/src/main.ts</files>
  <behavior>
    - factory-run-status.test: setFactoryRunStatus(manifest, "cancelling") returns manifest with status="cancelling".
    - factory-run-status.test: setFactoryRunStatus(manifest, "cancelled") returns manifest with status="cancelled".
    - factory-run-status.test: setFactoryRunStatus(manifest, "orphaned") returns manifest with status="orphaned".
    - factory-run-status.test: setFactoryRunStatus(manifest, "completed") still works (regression).
    - factory-run-status.test: a `const allStatuses: FactoryRunStatus[]` literal of all 9 values type-checks.
    - main.ts: pre-existing tests continue to pass — no behavior change at runtime, only type widening.
  </behavior>
  <action>
    1. Edit `packages/artifacts/src/index.ts`:
       - Replace the existing `FactoryRunStatus` union with the 9-member version verbatim from `<interfaces>` above. Order MUST be: `"created" | "running" | "cancelling" | "cancelled" | "orphaned" | "blocked" | "repairing" | "ready-to-release" | "completed"`.
       - Do NOT change `FactoryRunManifest`, `setFactoryRunStatus`, or any other export.
    2. Create `packages/artifacts/src/factory-run-status.test.ts` covering the cases above. Use a minimal `FactoryRunManifest` fixture builder (mirror existing tests in artifacts).
    3. Audit `apps/factory-cli/src/main.ts` for string literals corresponding to FactoryRunStatus values. Run `grep -nE "'(created|running|cancelling|cancelled|orphaned|blocked|repairing|ready-to-release|completed)'" apps/factory-cli/src/main.ts` and confirm the new values (`'cancelling'`, `'cancelled'`, `'orphaned'`) are NOT yet referenced — those land in 09-06 / 09-04. Existing literals MUST continue to compile.
    4. NO new transition writers in this plan. Document in commit message: "FactoryRunStatus widened; transition writers (running → cancelling, cancelling → cancelled) deferred to Plan 09-06; orphaned is derived at status-time only per Q-09 (no manifest writer in v0.1)."
    5. Run `pnpm --filter @protostar/artifacts build && pnpm --filter @protostar/artifacts test`, `pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test`, and `pnpm run verify`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/artifacts build && pnpm --filter @protostar/artifacts test && pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"cancelling"' packages/artifacts/src/index.ts` is at least 1
    - `grep -c '"cancelled"' packages/artifacts/src/index.ts` is at least 1
    - `grep -c '"orphaned"' packages/artifacts/src/index.ts` is at least 1
    - `grep -c '"ready-to-release"' packages/artifacts/src/index.ts` is at least 1
    - `pnpm --filter @protostar/artifacts test` exits 0
    - `pnpm --filter @protostar/factory-cli build` exits 0 (type-checks against widened union)
    - `pnpm --filter @protostar/factory-cli test` exits 0
  </acceptance_criteria>
  <done>FactoryRunStatus widened; tests green; main.ts compiles against new union without behavior change.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Lock FactoryRunStatus union in admission-e2e contract test</name>
  <read_first>
    - packages/admission-e2e/package.json (deps; confirm @protostar/artifacts is a dep — add if not)
    - packages/admission-e2e/src/ (existing contract test patterns; e.g., dogpile-adapter-no-fs.contract.test.ts shape)
    - packages/admission-e2e/tsconfig.json (references)
    - packages/artifacts/src/index.ts (post-Task-1 widened union)
  </read_first>
  <files>packages/admission-e2e/src/manifest-status-enum.contract.test.ts, packages/admission-e2e/package.json, packages/admission-e2e/tsconfig.json</files>
  <behavior>
    - manifest-status-enum.contract.test: a `const expected: readonly FactoryRunStatus[]` containing exactly `["created", "running", "cancelling", "cancelled", "orphaned", "blocked", "repairing", "ready-to-release", "completed"]` type-checks against `FactoryRunStatus`.
    - manifest-status-enum.contract.test: `expected.length === 9`.
    - manifest-status-enum.contract.test: a parallel "frozen" listing matches `expected` deep-equal (catches accidental reordering or member removal).
    - manifest-status-enum.contract.test: a deliberately-wrong literal like `"foo" satisfies FactoryRunStatus` is excluded by a doc-comment block (cannot be a runtime test — instead, assert that `JSON.stringify(expected)` matches a hard-coded snapshot string).
  </behavior>
  <action>
    1. If `@protostar/artifacts` is not already a workspace dep of `@protostar/admission-e2e`, add it and update tsconfig references.
    2. Create `packages/admission-e2e/src/manifest-status-enum.contract.test.ts`:
       ```typescript
       import { describe, it } from "node:test";
       import assert from "node:assert/strict";
       import type { FactoryRunStatus } from "@protostar/artifacts";

       describe("FactoryRunStatus union — Phase 9 Q-18 lock", () => {
         it("is exactly the locked 9 members in this exact order", () => {
           const expected: readonly FactoryRunStatus[] = [
             "created",
             "running",
             "cancelling",
             "cancelled",
             "orphaned",
             "blocked",
             "repairing",
             "ready-to-release",
             "completed",
           ];
           assert.equal(expected.length, 9);
           const snapshot = JSON.stringify(expected);
           assert.equal(
             snapshot,
             '["created","running","cancelling","cancelled","orphaned","blocked","repairing","ready-to-release","completed"]'
           );
         });
       });
       ```
    3. Run `pnpm --filter @protostar/admission-e2e build && pnpm --filter @protostar/admission-e2e test` and `pnpm run verify`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e build && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/admission-e2e/src/manifest-status-enum.contract.test.ts` returns 0
    - `grep -c 'cancelling' packages/admission-e2e/src/manifest-status-enum.contract.test.ts` is at least 1
    - `grep -c 'cancelled' packages/admission-e2e/src/manifest-status-enum.contract.test.ts` is at least 1
    - `grep -c 'orphaned' packages/admission-e2e/src/manifest-status-enum.contract.test.ts` is at least 1
    - `grep -c '"ready-to-release"' packages/admission-e2e/src/manifest-status-enum.contract.test.ts` is at least 1
    - `pnpm --filter @protostar/admission-e2e test` exits 0
  </acceptance_criteria>
  <done>Admission-e2e contract test locks the 9-member union; future regressions to FactoryRunStatus fail this test.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Public schema (FactoryRunStatus) | Operator + downstream automation depend on stable union members; silent removal/reorder breaks consumers |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-03-01 | Tampering | FactoryRunStatus drift | mitigate | admission-e2e snapshot test pins exact union members + order; failure surfaces silent regressions. |
| T-09-03-02 | Repudiation | manifest.status semantics | accept | Additive widening only; no historical run will have new values; readers tolerate via TS union exhaustiveness. |
</threat_model>

<verification>
- `pnpm --filter @protostar/artifacts test` clean
- `pnpm --filter @protostar/admission-e2e test` clean
- `pnpm --filter @protostar/factory-cli test` clean (no regression from widening)
</verification>

<success_criteria>
- FactoryRunStatus union is exactly the 9 members in the locked order
- Contract test in admission-e2e pins the union and would fail on regression
- main.ts compiles against widened union with no transition writers added
</success_criteria>

<output>
Create `.planning/phases/09-operator-surface-resumability/09-03-SUMMARY.md` summarizing the enum bump, the locked admission-e2e contract test, and the deferral of transition writers to Plan 09-06.
</output>
