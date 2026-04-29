---
phase: 11-headless-mode-e2e-stress
plan: 05
type: execute
wave: 1
depends_on:
  - 11-01
files_modified:
  - packages/lmstudio-adapter/src/factory-config.ts
  - packages/lmstudio-adapter/src/factory-config.schema.json
  - packages/lmstudio-adapter/src/factory-config.test.ts
  - apps/factory-cli/src/commands/run.ts
  - apps/factory-cli/src/cli-args.ts
  - apps/factory-cli/src/load-factory-config.ts
  - apps/factory-cli/src/load-factory-config.test.ts
  - apps/factory-cli/src/commands/run.test.ts
  - docs/headless/github-hosted.md
  - docs/headless/self-hosted-runner.md
  - docs/headless/local-daemon.md
  - scripts/protostar-local-daemon.launchd.plist
autonomous: true
requirements:
  - STRESS-05
  - STRESS-11
must_haves:
  truths:
    - "Factory config accepts exactly three headless modes."
    - "`protostar-factory run` accepts `--headless-mode` and preserves stdout/stderr discipline."
    - "Headless mode defaults do not change ordinary LM Studio local runs."
    - "`factory.stress.caps.*` carries Q-03 defaults, including TTT 50 attempts / 14 days."
    - "All three headless modes have concrete setup paths documented before contracts consume them."
  artifacts:
    - path: "packages/lmstudio-adapter/src/factory-config.schema.json"
      provides: "schema enum for factory.headlessMode"
      contains: "github-hosted"
    - path: "apps/factory-cli/src/commands/run.ts"
      provides: "commander flag for --headless-mode"
      contains: "--headless-mode"
    - path: "apps/factory-cli/src/load-factory-config.ts"
      provides: "resolved config precedence"
      contains: "headlessMode"
    - path: "docs/headless/self-hosted-runner.md"
      provides: "self-hosted runner setup path"
      contains: "self-hosted-runner"
    - path: "scripts/protostar-local-daemon.launchd.plist"
      provides: "local-daemon setup artifact for macOS unattended runs"
      contains: "protostar-factory"
  key_links:
    - from: "apps/factory-cli/src/commands/run.ts"
      to: "packages/lmstudio-adapter/src/factory-config.ts"
      via: "CLI override takes precedence over config file"
      pattern: "headlessMode"
    - from: "packages/lmstudio-adapter/src/factory-config.schema.json"
      to: "apps/factory-cli/src/load-factory-config.ts"
      via: "same enum literals"
      pattern: "self-hosted-runner"
    - from: "packages/lmstudio-adapter/src/factory-config.schema.json"
      to: "apps/factory-cli/src/load-factory-config.ts"
      via: "factory.stress.caps defaults resolved before runners apply CLI overrides"
      pattern: "tttDelivery"
    - from: "docs/headless/local-daemon.md"
      to: "scripts/protostar-local-daemon.launchd.plist"
      via: "documented local daemon install path references checked-in plist"
      pattern: "protostar-local-daemon.launchd.plist"
---

<objective>
Add the Phase 11 headless-mode selector to config and CLI.

