---
phase: 07-delivery
plan: 02
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/delivery-runtime/package.json
  - packages/delivery-runtime/tsconfig.json
  - packages/delivery-runtime/vitest.config.ts
  - packages/delivery-runtime/src/index.ts
  - packages/delivery-runtime/src/no-fs.contract.test.ts
  - packages/delivery-runtime/src/no-merge.contract.test.ts
  - packages/delivery-runtime/src/nock-octokit-smoke.test.ts
  - pnpm-workspace.yaml
  - tsconfig.json
  - package.json
autonomous: true
requirements: [DELIVER-01, DELIVER-07]
must_haves:
  truths:
    - "@protostar/delivery-runtime workspace exists and is registered in pnpm + root TypeScript references"
    - "Static contract test forbids any node:fs/node:path imports in delivery-runtime/src/"
    - "Static contract test forbids any merge surfaces (pulls.merge / pullRequests.merge / enableAutoMerge / merge_method / git merge --) in delivery-runtime/src/"
    - "Nock 14 + Octokit 22 fetch interception works on this Node 22 install (smoke test green)"
    - "delivery-runtime is added to root verify script"
  artifacts:
    - path: packages/delivery-runtime/package.json
      contains: '"@protostar/delivery-runtime"'
    - path: packages/delivery-runtime/src/no-fs.contract.test.ts
      provides: "Static grep forbids node:fs/node:path imports in src/"
    - path: packages/delivery-runtime/src/no-merge.contract.test.ts
      provides: "Static grep forbids merge surfaces"
    - path: packages/delivery-runtime/src/nock-octokit-smoke.test.ts
      provides: "Nock-vs-fetch smoke verification (Pitfall 6 gate)"
  key_links:
    - from: pnpm-workspace.yaml
      to: packages/delivery-runtime/package.json
      via: "Workspace registration"
      pattern: "packages/delivery-runtime"
    - from: tsconfig.json
      to: packages/delivery-runtime/tsconfig.json
      via: "TypeScript project reference"
      pattern: '"path": "packages/delivery-runtime"'
---

<objective>
Stand up the `@protostar/delivery-runtime` workspace skeleton with the network-permitted, fs-forbidden tier conventions established by `@protostar/dogpile-adapter` (Phase 6). Land the two static contract tests that gate the entire phase (`no-fs.contract.test.ts`, `no-merge.contract.test.ts`) and the Wave-0 nock-vs-Octokit-22 smoke test from RESEARCH Pitfall 6 — if nock 14 cannot intercept Octokit 22's native fetch on Node 22, this plan's failure routes the operator to swap to `msw` BEFORE any downstream plan touches the test surface.

Purpose: De-risk Pitfall 6 + lock the authority boundary (no fs, no merge) before any executable code lands.
Output: Empty package compiles + tests; `pnpm run verify` exercises the new package.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/07-delivery/07-CONTEXT.md
@.planning/phases/07-delivery/07-RESEARCH.md
@.planning/phases/07-delivery/07-PATTERNS.md
@packages/dogpile-adapter/package.json
@packages/dogpile-adapter/tsconfig.json
@packages/dogpile-adapter/src/no-fs.contract.test.ts

<interfaces>
<!-- The dogpile-adapter package is the verbatim template for delivery-runtime structure. -->
<!-- Copy package.json + tsconfig.json + the no-fs contract test, then adapt names. -->

