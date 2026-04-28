---
phase: 08-evaluation-evolution
plan: 07
type: execute
wave: 5
depends_on: ["08-02", "08-04", "08-06"]
files_modified:
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/cli-args.ts
  - apps/factory-cli/src/cli-args.test.ts
  - apps/factory-cli/src/load-factory-config.ts
  - apps/factory-cli/src/load-factory-config.test.ts
  - apps/factory-cli/src/evolution-snapshot-writer.ts
  - apps/factory-cli/src/evolution-snapshot-writer.test.ts
  - apps/factory-cli/src/evolution-chain-index.ts
  - apps/factory-cli/src/evolution-chain-index.test.ts
  - apps/factory-cli/src/calibration-log.ts
  - apps/factory-cli/src/calibration-log.test.ts
  - packages/dogpile-adapter/src/index.ts
  - packages/dogpile-adapter/src/planning-mission.test.ts
autonomous: true
requirements: [EVAL-04, EVOL-01, EVOL-02, EVOL-03]
must_haves:
  truths:
    - "All five CLI flags --lineage <id>, --evolve-code, --generation <N>, --semantic-judge-model <model>, --consensus-judge-model <model> parse correctly with Phase 6 Q-04 mode-resolution precedence (CLI > config > built-in)"
    - "--generation N validates: must be integer, >= 0, <= MAX_EVOLUTION_GENERATIONS (Q-19)"
    - "factory-cli reads factory-config.json evaluation.{semanticJudge,consensusJudge} and evolution.{lineage,codeEvolution,convergenceThreshold} fields and threads them into runEvaluationStages providers + budget + lineageId resolution"
    - "When --lineage absent + factory-config.evolution.lineage absent: factory-cli computes lineage via computeLineageId(intent) (Q-15 default)"
    - "factory-cli replaces the createEvaluationReport({ runId, reviewGate }) call site at main.ts:889 with runEvaluationStages(input)"
    - "factory-cli replaces createIntentOntologySnapshot/createPlanOntologySnapshot at main.ts:1102-1124 with runner-produced snapshot (createSpecOntologySnapshot is in @protostar/evaluation, called by the runner)"
    - "Snapshot is atomically persisted to runs/{id}/evolution/snapshot.json via tmp+rename (Phase 6 Q-07 pattern)"
    - "After successful snapshot write, factory-cli appends one JSONL line to .protostar/evolution/{lineageId}.jsonl with { generation, runId, snapshotPath, timestamp } (Q-14)"
    - "Generation is auto-detected from chain index (last line's generation + 1) by default; --generation N overrides (Q-19)"
    - "When evolution.codeEvolution === 'disabled' (default), buildPlanningMission gets a PriorGenerationSummary block that lists prior AC fields + prior reasons + prior verdicts BUT excludes prior code-state hints; when 'opt-in' (--evolve-code), additionally threads prior diff summary (Q-16, Q-17)"
    - "buildPlanningMission accepts optional second arg PriorGenerationSummary; mission text includes the prior summary block when supplied"
    - "factory-cli appends one line per run to .protostar/calibration/ontology-similarity.jsonl with { runId, lineageId, generation, similarity } (Q-18 stub; consumer is Phase 10)"
    - "Eval-stage refusals appear in .protostar/refusals.jsonl with stage='pile-evaluation' and the appropriate sourceOfTruth"
  artifacts:
    - path: apps/factory-cli/src/main.ts
      provides: "Replaces stub eval call site with runEvaluationStages; adds 5 CLI flags + persistence"
    - path: apps/factory-cli/src/evolution-snapshot-writer.ts
      provides: "Atomic snapshot.json writer (Q-14)"
      exports: ["writeEvolutionSnapshot"]
    - path: apps/factory-cli/src/evolution-chain-index.ts
      provides: "JSONL chain reader/writer (Q-14, Q-19)"
      exports: ["appendChainLine", "readLatestChainLine", "readChainLines"]
    - path: apps/factory-cli/src/calibration-log.ts
      provides: "Append-only calibration data log (Q-18 stub)"
      exports: ["appendCalibrationEntry"]
  key_links:
    - from: apps/factory-cli/src/main.ts
      to: packages/evaluation-runner
      via: "runEvaluationStages call replaces stub createEvaluationReport call site"
      pattern: "runEvaluationStages"
    - from: apps/factory-cli/src/main.ts
      to: packages/dogpile-adapter
      via: "buildPlanningMission(intent, prior?) threading"
      pattern: "buildPlanningMission"
    - from: apps/factory-cli/src/evolution-chain-index.ts
      to: ".protostar/evolution"
      via: "Atomic JSONL append"
      pattern: ".protostar/evolution"
