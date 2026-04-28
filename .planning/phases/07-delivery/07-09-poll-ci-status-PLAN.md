---
phase: 07-delivery
plan: 09
type: execute
wave: 4
depends_on: ["07-06", "07-08"]
files_modified:
  - packages/delivery-runtime/src/compute-ci-verdict.ts
  - packages/delivery-runtime/src/compute-ci-verdict.test.ts
  - packages/delivery-runtime/src/poll-ci-status.ts
  - packages/delivery-runtime/src/poll-ci-status.test.ts
  - packages/delivery-runtime/src/delivery-result-schema.ts
  - packages/delivery-runtime/src/delivery-result-schema.test.ts
  - packages/delivery-runtime/src/index.ts
autonomous: true
requirements: [DELIVER-04, DELIVER-05]
must_haves:
  truths:
    - "computeCiVerdict(checkRuns, requiredChecks) returns 'pass'|'fail'|'pending'|'no-checks-configured' per Q-15 AND-over-allowlist semantics"
    - "Empty requiredChecks → 'no-checks-configured' (Q-15 default)"
    - "pollCiStatus is an async generator yielding CiSnapshot per poll; honors AbortSignal"
    - "Polling interval 10_000ms (Q-14); ends on terminal verdict OR signal abort OR budget exhaustion"
    - "DeliveryResult schema covers Q-17 verbatim shape including ciVerdict union, evidenceComments, commentFailures, ciSnapshots rolling window, exhaustedAt"
    - "CiEvent JSONL schema covers all 6 event kinds (pr-created, comment-posted, comment-failed, ci-snapshot, ci-terminal, ci-timeout, ci-cancelled)"
  artifacts:
    - path: packages/delivery-runtime/src/compute-ci-verdict.ts
      provides: "Pure verdict computation over check_runs + allowlist"
      exports: ["computeCiVerdict", "CiVerdict"]
    - path: packages/delivery-runtime/src/poll-ci-status.ts
      provides: "Async generator polling CI; signal-honoring"
      exports: ["pollCiStatus", "CiSnapshot"]
    - path: packages/delivery-runtime/src/delivery-result-schema.ts
      provides: "DeliveryResult interface + CiEvent union; JSON shape pinned via test"
      exports: ["DeliveryResult", "CiEvent", "DELIVERY_RESULT_SCHEMA_VERSION"]
  key_links:
    - from: packages/delivery-runtime/src/poll-ci-status.ts
      to: packages/delivery-runtime/src/compute-ci-verdict.ts
      via: "Per-snapshot verdict computation"
      pattern: "computeCiVerdict"
---

<objective>
Land the CI capture layer: a pure `computeCiVerdict` over the requiredChecks allowlist (Q-15), the `pollCiStatus` async generator with hierarchical AbortSignal honoring (Q-14, Q-19), and the `DeliveryResult` + `CiEvent` JSON shape (Q-17). Together these complete the Q-16 two-step CI capture from `executeDelivery`'s initial snapshot through terminal verdict (or budget exhaustion → `'timeout-pending'`).

Per Q-16, executeDelivery (Plan 07-08) already returned after the FIRST snapshot. This plan provides the continuation: factory-cli (Plan 07-11) will iterate `pollCiStatus` and persist each yield. This plan does NOT write to the filesystem (still in `delivery-runtime`); persistence is factory-cli's job.

Purpose: Q-14, Q-15, Q-16, Q-17, DELIVER-04, DELIVER-05.
Output: 3 modules + tests pinning the verdict computation, polling cadence, and JSON shape.
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
@packages/delivery-runtime/src/octokit-client.ts
@packages/delivery-runtime/src/preflight-full.ts

<interfaces>
<!-- computeCiVerdict (Q-15 AND-over-allowlist) -->

```typescript
export type CiVerdict = 'pass' | 'fail' | 'pending' | 'no-checks-configured';

export function computeCiVerdict(
  checkRuns: readonly { name: string; status: string; conclusion: string | null }[],
  requiredChecks: readonly string[]
): CiVerdict;
```

<!-- pollCiStatus (Q-14 + Q-19 + Q-16) -->

