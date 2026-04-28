---
phase: 09-operator-surface-resumability
plan: 06
type: execute
wave: 3
depends_on: [01, 03]
files_modified:
  - apps/factory-cli/src/commands/cancel.ts
  - apps/factory-cli/src/commands/cancel.test.ts
  - apps/factory-cli/src/main.ts
autonomous: true
requirements: [OP-04, OP-07]
must_haves:
  truths:
    - "cancel <runId> writes manifest.status='cancelling' (atomic tmp+rename) AND touches runs/<id>/CANCEL sentinel (Q-16)"
    - "cancel against terminal manifest.status (completed | blocked | cancelled) exits 4 with stdout JSON {runId, error: 'already-terminal', terminalStatus} (Q-17)"
    - "cancel emits stdout JSON {runId, action: 'cancelling-requested', sentinelPath, manifestStatus: 'cancelling'} on success (Q-16)"
    - "runId validation via parseRunId (exit 2) + assertRunIdConfined (exit 2)"
    - "missing manifest → exit 3 (NotFound)"
    - "Existing in-flight installCancelWiring.checkSentinelBetweenTasks (apps/factory-cli/src/cancel.ts) detects the sentinel and on next abort transitions manifest from 'cancelling' to 'cancelled' — this plan ADDS that transition writer in main.ts's cancel-teardown path (Q-16, Q-18)"
    - "Naming collision documented: apps/factory-cli/src/cancel.ts is the existing in-process wiring; apps/factory-cli/src/commands/cancel.ts is the NEW out-of-process command"
  artifacts:
    - path: apps/factory-cli/src/commands/cancel.ts
      provides: "cancel command (Q-16/Q-17)"
      exports: ["buildCancelCommand"]
    - path: apps/factory-cli/src/commands/cancel.test.ts
      provides: "Atomic write + sentinel + terminal-refusal tests"
  key_links:
    - from: apps/factory-cli/src/commands/cancel.ts
      to: apps/factory-cli/src/cancel.ts
      via: "Documented partnership: command writes sentinel, existing wiring detects it; command does NOT call installCancelWiring"
      pattern: "CANCEL"
    - from: apps/factory-cli/src/main.ts
      to: packages/artifacts/src/index.ts
      via: "New transition writer: setFactoryRunStatus(manifest, 'cancelled') on sentinel-driven abort teardown"
      pattern: "setFactoryRunStatus.*cancelled"
---

<objective>
Implement `protostar-factory cancel <runId>` per Q-16/Q-17. Out-of-process cancel writes the existing CANCEL sentinel AND atomically marks `manifest.status='cancelling'`. The in-flight run loop's existing sentinel detector then transitions manifest to `'cancelled'` during abort teardown — this plan adds the missing teardown writer in main.ts.

Purpose: First out-of-process state mutation in the operator surface. Sentinel-only cancel ((a)) leaves status command lying; PID+SIGTERM ((b)) is wrong tradeoff for v0.1 (Q-16 lock).
Output: New command module + corresponding teardown writer in main.ts + tests covering atomic write, sentinel touch, terminal-refusal, and the `cancelling → cancelled` transition.
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
@apps/factory-cli/src/cancel.ts
@apps/factory-cli/src/io.ts
@apps/factory-cli/src/exit-codes.ts
@apps/factory-cli/src/run-id.ts
@apps/factory-cli/src/main.ts
@packages/artifacts/src/index.ts

