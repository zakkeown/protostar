---
phase: 04-execution-engine
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - packages/execution/src/adapter-contract.ts
  - packages/execution/src/adapter-contract.test.ts
  - packages/execution/src/journal-types.ts
  - packages/execution/src/journal-types.test.ts
  - packages/execution/src/index.ts
autonomous: true
requirements: [EXEC-02, EXEC-04, EXEC-08]
must_haves:
  truths:
    - "ExecutionAdapter interface exists with `execute(task, ctx) → AsyncIterable<AdapterEvent>` and `id: string`"
    - "AdapterEvent discriminated union has exactly these kinds: token, tool-call, progress, final"
    - "AdapterResult has exactly two outcomes: change-set, adapter-failed"
    - "AdapterContext exposes typed budget (taskWallClockMs, adapterRetriesPerTask) and network (allow, allowedHosts?) fields ahead of the schema bump in Plan 07"
    - "TaskJournalEvent discriminated union has six kinds: task-pending, task-running, task-succeeded, task-failed, task-timeout, task-cancelled"
    - "Exhaustiveness tests fail to compile if a new variant is added without consumer update"
  artifacts:
    - path: packages/execution/src/adapter-contract.ts
      provides: "ExecutionAdapter, AdapterEvent, AdapterResult, AdapterContext, AdapterFailureReason types"
    - path: packages/execution/src/journal-types.ts
      provides: "TaskJournalEvent discriminated union + ExecutionSnapshot type"
  key_links:
    - from: "packages/execution/src/index.ts"
      to: "adapter-contract.ts + journal-types.ts"
      via: "barrel re-export"
      pattern: "export \\* from \"./adapter-contract"
---

<objective>
Define the `ExecutionAdapter` contract and `TaskJournalEvent` discriminated union as TYPES ONLY. No I/O, no fs, no implementation — pure contract pins. This is the load-bearing artifact every Wave 1 and Wave 2 plan depends on.

