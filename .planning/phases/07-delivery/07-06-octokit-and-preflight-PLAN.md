---
phase: 07-delivery
plan: 06
type: execute
wave: 2
depends_on: ["07-02", "07-04"]
files_modified:
  - packages/delivery-runtime/src/octokit-client.ts
  - packages/delivery-runtime/src/octokit-client.test.ts
  - packages/delivery-runtime/src/preflight-fast.ts
  - packages/delivery-runtime/src/preflight-fast.test.ts
  - packages/delivery-runtime/src/preflight-full.ts
  - packages/delivery-runtime/src/preflight-full.test.ts
  - packages/delivery-runtime/src/map-octokit-error.ts
  - packages/delivery-runtime/src/map-octokit-error.test.ts
  - packages/delivery-runtime/src/index.ts
autonomous: true
requirements: [DELIVER-01]
must_haves:
  truths:
    - "buildOctokit composes @octokit/plugin-retry + @octokit/plugin-throttling with safe defaults (no retry on 4xx, no retry on secondary rate-limit)"
    - "preflightDeliveryFast returns { outcome: 'ok' | 'token-missing' | 'token-invalid' } from env-only checks (Q-06 fast path)"
    - "preflightDeliveryFull returns 6 outcomes including 'excessive-pat-scope' (Q-06 + Q-20)"
    - "mapOctokitErrorToRefusal strips authorization headers and any /auth|token|cookie/i header before persisting evidence (Pitfall 4)"
    - "Token format helper rejects neither classic nor fine-grained PATs (Pitfall 2 union)"
  artifacts:
    - path: packages/delivery-runtime/src/octokit-client.ts
      provides: "Octokit factory with retry+throttling plugins"
      exports: ["buildOctokit"]
    - path: packages/delivery-runtime/src/preflight-fast.ts
      provides: "Env-only token preflight"
      exports: ["preflightDeliveryFast"]
    - path: packages/delivery-runtime/src/preflight-full.ts
      provides: "Octokit-backed full preflight"
      exports: ["preflightDeliveryFull"]
    - path: packages/delivery-runtime/src/map-octokit-error.ts
      provides: "Error → DeliveryRefusal classifier with token redaction"
      exports: ["mapOctokitErrorToRefusal"]
  key_links:
    - from: packages/delivery-runtime/src/preflight-full.ts
      to: packages/delivery-runtime/src/octokit-client.ts
      via: "Receives Octokit instance via injection"
      pattern: "octokit:"
    - from: packages/delivery-runtime/src/map-octokit-error.ts
      to: packages/delivery/src/refusals.ts
      via: "Returns DeliveryRefusal discriminator"
      pattern: "DeliveryRefusal"
---

<objective>
Land the four network-tier primitives that gate every Octokit call in Phase 7: the Octokit client factory (with retry + throttling plugins), the fast preflight (env-only token check), the full preflight (6 Octokit-backed outcomes per Q-06 + Q-20), and the error classifier (Pitfall 4 token redaction). Wave 3's `executeDelivery` and Wave 5's factory-cli wiring depend on all four.

Purpose: Q-06 + Q-20 + Pitfall 2 + Pitfall 4 — preflight discipline + safe Octokit construction + error redaction in one cohesive plan.
Output: Network primitives pure-injectable; nock-driven tests cover all 6 preflight outcomes.
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
@packages/delivery/src/refusals.ts
@packages/delivery/src/brands.ts
@packages/lmstudio-adapter/src/preflight.ts
@packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.ts

<interfaces>
<!-- Octokit client construction (RESEARCH §"Octokit client construction with retry + throttling") -->

```typescript
import { Octokit } from "@octokit/rest";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";

export type ProtostarOctokit = InstanceType<ReturnType<typeof Octokit.plugin<typeof retry, typeof throttling>>>;

export function buildOctokit(token: string, options?: { userAgent?: string }): ProtostarOctokit;
```

<!-- preflightDeliveryFast (Q-06 fast path) -->

