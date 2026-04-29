---
phase: 12-authority-boundary-stabilization
plan: 05
type: execute
wave: 1
depends_on: [12-01, 12-04]
files_modified:
  - packages/paths/src/canonicalize-relative-path.ts
  - packages/paths/src/canonicalize-relative-path.test.ts
  - packages/paths/src/index.ts
  - packages/paths/package.json
  - packages/repo/src/apply-change-set.ts
  - packages/repo/src/apply-change-set.test.ts
  - packages/repo/src/index.ts
  - packages/repo/package.json
  - packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts
autonomous: true
requirements: [AUTH-09, AUTH-10]
must_haves:
  truths:
    - "`canonicalizeRelativePath` is a single shared helper exported from `@protostar/paths`"
    - "`PatchRequest` is a brand minted only via `mintPatchRequest`; raw object literals do not satisfy the type"
    - "`mintPatchRequest` refuses `path-mismatch`, `diff-filename-mismatch`, and `diff-parse-error`"
    - "`applyChangeSet` re-asserts the same path/op/diff invariant at function entry as defense-in-depth (catches handcrafted brand instances in tests)"
    - "Equality is exact-string `===` after canonicalization (no normalization beyond `posix.normalize` + diff-prefix strip)"
  artifacts:
    - path: "packages/paths/src/canonicalize-relative-path.ts"
      provides: "Single canonicalize-relative-path helper"
      exports: ["canonicalizeRelativePath"]
    - path: "packages/repo/src/apply-change-set.ts"
      provides: "Branded PatchRequest with mintPatchRequest constructor + applyChangeSet defense-in-depth"
      contains: "mintPatchRequest"
    - path: "packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts"
      provides: "Three refusal cases + canonicalization round-trip"
      contains: "path-mismatch"
  key_links:
    - from: "packages/repo/src/apply-change-set.ts"
      to: "packages/paths/src/canonicalize-relative-path.ts"
      via: "shared canonicalize helper"
      pattern: "from \"@protostar/paths\""
---

<objective>
Brand `PatchRequest` so its constructor refuses if `path`, `op.path`, and parsed-diff filename disagree (D-09). Equality is exact-string after canonicalization through one shared helper in `@protostar/paths` (D-10). Re-assert the invariant at `applyChangeSet` entry (defense-in-depth — catches handcrafted brand instances in tests). Add a mismatch refusal contract test in `@protostar/admission-e2e`.

Purpose: Mitigates T-12-03 (display-vs-write split). Today's risk: `PatchRequest{path:"safe.ts", op:{path:"danger.ts"}, diff parses for "other.ts"}` would touch danger.ts with hunks for other.ts. CLI wiring derives all three from one source today, but the exported repo API does not enforce.
Output: Branded PatchRequest + mintPatchRequest + canonicalize helper + re-assertion + contract test.
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
**Verified during planning** (`packages/repo/src/fs-adapter.ts:6-8`):
```typescript
export interface AuthorizedWorkspaceOp {
  // ...
  readonly path: string;   // ← confirmed; the .path field exists, used at apply-change-set.ts:82, :114
}
```

**Current `PatchRequest`** (`apply-change-set.ts:8-17`) — structural interface, no constructor:
```typescript
export interface PatchRequest {
  readonly path: string;
  readonly op: AuthorizedWorkspaceOp;
  readonly diff: string;
  readonly preImageSha256: string;
}
```

**Diff library `parsePatch` (diff@9):** returns `StructuredPatch[]` where each has `.oldFileName` and `.newFileName`. Filenames carry `a/`/`b/` prefixes per unified-diff convention. Strip prefixes before canonicalization.

