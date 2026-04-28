---
phase: 09-operator-surface-resumability
plan: 09
type: execute
wave: 3
depends_on: [01, 03, 08]
files_modified:
  - apps/factory-cli/src/commands/deliver.ts
  - apps/factory-cli/src/commands/deliver.test.ts
  - apps/factory-cli/src/main.ts
autonomous: true
requirements: [OP-06, OP-07]
must_haves:
  truths:
    - "deliver <runId> reads runs/<id>/delivery/authorization.json + calls reAuthorizeFromPayload (from Plan 09-08); on validator pass invokes delivery-runtime.executeDelivery (Q-21)"
    - "Idempotency (auto mode retry): manifest.status='completed' AND runs/<id>/delivery/result.json shows valid prUrl AND CI capture present → emit {runId, action: 'noop', prUrl, reason: 'already-delivered'}; exit 0 (Q-20 step 2)"
    - "Re-delivery (auto mode flake retry): manifest.status='completed' but delivery/result.json missing/incomplete → re-mint via reAuthorizeFromPayload + re-invoke executeDelivery (Q-20 step 3)"
    - "Gated first delivery: manifest.status='ready-to-release' → re-mint + invoke executeDelivery; on success transitions manifest to 'completed' (Q-20 step 4)"
    - "Other manifest states (running, repairing, blocked, cancelled, cancelling, created, orphaned) → exit 4 with conflict reason (Q-20 step 5)"
    - "If reAuthorizeFromPayload returns ok=false → exit 4 with the validator's reason (e.g., 'gate-not-pass', 'runId-mismatch') (Q-21)"
    - "deliver does NOT call mintDeliveryAuthorization directly — only via reAuthorizeFromPayload (Q-21 security boundary)"
    - "stdout JSON output canonicalized via writeStdoutJson (Q-04/Q-12)"
  artifacts:
    - path: apps/factory-cli/src/commands/deliver.ts
      provides: "deliver command (Q-20/Q-21)"
      exports: ["buildDeliverCommand"]
    - path: apps/factory-cli/src/commands/deliver.test.ts
      provides: "Idempotent retry, gated first delivery, validator-reject tests"
  key_links:
    - from: apps/factory-cli/src/commands/deliver.ts
      to: packages/review/src/delivery-authorization.ts
      via: "imports reAuthorizeFromPayload"
      pattern: "reAuthorizeFromPayload"
    - from: apps/factory-cli/src/commands/deliver.ts
      to: packages/delivery-runtime/src/index.ts
      via: "imports executeDelivery (existing Phase 7 surface)"
      pattern: "executeDelivery"
    - from: apps/factory-cli/src/main.ts
      to: apps/factory-cli/src/commands/deliver.ts
      via: "addCommand(buildDeliverCommand())"
      pattern: "addCommand\\(buildDeliverCommand"
---

<objective>
Implement `protostar-factory deliver <runId>` per Q-20/Q-21. Two operator stories:
1. **Gated first delivery** — when factory-config delivery.mode='gated', the run loop pauses at ready-to-release; this command triggers the actual push.
2. **Idempotent retry** — when delivery flaked (auto mode flake), this command re-issues the push without duplicating side effects.

Both paths re-mint `DeliveryAuthorization` via `reAuthorizeFromPayload` (Plan 09-08); the persisted authorization.json is INPUT, never the brand.

Purpose: Operator surface for explicit delivery (gated mode) AND retry (any mode). Closes the security boundary by always re-validating before the network call.
Output: One command module with all four state branches + tests covering idempotency, gated, validator-reject, and conflict cases.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/09-operator-surface-resumability/09-CONTEXT.md
@.planning/phases/09-operator-surface-resumability/09-RESEARCH.md
@AGENTS.md
@apps/factory-cli/src/io.ts
@apps/factory-cli/src/exit-codes.ts
@apps/factory-cli/src/run-id.ts
@apps/factory-cli/src/main.ts
@packages/delivery/src/authorization-payload.ts
@packages/review/src/delivery-authorization.ts
@packages/delivery-runtime/src/index.ts
@packages/artifacts/src/index.ts

