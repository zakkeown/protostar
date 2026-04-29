---
phase: 12-authority-boundary-stabilization
plan: 03
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/mechanical-checks/src/diff-name-only.ts
  - packages/mechanical-checks/src/diff-name-only.test.ts
  - packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
  - packages/mechanical-checks/package.json
  - packages/repo/src/diff-name-only.ts
  - packages/repo/src/diff-name-only.test.ts
  - packages/repo/src/index.ts
  - apps/factory-cli/src/wiring/review-loop.ts
autonomous: true
requirements: [AUTH-02]
must_haves:
  truths:
    - "`@protostar/mechanical-checks` src/ has zero `isomorphic-git` imports"
    - "`computeDiffNameOnly` is exported from `@protostar/repo`"
    - "Mechanical-checks adapter takes `diffNameOnly: readonly string[]` as input — no `gitFs` field"
    - "`mechanical-checks/package.json` no longer declares `isomorphic-git` dep"
    - "no-net contract test in mechanical-checks stays green (it always was — now production source agrees)"
  artifacts:
    - path: "packages/repo/src/diff-name-only.ts"
      provides: "computeDiffNameOnly using isomorphic-git inside fs-tier"
      contains: "isomorphic-git"
    - path: "packages/mechanical-checks/src/create-mechanical-checks-adapter.ts"
      provides: "Adapter consumes injected diffNameOnly"
      contains: "diffNameOnly: readonly string[]"
  key_links:
    - from: "apps/factory-cli/src/wiring/review-loop.ts"
      to: "packages/repo/src/diff-name-only.ts"
      via: "computeDiffNameOnly call before mechanical adapter construction"
      pattern: "computeDiffNameOnly"
---

<objective>
Move `computeDiffNameOnly` (and its `isomorphic-git` dep) out of `@protostar/mechanical-checks` (declared `pure`) and into `@protostar/repo` (`fs` tier where `isomorphic-git` belongs). Reshape the mechanical-checks adapter to consume an injected `diffNameOnly: readonly string[]`. Wire `apps/factory-cli/src/wiring/review-loop.ts` to compute diff names before adapter construction.