```typescript
export type FastPreflightResult =
  | { readonly outcome: 'ok'; readonly tokenSource: 'env' }
  | { readonly outcome: 'token-missing' }
  | { readonly outcome: 'token-invalid'; readonly reason: 'format' };

export function preflightDeliveryFast(env: NodeJS.ProcessEnv): FastPreflightResult;
```

<!-- preflightDeliveryFull (Q-06 full path + Q-20 scope check) -->

```typescript
import type { ProtostarOctokit } from "./octokit-client.js";

export interface DeliveryTarget {
  readonly owner: string;
  readonly repo: string;
  readonly baseBranch: string;
}

export type FullPreflightResult =
  | { readonly outcome: 'ok'; readonly tokenLogin: string; readonly baseSha: string; readonly tokenScopes: readonly string[] }
  | { readonly outcome: 'token-invalid'; readonly reason: 'format' | '401' }
  | { readonly outcome: 'repo-inaccessible'; readonly status: 403 | 404 }
  | { readonly outcome: 'base-branch-missing'; readonly baseBranch: string }
  | { readonly outcome: 'excessive-pat-scope'; readonly scopes: readonly string[]; readonly forbidden: readonly string[] };

export async function preflightDeliveryFull(
  input: { readonly token: string; readonly target: DeliveryTarget; readonly signal: AbortSignal },
  octokit: ProtostarOctokit
): Promise<FullPreflightResult>;
```

<!-- mapOctokitErrorToRefusal -->

