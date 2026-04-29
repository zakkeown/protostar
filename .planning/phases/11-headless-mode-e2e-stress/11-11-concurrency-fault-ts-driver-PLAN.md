---
phase: 11-headless-mode-e2e-stress
plan: 11
type: execute
wave: 5
depends_on:
  - 11-09
  - 11-15
files_modified:
  - packages/stress-harness/package.json
  - packages/stress-harness/tsconfig.json
  - packages/stress-harness/src/index.ts
  - packages/stress-harness/src/fault-application.ts
  - packages/stress-harness/src/fault-application.test.ts
  - packages/stress-harness/src/fault-scenarios.ts
  - packages/stress-harness/src/fault-scenarios.test.ts
  - packages/stress-harness/src/no-net.contract.test.ts
  - apps/factory-cli/src/scripts/stress.ts
  - apps/factory-cli/src/scripts/stress.test.ts
  - apps/factory-cli/package.json
  - apps/factory-cli/tsconfig.json
  - tsconfig.json
  - tsconfig.base.json
  - AGENTS.md
  - pnpm-lock.yaml
autonomous: true
requirements:
  - STRESS-13
must_haves:
  truths:
    - "TypeScript runner owns concurrency and fault-injection shapes."
    - "Parallel runs use distinct branch/session/run identifiers."
    - "Injected faults produce structured refusal or wedge evidence without corrupting stress artifacts."
    - "Concurrency and fault runs consume materialized draft plus signed confirmed-intent inputs before invoking the factory."
    - "Fault-injection evidence covers all four locked scenarios with observed mechanisms, not labels: network-drop, llm-timeout, disk-full, and abort-signal."
  artifacts:
    - path: "apps/factory-cli/src/scripts/stress.ts"
      provides: "TS stress runner for concurrency and fault-injection"
      contains: "fault-injection"
    - path: "packages/stress-harness/src/fault-scenarios.ts"
      provides: "pure fault scenario definitions"
      contains: "network-drop"
    - path: "packages/stress-harness/src/fault-application.ts"
      provides: "scenario-to-mechanism applyFaultInjection contract"
      contains: "applyFaultInjection"
    - path: "apps/factory-cli/src/scripts/stress.test.ts"
      provides: "worker/concurrency, fault mechanism, and stop-the-world tests"
      contains: "adapter-network-refusal"
  key_links:
    - from: "apps/factory-cli/src/scripts/stress.ts"
      to: "apps/factory-cli/src/stress/stress-session.ts"
      via: "shared session report/event functions"
      pattern: "appendStressEvent"
    - from: "apps/factory-cli/src/scripts/stress.ts"
      to: "apps/factory-cli/src/stress/seed-materialization.ts"
      via: "prepareStressRunInput before each factory run"
      pattern: "prepareStressRunInput"
    - from: "apps/factory-cli/src/scripts/stress.ts"
      to: "packages/stress-harness/src/fault-application.ts"
      via: "applyFaultInjection dispatches each scenario to a concrete mechanism hook"
      pattern: "applyFaultInjection"
    - from: "apps/factory-cli/src/scripts/stress.ts"
      to: "packages/mock-llm-adapter/src/coder-adapter.ts"
      via: "network-drop and llm-timeout mock modes for adapter/network refusal and abortable timeout"
      pattern: "PROTOSTAR_MOCK_LLM_MODE"
---

<objective>
Add the TypeScript stress runner for concurrency and fault injection.