```typescript
export interface CiSnapshot {
  readonly at: string;                  // ISO timestamp
  readonly checks: readonly { name: string; status: string; conclusion: string | null }[];
  readonly verdict: CiVerdict;
  readonly terminal: boolean;            // true when verdict is 'pass' or 'fail' or 'no-checks-configured'
}

export async function* pollCiStatus(input: {
  readonly target: DeliveryTarget;
  readonly headSha: string;
  readonly requiredChecks: readonly string[];
  readonly octokit: ProtostarOctokit;
  readonly signal: AbortSignal;
  readonly intervalMs?: number;          // default 10_000
}): AsyncGenerator<CiSnapshot, void, unknown>;
```

<!-- DeliveryResult + CiEvent (Q-17) -->

```typescript
export const DELIVERY_RESULT_SCHEMA_VERSION = "1.0.0" as const;

export interface DeliveryResult {
  readonly schemaVersion: typeof DELIVERY_RESULT_SCHEMA_VERSION;
  readonly runId: string;
  readonly status: 'delivered' | 'delivery-blocked';
  readonly branch: string;
  readonly prUrl?: string;
  readonly prNumber?: number;
  readonly headSha?: string;
  readonly baseSha?: string;
  readonly baseBranch: string;
  readonly createdAt: string;
  readonly ciVerdict: 'pass' | 'fail' | 'pending' | 'timeout-pending' | 'no-checks-configured' | 'cancelled';
  readonly ciVerdictUpdatedAt: string;
  readonly ciSnapshots: readonly { at: string; checks: readonly { name: string; status: string; conclusion: string | null }[] }[];
  readonly evidenceComments: readonly { kind: string; commentId: number; url: string }[];
  readonly commentFailures: readonly { kind: string; reason: string }[];
  readonly exhaustedAt?: string;
  readonly screenshots: { status: 'deferred-v01'; reason: string };
  readonly refusal?: DeliveryRefusal;
}

export type CiEvent =
  | { readonly kind: 'pr-created'; readonly at: string; readonly prNumber: number; readonly prUrl: string; readonly headSha: string }
  | { readonly kind: 'comment-posted'; readonly at: string; readonly commentKind: string; readonly commentId: number }
  | { readonly kind: 'comment-failed'; readonly at: string; readonly commentKind: string; readonly reason: string }
  | { readonly kind: 'ci-snapshot'; readonly at: string; readonly checks: readonly { name: string; status: string; conclusion: string | null }[] }
  | { readonly kind: 'ci-terminal'; readonly at: string; readonly verdict: 'pass' | 'fail' | 'no-checks-configured' }
  | { readonly kind: 'ci-timeout'; readonly at: string }
  | { readonly kind: 'ci-cancelled'; readonly at: string; readonly reason: 'sigint' | 'timeout' | 'sentinel' | 'parent-abort' };
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: computeCiVerdict (pure)</name>
  <read_first>
    - .planning/phases/07-delivery/07-RESEARCH.md §"CI verdict over allowlist (Q-15)" (verbatim implementation)
    - .planning/phases/07-delivery/07-CONTEXT.md Q-15
  </read_first>
  <behavior>
    - Empty requiredChecks → `'no-checks-configured'`
    - Filter check_runs to those whose name is in requiredChecks
    - If any required check is missing (filtered list shorter than allowlist) → `'pending'`
    - If any required check has `status !== 'completed'` → `'pending'`
    - If any required check has `conclusion ∈ {failure, cancelled, timed_out, action_required}` → `'fail'`
    - If every required check has `conclusion ∈ {success, neutral, skipped}` → `'pass'`
    - Otherwise (e.g., conclusion is `stale` or `startup_failure`) → `'pending'`
    - Tests cover:
      - Empty allowlist → no-checks-configured (regardless of check_runs)
      - Allowlist=['build','test']; check_runs has only 'build' → pending
      - Allowlist=['build']; check_runs=[{name:'build', status:'completed', conclusion:'success'}] → pass
      - Allowlist=['build']; check_runs=[{name:'build', status:'completed', conclusion:'failure'}] → fail
      - Allowlist=['build']; check_runs=[{name:'build', status:'in_progress', conclusion:null}] → pending
      - Allowlist=['build','test']; check_runs has both, one neutral one success → pass
      - Allowlist=['build','test']; check_runs has both, one failure → fail (failure dominates)
      - Allowlist=['build','lint']; check_runs has 'build' success + 'lint' success + 'test' failure → pass (test not in allowlist; ignored)
  </behavior>
  <files>packages/delivery-runtime/src/compute-ci-verdict.ts, packages/delivery-runtime/src/compute-ci-verdict.test.ts</files>
  <action>
    1. **RED:** Write 8 test cases per `<behavior>`. Run; fail.
    2. **GREEN:** Implement per RESEARCH §"CI verdict over allowlist" verbatim.
    3. **REFACTOR:** Cite Q-15 in JSDoc. Re-export from barrel.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run compute-ci-verdict</automated>
  </verify>
  <acceptance_criteria>
    - 8+ test cases green
    - Pure function (no I/O, no Date.now)
    - Out-of-allowlist failures don't affect verdict (the lint-not-in-allowlist test green)
  </acceptance_criteria>
  <done>computeCiVerdict pinned with 8 cases.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: pollCiStatus async generator</name>
  <read_first>
    - .planning/phases/07-delivery/07-CONTEXT.md Q-14 (10s interval, hierarchical abort) + Q-19 (cancel)
    - .planning/phases/07-delivery/07-RESEARCH.md §"Pattern 5: Two-step CI capture" + RESEARCH §"Pattern 3: Hierarchical AbortSignal"
    - packages/delivery-runtime/src/compute-ci-verdict.ts (Task 1)
  </read_first>
  <behavior>
    - Async generator yields one CiSnapshot per poll
    - Default interval: 10_000ms (Q-14); overridable via `intervalMs` for testing (e.g., 50ms in tests)
    - On each poll: `octokit.rest.checks.listForRef({ owner, repo, ref: headSha, request: { signal } })` → check_runs
    - Compute verdict via computeCiVerdict; build CiSnapshot { at, checks, verdict, terminal }
    - Yield snapshot
    - If `terminal === true` (verdict is pass/fail/no-checks-configured) → return (generator ends)
    - Otherwise sleep `intervalMs` (using `AbortSignal`-aware sleep), then loop
    - On signal abort: throw AbortError (caller catches; the calling factory-cli code translates to a 'cancelled' event)
    - Tests:
      - Single-poll terminal: nock returns successful checks → generator yields 1 snapshot, terminal=true, then ends
      - Multi-poll then terminal: nock returns pending then success → generator yields 2 snapshots, second terminal=true
      - No-checks: empty allowlist → first snapshot is terminal=true with verdict='no-checks-configured'
      - Cancel mid-poll: pre-aborted signal → first call throws AbortError before any yield
      - Cancel during sleep: signal aborts during the inter-poll sleep → AbortError
    - The signal-aware sleep uses `setTimeout(resolve, ms)` wrapped in a Promise that rejects on abort. Standard pattern:
      ```typescript
      function sleep(ms: number, signal: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
          if (signal.aborted) return reject(new Error('AbortError'));
          const t = setTimeout(resolve, ms);
          signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('AbortError')); }, { once: true });
        });
      }
      ```
  </behavior>
  <files>packages/delivery-runtime/src/poll-ci-status.ts, packages/delivery-runtime/src/poll-ci-status.test.ts</files>
  <action>
    1. **RED:** Write 5+ tests with nock fixtures + AbortController-driven cancel scenarios.
    2. **GREEN:** Implement the generator per `<behavior>`. The signal-aware sleep helper lives in the same file (small, internal).
    3. **REFACTOR:** Re-export from barrel. Add JSDoc citing Q-14, Q-16, Q-19.
    4. The `at` field uses `new Date().toISOString()` — this is the single non-pure surface in this file. Document it.
    5. Tests use `intervalMs: 50` (50ms) for fast iteration; production uses default 10_000.
    6. The generator must not leak timers if the consumer breaks early — TypeScript's async-generator semantics handle the `return()` cleanup, but ensure the sleep's setTimeout is always cleared on abort.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run poll-ci-status</automated>
  </verify>
  <acceptance_criteria>
    - 5+ test cases green
    - Default intervalMs is 10_000 (`grep -c "10_000\|10000" packages/delivery-runtime/src/poll-ci-status.ts` ≥ 1)
    - AbortError surfaces on signal cancel
    - Generator ends (return) on terminal verdict
    - `request: { signal }` passed to checks.listForRef (verifiable via grep or test)
  </acceptance_criteria>
  <done>pollCiStatus async generator green; signal-aware sleep cancels timers cleanly.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: DeliveryResult + CiEvent schema definitions + JSON-shape contract test</name>
  <read_first>
    - .planning/phases/07-delivery/07-CONTEXT.md Q-17 verbatim (DeliveryResult interface + CiEvent union)
    - .planning/phases/07-delivery/07-VALIDATION.md Required Contract Test #6 (delivery-result schema)
    - packages/delivery/src/refusals.ts (DeliveryRefusal type — embedded in DeliveryResult.refusal)
  </read_first>
  <behavior>
    - DeliveryResult interface verbatim from Q-17 + screenshots field per Q-11 (`{ status: 'deferred-v01', reason: string }`)
    - CiEvent discriminated union covering 7 kinds (pr-created, comment-posted, comment-failed, ci-snapshot, ci-terminal, ci-timeout, ci-cancelled)
    - Schema version constant `'1.0.0'` (so future bumps follow the cascade pattern)
    - JSON-shape contract test:
      - Constructs an example DeliveryResult and CiEvent of each kind
      - Round-trips via JSON.stringify → JSON.parse → assert deep equal
      - Asserts every required field is present
      - Asserts screenshots.status is the literal `'deferred-v01'` (not 'captured' — Phase 10 lands captured)
    - Tests:
      - DeliveryResult with status='delivered' (full happy path)
      - DeliveryResult with status='delivery-blocked' + refusal
      - Each of the 7 CiEvent kinds round-trips
      - Schema version is `'1.0.0'`
  </behavior>
  <files>packages/delivery-runtime/src/delivery-result-schema.ts, packages/delivery-runtime/src/delivery-result-schema.test.ts</files>
  <action>
    1. **RED:** Write tests covering both shape variants + 7 CiEvent kinds. Run; fail.
    2. **GREEN:** Define both interfaces + the union per Q-17 verbatim. Export `DELIVERY_RESULT_SCHEMA_VERSION = "1.0.0" as const`.
    3. The DeliveryResult interface is purely a type — no runtime code. The contract test exercises typed example construction; if a required field is missing, TypeScript rejects compilation.
    4. **REFACTOR:** Add JSDoc citing Q-17 + Q-11 (screenshot status field) + Q-16 (mutability post-run). Re-export from barrel.
    5. The schemaVersion constant is exported for factory-cli (Plan 07-11) to write into delivery-result.json — pinning the JSON wire format.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/delivery-runtime test --run delivery-result-schema</automated>
  </verify>
  <acceptance_criteria>
    - DeliveryResult interface includes all Q-17 fields + screenshots field
    - CiEvent union has exactly 7 variants
    - Schema version exported as `'1.0.0'`
    - 9+ test cases green (2 DeliveryResult shapes + 7 CiEvent kinds)
    - `grep -c "DELIVERY_RESULT_SCHEMA_VERSION" packages/delivery-runtime/src/delivery-result-schema.ts` ≥ 1
    - JSON round-trip preserves all fields (no lossy serialization)
  </acceptance_criteria>
  <done>DeliveryResult + CiEvent schema pinned; round-trip green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub → checkRuns | Trusted but pinned: only allowlisted check names contribute to verdict. |
| poll loop → signal | Signal-aware; abort terminates loop with no leftover timers. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-09-01 | Tampering | compute-ci-verdict.ts | mitigate | AND-over-allowlist semantics; checks outside allowlist don't influence verdict. |
| T-07-09-02 | DoS | poll-ci-status.ts | mitigate | Hierarchical signal cancels both poll + sleep; 10s interval bounds quota usage. |
| T-07-09-03 | Tampering | delivery-result-schema.ts | mitigate | Schema version pin + interface enforces shape; JSON round-trip contract test. |
</threat_model>

<verification>
- `pnpm --filter @protostar/delivery-runtime test`
- All Wave 0 contracts (no-fs, no-merge) still green
</verification>

<success_criteria>
- computeCiVerdict pinned with 8+ cases including edge cases
- pollCiStatus generator honors signal at every yield + sleep
- DeliveryResult + CiEvent schema covers Q-17 verbatim
- Schema versioning ('1.0.0') pinned for future cascade
</success_criteria>

<output>
Create `.planning/phases/07-delivery/07-09-SUMMARY.md` summarizing the verdict semantics, polling cadence, and JSON shape.
</output>
