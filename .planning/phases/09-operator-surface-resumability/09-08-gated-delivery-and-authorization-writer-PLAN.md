---
phase: 09-operator-surface-resumability
plan: 08
type: execute
wave: 3
depends_on: [01, 03]
files_modified:
  - packages/delivery/src/authorization-payload.ts
  - packages/delivery/src/authorization-payload.test.ts
  - packages/delivery/src/index.ts
  - packages/review/src/delivery-authorization.ts
  - packages/review/src/delivery-authorization.test.ts
  - packages/review/src/index.ts
  - packages/lmstudio-adapter/src/factory-config.schema.json
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/commands/run.ts
  - apps/factory-cli/src/load-factory-config.ts
autonomous: true
requirements: [OP-06, OP-07]
must_haves:
  truths:
    - "factory-config.json schema has delivery.mode: 'auto' | 'gated' (default 'auto') (Q-20)"
    - "run command accepts --delivery-mode <auto|gated> CLI override (Q-20, Phase 6 Q-04 precedence: CLI > config > default)"
    - "When run loop reaches 'ready-to-release' AND mode='gated': pause + write runs/<id>/delivery/authorization.json + emit stderr hint 'gated: run `protostar-factory deliver ${runId}` to push.' + exit 0 (Q-20 step gated)"
    - "When run loop reaches 'ready-to-release' AND mode='auto': preserve existing Phase 7 behavior (auto-deliver immediately) AND ALSO write runs/<id>/delivery/authorization.json BEFORE delivery so retry idempotency in 09-09 can re-mint (Q-20/Q-21)"
    - "delivery/authorization.json contains the validator INPUTS (runId, decisionPath, target, branchName, title, body, head/baseSHA refs) — NEVER the brand itself (Q-21)"
    - "AuthorizationPayload schema is a pure type in packages/delivery/src/authorization-payload.ts (Q-21 — payload schema lives in delivery; mint validator stays in review)"
    - "packages/review/src/delivery-authorization.ts exports a NEW reAuthorizeFromPayload(payload, runtimeRefs) entrypoint that runs the validator path (re-checks ReviewGate state from runs/<id>/review-decision.json, mints DeliveryAuthorization brand) — internal-only marker is loosened with a documented JSDoc explaining 09-09 is the legitimate caller (Pitfall 1 option (a) — adopt heavyweight validator path per RESEARCH recommendation)"
    - "Atomic tmp+rename for authorization.json write"
  artifacts:
    - path: packages/delivery/src/authorization-payload.ts
      provides: "AuthorizationPayload type schema (Q-21)"
      exports: ["type AuthorizationPayload", "isAuthorizationPayload"]
    - path: packages/review/src/delivery-authorization.ts
      contains: "reAuthorizeFromPayload"
    - path: packages/lmstudio-adapter/src/factory-config.schema.json
      contains: '"mode"'
  key_links:
    - from: apps/factory-cli/src/main.ts
      to: packages/delivery/src/authorization-payload.ts
      via: "Imports AuthorizationPayload to construct + serialize at ready-to-release"
      pattern: "AuthorizationPayload"
    - from: apps/factory-cli/src/main.ts
      to: packages/review/src/delivery-authorization.ts
      via: "(via existing wiring) mint at ready-to-release retains Phase 5 path; new payload write is the additional artifact"
      pattern: "mintDeliveryAuthorization"
---

<objective>
Land the gated-delivery write site and the persisted authorization payload (Q-20/Q-21). When the run loop reaches `'ready-to-release'`, factory-cli atomically writes `runs/<id>/delivery/authorization.json` containing validator INPUTS (not the brand). In gated mode it pauses; in auto mode it proceeds to existing Phase 7 delivery. This plan ALSO loosens the INTERNAL marker on `mintDeliveryAuthorization` and adds the `reAuthorizeFromPayload` entrypoint that Plan 09-09's deliver command will call.

Purpose: Per RESEARCH Pitfall 1, adopt option (a) — explicit validator entrypoint in `packages/review` rather than re-stamp shortcuts. Closes the security boundary: persisted file is INPUT, brand is always re-minted via the validator that re-checks ReviewGate state.

