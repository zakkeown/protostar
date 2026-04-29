---
phase: 11-headless-mode-e2e-stress
plan: 09
type: execute
wave: 3
depends_on:
  - 11-06
  - 11-08
files_modified:
  - apps/factory-cli/src/stress/stress-session.ts
  - apps/factory-cli/src/stress/stress-session.test.ts
  - apps/factory-cli/src/stress/seed-materialization.ts
  - apps/factory-cli/src/stress/seed-materialization.test.ts
  - apps/factory-cli/src/stress/stress-caps.ts
  - apps/factory-cli/src/stress/stress-caps.test.ts
  - apps/factory-cli/src/stress/wedge-detection.ts
  - apps/factory-cli/src/stress/wedge-detection.test.ts
  - apps/factory-cli/src/commands/__stress-step.ts
  - apps/factory-cli/src/commands/__stress-step.test.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/commands/prune.ts
  - apps/factory-cli/src/commands/prune.test.ts
autonomous: true
requirements:
  - STRESS-11
must_haves:
  truths:
    - "Stress sessions write only under `.protostar/stress/<sessionId>/`."
    - "Stress events append without truncating prior evidence."
    - "Wedge and cap-breach evidence are structured and stop-the-world."
    - "Prune protects active stress sessions."
    - "Stress and TTT runs consume selected seeds through materialized draft files and signed confirmed-intent files before invoking factory run."
    - "Stress shape caps resolve CLI > factory.stress.caps config > Q-03 defaults and write `phase-11-cap-breach.json` when exceeded."
  artifacts:
    - path: "apps/factory-cli/src/stress/stress-session.ts"
      provides: "session paths, event append, report writes, cap breach evidence"
      contains: "events.jsonl"
    - path: "apps/factory-cli/src/stress/wedge-detection.ts"
      provides: "5x p95 wedge detector"
      contains: "wedge"
    - path: "apps/factory-cli/src/commands/__stress-step.ts"
      provides: "hidden support command for bash/TS drivers"
      contains: "__stress-step"
    - path: "apps/factory-cli/src/stress/seed-materialization.ts"
      provides: "shared seed selection, draft materialization, and confirmed-intent signing helper"
      contains: "next-seed"
    - path: "apps/factory-cli/src/stress/stress-caps.ts"
      provides: "stress cap resolver and cap-breach detector"
      contains: "phase-11-cap-breach.json"
  key_links:
    - from: "apps/factory-cli/src/stress/stress-session.ts"
      to: "packages/artifacts/src/stress-report.schema.ts"
      via: "parse/format stress artifacts"
      pattern: "formatStressReport"
    - from: "apps/factory-cli/src/commands/prune.ts"
      to: ".protostar/stress"
      via: "stress session active protection"
      pattern: "active-stress-session"
    - from: "apps/factory-cli/src/stress/seed-materialization.ts"
      to: "apps/factory-cli/src/commands/__dogfood-step.ts"
      via: "extracted dogfood-compatible draft/signing path"
      pattern: "promoteAndSignIntent"
    - from: "apps/factory-cli/src/stress/stress-caps.ts"
      to: "packages/lmstudio-adapter/src/factory-config.ts"
      via: "uses resolved factory.stress.caps defaults from Plan 11-05"
      pattern: "stress.caps"
---

<objective>
Create the shared stress session core used by bash sustained-load and TypeScript concurrency/fault drivers.

