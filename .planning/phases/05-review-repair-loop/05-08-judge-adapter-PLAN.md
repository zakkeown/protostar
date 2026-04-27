---
phase: 05-review-repair-loop
plan: 08
type: execute
wave: 2
depends_on: [03, 04]
files_modified:
  - packages/lmstudio-adapter/src/lmstudio-client.ts
  - packages/lmstudio-adapter/src/create-judge-adapter.ts
  - packages/lmstudio-adapter/src/create-judge-adapter.test.ts
  - packages/lmstudio-adapter/src/index.ts
  - packages/intent/schema/factory-config.schema.json
autonomous: true
requirements: [LOOP-02]
must_haves:
  truths:
    - "`createLmstudioJudgeAdapter(config): ModelReviewer` is exported from `@protostar/lmstudio-adapter`"
    - "Judge adapter shares HTTP/SSE/preflight machinery with the coder adapter — extracted into a shared `lmstudio-client.ts` module"
    - "Judge adapter calls a single Qwen3-80B model via LM Studio (model id from `factory-config.json adapters.judge.model`)"
    - "Returned `ModelReviewResult` always carries exactly one `JudgeCritique` (panel-of-one for v0.1; Phase 8 expands to N)"
    - "`factory-config.json` schema gains `adapters.judge: { provider, baseUrl, model, apiKeyEnv }` block"
    - "Preflight extension verifies the judge model is loaded in addition to the coder model (Q-10)"
  artifacts:
    - path: packages/lmstudio-adapter/src/lmstudio-client.ts
      provides: "shared HTTP/SSE client (extracted from coder-adapter for reuse by judge)"
    - path: packages/lmstudio-adapter/src/create-judge-adapter.ts
      provides: "createLmstudioJudgeAdapter returning ModelReviewer"
    - path: packages/intent/schema/factory-config.schema.json
      provides: "schema field adapters.judge"
  key_links:
    - from: packages/lmstudio-adapter/src/create-judge-adapter.ts
      to: lmstudio-client.ts
      via: "named import (shared HTTP)"
      pattern: "from \"./lmstudio-client"
    - from: packages/lmstudio-adapter/src/create-judge-adapter.ts
      to: "@protostar/review (ModelReviewer, JudgeCritique types)"
      via: "type import"
      pattern: "from \"@protostar/review\""
---

<objective>
Add a single-judge LM Studio adapter to `@protostar/lmstudio-adapter` (Q-10 — planner pick: extend rather than create new package, per advisor recommendation: shared HTTP/SSE/preflight machinery is the deciding factor; both coder and judge are LM Studio clients with different model ids).

Per Q-10: "v0.1 ships a real one-judge implementation; Phase 8 expands to N=2 panel + consensus math without changing the loop seam." Per Q-11: returns `JudgeCritique` with rubric scores + free-text rationale.

Purpose: Real model signal in v0.1; validates the seam against a real adapter rather than passthrough. Phase 8 swaps single-judge for N-of-M panel without touching `runReviewRepairLoop`.
Output: `createLmstudioJudgeAdapter` factory; shared lmstudio-client extraction; factory-config schema bump for `adapters.judge`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<external_dependency>
Phase 4 prerequisite: this plan extends Phase 4's coder-adapter machinery. Plans 04-04 (factory-config + preflight), 04-05 (sse-parser + retry-classifier), 04-06 (createLmstudioCoderAdapter) must have shipped before this plan executes. If Phase 4 has not landed, surface the blocker — judge adapter cannot extract from non-existent coder-adapter machinery.
</external_dependency>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@packages/review/src/repair-types.ts
@packages/review/src/judge-types.ts
@packages/lmstudio-adapter/src/index.ts
@.planning/phases/04-execution-engine/04-04-lmstudio-config-and-preflight-PLAN.md
@.planning/phases/04-execution-engine/04-05-sse-diff-retry-helpers-PLAN.md
@.planning/phases/04-execution-engine/04-06-coder-adapter-orchestrator-PLAN.md

