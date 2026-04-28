# Phase 7: Delivery — Context

**Gathered:** 2026-04-28
**Source:** `07-QUESTIONS.json` (20/20 answered, --power mode)
**Status:** Ready for research + planning

<domain>
## Phase Boundary

Wire the first real outbound write the factory makes: a GitHub Pull Request created via Octokit + PAT, carrying the run's evidence bundle, with CI status captured into the run bundle and **no auto-merge surface anywhere in the codebase**. Delivery is gated by the Phase 5 `DeliveryAuthorization` brand — `executeDelivery` cannot be called without it. Branch, title, and body are validated through brand-mint validators (defense in depth: pure validators mint brands; the I/O entry point requires the brands at compile time).

The delivery boundary becomes the first hop where the dark factory leaves the local box. Authority posture: a new `@protostar/delivery-runtime` package owns Octokit + isomorphic-git push (network only, zero fs); `packages/delivery` stays a pure planner; `apps/factory-cli` writes all delivery artifacts. Capability-envelope schema bumps to add a signed delivery target (`{ owner, repo, baseBranch }`); `allowedHosts` is computed from the target. PR body is composed by per-section pure functions in `delivery`; `factory-cli` orders them and passes the live artifact list (DELIVER-06 drift-by-construction is impossible).

**Blast radius:** First external write. A wrong invocation seam means a real PR opened against a real GitHub repo with bad evidence, leaked PATs, or — in the worst case — the existence of a code path that could ever invoke `merge`. v0.1 keeps the blast radius bounded by testing entirely against `nock`-recorded fixtures; real GitHub waits for Phase 10 against the toy repo.

**Requirements:** DELIVER-01, DELIVER-02, DELIVER-03, DELIVER-04, DELIVER-05, DELIVER-06, DELIVER-07.

</domain>

<decisions>

## Invocation Surface & Authority (DELIVER-01)

### Q-01 — Octokit invocation owner
**Decision:** New `@protostar/delivery-runtime` package owns Octokit + push. `packages/delivery` stays pure-transform (planning + body composition only). `apps/factory-cli` orchestrates and persists.
**Rationale:** Mirrors Phase 5's split (review = pure inspector, mechanical-checks = subprocess adapter). Keeps `packages/delivery` testable without network and without authority-rule churn there. Concentrates the new network surface (`api.github.com`, `github.com` git transport) in one package whose sole authority is "delivery-side network I/O." Easier to audit (Phase 10 DOG-08 security review) than diffusing it across `delivery` or `factory-cli`.
**Note for planner:** New workspace `packages/delivery-runtime/`. Exports:
- `executeDelivery(authorization: DeliveryAuthorization, plan: DeliveryExecutionPlan, ctx: DeliveryRunContext): Promise<DeliveryRunOutcome>` — push + PR create + initial CI snapshot.
- `pollCiStatus(prRef, ctx): AsyncIterable<CiSnapshot>` — emits per-poll snapshots; consumer (factory-cli) appends to `ci-events.jsonl`.
- `pushBranch(workspaceRef, branchName, ctx): Promise<PushResult>` — isomorphic-git push wrapper.
**No fs imports** in `delivery-runtime`'s source. Static no-fs contract test mirrors Phase 6 Q-09 pattern. Update AGENTS.md to add `@protostar/delivery-runtime` to the "network-permitted" list (alongside `dogpile-adapter`). Re-affirm `packages/delivery` is fs-and-network-free pure transform.
**Status:** Decided.

### Q-02 — PR creation transport
**Decision:** Octokit only. Drop the `gh pr create` argv emission entirely from `GitHubPrDeliveryPlan`. Add `@octokit/rest` as a runtime dep on `@protostar/delivery-runtime`.
**Rationale:** Roadmap and DELIVER-01 lock Octokit + PAT from env. Dark-factory autonomy line forbids spawning external CLIs the operator must install. Eliminates the operator-runs-gh fallback path that was the v0.0.1 stop-gap. Clean break — no parallel surface to drift.
**Note for planner:** Remove `command: ["gh", "pr", "create", ...]` from the existing `GitHubPrDeliveryPlan` interface (breaking; no consumers run it today). New runtime-dep lock entry in PROJECT.md: `@octokit/rest` on `@protostar/delivery-runtime`. Pin a specific Octokit major (verify current `@octokit/rest` at planning time via Context7 / npm). Tests use `nock` against the Octokit HTTP layer (Q-20).
**Status:** Decided.

