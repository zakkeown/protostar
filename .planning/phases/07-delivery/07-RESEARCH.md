# Phase 7: Delivery - Research

**Researched:** 2026-04-28
**Domain:** GitHub PR delivery via Octokit + isomorphic-git push (first real outbound write)
**Confidence:** HIGH (CONTEXT.md is exhaustive; research targets are verification-of-detail, not exploration)

## Summary

Phase 7 wires the first real outbound write the dark factory makes: a GitHub PR created via `@octokit/rest` + PAT, with branch push via `isomorphic-git@1.37.6` (reused from Phase 3 clone). CONTEXT.md locks 20/20 design decisions; this research verifies the external-API specifics the planner needs (Octokit method paths and signatures, isomorphic-git push response shape, nock recording strategy, GitHub limits, PAT formats), audits the existing codebase for analog patterns to reuse (Phase 3 `onAuth` shim, Phase 4 preflight, Phase 5 brand-mint, Phase 6 hierarchical AbortSignal — Phase 6 is in flight (factory-config `piles` block already in schema; `executionCoordinationPilePreset` rename done in `dogpile-adapter`); Phase 7 plan must layer on top of that work, not collide with it), and identifies the schema-cascade scope for the `confirmedIntent 1.4.0 → 1.5.0` bump.

The package split is locked: `packages/delivery` stays pure-transform (validators + body composers); new `packages/delivery-runtime` owns network I/O (Octokit + push); `apps/factory-cli` orchestrates and persists. v0.1 ships nock-only against fixtures; real GitHub waits for Phase 10 dogfood. Delivery is gated by the Phase 5 `DeliveryAuthorization` brand at compile time (Plan 05-13 already pinned this contract).

**Primary recommendation:** Build `delivery-runtime` to mirror `dogpile-adapter`'s structure (network-permitted + zero-fs static contract test). Pin `@octokit/rest@^22.0.1`, `nock@^14.0.13`, `@octokit/plugin-retry@^7` for transient retries, `@octokit/plugin-throttling@^9` for rate-limit safety. Reuse `packages/repo/src/clone-workspace.ts:buildOnAuth` as the literal template for `pushBranch`'s auth shim — the existing `{ username: token, password: 'x-oauth-basic' }` pattern is the documented isomorphic-git GitHub form and matches Phase 3 conventions. **CONTEXT.md Q-03 specifies the alternative `{ username: 'x-access-token', password: PAT }` form**; both are documented GitHub PAT forms in isomorphic-git's auth docs and both work. This is a recommended deviation from Q-03 for codebase symmetry — flagged in Assumptions Log A0; planner should confirm with discuss-phase before locking. If Q-03 is held verbatim, use `{ username: 'x-access-token', password: PAT }` instead.

## Project Constraints (from CLAUDE.md / AGENTS.md)

- **TypeScript strict, ESM, Node 22.** `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` repo-wide. `module: NodeNext` with `.js` import suffixes.
- **`pnpm run verify` before handoff.** Add `@protostar/delivery-runtime` to verify scripts.
- **`pnpm run factory` after stage-composition changes.** Will exit at workspace-trust gate today; Phase 7 doesn't change that.
- **Authority boundary (AGENTS.md):** only `apps/factory-cli` + `packages/repo` may touch the filesystem. Phase 7 ADDS `@protostar/delivery-runtime` to a NETWORK-permitted, fs-FORBIDDEN tier (joining `dogpile-adapter`). Update AGENTS.md to declare this tier explicitly.
- **Domain-first packaging.** No `utils`/`agents`/`factory` catch-alls. `delivery-runtime` is a domain package (delivery-side network I/O).
- **Stage forward-only data.** No reaching back into earlier stages' private state.
- **Dark autonomy.** No progress logs; only evidence bundle and hard failures.
- **Ouroboros context (CLAUDE.md):** Specification-First. Phase 7 is the realization of the "deliver only after proof" ordering principle.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

CONTEXT.md answers 20 questions; the planner MUST treat each as authoritative. Restated for the planner's convenience:

| Q | Decision |
|---|----------|
| Q-01 | New `@protostar/delivery-runtime` package owns Octokit + push; `packages/delivery` stays pure; `apps/factory-cli` orchestrates and persists. |
| Q-02 | Octokit only (drop `gh pr create` argv emission). Add `@octokit/rest` runtime dep on `delivery-runtime`. |
| Q-03 | `isomorphic-git` push() with token via `onAuth` shim. Reuse Phase 3 stack. |
| Q-04 | Env var `PROTOSTAR_GITHUB_TOKEN` (namespaced). |
| Q-05 | `envelope.delivery.target: { owner, repo, baseBranch }` signed into ConfirmedIntent. `allowedHosts` computed (`api.github.com` + optionally `uploads.github.com`). Schema bump 1.4.0 → 1.5.0. |
| Q-06 | Both preflights — fast (token presence + format) at run start; full (`users.getAuthenticated` + `repos.get` + `repos.getBranch`) at delivery boundary. Five outcomes mirror Phase 4 Q-13. |
| Q-07 | Branch template `protostar/${archetype}/${runIdShort}-${randomSuffix}`. 6-char base32 / 8-char hex suffix; operator override `--head-branch`. |
| Q-08 | Both — pure validators in `packages/delivery` mint `BranchName`/`PrTitle`/`PrBody`; `executeDelivery` requires brands at compile time. Negative `@ts-expect-error` test. |
| Q-09 | Title cap 200 chars (truncate+ellipsis); body cap 60_000 bytes UTF-8 (refuse, never silent strip); control chars rejected. |
| Q-10 | Inline summary in PR body; full transcripts as PR comments with `<!-- protostar-evidence:{kind} -->` markers. Comment failures don't block delivery. |
| Q-11 | Skip screenshots in v0.1; emit `screenshotStatus: 'deferred-v01'`. |
| Q-12 | Compact score-sheet table + `<details><summary>` per-rationale. |
| Q-13 | Per-section pure composers in `packages/delivery`; `factory-cli` orders them. `composeArtifactList` takes the live artifact list (drift-by-construction prevention). |
| Q-14 | Schema: `budget.deliveryWallClockMs` (default 600_000, min 30_000, max 3_600_000). 10s poll interval. Hierarchical AbortSignal pattern. |
| Q-15 | `factory-config.json` `delivery.requiredChecks: string[]` allowlist. Empty default → `'no-checks-configured'`. AND over allowlist conclusions. |
| Q-16 | Two-step. `executeDelivery` returns after PR-created + first-snapshot. CI polling continues to terminal or budget. On exhaustion, `ciVerdict: 'timeout-pending'`; Phase 9 `--capture-ci` resumes. `delivery-result.json` is the only mutable-post-run artifact. |
| Q-17 | `runs/{id}/delivery/delivery-result.json` (terminal, tmp+rename) + `runs/{id}/delivery/ci-events.jsonl` (append-only). |
| Q-18 | Idempotent. `pulls.list({ head: 'owner:branch', state: 'all' })` finds existing PR; open → re-use + update body + update marker-tagged comments; closed → refusal `pr-already-closed`; multiple → `pr-ambiguous`. |
| Q-19 | Hierarchical AbortSignal (run → delivery+timeout → per-call). Best-effort cancel. Reasons: `'sigint' | 'timeout' | 'sentinel'`. Recovery via Q-18 idempotency. |
| Q-20 | Type-level no-merge (no `merge*`/`enableAutoMerge`/etc. exists in source). Static grep contract test. PAT scope rejection at preflight (admin scopes → `excessive-pat-scope`). nock for v0.1; real GitHub deferred to Phase 10. |

### Claude's Discretion

- `randomSuffix` algorithm (Q-07) — recommend `crypto.randomBytes(4).toString('hex')` (8 chars hex, stdlib only).
- PR body section ordering (Q-13) — proposed: run summary → mechanical → judge panel → repair history → artifact list → footer.
- `delivery-result.json` rolling `ciSnapshots` window — recommend rolling 10 + first 1.
- Comment-posting concurrency (Q-10) — serial recommended.
- `findExistingPr` query format (Q-18) — verify against current Octokit (`head: 'owner:branch'` is the GitHub canonical filter form).
- `executeDelivery` accepts a single typed `DeliveryExecutionPlan` blob — recommended.

### Deferred Ideas (OUT OF SCOPE)

