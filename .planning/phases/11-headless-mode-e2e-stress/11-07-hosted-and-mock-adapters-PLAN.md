---
phase: 11-headless-mode-e2e-stress
plan: 07
type: execute
wave: 3
depends_on:
  - 11-06
files_modified:
  - packages/hosted-llm-adapter/package.json
  - packages/hosted-llm-adapter/tsconfig.json
  - packages/hosted-llm-adapter/src/index.ts
  - packages/hosted-llm-adapter/src/hosted-openai-client.ts
  - packages/hosted-llm-adapter/src/hosted-openai-client.test.ts
  - packages/hosted-llm-adapter/src/coder-adapter.ts
  - packages/hosted-llm-adapter/src/coder-adapter.test.ts
  - packages/hosted-llm-adapter/src/no-fs.contract.test.ts
  - apps/factory-cli/package.json
  - apps/factory-cli/tsconfig.json
  - tsconfig.json
  - tsconfig.base.json
  - AGENTS.md
  - pnpm-lock.yaml
autonomous: true
requirements:
  - STRESS-08
must_haves:
  truths:
    - "Hosted backend implements the existing ExecutionAdapter contract with env-referenced secrets only."
    - "The hosted package is domain-network tier, has no filesystem/path authority, and ships a local no-fs contract."
    - "Factory-cli manifest/project references know about the hosted package before selector wiring imports it."
  artifacts:
    - path: "packages/hosted-llm-adapter/src/no-fs.contract.test.ts"
      provides: "network package no-fs invariant"
      contains: "node:fs"
    - path: "packages/hosted-llm-adapter/src/hosted-openai-client.ts"
      provides: "OpenAI-compatible hosted chat client"
      contains: "chat/completions"
    - path: "AGENTS.md"
      provides: "human-readable tier mirror for @protostar/hosted-llm-adapter"
      contains: "@protostar/hosted-llm-adapter"
  key_links:
    - from: "packages/hosted-llm-adapter/src/coder-adapter.ts"
      to: "packages/execution/src/adapter-contract.ts"
      via: "implements ExecutionAdapter"
      pattern: "ExecutionAdapter"
    - from: "apps/factory-cli/package.json"
      to: "packages/hosted-llm-adapter/package.json"
      via: "workspace dependency for later selector wiring"
      pattern: "@protostar/hosted-llm-adapter"
---

<objective>
Add the hosted OpenAI-compatible execution adapter as a sibling network package.

