---
phase: 09-operator-surface-resumability
plan: 05
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - apps/factory-cli/src/commands/inspect.ts
  - apps/factory-cli/src/commands/inspect.test.ts
  - apps/factory-cli/src/main.ts
autonomous: true
requirements: [OP-05, OP-07]
must_haves:
  truths:
    - "inspect <runId> emits a single JSON value to stdout: { manifest, artifacts: [{stage, kind, path, sha256?}], summary } (Q-10)"
    - "trace.json files are referenced by path + sha256, NEVER inlined (Q-11)"
    - "no --include-traces flag exists (Q-11)"
    - "artifact walk uses a fixed allowlist of expected kinds: manifest.json, plan.json, execution/journal.jsonl, execution/snapshot.json, review-gate.json, evaluation-report.json, evolution/snapshot.json, ci-events.jsonl, piles/<kind>/iter-<N>/{result.json,trace.json,refusal.json}, delivery/authorization.json, delivery/result.json (Q-10)"
    - "summary is a one-line human-readable string inside the JSON value (NOT a separate stream)"
    - "--stage <name> filters the artifacts array by stage; manifest field always present"
    - "runId validation via parseRunId (exit 2) + assertRunIdConfined (exit 2); missing run → exit 3"
    - "stdout is canonicalized via writeStdoutJson (Q-12)"
  artifacts:
    - path: apps/factory-cli/src/commands/inspect.ts
      provides: "inspect command (Q-10/Q-11)"
      exports: ["buildInspectCommand"]
    - path: apps/factory-cli/src/commands/inspect.test.ts
      provides: "Inspect schema + trace-no-inline + filter tests"
  key_links:
    - from: apps/factory-cli/src/commands/inspect.ts
      to: apps/factory-cli/src/io.ts
      via: "writeStdoutJson for canonical output"
      pattern: "writeStdoutJson"
    - from: apps/factory-cli/src/main.ts
      to: apps/factory-cli/src/commands/inspect.ts
      via: "addCommand(buildInspectCommand())"
      pattern: "addCommand\\(buildInspectCommand"
---

<objective>
Implement `protostar-factory inspect <runId>` per Q-10/Q-11. Path-indexed view of the run bundle with sha256 hashes for every artifact (including trace.json), but NEVER inlines trace contents. Output is a single canonicalized JSON value.

Purpose: Bounded, pipeable inspect — operators slice artifacts via `cat $(jq -r '.artifacts[] | select(.kind=="trace") | .path')` rather than the CLI re-implementing trace navigation.
Output: Single command module with allowlist artifact walk + sha256 + summary line; tests covering the no-trace-inlining invariant.
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
@apps/factory-cli/src/io.ts
@apps/factory-cli/src/exit-codes.ts
@apps/factory-cli/src/run-id.ts
@apps/factory-cli/src/main.ts
@packages/artifacts/src/index.ts