Purpose: GH-hosted CI, self-hosted runner, and local daemon flows must be explicit and non-interactive without changing default local behavior.
Output: config schema/types, CLI flag, resolver tests.
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
@packages/lmstudio-adapter/src/factory-config.ts
@packages/lmstudio-adapter/src/factory-config.schema.json
@apps/factory-cli/src/commands/run.ts
@apps/factory-cli/src/cli-args.ts
@apps/factory-cli/src/load-factory-config.ts
@docs/cli/run.txt
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pin headless config and CLI precedence tests</name>
  <read_first>
    - packages/lmstudio-adapter/src/factory-config.test.ts
    - apps/factory-cli/src/load-factory-config.test.ts
    - apps/factory-cli/src/commands/run.ts
    - apps/factory-cli/src/cli-args.test.ts
  </read_first>
  <files>packages/lmstudio-adapter/src/factory-config.test.ts, apps/factory-cli/src/load-factory-config.test.ts, apps/factory-cli/src/commands/run.test.ts, apps/factory-cli/src/cli-args.test.ts</files>
  <action>
    Add tests that the default resolved config contains `factory.headlessMode: "local-daemon"` and `factory.nonInteractive: false`.
    Add config-file tests accepting exactly `"github-hosted"`, `"self-hosted-runner"`, and `"local-daemon"` and rejecting `"dashboard"` and `"ci"`.
    Add config-file tests for `factory.stress.caps` defaults and overrides. Defaults must be exact: `tttDelivery.maxAttempts: 50`, `tttDelivery.maxWallClockDays: 14`, `sustainedLoad.maxRuns: 500`, `sustainedLoad.maxWallClockDays: 7`, `concurrency.maxSessions: 20`, `concurrency.maxWallClockDays: 3`, `faultInjection.maxFaults: 100`, and `faultInjection.maxWallClockDays: 3`.
    Add tests rejecting zero, negative, non-integer, and unknown cap fields; `additionalProperties: false` must apply at every stress caps object.
    Add CLI tests that `--headless-mode github-hosted` overrides config, preserves `stdout=data` behavior, and does not write help text to stdout.
    Add `--non-interactive` parsing tests that set `factory.nonInteractive: true` in run options.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/lmstudio-adapter test && pnpm --filter @protostar/factory-cli test -- --test-name-pattern "headless|cli args|factory config"</automated>
  </verify>
  <acceptance_criteria>
    - Tests fail before schema/CLI implementation.
    - Invalid literals `dashboard` and `ci` are explicitly rejected.
    - Tests name `tttDelivery.maxAttempts` and the exact defaults `50` and `14`.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Implement `factory.headlessMode` and run flag wiring</name>
  <read_first>
    - packages/lmstudio-adapter/src/factory-config.ts
    - packages/lmstudio-adapter/src/factory-config.schema.json
    - apps/factory-cli/src/commands/run.ts
    - apps/factory-cli/src/load-factory-config.ts
  </read_first>
  <files>packages/lmstudio-adapter/src/factory-config.ts, packages/lmstudio-adapter/src/factory-config.schema.json, apps/factory-cli/src/commands/run.ts, apps/factory-cli/src/cli-args.ts, apps/factory-cli/src/load-factory-config.ts</files>
  <action>
    Add `HeadlessMode = "github-hosted" | "self-hosted-runner" | "local-daemon"` and a top-level `factory` config block with fields `headlessMode` and `nonInteractive`.
    Default `factory.headlessMode` to `"local-daemon"` and `factory.nonInteractive` to `false`.
    Add JSON schema `factory` object with `additionalProperties: false`, enum values exactly above, and default-compatible optional fields.
    Add nested `factory.stress.caps` config with defaults required by Q-03:
    `tttDelivery: { maxAttempts: 50, maxWallClockDays: 14 }`,
    `sustainedLoad: { maxRuns: 500, maxWallClockDays: 7 }`,
    `concurrency: { maxSessions: 20, maxWallClockDays: 3 }`,
    `faultInjection: { maxFaults: 100, maxWallClockDays: 3 }`.
    Keep this as config/schema/default resolution only; Plan 11-09 applies stress-shape caps and Plan 11-14 applies TTT delivery caps.
    Add commander flags on `run`: `--headless-mode <mode>` and `--non-interactive`. CLI override precedence is CLI > config file > defaults.
    Reject invalid CLI values with `ExitCode.Usage` or the existing usage-code pattern, and produce canonical JSON on `--json` failure if the run command already supports it.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/lmstudio-adapter test && pnpm --filter @protostar/factory-cli test</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n '"github-hosted"|"self-hosted-runner"|"local-daemon"|--headless-mode|--non-interactive|tttDelivery|maxAttempts|maxWallClockDays|faultInjection' packages/lmstudio-adapter/src apps/factory-cli/src` finds schema, types, caps, and CLI wiring.
    - Existing local LM Studio tests still pass without setting any new config.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Add all-three headless setup docs and local daemon artifact</name>
  <read_first>
    - docs/cli/run.txt
    - .github/workflows/verify.yml
    - .planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
  </read_first>
  <files>docs/headless/github-hosted.md, docs/headless/self-hosted-runner.md, docs/headless/local-daemon.md, scripts/protostar-local-daemon.launchd.plist</files>
  <action>
    Add three setup documents, one per locked Q-04 mode. Each document must include the exact mode literal, exact command shape using `protostar-factory run --headless-mode <mode> --non-interactive`, required environment/config inputs, evidence path `.protostar/stress/<sessionId>/events.jsonl`, and a failure posture that refuses instead of prompting.
    `docs/headless/github-hosted.md` must reference the manual/scheduled workflow created by Plan 11-13 and the hosted backend env var `PROTOSTAR_HOSTED_LLM_API_KEY`.
    `docs/headless/self-hosted-runner.md` must describe trusted single-tenant runner setup, LM Studio/local network assumption, residue cleanup via prune, and no checked-in secrets.
    `docs/headless/local-daemon.md` must reference `scripts/protostar-local-daemon.launchd.plist`, local working directory requirements, log/evidence paths, and how to stop/restart the daemon.
    Add `scripts/protostar-local-daemon.launchd.plist` as a sample macOS launchd plist that invokes the built CLI with `--headless-mode local-daemon --non-interactive`; keep it inert documentation/sample config, not auto-installed by any script.
  </action>
  <verify>
    <automated>rg -n "github-hosted|self-hosted-runner|local-daemon|--non-interactive|events.jsonl|PROTOSTAR_HOSTED_LLM_API_KEY|protostar-local-daemon.launchd.plist" docs/headless scripts/protostar-local-daemon.launchd.plist</automated>
  </verify>
  <acceptance_criteria>
    - All three Q-04 setup paths exist and use exact mode literals.
    - The local daemon plist is sample/config-only and no script installs or starts it automatically.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| config file -> runtime mode | Operator-controlled `.protostar/factory-config.json` changes CI/headless behavior. |
| CLI args -> run options | Untrusted shell args enter factory orchestration. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-17 | Denial of Service | headless mode | mitigate | `--non-interactive` and Plan 11-13 no-prompt contract prevent CI wedging on stdin. |
| T-11-18 | Tampering | config schema | mitigate | Strict enum and `additionalProperties: false` reject unknown modes. |
| T-11-19 | Information Disclosure | hosted mode config | mitigate | This plan adds mode only, not secrets; Plan 11-07 handles env-secret references. |
| T-11-20 | Spoofing | mode naming | mitigate | Exact literals prevent ambiguous aliases like `ci` or `dashboard`. |
| T-11-63 | Denial of Service | stress caps config | mitigate | Q-03 defaults live in strict config schema; Plans 11-09/11-14 write `phase-11-cap-breach.json` when caps fire. |
| T-11-64 | Information Disclosure | headless setup docs | mitigate | Docs require env-only secrets and no checked-in credentials for hosted/self-hosted modes. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/lmstudio-adapter test`, `pnpm --filter @protostar/factory-cli test`, and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
Headless mode is a validated config/CLI selection with backward-compatible local defaults, Q-03 cap defaults, all-three setup paths, and no interactive behavior.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-05-SUMMARY.md`.
</output>
