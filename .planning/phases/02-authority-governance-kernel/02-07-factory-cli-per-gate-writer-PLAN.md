---
phase: 02-authority-governance-kernel
plan: 07
type: execute
wave: 3
depends_on: [04, 05, 06]
files_modified:
  - apps/factory-cli/src/admission-decisions-index.ts
  - apps/factory-cli/src/write-admission-decision.ts
  - apps/factory-cli/src/load-repo-policy.ts
  - apps/factory-cli/src/precedence-tier-loader.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/admission-decisions-index.test.ts
  - apps/factory-cli/src/write-admission-decision.test.ts
  - apps/factory-cli/src/load-repo-policy.test.ts
  - apps/factory-cli/package.json
autonomous: true
requirements:
  - GOV-01
  - GOV-05
must_haves:
  truths:
    - "factory-cli writes a per-gate `runs/{id}/{gate}-admission-decision.json` for every one of the 5 gates on every run that exercises that gate"
    - "factory-cli appends an entry to `runs/{id}/admission-decisions.jsonl` for every gate decision (Q-14 — symmetric to Phase 1's refusals.jsonl)"
    - "factory-cli writes `runs/{id}/precedence-decision.json` IFF `precedenceResolution.status !== \"no-conflict\"` (Q-04)"
    - "factory-cli writes `runs/{id}/policy-snapshot.json` ONCE per run, hashed for inclusion in signed-intent payload"
    - "When `.protostar/repo-policy.json` is absent, `loadRepoPolicy()` supplies `DENY_ALL_REPO_POLICY` (A3 lock)"
    - "Existing `runs/{id}/admission-decision.json` write path renamed to `intent-admission-decision.json`; legacy filename NOT also written for new runs"
    - "Authority boundary preserved: every fs operation is in `apps/factory-cli`; `@protostar/authority` is invoked for pure logic only"
  artifacts:
    - path: apps/factory-cli/src/admission-decisions-index.ts
      provides: "Pure helper to format admission-decisions.jsonl line + appendAdmissionDecisionIndexEntry (mirrors apps/factory-cli/src/refusals-index.ts)"
      exports: ["formatAdmissionDecisionIndexLine", "appendAdmissionDecisionIndexEntry", "AdmissionDecisionIndexEntry"]
    - path: apps/factory-cli/src/write-admission-decision.ts
      provides: "writeAdmissionDecision({runDir, gate, decision}): writes per-gate file + appends index"
      exports: ["writeAdmissionDecision", "writePrecedenceDecision", "writePolicySnapshot"]
    - path: apps/factory-cli/src/load-repo-policy.ts
      provides: "loadRepoPolicy(workspaceRoot): RepoPolicy — reads `.protostar/repo-policy.json` or returns DENY_ALL_REPO_POLICY (A3)"
      exports: ["loadRepoPolicy"]
    - path: apps/factory-cli/src/precedence-tier-loader.ts
      provides: "buildTierConstraints({intent, policy, repoPolicy, operatorSettings}): TierConstraint[] — assembles the 4 tiers for intersectEnvelopes"
      exports: ["buildTierConstraints"]
  key_links:
    - from: apps/factory-cli/src/main.ts
      to: apps/factory-cli/src/write-admission-decision.ts
      via: "every gate's outcome path calls writeAdmissionDecision"
      pattern: "writeAdmissionDecision"
    - from: apps/factory-cli/src/main.ts
      to: "@protostar/authority"
      via: "intersectEnvelopes + signAdmissionDecision + buildPolicySnapshot calls"
      pattern: "intersectEnvelopes\\|signAdmissionDecision\\|buildPolicySnapshot"
    - from: apps/factory-cli/src/load-repo-policy.ts
      to: "@protostar/authority (parseRepoPolicy + DENY_ALL_REPO_POLICY)"
      via: "fs.readFile + parseRepoPolicy; on ENOENT returns DENY_ALL_REPO_POLICY"
      pattern: "DENY_ALL_REPO_POLICY"
