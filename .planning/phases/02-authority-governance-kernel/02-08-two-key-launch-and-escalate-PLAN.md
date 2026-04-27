---
phase: 02-authority-governance-kernel
plan: 08
type: execute
wave: 3
depends_on: [04, 06]
files_modified:
  - apps/factory-cli/src/cli-args.ts
  - apps/factory-cli/src/cli-args.test.ts
  - apps/factory-cli/src/two-key-launch.ts
  - apps/factory-cli/src/two-key-launch.test.ts
  - apps/factory-cli/src/escalation-marker.ts
  - apps/factory-cli/src/escalation-marker.test.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/main.test.ts
autonomous: true
requirements:
  - GOV-04
must_haves:
  truths:
    - "`--trust trusted` requires `--confirmed-intent <path>` — without the second key, factory exits with a refusal artifact (Q-11 two-key launch)"
    - "Default `--trust untrusted` (Q-11)"
    - "Hardcoded `trust: \"trusted\"` at apps/factory-cli/src/main.ts:335 is REMOVED — grep regression: zero hits in main.ts"
    - "On the `escalate` outcome (any gate), factory writes `runs/{id}/escalation-marker.json` distinct from refusal artifacts (Q-12, A5 lock)"
    - "Exit codes: success = 0; refusal/block = 1 (existing); escalate = 2 (A6 lock — distinct semantic)"
    - "Two-key launch validation runs at CLI parse, BEFORE runFactory — refusal does NOT also fire other gates' admission decisions (Pitfall 5)"
    - "`escalate` literal is REUSED from `@protostar/intent`'s ADMISSION_DECISION_OUTCOMES — Phase 2 does NOT introduce a new literal"
  artifacts:
    - path: apps/factory-cli/src/cli-args.ts
      provides: "Argv parser with --trust + --confirmed-intent flags; default --trust untrusted"
      exports: ["parseCliArgs", "ParsedCliArgs", "TrustLevel"]
    - path: apps/factory-cli/src/two-key-launch.ts
      provides: "validateTwoKeyLaunch(args) → Result; refusal evidence builder"
      exports: ["validateTwoKeyLaunch", "TwoKeyLaunchRefusal"]
    - path: apps/factory-cli/src/escalation-marker.ts
      provides: "writeEscalationMarker(input) — emits runs/{id}/escalation-marker.json"
      exports: ["writeEscalationMarker", "EscalationMarker"]
  key_links:
    - from: apps/factory-cli/src/main.ts
      to: apps/factory-cli/src/two-key-launch.ts
      via: "first call after parseCliArgs; refuses BEFORE entering runFactory"
      pattern: "validateTwoKeyLaunch"
    - from: apps/factory-cli/src/main.ts
      to: apps/factory-cli/src/escalation-marker.ts
      via: "called when any gate's outcome === \"escalate\""
      pattern: "writeEscalationMarker"
---

<objective>
Wave 3 / parallel-with-Plan-07 — closes GOV-04 (workspace trust enforcement at CLI level). Three tightly-related changes:

1. **Two-key launch (Q-11):** new `--trust {untrusted|trusted}` and `--confirmed-intent <path>` CLI flags. `--trust trusted` is refused unless `--confirmed-intent` is also supplied. Refusal happens at CLI argument validation BEFORE `runFactory` runs (Pitfall 5).
2. **Remove hardcoded trust:** the `trust: "trusted"` literal at `apps/factory-cli/src/main.ts:335` (verified by grep above) becomes derived from the validated CLI args (`workspace.trust = parsedArgs.trust`).
3. **Escalation marker (Q-12, A5):** when any gate emits an `outcome === "escalate"`, factory-cli writes `runs/{id}/escalation-marker.json` (distinct from refusal artifacts) and exits with code 2 (A6 lock — distinct from refusal exit 1).

Per RESEARCH.md anti-pattern: `escalate` is NOT a new literal — it already exists at `packages/intent/src/admission-decision.ts:28`. This plan WIRES it for the trust-failure path; Plan 07 already supports it in the per-gate writer.

Per RESEARCH.md Pitfall 5: two-key validation is CLI-arg validation, not an admission gate — refusal does not progress through runFactory.

Authority boundary: every `node:fs/promises` call in this plan is in `apps/factory-cli`.

