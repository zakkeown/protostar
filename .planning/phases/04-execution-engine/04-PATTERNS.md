# Phase 4: Execution Engine — Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 18 (new + modified)
**Analogs found:** 16 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/lmstudio-adapter/package.json` | package manifest | config | `packages/dogpile-adapter/package.json` | exact |
| `packages/lmstudio-adapter/tsconfig.json` | build config | config | `packages/dogpile-adapter/tsconfig.json` | exact |
| `packages/lmstudio-adapter/src/index.ts` | brand-consumer / I/O (HTTP/SSE) | streaming, request-response | `packages/dogpile-adapter/src/index.ts` (workspace shape) + `packages/authority/src/authorized-ops/network-op.ts` (brand consumption) | role-match (no SSE adapter exists yet) |
| `packages/lmstudio-adapter/src/factory-config.ts` | pure logic (loader+hash) | file I/O via injection | `apps/factory-cli/src/load-repo-policy.ts` | exact (file+env+default loader) |
| `packages/lmstudio-adapter/src/factory-config.schema.json` | schema | static | `packages/intent/schema/capability-admission-decision.schema.json` | exact |
| `packages/lmstudio-adapter/src/preflight.ts` | I/O (HTTP) | request-response | `packages/authority/src/authorized-ops/network-op.ts` | partial (authorize wrapper); no live HTTP analog in repo |
| `packages/lmstudio-adapter/src/sse-parser.ts` | pure logic | streaming | none | **no analog** |
| `packages/lmstudio-adapter/src/diff-parser.ts` | pure logic | transform | `packages/intent/src/repo-scope-admission.ts` (validator returning result-or-violation union) | role-match |
| `packages/lmstudio-adapter/src/coder-adapter.ts` | I/O orchestrator | streaming | `packages/dogpile-adapter/src/index.ts` (preset/mission shape) | role-match |
| `packages/execution/src/index.ts` (modify) | pure logic / state-machine vocab flip | event-driven | self (lines 8, 25–29, 601–705) | exact (in-place rewrite) |
| `packages/execution/src/journal.ts` | pure logic (formatter) | append-only JSONL | `apps/factory-cli/src/admission-decisions-index.ts` | exact |
| `packages/execution/src/snapshot.ts` | pure logic (tmp+rename writer) | file I/O | `apps/factory-cli/src/load-repo-policy.ts` (read side) + Node fs/promises pattern | partial (no tmp+rename example exists) |
| `packages/execution/src/orphan-replay.ts` | pure logic | transform | `packages/execution/src/index.ts` validator (`validateAdmittedPlanExecutionArtifact`) | role-match |
| `packages/execution/src/retry-classifier.ts` + `backoff.ts` | pure logic | transform | none | **no analog** (new utility class) |
| `packages/execution/src/adapter-contract.ts` | type contract | n/a | `packages/execution/src/admitted-plan-input.contract.ts` | exact |
| `packages/authority/src/authorized-ops/network-op.ts` (extend) | brand-minter | request-response | self | exact (in-place extension) |
| `packages/intent/schema/confirmed-intent.schema.json` (bump) | schema | static | self (1.1.0 → 1.3.0) | exact |
| `packages/planning/...` plan-schema (add `task.adapterRef`, `task.targetFiles`) | schema + contract | static | `packages/planning/src/schema/index.ts` re-exports + plan-task contracts | role-match |
| `apps/factory-cli/src/coder-adapter-admission.ts` | I/O admission gate | request-response | `apps/factory-cli/src/main.ts` workspace-trust admission block (lines 872–910) + `load-repo-policy.ts` | role-match |
| `apps/factory-cli/src/main.ts` (modify) | I/O orchestrator | event-driven | self (lines 1–85 imports, 460–488 executor branch, 872–910 gate-block, 901–909 refusal pipeline) | exact (in-place extension) |
| `runs/{id}/execution/journal.jsonl` schema (`task-journal-event.schema.json`) | schema | static | `packages/intent/schema/capability-admission-decision.schema.json` | exact |
| `runs/{id}/execution/task-{id}/evidence.json` schema | schema | static | same | exact |
| `runs/{id}/execution/task-{id}/transcript.json` schema | schema | static | same | exact |

## Pattern Assignments

### `packages/lmstudio-adapter/package.json` (manifest)

**Analog:** `packages/dogpile-adapter/package.json`

**Copy verbatim, change name + dependencies** (lines 1–25):
```json
{
  "name": "@protostar/dogpile-adapter",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "scripts": {
    "build": "tsc -b",
    "test": "pnpm run build && node --test dist/*.test.js",
    "typecheck": "tsc -b --pretty false"
  },
  "dependencies": {
    "@protostar/dogpile-types": "workspace:*",
    "@protostar/intent": "workspace:*",
    "@protostar/planning": "workspace:*"
  },
  "sideEffects": false
}
```
For LM Studio: `name: "@protostar/lmstudio-adapter"`; deps swap to `@protostar/execution`, `@protostar/intent`, `@protostar/authority`.
Add `packages/lmstudio-adapter` to `pnpm-workspace.yaml` (already lists `packages/*` glob — no change needed) and add `{ "path": "packages/lmstudio-adapter" }` to root `tsconfig.json` references list (between dogpile-adapter and factory-cli).

---

### `packages/lmstudio-adapter/src/index.ts` (brand-consumer + barrel)

**Analog:** `packages/dogpile-adapter/src/index.ts` (workspace structural shape) + `packages/authority/src/authorized-ops/network-op.ts` (consumed brand)

**Imports + brand-consume pattern** (network-op.ts lines 1–17 + invocation pattern):
```typescript
// In coder-adapter.ts — brand consumed at the I/O call site
import type { AuthorizedNetworkOp } from "@protostar/authority";
// Adapter receives an authorized op; never mints. Mint happens in the
// kernel call at the executor boundary (factory-cli or executor wiring).
```
**Barrel re-export pattern** (mirrors dogpile-adapter/index.ts lines 16–25):
```typescript
export {
  createLmstudioCoderAdapter,
  type LmstudioAdapterConfig
} from "./coder-adapter.js";
export { resolveFactoryConfig } from "./factory-config.js";
```

---

### `packages/lmstudio-adapter/src/factory-config.ts` (file+env loader)

**Analog:** `apps/factory-cli/src/load-repo-policy.ts`

**Loader pattern** (lines 1–29 — file-with-default + parser):
```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DENY_ALL_REPO_POLICY, parseRepoPolicy, type RepoPolicy } from "@protostar/authority";

export async function loadRepoPolicy(workspaceRoot: string): Promise<RepoPolicy> {
  const filePath = join(workspaceRoot, ".protostar", "repo-policy.json");
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isNodeErrno(error) && error.code === "ENOENT") return DENY_ALL_REPO_POLICY;
    throw error;
  }
  const parsed = parseRepoPolicy(JSON.parse(raw));
  if (!parsed.ok) {
    throw new Error(`invalid .protostar/repo-policy.json: ${parsed.errors.join("; ")}`);
  }
  return parsed.policy;
}
function isNodeErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
```
For factory-config: same skeleton but path `.protostar/factory-config.json`, defaults `{ baseUrl: 'http://localhost:1234/v1', model: 'qwen3-coder-next-mlx-4bit', apiKeyEnv: 'LMSTUDIO_API_KEY' }`, then env-override layer reading `LMSTUDIO_BASE_URL` / `LMSTUDIO_MODEL` / `LMSTUDIO_API_KEY`. Hash the resolved object via `@protostar/authority` `json-c14n@1.0` canonicalizer (already used for envelope hashing) and expose `{ config, configHash }`.

**Note for planner:** Authority lock — only `apps/factory-cli` and `packages/repo` may touch fs. Therefore `factory-config.ts` should expose a *pure* `resolveFactoryConfig({ fileBytes?: string, env: Record<string, string|undefined> })` and let `apps/factory-cli` read the file. Or place this loader inside factory-cli. The decision Q-09 leaves location to planner discretion.

---

### `packages/lmstudio-adapter/src/factory-config.schema.json` (and the three new run-bundle schemas)

**Analog:** `packages/intent/schema/capability-admission-decision.schema.json` (lines 1–34)

**Copy structure** verbatim:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://protostar.local/schema/capability-admission-decision.schema.json",
  "title": "CapabilityAdmissionDecision",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "runId", "gate", "outcome", "timestamp", "precedenceResolution", "evidence"],
  "properties": {
    "schemaVersion": { "const": "1.0.0" },
    "runId": { "type": "string", "pattern": "^run[-_][A-Za-z0-9_-]+$" },
    ...
  }
}
```
Apply to: `factory-config.schema.json`, `task-journal-event.schema.json`, `evidence.schema.json`, `transcript.schema.json`. Always pin `schemaVersion: { "const": "1.0.0" }`, `additionalProperties: false`, full `required[]` enumeration. Use `runId` regex pattern verbatim where applicable.

---

### `packages/lmstudio-adapter/src/diff-parser.ts` (strict-fence parser)

**Analog:** `packages/execution/src/index.ts` validator union shape (lines 83–94)

**Result-union pattern** (validateAdmittedPlanExecutionArtifact return type):
```typescript
export type ExecutionAdmittedPlanAdmissionValidation =
  | { readonly ok: true; readonly artifact: AdmittedPlanExecutionArtifact;
      readonly violations: readonly []; readonly errors: readonly []; }
  | { readonly ok: false; readonly violations: readonly ExecutionAdmittedPlanAdmissionViolation[];
      readonly errors: readonly string[]; };
```
For diff-parser: `{ ok: true; diff: string } | { ok: false; reason: 'parse-no-block' | 'parse-multiple-blocks' }` (verbatim from RESEARCH §"Strict diff-fence parser"). Same readonly+discriminated-union discipline.

---

### `packages/execution/src/index.ts` — state-machine vocab flip (modify)

**Analog:** self — lines 8, 25–29, 43–48, 601–705 (in-place rewrite)

**Lines to rewrite verbatim:**
- Line 8: `export type ExecutionTaskStatus = "pending" | "running" | "passed" | "failed" | "blocked";`
  → `export type ExecutionTaskStatus = "pending" | "running" | "succeeded" | "failed" | "timeout" | "cancelled";`
- Lines 25–30: `ExecutionLifecycleEventType` union — replace `"task-passed"` with `"task-succeeded"`; remove `"task-blocked"`; add `"task-timeout"`, `"task-cancelled"`.
- Lines 43–47: `ExecutionDryRunTaskResult.status` — same flip.
- Lines 601–705 (`runExecutionDryRun`): every `"passed"` → `"succeeded"`, drop the `"blocked"` branch (lines 617–638), and change `taskEvidenceRef` argument from `"passed" | "failed"` → `"succeeded" | "failed"` (line 707).

The "blocked" semantic (dependency unreachable) moves to a plan-graph concept; document inline that orphan/unreachable is no longer a *task* state.

---

### `packages/execution/src/journal.ts` (new — JSONL append+fsync)

**Analog:** `apps/factory-cli/src/admission-decisions-index.ts` (lines 1–29)

**Append-only JSONL pattern** (verbatim):
```typescript
import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

export const ADMISSION_DECISIONS_INDEX_FILE_NAME = "admission-decisions.jsonl" as const;
export const ADMISSION_DECISION_INDEX_SCHEMA_VERSION = "1.0.0" as const;

export interface AdmissionDecisionIndexEntry {
  readonly runId: string;
  readonly timestamp: string;
  readonly gate: GateName;
  readonly outcome: AdmissionDecisionOutcome;
  readonly artifactPath: string;
  readonly schemaVersion: "1.0.0";
  readonly precedenceStatus: PrecedenceDecision["status"];
}

export function formatAdmissionDecisionIndexLine(entry: AdmissionDecisionIndexEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

export async function appendAdmissionDecisionIndexEntry(
  jsonlPath: string,
  entry: AdmissionDecisionIndexEntry
): Promise<void> {
  await mkdir(dirname(jsonlPath), { recursive: true });
  await appendFile(jsonlPath, formatAdmissionDecisionIndexLine(entry), "utf8");
}
```
For Phase 4 journal: same skeleton, file name `journal.jsonl`, entry is `TaskJournalEvent` discriminated union (CONTEXT Q-02). **Add an explicit `fsync` after `appendFile`** — the analog doesn't fsync; Phase 4 must (CONTEXT Q-02 "append-and-fsync each event before emitting it"). Authority lock: this writer must live where fs is allowed — choose **`apps/factory-cli`** (preferred, matches `admission-decisions-index.ts` location) OR keep formatter pure in `packages/execution` and put the fs writer in factory-cli. RESEARCH "Architectural Responsibility Map" picks the latter.

**Refusal-pipeline pattern** for terminal blocks — analog `apps/factory-cli/src/refusals-index.ts` lines 28–73:
```typescript
export function formatRefusalIndexLine(entry: RefusalIndexEntry): string {
  return `${JSON.stringify(entry)}\n`;
}
export async function appendRefusalIndexEntry(filePath: string, entry: RefusalIndexEntry): Promise<void> {
  await appendFile(filePath, formatRefusalIndexLine(entry), "utf8");
}
export function buildTerminalStatusArtifact(input: { ... }): TerminalStatusArtifact {
  return { schemaVersion: REFUSAL_INDEX_SCHEMA_VERSION, artifact: TERMINAL_STATUS_ARTIFACT_NAME, ... };
}
```
Apply the **same pure-builder + thin-fs-writer split** to journal events: `formatTaskJournalLine` (pure, in `packages/execution`) + `appendTaskJournalEntry` (fs, in `apps/factory-cli`). Mirror this for the snapshot writer.

---

### `packages/execution/src/adapter-contract.ts` (new — type-only contract)

**Analog:** `packages/execution/src/admitted-plan-input.contract.ts`

**Pattern:** thin type-pin file alongside `index.ts`, exporting the contract types and any `assert*` validators. Mirrors the `*.contract.ts` naming already used in execution and planning packages (`candidate-admitted-plan-boundary.contract.ts`, etc.). Keep `AdapterEvent`, `AdapterResult`, `AdapterFailureReason`, `AdapterContext` here so consumers (lmstudio-adapter, factory-cli, future review subscribers) import from a stable surface.

---

### `packages/authority/src/authorized-ops/network-op.ts` — extend (modify)

**Analog:** self, lines 1–49 (in-place extension)

**Extension target — lines 27–45:**
```typescript
export function authorizeNetworkOp(input: AuthorizedNetworkOpData): AuthorizeNetworkOpResult {
  const errors: string[] = [];
  try {
    const url = new URL(input.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      errors.push(`network url "${input.url}" must use http or https`);
    }
  } catch {
    errors.push(`network url "${input.url}" must be parseable`);
  }
  if (!hasNetworkGrant(input.resolvedEnvelope)) {
    errors.push(`toolPermissions network grant required; check toolPermissions network in resolvedEnvelope`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, authorized: mintAuthorizedNetworkOp(input), errors: [] };
}
```
**Phase 4 additions** between the URL parse and the `hasNetworkGrant` check:
- Read `input.resolvedEnvelope.network.allow` (`'none' | 'loopback' | 'allowlist'`).
- `'none'` → push refusal.
- `'loopback'` → reject if `url.hostname` not in `{ 'localhost', '127.0.0.1', '::1' }`.
- `'allowlist'` → reject if `url.hostname` not in `resolvedEnvelope.network.allowedHosts ?? []`.
- Keep `hasNetworkGrant` check as a second layer (the existing toolPermissions grant must still be present). Result-union shape (`ok|errors`) is unchanged.

**Brand discipline:** `mintAuthorizedNetworkOp` (line 19) stays the only mint site. lmstudio-adapter imports `AuthorizedNetworkOp` as a type and consumes it.

---

### `packages/intent/schema/confirmed-intent.schema.json` — bump (modify)

**Analog:** self, lines 1–64

**Current** (line 21):
```json
"schemaVersion": { "const": "1.1.0" },
```
**Phase 4 changes:**
- Bump `"schemaVersion": { "const": "1.3.0" }` (1.1.0 → 1.3.0; Phase 3 already prepared 1.2.0 per RESEARCH note).
- Inside `capabilityEnvelope` (currently `{ "type": "object" }` on line 32 — opaque), tighten to require `budget.adapterRetriesPerTask` (number, default 4), `budget.taskWallClockMs` (number, default 180000), `network.allow` (`enum: ['none','loopback','allowlist']`), optional `network.allowedHosts: string[]` with `if/then` requiring non-empty array when `allow === 'allowlist'`.
- Re-canonicalize all signed-intent fixtures (RESEARCH Pitfall 7) — every test that signs an intent with envelope-hash assertion needs regeneration. Touched packages: `policy`, `planning`, `execution`, `review`, `intent`, `factory-cli`, `admission-e2e`.

---

### `apps/factory-cli/src/coder-adapter-admission.ts` (new gate)

**Analog:** `apps/factory-cli/src/main.ts` workspace-trust admission block (lines 872–910)

**Gate pattern** — verbatim shape of the workspace-trust gate, adapt for the new gate:
```typescript
const workspaceTrustOutcome = input.workspaceTrust === "trusted" ? "allow" : "escalate";
await writeAdmissionDecision({
  runDir: input.runDir,
  gate: "workspace-trust",
  decision: baseAdmissionDecision({
    runId: input.runId,
    gate: "workspace-trust",
    outcome: workspaceTrustOutcome,
    precedenceDecision: input.precedenceDecision,
    evidence: {
      workspacePath: input.workspacePath,
      declaredTrust: input.workspaceTrust,
      grantedAccess: input.workspaceTrust === "trusted" ? "write" : "none"
    }
  })
});
if (input.workspaceTrust !== "trusted") {
  const reason = "workspace-trust gate blocked: ...";
  await writeEscalationMarker({ ... });
  await writeRefusalArtifacts({
    runDir: input.runDir, outDir: input.outDir, runId: input.runId,
    stage: "workspace-trust", reason,
    refusalArtifact: "workspace-trust-admission-decision.json"
  });
  return { ok: false, error: new CliExitError(reason, 2) };
}
```
For coder-adapter-ready gate: `gate: "coder-adapter-ready"`, evidence carries `{ url, model, available?, errorClass? }`, outcome `'allow'` on preflight pass, `'block'` on unreachable / model-missing / empty-models. **Three classified failure reasons** (RESEARCH Preflight): `lmstudio-unreachable`, `lmstudio-model-not-loaded`, `lmstudio-empty-models` (collapse to `lmstudio-model-not-loaded` with `available: []`). Wire through the existing `writeAdmissionDecision` + `writeRefusalArtifacts` + `appendRefusalIndexEntry` + `buildTerminalStatusArtifact` pipeline (already imported in main.ts lines 70–84). Exit code 1 (not 2 — this is a hard fail, not an escalation).

---

### `apps/factory-cli/src/main.ts` — modify

**Analog:** self — lines 1–85 imports, 460–488 executor branch, 872–910 gate block

**Import-block extension** (after line 65 `from "@protostar/review"`):
```typescript
import { createLmstudioCoderAdapter, resolveFactoryConfig } from "@protostar/lmstudio-adapter";
import { coderAdapterReadyAdmission } from "./coder-adapter-admission.js";
```

**Executor-branch swap** (lines 476–488 currently):
```typescript
const execution = dependencies.prepareExecutionRun({
  runId: manifest.runId,
  admittedPlan: admittedPlanHandoff.executionArtifact,
  workspace
});
const loop = dependencies.runMechanicalReviewExecutionLoop({
  admittedPlan: admittedPlanHandoff.executionArtifact,
  execution,
  initialFailTaskIds: options.failTaskIds,
  maxRepairLoops: intent.capabilityEnvelope.budget.maxRepairLoops ?? 0
});
```
Becomes: branch on `options.executor === 'real' | 'dry-run'` (or admission allowedAdapters). Real branch builds the adapter via `createLmstudioCoderAdapter(factoryConfig)` and passes it into a new `runRealExecution(plan, ctx)` from `@protostar/execution`; dry-run branch keeps the current path. Preserve the `dependencies` injection seam — add `runRealExecution` to `FactoryCompositionDependencies` (lines 106–109, 143–146).

**SIGINT + sentinel wiring** — new in `runFactory` near top of body (after line 198):
```typescript
const rootAbort = new AbortController();
process.on('SIGINT', () => rootAbort.abort('sigint'));
// Per task: between iterations, fs.stat the sentinel; if present → rootAbort.abort('sentinel').
```

---

### `packages/planning` plan-schema additions (`task.adapterRef?`, `task.targetFiles[]`)

**Analog:** existing plan-task contract files (`packages/planning/src/task-required-capabilities.contract.ts`, `task-risk-declaration.contract.ts`)

**Pattern:** sibling `*.contract.ts` per plan-task field, plus an admission test under same package. Add:
- `task-adapter-ref.contract.ts` (typed pin + barrel re-export from `src/index.ts` and `src/schema/index.ts`)
- `task-target-files.contract.ts` (≥1 element required)
- `adapter-ref-admission.test.ts` in `packages/admission-e2e/src/` (RESEARCH Validation Architecture)

Run-level `allowedAdapters: string[]` lives on the run input (factory-cli option or capability-envelope); planner picks per CONTEXT Open Question 4 (recommendation: extend plan admission, default `['lmstudio-coder']`).

---

## Shared Patterns

### Brand-mint at kernel, brand-consume at I/O
**Source:** `packages/authority/src/authorized-ops/network-op.ts` lines 19–21
**Apply to:** `lmstudio-adapter` — never imports `mintAuthorizedNetworkOp`; only the type `AuthorizedNetworkOp`.
```typescript
function mintAuthorizedNetworkOp(data: AuthorizedNetworkOpData): AuthorizedNetworkOp {
  return Object.freeze({ ...data }) as AuthorizedNetworkOp;
}
```

### Result-union for parsers and validators
**Source:** `packages/execution/src/index.ts` lines 83–94 (`ExecutionAdmittedPlanAdmissionValidation`)
**Apply to:** `diff-parser.ts`, `factory-config.ts` parser, preflight classifier — all return `{ ok: true; ... } | { ok: false; reason/violations/errors }`.

### JSONL append + pure formatter / fs writer split
**Source:** `apps/factory-cli/src/admission-decisions-index.ts` lines 19–29 + `refusals-index.ts` lines 28–73
**Apply to:** journal writer, snapshot writer. Pure `format*` lives in `@protostar/execution`; fs `append*`/`write*` lives in `apps/factory-cli`.

### Authority-bounded fs
**Source:** PROJECT.md + `apps/factory-cli/src/load-repo-policy.ts` lines 1–29
**Apply to:** every new file-read or file-write site. `lmstudio-adapter` MUST NOT import `node:fs`. Reader is injected via `ctx.repoReader`.

### Schema-versioned JSON artifacts
**Source:** `packages/intent/schema/capability-admission-decision.schema.json` lines 7–13
**Apply to:** every new run-bundle artifact (`evidence.json`, `transcript.json`, `journal.jsonl` per-line, `factory-config.json`). Always: `additionalProperties: false`, full `required` array, pinned `schemaVersion` const.

### Refusal pipeline (admission block → terminal-status + refusal index)
**Source:** `apps/factory-cli/src/main.ts` lines 901–909 + `refusals-index.ts` lines 58–73
**Apply to:** `coderAdapterReadyAdmission` block branch. Use existing `writeAdmissionDecision`, `appendRefusalIndexEntry`, `buildTerminalStatusArtifact`.

### `node:test` against compiled `dist/*.test.js`
**Source:** `packages/dogpile-adapter/package.json` line 16 (`"test": "pnpm run build && node --test dist/*.test.js"`)
**Apply to:** every new package and test. No `tsx` shortcut. Tests colocated under `src/*.test.ts`.

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH §"Code Examples" instead):

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/lmstudio-adapter/src/sse-parser.ts` | pure logic | streaming | No SSE / `ReadableStream` consumer exists in repo. Use RESEARCH §"Reading SSE chunks from Node 22 fetch" verbatim. |
| `packages/execution/src/retry-classifier.ts` + `backoff.ts` | pure logic | transform | No retry helper exists. Use RESEARCH §"Backoff with deterministic jitter" verbatim; classifier is a small predicate. |
| `packages/execution/src/snapshot.ts` (tmp+rename) | I/O | file I/O | No tmp+rename pattern in repo. Use Node `fs/promises` `writeFile` + `rename` from RESEARCH §"Pattern 4". |
| Stub LM Studio server fixture | test fixture | — | No HTTP-stub fixture exists in repo. RESEARCH §"Stubbed LM Studio server for tests" gives full skeleton; place under `packages/lmstudio-adapter/internal/test-fixtures/` (mirrors Phase 3 Q-18 `internal/` carve-out). |

---

## Metadata

**Analog search scope:** `packages/{authority,execution,dogpile-adapter,intent,planning,policy,repo}`, `apps/factory-cli/src`
**Files scanned:** ~25 read in full or sampled
**Pattern extraction date:** 2026-04-27
**Project locks honored:** Authority boundary (only `apps/factory-cli` + `packages/repo` touch fs), domain-first packaging, Node 22 + node:test + zero-dep posture, schema-versioned artifacts, brand-mint/brand-consume split.
