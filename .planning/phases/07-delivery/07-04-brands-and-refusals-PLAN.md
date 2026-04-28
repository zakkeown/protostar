---
phase: 07-delivery
plan: 04
type: execute
wave: 1
depends_on: ["07-01"]
files_modified:
  - packages/delivery/src/brands.ts
  - packages/delivery/src/brands.test.ts
  - packages/delivery/src/refusals.ts
  - packages/delivery/src/evidence-marker.ts
  - packages/delivery/src/index.ts
  - packages/delivery/src/delivery-contract.ts
  - packages/delivery/src/brand-rejects-raw-string.contract.test.ts
autonomous: true
requirements: [DELIVER-02, DELIVER-07]
must_haves:
  truths:
    - "BranchName, PrTitle, PrBody are unique-symbol branded types in @protostar/delivery"
    - "validateBranchName/validatePrTitle/validatePrBody return { ok: true; value } | { ok: false; refusal } and mint brands only on ok"
    - "DeliveryRefusal is a discriminated union with 14 named variants (invalid-branch, invalid-title, invalid-body, oversized-body, control-character, token-missing, token-invalid, repo-inaccessible, base-branch-missing, excessive-pat-scope, pr-already-closed, pr-ambiguous, remote-diverged, cancelled)"
    - "Token regex covers BOTH classic and fine-grained PATs (research-driven extension to Q-06)"
    - "Body validator measures byte length (Buffer.byteLength UTF-8), not char length, against 60_000 cap"
    - "Title validator truncates >200 chars with ellipsis; body validator REFUSES >60_000 bytes (no silent strip)"
    - "Control chars (\\x00-\\x08, \\x0b, \\x0c, \\x0e-\\x1f) cause refusal in both title and body"
    - "Type-level @ts-expect-error contract test fails to compile when raw strings passed where brands required"
    - "evidence-marker.ts exports the runId-extended marker constant: <!-- protostar-evidence:{kind}:{runId} -->"
    - "Existing GitHubPrDeliveryPlan no longer carries `command: ['gh', 'pr', 'create', ...]` (Q-02 drop)"
  artifacts:
    - path: packages/delivery/src/brands.ts
      provides: "BranchName/PrTitle/PrBody brands + validators"
      exports: ["BranchName", "PrTitle", "PrBody", "validateBranchName", "validatePrTitle", "validatePrBody"]
    - path: packages/delivery/src/refusals.ts
      provides: "DeliveryRefusal discriminated union"
      exports: ["DeliveryRefusal"]
    - path: packages/delivery/src/evidence-marker.ts
      provides: "Comment marker constants (kind + runId-extended)"
      exports: ["EVIDENCE_MARKER_PREFIX", "buildEvidenceMarker", "parseEvidenceMarker"]
    - path: packages/delivery/src/brand-rejects-raw-string.contract.test.ts
      provides: "@ts-expect-error contract test"
  key_links:
    - from: packages/delivery/src/brands.ts
      to: packages/delivery/src/refusals.ts
      via: "Validators return DeliveryRefusal on failure"
      pattern: "DeliveryRefusal"
    - from: packages/delivery/src/index.ts
      to: packages/delivery/src/brands.ts
      via: "Barrel re-export"
      pattern: "validateBranchName|validatePrTitle|validatePrBody"
---

<objective>
Land the five branded types + discriminator + marker constants that gate the delivery I/O entry: `BranchName`, `PrTitle`, `PrBody` brand-mint validators (Q-08), the `DeliveryRefusal` discriminated union (Q-08, Q-09, Q-20), the `<!-- protostar-evidence:{kind}:{runId} -->` marker constants (Q-10 + Pitfall 9 runId extension), and a type-level `@ts-expect-error` contract test proving raw strings fail to satisfy the brand types. Also drop the `command: ['gh', 'pr', 'create', ...]` argv emission from the existing `GitHubPrDeliveryPlan` (Q-02) — clean break, no compat shim.

