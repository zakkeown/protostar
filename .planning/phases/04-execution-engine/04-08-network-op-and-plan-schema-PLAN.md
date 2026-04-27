---
phase: 04-execution-engine
plan: 08
type: execute
wave: 3
depends_on: [07]
files_modified:
  - packages/authority/src/authorized-ops/network-op.ts
  - packages/authority/src/authorized-ops/network-op.test.ts
  - packages/planning/src/task-target-files.contract.ts
  - packages/planning/src/task-adapter-ref.contract.ts
  - packages/planning/src/index.ts
  - packages/planning/schema/admitted-plan.schema.json
  - packages/planning/src/admit-candidate-plans.ts
  - packages/planning/src/admit-candidate-plans.test.ts
  - packages/admission-e2e/src/adapter-ref-admission.test.ts
autonomous: true
requirements: [EXEC-04]
must_haves:
  truths:
    - "`authorizeNetworkOp` reads `resolvedEnvelope.network.allow` and refuses non-loopback URLs when allow=='loopback'"
    - "`authorizeNetworkOp` refuses non-allowlisted hosts when allow=='allowlist'"
    - "`authorizeNetworkOp` refuses ALL urls when allow=='none'"
    - "Plan task carries `targetFiles: string[]` (≥1 required) and optional `adapterRef: string`"
    - "Plan admission rejects plans whose `task.adapterRef` is outside the run-level `allowedAdapters` set with a typed violation"
    - "Default `allowedAdapters` is `['lmstudio-coder']` for v0.1"
  artifacts:
    - path: packages/authority/src/authorized-ops/network-op.ts
      provides: "Extended authorizeNetworkOp with network.allow enforcement"
    - path: packages/planning/src/task-target-files.contract.ts
      provides: "TargetFiles type pin"
    - path: packages/planning/src/task-adapter-ref.contract.ts
      provides: "AdapterRef type pin + admission helper"
  key_links:
    - from: "packages/authority/src/authorized-ops/network-op.ts"
      to: "resolvedEnvelope.network (1.3.0 field)"
      via: "allow enum check"
      pattern: 'network\.allow'
---

<objective>
Wire the 1.3.0 envelope's `network.allow` enum into `authorizeNetworkOp` so brand minting refuses non-loopback URLs at runtime. Add `task.targetFiles` and `task.adapterRef` to the plan schema and enforce `allowedAdapters` at plan admission. Closes EXEC-04 (provider-abstracted plan input + admission).

Per advisor: half of `coderAdapterReadyAdmission` lives here (the network-op enforcement); the other half (gate orchestration / refusal pipeline) lives in Plan 10.

Purpose: Brand-mint at the kernel honors v0.1 loopback-only posture; plans carry the adapter selection metadata.
Output: Extended network-op + plan-schema additions + adapter-ref admission test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-execution-engine/04-CONTEXT.md
@.planning/phases/04-execution-engine/04-RESEARCH.md
@.planning/phases/04-execution-engine/04-PATTERNS.md
@packages/authority/src/authorized-ops/network-op.ts
@packages/planning/src/index.ts

<interfaces>
network-op.ts extension shape:
- Read `input.resolvedEnvelope.network.allow`.
- `'none'` → refuse with explicit error string.
- `'loopback'` → host must be one of `localhost`, `127.0.0.1`, `::1`.
- `'allowlist'` → host must be in `input.resolvedEnvelope.network.allowedHosts`.
- Existing `hasNetworkGrant` (toolPermissions layer) STILL runs after — both layers must pass.
- The single `mintAuthorizedNetworkOp` site at line 19 is the only mint.

task-target-files.contract.ts:
- `export type TargetFiles = readonly string[];` (length ≥ 1)
- `export function assertTargetFiles(files: readonly string[]): asserts files is TargetFiles;` — throws on length 0 or any whitespace-only entry.

task-adapter-ref.contract.ts:
- `export type AdapterRef = string;` (matches `/^[a-z][a-z0-9-]*$/`)
- `export function assertAdapterRef(ref: unknown): asserts ref is AdapterRef;`
- `export type AdapterRefAdmissionResult = { ok: true } | { ok: false; violation: { kind: "adapter-ref-not-allowed"; taskId: string; adapterRef: string; allowedAdapters: readonly string[] } };`
- `export function admitTaskAdapterRef(input: { taskId: string; adapterRef: string | undefined; allowedAdapters: readonly string[] }): AdapterRefAdmissionResult;`
  - undefined adapterRef → ok (uses run default)
  - adapterRef ∉ allowedAdapters → violation