Per advisor note (constraint #2): adapter contract MUST type-bind the envelope budget+network fields in TS BEFORE the schema bump (Plan 07) so Wave 1 tests can construct envelopes.

Purpose: Lock the public surface of execution + adapter contracts in Wave 0; downstream waves implement against frozen types.
Output: Two new contract files (`adapter-contract.ts`, `journal-types.ts`), exhaustiveness tests, barrel re-export from `index.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-execution-engine/04-CONTEXT.md
@.planning/phases/04-execution-engine/04-RESEARCH.md
@.planning/phases/04-execution-engine/04-PATTERNS.md
@packages/execution/src/admitted-plan-input.contract.ts
@packages/repo/src/index.ts

<interfaces>
Reference shapes from RESEARCH.md §"Pattern 1" + CONTEXT Q-05/Q-06/Q-08/Q-14/Q-15/Q-18:

```typescript
// adapter-contract.ts
import type { RepoChangeSet } from "@protostar/repo";
import type { CapabilityEnvelope, ConfirmedIntent } from "@protostar/intent";

export interface ExecutionAdapter {
  readonly id: string;                 // e.g. "lmstudio-coder"
  execute(task: ExecutionAdapterTaskInput, ctx: AdapterContext): AsyncIterable<AdapterEvent>;
}

export interface ExecutionAdapterTaskInput {
  readonly planTaskId: string;
  readonly title: string;
  readonly targetFiles: readonly string[]; // ≥1 (Q-11)
  readonly adapterRef?: string;            // Q-08
}

export interface AdapterContext {
  readonly signal: AbortSignal;
  readonly confirmedIntent: ConfirmedIntent;
  readonly resolvedEnvelope: CapabilityEnvelope; // already typed for 1.3.0 fields below
  readonly repoReader: RepoReader;
  readonly journal: AdapterJournalWriter;
  // typed views into the upcoming 1.3.0 envelope (Plan 07 enforces schema):
  readonly budget: { taskWallClockMs: number; adapterRetriesPerTask: number };
  readonly network: { allow: "none" | "loopback" | "allowlist"; allowedHosts?: readonly string[] };
}

export interface RepoReader {
  readFile(path: string): Promise<{ bytes: Uint8Array; sha256: string }>;
  glob(pattern: string): Promise<readonly string[]>;
}

export interface AdapterJournalWriter {
  appendToken(taskId: string, attempt: number, text: string): Promise<void>;
}

export type AdapterEvent =
  | { readonly kind: "token"; readonly text: string }
  | { readonly kind: "tool-call"; readonly name: string; readonly args: unknown }
  | { readonly kind: "progress"; readonly message: string }
  | { readonly kind: "final"; readonly result: AdapterResult };

export type AdapterResult =
  | { readonly outcome: "change-set"; readonly changeSet: RepoChangeSet; readonly evidence: AdapterEvidence }
  | { readonly outcome: "adapter-failed"; readonly reason: AdapterFailureReason; readonly evidence: AdapterEvidence };

export type AdapterFailureReason =
  | "parse-no-block" | "parse-multiple-blocks" | "parse-reformat-failed"
  | "lmstudio-unreachable" | "lmstudio-http-error" | "lmstudio-model-not-loaded"
  | "retries-exhausted" | "aborted" | "timeout" | "aux-read-budget-exceeded";

export interface AdapterEvidence {
  readonly model: string;
  readonly attempts: number;
  readonly durationMs: number;
  readonly auxReads: readonly { readonly path: string; readonly sha256: string }[];
  readonly retries: readonly {
    readonly attempt: number;
    readonly retryReason: "transient" | "parse-reformat";
    readonly errorClass?: string;
    readonly durationMs: number;
  }[];
}
```

```typescript
// journal-types.ts
import type { StageArtifactRef } from "@protostar/artifacts";

export type TaskJournalEventKind =
  | "task-pending" | "task-running" | "task-succeeded"
  | "task-failed" | "task-timeout" | "task-cancelled";

export interface TaskJournalEventBase {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly planTaskId: string;
  readonly at: string;          // ISO 8601
  readonly attempt: number;     // 1-based
  readonly seq: number;         // monotonic per run
}

export type TaskJournalEvent = TaskJournalEventBase & (
  | { readonly kind: "task-pending" }
  | { readonly kind: "task-running" }
  | { readonly kind: "task-succeeded"; readonly evidenceArtifact: StageArtifactRef }
  | { readonly kind: "task-failed";    readonly reason: string; readonly retryReason?: "transient" | "parse-reformat" | "orphaned-by-crash"; readonly errorClass?: string; readonly evidenceArtifact?: StageArtifactRef }
  | { readonly kind: "task-timeout";   readonly evidenceArtifact?: StageArtifactRef }
  | { readonly kind: "task-cancelled"; readonly cause: "sigint" | "sentinel" | "abort"; readonly evidenceArtifact?: StageArtifactRef }
);

export interface ExecutionSnapshot {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly generatedAt: string;
  readonly lastEventSeq: number;
  readonly tasks: Readonly<Record<string, {
    readonly status: "pending" | "running" | "succeeded" | "failed" | "timeout" | "cancelled";
    readonly attempt: number;
    readonly evidenceArtifact?: StageArtifactRef;
    readonly lastTransitionAt: string;
  }>>;
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: adapter-contract.ts + tests (RED→GREEN)</name>
  <files>packages/execution/src/adapter-contract.ts, packages/execution/src/adapter-contract.test.ts</files>
  <read_first>
    - packages/execution/src/admitted-plan-input.contract.ts (naming + structural template)
    - packages/repo/src/index.ts (RepoChangeSet shape)
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Pattern 1: AsyncIterable streaming adapter"
    - .planning/phases/04-execution-engine/04-PATTERNS.md §"adapter-contract.ts"
  </read_first>
  <behavior>
    - Test 1: Construct a mock `ExecutionAdapter` with `id: "test-mock"` whose `execute()` yields exactly one `final` event with `outcome: "change-set"`. Assert the consumer reads `result.changeSet`.
    - Test 2: Construct a mock yielding `token` then `final` with `outcome: "adapter-failed"`, `reason: "parse-no-block"`. Consumer asserts.
    - Test 3: AdapterFailureReason exhaustiveness — `never`-switch over all reasons compiles; adding a synthetic reason must fail the type check (commented stub).
    - Test 4: AdapterContext budget/network fields are accessible as typed numbers/literal-unions (constructible without the schema bump landing).
  </behavior>
  <action>
    Create `packages/execution/src/adapter-contract.ts` per the `<interfaces>` block verbatim. Mirror naming convention from `admitted-plan-input.contract.ts` (file name suffix `.contract.ts` is reserved for type-pin files; this is a contract MODULE, so use `adapter-contract.ts` per PATTERNS.md). Use `export type` for unions and `export interface` for structural types. Re-export from `packages/execution/src/index.ts` via `export * from "./adapter-contract.js";`.
    Create `packages/execution/src/adapter-contract.test.ts` per behaviors. For Test 3, include an `assertNever`-style helper:
    ```ts
    function assertExhaustive(x: never): never { throw new Error(String(x)); }
    function classify(r: AdapterFailureReason): string {
      switch (r) {
        case "parse-no-block": case "parse-multiple-blocks": case "parse-reformat-failed":
        case "lmstudio-unreachable": case "lmstudio-http-error": case "lmstudio-model-not-loaded":
        case "retries-exhausted": case "aborted": case "timeout": case "aux-read-budget-exceeded":
          return r;
        default: return assertExhaustive(r);
      }
    }
    ```
    Tests use `node:test` against compiled `dist/*.test.js`. Mock adapter via async generator function. NO `node:fs`, NO `node:net` imports — pure contract.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/execution test 2>&1 | tail -20 && grep -c "AsyncIterable<AdapterEvent>" packages/execution/src/adapter-contract.ts && ! grep -E "node:fs|node:net|fetch\(" packages/execution/src/adapter-contract.ts</automated>
  </verify>
  <acceptance_criteria>
    - `packages/execution/src/adapter-contract.ts` exists, exports `ExecutionAdapter`, `AdapterEvent`, `AdapterResult`, `AdapterContext`, `AdapterFailureReason`, `RepoReader`, `AdapterEvidence`
    - `grep -c 'AsyncIterable<AdapterEvent>' packages/execution/src/adapter-contract.ts` ≥ 1
    - `grep -E 'node:fs|node:net' packages/execution/src/adapter-contract.ts` returns nothing (exit 1)
    - All tests pass
    - `index.ts` barrel re-exports the new module
  </acceptance_criteria>
  <done>Adapter contract pinned; Wave 1 plans can import the type surface.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: journal-types.ts + exhaustiveness test</name>
  <files>packages/execution/src/journal-types.ts, packages/execution/src/journal-types.test.ts, packages/execution/src/index.ts</files>
  <read_first>
    - packages/execution/src/adapter-contract.ts (created in Task 1)
    - packages/intent/schema/capability-admission-decision.schema.json (schemaVersion const pattern)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-02
  </read_first>
  <behavior>
    - Test 1: Construct one of each `TaskJournalEvent.kind`; pattern-match exhaustively via `never`-switch.
    - Test 2: `task-failed` event with `retryReason: "orphaned-by-crash"` is constructible (Q-03 path).
    - Test 3: `task-cancelled` requires `cause: "sigint" | "sentinel" | "abort"` — type rejects free string.
    - Test 4: `ExecutionSnapshot.tasks` keys are planTaskIds; values carry status + attempt + lastTransitionAt.
  </behavior>
  <action>
    Create `packages/execution/src/journal-types.ts` per `<interfaces>` verbatim. Add `schemaVersion: "1.0.0"` as `const` literal type — matches `packages/intent/schema/capability-admission-decision.schema.json` posture.
    Add barrel re-export to `packages/execution/src/index.ts`: `export * from "./journal-types.js";`.
    Tests: pattern-match exhaustiveness with assertNever helper; build a sample event of each kind; serialize via `JSON.stringify` round-trip and assert keys match.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/execution test 2>&1 | tail -20 && grep -c "task-orphan\|orphaned-by-crash" packages/execution/src/journal-types.ts && grep -c "ExecutionSnapshot" packages/execution/src/journal-types.ts</automated>
  </verify>
  <acceptance_criteria>
    - `packages/execution/src/journal-types.ts` exists; exports `TaskJournalEvent`, `TaskJournalEventKind`, `ExecutionSnapshot`
    - `grep -c 'orphaned-by-crash' packages/execution/src/journal-types.ts` ≥ 1
    - `grep -c '"1.0.0"' packages/execution/src/journal-types.ts` ≥ 1
    - All tests pass
    - `index.ts` barrel re-exports
  </acceptance_criteria>
  <done>Journal+snapshot type surface pinned; Plan 09 implements pure formatters against this contract.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| execution package public types ↔ Wave 1+ consumers | type drift = silent semantic break |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-04-03 | Tampering | AdapterFailureReason union | mitigate | Exhaustiveness test (Task 1) catches additions |
| T-04-04 | Repudiation | TaskJournalEvent missing schemaVersion | mitigate | `schemaVersion: "1.0.0"` const literal in base type forces every event to carry it |
| T-04-05 | Information Disclosure | AdapterEvidence leaking secrets through `errorClass` | accept | errorClass is a class name (e.g. "TypeError"), not a message; transcript.json carries full message under operator's local-only run bundle |
</threat_model>

<verification>
- `pnpm --filter @protostar/execution test` green
- No fs/network imports in either new file
- Both files re-exported from `index.ts`
</verification>

<success_criteria>
- ExecutionAdapter contract is the only AsyncIterable shape exported from `@protostar/execution`
- TaskJournalEvent has all six kinds matching state machine vocab
- AdapterContext typed-mirrors the 1.3.0 envelope additions ahead of schema bump
</success_criteria>

<output>
Create `.planning/phases/04-execution-engine/04-02-SUMMARY.md`: lists the new exports, mock-adapter usage example, and a note that all Wave 1 plans import from this contract surface.
</output>