- Screenshot capture pipeline (Phase 10).
- Real GitHub integration (Phase 10 DOG-04).
- Auto-merge mode (POST-12).
- GitHub webhook listener.
- Branch-protection-rule reading for required-checks discovery (operator names them in factory-config.json).
- Gist/upload-as-attachment evidence channel.
- PR labels / draft posture.
- Multi-repo delivery.
- Rate-limit-aware adaptive polling.
- PR review-request automation.
- Stable rubric vocabulary (Phase 8).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DELIVER-01 | `packages/delivery` executes built command (Octokit + PAT) and returns real PR URL | New `delivery-runtime` package owns Octokit; `packages/delivery` becomes pure planner. `pulls.create` returns `{ data.html_url, data.number }` — that's the PR URL. [VERIFIED: Octokit docs] |
| DELIVER-02 | Branch push uses validated branch name `^[a-zA-Z0-9._/-]+$`; PR title/body validated separately | Branded validators in `packages/delivery` mint `BranchName`/`PrTitle`/`PrBody`. Pattern + control-char + length checks per Q-09. Reuse Phase 5 `DeliveryAuthorization` brand template. |
| DELIVER-03 | PR body includes evidence bundle (PR URL, screenshots, score sheet, mechanical summary, repair history) | Per-section composers (Q-13). Screenshots deferred to Phase 10 (Q-11) but the type slot exists. Body inline + comments overflow (Q-10). |
| DELIVER-04 | After PR creation, factory polls CI status until complete; status snapshot captured | `pollCiStatus` async generator using `checks.listForRef` against PR head SHA at 10s interval (Q-14, Q-15). |
| DELIVER-05 | `delivery-result.json` records PR URL, head/base SHA, CI verdict, timestamps | Schema in Q-17 (interface listed in CONTEXT). Mutable post-run only file (Q-16). |
| DELIVER-06 | PR body filenames match actual artifact list (no drift) | `composeArtifactList(artifacts: readonly ArtifactRef[]): string` takes live list passed from `factory-cli`. Drift contract test asserts body equals JSON-derived list. Type system makes drift impossible. |
| DELIVER-07 | No auto-merge — `merge` is operator action | Type-level: no `merge*` export anywhere in `delivery` or `delivery-runtime`. Static grep contract test for `pulls.merge`, `pulls.updateBranch`, `enableAutoMerge`, `merge_method`. PAT scope rejection at preflight (Q-20). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Branch/title/body validation (brand mint) | Pure (`packages/delivery`) | — | Pure transforms; no I/O. Mirrors Phase 5 `DeliveryAuthorization`. |
| PR body composition (per-section) | Pure (`packages/delivery`) | — | Pure transforms over typed inputs. Snapshot-testable. |
| Octokit PR create / list / update / comments / checks | Network (`packages/delivery-runtime`) | — | All HTTP I/O concentrated; nock-testable. Zero fs. |
| `isomorphic-git` push | Network (`packages/delivery-runtime`) | — | Same package as Octokit (single network-authority package). |
| Preflight (fast: format check) | Pure (`packages/delivery-runtime`) | — | No HTTP; reads `process.env`. Lives in delivery-runtime for cohesion. |
| Preflight (full: `users.getAuthenticated` etc.) | Network (`packages/delivery-runtime`) | — | Real Octokit calls. |
| Schema (envelope.delivery.target, deliveryWallClockMs) | Pure (`packages/intent`) | — | Schema lives where ConfirmedIntent lives. Computed `allowedHosts` helper here. |
| `factory-config.delivery.requiredChecks` parsing | Pure (`packages/lmstudio-adapter` factory-config OR new home) | — | Existing factory-config schema already there; extend it. |
| `delivery-result.json` + `ci-events.jsonl` writes | Filesystem (`apps/factory-cli`) | — | Only `factory-cli` writes; `delivery-runtime` returns structured outcomes via callback or async iterable. |
| Hierarchical AbortSignal composition | Filesystem (`apps/factory-cli`) | Network (`delivery-runtime` consumes) | `factory-cli` owns the run signal + delivery timeout signal; `delivery-runtime` accepts the composed signal in `DeliveryRunContext`. |
| Branch template + random suffix | Pure (`packages/delivery-runtime` or `packages/delivery`) | — | `crypto.randomBytes` is pure; stays in `delivery-runtime` because it's a delivery-time concern, not a planning concern. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@octokit/rest` | `^22.0.1` | GitHub REST client (PR/issues/checks/users/repos) | Official Octokit, requires Node ≥20, latest major as of 2026-04-28. [VERIFIED: npm view @octokit/rest version → 22.0.1, engines: node>=20] |
| `isomorphic-git` | `1.37.6` (existing) | Pure-JS git push | Already a Phase 3 dep; reuse the `onAuth` shim. Same version. [VERIFIED: packages/repo deps] |
| `nock` | `^14.0.13` | HTTP fixture for Octokit (dev-only) | Latest major; engine matches Node 22. Works with Octokit's HTTP layer. [VERIFIED: npm view nock version → 14.0.13, engines >=20.12.1] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@octokit/plugin-retry` | `^7` | Auto-retry on 5xx/network errors | Compose into `Octokit.plugin(retry)` for `delivery-runtime`. Saves hand-rolling backoff. [CITED: Octokit docs §Plugins] |
| `@octokit/plugin-throttling` | `^9` | Rate-limit-aware queueing | Compose alongside retry. Defends against 60-poll-per-10min CI loop hammering quota. [CITED: Octokit docs §Throttling] |

The throttling plugin's `onRateLimit` callback is the right hook to log + decide retry. For Phase 7's polling loop (10s × ~60 polls = ~360 calls/10min vs 5000/hr authenticated quota), throttling is defense-in-depth, not load-bearing — but it's cheap to add now and protects against future operators with smaller quotas.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@octokit/rest` | `@octokit/core` + manual endpoint calls | `@octokit/rest` ships typed REST methods; saves wiring. Locked by Q-02. |
| `nock` | `msw` (Mock Service Worker) | `msw` has better fetch native support and Octokit uses fetch under the hood in v22. **Verify at install time** that nock 14 still intercepts Octokit's HTTP layer — Octokit moved to `fetch` in major 21+. If nock 14 fails to intercept, fall back to `msw`. [ASSUMED — needs install-time verification] |
| `isomorphic-git` push | `simple-git` (subprocess wrapper) | Subprocess violates Phase 3 pure-JS posture; isomorphic-git already in stack. Locked by Q-03. |

**Installation:**

```bash
pnpm --filter @protostar/delivery-runtime add @octokit/rest @octokit/plugin-retry @octokit/plugin-throttling isomorphic-git
pnpm --filter @protostar/delivery-runtime add -D nock
```

(`isomorphic-git` is already at root via `packages/repo`; the new package re-declares for explicit dep graph.)

**Version verification (executed 2026-04-28):**

```bash
npm view @octokit/rest version    # → 22.0.1 (engines: node >=20)
npm view isomorphic-git version   # → 1.37.6 (matches Phase 3 lock)
npm view nock version             # → 14.0.13 (engines: >=20.12.1)
```

[VERIFIED: npm registry, 2026-04-28]