**`@protostar/paths` carve-out** (AGENTS.md:53-70): permits "Pure-compute path manipulation (`node:path` `resolve` / `relative` / `dirname`)." Forbids JSON parsing, business logic, networking. `canonicalizeRelativePath` is in scope.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add canonicalizeRelativePath helper to @protostar/paths</name>
  <files>packages/paths/src/canonicalize-relative-path.ts, packages/paths/src/canonicalize-relative-path.test.ts, packages/paths/src/index.ts</files>
  <read_first>
    - packages/paths/src/index.ts (current barrel — confirm carve-out scope)
    - packages/paths/package.json (existing exports map)
    - AGENTS.md lines 53-70 (carve-out scope)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Canonicalize helper" (lines 343-356)
  </read_first>
  <behavior>
    - `canonicalizeRelativePath("./src/file.ts")` returns `"src/file.ts"`.
    - `canonicalizeRelativePath("src/file.ts")` returns `"src/file.ts"`.
    - `canonicalizeRelativePath("a/src/file.ts")` returns `"a/src/file.ts"` (NOT a strip — `a/` prefix is a diff convention; this helper is pure path normalization. Diff-prefix strip lives in `apply-change-set` mint code).
    - `canonicalizeRelativePath("src/../file.ts")` returns `"file.ts"`.
    - `canonicalizeRelativePath("/abs/path")` THROWS `Error` with message containing `"absolute"`.
    - `canonicalizeRelativePath("../escape")` THROWS `Error` with message containing `"escapes"`.
    - Uses `node:path/posix` (NOT OS-aware) so cross-platform fixtures behave identically.
  </behavior>
  <action>
    Create `packages/paths/src/canonicalize-relative-path.ts` with:
    ```typescript
    import { posix } from "node:path";

    /**
     * Canonicalize a workspace-relative path for exact-string `===` comparison.
     * Uses node:path/posix to keep behavior identical across platforms.
     *
     * Refuses absolute paths and `..`-escaping inputs. Strips a single leading `./`.
     *
     * Phase 12 D-10: shared helper for PatchRequest path/op/diff invariant.
     */
    export function canonicalizeRelativePath(input: string): string {
      if (posix.isAbsolute(input)) {
        throw new Error(`canonicalizeRelativePath: absolute path not allowed: ${input}`);
      }
      const normalized = posix.normalize(input).replace(/^\.\//, "");
      if (normalized === ".." || normalized.startsWith("../")) {
        throw new Error(`canonicalizeRelativePath: path escapes workspace: ${input}`);
      }
      return normalized;
    }
    ```

    Create the matching test file with cases for the 6 behaviors above.

    Update `packages/paths/src/index.ts` to add: `export { canonicalizeRelativePath } from "./canonicalize-relative-path.js";`.

    Build + test: `pnpm --filter @protostar/paths test`.
  </action>
  <verify>
    <automated>test -f packages/paths/src/canonicalize-relative-path.ts &amp;&amp; grep -q 'canonicalizeRelativePath' packages/paths/src/index.ts &amp;&amp; grep -q 'node:path' packages/paths/src/canonicalize-relative-path.ts &amp;&amp; pnpm --filter @protostar/paths test</automated>
  </verify>
  <acceptance_criteria>
    - `canonicalize-relative-path.ts` imports from `node:path` (posix submodule).
    - Test covers all 6 behaviors above.
    - `pnpm --filter @protostar/paths test` exits 0.
  </acceptance_criteria>
  <done>Shared canonicalize helper lives in @protostar/paths within carve-out scope.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Brand PatchRequest with mintPatchRequest + applyChangeSet re-assertion</name>
  <files>packages/repo/src/apply-change-set.ts, packages/repo/src/apply-change-set.test.ts, packages/repo/src/index.ts, packages/repo/package.json</files>
  <read_first>
    - packages/repo/src/apply-change-set.ts (entire file — current PatchRequest at lines 8-17, applyChangeSet at line 25+; the patch.path read at line 65, patch.op read at line 82, patch.op write at line 114)
    - packages/repo/src/apply-change-set.test.ts (existing test patterns + opFor helper at lines 330+)
    - packages/repo/src/fs-adapter.ts (AuthorizedWorkspaceOp.path field at line 8 — confirmed)
    - packages/repo/package.json (deps — add @protostar/paths if not present)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Pattern 3: PatchRequest Brand With Path/Op/Diff Invariant" (lines 281-356) and Pitfall 5 (lines 1013-1016)
  </read_first>
  <behavior>
    - `mintPatchRequest({ path:"src/safe.ts", op:opFor("src/danger.ts"), diff:validDiffFor("src/safe.ts"), preImageSha256:"..." })` returns `{ ok:false, error:"path-mismatch" }`.
    - `mintPatchRequest({ path:"src/safe.ts", op:opFor("src/safe.ts"), diff:validDiffFor("src/other.ts"), preImageSha256:"..." })` returns `{ ok:false, error:"diff-filename-mismatch" }`.
    - `mintPatchRequest({ path:"src/safe.ts", op:opFor("src/safe.ts"), diff:"not a valid diff", preImageSha256:"..." })` returns `{ ok:false, error:"diff-parse-error" }`.
    - `mintPatchRequest({ path:"./src/file.ts", op:opFor("src/file.ts"), diff:validDiffFor("a/src/file.ts"), preImageSha256:"..." })` returns `{ ok:true, request: ... }` (round-trip canonicalization with `./` and `a/` prefix).
    - `applyChangeSet([handcraftedFakeBrand], ...)` returns `[{ path, status:"skipped-error", error:"path-op-diff-mismatch" }]` when path/op/diff disagree.
    - The exported `PatchRequest` type is a brand — `as PatchRequest` of a raw object compiles, but production callers go through `mintPatchRequest`.
  </behavior>
  <action>
    In `packages/repo/src/apply-change-set.ts`:

    1. ADD top of file:
       ```typescript
       import { canonicalizeRelativePath } from "@protostar/paths";
       ```

    2. REPLACE the existing `PatchRequest` interface (lines 8-17) with a branded type:
       ```typescript
       declare const __patchRequestBrand: unique symbol;

       export type PatchRequest = {
         readonly path: string;
         readonly op: AuthorizedWorkspaceOp;
         readonly diff: string;
         readonly preImageSha256: string;
       } & { readonly [__patchRequestBrand]: void };

       export type PatchRequestMintError =
         | "path-mismatch"
         | "diff-filename-mismatch"
         | "diff-parse-error";

       export type PatchRequestMintInput = {
         readonly path: string;
         readonly op: AuthorizedWorkspaceOp;
         readonly diff: string;
         readonly preImageSha256: string;
       };

       function stripDiffPrefix(filename: string): string {
         // diff library prefixes oldFileName with "a/" and newFileName with "b/"
         if (filename.startsWith("a/") || filename.startsWith("b/")) {
           return filename.slice(2);
         }
         return filename;
       }

       function checkInvariant(
         input: PatchRequestMintInput
       ): { ok: true; canonPath: string } | { ok: false; error: PatchRequestMintError } {
         let canonPath: string;
         let canonOpPath: string;
         try {
           canonPath = canonicalizeRelativePath(input.path);
           canonOpPath = canonicalizeRelativePath(input.op.path);
         } catch (err) {
           return { ok: false, error: "path-mismatch" };
         }
         if (canonPath !== canonOpPath) {
           return { ok: false, error: "path-mismatch" };
         }
         let parsed: ReturnType<typeof parsePatch>;
         try {
           parsed = parsePatch(input.diff);
         } catch {
           return { ok: false, error: "diff-parse-error" };
         }
         const first = parsed[0];
         if (first === undefined) return { ok: false, error: "diff-parse-error" };
         const filename = first.newFileName ?? first.oldFileName;
         if (filename === undefined || filename === "/dev/null") {
           return { ok: false, error: "diff-parse-error" };
         }
         let canonDiffPath: string;
         try {
           canonDiffPath = canonicalizeRelativePath(stripDiffPrefix(filename));
         } catch {
           return { ok: false, error: "diff-filename-mismatch" };
         }
         if (canonPath !== canonDiffPath) {
           return { ok: false, error: "diff-filename-mismatch" };
         }
         return { ok: true, canonPath };
       }

       export function mintPatchRequest(
         input: PatchRequestMintInput
       ): { readonly ok: true; readonly request: PatchRequest } | { readonly ok: false; readonly error: PatchRequestMintError } {
         const result = checkInvariant(input);
         if (!result.ok) return result;
         return {
           ok: true,
           request: { ...input, [__patchRequestBrand]: undefined } as PatchRequest
         };
       }
       ```

    3. At the start of `applyChangeSet` (the function body — find it; today around lines 25-50), ADD a re-assertion loop BEFORE the existing logic:
       ```typescript
       export async function applyChangeSet(patches: readonly PatchRequest[], input: ApplyChangeSetInput = {}): Promise<readonly ApplyChangeSetEntryResult[]> {
         // Defense-in-depth: re-assert the path/op/diff invariant at function entry.
         // Pitfall 5: helper MUST be the same one mintPatchRequest uses.
         for (const patch of patches) {
           const check = checkInvariant(patch);
           if (!check.ok) {
             return [{
               path: patch.path,
               status: "skipped-error" as const,
               error: "path-op-diff-mismatch"
             }];
           }
         }
         // ... existing function body unchanged ...
       }
       ```
       Confirm `ApplyChangeSetEntryResult` already includes `"skipped-error"` status — if not, ADD `"path-op-diff-mismatch"` as a permitted error string in the result type union.

    4. EXPORT `mintPatchRequest`, `PatchRequestMintError`, `PatchRequestMintInput` from this file. Update `packages/repo/src/index.ts` barrel: add `export { mintPatchRequest } from "./apply-change-set.js"; export type { PatchRequest, PatchRequestMintError, PatchRequestMintInput } from "./apply-change-set.js";`.

    5. In `packages/repo/package.json`: add `"@protostar/paths": "workspace:*"` to dependencies if not present.

    6. Update existing CLI callers that build `PatchRequest` literals — find via `grep -rn 'PatchRequest' apps/ packages/ --include='*.ts'`. Each call site must now go through `mintPatchRequest` and handle the result. Failure to mint = refusal evidence path. (This may surface in `packages/repair/src/` or `apps/factory-cli/src/` — update each caller.)

    Update `packages/repo/src/apply-change-set.test.ts` to add tests for the new re-assertion path (handcraft a fake-branded patch via `as PatchRequest`).
  </action>
  <verify>
    <automated>grep -q 'mintPatchRequest' packages/repo/src/apply-change-set.ts &amp;&amp; grep -q 'canonicalizeRelativePath' packages/repo/src/apply-change-set.ts &amp;&amp; grep -q 'mintPatchRequest' packages/repo/src/index.ts &amp;&amp; grep -q '__patchRequestBrand' packages/repo/src/apply-change-set.ts &amp;&amp; pnpm --filter @protostar/repo test</automated>
  </verify>
  <acceptance_criteria>
    - `apply-change-set.ts` imports `canonicalizeRelativePath` from `@protostar/paths`.
    - Declares `__patchRequestBrand` symbol; `PatchRequest` is intersected with the brand.
    - Exports `mintPatchRequest` returning either `{ok:true, request}` or `{ok:false, error}`.
    - `applyChangeSet` body has a re-assertion loop calling `checkInvariant` (or equivalent) before existing logic.
    - `packages/repo/src/index.ts` re-exports `mintPatchRequest`.
    - `pnpm --filter @protostar/repo test` exits 0 with new mismatch + canonicalization tests.
  </acceptance_criteria>
  <done>PatchRequest is branded, minted via constructor; applyChangeSet re-asserts; one canonicalize helper used at both sites.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: apply-change-set-mismatch contract test in admission-e2e</name>
  <files>packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts</files>
  <read_first>
    - packages/repo/src/apply-change-set.ts (post-Task 2 — mintPatchRequest signature)
    - packages/repo/src/apply-change-set.test.ts (helpers like opFor, validDiffFor — reuse pattern)
    - packages/admission-e2e/src/contracts/ (existing contract test patterns)
    - .planning/phases/12-authority-boundary-stabilization/12-RESEARCH.md §"Contract test for D-09" (lines 762-801)
  </read_first>
  <behavior>
    - Refuses mint when path !== op.path → error `"path-mismatch"`.
    - Refuses mint when diff filename !== path → error `"diff-filename-mismatch"`.
    - Refuses mint when diff is unparseable → error `"diff-parse-error"`.
    - Canonicalization round-trip: `path: "./src/file.ts"`, `op.path: "src/file.ts"`, diff filename `"a/src/file.ts"` → mint succeeds.
    - `applyChangeSet` re-assertion: handcraft a fake-branded patch (via `as PatchRequest` cast) with disagreeing path/op/diff → `applyChangeSet` returns a `skipped-error` entry with error `"path-op-diff-mismatch"`.
  </behavior>
  <action>
    Create `packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts`. Mirror the test scaffold in RESEARCH §"Contract test for D-09" (lines 762-801).

    Skeleton:
    ```typescript
    import { strict as assert } from "node:assert";
    import { describe, it } from "node:test";
    import { mintPatchRequest, applyChangeSet, type PatchRequest } from "@protostar/repo";

    function opFor(path: string): /* AuthorizedWorkspaceOp */ any {
      // Build a minimal AuthorizedWorkspaceOp test fixture (mirror packages/repo/src/apply-change-set.test.ts:355).
      return {
        path,
        workspace: { root: "/tmp/test", trust: "trusted" },
        resolvedEnvelope: { /* EMPTY_ENVELOPE shape from apply-change-set.test.ts:25 */ }
      };
    }

    function validDiffFor(filename: string): string {
      return `--- a/${filename}\n+++ b/${filename}\n@@ -1,1 +1,1 @@\n-old\n+new\n`;
    }

    describe("apply-change-set path/op/diff invariant (AUTH-09, AUTH-10)", () => {
      it("refuses mint when path !== op.path", () => {
        const result = mintPatchRequest({
          path: "src/safe.ts",
          op: opFor("src/danger.ts"),
          diff: validDiffFor("src/safe.ts"),
          preImageSha256: "0".repeat(64)
        });
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.error, "path-mismatch");
      });

      it("refuses mint when diff filename !== path", () => {
        const result = mintPatchRequest({
          path: "src/safe.ts",
          op: opFor("src/safe.ts"),
          diff: validDiffFor("src/other.ts"),
          preImageSha256: "0".repeat(64)
        });
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.error, "diff-filename-mismatch");
      });

      it("refuses mint when diff is unparseable", () => {
        const result = mintPatchRequest({
          path: "src/safe.ts",
          op: opFor("src/safe.ts"),
          diff: "this is not a unified diff",
          preImageSha256: "0".repeat(64)
        });
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.error, "diff-parse-error");
      });

      it("canonicalization round-trip — './foo' === 'foo' === diff 'a/foo'", () => {
        const result = mintPatchRequest({
          path: "./src/file.ts",
          op: opFor("src/file.ts"),
          diff: validDiffFor("src/file.ts"),  // standard diff with a/b prefixes
          preImageSha256: "0".repeat(64)
        });
        assert.equal(result.ok, true);
      });

      it("applyChangeSet re-asserts on handcrafted fake-brand mismatch", async () => {
        // Bypass mintPatchRequest by casting a raw object to PatchRequest.
        const fake = {
          path: "src/safe.ts",
          op: opFor("src/danger.ts"),
          diff: validDiffFor("src/other.ts"),
          preImageSha256: "0".repeat(64)
        } as unknown as PatchRequest;

        const result = await applyChangeSet([fake]);
        assert.equal(result.length, 1);
        assert.equal(result[0]!.status, "skipped-error");
        assert.equal((result[0] as any).error, "path-op-diff-mismatch");
      });
    });
    ```

    Adjust the `opFor`/`EMPTY_ENVELOPE` fixture import to mirror the existing helper in `packages/repo/src/apply-change-set.test.ts:25, 330, 355` — read that file and re-create the minimal fixture inline (admission-e2e cannot import internal test helpers from another package).

    Build + test: `pnpm --filter @protostar/admission-e2e test`.
  </action>
  <verify>
    <automated>test -f packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts &amp;&amp; grep -q 'path-mismatch' packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts &amp;&amp; grep -q 'diff-filename-mismatch' packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts &amp;&amp; grep -q 'path-op-diff-mismatch' packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts &amp;&amp; pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - File exists with all five test cases (3 mint refusals + 1 round-trip + 1 re-assertion).
    - Test imports from `@protostar/repo` only public exports (`mintPatchRequest`, `applyChangeSet`, `PatchRequest`).
    - All tests pass.
    - Full `pnpm run verify` exits 0.
  </acceptance_criteria>
  <done>Contract test pins T-12-03: every mismatch path is refused at mint or re-asserted at apply.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| caller-supplied PatchRequest → applyChangeSet I/O | Three sources of "the file we're touching" must agree exactly after canonicalization |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-12-03 | Tampering | `PatchRequest` brand + `mintPatchRequest` + `applyChangeSet` re-assertion | mitigate | Branded type with mint-time invariant check; defense-in-depth re-check at function entry; one canonicalize helper used at both sites (Pitfall 5) |
</threat_model>

<verification>
- `pnpm --filter @protostar/admission-e2e test` includes apply-change-set-mismatch contract test passing.
- `pnpm --filter @protostar/paths test` includes canonicalize round-trip cases passing.
- Full `pnpm run verify` green.
</verification>

<success_criteria>
- AUTH-09 satisfied: PatchRequest brand mint constructor refuses path/op/diff disagreement; applyChangeSet re-asserts.
- AUTH-10 satisfied: exact-string equality after canonicalization through one shared helper in @protostar/paths.
</success_criteria>

<output>
After completion, create `.planning/phases/12-authority-boundary-stabilization/12-05-SUMMARY.md`
</output>
