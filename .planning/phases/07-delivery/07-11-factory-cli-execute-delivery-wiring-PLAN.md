---
phase: 07-delivery
plan: 11
type: execute
wave: 5
depends_on: ["07-05", "07-08", "07-09", "07-10"]
files_modified:
  - apps/factory-cli/src/assemble-delivery-body.ts
  - apps/factory-cli/src/assemble-delivery-body.test.ts
  - apps/factory-cli/src/poll-ci-driver.ts
  - apps/factory-cli/src/poll-ci-driver.test.ts
  - apps/factory-cli/src/execute-delivery-wiring.ts
  - apps/factory-cli/src/execute-delivery-wiring.test.ts
  - apps/factory-cli/src/main.ts
autonomous: true
requirements: [DELIVER-01, DELIVER-03, DELIVER-04, DELIVER-05, DELIVER-06]
must_haves:
  truths:
    - "assembleDeliveryBody orders the per-section composers from @protostar/delivery (run summary → mechanical → judge panel → repair history → artifact list → footer)"
    - "Body assembly catches oversized-body refusal and re-tries by spilling overflow sections into PR comments per Q-10"
    - "factory-cli writes delivery-result.json (terminal, tmp+rename) and ci-events.jsonl (append+fsync) per Q-17"
    - "poll-ci-driver iterates pollCiStatus and persists each yield; on terminal verdict it terminates; on signal abort it records 'cancelled'; on timeout exhaustion it records 'timeout-pending' (Q-16 two-step)"
    - "fs is supplied to delivery-runtime functions via DeliveryRunContext (factory-cli is the sole fs-permitted caller)"
    - "Run terminal status: 'delivered' on PR-created + first-snapshot OR 'delivery-blocked' on preflight/push refusal"
  artifacts:
    - path: apps/factory-cli/src/assemble-delivery-body.ts
      provides: "Orders composers + handles oversized-body spillover"
      exports: ["assembleDeliveryBody"]
    - path: apps/factory-cli/src/poll-ci-driver.ts
      provides: "Drives pollCiStatus + persists ci-events.jsonl + delivery-result.json updates"
      exports: ["drivePollCiStatus"]
    - path: apps/factory-cli/src/execute-delivery-wiring.ts
      provides: "Orchestrates: build plan → executeDelivery → persist initial result → start poll driver"
      exports: ["wireExecuteDelivery"]
  key_links:
    - from: apps/factory-cli/src/main.ts
      to: apps/factory-cli/src/execute-delivery-wiring.ts
      via: "Replaces FIXME marker from Plan 07-10"
      pattern: "wireExecuteDelivery"
    - from: apps/factory-cli/src/poll-ci-driver.ts
      to: packages/delivery-runtime/src/poll-ci-status.ts
      via: "Iterates pollCiStatus async generator"
      pattern: "pollCiStatus"
---

<objective>
Complete the factory-cli wiring: replace the `// FIXME(Plan 07-11)` marker from Plan 07-10 with the full delivery execution path. This plan ships THREE supporting modules + the main.ts integration:

1. **assembleDeliveryBody** — orders the 7 composers from `@protostar/delivery` and handles oversized-body spillover (catches `oversized-body` refusal, moves overflow sections to PR comments per Q-10)
2. **drivePollCiStatus** — iterates `pollCiStatus` async generator, persists each yield to `ci-events.jsonl` (append+fsync) and updates `delivery-result.json` (tmp+rename) until terminal verdict OR budget exhaustion
3. **wireExecuteDelivery** — the single function called from main.ts that builds the plan, calls executeDelivery, persists the initial result, and kicks off the poll driver

Per Q-16, the run reaches terminal status `'delivered'` on PR-create + first-snapshot. The poll driver continues in the background within the same process (or, per CONCERNS, deferred to Phase 9 `--capture-ci` if budget exhausts).