**⚠️ Nock-vs-fetch caveat (research target #3):** Octokit major 21+ uses native `fetch` (not `node-fetch`). Nock 14 has historically had issues intercepting native fetch on Node 18/20/22 (per [codewithhugo.com: "Nock on Node 18/20/22 Fails to Intercept isomorphic-unfetch/fetch"](https://codewithhugo.com/nock-node-18-20-22-fails-to-intercept-fetch/)). **Plan must include a smoke test in Wave 0** that verifies nock intercepts a single Octokit call against `api.github.com` before building the full fixture surface. If it fails, swap to `msw` (still local-only, still deterministic, also dev-dep). This is the highest-risk research target for the phase. [ASSUMED → needs Wave 0 smoke verification]

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│ apps/factory-cli  (filesystem authority + composition)                    │
│                                                                           │
│  run start ──► preflightDeliveryFast(env)  ──► reject if no PROTOSTAR_GH..│
│                                                                           │
│  …  Phases 1–6 …                                                          │
│                                                                           │
│  loop pass/pass ──► loadDeliveryAuthorization(decisionPath)               │
│                       │                                                   │
│                       ▼                                                   │
│  preflightDeliveryFull({ token, target }, ctx)  ──┐                      │
│                       │                            │   Octokit calls:    │
│                       ▼                            │   users.getAuth     │
│  build DeliveryExecutionPlan                       │   repos.get          │
│   ├ branch  : validateBranchName(template)         │   repos.getBranch    │
│   ├ title   : validatePrTitle(intent.title)        │                      │
│   ├ body    : assembleDeliveryBody(...composers)   │                      │
│   │           └ composeArtifactList(LIVE LIST)     │                      │
│   ├ target  : envelope.delivery.target             │                      │
│   └ artifacts : runs/{id}/* files                  │                      │
│                       │                            │                      │
│                       ▼                            │                      │
│  signal = AbortSignal.any([runSignal,             │                      │
│                            AbortSignal.timeout(    │                      │
│                              budget.deliveryWall   │                      │
│                              ClockMs)])            │                      │
│                       │                            │                      │
│                       ▼                            │                      │
│  executeDelivery(authorization, plan, ctx) ───────►│  packages/delivery-  │
│                       │                            │  runtime  (network)  │
│                       │                                                   │
│                       │      pushBranch (isomorphic-git push)             │
│                       │      findExistingPr (pulls.list head:owner:branch)│
│                       │      pulls.create   OR pulls.update body          │
│                       │      issues.createComment / updateComment         │
│                       │        (with <!-- protostar-evidence:{kind} -->)  │
│                       │      checks.listForRef (initial snapshot)         │
│                       │                                                   │
│                       ◄───── { status, prUrl, prNumber, headSha,          │
│                                baseSha, ciSnapshot, evidenceComments }    │
│                                                                           │
│  write delivery-result.json (tmp+rename, mutable)                        │
│  append ci-events.jsonl (append+fsync)                                   │
│                                                                           │
│  pollCiStatus(prRef, signal) async iterable ◄──────                      │
│   ├ each yield: append ci-events.jsonl, update delivery-result.json      │
│   ├ terminal verdict OR budget exhaustion → loop ends                    │
│   └ on exhaustion: ciVerdict = 'timeout-pending' (Phase 9 resumes)       │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

   nock fixtures (dev/test) ◄──── intercept api.github.com HTTP layer
   real GitHub               ◄──── Phase 10 DOG-04 only
```

### Recommended Project Structure

```
packages/
├── delivery/                       # PURE — no fs, no network
│   └── src/
│       ├── index.ts                # barrel re-exports
│       ├── delivery-contract.ts    # (existing) DeliveryAuthorization-pinned signature
│       ├── brands.ts               # BranchName/PrTitle/PrBody types + validators
│       ├── refusals.ts             # DeliveryRefusal discriminated union
│       ├── pr-body/
│       │   ├── compose-run-summary.ts
│       │   ├── compose-mechanical-summary.ts
│       │   ├── compose-judge-panel.ts        # uses score-sheet helper
│       │   ├── compose-score-sheet.ts        # Q-12 <details><summary>
│       │   ├── compose-repair-history.ts
│       │   ├── compose-artifact-list.ts      # DELIVER-06 anti-drift
│       │   ├── compose-footer.ts             # screenshots-deferred line
│       │   └── *.test.ts                     # snapshot tests per composer
│       ├── evidence-marker.ts                # constants for <!-- protostar-evidence:{kind} -->
│       └── *.test.ts
│
├── delivery-runtime/               # NEW — network only, NO fs imports
│   └── src/
│       ├── index.ts
│       ├── execute-delivery.ts     # entry; brand-typed signature
│       ├── push-branch.ts          # isomorphic-git wrapper, reuses onAuth pattern
│       ├── octokit-client.ts       # build Octokit w/ retry+throttling plugins
│       ├── preflight-fast.ts       # token presence + format check
│       ├── preflight-full.ts       # users.getAuthenticated + repos.get + repos.getBranch
│       ├── find-existing-pr.ts     # idempotency check (Q-18)
│       ├── post-evidence-comment.ts# create or update by marker
│       ├── poll-ci-status.ts       # async generator (Q-14)
│       ├── compute-ci-verdict.ts   # AND over requiredChecks allowlist
│       ├── map-octokit-error.ts    # error → DeliveryRefusal classifier
│       ├── branch-template.ts      # template + randomSuffix (crypto)
│       ├── no-fs.contract.test.ts  # static grep — zero fs imports
│       ├── no-merge.contract.test.ts # static grep — zero merge surfaces
│       ├── secret-leak.contract.test.ts  # token never appears in error.message etc.
│       ├── fixtures/
│       │   ├── nockBack/           # recorded fixtures (gitignored if real)
│       │   └── synthetic/          # hand-written fixtures for v0.1
│       └── *.test.ts
│
├── intent/
│   └── schema/confirmed-intent.schema.json  # bumped to 1.5.0
│   └── src/compute-delivery-allowed-hosts.ts  # NEW helper
│
apps/factory-cli/
└── src/
    ├── factory-config.schema.json (or wherever it lives) # adds delivery.requiredChecks
    ├── delivery-wiring.ts          # NEW — assembles composers + invokes executeDelivery
    ├── poll-ci-driver.ts           # NEW — drives pollCiStatus, persists artifacts
    └── main.ts                     # replaces lines 750/900/901
```

### Pattern 1: Branded I/O Entry (5-brand stack at executeDelivery)

**What:** Compile-time impossible to call `executeDelivery` with raw strings.
**When:** I/O entry seam where pre-validated input is structurally required.

```typescript
// Source: packages/review/src/delivery-authorization.ts (existing pattern)
// Target: packages/delivery/src/brands.ts (new)

const BranchNameBrand: unique symbol = Symbol("BranchName");
export type BranchName = string & { readonly [BranchNameBrand]: true };
// (similar PrTitle, PrBody)

export type DeliveryRefusal =
  | { readonly kind: 'invalid-branch'; readonly evidence: { input: string; regex: string } }
  | { readonly kind: 'invalid-title'; readonly evidence: { input: string; position?: number } }
  | { readonly kind: 'invalid-body'; readonly evidence: { input: string; position?: number } }
  | { readonly kind: 'oversized-body'; readonly evidence: { byteLength: number; limit: 60000 } }
  | { readonly kind: 'control-character'; readonly evidence: { input: string; position: number; codepoint: number } };

export function validateBranchName(s: string):
  | { readonly ok: true; readonly value: BranchName }
  | { readonly ok: false; readonly refusal: DeliveryRefusal } { /* ... */ }
```

```typescript
// Source: target signature for packages/delivery-runtime/src/execute-delivery.ts
// Mirrors Phase 5 Plan 05-13 contract pin.

export async function executeDelivery(
  authorization: DeliveryAuthorization,        // Phase 5 brand
  plan: {
    readonly branch: BranchName;               // Phase 7 brand
    readonly title: PrTitle;                   // Phase 7 brand
    readonly body: PrBody;                     // Phase 7 brand
    readonly target: DeliveryTarget;           // schema-derived
    readonly artifacts: readonly ArtifactRef[];
  },
  ctx: DeliveryRunContext
): Promise<DeliveryRunOutcome> { /* ... */ }
```

Negative `@ts-expect-error` test in `packages/delivery-runtime/src/execute-delivery.contract.test.ts`:

```typescript
// @ts-expect-error — raw string rejected for branch
await executeDelivery(auth, { branch: 'foo', title: validTitle, body: validBody, target, artifacts }, ctx);
```

### Pattern 2: `onAuth` shim for isomorphic-git push

**What:** Thread `PROTOSTAR_GITHUB_TOKEN` through isomorphic-git's auth callback.
**When:** Every push call.

```typescript
// Source: packages/repo/src/clone-workspace.ts:buildOnAuth (existing, REUSE shape)
// Target: packages/delivery-runtime/src/push-branch.ts

import git, { type AuthCallback } from "isomorphic-git";
import http from "isomorphic-git/http/node";

export function buildPushOnAuth(token: string): AuthCallback {
  let count = 0;
  return () => {
    count += 1;
    if (count > 2) return { cancel: true };  // matches clone-workspace pattern
    if (token.length === 0) return { cancel: true };
    return { username: token, password: "x-oauth-basic" };
  };
}

export async function pushBranch(input: {
  readonly workspaceDir: string;
  readonly branchName: string;
  readonly remoteUrl: string;     // computed from delivery.target
  readonly token: string;
  readonly signal: AbortSignal;
  readonly fs: typeof import("node:fs");  // INJECTED by factory-cli (delivery-runtime is fs-forbidden)
}): Promise<PushResult> {
  // Note: `fs` is INJECTED, not imported — keeps no-fs.contract.test green.
  // ⚠️ THIS IS A HARD CONSTRAINT — see Pitfall 1.
  const result = await git.push({
    fs: input.fs,
    http,
    dir: input.workspaceDir,
    url: input.remoteUrl,
    ref: input.branchName,
    onAuth: buildPushOnAuth(input.token),
    // signal threading: isomorphic-git does NOT accept AbortSignal directly on push.
    // Workaround: race the push against signal.aborted; abort cancels via onAuth().
  });
  if (!result.ok) { /* map to DeliveryRefusal */ }
  return /* ... */;
}
```

> **Note:** Existing Phase 3 shim uses `password: "x-oauth-basic"`. CONTEXT.md Q-03 mentions `{ username: 'x-access-token', password: PAT }`. **Both work for GitHub PATs** per [isomorphic-git authentication docs](https://isomorphic-git.org/docs/en/authentication). Recommend Phase 3 form for symmetry. [VERIFIED: Context7 isomorphic-git docs]

> **isomorphic-git push response shape** (verified):
> ```js
> // success
> { ok: true, refs: { 'refs/heads/feature': { ok: true } } }
> // failure
> { ok: false, errors: [...], refs: {...} }
> ```
> Use `result.refs[`refs/heads/${branchName}`].ok` to confirm the ref update.

### Pattern 3: Hierarchical AbortSignal

**What:** Compose run-level + delivery-level + per-call signals.
**When:** Every Octokit and isomorphic-git call inside delivery.

```typescript
// Source: target apps/factory-cli/src/poll-ci-driver.ts
// Pattern: Phase 6 Q-11 (locked; Phase 6 in flight — factory-config piles block + executionCoordinationPilePreset rename already shipped).
// Node 22 has AbortSignal.any natively. [VERIFIED: node -e check, v22.22.1]