Purpose: bash cannot safely own worker pools, cancellation, and chaos injection; TS gets those shapes while sharing Plan 11-09 evidence code.
Output: pure stress-harness package, TS runner, tests, and package wiring.
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
@apps/factory-cli/src/stress/stress-session.ts
@apps/factory-cli/src/run-liveness.ts
@apps/factory-cli/src/commands/__stress-step.ts
@packages/execution/src/adapter-contract.ts
@packages/mock-llm-adapter/src/coder-adapter.ts
@packages/stress-harness/src/fault-application.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create pure stress-harness scenario contracts</name>
  <read_first>
    - packages/artifacts/src/no-net.contract.test.ts
    - packages/admission-e2e/src/tier-conformance.contract.test.ts
    - packages/execution/src/adapter-contract.ts
  </read_first>
  <files>packages/stress-harness/package.json, packages/stress-harness/tsconfig.json, packages/stress-harness/src/index.ts, packages/stress-harness/src/fault-scenarios.ts, packages/stress-harness/src/fault-scenarios.test.ts, packages/stress-harness/src/fault-application.ts, packages/stress-harness/src/fault-application.test.ts, packages/stress-harness/src/no-net.contract.test.ts, tsconfig.json, tsconfig.base.json, AGENTS.md, pnpm-lock.yaml</files>
  <action>
    Add `@protostar/stress-harness` as a pure package with `"protostar": { "tier": "pure" }`, `"sideEffects": false`, `"engines": { "node": ">=22" }`, and no runtime external dependencies.
    Export `FaultScenario` literals exactly `"network-drop" | "llm-timeout" | "disk-full" | "abort-signal"` and `StressShape` literals exactly `"concurrency" | "fault-injection"`.
    Export `planFaultInjections({ scenario, runs })` returning deterministic run-indexed injection descriptors with no fs/network side effects.
    Add `packages/stress-harness/src/fault-application.ts` exporting `FaultMechanism` literals exactly `"adapter-network-refusal" | "llm-abort-timeout" | "disk-write-enospc" | "external-abort-signal"`, `FaultObservation`, and `applyFaultInjection(descriptor, hooks)`. The harness package remains pure: `applyFaultInjection` may only call injected hook functions and return their `FaultObservation`; it must not import fs, path, net, http, child_process, timers/promises, or fetch.
    Map scenarios to hooks exactly: `network-drop -> hooks.adapterNetworkRefusal`, `llm-timeout -> hooks.llmTimeoutAbortSignal`, `disk-full -> hooks.diskWriteEnospc`, `abort-signal -> hooks.externalAbortSignal`. Tests must fail if a scenario is merely echoed as a label without invoking its hook.
    Add no-net contract and tests covering determinism, invalid scenario refusal, and all four required scenarios.
    Add root `tsconfig.json` reference and `tsconfig.base.json` path alias/export for `@protostar/stress-harness`. Update AGENTS.md Authority Tiers so `@protostar/stress-harness` appears under pure (`fs-forbidden`, `network-forbidden`).
    Run `pnpm install --lockfile-only` after adding the workspace package so `pnpm-lock.yaml` records the `packages/stress-harness` importer even though the package has no external runtime dependencies.
  </action>
  <verify>
    <automated>pnpm install --lockfile-only && pnpm --filter @protostar/stress-harness test && pnpm --filter @protostar/admission-e2e test && rg -n "packages/stress-harness|@protostar/stress-harness" pnpm-lock.yaml tsconfig.json tsconfig.base.json AGENTS.md</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "network-drop|llm-timeout|disk-full|abort-signal|adapter-network-refusal|llm-abort-timeout|disk-write-enospc|external-abort-signal|applyFaultInjection" packages/stress-harness/src` finds scenario definitions, mechanism mapping, and tests.
    - Tier conformance passes for the new pure package.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pin TS runner concurrency and stop-the-world behavior</name>
  <read_first>
    - apps/factory-cli/src/stress/stress-session.ts
    - apps/factory-cli/src/run-liveness.ts
    - apps/factory-cli/src/commands/status.ts
    - packages/stress-harness/src/fault-scenarios.ts
  </read_first>
  <files>apps/factory-cli/src/scripts/stress.test.ts</files>
  <action>
    Add tests for `runStressScript` or the exported runner core before implementation.
    Concurrency test: `--shape concurrency --sessions 2 --concurrency 2 --llm-backend mock` starts two run attempts with distinct branch suffixes matching `^[a-zA-Z0-9._/-]+$` and writes two per-run rows.
    Fault mechanism tests must exercise `applyFaultInjection` through the runner, not by writing labels:
    `network-drop` must configure the factory invocation with mock adapter mode `network-drop` (or the equivalent hosted/LM Studio network-drop hook) and observe a typed adapter/network refusal with mechanism `adapter-network-refusal`.
    `llm-timeout` must configure mock adapter mode `llm-timeout`, create an `AbortController`, pass its `signal` to the spawned factory process or adapter call, trigger the timeout, and observe mechanism `llm-abort-timeout`.
    `disk-full` must inject a session-scoped write failure at the artifact/write boundary that throws an error with `code: "ENOSPC"` and observe mechanism `disk-write-enospc`; a plain failed run without an ENOSPC/write-failure observation is not sufficient.
    `abort-signal` must launch a real or fake child-process runner with an external abort signal (`SIGINT` or AbortController abort), observe the child cancellation path, and record mechanism `external-abort-signal`.
    Fault coverage test: running the exported fault runner core for `network-drop`, `llm-timeout`, `disk-full`, and `abort-signal` records one `fault-observed` event for each scenario with `{ observed: true, mechanism }`, and never reports `stressClean` unless all four observed mechanisms are present.
    Input-preparation test: every concurrency/fault worker calls `prepareStressRunInput` and passes its returned `draftPath` and `confirmedIntentPath` into the factory run invocation.
    Wedge test: a simulated stale run causes `writeWedgeEvidence` and aborts the session immediately.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test -- --test-name-pattern "stress"</automated>
  </verify>
  <acceptance_criteria>
    - Tests fail before `apps/factory-cli/src/scripts/stress.ts` exists.
    - Tests assert no shared temp/report path between concurrent workers.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Implement TS stress runner and package script</name>
  <read_first>
    - apps/factory-cli/src/scripts/stress.test.ts
    - apps/factory-cli/src/stress/stress-session.ts
    - packages/stress-harness/src/index.ts
    - apps/factory-cli/package.json
  </read_first>
  <files>apps/factory-cli/src/scripts/stress.ts, apps/factory-cli/src/scripts/stress.test.ts, apps/factory-cli/package.json, apps/factory-cli/tsconfig.json</files>
  <action>
    Implement `apps/factory-cli/src/scripts/stress.ts` as an executable built with the factory-cli package.
    Supported flags: `--shape concurrency|fault-injection`, `--sessions <n>` default `2`, `--concurrency <n>` default `2`, `--runs <n>` default `1`, `--scenario network-drop|llm-timeout|disk-full|abort-signal`, `--llm-backend <backend>` default `mock`, `--headless-mode <mode>` default `local-daemon`, `--max-sessions <n>` default `20`, `--max-faults <n>` default `100`, `--max-wall-clock-days <n>` default `3`, and `--seed-archetypes <csv>` default `cosmetic-tweak,feature-add`.
    Refuse `--shape sustained-load` with message `Use scripts/stress.sh for sustained-load`.
    Use Plan 11-09 session helpers directly rather than writing JSON by hand. Before every factory run, call `prepareStressRunInput({ sessionId, runId, seedArchetypes, runIndex })` from `apps/factory-cli/src/stress/seed-materialization.ts` and consume its returned `draftPath` and `confirmedIntentPath`.
    Import `applyFaultInjection` from `@protostar/stress-harness` and route every fault-injection run through it before/around factory invocation. The runner must append a `fault-applied` event before the mechanism is triggered and a `fault-observed` event only after the intended mechanism is actually observed. `perRun.faultInjected` may still carry the scenario label, but it is not the completion evidence.
    Implement mechanism hooks in `apps/factory-cli/src/scripts/stress.ts`:
    - `adapterNetworkRefusal`: run the factory with `PROTOSTAR_MOCK_LLM_MODE=network-drop` when `--llm-backend mock` is selected; success evidence is a typed adapter/network refusal event or error code, recorded as `mechanism: "adapter-network-refusal"`.
    - `llmTimeoutAbortSignal`: run the factory with `PROTOSTAR_MOCK_LLM_MODE=llm-timeout`, create an `AbortController`, pass its signal to the child-process runner or adapter call, abort at the configured timeout, and record `mechanism: "llm-abort-timeout"` only if the signal was observed by the run path.
    - `diskWriteEnospc`: inject an ENOSPC write failure at a session-scoped artifact/write boundary used by the stress runner or factory output path, then record `mechanism: "disk-write-enospc"` only if the thrown error has `code === "ENOSPC"` or the normalized refusal code is `disk-write-enospc`.
    - `externalAbortSignal`: start the factory run and then deliver an external abort (`SIGINT` or AbortController abort) from the stress runner; record `mechanism: "external-abort-signal"` only if the child process or run status transitions through the cancellation path.
    Generate distinct branches as `protostar/${sessionId}/${workerIndex}-${runIndex}` and validate the Phase 7 regex before invoking factory runs.
    Invoke the factory through the same exact installed-command flag set as the bash driver:
    `protostar-factory run --draft "$DRAFT_PATH" --confirmed-intent "$CONFIRMED_INTENT_PATH" --out .protostar/runs --executor real --planning-mode live --review-mode live --delivery-mode auto --trust trusted --run-id "$RUN_ID" --intent-mode brownfield --llm-backend "$LLM_BACKEND" --headless-mode "$HEADLESS_MODE" --non-interactive`.
    In repo-local smokes, the runner may spawn `node apps/factory-cli/dist/main.js run` followed by the identical flags.
    Do not call `run` with raw seeds or unsigned drafts.
    Add `@protostar/stress-harness` to `apps/factory-cli/package.json` dependencies and `apps/factory-cli/tsconfig.json` references.
    Add `factory-cli` package script `"stress": "node dist/scripts/stress.js"` or equivalent package-local script after build.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/stress-harness test && pnpm --filter @protostar/factory-cli test -- --test-name-pattern "stress" && node apps/factory-cli/dist/scripts/stress.js --shape concurrency --sessions 2 --concurrency 2 --llm-backend mock && node apps/factory-cli/dist/scripts/stress.js --shape fault-injection --scenario llm-timeout --runs 1 --llm-backend mock</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "Use scripts/stress.sh for sustained-load|fault-injection|prepareStressRunInput|applyFaultInjection|fault-observed|adapter-network-refusal|llm-abort-timeout|disk-write-enospc|external-abort-signal|--draft|--confirmed-intent|writeWedgeEvidence|protostar/\\$\\{sessionId\\}" apps/factory-cli/src/scripts/stress.ts apps/factory-cli/src/scripts/stress.test.ts` finds required implementation and tests.
    - `rg -n "network-drop|llm-timeout|disk-full|abort-signal|applyFaultInjection" apps/factory-cli/src/scripts/stress.ts apps/factory-cli/src/scripts/stress.test.ts packages/stress-harness/src` finds all four locked scenarios and actual application wiring.
    - Mock concurrency smoke exits 0 and writes a stress report under `.protostar/stress/<sessionId>/`.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| TS runner flags -> concurrent factory runs | Operator flags control worker count, branch naming, and fault scenarios. |
| fault harness -> adapters/subprocesses/writers | Injected faults alter adapter, subprocess, abort-signal, or write behavior for stress only. |
| concurrent workers -> shared evidence | Multiple workers append to the same session. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-41 | Denial of Service | concurrency worker pool | mitigate | Defaults K=2, cap sessions at 20, stop on first wedge. |
| T-11-42 | Tampering | branch names | mitigate | Generate distinct names and validate Phase 7 regex before run invocation. |
| T-11-43 | Tampering | concurrent report writes | mitigate | Use Plan 11-09 write chains and session-scoped paths. |
| T-11-44 | Repudiation | injected faults | mitigate | Every injected fault records both label and observed mechanism through `fault-applied` and `fault-observed` events; final gate rejects labels without observed mechanisms. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/stress-harness test`, `pnpm --filter @protostar/factory-cli test -- --test-name-pattern "stress"`, the mock concurrency smoke, and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
Concurrency and fault-injection stress can run through a typed TS runner with deterministic mock support, session-scoped evidence, observed fault mechanisms, and stop-the-world wedge handling.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-11-SUMMARY.md`.
</output>