<interfaces>
```typescript
// create-judge-adapter.ts
import type { ModelReviewer, ModelReviewInput, ModelReviewResult, JudgeCritique } from "@protostar/review";

export interface LmstudioJudgeAdapterConfig {
  readonly baseUrl: string;            // e.g. "http://localhost:1234"
  readonly model: string;              // e.g. "qwen3-80b-a3b-mlx-4bit"
  readonly apiKeyEnv?: string;         // env var name (default: "LMSTUDIO_API_KEY")
  readonly judgeId: string;            // operator-meaningful e.g. "qwen3-80b-judge-1"
  readonly timeoutMs: number;
}

export function createLmstudioJudgeAdapter(config: LmstudioJudgeAdapterConfig): ModelReviewer;
```

Adapter behavior:
1. Build prompt from `ModelReviewInput`: includes admittedPlan summary, mechanical gate, diff (unifiedDiff), repairContext if present.
2. POST to `{baseUrl}/v1/chat/completions` with the model + a JSON-mode response_format requesting:
   ```json
   { "rubric": { "<key>": <number>, ... }, "verdict": "pass" | "repair" | "block", "rationale": "..." }
   ```
3. Parse the JSON response. Build a single `JudgeCritique`:
   ```typescript
   { judgeId: config.judgeId, model: config.model, rubric, verdict, rationale, taskRefs: <derived from diff/plan> }
   ```
4. Return `ModelReviewResult { verdict, critiques: [judgeCritique] }`.

`taskRefs` derivation: for v0.1, set to all task ids in `admittedPlan` (every judge looks at the whole plan; granular per-task references is Phase 8 work). Document in module header.

Factory-config schema addition (literal):
```json
"adapters": {
  "type": "object",
  "properties": {
    "coder": { "$ref": "#/definitions/lmstudioAdapterConfig" },
    "judge": { "$ref": "#/definitions/lmstudioAdapterConfig" }
  },
  "required": ["coder", "judge"],
  "additionalProperties": false
}
```
(Phase 4 establishes `adapters.coder`. Phase 5 adds `adapters.judge` and makes both required.)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract shared lmstudio-client.ts from coder-adapter</name>
  <files>packages/lmstudio-adapter/src/lmstudio-client.ts, packages/lmstudio-adapter/src/lmstudio-client.test.ts, packages/lmstudio-adapter/src/coder-adapter.ts (refactored consumer)</files>
  <read_first>
    - packages/lmstudio-adapter/src/index.ts (full surface — Phase 4 deliverable)
    - .planning/phases/04-execution-engine/04-05-sse-diff-retry-helpers-PLAN.md (sse-parser ownership)
    - .planning/phases/04-execution-engine/04-06-coder-adapter-orchestrator-PLAN.md (current coder-adapter structure)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-10 ("Adapter shares HTTP/SSE/preflight machinery with the coder adapter")
  </read_first>
  <action>
1. Read the current coder-adapter file to find HTTP+SSE call sites (POST chat/completions, EventSource-style stream reader, retry classifier wiring).
2. Extract a shared module `packages/lmstudio-adapter/src/lmstudio-client.ts` exporting:
   ```typescript
   export interface LmstudioChatRequest {
     readonly baseUrl: string;
     readonly model: string;
     readonly apiKey?: string;
     readonly messages: readonly { readonly role: "system" | "user" | "assistant"; readonly content: string }[];
     readonly stream: boolean;
     readonly responseFormat?: "json_object" | "text";
     readonly signal: AbortSignal;
     readonly timeoutMs: number;
   }

   export type LmstudioChatEvent =
     | { readonly kind: "token"; readonly text: string }
     | { readonly kind: "done"; readonly finishReason: string }
     | { readonly kind: "error"; readonly errorClass: string; readonly message: string };

   export function callLmstudioChatStream(req: LmstudioChatRequest): AsyncIterable<LmstudioChatEvent>;
   export async function callLmstudioChatJson(req: LmstudioChatRequest): Promise<unknown>;
   export async function preflightLmstudioModel(input: { readonly baseUrl: string; readonly model: string; readonly timeoutMs: number }): Promise<{ readonly status: "ready" | "model-not-loaded" | "unreachable" | "http-error"; readonly detail?: string }>;
   ```

