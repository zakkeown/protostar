---
phase: 11-headless-mode-e2e-stress
plan: 08
type: execute
wave: 1
depends_on:
  - 11-01
files_modified:
  - packages/artifacts/src/stress-report.schema.ts
  - packages/artifacts/src/stress-report.schema.test.ts
  - packages/artifacts/src/index.ts
  - packages/artifacts/package.json
  - packages/admission-e2e/src/stress-report-snapshot.contract.test.ts
  - packages/admission-e2e/src/no-dashboard-server.contract.test.ts
autonomous: true
requirements:
  - STRESS-10
must_haves:
  truths:
    - "Stress evidence uses `stress-report.json` plus append-only `events.jsonl`."
    - "Phase 11 does not add HTTP dashboard/server code."
    - "Stress reports are canonical, strict, and byte-stable."
  artifacts:
    - path: "packages/artifacts/src/stress-report.schema.ts"
      provides: "Zod schema, parser, and formatter for stress artifacts"
      contains: "StressReportSchema"
    - path: "packages/admission-e2e/src/stress-report-snapshot.contract.test.ts"
      provides: "byte-stability and malformed-report contract"
      contains: "formatStressReport"
    - path: "packages/admission-e2e/src/no-dashboard-server.contract.test.ts"
      provides: "R2 no HTTP dashboard/server invariant"
      contains: "events.jsonl"
  key_links:
    - from: "packages/artifacts/src/stress-report.schema.ts"
      to: "apps/factory-cli/src/stress/stress-session.ts"
      via: "parser/formatter imported by stress session core"
      pattern: "formatStressReport"
    - from: "packages/admission-e2e/src/no-dashboard-server.contract.test.ts"
      to: "AGENTS.md"
      via: "dark autonomy and authority boundary"
      pattern: "node:http"
---

<objective>
Define Phase 11 stress artifacts and lock R2 event-tail observability.

