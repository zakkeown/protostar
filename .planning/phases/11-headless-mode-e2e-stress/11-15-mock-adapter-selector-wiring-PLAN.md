---
phase: 11-headless-mode-e2e-stress
plan: 15
type: execute
wave: 4
depends_on:
  - 11-06
  - 11-07
files_modified:
  - packages/mock-llm-adapter/package.json
  - packages/mock-llm-adapter/tsconfig.json
  - packages/mock-llm-adapter/src/index.ts
  - packages/mock-llm-adapter/src/coder-adapter.ts
  - packages/mock-llm-adapter/src/coder-adapter.test.ts
  - packages/mock-llm-adapter/src/no-net.contract.test.ts
  - apps/factory-cli/src/wiring/execution-adapter.ts
  - apps/factory-cli/src/wiring/execution-adapter.test.ts
  - apps/factory-cli/package.json
  - apps/factory-cli/tsconfig.json
  - tsconfig.json
  - tsconfig.base.json
  - AGENTS.md
  - pnpm-lock.yaml
autonomous: true
requirements:
  - STRESS-07
  - STRESS-06
must_haves:
  truths:
    - "Mock backend implements the existing ExecutionAdapter contract deterministically with no network authority."
    - "Mock backend exposes deterministic network-drop and llm-timeout modes required by 11-11 fault mechanisms; disk-full and abort-signal remain runner-level mechanisms."
    - "Factory-cli selector imports hosted and mock packages through complete manifest/project-reference wiring."
    - "Temporary missing-package selector errors from Plan 11-06 are removed."
  artifacts:
    - path: "packages/mock-llm-adapter/src/no-net.contract.test.ts"
      provides: "pure package no-network invariant"
      contains: "node:http"
    - path: "apps/factory-cli/src/wiring/execution-adapter.ts"
      provides: "actual hosted/mock selector wiring"
      contains: "createMockCoderAdapter"
    - path: "AGENTS.md"
      provides: "human-readable tier mirror for @protostar/mock-llm-adapter"
      contains: "@protostar/mock-llm-adapter"
  key_links:
    - from: "packages/mock-llm-adapter/src/coder-adapter.ts"
      to: "packages/execution/src/adapter-contract.ts"
      via: "implements ExecutionAdapter"
      pattern: "ExecutionAdapter"
    - from: "apps/factory-cli/src/wiring/execution-adapter.ts"
      to: "packages/hosted-llm-adapter/src/coder-adapter.ts"
      via: "hosted-openai-compatible selector branch"
      pattern: "createHostedOpenAiCompatibleCoderAdapter"
    - from: "apps/factory-cli/src/wiring/execution-adapter.ts"
      to: "packages/mock-llm-adapter/src/coder-adapter.ts"
      via: "mock selector branch for stress"
      pattern: "createMockCoderAdapter"
    - from: "apps/factory-cli/src/scripts/stress.ts"
      to: "packages/mock-llm-adapter/src/coder-adapter.ts"
      via: "fault-injection uses mock network-drop and llm-timeout modes"
      pattern: "PROTOSTAR_MOCK_LLM_MODE"
---

<objective>
Add the deterministic mock execution adapter and complete factory-cli selector wiring.

Purpose: stress smokes need a no-cost deterministic backend, and the factory-cli composition root must resolve all three backend literals through complete package manifests and TypeScript references.
Output: mock adapter package, no-net contract, selector imports, factory-cli dependency/reference wiring, and AGENTS tier mirror updates.
</objective>