3. Refactor coder-adapter to import from `./lmstudio-client.js` instead of inlining the HTTP/SSE code. No behavior change — pure refactor. Coder-adapter tests must continue passing.

4. Test the shared client directly with a stub HTTP server (Phase 4 Plan 04-03 already provides one — reuse).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'export function callLmstudioChatStream\|export function callLmstudioChatJson\|export function preflightLmstudioModel' packages/lmstudio-adapter/src/lmstudio-client.ts | awk '$1 >= 3 {print "ok"}' | grep -q ok && grep -c 'from "./lmstudio-client' packages/lmstudio-adapter/src/coder-adapter.ts && pnpm --filter @protostar/lmstudio-adapter test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `lmstudio-client.ts` exists with three exports: `callLmstudioChatStream`, `callLmstudioChatJson`, `preflightLmstudioModel`
    - `coder-adapter.ts` imports from `./lmstudio-client.js` (no inline HTTP)
    - All existing coder-adapter tests pass (zero regression)
    - Shared client has its own tests
  </acceptance_criteria>
  <done>HTTP/SSE/preflight machinery is reusable; judge adapter (Task 2) consumes it.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: createLmstudioJudgeAdapter + factory-config schema bump</name>
  <files>packages/lmstudio-adapter/src/create-judge-adapter.ts, packages/lmstudio-adapter/src/create-judge-adapter.test.ts, packages/lmstudio-adapter/src/index.ts, packages/intent/schema/factory-config.schema.json</files>
  <read_first>
    - packages/lmstudio-adapter/src/lmstudio-client.ts (Task 1 output)
    - packages/review/src/repair-types.ts (ModelReviewer, ModelReviewInput, ModelReviewResult)
    - packages/review/src/judge-types.ts (JudgeCritique)
    - packages/intent/schema/factory-config.schema.json (current Phase 4 shape)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-10, §Q-11
  </read_first>
  <behavior>
    - Test 1 (happy pass): stub HTTP server returns `{"rubric":{"design-quality":0.8},"verdict":"pass","rationale":"clean"}` → judge returns `ModelReviewResult { verdict: "pass", critiques: [{ judgeId, model, rubric: {...}, verdict: "pass", rationale: "clean", taskRefs: [...] }] }`.
    - Test 2 (verdict repair): stub returns `verdict: "repair"` → ModelReviewResult.verdict === "repair", critiques[0].verdict === "repair".
    - Test 3 (parse failure): stub returns malformed JSON → judge throws or returns block-with-rationale (planner pick: throw a typed `LmstudioJudgeParseError`; loop catches and treats as model-block).
    - Test 4 (model not loaded preflight): preflight returns `model-not-loaded` → judge construction throws OR first call throws (planner pick: deferred — first call throws so adapter construction stays sync).
    - Test 5 (taskRefs default): output `critiques[0].taskRefs` equals all task ids in `admittedPlan.tasks`.
    - Test 6 (rubric is open-key): stub returns `rubric: {"foo": 0.3, "bar": 0.5}` → captured verbatim (no fixed vocabulary).
  </behavior>
  <action>
1. Create `packages/lmstudio-adapter/src/create-judge-adapter.ts` per `<interfaces>`. Use `callLmstudioChatJson` (Task 1) for the actual call (judge response is a single JSON blob, not a stream).
2. Prompt template: include
   - "You are a code review judge for the cosmetic-tweak archetype."
   - Plan summary (intent + AC + tasks list).
   - Mechanical gate (verdict + findings).
   - Unified diff.
   - If `repairContext` present: "Previous attempt failed — critiques attached: <serialized critiques>".
   - Output JSON requirement: `{"rubric":{...},"verdict":"pass|repair|block","rationale":"..."}`.