Purpose: Phase 7's deepest brand stack (5 brands at `executeDelivery`) lives here. Wave 2's `executeDelivery` and Wave 5's factory-cli call site are typed against these.
Output: Pure validators, refusal taxonomy, marker constants, contract test. `packages/delivery` remains pure (no fs, no network).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/07-delivery/07-CONTEXT.md
@.planning/phases/07-delivery/07-RESEARCH.md
@.planning/phases/07-delivery/07-PATTERNS.md
@packages/review/src/delivery-authorization.ts
@packages/dogpile-adapter/src/pile-failure-types.ts
@packages/delivery/src/index.ts
@packages/delivery/src/delivery-contract.ts

<interfaces>
<!-- Brand pattern (verbatim shape from packages/review/src/delivery-authorization.ts). -->

```typescript
const BranchNameBrand: unique symbol = Symbol("BranchName");
export type BranchName = string & { readonly [BranchNameBrand]: true };

export function validateBranchName(s: string):
  | { readonly ok: true; readonly value: BranchName }
  | { readonly ok: false; readonly refusal: DeliveryRefusal };
```

<!-- Token regex (Pitfall 2 union — research-driven extension to Q-06 per orchestrator instruction #4). -->

```typescript
const CLASSIC_PAT = /^gh[pousr]_[A-Za-z0-9]{36}$/;
const FINE_GRAINED_PAT = /^github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}$/;
export const isValidGitHubTokenFormat = (s: string): boolean =>
  CLASSIC_PAT.test(s) || FINE_GRAINED_PAT.test(s);
```

<!-- DeliveryRefusal discriminator (Pattern S-3). -->

```typescript
export type DeliveryRefusal =
  | { readonly kind: 'invalid-branch'; readonly evidence: { input: string; regex: string } }
  | { readonly kind: 'invalid-title'; readonly evidence: { input: string; position?: number } }
  | { readonly kind: 'invalid-body'; readonly evidence: { input: string; position?: number } }
  | { readonly kind: 'oversized-body'; readonly evidence: { byteLength: number; limit: 60000 } }
  | { readonly kind: 'control-character'; readonly evidence: { field: 'branch' | 'title' | 'body'; position: number; codepoint: number } }
  | { readonly kind: 'token-missing'; readonly evidence: { envVar: 'PROTOSTAR_GITHUB_TOKEN' } }
  | { readonly kind: 'token-invalid'; readonly evidence: { reason: 'format' | '401' } }
  | { readonly kind: 'repo-inaccessible'; readonly evidence: { status: 403 | 404; owner: string; repo: string } }
  | { readonly kind: 'base-branch-missing'; readonly evidence: { baseBranch: string } }
  | { readonly kind: 'excessive-pat-scope'; readonly evidence: { scopes: readonly string[]; forbidden: readonly string[] } }
  | { readonly kind: 'pr-already-closed'; readonly evidence: { prUrl: string; prNumber: number } }
  | { readonly kind: 'pr-ambiguous'; readonly evidence: { prs: readonly string[] } }
  | { readonly kind: 'remote-diverged'; readonly evidence: { branch: string; expectedSha: string | null; remoteSha: string } }
  | { readonly kind: 'cancelled'; readonly evidence: { reason: 'sigint' | 'timeout' | 'sentinel' | 'parent-abort'; phase: 'preflight' | 'push' | 'pr-create' | 'comment' | 'poll' } };
```

<!-- Evidence marker (Q-10 + Pitfall 9: runId-extended). -->

```typescript
export const EVIDENCE_MARKER_PREFIX = "<!-- protostar-evidence:";
export type EvidenceCommentKind = 'mechanical-full' | 'judge-transcripts' | 'repair-history' | 'oversized-body-overflow';

export function buildEvidenceMarker(kind: EvidenceCommentKind, runId: string): string {
  return `<!-- protostar-evidence:${kind}:${runId} -->`;
}

export function parseEvidenceMarker(marker: string): { kind: EvidenceCommentKind; runId: string } | null;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: DeliveryRefusal discriminator + evidence-marker constants</name>
  <read_first>
    - packages/dogpile-adapter/src/pile-failure-types.ts (Pattern S-3 template — discriminated union with variant-specific evidence)
    - .planning/phases/07-delivery/07-RESEARCH.md §"Pitfall 9: Comment-marker collision risk" (runId extension)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-10 (marker pattern) + Q-08 (refusal kinds)
  </read_first>
  <behavior>
    - DeliveryRefusal is a `type` alias (not interface) with 14 variants tagged by `kind`.
    - Each variant carries variant-specific `evidence` — never collapse to `evidence: unknown`.
    - `buildEvidenceMarker('mechanical-full', 'run_abc123')` returns the literal `'<!-- protostar-evidence:mechanical-full:run_abc123 -->'`.
    - `parseEvidenceMarker('<!-- protostar-evidence:judge-transcripts:run_xyz -->')` returns `{ kind: 'judge-transcripts', runId: 'run_xyz' }`.
    - `parseEvidenceMarker` returns `null` for malformed markers, unknown kinds, or markers without runId (defense against operator-typed strings — Pitfall 9).
    - Test cases:
      - Build all 4 kinds, parse them back, assert round-trip
      - Parse a kind-only marker (`<!-- protostar-evidence:mechanical-full -->` without runId) → null
      - Parse a marker with unknown kind → null
      - Parse a marker with whitespace variations → null (strict format)
  </behavior>
  <files>packages/delivery/src/refusals.ts, packages/delivery/src/evidence-marker.ts, packages/delivery/src/refusals.test.ts, packages/delivery/src/evidence-marker.test.ts</files>
  <action>
    1. **RED:** Write `refusals.test.ts` checking the 14 discriminator variants compile (each constructed with required `evidence` shape) and `kind` narrowing works. Write `evidence-marker.test.ts` with the round-trip + null-on-malformed cases. Run tests; fail (files don't exist).
    2. **GREEN:** Create `refusals.ts` with the verbatim `DeliveryRefusal` type from `<interfaces>`. Add JSDoc citing Q-08, Q-09, Q-20. No runtime code; pure type definition + small `assertExhaustive` helper:
       ```typescript
       export function assertExhaustiveDeliveryRefusal(refusal: never): never {
         throw new Error(`Unhandled DeliveryRefusal kind: ${(refusal as DeliveryRefusal).kind}`);
       }
       ```
    3. Create `evidence-marker.ts`:
       ```typescript
       export const EVIDENCE_MARKER_PREFIX = "<!-- protostar-evidence:";
       export const EVIDENCE_COMMENT_KINDS = [
         "mechanical-full",
         "judge-transcripts",
         "repair-history",
         "oversized-body-overflow"
       ] as const;
       export type EvidenceCommentKind = typeof EVIDENCE_COMMENT_KINDS[number];

       const MARKER_REGEX = /^<!-- protostar-evidence:([a-z-]+):([A-Za-z0-9_-]+) -->$/;

       export function buildEvidenceMarker(kind: EvidenceCommentKind, runId: string): string {
         return `<!-- protostar-evidence:${kind}:${runId} -->`;
       }

       export function parseEvidenceMarker(marker: string): { kind: EvidenceCommentKind; runId: string } | null {
         const m = MARKER_REGEX.exec(marker);
         if (m === null) return null;
         const [, kind, runId] = m;
         if (!EVIDENCE_COMMENT_KINDS.includes(kind as EvidenceCommentKind)) return null;
         return { kind: kind as EvidenceCommentKind, runId: runId! };
       }
       ```
    4. Document in a comment header: "Marker pattern: `<!-- protostar-evidence:{kind}:{runId} -->`. The runId suffix (Pitfall 9) prevents reviewer-typed strings from accidentally matching."
    5. **REFACTOR:** Re-export both from `packages/delivery/src/index.ts` barrel.
    6. Run tests — all green.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery test --run refusals && pnpm --filter @protostar/delivery test --run evidence-marker</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "kind: 'invalid-branch'" packages/delivery/src/refusals.ts` ≥ 1
    - `grep -c "kind: 'cancelled'" packages/delivery/src/refusals.ts` ≥ 1
    - `grep -c "DeliveryRefusal" packages/delivery/src/refusals.ts` ≥ 1
    - All 14 variants present (count `kind:` occurrences in the type literal ≥ 14)
    - `grep -c 'protostar-evidence' packages/delivery/src/evidence-marker.ts` ≥ 1
    - Round-trip test green for all 4 kinds
    - Malformed marker (no runId, unknown kind) returns `null`
  </acceptance_criteria>
  <done>Refusal taxonomy + marker constants exported; tests round-trip cleanly.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: BranchName/PrTitle/PrBody brand validators</name>
  <read_first>
    - packages/review/src/delivery-authorization.ts (verbatim brand template — `unique symbol`, `Object.freeze`, `mintX(input)` shape)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-08, Q-09 (validation rules) + Q-07 (branch regex `^[a-zA-Z0-9._/-]+$` — DELIVER-02)
    - .planning/phases/07-delivery/07-RESEARCH.md Pitfall 3 (body limit is BYTES not chars) + RESEARCH §"Pattern 1: Branded I/O Entry"
  </read_first>
  <behavior>
    - validateBranchName:
      - Empty string → refusal `invalid-branch` (regex)
      - Length > 244 (git ref limit) → refusal `invalid-branch`
      - Contains chars outside `^[a-zA-Z0-9._/-]+$` → refusal `invalid-branch` with the offending regex string in evidence
      - Valid branch → `{ ok: true, value: branded }` where `Object.freeze` semantics apply (string brands cannot be frozen but type-level immutability holds)
      - Control chars in input → refusal `control-character` with field='branch', position, codepoint
    - validatePrTitle:
      - Truncates `> 200` chars to 197 chars + `'…'` (single Unicode horizontal ellipsis); does NOT refuse
      - Control chars (`\x00-\x08`, `\x0b`, `\x0c`, `\x0e-\x1f`) → refusal `control-character` with field='title'
      - Empty string allowed (caller may default to runId per Q-09)
    - validatePrBody:
      - Buffer.byteLength(input, 'utf8') > 60_000 → refusal `oversized-body` with `byteLength` and `limit: 60000`
      - Control chars → refusal `control-character` with field='body'
      - NEVER silent strip; never truncate (caller spillovers to comments per Q-10)
    - Token regex helper `isValidGitHubTokenFormat` exported (used by Wave 2 preflight-fast):
      - Accepts both classic (`^gh[pousr]_[A-Za-z0-9]{36}$`) and fine-grained (`^github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}$`) per Pitfall 2
    - Test matrix (per validator): 3 valid cases + 3 refusal cases = 9-12 tests total + 2 token-format cases
  </behavior>
  <files>packages/delivery/src/brands.ts, packages/delivery/src/brands.test.ts</files>
  <action>
    1. **RED:** Write `brands.test.ts` covering the behaviors above:
       - `validateBranchName('feature/foo')` → ok with branded value
       - `validateBranchName('')` → refusal kind `'invalid-branch'`
       - `validateBranchName('with space')` → refusal kind `'invalid-branch'` (regex fails)
       - `validateBranchName('a'.repeat(245))` → refusal `'invalid-branch'` (length)
       - `validateBranchName('feature\x07bell')` → refusal `'control-character'` with codepoint=7
       - `validatePrTitle('a'.repeat(200))` → ok, value length 200
       - `validatePrTitle('a'.repeat(250))` → ok, value length 198 (197 + 1 char ellipsis), ends with `'…'`
       - `validatePrTitle('hello\x00world')` → refusal `control-character`
       - `validatePrBody('a'.repeat(60000))` → ok (UTF-8 ASCII = 60000 bytes exactly at boundary)
       - `validatePrBody('a'.repeat(60001))` → refusal `oversized-body` byteLength 60001
       - `validatePrBody('🚀'.repeat(20000))` → refusal `oversized-body` (each rocket = 4 bytes UTF-8 = 80000 bytes, > 60_000)
       - `validatePrBody('hello\x00')` → refusal `control-character`
       - `isValidGitHubTokenFormat('ghp_' + 'a'.repeat(36))` → true
       - `isValidGitHubTokenFormat('github_pat_' + 'A'.repeat(22) + '_' + 'B'.repeat(59))` → true
       - `isValidGitHubTokenFormat('not-a-token')` → false
    2. **GREEN:** Create `brands.ts`:
       ```typescript
       import type { DeliveryRefusal } from "./refusals.js";

       const BranchNameBrand: unique symbol = Symbol("BranchName");
       const PrTitleBrand: unique symbol = Symbol("PrTitle");
       const PrBodyBrand: unique symbol = Symbol("PrBody");

       export type BranchName = string & { readonly [BranchNameBrand]: true };
       export type PrTitle = string & { readonly [PrTitleBrand]: true };
       export type PrBody = string & { readonly [PrBodyBrand]: true };

       const BRANCH_REGEX = /^[a-zA-Z0-9._/-]+$/;
       const CONTROL_CHAR_REGEX = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;
       const CLASSIC_PAT = /^gh[pousr]_[A-Za-z0-9]{36}$/;
       const FINE_GRAINED_PAT = /^github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}$/;

       export const isValidGitHubTokenFormat = (s: string): boolean =>
         CLASSIC_PAT.test(s) || FINE_GRAINED_PAT.test(s);

       function findControlChar(s: string): { position: number; codepoint: number } | null {
         for (let i = 0; i < s.length; i++) {
           const cp = s.charCodeAt(i);
           if ((cp <= 8) || cp === 11 || cp === 12 || (cp >= 14 && cp <= 31)) {
             return { position: i, codepoint: cp };
           }
         }
         return null;
       }

       export function validateBranchName(s: string):
         | { readonly ok: true; readonly value: BranchName }
         | { readonly ok: false; readonly refusal: DeliveryRefusal } {
         const ctrl = findControlChar(s);
         if (ctrl !== null) return { ok: false, refusal: { kind: 'control-character', evidence: { field: 'branch', ...ctrl } } };
         if (s.length === 0 || s.length > 244 || !BRANCH_REGEX.test(s)) {
           return { ok: false, refusal: { kind: 'invalid-branch', evidence: { input: s, regex: BRANCH_REGEX.source } } };
         }
         return { ok: true, value: s as BranchName };
       }

       export function validatePrTitle(s: string):
         | { readonly ok: true; readonly value: PrTitle }
         | { readonly ok: false; readonly refusal: DeliveryRefusal } {
         const ctrl = findControlChar(s);
         if (ctrl !== null) return { ok: false, refusal: { kind: 'control-character', evidence: { field: 'title', ...ctrl } } };
         const truncated = s.length > 200 ? s.slice(0, 197) + '…' : s;
         return { ok: true, value: truncated as PrTitle };
       }

       export function validatePrBody(s: string):
         | { readonly ok: true; readonly value: PrBody }
         | { readonly ok: false; readonly refusal: DeliveryRefusal } {
         const byteLength = Buffer.byteLength(s, 'utf8');
         if (byteLength > 60_000) return { ok: false, refusal: { kind: 'oversized-body', evidence: { byteLength, limit: 60_000 } } };
         const ctrl = findControlChar(s);
         if (ctrl !== null) return { ok: false, refusal: { kind: 'control-character', evidence: { field: 'body', ...ctrl } } };
         return { ok: true, value: s as PrBody };
       }
       ```
    3. **REFACTOR:** Re-export from `packages/delivery/src/index.ts`. Add a comment in `brands.ts` citing Pitfall 2 + Pitfall 3 + Q-08.
    4. Run all tests — green. Verify no `node:fs` or network imports (packages/delivery is pure).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery test --run brands</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'BranchNameBrand' packages/delivery/src/brands.ts` ≥ 1
    - `grep -c 'unique symbol' packages/delivery/src/brands.ts` ≥ 3 (one per brand)
    - `grep -c 'github_pat_' packages/delivery/src/brands.ts` ≥ 1 (fine-grained PAT regex present per Pitfall 2)
    - `grep -c 'Buffer.byteLength' packages/delivery/src/brands.ts` ≥ 1 (body cap measured in bytes per Pitfall 3)
    - All 14+ test cases green (3 valid + 4 refusal per validator + 3 token cases)
    - Type-level: `BranchName extends string` holds; raw string is NOT assignable to `BranchName` (Task 3 verifies)
  </acceptance_criteria>
  <done>Brand validators + token format helper green; pure module; barrel exports.</done>
</task>

<task type="auto">
  <name>Task 3: Type-level @ts-expect-error contract test + drop gh argv from delivery-contract</name>
  <read_first>
    - packages/delivery/src/delivery-contract.ts (existing GitHubPrDeliveryPlan + createGitHubPrDeliveryPlan signature; Plan 05-13 pinned the DeliveryAuthorization arg)
    - packages/delivery/src/index.ts (current barrel — `command: ['gh', 'pr', 'create', ...]` argv emission lives here per CONTEXT)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-02 (drop gh argv) + Q-08 (brand-required signature)
    - .planning/phases/07-delivery/07-VALIDATION.md Required Contract Test #3 (type-level brand-mint negative)
  </read_first>
  <files>packages/delivery/src/brand-rejects-raw-string.contract.test.ts, packages/delivery/src/delivery-contract.ts, packages/delivery/src/index.ts</files>
  <action>
    1. Create `packages/delivery/src/brand-rejects-raw-string.contract.test.ts`:
       ```typescript
       import { describe, it } from "node:test";
       import assert from "node:assert/strict";
       import type { BranchName, PrTitle, PrBody } from "./brands.js";

       /**
        * Type-level contract: raw strings cannot satisfy the brand types.
        * Compilation success of `@ts-expect-error` lines is the test —
        * if any of these compile cleanly, the brand isn't unique enough.
        */
       declare function takesBranchName(b: BranchName): void;
       declare function takesPrTitle(t: PrTitle): void;
       declare function takesPrBody(b: PrBody): void;

       // @ts-expect-error — raw string cannot satisfy BranchName brand
       takesBranchName('feature/foo');
       // @ts-expect-error — raw string cannot satisfy PrTitle brand
       takesPrTitle('My PR');
       // @ts-expect-error — raw string cannot satisfy PrBody brand
       takesPrBody('Body text');

       describe("brand contract", () => {
         it("type-level errors above prove brands reject raw strings", () => {
           assert.ok(true);
         });
       });
       ```
       The `@ts-expect-error` comments are the test — TypeScript compilation fails if a comment is unused (i.e., the line actually does compile cleanly), which would mean the brand is broken.
    2. Modify `packages/delivery/src/delivery-contract.ts`:
       - Remove the `command: ["gh", "pr", "create", ...]` argv field from `GitHubPrDeliveryPlan` interface.
       - Remove any logic in `createGitHubPrDeliveryPlan` (or the legacy helper) that produces that argv.
       - Replace with a typed `branch: BranchName; title: PrTitle; body: PrBody; target: { owner; repo; baseBranch }` shape (the `executeDelivery` plan input).
       - Keep the `DeliveryAuthorization` first-arg pin from Plan 05-13.
       - If there are downstream callers in `apps/factory-cli/src/main.ts` that rely on the old shape, leave a deprecated stub that throws `new Error("argv path removed in Phase 7 Q-02; use executeDelivery from @protostar/delivery-runtime")`. Wave 5 (07-11) replaces the call site.
    3. Update `packages/delivery/src/index.ts` barrel to re-export brands, refusals, marker constants, and the updated contract. Remove any `gh pr create` re-export.
    4. Verify the existing `packages/delivery/src/index.ts` `createPrBody` legacy function — if it's still used by tests, leave it for the moment; Plan 07-05 (PR body composers) is the explicit replacement. Mark it `@deprecated` with a JSDoc citing 07-05.
    5. Run `pnpm --filter @protostar/delivery test`. The `@ts-expect-error` test passes only if TypeScript actually rejects the raw strings.
    6. Run `grep -rn "gh pr create" packages/delivery/src/` — must return zero matches (Q-02 enforcement).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery test && (grep -rn "gh pr create" packages/delivery/src/ | wc -l | awk '{ if ($1 != 0) { print "FAIL: gh pr create still in delivery src"; exit 1 } else print "ok: no gh argv" }')</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rn "gh pr create" packages/delivery/src/` returns zero lines (Q-02)
    - `grep -c '@ts-expect-error' packages/delivery/src/brand-rejects-raw-string.contract.test.ts` ≥ 3 (one per brand)
    - `pnpm --filter @protostar/delivery test` passes (including the `@ts-expect-error` contract — TypeScript fails the test if any expect-error comment is unused)
    - `grep -c 'DeliveryAuthorization' packages/delivery/src/delivery-contract.ts` ≥ 1 (Plan 05-13 pin preserved)
    - Barrel `packages/delivery/src/index.ts` re-exports `validateBranchName`, `validatePrTitle`, `validatePrBody`, `BranchName`, `PrTitle`, `PrBody`, `DeliveryRefusal`, `buildEvidenceMarker`, `parseEvidenceMarker` (verify with grep)
  </acceptance_criteria>
  <done>Type-level brand-rejection contract green; gh argv path removed; barrel exports the new surface.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| caller → executeDelivery | Brands are the compile-time + runtime gate. |
| operator → comment marker | runId-extended marker prevents Pitfall 9 collision. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-04-01 | Tampering | brands.ts | mitigate | unique-symbol brands prevent string forgery; validators are pure + deterministic. |
| T-07-04-02 | Tampering | refusals.ts | mitigate | discriminated union forces exhaustive handling; assertExhaustive helper at consumer sites. |
| T-07-04-03 | Tampering | evidence-marker.ts | mitigate | runId suffix in marker prevents reviewer-typed collision (Pitfall 9). |
| T-07-04-04 | Elevation of Privilege | delivery-contract.ts | mitigate | gh argv removed (Q-02); only DeliveryAuthorization-gated executeDelivery path remains. |
| T-07-04-05 | Information Disclosure | brands.ts validatePrBody | mitigate | byte-length cap (Pitfall 3) + control-char rejection (Q-09); never silent strip. |
</threat_model>

<verification>
- `pnpm --filter @protostar/delivery test`
- `grep -rn "gh pr create" packages/delivery/` → zero matches
- `pnpm --filter @protostar/delivery build`
</verification>

<success_criteria>
- 3 brands + 3 validators + 14-variant refusal union exported
- Token regex covers both classic and fine-grained PATs (Pitfall 2)
- Body cap measured in bytes (Pitfall 3)
- Marker pattern includes runId (Pitfall 9)
- gh argv path removed (Q-02)
- @ts-expect-error contract test green (raw strings rejected at compile time)
</success_criteria>

<output>
Create `.planning/phases/07-delivery/07-04-SUMMARY.md` summarizing the brand+refusal+marker surface and noting that gh argv path is now permanently gone.
</output>