Purpose: GitHub-hosted headless mode needs a hosted backend while LM Studio remains the default and native Anthropic stays out of Phase 11.
Output: hosted adapter package, tier contracts, workspace/package references, and AGENTS tier mirror updates.
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
@packages/lmstudio-adapter/src/lmstudio-client.ts
@packages/lmstudio-adapter/src/coder-adapter.ts
@packages/lmstudio-adapter/src/no-fs.contract.test.ts
@packages/admission-e2e/src/tier-conformance.contract.test.ts
@apps/factory-cli/package.json
@apps/factory-cli/tsconfig.json
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Scaffold hosted adapter package and tier wiring</name>
  <read_first>
    - packages/lmstudio-adapter/package.json
    - packages/lmstudio-adapter/src/no-fs.contract.test.ts
    - packages/execution/src/adapter-contract.ts
    - packages/admission-e2e/src/tier-conformance.contract.test.ts
    - AGENTS.md
  </read_first>
  <files>packages/hosted-llm-adapter/package.json, packages/hosted-llm-adapter/tsconfig.json, packages/hosted-llm-adapter/src/no-fs.contract.test.ts, apps/factory-cli/package.json, apps/factory-cli/tsconfig.json, tsconfig.json, tsconfig.base.json, AGENTS.md, pnpm-lock.yaml</files>
  <action>
    Add `@protostar/hosted-llm-adapter` with `"protostar": { "tier": "network" }`, `"engines": { "node": ">=22" }`, build/test/typecheck scripts, and workspace dependencies only. Do not add OpenAI, Anthropic, or other provider SDK dependencies; use Node 22 `fetch`.
    Add package-local `src/no-fs.contract.test.ts` following the `@protostar/lmstudio-adapter` regex scan pattern and asserting zero `node:fs`, `node:fs/promises`, `fs`, `node:path`, or `path` imports in production `src/`.
    Add root `tsconfig.json` reference and `tsconfig.base.json` path alias/export for `@protostar/hosted-llm-adapter`.
    Add `@protostar/hosted-llm-adapter` to `apps/factory-cli/package.json` dependencies and `apps/factory-cli/tsconfig.json` references so Plan 11-15 can import it without manifest/reference drift.
    Update AGENTS.md Authority Tiers so `@protostar/hosted-llm-adapter` appears under domain network (`network-permitted`, `fs-forbidden`). Run `pnpm install` if the workspace lockfile needs the new workspace package entry; do not add external runtime dependencies.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/hosted-llm-adapter test && pnpm --filter @protostar/admission-e2e test && pnpm --filter @protostar/factory-cli run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - Hosted package declares `protostar.tier: network`, Node `>=22`, and local no-fs coverage.
    - `apps/factory-cli/package.json`, `apps/factory-cli/tsconfig.json`, root `tsconfig.json`, `tsconfig.base.json`, and AGENTS.md all reference the hosted package.
    - Tier conformance passes with the hosted package included.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement hosted OpenAI-compatible adapter with secret redaction</name>
  <read_first>
    - packages/lmstudio-adapter/src/lmstudio-client.ts
    - packages/lmstudio-adapter/src/coder-adapter.ts
    - packages/lmstudio-adapter/src/diff-parser.ts
    - packages/execution/src/adapter-contract.ts
  </read_first>
  <files>packages/hosted-llm-adapter/src/index.ts, packages/hosted-llm-adapter/src/hosted-openai-client.ts, packages/hosted-llm-adapter/src/hosted-openai-client.test.ts, packages/hosted-llm-adapter/src/coder-adapter.ts, packages/hosted-llm-adapter/src/coder-adapter.test.ts</files>
  <action>
    Write failing tests first for success, HTTP 401 with redaction, timeout abort, malformed response, and fake-secret leakage.
    Implement `createHostedOpenAiCompatibleCoderAdapter` returning `ExecutionAdapter`.
    Config fields are `baseUrl`, `model`, `apiKeyEnv`, `temperature`, `topP`, and optional `timeoutMs`; default `apiKeyEnv` is `PROTOSTAR_HOSTED_LLM_API_KEY`.
    Resolve the API key from injected env at adapter construction. Never include the key value in thrown errors, adapter events, stress reports, event lines, or snapshots; redact as `<redacted:PROTOSTAR_HOSTED_LLM_API_KEY>`.
    Use OpenAI-compatible `/chat/completions` JSON or SSE shape compatible with the existing LM Studio client. Parse fenced diffs through the existing diff parser pattern; do not duplicate prompt safety rules if they can be imported from LM Studio without creating a forbidden dependency.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/hosted-llm-adapter test</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "PROTOSTAR_HOSTED_LLM_API_KEY|<redacted:PROTOSTAR_HOSTED_LLM_API_KEY>|chat/completions" packages/hosted-llm-adapter/src` finds implementation/tests.
    - Tests prove a fake key string never appears in error messages or adapter event payloads.
    - Native Anthropic provider logic and SDK dependencies are absent from Phase 11.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| hosted adapter -> external API | Hosted backend sends prompt/diff context to operator-selected OpenAI-compatible endpoint. |
| env -> adapter config | Secret API key enters runtime through environment lookup. |
| workspace manifest -> factory-cli import graph | Package manifests and project refs determine whether orchestration may import hosted code. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-25 | Information Disclosure | hosted API key | mitigate | Read key from `apiKeyEnv`, redact value in every error/event, and add tests with fake secret. |
| T-11-26 | Elevation of Privilege | network adapter package | mitigate | Hosted package is network tier with no-fs contract and no filesystem/path imports. |
| T-11-27 | Tampering | package-boundary metadata | mitigate | Wire package manifest, app dependency, app tsconfig ref, root refs, and AGENTS tier mirror in the same plan. |
| T-11-28 | Denial of Service | hosted timeout | mitigate | Adapter supports `AbortSignal`/timeout and maps timeout to typed adapter failure. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/hosted-llm-adapter test`, `pnpm --filter @protostar/factory-cli run typecheck`, `pnpm --filter @protostar/admission-e2e test`, and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
The hosted OpenAI-compatible backend exists as an authority-correct network package, secrets are redacted, package wiring is complete, and LM Studio remains the default.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-07-SUMMARY.md`.
</output>