Purpose: Q-08 (5-brand input), Q-10 (spillover), Q-13 (ordered assembly), Q-16 (two-step), Q-17 (artifacts), DELIVER-01..06.
Output: factory-cli ships PR creation + CI capture; replaces all legacy delivery code.
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
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/delivery-preflight-wiring.ts
@packages/delivery/src/index.ts
@packages/delivery-runtime/src/index.ts
@packages/delivery-runtime/src/delivery-result-schema.ts

<interfaces>
<!-- assembleDeliveryBody (Q-13 ordering + Q-10 spillover) -->

```typescript
import type { PrBody, BranchName, PrTitle } from "@protostar/delivery";
import type { JudgeCritique } from "@protostar/review";
import type { StageArtifactRef } from "@protostar/artifacts";

export interface DeliveryBodyInput {
  readonly runId: string;
  readonly target: { readonly owner: string; readonly repo: string; readonly baseBranch: string };
  readonly mechanical: { readonly verdict: 'pass' | 'fail'; readonly findings: readonly unknown[] };
  readonly critiques: readonly JudgeCritique[];
  readonly iterations: readonly unknown[];     // ReviewIteration[] from @protostar/review
  readonly artifacts: readonly StageArtifactRef[];
}

export interface AssembledDelivery {
  readonly body: PrBody;
  readonly evidenceComments: readonly { kind: 'mechanical-full' | 'judge-transcripts' | 'repair-history' | 'oversized-body-overflow'; body: PrBody }[];
}

export function assembleDeliveryBody(input: DeliveryBodyInput): AssembledDelivery;
```

<!-- drivePollCiStatus (Q-14, Q-16, Q-17) -->

```typescript
import type { CiSnapshot, DeliveryResult } from "@protostar/delivery-runtime";

export async function drivePollCiStatus(input: {
  readonly initialResult: DeliveryResult;
  readonly poll: AsyncGenerator<CiSnapshot, void, unknown>;
  readonly runDir: string;
  readonly fs: typeof import("node:fs/promises");
  readonly signal: AbortSignal;
}): Promise<DeliveryResult>;
```

<!-- wireExecuteDelivery (single entry from main.ts) -->

