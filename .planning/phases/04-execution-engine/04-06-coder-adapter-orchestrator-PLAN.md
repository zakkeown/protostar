---
phase: 04-execution-engine
plan: 06
type: execute
wave: 3
depends_on: [02, 03, 04, 05]
files_modified:
  - packages/lmstudio-adapter/src/coder-adapter.ts
  - packages/lmstudio-adapter/src/coder-adapter.test.ts
  - packages/lmstudio-adapter/src/coder-adapter-retry.test.ts
  - packages/lmstudio-adapter/src/coder-adapter-timeout.test.ts
  - packages/lmstudio-adapter/src/index.ts
autonomous: true
requirements: [EXEC-02, EXEC-03, EXEC-05, EXEC-06, EXEC-07]
must_haves:
  truths:
    - "`createLmstudioCoderAdapter(config)` returns an `ExecutionAdapter` with `id: 'lmstudio-coder'`"
    - "`execute(task, ctx)` returns `AsyncIterable<AdapterEvent>` ending with exactly one `final` event"
    - "Adapter computes pre-image SHA-256 for every targetFile via `ctx.repoReader.readFile` (Hash 1 of 2 — Phase 4 Q-06)"
    - "Adapter ENFORCES auxRead budget N=3; over-budget reads → `final` with `outcome:'adapter-failed', reason:'aux-read-budget-exceeded'`"
    - "On parse-no-block: one reformat retry; on second parse failure → `parse-reformat-failed`"
    - "Transient failures retry with backoff bounded by `ctx.budget.adapterRetriesPerTask`; cap exhausted → `retries-exhausted`"
    - "Per-task timeout via `ctx.signal` chained to a per-task AbortController; mid-stream abort → `final` with `reason:'timeout'`"
    - "Per-attempt detail (latencyMs, errorClass, retryReason) recorded in `evidence.retries[]`"
    - "Each token delta yielded as `{kind:'token'}` AND appended via `ctx.journal.appendToken`"
  artifacts:
    - path: packages/lmstudio-adapter/src/coder-adapter.ts
      provides: "LM Studio Coder ExecutionAdapter"
      exports: ["createLmstudioCoderAdapter", "LmstudioAdapterConfig"]
  key_links:
    - from: "packages/lmstudio-adapter/src/coder-adapter.ts"
      to: "ctx.repoReader (two-hash dance — Hash 1 of 2)"
      via: "readFile().sha256"
      pattern: "Hash 1 of 2"
    - from: "packages/lmstudio-adapter/src/coder-adapter.ts"
      to: "@protostar/execution retry-classifier + backoff"
      via: "retry loop"
      pattern: "isTransientFailure|nextBackoffMs"
---

<objective>
Compose Plan 04+05 helpers into the streaming `ExecutionAdapter`. This is the load-bearing tie between contract (Plan 02), helpers (Plan 04, 05), and stub fixture (Plan 03). It implements EXEC-02/03/05/06/07 in a single coherent module.