```typescript
import type { DeliveryRefusal } from "@protostar/delivery";

export function mapOctokitErrorToRefusal(
  err: unknown,
  context: { readonly phase: 'preflight' | 'push' | 'pr-create' | 'comment' | 'poll'; readonly target?: DeliveryTarget }
): DeliveryRefusal;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: buildOctokit factory + preflightDeliveryFast (env-only)</name>
  <read_first>
    - .planning/phases/07-delivery/07-RESEARCH.md §"Octokit client construction with retry + throttling" (verbatim safe defaults)
    - packages/delivery/src/brands.ts (for `isValidGitHubTokenFormat` — both PAT formats)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-06 (fast preflight: token presence + format)
  </read_first>
  <behavior>
    - buildOctokit(token, options?):
      - Composes Octokit.plugin(retry, throttling)
      - retry: doNotRetry: [400, 401, 403, 404, 422] (hard refusals never retry)
      - throttle.onRateLimit: retry up to 2x (returning true twice, false thereafter)
      - throttle.onSecondaryRateLimit: always returns false (no retry on abuse)
      - userAgent default: "protostar-factory/0.0.0"
      - Returns the typed instance
    - preflightDeliveryFast(env):
      - env.PROTOSTAR_GITHUB_TOKEN missing or empty string → { outcome: 'token-missing' }
      - Token present but doesn't match classic OR fine-grained regex → { outcome: 'token-invalid', reason: 'format' }
      - Otherwise → { outcome: 'ok', tokenSource: 'env' }
      - PURE: only reads from input env; no I/O
    - Tests:
      - buildOctokit returns instance with `auth` configured
      - throttle/retry plugins are present (test the composition by checking Octokit.plugin chain)
      - preflightDeliveryFast: 4 cases (missing, empty, invalid-format, valid-classic, valid-fine-grained = 5 total)
  </behavior>
  <files>packages/delivery-runtime/src/octokit-client.ts, packages/delivery-runtime/src/octokit-client.test.ts, packages/delivery-runtime/src/preflight-fast.ts, packages/delivery-runtime/src/preflight-fast.test.ts</files>
  <action>
    1. **RED:** Write `octokit-client.test.ts` and `preflight-fast.test.ts` per the behavior. Run; tests fail.
    2. **GREEN:** Implement `octokit-client.ts`:
       ```typescript
       import { Octokit } from "@octokit/rest";
       import { retry } from "@octokit/plugin-retry";
       import { throttling } from "@octokit/plugin-throttling";

       const ProtostarOctokitClass = Octokit.plugin(retry, throttling);
       export type ProtostarOctokit = InstanceType<typeof ProtostarOctokitClass>;

       export function buildOctokit(token: string, options?: { userAgent?: string }): ProtostarOctokit {
         return new ProtostarOctokitClass({
           auth: token,
           userAgent: options?.userAgent ?? "protostar-factory/0.0.0",
           throttle: {
             onRateLimit: (_retryAfter, _options, _octokit, retryCount) => retryCount < 2,
             onSecondaryRateLimit: () => false
           },
           retry: { doNotRetry: [400, 401, 403, 404, 422] }
         });
       }
       ```
    3. Implement `preflight-fast.ts`:
       ```typescript
       import { isValidGitHubTokenFormat } from "@protostar/delivery";

       export type FastPreflightResult =
         | { readonly outcome: 'ok'; readonly tokenSource: 'env' }
         | { readonly outcome: 'token-missing' }
         | { readonly outcome: 'token-invalid'; readonly reason: 'format' };

       export function preflightDeliveryFast(env: NodeJS.ProcessEnv): FastPreflightResult {
         const token = env['PROTOSTAR_GITHUB_TOKEN'];
         if (token === undefined || token.length === 0) return { outcome: 'token-missing' };
         if (!isValidGitHubTokenFormat(token)) return { outcome: 'token-invalid', reason: 'format' };
         return { outcome: 'ok', tokenSource: 'env' };
       }
       ```
    4. **REFACTOR:** Add comments citing Q-06, Pitfall 2 (fine-grained PATs), and the safe-defaults rationale.
    5. octokit-client.ts MUST NOT import `node:fs` or `node:fs/promises` — verify static no-fs contract still passes.
    6. preflight-fast.ts MUST NOT make any HTTP calls — pure env read.
    7. The `isValidGitHubTokenFormat` import comes from `@protostar/delivery` (Plan 07-04). If Plan 07-04 hasn't landed at execution time, depend on its merge first (this plan's `depends_on: [07-04]`).
    8. Run tests; all green. Re-run no-fs.contract.test.ts to confirm no fs imports leaked.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run octokit-client && pnpm --filter @protostar/delivery-runtime test --run preflight-fast && pnpm --filter @protostar/delivery-runtime test --run no-fs.contract</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '@octokit/plugin-retry' packages/delivery-runtime/src/octokit-client.ts` ≥ 1
    - `grep -c '@octokit/plugin-throttling' packages/delivery-runtime/src/octokit-client.ts` ≥ 1
    - `grep -c 'doNotRetry' packages/delivery-runtime/src/octokit-client.ts` ≥ 1
    - `grep -c 'onSecondaryRateLimit' packages/delivery-runtime/src/octokit-client.ts` ≥ 1
    - `grep -c 'isValidGitHubTokenFormat' packages/delivery-runtime/src/preflight-fast.ts` ≥ 1
    - 5 preflight-fast test cases green
    - no-fs.contract.test.ts still green (zero fs imports introduced)
  </acceptance_criteria>
  <done>buildOctokit + preflightDeliveryFast green; no-fs contract preserved.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: preflightDeliveryFull with 6 outcomes (Q-06 + Q-20 scope check)</name>
  <read_first>
    - .planning/phases/07-delivery/07-RESEARCH.md §"Delivery preflight (full)" (verbatim implementation)
    - .planning/phases/07-delivery/07-RESEARCH.md §"Pitfall 4: Octokit does NOT redact tokens" (mapOctokitErrorToRefusal preview — full implementation in Task 3)
    - packages/lmstudio-adapter/src/preflight.ts (Pattern S-3 template)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-20 (FORBIDDEN_SCOPES list)
  </read_first>
  <behavior>
    - preflightDeliveryFull calls Octokit in sequence:
      1. `users.getAuthenticated` — 401 → 'token-invalid' (reason: '401')
      2. Read `X-OAuth-Scopes` header from response; if any in FORBIDDEN_SCOPES → 'excessive-pat-scope'
      3. `repos.get(owner, repo)` — 403/404 → 'repo-inaccessible'
      4. `repos.getBranch(owner, repo, baseBranch)` — 404 → 'base-branch-missing'
      5. All ok → return tokenLogin, baseSha, tokenScopes
    - Each Octokit call passes `request: { signal: input.signal }` (Q-19 hierarchical abort)
    - FORBIDDEN_SCOPES = `['admin:org', 'admin:repo_hook', 'admin:public_key', 'delete_repo', 'site_admin']`
    - Fine-grained PATs may not include the X-OAuth-Scopes header — treat absent header as empty scopes (default-deny scope check passes for fine-grained per RESEARCH Assumption A6)
    - Tests using nock fixtures cover all 6 outcomes:
      1. Happy path (200 + scopes='public_repo')
      2. token-invalid (401 from users.getAuthenticated)
      3. excessive-pat-scope (200 with X-OAuth-Scopes: 'admin:org')
      4. repo-inaccessible (403 from repos.get)
      5. repo-inaccessible (404 from repos.get)
      6. base-branch-missing (404 from repos.getBranch)
    - Hard error (500) propagates as a thrown error (caller catches via mapOctokitErrorToRefusal in Task 3)
  </behavior>
  <files>packages/delivery-runtime/src/preflight-full.ts, packages/delivery-runtime/src/preflight-full.test.ts</files>
  <action>
    1. **RED:** Write `preflight-full.test.ts` with 6 nock-driven test cases (one per outcome) plus an additional test for fine-grained PAT (no X-OAuth-Scopes header → ok).
    2. **GREEN:** Implement `preflight-full.ts` per RESEARCH §"Delivery preflight (full)" verbatim. Inject the Octokit instance (do not construct one inside this function — testability + no implicit env access):
       ```typescript
       export const FORBIDDEN_SCOPES = ['admin:org', 'admin:repo_hook', 'admin:public_key', 'delete_repo', 'site_admin'] as const;

       export async function preflightDeliveryFull(
         input: { token: string; target: DeliveryTarget; signal: AbortSignal },
         octokit: ProtostarOctokit
       ): Promise<FullPreflightResult> {
         let auth;
         try {
           auth = await octokit.rest.users.getAuthenticated({ request: { signal: input.signal } });
         } catch (e: any) {
           if (e?.status === 401) return { outcome: 'token-invalid', reason: '401' };
           throw e;
         }
         const scopes = (auth.headers['x-oauth-scopes'] ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
         const forbidden = scopes.filter((s: string) => (FORBIDDEN_SCOPES as readonly string[]).includes(s));
         if (forbidden.length > 0) return { outcome: 'excessive-pat-scope', scopes, forbidden };

         try {
           await octokit.rest.repos.get({ owner: input.target.owner, repo: input.target.repo, request: { signal: input.signal } });
         } catch (e: any) {
           if (e?.status === 403 || e?.status === 404) return { outcome: 'repo-inaccessible', status: e.status };
           throw e;
         }

         let branch;
         try {
           branch = await octokit.rest.repos.getBranch({ owner: input.target.owner, repo: input.target.repo, branch: input.target.baseBranch, request: { signal: input.signal } });
         } catch (e: any) {
           if (e?.status === 404) return { outcome: 'base-branch-missing', baseBranch: input.target.baseBranch };
           throw e;
         }
         return { outcome: 'ok', tokenLogin: auth.data.login, baseSha: branch.data.commit.sha, tokenScopes: scopes };
       }
       ```
    3. **REFACTOR:** Document the X-OAuth-Scopes nuance for fine-grained PATs in a code comment citing Assumption A6.
    4. Tests use `nock` (Wave 0 verified) to mock each endpoint. Use `nock.cleanAll()` in `afterEach` for isolation.
    5. AbortSignal threading: pass `input.signal` to every call; if signal aborts mid-test, the test fixture asserts the call was abandoned. (Optional: one test where pre-aborted signal causes immediate exception.)
    6. Re-export from `packages/delivery-runtime/src/index.ts`.
    7. The token argument is captured but NOT logged — verify by post-test grep of the test stdout (defense in depth; full secret-leak contract test in Plan 07-08).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run preflight-full</automated>
  </verify>
  <acceptance_criteria>
    - 6 outcomes covered by tests (ok, token-invalid, excessive-pat-scope, repo-inaccessible-403, repo-inaccessible-404, base-branch-missing)
    - Fine-grained PAT case (no X-OAuth-Scopes header) returns 'ok' with empty `tokenScopes`
    - All Octokit calls receive `request: { signal: input.signal }` (verifiable via grep)
    - `grep -c "FORBIDDEN_SCOPES" packages/delivery-runtime/src/preflight-full.ts` ≥ 1
    - `grep -c "admin:org" packages/delivery-runtime/src/preflight-full.ts` ≥ 1
    - 500-level errors propagate (test asserts thrown, not converted to refusal at this layer)
  </acceptance_criteria>
  <done>preflightDeliveryFull green across 6+ test cases; AbortSignal threaded; FORBIDDEN_SCOPES enforced.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: mapOctokitErrorToRefusal with token redaction (Pitfall 4)</name>
  <read_first>
    - packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.ts (Pattern S-3 + S-7 template — error → discriminator with redaction)
    - .planning/phases/07-delivery/07-RESEARCH.md §"Pitfall 4: Octokit does NOT redact tokens in error objects"
    - packages/delivery/src/refusals.ts (DeliveryRefusal type from Plan 07-04)
  </read_first>
  <behavior>
    - mapOctokitErrorToRefusal(err, context):
      - If err is an AbortError or has `name === 'AbortError'` → DeliveryRefusal { kind: 'cancelled', evidence: { reason: 'parent-abort', phase: context.phase } }
      - If err.status === 401 → token-invalid
      - If err.status === 403/404 + phase='preflight' → repo-inaccessible (with target.owner/repo from context)
      - If err.status === 422 (PR validation) + phase='pr-create' → invalid-body or invalid-title (best-effort classification by message)
      - Otherwise → cancelled with reason='timeout' if signal-related, else fallback to a generic refusal kind. For unmappable errors at the boundary, use 'cancelled' { reason: 'parent-abort' } as the safe default and surface the underlying message — but ONLY after redaction.
    - Redaction: BEFORE returning, scrub `err.request?.headers?.authorization`, any header whose name matches /auth|token|cookie/i, and any string value matching the token regex (defense in depth).
    - The returned DeliveryRefusal evidence contains ONLY whitelisted fields (status, message excerpt, target). Never leaks raw `err` object.
    - Tests:
      - 401 error → token-invalid
      - 403 with target → repo-inaccessible with redacted headers
      - 404 base branch → base-branch-missing
      - AbortError → cancelled with parent-abort
      - Synthetic error with `request.headers.authorization: 'Bearer ghp_…'` → returned refusal evidence does NOT contain the token string
      - Token regex match in error message → redacted to `'***'`
  </behavior>
  <files>packages/delivery-runtime/src/map-octokit-error.ts, packages/delivery-runtime/src/map-octokit-error.test.ts</files>
  <action>
    1. **RED:** Write `map-octokit-error.test.ts` with the 6 cases above plus a redaction-grep case (build a synthetic err with token in headers; pass through; assert returned refusal JSON-stringified does not contain the token).
    2. **GREEN:** Implement `map-octokit-error.ts`:
       ```typescript
       import type { DeliveryRefusal } from "@protostar/delivery";
       import type { DeliveryTarget } from "./preflight-full.js";

       const TOKEN_PATTERN = /\b(gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59})\b/g;

       function redact(s: string): string {
         return s.replace(TOKEN_PATTERN, "***");
       }

       export function mapOctokitErrorToRefusal(
         err: unknown,
         context: { phase: 'preflight' | 'push' | 'pr-create' | 'comment' | 'poll'; target?: DeliveryTarget }
       ): DeliveryRefusal {
         const e = err as { name?: string; status?: number; message?: string };

         if (e?.name === 'AbortError') {
           return { kind: 'cancelled', evidence: { reason: 'parent-abort', phase: context.phase } };
         }
         if (e?.status === 401) {
           return { kind: 'token-invalid', evidence: { reason: '401' } };
         }
         if ((e?.status === 403 || e?.status === 404) && context.phase === 'preflight' && context.target) {
           return { kind: 'repo-inaccessible', evidence: { status: e.status, owner: context.target.owner, repo: context.target.repo } };
         }
         // Fallback: cancelled with phase context; redact message.
         return { kind: 'cancelled', evidence: { reason: 'parent-abort', phase: context.phase } };
       }
       ```
       (Above is illustrative; the actual implementation should map every common Octokit status to the most precise DeliveryRefusal kind. The redact() helper is applied to any string field captured.)
    3. The returned refusal MUST be JSON-stringifiable without leaking the token. Test:
       ```typescript
       const err = { status: 401, request: { headers: { authorization: 'Bearer ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' } }, message: 'Unauthorized: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' };
       const refusal = mapOctokitErrorToRefusal(err, { phase: 'preflight' });
       const serialized = JSON.stringify(refusal);
       assert.equal(serialized.includes('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), false);
       ```
    4. **REFACTOR:** Re-export from barrel.
    5. The full secret-leak contract test (which simulates a complete delivery and greps `runs/{id}/**` for the fake token) is owned by Plan 07-08 (executeDelivery) — this task only enforces the unit-level redaction.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run map-octokit-error</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'TOKEN_PATTERN' packages/delivery-runtime/src/map-octokit-error.ts` ≥ 1
    - `grep -c 'github_pat_' packages/delivery-runtime/src/map-octokit-error.ts` ≥ 1 (fine-grained covered)
    - 6 test cases green
    - Redaction test asserts JSON.stringify(refusal) does NOT contain the test token string
    - mapOctokitErrorToRefusal exported from barrel
  </acceptance_criteria>
  <done>Error classifier with token redaction green; Pitfall 4 mitigated at unit level.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| factory-cli → octokit | Token passed to buildOctokit; never logged. |
| Octokit → preflight-full | All calls signal-threaded; non-200 routed to typed refusals. |
| Octokit error → refusal | mapOctokitErrorToRefusal redacts auth headers + token strings. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-06-01 | Information Disclosure | map-octokit-error.ts | mitigate | TOKEN_PATTERN regex + auth-header strip; unit test asserts redacted output. |
| T-07-06-02 | Elevation of Privilege | preflight-full.ts | mitigate | FORBIDDEN_SCOPES rejection blocks admin-scoped PATs from reaching delivery. |
| T-07-06-03 | DoS | octokit-client.ts | mitigate | onSecondaryRateLimit returns false (no abuse retry); doNotRetry on hard refusals. |
| T-07-06-04 | Tampering | preflight-full.ts | accept | Octokit-supplied response data trusted; nock fixtures pin shape in tests. |
</threat_model>

<verification>
- `pnpm --filter @protostar/delivery-runtime test`
- `pnpm --filter @protostar/delivery-runtime test --run no-fs.contract` (preserved)
- `pnpm --filter @protostar/delivery-runtime test --run no-merge.contract` (preserved)
</verification>

<success_criteria>
- buildOctokit composes retry + throttling with safe defaults
- preflightDeliveryFast: 5 cases green
- preflightDeliveryFull: 6+ cases green via nock
- mapOctokitErrorToRefusal: 6 cases green; token redaction unit-tested
- No-fs and no-merge contracts still pass
</success_criteria>

<output>
Create `.planning/phases/07-delivery/07-06-SUMMARY.md` documenting the 4 primitives + which downstream tasks consume them.
</output>