Purpose: Restores the no-net contract (T-12-04 mitigation indirectly via tier integrity). Mechanical-checks tier stays `pure`; production source aligns.
Output: File relocated; adapter input shape changed; `isomorphic-git` dep removed from mechanical-checks; review-loop wiring updated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@AGENTS.md
@.planning/phases/12-authority-boundary-stabilization/12-CONTEXT.md
@.planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Move diff-name-only into @protostar/repo</name>
  <files>packages/repo/src/diff-name-only.ts, packages/repo/src/diff-name-only.test.ts, packages/repo/src/index.ts, packages/mechanical-checks/src/diff-name-only.ts, packages/mechanical-checks/src/diff-name-only.test.ts, packages/mechanical-checks/package.json</files>
  <read_first>
    - packages/mechanical-checks/src/diff-name-only.ts (entire file — contents move verbatim)
    - packages/mechanical-checks/src/diff-name-only.test.ts (entire file — moves verbatim, import paths update)
    - packages/repo/src/index.ts (current barrel exports — add computeDiffNameOnly + ComputeDiffNameOnlyInput re-exports)
    - packages/repo/package.json (verify isomorphic-git is already a dep)
    - packages/mechanical-checks/package.json (line 24 — isomorphic-git dep to drop)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Mechanical-checks no-net violation (D-02) — relocation steps" (lines 422-478)
  </read_first>
  <behavior>
    - `computeDiffNameOnly` continues to return the same `readonly string[]` of changed file names given the same input.
    - Existing test cases pass after the move (same fixtures, same assertions).
    - `import { computeDiffNameOnly } from "@protostar/repo"` resolves successfully.
    - `import git from "isomorphic-git"` does NOT appear anywhere under `packages/mechanical-checks/src/`.
  </behavior>
  <action>
    1. **Move source**: copy `packages/mechanical-checks/src/diff-name-only.ts` content to `packages/repo/src/diff-name-only.ts` verbatim. Then delete `packages/mechanical-checks/src/diff-name-only.ts`.

    2. **Move test**: copy `packages/mechanical-checks/src/diff-name-only.test.ts` content to `packages/repo/src/diff-name-only.test.ts`. Update its import statement from `from "./diff-name-only.js"` to `from "./diff-name-only.js"` (same relative path — co-located). Delete `packages/mechanical-checks/src/diff-name-only.test.ts`.

    3. **Re-export from `packages/repo/src/index.ts`**: append:
       ```typescript
       export { computeDiffNameOnly } from "./diff-name-only.js";
       export type { ComputeDiffNameOnlyInput } from "./diff-name-only.js";
       ```
       (Confirm exact named exports from the moved file — if it exports differently, mirror that.)

    4. **Drop `isomorphic-git` from `packages/mechanical-checks/package.json`**: delete line 24's `"isomorphic-git": "..."` dependency entry. Also drop any `@types/...` if present. Verify with `grep -c isomorphic-git packages/mechanical-checks/package.json` returning 0.

    5. **Build sanity**: `pnpm --filter @protostar/repo build` then `pnpm --filter @protostar/mechanical-checks build` should both succeed at this point only if the adapter file is also reshaped — Task 2 handles that. Skip the mechanical-checks build until Task 2.
  </action>
  <verify>
    <automated>test -f packages/repo/src/diff-name-only.ts &amp;&amp; test -f packages/repo/src/diff-name-only.test.ts &amp;&amp; ! test -f packages/mechanical-checks/src/diff-name-only.ts &amp;&amp; grep -q 'computeDiffNameOnly' packages/repo/src/index.ts &amp;&amp; ! grep -q 'isomorphic-git' packages/mechanical-checks/package.json &amp;&amp; pnpm --filter @protostar/repo build &amp;&amp; pnpm --filter @protostar/repo test</automated>
  </verify>
  <acceptance_criteria>
    - `packages/repo/src/diff-name-only.ts` exists; `packages/mechanical-checks/src/diff-name-only.ts` does not.
    - `packages/repo/src/diff-name-only.test.ts` exists.
    - `packages/repo/src/index.ts` contains `export { computeDiffNameOnly }`.
    - `grep -c '"isomorphic-git"' packages/mechanical-checks/package.json` returns 0.
    - `pnpm --filter @protostar/repo test` passes.
  </acceptance_criteria>
  <done>computeDiffNameOnly lives in @protostar/repo; isomorphic-git dep removed from mechanical-checks.</done>
</task>

