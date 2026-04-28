---
phase: 07-delivery
plan: 12
type: execute
wave: 6
depends_on: ["07-01", "07-08", "07-09", "07-11"]
files_modified:
  - packages/admission-e2e/src/delivery-result-schema.contract.test.ts
  - packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts
  - packages/admission-e2e/src/delivery-preflight-refusal-shapes.contract.test.ts
  - packages/admission-e2e/package.json
autonomous: true
requirements: [DELIVER-05, DELIVER-07]
must_haves:
  truths:
    - "delivery-result.json schema contract: a fixture round-trips through JSON.parse and matches the Q-17 type"
    - "Repo-wide no-merge contract: greps the entire repo (excluding test allowlist) for merge surfaces and asserts zero matches — strongest invariant in the phase"
    - "Preflight refusal artifacts have the documented shape for each of 4+ refusal kinds (token-missing, token-invalid, repo-inaccessible, base-branch-missing)"
    - "All Phase 7 contracts (no-fs, no-merge per-package, brand-rejects, drift, idempotency, secret-leak) confirmed green at the admission-e2e boundary"
  artifacts:
    - path: packages/admission-e2e/src/delivery-result-schema.contract.test.ts
      provides: "Q-17 JSON shape pinned at admission-e2e boundary"
    - path: packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts
      provides: "Repo-wide grep — strongest DELIVER-07 invariant"
    - path: packages/admission-e2e/src/delivery-preflight-refusal-shapes.contract.test.ts
      provides: "Refusal artifact shape pinning"
  key_links:
    - from: packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts
      to: packages/delivery/src/
      via: "Walks repo source; asserts zero merge surfaces"
      pattern: "pulls.merge|enableAutoMerge"
---

<objective>
Land the Phase 7 cross-package contract tests at the `@protostar/admission-e2e` boundary. These tests pin invariants that span multiple packages and would not naturally belong inside any single package's test suite:

1. **delivery-result-schema contract** — a synthetic delivery-result.json fixture round-trips through Q-17's type definition; an old (1.4.0-era) fixture without the new fields is rejected
2. **Repo-wide no-merge contract** — walks the ENTIRE repo (not just `delivery-runtime/src`); asserts zero `pulls.merge` / `enableAutoMerge` / `merge_method` / `git merge --` outside an explicit test-file allowlist. This is the strongest DELIVER-07 invariant — broader than the package-local contract from Plan 07-02.
3. **Preflight refusal shapes** — for each refusal kind (token-missing, token-invalid, repo-inaccessible, base-branch-missing, excessive-pat-scope), a fixture refusal-artifact JSON validates against the documented shape

Per orchestrator instruction #7: this is the final wave — every contract from VALIDATION.md (the 8 required tests) is now covered either at package-local level (07-02, 07-04, 07-05, 07-08) or at the admission-e2e boundary (this plan).

Purpose: VALIDATION.md contracts #2 (no-merge — repo-wide reinforcement), #6 (delivery-result schema), #8 (refusal taxonomy).
Output: Three contract tests at admission-e2e; signed-intent-1-5-0 already covered by 07-01.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/07-delivery/07-CONTEXT.md
@.planning/phases/07-delivery/07-VALIDATION.md
@packages/delivery-runtime/src/delivery-result-schema.ts
@packages/admission-e2e/package.json
@packages/admission-e2e/src/signed-intent-1-5-0.test.ts

<interfaces>
<!-- Test patterns reuse Phase 6 admission-e2e idioms. -->