3. Parse: try `JSON.parse(content)`; if it fails, throw `LmstudioJudgeParseError extends Error` with the raw content as `cause`.
4. Build `JudgeCritique` per `<interfaces>`. `taskRefs` derived as full plan task list for v0.1.
5. Return ModelReviewResult.

6. Update `packages/lmstudio-adapter/src/index.ts`:
   ```ts
   export * from "./create-judge-adapter.js";
   export * from "./lmstudio-client.js";
   // existing exports unchanged
   ```

7. Edit `packages/intent/schema/factory-config.schema.json`:
   - Add `adapters.judge` block per `<interfaces>`.
   - Make `adapters.coder` and `adapters.judge` both required.
   - Bump factory-config schema version if it has one (find via `grep -n schemaVersion packages/intent/schema/factory-config.schema.json`).
   - Add `factory-config.json` example to `examples/factory-config/` if such a directory exists; otherwise document in `.env.example` or in the schema's description.

8. Tests: stub the LM Studio HTTP server (Phase 4 Plan 04-03 fixture). Inject `baseUrl: "http://localhost:<stub-port>"`. Use the stub's "JSON object response" mode.

**LmstudioJudgeParseError disposition:** The loop (Plan 05-10) catches this and emits a model-verdict event with `verdict: "block"` and a synthetic `JudgeCritique` containing the raw content as rationale. Document in this plan's SUMMARY for Plan 05-10 to consume.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'export function createLmstudioJudgeAdapter' packages/lmstudio-adapter/src/create-judge-adapter.ts && grep -c 'export \* from "./create-judge-adapter' packages/lmstudio-adapter/src/index.ts && grep -c '"judge"' packages/intent/schema/factory-config.schema.json && pnpm --filter @protostar/lmstudio-adapter test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function createLmstudioJudgeAdapter' packages/lmstudio-adapter/src/create-judge-adapter.ts` == 1
    - `grep -c 'export \* from "./create-judge-adapter' packages/lmstudio-adapter/src/index.ts` == 1
    - `grep -c '"judge"' packages/intent/schema/factory-config.schema.json` ≥ 1
    - `grep -c 'LmstudioJudgeParseError' packages/lmstudio-adapter/src/create-judge-adapter.ts` ≥ 1
    - All 6 tests pass
  </acceptance_criteria>
  <done>Judge adapter implemented; loop (Plan 05-10) wires it as the ModelReviewer; preflight extension lands in Plan 05-12 (factory-cli wiring).</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| judge adapter ↔ LM Studio HTTP endpoint | network I/O; secrets in env |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-16 | Information Disclosure | judge adapter logs prompts containing diff content | accept | local-only LM Studio; transcript stays in run bundle on operator's disk |
| T-05-17 | Tampering | malformed judge JSON treated as pass | mitigate | LmstudioJudgeParseError throws; loop treats as model-block (Plan 05-10) |
| T-05-18 | Spoofing | judge response forged via MitM | accept | localhost-only LM Studio per Phase 4 Q-09 network.allow=loopback |
</threat_model>

<verification>
- `pnpm --filter @protostar/lmstudio-adapter test` green (existing coder + new judge + shared client)
- factory-config schema validates a config with both adapters.coder and adapters.judge
- Coder-adapter zero regression
</verification>

<success_criteria>
- createLmstudioJudgeAdapter exists, returns ModelReviewer
- Shared lmstudio-client extracted; both adapters consume it
- factory-config.json schema requires both adapters.coder and adapters.judge
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-08-SUMMARY.md`: documents the new judge adapter, the shared client extraction, the factory-config schema bump, and notes that Plan 05-12 extends preflight to verify both models are loaded before run start.
</output>
