---
phase: 07-delivery
plan: 07
type: execute
wave: 2
depends_on: ["07-02", "07-04"]
files_modified:
  - packages/delivery-runtime/src/branch-template.ts
  - packages/delivery-runtime/src/branch-template.test.ts
  - packages/delivery-runtime/src/push-branch.ts
  - packages/delivery-runtime/src/push-branch.test.ts
  - packages/delivery-runtime/src/index.ts
autonomous: true
requirements: [DELIVER-01, DELIVER-02]
must_haves:
  truths:
    - "buildBranchName produces 'protostar/{archetype}/{runIdShort}-{randomSuffix}' with crypto.randomBytes(4).toString('hex') 8-char suffix (Q-07)"
    - "pushBranch wraps isomorphic-git push() with onAuth shim using { username: 'x-access-token', password: PAT } per CONTEXT Q-03 verbatim"
    - "pushBranch emulates --force-with-lease via remote-SHA pre-check (Pitfall 5): refuse 'remote-diverged' if remote ref points at unexpected SHA"
    - "pushBranch implements two-layer cancel: pre-push signal check + auth-loop signal check (Pitfall 11) — in-flight push cannot be interrupted, documented in CONCERNS"
    - "pushBranch is fs-FORBIDDEN: receives `fs` via DI from caller (factory-cli supplies node:fs); no `node:fs` import in push-branch.ts source"
    - "Token never logged or persisted in any error output (mapOctokitErrorToRefusal handles)"
  artifacts:
    - path: packages/delivery-runtime/src/push-branch.ts
      provides: "isomorphic-git push wrapper with force-with-lease emulation + two-layer cancel"
      exports: ["pushBranch", "buildPushOnAuth"]
    - path: packages/delivery-runtime/src/branch-template.ts
      provides: "Branch name template + 8-char hex random suffix"
      exports: ["buildBranchName", "generateBranchSuffix"]
  key_links:
    - from: packages/delivery-runtime/src/push-branch.ts
      to: packages/repo/src/clone-workspace.ts
      via: "Reuses Phase 3 onAuth shim pattern"
      pattern: "AuthCallback"
    - from: packages/delivery-runtime/src/push-branch.ts
      to: packages/delivery/src/refusals.ts
      via: "Returns DeliveryRefusal on lease/cancel/auth failures"
      pattern: "remote-diverged|cancelled"
---

<objective>
Wrap `isomorphic-git push()` with the Phase 7 auth + cancel + force-with-lease semantics required by Q-03, Q-19, and Pitfall 5/Pitfall 11. Build the branch-name template (Q-07) with cryptographic random suffix. Both modules are fs-forbidden — `fs` is INJECTED from `apps/factory-cli`. Document the residual cancel-mid-push limitation (Pitfall 11) explicitly in the source.

Per CONTEXT.md Q-03 verbatim, use `{ username: 'x-access-token', password: PAT }` form (NOT the Phase 3 clone-path `{ username: token, password: 'x-oauth-basic' }` form). Document this divergence in the source — both forms work for GitHub PATs per RESEARCH §"Pattern 2", but Q-03 is the locked decision and we honor it as-stated.

Purpose: Q-03, Q-07, Q-19, Pitfall 5, Pitfall 11, DELIVER-01, DELIVER-02.
Output: Two pure-ish modules (push-branch is impure due to network + injected fs); branch template fully pure.
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
@packages/repo/src/clone-workspace.ts
@packages/delivery/src/brands.ts
@packages/delivery/src/refusals.ts

<interfaces>
<!-- Branch template (Q-07) -->

```typescript
export function generateBranchSuffix(): string;  // 8 hex chars from crypto.randomBytes(4)

export function buildBranchName(input: {
  readonly archetype: string;       // e.g., 'cosmetic-tweak'
  readonly runId: string;           // e.g., 'run_20260428143052'
  readonly suffix?: string;         // optional override; defaults to generateBranchSuffix()
}): string;
// Returns: 'protostar/{archetype}/{runIdShort}-{suffix}'
// runIdShort = runId with 'run_' prefix stripped if present
```