```typescript
// Repo-wide no-merge walker — broader than the package-local contract (Plan 07-02).
// Walks all packages/* + apps/* source files (excluding *.test.ts and the allowlist below).

const ALLOWLIST = new Set([
  "packages/delivery-runtime/src/no-merge.contract.test.ts",
  "packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts",
  // Test files describing the forbidden patterns are exempt from the grep; production source is not.
]);

const FORBIDDEN_PATTERNS = [
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
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Repo-wide no-merge contract (strongest DELIVER-07 invariant)</name>
  <read_first>
    - packages/delivery-runtime/src/no-merge.contract.test.ts (Plan 07-02 — package-local version; this plan extends to repo-wide)
    - .planning/phases/07-delivery/07-VALIDATION.md Required Contract Test #2 (no-merge — repo-wide grep)
  </read_first>
  <behavior>
    - Walks every `.ts` file under `packages/*/src/` and `apps/*/src/`, excluding:
      - Files ending in `.test.ts` or `.contract.test.ts` (test code may reference the forbidden strings)
      - Files in node_modules, dist, .protostar/
      - Explicit allowlist for the no-merge contract test files themselves (which describe the forbidden patterns as data)
    - Strips line + block comments before regex match (so a comment like `// don't add pulls.merge here` does not trigger)
    - For each forbidden pattern, asserts zero matches in the stripped source
    - Logs offenders if found (path + line number) for debug
    - This test is run in `@protostar/admission-e2e` package, which depends on (no other Phase 7 packages) — but reads files at runtime; admission-e2e MAY use node:fs (it's the e2e tier).
    - Tests:
      - Repo-wide green: assert zero offenders (the assertion's the test)
      - Synthetic test: write a temp file containing `pulls.merge(...)` to a tmp dir under `packages/`; run the walker; assert offender detected; clean up the temp file
      - Allowlist test: confirm the no-merge.contract.test.ts files are NOT scanned (they appear in the ALLOWLIST set)
  </behavior>
  <files>packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts</files>
  <action>
    1. **RED:** Write the test with the negative-fixture sub-test (synthetic file in tmp dir + assert detection). Run; the negative test currently can't fail because the implementation doesn't exist.
    2. **GREEN:** Implement the walker:
       ```typescript
       import { describe, it } from "node:test";
       import assert from "node:assert/strict";
       import { readFile, readdir } from "node:fs/promises";
       import { dirname, resolve, basename, relative } from "node:path";
       import { fileURLToPath } from "node:url";

       const __dirname = dirname(fileURLToPath(import.meta.url));
       const REPO_ROOT = resolve(__dirname, "..", "..", "..");

       const SCAN_ROOTS = ["packages", "apps"];
       const SKIP_DIRS = new Set(["node_modules", "dist", ".protostar", ".git"]);
       const ALLOWLIST_RELATIVE = new Set([
         "packages/delivery-runtime/src/no-merge.contract.test.ts",
         "packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts"
       ]);

       const FORBIDDEN_PATTERNS = [
         /pulls\.merge\b/,
         /pullRequests\.merge\b/,
         /enableAutoMerge\b/,
         /merge_method\b/,
         /\bautomerge\b/i,
         /pulls\.updateBranch\b/,
         /["']gh\s+pr\s+merge["']/,
         /git\s+merge\s+--/
       ];

       async function* walkTs(dir: string): AsyncGenerator<string> {
         const entries = await readdir(dir, { withFileTypes: true });
         for (const e of entries) {
           const full = resolve(dir, e.name);
           if (e.isDirectory()) {
             if (!SKIP_DIRS.has(e.name)) yield* walkTs(full);
           } else if (e.name.endsWith(".ts")) {
             yield full;
           }
         }
       }

       function stripComments(src: string): string {
         return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
       }

       describe("DELIVER-07: repo-wide no-merge contract", () => {
         it("zero merge surfaces in any production source", async () => {
           const offenders: { file: string; pattern: string }[] = [];
           for (const root of SCAN_ROOTS) {
             const dir = resolve(REPO_ROOT, root);
             for await (const file of walkTs(dir)) {
               const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
               // Exclude all test files and explicit allowlist
               if (rel.endsWith(".test.ts") || rel.endsWith(".contract.test.ts")) continue;
               if (ALLOWLIST_RELATIVE.has(rel)) continue;
               const raw = await readFile(file, "utf8");
               const code = stripComments(raw);
               for (const pat of FORBIDDEN_PATTERNS) {
                 if (pat.test(code)) {
                   offenders.push({ file: rel, pattern: pat.source });
                   break;
                 }
               }
             }
           }
           assert.deepEqual(offenders, [], `Merge surface(s) found in production source: ${JSON.stringify(offenders, null, 2)}`);
         });
       });
       ```
    3. The test file itself contains the forbidden patterns as DATA (in the FORBIDDEN_PATTERNS array). The test file is a `.contract.test.ts` and is ALSO in ALLOWLIST_RELATIVE — double exclusion (defense in depth).
    4. **REFACTOR:** Document the allowlist policy in a comment at the top of the file.
    5. The negative-fixture test: optionally add an inner `it` that writes a temp file under `packages/admission-e2e/` (a tmp dir) containing `pulls.merge`, runs the walker against that subset, asserts offender detected. Skip if temp-file management adds too much complexity — the primary test is the green assertion across the actual repo.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test --run delivery-no-merge-repo-wide</automated>
  </verify>
  <acceptance_criteria>
    - Test green (zero offenders in current repo)
    - `grep -c "ALLOWLIST_RELATIVE" packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts` ≥ 1
    - `grep -c "stripComments" packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts` ≥ 1
    - Test scans both `packages/` and `apps/` directories
    - Test excludes `*.test.ts`, `*.contract.test.ts`, and the explicit allowlist
  </acceptance_criteria>
  <done>Repo-wide no-merge contract green; the strongest DELIVER-07 invariant pinned.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: delivery-result.json schema contract</name>
  <read_first>
    - packages/delivery-runtime/src/delivery-result-schema.ts (Plan 07-09 — DeliveryResult interface + DELIVERY_RESULT_SCHEMA_VERSION)
    - .planning/phases/07-delivery/07-VALIDATION.md Required Contract Test #6
    - .planning/phases/07-delivery/07-CONTEXT.md Q-17 (verbatim shape)
  </read_first>
  <behavior>
    - Two synthetic fixtures (constructed inline; no file fixtures needed):
      - `validDelivered`: full DeliveryResult with status='delivered', schemaVersion='1.0.0', all required fields including ciSnapshots, evidenceComments, screenshots
      - `validBlocked`: DeliveryResult with status='delivery-blocked' + refusal field
    - Test 1: `JSON.parse(JSON.stringify(validDelivered))` round-trips and is structurally equal
    - Test 2: schemaVersion is exactly `'1.0.0'`
    - Test 3: `screenshots.status === 'deferred-v01'` per Q-11
    - Test 4: A simulated old (Phase 7 v0.1 pre-bump) result without `schemaVersion` field is REJECTED — this proves the schema version pin (use a runtime guard like `assertDeliveryResult(value): asserts value is DeliveryResult` or a typed validator)
    - Test 5: ciVerdict can be any of the 6 union values; assert each parses
  </behavior>
  <files>packages/admission-e2e/src/delivery-result-schema.contract.test.ts</files>
  <action>
    1. **RED:** Write 5 tests per `<behavior>`. Run; fail (no validator yet).
    2. **GREEN:** Either implement a runtime validator or rely on TypeScript's compile-time check + structural assertions:
       ```typescript
       import { describe, it } from "node:test";
       import assert from "node:assert/strict";
       import type { DeliveryResult } from "@protostar/delivery-runtime";
       import { DELIVERY_RESULT_SCHEMA_VERSION } from "@protostar/delivery-runtime";

       function assertDeliveryResult(value: unknown): asserts value is DeliveryResult {
         const v = value as DeliveryResult;
         assert.equal(v.schemaVersion, DELIVERY_RESULT_SCHEMA_VERSION);
         assert.ok(["delivered", "delivery-blocked"].includes(v.status));
         assert.equal(typeof v.runId, "string");
         assert.equal(typeof v.branch, "string");
         assert.equal(typeof v.baseBranch, "string");
         assert.equal(typeof v.createdAt, "string");
         assert.ok(["pass", "fail", "pending", "timeout-pending", "no-checks-configured", "cancelled"].includes(v.ciVerdict));
         assert.equal(typeof v.ciVerdictUpdatedAt, "string");
         assert.ok(Array.isArray(v.ciSnapshots));
         assert.ok(Array.isArray(v.evidenceComments));
         assert.ok(Array.isArray(v.commentFailures));
         assert.equal(v.screenshots.status, "deferred-v01");
         // ... and so on for status='delivered' subset
       }

       describe("delivery-result.json schema contract (Q-17)", () => {
         it("validDelivered round-trips and validates", () => {
           const validDelivered: DeliveryResult = { /* construct fixture */ };
           const parsed = JSON.parse(JSON.stringify(validDelivered)) as unknown;
           assertDeliveryResult(parsed);
           assert.deepEqual(parsed, validDelivered);
         });

         it("rejects fixture missing schemaVersion (old format)", () => {
           const old = { runId: "x", status: "delivered" /* no schemaVersion */ } as unknown;
           assert.throws(() => assertDeliveryResult(old));
         });
         // ...
       });
       ```
    3. **REFACTOR:** Re-export `assertDeliveryResult` if useful elsewhere; otherwise keep local.
    4. The fixture construction is verbose; use helper functions to build up the typed object cleanly.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test --run delivery-result-schema</automated>
  </verify>
  <acceptance_criteria>
    - 5 test cases green
    - schemaVersion pin enforced (assertion fails on old/missing version)
    - All 6 ciVerdict values assertable
    - screenshots.status='deferred-v01' enforced (Q-11)
    - Test imports `DeliveryResult` and `DELIVERY_RESULT_SCHEMA_VERSION` from `@protostar/delivery-runtime`
  </acceptance_criteria>
  <done>Q-17 schema pinned at admission-e2e boundary.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Preflight refusal artifact shape contract</name>
  <read_first>
    - packages/delivery-runtime/src/preflight-fast.ts + preflight-full.ts (Plan 07-06 — refusal types)
    - apps/factory-cli/src/delivery-preflight-wiring.ts (Plan 07-10 — refusal JSON layout)
    - .planning/phases/07-delivery/07-VALIDATION.md Required Contract Test #8 (refusal taxonomy)
  </read_first>
  <behavior>
    - For each of 5 refusal kinds (token-missing, token-invalid, repo-inaccessible, base-branch-missing, excessive-pat-scope), construct a synthetic refusal JSON matching the documented shape from Plan 07-10's wiring
    - Validate each via a typed asserter (mirroring Task 2's pattern)
    - Assert that:
      - `phase` is either `'fast'` or `'full'`
      - `result.outcome` matches the refusal kind
      - Token does NOT appear anywhere in the JSON (negative test: build a fixture that includes a fake token in error.message; assert the refusal serialization redacts it)
      - `at` is an ISO timestamp
    - The test does NOT need to run the actual preflight — just validates the shape any consumer can rely on
  </behavior>
  <files>packages/admission-e2e/src/delivery-preflight-refusal-shapes.contract.test.ts</files>
  <action>
    1. **RED:** Write 5+ tests covering each refusal kind. Run; fail.
    2. **GREEN:** Implement an asserter `assertPreflightRefusalArtifact(value)`:
       ```typescript
       function assertPreflightRefusalArtifact(value: unknown): asserts value is { phase: 'fast' | 'full'; result: unknown; runId: string; at: string } {
         const v = value as { phase: string; result: { outcome: string }; runId: string; at: string };
         assert.ok(["fast", "full"].includes(v.phase));
         assert.equal(typeof v.runId, "string");
         assert.equal(typeof v.at, "string");
         assert.ok(["ok", "token-missing", "token-invalid", "repo-inaccessible", "base-branch-missing", "excessive-pat-scope"].includes(v.result.outcome));
       }

       describe("preflight refusal artifact shapes", () => {
         it("token-missing fast preflight refusal", () => {
           const r = { phase: "fast", result: { outcome: "token-missing" }, runId: "run_x", at: new Date().toISOString() };
           assertPreflightRefusalArtifact(r);
         });
         // ... etc for each kind ...
         it("excessive-pat-scope refusal carries scopes + forbidden", () => {
           const r = { phase: "full", result: { outcome: "excessive-pat-scope", scopes: ["repo", "admin:org"], forbidden: ["admin:org"] }, runId: "run_x", at: new Date().toISOString() };
           assertPreflightRefusalArtifact(r);
         });
         it("token never appears in refusal JSON (negative test)", () => {
           const r = { phase: "full", result: { outcome: "token-invalid", reason: "401" }, runId: "run_x", at: new Date().toISOString() };
           const serialized = JSON.stringify(r);
           assert.equal(serialized.includes("ghp_"), false);
           assert.equal(serialized.includes("github_pat_"), false);
         });
       });
       ```
    3. **REFACTOR:** Document the schema in a comment for future Phase 9 consumers (`protostar-factory inspect`).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test --run delivery-preflight-refusal-shapes</automated>
  </verify>
  <acceptance_criteria>
    - 6+ test cases green (5 outcomes + 1 token-redaction negative)
    - Token-redaction test asserts no `ghp_` or `github_pat_` substring in serialized refusal
    - All 5 outcomes covered
  </acceptance_criteria>
  <done>Preflight refusal taxonomy pinned at admission-e2e.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo-wide source → no-merge contract | Walks all production source; allowlist explicit. |
| run artifact → schema contract | Pins JSON shape; rejects unversioned/old artifacts. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-12-01 | Tampering | delivery-no-merge-repo-wide.contract.test.ts | mitigate | Walks all packages+apps; only explicit test allowlist excluded. |
| T-07-12-02 | Tampering | delivery-result-schema.contract.test.ts | mitigate | schemaVersion pin rejects old artifacts. |
| T-07-12-03 | Information Disclosure | delivery-preflight-refusal-shapes.contract.test.ts | mitigate | Token-redaction negative test. |
</threat_model>

<verification>
- `pnpm --filter @protostar/admission-e2e test`
- `pnpm run verify` (full)
</verification>

<success_criteria>
- Repo-wide no-merge contract green (DELIVER-07 strongest pin)
- DeliveryResult schema pinned at admission-e2e
- Preflight refusal taxonomy pinned across 5 kinds
- Token-redaction negative test green
</success_criteria>

<output>
Create `.planning/phases/07-delivery/07-12-SUMMARY.md` summarizing the three contracts + a Phase 7 closure note: every VALIDATION.md required test is now green, the executable surface is complete, and Phase 7 is ready for verification.
</output>