<interfaces>
```typescript
// apps/factory-cli/src/commands/cancel.ts (NEW — distinct from existing apps/factory-cli/src/cancel.ts)
import type { Command } from "@commander-js/extra-typings";
export function buildCancelCommand(): Command;

// Output JSON shape (cancel success, Q-16):
interface CancelSuccessOutput {
  readonly runId: string;
  readonly action: "cancelling-requested";
  readonly sentinelPath: string;       // absolute
  readonly manifestStatus: "cancelling";
}

// Output JSON shape (already-terminal, Q-17):
interface CancelTerminalOutput {
  readonly runId: string;
  readonly error: "already-terminal";
  readonly terminalStatus: "completed" | "blocked" | "cancelled";
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: cancel command (atomic write + sentinel + terminal-refusal) with tests</name>
  <read_first>
    - apps/factory-cli/src/cancel.ts (FULL FILE — installCancelWiring shape; checkSentinelBetweenTasks; unlinkSentinelOnResume; understand existing sentinel path layout `runs/<id>/CANCEL`)
    - apps/factory-cli/src/commands/run.ts (builder pattern from Plan 09-01)
    - apps/factory-cli/src/io.ts (writeStdoutJson, writeStderr)
    - apps/factory-cli/src/exit-codes.ts (ExitCode)
    - apps/factory-cli/src/run-id.ts (parseRunId, assertRunIdConfined)
    - packages/artifacts/src/index.ts (FactoryRunStatus widened in 09-03 to include 'cancelling' | 'cancelled')
    - apps/factory-cli/src/main.ts (existing atomic tmp+rename helpers — search for 'snapshot-writer' or similar; reuse the pattern from Phase 6 Plan 07's pile-persistence atomic write)
    - apps/factory-cli/src/snapshot-writer.ts (if present — atomic write template)
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-16, Q-17, Q-18)
    - .planning/phases/09-operator-surface-resumability/09-RESEARCH.md (Pitfall 6 — race acceptance)
  </read_first>
  <files>apps/factory-cli/src/commands/cancel.ts, apps/factory-cli/src/commands/cancel.test.ts, apps/factory-cli/src/main.ts</files>
  <behavior>
    - cancel <validId> against running manifest → manifest.json on disk has status='cancelling'; runs/<id>/CANCEL exists; stdout = {runId, action: 'cancelling-requested', sentinelPath: <abs>, manifestStatus: 'cancelling'}; exit 0.
    - cancel <validId> against manifest.status='completed' → exit 4; stdout = {runId, error: 'already-terminal', terminalStatus: 'completed'}.
    - cancel <validId> against manifest.status='blocked' → exit 4; terminalStatus='blocked'.
    - cancel <validId> against manifest.status='cancelled' (double-cancel) → exit 4; terminalStatus='cancelled'.
    - cancel <invalidId> → exit 2; stderr contains regex hint.
    - cancel <missingId> → exit 3.
    - Atomicity: cancel writes manifest via tmp+rename (no torn read mid-write).
    - Race acceptance: documented in `--help` and code comment that cancelling → completed is allowed if run loop finishes a stage between cancel-write and sentinel-check (Pitfall 6 / Q-16 explicit).
    - main.ts teardown writer: simulate sentinel detection in a fixture run (write CANCEL + manifest.status='cancelling', invoke the run-loop teardown path) → manifest transitions to status='cancelled'. (Test may stub the higher run loop and only exercise the small writer helper.)
  </behavior>
  <action>
    1. Create `apps/factory-cli/src/commands/cancel.ts`:
       - At the top, add a comment block: `/* NOTE: distinct from apps/factory-cli/src/cancel.ts (which is the in-process installCancelWiring helper from Phase 6). This module is the OUT-OF-PROCESS cancel command per Phase 9 Q-16. */`
       - Builder via `Command`. Positional arg `<runId>`. `.exitOverride()`, `.configureOutput`.
       - `executeCancel(opts)`:
         a. parseRunId → not-ok → ExitCode.UsageOrArgError; writeStderr(reason).
         b. assertRunIdConfined.
         c. Resolve runDir, manifestPath = path.join(runDir, "manifest.json"), sentinelPath = path.join(runDir, "CANCEL").
         d. Read manifest. Missing/parse fail → ExitCode.NotFound; writeStderr("no manifest at "+runDir).
         e. If manifest.status ∈ {"completed","blocked","cancelled"} → writeStdoutJson({runId, error: 'already-terminal', terminalStatus: manifest.status}); writeStderr(`run ${runId} is already ${manifest.status}`); return ExitCode.Conflict.
         f. Compute newManifest = setFactoryRunStatus(manifest, "cancelling").
         g. Atomic tmp+rename write: `fs.writeFile(tmp, JSON.stringify(newManifest, null, 2)); fs.rename(tmp, manifestPath)`. (Match the existing tmp+rename pattern in apps/factory-cli/src/snapshot-writer.ts — reuse if it exposes a generic atomic-write helper; otherwise inline.)
         h. Touch sentinel: `fs.writeFile(sentinelPath, "")`.
         i. writeStdoutJson({runId, action: 'cancelling-requested', sentinelPath, manifestStatus: 'cancelling'}); return ExitCode.Success.
    2. Wire into main.ts: `program.addCommand(buildCancelCommand());`.
    3. Add the `cancelling → cancelled` transition writer to main.ts's run-loop teardown:
       - Find the existing `installCancelWiring`-driven teardown (it's where `rootController.abort('sentinel')` causes the run to exit). The current teardown likely sets manifest.status='blocked' or similar.
       - On abort cause = sentinel (i.e., when the run was cancelled by sentinel), explicitly transition manifest to `'cancelled'` via `setFactoryRunStatus`. Atomic tmp+rename write.
       - If the abort cause was something else (timeout, error), preserve existing behavior (do NOT mark cancelled).
       - The exact location: search main.ts for the cancel-cause check (likely inside the catch around runFactory's main body or in a teardown callback registered with installCancelWiring). Add the cancelled-status write next to the existing terminal status writes.
       - Add a small unit test covering the writer in isolation (see `<behavior>` last bullet) — extract the writer into a helper if needed for testability.
    4. Write `apps/factory-cli/src/commands/cancel.test.ts` covering all `<behavior>` cases. Use tmpdir runs root; build minimal manifest fixtures via `setFactoryRunStatus` on a base manifest builder.
    5. Run `pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test` and `pnpm run verify`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^cancel'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function buildCancelCommand' apps/factory-cli/src/commands/cancel.ts` is 1
    - `grep -c 'addCommand(buildCancelCommand' apps/factory-cli/src/main.ts` is 1
    - `grep -cE "'cancelling'" apps/factory-cli/src/commands/cancel.ts` is at least 1
    - `grep -cE "'already-terminal'" apps/factory-cli/src/commands/cancel.ts` is at least 1
    - `grep -cE 'cancelling-requested' apps/factory-cli/src/commands/cancel.ts` is at least 1
    - `grep -cE "'cancelled'" apps/factory-cli/src/main.ts | grep -v '^#'` is at least 1 (new transition writer)
    - `grep -cE 'rename\\(' apps/factory-cli/src/commands/cancel.ts` is at least 1 (atomic write)
    - `pnpm --filter @protostar/factory-cli test` exits 0
  </acceptance_criteria>
  <done>cancel command live; terminal refusal returns 4; atomic write + sentinel work; main.ts teardown writes 'cancelled' on sentinel-driven abort.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Out-of-process writer → manifest.json | Two writers (cancel command + run loop) on the same file; tmp+rename ensures no torn writes; ordering is non-strict (Pitfall 6) |
