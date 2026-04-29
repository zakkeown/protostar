---
phase: 12-authority-boundary-stabilization
plan: 04
type: execute
wave: 1
depends_on: [12-01, 12-03]
files_modified:
  - packages/repo/src/subprocess-runner.ts
  - packages/repo/src/subprocess-runner.test.ts
  - packages/delivery/src/redact.ts
  - packages/delivery/src/redact.test.ts
  - packages/delivery/src/index.ts
  - packages/delivery/package.json
  - packages/delivery-runtime/src/map-octokit-error.ts
  - packages/delivery-runtime/package.json
  - packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts
autonomous: true
requirements: [AUTH-06, AUTH-07, AUTH-08]
must_haves:
  truths:
    - "`subprocess-runner` defaults child env to POSIX baseline (PATH, HOME, LANG, USER)"
    - "`inheritEnv` is a REQUIRED parameter on RunCommandOptions (not optional) — every caller declares intent explicitly"
    - "`SubprocessResult.inheritedEnvKeys` records exactly which keys crossed the boundary, sorted"
    - "`packages/delivery/src/redact.ts` exports a single shared `TOKEN_PATTERNS` array + `redactTokens` helper"
    - "Static contract test refuses any literal `inheritEnv: [...]` containing `PROTOSTAR_GITHUB_TOKEN` anywhere in source"
    - "`delivery-runtime/src/map-octokit-error.ts` imports `redactTokens` from `@protostar/delivery/redact` (no inline regex)"
  artifacts:
    - path: "packages/delivery/src/redact.ts"
      provides: "Shared TOKEN_PATTERNS + redactTokens for delivery, repo, and attack tests"
      exports: ["TOKEN_PATTERNS", "redactTokens"]
    - path: "packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts"
      provides: "Pins env-baseline + inheritEnv-cannot-include-token invariants"
      contains: "PROTOSTAR_GITHUB_TOKEN"
  key_links:
    - from: "packages/repo/src/subprocess-runner.ts"
      to: "packages/delivery/src/redact.ts"
      via: "redactTokens import (read-side redaction in tail/evidence)"
      pattern: "from \"@protostar/delivery/redact\""
    - from: "packages/delivery-runtime/src/map-octokit-error.ts"
      to: "packages/delivery/src/redact.ts"
      via: "redactTokens import (lifted from inline regex)"
      pattern: "from \"@protostar/delivery/redact\""
---

<objective>
Flip `subprocess-runner` env default to a POSIX baseline + per-call required `inheritEnv` allowlist (D-06). Lift `TOKEN_PATTERN` from `delivery-runtime/src/map-octokit-error.ts:6` into a shared `@protostar/delivery/redact.ts` (D-08, pure tier — `repo→delivery` is fs→pure, allowed). Pin the structural invariant that `PROTOSTAR_GITHUB_TOKEN` cannot appear in any `inheritEnv` literal (D-07) via a contract test.

Purpose: Mitigates T-12-02 (secret env leakage). Token never crosses subprocess boundary; redaction lives at one shared site so the secret-leak attack test (12-08) and the runtime filter share one regex.
Output: subprocess-runner default flip + redact module + contract test.
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

<interfaces>
Existing `RunCommandOptions` shape (from packages/repo/src/subprocess-runner.ts:22-35):
```typescript
export interface RunCommandOptions {
  // ... existing fields ...
  /** Optional env override for child. Defaults to process.env. */
  readonly env?: NodeJS.ProcessEnv;
}
// :88 — env: options.env ?? process.env,
```

Existing `TOKEN_PATTERN` (delivery-runtime/src/map-octokit-error.ts:6):
```typescript
export const TOKEN_PATTERN = /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59,})\b/g;
```

