---
phase: 03-repo-runtime-sandbox
plan: 07
type: tdd
wave: 2
depends_on: [01, 04, 05]
files_modified:
  - packages/repo/src/apply-change-set.ts
  - packages/repo/src/apply-change-set.test.ts
autonomous: true
requirements: [REPO-05]
must_haves:
  truths:
    - "applyChangeSet returns per-file ApplyResult[] with statuses applied | skipped-hash-mismatch | skipped-error"
    - "Pre-image SHA-256 computed on file bytes BEFORE diff.applyPatch; mismatch produces skipped-hash-mismatch (no apply)"
    - "diff.applyPatch returning false produces skipped-error with error: 'hunk-fit-failure'"
    - "Binary-files patch header detected via parsePatch output produces skipped-error with error: 'binary-not-supported'"
    - "Best-effort partial: a 5-patch set where patch 3 hash-mismatches yields patches 1,2,4,5 applied + 3 evidenced (Q-12)"
  artifacts:
    - path: "packages/repo/src/apply-change-set.ts"
      provides: "Patch pipeline using diff@9.0.0 + node:crypto"
      exports: ["applyChangeSet", "ApplyResult", "PatchRequest"]
  key_links:
    - from: "packages/repo/src/apply-change-set.ts"
      to: "packages/repo/src/fs-adapter.ts"
      via: "fsAdapter.readFile / writeFile per patch"
      pattern: "readFile|writeFile"
---

