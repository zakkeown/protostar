---
phase: 07-delivery
plan: 10
type: execute
wave: 5
depends_on: ["07-01", "07-03", "07-06"]
files_modified:
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/delivery-preflight-wiring.ts
  - apps/factory-cli/src/delivery-preflight-wiring.test.ts
autonomous: true
requirements: [DELIVER-01]
must_haves:
  truths:
    - "preflightDeliveryFast runs at run start (immediately after admission, before execution wave) per Q-06"
    - "preflightDeliveryFast failure writes runs/{id}/delivery/preflight-refusal.json and refuses to advance"
    - "preflightDeliveryFull runs at delivery boundary (after loop approval + DeliveryAuthorization mint) per Q-06"
    - "preflightDeliveryFull excessive-pat-scope refusal blocks delivery (Q-20)"
    - "Both preflights honor the run signal + composed delivery signal (Q-19)"
    - "Token sourced from process.env['PROTOSTAR_GITHUB_TOKEN'] only — no CLI flag, no other env var (Q-04)"
  artifacts:
    - path: apps/factory-cli/src/delivery-preflight-wiring.ts
      provides: "Composes preflight calls + writes refusal artifacts; called from main.ts"
      exports: ["runFastDeliveryPreflight", "runFullDeliveryPreflight"]
  key_links:
    - from: apps/factory-cli/src/main.ts
      to: apps/factory-cli/src/delivery-preflight-wiring.ts
      via: "Two call sites: post-admission (fast) + post-loop-approval (full)"
      pattern: "runFastDeliveryPreflight|runFullDeliveryPreflight"
---

<objective>
Wire the two delivery preflights from `@protostar/delivery-runtime` (Plan 07-06) into `apps/factory-cli/src/main.ts` per Q-06: fast preflight runs at run start (saves model spend on doomed runs), full preflight runs at the delivery boundary (after the review loop approves and `DeliveryAuthorization` is minted). Each refusal writes a typed `preflight-refusal.json` to `runs/{id}/delivery/` and aborts the run.

This plan is split from the larger factory-cli wiring (Plan 07-11 handles the actual `executeDelivery` + persistence + poll driver) per advisor guidance — main.ts is dense enough that combining preflight wiring + executeDelivery wiring + poll driver would exceed task budget.

Purpose: Q-06, Q-04, Q-19, Q-20 — preflight wiring + refusal artifacts + signal threading.
Output: Two factory-cli call sites + a small wiring module + a refusal-artifact path established.
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
@packages/delivery-runtime/src/preflight-fast.ts
@packages/delivery-runtime/src/preflight-full.ts
@packages/delivery-runtime/src/octokit-client.ts
@packages/intent/src/compute-delivery-allowed-hosts.ts

<interfaces>
<!-- Wiring module signatures -->