---

<objective>
Wave 3 / heavy plan — wires the kernel into factory-cli. This is where Phase 2's contracts become observable behaviour. Specifically:

1. **Per-gate triple-write** (Q-14, mirrors Phase 1's `writeRefusalArtifacts` pattern at `apps/factory-cli/src/main.ts:605-632`): for every gate (intent, planning, capability, repo-scope, workspace-trust), write `{gate}-admission-decision.json` + append `admission-decisions.jsonl` + write `precedence-decision.json` (when status ≠ no-conflict).
2. **Repo-policy load with A3 default-DENY** (planning_context A3 lock): on ENOENT, supply `DENY_ALL_REPO_POLICY`.
3. **Precedence kernel invocation**: assemble 4 tiers, call `intersectEnvelopes`, propagate the resolved envelope to subsequent gates.
4. **Policy snapshot + signed intent emission**: factory-cli builds the policy snapshot once at intent admission, hashes it, signs the ConfirmedIntent, persists `policy-snapshot.json`.
5. **Rename existing `admission-decision.json` write** to `intent-admission-decision.json` in the new write path; new runs do NOT also emit the legacy name (Plan 09 reader handles backward-compat for the 208 historical run dirs).

This plan does NOT yet implement the two-key launch (`--trust trusted` flag) or the `escalate` verdict marker artifact — Plan 08 owns those. This plan focuses on the per-gate writer + precedence wiring + intent signing.

Authority boundary: every `node:fs/promises` import in this plan lives under `apps/factory-cli/`. `@protostar/authority` invocations are pure-function calls only.

Output: a runFactory pass against the cosmetic-tweak fixture produces the expected new artifact set; Phase 1 fixtures' refusal paths still produce `refusals.jsonl` entries unchanged.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/02-authority-governance-kernel/02-CONTEXT.md
@.planning/phases/02-authority-governance-kernel/02-RESEARCH.md
@.planning/phases/02-authority-governance-kernel/02-VALIDATION.md
@.planning/phases/01-intent-planning-admission/01-08-refusal-artifact-layout-PLAN.md
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/refusals-index.ts
@packages/intent/src/admission-decision.ts
@packages/authority/src/precedence/index.ts
@packages/authority/src/admission-decision/base.ts
@packages/authority/src/admission-decision/signed-admission-decision.ts
@packages/authority/src/signature/sign.ts
@packages/authority/src/signature/policy-snapshot.ts
@packages/authority/src/repo-policy/parse.ts

<interfaces>
<!-- Reuse Phase 1 patterns. Do NOT redefine. -->

From apps/factory-cli/src/refusals-index.ts (Phase 1 Plan 08 — TEMPLATE):
- `formatRefusalIndexLine(entry): string` (one JSON line + "\n")
- `appendRefusalIndexEntry(jsonlPath, entry): Promise<void>` (uses fs.appendFile)
- `RefusalIndexEntry` shape: { runId, timestamp, stage, reason, artifactPath, schemaVersion }

From @protostar/authority (Plans 04-06):
- `intersectEnvelopes(tiers): PrecedenceDecision`
- `parseRepoPolicy(unknown): Result<RepoPolicy, errors>`
- `DENY_ALL_REPO_POLICY: RepoPolicy`
- `buildPolicySnapshot({policy, resolvedEnvelope, repoPolicy?}): PolicySnapshot`
- `hashPolicySnapshot(value): string`
- `buildSignatureEnvelope({intent, resolvedEnvelope, policySnapshotHash}): SignatureEnvelope`
- `AdmissionDecisionBase<E>`, `GateName`, `GATE_NAMES`
- `signAdmissionDecision(decision): SignedAdmissionDecision`

From @protostar/intent:
- `ADMISSION_DECISION_OUTCOMES`, `AdmissionDecisionOutcome` (single source of truth)
- `mintConfirmedIntent` (still module-private to @protostar/intent — promote-intent-draft is the public producer)
- ConfirmedIntent's `signature` slot (after Plan 03, accepts canonicalForm)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: admission-decisions.jsonl index writer + per-gate file writer + repo-policy loader</name>
  <files>
    apps/factory-cli/src/admission-decisions-index.ts,
    apps/factory-cli/src/write-admission-decision.ts,
    apps/factory-cli/src/load-repo-policy.ts,
    apps/factory-cli/src/precedence-tier-loader.ts,
    apps/factory-cli/src/admission-decisions-index.test.ts,
    apps/factory-cli/src/write-admission-decision.test.ts,
    apps/factory-cli/src/load-repo-policy.test.ts,
    apps/factory-cli/package.json
  </files>
  <read_first>
    - apps/factory-cli/src/refusals-index.ts (Phase 1 template — copy structure)
    - apps/factory-cli/src/main.ts §"writeRefusalArtifacts" (lines 605-632 — triple-write template)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-04, Q-13, Q-14
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"System Architecture Diagram" §"Pitfall 4: Per-gate file write inside @protostar/authority"
    - packages/authority/src/admission-decision/base.ts (AdmissionDecisionBase shape)
    - packages/authority/src/repo-policy/parse.ts (parseRepoPolicy + DENY_ALL_REPO_POLICY)
  </read_first>
  <behavior>
    - `formatAdmissionDecisionIndexLine(entry): string` — produces one JSON line: `{"runId","timestamp","gate","outcome","artifactPath","schemaVersion","precedenceStatus"}` + "\n"
    - `appendAdmissionDecisionIndexEntry(jsonlPath, entry)` — uses `fs.appendFile`; creates parent dir if needed
    - `writeAdmissionDecision({runDir, gate, decision, signed?})` — Promise<{ artifactPath: string }>; writes `{runDir}/{gate}-admission-decision.json` (atomic via writeJson helper); appends index; if `signed === true`, signs decision via `signAdmissionDecision` before write (used for cross-stage tamper resistance)
    - `writePrecedenceDecision({runDir, decision})` — writes `precedence-decision.json` only when `decision.status !== "no-conflict"`
    - `writePolicySnapshot({runDir, snapshot})` — writes `policy-snapshot.json` once per run; returns hash for inclusion in signed-intent payload
    - `loadRepoPolicy(workspaceRoot)` — reads `{workspaceRoot}/.protostar/repo-policy.json` via `fs.readFile`; on ENOENT returns `DENY_ALL_REPO_POLICY` (A3 lock); on parse error throws (factory aborts with refusal artifact in main.ts)
    - `buildTierConstraints({intent, policy, repoPolicy, operatorSettings})` — pure helper that maps the 4 tiers' state to `TierConstraint[]` for `intersectEnvelopes`
  </behavior>
  <action>
**`apps/factory-cli/src/admission-decisions-index.ts`** — copy `apps/factory-cli/src/refusals-index.ts` structure verbatim, adapting field names:

```ts
export interface AdmissionDecisionIndexEntry {
  readonly runId: string;
  readonly timestamp: string;
  readonly gate: GateName;
  readonly outcome: AdmissionDecisionOutcome;
  readonly artifactPath: string;        // e.g. ".protostar/runs/run-abc/intent-admission-decision.json"
  readonly schemaVersion: "1.0.0";
  readonly precedenceStatus: "no-conflict" | "resolved" | "blocked-by-tier";
}

export function formatAdmissionDecisionIndexLine(entry: AdmissionDecisionIndexEntry): string {
  return JSON.stringify(entry) + "\n";  // one entry per line; field order via object literal stability
}

export async function appendAdmissionDecisionIndexEntry(
  jsonlPath: string,
  entry: AdmissionDecisionIndexEntry,
): Promise<void> {
  await fs.mkdir(path.dirname(jsonlPath), { recursive: true });
  await fs.appendFile(jsonlPath, formatAdmissionDecisionIndexLine(entry), "utf8");
}
```

**`apps/factory-cli/src/write-admission-decision.ts`**:
```ts
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type AdmissionDecisionBase,
  type GateName,
  type PrecedenceDecision,
  type PolicySnapshot,
  signAdmissionDecision,
  hashPolicySnapshot,
} from "@protostar/authority";
import { appendAdmissionDecisionIndexEntry } from "./admission-decisions-index.js";

export interface WriteAdmissionDecisionInput<E extends object> {
  readonly runDir: string;          // .protostar/runs/{id}
  readonly gate: GateName;
  readonly decision: AdmissionDecisionBase<E>;
  readonly signed?: boolean;        // when true, persists the signed wrapper instead of the bare decision
}

export async function writeAdmissionDecision<E extends object>(
  input: WriteAdmissionDecisionInput<E>,
): Promise<{ artifactPath: string }> {
  const filename = `${input.gate}-admission-decision.json`;
  const artifactPath = path.join(input.runDir, filename);
  await fs.mkdir(input.runDir, { recursive: true });
  const payload = input.signed === true ? signAdmissionDecision(input.decision) : input.decision;
  await fs.writeFile(artifactPath, JSON.stringify(payload, null, 2), "utf8");

  await appendAdmissionDecisionIndexEntry(path.join(input.runDir, "admission-decisions.jsonl"), {
    runId: input.decision.runId,
    timestamp: input.decision.timestamp,
    gate: input.gate,
    outcome: input.decision.outcome,
    artifactPath: path.relative(process.cwd(), artifactPath),  // workspace-relative
    schemaVersion: "1.0.0",
    precedenceStatus: input.decision.precedenceResolution.status,
  });

  return { artifactPath };
}

export async function writePrecedenceDecision(input: { runDir: string; decision: PrecedenceDecision }): Promise<{ artifactPath: string } | null> {
  if (input.decision.status === "no-conflict") return null;
  const artifactPath = path.join(input.runDir, "precedence-decision.json");
  await fs.mkdir(input.runDir, { recursive: true });
  await fs.writeFile(artifactPath, JSON.stringify(input.decision, null, 2), "utf8");
  return { artifactPath };
}

export async function writePolicySnapshot(input: { runDir: string; snapshot: PolicySnapshot }): Promise<{ artifactPath: string; hash: string }> {
  const artifactPath = path.join(input.runDir, "policy-snapshot.json");
  await fs.mkdir(input.runDir, { recursive: true });
  await fs.writeFile(artifactPath, JSON.stringify(input.snapshot, null, 2), "utf8");
  return { artifactPath, hash: hashPolicySnapshot(input.snapshot) };
}
```

**`apps/factory-cli/src/load-repo-policy.ts`**:
```ts
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseRepoPolicy, DENY_ALL_REPO_POLICY, type RepoPolicy } from "@protostar/authority";

/**
 * A3 lock — see .planning/phases/02-authority-governance-kernel/02-CONTEXT.md
 * planning_context. Absence of `.protostar/repo-policy.json` returns
 * DENY_ALL_REPO_POLICY (default-DENY for dark-factory posture). Research had
 * recommended permissive default; the orchestrator inverted.
 */
export async function loadRepoPolicy(workspaceRoot: string): Promise<RepoPolicy> {
  const filePath = path.join(workspaceRoot, ".protostar", "repo-policy.json");
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return DENY_ALL_REPO_POLICY;
    throw err;
  }
  const parsed = JSON.parse(raw);
  const result = parseRepoPolicy(parsed);
  if (!result.ok) {
    throw new Error(`invalid .protostar/repo-policy.json: ${result.errors.join("; ")}`);
  }
  return result.policy;
}
```

**`apps/factory-cli/src/precedence-tier-loader.ts`** — pure helper (no fs):
```ts
import type { CapabilityEnvelope, ConfirmedIntent } from "@protostar/intent";
import type { TierConstraint, RepoPolicy } from "@protostar/authority";

export interface BuildTierConstraintsInput {
  readonly intent: ConfirmedIntent;
  readonly policy: { envelope: CapabilityEnvelope; source: string };
  readonly repoPolicy: RepoPolicy;
  readonly operatorSettings: { envelope: CapabilityEnvelope; source: string };
}

export function buildTierConstraints(input: BuildTierConstraintsInput): readonly TierConstraint[] {
  return Object.freeze([
    { tier: "confirmed-intent",  envelope: input.intent.capabilityEnvelope, source: `intent:${input.intent.id}` },
    { tier: "policy",            envelope: input.policy.envelope,            source: input.policy.source },
    { tier: "repo-policy",       envelope: repoPolicyToEnvelope(input.repoPolicy), source: ".protostar/repo-policy.json" },
    { tier: "operator-settings", envelope: input.operatorSettings.envelope,  source: input.operatorSettings.source },
  ]);
}

function repoPolicyToEnvelope(p: RepoPolicy): CapabilityEnvelope {
  // Translate RepoPolicy fields to a CapabilityEnvelope contribution:
  //   allowedScopes -> repoScopes intersection
  //   deniedTools -> subtract from allowedTools
  //   budgetCaps -> budget min
  //   trustOverride === "untrusted" -> executionScope: "workspace-readonly" or "none" depending on policy
  //
  // Implement per the structure of CapabilityEnvelope (see packages/intent/src/capability-admission.ts).
}
```

**Test files — `*.test.ts`** for each new module:

- `admission-decisions-index.test.ts`: round-trip format/parse one line; appendAdmissionDecisionIndexEntry creates parent dir; appending to existing file preserves prior lines
- `write-admission-decision.test.ts`: writes file at correct path; appends index; `signed:true` produces a wrapper with valid signature (via `verifySignedAdmissionDecision` round-trip); `writePrecedenceDecision` skips file when status === "no-conflict"; `writePolicySnapshot` hash matches `hashPolicySnapshot` recomputed independently
- `load-repo-policy.test.ts`: file present + valid → returns parsed policy; file absent (ENOENT) → returns `DENY_ALL_REPO_POLICY`; file present + malformed JSON → throws; file present + schema-invalid → throws

**Update `apps/factory-cli/package.json`** dependencies to include `"@protostar/authority": "workspace:*"`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/factory-cli test` exits 0
    - `grep -c 'admission-decisions.jsonl' apps/factory-cli/src/admission-decisions-index.ts` >= 1
    - `grep -c 'DENY_ALL_REPO_POLICY' apps/factory-cli/src/load-repo-policy.ts` >= 1
    - The A3 fallback test exists and asserts `loadRepoPolicy` returns `DENY_ALL_REPO_POLICY` on ENOENT (`grep -c 'DENY_ALL_REPO_POLICY' apps/factory-cli/src/load-repo-policy.test.ts` >= 1)
    - `grep -c 'no-conflict' apps/factory-cli/src/write-admission-decision.ts` >= 1 (precedence-decision skip-on-no-conflict logic)
    - File `apps/factory-cli/src/precedence-tier-loader.ts` exists and exports `buildTierConstraints`
  </acceptance_criteria>
  <done>Per-gate writer + JSONL index + repo-policy loader + tier builder shipped; all tested in isolation; ready to wire into runFactory.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire runFactory through precedence kernel + per-gate writer + signed intent</name>
  <files>
    apps/factory-cli/src/main.ts,
    apps/factory-cli/src/main.test.ts
  </files>
  <read_first>
    - apps/factory-cli/src/main.ts (entire file — find the existing intent-gate admission-decision write and the writeRefusalArtifacts callsites)
    - apps/factory-cli/src/refusals-index.ts (existing — leave intact; refusals.jsonl continues to work in parallel with the new admission-decisions.jsonl)
    - .planning/phases/01-intent-planning-admission/01-08-refusal-artifact-layout-PLAN.md (Phase 1 wiring template)
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"System Architecture Diagram" + §"Phase Requirements -> Test Map" GOV-05 rows
  </read_first>
  <behavior>
    - `runFactory` flow now:
      1. Load `.protostar/repo-policy.json` (via `loadRepoPolicy`) — A3 fallback to DENY_ALL_REPO_POLICY on absence
      2. After confirming intent (existing Phase 1 path), compute resolved envelope via `intersectEnvelopes(buildTierConstraints(...))`
      3. Build `policySnapshot` via `buildPolicySnapshot`; write it; hash it
      4. Mint signed intent via existing `promoteIntentDraft` flow + the new `signature` field populated through `buildSignatureEnvelope` (see note below)
      5. For each of the 5 gates that fire on this run path, build the per-gate `AdmissionDecisionBase<E>` and call `writeAdmissionDecision({runDir, gate, decision})`
      6. If the precedence decision had conflicts, also call `writePrecedenceDecision`
    - The existing `runs/{id}/admission-decision.json` write path for the intent gate is replaced by the new `intent-admission-decision.json` path. Legacy filename is NOT also written for new runs (Plan 09 handles legacy reads).
    - On block/escalate outcomes from any gate: continue to call existing `writeRefusalArtifacts` (Phase 1) for refusal-status + refusals.jsonl AND emit the per-gate admission-decision (with outcome=block/escalate) — both indices co-exist
    - `escalate` outcome handling (Plan 08 owns the marker artifact + exit code split; this plan emits the decision with outcome=escalate but does not yet branch on exit code distinct from block — Plan 08 layers that)
    - Phase 1 contract test (`promoteIntentDraft` is sole producer of ConfirmedIntent) still passes — signing happens AFTER promotion via a new internal call site
  </behavior>
  <action>
**Locate** the existing intent-gate `admission-decision.json` write site in `apps/factory-cli/src/main.ts` (search for `admission-decision.json` literal). **Replace** with a call to the new `writeAdmissionDecision({ gate: "intent", ... })`.

**Add** the precedence kernel + signed intent flow at the appropriate place (after intent confirmation, before any subsequent gate):

```ts
// 1. Load repo policy (A3 default-DENY on ENOENT)
const repoPolicy = await loadRepoPolicy(workspaceRoot);

// 2. Resolve precedence
const tiers = buildTierConstraints({
  intent: confirmedIntent,
  policy: { envelope: policyEnvelope, source: `policy:${policyName}` },
  repoPolicy,
  operatorSettings: { envelope: operatorEnvelope, source: "operator-settings" },
});
const precedence = intersectEnvelopes(tiers);

// 3. Write precedence-decision.json IFF conflict
await writePrecedenceDecision({ runDir, decision: precedence });

// 4. Build + write policy snapshot, get hash
const snapshot = buildPolicySnapshot({
  policy: policySnapshotInput,
  resolvedEnvelope: precedence.resolvedEnvelope,
  repoPolicy,
});
const { hash: policySnapshotHash } = await writePolicySnapshot({ runDir, snapshot });

// 5. Sign the confirmed intent (signature added post-promotion)
const signature = buildSignatureEnvelope({
  intent: stripBrandAndSignature(confirmedIntent),
  resolvedEnvelope: precedence.resolvedEnvelope,
  policySnapshotHash,
});
// Persist the signed intent body under runs/{id}/intent.json (existing path? — verify by reading current main.ts;
// if Phase 1 already wrote intent.json, this update merges the signature field into the persisted JSON)
const signedIntent = { ...confirmedIntent, signature };
await fs.writeFile(path.join(runDir, "intent.json"), JSON.stringify(signedIntent, null, 2), "utf8");

// 6. Per-gate writes
const intentDecision: AdmissionDecisionBase<...> = {
  schemaVersion: "1.0.0",
  runId,
  gate: "intent",
  outcome: "allow",
  timestamp: new Date().toISOString(),
  precedenceResolution: { status: precedence.status, ...(precedence.status !== "no-conflict" ? { precedenceDecisionPath: path.join(runDir, "precedence-decision.json") } : {}) },
  evidence: { ambiguityScore, admissionStage: "promote-intent-draft" },
};
await writeAdmissionDecision({ runDir, gate: "intent", decision: intentDecision });

// Repeat for "planning", "capability", "repo-scope", "workspace-trust" at their respective points in the existing flow.
// For gates that don't fire on this code path (e.g. workspace-trust if no workspace op runs), skip — the test for "all 5 gates emit on a happy-path" applies only to runs that exercise all 5.
```

**Note on signing post-promotion:** Phase 1's `promoteIntentDraft` returns a `ConfirmedIntent` with `signature: null` (Phase 1 reservation). We CANNOT mutate the frozen branded object. Approach: construct a NEW signed object. Two paths:
1. Call `mintConfirmedIntent` (the module-private mint) directly with the input + signature — but `mintConfirmedIntent` is private to `@protostar/intent`, so factory-cli cannot call it directly.
2. Add a public helper `signConfirmedIntent(intent: ConfirmedIntent, signature: SignatureEnvelope): ConfirmedIntent` to `@protostar/intent` that re-mints via the private mint. This is a NEW public producer — it would TRIP the Phase 1 contract test which pins `promoteIntentDraft` as the sole producer.
3. Add the signing path to `promoteIntentDraft` itself: accept an optional `signatureProvider` callback that's called post-validation, pre-freeze, and embeds the signature in the mint. **Recommended.** Update `packages/intent/src/promote-intent-draft.ts` to accept `{ signatureProvider?: (intent: ConfirmedIntentInput) => SignatureEnvelope }` and call it before mint.

**Choose path 3.** Update `packages/intent/src/promote-intent-draft.ts` to accept the optional callback. The Phase 1 contract test still passes because `promoteIntentDraft` remains the sole producer; the signing is internal to its body.

(If this plan finds path 3 needs broader refactoring, surface as a deviation; alternative escape hatch: split intent-confirmation into two passes where the second pass signs via a sibling helper that wraps `mintConfirmedIntent` — still single public producer.)

**Update `apps/factory-cli/src/main.test.ts`** (or add a new test file) covering:
1. **Happy path / all 5 gates fire**: a fixture that exercises intent + planning + capability + repo-scope + workspace-trust ⇒ all 5 per-gate decision files exist + `admission-decisions.jsonl` has 5 entries
2. **Precedence no-conflict**: simple intent with no policy/repo-policy conflicts ⇒ `precedence-decision.json` does NOT exist; the per-gate `precedenceResolution.status === "no-conflict"`
3. **Precedence conflict**: fixture where repo-policy denies a tool the intent requests ⇒ `precedence-decision.json` exists and references the right tier in `blockedBy`
4. **Repo-policy absent**: no `.protostar/repo-policy.json` ⇒ run uses DENY_ALL_REPO_POLICY ⇒ for any test that requires more than read-only intent, run produces `block` outcome and refusal artifact
5. **Signed intent**: after a successful run, `runs/{id}/intent.json` has a non-null `signature.value` (64 hex chars) and `signature.canonicalForm === "json-c14n@1.0"`
6. **Round-trip verify**: `verifyConfirmedIntentSignature(intent, snapshot, resolvedEnvelope)` returns `ok: true` for the persisted run
7. **Tamper detect**: mutate the persisted `intent.json` post-write, re-verify ⇒ `ok: false`
8. **Phase 1 regression**: the cosmetic-tweak fixture still produces the existing `refusals.jsonl` entries when refused (no behavior change to refusal indices)
9. **Legacy filename NOT written**: new runs do NOT contain `runs/{id}/admission-decision.json` (only `intent-admission-decision.json`)
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test &amp;&amp; pnpm run verify:full</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/factory-cli test` exits 0
    - `pnpm run verify:full` exits 0 (full Phase 1 + Phase 2 wave 1-2 regression suite)
    - `pnpm --filter @protostar/admission-e2e test` exits 0 (Phase 1 contract test on `promoteIntentDraft` still pins surface)
    - `grep -c 'intersectEnvelopes' apps/factory-cli/src/main.ts` >= 1
    - `grep -c 'writeAdmissionDecision' apps/factory-cli/src/main.ts` >= 5 (called for each gate that fires)
    - `grep -c 'buildPolicySnapshot\\|buildSignatureEnvelope' apps/factory-cli/src/main.ts` >= 2
    - `grep -c "admission-decisions.jsonl" apps/factory-cli/src/main.ts apps/factory-cli/src/admission-decisions-index.ts | grep -v ':0'` returns >=1 line
    - The "all 5 gates fire" happy-path test exists and passes (`grep -l 'all 5 gates\\|admission-decisions.jsonl.*5\\|GATE_NAMES.length' apps/factory-cli/src/main.test.ts apps/factory-cli/src/*.test.ts | wc -l` >= 1)
    - The tamper-detection test exists (`grep -l 'verifyConfirmedIntentSignature.*ok.*false\\|tamper' apps/factory-cli/src/main.test.ts | wc -l` >= 1)
    - `grep -v '^#' apps/factory-cli/src/main.ts | grep -c '"admission-decision.json"'` outputs `0` (legacy literal removed from new write paths; NOTE: if grep finds it inside a comment or fallback-read path, those uses are allowed and the regression is structural — refine the grep to check only write callsites if the literal grep over-matches)
  </acceptance_criteria>
  <done>runFactory writes per-gate admission decisions + JSONL index + signed intent + policy snapshot; tamper detection works end-to-end; Phase 1 contract surface preserved.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| factory-cli ↔ filesystem | Every write goes through one of: `writeAdmissionDecision`, `writePrecedenceDecision`, `writePolicySnapshot`, existing `writeRefusalArtifacts`, `fs.writeFile` for `intent.json` |
| factory-cli ↔ @protostar/authority | Pure-function calls only; authority never reads files |
| repo-policy load boundary | Absence treated as DENY (A3 lock); malformed treated as fatal |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-1 | Tampering | Tampered ConfirmedIntent reaches execution | mitigate (high severity) | Signed intent persisted with policy-snapshot hash; tamper-detection test verifies `verifyConfirmedIntentSignature` catches mutated `intent.json`. Plan 09's stage reader runs the verify on every read. |
| T-2-3 | Tampering | Repo-policy.json absent → permissive default | mitigate (high severity) | `loadRepoPolicy` ENOENT branch returns `DENY_ALL_REPO_POLICY` (A3 lock); test asserts the constant is returned and downstream gates produce `block` for non-readonly intents. |
| T-2-6 | Tampering | Stage reader accepts a wrong-schema artifact | mitigate (medium) | Per-gate writer emits `schemaVersion: "1.0.0"` + canonical filename; Plan 09 reader validates on read. JSONL index also schemaVersion-tagged. |
</threat_model>

<verification>
- `pnpm run verify:full` exits 0
- All 9 main.test.ts cases above pass (happy path / no-conflict / conflict / absent-repo-policy / signed / round-trip-verify / tamper / Phase 1 regression / legacy filename absent)
- 5 per-gate files emitted on happy path
- Authority boundary preserved (all fs writes in factory-cli)
- Phase 1 contract surface still pinned (`promoteIntentDraft` sole producer)
</verification>

<success_criteria>
- runFactory wires precedence kernel + per-gate writer + signed intent + policy snapshot
- `admission-decisions.jsonl` symmetric to `refusals.jsonl`
- A3 default-DENY behavior observable on absent repo-policy
- Tamper detection works end-to-end via `verifyConfirmedIntentSignature`
- GOV-01 + GOV-05 enforcement live
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-07-factory-cli-per-gate-writer-SUMMARY.md`
</output>