Output: a run with `--trust trusted` but no `--confirmed-intent` produces a refusal + exit 2; a run with both produces a normal happy-path; a run that hits an escalate verdict from any gate writes the marker and exits 2; the hardcoded trust literal is gone.
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
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/refusals-index.ts
@packages/intent/src/admission-decision.ts
@packages/authority/schema/escalation-marker.schema.json

<interfaces>
<!-- Existing literal — reuse, do not redefine. -->
From packages/intent/src/admission-decision.ts:28:
  ADMISSION_DECISION_OUTCOMES = ["allow", "block", "escalate"] as const

From apps/factory-cli/src/refusals-index.ts (Phase 1):
  - appendRefusalIndexEntry / formatRefusalIndexLine — reused for the two-key refusal pathway
  - RefusalIndexEntry — add new stage literal "workspace-trust" (or reuse existing if applicable)

From packages/authority/schema/escalation-marker.schema.json (Plan 01 Task 2):
  - required: schemaVersion, runId, gate, reason, createdAt
  - optional: awaiting

Current main.ts hardcoded site (verified):
  apps/factory-cli/src/main.ts:335 contains `trust: "trusted",`
  This line is the single removal target. The grep regression verifies removal.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: CLI argv parser + two-key launch validator</name>
  <files>
    apps/factory-cli/src/cli-args.ts,
    apps/factory-cli/src/cli-args.test.ts,
    apps/factory-cli/src/two-key-launch.ts,
    apps/factory-cli/src/two-key-launch.test.ts
  </files>
  <read_first>
    - apps/factory-cli/src/main.ts (find current argv parsing — likely uses process.argv directly or a helper; identify the entry point)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-11 (two-key launch lock + planner note)
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Two-key CLI launch refusal" (lines ~537-551)
    - .planning/phases/02-authority-governance-kernel/02-RESEARCH.md §"Pitfall 5" (lines ~360-364)
    - planning_context A4 lock: flag name is `--confirmed-intent`
  </read_first>
  <behavior>
    - `parseCliArgs(argv: readonly string[]): ParsedCliArgs` — handles both `--trust=trusted` and `--trust trusted` forms; supports `--confirmed-intent <path>`; defaults `trust` to `"untrusted"`
    - `TrustLevel = "untrusted" | "trusted"`
    - Unknown flags throw a structured `ArgvError` (caller maps to refusal artifact, NOT silent ignore)
    - `validateTwoKeyLaunch(parsedArgs): { ok: true } | { ok: false; refusal: TwoKeyLaunchRefusal }`:
      - Returns `ok: true` if `trust === "untrusted"` (no second key needed)
      - Returns `ok: true` if `trust === "trusted"` AND `confirmedIntent !== undefined`
      - Returns `ok: false` otherwise with structured refusal (`reason`, `missingFlag`, `provided`)
    - `TwoKeyLaunchRefusal` carries enough evidence for an operator to fix the invocation
  </behavior>
  <action>
**`apps/factory-cli/src/cli-args.ts`:**
```ts
export type TrustLevel = "untrusted" | "trusted";
export const TRUST_LEVELS: readonly TrustLevel[] = Object.freeze(["untrusted", "trusted"]);

export interface ParsedCliArgs {
  readonly trust: TrustLevel;
  readonly confirmedIntent?: string;        // path to confirmed-intent JSON
  readonly intent?: string;                 // legacy/alternative intent path (Phase 1)
  // ... other existing flags Phase 1 may have parsed; preserve them all
}

export class ArgvError extends Error {
  constructor(public readonly flag: string, public readonly reason: string) {
    super(`argv error on "${flag}": ${reason}`);
  }
}

export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  let trust: TrustLevel = "untrusted";   // Q-11 default
  let confirmedIntent: string | undefined;
  // ...preserve all existing Phase 1 flag parsing; verify by reading current main.ts argv handling

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--trust" || a.startsWith("--trust=")) {
      const value = a.startsWith("--trust=") ? a.slice("--trust=".length) : argv[++i];
      if (value !== "untrusted" && value !== "trusted") {
        throw new ArgvError("--trust", `expected one of ${TRUST_LEVELS.join("|")}, got "${value}"`);
      }
      trust = value;
    } else if (a === "--confirmed-intent" || a.startsWith("--confirmed-intent=")) {
      const value = a.startsWith("--confirmed-intent=") ? a.slice("--confirmed-intent=".length) : argv[++i];
      if (!value) throw new ArgvError("--confirmed-intent", "expected a path argument");
      confirmedIntent = value;
    }
    // ... handle existing Phase 1 flags
  }

  return { trust, ...(confirmedIntent !== undefined ? { confirmedIntent } : {}) /* + others */ };
}
```