<!-- onAuth shim (Q-03 verbatim form) -->

```typescript
import type { AuthCallback } from "isomorphic-git";

export function buildPushOnAuth(token: string, signal: AbortSignal): AuthCallback;
// Returns: () => signal.aborted ? { cancel: true }
//                : count > 2 ? { cancel: true }
//                : { username: 'x-access-token', password: token }
```

<!-- pushBranch (Q-03 + Pitfall 5 + Pitfall 11) -->

```typescript
import type { BranchName } from "@protostar/delivery";
import type { DeliveryRefusal } from "@protostar/delivery";

export type PushResult =
  | { readonly ok: true; readonly newSha: string }
  | { readonly ok: false; readonly refusal: DeliveryRefusal };

export interface PushBranchInput {
  readonly workspaceDir: string;
  readonly branchName: BranchName;
  readonly remoteUrl: string;       // e.g., https://github.com/owner/repo.git
  readonly token: string;           // PROTOSTAR_GITHUB_TOKEN
  readonly expectedRemoteSha: string | null;  // for force-with-lease emulation; null = first push
  readonly signal: AbortSignal;
  readonly fs: unknown;             // INJECTED node:fs (typed loosely to avoid `node:fs` import here)
  readonly http?: unknown;          // INJECTED isomorphic-git/http/node (testability)
}

export async function pushBranch(input: PushBranchInput): Promise<PushResult>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: branch-template (buildBranchName + generateBranchSuffix)</name>
  <read_first>
    - .planning/phases/07-delivery/07-CONTEXT.md Q-07 verbatim
    - .planning/phases/07-delivery/07-RESEARCH.md §"Pitfall 10: Branch-collision under second-precision runIds" (8 hex = 32 bits entropy)
    - .planning/phases/07-delivery/07-RESEARCH.md Open Question 4 (runId format)
    - apps/factory-cli/src/main.ts (existing runId generator — confirm format)
  </read_first>
  <behavior>
    - generateBranchSuffix(): 8 lowercase hex chars from `crypto.randomBytes(4).toString('hex')`. Pure (depends on system random).
    - buildBranchName({ archetype, runId, suffix? }):
      - Strip leading `run_` from runId to get runIdShort
      - Compose `protostar/{archetype}/{runIdShort}-{suffix}` where suffix defaults to generateBranchSuffix()
      - Throw if archetype contains chars outside `[a-z0-9-]+` (defense in depth — archetype is internal but validate)
      - Return string is NOT yet branded; caller passes through validateBranchName() to mint BranchName
    - Tests:
      - Happy path: `buildBranchName({ archetype: 'cosmetic-tweak', runId: 'run_20260428143052', suffix: 'a3k9z2cd' })` → 'protostar/cosmetic-tweak/20260428143052-a3k9z2cd'
      - runId without 'run_' prefix: 'protostar/cosmetic-tweak/20260428143052-a3k9z2cd' (no prefix to strip)
      - Auto suffix: assert returned name matches `^protostar/cosmetic-tweak/20260428143052-[0-9a-f]{8}$`
      - Bad archetype: throws
      - generateBranchSuffix returns 8 hex chars across 100 invocations (sample); all chars in `[0-9a-f]`
      - Total length under 244 (git ref limit) for typical inputs
  </behavior>
  <files>packages/delivery-runtime/src/branch-template.ts, packages/delivery-runtime/src/branch-template.test.ts</files>
  <action>
    1. **RED:** Write tests covering all behaviors. Run; fail.
    2. **GREEN:** Implement:
       ```typescript
       import { randomBytes } from "node:crypto";

       const ARCHETYPE_REGEX = /^[a-z0-9-]+$/;

       export function generateBranchSuffix(): string {
         return randomBytes(4).toString("hex");
       }

       export function buildBranchName(input: {
         readonly archetype: string;
         readonly runId: string;
         readonly suffix?: string;
       }): string {
         if (!ARCHETYPE_REGEX.test(input.archetype)) {
           throw new Error(`Invalid archetype "${input.archetype}" — must match ${ARCHETYPE_REGEX.source}`);
         }
         const runIdShort = input.runId.startsWith("run_") ? input.runId.slice(4) : input.runId;
         const suffix = input.suffix ?? generateBranchSuffix();
         return `protostar/${input.archetype}/${runIdShort}-${suffix}`;
       }
       ```
    3. `node:crypto` is permitted (not fs/path; the no-fs.contract.test.ts patterns do NOT include `node:crypto`). Verify the no-fs contract test still passes.
    4. **REFACTOR:** Add JSDoc citing Q-07 + Pitfall 10. Re-export both functions from barrel.
    5. Verify the full output for a typical input is well under 244 bytes:
       - `protostar/` (10) + archetype (e.g. 14) + `/` (1) + runIdShort (e.g. 14) + `-` (1) + 8-hex suffix (8) = ~48 chars typical. Far under 244.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run branch-template && pnpm --filter @protostar/delivery-runtime test --run no-fs.contract</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'randomBytes' packages/delivery-runtime/src/branch-template.ts` ≥ 1
    - `grep -c 'protostar/' packages/delivery-runtime/src/branch-template.ts` ≥ 1
    - 6+ test cases green
    - Bad archetype throws (test covers)
    - 8-hex suffix verified across sampled invocations
    - no-fs.contract still green (node:crypto is permitted, not forbidden)
  </acceptance_criteria>
  <done>Branch template green with deterministic suffix testing.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: pushBranch with force-with-lease emulation + two-layer cancel</name>
  <read_first>
    - packages/repo/src/clone-workspace.ts (lines 57–76 onAuth shim — adapt the structure, swap the username/password form per Q-03 verbatim)
    - .planning/phases/07-delivery/07-RESEARCH.md §"Pattern 2: `onAuth` shim for isomorphic-git push" + §"Pitfall 5: isomorphic-git has no native force-with-lease" + §"Pitfall 11: isomorphic-git push() has no native AbortSignal"
    - .planning/phases/07-delivery/07-CONTEXT.md Q-03 (verbatim onAuth form: `{ username: 'x-access-token', password: PAT }`)
    - .planning/codebase/CONCERNS.md (where to document the Pitfall 11 caveat)
  </read_first>
  <behavior>
    - buildPushOnAuth(token, signal):
      - Tracks invocation count via closure
      - On invocation: if signal.aborted → { cancel: true }; if count > 2 → { cancel: true }; if token empty → { cancel: true }
      - Else returns `{ username: 'x-access-token', password: token }` (CONTEXT Q-03 verbatim)
    - pushBranch:
      1. **Pre-push abort check** (Pitfall 11 layer 1): if input.signal.aborted → return `{ ok: false, refusal: { kind: 'cancelled', evidence: { reason: 'parent-abort', phase: 'push' } } }`
      2. **Force-with-lease emulation** (Pitfall 5):
         - Use `git.fetch({ fs, http, url, ref: branchName, ... })` to peek at remote ref
         - If remote ref exists and `expectedRemoteSha === null` (we expected first push but ref already exists) → return `remote-diverged` refusal
         - If remote ref exists and matches expectedRemoteSha → safe to force-push
         - If remote ref exists and DOES NOT match expectedRemoteSha → `remote-diverged` refusal with both SHAs in evidence
         - If remote ref doesn't exist (ref-not-found) → safe to push with `force: false`
      3. Call `git.push({ fs: input.fs, http: input.http ?? defaultHttp, dir, url, ref, onAuth: buildPushOnAuth(token, signal), force: shouldForce })`
      4. Inspect `result.refs[`refs/heads/${branchName}`].ok`. On `ok: false`, map to `remote-diverged` (non-fast-forward) or `cancelled` (abort during auth) per `result.errors`.
      5. On success, return `{ ok: true, newSha }` where newSha is read from local ref via `git.resolveRef`.
    - The `fs` parameter is `unknown`-typed in the signature to avoid an `import * as fs from "node:fs"` in this file (no-fs contract). Inside the function, cast with `// @ts-expect-error or as Parameters<typeof git.push>[0]['fs']` to call git.push without leaking the import.
    - Tests use a synthetic in-memory or tmpdir bare repo (Phase 3's `buildSacrificialRepo` from `@protostar/repo/internal/test-fixtures`) plus injection of `node:fs/promises` from the test harness:
      - Happy path: empty remote, push succeeds, returns ok with newSha
      - Pre-aborted signal: returns cancelled refusal without calling git.push
      - remote-diverged: remote has SHA X; expectedRemoteSha=Y → returns remote-diverged
      - 401-equivalent: onAuth returns cancel because token is empty → push fails → refusal mapped
      - Auth-loop cancel: signal aborts mid-push (between auth invocations) → onAuth returns cancel → refusal
    - **Cancel-mid-push limitation:** document in source AND in `.planning/codebase/CONCERNS.md` that an in-flight HTTP pack upload cannot be interrupted; recovery via Q-18 idempotency. Add a CONCERNS entry titled "Phase 7: push cancel is best-effort (Pitfall 11)".
  </behavior>
  <files>packages/delivery-runtime/src/push-branch.ts, packages/delivery-runtime/src/push-branch.test.ts, .planning/codebase/CONCERNS.md</files>
  <action>
    1. **RED:** Write `push-branch.test.ts` with the 5 scenarios above. Use `@protostar/repo/internal/test-fixtures` (Phase 3 Plan 04 helper) to build a sacrificial bare repo for the remote. Inject `node:fs/promises` from the test (test files MAY import fs; the static contract test only checks src files NOT ending in `.test.ts` or `.contract.test.ts` — but verify by checking the existing dogpile-adapter no-fs test's exclusion logic).

       Wait — re-check the no-fs contract test from Plan 07-02: it walks `src/` and excludes only the contract test file by basename. If push-branch.test.ts imports `node:fs/promises`, it WILL fail the no-fs contract.

       **Resolution:** Either (a) the test imports `fs` indirectly via the test fixture (`buildSacrificialRepo` does its own fs work in `@protostar/repo`), or (b) extend the no-fs contract test to exclude `*.test.ts` basename pattern. Option (b) is cleanest and matches dogpile-adapter's pattern (which currently excludes only itself by basename — verify by reading the source).

       **Decision:** In Task 1 of Plan 07-02, the no-fs walker excludes `*.contract.test.ts` AND `*.test.ts` files (any file ending in `.test.ts`). Re-read 07-02 Task 2's behavior — the dogpile-adapter pattern walks `src/` and the exclusion is by basename. If `push-branch.test.ts` imports fs, it fails.

       **Fix:** Update Plan 07-02's no-fs contract test to exclude any `*.test.ts` file from the walker (test files may import fs for fixture purposes; only production source MUST be fs-free). This refinement is part of Task 1 here — modify Plan 07-02's already-landed test to add the exclusion. Document this refinement in this plan's SUMMARY.

       Alternatively: the test uses ONLY `@protostar/repo`'s fixture helper which encapsulates fs internally; the test file itself does not import `node:fs`.
    2. **GREEN:** Implement `push-branch.ts`. The `fs: unknown` parameter avoids the import; cast at call site:
       ```typescript
       import git, { type AuthCallback } from "isomorphic-git";
       import http from "isomorphic-git/http/node";
       import type { BranchName, DeliveryRefusal } from "@protostar/delivery";

       export function buildPushOnAuth(token: string, signal: AbortSignal): AuthCallback {
         let count = 0;
         return () => {
           count += 1;
           if (signal.aborted) return { cancel: true };
           if (count > 2) return { cancel: true };
           if (token.length === 0) return { cancel: true };
           // Q-03 verbatim form: { username: 'x-access-token', password: PAT }
           // (Phase 3 clone path uses { username: token, password: 'x-oauth-basic' };
           //  both forms work for GitHub PATs per RESEARCH §"Pattern 2", but
           //  CONTEXT.md Q-03 locks the form below — honor it as stated.)
           return { username: "x-access-token", password: token };
         };
       }

       export async function pushBranch(input: PushBranchInput): Promise<PushResult> {
         // Pitfall 11 layer 1: pre-push signal check
         if (input.signal.aborted) {
           return { ok: false, refusal: { kind: 'cancelled', evidence: { reason: signalReason(input.signal), phase: 'push' } } };
         }

         // Pitfall 5: force-with-lease emulation via git.fetch
         const httpImpl = (input.http ?? http) as typeof http;
         const fs = input.fs as Parameters<typeof git.push>[0]['fs'];

         let remoteSha: string | null = null;
         try {
           // git.fetch returns the fetched ref info; use git.resolveRef against the remote-tracking ref afterward
           await git.fetch({ fs, http: httpImpl, dir: input.workspaceDir, url: input.remoteUrl, ref: input.branchName, singleBranch: true, depth: 1, onAuth: buildPushOnAuth(input.token, input.signal) });
           remoteSha = await git.resolveRef({ fs, dir: input.workspaceDir, ref: `refs/remotes/origin/${input.branchName}` }).catch(() => null);
         } catch (e: any) {
           // ref-not-found is expected for first push; other errors propagate as refusals
           if (e?.code === 'NotFoundError' || /not found/i.test(e?.message ?? '')) {
             remoteSha = null;
           } else {
             return { ok: false, refusal: { kind: 'cancelled', evidence: { reason: 'parent-abort', phase: 'push' } } };
           }
         }

         // Lease check
         if (remoteSha !== null && input.expectedRemoteSha === null) {
           return { ok: false, refusal: { kind: 'remote-diverged', evidence: { branch: input.branchName as string, expectedSha: null, remoteSha } } };
         }
         if (remoteSha !== null && input.expectedRemoteSha !== null && remoteSha !== input.expectedRemoteSha) {
           return { ok: false, refusal: { kind: 'remote-diverged', evidence: { branch: input.branchName as string, expectedSha: input.expectedRemoteSha, remoteSha } } };
         }

         const shouldForce = remoteSha !== null && remoteSha === input.expectedRemoteSha;
         try {
           const result = await git.push({ fs, http: httpImpl, dir: input.workspaceDir, url: input.remoteUrl, ref: input.branchName, force: shouldForce, onAuth: buildPushOnAuth(input.token, input.signal) });
           const refResult = result?.refs?.[`refs/heads/${input.branchName}`];
           if (!refResult?.ok) {
             return { ok: false, refusal: { kind: 'remote-diverged', evidence: { branch: input.branchName as string, expectedSha: input.expectedRemoteSha, remoteSha: remoteSha ?? '' } } };
           }
           const newSha = await git.resolveRef({ fs, dir: input.workspaceDir, ref: input.branchName });
           return { ok: true, newSha };
         } catch (e: any) {
           return { ok: false, refusal: { kind: 'cancelled', evidence: { reason: signalReason(input.signal), phase: 'push' } } };
         }
       }

       function signalReason(signal: AbortSignal): 'sigint' | 'timeout' | 'sentinel' | 'parent-abort' {
         const r = signal.reason;
         if (r === 'sigint' || r === 'timeout' || r === 'sentinel') return r;
         return 'parent-abort';
       }
       ```
    3. **REFACTOR:** Add a comment block at the top of push-branch.ts citing Q-03 + Pitfall 5 + Pitfall 11. Also document the Q-03 deviation from Phase 3 clone-workspace.ts auth form.
    4. Append a CONCERNS.md entry:
       ```markdown
       ### Phase 7: push cancel is best-effort (Pitfall 11)
       isomorphic-git's push() takes no AbortSignal. We implement two-layer cancel:
       (1) pre-push signal check, (2) onAuth signal check between auth invocations.
       An in-flight HTTP pack upload cannot be interrupted from outside the callbacks.
       Recovery: Q-18 idempotency — next delivery attempt finds the partial push and
       reconciles via remote-SHA check (Pitfall 5).
       ```
    5. Re-export pushBranch + buildPushOnAuth from barrel.
    6. Run all tests; verify no-fs contract STILL passes (the type `Parameters<typeof git.push>[0]['fs']` is a type-only reference, not a `import * as fs from "node:fs"` — confirm by reading the test output).
    7. **Refinement to Plan 07-02:** Update `packages/delivery-runtime/src/no-fs.contract.test.ts` to exclude any file ending in `.test.ts` from the walker (production source vs test source). Document the change in this plan's SUMMARY as a refinement to 07-02.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run push-branch && pnpm --filter @protostar/delivery-runtime test --run no-fs.contract && pnpm --filter @protostar/delivery-runtime test --run no-merge.contract</automated>
  </verify>
  <acceptance_criteria>
    - 5 push-branch test scenarios green (happy, pre-aborted, remote-diverged, empty-token, auth-loop-cancel)
    - `grep -c "username: \"x-access-token\"" packages/delivery-runtime/src/push-branch.ts` ≥ 1 (Q-03 verbatim form)
    - `grep -c "Pitfall 11" packages/delivery-runtime/src/push-branch.ts` ≥ 1 (caveat documented in source)
    - `grep -c "Phase 7: push cancel is best-effort" .planning/codebase/CONCERNS.md` ≥ 1
    - `grep -E "import.*['\"]node:fs['\"]" packages/delivery-runtime/src/push-branch.ts` returns zero matches (fs not imported)
    - no-fs.contract.test.ts still green
    - no-merge.contract.test.ts still green
  </acceptance_criteria>
  <done>pushBranch with force-with-lease emulation + two-layer cancel green; CONCERNS updated; no-fs preserved.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| factory-cli → pushBranch | factory-cli supplies fs + token; push-branch never imports fs. |
| pushBranch → remote | force-with-lease emulation prevents overwriting unknown remote SHAs. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-07-01 | Tampering | push-branch.ts | mitigate | Force-with-lease emulation via git.fetch + remote-SHA pre-check (Pitfall 5). |
| T-07-07-02 | DoS | push-branch.ts | accept | In-flight push cannot be cancelled (Pitfall 11); documented in CONCERNS; recovery via Q-18 idempotency. |
| T-07-07-03 | Information Disclosure | branch-template.ts | mitigate | crypto.randomBytes for 32-bit collision resistance per Pitfall 10. |
| T-07-07-04 | Tampering | push-branch.ts | mitigate | onAuth signal check between attempts; empty token returns cancel. |
</threat_model>

<verification>
- `pnpm --filter @protostar/delivery-runtime test`
- no-fs + no-merge contracts preserved
- CONCERNS.md updated
</verification>

<success_criteria>
- buildBranchName + generateBranchSuffix green; suffix is 8 hex chars
- pushBranch handles 5+ scenarios including remote-diverged + cancel-during-auth
- Q-03 onAuth form verbatim
- Pitfall 5 (force-with-lease emulation) implemented
- Pitfall 11 (in-flight cancel limitation) documented in source + CONCERNS
- No-fs contract preserved (push-branch.ts has zero fs imports)
</success_criteria>

<output>
Create `.planning/phases/07-delivery/07-07-SUMMARY.md` documenting the auth form choice (Q-03 verbatim, divergent from Phase 3 clone), the force-with-lease emulation strategy, and the no-fs contract refinement (test-file exclusion in 07-02).
</output>