| stdout JSON | Pipeable success or terminal-error payload |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-06-01 | Tampering | runId path traversal | mitigate | parseRunId + assertRunIdConfined (Q-19). |
| T-09-06-02 | Tampering | torn manifest write | mitigate | Atomic tmp+rename (Phase 6 Q-07 pattern). |
| T-09-06-03 | Race / Lost Update | cancel-write vs run-loop manifest write | accept | Q-16 explicit: cancelling → completed if run loop finishes a stage; documented in --help and code comment (Pitfall 6). |
| T-09-06-04 | DoS | repeated cancels | mitigate | Double-cancel returns exit 4 with terminal-status payload; sentinel idempotent (write empty file). |
| T-09-06-05 | Repudiation | resume past cancel | mitigate | Plan 09-07 reads manifest.status='cancelled' and refuses resume (Q-15). |
</threat_model>

<verification>
- `pnpm --filter @protostar/factory-cli test` clean (new cancel.test.ts + regression)
- `pnpm run verify` clean
</verification>

<success_criteria>
- cancel command writes manifest 'cancelling' + sentinel
- terminal manifests refuse with exit 4 + JSON payload
- run-loop teardown transitions 'cancelling' → 'cancelled' on sentinel-caused abort
- runId regex + path-confinement enforced
</success_criteria>

<output>
Create `.planning/phases/09-operator-surface-resumability/09-06-SUMMARY.md` summarizing the cancel command, the atomic write pattern, the sentinel touch, and the new 'cancelled' transition writer in main.ts.
</output>