---

<objective>
Replace the entire stubbed evaluation/evolution surface in factory-cli with the real wiring. This plan owns the fs side of Phase 8: atomic snapshot writes, JSONL chain index reads/writes, calibration log appends, CLI flag parsing, factory-config plumbing, and the call-site replacement at `main.ts:889`.

Three task split:
- **Task 1**: CLI flags + factory-config plumbing (the easy half — touches `cli-args.ts`, `load-factory-config.ts`, plus a 5-flag block in `main.ts`).
- **Task 2**: Evolution persistence helpers (`evolution-snapshot-writer.ts`, `evolution-chain-index.ts`, `calibration-log.ts`) — atomic-write + JSONL-append patterns from Phase 6.
- **Task 3**: Replace the eval/evolution call site at `main.ts:889`/`:1102-1124` with `runEvaluationStages(...)` + persistence + planning-mission threading. Also extends `buildPlanningMission(intent, prior?)` in `dogpile-adapter` for Q-16.

This is the heaviest plan in Phase 8 — three distinct concerns. Justified by the precedent of Phase 6 Plan 06-07 (factory-cli pile wiring) which landed three seams in one plan; same pattern.

Purpose: Last code-touching plan before contracts. After this, only `admission-e2e` contracts (Plan 08-08) remain.
Output: Real evaluation/evolution end-to-end; CLI smoke shows snapshots persisted + JSONL chain growing across consecutive runs.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-evaluation-evolution/08-CONTEXT.md
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/cli-args.ts
@apps/factory-cli/src/load-factory-config.ts
@apps/factory-cli/src/pile-persistence.ts
@apps/factory-cli/src/refusals-index.ts
@apps/factory-cli/src/snapshot-writer.ts
@apps/factory-cli/src/pile-mode-resolver.ts
@packages/evaluation-runner/src/run-evaluation-stages.ts
@packages/evaluation/src/lineage-hash.ts
@packages/evaluation/src/index.ts
@packages/dogpile-adapter/src/index.ts
@packages/lmstudio-adapter/src/factory-config.ts

<interfaces>
<!-- Persistence helper signatures. -->

```typescript
// apps/factory-cli/src/evolution-snapshot-writer.ts
import type { OntologySnapshot } from "@protostar/evaluation";

export interface WriteEvolutionSnapshotInput {
  readonly runDir: string;                          // runs/{id}
  readonly snapshot: OntologySnapshot;
  readonly lineageId: string;                       // included as metadata in JSON
}
export interface WriteEvolutionSnapshotResult {
  readonly snapshotPath: string;                    // runs/{id}/evolution/snapshot.json
}
export async function writeEvolutionSnapshot(input: WriteEvolutionSnapshotInput): Promise<WriteEvolutionSnapshotResult>;
// Atomic write: tmp file + rename (mirror snapshot-writer.ts / pile-persistence.ts pattern).
```

```typescript
// apps/factory-cli/src/evolution-chain-index.ts
export interface ChainIndexLine {
  readonly generation: number;
  readonly runId: string;
  readonly lineageId: string;
  readonly snapshotPath: string;
  readonly timestamp: string;
  readonly priorVerdict?: "pass" | "fail";          // Q-16: drives planning summary
  readonly priorEvolutionAction?: "continue" | "converged" | "exhausted";
  readonly evolutionReason?: string;
}

export const CHAIN_INDEX_DIR = ".protostar/evolution" as const;

export function chainIndexPath(lineageId: string, root: string = process.cwd()): string;
// Returns join(root, CHAIN_INDEX_DIR, `${lineageId}.jsonl`).

export async function appendChainLine(filePath: string, line: ChainIndexLine): Promise<void>;
// fs append in factory-cli (authority boundary).

export async function readLatestChainLine(filePath: string): Promise<ChainIndexLine | undefined>;
// Returns last JSONL line parsed; undefined if file missing or empty.

export async function readChainLines(filePath: string): Promise<readonly ChainIndexLine[]>;
// Returns all lines; undefined entries (parse fail) are skipped with a stderr-noted warning.
```