const deliverySignal = AbortSignal.any([
  ctx.runSignal,
  AbortSignal.timeout(envelope.budget.deliveryWallClockMs)
]);

// Each Octokit call:
await octokit.rest.pulls.create({
  owner, repo, title, head, base, body,
  request: { signal: deliverySignal }
});

// Distinguish reasons:
if (deliverySignal.aborted) {
  switch (deliverySignal.reason) {
    case 'sigint':    // run-level
    case 'timeout':   // delivery cap
    case 'sentinel':  // Phase 4 sentinel
  }
}
```

### Pattern 4: nockBack record-once + replay

**What:** Record real GitHub responses once into JSON, replay forever in CI.
**When:** Phase 7 v0.1 has zero real-GitHub coverage; only Phase 10 records.

```typescript
// Source: nock README (Context7) §Nock Back
import { back as nockBack } from "nock";

nockBack.fixtures = `${import.meta.dirname}/fixtures/nockBack`;
nockBack.setMode('lockdown');  // disallows any unmocked HTTP in tests

// In each test:
const { nockDone } = await nockBack('pr-create-success.json');
// ... run code that makes Octokit calls ...
nockDone();  // throws if any nock was unfulfilled
```

**Modes:**
- `'lockdown'` — replay only; throw if real HTTP attempted (CI mode)
- `'record'` — record real HTTP into fixture file (operator mode, for Phase 10 to capture against toy repo)
- `'dryrun'` — replay if fixture exists, else allow real HTTP (default; avoid in CI)

**Recommended Wave 0 task:** Author one fixture by hand (`pulls.create-success.json`) without recording, then validate the test harness; only switch to recorded fixtures when a real GitHub target exists in Phase 10.

### Pattern 5: Two-step CI capture (mutable post-run artifact)

**What:** `delivery-result.json` is the only file in `runs/{id}/` that updates after run completion.
**When:** Q-16 polling continuation; Phase 9 `--capture-ci`.

```typescript
// Pseudocode for poll-ci-driver
for await (const snap of pollCiStatus(prRef, deliverySignal)) {
  await appendJsonl(`runs/${runId}/delivery/ci-events.jsonl`, snap);
  await writeFileAtomic(  // tmp+rename
    `runs/${runId}/delivery/delivery-result.json`,
    {
      ...current,
      ciSnapshots: rollWindow(current.ciSnapshots, snap, { keepLast: 10, keepFirst: 1 }),
      ciVerdict: snap.verdict ?? 'pending',
      ciVerdictUpdatedAt: snap.at
    }
  );
  if (snap.terminal) break;
}
```

### Anti-Patterns to Avoid

- **Logging the token in error messages.** Octokit does NOT auto-redact bearer tokens in error stacks. Wrap every Octokit call in a `mapOctokitErrorToRefusal` function that strips `request.headers.authorization` before persisting. See Pitfall 4.
- **Calling `merge` anywhere.** No `pulls.merge`, `enableAutoMerge`, `merge_method` strings in source. Static grep contract test enforces.
- **Hardcoded artifact filenames in PR body composers.** `composeArtifactList` MUST take the live list. Drift contract test asserts.
- **Filesystem imports in `delivery-runtime`.** Inject `fs` from `factory-cli`. Static no-fs contract test enforces.
- **Catching and silencing nock unfulfilled-mock errors.** `nockDone()` throwing means a fixture is wrong; never wrap in try/catch.
- **Using `force: true` on push.** Q-03 requires force-with-lease semantics. isomorphic-git doesn't have native force-with-lease — emulate by reading the remote ref pre-push (`git.fetch` + `git.resolveRef` against the remote tracking branch) and refusing to push if the remote SHA differs from a known previous SHA. See Pitfall 5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry on Octokit 5xx | Custom retry loop | `@octokit/plugin-retry` | Battle-tested; respects `Retry-After`; integrates with throttling. [CITED: Octokit docs] |
| Rate-limit handling | Manual `X-RateLimit-Remaining` parsing | `@octokit/plugin-throttling` | Handles primary + secondary rate limits; configurable callback. [CITED: Octokit docs] |
| HTTP request mocking | Manual `fetch` stubs | `nock` (or `msw` if nock fails) | Recorded fixtures travel with tests; deterministic. |
| Git push protocol | Subprocess to system git | `isomorphic-git` `push()` | Already in dep graph (Phase 3); pure-JS; deterministic. |
| GitHub PAT format checks | Custom regex from memory | Regex below in "Code Examples" | Get the regex right (CONTEXT.md Q-06 has a bug — see Pitfall 2). |
| JSON canonicalization for signed envelope | Hand-rolled JSON formatter | Reuse Phase 2's `json-c14n@1.0` helper | Cascade signed-intent regeneration uses existing tooling. |
| AbortSignal composition | Manual controller chaining | Native `AbortSignal.any` + `AbortSignal.timeout` | Node ≥22.3 supported, this repo is on 22.22.1. [VERIFIED: node -e check] |

**Key insight:** Octokit ships a complete plugin ecosystem (retry/throttling/auth-app/auth-token) — composing the right plugins is the design pattern, not writing wrappers around them. The `delivery-runtime` package's main job is policy translation (DeliveryRefusal discriminator, `<!-- protostar-evidence:{kind} -->` markers, idempotent re-delivery), not Octokit re-implementation.

## Runtime State Inventory

> Phase 7 is greenfield-ish (new package + schema bump + new artifacts). The only "rename / refactor" surface is the `confirmedIntent 1.4.0 → 1.5.0` bump. Inventory:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 7 introduces new artifacts (`delivery-result.json`, `ci-events.jsonl`); no existing `runs/{id}/` data needs migration. | None. |
| Live service config | None — no live services configured by Phase 7. (Phase 10 will create the toy GitHub repo.) | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | New env var `PROTOSTAR_GITHUB_TOKEN`. `.env.example` currently has `GITHUB_PAT=` (blank) — replace or add. | Update `.env.example`. Document scopes: classic = `repo` (private) or `public_repo` (public); fine-grained = Contents R/W + Pull requests R/W + Metadata R. |
| Build artifacts | None. New `dist/` for `delivery-runtime`. | Standard `pnpm install` after package add. |

**Schema-cascade audit (`1.4.0 → 1.5.0`)** — all files referencing the literal `"1.4.0"`:

```
packages/admission-e2e/src/signed-intent-1-4-0.test.ts          # rename file → signed-intent-1-5-0
packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts
packages/intent/schema/confirmed-intent.schema.json             # bump const
packages/intent/src/confirmed-intent.test.ts
packages/intent/src/promote-intent-draft.ts
packages/intent/src/public-split-exports.contract.test.ts
packages/intent/src/confirmed-intent-immutability.test.ts
packages/intent/src/capability-envelope.test.ts
packages/intent/src/confirmed-intent.ts
packages/intent/src/acceptance-criteria-normalization.test.ts
packages/intent/src/internal/test-builders.ts
packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts
packages/authority/src/signature/sign-verify.test.ts
packages/authority/src/stage-reader/factory.ts
packages/authority/src/stage-reader/factory.test.ts
examples/intents/bad/missing-capability.json                     # signed
examples/intents/scaffold.json                                   # signed (HAS SIGNATURE — re-sign)
apps/factory-cli/src/run-real-execution.test.ts
```

[VERIFIED: `grep -rln "1\.4\.0"` 2026-04-28]

This is the same Pitfall 7 from Phase 4 — coordinate as a single Wave 0 task. The signed `examples/intents/scaffold.json` and `examples/intents/bad/missing-capability.json` need resigning via Phase 2's c14n + signature pipeline.

## Common Pitfalls

### Pitfall 1: Static no-fs grep test will fail if you import `node:fs` in `delivery-runtime`

**What goes wrong:** `delivery-runtime` is the new fs-FORBIDDEN, network-permitted package. Even importing `import * as fs from "node:fs"` solely for `git.push({ fs, ... })` violates the contract.
**Why it happens:** isomorphic-git takes `fs` as a required parameter — natural reflex is to import it.
**How to avoid:** **Inject `fs` from the caller** (`apps/factory-cli`). The test harness can inject `node:fs/promises` directly; production code receives it from `factory-cli`'s assembly seam. Mirror Phase 5 mechanical-checks adapter pattern (injected `readFile` + `RepoSubprocessRunner`).
**Warning signs:** `pnpm --filter @protostar/delivery-runtime test` fails on `no-fs.contract.test.ts`.

### Pitfall 2: Token regex in CONTEXT.md Q-06 misses fine-grained PATs entirely

**What goes wrong:** CONTEXT.md Q-06 specifies `^gh[pousr]_[A-Za-z0-9]{36,}$`. The load-bearing gap:
1. **Fine-grained PATs use prefix `github_pat_`** and total ~93 chars: `^github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}$`. The `gh[pousr]_` regex doesn't match them at all — operators using fine-grained PATs are rejected at fast preflight as `token-invalid` even though the token is valid.
2. (Minor) Classic PATs are exactly **36 chars** after the prefix (40 total). `{36,}` is defensively over-permissive — that's a stylistic call, not a bug; either `{36}` (exact match) or `{36,}` (length-flexible) works against today's tokens. Pick whichever you prefer.

**Why it happens:** Token format docs are scattered; CONTEXT.md was written from memory.
**How to avoid:** Use a UNION regex:

```typescript
// Source: GitHub token format research (sources below)
const CLASSIC_PAT = /^gh[pousr]_[A-Za-z0-9]{36}$/;
const FINE_GRAINED_PAT = /^github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}$/;
const isValidGitHubToken = (s: string) => CLASSIC_PAT.test(s) || FINE_GRAINED_PAT.test(s);
```

[VERIFIED: [magnetikonline gist on GitHub token regexes](https://gist.github.com/magnetikonline/073afe7909ffdd6f10ef06a00bc3bc88), [GitHub Blog: New token formats](https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/)]
**Warning signs:** Operator with a fine-grained PAT (`github_pat_…`) gets rejected by fast preflight as `token-invalid`.

### Pitfall 3: GitHub body limit is BYTES not chars in CONTEXT.md Q-09

**What goes wrong:** CONTEXT.md Q-09 says "GitHub limits are 256/65536". Actually:
- PR body is stored as MySQL `mediumblob` = **262,144 bytes** = 65,536 4-byte unicode chars max.
- PR title has no documented hard limit (truncated UI-side to ~70 chars).

**Why it happens:** `65536` ambiguously means chars-or-bytes.
**How to avoid:** Q-09's 60_000-byte cap is conservative and SAFE — keep it. But document that the underlying GitHub limit is 262,144 bytes, not 65_536. Update CONCERNS.md addendum to clarify. The 60k byte cap is well within the real limit, so behavior is correct; only the comment/docs need fixing.
[VERIFIED: [GitHub Discussion on body length limit](https://github.com/orgs/community/discussions/27190); [renovatebot issue confirming 65536 charlimit](https://github.com/renovatebot/renovate/issues/14551); MySQL mediumblob spec.]
**Warning signs:** A reviewer audits the Q-09 documentation and finds it confusing.

### Pitfall 4: Octokit does NOT redact tokens in error objects

**What goes wrong:** Octokit's `RequestError` has a `response.headers` field that may include the `authorization` request header in some logging paths. Throwing the raw error from `executeDelivery` could leak the token into `delivery-result.json`'s error field.
**Why it happens:** No auto-redaction. Token leaks happen by default when stack traces or error JSON serializations include `request.headers`.
**How to avoid:** Wrap every Octokit call in a try/catch + `mapOctokitErrorToRefusal(err): DeliveryRefusal` that:
1. Pulls `err.status`, `err.message`, `err.response?.data?.message`.
2. Strips `err.request?.headers?.authorization` and any header whose name matches `/auth|token|cookie/i`.
3. Returns a typed `DeliveryRefusal` with bounded evidence.

**Contract test:** After every test case, grep `runs/{id}/**` (test temp dir) for the literal token string — assert zero matches.
**Warning signs:** Token string appears in `delivery-result.json` error field, `ci-events.jsonl`, or stderr.

### Pitfall 5: isomorphic-git has no native force-with-lease

**What goes wrong:** Q-03 specifies `--force-with-lease`-equivalent guard. isomorphic-git's `push({ force: true })` is a blind force; there's no `forceWithLease` parameter.
**Why it happens:** isomorphic-git is closer to git plumbing than porcelain; lease semantics live in `git push --force-with-lease` only.
**How to avoid:** Implement lease emulation in `pushBranch`:
1. Before push, call `git.fetch({ ref: branchName })` against the remote.
2. Compare the fetched remote SHA with the SHA we expected (from a prior delivery's `delivery-result.json.headSha`, or `null` for first push).
3. If mismatched (and we expected a SHA), refuse with `DeliveryRefusal { kind: 'remote-diverged' }`.
4. If matched OR ref doesn't exist remotely, push with `force: false` (initial) or `force: true` (subsequent re-push under matching lease).

**Idempotency tie-in:** Q-18 already requires `findExistingPr` — extend to read the remote head SHA via Octokit `repos.getBranch`. If we already pushed this branch and the remote SHA matches our last recorded `headSha`, the re-push is a no-op (isomorphic-git returns `ok: true` with no ref updates).
**Warning signs:** `git.push` returns `ok: false` with `errors: ['non-fast-forward']` and we don't have logic to distinguish "I'm replacing my own previous push" from "someone else changed the branch."

### Pitfall 6: nock + Octokit-22 fetch interception may break

**What goes wrong:** Octokit major 21+ uses native `fetch`. Nock historically struggles with native fetch interception on Node 18-22. If nock 14 fails to intercept Octokit's HTTP layer, all v0.1 tests silently make real HTTP calls (or hang).
**Why it happens:** nock patches `http.request`; native `fetch` uses `undici` internally with a different intercept surface.
**How to avoid:** **Wave 0 smoke test first** — write one trivial test:
```typescript
import { Octokit } from "@octokit/rest";
import nock from "nock";

const scope = nock('https://api.github.com').get('/user').reply(200, { login: 'test' });
nock.disableNetConnect();
const o = new Octokit({ auth: 'ghp_x' });
const r = await o.rest.users.getAuthenticated();
assert.equal(r.data.login, 'test');
scope.done();
```

If this fails, fall back to `msw` (Mock Service Worker) — better fetch story, same dev-dep posture, fixtures slightly different (handlers vs JSON).
[CITED: [Code with Hugo: Nock on Node 18/20/22 Fails to Intercept fetch](https://codewithhugo.com/nock-node-18-20-22-fails-to-intercept-fetch/)]
**Warning signs:** Test hangs (real HTTP called), or fails with `getaddrinfo ENOTFOUND api.github.com`.

### Pitfall 7: Schema cascade — same as Phase 4 Pitfall 7

**What goes wrong:** Bumping `confirmedIntent 1.4.0 → 1.5.0` without regenerating signed fixtures (`examples/intents/scaffold.json`, `examples/intents/bad/missing-capability.json`) breaks every test that reads them.
**How to avoid:** Single coordinated Wave 0 task. See "Schema-cascade audit" table above — 19 files reference `1.4.0`. Use `sed` for the literal bump where appropriate; re-sign the two signed fixtures via Phase 2's signature pipeline.
**Warning signs:** Wave 1 plans fail with "schemaVersion expected '1.5.0' got '1.4.0'".

### Pitfall 8: `<details>` rendering inside markdown tables breaks GitHub rendering

**What goes wrong:** GitHub markdown renders `<details>` HTML correctly inline, BUT placing `<details>` inside a markdown table cell breaks the table parser.
**Why it happens:** GitHub's markdown engine doesn't allow block-level HTML inside table cells.
**How to avoid:** Q-12's score-sheet structure should be:
```markdown
| Judge | Model | Verdict | Mean Score |
|-------|-------|---------|------------|
| j1    | qwen3 | pass    | 4.2        |

<details><summary>j1 rationale</summary>...</details>

<details><summary>j2 rationale</summary>...</details>
```
NOT:
```markdown
| Judge | Rationale (BAD) |
|-------|-----------------|
| j1    | <details>...</details> |
```
**Warning signs:** Snapshot test produces visually broken table when rendered on github.com.

### Pitfall 9: Comment-marker collision risk

**What goes wrong:** `<!-- protostar-evidence:{kind} -->` is detectable by anyone — a reviewer could type the same string in their own comment, causing re-delivery to update *their* comment instead of ours.
**Why it happens:** No way to prevent operator-typed strings from matching.
**How to avoid:** Make the marker include the runId: `<!-- protostar-evidence:{kind}:{runId} -->`. Re-delivery for the same run matches; reviewers can't accidentally type a real runId.
**Warning signs:** Re-delivery test where a reviewer comment includes the marker — assert we don't update that comment.

### Pitfall 10: Branch-collision under second-precision runIds

**What goes wrong:** Q-07 already calls this out. Random suffix solves it. Verify the random algorithm provides ≥24 bits of entropy.
**How to avoid:** `crypto.randomBytes(4).toString('hex')` = 8 hex chars = 32 bits. Safe.


### Pitfall 11: `isomorphic-git` push() has no native AbortSignal — cancel is best-effort via `onAuth`

**What goes wrong:** Q-19 makes hierarchical AbortSignal load-bearing for cancel during delivery. `isomorphic-git`'s `push()` parameters list `onAuth | onAuthFailure | onAuthSuccess | onProgress | onMessage | onPrePush` callbacks but **no `signal` parameter** [VERIFIED: Context7 isomorphic-git push API spec, 2026-04-28]. Once the auth handshake completes and the pack upload begins, there is no documented way to interrupt the push mid-stream from outside the callbacks.
**Why it happens:** isomorphic-git's HTTP transport doesn't currently surface an abort hook to push().
**How to avoid:** Implement a **two-layer cancel strategy**:
1. **Pre-push abort:** Check `signal.aborted` immediately before `git.push()`. If aborted, refuse with `cancelled` and skip the call entirely.
2. **Auth-loop abort:** In `buildPushOnAuth`, check `signal.aborted` on every invocation and return `{ cancel: true }` if so. This kills the push between auth attempts.
3. **Post-push reconcile:** Accept that an in-flight push CANNOT be interrupted. Document this in CONCERNS as a Q-19 caveat. Recovery via Q-18 idempotency: on next run, `findExistingPr` + remote-SHA check (Pitfall 5) reconcile any partial-push state.

**Octokit calls have proper signal support** (verified via Context7); only the push step has this constraint.
**Warning signs:** SIGINT during a large pack upload doesn't terminate the process within seconds; tests of "cancel during push" expect immediate termination but observe the push completing first.

## Code Examples

Verified patterns from official sources / existing codebase.

### Octokit client construction with retry + throttling

```typescript
// Source: https://github.com/octokit/rest.js README §Plugins (verified 2026-04-28 via Context7)
import { Octokit } from "@octokit/rest";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";

const ProtostarOctokit = Octokit.plugin(retry, throttling);

export function buildOctokit(token: string): InstanceType<typeof ProtostarOctokit> {
  return new ProtostarOctokit({
    auth: token,
    userAgent: "protostar-factory/0.0.0",
    throttle: {
      onRateLimit: (retryAfter, options, _octokit, retryCount) => {
        if (retryCount < 2) return true;
        return false;
      },
      onSecondaryRateLimit: () => false  // never retry secondary (abuse)
    },
    retry: { doNotRetry: [400, 401, 403, 404, 422] }  // hard refusals never retry
  });
}
```

### Idempotency: find existing PR by head branch

```typescript
// Source: https://github.com/octokit/rest.js (verified via Context7)
// CONTEXT.md Q-18.

const result = await octokit.rest.pulls.list({
  owner: target.owner,
  repo: target.repo,
  head: `${target.owner}:${branch}`,  // CRITICAL: 'owner:branch' filter form
  state: "all",
  per_page: 10,  // shouldn't return many
  request: { signal: deliverySignal }
});

if (result.data.length === 0) return null;
if (result.data.length > 1) return { kind: 'pr-ambiguous', prs: result.data.map(p => p.html_url) };

const pr = result.data[0]!;
return { pr, isClosed: pr.state === 'closed' };
```

### CI verdict over allowlist (Q-15)

```typescript
// Source: target packages/delivery-runtime/src/compute-ci-verdict.ts
// Octokit endpoint: GET /repos/{owner}/{repo}/commits/{ref}/check-runs
//   → octokit.rest.checks.listForRef
// Response: { total_count, check_runs: [{ name, status, conclusion, ... }] }

export type CiVerdict = 'pass' | 'fail' | 'pending' | 'no-checks-configured';

export function computeCiVerdict(
  checkRuns: readonly { name: string; status: string; conclusion: string | null }[],
  requiredChecks: readonly string[]
): CiVerdict {
  if (requiredChecks.length === 0) return 'no-checks-configured';
  const required = checkRuns.filter(c => requiredChecks.includes(c.name));
  if (required.length < requiredChecks.length) return 'pending';  // some missing
  for (const c of required) {
    if (c.status !== 'completed') return 'pending';
    if (c.conclusion === 'failure' || c.conclusion === 'cancelled' ||
        c.conclusion === 'timed_out' || c.conclusion === 'action_required') return 'fail';
  }
  return required.every(c => c.conclusion === 'success' || c.conclusion === 'neutral' || c.conclusion === 'skipped')
    ? 'pass' : 'pending';
}
```

**Check run conclusion enum** (from GitHub API): `success | failure | neutral | cancelled | timed_out | action_required | skipped | stale | startup_failure`. Of these, `success`/`neutral`/`skipped` count toward pass; `failure`/`cancelled`/`timed_out`/`action_required` count as fail; others are intermediate. [CITED: [GitHub Check Runs API docs](https://docs.github.com/en/rest/checks/runs?apiVersion=2022-11-28#list-check-runs-for-a-git-reference)]

### nock fixture replay pattern

```typescript
// Source: https://github.com/nock/nock README §Nock Back (verified via Context7)
import { back as nockBack } from "nock";
import { describe, it, before, after } from "node:test";

describe("executeDelivery happy path", () => {
  before(() => {
    nockBack.fixtures = `${import.meta.dirname}/fixtures/nockBack`;
    nockBack.setMode('lockdown');
  });

  it("creates PR + posts evidence comments + captures first CI snapshot", async () => {
    const { nockDone } = await nockBack('happy-path-cosmetic-tweak.json');
    const result = await executeDelivery(authorization, plan, ctx);
    nockDone();  // throws if any expected nock unfulfilled
    assert.equal(result.status, 'delivered');
    assert.match(result.prUrl, /^https:\/\/github\.com\//);
  });
});
```

### Delivery preflight (full)

```typescript
// Source: target packages/delivery-runtime/src/preflight-full.ts
// Mirrors Phase 4 packages/lmstudio-adapter/src/preflight.ts pattern.

export type DeliveryPreflightResult =
  | { readonly outcome: 'ok'; readonly tokenLogin: string; readonly baseSha: string; readonly tokenScopes: readonly string[] }
  | { readonly outcome: 'token-missing' }
  | { readonly outcome: 'token-invalid'; readonly reason: 'format' | '401' }
  | { readonly outcome: 'repo-inaccessible'; readonly status: 403 | 404 }
  | { readonly outcome: 'base-branch-missing'; readonly baseBranch: string }
  | { readonly outcome: 'excessive-pat-scope'; readonly scopes: readonly string[]; readonly forbidden: readonly string[] };

const FORBIDDEN_SCOPES = ['admin:org', 'admin:repo_hook', 'admin:public_key', 'delete_repo', 'site_admin'] as const;

export async function preflightDeliveryFull(
  input: { token: string; target: DeliveryTarget; signal: AbortSignal },
  octokit: Octokit
): Promise<DeliveryPreflightResult> {
  // 1. users.getAuthenticated → token valid + scopes
  let auth;
  try {
    auth = await octokit.rest.users.getAuthenticated({ request: { signal: input.signal } });
  } catch (e: any) {
    if (e.status === 401) return { outcome: 'token-invalid', reason: '401' };
    throw e;
  }
  // X-OAuth-Scopes header on classic PATs; absent on fine-grained (default-deny posture)
  const scopes = (auth.headers['x-oauth-scopes'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const forbidden = scopes.filter(s => FORBIDDEN_SCOPES.includes(s as any));
  if (forbidden.length > 0) return { outcome: 'excessive-pat-scope', scopes, forbidden };

  // 2. repos.get → repo accessible
  try {
    await octokit.rest.repos.get({ owner: input.target.owner, repo: input.target.repo, request: { signal: input.signal } });
  } catch (e: any) {
    if (e.status === 403 || e.status === 404) return { outcome: 'repo-inaccessible', status: e.status };
    throw e;
  }

  // 3. repos.getBranch → base SHA exists
  let branch;
  try {
    branch = await octokit.rest.repos.getBranch({ owner: input.target.owner, repo: input.target.repo, branch: input.target.baseBranch, request: { signal: input.signal } });
  } catch (e: any) {
    if (e.status === 404) return { outcome: 'base-branch-missing', baseBranch: input.target.baseBranch };
    throw e;
  }

  return { outcome: 'ok', tokenLogin: auth.data.login, baseSha: branch.data.commit.sha, tokenScopes: scopes };
}
```

### `computeDeliveryAllowedHosts` helper

```typescript
// Source: target packages/intent/src/compute-delivery-allowed-hosts.ts
// CONTEXT.md Q-05 — allowedHosts is computed, not stored.

export function computeDeliveryAllowedHosts(
  delivery: { readonly target: { readonly owner: string; readonly repo: string; readonly baseBranch: string } } | undefined,
  options?: { readonly attachmentsEnabled?: boolean }
): readonly string[] {
  if (delivery === undefined) return [];
  const hosts: string[] = ['api.github.com', 'github.com'];  // github.com for git push transport
  if (options?.attachmentsEnabled === true) hosts.push('uploads.github.com');
  return Object.freeze(hosts);
}
```

> **Note:** I added `'github.com'` to the host list because `isomorphic-git push` against GitHub uses `https://github.com/{owner}/{repo}.git` — not `api.github.com`. Q-05's "computed `['api.github.com']` plus `'uploads.github.com'`" omits `github.com` for git transport. **Flag for planner:** verify what host the `network.allow=allowlist` policy must include for git transport to work; consider adding `'github.com'` explicitly.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled `gh pr create` argv | `@octokit/rest` Octokit invocation | Phase 7 Q-02 | Eliminates external CLI dep; testable via nock. |
| Manual retry loops | `@octokit/plugin-retry` + `@octokit/plugin-throttling` | Phase 7 (this research) | Standard ecosystem composition; respects `Retry-After`. |
| Subprocess git push | `isomorphic-git` push() | Phase 3 lock; reused Phase 7 | Pure-JS; deterministic; no shell-injection surface. |
| Single-flat AbortController | Hierarchical `AbortSignal.any` + `AbortSignal.timeout` | Node 22 stable | Cleaner cancel semantics; matches Phase 6 pattern. |
| Classic PAT only | Classic + fine-grained PAT support | Phase 7 Q-06 | Recognize both prefix patterns. |

**Deprecated/outdated:**
- `node-fetch` polyfill in Octokit — Octokit ≥21 uses native `fetch`. Don't add `node-fetch` as a dep.
- `nock-back` JSON file format `request.headers` recording — strip the `authorization` header from recorded fixtures before committing (secret-leak risk).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Phase 7 stack | ✓ | v22.22.1 | — (Node ≥22 mandated by package.json engines) |
| `AbortSignal.any` | Hierarchical cancel | ✓ | Native (Node 22) | — |
| `AbortSignal.timeout` | Per-delivery cap | ✓ | Native (Node 22) | — |
| `crypto.randomBytes` | Random branch suffix | ✓ | Native | — |
| pnpm | Workspace registration | ✓ | 10.33.0 (lock) | — |
| TypeScript | Strict typing | ✓ | ^6.0.3 | — |
| `@octokit/rest` | PR/issues/checks | (to install) | ^22.0.1 | None (locked Q-02) |
| `isomorphic-git` | Branch push | ✓ | 1.37.6 (Phase 3) | — |
| `nock` | Test fixtures | (to install dev) | ^14.0.13 | `msw` if nock fails fetch interception (Pitfall 6) |
| `@octokit/plugin-retry` | Transient retries | (to install) | ^7 | Hand-rolled retry (not recommended) |
| `@octokit/plugin-throttling` | Rate-limit safety | (to install) | ^9 | None (defense-in-depth) |
| GitHub PAT (`PROTOSTAR_GITHUB_TOKEN`) | Real-GitHub testing | ✗ (operator must supply) | — | nock fixtures (default v0.1 path) |
| Toy GitHub repo | Real PR target | ✗ (Phase 10 dependency) | — | None — explicit Phase 10 handoff |

**Missing dependencies with no fallback:**
- None for Phase 7 v0.1 implementation.

**Missing dependencies with fallback:**
- Real GitHub access — fall back to nock fixtures (Q-20 lock).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) |
| Config file | None — package.json `test` script per package: `pnpm run build && node --test dist/**/*.test.js` |
| Quick run command | `pnpm --filter @protostar/delivery test` and `pnpm --filter @protostar/delivery-runtime test` |
| Full suite command | `pnpm run verify:full` (root) — typecheck + every package's tests |
| Smoke command | `pnpm run factory` — builds; will stop at workspace-trust gate (expected pre-Phase 10) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DELIVER-01 | `executeDelivery` returns real PR URL via Octokit | integration (nock) | `pnpm --filter @protostar/delivery-runtime test` | ❌ Wave 0 |
| DELIVER-02 | Branch/title/body validators mint brands; refuse invalid input | unit + type-level | `pnpm --filter @protostar/delivery test` (incl. `@ts-expect-error`) | ❌ Wave 0 |
| DELIVER-03 | PR body composition assembles all sections | unit (snapshot per composer) | same | ❌ Wave 0 |
| DELIVER-04 | `pollCiStatus` async iterable yields snapshots | integration (nock) | `pnpm --filter @protostar/delivery-runtime test` | ❌ Wave 0 |
| DELIVER-05 | `delivery-result.json` schema | unit (factory-cli writer) + admission-e2e contract | `pnpm --filter @protostar/factory-cli test` + `pnpm --filter @protostar/admission-e2e test` | ❌ Wave 0 |
| DELIVER-06 | Body artifact list matches live artifacts (no drift) | drift contract test | `pnpm --filter @protostar/delivery test` | ❌ Wave 0 |
| DELIVER-07 | No merge surface anywhere | static contract test (grep) | `pnpm --filter @protostar/delivery-runtime test` | ❌ Wave 0 |

### Required Contract Tests (planner must include)

1. **`packages/delivery-runtime/src/no-fs.contract.test.ts`** — static grep over `src/**/*.ts` for `from "node:fs"`, `from "fs"`, `from "node:path"`, `import("node:fs")`. Assert zero matches outside test files. Mirror Phase 6 Q-09 pattern.
2. **`packages/delivery-runtime/src/no-merge.contract.test.ts`** — static grep for `pulls.merge`, `pulls.updateBranch`, `enableAutoMerge`, `merge_method`, `automerge`. Assert zero matches.
3. **`packages/delivery-runtime/src/secret-leak.contract.test.ts`** — run a delivery with token `ghp_TEST_FAKE_TOKEN_FORMATTED_LIKE_REAL_xxxxx` against nock; after, grep all artifacts in test runDir for that string; assert zero matches.
4. **`packages/delivery/src/brand-rejects-raw-string.contract.test.ts`** — type-level `@ts-expect-error` cases proving raw strings fail to satisfy `BranchName`/`PrTitle`/`PrBody`.
5. **`packages/delivery/src/artifact-list-no-drift.contract.test.ts`** — call `composeArtifactList([{ uri: 'a.json', ... }])` then grep for any hardcoded filename that might appear in the body and isn't in the input list; assert clean.
6. **`packages/admission-e2e/src/delivery-result-schema.contract.test.ts`** — fixture-based round-trip of `delivery-result.json` matching the documented Q-17 schema.
7. **`packages/admission-e2e/src/signed-intent-1-5-0.test.ts`** — replaces existing `signed-intent-1-4-0.test.ts`; verifies the bumped envelope has `delivery.target` + `budget.deliveryWallClockMs`.

### Sampling Rate

- **Per task commit:** `pnpm --filter @protostar/{delivery,delivery-runtime} test` (target: <30s)
- **Per wave merge:** `pnpm run verify` (root, fast subset)
- **Phase gate:** `pnpm run verify:full` green; `pnpm run factory` build succeeds (still stops at workspace-trust gate); admission-e2e contracts green.

### Wave 0 Gaps

- [ ] `packages/delivery-runtime/package.json` + `src/index.ts` skeleton — covers DELIVER-01..04
- [ ] `packages/delivery-runtime/src/no-fs.contract.test.ts` — covers AGENTS.md authority boundary
- [ ] `packages/delivery-runtime/src/no-merge.contract.test.ts` — covers DELIVER-07
- [ ] `packages/delivery-runtime/src/secret-leak.contract.test.ts` — covers Q-04 token-never-persisted
- [ ] **Wave 0 nock-vs-fetch smoke test** — verify nock 14 intercepts Octokit 22's HTTP layer; if not, swap to msw before further tasks (Pitfall 6)
- [ ] `packages/intent/schema/confirmed-intent.schema.json` bump 1.4.0 → 1.5.0 — covers Q-05 + Q-14
- [ ] Schema cascade: 19 files (see Runtime State Inventory) — single coordinated task
- [ ] `packages/intent/src/compute-delivery-allowed-hosts.ts` — covers Q-05 computed hosts
- [ ] `apps/factory-cli/src/factory-config.schema.json` extend with `delivery.requiredChecks` — covers Q-15
- [ ] `pnpm-workspace.yaml`, root `tsconfig.json`, root `verify` script — register new package
- [ ] `.env.example` — add `PROTOSTAR_GITHUB_TOKEN` with scope docs (Q-04)
- [ ] `AGENTS.md` — add network-permitted/fs-forbidden tier; list `delivery-runtime` alongside `dogpile-adapter`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | GitHub PAT in env var; format-validated; never persisted |
| V3 Session Management | no | Stateless API client |
| V4 Access Control | yes | Branded `DeliveryAuthorization` (Phase 5) gates entry; signed `delivery.target` is tamper-evident |
| V5 Input Validation | yes | `BranchName`/`PrTitle`/`PrBody` brand-mint validators (Q-08) |
| V6 Cryptography | yes | `crypto.randomBytes` for branch suffix; SHA-256 for envelope signature (Phase 2 reuse) |
| V7 Error Handling | yes | `mapOctokitErrorToRefusal` strips token from error fields (Pitfall 4) |
| V8 Data Protection | yes | secret-leak contract test asserts token never in artifacts |
| V9 Communication | yes | `network.allow=allowlist` + computed allowedHosts; HTTPS-only (Octokit default) |
| V10 Malicious Code | yes | Static grep contract tests forbid `merge*`/`enableAutoMerge` |

### Known Threat Patterns for {Octokit + isomorphic-git stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token leak via error stack trace | Information Disclosure | `mapOctokitErrorToRefusal` redacts auth headers; secret-leak contract test |
| Branch-name shell injection (legacy `gh pr create`) | Tampering / Elevation | Eliminated by Q-02 (Octokit only); `BranchName` brand validation defense in depth |
| PR title/body XSS into reviewer's clipboard | Information Disclosure | GitHub renders comments server-side; control-char rejection in validators (Q-09) |
| Excessive PAT scope (admin) used for benign delivery | Elevation of Privilege | `excessive-pat-scope` refusal at preflight (Q-20) |
| Secondary rate-limit (abuse detection) trigger | Denial of Service | `@octokit/plugin-throttling.onSecondaryRateLimit` returns false (no retry) |
| Operator typed comment with our marker → mistakenly updated | Tampering | Include runId in marker: `<!-- protostar-evidence:{kind}:{runId} -->` (Pitfall 9) |
| Re-delivery to closed PR | Spoofing (was-triaged signal) | `pr-already-closed` refusal (Q-18) |
| Force-push overwrites someone else's commits | Tampering | Force-with-lease emulation via remote-SHA pre-check (Pitfall 5) |
| Unmocked HTTP escapes test sandbox | Information Disclosure | `nock.disableNetConnect()` + `nockBack.setMode('lockdown')` |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A0 | **Deviation from CONTEXT.md Q-03 onAuth form.** RESEARCH recommends `{ username: token, password: 'x-oauth-basic' }` (Phase 3 incumbent form) instead of CONTEXT.md Q-03's `{ username: 'x-access-token', password: PAT }`. Both are documented as valid GitHub PAT forms. | Pattern 2, Primary Recommendation | Low if both forms truly equivalent; Medium if GitHub deprecates one. **Surface to discuss-phase for explicit reconfirmation or revert to Q-03 verbatim.** |
| A1 | Nock 14 successfully intercepts Octokit 22's native fetch on Node 22 | Standard Stack / Pitfall 6 | High — test surface unusable; need msw fallback. **Wave 0 smoke test required.** |
| A2 | `host: 'github.com'` should be in `computeDeliveryAllowedHosts` for git-push transport | Code Examples / `computeDeliveryAllowedHosts` | Medium — push fails with `network.allow=allowlist` policy. Needs verification against existing `authorizeNetworkOp` semantics. |
| A3 | `@octokit/plugin-retry@^7` and `@octokit/plugin-throttling@^9` are the current majors compatible with Octokit 22 | Standard Stack | Low — easily verified at install time via `npm view`. |
| A4 | `<details>` HTML works inside markdown body but NOT inside markdown table cells | Pitfalls (Pitfall 8) | Low — verifiable via snapshot rendering test. |
| A5 | Octokit error objects may contain `request.headers.authorization` if not redacted | Pitfall 4 | Medium — drives the `mapOctokitErrorToRefusal` design; audit required during implementation. |
| A6 | Fine-grained PATs do NOT include `X-OAuth-Scopes` response header (default-deny scope check) | Code Examples / preflight | Medium — affects `excessive-pat-scope` refusal logic. Verify by hitting api.github.com with a fine-grained PAT in Phase 10. |
| A7 | isomorphic-git's `push()` returns `{ ok: false, errors }` rather than throwing on non-fast-forward; we must inspect `result.refs[…].ok` | Pattern 2 | Low — Context7 docs confirm this shape; minor ergonomic risk only. |
| A8 | The Phase 3 `onAuth` form (`username: token, password: 'x-oauth-basic'`) works equally well for push as for clone | Pattern 2 | Low — both Phase 3 incumbent + isomorphic-git docs confirm. CONTEXT Q-03's alternative form also works. |

**If this table is empty:** N/A — assumptions exist and are flagged.

## Open Questions

1. **Does nock 14 intercept Octokit 22's native fetch?**
   - What we know: Nock historically had problems with native fetch on Node 18-22.
   - What's unclear: Octokit 22 specifically.
   - Recommendation: Wave 0 smoke test FIRST. Switch to msw if needed.

2. **Should `computeDeliveryAllowedHosts` include `github.com` (for git transport)?**
   - What we know: `isomorphic-git` push transport URL is `https://github.com/owner/repo.git`, not `api.github.com`.
   - What's unclear: Phase 4's `network.allow=allowlist` policy enforcement — is it per-host or per-URL prefix? Does the existing `authorizeNetworkOp` already cover this case?
   - Recommendation: Planner reviews `packages/authority/src/...authorizeNetworkOp` and Phase 4 Q-18 to determine.