Tier rule reminder: `@protostar/delivery` is pure-tier (`packages/delivery/package.json` no `repo` dep). `repo` (fs) → `delivery` (pure) is fs → pure, allowed by `tier-conformance.contract.test.ts:91-115` dep-direction rules.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create shared @protostar/delivery/redact.ts module</name>
  <files>packages/delivery/src/redact.ts, packages/delivery/src/redact.test.ts, packages/delivery/src/index.ts, packages/delivery/package.json</files>
  <read_first>
    - packages/delivery/src/index.ts (existing barrel)
    - packages/delivery/package.json (existing exports map at lines 8-16)
    - packages/delivery-runtime/src/map-octokit-error.ts (lines 1-100 — TOKEN_PATTERN at :6, redact() at :88-90)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Token redaction patterns" (lines 705-744)
  </read_first>
  <behavior>
    - `redactTokens("ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")` returns `"***"`.
    - `redactTokens("Bearer abc123def456ghi789jkl0")` returns `"***"` (case-insensitive bearer).
    - `redactTokens("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c")` returns `"***"` (JWT).
    - `redactTokens("ghp_short")` returns `"ghp_short"` unchanged (length below threshold).
    - `redactTokens("normal sentence with no token")` returns the string unchanged.
    - `TOKEN_PATTERNS` is a frozen readonly array of RegExp.
  </behavior>
  <action>
    Create `packages/delivery/src/redact.ts` with EXACT content:
    ```typescript
    /**
     * Shared token-shape detection + redaction for evidence/log persistence.
     * Lifted from delivery-runtime/src/map-octokit-error.ts:6 (Phase 12 D-08).
     * Consumers: @protostar/delivery-runtime, @protostar/repo (subprocess-runner),
     * and the AUTH-15 secret-leak attack test must all import from this single module.
     */
    export const TOKEN_PATTERNS: readonly RegExp[] = Object.freeze([
      // GitHub PATs — classic and fine-grained
      /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59,})\b/g,
      // Bearer headers — case-insensitive, base64-ish payload
      /\bBearer\s+[A-Za-z0-9._\-+/=]{16,}\b/gi,
      // JWT — three base64url segments separated by dots
      /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/g
    ]);

    export function redactTokens(value: string): string {
      let out = value;
      for (const pattern of TOKEN_PATTERNS) {
        out = out.replace(pattern, "***");
      }
      return out;
    }
    ```

    Create `packages/delivery/src/redact.test.ts` covering the behaviors listed above. Use `node:test` `describe`/`it` pattern matching every existing test in `packages/delivery/src/`.

    Update `packages/delivery/src/index.ts` to add `export { TOKEN_PATTERNS, redactTokens } from "./redact.js";`.

    Update `packages/delivery/package.json` `exports` map (lines 8-16) to add a subpath:
    ```jsonc
    "./redact": {
      "types": "./dist/redact.d.ts",
      "import": "./dist/redact.js"
    }
    ```

    Build: `pnpm --filter @protostar/delivery build && pnpm --filter @protostar/delivery test`.
  </action>
  <verify>
    <automated>test -f packages/delivery/src/redact.ts &amp;&amp; grep -q 'TOKEN_PATTERNS' packages/delivery/src/index.ts &amp;&amp; grep -q '"./redact"' packages/delivery/package.json &amp;&amp; pnpm --filter @protostar/delivery test</automated>
  </verify>
  <acceptance_criteria>
    - `packages/delivery/src/redact.ts` exists and exports `TOKEN_PATTERNS` (readonly array) and `redactTokens` (function).
    - Test file validates all 5 behavior cases above (PAT, bearer, JWT, short-string-noop, no-match-noop).
    - `package.json` declares `./redact` subpath export.
    - `pnpm --filter @protostar/delivery test` passes.
  </acceptance_criteria>
  <done>Shared redact module exists in pure tier; subpath export wired; tests green.</done>
</task>