<execution_context>
@/Users/zakkeown/.codex/get-shit-done/workflows/execute-plan.md
@/Users/zakkeown/.codex/get-shit-done/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/PROJECT.md
@.planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md
@.planning/phases/11-headless-mode-e2e-stress/11-PATTERNS.md
@packages/execution/src/adapter-contract.ts
@packages/hosted-llm-adapter/src/coder-adapter.ts
@packages/lmstudio-adapter/src/coder-adapter.ts
@packages/artifacts/src/no-net.contract.test.ts
@packages/admission-e2e/src/tier-conformance.contract.test.ts
@apps/factory-cli/src/wiring/execution-adapter.ts
@apps/factory-cli/package.json
@apps/factory-cli/tsconfig.json
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Scaffold mock adapter package and pure-tier wiring</name>
  <read_first>
    - packages/artifacts/src/no-net.contract.test.ts
    - packages/execution/src/adapter-contract.ts
    - packages/admission-e2e/src/tier-conformance.contract.test.ts
    - AGENTS.md
  </read_first>
  <files>packages/mock-llm-adapter/package.json, packages/mock-llm-adapter/tsconfig.json, packages/mock-llm-adapter/src/no-net.contract.test.ts, apps/factory-cli/package.json, apps/factory-cli/tsconfig.json, tsconfig.json, tsconfig.base.json, AGENTS.md, pnpm-lock.yaml</files>
  <action>
    Add `@protostar/mock-llm-adapter` with `"protostar": { "tier": "pure" }`, `"sideEffects": false`, `"engines": { "node": ">=22" }`, build/test/typecheck scripts, and workspace dependencies only.
    Add package-local `src/no-net.contract.test.ts` following the existing pure-package scan pattern. It must assert no `node:http`, `node:https`, `node:net`, `http`, `https`, `net`, `fetch`, or websocket usage in production `src/`.
    Add root `tsconfig.json` reference and `tsconfig.base.json` path alias/export for `@protostar/mock-llm-adapter`.
    Add `@protostar/mock-llm-adapter` to `apps/factory-cli/package.json` dependencies and `apps/factory-cli/tsconfig.json` references. Preserve the `@protostar/hosted-llm-adapter` dependency/reference added by Plan 11-07.
    Update AGENTS.md Authority Tiers so `@protostar/mock-llm-adapter` appears under pure (`fs-forbidden`, `network-forbidden`). Run `pnpm install` if the workspace lockfile needs the new workspace package entry; do not add external runtime dependencies.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/mock-llm-adapter test && pnpm --filter @protostar/admission-e2e test && pnpm --filter @protostar/factory-cli run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - Mock package declares `protostar.tier: pure`, `sideEffects: false`, Node `>=22`, and local no-net coverage.
    - `apps/factory-cli/package.json`, `apps/factory-cli/tsconfig.json`, root `tsconfig.json`, `tsconfig.base.json`, and AGENTS.md all reference the mock package.
    - Tier conformance passes with hosted and mock packages included.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement deterministic mock adapter and selector branches</name>
  <read_first>
    - apps/factory-cli/src/wiring/execution-adapter.ts
    - apps/factory-cli/src/wiring/execution-adapter.test.ts
    - packages/execution/src/adapter-contract.ts
    - packages/lmstudio-adapter/src/coder-adapter.ts
    - packages/hosted-llm-adapter/src/coder-adapter.ts
  </read_first>
  <files>packages/mock-llm-adapter/src/index.ts, packages/mock-llm-adapter/src/coder-adapter.ts, packages/mock-llm-adapter/src/coder-adapter.test.ts, apps/factory-cli/src/wiring/execution-adapter.ts, apps/factory-cli/src/wiring/execution-adapter.test.ts</files>
  <action>
    Implement `createMockCoderAdapter({ mode })` where `mode` is `"empty-diff" | "ttt-success" | "transient-failure" | "network-drop" | "llm-timeout"`. Default mode is `"ttt-success"` for stress smokes.
    The mock adapter must emit deterministic adapter events and return a stable `RepoChangeSet` using only in-memory constants. It must not import `node:fs`, `node:http`, `node:https`, `node:net`, or call `fetch`.
    `network-drop` must fail through the same adapter failure/refusal shape that hosted/LM Studio network errors use, with a stable code/message the 11-11 runner can observe as `adapter-network-refusal`. `llm-timeout` must be abortable through the adapter/run `AbortSignal` path so 11-11 can observe `llm-abort-timeout`. Do not add mock modes for `disk-full` or `abort-signal`; those are applied by the 11-11 runner through write-failure and external-signal hooks, not faked by the adapter.
    Update `selectExecutionAdapter` so `"hosted-openai-compatible"` imports/calls `createHostedOpenAiCompatibleCoderAdapter` and `"mock"` imports/calls `createMockCoderAdapter`. Remove temporary `hosted-backend-package-missing` and `mock-backend-package-missing` errors from Plan 11-06.
    Add selector tests for all three literals: `"lmstudio"` still chooses the LM Studio path by default, `"hosted-openai-compatible"` chooses hosted with env-key redaction config, and `"mock"` chooses deterministic mock mode for stress. Add mock adapter tests for `network-drop` and `llm-timeout` proving they produce observable mechanism evidence for 11-11 rather than generic failure/timeout labels.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/mock-llm-adapter test && pnpm --filter @protostar/hosted-llm-adapter test && pnpm --filter @protostar/factory-cli test -- --test-name-pattern "backend|execution adapter" && pnpm run verify</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "hosted-backend-package-missing|mock-backend-package-missing" apps/factory-cli/src` returns no matches.
    - `rg -n "createHostedOpenAiCompatibleCoderAdapter|createMockCoderAdapter" apps/factory-cli/src/wiring/execution-adapter.ts` finds both imports/usages.
    - `rg -n "network-drop|llm-timeout|adapter-network-refusal|llm-abort-timeout" packages/mock-llm-adapter/src apps/factory-cli/src/wiring` finds mock mechanism support and tests.
    - Mock tests are byte-stable across two executions.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| mock adapter -> stress runner | Deterministic output drives stress orchestration without real LLM cost. |
| factory-cli -> execution adapter | Composition root instantiates authority-bearing adapter implementations. |
| workspace manifest -> package refs | Package dependencies and project references determine what factory-cli may import. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-59 | Tampering | mock stress output | mitigate | Mock responses and fault modes are in-memory constants with deterministic tests and no external I/O; 11-11 still requires observed mechanism evidence. |
| T-11-60 | Elevation of Privilege | pure mock package | mitigate | Pure tier, `sideEffects:false`, no-net contract, and no fs/network imports. |
| T-11-61 | Spoofing | backend selector literals | mitigate | Selector tests cover exact literals and reject aliases from Plan 11-06. |
| T-11-62 | Tampering | package-boundary metadata | mitigate | Wire package manifest, app dependency, app tsconfig ref, root refs, and AGENTS tier mirror in the same plan. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/mock-llm-adapter test`, `pnpm --filter @protostar/hosted-llm-adapter test`, `pnpm --filter @protostar/factory-cli test -- --test-name-pattern "backend|execution adapter"`, `pnpm --filter @protostar/admission-e2e test`, and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
The deterministic mock backend exists as an authority-correct pure package, selector wiring resolves hosted and mock packages, and factory-cli package/project references satisfy tier conformance.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-15-SUMMARY.md`.
</output>