Per advisor (constraint #2 + #4): Wave 2 (Plan 07) does the schema bump; this plan reads `ctx.budget` and `ctx.network` as TYPED fields off the AdapterContext (Plan 02 typed them ahead).

Purpose: Working Coder adapter end-to-end against the stub server with full retry, timeout, and parse-reformat coverage.
Output: One module + three test files (happy path / retry / timeout); all pass against stubs.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-execution-engine/04-CONTEXT.md
@.planning/phases/04-execution-engine/04-RESEARCH.md
@.planning/phases/04-execution-engine/04-PATTERNS.md
@packages/execution/src/adapter-contract.ts
@packages/execution/src/retry-classifier.ts
@packages/execution/src/backoff.ts
@packages/lmstudio-adapter/src/sse-parser.ts
@packages/lmstudio-adapter/src/diff-parser.ts
@packages/lmstudio-adapter/src/prompt-builder.ts
@packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts
@packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts

<interfaces>
```typescript
import type { ExecutionAdapter, AdapterEvent, AdapterResult, AdapterContext, ExecutionAdapterTaskInput, AdapterEvidence } from "@protostar/execution";

export interface LmstudioAdapterConfig {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;                // resolved from env at adapter-creation time
  readonly temperature?: number;          // default 0.2
  readonly topP?: number;                 // default 0.9
  readonly auxReadBudget?: number;        // default 3 (Q-11)
  readonly rng?: () => number;            // default Math.random — tests inject deterministic
}

export function createLmstudioCoderAdapter(config: LmstudioAdapterConfig): ExecutionAdapter;
```

Adapter ID: `"lmstudio-coder"` (used by allowedAdapters in Plan 08).

Behavior contract (composes Plan 02 contract + Plan 05 helpers + Plan 03 stub for tests):
1. Read all `task.targetFiles` via `ctx.repoReader.readFile` — record each as `{path, sha256}` for evidence (this is Hash 1 of 2 — Phase 4 Q-06).
2. Build messages via `buildCoderMessages`.
3. Loop attempts (1..adapterRetriesPerTask):
   a. POST `{baseUrl}/chat/completions` stream:true with `signal: chainedAbortSignal`.
   b. If `!res.ok`: classify via `isTransientFailure({kind:"http", status})`. If transient and attempts remain: backoff + retry. Else terminal `final {outcome:"adapter-failed", reason: "lmstudio-http-error"}` (or retries-exhausted).
   c. Stream tokens: for each delta with `content`, yield `{kind:"token", text}` and `ctx.journal.appendToken(taskId, attempt, text)`.
   d. On `[DONE]`: assemble assistant content, call `parseDiffBlock`. If `ok`: build `RepoChangeSet` from diff (one ChangeSetEntry per `--- a/...` header — see implementation note); yield `{kind:"final", result: {outcome:"change-set", changeSet, evidence}}`.
   e. If `parse-no-block` AND `attempt === 1`: build `buildReformatNudgeMessages`, set `retryReason: "parse-reformat"`, continue loop (does NOT consume backoff). If parse fails again: `parse-reformat-failed`.
   f. If `parse-multiple-blocks`: terminal `parse-multiple-blocks` (no retry — model is confused, won't recover).
   g. On fetch throw: classify via `isTransientFailure({kind:"error", error})`. AbortError + signal.aborted because of timeout → `reason:"timeout"`. AbortError otherwise → `aborted`. Transient → retry. Else → `lmstudio-unreachable` or `lmstudio-http-error`.
4. Aux-read budget enforcement: track aux reads (anything not in `task.targetFiles`); if `auxReadBudget` exceeded → terminal `aux-read-budget-exceeded`. (Plan ships budget plumbing; v0.1 prompt doesn't trigger aux reads, but the budget is enforced.)

Implementation note on RepoChangeSet construction: `RepoChangeSet` per Phase 3 has `{ entries: ChangeSetEntry[] }` where each entry is `{ path, op, diff, preImageSha256 }`. Adapter splits the unified diff on `--- a/...` headers, attaches the matching pre-image hash from step 1 to each entry. If the diff references a path not in `targetFiles` AND aux-reads not allowed → fail with `parse-no-block` (model is hallucinating files).

Code comment requirement: at the pre-image hash site, add literal comment `// Hash 1 of 2 — see Phase 4 Q-06. Do not collapse with apply-time hash in repo.applyChangeSet (Hash 2 of 2 — Phase 3 Q-10).` This is the only defense against the future-refactor failure mode (RESEARCH Pitfall 4).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Coder adapter happy path + parse-reformat</name>
  <files>packages/lmstudio-adapter/src/coder-adapter.ts, packages/lmstudio-adapter/src/coder-adapter.test.ts, packages/lmstudio-adapter/src/index.ts</files>
  <read_first>
    - packages/execution/src/adapter-contract.ts
    - packages/lmstudio-adapter/src/sse-parser.ts, diff-parser.ts, prompt-builder.ts
    - packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts (Plan 03)
    - packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts
    - packages/repo/src/index.ts (RepoChangeSet shape)
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Pitfall 4: Two-hash dance silently disabled"
  </read_first>
  <behavior>
    - Test 1 (happy): Stub server emits `cosmeticTweakFixture.expectedDiffSample` chunks; adapter yields ≥1 `token` event; final event has `outcome:"change-set"`; `result.changeSet.entries[0].path === "src/Button.tsx"`; `entries[0].preImageSha256` matches the SHA computed from `cosmeticTweakFixture.preImageBytes["src/Button.tsx"]`.
    - Test 2 (parse-reformat success): Stub emits `proseDriftDiffSample` on attempt 1, then `expectedDiffSample` on attempt 2; final `outcome:"change-set"`; `evidence.attempts === 2`; `evidence.retries[0].retryReason === "parse-reformat"`.
    - Test 3 (parse-reformat failure): Stub emits prose-only on both attempts; final `outcome:"adapter-failed", reason:"parse-reformat-failed"`.
    - Test 4 (multiple blocks): Stub emits two fences; final `reason:"parse-multiple-blocks"` immediately (no retry).
    - Test 5 (token streaming): Capture every `{kind:"token"}` event; concatenated `text` equals the assistant content emitted by the stub. Each token also appears in `ctx.journal.appendToken` calls (mock journal collects them).
    - Test 6 (Hash 1 of 2): Adapter reads each `targetFile` exactly once via `ctx.repoReader.readFile`; the resulting `sha256` is attached to the corresponding `entries[*].preImageSha256`. Pin the literal code comment `Hash 1 of 2` exists in the source via grep test.
  </behavior>
  <action>
    Create `packages/lmstudio-adapter/src/coder-adapter.ts` per `<interfaces>`. Structure:
    ```ts
    export function createLmstudioCoderAdapter(config: LmstudioAdapterConfig): ExecutionAdapter {
      return {
        id: "lmstudio-coder",
        async *execute(task, ctx) {
          // 1. read pre-images (Hash 1 of 2 — Phase 4 Q-06)
          const preImages = new Map<string, { bytes: Uint8Array; sha256: string }>();
          for (const path of task.targetFiles) {
            const r = await ctx.repoReader.readFile(path);
            preImages.set(path, r);
          }
          // 2. build messages
          let messages = buildCoderMessages({ task, fileContents: ..., acceptanceCriteria: ctx.confirmedIntent.acceptanceCriteria, archetype: ctx.confirmedIntent.archetype });
          // 3. retry loop
          const maxAttempts = ctx.budget.adapterRetriesPerTask;
          const retries: AdapterEvidence["retries"] = [];
          let assistantContent = "";
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const t0 = Date.now();
            try {
              const res = await fetch(`${config.baseUrl}/chat/completions`, { method:"POST", headers:{...}, body: JSON.stringify({model: config.model, messages: messages.messages, stream: true, temperature: config.temperature ?? 0.2, top_p: config.topP ?? 0.9}), signal: ctx.signal });
              if (!res.ok || !res.body) { /* classify, retry-or-fail */ }
              assistantContent = "";
              for await (const ev of parseSseStream(res.body)) {
                if (ev.data === "[DONE]") break;
                const chunk = JSON.parse(ev.data); const delta = chunk?.choices?.[0]?.delta?.content;
                if (typeof delta === "string" && delta.length > 0) {
                  assistantContent += delta;
                  yield { kind: "token", text: delta };
                  await ctx.journal.appendToken(task.planTaskId, attempt, delta);
                }
              }
              // parse
              const parsed = parseDiffBlock(assistantContent);
              if (parsed.ok) { /* build changeSet, yield final */ return; }
              if (parsed.reason === "parse-multiple-blocks") { /* yield final */ return; }
              // parse-no-block: try reformat once
              if (attempt === 1) {
                messages = buildReformatNudgeMessages(messages, assistantContent);
                retries.push({ attempt, retryReason: "parse-reformat", durationMs: Date.now() - t0 });
                continue;
              }
              // already retried once
              yield { kind: "final", result: { outcome: "adapter-failed", reason: "parse-reformat-failed", evidence: ... } }; return;
            } catch (err) {
              if (signalIsAborted(ctx.signal)) { /* yield final timeout/aborted */ return; }
              if (isTransientFailure({kind:"error", error: err}) && attempt < maxAttempts) {
                const delay = nextBackoffMs(attempt, config.rng ?? Math.random);
                retries.push({ attempt, retryReason: "transient", errorClass: errClass(err), durationMs: Date.now() - t0 });
                await sleep(delay, ctx.signal);
                continue;
              }
              // exhausted or non-transient
              yield { kind: "final", result: { outcome: "adapter-failed", reason: attempt >= maxAttempts ? "retries-exhausted" : "lmstudio-unreachable", evidence: ... } };
              return;
            }
          }
        },
      };
    }
    ```
    ChangeSet construction: parse the unified-diff content for each `--- a/<path>` header; build one `ChangeSetEntry` per file with `op: "modify"`, `diff: <hunk text>`, `preImageSha256: preImages.get(path)!.sha256`. If a path isn't in `preImages` → fail (`parse-no-block`).
    Add the mandated comment at the pre-image read site.
    Tests use stub server (Plan 03) with cosmetic-tweak fixture. Mock `ctx.repoReader` returns `cosmeticTweakFixture.preImageBytes`. Mock `ctx.journal.appendToken` collects calls. Use `createDeterministicRng` for backoff.
    Barrel re-export: `export { createLmstudioCoderAdapter, type LmstudioAdapterConfig } from "./coder-adapter.js";`.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/lmstudio-adapter test 2>&1 | tail -30 && grep -c "Hash 1 of 2" packages/lmstudio-adapter/src/coder-adapter.ts && grep -c "parse-reformat" packages/lmstudio-adapter/src/coder-adapter.ts</automated>
  </verify>
  <acceptance_criteria>
    - `coder-adapter.ts` exists; barrel re-exports
    - `grep -c "Hash 1 of 2" packages/lmstudio-adapter/src/coder-adapter.ts` ≥ 1
    - All 6 tests pass against stub server
    - `outcome:"change-set"` carries entries with correct `preImageSha256` (matches `cosmeticTweakFixture.preImageBytes` SHA)
  </acceptance_criteria>
  <done>Adapter happy path + parse-reformat green; load-bearing for Plan 10's wiring.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Retry on transient HTTP + retries-exhausted</name>
  <files>packages/lmstudio-adapter/src/coder-adapter-retry.test.ts</files>
  <read_first>
    - packages/lmstudio-adapter/src/coder-adapter.ts (Task 1)
    - packages/execution/src/retry-classifier.ts, backoff.ts (Plan 05)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-14
  </read_first>
  <behavior>
    - Test 1 (503 then 200): Stub returns 503 on first request, then a successful diff stream on second. Adapter retries; final `outcome:"change-set"`; `evidence.retries[0].retryReason === "transient"`; `evidence.attempts === 2`.
    - Test 2 (4 attempts exhausted): Stub returns 503 on every request. Adapter retries up to `ctx.budget.adapterRetriesPerTask = 4`. Final `outcome:"adapter-failed", reason:"retries-exhausted"`; `evidence.attempts === 4`; `evidence.retries.length === 3` (no retry recorded for the final terminal attempt — it's the `attempts` count that captures it).
    - Test 3 (envelope cap respected): With `ctx.budget.adapterRetriesPerTask = 2`, stub returns 503 every time → terminal after attempt 2.
    - Test 4 (4xx non-transient): Stub returns 401 → terminal `lmstudio-http-error` immediately (no retry); `evidence.attempts === 1`.
    - Test 5 (network error): Use a closed port so fetch throws ECONNREFUSED → retry; second attempt against open stub succeeds.
    - Test 6 (deterministic backoff): Inject seeded RNG into config; assert backoff delays equal `nextBackoffMs(1, seededRng), nextBackoffMs(2, seededRng), ...` exactly.
  </behavior>
  <action>
    Add `packages/lmstudio-adapter/src/coder-adapter-retry.test.ts`. Use stub server's `chatStatus` and `closeAfterChunks` options. For Test 5, start stub on port P, close it, point first request at P (will fail), then start a NEW stub on a different port and have a custom `fetchImpl` that retargets the second call. Or simpler: use stub's `chatStatus: 503` for first request and a hook to flip it to 200 for the second.
    The implementation in Task 1 must already support this — these tests verify it. If a behavior is missing, fix in coder-adapter.ts.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/lmstudio-adapter test 2>&1 | tail -25</automated>
  </verify>
  <acceptance_criteria>
    - Test file exists with 6 cases
    - All pass
    - `evidence.retries` carries `retryReason: "transient"` for HTTP/network retries
  </acceptance_criteria>
  <done>EXEC-06 covered with budget-bounded retries.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Per-task timeout + abort handling</name>
  <files>packages/lmstudio-adapter/src/coder-adapter-timeout.test.ts</files>
  <read_first>
    - packages/lmstudio-adapter/src/coder-adapter.ts (Task 1)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-15, §Q-16
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Pitfall 2: AbortSignal leaks listeners"
  </read_first>
  <behavior>
    - Test 1 (timeout mid-stream): Stub `delayMsBetweenChunks: 200`; AbortController with `setTimeout(() => controller.abort("timeout"), 100)` → final `outcome:"adapter-failed", reason:"timeout"`. SSE response stream is closed cleanly (no listener leak — assert no `MaxListenersExceededWarning` was emitted during test).
    - Test 2 (sigint-style abort): Manually `controller.abort("sigint")` mid-stream → final `outcome:"adapter-failed", reason:"aborted"`.
    - Test 3 (abort distinguishes from timeout): Convention — adapter inspects `signal.reason`. If `reason === "timeout"` → `reason:"timeout"`; else → `reason:"aborted"`.
    - Test 4 (timeout not classified as transient): After timeout, adapter does NOT retry — terminal immediately.
    - Test 5 (signal listener cleanup): Run 5 sequential aborted attempts; assert `process.listenerCount("warning")` does not grow and no warnings observed.
  </behavior>
  <action>
    Add `packages/lmstudio-adapter/src/coder-adapter-timeout.test.ts`. Convention for Test 3: adapter does:
    ```ts
    if (ctx.signal.aborted) {
      const reason = ctx.signal.reason === "timeout" ? "timeout" : "aborted";
      yield { kind: "final", result: { outcome: "adapter-failed", reason, evidence: ... } };
      return;
    }
    ```
    If implementation doesn't already support this distinction, update Task 1's adapter to honor `signal.reason`.
    Listener-cleanup test (Test 5): wrap each test attempt in `try { ... } finally { /* nothing */ }` and assert via `process.on('warning', spy)` that no `MaxListenersExceededWarning` is emitted.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/lmstudio-adapter test 2>&1 | tail -25</automated>
  </verify>
  <acceptance_criteria>
    - Test file exists with 5 cases
    - All pass
    - Adapter source distinguishes `timeout` vs `aborted` based on `signal.reason`
  </acceptance_criteria>
  <done>EXEC-07 covered; adapter cleanly aborts mid-stream without socket leaks.</done>
</task>

</tasks>

<threat_model>
| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-04-15 | Tampering (base drift) | Workspace mutated between adapter call and apply | mitigate | Hash 1 of 2 (Plan 06) + Hash 2 of 2 (Phase 3 applyChangeSet); both code-commented to prevent DRY refactor |
| T-04-16 | DoS | Slow stream consumes budget without progress | mitigate | `ctx.signal` carries the per-task wallclock timer (Plan 10 wires); adapter aborts cleanly |
| T-04-17 | Information Disclosure | Token stream contains sensitive workspace content | accept | Workspace is operator's local repo; stream log written to operator's local `.protostar/runs/{id}/`; no external transmission beyond LM Studio loopback |
| T-04-18 | Tampering | Hallucinated file path in diff (path not in targetFiles) | mitigate | ChangeSet builder rejects `--- a/<path>` headers not present in `preImages`; treats as `parse-no-block` |
</threat_model>

<verification>
- `pnpm --filter @protostar/lmstudio-adapter test` green for all three test files
- Source contains literal `// Hash 1 of 2 — see Phase 4 Q-06` comment
- No `node:fs` import in `coder-adapter.ts`
- All AdapterFailureReason literals from Plan 02 are reachable in tests
</verification>

<success_criteria>
- Adapter contract is satisfied (yields AsyncIterable ending in `final`)
- Happy path + 5 failure modes (parse-no-block→reformat, parse-reformat-failed, parse-multiple-blocks, retries-exhausted, timeout) all tested
- Two-hash dance code-commented at the read site
- Per-attempt evidence captured in `retries[]`
</success_criteria>

<output>
Create `.planning/phases/04-execution-engine/04-06-SUMMARY.md`: adapter event sequence, the failure-reason matrix, the budget cap mapping, and the location of the Hash 1 of 2 comment.
</output>