### Q-03 — Branch push mechanism
**Decision:** `isomorphic-git` push() with token auth via the `onAuth` shim returning `{ username: 'x-access-token', password: PAT }`.
**Rationale:** Reuse the Phase 3 git stack — same dep posture as clone (`isomorphic-git@1.37.6`), pure-JS, deterministic, no new subprocess. `onAuth` shim is already understood from Phase 3's clone path. Phase 3's symlink/escape audits don't apply to push (read-from-workspace, write-to-remote), but the auth shim infrastructure transfers.
**Note for planner:** New helper in `delivery-runtime`: `pushBranch({ workspaceRef, branchName, remoteUrl, token, signal }): Promise<PushResult>` using `isomorphic-git/http/node`. `remoteUrl` derived from `envelope.delivery.target.{owner, repo}` (Q-05). Push is `--force-with-lease`-equivalent only if the remote ref points at a SHA we wrote previously (idempotency Q-18); never blind force. Test: stub server (use `isomorphic-git`'s test patterns or a local bare repo fixture) verifies push succeeds, retries on transient 5xx, fails closed on 401/403.
**Status:** Decided.

## Auth & Capability Envelope (DELIVER-01, DELIVER-02)

### Q-04 — PAT source & env var name
**Decision:** `PROTOSTAR_GITHUB_TOKEN` (namespaced).
**Rationale:** Won't collide with the operator's existing `GITHUB_TOKEN` (gh CLI, GitHub Actions, other tools). Symmetric with Phase 4's `LMSTUDIO_*` namespacing. Required at preflight (Q-06).
**Note for planner:** `.env.example` adds `PROTOSTAR_GITHUB_TOKEN=<github-pat-with-repo-and-pull_request-scopes>` with comment explaining minimum scopes (`public_repo` for public repos, `repo` for private, no admin). Refusal artifact `delivery-preflight-refusal.json` for missing/empty token. Token NEVER logged or persisted in any artifact (contract test: grep `runs/{id}/**` for the token string after a run, assert zero matches).
**Status:** Decided.

### Q-05 — Capability envelope additions
**Decision:** Hybrid — `envelope.delivery.target: { owner, repo, baseBranch }` is signed into ConfirmedIntent. `allowedHosts` is **computed**, not stored: `['api.github.com']` plus `'uploads.github.com'` only when attachments are emitted (Q-10 PR comments don't need uploads).
**Rationale:** Smaller schema surface than option (a). Target is tamper-evident (operator can't redirect a PR post-admission). Computed `allowedHosts` keeps `network.allow=allowlist` consistent with Phase 4 Q-18 without manual host-list maintenance. Schema bump confirmedIntent 1.4.0 → 1.5.0.
**Note for planner:** Schema additions in `confirmed-intent.schema.json` (1.4.0 → 1.5.0):
```json
"delivery": {
  "type": "object",
  "additionalProperties": false,
  "required": ["target"],
  "properties": {
    "target": {
      "type": "object",
      "additionalProperties": false,
      "required": ["owner", "repo", "baseBranch"],
      "properties": {
        "owner": { "type": "string", "pattern": "^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}[a-zA-Z0-9])?$" },
        "repo":  { "type": "string", "pattern": "^[a-zA-Z0-9._-]{1,100}$" },
        "baseBranch": { "type": "string", "pattern": "^[a-zA-Z0-9._/-]+$", "maxLength": 244 }
      }
    }
  }
}
```
Add a `computeDeliveryAllowedHosts(envelope.delivery): readonly string[]` helper in `@protostar/intent`; consumed by Phase 7 to assemble `network.allowedHosts` at runtime. Cascade signed-intent fixture regeneration (Phase 4 Pitfall 7). Document in PROJECT.md "Constraints" that `delivery.target` is the only signed field added in Phase 7.
**Status:** Decided.

### Q-06 — Delivery preflight
**Decision:** Both — fast preflight at run start (token presence + format check); full preflight at delivery boundary (token scope + repo accessibility + base SHA resolved).
**Rationale:** Symmetric with Phase 4 LM Studio preflight ordering and Phase 6 per-agent model preflight. Fast preflight saves model spend on doomed runs (no token → refuse before execution); full preflight ensures the bundle is delivered to a real repo at a real SHA, not a renamed/deleted target.
**Note for planner:** Two preflight functions in `@protostar/delivery-runtime`:
- `preflightDeliveryFast(env): DeliveryPreflightResult` — checks `PROTOSTAR_GITHUB_TOKEN` is set + matches `^gh[pousr]_[A-Za-z0-9]{36,}$`. Runs in `apps/factory-cli/src/main.ts` immediately after admission and before execution wave.
- `preflightDeliveryFull({ token, target }, ctx): Promise<DeliveryPreflightResult>` — Octokit `users.getAuthenticated` (token valid?), `repos.get(owner, repo)` (repo accessible? push permission?), `repos.getBranch(baseBranch)` (base exists? returns base SHA). Runs after loop approves and `DeliveryAuthorization` is minted.
Five preflight outcomes (mirror Phase 4 Q-13): `ok | token-missing | token-invalid | repo-inaccessible | base-branch-missing`. Each writes a typed refusal artifact at `runs/{id}/delivery/preflight-refusal.json`.
**Status:** Decided.

## Branch / Title / Body Validation (DELIVER-02)

### Q-07 — Branch naming template
**Decision:** `protostar/${archetype}/${runIdShort}-${randomSuffix}` where `runIdShort` is the run ID with the `run_` prefix dropped, and `randomSuffix` is a 6-char base32 token computed at delivery time (defeats second-precision collisions from CONCERNS).
**Rationale:** Hierarchical (easier to grep on the GitHub side, distinguishes `cosmetic-tweak/...` from future archetypes). Random suffix solves the collision risk noted in CONCERNS scaling-limits without needing a runId schema change. Total length stays well under 244-byte git ref limit. Operator can override via `--head-branch`.
**Note for planner:** Format example: `protostar/cosmetic-tweak/20260428143052-a3k9z2`. Suffix: `crypto.randomBytes(4).toString('base32')` → 6 chars (or `nanoid(6)`). Computed in `delivery-runtime` at delivery time; recorded in `delivery-result.json` (Q-17). Operator override: `--head-branch <name>` skips the template and validates the literal value through Q-08 brand-mint. Validation regex `^[a-zA-Z0-9._/-]+$` from DELIVER-02 still applies regardless of source.
**Status:** Decided.

### Q-08 — Branch / title / body sanitization layer
**Decision:** Both — pure validators in `packages/delivery` mint brands (`BranchName`, `PrTitle`, `PrBody`); `executeDelivery` in `delivery-runtime` requires those brands at compile time.
**Rationale:** Defense in depth, symmetric with `ConfirmedIntent` (Phase 1) + `Authorized*Op` (Phase 2) + `DeliveryAuthorization` (Phase 5) brand-mint posture. Validators are pure → testable without I/O. Compile-time bypass guard at the I/O entry — even a misconfigured caller fails to compile. Runtime check inside the validator catches the actual sanitization (control chars, regex, length).
**Note for planner:** Add to `packages/delivery`:
```ts
export type BranchName = string & { readonly __brand: 'BranchName' };
export type PrTitle = string & { readonly __brand: 'PrTitle' };
export type PrBody = string & { readonly __brand: 'PrBody' };
export function validateBranchName(s: string): { ok: true; value: BranchName } | { ok: false; refusal: DeliveryRefusal };
export function validatePrTitle(s: string): { ok: true; value: PrTitle } | { ok: false; refusal: DeliveryRefusal };
export function validatePrBody(s: string): { ok: true; value: PrBody } | { ok: false; refusal: DeliveryRefusal };
```
`executeDelivery` signature in `delivery-runtime`:
```ts
executeDelivery(
  authorization: DeliveryAuthorization,
  plan: { branch: BranchName; title: PrTitle; body: PrBody; target: DeliveryTarget; artifacts: ArtifactRef[] },
  ctx: DeliveryRunContext
): Promise<DeliveryRunOutcome>
```
Negative type-level test in `delivery-runtime`: `// @ts-expect-error — raw string rejected` calling `executeDelivery(auth, { branch: 'foo' as string, ... })`. Refusal `DeliveryRefusal` discriminated: `{ kind: 'invalid-branch'|'invalid-title'|'invalid-body'|'oversized-body'|'control-character', evidence: { input, position?, regex? } }`.
**Status:** Decided.

### Q-09 — Title & body content rules
**Decision:** Title sourced from `intent.title` with fallback to `runId`; max 200 chars; control chars (other than space/tab/lf where allowed) rejected outright (no silent strip). Truncation with ellipsis at 200. Body capped at 60_000 bytes (UTF-8) — over-budget evidence is moved to PR comments (Q-10), never silently truncated.
**Rationale:** GitHub limits are 256/65536 — 200/60000 leaves headroom for envelope chars (markdown decorations, frontmatter). Reject (not strip) keeps the validator deterministic; an "I tried to deliver but had to mutate your data" path is a worse audit story than "refuse + tell operator." The 60k body cap pairs naturally with Q-10's spillover-to-comments strategy.
**Note for planner:** Validator pseudocode:
```
title := input.length > 200 ? input.slice(0,197) + '…' : input
if /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(title) -> refuse 'control-character'
return brand(title)

body :=
  if Buffer.byteLength(input, 'utf8') > 60000 -> refuse 'oversized-body' (evidence.byteLength)
  if /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body) -> refuse 'control-character'
  return brand(body)
```
Caller (factory-cli) catches `oversized-body` refusal and re-tries by moving overflow sections (full transcripts, repair-loop history) into PR comments per Q-10. Document in CONCERNS that body assembly must measure against 60_000 bytes (UTF-8), not characters. Test fixtures: title with `\x07` BEL, body with embedded NUL, body at exactly 60_000 bytes.
**Status:** Decided.

## Evidence Bundle Composition (DELIVER-03, DELIVER-06)

### Q-10 — Evidence delivery channel
**Decision:** Inline summary in PR body; full artifacts (judge rationales, full mechanical-checks transcripts, repair-loop history) posted as Octokit PR comments after PR creation.
**Rationale:** PR body holds the score sheet, mechanical summary, repair-loop summary — what a reviewer wants at a glance. Full transcripts go in dedicated comments (each <65k). Cleanest separation; one PR creation + N comments. No new auth scopes (gist or upload). Reviewer-friendly: GitHub renders comments inline with the PR.
**Note for planner:** Comment posting helpers in `delivery-runtime`:
- `postEvidenceComment(prRef, kind: 'judge-transcripts'|'mechanical-full'|'repair-history'|'oversized-body-overflow', body: PrBody, ctx)`.
- Each comment validated through the same `validatePrBody` (Q-08) — comment body cap is identical to PR body.
- Comments posted serially after PR creation; if any comment posting fails, delivery is **not** blocked (PR exists; comment failures recorded in `delivery-result.json` as `commentFailures: CommentFailure[]`).
- Comment ordering: `mechanical-full` → `judge-transcripts` → `repair-history` → `oversized-body-overflow` (deterministic; reviewers know what to expect).
- Each comment prefixed with a stable header: `<!-- protostar-evidence:{kind} -->` so re-delivery (Q-18) can identify and update existing evidence comments rather than appending duplicates.
**Status:** Decided.

### Q-11 — Screenshot strategy for v0.1
**Decision:** Skip screenshot capture in v0.1. Evidence bundle records `screenshotStatus: 'deferred-v01'` with rationale; Phase 10 dogfood adds the capture once the toy repo lands.
**Rationale:** Most honest — v0.1 doesn't ship a half-feature. Toy repo is a Phase 10 dependency that doesn't exist yet; building Playwright capture against a non-existent target is speculative. The `'deferred-v01'` marker is auditable: an operator reading the evidence bundle sees explicitly that screenshots were not attempted.
**Note for planner:** Evidence bundle field: `screenshots: { status: 'deferred-v01', reason: 'Tauri capture pipeline lands in Phase 10 with toy repo'} | { status: 'captured', traces: TraceRef[] }`. Type-level discrimination keeps Phase 10 plug-in path clean. Document in `.planning/codebase/CONCERNS.md` "Phase 7 deferred" addendum: screenshot capability is a Phase 10 deliverable, not a Phase 7 omission. Phase 7 PR body footer: `_Screenshots: deferred until Phase 10 dogfood (toy repo not yet scaffolded)._`
**Status:** Decided.

### Q-12 — Score sheet detail level in PR body
**Decision:** Compact table (judge | model | verdict | mean rubric score), with each rationale wrapped in `<details><summary>` HTML — collapsed by default, expanded on demand.
**Rationale:** At-a-glance scan in the body. `<details>` is GitHub-native markdown — works without JS. Stable across panel sizes (Phase 6 single-Qwen → Phase 8 N-judge consensus). Reviewer expands what they care about.
**Note for planner:** Score sheet composer in `packages/delivery`:
```ts
function composeScoreSheet(critiques: readonly JudgeCritique[]): string
```
Output:
```markdown
## Judge Panel

| Judge | Model | Verdict | Mean Score |
|-------|-------|---------|------------|
| {judgeId} | {model} | {verdict} | {meanRubric} |

<details>
<summary>{judgeId} rationale</summary>

{rationale}

Rubric: {rubric as bullet list}
</details>
```
Snapshot-tested for stable formatting (changes to layout require explicit snapshot updates). Compose order: highest-`verdict`-severity first (block > repair > pass), then `judgeId` alphabetical for stability.
**Status:** Decided.

### Q-13 — PR body templating mechanism
**Decision:** Per-section pure composers (`composeMechanicalSummary`, `composeJudgePanel`, `composeRepairHistory`, `composeArtifactList`) live in `packages/delivery`; `apps/factory-cli` orders and assembles them.
**Rationale:** Per-section testability (each composer takes typed inputs and returns a markdown string). DELIVER-06 drift prevention: `composeArtifactList(artifacts: readonly ArtifactRef[]): string` takes the live artifact list passed by `factory-cli` (which is also the source of `manifest.json`'s artifact records). Type system makes drift impossible. Section ordering is a `factory-cli` concern (operator-facing structure choice); `delivery` provides the pieces.
**Note for planner:** Composers in `packages/delivery/src/pr-body/`:
- `composeMechanicalSummary(verdict, findings): string`
- `composeJudgePanel(critiques): string` (calls Q-12 score sheet)
- `composeRepairHistory(iterations: ReviewIteration[]): string`
- `composeArtifactList(artifacts: readonly ArtifactRef[]): string` — uses **the actual artifact list**, drift-by-construction prevented.
- `composeRunSummary(runId, prUrl, target): string` (top of body)
`factory-cli`'s `assembleDeliveryBody({ runId, target, mechanical, critiques, iterations, artifacts }): string` orders them: run summary → mechanical → judge panel → repair history → artifact list → footer (screenshots-deferred note). Resulting string fed to `validatePrBody` (Q-08). Each composer snapshot-tested. Drift contract test: assert artifact-list section in body equals `JSON.stringify(artifacts)`-derived list (no hardcoded filenames).
**Status:** Decided.

## CI Status Capture (DELIVER-04, DELIVER-05)

### Q-14 — CI polling timing & budget
**Decision:** New signed envelope field `budget.deliveryWallClockMs` (default 600_000ms / 10 min, max 3_600_000ms / 1 hr). Poll interval 10 seconds. Polling uses Phase 6's hierarchical AbortSignal pattern: `AbortSignal.any([runSignal, AbortSignal.timeout(deliveryWallClockMs)])`.
**Rationale:** Tamper-evident budget on the same envelope clamping rule as Phase 5/6. Polling at 10s gives ~60 polls within the 10-min default — sufficient resolution for typical Actions runs, low GitHub API quota cost (≤6000 calls/hr). Hierarchical signal: SIGINT cancels everything; per-delivery timeout aborts only delivery (consistent with Phase 6 Q-11 precedent).
**Note for planner:** Schema bump confirmedIntent 1.4.0 → 1.5.0 (combined with Q-05 delivery target):
```
"budget.deliveryWallClockMs": { "type": "integer", "minimum": 30000, "maximum": 3600000, "default": 600000 }
```
`pollCiStatus` async generator:
```ts
async function* pollCiStatus(prRef, signal: AbortSignal): AsyncIterable<CiSnapshot> {
  while (!signal.aborted) {
    const snap = await fetchCiSnapshot(prRef, { signal });
    yield snap;
    if (snap.terminal) return;
    await sleep(10_000, { signal });
  }
}
```
Caller composes `AbortSignal.any([ctx.runSignal, AbortSignal.timeout(envelope.budget.deliveryWallClockMs)])`. Distinguish abort reasons via `controller.signal.reason`: `'cancelled'` (parent) vs `'timeout'` (per-delivery cap). Cascade signed-intent fixture regeneration alongside Q-05.
**Status:** Decided.

### Q-15 — Which checks count toward CI verdict
**Decision:** Configurable allowlist in `factory-config.json`: `delivery.requiredChecks: string[]`. Empty allowlist (default for v0.1) means "no CI gating" — `ciVerdict: 'no-checks-configured'`. Phase 10 dogfood configures the toy repo's specific Actions workflow names.
**Rationale:** Operator names which checks count. Avoids reading branch-protection rules (extra API call per delivery, requires admin scope). Empty default keeps v0.1 frictionless against the nock fixture without requiring a real repo's check structure. Phase 10 dogfood sets the real names. Verdict is `AND` over the allowlist subset of all checks.
**Note for planner:** `factory-config.schema.json` addition:
```json
"delivery": {
  "type": "object",
  "properties": {
    "requiredChecks": { "type": "array", "items": { "type": "string", "minLength": 1 }, "default": [] }
  }
}
```
Verdict computation in `delivery-runtime`:
- If `requiredChecks.length === 0` → `'no-checks-configured'`
- For each name in `requiredChecks`, find matching check run on PR head SHA (Octokit `checks.listForRef`); if missing → `'pending'`; otherwise read conclusion.
- Verdict = AND over conclusions: all `'success'` → `'pass'`; any `'failure'|'cancelled'|'timed_out'|'action_required'` → `'fail'`; otherwise → `'pending'`.
- Once verdict is `'pass'` or `'fail'`, polling terminates (`snap.terminal = true`).
- `'pending'` continues until budget exhausted (Q-16).
Test fixture (nock): three checks (`build`, `test`, `lint`); `requiredChecks: ['build', 'test']`; assert `lint` failure does not affect verdict.
**Status:** Decided.

### Q-16 — Status-pending semantics at budget exhaustion
**Decision:** Two-step. `executeDelivery` returns after PR creation + initial CI snapshot. CI capture continues until terminal verdict OR `deliveryWallClockMs` exhaustion. On exhaustion, `delivery-result.json` records `ciVerdict: 'timeout-pending'`; Phase 9 `protostar-factory deliver --capture-ci <runId>` resumes polling to complete the bundle later.
**Rationale:** Decouples delivery from CI duration. PR creation is the irrevocable step — once that succeeds, the run has delivered (artifact exists, evidence is shippable). CI verdict is a refinement, completable asynchronously. Phase 9 OP-06 (`deliver`) becomes the natural follow-up command. Operator who needs synchronous CI uses Phase 7's full polling within budget; operator who walks away can resume later. Run terminal status `'delivered'` set on PR creation; `ciVerdict` evolves as Phase 9 captures complete it.
**Note for planner:**
- Run terminal statuses: `'delivered'` (PR exists, ciVerdict ∈ {'pass','fail','timeout-pending','no-checks-configured'}) and `'delivery-blocked'` (preflight or push refusal).
- Phase 9 op handoff: `protostar-factory deliver --capture-ci <runId>` reads the existing `delivery-result.json`, finds `ciVerdict === 'timeout-pending'`, resumes `pollCiStatus` against the recorded PR SHA. Updates the same file; appends to `ci-events.jsonl` (Q-17).
- `executeDelivery` returns once `(pr-created AND first-snapshot-captured)`; never blocks on terminal CI verdict. Polling continuation is a fire-and-forget background loop within the same process, watched by the run-level signal.
- Document in CONCERNS that two-step CI capture means a run's `delivery-result.json` is mutable until terminal verdict — the only artifact in `runs/{id}/` that updates after run completion. Tmp+rename per write.
**Status:** Decided.

## Persistence, Idempotency & Cancellation

### Q-17 — delivery-result.json shape & layout
**Decision:** `runs/{id}/delivery/delivery-result.json` (terminal artifact, written once per delivery attempt) **plus** `runs/{id}/delivery/ci-events.jsonl` (append-only stream of every poll snapshot).
**Rationale:** Mirrors Phase 4 journal+snapshot dual-write pattern. JSONL captures every CI state change for forensic replay (Phase 9 inspect, Phase 8 evaluation analysis). Single terminal artifact answers "what's the current state?" cheaply. Both atomic-write-safe (jsonl: append+fsync per event; terminal: tmp+rename on each update).
**Note for planner:** Schema:
```ts
interface DeliveryResult {
  runId: string;
  status: 'delivered' | 'delivery-blocked';
  branch: BranchName;
  prUrl: string;
  prNumber: number;
  headSha: string;
  baseSha: string;
  baseBranch: string;
  createdAt: string;
  ciVerdict: 'pass' | 'fail' | 'pending' | 'timeout-pending' | 'no-checks-configured' | 'cancelled';
  ciVerdictUpdatedAt: string;
  ciSnapshots: { at: string; checks: CheckSummary[] }[];  // last N (rolling)
  evidenceComments: { kind: string; commentId: number; url: string }[];
  commentFailures?: { kind: string; reason: string }[];
  exhaustedAt?: string;  // when ciVerdict became 'timeout-pending'
}
type CiEvent =
  | { kind: 'pr-created'; at; prNumber; prUrl; headSha }
  | { kind: 'comment-posted'; at; commentKind; commentId }
  | { kind: 'comment-failed'; at; commentKind; reason }
  | { kind: 'ci-snapshot'; at; checks }
  | { kind: 'ci-terminal'; at; verdict }
  | { kind: 'ci-timeout'; at }
  | { kind: 'ci-cancelled'; at; reason };
```
`ciSnapshots` in the terminal artifact keeps rolling window (e.g., last 10 + first 1) for at-a-glance forensics; `ci-events.jsonl` is the canonical append log. Phase 9 inspect reads both.
**Status:** Decided.

### Q-18 — Re-delivery / idempotency semantics
**Decision:** Idempotent. Detect existing PR by head branch on every delivery; if found and not closed, update body + post follow-up CI snapshot (and update existing evidence comments via the `<!-- protostar-evidence:{kind} -->` markers from Q-10). If found and closed, refusal artifact `pr-already-closed` — operator chooses whether to start fresh.
**Rationale:** Re-running delivery for the same runId after a transient failure should not produce duplicate PRs or duplicate evidence comments. The `<!-- protostar-evidence:{kind} -->` marker pattern (Q-10) makes "find and update" mechanically deterministic. Closed PR is a hard signal that the operator already triaged this run elsewhere — fail loudly.
**Note for planner:** Idempotency check at delivery start:
```ts
async function findExistingPr(target, branch, ctx): Promise<{ pr; isClosed } | null>
```
Octokit `pulls.list({ owner, repo, head: `${owner}:${branch}`, state: 'all' })`. If found and `state === 'open'`: re-use. If `state === 'closed'`: refusal `pr-already-closed` with PR URL in evidence. If multiple PRs match (shouldn't happen with run-id branch suffix from Q-07, but guard): refusal `pr-ambiguous`.
For evidence-comment updates: `pulls.listComments` (or `issues.listComments` for PR-level comments), filter by `<!-- protostar-evidence:{kind} -->` header match, `issues.updateComment` if found, otherwise `issues.createComment`. Test: re-deliver same runId → 1 PR (not 2), N evidence comments (not 2N). Document in CONCERNS that closing a Protostar PR is the operator's signal "I'm done with this run" — re-delivery is intentionally blocked.
**Status:** Decided.

### Q-19 — Cancellation seam during delivery
**Decision:** Hierarchical AbortSignal. Run-level parent (Phase 4 SIGINT/sentinel); delivery-level child (`AbortSignal.any([runSignal, AbortSignal.timeout(deliveryWallClockMs)])`); cancel mid-step is best-effort. Recovery semantics: cancel during push → branch may exist remote (re-delivery via Q-18 idempotency reconciles); cancel during PR create → on resume, idempotency check finds the PR; cancel during poll → capture last snapshot, mark `ciVerdict: 'cancelled'`.
**Rationale:** Mirrors Phase 6 Q-11 hierarchical-abort precedent. Best-effort matches the dark-factory posture where SIGINT honoring is more important than atomic delivery boundaries — operator-controlled cancel is a safety lever. Idempotency from Q-18 cleans up partial state on the next attempt.
**Note for planner:** `DeliveryRunContext.signal` is the composed signal. Each Octokit/`isomorphic-git` call passes it through. Cancel reasons distinguished via `controller.signal.reason`:
- `'sigint'` (run signal)
- `'timeout'` (per-delivery cap, Q-14)
- `'sentinel'` (sentinel-file from Phase 4 Q-16)
Each terminal `ci-events.jsonl` entry records the reason. Recovery on re-delivery: `findExistingPr` + idempotent comment updates handle every partial state. Test: SIGINT during push → re-deliver succeeds, 1 PR exists; SIGINT during PR-create → re-deliver finds PR and updates body; SIGINT during poll → `delivery-result.json.ciVerdict = 'cancelled'`, Phase 9 `--capture-ci` resumes (treats `'cancelled'` like `'timeout-pending'`).
**Status:** Decided.

## Auto-Merge Prevention & Testing Target (DELIVER-07)

### Q-20 — No-auto-merge enforcement & v0.1 testing
**Decision:** Type-level — no `merge` function exists in `delivery` or `delivery-runtime`. PAT scope minimized at preflight (reject tokens with admin scope per Octokit `users.getAuthenticated.scopes`). v0.1 tests against a `nock`-based Octokit fixture server; real GitHub deferred to Phase 10 dogfood against the toy repo.
**Rationale:** Strongest static guarantee — `merge` is unimplementable without explicit code change + commit. PAT scope minimization is defense in depth (blocks the API path even if a future change introduced a merge call). `nock` keeps `pnpm verify` deterministic and offline. Phase 10 swaps fixture for real GitHub once toy repo lands.
**Note for planner:**
- **Type-level no-merge:** No `merge`, `mergePullRequest`, `enableAutoMerge`, or similar exports anywhere in `delivery` or `delivery-runtime`. Static contract test in `delivery-runtime`: greps `src/**` for the strings `pulls.merge`, `pulls.updateBranch`, `enableAutoMerge`, `merge_method`; asserts zero matches.
- **PAT scope rejection at preflight:** `preflightDeliveryFull` (Q-06) reads `X-OAuth-Scopes` from Octokit response after `users.getAuthenticated`; if scopes include `admin:org`, `admin:repo_hook`, `delete_repo`, etc., refusal `excessive-pat-scope`. Minimum required: `public_repo` OR `repo`. Document the minimum-scope set in `.env.example`.
- **nock test surface:** New dev-dep `nock` on `@protostar/delivery-runtime`. Test fixtures simulate: token-valid + repo-accessible + push success + PR create + N CI snapshots. Failure fixtures: 401 (token invalid), 403 (repo inaccessible), 404 (base branch missing), 422 (PR validation), 5xx-then-success (transient retry).
- **Phase 10 handoff:** Document explicitly in CONCERNS / planner notes that v0.1 has *zero* coverage against real GitHub. Phase 10 DOG-04 is the first run that hits `api.github.com`. The toy repo PAT is a Phase 10 deliverable.
- **Add `@protostar/delivery-runtime` to `pnpm verify` package list** (Phase 1 P-A-03 verify-script discipline).
**Status:** Decided.

### Claude's Discretion
- Exact `randomSuffix` algorithm (Q-07) — `crypto.randomBytes(4).toString('hex')` (8 chars hex) vs base32 (6 chars) vs `nanoid`; planner picks based on collision-vs-readability balance. Recommend hex for stdlib-only.
- PR body section ordering (Q-13) — proposed: run summary → mechanical → judge panel → repair history → artifact list → footer. Planner verifies against operator UX preference.
- Whether `delivery-result.json` keeps a rolling window of `ciSnapshots` (Q-17) or unbounded — recommend rolling 10 + first 1; `ci-events.jsonl` is the unbounded canonical log.
- Comment-posting concurrency (Q-10) — serial recommended for deterministic ordering and rate-limit safety; planner may parallelize if Octokit rate-limit allows.
- `findExistingPr` query format (Q-18) — `head: '${owner}:${branch}'` vs `head: '${branch}'`; planner verifies against current Octokit API behavior at planning time via Context7.
- Whether `executeDelivery` accepts a single `DeliveryExecutionPlan` blob or destructured args (Q-08 signature) — recommend single typed plan for symmetry with Phase 6 `runFactoryPile` shape.

</decisions>

<specifics>
## Specific Ideas

- **Authority list expansion:** `AGENTS.md` "fs-permitted" rule stays unchanged (only `apps/factory-cli` + `packages/repo`). New "network-permitted" tier added: `@protostar/dogpile-adapter` (Phase 6) + `@protostar/delivery-runtime` (Phase 7). Document the pattern: "fs is always factory-cli + repo; network may live in domain packages with explicit no-fs contract tests."
- **Schema bump cluster:** confirmedIntent 1.4.0 → 1.5.0 ships three additions in one bump: `delivery.target` (Q-05) + `budget.deliveryWallClockMs` (Q-14) + (no other changes). Cascade signed-intent fixture regeneration repo-wide (Phase 4 Pitfall 7 pattern). One coordinated migration.
- **Brand chain at delivery boundary:** `executeDelivery(authorization: DeliveryAuthorization, plan: { branch: BranchName; title: PrTitle; body: PrBody; ... })` — five brands enforce the boundary at compile time. `DeliveryAuthorization` from Phase 5; `BranchName`/`PrTitle`/`PrBody` new in Phase 7. This is the most heavily branded entry point in the codebase; document the pattern in PROJECT.md.
- **`<!-- protostar-evidence:{kind} -->` marker convention:** Stable, machine-parseable. Re-delivery (Q-18) finds and updates by marker; manual operator deletion of a comment is preserved (re-delivery re-creates it, but does not overwrite operator-authored comments). Ship the marker format in `delivery` exports as constants so consumers can grep deterministically.
- **DELIVER-06 drift-by-construction prevention:** `composeArtifactList(artifacts: readonly ArtifactRef[])` takes the live list — there is no hardcoded filename anywhere in `delivery` or `delivery-runtime`. Drift is a type error, not a snapshot regression. This is load-bearing for DELIVER-06's "no drift" criterion.
- **Two-step CI capture (Q-16):** First case where a run artifact (`delivery-result.json`) mutates after run completion. Document the invariant in PROJECT.md: only `delivery-result.json` and `delivery/ci-events.jsonl` are mutable post-run; everything else is immutable. Phase 9 `--capture-ci` is the only allowed mutator.
- **PAT scope rejection at preflight (Q-20):** First time the factory rejects an over-privileged credential. Pattern is reusable for future credential surfaces (e.g., LM Studio API keys with elevated scopes if that surface evolves).
- **`nock` v0.1 test posture (Q-20):** v0.1 has zero real-GitHub coverage by design. Phase 10 DOG-04 is the first real PR. Operator must understand: a green Phase 7 verify run does not mean "this works against real GitHub" — it means "this works against the recorded fixture." Document explicitly.
- **`DeliveryAuthorization` consumption seam:** Phase 5 mints; Phase 7 consumes. The contract pin from Plan 05-13 (`packages/delivery declares createGitHubPrDeliveryPlan(authorization: DeliveryAuthorization, ...)`) becomes the Phase 7 `executeDelivery` signature. Phase 7 must NOT widen this contract — `DeliveryAuthorization` is required, not optional.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 7 — Delivery" — goal, requirements, success criteria
- `.planning/REQUIREMENTS.md` §"Phase 7" — DELIVER-01 through DELIVER-07 verbatim text

### Prior-phase locks (must not break)
- `.planning/phases/01-intent-planning-admission/01-CONTEXT.md` — branded `ConfirmedIntent`, refusal artifact layout (`.protostar/refusals.jsonl` index; per-run refusal JSON)
- `.planning/phases/02-authority-governance-kernel/02-CONTEXT.md` — capability envelope shape; `intersectEnvelopes` precedence; `Authorized*Op` brand pattern (template for `BranchName`/`PrTitle`/`PrBody`); `network.allow` + `allowedHosts` (Phase 7 extends with computed delivery hosts)
- `.planning/phases/03-repo-runtime-sandbox/03-CONTEXT.md` — `isomorphic-git@1.37.6` (Phase 7 push reuses), `onAuth` shim pattern, fresh-clone-per-run posture, `repoSubprocessRunner` (NOT used by Phase 7 — pure isomorphic-git)
- `.planning/phases/04-execution-engine/04-CONTEXT.md` — Q-09 `factory-config.json` (Phase 7 extends with `delivery.requiredChecks`), Q-13 LM Studio preflight pattern (Phase 7 mirrors with delivery preflight), Q-15 `taskWallClockMs` envelope budget (Phase 7 mirrors with `deliveryWallClockMs`), Q-16 SIGINT/sentinel cancel (Phase 7 hierarchical-abort parent)
- `.planning/phases/05-review-repair-loop/05-CONTEXT.md` — **Q-15 `DeliveryAuthorization` brand mint**, **Q-16 type-level delivery refusal layer (Phase 7 implements)**, Q-17 `runs/{id}/review/iter-{N}/` layout (Phase 7 mirrors at `runs/{id}/delivery/`), Plan 05-13 contract pin (Phase 7 fulfills)
- `.planning/phases/06-live-dogpile-piles/06-CONTEXT.md` — Q-09 zero-fs contract test pattern (Phase 7 `delivery-runtime` mirrors), Q-11 hierarchical AbortSignal pattern (Phase 7 reuses for run→delivery→timeout), Q-13 `PileFailure` discriminator union (Phase 7's `DeliveryRefusal` mirrors the discriminator pattern)

### Project posture
- `.planning/PROJECT.md` — authority boundary (only `apps/factory-cli` + `packages/repo` touch fs; **`@protostar/delivery-runtime` joins `dogpile-adapter` as the second network-permitted, fs-forbidden package**), no auto-merge for v1, "GitHub PAT from env var; never pass branch names to a shell unvalidated" — Phase 7 is the realization of all three
- `.planning/codebase/CONCERNS.md` §"No real PR delivery" — Phase 7 wires this
- `.planning/codebase/CONCERNS.md` §"LM Studio and Octokit credentials are not yet present but are imminent" — Phase 7 brings credentials
- `.planning/codebase/CONCERNS.md` §"`packages/delivery` has no tests" — Phase 7 covers
- `AGENTS.md` — domain-first packaging; Phase 7 splits delivery into `delivery` (pure) + `delivery-runtime` (network)

### Authority + contract surfaces touched
- `packages/delivery/src/index.ts` — current `createGitHubPrDeliveryPlan`, `GitHubPrDeliveryPlan` shape, `createPrBody` (rewriting target). Phase 7 ADDS `BranchName`/`PrTitle`/`PrBody` brands, `validateBranchName`/`validatePrTitle`/`validatePrBody` mint functions, `composeMechanicalSummary`/`composeJudgePanel`/`composeRepairHistory`/`composeArtifactList`/`composeRunSummary` per-section composers, `DeliveryRefusal` discriminator, `DeliveryExecutionPlan` typed input. REMOVES the `command: ["gh", "pr", "create", ...]` argv emission (Q-02).
- `packages/delivery-runtime/src/index.ts` (NEW package) — `executeDelivery(authorization, plan, ctx)`, `pushBranch`, `pollCiStatus`, `findExistingPr`, `postEvidenceComment`, `preflightDeliveryFast`, `preflightDeliveryFull`, `mapOctokitErrorToRefusal`. Static no-fs contract test + grep-no-merge contract test.
- `packages/intent/schema/confirmed-intent.schema.json` — bump 1.4.0 → 1.5.0; add `capabilityEnvelope.delivery.target` + `capabilityEnvelope.budget.deliveryWallClockMs`. Cascade signed-intent fixture regeneration repo-wide.
- `packages/intent/src/...` — `computeDeliveryAllowedHosts(envelope.delivery): readonly string[]` helper.
- `packages/review/src/delivery-authorization.ts` — Phase 5 `DeliveryAuthorization` brand; Phase 7 imports without modification.
- `apps/factory-cli/src/main.ts` — replaces existing `createGitHubPrDeliveryPlan` call site (line ~663); wires preflight (fast at run start, full at delivery boundary); calls `executeDelivery` after loop approval; persists `delivery-result.json` + `ci-events.jsonl`; assembles PR body via per-section composers.
- `apps/factory-cli/src/factory-config.schema.json` (Phase 4 Q-09) — extends with `delivery.requiredChecks: string[]` (default `[]`).
- `pnpm-workspace.yaml`, root `tsconfig.json`, root `verify` script — register `packages/delivery-runtime`.
- `.env.example` — adds `PROTOSTAR_GITHUB_TOKEN` with required scope documentation.
- `AGENTS.md` — adds `@protostar/delivery-runtime` to network-permitted, fs-forbidden tier (alongside `@protostar/dogpile-adapter`).

### External libraries
- `@octokit/rest` (NEW runtime dep on `@protostar/delivery-runtime`) — primary surfaces: `users.getAuthenticated`, `repos.get`, `repos.getBranch`, `pulls.create`, `pulls.list`, `pulls.update`, `issues.createComment`, `issues.listComments`, `issues.updateComment`, `checks.listForRef`. Verify current major + scope semantics at planning time via Context7 (`mcp__plugin_context7_context7__resolve-library-id` then `query-docs`).
- `isomorphic-git@1.37.6` (existing, Phase 3 dep) — `push()` with `onAuth` shim. Phase 7 reuses; no version bump.
- `nock` (NEW dev dep on `@protostar/delivery-runtime`) — Octokit HTTP fixture surface. Verify current major at planning time.

### Specific code locations
- `apps/factory-cli/src/main.ts:663` — current `createGitHubPrDeliveryPlan` call site (replaced)
- `apps/factory-cli/src/main.ts:793` — current `mkdir(resolve(runDir, "delivery"), { recursive: true })` (kept; layout extends with `ci-events.jsonl`)
- `apps/factory-cli/src/main.ts:813-814` — current `delivery-plan.json` + `delivery/pr-body.md` writes (replaced by `delivery-result.json` + comment posting)
- `packages/delivery/src/index.ts:68` — current `command: ["gh", "pr", "create", ...]` (removed per Q-02)
- `packages/intent/schema/confirmed-intent.schema.json:60-95` — current envelope `network` + `budget` blocks (Phase 7 extends adjacent with `delivery`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/delivery/src/index.ts:72` (`createPrBody`) — string-concatenation body assembly; Phase 7 replaces with per-section composers but the artifact-line patterns (`Factory run: ${runId}`, etc.) inform the run-summary composer.
- `packages/review/src/delivery-authorization.ts` — Phase 5 brand definition; Phase 7 imports the type. Brand-mint pattern is the template for Q-08's `BranchName`/`PrTitle`/`PrBody`.
- Phase 3 `isomorphic-git` clone path with `onAuth` shim — Phase 7 push reuses the same auth pattern (HTTP transport, token-as-password).
- Phase 6 `runFactoryPile` shape — `executeDelivery` signature symmetric: typed plan in, structured outcome out, hierarchical AbortSignal threading. Same ergonomics for the next adapter-style boundary.
- Phase 4 retry classifier (`packages/lmstudio-adapter`) — Octokit transient errors (5xx, network) classified through a similar pattern; reuse the deterministic-backoff helper.
- `packages/dogpile-adapter` static no-fs contract test pattern — Phase 7 `delivery-runtime` mirrors; one-line addition to the verify script.

### Established Patterns
- **Branded types as I/O entry guards** — Phase 1 `ConfirmedIntent`, Phase 2 `Authorized*Op`, Phase 5 `DeliveryAuthorization`, Phase 7 `BranchName`/`PrTitle`/`PrBody`. Each I/O boundary stacks brands on its entry function. Phase 7 has the deepest stack (5 brands).
- **Capability-envelope schema bump cluster** — Phase 4: 1.2.0→1.3.0; Phase 5: 1.3.0→1.4.0; Phase 7: 1.4.0→1.5.0. Each cluster carries ≤3 fields. Coordinated fixture regeneration is the established pattern.
- **Network-permitted, fs-forbidden domain packages** — Phase 6 introduced (`dogpile-adapter`). Phase 7 adds (`delivery-runtime`). AGENTS.md tier table is the canonical doc.
- **Static no-fs contract test** — `src/no-fs.contract.test.ts` greps for `from "node:fs"`, `from "fs"`, `from "node:path"`. Phase 6 pattern; Phase 7 adopts. Plus Phase 7 adds `no-merge.contract.test.ts` (greps for `pulls.merge`, `enableAutoMerge`, etc.).
- **Hierarchical AbortSignal for cancellable I/O** — Phase 6 introduced. Phase 7 reuses: run signal → delivery signal (with timeout) → per-Octokit-call signal threading.
- **Two-step durable artifact (terminal + JSONL)** — Phase 4 (journal+snapshot), Phase 5 (`review.jsonl` + `review-decision.json`), Phase 7 (`ci-events.jsonl` + `delivery-result.json`).

### Integration Points
- Plan schema unchanged; Phase 7 doesn't touch `@protostar/planning`.
- Capability-envelope schema bumps (`@protostar/intent`) — `delivery.target` + `budget.deliveryWallClockMs`.
- `apps/factory-cli/src/main.ts` — replaces `createGitHubPrDeliveryPlan` call with `executeDelivery`; adds preflight (fast + full); persists new artifacts; assembles PR body via composers; threads run-level + delivery-level AbortSignal.
- `packages/review` — exports `DeliveryAuthorization` brand (already does as of Plan 05-04); Phase 7 imports unchanged.
- `pnpm-workspace.yaml` + root `tsconfig.json` references + root `verify` script — add `packages/delivery-runtime/`.
- Phase 9 (Operator surface) — `protostar-factory deliver --capture-ci <runId>` consumes `delivery-result.json` and continues `pollCiStatus` (Q-16). Phase 7 must export `pollCiStatus` cleanly so Phase 9 can re-enter.
- Phase 10 (Dogfood) — first real PR against the toy repo. Phase 7 nock fixtures are the dev surface; Phase 10 swaps to real GitHub.

</code_context>

<deferred>
## Deferred Ideas

- **Screenshot capture pipeline** — deferred to Phase 10 (toy repo dependency). Q-11 lock.
- **Real GitHub integration** — first real PR is Phase 10 DOG-04. Phase 7 ships nock-only.
- **Auto-merge mode** — POST-12 in REQUIREMENTS deferred. v1 stops at PR creation.
- **GitHub webhook listener** — out of scope (no daemon, dark-factory CLI posture). Q-14 option (c) explicitly rejected.
- **Branch-protection-rule reading** for required-checks discovery (Q-15 option a) — adds API call + admin scope; deferred. Operator names checks explicitly via `factory-config.json`.
- **Gist/upload-as-attachment evidence channel** — Q-10 option (c) deferred. v1 uses PR comments. Revisit if PR-comment volume becomes operationally noisy.
- **PR labels / draft PR posture** — not in v1; PRs are non-draft, no labels. Operator workflow may want this in v1.x; not Phase 7.
- **Multi-repo delivery** — single-target only in v1; `envelope.delivery.target` is one repo. Multi-repo orchestration is post-v1.
- **Rate-limit-aware polling** — Q-14's 10s interval is conservative; doesn't read `X-RateLimit-Remaining` headers. Phase 8/9 may add adaptive backoff if observed traffic warrants.
- **PR review request automation** — Phase 7 doesn't auto-request reviewers; operator does. Could be added as a post-v1 capability with reviewer-list config.
- **Stable rubric vocabulary in PR score sheet** — open keys today (Phase 5 Q-11 deferred to Phase 8). Phase 7's score sheet (Q-12) renders whatever keys exist.

</deferred>

---

*Phase: 07-delivery*
*Context gathered: 2026-04-28*