Purpose: stress sessions need durable evidence without adding a dashboard or HTTP server surface.
Output: `stress-report.json` schema/formatter, event schema, byte-stability contract, and no-dashboard contract.
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
@packages/artifacts/src/canonical-json.ts
@packages/artifacts/src/index.ts
@packages/artifacts/package.json
@apps/factory-cli/src/dogfood/report-schema.ts
@packages/admission-e2e/src/dogfood-report-byte-equality.contract.test.ts
@packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pin stress report canonical schema behavior</name>
  <read_first>
    - apps/factory-cli/src/dogfood/report-schema.ts
    - packages/artifacts/src/canonical-json.ts
    - packages/admission-e2e/src/dogfood-report-byte-equality.contract.test.ts
  </read_first>
  <files>packages/artifacts/src/stress-report.schema.test.ts, packages/admission-e2e/src/stress-report-snapshot.contract.test.ts</files>
  <action>
    Add tests for `parseStressReport`, `formatStressReport`, `parseStressEvent`, and `formatStressEventLine`.
    Required report fields are exactly `sessionId`, `startedAt`, `finishedAt`, `totalRuns`, `headlessMode`, `llmBackend`, `shape`, `perArchetype`, `perRun`, optional `wedgeEvent`, and optional `capBreached`.
    Required `shape` literals are `"sustained-load" | "concurrency" | "fault-injection"`.
    Required event line fields are `sessionId`, `sequence`, `at`, `type`, and `payload`; line format is one canonical JSON object plus `\n`.
    Assert malformed reports reject when `passes > runs`, `passRate` is outside `[0,1]`, `totalRuns` mismatches `perRun.length`, or unknown keys are present.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/artifacts test && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - Tests fail before `stress-report.schema.ts` exists.
    - Byte-stability contract asserts `format(parse(JSON.parse(format(report))))` is identical.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Implement stress report and event schemas in artifacts</name>
  <read_first>
    - packages/artifacts/src/canonical-json.ts
    - packages/artifacts/src/index.ts
    - packages/artifacts/package.json
    - apps/factory-cli/src/dogfood/report-schema.ts
  </read_first>
  <files>packages/artifacts/src/stress-report.schema.ts, packages/artifacts/src/index.ts, packages/artifacts/package.json</files>
  <action>
    Create `packages/artifacts/src/stress-report.schema.ts`.
    Export `StressShape`, `StressOutcome`, `StressReport`, `StressReportSchema`, `StressEvent`, `StressEventSchema`, `parseStressReport`, `formatStressReport`, `parseStressEvent`, and `formatStressEventLine`.
    Use Zod strict objects and `sortJsonValue` for canonical one-line JSON. Because the schema is exported at runtime, move `zod` from `devDependencies` to `dependencies` in `packages/artifacts/package.json` if it is currently dev-only; leave `zod-to-json-schema` dev-only.
    Implement exact outcomes: `"pass" | "failed" | "blocked" | "cancelled" | "orphaned" | "wedge"`. `capBreached.kind` literals are `"run-count" | "wall-clock"`.
    Re-export schema helpers from `packages/artifacts/src/index.ts`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/artifacts test && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "StressReportSchema|formatStressReport|StressEventSchema|formatStressEventLine" packages/artifacts/src` finds implementation and exports.
    - `packages/artifacts/package.json` has runtime `dependencies.zod` if the schema imports Zod from production source.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Lock R2 observability with a no-dashboard contract</name>
  <read_first>
    - packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts
    - .planning/phases/11-headless-mode-e2e-stress/11-RESEARCH.md
    - AGENTS.md
  </read_first>
  <files>packages/admission-e2e/src/no-dashboard-server.contract.test.ts</files>
  <action>
    Add an admission-e2e static contract that scans production `apps/*/src/**/*.ts` and `packages/*/src/**/*.ts` for forbidden dashboard/server surfaces: `from "node:http"`, `from "node:https"`, `from "http"`, `from "https"`, `ws`, `WebSocketServer`, `createServer(`, and `apps/factory-cli/src/dashboard`.
    The contract must allow existing network packages that already have approved HTTP clients only if they do not create a server. Use comment stripping like delivery no-merge tests. The failure message must say `Phase 11 uses .protostar/stress/<sessionId>/events.jsonl; no dashboard/server code is allowed`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - `rg -n "events.jsonl|no dashboard/server|createServer" packages/admission-e2e/src/no-dashboard-server.contract.test.ts` finds the R2 invariant.
    - No file under `apps/factory-cli/src/dashboard` is created.
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| stress session -> artifacts | Runtime stress state becomes durable evidence. |
| operator observability -> factory runtime | R2 tailing observes files but does not create a server/control surface. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-29 | Tampering | `stress-report.json` | mitigate | Strict schema, canonical formatter, and byte-stability contract reject malformed reports. |
| T-11-30 | Repudiation | `events.jsonl` | mitigate | Event line schema includes sequence and timestamp; Plan 11-09 appends without truncation. |
| T-11-31 | Denial of Service | dashboard/server | mitigate | No-dashboard contract blocks HTTP/websocket server code for Phase 11. |
| T-11-32 | Information Disclosure | stress artifacts | mitigate | Schemas omit secret fields; hosted key leakage is separately tested in Plan 11-07/11-13. |
</threat_model>

<verification>
Run `pnpm --filter @protostar/artifacts test`, `pnpm --filter @protostar/admission-e2e test`, and `pnpm run verify`.
Schema push: not applicable; this plan introduces no ORM/database schema files.
</verification>

<success_criteria>
Stress artifacts are strict, canonical, and append-only-compatible, and Phase 11 observability is locked to event tailing with no dashboard/server code.
</success_criteria>

<output>
After completion, create `.planning/phases/11-headless-mode-e2e-stress/11-08-SUMMARY.md`.
</output>
