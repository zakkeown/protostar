# Phase 11: Headless Mode + E2E Stress - Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 43 file entries / families
**Analogs found:** 40 strong / 43 classified, plus 3 partial matches

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.planning/REQUIREMENTS.md` | docs | batch | `.planning/REQUIREMENTS.md` existing phase sections | exact |
| `.planning/STATE.md` | docs | event-driven state log | `.planning/STATE.md` recent sessions + phase table | exact |
| `.planning/PROJECT.md` | docs | batch constraints | `.planning/PROJECT.md` lock revisions | role-match |
| `.planning/SECURITY-REVIEW.md`, `SECURITY.md` | docs/security | batch audit | `.planning/SECURITY-REVIEW.md` Phase 10 surface checklist | exact |
| `packages/intent/src/archetypes.ts` | model/config | request-response admission | `packages/intent/src/archetypes.ts` cosmetic wired + feature/refactor/bugfix stub rows | exact |
| `packages/intent/src/admission-paths.ts` | service/policy | request-response admission | `packages/intent/src/admission-paths.ts` unsupported-path functions | exact |
| `packages/intent/src/capability-admission.ts` | service/policy | request-response admission | `admitCosmeticTweakCapabilityEnvelope` in same file | exact |
| `packages/intent/src/capability-envelope.ts` | model/parser | transform | repair-loop budget parsing and cap validation | exact |
| `packages/policy/src/archetypes/index.ts`, `packages/policy/src/index.ts` | compatibility barrel | transform | existing policy re-export barrels from `@protostar/intent` | exact |
| `packages/intent/src/*.test.ts` archetype tests | test | request-response | `packages/fixtures/src/seeds/seed-library.test.ts`, `packages/intent/src/admission-control.test.ts` | role-match |
| `packages/fixtures/src/seeds/index.ts` | fixture registry | transform | existing cosmetic `seedLibrary` array + `getSeed` | exact |
| `packages/fixtures/src/seeds/feature-add/ttt-game.json` | fixture data | file-I/O static | `packages/fixtures/src/seeds/button-color-hover.ts` | role-match |
| `packages/fixtures/__fixtures__/feature-add/ttt-game/expectations.ts` | fixture expectation | transform | `packages/fixtures/src/seeds/seed-library.test.ts` | role-match |
| `packages/admission-e2e/src/seed-library-shape.contract.test.ts` | contract test | batch scan | `packages/admission-e2e/src/dogfood-report-byte-equality.contract.test.ts` | role-match |
| immutable toy verification guard files | admission/service/test | request-response | `packages/planning/src/admit-work-slicing.ts` targetFiles subset guard | partial |
| `packages/lmstudio-adapter/src/factory-config.ts` | config parser | transform | existing `resolveFactoryConfig` merge/validate/hash path | exact |
| `packages/lmstudio-adapter/src/factory-config.schema.json` | config schema | transform | existing strict JSON schema sections | exact |
| `apps/factory-cli/src/commands/run.ts` | controller/CLI | request-response | commander option parse and `RunCommandOptions` builder | exact |
| `apps/factory-cli/src/cli-args.ts` | utility/parser | transform | flag allowlist + parse helpers | exact |
| `apps/factory-cli/src/load-factory-config.ts` | config loader | file-I/O | existing `.protostar/factory-config.json` loader | exact |
| `apps/factory-cli/src/main.ts` backend selection | composition root | request-response | LM Studio direct adapter/provider creation in `main.ts` | role-match |
| `packages/execution/src/adapter-contract.ts` | interface/model | streaming | `ExecutionAdapter` async iterable contract | exact |
| `packages/hosted-llm-adapter/*` | network adapter | streaming/request-response | `packages/lmstudio-adapter/src/coder-adapter.ts`, `lmstudio-client.ts` | role-match |
| `packages/mock-llm-adapter/*` | pure adapter | request-response deterministic | `ExecutionAdapter` contract + lmstudio adapter final event shape | partial |
| `packages/*-llm-adapter/src/no-fs.contract.test.ts` | contract test | batch scan | `packages/lmstudio-adapter/src/no-fs.contract.test.ts` | exact |
| `packages/*/src/no-net.contract.test.ts` pure packages | contract test | batch scan | `packages/artifacts/src/no-net.contract.test.ts` | exact |
| `packages/repo/src/pnpm-add-allowlist.ts` | config/policy | transform | `packages/repo/src/subprocess-allowlist.ts` | role-match |
| `packages/repo/src/subprocess-schemas/pnpm.ts` | subprocess schema | request-response | current `PNPM_SCHEMA` | exact |
| `packages/repo/src/subprocess-schemas/schemas.test.ts` | unit test | request-response | existing schema membership tests | exact |
| `packages/repo/src/subprocess-runner.ts` | service | subprocess/file-I/O | `runCommand` allowlist + `shell:false` runner | exact |
| `packages/artifacts/src/stress-report.schema.ts` | schema/formatter | transform | `apps/factory-cli/src/dogfood/report-schema.ts` | role-match |
| `packages/artifacts/src/index.ts` | barrel/model | transform | existing artifact status/stage exports | exact |
| `apps/factory-cli/src/stress/stress-session.ts` | service | file-I/O/event-driven | `__dogfood-step.ts`, `snapshot-writer.ts`, `journal-writer.ts` | role-match |
| `apps/factory-cli/src/stress/*.test.ts` | unit test | file-I/O/event-driven | `__dogfood-step.test.ts`, `snapshot-writer.test.ts`, `prune.test.ts` | role-match |
| `scripts/stress.sh` | script/driver | batch | `scripts/dogfood.sh` | exact |
| `apps/factory-cli/src/scripts/stress.ts` | script/driver | event-driven/concurrency | `apps/factory-cli/src/commands/__dogfood-step.ts` + `run-liveness.ts` | partial |
| `apps/factory-cli/src/run-liveness.ts` integration | utility | event-driven status | existing liveness derived from manifest/journal/sentinel | exact |
| `apps/factory-cli/src/commands/status.ts` stress status read path | controller/CLI | request-response | existing status command JSON/table output | role-match |
| `apps/factory-cli/src/commands/prune.ts` stress prune scope | controller/CLI | file-I/O batch | dogfood prune extension | exact |
| `packages/admission-e2e/src/contracts/no-interactive-prompts.contract.test.ts` | contract test | batch scan | `delivery-no-merge-repo-wide.contract.test.ts`, `authority-no-fs.contract.test.ts` | role-match |
| `packages/admission-e2e/src/contracts/stress-report-snapshot.contract.test.ts` | contract test | transform | `dogfood-report-byte-equality.contract.test.ts` | exact |
| `.github/workflows/headless-stress.yml` or verify workflow edits | CI config | batch | `.github/workflows/verify.yml` | exact |
| new workspace package manifests/tsconfig refs | config | batch | `packages/lmstudio-adapter/package.json`, root `tsconfig.json` | role-match |

## Pattern Assignments

### Planning Docs (`.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/SECURITY-REVIEW.md`)

**Analogs:** `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/SECURITY-REVIEW.md`

**Requirements pattern** (`.planning/REQUIREMENTS.md` lines 120-142):
```markdown
### Phase 10 - V1 Hardening + Dogfood

- [ ] **DOG-01**: Sibling Tauri+React+TypeScript repo (...)
- [ ] **DOG-08**: Security review - capability envelope enforcement audited (...)

### Phase 10.1 - Boundary Hygiene Pass (inserted)

- [x] **BOUNDARY-01**: Add `protostar.tier: pure | fs | network | orchestration | test-only`
```

**Apply:** Add a Phase 11 section with `STRESS-01` through `STRESS-14`. Keep one requirement prefix, checkbox status, and phase-local grouping. Do not rewrite Phase 10 or Phase 10.1 rows.

**State log pattern** (`.planning/STATE.md` lines 35-50, 60-64):
```markdown
| # | Phase | Status |
|---|-------|--------|
| 10.1 | boundary hygiene pass | Complete (...) |
| 11 | Headless Mode + E2E Stress | Pending - discuss in progress |

- **2026-04-29:** Implemented Phase 10 Plan 08 (...)
```

**Security review pattern** (`.planning/SECURITY-REVIEW.md` lines 9-23, 33-46):
```markdown
## Per-surface checklist

| # | Surface | What was reviewed | Status | Notes |
|---|---------|------------------|--------|-------|
| 1 | Subprocess args | `packages/repo/src/subprocess-runner.ts` allowlist and array-form spawn (`shell: false`) | Pass | ... |

## Authority-exception ledger

| File | Reason | Approved by | Date |
|------|--------|-------------|------|
| (none yet) | | | |
```

**Apply:** Phase 11 security entry must add hosted secrets, self-hosted runner risk, no-prompt exceptions, `pnpm add` allowlist, stress events, and R2 "no dashboard server" decision.

---

### Archetype Lift (`packages/intent/src/archetypes.ts`, `admission-paths.ts`, `capability-admission.ts`)

**Analogs:** `packages/intent/src/archetypes.ts`, `packages/intent/src/admission-paths.ts`, `packages/intent/src/capability-admission.ts`

**Policy row shape** (`packages/intent/src/archetypes.ts` lines 186-241):
```typescript
export const GOAL_ARCHETYPE_POLICY_TABLE = {
  "cosmetic-tweak": {
    status: "wired",
    repo_scope: {
      required: true,
      allowedValues: ["read", "write"],
      maxAccess: "write",
      pathBoundary: "bounded"
    },
    budgets: {
      timeoutMs: 300_000,
      repair_loop_count: 1
    },
    repair_loop_count: 1,
    budgetCaps: {
      timeoutMs: 300_000,
      maxRepairLoops: 1
    },
    rationale: "Cosmetic tweaks may edit bounded repository paths with low-risk tools and one repair loop."
  },
```

**Stub rows to convert** (`packages/intent/src/archetypes.ts` lines 243-298 and 471-500):
```typescript
"feature-add": {
  status: "stub",
  ...
  budgets: {
    timeoutMs: 900_000,
    repair_loop_count: 2
  },
  repair_loop_count: 2,
  budgetCaps: {
    timeoutMs: 900_000,
    maxRepairLoops: 2
  },
  rationale: "Feature-add caps are unsupported v0.0.1 stub admission limits..."
}

export const INTENT_ARCHETYPE_REGISTRY = {
  "feature-add": {
    supportStatus: "unsupported",
    supported: false,
    capabilityCapStatus: "stub",
    policy: GOAL_ARCHETYPE_POLICY_TABLE["feature-add"]
  },
```

**Positive grant pattern to copy** (`packages/intent/src/capability-admission.ts` lines 56-100):
```typescript
export function admitCosmeticTweakCapabilityEnvelope(
  input: AdmitCosmeticTweakCapabilityEnvelopeInput
): AdmitCosmeticTweakCapabilityEnvelopeResult {
  const policyTable = input.policyTable ?? ARCHETYPE_POLICY_TABLE;
  const goalArchetype = normalizeText(input.draft.goalArchetype) ?? "";
  const admission = validateIntentDraftCapabilityEnvelopeAdmission({
    draft: input.draft,
    policyTable
  });
  const admissionPathFindings = cosmeticTweakAdmissionPathFindings(goalArchetype);
  const normalization = normalizeDraftCapabilityEnvelope(input.draft.capabilityEnvelope);
  const findings = [...admissionPathFindings, ...admission.findings];
  ...
  return {
    ok: true,
    goalArchetype: COSMETIC_TWEAK_GOAL_ARCHETYPE,
    grant: {
      source: "cosmetic-tweak-policy-admission",
      goalArchetype: COSMETIC_TWEAK_GOAL_ARCHETYPE,
      policy: policyTable[COSMETIC_TWEAK_GOAL_ARCHETYPE],
      capabilityEnvelope: normalization.envelope
    },
    admission,
    findings,
    errors: []
  };
}
```

**Unsupported path pattern to remove/replace for wired archetypes** (`packages/intent/src/admission-paths.ts` lines 65-85):
```typescript
export function featureAddAdmissionPathFindings(
  goalArchetype: string,
  policyTable: GoalArchetypePolicyTable = ARCHETYPE_POLICY_TABLE
): readonly IntentAdmissionPolicyFinding[] {
  if (goalArchetype !== FEATURE_ADD_GOAL_ARCHETYPE) {
    return [];
  }

  const decision = createFeatureAddUnsupportedDecision(goalArchetype, policyTable);

  return [
    {
      code: "unsupported-goal-archetype",
      fieldPath: "goalArchetype",
      severity: "block",
      message: decision.message,
      overridable: false,
      overridden: false
    }
  ];
}
```

**Apply:** Convert selected rows from `stub` to `wired`, registry from `unsupported` to `supported`, and admission functions from unconditional unsupported decisions to cosmetic-style grants. Preserve `factory-scaffold` as stub. If fallback is used, fully wire only `feature-add` and leave `bugfix`/`refactor` explicitly stubbed.

---

### Repair Loop Budget (`packages/intent/src/capability-envelope.ts`)

**Analog:** `packages/intent/src/capability-envelope.ts`

**Budget field and cap pattern** (lines 24-32, 128-180):
```typescript
export interface FactoryBudget {
  readonly maxUsd?: number;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly adapterRetriesPerTask?: number;
  readonly taskWallClockMs?: number;
  readonly deliveryWallClockMs?: number;
  readonly maxRepairLoops?: number;
}

const requestedRepairLoopCount = input.capabilityEnvelope?.budget?.maxRepairLoops;
if (
  typeof requestedRepairLoopCount !== "number" ||
  !Number.isFinite(requestedRepairLoopCount) ||
  requestedRepairLoopCount <= allowedRepairLoopCount
) {
  return { ok: true, goalArchetype, failures: [] };
}
```

**Apply:** Keep `maxRepairLoops` as the unit. Use archetype policy caps in `GOAL_ARCHETYPE_POLICY_TABLE`; avoid token budget changes. Watch the current cosmetic cap mismatch: context mentions default 3, code currently caps cosmetic at 1.

---

### Policy Backward-Compat Barrels (`packages/policy/src/*`)

**Analog:** `packages/policy/src/archetypes/index.ts`

**Re-export pattern** (lines 1-15):
```typescript
// Plan 06a: archetypes + archetype-autotag relocated to @protostar/intent. This subbarrel
// preserves the @protostar/policy/archetypes import surface byte-equivalent.
export {
  ARCHETYPE_POLICY_TABLE,
  BUGFIX_GOAL_ARCHETYPE,
  COSMETIC_TWEAK_GOAL_ARCHETYPE,
  FEATURE_ADD_GOAL_ARCHETYPE,
  GOAL_ARCHETYPE_POLICY_TABLE,
  INTENT_ARCHETYPE_REGISTRY,
  REFACTOR_GOAL_ARCHETYPE
} from "@protostar/intent";
```

**Apply:** Do not recreate source-of-truth policy logic in `packages/policy`. If Phase 11 changes archetype symbols or result types in `intent`, preserve policy package import compatibility through re-export updates.

---

### Seed Library + TTT Seed (`packages/fixtures/src/seeds/*`)

**Analogs:** `packages/fixtures/src/seeds/index.ts`, `button-color-hover.ts`, `seed-library.test.ts`

**Registry pattern** (`packages/fixtures/src/seeds/index.ts` lines 1-32):
```typescript
import { buttonColorHoverSeed } from "./button-color-hover.js";
import { cardShadowSeed } from "./card-shadow.js";
import { navbarAriaSeed } from "./navbar-aria.js";

export type SeedArchetype = "cosmetic-tweak";

export interface Seed {
  readonly id: string;
  readonly intent: string;
  readonly archetype: SeedArchetype;
  readonly notes: string;
}

export const seedLibrary = Object.freeze([
  buttonColorHoverSeed,
  cardShadowSeed,
  navbarAriaSeed
] as const);
```

**Seed object pattern** (`packages/fixtures/src/seeds/button-color-hover.ts` lines 1-8):
```typescript
import type { Seed } from "./index.js";

export const buttonColorHoverSeed: Seed = Object.freeze({
  id: "button-color-hover",
  intent: "Change the primary button color and add a hover state",
  archetype: "cosmetic-tweak",
  notes: "DOG-03 baseline seed with the verbatim 2026-04-24 cosmetic tweak wording."
});
```

**Test pattern** (`packages/fixtures/src/seeds/seed-library.test.ts` lines 7-35):
```typescript
it("exports exactly the three Phase 10 cosmetic tweak seeds", () => {
  assert.equal(seedLibrary.length, 3);
});

it("returns a frozen ordered seed id list", () => {
  const ids = listSeedIds();
  assert.deepEqual(ids, ["button-color-hover", "card-shadow", "navbar-aria"]);
  assert.equal(Object.isFrozen(ids), true);
});
```

**Apply:** Change `seedLibrary` to a frozen record keyed by archetype, while preserving the three existing cosmetic seeds and order. Add `feature-add/ttt-game.json` or typed fixture data with rich AC, `maxRepairLoops: 9`, and immutable verification assumptions. Tests should assert grouping shape, old cosmetic ids, TTT id, AC count, and frozen outputs.

---

### Immutable Toy Verification Guards

**Analogs:** `packages/planning/src/admit-work-slicing.ts`, `packages/planning/src/index.ts`, `apps/factory-cli/src/delivery-preflight-wiring.ts`

**Target-file subset guard** (`packages/planning/src/admit-work-slicing.ts` lines 168-188):
```typescript
function validateTargetFilesSubset(
  slice: TaskSlice,
  parent: PlanTask,
  index: number
): string | undefined {
  const parentTargetFiles = new Set(parent.targetFiles ?? []);
  if (parentTargetFiles.size === 0) {
    if (slice.targetFiles.length > 0) {
      return `admit-work-slicing: slices[${index}] targetFiles expansion - parent declared no targetFiles`;
    }
    return undefined;
  }
  for (const file of slice.targetFiles) {
    if (!parentTargetFiles.has(file)) {
      return `admit-work-slicing: slices[${index}] targetFiles expansion - ${JSON.stringify(file)} not in parent ${JSON.stringify(parent.id)} targetFiles`;
    }
  }
  return undefined;
}
```

**Task metadata guard** (`packages/planning/src/index.ts` lines 1827-1853):
```typescript
if (task.targetFiles === undefined) {
  violations.push({
    code: "target-files-missing",
    path: `tasks.${task.id}.targetFiles`,
    taskId: task.id,
    message: `Task ${task.id} targetFiles must be provided with at least one file.`
  });
} else if (!Array.isArray(task.targetFiles) || task.targetFiles.length === 0) {
  violations.push({
    code: "target-files-empty",
    path: `tasks.${task.id}.targetFiles`,
    taskId: task.id,
    message: `Task ${task.id} targetFiles must contain at least one file.`
  });
}
```

**Preflight refusal artifact pattern** (`apps/factory-cli/src/delivery-preflight-wiring.ts` lines 74-91):
```typescript
async function writePreflightRefusal(...): Promise<string> {
  const deliveryDir = resolve(input.runDir, "delivery");
  const refusalPath = resolve(deliveryDir, "preflight-refusal.json");
  await input.fs.mkdir(deliveryDir, { recursive: true });
  await writeJsonAtomic(input.fs, refusalPath, {
    phase,
    result,
    runId: basename(input.runDir),
    at: new Date().toISOString()
  });
  return refusalPath;
}
```

**Apply:** Immutable target repo test files (`e2e/**`, `tests/ttt-state.property.test.ts`) should be refused by admission/preflight before execution. Use structured violations/refusals, not string-only stderr. Preflight for existence of toy repo verification files belongs in `apps/factory-cli` because it reads the target repo / GitHub surface.

---

### Headless + Backend Config (`factory-config.ts`, schema, CLI)

**Analogs:** `packages/lmstudio-adapter/src/factory-config.ts`, `factory-config.schema.json`, `apps/factory-cli/src/commands/run.ts`, `apps/factory-cli/src/load-factory-config.ts`

**Config interface/default pattern** (`factory-config.ts` lines 5-20, 125-140):
```typescript
export interface FactoryConfig {
  readonly adapters: {
    readonly coder: LmstudioAdapterConfig;
    readonly judge?: LmstudioAdapterConfig;
  };
  readonly delivery?: DeliveryConfig;
  readonly evaluation?: EvaluationConfig;
  readonly evolution?: EvolutionConfig;
  readonly operator?: OperatorConfig;
  readonly mechanicalChecks?: MechanicalChecksConfig;
  readonly piles?: PilesConfig;
}

const DEFAULT_FACTORY_CONFIG: FactoryConfig = Object.freeze({
  adapters: Object.freeze({
    coder: Object.freeze({
      provider: "lmstudio",
      baseUrl: "http://localhost:1234/v1",
      model: "qwen3-coder-next-mlx-4bit",
      apiKeyEnv: "LMSTUDIO_API_KEY",
      temperature: 0.2,
      topP: 0.9
    }),
```

**Resolve/validate/hash pattern** (`factory-config.ts` lines 168-240):
```typescript
export function resolveFactoryConfig(input: {
  readonly fileBytes?: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}): ResolveFactoryConfigResult {
  const errors: string[] = [];
  let fileConfig: PartialFactoryConfig = {};
  ...
  const config: FactoryConfig = {
    adapters: {
      coder,
      judge
    },
    ...(fileConfig.delivery !== undefined ? { delivery: ... } : {}),
    ...(fileConfig.evaluation !== undefined ? { evaluation: fileConfig.evaluation } : {}),
    ...(fileConfig.piles !== undefined ? { piles: fileConfig.piles } : {})
  };

  return {
    ok: true,
    resolved: {
      config,
      configHash: sha256Hex(canonicalizeJsonC14nV1(config)),
      resolvedFromFile: input.fileBytes !== undefined,
      envOverridesApplied
    },
    errors: []
  };
}
```

**Strict schema pattern** (`factory-config.schema.json` lines 1-17, 100-171):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://protostar.local/schema/factory-config.schema.json",
  "title": "FactoryConfig",
  "type": "object",
  "additionalProperties": false,
  "required": ["adapters"],
  "properties": {
    "adapters": {
      "type": "object",
      "additionalProperties": false,
      "required": ["coder", "judge"]
    }
  }
}
```

**CLI option pattern** (`apps/factory-cli/src/commands/run.ts` lines 46-79, 147-188):
```typescript
return new Command("run")
  .description("Run the Protostar factory loop")
  .option("--delivery-mode <mode>", "auto | gated (Phase 9 Q-20)", parseDeliveryModeOption)
  .option("--executor <mode>", "executor mode: dry-run or real")
  .option("--planning-mode <mode>", "planning pile mode: fixture or live")
  .exitOverride()
  .configureOutput({
    writeOut: (str) => process.stderr.write(str),
    writeErr: (str) => process.stderr.write(str)
  })
  .action(async (opts) => {
    await executeRunCommand(opts);
  });

const executor = parseExecutor(opts.executor);
if (!executor.ok) return { ok: false, error: executor.error };
...
...(opts.deliveryMode !== undefined ? { deliveryMode: opts.deliveryMode } : {}),
```

**Apply:** Add `headlessMode` and `llmBackend` to config and `--headless-mode`/backend CLI override with CLI > config > default precedence. Keep schema/runtime tests in lockstep by copying `factory-config.test.ts` lines 333-355 schema shape assertions.

---

### LLM Adapters (`packages/hosted-llm-adapter`, `packages/mock-llm-adapter`)

**Analogs:** `packages/execution/src/adapter-contract.ts`, `packages/lmstudio-adapter/src/coder-adapter.ts`, `lmstudio-client.ts`

**Adapter interface** (`packages/execution/src/adapter-contract.ts` lines 5-31, 43-59):
```typescript
export interface ExecutionAdapter {
  readonly id: string;
  execute(task: ExecutionAdapterTaskInput, ctx: AdapterContext): AsyncIterable<AdapterEvent>;
}

export type AdapterEvent =
  | { readonly kind: "token"; readonly text: string }
  | { readonly kind: "tool-call"; readonly name: string; readonly args: unknown }
  | { readonly kind: "progress"; readonly message: string }
  | { readonly kind: "final"; readonly result: AdapterResult };

export type AdapterResult =
  | { readonly outcome: "change-set"; readonly changeSet: RepoChangeSet; readonly evidence: AdapterEvidence }
  | { readonly outcome: "adapter-failed"; readonly reason: AdapterFailureReason; readonly evidence: AdapterEvidence };
```

**Coder adapter streaming pattern** (`packages/lmstudio-adapter/src/coder-adapter.ts` lines 57-63, 103-153):
```typescript
export function createLmstudioCoderAdapter(config: LmstudioAdapterConfig): ExecutionAdapter {
  return {
    id: "lmstudio-coder",
    async *execute(task, ctx) {
      yield* executeCoderTask(task, ctx, config);
    }
  };
}

for await (const ev of callLmstudioChatStream({
  baseUrl: config.baseUrl,
  model: config.model,
  apiKey: config.apiKey,
  messages: messages.messages,
  stream: true,
  signal: abort.signal,
  timeoutMs: ctx.budget.taskWallClockMs
})) {
  ...
  yield { kind: "token", text: ev.text };
  await ctx.journal.appendToken(task.planTaskId, attempt, ev.text);
}
```

**OpenAI-compatible client pattern** (`packages/lmstudio-adapter/src/lmstudio-client.ts` lines 37-56, 152-170):
```typescript
response = await fetchImpl(chatCompletionsUrl(req.baseUrl), {
  method: "POST",
  headers: chatHeaders(req.apiKey),
  body: JSON.stringify(chatPayload(req, true)),
  signal: req.signal
});

function chatPayload(req: LmstudioChatRequest, stream: boolean): Record<string, unknown> {
  return {
    model: req.model,
    messages: req.messages,
    stream,
    temperature: req.temperature ?? 0.2,
    top_p: req.topP ?? 0.9,
    ...(req.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {})
  };
}
```

**Apply:** Hosted adapter should copy the OpenAI-compatible request/stream shape and stay network-tier with local `no-fs.contract.test.ts`. Mock adapter should implement the same `ExecutionAdapter` events but return deterministic canned `change-set` or `adapter-failed` results without network or filesystem authority. Prefer no new generic `llm-adapter` package unless it removes real duplication.

---

### Factory CLI Composition (`apps/factory-cli/src/main.ts`)

**Analog:** `apps/factory-cli/src/main.ts`

**Composition-root pattern** (lines 416-432, 563-570, 2933-2945):
```typescript
const factoryConfig = await loadFactoryConfig(workspaceRoot);
const pileModes: Readonly<Record<FactoryCliPileKind, PileMode>> = {
  planning: resolvePileMode("planning", pileModeCli, factoryConfig.config.piles),
  review: resolvePileMode("review", pileModeCli, factoryConfig.config.piles),
  executionCoordination: resolvePileMode("executionCoordination", pileModeCli, factoryConfig.config.piles)
};
const deliveryMode = resolveDeliveryMode(factoryConfig.config, options.deliveryMode);

const livePlanningOutcome = await dependencies.runFactoryPile(planningMission, {
  provider: createCoderPileProvider(factoryConfig, {
    responseFormat: planningPileResultResponseFormat()
  }),
  signal: runAbortController.signal,
  budget: resolvePileBudget(planningMission.preset.budget, intent.capabilityEnvelope.budget)
});

function createCoderPileProvider(factoryConfig, options = {}) {
  return createOpenAICompatibleProvider({
    baseURL: factoryConfig.config.adapters.coder.baseUrl,
    apiKey: process.env[factoryConfig.config.adapters.coder.apiKeyEnv] ?? "lm-studio",
    model: factoryConfig.config.adapters.coder.model,
```

**Apply:** Backend selection should be centralized here or in a small factory module imported by `main.ts`. Do not move authority into Dogpile or pure packages. Avoid a package rename unless every import/export/back-edge update is part of the same plan.

---

### Bounded `pnpm add` (`packages/repo/src/*`)

**Analogs:** `packages/repo/src/subprocess-schemas/pnpm.ts`, `subprocess-runner.ts`, `subprocess-allowlist.ts`

**Current pnpm schema** (`packages/repo/src/subprocess-schemas/pnpm.ts` lines 3-22):
```typescript
export const PNPM_SCHEMA: CommandSchema = Object.freeze({
  command: "pnpm",
  allowedSubcommands: Object.freeze([
    "install",
    "run",
    "build",
    "test",
    "--filter",
    "exec"
  ]),
  allowedFlags: Object.freeze({
    install: Object.freeze(["--frozen-lockfile", "--no-frozen-lockfile", "--force"]),
    run: Object.freeze([]),
    build: Object.freeze([]),
    test: Object.freeze([]),
    "--filter": Object.freeze([]),
    exec: Object.freeze(["--"])
  }),
  refValuePattern: /^[a-zA-Z0-9._/-@]+$/
});
```

**Runner enforcement pattern** (`packages/repo/src/subprocess-runner.ts` lines 66-90, 143-181):
```typescript
export async function runCommand(op: AuthorizedSubprocessOp, options: RunCommandOptions): Promise<SubprocessResult> {
  validateBeforeSpawn(op, options);
  ...
  const child = spawn(op.command, [...op.args], {
    shell: false,
    cwd: op.cwd,
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function validateBeforeSpawn(op: AuthorizedSubprocessOp, options: RunCommandOptions): void {
  if (!options.effectiveAllowlist.includes(op.command)) {
    throw new SubprocessRefusedError("command-not-allowlisted", ...);
  }
  const schema = options.schemas[op.command];
  if (schema === undefined) {
    throw new SubprocessRefusedError("no-schema", ...);
  }
  applyOuterPatternGuard(op.args, {
    allowedFlagPrefixes: flattenAllowedFlags(schema),
    refValuePattern: schema.refValuePattern
  });
}
```

**Apply:** Add `pnpm add` in `packages/repo` only. Introduce `pnpm-add-allowlist.ts` as a frozen exact-name/spec list. Tests must accept allowlisted packages (`fast-check`, `@playwright/test`, etc. if still chosen) and reject arbitrary names, shell metacharacters, global flags, scripts, and unapproved specs.

---

### Stress Report Schema + Events

**Analogs:** `apps/factory-cli/src/dogfood/report-schema.ts`, `cursor-schema.ts`, `packages/artifacts/src/canonical-json.ts`, `apps/factory-cli/src/snapshot-writer.ts`, `journal-writer.ts`

**Zod schema + formatter pattern** (`apps/factory-cli/src/dogfood/report-schema.ts` lines 17-68):
```typescript
export const ReportSchema = z.object({
  sessionId: z.string().min(1),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  totalRuns: z.number().int().nonnegative(),
  passCount: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1),
  rows: z.array(ReportRowSchema)
}).strict().superRefine((report, ctx) => {
  if (report.passCount > report.totalRuns) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["passCount"], message: "passCount must be less than or equal to totalRuns" });
  }
  ...
});

export function formatReport(report: Report): string {
  return `${JSON.stringify(sortJsonValue(ReportSchema.parse(report)))}\n`;
}
```

**Canonical JSON helper** (`packages/artifacts/src/canonical-json.ts` lines 1-14):
```typescript
export function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJsonValue(item)])
    );
  }
  return value;
}
```

**Durable atomic writer pattern** (`apps/factory-cli/src/snapshot-writer.ts` lines 12-59):
```typescript
const writeChains = new Map<string, Promise<void>>();

export async function writeSnapshotAtomic(opts: { readonly runDir: string; readonly snapshot: ExecutionSnapshot }): Promise<void> {
  const dir = join(opts.runDir, "execution");
  const finalPath = join(dir, SNAPSHOT_FILE_NAME);
  const previous = writeChains.get(finalPath) ?? Promise.resolve();
  const next = previous.then(() => writeSnapshotAtomicUnchained(dir, finalPath, opts.snapshot));
  writeChains.set(finalPath, next.finally(() => { ... }));
  return next;
}

await writeFile(tmpPath, serializeSnapshot(snapshot), "utf8");
const fileHandle = await open(tmpPath, "r");
await fileHandle.datasync();
await rename(tmpPath, finalPath);
const dirHandle = await open(dir, "r");
await dirHandle.datasync();
```

**Append-only writer pattern** (`apps/factory-cli/src/journal-writer.ts` lines 15-32):
```typescript
const handle: FileHandle = await open(journalPath, "a");
let chain: Promise<void> = Promise.resolve();

appendEvent(event: TaskJournalEvent): Promise<void> {
  chain = chain.then(async () => {
    await handle.appendFile(formatTaskJournalLine(event), "utf8");
    await handle.datasync();
  });
  return chain;
}
```

**Apply:** `packages/artifacts/src/stress-report.schema.ts` should define pure Zod schemas/types/formatters for `stress-report.json`; `apps/factory-cli/src/stress/stress-session.ts` should own writing `.protostar/stress/<sessionId>/events.jsonl` and `stress-report.json`. Use dogfood's Zod invariant style, but use snapshot-writer's stronger durability for final report writes. If runtime Zod schemas are exported from `@protostar/artifacts`, move `zod` from devDependencies to dependencies or keep schema parsing in factory-cli.

---

### Stress Session Core + Drivers

**Analogs:** `apps/factory-cli/src/commands/__dogfood-step.ts`, `scripts/dogfood.sh`, `run-liveness.ts`

**Hidden step command pattern** (`__dogfood-step.ts` lines 46-70, 73-108):
```typescript
export function buildDogfoodStepCommand(): Command {
  const command = new Command("__dogfood-step")
    .description("Internal dogfood session stepper")
    .requiredOption("--session <sessionId>", "dogfood session id")
    .requiredOption("--action <action>", "action to execute")
    .option("--json", "emit JSON for actions with structured output")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),
      writeErr: (str) => process.stderr.write(str)
    })
    .action(async (opts) => {
      process.exitCode = await executeDogfoodStep(opts);
    });
  return command as unknown as Command;
}
```

**Session path confinement + cursor pattern** (`__dogfood-step.ts` lines 110-130, 133-149):
```typescript
const dogfoodRoot = join(workspaceRoot, ".protostar", "dogfood");
const sessionDir = resolve(dogfoodRoot, sessionId);
if (!sessionDir.startsWith(`${resolve(dogfoodRoot)}/`)) {
  throw new Error("session resolves outside dogfood root");
}

const cursor: Cursor = {
  sessionId: basename(paths.sessionDir),
  totalRuns: total,
  completed: 0,
  runs: []
};
await writeTextAtomic(paths.cursorPath, formatCursor(parseCursor(cursor)));
```

**Record/finalize pattern** (`__dogfood-step.ts` lines 176-227, 331-354):
```typescript
const run: CursorRun = {
  runId: parsed.data.runId,
  seedId: seed.id,
  outcome: parsed.data.outcome,
  startedAt: parsed.data.startedAt,
  finishedAt: parsed.data.finishedAt
};
const nextCursor = parseCursor({
  ...cursor,
  completed: cursor.completed + 1,
  runs: [...cursor.runs, run]
});
await writeTextAtomic(paths.cursorPath, formatCursor(nextCursor));
await appendJsonLine(paths.logPath, logRow);

const report: Report = parseReport({
  sessionId: cursor.sessionId,
  totalRuns: cursor.totalRuns,
  passCount,
  passRate: cursor.totalRuns === 0 ? 0 : passCount / cursor.totalRuns,
  rows
});
await writeTextAtomic(paths.reportPath, formatReport(report));
```

**Bash orchestration-only pattern** (`scripts/dogfood.sh` lines 1-3, 22-54, 86-97):
```bash
#!/usr/bin/env bash
# Dark dogfood driver. No .protostar/dogfood writes; no business logic. Just orchestrates subcommand calls.
set -euo pipefail

$CLI __dogfood-step --session "$SESSION_ID" --action begin --total "$RUNS"
...
node apps/factory-cli/dist/main.js run \
  --draft "$SEED_DRAFT" \
  --out .protostar/runs \
  --executor real \
  --planning-mode live \
  --delivery-mode auto \
  --trust trusted \
  --confirmed-intent "$CONFIRMED_INTENT" \
  >/dev/null 2>/dev/null
...
$CLI __dogfood-step --session "$SESSION_ID" --action finalize
```

**Liveness/wedge input pattern** (`apps/factory-cli/src/run-liveness.ts` lines 29-79):
```typescript
const hasSentinel = await fileExists(join(opts.runDir, "CANCEL"));
const raw = await readFile(join(opts.runDir, "manifest.json"), "utf8");
manifest = JSON.parse(raw) as FactoryRunManifest;
const lastJournalAt = await journalMtimeMs(join(opts.runDir, "execution", "journal.jsonl"));

if (manifest.status === "running" && nowMs - lastActivityAt > opts.thresholdMs && !hasSentinel) {
  return {
    state: "orphaned",
    lastJournalAt,
    hasSentinel,
    manifestStatus: manifest.status
  };
}
```

**Apply:** `scripts/stress.sh` should only handle sustained sequential load and delegate all writes/business rules to factory-cli. `apps/factory-cli/src/scripts/stress.ts` should handle concurrency/fault injection, but share `stress-session.ts` for session paths, events, report updates, cap breaches, and wedge evidence. Use `RUN_ID_REGEX` path safety for session IDs.

---

### Status and Prune Extensions

**Analogs:** `apps/factory-cli/src/commands/status.ts`, `apps/factory-cli/src/commands/prune.ts`, `prune.test.ts`

**Status JSON/table pattern** (`status.ts` lines 48-64, 125-132):
```typescript
return new Command("status")
  .description("Show recent factory runs or a single run")
  .option("--run <runId>", "show a single run")
  .option("--json", "emit JSON instead of a human table")
  .option("--full", "include lineage, status, evaluation, and delivery fields")
  .exitOverride()
  .configureOutput({
    writeOut: (str) => process.stderr.write(str),
    writeErr: (str) => process.stderr.write(str)
  });

if (opts.json) {
  writeStdoutJson(rows);
  return;
}
process.stdout.write(`${renderTable(list, opts.full)}\n`);
```

**Prune scope pattern** (`prune.ts` lines 91-108, 146-190):
```typescript
const runsRoot = join(workspaceRoot, ".protostar", "runs");
const dogfoodRoot = join(workspaceRoot, ".protostar", "dogfood");
...
const dogfoodEntries = (await listRuns({ runsRoot: dogfoodRoot, runIdRegex: RUN_ID_REGEX, all: true }))
  .filter((entry) => entry.mtimeMs <= thresholdMs);

if (cursor.value.completed < cursor.value.totalRuns) {
  protectedRuns.push({ runId: entry.runId, reason: "active-dogfood-session" });
  continue;
}

await fs.rm(candidate.path, { recursive: true, force: true });
```

**Prune tests to copy** (`prune.test.ts` lines 188-235):
```typescript
it("preserves append-only refusal and lineage files while pruning dogfood sessions", async () => {
  ...
  assert.deepEqual(
    {
      refusals: await sha256(refusalsPath),
      lineage: await sha256(lineagePath)
    },
    before
  );
});

it("protects active dogfood sessions whose cursor has incomplete runs", async () => {
  ...
  assert.deepEqual(output.protected, [{ reason: "active-dogfood-session", runId: "dogfood_active" }]);
});
```

**Apply:** Extend prune to `.protostar/stress/<sessionId>` with active-session protection and append-only events preservation. Stress status can be a support command or fold into `status --full`, but must keep canonical JSON on `--json`.

---

### Contract Tests, No Prompts, No Dashboard, CI

**Analogs:** `authority-no-fs.contract.test.ts`, `delivery-no-merge-repo-wide.contract.test.ts`, `dogfood-report-byte-equality.contract.test.ts`, `.github/workflows/verify.yml`

**Static scan contract pattern** (`packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts` lines 16-25, 71-89):
```typescript
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /pulls\.merge\b/,
  /pullRequests\.merge\b/,
  /enableAutoMerge\b/,
  /merge_method\b/
];

async function findMergeSurfaceOffenders(repoRoot: string): Promise<readonly MergeSurfaceOffender[]> {
  const offenders: MergeSurfaceOffender[] = [];
  for (const root of SCAN_ROOTS) {
    for await (const file of walkTs(resolve(repoRoot, root))) {
      const rel = relative(repoRoot, file).replace(/\\/g, "/");
      if (isExcluded(rel)) continue;
      const raw = await readFile(file, "utf8");
      const stripped = stripComments(raw);
      const lines = stripped.split("\n");
      for (const pattern of FORBIDDEN_PATTERNS) {
        const lineIndex = lines.findIndex((line) => pattern.test(line));
        if (lineIndex >= 0) offenders.push({ file: rel, line: lineIndex + 1, pattern: pattern.source });
      }
    }
  }
  return offenders;
}
```

**Package-local no-fs pattern** (`packages/lmstudio-adapter/src/no-fs.contract.test.ts` lines 13-19, 37-56):
```typescript
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /from\s+["']node:fs["']/,
  /from\s+["']node:fs\/promises["']/,
  /from\s+["']fs["']/,
  /from\s+["']node:path["']/,
  /from\s+["']path["']/
];

describe("@protostar/lmstudio-adapter - fs authority boundary", () => {
  it("no node:fs/node:path imports anywhere in src/ (excluding contract tests)", async () => {
    ...
    assert.deepEqual(offenders, [], `node:fs / node:path imports forbidden ...`);
  });
});
```

**Report byte-equality contract** (`packages/admission-e2e/src/dogfood-report-byte-equality.contract.test.ts` lines 35-70):
```typescript
it("formatReport(parseReport(report)) is byte-stable", async () => {
  const schema = await loadReportSchema();
  const first = schema.formatReport(schema.parseReport(validReport) as never);
  const second = schema.formatReport(schema.parseReport(JSON.parse(first)) as never);
  assert.equal(second, first);
});

it("rejects malformed reports", async () => {
  const schema = await loadReportSchema();
  assert.throws(() => schema.parseReport({ ...validReport, passCount: 3 }));
});
```

**Workflow pattern** (`.github/workflows/verify.yml` lines 1-32):
```yaml
name: verify

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  verify:
    name: pnpm run verify:full
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run verify:full
```

**Apply:** No-prompt contract should scan production `apps/*/src/**/*.ts` and `packages/*/src/**/*.ts` for `node:readline`, `prompts`, `inquirer`, `enquirer`, `@inquirer/*`, `process.stdin.on`, and `.question(` unless a top-of-file `// no-prompt-exception: <reason>` exists and is listed in `.planning/SECURITY-REVIEW.md`. Also add plan-checker/no-dashboard coverage by scanning for `node:http`, `node:https`, websocket imports, and `apps/factory-cli/src/dashboard` unless R1 is explicitly locked later.

---

### New Workspace Packages

**Analogs:** `packages/lmstudio-adapter/package.json`, `packages/artifacts/package.json`, package tsconfigs, root `tsconfig.json`

**Network package manifest pattern** (`packages/lmstudio-adapter/package.json` lines 1-41):
```json
{
  "name": "@protostar/lmstudio-adapter",
  "type": "module",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "pnpm run build && node --test dist/**/*.test.js",
    "typecheck": "tsc -p tsconfig.json --pretty false"
  },
  "protostar": {
    "tier": "network"
  },
  "engines": {
    "node": ">=22"
  }
}
```

**Pure package manifest pattern** (`packages/artifacts/package.json` lines 24-41):
```json
{
  "dependencies": {
    "@protostar/intent": "workspace:*"
  },
  "devDependencies": {
    "zod": "^3.25.76",
    "zod-to-json-schema": "^3.24.6"
  },
  "sideEffects": false,
  "protostar": {
    "tier": "pure"
  }
}
```

**Tier conformance contract** (`packages/admission-e2e/src/tier-conformance.contract.test.ts` lines 31-47, 117-140):
```typescript
it("every workspace package declares a known protostar.tier", async () => {
  const packages = await loadPackages();
  const offenders = packages
    .filter((pkg) => typeof pkg.tier !== "string" || !TIERS.has(pkg.tier))
    .map((pkg) => `${pkg.name}: ${String(pkg.tier)}`);
  assert.deepEqual(offenders, []);
});

