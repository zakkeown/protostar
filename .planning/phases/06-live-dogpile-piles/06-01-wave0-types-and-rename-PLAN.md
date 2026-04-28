---
phase: 06-live-dogpile-piles
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/dogpile-types/src/index.ts
  - packages/dogpile-adapter/src/index.ts
  - packages/dogpile-adapter/src/no-fs.contract.test.ts
autonomous: true
requirements: [PILE-06]
tags: [dogpile, sdk, no-fs, rename]
must_haves:
  truths:
    - "@protostar/dogpile-types re-exports the runtime symbols (run, stream, createOpenAICompatibleProvider) and types (RunEvent, RunResult, Trace, RunAccounting, NormalizedStopReason, ConfiguredModelProvider, StreamHandle) needed by Phase 6 wave 1"
    - "@protostar/dogpile-adapter exports executionCoordinationPilePreset (renamed from executionCoordinatorPilePreset per Q-16)"
    - "@protostar/dogpile-adapter src/ has zero node:fs / node:fs/promises / fs / node:path imports (Q-09 static)"
  artifacts:
    - path: "packages/dogpile-types/src/index.ts"
      provides: "Pinned re-export shim over @dogpile/sdk runtime + types"
      exports: ["run", "stream", "createOpenAICompatibleProvider", "RunEvent", "RunResult", "Trace", "RunAccounting", "NormalizedStopReason", "ConfiguredModelProvider", "StreamHandle"]
    - path: "packages/dogpile-adapter/src/index.ts"
      provides: "Renamed preset export (Q-16)"
      contains: "export const executionCoordinationPilePreset"
    - path: "packages/dogpile-adapter/src/no-fs.contract.test.ts"
      provides: "Static fs-import audit mirroring authority-no-fs.contract.test.ts"
      min_lines: 30
  key_links:
    - from: "packages/dogpile-adapter/src/index.ts"
      to: "packages/dogpile-types/src/index.ts"
      via: "import { stream, RunResult, ... } from \"@protostar/dogpile-types\""
      pattern: "from \\\"@protostar/dogpile-types\\\""
---

<objective>
Wave 0 part A — establish the type/runtime re-export shim, perform the Q-16 preset rename, and land the static no-fs contract test that locks the dogpile-adapter authority boundary before any Wave 1 invocation code is written.

Purpose: Wave 1 (`runFactoryPile`, `resolvePileBudget`, `mapSdkStopToPileFailure`) needs SDK runtime + type symbols re-exported through `@protostar/dogpile-types` (the existing shim is types-only). Q-16 rename must land before Wave 3 `factory-config.json` references the symbol. Static no-fs test is cheap and catches future regressions immediately.

Output: Wider `@protostar/dogpile-types` re-export surface; renamed preset; static no-fs contract test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/06-live-dogpile-piles/06-CONTEXT.md
@.planning/phases/06-live-dogpile-piles/06-RESEARCH.md
@packages/dogpile-types/src/index.ts
@packages/dogpile-adapter/src/index.ts
@packages/admission-e2e/src/authority-no-fs.contract.test.ts

<interfaces>
<!-- Verified from node_modules/.pnpm/@dogpile+sdk@0.2.0/node_modules/@dogpile/sdk/dist/types.d.ts -->

`@dogpile/sdk` runtime entrypoints (engine.d.ts):
```ts
export declare function run(options: DogpileOptions): Promise<RunResult>;
export declare function stream(options: DogpileOptions): StreamHandle;
export { createOpenAICompatibleProvider } from "./providers/openai-compatible.js";
```

`@dogpile/sdk/types` symbols needed by Wave 1:
- `RunEvent` (event union) — types.d.ts ~line 1837
- `RunResult` (full run output) — types.d.ts:2177-2203
- `Trace` (JSON-serializable; schemaVersion "1.0") — types.d.ts:2073-2116
- `RunAccounting` — types.d.ts:2008-2027
- `NormalizedStopReason` — types.d.ts:289
- `ConfiguredModelProvider` — provider type
- `StreamHandle` — async iterable + `.result: Promise<RunResult>`

CONFIRMED Wave 1 prerequisite (read at planning time):
`AgentSpec` (types.d.ts:479-487) carries ONLY `{ id, role, instructions? }`. NO per-agent `provider`/`model` field.
Q-03's per-agent override therefore lands at factory-cli (Wave 3 plan 07) as a per-agent provider-routing fallback, NOT on AgentSpec.