Plan schema (`packages/planning/schema/admitted-plan.schema.json`):
- task: add `targetFiles: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 }` — REQUIRED.
- task: add `adapterRef: { type: "string", pattern: "^[a-z][a-z0-9-]*$" }` — OPTIONAL.

Run-level config: `allowedAdapters: readonly string[]` defaults to `["lmstudio-coder"]`. Lives in factory-cli options for v0.1 (Plan 10 wires); admission helper reads it from a passed argument.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend authorizeNetworkOp for network.allow enum</name>
  <files>packages/authority/src/authorized-ops/network-op.ts, packages/authority/src/authorized-ops/network-op.test.ts</files>
  <read_first>
    - packages/authority/src/authorized-ops/network-op.ts (full file)
    - packages/intent/src/capability-envelope.ts (Plan 07 — for the network field shape)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-18
    - .planning/phases/04-execution-engine/04-PATTERNS.md §"network-op.ts — extend"
  </read_first>
  <behavior>
    - Test 1 (none): envelope `network.allow:"none"` + url `http://localhost:1234/v1/models` → ok=false with error matching /refuses all/.
    - Test 2 (loopback ok): envelope `network.allow:"loopback"` + url `http://127.0.0.1:1234/v1/models` → ok, branded op returned.
    - Test 3 (loopback + localhost ok): host `localhost` → ok.
    - Test 4 (loopback + ::1 ok): IPv6 loopback host `::1` → ok.
    - Test 5 (loopback refuses cloud): url `https://api.openai.com/v1/models` under loopback → refused.
    - Test 6 (allowlist ok): envelope `allow:"allowlist", allowedHosts:["api.github.com"]` + url `https://api.github.com/repos/...` → ok.
    - Test 7 (allowlist refuses unlisted): same envelope + url `https://evil.example` → refused.
    - Test 8 (toolPermissions still required): envelope with valid `network.allow:"loopback"` but `toolPermissions.network:"deny"` → refused (existing layer still triggers).
    - Test 9 (missing network.allow): envelope without `network.allow` → refused with explicit error.
    - Test 10 (mint discipline): On ok, `authorized` is frozen; only the existing mint helper produced it (grep for second mint site returns nothing new).
  </behavior>
  <action>
    1. Edit `packages/authority/src/authorized-ops/network-op.ts` to insert the `network.allow` enforcement BETWEEN the URL parse and the existing `hasNetworkGrant` check. Logic per `<interfaces>` above.
    2. Update `network-op.test.ts` (create if absent) with the 10 cases. Build envelopes inline as `{ ... } as CapabilityEnvelope` with the 1.3.0 shape from Plan 07.
    3. Do NOT add a second mint site. The existing `mintAuthorizedNetworkOp` (line 19) remains the only mint.
    4. Verify no type errors against the 1.3.0 envelope (Plan 07 must have landed first — `depends_on: [07]`).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/authority test 2>&1 | tail -25 ; grep -c 'network\.allow' packages/authority/src/authorized-ops/network-op.ts ; grep -c 'function mintAuthorizedNetworkOp' packages/authority/src/authorized-ops/network-op.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/authority test` exits 0
    - `grep -c 'network\.allow' packages/authority/src/authorized-ops/network-op.ts` ≥ 3
    - `grep -c 'function mintAuthorizedNetworkOp' packages/authority/src/authorized-ops/network-op.ts` returns exactly 1
    - All 10 tests pass; the three loopback hosts (localhost, 127.0.0.1, ::1) are explicitly listed
  </acceptance_criteria>
  <done>EXEC-04 / Q-18 brand-mint enforcement live; LM Studio loopback URL allowed, cloud URLs refused.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Plan-schema task.targetFiles + task.adapterRef + admission helper</name>
  <files>packages/planning/src/task-target-files.contract.ts, packages/planning/src/task-adapter-ref.contract.ts, packages/planning/src/index.ts, packages/planning/schema/admitted-plan.schema.json, packages/planning/src/admit-candidate-plans.ts, packages/planning/src/admit-candidate-plans.test.ts, packages/admission-e2e/src/adapter-ref-admission.test.ts</files>
  <read_first>
    - packages/planning/schema/admitted-plan.schema.json (current task shape)
    - packages/planning/src/admit-candidate-plans.ts (admission entry point)
    - packages/planning/src/index.ts (existing barrel + sibling contract files)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-08, §Q-11
  </read_first>
  <behavior>
    - Test 1: Plan with task missing `targetFiles` → admission rejects with violation kind `target-files-missing`.
    - Test 2: Plan with `targetFiles: []` → rejects (`target-files-empty`).
    - Test 3: Plan with `targetFiles: ["src/Button.tsx"]` → admits.
    - Test 4: Plan with `task.adapterRef: "lmstudio-coder"` and `allowedAdapters: ["lmstudio-coder"]` → admits.
    - Test 5: Plan with `task.adapterRef: "evil-adapter"` and `allowedAdapters: ["lmstudio-coder"]` → admission rejects with violation kind `adapter-ref-not-allowed` carrying `taskId`, `adapterRef`, `allowedAdapters`.
    - Test 6: Plan with no `adapterRef` (uses run default) → admits regardless of allowedAdapters.
    - Test 7: `adapterRef: "Has-Caps"` → rejects (regex requires lowercase start + lowercase/digit/hyphen).
    - Test 8 (admission-e2e/adapter-ref-admission.test.ts): End-to-end through admission pipeline with a fixture plan; assert refusal artifact written with violation kind.
  </behavior>
  <action>
    1. Create `packages/planning/src/task-target-files.contract.ts` and `task-adapter-ref.contract.ts` per `<interfaces>`. Mirror naming from existing `task-required-capabilities.contract.ts` in the same directory.
    2. Update `packages/planning/schema/admitted-plan.schema.json` to add `targetFiles` (required) and `adapterRef` (optional, pattern) on the task object. Bump the schema's own `schemaVersion` if it carries one (search for it; use a `1.x.0`-style minor bump).
    3. Update `packages/planning/src/admit-candidate-plans.ts` to:
       - Validate `targetFiles` presence + non-empty per task (use `assertTargetFiles` to surface violations).
       - Accept an optional `allowedAdapters: readonly string[]` argument; pass to `admitTaskAdapterRef` for each task with an `adapterRef`.
       - Append violations to the existing violation aggregator.
       - Default `allowedAdapters` to `["lmstudio-coder"]` if undefined.
    4. Re-export both contract files from `packages/planning/src/index.ts`.
    5. Tests: `admit-candidate-plans.test.ts` (cases 1-7); `admission-e2e/src/adapter-ref-admission.test.ts` (case 8 — full admission pipeline with refusal artifact assertion using existing admission-e2e helpers).
    6. Update any existing planning fixtures to include `targetFiles` (search for fixtures with `tasks: [...]` and add `targetFiles: ["..."]` per task).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/planning test 2>&1 | tail -25 ; pnpm --filter @protostar/admission-e2e test 2>&1 | tail -15 ; grep -c '"targetFiles"' packages/planning/schema/admitted-plan.schema.json ; grep -c '"adapterRef"' packages/planning/schema/admitted-plan.schema.json</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/planning test` exits 0
    - `pnpm --filter @protostar/admission-e2e test` exits 0
    - Schema contains both `"targetFiles"` and `"adapterRef"` (grep ≥ 1 each)
    - All 8 tests pass
    - `assertTargetFiles` and `admitTaskAdapterRef` exported from `@protostar/planning`
  </acceptance_criteria>
  <done>Plan-admission gate enforces v0.1 allowedAdapters; targetFiles is now a required plan-task field.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| capability envelope ↔ runtime brand mint | network.allow must be enforced at mint time, not just at admission time |
