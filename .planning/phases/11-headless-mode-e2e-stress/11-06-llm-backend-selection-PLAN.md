---
phase: 11-headless-mode-e2e-stress
plan: 06
type: execute
wave: 2
depends_on:
  - 11-05
files_modified:
  - packages/lmstudio-adapter/src/factory-config.ts
  - packages/lmstudio-adapter/src/factory-config.schema.json
  - packages/lmstudio-adapter/src/factory-config.test.ts
  - apps/factory-cli/src/wiring/execution-adapter.ts
  - apps/factory-cli/src/wiring/execution-adapter.test.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/commands/run.ts
  - apps/factory-cli/src/load-factory-config.ts
autonomous: true
requirements:
  - STRESS-06
must_haves:
  truths:
    - "LM Studio remains the default execution backend."
    - "Backend choice is explicit through config and `--llm-backend`."
    - "Factory composition depends only on the existing `ExecutionAdapter` contract."
  artifacts:
    - path: "apps/factory-cli/src/wiring/execution-adapter.ts"
      provides: "composition-root backend selector"
      contains: "lmstudio"
    - path: "packages/lmstudio-adapter/src/factory-config.ts"
      provides: "llm backend config type and defaults"
      contains: "hosted-openai-compatible"
    - path: "apps/factory-cli/src/main.ts"
      provides: "factory run composition uses selector instead of direct LM Studio instantiation"
      contains: "selectExecutionAdapter"
  key_links:
    - from: "apps/factory-cli/src/commands/run.ts"
      to: "apps/factory-cli/src/wiring/execution-adapter.ts"
      via: "`--llm-backend` override in run options"
      pattern: "llmBackend"
    - from: "apps/factory-cli/src/wiring/execution-adapter.ts"
      to: "packages/execution/src/adapter-contract.ts"
      via: "returned ExecutionAdapter"
      pattern: "ExecutionAdapter"
---

<objective>
Add LLM backend selection without renaming or weakening the existing LM Studio adapter.

Purpose: Phase 11 needs hosted and mock backends, but the execution boundary remains the existing `ExecutionAdapter` contract and LM Studio remains the default.
Output: config enum, CLI flag, and factory-cli adapter selector.
</objective>

<execution_context>
@/Users/zakkeown/.codex/get-shit-done/workflows/execute-plan.md
@/Users/zakkeown/.codex/get-shit-done/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
@.planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md
@.planning/phases/11-headless-mode-e2e-stress/11-PATTERNS.md
@packages/execution/src/adapter-contract.ts
@packages/lmstudio-adapter/src/factory-config.ts
@packages/lmstudio-adapter/src/coder-adapter.ts
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/wiring/preflight.ts
@apps/factory-cli/src/commands/run.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pin backend selector behavior before composition changes</name>
  <read_first>
    - packages/lmstudio-adapter/src/factory-config.test.ts
    - apps/factory-cli/src/wiring/preflight.test.ts
    - apps/factory-cli/src/main.test.ts
    - packages/execution/src/adapter-contract.ts
  </read_first>
  <files>packages/lmstudio-adapter/src/factory-config.test.ts, apps/factory-cli/src/wiring/execution-adapter.test.ts, apps/factory-cli/src/main.test.ts</files>
  <action>
    Add tests for `factory.llmBackend` enum values exactly `"lmstudio"`, `"hosted-openai-compatible"`, and `"mock"` with default `"lmstudio"`.
    Add selector tests for `selectExecutionAdapter({ backend: "lmstudio" })` returning an object that satisfies `ExecutionAdapter` and calls the existing LM Studio factory.
    Add failure tests for `"openai"` and `"anthropic"` aliases; those are not Phase 11 literals.
    Add a main composition regression proving a run with no `--llm-backend` still chooses LM Studio.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/lmstudio-adapter test && pnpm --filter @protostar/factory-cli test -- --test-name-pattern "backend|execution adapter|main"</automated>
  </verify>
  <acceptance_criteria>
    - Tests fail before implementing `factory.llmBackend` and `selectExecutionAdapter`.
    - The literal default `"lmstudio"` appears in config tests.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Implement config, CLI, and composition-root backend selection</name>
  <read_first>
    - packages/lmstudio-adapter/src/factory-config.ts
    - packages/lmstudio-adapter/src/factory-config.schema.json
    - apps/factory-cli/src/commands/run.ts
    - apps/factory-cli/src/load-factory-config.ts
    - apps/factory-cli/src/main.ts
  </read_first>
  <files>packages/lmstudio-adapter/src/factory-config.ts, packages/lmstudio-adapter/src/factory-config.schema.json, apps/factory-cli/src/wiring/execution-adapter.ts, apps/factory-cli/src/main.ts, apps/factory-cli/src/commands/run.ts, apps/factory-cli/src/load-factory-config.ts</files>
  <action>
    Extend the `factory` config block from Plan 11-05 with `llmBackend: "lmstudio" | "hosted-openai-compatible" | "mock"` and default `"lmstudio"`. Add the same enum to `factory-config.schema.json` with `additionalProperties: false`.
    Add `--llm-backend <backend>` to `protostar-factory run`; CLI override precedence is CLI > config file > default.
    Create `apps/factory-cli/src/wiring/execution-adapter.ts` exporting `selectExecutionAdapter`. For `"lmstudio"`, call the existing `createLmstudioCoderAdapter` path. For `"hosted-openai-compatible"` and `"mock"`, return a structured unavailable result or throw a typed composition error with codes `hosted-backend-package-missing` and `mock-backend-package-missing` until Plan 11-07 lands the hosted package and Plan 11-15 lands the mock package plus selector imports. Do not import nonexistent packages in this plan.
    Replace direct LM Studio adapter construction in `apps/factory-cli/src/main.ts` with `selectExecutionAdapter` while preserving existing preflight behavior for LM Studio.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test && pnpm --filter @protostar/lmstudio-adapter test</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n '"lmstudio"|"hosted-openai-compatible"|"mock"|--llm-backend|selectExecutionAdapter' packages/lmstudio-adapter/src apps/factory-cli/src` finds all selector surfaces.
    - No package named `@protostar/llm-adapter` is created and `@protostar/lmstudio-adapter` is not renamed.
    - Existing LM Studio tests pass unchanged.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| config/CLI -> network backend | Operator selection controls which adapter may call an external API. |
| factory-cli -> execution adapter | Composition root instantiates authority-bearing adapter implementations. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-21 | Spoofing | `--llm-backend` | mitigate | Strict enum rejects provider aliases and typos. |
| T-11-22 | Information Disclosure | hosted backend selection | mitigate | This plan selects backend only; Plan 11-07 must keep API keys env-only and redacted. |
| T-11-23 | Elevation of Privilege | adapter composition | mitigate | Selection remains in `apps/factory-cli`, not pure packages or Dogpile. |
| T-11-24 | Denial of Service | missing backend packages | mitigate | Non-LM Studio values produce typed unavailable errors until Plans 11-07 and 11-15 implement them. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/factory-cli test`, `pnpm --filter @protostar/lmstudio-adapter test`, `pnpm run factory`, and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
Backend choice is explicit and tested, LM Studio remains default, and no new adapter package is required until Plans 11-07 and 11-15.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-06-SUMMARY.md`.
</output>
