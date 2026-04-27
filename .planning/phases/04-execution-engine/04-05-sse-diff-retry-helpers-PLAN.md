---
phase: 04-execution-engine
plan: 05
type: execute
wave: 2
depends_on: [02, 03, 04]
files_modified:
  - packages/lmstudio-adapter/src/sse-parser.ts
  - packages/lmstudio-adapter/src/sse-parser.test.ts
  - packages/lmstudio-adapter/src/diff-parser.ts
  - packages/lmstudio-adapter/src/diff-parser.test.ts
  - packages/lmstudio-adapter/src/prompt-builder.ts
  - packages/lmstudio-adapter/src/prompt-builder.test.ts
  - packages/execution/src/retry-classifier.ts
  - packages/execution/src/retry-classifier.test.ts
  - packages/execution/src/backoff.ts
  - packages/execution/src/backoff.test.ts
  - packages/execution/src/index.ts
  - packages/lmstudio-adapter/src/index.ts
autonomous: true
requirements: [EXEC-03, EXEC-06]
must_haves:
  truths:
    - "SSE parser yields `{data: string}` events from a `ReadableStream<Uint8Array>`; emits `{data: '[DONE]'}` then returns"
    - "SSE parser drains buffered events on every read; final pre-DONE chunk is never dropped (Pitfall 1)"
    - "Diff parser is strict: zero fences → parse-no-block; multiple fences → parse-multiple-blocks; one fence → ok"
    - "Retry classifier flags 408, 429, 500, 502, 503, 504, network errors, timeout errors as transient; everything else non-transient"
    - "Backoff: `min(16000, 1000 * 2^(attempt-1))` ± 20% jitter; deterministic with seeded RNG"
    - "Prompt builder produces a system+user message pair; user message includes targetFile contents fenced as ```{lang}` blocks"
  artifacts:
    - path: packages/lmstudio-adapter/src/sse-parser.ts
      provides: "Streaming SSE chunk parser"
      exports: ["parseSseStream"]
    - path: packages/lmstudio-adapter/src/diff-parser.ts
      provides: "Strict-fence diff extractor"
      exports: ["parseDiffBlock", "DIFF_FENCE_RE"]
    - path: packages/execution/src/retry-classifier.ts
      provides: "Transient-vs-permanent classifier"
      exports: ["isTransientFailure", "TRANSIENT_HTTP_STATUSES"]
    - path: packages/execution/src/backoff.ts
      provides: "Deterministic exponential backoff"
      exports: ["nextBackoffMs", "createDeterministicRng"]
  key_links:
    - from: "packages/lmstudio-adapter/src/sse-parser.ts"
      to: "node:undici fetch ReadableStream"
      via: "for-await with try/finally + releaseLock"
      pattern: "releaseLock"
---

<objective>
Ship the four pure helpers Wave 1's coder-adapter (Plan 06) and Wave 2's executor (Plans 09/10) compose: SSE parser, diff parser, retry classifier, backoff. Plus the prompt builder. All pure functions, all unit-tested. Retry/backoff live in `@protostar/execution` per advisor #1 (Wave 1's Plan 06 imports them; centralized so budget can be enforced in one place).

Per RESEARCH "Don't Hand-Roll" — these are precisely the modules that the codebase has zero analogs for and need first-principles correctness with explicit pitfall coverage.

Purpose: Finish Wave 1 helper layer; Plan 06 composes them into the streaming adapter.
Output: Five pure modules + tests; barrel re-exports from each owning package.
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
@packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts

<interfaces>
```typescript
// sse-parser.ts
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>
): AsyncIterable<{ readonly data: string }>;
// Yields one event per `data:` line(s). Treats `data: [DONE]` as terminal — yields it then returns.
// Drains buffer on every chunk read; never drops a complete event.
// On consumer break: try/finally `reader.releaseLock()`.

// diff-parser.ts
export const DIFF_FENCE_RE: RegExp;  // /^```(?:diff|patch)?\s*\n([\s\S]*?)\n```\s*$/m
export type DiffParseResult =
  | { readonly ok: true;  readonly diff: string }
  | { readonly ok: false; readonly reason: "parse-no-block" | "parse-multiple-blocks" };
export function parseDiffBlock(content: string): DiffParseResult;

// prompt-builder.ts
export interface PromptBuilderInput {
  readonly task: { readonly title: string; readonly targetFiles: readonly string[] };
  readonly fileContents: ReadonlyMap<string, string>;  // path → utf8
  readonly acceptanceCriteria: readonly string[];
  readonly archetype: string;
}
export interface CoderMessages {
  readonly messages: readonly { readonly role: "system" | "user"; readonly content: string }[];
}
export function buildCoderMessages(input: PromptBuilderInput): CoderMessages;
export function buildReformatNudgeMessages(prior: CoderMessages, priorAssistantContent: string): CoderMessages;
// Reformat retry: appends prior assistant + a system-style nudge "Output ONLY a single fenced ```diff block. No prose."