Output: New payload type in delivery, new validator entrypoint in review, schema bump for `delivery.mode`, CLI override `--delivery-mode`, run-loop write site for authorization.json, and gated-mode pause behavior. NO new command in this plan — that's Plan 09-09.
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
@packages/delivery/src/index.ts
@packages/review/src/delivery-authorization.ts
@packages/review/src/index.ts
@packages/artifacts/src/index.ts
@packages/lmstudio-adapter/src/factory-config.schema.json
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/commands/run.ts
@apps/factory-cli/src/load-factory-config.ts

<interfaces>
```typescript
// packages/delivery/src/authorization-payload.ts (NEW)
// Pure types — no I/O, no network. Captures the validator INPUTS that factory-cli persists
// at 'ready-to-release' so deliver (Plan 09-09) can re-mint the DeliveryAuthorization brand.
export interface AuthorizationPayload {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly decisionPath: string;        // run-relative path to review-decision.json
  readonly target: {
    readonly owner: string;
    readonly repo: string;
    readonly baseBranch: string;
  };
  readonly branchName: string;          // validated `^[a-zA-Z0-9._/-]+$`
  readonly title: string;
  readonly body: string;
  readonly headSha: string;
  readonly baseSha: string;
  readonly mintedAt: string;            // ISO-8601 timestamp at run-loop mint time
}
export function isAuthorizationPayload(v: unknown): v is AuthorizationPayload;

// packages/review/src/delivery-authorization.ts (extended)
import type { DeliveryAuthorization } from "./delivery-authorization.js"; // existing brand
import type { AuthorizationPayload } from "@protostar/delivery/authorization-payload";

/**
 * Re-mint a DeliveryAuthorization brand from a persisted AuthorizationPayload.
 * Re-runs the gate-pass check by reading the on-disk review-decision.json at payload.decisionPath
 * and validating that the gate is still pass+pass (mechanical + model). If the on-disk decision
 * has changed since mint time (e.g., review-decision.json was overwritten), refuses.
 *
 * This is the heavyweight validator entrypoint per Phase 9 Q-21. The original
 * mintDeliveryAuthorization remains internal — only this entrypoint is callable from Plan 09-09.
 */
export interface ReAuthorizeRuntimeDeps {
  readonly readReviewDecision: (decisionPath: string) => Promise<unknown>; // injected fs reader
}
export function reAuthorizeFromPayload(
  payload: AuthorizationPayload,
  deps: ReAuthorizeRuntimeDeps
): Promise<
  | { readonly ok: true; readonly authorization: DeliveryAuthorization }
  | { readonly ok: false; readonly reason: string }
>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: AuthorizationPayload type + reAuthorizeFromPayload validator entrypoint</name>
  <read_first>
    - packages/review/src/delivery-authorization.ts (FULL FILE — current mintDeliveryAuthorization signature, INTERNAL marker, brand definition)
    - packages/review/src/index.ts (existing barrel re-exports)
    - packages/delivery/src/index.ts (existing exports — confirm where to add the new subpath)
    - packages/delivery/package.json (existing exports field; add ./authorization-payload subpath)
    - packages/review/package.json (deps; add @protostar/delivery if not present)
    - packages/review/tsconfig.json (project references)
    - packages/artifacts/src/index.ts (FactoryRunManifest schema; review-decision shape if present)
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-21 — payload INPUT not brand)
    - .planning/phases/09-operator-surface-resumability/09-RESEARCH.md (Pitfall 1 — option (a) chosen)
  </read_first>
  <files>packages/delivery/src/authorization-payload.ts, packages/delivery/src/authorization-payload.test.ts, packages/delivery/src/index.ts, packages/delivery/package.json, packages/review/src/delivery-authorization.ts, packages/review/src/delivery-authorization.test.ts, packages/review/src/index.ts, packages/review/package.json, packages/review/tsconfig.json</files>
  <behavior>
    - authorization-payload.test: isAuthorizationPayload accepts a valid fixture; rejects missing runId, missing target, malformed branchName, missing schemaVersion.
    - delivery-authorization.test: reAuthorizeFromPayload({...valid payload...}, {readReviewDecision returning a pass/pass decision matching payload.runId}) → ok=true with brand.
    - delivery-authorization.test: reAuthorizeFromPayload with payload.runId mismatched against decision.runId → ok=false reason='runId-mismatch'.
    - delivery-authorization.test: reAuthorizeFromPayload with decision.mechanicalVerdict='fail' OR decision.modelVerdict='block' → ok=false reason='gate-not-pass'.
    - delivery-authorization.test: reAuthorizeFromPayload with readReviewDecision throwing ENOENT → ok=false reason='decision-missing'.
    - delivery-authorization.test: existing mintDeliveryAuthorization tests still pass (no behavior regression).
  </behavior>
  <action>
    1. Create `packages/delivery/src/authorization-payload.ts`:
       - Pure type per the verbatim shape in `<interfaces>`.
       - `export function isAuthorizationPayload(v: unknown): v is AuthorizationPayload` — narrow type guard checking each required field including `schemaVersion === "1.0.0"`, branchName regex `^[a-zA-Z0-9._/-]+$`, target object shape.
    2. Update `packages/delivery/package.json` exports:
       - Add: `"./authorization-payload": { "types": "./dist/authorization-payload.d.ts", "import": "./dist/authorization-payload.js" }`.
    3. Update `packages/delivery/src/index.ts` to re-export the type + guard from the barrel for back-compat.
    4. Edit `packages/review/src/delivery-authorization.ts`:
       - Loosen the `// INTERNAL: only call from runReviewRepairLoop` comment to: `// Phase 5 mint path — runReviewRepairLoop is the primary caller. Phase 9 Plan 09-08 added reAuthorizeFromPayload below as the legitimate re-mint entrypoint for deliver.`
       - Add `reAuthorizeFromPayload(payload, deps)` per the verbatim shape in `<interfaces>`. Implementation:
         a. `decisionRaw = await deps.readReviewDecision(payload.decisionPath)`. ENOENT/throw → `{ ok: false, reason: 'decision-missing' }`.
         b. Parse decisionRaw into the existing review-decision artifact shape (use the same parser the run loop uses — search for it in packages/review/src/).
         c. If `decision.runId !== payload.runId` → `{ ok: false, reason: 'runId-mismatch' }`.
         d. If `decision.mechanicalVerdict !== 'pass' || decision.modelVerdict !== 'pass'` → `{ ok: false, reason: 'gate-not-pass' }`.
         e. Otherwise call the existing `mintDeliveryAuthorization({runId: payload.runId, decisionPath: payload.decisionPath})` to obtain the brand.
         f. Return `{ ok: true, authorization }`.
    5. Update `packages/review/package.json` deps to include `@protostar/delivery` (workspace:*) if not present; update `packages/review/tsconfig.json` references.
    6. Update `packages/review/src/index.ts` to barrel `reAuthorizeFromPayload`.
    7. Write tests covering the cases in `<behavior>`. Use a fake `readReviewDecision` injected per test.
    8. Run `pnpm install`, `pnpm --filter @protostar/delivery build && pnpm --filter @protostar/delivery test`, `pnpm --filter @protostar/review build && pnpm --filter @protostar/review test`.
  </action>
  <verify>
    <automated>pnpm install && pnpm --filter @protostar/delivery build && pnpm --filter @protostar/delivery test && pnpm --filter @protostar/review build && pnpm --filter @protostar/review test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export interface AuthorizationPayload' packages/delivery/src/authorization-payload.ts` is 1
    - `grep -c 'isAuthorizationPayload' packages/delivery/src/authorization-payload.ts` is at least 1
    - `grep -c '"./authorization-payload"' packages/delivery/package.json` is 1
    - `grep -c 'reAuthorizeFromPayload' packages/review/src/delivery-authorization.ts` is at least 1
    - `grep -cE "'gate-not-pass'" packages/review/src/delivery-authorization.ts` is at least 1
    - `grep -cE "'runId-mismatch'" packages/review/src/delivery-authorization.ts` is at least 1
    - `pnpm --filter @protostar/delivery test` exits 0
    - `pnpm --filter @protostar/review test` exits 0
  </acceptance_criteria>
  <done>Payload type + validator entrypoint live; tests cover all reject paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: factory-config.json delivery.mode + --delivery-mode CLI override + ready-to-release write site + gated pause</name>
  <read_first>
    - packages/lmstudio-adapter/src/factory-config.schema.json (existing schema; add delivery.mode)
    - apps/factory-cli/src/load-factory-config.ts (FactoryConfig type; add delivery resolver)
    - apps/factory-cli/src/commands/run.ts (Plan 09-01 — add --delivery-mode flag)
    - apps/factory-cli/src/main.ts (find the existing 'ready-to-release' transition site at ~line 1528 statusForReviewVerdict; find the existing auto-deliver call sequence)
    - packages/delivery/src/authorization-payload.ts (Task 1 — schema + guard)
    - apps/factory-cli/src/snapshot-writer.ts (atomic tmp+rename pattern; reuse if exposes a generic helper)
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-20, Q-21)
  </read_first>
  <files>packages/lmstudio-adapter/src/factory-config.schema.json, apps/factory-cli/src/load-factory-config.ts, apps/factory-cli/src/commands/run.ts, apps/factory-cli/src/main.ts</files>
  <behavior>
    - factory-config.json with `{ "delivery": { "mode": "gated" } }` → loadFactoryConfig parses; FactoryConfig.delivery.mode === 'gated'.
    - factory-config.json without delivery key → resolved mode === 'auto' (default).
    - factory-config.json with `{ "delivery": { "mode": "BAD" } }` → schema rejects.
    - run --delivery-mode gated overrides config 'auto' → effective mode 'gated' (CLI > config precedence).
    - run --delivery-mode auto with config 'gated' → effective mode 'auto'.
    - run --delivery-mode bogus → schema reject; exit 2.
    - When effective mode='gated' AND run reaches ready-to-release: writes runs/<id>/delivery/authorization.json (atomic); writes stderr hint; exits 0; does NOT invoke delivery-runtime.
    - When effective mode='auto' AND run reaches ready-to-release: writes authorization.json (atomic) FIRST; then proceeds to existing Phase 7 delivery (no behavior regression on auto path).
    - The authorization.json content matches AuthorizationPayload shape and passes isAuthorizationPayload.
    - End-to-end test: spawn factory-cli with --delivery-mode gated against a fixture run; assert authorization.json exists, parses as AuthorizationPayload, manifest.status remains 'ready-to-release', exit code 0.
  </behavior>
  <action>
    1. Update `packages/lmstudio-adapter/src/factory-config.schema.json` root properties to include:
       ```json
       "delivery": {
         "type": "object",
         "additionalProperties": false,
         "properties": {
           "mode": {
             "type": "string",
             "enum": ["auto", "gated"],
             "default": "auto",
             "description": "Phase 9 Q-20: 'auto' (default, preserves Phase 7) auto-delivers at ready-to-release. 'gated' pauses after writing delivery/authorization.json so an operator must invoke `protostar-factory deliver`."
           }
         }
       }
       ```
       Maintain `additionalProperties: false` at root.
    2. Update `apps/factory-cli/src/load-factory-config.ts`:
       - Add `delivery?: { mode?: 'auto' | 'gated' }` to `FactoryConfig`.
       - Add `resolveDeliveryMode(config, cliOverride): 'auto' | 'gated'` returning `cliOverride ?? config.delivery?.mode ?? 'auto'` (CLI > config > default per Phase 6 Q-04 precedence).
    3. Update `apps/factory-cli/src/commands/run.ts`:
       - Add `.option('--delivery-mode <mode>', "auto | gated (Phase 9 Q-20)")` with a custom parser that rejects values outside `['auto','gated']` (commander throws → maps to ExitCode.UsageOrArgError).
       - Pass the resolved mode through to `runFactory` via the existing options shape.
    4. Update `apps/factory-cli/src/main.ts`:
       - At the existing 'ready-to-release' transition (~line 1528 statusForReviewVerdict, but the actual write happens elsewhere — search for `setFactoryRunStatus.*ready-to-release` and the call site that auto-invokes delivery):
         a. BEFORE invoking delivery, build the AuthorizationPayload from in-memory state (runId, decisionPath = relative path to runs/<id>/review-decision.json, target from confirmed intent's capabilityEnvelope.delivery.target, branchName from existing branch-naming logic, title/body from existing PR body builder, headSha/baseSha from current workspace state, mintedAt = new Date().toISOString()).
         b. Atomic write `runs/<id>/delivery/authorization.json` (tmp+rename; ensure runs/<id>/delivery/ dir exists via mkdir recursive).
         c. If `effectiveMode === 'gated'`:
            - writeStderr(`gated: run \`protostar-factory deliver ${runId}\` to push.`)
            - return ExitCode.Success WITHOUT invoking delivery-runtime. Manifest stays at 'ready-to-release'.
         d. Else (`effectiveMode === 'auto'`):
            - Continue to the existing Phase 7 delivery path. The authorization.json is now ALSO available for retry idempotency (Plan 09-09 reads it).
       - Use the existing snapshot-writer or pile-persistence atomic tmp+rename pattern (apps/factory-cli/src/snapshot-writer.ts if available).
    5. Add an integration test in apps/factory-cli/src/main.test.ts (or a focused new test file `apps/factory-cli/src/commands/run-gated-delivery.test.ts`) covering:
       - Gated mode: run reaches ready-to-release; authorization.json exists, parses, matches isAuthorizationPayload; manifest.status='ready-to-release'; exit 0.
       - Auto mode: authorization.json exists BEFORE delivery is invoked (assert via stub injection point in delivery-runtime.executeDelivery).
       Stub the delivery-runtime to avoid real network in tests.
    6. Run `pnpm --filter @protostar/lmstudio-adapter build && pnpm --filter @protostar/lmstudio-adapter test`, `pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test`, and `pnpm run verify`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/lmstudio-adapter test && pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"mode"' packages/lmstudio-adapter/src/factory-config.schema.json` is at least 1
    - `grep -c '"gated"' packages/lmstudio-adapter/src/factory-config.schema.json` is at least 1
    - `grep -c 'resolveDeliveryMode' apps/factory-cli/src/load-factory-config.ts` is at least 1
    - `grep -c 'delivery-mode' apps/factory-cli/src/commands/run.ts` is at least 1
    - `grep -cE 'authorization\\.json' apps/factory-cli/src/main.ts` is at least 1
    - `grep -cE "'gated'" apps/factory-cli/src/main.ts` is at least 1
    - `grep -cE 'AuthorizationPayload' apps/factory-cli/src/main.ts` is at least 1
    - `pnpm --filter @protostar/factory-cli test` exits 0
  </acceptance_criteria>
  <done>Schema + CLI override + write site + gated pause all live; auto-mode behavior preserved; tests cover both branches.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Persisted authorization.json | Validator INPUT, not the brand; tampering forces re-validation to fail |
| CLI > config > default precedence for delivery.mode | Operator override must be honored |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-08-01 | Elevation of Privilege | tampered authorization.json | mitigate | reAuthorizeFromPayload re-reads review-decision.json and re-checks gate state; brand never trusted from disk (Q-21). |
| T-09-08-02 | Tampering | torn authorization.json write | mitigate | Atomic tmp+rename. |
| T-09-08-03 | Tampering | mode override bypassing operator config | accept | CLI > config is documented precedence (Phase 6 Q-04 reused); operator owns the CLI. |
</threat_model>

<verification>
- `pnpm --filter @protostar/delivery test` clean
- `pnpm --filter @protostar/review test` clean
- `pnpm --filter @protostar/lmstudio-adapter test` clean
- `pnpm --filter @protostar/factory-cli test` clean
- `pnpm run verify` clean
</verification>

<success_criteria>
- AuthorizationPayload type + guard live in @protostar/delivery
- reAuthorizeFromPayload entrypoint live in @protostar/review
- delivery.mode schema + CLI override land
- run loop writes authorization.json atomically at ready-to-release in BOTH modes
- gated mode pauses; auto mode preserves Phase 7 behavior
</success_criteria>

<output>
Create `.planning/phases/09-operator-surface-resumability/09-08-SUMMARY.md` summarizing the payload schema, the heavyweight validator entrypoint (Pitfall 1 option (a)), the schema bump, the CLI override, and the gated-mode pause.
</output>