<task type="auto">
  <name>Task 2: Reshape mechanical-checks adapter to consume injected diffNameOnly</name>
  <files>packages/mechanical-checks/src/create-mechanical-checks-adapter.ts, apps/factory-cli/src/wiring/review-loop.ts</files>
  <read_first>
    - packages/mechanical-checks/src/create-mechanical-checks-adapter.ts (lines 1-200 — adapter config interface at line 48-58, current gitFs usage at lines 7, 16, 115-119; reference sites at lines 126, 133, 142, 192)
    - apps/factory-cli/src/wiring/review-loop.ts (lines 127-143 — `mechanicalAdapterConfig` function shape; lines 115-125 — defaultMechanicalCommandsForArchetype)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Mechanical-checks no-net violation" steps 4-5 (lines 453-475)
    - packages/mechanical-checks/src/no-net.contract.test.ts (line 23 — confirms `isomorphic-git` is in FORBIDDEN_NET_PATTERNS; this test must stay green)
  </read_first>
  <action>
    In `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts`:
    1. Remove the `import` lines pulling in `isomorphic-git` types (line 7's `import type { FsClient } from "isomorphic-git"` — drop it).
    2. Remove the `import { computeDiffNameOnly }` (line 16) — adapter no longer calls it.
    3. In the `MechanicalChecksAdapterConfig` interface (around line 48-58):
       - DELETE: `readonly gitFs: FsClient;`
       - ADD: `readonly diffNameOnly: readonly string[];`
    4. DELETE the `computeDiffNameOnly` invocation block (lines 115-119 per research):
       ```typescript
       const diffNameOnly = await computeDiffNameOnly({
         fs: config.gitFs,
         workspaceRoot: config.workspaceRoot,
         baseRef: config.baseRef
       });
       ```
       Replace any reference to the local `diffNameOnly` variable with `config.diffNameOnly` at lines 126, 133, 142, 192 (per RESEARCH).
    5. The adapter is now a pure transform — no fs, no git. The `no-net.contract.test.ts` should now pass with the production source.

    In `apps/factory-cli/src/wiring/review-loop.ts:127-143` (`mechanicalAdapterConfig`):
    1. Add an import: `import { computeDiffNameOnly } from "@protostar/repo";`.
    2. The function returns the adapter config. Where it currently passes `gitFs: input.gitFs`, REPLACE with:
       ```typescript
       diffNameOnly: await computeDiffNameOnly({
         fs: input.gitFs,
         workspaceRoot: input.workspaceRoot,
         baseRef: input.baseRef
       }),
       ```
       Note this changes timing — diff is computed BEFORE the adapter runs (per D-02). The function may need to become `async` if it isn't already; cascade the `await` up to its caller as needed.
  </action>
  <verify>
    <automated>! grep -q 'isomorphic-git' packages/mechanical-checks/src/create-mechanical-checks-adapter.ts &amp;&amp; ! grep -q 'gitFs' packages/mechanical-checks/src/create-mechanical-checks-adapter.ts &amp;&amp; grep -q 'diffNameOnly: readonly string\[\]' packages/mechanical-checks/src/create-mechanical-checks-adapter.ts &amp;&amp; grep -q 'computeDiffNameOnly' apps/factory-cli/src/wiring/review-loop.ts &amp;&amp; pnpm --filter @protostar/mechanical-checks test &amp;&amp; pnpm --filter @protostar/factory-cli build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'isomorphic-git\|gitFs' packages/mechanical-checks/src/` returns 0 (excluding test fixtures).
    - `MechanicalChecksAdapterConfig` interface declares `diffNameOnly: readonly string[]` (literal substring match).
    - `apps/factory-cli/src/wiring/review-loop.ts` contains a call to `computeDiffNameOnly`.
    - `pnpm --filter @protostar/mechanical-checks test` passes (no-net contract green).
    - `pnpm --filter @protostar/factory-cli build` passes.
    - Full `pnpm run verify` deferred to 12-01 Task 3 (Wave 0 end-of-wave gate).
  </acceptance_criteria>
  <done>mechanical-checks src/ is fully pure (no isomorphic-git, no gitFs); review-loop wiring computes diff before adapter; no-net contract holds in production.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| pure tier → fs tier | `isomorphic-git` was crossing the boundary inside mechanical-checks; relocation re-seals |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-12-04 (related) | Repudiation | mechanical-checks tier classification | mitigate | Removing isomorphic-git import means manifest tier `pure` is honest; no-net contract holds; downstream three-way check (12-07) will agree |
</threat_model>

<verification>
- `packages/mechanical-checks/src/no-net.contract.test.ts` passes against production source (it always passed against tests; now passes against src/ too).
- Full `pnpm run verify` deferred to 12-01 Task 3 (Wave 0 end-of-wave gate, 5x flake check).
</verification>

<success_criteria>
- AUTH-02 satisfied: mechanical-checks is genuinely pure; computeDiffNameOnly in repo; adapter consumes injected names.
</success_criteria>

<output>
After completion, create `.planning/phases/12-authority-boundary-stabilization/12-03-SUMMARY.md`
</output>
