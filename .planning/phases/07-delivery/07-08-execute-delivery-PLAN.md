---
phase: 07-delivery
plan: 08
type: execute
wave: 3
depends_on: ["07-04", "07-06", "07-07"]
files_modified:
  - packages/delivery-runtime/src/find-existing-pr.ts
  - packages/delivery-runtime/src/find-existing-pr.test.ts
  - packages/delivery-runtime/src/post-evidence-comment.ts
  - packages/delivery-runtime/src/post-evidence-comment.test.ts
  - packages/delivery-runtime/src/execute-delivery.ts
  - packages/delivery-runtime/src/execute-delivery.test.ts
  - packages/delivery-runtime/src/execute-delivery.contract.test.ts
  - packages/delivery-runtime/src/idempotency.contract.test.ts
  - packages/delivery-runtime/src/secret-leak.contract.test.ts
  - packages/delivery-runtime/src/index.ts
autonomous: true
requirements: [DELIVER-01, DELIVER-02, DELIVER-03, DELIVER-07]
must_haves:
  truths:
    - "executeDelivery requires DeliveryAuthorization (Phase 5 brand) AND BranchName/PrTitle/PrBody (Phase 7 brands) at compile time — type-level test asserts raw strings rejected"
    - "findExistingPr uses pulls.list({ head: 'owner:branch', state: 'all' }) and returns null | open-PR | closed-PR | ambiguous"
    - "Evidence comments are posted with runId-extended marker; idempotent re-delivery updates by marker (Q-18 + Pitfall 9)"
    - "executeDelivery returns AFTER PR-created + first CI snapshot (Q-16 two-step) — does not block on CI completion"
    - "Idempotency contract test: re-running executeDelivery with same runId produces 1 PR + N comments (NOT 2 PRs or 2N comments)"
    - "Secret-leak contract test: simulated full delivery with fake token; recursive grep of test runDir for the token returns zero matches"
    - "Comment-failure does not block delivery (Q-10): commentFailures recorded but executeDelivery still returns 'delivered'"
  artifacts:
    - path: packages/delivery-runtime/src/execute-delivery.ts
      provides: "I/O entry seam — 5-brand stack, push + PR create + initial CI snapshot + comments"
      exports: ["executeDelivery"]
    - path: packages/delivery-runtime/src/find-existing-pr.ts
      provides: "Q-18 idempotency probe"
      exports: ["findExistingPr"]
    - path: packages/delivery-runtime/src/post-evidence-comment.ts
      provides: "Marker-tagged comment create-or-update"
      exports: ["postEvidenceComment"]
    - path: packages/delivery-runtime/src/idempotency.contract.test.ts
      provides: "Re-delivery yields 1 PR, N comments (not 2N)"
    - path: packages/delivery-runtime/src/secret-leak.contract.test.ts
      provides: "Token never leaks into runDir artifacts"
  key_links:
    - from: packages/delivery-runtime/src/execute-delivery.ts
      to: packages/delivery-runtime/src/push-branch.ts
      via: "Push step (Plan 07-07)"
      pattern: "pushBranch"
    - from: packages/delivery-runtime/src/execute-delivery.ts
      to: packages/delivery/src/brands.ts
      via: "Compile-time brand-typed plan"
      pattern: "BranchName|PrTitle|PrBody"
    - from: packages/delivery-runtime/src/post-evidence-comment.ts
      to: packages/delivery/src/evidence-marker.ts
      via: "Marker prefix lookup for find-by-marker"
      pattern: "buildEvidenceMarker|parseEvidenceMarker"
---

<objective>
Land the I/O entry seam for Phase 7: `executeDelivery` (5-brand stack, push + PR create + comments + initial CI snapshot — Q-16 two-step), the idempotency probe `findExistingPr` (Q-18), and the marker-tagged `postEvidenceComment` (Q-10 + Pitfall 9). Land THREE contract tests in this plan because they ALL require executeDelivery to exist:
1. **brand contract** (`execute-delivery.contract.test.ts`) — `@ts-expect-error` raw strings fail to compile
2. **idempotency contract** — re-delivery yields 1 PR + N comments
3. **secret-leak contract** — simulate full delivery; grep runDir for fake token; assert zero matches

