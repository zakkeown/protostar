# Phase 4: Execution Engine — Research

**Researched:** 2026-04-27
**Domain:** Resumable task runner + first real `ExecutionAdapter` (LM Studio coder, OpenAI-compatible SSE) with deterministic journal, two-hash apply pipeline, and capability-envelope-bound retries/timeouts/cancellation.
**Confidence:** MEDIUM-HIGH

## Summary

This phase rewrites `packages/execution` from a dry-run stub into a deterministic, resumable runner and ships the first real `ExecutionAdapter` in a sibling package `@protostar/lmstudio-adapter`. CONTEXT.md has 19/19 power-mode locks — research below focuses only on the *implementation knowledge* the planner needs: LM Studio's exact OpenAI-compatible wire format, Node 22 fetch+SSE+AbortSignal pitfalls, JSONL+snapshot atomicity on macOS/Linux, current `packages/execution` and `packages/repo` shapes, and a Validation Architecture that lets Nyquist measure each EXEC requirement.

The single largest implementation risk is **stream consumption correctness** under AbortSignal: a half-read SSE response on Node 22's undici fetch can leak sockets if not drained on abort. The second is the **two-hash dance** (adapter pre-image SHA vs apply-time re-hash) — it must remain visibly redundant in code, not collapsed by a future "DRY" refactor.

**Primary recommendation:** Land the package skeleton + state-machine flip in Wave 0 (foundation), the streaming adapter + SSE parser in Wave 1, and the journal+resume+capability-bump in Wave 2. The cosmetic-tweak fixture + stubbed LM Studio server (canned SSE chunks) is the load-bearing test artifact for everything from Wave 1 onward.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Task state machine + lifecycle events | `@protostar/execution` (pure) | — | Domain-first; no I/O, just contracts and the dry-run executor |
| Journal append + snapshot writes | `apps/factory-cli` (fs authority) | — | Authority lock — only factory-cli + repo touch fs |
| Adapter HTTP I/O (LM Studio fetch + SSE) | `@protostar/lmstudio-adapter` | — | Adapter owns network; consumes `AuthorizedNetworkOp` brand |
| File reads injected into adapter | `@protostar/repo` (`repoReader`) | — | Adapter never touches fs; receives reader via `ctx` |
| Patch apply + two-hash check | `@protostar/repo` (`applyChangeSet`) | `@protostar/execution` (orchestration) | Phase 3 owns apply; Phase 4 calls it |
| Network authorization (`network.allow` enum) | `@protostar/authority` (mint) | `@protostar/lmstudio-adapter` (consume) | Brand-mint at kernel; consume at I/O |
| Capability envelope schema bumps | `@protostar/intent` | `@protostar/authority` (validators) | Schema lives with brand owner |
| SIGINT + cancel-sentinel polling | `apps/factory-cli` | — | Process lifecycle is CLI's domain |
| Admission gate `coderAdapterReadyAdmission` (preflight) | `@protostar/lmstudio-adapter` (probe) + `apps/factory-cli` (orchestration) | — | Adapter knows how to probe; factory-cli wires it into admission pipeline |

## User Constraints (from CONTEXT.md)

### Locked Decisions

All 19 questions answered in `04-CONTEXT.md`. Verbatim summary of load-bearing locks:

- **Q-01 / Q-04 — State vocab + event types:** `pending → running → succeeded | failed | timeout | cancelled`. Drop `blocked` from task lifecycle (push to plan-graph "unreachable" status). New `ExecutionLifecycleEventType` set: `task-pending | task-running | task-succeeded | task-failed | task-timeout | task-cancelled`.
- **Q-02 — Journal:** Append-only `runs/{id}/execution/journal.jsonl` + periodic `runs/{id}/execution/snapshot.json` (every N=20 events + every terminal transition). Append-and-fsync each event before emitting; snapshot is tmp+rename atomic.
- **Q-03 — Resume:** `running` task with no terminal event = `failed-orphan`, retry from scratch (counts against Q-14 retry budget).
- **Q-05 — Adapter shape:** `execute(task, ctx) → AsyncIterable<AdapterEvent>` ending with `final` event carrying `RepoChangeSet` or failure.
- **Q-06 — Two-hash dance:** Adapter computes pre-image SHA via `ctx.repoReader`; `repo.applyChangeSet` re-hashes at apply. Both hashes are intentional, not duplication.
- **Q-07 — Package:** New `packages/lmstudio-adapter/` workspace. No fs imports. Depends on `@protostar/execution`, `@protostar/intent`, Node `fetch`.
- **Q-08 — Adapter selection:** Single per run with optional `task.adapterRef` override; admission enforces against run-level `allowedAdapters` (default `['lmstudio-coder']`).
- **Q-09 — Config:** `.protostar/factory-config.json` + env override (`LMSTUDIO_BASE_URL`, `LMSTUDIO_MODEL`, `LMSTUDIO_API_KEY`). Defaults: `baseUrl: 'http://localhost:1234/v1'`, `model: 'qwen3-coder-next-mlx-4bit'`. Resolved config hash recorded in policy snapshot.
- **Q-10 — Streaming:** SSE; persist token log to `runs/{id}/execution/task-{id}/coder.stream.log`; final assembled message returned.
- **Q-11 — Repo context:** `task.targetFiles: string[]` (≥1 required); adapter may read up to N=3 additional via `ctx.repoReader.glob`. Aux reads logged as `AdapterAuxRead { path, sha256 }`.
- **Q-12 — Parsing:** Strict single-fenced ```diff block, with one parse-reformat retry. Regex: `/^\`\`\`(?:diff|patch)?\s*\n([\s\S]*?)\n\`\`\`\s*$/m`. Reformat retry counts as `attempt: 2` with `retryReason: 'parse-reformat'`.
- **Q-13 — Preflight:** `GET /v1/models` at run-start; refuse run if unreachable or model id missing. New admission gate `coderAdapterReadyAdmission`.
- **Q-14 — Retries:** 408/429/5xx + network/timeout, base 1s × 2^(n-1) capped at 16s, ±20% jitter, max 4 attempts. Cap from `capabilityEnvelope.budget.adapterRetriesPerTask` (default 4).
- **Q-15 — Timeout:** `capabilityEnvelope.budget.taskWallClockMs` default `180_000`, signed in ConfirmedIntent.
- **Q-16 — Cancellation:** SIGINT in-process + sentinel file `runs/{id}/CANCEL` polled between tasks. Root `AbortController` per run; per-task controllers chain off it.
- **Q-17 — Evidence split:** `evidence.json` (small, structural) + `transcript.json` (prompt + response + per-attempt detail).
- **Q-18 — Network authority:** `capabilityEnvelope.network.allow: 'none' | 'loopback' | 'allowlist'` enum + optional `allowedHosts`. v0.1 default `'loopback'`. Extends `authorizeNetworkOp` enforcement.
- **Q-19 — Apply boundary:** Apply per-task immediately after adapter returns; bail run on first apply failure with run-level `block`.