<objective>
Implement Q-10 + Q-12 patch pipeline using `diff@9.0.0` (CONFLICT-01 resolution) — NOT `isomorphic-git.apply` (which doesn't exist). Per-file: SHA-256 pre-image gate → `parsePatch` → binary detection → `applyPatch` → write via fs-adapter. Best-effort: never throws on per-file failure; returns ApplyResult[] for caller (Phase 5 review loop) to interpret.

Purpose: REPO-05 atomic apply + Q-12 best-effort granularity. Heart of the dark factory's mutation surface. Standalone TDD plan because the pipeline mechanics are intricate (hash-mismatch refusal + binary detection + hunk-fit failure + per-file evidence).
Output: `applyChangeSet` function with comprehensive RED→GREEN test suite.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md
@.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md
@.planning/phases/03-repo-runtime-sandbox/03-PATTERNS.md
@packages/repo/src/fs-adapter.ts

CONFLICT-01 (load-bearing): Q-10 says "isomorphic-git's apply" — that API
does not exist. Use `diff.parsePatch` + `diff.applyPatch` from `diff@9.0.0`.
Erratum E-01 in 03-CONTEXT.md (added by Plan 01) is the audit trail.

Q-12 lock: best-effort partial. A 5-patch set with patch-3 hash-mismatch
must produce patches 1,2,4,5 applied AND patch 3 evidenced. NOT all-or-nothing.

Q-10 hash gate: pre-image SHA-256 computed by us (`node:crypto`). `applyPatch`
itself has no hash check.

Pitfall 3 (binary): cosmetic-tweak loop touching `.png` will hit `Binary files
... differ` patch headers. Detect via parsePatch output (look for the marker
in hunks), record `{status: "skipped-error", error: "binary-not-supported"}`.

PATTERNS.md (lines 153-178) — analog and pipeline sketch. RESEARCH.md
Code Examples (lines 624-649) — full reference impl.

<interfaces>
```typescript
import type { AuthorizedWorkspaceOp } from "@protostar/authority";

export interface PatchRequest {
  /** Workspace-relative path of the file to patch. */
  readonly path: string;
  /** Authorized op for FS access — caller (Plan 11) mints via authority. */
  readonly op: AuthorizedWorkspaceOp;
  /** Unified-diff text. */
  readonly diff: string;
  /** Hex-encoded SHA-256 of expected pre-image (caller computes from coder output context). */
  readonly preImageSha256: string;
}

export type ApplyStatus = "applied" | "skipped-hash-mismatch" | "skipped-error";

export interface ApplyResult {
  readonly path: string;
  readonly status: ApplyStatus;
  /** Present when status is "skipped-error". Values: "binary-not-supported" | "hunk-fit-failure" | "io-error" | "parse-error". */
  readonly error?: string;
}

export async function applyChangeSet(
  patches: readonly PatchRequest[]
): Promise<readonly ApplyResult[]>;
```

Algorithm per patch:
1. `preImageBytes = await fsAdapter.readFile(patch.op)` — wrap in try/catch;
   on FsAdapterError, return `{status:"skipped-error", error:"io-error"}`.
2. `hash = createHash("sha256").update(preImageBytes).digest("hex")`.
3. If `hash !== patch.preImageSha256` → return `{status:"skipped-hash-mismatch"}`.
4. `let parsed: StructuredPatch[]; try { parsed = parsePatch(patch.diff); } catch { return {status:"skipped-error", error:"parse-error"} }`.
5. If `parsed.length === 0` → `parse-error`.
6. Binary detection: scan `parsed[0].hunks` for any line matching
   `^Binary files ` (the marker is line-level inside the patch text); also
   inspect any structured fields `parsePatch` emits (`isBinary`? — the diff
   library doesn't expose one explicitly; the marker-text scan is the
   contract). Record `binary-not-supported`.
7. `result = applyPatch(preImageBytes.toString("utf8"), parsed[0])`.
8. If `result === false` → `hunk-fit-failure`.
9. `await fsAdapter.writeFile(patch.op, Buffer.from(result, "utf8"))` — wrap in
   try/catch; on FsAdapterError return `io-error`.
10. Return `{status: "applied"}`.

Loop is sequential per-patch (atomic, not parallel) so two patches to the same
file are well-ordered. Concatenate results in input order.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (RED): Write the apply-change-set contract suite</name>
  <files>packages/repo/src/apply-change-set.test.ts</files>
  <behavior>
    Tests use `buildSacrificialRepo` for repo, mint `AuthorizedWorkspaceOp` via
    `@protostar/authority` `authorizeWorkspaceOp` for each patch.

    Helpers:
    - `mkPatch(originalText, modifiedText, path)`: use `diff.createPatch` from
      the same library to generate test patches.
    - `sha256Hex(bytes)`: `createHash("sha256").update(bytes).digest("hex")`.

    Cases:
    - **happy-single:** 1 patch, hash matches, applies cleanly. Result `[{status:"applied"}]`. Verify `readFile` returns modified content.
    - **happy-multi-five:** 5 patches across 5 files. All hashes match. Result is 5 `applied`. Each file has new content.
    - **hash-mismatch-single:** 1 patch with intentionally wrong `preImageSha256`. Result `[{status:"skipped-hash-mismatch"}]`. File unchanged on disk.
    - **best-effort-five-with-mismatch-on-three (REPO-05 lead test):** 5 patches; patch 3 has wrong hash. Result statuses `[applied, applied, skipped-hash-mismatch, applied, applied]`. Files 1,2,4,5 mutated; file 3 unchanged.
    - **hunk-fit-failure:** patch context lines deliberately don't match pre-image (e.g., generated from a different source than the seed file but with hash matching the seed). Result `skipped-error: hunk-fit-failure`. Note: must hand-craft so SHA matches but hunks don't fit — easiest: take a valid patch, then mutate the seed file's content while keeping the SHA assertion stale. Alternative: just craft a syntactically valid patch with bogus context. Document in test which strategy used.
    - **binary-marker:** patch text starts with `Binary files a/icon.png and b/icon.png differ`. Result `skipped-error: binary-not-supported`. (Construct manually — `createPatch` won't emit this on text input.)
    - **parse-error:** patch text is garbage (e.g., `"not a patch\n"`). Result `skipped-error: parse-error`.
    - **io-error-on-read:** op points to non-existent file. Result `skipped-error: io-error`.

    Build a small `mintWorkspaceOp` helper inside the test file or import from
    Phase 2 — verify the public producer name in `@protostar/authority` exports.
  </behavior>
  <action>
    Write the test file. Cases above. RED commit:
    `test(03-07): add failing apply-change-set contract suite`.

    Compile must fail (no source yet).
  </action>
  <verify>
    <automated>! pnpm --filter @protostar/repo build 2&gt;/dev/null</automated>
  </verify>
  <done>Test file with ~8 cases written; build red; commit landed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (GREEN): Implement applyChangeSet pipeline</name>
  <files>packages/repo/src/apply-change-set.ts</files>
  <action>
    Implement per `<interfaces>` algorithm. Imports:
    ```typescript
    import { createHash } from "node:crypto";
    import { parsePatch, applyPatch, type StructuredPatch } from "diff";
    import { readFile, writeFile, FsAdapterError } from "./fs-adapter.js";
    import type { AuthorizedWorkspaceOp } from "@protostar/authority";
    ```

    Sequential `for` loop over patches (not `Promise.all`) — Q-12 best-effort
    + ordering matters when same-file mutations land in sequence (rare in
    cosmetic loop but must be correct).

    Binary detection — read `parsed` for the marker. `parsePatch` may surface
    binary diffs as a single hunk with `lines: ["Binary files ... differ"]`.
    Pragmatic detection: scan all hunks, any line starting `"Binary files "`
    OR check if `parsed[0].hunks.length === 0` AND patch text contains the
    marker. Document the chosen heuristic in source comments.

    Run `pnpm --filter @protostar/repo test`. All cases green.

    Commit: `feat(03-07): apply-change-set with sha256 hash gate + diff lib`.

    Refactor (optional — only if green): extract per-patch worker into a private
    `applyOnePatch` helper for readability. Re-run tests; commit
    `refactor(03-07): extract applyOnePatch helper` if changed.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/repo test</automated>
  </verify>
  <done>All apply-change-set tests green. RED + GREEN (+ optional REFACTOR) commits in log. CONFLICT-01 substitution complete (no `isomorphic-git.apply` references).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Coder output (patch text) → workspace | Patches arrive from Phase 4 ExecutionAdapter; they're opaque text and a hash claim |
| Pre-image SHA-256 → file mutation | Hash gate is the only barrier between bad patch + concurrent edit and corrupted file |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-07-01 | Tampering | Patch applies to wrong base (concurrent edit) | mitigate | Pre-image SHA-256 gate: read bytes, hash, compare BEFORE applyPatch. Mismatch → skip with evidence. |
| T-03-07-02 | Tampering | Hash collision (theoretical) | accept | SHA-256 collision resistance; out-of-scope for v1. |
| T-03-07-03 | Information Disclosure | Patch contains sensitive content if logged | accept | Patches are run-bundle artifacts already; downstream review loops them; not new info. |
| T-03-07-04 | DoS | Huge patch text (multi-GB) | accept | Phase 4 ExecutionAdapter caps coder output via capability envelope budget; Phase 3 receives bounded input. Document limit if measurable. |
| T-03-07-05 | Tampering | Binary patch silently corrupts file | mitigate | Binary-marker detection → `binary-not-supported`. Test exercises this. |
</threat_model>

<validation_strategy>
- **Coverage:** REPO-05 (atomic-via-best-effort + per-file evidence).
- **Sample frequency:** RED + GREEN commits + per-task `pnpm --filter @protostar/repo test`.
- **Observability:** Each ApplyResult has explicit status + error reason; downstream Phase 5 reads structured evidence.
- **Nyquist:** ~8 cases cover happy single, happy multi, hash-mismatch, best-effort partial, hunk fail, binary, parse error, IO error.
</validation_strategy>

<verification>
- `pnpm --filter @protostar/repo test` green; ≥8 apply-change-set tests
- `grep -c 'isomorphic-git\.apply\|isoGit\.apply' packages/repo/src/apply-change-set.ts | grep -v '^#'` == 0 (CONFLICT-01 substitution clean)
- `grep -c 'parsePatch\|applyPatch' packages/repo/src/apply-change-set.ts | grep -v '^#'` ≥ 2
</verification>

<success_criteria>
- Pipeline order: read → hash gate → parse → binary check → apply → write
- Sequential per-patch (best-effort, ordered)
- Result array preserves input order
- Five enumerated error reasons documented
</success_criteria>

<output>
After completion, create `.planning/phases/03-repo-runtime-sandbox/03-07-SUMMARY.md` with: test count, binary detection heuristic chosen, any deviations from RESEARCH sketch.
</output>
