---
phase: 11-headless-mode-e2e-stress
plan: 10
type: execute
wave: 5
depends_on:
  - 11-05
  - 11-09
  - 11-15
files_modified:
  - scripts/stress.sh
  - package.json
  - apps/factory-cli/src/commands/__stress-step.test.ts
  - .planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md
autonomous: true
requirements:
  - STRESS-12
must_haves:
  truths:
    - "`scripts/stress.sh` handles sustained-load only."
    - "The bash driver contains no business logic and delegates all state writes to `__stress-step`."
    - "Every sustained-load run is selected with `next-seed`, materialized as a draft, signed as a confirmed intent, and then passed to `protostar-factory run` with exact headless flags."
    - "Sustained-load defaults support 100+ sequential runs and caps at 500 runs or 7 days."
  artifacts:
    - path: "scripts/stress.sh"
      provides: "operator sustained-load stress driver"
      contains: "sustained-load"
    - path: "package.json"
      provides: "root stress script entry"
      contains: "stress:sustained"
    - path: ".planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md"
      provides: "sustained-load validation command"
      contains: "scripts/stress.sh"
  key_links:
    - from: "scripts/stress.sh"
      to: "apps/factory-cli/src/commands/__stress-step.ts"
      via: "begin/record-run/finalize actions"
      pattern: "__stress-step"
    - from: "scripts/stress.sh"
      to: "packages/fixtures/src/seeds/index.ts"
      via: "seed selection passed through factory CLI"
      pattern: "seed"
    - from: "scripts/stress.sh"
      to: "apps/factory-cli/src/commands/run.ts"
      via: "exact factory run command consumes draft and confirmed intent paths"
      pattern: "--confirmed-intent"
---

<objective>
Add the sustained-load bash driver for sequential stress only.

Purpose: Q-19 locks bash to sustained-load while TypeScript owns concurrency/fault injection.
Output: `scripts/stress.sh`, root script hook, and validation command updates.
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
@scripts/dogfood.sh
@apps/factory-cli/src/commands/__stress-step.ts
@packages/fixtures/src/seeds/index.ts
@package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement `scripts/stress.sh` as sustained-load-only orchestration</name>
  <read_first>
    - scripts/dogfood.sh
    - apps/factory-cli/src/commands/__stress-step.ts
    - .planning/phases/11-headless-mode-e2e-stress/11-CONTEXT.md
  </read_first>
  <files>scripts/stress.sh</files>
  <action>
    Create executable `scripts/stress.sh` with `#!/usr/bin/env bash` and `set -euo pipefail`.
    It must support only `--shape sustained-load`; if `--shape concurrency` or `--shape fault-injection` is passed, print `Use apps/factory-cli/src/scripts/stress.ts for concurrency and fault-injection` to stderr and exit non-zero.
    Flags: `--session <id>`, `--runs <n>` default `100`, `--llm-backend <backend>` default `mock`, `--headless-mode <mode>` default `local-daemon`, `--max-runs <n>` default `500`, `--max-wall-clock-days <n>` default `7`, and `--seed-archetypes <csv>` default `cosmetic-tweak,feature-add`.
    The script must not write `.protostar/stress` directly. It must invoke `node apps/factory-cli/dist/main.js __stress-step --action begin|next-seed|materialize-draft|sign-intent|record-run|finalize|cap-breach` for all session state and input preparation.
    For each run, the script must parse JSON from `next-seed`, `materialize-draft`, and `sign-intent` with `jq -r` to obtain `seedId`, `draftPath`, and `confirmedIntentPath`, then invoke the factory with this exact installed-command flag set:
    `protostar-factory run --draft "$DRAFT_PATH" --confirmed-intent "$CONFIRMED_INTENT_PATH" --out .protostar/runs --executor real --planning-mode live --review-mode live --delivery-mode auto --trust trusted --run-id "$RUN_ID" --intent-mode brownfield --llm-backend "$LLM_BACKEND" --headless-mode "$HEADLESS_MODE" --non-interactive`.
    In this repository's uninstalled smoke path, the same command may be executed as `node apps/factory-cli/dist/main.js run` followed by the identical flags above.
    Do not pass raw seed JSON directly to `run`, do not rely on an unsigned draft-only path, and do not generate confirmed intents in bash.
    Keep macOS bash 3.2 compatibility: no associative arrays, no `mapfile`, no Bash 4 features.
  </action>
  <verify>
    <automated>bash -n scripts/stress.sh</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "sustained-load|__stress-step|next-seed|materialize-draft|sign-intent|--draft|--confirmed-intent|--llm-backend|--headless-mode|Use apps/factory-cli/src/scripts/stress.ts" scripts/stress.sh` finds all required text.
    - `rg -n "\\.protostar/stress|events.jsonl|stress-report.json" scripts/stress.sh` returns no direct write paths outside CLI arguments/comments.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Add script hook and sustained-load smoke validation</name>
  <read_first>
    - package.json
    - apps/factory-cli/src/commands/__stress-step.test.ts
    - .planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md
  </read_first>
  <files>package.json, apps/factory-cli/src/commands/__stress-step.test.ts, .planning/phases/11-headless-mode-e2e-stress/11-VALIDATION.md</files>
  <action>
    Add root script `"stress:sustained": "bash scripts/stress.sh --shape sustained-load"` without changing existing verify/build scripts.
    Add factory-cli tests or command-level smoke coverage proving `__stress-step` supports `begin`, `next-seed`, `materialize-draft`, `sign-intent`, `record-run`, `finalize`, and `cap-breach` with the exact flags used by the script.
    Update `11-VALIDATION.md` sustained-load automated command to `bash -n scripts/stress.sh && pnpm --filter @protostar/factory-cli run build && bash scripts/stress.sh --shape sustained-load --runs 1 --llm-backend mock --headless-mode local-daemon --seed-archetypes cosmetic-tweak,feature-add`.
  </action>
  <verify>
    <automated>bash -n scripts/stress.sh && pnpm --filter @protostar/factory-cli test -- --test-name-pattern "stress"</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm stress:sustained -- --runs 1 --llm-backend mock --headless-mode local-daemon` is documented by script help or validation text.
    - The one-run smoke consumes `intent.draft.json` and `confirmed-intent.json` paths returned by `__stress-step`; the factory invocation includes `--draft` and `--confirmed-intent`.
    - The script refuses non-sustained shapes with the TypeScript-driver message.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| shell flags -> factory CLI | Operator-supplied flags are passed to `protostar-factory run`. |
| sustained driver -> session evidence | Bash orchestrates but must not own evidence writes. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-37 | Tampering | shell command invocation | mitigate | Use array-style shell variables quoted at every expansion; no eval or shell-generated command strings. |
| T-11-38 | Denial of Service | sustained-load caps | mitigate | Defaults cap at 500 runs or 7 days; cap breach delegates evidence to `__stress-step`. |
| T-11-39 | Repudiation | stress evidence | mitigate | Bash never writes evidence directly; all writes go through Plan 11-09 session core. |
| T-11-40 | Elevation of Privilege | unsupported shapes in bash | mitigate | Concurrency/fault shapes are explicitly refused and delegated to TS driver. |
</threat_model>

<verification>
Run `bash -n scripts/stress.sh`, `pnpm --filter @protostar/factory-cli test -- --test-name-pattern "stress"`, the one-run mock smoke, and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
Sustained-load stress has a bash driver that is intentionally narrow, cap-aware, and evidence-delegating.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-10-SUMMARY.md`.
</output>