### Claude's Discretion
- Specific filenames for journal/snapshot/log files (sketched in CONTEXT; planner can refine).
- Aux-read N=3 (heuristic; planner free to tune based on cosmetic-tweak fixture).
- Parse-reformat retry prompt wording.
- Backoff jitter percentage (±20% suggested).
- Whether `factory-config.json` lives inside `@protostar/lmstudio-adapter` or its own `@protostar/factory-config` package.

### Deferred Ideas (OUT OF SCOPE)
- Per-adapter `defaultTaskTimeoutMs`.
- Cross-process cancellation IPC (Phase 9).
- Tool-call/structured-output mode for Qwen (revisit if MLX tool-calling is reliable).
- Snapshot interval tuning (Phase 9 measurement).
- Second OpenAI-compatible adapter (locks ship in Phase 4; sibling package post-v0.1).
- `@protostar/openai-compatible` shared HTTP client (extract only when second adapter needs it).
- Token-budget unit (PROJECT.md lock).
- Aux-read budget from envelope (N=3 hardcoded for v0.1).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXEC-01 | Task state machine: `pending → running → succeeded \| failed \| timeout \| cancelled` with persisted transitions | Q-01/Q-04 vocab + Q-02 journal; type rewrite at `packages/execution/src/index.ts:8` and `:25-29` |
| EXEC-02 | Typed `ExecutionAdapter` interface; LM Studio coder is first | Q-05 streaming `AsyncIterable<AdapterEvent>` contract |
| EXEC-03 | LM Studio coder adapter (Qwen3-Coder-Next-MLX-4bit, OpenAI-compatible) produces real diff | Q-09 config + Q-10 SSE + Q-12 parse + LM Studio wire format below |
| EXEC-04 | Provider-abstracted execution; second OpenAI-compatible endpoint requires no contract change | Q-07 sibling-package pattern + Q-08 single-adapter-per-run with override + admission `allowedAdapters` |
| EXEC-05 | Per-task evidence: `stdout.log`, `stderr.log`, `evidence.json` | Q-17 split: `evidence.json` + `transcript.json`; stream log = stdout per Q-10 |
| EXEC-06 | Retries with exponential backoff, capped per task by capability envelope | Q-14 4-attempt 1s..16s + Q-12 parse-reformat counted in budget |
| EXEC-07 | Per-task timeout enforced and logged as typed failure | Q-15 `taskWallClockMs` + AbortController per task |
| EXEC-08 | Resumable task journal | Q-02 JSONL+snapshot + Q-03 orphan-replay |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node 22 built-in `fetch` (undici) | bundled with Node ≥22 | HTTP + SSE to LM Studio | [VERIFIED: existing project lock — Node 22 ESM, zero-deps posture]. No `node-fetch`/`axios` dep. |
| Node `crypto.subtle` / `node:crypto` | built-in | SHA-256 of pre-image bytes | Already used in Phase 2 (`packages/authority/src/...signature`) for canonicalization hashing |
| `node:test` | built-in | TDD against compiled `dist/*.test.js` | [VERIFIED: AGENTS.md + Phase 1/2/3 pattern] |
| `AbortController` / `AbortSignal` | built-in | Per-task timeout + SIGINT/sentinel cancel | Standard since Node 18; `fetch(url, { signal })` is the cooperative-cancel API |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| LM Studio (operator-side, not runtime dep) | ≥0.3.x with OpenAI-compat server | Inference host | [CITED: lmstudio.ai/docs/app/api/endpoints/openai] Default `localhost:1234`. Operator must have `qwen3-coder-next-mlx-4bit` loaded or JIT-loadable. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written SSE parser | `eventsource-parser` npm package | New runtime dep; SSE format is small enough to parse correctly in ~40 LoC. Reject — matches PROJECT.md zero-deps posture. |
| `openai` SDK / `@openai/sdk` | First-party SDK with streaming helper | Heavyweight, opinionated, drags pinned types and retry policies that conflict with our envelope-bound retries. Reject — we need the brand-consuming `AuthorizedNetworkOp` boundary anyway. |
| Native `EventSource` global | Browser-style API | Node 22's `EventSource` global only landed in Node 22.4 ([CITED: node.js v22 release notes]) and is read-only GET; chat completions use POST. Reject. |
| Watching journal file via `fs.watch` for resume | event-driven resume | Resume is one-shot at startup; a single read of snapshot+tail of JSONL is simpler. Use that. |

**Installation:** Zero new runtime deps for `@protostar/execution` and `@protostar/lmstudio-adapter`. Workspace wiring only:

```bash
# Add to pnpm-workspace.yaml: packages/lmstudio-adapter
# package.json deps: @protostar/execution, @protostar/intent, @protostar/authority (peer for brand types)
```

**Version verification:** Node 22 fetch and AbortSignal are built-ins; no registry lookup needed. LM Studio is operator-side and not a build dep.

## LM Studio Wire Format (load-bearing detail)

