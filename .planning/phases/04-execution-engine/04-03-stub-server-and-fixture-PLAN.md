---
phase: 04-execution-engine
plan: 03
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/lmstudio-adapter/package.json
  - packages/lmstudio-adapter/tsconfig.json
  - packages/lmstudio-adapter/src/index.ts
  - packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts
  - packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.test.ts
  - packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts
  - packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.test.ts
  - tsconfig.json
autonomous: true
requirements: [EXEC-03, EXEC-04]
must_haves:
  truths:
    - "`@protostar/lmstudio-adapter` workspace exists and is wired into pnpm-workspace + root tsconfig references"
    - "Stub LM Studio HTTP server starts on 127.0.0.1:0, serves canned `GET /v1/models`, and streams canned SSE chunks for `POST /v1/chat/completions`"
    - "Stub server supports injectable failure modes: unreachable (close before request), 5xx response, malformed SSE, mid-stream abort, slow drip (delay between chunks)"
    - "Cosmetic-tweak fixture exports an intent draft + plan + expected diff shape consumable by Wave 1 adapter tests"
    - "Package contains zero `node:fs` imports outside `internal/test-fixtures/`"
  artifacts:
    - path: packages/lmstudio-adapter/package.json
      provides: "Workspace manifest"
    - path: packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts
      provides: "Reusable LM Studio HTTP stub"
      exports: ["startStubLmstudio"]
    - path: packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts
      provides: "Canonical cosmetic-tweak intent + plan + expected diff"
      exports: ["cosmeticTweakFixture"]
  key_links:
    - from: "packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts"
      to: "node:http createServer"
      via: "127.0.0.1:0 ephemeral port"
      pattern: "createServer\\("
---

<objective>
Stand up the `@protostar/lmstudio-adapter` workspace skeleton plus the load-bearing test fixture (stub LM Studio HTTP server + cosmetic-tweak fixture). This plan ships ZERO production adapter code — only the package wiring and the test fixtures every Wave 1 plan will depend on.

Per advisor "constraint #5": stub server is the load-bearing test asset. Every Wave 1 adapter test imports it.

Purpose: Unblock Wave 1 by delivering a deterministic, fail-mode-injectable LM Studio simulator.
Output: Workspace skeleton + stub server + cosmetic-tweak fixture, all under `internal/test-fixtures/` (Phase 3 Q-18 carve-out pattern for fs-using test code).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-execution-engine/04-CONTEXT.md
@.planning/phases/04-execution-engine/04-RESEARCH.md
@.planning/phases/04-execution-engine/04-PATTERNS.md
@AGENTS.md
@packages/dogpile-adapter/package.json
@packages/dogpile-adapter/tsconfig.json
@packages/dogpile-adapter/src/index.ts

<interfaces>
Stub server signature (from RESEARCH §"Stubbed LM Studio server for tests"):

```typescript
export interface StubLmstudioOptions {
  models?: readonly string[];          // GET /v1/models data ids; default ["qwen3-coder-next-mlx-4bit"]
  chunks?: readonly string[];          // delta.content sequence; emitted as SSE
  preflightStatus?: number;            // override (e.g. 500 to test admission failure)
  chatStatus?: number;                 // override for chat completions (e.g. 503 to test retry)
  delayMsBetweenChunks?: number;       // for timeout / abort tests
  closeAfterChunks?: number;           // close socket mid-stream
  malformedSse?: boolean;              // emit "data: {not json}\n\n" once
  emptyStream?: boolean;               // emit only "data: [DONE]\n\n" (Pitfall 6)
}

export interface StubLmstudioHandle {
  readonly baseUrl: string;             // e.g. "http://127.0.0.1:54321/v1"
  readonly chatRequests: ReadonlyArray<{ method: string; body: unknown }>;
  close(): Promise<void>;
}

export function startStubLmstudio(opts?: StubLmstudioOptions): Promise<StubLmstudioHandle>;
```

Cosmetic-tweak fixture:

```typescript
export interface CosmeticTweakFixture {
  readonly intent: ConfirmedIntent;             // signed; envelope already 1.3.0-shaped (typed; not yet schema-bumped)
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly task: ExecutionAdapterTaskInput;     // single task with targetFiles=["src/Button.tsx"]
  readonly preImageBytes: Record<string, Uint8Array>; // path → bytes (the "current" Button.tsx etc)
  readonly expectedDiffSample: string;          // a known-good unified diff fenced as ```diff for parser tests
  readonly proseDriftDiffSample: string;        // same diff with "Sure, here's the patch:" preamble (parse-reformat path)
}
export const cosmeticTweakFixture: CosmeticTweakFixture;
```

Package boundary (AGENTS.md): `packages/lmstudio-adapter/src/**` MUST NOT import `node:fs` or `node:net`. The stub server uses `node:http` and lives under `packages/lmstudio-adapter/internal/test-fixtures/` — this `internal/` carve-out follows Phase 3 Q-18 precedent (test-only code allowed to use Node primitives).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Package skeleton + workspace wiring</name>
  <files>packages/lmstudio-adapter/package.json, packages/lmstudio-adapter/tsconfig.json, packages/lmstudio-adapter/src/index.ts, tsconfig.json</files>
  <read_first>
    - packages/dogpile-adapter/package.json (verbatim template)
    - packages/dogpile-adapter/tsconfig.json
    - tsconfig.json (root) for the references[] list
    - pnpm-workspace.yaml (confirm `packages/*` glob covers new pkg)
  </read_first>
  <action>
    1. `packages/lmstudio-adapter/package.json` — copy `packages/dogpile-adapter/package.json` verbatim, change `name` to `"@protostar/lmstudio-adapter"`, replace `dependencies` with:
       ```json
       "dependencies": {
         "@protostar/execution": "workspace:*",
         "@protostar/intent": "workspace:*",
         "@protostar/authority": "workspace:*",
         "@protostar/repo": "workspace:*",
         "@protostar/artifacts": "workspace:*"
       }
       ```
       Keep `"test": "pnpm run build && node --test dist/**/*.test.js"` (note: glob updated to `dist/**/*.test.js` so `internal/test-fixtures/*.test.ts` compiled paths are picked up).
    2. `packages/lmstudio-adapter/tsconfig.json` — copy from dogpile-adapter; ensure `references: [{path: "../execution"}, {path: "../intent"}, {path: "../authority"}, {path: "../repo"}, {path: "../artifacts"}]`. Set `include: ["src/**/*", "internal/**/*"]`.
    3. `packages/lmstudio-adapter/src/index.ts` — barrel placeholder: `// Public surface populated in Plans 04-04 / 04-05 / 04-06.\nexport {};`.
    4. Root `tsconfig.json` — add `{ "path": "packages/lmstudio-adapter" }` to `references` (insert between `dogpile-adapter` and `factory-cli` entries).
    5. `pnpm install` to resolve workspace links.
    6. Verify build: `pnpm --filter @protostar/lmstudio-adapter build` succeeds.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm install --silent 2>&1 | tail -5 && pnpm --filter @protostar/lmstudio-adapter build 2>&1 | tail -5 && grep -c '"@protostar/execution"' packages/lmstudio-adapter/package.json</automated>
  </verify>
  <acceptance_criteria>
    - `packages/lmstudio-adapter/package.json` exists with `name: "@protostar/lmstudio-adapter"`
    - `tsconfig.json` (root) references include `packages/lmstudio-adapter`
    - `pnpm --filter @protostar/lmstudio-adapter build` exits 0
    - `grep -c '"@protostar/execution"' packages/lmstudio-adapter/package.json` ≥ 1
  </acceptance_criteria>
  <done>Workspace built; barrel exports nothing; ready to host fixtures.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Stub LM Studio HTTP server fixture</name>
  <files>packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts, packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.test.ts</files>
  <read_first>
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"Stubbed LM Studio server for tests" + §"LM Studio Wire Format"
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-10, §Q-13, §pitfalls in RESEARCH
  </read_first>
  <behavior>
    - Test 1: `startStubLmstudio({ models: ["m1","m2"] })` → `GET ${baseUrl}/models` returns `{ object:"list", data:[{id:"m1",...},{id:"m2",...}] }`.
    - Test 2: `startStubLmstudio({ chunks: ["a","b","c"] })` → `POST ${baseUrl}/chat/completions` with `stream:true` emits three SSE chunks each carrying `delta.content` of "a"/"b"/"c", followed by `data: [DONE]`.
    - Test 3: `chatStatus: 503` returns 503 body without streaming.
    - Test 4: `closeAfterChunks: 1` emits one chunk then closes the socket (tests undici read-error behavior).
    - Test 5: `delayMsBetweenChunks: 100` introduces measurable delay (test asserts ≥80ms between two chunks).
    - Test 6: `emptyStream: true` emits only `data: [DONE]\n\n` (Pitfall 6).
    - Test 7: `malformedSse: true` emits one `data: {not json` line (parser test will reject).
    - Test 8: `chatRequests` records each POST body for assertion in adapter tests.
    - Test 9: `close()` releases the listening socket cleanly (subsequent connect refuses).
  </behavior>
  <action>
    Create `packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts` per `<interfaces>`. Implementation skeleton:
    ```ts
    import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
    import { AddressInfo } from "node:net";

    export async function startStubLmstudio(opts: StubLmstudioOptions = {}): Promise<StubLmstudioHandle> {
      const requests: Array<{ method: string; body: unknown }> = [];
      const server: Server = createServer(async (req, res) => {
        // route /v1/models and /v1/chat/completions; honor opts flags
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as AddressInfo).port;
      return { baseUrl: `http://127.0.0.1:${port}/v1`, chatRequests: requests, close: () => new Promise(r => server.close(() => r())) };
    }
    ```
    SSE emission: write `data: ${JSON.stringify({choices:[{index:0,delta:{content:chunk},finish_reason:null}]})}\n\n` per chunk; final chunk has `delta:{}` and `finish_reason:"stop"`; then `data: [DONE]\n\n`.
    Use ONLY `node:http` and `node:net`; NO external deps. Keep file under 200 LOC.
    Tests: use `node:test` + global `fetch` to drive the server; assert on `Response.body` reader output.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/lmstudio-adapter build 2>&1 | tail -5 && cd packages/lmstudio-adapter && node --test dist/internal/test-fixtures/stub-lmstudio-server.test.js 2>&1 | tail -25 && grep -c "createServer" src/../internal/test-fixtures/stub-lmstudio-server.ts</automated>
  </verify>
  <acceptance_criteria>
    - File exists at exact path
    - All 9 behaviors covered by tests
    - `node --test dist/internal/test-fixtures/stub-lmstudio-server.test.js` exits 0
    - `grep -E "node:fs|node:fs/" packages/lmstudio-adapter/src/` returns nothing (`internal/` is not `src/`)
  </acceptance_criteria>
  <done>Stub server is the load-bearing test asset; Wave 1 tests can construct any failure mode.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Cosmetic-tweak fixture</name>
  <files>packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts, packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.test.ts</files>
  <read_first>
    - packages/intent/src/index.ts (ConfirmedIntent shape — current 1.1/1.2.0 schema; we'll type the 1.3.0 fields directly)
    - packages/planning/src/index.ts (AdmittedPlanExecutionArtifact)
    - packages/execution/src/adapter-contract.ts (Plan 02 — ExecutionAdapterTaskInput)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-11 (targetFiles)
  </read_first>
  <behavior>
    - Test 1: `cosmeticTweakFixture.task.targetFiles` has length ≥ 1, contains `"src/Button.tsx"`.
    - Test 2: `cosmeticTweakFixture.preImageBytes["src/Button.tsx"]` decodes to a small TSX string containing the literal `bg-blue-500`.
    - Test 3: `cosmeticTweakFixture.expectedDiffSample` matches the strict fence regex `/^```(?:diff|patch)?\s*\n([\s\S]*?)\n```\s*$/m`.
    - Test 4: `cosmeticTweakFixture.proseDriftDiffSample` does NOT match the strict regex (has prose preamble) but contains the same fenced diff content.
    - Test 5: `cosmeticTweakFixture.intent.capabilityEnvelope.network.allow === "loopback"` and `.budget.taskWallClockMs === 180000` (typed 1.3.0 fields).
  </behavior>
  <action>
    Create `packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts`:
    - `intent`: a hand-built `ConfirmedIntent` with archetype `cosmetic-tweak`, AC `["The primary button uses red background"]`, and a typed envelope mirroring the 1.3.0 shape: `{ workspace: {...trusted...}, network: { allow: "loopback" }, budget: { taskWallClockMs: 180_000, adapterRetriesPerTask: 4, maxRepairLoops: 0 }, toolPermissions: { network: "allow", subprocess: "deny", ... } }`. Bypass `promoteIntentDraft` for fixture purposes — use a test builder if available, or a `Object.freeze(...)` cast. Mark TODO that re-canonicalization happens in Plan 07.
    - `admittedPlan`: minimum shape with one task `{ id: "task-1", title: "Recolor primary button", targetFiles: ["src/Button.tsx"], adapterRef: "lmstudio-coder", dependsOn: [] }`.
    - `task`: derived `ExecutionAdapterTaskInput` from above.
    - `preImageBytes`: `{ "src/Button.tsx": new TextEncoder().encode("export const Button = () => <button className=\"bg-blue-500\">Click</button>;") }`.
    - `expectedDiffSample`: triple-backtick `diff` fence containing a unified diff that changes `bg-blue-500` to `bg-red-500`. (Format: `--- a/src/Button.tsx\n+++ b/src/Button.tsx\n@@ ...`)
    - `proseDriftDiffSample`: same content prefixed with `"Sure, here's the patch:\n\n"` and suffixed with `"\n\nLet me know if you want me to adjust."`.
    Tests assert the five behaviors. Use `node:test` `assert.match` for regex tests.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/lmstudio-adapter build 2>&1 | tail -5 && cd packages/lmstudio-adapter && node --test dist/internal/test-fixtures/cosmetic-tweak-fixture.test.js 2>&1 | tail -20 && grep -c 'bg-blue-500' internal/test-fixtures/cosmetic-tweak-fixture.ts</automated>
  </verify>
  <acceptance_criteria>
    - File exports `cosmeticTweakFixture` const matching `CosmeticTweakFixture` interface
    - Tests pass
    - `expectedDiffSample` matches the diff-parser regex from Plan 05
    - `proseDriftDiffSample` does NOT match (has prose) — proves parse-reformat retry path will engage
  </acceptance_criteria>
  <done>Fixture canon set; downstream Wave 1 tests assert against `expectedDiffSample` and `proseDriftDiffSample`.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| stub server ↔ host network | binds 127.0.0.1:0 — never exposed beyond loopback |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-04-06 | Information Disclosure | Stub server binds 0.0.0.0 | mitigate | Hard-code `"127.0.0.1"` in `server.listen()`; assert in test |
| T-04-07 | DoS | Stub server leaked open after test crash | mitigate | Each test wraps in `t.after(() => handle.close())`; closes within node:test teardown |
| T-04-08 | Tampering | fixture used in production | mitigate | Fixture under `internal/test-fixtures/`; not in package public exports |
</threat_model>

<verification>
- `pnpm --filter @protostar/lmstudio-adapter test` green
- `grep -rn 'node:fs\|node:fs/promises' packages/lmstudio-adapter/src/` returns zero matches
- `internal/test-fixtures/` may import `node:http`, `node:net`; never appears in `src/` barrel
</verification>

<success_criteria>
- Workspace builds, links, and tests run
- Stub server supports all 7 failure modes used by Wave 1 tests
- Cosmetic-tweak fixture is the canonical input for every adapter integration test
</success_criteria>

<output>
Create `.planning/phases/04-execution-engine/04-03-SUMMARY.md` with: stub server option matrix, fixture file paths, sample diff content, and a "How to use this in Wave 1 tests" snippet.
</output>