`exactOptionalPropertyTypes` requires the conditional spread for `confirmedIntent`.

**`apps/factory-cli/src/two-key-launch.ts`:**
```ts
import type { ParsedCliArgs } from "./cli-args.js";

export interface TwoKeyLaunchRefusal {
  readonly reason: string;
  readonly missingFlag: "--confirmed-intent";
  readonly provided: { trust: "trusted"; confirmedIntent: undefined };
}

export type TwoKeyLaunchResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: TwoKeyLaunchRefusal };

export function validateTwoKeyLaunch(args: ParsedCliArgs): TwoKeyLaunchResult {
  if (args.trust === "untrusted") return { ok: true };
  if (args.trust === "trusted" && args.confirmedIntent !== undefined) return { ok: true };
  return {
    ok: false,
    refusal: {
      reason: '--trust trusted requires --confirmed-intent <path> (two-key launch — see CONTEXT.md Q-11)',
      missingFlag: "--confirmed-intent",
      provided: { trust: "trusted", confirmedIntent: undefined },
    },
  };
}
```

**Test files:**

`cli-args.test.ts`:
1. Default trust is "untrusted" when flag absent
2. `--trust trusted` parses to "trusted"
3. `--trust=trusted` parses to "trusted"
4. `--trust invalid` throws `ArgvError`
5. `--confirmed-intent /path/to/intent.json` parses
6. `--confirmed-intent=/path/...` parses
7. `--confirmed-intent` with no value throws

`two-key-launch.test.ts`:
1. trust=untrusted, no confirmedIntent → ok: true
2. trust=untrusted, with confirmedIntent → ok: true (second key allowed but not required)
3. trust=trusted, no confirmedIntent → ok: false, refusal.missingFlag === "--confirmed-intent"
4. trust=trusted, with confirmedIntent → ok: true
5. Refusal `reason` mentions "two-key launch" (operator-readable)
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/factory-cli test` exits 0
    - `grep -c '\\-\\-trust' apps/factory-cli/src/cli-args.ts` >= 2 (parser handles both forms)
    - `grep -c '\\-\\-confirmed-intent' apps/factory-cli/src/cli-args.ts` >= 1
    - `grep -c '"untrusted"' apps/factory-cli/src/cli-args.ts` >= 1 (default value)
    - `grep -c 'validateTwoKeyLaunch' apps/factory-cli/src/two-key-launch.ts` >= 1
    - All 7 cli-args tests + 5 two-key tests pass
  </acceptance_criteria>
  <done>CLI parser + two-key validator shipped + tested in isolation; ready to wire into main.ts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Escalation marker writer + main.ts wiring + remove hardcoded trust</name>
  <files>
    apps/factory-cli/src/escalation-marker.ts,
    apps/factory-cli/src/escalation-marker.test.ts,
    apps/factory-cli/src/main.ts,
    apps/factory-cli/src/main.test.ts
  </files>
  <read_first>
    - apps/factory-cli/src/main.ts:335 (the hardcoded `trust: "trusted",` line — confirm exact location before edit)
    - apps/factory-cli/src/main.ts (entire file — locate runFactory entry, runId generation, the existing exit-code paths)
    - apps/factory-cli/src/refusals-index.ts (existing — used for the two-key refusal pathway artifact)
    - packages/authority/schema/escalation-marker.schema.json (Plan 01 Task 2)
    - .planning/phases/02-authority-governance-kernel/02-CONTEXT.md Q-12 + planner note + A5 + A6 locks
  </read_first>
  <behavior>
    - `EscalationMarker` interface matches the schema in Plan 01 Task 2 — `{ schemaVersion, runId, gate, reason, createdAt, awaiting }`
    - `writeEscalationMarker({ runDir, marker })`: writes `runs/{id}/escalation-marker.json` with `JSON.stringify(marker, null, 2)`
    - main.ts entry sequence:
      1. `const args = parseCliArgs(process.argv.slice(2));`
      2. `const tk = validateTwoKeyLaunch(args);`
      3. If `!tk.ok`: write a refusal artifact with stage `"workspace-trust"` (reuse existing `writeRefusalArtifacts`), exit code 2, return — do NOT call runFactory
      4. Otherwise: enter runFactory with `args.trust` propagated to the WorkspaceRef
    - **Hardcoded trust removal**: line 335's `trust: "trusted",` becomes `trust: args.trust,` (pass through validated arg)
    - In the per-gate writer (Plan 07's wiring), when any gate's `decision.outcome === "escalate"`: call `writeEscalationMarker` with the gate name + reason from the decision evidence; set `process.exitCode = 2`
    - Exit codes: 0 = success; 1 = refusal/block (existing); 2 = escalate OR two-key launch failure (A6 lock — both share exit 2 because both pause for human action)
  </behavior>
  <action>
**`apps/factory-cli/src/escalation-marker.ts`:**
```ts
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { GateName } from "@protostar/authority";