3. **Does the existing Phase 3 clone path's `onAuth` shim need updates to support fine-grained PATs (`github_pat_…` prefix)?**
   - What we know: `buildOnAuth` returns `{ username: token, password: 'x-oauth-basic' }` regardless of token format.
   - What's unclear: Whether GitHub treats the `github_pat_…` prefix differently as the username.
   - Recommendation: Verify with a fine-grained PAT in Phase 10 dogfood. For Phase 7, document both formats are accepted at preflight; runtime behavior validated in Phase 10.

4. **What is the exact `runId` format that `runIdShort` derives from?**
   - What we know: Q-07 says "drop the `run_` prefix"; current runIds in `apps/factory-cli/src/main.ts` are timestamp-based.
   - What's unclear: Length and character set after the prefix.
   - Recommendation: Planner inspects runId generators in `apps/factory-cli` and locks the format.

5. **Should we use `@octokit/plugin-paginate-rest` for `pulls.list` and `issues.listComments`?**
   - What we know: Octokit ships built-in `paginate` method without the plugin; CONTEXT.md doesn't mention pagination explicitly.
   - What's unclear: Whether evidence comments will exceed 30 (default per_page).
   - Recommendation: Use `octokit.paginate.iterator` for `issues.listComments` to handle long-running PRs with many comments. Don't add the plugin — built-in is sufficient.