<interfaces>
```typescript
// apps/factory-cli/src/commands/deliver.ts
import type { Command } from "@commander-js/extra-typings";
export function buildDeliverCommand(): Command;

// stdout JSON shapes:
interface DeliverNoopOutput {
  readonly runId: string;
  readonly action: "noop";
  readonly prUrl: string;
  readonly reason: "already-delivered";
}
interface DeliverDeliveredOutput {
  readonly runId: string;
  readonly action: "delivered";
  readonly prUrl: string;
  readonly headSha: string;
  readonly baseSha: string;
}
interface DeliverConflictOutput {
  readonly runId: string;
  readonly error: "conflict" | "gate-not-pass" | "runId-mismatch" | "decision-missing" | "authorization-missing";
  readonly manifestStatus?: string;
  readonly reason: string;
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: deliver command — read authorization.json, re-mint, invoke executeDelivery, idempotency check</name>
  <read_first>
    - apps/factory-cli/src/main.ts (existing executeDelivery call site at the auto-delivery path; understand the input shape)
    - packages/delivery/src/authorization-payload.ts (Plan 09-08 — type + isAuthorizationPayload)
    - packages/review/src/delivery-authorization.ts (Plan 09-08 — reAuthorizeFromPayload signature + ReAuthorizeRuntimeDeps)
    - packages/delivery-runtime/src/index.ts (executeDelivery signature; pollCiStatus signature; existing Phase 7 surface)
    - packages/delivery-runtime/src/ (skim — confirm executeDelivery returns a DeliveryResult shape with prUrl)
    - apps/factory-cli/src/commands/run.ts (Plan 09-01 builder pattern)
    - apps/factory-cli/src/io.ts, exit-codes.ts, run-id.ts
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-20, Q-21)
    - .planning/phases/09-operator-surface-resumability/09-RESEARCH.md (Pitfall 1 option (a))
  </read_first>
  <files>apps/factory-cli/src/commands/deliver.ts, apps/factory-cli/src/commands/deliver.test.ts, apps/factory-cli/src/main.ts</files>
  <behavior>
    - deliver <validId> with manifest.status='completed' + delivery/result.json with prUrl + ci-events.jsonl present → exit 0; stdout = {runId, action: 'noop', prUrl, reason: 'already-delivered'}.
    - deliver <validId> with manifest.status='completed' BUT delivery/result.json missing → re-mint via reAuthorizeFromPayload (ok=true) → invoke executeDelivery → exit 0; stdout = {runId, action: 'delivered', prUrl, headSha, baseSha}.
    - deliver <validId> with manifest.status='ready-to-release' (gated case) → re-mint → executeDelivery → manifest transitions to 'completed' via setFactoryRunStatus (atomic write) → exit 0; stdout = {action: 'delivered', ...}.
    - deliver <validId> with manifest.status='running' OR 'repairing' OR 'blocked' OR 'cancelled' OR 'cancelling' OR 'created' OR 'orphaned' → exit 4; stdout = {runId, error: 'conflict', manifestStatus: <status>, reason: 'not-deliverable-from-' + status}.
    - deliver <validId> with delivery/authorization.json missing → exit 4; stdout = {runId, error: 'authorization-missing', reason: 'run delivery/authorization.json absent — was the run loop reach ready-to-release?'}.
    - deliver <validId> with reAuthorizeFromPayload returning {ok:false, reason:'gate-not-pass'} → exit 4; stdout = {runId, error: 'gate-not-pass', reason: 'gate-not-pass'}.
    - deliver <validId> with reAuthorizeFromPayload returning {ok:false, reason:'runId-mismatch'} → exit 4; stdout = {runId, error: 'runId-mismatch', reason: 'runId-mismatch'}.
    - deliver <invalidId> → exit 2.
    - deliver <missingId> → exit 3 (no manifest).
    - deliver does NOT import or call mintDeliveryAuthorization directly.
  </behavior>
  <action>
    1. Create `apps/factory-cli/src/commands/deliver.ts`:
       - Builder via `Command`. Positional `<runId>`. `.exitOverride()`, `.configureOutput`.
       - `executeDeliver(opts)`:
         a. parseRunId → ExitCode.UsageOrArgError on fail.
         b. assertRunIdConfined.
         c. Read manifest → ExitCode.NotFound on missing.
         d. Check terminal/non-deliverable: if manifest.status NOT IN {'completed','ready-to-release'} → writeStdoutJson({runId, error: 'conflict', manifestStatus: manifest.status, reason: `not-deliverable-from-${manifest.status}`}); return ExitCode.Conflict.
         e. Check idempotency: if manifest.status === 'completed':
            - Read `runs/<id>/delivery/result.json`. If parses with valid prUrl AND ci-events.jsonl exists → writeStdoutJson({runId, action: 'noop', prUrl, reason: 'already-delivered'}); return ExitCode.Success.
            - Else fall through to re-mint + retry.
         f. Read `runs/<id>/delivery/authorization.json`. Missing → writeStdoutJson({runId, error: 'authorization-missing', reason: ...}); return ExitCode.Conflict.
         g. Validate via isAuthorizationPayload. Fail → writeStdoutJson({runId, error: 'authorization-missing', reason: 'authorization.json schema mismatch'}); return ExitCode.Conflict.
         h. Call `reAuthorizeFromPayload(payload, { readReviewDecision: (p) => fs.readFile(path.join(runDir, p), 'utf8').then(JSON.parse) })`.
         i. result.ok === false → writeStdoutJson({runId, error: result.reason, reason: result.reason}); return ExitCode.Conflict.
         j. result.ok === true → call `executeDelivery({ authorization: result.authorization, payload, runDir, ... })` (match existing Phase 7 invocation shape from main.ts).
         k. Persist delivery result via existing Phase 7 writer (or extend if needed).
         l. If manifest.status === 'ready-to-release': transition to 'completed' via setFactoryRunStatus + atomic tmp+rename of manifest.json.
         m. writeStdoutJson({runId, action: 'delivered', prUrl: deliveryResult.prUrl, headSha: payload.headSha, baseSha: payload.baseSha}); return ExitCode.Success.
    2. Wire into main.ts: `program.addCommand(buildDeliverCommand());`.
    3. Write `apps/factory-cli/src/commands/deliver.test.ts` covering ALL branches in `<behavior>`. Inject a fake `executeDelivery` (e.g., via a deps object on buildDeliverCommand or a module-level setter for tests) — DO NOT make real network calls. Assert that mintDeliveryAuthorization is NOT called directly (grep-style or via a test spy on the export).
    4. Run `pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test` and `pnpm run verify`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^deliver'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function buildDeliverCommand' apps/factory-cli/src/commands/deliver.ts` is 1
    - `grep -c 'addCommand(buildDeliverCommand' apps/factory-cli/src/main.ts` is 1
    - `grep -c 'reAuthorizeFromPayload' apps/factory-cli/src/commands/deliver.ts` is at least 1
    - `grep -c 'executeDelivery' apps/factory-cli/src/commands/deliver.ts` is at least 1
    - `grep -c 'mintDeliveryAuthorization' apps/factory-cli/src/commands/deliver.ts` is 0  # security: never direct mint
    - `grep -cE "'already-delivered'" apps/factory-cli/src/commands/deliver.ts` is at least 1
    - `grep -cE "'authorization-missing'" apps/factory-cli/src/commands/deliver.ts` is at least 1
    - `pnpm --filter @protostar/factory-cli test` exits 0
  </acceptance_criteria>
  <done>deliver command live; all four state branches tested; security boundary intact (mint only via re-validator).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| authorization.json (validator input) | Untrusted on disk; re-validated every deliver invocation |