export interface EscalationMarker {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly gate: GateName;
  readonly reason: string;
  readonly createdAt: string;
  readonly awaiting: "operator-confirm" | "operator-resume";
}

export async function writeEscalationMarker(input: {
  readonly runDir: string;
  readonly marker: EscalationMarker;
}): Promise<{ artifactPath: string }> {
  const artifactPath = path.join(input.runDir, "escalation-marker.json");
  await fs.mkdir(input.runDir, { recursive: true });
  await fs.writeFile(artifactPath, JSON.stringify(input.marker, null, 2), "utf8");
  return { artifactPath };
}
```

**`apps/factory-cli/src/main.ts` changes:**

1. **Top of `main`** (or wherever argv is currently parsed):
```ts
const args = parseCliArgs(process.argv.slice(2));
const tk = validateTwoKeyLaunch(args);
if (!tk.ok) {
  const runId = args.runId ?? generateRunId();
  await writeRefusalArtifacts({
    runId,
    stage: "workspace-trust",
    reason: tk.refusal.reason,
    refusalArtifact: "trust-refusal.json",
    // ...other fields per existing helper
  });
  process.exitCode = 2;
  return;
}
```

The "workspace-trust" stage may need to be added to `RefusalStage` literal in the existing refusals-index.ts. Verify by reading the existing union; if missing, extend it.

2. **Line 335 replacement**: `trust: "trusted"` → `trust: args.trust`. Keep the rest of the WorkspaceRef construction intact. If line numbers have shifted by other Phase 2 plans landing earlier in the wave, locate via grep `grep -n 'trust: "trusted"' apps/factory-cli/src/main.ts` and edit that line.

3. **Escalate handling** in the per-gate writer wiring (Plan 07's site): after `writeAdmissionDecision`, check `decision.outcome`:
```ts
if (decision.outcome === "escalate") {
  await writeEscalationMarker({
    runDir,
    marker: {
      schemaVersion: "1.0.0",
      runId,
      gate,
      reason: extractEscalateReason(decision),
      createdAt: new Date().toISOString(),
      awaiting: "operator-confirm",
    },
  });
  process.exitCode = 2;
  return;  // halt the run; escalate is a stop gate per Q-12 (Phase 2 doesn't yet implement resume — that's Phase 9)
}
if (decision.outcome === "block") {
  // existing behavior; exitCode = 1
}
```

`extractEscalateReason(decision)` pulls a human-readable string from the decision's evidence. For Phase 2's primary escalate path (workspace-trust gate) the reason is something like "workspace trust mid-run downgrade detected" or "capability envelope breach awaiting operator confirm" — derive from the gate's evidence shape.

**Test changes — `escalation-marker.test.ts`:**
1. `writeEscalationMarker` creates the file at the expected path with valid JSON content
2. The written content validates against `escalation-marker.schema.json` (round-trip read + schema check)
3. Multiple writes overwrite (same runDir + same filename → last write wins)

**Test additions — `main.test.ts`:**
1. **Two-key launch refusal:** invoke main with `["--trust", "trusted"]` (no `--confirmed-intent`) → exit code 2; `runs/{id}/trust-refusal.json` exists; refusals.jsonl has entry; runFactory NOT entered (no `intent-admission-decision.json` written)
2. **Two-key launch success:** invoke with `["--trust", "trusted", "--confirmed-intent", <fixture>]` → exit code 0 (assuming fixture is admit-able); workspace.trust === "trusted" propagated
3. **Default untrusted:** no `--trust` flag → workspace.trust === "untrusted" in run; subsequent gates may produce `block` for write/execute ops
4. **Hardcoded trust regression:** `! grep -F 'trust: "trusted"' apps/factory-cli/src/main.ts` returns 0 exit code (NO match)
5. **Escalate path:** construct a fixture (or test double) where the workspace-trust gate emits `outcome: "escalate"` (e.g., trust mismatch detected mid-flow) → `runs/{id}/escalation-marker.json` exists; exit code === 2; refusal artifact NOT written for the escalate (escalation marker is distinct from refusal)
6. **Distinct exit codes:** block path exit code === 1 (regression — Phase 1 behavior); escalate path exit code === 2; success path exit code === 0
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test &amp;&amp; ! grep -F 'trust: "trusted"' apps/factory-cli/src/main.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @protostar/factory-cli test` exits 0
    - `pnpm run verify:full` exits 0
    - **Hardcoded trust grep regression:** `grep -c -F 'trust: "trusted"' apps/factory-cli/src/main.ts` outputs `0`
    - `grep -c 'args.trust' apps/factory-cli/src/main.ts` >= 1 (replacement is in place)
    - `grep -c 'validateTwoKeyLaunch' apps/factory-cli/src/main.ts` >= 1
    - `grep -c 'writeEscalationMarker' apps/factory-cli/src/main.ts` >= 1
    - `grep -c 'process.exitCode = 2' apps/factory-cli/src/main.ts` >= 1 (A6 lock — exit code 2 path)
    - All 6 main.test.ts cases above pass
    - `! grep -E '\\["allow",\\s*"block",\\s*"escalate"\\]' apps/factory-cli/src/escalation-marker.ts apps/factory-cli/src/two-key-launch.ts apps/factory-cli/src/cli-args.ts` (anti-pattern: do NOT redefine the outcomes literal)
  </acceptance_criteria>
  <done>Two-key launch enforced; hardcoded trust removed; escalation marker written; distinct exit codes; GOV-04 closed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CLI argv boundary | Untrusted user-supplied argv enters here; validated before entering runFactory |