```typescript
import type { ProtostarOctokit } from "@protostar/delivery-runtime";

export async function wireExecuteDelivery(input: {
  readonly runId: string;
  readonly runDir: string;
  readonly authorization: import("@protostar/review").DeliveryAuthorization;
  readonly intent: { readonly title: string; readonly archetype: string };
  readonly target: { readonly owner: string; readonly repo: string; readonly baseBranch: string };
  readonly bodyInput: DeliveryBodyInput;
  readonly token: string;
  readonly octokit: ProtostarOctokit;
  readonly baseSha: string;
  readonly workspaceDir: string;
  readonly fs: typeof import("node:fs/promises");
  readonly signal: AbortSignal;
}): Promise<{ readonly status: 'delivered' | 'delivery-blocked' }>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: assembleDeliveryBody (composer ordering + oversized-body spillover)</name>
  <read_first>
    - packages/delivery/src/index.ts (the 7 composers + validatePrBody from Plan 07-05 + 07-04)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-10 (spillover) + Q-13 (ordering)
    - packages/delivery/src/refusals.ts (oversized-body refusal kind)
  </read_first>
  <behavior>
    - First pass: build full body by concatenating composer outputs in order:
      1. composeRunSummary({ runId, target })
      2. composeMechanicalSummary(mechanical)
      3. composeJudgePanel({ critiques })
      4. composeRepairHistory({ iterations })
      5. composeArtifactList(artifacts)
      6. composeFooter({ screenshotStatus: 'deferred-v01' })
    - Pass full body through `validatePrBody`:
      - On ok → return { body, evidenceComments: [...standard 3 comments] } (mechanical-full + judge-transcripts + repair-history with detailed forms)
      - On `oversized-body` refusal → trigger spillover:
        - Build a SHORTER body (replace mechanical + judge-panel + repair-history sections with summary stubs that point to "see PR comment for full transcript")
        - Re-validate the shorter body
        - Add an `oversized-body-overflow` comment containing the truncated overflow sections
        - If shorter body STILL fails (e.g., raw artifact list is huge), refuse with a deterministic refusal — caller handles
    - Always emit 3 standard evidence comments (mechanical-full, judge-transcripts, repair-history) carrying the full transcripts. The PR body has the SUMMARIES; comments have the DETAIL.
    - Each comment body validated through validatePrBody; comments individually capped at 60_000 bytes — if any comment overflows, it's emitted as multiple comments (e.g., `judge-transcripts` part 1 of N). Document this as a post-v0.1 enhancement; for now, refuse if a single comment > 60_000.
    - Tests:
      - Small inputs: full body fits, 3 comments emitted
      - Big iterations: body overflows, spillover triggers, 4 comments emitted (overflow added)
      - Empty critiques + empty iterations → composer empty-state outputs concatenated cleanly
      - Body output passes validatePrBody (returns branded PrBody)
      - Output ordering deterministic (snapshot the full body for a representative input)
  </behavior>
  <files>apps/factory-cli/src/assemble-delivery-body.ts, apps/factory-cli/src/assemble-delivery-body.test.ts</files>
  <action>
    1. **RED:** Write 5+ tests covering normal + spillover + edge cases. Run; fail.
    2. **GREEN:** Implement per `<behavior>`. Use the 7 composers from `@protostar/delivery`. Use `validatePrBody` to mint the brand.
    3. The "shorter body" strategy: when oversized, swap full mechanical/judge/repair sections for one-line summary stubs:
       ```
       ## Mechanical Review
       _Summary moved to PR comment._
       ```
       and add the full content to the overflow comment.
    4. Each comment body is validated through validatePrBody (cast as PrBody).
    5. **REFACTOR:** Re-export from a public surface? No — this is factory-cli-local; keep it private to apps/factory-cli.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test --run assemble-delivery-body</automated>
  </verify>
  <acceptance_criteria>
    - 5+ test cases green
    - Body output is branded PrBody
    - Spillover scenario produces 4 comments (3 standard + 1 overflow)
    - Composer ordering pinned via snapshot
    - `grep -c "composeRunSummary\|composeMechanicalSummary\|composeJudgePanel\|composeRepairHistory\|composeArtifactList\|composeFooter" apps/factory-cli/src/assemble-delivery-body.ts` ≥ 6 (all six core composers used)
  </acceptance_criteria>
  <done>assembleDeliveryBody green; spillover handled; ordering pinned.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: drivePollCiStatus (persists each yield + handles terminal/timeout/cancel)</name>
  <read_first>
    - packages/delivery-runtime/src/poll-ci-status.ts (Plan 07-09)
    - packages/delivery-runtime/src/delivery-result-schema.ts (Plan 07-09)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-14 + Q-16 + Q-17 + Q-19
    - .planning/phases/07-delivery/07-RESEARCH.md §"Pattern 5: Two-step CI capture"
  </read_first>
  <behavior>
    - Iterate the generator with `for await (const snap of poll)`:
      - Append a `ci-snapshot` CiEvent to `ci-events.jsonl` (append+fsync via fs.appendFile)
      - Update `delivery-result.json` via tmp+rename: merge snapshot into rolling window (keep last 10 + first 1 per RESEARCH §"Claude's Discretion")
      - Update `ciVerdict` and `ciVerdictUpdatedAt`
      - If `snap.terminal === true`: append `ci-terminal` event, break loop, return updated DeliveryResult
    - On AbortError (signal cancel): append `ci-cancelled` event with reason from signal.reason, set `ciVerdict: 'cancelled'`, return
    - On budget exhaustion (signal aborted with reason='timeout'): append `ci-timeout` event, set `ciVerdict: 'timeout-pending'`, set `exhaustedAt`, return — Phase 9 `--capture-ci` resumes
    - Each snapshot append is fsync-ed (defense against crash mid-write)
    - Each delivery-result.json write is atomic (tmp+rename)
    - Tests via mock async generator:
      - Generator yields 1 terminal snapshot → result has ciVerdict='pass', 1 snapshot in rolling window, 2 events in jsonl (1 ci-snapshot + 1 ci-terminal)
      - Generator yields 5 pending then 1 terminal → result has 6 snapshots in rolling window (within keep-last-10), 7 events (6 snapshot + 1 terminal)
      - Pre-aborted signal → no yields; jsonl has 1 ci-cancelled event; ciVerdict='cancelled'
      - Generator throws AbortError mid-iteration → 1+ snapshot events + 1 cancelled
      - Timeout signal (signal.reason='timeout') → 1 ci-timeout event; ciVerdict='timeout-pending'
  </behavior>
  <files>apps/factory-cli/src/poll-ci-driver.ts, apps/factory-cli/src/poll-ci-driver.test.ts</files>
  <action>
    1. **RED:** Write 5+ tests with hand-rolled async generators (no nock — test the persistence logic in isolation). Run; fail.
    2. **GREEN:** Implement per `<behavior>`:
       ```typescript
       export async function drivePollCiStatus(input: {...}): Promise<DeliveryResult> {
         let result = input.initialResult;
         const eventsPath = resolve(input.runDir, "delivery", "ci-events.jsonl");
         const resultPath = resolve(input.runDir, "delivery", "delivery-result.json");

         try {
           for await (const snap of input.poll) {
             await appendJsonl(input.fs, eventsPath, { kind: 'ci-snapshot', at: snap.at, checks: snap.checks });
             result = mergeSnapshot(result, snap);
             await writeJsonAtomic(input.fs, resultPath, result);
             if (snap.terminal) {
               await appendJsonl(input.fs, eventsPath, { kind: 'ci-terminal', at: new Date().toISOString(), verdict: snap.verdict });
               return result;
             }
           }
           // Generator returned without terminal → also terminal (e.g., generator implements its own end logic)
           return result;
         } catch (e: any) {
           const at = new Date().toISOString();
           if (input.signal.reason === 'timeout') {
             await appendJsonl(input.fs, eventsPath, { kind: 'ci-timeout', at });
             result = { ...result, ciVerdict: 'timeout-pending', exhaustedAt: at, ciVerdictUpdatedAt: at };
           } else {
             const reason = (input.signal.reason as 'sigint'|'timeout'|'sentinel') ?? 'parent-abort';
             await appendJsonl(input.fs, eventsPath, { kind: 'ci-cancelled', at, reason });
             result = { ...result, ciVerdict: 'cancelled', ciVerdictUpdatedAt: at };
           }
           await writeJsonAtomic(input.fs, resultPath, result);
           return result;
         }
       }

       function mergeSnapshot(result: DeliveryResult, snap: CiSnapshot): DeliveryResult {
         const newSnapshots = [...result.ciSnapshots, { at: snap.at, checks: snap.checks }];
         // Rolling window: keep first 1 + last 10
         const rolled = newSnapshots.length > 11 ? [newSnapshots[0]!, ...newSnapshots.slice(-10)] : newSnapshots;
         return { ...result, ciVerdict: snap.verdict === 'no-checks-configured' ? 'no-checks-configured' : snap.verdict, ciVerdictUpdatedAt: snap.at, ciSnapshots: rolled };
       }
       ```
    3. The `appendJsonl` helper: open file in append mode, write `JSON.stringify(event) + "\n"`, fsync. Use `fs.open + fileHandle.appendFile + fileHandle.sync()` or similar.
    4. The `writeJsonAtomic` helper from Plan 07-10 is reused (extract to shared helper if needed).
    5. **REFACTOR:** Add JSDoc citing Q-16 + Q-17.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test --run poll-ci-driver</automated>
  </verify>
  <acceptance_criteria>
    - 5+ test cases green
    - Rolling window keeps first 1 + last 10 (verifiable via test with 15 yields)
    - ci-events.jsonl is append-only (test asserts file size grows monotonically)
    - delivery-result.json is atomic-written (test asserts no .tmp file persists post-write)
    - timeout signal produces ciVerdict='timeout-pending' + exhaustedAt
    - cancel signal produces ciVerdict='cancelled'
  </acceptance_criteria>
  <done>drivePollCiStatus green across all signal scenarios; rolling window correct.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: wireExecuteDelivery + main.ts integration (replaces FIXME from 07-10)</name>
  <read_first>
    - apps/factory-cli/src/main.ts (FIXME marker from Plan 07-10 indicates the call site)
    - packages/delivery-runtime/src/execute-delivery.ts (Plan 07-08)
    - packages/delivery/src/brands.ts (validateBranchName + buildBranchName from 07-04 + 07-07)
    - apps/factory-cli/src/assemble-delivery-body.ts (Task 1)
    - apps/factory-cli/src/poll-ci-driver.ts (Task 2)
  </read_first>
  <behavior>
    - wireExecuteDelivery composes the full delivery sequence:
      1. Build branch name: `buildBranchName({ archetype, runId })` → string → `validateBranchName` → BranchName
      2. Validate title: `validatePrTitle(intent.title || runId)` → PrTitle (refusal handled inline)
      3. Build body: `assembleDeliveryBody(bodyInput)` → { body, evidenceComments }
      4. Build remoteUrl: `https://github.com/${target.owner}/${target.repo}.git`
      5. Build DeliveryRunContext { runId, token, signal, fs, octokit, remoteUrl, workspaceDir, expectedRemoteSha: null }
      6. Call `executeDelivery(authorization, plan, ctx)`
      7. On `status === 'delivery-blocked'`:
         - Persist `delivery-result.json` with status='delivery-blocked' + refusal (atomic write)
         - Append `ci-cancelled` or appropriate CiEvent
         - Return { status: 'delivery-blocked' }
      8. On `status === 'delivered'`:
         - Build initial DeliveryResult { schemaVersion: '1.0.0', runId, status: 'delivered', branch, prUrl, prNumber, headSha, baseSha, baseBranch, createdAt, ciVerdict: 'pending', ciVerdictUpdatedAt: now, ciSnapshots: [initialSnapshot], evidenceComments, commentFailures, screenshots: { status: 'deferred-v01', reason: '...' } }
         - Persist delivery-result.json (atomic write)
         - Append ci-events.jsonl with `pr-created` + each `comment-posted`/`comment-failed` event
         - Start `pollCiStatus` async generator
         - Call `drivePollCiStatus` with the initial result and the generator (this completes synchronously when terminal/timeout/cancel)
         - Return { status: 'delivered' }
    - On any brand-mint refusal (invalid title, etc.), persist delivery-result.json with status='delivery-blocked' + refusal; do NOT proceed to executeDelivery.
    - Tests:
      - Happy path (mocked executeDelivery + poll generator): delivers, all artifacts written, status='delivered'
      - Delivery blocked (executeDelivery returns blocked refusal): persists blocked result, no poll driver invocation
      - Brand-mint refusal (invalid title): persists blocked, no executeDelivery call
      - File assertions: delivery-result.json exists with correct schema; ci-events.jsonl has expected events
  </behavior>
  <files>apps/factory-cli/src/execute-delivery-wiring.ts, apps/factory-cli/src/execute-delivery-wiring.test.ts, apps/factory-cli/src/main.ts</files>
  <action>
    1. **RED:** Write 4+ tests for wireExecuteDelivery using injection (mock executeDelivery + mock pollCiStatus generator). Tests do NOT use nock; they verify the wiring logic.
    2. **GREEN:** Implement wireExecuteDelivery per `<behavior>`. To keep dependencies injectable, accept `executeDelivery` and a `pollFactory` as optional parameters defaulting to the real implementations:
       ```typescript
       export async function wireExecuteDelivery(input: { ... }, deps?: {
         executeDelivery?: typeof import("@protostar/delivery-runtime").executeDelivery;
         pollCiStatus?: typeof import("@protostar/delivery-runtime").pollCiStatus;
       }): Promise<{ status: 'delivered' | 'delivery-blocked' }> {
         const ed = deps?.executeDelivery ?? defaultExecuteDelivery;
         // ...
       }
       ```
    3. **Wire into main.ts:** find the `// FIXME(Plan 07-11)` marker from Plan 07-10. Replace with:
       ```typescript
       const bodyInput = { /* assemble from existing run state */ };
       const wireResult = await wireExecuteDelivery({
         runId, runDir, authorization, intent, target,
         bodyInput, token, octokit, baseSha,
         workspaceDir, fs, signal: deliverySignal
       });
       process.exitCode = wireResult.status === 'delivered' ? 0 : 1;
       ```
       Remove the FIXME comment.
    4. The `bodyInput` is sourced from prior run state (mechanical findings, judge critiques, review iterations, artifact list). These are already accessible in main.ts at the loop-approval point per Phase 5's wiring (Plan 05-12).
    5. The `archetype` for `buildBranchName` comes from intent (e.g., `intent.archetype` field — if not present, use a default like `'cosmetic-tweak'`; verify by reading the intent type).
    6. **REFACTOR:** Run `pnpm run verify`. The factory-cli tests must pass. The `pnpm run factory` smoke must build (will still stop at workspace-trust gate per Phase 2; that's expected).
    7. After this task lands, ALL of Phase 7's executable code is in place. The remaining plan (07-12) covers admission-e2e contract tests for the cross-package guarantees.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test && pnpm --filter @protostar/factory-cli build && pnpm run verify</automated>
  </verify>
  <acceptance_criteria>
    - 4+ wireExecuteDelivery test cases green
    - `grep -c "FIXME(Plan 07-11)" apps/factory-cli/src/main.ts` returns 0 (marker replaced)
    - `grep -c "wireExecuteDelivery" apps/factory-cli/src/main.ts` ≥ 1
    - `grep -c "createGitHubPrDeliveryPlanLegacy" apps/factory-cli/src/main.ts` returns 0
    - `pnpm run verify` succeeds
    - `pnpm run factory` builds (workspace-trust gate stop is expected and acceptable)
    - delivery-result.json written with schemaVersion='1.0.0' on delivered runs
    - ci-events.jsonl written with at least pr-created + per-comment events on delivered runs
  </acceptance_criteria>
  <done>Phase 7 executable surface complete; main.ts has zero FIXME markers; full Phase 7 verify green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| factory-cli → delivery-runtime | All fs supplied via DI; signal hierarchy passed through. |
| factory-cli → run artifacts | Atomic writes (tmp+rename); JSONL append+fsync. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-11-01 | Tampering | execute-delivery-wiring.ts | mitigate | DeliveryAuthorization brand passed verbatim; brand-mint refusals persisted before any delivery attempt. |
| T-07-11-02 | DoS | poll-ci-driver.ts | mitigate | Hierarchical signal cancels poll; budget-exhaustion produces `timeout-pending` + Phase 9 resume path. |
| T-07-11-03 | Information Disclosure | assemble-delivery-body.ts | mitigate | Body validated through validatePrBody (control chars rejected); composers are pure (no token access). |
| T-07-11-04 | Tampering | poll-ci-driver.ts | mitigate | Atomic delivery-result.json writes prevent partial-write corruption on crash. |
</threat_model>

<verification>
- `pnpm --filter @protostar/factory-cli test`
- `pnpm run verify` (full)
- `pnpm run factory` (build only — stops at workspace-trust as expected)
</verification>

<success_criteria>
- assembleDeliveryBody handles spillover correctly
- drivePollCiStatus persists every yield + handles all signal scenarios
- main.ts has no FIXME markers; legacy delivery code fully removed
- delivery-result.json + ci-events.jsonl shapes match Q-17
- pnpm run verify green
</success_criteria>

<output>
Create `.planning/phases/07-delivery/07-11-SUMMARY.md` documenting the three modules + main.ts integration + the resulting end-to-end delivery flow.
</output>