Per CONTEXT Q-16: executeDelivery returns AFTER PR-created + first-snapshot — it does NOT block on CI completion. Polling continuation is Plan 07-09's responsibility.

Purpose: Q-08 (brand-typed entry), Q-10 (comments), Q-16 (two-step), Q-18 (idempotency), Q-19 (cancellation), DELIVER-01..03 + 07.
Output: I/O entry + 3 contract tests + 2 unit-tested helpers.
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
@packages/delivery/src/brands.ts
@packages/delivery/src/refusals.ts
@packages/delivery/src/evidence-marker.ts
@packages/review/src/delivery-authorization.ts
@packages/delivery-runtime/src/push-branch.ts
@packages/delivery-runtime/src/preflight-full.ts
@packages/delivery-runtime/src/octokit-client.ts
@packages/delivery-runtime/src/map-octokit-error.ts

<interfaces>
<!-- executeDelivery (Q-08 5-brand stack + Q-16 two-step) -->

```typescript
import type { DeliveryAuthorization } from "@protostar/review";
import type { BranchName, PrTitle, PrBody, DeliveryRefusal } from "@protostar/delivery";
import type { StageArtifactRef } from "@protostar/artifacts";
import type { ProtostarOctokit } from "./octokit-client.js";
import type { DeliveryTarget } from "./preflight-full.js";

export interface DeliveryExecutionPlan {
  readonly branch: BranchName;
  readonly title: PrTitle;
  readonly body: PrBody;
  readonly target: DeliveryTarget;
  readonly artifacts: readonly StageArtifactRef[];
  readonly evidenceComments: readonly { kind: 'mechanical-full' | 'judge-transcripts' | 'repair-history' | 'oversized-body-overflow'; body: PrBody }[];
}

export interface DeliveryRunContext {
  readonly runId: string;
  readonly token: string;
  readonly signal: AbortSignal;
  readonly fs: unknown;     // injected from factory-cli
  readonly octokit: ProtostarOctokit;
  readonly remoteUrl: string;
  readonly workspaceDir: string;
  readonly expectedRemoteSha: string | null;
}

export type DeliveryRunOutcome =
  | {
      readonly status: 'delivered';
      readonly prUrl: string;
      readonly prNumber: number;
      readonly headSha: string;
      readonly baseSha: string;
      readonly initialCiSnapshot: { at: string; checks: readonly { name: string; status: string; conclusion: string | null }[] };
      readonly evidenceComments: readonly { kind: string; commentId: number; url: string }[];
      readonly commentFailures: readonly { kind: string; reason: string }[];
    }
  | {
      readonly status: 'delivery-blocked';
      readonly refusal: DeliveryRefusal;
    };

export async function executeDelivery(
  authorization: DeliveryAuthorization,
  plan: DeliveryExecutionPlan,
  ctx: DeliveryRunContext
): Promise<DeliveryRunOutcome>;
```

<!-- findExistingPr (Q-18) -->

```typescript
export async function findExistingPr(
  target: DeliveryTarget,
  branch: BranchName,
  octokit: ProtostarOctokit,
  signal: AbortSignal
): Promise<
  | { readonly state: 'none' }
  | { readonly state: 'open'; readonly prUrl: string; readonly prNumber: number; readonly headSha: string }
  | { readonly state: 'closed'; readonly prUrl: string; readonly prNumber: number }
  | { readonly state: 'ambiguous'; readonly prUrls: readonly string[] }
>;
```

<!-- postEvidenceComment (Q-10 + Pitfall 9) -->