```typescript
// apps/factory-cli/src/delivery-preflight-wiring.ts

import type { FastPreflightResult, FullPreflightResult, DeliveryTarget, ProtostarOctokit } from "@protostar/delivery-runtime";

export interface FastPreflightOutcome {
  readonly proceed: boolean;
  readonly result: FastPreflightResult;
  readonly refusalPath?: string;        // path written if !proceed
}

export async function runFastDeliveryPreflight(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly runDir: string;              // .protostar/runs/{id}
  readonly fs: typeof import("node:fs/promises");
}): Promise<FastPreflightOutcome>;

export interface FullPreflightOutcome {
  readonly proceed: boolean;
  readonly result: FullPreflightResult;
  readonly refusalPath?: string;
  readonly octokit?: ProtostarOctokit;  // returned for reuse if proceed=true
  readonly tokenLogin?: string;
  readonly baseSha?: string;
}

export async function runFullDeliveryPreflight(input: {
  readonly token: string;
  readonly target: DeliveryTarget;
  readonly runDir: string;
  readonly fs: typeof import("node:fs/promises");
  readonly signal: AbortSignal;
}): Promise<FullPreflightOutcome>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: delivery-preflight-wiring module</name>
  <read_first>
    - apps/factory-cli/src/main.ts (current admission + loop entry; identify the line where admission completes — the fast preflight slot — and where the loop returns approval — the full preflight slot)
    - packages/delivery-runtime/src/preflight-fast.ts + preflight-full.ts (Plan 07-06 outputs)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-06 (both preflights) + Q-04 (env var)
  </read_first>
  <behavior>
    - runFastDeliveryPreflight:
      - Calls `preflightDeliveryFast(env)` from delivery-runtime
      - On `outcome === 'ok'` → return { proceed: true, result }
      - On any other outcome → write `runs/{id}/delivery/preflight-refusal.json` with shape `{ phase: 'fast', result: FastPreflightResult, runId, at }` and return { proceed: false, result, refusalPath }
      - Uses `mkdir({ recursive: true })` to ensure the `delivery/` subdir exists
      - Atomic write via tmp+rename pattern: write to `preflight-refusal.json.tmp`, then rename
    - runFullDeliveryPreflight:
      - Builds Octokit via `buildOctokit(token, { userAgent })`
      - Calls `preflightDeliveryFull({ token, target, signal }, octokit)`
      - On `outcome === 'ok'` → return { proceed: true, result, octokit, tokenLogin, baseSha }
      - On any other outcome → write `preflight-refusal.json` with phase='full' + result; return refusal path
      - Token NEVER appears in the refusal artifact (only outcome + scopes + status; redaction handled by mapOctokitErrorToRefusal)
    - Tests:
      - Fast: token-missing path writes refusal, returns proceed=false
      - Fast: ok path returns proceed=true, no file write
      - Full: nock fixtures for each of 6 outcomes (ok, token-invalid, repo-inaccessible, base-branch-missing, excessive-pat-scope) — each writes the appropriate refusal
      - Full: token NEVER appears in the written refusal file (assert by reading file + grep for fake token)
  </behavior>
  <files>apps/factory-cli/src/delivery-preflight-wiring.ts, apps/factory-cli/src/delivery-preflight-wiring.test.ts</files>
  <action>
    1. **RED:** Write tests covering all paths (5 fast + 6 full + 1 token-leak negative). Use a tmp `runDir` per test; `t.after` cleans up.
    2. **GREEN:** Implement both functions per `<behavior>`. apps/factory-cli MAY import `node:fs/promises` directly (it's the fs-permitted tier).
    3. The atomic write helper:
       ```typescript
       async function writeJsonAtomic(fs: typeof import("node:fs/promises"), path: string, data: unknown): Promise<void> {
         const tmp = path + ".tmp";
         await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
         await fs.rename(tmp, path);
       }
       ```
       This is reusable; if a similar helper already exists in apps/factory-cli, use it (grep the existing code first).
    4. **REFACTOR:** Document the refusal artifact JSON shape in a JSDoc on `runFastDeliveryPreflight` so Plan 07-12 (admission-e2e) can pin it.
    5. Token-leak test: simulate full preflight with a fake token in env; after writing refusal, `await fs.readFile(refusalPath, 'utf8')` and assert it does NOT contain the token string.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test --run delivery-preflight-wiring</automated>
  </verify>
  <acceptance_criteria>
    - 11+ test cases green (5 fast + 6 full)
    - Token-leak test asserts zero matches in refusal JSON
    - Atomic-write pattern (tmp+rename) used (grep for `\.tmp\b` and `rename`)
    - File `apps/factory-cli/src/delivery-preflight-wiring.ts` exports `runFastDeliveryPreflight` and `runFullDeliveryPreflight`
  </acceptance_criteria>
  <done>Wiring module green with token-leak negative test.</done>
</task>

<task type="auto">
  <name>Task 2: Wire fast + full preflight into apps/factory-cli/src/main.ts</name>
  <read_first>
    - apps/factory-cli/src/main.ts (full file — identify the admission entry, the loop approval point at ~line 750, and the existing legacy delivery call site)
    - apps/factory-cli/src/delivery-preflight-wiring.ts (Task 1)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-06 + Q-19 (signal hierarchy)
  </read_first>
  <files>apps/factory-cli/src/main.ts</files>
  <action>
    1. **Locate the slot for fast preflight:** find the line in `main.ts` where admission completes and execution is about to begin. Insert immediately AFTER admission completion and BEFORE any execution wave kicks off:
       ```typescript
       const fastResult = await runFastDeliveryPreflight({ env: process.env, runDir, fs });
       if (!fastResult.proceed) {
         // Refusal already persisted by runFastDeliveryPreflight; exit cleanly.
         process.exitCode = 1;
         return;
       }
       ```
    2. **Locate the slot for full preflight:** find the loop-approval point (around the existing `createGitHubPrDeliveryPlanLegacy` call site, ~line 750 per CONTEXT). After `loadDeliveryAuthorization(decisionPath)` succeeds (i.e., the run hit a pass/pass loop verdict), but BEFORE attempting `executeDelivery` (which Plan 07-11 wires next), call:
       ```typescript
       const target = intent.capabilityEnvelope.delivery!.target; // signed delivery target from confirmed intent (Plan 07-01 schema bump)
       const token = process.env['PROTOSTAR_GITHUB_TOKEN']!;       // already validated at fast preflight
       const fullResult = await runFullDeliveryPreflight({ token, target, runDir, fs, signal: deliverySignal });
       if (!fullResult.proceed) {
         process.exitCode = 1;
         return;
       }
       const { octokit, baseSha } = fullResult;
       // octokit + baseSha consumed by Plan 07-11's executeDelivery call
       ```
    3. **Compose the delivery signal** here (Q-19). Read `envelope.budget.deliveryWallClockMs` from the confirmed intent (default 600_000):
       ```typescript
       const deliveryWallClockMs = intent.capabilityEnvelope.budget.deliveryWallClockMs ?? 600_000;
       const deliverySignal = AbortSignal.any([
         runSignal,
         AbortSignal.timeout(deliveryWallClockMs)
       ]);
       ```
       (`runSignal` is the existing run-level AbortSignal from Phase 4 SIGINT/sentinel infrastructure.)
    4. The legacy `createGitHubPrDeliveryPlanLegacy` call site should be REMOVED in this plan (its logic is replaced by Plan 07-11's `executeDelivery` call). Leave a comment marker `// FIXME(Plan 07-11): wire executeDelivery here using fullResult.octokit + baseSha + plan composition` so Plan 07-11's executor knows exactly where to land.
    5. The existing `mkdir(resolve(runDir, "delivery"))` at ~line 880 is preserved (preflight-refusal.json writes into this dir).
    6. The `writeJson(.../delivery-plan.json)` and `writeFile(.../delivery/pr-body.md)` legacy writes are REMOVED (per CONTEXT — replaced by Plan 07-11's `delivery-result.json` + comments).
    7. Token validation: `process.env['PROTOSTAR_GITHUB_TOKEN']` is unwrapped via `!` after fast preflight returns proceed=true (the fast preflight already checked presence + format).
    8. Run `pnpm --filter @protostar/factory-cli build` — TypeScript catches any signature mismatches.
    9. **Do NOT yet run executeDelivery** — that's Plan 07-11. This plan ends with the run currently aborting at the `// FIXME(07-11)` line; once 07-11 lands, the run continues into delivery.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "runFastDeliveryPreflight" apps/factory-cli/src/main.ts` ≥ 1
    - `grep -c "runFullDeliveryPreflight" apps/factory-cli/src/main.ts` ≥ 1
    - `grep -c "AbortSignal.any" apps/factory-cli/src/main.ts` ≥ 1
    - `grep -c "deliveryWallClockMs" apps/factory-cli/src/main.ts` ≥ 1
    - `grep -c "FIXME(Plan 07-11)" apps/factory-cli/src/main.ts` ≥ 1 (handoff marker for next plan)
    - `grep -c "createGitHubPrDeliveryPlanLegacy" apps/factory-cli/src/main.ts` returns 0 (legacy call site removed)
    - `pnpm --filter @protostar/factory-cli build` succeeds
    - Existing factory-cli tests still pass (or are updated to expect the new preflight behavior)
  </acceptance_criteria>
  <done>main.ts threads fast + full preflight; legacy delivery call removed; FIXME marker for 07-11.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| process.env → factory-cli | PROTOSTAR_GITHUB_TOKEN read once, never logged. |
| factory-cli → preflight-* | Token + target supplied via DI; refusal artifacts persisted at known paths. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-10-01 | Information Disclosure | delivery-preflight-wiring.ts | mitigate | Refusal JSON contains only outcome + scopes (never the token); test asserts. |
| T-07-10-02 | Tampering | main.ts | mitigate | Fast preflight prevents doomed-run start; full preflight prevents delivery to wrong target. |
| T-07-10-03 | DoS | main.ts | mitigate | AbortSignal.timeout caps delivery wall-clock per envelope budget. |
</threat_model>

<verification>
- `pnpm --filter @protostar/factory-cli test`
- `pnpm --filter @protostar/factory-cli build`
- `pnpm run verify` at root (factory-cli must remain green)
</verification>

<success_criteria>
- Two preflight call sites in main.ts
- Refusal artifacts persisted at runs/{id}/delivery/preflight-refusal.json (atomic write)
- Hierarchical AbortSignal composed at delivery boundary
- Legacy `createGitHubPrDeliveryPlanLegacy` call site removed
- FIXME marker for Plan 07-11
</success_criteria>

<output>
Create `.planning/phases/07-delivery/07-10-SUMMARY.md` documenting the two call sites + the FIXME handoff to Plan 07-11.
</output>