// retry-classifier.ts (in @protostar/execution)
export const TRANSIENT_HTTP_STATUSES: ReadonlySet<number>;  // {408, 429, 500, 502, 503, 504}
export function isTransientFailure(input:
  | { readonly kind: "http"; readonly status: number }
  | { readonly kind: "error"; readonly error: unknown }
): boolean;
// Network errors (ENOTFOUND, ECONNREFUSED, ECONNRESET) and timeout errors → transient.
// AbortError → NOT transient (caller-initiated cancel/timeout — handled separately).

// backoff.ts (in @protostar/execution)
export function nextBackoffMs(attempt: number, rng: () => number): number;
// min(16_000, 1000 * 2^(attempt-1)) + base * 0.2 * (rng()*2 - 1)
// Deterministic when rng is seeded.
export function createDeterministicRng(seed: number): () => number;
// Mulberry32 or similar; for tests.
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: SSE parser + tests</name>
  <files>packages/lmstudio-adapter/src/sse-parser.ts, packages/lmstudio-adapter/src/sse-parser.test.ts, packages/lmstudio-adapter/src/index.ts</files>
  <read_first>
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Reading SSE chunks from Node 22 fetch"
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Pitfall 1: SSE parser drops the final pre-DONE chunk"
    - packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts (Plan 03)
  </read_first>
  <behavior>
    - Test 1: Stream `data: a\n\ndata: b\n\ndata: [DONE]\n\n` → yields `{data:"a"}`, `{data:"b"}`, `{data:"[DONE]"}` then returns.
    - Test 2 (Pitfall 1): Stream `data: A\n\ndata: B\n\ndata: [DONE]\n\n` arriving as ONE chunk — all three yielded; B not dropped.
    - Test 3: Multi-line data — `data: line1\ndata: line2\n\n` → yields `{data:"line1\nline2"}`.
    - Test 4: Comment lines (`: heartbeat\n\n`) ignored.
    - Test 5: Empty events (just `\n\n`) skipped.
    - Test 6 (cleanup): Consumer breaks early after one event; reader is released (no socket leak — assert via subsequent `body.locked === false`).
    - Test 7: Stream ends without `[DONE]` → generator returns cleanly (no error).
    - Test 8: Stream chunked at arbitrary byte offsets (split a `data:` line in half) — still parses correctly.
  </behavior>
  <action>
    Create `packages/lmstudio-adapter/src/sse-parser.ts` per RESEARCH §"Reading SSE chunks". Use `TextDecoder({stream:true})`. Wrap loop in `try { ... } finally { reader.releaseLock(); }`. Drain buffer on every `read()` — keep splitting on `\n\n` until no more complete events.
    Yield `{data: "[DONE]"}` THEN return (consumer can switch on it).
    Reject `data:` payloads of length 0 (skip).
    Tests: construct `ReadableStream<Uint8Array>` from arrays of `Uint8Array`s using `ReadableStream.from()` or a manual `new ReadableStream({ start(c) { c.enqueue(...); c.close(); }})`. For Test 8, split one chunk's bytes across enqueue boundaries.
    Barrel re-export: `export { parseSseStream } from "./sse-parser.js";`.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/lmstudio-adapter test 2>&1 | tail -25 && grep -c "releaseLock" packages/lmstudio-adapter/src/sse-parser.ts</automated>
  </verify>
  <acceptance_criteria>
    - File exists; exports `parseSseStream`
    - `grep -c 'releaseLock' packages/lmstudio-adapter/src/sse-parser.ts` ≥ 1
    - All 8 tests pass
    - Pitfall 1 test (Test 2) passes — no dropped final chunk
  </acceptance_criteria>
  <done>SSE parsing handles every wire-format edge case the stub server emits.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Diff parser + prompt builder</name>
  <files>packages/lmstudio-adapter/src/diff-parser.ts, packages/lmstudio-adapter/src/diff-parser.test.ts, packages/lmstudio-adapter/src/prompt-builder.ts, packages/lmstudio-adapter/src/prompt-builder.test.ts, packages/lmstudio-adapter/src/index.ts</files>
  <read_first>
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-12
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Strict diff-fence parser" + §"Qwen3-Coder-Next prompting"
    - packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts (sample diffs)
  </read_first>
  <behavior diff-parser>
    - Test 1: `parseDiffBlock(cosmeticTweakFixture.expectedDiffSample)` → `{ ok: true, diff: <unified diff> }`.
    - Test 2: `parseDiffBlock(cosmeticTweakFixture.proseDriftDiffSample)` → `{ ok: false, reason: "parse-no-block" }` (regex requires fence at start of multiline match — prose preamble breaks `^```` anchor).
    - Test 3: Two fenced blocks → `{ ok: false, reason: "parse-multiple-blocks" }`.
    - Test 4: Bare fence (` ``` ` no `diff`/`patch` tag) → `{ ok: true, diff: <content> }`.
    - Test 5: ```` ```patch ``` ``` tag → ok.
    - Test 6: Empty content (no fence) → `parse-no-block`.
  </behavior>
  <behavior prompt-builder>
    - Test 7: `buildCoderMessages(input)` returns ≥2 messages: first `role: "system"`, second `role: "user"`.
    - Test 8: System prompt contains the literal "Output ONLY a single fenced ```diff block. No prose." substring.
    - Test 9: User prompt contains every `targetFiles` path AND the corresponding `fileContents` for each path, fenced.
    - Test 10: User prompt contains every acceptance criterion verbatim.
    - Test 11: `buildReformatNudgeMessages(prior, "Sure here it is...")` returns prior.messages + the assistant turn + a final system/user nudge with the literal string `"Output ONLY a single fenced"`.
  </behavior>
  <action diff-parser>
    Create `packages/lmstudio-adapter/src/diff-parser.ts`:
    ```ts
    export const DIFF_FENCE_RE = /^```(?:diff|patch)?\s*\n([\s\S]*?)\n```\s*$/m;
    export function parseDiffBlock(content: string): DiffParseResult {
      const matches = [...content.matchAll(/```(?:diff|patch)?\s*\n[\s\S]*?\n```/gm)];
      if (matches.length === 0) return { ok: false, reason: "parse-no-block" };
      if (matches.length > 1) return { ok: false, reason: "parse-multiple-blocks" };
      const m = matches[0]![0].match(DIFF_FENCE_RE);
      if (!m) return { ok: false, reason: "parse-no-block" };
      return { ok: true, diff: m[1]! };
    }
    ```
    Tests use the fixture from Plan 03.
  </action>
  <action prompt-builder>
    Create `packages/lmstudio-adapter/src/prompt-builder.ts`. System prompt template:
    ```
    You are a coder agent producing a unified diff against the workspace.
    Output ONLY a single fenced ```diff block. No prose before or after.
    All file changes go in ONE fence. Use standard unified-diff multi-file headers (--- a/path / +++ b/path).
    Archetype: ${input.archetype}
    ```
    User prompt template (concat):
    ```
    Task: ${title}
    Acceptance Criteria:
    - ${ac1}
    - ${ac2}
    
    Files in scope:
    
    ### ${path}
    ```${langForExt(path)}
    ${fileContents.get(path)}
    ```
    ```
    `langForExt` maps `.tsx`→`tsx`, `.ts`→`ts`, `.css`→`css`, default→`text`.
    `buildReformatNudgeMessages`: appends `{role:"assistant", content: priorAssistantContent}` + `{role:"user", content: "Output ONLY a single fenced ```diff block containing your patch. No prose."}` to prior.messages.
    Tests cover the five behaviors.
    Barrel re-exports both modules.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/lmstudio-adapter test 2>&1 | tail -25 && grep -c "Output ONLY a single fenced" packages/lmstudio-adapter/src/prompt-builder.ts && grep -c "DIFF_FENCE_RE" packages/lmstudio-adapter/src/diff-parser.ts</automated>
  </verify>
  <acceptance_criteria>
    - Both files exist + barrel re-exports
    - `parseDiffBlock(cosmeticTweakFixture.expectedDiffSample).ok === true`
    - `parseDiffBlock(cosmeticTweakFixture.proseDriftDiffSample).ok === false`
    - System prompt contains the literal nudge string
    - All 11 tests pass
  </acceptance_criteria>
  <done>Strict parser + prompt assembly ready for Plan 06's coder-adapter.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Retry classifier + deterministic backoff in @protostar/execution</name>
  <files>packages/execution/src/retry-classifier.ts, packages/execution/src/retry-classifier.test.ts, packages/execution/src/backoff.ts, packages/execution/src/backoff.test.ts, packages/execution/src/index.ts</files>
  <read_first>
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-14
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Backoff with deterministic jitter" + §"Pitfall 2"
  </read_first>
  <behavior retry-classifier>
    - Test 1: HTTP 408, 429, 500, 502, 503, 504 → transient.
    - Test 2: HTTP 400, 401, 403, 404, 422 → NOT transient.
    - Test 3: `Error` with `code: "ECONNREFUSED" | "ECONNRESET" | "ENOTFOUND" | "ETIMEDOUT"` → transient.
    - Test 4: `TypeError` with `cause` having one of the above codes → transient (undici fetch error wrapping).
    - Test 5: `AbortError` (name === "AbortError") → NOT transient.
    - Test 6: Plain `Error("nope")` → NOT transient.
  </behavior>
  <behavior backoff>
    - Test 7: `nextBackoffMs(1, () => 0.5)` → exactly `1000 + 1000 * 0.2 * 0` = `1000` (rng=0.5 → jitter coefficient=0).
    - Test 8: `nextBackoffMs(2, () => 0)` → `2000 + 2000*0.2*(-1)` = `1600`.
    - Test 9: `nextBackoffMs(3, () => 1)` → `4000 + 4000*0.2*(1)` = `4800`.
    - Test 10: Cap test — `nextBackoffMs(20, () => 0.5)` → `16000` (base capped).
    - Test 11: Two calls with same seeded RNG produce identical sequence.
    - Test 12: Result is always `≥ 0` even when jitter is most negative.
  </behavior>
  <action>
    Create `packages/execution/src/retry-classifier.ts`:
    ```ts
    export const TRANSIENT_HTTP_STATUSES: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504]);
    const TRANSIENT_ERROR_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "EPIPE"]);
    function getCode(err: unknown): string | undefined {
      if (err && typeof err === "object" && "code" in err) return String((err as any).code);
      if (err && typeof err === "object" && "cause" in err) return getCode((err as any).cause);
      return undefined;
    }
    export function isTransientFailure(input: { kind: "http"; status: number } | { kind: "error"; error: unknown }): boolean {
      if (input.kind === "http") return TRANSIENT_HTTP_STATUSES.has(input.status);
      const e = input.error;
      if (e && typeof e === "object" && "name" in e && (e as any).name === "AbortError") return false;
      const code = getCode(e);
      if (code && TRANSIENT_ERROR_CODES.has(code)) return true;
      // Last-ditch: timeout-named errors
      if (e instanceof Error && /timeout/i.test(e.message)) return true;
      return false;
    }
    ```
    Create `packages/execution/src/backoff.ts`:
    ```ts
    export function nextBackoffMs(attempt: number, rng: () => number): number {
      const base = Math.min(16_000, 1000 * Math.pow(2, attempt - 1));
      const jitter = base * 0.2 * (rng() * 2 - 1);
      return Math.max(0, Math.round(base + jitter));
    }
    export function createDeterministicRng(seed: number): () => number {
      // Mulberry32
      let s = seed >>> 0;
      return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    ```
    Add barrel exports in `packages/execution/src/index.ts`.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/execution test 2>&1 | tail -25 && grep -c "TRANSIENT_HTTP_STATUSES" packages/execution/src/retry-classifier.ts && grep -c "Mulberry32\|s = (s + 0x6D2B79F5)" packages/execution/src/backoff.ts</automated>
  </verify>
  <acceptance_criteria>
    - Both files exist; barrel re-exports
    - `TRANSIENT_HTTP_STATUSES.has(503) === true`, `.has(401) === false`
    - All 12 tests pass
    - `createDeterministicRng(42)` produces reproducible sequence (Test 11)
  </acceptance_criteria>
  <done>Centralized retry+backoff helpers ready for Plan 06 (coder-adapter).</done>
</task>

</tasks>

<threat_model>
| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-04-12 | DoS | Retry storm via misclassified 4xx as transient | mitigate | Allow-list of statuses (Set) — anything not in {408,429,5xx} is non-transient |
| T-04-13 | Repudiation | Non-deterministic backoff makes retry tests flaky | mitigate | `createDeterministicRng` + injected RNG; tests use seeded RNG |
| T-04-14 | Tampering | Diff parser accepts multi-fence (fence-injection) | mitigate | Strict regex + count check rejects multi-fence; test pins it |
</threat_model>

<verification>
- `pnpm --filter @protostar/execution test` green
- `pnpm --filter @protostar/lmstudio-adapter test` green
- `pnpm run verify` shows no regression in other packages
</verification>

<success_criteria>
- All five helpers shipped with comprehensive tests including pitfall coverage
- Determinism: same inputs produce same outputs (especially backoff)
- Strict parsing: prose preamble fails the strict regex (proves Plan 06's reformat-retry path will engage)
</success_criteria>

<output>
Create `.planning/phases/04-execution-engine/04-05-SUMMARY.md`: helper APIs, the canonical regex, transient-status set, backoff formula, and a usage snippet showing how Plan 06 composes them.
</output>