Existing static no-fs contract test pattern (mirror exactly):
`packages/admission-e2e/src/authority-no-fs.contract.test.ts:1-50` — uses `walkAllTypeScriptFiles`, regex array
`[/from\s+["']node:fs["']/, /from\s+["']node:fs\/promises["']/, /from\s+["']fs["']/]`,
strips block + line comments before matching, asserts offenders array empty.
For dogpile-adapter additionally include `/from\s+["']node:path["']/` per Q-09 note.
The contract test file itself imports node:path/node:url; it must EXCLUDE itself from the walk.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Widen @protostar/dogpile-types re-export shim</name>
  <files>packages/dogpile-types/src/index.ts</files>
  <read_first>
    - packages/dogpile-types/src/index.ts (current 13-line shim)
    - node_modules/.pnpm/@dogpile+sdk@0.2.0/node_modules/@dogpile/sdk/dist/index.d.ts (verify run, stream, createOpenAICompatibleProvider exported from package root)
    - node_modules/.pnpm/@dogpile+sdk@0.2.0/node_modules/@dogpile/sdk/dist/types.d.ts (confirm RunEvent, RunResult, Trace, RunAccounting, NormalizedStopReason, ConfiguredModelProvider, StreamHandle export names — read lines 270-320 and 2000-2210)
  </read_first>
  <behavior>
    - Import compiles with no `any`-cast; symbols are reachable from `@protostar/dogpile-types` by downstream packages.
    - Existing exports (`AgentSpec`, `DogpileOptions`, `budget`, `convergence`, `firstOf`) remain.
  </behavior>
  <action>
    Edit `packages/dogpile-types/src/index.ts`. Keep the existing exports. Add:
    - Type re-exports from `@dogpile/sdk/types`: `RunEvent`, `RunResult`, `Trace`, `RunAccounting`, `NormalizedStopReason`, `ConfiguredModelProvider`, `StreamHandle`. Use `export type { … } from "@dogpile/sdk/types"`.
    - Runtime re-exports from `@dogpile/sdk`: `run`, `stream`, `createOpenAICompatibleProvider`. Use `export { run, stream, createOpenAICompatibleProvider } from "@dogpile/sdk"`.
    - Preserve the file-header comment ("Authority boundary (locked): this module performs zero I/O.").
    - Per D-01 (Q-01): runtime re-exports here remain network-only at use-site; this shim itself has zero I/O.
    - Per D-02 (Q-02): `stream` and `RunEvent`/`StreamHandle` are exposed because Wave 1 uses `stream()` not `run()`; `run` is re-exported for symmetry / replay scenarios but not used in this phase.
    Build: `pnpm --filter @protostar/dogpile-types build`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/dogpile-types build &amp;&amp; node -e "const m=require('@protostar/dogpile-types'); for (const k of ['run','stream','createOpenAICompatibleProvider','budget','convergence','firstOf']) { if (typeof m[k] !== 'function') throw new Error('missing runtime export: '+k); } console.log('runtime ok')"</automated>
  </verify>
  <done>
    `pnpm --filter @protostar/dogpile-types build` succeeds; node -e prints `runtime ok`; `grep -c "^export" packages/dogpile-types/src/index.ts` is at least 4.
  </done>
</task>