| Trust-level propagation boundary | `args.trust` flows to WorkspaceRef.trust; consumed by Plan 09's runtime check in packages/repo |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-5 | Elevation of Privilege | Hardcoded `trust: "trusted"` at apps/factory-cli/src/main.ts:335 | mitigate (high severity, primary closure) | This plan removes the hardcode; replaces with `args.trust` (validated CLI input). Regression grep gate enforces zero `trust: "trusted"` literal in main.ts. Plan 02's `authorizeWorkspaceOp` predicate provides the second layer (admission-time refusal). Plan 09 provides the third layer (execution-time runtime check in packages/repo). |
| T-2-4 | Elevation of Privilege | escalate verdict bypassed by inner gate returning admit | mitigate (medium) | Distinct exit code (2) ensures the escalate signal cannot be silently treated as success; escalation marker is human-readable evidence. Plan 09's stage reader will validate the marker on resume (Phase 9 wires resume itself). |
</threat_model>

<verification>
- `pnpm --filter @protostar/factory-cli test` exits 0
- `pnpm run verify:full` exits 0
- Hardcoded trust regression: zero hits in main.ts
- Two-key launch refusal: missing `--confirmed-intent` produces exit 2 + refusal artifact
- Escalate path: produces escalation-marker + exit 2; distinct from block (exit 1)
- Default untrusted observed when no flag supplied
</verification>

<success_criteria>
- `--trust` and `--confirmed-intent` flags wired
- Hardcoded trust at main.ts:335 removed (verified by grep)
- Two-key launch validated before runFactory (Pitfall 5)
- Escalation marker emitted on `escalate` outcome (Q-12, A5)
- Exit codes: 0/1/2 distinct (A6 lock)
- GOV-04 closed
</success_criteria>

<output>
After completion, create `.planning/phases/02-authority-governance-kernel/02-08-two-key-launch-and-escalate-SUMMARY.md`
</output>