```typescript
export async function postEvidenceComment(input: {
  readonly target: DeliveryTarget;
  readonly prNumber: number;
  readonly runId: string;
  readonly kind: 'mechanical-full' | 'judge-transcripts' | 'repair-history' | 'oversized-body-overflow';
  readonly body: PrBody;
  readonly octokit: ProtostarOctokit;
  readonly signal: AbortSignal;
}): Promise<
  | { readonly ok: true; readonly commentId: number; readonly url: string }
  | { readonly ok: false; readonly reason: string }
>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: findExistingPr + postEvidenceComment (idempotency primitives)</name>
  <read_first>
    - .planning/phases/07-delivery/07-CONTEXT.md Q-18 (idempotency) + Q-10 (comments)
    - .planning/phases/07-delivery/07-RESEARCH.md §"Idempotency: find existing PR by head branch" (verbatim Octokit call)
    - packages/delivery/src/evidence-marker.ts (buildEvidenceMarker / parseEvidenceMarker from Plan 07-04)
    - .planning/phases/07-delivery/07-RESEARCH.md §"Pitfall 9: Comment-marker collision risk" (runId in marker)
  </read_first>
  <behavior>
    - findExistingPr:
      - `octokit.rest.pulls.list({ owner: target.owner, repo: target.repo, head: \`${target.owner}:${branch}\`, state: 'all', per_page: 10, request: { signal } })`
      - 0 results → `{ state: 'none' }`
      - 1 result, open → `{ state: 'open', prUrl, prNumber, headSha }`
      - 1 result, closed → `{ state: 'closed', prUrl, prNumber }`
      - 2+ results → `{ state: 'ambiguous', prUrls: [...] }`
    - postEvidenceComment:
      - Build marker: `buildEvidenceMarker(kind, runId)` → `<!-- protostar-evidence:{kind}:{runId} -->`
      - Octokit `issues.listComments({ owner, repo, issue_number: prNumber, request: { signal } })` (use `.iterator` for pagination per RESEARCH Open Question 5)
      - For each comment, check `body.startsWith(marker)` — if found, `issues.updateComment` to update; else `issues.createComment` with marker prepended
      - Comment body wrapper: `${marker}\n\n${body}` (marker on its own line)
      - On failure (network, 422), return `{ ok: false, reason }`
    - Tests via nock:
      - findExistingPr: 0/1-open/1-closed/2+ scenarios
      - postEvidenceComment: create new, update existing, find-by-marker matches only same-kind+runId
      - postEvidenceComment with reviewer-typed comment containing partial marker (Pitfall 9 — runId mismatch) → does NOT update reviewer's comment
  </behavior>
  <files>packages/delivery-runtime/src/find-existing-pr.ts, packages/delivery-runtime/src/find-existing-pr.test.ts, packages/delivery-runtime/src/post-evidence-comment.ts, packages/delivery-runtime/src/post-evidence-comment.test.ts</files>
  <action>
    1. **RED:** Tests for both modules.
    2. **GREEN:** Implement both per `<interfaces>`. For postEvidenceComment, use `octokit.paginate.iterator(octokit.rest.issues.listComments, { owner, repo, issue_number, request: { signal } })` to handle PRs with many comments.
    3. The marker check: parse the comment body's first non-empty line via `parseEvidenceMarker`; only match if `kind === input.kind && runId === input.runId`.
    4. **REFACTOR:** Extract a tiny helper `findCommentByMarker(comments, kind, runId)` for testability.
    5. Re-export both from barrel.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run find-existing-pr && pnpm --filter @protostar/delivery-runtime test --run post-evidence-comment</automated>
  </verify>
  <acceptance_criteria>
    - 4+ findExistingPr cases green
    - 4+ postEvidenceComment cases green (create, update, reviewer-typed-collision-resistant, runId mismatch)
    - `grep -c "head: " packages/delivery-runtime/src/find-existing-pr.ts` ≥ 1 (owner:branch filter form)
    - `grep -c "parseEvidenceMarker\|buildEvidenceMarker" packages/delivery-runtime/src/post-evidence-comment.ts` ≥ 1
    - Both exported from barrel
  </acceptance_criteria>
  <done>Idempotency primitives green; runId-marker prevents collision.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: executeDelivery — push + findExistingPr + PR create-or-update + comments + initial CI snapshot</name>
  <read_first>
    - .planning/phases/07-delivery/07-CONTEXT.md Q-16 (two-step), Q-18 (idempotency), Q-08 (brand stack)
    - .planning/phases/07-delivery/07-RESEARCH.md §"Pattern 1: Branded I/O Entry" (verbatim signature)
    - packages/delivery-runtime/src/push-branch.ts (Plan 07-07)
    - packages/delivery-runtime/src/preflight-full.ts (Plan 07-06)
  </read_first>
  <behavior>
    - executeDelivery sequence:
      1. Pre-check: `ctx.signal.aborted` → return delivery-blocked refusal cancelled
      2. **Push:** call `pushBranch({ workspaceDir, branchName: plan.branch, remoteUrl, token, expectedRemoteSha, signal, fs })`. On refusal → return delivery-blocked.
      3. **Idempotency:** `findExistingPr(target, branch, octokit, signal)`:
         - state 'closed' → return delivery-blocked refusal `pr-already-closed`
         - state 'ambiguous' → return delivery-blocked refusal `pr-ambiguous`
         - state 'open' → reuse: `pulls.update({ pull_number, body: plan.body })`; capture prNumber + prUrl + headSha
         - state 'none' → `pulls.create({ owner, repo, head: branch, base: target.baseBranch, title: plan.title, body: plan.body })`; capture prNumber + prUrl + headSha
      4. **Comments:** for each `plan.evidenceComments` entry, call `postEvidenceComment` serially (deterministic ordering: mechanical-full → judge-transcripts → repair-history → oversized-body-overflow). Collect successes/failures. Failures DO NOT block.
      5. **Initial CI snapshot:** `octokit.rest.checks.listForRef({ owner, repo, ref: headSha, signal })` once. Capture `{ at, checks }`.
      6. Return `{ status: 'delivered', prUrl, prNumber, headSha, baseSha, initialCiSnapshot, evidenceComments, commentFailures }`.
    - Errors at any step → wrapped via `mapOctokitErrorToRefusal` → `delivery-blocked`.
    - Q-16 two-step: NEVER awaits CI terminal verdict; that's pollCiStatus's job (Plan 07-09).
    - Token never appears in returned outcome (returned object passed through JSON.stringify in tests; no token leakage).
    - Tests:
      - Happy path: nock fixture with successful push (mocked), findExistingPr none, pulls.create 200, 4 comments succeed, initial snapshot
      - Re-delivery (idempotent open PR): findExistingPr returns open → pulls.update path
      - pr-already-closed: findExistingPr returns closed → delivery-blocked
      - Comment failure: 1 comment 422 → delivery still returns 'delivered' with `commentFailures: [{ kind, reason }]`
      - Push refusal: pushBranch returns remote-diverged → delivery-blocked
  </behavior>
  <files>packages/delivery-runtime/src/execute-delivery.ts, packages/delivery-runtime/src/execute-delivery.test.ts, packages/delivery-runtime/src/execute-delivery.contract.test.ts</files>
  <action>
    1. **RED:** Write `execute-delivery.test.ts` with 5+ scenarios using nock. Use `@protostar/repo`'s sacrificial repo fixture for the workspace + a synthetic remote. Mock pushBranch (or use the real one against the bare repo).
    2. **GREEN:** Implement executeDelivery per `<behavior>`. Use the brand-typed signature from `<interfaces>`. Each Octokit call passes `request: { signal: ctx.signal }` for hierarchical abort.
    3. **CONTRACT TEST** (`execute-delivery.contract.test.ts`):
       ```typescript
       import { describe, it } from "node:test";
       import assert from "node:assert/strict";
       import type { executeDelivery } from "./execute-delivery.js";

       describe("executeDelivery — brand-typed entry", () => {
         it("compile-time rejects raw strings (5-brand stack)", () => {
           // The @ts-expect-error lines below are the test:
           const declaredFn = (null as unknown) as typeof executeDelivery;
           const stubAuth = (null as unknown) as Parameters<typeof executeDelivery>[0];
           const stubCtx = (null as unknown) as Parameters<typeof executeDelivery>[2];
           // @ts-expect-error — raw string rejected for branch
           declaredFn(stubAuth, { branch: 'foo', title: 't' as never, body: 'b' as never, target: {} as never, artifacts: [], evidenceComments: [] }, stubCtx);
           // @ts-expect-error — raw string rejected for title
           declaredFn(stubAuth, { branch: 'b' as never, title: 'foo', body: 'b' as never, target: {} as never, artifacts: [], evidenceComments: [] }, stubCtx);
           // @ts-expect-error — raw string rejected for body
           declaredFn(stubAuth, { branch: 'b' as never, title: 't' as never, body: 'foo', target: {} as never, artifacts: [], evidenceComments: [] }, stubCtx);
           assert.ok(true);
         });
       });
       ```
       The 3 `@ts-expect-error` lines are the test — TS compilation fails if any line compiles cleanly.
    4. **REFACTOR:** Re-export from barrel.
    5. The function is the longest in delivery-runtime; keep it under 150 lines by extracting `pushStep`, `prCreateOrUpdateStep`, `commentsStep`, `initialSnapshotStep` as private helpers in the same file.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run execute-delivery</automated>
  </verify>
  <acceptance_criteria>
    - 5+ scenarios green (happy, idempotent-open, closed, comment-failure, push-refusal)
    - 3 `@ts-expect-error` lines in execute-delivery.contract.test.ts
    - `grep -c "DeliveryAuthorization" packages/delivery-runtime/src/execute-delivery.ts` ≥ 1
    - `grep -c "BranchName" packages/delivery-runtime/src/execute-delivery.ts` ≥ 1
    - `grep -c "request: { signal" packages/delivery-runtime/src/execute-delivery.ts` ≥ 4 (every Octokit call signal-threaded)
    - `grep -c "pulls.merge\|enableAutoMerge" packages/delivery-runtime/src/execute-delivery.ts` returns zero (no-merge contract preserved)
    - executeDelivery exported from barrel
  </acceptance_criteria>
  <done>executeDelivery green across 5+ scenarios; brand contract pinned.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Idempotency + secret-leak contract tests</name>
  <read_first>
    - .planning/phases/07-delivery/07-VALIDATION.md Required Contract Tests #5 + #7
    - .planning/phases/07-delivery/07-RESEARCH.md §"Pitfall 4" (token redaction)
    - packages/delivery-runtime/src/execute-delivery.ts (just landed in Task 2)
    - packages/delivery-runtime/src/post-evidence-comment.ts (Task 1)
  </read_first>
  <behavior>
    - **Idempotency contract:**
      1. Set up nock with: pushBranch happy → findExistingPr=none → pulls.create 200 → 4 issues.createComment 200 → initial checks.listForRef 200
      2. Run executeDelivery once; assert delivered, 4 comments created
      3. Reset nock with NEW expected sequence: pushBranch happy (re-push) → findExistingPr=open (returns the PR we just created) → pulls.update 200 → 4 issues.listComments returning the 4 existing comments → 4 issues.updateComment 200 (no createComment expected)
      4. Run executeDelivery AGAIN with same plan + same runId
      5. Assert: result.evidenceComments has 4 entries (NOT 8), result.status='delivered'
      6. Assert via nock that NO `issues.createComment` was called the second time (`scope.isDone()` confirms only updateComment was hit)
    - **Secret-leak contract:**
      1. Set token to a known fake value: `const FAKE_TOKEN = "ghp_FAKETESTTOKENFOR0070008TEST123456ABCD"` (40 chars, matches classic regex)
      2. Build a tmpDir runDir for the test
      3. Run executeDelivery with this token + the synthetic plan (use nock to fail at preflight-full to maximize error paths)
      4. After: recursively walk tmpDir; for every file, read its content; assert no occurrence of the FAKE_TOKEN substring
      5. Also assert: any error/refusal returned in DeliveryRunOutcome serialized to JSON does NOT contain FAKE_TOKEN
      6. Use nock fixtures that include an `Authorization: Bearer ghp_…` header in the simulated request data — verify mapOctokitErrorToRefusal stripped it
  </behavior>
  <files>packages/delivery-runtime/src/idempotency.contract.test.ts, packages/delivery-runtime/src/secret-leak.contract.test.ts</files>
  <action>
    1. **RED:** Write both contract tests. Both will fail until executeDelivery + helpers handle the cases.
    2. **GREEN:** Implement the contract tests. The idempotency test verifies the find-by-marker logic is end-to-end correct. The secret-leak test verifies all redaction paths.
    3. For the secret-leak test, the recursive walk uses `node:fs/promises.readdir({ recursive: true, withFileTypes: true })` (Node 22 native). Test files MAY import fs (per the no-fs.contract.test.ts exclusion of `*.test.ts` files added in Plan 07-07's refinement).
    4. The fake token MUST match a real PAT regex so it doesn't get rejected at fast-preflight before reaching any redaction path. Use exactly 40 chars (`ghp_` + 36 chars).
    5. **REFACTOR:** Extract a shared test helper `walkAndGrep(dir, needle): Promise<string[]>` if useful across both contracts.
    6. Both tests run under `nock.disableNetConnect()` to ensure no real HTTP escapes.
    7. After running tests, the tmp runDir is cleaned up via `t.after`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run idempotency.contract && pnpm --filter @protostar/delivery-runtime test --run secret-leak.contract</automated>
  </verify>
  <acceptance_criteria>
    - Idempotency test asserts 4 comments after second delivery (not 8) — counts match input
    - Idempotency test asserts `issues.createComment` was NOT called on second delivery (only updateComment)
    - Secret-leak test asserts zero `FAKE_TOKEN` matches in any file under tmpDir
    - Secret-leak test asserts zero `FAKE_TOKEN` matches in JSON-stringified DeliveryRunOutcome
    - Both tests use `nock.disableNetConnect()`
    - Tests run in isolation (cleanAll between)
  </acceptance_criteria>
  <done>Both contract tests green; idempotency + secret-leak invariants pinned.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| factory-cli → executeDelivery | Plan + ctx supplied; brands gate compile time. |
| executeDelivery → GitHub | Octokit + isomorphic-git push (token never leaked). |
| Re-delivery → existing PR | Marker-tagged comments updated, not duplicated (Q-18 + Pitfall 9). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-08-01 | Tampering | execute-delivery.ts | mitigate | 5-brand stack rejects raw strings at compile + runtime. |
| T-07-08-02 | Information Disclosure | execute-delivery.ts | mitigate | secret-leak contract + mapOctokitErrorToRefusal redaction. |
| T-07-08-03 | Tampering | post-evidence-comment.ts | mitigate | runId-extended marker prevents reviewer-typed collision (Pitfall 9). |
| T-07-08-04 | Spoofing | findExistingPr | mitigate | Closed PR triggers refusal (Q-18: operator-triaged signal). |
| T-07-08-05 | Elevation of Privilege | execute-delivery.ts | mitigate | DeliveryAuthorization brand (Phase 5) gates entry; no-merge contract preserved. |
</threat_model>

<verification>
- `pnpm --filter @protostar/delivery-runtime test`
- All Wave 0 contracts (no-fs, no-merge) still green
- Brand contract test green
- Idempotency contract green
- Secret-leak contract green
</verification>

<success_criteria>
- executeDelivery returns after PR-created + first-snapshot (Q-16 two-step)
- Idempotent re-delivery: 1 PR, N comments
- Secret never leaks (contract enforced)
- Comment failures don't block delivery (Q-10)
- 5-brand stack pinned at compile time
</success_criteria>

<output>
Create `.planning/phases/07-delivery/07-08-SUMMARY.md` documenting executeDelivery's two-step semantics, the idempotency invariant, and the secret-leak contract pass.
</output>