```typescript
// apps/factory-cli/src/calibration-log.ts
export interface CalibrationEntry {
  readonly runId: string;
  readonly lineageId: string;
  readonly generation: number;
  readonly similarity?: number;             // undefined when no prior snapshot
  readonly threshold: number;
  readonly evolutionAction: "continue" | "converged" | "exhausted";
  readonly timestamp: string;
}

export const CALIBRATION_LOG_PATH = ".protostar/calibration/ontology-similarity.jsonl" as const;

export async function appendCalibrationEntry(filePath: string, entry: CalibrationEntry): Promise<void>;
// Append-only; creates parent dir if absent.
```

```typescript
// packages/dogpile-adapter/src/index.ts (extension to existing buildPlanningMission)

export interface PriorGenerationSummary {
  readonly generation: number;
  readonly snapshotFields: readonly { name: string; type: string; description?: string }[];
  readonly evolutionReason: string;
  readonly priorVerdict: "pass" | "fail";              // ReviewVerdict's pass|repair|block collapsed to pass|fail for evolution display
  readonly priorEvaluationVerdict: "pass" | "fail";
  readonly includePriorCodeHints: boolean;             // Q-17: false when codeEvolution === 'disabled'
  readonly priorDiffNameOnly?: readonly string[];       // only included when includePriorCodeHints
}

// Updated signature (BREAKING — second arg added; default keeps backward compat).
export function buildPlanningMission(
  intent: ConfirmedIntent,
  prior?: PriorGenerationSummary
): FactoryPileMission;
// When prior is provided, mission text includes a "## Previous Generation Summary" block
// with: generation N, prior verdicts, evolution reason, snapshot field names + types,
// and (if includePriorCodeHints) the prior diffNameOnly list. When undefined, mission text is
// byte-identical to current behavior.
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: CLI flags + factory-config plumbing for evaluation + evolution</name>
  <read_first>
    - apps/factory-cli/src/cli-args.ts (full file — current flag-parsing pattern, including pile-mode flags from Phase 6 Plan 06-07)
    - apps/factory-cli/src/cli-args.test.ts (existing test pattern)
    - apps/factory-cli/src/load-factory-config.ts (current factory-config loader — confirms how `piles` block was threaded; mirror for evaluation + evolution)
    - apps/factory-cli/src/load-factory-config.test.ts (round-trip test pattern)
    - apps/factory-cli/src/pile-mode-resolver.ts (Phase 6 Q-04 mode-resolution precedence pattern: CLI > config > built-in default)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-07/Q-08 (judge model flags), Q-15 (lineage), Q-17 (evolve-code), Q-19 (generation override + validation)
    - packages/evaluation/src/index.ts (`MAX_EVOLUTION_GENERATIONS` constant — used to bound --generation)
  </read_first>
  <behavior>
    - `cli-args.ts` adds 5 new flags:
      - `--lineage <id>`: optional string, no default. Empty string rejected.
      - `--evolve-code`: boolean flag (no value). Implies `evolution.codeEvolution = "opt-in"` for this invocation.
      - `--generation <N>`: optional integer. Validation: parsed as `Number(arg)`, must be integer, `>= 0`, `<= MAX_EVOLUTION_GENERATIONS`. Reject with descriptive error otherwise (Q-19).
      - `--semantic-judge-model <model>`: optional string.
      - `--consensus-judge-model <model>`: optional string.
    - `load-factory-config.ts` reads `evaluation.semanticJudge.{model,baseUrl}`, `evaluation.consensusJudge.{model,baseUrl}`, `evolution.{lineage,codeEvolution,convergenceThreshold}` from the validated config (already typed by Plan 08-02).
    - Mode-resolution helpers (mirror `resolvePileMode` from Phase 6):
      - `resolveSemanticJudgeModel(cli, config, default = "Qwen3-Next-80B-A3B-MLX-4bit")` (Q-07).
      - `resolveConsensusJudgeModel(cli, config, default = "DeepSeek-Coder-V2-Lite-Instruct")` (Q-08).
      - `resolveCodeEvolutionMode(cliFlag, config, default = "disabled")` (Q-17).
      - `resolveLineageId(cli, config, intent)` — if cli set, return cli; else if config.evolution.lineage set, return that; else return `computeLineageId(intent)` (Q-15).
      - `resolveGeneration(cli, chainLatest)` — if cli set, return cli (already validated); else if chainLatest exists, return chainLatest.generation + 1; else return 0 (Q-19).
      - `resolveConvergenceThreshold(config, default = ONTOLOGY_CONVERGENCE_THRESHOLD)` (Q-18).
    - Tests (per resolver: cli-set / config-set / default; per --generation: in-bounds / negative / over-cap / non-integer):
      - 5 flag-parsing tests (one per flag).
      - --generation validation: 4 cases (-1, 0, 30, 31, "abc").
      - 5 resolver tests (one per resolve helper).
      - 3 factory-config round-trip tests (config has all eval+evolution fields → preserved).
      - Total ~17 cases.
  </behavior>
  <files>apps/factory-cli/src/cli-args.ts, apps/factory-cli/src/cli-args.test.ts, apps/factory-cli/src/load-factory-config.ts, apps/factory-cli/src/load-factory-config.test.ts</files>
  <action>
    1. **RED:** Add the ~17 test cases. Run; tests fail.
    2. **GREEN:** Edit `cli-args.ts`:
       - Add the 5 flag entries with `commander`-style or whatever the existing parser uses (mirror `--planning-mode` shape).
       - For `--generation`: add a `parseGenerationArg(s)` helper that throws `CliExitError` (or repo-equivalent) for invalid values; validate against `MAX_EVOLUTION_GENERATIONS` from `@protostar/evaluation`.
    3. Edit `load-factory-config.ts` (or a sibling helper) to add the resolver helpers per `<behavior>`. Use the Phase 6 `resolvePileMode` precedent — pure functions taking `(cliValue, configValue, builtInDefault)`.
    4. Run tests — green. `pnpm --filter @protostar/factory-cli build` green.
    5. **REFACTOR:** Confirm new code goes through the existing `CliExitError` (or equivalent) refusal path; do not invent new error types.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test --run cli-args --run load-factory-config</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"--lineage"\|--lineage' apps/factory-cli/src/cli-args.ts` is at least 1
    - `grep -c '"--evolve-code"\|--evolve-code' apps/factory-cli/src/cli-args.ts` is at least 1
    - `grep -c '"--generation"\|--generation' apps/factory-cli/src/cli-args.ts` is at least 1
    - `grep -c '"--semantic-judge-model"\|--semantic-judge-model' apps/factory-cli/src/cli-args.ts` is at least 1
    - `grep -c '"--consensus-judge-model"\|--consensus-judge-model' apps/factory-cli/src/cli-args.ts` is at least 1
    - `grep -c 'MAX_EVOLUTION_GENERATIONS' apps/factory-cli/src/cli-args.ts` is at least 1 (validation reference)
    - `grep -c 'resolveSemanticJudgeModel\|resolveConsensusJudgeModel\|resolveCodeEvolutionMode\|resolveLineageId\|resolveGeneration\|resolveConvergenceThreshold' apps/factory-cli/src/load-factory-config.ts` is at least 6
    - 17 test cases green (counted by `pnpm test --run cli-args --run load-factory-config`)
    - --generation validation rejects -1, "abc", and 31 with descriptive errors
  </acceptance_criteria>
  <done>5 CLI flags + 6 resolvers + factory-config round-trip green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Evolution snapshot writer + chain index reader/writer + calibration log</name>
  <read_first>
    - apps/factory-cli/src/snapshot-writer.ts (atomic tmp+rename pattern — copy verbatim)
    - apps/factory-cli/src/pile-persistence.ts (Phase 6 Plan 06-07 atomic-write template + path-traversal mitigation)
    - apps/factory-cli/src/refusals-index.ts (JSONL append pattern with `appendFile`)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-14 (per-run + chain index layout) + Q-18 (calibration log path)
    - packages/evaluation/src/index.ts (`OntologySnapshot` shape)
  </read_first>
  <behavior>
    - `writeEvolutionSnapshot({ runDir, snapshot, lineageId })`:
      - Path = `<runDir>/evolution/snapshot.json`.
      - Body is `JSON.stringify({ ...snapshot, lineageId }, null, 2)` (lineageId added as a top-level metadata field).
      - Atomic write: write to `<path>.tmp`, fsync (or flush), rename. Mirror `snapshot-writer.ts` exactly.
      - mkdir -p the `evolution/` parent.
      - Returns `{ snapshotPath: <absolute path> }`.
    - `appendChainLine(filePath, line)`:
      - mkdir -p `.protostar/evolution/`.
      - JSONL: append `${JSON.stringify(line)}\n` via `appendFile(filePath, ..., "utf8")`.
    - `readLatestChainLine(filePath)`:
      - readFile (utf8); split by `\n`; trim trailing empties; if no lines → undefined.
      - Parse last line via JSON.parse; on parse failure → undefined (with stderr warning).
    - `readChainLines(filePath)`: returns all parsed lines; skips parse-failures with a warning.
    - `chainIndexPath(lineageId)`:
      - Validates `lineageId` matches `/^[a-zA-Z0-9._-]+$/` (path-traversal mitigation; same posture as Phase 6 Plan 06-07 T-6-23).
      - Returns `path.join(root, ".protostar/evolution", `${lineageId}.jsonl`)`.
    - `appendCalibrationEntry(filePath, entry)`:
      - mkdir -p `.protostar/calibration/`; appendFile JSONL.
    - Tests (using `mkdtemp`):
      - writeEvolutionSnapshot: writes file, content matches expected JSON, parent dir created, atomic (tmp file does not remain).
      - readLatestChainLine: missing file → undefined; empty file → undefined; one line → that line; three lines → the third.
      - appendChainLine: appending three times produces three JSONL lines in order.
      - chainIndexPath: rejects `..`, rejects path-separator chars, accepts valid id.
      - appendCalibrationEntry: writes one line, parent dir created.
      - readChainLines: handles malformed line (skips with warning).
      - Total ~10-12 cases.
  </behavior>
  <files>apps/factory-cli/src/evolution-snapshot-writer.ts, apps/factory-cli/src/evolution-snapshot-writer.test.ts, apps/factory-cli/src/evolution-chain-index.ts, apps/factory-cli/src/evolution-chain-index.test.ts, apps/factory-cli/src/calibration-log.ts, apps/factory-cli/src/calibration-log.test.ts</files>
  <action>
    1. **RED:** Create the three sibling test files with the cases. Run; tests fail.
    2. **GREEN:** Implement the three modules per `<interfaces>`. Use `node:fs/promises` (factory-cli is the authority for fs). Mirror exact tmp+rename + fsync from `snapshot-writer.ts`.
    3. Add `chainIndexPath` validation against the regex `/^[a-zA-Z0-9._-]+$/`.
    4. Run tests — all green.
    5. **REFACTOR:** Verify the path-traversal regex catches `../escape` and `/etc/passwd` lineageIds.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test --run evolution-snapshot-writer --run evolution-chain-index --run calibration-log</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export async function writeEvolutionSnapshot' apps/factory-cli/src/evolution-snapshot-writer.ts` is 1
    - `grep -c 'export async function appendChainLine' apps/factory-cli/src/evolution-chain-index.ts` is 1
    - `grep -c 'export async function readLatestChainLine' apps/factory-cli/src/evolution-chain-index.ts` is 1
    - `grep -c 'export async function appendCalibrationEntry' apps/factory-cli/src/calibration-log.ts` is 1
    - `grep -c 'rename\|tmp' apps/factory-cli/src/evolution-snapshot-writer.ts` is at least 2 (atomic-write pattern)
    - `grep -c 'a-zA-Z0-9._-' apps/factory-cli/src/evolution-chain-index.ts` is at least 1 (path-traversal regex)
    - All 10-12 test cases green
    - Path traversal test cases verify rejection of `..` and absolute paths
  </acceptance_criteria>
  <done>Three persistence helpers with atomic writes + path-traversal mitigation + JSONL append; tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Replace eval/evolution call sites in main.ts + extend buildPlanningMission with PriorGenerationSummary</name>
  <read_first>
    - apps/factory-cli/src/main.ts (focus: lines 880-1124 — the eval call site at 889, snapshot helpers at 1102-1124, manifest entries at 993-997)
    - apps/factory-cli/src/main.ts (CLI options assembly — locate where `RunCommandOptions` or equivalent is built; thread the 5 new flags + resolved values through it)
    - packages/evaluation-runner/src/run-evaluation-stages.ts (after Plan 08-06 — `RunEvaluationStagesInput` shape)
    - packages/dogpile-adapter/src/index.ts (current `buildPlanningMission` at line 134; existing test of mission text — this task extends with optional second arg)
    - packages/evaluation/src/index.ts (`createSpecOntologySnapshot`, `computeLineageId`, `decideEvolution`)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-13 (replace intent/plan snapshots), Q-14 (write snapshot + chain), Q-15 (lineage default), Q-16 (PriorGenerationSummary in planning mission), Q-17 (codeEvolution gating), Q-18 (calibration jsonl), Q-19 (generation auto-detect)
  </read_first>
  <behavior>
    - **Sub-step A (planning-mission extension)**: Edit `packages/dogpile-adapter/src/index.ts`:
      - Add `PriorGenerationSummary` interface per `<interfaces>` block.
      - Update `buildPlanningMission(intent, prior?)` signature. When `prior !== undefined`, append a "## Previous Generation Summary" block to the mission text including: `Generation: ${prior.generation}`, `Prior verdict: ${prior.priorVerdict}`, `Prior evaluation verdict: ${prior.priorEvaluationVerdict}`, `Reason: ${prior.evolutionReason}`, then snapshot field names+types, then if `includePriorCodeHints` AND `priorDiffNameOnly` is present, include `Prior diff: ${list.join(", ")}`.
      - When `prior === undefined`, mission text is byte-identical to existing behavior.
      - Test (added to existing planning-mission test): passing prior with `includePriorCodeHints: false` — mission contains AC field names but NOT the `Prior diff:` line; passing prior with `includePriorCodeHints: true` — both present.
    - **Sub-step B (factory-cli main.ts replacement)**: At `main.ts:889`, replace the existing block with:
      1. Resolve `lineageId = resolveLineageId(cli, config, intent)`.
      2. Compute `chainPath = chainIndexPath(lineageId)`.
      3. Read `chainLatest = await readLatestChainLine(chainPath)`.
      4. Resolve `generation = resolveGeneration(cli.generation, chainLatest)`.
      5. Resolve `convergenceThreshold = resolveConvergenceThreshold(config, ONTOLOGY_CONVERGENCE_THRESHOLD)`.
      6. Build providers: `{ semantic: createOpenAICompatibleProvider({ model: resolveSemanticJudgeModel(...), baseUrl: ... }), consensus: createOpenAICompatibleProvider(...) }`.
      7. Define `snapshotReader: SnapshotReader = async (lid) => { const path = chainIndexPath(lid); const latest = await readLatestChainLine(path); if (latest === undefined) return undefined; const json = JSON.parse(await readFile(latest.snapshotPath, "utf8")); return { generation: json.generation, fields: json.fields }; }`.
      8. Call `const result = await runEvaluationStages({ runId, intent, plan: admittedPlanHandoff.plan, reviewGate: review, diffNameOnly, executionEvidence, archetype, providers, signal: <run signal>, budget: <pile budget>, snapshotReader, lineageId, generation })`.
      9. If `result.refusal !== undefined`: append refusal to `.protostar/refusals.jsonl` with `stage: "pile-evaluation"` (Plan 08-02 added the literal); write per-stage refusal artifact; throw `CliExitError` (Q-06 no-fallback).
      10. If `result.refusal === undefined`: write `evaluation-report.json` from `result.report`; write `evolution-decision.json` from `result.evolutionDecision`; call `writeEvolutionSnapshot({ runDir, snapshot: result.snapshot, lineageId })`; call `appendChainLine(chainPath, { generation, runId, lineageId, snapshotPath, timestamp, priorVerdict: review.verdict === "pass" ? "pass" : "fail", priorEvaluationVerdict: result.report.verdict, priorEvolutionAction: result.evolutionDecision.action, evolutionReason: result.evolutionDecision.reason })`.
      11. Append calibration entry: `appendCalibrationEntry(CALIBRATION_LOG_PATH, { runId, lineageId, generation, similarity: result.evolutionDecision.similarity?.score, threshold: convergenceThreshold, evolutionAction: result.evolutionDecision.action, timestamp })`.
      12. Update manifest entries (lines ~993-997): drop the "stub" descriptions; add new entries for `evolution/snapshot.json` artifact.
    - **Sub-step C (PriorGenerationSummary in planning mission)**: At the planning-mission build site in main.ts (locate via `buildPlanningMission(intent` grep), if `chainLatest !== undefined`, build a `PriorGenerationSummary` from `chainLatest` (read prior snapshot via `readFile(chainLatest.snapshotPath)`), set `includePriorCodeHints = (resolveCodeEvolutionMode(cliEvolveCode, config) === "opt-in")`. Pass as second arg to `buildPlanningMission`.
    - **Sub-step D (remove old snapshot helpers)**: Delete `createIntentOntologySnapshot` (lines 1102-1110) and `createPlanOntologySnapshot` (lines 1113-1124). Their work is now done by `createSpecOntologySnapshot` (called inside `runEvaluationStages`).
    - Tests (in `apps/factory-cli/src/main.test.ts` — match Phase 6 Plan 06-07 integration test pattern):
      - 1 happy-path integration: full run, snapshot written, chain JSONL appended, calibration log appended, no refusal.
      - 1 refusal path: fake `runFactoryPile` returns `eval-consensus-block`; refusal artifact written under `pile-evaluation` stage; CLI exits non-zero.
      - 1 second-run path: prior chain entry exists; `buildPlanningMission` is called with non-undefined prior; mission text contains the prior summary block.
      - 1 codeEvolution=opt-in test: `--evolve-code` flag → mission contains prior diff line.
      - 1 generation override test: `--generation 5` → snapshot.generation === 5.
      - 1 lineage default test: no `--lineage` flag → lineageId === computeLineageId(intent).
      - Total ~6 integration cases.
  </behavior>
  <files>apps/factory-cli/src/main.ts, apps/factory-cli/src/main.test.ts (extend), packages/dogpile-adapter/src/index.ts, packages/dogpile-adapter/src/planning-mission.test.ts (or wherever planning mission tests live)</files>
  <action>
    1. **RED:** Write the planning-mission extension test cases first (single-package scope). Then write the 6 main.ts integration tests as outlined. Run; all fail.
    2. **GREEN sub-step A:** Edit `packages/dogpile-adapter/src/index.ts` — add `PriorGenerationSummary` interface; update `buildPlanningMission` signature + body. Verify existing planning-mission tests still pass (mission byte-identical when `prior === undefined`).
    3. **GREEN sub-step B:** Edit `apps/factory-cli/src/main.ts` per `<behavior>` steps 1-12. Use the verbatim helper imports introduced by Tasks 1+2 of this plan + Plan 08-06 + Plan 08-02. Drop the dead `createEvaluationReport({...})` call.
    4. **GREEN sub-step C:** Wire the planning-mission with prior summary at the appropriate site (before the planning pile invocation).
    5. **GREEN sub-step D:** Delete the dead intent/plan snapshot helpers at main.ts:1102-1124. Confirm no other call sites reference them: `grep -rn 'createIntentOntologySnapshot\|createPlanOntologySnapshot' apps/ packages/` → zero matches after deletion.
    6. Update manifest stage entries at lines ~993-997: drop "stub" wording; add evolution snapshot artifact entry.
    7. Run `pnpm --filter @protostar/factory-cli test`. All 6 + existing green.
    8. Run `pnpm --filter @protostar/dogpile-adapter test`. All planning-mission tests green.
    9. Run `pnpm run verify`. Confirm only the existing flake clusters surface (no new failures from this plan).
    10. **REFACTOR:** Confirm refusal artifact for eval failures uses `stage: "pile-evaluation"` (literal added in Plan 08-02).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli test && pnpm --filter @protostar/dogpile-adapter test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'runEvaluationStages' apps/factory-cli/src/main.ts` is at least 1
    - `grep -c 'createIntentOntologySnapshot\|createPlanOntologySnapshot' apps/factory-cli/src/main.ts` returns 0 (helpers deleted)
    - `grep -c 'createIntentOntologySnapshot\|createPlanOntologySnapshot' apps/ packages/ -r 2>/dev/null | wc -l` is 0 (no orphaned consumers)
    - `grep -c 'writeEvolutionSnapshot\|appendChainLine\|appendCalibrationEntry' apps/factory-cli/src/main.ts` is at least 3
    - `grep -c '"pile-evaluation"' apps/factory-cli/src/main.ts` is at least 1
    - `grep -c 'PriorGenerationSummary' packages/dogpile-adapter/src/index.ts` is at least 1
    - `grep -c '"## Previous Generation Summary"' packages/dogpile-adapter/src/index.ts` is at least 1
    - `grep -c '"stub"' apps/factory-cli/src/main.ts` (in stage manifest) returns 0 for evaluation-report / evolution-decision artifacts
    - 6 integration tests + planning-mission extension tests green
    - `pnpm run verify` does not regress
  </acceptance_criteria>
  <done>factory-cli wires runEvaluationStages end-to-end; old helpers deleted; planning mission threads prior summary; manifest entries no longer say "stub".</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator CLI flag → factory-cli | `--generation` validated [0, MAX]; `--lineage` regex'd in chainIndexPath |
| factory-cli → fs | `evolution/snapshot.json` atomic write; chain JSONL append-only; calibration JSONL append-only |
| chain index → planning mission | prior snapshot read shapes next mission; bounded by snapshot field schema |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-07-01 | Tampering | evolution-chain-index.ts chainIndexPath | mitigate | LineageId regex `[a-zA-Z0-9._-]+` blocks `..`, slashes, null bytes. |
| T-08-07-02 | Tampering | evolution-snapshot-writer.ts | mitigate | Atomic tmp+rename means partial writes never observed; mirrors snapshot-writer.ts. |
| T-08-07-03 | Information Disclosure | planning-mission prior summary | mitigate | When codeEvolution=disabled (default), prior diffNameOnly is excluded — minimizes accidental code-state leakage to operator-supplied future runs. |
| T-08-07-04 | Repudiation | factory-cli refusal index | mitigate | Eval refusals append to refusals.jsonl with stage="pile-evaluation"; full evidence breadcrumb. |
| T-08-07-05 | Denial of Service | --generation cap | mitigate | Validation rejects N > MAX_EVOLUTION_GENERATIONS; combined with chain-index auto-detect this prevents runaway generations. |
</threat_model>

<verification>
- `pnpm --filter @protostar/factory-cli test` green (6 new integration cases + 17 unit cases + existing)
- `pnpm --filter @protostar/dogpile-adapter test` green (planning-mission extension tests)
- `pnpm run verify` does not regress
- Smoke check: `pnpm run factory` builds; existing workspace-trust gate behavior unchanged
- Manifest no longer says "stub" for evaluation-report.json / evolution-decision.json
</verification>

<success_criteria>
- All 5 CLI flags + 6 resolvers + 3 persistence helpers landed
- runEvaluationStages call replaces stubbed createEvaluationReport call site at main.ts:889
- Old createIntentOntologySnapshot / createPlanOntologySnapshot deleted
- buildPlanningMission accepts optional PriorGenerationSummary; prior summary threaded
- Snapshot artifact written; JSONL chain index grows across consecutive runs
- Calibration log stub appends per run (Phase 10 will consume)
- Refusals route through "pile-evaluation" RefusalStage
</success_criteria>

<output>
Create `.planning/phases/08-evaluation-evolution/08-07-SUMMARY.md` documenting all 5 flags, the 6 resolvers, persistence layout, mission-summary threading, and the call-site replacement at main.ts:889.
</output>