Purpose: stress drivers need one authority-correct implementation for session paths, append-only events, canonical reports, caps, wedges, and pruning.
Output: factory-cli stress library, hidden step command, and prune extension.
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
@packages/artifacts/src/stress-report.schema.ts
@apps/factory-cli/src/snapshot-writer.ts
@apps/factory-cli/src/journal-writer.ts
@apps/factory-cli/src/run-liveness.ts
@apps/factory-cli/src/commands/__dogfood-step.ts
@apps/factory-cli/src/commands/prune.ts
@packages/fixtures/src/seeds/index.ts
@packages/intent/src/promote-and-sign-intent.ts
@packages/lmstudio-adapter/src/factory-config.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pin stress session path confinement and append behavior</name>
  <read_first>
    - apps/factory-cli/src/commands/__dogfood-step.test.ts
    - apps/factory-cli/src/snapshot-writer.test.ts
    - apps/factory-cli/src/journal-writer.test.ts
    - packages/artifacts/src/stress-report.schema.test.ts
  </read_first>
  <files>apps/factory-cli/src/stress/stress-session.test.ts, apps/factory-cli/src/stress/seed-materialization.test.ts, apps/factory-cli/src/stress/stress-caps.test.ts, apps/factory-cli/src/stress/wedge-detection.test.ts, apps/factory-cli/src/commands/__stress-step.test.ts, apps/factory-cli/src/commands/prune.test.ts</files>
  <action>
    Add tests for `resolveStressSessionPaths(workspaceRoot, sessionId)` accepting `stress_20260429_001` and rejecting `../escape`, slashes, backslashes, and empty ids.
    Add tests for `appendStressEvent` preserving existing lines and datasyncing the file handle; two concurrent appends must produce two full JSONL lines with monotonic `sequence`.
    Add tests for `writeStressReportAtomic` using the Plan 11-08 formatter and preserving canonical bytes.
    Add seed-materialization tests for actions `next-seed`, `materialize-draft`, and `sign-intent`: `next-seed` filters by `--seed-archetypes cosmetic-tweak,feature-add`, supports optional `--seed-id ttt-game` for final TTT delivery, and returns deterministic round-robin metadata; `materialize-draft` writes `.protostar/stress/<sessionId>/inputs/<runId>/intent.draft.json` in the same `IntentDraft` shape used by `examples/intents/*.draft.json`; `sign-intent` reuses the dogfood-compatible `promoteIntentDraft` + `promoteAndSignIntent` + policy snapshot path and writes `.protostar/stress/<sessionId>/inputs/<runId>/confirmed-intent.json`.
    Add stress cap tests for `resolveStressCaps({ cli, config })` proving precedence CLI > `factory.stress.caps` config > Q-03 defaults. Cover sustained-load `500/7`, concurrency `20/3`, fault-injection `100/3`, and TTT delivery `50/14` even though TTT enforcement is consumed by Plan 11-14.
    Add cap breach tests proving `detectStressCapBreach` returns `{ kind: "run-count" | "wall-clock", value, limit, shape }` and `writeCapBreach` writes `.protostar/stress/<sessionId>/phase-11-cap-breach.json` with the shape and cap source.
    Add wedge tests: if a run has no status transition for `> 5 * p95SuccessfulDurationMs` and no cancel sentinel, result is `wedge`; otherwise it is not.
    Extend prune tests to protect `.protostar/stress/<sessionId>` when cursor/report status is not terminal and to preserve `events.jsonl` hashes in dry-run output.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test -- --test-name-pattern "stress|prune"</automated>
  </verify>
  <acceptance_criteria>
    - Tests fail before stress session implementation.
    - Tests include the exact path `.protostar/stress`.
    - Tests include `active-stress-session` and `wedge-evidence.json`.
    - Tests include `next-seed`, `materialize-draft`, `sign-intent`, `intent.draft.json`, `confirmed-intent.json`, `factory.stress.caps`, and `phase-11-cap-breach.json`.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Implement stress session library and hidden support command</name>
  <read_first>
    - apps/factory-cli/src/snapshot-writer.ts
    - apps/factory-cli/src/journal-writer.ts
    - apps/factory-cli/src/commands/__dogfood-step.ts
    - apps/factory-cli/src/main.ts
    - packages/artifacts/src/stress-report.schema.ts
  </read_first>
  <files>apps/factory-cli/src/stress/stress-session.ts, apps/factory-cli/src/stress/seed-materialization.ts, apps/factory-cli/src/stress/stress-caps.ts, apps/factory-cli/src/stress/wedge-detection.ts, apps/factory-cli/src/commands/__stress-step.ts, apps/factory-cli/src/main.ts</files>
  <action>
    Create `apps/factory-cli/src/stress/stress-session.ts` with `resolveStressSessionPaths`, `beginStressSession`, `appendStressEvent`, `recordStressRun`, `writeStressReportAtomic`, `writeCapBreach`, and `writeWedgeEvidence`.
    Store session files under `.protostar/stress/<sessionId>/cursor.json`, `events.jsonl`, `stress-report.json`, optional `phase-11-cap-breach.json`, and optional `wedge-evidence.json`.
    Use a per-final-path write chain and temp-file + datasync + rename + directory datasync for report/cursor/evidence writes. Use append mode + datasync for `events.jsonl`.
    Create `apps/factory-cli/src/stress/seed-materialization.ts` by extracting the shared seed/draft/signing logic from `__dogfood-step` rather than duplicating a second signing algorithm. Export `selectNextStressSeed`, `materializeStressDraft`, `signStressConfirmedIntent`, and `prepareStressRunInput`. `prepareStressRunInput` must return `{ seedId, archetype, draftPath, confirmedIntentPath, runId }`.
    Create `apps/factory-cli/src/stress/stress-caps.ts` exporting Q-03 defaults, `resolveStressCaps`, `detectStressCapBreach`, and typed cap shapes for `sustained-load`, `concurrency`, `fault-injection`, and `ttt-delivery`. `resolveStressCaps` must accept CLI overrides from 11-10/11-11 and resolved `factory.stress.caps` config from Plan 11-05.
    Extend `__stress-step` cap-breach action to accept `--shape`, `--cap-kind`, `--cap-value`, `--cap-limit`, and `--cap-source`, then write `phase-11-cap-breach.json` using the stress session writer. This is the single breach artifact consumed by sustained/concurrency/fault drivers and by Plan 11-14 for TTT.
    Create hidden command `__stress-step` with actions `begin`, `next-seed`, `materialize-draft`, `sign-intent`, `record-run`, `append-event`, `finalize`, `cap-breach`, and `wedge`. It must write help/errors to stderr and structured output to stdout only when `--json` is passed. The `next-seed/materialize-draft/sign-intent` actions are the executable input-preparation surface used by Plans 11-10, 11-11, and 11-14. Supported input-prep flags are `--seed-archetypes <csv>`, optional `--seed-id <id>`, `--run-index <n>`, `--run-id <id>`, and `--draft <path>`.
    Register `__stress-step` in `main.ts` as hidden/internal like `__dogfood-step`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test -- --test-name-pattern "stress|main"</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "__stress-step|next-seed|materialize-draft|sign-intent|resolveStressCaps|ttt-delivery|factory\\.stress\\.caps|events.jsonl|phase-11-cap-breach.json|wedge-evidence.json" apps/factory-cli/src` finds implementation and tests.
    - No writes occur outside `.protostar/stress/<sessionId>/` in tests.
    - `rg -n "promoteAndSignIntent|buildSignatureEnvelope" apps/factory-cli/src/stress/seed-materialization.ts apps/factory-cli/src/commands/__stress-step.ts` proves signing is wired through the existing intent/signature path.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Extend prune scope to stress sessions</name>
  <read_first>
    - apps/factory-cli/src/commands/prune.ts
    - apps/factory-cli/src/commands/prune.test.ts
    - apps/factory-cli/src/dogfood/cursor-schema.ts
  </read_first>
  <files>apps/factory-cli/src/commands/prune.ts, apps/factory-cli/src/commands/prune.test.ts</files>
  <action>
    Extend `prune` to scan `.protostar/stress/` alongside `.protostar/runs/` and `.protostar/dogfood/`.
    A stress session is active when cursor/report status is not terminal or `finishedAt` is missing. Protect active sessions with reason `active-stress-session`.
    Preserve append-only top-level history files and do not delete `.protostar/stress/<sessionId>/events.jsonl` unless the entire terminal session is selected and `--confirm` is set.
    Update help text if prune help lists scopes.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test -- --test-name-pattern "prune"</automated>
  </verify>
  <acceptance_criteria>
    - `protostar-factory prune --older-than 1d --json` dry-run reports stress candidates without deleting them.
    - Active stress sessions are protected with `active-stress-session`.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| stress drivers -> `.protostar/stress` | Driver inputs become filesystem writes. |
| concurrent runs -> shared stress report | Multiple workers update the same session evidence. |
| prune -> stress artifacts | Cleanup can delete stress evidence. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-33 | Tampering | `events.jsonl` | mitigate | Append-only writer with per-session sequence and datasync; tests cover concurrent appends. |
| T-11-34 | Repudiation | wedge/cap evidence | mitigate | Structured `wedge-evidence.json` and `phase-11-cap-breach.json` include run ids and cap values. |
| T-11-35 | Denial of Service | wedge detection | mitigate | Stop-the-world after `5x p95` inactivity and no cancel sentinel. |
| T-11-36 | Tampering | prune stress scope | mitigate | Dry-run default and active-session protection prevent accidental evidence deletion. |
| T-11-66 | Denial of Service | stress cap resolution | mitigate | Caps resolve CLI > config > Q-03 defaults and write `phase-11-cap-breach.json` before aborting. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/factory-cli test -- --test-name-pattern "stress|prune"` and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
Both drivers can share a single stress-session implementation that writes durable evidence, detects wedges, enforces caps, and survives pruning.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-09-SUMMARY.md`.
</output>