<interfaces>
```typescript
// apps/factory-cli/src/commands/inspect.ts
import type { Command } from "@commander-js/extra-typings";
import type { FactoryRunManifest } from "@protostar/artifacts";

export type ArtifactStage =
  | "manifest" | "plan" | "execution" | "review" | "evaluation"
  | "evolution" | "ci" | "pile" | "delivery";

export type ArtifactKind =
  | "manifest" | "plan" | "journal" | "snapshot" | "review-gate" | "evaluation-report"
  | "evolution-snapshot" | "ci-events" | "pile-result" | "trace" | "pile-refusal"
  | "delivery-authorization" | "delivery-result";

export interface ArtifactRef {
  readonly stage: ArtifactStage;
  readonly kind: ArtifactKind;
  readonly path: string;        // run-relative
  readonly sha256: string;      // hex; computed for every artifact including trace
  readonly bytes: number;
}

export interface InspectOutput {
  readonly manifest: FactoryRunManifest;
  readonly artifacts: readonly ArtifactRef[];
  readonly summary: string;     // one-line: "run X — review:pass — eval:pass — pr#42 — 12m13s"
}

export function buildInspectCommand(): Command;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: inspect command + allowlist artifact walk + sha256 + tests</name>
  <read_first>
    - apps/factory-cli/src/commands/run.ts (Plan 09-01 builder pattern)
    - apps/factory-cli/src/commands/status.ts (Plan 09-04 — for runs-root resolution + parseRunId pattern)
    - apps/factory-cli/src/io.ts (writeStdoutJson, writeStderr)
    - apps/factory-cli/src/run-id.ts (parseRunId, assertRunIdConfined)
    - packages/artifacts/src/index.ts (FactoryRunManifest type)
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-10, Q-11)
    - .planning/phases/09-operator-surface-resumability/09-RESEARCH.md (Anti-Patterns — "Inlining trace.json in inspect" forbidden)
  </read_first>
  <files>apps/factory-cli/src/commands/inspect.ts, apps/factory-cli/src/commands/inspect.test.ts, apps/factory-cli/src/main.ts</files>
  <behavior>
    - inspect <validId> against a fully-populated tmpdir run → stdout is one JSON value parseable as InspectOutput; manifest field deep-equals the on-disk manifest.json content; artifacts[] contains entries for every allowlist kind that exists.
    - inspect <validId> with a trace.json present → artifacts contains a row with kind='trace' and a sha256; the JSON output does NOT include the trace's contents (assert by string-match: trace text "JUDGE_SAID_XXX" appears in trace.json on disk but does NOT appear in stdout).
    - inspect <validId> --stage execution → artifacts only contains execution-stage rows; manifest still present.
    - inspect <missingId> → exit 3; stderr contains "no manifest at".
    - inspect <invalidId> → exit 2.
    - inspect against an empty piles dir → no pile artifacts in output (silent absence, not an error).
    - sha256 values are 64-char hex strings.
    - summary is a string and contains the runId.
  </behavior>
  <action>
    1. Create `apps/factory-cli/src/commands/inspect.ts`:
       - Builder via `Command` from `@commander-js/extra-typings`. Args: `<runId>` (positional). Options: `--stage <name>`, `--json` (currently only output is JSON; `--json` is accepted for forward consistency but is the default — flag may simply be a no-op for v0.1 with a stderr note).
       - `executeInspect(opts)`:
         a. parseRunId → not-ok → ExitCode.UsageOrArgError.
         b. assertRunIdConfined.
         c. Resolve runDir = path.join(runsRoot, runId).
         d. Read `manifest.json` → JSON.parse → fail → ExitCode.NotFound.
         e. Build artifacts[] by walking the allowlist — for each expected path, if it exists: read bytes, compute sha256 via `node:crypto.createHash('sha256').update(buf).digest('hex')`, push `{stage, kind, path: relpath, sha256, bytes: buf.byteLength}`.
            - Allowlist (build a static table mapping `relativePath → {stage, kind}`):
              - `manifest.json` → manifest/manifest
              - `plan.json` → plan/plan
              - `execution/journal.jsonl` → execution/journal
              - `execution/snapshot.json` → execution/snapshot
              - `review-gate.json` → review/review-gate
              - `review-decision.json` (if Phase 5 wrote it) → review/review-gate (or a new kind 'review-decision')
              - `evaluation-report.json` → evaluation/evaluation-report
              - `evolution/snapshot.json` → evolution/evolution-snapshot
              - `ci-events.jsonl` → ci/ci-events
              - `delivery/authorization.json` → delivery/delivery-authorization (Plan 09-08 lands the writer)
              - `delivery/result.json` → delivery/delivery-result
            - For piles: iterate `piles/{planning,review,execution-coordination}/iter-N/` (readdir, filter by iter-pattern); for each iter dir add rows for `result.json`, `trace.json`, `refusal.json` if present.
            - **NEVER read trace.json content into the output JSON.** The walker computes sha256 by reading the file (necessary for hashing) but only pushes the path + sha256 + bytes — never the parsed content.
         f. Apply `--stage` filter on artifacts[] (manifest field unchanged).
         g. Build summary string: `"run ${runId} — review:${reviewVerdict ?? 'n/a'} — eval:${evalVerdict ?? 'n/a'} — pr:${prUrl ?? 'none'} — ${humanizedDuration}"`.
         h. writeStdoutJson({manifest, artifacts, summary}); return ExitCode.Success.
    2. Wire into main.ts: `program.addCommand(buildInspectCommand());`.
    3. Write `apps/factory-cli/src/commands/inspect.test.ts` covering the cases in `<behavior>`. Build a fixture run dir with: manifest.json, plan.json, execution/journal.jsonl + snapshot.json, review-gate.json, evaluation-report.json, evolution/snapshot.json, piles/planning/iter-1/{result.json,trace.json,refusal.json}, delivery/result.json. Trace file content includes a unique sentinel string (e.g., `"JUDGE_SAID_XXX_INSPECT_TEST"`); test asserts that string does NOT appear in the captured stdout.
    4. Run `pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^inspect'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function buildInspectCommand' apps/factory-cli/src/commands/inspect.ts` is 1
    - `grep -c 'addCommand(buildInspectCommand' apps/factory-cli/src/main.ts` is 1
    - `grep -cE "createHash\\('sha256'\\)" apps/factory-cli/src/commands/inspect.ts` is at least 1
    - `grep -cE 'include-traces' apps/factory-cli/src/commands/inspect.ts` is 0 (Q-11 — no such flag)
    - `grep -c 'writeStdoutJson' apps/factory-cli/src/commands/inspect.ts` is at least 1
    - `pnpm --filter @protostar/factory-cli test` exits 0
  </acceptance_criteria>
  <done>inspect command live; trace files referenced not inlined; allowlist walks every Phase 6/7/8 artifact kind plus delivery/authorization.json (placeholder until 09-08 lands writer).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| <runId> arg → fs path | parseRunId + assertRunIdConfined |
| stdout consumer | Single JSON value; trace contents never crossed |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-05-01 | Tampering | runId path traversal | mitigate | parseRunId + assertRunIdConfined (Q-19). |
| T-09-05-02 | Information Disclosure | trace.json size explosion | mitigate | Trace files referenced by path + sha256 only; bounded output (Q-11). |
| T-09-05-03 | Information Disclosure | progress on stdout | mitigate | writeStderr for stage logs; writeStdoutJson single chunk (Q-04). |
</threat_model>

<verification>
- `pnpm --filter @protostar/factory-cli test` clean (new inspect.test.ts plus regression on existing tests)
</verification>

<success_criteria>
- inspect emits canonicalized {manifest, artifacts[], summary}
- trace.json never inlined; sha256 hash present; bytes count present
- --stage filter narrows artifacts only
- Invalid/missing runId maps to documented ExitCodes
</success_criteria>

<output>
Create `.planning/phases/09-operator-surface-resumability/09-05-SUMMARY.md` summarizing the inspect command, the allowlist of artifact kinds, the trace-no-inline invariant, and the test that asserts trace bytes are absent from stdout.
</output>