<task type="auto">
  <name>Task 2: Q-16 rename — executionCoordinatorPilePreset → executionCoordinationPilePreset</name>
  <files>packages/dogpile-adapter/src/index.ts</files>
  <read_first>
    - packages/dogpile-adapter/src/index.ts (line 82-100 — current preset declaration)
    - Run `grep -rn "executionCoordinatorPilePreset" packages/ apps/ .planning/codebase/ 2>/dev/null` to confirm zero external callers (CONTEXT Q-16 / RESEARCH A5 assert this; verify before rename).
  </read_first>
  <behavior>
    - Symbol `executionCoordinationPilePreset` is exported with `kind: "execution-coordination"` and identical preset body.
    - No symbol named `executionCoordinatorPilePreset` remains anywhere in the repo (no deprecated alias per Q-16).
  </behavior>
  <action>
    In `packages/dogpile-adapter/src/index.ts`: rename the const `executionCoordinatorPilePreset` to `executionCoordinationPilePreset` (per D-16 / Q-16). Preserve all body fields (kind, description, protocol, tier, agents, budget, terminate). After rename, run a repo-wide grep to verify zero stale references.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/dogpile-adapter build &amp;&amp; grep -q "export const executionCoordinationPilePreset" packages/dogpile-adapter/src/index.ts &amp;&amp; ! grep -rn "executionCoordinatorPilePreset" packages/ apps/ .planning/codebase/ 2>/dev/null</automated>
  </verify>
  <done>
    Build passes; `executionCoordinationPilePreset` exported; no `executionCoordinatorPilePreset` references remain in `packages/`, `apps/`, or `.planning/codebase/`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Static no-fs contract test for dogpile-adapter</name>
  <files>packages/dogpile-adapter/src/no-fs.contract.test.ts</files>
  <read_first>
    - packages/admission-e2e/src/authority-no-fs.contract.test.ts (mirror this pattern exactly)
    - packages/admission-e2e/src/_helpers/barrel-walker.ts (helper signature — note: dogpile-adapter cannot import this file because it lives in admission-e2e; reproduce the walker locally OR walk via fs.readdir in the TEST file only)
  </read_first>
  <behavior>
    - The test file walks `packages/dogpile-adapter/src/` recursively.
    - For each `.ts` file (excluding the contract test itself), it strips block + line comments, then asserts none match the forbidden import patterns.
    - Forbidden imports: `node:fs`, `node:fs/promises`, `fs`, `node:path` (Q-09 / RESEARCH §"Pattern 4").
    - Test FILE may import `node:path`, `node:url`, `node:fs/promises` (it has to walk the tree); the FILE excludes itself by basename.
  </behavior>
  <action>
    Create `packages/dogpile-adapter/src/no-fs.contract.test.ts` mirroring `packages/admission-e2e/src/authority-no-fs.contract.test.ts:1-50`:
    - Use `node:test` (`describe`/`it`) and `node:assert/strict`.
    - Use `dirname(fileURLToPath(import.meta.url))` for the src root.
    - Walk directory recursively with `readdir` from `node:fs/promises` (recursive: true on Node 22). Filter to `.ts` files. EXCLUDE the file with basename `no-fs.contract.test.ts`.
    - For each file: read with `readFile`, strip `/* … */` block comments and `//` line comments, then test the four forbidden patterns:
      `[ /from\s+["']node:fs["']/, /from\s+["']node:fs\/promises["']/, /from\s+["']fs["']/, /from\s+["']node:path["']/ ]`.
    - Push offending file paths into an array; assert deepEqual to `[]` with helpful message.
    - Title: `describe("@protostar/dogpile-adapter — fs authority boundary", ...)`. Test name: `"no node:fs/node:path imports anywhere in src/ (excluding this contract file)"`.
    - The contract test EXISTS in `src/` so it ships with the package's test run; ensure `pnpm --filter @protostar/dogpile-adapter test` picks it up.
    - Per D-09 (Q-09): static + runtime defense-in-depth; runtime test ships in admission-e2e at Wave 4 (Plan 08).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/dogpile-adapter test 2>&amp;1 | grep -E "no node:fs.*imports.*ok|✔.*no-fs|pass.*no-fs"</automated>
  </verify>
  <done>
    `pnpm --filter @protostar/dogpile-adapter test` passes; the no-fs contract test runs and reports OK; the file excludes itself from the walk (verified by file existing AND test passing).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dogpile-adapter src/ → node:fs | Untrusted: any future fs import from inside the adapter would breach the AGENTS.md fs-authority rule (only factory-cli + repo touch fs). |
| @protostar/dogpile-types → @dogpile/sdk | Pinned semver boundary; SDK churn flows through this shim. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-01 | Tampering / Elevation | dogpile-adapter src/ unintentionally imports node:fs (low-severity but architectural) | mitigate | Static no-fs.contract.test.ts (Task 3) walks src/ on every `pnpm verify` and fails on any forbidden import; runtime defense ships in Plan 08 |
| T-6-08 | Tampering | Q-16 rename leaves a deprecated alias that drifts | mitigate | Task 2 grep-asserts zero remaining `executionCoordinatorPilePreset` references repo-wide |
| T-6-09 | Information Disclosure | Widened type shim accidentally re-exports SDK internals | accept | Re-exports are explicit (named export list, not `export *`); SDK public surface is the only attack surface |
</threat_model>

<verification>
- `pnpm --filter @protostar/dogpile-types build` passes.
- `pnpm --filter @protostar/dogpile-adapter test` passes (existing tests + new no-fs test).
- `pnpm --filter @protostar/dogpile-adapter build` passes.
- `grep -rn "executionCoordinatorPilePreset" packages/ apps/ .planning/codebase/` returns nothing.
</verification>

<success_criteria>
- All three tasks complete with green automated verifications.
- Wave 1 (Plans 03 + 04) can `import { stream, RunResult, RunEvent, NormalizedStopReason, ConfiguredModelProvider, StreamHandle, Trace, RunAccounting } from "@protostar/dogpile-types"` without TypeScript error.
- The dogpile-adapter no-fs static contract is locked.
- Q-16 rename complete; symbol available for Wave 3 `factory-config.json` schema reference.
</success_criteria>

<output>
After completion, create `.planning/phases/06-live-dogpile-piles/06-01-SUMMARY.md` recording: re-export list landed, rename complete, no-fs test passing, repo-wide grep clean.
</output>