From packages/dogpile-adapter/src/no-fs.contract.test.ts (the template):
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const SELF_BASENAME = "no-fs.contract.test.ts";
const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, "../src");

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /from\s+["']node:fs["']/,
  /from\s+["']node:fs\/promises["']/,
  /from\s+["']fs["']/,
  /from\s+["']node:path["']/,
  /from\s+["']path["']/
];
// ... walker + assertion ...
```

For no-merge.contract.test.ts, replace FORBIDDEN_PATTERNS with:
```typescript
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /pulls\.merge\b/,
  /pullRequests\.merge\b/,
  /enableAutoMerge\b/,
  /merge_method\b/,
  /\bautomerge\b/i,
  /pulls\.updateBranch\b/,
  /["']gh\s+pr\s+merge["']/,
  /git\s+merge\s+--/
];
```

Add `SELF_BASENAME = "no-merge.contract.test.ts"` and exclude both contract test basenames from each test's walker.

Nock smoke test (Pitfall 6):
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Octokit } from "@octokit/rest";
import nock from "nock";

describe("nock-vs-octokit-22 fetch interception (Pitfall 6 gate)", () => {
  it("intercepts Octokit's native fetch and returns mocked response", async () => {
    const scope = nock("https://api.github.com")
      .get("/user")
      .reply(200, { login: "test-user" });
    nock.disableNetConnect();
    try {
      const o = new Octokit({ auth: "ghp_TEST_FAKE_NOT_REAL_36CHARS_xxxxxxxxxxxx" });
      const r = await o.rest.users.getAuthenticated();
      assert.equal(r.data.login, "test-user");
      scope.done();
    } finally {
      nock.cleanAll();
      nock.enableNetConnect();
    }
  });
});
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create package skeleton + register in workspace</name>
  <read_first>
    - packages/dogpile-adapter/package.json (the verbatim template; copy structure, swap name)
    - packages/dogpile-adapter/tsconfig.json (template)
    - pnpm-workspace.yaml (current workspace list — append delivery-runtime)
    - tsconfig.json (root project references — append the new package)
    - package.json (root scripts — `verify` script must include the new package)
  </read_first>
  <files>packages/delivery-runtime/package.json, packages/delivery-runtime/tsconfig.json, packages/delivery-runtime/vitest.config.ts, packages/delivery-runtime/src/index.ts, pnpm-workspace.yaml, tsconfig.json, package.json</files>
  <action>
    1. Copy `packages/dogpile-adapter/package.json` → `packages/delivery-runtime/package.json`. Change `"name"` to `"@protostar/delivery-runtime"`. Set `"version": "0.0.0"`. Keep `"private": true`, `"type": "module"`. Scripts mirror dogpile-adapter (build, test, typecheck).
    2. Add runtime deps in `packages/delivery-runtime/package.json`:
       - `"@octokit/rest": "^22.0.1"` (per RESEARCH §"Standard Stack")
       - `"@octokit/plugin-retry": "^7"`
       - `"@octokit/plugin-throttling": "^9"`
       - `"isomorphic-git": "1.37.6"` (matches Phase 3 lock; not `^` — exact match)
    3. Add devDeps:
       - `"nock": "^14.0.13"`
       - Type packages already shared at root; add explicit `"@types/node"` if not already.
    4. Workspace deps (link references): `"@protostar/delivery": "workspace:*"`, `"@protostar/intent": "workspace:*"`, `"@protostar/review": "workspace:*"`, `"@protostar/artifacts": "workspace:*"`. (No `@protostar/repo` — delivery-runtime is fs-forbidden and doesn't import repo's fs adapter.)
    5. Copy `packages/dogpile-adapter/tsconfig.json` → `packages/delivery-runtime/tsconfig.json`. Update `references` to point at the workspace deps (`../delivery`, `../intent`, `../review`, `../artifacts`).
    6. Create `packages/delivery-runtime/src/index.ts` as a placeholder barrel: `export {};` (no exports yet — Wave 2/3 plans add them). The barrel exists so the package's build target is non-empty.
    7. Append `packages/delivery-runtime` to `pnpm-workspace.yaml` `packages:` list (alphabetical position after `delivery`).
    8. Append `{ "path": "packages/delivery-runtime" }` to root `tsconfig.json` `references` array.
    9. Update root `package.json` `verify` script to include `--filter @protostar/delivery-runtime` in the test/typecheck filter list. If verify uses turbo, ensure delivery-runtime is in the affected graph; if using pnpm `--filter`, append it explicitly.
    10. Run `pnpm install` to register the workspace.
  </action>
  <verify>
    <automated>pnpm install && pnpm --filter @protostar/delivery-runtime build</automated>
  </verify>
  <acceptance_criteria>
    - `cat packages/delivery-runtime/package.json | grep -c '@protostar/delivery-runtime'` ≥ 1
    - `cat pnpm-workspace.yaml | grep -c 'packages/delivery-runtime'` ≥ 1 (or wildcard match `packages/*` covers it; verify pnpm sees the package via `pnpm list -r --depth -1 | grep delivery-runtime`)
    - `pnpm --filter @protostar/delivery-runtime build` exits 0
    - `cat tsconfig.json | grep -c 'packages/delivery-runtime'` ≥ 1
  </acceptance_criteria>
  <done>Package compiles empty; pnpm and TypeScript both see it.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Land static contract tests (no-fs + no-merge) — RED then GREEN</name>
  <read_first>
    - packages/dogpile-adapter/src/no-fs.contract.test.ts (verbatim template — copy structure, swap basenames + patterns)
    - .planning/phases/07-delivery/07-PATTERNS.md §"Pattern S-2: Static authority-boundary contract test"
    - .planning/phases/07-delivery/07-VALIDATION.md §"Required Contract Tests" #1 and #2
  </read_first>
  <behavior>
    - Test 1 (no-fs): scans every `.ts` file in `packages/delivery-runtime/src/` (excluding the contract test itself by basename), strips comments, then asserts `FORBIDDEN_PATTERNS` (node:fs / node:fs/promises / fs / node:path / path imports) match zero offenders.
    - Test 2 (no-merge): identical walker; FORBIDDEN_PATTERNS = `/pulls\.merge\b/`, `/pullRequests\.merge\b/`, `/enableAutoMerge\b/`, `/merge_method\b/`, `/automerge/i`, `/pulls\.updateBranch\b/`, `/["']gh\s+pr\s+merge["']/`, `/git\s+merge\s+--/`. Excludes both contract test basenames (no-fs and no-merge) from the walker so test files describing the forbidden strings don't trigger themselves.
    - Both tests use `grep -v '^#'` equivalent in TS by stripping `// …` and `/* … */` comments before regex match (per Critical Rules: bare `grep -c` on raw files counts comments, which would self-invalidate — for source `.ts` files, strip line comments before pattern match).
  </behavior>
  <files>packages/delivery-runtime/src/no-fs.contract.test.ts, packages/delivery-runtime/src/no-merge.contract.test.ts</files>
  <action>
    1. **RED:** Copy `packages/dogpile-adapter/src/no-fs.contract.test.ts` verbatim to `packages/delivery-runtime/src/no-fs.contract.test.ts`. Swap the package name in the `describe` title and `SELF_BASENAME`. Run `pnpm --filter @protostar/delivery-runtime test` — should pass (empty src/ has no fs imports yet).
    2. **GREEN test 2:** Create `packages/delivery-runtime/src/no-merge.contract.test.ts` from the same template. Replace `FORBIDDEN_PATTERNS` with the merge pattern list above. Set `SELF_BASENAME = "no-merge.contract.test.ts"`. ALSO exclude the no-fs contract test basename from the walker (or use a `KNOWN_CONTRACT_TESTS` set with both basenames) — both contract tests reference the forbidden strings as data, so they self-trigger if not excluded.
    3. **REFACTOR:** If both tests share the walker (`walkTypeScriptFiles`, `stripComments`), extract into a shared file `packages/delivery-runtime/src/internal/contract-test-walker.ts` (keeping the file inside `src/` is fine; both contract tests exclude it). Verify both tests still green.
    4. The comment-stripping helper MUST handle:
       - Line comments: `// …` to end-of-line
       - Block comments: `/* … */` (single and multi-line)
       - JSDoc: `/** … */` (subset of block)
       Skip inside strings (a regex literal containing `// /` should not be stripped). For correctness, use a token-aware stripper or — pragmatically — a regex that handles 99% of cases (the existing dogpile-adapter test uses a simple regex; reuse it).
    5. Both tests must pass with the empty src/index.ts.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run no-fs.contract && pnpm --filter @protostar/delivery-runtime test --run no-merge.contract</automated>
  </verify>
  <acceptance_criteria>
    - `node --test packages/delivery-runtime/dist/**/no-fs.contract.test.js` exits 0
    - `node --test packages/delivery-runtime/dist/**/no-merge.contract.test.js` exits 0
    - Both contract test files include `SELF_BASENAME` and exclude themselves AND each other from the walker (so neither self-triggers).
    - `grep -c 'FORBIDDEN_PATTERNS' packages/delivery-runtime/src/no-fs.contract.test.ts` ≥ 1
    - `grep -c 'FORBIDDEN_PATTERNS' packages/delivery-runtime/src/no-merge.contract.test.ts` ≥ 1
    - Stripping logic handles line + block comments (verifiable by sticking a comment containing `pulls.merge` into a stub file under src/ and asserting test does NOT fail; remove the stub before commit).
  </acceptance_criteria>
  <done>Both contract tests green on empty src/; mutual self-exclusion correct.</done>
</task>

<task type="auto">
  <name>Task 3: Wave-0 nock + Octokit-22 fetch-interception smoke test (Pitfall 6 gate)</name>
  <read_first>
    - .planning/phases/07-delivery/07-RESEARCH.md §"Pitfall 6: nock + Octokit-22 fetch interception may break"
    - .planning/phases/07-delivery/07-VALIDATION.md §"Wave 0 Requirements" — last bullet (nock smoke)
  </read_first>
  <files>packages/delivery-runtime/src/nock-octokit-smoke.test.ts</files>
  <action>
    1. Create `packages/delivery-runtime/src/nock-octokit-smoke.test.ts` containing the smoke test from `<interfaces>` above:
       - Sets up `nock("https://api.github.com").get("/user").reply(200, { login: "test-user" })`
       - Calls `nock.disableNetConnect()`
       - Constructs `new Octokit({ auth: "ghp_TEST_FAKE_NOT_REAL_36CHARS_xxxxxxxxxxxx" })` (fake-but-format-valid token)
       - Calls `octokit.rest.users.getAuthenticated()`
       - Asserts `result.data.login === "test-user"`
       - Calls `scope.done()` to confirm interception happened
       - In `finally`: `nock.cleanAll()`, `nock.enableNetConnect()`
    2. **If this test FAILS (real HTTP attempted, ENOTFOUND, hang, or `scope.done()` throws):** the executor MUST stop and surface a refusal in the SUMMARY: "Pitfall 6 active — nock 14 cannot intercept Octokit 22 fetch on Node 22.22.1. Swap to msw before any further plan in Phase 7 lands. Suggested action: replace nock dev-dep with `msw@^2`, rewrite this smoke as an msw handler, and re-run."
    3. **If this test PASSES:** record the version pair (`@octokit/rest@22.0.1` + `nock@14.0.13` + Node 22.22.1) in the plan SUMMARY as a Wave-0 gate result. All downstream plans use nock without further verification.
    4. Disable network connect at the test level (`nock.disableNetConnect()`) — defense in depth so even a misconfigured fixture cannot leak to real GitHub.
    5. The fake token MUST match the classic PAT regex (`^gh[pousr]_[A-Za-z0-9]{36}$`) so future fast-preflight code paths don't reject it before the call lands at the nock interceptor. Use exactly 36 chars after `ghp_`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run nock-octokit-smoke</automated>
  </verify>
  <acceptance_criteria>
    - Test passes (Octokit call returns mocked `{ login: "test-user" }`).
    - `scope.done()` succeeds (proves the GET /user request hit the interceptor, not real GitHub).
    - `nock.cleanAll()` runs in `finally` so test isolation is preserved.
    - SUMMARY records: "Pitfall 6 gate: PASS (nock 14.x intercepts @octokit/rest 22.x on Node 22.22.1)" OR routes to msw fallback.
  </acceptance_criteria>
  <done>Nock interception confirmed against the locked Octokit 22 dep; downstream plans can use nock without surprise.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test → real network | Default `nock.enableNetConnect()` allows real HTTP; explicit `disableNetConnect()` in this plan blocks any escape. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-02-01 | Information Disclosure | nock-octokit-smoke.test.ts | mitigate | `nock.disableNetConnect()` blocks real HTTP; fake token format-valid but never accepted by GitHub. |
| T-07-02-02 | Tampering | delivery-runtime/src | mitigate | no-fs + no-merge static contract tests block authority-boundary violations at every commit. |
| T-07-02-03 | Repudiation | nock smoke | accept | If smoke fails, executor surfaces explicit msw fallback path; deferred to operator decision. |
</threat_model>

<verification>
- `pnpm --filter @protostar/delivery-runtime build && pnpm --filter @protostar/delivery-runtime test`
- `pnpm install` (workspace registration)
- Root `pnpm run verify` includes the new package
</verification>

<success_criteria>
- Package skeleton compiles + tests run
- Both static contract tests green on empty src/
- Nock smoke test passes (or fails with explicit msw-fallback SUMMARY routing)
- Root `verify` script lists `@protostar/delivery-runtime`
</success_criteria>

<output>
After completion, create `.planning/phases/07-delivery/07-02-SUMMARY.md` documenting:
- Pitfall 6 gate outcome (PASS with version triple OR FAIL with msw migration plan)
- Workspace registration confirmation
- Versions pinned (@octokit/rest, nock, isomorphic-git)
</output>