| reAuthorizeFromPayload → mintDeliveryAuthorization | Brand minted only inside review package |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-09-01 | Elevation of Privilege | bypass validator | mitigate | deliver MUST go through reAuthorizeFromPayload; grep gate ensures no direct mintDeliveryAuthorization import. |
| T-09-09-02 | Tampering | tampered authorization.json | mitigate | reAuthorizeFromPayload re-reads review-decision.json; mismatch → ok=false. |
| T-09-09-03 | Replay | re-deliver after manifest='completed' | mitigate | Idempotency check returns noop with existing prUrl. |
| T-09-09-04 | Repudiation | partial-delivery state (PR created, CI capture failed) | mitigate | Phase 7 already writes the durable delivered outcome before CI capture; deliver retry honors that and won't duplicate the PR. |
</threat_model>

<verification>
- `pnpm --filter @protostar/factory-cli test` clean (new deliver.test.ts + regression)
- `pnpm run verify` clean
</verification>

<success_criteria>
- deliver gated path: ready-to-release → re-mint → executeDelivery → manifest='completed'
- deliver retry path (auto mode flake): completed + missing result → re-mint → re-execute
- deliver noop: completed + valid prUrl → exit 0 noop
- All non-deliverable manifest states → exit 4
- No direct mint bypass
</success_criteria>

<output>
Create `.planning/phases/09-operator-surface-resumability/09-09-SUMMARY.md` summarizing the deliver command's four-branch dispatch, the security boundary (no direct mint), and the idempotency check.
</output>