it("network-tier packages ship local no-fs contracts", async () => {
  ...
  if (!await exists(contract)) offenders.push(`${pkg.name}: missing src/no-fs.contract.test.ts`);
});

it("pure-tier packages ship local no-net contracts", async () => {
  ...
  if (!await exists(contract)) offenders.push(`${pkg.name}: missing src/no-net.contract.test.ts`);
});
```

**Apply:** Every new package needs `protostar.tier`, `engines.node`, package scripts, root `tsconfig.json` reference, package `tsconfig.json` references aligned to manifest deps, and a local no-fs/no-net contract as required by tier. Network packages must not depend on fs packages unless an AGENTS.md accepted edge is deliberately updated.

## Shared Patterns

### Authority Boundary

**Source:** `AGENTS.md`, `packages/admission-e2e/src/tier-conformance.contract.test.ts`, package-local `no-fs`/`no-net` tests.

**Apply to:** All Phase 11 plans.

- `apps/factory-cli` owns orchestration, config composition, `.protostar/stress` writes, GitHub checks, and stress drivers.
- `packages/repo` owns subprocess execution and `pnpm add` validation.
- Network adapters may call hosted APIs but must not import fs/path and must ship no-fs tests.
- Pure packages (`artifacts`, `fixtures`, `intent`, `planning`, etc.) must stay no-network/no-filesystem.
- Dogpile remains bounded coordination; do not move factory authority into it.

### Canonical + Durable Artifacts

**Source:** `packages/artifacts/src/canonical-json.ts`, `apps/factory-cli/src/snapshot-writer.ts`, `apps/factory-cli/src/journal-writer.ts`

**Apply to:** `stress-report.json`, `events.jsonl`, cap breach and wedge evidence.

- Canonical one-line JSON with sorted keys for final reports.
- Append-only JSONL for event streams.
- Use temp file + `datasync` + `rename` + best-effort directory `datasync` for evidence snapshots that gate phase closure.
- Chain writes per final path during concurrent stress to avoid partial/cross-run corruption.

### CLI Output Discipline

**Source:** `apps/factory-cli/src/commands/run.ts`, `status.ts`, `__dogfood-step.ts`, help snapshot contracts.

**Apply to:** Headless mode, status/stress support commands, TS stress runner.

- Commander output goes to stderr for help/errors.
- `--json` uses `writeStdoutJson`.
- Hidden internal commands should not appear in root help unless intentionally public.
- No top-level stress subcommand unless Phase 9 lock is revised; prefer script plus hidden/support commands.

### Report Contract Tests

**Source:** `dogfood-report-byte-equality.contract.test.ts`

**Apply to:** Stress report and seed-library shape contracts.

- Load compiled schema/formatter from `dist`.
- Assert `format(parse(x))` byte-stability.
- Assert malformed semantic invariants reject.
- Keep fixture data small and deterministic.

### Security Review Updates

**Source:** `.planning/SECURITY-REVIEW.md`

**Apply to:** No prompts, hosted LLM secrets, `pnpm add`, self-hosted runner, no dashboard server.

- Add one row per new authority/secret surface.
- Any source exception comment needs a matching ledger row.
- Explicitly state R2 observability: append-only `events.jsonl`; no HTTP/dashboard server in Phase 11.

## No Analog Found

This section records classified partial matches and planner guidance entries where no direct codebase analog should be copied as-is.

| File | Role | Data Flow | Reason / Planner Guidance |
|---|---|---|---|
| `packages/stress-harness/` | package/service | fault-injection | No existing chaos/fault package. Use package skeleton + tier contracts; keep scenario definitions pure and side effects injected from factory-cli/repo adapters. |
| `apps/factory-cli/src/scripts/stress.ts` | TS driver | concurrency/event-driven | No existing TS script runner with worker pool. Combine dogfood session patterns, `run-liveness.ts`, and `subprocess-runner` timeout/cancellation patterns. |
| `packages/mock-llm-adapter/` | adapter package | deterministic request-response | No existing mock adapter package. Implement `ExecutionAdapter` directly and keep pure/no-net if canned responses are static imports. |
| `packages/policy/src/admission-paths.ts` | policy source | admission | Mentioned in context, but current codebase source of truth is `packages/intent/src/admission-paths.ts`; `packages/policy` is a compatibility re-export surface. |
| `apps/factory-cli/src/dashboard/` | dashboard/server | HTTP/event-driven | R2 research resolution removes dashboard/server for Phase 11. Do not create this directory unless operator revises Q-17 to R1. |

## Metadata

**Analog search scope:** `packages/intent`, `packages/policy`, `packages/fixtures`, `packages/repo`, `packages/execution`, `packages/lmstudio-adapter`, `packages/artifacts`, `packages/admission-e2e`, `apps/factory-cli`, `scripts`, `.github/workflows`, `.planning`.

**Files scanned:** `rg --files` over primary source/test/workflow trees; targeted reads from 50+ analog files/sections.

**Project-local skills:** No `.codex/skills/` or `.agents/skills/` directories exist in this repo.

**Codebase-memory MCP:** Not available in this session; used `rg` and direct reads per phase note.

**Pattern extraction date:** 2026-04-29