<task type="auto">
  <name>Task 2: Migrate delivery-runtime to import shared redactTokens</name>
  <files>packages/delivery-runtime/src/map-octokit-error.ts, packages/delivery-runtime/package.json</files>
  <read_first>
    - packages/delivery-runtime/src/map-octokit-error.ts (entire file — lines 6 TOKEN_PATTERN export, lines 88-90 redact() helper)
    - packages/delivery-runtime/package.json (current dependencies; @protostar/delivery should already be there)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Token redaction patterns" (line 742-744 lift target)
  </read_first>
  <action>
    In `packages/delivery-runtime/src/map-octokit-error.ts`:
    1. DELETE line 6's local `export const TOKEN_PATTERN = /.../g;`.
    2. DELETE the local `redact()` function at lines 88-90.
    3. ADD at the top: `import { redactTokens, TOKEN_PATTERNS } from "@protostar/delivery/redact";`.
    4. Replace every internal call to the deleted `redact(value)` with `redactTokens(value)`.
    5. If any test or sibling file imports `TOKEN_PATTERN` from `map-octokit-error.ts`, update those imports to import `TOKEN_PATTERNS` from `@protostar/delivery/redact` (note plural) — but USE THE FIRST ELEMENT (`TOKEN_PATTERNS[0]`) only if backward-compat behavior matters; otherwise use the iteration helper `redactTokens`.

    In `packages/delivery-runtime/package.json`: confirm `@protostar/delivery` is in `dependencies`. If not present, add `"@protostar/delivery": "workspace:*"`.

    Build: `pnpm --filter @protostar/delivery-runtime build && pnpm --filter @protostar/delivery-runtime test`.
  </action>
  <verify>
    <automated>! grep -q 'TOKEN_PATTERN = /' packages/delivery-runtime/src/map-octokit-error.ts &amp;&amp; grep -q '@protostar/delivery/redact' packages/delivery-runtime/src/map-octokit-error.ts &amp;&amp; pnpm --filter @protostar/delivery-runtime test</automated>
  </verify>
  <acceptance_criteria>
    - `packages/delivery-runtime/src/map-octokit-error.ts` does NOT contain a literal `TOKEN_PATTERN = /` regex declaration.
    - It DOES contain `from "@protostar/delivery/redact"`.
    - `pnpm --filter @protostar/delivery-runtime test` passes.
  </acceptance_criteria>
  <done>delivery-runtime uses the shared redact module; no inline regex remains.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Flip subprocess-runner env default to POSIX baseline + required inheritEnv</name>
  <files>packages/repo/src/subprocess-runner.ts, packages/repo/src/subprocess-runner.test.ts, packages/repo/package.json</files>
  <read_first>
    - packages/repo/src/subprocess-runner.ts (entire file — RunCommandOptions interface around line 22-35; spawn options around line 88; tail/result construction around lines 79-99, 130-131)
    - packages/repo/src/subprocess-runner.test.ts (existing test patterns)
    - packages/repo/package.json (dependencies — confirm @protostar/delivery is allowed; if not present, add `"@protostar/delivery": "workspace:*"` since `repo→delivery` is fs→pure, accepted)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Pattern 2: Repo Runner Env Default" (lines 235-280) and Pitfall 2 (lines 994-998)
  </read_first>
  <behavior>
    - `runCommand({command:"node", args:["-e","console.log(JSON.stringify(process.env))"], cwd: tmp, resolvedEnvelope: ENV}, {stdoutPath, stderrPath, effectiveAllowlist:["node"], schemas:{node:NODE_SCHEMA}, inheritEnv: []})` produces a child whose `process.env` keys are a subset of `["PATH","HOME","LANG","USER"]` (i.e., baseline only — only those baseline keys actually present in the parent env are set).
    - With `inheritEnv: ["NODE_OPTIONS"]`, the child also has `NODE_OPTIONS` if the parent does.
    - `SubprocessResult.inheritedEnvKeys` is a sorted array of the keys actually crossed (baseline ∪ inheritEnv ∩ defined-in-parent).
    - The TypeScript type system REFUSES a call to `runCommand` with no `inheritEnv` — calls compiled before this change will fail with `Property 'inheritEnv' is missing`.
  </behavior>
  <action>
    In `packages/repo/src/subprocess-runner.ts`:

    1. ADD near the top of the file (after imports):
       ```typescript
       import { redactTokens } from "@protostar/delivery/redact";

       const POSIX_BASELINE_ENV_KEYS = Object.freeze(["PATH", "HOME", "LANG", "USER"] as const);

       function buildChildEnv(inheritEnv: readonly string[]): { env: NodeJS.ProcessEnv; inheritedEnvKeys: readonly string[] } {
         const env: NodeJS.ProcessEnv = {};
         const allKeys = [...POSIX_BASELINE_ENV_KEYS, ...inheritEnv];
         const used: string[] = [];
         for (const key of allKeys) {
           const value = process.env[key];
           if (value !== undefined) {
             env[key] = value;
             used.push(key);
           }
         }
         return { env, inheritedEnvKeys: Object.freeze([...new Set(used)].sort()) };
       }
       ```

    2. In `RunCommandOptions` (lines 22-35):
       - DELETE the `readonly env?: NodeJS.ProcessEnv;` field.
       - ADD a REQUIRED field:
         ```typescript
         /**
          * Per-call allowlist of process.env keys to inherit IN ADDITION TO the
          * POSIX baseline (PATH, HOME, LANG, USER). REQUIRED — every caller declares
          * intent explicitly. Pass [] for baseline-only.
          *
          * MUST NOT contain "PROTOSTAR_GITHUB_TOKEN" — pinned by
          * env-empty-default.contract.test.ts (D-07).
          */
         readonly inheritEnv: readonly string[];
         ```
       (Required, NOT optional — see Pitfall 2.)

    3. In the spawn options block (around line 88), REPLACE `env: options.env ?? process.env,` with:
       ```typescript
       env: childEnv.env,
       ```
       and just before the spawn call, compute:
       ```typescript
       const childEnv = buildChildEnv(options.inheritEnv);
       ```

    4. In `SubprocessResult` interface, ADD:
       ```typescript
       readonly inheritedEnvKeys: readonly string[];
       ```
       and include `inheritedEnvKeys: childEnv.inheritedEnvKeys` when constructing the result.

    5. Apply `redactTokens` at every read-side string construction:
       - When constructing the rolling tail strings (around lines 130-131): wrap `tail()` outputs with `redactTokens(...)`.
       - Document at the writer (in a code comment) that on-disk raw logs MAY contain raw tokens; redaction is at the read boundary per RESEARCH §"Where redaction lives" Pitfall 3.

    6. Update existing internal callers in `packages/repo/src/` to pass `inheritEnv: []` (baseline-only). `grep -rn 'runCommand(' packages/repo/src/` to find them; the test file at `subprocess-runner.test.ts:12` is the main one. Each existing call in src/ that didn't previously set `env:` was relying on `process.env` default — those should pass `inheritEnv: []` (baseline) unless their context proves they need a specific key.

    7. In `packages/repo/package.json` add `"@protostar/delivery": "workspace:*"` to `dependencies` if not already present.

    Update `packages/repo/src/subprocess-runner.test.ts`:
    - Add tests for the three behaviors above.
    - Update existing tests to pass `inheritEnv: []`.

    Build + test: `pnpm --filter @protostar/repo test`.
  </action>
  <verify>
    <automated>grep -q 'POSIX_BASELINE_ENV_KEYS' packages/repo/src/subprocess-runner.ts &amp;&amp; grep -q 'readonly inheritEnv: readonly string\[\]' packages/repo/src/subprocess-runner.ts &amp;&amp; grep -q 'inheritedEnvKeys' packages/repo/src/subprocess-runner.ts &amp;&amp; grep -q '@protostar/delivery/redact' packages/repo/src/subprocess-runner.ts &amp;&amp; ! grep -q 'options.env ?? process.env' packages/repo/src/subprocess-runner.ts &amp;&amp; pnpm --filter @protostar/repo test</automated>
  </verify>
  <acceptance_criteria>
    - `subprocess-runner.ts` declares `POSIX_BASELINE_ENV_KEYS` exactly: `["PATH", "HOME", "LANG", "USER"]`.
    - `RunCommandOptions.inheritEnv` is REQUIRED (no `?`).
    - `SubprocessResult.inheritedEnvKeys` field present.
    - Imports `redactTokens` from `@protostar/delivery/redact`.
    - No string `options.env ?? process.env` remains.
    - `pnpm --filter @protostar/repo test` passes (including new env-baseline + inheritedEnvKeys tests).
  </acceptance_criteria>
  <done>subprocess-runner defaults to baseline env; inheritEnv is required; redactTokens wired at tail-construction; backward-compat callers updated.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: env-empty-default contract test (D-07 structural pin)</name>
  <files>packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts</files>
  <read_first>
    - packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts (existing static-scan test pattern — mirror its shape)
    - packages/admission-e2e/src/tier-conformance.contract.test.ts (loadPackages pattern — pkg-walk infrastructure to reuse)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Contract test pinning (D-07 structural assertion)" (lines 686-703)
    - packages/repo/src/subprocess-runner.ts (post-Task 3 — the runtime side of the test)
  </read_first>
  <behavior>
    - **Test 1 (static):** Walk `apps/factory-cli/src/` and `packages/repo/src/`. For every file, read text. Any match of regex `/inheritEnv\s*:\s*\[[^\]]*PROTOSTAR_GITHUB_TOKEN/` is a violation. Assert offenders array is empty.
    - **Test 2 (runtime):** Spawn a child process using `runCommand` with `inheritEnv: []`. The child runs `node -e "console.log(JSON.stringify(process.env))"`. Parse stdout. Assert keys are a subset of `["PATH","HOME","LANG","USER"]`.
    - **Test 3 (runtime):** Same spawn with `inheritEnv: ["NODE_OPTIONS"]`. Assert child env keys are subset of `["PATH","HOME","LANG","USER","NODE_OPTIONS"]`.
    - **Test 4 (sanity):** Confirm `RunCommandOptions.inheritEnv` is required by attempting to TypeScript-compile a fixture file that omits it (use a `.tsx`-style assertion or a runtime check via `Object.keys` on the type isn't possible — instead, assert via grep that the source declares no `?` after `inheritEnv` in subprocess-runner.ts).
  </behavior>
  <action>
    Create `packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts`. Use `node:test` `describe`/`it` and import `runCommand` from `@protostar/repo`. Use `readdir`/`readFile` from `node:fs/promises` for the static walk (admission-e2e is `test-only` tier so fs access is allowed).

    Skeleton:
    ```typescript
    import { strict as assert } from "node:assert";
    import { readdir, readFile } from "node:fs/promises";
    import { mkdtemp } from "node:fs/promises";
    import { tmpdir } from "node:os";
    import { resolve, join } from "node:path";
    import { describe, it } from "node:test";
    import { runCommand } from "@protostar/repo";

    const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

    async function walk(dir: string, files: string[] = []): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "dist" || entry.name === "node_modules") continue;
          await walk(full, files);
        } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
          files.push(full);
        }
      }
      return files;
    }

    describe("subprocess-runner env-empty-default (AUTH-06, AUTH-07)", () => {
      it("static scan: no inheritEnv literal contains PROTOSTAR_GITHUB_TOKEN", async () => {
        const scanRoots = [
          resolve(REPO_ROOT, "apps/factory-cli/src"),
          resolve(REPO_ROOT, "packages/repo/src")
        ];
        const offenders: string[] = [];
        const pattern = /inheritEnv\s*:\s*\[[^\]]*PROTOSTAR_GITHUB_TOKEN/;
        for (const root of scanRoots) {
          for (const file of await walk(root)) {
            const content = await readFile(file, "utf8");
            // skip comments-only matches by stripping line comments
            const stripped = content.replace(/^\s*\/\/.*$/gm, "");
            if (pattern.test(stripped)) offenders.push(file);
          }
        }
        assert.deepEqual(offenders, [], `inheritEnv with PROTOSTAR_GITHUB_TOKEN found: ${offenders.join(", ")}`);
      });

      it("runtime: empty inheritEnv yields baseline-only child env", async () => {
        // Build a minimal AuthorizedSubprocessOp + RunCommandOptions and assert child env keys.
        // (Skeleton — fill with concrete Phase 3 schema imports for `node`.)
      });

      it("runtime: explicit inheritEnv extends baseline", async () => {
        // ...
      });

      it("inheritEnv is REQUIRED (not optional) in RunCommandOptions", async () => {
        const src = await readFile(resolve(REPO_ROOT, "packages/repo/src/subprocess-runner.ts"), "utf8");
        assert.match(src, /readonly inheritEnv:\s*readonly string\[\]\s*;/, "inheritEnv must be required, not optional");
      });
    });
    ```

    Note: filling out test 2 + 3 requires the existing `node` schema from Phase 3 plan 03-08. Import it from `@protostar/repo`'s subprocess-schemas barrel. If the existing `subprocess-runner.test.ts` already builds a working fixture, mirror its pattern.

    Build + test: `pnpm --filter @protostar/admission-e2e test`.
  </action>
  <verify>
    <automated>test -f packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts &amp;&amp; grep -q 'PROTOSTAR_GITHUB_TOKEN' packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts &amp;&amp; grep -q 'POSIX_BASELINE\|baseline' packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts &amp;&amp; pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts` exists.
    - Contains all four test cases (static scan, two runtime spawns, required-inheritEnv source check).
    - The static-scan test currently passes (no offender).
    - `pnpm --filter @protostar/admission-e2e test` exits 0.
    - Full `pnpm run verify` exits 0.
  </acceptance_criteria>
  <done>Contract test pins T-12-02 invariants: token cannot enter inheritEnv literally; baseline-only is the runtime default; inheritEnv is required.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| factory process.env → subprocess child env | Token must NEVER cross; baseline-only by default; inheritEnv literal cannot include token |
| subprocess stdout/stderr → persisted log files → evidence JSON | Tokens written to disk are tolerated; redaction at read boundary catches before evidence ships |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-12-02 | Information Disclosure | `subprocess-runner.ts` env default + `inheritEnv` allowlist + `delivery/redact` | mitigate | Required `inheritEnv` (no implicit fallthrough); POSIX baseline only; static contract test refuses token in inheritEnv; shared `redactTokens` filters tail/evidence reads |
</threat_model>

<verification>
- `pnpm --filter @protostar/admission-e2e test` includes the new env-empty-default contract test passing.
- `pnpm --filter @protostar/repo test` passes with required `inheritEnv` in the type.
- Full `pnpm run verify` green.
</verification>

<success_criteria>
- AUTH-06 satisfied: subprocess env default is POSIX baseline + per-call inheritEnv (required, sorted, logged).
- AUTH-07 satisfied: contract test refuses any `inheritEnv: [...PROTOSTAR_GITHUB_TOKEN...]` literal.
- AUTH-08 satisfied: shared `redactTokens` lifted into `@protostar/delivery/redact`; delivery-runtime + repo + future attack test all import from one site.
</success_criteria>

<output>
After completion, create `.planning/phases/12-authority-boundary-stabilization/12-04-SUMMARY.md`
</output>