6. **Can we cancel an in-flight `isomorphic-git push()`?**
   - What we know: push() takes no `signal` parameter; only `onAuth` returning `{ cancel: true }` interrupts, and only between auth attempts.
   - What's unclear: Whether Q-19's "best-effort cancel mid-step" requirement is satisfiable for the push step at all.
   - Recommendation: Document the constraint in CONCERNS; rely on pre-push signal check + Q-18 idempotency for recovery. See Pitfall 11.

## Sources

### Primary (HIGH confidence)
- Context7 `/octokit/rest.js` — Octokit usage, plugins, AbortController, pagination, full PR/issues/checks API surface
- Context7 `/isomorphic-git/isomorphic-git` — push API, onAuth callback, response shape, force semantics
- Context7 `/nock/nock` — Nock Back fixture record/replay, lockdown mode, disableNetConnect
- Existing repo: `packages/repo/src/clone-workspace.ts:buildOnAuth` — the `onAuth` shim template (verified 2026-04-28)
- Existing repo: `packages/review/src/delivery-authorization.ts` — Phase 5 brand template
- Existing repo: `packages/delivery/src/delivery-contract.ts` — Plan 05-13 contract pin already in place
- Existing repo: `packages/lmstudio-adapter/src/preflight.ts` + `apps/factory-cli/src/coder-adapter-admission.ts` — preflight pattern
- Existing repo: `packages/dogpile-adapter/src/public-candidate-plan.contract.test.ts` — contract test pattern
- npm registry verification (2026-04-28): `@octokit/rest@22.0.1`, `isomorphic-git@1.37.6`, `nock@14.0.13`
- Local verification: `node -e` confirmed `AbortSignal.any`, `AbortSignal.timeout` are functions on Node 22.22.1