| candidate plan ↔ admitted plan | adapterRef metadata could let an unauthorized adapter run if not gated |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-04-22 | Elevation of Privilege | Plan claims `adapterRef:"future-cloud-adapter"` to bypass loopback | mitigate | Plan admission rejects unknown adapterRefs; default allowedAdapters is `['lmstudio-coder']` only |
| T-04-23 | Information Disclosure | Cloud URL accepted under loopback envelope | mitigate | `authorizeNetworkOp` enforces hostname against the three loopback literals; Test 5 pins this |
| T-04-24 | Tampering | targetFiles array empty → adapter has no anchor file → potential prompt injection via aux-reads | mitigate | Schema `minItems:1` + admission `target-files-empty` violation; Test 2 pins |
</threat_model>

<verification>
- `pnpm --filter @protostar/authority test` green
- `pnpm --filter @protostar/planning test` green
- `pnpm --filter @protostar/admission-e2e test` green
- `pnpm run verify` (full suite) green
</verification>

<success_criteria>
- network.allow enum enforced at mint time (10 cases pass)
- targetFiles required on every plan task
- adapterRef optional but admission-gated
- Default allowedAdapters = ['lmstudio-coder']
</success_criteria>

<output>
Create `.planning/phases/04-execution-engine/04-08-SUMMARY.md`: extension diff for network-op, plan-schema additions, admission helper signatures, allowedAdapters default location.
</output>