### `GET /v1/models`
[CITED: lmstudio.ai/docs/app/api/endpoints/openai; bug-tracker issue #619]

Response:
```json
{
  "object": "list",
  "data": [
    { "id": "qwen3-coder-next-mlx-4bit", "object": "model", "owned_by": "organization_owner" }
  ]
}
```

**Behavioral quirks:**
- If JIT loading is **off**, only currently-loaded models appear.
- If JIT loading is **on**, all downloaded models appear; load happens on first inference call.
- Server unreachable → fetch rejects with `TypeError` whose `cause` is a `ConnectError`/`ECONNREFUSED` from undici.
- Server up but no models loaded → some LM Studio versions return 200 with `data: []`; others surface as 400 `invalid_request_error` only on the first chat-completions call.

**Phase 4 implication:** preflight gate must distinguish three failure modes:
1. `lmstudio-unreachable` (fetch threw / connection refused)
2. `lmstudio-empty-models` (200 OK but `data: []`)
3. `lmstudio-model-not-loaded` (200 OK, configured model id absent from `data[]`)

The CONTEXT only names two reasons; planner should fold (2) into `lmstudio-model-not-loaded` with `available: []` evidence (the existing schema already supports it).

### `POST /v1/chat/completions` with `stream: true`
[CITED: LM Studio docs — chat-completions; OpenAI streaming spec]

Request body (minimum):
```json
{
  "model": "qwen3-coder-next-mlx-4bit",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "stream": true,
  "temperature": 0.2,
  "top_p": 0.9
}
```

LM Studio's OpenAI-compat server accepts the standard set; non-standard `lmstudio` extensions exist (e.g. `ttl`, `preset`) but are **not needed** for v0.1 — keep the request portable so a future Ollama/remote-OpenAI sibling adapter works.

SSE response (one chunk per token):
```
data: {"id":"chatcmpl-…","object":"chat.completion.chunk","created":1714291200,"model":"qwen3-coder-next-mlx-4bit","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","created":1714291200,"model":"qwen3-coder-next-mlx-4bit","choices":[{"index":0,"delta":{"content":"```"},"finish_reason":null}]}

…

data: {"id":"chatcmpl-…","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]

```

**Quirks vs OpenAI proper:**
- LM Studio (older builds) does **not** set a `text/event-stream` Content-Type with explicit charset ([CITED: lmstudio-bug-tracker #764]). Don't rely on `Content-Type` header for parser dispatch — branch on the request's `stream: true`.
- The first chunk contains `delta.role: "assistant"` with no `content`; subsequent chunks contain `delta.content`; the final pre-DONE chunk has `finish_reason: "stop"` and `delta: {}`.
- `finish_reason` values seen: `"stop"` (normal), `"length"` (hit max_tokens), `null` (mid-stream).
- Some Qwen builds emit empty `tool_calls: []` arrays in delta — harmless; ignore if present ([CITED: opencode issue #4255]).

### Qwen3-Coder-Next prompting for clean diffs
[ASSUMED — based on Qwen3-Coder docs + general practitioner knowledge; fixture-validate during Wave 1]

Drift modes to design against:
1. **Prose preamble:** "Sure, here's the patch:" before the fence. Mitigation: explicit "Output ONLY a single fenced ```diff block. No prose before or after."
2. **Multiple fences:** model splits a multi-file diff into per-file fences. Mitigation: "All hunks in ONE fence. Use standard unified-diff multi-file headers (`--- a/path` / `+++ b/path`)." Parser already rejects multi-fence per Q-12.
3. **Wrong fence language tag:** ` ```patch` or ` ```` (bare). Parser regex tolerates both `diff` and `patch` and bare; OK.
4. **Trailing chatter:** "Let me know if you want me to adjust." — caught by the `\s*$/m` trailing assertion in the regex.
5. **Markdown-style hunks instead of unified diff:** model emits `+ line` `- line` style or pseudo-diff. Mitigation: include a 6-line unified-diff exemplar in the system prompt.

Recommended sampling for diff fidelity (deviates from Qwen3-Coder model card defaults of `temperature=0.7` to favor format compliance):
- `temperature: 0.2`
- `top_p: 0.9`
- `max_tokens`: leave unset (rely on `taskWallClockMs` for ceiling)

The Qwen3-Coder-30B card recommends `temperature=0.7, top_p=0.8, top_k=20, repetition_penalty=1.05` ([CITED: huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct]) for *agentic coding*. For diff-format compliance specifically, lower temperature is the practitioner consensus — but this is `[ASSUMED]` for v0.1; planner should make the sampling parameters configurable in `factory-config.json` so the cosmetic-tweak fixture can tune empirically without a code change.

## Architecture Patterns

### System Architecture Diagram

```
                  ConfirmedIntent (signed, 1.3.0 envelope)
                                │
                                ▼
                     apps/factory-cli/main.ts
                     ├─ resolveFactoryConfig (file + env)
                     ├─ coderAdapterReadyAdmission ─── GET /v1/models ──► LM Studio
                     │                                  (preflight: refuse run on miss)
                     ├─ register SIGINT → root AbortController
                     │
                     ▼
              executor.runRealExecution(plan, ctx)
                     │
                     ▼
      ┌──────────  for task in topo(plan):  ──────────┐
      │   1. stat runs/{id}/CANCEL (between tasks)   │
      │   2. emit task-pending → journal.jsonl       │
      │   3. mint AuthorizedNetworkOp (loopback)     │
      │   4. emit task-running                       │
      │                                              │
      │       AsyncIterable<AdapterEvent>            │
      │   ┌─────────────────────────────────┐        │
      │   │ @protostar/lmstudio-adapter     │        │
      │   │  - build messages from          │        │
      │   │    targetFiles + aux reads      │        │
      │   │    (via ctx.repoReader, hashes  │        │
      │   │     pre-images)                 │        │
      │   │  - POST /v1/chat/completions    │ ──SSE─► LM Studio
      │   │    stream:true, signal=ctx.sig  │ ◄─tokens
      │   │  - parse data: lines, yield     │        │
      │   │    {kind:'token', text}         │        │
      │   │  - append each delta to         │        │
      │   │    coder.stream.log             │        │
      │   │  - on [DONE]: parse fence,      │        │
      │   │    yield {kind:'final', result} │        │
      │   │  - retry on 408/429/5xx + parse │        │
      │   │    reformat (budget-bounded)    │        │
      │   └─────────────────────────────────┘        │
      │                                              │
      │   5. result.outcome === 'change-set'?        │
      │      ├─ no  → terminal failed/timeout        │
      │      └─ yes → repo.applyChangeSet(cs)        │
      │                  (re-hashes pre-image)       │
      │                  ├─ any failure → emit       │
      │                  │  task-failed; bail run    │
      │                  │  with block verdict       │
      │                  └─ all applied → task-      │
      │                     succeeded                │
      │   6. write evidence.json + transcript.json   │
      │      append journal event, fsync             │
      │      every 20 events: tmp+rename snapshot    │
      └──────────────────────────────────────────────┘
                                │
                                ▼
                  Phase 5 review-loop subscribes
                  via ExecutionLifecycleEventType
```

### Recommended Project Structure

```
packages/
├── execution/
│   └── src/
│       ├── index.ts                       # state machine + ExecutionAdapter contract + lifecycle event types
│       ├── adapter-contract.ts            # AdapterEvent, AdapterResult, AdapterContext, AdapterFailureReason
│       ├── retry-classifier.ts            # transient = isTransientStatus(s) || isNetworkError(e) || isTimeoutError(e)
│       ├── backoff.ts                     # min(16000, 1000 * 2^(n-1)) + ±20% jitter (deterministic with seeded RNG for tests)
│       ├── orphan-replay.ts               # crash recovery: orphaned `running` → synthetic `task-failed` event
│       ├── snapshot.ts                    # snapshot schema + tmp+rename writer
│       ├── journal.ts                     # JSONL append-and-fsync writer + tail reader
│       ├── runDryRunExecution.test.ts     # existing dry-run tests, updated for new vocab
│       └── runRealExecution.test.ts       # new — uses stub adapter
├── lmstudio-adapter/
│   └── src/
│       ├── index.ts                       # createLmstudioCoderAdapter(config) → ExecutionAdapter
│       ├── factory-config.ts              # load + env override + hash for policy snapshot
│       ├── factory-config.schema.json     # JSON Schema
│       ├── preflight.ts                   # GET /v1/models classifier (unreachable | empty | model-missing | ok)
│       ├── sse-parser.ts                  # ReadableStream<Uint8Array> → AsyncIterable<DeltaChunk>
│       ├── diff-parser.ts                 # Q-12 strict fence regex + classifier
│       ├── prompt-builder.ts              # system + user message assembly
│       ├── coder-adapter.ts               # main execute(); ties parser + reader + retry + signal
│       └── *.test.ts                      # node:test against compiled dist
└── intent/
    └── schema/
        └── confirmed-intent.schema.json   # bumped 1.2.0 → 1.3.0 with budget.taskWallClockMs,
                                           # budget.adapterRetriesPerTask, network.allow, network.allowedHosts

apps/factory-cli/
└── src/
    ├── main.ts                            # adds: factory-config load, coderAdapterReadyAdmission,
    │                                      #       SIGINT wiring, real-executor branch, sentinel poll, journal writes
    └── coder-adapter-admission.ts         # gate that preflights LM Studio
```

### Pattern 1: AsyncIterable streaming adapter
**What:** `execute()` returns an async generator that yields lifecycle-relevant events as they happen and ends with exactly one `final` event.
**When to use:** Always — this is the contract. Mocks yield only `final`.
**Example:**
```typescript
// Source: synthesized from CONTEXT Q-05 + Node 22 fetch streaming
export interface ExecutionAdapter {
  readonly id: string; // 'lmstudio-coder'
  execute(task: ExecutionTaskInput, ctx: AdapterContext): AsyncIterable<AdapterEvent>;
}

export type AdapterEvent =
  | { kind: 'token'; text: string }
  | { kind: 'tool-call'; name: string; args: unknown }   // reserved; Qwen tool-mode is deferred
  | { kind: 'progress'; message: string }
  | { kind: 'final'; result: AdapterResult };

export type AdapterResult =
  | { outcome: 'change-set'; changeSet: RepoChangeSet; evidence: AdapterEvidence }
  | { outcome: 'adapter-failed'; reason: AdapterFailureReason; evidence: AdapterEvidence };

export type AdapterFailureReason =
  | 'parse-no-block' | 'parse-multiple-blocks' | 'parse-reformat-failed'
  | 'lmstudio-unreachable' | 'lmstudio-http-error'
  | 'retries-exhausted' | 'aborted'
  | 'aux-read-budget-exceeded';
```

### Pattern 2: Two-hash dance (pre-image at decision time, re-hash at apply time)
**What:** Adapter hashes file bytes at the moment it builds the prompt; `applyChangeSet` re-reads + re-hashes at apply. Mismatch → refuse that file.
**When to use:** Every patch. This pair is the entire defense against base drift.
**Critical:** Add a code comment marking each site as "Hash 1 of 2 — see Phase 4 Q-06" and "Hash 2 of 2 — see Phase 3 Q-10". A future "DRY this up" refactor would silently delete the protection.

### Pattern 3: Append-and-fsync journal write before emitting event
**What:** Persist the journal line to disk + fsync **before** the in-memory consumer (Phase 5 subscriber, dry-run test asserter, etc.) sees the event.
**When to use:** Every state transition. Reverse order = lost transitions on crash.

### Pattern 4: Snapshot tmp+rename atomicity
**What:** Write to `snapshot.json.tmp`, fsync the file, fsync the directory, `rename()` to `snapshot.json`. Ext4/APFS guarantee rename atomicity for files on the same filesystem.
**When to use:** Every snapshot write (every N=20 events + every terminal transition).

### Anti-Patterns to Avoid
- **Buffering the entire SSE response into memory** then parsing — defeats streaming, breaks live `coder.stream.log`, and breaks AbortSignal cancellation cleanly. Always read chunks as they arrive.
- **Using `for await` over `response.body` without a `try/finally` to release the reader** — leaks the underlying socket on early break, e.g. when parser detects fatal error mid-stream.
- **Letting the per-task `AbortController` outlive the task** — chain it from the run-root controller so SIGINT cancels everything; signal it explicitly on completion to release listeners (undici listener-cleanup quirk, [CITED: nodejs/undici #939]).
- **Re-hashing pre-image inside the adapter "for safety"** — that's `applyChangeSet`'s job. Adapter does it once for prompt-time evidence; applyChangeSet does it once at apply-time. Two hashes, two purposes.
- **Reading `network.allow` only at admission time** — must also re-check inside `authorizeNetworkOp` (runtime brand mint).
- **Writing the journal line *after* emitting the event** to a Phase 5 subscriber — emit only after fsync returns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP retry policy | Custom retry-after header parser, jitter math from scratch in 5 places | A single `retry-classifier.ts` + `backoff.ts` in `@protostar/execution` (deterministic with injected RNG for tests) | Centralization makes the budget enforceable in one place; deterministic jitter (seeded) is the only way to make retry tests reliable |
| SSE parsing | Manual `String.split('\n\n')` everywhere | One `sse-parser.ts` module that takes a `ReadableStream<Uint8Array>` and yields `{ data: string }` events | Trailing newline edge cases + multi-line `data:` fields exist in the spec and will bite |
| AbortSignal plumbing | Per-call `AbortController` chaining ad-hoc | A single helper `linkAbortSignals(parent, child)` that adds the listener and returns an unlink function | Listener leaks on long-running runs are real ([CITED: undici #939]) |
| Atomic snapshot write | `fs.writeFile` over the live snapshot | `fs.writeFile` to `.tmp` + fsync + rename | Crash mid-write = corrupted snapshot = unresumable run |
| JSON canonicalization for journal events | Re-implementing key-sorted JSON | Reuse `@protostar/authority`'s `json-c14n@1.0` canonicalizer (already shipped in Phase 2) | Same canonicalization story everywhere; one bug surface |
| OpenAI client | `openai` SDK | Direct `fetch` to LM Studio's compat surface | SDK drags retry/typing/streaming opinions that conflict with our envelope-bound budget; loopback default-deny posture is cleaner with a thin client we own |

**Key insight:** The work is in the *contract* (state machine, event union, AsyncIterable shape, two-hash invariant), not in the network-library choice. Keep the HTTP surface tiny and inspectable.

## Common Pitfalls

### Pitfall 1: SSE parser drops the final pre-DONE chunk
**What goes wrong:** Splitting on `\n\n` and processing N-1 events, missing the last chunk that carries `finish_reason: "stop"`.
**Why it happens:** Buffer holds a complete event but the loop exits when reading `[DONE]` is the next thing.
**How to avoid:** Drain the buffer of complete events on every read; treat `data: [DONE]` as a separate sentinel that comes *after* the last content event. Test with a fixture that emits `…\ndata: {final}\n\ndata: [DONE]\n\n` and asserts `finish_reason: 'stop'` was observed.
**Warning signs:** `finishReason` is `null` in `transcript.json` for successful runs.

### Pitfall 2: AbortSignal leaks listeners across retry attempts
**What goes wrong:** Each retry creates a new `fetch(url, { signal })`; the per-task signal accumulates listeners across attempts; worst case OOM on long runs.
**Why it happens:** undici doesn't auto-remove its abort listener when the request settles ([CITED: undici #939]).
**How to avoid:** Use a fresh per-attempt `AbortController` chained to the per-task controller via `signal.addEventListener('abort', child.abort, { once: true })`. After each attempt settles, remove that listener.
**Warning signs:** `MaxListenersExceededWarning` in test output for runs with retries.

### Pitfall 3: Journal-truncation tolerance broken by JSON.parse on corrupted final line
**What goes wrong:** Crash mid-write of last journal event leaves a partial line; resume reads the whole file, hits `SyntaxError`, refuses to resume.
**Why it happens:** Append-only writes are not line-atomic; the OS may flush a partial line before the process dies.
**How to avoid:** Resume reader splits on `\n`, parses each line, **silently drops the last line if it fails to parse** (only the last). Anything earlier failing is corruption and should fail loud.
**Warning signs:** Replay-on-crash test (Q-03) fails with `SyntaxError: Unexpected end of JSON input`.

### Pitfall 4: Two-hash dance silently disabled
**What goes wrong:** Refactor "DRYs up" the adapter pre-image hash; only `applyChangeSet` hashes; concurrent base drift between adapter call and apply goes undetected if the workspace is mutated by something else.
**Why it happens:** Looks like duplication.
**How to avoid:** (1) Comment each hash site with "Hash N of 2 — Phase 4 Q-06" / "Phase 3 Q-10". (2) Add a contract test that mutates the workspace file *between* adapter return and `applyChangeSet` and asserts the apply-time hash check refuses; remove the adapter hash and watch a different test break.
**Warning signs:** Apply succeeds against drifted workspace in concurrent-mutation test.

### Pitfall 5: Sentinel-file race on cleanup
**What goes wrong:** Phase 9 writes `runs/{id}/CANCEL`; executor stat's it between tasks and aborts. On cleanup, executor unlinks the file. If run is *resumed* after, a stale CANCEL sentinel terminates the resume immediately.
**Why it happens:** Sentinel is on disk; resume sees pre-existing file.
**How to avoid:** Resume must `unlink()` the sentinel as part of resume bootstrap, before starting the next task. Document in CONCERNS.md.
**Warning signs:** Resume immediately produces `task-cancelled` with no preceding `task-running`.

### Pitfall 6: `[DONE]` arrives before content for empty completions
**What goes wrong:** Some LM Studio versions, on a request that produces zero tokens (e.g. context too long), emit `data: [DONE]` immediately with no preceding chunks. Adapter's "wait for first chunk" logic deadlocks or produces garbage `final`.
**Why it happens:** Edge case in the OpenAI streaming spec.
**How to avoid:** Treat empty-stream as `parse-no-block` adapter-failed (parser sees zero fences in zero content). Counts as one attempt; falls into normal retry budget.

### Pitfall 7: Schema bump cascades break Phase 1/2 admission tests
**What goes wrong:** Bumping `confirmedIntent.schemaVersion` from 1.2.0 → 1.3.0 (additive: `budget.adapterRetriesPerTask`, `budget.taskWallClockMs`, `network.allow`, `network.allowedHosts?`) requires re-canonicalizing every fixture that signs an intent.
**Why it happens:** Phase 2's `verifyConfirmedIntentSignature` recomputes the hash; any fixture pre-signed against 1.2.0 now mismatches.
**How to avoid:** Plan must include a "regenerate signed-intent fixtures" task and run `pnpm run verify` across `policy`, `planning`, `execution`, `review`, `intent`, `factory-cli`, `admission-e2e`. Do NOT silently widen schemas to accept either version.
**Warning signs:** `policy` or `admission-e2e` tests fail with "envelopeHash mismatch" after the bump.

## Runtime State Inventory

> Phase 4 is **greenfield with carve-outs into existing packages** — not a rename/migration. But several state-shaped concerns straddle the boundary; documenting them here.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None (no DB; all state is in run-bundle on disk under `.protostar/runs/{id}/`) | None |
| Live service config | `factory-config.json` resolved values + env overrides — hash recorded in policy snapshot per Q-09 | Loader writes hash to policy-snapshot artifact; Phase 2's signature flow re-canonicalizes ConfirmedIntent on schema bump |
| OS-registered state | `process.on('SIGINT', …)` handler installed once per CLI invocation | Document that double-Ctrl-C → SIGKILL → orphan task path (Q-03) |
| Secrets/env vars | `LMSTUDIO_API_KEY` (placeholder `'lm-studio'` if absent), `LMSTUDIO_BASE_URL`, `LMSTUDIO_MODEL` — already added to `.env.example` in Phase 3 Q-17 | Verify `.env.example` has all three before Phase 4 lands; no rename, just consumption |
| Build artifacts | New `packages/lmstudio-adapter/dist/` — included in root `pnpm verify` test discovery; pnpm-workspace.yaml addition required | Update `pnpm-workspace.yaml`, `tsconfig.json` references, `verify`/`verify:full` scripts |
| Existing dry-run tests | `packages/execution/src/runDryRunExecution*.test.ts` (and any consumers in `apps/factory-cli`) reference old vocab `passed`/`blocked` | Same plan that flips state vocab updates these tests verbatim — no compat shim |

## Code Examples

### Reading SSE chunks from Node 22 fetch with AbortSignal

```typescript
// Source: synthesized from undici/Node 22 docs + LM Studio chunk format above
async function* streamChatCompletion(
  url: string,
  body: unknown,
  signal: AbortSignal,
  apiKey: string
): AsyncIterable<{ data: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new HttpError(res.status, await res.text().catch(() => ''));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by \n\n
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        // Each event is one or more lines; we only care about `data:` lines
        const dataLines = event
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice(6));
        if (dataLines.length === 0) continue;
        const data = dataLines.join('\n');
        if (data === '[DONE]') return;
        yield { data };
      }
    }
  } finally {
    // CRITICAL: release the lock so socket can be reused / closed cleanly on abort
    reader.releaseLock();
  }
}
```

### Backoff with deterministic jitter (testable)

```typescript
// Source: synthesized from CONTEXT Q-14
export function nextBackoffMs(attempt: number, rng: () => number): number {
  const base = Math.min(16_000, 1000 * 2 ** (attempt - 1));
  const jitter = base * 0.2 * (rng() * 2 - 1); // ±20%
  return Math.max(0, Math.round(base + jitter));
}
// Tests inject a seeded RNG; production uses Math.random.
```

### Strict diff-fence parser

```typescript
// Source: CONTEXT Q-12 verbatim regex
const FENCE_RE = /^```(?:diff|patch)?\s*\n([\s\S]*?)\n```\s*$/m;

export function parseDiffBlock(content: string):
  | { ok: true; diff: string }
  | { ok: false; reason: 'parse-no-block' | 'parse-multiple-blocks' } {
  // Find ALL fenced blocks, not just the first
  const matches = [...content.matchAll(/```(?:diff|patch)?\s*\n[\s\S]*?\n```/gm)];
  if (matches.length === 0) return { ok: false, reason: 'parse-no-block' };
  if (matches.length > 1) return { ok: false, reason: 'parse-multiple-blocks' };
  const m = matches[0]![0].match(FENCE_RE);
  if (!m) return { ok: false, reason: 'parse-no-block' };
  return { ok: true, diff: m[1]! };
}
```

### Stubbed LM Studio server for tests (canned SSE)

```typescript
// Source: synthesized — load-bearing test fixture
import { createServer, type Server } from 'node:http';

export function startStubLmstudio(opts: {
  models?: string[];                                  // GET /v1/models response
  chunks?: string[];                                  // delta.content sequence for chat completions
  preflightStatus?: number;                           // override for unreachable simulation
  delayMsBetweenChunks?: number;                      // for timeout tests
}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  // … listens on 127.0.0.1:0, returns { baseUrl, close }
  // GET /v1/models → JSON list
  // POST /v1/chat/completions → SSE: emit each chunk as
  //   data: {"choices":[{"delta":{"content":"<chunk>"}}]}\n\n
  // followed by data: [DONE]\n\n
}
```

This stub is the **single most important test asset in Phase 4**. It enables: preflight tests (Q-13), retry tests (5xx response then success), parse tests (canned diff vs canned prose), timeout tests (delay > taskWallClockMs), and abort tests (close mid-stream).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-fetch` / `axios` | Built-in `fetch` (undici) | Node 18+ stable | Zero deps; signal-based cancellation native |
| Polling for adapter completion | AsyncIterable streaming | Phase 4 Q-05 lock | Live token surfacing for Phase 9 `inspect` without retrofit |
| OpenAI tool-call mode for structured output | Strict fenced ```diff parsing | Q-10c deferred | Tool-call on Qwen3-Coder-MLX is unproven for diff-output reliability; revisit post-v0.1 |
| `eventsource` / `EventSource` polyfill | Hand-rolled SSE parser over `response.body` | Project zero-deps lock | One small module, fully owned and tested |

**Deprecated/outdated:**
- Earlier dry-run vocab (`passed`/`blocked` in `ExecutionTaskStatus`) — replaced by EXEC-01 vocab in Phase 4.
- `link:`-style sibling deps (`@dogpile/sdk`) — Phase 3 Q-16 unblocks this for fresh-clone machines.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `temperature: 0.2` improves Qwen3-Coder diff-fence compliance vs the 0.7 model-card default | Qwen3-Coder prompting | Empirical — fixture-validate; if wrong, parse-reformat retries chew budget. Mitigation: make sampling configurable. |
| A2 | LM Studio empty-models case (200 OK, `data: []`) collapses cleanly into `lmstudio-model-not-loaded` reason with empty `available[]` | Preflight section | Low — schema already accommodates; docs may name it differently |
| A3 | undici `fetch` cleanly closes the underlying socket when the response stream is `releaseLock`'d after abort | SSE pattern | Medium — confirmed by docs, but listener-cleanup quirk ([undici #939]) means we still need explicit listener removal. Test on real abort path. |
| A4 | LM Studio's SSE format matches OpenAI 1:1 (incl. `[DONE]` sentinel and `delta` shape) at the version bundled in v0.1 dogfood machines | LM Studio wire format | Low — multiple corroborating sources, but LM Studio versions shift; pin behavior in stub server tests to detect drift |
| A5 | Empty-stream completions produce zero `data:` chunks before `[DONE]` (vs e.g. one chunk with `delta: {}`) | Pitfall 6 | Low — handled by parser regardless: zero fences → `parse-no-block` |
| A6 | `process.fsync` (or equivalent via `fs.writeFile` followed by directory fsync) is sufficient for crash-resume on macOS APFS and Linux ext4 with default mount options | Snapshot atomicity | Low — standard tmp+rename pattern; failure mode is documented loss of last N events on power-cut, acceptable for v0.1 |
| A7 | `.protostar/runs/{id}/CANCEL` sentinel write from Phase 9 will be a single-byte file (presence-only); contents ignored | Sentinel | Low — Phase 9 hasn't shipped; spec sentinel as "presence-only" in Phase 4 plan to lock behavior early |

**A1, A3, A6 are the meaningful ones** — the rest are belt-and-suspenders.

## Open Questions

1. **Where does `factory-config.json` live — inside `@protostar/lmstudio-adapter` or a new `@protostar/factory-config` package?**
   - What we know: CONTEXT Q-09 leaves it to planner discretion. AGENTS.md disfavors generic packages; Phase 3 Q-15 already carved out one exception (`@protostar/paths`).
   - What's unclear: Whether a *second* (e.g. Ollama) adapter package would also load from the same file → forces it out of the LM Studio package.
   - Recommendation: Ship it inside `@protostar/lmstudio-adapter` for v0.1. Extract to a sibling package the moment a second adapter package needs it. AGENTS.md guidance points toward "wait for the second use case" rather than premature extraction.

2. **Does the parse-reformat retry (Q-12) re-stream tokens to `coder.stream.log` or append to the existing log?**
   - What we know: The log is per-task; CONTEXT doesn't specify per-attempt segmentation.
   - Recommendation: Append both attempts to the same `coder.stream.log` with a separator line `\n--- attempt 2 (parse-reformat) ---\n`. Per-attempt detail lives in `transcript.json` already.

3. **Snapshot interval N=20 — measured against what?**
   - What we know: CONTEXT marks N=20 as a guess to be tuned in Phase 9.
   - Recommendation: Make `snapshotEveryNEvents` a constructor argument to the executor (default 20), so Phase 9 measurement can flip it without a code change.

4. **Does `task.adapterRef` admission rejection produce a planning-admission refusal or an execution-admission refusal?**
   - What we know: Q-08 says admission rejects out-of-set `adapterRef`; doesn't pin which gate.
   - Recommendation: Plan-admission gate (Phase 1's pipeline) — `adapterRef` is a plan-schema field, so the rejection naturally lives in plan admission. Phase 4 extends the existing planning-admission validator rather than introducing a new gate.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 + ESM + node:test | All packages | ✓ (project lock) | ≥22.x | — |
| TypeScript ^6.0.3 strict | All packages | ✓ (project lock) | 6.x | — |
| LM Studio app + loaded `qwen3-coder-next-mlx-4bit` | EXEC-03 e2e + Phase 10 dogfood | Operator-side, **not** required for unit tests | ≥0.3.x | Stub LM Studio server in `internal/test-fixtures/` covers all CI testing |
| GitHub PAT | Phase 7 (not Phase 4) | n/a here | — | — |

**Missing dependencies with no fallback:** None blocking Phase 4 implementation/testing. LM Studio is operator-side; CI uses the stub.

**Missing dependencies with fallback:** LM Studio app — fallback is the stub server (already specified in Validation Architecture below).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node 22 built-in `node:test` (`node --test dist/*.test.js`) |
| Config file | None — convention-based discovery via per-package `pnpm test` script |
| Quick run command | `pnpm --filter @protostar/execution test && pnpm --filter @protostar/lmstudio-adapter test` |
| Full suite command | `pnpm run verify` (root) — runs all 11 packages + admission-e2e + factory-cli |
| Phase gate | Full suite green before `/gsd-verify-work` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXEC-01 | State vocab `pending → running → succeeded/failed/timeout/cancelled`; `blocked` removed; transitions persisted | unit + contract | `pnpm --filter @protostar/execution test` | ❌ Wave 0 — `state-machine.test.ts` |
| EXEC-01 | All five terminal transitions appear in journal in order | integration | same | ❌ Wave 2 — `journal.test.ts` |
| EXEC-02 | `ExecutionAdapter` interface + AsyncIterable contract; mock yielding `final` works end-to-end | unit | `pnpm --filter @protostar/execution test` | ❌ Wave 0 — `adapter-contract.test.ts` |
| EXEC-03 | LM Studio coder produces a parseable diff against the cosmetic-tweak fixture | integration (stub server) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ Wave 1 — `coder-adapter.test.ts` |
| EXEC-03 | Parse-reformat retry recovers from prose-preamble drift | integration (stub server) | same | ❌ Wave 1 — `diff-parser.test.ts` + `coder-adapter.test.ts` |
| EXEC-03 | Preflight refuses run on unreachable / model-missing / empty-models | integration (stub server) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ Wave 1 — `preflight.test.ts` |
| EXEC-04 | Plan with `adapterRef` outside `allowedAdapters` is rejected at plan admission with typed violation | contract | `pnpm --filter @protostar/admission-e2e test` | ❌ Wave 2 — `adapter-ref-admission.test.ts` |
| EXEC-04 | Plan with `adapterRef` inside `allowedAdapters` runs the override; absent `adapterRef` runs the default | integration | same | ❌ Wave 2 — same file |
| EXEC-05 | After a successful task: `evidence.json` matches schema; `transcript.json` matches schema; `coder.stream.log` non-empty | integration | `pnpm --filter @protostar/execution test` | ❌ Wave 1 — `evidence-shapes.test.ts` |
| EXEC-05 | `auxReads[]` are recorded with path + sha256 when adapter reads beyond `targetFiles` | integration | same | ❌ Wave 1 — same file |
| EXEC-06 | 5xx → backoff retry → success path emits one journal entry per attempt with `retryReason: 'transient'` | integration (stub server) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ Wave 1 — `retry.test.ts` |
| EXEC-06 | 4 attempts exhausted produces terminal `failed` with `reason: 'retries-exhausted'` and final-error-chain evidence | integration | same | ❌ Wave 1 — same file |
| EXEC-06 | `capabilityEnvelope.budget.adapterRetriesPerTask` cap is honored when lower than default | unit + contract | same + `pnpm --filter @protostar/intent test` | ❌ Wave 2 — `envelope-budget.test.ts` |
| EXEC-07 | Stub adapter sleeps past `taskWallClockMs` → terminal `task-timeout` event + journal entry | integration | `pnpm --filter @protostar/execution test` | ❌ Wave 2 — `timeout.test.ts` |
| EXEC-07 | Mid-stream LM Studio response that exceeds `taskWallClockMs` cleanly aborts the fetch | integration (stub server) | `pnpm --filter @protostar/lmstudio-adapter test` | ❌ Wave 2 — `timeout-abort.test.ts` |
| EXEC-08 | Crash-mid-task (SIGKILL) leaves `task-running` orphan; resume emits synthetic `task-failed` with `reason: 'orphaned-by-crash'` and re-enqueues | integration | `pnpm --filter @protostar/execution test` | ❌ Wave 2 — `orphan-replay.test.ts` |
| EXEC-08 | Resume after clean shutdown picks up next task from snapshot | integration | same | ❌ Wave 2 — `resume.test.ts` |
| EXEC-08 | Truncated last line in `journal.jsonl` is silently dropped on resume; preceding lines parsed | unit | same | ❌ Wave 2 — `journal-corruption.test.ts` |
| Q-19 | Apply per-task immediately; on first apply failure run terminates with `block` and downstream tasks never run | integration | `pnpm --filter @protostar/execution test` | ❌ Wave 2 — `apply-failure-block.test.ts` |
| Q-18 | Cloud URL refused under `network.allow: 'loopback'`; LM Studio loopback URL accepted | unit + contract | `pnpm --filter @protostar/authority test` | ❌ Wave 2 — `network-op-allow.test.ts` |
| Q-16 | SIGINT during a run → root abort → in-flight task ends `cancelled`; sentinel file between tasks → same | integration | `pnpm --filter @protostar/execution test` (with subprocess fork helper) | ❌ Wave 2 — `cancel.test.ts` |

### Sampling Rate
- **Per task commit:** package-scoped `pnpm --filter <package> test` (~10–30s each)
- **Per wave merge:** `pnpm run verify` (full suite)
- **Phase gate:** `pnpm run verify` green before `/gsd-verify-work`

### Wave 0 Gaps (test infrastructure to create before implementation)
- [ ] `packages/execution/src/state-machine.test.ts` — locks the new vocab and rejects old `passed`/`blocked` literals
- [ ] `packages/execution/src/adapter-contract.test.ts` — contract test pinning `ExecutionAdapter`/`AdapterEvent`/`AdapterResult` public surface
- [ ] `packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts` — canned-response stub (mirrors Phase 3's `internal/test-fixtures` subpath pattern from Q-18)
- [ ] `packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts` — minimal "change primary button color" task input + expected diff shape; reusable in Phase 5/8/10
- [ ] `packages/admission-e2e/src/adapter-ref-admission.test.ts` — pins plan-admission rejection of out-of-set `adapterRef`
- [ ] No framework install needed (built-in)

### Eight Nyquist Dimensions for Phase 4

1. **State machine correctness** → `state-machine.test.ts` enumerates every legal transition; asserts no path lands on a non-terminal status.
2. **Adapter-contract conformance** → mock adapter yielding `final` only must drive a successful run; contract test pins the public surface.
3. **HTTP wire compliance** → stub LM Studio server replays canned SSE fixtures; adapter assembles content matching the fixture exactly.
4. **Parse strictness** → diff-parser tests cover: clean fence (pass), prose preamble (parse-reformat → pass), two fences (fail-no-retry), no fence (fail-no-retry), bare fence (pass).
5. **Resilience** → retry tests cover 408, 429, 500, 502, 503, 504, network error, and timeout error → each retried; 4xx other than 408/429 → no retry.
6. **Authority enforcement** → loopback-only `authorizeNetworkOp` rejects `api.openai.com` URL; accepts `localhost:1234`; allowlist mode pre-staged for Phase 7.
7. **Evidence completeness** → `evidence.json` and `transcript.json` validate against their JSON schemas after a complete task; `auxReads[]` populated when adapter glob's beyond `targetFiles`.
8. **Resumability** → SIGKILL mid-task + restart produces a journal whose final state is `succeeded` (after orphan-retry); truncated-last-line journal still resumes.

## Project Constraints (from CLAUDE.md / AGENTS.md)

Extracted directives the planner must honor:

- **Authority boundary:** Only `apps/factory-cli` and `packages/repo` may touch the filesystem. `@protostar/lmstudio-adapter` is coordination/protocol-only — no `node:fs` import. (PROJECT.md, AGENTS.md.)
- **Domain-first packaging:** No generic `utils`/`agents`/`factory` packages. New `packages/lmstudio-adapter` is a domain package. `factory-config.json` loader stays inside it (or a small `@protostar/factory-config` if a second adapter requires).
- **Stage forward-only data flow:** Phase 5 review subscribes to lifecycle events; Phase 4 must not reach back into Phase 5 contracts.
- **Side effects behind repo, execution, or caller-owned tool adapters:** LM Studio adapter is a tool-adapter and owns its HTTP I/O. Patch apply lives in `packages/repo`. Journal+snapshot writes live in `apps/factory-cli`.
- **Testing:** TDD via `node:test` against compiled `dist/*.test.js`. No `tsx` shortcut in CI.
- **Dependency-light posture:** No new external runtime deps for `@protostar/execution` or `@protostar/lmstudio-adapter`. (Phase 3 already broke this rule with `isomorphic-git`; Phase 4 should not add to it.)
- **Verify before handing back:** Run `pnpm run verify` and `pnpm run factory` after stage-composition or export changes.
- **Brand discipline:** `AuthorizedNetworkOp` minted only by `@protostar/authority`; `@protostar/lmstudio-adapter` consumes the brand at the I/O call site.
- **ConfirmedIntent is `DeepReadonly` post-promotion:** Adapter never mutates intent fields; reads through.
- **Ambiguity gate ≤0.2:** Not relevant to Phase 4 directly; preserved upstream by Phase 1.
- **Cosmetic-tweak only for v0.1:** Fixture matrix focuses on a single archetype. Other archetypes remain `stub`.

## Sources

### Primary (HIGH confidence)
- `04-CONTEXT.md` (read in full) — 19/19 power-mode locks, canonical for this phase
- `packages/execution/src/index.ts` (read in full) — current state-machine + dry-run executor
- `packages/authority/src/authorized-ops/network-op.ts` (read in full) — `authorizeNetworkOp` extension target for Q-18
- `packages/repo/src/index.ts` (read) — current `WorkspaceRef`/`RepoChangeSet`/`PatchArtifact` (still Phase 3 stub; will be expanded by Phase 3 plans before Phase 4 lands)
- `packages/dogpile-adapter/{package.json,src/index.ts}` — structural template for `@protostar/lmstudio-adapter`
- `packages/intent/schema/confirmed-intent.schema.json` — schema bump target (1.2.0 → 1.3.0)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md`, `AGENTS.md`, `.planning/phases/02-…/02-CONTEXT.md`, `.planning/phases/03-…/03-CONTEXT.md` — project posture + adjacent-phase locks

### Secondary (MEDIUM confidence)
- LM Studio docs landing page (`lmstudio.ai/docs/app/api/endpoints/openai`) — confirmed default port `1234`, `/v1/chat/completions` and `/v1/models` endpoints, OpenAI-compat surface
- LM Studio bug tracker: issue #764 (Content-Type header quirk), #619 (model-name routing quirk with single loaded model), #1154 (`/v1/responses` quirks — irrelevant to Phase 4 since we use `/v1/chat/completions`)
- LM Studio docs ("Streaming events", "Tool Use" pages) — confirms SSE format `data: …\n\n` + `data: [DONE]` terminator
- Hugging Face Qwen3-Coder-30B-A3B-Instruct model card — sampling defaults (`temperature=0.7, top_p=0.8, top_k=20, repetition_penalty=1.05`); diff-format guidance not present (assumed lower temperature for diff fidelity)
- nodejs/undici issues #939 (AbortSignal listener cleanup), #1926 (`AbortSignal.timeout()` quirk), #3750 (ECONNRESET on keep-alive)

### Tertiary (LOW confidence — flag for fixture validation)
- Qwen3-Coder diff-format drift modes (assumed; validate against cosmetic-tweak fixture during Wave 1)
- Optimal `temperature` for diff fidelity on Qwen3-Coder-Next-MLX-4bit (assumed 0.2; make configurable so empirical tuning doesn't require a code change)
- LM Studio empty-models edge case naming (assumed collapsed into `lmstudio-model-not-loaded` reason)

## Metadata

**Confidence breakdown:**
- Standard stack (Node 22 fetch, node:test, AbortController): HIGH — project locks already in place
- Architecture patterns (AsyncIterable adapter, JSONL+snapshot, two-hash dance): HIGH — all CONTEXT-locked or industry-standard
- LM Studio wire format (SSE chunks, `[DONE]`, `/v1/models` shape): MEDIUM-HIGH — docs are thin in places but multiple sources corroborate
- Qwen3-Coder diff-prompt tuning: LOW-MEDIUM — flagged in Assumptions Log for empirical validation against the cosmetic-tweak fixture
- Pitfalls (SSE-drop-final-chunk, abort-listener-leak, journal-truncation, two-hash-collapse, sentinel-race, empty-completion, schema-cascade): MEDIUM — synthesized from spec + adjacent issues; all have direct test counterparts in Validation Architecture

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (30 days for the LM Studio wire-format claims; LM Studio releases roughly weekly so re-verify against current changelog if the phase slips)

## RESEARCH COMPLETE

**Phase:** 4 — Execution Engine
**Confidence:** MEDIUM-HIGH

### Key Findings
- **CONTEXT is exhaustive (19/19 power-mode locks).** This research adds *implementation knowledge*, not decisions: LM Studio SSE wire format, Node 22 fetch+AbortSignal pitfalls, two-hash invariant defense, journal-truncation tolerance, and a stub-server fixture as the load-bearing test asset.
- **Single largest risk:** SSE stream consumption under AbortSignal. undici's listener cleanup quirk (#939) plus the `data: [DONE]` sentinel + final-pre-DONE chunk edge case mean the parser needs explicit testing against the stub server, not against live LM Studio.
- **Capability-envelope schema bump clusters into one change:** 1.2.0 → 1.3.0 with `budget.adapterRetriesPerTask` (Q-14), `budget.taskWallClockMs` (Q-15), `network.allow` enum (Q-18), `network.allowedHosts?` (Q-18). One re-canonicalization sweep across all signed-intent fixtures.
- **Two-hash dance must be code-commented at both sites** ("Hash N of 2 — Phase X Q-Y"). It's the only defense against base drift and looks exactly like duplication a future refactor will "clean up".
- **Stub LM Studio server is the most reusable test asset of the phase** — used by every EXEC requirement test except the pure state-machine ones, plus carries forward into Phase 5/8/10.

### File Created
`/Users/zakkeown/Code/protostar/.planning/phases/04-execution-engine/04-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Node 22 + built-in fetch + node:test are project locks; zero new deps |
| Architecture | HIGH | AsyncIterable adapter, JSONL+snapshot, two-hash, brand-consume — all CONTEXT-locked or pattern-established in Phases 1–3 |
| LM Studio wire format | MEDIUM-HIGH | Multiple corroborating sources for `/v1/chat/completions` SSE + `/v1/models`; some quirks documented in bug tracker |
| Qwen3-Coder diff prompting | LOW-MEDIUM | Drift modes are practitioner-level assumed; sampling-temperature recommendation flagged as `[ASSUMED]` and made configurable |
| Pitfalls | MEDIUM | Synthesized; every pitfall has a direct test in the Validation Architecture |
| Validation Architecture | HIGH | Each EXEC-XX requirement has a concrete automated test command + file path + wave assignment |

### Open Questions (Recommendations Provided)
1. `factory-config.json` location — recommend inside `@protostar/lmstudio-adapter` for v0.1; extract on second-adapter need.
2. Parse-reformat re-streaming to `coder.stream.log` — recommend append-with-separator.
3. Snapshot interval N=20 — recommend constructor arg with default 20 so Phase 9 can tune.
4. `task.adapterRef` admission gate location — recommend extending plan admission (Phase 1's pipeline).

### Ready for Planning
Research complete. Planner can now create PLAN.md files. Recommended wave structure:
- **Wave 0 (foundation):** state-machine flip + adapter-contract types + stub LM Studio server fixture + cosmetic-tweak fixture.
- **Wave 1 (adapter):** `@protostar/lmstudio-adapter` package skeleton, SSE parser, diff parser, preflight, retry, evidence shapes.
- **Wave 2 (executor):** journal+snapshot, orphan-replay, capability-envelope schema bump (1.2.0 → 1.3.0), `network.allow` enforcement, factory-cli wiring (SIGINT, sentinel poll, real-executor branch, admission gate), apply-boundary integration with `repo.applyChangeSet`.