### Secondary (MEDIUM confidence)
- [GitHub Blog: Behind GitHub's new authentication token formats](https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/) — token prefix/length specifics
- [magnetikonline gist: GitHub token validation regular expressions](https://gist.github.com/magnetikonline/073afe7909ffdd6f10ef06a00bc3bc88) — verified PAT regexes
- [GitHub Discussion #27190: Maximum length for the comment body](https://github.com/orgs/community/discussions/27190) — body 65,536 chars / 262,144 bytes
- [renovatebot issue #14551](https://github.com/renovatebot/renovate/issues/14551) — confirms 65,536-char body limit empirically
- [GitHub Docs: Permissions required for fine-grained PATs](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens) — fine-grained scope mapping
- [Code with Hugo: Nock on Node 18/20/22 Fails to Intercept fetch](https://codewithhugo.com/nock-node-18-20-22-fails-to-intercept-fetch/) — Pitfall 6 evidence
- [GitHub Check Runs API docs](https://docs.github.com/en/rest/checks/runs?apiVersion=2022-11-28) — conclusion enum

### Tertiary (LOW confidence — needs validation)
- A1: Nock 14 + Octokit 22 fetch interception (smoke test required Wave 0)
- A6: Fine-grained PAT response headers (verify in Phase 10)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm-verified versions, Context7-confirmed APIs.
- Architecture patterns: HIGH — directly mirror Phase 3/4/5 incumbent patterns; Phase 6 hierarchical-AbortSignal pattern is locked but unimplemented.
- Pitfalls: HIGH for Pitfalls 1-5, 7-10 (cited or codebase-verified). MEDIUM for Pitfall 6 (nock+fetch — flagged for Wave 0 verification).
- Schema cascade: HIGH — exhaustive grep of `1.4.0` references.
- Code examples: HIGH for Octokit/nock/isomorphic-git (Context7 verified); MEDIUM for `computeDeliveryAllowedHosts` host list (open question 2).

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (~30 days for stable; sooner if `@octokit/rest` major bumps before then)

## RESEARCH COMPLETE
